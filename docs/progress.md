# Прогрес реалізації

*Живий документ. Оновлюється після валідації кожного під-етапу.*

## Робочий процес

1. Імплементуємо під-етап
2. **Ти валідуєш** (перевіряєш DoD вручну)
3. Якщо все ок → `git commit` + оновлення цього файлу
4. Якщо не ок → фіксимо, повертаємось до п.2

---

## Demo cycle — D1–D8

| Фаза | Назва | Статус | Дата коміту |
|------|-------|--------|-------------|
| D1 | UI/UX каркас | ✅ Готово | 2026-06-21 |
| D2 | Контент магазину | ✅ Готово | 2026-06-21 |
| D3 | Скарбничка | ✅ Готово | 2026-06-21 |
| D4 | Живий світ | — | — |
| D5 | Оформлення | — | — |
| D6 | Слоти + логістика | — | — |
| D7 | Прогрес локацій | — | — |
| D8 | Реклама-гачки + поліш | — | — |

---

### D3 — Скарбничка ✅

**Що зроблено:**
- `config.js` — 4 нові константи: `PIGGY_TAP_VALUE=3`, `PIGGY_DURATION_MS=8000`, `PIGGY_COOLDOWN_MS=900000` (15 хв), `PIGGY_MAX_PAYOUT=72`
- `gameState.js` — `lastPiggyAt` у `createState()`; `canOpenPiggy(state, now)` → `{can, remainingMs}`; `collectPiggy(state, taps, now)` → новий стан з грошима і таймштампом. Обидві функції чисті/immutable
- `gameState.test.js` — 9 нових тестів (доступність, кулдаун, cap, 0 тапів, immutability, remainingMs); 99 тестів зелені
- `ui/piggyModal.js` — новий файл; multi-touch міні-гра (8 сек); `pointerdown` рахує кожен контакт; анімація трясіння свинки + монетки; таймер-бар
- `scene.js` — piggy Actor у сцені (рожевий квадрат, `W*0.13`); пульс (`sin`) коли активна; dimmed (opacity 0.35) + `ex.Label` таймер над нею під час кулдауну; `onPiggyRequested` callback; `updateScene` отримує `{show, lastAt}` замість фазового bool; module-level `_piggyLastAt` для real-time тіку таймера
- `main.js` — D3.1: видалено `canAffordAfterBurn()`, перегрів тепер завжди можливий; piggyModal підключено; `showPiggy = money < minCost && IDLE`; `updateScene` отримує `{show, lastAt}`
- `ui/actionBar.js` — свинка прибрана з action bar, лишились 3 кнопки (Магазин / Поліпшення / Налаштування)
- `ui/settingsModal.js` — секція «Реальні FPV дрони» з кнопкою-посиланням на AliExpress афілейт
- `docs/plan_demo_ready.md` — D8.0 записано: поточний link + план майбутнього розділу «Збери реальний FPV»

**Відхилення від плану / рішення:**
- **Свинка — об'єкт у сцені**, не кнопка в action bar — більш занурюючий UX, тап безпосередньо по об'єкту
- **Кулдаун: 15 хв** (план рекомендував 3 хв) — щоб гравець не фармив через апгрейди
- **`PIGGY_MAX_PAYOUT = 72`** (дорівнює ціні cheapest kit) — гарантія що одна сесія завжди рятує зі stuck-стану; початковий план мав 50 (не вистачало від $0)
- **Під час кулдауну** свинка видима але dimmed + ex.Label таймер над нею — видно стан, а не просто зникла
- **`canAffordAfterBurn` прибрано** (D3.1): поломка тепер завжди можлива, що і є метою D3

---

### D2 — Контент магазину ✅

