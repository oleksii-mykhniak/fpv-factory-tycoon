// Floor-plan builder — the shared shape of every location.
//
// Locations differ in size, how many benches fit and where the props sit, not
// in how a room is put together. Writing each one out longhand meant the third
// would drift from the first; here a location is a parameter set and the walls,
// the door gap and the street derive themselves.

// Rect helper — carries both representations so callers never convert by hand:
//   cx/cy + w/h  → Excalibur actors (centre-based)
//   x/y + w/h    → AABB collision and grid rasterisation (top-left)
import { u } from '../../state/config.js'

export function rect(cx, cy, w, h) {
  return { cx, cy, w, h, x: cx - w / 2, y: cy - h / 2 }
}

// Walls, also in character heights: a third of a person thick reads as a wall
// without eating the room.
export const WALL_SIDE  = u(0.32)
export const WALL_HORIZ = u(0.38)

// Sizes of the entities that live in a world, in character heights (V1).
// Shared: a drone is a drone whichever room it is built in.
export const SIZES = {
  character: u(1),
  box:       { w: u(0.70), h: u(0.46) },
  drone:     { w: u(0.54), h: u(0.30) },
}

// Interior partitions (V2) — what turns one hall into a flat with rooms.
//
// A partition is a wall segment with holes in it, not a separate concept: it
// produces the same rects as the outer walls and the same painted gaps as the
// front door, so obstacles, the nav grid and the scene all handle it already.
//
//   { axis: 'v'|'h', at, from, to, gaps: [{ at, size }] }
//
// `from`/`to` let a wall stop halfway, which is how a room opens onto a hallway
// without needing a doorway at all — the safest kind of opening, because there
// is nothing narrow for the pathfinder to miss.
function partitionRects(part) {
  const vertical  = part.axis === 'v'
  const thickness = vertical ? WALL_SIDE : WALL_HORIZ
  const gaps = [...(part.gaps ?? [])].sort((a, b) => a.at - b.at)

  const walls = []
  const voids = []
  let cursor = part.from

  for (const gap of gaps) {
    const gapStart = gap.at - gap.size / 2
    const gapEnd   = gap.at + gap.size / 2
    if (gapStart > cursor) {
      const len = gapStart - cursor
      walls.push(vertical
        ? rect(part.at, cursor + len / 2, thickness, len)
        : rect(cursor + len / 2, part.at, len, thickness))
    }
    voids.push(vertical
      ? rect(part.at, gap.at, thickness, gap.size)
      : rect(gap.at, part.at, gap.size, thickness))
    cursor = gapEnd
  }

  if (cursor < part.to) {
    const len = part.to - cursor
    walls.push(vertical
      ? rect(part.at, cursor + len / 2, thickness, len)
      : rect(cursor + len / 2, part.at, len, thickness))
  }

  return { walls, voids }
}

export function buildLayout({
  id,
  world,          // { w, h } total world size in units
  roomH,          // interior height; the street fills the rest
  door,           // { x, w } gap in the bottom wall
  partitions = [],// interior walls — see partitionRects
  stationSlots,   // [{ def, x, y }] where benches may stand
  props,          // { name: { x, y, w, h, sprite, color, z } }
  deliverySlots,  // [{ x, y }] street positions, indexed by delivery.slotIndex
  spawns,         // { player, workerIdle, posts: { courier, tech, seller } }
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

  const interior = partitions.map(partitionRects)
  walls.push(...interior.flatMap(p => p.walls))

  const propRects = Object.fromEntries(
    Object.entries(props).map(([name, p]) => [
      name,
      { ...rect(p.x, p.y, p.w, p.h), sprite: p.sprite, color: p.color, z: p.z ?? 3 },
    ])
  )

  // Fixed trigger zones. Bench zones are NOT here: they are generated from the
  // stations that are actually built (C3), so buying one adds its own.
  // A zone exists only where its prop does. That is the whole implementation of
  // "the factory has no salvage bin" (F1.3): leave the bin out of the props and
  // the zone, the guidance arrow and the interaction all follow, because each
  // of them iterates the zones that exist rather than assuming a fixed set.
  const zoneIfProp = (name, kind, w, h) =>
    props[name] ? [{ id: name, kind, ...rect(props[name].x, props[name].y, w, h) }] : []

  const zones = [
    ...deliverySlots.map((slot, i) => ({
      id: `slot${i}`,
      kind: 'delivery_slot',
      ...rect(slot.x, slot.y, 150, 140),
      meta: { slotIndex: i },
    })),
    { id: 'mailbox',  kind: 'mailbox',  ...rect(props.mailbox.x, props.mailbox.y, 150, 150) },
    ...zoneIfProp('trashbin', 'trashbin', 150, 150),
    ...zoneIfProp('piggy',    'piggy',    140, 140),
    // S2: the panels the bottom bar used to hold are objects in the room now.
    // Each is a prop with a zone in front of it — you walk up to the laptop to
    // order a kit, to the rack to buy an upgrade, to the board to hire.
    { id: 'desk',     kind: 'desk',     ...rect(props.desk.x, props.desk.y, 160, 150) },
    { id: 'rack',     kind: 'rack',     ...rect(props.rack.x, props.rack.y, 150, 150) },
    { id: 'jobboard', kind: 'jobboard', ...rect(props.jobboard.x, props.jobboard.y, 150, 150) },
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
    // Painted gaps in the walls. An array because the factory has one per
    // hall divider as well as the street door (F2).
    doorVoids: [
      rect(door.x, roomH - WALL_HORIZ / 2, door.w, WALL_HORIZ),
      ...interior.flatMap(p => p.voids),
    ],
    stationSlots,
    props: propRects,
    zones,
    spawns: {
      // Every role has a post to stand at (S1.5). Falling back to one shared
      // idle spot put the whole payroll in a huddle by the door, which read as
      // a queue of people waiting to be told what to do.
      posts: spawns.posts ?? {},
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
