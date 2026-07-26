// Conveyor — the factory's answer to "who walks the box across three halls".
//
// A courier crossing 5000 world units per kit is twenty seconds of walking
// animation for one drone, and making the halls smaller is not an option: the
// halls ARE the progression. So the long haul stops being someone's errand.
// The belt carries the box past every hall and drops it at the first one that
// can actually use it; a courier only ever does the last few metres (F3).
//
// Deliberately not pathfinding, not collision, not an agent: a box on the belt
// is a distance along a line. The whole model is `t += speed × dt`.
//
// Runtime, not saved — like the job board. `syncBelt` rebuilds it from the
// deliveries on the first tick after a load, so there is nothing to migrate and
// nothing that can disagree with the saved state.

import { DeliveryStatus, Phase, stationsOf } from '../../state/gameState.js'
import { CONVEYOR_SPEED, CONVEYOR_DROP_CAPACITY } from '../../state/config.js'
import { EV, emit } from '../events.js'

export const beltOf = (world) => world.layout?.conveyor ?? null

// Has this delivery arrived at the dock and not yet been carried off?
const onFloor = (d, now) =>
  d.status === DeliveryStatus.TRANSIT && d.readyAt <= now

// A box may leave the belt at a hall that has somewhere to put it and is not
// already holding a queue. Both halves matter: without the idle-station check
// every box piles into hall 1; without the capacity check a hall that has
// stalled swallows the entire order book.
function hallWillTake(world, drop) {
  const game = world.game
  const slots = (world.layout?.stationSlots ?? [])
  const ids = stationsOf(game)
    .filter((_, i) => slots[i]?.hallId === drop.hallId)
    .filter(s => s.phase === Phase.IDLE)
    .map(s => s.id)
  if (!ids.length) return false

  const waiting = (game.deliveries ?? []).filter(d => d.dropIndex === drop.index).length
  return waiting < CONVEYOR_DROP_CAPACITY
}

// Rebuild the belt's contents from the deliveries. Anything that has arrived
// and is not in someone's hands belongs somewhere on the belt: parked at its
// drop point if it already chose one, otherwise riding from the dock.
export function syncBelt(world) {
  const belt = beltOf(world)
  if (!belt) { world.belt = null; return }

  const items = world.belt?.items ?? []
  const live  = (world.game.deliveries ?? []).filter(d => onFloor(d, world.now))

  world.belt = {
    items: live.map(d => {
      const existing = items.find(i => i.deliveryId === d.id)
      if (existing) return existing
      const drop = belt.drops.find(dr => dr.index === d.dropIndex)
      return { deliveryId: d.id, t: drop ? drop.t : 0, dropIndex: d.dropIndex ?? null }
    }),
  }
}

export function beltSystem(world, dt, events) {
  const belt = beltOf(world)
  if (!belt) { world.belt = null; return }

  syncBelt(world)

  const step = (CONVEYOR_SPEED * dt) / 1000

  for (const item of world.belt.items) {
    if (item.dropIndex !== null) continue          // parked, waiting for a courier

    const from = item.t
    item.t = Math.min(belt.length, item.t + step)

    // Every drop the box passed this tick gets a chance at it, in order — so a
    // box never skips a hall that could have used it just because the tick was
    // long.
    for (const drop of belt.drops) {
      if (drop.t <= from || drop.t > item.t) continue
      if (!hallWillTake(world, drop)) continue

      item.dropIndex = drop.index
      item.t = drop.t
      world.game = {
        ...world.game,
        deliveries: (world.game.deliveries ?? []).map(d =>
          d.id === item.deliveryId ? { ...d, dropIndex: drop.index } : d),
      }
      emit(events, EV.BELT_DROPPED, { deliveryId: item.deliveryId, hallId: drop.hallId })
      emit(events, EV.STATE_DIRTY)
      break
    }
  }
}
