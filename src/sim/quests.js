// Ланцюг квестів (Стадія 9 / Р1) — «одна річ, яку гра просить зробити».
//
// Стадія 8 зробила з квестів МНОЖИНУ: список активних цілей із `rank`, картка
// плюс «ще N». На тесті виявилось, що це прайс-лист — усі кроки, крім першого,
// мали вигляд «купи X за $Y», і гравець, який щойно відкрив гараж, читав
// цінник замість вказівки. Плюс про «що робити» говорили три системи одночасно
// (нижня панель кроку, картка, стрілка).
//
// Тому тепер це ЛАНЦЮГ: упорядкований масив кроків, активний — рівно один.
//
// У сейв, як і раніше, не йде нічого: активний крок — це перший, у якого
// `done(game)` ще false. Це працює тільки за однієї умови, і вона тут головна:
//
//   КОЖНА умова `done` мусить бути МОНОТОННОЮ.
//
// Куплене не відкуповується, лічильники (`game.stats`) тільки ростуть. Умова,
// яка може стати хибною знову, відкотила б гравця на пройдений крок — саме тому
// «продай 3 дрони» рахується по `stats.sold`, а не по тому, що лежить на
// верстаку.
//
// Кроки бувають двох типів, і вони чергуються (принцип П3 плану): дію
// заробляєш петлею, покупкою знімаєш рутину.
//
//   kind: 'do'   — прогрес по лічильнику: have/need — це штуки
//   kind: 'buy'  — прогрес по грошах: have/need — це $
//
// `zoneKind` — куди вести стрілку. Саме KIND, а не координати: крок не мусить
// знати, де в цій локації стоїть шафа.

import {
  KIT_TYPES, nextHireCost, workersInRole, nextRoomId, canUnlockRoom,
  nextHallId, canUnlockHall,
} from '../state/gameState.js'
import { UPGRADE_TRACKS } from '../state/upgrades.js'
import {
  kitsForLocation, capFor, roleCapHere, canMoveToLocation,
  LOCATION_ORDER, LOCATIONS, roomIsOpen,
} from '../state/locations.js'
import { roomDef } from '../defs/layouts/rooms.js'
import { hallDef } from '../defs/layouts/factory.js'
import { roleDef } from '../defs/roles.js'
import { ENDGAME_RATE_TARGET } from '../state/config.js'

// ── Дрібні читачі стану ───────────────────────────────────

const stats     = (game) => game.stats ?? {}
const level     = (game, trackId) => game.upgrades?.[UPGRADE_TRACKS[trackId].stateKey] ?? 0
const hired     = (game, roleId) => workersInRole(game, roleId).length
const atFactory = (game) => (game.locationId ?? 'apartment') === 'factory'

// Гроші — не єдина умова покупки, але єдина, яку показує смужка. Решту причин
// показуємо текстом, і рядок про гроші з них прибираємо, щоб не казати те саме
// двічі.
const hintFrom = (reasons) => {
  const rest = (reasons ?? []).filter(r => !r.startsWith('Потрібно $'))
  return rest.length ? rest.join(' · ') : null
}

// ── Конструктори кроків ───────────────────────────────────

// Купити трек до рівня `target`. `done` — саме «рівень доріс», а не «трек
// уперся в стелю»: гравець може купити щось раніше, ніж ланцюг попросить, і
// крок мусить це зарахувати (ланцюг — порада, а не двері).
const buyUpgrade = (id, trackId, target, why) => ({
  id, kind: 'buy', zoneKind: 'rack', why, trackId, target,
  // Крок безглуздий, якщо тут такого рівня взагалі не продають — тоді ланцюг
  // його проскакує (склад у квартирі: стеля 0).
  moot: (game) => capFor(game, trackId) < target,
  done: (game) => level(game, trackId) >= target,
  resolve(game) {
    const track = UPGRADE_TRACKS[trackId]
    const from  = level(game, trackId)
    const next  = track.levels[from + 1]
    if (!next) return null
    return { title: `Купи: ${next.name}`, need: track.costs[from] }
  },
})

// Найняти першого працівника ролі. Штат «не всіх» — це вже правило локації
// (roleCapHere), тому крок сам себе вимикає там, де вакансій нема.
const hireRole = (roleId, why) => ({
  id: `hire_${roleId}`, kind: 'buy', zoneKind: 'jobboard', why,
  moot: (game) => roleCapHere(game, roleId) < 1,
  done: (game) => hired(game, roleId) >= 1,
  resolve(game) {
    const role = roleDef(roleId)
    return { title: `Найми: ${role.emoji} ${role.name}`, need: nextHireCost(game, roleId) }
  },
})

