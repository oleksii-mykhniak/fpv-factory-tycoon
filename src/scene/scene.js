import * as ex from 'excalibur'
import { Phase, DeliveryStatus, KIT_TYPES } from '../state/gameState.js'
import {
  VIEW_HEIGHT_UNITS, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX,
  CAMERA_ELASTICITY, CAMERA_FRICTION,
  PIGGY_COOLDOWN_MS,
  PULSE_FREQ_HZ, PULSE_SCALE_AMP,
  FLOAT_GAIN_POOL,
  FLOAT_GAIN_JITTER_X, FLOAT_GAIN_JITTER_Y, FLOAT_GAIN_DRIFT_X,
  CHARACTER_U as TILE_U,
  CHARACTER_ART,
  AI_SHEETS, AI_SIDE_FACES_RIGHT,
  CAT_SHEETS, CAT_SPEED, CAT_RUN_SPEED,
  ARROW_W, ARROW_H,
  INTAKE_CAPACITY,
  u,
} from '../state/config.js'
import { loadSprites, getSprite } from './loader.js'
import { createCharacterSprite, createTileCharacter, createSheetCharacter } from './character.js'
import { frameMs } from './frame.js'
import { floatPose } from './floatGain.js'
import { CAT_STILL_POSES } from './pose.js'
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

