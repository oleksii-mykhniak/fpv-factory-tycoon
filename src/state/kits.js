// Kit (product) registry — data-driven. Add a new drone type by adding an
// entry here AND a matching entry in config.js KIT_CONFIGS.
//
// KIT_CONFIGS (config.js) owns: cost, basePrice, assemblySteps (and solderPointCount
// derived from assemblySteps.length). This file owns: id, name, emoji, spriteKey, unlock.
//
// unlock: null = always available; { location: 'id' } = gated until that location (D7).
import { KIT_CONFIGS } from './config.js'

function makeKit(id, { name, emoji, spriteKey, unlock }) {
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
  }
}

export const KIT_TYPES = Object.freeze({
  mini_drone:      makeKit('mini_drone',      { name: 'Міні-дрон',           emoji: '🚁', spriteKey: 'mini_drone',      unlock: null }),
  racing_drone:    makeKit('racing_drone',    { name: 'Гоночний дрон',       emoji: '⚡', spriteKey: 'racing_drone',    unlock: null }),
  cinematic_drone: makeKit('cinematic_drone', { name: 'Кінематографічний',   emoji: '🎬', spriteKey: 'cinematic_drone', unlock: null }),
  longrange_drone: makeKit('longrange_drone', { name: 'Далекобійний',        emoji: '📡', spriteKey: 'longrange_drone', unlock: { location: 'garage' } }),
})
