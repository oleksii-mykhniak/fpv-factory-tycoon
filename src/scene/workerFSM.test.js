import { describe, it, expect } from 'vitest'
import {
  WS, createWorkerState, workerTransition,
  workerCanDeliver, workerCanSolder,
} from './workerFSM.js'

describe('workerFSM', () => {
  it('starts idle', () => {
    expect(createWorkerState()).toEqual({ state: WS.IDLE })
  })

  it('full delivery path idle→walkDoor→pick→carry→atBench', () => {
    let ws = createWorkerState()
    const steps = [
      ['startDelivery',  WS.WALK_DOOR],
      ['arrivedAtDoor',  WS.PICK],
      ['pickedUp',       WS.CARRY],
      ['arrivedAtBench', WS.AT_BENCH],
    ]
    for (const [event, expected] of steps) {
      ws = workerTransition(ws, event)
      expect(ws.state).toBe(expected)
    }
  })

  it('solder cycle atBench→solder→idle', () => {
    let ws = { state: WS.AT_BENCH }
    ws = workerTransition(ws, 'startSolder')
    expect(ws.state).toBe(WS.SOLDER)
    ws = workerTransition(ws, 'solderDone')
    expect(ws.state).toBe(WS.IDLE)
  })

  it('reset from any state → idle', () => {
    for (const s of Object.values(WS)) {
      expect(workerTransition({ state: s }, 'reset').state).toBe(WS.IDLE)
    }
  })

  it('invalid transition is no-op (returns same object)', () => {
    const ws = createWorkerState()
    expect(workerTransition(ws, 'arrivedAtDoor')).toBe(ws)
    expect(workerTransition(ws, 'startSolder')).toBe(ws)
    expect(workerTransition({ state: WS.SOLDER }, 'startDelivery')).toEqual({ state: WS.SOLDER })
  })

  it('workerCanDeliver only when idle', () => {
    expect(workerCanDeliver({ state: WS.IDLE })).toBe(true)
    for (const s of Object.values(WS).filter(s => s !== WS.IDLE)) {
      expect(workerCanDeliver({ state: s })).toBe(false)
    }
  })

  it('workerCanSolder only when atBench', () => {
    expect(workerCanSolder({ state: WS.AT_BENCH })).toBe(true)
    for (const s of Object.values(WS).filter(s => s !== WS.AT_BENCH)) {
      expect(workerCanSolder({ state: s })).toBe(false)
    }
  })

  it('immutability: transition returns new object', () => {
    const ws = createWorkerState()
    const ws2 = workerTransition(ws, 'startDelivery')
    expect(ws2).not.toBe(ws)
    expect(ws.state).toBe(WS.IDLE)
  })
})
