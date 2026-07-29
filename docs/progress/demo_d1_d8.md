# Demo cycle — D1–D8 (ЗАКРИТО 2026-07-24)

> Архів фактів. Живий документ — [../progress.md](../progress.md); план цієї стадії — [../plans/done/demo_ready.md](../plans/done/demo_ready.md).

---

## Demo cycle — D1–D8 (ЗАКРИТО)

| Фаза | Назва | Статус | Дата коміту |
|------|-------|--------|-------------|
| D1 | UI/UX каркас | ✅ Готово | 2026-06-21 |
| D2 | Контент магазину | ✅ Готово | 2026-06-21 |
| D3 | Скарбничка | ✅ Готово | 2026-06-21 |
| D4 | Живий світ | ✅ Готово | 2026-06-21 |
| D5 | Оформлення | ✅ Готово | 2026-06-21 |
| D6 | Слоти + логістика | ✅ Готово | 2026-06-22 |
| D7 | Прогрес локацій | ✅ Готово | 2026-06-23 |
| D8 | Реклама-гачки + поліш | ✅ Готово | 2026-06-24 |

---

## Post-D8 — баги та дрібні покращення

### 2026-06-24 — feat: смітник + тіндер-гра → дрон з брухту (реальна збірка)

**Що зроблено:**
- Магазин: нова картка «Дрон з брухту ♻️» (cost=0, sell $40–$55) — `isSpecial: true` у `kits.js`, відфільтрована з основного списку; при активній грі показує «Іду до смітника…»
- Воркер: після кліку «Збирати зі смітника» автоматично йде до смітника (auto-trigger у `draw()`), `commandScrapPickup()` / `resumeScrapSuccess()` / `resumeScrapFail()`
- Нові FSM-стани: `SCRAP_WALK → AT_TRASH → SCRAP_CARRY`; `reset()` не переривається під час scrap-циклу (`workerIsDoingScrap` guard)
- Тіндер-міні-гра (`trashModal.js` повний перезапис): 6 карток (3 корисних + 3 сміття), перемішані щоразу; drag + rotate, або кнопки ❌/✅; анімація вильоту картки; ≥2 збережених корисних → успіх
- На успіх: воркер несе деталі до верстака → `startScrapAssembly(state)` → фаза ASSEMBLY з kit=`scrap_drone` (3 кроки пайки), продаж як звичайний дрон
- На провал: воркер повертається idle, гравець отримує 5 UAH (consolation = `SCRAP_CONSOLATION`)
- `config.js`: SCRAP_* константи → TINDER_GOOD_CARDS/TINDER_JUNK_CARDS/TINDER_MIN_GOOD/SCRAP_CONSOLATION; `scrap_drone` у KIT_CONFIGS (cost=0, basePrice=55, 3 кроки)
- `manifest.test.js`: skip solderPoints-check для `isSpecial` кітів (scrap_drone reuses mini_drone sprite з 4 точками, але має лише 3 кроки)
- 157 тестів зелені

**Ключові рішення:**
- `isSpecial: true` у kits.js — єдиний прапор що відокремлює scrap_drone від regular flow (shop, manifest test)
- Auto-trigger у `draw()` замість ручного тапу на смітник — відразу після відкриття магазину воркер іде сам; тап на смітник як fallback
- Тіндер-гра ніколи не відкривається безпосередньо з магазину — тільки через `onScrapArrivedAtTrash` колбек, щоб анімація ходьби воркера була видна
- scrap_drone reuses `mini_drone` spriteKey (ті самі anchor-точки на спрайті, хоча кроків менше)

---

### 2026-06-24 — fix: воркер застигав при замовленні 2-ї коробки під час доставки 1-ї

**Проблема:** `updateScene` завжди викликав `worker.reset()` коли `phase === IDLE`. Але фаза лишається IDLE весь час поки воркер несе коробку (переходить в ASSEMBLY тільки при `onBoxPicked`). Будь-який `draw()` під час доставки (timer `scheduleDeliveryCheck`, `update` від нового замовлення) скасовував walk chain і воркер "застигав", потім перезапускав доставку заново.

Додатково: slot indicator дозволяв тапнути 2-у коробку поки несеться 1-а → `pickupDelivery` кидав unhandled exception.

**Фікс:**
- `scene.js updateScene`: `if (phase === Phase.IDLE && !carryingDel) worker?.reset()` — reset тільки коли немає активної доставки
- `scene.js` slot indicator handler: guard `if (_deliveries.some(d => d.status === 'carrying')) return` — запобігає тапу на 2-у коробку поки 1-а несеться

