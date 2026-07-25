// Floor plans, one per location.
//
// Moving house used to change two colours (D7). A location is now a different
// room: bigger, with more bench slots and its own arrangement — which is what
// makes the move feel like progress rather than a palette swap.

import { buildLayout } from './buildLayout.js'

// ── Квартира — cramped, one bench, everything within a few steps ──
export const apartment = buildLayout({
  id:    'apartment',
  world: { w: 1000, h: 1500 },
  roomH: 1050,
  door:  { x: 420, w: 170 },
  stationSlots: [
    { def: 'workbench', x: 500, y: 300 },
  ],
  props: {
    lamp:     { x: 500, y: 130, w: 40, h: 40, sprite: 'lamp',     color: '#d4c060', z: 2 },
    piggy:    { x: 150, y: 880, w: 46, h: 46, sprite: 'piggy',    color: '#d4607a' },
    mailbox:  { x: 170, y: 1300, w: 42, h: 34, sprite: 'mailbox',  color: '#3a5db8' },
    trashbin: { x: 860, y: 1300, w: 42, h: 46, sprite: 'trashbin', color: '#4a6a3a' },
  },
  deliverySlots: [
    { x: 420, y: 1180 },
    { x: 640, y: 1180 },
    { x: 830, y: 1180 },
  ],
  spawns: {
    player:     { x: 720, y: 900 },
    workerIdle: { x: 760, y: 900 },
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
    { def: 'workbench', x: 420, y: 300 },
    { def: 'workbench', x: 900, y: 300 },
  ],
  props: {
    lamp:     { x: 660, y: 130, w: 48, h: 48, sprite: 'lamp',     color: '#d4c060', z: 2 },
    piggy:    { x: 170, y: 980, w: 46, h: 46, sprite: 'piggy',    color: '#d4607a' },
    mailbox:  { x: 230, y: 1450, w: 46, h: 38, sprite: 'mailbox',  color: '#3a5db8' },
    trashbin: { x: 1300, y: 1450, w: 46, h: 50, sprite: 'trashbin', color: '#4a6a3a' },
  },
  deliverySlots: [
    { x: 620, y: 1340 },
    { x: 860, y: 1340 },
    { x: 1080, y: 1340 },
  ],
  spawns: {
    player:     { x: 1100, y: 950 },
    workerIdle: { x: 1180, y: 1000 },
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
    { def: 'workbench', x: 420,  y: 300 },
    { def: 'workbench', x: 980,  y: 300 },
    { def: 'workbench', x: 1540, y: 300 },
  ],
  props: {
    lamp:     { x: 980, y: 130, w: 56, h: 56, sprite: 'lamp',     color: '#d4c060', z: 2 },
    piggy:    { x: 200, y: 1150, w: 46, h: 46, sprite: 'piggy',    color: '#d4607a' },
    mailbox:  { x: 300, y: 1650, w: 50, h: 40, sprite: 'mailbox',  color: '#3a5db8' },
    trashbin: { x: 1780, y: 1650, w: 50, h: 54, sprite: 'trashbin', color: '#4a6a3a' },
  },
  deliverySlots: [
    { x: 900,  y: 1540 },
    { x: 1180, y: 1540 },
    { x: 1450, y: 1540 },
  ],
  spawns: {
    player:     { x: 1500, y: 1100 },
    workerIdle: { x: 1620, y: 1150 },
  },
  theme: { bgColor: '#180d18', floorColor: '#261a26' },
})

export const LAYOUTS = Object.freeze({ apartment, garage, workshop })

export function layoutFor(locationId) {
  return LAYOUTS[locationId] ?? apartment
}

export { rect } from './buildLayout.js'
