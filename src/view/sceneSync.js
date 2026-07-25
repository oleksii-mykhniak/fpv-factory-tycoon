// Scene projection — world → Excalibur actors, every frame, one direction.
//
// Replaces updateScene(refs, phase, piggyInfo, droneSpriteKey, deliveries,
// carryingSlotIndex, scrapAvailable): a positional-argument function that grew
// by one parameter per feature because the scene kept its own copy of the state.
// Here the world is the argument, so new fields cost nothing.
//
// This module may read the world and drive actors. It must never write to the
// world — player intent goes through sim/commands.js dispatch().

import { Phase, DeliveryStatus, KIT_TYPES, stationsOf } from '../state/gameState.js'
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
  const { box, piggy, _pulses } = refs
  const carrying = (game.deliveries ?? []).find(d => d.status === DeliveryStatus.CARRYING)

  // ── Piggy bank ─────────────────────────────────────────
  // Same predicate the piggy trigger zone uses, so what you see is what you can
  // walk into (sim/derive.js).
  if (piggy) piggy.graphics.visible = piggyShouldShow(game)

  // ── Stations (C3) ──────────────────────────────────────
  const player = (world.agents ?? []).find(a => a.kind === 'player')
  const inHand = player?.carrying ?? []

  for (const view of refs.stations ?? []) {
    const station = stationsOf(game).find(s => s.id === view.id)
    if (!station) continue

    const assembling = station.phase === Phase.ASSEMBLY || station.phase === Phase.READY
    view.boxOpen.graphics.visible = assembling

    const spriteKey = station.kitId ? (KIT_TYPES[station.kitId]?.spriteKey ?? null) : null
    if (spriteKey && spriteKey !== view.spriteKey) {
      applySprite(view.drone, spriteKey)
      view.spriteKey = spriteKey
    }

    // A drone carried away from this station must not also lie on it.
    const carriedFromHere = inHand.some(i => i.type === 'drone' && i.stationId === station.id)
    view.drone.graphics.visible =
      (assembling || station.phase === Phase.BURNT) && !carriedFromHere
  }

  // Nobody carries the loose box actor any more — every character has its own
  // stack. Kept parked so nothing stale shows through.
  box.graphics.visible = false

  // ── Attention pulses ───────────────────────────────────
  // Driven by the zones themselves now: whatever the character could act on if
  // they walked over pulses. One source of truth, so a pulsing object can never
  // turn out to be a dead end.
  if (_pulses && player) {
    _pulses.box.stop()
    _pulses.mailbox.stop()
    _pulses.trashbin?.stop()
    for (const view of refs.stations ?? []) view.pulse.stop()

    for (const zone of world.zones ?? []) {
      if (!INTERACTIONS[zone.kind]?.enabled(world, zone, player)) continue
      // A station zone pulses its own station; fixed zones use a named pulse.
      const stationView = (refs.stations ?? []).find(v => v.id === zone.meta?.stationId)
      if (stationView) { stationView.pulse.start(); continue }
      _pulses[ZONE_PULSE[zone.id]]?.start()
    }
  }

  box.pos.x = -9999
  box.pos.y = -9999

  // ── Player character (C1) ──────────────────────────────
  // The sim owns the position; the actor is told where it ended up.
  if (player && refs.player) {
    refs.player.pos.x = player.x
    refs.player.pos.y = player.y
    refs.playerRig?.setMoving(player.moving, player.facing > 0)
    syncCarryStack(refs.carrySlotActors, refs.player, player)
    syncDwell(refs, world, player)
  }

  // ── Hired workers (C5) ─────────────────────────────────
  // Same projection as the player: the sim moved them, the actors follow.
  syncWorkers(refs, world)
}

function syncWorkers(refs, world) {
  if (!refs.workerView) return
  const seen = new Set()

  for (const agent of world.agents ?? []) {
    if (agent.kind !== 'worker') continue
    seen.add(agent.id)
    const view = refs.workerView(agent.id)
    view.actor.pos.x = agent.x
    view.actor.pos.y = agent.y
    view.actor.graphics.visible = true
    view.rig?.setMoving(agent.moving, agent.facing > 0)
    syncCarryStack(view.carrySlots, view.actor, agent)
  }

  // A worker that no longer exists (a future firing / a reload) must not leave
  // a ghost standing in the shop.
  for (const [id, view] of refs.workerViews ?? []) {
    if (seen.has(id)) continue
    view.actor.graphics.visible = false
    view.carrySlots?.forEach(a => { a.graphics.visible = false })
  }
}


// Which pulse controller belongs to which zone.
const ZONE_PULSE = {
  bench:    'bench',
  mailbox:  'mailbox',
  trashbin: 'trashbin',
}

// Items float above the head, stacked upward in pickup order. Shared by the
// player and every hired worker.
function syncCarryStack(slots, bodyActor, agent) {
  const items = agent.carrying ?? []

  ;(slots ?? []).forEach((actor, i) => {
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
    actor.pos.x = agent.x
    actor.pos.y = agent.y - bodyActor.height * 0.55 - i * CARRY_STACK_OFFSET_Y
    actor.z = agent.y * 0.01 + 1 + i * 0.01
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
