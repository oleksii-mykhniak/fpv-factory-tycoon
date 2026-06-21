export function createActionBar(root, { onShopOpen, onUpgradeOpen, onSettingsOpen }) {
  const el = document.createElement('div')
  el.id = 'action-bar'
  el.innerHTML = `
    <button class="action-bar__btn" id="ab-shop">
      <span class="action-bar__icon">🛒</span>
      <span class="action-bar__label">Магазин</span>
    </button>
    <button class="action-bar__btn" id="ab-upgrade">
      <span class="action-bar__icon">⬆️</span>
      <span class="action-bar__label">Поліпшення</span>
    </button>
    <button class="action-bar__btn" id="ab-settings">
      <span class="action-bar__icon">⚙️</span>
      <span class="action-bar__label">Налаштування</span>
    </button>
  `
  root.appendChild(el)
  el.querySelector('#ab-shop').addEventListener('click', onShopOpen)
  el.querySelector('#ab-upgrade').addEventListener('click', onUpgradeOpen)
  el.querySelector('#ab-settings').addEventListener('click', onSettingsOpen)
  return { el }
}
