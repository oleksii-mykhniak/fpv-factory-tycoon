// Excalibur-specific loader. Imports ex.ImageSource — never import this in Node unit tests.
// Pure cache logic (getSprite) lives in spriteCache.js (Node-safe).
import { ImageSource } from 'excalibur'
import { SPRITES } from '../assets/manifest.js'
import { _spriteCache } from './spriteCache.js'

export { getSprite } from './spriteCache.js'
export { getAnchor } from '../assets/manifest.js'

// Load all manifest entries into the shared cache.
// Always resolves — missing / broken files are stored as null (fallback to rect).
// onProgress(loaded, total) fires after each attempt.
export async function loadSprites(onProgress) {
  const entries = Object.entries(SPRITES)
  let loaded = 0

  await Promise.all(entries.map(async ([key, entry]) => {
    if (_spriteCache.has(key)) { onProgress?.(++loaded, entries.length); return }

    try {
      const src = new ImageSource(entry.url)
      await src.load()
      _spriteCache.set(key, src)
    } catch (err) {
      console.warn(`[loader] "${key}" (${entry.url}) not loaded:`, err?.message ?? err)
      _spriteCache.setFailed(key)
    }

    onProgress?.(++loaded, entries.length)
  }))
}
