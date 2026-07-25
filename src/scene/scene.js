import * as ex from 'excalibur'
import { Phase, DeliveryStatus, KIT_TYPES } from '../state/gameState.js'
import {
  VIEW_HEIGHT_UNITS, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX,
  CAMERA_ELASTICITY, CAMERA_FRICTION,
  PIGGY_COOLDOWN_MS,
  PULSE_FREQ_HZ, PULSE_SCALE_AMP,
} from '../state/config.js'
import { loadSprites, getSprite } from './loader.js'
import { createWorker } from './worker.js'
import { createCharacterSprite } from './character.js'

// How many carried items the stack can show at once. The gameplay limit is
// CARRY_CAPACITY in config; this is only how many actors exist to draw.
const CARRY_STACK_SLOTS = 3

// The scene is a *projection* of the simulation (C0): it never owns gameplay
// state. Two hooks connect it to the sim:
//   getWorld()            — read-only access, called from preupdate closures
//   onIntent(type, data)  — one channel for everything the player or the puppet
//                           wants the sim to know (taps, animation milestones)
//
// Before C0 this file mirrored eight pieces of state in module-level variables
// and took ten callbacks. Both are gone; adding an interactive object now costs
// one onIntent call, not a callback threaded through three files.

const BG = ex.Color.fromHex('#0e0e18')

// Stored after initScene for use by applyLocationTheme.
let _engine     = null
let _floorActor = null

// ── Helpers ───────────────────────────────────────────────

