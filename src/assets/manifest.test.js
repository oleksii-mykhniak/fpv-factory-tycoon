import { describe, it, expect } from 'vitest'
import { SPRITES, getManifestEntry, spriteKeys } from './manifest.js'
import { KIT_TYPES } from '../state/kits.js'

describe('manifest structure', () => {
  it('every entry has a non-empty url string', () => {
    for (const [key, entry] of Object.entries(SPRITES)) {
      expect(typeof entry.url, `${key}.url`).toBe('string')
      expect(entry.url.length, `${key}.url non-empty`).toBeGreaterThan(0)
    }
  })

  it('every entry has an anchors object', () => {
    for (const [key, entry] of Object.entries(SPRITES)) {
      expect(typeof entry.anchors, `${key}.anchors`).toBe('object')
    }
  })

  it('every kit spriteKey is registered in the manifest', () => {
    for (const kit of Object.values(KIT_TYPES)) {
      expect(
        SPRITES[kit.spriteKey],
        `kit "${kit.id}" spriteKey "${kit.spriteKey}" missing from manifest`,
      ).toBeDefined()
    }
  })

  it('solderPoints anchors length matches kit solderPointCount', () => {
    for (const kit of Object.values(KIT_TYPES)) {
      if (kit.isSpecial) continue  // special kits may reuse sprites with different step counts
      const entry = SPRITES[kit.spriteKey]
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
    expect(getManifestEntry('mini_drone')).toBe(SPRITES.mini_drone)
  })

  it('getManifestEntry returns null for unknown key', () => {
    expect(getManifestEntry('unknown_sprite')).toBeNull()
  })

  it('spriteKeys returns all registered keys', () => {
    expect(spriteKeys()).toEqual(Object.keys(SPRITES))
  })
})
