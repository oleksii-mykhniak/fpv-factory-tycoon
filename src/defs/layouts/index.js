// Floor plans, one per location.
//
// Moving house used to change two colours (D7). A location is now a different
// room: bigger, with more bench slots and its own arrangement — which is what
// makes the move feel like progress rather than a palette swap.

import { buildLayout } from './buildLayout.js'
import { buildFactoryLayout } from './factory.js'
import { u } from '../../state/config.js'

// One Kenney tile = one character height. Every piece of art in the game is
// drawn at this ratio, which is the only thing that keeps the pixel size the
// same everywhere — mixing ratios is exactly what made the first attempt at
// using these packs look wrong (V4).
const T = u(1)

// ── Квартира — where it starts, and it looks like somewhere someone lives.
//
// It was one empty hall (V1 made it emptier still). Now it is a flat: a room
// with the bench, a kitchen nook with the laptop, and a hallway that runs to
// the front door. Same builder — the rooms are interior partitions, which are
// walls with holes in them and nothing more (V2).
export const apartment = buildLayout({
  id:    'apartment',
  world: { w: 1000, h: 1350 },
  roomH: 950,
  door:  { x: 500, w: 180 },
  partitions: [
    // Between the room and the kitchen, with a doorway in the middle.
    { axis: 'v', at: 620, from: 0, to: 600, gaps: [{ at: 300, size: 170 }] },
    // Between both rooms and the hallway: one opening each, so neither room is
    // reached only by walking through the other.
    { axis: 'h', at: 600, from: 0, to: 1000, gaps: [
      { at: 280, size: 190 },
      { at: 830, size: 190 },
    ] },
  ],
  stationSlots: [
    // In the room, far enough down the wall that the output side behind it is a
    // corridor a character can actually walk along (S1.2).
    { def: 'workbench', x: 300, y: 300 },
  ],
  // Sizes are whole tiles now: T = 74 world units = one character height, the
  // ratio the Kenney art is drawn at (V4). A bed is 1×2 tiles because a bed is
  // twice as long as a person is tall.
  props: {
    lamp:     { x: 300, y: 90,  w: T,      h: T,      sprite: 'k_painting', color: '#d4c060', z: 2 },
    rack:     { x: 110, y: 470, w: T,      h: T*1.4,  sprite: 'k_bookshelf', color: '#3a6a72' },
    jobboard: { x: 110, y: 180, w: T,      h: T,      sprite: 'k_mirror',   color: '#7a5a3a' },
    // The laptop lives on the kitchen table — this is a shop run from home.
    desk:     { x: 820, y: 300, w: T*1.3,  h: T,      sprite: 'k_desk',     color: '#5a4a7a' },
    piggy:    { x: 120, y: 790, w: T*0.7,  h: T*0.7,  sprite: 'piggy',      color: '#d4607a' },
    // Post box and bin are outside the front door, like anybody's.
    mailbox:  { x: 250, y: 1180, w: T*0.8, h: T,      sprite: 'k_postbox',  color: '#3a5db8' },
    trashbin: { x: 780, y: 1180, w: T*0.8, h: T*0.9,  sprite: 'k_bin',      color: '#4a6a3a' },
  },
  // Furniture that does nothing (V3). This is a home: the bench sits in
  // somebody's living room, and the whole point of the first location is that
  // you can see that.
  // Colours are chosen against the floor, not in isolation: the first pass used
  // dark furniture that vanished the moment the floor was lightened.
  decor: [
    // Room: a bed against the wall (two tiles, head and foot), a rug, a sofa.
    { sprite: 'k_rug',      x: 320, y: 470, w: T*2.4, h: T*1.6, color: '#7d4a5c', z: 0.6 },
    { sprite: 'k_bed_head', x: 470, y: 110, w: T,     h: T,     color: '#8f83b8', z: 2, solid: true },
    { sprite: 'k_bed_foot', x: 470, y: 184, w: T,     h: T,     color: '#8f83b8', z: 2, solid: true },
    { sprite: 'k_sofa_l',   x: 100, y: 690, w: T,     h: T,     color: '#5f83ad', z: 2, solid: true },
    { sprite: 'k_sofa_r',   x: 174, y: 690, w: T,     h: T,     color: '#5f83ad', z: 2, solid: true },
    { sprite: 'k_plant',    x: 560, y: 540, w: T*0.8, h: T*0.8, color: '#4f9e5c', z: 2 },
    { sprite: 'k_painting', x: 210, y: 60,  w: T,     h: T,     color: '#cbb96e', z: 1 },
    // Kitchen nook
    { sprite: 'k_counter',  x: 900, y: 110, w: T,     h: T,     color: '#bda98a', z: 2, solid: true },
    { sprite: 'k_sink',     x: 826, y: 110, w: T,     h: T,     color: '#bda98a', z: 2, solid: true },
    { sprite: 'k_stove',    x: 752, y: 110, w: T,     h: T,     color: '#8a8a96', z: 2, solid: true },
    { sprite: 'k_cabinet',  x: 940, y: 300, w: T,     h: T,     color: '#d2dade', z: 2, solid: true },
    { sprite: 'k_chair',    x: 820, y: 400, w: T*0.8, h: T*0.8, color: '#a67c4c', z: 2 },
    // Hallway
    { sprite: 'k_bookshelf', x: 890, y: 720, w: T, h: T, color: '#8d6c49', z: 2, solid: true },
  ],
  deliverySlots: [
    { x: 420, y: 1090 },
    { x: 590, y: 1090 },
    { x: 750, y: 1090 },
  ],
  street: [
    { sprite: 'k_tree',     x: 90,  y: 1240, w: T*1.2, h: T*1.2 },
    { sprite: 'k_tree',     x: 930, y: 1240, w: T*1.2, h: T*1.2 },
    { sprite: 'k_bush',     x: 180, y: 1300, w: T*0.8, h: T*0.8 },
    { sprite: 'k_hedge',    x: 640, y: 1300, w: T,     h: T*0.6 },
    { sprite: 'k_bench',    x: 350, y: 1290, w: T,     h: T*0.7 },
    { sprite: 'k_bicycle',  x: 560, y: 1230, w: T,     h: T*0.7 },
    { sprite: 'k_lamppost', x: 120, y: 1050, w: T*0.6, h: T*1.3 },
    { sprite: 'k_lamppost', x: 890, y: 1050, w: T*0.6, h: T*1.3 },
    { sprite: 'k_hydrant',  x: 690, y: 1060, w: T*0.6, h: T*0.7 },
    { sprite: 'k_bag',      x: 830, y: 1250, w: T*0.7, h: T*0.7 },
    { sprite: 'k_barrier',  x: 260, y: 1050, w: T,     h: T*0.6 },
  ],
  spawns: {
    player:     { x: 500, y: 780 },
    workerIdle: { x: 560, y: 800 },
    // Somebody lives here, and so does a cat (V5). Only the flat has one.
    cat:        { x: 330, y: 470 },
    // No hiring in the apartment, but the posts keep the shape of the data the
    // same everywhere — a location never has to be a special case.
    posts: {
      courier: { x: 480, y: 800 },
      tech:    { x: 300, y: 430 },
      seller:  { x: 220, y: 830 },
      manager: { x: 820, y: 430 },
    },
  },
  // Lighter than it was (V4 polish): the whole game read as a night scene, and
  // a home should not. Wall, street and pavement live here too now — they were
  // hardcoded in the scene, which meant a location could not really have a
  // palette of its own.
  theme: {
    bgColor:       '#242236',
    floorColor:    '#4b4260',
    wallColor:     '#6f6790',
    streetColor:   '#2a2a3c',
    pavementColor: '#3d3d54',
    // Wooden boards indoors, asphalt outside. Tinted rather than redrawn, so
    // one tile serves every location and they still read as different places.
    floorTile:     'k_floor_wood',
    floorTint:     '#c9a582',
    streetTile:    'k_asphalt',
    streetTint:    '#8e8ea6',
  },
})

