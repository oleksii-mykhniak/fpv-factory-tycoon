// ── Simulation loop (Стадія 3 / C0) ──────────────────────
// The sim advances in fixed steps so behaviour is deterministic and testable
// headless. 20 Hz is plenty for agents and cheap on low-end Android.
export const TICK_MS = 50
// Upper bound on catch-up steps per advance() call. Protects against a huge
// elapsed time (app backgrounded for an hour) freezing the frame. The clock
// still jumps to wall time — only the simulated work is capped.
export const MAX_CATCHUP_STEPS = 40

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
// Raised 0.40 → 0.48 in the 2026-07-26 difficulty pass: at 0.40 a tap had to
// land in the outer third of the miss range to fail at all, so a player who
// half-aimed never saw a bad joint and never learned the mini-game had stakes.
export const COLD_SOLDER_THRESHOLD = 0.52
// Of all misses, this fraction escalates to overheating.
// 0.25 → 0.40: with the old numbers a full playthrough could end without ever
// burning a kit, which made the whole burnt-drone branch content nobody met.
export const OVERHEAT_CHANCE = 0.45
// Fraction of kit cost returned as scrap on abandon.
export const SALVAGE_RATE = 0.40
// How much each cold-solder miss subtracts from the final assembly quality cap.
export const COLD_SOLDER_QUALITY_PENALTY = 0.15

// ── Solder mini-game (level 0 — manual iron) ─────────────
export const SOLDER_BASE_PERIOD_MS = 1600  // one oscillation at point 0
export const SOLDER_SPEED_FACTOR   = 0.88  // each point 12% faster
export const SOLDER_GREEN_HALF     = 0.12  // green zone half-width [0..1]

// ── Upgrade: Better iron (level 1) ───────────────────────
export const BETTER_IRON_GREEN_HALF     = 0.22  // wider zone
export const BETTER_IRON_OVERHEAT_CHANCE = 0.10  // 60% less overheat risk

// ── Upgrade: Semi-auto / template (level 2) ──────────────
// C6: every level keeps hand-soldering parameters too — the track changes how
// good and how fast the bench is, never whether the player may work it.
export const SEMIAUTO_GREEN_HALF      = 0.24
export const SEMIAUTO_OVERHEAT_CHANCE = 0.08
export const SEMIAUTO_QUALITY_MIN    = 0.60
export const SEMIAUTO_QUALITY_MAX    = 0.75
export const SEMIAUTO_POINT_DELAY_MS = 1200

// ── Upgrade: Soldering station (level 3) ─────────────────
// Was "auto-solder": a bench that soldered itself at 0.75–0.88. It had no place
// left. Hiring a technician already buys hands-off assembly, and it is people
// the game grows through — an upgrade that ALSO removed the player from the
// bench competed with hiring while making the best-margin path (your own hands)
// pointless to ever use again. So level 3 no longer works alone: it is the best
// possible iron FOR YOU. No overheat at all, and a green zone nearly three
// times the width of the starting one.
export const SOLDER_STATION_GREEN_HALF      = 0.34
export const SOLDER_STATION_OVERHEAT_CHANCE = 0

// ── Risk on the unattended path ──────────────────────────
// Until now only the player's own taps could go wrong: a bench run by a
// technician or a semi-auto iron recorded a clean point every single time. That
// made the whole shop risk-free the moment you hired someone — and it is the
// real reason a playthrough could end without ever seeing a burnt kit.
//
// A miss here means the same thing it means for the player: a cold joint that
// costs quality, and sometimes a kit that burns. The rate is what a worker's
// level buys, which is what makes upgrading people worth money (F5).
export const TECH_MISS_CHANCE_BY_LEVEL = [0.15, 0.09, 0.05]
export const SEMIAUTO_MISS_CHANCE      = 0.10
// Of unattended misses, this fraction burns the kit. Deliberately far below the
// player's own OVERHEAT_CHANCE: a bench nobody is watching should mostly cost
// quality, or an unattended shop would spend its day on fire.
export const AUTO_OVERHEAT_SHARE = 0.20

// ── Conveyor (F3) ────────────────────────────────────────
// Belt speed in world units per second. A courier walks at 170–240, so the belt
// is deliberately slower than a person: it is not a shortcut, it is the thing
// that removes the walk entirely — nobody has to escort the box.
export const CONVEYOR_SPEED = 150
// How many boxes may wait at one hall's drop point before the belt stops
// offloading there. This is what turns "the hall cannot keep up" into a visible
// queue riding past instead of a number in a panel.
export const CONVEYOR_DROP_CAPACITY = 2

// ── Camera (C1) ──────────────────────────────────────────
// The world is now larger than the screen and measured in fixed world units,
// so zoom is chosen to show a constant slice of the world regardless of device:
//   zoom = clamp(canvasHeight / VIEW_HEIGHT_UNITS, MIN, MAX)
// A phone and a tablet then see the same amount of game, not the same pixels.
export const VIEW_HEIGHT_UNITS = 980
export const CAMERA_ZOOM_MIN   = 0.55
export const CAMERA_ZOOM_MAX   = 1.60
// Elastic follow — higher elasticity snaps harder, higher friction damps sooner.
export const CAMERA_ELASTICITY = 0.20
export const CAMERA_FRICTION   = 0.28

