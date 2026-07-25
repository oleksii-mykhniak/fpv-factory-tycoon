// Station system — each machine's own state loop.
//
// C0 replaced main.js's single setTimeout chain with an accumulator; C3 turned
// that accumulator into one per station, so N benches advance independently in
// the same tick. The stage logic below did not change when that happened —
// which was the point of the split.
//
// A bench only produces while SOMEBODY IS AT IT. An upgrade alone is not
// enough: the semi-auto iron makes the work effortless, not unmanned.
//
//   technician present → works at the better of the tech's and the iron's rate
//   player present + semi/auto iron → the same, and no mini-game is offered
//   player present + hand iron → nothing automatic; the mini-game is the work
//   nobody present → the bench waits, keeping its progress
//
// This replaced "any upgrade runs the bench on its own", which meant a drone
// assembled itself in an empty room and made hiring a technician pointless.

import { Phase, KIT_TYPES, recordSolderPoint, finishAssembly, calcPrice, stationsOf } from '../../state/gameState.js'
import { levelData } from '../../state/upgrades.js'
import { roleLevelData } from '../../defs/roles.js'
import { EV, emit } from '../events.js'

// Whoever is physically standing at this station. Presence is the whole
// contract — the same rule the trigger zones use.
function agentAt(world, stationId, match) {
  const zone = (world.zones ?? []).find(z => z.meta?.stationId === stationId)
  if (!zone) return null
  return (world.agents ?? []).find(a =>
    match(a) &&
    Math.abs(a.x - zone.cx) <= zone.w / 2 &&
    Math.abs(a.y - zone.cy) <= zone.h / 2
  ) ?? null
}

const technicianAt = (world, id) =>
  agentAt(world, id, a => a.kind === 'worker' && a.role === 'tech')
const playerAt = (world, id) => agentAt(world, id, a => a.kind === 'player')

// What the station runs on this tick: the soldering upgrade, a hired
// technician, or neither. A tech works a hand-iron bench too — otherwise hiring
// one at soldering level 0 would do nothing, exactly when help is most wanted.
// Upgrades still matter: whichever source is better wins on each axis.
export function workSource(world, station, data) {
  const tech = technicianAt(world, station.id)
  const here = tech ?? playerAt(world, station.id)
  if (!here) return null            // an empty bench builds nothing

  // Levels 2–3 supply a hands-off rate; levels 0–1 only sharpen the player's
  // own mini-game (greenHalf), so they cannot run themselves at all.
  const iron = data.qualityMin !== undefined
    ? { pointDelayMs: data.pointDelayMs, qualityMin: data.qualityMin, qualityMax: data.qualityMax }
    : null

  if (!tech) return iron            // the player: only a good iron works alone

  const t = roleLevelData('tech', tech.level ?? 0)
  const hands = { pointDelayMs: t.pointMs, qualityMin: t.quality - 0.05, qualityMax: t.quality + 0.05 }
  if (!iron) return hands
  // Best of both on each axis.
  return {
    pointDelayMs: Math.min(hands.pointDelayMs, iron.pointDelayMs),
    qualityMin:   Math.max(hands.qualityMin, iron.qualityMin),
    qualityMax:   Math.max(hands.qualityMax, iron.qualityMax),
  }
}

// Per-station runtime: how far into the current stage it is. Not persisted —
// a reload restarts the current stage, which is a fair trade for a save file
// that only holds game state.
export function stationRuntime(world, stationId) {
  return (world.stationRuntime ??= {})[stationId] ??= {
    running: false, elapsedMs: 0, durationMs: 0,
  }
}

function idle(rt) {
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
