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
// Куди вести стрілку — теж властивість кроку, і тут два випадки:
//
//   zoneKind: '<kind>'  — крок має СВОЄ місце: шафа, дошка найму, ноутбук.
//                         Саме kind, а не координати: крок не мусить знати, де
//                         в цій локації стоїть шафа.
//   viaLoop: true       — крок робиться грою петлі («продай 3 дрони»), і місця
//                         в нього немає. Стрілку веде петля.
//
// Друге з'явилось після тесту: у таких кроків раніше стояв zoneKind кінцевої
// зони ('mailbox' у «продай 3 дрони», 'bench' у «запаяй дрон»), і стрілка через
// це показувала на скриньку, коли час замовляти комплект, або на верстак, поки
// коробка ще їде. Кінець петлі — не наступний крок.

import {
  KIT_TYPES, nextHireCost, workersInRole, nextRoomId, canUnlockRoom,
  nextHallId, canUnlockHall, kitCost, kitMark, markUnlocked, nextMarkCost,
  canUpgradeMark, assembledOfKit,
} from '../state/gameState.js'
import { UPGRADE_TRACKS, levelData, nextCost } from '../state/upgrades.js'
import {
  kitsForLocation, capFor, roleCapHere, canMoveToLocation,
  LOCATION_ORDER, LOCATIONS, roomIsOpen,
} from '../state/locations.js'
import { roomDef } from '../defs/layouts/rooms.js'
import { hallDef } from '../defs/layouts/factory.js'
import { roleDef } from '../defs/roles.js'
import { ENDGAME_RATE_TARGET, MK_BUILD_REQ } from '../state/config.js'

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
    const from = level(game, trackId)
    const next = levelData(trackId, from + 1)
    if (!next) return null
    return { title: `Купи: ${next.name}`, need: nextCost(trackId, from) }
  },
})

// Підняти комплект до Mk `target` (Стадія 10 / B).
//
// ПОРЯДОК У ЛАНЦЮГУ НЕСУЧИЙ: крок «купи Mk» мусить стояти перед кроком «продай
// цей тип». Гоночний відкриває mini Mk II, і якби крок продажу стояв раніше,
// він був би `moot` (типу немає в каталозі), ланцюг би його проскочив — а
// потім, коли тип відкриється, поїхав би назад. Монотонність (П2) на цьому й
// тримається; тест «ланцюг ніколи не їде назад» ловить порушення.
const buyMark = (id, kitId, target, why) => ({
  id, kind: 'buy', zoneKind: 'desk', why, kitId, target,
  // Комплекту тут може не бути взагалі (далекобійний у квартирі) — тоді крок
  // безглуздий. Але для типів, які САМ цей крок і відкриває, перевіряти
  // каталог не можна: він і має бути ще зачиненим.
  moot: (game) => !markUnlocked(game, kitId)
    ? false
    : !kitsForLocation(game).includes(kitId) && kitMark(game, kitId) < target,
  done: (game) => kitMark(game, kitId) >= target,
  // Грошей мало для стрілки (Стадія 11 / A2): вести до ноутбука, де кнопка
  // все одно вимкнена нормою збірок, — це прогулянка, а не підказка.
  buyable: (game) => canUpgradeMark(game, kitId).can,
  resolve(game) {
    const kit = KIT_TYPES[kitId]
    const cost = nextMarkCost(game, kitId)
    if (cost === null) return null
    return {
      title: `Прокачай ${kit.emoji} ${kit.name} до Mk ${kitMark(game, kitId) + 2}`,
      need:  cost,
      // Другий замок Mk (Стадія 11 / A2) мусить бути на картці: інакше крок
      // показує повну смужку грошей і мовчить про те, чому нічого не купується.
      hint:  hintFrom(canUpgradeMark(game, kitId).reasons)
        ?? 'Ноутбук на кухні · вкладка комплекту',
    }
  },
})

// Найняти першого працівника ролі. Штат «не всіх» — це вже правило локації
// (roleCapHere), тому крок сам себе вимикає там, де вакансій нема.
const hireRole = (roleId, why) => ({
  id: `hire_${roleId}`, kind: 'buy', zoneKind: 'jobboard', why, roleId,
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
  id, kind: 'do', viaLoop: true, why,
  moot: (game) => kitId ? !kitsForLocation(game).includes(kitId) : false,
  have: (game) => kitId ? (stats(game).soldByKit?.[kitId] ?? 0) : (stats(game).sold ?? 0),
  done(game) { return this.have(game) >= need },
  resolve: () => ({ title, need }),
})

