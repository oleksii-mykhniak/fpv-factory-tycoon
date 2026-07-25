// Fixed-timestep simulation loop.
//
// One call site (view/engine preupdate) drives everything. Systems run in a
// fixed order, every step is exactly TICK_MS, so the same inputs always produce
// the same world — which is what makes the sim testable in Node and offline
// progress a matter of calling advance() with a large targetNow.

import { TICK_MS, MAX_CATCHUP_STEPS } from '../state/config.js'

// Advances `world` up to `targetNow` and returns the events produced.
// Mutates world in place (systems own their slice; see systems/index.js).
export function advance(world, targetNow, systems) {
  const events = []
  const elapsed = targetNow - world.now
  if (elapsed <= 0) return events

  const wanted = Math.floor(elapsed / TICK_MS)
  const steps  = Math.min(wanted, MAX_CATCHUP_STEPS)

  for (let i = 0; i < steps; i++) {
    world.now += TICK_MS
    for (const sys of systems) sys(world, TICK_MS, events)
  }

  // When catch-up was capped we skip the dropped time rather than falling
  // permanently behind wall time — otherwise absolute deadlines (delivery
  // readyAt, piggy cooldown) would never come due after a long background.
  if (wanted > steps) world.now = targetNow

  return events
}
