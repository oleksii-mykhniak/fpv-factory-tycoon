// Панель підвищення (П3).
//
// До цього стояння поруч із власним працівником СПИСУВАЛО гроші. Усі інші
// панелі цеху — стіл, шафа, дошка — на dwell відкривають модалку; ця одна
// платила сама, тож випадковий прохід повз техніка коштував $240 і нічого не
// пояснював.
//
// Панель навмисно крихітна: це не магазин, а одне питання з однією кнопкою.
// Головне, що вона додає, — видно, ЩО саме зміниться, а не лише скільки це
// коштує: у грі, де підвищення це просто число рівня, «швидкість 170 → 205» і
// є весь сенс покупки.

import { workerById } from '../state/gameState.js'
import { ROLES, promoteCost, roleLevelData } from '../defs/roles.js'

// Що саме росте в цієї ролі. Беремо з даних рівня, а не з тексту: змінити
// криву ролі має лишатись правкою `ROLE_CURVES` і нічого більше.
//
// Крапочок «●●○» тут більше немає (Стадія 10 / C): стелі рівнів не існує, а
// шкала без кінця не малюється. Лишилось число — воно й було єдиним, що ті
// крапочки насправді повідомляли.
const STATS = [
  { key: 'speed',      label: 'Швидкість',  fmt: v => Math.round(v),          better: 'up' },
  { key: 'pointMs',    label: 'Пайка точки', fmt: v => `${(v / 1000).toFixed(1)} с`, better: 'down' },
  { key: 'quality',    label: 'Якість',     fmt: v => `${Math.round(v * 100)}%`, better: 'up' },
  { key: 'missChance', label: 'Брак',       fmt: v => `${Math.round(v * 100)}%`, better: 'down' },
  { key: 'tier',       label: 'Клас кітів', fmt: v => v + 1,                  better: 'up' },
]

export function createPromoteModal(root, { onPromote }) {
  const overlay = document.createElement('div')
  overlay.id = 'promote-modal'
  overlay.className = 'modal-overlay'
  overlay.setAttribute('hidden', '')
  overlay.innerHTML = `
    <div class="modal modal--narrow">
      <div class="modal__header">
        <span class="modal__title" id="promote-title">Підвищення</span>
        <button class="modal__close" id="promote-close">✕</button>
      </div>
      <div class="modal__body" id="promote-body"></div>
    </div>
  `
  root.appendChild(overlay)

  let workerId = null

  overlay.querySelector('#promote-close').addEventListener('click', close)
  overlay.addEventListener('click', e => { if (e.target === overlay) close() })

  function open(state, id) {
    workerId = id
    if (!workerById(state, workerId)) return
    overlay.removeAttribute('hidden')
    render(state)
  }

  function close() {
    overlay.setAttribute('hidden', '')
    workerId = null
  }

  function update(state) {
    if (overlay.hasAttribute('hidden')) return
    // Робітника може не стати (перезапуск, зміна локації) — панель про нікого
    // мусить зникнути сама, а не лишитись висіти з кнопкою, яка кине помилку.
    if (!workerById(state, workerId)) { close(); return }
    render(state)
  }

  function render(state) {
    const worker = workerById(state, workerId)
    const role   = ROLES[worker.role]
    const level  = worker.level ?? 0
    const cost   = promoteCost(worker.role, level)
    const now    = roleLevelData(worker.role, level)
    const next   = roleLevelData(worker.role, level + 1)
    const afford = state.money >= cost

    overlay.querySelector('#promote-title').textContent = `${role.emoji} ${role.name}`

    const rows = next ? STATS
      .filter(s => now[s.key] !== undefined && next[s.key] !== undefined
                && now[s.key] !== next[s.key])
      .map(s => `
        <div class="promote-stat">
          <span class="promote-stat__label">${s.label}</span>
          <span class="promote-stat__value">
            ${s.fmt(now[s.key])} → <b>${s.fmt(next[s.key])}</b>
          </span>
        </div>
      `).join('') : ''

    overlay.querySelector('#promote-body').innerHTML = `
      <div class="promote-level">
        <span class="promote-level__num">${level + 1}</span>
        <span class="promote-level__text">рівень</span>
      </div>
      <p class="upgrade-effect-hint">${role.hint}</p>
      <div class="promote-stats">${rows}</div>
      <button class="btn btn--upgrade" id="promote-btn" ${afford ? '' : 'disabled'}>
        Підвищити — $${cost}
      </button>
      ${afford ? '' : `<p class="upgrade-effect-hint">Не вистачає $${
        Math.ceil(cost - state.money)}</p>`}
    `

    const btn = overlay.querySelector('#promote-btn')
    if (btn) btn.addEventListener('click', () => { onPromote(workerId); close() })
  }

  return { open, close, update }
}