// ── Player movement (C1) ─────────────────────────────────
export const PLAYER_SPEED  = 240   // world units per second
// Collision box — deliberately smaller than the sprite and biased to the feet,
// so the character's head can overlap furniture drawn behind it.
export const PLAYER_HALF_W = 20
export const PLAYER_HALF_H = 14
// Longest displacement resolved in one collision substep. Must stay below the
// thinnest obstacle (walls are 24) or a fast agent tunnels straight through it.
export const MOVE_MAX_STEP = 8

// ── Hired workers (C5) ───────────────────────────────────
// Hiring the n-th worker of a role costs base × growth^n.
export const HIRE_COST_BASE   = { courier: 260, tech: 420, seller: 320, manager: 640 }
export const HIRE_COST_GROWTH = 1.85

export const COURIER_SPEED_BY_LEVEL = [170, 205, 240]
export const SELLER_SPEED_BY_LEVEL  = [170, 205, 240]
// A tech's own pace and quality at a bench. Deliberately worse than a good
// manual player and better than nothing — hiring buys time, not perfection.
export const TECH_POINT_MS_BY_LEVEL = [2600, 2000, 1500]
export const TECH_QUALITY_BY_LEVEL  = [0.55, 0.65, 0.75]

// Levelling somebody up, on the shop floor (F5). Cost is base × growth^level,
// per role — the same shape as hiring, so a shop with three trained couriers is
// visibly a bigger investment than one with three fresh ones.
export const WORKER_UPGRADE_BASE   = { courier: 240, tech: 400, seller: 300, manager: 560 }
export const WORKER_UPGRADE_GROWTH = 2.1
// How long the player stands next to someone to promote them.
export const ZONE_DWELL_PROMOTE_MS = 1000
// How close counts as "next to". Deliberately tight: a wide one would fire on
// anybody walking past a colleague, and promotions cost money.
export const PROMOTE_ZONE_SIZE = 120

// ── Procurement manager (S3) ─────────────────────────────
// The manager sits at the laptop and orders kits so the player does not have
// to. Deliberately the most expensive hire: it is the one that closes the loop
// and lets the shop run with nobody touching it.
export const MANAGER_SPEED_BY_LEVEL = [170, 205, 240]
// How much more than the kit's price must be in the bank before the manager
// spends it. Without a reserve they empty the account on the first tick and the
// player can never buy an upgrade — the shop optimises itself into a corner.
export const MANAGER_RESERVE = 1.8
// How far up the price list this manager is allowed to shop, as an index into
// the location's kit list sorted by cost. Level 0 buys the cheapest thing that
// works; a trained one buys what actually pays.
export const MANAGER_TIER_BY_LEVEL = [0, 1, 99]
// Pause between two orders, so a manager with money never machine-guns the
// delivery slots the moment they free up.
export const MANAGER_COOLDOWN_MS = 4000

// How much of a closed-app absence is ever paid out (C7).
export const OFFLINE_CAP_MS = 4 * 60 * 60 * 1000

// Idle behaviour: workers with no job drift around the rest area instead of
// standing frozen, which is what makes the shop look alive.
// Small enough that a worker reads as standing at their own post rather than
// roaming the shop (S1.5).
export const WANDER_RADIUS   = 120
export const WANDER_PAUSE_MS = 2600

// ── Navigation (C4) ──────────────────────────────────────
// Grid cell size. Smaller = more accurate paths and a more expensive search;
// 24 is about a third of a character, which is enough to find doorways.
export const NAV_CELL = 24
// Obstacles are grown by this much before rasterising, so a path planned for a
// point never scrapes a character's shoulder along a wall. Should match the
// agent's larger half-extent.
export const NAV_INFLATE = 20
// Hard ceiling on A* work per search — returns null instead of freezing a frame.
export const ASTAR_MAX_NODES = 4000
// How many searches may run in one tick. Pathfinding is the most expensive
// thing in the sim on a low-end phone, so it gets a budget.
export const PATHS_PER_TICK = 2
export const PATH_CACHE_SIZE = 64

// Distance at which a waypoint counts as reached.
export const WAYPOINT_ARRIVE_R = 14
// Soft separation between agents — deliberately NOT cell reservation, which
// deadlocks crowds of this size (plan §6.6).
export const AGENT_SEPARATION_R = 46
export const AGENT_SEPARATION_W = 0.55
// No progress for this long while following a path = re-plan.
export const STUCK_TIMEOUT_MS = 700

// ── Onboarding (C7) ──────────────────────────────────────
// The objective arrow and the running hint line are training wheels: they run
// for the first few orders and then get out of the way.
export const GUIDANCE_ORDERS = 5
// The salvage bin has its own allowance: five clean orders can go by without a
// burnt kit, and then the bin would never have been pointed out.
export const GUIDANCE_SCRAP_RUNS = 2

