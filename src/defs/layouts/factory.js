// The factory floor — a layout assembled from the rooms that are open (F2, К1).
//
// Every other location is one room, written out once. The factory is the last
// location, so it grows instead of being left behind: buying a room widens the
// world rather than replacing it.
//
// Стадія 14 / К1 змінила тут дві речі й жодної третьої:
//
//   1. Кімната має ТИП (`kind`). Три наявні цехи — `assembly`, і це рівно те,
//      чим вони були. Тип вирішує, чим кімната вмебльована: свій набір
//      верстатів, зон і декору на `kind`, а не ланцюг `if` по id.
//   2. Кімнати стоять СІТКОЮ, не рядком. Три цехи по 1700 — це 5100 юнітів
//      завширшки; сьома кімната зробила б світ довшим за 10 000, і камера це
//      витримає, а гравець ні. Коли ряд добігає `ROW_MAX_W`, наступна кімната
//      лягає в другий ряд НАД першим, з прорізом між рядами за тим самим
//      правилом, що вже тримає прорізи між цехами.
//
// The contract that makes this cheap is untouched (К1.3): buildFactoryLayout
// returns EXACTLY the object buildLayout returns. Obstacles, zones, nav grid,
// camera bounds and the scene all consume a layout and none of them learns what
// a room is — the same discipline that let C7 turn a move into a rebuild
// instead of a special case.

import { rect, partitionRects, SIZES, WALL_SIDE, WALL_HORIZ } from './buildLayout.js'
import { u, ENDLESS_CAP_HALL, MK_CAP_HALL } from '../../state/config.js'

// ── Типи кімнат (К1.1) ────────────────────────────────────
//
// Габарити живуть ТУТ, а не в кожному записі кімнати: «лабораторія вужча за
// цех» — властивість типу, і два записи одного типу не мають права розійтись у
// розмірі. Запис кімнати може перекрити `w`/`h`, але за замовчуванням не
// перекриває нічого.
export const HALL_KINDS = Object.freeze({
  assembly:  { w: 1700, h: 1400 },
  lab:       { w: 1200, h: 1200 },
  contracts: { w: 1200, h: 1200 },
  flight:    { w: 2000, h: 1500 },
  storage:   { w: 1200, h: 1200 },
})

export const hallKind = (hall) => HALL_KINDS[hall.kind] ?? HALL_KINDS.assembly
export const hallW = (hall) => hall.w ?? hallKind(hall).w
export const hallH = (hall) => hall.h ?? hallKind(hall).h

// A hall is a slice of floor with its own benches and its own payroll.
//
// Widths are equal on purpose: an unequal hall reads as "you got a worse one"
// rather than "you got more". Cost is what makes the third one an ambition.
// One hall is already wider than the whole garage — arriving has to feel like
// arriving somewhere, before a single hall is bought.
// Стелі нескінченних треків — однакові для всіх чотирьох: вони й задумані як
// один спільний темп, а не як чотири окремі прогресії.
const endlessCaps = (cap) => ({ reputation: cap, bulk: cap, tooling: cap, courier: cap })

export const FACTORY_HALLS = Object.freeze([
  {
    id: 'hall-1',
    kind: 'assembly',
    name: 'Цех 1',
    benches: 2,
    // Per hall, not per factory: opening a hall is what buys the headcount to
    // run it. Summed over open halls in roleCapHere().
    workerCaps: { courier: 1, tech: 1, seller: 1, manager: 1 },
    cost: 0,
    // Стеля нескінченних треків росте з цехами (Стадія 10 / A3).
    upgradeCaps: endlessCaps(ENDLESS_CAP_HALL[0]),
    mkCap: MK_CAP_HALL[0],

  },
  {
    id: 'hall-2',
    kind: 'assembly',
    name: 'Цех 2',
    benches: 2,
    // No second manager: one is enough to keep the whole factory ordering, and
    // a second would only race the first to the same laptop.
    workerCaps: { courier: 1, tech: 1, seller: 1, manager: 0 },
    cost: 2400,
    // Стеля нескінченних треків росте з цехами (Стадія 10 / A3).
    upgradeCaps: endlessCaps(ENDLESS_CAP_HALL[1]),
    mkCap: MK_CAP_HALL[1],

    // Те саме, що й у кімнат квартири (Стадія 9 / Р4): відкрита одиниця
    // простору сама розповідає, що з нею приїхало.
    unlocks: [
      '🔧 Два верстаки',
      "🧑‍🔧 Три вакансії: кур'єр, технік, продавець",
      '📦 Свій приймальний ящик — замовлення їдуть сюди',
    ],
  },
  {
    id: 'hall-3',
    kind: 'assembly',
    name: 'Цех 3',
    benches: 2,
    workerCaps: { courier: 1, tech: 1, seller: 1, manager: 0 },
    cost: 6800,
    // Стеля нескінченних треків росте з цехами (Стадія 10 / A3).
    upgradeCaps: endlessCaps(ENDLESS_CAP_HALL[2]),
    mkCap: MK_CAP_HALL[2],

    unlocks: [
      '🔧 Два верстаки',
      "🧑‍🔧 Три вакансії: кур'єр, технік, продавець",
      '📦 Свій приймальний ящик — замовлення їдуть сюди',
    ],
  },
])

