import * as ex from 'excalibur'
import { Phase } from '../state/gameState.js'
import { loadSprites, getSprite } from './loader.js'

const BG = ex.Color.fromHex('#0e0e18')

// Room uses only the top 65% of canvas height — the rest is DOM overlay.
// Measured: DOM panel starts at ~572/844px ≈ 68%; 65% gives 23px clearance.
const ROOM_H = 0.65

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

function buildRoom(scene, W, H) {
  const WW = W * 0.06      // side wall thickness
  const HW = H * 0.035     // top/bottom wall thickness
  const RH = H * ROOM_H   // room height in px

  // Floor
  colorRect(scene, { x: W * 0.5, y: RH * 0.5, w: W, h: RH, hex: '#1a1a26', z: 0 })

  // Top wall
  colorRect(scene, { x: W * 0.5,       y: HW * 0.5,       w: W,   h: HW, hex: '#2e2e42', z: 1 })
  // Left wall
  colorRect(scene, { x: WW * 0.5,      y: RH * 0.5,       w: WW,  h: RH, hex: '#2e2e42', z: 1 })
  // Right wall
  colorRect(scene, { x: W - WW * 0.5,  y: RH * 0.5,       w: WW,  h: RH, hex: '#2e2e42', z: 1 })
  // Bottom wall — left of door (x: 0 → W*0.28)
  colorRect(scene, { x: W * 0.14,      y: RH - HW * 0.5,  w: W * 0.28, h: HW, hex: '#2e2e42', z: 1 })
  // Bottom wall — door gap (darker: outside void)
  colorRect(scene, { x: W * 0.38,      y: RH - HW * 0.5,  w: W * 0.20, h: HW, hex: '#0d0d15', z: 1 })
  // Bottom wall — right of door (x: W*0.48 → W)
  colorRect(scene, { x: W * 0.74,      y: RH - HW * 0.5,  w: W * 0.52, h: HW, hex: '#2e2e42', z: 1 })

  // Workbench (top-down: wide rect, upper portion of room)
  colorRect(scene, { x: W * 0.50, y: RH * 0.35,  w: W * 0.60, h: RH * 0.13, hex: '#6b4226', z: 2 })
  // Workbench front edge (thin darker strip)
  colorRect(scene, { x: W * 0.50, y: RH * 0.42,  w: W * 0.60, h: RH * 0.015, hex: '#4a2a18', z: 2 })

  // Ceiling lamp (seen from above as small bright square)
  colorRect(scene, { x: W * 0.50, y: RH * 0.16, w: W * 0.08, h: W * 0.08, hex: '#d4c060', z: 2 })
}

// ── Sprite swap ───────────────────────────────────────────
// If the sprite loaded, replace the Actor's rect graphic with it (scaled to fit).
// If the sprite is missing, the Actor shows its rect color — no other code changes.
function applySprite(actor, key) {
  const src = getSprite(key)
  if (!src) return
  const sprite = src.toSprite()
  sprite.width  = actor.width
  sprite.height = actor.height
  actor.graphics.use(sprite)
}

// ── Scene entry points ────────────────────────────────────

// Public API — contract unchanged from 3D era so main.js needs no edits.
//   initScene(canvas, { onBoxPicked, onLoadProgress }) → Promise<refs>
//   updateScene(refs, phase)
//   refs.engine.getFps()

export async function initScene(canvas, { onBoxPicked, onLoadProgress }) {
  const engine = new ex.Engine({
    canvasElement: canvas,
    backgroundColor: BG,
    displayMode: ex.DisplayMode.FillScreen,
    antialiasing: false,
  })

  await loadSprites(onLoadProgress)
  await engine.start()

  const W = engine.drawWidth
  const H = engine.drawHeight
  const scene = engine.currentScene

  const RH = H * ROOM_H
  buildRoom(scene, W, H)

  // Box: spawns at door gap (bottom of room), slides to workbench on tap
  const DOOR  = ex.vec(W * 0.38, RH * 0.88)
  const TABLE = ex.vec(W * 0.50, RH * 0.35)

  const box = new ex.Actor({
    pos: DOOR.clone(),
    width:  W * 0.13,
    height: RH * 0.10,
    z: 3,
    color: ex.Color.fromHex('#c49a3c'),
  })
  box.graphics.visible = false

  let animating = false
  box.on('pointerup', () => {
    if (animating) return
    animating = true
    box.actions
      .moveTo(ex.vec(W * 0.50, RH * 0.62), 600)  // slide toward center
      .moveTo(TABLE, 500)                           // arrive at workbench
      .callMethod(() => { animating = false; onBoxPicked() })
  })
  applySprite(box, 'delivery_box')
  scene.add(box)

  // Drone on workbench — shown during assembly / ready
  const drone = new ex.Actor({
    pos: ex.vec(W * 0.52, RH * 0.35),
    width:  W * 0.18,
    height: RH * 0.09,
    z: 4,
    color: ex.Color.fromHex('#2a2a3e'),
  })
  drone.graphics.visible = false
  applySprite(drone, 'mini_drone')
  scene.add(drone)

  return {
    engine: { getFps: () => engine.clock.fpsSampler.fps, _ex: engine },
    scene,
    box,
    drone,
    _boxDoor: DOOR,   // stored for updateScene to reset position
  }
}

export function updateScene(refs, phase) {
  if (!refs?.box) return

  const { box, drone, _boxDoor } = refs

  box.graphics.visible   = phase === Phase.DELIVERY
  drone.graphics.visible = phase === Phase.ASSEMBLY || phase === Phase.READY

  // Reset box to door when not in delivery so it's ready for next cycle
  if (phase !== Phase.DELIVERY) {
    box.actions.clearActions()
    box.pos.x = _boxDoor.x
    box.pos.y = _boxDoor.y
  }
}
