import { describe, it, expect } from 'vitest'
import {
  WS, createWorkerState, workerTransition,
  workerCanDeliver, workerCanSolder, workerCanSell,
} from './workerFSM.js'

describe('workerFSM', () => {
  it('starts idle', () => {
    expect(createWorkerState()).toEqual({ state: WS.IDLE })
  })

  it('full delivery path idle→walkDoor→exitOutside→pick→carry→atBench', () => {
    let ws = createWorkerState()
    const steps = [
      ['startDelivery',  WS.WALK_DOOR],
      ['arrivedAtDoor',  WS.EXIT_OUTSIDE],
      ['arrivedOutside', WS.PICK],
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

  it('sell cycle idle→sell→idle', () => {
    let ws = createWorkerState()
    ws = workerTransition(ws, 'startSell')
    expect(ws.state).toBe(WS.SELL)
    ws = workerTransition(ws, 'sellDone')
    expect(ws.state).toBe(WS.IDLE)
  })

  it('sell also starts from atBench', () => {
    let ws = { state: WS.AT_BENCH }
    ws = workerTransition(ws, 'startSell')
    expect(ws.state).toBe(WS.SELL)
  })

  it('free walk cycle idle→freeWalk→idle', () => {
    let ws = createWorkerState()
    ws = workerTransition(ws, 'startFreeWalk')
    expect(ws.state).toBe(WS.FREE_WALK)
    ws = workerTransition(ws, 'stopFreeWalk')
    expect(ws.state).toBe(WS.IDLE)
  })

  it('free walk interrupted by delivery', () => {
    let ws = createWorkerState()
    ws = workerTransition(ws, 'startFreeWalk')
    ws = workerTransition(ws, 'startDelivery')
    expect(ws.state).toBe(WS.WALK_DOOR)
  })

  it('free walk interrupted by sell', () => {
    let ws = createWorkerState()
    ws = workerTransition(ws, 'startFreeWalk')
    ws = workerTransition(ws, 'startSell')
    expect(ws.state).toBe(WS.SELL)
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

  it('workerCanDeliver when idle or free-walking', () => {
    expect(workerCanDeliver({ state: WS.IDLE })).toBe(true)
    expect(workerCanDeliver({ state: WS.FREE_WALK })).toBe(true)
    const blocked = Object.values(WS).filter(s => s !== WS.IDLE && s !== WS.FREE_WALK)
    for (const s of blocked) {
      expect(workerCanDeliver({ state: s })).toBe(false)
    }
  })

  it('workerCanSolder only when atBench', () => {
    expect(workerCanSolder({ state: WS.AT_BENCH })).toBe(true)
    for (const s of Object.values(WS).filter(s => s !== WS.AT_BENCH)) {
      expect(workerCanSolder({ state: s })).toBe(false)
    }
  })

  it('workerCanSell from idle, atBench, freeWalk', () => {
    const allowed = [WS.IDLE, WS.AT_BENCH, WS.FREE_WALK]
    for (const s of allowed) expect(workerCanSell({ state: s })).toBe(true)
    const blocked = Object.values(WS).filter(s => !allowed.includes(s))
    for (const s of blocked) expect(workerCanSell({ state: s })).toBe(false)
  })

  it('immutability: transition returns new object', () => {
    const ws = createWorkerState()
    const ws2 = workerTransition(ws, 'startDelivery')
    expect(ws2).not.toBe(ws)
    expect(ws.state).toBe(WS.IDLE)
  })
})
