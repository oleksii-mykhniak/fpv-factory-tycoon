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
// The top of the track, and it has to READ like the top: Stage 9 found the
// track going manual → manual → semi-auto → manual, because this level once
// had its unattended rate taken away to stop it competing with hiring a
// technician. That fixed the balance by breaking the promise — a player who
// paid $600 got the mini-game back.
//
// The competition was a misreading anyway: a station is a BENCH, a technician
// is a PERSON. This level still produces nothing at an empty bench (see
// workSource) — what it does is raise the ceiling for whoever stands there,
// including a hired tech, because workSource takes the best of both on every
// axis. So the station makes your staff better instead of replacing them,
// which is the right shape for a tycoon.
export const SOLDER_STATION_GREEN_HALF      = 0.34
export const SOLDER_STATION_OVERHEAT_CHANCE = 0
// Strictly better than the semi-auto on every axis — the tests assert this, so
// a balance pass can never quietly reintroduce the regression.
export const SOLDER_STATION_QUALITY_MIN    = 0.80
export const SOLDER_STATION_QUALITY_MAX    = 0.92
export const SOLDER_STATION_POINT_DELAY_MS = 900
export const SOLDER_STATION_MISS_CHANCE    = 0.03

// ── Risk on the unattended path ──────────────────────────
// Until now only the player's own taps could go wrong: a bench run by a
// technician or a semi-auto iron recorded a clean point every single time. That
// made the whole shop risk-free the moment you hired someone — and it is the
// real reason a playthrough could end without ever seeing a burnt kit.
//
// A miss here means the same thing it means for the player: a cold joint that
// costs quality, and sometimes a kit that burns. The rate is what a worker's
// level buys, which is what makes upgrading people worth money (F5).
//
// Самі числа переїхали в ROLE_CURVES (Стадія 10 / C): рівні перестали бути
// таблицею з трьох рядків і стали кривими без стелі.
export const SEMIAUTO_MISS_CHANCE      = 0.10
// Of unattended misses, this fraction burns the kit. Deliberately far below the
// player's own OVERHEAT_CHANCE: a bench nobody is watching should mostly cost
// quality, or an unattended shop would spend its day on fire.
export const AUTO_OVERHEAT_SHARE = 0.20

// ── Income readout (F7) ──────────────────────────────────
// Rolling window for the $/sec figure. Deliberately actual sales in the last
// minute rather than a projection: a tycoon number the player cannot check
// against what just happened is a number they stop believing.
export const INCOME_WINDOW_MS = 60_000
// Остання ціль ланцюга квестів (Стадія 9 / Р1): $/сек, на якому гра вважається
// пройденою. Читається з того самого числа в HUD, тому мета перевіряється очима,
// а не поясненням.
export const ENDGAME_RATE_TARGET = 10

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

// Which art the people are drawn with (V6 revert).
//
//   'generated' — scripts/gen-placeholder-sprites.js: a four-frame walk cycle
//                 per palette, tinted per role at runtime
//   'kenney'    — the CC0 tiles: four fixed poses, movement read from a bob
//
// Both rigs live in scene/character.js and answer the same setMoving(). The
// owner tried the Kenney characters against the Kenney furniture and preferred
// ours, so this is the switch rather than a deletion — the tiles and the credits
// stay in the repo.
export const CHARACTER_ART = 'generated'

// ── Scale (V1) ───────────────────────────────────────────
// The character is the ruler. Every size in the game is written as a fraction
// of their height, because sizes picked by eye drift apart: the workbench spent
// four stages at 300 units — four times the width of the person standing at it —
// and nothing in the code could notice.
//
// Change this number and the whole world scales together.
export const CHARACTER_U = 74
export const u = (n) => Math.round(n * CHARACTER_U)

// ── Player movement (C1) ─────────────────────────────────
export const PLAYER_SPEED  = 240   // world units per second
// Collision box — deliberately smaller than the sprite and biased to the feet,
// so the character's head can overlap furniture drawn behind it.
export const PLAYER_HALF_W = u(0.27)
export const PLAYER_HALF_H = u(0.19)
// Longest displacement resolved in one collision substep. Must stay below the
// thinnest obstacle (walls are 24) or a fast agent tunnels straight through it.
export const MOVE_MAX_STEP = 8