// Зібрати N дронів КОНКРЕТНОГО типу (Стадія 11 / C1).
//
// Не те саме, що продати: продаж — це кур'єр і скринька, збірка — верстак.
// Саме тому цей крок і з'явився — норма Mk (Стадія 11 / A2) рахується по
// збірках, і крок «збери 3 такі» перед кроком «прокачай його до Mk II» тепер
// не сюжет, а буквально умова наступного кроку.
//
// ПОРЯДОК НЕСУЧИЙ так само, як у `buyMark`: крок збірки мусить стояти
// безпосередньо перед своїм Mk, інакше ланцюг просить купити те, що ще
// заблоковане нормою, і картка мовчки показує повну смужку грошей.
const buildCount = (id, kitId, need, title, why) => ({
  id, kind: 'do', viaLoop: true, why,
  moot: (game) => !kitsForLocation(game).includes(kitId),
  have: (game) => assembledOfKit(game, kitId),
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
            .filter(id => (KIT_TYPES[id]?.cost ?? 0) > 0)
            .map(id => kitCost(game, id))
          return {
            title: 'Замов перший комплект',
            need:  1,
            // Тут смужка — не гроші, тому ціну кажемо текстом.
            hint:  costs.length ? `Ноутбук на кухні · від $${Math.round(Math.min(...costs))}` : null,
          }
        },
      },
      {
        id: 'first_assembly', kind: 'do', viaLoop: true,
        why: 'Стань біля верстака — там і паяєш',
        have: (game) => stats(game).assembled ?? 0,
        done: (game) => (stats(game).assembled ?? 0) >= 1,
        resolve: () => ({ title: 'Донеси коробку й запаяй дрон', need: 1 }),
      },
      {
        id: 'first_sale', kind: 'do', viaLoop: true,
        why: 'Скринька на вулиці — там дрон стає грошима',
        have: (game) => stats(game).sold ?? 0,
        done: (game) => (stats(game).sold ?? 0) >= 1,
        resolve: () => ({ title: 'Продай перший дрон', need: 1 }),
      },
      // Саме міні-дрони, хоч інших типів тут ще й немає: цей крок — доказ, що
      // гравець уже збирав цей тип, і на нього спирається наступний за ним
      // крок Mk (норма збірок, Стадія 11 / A2). Загальний лічильник такого
      // доказу не дає — з нього не видно, ЯКИЙ дрон продавали.
      sellCount('sell_three', 3, 'Продай 3 дрони',
        'Згорілий не рахується — стеж за перегрівом', 'mini_drone'),
      buyUpgrade('iron_1', 'soldering', 1, 'Зона пайки ширша, перегрів рідший'),
      buyMark('mk_mini_1', 'mini_drone', 1,
        'Той самий дрон, дорожчий — і продається дорожче'),
      // Норма Mk (Стадія 11 / A2) стоїть у ланцюгу окремим кроком, а не
      // з'являється підказкою на картці: «зберіть ще 3» — це те, що гра
      // просить зробити, отже це квест.
      buildCount('build_mini_six', 'mini_drone', MK_BUILD_REQ[1],
        `Збери ${MK_BUILD_REQ[1]} міні-дронів`, 'Mk II міні-дрона відкриє гоночний'),
      buyMark('mk_mini_2', 'mini_drone', 2,
        'Mk II відкриває гоночний дрон'),
      sellCount('sell_racing', 1, 'Продай гоночний дрон',
        'Дорожчий комплект — більша маржа', 'racing_drone'),
      // Перший нескінченний трек (Стадія 10 / A). Вводиться тут навмисно: він
      // найзрозуміліший із чотирьох («ціна продажу +2%») і приходить одразу
      // після кроку, де гравець уперше побачив, що дорожчий дрон дає більше.
      buyUpgrade('reputation_1', 'reputation', 1,
        'Перший трек без стелі — його можна качати нескінченно'),
      buyUpgrade('flux_1', 'consumables', 1, 'Перегрів −30%'),
      buildCount('build_racing_six', 'racing_drone', MK_BUILD_REQ[1],
        `Збери ${MK_BUILD_REQ[1]} гоночних`,
        'Норма на Mk II — і рука на ньому набивається'),
      buyMark('mk_racing_2', 'racing_drone', 2,
        'Mk II гоночного відкриває кінематографічний'),
      sellCount('sell_cine', 1, 'Продай кінематографічний дрон',
        'Найдорожче, що вміє квартира', 'cinematic_drone'),
      buyUpgrade('iron_2', 'soldering', 2, 'Верстак паяє сам, поки ти біля нього'),
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
      // Далекобійний — єдиний комплект, який уміє тільки гараж, тож і качається
      // він тут. Заразом це другий найм, розведений роботою: два наймання
      // підряд читаються як платіжна відомість, а не як гра.
      buildCount('build_longrange_three', 'longrange_drone', MK_BUILD_REQ[0],
        `Збери ${MK_BUILD_REQ[0]} далекобійні`, 'Норма на Mk II далекобійного'),
      buyMark('mk_longrange_1', 'longrange_drone', 1,
        'Найдорожчий комплект гаража — і найдорожчий продаж'),
      sellCount('sell_ten', 10, 'Продай 10 дронів',
        'Двома верстаками це вдвічі швидше'),
      buyUpgrade('bulk_1', 'bulk', 1, 'Комплекти дешевшають — маржа росте з другого боку'),
      buyUpgrade('storage_1', 'storage', 1, 'Дві доставки в дорозі одночасно'),
      buyUpgrade('logistics_1', 'logistics', 1, 'Комплекти приїжджають на 30% швидше'),
      {
        id: 'assemble_fifteen', kind: 'do', viaLoop: true,
        why: 'Стеж, щоб обидва верстаки не стояли',
        have: (game) => stats(game).assembled ?? 0,
        done: (game) => (stats(game).assembled ?? 0) >= 15,
        resolve: () => ({ title: 'Збери 15 дронів', need: 15 }),
      },
      hireRole('seller', 'Готові дрони самі йдуть до скриньки'),
      buyUpgrade('iron_3', 'soldering', 3, 'Якість 80–92% — і твої техніки теж кращі'),
      {
        id: 'quality_85', kind: 'do', viaLoop: true,
        why: 'Станція дає таку якість сама — треба лише не забирати комплект зарано',
        have: (game) => Math.round((stats(game).bestQuality ?? 0) * 100),
        done: (game) => (stats(game).bestQuality ?? 0) >= 0.85,
        resolve: () => ({ title: 'Збери дрон якістю 85%', need: 85 }),
      },
      buyUpgrade('tooling_1', 'tooling', 1, 'Якість росте й у твоїх руках, і в техніка'),
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
        // Панель підвищення — теж те, що ланцюг вводить (Стадія 11 / C4):
        // рівні працівників не мають з'являтись у грі, де ще нікого не найняли.
        opens: 'panel:promote',
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
      // Два останні рівні просторових треків доступні ТІЛЬКИ на фабриці
      // (стелі `storage`/`logistics` тут 2, у гаражі — 1). Доти ланцюг про них
      // не згадував узагалі, тобто гравець дізнавався про них, лише якщо сам
      // відкривав шафу й гортав: єдине джерело нового мовчало про те, що
      // з'явилось разом із локацією.
      buyUpgrade('storage_2', 'storage', 2, 'Три доставки в дорозі одночасно'),
      buyUpgrade('logistics_2', 'logistics', 2, 'Доставка на 50% швидше'),
      buildCount('build_cine_three', 'cinematic_drone', MK_BUILD_REQ[0],
        `Збери ${MK_BUILD_REQ[0]} кінематографічні`,
        'Найдорожчий тип у грі — качати його є сенс'),
      buyMark('mk_cine_1', 'cinematic_drone', 1,
        'Стеля Mk на фабриці найвища — тут дрон доводять до кінця'),
      buyUpgrade('courier_1', 'courier', 1,
        'Останній із чотирьох треків без стелі — далі росте тільки темп'),
      {
        id: 'endgame_rate', kind: 'do', viaLoop: true,
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

// Що цей крок ВВОДИТЬ у гру (Стадія 11 / C4).
//
// Не косметика: на цьому полі стоїть прогресивне розкриття панелей — трек у
// шафі, роль на дошці, рядок Mk на картці комплекту з'являються тому, що
// ланцюг до них дійшов, а не тому, що кожна панель має власне правило.
//
// Рахується при складанні ланцюга, а не пишеться руками на кожному кроці, і це
// принципово: «вводить» означає ПЕРША ЗГАДКА, тож двоє дверей до однієї речі
// неможливі за побудовою. Руками довелося б стежити, що `iron_2` не
// «відкриває» паяльник удруге, а `mk_racing_2` (у ланцюгу перший крок про
// гоночний) — навпаки, відкриває.
const featureOf = (step) =>
  step.opens
  ?? (step.trackId ? `track:${step.trackId}`
    : step.kitId   ? `mk:${step.kitId}`
    : step.roleId  ? `role:${step.roleId}`
    : null)

// Ланцюг як плоский список — у тому порядку, у якому його проходять.
export const QUEST_CHAIN = Object.freeze((() => {
  const seen = new Set()
  return QUEST_ACTS.flatMap(act => act.steps.map(step => {
    const feature = featureOf(step)
    const opens   = feature && !seen.has(feature) ? feature : null
    if (opens) seen.add(opens)
    return { ...step, actId: act.id, opens }
  }))
})())

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

// Чи активний крок робиться грою петлі. Тоді стрілка петлі мусить працювати
// НАВІТЬ після того, як підказки замовкли: гра просить крутити петлю, отже
// показувати наступний фізичний крок — це рівно те, що зараз доречно.
export function questIsLoop(game) {
  return QUEST_CHAIN[questIndex(game)]?.viaLoop === true
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
  // Крок, який робиться петлею, свого місця не має — стрілку веде петля.
  if (step.viaLoop) return null
  if (step.kind === 'buy') {
    const got = step.resolve(game)
    if (!got || game.money < (got.need ?? 0)) return null
    // Гроші — не завжди єдина умова покупки (Стадія 11 / A2).
    if (step.buyable && !step.buyable(game)) return null
  }
  return step.zoneKind
}
