// Дошка оголошень — люди (S2, розширено Стадією 11 / D).
//
// Найм жив у панелі поліпшень, бо обидва відкривались однією кнопкою. Це різні
// місця: шафа продає інструменти, дошка біля дверей — це де беруть людей.
//
// Стадія 11 додала сюди ДРУГУ половину тієї самої теми — підвищення. Доти воно
// було зоною, яка їздила разом із працівником: щоб підняти комусь рівень, треба
// було наздогнати людину й постояти поруч. На телефоні це полювання, а головне
// — штат опинявся у двох різних місцях гри, і жодне з них не показувало його
// цілком. Тепер обидва питання про людей задаються тут: кого взяти й кого
// підняти.
//
// Обидва списки ростуть по одному рядку (D2): роль з'являється, коли ланцюг
// квестів до неї дійшов, і зникає, коли вакансій більше немає. Рядок «Місць
// більше немає» — це не інформація, а сміття: він не каже, що робити.

import { workersInRole, workersOf } from '../state/gameState.js'
import { hiringAllowed, maxWorkersHere, roleCapInHall, ruleAt } from '../state/locations.js'
import { hallDef } from '../defs/layouts/factory.js'
import { nextHireCost } from '../state/gameState.js'
import { ROLES, ROLE_ORDER, promoteCost } from '../defs/roles.js'
import { featureIntroduced } from '../sim/unlocks.js'

export function createHireModal(root, { onHire, onPromote }) {
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

  // hallId: which hall's board was walked up to (F4). Null where the location
  // has no halls — then the board hires for the whole shop.
  let hallId = null

  function open(state, atHall = null) {
    hallId = atHall
    overlay.removeAttribute('hidden')
    render(state)
  }

  function close() {
    overlay.setAttribute('hidden', '')
  }

  function update(state) {
    if (!overlay.hasAttribute('hidden')) render(state)
  }

  // Кого показувати в списку вакансій: роль, яку ланцюг уже ввів і для якої тут
  // є вільне місце. Обидві умови ховають рядок, а не гасять кнопку — рядок,
  // який ніколи не стане активним, читається як поламаний магазин.
  function openRoles(state) {
    return ROLE_ORDER.filter(id =>
      featureIntroduced(state, `role:${id}`) &&
      workersInRole(state, id, hallId).length < roleCapInHall(state, hallId, id))
  }

  // Чий рівень тут можна піднімати. Локація може не мати підвищень узагалі
  // (вдома), і тоді секції немає — як не було й зони.
  function staffHere(state) {
    if (!ruleAt(state, 'hasPromote')) return []
    if (!featureIntroduced(state, 'panel:promote')) return []
    return workersOf(state).filter(w => !hallId || (w.hallId ?? null) === hallId)
  }

  function render(state) {
    const body    = overlay.querySelector('#hire-body')
    const canHire = hiringAllowed(state)
    const room    = hallId ? null : maxWorkersHere(state)
    const onStaff = hallId
      ? (state.workers ?? []).filter(w => (w.hallId ?? null) === hallId).length
      : (state.workers ?? []).length
    const hallName = hallId ? (hallDef(hallId)?.name ?? hallId) : null

    const roles = canHire ? openRoles(state) : []
    const staff = staffHere(state)

    const vacancies = `
      <div class="shop-section">
        <div class="shop-section__title">
          ${hallName ? `Вакансії ${hallName}` : 'Вакансії'}${
            canHire && room !== null ? ` — ${onStaff}/${room}` : ''}
        </div>
        ${!canHire ? `
          <div class="shop-upgrade">
            <p class="upgrade-effect-hint">
              У квартирі ви працюєте самі. Прибудуйте гараж, щоб наймати людей.
            </p>
          </div>` : ''}
        ${canHire && !roles.length ? `
          <div class="shop-upgrade">
            <p class="upgrade-effect-hint">${onStaff >= (room ?? Infinity)
              ? 'Більше людей сюди не поміститься — рости треба простором'
              : 'Вакансій поки немає'}</p>
          </div>` : ''}
        ${roles.map(id => {
          const role = ROLES[id]
          const count = workersInRole(state, id, hallId).length
          const cap   = roleCapInHall(state, hallId, id)
          const cost  = nextHireCost(state, id)
          return `
            <div class="shop-upgrade">
              <span class="shop-upgrade__current" style="color:${role.color}">
                ${role.emoji} ${role.name} — ${count}/${cap}
              </span>
              <button class="btn btn--upgrade" data-hire="${id}" ${state.money >= cost ? '' : 'disabled'}>
                Найняти — $${cost}
              </button>
              <p class="upgrade-effect-hint">${role.hint}</p>
            </div>
          `
        }).join('')}
      </div>
    `

    // Ваші люди (Стадія 11 / D3). Рівень видно у списку, а що саме дасть
    // наступний — у панелі підвищення: «швидкість 170 → 205» і є весь сенс
    // покупки, і повторювати його в кожному рядку означало б перетворити
    // список на таблицю.
    const payroll = staff.length ? `
      <div class="shop-section">
        <div class="shop-section__title">Ваші люди — ${staff.length}</div>
        ${staff.map(w => {
          const role = ROLES[w.role]
          const cost = promoteCost(w.role, w.level ?? 0)
          return `
            <div class="shop-upgrade">
              <span class="shop-upgrade__current" style="color:${role.color}">
                ${role.emoji} ${role.name} — рівень ${(w.level ?? 0) + 1}
              </span>
              <button class="btn btn--upgrade" data-promote="${w.id}"
                ${state.money >= cost ? '' : 'disabled'}>
                Підвищити — $${cost}
              </button>
            </div>
          `
        }).join('')}
      </div>
    ` : ''

    body.innerHTML = vacancies + payroll

    body.querySelectorAll('[data-hire]').forEach(btn => {
      btn.addEventListener('click', () => onHire?.(btn.dataset.hire, hallId))
    })
    body.querySelectorAll('[data-promote]').forEach(btn => {
      btn.addEventListener('click', () => onPromote?.(btn.dataset.promote))
    })
  }

  return { open, close, update }
}
