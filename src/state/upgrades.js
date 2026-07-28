// Upgrade registry — data-driven. Add a new upgrade track by adding an entry here;
// buyUpgrade(), the upgrade UI, and main.js all read from this registry, so no logic
// changes are needed to introduce one.
//
// Convention: tunable balance numbers live in config.js (the registry composes them),
// per-level display strings are content and live here.
import {
  SOLDER_GREEN_HALF, OVERHEAT_CHANCE,
  BETTER_IRON_GREEN_HALF, BETTER_IRON_OVERHEAT_CHANCE,
  SEMIAUTO_GREEN_HALF, SEMIAUTO_OVERHEAT_CHANCE,
  SEMIAUTO_QUALITY_MIN, SEMIAUTO_QUALITY_MAX, SEMIAUTO_POINT_DELAY_MS,
  SEMIAUTO_MISS_CHANCE,
  SOLDER_STATION_GREEN_HALF, SOLDER_STATION_OVERHEAT_CHANCE,
  SOLDER_STATION_QUALITY_MIN, SOLDER_STATION_QUALITY_MAX,
  SOLDER_STATION_POINT_DELAY_MS, SOLDER_STATION_MISS_CHANCE,
  SOLDERING_UPGRADE_COSTS,
  CONSUMABLES_UPGRADE_COSTS, FLUX_OVERHEAT_MULT, FLUX_QUALITY_BONUS,
  STORAGE_UPGRADE_COSTS, STORAGE_SLOTS_BY_LEVEL,
  BENCH_UPGRADE_COSTS,
  LOGISTICS_UPGRADE_COSTS, LOGISTICS_DELIVERY_MULT,
  endlessCost,
  REPUTATION_PRICE_STEP, BULK_COST_STEP, TOOLING_QUALITY_STEP, COURIER_SPEED_STEP,
  BULK_COST_FLOOR, COURIER_SPEED_FLOOR,
} from './config.js'

// C6 removed SOLDER_MODE. A level no longer decides *how* a bench is operated —
// presence does. What a level supplies is:
//   greenHalf / overheatChance — how forgiving the player's own mini-game is
//   qualityMin / qualityMax / pointDelayMs — an unattended rate, if it has one
// Levels 0–1 have no unattended rate at all, which is what makes hiring a
// technician (or standing there yourself) the only way to finish a drone early.

// The `worker` track lived here until C5. Automation is no longer an upgrade
// level — it is people you hire (defs/roles.js), each walking the shop floor.

const pct = (step) => `${(step * 100).toFixed(step < 0.01 ? 1 : 0)}%`

// Конструктор нескінченного треку (Стадія 10 / A1).
//
// Віддає `costs` і `levels` ФУНКЦІЯМИ — на цьому й тримається «стелі немає»:
// масив довелося б десь обірвати, а обрив і є те, чого треку бракує.
//
// `effect` один на всі рівні навмисно. Спокуса — писати «зараз +34%», але це
// той самий рядок, що й на кнопці ціни, тільки іншими словами; а сказати
// «скільки в мене зараз» має прилад у HUD, і саме він мусить лишатись єдиним
// місцем, куди гравець дивиться, щоб побачити свій темп (П4).
function endlessTrack(id, { name, stateKey, levelName, effect }) {
  return {
    id, name, stateKey,
    endless: true,
    costs:  (level) => endlessCost(id, level),
    levels: (level) => ({ name: levelName(level), effect }),
  }
}

