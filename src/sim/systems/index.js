// System registry — order matters and is part of the contract.
//
//   intent   → input vector becomes agent velocity
//   delivery → notices arrivals, so the worker can react to them in the same tick
//   worker   → claims an arrived delivery and publishes its intent
//   move     → integrates velocity and resolves collisions
//   zone     → occupancy and dwell progress (detection only)
//   interact → applies whatever a zone decided should fire
//   station  → advances assembly on the bench
//
// C2–C5 insert job/path/zone/interaction systems into this list; nothing else in
// the codebase needs to know they exist.

import { intentSystem }   from './intent.js'
import { deliverySystem } from './delivery.js'
import { workerSystem }   from './worker.js'
import { moveSystem }        from './move.js'
import { zoneSystem }        from './zone.js'
import { interactionSystem } from './interaction.js'
import { stationSystem }     from './station.js'

export const SYSTEMS = Object.freeze([
  intentSystem,
  deliverySystem,
  workerSystem,
  moveSystem,
  zoneSystem,
  interactionSystem,
  stationSystem,
])
