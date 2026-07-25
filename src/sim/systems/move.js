// Movement system — integrates agent velocity and resolves collisions.
//
// Collision is solved here rather than by Excalibur's physics on purpose (see
// plan §6.2): the sim must produce the same result headless as it does on
// screen, so a 10-minute simulated run in a test is worth something. It also
// keeps agents free of engine types before C4/C5 add pathfinding and workers.
//
// Axis-separated AABB resolution: move on X, push out of anything overlapped,
// then the same on Y. Solving both at once makes a character stick on corners.

import {
  MOVE_MAX_STEP, WAYPOINT_ARRIVE_R,
  AGENT_SEPARATION_R, AGENT_SEPARATION_W,
} from '../../state/config.js'

function overlaps(agent, box) {
  return Math.abs(agent.x - box.cx) < agent.halfW + box.w / 2 &&
         Math.abs(agent.y - box.cy) < agent.halfH + box.h / 2
}

function moveAxis(agent, obstacles, axis, delta) {
  if (delta === 0) return
  agent[axis] += delta

  for (const box of obstacles) {
    if (!overlaps(agent, box)) continue
    if (axis === 'x') {
      agent.x = delta > 0 ? box.x - agent.halfW : box.x + box.w + agent.halfW
    } else {
      agent.y = delta > 0 ? box.y - agent.halfH : box.y + box.h + agent.halfH
    }
  }
}

// Steers an agent along its path, consuming waypoints as it reaches them.
// Runs before integration so a path-following agent and a player-driven one go
// through exactly the same collision code afterwards.
function followPath(agent) {
  if (!agent.path || agent.pathIndex >= agent.path.length) return

  let target = agent.path[agent.pathIndex]
  // Skip any waypoints already satisfied — a smoothed path can pass close to
  // several at once.
  while (target && Math.hypot(target.x - agent.x, target.y - agent.y) <= WAYPOINT_ARRIVE_R) {
    agent.pathIndex++
    target = agent.path[agent.pathIndex]
  }

  if (!target) {
    // Arrived. The AI (C5) decides what happens next; movement just stops.
    agent.path = null
    agent.vx = 0
    agent.vy = 0
    agent.arrived = true
    return
  }

  const dx = target.x - agent.x
  const dy = target.y - agent.y
  const d  = Math.hypot(dx, dy) || 1
  agent.vx = (dx / d) * agent.speed
  agent.vy = (dy / d) * agent.speed
  agent.facing = dx > 0 ? 1 : dx < 0 ? -1 : agent.facing
  agent.arrived = false
}

// Soft separation: agents push each other apart instead of reserving cells.
// Reservation deadlocks a crowd this size (plan §6.6) — two workers claiming
// the doorway would both wait forever. A nudge costs nothing and always
// resolves, at the price of slightly imperfect paths.
function separate(agent, agents) {
  let sx = 0, sy = 0
  for (const other of agents) {
    if (other === agent) continue
    const dx = agent.x - other.x
    const dy = agent.y - other.y
    const d  = Math.hypot(dx, dy)
    if (d === 0 || d > AGENT_SEPARATION_R) continue
    const push = (AGENT_SEPARATION_R - d) / AGENT_SEPARATION_R
    sx += (dx / d) * push
    sy += (dy / d) * push
  }
  if (sx === 0 && sy === 0) return
  agent.vx += sx * agent.speed * AGENT_SEPARATION_W
  agent.vy += sy * agent.speed * AGENT_SEPARATION_W
}

export function moveSystem(world, dt) {
  const seconds   = dt / 1000
  const obstacles = world.obstacles ?? []
  const bounds    = world.bounds
  const agents    = world.agents ?? []

  for (const agent of agents) {
    followPath(agent)
    if (agents.length > 1) separate(agent, agents)

    if (!agent.vx && !agent.vy) { agent.moving = false; continue }

    const beforeX = agent.x
    const beforeY = agent.y
    const dx = agent.vx * seconds
    const dy = agent.vy * seconds

    // Resolution is discrete, so a single large displacement would jump clean
    // over a thin wall and find nothing to collide with. Split it up.
    const substeps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / MOVE_MAX_STEP))
    for (let i = 0; i < substeps; i++) {
      moveAxis(agent, obstacles, 'x', dx / substeps)
      moveAxis(agent, obstacles, 'y', dy / substeps)
    }

    if (bounds) {
      agent.x = Math.min(Math.max(agent.x, agent.halfW), bounds.w - agent.halfW)
      agent.y = Math.min(Math.max(agent.y, agent.halfH), bounds.h - agent.halfH)
    }

    // "Moving" means actually displaced — a character shoving into a wall should
    // not play a walk cycle on the spot.
    agent.moving = Math.abs(agent.x - beforeX) > 0.01 || Math.abs(agent.y - beforeY) > 0.01
  }
}