// ── Hired workers (C5) ───────────────────────────────────
// Hiring the n-th worker of a role costs base × growth^n.
export const HIRE_COST_BASE   = { courier: 260, tech: 420, seller: 320, manager: 640 }
export const HIRE_COST_GROWTH = 1.85

// Характеристики рівнів — у ROLE_CURVES нижче (Стадія 10 / C). Таблиці
// [170, 205, 240] тут більше немає: три рядки означали два підвищення на
// людину за все життя, а криві не мають стелі. Ті самі числа крива дає на
// рівнях 0 і 2 — це закріплено тестом, щоб C нічого не переграла заднім числом.
// Технік навмисно гірший за уважного гравця й кращий за нікого: найм купує
// час, а не бездоганність.

// Levelling somebody up, on the shop floor (F5). Cost is base × growth^level,
// per role — the same shape as hiring, so a shop with three trained couriers is
// visibly a bigger investment than one with three fresh ones.
export const WORKER_UPGRADE_BASE   = { courier: 240, tech: 400, seller: 300, manager: 560 }
// Крива ціни — WORKER_LEVEL_GROWTH нижче. Була 2.1, але це показник для трьох
// рівнів; для нескінченних він робить третє підвищення недосяжним.
// How long the player stands next to someone to promote them.
// Довше за решту панелей (П3): біля власного техніка можна опинитись випадково
// на секунду, але не на півтори — а ця панель відкривається САМА, поки ти
// просто стоїш поруч.
export const ZONE_DWELL_PROMOTE_MS = 1600
// How close counts as "next to". Deliberately tight: a wide one would fire on
// anybody walking past a colleague, and promotions cost money.
export const PROMOTE_ZONE_SIZE = 120

// ── Procurement manager (S3) ─────────────────────────────
// The manager sits at the laptop and orders kits so the player does not have
// to. Deliberately the most expensive hire: it is the one that closes the loop
// and lets the shop run with nobody touching it.
// How much more than the kit's price must be in the bank before the manager
// spends it. Without a reserve they empty the account on the first tick and the
// player can never buy an upgrade — the shop optimises itself into a corner.
export const MANAGER_RESERVE = 1.8
// How far up the price list this manager is allowed to shop, as an index into
// the location's kit list sorted by cost. Level 0 buys the cheapest thing that
// works; a trained one buys what actually pays. Східці — див. managerTier().
// Pause between two orders, so a manager with money never machine-guns the
// delivery slots the moment they free up.
export const MANAGER_COOLDOWN_MS = 4000

// How much of a closed-app absence is ever paid out (C7).
export const OFFLINE_CAP_MS = 4 * 60 * 60 * 1000

// ── Офлайн-цех (Стадія 9 / Р6) ───────────────────────────
//
// Доти офлайн лише доводив те, що вже було в роботі: без гравця ніхто не
// замовляє комплекти, тож новий цикл почати нікому. Це правильно, поки штату
// немає — і перестає бути правильним, коли найнято всіх чотирьох: менеджер
// замовляє, кур'єр носить, технік паяє, продавець продає. Петля замикається
// сама, і саме це має бути нагородою за пройдену драбину.
//
// Частка живого темпу, яку платить офлайн. Грати наживо мусить бути вигідніше:
// офлайн не знає ні черг, ні того, що гравець сам стає до верстака.
export const OFFLINE_EFFICIENCY = 0.6

// Idle behaviour: workers with no job drift around the rest area instead of
// standing frozen, which is what makes the shop look alive.
// Small enough that a worker reads as standing at their own post rather than
// roaming the shop (S1.5).
export const WANDER_RADIUS   = u(1.6)
export const WANDER_PAUSE_MS = 2600

// ── Background music (A6) ────────────────────────────────
// Synthesised live rather than shipped as a file — see src/audio/music.js.
// Slow, quiet, and in a mode that does not resolve: a loop that keeps arriving
// somewhere is a loop you notice, and this one plays for an hour.
export const MUSIC_BPM  = 74
export const MUSIC_GAIN = 0.10          // the room, not the game
export const MUSIC_ROOT = 220           // A3
// Semitones from the root. Am – F – C – G, the four chords that never tire.
export const CHORDS = [
  [0, 3, 7],      // Am
  [-4, 0, 5],     // F
  [3, 7, 10],     // C
  [-2, 2, 7],     // G
]

