import {
  Engine, Scene,
  ArcRotateCamera,
  HemisphericLight, PointLight,
  TransformNode,
  Vector3, Color3, Color4,
  MeshBuilder,
  StandardMaterial,
  ActionManager, ExecuteCodeAction,
  Animation,
} from '@babylonjs/core'
import { Phase } from '../state/gameState.js'

// World constants
const TABLE_TOP_Y  = 1.575
const BOX_DOOR_POS = new Vector3(-4.2, 0.38, 1.8)
const BOX_TABLE_POS = new Vector3(0.3, TABLE_TOP_Y + 0.45, 0.2)

// ── Public API ────────────────────────────────────────────

export function initScene(canvas, { onBoxPicked }) {
  const engine = new Engine(canvas, false) // antialiasing off — mobile perf
  const scene  = new Scene(engine)
  scene.clearColor = new Color4(0.07, 0.07, 0.11, 1)

  // Sims-like isometric camera: from +X+Z corner looking at −X−Z corner
  // alpha=PI/4 puts camera diagonally front-right so back+left walls are both visible
  const camera = new ArcRotateCamera('cam', Math.PI / 4, 0.88, 20,
    new Vector3(-0.5, 0.6, -0.5), scene)
  camera.inputs.clear()

  // Hemisphere for ambient fill + point light above the workbench
  const ambient = new HemisphericLight('ambient', new Vector3(0.3, 1, 0.2), scene)
  ambient.intensity   = 0.7
  ambient.diffuse     = new Color3(1, 0.92, 0.85)
  ambient.groundColor = new Color3(0.1, 0.1, 0.2)

  const workLamp = new PointLight('workLamp', new Vector3(0, 5, 0), scene)
  workLamp.intensity = 0.6
  workLamp.diffuse   = new Color3(1, 0.95, 0.8)

  buildRoom(scene)
  const box   = buildBox(scene)
  const drone = buildDrone(scene)

  // Box click → animate to table → fire callback
  let animating = false
  box.actionManager = new ActionManager(scene)
  box.actionManager.registerAction(
    new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
      if (animating) return
      animating = true
      animateBoxToTable(box, scene, () => {
        animating = false
        onBoxPicked()
      })
    })
  )

  engine.runRenderLoop(() => scene.render())
  window.addEventListener('resize', () => engine.resize())

  return { engine, scene, box, drone }
}

// Call after every state change to sync visibility.
export function updateScene(refs, phase) {
  if (!refs) return

  refs.box.setEnabled(phase === Phase.DELIVERY)
  refs.drone.setEnabled(phase === Phase.ASSEMBLY || phase === Phase.READY)

  // Reset box to door when not in delivery so it's ready for next cycle.
  if (phase !== Phase.DELIVERY) refs.box.position.copyFrom(BOX_DOOR_POS)
}

// ── Scene builders ────────────────────────────────────────

function material(scene, hex) {
  const m = new StandardMaterial('', scene)
  m.diffuseColor = Color3.FromHexString(hex)
  return m
}

function box3(scene, name, w, h, d, hex, x, y, z) {
  const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene)
  m.position.set(x, y, z)
  m.material = material(scene, hex)
  return m
}

function buildRoom(scene) {
  box3(scene, 'floor',    12,  0.2,  10,  '#1e1e2a',  0,  -0.1, 0)
  box3(scene, 'backWall', 12,  5.5,  0.2, '#252535',  0,   2.75, -5)
  box3(scene, 'leftWall', 0.2, 5.5,  10,  '#252535', -6,   2.75, 0)
  box3(scene, 'doorway',  1.5, 3.0,  0.2, '#1a1a28', -5.95, 1.5, 1.5)

  // Table
  box3(scene, 'tableTop', 3.6, 0.15, 2.2, '#6b4226',  0, TABLE_TOP_Y, 0)
  for (const [x, z] of [[-1.6, -0.9], [1.6, -0.9], [-1.6, 0.9], [1.6, 0.9]]) {
    const legH = TABLE_TOP_Y - 0.075
    box3(scene, `leg${x}${z}`, 0.12, legH, 0.12, '#5a3620', x, legH / 2, z)
  }

  // Workshop lamp (decorative)
  box3(scene, 'lampShade', 0.5, 0.15, 0.5, '#3a3a50', 0, 4.8, 0)
}

function buildBox(scene) {
  const b = MeshBuilder.CreateBox('deliveryBox', { size: 0.72 }, scene)
  b.position.copyFrom(BOX_DOOR_POS)
  b.material = material(scene, '#c49a3c')
  b.setEnabled(false)
  return b
}

function buildDrone(scene) {
  const root = new TransformNode('droneRoot', scene)
  root.position.set(0, TABLE_TOP_Y + 0.1, 0.15)

  // Flat body
  const body = MeshBuilder.CreateBox('droneBody', { width: 0.88, height: 0.1, depth: 0.88 }, scene)
  body.parent   = root
  body.material = material(scene, '#2a2a3e')

  // X-frame arms (two crossed bars at ±45°)
  for (const [i, angle] of [[0, Math.PI / 4], [1, -Math.PI / 4]]) {
    const arm = MeshBuilder.CreateBox(`arm${i}`, { width: 1.62, height: 0.07, depth: 0.1 }, scene)
    arm.parent    = root
    arm.rotation.y = angle
    arm.material  = material(scene, '#333355')
  }

  // Motor nacelles at corners
  for (const [i, x, z] of [[0, -0.48, -0.48], [1, 0.48, -0.48], [2, -0.48, 0.48], [3, 0.48, 0.48]]) {
    const n = MeshBuilder.CreateBox(`nacelle${i}`, { width: 0.22, height: 0.14, depth: 0.22 }, scene)
    n.parent   = root
    n.position.set(x, 0.04, z)
    n.material = material(scene, '#444466')
  }

  root.setEnabled(false)
  return root
}

function animateBoxToTable(b, scene, onComplete) {
  const anim = new Animation(
    'boxMove', 'position', 60,
    Animation.ANIMATIONTYPE_VECTOR3,
    Animation.ANIMATIONLOOPMODE_CONSTANT,
  )
  anim.setKeys([
    { frame: 0,  value: b.position.clone() },
    { frame: 14, value: new Vector3(BOX_TABLE_POS.x, 2.2, BOX_TABLE_POS.z) },
    { frame: 26, value: BOX_TABLE_POS.clone() },
  ])
  b.animations = [anim]
  scene.beginAnimation(b, 0, 26, false, 1, onComplete)
}
