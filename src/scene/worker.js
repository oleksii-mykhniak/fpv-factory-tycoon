import * as ex from 'excalibur'
import {
  WS, createWorkerState, workerTransition,
  workerCanDeliver, workerCanSolder,
} from './workerFSM.js'

// Worker Actor + movement. FSM logic lives in workerFSM.js (testable in Node).
//
// config:
//   W, RH          — canvas/room dimensions
//   doorPos        — where worker walks to fetch the box (box spawn point)
//   benchPos       — where worker stands when at the workbench
//   idlePos        — default resting position
//   box            — the box Actor (animated alongside worker during carry)
//   tablePos       — where the box lands on the workbench surface
//   onBoxPicked    — called after worker delivers box to bench
//   onSolderRequested — called when worker starts soldering (T3 opens mini-game)

const FRAME_W = 48  // worker_walk.png frame dimensions
const FRAME_H = 48

export function createWorker(scene, {
  W, RH,
  doorPos, benchPos, idlePos,
  box, tablePos,
  onBoxPicked, onSolderRequested,
}) {
  let ws = createWorkerState()

  const actor = new ex.Actor({
    pos:    idlePos.clone(),
    width:  W  * 0.18,
    height: W  * 0.18,
    z: 5,
    color: ex.Color.fromHex('#f0a030'),
  })
  scene.add(actor)

  // Animation handles — set by setupSprite() once spritesheet is loaded.
  let walkAnim = null
  let idleAnim = null

  function setMoving(moving, toRight = false) {
    if (!walkAnim) return
    actor.graphics.flipHorizontal = toRight
    actor.graphics.use(moving ? 'walk' : 'idle')
  }

  function dispatch(event) {
    ws = workerTransition(ws, event)
  }

  // Tap on box triggers this (only accepted in IDLE worker state).
  function commandDeliver() {
    if (!workerCanDeliver(ws)) return
    dispatch('startDelivery')
    // Door is to the left of idle pos — walk left
    const goingLeft = doorPos.x < actor.pos.x
    setMoving(true, !goingLeft)
    actor.actions.clearActions()
    actor.actions
      .moveTo(doorPos, 150)
      .callMethod(() => {
        dispatch('arrivedAtDoor')
        setMoving(false)
        // Brief pause while picking up
        actor.actions.delay(250).callMethod(() => {
          dispatch('pickedUp')
          // Walk toward bench (roughly center — going right from door)
          setMoving(true, benchPos.x > doorPos.x)
          // Box and worker travel to workbench together
          box.actions.clearActions()
          box.actions.moveTo(tablePos, 180)
          actor.actions
            .moveTo(benchPos, 180)
            .callMethod(() => {
              dispatch('arrivedAtBench')
              setMoving(false)
              onBoxPicked()
            })
        })
      })
  }

  // Tap on workbench triggers this (only accepted in AT_BENCH worker state).
  function commandSolder() {
    if (!workerCanSolder(ws)) return
    dispatch('startSolder')
    onSolderRequested()
  }

  // Call when the solder mini-game session ends (T3+ wires this).
  function notifySolderDone() {
    dispatch('solderDone')
  }

  // Reset to idle: walk back if not already there.
  function reset() {
    if (ws.state === WS.IDLE) return
    actor.actions.clearActions()
    setMoving(true, idlePos.x > actor.pos.x)
    actor.actions.moveTo(idlePos, 150).callMethod(() => setMoving(false))
    ws = createWorkerState()
  }

  // Called from scene.js once sprites are loaded. Sets up walk/idle animations.
  function setupSprite(src) {
    if (!src) return
    const sheet = ex.SpriteSheet.fromImageSource({
      image: src,
      grid: { rows: 1, columns: 4, spriteWidth: FRAME_W, spriteHeight: FRAME_H },
    })
    const sx = actor.width  / FRAME_W
    const sy = actor.height / FRAME_H

    walkAnim = ex.Animation.fromSpriteSheet(sheet, [0, 1, 2, 3], 120)
    walkAnim.scale = ex.vec(sx, sy)

    idleAnim = ex.Animation.fromSpriteSheet(sheet, [0], 1000)
    idleAnim.scale = ex.vec(sx, sy)

    actor.graphics.add('walk', walkAnim)
    actor.graphics.add('idle', idleAnim)
    actor.graphics.use('idle')
  }

  return { actor, commandDeliver, commandSolder, notifySolderDone, reset, setupSprite, getState: () => ws.state }
}
