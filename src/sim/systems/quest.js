// Квести (П1) — сам список рахується зі стану (sim/quests.js). Системі
// лишається рівно те, чого чиста функція не вміє: помітити, що ціль зникла зі
// списку, і сказати про це один раз.
//
// Без цієї події виконання квесту непомітне: картка просто змінює текст, а
// вся стадія була про те, щоб прогрес було ВИДНО.

import { activeQuests } from '../quests.js'
import { EV, emit } from '../events.js'

export function questSystem(world, dt, events) {
  // Кожен перехід стану повертає новий об'єкт, тож ідентичність — надійна
  // ознака «нічого не змінилось». Перераховувати список 20 разів на секунду
  // просто так не треба.
  if (world.questGameRef === world.game) return
  world.questGameRef = world.game

  const ids  = activeQuests(world.game).map(q => q.id)
  const prev = world.questIds

  if (prev) {
    for (const id of prev) {
      if (!ids.includes(id)) emit(events, EV.QUEST_DONE, { questId: id })
    }
  }
  world.questIds = ids

  // Закріплення знімається саме: закріплена ціль, якої вже нема, тримала б
  // стрілку на шафі, де більше нічого не купиш.
  if (world.game.pinnedQuestId && !ids.includes(world.game.pinnedQuestId)) {
    world.game = { ...world.game, pinnedQuestId: null }
    world.questGameRef = world.game
  }
}