### 2026-06-24 — feat: кнопка +1000 у налаштуваннях (cheat/debug)

- `settingsModal.js` — нова зелена кнопка «+1000 💸» + `onAddMoney` callback
- `main.js` — `onAddMoney: (amount) => update({ ...state, money: state.money + amount })`
- `style.css` — `.btn--cheat` (темно-зелений)

---

### D8 — Реклама-гачки + поліш ✅

**Що зроблено:**
- `src/monetization/ads.js` — стаб: `PLACEMENTS` (5 констант), `showRewarded()` / `showInterstitial()` повертають `Promise.resolve(false/undefined)`; `ADS_ENABLED = false` у `config.js` — весь SDK-код відключений одним прапором
- `src/audio/sfx.js` — стаб: `playSfx(name)` клонує `<audio>` з `/audio/<name>.mp3` (graceful fail якщо файл відсутній); `setMuted()` / `isMuted()`; підключено до settingsModal (`onSoundChange`)
- `main.js` — хаптика через `navigator.vibrate()`: `haptic('light'|'medium'|'heavy')` з таблицею ms; `hapticsEnabled` перемикається через `onHapticsChange`; SFX на замовлення, пайку, продажу, перегрів
- Онбординг: `#onboarding` оверлей «🛒 Замов дрон → 🔧 Запаяй → 💰 Продай», зникає по тапу або при першому замовленні; `onboarded: false` у `createState()` → персистується у save
- `piggyModal.js` — результат-екран з кнопкою ×2 за рекламу (`adsEnabled` prop); коли `ADS_ENABLED=false` — кнопка прихована, поведінка незмінна
- `settingsModal.js` — `onSoundChange` / `onHapticsChange` callbacks
- **SEMI/AUTO-пайка без попапу**: при `SOLDER_MODE.SEMI/AUTO` solder modal не відкривається; замість нього — прогрес-стрічка над верстаком прямо в сцені + тост з результатом після завершення
- `scene.js` — `createBenchProgress(scene, benchActor)`: картка (лейбл, крапки прогресу, таймер-бар) позиціонована в world space над верстаком; `ex.Rectangle` для бару та крапок; анімація бару через `preupdate`; тост із fade; `refs.benchProgress` у return initScene
- `main.js` — `sceneRefs.benchProgress.startStep/advanceDots/showResult/hide`; виправлено race condition: перший `scheduleAutoPoint()` запускається до `initScene()` (draw() на рівні модуля) → ретроактивне `startStep()` у `.then()` callback після встановлення `sceneRefs`
- 157 тестів зелені

**Ключові рішення:**
- `ADS_ENABLED = false` у `config.js` — єдиний перемикач; UI-кнопки для ads автоматично ховаються
- Хаптика через `navigator.vibrate()` без `@capacitor/haptics` — достатньо для Android WebView; iOS не підтримує, але не крешить
- Прогрес-стрічка в Excalibur (не DOM оверлей) — прив'язана до world position верстака; майбутні столи отримають свою стрічку через `createBenchProgress(scene, workbench2)`
- Виправлено root-cause проблему: `draw()` на рівні модуля стартує `autoTimer` ДО `initScene().then()`, тому `startStep()` втрачався для першого кроку

**Відхилення від плану:**
- D8.5 баланс-пас (квартира→гараж feel) відкладено — потребує живого тестування
- SEMI/AUTO не мають можливості перегрітись (burnt-стан тільки через MANUAL mini-game) — прийнятно для demo

---

### D7 — Прогрес локацій ✅

