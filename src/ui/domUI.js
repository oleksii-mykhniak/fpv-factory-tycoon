import { Phase, KIT_TYPES, calcPrice } from '../state/gameState.js'
import { SALVAGE_RATE } from '../state/config.js'
import { UPGRADE_TRACKS, levelData } from '../state/upgrades.js'

const PHASE_LABEL = {
  [Phase.IDLE]:     'Очікування',
  [Phase.ORDERED]:  'Доставка в дорозі…',
  [Phase.DELIVERY]: 'Посилка біля дверей!',
  [Phase.ASSEMBLY]: 'Збірка',
  [Phase.READY]:    'Готово до продажу',
  [Phase.BURNT]:    'Перегрів деталі!',
}

export function render(root, state, handlers, salesLog, warning = null) {
  const kit      = state.activeKit ? KIT_TYPES[state.activeKit] : null
  const done     = state.solderPoints.length
  const total    = kit?.solderPointCount ?? 0
  const canFinish = done === total && total > 0
  const level    = state.upgrades.solderingLevel

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

      ${(state.phase === Phase.ASSEMBLY || state.phase === Phase.READY) && total > 0 ? `
        <div class="solder-track">
          ${Array.from({ length: total }, (_, i) => {
            const q = state.solderPoints[i]
            const cls = q !== undefined ? `solder-dot--${dotQuality(q)}` : ''
            return `<div class="solder-dot ${cls}"></div>`
          }).join('')}
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
          <div class="delivery-wait">Кур'єр їде до вас…</div>
        ` : ''}

        ${state.phase === Phase.DELIVERY ? `
          <button class="btn btn--primary" id="btn-start">
            Відкрити коробку і почати збірку
          </button>
        ` : ''}

        ${state.phase === Phase.ASSEMBLY && !canFinish ? (() => {
          const stepLabel = kit?.assemblySteps?.[done] ?? `Крок ${done + 1}`

          if (level >= 3) {
            // Auto-solder: player just watches
            return `
              <div class="assembly-step">${stepLabel}</div>
              <div class="auto-notice">Автопаяльник працює…</div>
            `
          }
          if (level === 2) {
            // Semi-auto: one tap
            const d = levelData('soldering', level)
            return `
              <button class="btn btn--primary" id="btn-semi-auto">
                Зібрати (напівавтомат)
              </button>
              <p class="upgrade-effect-hint">Якість: ${Math.round(d.qualityMin * 100)}–${Math.round(d.qualityMax * 100)}%</p>
            `
          }
          // Level 0-1: mini-game
          const penalty = state.coldSolderPenalty
          return `
            ${warning === 'cold' ? `
              <div class="warning-cold">
                Холодна пайка — переробляємо точку
                <span class="warning-cold__penalty">−${Math.round(penalty * 100)}% до макс. якості</span>
              </div>
            ` : penalty > 0 ? `
              <div class="penalty-hint">Штраф якості: −${Math.round(penalty * 100)}%</div>
            ` : ''}
            <div class="assembly-step">${stepLabel}</div>
            ${level === 1 ? '<div class="iron-badge">Кращий паяльник</div>' : ''}
            <div id="sg-host" data-step="${done}"></div>
          `
        })() : ''}

        ${state.phase === Phase.ASSEMBLY && canFinish ? `
          <button class="btn btn--success" id="btn-finish">Завершити збірку</button>
        ` : ''}

        ${state.phase === Phase.READY ? `
          <button class="btn btn--success" id="btn-sell">
            Продати за $${sellPrice?.toFixed(2) ?? '?'}
          </button>
        ` : ''}

        ${state.phase === Phase.BURNT ? (() => {
          const burnKit  = KIT_TYPES[state.activeKit]
          const salvage  = (burnKit.cost * SALVAGE_RATE).toFixed(2)
          const loss     = (burnKit.cost * (1 - SALVAGE_RATE)).toFixed(2)
          return `
            <div class="burnt-notice">
              <p>Деталь спалено. Комплект зіпсовано.</p>
              <p class="burnt-notice__loss">Втрачено: $${loss}</p>
              <p class="burnt-notice__salvage">Утиль: +$${salvage}</p>
            </div>
            <button class="btn btn--danger" id="btn-abandon">
              Починаємо заново (+$${salvage} утилю)
            </button>
          `
        })() : ''}

      </div>

      ${renderUpgrades(state)}

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

  // Bind events
  root.querySelector('#btn-order')?.addEventListener('click', handlers.onOrder)
  root.querySelector('#btn-start')?.addEventListener('click', handlers.onStart)
  root.querySelector('#btn-finish')?.addEventListener('click', handlers.onFinish)
  root.querySelector('#btn-sell')?.addEventListener('click', handlers.onSell)
  root.querySelector('#btn-abandon')?.addEventListener('click', handlers.onAbandon)
  root.querySelector('#btn-semi-auto')?.addEventListener('click', handlers.onSemiAuto)
  root.querySelector('#btn-upgrade-soldering')?.addEventListener('click',
    () => handlers.onBuyUpgrade('soldering'))
}

function renderUpgrades(state) {
  const track    = UPGRADE_TRACKS.soldering
  const maxLevel = track.costs.length
  const level    = state.upgrades.solderingLevel
  const inIdle   = state.phase === Phase.IDLE
  const nextInfo = level < maxLevel ? track.levels[level + 1] : null
  const nextCost = level < maxLevel ? track.costs[level] : null
  const canBuy   = nextCost !== null && inIdle && state.money >= nextCost

  const kitCost      = KIT_TYPES.mini_drone.cost
  const afterPurchase = nextCost !== null ? state.money - nextCost : null
  const willBeStuck  = afterPurchase !== null && afterPurchase < kitCost

  return `
    <div class="upgrades">
      <div class="upgrades__header">
        <span class="upgrades__title">${track.name}</span>
        <span class="upgrades__current">${track.levels[level].name}</span>
      </div>
      ${nextInfo ? `
        <button class="btn btn--upgrade" id="btn-upgrade-soldering"
          ${canBuy ? '' : 'disabled'}>
          → ${nextInfo.name} — $${nextCost}
        </button>
        <p class="upgrade-effect-hint">${nextInfo.effect}</p>
        ${canBuy && willBeStuck ? `
          <p class="warn">Після купівлі залишиться $${afterPurchase.toFixed(2)} — не вистачить на комплект ($${kitCost})</p>
        ` : ''}
        ${!inIdle ? '<p class="upgrade-effect-hint">Купівля доступна між циклами</p>' : ''}
      ` : `
        <p class="upgrade-effect-hint">Максимальний рівень</p>
      `}
    </div>
  `
}

function qualityClass(q) {
  if (q >= 0.8) return 'high'
  if (q >= 0.5) return 'mid'
  return 'low'
}

function dotQuality(q) {
  if (q >= 0.7)  return 'high'
  if (q >= 0.35) return 'mid'
  return 'low'
}
