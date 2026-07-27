// Квест-трекер (П1) — картка «над чим я зараз працюю».
//
// Показує ОДНУ ціль, а не список: на телефоні три картки з'їдять пів екрана, а
// сенс трекера в тому, щоб його можна було прочитати кутиком ока. Решта цілей
// відкривається тапом по «ще N».
//
// Тап по картці ЗАКРІПЛЮЄ ціль — після цього стрілка веде до неї (див.
// nextObjective). Тап по закріпленій знімає закріплення й повертає стрілку до
// звичайної роботи по петлі.
//
// Прогрес тут — завжди гроші. Не тому, що інших умов не буває (гараж хоче ще й
// паяльник рівня 2), а тому що смужка може показувати рівно одне число; решта
// умов іде текстом під нею.

import { activeQuests } from '../sim/quests.js'

export function createQuestTracker(root, { onPin }) {
  const el = document.createElement('div')
  el.id = 'quest-tracker'
  el.setAttribute('hidden', '')
  root.appendChild(el)

  // Виконану ціль уже не порахувати зі стану — її там немає. Тому назви
  // тримаємо з останнього малювання: тост має що показати рівно тому, що
  // квест щойно був на екрані.
  const titles = new Map()
  let toastTimer = null

  const toast = document.createElement('div')
  toast.className = 'quest-toast'
  toast.setAttribute('hidden', '')
  root.appendChild(toast)

  let expanded  = false
  let lastKey   = null
  let lastState = null

  // Розгортання — це стан ПАНЕЛІ, а не гри, тож перемальовуємо тут самі. Через
  // renderUI це не працює за визначенням: той виходить одразу, якщо стан гри не
  // змінився, і список залишався б згорнутим до найближчої покупки.
  el.addEventListener('click', (e) => {
    const card = e.target.closest?.('[data-quest]')
    if (card) {
      // Порожній id — це тап по вже закріпленій картці: знімаємо закріплення.
      onPin(card.dataset.quest || null)
      expanded = false
      return
    }
    if (e.target.closest?.('#quest-more')) {
      expanded = !expanded
      render()
    }
  })

  function update(state) {
    lastState = state
    render()
  }

  function render() {
    const state = lastState
    if (!state) return
    const quests = activeQuests(state)
    for (const q of quests) titles.set(q.id, q.title)
    if (!quests.length) {
      el.setAttribute('hidden', '')
      lastKey = null
      return
    }

    const pinnedId = state.pinnedQuestId ?? null
    // Закріплена ціль стоїть першою — інакше тап переставляв би картку під
    // пальцем на іншу.
    const head = quests.find(q => q.id === pinnedId) ?? quests[0]
    const rest = quests.filter(q => q.id !== head.id)

    // Малюємо лише коли справді щось змінилось: renderUI викликається на кожен
    // кадр, а innerHTML посеред тапу з'їдає сам тап.
    const key = JSON.stringify([expanded, pinnedId, quests.map(q =>
      [q.id, q.title, Math.floor(q.have), q.need, q.hint])])
    if (key === lastKey) return
    lastKey = key

    el.removeAttribute('hidden')
    el.innerHTML = `
      ${card(head, head.id === pinnedId, true)}
      ${expanded ? rest.map(q => card(q, q.id === pinnedId, false)).join('') : ''}
      ${rest.length ? `
        <button id="quest-more" class="quest__more">
          ${expanded ? '▲ згорнути' : `▼ ще ${rest.length}`}
        </button>` : ''}
    `
  }

  // Ціль виконано. Без цього момент непомітний: картка просто зникає, а вся
  // стадія була про те, щоб прогрес було видно.
  function flash(questId) {
    const title = titles.get(questId)
    if (!title) return
    toast.textContent = `✅ ${title}`
    toast.removeAttribute('hidden')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toast.setAttribute('hidden', ''), 2200)
  }

  return { update, flash }
}

function card(quest, pinned, primary) {
  const pct = quest.need > 0
    ? Math.max(0, Math.min(100, (quest.have / quest.need) * 100))
    : 100
  const money = quest.need > 0
    ? `$${Math.floor(quest.have)} / $${quest.need}`
    : ''

  return `
    <div class="quest ${primary ? 'quest--primary' : 'quest--sub'}
                ${pinned ? 'quest--pinned' : ''}
                ${quest.ready ? 'quest--ready' : ''}"
         data-quest="${pinned ? '' : quest.id}">
      <div class="quest__title">${quest.ready ? '✅ ' : ''}${quest.title}</div>
      ${quest.need > 0 ? `
        <div class="quest__bar"><div class="quest__fill" style="width:${pct}%"></div></div>
        <div class="quest__meta">${money}</div>
      ` : ''}
      ${quest.hint ? `<div class="quest__hint">${quest.hint}</div>` : ''}
    </div>
  `
}
