// Картка квесту (Стадія 9 / Р1+Р2) — «над чим я зараз працюю».
//
// До цього тут був список: головна картка, «ще N», і тап, який закріплював
// ціль. Стадія 9 звела все до ОДНІЄЇ картки — активний крок ланцюга рівно один,
// тож обирати нема з чого (див. sim/quests.js).
//
// Тап лишився, але означає інше: «покажи, куди йти». Стрілка веде безумовно
// лише поки ланцюг вчить основи, а далі зникає з екрана й повертається на
// запит — інакше вона весь час показує туди, куди гравець і сам ішов.
//
// Сюди ж переїхала нижня панель підсказок (Р2). Крок петлі («неси коробку до
// верстака») був окремою смугою внизу екрана і заважав; тепер це третій рядок
// картки — і тільки поки діють підказки, тобто перші кілька замовлень. Далі
// лишається сама ціль.
//
// Номера кроку («7/27») тут немає: довжина ланцюга — величина, яка змінюється з
// кожним балансним правленням, і обіцяти гравцеві конкретне число, а потім його
// зсунути, гірше, ніж не обіцяти нічого.
//
// Що рядок — то одна думка:
//   заголовок — що зробити
//   смужка    — скільки лишилось ($ для покупки, штуки для дії)
//   why/hint  — чому це варте грошей або чому ще не можна
//   step      — «неси коробку до верстака», поки петля ще нова

import { activeQuest } from '../sim/quests.js'
import { interruptQuest } from '../sim/derive.js'

export function createQuestTracker(root, { onShowArrow } = {}) {
  const el = document.createElement('div')
  el.id = 'quest-tracker'
  el.setAttribute('hidden', '')
  root.appendChild(el)

  el.addEventListener('click', () => onShowArrow?.())

  // Виконану ціль уже не порахувати зі стану — її там немає. Тому назви
  // тримаємо з останнього малювання: тост має що показати рівно тому, що
  // квест щойно був на екрані.
  const titles = new Map()
  let toastTimer = null

  const toast = document.createElement('div')
  toast.className = 'quest-toast'
  toast.setAttribute('hidden', '')
  root.appendChild(toast)

  let lastKey = null

  // `stepHint` — рядок петлі від HUD (Р2), або null коли підказки вже вимкнено.
  // `quiet` — поки на екрані смужка пайки: вона займає ту саму висоту, і
  // читати ціль у той момент однаково нема коли.
  // `askable` — чи тап зараз щось зробить (стрілки на екрані немає). Малюємо
  // компас лише тоді: підказка про дію, якої нема, гірша за жодну.
  function update(state, stepHint = null, quiet = false, askable = false) {
    if (quiet) el.setAttribute('data-quiet', '')
    else       el.removeAttribute('data-quiet')

    // Вставка перебиває ціль (Р1): згорілий комплект або порожня каса — це те,
    // що стоїть на місці ПРЯМО ЗАРАЗ, і поки воно стоїть, ціль ланцюга —
    // інформація не на часі. Індексу ланцюга вона не рухає.
    const quest = interruptQuest(state) ?? activeQuest(state)
    if (!quest) {
      el.setAttribute('hidden', '')
      lastKey = null
      return
    }
    titles.set(quest.id, quest.title)

    // Малюємо лише коли справді щось змінилось: update викликається на кожен
    // кадр, а innerHTML посеред тапу з'їдає сам тап.
    const key = JSON.stringify([
      quest.id, quest.title, Math.floor(quest.have), quest.need,
      quest.hint, stepHint, askable,
    ])
    if (key === lastKey) return
    lastKey = key

    el.removeAttribute('hidden')
    el.innerHTML = card(quest, stepHint, askable)
  }

  // Ціль виконано. Без цього момент непомітний: картка просто змінює текст, а
  // вся ця робота була про те, щоб прогрес було видно.
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

function card(quest, stepHint, askable) {
  const pct = quest.need > 0
    ? Math.max(0, Math.min(100, (quest.have / quest.need) * 100))
    : 100
  // Покупка міряється грошима, дія — штуками. Один і той самий $ у смужці
  // «продай 3 дрони» був би брехнею про те, чого від гравця хочуть.
  const meta = quest.kind === 'buy'
    ? `$${Math.floor(quest.have)} / $${quest.need}`
    : `${Math.floor(quest.have)} / ${quest.need}`

  // Смужка має сенс там, де є чого лишатись. «0 / 1» під «Замов перший
  // комплект» не показує прогрес — вона повторює заголовок і забирає рядок.
  const showBar = quest.need > 0 && !(quest.kind === 'do' && quest.need === 1)

  return `
    <div class="quest quest--primary ${quest.ready ? 'quest--ready' : ''}">
      <div class="quest__title">${quest.ready ? '✅ ' : ''}${quest.title}</div>
      ${showBar ? `
        <div class="quest__bar"><div class="quest__fill" style="width:${pct}%"></div></div>
        <div class="quest__meta">${meta}</div>
      ` : ''}
      ${quest.hint ? `<div class="quest__hint">${quest.hint}</div>` : ''}
      ${quest.why  ? `<div class="quest__why">${quest.why}</div>` : ''}
      ${stepHint   ? `<div class="quest__step">→ ${stepHint}</div>` : ''}
      ${askable    ? '<div class="quest__ask">🧭 тап — показати шлях</div>' : ''}
    </div>
  `
}