// Завжди m:ss, навіть під хвилину (Стадія 13 / А3).
//
// Було «42s» під хвилину і «2:14» вище. Латинська «s» — такий самий гліф ОС, як
// емодзі поруч: намалювати її спрайтом означало б завести літери заради одного
// суфікса. Один формат замість двох ще й прибирає стрибок ширини рядка в
// момент, коли відлік переходить хвилину.
function fmtSlotTime(ms) {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Число на сцені, зібране зі спрайтів цифр (Стадія 13 / А3).
//
// Пул акторів фіксованої довжини, а не актор на символ: рядок міняється
// щокадру, і створювати по чотири актори на кадр — це GC замість гри. Зайві
// глифи просто ховаються.
//
// Ширини беруться з РОЗКЛАДКИ спрайтів, а не з їхніх пікселів: одиниця U — те
// саме, чим міряється все інше на сцені (Стадія 6).
// Значок стану верстака (Стадія 13 / А4).
const STATE_ICON  = u(0.30)
const GLYPH_H     = u(0.24)
const GLYPH_W     = u(0.14)
const GLYPH_COLON = u(0.07)
const GLYPH_GAP   = u(0.02)

function makeNumberRow(scene, track, len) {
  const actors = Array.from({ length: len }, () => {
    const a = new ex.Actor({ pos: ex.vec(-9999, -9999), width: GLYPH_W, height: GLYPH_H, z: 6 })
    a.graphics.visible = false
    scene.add(track(a))
    return a
  })

  // `sprite` кешується на акторі: `applySprite` щоразу створює новий Sprite, а
  // цифра здебільшого лишається тією самою від кадру до кадру.
  const show = (text, cx, cy) => {
    const glyphs = [...text].slice(0, len)
    const widths = glyphs.map(ch => (ch === ':' ? GLYPH_COLON : GLYPH_W))
    const total  = widths.reduce((a, b) => a + b, 0) + GLYPH_GAP * (glyphs.length - 1)
    let x = cx - total / 2
    glyphs.forEach((ch, i) => {
      const a = actors[i]
      const key = ch === ':' ? 'digit_colon' : `digit_${ch}`
      if (a._glyph !== key) { applySpriteSized(a, key, widths[i], GLYPH_H); a._glyph = key }
      a.pos.x = x + widths[i] / 2
      a.pos.y = cy
      a.graphics.visible = true
      x += widths[i] + GLYPH_GAP
    })
    for (let i = glyphs.length; i < len; i++) actors[i].graphics.visible = false
  }

  const hide = () => { for (const a of actors) a.graphics.visible = false }
  return { show, hide }
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
  // Lighter sidewalk band just outside the door. Skipped where the layout
  // paves the yard itself (`groundPatches`): a band across the full width is a
  // stand-in for a plan, and drawing both means the stand-in shows through the
  // plan wherever the plan happens to leave grass.
  if (!(layout.groundPatches ?? []).length) {
    colorRect(scene, {
      x: world.w / 2, y: street.y + street.h * 0.10, w: world.w, h: street.h * 0.18,
      hex: theme.pavementColor ?? '#33334a', z: 0,
    })
  }

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

  // Patches of a different surface laid over the base one: the paved apron in
  // front of the door, the path down the garden, the parking pad. Patches
  // rather than a second base tile because a yard is not one material — and
  // rather than props because you walk ON them, so they must sort below
  // everything and never block a step.
  //
  // Drawn at z 0.3: above the base tiling (0.2), below the zone markings that
  // say what a patch of floor is FOR.
  for (const patch of layout.groundPatches ?? []) {
    colorRect(scene, {
      x: patch.x + patch.w / 2, y: patch.y + patch.h / 2, w: patch.w, h: patch.h,
      hex: patch.color, z: 0.25,
    })
    tileFloor(scene, patch.tile, patch.x, patch.y, patch.w, patch.h, 0.3)
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
    // Прийом і відвантаження — один силует, дві смуги (Стадія 12 / Д2). Смуга
    // і є те, чим вони відрізняються: зелена — сюди приходить, синя — звідси
    // йде. Колір самого спрайта не працює — спрайт не тонується.
    if (name.startsWith('intake'))
      colorRect(scene, { x: p.cx, y: p.cy - p.h * 0.34, w: p.w, h: 5, hex: '#4f9e3a', z: 4 })
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

// Те саме, але розмір задає виклик, а не актор: цифра і двокрапка стоять в
// одному ряду й мають різну ширину (Стадія 13 / А3).
//
// Розмір ставиться СПРАЙТУ, не акторові: `Actor.width` в Excalibur 0.32 — це
// геттер без сеттера, і присвоєння кидає TypeError просто в `preupdate`.
// Виняток там не долітає нікуди: Excalibur ловить його всередині оновлення
// сцени, а гра після цього мовчки перестає тікати — жодної помилки в консолі,
// просто застиглий світ. Так і виявилось, що вся секція A смоуку раптом
// перестала підбирати коробку.
function applySpriteSized(actor, key, w, h) {
  const src = getSprite(key)
  if (!src) return
  const sprite = src.toSprite()
  sprite.width  = w
  sprite.height = h
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
  // Без плашки (валідація Стадії 10 на залізі).
  //
  // Тут стояла темна картка 52px під підписом і темно-зелена — під тостом. Обидві
  // були центровані по тій самій точці, що й Label, але Label БЕЗ `baseAlign`
  // малюється по базовій лінії, тобто нижче своєї позиції. Плашка і текст ніколи
  // не збігались: тост виглядав як темний прямокутник, з-під якого звисає напис.
  // Плашки знято, текст вирівняно по центру явно, а читабельність над верстаком
  // тримає тінь у самому шрифті — вона обводить літери, а не малює квадрат.
  const CARD_W = Math.min(BW * 0.88, 210)
  const GAP    = 10

  // Знизу вгору від краю верстака: підпис, під ним крапки, під ними смужка.
  const cx     = benchActor.pos.x
  const topY   = benchActor.pos.y - BH / 2 - GAP
  const stepY  = topY - 36
  const dotsY  = topY - 20
  const barY   = topY - 6

  const BAR_W    = CARD_W * 0.80
  const BAR_H    = 5
  const LEFT_X   = cx - BAR_W / 2
  const MAX_DOTS = 8
  const DOT_R    = 3
  const DOT_GAP  = DOT_R * 2.8

  let running  = false
  let elapsed  = 0
  let duration = 2000

  const shadow = { blur: 4, offset: ex.vec(0, 1), color: ex.Color.fromHex('#000000') }

  // Step label
  const stepLbl = new ex.Label({
    text: '',
    pos:  ex.vec(cx, stepY),
    color: ex.Color.fromHex('#cce0ff'),
    font: new ex.Font({
      size: 11, family: 'monospace',
      textAlign: ex.TextAlign.Center, baseAlign: ex.BaseAlign.Middle,
      shadow,
    }),
    z: 13,
  })
  stepLbl.graphics.visible = false
  add(stepLbl)

  // Progress dots — small square actors (more reliable than ex.Circle in WebGL)
  const DOT_SZ = DOT_R * 2
  const dotActors = Array.from({ length: MAX_DOTS }, () => {
    const d = new ex.Actor({
      pos: ex.vec(cx, dotsY), width: DOT_SZ, height: DOT_SZ,
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
    elapsed += frameMs(evt)
    const p = Math.max(Math.min(elapsed / duration, 1), 0.01)
    const fillW = Math.max(BAR_W * p, 2)
    barFill.graphics.use(new ex.Rectangle({ width: fillW, height: BAR_H + 2, color: ex.Color.fromHex('#7aa0ff') }))
    barFill.pos.x = LEFT_X + fillW / 2
  })

  // Result toast — a label that fades out. No plate: see the note above.
  const toastLbl = new ex.Label({
    text:  '',
    pos:   ex.vec(cx + STATE_ICON * 0.4, stepY),
    color: ex.Color.fromHex('#7de07d'),
    font:  new ex.Font({
      size: 13, family: 'monospace',
      textAlign: ex.TextAlign.Center, baseAlign: ex.BaseAlign.Middle,
      shadow,
    }),
    z: 13,
  })
  toastLbl.graphics.visible = false
  add(toastLbl)

  // Стадія 13 / А4: рядок починався з «✓», тобто найпомітніший символ у
  // повідомленні малював шрифт ОС. Тепер галочка — намальована, а текст
  // поруч лишається текстом.
  const toastIcon = new ex.Actor({
    pos: ex.vec(cx - CARD_W * 0.5, stepY), width: STATE_ICON, height: STATE_ICON, z: 13,
  })
  toastIcon.graphics.visible = false
  add(toastIcon)
  applySprite(toastIcon, 'state_done')

  let toastAge = 0, toastDur = 0, toasting = false
  toastLbl.on('preupdate', (evt) => {
    if (!toasting) return
    toastAge += frameMs(evt)
    if (toastAge >= toastDur) {
      toasting = false
      toastLbl.graphics.visible = false
      toastIcon.graphics.visible = false
      return
    }
    const fadeStart = toastDur * 0.55
    const a = toastAge > fadeStart
      ? 1 - (toastAge - fadeStart) / (toastDur - fadeStart)
      : 1
    toastLbl.graphics.opacity  = a
    toastIcon.graphics.opacity = a
  })

  function _placeDots(total, done) {
    const dotsW  = (total - 1) * DOT_GAP
    const startX = cx - dotsW / 2
    const dotY   = dotsY
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
    stepLbl.graphics.visible  = true
    barBg.graphics.visible    = true
    barFill.graphics.visible  = true
    _resetBar()
    _placeDots(total, done)
    toasting = false
    toastLbl.graphics.visible = false
    toastIcon.graphics.visible = false
  }

  function advanceDots(total, done) {
    elapsed = 0
    _resetBar()
    _placeDots(total, done)
  }

  function hide() {
    running = false
    stepLbl.graphics.visible = false
    barBg.graphics.visible   = false
    barFill.graphics.visible = false
    dotActors.forEach(d => { d.graphics.visible = false })
  }

  function showResult(text, durationMs = 2200) {
    hide()
    toastLbl.text = text
    toastLbl.graphics.opacity = 1
    toastLbl.graphics.visible = true
    toastIcon.graphics.opacity = 1
    toastIcon.graphics.visible = true
    toastAge = 0
    toastDur = durationMs
    toasting = true
  }

  return { startStep, advanceDots, hide, showResult }
}

// Картка «комплект згорів» над верстаком (Стадія 9 / Р7).
//
// Окремо від createBenchProgress навмисно: та картка живе, поки збірка ЙДЕ, і
// зникає на кожному переході фази. Ця мусить висіти саме тоді, коли та зникла —
// поки згорілий комплект лежить на верстаку. Одна картка на дві протилежні
// умови видимості неминуче гасила б себе не в той момент.
//
// Два рядки, бо це дві різні думки: перший каже, ЩО сталось (і на якому кроці —
// без цього перегрів читається як випадковість), другий — ЩО РОБИТИ, а це
// єдина підказка про те, що згорілий комплект узагалі можна прибрати.
function createBurntNotice(scene, benchActor) {
  const add = (a) => { scene.add(track(a)); return a }
  // Ширина від ТЕКСТУ, а не від верстака: monospace 12 px — це ~7.2 px на
  // символ, і найдовший рядок («🔥 Перегрів: Прошиваю польотний контролер») не
  // мусить вилазити за підкладку. Перший захід міряв ширину верстака й обрізав
  // саме те, що треба було прочитати.
  const CARD_W = 250
  const CARD_H = 44
  const cx = benchActor.pos.x
  const cy = benchActor.pos.y - benchActor.height / 2 - 8 - CARD_H / 2

  const border = add(new ex.Actor({
    pos: ex.vec(cx, cy), width: CARD_W + 2, height: CARD_H + 2,
    z: 26, color: ex.Color.fromHex('#c05a2a'),
  }))
  const card = add(new ex.Actor({
    pos: ex.vec(cx, cy), width: CARD_W, height: CARD_H,
    z: 27, color: ex.Color.fromHex('#2a1614'),
  }))

  const line = (dy, hex, size) => add(new ex.Label({
    text: '',
    pos:  ex.vec(cx, cy + dy),
    color: ex.Color.fromHex(hex),
    font: new ex.Font({
      family: 'monospace', size, unit: ex.FontUnit.Px,
      textAlign: ex.TextAlign.Center, baseAlign: ex.BaseAlign.Middle,
    }),
    z: 28,
  }))

  const what = line(-CARD_H * 0.20, '#ff9a6a', 12)
  const todo = line(CARD_H * 0.22, '#e8d0a0', 11)

  // Стадія 13 / А4: перший рядок починався з «🔥». Іскра переїхала на край
  // картки й стала намальованою — заразом текст перестав починатися з гліфа
  // змінної ширини, через який рядок стрибав при кожному перемальовуванні.
  const icon = add(new ex.Actor({
    pos: ex.vec(cx - CARD_W / 2 + STATE_ICON * 0.75, cy),
    width: STATE_ICON, height: STATE_ICON, z: 28,
  }))
  applySprite(icon, 'state_overheat')

  const parts = [border, card, what, todo, icon]
  for (const p of parts) p.graphics.visible = false

  return {
    // Назовні віддаємо і самі актори: смоук-тест перевіряє, що над згорілим
    // верстаком СПРАВДІ щось намальовано, а не що сим так вважає.
    parts,
    show(whatText, todoText) {
      what.text = whatText
      todo.text = todoText
      for (const p of parts) p.graphics.visible = true
    },
    hide() {
      for (const p of parts) p.graphics.visible = false
    },
  }
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

  // Значок ролі — третина зросту персонажа (Стадія 13 / А2): має читатись у
  // натовпі з шести робітників, але не бути більшим за голову.
  const BADGE_U = u(0.34)

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
    //
    // Розгорнута коробка — власний спрайт, а не жовтий прямокутник. Комплект,
    // який РОЗПАКУВАЛИ, і комплект, який несуть, — різні речі, і поки на столі
    // лежала пляма кольору кришки, верстак читався як «коробка стоїть на
    // столі», хоч у грі її саме там і розбирають.
    const boxOpen = new ex.Actor({
      pos: ex.vec(placed.surface.x, placed.surface.y),
      width: layout.sizes.boxOpen.w, height: layout.sizes.boxOpen.h,
      z: 3, color: ex.Color.fromHex('#e8c870'),
    })
    applySprite(boxOpen, 'delivery_box_open')
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
      // Сказано вголос над верстаком, коли комплект згорів (Стадія 9 / Р7).
      //
      // Мітка була тут і раніше, але одним рядком у 13 px без підкладки — на
      // тлі підлоги й дерева її просто не видно, тож на тесті це прочиталось як
      // «текст блимнув і зник». Тепер це картка: рамка, фон і ДВА рядки —
      // що сталось і що з цим робити. Висить, поки фаза BURNT, тобто поки
      // хтось не підійде й не приберемо.
      burnt: createBurntNotice(scene, actor),
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

  // Плашка доставки: іконка дрона + відлік цифрами (Стадія 13 / А3).
  //
  // Був один `ex.Label` з текстом `${kit.emoji} ${час}` — тобто і «який дрон
  // їде», і «скільки лишилось» малював шрифт ОС. Тепер це дві намальовані речі:
  // іконка типу і ряд цифр. Гравець і далі читає рядок як одне ціле, бо вони
  // стоять поруч і рухаються разом.
  const ICON_W = u(0.62)
  const ICON_H = u(0.34)
  const slotIcons = slotSpawns.map(() => {
    const a = new ex.Actor({ pos: ex.vec(-9999, -9999), width: ICON_W, height: ICON_H, z: 5 })
    a.graphics.visible = false
    scene.add(track(a))
    return a
  })
  // «59:59» — п'ять глифів; довший відлік у грі неможливий.
  const slotClocks = slotSpawns.map(() => makeNumberRow(scene, track, 5))

  // Куди дивиться це замовлення: приймальний ящик свого цеху, якщо цех уже
  // вибрано в момент замовлення (Стадія 12 / Д1), інакше — вуличний слот.
  // Одна коробка — одне місце: і відлік, і сама коробка стоять там, куди вона
  // приїде, а не в двох місцях одразу.
  const intakeSpot = (hallId, slotIdx) => {
    const prop = hallId ? layout.props?.[`intake_${hallId}`] : null
    if (!prop) return slotSpawns[slotIdx]
    // Дві коробки в одному ящику не мають лежати одна в одній.
    return ex.vec(prop.cx + (slotIdx - 1) * 34, prop.cy - prop.h * 0.55)
  }

  slotIndicators.forEach((ind, slotIdx) => {
    const icon  = slotIcons[slotIdx]
    const clock = slotClocks[slotIdx]

    // Projection: countdown while in transit, box sprite once it has arrived.
    // Walking into the slot's trigger zone is what picks it up (C2).
    ind.on('preupdate', () => {
      const { game, now } = getWorld()
      const d = (game.deliveries ?? []).find(d => d.slotIndex === slotIdx)

      // No delivery OR the worker is carrying it — the carry box is shown instead.
      if (!d || d.status === DeliveryStatus.CARRYING) {
        ind.graphics.visible = false
        icon.graphics.visible = false
        clock.hide()
        return
      }

      const at = intakeSpot(d.hallId ?? null, slotIdx)
      ind.pos.x = at.x
      ind.pos.y = at.y

      const ms = Math.max(0, d.readyAt - now)
      if (ms > 0) {
        ind.graphics.visible = false
        const key = `icon_${d.kitId}`
        if (icon._kit !== key) { applySprite(icon, key); icon._kit = key }
        icon.pos.x = at.x - ICON_W * 0.45
        icon.pos.y = at.y - BOX_W * 1.05
        icon.graphics.visible = true
        clock.show(fmtSlotTime(ms), at.x + ICON_W * 0.62, at.y - BOX_W * 1.05)
      } else {
        ind.graphics.visible = true
        icon.graphics.visible = false
        clock.hide()
      }
    })
  })

  // ── Floating gains (Стадія 10 / D3) ────────────────────
  // "+$47" rising off the post box the drone was actually carried to.
  //
  // Money landing used to be a number in the HUD quietly becoming a different
  // number — the one moment the whole loop pays out, and the least visible
  // thing on screen. Here it happens where the player is looking, which is the
  // same rule the burnt-kit banner follows (Стадія 9 / П6).
  //
  // A fixed pool rather than actors created per sale: a factory with three
  // sellers banks drones faster than a GC wants new Labels, and a pool that
  // runs out simply reuses its oldest — a dropped "+$47" costs nothing.
  //
  // Це ЄДИНИЙ напис над скринькою. Поруч стояв ще прилад F7 («+$47/хв» — темп
  // цеху за хвилину), і для одного продажу він показував рівно ту саму цифру
  // в тій самій точці, тільки висів хвилину. Гравець читав це як «текст
  // продажу не зникає», і полагоджена анімація нічого не міняла: дивились не
  // на неї. Прилад знято — про те, який цех жвавіший, тепер говорить те, над
  // якою скринькою частіше блимає.
  const floaters = Array.from({ length: FLOAT_GAIN_POOL }, () => {
    const lbl = new ex.Label({
      text: '', pos: ex.vec(-9999, -9999), z: 40,
      color: ex.Color.fromHex('#9dffa8'),
      font: new ex.Font({
        family: 'monospace', size: 17, unit: ex.FontUnit.Px,
        textAlign: ex.TextAlign.Center, baseAlign: ex.BaseAlign.Middle,
      }),
    })
    lbl.graphics.visible = false
    scene.add(track(lbl))
    return { lbl, age: 0, live: false, x: 0, y: 0, driftX: 0 }
  })

  // Один обробник на весь пул, а не по обробнику на напис
  // (фікс «збірка ≠ dev», 2026-09-11).
  //
  // Це не стиль, це єдина форма, яка переживає збірку. Кожен напис мав власне
  // замикання над своїм `st`, і `st.live` там ініціалізувався `false`. Rollup
  // при tree-shaking згортає таку властивість літерала в константу: він бачив
  // `if (!st.live) return` як «завжди вихід» і вирізав ВСЕ тіло анімації —
  // у зібраній грі обробник ставав `(evt) => { return }`. Присвоєння
  // `st.live = true` у `floatGain` нижче він не пов'язував із тим об'єктом, бо
  // той дістається через `floaters.find(...)`.
  //
  // Симптом на пристрої: «+$47» з'являвся над скринькою і висів вічно, по
  // напису на кожен продаж. У `npm run dev` усе працювало — tree-shaking там
  // не виконується, — тож жоден прогін це не ловив. Коли `st` дістається з
  // масиву в циклі, згорнути його властивість у константу вже не можна.
  //
  // Обробник висить на першому написі пулу: той доданий через `track()`, а
  // отже вмирає разом із рештою розкладки при перебудові фабрики — на сцені не
  // лишається таймера, що крутить убитих акторів.
  floaters[0].lbl.on('preupdate', (evt) => {
    const dt = frameMs(evt)
    for (const st of floaters) {
      if (!st.live) continue
      st.age += dt
      const pose = floatPose(st.age)
      if (pose.done) {
        st.live = false
        st.lbl.graphics.visible = false
        continue
      }
      st.lbl.pos = ex.vec(st.x + st.driftX * pose.t, st.y - pose.rise)
      st.lbl.graphics.opacity = pose.opacity
    }
  })

  let floatNext = 0
  const jitter = (amp) => (Math.random() * 2 - 1) * amp
  function floatGain(x, y, text) {
    // Prefer a free one; fall back to the oldest so a burst never goes silent.
    const st = floaters.find(f => !f.live) ?? floaters[floatNext++ % floaters.length]
    st.age = 0
    st.live = true
    st.x = x + jitter(FLOAT_GAIN_JITTER_X)
    st.y = y - 30 + jitter(FLOAT_GAIN_JITTER_Y)
    st.driftX = jitter(FLOAT_GAIN_DRIFT_X)
    st.lbl.text = text
    st.lbl.pos = ex.vec(st.x, st.y)
    st.lbl.graphics.opacity = 1
    st.lbl.graphics.visible = true
  }

  // ── Приймальні ящики: прибуття видно й чути (Стадія 12 / Д5) ──
  //
  // Разом зі стрічкою зникає єдине, що показувало «приїхало»: коробка більше
  // нікуди не повзе, вона просто починає бути. Без заміни це тихий регрес, тому
  // ящик робить дві речі — коротко просідає під вагою і показує, скільки в
  // ньому місця.
  //
  // Лічильник — крапки, а не текст «2/3»: цифру над ящиком доводиться читати,
  // а три крапки, з яких дві горять, видно з іншого кінця фабрики, і вона
  // читається однаково в будь-якій мові (Стадія 13).
  const PIP_W = 14
  const PIP_GAP = 6
  const PIP_FULL  = '#e0b24a'
  const PIP_EMPTY = '#3b3550'
  const intakes = Object.entries(layout.props ?? {})
    .filter(([name]) => name.startsWith('intake_'))
    .map(([name, p]) => {
      const hallId = name.slice('intake_'.length)
      const actor  = propActors[name]
      const row    = (PIP_W + PIP_GAP) * INTAKE_CAPACITY - PIP_GAP
      const pips = Array.from({ length: INTAKE_CAPACITY }, (_, i) => colorRect(scene, {
        x: p.cx - row / 2 + PIP_W / 2 + i * (PIP_W + PIP_GAP),
        y: p.cy - p.h * 0.72,
        w: PIP_W, h: 8, hex: PIP_EMPTY, z: 5,
      }))

      // Одна пружина на ящик: `squash` виставляється в 1 у момент прибуття і
      // згасає сама. Та сама модель, що в pulse — жодних таймерів у симуляції.
      const state = { squash: 0 }
      actor.on('preupdate', (evt) => {
        const { game } = getWorld()
        const held = (game.deliveries ?? []).filter(
          d => d.hallId === hallId && d.status === DeliveryStatus.TRANSIT).length
        for (let i = 0; i < pips.length; i++) {
          pips[i].color = ex.Color.fromHex(i < held ? PIP_FULL : PIP_EMPTY)
        }
        if (state.squash > 0) {
          state.squash = Math.max(0, state.squash - frameMs(evt) / 220)
          const k = Math.sin(state.squash * Math.PI)
          actor.scale = ex.vec(1 + k * 0.12, 1 - k * 0.18)
        } else if (actor.scale.x !== 1) {
          actor.scale = ex.vec(1, 1)
        }
      })

      return [hallId, { bump: () => { state.squash = 1 } }]
    })
  const intakeBoxes = Object.fromEntries(intakes)

  // ── Дрон у польоті (Стадія 14 / К4) ──────────────────────
  //
  // Уся кімната обльоту існує заради цих п'яти секунд: дрон кружляє над
  // майданчиком, під ним їде тінь. Механічно це один актор по колу — найдешевша
  // сцена в грі й водночас єдине місце, де гра про дрони показує дрон у
  // повітрі, а не коробку на столі.
  //
  // Тінь обов'язкова: без неї актор просто висить у повітрі й читається як
  // помилка рендера. Саме тінь каже «він ЛЕТИТЬ», а не «він тут лежить».
  const flightPadProp = Object.entries(layout.props ?? {})
    .find(([name]) => name.startsWith('flight_'))?.[1] ?? null

  const flyer = flightPadProp && new ex.Actor({
    pos: ex.vec(flightPadProp.cx, flightPadProp.cy),
    width: layout.sizes.drone.w * 1.15, height: layout.sizes.drone.h * 1.15,
    z: 12, color: ex.Color.fromHex('#2a2a3e'),
  })
  const flyerShadow = flightPadProp && new ex.Actor({
    pos: ex.vec(flightPadProp.cx, flightPadProp.cy),
    width: layout.sizes.drone.w * 0.8, height: layout.sizes.drone.h * 0.5,
    z: 1.5, color: ex.Color.fromHex('#1b1526'),
  })
  if (flyer) {
    flyer.graphics.visible = false
    flyerShadow.graphics.visible = false
    scene.add(track(flyerShadow))
    scene.add(track(flyer))
  }

  const flightView = flightPadProp && {
    // `show` викликає sceneSync щокадру: t — прогрес обльоту 0..1, kitId —
    // який саме дрон літає. Нуль стану всередині: сцена нічого не пам'ятає,
    // усе, що вона знає про політ, приходить із симуляції.
    show(t, kitId) {
      const a = t * Math.PI * 2 * 1.5 - Math.PI / 2
      const rx = flightPadProp.w * 0.32
      const ry = flightPadProp.h * 0.34
      const x  = flightPadProp.cx + Math.cos(a) * rx
      const groundY = flightPadProp.cy + Math.sin(a) * ry
      // Набирає висоту на початку й сідає в кінці — політ має початок і кінець,
      // а не просто крутиться однаково всі п'ять секунд.
      const lift = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 92 + 18
      flyer.pos = ex.vec(x, groundY - lift)
      flyerShadow.pos = ex.vec(x, groundY)
      flyerShadow.graphics.opacity = 0.55 - lift / 400
      const key = KIT_TYPES[kitId]?.spriteKey
      if (key && flyer._flyingKit !== kitId) {
        applySprite(flyer, key)
        flyer._flyingKit = kitId
      }
      flyer.graphics.visible = true
      flyerShadow.graphics.visible = true
    },
    hide() {
      flyer.graphics.visible = false
      flyerShadow.graphics.visible = false
    },
  }

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
    // Підпис — окремий актор, і його треба гасити ЯВНО.
    //
    // Тут стояв голий `return`, і таймер лишався на екрані з останнім своїм
    // текстом, щойно скарбничка ховалась. А ховається вона рівно тоді, коли
    // перестала бути потрібна: гравець замовив комплект (став busy) або в нього
    // вже є гроші. Кулдаун при цьому дотикав останні секунди — тож на екрані
    // назавжди зависало «0:01» над порожнім місцем. Два симптоми («таймер, коли
    // вона не потрібна» і «0:01 не зникає») — це одна ця гілка.
    if (!piggy.graphics.visible) {
      piggyTimerLabel.graphics.visible = false
      return
    }
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
    // Аркуші з ШІ поки є лише для гравця (Стадія 16) — решта людей лишається
    // на старому ригу, тому це перевірка «чи є арт саме для ЦІЄЇ ролі», а не
    // глобальний перемикач.
    const aiSheets = CHARACTER_ART === 'ai' && tiles === 'player' &&
      Object.fromEntries(Object.entries(AI_SHEETS)
        .map(([dir, e]) => [dir, { ...e, image: getSprite(e.key) }]))
    const pair = CHARACTER_ART === 'kenney' && tiles && TILE_CHARACTER[tiles]
    const frontImg = pair && getSprite(pair[0])
    const rig = (aiSheets && aiSheets.down.image)
      ? createSheetCharacter(actor, aiSheets, { sideFacesRight: AI_SIDE_FACES_RIGHT })
      : frontImg
      ? createTileCharacter(actor, frontImg, getSprite(pair[1]))
      : createCharacterSprite(actor, getSprite(spriteKey), tint ? color : null)

    // Значок ролі над головою — він каже, що означає колір (Стадія 13 / А2).
    //
    // Був `ex.Label` з емодзі: власний шрифт, власне вирівнювання, власний
    // піксельний розмір — і три різні картинки на трьох платформах. Актор зі
    // спрайтом не потребує нічого з цього, тому код тут коротший, ніж був.
    let badgeLabel = null
    if (badge) {
      badgeLabel = new ex.Actor({
        pos:    ex.vec(-9999, -9999),
        width:  BADGE_U,
        height: BADGE_U,
        z: 25,
      })
      scene.add(badgeLabel)
      track(badgeLabel)
      applySprite(badgeLabel, badge)
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
  // Свій риг, і тепер уже свої аркуші: п'ять поз, кожна окремим файлом
  // (`CAT_SHEETS`). Був один аркуш 32×32 на сім клітинок — чотири кроки й три
  // нерухомі пози, — і з нього кіт умів рівно одне: іти боком. У який бік він
  // насправді прямує, малюнок не казав ніколи.
  //
  // Розмір актора тут НОМІНАЛЬНИЙ: справжній розмір кожної пози задає масштаб
  // її анімації, бо пози різні за формою. Сплячий кіт удвічі нижчий і вдвічі
  // ширший за сидячого, і розтягнути обох на один прямокутник — це або
  // розплющити одного, або надути іншого.
  const catActor = new ex.Actor({
    pos:    ex.vec(-9999, -9999),
    width:  CAT_SHEETS.sit.h,
    height: CAT_SHEETS.sit.h,
    z: 6,
    color:  ex.Color.fromHex('#d88a40'),
  })
  scene.add(track(catActor))
  catActor.graphics.visible = false

  // Біг — той самий цикл швидше, і наскільки саме швидше, ВИВОДИТЬСЯ зі
  // швидкості бігу. Було три підібрані вручну темпи (170/80/140 мс), і вони
  // розійшлися б із землею тихо, щойно хтось зачепить CAT_RUN_SPEED: лапи
  // ковзали б, а причину довелося б шукати в двох різних файлах.
  const runTempo = CAT_SPEED / CAT_RUN_SPEED
  const catAnim = { current: null }
  for (const [pose, def] of Object.entries(CAT_SHEETS)) {
    const image = getSprite(def.key)
    if (!image) continue
    const fw = Math.round(image.width / def.frames)
    const sheet = ex.SpriteSheet.fromImageSource({
      image,
      grid: { rows: 1, columns: def.frames, spriteWidth: fw, spriteHeight: image.height },
    })
    // Один множник на обидві осі: висота — з `CAT_SHEETS`, ширина сама
    // випливає з пропорції аркуша, і поза не може сплющитись у принципі.
    const k = def.h / image.height
    const frames = [...Array(def.frames).keys()]
    const make = (ms) => {
      const a = ex.Animation.fromSpriteSheet(sheet, frames, ms)
      a.scale = ex.vec(k, k)
      return a
    }
    catAnim[pose] = make(def.frameMs)
    // Швидкий варіант — лише в ходи: сидіти й спати швидше нема як.
    if (!CAT_STILL_POSES.includes(pose)) catAnim[`${pose}Run`] = make(def.frameMs * runTempo)
  }
  if (catAnim.sit) {
    catActor.graphics.use(catAnim.sit)
    catAnim.current = 'sit'
  }

  catActor.on('preupdate', () => { catActor.z = catActor.pos.y * 0.01 })

  // ── Objective arrow (C7.3) ─────────────────────────────
  // Bobs above the player's head, pointing at the next useful zone.
  const arrow = new ex.Actor({
    pos: ex.vec(-9999, -9999), width: ARROW_W, height: ARROW_H,
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

      // Номер рівня над головою (F5, звужено Стадією 11 / D3). Цінника поруч
      // більше немає: підвищення живе в панелі, а не на підлозі, і підпис із
      // ціною над людиною обіцяв би дію, якої там уже не буде.
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
    floatGain,
    intakeBoxes,
    flightView,
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
