// Job board panel — hiring, on its own (S2).
//
// Hiring lived inside the upgrade modal because both were reached from the same
// button. They are different places now: the rack sells you better tools, the
// board by the door is where people are taken on. Splitting the panel is what
// makes "walk to the board to hire" mean anything.

import { workersInRole, nextHireCost } from '../state/gameState.js'
import { hiringAllowed, maxWorkersHere, roleCapHere } from '../state/locations.js'
import { ROLES, ROLE_ORDER } from '../defs/roles.js'

export function createHireModal(root, { onHire }) {
  const overlay = document.createElement('div')
  overlay.id = 'hire-modal'
  overlay.className = 'modal-overlay'
  overlay.setAttribute('hidden', '')
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <span class="modal__title">📋 Дошка оголошень</span>
        <button class="modal__close" id="hire-close">✕</button>
      </div>
      <div class="modal__body" id="hire-body"></div>
    </div>
  `
  root.appendChild(overlay)

  overlay.querySelector('#hire-close').addEventListener('click', close)
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
    const body    = overlay.querySelector('#hire-body')
    const canHire = hiringAllowed(state)
    const room    = maxWorkersHere(state)
    const onStaff = (state.workers ?? []).length

    body.innerHTML = `
      <div class="shop-section">
        <div class="shop-section__title">
          Робітники${canHire ? ` — ${onStaff}/${room}` : ''}
        </div>
        ${!canHire ? `
          <div class="shop-upgrade">
            <p class="upgrade-effect-hint">
              У квартирі ви працюєте самі. Переїдьте до гаража, щоб наймати людей.
            </p>
          </div>` : ''}
        ${canHire && onStaff >= room ? `
          <div class="shop-upgrade">
            <p class="upgrade-effect-hint">Більше людей сюди не поміститься — переїдьте далі.</p>
          </div>` : ''}
        ${!canHire ? '' : ROLE_ORDER.map(id => {
          const role  = ROLES[id]
          const count = workersInRole(state, id).length
          const cap   = roleCapHere(state, id)
          const cost  = nextHireCost(state, id)
          const full  = count >= cap
          const can   = state.money >= cost && !full
          return `
            <div class="shop-upgrade">
              <span class="shop-upgrade__current" style="color:${role.color}">
                ${role.emoji} ${role.name} — ${count}/${cap}
              </span>
              ${full
                ? `<p class="upgrade-effect-hint">${cap === 0
                    ? 'Не наймається в цій локації — переїдьте далі'
                    : 'Місць для цієї ролі більше немає'}</p>`
                : `<button class="btn btn--upgrade" data-hire="${id}" ${can ? '' : 'disabled'}>
                     Найняти — $${cost}
                   </button>`}
              <p class="upgrade-effect-hint">${role.hint}</p>
            </div>
          `
        }).join('')}
      </div>
    `

    body.querySelectorAll('[data-hire]').forEach(btn => {
      btn.addEventListener('click', () => onHire?.(btn.dataset.hire))
    })
  }

  return { open, close, update }
}
