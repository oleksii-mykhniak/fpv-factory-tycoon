// Scene projection — world → Excalibur actors, every frame, one direction.
//
// Replaces updateScene(refs, phase, piggyInfo, droneSpriteKey, deliveries,
// carryingSlotIndex, scrapAvailable): a positional-argument function that grew
// by one parameter per feature because the scene kept its own copy of the state.
// Here the world is the argument, so new fields cost nothing.
//
// This module may read the world and drive actors. It must never write to the
// world — player intent goes through sim/commands.js dispatch().

import { Phase, DeliveryStatus, KIT_TYPES } from '../state/gameState.js'
import { getSprite } from '../scene/loader.js'

// Purely presentational memo: which sprite is on the drone actor right now, and
// which delivery the carry box was last positioned for. Neither is game state.
let _lastDroneSpriteKey = null
let _prevCarryingId     = null

function applySprite(actor, key) {
  const src = getSprite(key)
  if (!src) return
  const sprite = src.toSprite()
  sprite.width  = actor.width
  sprite.height = actor.height
  actor.graphics.use(sprite)
}

export function resetSceneSync() {
  _lastDroneSpriteKey = null
  _prevCarryingId     = null
}

export function syncScene(refs, world) {
  if (!refs?.box) return

  const game = world.game
  const { box, boxOpen, drone, worker, piggy, _pulses } = refs
  const carrying = (game.deliveries ?? []).find(d => d.status === DeliveryStatus.CARRYING)

  // ── Carry box position ─────────────────────────────────
  // On carry-start, move the box to the street slot it is being fetched from.
  if (carrying && carrying.id !== _prevCarryingId) {
    const slotPos = refs.slotSpawns[carrying.slotIndex]
    if (slotPos) {
      box.pos.x = slotPos.x
      box.pos.y = slotPos.y
    }
  }
  _prevCarryingId = carrying?.id ?? null

  // ── Piggy bank ─────────────────────────────────────────
  if (piggy) {
    const minCost   = Math.min(...Object.values(KIT_TYPES).filter(k => k.cost > 0).map(k => k.cost))
    const busy      = (game.deliveries ?? []).length > 0 || game.phase !== Phase.IDLE
    piggy.graphics.visible = game.money < minCost && !busy
  }

  // ── Drone sprite ───────────────────────────────────────
  const droneSpriteKey = game.activeKit ? (KIT_TYPES[game.activeKit]?.spriteKey ?? null) : null
  if (droneSpriteKey && droneSpriteKey !== _lastDroneSpriteKey) {
    applySprite(drone, droneSpriteKey)
    _lastDroneSpriteKey = droneSpriteKey
  }

  // ── Visibility ─────────────────────────────────────────
  const assembling = game.phase === Phase.ASSEMBLY || game.phase === Phase.READY
  box.graphics.visible     = !!carrying
  boxOpen.graphics.visible = assembling
  drone.graphics.visible   = assembling || game.phase === Phase.BURNT

  // ── Attention pulses ───────────────────────────────────
  if (_pulses) {
    _pulses.box.stop()
    _pulses.bench.stop()
    _pulses.mailbox.stop()
    _pulses.trashbin?.stop()

    if (carrying)                    _pulses.box.start()
    if (game.phase === Phase.ASSEMBLY) _pulses.bench.start()
    if (game.phase === Phase.READY) {
      _pulses.bench.start()
      _pulses.mailbox.start()
    }
    if (game.scrapAvailable && game.phase === Phase.IDLE) _pulses.trashbin?.start()
  }

  // Park the carry box off-screen when idle so an invisible actor cannot
  // intercept pointer events meant for the slot indicators below it.
  if (!carrying) {
    box.actions.clearActions()
    box.pos.x = -9999
    box.pos.y = -9999
  }

  // ── Player character (C1) ──────────────────────────────
  // The sim owns the position; the actor is told where it ended up.
  const player = (world.agents ?? []).find(a => a.kind === 'player')
  if (player && refs.player) {
    refs.player.pos.x = player.x
    refs.player.pos.y = player.y
    refs.playerRig?.setMoving(player.moving, player.facing > 0)
  }

  // ── Worker intent ──────────────────────────────────────
  applyWorkerIntent(refs, world)

  // Send the worker home between cycles — but never mid-carry: the phase stays
  // IDLE for the whole walk (it only flips on worker.atBench), so resetting on
  // phase alone would cancel an in-progress delivery.
  if (game.phase === Phase.IDLE && !carrying && !world.worker.desired) worker?.reset()
}

// The sim publishes what the worker *should* do; every command below is
// FSM-guarded inside worker.js, so re-applying the same intent each frame is a
// no-op. C5 swaps the producer for real AI without touching this function.
function applyWorkerIntent(refs, world) {
  const { worker } = refs
  if (!worker) return

  switch (world.worker.desired) {
    case 'haul':
      worker.commandDeliver(refs.slotSpawns[world.worker.targetSlotIndex] ?? refs.boxSpawn)
      break
    case 'solder':
      worker.commandSolder()
      break
    case 'scrap':
      if (!worker.isDoingScrap()) worker.commandScrapPickup()
      break
  }
}
