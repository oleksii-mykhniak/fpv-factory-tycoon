import { Phase, KIT_TYPES } from '../state/gameState.js'
import { levelData } from '../state/upgrades.js'
import { SALVAGE_RATE, COLD_SOLDER_QUALITY_PENALTY } from '../state/config.js'
import { createSolderGame } from './solderGame.js'

export function createSolderModal(root, { onSolderResult, onAbandon }) {
  const overlay = document.createElement('div')
  overlay.id = 'solder-modal'
  overlay.className = 'modal-overlay'
  overlay.setAttribute('hidden', '')
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <span class="modal__title">Паяння</span>
      </div>
      <div class="modal__body" id="solder-body"></div>
    </div>
  `
  root.appendChild(overlay)

  let activeGame   = null
  let lastGameIdx  = -1
  let lastPhase    = null

  function open(state) {
    lastGameIdx = -1
    lastPhase   = null
    overlay.removeAttribute('hidden')
    update(state, null)
  }

  function close() {
    destroyGame()
    lastGameIdx = -1
    lastPhase   = null
    overlay.setAttribute('hidden', '')
  }

  function destroyGame() {
    if (activeGame) { activeGame.destroy(); activeGame = null }
  }

  function update(state, warning) {
    if (overlay.hasAttribute('hidden')) return

    const { phase } = state

    // Auto-close when cycle ends
    if (phase === Phase.READY || phase === Phase.IDLE) {
      close()
      return
    }

    if (phase === Phase.BURNT) {
      if (lastPhase !== Phase.BURNT) renderBurnt(state)
      lastPhase = phase
      return
    }

    if (phase === Phase.ASSEMBLY) {
      lastPhase = phase
      renderAssembly(state, warning)
    }
  }

  function renderAssembly(state, warning) {
    const kit   = KIT_TYPES[state.activeKit]
    const done  = state.solderPoints.length
    const total = kit?.solderPointCount ?? 0
    const body  = overlay.querySelector('#solder-body')

    const dotsHTML = Array.from({ length: total }, (_, i) => {
      const q   = state.solderPoints[i]
      const cls = q !== undefined ? `solder-dot--${dotQuality(q)}` : ''
      return `<div class="solder-dot ${cls}"></div>`
    }).join('')

    const step     = kit?.assemblySteps?.[done]
    const missMsg  = step?.missMsg ?? 'Холодна пайка — переробляємо'
    const warnHTML = warning === 'cold' ? `
      <div class="warning-cold">
        ${missMsg}
        <span class="warning-cold__penalty">−${Math.round(COLD_SOLDER_QUALITY_PENALTY * 100)}% якості</span>
      </div>` : ''

    // Recreate game when point advances OR after cold solder retry (game is dead)
    if (done !== lastGameIdx || warning === 'cold') {
      destroyGame()
      lastGameIdx = done  // still same index on cold solder — next draw without warning won't recreate
      const stepLabel = step?.label ?? `Крок ${done + 1}`
      body.innerHTML = `
        <div class="solder-track">${dotsHTML}</div>
        ${warnHTML}
        <div class="assembly-step">${stepLabel}</div>
        <div id="sg-host-modal"></div>
      `
      if (done < total) {
        const { greenHalf } = levelData('soldering', state.upgrades.solderingLevel)
        activeGame = createSolderGame(body.querySelector('#sg-host-modal'), {
          pointIndex: done,
          greenHalf,
          onResult: onSolderResult,
          tapArea: document,
        })
      }
    } else {
      // Same point — update dots and warning only (game stays running)
      const dotsEl = body.querySelector('.solder-track')
      if (dotsEl) dotsEl.innerHTML = dotsHTML

      const existingWarn = body.querySelector('.warning-cold')
      if (warning === 'cold' && !existingWarn) {
        body.querySelector('.assembly-step')
            ?.insertAdjacentHTML('beforebegin', warnHTML)
      } else if (warning !== 'cold' && existingWarn) {
        existingWarn.remove()
      }
    }
  }

  function renderBurnt(state) {
    destroyGame()
    const kit    = KIT_TYPES[state.activeKit]
    const salvage = (kit.cost * SALVAGE_RATE).toFixed(2)
    const loss    = (kit.cost * (1 - SALVAGE_RATE)).toFixed(2)
    overlay.querySelector('#solder-body').innerHTML = `
      <div class="burnt-notice">
        <p>Деталь спалено. Комплект зіпсовано.</p>
        <p class="burnt-notice__loss">Втрачено: $${loss}</p>
        <p class="burnt-notice__salvage">Утиль: +$${salvage}</p>
      </div>
      <button class="btn btn--danger" id="btn-abandon-modal">
        Починаємо заново (+$${salvage} утилю)
      </button>
    `
    overlay.querySelector('#btn-abandon-modal').addEventListener('click', () => {
      close()
      onAbandon()
    })
  }

  function dotQuality(q) {
    if (q >= 0.7)  return 'high'
    if (q >= 0.35) return 'mid'
    return 'low'
  }

  return { open, close, update }
}