export const UPGRADE_TRACKS = Object.freeze({
  soldering: {
    id:       'soldering',
    name:     'Паяльник',
    stateKey: 'solderingLevel',         // field in state.upgrades holding this track's level
    costs:    SOLDERING_UPGRADE_COSTS,  // costs[i] = price to go from level i → i+1
    levels: [
      { name: 'Ручний паяльник', effect: 'Паяєте руками, стоячи біля верстака',
        greenHalf: SOLDER_GREEN_HALF, overheatChance: OVERHEAT_CHANCE },
      { name: 'Кращий паяльник', effect: 'Ширша зона +83%, перегрів −75%',
        greenHalf: BETTER_IRON_GREEN_HALF, overheatChance: BETTER_IRON_OVERHEAT_CHANCE },
      { name: 'Напівавтомат', effect: 'Верстак паяє сам 60–75%; руками — точніше',
        greenHalf: SEMIAUTO_GREEN_HALF, overheatChance: SEMIAUTO_OVERHEAT_CHANCE,
        qualityMin: SEMIAUTO_QUALITY_MIN, qualityMax: SEMIAUTO_QUALITY_MAX,
        pointDelayMs: SEMIAUTO_POINT_DELAY_MS, missChance: SEMIAUTO_MISS_CHANCE },
      // The top of the track keeps the automation and improves it (Stage 9 / Р3).
      // It used to drop qualityMin, which sent the whole track backwards: the
      // most expensive iron in the game handed the mini-game back. See the
      // comment on SOLDER_STATION_* in config.js for why that no longer
      // competes with hiring a technician.
      { name: 'Паяльна станція', effect: 'Верстак паяє сам 80–92%, перегріву немає',
        greenHalf: SOLDER_STATION_GREEN_HALF, overheatChance: SOLDER_STATION_OVERHEAT_CHANCE,
        qualityMin: SOLDER_STATION_QUALITY_MIN, qualityMax: SOLDER_STATION_QUALITY_MAX,
        pointDelayMs: SOLDER_STATION_POINT_DELAY_MS, missChance: SOLDER_STATION_MISS_CHANCE },
    ],
  },
  consumables: {
    id:       'consumables',
    name:     'Флюс і припій',
    stateKey: 'consumablesLevel',
    costs:    CONSUMABLES_UPGRADE_COSTS,
    levels: [
      { name: 'Дешевий припій',  effect: 'Базові витратні матеріали',
        overheatMult: FLUX_OVERHEAT_MULT[0], qualityBonus: FLUX_QUALITY_BONUS[0] },
      { name: 'Хороший флюс',   effect: `Перегрів −${Math.round((1 - FLUX_OVERHEAT_MULT[1]) * 100)}%`,
        overheatMult: FLUX_OVERHEAT_MULT[1], qualityBonus: FLUX_QUALITY_BONUS[1] },
      { name: 'Срібний припій', effect: `Перегрів −${Math.round((1 - FLUX_OVERHEAT_MULT[2]) * 100)}%, якість +${Math.round(FLUX_QUALITY_BONUS[2] * 100)}%`,
        overheatMult: FLUX_OVERHEAT_MULT[2], qualityBonus: FLUX_QUALITY_BONUS[2] },
    ],
  },

  storage: {
    id:       'storage',
    name:     'Склад',
    stateKey: 'storageLevel',
    costs:    STORAGE_UPGRADE_COSTS,
    levels: [
      { name: 'Без складу',   effect: '1 доставка за раз',        extraSlots: STORAGE_SLOTS_BY_LEVEL[0] },
      { name: 'Мале сховище', effect: '2 паралельних доставки',   extraSlots: STORAGE_SLOTS_BY_LEVEL[1] },
      { name: 'Повний склад', effect: '3 паралельних доставки',   extraSlots: STORAGE_SLOTS_BY_LEVEL[2] },
    ],
  },

  benches: {
    id:       'benches',
    name:     'Верстаки',
    stateKey: 'benchLevel',
    costs:    BENCH_UPGRADE_COSTS,
    levels: [
      { name: 'Один верстак',  effect: 'Одна збірка за раз',        count: 1 },
      { name: 'Два верстаки',  effect: 'Дві паралельні збірки',     count: 2 },
      { name: 'Три верстаки',  effect: 'Три паралельні збірки',     count: 3 },
    ],
  },

  logistics: {
    id:       'logistics',
    name:     'Логістика',
    stateKey: 'logisticsLevel',
    costs:    LOGISTICS_UPGRADE_COSTS,
    levels: [
      { name: 'Звичайна доставка', effect: 'Стандартний час',         deliveryMult: LOGISTICS_DELIVERY_MULT[0] },
      { name: 'Пришвидшена',       effect: 'Доставка на 30% швидше', deliveryMult: LOGISTICS_DELIVERY_MULT[1] },
      { name: 'Express',           effect: 'Доставка на 50% швидше', deliveryMult: LOGISTICS_DELIVERY_MULT[2] },
    ],
  },

  // ── Нескінченні числові треки (Стадія 10 / A) ───────────
  //
  // `costs` і `levels` тут ФУНКЦІЇ, а не масиви — див. коментар до
  // trackMaxLevel нижче. Кожен із них — множник, який просто росте: жоден не
  // відкриває механіку і жоден не знімає рутину (П5 плану). Це робота
  // просторових треків і квестів, і два джерела «що відкрилось» неминуче
  // почали б сперечатись, хто саме дав гравцеві автоматику.
  reputation: endlessTrack('reputation', {
    name: 'Репутація', stateKey: 'reputationLevel',
    levelName: (n) => n === 0 ? 'Ніхто про вас не чув' : `Репутація ${n}`,
    effect:    `Ціна продажу +${pct(REPUTATION_PRICE_STEP)} за рівень`,
  }),

  bulk: endlessTrack('bulk', {
    name: 'Оптові закупки', stateKey: 'bulkLevel',
    levelName: (n) => n === 0 ? 'Роздріб' : `Опт ${n}`,
    effect:    `Комплекти дешевші на ${pct(BULK_COST_STEP)} за рівень`,
  }),

  tooling: endlessTrack('tooling', {
    name: 'Оснастка', stateKey: 'toolingLevel',
    levelName: (n) => n === 0 ? 'Голий стіл' : `Оснастка ${n}`,
    effect:    `Якість кожної пайки +${pct(TOOLING_QUALITY_STEP)} за рівень`,
  }),

  courier: endlessTrack('courier', {
    name: "Кур'єрська мережа", stateKey: 'courierLevel',
    levelName: (n) => n === 0 ? 'Один перевізник' : `Мережа ${n}`,
    effect:    `Доставка швидша на ${pct(COURIER_SPEED_STEP)} за рівень`,
  }),
})

