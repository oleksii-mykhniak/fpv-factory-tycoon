// Pure worker FSM — no Excalibur imports, testable in Node.

export const WS = {
  IDLE:         'idle',
  WALK_DOOR:    'walkDoor',
  EXIT_OUTSIDE: 'exitOutside',
  PICK:         'pick',
  CARRY:        'carry',
  AT_BENCH:     'atBench',
  SOLDER:       'solder',
  SELL:         'sell',
  FREE_WALK:    'freeWalk',
}

const T = {
  [WS.IDLE]:         { startDelivery: WS.WALK_DOOR, startSell: WS.SELL, startFreeWalk: WS.FREE_WALK },
  [WS.FREE_WALK]:    { stopFreeWalk: WS.IDLE, startDelivery: WS.WALK_DOOR, startSell: WS.SELL },
  [WS.WALK_DOOR]:    { arrivedAtDoor: WS.EXIT_OUTSIDE },
  [WS.EXIT_OUTSIDE]: { arrivedOutside: WS.PICK },
  [WS.PICK]:         { pickedUp: WS.CARRY },
  [WS.CARRY]:        { arrivedAtBench: WS.AT_BENCH },
  [WS.AT_BENCH]:     { startSolder: WS.SOLDER, startSell: WS.SELL },
  [WS.SOLDER]:       { solderDone: WS.IDLE },
  [WS.SELL]:         { sellDone: WS.IDLE },
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

export const workerCanDeliver = (ws) => ws.state === WS.IDLE || ws.state === WS.FREE_WALK
export const workerCanSolder  = (ws) => ws.state === WS.AT_BENCH
export const workerCanSell    = (ws) => ws.state === WS.IDLE || ws.state === WS.AT_BENCH || ws.state === WS.FREE_WALK
