import { Phase, KIT_TYPES, calcPrice } from '../state/gameState.js'

const PHASE_LABEL = {
  [Phase.IDLE]:     'Очікування',
  [Phase.ORDERED]:  'Доставка в дорозі…',
  [Phase.DELIVERY]: 'Посилка біля дверей!',
  [Phase.ASSEMBLY]: 'Збірка',
  [Phase.READY]:    'Готово до продажу',
}

export function render(root, state, handlers, salesLog) {
  const kit     = state.activeKit ? KIT_TYPES[state.activeKit] : null
  const done    = state.solderPoints.length
  const total   = kit?.solderPointCount ?? 0
  const canFinish = done === total && total > 0

  const sellPrice = state.assemblyQuality !== null && kit
    ? calcPrice(kit.basePrice, state.assemblyQuality, state.upgrades.priceMultiplier)
    : null

  root.innerHTML = `
    <div class="panel">

      <header class="panel__header">
        <span class="panel__title">FPV Factory</span>
        <span class="panel__balance">$${state.money.toFixed(2)}</span>
      </header>

      <div class="panel__phase">${PHASE_LABEL[state.phase]}</div>

      ${state.phase === Phase.ASSEMBLY ? `
        <div class="solder-track">
          ${Array.from({ length: total }, (_, i) => `
            <div class="solder-dot ${i < done ? 'solder-dot--done' : ''}"></div>
          `).join('')}
        </div>
      ` : ''}

      ${sellPrice !== null ? `
        <div class="sell-preview">Ціна продажу: <strong>$${sellPrice.toFixed(2)}</strong>
          (якість ${Math.round(state.assemblyQuality * 100)}%)</div>
      ` : ''}

      <div class="panel__actions">
        ${state.phase === Phase.IDLE ? `
          <button class="btn btn--primary" id="btn-order"
            ${state.money < KIT_TYPES.mini_drone.cost ? 'disabled' : ''}>
            Замовити міні-дрон ($${KIT_TYPES.mini_drone.cost})
          </button>
          ${state.money < KIT_TYPES.mini_drone.cost
            ? '<p class="warn">Недостатньо грошей</p>' : ''}
        ` : ''}

        ${state.phase === Phase.ORDERED ? `
          <button class="btn btn--primary" id="btn-deliver">
            Отримати доставку
          </button>
        ` : ''}

        ${state.phase === Phase.DELIVERY ? `
          <button class="btn btn--primary" id="btn-start">
            Відкрити коробку і почати збірку
          </button>
        ` : ''}

        ${state.phase === Phase.ASSEMBLY && !canFinish ? `
          <button class="btn btn--primary" id="btn-solder">
            Паяти точку ${done + 1} з ${total}
          </button>
        ` : ''}

        ${state.phase === Phase.ASSEMBLY && canFinish ? `
          <button class="btn btn--success" id="btn-finish">
            Завершити збірку
          </button>
        ` : ''}

        ${state.phase === Phase.READY ? `
          <button class="btn btn--success" id="btn-sell">
            Продати за $${sellPrice?.toFixed(2) ?? '?'}
          </button>
        ` : ''}
      </div>

      ${salesLog.length > 0 ? `
        <div class="log">
          <div class="log__title">Останні продажі</div>
          <ul class="log__list">
            ${[...salesLog].reverse().slice(0, 6).map(e => `
              <li>
                <span class="log__price">$${e.price.toFixed(2)}</span>
                <span class="log__quality quality--${qualityClass(e.quality)}">
                  ${Math.round(e.quality * 100)}%
                </span>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}

    </div>
  `

  root.querySelector('#btn-order')?.addEventListener('click', handlers.onOrder)
  root.querySelector('#btn-deliver')?.addEventListener('click', handlers.onDeliver)
  root.querySelector('#btn-start')?.addEventListener('click', handlers.onStart)
  root.querySelector('#btn-solder')?.addEventListener('click', handlers.onSolder)
  root.querySelector('#btn-finish')?.addEventListener('click', handlers.onFinish)
  root.querySelector('#btn-sell')?.addEventListener('click', handlers.onSell)
}

function qualityClass(q) {
  if (q >= 0.8) return 'high'
  if (q >= 0.5) return 'mid'
  return 'low'
}