// ── The cat (V5) ─────────────────────────────────────────
// A cat is not a slow worker: it has moods, and most of them are stationary.
// Each state picks the next one from CAT_MOODS, so behaviour is a table rather
// than a pile of conditions — the same shape as defs/tasks.js.
export const CAT_SPEED       = 110    // strolling
export const CAT_RUN_SPEED   = 280    // faster than the player: a cat sprint is a joke, not a chase
export const CAT_WANDER_RADIUS = u(4)
export const CAT_ROAM_RADIUS   = u(9)   // where a run can take it

// How long each mood lasts, in ms [min, max].
export const CAT_MOOD_MS = {
  sit:    [3000, 9000],
  sleep:  [12000, 26000],
  groom:  [3000, 6000],
  stroll: [1200, 2600],
  run:    [900, 1800],
  follow: [3000, 6000],
}

// What a mood turns into next, as weights. Sleep is sticky, running is not:
// a cat that sprints twice in a row looks broken, one that sleeps twice does
// not look like anything at all.
export const CAT_MOODS = {
  sit:    { stroll: 4, groom: 3, sleep: 2, run: 1, follow: 1 },
  sleep:  { sleep: 3, sit: 4, groom: 2 },
  groom:  { sit: 4, stroll: 3, sleep: 2 },
  stroll: { sit: 5, stroll: 2, groom: 2, run: 1, follow: 1 },
  run:    { sit: 6, stroll: 3 },
  follow: { sit: 4, stroll: 3, groom: 1 },
}

// ── Navigation (C4) ──────────────────────────────────────
// Grid cell size. Smaller = more accurate paths and a more expensive search;
// 24 is about a third of a character, which is enough to find doorways.
export const NAV_CELL = 24
// Obstacles are grown by this much before rasterising, so a path planned for a
// point never scrapes a character's shoulder along a wall. Should match the
// agent's larger half-extent.
export const NAV_INFLATE = u(0.27)
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
export const AGENT_SEPARATION_R = u(0.62)
export const AGENT_SEPARATION_W = 0.55
// No progress for this long while following a path = re-plan.
export const STUCK_TIMEOUT_MS = 700

// ── Стрілка-провідник (Стадія 9, фікс після валідації) ───
//
// Стрілка вчить петлю, а потім починає мозолити око: вона показує на місце, куди
// гравець і сам збирався, і робить це весь час. Тому вона безумовна лише поки
// ланцюг квестів вчить основи — перші кроки, — а далі з'являється НА ЗАПИТ:
// тап по картці цілі означає «покажи, куди йти».
//
// Скільки перших кроків ланцюга стрілка веде без запиту.
export const ARROW_FREE_STEPS = 5
// Скільки триває показ після тапу. Достатньо, щоб дійти через кімнату й не
// озиратись, і замало, щоб стрілка знову стала фоном.
export const ARROW_REQUEST_MS = 20_000

// ── Onboarding (C7) ──────────────────────────────────────
// The objective arrow and the running hint line are training wheels: they run
// for the first few orders and then get out of the way.
export const GUIDANCE_ORDERS = 5
// The salvage bin has its own allowance: five clean orders can go by without a
// burnt kit, and then the bin would never have been pointed out.
export const GUIDANCE_SCRAP_RUNS = 2

// Скільки тримається повідомлення про холодну пайку в смужці (Стадія 9 / Р7).
// Було 2200 мс числом усередині solderBar.js. Разом із карткою над верстаком це
// одна тема — «що саме пішло не так», — і крутити її треба з одного місця.
export const COLD_MSG_MS = 2500

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
export const CARRY_STACK_OFFSET_Y = u(0.35)

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
//
// Виплата НЕ константа (фікс після валідації Стадії 10). Скарбничка існує рівно
// для одного: витягнути з глухого кута, тобто дати на найдешевший комплект. Її
// стеля була зашита числом ($72 — ціна mini на старті), і після першого ж Mk
// та оптових множників порятунок перестав рятувати: гравець тряс свиню вісім
// секунд і все одно не міг нічого замовити. Тепер стеля рахується зі стану —
// `piggyPayoutCap()` — а ціна тапу підганяється так, щоб повна виплата коштувала
// стільки ж зусиль, скільки й раніше.
export const PIGGY_DURATION_MS = 8000     // tap window (ms)
export const PIGGY_COOLDOWN_MS = 900000   // 15 min between sessions
export const PIGGY_FULL_TAPS   = 72       // тапів за сеанс на повну виплату
export const PIGGY_MIN_PAYOUT  = 72       // нижня межа, коли комплект дешевший

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

