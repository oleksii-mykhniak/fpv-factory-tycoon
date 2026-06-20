import { describe, it, expect, beforeEach } from 'vitest'
import { createModelCache, _modelCache, getModel, getAnchor } from './modelCache.js'

// All tests run in Node — no Babylon, no WebGL required.
// Babylon paths (clone, setEnabled) only execute when the cache holds a real mesh;
// tests only exercise the null/fallback paths so they stay Node-safe.

describe('createModelCache — isolated instance', () => {
  let c

  beforeEach(() => { c = createModelCache() })

  it('getRaw on unknown key returns undefined', () => {
    expect(c.getRaw('never_loaded')).toBeUndefined()
  })

  it('set stores a mesh, getRaw returns it', () => {
    const fakeMesh = { name: 'root' }
    c.set('mini_drone', fakeMesh)
    expect(c.getRaw('mini_drone')).toBe(fakeMesh)
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
    c.set('workbench', { name: 'root' })
    expect(c.has('workbench')).toBe(true)
  })

  it('has returns true after setFailed', () => {
    c.setFailed('workbench')
    expect(c.has('workbench')).toBe(true)
  })
})

describe('getModel — fallback contract (shared cache)', () => {
  it('returns null for a key that failed to load', () => {
    _modelCache.setFailed('__test_fail__')
    expect(getModel('__test_fail__')).toBeNull()
  })

  it('returns null for a key never attempted', () => {
    expect(getModel('__never_attempted__')).toBeNull()
  })
})

describe('getAnchor — null safety', () => {
  it('returns null when modelInstance is null', () => {
    expect(getAnchor(null, 'anchor_root')).toBeNull()
  })

  it('returns null when modelInstance is undefined', () => {
    expect(getAnchor(undefined, 'anchor_root')).toBeNull()
  })

  it('returns null when anchor not found in children', () => {
    const fakeInstance = { getChildTransformNodes: () => [] }
    expect(getAnchor(fakeInstance, 'anchor_root')).toBeNull()
  })

  it('returns the node when anchor name matches', () => {
    const anchor = { name: 'anchor_root' }
    const fakeInstance = { getChildTransformNodes: () => [anchor] }
    expect(getAnchor(fakeInstance, 'anchor_root')).toBe(anchor)
  })
})
