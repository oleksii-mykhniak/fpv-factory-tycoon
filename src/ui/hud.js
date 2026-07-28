import { Phase, DeliveryStatus, KIT_TYPES, calcPrice, focusStation, idleStations } from '../state/gameState.js'
import { levelData } from '../state/upgrades.js'

export function createHUD(root) {
  const el = document.createElement('div')
  el.id = 'hud'
  el.innerHTML = `
    <div class="hud__money-wrap">
      <span class="hud__money" id="hud-money">$0.00</span>
    </div>
    <div class="hud__rate-wrap">
      <span class="hud__rate" id="hud-rate" hidden></span>
    </div>
  `
  root.appendChild(el)

  // rate: $/sec over the last minute of actual sales (F7). Hidden until the
  // shop has actually earned something — a permanent "$0.00/сек" is noise, and
  // the first sale making it appear is a moment worth having.
  //
  // Рядка підсказки тут більше немає (Стадія 9 / Р2): смуга внизу екрана
  // заважала, а про «що робити» говорили три системи одночасно. Тепер HUD — це
  // рівно гроші й темп, а крок петлі рахує `stepHint()` нижче і показує картка
  // квесту.
  function update(state, rate = 0) {
    el.querySelector('#hud-money').textContent = `$${state.money.toFixed(2)}`

    const rateEl = el.querySelector('#hud-rate')
    if (rate > 0) {
      rateEl.textContent = `+$${rate.toFixed(2)}/сек`
      rateEl.removeAttribute('hidden')
    } else {
      rateEl.setAttribute('hidden', '')
    }
  }

  return { update }
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
      if (state.scrapAvailable) return 'Іди до смітника — там є деталі'
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
