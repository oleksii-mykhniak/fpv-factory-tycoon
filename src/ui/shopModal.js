import { Phase, KIT_TYPES } from '../state/gameState.js'
import { UPGRADE_TRACKS } from '../state/upgrades.js'

export function createShopModal(root, { onOrder, onBuyUpgrade }) {
  const overlay = document.createElement('div')
  overlay.id = 'shop-modal'
  overlay.className = 'modal-overlay'
  overlay.setAttribute('hidden', '')
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <span class="modal__title">Магазин</span>
        <button class="modal__close" id="shop-close">✕</button>
      </div>
      <div class="modal__body" id="shop-body"></div>
    </div>
  `
  root.appendChild(overlay)

  overlay.querySelector('#shop-close').addEventListener('click', close)
  overlay.addEventListener('click', e => { if (e.target === overlay) close() })

  let _state = null

  function open(state) {
    _state = state
    overlay.removeAttribute('hidden')
    renderBody(state)
  }

  function close() {
    overlay.setAttribute('hidden', '')
  }

  function update(state) {
    _state = state
    if (!overlay.hasAttribute('hidden')) renderBody(state)
  }

  function renderBody(state) {
    const body = overlay.querySelector('#shop-body')
    const canOrder = state.phase === Phase.IDLE

    body.innerHTML = `
      <div class="shop-section">
        <div class="shop-section__title">Комплекти</div>
        ${Object.entries(KIT_TYPES).map(([id, kit]) => `
          <div class="shop-kit">
            <div class="shop-kit__name">${kit.name ?? id}</div>
            <div class="shop-kit__meta">${kit.solderPointCount} точок · базова ціна $${kit.basePrice}</div>
            <button class="btn btn--primary" data-order="${id}"
              ${!canOrder || state.money < kit.cost ? 'disabled' : ''}>
              Замовити — $${kit.cost}
            </button>
            ${!canOrder
              ? '<p class="shop-kit__note">Доступно між циклами</p>'
              : state.money < kit.cost
                ? '<p class="shop-kit__note warn">Недостатньо грошей</p>'
                : ''}
          </div>
        `).join('')}
      </div>
      ${renderUpgrades(state)}
    `

    body.querySelectorAll('[data-order]').forEach(btn => {
      btn.addEventListener('click', () => { onOrder(btn.dataset.order); close() })
    })
    body.querySelectorAll('[data-upgrade]').forEach(btn => {
      btn.addEventListener('click', () => onBuyUpgrade(btn.dataset.upgrade))
    })
  }

  function renderUpgrades(state) {
    return Object.entries(UPGRADE_TRACKS).map(([id, track]) => {
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
              ${!canBuy && state.phase !== Phase.IDLE ? '<p class="upgrade-effect-hint">Купівля між циклами</p>' : ''}
            ` : '<p class="upgrade-effect-hint">Максимальний рівень</p>'}
          </div>
        </div>
      `
    }).join('')
  }

  return { open, close, update }
}
