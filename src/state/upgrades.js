// Upgrade registry — data-driven. Add a new upgrade track by adding an entry here;
// buyUpgrade(), the upgrade UI, and main.js all read from this registry, so no logic
// changes are needed to introduce one.
//
// Convention: tunable balance numbers live in config.js (the registry composes them),
// per-level display strings are content and live here.
import {
  SOLDER_GREEN_HALF, OVERHEAT_CHANCE,
  BETTER_IRON_GREEN_HALF, BETTER_IRON_OVERHEAT_CHANCE,
  SEMIAUTO_QUALITY_MIN, SEMIAUTO_QUALITY_MAX,
  AUTO_QUALITY_MIN, AUTO_QUALITY_MAX, AUTO_POINT_DELAY_MS,
  SOLDERING_UPGRADE_COSTS,
} from './config.js'

// Assembly behaviour a soldering level drives. main.js branches on this instead of
// hardcoded level numbers, so adding a level is purely data.
export const SOLDER_MODE = Object.freeze({
  MANUAL: 'manual',  // reaction mini-game (player solders each point)
  SEMI:   'semi',    // one tap solders the whole kit
  AUTO:   'auto',    // background timer solders each point on its own
})

export const UPGRADE_TRACKS = Object.freeze({
  soldering: {
    id:       'soldering',
    name:     'Паяльник',
    stateKey: 'solderingLevel',         // field in state.upgrades holding this track's level
    costs:    SOLDERING_UPGRADE_COSTS,  // costs[i] = price to go from level i → i+1
    levels: [
      { name: 'Ручний паяльник', effect: 'Базова механіка',
        mode: SOLDER_MODE.MANUAL, greenHalf: SOLDER_GREEN_HALF, overheatChance: OVERHEAT_CHANCE },
      { name: 'Кращий паяльник', effect: 'Ширша зона +47%, перегрів −60%',
        mode: SOLDER_MODE.MANUAL, greenHalf: BETTER_IRON_GREEN_HALF, overheatChance: BETTER_IRON_OVERHEAT_CHANCE },
      { name: 'Напівавтомат', effect: '1 тап — вся збірка, якість 65–85%',
        mode: SOLDER_MODE.SEMI, qualityMin: SEMIAUTO_QUALITY_MIN, qualityMax: SEMIAUTO_QUALITY_MAX },
      { name: 'Автопаяльник', effect: 'Паяє сам, якість 55–75%, без участі',
        mode: SOLDER_MODE.AUTO, qualityMin: AUTO_QUALITY_MIN, qualityMax: AUTO_QUALITY_MAX, pointDelayMs: AUTO_POINT_DELAY_MS },
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
