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
  TRASH:        'trash',
  SCRAP_WALK:   'scrapWalk',   // walking to trash bin for scrap pickup
  AT_TRASH:     'atTrash',     // at trash bin, Tinder game running
  SCRAP_CARRY:  'scrapCarry',  // carrying scrap parts back to bench
  FREE_WALK:    'freeWalk',
}

const T = {
  [WS.IDLE]:         { startDelivery: WS.WALK_DOOR, startSell: WS.SELL, startTrash: WS.TRASH, startScrapWalk: WS.SCRAP_WALK, startFreeWalk: WS.FREE_WALK },
  [WS.FREE_WALK]:    { stopFreeWalk: WS.IDLE, startDelivery: WS.WALK_DOOR, startSell: WS.SELL, startTrash: WS.TRASH, startScrapWalk: WS.SCRAP_WALK },
  [WS.WALK_DOOR]:    { arrivedAtDoor: WS.EXIT_OUTSIDE },
  [WS.EXIT_OUTSIDE]: { arrivedOutside: WS.PICK },
  [WS.PICK]:         { pickedUp: WS.CARRY },
  [WS.CARRY]:        { arrivedAtBench: WS.AT_BENCH },
  [WS.AT_BENCH]:     { startSolder: WS.SOLDER, startSell: WS.SELL, startTrash: WS.TRASH },
  [WS.SOLDER]:       { solderDone: WS.IDLE, startTrash: WS.TRASH },
  [WS.SELL]:         { sellDone: WS.IDLE },
  [WS.TRASH]:        { trashDone: WS.IDLE },
  [WS.SCRAP_WALK]:   { arrivedAtTrash: WS.AT_TRASH },
  [WS.AT_TRASH]:     { scrapDone: WS.SCRAP_CARRY, scrapFailed: WS.IDLE },
  [WS.SCRAP_CARRY]:  { arrivedAtBench: WS.AT_BENCH },
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

export const workerCanDeliver     = (ws) => ws.state === WS.IDLE || ws.state === WS.FREE_WALK
export const workerCanSolder      = (ws) => ws.state === WS.AT_BENCH
export const workerCanSell        = (ws) => ws.state === WS.IDLE || ws.state === WS.AT_BENCH || ws.state === WS.FREE_WALK
export const workerCanTrash       = (ws) => ws.state === WS.IDLE || ws.state === WS.FREE_WALK || ws.state === WS.AT_BENCH || ws.state === WS.SOLDER
export const workerCanScrapPickup = (ws) => ws.state === WS.IDLE || ws.state === WS.FREE_WALK
export const workerIsDoingScrap   = (ws) => ws.state === WS.SCRAP_WALK || ws.state === WS.AT_TRASH || ws.state === WS.SCRAP_CARRY
