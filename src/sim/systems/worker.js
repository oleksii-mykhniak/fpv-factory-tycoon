// Worker system — decides what the worker *should* be doing.
//
// Replaces the command calls that used to live inside main.js draw() (a render
// function issuing gameplay commands, re-entering itself through update()).
// Here the decision is state, not a call: `world.worker.desired` is projected by
// the view every frame and applied idempotently to the puppet.
//
// C5 replaces this with the job-board driven AI. The view contract
// (`desired` + `targetSlotIndex`) is what stays.

import { Phase, DeliveryStatus, pickupDelivery } from '../../state/gameState.js'
import { levelData, WORKER_MODE } from '../../state/upgrades.js'
import { EV, emit } from '../events.js'

export function workerSystem(world, _dt, events) {
  const game = world.game
  const mode = levelData('worker', game.upgrades.workerLevel ?? 0).mode
  const deliveries = game.deliveries ?? []

  world.worker.desired = null

  // Something already in hand always wins — never interrupt a carry.
  const carrying = deliveries.find(d => d.status === DeliveryStatus.CARRYING)
  if (carrying) {
    world.worker.targetSlotIndex = carrying.slotIndex
    world.worker.desired = 'haul'
    return
  }

  if (game.phase === Phase.IDLE && mode !== WORKER_MODE.MANUAL) {
    const arrived = deliveries.find(
      d => d.status === DeliveryStatus.TRANSIT && d.readyAt <= world.now
    )
    if (arrived) {
      world.game = pickupDelivery(world.game, arrived.id, world.now)
      world.worker.targetSlotIndex = arrived.slotIndex
      world.worker.desired = 'haul'
      emit(events, EV.DELIVERY_PICKED, { id: arrived.id, kitId: arrived.kitId, slotIndex: arrived.slotIndex })
      emit(events, EV.STATE_DIRTY)
      return
    }
  }

  if (game.phase === Phase.ASSEMBLY && mode === WORKER_MODE.AUTO) {
    world.worker.desired = 'solder'
    return
  }

  if (game.phase === Phase.IDLE && game.scrapAvailable) {
    world.worker.desired = 'scrap'
  }
}
