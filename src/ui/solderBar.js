import { KIT_TYPES } from '../state/gameState.js'
import { levelData } from '../state/upgrades.js'
import { COLD_SOLDER_QUALITY_PENALTY } from '../state/config.js'
import { createSolderGame } from './solderGame.js'

// The soldering mini-game as a strip, not a modal (C6).
//
// It used to be a full-screen overlay: opening it froze the character and took
// the player out of the shop entirely. Now it appears while you are standing at
// a bench and disappears when you walk away — the bench keeps working on its
// own if a technician or an upgrade can run it, so leaving costs nothing.
//
// Everything below is presentation. The result of each point goes back through
// the same `solderResult` command the sim has always had.

export function createSolderBar(root, { onSolderResult }) {
  const el = document.createElement('div')
  el.id = 'solder-bar'
  el.setAttribute('hidden', '')
  el.innerHTML = `
    <div class="solder-bar__head">
      <span class="solder-bar__step" id="sb-step"></span>
      <span class="solder-bar__dots" id="sb-dots"></span>
    </div>
    <div class="solder-bar__warn" id="sb-warn" hidden></div>
    <div id="sb-host"></div>
  `
  root.appendChild(el)

  let game       = null
  let stationId  = null
  let lastPoint  = -1
  let warnUntil  = 0

  function destroyGame() {
    if (game) { game.destroy(); game = null }
  }

  function hide() {
    if (el.hasAttribute('hidden')) return
    destroyGame()
    stationId = null
    lastPoint = -1
    el.setAttribute('hidden', '')
  }

  // Called every frame with the station the player is standing at, or null.
  function update(state, station, coldMsg) {
    if (!station) { hide(); return }

    const kit = KIT_TYPES[station.kitId]
    if (!kit) { hide(); return }

    const done  = station.solderPoints.length
    const total = kit.solderPointCount
    if (done >= total) { hide(); return }

    el.removeAttribute('hidden')

    if (coldMsg) {
      const warn = el.querySelector('#sb-warn')
      warn.innerHTML = `${coldMsg} <b>−${Math.round(COLD_SOLDER_QUALITY_PENALTY * 100)}%</b>`
      warn.hidden = false
      warnUntil = Date.now() + 2200
    } else if (warnUntil && Date.now() > warnUntil) {
      el.querySelector('#sb-warn').hidden = true
      warnUntil = 0
    }

    el.querySelector('#sb-step').textContent =
      kit.assemblySteps?.[done]?.label ?? `Крок ${done + 1}`
    el.querySelector('#sb-dots').innerHTML = Array.from({ length: total }, (_, i) => {
      const q = station.solderPoints[i]
      const cls = q === undefined ? '' : q >= 0.7 ? 'high' : q >= 0.35 ? 'mid' : 'low'
      return `<i class="solder-dot ${cls ? `solder-dot--${cls}` : ''}"></i>`
    }).join('')

    // Rebuild the game when the point changes, when the bench moved under us,
    // or after a cold solder (the old instance has stopped).
    const stale = station.id !== stationId || done !== lastPoint || !!coldMsg
    if (!stale) return

    destroyGame()
    stationId = station.id
    lastPoint = done

    const { greenHalf } = levelData('soldering', state.upgrades.solderingLevel)
    const id = station.id
    game = createSolderGame(el.querySelector('#sb-host'), {
      pointIndex: done,
      greenHalf,
      onResult: (q) => onSolderResult(q, id),
      // Tapping anywhere fires it — the player is holding a joystick with the
      // other thumb and should not have to aim at a strip.
      tapArea: document,
    })
  }

  return { update, hide, isOpen: () => !el.hasAttribute('hidden') }
}