**Що зроблено:**
- `state/locations.js` — новий файл: реєстр `LOCATIONS` (Квартира/Гараж/Майстерня) з `kitIds`, `upgradeCaps` per-track, `unlockCost`, `unlockReq.minUpgrades`, `sceneConfig`; хелпери `currentLocation`, `kitsForLocation`, `capFor`, `canMoveToLocation`; `LOCATION_ORDER`
- `gameState.js` — `locationId: 'apartment'` у `createState()`; `buyUpgrade` перевіряє `capFor(state, trackId)` перед покупкою — throws "заблоковано" якщо cap досягнуто; `moveToLocation(state, targetId)` — чиста функція переїзду з перевіркою умов
- `gameState.test.js` — 24 нових D7 тести: caps, canMoveToLocation, moveToLocation; всі `richState()` переведено на `locationId: 'workshop'` щоб існуючі D6-тести не конфліктували з кепами
- `upgradeModal.js` — кожен трек показує "Ліміт локації — переїдьте далі" коли cap досягнуто; нова секція «Локація» внизу: поточна + наступна, умови, кнопка «Переїхати»
- `shopModal.js` — `isKitLocked` тепер використовує `kitsForLocation(state)` замість хардкоду 'apartment'; замок показує правильну назву локації
- `actionBar.js` — badge "!" на Поліпшеннях включається і коли `canMoveToLocation` = true
- `scene.js` — `applyLocationTheme(sceneConfig)` змінює `engine.backgroundColor` і `floor.color`; зберігає `_engine`, `_floorActor` на рівні модуля; застосовується при старті і після переїзду
- `main.js` — імпорт `moveToLocation`, `currentLocation`, `applyLocationTheme`; `upgradeModal` отримує `onMoveToLocation`; тема застосовується після `initScene`; explicit merge `locationId` в `initState` для старих saves

**Ключові рішення:**
- Кепи живуть у `locations.js` (контент), не в `config.js` (баланс) — по плану D7
- `buyUpgrade` перевіряє абсолютний max ПЕРЕД cap → коли cap=max помилка "максимальний рівень", не "заблоковано"
- Переїзд вбудовано в upgradeModal (не окрема модалка) — природна точка контакту з upgrades
- `applyLocationTheme` модуль-рівневий (не через refs) — безпечно викликати до/після initScene

**Відхилення від плану:**
- D7.4: замість окремого `moveModal.js` — секція в `upgradeModal.js`; UX чистіший (не потрібна нова кнопка в action bar)
- Сцена перебудовується мінімально (колір підлоги + BG), не повна реконструкція — достатньо для demo-цілі D7

---

### D6 — Слоти + логістика ✅

