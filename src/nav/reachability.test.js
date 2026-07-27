// Can a character actually get everywhere the layout says they can?
//
// This is the invariant that guards the scale pass (V1) and everything after
// it. Geometry that blocks a route fails silently: nothing disappears from the
// screen, A* just stops finding a path and the worker stands still. Checking
// "is there a gap of N units" would only approximate it — so this asks the
// pathfinder the same question the game asks at runtime.

import { describe, it, expect } from 'vitest'
import { createWorld } from '../sim/world.js'
import { createState } from '../state/gameState.js'
import { layoutFor } from '../defs/layouts/index.js'
import { findPath } from './astar.js'
import { nearestWalkable, worldToCell, isWalkable } from './navGrid.js'

// Every location, with every bench it can hold actually built.
function worlds() {
  const out = []
  // Home, before and after the garage is built (П2): the wing is reached
  // through a doorway, which is exactly the kind of geometry that fails silently.
  for (const rooms of [['flat'], ['flat', 'garage']]) {
    const base = createState()
    const state = {
      ...base, locationId: 'apartment', money: 99999, unlockedRooms: rooms,
      upgrades: { ...base.upgrades, benchLevel: 2 },
    }
    out.push([`apartment×${rooms.length}`, createWorld({ state, salesLog: [] },
      { now: 1e6, rng: () => 0.5, layout: layoutFor('apartment', state) })])
  }
  for (const halls of [['hall-1'], ['hall-1', 'hall-2'], ['hall-1', 'hall-2', 'hall-3']]) {
    const base = createState()
    const state = { ...base, locationId: 'factory', money: 99999, unlockedHalls: halls }
    out.push([`factory×${halls.length}`, createWorld({ state, salesLog: [] },
      { now: 1e6, rng: () => 0.5, layout: layoutFor('factory', state) })])
  }
  return out
}

// The same call the sim makes: snap both ends to walkable ground, then search.
function reaches(world, from, to) {
  const grid = world.navGrid
  const a = nearestWalkable(grid, from.x, from.y)
  const b = nearestWalkable(grid, to.x, to.y)
  if (!a || !b) return false
  const path = findPath(grid, a, b)
  return path !== null
}

describe('навігація — усе досяжне', () => {
  it('з місця появи можна дійти до кожної зони в кожній локації', () => {
    for (const [name, world] of worlds()) {
      const spawn = world.layout.spawns.player
      for (const zone of world.zones) {
        expect(reaches(world, spawn, zone), `${name}: ${zone.id}`).toBe(true)
      }
    }
  })

  it('з кожного посту робітника теж — інакше найм у цей цех нічого не дає', () => {
    for (const [name, world] of worlds()) {
      const byHall = world.layout.spawns.postsByHall ?? {}
      const posts = [
        ...Object.values(world.layout.spawns.posts ?? {}),
        ...Object.values(byHall).flatMap(h => Object.values(h)),
      ]
      for (const post of posts) {
        for (const zone of world.zones.filter(z => z.kind === 'bench')) {
          expect(reaches(world, post, zone), `${name}: пост → ${zone.id}`).toBe(true)
        }
      }
    }
  })

  it('вулиця сполучена з кімнатою — двері не замуровані', () => {
    for (const [name, world] of worlds()) {
      const door = world.layout.spawns.door
      const outside = { x: door.x, y: world.layout.street.y + 120 }
      expect(reaches(world, world.layout.spawns.player, outside), `${name}: двері`).toBe(true)
    }
  })

  it('жодне місце появи не стоїть усередині перешкоди', () => {
    for (const [name, world] of worlds()) {
      const spawn = world.layout.spawns.player
      const cell = worldToCell(world.navGrid, spawn.x, spawn.y)
      expect(isWalkable(world.navGrid, cell.cx, cell.cy), `${name}: спавн у стіні`).toBe(true)
    }
  })
})
