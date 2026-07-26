// Floor plans, one per location.
//
// Moving house used to change two colours (D7). A location is now a different
// room: bigger, with more bench slots and its own arrangement — which is what
// makes the move feel like progress rather than a palette swap.

import { buildLayout } from './buildLayout.js'
import { buildFactoryLayout } from './factory.js'

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
  props: {
    lamp:     { x: 300, y: 90,  w: 40, h: 40, sprite: 'lamp',     color: '#d4c060', z: 2 },
    rack:     { x: 110, y: 470, w: 58, h: 84, sprite: 'rack',     color: '#3a6a72' },
    jobboard: { x: 110, y: 180, w: 56, h: 72, sprite: 'jobboard', color: '#7a5a3a' },
    // The laptop lives on the kitchen table — this is a shop run from home.
    desk:     { x: 820, y: 300, w: 86, h: 52, sprite: 'desk',     color: '#5a4a7a' },
    piggy:    { x: 120, y: 790, w: 46, h: 46, sprite: 'piggy',    color: '#d4607a' },
    // Post box and bin are outside the front door, like anybody's.
    mailbox:  { x: 250, y: 1180, w: 42, h: 34, sprite: 'mailbox',  color: '#3a5db8' },
    trashbin: { x: 780, y: 1180, w: 42, h: 46, sprite: 'trashbin', color: '#4a6a3a' },
  },
  // Furniture that does nothing (V3). This is a home: the bench sits in
  // somebody's living room, and the whole point of the first location is that
  // you can see that.
  // Colours are chosen against the floor, not in isolation: the first pass used
  // dark furniture that vanished the moment the floor was lightened.
  decor: [
    { sprite: 'rug',     x: 320, y: 470, w: 260, h: 170, color: '#7d4a5c', z: 0.6 },
    { sprite: 'bed',     x: 480, y: 130, w: 150, h: 210, color: '#8f83b8', z: 2, solid: true },
    { sprite: 'sofa',    x: 120, y: 690, w: 170, h: 70,  color: '#5f83ad', z: 2, solid: true },
    { sprite: 'plant',   x: 570, y: 540, w: 46,  h: 62,  color: '#4f9e5c', z: 2 },
    { sprite: 'poster',  x: 300, y: 40,  w: 90,  h: 12,  color: '#cbb96e', z: 1 },
    // Kitchen nook
    { sprite: 'counter', x: 900, y: 120, w: 150, h: 70,  color: '#bda98a', z: 2, solid: true },
    { sprite: 'fridge',  x: 730, y: 110, w: 70,  h: 90,  color: '#d2dade', z: 2, solid: true },
    { sprite: 'chair',   x: 820, y: 430, w: 50,  h: 50,  color: '#a67c4c', z: 2 },
    // Hallway
    { sprite: 'shoes',   x: 620, y: 880, w: 60,  h: 26,  color: '#2f2d3a', z: 1 },
    { sprite: 'coatrack', x: 880, y: 720, w: 44, h: 80,  color: '#8d6c49', z: 2 },
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
  },
})

// ── Гараж — wider, two bench slots side by side, room to run ──
export const garage = buildLayout({
  id:    'garage',
  decor: [
    { sprite: 'oil_stain', x: 700, y: 700, w: 220, h: 140, color: '#26301f', z: 0.4 },
    { sprite: 'tyres',   x: 1380, y: 200, w: 90, h: 90, color: '#2a2a30', z: 2, solid: true },
    { sprite: 'tyres',   x: 1380, y: 320, w: 90, h: 90, color: '#24242a', z: 2, solid: true },
    { sprite: 'toolbox', x: 180,  y: 980, w: 90, h: 60, color: '#b2532f', z: 2, solid: true },
    { sprite: 'shelf',   x: 760,  y: 90,  w: 220, h: 54, color: '#8d8168', z: 2, solid: true },
    { sprite: 'barrel',  x: 1360, y: 980, w: 64, h: 64, color: '#7d9c4e', z: 2, solid: true },
    { sprite: 'plant',   x: 120,  y: 700, w: 46, h: 62, color: '#4f9e5c', z: 2 },
    { sprite: 'poster',  x: 900,  y: 40,  w: 110, h: 12, color: '#cbb96e', z: 1 },
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
