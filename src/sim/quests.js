// Цілі гравця (П1) — «над чим я зараз працюю і скільки лишилось».
//
// До цього вся навігація в грі була на один крок уперед: підказка в HUD каже,
// що робити з тим, що в руках, а стрілка (`nextObjective`) веде до найближчої
// корисної зони. Обидві описують ОДИН оберт петлі «замов-запаяй-продай». Те,
// заради чого крутиш цю петлю — наступний паяльник, гараж, переїзд, — не було
// видно ніде, поки сам не дійдеш до шафи й не відкриєш модалку.
//
// РІШЕННЯ: квести — це derived-значення, а не збережене дерево.
//
// Той самий підхід, що й у derive.js: список рахується зі стану щоразу. У сейв
// іде рівно одне поле — `pinnedQuestId`, який квест гравець закріпив тапом.
// Дерево квестів у сейві довелося б мігрувати після кожної зміни балансу, а
// «виконано» тут і так однозначно виводиться зі стану: паяльник куплено —
// квесту нема.
//
// Кожен квест знає три речі:
//   title      — що зробити
//   need/have  — скільки коштує і скільки є (прогрес — це гроші)
//   zoneKind   — куди вести стрілку; саме KIND, а не координати, бо квест не
//                мусить знати, де в цій локації стоїть шафа
//   hint       — чому ще не можна, якщо справа не в грошах

import {
  KIT_TYPES, nextHireCost, workersInRole,
  nextRoomId, canUnlockRoom, nextHallId, canUnlockHall,
} from '../state/gameState.js'
import { UPGRADE_TRACKS } from '../state/upgrades.js'
import {
  kitsForLocation, capFor, roleCapHere, canMoveToLocation, LOCATION_ORDER, LOCATIONS,
} from '../state/locations.js'
import { roomDef } from '../defs/layouts/rooms.js'
import { hallDef } from '../defs/layouts/factory.js'
import { ROLE_ORDER, roleDef } from '../defs/roles.js'

// Гроші — не єдина умова, але єдина, яку показує смужка. Решту причин
// показуємо текстом, і рядок про гроші з них прибираємо, щоб не казати те саме
// двічі.
const hintFrom = (reasons) => {
  const rest = (reasons ?? []).filter(r => !r.startsWith('Потрібно $'))
  return rest.length ? rest.join(' · ') : null
}

// Наступний рівень треку, якщо його ще можна купити тут.
function nextLevelOf(game, trackId) {
  const track = UPGRADE_TRACKS[trackId]
  const level = game.upgrades?.[track.stateKey] ?? 0
  const max   = Math.min(track.costs.length, capFor(game, trackId))
  if (level >= max) return null
  return { name: track.levels[level + 1].name, cost: track.costs[level] }
}

// Квест на трек апгрейдів. Дієслово окремо від назви рівня: «Постав: Два
// верстаки» і «Поліпши: Кращий паяльник» читаються як вказівки, а
// «Верстаки: Два верстаки» — ні.
const upgradeQuest = (id, trackId, verb, rank) => ({
  id, rank, zoneKind: 'rack',
  resolve(game) {
    const next = nextLevelOf(game, trackId)
    return next && { title: `${verb}: ${next.name}`, need: next.cost }
  },
})

// Порядок — дизайнерське рішення, а не формула, тому це число в описі квесту.
// Спершу те, без чого решта не відкриється (паяльник → гараж), потім штат,
// потім те, що росте вшир.
export const QUESTS = Object.freeze([
  {
    id: 'first_order', rank: 0, zoneKind: 'desk',
    resolve(game) {
      if ((game.ordersPlaced ?? 0) > 0) return null
      const costs = kitsForLocation(game)
        .map(id => KIT_TYPES[id]?.cost ?? 0).filter(c => c > 0)
      if (!costs.length) return null
      return { title: 'Замов перший дрон', need: Math.min(...costs) }
    },
  },

  upgradeQuest('soldering', 'soldering', 'Поліпши', 10),

  {
    id: 'room', rank: 20, zoneKind: 'rack',
    resolve(game) {
      const roomId = nextRoomId(game)
      if (!roomId) return null
      const room = roomDef(roomId)
      return {
        title: `Прибудуй: ${room.name}`,
        need:  room.cost,
        hint:  hintFrom(canUnlockRoom(game, roomId).reasons),
      }
    },
  },

  {
    id: 'hire', rank: 30, zoneKind: 'jobboard',
    resolve(game) {
      const roleId = ROLE_ORDER.find(id =>
        workersInRole(game, id).length < roleCapHere(game, id))
      if (!roleId) return null
      return { title: `Найми: ${roleDef(roleId).name}`, need: nextHireCost(game, roleId) }
    },
  },

  upgradeQuest('benches',   'benches',   'Постав',  40),
  upgradeQuest('storage',   'storage',   'Розшир',  50),
  upgradeQuest('logistics', 'logistics', 'Прискор', 60),

  {
    id: 'hall', rank: 70, zoneKind: 'rack',
    resolve(game) {
      const hallId = nextHallId(game)
      if (!hallId || (game.locationId ?? 'apartment') !== 'factory') return null
      const hall = hallDef(hallId)
      return {
        title: `Відкрий: ${hall.name}`,
        need:  hall.cost,
        hint:  hintFrom(canUnlockHall(game, hallId).reasons),
      }
    },
  },

  {
    id: 'move', rank: 80, zoneKind: 'rack',
    resolve(game) {
      const idx    = LOCATION_ORDER.indexOf(game.locationId ?? 'apartment')
      const nextId = LOCATION_ORDER[idx + 1]
      if (!nextId) return null
      const loc = LOCATIONS[nextId]
      return {
        title: `Переїзд: ${loc.emoji} ${loc.name}`,
        need:  loc.unlockCost,
        hint:  hintFrom(canMoveToLocation(game, nextId).reasons),
      }
    },
  },
])

// Опис квесту + те, що він порахував → те, що бачить UI. `have` навмисно
// обрізане по `need`: смужка, яка переповнюється, показує не прогрес, а розмір
// каси.
function shape(def, got, game) {
  if (!got) return null
  const need = got.need ?? 0
  return {
    id:       def.id,
    zoneKind: def.zoneKind,
    rank:     def.rank,
    title:    got.title,
    hint:     got.hint ?? null,
    need,
    have:     Math.min(game.money, need),
    ready:    game.money >= need,
  }
}

// Усі цілі, які зараз мають сенс, від найближчої до найдальшої.
export function activeQuests(game) {
  return QUESTS
    .map(def => shape(def, def.resolve(game), game))
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank)
}

// Квест, за яким іде стрілка. Закріплений — якщо він ще активний; інакше
// нічого: стрілка повертається до звичайної роботи по петлі. Саме «інакше
// нічого», а не «перший активний», бо стрілка, яка сама поїхала до шафи, поки
// в руках коробка, — це не підказка, а перешкода.
// Рахує ОДИН квест, а не весь список: цю функцію смикає стрілка на кожному
// кадрі, а перевіряти при цьому умови переїзду й усіх цехів — це 60 разів на
// секунду робота, з якої потрібен один рядок.
export function pinnedQuest(game) {
  const def = QUESTS.find(q => q.id === game.pinnedQuestId)
  return def ? shape(def, def.resolve(game), game) : null
}
