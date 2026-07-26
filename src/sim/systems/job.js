// Job board — what the shop needs doing right now.
//
// Jobs are DERIVED from the world, never accumulated (plan §6.5). deriveJobs()
// looks at deliveries and stations and returns the set of work that ought to
// exist; reconcile() merges that with the board, keeping claims alive. The
// consequence is that the board needs no persistence and no migration: after a
// reload it rebuilds itself correctly on the first tick.

import { Phase, DeliveryStatus, stationsOf } from '../../state/gameState.js'
import { taskDef } from '../../defs/tasks.js'
import { managerOrderChoice } from '../derive.js'

// Which hall a station stands in, when the layout has halls (F2).
const stationHall = (world, stationId) => {
  const i = stationsOf(world.game).findIndex(s => s.id === stationId)
  return world.layout?.stationSlots?.[i]?.hallId ?? null
}

// The zone a station's work happens in.
const stationZone = (world, stationId) =>
  (world.zones ?? []).find(z => z.kind === 'bench' && z.meta?.stationId === stationId)?.id

// The post box this hall ships from. Each hall has its own (F4): a seller bound
// to hall 3 carrying every drone back to hall 1 would be exactly the walk the
// conveyor was built to delete.
const mailboxZone = (world, hallId) => {
  const boxes = (world.zones ?? []).filter(z => z.kind === 'mailbox')
  return (hallId && boxes.find(z => z.meta?.hallId === hallId))?.id ?? boxes[0]?.id
}

// The output side of a station — where a finished drone is collected (S1.2).
const stationOutZone = (world, stationId) =>
  (world.zones ?? []).find(z => z.kind === 'bench_out' && z.meta?.stationId === stationId)?.id ??
  stationZone(world, stationId)

const slotZone = (world, slotIndex) =>
  (world.zones ?? []).find(z => z.kind === 'delivery_slot' && z.meta?.slotIndex === slotIndex)?.id

// Where this box is standing right now: a street slot, or the belt drop the
// conveyor left it at (F3). A box still riding the belt has NO pickup zone, and
// that is the whole gate — no job exists for it, so no courier sets off to meet
// a box that has not arrived anywhere yet.
const pickupZone = (world, delivery) =>
  delivery.dropIndex !== undefined && delivery.dropIndex !== null
    ? (world.zones ?? []).find(
        z => z.kind === 'belt_drop' && z.meta?.dropIndex === delivery.dropIndex)?.id
    : slotZone(world, delivery.slotIndex)

