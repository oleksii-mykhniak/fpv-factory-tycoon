import * as ex from 'excalibur'
import { Phase, DeliveryStatus, KIT_TYPES } from '../state/gameState.js'
import {
  VIEW_HEIGHT_UNITS, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX,
  CAMERA_ELASTICITY, CAMERA_FRICTION,
  PIGGY_COOLDOWN_MS,
  PULSE_FREQ_HZ, PULSE_SCALE_AMP,
  CHARACTER_U as TILE_U,
  CHARACTER_ART,
} from '../state/config.js'
import { loadSprites, getSprite } from './loader.js'
import { createCharacterSprite, createTileCharacter } from './character.js'
import { roleColor, roleBadge } from '../defs/roles.js'

// How many carried items the stack can show at once. The gameplay limit is
// CARRY_CAPACITY in config; this is only how many actors exist to draw.
const CARRY_STACK_SLOTS = 3

// Floor markings (S1.3): one colour per kind of trigger zone, so the room says
// what each patch of floor is for. Dim by default, lit when the player could
// actually do something by standing there.
const ZONE_PAINT = {
  delivery_slot: '#3a5db8',
  bench:         '#c49a3c',
  bench_out:     '#4fbf6a',
  mailbox:       '#7a5ad8',
  trashbin:      '#4a6a3a',
  piggy:         '#d4607a',
  desk:          '#8a6ad8',
  rack:          '#3a9aa8',
  jobboard:      '#c08a40',
}
export const ZONE_FILL_DIM  = 0.07
export const ZONE_FILL_LIVE = 0.20
export const ZONE_EDGE_DIM  = 0.22
export const ZONE_EDGE_LIVE = 0.75

// The scene is a *projection* of the simulation (C0): it never owns gameplay
// state. Two hooks connect it to the sim:
//   getWorld()            — read-only access, called from preupdate closures
//   onIntent(type, data)  — one channel for everything the player or the puppet
//                           wants the sim to know (taps, animation milestones)
//
// Before C0 this file mirrored eight pieces of state in module-level variables
// and took ten callbacks. Both are gone; adding an interactive object now costs
// one onIntent call, not a callback threaded through three files.

const BG = ex.Color.fromHex('#0e0e18')

// Stored after initScene: the engine and scene outlive a move, everything the
// floor plan produced does not.
let _engine     = null
let _scene      = null
let _floorActor = null
// Every actor belonging to the current layout. Moving house kills these and
// builds the next room from scratch (C7) — a location is a different place now,
// not a different palette.
let _built      = []

function track(actor) {
  _built.push(actor)
  return actor
}

// ── Helpers ───────────────────────────────────────────────

