import { Phase, KIT_TYPES, calcPrice } from '../state/gameState.js'
import { PRICE_BASE_COEFF, PRICE_QUALITY_COEFF } from '../state/config.js'

// Current location — will be wired to real location state in D7.
// For now: only 'apartment' kits (unlock: null) are available.
const CURRENT_LOCATION = 'apartment'

function isKitLocked(kit) {
  return kit.unlock?.location != null && kit.unlock.location !== CURRENT_LOCATION
}

function difficultyDots(count) {
  return Array.from({ length: count }, (_, i) =>
    `<span class="kit-dot${i < count ? ' kit-dot--filled' : ''}"></span>`
  ).join('')
}

function priceRange(kit, priceMultiplier) {
  const min = calcPrice(kit.basePrice, 0,   priceMultiplier)
  const max = calcPrice(kit.basePrice, 1.0, priceMultiplier)
  return `$${min.toFixed(0)}–$${max.toFixed(0)}`
}

export function createShopModal(root, { onOrder }) {
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
    const body     = overlay.querySelector('#shop-body')
    const canOrder = state.phase === Phase.IDLE
    const mult     = state.upgrades.priceMultiplier

    body.innerHTML = Object.entries(KIT_TYPES).map(([id, kit]) => {
      const locked      = isKitLocked(kit)
      const noMoney     = state.money < kit.cost
      const disabled    = locked || !canOrder || noMoney

      if (locked) {
        return `
          <div class="kit-card kit-card--locked">
            <div class="kit-card__header">
              <span class="kit-card__emoji">${kit.emoji}</span>
              <div>
                <div class="kit-card__name">${kit.name}</div>
                <div class="kit-card__meta">${difficultyDots(kit.solderPointCount)} ${kit.solderPointCount} точок</div>
              </div>
            </div>
            <div class="kit-card__lock">🔒 Відкривається в Гаражі</div>
          </div>`
      }

      return `
        <div class="kit-card">
          <div class="kit-card__header">
            <span class="kit-card__emoji">${kit.emoji}</span>
            <div class="kit-card__info">
              <div class="kit-card__name">${kit.name}</div>
              <div class="kit-card__meta">${difficultyDots(kit.solderPointCount)} ${kit.solderPointCount} точок</div>
            </div>
            <div class="kit-card__prices">
              <div class="kit-card__buy-price">$${kit.cost}</div>
              <div class="kit-card__sell-range">${priceRange(kit, mult)}</div>
            </div>
          </div>
          <button class="btn btn--primary kit-card__btn" data-order="${id}" ${disabled ? 'disabled' : ''}>
            Замовити — $${kit.cost}
          </button>
          ${!canOrder
            ? '<p class="kit-card__note">Доступно між циклами</p>'
            : noMoney
              ? '<p class="kit-card__note warn">Недостатньо грошей</p>'
              : ''}
        </div>`
    }).join('')

    body.querySelectorAll('[data-order]').forEach(btn => {
      btn.addEventListener('click', () => { onOrder(btn.dataset.order); close() })
    })
  }

  return { open, close, update }
}
