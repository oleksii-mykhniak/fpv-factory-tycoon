// Картка «відкрито» (Стадія 9 / Р4).
//
// Гараж давав чимало — другий верстак, свій комплект, три вакансії, вищі стелі
// — але приходило це все одним німим пакетом, і гравець, заплативши $800,
// бачив порожню кімнату й вирішував, що покупка нічого не змінила.
//
// Тому кожна відкрита одиниця простору (кімната квартири, цех фабрики) тепер
// про себе розповідає списком із власного опису — `roomDef.unlocks` /
// `hallDef.unlocks`. Одна реалізація на обох: це той самий тип події, і
// написати її двічі означало б згодом мати дві різні поведінки.

export function createUnlockCard(root) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'unlock-card'
  overlay.setAttribute('hidden', '')
  root.appendChild(overlay)

  overlay.addEventListener('click', close)

  function open({ title, subtitle, unlocks = [] }) {
    // Кімната без опису — це не приклад «показати порожню картку», а причина не
    // показувати нічого: святкувати нема чого, поки хтось не напише, що саме
    // приїхало.
    if (!unlocks.length) return
    overlay.innerHTML = `
      <div class="modal unlock-card">
        <div class="modal__body">
          <div class="unlock-card__title">${title}</div>
          ${subtitle ? `<div class="unlock-card__sub">${subtitle}</div>` : ''}
          <ul class="unlock-card__list">
            ${unlocks.map(u => `<li>${u}</li>`).join('')}
          </ul>
          <button class="btn btn--upgrade" id="unlock-ok">Далі</button>
        </div>
      </div>
    `
    overlay.removeAttribute('hidden')
    overlay.querySelector('#unlock-ok').addEventListener('click', close)
  }

  function close() {
    overlay.setAttribute('hidden', '')
    overlay.innerHTML = ''
  }

  return { open, close }
}
