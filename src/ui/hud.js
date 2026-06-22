import { Phase, DeliveryStatus, KIT_TYPES, calcPrice } from '../state/gameState.js'
import { levelData, WORKER_MODE, SOLDER_MODE } from '../state/upgrades.js'

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
    el.querySelector('#hud-hint').textContent  = hint(state)
  }

  return { update }
}

function hint(state) {
  switch (state.phase) {
    case Phase.IDLE: {
      const carrying = (state.deliveries ?? []).find(d => d.status === DeliveryStatus.CARRYING)
      if (carrying) {
        const wMode = levelData('worker', state.upgrades.workerLevel ?? 0).mode
        return (wMode === WORKER_MODE.SEMI || wMode === WORKER_MODE.AUTO)
          ? 'Несемо на стіл…'
          : 'Тапни коробку!'
      }
      const hasTransit = (state.deliveries ?? []).some(d => d.status === DeliveryStatus.TRANSIT)
      return hasTransit ? "Кур'єр їде до вас…" : ''
    }
    case Phase.ASSEMBLY: {
      const kit    = KIT_TYPES[state.activeKit]
      const done   = state.solderPoints.length
      const total  = kit?.solderPointCount ?? 0
      const sMode  = levelData('soldering', state.upgrades.solderingLevel ?? 0).mode
      if (sMode === SOLDER_MODE.AUTO || (sMode === SOLDER_MODE.SEMI && done > 0)) {
        return `Паяємо… (${done}/${total})`
      }
      if (sMode === SOLDER_MODE.SEMI) return `Тапни стіл → запустити пайку`
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