// ── Нескінченні числові треки (Стадія 10 / A) ────────────
//
// Чому вони взагалі є. Усі треки вище — ПРОСТОРОВІ: `benches` впирається в
// `layout.stationSlots`, `storage` — у слоти на вулиці, кімнати й цехи — в
// геометрію світу. Розтягнути їх не можна, тому разом вони дають 11 покупок за
// все проходження, а айдл-темп — покупка кожні 30–90 секунд. Густоту може дати
// тільки те, що не прив'язане до світу: множник, який просто росте.
//
// Крива 1.15ⁿ — щоб наступний рівень завжди був «майже по кишені» (П2 плану).
// Вона ж робить трек самообмежувальним: на 40-му рівні ціна вже така, що
// гравець сам перемикається на інший трек.
export const ENDLESS_COST_GROWTH = 1.15

export const ENDLESS_BASE_COST = Object.freeze({
  reputation: 50,   // ціна продажу
  bulk:       40,   // собівартість комплекту
  tooling:    60,   // якість пайки
  courier:    45,   // час доставки
})

// Крок ефекту за рівень.
export const REPUTATION_PRICE_STEP = 0.02    // +2% до ціни продажу
export const BULK_COST_STEP        = 0.01    // −1% до собівартості
export const TOOLING_QUALITY_STEP  = 0.005   // +0.5% до якості кожної пайки
export const COURIER_SPEED_STEP    = 0.015   // −1.5% до часу доставки

// НИЖНІ МЕЖІ — не косметика.
//
// Без них собівартість і час доставки йдуть у нуль, і гра ламається приблизно
// на 200-му рівні — тобто рівно тоді, коли до неї дограється найвідданіший
// гравець. Безкоштовний комплект робить гроші нескінченними, миттєва доставка
// прибирає з петлі очікування, заради якого існує весь трек логістики.
export const BULK_COST_FLOOR     = 0.40   // дешевше 40% від базової ціни комплект не буде
export const COURIER_SPEED_FLOOR = 0.30   // швидше 30% від базового часу не приїде

// Стелі по локаціях (A3). Без них гравець викачує Репутацію в квартирі й
// приходить на фабрику без жодної причини її відкривати: нескінченний трек,
// доступний одразу, з'їдає сенс усіх просторових.
export const ENDLESS_CAP_FLAT    = 15
export const ENDLESS_CAP_GARAGE  = 40
export const ENDLESS_CAP_HALL    = [80, 150, Infinity]

// Ціна рівня `level` → `level+1` для нескінченного треку.
export const endlessCost = (trackId, level) =>
  Math.round(ENDLESS_BASE_COST[trackId] * Math.pow(ENDLESS_COST_GROWTH, level))

// ── Mk комплектів (Стадія 10 / B) ────────────────────────
//
// Кожен тип дрона має власну драбину Mk I…Mk V — це ПАРАЛЕЛЬНІ драбини, а не
// еволюція одного дрона. Типи лишаються вибором: mini — 4 кроки збірки,
// cinematic — 8, і «дешево і швидко проти дорого і довго» тримається саме на
// цьому. Еволюція («mini стає racing, старий зникає») цей вибір прибрала б і
// дала б усього 4 переходи за гру.
export const MK_MAX = 5

// Ціна росте ПОВІЛЬНІШЕ за виторг — маржа з Mk зростає. Але `calcPrice`
// множить на (0.6 + 0.7 × якість), тож на високих Mk халтурна збірка стає
// збитковою: собівартість підповзає під 60% бази. Це і є справжня причина не
// бігти вперед по Mk з кволим паяльником — краща за будь-який хардлок, бо
// гравець доходить до неї сам.
export const MK_COST_GROWTH     = 1.5
export const MK_PRICE_GROWTH    = 1.7
// Дорожчий комплект їде довше. Це те, що нарешті дає трекам логістики й
// кур'єрів що компенсувати: доти вони прискорювали час, який нікого не тиснув.
export const MK_DELIVERY_GROWTH = 0.25

