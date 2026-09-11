// Панель контрактів (Стадія 14 / К3.2).
//
// Найтупіша панель у грі, і це навмисно: у неї немає жодної кнопки. Контракт
// не «беруть» і не «здають» — він закривається звичайним відвантаженням
// (К3.3), тож усе, що панель має зробити, — відповісти на питання «що вигідно
// збирати зараз». Кнопка тут була б кнопкою «так, я прочитав».
//
// Малює три рядки: тип, скільки лишилось, скільки часу лишилось, премія.

import { KIT_TYPES } from '../state/kits.js'
import { contractsOf, contractStanding } from '../state/contracts.js'

const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function createContractsModal(root) {
  const overlay = document.createElement('div')
  overlay.id = 'contracts-modal'
  overlay.className = 'modal-overlay'
  overlay.setAttribute('hidden', '')
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <span class="modal__title">Контракти</span>
        <button class="modal__close" id="contracts-close">✕</button>
      </div>
      <div class="modal__body" id="contracts-body"></div>
    </div>
  `
  root.appendChild(overlay)

  overlay.querySelector('#contracts-close').addEventListener('click', close)
  overlay.addEventListener('click', e => { if (e.target === overlay) close() })

  // `now` приходить ззовні, як і скрізь у грі: час — це `world.now`, а не
  // Date.now(), інакше панель і сцена показували б різні секунди.
  let lastNow = 0

  function open(state, now) {
    lastNow = now ?? lastNow
    overlay.removeAttribute('hidden')
    render(state)
  }

  function close() { overlay.setAttribute('hidden', '') }

  function update(state, now) {
    lastNow = now ?? lastNow
    if (!overlay.hasAttribute('hidden')) render(state)
  }

  function render(state) {
    const body = overlay.querySelector('#contracts-body')
    const list = contractsOf(state)

    const rows = list.map(c => {
      const kit  = KIT_TYPES[c.kitId]
      const left = c.qty - c.done
      const ms   = c.dueAt - lastNow
      // Менш ніж хвилина — інший колір. Це єдина річ на панелі, яка встигає
      // змінитись, поки на неї дивляться.
      const urgent = ms < 60_000
      return `
        <div class="shop-upgrade">
          <span class="shop-upgrade__current">
            ${kit?.emoji ?? ''} ${kit?.name ?? c.kitId} — лишилось ${left} з ${c.qty}
          </span>
          <p class="upgrade-effect-hint${urgent ? ' contract--urgent' : ''}">
            ⏳ ${clock(ms)} · премія $${c.bonus}
          </p>
        </div>
      `
    }).join('')

    body.innerHTML = `
      <div class="shop-section">
        <div class="shop-section__title">Замовлення — ${list.length}/3</div>
        ${rows || '<p class="upgrade-effect-hint">Замовлень поки немає</p>'}
      </div>
      <div class="shop-section">
        <div class="shop-section__title">Репутація ${contractStanding(state)}</div>
        <p class="upgrade-effect-hint">
          Що вища репутація — то більші партії й більші премії. Виконаний
          контракт її піднімає, прострочений — опускає. Грошима провал не
          коштує нічого.
        </p>
        <p class="upgrade-effect-hint">
          Нічого підтверджувати не треба: дрон, відвантажений у скриньку,
          сам іде в рахунок замовлення свого типу.
        </p>
      </div>
    `
  }

  return { open, close, update }
}
