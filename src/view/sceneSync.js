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
import { INTERACTIONS, carrySpriteKey } from '../defs/interactions.js'
import { dwellProgress } from '../sim/systems/zone.js'
import { piggyShouldShow } from '../sim/derive.js'
import { CARRY_STACK_OFFSET_Y } from '../state/config.js'
import * as ex from 'excalibur'

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
  // Same predicate the piggy trigger zone uses, so what you see is what you can
  // walk into (sim/derive.js).
  if (piggy) piggy.graphics.visible = piggyShouldShow(game)

  // ── Drone sprite ───────────────────────────────────────
  const droneSpriteKey = game.activeKit ? (KIT_TYPES[game.activeKit]?.spriteKey ?? null) : null
  if (droneSpriteKey && droneSpriteKey !== _lastDroneSpriteKey) {
    applySprite(drone, droneSpriteKey)
    _lastDroneSpriteKey = droneSpriteKey
  }

  // ── Visibility ─────────────────────────────────────────
  const player     = (world.agents ?? []).find(a => a.kind === 'player')
  const inHand     = player?.carrying ?? []
  const assembling = game.phase === Phase.ASSEMBLY || game.phase === Phase.READY

  box.graphics.visible     = !!carrying && carrying.carriedBy === 'worker'
  boxOpen.graphics.visible = assembling
  // A drone in the player's hands must not also be lying on the bench.
  drone.graphics.visible   = (assembling || game.phase === Phase.BURNT) &&
                             !inHand.some(i => i.type === 'drone')

  // ── Attention pulses ───────────────────────────────────
  // Driven by the zones themselves now: whatever the character could act on if
  // they walked over pulses. One source of truth, so a pulsing object can never
  // turn out to be a dead end.
  if (_pulses && player) {
    _pulses.box.stop()
    _pulses.bench.stop()
    _pulses.mailbox.stop()
    _pulses.trashbin?.stop()

    if (carrying && carrying.carriedBy === 'worker') _pulses.box.start()

    for (const zone of world.zones ?? []) {
      const pulse = _pulses[ZONE_PULSE[zone.id]]
      if (!pulse) continue
      if (INTERACTIONS[zone.kind]?.enabled(world, zone, player)) pulse.start()
    }
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
  if (player && refs.player) {
    refs.player.pos.x = player.x
    refs.player.pos.y = player.y
    refs.playerRig?.setMoving(player.moving, player.facing > 0)
    syncCarryStack(refs, player)
    syncDwell(refs, world, player)
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


// Which pulse controller belongs to which zone.
const ZONE_PULSE = {
  bench:    'bench',
  mailbox:  'mailbox',
  trashbin: 'trashbin',
}

// Items float above the head, stacked upward in pickup order.
function syncCarryStack(refs, player) {
  const slots = refs.carrySlotActors ?? []
  const items = player.carrying ?? []

  slots.forEach((actor, i) => {
    const item = items[i]
    if (!item) {
      actor.graphics.visible = false
      actor.pos.x = -9999
      actor.pos.y = -9999
      return
    }
    const key = carrySpriteKey(item)
    if (actor._carryKey !== key) {
      applySprite(actor, key)
      actor._carryKey = key
    }
    actor.pos.x = player.x
    actor.pos.y = player.y - refs.player.height * 0.55 - i * CARRY_STACK_OFFSET_Y
    actor.z = player.y * 0.01 + 1 + i * 0.01
    actor.graphics.visible = true
  })
}

// A bar above the head that fills while a zone is being worked.
function syncDwell(refs, world, player) {
  const { bg, fill, width } = refs.dwell ?? {}
  if (!bg || !fill) return

  const p = dwellProgress(world, player.id)
  if (p <= 0.02) {
    bg.graphics.visible = false
    fill.graphics.visible = false
    return
  }

  const y = player.y + refs.player.height * 0.5
  bg.pos.x = player.x
  bg.pos.y = y
  bg.z = player.y * 0.01 + 2
  bg.graphics.visible = true

  const w = Math.max(width * p, 2)
  fill.graphics.use(new ex.Rectangle({ width: w, height: 6, color: ex.Color.fromHex('#7de07d') }))
  fill.pos.x = player.x - width / 2 + w / 2
  fill.pos.y = y
  fill.z = player.y * 0.01 + 3
  fill.graphics.visible = true
}
