// Floor plans, one per location.
//
// Moving house used to change two colours (D7). A location is now a different
// room: bigger, with more bench slots and its own arrangement — which is what
// makes the move feel like progress rather than a palette swap.

import { buildLayout } from './buildLayout.js'

// ── Квартира — one bench, everything within a few steps.
// Deliberately small: with a single station and no staff, a big room is just
// walking. The garage is where space starts to matter.
export const apartment = buildLayout({
  id:    'apartment',
  world: { w: 820, h: 1250 },
  roomH: 880,
  door:  { x: 360, w: 170 },
  stationSlots: [
    // Deep enough into the room that the output side behind the bench is a
    // corridor a character can actually walk down (S1.2).
    { def: 'workbench', x: 420, y: 330 },
  ],
  props: {
    lamp:     { x: 420, y: 110, w: 40, h: 40, sprite: 'lamp',     color: '#d4c060', z: 2 },
    piggy:    { x: 130, y: 700, w: 46, h: 46, sprite: 'piggy',    color: '#d4607a' },
    mailbox:  { x: 150, y: 1090, w: 42, h: 34, sprite: 'mailbox',  color: '#3a5db8' },
    trashbin: { x: 690, y: 1090, w: 42, h: 46, sprite: 'trashbin', color: '#4a6a3a' },
    desk:     { x: 720, y: 470, w: 86, h: 52, sprite: 'desk',     color: '#5a4a7a' },
    rack:     { x: 120, y: 330, w: 58, h: 84, sprite: 'rack',     color: '#3a6a72' },
    jobboard: { x: 120, y: 520, w: 56, h: 72, sprite: 'jobboard', color: '#7a5a3a' },
  },
  deliverySlots: [
    { x: 360, y: 1000 },
    { x: 530, y: 1000 },
    { x: 680, y: 1000 },
  ],
  spawns: {
    player:     { x: 600, y: 700 },
    workerIdle: { x: 640, y: 730 },
    // No hiring in the apartment, but the posts keep the shape of the data the
    // same everywhere — a location never has to be a special case.
    posts: {
      courier: { x: 420, y: 780 },
      tech:    { x: 570, y: 500 },
      seller:  { x: 200, y: 830 },
    },
  },
  theme: { bgColor: '#0e0e18', floorColor: '#1a1a26' },
})

// ── Гараж — wider, two bench slots side by side, room to run ──
export const garage = buildLayout({
  id:    'garage',
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
    },
  },
  theme: { bgColor: '#0d1810', floorColor: '#1a2618' },
})

// ── Майстерня — a proper shop floor: three benches, long runs ──
export const workshop = buildLayout({
  id:    'workshop',
  world: { w: 2000, h: 1900 },
  roomH: 1400,
  door:  { x: 900, w: 240 },
  stationSlots: [
    { def: 'workbench', x: 420,  y: 380 },
    { def: 'workbench', x: 980,  y: 380 },
    { def: 'workbench', x: 1540, y: 380 },
  ],
  props: {
    lamp:     { x: 980, y: 130, w: 56, h: 56, sprite: 'lamp',     color: '#d4c060', z: 2 },
    piggy:    { x: 200, y: 1150, w: 46, h: 46, sprite: 'piggy',    color: '#d4607a' },
    mailbox:  { x: 300, y: 1650, w: 50, h: 40, sprite: 'mailbox',  color: '#3a5db8' },
    trashbin: { x: 1780, y: 1650, w: 50, h: 54, sprite: 'trashbin', color: '#4a6a3a' },
    desk:     { x: 1800, y: 860, w: 96, h: 58, sprite: 'desk',     color: '#5a4a7a' },
    rack:     { x: 220, y: 720, w: 62, h: 92, sprite: 'rack',     color: '#3a6a72' },
    jobboard: { x: 220, y: 900, w: 60, h: 78, sprite: 'jobboard', color: '#7a5a3a' },
  },
  deliverySlots: [
    { x: 900,  y: 1540 },
    { x: 1180, y: 1540 },
    { x: 1450, y: 1540 },
  ],
  spawns: {
    player:     { x: 1500, y: 1100 },
    workerIdle: { x: 1620, y: 1150 },
    posts: {
      courier: { x: 900, y: 1270 },
      tech:    { x: 980, y: 560 },
      seller:  { x: 380, y: 1280 },
    },
  },
  theme: { bgColor: '#180d18', floorColor: '#261a26' },
})

export const LAYOUTS = Object.freeze({ apartment, garage, workshop })

export function layoutFor(locationId) {
  return LAYOUTS[locationId] ?? apartment
}

export { rect } from './buildLayout.js'
