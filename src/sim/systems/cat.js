// The cat (V5).
//
// Wanders, sits, grooms, sleeps, and now and then sprints across the flat for
// no reason. Does no work, carries nothing, blocks nobody. It exists so the
// shop has something alive in it that is not an employee.
//
// It IS an agent rather than an animation, because it has to respect walls and
// world bounds — and moveSystem already does that for everyone. Writing a
// second movement path for one cat would be the expensive choice.
//
// What keeps it harmless is one line in zoneSystem: `accepts: 'any'` means any
// PERSON. Without that the cat walks into the delivery slot and picks up a kit.
//
// Behaviour is a MOOD TABLE (config.js), not a pile of conditions. Adding
// "scratches the sofa" is an entry in CAT_MOODS and a case below — the same
// shape as defs/tasks.js, and for the same reason: a cat with hand-written
// transitions becomes unreadable at about the fourth one.

import {
  CAT_SPEED, CAT_RUN_SPEED, CAT_WANDER_RADIUS, CAT_ROAM_RADIUS,
  CAT_MOOD_MS, CAT_MOODS,
} from '../../state/config.js'
import { createAgent } from '../world.js'
import { stopPath } from './path.js'

export const CAT_ID = 'cat-1'

// The cat has its OWN random stream, and this is not a detail.
//
// It used to draw from world.rng — the same sequence the soldering iron, the
// overheat roll and the manager's decisions come from. A purely cosmetic animal
// was therefore shifting the simulation's dice: change how often the cat sits
// and a kit burns on a different tick. Tests that pin the rng to make a failure
// reproducible were sharing it with a cat.
//
// Seeded from a constant, so a reload still gives the same cat.
function makeRng(seed = 20260726) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

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
  cat.halfW = 12
  cat.halfH = 8
  cat.mood = 'sit'
  cat.moodUntil = 0
  cat.rng = makeRng()
  world.agents = [...(world.agents ?? []), cat]
  return cat
}

// Weighted pick from the current mood's row.
function nextMood(cat, from) {
  const row = CAT_MOODS[from] ?? CAT_MOODS.sit
  const total = Object.values(row).reduce((a, b) => a + b, 0)
  let roll = cat.rng() * total
  for (const [mood, weight] of Object.entries(row)) {
    roll -= weight
    if (roll <= 0) return mood
  }
  return 'sit'
}

function moodLength(cat, mood) {
  const [min, max] = CAT_MOOD_MS[mood] ?? [2000, 4000]
  return min + cat.rng() * (max - min)
}

function wanderTo(world, cat, radius) {
  const home  = catHome(world.layout)
  const angle = cat.rng() * Math.PI * 2
  const r     = cat.rng() * radius
  cat.pathTarget = { x: home.x + Math.cos(angle) * r, y: home.y + Math.sin(angle) * r }
  cat.arrived = false
}

function enter(world, cat, mood) {
  cat.mood = mood
  cat.moodUntil = world.now + moodLength(cat, mood)
  stopPath(cat)
  cat.speed = mood === 'run' ? CAT_RUN_SPEED : CAT_SPEED

  if (mood === 'stroll') wanderTo(world, cat, CAT_WANDER_RADIUS)
  if (mood === 'run')    wanderTo(world, cat, CAT_ROAM_RADIUS)
}

export function catSystem(world, dt) {
  const cat = syncCat(world)
  if (!cat) return

  // Following is the one mood with a live target, so it is re-aimed every tick.
  if (cat.mood === 'follow') {
    const player = (world.agents ?? []).find(a => a.kind === 'player')
    if (player) {
      cat.pathTarget = { x: player.x, y: player.y + 40 }
      cat.arrived = false
    }
  }

  // A stroll that has arrived is over, however long the mood had left: a cat
  // standing on its own destination waiting out a timer looks stuck.
  const walking = cat.mood === 'stroll' || cat.mood === 'run'
  if (walking && (cat.arrived || cat.pathFailed)) {
    enter(world, cat, nextMood(cat, cat.mood))
    return
  }

  if (world.now < cat.moodUntil) return
  enter(world, cat, nextMood(cat, cat.mood))
}
