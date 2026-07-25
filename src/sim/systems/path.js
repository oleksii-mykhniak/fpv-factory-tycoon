// Path system — turns "I want to be over there" into a list of waypoints.
//
// Agents ask by setting `agent.pathTarget`; this system answers at most
// PATHS_PER_TICK times per tick. A* is the most expensive thing in the sim on a
// low-end phone, and a crowd of workers all re-planning in the same frame is
// exactly how an idle game starts stuttering.
//
// Results are cached by (fromCell → toCell). Journeys in a factory repeat
// constantly — bench to mailbox, slot to bench — so the cache hit rate is high
// and the invalidation rule is simple: throw it all away when the grid changes.

import { PATHS_PER_TICK, PATH_CACHE_SIZE, STUCK_TIMEOUT_MS } from '../../state/config.js'
import { findPath, smoothPath } from '../../nav/astar.js'
import { cellToWorld, nearestWalkable } from '../../nav/navGrid.js'

export function clearPathCache(world) {
  world.pathCache = new Map()
}

function cacheKey(from, to) {
  return `${from.cx},${from.cy}>${to.cx},${to.cy}`
}

// Plans a route for one agent. Returns true when a path was produced.
// Exported so C5's AI can force a re-plan without waiting for the budget.
export function planPath(world, agent) {
  const grid = world.navGrid
  const target = agent.pathTarget
  if (!grid || !target) return false

  // Both ends may sit inside inflated geometry — a work spot is pressed right
  // against its station by design. Snap to the nearest free cell instead of
  // failing, which is what a person would do.
  const from = nearestWalkable(grid, agent.x, agent.y)
  const to   = nearestWalkable(grid, target.x, target.y)
  if (!from || !to) { agent.path = null; agent.pathFailed = true; return false }

  const key = cacheKey(from, to)
  world.pathCache ??= new Map()

  let cells = world.pathCache.get(key)
  if (cells === undefined) {
    const raw = findPath(grid, from, to)
    cells = raw ? smoothPath(grid, raw) : null
    if (world.pathCache.size >= PATH_CACHE_SIZE) {
      // Cheapest useful eviction: drop the oldest insertion.
      world.pathCache.delete(world.pathCache.keys().next().value)
    }
    world.pathCache.set(key, cells)
  }

  if (!cells) { agent.path = null; agent.pathFailed = true; return false }

  // Waypoints in world space. The final one is the exact target rather than a
  // cell centre, so an agent lands on the spot it was asked for.
  const points = cells.map(c => cellToWorld(grid, c.cx, c.cy))
  points[points.length - 1] = { x: target.x, y: target.y }

  agent.path       = points
  agent.pathIndex  = 0
  agent.pathFailed = false
  agent.stuckMs    = 0
  agent.lastX      = agent.x
  agent.lastY      = agent.y
  return true
}

export function pathSystem(world, dt) {
  let budget = PATHS_PER_TICK

  // Round-robin start, so the budget cannot be monopolised by whoever happens
  // to sit first in the list: with a fixed start the last agent in a busy shop
  // could wait forever for a route.
  const agents = world.agents ?? []
  if (agents.length) {
    world.pathCursor = ((world.pathCursor ?? 0) + 1) % agents.length
  }
  const order = agents.length
    ? [...agents.slice(world.pathCursor), ...agents.slice(0, world.pathCursor)]
    : agents

  for (const agent of order) {
    if (!agent.pathTarget) {
      agent.path = null
      continue
    }

    // Needs a plan: never had one, or the target moved.
    const needsPlan = !agent.path && !agent.pathFailed
    if (needsPlan) {
      if (budget <= 0) continue
      budget--
      planPath(world, agent)
      continue
    }

    if (!agent.path) continue

    // Stuck detection: following a path but not actually moving. Usually two
    // agents jammed in a doorway; re-planning breaks the symmetry.
    const moved = Math.abs(agent.x - (agent.lastX ?? agent.x)) +
                  Math.abs(agent.y - (agent.lastY ?? agent.y))
    agent.lastX = agent.x
    agent.lastY = agent.y

    if (moved < 0.5) {
      agent.stuckMs = (agent.stuckMs ?? 0) + dt
      if (agent.stuckMs >= STUCK_TIMEOUT_MS && budget > 0) {
        budget--
        agent.stuckMs = 0
        // Drop the cached route as well: it is the one that is not working.
        world.pathCache?.delete(cacheKey(
          nearestWalkable(world.navGrid, agent.x, agent.y) ?? { cx: -1, cy: -1 },
          nearestWalkable(world.navGrid, agent.pathTarget.x, agent.pathTarget.y) ?? { cx: -1, cy: -1 },
        ))
        planPath(world, agent)
      }
    } else {
      agent.stuckMs = 0
    }
  }
}

// Clears an agent's route. Called when its task changes.
export function stopPath(agent) {
  agent.pathTarget = null
  agent.path       = null
  agent.vx         = 0
  agent.vy         = 0
  agent.pathFailed = false
  agent.stuckMs    = 0
}
