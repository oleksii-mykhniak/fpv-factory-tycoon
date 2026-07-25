// Station system — the workbench's own state loop.
//
// Replaces main.js scheduleAutoPoint()/autoTimer: instead of a setTimeout chain
// that only one bench in the whole game could own, progress is an accumulator
// on world.station advanced by the tick. C3 turns `world.station` into an array
// and this function into a per-station loop; the stage logic below does not
// change when that happens.
//
// Modes:
//   MANUAL — the mini-game drives progress; this system stays out of the way.
//   SEMI   — armed by the player's solder command, then runs on its own.
//   AUTO   — arms itself as soon as a kit is on the bench.

import { Phase, KIT_TYPES, recordSolderPoint, finishAssembly, calcPrice } from '../../state/gameState.js'
import { levelData, SOLDER_MODE } from '../../state/upgrades.js'
import { EV, emit } from '../events.js'

function idle(station) {
  station.armed      = false
  station.running    = false
  station.elapsedMs  = 0
  station.durationMs = 0
}

function startStage(world, kit, data, events) {
  const done  = world.game.solderPoints.length
  const total = kit.solderPointCount
  const label = kit.assemblySteps?.[done]?.label ?? `Крок ${done + 1}`

  world.station.running    = true
  world.station.elapsedMs  = 0
  world.station.durationMs = data.pointDelayMs

  emit(events, EV.STAGE_STARTED, { label, total, done, durationMs: data.pointDelayMs })
}

export function stationSystem(world, dt, events) {
  const game = world.game
  const data = levelData('soldering', game.upgrades.solderingLevel)

  if (game.phase !== Phase.ASSEMBLY || data.mode === SOLDER_MODE.MANUAL) {
    idle(world.station)
    return
  }

  const kit = KIT_TYPES[game.activeKit]
  if (!kit) { idle(world.station); return }

  // AUTO needs no player input to get going; SEMI waits to be armed.
  if (data.mode === SOLDER_MODE.AUTO) world.station.armed = true
  if (!world.station.armed) return

  if (!world.station.running) {
    startStage(world, kit, data, events)
    return
  }

  world.station.elapsedMs += dt
  if (world.station.elapsedMs < world.station.durationMs) return

  const quality = data.qualityMin + world.rng() * (data.qualityMax - data.qualityMin)
  world.game = recordSolderPoint(world.game, quality)

  const done  = world.game.solderPoints.length
  const total = kit.solderPointCount

  if (done < total) {
    emit(events, EV.STAGE_DONE, { total, done, quality })
    startStage(world, kit, data, events)
    emit(events, EV.STATE_DIRTY)
    return
  }

  world.game = finishAssembly(world.game)
  const finalQuality = world.game.assemblyQuality
  const price = calcPrice(kit.basePrice, finalQuality, world.game.upgrades.priceMultiplier)

  idle(world.station)
  emit(events, EV.STAGE_DONE, { total, done, quality })
  emit(events, EV.ASSEMBLY_DONE, { quality: finalQuality, price })
  emit(events, EV.STATE_DIRTY)
}
