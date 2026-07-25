// Floor plan for the "Квартира" location.
//
// Everything is in fixed world units (not fractions of the screen), because the
// world is now larger than the viewport and must not change shape with the
// device. The camera decides how much of it you see.
//
// Adding a location = adding another file like this one. Nothing in scene.js,
// the nav grid (C4) or the zone system (C2) is location-specific: obstacles feed
// collision and pathfinding, props feed rendering, spawns feed placement.

// Rect helper — carries both representations so callers never convert by hand:
//   cx/cy + w/h  → Excalibur actors (centre-based)
//   x/y + w/h    → AABB collision and grid rasterisation (top-left)
export function rect(cx, cy, w, h) {
  return { cx, cy, w, h, x: cx - w / 2, y: cy - h / 2 }
}

const WORLD_W = 1000
const WORLD_H = 1500

// Room occupies the top of the world; the street strip runs below it.
const ROOM_H     = 1050
const WALL_SIDE  = 24
const WALL_HORIZ = 28
const DOOR_X     = 420   // centre of the door gap
const DOOR_W     = 170   // wide enough for a character (half-width 20) plus slack

// Named so the renderer can draw them and the physics can collide with them
// from the same source — an index into a flat obstacle list would drift.
const walls = [
  rect(WORLD_W / 2, WALL_HORIZ / 2, WORLD_W, WALL_HORIZ),                        // top
  rect(WALL_SIDE / 2, ROOM_H / 2, WALL_SIDE, ROOM_H),                            // left
  rect(WORLD_W - WALL_SIDE / 2, ROOM_H / 2, WALL_SIDE, ROOM_H),                  // right
  // Bottom wall, split by the door gap
  rect((DOOR_X - DOOR_W / 2) / 2, ROOM_H - WALL_HORIZ / 2, DOOR_X - DOOR_W / 2, WALL_HORIZ),
  rect(
    (DOOR_X + DOOR_W / 2 + WORLD_W) / 2,
    ROOM_H - WALL_HORIZ / 2,
    WORLD_W - (DOOR_X + DOOR_W / 2),
    WALL_HORIZ,
  ),
]

export const apartment = {
  id:    'apartment',
  world: { w: WORLD_W, h: WORLD_H },

  room:   { w: WORLD_W, h: ROOM_H },
  street: { y: ROOM_H, h: WORLD_H - ROOM_H },
  door:   { x: DOOR_X, w: DOOR_W, y: ROOM_H - WALL_HORIZ },

  walls,

  // Solid geometry: blocks movement (C1) and will be rasterised into the nav
  // grid (C4). Stations are NOT listed here — they are built from stationSlots
  // at runtime, so buying a second bench adds its footprint automatically.
  obstacles: [...walls],

  // Where stations may stand. How many are actually built comes from the
  // `benches` upgrade; the rest of the slots stay empty (C3).
  stationSlots: [
    { def: 'workbench', x: 500, y: 220 },
    { def: 'workbench', x: 500, y: 480 },
    { def: 'workbench', x: 500, y: 740 },
  ],

  // Door void — drawn dark so the gap reads as an opening, not missing wall.
  doorVoid: rect(DOOR_X, ROOM_H - WALL_HORIZ / 2, DOOR_W, WALL_HORIZ),

  // Drawn objects. `sprite` is looked up in the sprite manifest; a missing
  // sprite falls back to the flat colour (loader.js is graceful).
  props: {
    lamp:      { ...rect(500, 150, 40, 40),  sprite: 'lamp',     color: '#d4c060', z: 2 },
    piggy:     { ...rect(150, 880, 46, 46),  sprite: 'piggy',    color: '#d4607a', z: 3 },
    mailbox:   { ...rect(170, 1300, 42, 34), sprite: 'mailbox',  color: '#3a5db8', z: 3 },
    trashbin:  { ...rect(860, 1300, 42, 46), sprite: 'trashbin', color: '#4a6a3a', z: 3 },
  },

  // Named positions the sim and the puppet navigate to.
  spawns: {
    player:      { x: 720, y: 900 },
    workerIdle:  { x: 760, y: 900 },
    // Just inside the door — the puppet's waypoint when crossing the threshold.
    door:        { x: DOOR_X, y: ROOM_H - WALL_HORIZ - 30 },
    // Where the worker puppet stands to serve the first station, and where a
    // box lands on it. Derived from stationSlots[0] so the two cannot drift.
    bench:       { x: 500, y: 220 + 40 + 46 },
    benchTop:    { x: 500, y: 220 },
    // Street slots for arriving deliveries, indexed by delivery.slotIndex.
    deliverySlots: [
      { x: DOOR_X, y: 1180 },
      { x: 640,    y: 1180 },
      { x: 830,    y: 1180 },
    ],
  },

  // Trigger zones (C2). `kind` selects behaviour from defs/interactions.js;
  // geometry lives here because it is part of the floor plan. Zones are drawn
  // generously — a character should not have to be pixel-accurate to interact.
  zones: [
    { id: 'slot0',    kind: 'delivery_slot', ...rect(DOOR_X, 1180, 150, 140), meta: { slotIndex: 0 } },
    { id: 'slot1',    kind: 'delivery_slot', ...rect(640,   1180, 150, 140), meta: { slotIndex: 1 } },
    { id: 'slot2',    kind: 'delivery_slot', ...rect(830,   1180, 150, 140), meta: { slotIndex: 2 } },
    { id: 'mailbox',  kind: 'mailbox',  ...rect(170, 1300, 150, 150) },
    { id: 'trashbin', kind: 'trashbin', ...rect(860, 1300, 150, 150) },
    { id: 'piggy',    kind: 'piggy',    ...rect(150, 880,  140, 140) },
  ],

  // Sizes of the entities that live in this world (world units, not fractions).
  sizes: {
    character: 74,
    box:       { w: 52, h: 34 },
    drone:     { w: 40, h: 22 },
  },

  theme: { bgColor: '#0e0e18', floorColor: '#1a1a26' },
}

export default apartment
