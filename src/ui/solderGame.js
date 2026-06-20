import { SOLDER_BASE_PERIOD_MS, SOLDER_SPEED_FACTOR } from '../state/config.js'

export function createSolderGame(host, { pointIndex, greenHalf, onResult }) {
  const period = SOLDER_BASE_PERIOD_MS * Math.pow(SOLDER_SPEED_FACTOR, pointIndex)

  let running   = true
  let startTime = null
  let pos       = 0.5

  host.innerHTML = `
    <div class="sg">
      <div class="sg__track" id="sg-track">
        <div class="sg__zone" style="
          left: ${(0.5 - greenHalf) * 100}%;
          width: ${greenHalf * 2 * 100}%;
        "></div>
        <div class="sg__needle" id="sg-needle"></div>
      </div>
      <p class="sg__hint">Натисни коли повзунок у зеленій зоні</p>
    </div>
  `

  const needle = host.querySelector('#sg-needle')
  const track  = host.querySelector('#sg-track')

  function tick(ts) {
    if (!running) return
    if (!startTime) startTime = ts
    pos = 0.5 + 0.5 * Math.sin((2 * Math.PI * (ts - startTime)) / period)
    needle.style.left = `${pos * 100}%`
    requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)

  function handleTap() {
    if (!running) return
    running = false

    const quality = calcQuality(pos, greenHalf)
    needle.style.background = qualityColor(quality)
    needle.style.width      = '6px'
    track.style.cursor      = 'default'

    const fb = document.createElement('p')
    fb.className   = 'sg__feedback'
    fb.textContent = feedbackText(quality)
    fb.style.color = qualityColor(quality)
    host.querySelector('.sg').appendChild(fb)

    setTimeout(() => onResult(quality), 500)
  }

  track.addEventListener('click', handleTap)

  function onKey(e) {
    if (e.code === 'Space') { e.preventDefault(); handleTap() }
  }
  document.addEventListener('keydown', onKey)

  return {
    destroy() {
      running = false
      document.removeEventListener('keydown', onKey)
    },
  }
}

function calcQuality(pos, greenHalf) {
  const dist = Math.abs(pos - 0.5)
  if (dist <= greenHalf) return 1 - (dist / greenHalf) * 0.4
  return Math.max(0, 0.6 * (1 - (dist - greenHalf) / (0.5 - greenHalf)))
}

function qualityColor(q) {
  if (q >= 0.7)  return '#7de07d'
  if (q >= 0.35) return '#e0c97d'
  return '#e07a7a'
}

function feedbackText(q) {
  if (q >= 0.95) return 'Ідеально!'
  if (q >= 0.7)  return 'Добре!'
  if (q >= 0.5)  return 'Непогано'
  if (q >= 0.2)  return 'Слабко…'
  return 'Промах!'
}
