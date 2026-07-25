// Commands — the only way anything outside the sim may change the world.
//
// UI buttons, scene taps and (from C2) trigger zones all funnel through
// dispatch(). Systems own time; commands own player intent. Both mutate `world`
// and append to the same event stream, so the view has one place to react.
//
// Pure: no DOM, no Excalibur, no Date.now() — randomness comes from world.rng
// and time from world.now.

import {
  Phase, DeliveryStatus, KIT_TYPES,
  orderKit, pickupDelivery, startAssembly,
  recordSolderPoint, finishAssembly, applyColdSolderPenalty,
  burnKit, abandonBurntDrone, sell as sellKit,
  buyUpgrade as buyUpgradeState, moveToLocation as moveToLocationState,
  canOpenPiggy, collectPiggy as collectPiggyState,
  startScrap as startScrapState, startScrapAssembly, cancelScrap,
  calcPrice, getStation, focusStation, idleStations, syncStations,
} from '../state/gameState.js'
import { levelData, UPGRADE_TRACKS } from '../state/upgrades.js'
import {
  COLD_SOLDER_THRESHOLD, COLD_SOLDER_QUALITY_PENALTY, SALVAGE_RATE,
} from '../state/config.js'
import { EV, emit } from './events.js'
import { rebuildStationGeometry, stationCountFor } from './world.js'
import { stationRuntime } from './systems/station.js'

// Commands that come from a UI button rather than a zone have no station in
// hand; they act on the one the player is most likely looking at.
const targetStation = (world, stationId) =>
  stationId ?? focusStation(world.game)?.id

// ── Command handlers ──────────────────────────────────────
// Each: (world, payload, events) => void