export const FACTORY_HALL_IDS = FACTORY_HALLS.map(h => h.id)
export const FIRST_HALL_ID    = FACTORY_HALLS[0].id

export function hallDef(hallId) {
  return FACTORY_HALLS.find(h => h.id === hallId) ?? null
}

// Halls always open in order, so "which are open" is really "how many".
// Normalising here means a save cannot describe hall-3 open with hall-2 shut.
export function openHalls(hallIds) {
  const count = Math.max(1, Math.min(FACTORY_HALLS.length, (hallIds ?? []).length))
  return FACTORY_HALLS.slice(0, count)
}

// Кімнати одного типу серед відкритих. Це те питання, яке ставлять усі
// споживачі типу: «чи є вже лабораторія», «в які цехи можна везти коробку».
export const hallsOfKind = (hallIds, kind) => openHalls(hallIds).filter(h => h.kind === kind)
export const hasHallKind = (hallIds, kind) => hallsOfKind(hallIds, kind).length > 0

const STREET_H   = 500
const DOOR_W     = 240      // street door, in hall 1
const HALL_GAP_H = 260      // doorway between two halls in the same row
const ROW_GAP_W  = 300      // proriz between two rows
// Скільки юнітів ряд має право з'їсти, перш ніж наступна кімната піде нагору.
// 5100 = рівно три цехи: це число тримає ТРИ НАЯВНІ ЦЕХИ в одному ряду, тобто
// робить К1 нейтральним для всього, що вже куплено.
const ROW_MAX_W  = 5100

const THEME = {
  bgColor:       '#2c1e2c',
  floorColor:    '#544254',
  wallColor:     '#7a6480',
  streetColor:   '#302430',
  pavementColor: '#463646',
  wallColor:     '#55526e',
  wallEdge:      '#6b7284',
  wallShadow:    '#242232',
  doorColor:     '#7a5533',
  floorTile:     'tile_concrete',
  streetTile:    'tile_asphalt',
}

// ── Розкладка кімнат по рядах (К1.2) ──────────────────────
//
// Жадібна пакувалка: кімнати лягають у порядку відкриття, ряд закривається,
// коли наступна в нього не влазить. Порядок несучий — кімната ніколи не
// «перестрибує» в інший ряд від того, що купили щось після неї.
//
// Ряд 0 — НИЖНІЙ: у ньому двері на вулицю. Наступні ряди ростуть угору.
export function packRows(halls, maxW = ROW_MAX_W) {
  const rows = []
  let row = null
  for (const hall of halls) {
    const w = hallW(hall)
    if (!row || row.w + w > maxW) {
      row = { halls: [], w: 0, h: 0 }
      rows.push(row)
    }
    row.halls.push(hall)
    row.w += w
    row.h = Math.max(row.h, hallH(hall))
  }
  return rows
}

// Кімнати з абсолютними координатами: x0/y0 — лівий верхній кут кімнати,
// cx/cy — центр. Усе меблювання нижче пишеться в ЛОКАЛЬНИХ координатах
// кімнати й зсувається рівно тут, один раз.
function placeHalls(halls) {
  const rows   = packRows(halls)
  const worldW = Math.max(...rows.map(r => r.w))
  const roomH  = rows.reduce((sum, r) => sum + r.h, 0)

  // Ряд 0 стоїть внизу, біля вулиці; кожен наступний — над ним.
  let bottom = roomH
  const placed = []
  rows.forEach((row, rowIndex) => {
    const y0 = bottom - row.h
    let cursor = 0
    for (const hall of row.halls) {
      const w = hallW(hall), h = hallH(hall)
      placed.push({
        ...hall, rowIndex, w, h,
        x0: cursor, y0,
        cx: cursor + w / 2, cy: y0 + h / 2,
      })
      cursor += w
    }
    row.y0 = y0
    bottom = y0
  })

  return { rows, placed, worldW, roomH }
}

