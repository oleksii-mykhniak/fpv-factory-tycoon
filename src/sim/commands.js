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
  calcPrice,
} from '../state/gameState.js'
import { levelData, UPGRADE_TRACKS } from '../state/upgrades.js'
import {
  COLD_SOLDER_THRESHOLD, COLD_SOLDER_QUALITY_PENALTY, SALVAGE_RATE,
} from '../state/config.js'
import { EV, emit } from './events.js'

// ── Command handlers ──────────────────────────────────────
// Each: (world, payload, events) => void

const HANDLERS = {
  order(world, { kitId }, events) {
    const kit = KIT_TYPES[kitId]
    world.game = orderKit(world.game, kitId, world.now, () => `d${world.now}-${world.seq++}`)
    emit(events, EV.MONEY_SPENT, { amount: kit.cost, reason: 'kit' })
    emit(events, EV.DELIVERY_ORDERED, { kitId })
  },

  // Player tapped an arrived delivery (MANUAL worker mode).
  pickup(world, { deliveryId }, events) {
    const d = (world.game.deliveries ?? []).find(x => x.id === deliveryId)
    if (!d || d.readyAt > world.now || world.game.phase !== Phase.IDLE) {
      emit(events, EV.COMMAND_REJECTED, { type: 'pickup', reason: 'not ready' })
      return
    }
    world.game = pickupDelivery(world.game, deliveryId, world.now)
    world.worker.targetSlotIndex = d.slotIndex
    emit(events, EV.DELIVERY_PICKED, { id: d.id, kitId: d.kitId, slotIndex: d.slotIndex })
  },

  // The worker put the box down on the bench.
  benchArrived(world, _p, events) {
    if (world.game.phase !== Phase.IDLE) return
    if (!(world.game.deliveries ?? []).some(d => d.status === DeliveryStatus.CARRYING)) return
    world.game = startAssembly(world.game)
    emit(events, EV.STATE_DIRTY)
  },

  // Player asked the bench to start (SEMI mode). AUTO arms itself in the system;
  // MANUAL opens the mini-game in the view and never reaches here.
  armSolder(world) {
    if (world.game.phase !== Phase.ASSEMBLY) return
    world.station.armed = true
  },

  // Result of one point of the manual soldering mini-game.
  solderResult(world, { quality }, events) {
    if (world.game.phase !== Phase.ASSEMBLY) return

    const solder = levelData('soldering', world.game.upgrades.solderingLevel)
    const flux   = levelData('consumables', world.game.upgrades.consumablesLevel ?? 0)
    const effectiveOverheat = solder.overheatChance * flux.overheatMult
    const boosted = Math.min(1, quality + flux.qualityBonus)

    if (boosted < COLD_SOLDER_THRESHOLD) {
      if (world.rng() < effectiveOverheat) {
        const kitId = world.game.activeKit
        world.game = burnKit(world.game)
        emit(events, EV.KIT_BURNT, { kitId })
      } else {
        const kit  = KIT_TYPES[world.game.activeKit]
        const step = kit?.assemblySteps?.[world.game.solderPoints.length]
        world.game = applyColdSolderPenalty(world.game, COLD_SOLDER_QUALITY_PENALTY)
        emit(events, EV.STAGE_COLD, { missMsg: step?.missMsg })
      }
      return
    }

    world.game = recordSolderPoint(world.game, boosted)
    const kit   = KIT_TYPES[world.game.activeKit]
    const done  = world.game.solderPoints.length
    const total = kit.solderPointCount
    emit(events, EV.STAGE_DONE, { total, done, quality: boosted })

    if (done >= total) {
      world.game = finishAssembly(world.game)
      const finalQuality = world.game.assemblyQuality
      emit(events, EV.ASSEMBLY_DONE, {
        quality: finalQuality,
        price:   calcPrice(kit.basePrice, finalQuality, world.game.upgrades.priceMultiplier),
      })
    }
  },

  // priceMultBonus > 1 comes from the rewarded-ad hook (D8).
  sell(world, { priceMultBonus = 1 } = {}, events) {
    if (world.game.phase !== Phase.READY) return
    const kit       = KIT_TYPES[world.game.activeKit]
    const quality   = world.game.assemblyQuality
    const basePrice = calcPrice(kit.basePrice, quality, world.game.upgrades.priceMultiplier)
    const price     = basePrice * priceMultBonus

    world.salesLog.push({ quality, price })
    world.game = sellKit(world.game)
    if (priceMultBonus > 1) {
      world.game = { ...world.game, money: world.game.money + (price - basePrice) }
    }

    emit(events, EV.SALE_MADE, { kitId: kit.id, quality, price })
    emit(events, EV.MONEY_GAINED, { amount: price, reason: 'sale' })
    emit(events, EV.BENCH_CLEARED, { reason: 'sold' })
  },

  abandon(world, _p, events) {
    if (world.game.phase !== Phase.BURNT) return
    const kit     = KIT_TYPES[world.game.activeKit]
    const salvage = kit.cost * SALVAGE_RATE
    world.game = abandonBurntDrone(world.game, SALVAGE_RATE)
    emit(events, EV.MONEY_GAINED, { amount: salvage, reason: 'salvage' })
    emit(events, EV.BENCH_CLEARED, { reason: 'abandoned' })
  },

  buyUpgrade(world, { trackId }, events) {
    world.game = buyUpgradeState(world.game, trackId)
    const level = world.game.upgrades[UPGRADE_TRACKS[trackId].stateKey]
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

  // Worker got back to the bench with the salvaged parts.
  scrapDelivered(world, _p, events) {
    world.game = startScrapAssembly(world.game)
    emit(events, EV.SCRAP_STARTED)
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