// Ціна апгрейда Mk. Вважається від СОБІВАРТОСТІ комплекту, а не окремим
// числом на кожен тип: дорожчий дрон і качається дорожче, і це єдиний спосіб
// не мати таблиці з 25 чисел, яку ніхто не збалансує.
export const MK_UPGRADE_COST_FACTOR = 2.2
// Останній рівень коштує помітно більше за екстраполяцію — але й дає стрибок
// (див. MK_UNLOCKS і +1 крок збірки), інакше спайк читався б як обдиралово.
export const MK_FINAL_COST_MULT = 2.5

// Стелі Mk по простору (B2). Це те, заради чого кімната знову щось значить:
// не «ще один множник», а «сюди можна довести дрон далі, ніж туди».
export const MK_CAP_FLAT   = 2
export const MK_CAP_GARAGE = 3
export const MK_CAP_HALL   = [3, 4, 5]

// Який Mk якого типу відкриває наступний тип (B3).
//
// Порядок у ланцюгу квестів мусить бути таким, щоб крок «купи Mk» стояв ПЕРЕД
// кроком «продай цей дрон». Інакше крок продажу став би `moot` (типу немає в
// каталозі), ланцюг би його проскочив, а потім, коли тип відкриється, — поїхав
// би назад. Монотонність ланцюга (Стадія 9 / П2) на цьому і тримається.
export const MK_UNLOCKS = Object.freeze({
  mini_drone:   { mk: 2, unlocks: 'racing_drone' },
  racing_drone: { mk: 2, unlocks: 'cinematic_drone' },
})

// ── Рівні працівників без стелі (Стадія 10 / C) ──────────
//
// Підвищення в грі було й раніше — але рівнів було ТРИ, тобто два підвищення на
// людину за все життя. Це віха, а не трек, і густоти вона не дає.
//
// Стеля знімається, але ефект НЕ може рости лінійно: кур'єр зі швидкістю 5000
// телепортується, технік із pointMs 0 знищує міні-гру, якість більша за 1 не
// має сенсу. Тому кожна характеристика йде до асимптоти:
//
//     value(level) = to + (from − to) / (1 + k · level)
//
// Формула одна на всі осі — і на ті, що ростуть (швидкість, якість), і на ті,
// що спадають (час пайки, брак): напрямок задають `from` і `to`.
//
// `k` підібрані так, щоб відтворити ТІ САМІ числа, які були прописані руками:
// на рівні 0 збіг точний, на рівні 2 — точний або майже. Це не збіг, а
// перевірка: якщо крива не проходить через уже збалансовані точки, вона
// описує іншу гру.
export const ROLE_CURVES = Object.freeze({
  courier: { speed:      { from: 170,  to: 340,  k: 0.35 } },
  seller:  { speed:      { from: 170,  to: 340,  k: 0.35 } },
  manager: { speed:      { from: 170,  to: 340,  k: 0.35 } },
  tech: {
    speed:      { from: 170,  to: 340,  k: 0.35 },
    pointMs:    { from: 2600, to: 800,  k: 0.78 },
    quality:    { from: 0.55, to: 0.95, k: 0.50 },
    missChance: { from: 0.15, to: 0.01, k: 1.25 },
  },
})

export const roleCurveValue = ({ from, to, k }, level) =>
  to + (from - to) / (1 + k * level)

// Клас комплектів, які менеджер готовий купувати, лишається СХІДЦЯМИ, а не
// асимптотою: це не «трохи краще», а «тепер бере й дорогі». Плавна крива тут
// означала б дробовий клас, якого не існує.
export const managerTier = (level) => (level >= 2 ? 99 : level)

// Крива ціни підвищення. М'якша за стару 2.1 (два підвищення на все життя) і
// стрімкіша за 1.15 нескінченних треків: ефект від людини сильніший, а людей
// під кінець гри до семи.
export const WORKER_LEVEL_GROWTH = 1.6

// ── Оцінка темпу на картці комплекту (Стадія 10 / B4) ────
//
// Коли ні напівавтомата, ні техніка немає, паяє сам гравець — а швидкість рук
// у стані не записана. Це номінал ДЛЯ ОЦІНКИ на картці й більше ні для чого:
// сама гра ніколи його не використовує, там працює міні-гра.
export const MANUAL_POINT_MS      = 2200
export const MANUAL_POINT_QUALITY = 0.70
