// WASD / arrow keys — so the game is testable on a laptop, not only on a phone.
//
// Listens on window and reports held keys; the merge and deadzone live in
// inputVector.js. Typing in a field or having a modal open must never move the
// character, so both are filtered here rather than by every caller.

const KEY_MAP = {
  KeyW: 'up',    ArrowUp:    'up',
  KeyS: 'down',  ArrowDown:  'down',
  KeyA: 'left',  ArrowLeft:  'left',
  KeyD: 'right', ArrowRight: 'right',
}

function typingInAField(target) {
  const tag = target?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable
}

export function createKeyboard({ isBlocked = () => false } = {}) {
  const held = { up: false, down: false, left: false, right: false }

  const clear = () => { for (const k in held) held[k] = false }

  function onKeyDown(e) {
    const dir = KEY_MAP[e.code]
    if (!dir || e.repeat || typingInAField(e.target)) return
    if (isBlocked()) return
    held[dir] = true
    // Arrows would otherwise scroll the page inside a WebView.
    e.preventDefault()
  }

  function onKeyUp(e) {
    const dir = KEY_MAP[e.code]
    if (dir) held[dir] = false
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  // Alt-tabbing away while holding a key would otherwise leave it stuck down.
  window.addEventListener('blur', clear)

  return {
    read: () => (isBlocked() ? { up: false, down: false, left: false, right: false } : held),
    destroy() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', clear)
    },
  }
}
