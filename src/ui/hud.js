import { Phase, DeliveryStatus, KIT_TYPES, calcPrice, focusStation, idleStations } from '../state/gameState.js'
import { levelData } from '../state/upgrades.js'

export function createHUD(root) {
  const el = document.createElement('div')
  el.id = 'hud'
  el.innerHTML = `
    <div class="hud__money-wrap">
      <span class="hud__money" id="hud-money">$0.00</span>
    </div>
    <div class="hud__hint" id="hud-hint"></div>
  `
  root.appendChild(el)

  // carrying: item types in the player's hands, so the hint can name the next
  // physical step rather than a tap target (C2).
  // guidance: the running "what to do next" line is training wheels and stops
  // after the first few orders (C7), leaving just the money on screen.
  function update(state, carrying = [], guidance = true) {
    el.querySelector('#hud-money').textContent = `$${state.money.toFixed(2)}`
    el.querySelector('#hud-hint').textContent  = guidance ? hint(state, carrying) : ''
  }

  return { update }
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