// ── Меблювання за типом (К1.1) ────────────────────────────
//
// Один запис на тип. Додати лабораторію — це додати сюди функцію й запис у
// HALL_KINDS; жодної нової гілки коду ні в розкладці, ні за її межами.
//
// Кожна повертає { stationSlots, props, zones, decor, posts } у ЛОКАЛЬНИХ
// координатах кімнати (від її лівого верхнього кута).

const T = u(1)

function furnishAssembly(hall) {
  const { w, h } = hall
  const props = {
    [`lamp_${hall.id}`]: {
      x: w / 2, y: 130, w: u(1), h: u(1), sprite: 'f_painting', color: '#d4c060', z: 2,
    },
    // Прийом і відвантаження — ПАРА (Стадія 12 / Д2): один силует, два кольори,
    // на протилежних краях цеху. Поки одне було палетою, а друге — синьою
    // поштовою скринькою, зв'язок між ними було видно тільки з коду.
    [`intake_${hall.id}`]: {
      x: w / 2 + 420, y: h - 160, w: u(0.9), h: u(1), sprite: 'f_crate', color: '#7a6a44',
    },
    [`mailbox_${hall.id}`]: {
      x: 300, y: h - 160, w: u(0.9), h: u(1), sprite: 'f_crate', color: '#3a5db8',
    },
    // Well below the rack: at y=700 the board's zone overlapped the rack's, so
    // walking up to buy an upgrade opened the hiring panel on top of it. Two
    // panels behind one spot is indistinguishable from a broken button.
    [`jobboard_${hall.id}`]: {
      x: 150, y: h - 350, w: u(1), h: u(1), sprite: 'f_painting', color: '#7a5a3a',
    },
  }

  return {
    // Bench slots: evenly spread inside each hall, high in the room so the
    // output side behind them stays a walkable corridor (S1.2).
    stationSlots: Array.from({ length: hall.benches }, (_, i) => ({
      def: 'workbench',
      x:   w * ((i + 1) / (hall.benches + 1)),
      y:   380,
      hallId: hall.id,
    })),
    props,
    // Ящики й дошка — ПО ЦЕХУ (F4). Усе троє випливає з того, що штат
    // прив'язаний до цеху: дошка — це «найняти СЮДИ», а без своїх ящиків
    // кур'єр і продавець цеху 3 тягали б кожну коробку через усю фабрику.
    zones: [
      // Ящик прийому поводиться рівно як вуличний слот — та сама взаємодія,
      // інше місце. Саме тому роль кур'єра не довелось міняти.
      { id: `intake_${hall.id}`,   kind: 'intake',   from: `intake_${hall.id}`,   w: 170, h: 150 },
      { id: `mailbox_${hall.id}`,  kind: 'mailbox',  from: `mailbox_${hall.id}`,  w: 150, h: 150 },
      { id: `jobboard_${hall.id}`, kind: 'jobboard', from: `jobboard_${hall.id}`, w: 150, h: 150 },
    ],
    // Decor (V3): what a working floor has lying about. Pallets and crates are
    // solid — you walk round them; markings and shadows are not.
    decor: [
      { sprite: 'floor_mark', x: w / 2, y: 300, w: w * 0.7, h: 8, color: '#d2c25e', z: 0.4 },
      { sprite: 'f_pallet',   x: 120, y: h - 160, w: T, h: T, color: '#b58d55', z: 2, solid: true },
      { sprite: 'f_pallet',   x: 120, y: h - 250, w: T, h: T, color: '#b58d55', z: 2, solid: true },
      { sprite: 'f_crate',    x: w - 140, y: 250, w: T, h: T, color: '#9e7c4c', z: 2, solid: true },
      { sprite: 'f_crate',    x: w - 220, y: 250, w: T, h: T, color: '#8a6b40', z: 2, solid: true },
      { sprite: 'o_shelf',    x: w / 2 + 240, y: 120, w: T * 1.4, h: T, color: '#8e8eae', z: 2, solid: true },
    ],
    // Кур'єр чекає між ящиком прийому і верстаками — на своєму маршруті, а не
    // в його кінці. Продавець — МІЖ ВЕРСТАКАМИ (П4), а не біля скриньки:
    // скринька — це кінець його маршруту, і поки він стояв там, увесь цех вище
    // виглядав безлюдним.
    posts: {
      courier: { x: w / 2 + 200, y: h - 250 },
      tech:    { x: w / 2,       y: 560 },
      seller:  { x: w / 2,       y: 660 },
    },
  }
}

