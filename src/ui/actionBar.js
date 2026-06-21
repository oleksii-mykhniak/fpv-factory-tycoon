import { Phase } from '../state/gameState.js'
import { UPGRADE_TRACKS } from '../state/upgrades.js'

export function createActionBar(root, { onShopOpen, onUpgradeOpen, onSettingsOpen }) {
  const el = document.createElement('div')
  el.id = 'action-bar'
  el.innerHTML = `
    <button class="action-bar__btn" id="ab-shop">
      <span class="action-bar__icon">🛒</span>
      <span class="action-bar__label">Магазин</span>
      <span class="action-bar__badge" id="ab-badge" hidden>!</span>
    </button>
    <button class="action-bar__btn" id="ab-upgrade">
      <span class="action-bar__icon">⬆️</span>
      <span class="action-bar__label">Поліпшення</span>
      <span class="action-bar__badge" id="ab-upgrade-badge" hidden>!</span>
    </button>
    <button class="action-bar__btn" id="ab-settings">
      <span class="action-bar__icon">⚙️</span>
      <span class="action-bar__label">Налаштування</span>
    </button>
  `
  root.appendChild(el)

  const shopBtn    = el.querySelector('#ab-shop')
  const upgradeBtn = el.querySelector('#ab-upgrade')
  const badge        = el.querySelector('#ab-badge')
  const upgradeBadge = el.querySelector('#ab-upgrade-badge')

  shopBtn.addEventListener('click', onShopOpen)
  upgradeBtn.addEventListener('click', onUpgradeOpen)
  el.querySelector('#ab-settings').addEventListener('click', onSettingsOpen)

  function update(state) {
    const idle = state.phase === Phase.IDLE

    // "!" on Shop when idle (prompt to order next kit).
    badge.hidden = !idle
    shopBtn.classList.toggle('action-bar__btn--notify', idle)

    // "!" on Upgrades when idle and player can afford at least one upgrade.
    const canUpgrade = idle && Object.values(UPGRADE_TRACKS).some(track => {
      const level    = state.upgrades[track.stateKey] ?? 0
      const nextCost = level < track.costs.length ? track.costs[level] : null
      return nextCost !== null && state.money >= nextCost
    })
    upgradeBadge.hidden = !canUpgrade
    upgradeBtn.classList.toggle('action-bar__btn--notify', canUpgrade)
  }

  return { el, update }
}