function fmtSlotTime(ms) {
  const s = Math.ceil(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function colorRect(scene, { x, y, w, h, hex, z = 0 }) {
  const a = new ex.Actor({
    pos: ex.vec(x, y),
    width: w,
    height: h,
    z,
    color: ex.Color.fromHex(hex),
  })
  scene.add(a)
  return track(a)
}

// Pulse utility: sine-wave scale on actor while active.
// Returns { start, stop } controller.
// A pulse for an actor that may not exist here (F1.3: no bin in the factory).
// Returning a no-op keeps every caller free of null checks.
function addPulse(actor) {
  if (!actor) return { start: () => {}, stop: () => {} }
  let active = false
  actor.on('preupdate', () => {
    if (!active) return
    const t = Date.now() / 1000
    const s = 1 + PULSE_SCALE_AMP * Math.sin(t * Math.PI * 2 * PULSE_FREQ_HZ)
    actor.scale = ex.vec(s, s)
  })
  return {
    start: () => { active = true },
    stop:  () => { active = false; actor.scale = ex.vec(1, 1) },
  }
}

// ── Layout ────────────────────────────────────────────────
//
// Geometry comes from defs/layouts/<location>.js in fixed world units. Nothing
// here is expressed as a fraction of the screen any more: the world is larger
// than the viewport and must look the same on every device.

function buildRoom(scene, layout) {
  const { world, room, street, walls, doorVoids, props, theme } = layout

  // ── Street (below the building) ────────────────────────
  colorRect(scene, {
    x: world.w / 2, y: street.y + street.h / 2, w: world.w, h: street.h,
    hex: theme.streetColor ?? '#1c1c2c', z: 0,
  })
  // Lighter sidewalk band just outside the door
  colorRect(scene, {
    x: world.w / 2, y: street.y + street.h * 0.10, w: world.w, h: street.h * 0.18,
    hex: theme.pavementColor ?? '#33334a', z: 0,
  })

  // ── Room floor ─────────────────────────────────────────
  // The painted rectangle stays underneath as the backdrop: the tile grid can
  // only cover whole tiles, and a room whose size is not a round number of them
  // would otherwise show through to the background at the edges.
  const floor = colorRect(scene, {
    x: room.w / 2, y: room.h / 2, w: room.w, h: room.h,
    hex: theme.floorColor, z: 0,
  })

  // Tiled floors (V6). ex.TileMap rather than one actor per tile: it culls to
  // the camera, so the three-hall factory draws the dozen tiles on screen
  // instead of the thirteen hundred that exist.
  tileFloor(scene, theme.floorTile, 0, 0, room.w, room.h, 0.2)
  tileFloor(scene, theme.streetTile, 0, street.y, world.w, street.h, 0.2)

  // ── Conveyor (F3) ──────────────────────────────────────
  // Drawn on the floor rather than as an obstacle: characters walk over the
  // belt, which is what keeps it out of the nav grid entirely.
  const belt = layout.conveyor
  if (belt) {
    const beltW = belt.x1 - belt.x0
    colorRect(scene, {
      x: (belt.x0 + belt.x1) / 2, y: belt.y, w: beltW, h: 54, hex: '#232336', z: 0.4,
    })
    // Cross-slats, so the belt reads as moving even when it is empty.
    for (let x = belt.x0 + 20; x < belt.x1; x += 46) {
      colorRect(scene, { x, y: belt.y, w: 6, h: 46, hex: '#31314a', z: 0.5 })
    }
    for (const drop of belt.drops) {
      colorRect(scene, { x: drop.x, y: belt.y + 44, w: 120, h: 10, hex: '#4a6a3a', z: 0.5 })
    }
  }

  // ── Walls + door opening ───────────────────────────────
  // Three strips, not one flat rectangle: body, a lit top edge and a shadow
  // where the wall meets the floor. The same light every object in the game is
  // drawn with — a flat wall next to shaded furniture is what made the room
  // look like two different games.
  const wallBody   = theme.wallColor  ?? '#55526e'
  const wallEdge   = theme.wallEdge   ?? '#6b7284'
  const wallShadow = theme.wallShadow ?? '#242232'
  for (const wall of walls) {
    colorRect(scene, { x: wall.cx, y: wall.cy, w: wall.w, h: wall.h, hex: wallBody, z: 1 })
    const lip = Math.max(3, Math.round(Math.min(wall.w, wall.h) * 0.22))
    if (wall.h > wall.w) {
      // Vertical wall: light down its left face, shadow down the right.
      colorRect(scene, { x: wall.x + lip / 2, y: wall.cy, w: lip, h: wall.h, hex: wallEdge, z: 1.01 })
      colorRect(scene, { x: wall.x + wall.w - lip / 2, y: wall.cy, w: lip, h: wall.h, hex: wallShadow, z: 1.01 })
    } else {
      colorRect(scene, { x: wall.cx, y: wall.y + lip / 2, w: wall.w, h: lip, hex: wallEdge, z: 1.01 })
      colorRect(scene, { x: wall.cx, y: wall.y + wall.h - lip / 2, w: wall.w, h: lip, hex: wallShadow, z: 1.01 })
    }
  }
  for (const gap of doorVoids ?? []) {
    // A doorway is a hole, so it is painted with whatever is on the other side
    // of the wall rather than with black.
    colorRect(scene, { x: gap.cx, y: gap.cy, w: gap.w, h: gap.h, hex: theme.doorColor ?? theme.floorColor, z: 1 })
  }

  // ── Decor (V3) ─────────────────────────────────────────
  // Drawn before the props so furniture never covers something you can walk up
  // to. Tall pieces are y-sorted by their FEET, like characters — sorting a
  // wardrobe by its centre puts a person standing in front of it behind it.
  for (const d of layout.decor ?? []) {
    const actor = new ex.Actor({
      pos:    ex.vec(d.cx, d.cy),
      width:  d.w,
      height: d.h,
      z:      d.z <= 1 ? d.z : (d.cy + d.h / 2) * 0.01,
      color:  ex.Color.fromHex(d.color ?? '#3a3a4a'),
    })
    scene.add(actor)
    track(actor)
    applySprite(actor, d.sprite)
  }

  // ── Props ──────────────────────────────────────────────
  // One actor per entry in layout.props; a new object in the layout appears
  // here automatically.
  const actors = {}
  for (const [name, p] of Object.entries(props)) {
    const actor = new ex.Actor({
      pos:    ex.vec(p.cx, p.cy),
      width:  p.w,
      height: p.h,
      z:      p.z,
      color:  ex.Color.fromHex(p.color),
    })
    scene.add(actor)
    track(actor)
    applySprite(actor, p.sprite)
    actors[name] = actor
  }

  // Small hand-placed details that read better than a flat rectangle. Matched by
  // prefix, not by exact name: the factory has one post box per hall (F4), and
  // looking up a single `props.mailbox` is what made the whole scene throw there.
  for (const [name, p] of Object.entries(props)) {
    if (name.startsWith('mailbox'))
      colorRect(scene, { x: p.cx, y: p.cy - p.h * 0.34, w: p.w, h: 5, hex: '#2244a0', z: 4 })
    if (name.startsWith('trashbin'))
      colorRect(scene, { x: p.cx, y: p.cy - p.h * 0.46, w: p.w * 1.1, h: 6, hex: '#3a5a2a', z: 4 })
  }

  return { floor, ...actors }
}

// Lays `spriteKey` over a rectangle as a culled tile map. One tile is one
// character height (V4), so the grid reads at the same scale as everything
// standing on it. No-ops when the sprite is missing — the painted floor below
// is a complete picture on its own.
function tileFloor(scene, spriteKey, x, y, w, h, z) {
  if (!spriteKey) return null

  // Three variants per material. One tile repeated across a room reads as
  // wallpaper — the eye finds the period immediately. The variants differ only
  // in grain, never in base colour, so the floor still reads as one surface.
  const variants = [0, 1, 2]
    .map(i => getSprite(`${spriteKey}_${i}`))
    .filter(Boolean)
  const sources = variants.length ? variants : [getSprite(spriteKey)].filter(Boolean)
  if (!sources.length) return null

  const size = TILE_U
  const map = new ex.TileMap({
    pos: ex.vec(x, y),
    tileWidth: size, tileHeight: size,
    // Floor, not ceil: a partial tile would hang over the edge of the world.
    // The painted rectangle underneath covers the leftover strip.
    columns: Math.max(1, Math.floor(w / size)), rows: Math.max(1, Math.floor(h / size)),
  })
  map.z = z

  const sprites = sources.map(src => {
    const s = src.toSprite()
    s.width = size
    s.height = size
    return s
  })

  // Deterministic scatter: the same cell always gets the same variant, so the
  // floor does not shimmer when the scene is rebuilt.
  map.tiles.forEach((tile, i) => {
    const col = i % map.columns
    const row = Math.floor(i / map.columns)
    tile.addGraphic(sprites[(col * 7 + row * 13) % sprites.length])
  })
  scene.add(map)
  track(map)
  return map
}

// ── Sprite swap ───────────────────────────────────────────

function applySprite(actor, key) {
  const src = getSprite(key)
  if (!src) return
  const sprite = src.toSprite()
  sprite.width  = actor.width
  sprite.height = actor.height
  actor.graphics.use(sprite)
}

// ── Bench progress (auto / semi-auto soldering indicator) ─
//
// Rendered as Excalibur actors positioned above a workbench actor in world
// space. Intentionally scene-native so future multi-bench layouts get one
// progress card per bench automatically.
function createBenchProgress(scene, benchActor) {
  const add = (a) => { scene.add(track(a)); return a }
  const BW    = benchActor.width
  const BH    = benchActor.height
  const CARD_W = Math.min(BW * 0.88, 210)
  const CARD_H = 52
  const GAP    = 6

  const cx  = benchActor.pos.x
  const cy  = benchActor.pos.y - BH / 2 - GAP - CARD_H / 2

  const BAR_W    = CARD_W * 0.80
  const BAR_H    = 5
  const barY     = cy + CARD_H * 0.28
  const LEFT_X   = cx - BAR_W / 2
  const MAX_DOTS = 8
  const DOT_R    = 3
  const DOT_GAP  = DOT_R * 2.8

  let running  = false
  let elapsed  = 0
  let duration = 2000

  // Card border (1px wider on each side, rendered behind the fill)
  const cardBorder = new ex.Actor({
    pos: ex.vec(cx, cy), width: CARD_W + 2, height: CARD_H + 2,
    z: 11, color: ex.Color.fromHex('#3a4a80'),
  })
  cardBorder.graphics.visible = false
  add(cardBorder)

  // Card background
  const card = new ex.Actor({
    pos: ex.vec(cx, cy), width: CARD_W, height: CARD_H,
    z: 12, color: ex.Color.fromHex('#1c1c38'),
  })
  card.graphics.visible = false
  add(card)

  // Step label
  const stepLbl = new ex.Label({
    text: '',
    pos:  ex.vec(cx, cy - CARD_H * 0.16),
    color: ex.Color.fromHex('#cce0ff'),
    font: new ex.Font({ size: 11, family: 'monospace', textAlign: ex.TextAlign.Center }),
    z: 13,
  })
  stepLbl.graphics.visible = false
  add(stepLbl)

  // Progress dots — small square actors (more reliable than ex.Circle in WebGL)
  const DOT_SZ = DOT_R * 2
  const dotActors = Array.from({ length: MAX_DOTS }, () => {
    const d = new ex.Actor({
      pos: ex.vec(cx, cy + CARD_H * 0.08), width: DOT_SZ, height: DOT_SZ,
      z: 13, color: ex.Color.fromHex('#6868a0'),
    })
    d.graphics.visible = false
    add(d)
    return d
  })

  // Timer bar background
  const barBg = new ex.Actor({
    pos: ex.vec(cx, barY), width: BAR_W, height: BAR_H + 2,
    z: 13, color: ex.Color.fromHex('#3a3a60'),
  })
  barBg.graphics.visible = false
  add(barBg)

  // Timer bar fill — uses graphic swap for left-to-right fill
  const barFill = new ex.Actor({ pos: ex.vec(cx, barY), z: 14 })
  barFill.graphics.visible = false
  add(barFill)
  barFill.on('preupdate', (evt) => {
    if (!running) return
    elapsed += evt.delta
    const p = Math.max(Math.min(elapsed / duration, 1), 0.01)
    const fillW = Math.max(BAR_W * p, 2)
    barFill.graphics.use(new ex.Rectangle({ width: fillW, height: BAR_H + 2, color: ex.Color.fromHex('#7aa0ff') }))
    barFill.pos.x = LEFT_X + fillW / 2
  })

  // Result toast — card + label that fade out
  const TOAST_H = 28
  const toastCard = new ex.Actor({
    pos: ex.vec(cx, cy), width: CARD_W, height: TOAST_H,
    z: 12, color: ex.Color.fromHex('#0a1e0e'),
  })
  toastCard.graphics.visible = false
  add(toastCard)

  const toastLbl = new ex.Label({
    text:  '',
    pos:   ex.vec(cx, cy),
    color: ex.Color.fromHex('#7de07d'),
    font:  new ex.Font({ size: 13, family: 'monospace', textAlign: ex.TextAlign.Center }),
    z: 13,
  })
  toastLbl.graphics.visible = false
  add(toastLbl)

  let toastAge = 0, toastDur = 0, toasting = false
  toastCard.on('preupdate', (evt) => {
    if (!toasting) return
    toastAge += evt.delta
    if (toastAge >= toastDur) {
      toasting = false
      toastCard.graphics.visible = false
      toastLbl.graphics.visible  = false
      return
    }
    const fadeStart = toastDur * 0.55
    const a = toastAge > fadeStart
      ? 1 - (toastAge - fadeStart) / (toastDur - fadeStart)
      : 1
    toastCard.graphics.opacity = a
    toastLbl.graphics.opacity  = a
  })

  function _placeDots(total, done) {
    const dotsW  = (total - 1) * DOT_GAP
    const startX = cx - dotsW / 2
    const dotY   = cy + CARD_H * 0.08
    dotActors.forEach((d, i) => {
      if (i < total) {
        d.pos = ex.vec(startX + i * DOT_GAP, dotY)
        const col = ex.Color.fromHex(i < done ? '#7de07d' : '#6868a0')
        d.graphics.use(new ex.Rectangle({ width: DOT_SZ, height: DOT_SZ, color: col }))
        d.graphics.visible = true
      } else {
        d.graphics.visible = false
      }
    })
  }

  function _resetBar() {
    elapsed = 0
    barFill.pos.x = LEFT_X + 1
    barFill.graphics.use(new ex.Rectangle({ width: 2, height: BAR_H + 2, color: ex.Color.fromHex('#7aa0ff') }))
  }

  function startStep(lbl, total, done, durationMs) {
    elapsed  = 0
    duration = durationMs
    running  = true
    stepLbl.text = lbl
    cardBorder.graphics.visible = true
    card.graphics.visible     = true
    stepLbl.graphics.visible  = true
    barBg.graphics.visible    = true
    barFill.graphics.visible  = true
    _resetBar()
    _placeDots(total, done)
    toasting = false
    toastCard.graphics.visible = false
    toastLbl.graphics.visible  = false
  }

  function advanceDots(total, done) {
    elapsed = 0
    _resetBar()
    _placeDots(total, done)
  }

  function hide() {
    running = false
    cardBorder.graphics.visible = false
    card.graphics.visible    = false
    stepLbl.graphics.visible = false
    barBg.graphics.visible   = false
    barFill.graphics.visible = false
    dotActors.forEach(d => { d.graphics.visible = false })
  }

  function showResult(text, durationMs = 2200) {
    hide()
    toastLbl.text = text
    toastCard.graphics.opacity = 1
    toastLbl.graphics.opacity  = 1
    toastCard.graphics.visible = true
    toastLbl.graphics.visible  = true
    toastAge = 0
    toastDur = durationMs
    toasting = true
  }

  return { startStep, advanceDots, hide, showResult }
}

// ── Scene entry point ─────────────────────────────────────

export async function initScene(canvas, { getWorld, onIntent, onLoadProgress, layout, world }) {
  const engine = new ex.Engine({
    canvasElement: canvas,
    backgroundColor: BG,
    displayMode: ex.DisplayMode.FillScreen,
    antialiasing: false,
  })
  _engine = engine

  await loadSprites(onLoadProgress)
  await engine.start()

  _scene = engine.currentScene

  // Zoom shows a constant slice of the world instead of a constant pixel size,
  // so a phone and a tablet see the same amount of game (C1.1).
  _scene.camera.zoom = Math.max(
    CAMERA_ZOOM_MIN,
    Math.min(CAMERA_ZOOM_MAX, engine.drawHeight / VIEW_HEIGHT_UNITS),
  )

  return buildFloor({ getWorld, onIntent, layout, world })
}

// Tears down the current room and builds another one. Everything the floor plan
// produced is tracked, so a move is a real change of place: different size,
// different walls, different bench slots, its own nav grid.
export function rebuildScene({ getWorld, onIntent, layout, world }) {
  for (const actor of _built) actor.kill()
  _built = []
  return buildFloor({ getWorld, onIntent, layout, world })
}

function buildFloor({ getWorld, onIntent, layout, world }) {
  const engine = _engine
  const scene  = _scene

  const { floor, piggy, ...propActors } = buildRoom(scene, layout)
  _floorActor = floor

  // ── Stations (C3) ──────────────────────────────────────
  // One actor + one progress card per built station, placed from the world's
  // geometry. Buying a bench adds an entry and everything else follows.
  const stations = world.placedStations.map(placed => {
    const actor = new ex.Actor({
      pos:    ex.vec(placed.body.cx, placed.body.cy),
      width:  placed.body.w,
      height: placed.body.h,
      z: 2,
      color:  ex.Color.fromHex(placed.def.color),
    })
    scene.add(track(actor))
    applySprite(actor, placed.def.sprite)
    // Front edge, so the surface reads as a table rather than a slab.
    colorRect(scene, {
      x: placed.body.cx, y: placed.body.cy + placed.body.h * 0.44,
      w: placed.body.w, h: placed.body.h * 0.12, hex: '#4a2a18', z: 2,
    })

    // Opened box + drone that sit on this station's surface.
    const boxOpen = new ex.Actor({
      pos: ex.vec(placed.surface.x, placed.surface.y),
      width: layout.sizes.box.w * 1.3, height: layout.sizes.box.h * 0.5,
      z: 3, color: ex.Color.fromHex('#e8c870'),
    })
    boxOpen.graphics.visible = false
    scene.add(track(boxOpen))

    const drone = new ex.Actor({
      pos: ex.vec(placed.surface.x, placed.surface.y),
      width: layout.sizes.drone.w, height: layout.sizes.drone.h,
      z: 4, color: ex.Color.fromHex('#2a2a3e'),
    })
    drone.graphics.visible = false
    scene.add(track(drone))

    return {
      id: placed.id,
      actor, boxOpen, drone,
      pulse:    addPulse(actor),
      progress: createBenchProgress(scene, actor),
      // Said out loud over the bench when a kit burns. The modal that used to
      // explain it closes itself, and a smoking drone with no words next to it
      // reads as "the game broke", not as "that one is scrap".
      burntLabel: (() => {
        const lbl = new ex.Label({
          text: '',
          pos:  ex.vec(actor.pos.x, actor.pos.y - actor.height / 2 - 34),
          z: 27,
          color: ex.Color.fromHex('#ff9a6a'),
          font: new ex.Font({
            family: 'monospace', size: 13, unit: ex.FontUnit.Px,
            textAlign: ex.TextAlign.Center, baseAlign: ex.BaseAlign.Middle,
          }),
        })
        lbl.graphics.visible = false
        scene.add(track(lbl))
        return lbl
      })(),
      workSpot: placed.workSpot,
      surface:  placed.surface,
      outSpot:  placed.outSpot,
      spriteKey: null,
    }
  })
  // ── Painted floor zones (S1.3) ─────────────────────────
  // Every trigger zone gets a mark on the floor in its own colour, the way a
  // real shop tapes off a picking area. Before this the only clue that
  // somewhere was worth standing was a pulsing object, so "walk round to the
  // far side of the bench" was not something the room could tell you.
  const zonePaints = (world.zones ?? []).map(zone => {
    const hex = ZONE_PAINT[zone.kind]
    if (!hex) return null

    const fill = colorRect(scene, {
      x: zone.cx, y: zone.cy, w: zone.w, h: zone.h, hex, z: 0.5,
    })
    fill.graphics.opacity = ZONE_FILL_DIM

    // Border, four thin bars — a filled rectangle alone reads as a stain.
    const T = 4
    const edges = [
      colorRect(scene, { x: zone.cx, y: zone.cy - zone.h / 2 + T / 2, w: zone.w, h: T, hex, z: 0.6 }),
      colorRect(scene, { x: zone.cx, y: zone.cy + zone.h / 2 - T / 2, w: zone.w, h: T, hex, z: 0.6 }),
      colorRect(scene, { x: zone.cx - zone.w / 2 + T / 2, y: zone.cy, w: T, h: zone.h, hex, z: 0.6 }),
      colorRect(scene, { x: zone.cx + zone.w / 2 - T / 2, y: zone.cy, w: T, h: zone.h, hex, z: 0.6 }),
    ]
    for (const e of edges) e.graphics.opacity = ZONE_EDGE_DIM

    return { zoneId: zone.id, fill, edges }
  }).filter(Boolean)

  const workbench = stations[0].actor

  const { spawns, sizes } = layout

  // ── Key positions (world units, straight from the layout) ──

  const slotSpawns   = spawns.deliverySlots.map(p => ex.vec(p.x, p.y))
  const BOX_SPAWN    = slotSpawns[0]
  const DOOR         = ex.vec(spawns.door.x, spawns.door.y)
  const TABLE        = ex.vec(spawns.benchTop.x, spawns.benchTop.y)
  const IDLE_POS     = ex.vec(spawns.workerIdle.x, spawns.workerIdle.y)
  const BENCH_POS    = ex.vec(spawns.bench.x, spawns.bench.y)

  // ── Delivery box — spawns in the street ────────────────
  const BOX_W = sizes.box.w
  const box = new ex.Actor({
    pos:    BOX_SPAWN.clone(),
    width:  BOX_W,
    height: sizes.box.h,
    z: 3,
    color:  ex.Color.fromHex('#c49a3c'),
  })
  box.graphics.visible = false
  applySprite(box, 'delivery_box')
  scene.add(track(box))

  // ── Delivery slot indicators ───────────────────────────
  // One indicator box + one countdown label per street slot. Each reads its own
  // slice of the world in preupdate — no mirrored copy of `deliveries` here.
  // The carry `box` above is SEPARATE: it is the one the worker picks up.
  const slotIndicators = slotSpawns.map(pos => {
    const a = new ex.Actor({
      pos:    pos.clone(),
      width:  BOX_W,
      height: sizes.box.h,
      z: 3,
      color:  ex.Color.fromHex('#c49a3c'),
    })
    a.graphics.visible = false
    applySprite(a, 'delivery_box')
    scene.add(track(a))
    return a
  })

  const slotLabels = slotSpawns.map(pos => {
    const lbl = new ex.Label({
      text:  '',
      pos:   ex.vec(pos.x, pos.y - BOX_W * 1.05),
      color: ex.Color.fromHex('#c8d8ff'),
      font:  new ex.Font({ size: 12, family: 'monospace', textAlign: ex.TextAlign.Center }),
      z: 5,
    })
    lbl.graphics.visible = false
    scene.add(track(lbl))
    return lbl
  })

  slotIndicators.forEach((ind, slotIdx) => {
    const lbl = slotLabels[slotIdx]

    // Projection: countdown while in transit, box sprite once it has arrived.
    // Walking into the slot's trigger zone is what picks it up (C2).
    ind.on('preupdate', () => {
      const { game, now } = getWorld()
      const d = (game.deliveries ?? []).find(d => d.slotIndex === slotIdx)

      // No delivery OR the worker is carrying it — the carry box is shown instead.
      if (!d || d.status === DeliveryStatus.CARRYING) {
        ind.graphics.visible = false
        lbl.graphics.visible = false
        return
      }

      const ms  = Math.max(0, d.readyAt - now)
      const kit = KIT_TYPES[d.kitId]
      if (ms > 0) {
        ind.graphics.visible = false
        lbl.text = `${kit?.emoji ?? '📦'} ${fmtSlotTime(ms)}`
        lbl.graphics.visible = true
      } else if (layout.conveyor) {
        // Arrived on the factory means "on the belt", and the belt draws its
        // own boxes. Showing the dock marker too would put the same box in two
        // places at once — the bug the piggy bank taught us to look for.
        ind.graphics.visible = false
        lbl.graphics.visible = false
      } else {
        ind.graphics.visible = true
        lbl.graphics.visible = false
      }
    })
  })

  // ── Per-hall earnings (F7) ─────────────────────────────
  // A label over each hall's post box: what that hall has actually banked in
  // the last minute. This is what makes opening a third hall legible — you can
  // see which floor is paying for itself and which one is short a technician.
  const hallEarnings = (layout.halls ?? []).map(hall => {
    const box = layout.props[`mailbox_${hall.id}`]
    const lbl = new ex.Label({
      text: '',
      pos:  ex.vec(box?.cx ?? hall.x0, (box?.cy ?? 1200) - 52),
      z: 26,
      color: ex.Color.fromHex('#7de07d'),
      font: new ex.Font({
        family: 'monospace', size: 14, unit: ex.FontUnit.Px,
        textAlign: ex.TextAlign.Center, baseAlign: ex.BaseAlign.Middle,
      }),
    })
    lbl.graphics.visible = false
    scene.add(track(lbl))
    return { hallId: hall.id, label: lbl }
  })

  // ── Boxes on the belt (F3) ─────────────────────────────
  // One actor per delivery slot, since that is the hard cap on how many boxes
  // can exist at once. Position comes from the sim's `t`, so what you see on
  // the belt is exactly what the job board thinks is there.
  const beltBoxes = layout.conveyor
    ? Array.from({ length: 3 }, () => {
        const a = new ex.Actor({
          pos:    ex.vec(layout.conveyor.x0, layout.conveyor.y),
          width:  sizes.box.w,
          height: sizes.box.h,
          z: 4,
          color: ex.Color.fromHex('#c08a4a'),
        })
        a.graphics.visible = false
        scene.add(track(a))
        applySprite(a, 'delivery_box')
        return a
      })
    : []

  // ── Piggy bank (built from the layout; only its behaviour lives here) ──
  // A location without the prop simply has no piggy bank — the rescue mechanic
  // is not part of every chapter (F1.3).
  if (piggy) piggy.graphics.visible = false

  const piggyTimerLabel = piggy && new ex.Label({
    text:  '',
    pos:   ex.vec(piggy.pos.x, piggy.pos.y - piggy.height * 0.78),
    color: ex.Color.fromHex('#dddddd'),
    font:  new ex.Font({ size: 13, family: 'monospace', textAlign: ex.TextAlign.Center }),
    z: 5,
  })
  if (piggyTimerLabel) {
    piggyTimerLabel.graphics.visible = false
    scene.add(track(piggyTimerLabel))
  }

  piggy?.on('preupdate', () => {
    if (!piggy.graphics.visible) return
    const { game, now } = getWorld()
    const remaining = game.lastPiggyAt != null ? PIGGY_COOLDOWN_MS - (now - game.lastPiggyAt) : 0
    if (remaining > 0) {
      piggy.graphics.opacity = 0.35
      piggy.scale = ex.vec(1, 1)
      const secs = Math.ceil(remaining / 1000)
      piggyTimerLabel.text = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
      piggyTimerLabel.graphics.visible = true
    } else {
      piggy.graphics.opacity = 1.0
      const s = 1 + 0.08 * Math.sin(Date.now() / 400)
      piggy.scale = ex.vec(s, s)
      piggyTimerLabel.graphics.visible = false
    }
  })

  // ── Characters (C1 player, C5 hired workers) ───────────
  // Position is owned by the sim (world.agents); these actors only render it.
  // One factory for both, because a worker is now an agent exactly like the
  // player — the difference is who writes its velocity.
  // Which Kenney tiles a role wears. Roles are told apart by the sprite itself
  // now rather than by tinting one shared sheet — Kenney's characters already
  // come in distinct outfits, and tinting a coloured sprite only muddies it.
  const TILE_CHARACTER = {
    player:  ['k_player_front',  'k_player_side'],
    courier: ['k_courier_front', 'k_courier_side'],
    tech:    ['k_tech_front',    'k_tech_side'],
    seller:  ['k_seller_front',  'k_seller_side'],
    manager: ['k_manager_front', 'k_manager_side'],
  }

  function makeCharacter(spriteKey, color, { badge = null, tint = false, tiles = null } = {}) {
    // A soft ellipse under the feet: without it characters look pasted onto the
    // floor rather than standing on it.
    const shadow = new ex.Actor({
      pos:    ex.vec(-9999, -9999),
      width:  sizes.character * 0.52,
      height: sizes.character * 0.20,
      z: 5,
      color:  ex.Color.fromRGB(0, 0, 0, 0.28),
    })
    scene.add(track(shadow))

    // Colour ring on the floor (S1.4). The tint alone is easy to miss on a
    // small screen; a ring in the role's colour reads at a glance, even in a
    // crowd around one bench.
    const ring = new ex.Actor({
      pos:    ex.vec(-9999, -9999),
      width:  sizes.character * 0.60,
      height: sizes.character * 0.24,
      z: 4,
      color:  ex.Color.fromHex(color),
      opacity: 0.55,
    })
    scene.add(track(ring))

    const actor = new ex.Actor({
      pos:    ex.vec(spawns.player.x, spawns.player.y),
      width:  sizes.character,
      height: sizes.character,
      z: 6,
      color:  ex.Color.fromHex(color),
    })
    scene.add(track(actor))

    // Kenney tiles when we have them for this role AND that art is selected;
    // the generated walk sheet otherwise. Both rigs answer the same
    // `setMoving(moving, facingRight)`.
    const pair = CHARACTER_ART === 'kenney' && tiles && TILE_CHARACTER[tiles]
    const frontImg = pair && getSprite(pair[0])
    const rig = frontImg
      ? createTileCharacter(actor, frontImg, getSprite(pair[1]))
      : createCharacterSprite(actor, getSprite(spriteKey), tint ? color : null)

    // Role badge above the head — the emoji says what the colour means.
    let badgeLabel = null
    if (badge) {
      badgeLabel = new ex.Label({
        text: badge,
        pos:  ex.vec(-9999, -9999),
        z: 25,
        font: new ex.Font({
          family: 'sans-serif', size: 22, unit: ex.FontUnit.Px,
          textAlign: ex.TextAlign.Center, baseAlign: ex.BaseAlign.Middle,
        }),
      })
      scene.add(badgeLabel)
      track(badgeLabel)
    }

    // Y-sort: whoever stands lower on screen draws in front.
    actor.on('preupdate', () => {
      actor.z = actor.pos.y * 0.01
      shadow.pos.x = actor.pos.x
      shadow.pos.y = actor.pos.y + actor.height * 0.36
      shadow.z = actor.z - 0.001
      ring.pos.x = actor.pos.x
      ring.pos.y = actor.pos.y + actor.height * 0.38
      ring.z = actor.z - 0.002
      if (badgeLabel) {
        badgeLabel.pos.x = actor.pos.x
        badgeLabel.pos.y = actor.pos.y - actor.height * 0.72
        badgeLabel.z = actor.z + 6
      }
    })
    return { actor, rig, shadow, ring, badge: badgeLabel }
  }

  const { actor: player, rig: playerRig } = makeCharacter('player_walk', '#1f9e92', { tiles: 'player' })

  // ── The cat (V5) ───────────────────────────────────────
  // Its own tiny rig: five cells (four walking, one sitting) rather than the
  // four-frame character sheet, so it gets its own slicing instead of pretending
  // to be a person.
  const catActor = new ex.Actor({
    pos:    ex.vec(-9999, -9999),
    width:  sizes.character * 0.50,
    height: sizes.character * 0.34,
    z: 6,
    color:  ex.Color.fromHex('#d88a40'),
  })
  scene.add(track(catActor))
  catActor.graphics.visible = false

  // One graphic per mood (V5). The sheet is four walk frames then sit, sleep
  // and groom; running is the walk cycle played faster, which is enough of a
  // difference at this size and costs no extra art.
  const catImage = getSprite('cat_walk')
  let catAnim = null
  if (catImage) {
    const sheet = ex.SpriteSheet.fromImageSource({
      image: catImage,
      grid: { rows: 1, columns: 7, spriteWidth: 32, spriteHeight: 32 },
    })
    const scale = ex.vec(catActor.width / 32, catActor.height / 32)
    const make = (frames, ms) => {
      const a = ex.Animation.fromSpriteSheet(sheet, frames, ms)
      a.scale = scale
      return a
    }
    catAnim = {
      stroll: make([0, 1, 2, 3], 170),
      run:    make([0, 1, 2, 3], 80),
      follow: make([0, 1, 2, 3], 140),
      sit:    make([4], 1000),
      sleep:  make([5], 1000),
      groom:  make([6], 1000),
      current: null,
    }
    catActor.graphics.use(catAnim.sit)
    catAnim.current = 'sit'
  }

  catActor.on('preupdate', () => { catActor.z = catActor.pos.y * 0.01 })

  // ── Objective arrow (C7.3) ─────────────────────────────
  // Bobs above the player's head, pointing at the next useful zone.
  const arrow = new ex.Actor({
    pos: ex.vec(-9999, -9999), width: 34, height: 42,
    z: 30, color: ex.Color.fromHex('#ffc83c'),
  })
  applySprite(arrow, 'arrow')
  arrow.graphics.visible = false
  scene.add(track(arrow))

  // Worker actors are created on demand — hiring happens mid-game.
  const workerViews = new Map()
  function workerView(agentId, role = null) {
    let view = workerViews.get(agentId)
    if (!view) {
      // Colour and badge come from the role registry, so adding a role gives
      // its people a look without touching the scene.
      view = makeCharacter('worker_walk', roleColor(role), {
        badge: roleBadge(role), tint: true, tiles: role,
      })

      // Price tag over the head (F5): the promotion IS the upgrade menu on the
      // factory, so it has to be visible on the floor rather than behind a
      // panel. Level dots ride just under it, so progress reads without a tap.
      view.promoteLabel = new ex.Label({
        text: '',
        pos:  ex.vec(-9999, -9999),
        z: 26,
        color: ex.Color.fromHex('#ffd76a'),
        font: new ex.Font({
          family: 'monospace', size: 15, unit: ex.FontUnit.Px,
          textAlign: ex.TextAlign.Center, baseAlign: ex.BaseAlign.Middle,
        }),
      })
      view.promoteLabel.graphics.visible = false
      scene.add(track(view.promoteLabel))

      view.levelLabel = new ex.Label({
        text: '',
        pos:  ex.vec(-9999, -9999),
        z: 26,
        color: ex.Color.fromHex('#cfe3ff'),
        font: new ex.Font({
          family: 'monospace', size: 13, unit: ex.FontUnit.Px,
          textAlign: ex.TextAlign.Center, baseAlign: ex.BaseAlign.Middle,
        }),
      })
      view.levelLabel.graphics.visible = false
      scene.add(track(view.levelLabel))
      // Carried items ride above the head, same rig as the player's stack.
      view.carrySlots = Array.from({ length: 2 }, () => {
        const a = new ex.Actor({
          pos: ex.vec(-9999, -9999),
          width: sizes.box.w * 0.8, height: sizes.box.h * 0.8,
          z: 20, color: ex.Color.fromHex('#c49a3c'),
        })
        a.graphics.visible = false
        scene.add(track(a))
        return a
      })
      workerViews.set(agentId, view)
    }
    return view
  }

  // ── Carried items ──────────────────────────────────────
  // A small stack of actors floating above the head. Kept as scene-level actors
  // rather than children: addChild removes an actor from the scene's render
  // list in Excalibur 0.32, which cost us a whole evening back in D4.
  const carrySlotActors = Array.from({ length: CARRY_STACK_SLOTS }, () => {
    const a = new ex.Actor({
      pos:    ex.vec(-9999, -9999),
      width:  sizes.box.w * 0.8,
      height: sizes.box.h * 0.8,
      z: 20,
      color:  ex.Color.fromHex('#c49a3c'),
    })
    a.graphics.visible = false
    scene.add(track(a))
    return a
  })

  // ── Dwell progress ─────────────────────────────────────
  // Fills while standing in a zone that has something to offer.
  const DWELL_W = sizes.character * 0.9
  const dwellBg = new ex.Actor({
    pos: ex.vec(-9999, -9999), width: DWELL_W + 4, height: 10,
    z: 21, color: ex.Color.fromHex('#20203a'),
  })
  dwellBg.graphics.visible = false
  scene.add(track(dwellBg))

  const dwellFill = new ex.Actor({ pos: ex.vec(-9999, -9999), z: 22 })
  dwellFill.graphics.visible = false
  scene.add(track(dwellFill))

  // Camera follows the player, clamped so it never shows past the world edge.
  scene.camera.pos = ex.vec(spawns.player.x, spawns.player.y)
  // Strategies accumulate, so a move would otherwise stack a second follow and
  // keep the old room's bounds.
  scene.camera.clearAllStrategies()
  scene.camera.strategy.elasticToActor(player, CAMERA_ELASTICITY, CAMERA_FRICTION)
  scene.camera.strategy.limitCameraBounds(
    new ex.BoundingBox(0, 0, layout.world.w, layout.world.h),
  )

  // ── Pulse controllers ──────────────────────────────────
  const boxPulse      = addPulse(box)
  // The panel objects (S2) pulse for exactly the reason the bottom bar used to
  // show a "!" badge — the notice moved to where the thing is.
  // A pulse per ZONE, looked up by the zone's own id. The factory has several
  // post boxes and several boards (F4), so a fixed list of named pulses would
  // quietly leave all but the first one dark.
  const zonePulses = Object.fromEntries(
    (layout.zones ?? [])
      .filter(z => propActors[z.id])
      .map(z => [z.id, addPulse(propActors[z.id])]),
  )

  return {
    engine: { getFps: () => engine.clock.fpsSampler.fps, _ex: engine },
    scene,
    box, piggy, workbench,
    cat: { actor: catActor, anim: catAnim },
    ...propActors,
    beltBoxes,
    hallEarnings,
    stations,
    player, playerRig, workerView, workerViews,
    carrySlotActors,
    arrow,
    dwell: { bg: dwellBg, fill: dwellFill, width: DWELL_W },
    slotSpawns,
    zonePaints,
    boxSpawn: BOX_SPAWN,
    _pulses: { box: boxPulse, ...zonePulses },
  }
}

// Background colour only — the floor and everything on it come from the layout
// now (C7). Kept for the boot path and for cheap re-tints.
export function applyLocationTheme(sceneConfig) {
  if (!sceneConfig) return
  if (sceneConfig.bgColor && _engine)
    _engine.backgroundColor = ex.Color.fromHex(sceneConfig.bgColor)
  if (sceneConfig.floorColor && _floorActor)
    _floorActor.color = ex.Color.fromHex(sceneConfig.floorColor)
}
