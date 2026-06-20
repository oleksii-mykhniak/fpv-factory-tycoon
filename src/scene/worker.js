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

export function createWorker(scene, {
  W, RH,
  doorPos, benchPos, idlePos,
  box, tablePos,
  onBoxPicked, onSolderRequested,
}) {
  let ws = createWorkerState()

  const actor = new ex.Actor({
    pos:    idlePos.clone(),
    width:  W  * 0.09,
    height: W  * 0.09,
    z: 5,
    color: ex.Color.fromHex('#f0a030'),
  })
  scene.add(actor)

  function dispatch(event) {
    ws = workerTransition(ws, event)
  }

  // Tap on box triggers this (only accepted in IDLE worker state).
  function commandDeliver() {
    if (!workerCanDeliver(ws)) return
    dispatch('startDelivery')
    actor.actions.clearActions()
    actor.actions
      .moveTo(doorPos, 150)
      .callMethod(() => {
        dispatch('arrivedAtDoor')
        // Brief pause while picking up
        actor.actions.delay(250).callMethod(() => {
          dispatch('pickedUp')
          // Box and worker travel to workbench together
          box.actions.clearActions()
          box.actions.moveTo(tablePos, 180)
          actor.actions
            .moveTo(benchPos, 180)
            .callMethod(() => {
              dispatch('arrivedAtBench')
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
    actor.actions.moveTo(idlePos, 150)
    ws = createWorkerState()
  }

  return { actor, commandDeliver, commandSolder, notifySolderDone, reset, getState: () => ws.state }
}