// Stable ids: the same situation always produces the same job id, which is what
// lets reconcile() recognise a job it has already handed out.
export function deriveJobs(world) {
  const game = world.game
  const jobs = []

  const allStationIds = stationsOf(game).map(s => s.id)
  const freeStationIds = stationsOf(game)
    .filter(s => s.phase === Phase.IDLE)
    .map(s => s.id)

  // 1. Hauling a box, in two halves that must look like ONE job.
  //
  // The first version derived the job from "a box is waiting in the street",
  // which meant picking the box up destroyed the very condition that created
  // the job: the courier was released mid-errand and stood holding it forever.
  // A haul job therefore lives as long as the delivery does, in either state.
  const deliveries = game.deliveries ?? []
  const inHand = deliveries.filter(
    d => d.status === DeliveryStatus.CARRYING && d.carriedBy && d.carriedBy !== 'player'
  )
  const waiting = deliveries.filter(
    d => d.status === DeliveryStatus.TRANSIT && d.readyAt <= world.now
  )

  const targets = [...freeStationIds]
  // A box already in hand keeps its errand whether or not a bench is free —
  // the carrier waits at one until it clears, which is what a person would do.
  //
  // Given a choice, send it to a bench in the hall the belt chose. Without this
  // the belt's whole purpose leaks away: a box dropped at hall 3 could be
  // assigned to a bench in hall 1 and walked back across the factory.
  const nextTarget = (delivery) => {
    const hall = (world.layout?.conveyor?.drops ?? [])
      .find(dr => dr.index === delivery?.dropIndex)?.hallId ?? null
    const i = hall ? targets.findIndex(id => stationHall(world, id) === hall) : -1
    if (i >= 0) return targets.splice(i, 1)[0]
    return targets.shift() ?? allStationIds[0]
  }

  for (const d of inHand) {
    const target = nextTarget(d)
    const toZone = stationZone(world, target)
    if (!toZone) continue
    jobs.push({
      id: `haul_delivery:${d.id}`,
      type: 'haul_delivery',
      deliveryId: d.id,
      fromZone: pickupZone(world, d),
      toZone,
    })
  }

  // Only fetch a new box when there is somewhere to put it.
  for (const d of waiting) {
    if (!targets.length) break
    const fromZone = pickupZone(world, d)
    const target   = nextTarget(d)
    const toZone   = stationZone(world, target)
    if (!fromZone || !toZone) continue
    jobs.push({
      id: `haul_delivery:${d.id}`,
      type: 'haul_delivery',
      deliveryId: d.id,
      hallId: stationHall(world, target),
      fromZone,
      toZone,
    })
  }

  // 0. Somebody should go and order a kit (S3). One job at a time: two managers
  // walking to the same laptop for the same purchase would each place one.
  const deskZone = (world.zones ?? []).find(z => z.kind === 'desk')?.id
  if (deskZone && world.now >= (world.managerNextOrderAt ?? 0) && managerOrderChoice(game, 0)) {
    // The laptop serves the whole factory, so this job belongs to no hall and
    // any manager may take it.
    jobs.push({ id: 'order_kit:desk', type: 'order_kit', atZone: deskZone, hallId: null })
  }

  for (const station of stationsOf(game)) {
    // 1.5. A burnt bench wants clearing before anything else it could do.
    if (station.phase === Phase.BURNT) {
      const atZone = stationZone(world, station.id)
      if (atZone) {
        jobs.push({
          id: `clear_burnt:${station.id}`, type: 'clear_burnt', stationId: station.id, atZone,
          hallId: stationHall(world, station.id),
        })
      }
    }

    // 2. A bench mid-assembly wants a technician.
    if (station.phase === Phase.ASSEMBLY) {
      const atZone = stationZone(world, station.id)
      if (atZone) {
        jobs.push({
          id: `assemble:${station.id}`, type: 'assemble', stationId: station.id, atZone,
          hallId: stationHall(world, station.id),
        })
      }
    }

    // 3. A finished drone wants taking to the mailbox.
    //
    // Two halves of one errand, exactly like hauling a box: the drone waiting
    // on the output table, and the drone already in a seller's hands. Deriving
    // this from READY alone sent a second seller after an imaginary drone the
    // moment the first one (or the player) picked it up; deriving it only from
    // the untaken state would instead cancel the errand mid-walk.
    const takenByWorker = station.takenBy && station.takenBy !== 'player'
    if (station.phase === Phase.READY && (!station.takenBy || takenByWorker)) {
      const hallId   = stationHall(world, station.id)
      const fromZone = stationOutZone(world, station.id)
      const toZone   = mailboxZone(world, hallId)
      if (fromZone && toZone) {
        jobs.push({
          id: `sell_drone:${station.id}`,
          type: 'sell_drone',
          stationId: station.id,
          hallId,
          // A drone already in hand belongs to the one holding it: nobody else
          // may claim the errand and walk to an output table that is now empty.
          onlyAgent: takenByWorker ? station.takenBy : null,
          fromZone,
          toZone,
        })
      }
    }
  }

  return jobs.map(j => ({ ...j, priority: taskDef(j.type).priority }))
}

// Merges the desired set into the live board, preserving claims. Returns the
// ids of jobs that disappeared, so their worker can be told to stop.
export function reconcile(board, desired) {
  const byId = new Map(board.map(j => [j.id, j]))
  const next = desired.map(job => {
    const existing = byId.get(job.id)
    return existing ? { ...job, claimedBy: existing.claimedBy } : { ...job, claimedBy: null }
  })
  const keep = new Set(next.map(j => j.id))
  const dropped = board.filter(j => !keep.has(j.id)).map(j => j.id)
  return { next, dropped }
}

export function jobSystem(world) {
  // A worker whose job evaporated is handled by agentSystem: its `runStep`
  // already releases a task whose job is missing, and that path also clears the
  // half-finished route. Nulling the task here would skip that cleanup.
  world.jobs = reconcile(world.jobs ?? [], deriveJobs(world)).next
}
