import { describe, it, expect, beforeEach } from 'vitest'
import { createSpriteCache, _spriteCache, getSprite } from './spriteCache.js'

// All tests run in Node — no Excalibur, no WebGL required.
// Excalibur paths only execute when the cache holds a real ImageSource;
// tests only exercise the null/fallback paths so they stay Node-safe.

describe('createSpriteCache — isolated instance', () => {
  let c

  beforeEach(() => { c = createSpriteCache() })

  it('getRaw on unknown key returns undefined', () => {
    expect(c.getRaw('never_loaded')).toBeUndefined()
  })

  it('set stores a value, getRaw returns it', () => {
    const fakeSrc = { path: 'mini_drone.png' }
    c.set('mini_drone', fakeSrc)
    expect(c.getRaw('mini_drone')).toBe(fakeSrc)
  })

  it('setFailed stores null, distinguishable from "not attempted"', () => {
    c.setFailed('delivery_box')
    expect(c.getRaw('delivery_box')).toBeNull()
    expect(c.has('delivery_box')).toBe(true)
  })

  it('has returns false before any attempt', () => {
    expect(c.has('workbench')).toBe(false)
  })

  it('has returns true after set', () => {
    c.set('workbench', { path: 'workbench.png' })
    expect(c.has('workbench')).toBe(true)
  })

  it('has returns true after setFailed', () => {
    c.setFailed('workbench')
    expect(c.has('workbench')).toBe(true)
  })
})

describe('getSprite — fallback contract (shared cache)', () => {
  it('returns null for a key that failed to load', () => {
    _spriteCache.setFailed('__test_fail__')
    expect(getSprite('__test_fail__')).toBeNull()
  })

  it('returns null for a key never attempted', () => {
    expect(getSprite('__never_attempted__')).toBeNull()
  })

  it('returns the stored value for a successfully loaded key', () => {
    const fakeSrc = { path: 'test.png' }
    _spriteCache.set('__test_ok__', fakeSrc)
    expect(getSprite('__test_ok__')).toBe(fakeSrc)
  })
})
