// The cat (V5).
//
// Wanders, sits, occasionally decides the player is interesting and follows
// them for a while. Does no work, carries nothing, blocks nobody. It exists so
// the shop has something alive in it that is not an employee.
//
// It IS an agent rather than an animation, because it has to respect walls and
// world bounds — and moveSystem already does that for everyone. Writing a
// second movement path for one cat would be the expensive choice, not the
// cheap one.
//
// What keeps it harmless is one line in zoneSystem: `accepts: 'any'` means any
// PERSON. Without that the cat walks into the delivery slot and picks up a kit.

import {
  CAT_SPEED, CAT_WANDER_RADIUS, CAT_SIT_MS, CAT_STROLL_PAUSE_MS,
  CAT_FOLLOW_CHANCE, CAT_FOLLOW_MS,
} from '../../state/config.js'
import { createAgent } from '../world.js'
import { stopPath } from './path.js'

export const CAT_ID = 'cat-1'

// Where the cat lives. Only the flat has one — a factory floor is no place for
// a cat, and the garage is where the shop stops being home.
export function catHome(layout) {
  return layout?.spawns?.cat ?? null
}

export function syncCat(world) {
  const home = catHome(world.layout)
  const existing = (world.agents ?? []).find(a => a.kind === 'cat')

  if (!home) {
    if (existing) world.agents = world.agents.filter(a => a !== existing)
    return null
  }
  if (existing) return existing

  const cat = createAgent({
    id: CAT_ID, kind: 'cat', x: home.x, y: home.y, speed: CAT_SPEED,
  })
  // Smaller than a person, and deliberately not part of the crowd.
  cat.halfW = 12
  cat.halfH = 8
  world.agents = [...(world.agents ?? []), cat]
  return cat
}

export function catSystem(world, dt) {
  const cat = syncCat(world)
  if (!cat) return

  cat.restMs = (cat.restMs ?? 0) + dt

  // Following the player: a short burst, then back to its own business.
  if (cat.followUntil && world.now < cat.followUntil) {
    const player = (world.agents ?? []).find(a => a.kind === 'player')
    if (player) {
      cat.pathTarget = { x: player.x, y: player.y + 40 }
      cat.arrived = false
      return
    }
  }

  if (cat.pathTarget && (cat.arrived || cat.pathFailed)) {
    stopPath(cat)
    cat.restMs = 0
  }
  if (cat.path || cat.pathTarget) return

  // Sitting is most of what a cat does, so the pause is long and sometimes much
  // longer — a constantly moving cat reads as a bug rather than an animal.
  const pause = cat.sitting ? CAT_SIT_MS : CAT_STROLL_PAUSE_MS
  if (cat.restMs < pause) return

  cat.restMs = 0
  cat.sitting = world.rng() < 0.4

  if (world.rng() < CAT_FOLLOW_CHANCE) {
    cat.followUntil = world.now + CAT_FOLLOW_MS
    return
  }

  const home  = catHome(world.layout)
  const angle = world.rng() * Math.PI * 2
  const r     = world.rng() * CAT_WANDER_RADIUS
  cat.pathTarget = { x: home.x + Math.cos(angle) * r, y: home.y + Math.sin(angle) * r }
  cat.arrived = false
}
