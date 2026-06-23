import { Phase } from '../state/gameState.js'
import { UPGRADE_TRACKS } from '../state/upgrades.js'
import { currentLocation, LOCATIONS, LOCATION_ORDER, capFor, canMoveToLocation } from '../state/locations.js'

export function createUpgradeModal(root, { onBuyUpgrade, onMoveToLocation }) {
  const overlay = document.createElement('div')
  overlay.id = 'upgrade-modal'
  overlay.className = 'modal-overlay'
  overlay.setAttribute('hidden', '')
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <span class="modal__title">Поліпшення</span>
        <button class="modal__close" id="upgrade-close">✕</button>
      </div>
      <div class="modal__body" id="upgrade-body"></div>
    </div>
  `
  root.appendChild(overlay)

  overlay.querySelector('#upgrade-close').addEventListener('click', close)
  overlay.addEventListener('click', e => { if (e.target === overlay) close() })

  function open(state) {
    overlay.removeAttribute('hidden')
    render(state)
  }

  function close() {
    overlay.setAttribute('hidden', '')
  }

  function update(state) {
    if (!overlay.hasAttribute('hidden')) render(state)
  }

  function render(state) {
    const body = overlay.querySelector('#upgrade-body')

    // ── Upgrade tracks ────────────────────────────────────
    const trackHTML = Object.entries(UPGRADE_TRACKS).map(([id, track]) => {
      const level        = state.upgrades[track.stateKey] ?? 0
      const maxLevel     = track.costs.length
      const cap          = capFor(state, id)
      const effectiveMax = Math.min(maxLevel, cap)
      const nextInfo     = level < effectiveMax ? track.levels[level + 1] : null
      const nextCost     = level < effectiveMax ? track.costs[level]      : null
      const capLocked    = level >= cap && cap < maxLevel  // hit location cap before absolute max
      const canBuy       = nextCost !== null && state.phase === Phase.IDLE && state.money >= nextCost

      let footer = ''
      if (nextInfo) {
        footer = `
          <button class="btn btn--upgrade" data-upgrade="${id}" ${canBuy ? '' : 'disabled'}>
            → ${nextInfo.name} — $${nextCost}
          </button>
          <p class="upgrade-effect-hint">${nextInfo.effect}</p>
          ${!canBuy && state.phase !== Phase.IDLE
            ? '<p class="upgrade-effect-hint">Купівля між циклами</p>' : ''}
        `
      } else if (capLocked) {
        footer = '<p class="upgrade-effect-hint">Ліміт локації — переїдьте далі</p>'
      } else {
        footer = '<p class="upgrade-effect-hint">Максимальний рівень</p>'
      }

      return `
        <div class="shop-section">
          <div class="shop-section__title">${track.name}</div>
          <div class="shop-upgrade">
            <span class="shop-upgrade__current">${track.levels[level].name}</span>
            ${footer}
          </div>
        </div>
      `
    }).join('')

    // ── Location section ──────────────────────────────────
    const loc        = currentLocation(state)
    const currentIdx = LOCATION_ORDER.indexOf(state.locationId ?? 'apartment')
    const nextLocId  = LOCATION_ORDER[currentIdx + 1]

    let locationHTML = ''
    if (nextLocId) {
      const nextLoc        = LOCATIONS[nextLocId]
      const { can, reasons } = canMoveToLocation(state, nextLocId)
      const moveEnabled    = can && state.phase === Phase.IDLE
      locationHTML = `
        <div class="shop-section shop-section--location">
          <div class="shop-section__title">Локація: ${loc.emoji} ${loc.name}</div>
          <div class="shop-upgrade">
            <span class="shop-upgrade__current">Наступна: ${nextLoc.emoji} ${nextLoc.name}</span>
            <button class="btn btn--upgrade" id="move-btn" ${moveEnabled ? '' : 'disabled'}>
              Переїхати до ${nextLoc.name} — $${nextLoc.unlockCost}
            </button>
            ${reasons.length
              ? `<p class="upgrade-effect-hint">${reasons.join(' · ')}</p>`
              : can
                ? '<p class="upgrade-effect-hint">Умови виконані — готово до переїзду!</p>'
                : ''
            }
            ${!moveEnabled && state.phase !== Phase.IDLE && can
              ? '<p class="upgrade-effect-hint">Переїзд між циклами</p>' : ''}
          </div>
        </div>
      `
    } else {
      locationHTML = `
        <div class="shop-section shop-section--location">
          <div class="shop-section__title">Локація: ${loc.emoji} ${loc.name}</div>
          <div class="shop-upgrade">
            <p class="upgrade-effect-hint">Максимальна локація</p>
          </div>
        </div>
      `
    }

    body.innerHTML = trackHTML + locationHTML

    body.querySelectorAll('[data-upgrade]').forEach(btn => {
      btn.addEventListener('click', () => onBuyUpgrade(btn.dataset.upgrade))
    })
    const moveBtn = body.querySelector('#move-btn')
    if (moveBtn) moveBtn.addEventListener('click', () => {
      if (nextLocId) { onMoveToLocation(nextLocId); close() }
    })
  }

  return { open, close, update }
}
