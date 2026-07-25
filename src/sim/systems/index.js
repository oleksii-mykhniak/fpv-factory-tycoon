// System registry — order matters and is part of the contract.
//
//   intent   → input vector becomes agent velocity
//   delivery → notices arrivals, so the worker can react to them in the same tick
//   job      → derives the board of work from the world
//   agent    → hired workers claim jobs and run their step scripts
//   path     → plans routes for agents that asked for one
//   move     → follows the route, separates agents, resolves collisions
//   zone     → occupancy and dwell progress (detection only)
//   interact → applies whatever a zone decided should fire
//   station  → advances assembly on the bench
//
// C2–C5 insert job/path/zone/interaction systems into this list; nothing else in
// the codebase needs to know they exist.

import { intentSystem }   from './intent.js'
import { deliverySystem } from './delivery.js'
import { jobSystem }      from './job.js'
import { agentSystem }    from './agent.js'
import { pathSystem }        from './path.js'
import { moveSystem }        from './move.js'
import { zoneSystem }        from './zone.js'
import { interactionSystem } from './interaction.js'
import { stationSystem }     from './station.js'

export const SYSTEMS = Object.freeze([
  intentSystem,
  deliverySystem,
  jobSystem,
  agentSystem,
  pathSystem,
  moveSystem,
  zoneSystem,
  interactionSystem,
  stationSystem,
])
