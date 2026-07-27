// Floor plans, one per location.
//
// Moving house used to change two colours (D7). A location is now a different
// room: bigger, with more bench slots and its own arrangement — which is what
// makes the move feel like progress rather than a palette swap.
//
// Neither of the two remaining plans is a constant any more: both grow from
// what has been bought — the flat by rooms (П2), the factory by halls (F2).

import { buildApartmentLayout } from './apartment.js'
import { buildFactoryLayout } from './factory.js'

export function layoutFor(locationId, state = null) {
  if (locationId === 'factory') return buildFactoryLayout(state?.unlockedHalls)
  return buildApartmentLayout(state?.unlockedRooms)
}

export { rect } from './buildLayout.js'
export { buildApartmentLayout } from './apartment.js'
