import { Phase, DeliveryStatus, KIT_TYPES, calcPrice } from '../state/gameState.js'
import { levelData, SOLDER_MODE } from '../state/upgrades.js'

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
  function update(state, carrying = []) {
    el.querySelector('#hud-money').textContent = `$${state.money.toFixed(2)}`
    el.querySelector('#hud-hint').textContent  = hint(state, carrying)
  }

  return { update }
}

function hint(state, carrying) {
  const holding = (type) => carrying.includes(type)

  if (holding('kit_box')) return 'Неси коробку до верстака'
  if (holding('drone'))   return 'Неси дрон до поштової скриньки'
  if (holding('scrap'))   return 'Неси деталі до верстака'

  switch (state.phase) {
    case Phase.IDLE: {
      if (state.scrapAvailable) return 'Іди до смітника — там є деталі'
      const deliveries = state.deliveries ?? []
      if (deliveries.some(d => d.status === DeliveryStatus.CARRYING)) return 'Несемо на стіл…'
      const arrived = deliveries.some(d => d.status === DeliveryStatus.TRANSIT && d.readyAt <= Date.now())
      if (arrived) return 'Коробка прибула — забери її з вулиці'
      if (deliveries.length) return "Кур'єр їде до вас…"
      return ''
    }
    case Phase.ASSEMBLY: {
      const kit   = KIT_TYPES[state.activeKit]
      const done  = state.solderPoints.length
      const total = kit?.solderPointCount ?? 0
      const mode  = levelData('soldering', state.upgrades.solderingLevel ?? 0).mode
      return mode === SOLDER_MODE.MANUAL
        ? `Стань біля верстака — паяти (${done}/${total})`
        : `Паяємо… (${done}/${total})`
    }
    case Phase.READY: {
      const kit   = KIT_TYPES[state.activeKit]
      const price = calcPrice(kit.basePrice, state.assemblyQuality, state.upgrades.priceMultiplier)
      return `Готово! Забери з верстака → $${price.toFixed(2)}`
    }
    case Phase.BURNT: return 'Деталь перегріта!'
    default: return ''
  }
}
