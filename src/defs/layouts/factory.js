// The factory floor — a layout assembled from the halls that are open (F2).
//
// Every other location is one room, written out once. The factory is the last
// location, so it grows instead of being left behind: buying a hall widens the
// world rather than replacing it.
//
// The contract that makes this cheap: buildFactoryLayout returns EXACTLY the
// object buildLayout returns. Obstacles, zones, nav grid, camera bounds and the
// scene all consume a layout and none of them learns what a hall is — the same
// discipline that let C7 turn a move into a rebuild instead of a special case.

import { rect, SIZES, WALL_SIDE, WALL_HORIZ } from './buildLayout.js'
import { u, ENDLESS_CAP_HALL, MK_CAP_HALL } from '../../state/config.js'

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
    name: 'Цех 1',
    w: 1700,
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
    name: 'Цех 2',
    w: 1700,
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
      '📦 Конвеєр носить коробки в цей цех',
    ],
  },
  {
    id: 'hall-3',
    name: 'Цех 3',
    w: 1700,
    benches: 2,
    workerCaps: { courier: 1, tech: 1, seller: 1, manager: 0 },
    cost: 6800,
    // Стеля нескінченних треків росте з цехами (Стадія 10 / A3).
    upgradeCaps: endlessCaps(ENDLESS_CAP_HALL[2]),
    mkCap: MK_CAP_HALL[2],

    unlocks: [
      '🔧 Два верстаки',
      "🧑‍🔧 Три вакансії: кур'єр, технік, продавець",
      '📦 Конвеєр носить коробки в цей цех',
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

// The belt runs along the line of the hall doorways, so it visibly threads
// through the whole factory instead of stopping at every wall.
const BELT_INSET = 40
const ROOM_H     = 1400
const STREET_H   = 500
const DOOR_W     = 240      // street door, in hall 1
const HALL_GAP_H = 260      // doorway between two halls
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

export function buildFactoryLayout(hallIds) {
  const halls   = openHalls(hallIds)
  const worldW  = halls.reduce((sum, h) => sum + h.w, 0)
  const worldH  = ROOM_H + STREET_H

  // Where each open hall starts, so everything below can be written in local
  // coordinates and shifted once.
  let cursor = 0
  const placed = halls.map(hall => {
    const at = { ...hall, x0: cursor, cx: cursor + hall.w / 2 }
    cursor += hall.w
    return at
  })

  const doorX = placed[0].cx     // the street door stays in the first hall

  const walls = [
    rect(worldW / 2, WALL_HORIZ / 2, worldW, WALL_HORIZ),                    // top
    rect(WALL_SIDE / 2, ROOM_H / 2, WALL_SIDE, ROOM_H),                      // left
    rect(worldW - WALL_SIDE / 2, ROOM_H / 2, WALL_SIDE, ROOM_H),             // right
    // Bottom wall, split by the street door
    rect((doorX - DOOR_W / 2) / 2, ROOM_H - WALL_HORIZ / 2, doorX - DOOR_W / 2, WALL_HORIZ),
    rect(
      (doorX + DOOR_W / 2 + worldW) / 2,
      ROOM_H - WALL_HORIZ / 2,
      worldW - (doorX + DOOR_W / 2),
      WALL_HORIZ,
    ),
  ]

  const doorVoids = [rect(doorX, ROOM_H - WALL_HORIZ / 2, DOOR_W, WALL_HORIZ)]

  // Divider between consecutive halls: a wall with a gap a character walks
  // through. The gap sits low, on the route between the benches and the door,
  // so crossing the factory is a straight run rather than a detour.
  const gapCy = ROOM_H * 0.66
  for (let i = 1; i < placed.length; i++) {
    const x = placed[i].x0
    const gapTop = gapCy - HALL_GAP_H / 2
    const gapBot = gapCy + HALL_GAP_H / 2
    walls.push(rect(x, gapTop / 2, WALL_SIDE, gapTop))
    walls.push(rect(x, (gapBot + ROOM_H) / 2, WALL_SIDE, ROOM_H - gapBot))
    doorVoids.push(rect(x, gapCy, WALL_SIDE, HALL_GAP_H))
  }

  // Bench slots: evenly spread inside each hall, high in the room so the output
  // side behind them stays a walkable corridor (S1.2).
  const stationSlots = placed.flatMap(hall =>
    Array.from({ length: hall.benches }, (_, i) => ({
      def: 'workbench',
      x:   hall.x0 + hall.w * ((i + 1) / (hall.benches + 1)),
      y:   380,
      hallId: hall.id,
    })),
  )

  // The desk and the rack live in the first hall: one laptop orders for the
  // whole factory and the rack is the player's own business.
  const home = placed[0]
  const props = {
    desk: { x: home.x0 + home.w - 200, y: 860, w: u(1.3), h: u(1), sprite: 'desk', color: '#5a4a7a' },
    rack: { x: home.x0 + 220, y: 720, w: u(1), h: u(1.4), sprite: 'f_bookshelf', color: '#3a6a72' },
  }

  // A board and a post box PER HALL (F4). Both follow from binding staff to a
  // hall: the board is where you hire INTO this hall, and without a local post
  // box a seller bound to hall 3 would carry every drone back across the whole
  // factory — exactly the walk the conveyor was built to remove.
  for (const hall of placed) {
    props[`lamp_${hall.id}`] = {
      x: hall.cx, y: 130, w: u(1), h: u(1), sprite: 'f_painting', color: '#d4c060', z: 2,
    }
    props[`mailbox_${hall.id}`] = {
      x: hall.x0 + 300, y: 1240, w: u(0.8), h: u(1), sprite: 'o_postbox', color: '#3a5db8',
    }
    // Well below the rack: at y=700 the board's zone overlapped the rack's, so
    // walking up to buy an upgrade opened the hiring panel on top of it. Two
    // panels behind one spot is indistinguishable from a broken button.
    props[`jobboard_${hall.id}`] = {
      x: hall.x0 + 150, y: 1050, w: u(1), h: u(1), sprite: 'f_painting', color: '#7a5a3a',
    }
  }

  // The dock: where an ordered kit lands. On the factory it lands ON THE BELT,
  // so these are only the spots the countdown is drawn at — nobody walks out to
  // the street here, which is the whole difference between a garage and a
  // production floor (F3.2).
  const deliverySlots = [
    { x: WALL_SIDE + BELT_INSET,       y: gapCy },
    { x: WALL_SIDE + BELT_INSET + 110, y: gapCy },
    { x: WALL_SIDE + BELT_INSET + 220, y: gapCy },
  ]

  // The conveyor itself: a straight run at doorway height, with one drop point
  // per hall. `t` is distance along the belt, so a box's position is a single
  // number and the system that moves it needs no geometry at all.
  const beltX0 = WALL_SIDE + BELT_INSET
  const beltX1 = worldW - WALL_SIDE - BELT_INSET
  const conveyor = {
    y:      gapCy,
    x0:     beltX0,
    x1:     beltX1,
    length: beltX1 - beltX0,
    drops: placed.map((hall, i) => ({
      index:  i,
      hallId: hall.id,
      x:      hall.cx,
      t:      hall.cx - beltX0,
    })),
  }

  const zones = [
    // No street slots here: a box is taken off the BELT, at the hall that
    // needed it. The zone behaves exactly like a street slot — same interaction,
    // different place — which is why the courier's role did not have to change.
    ...conveyor.drops.map(drop => ({
      id:   `drop${drop.index}`,
      kind: 'belt_drop',
      ...rect(drop.x, conveyor.y + 120, 170, 150),
      meta: { dropIndex: drop.index, hallId: drop.hallId },
    })),
    ...placed.flatMap(hall => [
      {
        id: `mailbox_${hall.id}`, kind: 'mailbox',
        ...rect(props[`mailbox_${hall.id}`].x, props[`mailbox_${hall.id}`].y, 150, 150),
        meta: { hallId: hall.id },
      },
      {
        id: `jobboard_${hall.id}`, kind: 'jobboard',
        ...rect(props[`jobboard_${hall.id}`].x, props[`jobboard_${hall.id}`].y, 150, 150),
        meta: { hallId: hall.id },
      },
    ]),
    { id: 'desk', kind: 'desk', ...rect(props.desk.x, props.desk.y, 160, 150) },
    { id: 'rack', kind: 'rack', ...rect(props.rack.x, props.rack.y, 150, 150) },
  ]

  // Decor (V3): what a working floor has lying about. Pallets and crates are
  // solid — you walk round them; markings and shadows are not.
  const T = u(1)
  const decor = placed.flatMap(hall => [
    { sprite: 'floor_mark',  x: hall.cx, y: 300, w: hall.w * 0.7, h: 8, color: '#d2c25e', z: 0.4 },
    { sprite: 'f_pallet',    x: hall.x0 + 120, y: 1240, w: T, h: T, color: '#b58d55', z: 2, solid: true },
    { sprite: 'f_pallet',    x: hall.x0 + 120, y: 1150, w: T, h: T, color: '#b58d55', z: 2, solid: true },
    { sprite: 'f_crate',     x: hall.x0 + hall.w - 140, y: 250, w: T, h: T, color: '#9e7c4c', z: 2, solid: true },
    { sprite: 'f_crate', x: hall.x0 + hall.w - 220, y: 250, w: T, h: T, color: '#8a6b40', z: 2, solid: true },
    { sprite: 'o_shelf',x: hall.cx + 240, y: 120, w: T*1.4, h: T, color: '#8e8eae', z: 2, solid: true },
  ])

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

  return {
    id: 'factory',
    world:  { w: worldW, h: worldH },
    room:   { w: worldW, h: ROOM_H },
    street: { y: ROOM_H, h: STREET_H },
    door:   { x: doorX, w: DOOR_W, y: ROOM_H - WALL_HORIZ },
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
    conveyor,
    halls: placed.map(h => ({ id: h.id, name: h.name, x0: h.x0, w: h.w })),
    spawns: {
      // Well clear of the belt drop zone: the first version put the player
      // spawn inside it, so every box the conveyor delivered jumped straight
      // into their hands the moment it arrived.
      player:     { x: home.cx, y: 1250 },
      workerIdle: { x: home.cx + 160, y: 1250 },
      // Продавець чекає МІЖ ВЕРСТАКАМИ, а не біля скриньки (П4): скринька — це
      // кінець його маршруту, і поки він стояв там, увесь цех вище виглядав
      // безлюдним. Тепер він гуляє там, звідки забирає дрони — заразом і йти
      // йому починати ближче.
      posts: {
        courier: { x: doorX, y: 1270 },
        tech:    { x: home.cx, y: 560 },
        seller:  { x: home.cx, y: 660 },
        manager: { x: props.desk.x - 40, y: props.desk.y + 160 },
      },
      // A post per role PER HALL, so staff stand where they work instead of
      // gathering in hall 1 (F4.3).
      postsByHall: Object.fromEntries(placed.map(hall => [hall.id, {
        courier: { x: hall.cx - 200, y: conveyor.y + 190 },
        tech:    { x: hall.cx,       y: 560 },
        seller:  { x: hall.cx,       y: 660 },
        manager: { x: props.desk.x - 40, y: props.desk.y + 160 },
      }])),
      door:          { x: doorX, y: ROOM_H - WALL_HORIZ - 30 },
      deliverySlots,
      bench:    { x: stationSlots[0].x, y: stationSlots[0].y + 86 },
      benchTop: { x: stationSlots[0].x, y: stationSlots[0].y },
    },
    sizes: SIZES,
    theme: THEME,
  }
}
