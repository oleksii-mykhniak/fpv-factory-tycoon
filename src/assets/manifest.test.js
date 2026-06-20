import { describe, it, expect } from 'vitest'
import { MODELS, getManifestEntry, modelKeys } from './manifest.js'
import { KIT_TYPES } from '../state/kits.js'

describe('manifest structure', () => {
  it('every entry has a non-empty url string', () => {
    for (const [key, entry] of Object.entries(MODELS)) {
      expect(typeof entry.url, `${key}.url`).toBe('string')
      expect(entry.url.length, `${key}.url non-empty`).toBeGreaterThan(0)
    }
  })

  it('every entry has an anchors object', () => {
    for (const [key, entry] of Object.entries(MODELS)) {
      expect(typeof entry.anchors, `${key}.anchors`).toBe('object')
    }
  })

  it('every kit modelKey is registered in the manifest', () => {
    for (const kit of Object.values(KIT_TYPES)) {
      expect(
        MODELS[kit.modelKey],
        `kit "${kit.id}" modelKey "${kit.modelKey}" missing from manifest`,
      ).toBeDefined()
    }
  })

  it('solderPoints anchors length matches kit solderPointCount', () => {
    for (const kit of Object.values(KIT_TYPES)) {
      const entry = MODELS[kit.modelKey]
      if (!entry?.anchors?.solderPoints) continue
      expect(
        entry.anchors.solderPoints.length,
        `${kit.id} solderPoints count`,
      ).toBe(kit.solderPointCount)
    }
  })
})

describe('manifest helpers', () => {
  it('getManifestEntry returns entry for known key', () => {
    expect(getManifestEntry('mini_drone')).toBe(MODELS.mini_drone)
  })

  it('getManifestEntry returns null for unknown key', () => {
    expect(getManifestEntry('unknown_model')).toBeNull()
  })

  it('modelKeys returns all registered keys', () => {
    expect(modelKeys()).toEqual(Object.keys(MODELS))
  })
})
