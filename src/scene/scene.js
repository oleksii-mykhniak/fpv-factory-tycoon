import * as ex from 'excalibur'
import { Phase, DeliveryStatus, KIT_TYPES } from '../state/gameState.js'
import {
  CAMERA_ZOOM_REF, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX,
  PIGGY_COOLDOWN_MS,
  SCENE_ROOM_H_RATIO, SCENE_DRONE_W_RATIO, SCENE_BOX_W_RATIO,
  PULSE_FREQ_HZ, PULSE_SCALE_AMP,
} from '../state/config.js'
import { loadSprites, getSprite } from './loader.js'
import { createWorker } from './worker.js'

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
// Coordinate origin = top-left of canvas.
// Room occupies top SCENE_ROOM_H_RATIO of the game canvas (excl. action bar).
// Exterior strip occupies the remaining bottom fraction.
// Door gap in bottom wall: x ∈ [W*0.28, W*0.48], center W*0.38.
// Returns refs needed for interaction wiring.

function buildRoom(scene, W, H, RH) {
  const WW    = W * 0.06   // side wall thickness
  const HW    = H * 0.035  // top/bottom wall thickness
  const EXT_H = H - RH     // exterior strip height below room

  // ── Exterior zone ──────────────────────────────────────
  // Dark base (street/night)
  colorRect(scene, { x: W * 0.5, y: RH + EXT_H * 0.5, w: W, h: EXT_H, hex: '#0c0c18', z: 0 })
  // Lighter sidewalk band just below the door threshold
  colorRect(scene, { x: W * 0.5, y: RH + EXT_H * 0.1, w: W, h: EXT_H * 0.18, hex: '#18182a', z: 0 })

  // ── Room floor ─────────────────────────────────────────
  const floor = new ex.Actor({
    pos:    ex.vec(W * 0.5, RH * 0.5),
    width:  W,
    height: RH,
    z: 0,
    color:  ex.Color.fromHex('#1a1a26'),
  })
  scene.add(floor)

  // ── Walls ──────────────────────────────────────────────
  colorRect(scene, { x: W * 0.5,       y: HW * 0.5,       w: W,        h: HW, hex: '#2e2e42', z: 1 })
  colorRect(scene, { x: WW * 0.5,      y: RH * 0.5,       w: WW,       h: RH, hex: '#2e2e42', z: 1 })
  colorRect(scene, { x: W - WW * 0.5,  y: RH * 0.5,       w: WW,       h: RH, hex: '#2e2e42', z: 1 })
  // Bottom wall left of door gap
  colorRect(scene, { x: W * 0.14,      y: RH - HW * 0.5,  w: W * 0.28, h: HW, hex: '#2e2e42', z: 1 })
  // Door gap (void to exterior)
  colorRect(scene, { x: W * 0.38,      y: RH - HW * 0.5,  w: W * 0.20, h: HW, hex: '#0a0a14', z: 1 })
  // Bottom wall right of door gap
  colorRect(scene, { x: W * 0.74,      y: RH - HW * 0.5,  w: W * 0.52, h: HW, hex: '#2e2e42', z: 1 })

  // ── Workbench ─────────────────────────────────────────
  const workbench = colorRect(scene, { x: W * 0.50, y: RH * 0.35, w: W * 0.60, h: RH * 0.13, hex: '#6b4226', z: 2 })
  colorRect(scene, { x: W * 0.50, y: RH * 0.42, w: W * 0.60, h: RH * 0.015, hex: '#4a2a18', z: 2 })
  // Ceiling lamp (top-down view)
  const lamp = new ex.Actor({
    pos:    ex.vec(W * 0.50, RH * 0.16),
    width:  W * 0.08,
    height: W * 0.08,
    z: 2,
    color:  ex.Color.fromHex('#d4c060'),
  })
  scene.add(lamp)

  // ── Mailbox (outside, near door, left side) ───────────
  const MB_SIZE = W * 0.09
  const mailbox = new ex.Actor({
    pos:    ex.vec(W * 0.16, RH + EXT_H * 0.62),
    width:  MB_SIZE,
    height: MB_SIZE * 0.80,
    z: 3,
    color:  ex.Color.fromHex('#3a5db8'),
  })
  scene.add(mailbox)
  // Mailbox slot detail
  colorRect(scene, {
    x: W * 0.16,
    y: RH + EXT_H * 0.58,
    w: MB_SIZE,
    h: H * 0.007,
    hex: '#2244a0',
    z: 4,
  })

  // ── Trash bin (outside, right side) ───────────────────
  const TB_SIZE = W * 0.09
  const trashbin = new ex.Actor({
    pos:    ex.vec(W * 0.86, RH + EXT_H * 0.62),
    width:  TB_SIZE,
    height: TB_SIZE * 1.10,
    z: 3,
    color:  ex.Color.fromHex('#4a6a3a'),
  })
  scene.add(trashbin)
  // Trash bin lid detail
  colorRect(scene, {
    x: W * 0.86,
    y: RH + EXT_H * 0.50,
    w: TB_SIZE * 1.1,
    h: H * 0.008,
    hex: '#3a5a2a',
    z: 4,
  })

  return { workbench, floor, mailbox, trashbin, lamp, HW, EXT_H }
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

export async function initScene(canvas, { getWorld, onIntent, onLoadProgress }) {
  const engine = new ex.Engine({
    canvasElement: canvas,
    backgroundColor: BG,
    displayMode: ex.DisplayMode.FillScreen,
    antialiasing: false,
  })
  _engine = engine

  await loadSprites(onLoadProgress)
  await engine.start()

  const W   = engine.drawWidth
  const H   = engine.drawHeight
  const RH  = H * SCENE_ROOM_H_RATIO
  const scene = engine.currentScene

  scene.camera.zoom = Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, H / CAMERA_ZOOM_REF))

  const { workbench, floor, mailbox, trashbin, lamp, HW, EXT_H } = buildRoom(scene, W, H, RH)
  _floorActor = floor

  // Apply environment sprites (swap colored rects to textured sprites)
  applySprite(workbench, 'workbench')
  applySprite(lamp, 'lamp')
  applySprite(mailbox, 'mailbox')
  applySprite(trashbin, 'trashbin')

  // ── Key positions ──────────────────────────────────────
  const WORKER_SIZE  = W * 0.18
  const DOOR         = ex.vec(W * 0.38, RH - HW)              // door threshold inside room
  const BOX_SPAWN    = ex.vec(W * 0.38, RH + EXT_H * 0.35)    // street slot 0 (in front of door)

  // All 3 street slot positions indexed by slotIndex (matches delivery.slotIndex).
  // Slot 0 = primary (door gap), slots 1-2 = right of door.
  const slotSpawns = [
    BOX_SPAWN,
    ex.vec(W * 0.62, RH + EXT_H * 0.35),
    ex.vec(W * 0.82, RH + EXT_H * 0.35),
  ]
  const TABLE         = workbench.pos.clone()
  const IDLE_POS      = ex.vec(W * 0.72, RH * 0.66)
  const BENCH_POS     = ex.vec(workbench.pos.x, workbench.pos.y + workbench.height / 2 + WORKER_SIZE / 2)
  const MAILBOX_POS   = mailbox.pos.clone()
  const TRASHBIN_POS  = trashbin.pos.clone()

  // ── Delivery box — spawns in exterior zone ─────────────
  const BOX_W = W * SCENE_BOX_W_RATIO
  const box = new ex.Actor({
    pos:    BOX_SPAWN.clone(),
    width:  BOX_W,
    height: BOX_W * 0.65,
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
      height: BOX_W * 0.65,
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

    // Tap: pick up an arrived box by hand (MANUAL worker mode).
    ind.on('pointerup', () => {
      const { game, now } = getWorld()
      if (game.phase !== Phase.IDLE) return
      if ((game.deliveries ?? []).some(d => d.status === DeliveryStatus.CARRYING)) return
      const d = (game.deliveries ?? []).find(
        d => d.slotIndex === slotIdx && d.status === DeliveryStatus.TRANSIT
      )
      if (d && d.readyAt <= now) onIntent('slot.tap', { deliveryId: d.id })
    })

    // Projection: countdown while in transit, box sprite once it has arrived.
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
    width:  W  * 0.16,
    height: RH * 0.04,
    z: 3,
    color:  ex.Color.fromHex('#e8c870'),
  })
  boxOpen.graphics.visible = false
  scene.add(boxOpen)

  // Drone silhouette on workbench (smaller than worker — realistic proportion)
  const DRONE_W = W * SCENE_DRONE_W_RATIO
  const drone = new ex.Actor({
    pos:    ex.vec(W * 0.52, RH * 0.35),
    width:  DRONE_W,
    height: DRONE_W * 0.55,
    z: 4,
    color:  ex.Color.fromHex('#2a2a3e'),
  })
  drone.graphics.visible = false
  scene.add(drone)

  // ── Piggy bank ─────────────────────────────────────────
  const piggySize = W * 0.11
  const piggyPos  = ex.vec(W * 0.16, RH * 0.64)

  const piggy = new ex.Actor({
    pos:    piggyPos.clone(),
    width:  piggySize,
    height: piggySize,
    z: 3,
    color:  ex.Color.fromHex('#d4607a'),
  })
  piggy.graphics.visible = false
  applySprite(piggy, 'piggy')
  scene.add(piggy)

  const piggyTimerLabel = new ex.Label({
    text:  '',
    pos:   ex.vec(piggyPos.x, piggyPos.y - piggySize * 0.78),
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

  piggy.on('pointerup', () => {
    if (piggy.graphics.visible) onIntent('piggy.tap')
  })

  // ── Worker ─────────────────────────────────────────────
  // The puppet reports animation milestones back as intents; the sim decides
  // what they mean. C1 replaces this actor with a vel-driven agent.
  const worker = createWorker(scene, {
    W, RH,
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

  // ── Pointer intents ────────────────────────────────────

  // Free walk on an empty bit of floor. Uses the engine-level pointer with a
  // manual bounds check: floor.on('pointerup') at z=0 loses the hit-test to the
  // workbench at z=2. C1 replaces this with joystick/WASD movement.
  engine.input.pointers.primary.on('up', (evt) => {
    const world = evt.worldPos
    if (world.x > 0 && world.x < W && world.y > 0 && world.y < RH)
      onIntent('floor.tap', { x: world.x, y: world.y })
  })

  trashbin.on('pointerup', () => onIntent('trash.tap'))
  box.on('pointerup',      () => onIntent('box.tap'))
  workbench.on('pointerup', () => onIntent('bench.tap'))
  mailbox.on('pointerup',   () => onIntent('mailbox.tap'))

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
    box, boxOpen, drone, worker, piggy, mailbox, trashbin,
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