// ── Presentation ─────────────────────────────────────────
// How far an actor closes the gap to its simulated position each rendered
// frame. The sim steps at 20 Hz and the screen redraws at ~60, so copying
// positions directly makes the character judder. 0.35 is smooth without
// feeling like the character lags behind the stick.
export const VIEW_SMOOTHING = 0.35

// ── Trigger zones (C2) ───────────────────────────────────
// How long a character must stand in a zone before it fires. 0 = instant.
// Longer dwell = the action reads as "work"; instant = "pick up".
export const ZONE_DWELL_INSTANT_MS = 0
export const ZONE_DWELL_BENCH_MS   = 1100
// Collecting a finished drone from the output table (S1.2). Short: the walk
// round the bench is the cost, standing still is not.
export const ZONE_DWELL_OUTPUT_MS  = 250
// Walking up to the laptop / rack / board (S2). Long enough that crossing the
// room past the desk never pops a panel in your face — at full speed a
// character clears a 150-unit zone in ~0.6 s, so anything below that fires on
// people just walking past. Deliberately longer than that, and the objects sit
// out of the traffic lanes as well.
export const ZONE_DWELL_PANEL_MS   = 750
export const ZONE_DWELL_MAILBOX_MS = 700
export const ZONE_DWELL_TRASH_MS   = 900
// Progress drains this many times faster than it fills when you step out, so
// leaving is forgiving but not free.
export const DWELL_DECAY_MULT = 2.5
// Repeating zones fire again every N ms while occupied (item streams).
export const ZONE_REPEAT_MS = 260

// ── Carrying (C2) ────────────────────────────────────────
// Items a character can hold at once. An upgrade track raises this in C5.
export const CARRY_CAPACITY = 1
// Vertical gap between stacked items floating above a character's head.
export const CARRY_STACK_OFFSET_Y = 26

// ── Input (C1) ───────────────────────────────────────────
export const INPUT_DEADZONE = 0.18   // below this magnitude the stick reads as centred

// ── Virtual joystick (C1) ────────────────────────────────
export const JOYSTICK_RADIUS       = 62   // px from base centre to full deflection
export const JOYSTICK_ZONE_H_RATIO = 1.0  // fraction of the game area that can start a drag

// Scene object proportions used to live here as fractions of the canvas.
// C1 replaced them with absolute world units in defs/layouts/<location>.js —
// the world is bigger than the screen now, so screen fractions are meaningless.

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
  scrap_drone: {
    cost: 0, basePrice: 55, deliveryMs: 0,
    assemblySteps: [
      { label: 'Збираю раму з брухту',  missMsg: 'Криво — виправляємо' },
      { label: 'Монтую б/в мотори',     missMsg: 'Мотор хитається — підтягуємо' },
      { label: 'Паяю контролер',        missMsg: "Слабкий контакт — переплавляємо" },
    ],
  },
})

// ── Piggy bank (rescue mini-game) ────────────────────────────
// Visible only when money < cheapest kit and no active cycle.
export const PIGGY_TAP_VALUE   = 1        // money per tap
export const PIGGY_DURATION_MS = 8000     // tap window (ms)
export const PIGGY_COOLDOWN_MS = 900000   // 15 min between sessions
export const PIGGY_MAX_PAYOUT  = 72       // cap = cheapest kit cost → guaranteed rescue in one session

// ── Scrap / Tinder mini-game ──────────────────────────────
// Player swipes good parts right, junk left, to unlock free drone assembly.
export const TINDER_GOOD_CARDS = 3    // good part cards per round
export const TINDER_JUNK_CARDS = 3    // junk cards per round
export const TINDER_MIN_GOOD   = 2    // right-swipes on good parts needed to proceed
export const SCRAP_CONSOLATION = 5    // UAH awarded if player fails Tinder game

// ── Monetization ─────────────────────────────────────────
// Set true only when a real ad SDK is integrated and configured.
export const ADS_ENABLED = false

// ── Audio / Haptics defaults ──────────────────────────────
export const DEFAULT_SOUND   = true
export const DEFAULT_HAPTICS = true

// ── Upgrade costs ────────────────────────────────────────
// Index = current level; value = cost to reach next level.
// Max level is derived from this array's length (see upgrades.js trackMaxLevel).
export const SOLDERING_UPGRADE_COSTS    = [150, 300, 600]
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

// ── Upgrade: Extra workbenches (C3) ──────────────────────
// Each level builds one more station, up to the number of slots the location
// layout provides.
export const BENCH_UPGRADE_COSTS = [400, 1200]

// ── Upgrade: Logistics (faster delivery) ─────────────────
export const LOGISTICS_UPGRADE_COSTS  = [200, 500]
// Delivery time multiplier per level: 1.0 = standard, 0.7 = 30% faster, 0.5 = 50% faster.
export const LOGISTICS_DELIVERY_MULT  = [1.0, 0.7, 0.5]
