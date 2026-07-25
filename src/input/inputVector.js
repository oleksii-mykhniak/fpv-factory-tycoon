// Pure input merging — no DOM, no engine. Tested in Node.
//
// Two sources feed the same movement vector: the on-screen stick (touch) and
// WASD/arrows (laptop). Merging them here rather than in each source keeps one
// place responsible for deadzone and diagonal behaviour, so a keyboard diagonal
// and a stick diagonal move the character at exactly the same speed.

const EPS = 1e-6

function magnitude(x, y) {
  return Math.sqrt(x * x + y * y)
}

// Keys → unit vector. A diagonal is normalised, otherwise holding W+D would be
// ~41% faster than holding W alone.
export function keysToVector(keys = {}) {
  const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
  const y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0)
  const m = magnitude(x, y)
  return m > 1 ? { x: x / m, y: y / m } : { x, y }
}

// Rescales the vector so the deadzone edge maps to 0 and full deflection to 1 —
// without this the character jumps to ~18% speed the moment the stick registers.
export function applyDeadzone({ x, y }, deadzone) {
  const m = magnitude(x, y)
  if (m <= deadzone || m < EPS) return { x: 0, y: 0 }
  const scaled = Math.min((m - deadzone) / (1 - deadzone), 1)
  return { x: (x / m) * scaled, y: (y / m) * scaled }
}

// The stick wins whenever it is being held; keys are the fallback. Trying to add
// them would let a player exceed full speed by using both at once.
export function mergeInput({ joystick, keys } = {}, deadzone = 0) {
  const stick = joystick ?? { x: 0, y: 0 }
  if (magnitude(stick.x, stick.y) > deadzone) return applyDeadzone(stick, deadzone)
  return keysToVector(keys)
}
