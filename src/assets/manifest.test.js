import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
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

// Маніфест обіцяє файл, і ця обіцянка нічим не підкріплена: завантажувач ловить
// 404 і мовчки лишає актора без графіки, тому друкарка в імені виглядає точно
// як «спрайт не намалювали». Для генерованого набору це ловив
// scripts/sprites.test.js — він звіряє public/sprites зі скриптом; для
// завезеного ззовні (imported-art.js) не ловило НІЩО.
describe('manifest points at files that exist', () => {
  const PUBLIC = new URL('../../public/', import.meta.url).pathname

  it.each(Object.entries(SPRITES))('%s', (key, entry) => {
    // BASE_URL підставляється збіркою; у тесті нас цікавить шлях під public/.
    const rel = entry.url.replace(/^.*sprites\//, 'sprites/')
    expect(existsSync(join(PUBLIC, rel)), `${key} → ${rel}`).toBe(true)
  })
})
