import * as ex from 'excalibur'
import {
  WS, createWorkerState, workerTransition,
  workerCanDeliver, workerCanSolder, workerCanSell,
} from './workerFSM.js'

// Worker Actor + movement. FSM logic lives in workerFSM.js (testable in Node).
//
// config:
//   W, RH            — canvas/room dimensions
//   doorPos          — door threshold inside the room (near bottom wall gap)
//   boxSpawnPos      — outside position where box waits to be picked up
//   benchPos         — where worker stands when soldering
//   idlePos          — default resting position
//   mailboxPos       — mailbox outside (for sell animation)
//   box              — delivery box Actor (animated during carry)
//   tablePos         — where box lands on workbench
//   droneRef         — drone Actor (hidden when worker "carries" it to mailbox)
//   onBoxPicked      — called after worker delivers box to bench
//   onSolderRequested — called when worker starts soldering
//   onSellRequested  — called after worker drops drone at mailbox

const FRAME_W = 64
const FRAME_H = 64

export function createWorker(scene, {
  W, RH,
  doorPos, boxSpawnPos, benchPos, idlePos, mailboxPos,
  box, tablePos, droneRef,
  onBoxPicked, onSolderRequested, onSellRequested,
}) {
  let ws = createWorkerState()

  const WORKER_SIZE = W * 0.18

  const actor = new ex.Actor({
    pos:    idlePos.clone(),
    width:  WORKER_SIZE,
    height: WORKER_SIZE,
    z: 5,
    color: ex.Color.fromHex('#f0a030'),
  })
  scene.add(actor)

  // Y-sort within world objects: lower on screen (larger Y) renders in front.
  actor.on('preupdate', () => {
    actor.z = actor.pos.y * 0.01
  })

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

  // ── Delivery: worker exits outside → picks up box → carries to bench ──
  // Flat action chain (no nested actor.actions inside callMethod — avoids
  // Excalibur queue re-entry issues).
  function commandDeliver() {
    if (!workerCanDeliver(ws)) return
    actor.actions.clearActions()   // cancel any free walk
    dispatch('startDelivery')

    setMoving(true, doorPos.x > actor.pos.x)
    actor.actions
      .moveTo(doorPos, 150)
      .callMethod(() => {
        dispatch('arrivedAtDoor')
        // direction update: now heading outside (down)
      })
      .moveTo(boxSpawnPos, 120)
      .callMethod(() => {
        dispatch('arrivedOutside')
        setMoving(false)
      })
      .delay(220)
      .callMethod(() => {
        dispatch('pickedUp')
        box.actions.clearActions()
        actor.addChild(box)
        box.pos = ex.vec(WORKER_SIZE * 0.15, -WORKER_SIZE * 0.25)
        setMoving(true, benchPos.x > boxSpawnPos.x)
      })
      .moveTo(doorPos, 120)
      .moveTo(benchPos, 170)
      .callMethod(() => {
        dispatch('arrivedAtBench')
        // Re-add to scene after addChild orphaned it from Excalibur's render list.
        actor.removeChild(box)
        scene.add(box)
        box.pos = tablePos.clone()
        setMoving(false)
        onBoxPicked()
      })
  }

  // ── Solder: tap on workbench opens mini-game ──
  function commandSolder() {
    if (!workerCanSolder(ws)) return
    dispatch('startSolder')
    onSolderRequested()
  }

  // ── Sell: worker carries drone to mailbox, then returns to idle ──
  function commandSell() {
    if (!workerCanSell(ws)) return
    actor.actions.clearActions()
    dispatch('startSell')

    // Attach drone as child — it rides with the worker to the mailbox.
    if (droneRef) {
      actor.addChild(droneRef)
      droneRef.pos = ex.vec(-WORKER_SIZE * 0.1, -WORKER_SIZE * 0.28)
      droneRef.graphics.visible = true
    }

    setMoving(true, doorPos.x > actor.pos.x)
    actor.actions
      .moveTo(doorPos, 150)
      .moveTo(mailboxPos, 130)
      .callMethod(() => {
        dispatch('sellDone')
        setMoving(false)
        // Drop drone at mailbox: detach and re-add to scene (addChild may have
        // orphaned it from the scene's render list in Excalibur v0.32).
        if (droneRef) {
          actor.removeChild(droneRef)
          scene.add(droneRef)
          droneRef.pos = tablePos.clone()
          droneRef.graphics.visible = false
        }
        onSellRequested()
      })
      .callMethod(() => setMoving(true, idlePos.x > mailboxPos.x))
      .moveTo(doorPos, 120)
      .moveTo(idlePos, 150)
      .callMethod(() => setMoving(false))
  }

  // ── Free walk (D4.7): tap on floor moves worker; interrupted by real commands ──
  function walkTo(x, y) {
    if (ws.state !== WS.IDLE && ws.state !== WS.FREE_WALK) return
    dispatch('startFreeWalk')
    actor.actions.clearActions()
    setMoving(true, x > actor.pos.x)
    actor.actions
      .moveTo(ex.vec(x, y), 130)
      .callMethod(() => {
        dispatch('stopFreeWalk')
        setMoving(false)
      })
  }

  // Called once all solder points are done (T3+).
  function notifySolderDone() {
    dispatch('solderDone')
  }

  // Reset to idle (no-op if already IDLE — handles sell-animation case).
  function reset() {
    if (ws.state === WS.IDLE) return
    actor.actions.clearActions()
    setMoving(true, idlePos.x > actor.pos.x)
    actor.actions.moveTo(idlePos, 150).callMethod(() => setMoving(false))
    ws = createWorkerState()
  }

  // Called from scene.js once the spritesheet is loaded.
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

  return {
    actor,
    commandDeliver, commandSolder, commandSell, walkTo,
    notifySolderDone, reset, setupSprite,
    getState: () => ws.state,
  }
}
