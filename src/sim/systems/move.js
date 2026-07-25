// Movement system — integrates agent velocity and resolves collisions.
//
// Collision is solved here rather than by Excalibur's physics on purpose (see
// plan §6.2): the sim must produce the same result headless as it does on
// screen, so a 10-minute simulated run in a test is worth something. It also
// keeps agents free of engine types before C4/C5 add pathfinding and workers.
//
// Axis-separated AABB resolution: move on X, push out of anything overlapped,
// then the same on Y. Solving both at once makes a character stick on corners.

import { MOVE_MAX_STEP } from '../../state/config.js'

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

export function moveSystem(world, dt) {
  const seconds   = dt / 1000
  const obstacles = world.obstacles ?? []
  const bounds    = world.bounds

  for (const agent of world.agents ?? []) {
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
