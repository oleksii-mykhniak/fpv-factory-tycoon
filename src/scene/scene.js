import * as ex from 'excalibur'
import { Phase } from '../state/gameState.js'
import { loadSprites, getSprite } from './loader.js'
import { createWorker } from './worker.js'

const BG = ex.Color.fromHex('#0e0e18')

// T3: DOM panel removed → full canvas available. Room uses top 88%.
// Bottom 12% stays dark (visual breathing room below room walls).
const ROOM_H = 0.88

// Tracks the current game phase so pointer handlers can gate commands.
let currentPhase = Phase.IDLE

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

// ── Layout (top-down, PA-style) ───────────────────────────
//
// (0,0) = top-left. RH = usable room height (65% of canvas).
// Door gap in bottom wall: x ∈ [W*0.28, W*0.48] — box spawns there.
// Returns { workbench } for wiring up interaction.

function buildRoom(scene, W, H) {
  const WW = W * 0.06
  const HW = H * 0.035
  const RH = H * ROOM_H

  // Floor
  colorRect(scene, { x: W * 0.5, y: RH * 0.5, w: W, h: RH, hex: '#1a1a26', z: 0 })

  // Top wall
  colorRect(scene, { x: W * 0.5,       y: HW * 0.5,       w: W,   h: HW, hex: '#2e2e42', z: 1 })
  // Left wall
  colorRect(scene, { x: WW * 0.5,      y: RH * 0.5,       w: WW,  h: RH, hex: '#2e2e42', z: 1 })
  // Right wall
  colorRect(scene, { x: W - WW * 0.5,  y: RH * 0.5,       w: WW,  h: RH, hex: '#2e2e42', z: 1 })
  // Bottom wall — left of door
  colorRect(scene, { x: W * 0.14,      y: RH - HW * 0.5,  w: W * 0.28, h: HW, hex: '#2e2e42', z: 1 })
  // Bottom wall — door gap (outside void)
  colorRect(scene, { x: W * 0.38,      y: RH - HW * 0.5,  w: W * 0.20, h: HW, hex: '#0d0d15', z: 1 })
  // Bottom wall — right of door
  colorRect(scene, { x: W * 0.74,      y: RH - HW * 0.5,  w: W * 0.52, h: HW, hex: '#2e2e42', z: 1 })

  // Workbench — interactive, keep ref
  const workbench = colorRect(scene, { x: W * 0.50, y: RH * 0.35, w: W * 0.60, h: RH * 0.13, hex: '#6b4226', z: 2 })
  // Workbench front edge
  colorRect(scene, { x: W * 0.50, y: RH * 0.42, w: W * 0.60, h: RH * 0.015, hex: '#4a2a18', z: 2 })
  // Ceiling lamp (seen from above)
  colorRect(scene, { x: W * 0.50, y: RH * 0.16, w: W * 0.08, h: W * 0.08, hex: '#d4c060', z: 2 })

  return { workbench }
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

export async function initScene(canvas, { onBoxPicked, onSolderRequested, onSellRequested, onLoadProgress }) {
  const engine = new ex.Engine({
    canvasElement: canvas,
    backgroundColor: BG,
    displayMode: ex.DisplayMode.FillScreen,
    antialiasing: false,
  })

  await loadSprites(onLoadProgress)
  await engine.start()

  const W  = engine.drawWidth
  const H  = engine.drawHeight
  const RH = H * ROOM_H
  const scene = engine.currentScene

  const { workbench } = buildRoom(scene, W, H)

  // Key positions — derived from actual Actor positions where possible.
  const WORKER_SIZE = W * 0.09                       // matches worker.js
  const DOOR        = ex.vec(W * 0.38, RH * 0.88)   // door gap center; box spawns here
  const TABLE       = workbench.pos.clone()           // box lands on workbench center
  const IDLE_POS    = ex.vec(W * 0.72, RH * 0.68)   // worker resting spot (right side)
  // Worker stands just below the workbench front edge
  const BENCH_POS   = ex.vec(workbench.pos.x, workbench.pos.y + workbench.height / 2 + WORKER_SIZE / 2)

  // Delivery box
  const box = new ex.Actor({
    pos:    DOOR.clone(),
    width:  W  * 0.13,
    height: RH * 0.10,
    z: 3,
    color: ex.Color.fromHex('#c49a3c'),
  })
  box.graphics.visible = false
  applySprite(box, 'delivery_box')
  scene.add(box)

  // Opened box — visible on workbench during ASSEMBLY/READY (wider, flatter, lighter)
  const boxOpen = new ex.Actor({
    pos:    TABLE.clone(),
    width:  W  * 0.16,
    height: RH * 0.04,
    z: 3,
    color: ex.Color.fromHex('#e8c870'),
  })
  boxOpen.graphics.visible = false
  scene.add(boxOpen)

  // Drone silhouette on workbench
  const drone = new ex.Actor({
    pos:    ex.vec(W * 0.52, RH * 0.35),
    width:  W  * 0.18,
    height: RH * 0.09,
    z: 4,
    color: ex.Color.fromHex('#2a2a3e'),
  })
  drone.graphics.visible = false
  applySprite(drone, 'mini_drone')
  scene.add(drone)

  // Worker
  const worker = createWorker(scene, {
    W, RH,
    doorPos:  DOOR,
    benchPos: BENCH_POS,
    idlePos:  IDLE_POS,
    box,
    tablePos: TABLE,
    onBoxPicked,
    onSolderRequested,
  })
  worker.setupSprite(getSprite('worker_walk'))

  // Tap box → worker fetches (gated to DELIVERY phase)
  box.on('pointerup', () => {
    if (currentPhase === Phase.DELIVERY) worker.commandDeliver()
  })

  // Tap workbench → solder (ASSEMBLY) or sell (READY)
  workbench.on('pointerup', () => {
    if (currentPhase === Phase.ASSEMBLY) worker.commandSolder()
    if (currentPhase === Phase.READY)    onSellRequested?.()
  })

  return {
    engine: { getFps: () => engine.clock.fpsSampler.fps, _ex: engine },
    scene,
    box,
    boxOpen,
    drone,
    worker,
    _boxDoor: DOOR,
  }
}

export function updateScene(refs, phase) {
  if (!refs?.box) return

  currentPhase = phase

  const { box, boxOpen, drone, worker, _boxDoor } = refs

  const assembling = phase === Phase.ASSEMBLY || phase === Phase.READY

  box.graphics.visible     = phase === Phase.DELIVERY
  boxOpen.graphics.visible = assembling
  drone.graphics.visible   = assembling

  // Reset closed box to door between cycles (not during active assembly)
  if (!assembling && phase !== Phase.DELIVERY) {
    box.actions.clearActions()
    box.pos.x = _boxDoor.x
    box.pos.y = _boxDoor.y
  }

  // Return worker to idle spot between cycles
  if (phase === Phase.IDLE) worker?.reset()
}
