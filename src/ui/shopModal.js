import {
  Phase, KIT_TYPES, calcPrice, idleStations, kitCost, kitBasePrice,
  kitMark, kitMarkMax, kitSolderPointCount, markUnlockOf, nextMarkCost, canUpgradeMark,
  markBuildProgress,
} from '../state/gameState.js'
import { ruleAt } from '../state/locations.js'
import { rescueKitAvailable, RESCUE_KIT_ID, kitRatePerSec } from '../sim/derive.js'
import { PRICE_BASE_COEFF, PRICE_QUALITY_COEFF, STORAGE_SLOTS_BY_LEVEL, MK_UNLOCKS } from '../state/config.js'
import { salePriceMult } from '../state/upgrades.js'
import { featureIntroduced } from '../sim/unlocks.js'
import { kitsForLocation, LOCATIONS } from '../state/locations.js'
import { roomDef } from '../defs/layouts/rooms.js'

function isKitLocked(kit, locationKitIds) {
  return !locationKitIds.includes(kit.id)
}

// Чому цей тип зачинений. Два різні замки, і плутати їх не можна: один — про
// місце («купи гараж»), другий — про Mk («прокачай міні-дрон»). Замок, який не
// каже, ЩО з ним робити, читається як «сюди не можна ніколи».
function lockReasonText(state, kit) {
  const byMark = markUnlockOf(kit.id)
  if (byMark) {
    const from = KIT_TYPES[byMark.fromKit]
    return `🔒 ${from.emoji} ${from.name} → Mk ${byMark.mk + 1}`
  }
  const { location: locId, room: roomId } = kit.unlock ?? {}
  const name = roomId ? (roomDef(roomId)?.name ?? roomId)
             : locId  ? (LOCATIONS[locId]?.name ?? locId)
             : 'іншій локації'
  return `🔒 Відкривається в ${name}`
}

// Римські Mk: «Mk 4» читається як номер версії, «Mk IV» — як покоління заліза,
// і друге ближче до того, чим воно є.
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
export const mkLabel = (mk) => `Mk ${ROMAN[mk] ?? mk + 1}`

// Рядок Mk на картці: що дасть наступний рівень і скільки він коштує.
//
// Порівняння «зараз → після» стоїть тут навмисно (План Стадії 10 / B4). Без
// нього рішення «Mk III міні чи Mk I кінематографічного» нечитабельне, і вся
// система лишилась би технічно правильною й невидимою — рівно як гараж до Р4.
function mkRowHTML(state, kit) {
  const mk   = kitMark(state, kit.id)
  const cap  = kitMarkMax(state)
  const { can, cost, reasons } = canUpgradeMark(state, kit.id)

  // У стелі рядок лишається, але без кнопки: темп комплекту — це те, з чим
  // його порівнюють, і картка без нього була б єдиною, по якій рішення
  // прийняти не можна. Зникає натомість ЦІНА: пропонувати покупку, якої не
  // існує, — і є той «максимум» рядком-товаром, який Стадія 11 прибирає (П2).
  if (cost === null) {
    return `
      <div class="kit-card__mk-row">
        <span class="kit-card__mk-gain">≈$${kitRatePerSec(state, kit.id).toFixed(2)}/сек</span>
        <span class="kit-card__mk-note">${reasons[0] ?? ''}</span>
      </div>`
  }

  // $/сек, а не ціна (План Стадії 10 / B4). Ціна сама по собі не відповідає на
  // питання, заради якого цей рядок існує: кінематографічний дорожчий за міні,
  // але збирається у 8 кроків замість 4, і що з них вигідніше — видно лише в
  // темпі. З «≈», бо це оцінка одного верстака без простоїв, а не прилад у HUD.
  const nextState = { ...state, kitMarks: { ...(state.kitMarks ?? {}), [kit.id]: mk + 1 } }
  const nowRate   = kitRatePerSec(state, kit.id)
  const nextRate  = kitRatePerSec(nextState, kit.id)
  const unlocks   = Object.entries(MK_UNLOCKS)
    .find(([from, u]) => from === kit.id && u.mk === mk + 1)?.[1]?.unlocks

  // Другий замок Mk (Стадія 11 / A3): поки цього дрона зібрано замало, місце
  // «що дасть наступний рівень» займає те, що зараз справді тримає покупку.
  // Ціна на кнопці лишається — інакше гравець дізнається про неї аж після
  // того, як добудує норму.
  const build   = markBuildProgress(state, kit.id)
  const locked  = build && build.have < build.need
  const gainHTML = locked
    ? `<span class="kit-card__mk-gain">
         🔧 Зібрано ${build.have}/${build.need}
         <span class="kit-card__mk-cap">Mk ${mk + 1}/${cap}</span>
       </span>`
    : `<span class="kit-card__mk-gain">
         ≈$${nowRate.toFixed(2)} → $${nextRate.toFixed(2)}/сек
         <span class="kit-card__mk-cap">Mk ${mk + 1}/${cap}</span>
       </span>`

  return `
    <div class="kit-card__mk-row">
      <button class="btn btn--mk" data-mk="${kit.id}" ${can ? '' : 'disabled'}>
        ↑ ${mkLabel(mk + 1)} — $${Math.round(cost)}
      </button>
      ${gainHTML}
      ${unlocks ? `<p class="kit-card__mk-unlock">🔓 Відкриє: ${KIT_TYPES[unlocks].emoji} ${KIT_TYPES[unlocks].name}</p>` : ''}
    </div>`
}

function difficultyDots(count) {
  return Array.from({ length: count }, (_, i) =>
    `<span class="kit-dot${i < count ? ' kit-dot--filled' : ''}"></span>`
  ).join('')
}

function priceRange(state, kit, priceMultiplier) {
  const base = kitBasePrice(state, kit.id)
  const min = calcPrice(base, 0,   priceMultiplier)
  const max = calcPrice(base, 1.0, priceMultiplier)
  return `$${min.toFixed(0)}–$${max.toFixed(0)}`
}

export function createShopModal(root, { onOrder, onUpgradeMark }) {
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
    const mult          = salePriceMult(state)
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
      const mk       = kitMark(state, kit.id)
      const steps    = kitSolderPointCount(state, kit.id)
      const cost     = kitCost(state, kit.id)
      const noMoney  = state.money < cost
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
            <div class="kit-card__lock">${lockReasonText(state, kit)}</div>
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
              <div class="kit-card__name">${kit.name} <span class="kit-card__mk">${mkLabel(mk)}</span></div>
              <div class="kit-card__meta">${difficultyDots(steps)} ${steps} точок</div>
            </div>
            <div class="kit-card__prices">
              <div class="kit-card__buy-price">$${Math.round(cost)}</div>
              <div class="kit-card__sell-range">${priceRange(state, kit, mult)}</div>
            </div>
          </div>
          ${featureIntroduced(state, `mk:${kit.id}`) ? mkRowHTML(state, kit) : ''}
          <button class="btn btn--primary kit-card__btn" data-order="${id}" ${disabled ? 'disabled' : ''}>
            Замовити — $${Math.round(cost)}
          </button>
          ${note}
        </div>`
    }).join('')

    body.querySelectorAll('[data-mk]').forEach(btn => {
      btn.addEventListener('click', () => onUpgradeMark?.(btn.dataset.mk))
    })

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
