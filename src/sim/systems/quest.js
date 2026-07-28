// Квести (Стадія 9 / Р1) — сам ланцюг рахується зі стану (sim/quests.js).
// Системі лишається рівно те, чого чиста функція не вміє:
//
//   1. помітити, що активний крок змінився, і сказати про це один раз;
//   2. записати найвищий $/сек, який цех колись показував.
//
// Друге тут, а не в квесті, бо $/сек живе в журналі продажів, а не в стані гри:
// фінальна ціль ланцюга — єдиний крок, чий прогрес не виводиться з `game`. Щоб
// умова лишалась монотонною (див. коментар у quests.js), у стан іде МАКСИМУМ, а
// не поточне значення — інакше ціль, якої гравець досяг на хвилину, знову стала
// б недосягнутою.

import { activeQuest } from '../quests.js'
import { bumpStats } from '../../state/gameState.js'
import { incomePerSec } from '../derive.js'
import { EV, emit } from '../events.js'

export function questSystem(world, dt, events) {
  // Кожен перехід стану повертає новий об'єкт, тож ідентичність — надійна
  // ознака «нічого не змінилось». Перебирати ланцюг 20 разів на секунду ні до
  // чого: він знає і про переїзд, і про всі цехи.
  if (world.questGameRef === world.game) return
  world.questGameRef = world.game

  const rate = incomePerSec(world.salesLog, world.now)
  if (rate > (world.game.stats?.bestRate ?? 0)) {
    world.game = bumpStats(world.game, () => ({ bestRate: rate }))
    world.questGameRef = world.game
    emit(events, EV.STATE_DIRTY)
  }

  const id   = activeQuest(world.game)?.id ?? null
  const prev = world.questStepId

  // `undefined` — це перший кадр: тоді нічого не виконано, просто запам'ятали.
  if (prev !== undefined && prev !== null && prev !== id) {
    emit(events, EV.QUEST_DONE, { questId: prev })
  }
  world.questStepId = id
}
