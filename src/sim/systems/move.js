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

// Дотик — не перекриття. Виштовхування ставить агента РІВНО на межу коробки, і
// без цього допуску наступний кадр читає ту межу то як «усередині», то як
// «зовні», залежно від того, як лягли дробові. Усередині — значить сусідня
// секція теж перекрита, і крок УЗДОВЖ перешкоди щоразу відкочується: персонаж
// прилипає до паркана й може відійти від нього лише назад.
//
// Стіни цього не показували, бо в них цілі розміри й дотик потрапляв рівно на
// строгу нерівність. Тобто на випадковість, а не на правило — тепер це правило.
const TOUCH_EPS = 0.01

function overlaps(agent, box) {
  return Math.abs(agent.x - box.cx) < agent.halfW + box.w / 2 - TOUCH_EPS &&
         Math.abs(agent.y - box.cy) < agent.halfH + box.h / 2 - TOUCH_EPS
}

// Крок, більший за сам крок, — це не розв'язання зіткнення.
//
// Виштовхування ставить агента до КРАЮ коробки, і для лобового удару це рівно
// те, що треба: він щойно вліз на дрібку й повертається на дрібку назад. Але та
// сама формула для коробки, ВЗДОВЖ якої він іде, дає край, що лежить за
// півсвіту: агент, який стоїть упритул до довгої перешкоди й рушає паралельно
// їй, перекриває її й далі — і його жбурляє в її протилежний кінець.
//
// Знайдено у дворі (Стадія 17): паркан тягнеться через увесь низ світу, і
// персонаж, що стояв біля нього й натискав убік, опинявся в протилежному
// кутку. Раніше не вилазило тільки тому, що всі стіни мають цілі розміри й
// дотик виходив точно на межі порівняння в `overlaps`, а паркан має дробову
// висоту й лягає всередину.
//
// Перевірка не на «чи торкався до того» (це та сама межа порівняння, тільки з
// іншого боку, і на ній зіткнення починає протікати), а на ВЕЛИЧИНУ: зіткнення,
// спричинене кроком, розв'язується в межах цього кроку. Усе, що більше, —
// коробка, повз яку йдуть, а не в яку врізались.
const RESOLVE_SLACK = 0.5

function moveAxis(agent, obstacles, axis, delta) {
  if (delta === 0) return
  const before = agent[axis]
  agent[axis] += delta
  const budget = Math.abs(delta) + RESOLVE_SLACK

  for (const box of obstacles) {
    if (!overlaps(agent, box)) continue
    const pushed = axis === 'x'
      ? (delta > 0 ? box.x - agent.halfW : box.x + box.w + agent.halfW)
      : (delta > 0 ? box.y - agent.halfH : box.y + box.h + agent.halfH)
    if (Math.abs(pushed - before) > budget) continue
    agent[axis] = pushed
  }
}

// Steers an agent along its path, consuming waypoints as it reaches them.
// Runs before integration so a path-following agent and a player-driven one go
// through exactly the same collision code afterwards.
function followPath(agent) {
  // No route: a path-driven character stands still. Returning here without
  // clearing the velocity left the LAST heading in place, so a worker that
  // finished (or lost) its route kept sliding across the room at full speed —
  // which is how a technician drifted out of the bench zone it was holding.
  if (!agent.path || agent.pathIndex >= agent.path.length) {
    if (agent.kind !== 'player') { agent.vx = 0; agent.vy = 0 }
    return
  }

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
  // Someone working a spot is an anchor: they still push others aside, but do
  // not get pushed themselves. Without this a technician is slowly shunted out
  // of the bench zone by passing colleagues and the station stops (C7).
  if (agent.holdZone) return

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

  // The cat is not in the crowd: people walk through it rather than round it.
  // A cat you trip over is a cat you want deleted.
  const crowd = agents.filter(a => a.kind !== 'cat')

  for (const agent of agents) {
    followPath(agent)
    if (agent.kind !== 'cat' && crowd.length > 1) separate(agent, crowd)

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
