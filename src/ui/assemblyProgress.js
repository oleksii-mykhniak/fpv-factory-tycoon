// Inline progress strip + result toast for SEMI / AUTO soldering.
// Shown instead of the solder modal popup — no mini-game, just a timer bar.

export function createAssemblyProgress(root) {
  // ── Progress strip ────────────────────────────────────────
  const strip = document.createElement('div')
  strip.id = 'assembly-progress'
  strip.setAttribute('hidden', '')
  strip.innerHTML = `
    <div class="ap__label" id="ap-label"></div>
    <div class="ap__dots"  id="ap-dots"></div>
    <div class="ap__bar-wrap"><div class="ap__bar-fill" id="ap-fill"></div></div>
  `
  root.appendChild(strip)

  // ── Result toast ──────────────────────────────────────────
  const toast = document.createElement('div')
  toast.id = 'assembly-toast'
  toast.setAttribute('hidden', '')
  root.appendChild(toast)

  let rafId       = null
  let stepStart   = 0
  let stepDur     = 1000
  let toastTimer  = null

  // ── Internal helpers ──────────────────────────────────────

  function _renderDots(total, done) {
    strip.querySelector('#ap-dots').innerHTML = Array.from({ length: total }, (_, i) =>
      `<div class="ap__dot${i < done ? ' ap__dot--done' : ''}"></div>`
    ).join('')
  }

  function _tick(now) {
    const pct = Math.min((now - stepStart) / stepDur, 1)
    strip.querySelector('#ap-fill').style.width = `${pct * 100}%`
    if (pct < 1) rafId = requestAnimationFrame(_tick)
    else rafId = null
  }

  // ── Public API ────────────────────────────────────────────

  // Called when a new auto-solder step starts.
  function startStep(label, total, done, durationMs) {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }
    stepStart = performance.now()
    stepDur   = durationMs

    strip.querySelector('#ap-label').textContent = label
    strip.querySelector('#ap-fill').style.width  = '0%'
    _renderDots(total, done)
    strip.removeAttribute('hidden')

    rafId = requestAnimationFrame(_tick)
  }

  // Called when a point completes and the next begins (restarts the bar).
  function advanceDots(total, done) {
    _renderDots(total, done)
    stepStart = performance.now()
    strip.querySelector('#ap-fill').style.width = '0%'
  }

  // Hides the strip (idempotent — safe to call repeatedly).
  function hide() {
    if (strip.hasAttribute('hidden')) return
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }
    strip.setAttribute('hidden', '')
  }

  // Shows a fade-out result toast then hides it.
  function showResult(text, durationMs = 2200) {
    hide()
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null }
    toast.textContent = text
    toast.classList.remove('assembly-toast--fade')
    toast.removeAttribute('hidden')
    void toast.offsetWidth  // force reflow before adding class
    toast.style.animationDuration = `${durationMs}ms`
    toast.classList.add('assembly-toast--fade')
    toastTimer = setTimeout(() => {
      toast.setAttribute('hidden', '')
      toast.classList.remove('assembly-toast--fade')
      toastTimer = null
    }, durationMs)
  }

  return { startStep, advanceDots, hide, showResult }
}
