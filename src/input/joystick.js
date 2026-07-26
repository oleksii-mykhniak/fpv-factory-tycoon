// Floating virtual joystick — DOM, not canvas.
//
// Why DOM (plan §6.3): Excalibur owns pointer events on the canvas and we
// already lost that fight once (D4: a z=0 floor actor never received taps
// because the workbench at z=2 swallowed them). A DOM layer also styles and
// scales for free.
//
// Listeners sit on `window`, not on an overlay: #ui-root is pointer-events:none
// (the canvas is its sibling, not its child), so an overlay there would never
// see a pointer. Listening globally also means we never steal events from the
// canvas — pointerdown is not preventDefault'ed, so object taps still work
// while the tap-driven interactions are being replaced. C2 removes those taps
// and this layer can capture pointers outright.

import { JOYSTICK_RADIUS, JOYSTICK_ZONE_H_RATIO } from '../state/config.js'

// A pointer that starts on UI chrome belongs to that chrome, not to movement.
const CHROME = '.modal-overlay, #settings-btn, #onboarding, #load-overlay'

export function createJoystick(host, { isBlocked = () => false } = {}) {
  const layer = document.createElement('div')
  layer.id = 'joystick'
  layer.innerHTML = `
    <div class="joystick__base" id="joy-base"></div>
    <div class="joystick__knob" id="joy-knob"></div>
  `
  host.appendChild(layer)

  const base = layer.querySelector('#joy-base')
  const knob = layer.querySelector('#joy-knob')

  let pointerId = null
  let originX = 0, originY = 0
  const vector = { x: 0, y: 0 }

  function show(x, y) {
    layer.classList.add('joystick--active')
    base.style.left = `${x}px`
    base.style.top  = `${y}px`
    moveKnob(x, y)
  }

  function moveKnob(x, y) {
    knob.style.left = `${x}px`
    knob.style.top  = `${y}px`
  }

  function reset() {
    pointerId = null
    vector.x = 0
    vector.y = 0
    layer.classList.remove('joystick--active')
  }

  function onDown(e) {
    if (pointerId !== null || isBlocked()) return
    if (e.target?.closest?.(CHROME)) return
    const rect = host.getBoundingClientRect()
    if (e.clientY < rect.top + rect.height * (1 - JOYSTICK_ZONE_H_RATIO)) return

    pointerId = e.pointerId
    originX = e.clientX
    originY = e.clientY
    show(originX - rect.left, originY - rect.top)
  }

  function onMove(e) {
    if (e.pointerId !== pointerId) return
    const dx = e.clientX - originX
    const dy = e.clientY - originY
    const dist = Math.hypot(dx, dy)
    const clamped = Math.min(dist, JOYSTICK_RADIUS)
    const nx = dist > 0 ? dx / dist : 0
    const ny = dist > 0 ? dy / dist : 0

    vector.x = (nx * clamped) / JOYSTICK_RADIUS
    vector.y = (ny * clamped) / JOYSTICK_RADIUS

    const rect = host.getBoundingClientRect()
    moveKnob(
      originX - rect.left + nx * clamped,
      originY - rect.top  + ny * clamped,
    )
    // Only once the drag is real: stops the WebView from treating it as a scroll
    // while still letting a plain tap through to the canvas.
    if (dist > 4 && e.cancelable) e.preventDefault()
  }

  function onUp(e) {
    if (e.pointerId !== pointerId) return
    reset()
  }

  window.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove, { passive: false })
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  // A pointer leaving the window entirely never sends up/cancel.
  window.addEventListener('blur', reset)

  return {
    read: () => (isBlocked() ? { x: 0, y: 0 } : vector),
    destroy() {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('blur', reset)
      layer.remove()
    },
  }
}
