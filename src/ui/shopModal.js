import { Phase, KIT_TYPES } from '../state/gameState.js'

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
    `

    body.querySelectorAll('[data-order]').forEach(btn => {
      btn.addEventListener('click', () => { onOrder(btn.dataset.order); close() })
    })
  }

  return { open, close, update }
}
