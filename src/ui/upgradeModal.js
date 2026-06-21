import { Phase } from '../state/gameState.js'
import { UPGRADE_TRACKS } from '../state/upgrades.js'

export function createUpgradeModal(root, { onBuyUpgrade }) {
  const overlay = document.createElement('div')
  overlay.id = 'upgrade-modal'
  overlay.className = 'modal-overlay'
  overlay.setAttribute('hidden', '')
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <span class="modal__title">Поліпшення</span>
        <button class="modal__close" id="upgrade-close">✕</button>
      </div>
      <div class="modal__body" id="upgrade-body"></div>
    </div>
  `
  root.appendChild(overlay)

  overlay.querySelector('#upgrade-close').addEventListener('click', close)
  overlay.addEventListener('click', e => { if (e.target === overlay) close() })

  function open(state) {
    overlay.removeAttribute('hidden')
    render(state)
  }

  function close() {
    overlay.setAttribute('hidden', '')
  }

  function update(state) {
    if (!overlay.hasAttribute('hidden')) render(state)
  }

  function render(state) {
    const body = overlay.querySelector('#upgrade-body')
    body.innerHTML = Object.entries(UPGRADE_TRACKS).map(([id, track]) => {
      const level    = state.upgrades[track.stateKey] ?? 0
      const maxLevel = track.costs.length
      const nextInfo = level < maxLevel ? track.levels[level + 1] : null
      const nextCost = level < maxLevel ? track.costs[level]      : null
      const canBuy   = nextCost !== null && state.phase === Phase.IDLE && state.money >= nextCost
      return `
        <div class="shop-section">
          <div class="shop-section__title">${track.name}</div>
          <div class="shop-upgrade">
            <span class="shop-upgrade__current">${track.levels[level].name}</span>
            ${nextInfo ? `
              <button class="btn btn--upgrade" data-upgrade="${id}" ${canBuy ? '' : 'disabled'}>
                → ${nextInfo.name} — $${nextCost}
              </button>
              <p class="upgrade-effect-hint">${nextInfo.effect}</p>
              ${!canBuy && state.phase !== Phase.IDLE
                ? '<p class="upgrade-effect-hint">Купівля між циклами</p>' : ''}
            ` : '<p class="upgrade-effect-hint">Максимальний рівень</p>'}
          </div>
        </div>
      `
    }).join('')

    body.querySelectorAll('[data-upgrade]').forEach(btn => {
      btn.addEventListener('click', () => onBuyUpgrade(btn.dataset.upgrade))
    })
  }

  return { open, close, update }
}
