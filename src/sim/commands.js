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
  burnKit, abandonBurntDrone,
  buyUpgrade as buyUpgradeState, moveToLocation as moveToLocationState,
  canOpenPiggy, collectPiggy as collectPiggyState,
  cancelScrap, unlockHall as unlockHallState,
  unlockRoom as unlockRoomState,
  calcPrice, getStation, focusStation, idleStations, syncStations,
  hireWorker as hireWorkerState, nextHireCost,
  promoteWorker as promoteWorkerState, workerById,
  kitCost,
} from '../state/gameState.js'
import { levelData, UPGRADE_TRACKS, salePriceMult, toolingQualityBonus } from '../state/upgrades.js'
import {
  COLD_SOLDER_THRESHOLD, COLD_SOLDER_QUALITY_PENALTY, SALVAGE_RATE,
  ARROW_REQUEST_MS,
} from '../state/config.js'
import { EV, emit } from './events.js'
import { rebuildStationGeometry, stationCountFor, syncWorkerAgents, applyLayout } from './world.js'
import { layoutFor } from '../defs/layouts/index.js'
import { promoteCost } from '../defs/roles.js'

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
    emit(events, EV.MONEY_SPENT, { amount: kitCost(world.game, kit.id), reason: 'kit' })
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
    world.game = pickupDelivery(world.game, deliveryId, world.now, 'player')
    emit(events, EV.DELIVERY_PICKED, { id: d.id, kitId: d.kitId, slotIndex: d.slotIndex })
  },

  // Result of one point of the manual soldering mini-game.
  solderResult(world, { quality, stationId }, events) {
    const id = targetStation(world, stationId)
    if (!id || getStation(world.game, id).phase !== Phase.ASSEMBLY) return

    const solder = levelData('soldering', world.game.upgrades.solderingLevel)
    const flux   = levelData('consumables', world.game.upgrades.consumablesLevel ?? 0)
    const effectiveOverheat = solder.overheatChance * flux.overheatMult
    const boosted = Math.min(1, quality + flux.qualityBonus + toolingQualityBonus(world.game))

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

    // A technician may have landed the last point in this very tick.
    const before = getStation(world.game, id)
    if (before.solderPoints.length >= KIT_TYPES[before.kitId].solderPointCount) return

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
        price:     calcPrice(kit.basePrice, finished.quality, salePriceMult(world.game)),
      })
    }
  },

  // D8.2 rewarded ×2: the sale itself already happened at the mailbox, so this
  // only tops it up. Keeping it separate is what lets the simulation finish a
  // sale on its own, with or without a view attached.
  grantSaleBonus(world, { multiplier = 2 } = {}, events) {
    const last = world.salesLog[world.salesLog.length - 1]
    if (!last || last.bonusApplied) return
    const extra = last.price * (multiplier - 1)
    last.price += extra
    last.bonusApplied = true
    world.game = { ...world.game, money: world.game.money + extra }
    emit(events, EV.MONEY_GAINED, { amount: extra, reason: 'ad-bonus' })
  },

  abandon(world, { stationId } = {}, events) {
    const id = stationId ?? (world.game.stations ?? []).find(s => s.phase === Phase.BURNT)?.id
    if (!id) return
    const kit     = KIT_TYPES[getStation(world.game, id).kitId]
    const salvage = kitCost(world.game, kit.id) * SALVAGE_RATE
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
    // The new location has more bench slots; build the ones already paid for.
    applyLayout(world, layoutFor(locationId, world.game))
    world.game = syncStations(world.game, stationCountFor(world.game, world.layout))
    rebuildStationGeometry(world)
    emit(events, EV.LOCATION_CHANGED, { locationId })
  },

  // Підвищення робітника (П3). Списання живе тут, поряд з рештою покупок, а не
  // в тригер-зоні: зона лише відкриває панель, а гроші витрачає кнопка, яку
  // натиснув гравець.
  promoteWorker(world, { workerId }, events) {
    const worker = workerById(world.game, workerId)
    if (!worker) return
    const cost = promoteCost(worker.role, worker.level ?? 0)
    world.game = promoteWorkerState(world.game, workerId)
    emit(events, EV.MONEY_SPENT, { amount: cost, reason: 'promote' })
    emit(events, EV.WORKER_PROMOTED, {
      workerId, role: worker.role, level: (worker.level ?? 0) + 1,
    })
    emit(events, EV.STATE_DIRTY)
  },

  // Закріплення цілі (`pinQuest`) прибрано в Стадії 9: активний квест тепер
  // рівно один, тож обирати нічого.
  //
  // Замість нього тап по картці означає «покажи, куди йти»: після перших кроків
  // ланцюга стрілка зникає (див. arrowAllowed) і повертається лише на запит.
  // Пишемо у world, а не в game: це не стан цеху, а те, що гравець хоче бачити
  // протягом наступних секунд, і в сейві йому місця немає.
  showArrow(world) {
    world.arrowUntil = world.now + ARROW_REQUEST_MS
  },


  // Buy the next room of the flat (П2). The garage used to be a move; the only
  // thing that changed is that the world grows instead of being replaced —
  // which is why this is the hall command with a different noun.
  unlockRoom(world, { roomId }, events) {
    world.game = unlockRoomState(world.game, roomId)
    applyLayout(world, layoutFor(world.game.locationId, world.game))
    world.game = syncStations(world.game, stationCountFor(world.game, world.layout))
    rebuildStationGeometry(world)
    emit(events, EV.ROOM_UNLOCKED, { roomId })
    emit(events, EV.STATE_DIRTY)
  },

  // Open the next factory hall (F2). Structurally identical to a move — a
  // different floor plan, rebuilt the same way — which is exactly why the map
  // can grow without any new machinery.
  unlockHall(world, { hallId }, events) {
    world.game = unlockHallState(world.game, hallId)
    applyLayout(world, layoutFor('factory', world.game))
    world.game = syncStations(world.game, stationCountFor(world.game, world.layout))
    rebuildStationGeometry(world)
    emit(events, EV.HALL_UNLOCKED, { hallId })
    emit(events, EV.STATE_DIRTY)
  },

  collectPiggy(world, { taps }, events) {
    const before = world.game.money
    world.game = collectPiggyState(world.game, taps, world.now)
    emit(events, EV.PIGGY_COLLECTED, { amount: world.game.money - before })
    emit(events, EV.MONEY_GAINED, { amount: world.game.money - before, reason: 'piggy' })
  },

  // `startScrap` прибрано: смітник більше не «замовляють» у ноутбуці, до нього
  // просто підходять (див. beginScrapRun).

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

  // Hire a worker (C5): the roster is game state, the agent that walks around
  // is derived from it.
  hireWorker(world, { role, hallId = null }, events) {
    const cost = nextHireCost(world.game, role)
    world.game = hireWorkerState(
      world.game, role, world.now, () => `${role}-${world.seq++}`, hallId)
    syncWorkerAgents(world)
    emit(events, EV.MONEY_SPENT, { amount: cost, reason: 'hire' })
    emit(events, EV.WORKER_HIRED, { role, hallId })
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