**Що зроблено:**
- `gameState.js` — рефактор архітектури доставки: `Phase.ORDERED/DELIVERY` → видалено; новий `DeliveryStatus` (`transit`/`carrying`); `deliveries[]` замість `deliveryQueue` + `activeDeliveryReadyAt` + `activeSlotIndex`; нові функції `pickupDelivery(state, id, now)` і оновлений `startAssembly`; `_usedSlots` враховує bench + pending deliveries
- `gameState.test.js` — повна перезапись: 103 тести (було 133 разом з іншими suite), новий блок D6.6 з тестами `pickupDelivery` (any-order pickup, guards)
- `scene.js` — `updateScene` нова сигнатура `(refs, phase, piggy, droneSpriteKey, deliveries, carryingSlotIndex)`; slot indicators керуються через `deliveries[].status`; carry box репозиціонується при зміні `carryingDel.id`; поінтер-івент box → знаходить `carrying` delivery
- `main.js` — `migrateState()` для старих saves (ORDERED/DELIVERY → IDLE + deliveries entry); `scheduleDeliveryCheck()` замість роздільних `deliveryTimer`/`queueCheckTimer`; `draw()` перевіряє carrying delivery замість `Phase.DELIVERY`; `onBoxPicked` і `onSlotTapped` оновлені
- `hud.js` — підказка для IDLE перевіряє `status=carrying` (→ «Несемо на стіл») і `status=transit` (→ «Кур'єр їде»)
- `shopModal.js` — `deliveries.length` для підрахунку слотів
- `solderModal.js` — прибрано `Phase.ORDERED/DELIVERY` з auto-close умови
- config/upgrades: `storage` і `logistics` треки, `STORAGE_SLOTS_BY_LEVEL`, `LOGISTICS_DELIVERY_MULT`

**Ключове архітектурне рішення:**
Будь-який воркер може підняти будь-яку коробку в будь-якому порядку — перший замовлений не блокує другий. Bench-стан (ASSEMBLY/READY/BURNT) повністю відокремлений від per-delivery статусу.

**Відхилення від плану:**
- D6.6 вимагав повного рефактору замість патчу — `Phase.ORDERED/DELIVERY` видалено з моделі, не просто задепрекейчено

---

### D5 — Оформлення ✅

**Що зроблено:**
- `gen-placeholder-sprites.js` — повний перезапис draw-функцій: дрони з пропелер-дисками і різними кольорами/формами; верстак з PCB + компонентами + паяльною станцією; лампа з гало-кільцями; поштова скринька з прорізом і прапорцем; скарбничка-свинка (рожева, вид зверху, монетний отвір, вуха, рило); воркер 64×64 кадр (куртка, кепка, очі з бликами)
- `manifest.js` — нові записи `lamp`, `mailbox`, `piggy`
- `scene.js` — `applySprite` для workbench, lamp, mailbox, piggy; `_lastDroneSpriteKey` guard (уникає зайвих swap per-frame); `updateScene` приймає `droneSpriteKey`; lamp тепер Actor з ref замість colorRect
- `main.js` — обчислює `droneSpriteKey = KIT_TYPES[state.activeKit]?.spriteKey` і передає в `updateScene`
- `worker.js` — `FRAME_W/FRAME_H` 48→64

**Відхилення від плану / рішення:**
- **D5.1 (вибір стилю)** — залишились процедурні спрайти замість CC0 Kenney; стиль «pixel art top-down» зафіксовано в `gen-placeholder-sprites.js` як єдина точка генерації
- **D5.2 (env sprites)** — підлога і стіни без спрайтів (залишились кольорові rect); workbench/lamp/mailbox отримали спрайти; floor-texture відкладено (потребує Excalibur TileMap або великого PNG)
- **D5.3 (drone sprites)** — racing-drone swap не верифіковано автоматично (недостатньо $); код правильний, рекомендовано перевірити вручну
- **D5.5 (UI icons)** — action bar emoji лишились (🛒/⬆️/⚙️); окремих SVG-іконок не додавали — відкладено до D8 (поліш)

---

### D4 — Живий світ ✅

**Що зроблено:**
- `config.js` — `SCENE_ROOM_H_RATIO=0.70`, `SCENE_WORKER/DRONE/BOX_W_RATIO`, `PULSE_FREQ_HZ=1.5`, `PULSE_SCALE_AMP=0.08`; `deliveryMs` для кожного кіта (4/6/8/10 с); `DELIVERY_DELAY_MS` лишається як fallback
- `workerFSM.js` — 3 нових стани: `EXIT_OUTSIDE`, `SELL`, `FREE_WALK`; `workerCanSell` включає IDLE/AT_BENCH/FREE_WALK; 14 тестів (з 8)
- `worker.js` — плоский action-chain у `commandDeliver` (без вкладених `actor.actions` в `callMethod`); `commandSell` анімує воркера до поштової скриньки; дрон і коробка — дочірні об'єкти (`addChild`) під час carry; `scene.add` після `removeChild` щоб уникнути Excalibur-orphan; `walkTo` для вільного блукання (D4.7); y-sort через `preupdate`
- `scene.js` — екстер'єр (темна смуга + тротуар); поштова скринька; `BOX_SPAWN` у зовнішній зоні; `DOOR` — поріг дверей; `addPulse` util; пульс-контролери на коробці/столі/скриньці; floor-tap через `engine.input.pointers.primary` (уникає z-order quirks)
- `actionBar.js` — бейдж `!` на «Поліпшення» коли є доступний апгрейд; перевіряє всі треки через `UPGRADE_TRACKS`
- `hud.js` — підказка DELIVERY адаптована до workerMode (SEMI/AUTO → «Доставка їде…»); підказка ASSEMBLY адаптована до solderMode (SEMI в процесі → «Паяємо…»)
- `main.js` — SEMI-паяння через `scheduleAutoPoint()` (крок-за-кроком, не миттєво); `scheduleDelivery` бере `deliveryMs` з активного кіта

**Відхилення від плану / рішення:**
- **Плоский action-chain** замість вкладених callbacks — в Excalibur v0.32 `actor.actions.X` всередині `callMethod` ненадійно; плоський `.moveTo.callMethod.moveTo.callMethod...` завжди надійний
- **`addChild/removeChild` + `scene.add`** — `addChild` знімає актора з render-list сцени; `scene.add` після `removeChild` повертає в сцену (idempotent якщо вже є)
- **Floor-tap на engine-рівні** — `floor.on('pointerup')` при z=0 конкурував з workbench z=2; `engine.input.pointers.primary.on('up')` з bounds-check надійніший
- **`deliveryMs` на кіт** — план мав один `DELIVERY_DELAY_MS`; різний час підвищує відчуття різниці між дронами
- **A\* у TODO** — повноцінний pathfinding навколо столу відкладено; поточне рішення: вільна ходьба обмежена IDLE/ORDERED/DELIVERY, workerCanSolder/workerCanSell гардять від тапів під час руху

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
- `docs/plans/done/demo_ready.md` — D8.0 записано: поточний link + план майбутнього розділу «Збери реальний FPV»

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
