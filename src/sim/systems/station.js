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
import { roleLevelData } from '../../defs/roles.js'
import { EV, emit } from '../events.js'

// A technician physically standing at this station (C5). Presence is the whole
// contract — the same rule the trigger zones use for the player.
function technicianAt(world, stationId) {
  const zone = (world.zones ?? []).find(z => z.meta?.stationId === stationId)
  if (!zone) return null
  return (world.agents ?? []).find(a =>
    a.kind === 'worker' && a.role === 'tech' &&
    Math.abs(a.x - zone.cx) <= zone.w / 2 &&
    Math.abs(a.y - zone.cy) <= zone.h / 2
  ) ?? null
}

// What the station runs on this tick: the soldering upgrade, a hired
// technician, or neither. A tech works a MANUAL bench too — otherwise hiring
// one at soldering level 0 would do nothing, exactly when help is most wanted.
// Upgrades still matter: whichever source is better wins on each axis.
function workSource(world, station, data) {
  const tech = technicianAt(world, station.id)
  const auto = data.mode === SOLDER_MODE.AUTO || data.mode === SOLDER_MODE.SEMI

  if (!tech) {
    return auto
      ? { pointDelayMs: data.pointDelayMs, qualityMin: data.qualityMin, qualityMax: data.qualityMax }
      : null
  }

  const t = roleLevelData('tech', tech.level ?? 0)
  if (!auto) {
    return { pointDelayMs: t.pointMs, qualityMin: t.quality - 0.05, qualityMax: t.quality + 0.05 }
  }
  return {
    pointDelayMs: Math.min(t.pointMs, data.pointDelayMs),
    qualityMin:   Math.max(t.quality - 0.05, data.qualityMin),
    qualityMax:   Math.max(t.quality + 0.05, data.qualityMax),
  }
}

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

    if (station.phase !== Phase.ASSEMBLY) { idle(rt); continue }

    const source = workSource(world, station, data)
    if (!source) { idle(rt); continue }

    const kit = KIT_TYPES[station.kitId]
    if (!kit) { idle(rt); continue }

    // AUTO and a present technician both need no prompting; SEMI waits to be
    // armed by whoever is working the bench.
    if (data.mode === SOLDER_MODE.AUTO || technicianAt(world, station.id)) rt.armed = true
    if (!rt.armed) continue

    if (!rt.running) {
      startStage(world, station, rt, kit, source, events)
      continue
    }

    rt.elapsedMs += dt
    if (rt.elapsedMs < rt.durationMs) continue

    const quality = Math.min(1, Math.max(0,
      source.qualityMin + world.rng() * (source.qualityMax - source.qualityMin)))
    world.game = recordSolderPoint(world.game, stationId, quality)

    const updated = stationsOf(world.game).find(s => s.id === stationId)
    const done    = updated.solderPoints.length
    const total   = kit.solderPointCount

    if (done < total) {
      emit(events, EV.STAGE_DONE, { stationId, total, done, quality })
      startStage(world, updated, rt, kit, source, events)
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
