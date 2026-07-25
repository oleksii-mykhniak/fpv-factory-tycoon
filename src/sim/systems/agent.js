// Agent system — runs the step script of whatever job a worker has claimed.
//
// This replaces scene/worker.js: a puppet with one hand-written Excalibur
// action chain per errand, plus a state in workerFSM.js for every one of them.
// Adding "take the scrap to the store room" cost three files there. Here it
// costs one entry in defs/tasks.js.
//
// The interpreter is deliberately tiny. Almost nothing happens in the ops —
// walking into a trigger zone is what actually picks things up and puts them
// down, exactly as it does for the player.

import { Phase, stationsOf } from '../../state/gameState.js'
import { taskDef } from '../../defs/tasks.js'
import { roleDef, roleLevelData } from '../../defs/roles.js'
import { WANDER_RADIUS, WANDER_PAUSE_MS } from '../../state/config.js'
import { stopPath } from './path.js'
import { EV, emit } from '../events.js'

// ── Claiming ──────────────────────────────────────────────

// Nearest wins, weighted by priority: a finished drone that pays out beats a
// box that only starts one, even if the box is closer.
function pickJob(world, agent) {
  const accepts = roleDef(agent.role).accepts
  let best = null
  let bestScore = Infinity

  for (const job of world.jobs ?? []) {
    if (job.claimedBy || !accepts.includes(job.type)) continue
    const zone = zoneById(world, job.fromZone ?? job.atZone)
    if (!zone) continue
    const d = Math.hypot(zone.cx - agent.x, zone.cy - agent.y)
    const score = d / Math.max(job.priority, 1)
    if (score < bestScore) { bestScore = score; best = job }
  }
  return best
}

const zoneById = (world, id) => (world.zones ?? []).find(z => z.id === id)

// ── Step conditions ───────────────────────────────────────

const CONDITIONS = {
  carrying:    (world, agent) => (agent.carrying ?? []).length > 0,
  notCarrying: (world, agent) => (agent.carrying ?? []).length === 0,

  // The bench is finished (or was cleared by someone else) — either way the
  // technician's shift there is over.
  stationIdleOrDone: (world, agent, job) => {
    const station = stationsOf(world.game).find(s => s.id === job.stationId)
    return !station || station.phase !== Phase.ASSEMBLY
  },
}

// ── Interpreter ───────────────────────────────────────────

function release(world, agent, reason, events) {
  const job = (world.jobs ?? []).find(j => j.id === agent.task?.jobId)
  if (job && job.claimedBy === agent.id) job.claimedBy = null
  if (agent.task) emit(events, EV.JOB_RELEASED, { agentId: agent.id, jobId: agent.task.jobId, reason })
  agent.task = null
  stopPath(agent)
}

function runStep(world, agent, dt, events) {
  const job = (world.jobs ?? []).find(j => j.id === agent.task.jobId)
  if (!job) { release(world, agent, 'job-vanished', events); return }

  const def = taskDef(job.type)
  let step = def.steps[agent.task.stepIndex]
  if (!step) { release(world, agent, 'finished', events); return }

  // Resuming a haul that is already half done: the box is in hand, so the trip
  // to the street slot is behind us.
  if (agent.task.stepIndex === 0 && job.type === 'haul_delivery' && (agent.carrying ?? []).length) {
    agent.task.stepIndex = 2
    stopPath(agent)
  }

  step = def.steps[agent.task.stepIndex]
  if (!step) { release(world, agent, 'finished', events); return }

  switch (step.op) {
    case 'goto': {
      const zone = zoneById(world, resolveRef(step.zone, job))
      if (!zone) { release(world, agent, 'no-zone', events); return }

      if (!agent.pathTarget) {
        agent.pathTarget = { x: zone.cx, y: zone.cy }
        agent.arrived = false
        return
      }
      // The route is impossible — give the job back rather than jitter forever.
      if (agent.pathFailed) { release(world, agent, 'unreachable', events); return }
      if (agent.arrived) {
        stopPath(agent)
        agent.task.stepIndex++
        agent.task.waited = 0
      }
      return
    }

    case 'waitFor': {
      agent.task.waited = (agent.task.waited ?? 0) + dt
      const cond = CONDITIONS[step.cond]
      if (cond?.(world, agent, job)) {
        agent.task.stepIndex++
        agent.task.waited = 0
        return
      }
      // A zone that never fires (the player got there first) must not strand
      // the worker on the spot for the rest of the session.
      if (step.timeoutMs && agent.task.waited >= step.timeoutMs) {
        release(world, agent, 'timeout', events)
      }
      return
    }

    case 'done':
      release(world, agent, 'finished', events)
      return

    default:
      release(world, agent, `unknown-op:${step.op}`, events)
  }
}

// ── Idle drifting ─────────────────────────────────────────
//
// A worker with nothing to do stands frozen unless told otherwise, and a shop
// full of statues reads as broken. Wandering costs one path request every few
// seconds.
function idleWander(world, agent, dt) {
  agent.idleMs = (agent.idleMs ?? 0) + dt
  if (agent.path || agent.pathTarget) return
  if (agent.idleMs < WANDER_PAUSE_MS) return

  agent.idleMs = 0
  const home = world.layout?.spawns?.workerIdle ?? { x: agent.x, y: agent.y }
  const angle = world.rng() * Math.PI * 2
  const r = world.rng() * WANDER_RADIUS
  agent.pathTarget = { x: home.x + Math.cos(angle) * r, y: home.y + Math.sin(angle) * r }
  agent.arrived = false
}

export function agentSystem(world, dt, events) {
  for (const agent of world.agents ?? []) {
    if (agent.kind !== 'worker') continue
    // An agent with no role cannot be on anyone's payroll — skip rather than
    // throw, so one bad entry never takes the whole tick down with it.
    if (!agent.role) continue

    // Keep the agent's speed in step with its role level.
    agent.speed = roleLevelData(agent.role, agent.level ?? 0).speed

    if (!agent.task) {
      const job = pickJob(world, agent)
      if (!job) { idleWander(world, agent, dt); continue }

      job.claimedBy = agent.id
      agent.task = { jobId: job.id, stepIndex: 0, waited: 0 }
      agent.idleMs = 0
      stopPath(agent)
      emit(events, EV.JOB_CLAIMED, { agentId: agent.id, jobId: job.id, type: job.type })
    }

    runStep(world, agent, dt, events)
  }
}

function resolveRef(ref, job) {
  if (typeof ref !== 'string' || !ref.startsWith('job.')) return ref
  return job[ref.slice(4)]
}
