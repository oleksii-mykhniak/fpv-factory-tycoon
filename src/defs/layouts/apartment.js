// Квартира — і гараж, коли його куплено (П2).
//
// Раніше це були дві локації з двома світами; тепер один світ, який росте
// вправо. Контракт той самий, що й у фабрики: `buildApartmentLayout` повертає
// РІВНО той об'єкт, який повертає buildLayout, тож перешкоди, nav-сітка, зони,
// камера і сцена не дізнаються слова «кімната».
//
// Гараж навмисно менший за старий (900×950 проти 1500×1700): він тепер стоїть
// поруч із квартирою, а не замість неї, і мусить читатись як прибудова.

import { buildLayout } from './buildLayout.js'
import { openRooms } from './rooms.js'
import { u } from '../../state/config.js'

// One Kenney tile = one character height (V4).
const T = u(1)

const FLAT_W  = 1000
const ROOM_H  = 950
const WORLD_H = 1350
const GARAGE_W = 900

// Lighter than it was (V4 polish): the whole game read as a night scene, and
// a home should not. Wall, street and pavement live here too — they were
// hardcoded in the scene, which meant a location could not really have a
// palette of its own.
const THEME = {
  bgColor:       '#242236',
  floorColor:    '#4b4260',
  streetColor:   '#2a2a3c',
  pavementColor: '#3d3d54',
  // Wooden boards indoors, asphalt outside. Tinted rather than redrawn, so
  // one tile serves every location and they still read as different places.
  // Wall and door come from the same palette as everything else, and are lit
  // the same way: body, lighter top edge, shadow where they meet the floor.
  wallColor:     '#55526e',
  wallEdge:      '#6b7284',
  wallShadow:    '#242232',
  doorColor:     '#7a5533',
  floorTile:     'tile_wood',
  streetTile:    'tile_asphalt',
}