function fmtSlotTime(ms) {
  const s = Math.ceil(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function colorRect(scene, { x, y, w, h, hex, z = 0 }) {
  const a = new ex.Actor({
    pos: ex.vec(x, y),
    width: w,
    height: h,
    z,
    color: ex.Color.fromHex(hex),
  })
  scene.add(a)
  return a
}

// Pulse utility: sine-wave scale on actor while active.
// Returns { start, stop } controller.
function addPulse(actor) {
  let active = false
  actor.on('preupdate', () => {
    if (!active) return
    const t = Date.now() / 1000
    const s = 1 + PULSE_SCALE_AMP * Math.sin(t * Math.PI * 2 * PULSE_FREQ_HZ)
    actor.scale = ex.vec(s, s)
  })
  return {
    start: () => { active = true },
    stop:  () => { active = false; actor.scale = ex.vec(1, 1) },
  }
}

// ── Layout ────────────────────────────────────────────────
//
// Geometry comes from defs/layouts/<location>.js in fixed world units. Nothing
// here is expressed as a fraction of the screen any more: the world is larger
// than the viewport and must look the same on every device.

function buildRoom(scene, layout) {
  const { world, room, street, walls, doorVoid, props, theme } = layout

  // ── Street (below the building) ────────────────────────
  colorRect(scene, {
    x: world.w / 2, y: street.y + street.h / 2, w: world.w, h: street.h,
    hex: '#0c0c18', z: 0,
  })
  // Lighter sidewalk band just outside the door
  colorRect(scene, {
    x: world.w / 2, y: street.y + street.h * 0.10, w: world.w, h: street.h * 0.18,
    hex: '#18182a', z: 0,
  })

  // ── Room floor ─────────────────────────────────────────
  const floor = colorRect(scene, {
    x: room.w / 2, y: room.h / 2, w: room.w, h: room.h,
    hex: theme.floorColor, z: 0,
  })

  // ── Walls + door opening ───────────────────────────────
  for (const wall of walls) {
    colorRect(scene, { x: wall.cx, y: wall.cy, w: wall.w, h: wall.h, hex: '#2e2e42', z: 1 })
  }
  colorRect(scene, {
    x: doorVoid.cx, y: doorVoid.cy, w: doorVoid.w, h: doorVoid.h, hex: '#0a0a14', z: 1,
  })

  // ── Props ──────────────────────────────────────────────
  // One actor per entry in layout.props; a new object in the layout appears
  // here automatically.
  const actors = {}
  for (const [name, p] of Object.entries(props)) {
    const actor = new ex.Actor({
      pos:    ex.vec(p.cx, p.cy),
      width:  p.w,
      height: p.h,
      z:      p.z,
      color:  ex.Color.fromHex(p.color),
    })
    scene.add(actor)
    applySprite(actor, p.sprite)
    actors[name] = actor
  }

  // Small hand-placed details that read better than a flat rectangle.
  const bench = props.workbench
  colorRect(scene, {
    x: bench.cx, y: bench.cy + bench.h * 0.44, w: bench.w, h: bench.h * 0.12,
    hex: '#4a2a18', z: 2,
  })
  const mb = props.mailbox
  colorRect(scene, { x: mb.cx, y: mb.cy - mb.h * 0.34, w: mb.w, h: 5, hex: '#2244a0', z: 4 })
  const tb = props.trashbin
  colorRect(scene, { x: tb.cx, y: tb.cy - tb.h * 0.46, w: tb.w * 1.1, h: 6, hex: '#3a5a2a', z: 4 })

  return { floor, ...actors }
}

// ── Sprite swap ───────────────────────────────────────────

function applySprite(actor, key) {
  const src = getSprite(key)
  if (!src) return
  const sprite = src.toSprite()
  sprite.width  = actor.width
  sprite.height = actor.height
  actor.graphics.use(sprite)
}

// ── Bench progress (auto / semi-auto soldering indicator) ─
//
// Rendered as Excalibur actors positioned above a workbench actor in world
// space. Intentionally scene-native so future multi-bench layouts get one
// progress card per bench automatically.
function createBenchProgress(scene, benchActor) {
  const BW    = benchActor.width
  const BH    = benchActor.height
  const CARD_W = Math.min(BW * 0.88, 210)
  const CARD_H = 52
  const GAP    = 6

  const cx  = benchActor.pos.x
  const cy  = benchActor.pos.y - BH / 2 - GAP - CARD_H / 2

  const BAR_W    = CARD_W * 0.80
  const BAR_H    = 5
  const barY     = cy + CARD_H * 0.28
  const LEFT_X   = cx - BAR_W / 2
  const MAX_DOTS = 8
  const DOT_R    = 3
  const DOT_GAP  = DOT_R * 2.8

  let running  = false
  let elapsed  = 0
  let duration = 2000

  // Card border (1px wider on each side, rendered behind the fill)
  const cardBorder = new ex.Actor({
    pos: ex.vec(cx, cy), width: CARD_W + 2, height: CARD_H + 2,
    z: 11, color: ex.Color.fromHex('#3a4a80'),
  })
  cardBorder.graphics.visible = false
  scene.add(cardBorder)

  // Card background
  const card = new ex.Actor({
    pos: ex.vec(cx, cy), width: CARD_W, height: CARD_H,
    z: 12, color: ex.Color.fromHex('#1c1c38'),
  })
  card.graphics.visible = false
  scene.add(card)

  // Step label
  const stepLbl = new ex.Label({
    text: '',
    pos:  ex.vec(cx, cy - CARD_H * 0.16),
    color: ex.Color.fromHex('#cce0ff'),
    font: new ex.Font({ size: 11, family: 'monospace', textAlign: ex.TextAlign.Center }),
    z: 13,
  })
  stepLbl.graphics.visible = false
  scene.add(stepLbl)

  // Progress dots — small square actors (more reliable than ex.Circle in WebGL)
  const DOT_SZ = DOT_R * 2
  const dotActors = Array.from({ length: MAX_DOTS }, () => {
    const d = new ex.Actor({
      pos: ex.vec(cx, cy + CARD_H * 0.08), width: DOT_SZ, height: DOT_SZ,
      z: 13, color: ex.Color.fromHex('#6868a0'),
    })
    d.graphics.visible = false
    scene.add(d)
    return d
  })

  // Timer bar background
  const barBg = new ex.Actor({
    pos: ex.vec(cx, barY), width: BAR_W, height: BAR_H + 2,
    z: 13, color: ex.Color.fromHex('#3a3a60'),
  })
  barBg.graphics.visible = false
  scene.add(barBg)

  // Timer bar fill — uses graphic swap for left-to-right fill
  const barFill = new ex.Actor({ pos: ex.vec(cx, barY), z: 14 })
  barFill.graphics.visible = false
  barFill.on('preupdate', (evt) => {
    if (!running) return
    elapsed += evt.delta
    const p = Math.max(Math.min(elapsed / duration, 1), 0.01)
    const fillW = Math.max(BAR_W * p, 2)
    barFill.graphics.use(new ex.Rectangle({ width: fillW, height: BAR_H + 2, color: ex.Color.fromHex('#7aa0ff') }))
    barFill.pos.x = LEFT_X + fillW / 2
  })
  scene.add(barFill)

  // Result toast — card + label that fade out
  const TOAST_H = 28
  const toastCard = new ex.Actor({
    pos: ex.vec(cx, cy), width: CARD_W, height: TOAST_H,
    z: 12, color: ex.Color.fromHex('#0a1e0e'),
  })
  toastCard.graphics.visible = false
  scene.add(toastCard)

  const toastLbl = new ex.Label({
    text:  '',
    pos:   ex.vec(cx, cy),
    color: ex.Color.fromHex('#7de07d'),
    font:  new ex.Font({ size: 13, family: 'monospace', textAlign: ex.TextAlign.Center }),
    z: 13,
  })
  toastLbl.graphics.visible = false
  scene.add(toastLbl)

  let toastAge = 0, toastDur = 0, toasting = false
  toastCard.on('preupdate', (evt) => {
    if (!toasting) return
    toastAge += evt.delta
    if (toastAge >= toastDur) {
      toasting = false
      toastCard.graphics.visible = false
      toastLbl.graphics.visible  = false
      return
    }
    const fadeStart = toastDur * 0.55
    const a = toastAge > fadeStart
      ? 1 - (toastAge - fadeStart) / (toastDur - fadeStart)
      : 1
    toastCard.graphics.opacity = a
    toastLbl.graphics.opacity  = a
  })

  function _placeDots(total, done) {
    const dotsW  = (total - 1) * DOT_GAP
    const startX = cx - dotsW / 2
    const dotY   = cy + CARD_H * 0.08
    dotActors.forEach((d, i) => {
      if (i < total) {
        d.pos = ex.vec(startX + i * DOT_GAP, dotY)
        const col = ex.Color.fromHex(i < done ? '#7de07d' : '#6868a0')
        d.graphics.use(new ex.Rectangle({ width: DOT_SZ, height: DOT_SZ, color: col }))
        d.graphics.visible = true
      } else {
        d.graphics.visible = false
      }
    })
  }

  function _resetBar() {
    elapsed = 0
    barFill.pos.x = LEFT_X + 1
    barFill.graphics.use(new ex.Rectangle({ width: 2, height: BAR_H + 2, color: ex.Color.fromHex('#7aa0ff') }))
  }

  function startStep(lbl, total, done, durationMs) {
    elapsed  = 0
    duration = durationMs
    running  = true
    stepLbl.text = lbl
    cardBorder.graphics.visible = true
    card.graphics.visible     = true
    stepLbl.graphics.visible  = true
    barBg.graphics.visible    = true
    barFill.graphics.visible  = true
    _resetBar()
    _placeDots(total, done)
    toasting = false
    toastCard.graphics.visible = false
    toastLbl.graphics.visible  = false
  }

  function advanceDots(total, done) {
    elapsed = 0
    _resetBar()
    _placeDots(total, done)
  }

  function hide() {
    running = false
    cardBorder.graphics.visible = false
    card.graphics.visible    = false
    stepLbl.graphics.visible = false
    barBg.graphics.visible   = false
    barFill.graphics.visible = false
    dotActors.forEach(d => { d.graphics.visible = false })
  }

  function showResult(text, durationMs = 2200) {
    hide()
    toastLbl.text = text
    toastCard.graphics.opacity = 1
    toastLbl.graphics.opacity  = 1
    toastCard.graphics.visible = true
    toastLbl.graphics.visible  = true
    toastAge = 0
    toastDur = durationMs
    toasting = true
  }

  return { startStep, advanceDots, hide, showResult }
}

// ── Scene entry point ─────────────────────────────────────

export async function initScene(canvas, { getWorld, onIntent, onLoadProgress, layout }) {
  const engine = new ex.Engine({
    canvasElement: canvas,
    backgroundColor: BG,
    displayMode: ex.DisplayMode.FillScreen,
    antialiasing: false,
  })
  _engine = engine

  await loadSprites(onLoadProgress)
  await engine.start()

  const scene = engine.currentScene

  // Zoom shows a constant slice of the world instead of a constant pixel size,
  // so a phone and a tablet see the same amount of game (C1.1).
  scene.camera.zoom = Math.max(
    CAMERA_ZOOM_MIN,
    Math.min(CAMERA_ZOOM_MAX, engine.drawHeight / VIEW_HEIGHT_UNITS),
  )

  const { floor, workbench, mailbox, trashbin, piggy } = buildRoom(scene, layout)
  _floorActor = floor

  const { spawns, sizes } = layout

  // ── Key positions (world units, straight from the layout) ──
  const slotSpawns   = spawns.deliverySlots.map(p => ex.vec(p.x, p.y))
  const BOX_SPAWN    = slotSpawns[0]
  const DOOR         = ex.vec(spawns.door.x, spawns.door.y)
  const TABLE        = ex.vec(spawns.benchTop.x, spawns.benchTop.y)
  const IDLE_POS     = ex.vec(spawns.workerIdle.x, spawns.workerIdle.y)
  const BENCH_POS    = ex.vec(spawns.bench.x, spawns.bench.y)
  const MAILBOX_POS  = mailbox.pos.clone()
  const TRASHBIN_POS = trashbin.pos.clone()

  // ── Delivery box — spawns in the street ────────────────
  const BOX_W = sizes.box.w
  const box = new ex.Actor({
    pos:    BOX_SPAWN.clone(),
    width:  BOX_W,
    height: sizes.box.h,
    z: 3,
    color:  ex.Color.fromHex('#c49a3c'),
  })
  box.graphics.visible = false
  applySprite(box, 'delivery_box')
  scene.add(box)

  // ── Delivery slot indicators ───────────────────────────
  // One indicator box + one countdown label per street slot. Each reads its own
  // slice of the world in preupdate — no mirrored copy of `deliveries` here.
  // The carry `box` above is SEPARATE: it is the one the worker picks up.
  const slotIndicators = slotSpawns.map(pos => {
    const a = new ex.Actor({
      pos:    pos.clone(),
      width:  BOX_W,
      height: sizes.box.h,
      z: 3,
      color:  ex.Color.fromHex('#c49a3c'),
    })
    a.graphics.visible = false
    applySprite(a, 'delivery_box')
    scene.add(a)
    return a
  })

  const slotLabels = slotSpawns.map(pos => {
    const lbl = new ex.Label({
      text:  '',
      pos:   ex.vec(pos.x, pos.y - BOX_W * 1.05),
      color: ex.Color.fromHex('#c8d8ff'),
      font:  new ex.Font({ size: 12, family: 'monospace', textAlign: ex.TextAlign.Center }),
      z: 5,
    })
    lbl.graphics.visible = false
    scene.add(lbl)
    return lbl
  })

  slotIndicators.forEach((ind, slotIdx) => {
    const lbl = slotLabels[slotIdx]

    // Projection: countdown while in transit, box sprite once it has arrived.
    // Walking into the slot's trigger zone is what picks it up (C2).
    ind.on('preupdate', () => {
      const { game, now } = getWorld()
      const d = (game.deliveries ?? []).find(d => d.slotIndex === slotIdx)

      // No delivery OR the worker is carrying it — the carry box is shown instead.
      if (!d || d.status === DeliveryStatus.CARRYING) {
        ind.graphics.visible = false
        lbl.graphics.visible = false
        return
      }

      const ms  = Math.max(0, d.readyAt - now)
      const kit = KIT_TYPES[d.kitId]
      if (ms > 0) {
        ind.graphics.visible = false
        lbl.text = `${kit?.emoji ?? '📦'} ${fmtSlotTime(ms)}`
        lbl.graphics.visible = true
      } else {
        ind.graphics.visible = true
        lbl.graphics.visible = false
      }
    })
  })

  // Opened box on workbench (flat, lighter — visible during ASSEMBLY/READY)
  const boxOpen = new ex.Actor({
    pos:    TABLE.clone(),
    width:  sizes.box.w * 1.3,
    height: sizes.box.h * 0.5,
    z: 3,
    color:  ex.Color.fromHex('#e8c870'),
  })
  boxOpen.graphics.visible = false
  scene.add(boxOpen)

  // Drone silhouette on the workbench (smaller than a character — real proportion)
  const drone = new ex.Actor({
    pos:    TABLE.clone(),
    width:  sizes.drone.w,
    height: sizes.drone.h,
    z: 4,
    color:  ex.Color.fromHex('#2a2a3e'),
  })
  drone.graphics.visible = false
  scene.add(drone)

  // ── Piggy bank (built from the layout; only its behaviour lives here) ──
  piggy.graphics.visible = false

  const piggyTimerLabel = new ex.Label({
    text:  '',
    pos:   ex.vec(piggy.pos.x, piggy.pos.y - piggy.height * 0.78),
    color: ex.Color.fromHex('#dddddd'),
    font:  new ex.Font({ size: 13, family: 'monospace', textAlign: ex.TextAlign.Center }),
    z: 5,
  })
  piggyTimerLabel.graphics.visible = false
  scene.add(piggyTimerLabel)

  piggy.on('preupdate', () => {
    if (!piggy.graphics.visible) return
    const { game, now } = getWorld()
    const remaining = game.lastPiggyAt != null ? PIGGY_COOLDOWN_MS - (now - game.lastPiggyAt) : 0
    if (remaining > 0) {
      piggy.graphics.opacity = 0.35
      piggy.scale = ex.vec(1, 1)
      const secs = Math.ceil(remaining / 1000)
      piggyTimerLabel.text = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
      piggyTimerLabel.graphics.visible = true
    } else {
      piggy.graphics.opacity = 1.0
      const s = 1 + 0.08 * Math.sin(Date.now() / 400)
      piggy.scale = ex.vec(s, s)
      piggyTimerLabel.graphics.visible = false
    }
  })

  // ── Worker ─────────────────────────────────────────────
  // The puppet reports animation milestones back as intents; the sim decides
  // what they mean. C1 replaces this actor with a vel-driven agent.
  const worker = createWorker(scene, {
    size:         sizes.character,
    doorPos:      DOOR,
    boxSpawnPos:  BOX_SPAWN,
    benchPos:     BENCH_POS,
    idlePos:      IDLE_POS,
    mailboxPos:   MAILBOX_POS,
    trashbinPos:  TRASHBIN_POS,
    box,
    tablePos:     TABLE,
    droneRef:     drone,
    onBoxPicked:           () => onIntent('worker.atBench'),
    onSolderRequested:     () => onIntent('worker.readyToSolder'),
    onSellRequested:       () => onIntent('worker.atMailbox'),
    onTrashRequested:      () => onIntent('worker.droppedBurnt'),
    onScrapArrivedAtTrash: () => onIntent('worker.atScrapBin'),
    onScrapDelivered:      () => onIntent('worker.scrapDelivered'),
  })
  worker.setupSprite(getSprite('worker_walk'))

  // ── Player character (C1) ──────────────────────────────
  // Position is owned by the sim (world.agents); this actor only renders it.
  const player = new ex.Actor({
    pos:    ex.vec(spawns.player.x, spawns.player.y),
    width:  sizes.character,
    height: sizes.character,
    z: 6,
    color:  ex.Color.fromHex('#1f9e92'),
  })
  scene.add(player)
  const playerRig = createCharacterSprite(player, getSprite('player_walk'))

  // Y-sort: whoever stands lower on screen draws in front.
  player.on('preupdate', () => { player.z = player.pos.y * 0.01 })

  // ── Carried items ──────────────────────────────────────
  // A small stack of actors floating above the head. Kept as scene-level actors
  // rather than children: addChild removes an actor from the scene's render
  // list in Excalibur 0.32, which cost us a whole evening back in D4.
  const carrySlotActors = Array.from({ length: CARRY_STACK_SLOTS }, () => {
    const a = new ex.Actor({
      pos:    ex.vec(-9999, -9999),
      width:  sizes.box.w * 0.8,
      height: sizes.box.h * 0.8,
      z: 20,
      color:  ex.Color.fromHex('#c49a3c'),
    })
    a.graphics.visible = false
    scene.add(a)
    return a
  })

  // ── Dwell progress ─────────────────────────────────────
  // Fills while standing in a zone that has something to offer.
  const DWELL_W = sizes.character * 0.9
  const dwellBg = new ex.Actor({
    pos: ex.vec(-9999, -9999), width: DWELL_W + 4, height: 10,
    z: 21, color: ex.Color.fromHex('#20203a'),
  })
  dwellBg.graphics.visible = false
  scene.add(dwellBg)

  const dwellFill = new ex.Actor({ pos: ex.vec(-9999, -9999), z: 22 })
  dwellFill.graphics.visible = false
  scene.add(dwellFill)

  // Camera follows the player, clamped so it never shows past the world edge.
  scene.camera.pos = ex.vec(spawns.player.x, spawns.player.y)
  scene.camera.strategy.elasticToActor(player, CAMERA_ELASTICITY, CAMERA_FRICTION)
  scene.camera.strategy.limitCameraBounds(
    new ex.BoundingBox(0, 0, layout.world.w, layout.world.h),
  )

  // ── Pulse controllers ──────────────────────────────────
  const boxPulse      = addPulse(box)
  const benchPulse    = addPulse(workbench)
  const mailboxPulse  = addPulse(mailbox)
  const trashbinPulse = addPulse(trashbin)

  // ── Bench progress (auto / semi soldering) ────────────
  const benchProgress = createBenchProgress(scene, workbench)

  return {
    engine: { getFps: () => engine.clock.fpsSampler.fps, _ex: engine },
    scene,
    box, boxOpen, drone, worker, piggy, mailbox, trashbin, workbench,
    player, playerRig,
    carrySlotActors,
    dwell: { bg: dwellBg, fill: dwellFill, width: DWELL_W },
    benchProgress,
    slotSpawns,
    boxSpawn: BOX_SPAWN,
    _pulses: { box: boxPulse, bench: benchPulse, mailbox: mailboxPulse, trashbin: trashbinPulse },
  }
}

// Apply location-specific visual theme (background colour, floor colour).
// Safe to call any time after initScene.
export function applyLocationTheme(sceneConfig) {
  if (!sceneConfig) return
  if (sceneConfig.bgColor && _engine)
    _engine.backgroundColor = ex.Color.fromHex(sceneConfig.bgColor)
  if (sceneConfig.floorColor && _floorActor)
    _floorActor.color = ex.Color.fromHex(sceneConfig.floorColor)
}
