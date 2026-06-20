// ── Delivery ─────────────────────────────────────────────
// Time from order placement to delivery arrival (ms).
export const DELIVERY_DELAY_MS = 5000

// ── Economy ──────────────────────────────────────────────
export const STARTING_MONEY = 120

// ── Price formula: price = base × (BASE + QUALITY_COEFF × quality) × multiplier ──
export const PRICE_BASE_COEFF    = 0.6
export const PRICE_QUALITY_COEFF = 0.7

// ── Failure thresholds ────────────────────────────────────
// Quality below this = miss (cold solder or overheat).
export const COLD_SOLDER_THRESHOLD = 0.40
// Of all misses, this fraction escalates to overheating.
export const OVERHEAT_CHANCE = 0.25
// Fraction of kit cost returned as scrap on abandon.
export const SALVAGE_RATE = 0.40
// How much each cold-solder miss subtracts from the final assembly quality cap.
export const COLD_SOLDER_QUALITY_PENALTY = 0.15

// ── Solder mini-game (level 0 — manual iron) ─────────────
export const SOLDER_BASE_PERIOD_MS = 1600  // one oscillation at point 0
export const SOLDER_SPEED_FACTOR   = 0.88  // each point 12% faster
export const SOLDER_GREEN_HALF     = 0.15  // green zone half-width [0..1]

// ── Upgrade: Better iron (level 1) ───────────────────────
export const BETTER_IRON_GREEN_HALF     = 0.22  // wider zone
export const BETTER_IRON_OVERHEAT_CHANCE = 0.10  // 60% less overheat risk

// ── Upgrade: Semi-auto / template (level 2) ──────────────
export const SEMIAUTO_QUALITY_MIN = 0.65
export const SEMIAUTO_QUALITY_MAX = 0.85

// ── Upgrade: Auto-solder (level 3) ───────────────────────
export const AUTO_QUALITY_MIN   = 0.55
export const AUTO_QUALITY_MAX   = 0.75
export const AUTO_POINT_DELAY_MS = 2000  // ms between auto-soldered points

// ── Upgrade costs ────────────────────────────────────────
// Index = current level; value = cost to reach next level.
// Max level is derived from this array's length (see upgrades.js trackMaxLevel).
export const SOLDERING_UPGRADE_COSTS = [150, 300, 600]
