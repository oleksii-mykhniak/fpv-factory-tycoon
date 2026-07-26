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
  SOLDERING_UPGRADE_COSTS,
  CONSUMABLES_UPGRADE_COSTS, FLUX_OVERHEAT_MULT, FLUX_QUALITY_BONUS,
  STORAGE_UPGRADE_COSTS, STORAGE_SLOTS_BY_LEVEL,
  BENCH_UPGRADE_COSTS,
  LOGISTICS_UPGRADE_COSTS, LOGISTICS_DELIVERY_MULT,
} from './config.js'

// C6 removed SOLDER_MODE. A level no longer decides *how* a bench is operated —
// presence does. What a level supplies is:
//   greenHalf / overheatChance — how forgiving the player's own mini-game is
//   qualityMin / qualityMax / pointDelayMs — an unattended rate, if it has one
// Levels 0–1 have no unattended rate at all, which is what makes hiring a
// technician (or standing there yourself) the only way to finish a drone early.

// The `worker` track lived here until C5. Automation is no longer an upgrade
// level — it is people you hire (defs/roles.js), each walking the shop floor.

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
      // No qualityMin: this level deliberately has no unattended rate. Hands-off
      // assembly is what a technician is for; this is what YOUR hands are for.
      { name: 'Паяльна станція', effect: 'Найширша зона, перегріву немає — але паяєте ви',
        greenHalf: SOLDER_STATION_GREEN_HALF, overheatChance: SOLDER_STATION_OVERHEAT_CHANCE },
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
})

// ── Registry helpers ──────────────────────────────────────

// Highest reachable level for a track (levels array has maxLevel+1 entries).
export function trackMaxLevel(trackId) {
  return UPGRADE_TRACKS[trackId].costs.length
}

// Design data for a track at a given level (effects, mode, mini-game params).
export function levelData(trackId, level) {
  return UPGRADE_TRACKS[trackId].levels[level]
}

// Cost to advance from `level` to the next one, or null if already maxed.
export function nextCost(trackId, level) {
  const { costs } = UPGRADE_TRACKS[trackId]
  return level < costs.length ? costs[level] : null
}