// ── Registry helpers ──────────────────────────────────────
//
// Дві форми треку (Стадія 10 / A1):
//
//   ПРОСТОРОВИЙ — `costs` масив, `levels` масив. Скінченний, бо впирається у
//   світ: верстак нема куди поставити, слот доставки на вулиці не з'явиться.
//   Такий трек — рідкісна віха, і кожен його рівень написаний руками.
//
//   ЧИСЛОВИЙ — `costs` функція `(level) => number`, `levels` функція
//   `(level) => ({name, effect, …})`. Стелі немає: це множник, який просто
//   росте, і саме він тримає айдл-темп («щось по кишені є завжди», П2).
//
// Усе решта — `buyUpgrade`, панель поліпшень, квести, `purchaseOptions` —
// ходить через ці три функції й різниці не бачить. Це і був сенс реєстру.

const isEndless = (trackId) => typeof UPGRADE_TRACKS[trackId].costs === 'function'

// Highest reachable level for a track — Infinity for a numeric one.
// (For a finite track the levels array has maxLevel+1 entries.)
export function trackMaxLevel(trackId) {
  return isEndless(trackId) ? Infinity : UPGRADE_TRACKS[trackId].costs.length
}

// Design data for a track at a given level (effects, mode, mini-game params).
export function levelData(trackId, level) {
  const { levels } = UPGRADE_TRACKS[trackId]
  return typeof levels === 'function' ? levels(level) : levels[level]
}

// Cost to advance from `level` to the next one, or null if already maxed.
export function nextCost(trackId, level) {
  const { costs } = UPGRADE_TRACKS[trackId]
  if (typeof costs === 'function') return costs(level)
  return level < costs.length ? costs[level] : null
}

// ── Ефекти нескінченних треків (Стадія 10 / A2) ───────────
//
// Усі чотири зведені сюди, а не розкидані по місцях застосування. Причина
// проста: розкидані множники не можна порахувати РАЗОМ. Питання «скільки в
// мене зараз накопичилось на ціні» мусить мати одну відповідь в одному місці,
// інакше баланс нескінченного треку неможливо ні перевірити, ні пояснити.
//
// Живуть у реєстрі, а не в `sim/derive.js`, бо `gameState.js` теж їх потребує
// (orderKit, calcPrice), а derive імпортує gameState — не навпаки.

const lvl = (game, trackId) =>
  game?.upgrades?.[UPGRADE_TRACKS[trackId].stateKey] ?? 0

// Множник ціни продажу. `upgrades.priceMultiplier` — окреме, старіше поле
// (разові бонуси); Репутація множиться поверх нього, а не замість.
export function salePriceMult(game) {
  return (game?.upgrades?.priceMultiplier ?? 1)
    * (1 + REPUTATION_PRICE_STEP * lvl(game, 'reputation'))
}

// Множник собівартості комплекту. Підлога обов'язкова: без неї комплект стає
// безкоштовним, а гроші — нескінченними.
export function kitCostMult(game) {
  return Math.max(BULK_COST_FLOOR, 1 - BULK_COST_STEP * lvl(game, 'bulk'))
}

// Надбавка до якості КОЖНОЇ пайки. Складається з флюсом, не замінює його.
export function toolingQualityBonus(game) {
  return TOOLING_QUALITY_STEP * lvl(game, 'tooling')
}

// Множник часу доставки: трек логістики (віхи) × кур'єрська мережа (плавно).
// Підлога тут не про переповнення, а про петлю: миттєва доставка прибирає
// очікування, заради якого весь трек і існує.
export function deliveryMult(game) {
  const milestone = levelData('logistics', lvl(game, 'logistics'))?.deliveryMult ?? 1
  const network   = Math.max(COURIER_SPEED_FLOOR,
    1 - COURIER_SPEED_STEP * lvl(game, 'courier'))
  return milestone * network
}
