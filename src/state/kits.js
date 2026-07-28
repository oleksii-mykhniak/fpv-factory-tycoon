// Kit (product) registry — data-driven. Add a new drone type by adding an
// entry here AND a matching entry in config.js KIT_CONFIGS.
//
// KIT_CONFIGS (config.js) owns: cost, basePrice, assemblySteps (and solderPointCount
// derived from assemblySteps.length). This file owns: id, name, emoji, spriteKey, unlock.
//
// unlock: null = always available; { location: 'id' } = gated until that
// location (D7); { room: 'id' } = gated until that room of the flat is bought (П2).
import { KIT_CONFIGS, MK_UNLOCKS } from './config.js'

function makeKit(id, { name, emoji, spriteKey, unlock, isSpecial = false }) {
  const cfg = KIT_CONFIGS[id]
  return {
    id,
    name,
    emoji,
    cost:             cfg.cost,
    basePrice:        cfg.basePrice,
    deliveryMs:       cfg.deliveryMs,
    solderPointCount: cfg.assemblySteps.length,
    assemblySteps:    cfg.assemblySteps,
    spriteKey,
    unlock,
    isSpecial,
  }
}

export const KIT_TYPES = Object.freeze({
  mini_drone:      makeKit('mini_drone',      { name: 'Міні-дрон',           emoji: '🚁', spriteKey: 'mini_drone',      unlock: null }),
  racing_drone:    makeKit('racing_drone',    { name: 'Гоночний дрон',       emoji: '⚡', spriteKey: 'racing_drone',    unlock: null }),
  cinematic_drone: makeKit('cinematic_drone', { name: 'Кінематографічний',   emoji: '🎬', spriteKey: 'cinematic_drone', unlock: null }),
  longrange_drone: makeKit('longrange_drone', { name: 'Далекобійний',        emoji: '📡', spriteKey: 'longrange_drone', unlock: { room: 'garage' } }),
  scrap_drone:     makeKit('scrap_drone',     { name: 'Дрон з брухту',       emoji: '♻️', spriteKey: 'mini_drone',      unlock: null, isSpecial: true }),
})

// ── Mk: чисті читачі (Стадія 10 / B) ──────────────────────
//
// Живуть тут, а не в gameState.js, з однієї причини: `locations.js` мусить
// знати, чи відкритий тип, а `gameState.js` імпортує `locations.js`. Класти їх
// у gameState означало б цикл — цей файл не імпортує нічого, крім конфігу, і
// саме тому годиться.

export function kitMark(state, kitTypeId) {
  return state?.kitMarks?.[kitTypeId] ?? 0
}

// Який тип і який його Mk відкриває цей комплект, або null, якщо він не
// відкривається нічим.
export function markUnlockOf(kitTypeId) {
  const entry = Object.entries(MK_UNLOCKS).find(([, u]) => u.unlocks === kitTypeId)
  return entry ? { fromKit: entry[0], mk: entry[1].mk } : null
}

// Двері односторонні: `kitMarks` тільки росте, тож відкритий тип не зачиниться.
export function markUnlocked(state, kitTypeId) {
  const req = markUnlockOf(kitTypeId)
  return !req || kitMark(state, req.fromKit) >= req.mk
}
