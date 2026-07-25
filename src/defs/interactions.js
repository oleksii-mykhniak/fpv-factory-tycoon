// What each kind of trigger zone does.
//
// This is the table the plan calls "one implementation, two sources of intent":
// a hired worker standing in a zone (C5) runs exactly the same `run` as the
// player's character does. Nothing here knows which one it is.
//
// Each entry:
//   dwellMs   — time inside before it fires (0 = instant)
//   repeatMs  — >0 keeps firing while occupied (item streams); 0 = once per entry
//   accepts   — 'player' | 'worker' | 'any'
//   enabled   — is there anything to do right now? A disabled zone shows no
//               progress ring and never fires, so the player is never asked to
//               stand and wait for nothing
//   run       — apply the effect; may mutate world.game and push events

import {
  Phase, DeliveryStatus, KIT_TYPES,
  pickupDelivery, startAssembly, startScrapAssembly, getStation,
  sell as sellStation, calcPrice,
} from '../state/gameState.js'
import {
  ZONE_DWELL_INSTANT_MS, ZONE_DWELL_BENCH_MS,
  ZONE_DWELL_MAILBOX_MS, ZONE_DWELL_TRASH_MS,
  CARRY_CAPACITY,
} from '../state/config.js'
import { EV, emit } from '../sim/events.js'
import { piggyShouldShow } from '../sim/derive.js'

// ── Carry helpers ─────────────────────────────────────────

export const carriedType = (agent, type) => (agent.carrying ?? []).find(i => i.type === type)
export const carryFull   = (agent) => (agent.carrying ?? []).length >= CARRY_CAPACITY
export const carryEmpty  = (agent) => (agent.carrying ?? []).length === 0

function take(agent, item) {
  agent.carrying = [...(agent.carrying ?? []), item]
}

function drop(agent, type) {
  const idx = (agent.carrying ?? []).findIndex(i => i.type === type)
  if (idx < 0) return null
  const [item] = agent.carrying.splice(idx, 1)
  return item
}

// Someone else already has this delivery in hand.
const someoneCarrying = (world) =>
  (world.game.deliveries ?? []).some(d => d.status === DeliveryStatus.CARRYING)

// ── Interaction registry ──────────────────────────────────

