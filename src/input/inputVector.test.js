import { describe, it, expect } from 'vitest'
import { keysToVector, applyDeadzone, mergeInput } from './inputVector.js'

const mag = ({ x, y }) => Math.hypot(x, y)

describe('input/keysToVector', () => {
  it('maps a single key to a unit vector', () => {
    expect(keysToVector({ right: true })).toEqual({ x: 1, y: 0 })
    expect(keysToVector({ up: true })).toEqual({ x: 0, y: -1 })
  })

  it('normalises diagonals so they are not faster than straight lines', () => {
    expect(mag(keysToVector({ up: true, right: true }))).toBeCloseTo(1)
  })

  it('cancels opposite keys', () => {
    expect(keysToVector({ left: true, right: true })).toEqual({ x: 0, y: 0 })
  })

  it('treats no keys as centred', () => {
    expect(keysToVector({})).toEqual({ x: 0, y: 0 })
    expect(keysToVector()).toEqual({ x: 0, y: 0 })
  })
})

describe('input/applyDeadzone', () => {
  it('zeroes anything inside the deadzone', () => {
    expect(applyDeadzone({ x: 0.1, y: 0 }, 0.2)).toEqual({ x: 0, y: 0 })
  })

  it('rescales so the deadzone edge is zero, not a speed jump', () => {
    const justOutside = applyDeadzone({ x: 0.21, y: 0 }, 0.2)
    expect(justOutside.x).toBeGreaterThan(0)
    expect(justOutside.x).toBeLessThan(0.05)
  })

  it('keeps full deflection at full speed', () => {
    expect(mag(applyDeadzone({ x: 1, y: 0 }, 0.2))).toBeCloseTo(1)
  })

  it('never exceeds magnitude 1, even past the stick radius', () => {
    expect(mag(applyDeadzone({ x: 3, y: 4 }, 0.2))).toBeLessThanOrEqual(1 + 1e-9)
  })

  it('preserves direction while rescaling', () => {
    const out = applyDeadzone({ x: 0.6, y: 0.6 }, 0.2)
    expect(out.x).toBeCloseTo(out.y)
  })
})

describe('input/mergeInput', () => {
  it('uses the keyboard when the stick is idle', () => {
    expect(mergeInput({ joystick: { x: 0, y: 0 }, keys: { left: true } }, 0.2))
      .toEqual({ x: -1, y: 0 })
  })

  it('lets the stick win over the keyboard rather than summing them', () => {
    const out = mergeInput({ joystick: { x: 1, y: 0 }, keys: { left: true } }, 0.2)
    expect(out.x).toBeCloseTo(1)   // not 0, and not 2
  })

  it('ignores a stick resting inside the deadzone', () => {
    expect(mergeInput({ joystick: { x: 0.05, y: 0.05 }, keys: {} }, 0.2))
      .toEqual({ x: 0, y: 0 })
  })

  it('is safe with no sources at all', () => {
    expect(mergeInput()).toEqual({ x: 0, y: 0 })
  })
})
