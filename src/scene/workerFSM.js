// Pure worker FSM — no Excalibur imports, testable in Node.

export const WS = {
  IDLE:      'idle',
  WALK_DOOR: 'walkDoor',
  PICK:      'pick',
  CARRY:     'carry',
  AT_BENCH:  'atBench',
  SOLDER:    'solder',
}

// Allowed transitions per state.
const T = {
  [WS.IDLE]:      { startDelivery:  WS.WALK_DOOR },
  [WS.WALK_DOOR]: { arrivedAtDoor:  WS.PICK      },
  [WS.PICK]:      { pickedUp:       WS.CARRY      },
  [WS.CARRY]:     { arrivedAtBench: WS.AT_BENCH   },
  [WS.AT_BENCH]:  { startSolder:    WS.SOLDER     },
  [WS.SOLDER]:    { solderDone:     WS.IDLE       },
}

export function createWorkerState() {
  return { state: WS.IDLE }
}

// Returns a new state object, or the same object if the event is invalid.
export function workerTransition(ws, event) {
  if (event === 'reset') return { state: WS.IDLE }
  const next = T[ws.state]?.[event]
  return next ? { state: next } : ws
}

export const workerCanDeliver = (ws) => ws.state === WS.IDLE
export const workerCanSolder  = (ws) => ws.state === WS.AT_BENCH
