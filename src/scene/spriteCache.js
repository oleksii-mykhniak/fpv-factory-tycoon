// Pure JS — no Excalibur imports. Testable in Node without a WebGL context.
//
// Three cache states for a key:
//   undefined  — never attempted (has() returns false)
//   null       — attempted but failed (404 or parse error) → scene uses rect fallback
//   ImageSource — loaded successfully → getSprite() returns it

export function createSpriteCache() {
  const _map = new Map()

  return {
    set(key, src)  { _map.set(key, src) },
    setFailed(key) { _map.set(key, null) },
    has(key)       { return _map.has(key) },
    getRaw(key)    { return _map.get(key) },
  }
}

// Shared instance — lives for the lifetime of the page.
export const _spriteCache = createSpriteCache()

// Returns the ImageSource for the key, or null if not loaded / failed.
// undefined means never attempted (also returns null — treat as missing).
export function getSprite(key) {
  const src = _spriteCache.getRaw(key)
  if (src == null) return null
  return src
}
