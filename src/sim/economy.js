// Економіка комплекту — «скільки цей дрон приносить і який із них брати».
//
// Три споживачі, і всі троє мусять відповідати однаково:
//
//   картка комплекту (`ui/shopModal`) — гравцеві, щоб він міг обрати;
//   живий менеджер (`sim/derive`)     — коли замовляє за ноутбуком;
//   офлайн-розрахунок (`sim/offline`) — коли рахує, що цех робив уночі.
//
// До Стадії 11 цих відповідей було дві. Картка порівнювала $/сек, а менеджер
// сортував каталог по СОБІВАРТОСТІ й брав найдорожчий доступний — тобто гравець
// бачив, що міні-дрон Mk III вигідніший за гоночний Mk I, а найнятий ним
// менеджер усе одно тягнув гоночний. Два різні критерії «що вигідно» в одній
// грі — це баг за визначенням (Стадія 11 / П5), і жили вони в різних файлах
// саме тому, що спільного місця для них не було. Тепер є.

import {
  KIT_TYPES, calcPrice, stationsOf, workersInRole,
  kitCost, kitBasePrice, kitDeliveryMs, kitSolderPointCount,
} from '../state/gameState.js'
import { levelData, salePriceMult, deliveryMult } from '../state/upgrades.js'
import { roleLevelData } from '../defs/roles.js'
import { kitsForLocation } from '../state/locations.js'
import {
  MANUAL_POINT_MS, MANUAL_POINT_QUALITY, MANAGER_RESERVE,
} from '../state/config.js'

// Скільки мілісекунд іде на одну точку пайки, якщо за верстаком нікого немає.
// Null — ніщо не рухалось би само.
export function pointMsFor(game) {
  const solder = levelData('soldering', game.upgrades.solderingLevel)
  const techs  = workersInRole(game, 'tech')

  const rates = []
  if (solder.qualityMin !== undefined) rates.push({ ms: solder.pointDelayMs, q: (solder.qualityMin + solder.qualityMax) / 2 })
  if (techs.length) {
    const t = roleLevelData('tech', Math.max(...techs.map(w => w.level)))
    rates.push({ ms: t.pointMs, q: t.quality })
  }
  if (!rates.length) return null
  // Best available on each axis, same rule the live station uses.
  return { ms: Math.min(...rates.map(r => r.ms)), q: Math.max(...rates.map(r => r.q)) }
}

// Скільки триває один цикл цього комплекту.
//
// Вузьке місце — найповільніша з двох речей: доставка й пайка. Вони йдуть
// паралельно (поки один комплект паяється, наступний їде), тому max, а не сума.
export function kitCycleMs(game, kitId, rate) {
  const benches  = Math.max(1, stationsOf(game).length)
  const assembly = kitSolderPointCount(game, kitId) * rate.ms
  const delivery = kitDeliveryMs(game, kitId) * deliveryMult(game)
  return Math.max(assembly, delivery) / benches
}

// ── Скільки цей комплект приносить за секунду (Стадія 10 / B4) ──
//
// Оцінка, а не факт: скільки чистими дасть один верстак, якщо крутити САМЕ цей
// комплект без простоїв. Потрібна, щоб рішення «Mk III міні чи Mk I
// кінематографічного» взагалі можна було прийняти: типи різняться кількістю
// кроків збірки (4 проти 8), і сама ціна на це питання не відповідає.
//
// ЧИСТИМИ, а не виторгом — на відміну від `$/сек` у HUD. Виторг, який
// ігнорує ціну комплекту, радив би дорогі кіти з тонкою маржею. З приладом це
// число все одно не збігається (той міряє фактично зароблене за хвилину,
// разом із ходьбою й простоями), тому воно й показується з «≈».
export function kitRatePerSec(game, kitId) {
  const rate = pointMsFor(game)
    ?? { ms: MANUAL_POINT_MS, q: MANUAL_POINT_QUALITY }
  const cycleMs = kitCycleMs(game, kitId, rate)
  if (!(cycleMs > 0)) return 0
  const revenue = calcPrice(kitBasePrice(game, kitId), rate.q, salePriceMult(game))
  return (revenue - kitCost(game, kitId)) / (cycleMs / 1000)
}

// ── Вибір комплекту для закупівлі (Стадія 11 / B) ─────────
//
// Два різні обмеження, і плутати їх не можна:
//
//   `tier` (рівень менеджера) каже, ЯКІ комплекти він узагалі веде — це ранг
//   у каталозі, відсортованому по собівартості. Дорогі кіти лишаються тим, до
//   чого людину треба доростити.
//
//   $/сек каже, ЯКИЙ із дозволених брати сьогодні. Саме тут менеджер і
//   збігається з гравцем: обидва дивляться на одне число.
//
// Резерв каси (`MANAGER_RESERVE`) стоїть у фільтрі, а не в сортуванні:
// менеджер, який витрачає до нуля, тихо позбавляє гравця можливості купити
// хоч щось у шафі.
export function kitsByValue(game, tier, money = game.money) {
  return kitsForLocation(game)
    .filter(id => KIT_TYPES[id]?.cost > 0)
    .sort((a, b) => kitCost(game, a) - kitCost(game, b))
    .filter((id, i) => i <= tier && money >= kitCost(game, id) * MANAGER_RESERVE)
    .sort((a, b) => kitRatePerSec(game, b) - kitRatePerSec(game, a))
}

// Найвигідніший із дозволених, або null, коли брати нічого.
//
// Збитковий комплект усе одно купується, якщо він єдиний доступний: зупинити
// петлю — гірше, ніж возити тонку маржу, а на випадок справжнього глухого кута
// в грі є аварійна партія (`rescueKitAvailable`).
export function bestKitByValue(game, tier, money = game.money) {
  const id = kitsByValue(game, tier, money)[0]
  return id ? KIT_TYPES[id] : null
}
