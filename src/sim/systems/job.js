// Job board — what the shop needs doing right now.
//
// Jobs are DERIVED from the world, never accumulated (plan §6.5). deriveJobs()
// looks at deliveries and stations and returns the set of work that ought to
// exist; reconcile() merges that with the board, keeping claims alive. The
// consequence is that the board needs no persistence and no migration: after a
// reload it rebuilds itself correctly on the first tick.

import { Phase, DeliveryStatus, stationsOf } from '../../state/gameState.js'
import { taskDef } from '../../defs/tasks.js'

// The zone a station's work happens in.
const stationZone = (world, stationId) =>
  (world.zones ?? []).find(z => z.meta?.stationId === stationId)?.id

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

  for (const station of stationsOf(game)) {
    // 2. A bench mid-assembly wants a technician.
    if (station.phase === Phase.ASSEMBLY) {
      const atZone = stationZone(world, station.id)
      if (atZone) {
        jobs.push({ id: `assemble:${station.id}`, type: 'assemble', stationId: station.id, atZone })
      }
    }

    // 3. A finished drone wants taking to the mailbox.
    if (station.phase === Phase.READY) {
      const fromZone = stationZone(world, station.id)
      const toZone   = (world.zones ?? []).find(z => z.kind === 'mailbox')?.id
      if (fromZone && toZone) {
        jobs.push({
          id: `sell_drone:${station.id}`,
          type: 'sell_drone',
          stationId: station.id,
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
