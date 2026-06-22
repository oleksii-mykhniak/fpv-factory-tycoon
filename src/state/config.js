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

// ── Camera zoom (dynamic, based on screen height) ────────
// zoom = clamp(H / CAMERA_ZOOM_REF, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX)
export const CAMERA_ZOOM_REF = 980   // reference height for zoom=1.0 feel
export const CAMERA_ZOOM_MIN = 0.78  // floor for small phones (iPhone SE)
export const CAMERA_ZOOM_MAX = 0.90  // ceiling for large phones (Pro Max)

// ── Scene object proportions (ratios relative to canvas dimensions) ──
export const SCENE_ROOM_H_RATIO   = 0.70  // room fraction of game canvas height
export const SCENE_WORKER_W_RATIO = 0.18  // worker size (square) fraction of canvas width
export const SCENE_DRONE_W_RATIO  = 0.09  // drone width fraction (smaller than worker)
export const SCENE_BOX_W_RATIO    = 0.12  // delivery box width fraction

// ── Interaction pulse cues ────────────────────────────────
export const PULSE_FREQ_HZ   = 1.5   // oscillations per second
export const PULSE_SCALE_AMP = 0.08  // ±amplitude of scale pulse

// ── Kit configs ───────────────────────────────────────────
// All tunable per-kit params live here: economy, structure, assembly steps.
// Sprites / names / emoji / unlock conditions are content → kits.js.
// assemblySteps: label shown during that solder point; missMsg shown on cold-solder failure.
export const KIT_CONFIGS = Object.freeze({
  mini_drone: {
    cost: 72, basePrice: 95, deliveryMs: 4000,
    assemblySteps: [
      { label: 'Збираю раму',                    missMsg: 'Стійки не вирівняні — підправляємо кут' },
      { label: 'Встановлюю мотори',              missMsg: 'Мотор не зафіксовано — підтягуємо болти' },
      { label: 'Паяю регулятори (ESC)',           missMsg: "Погане з'єднання ESC — переплавляємо контакт" },
      { label: 'Прошиваю польотний контролер',   missMsg: 'Помилка прошивки — перевіряємо контакти' },
    ],
  },
  racing_drone: {
    cost: 140, basePrice: 210, deliveryMs: 6000,
    assemblySteps: [
      { label: 'Збираю гоночну раму',            missMsg: 'Рама перекошена — вирівнюємо' },
      { label: 'Встановлюю мотори 2306',         missMsg: 'Мотор вібрує — перетягуємо гвинти' },
      { label: 'Паяю ESC 4-в-1',                missMsg: "Холодне з'єднання ESC — переплавляємо" },
      { label: 'Монтую відеопередавач',          missMsg: 'VTX тримається погано — переклеюємо' },
      { label: 'Калібрую польотний контролер',   missMsg: 'Калібрування збилось — повторюємо' },
      { label: 'Тестую двигуни',                 missMsg: 'Двигун не запускається — перевіряємо пайку' },
    ],
  },
  cinematic_drone: {
    cost: 260, basePrice: 420, deliveryMs: 10000,
    assemblySteps: [
      { label: 'Збираю карбонову раму',          missMsg: 'Карбон не стискується рівно — перезбираємо' },
      { label: 'Встановлюю тихі мотори',         missMsg: 'Мотор шумить — перевіряємо посадку' },
      { label: 'Паяю ESC',                       missMsg: "Поганий контакт ESC — переплавляємо" },
      { label: 'Монтую кріплення камери',        missMsg: 'Кріплення хитається — підтягуємо' },
      { label: 'Підключаю стабілізатор',         missMsg: "Стабілізатор не відповідає — перевіряємо роз'єм" },
      { label: 'Паяю відеопередавач',            missMsg: 'Антена замикає — переробляємо пайку' },
      { label: 'Калібрую польотний контролер',   missMsg: 'Гіроскоп не калібрується — перевіряємо контакти' },
      { label: 'Балансую пропелери',             missMsg: 'Дисбаланс пропелера — переставляємо' },
    ],
  },
  longrange_drone: {
    cost: 180, basePrice: 300, deliveryMs: 8000,
    assemblySteps: [
      { label: 'Збираю раму для далеких польотів', missMsg: "Кріплення не тримає — переробляємо" },
      { label: 'Встановлюю економічні мотори',     missMsg: 'Мотор перегрівається — перевіряємо монтаж' },
      { label: 'Паяю GPS-модуль',                  missMsg: "Погане з'єднання GPS — переплавляємо" },
      { label: 'Підключаю радіоприймач',           missMsg: 'Приймач не відповідає — перевіряємо пайку' },
      { label: 'Прошиваю польотний контролер',     missMsg: 'Прошивка не завантажилась — повторюємо' },
    ],
  },
})

// ── Piggy bank (rescue mini-game) ────────────────────────────
// Visible only when money < cheapest kit and no active cycle.
export const PIGGY_TAP_VALUE   = 3        // money per tap
export const PIGGY_DURATION_MS = 8000     // tap window (ms)
export const PIGGY_COOLDOWN_MS = 900000   // 15 min between sessions
export const PIGGY_MAX_PAYOUT  = 72       // cap = cheapest kit cost → guaranteed rescue in one session

// ── Upgrade costs ────────────────────────────────────────
// Index = current level; value = cost to reach next level.
// Max level is derived from this array's length (see upgrades.js trackMaxLevel).
export const SOLDERING_UPGRADE_COSTS    = [150, 300, 600]
export const WORKER_UPGRADE_COSTS       = [250, 500]
export const CONSUMABLES_UPGRADE_COSTS  = [120, 280]

// ── Upgrade: Consumables (flux & solder) ─────────────────
// Per-level overheat chance multiplier (stacks with soldering track).
export const FLUX_OVERHEAT_MULT  = [1.0, 0.7, 0.4]
// Per-level flat quality bonus added to each solder point result.
export const FLUX_QUALITY_BONUS  = [0,   0,   0.05]

// ── Upgrade: Storage (extra delivery slots) ───────────────
export const STORAGE_UPGRADE_COSTS  = [300, 700]
// How many SECONDARY delivery slots are unlocked per level (primary is always 1).
export const STORAGE_SLOTS_BY_LEVEL = [0, 1, 2]

// ── Upgrade: Logistics (faster delivery) ─────────────────
export const LOGISTICS_UPGRADE_COSTS  = [200, 500]
// Delivery time multiplier per level: 1.0 = standard, 0.7 = 30% faster, 0.5 = 50% faster.
export const LOGISTICS_DELIVERY_MULT  = [1.0, 0.7, 0.5]
