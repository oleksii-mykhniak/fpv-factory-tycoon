// System registry — order matters and is part of the contract.
//
//   delivery → notices arrivals, so the worker can react to them in the same tick
//   worker   → claims an arrived delivery and publishes its intent
//   station  → advances assembly on the bench
//
// C1–C5 insert intent/job/path/move/zone/interaction systems into this list;
// nothing else in the codebase needs to know they exist.

import { deliverySystem } from './delivery.js'
import { workerSystem }   from './worker.js'
import { stationSystem }  from './station.js'

export const SYSTEMS = Object.freeze([
  deliverySystem,
  workerSystem,
  stationSystem,
])
