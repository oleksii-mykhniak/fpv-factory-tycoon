import { Phase, DeliveryStatus, KIT_TYPES, calcPrice, focusStation, idleStations } from '../state/gameState.js'
import { levelData } from '../state/upgrades.js'

// Скільки дельта темпу тримається на приладі після покупки. Вікно доходу — 60 с
// (INCOME_WINDOW_MS), тож коротше за півхвилини не встигло б показати нічого.
const RATE_DELTA_MS = 30000

export function createHUD(root) {
  const el = document.createElement('div')
  el.id = 'hud'
  el.innerHTML = `
    <div class="hud__money-wrap">
      <span class="hud__money" id="hud-money">$0.00</span>
    </div>
    <div class="hud__rate-wrap">
      <span class="hud__rate" id="hud-rate">+$0.00/сек</span>
      <span class="hud__rate-delta" id="hud-rate-delta" hidden></span>
    </div>
    <div class="hud__next" id="hud-next" hidden>
      <div class="hud__next-bar"><div class="hud__next-fill" id="hud-next-fill"></div></div>
      <span class="hud__next-label" id="hud-next-label"></span>
    </div>
  `
  root.appendChild(el)

  // rate: $/sec over the last minute of actual sales (F7).
  //
  // It used to hide itself while rate === 0, on the theory that a permanent
  // "$0.00/сек" is noise and the first sale making it appear is a moment worth
  // having. That reasoning holds for the first ten minutes and is wrong for the
  // rest of the game (Стадія 10 / D1): the number vanished exactly when the
  // player stopped to choose an upgrade, which is when they most need the
  // measure they are choosing against. A gauge that reads zero is information;
  // a gauge that disappears is not.
  //
  // Рядка підсказки тут немає (Стадія 9 / Р2): смуга внизу екрана заважала, а
  // про «що робити» говорили три системи одночасно. Тепер HUD — це гроші, темп
  // і скільки лишилось до наступної покупки; крок петлі рахує `stepHint()`
  // нижче і показує картка квесту.
  const moneyEl  = el.querySelector('#hud-money')
  const rateEl   = el.querySelector('#hud-rate')
  const deltaEl  = el.querySelector('#hud-rate-delta')
  const nextEl   = el.querySelector('#hud-next')
  const fillEl   = el.querySelector('#hud-next-fill')
  const labelEl  = el.querySelector('#hud-next-label')

  // Кожна покупка мусить бути видно на приладі (План Стадії 10 / П4).
  //
  // Дельта НЕ знімається в момент покупки: темп рахується по продажах за
  // останню хвилину, тож одразу після оплати він ще нульовий. Тому
  // запам'ятовується база, і наступні півхвилини прилад показує, наскільки
  // темп відійшов від неї — різниця проявляється рівно тоді, коли долітають
  // перші продажі з новим апгрейдом.
  let deltaBase  = null
  let deltaUntil = 0

  function update(state, rate = 0, next = null, now = Date.now()) {
    moneyEl.textContent = `$${state.money.toFixed(2)}`

    rateEl.textContent = `+$${rate.toFixed(2)}/сек`
    rateEl.classList.toggle('hud__rate--zero', rate <= 0)

    const delta = deltaBase === null ? 0 : rate - deltaBase
    if (now < deltaUntil && delta > 0.005) {
      deltaEl.textContent = `↑ +$${delta.toFixed(2)}`
      deltaEl.removeAttribute('hidden')
    } else {
      deltaEl.setAttribute('hidden', '')
      if (now >= deltaUntil) deltaBase = null
    }

    // Смужка до наступної покупки. Свідомо НЕ виключає бейдж на стелажі: вони
    // кажуть різне. Бейдж — «щось уже доступне», смужка — «до наступної віхи
    // стільки». При $120 флюс по кишені, а паяльник ще ні, і сховати смужку
    // означало б збрехати про те, куди гравець іде. Зникає вона лише тоді,
    // коли попереду справді нічого недосяжного немає.
    if (next && next.cost > 0) {
      const pct = Math.max(0, Math.min(1, state.money / next.cost))
      fillEl.style.width  = `${(pct * 100).toFixed(1)}%`
      labelEl.textContent = `${next.label} · $${Math.ceil(next.cost - state.money)}`
      nextEl.removeAttribute('hidden')
    } else {
      nextEl.setAttribute('hidden', '')
    }
  }

  // Викликається одразу після покупки: фіксує базу, від якої міряється ріст.
  function markPurchase(rateNow, now = Date.now()) {
    deltaBase  = rateNow
    deltaUntil = now + RATE_DELTA_MS
  }

  return { update, markPurchase }
}

// Крок петлі — що робити з тим, що зараз у руках і на верстаку. Живе далі тут
// (це знання про фази станції, не про квести), але тепер це чиста функція, яку
// малює картка квесту. Повертає '' коли підказки вже не потрібні.
export function stepHint(state, carrying = [], guidance = true) {
  return guidance ? hint(state, carrying) : ''
}

function hint(state, carrying) {
  const holding = (type) => carrying.includes(type)

  if (holding('kit_box')) return 'Неси коробку до верстака'
  if (holding('drone'))   return 'Неси дрон до поштової скриньки'
  if (holding('scrap'))   return 'Неси деталі до верстака'

  const station = focusStation(state)

  switch (station?.phase ?? Phase.IDLE) {
    case Phase.IDLE: {
      const deliveries = state.deliveries ?? []
      if (deliveries.some(d => d.status === DeliveryStatus.CARRYING)) return 'Несемо на стіл…'
      const arrived = deliveries.some(d => d.status === DeliveryStatus.TRANSIT && d.readyAt <= Date.now())
      if (arrived) return 'Коробка прибула — забери її з вулиці'
      if (deliveries.length) return "Кур'єр їде до вас…"
      // Nothing in flight: the very first thing the game must say is where the
      // loop starts, or a new player has no idea what to do at all. Since S2
      // the shop is a place, not a button — so the hint names the place.
      return 'Підійди до столу з ноутбуком і замов дрон'
    }
    case Phase.ASSEMBLY: {
      const kit   = KIT_TYPES[station.kitId]
      const done  = station.solderPoints.length
      const total = kit?.solderPointCount ?? 0
      const auto  = levelData('soldering', state.upgrades.solderingLevel ?? 0).qualityMin !== undefined
      return auto
        ? `Паяємо… (${done}/${total}) — стань поруч, буде краще`
        : `Стань біля верстака — паяти (${done}/${total})`
    }
    case Phase.READY: {
      const kit   = KIT_TYPES[station.kitId]
      const price = calcPrice(kit.basePrice, station.quality, state.upgrades.priceMultiplier)
      return `Готово! Забери з верстака → $${price.toFixed(2)}`
    }
    case Phase.BURNT: return 'Деталь перегріта!'
    default: return ''
  }
}
