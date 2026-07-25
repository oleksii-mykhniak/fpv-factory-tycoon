// Zone system — occupancy and dwell progress. Detection only; the effect of a
// zone lives in defs/interactions.js and is applied by interactionSystem.
//
// Hit-testing is a plain AABB against the agent's centre point rather than an
// Excalibur collider (plan §6.1): deterministic, independent of the physics
// step, and testable in Node — which is what lets a headless run assert that a
// worker actually completed a task in C5.

import { DWELL_DECAY_MULT } from '../../state/config.js'
import { INTERACTIONS } from '../../defs/interactions.js'
import { EV, emit } from '../events.js'

function inside(zone, agent) {
  return Math.abs(agent.x - zone.cx) <= zone.w / 2 &&
         Math.abs(agent.y - zone.cy) <= zone.h / 2
}

function accepts(def, agent) {
  return def.accepts === 'any' || def.accepts === agent.kind
}

export function zoneSystem(world, dt, events) {
  world.triggers = []
  const zones  = world.zones ?? []
  const agents = world.agents ?? []

  for (const zone of zones) {
    const def = INTERACTIONS[zone.kind]
    if (!def) continue

    const state = (world.zoneState[zone.id] ??= { dwell: {}, ready: {} })

    for (const agent of agents) {
      if (!accepts(def, agent)) continue

      const key  = agent.id
      const here = inside(zone, agent)
      const was  = state.dwell[key] !== undefined

      if (!here) {
        // Drain rather than snap to zero: stepping a pixel outside should not
        // erase a second of standing still.
        if (was) {
          const left = state.dwell[key] - dt * DWELL_DECAY_MULT
          if (left <= 0) {
            delete state.dwell[key]
            delete state.ready[key]
            emit(events, EV.ZONE_EXIT, { zoneId: zone.id, agentId: key })
          } else {
            state.dwell[key] = left
          }
        }
        continue
      }

      if (!was) {
        state.dwell[key] = 0
        emit(events, EV.ZONE_ENTER, { zoneId: zone.id, agentId: key })
      }

      // A zone with nothing to offer holds no progress — the ring never shows.
      if (!def.enabled(world, zone, agent)) {
        state.dwell[key] = 0
        state.ready[key] = false
        continue
      }

      state.dwell[key] = Math.min(state.dwell[key] + dt, def.dwellMs)

      if (state.dwell[key] < def.dwellMs) continue

      // Re-arming rule (see defs/interactions.js `repeat`):
      //   repeat — standing there keeps working: progress resets and the next
      //     full dwell fires again, so dropping a box and then soldering is one
      //     continuous stay rather than "step out, step back in".
      //   otherwise — once per entry. Anything that opens a mini-game must be
      //     in this group: a repeating trash bin restarted the salvage game
      //     every 900 ms and its counter never moved.
      if (def.repeat && def.dwellMs > 0) {
        state.dwell[key] = 0
      } else {
        if (state.ready[key]) continue
        state.ready[key] = true
      }

      world.triggers.push({ zoneId: zone.id, agentId: key, kind: zone.kind })
    }
  }
}

// Progress 0..1 for the view's dwell ring. Returns 0 when there is nothing to do.
export function dwellProgress(world, agentId) {
  let best = 0
  for (const zone of world.zones ?? []) {
    const def = INTERACTIONS[zone.kind]
    const ms  = world.zoneState?.[zone.id]?.dwell?.[agentId]
    if (!def?.dwellMs || ms === undefined) continue
    best = Math.max(best, Math.min(ms / def.dwellMs, 1))
  }
  return best
}