const HANDLERS = {
  order(world, { kitId }, events) {
    const kit = KIT_TYPES[kitId]
    world.game = orderKit(world.game, kitId, world.now, () => `d${world.now}-${world.seq++}`)
    emit(events, EV.MONEY_SPENT, { amount: kit.cost, reason: 'kit' })
    emit(events, EV.DELIVERY_ORDERED, { kitId })
  },

  // Claim an arrived delivery without walking to it. The trigger zone is the
  // normal route (C2); this stays as the scriptable entry point.
  pickup(world, { deliveryId }, events) {
    const d = (world.game.deliveries ?? []).find(x => x.id === deliveryId)
    if (!d || d.readyAt > world.now) {
      emit(events, EV.COMMAND_REJECTED, { type: 'pickup', reason: 'not ready' })
      return
    }
    world.game = pickupDelivery(world.game, deliveryId, world.now)
    world.worker.targetSlotIndex = d.slotIndex
    emit(events, EV.DELIVERY_PICKED, { id: d.id, kitId: d.kitId, slotIndex: d.slotIndex })
  },

  // The worker puppet put the box down. It always serves the first station.
  benchArrived(world, _p, events) {
    const station = idleStations(world.game)[0]
    if (!station) return
    if (!(world.game.deliveries ?? []).some(d => d.status === DeliveryStatus.CARRYING)) return
    world.game = startAssembly(world.game, station.id)
    emit(events, EV.STATE_DIRTY)
  },

  // Someone asked a station to start (SEMI mode). AUTO arms itself in the
  // system; MANUAL opens the mini-game in the view and never reaches here.
  armSolder(world, { stationId } = {}) {
    const id = targetStation(world, stationId)
    if (!id) return
    if (getStation(world.game, id).phase !== Phase.ASSEMBLY) return
    stationRuntime(world, id).armed = true
  },

  // Result of one point of the manual soldering mini-game.
  solderResult(world, { quality, stationId }, events) {
    const id = targetStation(world, stationId)
    if (!id || getStation(world.game, id).phase !== Phase.ASSEMBLY) return

    const solder = levelData('soldering', world.game.upgrades.solderingLevel)
    const flux   = levelData('consumables', world.game.upgrades.consumablesLevel ?? 0)
    const effectiveOverheat = solder.overheatChance * flux.overheatMult
    const boosted = Math.min(1, quality + flux.qualityBonus)

    if (boosted < COLD_SOLDER_THRESHOLD) {
      const station = getStation(world.game, id)
      if (world.rng() < effectiveOverheat) {
        world.game = burnKit(world.game, id)
        emit(events, EV.KIT_BURNT, { stationId: id, kitId: station.kitId })
      } else {
        const step = KIT_TYPES[station.kitId]?.assemblySteps?.[station.solderPoints.length]
        world.game = applyColdSolderPenalty(world.game, id, COLD_SOLDER_QUALITY_PENALTY)
        emit(events, EV.STAGE_COLD, { stationId: id, missMsg: step?.missMsg })
      }
      return
    }

    world.game = recordSolderPoint(world.game, id, boosted)
    const station = getStation(world.game, id)
    const kit     = KIT_TYPES[station.kitId]
    const done    = station.solderPoints.length
    const total   = kit.solderPointCount
    emit(events, EV.STAGE_DONE, { stationId: id, total, done, quality: boosted })

    if (done >= total) {
      world.game = finishAssembly(world.game, id)
      const finished = getStation(world.game, id)
      emit(events, EV.ASSEMBLY_DONE, {
        stationId: id,
        quality:   finished.quality,
        price:     calcPrice(kit.basePrice, finished.quality, world.game.upgrades.priceMultiplier),
      })
    }
  },

  // priceMultBonus > 1 comes from the rewarded-ad hook (D8).
  sell(world, { priceMultBonus = 1, stationId } = {}, events) {
    // Prefer the station the drone came from; fall back to any that is READY.
    const id = stationId && getStation(world.game, stationId).phase === Phase.READY
      ? stationId
      : (world.game.stations ?? []).find(s => s.phase === Phase.READY)?.id
    if (!id) return

    const station   = getStation(world.game, id)
    const kit       = KIT_TYPES[station.kitId]
    const quality   = station.quality
    const basePrice = calcPrice(kit.basePrice, quality, world.game.upgrades.priceMultiplier)
    const price     = basePrice * priceMultBonus

    world.salesLog.push({ quality, price })
    world.game = sellKit(world.game, id)
    if (priceMultBonus > 1) {
      world.game = { ...world.game, money: world.game.money + (price - basePrice) }
    }

    emit(events, EV.SALE_MADE, { kitId: kit.id, quality, price })
    emit(events, EV.MONEY_GAINED, { amount: price, reason: 'sale' })
    emit(events, EV.BENCH_CLEARED, { reason: 'sold' })
  },

  abandon(world, { stationId } = {}, events) {
    const id = stationId ?? (world.game.stations ?? []).find(s => s.phase === Phase.BURNT)?.id
    if (!id) return
    const kit     = KIT_TYPES[getStation(world.game, id).kitId]
    const salvage = kit.cost * SALVAGE_RATE
    world.game = abandonBurntDrone(world.game, id, SALVAGE_RATE)
    emit(events, EV.MONEY_GAINED, { amount: salvage, reason: 'salvage' })
    emit(events, EV.BENCH_CLEARED, { reason: 'abandoned' })
  },

  buyUpgrade(world, { trackId }, events) {
    world.game = buyUpgradeState(world.game, trackId)
    const level = world.game.upgrades[UPGRADE_TRACKS[trackId].stateKey]
    // Buying a bench has to actually build it: the station list, its footprint
    // and its trigger zone all follow from the upgrade level.
    if (trackId === 'benches') {
      world.game = syncStations(world.game, stationCountFor(world.game, world.layout))
      rebuildStationGeometry(world)
    }
    emit(events, EV.UPGRADE_BOUGHT, { trackId, level })
  },

  moveToLocation(world, { locationId }, events) {
    world.game = moveToLocationState(world.game, locationId)
    emit(events, EV.LOCATION_CHANGED, { locationId })
  },

  collectPiggy(world, { taps }, events) {
    const before = world.game.money
    world.game = collectPiggyState(world.game, taps, world.now)
    emit(events, EV.PIGGY_COLLECTED, { amount: world.game.money - before })
    emit(events, EV.MONEY_GAINED, { amount: world.game.money - before, reason: 'piggy' })
  },

  startScrap(world, _p, events) {
    world.game = startScrapState(world.game)
    emit(events, EV.SCRAP_REQUESTED)
  },

  // The worker puppet got back to a bench with the salvaged parts.
  scrapDelivered(world, _p, events) {
    const station = idleStations(world.game)[0]
    if (!station) return
    world.game = startScrapAssembly(world.game, station.id)
    emit(events, EV.SCRAP_STARTED, { stationId: station.id })
  },

  scrapFailed(world, { consolation = 0 }, events) {
    world.game = cancelScrap(world.game, consolation)
    emit(events, EV.SCRAP_FAILED, { consolation })
    if (consolation > 0) emit(events, EV.MONEY_GAINED, { amount: consolation, reason: 'scrap' })
  },

  // The salvage mini-game succeeded: the parts go into that agent's hands, and
  // they still have to be carried to the bench (the bench zone does the rest).
  scrapCollected(world, { agentId }, events) {
    const agent = (world.agents ?? []).find(a => a.id === agentId)
    if (!agent) return
    agent.carrying = [...(agent.carrying ?? []), { type: 'scrap' }]
    emit(events, EV.ITEM_PICKED, { agentId, item: 'scrap' })
  },

  addMoney(world, { amount }, events) {
    world.game = { ...world.game, money: world.game.money + amount }
    emit(events, EV.MONEY_GAINED, { amount, reason: 'cheat' })
  },

  setOnboarded(world) {
    world.game = { ...world.game, onboarded: true }
  },
}

// ── Entry point ───────────────────────────────────────────

// Applies a command and returns the events it produced. Every command ends with
// STATE_DIRTY so persistence is a single subscription rather than a save() call
// sprinkled through the UI.
export function dispatch(world, type, payload = {}) {
  const handler = HANDLERS[type]
  if (!handler) throw new Error(`dispatch: невідома команда "${type}"`)
  const events = []
  handler(world, payload, events)
  emit(events, EV.STATE_DIRTY)
  return events
}

// Read-only helper the view uses to gate the piggy tap.
export function piggyAvailable(world) {
  return canOpenPiggy(world.game, world.now).can
}
