# Прогрес реалізації

*Живий документ. Оновлюється після кожного під-етапу.*

## Робочий процес

*Оновлено 2026-07-25: більше не чекаємо на валідацію перед комітом.*
*Оновлено 2026-07-29: нотатки пишемо у файл стадії, а не в цей.*

1. Імплементуємо під-етап
2. Прогін перевірок: `npx vitest run`, `npm run build`, для рантайму — `npm run smoke`
3. `git commit` одразу + нотатка в `docs/progress/<стадія>.md` (**інсайти**, не список
   файлів: рішення, відхилення від плану, знайдені по ходу баги)
4. Йдемо далі; ти валідуєш на залізі коли зручно — фікси йдуть окремими комітами

Нова стадія: план у `docs/plans/`, факти — новий файл у `docs/progress/` і рядок у
таблиці нижче. Закрилась — план переїжджає в `docs/plans/done/`, а розділ «Що зараз»
називає наступну.

---

## Що зараз

**Активна стадія — 6 «Як це виглядає»** ([план](plans/stage6_visual.md)).
Закриті V1–V5; лишився V6 — перевірка плитки підлоги на телефоні
([факти](progress/stage6_visual.md)).

**Чекає валідації на залізі.** Дві останні стадії зроблені й закомічені, але на
пристрої не перевірені — це найдешевша річ, яку варто зробити наступною:

- **Стадія 11**: чи не гринд норма збірок на Mk (`MK_BUILD_REQ = [3, 6, 10, 15,
  25]`); чи читається секція «Ваші люди» на дошці як те саме місце, де наймають;
  чи не забагато «продай N / збери N» підряд у 42 кроках ланцюга.
- **Стадія 10**: баланс нескінченних треків і Mk — числа підбирались за столом.

---

## Де що лежить

Цей файл — **живий**: робочий процес, що активне, що чекає перевірки. Факти по
закритих стадіях переїхали в `docs/progress/` по файлу на стадію: інакше кожна
нова стадія дописувалась у простиню на 2500 рядків, у якій активне й давно
закрите лежали поруч і однаково важили.

Плани — окремо від фактів: `docs/plans/` — те, що ще веде роботу,
`docs/plans/done/` — виконане й архівне. **План** каже, що робити; **прогрес** —
що з цього вийшло. Не дублюємо.

| Стадія | Факти | План |
|--------|-------|------|
| 11 — «Ланцюг відкриває гру» | [progress/stage11_gating.md](progress/stage11_gating.md) | [plans/done/stage11_gating.md](plans/done/stage11_gating.md) |
| 10 — «Густий прогрес» | [progress/stage10_progression.md](progress/stage10_progression.md) | [plans/done/stage10_progression.md](plans/done/stage10_progression.md) |
| 9 — «Один шлях» | [progress/stage9_questline.md](progress/stage9_questline.md) | [plans/done/stage9_questline.md](plans/done/stage9_questline.md) |
| 8 — «Куди я йду» | [progress/stage8_progress.md](progress/stage8_progress.md) | [plans/done/stage8_progress.md](plans/done/stage8_progress.md) |
| 7 — «Як це звучить» | [progress/stage7_audio.md](progress/stage7_audio.md) | [plans/done/stage7_audio.md](plans/done/stage7_audio.md) |
| 6 — «Як це виглядає» 🟡 | [progress/stage6_visual.md](progress/stage6_visual.md) | [plans/stage6_visual.md](plans/stage6_visual.md) |
| 5 — «Фабрика» | [progress/stage5_factory.md](progress/stage5_factory.md) | [plans/done/stage5_factory.md](plans/done/stage5_factory.md) |
| 4 — «Цех як тайкун» | [progress/stage4_tycoon.md](progress/stage4_tycoon.md) | [plans/done/stage4_tycoon.md](plans/done/stage4_tycoon.md) |
| 3 — «Живий цех» | [progress/stage3_character.md](progress/stage3_character.md) | [plans/done/stage3_character_mode.md](plans/done/stage3_character_mode.md) |
| Demo cycle D1–D8 | [progress/demo_d1_d8.md](progress/demo_d1_d8.md) | [plans/done/demo_ready.md](plans/done/demo_ready.md) |
| 1, 2, 2-bis — MVP і розворот 3D→2D | [progress/early_stages.md](progress/early_stages.md) | [plans/done/full_game.md](plans/done/full_game.md), [roadmap](plans/done/roadmap_mvp_stage1.md) |

Решта документів: [GDD](GDD_drone_factory.md) — гейм-дизайн,
[asset_specs.md](asset_specs.md) — вимоги до арту,
[architecture_review.md](architecture_review.md) — огляд коду.

---

## Загальні рішення і нові фічі

*Рішення, що стосуються кількох під-етапів або всього проєкту.*

- **2026-06-20** — у `KIT_TYPES` додано `assemblySteps[]` — масив назв кроків збірки для кожної точки пайки. Новий тип дрону = новий масив кроків. Ідея для майбутнього: після `finishAssembly` додати етап **тест-польоту** (анімована затримка 2–3с) перед тим як показувати фінальну якість і кнопку продажу — додає напругу і правдоподібність.
- **2026-06-20** — всі ігрові параметри, які можуть потребувати балансування, мають жити в `src/state/config.js` або у відповідному конфіг-об'єкті, а **не** як магічні числа прямо в коді. Це стосується: стартових грошей, вартості комплектів, параметрів міні-гри (швидкість, зелена зона), коефіцієнтів формули ціни, порогів поломки. Коли додаємо новий числовий параметр — одразу виносимо в конфіг. Поточний технічний борг: `money: 120` у `createState()`, `0.6`/`0.7` у `calcPrice`, `BASE_PERIOD_MS`/`SPEED_FACTOR` у `solderGame.js` — перенести до `config.js` під час наступного рефакторингу або перед 1.5.