// Продати N дронів (будь-яких або конкретного типу). Згорілий не рахується сам
// собою: `stats.sold` росте в `sell()`, а згорілий комплект до продажу не
// доходить — його списують у смітник.
const sellCount = (id, need, title, why, kitId = null) => ({
  id, kind: 'do', zoneKind: 'mailbox', why,
  moot: (game) => kitId ? !kitsForLocation(game).includes(kitId) : false,
  have: (game) => kitId ? (stats(game).soldByKit?.[kitId] ?? 0) : (stats(game).sold ?? 0),
  done(game) { return this.have(game) >= need },
  resolve: () => ({ title, need }),
})

// ── Акти ──────────────────────────────────────────────────
//
// Акт — це не лише групування для читача. `outgrown` — умова «ти вже далі»:
// вона потрібна сейвам, записаним до Стадії 9. Лічильників у них немає, тож
// гравцеві з фабрикою пропонували б «продай 3 дрони». Акт, який `outgrown`,
// вважається пройденим цілком, і ланцюг починається з наступного.

export const QUEST_ACTS = Object.freeze([
  {
    id: 'flat',
    name: 'Квартира',
    // Гараж куплено — усе, що вчить петлю, вже позаду.
    outgrown: (game) => roomIsOpen(game, 'garage') || atFactory(game),
    steps: [
      {
        id: 'first_order', kind: 'do', zoneKind: 'desk',
        why: 'Комплект приїде на вулицю — його треба буде забрати',
        have: (game) => game.ordersPlaced ?? 0,
        done: (game) => (game.ordersPlaced ?? 0) >= 1,
        resolve: (game) => {
          const costs = kitsForLocation(game)
            .map(id => KIT_TYPES[id]?.cost ?? 0).filter(c => c > 0)
          return {
            title: 'Замов перший комплект',
            need:  1,
            // Тут смужка — не гроші, тому ціну кажемо текстом.
            hint:  costs.length ? `Ноутбук на кухні · від $${Math.min(...costs)}` : null,
          }
        },
      },
      {
        id: 'first_assembly', kind: 'do', zoneKind: 'bench',
        why: 'Стань біля верстака — там і паяєш',
        have: (game) => stats(game).assembled ?? 0,
        done: (game) => (stats(game).assembled ?? 0) >= 1,
        resolve: () => ({ title: 'Донеси коробку й запаяй дрон', need: 1 }),
      },
      {
        id: 'first_sale', kind: 'do', zoneKind: 'mailbox',
        why: 'Скринька на вулиці — там дрон стає грошима',
        have: (game) => stats(game).sold ?? 0,
        done: (game) => (stats(game).sold ?? 0) >= 1,
        resolve: () => ({ title: 'Продай перший дрон', need: 1 }),
      },
      sellCount('sell_three', 3, 'Продай 3 дрони',
        'Згорілий не рахується — стеж за перегрівом'),
      buyUpgrade('iron_1', 'soldering', 1, 'Зона пайки ширша, перегрів рідший'),
      sellCount('sell_racing', 1, 'Продай гоночний дрон',
        'Дорожчий комплект — більша маржа', 'racing_drone'),
      buyUpgrade('flux_1', 'consumables', 1, 'Перегрів −30%'),
      buyUpgrade('iron_2', 'soldering', 2, 'Верстак паяє сам, поки ти біля нього'),
      sellCount('sell_cine', 1, 'Продай кінематографічний дрон',
        'Найдорожче, що вміє квартира', 'cinematic_drone'),
      {
        id: 'room_garage', kind: 'buy', zoneKind: 'rack',
        why: '+верстак, +далекобійний дрон, +3 вакансії',
        moot: (game) => !nextRoomId(game),
        done: (game) => roomIsOpen(game, 'garage'),
        resolve(game) {
          const roomId = nextRoomId(game)
          if (!roomId) return null
          const room = roomDef(roomId)
          return {
            title: `Прибудуй: ${room.emoji ?? ''} ${room.name}`.trim(),
            need:  room.cost,
            hint:  hintFrom(canUnlockRoom(game, roomId).reasons),
          }
        },
      },
    ],
  },

  {
    id: 'garage',
    name: 'Гараж',
    outgrown: (game) => atFactory(game),
    steps: [
      hireRole('courier', 'Більше не носиш коробки з вулиці сам'),
      sellCount('sell_longrange', 1, 'Продай далекобійний дрон',
        'Це вміє тільки гараж', 'longrange_drone'),
      buyUpgrade('bench_2', 'benches', 1, 'Дві збірки паралельно — кур\'єру є що робити'),
      hireRole('tech', 'Верстак працює, поки тебе там немає'),
      sellCount('sell_ten', 10, 'Продай 10 дронів',
        'Двома верстаками це вдвічі швидше'),
      buyUpgrade('storage_1', 'storage', 1, 'Дві доставки в дорозі одночасно'),
      buyUpgrade('logistics_1', 'logistics', 1, 'Комплекти приїжджають на 30% швидше'),
      {
        id: 'assemble_fifteen', kind: 'do', zoneKind: 'bench',
        why: 'Стеж, щоб обидва верстаки не стояли',
        have: (game) => stats(game).assembled ?? 0,
        done: (game) => (stats(game).assembled ?? 0) >= 15,
        resolve: () => ({ title: 'Збери 15 дронів', need: 15 }),
      },
      hireRole('seller', 'Готові дрони самі йдуть до скриньки'),
      buyUpgrade('iron_3', 'soldering', 3, 'Якість 80–92% — і твої техніки теж кращі'),
      {
        id: 'quality_85', kind: 'do', zoneKind: 'bench',
        why: 'Станція дає таку якість сама — треба лише не забирати комплект зарано',
        have: (game) => Math.round((stats(game).bestQuality ?? 0) * 100),
        done: (game) => (stats(game).bestQuality ?? 0) >= 0.85,
        resolve: () => ({ title: 'Збери дрон якістю 85%', need: 85 }),
      },
      buyUpgrade('flux_2', 'consumables', 2, 'Умова переїзду на фабрику'),
      {
        id: 'move_factory', kind: 'buy', zoneKind: 'rack',
        why: 'Цехи, конвеєр, менеджер — і штат, який рахується цехами',
        moot: (game) => !LOCATION_ORDER[LOCATION_ORDER.indexOf(game.locationId ?? 'apartment') + 1],
        done: (game) => atFactory(game),
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
    ],
  },

  {
    id: 'factory',
    name: 'Фабрика',
    // Останній акт: рости далі нема куди, тому «переросли» не буває.
    outgrown: () => false,
    steps: [
      hireRole('manager', 'Замовляє сам — петля крутиться без тебе'),
      {
        id: 'promote_any', kind: 'do', zoneKind: 'promote',
        why: 'Підійди до працівника і постій поруч — панель відкриється сама',
        moot: (game) => !(game.workers ?? []).length,
        have: (game) => (game.workers ?? []).filter(w => (w.level ?? 0) >= 1).length,
        done: (game) => (game.workers ?? []).some(w => (w.level ?? 0) >= 1),
        resolve: () => ({ title: 'Підвищ будь-кого до 2 рівня', need: 1 }),
      },
      {
        id: 'hall_2', kind: 'buy', zoneKind: 'rack',
        why: 'Конвеєр носить коробки замість кур\'єрів',
        moot: (game) => !nextHallId(game),
        done: (game) => !nextHallId(game) || openHallCount(game) > 1,
        resolve(game) {
          const hallId = nextHallId(game)
          if (!hallId) return null
          const hall = hallDef(hallId)
          return {
            title: `Відкрий: ${hall.name}`,
            need:  hall.cost,
            hint:  hintFrom(canUnlockHall(game, hallId).reasons),
          }
        },
      },
      {
        id: 'endgame_rate', kind: 'do', zoneKind: 'bench',
        why: 'Дивись на $/сек угорі екрана',
        // Єдиний крок, чий прогрес не в стані гри, а в журналі продажів —
        // тому його `have` приходить збоку (див. activeQuest).
        rateTarget: ENDGAME_RATE_TARGET,
        have: (game) => game.stats?.bestRate ?? 0,
        done: (game) => (game.stats?.bestRate ?? 0) >= ENDGAME_RATE_TARGET,
        resolve: () => ({ title: `Вийди на $${ENDGAME_RATE_TARGET}/сек`, need: ENDGAME_RATE_TARGET }),
      },
    ],
  },
])

// Скільки цехів відкрито — без імпорту factory.js вглиб.
function openHallCount(game) {
  return (game.unlockedHalls ?? []).length
}

// Ланцюг як плоский список — у тому порядку, у якому його проходять.
export const QUEST_CHAIN = Object.freeze(
  QUEST_ACTS.flatMap(act => act.steps.map(step => ({ ...step, actId: act.id })))
)

const ACT_OF = new Map(QUEST_ACTS.map(act => [act.id, act]))

// Крок пройдено або він тут не має сенсу — обидва означають «іди далі».
function passed(step, game) {
  if (ACT_OF.get(step.actId)?.outgrown(game)) return true
  if (step.moot?.(game)) return true
  return step.done(game)
}

// Індекс активного кроку — скільком кроків ланцюга гравець уже відповідає.
// Потрібен не лише картці: на нього спирається прогресивне розкриття панелі
// поліпшень (Р5), щоб «ще не введене» ховалось без жодного нового поля в сейві.
export function questIndex(game) {
  const i = QUEST_CHAIN.findIndex(step => !passed(step, game))
  return i < 0 ? QUEST_CHAIN.length : i
}

// Чи ланцюг уже проходив цей крок (за id). Саме «проходив», а не «виконав»:
// пропущений як безглуздий крок теж відкриває те, що йшло за ним.
export function questReached(game, stepId) {
  const at = QUEST_CHAIN.findIndex(s => s.id === stepId)
  return at < 0 ? true : questIndex(game) >= at
}

// Чи гравцеві вже показували цей трек поліпшень (Р5).
//
// Панель поліпшень до Стадії 9 показувала всі п'ять треків одразу, коли
// доступний був рівно один. Тепер список росте по одному рядку — а ланцюг і є
// той порядок, у якому треки вводяться, тож нового поля в сейві не з'являється.
//
// Три причини бути видимим, і третя — найважливіша: НАСТУПНИЙ трек, який
// ланцюг збирається попросити, видно завжди. Без неї шафа перші кілька кроків
// стояла б порожня, а панель без жодного рядка читається як поламана.
export function trackIntroduced(game, trackId) {
  const at = QUEST_CHAIN.findIndex(s => s.trackId === trackId)
  if (at < 0) return true                     // трек, якого ланцюг не згадує
  if (questIndex(game) >= at) return true
  return nextBuyTrack(game) === trackId
}

// Трек найближчої покупки в ланцюгу — те, що гравця попросять купити наступним.
//
// «Наступний» тут означає «наступний, який тут узагалі можна купити»: кроки, що
// вже пройдені або безглузді в цій локації, пропускаються. Без цього правило
// давало порожню шафу — наприклад, у квартирі з паяльником у стелі воно вказувало
// на паяльник, того в списку вже нема, а витратники ще «не введені». Це не
// теоретична дірка: тест «поки є що купувати — видно щонайменше один трек» ловить
// саме її.
function nextBuyTrack(game) {
  const from = questIndex(game)
  for (let i = from; i < QUEST_CHAIN.length; i++) {
    const step = QUEST_CHAIN[i]
    if (!step.trackId) continue
    if (step.moot?.(game) || step.done(game)) continue
    return step.trackId
  }
  return null
}

// Активний крок у формі, готовій для UI. `have` обрізане по `need`: смужка, яка
// переповнюється, показує не прогрес, а розмір каси.
export function activeQuest(game) {
  const step = QUEST_CHAIN[questIndex(game)]
  if (!step) return null

  const got = step.resolve(game)
  if (!got) return null

  const need = got.need ?? 0
  const have = step.kind === 'buy' ? game.money : step.have(game)

  return {
    id:       step.id,
    actId:    step.actId,
    kind:     step.kind,
    zoneKind: step.zoneKind,
    title:    got.title,
    why:      step.why ?? null,
    hint:     got.hint ?? null,
    need,
    have:     Math.min(have, need),
    ready:    have >= need,
    // Скільки всього кроків і котрий це — «3 / 24» дає відчуття довжини гри,
    // якого одна картка сама по собі не дає.
    step:     questIndex(game) + 1,
    total:    QUEST_CHAIN.length,
  }
}

// Зона, до якої веде стрілка, — або null, коли вести нікуди.
//
// Крок-покупка додає умову: поки грошей немає, стрілки НЕ буде. Стрілка на
// шафу, де зараз нічого не купиш, — це не підказка, а прогулянка; та сама
// дисциплінa, що й `attention` у зон (див. derive.js). Крок-дія веде завжди:
// туди й треба йти, щоб прогрес зрушив.
//
// Рахує ОДИН крок, а не весь ланцюг: це смикають щокадру.
export function questZoneKind(game) {
  const step = QUEST_CHAIN[questIndex(game)]
  if (!step) return null
  if (step.kind === 'buy') {
    const got = step.resolve(game)
    if (!got || game.money < (got.need ?? 0)) return null
  }
  return step.zoneKind
}
