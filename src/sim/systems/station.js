// Station system — each machine's own state loop.
//
// C0 replaced main.js's single setTimeout chain with an accumulator; C3 turned
// that accumulator into one per station, so N benches advance independently in
// the same tick. The stage logic below did not change when that happened —
// which was the point of the split.
//
// Modes:
//   MANUAL — the mini-game drives progress; this system stays out of the way.
//   SEMI   — armed by whoever works the station, then runs on its own.
//   AUTO   — arms itself as soon as a kit is on it.

import { Phase, KIT_TYPES, recordSolderPoint, finishAssembly, calcPrice, stationsOf } from '../../state/gameState.js'
import { levelData, SOLDER_MODE } from '../../state/upgrades.js'
import { EV, emit } from '../events.js'

// Per-station runtime: how far into the current stage it is. Not persisted —
// a reload restarts the current stage, which is a fair trade for a save file
// that only holds game state.
export function stationRuntime(world, stationId) {
  return (world.stationRuntime ??= {})[stationId] ??= {
    armed: false, running: false, elapsedMs: 0, durationMs: 0,
  }
}

function idle(rt) {
  rt.armed = false
  rt.running = false
  rt.elapsedMs = 0
  rt.durationMs = 0
}

function startStage(world, station, rt, kit, data, events) {
  const done  = station.solderPoints.length
  const total = kit.solderPointCount
  const label = kit.assemblySteps?.[done]?.label ?? `Крок ${done + 1}`

  rt.running    = true
  rt.elapsedMs  = 0
  rt.durationMs = data.pointDelayMs

  emit(events, EV.STAGE_STARTED, {
    stationId: station.id, label, total, done, durationMs: data.pointDelayMs,
  })
}

export function stationSystem(world, dt, events) {
  const data = levelData('soldering', world.game.upgrades.solderingLevel)

  // Snapshot: world.game is replaced by each transition below, so iterate over
  // ids rather than over objects that go stale mid-loop.
  const ids = stationsOf(world.game).map(s => s.id)

  for (const stationId of ids) {
    const rt = stationRuntime(world, stationId)
    const station = stationsOf(world.game).find(s => s.id === stationId)
    if (!station) { idle(rt); continue }

    if (station.phase !== Phase.ASSEMBLY || data.mode === SOLDER_MODE.MANUAL) {
      idle(rt)
      continue
    }

    const kit = KIT_TYPES[station.kitId]
    if (!kit) { idle(rt); continue }

    if (data.mode === SOLDER_MODE.AUTO) rt.armed = true
    if (!rt.armed) continue

    if (!rt.running) {
      startStage(world, station, rt, kit, data, events)
      continue
    }

    rt.elapsedMs += dt
    if (rt.elapsedMs < rt.durationMs) continue

    const quality = data.qualityMin + world.rng() * (data.qualityMax - data.qualityMin)
    world.game = recordSolderPoint(world.game, stationId, quality)

    const updated = stationsOf(world.game).find(s => s.id === stationId)
    const done    = updated.solderPoints.length
    const total   = kit.solderPointCount

    if (done < total) {
      emit(events, EV.STAGE_DONE, { stationId, total, done, quality })
      startStage(world, updated, rt, kit, data, events)
      emit(events, EV.STATE_DIRTY)
      continue
    }

    world.game = finishAssembly(world.game, stationId)
    const finished = stationsOf(world.game).find(s => s.id === stationId)
    const price = calcPrice(kit.basePrice, finished.quality, world.game.upgrades.priceMultiplier)

    idle(rt)
    emit(events, EV.STAGE_DONE, { stationId, total, done, quality })
    emit(events, EV.ASSEMBLY_DONE, { stationId, quality: finished.quality, price })
    emit(events, EV.STATE_DIRTY)
  }
}