export const INTERACTIONS = {
  // Street slot: grab an arrived box.
  delivery_slot: {
    dwellMs:  ZONE_DWELL_INSTANT_MS,
    repeatMs: 0,
    accepts:  'any',
    enabled(world, zone, agent) {
      if (carryFull(agent) || someoneCarrying(world)) return false
      return !!arrivedIn(world, zone)
    },
    run(world, zone, agent, events) {
      const delivery = arrivedIn(world, zone)
      if (!delivery) return
      world.game = pickupDelivery(world.game, delivery.id, world.now, agent.id)
      take(agent, { type: 'kit_box', kitId: delivery.kitId, deliveryId: delivery.id })
      emit(events, EV.DELIVERY_PICKED, { id: delivery.id, kitId: delivery.kitId, slotIndex: delivery.slotIndex })
      emit(events, EV.ITEM_PICKED, { agentId: agent.id, item: 'kit_box' })
    },
  },

  // Workbench: drop a box to start assembly, collect a finished drone, or —
  // while it is being assembled — work at it (the mini-game).
  bench: {
    dwellMs:  ZONE_DWELL_BENCH_MS,
    repeatMs: 0,
    accepts:  'any',
    enabled(world, zone, agent) {
      const station = stationOf(world, zone)
      if (!station) return false
      const { phase } = station
      const hasBox = carriedType(agent, 'kit_box')
      // A box can only be put down where there is a delivery to consume.
      if (hasBox) return phase === Phase.IDLE
      if (carriedType(agent, 'scrap')) return phase === Phase.IDLE
      if (phase === Phase.READY)       return !carryFull(agent)
      // ASSEMBLY is not a trigger any more (C6): working a bench is continuous
      // presence, shown by the soldering strip, not a one-shot dwell.
      return false
    },
    run(world, zone, agent, events) {
      const station   = stationOf(world, zone)
      const stationId = station.id

      if (carriedType(agent, 'kit_box')) {
        drop(agent, 'kit_box')
        world.game = startAssembly(world.game, stationId)
        emit(events, EV.ITEM_DROPPED, { agentId: agent.id, item: 'kit_box', stationId })
        emit(events, EV.STATE_DIRTY)
        return
      }
      if (carriedType(agent, 'scrap')) {
        drop(agent, 'scrap')
        world.game = startScrapAssembly(world.game, stationId)
        emit(events, EV.SCRAP_STARTED, { stationId })
        emit(events, EV.STATE_DIRTY)
        return
      }
      if (station.phase === Phase.READY) {
        take(agent, { type: 'drone', kitId: station.kitId, stationId })
        emit(events, EV.ITEM_PICKED, { agentId: agent.id, item: 'drone', stationId })
        return
      }
    },
  },

  // Mailbox: hand over a finished drone.
  mailbox: {
    dwellMs:  ZONE_DWELL_MAILBOX_MS,
    repeatMs: 0,
    accepts:  'any',
    enabled: (_world, _zone, agent) => !!carriedType(agent, 'drone'),
    run(world, _zone, agent, events) {
      const drone = drop(agent, 'drone')
      emit(events, EV.ITEM_DROPPED, { agentId: agent.id, item: 'drone' })

      // The drone remembers which station built it, so the right one clears.
      const stationId = drone?.stationId ??
        (world.game.stations ?? []).find(s => s.phase === Phase.READY)?.id
      if (!stationId) return

      const station = getStation(world.game, stationId)
      if (station.phase !== Phase.READY) return

      const kit     = KIT_TYPES[station.kitId]
      const quality = station.quality
      const price   = calcPrice(kit.basePrice, quality, world.game.upgrades.priceMultiplier)

      world.salesLog.push({ quality, price })
      world.game = sellStation(world.game, stationId)

      emit(events, EV.SALE_MADE, { kitId: kit.id, quality, price, stationId, agentId: agent.id })
      emit(events, EV.MONEY_GAINED, { amount: price, reason: 'sale' })
      emit(events, EV.BENCH_CLEARED, { reason: 'sold' })
      emit(events, EV.STATE_DIRTY)
    },
  },

  // Trash bin: salvage parts, or throw away a burnt kit.
  trashbin: {
    dwellMs:  ZONE_DWELL_TRASH_MS,
    repeatMs: 0,
    accepts:  'any',
    enabled: (world, _zone, agent) => world.game.scrapAvailable && carryEmpty(agent),
    run: (_world, _zone, agent, events) =>
      emit(events, EV.MINIGAME_REQUESTED, { agentId: agent.id, game: 'scrap' }),
  },

  // Piggy bank: the rescue mini-game.
  piggy: {
    dwellMs:  ZONE_DWELL_INSTANT_MS,
    repeatMs: 0,
    accepts:  'player',   // a hired worker has no use for the player's piggy bank
    enabled: (world) => piggyShouldShow(world.game),
    run: (_world, _zone, agent, events) =>
      emit(events, EV.MINIGAME_REQUESTED, { agentId: agent.id, game: 'piggy' }),
  },
}

// The station a bench zone belongs to.
function stationOf(world, zone) {
  try { return getStation(world.game, zone.meta?.stationId) } catch { return null }
}

// The arrived, unclaimed delivery sitting in this zone's slot, if any.
function arrivedIn(world, zone) {
  return (world.game.deliveries ?? []).find(d =>
    d.slotIndex === zone.meta?.slotIndex &&
    d.status === DeliveryStatus.TRANSIT &&
    d.readyAt <= world.now
  )
}

// Convenience for the view: what the carried item should look like.
export function carrySpriteKey(item) {
  if (item.type === 'kit_box') return 'delivery_box'
  if (item.type === 'drone' || item.type === 'burnt')
    return KIT_TYPES[item.kitId]?.spriteKey ?? 'mini_drone'
  return 'delivery_box'
}
