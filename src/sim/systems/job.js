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

// The zone a station's work happens in.
const stationZone = (world, stationId) =>
  (world.zones ?? []).find(z => z.kind === 'bench' && z.meta?.stationId === stationId)?.id

// The output side of a station — where a finished drone is collected (S1.2).
const stationOutZone = (world, stationId) =>
  (world.zones ?? []).find(z => z.kind === 'bench_out' && z.meta?.stationId === stationId)?.id ??
  stationZone(world, stationId)

const slotZone = (world, slotIndex) =>
  (world.zones ?? []).find(z => z.kind === 'delivery_slot' && z.meta?.slotIndex === slotIndex)?.id

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
  const nextTarget = () => targets.shift() ?? allStationIds[0]

  for (const d of inHand) {
    const toZone = stationZone(world, nextTarget())
    if (!toZone) continue
    jobs.push({
      id: `haul_delivery:${d.id}`,
      type: 'haul_delivery',
      deliveryId: d.id,
      fromZone: slotZone(world, d.slotIndex),
      toZone,
    })
  }

  // Only fetch a new box when there is somewhere to put it.
  for (const d of waiting) {
    if (!targets.length) break
    const fromZone = slotZone(world, d.slotIndex)
    const toZone   = stationZone(world, targets.shift())
    if (!fromZone || !toZone) continue
    jobs.push({
      id: `haul_delivery:${d.id}`,
      type: 'haul_delivery',
      deliveryId: d.id,
      fromZone,
      toZone,
    })
  }

  // 0. Somebody should go and order a kit (S3). One job at a time: two managers
  // walking to the same laptop for the same purchase would each place one.
  const deskZone = (world.zones ?? []).find(z => z.kind === 'desk')?.id
  if (deskZone && world.now >= (world.managerNextOrderAt ?? 0) && managerOrderChoice(game, 0)) {
    jobs.push({ id: 'order_kit:desk', type: 'order_kit', atZone: deskZone })
  }

  for (const station of stationsOf(game)) {
    // 1.5. A burnt bench wants clearing before anything else it could do.
    if (station.phase === Phase.BURNT) {
      const atZone = stationZone(world, station.id)
      if (atZone) {
        jobs.push({
          id: `clear_burnt:${station.id}`, type: 'clear_burnt', stationId: station.id, atZone,
        })
      }
    }

    // 2. A bench mid-assembly wants a technician.
    if (station.phase === Phase.ASSEMBLY) {
      const atZone = stationZone(world, station.id)
      if (atZone) {
        jobs.push({ id: `assemble:${station.id}`, type: 'assemble', stationId: station.id, atZone })
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
      const fromZone = stationOutZone(world, station.id)
      const toZone   = (world.zones ?? []).find(z => z.kind === 'mailbox')?.id
      if (fromZone && toZone) {
        jobs.push({
          id: `sell_drone:${station.id}`,
          type: 'sell_drone',
          stationId: station.id,
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
