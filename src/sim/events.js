// Event types emitted by systems / commands and consumed by the view layer.
//
// Events are one-shot facts about something that just happened ("a sale was
// made"), not state ("phase is READY"). State lives in `world` and the view
// projects it every frame; events drive the things a projection cannot express
// on its own — sounds, haptics, toasts, floating coins.
//
// Adding a new event = adding a key here + a handler in view/effects.js. No
// callback needs to be threaded through initScene().

export const EV = Object.freeze({
  // Deliveries
  DELIVERY_ORDERED: 'delivery.ordered',   // { kitId, slotIndex, readyAt }
  DELIVERY_ARRIVED: 'delivery.arrived',   // { id, kitId, slotIndex }
  DELIVERY_PICKED:  'delivery.picked',    // { id, kitId, slotIndex }

  // Station (workbench)
  STAGE_STARTED: 'station.stageStarted',  // { label, total, done, durationMs }
  STAGE_DONE:    'station.stageDone',     // { total, done, quality, auto? }
  STAGE_COLD:    'station.stageCold',     // { missMsg, auto? }
  ASSEMBLY_DONE: 'station.assemblyDone',  // { quality, price }
  KIT_BURNT:     'station.kitBurnt',      // { kitId }
  BENCH_CLEARED: 'station.benchCleared',  // { reason: 'sold' | 'abandoned' }

  // Economy
  MONEY_GAINED: 'money.gained',           // { amount, reason }
  MONEY_SPENT:  'money.spent',            // { amount, reason }
  SALE_MADE:    'sale.made',              // { kitId, quality, price }

  // Zones & carrying (C2)
  ZONE_ENTER:   'zone.enter',           // { zoneId, agentId }
  ZONE_EXIT:    'zone.exit',            // { zoneId, agentId }
  ZONE_FIRED:   'zone.fired',           // { zoneId, agentId, kind }
  ITEM_PICKED:  'item.picked',          // { agentId, item }
  ITEM_DROPPED: 'item.dropped',         // { agentId, item }

  // Hired workers (C5)
  JOB_CLAIMED:  'job.claimed',          // { agentId, jobId, type }
  JOB_RELEASED: 'job.released',         // { agentId, jobId, reason }
  WORKER_HIRED: 'worker.hired',         // { role, id }

  // Requests an interaction raises for the view/commands to complete
  SELL_REQUESTED:     'sell.requested',     // { agentId }
  MINIGAME_REQUESTED: 'minigame.requested', // { agentId, game }
  // A panel the player walked up to and asked for (S2): the shop desk, the
  // upgrade rack, the job board. Same shape as MINIGAME_REQUESTED — the sim
  // says what was asked for, the view decides how to answer.
  PANEL_REQUESTED: 'panel.requested',       // { agentId, panel }

  // Side activities
  PIGGY_COLLECTED: 'piggy.collected',     // { amount }
  SCRAP_REQUESTED: 'scrap.requested',     // {}
  SCRAP_STARTED:   'scrap.started',       // {}
  SCRAP_FAILED:    'scrap.failed',        // { consolation }

  // Meta
  UPGRADE_BOUGHT:   'upgrade.bought',     // { trackId, level }
  LOCATION_CHANGED: 'location.changed',   // { locationId }
  HALL_UNLOCKED:    'factory.hallOpened', // { hallId }
  ROOM_UNLOCKED:    'home.roomOpened',    // { roomId }
  BELT_DROPPED:     'belt.dropped',       // { deliveryId, hallId }
  WORKER_PROMOTED:  'worker.promoted',    // { workerId, role, level }
  COMMAND_REJECTED: 'command.rejected',   // { type, reason }
  STATE_DIRTY:      'state.dirty',        // {} — view/persistence should save
})

// Small helper so systems read as `emit(events, EV.X, { … })`.
export function emit(events, type, payload = {}) {
  events.push({ t: type, ...payload })
  return events
}