**Що зроблено:**
- `kits.js` + `config.js` — 3 нових типи дронів: `racing_drone` (6 точок, $140), `cinematic_drone` (8 точок, $260), `longrange_drone` (5 точок, $180, закритий до Гаражу)
- `upgrades.js` + `config.js` — трек `consumables` (флюс і припій): 3 рівні, `overheatMult` знижує перегрів на 30%/60%, `qualityBonus` +5% на рівні 2
- `main.js` — `handleSolderResult` застосовує `fluxData.overheatMult` і `fluxData.qualityBonus` до кожного сolder-point
- `shopModal.js` — kit cards: emoji, difficulty dots (кружечки × N точок), діапазон ціни продажу, locked-картка для `longrange_drone`
- `scripts/gen-placeholder-sprites.js` — 3 нові draw-функції (`drawRacingDrone`, `drawCinematicDrone`, `drawLongrangeDrone`) різних кольорів і форм; `public/sprites/` оновлено
- `gameState.test.js` — 12 нових тестів: повний цикл для кожного нового дрону, consumables-трек (levelData, buyUpgrade, max-level), ціновий порядок (cinema > racing > mini)
- 90 тестів зелені

**Відхилення від плану / що зроблено понад план:**
- **`KIT_CONFIGS` у `config.js`** — всі туніровані числа кіту в одному місці: `cost`, `basePrice`, `assemblySteps[]`. `kits.js` містить тільки контент (name, emoji, spriteKey, unlock). Не планувалось — додано за правилом «все у конфіг»
- **`assemblySteps` → масив об'єктів `{label, missMsg}`** — кожен крок збірки має власне повідомлення при холодній пайці (не одне глобальне «Холодна пайка — переробляємо»). Наприклад: *"Погане з'єднання ESC — переплавляємо контакт"*, *"Мотор вібрує — перетягуємо гвинти"* і т.д. Не планувалось — з'ясувалось під час рев'ю що generic-текст не валідний для різних етапів
- **`makeKit()` helper** — `solderPointCount` тепер деривується автоматично з `assemblySteps.length`, унеможливлюючи розсинхронізацію між кількістю кроків і лічильником; тест перевіряє інваріант
- **`isKitLocked()` + placeholder** — `CURRENT_LOCATION = 'apartment'` у shopModal; longrange показується як locked прямо зараз, справжнє прив'язування до стану — D7

---

## Стадія 2-bis — Top-down 2D кімната + робітник (Excalibur)

