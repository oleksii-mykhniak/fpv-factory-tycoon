let _muted = false
const _cache = new Map()

function _get(name) {
  if (_cache.has(name)) return _cache.get(name)
  const a = new Audio(`/audio/${name}.mp3`)
  a.preload = 'none'
  _cache.set(name, a)
  return a
}

export function setMuted(val) { _muted = Boolean(val) }
export function isMuted()     { return _muted }

export function playSfx(name) {
  if (_muted) return
  try {
    const clone = _get(name).cloneNode()
    clone.volume = 0.5
    clone.play().catch(() => {})
  } catch {}
}
