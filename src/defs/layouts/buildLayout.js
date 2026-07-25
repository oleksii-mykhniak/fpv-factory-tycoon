// Floor-plan builder — the shared shape of every location.
//
// Locations differ in size, how many benches fit and where the props sit, not
// in how a room is put together. Writing each one out longhand meant the third
// would drift from the first; here a location is a parameter set and the walls,
// the door gap and the street derive themselves.

// Rect helper — carries both representations so callers never convert by hand:
//   cx/cy + w/h  → Excalibur actors (centre-based)
//   x/y + w/h    → AABB collision and grid rasterisation (top-left)
export function rect(cx, cy, w, h) {
  return { cx, cy, w, h, x: cx - w / 2, y: cy - h / 2 }
}

const WALL_SIDE  = 24
const WALL_HORIZ = 28

// Sizes of the entities that live in a world. Shared: a drone is a drone
// whichever room it is built in.
const SIZES = {
  character: 74,
  box:       { w: 52, h: 34 },
  drone:     { w: 40, h: 22 },
}

export function buildLayout({
  id,
  world,          // { w, h } total world size in units
  roomH,          // interior height; the street fills the rest
  door,           // { x, w } gap in the bottom wall
  stationSlots,   // [{ def, x, y }] where benches may stand
  props,          // { name: { x, y, w, h, sprite, color, z } }
  deliverySlots,  // [{ x, y }] street positions, indexed by delivery.slotIndex
  spawns,         // { player, workerIdle }
  theme,
}) {
  const walls = [
    rect(world.w / 2, WALL_HORIZ / 2, world.w, WALL_HORIZ),                     // top
    rect(WALL_SIDE / 2, roomH / 2, WALL_SIDE, roomH),                           // left
    rect(world.w - WALL_SIDE / 2, roomH / 2, WALL_SIDE, roomH),                 // right
    // Bottom wall, split by the door gap
    rect((door.x - door.w / 2) / 2, roomH - WALL_HORIZ / 2, door.x - door.w / 2, WALL_HORIZ),
    rect(
      (door.x + door.w / 2 + world.w) / 2,
      roomH - WALL_HORIZ / 2,
      world.w - (door.x + door.w / 2),
      WALL_HORIZ,
    ),
  ]

  const propRects = Object.fromEntries(
    Object.entries(props).map(([name, p]) => [
      name,
      { ...rect(p.x, p.y, p.w, p.h), sprite: p.sprite, color: p.color, z: p.z ?? 3 },
    ])
  )

  // Fixed trigger zones. Bench zones are NOT here: they are generated from the
  // stations that are actually built (C3), so buying one adds its own.
  const zones = [
    ...deliverySlots.map((slot, i) => ({
      id: `slot${i}`,
      kind: 'delivery_slot',
      ...rect(slot.x, slot.y, 150, 140),
      meta: { slotIndex: i },
    })),
    { id: 'mailbox',  kind: 'mailbox',  ...rect(props.mailbox.x, props.mailbox.y, 150, 150) },
    { id: 'trashbin', kind: 'trashbin', ...rect(props.trashbin.x, props.trashbin.y, 150, 150) },
    { id: 'piggy',    kind: 'piggy',    ...rect(props.piggy.x, props.piggy.y, 140, 140) },
  ]

  return {
    id,
    world,
    room:   { w: world.w, h: roomH },
    street: { y: roomH, h: world.h - roomH },
    door:   { ...door, y: roomH - WALL_HORIZ },
    walls,
    // Stations are added to `obstacles` at runtime from stationSlots.
    obstacles: [...walls],
    doorVoid:  rect(door.x, roomH - WALL_HORIZ / 2, door.w, WALL_HORIZ),
    stationSlots,
    props: propRects,
    zones,
    spawns: {
      ...spawns,
      door:          { x: door.x, y: roomH - WALL_HORIZ - 30 },
      deliverySlots,
      // Serving spot for the first station, kept in step with its slot.
      bench:    { x: stationSlots[0].x, y: stationSlots[0].y + 86 },
      benchTop: { x: stationSlots[0].x, y: stationSlots[0].y },
    },
    sizes: SIZES,
    theme,
  }
}