const FURNISH = { assembly: furnishAssembly }

// Кімната невідомого типу лишається порожньою підлогою, а не падає: розкладка
// не те місце, де гра має право зупинитись. Тип без меблів видно одразу.
const furnish = (hall) =>
  (FURNISH[hall.kind] ?? (() => ({})))(hall)

export function buildFactoryLayout(hallIds) {
  const { rows, placed, worldW, roomH } = placeHalls(openHalls(hallIds))
  const worldH = roomH + STREET_H

  const home  = placed[0]
  const doorX = home.cx     // the street door stays in the first hall

  // ── Меблі всіх кімнат, зсунуті в світові координати ──────
  const props        = {}
  const stationSlots = []
  const decor        = []
  const zoneSpecs    = []
  const postsByHall  = {}

  for (const hall of placed) {
    const f = furnish(hall)
    for (const [name, p] of Object.entries(f.props ?? {}))
      props[name] = { ...p, x: hall.x0 + p.x, y: hall.y0 + p.y }
    for (const slot of f.stationSlots ?? [])
      stationSlots.push({ ...slot, x: hall.x0 + slot.x, y: hall.y0 + slot.y })
    for (const d of f.decor ?? [])
      decor.push({ ...d, x: hall.x0 + d.x, y: hall.y0 + d.y })
    for (const z of f.zones ?? [])
      zoneSpecs.push({ ...z, hallId: hall.id })
    postsByHall[hall.id] = Object.fromEntries(
      Object.entries(f.posts ?? {}).map(([role, p]) =>
        [role, { x: hall.x0 + p.x, y: hall.y0 + p.y }]),
    )
  }

  // The desk and the rack live in the first hall: one laptop orders for the
  // whole factory and the rack is the player's own business.
  props.desk = { x: home.x0 + home.w - 200, y: home.y0 + home.h - 540, w: u(1.3), h: u(1), sprite: 'desk', color: '#5a4a7a' }
  props.rack = { x: home.x0 + 220,          y: home.y0 + home.h - 680, w: u(1), h: u(1.4), sprite: 'f_bookshelf', color: '#3a6a72' }

  // Менеджер стоїть за ноутбуком у будь-якому цеху: ноутбук один на фабрику.
  for (const hall of placed)
    postsByHall[hall.id].manager = { x: props.desk.x - 40, y: props.desk.y + 160 }

  // ── Стіни ───────────────────────────────────────────────
  const front = partitionRects({
    axis: 'h', at: roomH - WALL_HORIZ / 2, from: 0, to: worldW,
    gaps: [{ at: doorX, size: DOOR_W }],
  })

  const walls = [
    rect(worldW / 2, WALL_HORIZ / 2, worldW, WALL_HORIZ),            // top
    rect(WALL_SIDE / 2, roomH / 2, WALL_SIDE, roomH),                // left
    rect(worldW - WALL_SIDE / 2, roomH / 2, WALL_SIDE, roomH),       // right
    ...front.walls,
  ]
  const doorVoids = [...front.voids]

  const addPartition = (part) => {
    const { walls: w, voids: v } = partitionRects(part)
    walls.push(...w)
    doorVoids.push(...v)
  }

  for (const row of rows) {
    const inRow = placed.filter(h => h.rowIndex === rows.indexOf(row))

    // Divider between consecutive halls in a row: a wall with a gap a character
    // walks through. The gap sits low, on the route between the benches and the
    // door, so crossing the factory is a straight run rather than a detour.
    for (let i = 1; i < inRow.length; i++) {
      const hall = inRow[i]
      addPartition({
        axis: 'v', at: hall.x0, from: row.y0, to: row.y0 + row.h,
        gaps: [{ at: row.y0 + row.h * 0.66, size: HALL_GAP_H }],
      })
    }

    // Короткий ряд не лишає дірки в периметрі: його правий край — така сама
    // стіна. Смуга підлоги за нею — це буквально місце, де стане наступна
    // кімната, і поки вона порожня, її видно.
    if (row.w < worldW) {
      addPartition({ axis: 'v', at: row.w, from: row.y0, to: row.y0 + row.h, gaps: [] })
    }

    // Проріз між рядами — за тим самим правилом, що й між цехами (V1.3):
    // діра не вужча за HALL_GAP_H, і стоїть там, де обидва ряди є підлогою.
    if (row.y0 > 0) {
      const above = rows[rows.indexOf(row) + 1]
      const shared = Math.min(row.w, above.w)
      addPartition({
        axis: 'h', at: row.y0 - WALL_HORIZ / 2, from: 0, to: worldW,
        gaps: [{ at: Math.min(shared - ROW_GAP_W, Math.max(ROW_GAP_W, shared / 2)), size: ROW_GAP_W }],
      })
    }
  }

  // Точки, де малюється зворотний відлік для замовлень БЕЗ цеху. На фабриці
  // кожне замовлення їде в конкретний ящик, і відлік малюється над ним — але
  // сам масив лишається контрактом розкладки, тож тримаємо його прив'язаним до
  // воріт, а не до стрічки, якої більше немає.
  const deliverySlots = [
    { x: doorX - 110, y: roomH + 120 },
    { x: doorX,       y: roomH + 120 },
    { x: doorX + 110, y: roomH + 120 },
  ]

  const decorRects = decor.map((d, i) => ({
    id:     `decor-${i}`,
    ...rect(d.x, d.y, d.w, d.h),
    sprite: d.sprite,
    color:  d.color,
    z:      d.z ?? 2,
    solid:  d.solid === true,
  }))

  const propRects = Object.fromEntries(
    Object.entries(props).map(([name, p]) => [
      name,
      { ...rect(p.x, p.y, p.w, p.h), sprite: p.sprite, color: p.color, z: p.z ?? 3 },
    ])
  )

  const zones = [
    ...zoneSpecs.map(z => ({
      id: z.id, kind: z.kind,
      ...rect(propRects[z.from].cx, propRects[z.from].cy, z.w, z.h),
      meta: { hallId: z.hallId },
    })),
    { id: 'desk', kind: 'desk', ...rect(propRects.desk.cx, propRects.desk.cy, 160, 150) },
    { id: 'rack', kind: 'rack', ...rect(propRects.rack.cx, propRects.rack.cy, 150, 150) },
  ]

  return {
    id: 'factory',
    world:  { w: worldW, h: worldH },
    room:   { w: worldW, h: roomH },
    street: { y: roomH, h: STREET_H },
    door:   { x: doorX, w: DOOR_W, y: roomH - WALL_HORIZ },
    walls,
    obstacles: [...walls, ...decorRects.filter(d => d.solid)],
    decor: decorRects,
    doorVoids,
    stationSlots,
    props: propRects,
    zones,
    // A hall comes with its benches: you bought the hall, not the tables. This
    // is why the `benches` upgrade track is frozen here — two ways to grow the
    // same number would only fight each other.
    stationsFromLayout: true,
    // `kind` виїжджає в розкладку разом із геометрією: усе, що питає «в які
    // цехи можна везти коробку», питає це в одного списку.
    halls: placed.map(h => ({
      id: h.id, name: h.name, kind: h.kind,
      x0: h.x0, y0: h.y0, w: h.w, h: h.h, cx: h.cx, cy: h.cy, rowIndex: h.rowIndex,
    })),
    spawns: {
      // Подалі від приймального ящика: перша версія ставила спавн гравця
      // всередину зони підбору, і кожна привезена коробка стрибала йому в руки
      // просто в момент прибуття.
      player:     { x: home.cx, y: home.y0 + home.h - 150 },
      workerIdle: { x: home.cx + 160, y: home.y0 + home.h - 150 },
      // Пости локації — це пости ПЕРШОГО цеху, з одним винятком: кур'єр без
      // цеху чекає біля воріт, бо його робота починається там.
      posts: {
        ...postsByHall[home.id],
        courier: { x: doorX, y: roomH - 130 },
      },
      // A post per role PER HALL, so staff stand where they work instead of
      // gathering in hall 1 (F4.3).
      postsByHall,
      door:          { x: doorX, y: roomH - WALL_HORIZ - 30 },
      deliverySlots,
      bench:    { x: stationSlots[0].x, y: stationSlots[0].y + 86 },
      benchTop: { x: stationSlots[0].x, y: stationSlots[0].y },
    },
    sizes: SIZES,
    theme: THEME,
  }
}