export function buildApartmentLayout(roomIds) {
  const rooms  = openRooms(roomIds)
  const garage = rooms.some(r => r.id === 'garage')
  const worldW = FLAT_W + (garage ? GARAGE_W : 0)
  const X0     = FLAT_W   // where the garage starts

  return buildLayout({
    id:    'apartment',
    world: { w: worldW, h: WORLD_H },
    roomH: ROOM_H,
    door:  { x: 500, w: 180 },
    // A garage has a garage door. Same wall, second hole — see extraDoors.
    extraDoors: garage ? [{ x: X0 + 450, w: 260 }] : [],
    partitions: [
      // Between the room and the kitchen, with a doorway in the middle.
      { axis: 'v', at: 620, from: 0, to: 600, gaps: [{ at: 300, size: 170 }] },
      // Between both rooms and the hallway: one opening each, so neither room
      // is reached only by walking through the other.
      { axis: 'h', at: 600, from: 0, to: FLAT_W, gaps: [
        { at: 280, size: 190 },
        { at: 830, size: 190 },
      ] },
      // The garage wall. Until it is bought this is the outer wall of the flat,
      // built the same way — nothing behind it exists, which is the point: a
      // darkened room you cannot enter is either a spoiler or a bug on sight.
      ...(garage
        ? [{ axis: 'v', at: X0, from: 0, to: ROOM_H, gaps: [{ at: 790, size: 200 }] }]
        : []),
    ],
    // Слоти верстаків: перший — у кімнаті, другий приходить із гаражем. Порядок
    // важить: станції розкладаються за індексом, тож station-0 лишається вдома.
    stationSlots: [
      // In the room, far enough down the wall that the output side behind it is
      // a corridor a character can actually walk along (S1.2).
      { def: 'workbench', x: 300, y: 300 },
      ...(garage ? [{ def: 'workbench', x: X0 + 300, y: 320 }] : []),
    ],
    // Sizes are whole tiles: T = 74 world units = one character height, the
    // ratio the Kenney art is drawn at (V4). A bed is 1×2 tiles because a bed
    // is twice as long as a person is tall.
    props: {
      lamp:     { x: 300, y: 90,  w: T,      h: T,      sprite: 'f_painting',  color: '#d4c060', z: 2 },
      rack:     { x: 110, y: 470, w: T,      h: T*1.4,  sprite: 'f_bookshelf', color: '#3a6a72' },
      // The laptop lives on the kitchen table — this is a shop run from home.
      desk:     { x: 820, y: 300, w: T*1.3,  h: T,      sprite: 'desk',        color: '#5a4a7a' },
      piggy:    { x: 120, y: 790, w: T*0.7,  h: T*0.7,  sprite: 'piggy',       color: '#d4607a' },
      // Post box and bin are outside the front door, like anybody's.
      mailbox:  { x: 250, y: 1180, w: T*0.8, h: T,      sprite: 'o_postbox',   color: '#3a5db8' },
      trashbin: { x: 780, y: 1180, w: T*0.8, h: T*0.9,  sprite: 'o_bin',       color: '#4a6a3a' },
      // Дошка найму фізично живе в гаражі: наймати можна рівно там, де для
      // людей є місце, і панель не існує раніше за це.
      ...(garage
        ? { jobboard: { x: X0 + 60, y: 200, w: T, h: T, sprite: 'f_painting', color: '#7a5a3a' } }
        : {}),
    },
    // Furniture that does nothing (V3). This is a home: the bench sits in
    // somebody's living room, and the whole point of the first location is that
    // you can see that.
    // Colours are chosen against the floor, not in isolation: the first pass
    // used dark furniture that vanished the moment the floor was lightened.
    // Every size below matches the aspect the sprite was DRAWN at. Stretching a
    // sprite to a different shape is what made the first pass look smeared.
    decor: [
      { sprite: 'f_rug',       x: 300, y: 430, w: T*2.4, h: T*1.6, z: 0.6 },
      { sprite: 'f_bed',       x: 500, y: 150, w: T,     h: T*1.9, z: 2, solid: true },
      { sprite: 'f_sofa',      x: 160, y: 690, w: T*1.9, h: T*0.9, z: 2, solid: true },
      { sprite: 'f_plant',     x: 560, y: 545, w: T*0.7, h: T*0.9, z: 2 },
      { sprite: 'f_painting',  x: 210, y: 55,  w: T*0.9, h: T*0.7, z: 1 },
      // Kitchen nook
      { sprite: 'f_counter',   x: 930, y: 100, w: T,     h: T*0.9, z: 2, solid: true },
      { sprite: 'f_sink',      x: 850, y: 100, w: T*0.9, h: T*0.9, z: 2, solid: true },
      { sprite: 'f_stove',     x: 770, y: 100, w: T*0.9, h: T*0.9, z: 2, solid: true },
      { sprite: 'f_fridge',    x: 690, y: 110, w: T*0.8, h: T*1.2, z: 2, solid: true },
      { sprite: 'f_chair',     x: 820, y: 420, w: T*0.7, h: T*0.8, z: 2 },
      { sprite: 'f_plant',     x: 950, y: 520, w: T*0.7, h: T*0.9, z: 2 },
      // Hallway
      { sprite: 'f_bookshelf', x: 900, y: 730, w: T,     h: T*1.3, z: 2, solid: true },
      { sprite: 'f_crate',     x: 700, y: 900, w: T*0.8, h: T*0.8, z: 2, solid: true },
      { sprite: 'f_crate',     x: 770, y: 880, w: T*0.8, h: T*0.8, z: 2, solid: true },
      { sprite: 'f_chair',     x: 250, y: 690, w: T*0.7, h: T*0.8, z: 2 },
      { sprite: 'f_painting',  x: 430, y: 55,  w: T*0.9, h: T*0.7, z: 1 },
      { sprite: 'f_plant',     x: 60,  y: 120, w: T*0.7, h: T*0.9, z: 2 },
      { sprite: 'f_rug',       x: 500, y: 800, w: T*2.4, h: T*1.6, z: 0.6 },
      // Гараж: те саме житло, тільки без житла — полиці, ящики, піддони.
      ...(garage ? [
        { sprite: 'o_shelf',    x: X0 + 480, y: 70,  w: T*1.6, h: T,     z: 2, solid: true },
        { sprite: 'f_crate',    x: X0 + 810, y: 150, w: T*0.8, h: T*0.8, z: 2, solid: true },
        { sprite: 'f_crate',    x: X0 + 810, y: 240, w: T*0.8, h: T*0.8, z: 2, solid: true },
        { sprite: 'f_pallet',   x: X0 + 120, y: 620, w: T,     h: T*0.7, z: 2, solid: true },
        { sprite: 'f_pallet',   x: X0 + 120, y: 720, w: T,     h: T*0.7, z: 2, solid: true },
        { sprite: 'f_table',    x: X0 + 720, y: 640, w: T*1.7, h: T*0.9, z: 2, solid: true },
        { sprite: 'o_vending',  x: X0 + 830, y: 480, w: T*0.8, h: T*1.1, z: 2, solid: true },
        { sprite: 'f_plant',    x: X0 + 60,  y: 640, w: T*0.7, h: T*0.9, z: 2 },
        { sprite: 'f_rug',      x: X0 + 300, y: 470, w: T*2.4, h: T*1.6, z: 0.6 },
      ] : []),
    ],
    street: [
      { sprite: 'o_tree',     x: 90,  y: 1250, w: T*1.2, h: T*1.4 },
      { sprite: 'o_tree',     x: 930, y: 1250, w: T*1.2, h: T*1.4 },
      { sprite: 'o_bush',     x: 200, y: 1310, w: T*0.9, h: T*0.8 },
      { sprite: 'o_hedge',    x: 640, y: 1310, w: T*1.4, h: T*0.6 },
      { sprite: 'o_bench',    x: 360, y: 1290, w: T*1.2, h: T*0.7 },
      { sprite: 'o_bicycle',  x: 540, y: 1230, w: T,     h: T*0.7 },
      { sprite: 'o_lamppost', x: 120, y: 1030, w: T*0.6, h: T*1.5 },
      { sprite: 'o_lamppost', x: 890, y: 1030, w: T*0.6, h: T*1.5 },
      { sprite: 'o_hydrant',  x: 690, y: 1050, w: T*0.5, h: T*0.7 },
      { sprite: 'o_bin',      x: 830, y: 1250, w: T*0.7, h: T*0.9 },
      { sprite: 'o_car',      x: 260, y: 1180, w: T,     h: T*1.8 },
      // Під'їзд до гаража — щоб ворота читались як ворота.
      ...(garage ? [
        { sprite: 'o_car',      x: X0 + 700, y: 1200, w: T,     h: T*1.8 },
        { sprite: 'o_lamppost', x: X0 + 860, y: 1030, w: T*0.6, h: T*1.5 },
        { sprite: 'o_bush',     x: X0 + 120, y: 1300, w: T*0.9, h: T*0.8 },
        { sprite: 'o_hedge',    x: X0 + 250, y: 1310, w: T*1.4, h: T*0.6 },
      ] : []),
    ],
    deliverySlots: [
      { x: 420, y: 1090 },
      { x: 590, y: 1090 },
      { x: 750, y: 1090 },
    ],
    spawns: {
      player:     { x: 500, y: 780 },
      workerIdle: { x: 560, y: 800 },
      // Somebody lives here, and so does a cat (V5). Only the flat has one.
      cat:        { x: 330, y: 470 },
      // Кожна роль має свій пост (S1.5). Поки гаража нема — наймати нікого, але
      // форма даних лишається однаковою, щоб локація ніколи не була винятком.
      posts: garage
        ? {
            courier: { x: X0 + 450, y: 800 },   // біля воріт, звідки носять коробки
            tech:    { x: X0 + 300, y: 440 },   // при верстаку
            seller:  { x: X0 + 120, y: 400 },   // на шляху від верстака до дверей
            manager: { x: 820,      y: 430 },
          }
        : {
            courier: { x: 480, y: 800 },
            tech:    { x: 300, y: 430 },
            seller:  { x: 220, y: 830 },
            manager: { x: 820, y: 430 },
          },
    },
    theme: THEME,
  })
}