// ── Гараж — wider, two bench slots side by side, room to run ──
export const garage = buildLayout({
  id:    'garage',
  decor: [
    { sprite: 'k_rug',        x: 700,  y: 700, w: T*2.6, h: T*1.8, color: '#26301f', z: 0.4 },
    { sprite: 'k_crate',      x: 1380, y: 200, w: T, h: T, color: '#9e7c4c', z: 2, solid: true },
    { sprite: 'k_crate_veg',  x: 1380, y: 300, w: T, h: T, color: '#9e7c4c', z: 2, solid: true },
    { sprite: 'k_pallet',     x: 180,  y: 980, w: T, h: T, color: '#b2532f', z: 2, solid: true },
    { sprite: 'k_shelf_shop', x: 760,  y: 90,  w: T*1.4, h: T, color: '#8d8168', z: 2, solid: true },
    { sprite: 'k_vending',    x: 1360, y: 980, w: T*0.8, h: T, color: '#7d9c4e', z: 2, solid: true },
    { sprite: 'k_plant',      x: 120,  y: 700, w: T*0.8, h: T*0.8, color: '#4f9e5c', z: 2 },
    { sprite: 'k_painting',   x: 900,  y: 60,  w: T, h: T, color: '#cbb96e', z: 1 },
  ],
  street: [
    { sprite: 'k_car_red',  x: 260,  y: 1560, w: T,     h: T*1.4 },
    { sprite: 'k_tree',     x: 100,  y: 1600, w: T*1.2, h: T*1.2 },
    { sprite: 'k_tree',     x: 1400, y: 1600, w: T*1.2, h: T*1.2 },
    { sprite: 'k_bin',      x: 1150, y: 1350, w: T*0.7, h: T*0.8 },
    { sprite: 'k_lamppost', x: 180,  y: 1330, w: T*0.6, h: T*1.3 },
    { sprite: 'k_hedge',    x: 900,  y: 1640, w: T*1.4, h: T*0.6 },
  ],
  world: { w: 1500, h: 1700 },
  roomH: 1200,
  door:  { x: 620, w: 200 },
  stationSlots: [
    { def: 'workbench', x: 420, y: 380 },
    { def: 'workbench', x: 900, y: 380 },
  ],
  props: {
    lamp:     { x: 660, y: 130, w: 48, h: 48, sprite: 'lamp',     color: '#d4c060', z: 2 },
    piggy:    { x: 170, y: 980, w: 46, h: 46, sprite: 'piggy',    color: '#d4607a' },
    mailbox:  { x: 230, y: 1450, w: 46, h: 38, sprite: 'mailbox',  color: '#3a5db8' },
    trashbin: { x: 1300, y: 1450, w: 46, h: 50, sprite: 'trashbin', color: '#4a6a3a' },
    desk:     { x: 1340, y: 700, w: 92, h: 56, sprite: 'desk',     color: '#5a4a7a' },
    rack:     { x: 170, y: 620, w: 60, h: 88, sprite: 'rack',     color: '#3a6a72' },
    jobboard: { x: 170, y: 790, w: 58, h: 76, sprite: 'jobboard', color: '#7a5a3a' },
  },
  deliverySlots: [
    { x: 620, y: 1340 },
    { x: 860, y: 1340 },
    { x: 1080, y: 1340 },
  ],
  spawns: {
    player:     { x: 1100, y: 950 },
    workerIdle: { x: 1180, y: 1000 },
    // Courier by the door, technician between the benches, seller on the way
    // to the mailbox — each waits where their work starts.
    posts: {
      courier: { x: 620, y: 1080 },
      tech:    { x: 660, y: 560 },
      seller:  { x: 300, y: 1080 },
      manager: { x: 1300, y: 860 },
    },
  },
  theme: {
    bgColor:       '#1c2c1e',
    floorColor:    '#41563d',
    wallColor:     '#63795c',
    streetColor:   '#26302a',
    pavementColor: '#3a4a3c',
    floorTile:     'k_floor_concrete',
    floorTint:     '#8fa686',
    streetTile:    'k_asphalt',
    streetTint:    '#7e8a80',
  },
})

export const LAYOUTS = Object.freeze({ apartment, garage })

// The factory is not a constant: it is assembled from the halls that are open,
// so it needs the state to know which those are (F2).
export function layoutFor(locationId, state = null) {
  if (locationId === 'factory') return buildFactoryLayout(state?.unlockedHalls)
  return LAYOUTS[locationId] ?? apartment
}

export { rect } from './buildLayout.js'
