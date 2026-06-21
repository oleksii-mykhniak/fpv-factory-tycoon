import { Phase, KIT_TYPES, calcPrice } from '../state/gameState.js'

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

  function update(state) {
    el.querySelector('#hud-money').textContent = `$${state.money.toFixed(2)}`
    el.querySelector('#hud-hint').textContent = hint(state)
  }

  return { update }
}

function hint(state) {
  switch (state.phase) {
    case Phase.IDLE:     return ''
    case Phase.ORDERED:  return "Кур'єр їде до вас…"
    case Phase.DELIVERY: return 'Тапни коробку!'
    case Phase.ASSEMBLY: {
      const kit   = KIT_TYPES[state.activeKit]
      const done  = state.solderPoints.length
      const total = kit?.solderPointCount ?? 0
      return `Тапни стіл → паяти (${done}/${total})`
    }
    case Phase.READY: {
      const kit   = KIT_TYPES[state.activeKit]
      const price = calcPrice(kit.basePrice, state.assemblyQuality, state.upgrades.priceMultiplier)
      return `Тапни стіл → продати $${price.toFixed(2)}`
    }
    case Phase.BURNT: return 'Деталь перегріта!'
    default: return ''
  }
}
