// Delivery system — owns the transit → arrived edge.
//
// Replaces main.js scheduleDeliveryCheck()/deliveryCheckTimer. Deliveries carry
// an absolute readyAt, so there is nothing to accumulate: the system just
// notices the crossing once and announces it.

import { DeliveryStatus } from '../../state/gameState.js'
import { EV, emit } from '../events.js'

export function deliverySystem(world, _dt, events) {
  const deliveries = world.game.deliveries ?? []

  // Drop markers for deliveries that have since been picked up / consumed,
  // so the list cannot grow without bound over a long session.
  if (world.announcedArrivals.length) {
    world.announcedArrivals = world.announcedArrivals.filter(
      id => deliveries.some(d => d.id === id)
    )
  }

  for (const d of deliveries) {
    if (d.status !== DeliveryStatus.TRANSIT) continue
    if (d.readyAt > world.now) continue
    if (world.announcedArrivals.includes(d.id)) continue
    world.announcedArrivals.push(d.id)
    emit(events, EV.DELIVERY_ARRIVED, { id: d.id, kitId: d.kitId, slotIndex: d.slotIndex })
  }
}
