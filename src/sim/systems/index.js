// System registry — order matters and is part of the contract.
//
//   intent   → input vector becomes agent velocity
//   delivery → notices arrivals, so the worker can react to them in the same tick
//   belt     → moves arrived boxes along the conveyor and drops them off (F3)
//   job      → derives the board of work from the world
//   agent    → hired workers claim jobs and run their step scripts
//   cat      → the one agent with no job at all; before path, so a stroll it
//              decided on this tick is routed on this tick (V5)
//   path     → plans routes for agents that asked for one
//   move     → follows the route, separates agents, resolves collisions
//   promote  → rebuilds the zones that follow workers around (F5)
//   zone     → occupancy and dwell progress (detection only)
//   interact → applies whatever a zone decided should fire
//   station  → advances assembly on the bench
//
// C2–C5 insert job/path/zone/interaction systems into this list; nothing else in
// the codebase needs to know they exist.

import { intentSystem }   from './intent.js'
import { deliverySystem } from './delivery.js'
import { beltSystem }     from './belt.js'
import { jobSystem }      from './job.js'
import { agentSystem }    from './agent.js'
import { pathSystem }        from './path.js'
import { moveSystem }        from './move.js'
import { catSystem }         from './cat.js'
import { promoteZoneSystem } from './promote.js'
import { zoneSystem }        from './zone.js'
import { interactionSystem } from './interaction.js'
import { stationSystem }     from './station.js'

export const SYSTEMS = Object.freeze([
  intentSystem,
  deliverySystem,
  beltSystem,
  jobSystem,
  agentSystem,
  catSystem,
  pathSystem,
  moveSystem,
  promoteZoneSystem,
  zoneSystem,
  interactionSystem,
  stationSystem,
])
