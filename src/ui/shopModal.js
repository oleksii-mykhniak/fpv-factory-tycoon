import { Phase, KIT_TYPES, calcPrice, idleStations } from '../state/gameState.js'
import { ruleAt } from '../state/locations.js'
import { rescueKitAvailable, RESCUE_KIT_ID } from '../sim/derive.js'
import { PRICE_BASE_COEFF, PRICE_QUALITY_COEFF, STORAGE_SLOTS_BY_LEVEL } from '../state/config.js'
import { kitsForLocation, LOCATIONS } from '../state/locations.js'
import { roomDef } from '../defs/layouts/rooms.js'

function isKitLocked(kit, locationKitIds) {
  return !locationKitIds.includes(kit.id)
}

function lockReasonText(kit) {
  const { location: locId, room: roomId } = kit.unlock ?? {}
  const name = roomId ? (roomDef(roomId)?.name ?? roomId)
             : locId  ? (LOCATIONS[locId]?.name ?? locId)
             : 'іншій локації'
  return `🔒 Відкривається в ${name}`
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
    const body          = overlay.querySelector('#shop-body')
    const mult          = state.upgrades.priceMultiplier
    const storageLevel  = state.upgrades?.storageLevel ?? 0
    const maxSecondary  = STORAGE_SLOTS_BY_LEVEL[storageLevel] ?? 0
    const maxSlots      = 1 + maxSecondary
    const deliveryCount = (state.deliveries ?? []).length
    // C3: a busy station no longer eats a delivery slot — an ordered box may
    // wait in the street while every bench works.
    const usedSlots     = deliveryCount
    // Ordering allowed from any phase except BURNT, as long as a slot is free.
    const canOrderAny    = usedSlots < maxSlots
    const locationKitIds = kitsForLocation(state)

    // Slot indicator header (only shown when Storage upgrade is active)
    const totalSlots = maxSlots
    const slotHeader = maxSecondary > 0
      ? `<p class="shop-slot-info">Слоти доставки: ${usedSlots}/${totalSlots}</p>`
      : ''

    body.innerHTML = slotHeader + Object.entries(KIT_TYPES).filter(([, kit]) => !kit.isSpecial).map(([id, kit]) => {
      const locked   = isKitLocked(kit, locationKitIds)
      const noMoney  = state.money < kit.cost
      const disabled = locked || !canOrderAny || noMoney

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
            <div class="kit-card__lock">${lockReasonText(kit)}</div>
          </div>`
      }

      let note = ''
      if (!canOrderAny) {
        if (!idleStations(state).length && !usedSlots)
          note = '<p class="kit-card__note">Всі верстаки зайняті</p>'
        else if (maxSecondary === 0)           note = '<p class="kit-card__note">Потрібен апгрейд Складу</p>'
        else                                   note = '<p class="kit-card__note">Всі слоти зайняті</p>'
      } else if (noMoney) {
        note = '<p class="kit-card__note warn">Недостатньо грошей</p>'
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
          ${note}
        </div>`
    }).join('')

    body.querySelectorAll('[data-order]').forEach(btn => {
      btn.addEventListener('click', () => { onOrder(btn.dataset.order); close() })
    })

    // The rescue kit (F1.5): where there is no bin and no piggy bank, the way
    // out of a dry shop is a free kit ordered straight off the laptop. Shown
    // only when genuinely stuck, so it never competes with a real purchase.
    if (rescueKitAvailable(state)) {
      const card = document.createElement('div')
      card.className = 'kit-card kit-card--scrap'
      card.innerHTML = `
        <div class="kit-card__header">
          <span class="kit-card__emoji">♻️</span>
          <div class="kit-card__info">
            <div class="kit-card__name">Аварійна партія</div>
            <div class="kit-card__meta">Списаний комплект зі складу</div>
          </div>
          <div class="kit-card__prices">
            <div class="kit-card__buy-price">$0</div>
          </div>
        </div>
        <button class="btn btn--success kit-card__btn" id="btn-rescue-order">
          Замовити — $0
        </button>
      `
      body.appendChild(card)
      card.querySelector('#btn-rescue-order').addEventListener('click', () => {
        onOrder(RESCUE_KIT_ID); close()
      })
    }

    // Картку «Збирати зі смітника» прибрано: смітник став самообслуговуванням
    // (див. interactions.trashbin). Пропонувати біля ноутбука безкоштовний
    // порятунок, по який усе одно треба йти на вулицю, — це зайвий крок і
    // друга назва однієї механіки.
  }

  return { open, close, update }
}