> **Розворот 2026-06-20:** складність 3D + виробництво Blender-моделей надто дорогі для соло. Ядро гри (FSM, кіти, апгрейди, save, тести) не чіпалось — міняється лише шар `src/scene/`.
> **Уточнення напряму 2026-06-20 (друге):** псевдо-ізо 3⁄4 → **top-down (PA-style) + персонаж-робітник** + interaction-driven UI (мінімальний HUD, тапи по об'єктах, кнопка-магазин). M1/M2 лишаються валідними; M3/M4-діорама (3⁄4) **переосмислюється** в T1–T4 (top-down + робітник + UI). Деталі — `archive/plan_full_game.md` §5a, §6.

| Під-етап | Назва | Статус | Дата коміту |
|----------|-------|--------|-------------|
| M1 | Excalibur in, Babylon out — порожня сцена | `scene.js`, `loader.js`, `package.json` | ✅ 2026-06-20 |
| M2 | Лоадер + spriteCache з graceful fallback | `loader.js`, `spriteCache.js`, `manifest.js` | ✅ 2026-06-20 |
| T1 | Top-down перекомпонування кімнати (без персонажа) | `scene.js` (top-down діорама) | ✅ 2026-06-20 |
| T2 | Робітник-аватар + його FSM (тап = команда, manual) | `scene/worker.js`, `scene.js`, `main.js` | ✅ 2026-06-20 |
| T3 | Interaction-driven UI: мінімальний HUD, міні-гра по тапу, заглушка магазину | `ui/`, `main.js` | ✅ 2026-06-20 |
| T4 | Авто-режим робітника через upgrade-трек | `upgrades.js`, `worker.js` | ✅ 2026-06-20 |
| M4 | Swap прямокутник↔спрайт + кадри ходьби робітника | `scene.js`, `public/sprites/` | ✅ 2026-06-20 |
| M5 | Прибирання 3D-коду + перейменування | `kits.js`, `manifest.test.js`, відаляємо modelCache/blender | ✅ 2026-06-20 |

---

## Стадія 2 — Asset pipeline 3D (СКАСОВАНО — замінено Стадією 2-bis)

*Під-етапи 2.1–2.4 виконано, але стратегія змінилась до першої реальної моделі. Весь 3D-шар (Babylon, manifest MODELS, modelCache, public/models) видалено в M5.*

---

---

## Стадія 1 — MVP «Квартира»

| Під-етап | Назва | Статус | Дата коміту |
|----------|-------|--------|-------------|
| 1.0 | Каркас і тулчейн | ✅ Готово | 2026-06-20 |
| 1.1 | Чистий стан (ядро) | ✅ Готово | 2026-06-20 |
| 1.2 | DOM-луп (текстовий прототип) | ✅ Готово | 2026-06-20 |
| 1.3 | Міні-гра паяння | ✅ Готово | 2026-06-20 |
| 1.4 | Поломка | ✅ Готово | 2026-06-20 |
| 1.5 | Дерево апгрейдів | ✅ Готово | 2026-06-20 |
| 1.6 | Збереження | ✅ Готово | 2026-06-20 |
| 1.7 | Babylon 3D + доставка коробки | ✅ Готово | 2026-06-20 |
| 1.8 | Capacitor + тест на залізі | ✅ Готово | 2026-06-20 |

---

## Нотатки по під-етапах

### M5 — 3D cleanup ✅

**Що зроблено:**
- Підтверджено: `package.json`/`package-lock.json` — нуль Babylon; `kits.js` вже має `spriteKey`; `modelCache.js`, `public/models/`, `src/assets/models/` — вже видалено раніше (M1/M2)
- `src/assets/CREDITS.md` — прибрано посилання на Blender/models, оновлено під 2D-спрайти
- Нуль файлів `.glb`/`.blend` у репо (підтверджено `find`)
- 78 тестів зелені, `npm run build` проходить

**Відхилення від плану / рішення:**
- Більшість прибирання було зроблено поступово в M1–M2; M5 зафіксував фінальний стан і очистив CREDITS
- Android-білд (`npm run android`) потребує підключеного пристрою — гейт для валідації на залізі

---

### M4 — Shaped sprites + walk animation ✅

**Що зроблено:**
- `scripts/gen-placeholder-sprites.js` — повністю переписано: RGBA PNG із прозорим фоном + реальні форми: дрон (хрест+мотори+LED), коробка (brown+tape-X), верстак (плашки+текстура), паяльник (ручка+наконечник)
- `worker_walk.png` (192×48) — 4-frame walk cycle: top-down персонаж (голова, куртка, ноги що чергуються кадр-через-кадр)
- `manifest.js` — додано запис `worker_walk`
- `worker.js` — `setupSprite(src)`: будує `SpriteSheet` → `walkAnim`/`idleAnim`, `setMoving(bool, toRight)` перемикає анімацію + `flipHorizontal` для напрямку руху
- `scene.js` — `worker.setupSprite(getSprite('worker_walk'))` одразу після `createWorker`
- Fallback незламний: відсутній файл → `null` → no-op → оранжевий прямокутник як і раніше

**Відхилення від плану / рішення:**
- Art залишається процедурним (план говорив «тимчасово — будь-який PNG») — реальні CC0-спрайти (Kenney) — наступний крок
- `flipHorizontal` при русі ліворуч/праворуч — через `actor.graphics.flipHorizontal`; для top-down без строгих 4-направлень цього достатньо
- `Animation.width/height` — read-only в Excalibur; масштаб через `anim.scale = ex.vec(sx, sy)`

---

### T4 — Авто-режим робітника ✅

**Що зроблено:**
- `WORKER_UPGRADE_COSTS = [250, 500]` у `config.js`
- `WORKER_MODE` (manual/semi/auto) + трек `worker` у `upgrades.js` — дзеркалить soldering-трек
- `workerLevel: 0` у `createState().upgrades` (`gameState.js`) — зберігається в save автоматично
- `main.js`: у `draw()` два авто-тригери: `DELIVERY` + semi/auto → `commandDeliver()`; `ASSEMBLY` + auto → `commandSolder()`. Обидва виклики ідемпотентні (FSM-гарди в worker.js)
- Shop modal підхоплює новий трек автоматично (ітерує `UPGRADE_TRACKS`)
- 8 нових тестів для worker-треку; 78 тестів зелені

**Відхилення від плану / рішення:**
- Нова FSM не потрібна — auto-режим реалізовано через виклик тих самих `commandDeliver`/`commandSolder` з `draw()`, гілкуванням за `workerMode`
- Жоден новий таймер не додано — авто-тригер вбудований у вже існуючий `draw()` цикл

---

### T3 — Interaction-driven UI ✅

**Що зроблено:**
- Прибрано постійну DOM-панель (`domUI.render` більше не викликається)
- `ROOM_H` 0.67 → 0.88 — кімната займає весь canvas (DOM-панель видалено)
- `ui/hud.js` — мінімальний HUD: гроші (зелений, top-right) + кнопка «Магазин» (top-left); підказки фаз внизу
- `ui/shopModal.js` — bottom-sheet модалка: список кітів з кнопками «Замовити», секція апгрейдів; закривається після замовлення
- `ui/solderModal.js` — bottom-sheet модалка паяння: прогрес-крапки, step-label, mini-game per point, показує burn-результат + abandon-кнопку; auto-close на READY/IDLE
- `scene.js`: `onSellRequested` — тап по столу в READY → продаж (diegetic); `initScene` отримує новий callback
- `main.js`: перейшов на нові UI-модулі; `onSolderRequested` — гілкує manual/semi/auto; `handleSolderResult` auto-finish коли всі точки зроблено; `onSellRequested` продає через тап столу
- Cold solder fix: mini-game перестворюється при `warning === 'cold'` (попередній екземпляр `running=false`)
- 70 тестів зелені

**Відхилення від плану / рішення:**
- `solderModal.open(state)` одразу рендерить вміст через `update(state, null)` — щоб вміст з'явився без `draw()` з main
- Cold solder: умова `done !== lastGameIdx || warning === 'cold'` — гарантує перестворення mini-game після провалу без просуву індексу
- READY-продаж diegetic (тап столу), а не кнопка HUD — відповідає Spirit DoD «повний цикл через тапи по світу + HUD»

---

### T2 — Робітник-аватар + FSM ✅

**Що зроблено:**
- `workerFSM.js` — pure FSM (6 станів: idle→walkDoor→pick→carry→atBench→solder), нуль Excalibur
- `workerFSM.test.js` — 8 тестів: повний цикл доставки, solder-цикл, reset з будь-якого стану, invalid no-op, predicates, immutability
- `worker.js` — Actor (оранжевий W*0.09 квадрат) + рух: `commandDeliver()` іде до дверей → пауза 250ms → несе коробку на стіл (worker+box разом); `commandSolder()` → `onSolderRequested`; `reset()` повертає на `idlePos`
- `scene.js`: workbench повертає ref; `currentPhase` на рівні модуля для gate-перевірки; box-tap → `commandDeliver`, bench-tap → `commandSolder`; `boxOpen` Actor (відкрита коробка видна в ASSEMBLY/READY); `updateScene` скидає worker на IDLE; `BENCH_POS`/`TABLE` дериваються від `workbench.pos` (object-relative)
- `main.js`: `onSolderRequested: () => {}` (no-op, T3 підключить)
- `ROOM_H`: 0.65 → 0.67 (трохи більше простору)
- 70 тестів зелені

**Відхилення від плану / рішення:**
- `workerFSM.js` + `worker.js` — два файли (аналог spriteCache+loader), щоб FSM тестувався в Node без Excalibur
- `boxOpen` — окремий Actor для "відкритої" коробки на столі; не зникає в ASSEMBLY, а перетворюється на плаский світлий прямокутник під дроном
- `BENCH_POS` = `workbench.pos.y + workbench.height/2 + WORKER_SIZE/2` — перший крок до POI-системи (object-derived waypoints); решта (`DOOR`, `IDLE_POS`) ще fractional — повна POI-система на T4+

---

### M1 + M2 + T1 — Excalibur, spriteCache, top-down кімната ✅

**Що зроблено:**
- `excalibur@0.32` встановлено; `@babylonjs/core` + `@babylonjs/loaders` видалено з `package.json`
- `scene.js` — переписано на Excalibur Actors; `colorRect` helper; top-down PA-style кімната (підлога, 4 стіни з дверним прорізом внизу, стіл, лампа)
- Кімната займає верхні 65% canvas (`ROOM_H = 0.65`) — нижче DOM-панель; усі об'єкти у видимій зоні
- `loader.js` — `ImageSource.load()` з graceful fallback (404 → `null` у кеші → rect fallback)
- `spriteCache.js` — pure-JS модуль без Excalibur-імпортів; тестується в Node без WebGL
- `manifest.js` — перейменовано `MODELS`→`SPRITES`, URL `.glb`→`.png`, якорі стали 2D-зміщеннями `{x,y}`
- `kits.js` — `modelKey`→`spriteKey`
- `scripts/gen-placeholder-sprites.js` — генератор 4 placeholder PNG (solid-color)
- `public/sprites/` — `mini_drone`, `delivery_box`, `workbench`, `soldering_iron`
- Видалено: `modelCache.js`, `loader.test.js`, `public/models/`, `src/assets/models/`
- Тести: 62, всі зелені

**Відхилення від плану / рішення:**
- `loadSprites` викликається з `initScene` (не через Excalibur `Loader`) — зберігає існуючий DOM load-overlay без змін у `main.js`
- FPS: Excalibur не має `getFps()` → обгортка `engine: { getFps: () => engine.clock.fpsSampler.fps }`
- Кімната обмежена `ROOM_H = 0.65` бо DOM-панель стартує на ~68% висоти viewport; 65% дає 23px буфера
- Excalibur Actor pointer events (`actor.on('pointerup', ...)`) дають нативний hit-test — вручну перевіряти координати не треба

---

### 1.8 — Capacitor + тест на залізі ✅

**Що зроблено:**
- `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` встановлено; Capacitor ініціалізовано (`com.fpvfactory.tycoon`)
- `android/` — нативний проєкт згенеровано і налаштовано
- `npm run android` / `make android` — повний цикл build→sync→deploy на підключений Android
- `npm run android:debug` / `make android-debug` — дебаг-білд з FPS-лічильником (зелений кут зверху-справа, оновлюється кожні 500 мс)
- Гейт пройдено: гра запускається на реальному пристрої, FPS прийнятний, повний цикл працює, збереження між запусками ✓

**Відхилення від плану / рішення:**
- FPS-лічильник реалізовано через `--mode debug` (Vite), не як окремий `?debug`-параметр — так він автоматично зникає з продакшн-білду без зміни коду
- Android Studio не потрібен — Gradle wrapper завантажується автоматично при першій збірці

---

### 1.0 — Каркас і тулчейн ✅

**Що зроблено:**
- Vite 6 + Vitest 3, скрипти `dev / build / test`
- Структура `src/state/ ui/ scene/ save/`
- `index.html`: `<canvas id="game-canvas">` + `<div id="ui-root">` (canvas під 3D, ui-root — DOM-оверлей)
- `src/main.js` — точка входу; `src/style.css` — темний фон, canvas на весь екран

**Відхилення від плану / рішення:**
- `create vite` CLI скасовувалась через наявні файли в теці → створили структуру вручну (результат ідентичний)
- Vitest одразу взяли v3 (замість v2 з roadmap), щоб закрити вразливість esbuild у dev-залежностях

### 1.7 — Babylon 3D + доставка коробки ✅

**Що зроблено:**
- `src/scene/scene.js`: low-poly кімната (підлога, 2 стіни, стіл з ніжками, лампа), коробка доставки (клікабельна, анімація льоту на стіл), X-frame дрон на столі
- Камера: Sims-like isometric (`alpha=PI/4`) — видно обидві задні стіни
- Коробка з'являється у DELIVERY, дрон — у ASSEMBLY/READY, ховаються в решті фаз
- Затримка доставки: `DELIVERY_DELAY_MS=5000` в config, авто-перехід ORDERED→DELIVERY
- Restore з ORDERED → миттєва доставка (посилка прийшла поки сторінка була закрита)
- Мобільний: bottom-sheet панель (≤640px), `touch-action:none` на canvas

**Відхилення від плану / рішення:**
- Затримка доставки додана разом з 1.7 (не була в оригінальному DoD — логічно доповнює механіку)
- Кнопка "Отримати доставку" видалена — доставка тепер автоматична

---

### 1.6 — Збереження ✅

**Що зроблено:**
- `src/save/storage.js` — `saveGame / loadGame / clearSave` обгортка над `localStorage`
- Версіонування `SAVE_VERSION = 1` — некоректна/стара версія ігнорується
- Автозбереження при кожному `update()` в `main.js`
- Відновлення при старті з merge-стратегією — нові поля дефолтів заповнюються автоматично
- `salesLog` зберігається разом зі станом

**Відхилення від плану / рішення:**
- Щоб перейти на `@capacitor/preferences` — міняється тільки `storage.js`, решта коду не чіпається

---

### 1.5 — Дерево апгрейдів ✅

**Що зроблено:**
- 4 рівні паяльника: ручний → кращий (ширша зона, −60% перегріву) → напівавтомат (1 тап/збірка, 65–85%) → автопаяльник (фоновий таймер, 55–75%)
- `buyUpgrade(state, 'soldering')` у state-модулі; купівля тільки між циклами (IDLE)
- Попередження при купівлі якщо залишиться менше ніж на комплект
- Кольорові кружечки прогресу (зелений/жовтий/червоний за якістю), видно й у READY
- Холодна пайка: ретрай + `coldSolderPenalty += 0.15` (cap на фінальну якість), скидається на початку циклу
- **Config cleanup:** всі магічні числа перенесено до `config.js`

**Відхилення від плану / рішення:**
- Гейт дизайну перевірено: ідеальна ручна → avg ~$124, автопаяльник → avg ~$100 — мотивація паяти руками зберігається ✓
- Холодна пайка змінена: штраф до якості (було: тільки ретрай без наслідків)

---

### 1.4 — Поломка ✅

**Що зроблено:**
- `Phase.BURNT` + `burnKit()` + `abandonBurntDrone(state, salvageRate)` у state-модулі
- `src/state/config.js`: `COLD_SOLDER_THRESHOLD=0.40`, `OVERHEAT_CHANCE=0.25`, `SALVAGE_RATE=0.40`
- Два результати промаху: холодна пайка (75%) — переробити точку; перегрів (25%) — `BURNT`
- **Захист від банкрутства**: overheat блокується якщо `money + salvage < kit.cost`
- Salvage при abandon: повертається 40% вартості ($28.80) — гравець може замовити знову
- Назви кроків збірки у `KIT_TYPES.assemblySteps` (раму→мотори→ESC→прошивка)

**Відхилення від плану / рішення:**
- `abandonBurntDrone` приймає `salvageRate` параметром — щоб апгрейди (1.5) могли збільшувати відшкодування
- Overheat заблокований програмно (не рандомом) коли мало грошей — гравець ніколи не застрягає назавжди

---

### 1.3 — Міні-гра паяння ✅

**Що зроблено:**
- `src/ui/solderGame.js` — повзунок по синусоїді, зелена зона, клік або Пробіл фіксує позицію
- Якість: центр зони → 1.0, край → 0.6, за зоною → 0 (плавно)
- Швидкість зростає на 12% з кожною точкою (`BASE_PERIOD × 0.88^i`)
- Фідбек: "Ідеально!" / "Добре!" / "Непогано" / "Слабко…" / "Промах!" з кольором, 500ms пауза
- `Math.random()` замінено реальною механікою

**Відхилення від плану / рішення:**
- `DEFAULT_GREEN_HALF` експортується — щоб система апгрейдів (1.5) могла розширювати зону без зміни логіки гри
- Синусоїда замість лінійного ping-pong — природне сповільнення на краях, ефект "пружини"

---

### 1.2 — DOM-луп ✅

**Що зроблено:**
- `src/ui/domUI.js` — render-функція, панель через innerHTML, кнопки прив'язані до FSM-переходів
- `src/main.js` — тримає стан, передає handlers у UI, логує продажі
- Кнопки видно тільки у відповідній фазі; "Замовити" дизейблиться при нестачі грошей
- Точки пайки — кружечки, заповнюються по одному
- Лог 6 останніх продажів з кольором якості
- Якість = `Math.random()` (заглушка до 1.3)

**Відхилення від плану / рішення:**
- Немає — реалізовано точно по DoD

---

### 1.1 — Чистий стан (ядро) ✅

**Що зроблено:**
- `src/state/gameState.js` — pure JS модуль, нуль залежностей від DOM/Babylon
- FSM: `IDLE → ORDERED → DELIVERY → ASSEMBLY → READY → IDLE`
- 6 функцій: `orderKit / receiveDelivery / startAssembly / recordSolderPoint / finishAssembly / sell`
- Формула ціни з GDD: `ціна = база × (0.6 + 0.7 × якість) × множник_прокачки`
- Стан незмінний (кожна функція повертає новий об'єкт)
- `src/state/gameState.test.js` — 22 тести: повний цикл, граничні значення, відхилення невалідних FSM-переходів, immutability
- Економіка: ідеальна пайка +$51.50, нульова −$15 (маржа має вагу)

**Відхилення від плану / рішення:**
- Додано окремі тести на immutability (не було в DoD, але критично для майбутнього збереження стану)
- `priceMultiplier` у `state.upgrades` замість окремого аргументу — щоб збереження стану містило все в одному об'єкті

---

---

### D1 — UI/UX каркас ✅

**Що зроблено:**
- `ui/actionBar.js` — фіксована нижня панель з кнопками Магазин / Поліпшення / Налаштування (≥52px, `env(safe-area-inset-bottom)`)
- `ui/upgradeModal.js` — окрема модалка для всіх апгрейд-треків (вилучено з shopModal)
- `ui/settingsModal.js` — попап Налаштувань: тоглери Звук/Гаптика (persist у `fpv_settings`), версія, «Скинути збереження» з підтвердженням
- `ui/hud.js` — кнопку Магазин прибрано; гроші перенесено по центру зверху, шрифт Fredoka One (2rem)
- `ui/shopModal.js` — залишено тільки секцію кітів
- `ui/solderGame.js` — тап-слухач перенесено на `tapArea` (весь `document`); тап будь-де на екрані фіксує повзунок
- `style.css` — `@font-face` Fredoka One (woff2, офлайн), модалки по центру (`align-items: center`, `border-radius: 16px`), action bar стилі, toggle-компонент
- `scene.js` — `DisplayMode.FillScreen`, динамічний `camera.zoom = clamp(H/980, 0.78, 0.90)` (менший екран → більше відходить)
- `worker.js` + `scene.js` — персонаж збільшено x2 (`W*0.09 → W*0.18`)
- `src/assets/fonts/FredokaOne-Regular.woff2` — bundled, OFL 1.1, Milena Brandão; занесено в CREDITS.md
- Видалено мертвий `ui/domUI.js`
- `@fontsource/fredoka-one` встановлено лише для копіювання файлу, потім видалено з залежностей
- 78 тестів зелені

**Відхилення від плану / рішення:**
- D1.6 «тап усього поля гри» розширено до `document` (замість `#solder-body`) — тап де завгодно на екрані
- Canvas обмежено game-area (`#ui-root height: calc(100dvh - 68px)`, action bar `position: fixed`) щоб уникнути перекриття
- Динамічний зум замість фіксованого — додано одразу за фідбеком тестування на SE; константи `CAMERA_ZOOM_*` у `config.js`

---

## Загальні рішення і нові фічі

*Рішення, що стосуються кількох під-етапів або всього проєкту.*

- **2026-06-20** — у `KIT_TYPES` додано `assemblySteps[]` — масив назв кроків збірки для кожної точки пайки. Новий тип дрону = новий масив кроків. Ідея для майбутнього: після `finishAssembly` додати етап **тест-польоту** (анімована затримка 2–3с) перед тим як показувати фінальну якість і кнопку продажу — додає напругу і правдоподібність.
- **2026-06-20** — всі ігрові параметри, які можуть потребувати балансування, мають жити в `src/state/config.js` або у відповідному конфіг-об'єкті, а **не** як магічні числа прямо в коді. Це стосується: стартових грошей, вартості комплектів, параметрів міні-гри (швидкість, зелена зона), коефіцієнтів формули ціни, порогів поломки. Коли додаємо новий числовий параметр — одразу виносимо в конфіг. Поточний технічний борг: `money: 120` у `createState()`, `0.6`/`0.7` у `calcPrice`, `BASE_PERIOD_MS`/`SPEED_FACTOR` у `solderGame.js` — перенести до `config.js` під час наступного рефакторингу або перед 1.5.
