import * as ex from 'excalibur'
import { Phase } from '../state/gameState.js'
import {
  CAMERA_ZOOM_REF, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX,
  PIGGY_COOLDOWN_MS,
  SCENE_ROOM_H_RATIO, SCENE_DRONE_W_RATIO, SCENE_BOX_W_RATIO,
  PULSE_FREQ_HZ, PULSE_SCALE_AMP,
} from '../state/config.js'
import { loadSprites, getSprite } from './loader.js'
import { createWorker } from './worker.js'

const BG = ex.Color.fromHex('#0e0e18')

// Height of the action bar (must match --ab-h in style.css).
const ACTION_BAR_H = 68

// Tracks the current game phase so pointer handlers can gate commands.
let currentPhase = Phase.IDLE

// lastPiggyAt from game state — piggy preupdate uses this for real-time cooldown display.
let _piggyLastAt = null

// ── Helpers ───────────────────────────────────────────────

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

  // ── Room floor (interactive — receives free-walk taps) ─
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
  colorRect(scene, { x: W * 0.50, y: RH * 0.16, w: W * 0.08, h: W * 0.08, hex: '#d4c060', z: 2 })

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

  return { workbench, floor, mailbox, HW, EXT_H }
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

// ── Scene entry points ────────────────────────────────────

export async function initScene(canvas, { onBoxPicked, onSolderRequested, onSellRequested, onLoadProgress, onPiggyRequested }) {
  const engine = new ex.Engine({
    canvasElement: canvas,
    backgroundColor: BG,
    displayMode: ex.DisplayMode.FillScreen,
    antialiasing: false,
  })

  await loadSprites(onLoadProgress)
  await engine.start()

  const W   = engine.drawWidth
  const H   = engine.drawHeight
  const RH  = H * SCENE_ROOM_H_RATIO
  const scene = engine.currentScene

  scene.camera.zoom = Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, H / CAMERA_ZOOM_REF))

  const { workbench, floor, mailbox, HW, EXT_H } = buildRoom(scene, W, H, RH)

  // ── Key positions ──────────────────────────────────────
  const WORKER_SIZE  = W * 0.18
  const DOOR         = ex.vec(W * 0.38, RH - HW)              // door threshold inside room
  const BOX_SPAWN    = ex.vec(W * 0.38, RH + EXT_H * 0.35)    // box waits here outside
  const TABLE        = workbench.pos.clone()
  const IDLE_POS     = ex.vec(W * 0.72, RH * 0.66)
  const BENCH_POS    = ex.vec(workbench.pos.x, workbench.pos.y + workbench.height / 2 + WORKER_SIZE / 2)
  const MAILBOX_POS  = mailbox.pos.clone()

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
  applySprite(drone, 'mini_drone')
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
    const now = Date.now()
    const remaining = _piggyLastAt != null ? PIGGY_COOLDOWN_MS - (now - _piggyLastAt) : 0
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
    if (piggy.graphics.visible) onPiggyRequested?.()
  })

  // ── Worker ─────────────────────────────────────────────
  const worker = createWorker(scene, {
    W, RH,
    doorPos:     DOOR,
    boxSpawnPos: BOX_SPAWN,
    benchPos:    BENCH_POS,
    idlePos:     IDLE_POS,
    mailboxPos:  MAILBOX_POS,
    box,
    tablePos:    TABLE,
    droneRef:    drone,
    onBoxPicked,
    onSolderRequested,
    onSellRequested,
  })
  worker.setupSprite(getSprite('worker_walk'))

  // ── Pulse controllers ──────────────────────────────────
  const boxPulse      = addPulse(box)
  const benchPulse    = addPulse(workbench)
  const mailboxPulse  = addPulse(mailbox)

  // ── Pointer events ─────────────────────────────────────

  // Tap box → worker fetches (DELIVERY phase)
  box.on('pointerup', () => {
    if (currentPhase === Phase.DELIVERY) worker.commandDeliver()
  })

  // Tap workbench → solder (ASSEMBLY) or sell animation (READY)
  workbench.on('pointerup', () => {
    if (currentPhase === Phase.ASSEMBLY) worker.commandSolder()
    if (currentPhase === Phase.READY)    worker.commandSell()
  })

  // Tap mailbox → sell animation (READY)
  mailbox.on('pointerup', () => {
    if (currentPhase === Phase.READY) worker.commandSell()
  })

  // Tap floor → idle free walk (D4.7).
  // Using engine-level pointer to avoid actor z-order dispatch quirks in Excalibur:
  // floor.on('pointerup') at z=0 may not fire when a higher-z actor (workbench z=2)
  // covers the same area. Global pointer always fires; we check bounds manually.
  engine.input.pointers.primary.on('up', (evt) => {
    if (currentPhase !== Phase.IDLE && currentPhase !== Phase.ORDERED && currentPhase !== Phase.DELIVERY) return
    const world = evt.worldPos
    // Only if tap is inside the room floor (not on a wall, not in exterior zone)
    if (world.x > 0 && world.x < W && world.y > 0 && world.y < RH) {
      worker.walkTo(world.x, world.y)
    }
  })

  return {
    engine: { getFps: () => engine.clock.fpsSampler.fps, _ex: engine },
    scene,
    box, boxOpen, drone, worker, piggy, mailbox,
    _boxSpawn: BOX_SPAWN,
    _pulses: { box: boxPulse, bench: benchPulse, mailbox: mailboxPulse },
  }
}

// piggyInfo: null | { show: boolean, lastAt: number|null }
export function updateScene(refs, phase, piggyInfo = null) {
  if (!refs?.box) return

  currentPhase = phase

  const { box, boxOpen, drone, worker, piggy, _boxSpawn, _pulses } = refs

  if (piggy && piggyInfo !== null) {
    piggy.graphics.visible = piggyInfo.show
    _piggyLastAt = piggyInfo.lastAt
  }

  const assembling = phase === Phase.ASSEMBLY || phase === Phase.READY

  box.graphics.visible     = phase === Phase.DELIVERY
  boxOpen.graphics.visible = assembling
  // Drone visible in ASSEMBLY, and in READY only when worker hasn't started sell yet
  // (commandSell hides it directly; updateScene restores it on next ASSEMBLY)
  if (assembling) drone.graphics.visible = true

  // ── Pulse cues (D4.6) ─────────────────────────────────
  if (_pulses) {
    _pulses.box.stop()
    _pulses.bench.stop()
    _pulses.mailbox.stop()

    if (phase === Phase.DELIVERY) _pulses.box.start()
    if (phase === Phase.ASSEMBLY) _pulses.bench.start()
    if (phase === Phase.READY) {
      _pulses.bench.start()
      _pulses.mailbox.start()
    }
  }

  // Reset closed box to spawn position between cycles
  if (!assembling && phase !== Phase.DELIVERY) {
    box.actions.clearActions()
    box.pos.x = _boxSpawn.x
    box.pos.y = _boxSpawn.y
  }

  // Return worker to idle between cycles
  if (phase === Phase.IDLE) worker?.reset()
}
