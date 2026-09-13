// Джерело всього арту гри (Стадія 13 / А5).
//
// Запуск: `npm run sprites`.
//
// Файл довго звався gen-placeholder-sprites.js — «поки що», доки не з'явиться
// справжній арт. Справжнім артом він і став: усе, що видно на сцені, малює цей
// скрипт. Слово «placeholder» перестало бути правдою й зникло разом із назвою.
//
// Три правила, які тримають набір ОДНИМ набором:
//
//   1. Розмір — у СВІТОВИХ одиницях, через `u()` з гри. Піксельний виводиться.
//   2. Колір — з `palette.js`, а не з літерала в функції малювання.
//   3. Кожен спрайт виходить через ОДИН хвіст `finish()` (А6) — тому джерело
//      пікселів можна колись замінити, а стиль лишиться.
import { writeFileSync, mkdirSync } from 'fs'
import { pathToFileURL } from 'url'
// Розміри й кольори беруться з ТИХ САМИХ модулів, що їх читає гра. Спрайт,
// намальований не в масштабі персонажа, — це та сама помилка, через яку
// викинули три паки Kenney (CREDITS.md); а бейдж ролі, пофарбований власною
// копією кольору, розійшовся б із кільцем під ногами тієї ж людини.
import { u } from '../src/state/config.js'
import { ROLES, ROLE_ORDER } from '../src/defs/roles.js'
import {
  P, PRODUCT, LIVERY, PROP, SIGNAL, ACCENT,
  UNITS_PER_PX, hex, fullPalette, roleColors,
} from './palette.js'

// Кодувальник PNG живе в png-encode.js — його ділять генератор та імпортер
// зовнішніх аркушів (import-ai-sheet.js).
import { encodePng } from './png-encode.js'

// ── Pixel drawing primitives ──────────────────────────────────────────────────

function setPixel(pixels, w, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= w || y * w >= pixels.length / 4) return
  const i = (y * w + x) * 4
  if (i + 3 >= pixels.length) return
  const srcA = a / 255
  const dstA = pixels[i + 3] / 255
  const outA = srcA + dstA * (1 - srcA)
  if (outA < 0.001) return
  pixels[i]     = Math.round((r * srcA + pixels[i]     * dstA * (1 - srcA)) / outA)
  pixels[i + 1] = Math.round((g * srcA + pixels[i + 1] * dstA * (1 - srcA)) / outA)
  pixels[i + 2] = Math.round((b * srcA + pixels[i + 2] * dstA * (1 - srcA)) / outA)
  pixels[i + 3] = Math.round(outA * 255)
}

function fillRect(pixels, w, x1, y1, x2, y2, r, g, b, a = 255) {
  for (let y = y1; y <= y2; y++)
    for (let x = x1; x <= x2; x++)
      setPixel(pixels, w, x, y, r, g, b, a)
}

function fillCircle(pixels, w, cx, cy, radius, r, g, b, a = 255) {
  const r2 = radius * radius
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++)
      if (dx * dx + dy * dy <= r2)
        setPixel(pixels, w, cx + dx, cy + dy, r, g, b, a)
}

function drawLine(pixels, w, x0, y0, x1, y1, r, g, b, thick = 1, a = 255) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let x = x0, y = y0
  while (true) {
    for (let ty = -Math.floor(thick / 2); ty <= Math.floor(thick / 2); ty++)
      setPixel(pixels, w, x, y + ty, r, g, b, a)
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; x += sx }
    if (e2 <  dx) { err += dx; y += sy }
  }
}

// ── Sprite draw functions ─────────────────────────────────────────────────────

// Shared drone motor helper
function droneMotor(pixels, w, mx, my, ro, ri, or_, og, ob, ir, ig, ib) {
  fillCircle(pixels, w, mx, my, ro,  or_, og, ob)
  fillCircle(pixels, w, mx, my, ri,  ir, ig, ib)
  fillCircle(pixels, w, mx, my, 2,   ...P.metalHi)  // shaft
}

// Mini drone — classic X-frame, blue-gray. 96×52.
function drawMiniDrone(pixels, w, h) {
  const cx = w >> 1, cy = h >> 1
  const motors = [[10, 10], [w - 11, 10], [10, h - 11], [w - 11, h - 11]]

  // Prop discs
  for (const [mx, my] of motors)
    fillCircle(pixels, w, mx, my, 9,  ...PRODUCT.mini.hi, 55)

  // Arms (X-frame)
  for (const [mx, my] of motors)
    drawLine(pixels, w, cx, cy, mx, my,  ...PRODUCT.mini.lo, 3)

  // Motors
  for (const [mx, my] of motors)
    droneMotor(pixels, w, mx, my, 7, 5,  ...PRODUCT.mini.mid,  ...PRODUCT.mini.body)

  // Body
  fillRect(pixels, w, cx - 7, cy - 5, cx + 7, cy + 5,  ...PRODUCT.mini.dark)
  fillRect(pixels, w, cx - 5, cy - 3, cx + 5, cy + 3,  ...PRODUCT.mini.body)
  fillCircle(pixels, w, cx, cy, 2,  ...PRODUCT.mini.led)   // blue LED
}

// Racing drone — narrow cyan X, small motors, front camera. 96×52.
function drawRacingDrone(pixels, w, h) {
  const cx = w >> 1, cy = h >> 1
  const motors = [[8, 8], [w - 9, 8], [8, h - 9], [w - 9, h - 9]]

  // Prop discs (cyan tint)
  for (const [mx, my] of motors)
    fillCircle(pixels, w, mx, my, 8,  ...PRODUCT.racing.hi, 55)

  // Arms
  for (const [mx, my] of motors)
    drawLine(pixels, w, cx, cy, mx, my,  ...PRODUCT.racing.lo, 2)

  // Motors
  for (const [mx, my] of motors)
    droneMotor(pixels, w, mx, my, 6, 4,  ...PRODUCT.racing.mid,  ...PRODUCT.racing.body)

  // Body (slim, aerodynamic)
  fillRect(pixels, w, cx - 5, cy - 3, cx + 5, cy + 3,  ...PRODUCT.racing.dark)
  fillRect(pixels, w, cx - 3, cy - 2, cx + 3, cy + 2,  ...PRODUCT.racing.body)

  // Front camera bump
  fillCircle(pixels, w, cx + 4, cy, 3,  ...PRODUCT.racing.dark)
  fillCircle(pixels, w, cx + 4, cy, 2,  ...PRODUCT.racing.dark)
  fillCircle(pixels, w, cx + 4, cy, 1,  ...PRODUCT.racing.hi)  // lens glint

  fillCircle(pixels, w, cx, cy, 2,  ...PRODUCT.racing.led)   // red LED
}

// Cinematic drone — heavy X-frame with gimbal, dark gray. 96×52.
function drawCinematicDrone(pixels, w, h) {
  const cx = w >> 1, cy = h >> 1
  const motors = [[12, 10], [w - 13, 10], [12, h - 11], [w - 13, h - 11]]

  // Prop discs
  for (const [mx, my] of motors)
    fillCircle(pixels, w, mx, my, 9,  ...PRODUCT.cinematic.mid, 50)

  // Arms
  for (const [mx, my] of motors)
    drawLine(pixels, w, cx, cy, mx, my,  ...PRODUCT.cinematic.lo, 4)

  // Motors
  for (const [mx, my] of motors)
    droneMotor(pixels, w, mx, my, 7, 5,  ...PRODUCT.cinematic.mid,  ...PRODUCT.cinematic.body)

  // Large body
  fillRect(pixels, w, cx - 9, cy - 6, cx + 9, cy + 6,  ...PRODUCT.cinematic.dark)
  fillRect(pixels, w, cx - 7, cy - 4, cx + 7, cy + 4,  ...PRODUCT.cinematic.body)

  // Gimbal camera (center-front)
  fillCircle(pixels, w, cx, cy + 2, 6,  ...PRODUCT.cinematic.dark)
  fillCircle(pixels, w, cx, cy + 2, 4,  ...PRODUCT.cinematic.lensBase)  // gimbal base
  fillCircle(pixels, w, cx, cy + 2, 2,  ...PRODUCT.cinematic.lens)  // lens
  fillCircle(pixels, w, cx + 1, cy + 1, 1,  ...SIGNAL.glint)  // lens glint

  fillCircle(pixels, w, cx, cy - 2, 2,  ...SIGNAL.glint)  // white LED
}

// Longrange drone — elongated H-frame, GPS dome, military green. 96×52.
function drawLongrangeDrone(pixels, w, h) {
  const cx = w >> 1, cy = h >> 1
  const motors = [[10, 12], [w - 11, 12], [10, h - 13], [w - 11, h - 13]]

  // Prop discs (green tint)
  for (const [mx, my] of motors)
    fillCircle(pixels, w, mx, my, 9,  ...PRODUCT.longrange.mid, 55)

  // Main horizontal bar (H-frame crossbar)
  fillRect(pixels, w, 10, cy - 2, w - 11, cy + 2,  ...PRODUCT.longrange.body)

  // Arm stubs to motors (vertical bars)
  for (const [mx, my] of motors)
    drawLine(pixels, w, mx, cy, mx, my,  ...PRODUCT.longrange.lo, 3)

  // Motors
  for (const [mx, my] of motors)
    droneMotor(pixels, w, mx, my, 7, 5,  ...PRODUCT.longrange.hi,  ...PRODUCT.longrange.dark)

  // Elongated body
  fillRect(pixels, w, cx - 10, cy - 4, cx + 10, cy + 4,  ...PRODUCT.longrange.dark)
  fillRect(pixels, w, cx - 8,  cy - 3, cx + 8,  cy + 3,  ...PRODUCT.longrange.body)

  // GPS dome (top center)
  fillCircle(pixels, w, cx, 7, 5,  ...PRODUCT.longrange.gps)
  fillCircle(pixels, w, cx, 7, 3,  ...PRODUCT.longrange.gpsHi)
  fillCircle(pixels, w, cx, 7, 1,  ...SIGNAL.light)

  // Antenna nubs
  setPixel(pixels, w, cx - 4, 4,  ...PRODUCT.longrange.gps)
  setPixel(pixels, w, cx + 4, 4,  ...PRODUCT.longrange.gps)

  fillCircle(pixels, w, cx, cy, 2,  ...PRODUCT.longrange.led)   // green LED
}

// ── Три типи Стадії 14 / К5 ─────────────────────────────────────────────────
//
// Кожен входить у гру через кімнату, і кожен мусить читатись СИЛУЕТОМ: на
// відстані, з якої гра грається, колір уже не працює, а форма ще працює.
// Тому вони навмисно не схожі на чотири наявні квадрокоптери.

// Літак (fixed-wing) — суцільне крило й фюзеляж. Єдиний тип у грі без
// пропелерних дисків по кутах: саме тому його видно з першого кадру.
function drawFixedWing(pixels, w, h) {
  const cx = w >> 1, cy = h >> 1

  // Крило — одна широка трапеція від краю до краю.
  for (let x = 6; x < w - 6; x++) {
    const t  = Math.abs(x - cx) / (cx - 6)
    const hh = Math.round(3 + (1 - t) * 4)
    fillRect(pixels, w, x, cy - hh, x, cy + hh, ...PRODUCT.fixedwing.mid)
  }
  fillRect(pixels, w, 6, cy - 2, w - 7, cy - 1, ...PRODUCT.fixedwing.hi)
  fillRect(pixels, w, 6, cy + 4, w - 7, cy + 5, ...PRODUCT.fixedwing.lo)

  // Фюзеляж — веретено вздовж крила.
  fillRect(pixels, w, cx - 20, cy - 5, cx + 22, cy + 5, ...PRODUCT.fixedwing.body)
  fillRect(pixels, w, cx - 18, cy - 3, cx + 20, cy + 3, ...PRODUCT.fixedwing.mid)

  // Ніс і штовхаючий гвинт позаду — компоновка, за якою літак і впізнають.
  fillCircle(pixels, w, cx - 22, cy, 5, ...PRODUCT.fixedwing.lo)
  fillCircle(pixels, w, cx - 23, cy, 3, ...PRODUCT.fixedwing.hi)
  fillCircle(pixels, w, cx + 26, cy, 8, ...PRODUCT.fixedwing.mid, 55)
  drawLine(pixels, w, cx + 26, cy - 7, cx + 26, cy + 7, ...PRODUCT.fixedwing.dark, 2)

  // V-подібне хвостове оперення.
  drawLine(pixels, w, cx + 20, cy, cx + 30, cy - 10, ...PRODUCT.fixedwing.lo, 3)
  drawLine(pixels, w, cx + 20, cy, cx + 30, cy + 10, ...PRODUCT.fixedwing.lo, 3)

  fillCircle(pixels, w, cx - 6, cy, 2, ...PRODUCT.fixedwing.led)
}

// Важкий носій — гексакоптер: шість моторів і підвішений вантаж під черевом.
// Шість, а не чотири: «важкий» має бути видно рахунком, а не написом.
function drawHeavyLifter(pixels, w, h) {
  const cx = w >> 1, cy = h >> 1
  const motors = [
    [9, 9], [cx, 6], [w - 10, 9],
    [9, h - 10], [cx, h - 7], [w - 10, h - 10],
  ]

  for (const [mx, my] of motors)
    fillCircle(pixels, w, mx, my, 10, ...PRODUCT.heavy.mid, 55)
  for (const [mx, my] of motors)
    drawLine(pixels, w, cx, cy, mx, my, ...PRODUCT.heavy.lo, 4)
  for (const [mx, my] of motors)
    droneMotor(pixels, w, mx, my, 8, 6, ...PRODUCT.heavy.hi, ...PRODUCT.heavy.dark)

  // Масивне черево.
  fillRect(pixels, w, cx - 14, cy - 8, cx + 14, cy + 8, ...PRODUCT.heavy.dark)
  fillRect(pixels, w, cx - 12, cy - 6, cx + 12, cy + 6, ...PRODUCT.heavy.body)

  // Вантаж на стропах — те, заради чого носій і існує.
  drawLine(pixels, w, cx - 8, cy + 8, cx - 6, cy + 14, ...PRODUCT.heavy.lo, 2)
  drawLine(pixels, w, cx + 8, cy + 8, cx + 6, cy + 14, ...PRODUCT.heavy.lo, 2)
  fillRect(pixels, w, cx - 9, cy + 14, cx + 9, h - 2, ...P.wood)
  fillRect(pixels, w, cx - 7, cy + 16, cx + 7, h - 4, ...P.accent)

  fillCircle(pixels, w, cx, cy, 2, ...PRODUCT.heavy.led)
}

// Прототип — відкрита рама без корпусу: видно плату, кабелі й великий сенсор.
// «Ще не серійний» — це те, що ВИДНО, а не те, що написано на картці.
function drawPrototype(pixels, w, h) {
  const cx = w >> 1, cy = h >> 1
  const motors = [[12, 11], [w - 13, 11], [12, h - 12], [w - 13, h - 12]]

  for (const [mx, my] of motors)
    fillCircle(pixels, w, mx, my, 9, ...PRODUCT.proto.mid, 45)
  // Рама — тонкі відкриті балки, не суцільне тіло.
  for (const [mx, my] of motors)
    drawLine(pixels, w, cx, cy, mx, my, ...PRODUCT.proto.lo, 2)
  for (const [mx, my] of motors)
    droneMotor(pixels, w, mx, my, 6, 4, ...PRODUCT.proto.hi, ...PRODUCT.proto.dark)

  // Гола плата замість корпусу.
  fillRect(pixels, w, cx - 12, cy - 6, cx + 12, cy + 6, ...PRODUCT.proto.body)
  for (let x = cx - 9; x <= cx + 9; x += 4)
    drawLine(pixels, w, x, cy - 4, x, cy + 4, ...PRODUCT.proto.hi, 1)

  // Сенсор на кронштейні — єдина завершена деталь на всьому апараті.
  fillCircle(pixels, w, cx, cy - 12, 6, ...PRODUCT.proto.lo)
  fillCircle(pixels, w, cx, cy - 12, 4, ...PRODUCT.proto.led)
  drawLine(pixels, w, cx, cy - 6, cx, cy - 10, ...PRODUCT.proto.dark, 2)

  // Кабельна петля збоку — те, що на серійному сховали б усередину.
  drawLine(pixels, w, cx + 12, cy, cx + 18, cy + 6, ...PRODUCT.proto.led, 2)
  drawLine(pixels, w, cx + 18, cy + 6, cx + 14, cy + 10, ...PRODUCT.proto.led, 2)
}

// Workbench — top-down wooden bench with PCBs and tools. 192×64.
// Стадія 15 / П3: верстак мав п'ять власних відтінків коричневого, і після
// квантизації всі вони злились у два — стіл став пласкою плитою без дощок,
// без канта й без коробочок із компонентами. Виправлення не в тому, щоб
// повернути п'ять фарб, а в тому, щоб КОРИСТУВАТИСЬ спільною рампою: дошки
// малюються woodLo по wood, кант — darkLo, деталі — warm. Три кольори з
// набору, які згодні з рештою сцени, читаються краще, ніж п'ять власних.
function drawWorkbench(pixels, w, h) {
  // Wood base (dark brown)
  fillRect(pixels, w, 0, 0, w - 1, h - 1,  ...P.fWoodLo)

  // Wood surface (lighter planks)
  fillRect(pixels, w, 0, 4, w - 1, h - 8,  ...P.wood)

  // Grain lines (horizontal, one per plank ~12px apart)
  for (let y = 8; y < h - 8; y += 10)
    fillRect(pixels, w, 0, y, w - 1, y,  ...P.woodLo)

  // Light shine along top
  fillRect(pixels, w, 0, 4, w - 1, 5,  ...P.woodHi)
  fillRect(pixels, w, 0, 6, w - 1, 6,  ...P.wood)

  // Front edge (thick dark strip)
  fillRect(pixels, w, 0, h - 7, w - 1, h - 1,  ...P.darkLo)
  fillRect(pixels, w, 0, h - 7, w - 1, h - 6,  ...P.dark)

  // Small green PCB board (left quarter)
  const pcbX = Math.round(w * 0.10)
  fillRect(pixels, w, pcbX, 10, pcbX + 28, 24,  ...P.leafLo)
  fillRect(pixels, w, pcbX + 1, 11, pcbX + 27, 23,  ...P.leafLo)
  // PCB traces
  drawLine(pixels, w, pcbX + 4, 13, pcbX + 24, 13,  ...P.accent, 1)
  drawLine(pixels, w, pcbX + 4, 17, pcbX + 24, 17,  ...P.accent, 1)
  drawLine(pixels, w, pcbX + 4, 21, pcbX + 24, 21,  ...P.accent, 1)
  // Solder pads
  for (let sx = pcbX + 4; sx < pcbX + 26; sx += 5)
    fillCircle(pixels, w, sx, 13, 1,  ...P.accent)

  // Small soldering station icon (right side)
  const stX = Math.round(w * 0.72)
  fillRect(pixels, w, stX, 10, stX + 20, 22,  ...P.darkLo)
  fillRect(pixels, w, stX + 1, 11, stX + 19, 21,  ...P.dark)
  // Iron resting in holder
  fillRect(pixels, w, stX + 8, 8, stX + 12, 22,  ...P.darkHi)
  fillRect(pixels, w, stX + 12, 9, stX + 18, 11,  ...P.accent)  // tip

  // A few component resistors scattered
  for (const [rx, ry] of [[w * 0.42, 14], [w * 0.55, 18]]) {
    const bx = Math.round(rx)
    // Коробочки з компонентами: були двома власними коричневими, які після
    // квантизації стали кольором самого столу й зникли з нього. Тепер теплий
    // акцент із набору — деталь, яку видно, бо вона НЕ дерево.
    fillRect(pixels, w, bx, ry, bx + 8, ry + 3,  ...P.warmLo)
    fillRect(pixels, w, bx + 1, ry + 1, bx + 7, ry + 2,  ...P.warm)
    setPixel(pixels, w, bx + 3, ry + 1,  ...P.accent)  // gold band
    setPixel(pixels, w, bx + 5, ry + 1,  ...P.warmLo)  // red band
  }
}

// Soldering iron — tool lying on bench. 64×16.
function drawSolderingIron(pixels, w, h) {
  // Handle — rubber grip (dark red-brown, textured)
  fillRect(pixels, w, 0, 2, w - 18, h - 3,  ...P.woodLo)
  fillRect(pixels, w, 0, 3, w - 18, h - 4,  ...P.warmLo)
  for (let x = 4; x < w - 18; x += 5) {
    fillRect(pixels, w, x, 2, x + 1, h - 3,  ...P.darkLo)
  }
  // Collar
  fillRect(pixels, w, w - 18, 1, w - 16, h - 2,  ...P.metalLo)
  // Heating element
  fillRect(pixels, w, w - 16, 2, w - 8, h - 3,  ...P.metal)
  fillRect(pixels, w, w - 15, 3, w - 9, h - 4,  ...P.metal)
  // Tip (bright — hot)
  fillRect(pixels, w, w - 8, 3, w - 1, h - 4,  ...P.accent)
  fillRect(pixels, w, w - 5, 4, w - 1, h - 5,  ...SIGNAL.glow)
  // Tip glow dot
  setPixel(pixels, w, w - 3, h >> 1,  ...SIGNAL.light)
}

// Ceiling lamp — top-down view with warm glow rings. 48×48.
function drawLamp(pixels, w, h) {
  const cx = w >> 1, cy = h >> 1

  // Outer ambient glow (very faint warm amber)
  fillCircle(pixels, w, cx, cy, 22,  ...SIGNAL.glow, 18)
  fillCircle(pixels, w, cx, cy, 18,  ...SIGNAL.glow, 35)

  // Fixture ring (brass/gold)
  fillCircle(pixels, w, cx, cy, 13,  ...P.wood)
  fillCircle(pixels, w, cx, cy, 10,  ...P.accent)

  // Frosted glass bowl
  fillCircle(pixels, w, cx, cy, 8,   ...SIGNAL.glow)
  fillCircle(pixels, w, cx, cy, 5,   ...SIGNAL.light)
  fillCircle(pixels, w, cx, cy, 2,   ...SIGNAL.glint)

  // Mounting screws (4 dots on ring)
  for (const [dx, dy] of [[-10, -10], [10, -10], [-10, 10], [10, 10]])
    setPixel(pixels, w, cx + dx, cy + dy,  ...P.woodLo)

  // Cord (short line upward)
  fillRect(pixels, w, cx - 1, 0, cx + 1, 3,  ...P.darkHi)
}

// Mailbox — blue postal box with slot and flag. 64×52.
function drawMailbox(pixels, w, h) {
  const cx = w >> 1, cy = h >> 1

  // Body base
  fillRect(pixels, w, 3, 4, w - 4, h - 5,  ...P.clothLo)
  fillRect(pixels, w, 4, 5, w - 5, h - 6,  ...P.clothLo)

  // Top lighter band (curved roof from above)
  fillRect(pixels, w, 4, 5, w - 5, 12,  ...P.cloth)
  fillRect(pixels, w, 4, 13, w - 5, 14,  ...P.cloth)

  // Rounded front end (left) — pill shape suggestion
  fillRect(pixels, w, 3, 5, 5, h - 6,  ...P.cloth)
  fillCircle(pixels, w, 5, cy,  (h - 10) >> 1,  ...P.clothLo)

  // Rounded back end (right)
  fillRect(pixels, w, w - 6, 5, w - 4, h - 6,  ...P.clothLo)

  // Mail slot (horizontal dark slit)
  fillRect(pixels, w, 10, cy - 1, w - 11, cy + 1,  ...P.darkLo)
  fillRect(pixels, w, 10, cy - 2, w - 11, cy - 2,  ...P.cloth, 180)  // highlight above slot

  // Door seam (vertical line on left face)
  fillRect(pixels, w, 12, 7, 12, h - 8,  ...P.clothLo)

  // Flag (right side, raised = mail waiting)
  fillRect(pixels, w, w - 8, cy - 10, w - 6, cy - 4,  ...P.darkLo)  // pole
  fillRect(pixels, w, w - 8, cy - 10, w - 4, cy - 7,  ...P.warmLo)  // flag
  fillRect(pixels, w, w - 7, cy - 7,  w - 4, cy - 5,  ...P.warmLo)  // flag shadow

  // Border
  fillRect(pixels, w, 3, 4, w - 4, 4,  ...P.clothLo)
  fillRect(pixels, w, 3, h - 5, w - 4, h - 5,  ...P.clothLo)
}

// Piggy bank — pink ceramic pig from above. 64×64.
function drawPiggy(pixels, w, h) {
  const cx = w >> 1, cy = h >> 1

  // Shadow
  fillCircle(pixels, w, cx, cy + 2, 26,  0, 0, 0, 30)

  // Body (wide oval)
  for (let y = 6; y <= h - 7; y++) {
    const dy = y - cy
    const halfW = Math.round(Math.sqrt(Math.max(0, 1 - (dy * dy) / ((cy - 5) * (cy - 5)))) * (cx - 4))
    fillRect(pixels, w, cx - halfW, y, cx + halfW, y,  ...PROP.pigHi)
  }
  // Body highlight (top-left) — `pigTop`, а не `pigHi`: обидва були окремими
  // рожевими до Стадії 15, і після згортання рампи відблиск став кольором
  // тіла, тобто зник (виявлено на кроці П3, контактним аркушем).
  for (let y = 8; y <= cy - 2; y++) {
    const dy = y - (cy - 8)
    const halfW = Math.round(Math.sqrt(Math.max(0, 1 - (dy * dy) / ((cy - 10) * (cy - 10)))) * (cx - 12))
    fillRect(pixels, w, cx - halfW, y, cx + halfW - 4, y,  ...PROP.pigTop, 200)
  }

  // Ears (side bumps)
  fillCircle(pixels, w, cx - 24, cy - 2, 8,  ...PROP.pig)
  fillCircle(pixels, w, cx - 24, cy - 2, 5,  ...PROP.pigHi)
  fillCircle(pixels, w, cx + 24, cy - 2, 8,  ...PROP.pig)
  fillCircle(pixels, w, cx + 24, cy - 2, 5,  ...PROP.pigHi)

  // Coin slot (dark slit on top)
  fillRect(pixels, w, cx - 6, 9, cx + 6, 11,  ...PROP.pigLo)
  fillRect(pixels, w, cx - 5, 10, cx + 5, 10,  ...PROP.pigDark)

  // Eyes (cute dots on front half)
  fillCircle(pixels, w, cx - 7, cy + 6, 3,  ...PROP.pigDark)
  fillCircle(pixels, w, cx - 7, cy + 6, 2,  ...PROP.pigDark)
  setPixel(pixels, w, cx - 8, cy + 5,  ...SIGNAL.glint)   // glint
  fillCircle(pixels, w, cx + 7, cy + 6, 3,  ...PROP.pigDark)
  fillCircle(pixels, w, cx + 7, cy + 6, 2,  ...PROP.pigDark)
  setPixel(pixels, w, cx + 6, cy + 5,  ...SIGNAL.glint)

  // Snout
  fillCircle(pixels, w, cx, cy + 16, 7,  ...PROP.pig)
  fillCircle(pixels, w, cx, cy + 16, 5,  ...PROP.pigHi)
  fillCircle(pixels, w, cx - 2, cy + 17, 2,  ...PROP.pigLo)   // nostril
  fillCircle(pixels, w, cx + 2, cy + 17, 2,  ...PROP.pigLo)

  // Curly tail (top-center — viewed from above)
  setPixel(pixels, w, cx,     cy - 20,  ...PROP.pig)
  setPixel(pixels, w, cx + 2, cy - 21,  ...PROP.pig)
  setPixel(pixels, w, cx + 3, cy - 20,  ...PROP.pig)
  setPixel(pixels, w, cx + 2, cy - 19,  ...PROP.pig)
}

// Worker character — top-down view, 64×64 per frame, 4 frames wide = 256×64.
// Palettes let one walk-cycle routine produce visually distinct characters.
// The player must be readable at a glance next to a hired worker.
const WORKER_PALETTE = {
  jacket: [...LIVERY.worker.jacket], jacketHi: [...LIVERY.worker.jacketHi], jacketDark: [...LIVERY.worker.jacketDark],
  trim:   [...LIVERY.worker.trim], pants: [...LIVERY.pants], hair: [...LIVERY.worker.hair],
  hairDark: [...LIVERY.worker.hairDark],
}

const PLAYER_PALETTE = {
  jacket: [...LIVERY.player.jacket], jacketHi: [...LIVERY.player.jacketHi], jacketDark: [...LIVERY.player.jacketDark],
  trim:   [...LIVERY.player.trim], pants: [...LIVERY.shade], hair: [...LIVERY.player.hair],
  hairDark: [...LIVERY.player.hairDark],
}

function drawWalkCycle(pixels, w, h, pal) {
  const FRAME = 64
  // foot positions relative to frame center (x offset from frame center, absolute y)
  const frames = [
    { lx: 26, ly: 50, rx: 38, ry: 50 },   // neutral
    { lx: 21, ly: 48, rx: 40, ry: 54 },   // left foot forward
    { lx: 26, ly: 50, rx: 38, ry: 50 },   // neutral
    { lx: 24, ly: 54, rx: 43, ry: 48 },   // right foot forward
  ]

  for (let fi = 0; fi < 4; fi++) {
    const ox = fi * FRAME   // x offset for this frame
    const cx = ox + 32      // frame center x
    const f  = frames[fi]

    // Shadow under feet (ground contact)
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -12; dx <= 12; dx++)
        if ((dx * dx) / 144 + (dy * dy) / 16 <= 1)
          setPixel(pixels, w, cx + dx, 53 + dy, 0, 0, 0, 28)

    // Shoes (very dark)
    fillCircle(pixels, w, ox + f.lx, f.ly,  5,  ...LIVERY.outline)
    fillCircle(pixels, w, ox + f.rx, f.ry,  5,  ...LIVERY.outline)
    // Shoe tips (slightly lighter)
    fillCircle(pixels, w, ox + f.lx - 1, f.ly - 1,  2,  ...LIVERY.shade)
    fillCircle(pixels, w, ox + f.rx - 1, f.ry - 1,  2,  ...LIVERY.shade)

    // Pants
    fillCircle(pixels, w, ox + f.lx, f.ly - 5,  5,  ...pal.pants)
    fillCircle(pixels, w, ox + f.rx, f.ry - 5,  5,  ...pal.pants)

    // Body / work jacket
    fillCircle(pixels, w, cx, 34,  10,  ...pal.jacket)
    fillCircle(pixels, w, cx, 32,   7,  ...pal.jacketHi)   // highlight
    // Jacket collar / zipper stripe
    fillRect(pixels, w, cx - 1, 28, cx + 1, 36,  ...pal.jacketDark)
    // Side buttons / reflective strips
    fillRect(pixels, w, cx - 8, 32, cx - 6, 35,  ...pal.trim)
    fillRect(pixels, w, cx + 6, 32, cx + 8, 35,  ...pal.trim)

    // Head (warm skin tone)
    fillCircle(pixels, w, cx, 18,  12,  ...LIVERY.skin)
    fillCircle(pixels, w, cx, 15,   8,  ...LIVERY.skinHi)   // forehead highlight

    // Hair / work cap (dark brown, covers top of head)
    for (let dy = -12; dy <= -3; dy++)
      for (let dx = -12; dx <= 12; dx++)
        if (dx * dx + dy * dy <= 144)
          setPixel(pixels, w, cx + dx, 18 + dy,  ...pal.hair)
    // Cap visor (flat brim)
    fillRect(pixels, w, cx - 9, 16, cx + 9, 17,  ...pal.hairDark)

    // Eyes (small dark dots below cap brim)
    setPixel(pixels, w, cx - 4, 18,  ...LIVERY.outline)
    setPixel(pixels, w, cx + 4, 18,  ...LIVERY.outline)
    setPixel(pixels, w, cx - 4, 17,  ...LIVERY.outline)
    setPixel(pixels, w, cx + 4, 17,  ...LIVERY.outline)
    // Eye glints
    setPixel(pixels, w, cx - 3, 17,  ...LIVERY.eyeWhite)
    setPixel(pixels, w, cx + 5, 17,  ...LIVERY.eyeWhite)

    // Mouth / slight smile
    setPixel(pixels, w, cx - 2, 22,  ...LIVERY.skinLo)
    setPixel(pixels, w, cx,     22,  ...LIVERY.skinLo)
    setPixel(pixels, w, cx + 2, 22,  ...LIVERY.skinLo)
    setPixel(pixels, w, cx - 2, 23,  ...LIVERY.skinShade)
    setPixel(pixels, w, cx + 2, 23,  ...LIVERY.skinShade)
  }
}

// Палітра, світло і щільність пікселя переїхали в `./palette.js` (А5.2): доти
// кольори були розсипані по функціях і жоден не можна було змінити в одному
// місці. `box()` нижче лишається тут — це не колір, а СВІТЛО: воно єдине
// пояснює, чому всі об'єкти згодні, з якого боку падає промінь.

// A lit box: body, brighter top edge, darker bottom edge. Every solid object in
// the game is made of these, which is why they all agree about where the light is.
function box(px, w, x, y, bw, bh, base, hi, lo) {
  fillRect(px, w, x, y, x + bw - 1, y + bh - 1, ...base)
  if (hi) fillRect(px, w, x, y, x + bw - 1, y + Math.max(0, Math.round(bh * 0.18)), ...hi)
  if (lo) fillRect(px, w, x, y + bh - Math.max(1, Math.round(bh * 0.16)), x + bw - 1, y + bh - 1, ...lo)
}

// Evenly spaced lines — planks, slats, ribs. Horizontal by default.
function ribs(px, w, x, y, bw, bh, step, col, vertical = false) {
  if (vertical) {
    for (let i = x + step; i < x + bw; i += step) fillRect(px, w, i, y, i, y + bh - 1, ...col)
  } else {
    for (let i = y + step; i < y + bh; i += step) fillRect(px, w, x, i, x + bw - 1, i, ...col)
  }
}

// ── Furniture and props, all from P and box() ───────────────────────────────

function drawBed(px, w, h) {
  box(px, w, 2, 2, w - 4, h - 4, P.wood, P.woodHi, P.woodLo)          // frame
  box(px, w, 5, 5, w - 10, Math.round(h * 0.30), P.white, null, P.metal)  // pillow
  box(px, w, 5, Math.round(h * 0.34), w - 10, Math.round(h * 0.60), P.cloth, P.clothHi, P.clothLo)
  ribs(px, w, 6, Math.round(h * 0.40), w - 12, Math.round(h * 0.50), 9, P.clothLo)
}

function drawSofa(px, w, h) {
  box(px, w, 2, Math.round(h * 0.18), w - 4, Math.round(h * 0.72), P.cloth, P.clothHi, P.clothLo)
  box(px, w, 2, 2, w - 4, Math.round(h * 0.26), P.clothLo, P.cloth, null)     // backrest
  box(px, w, 2, Math.round(h * 0.18), 8, Math.round(h * 0.72), P.clothLo, null, null)   // arms
  box(px, w, w - 10, Math.round(h * 0.18), 8, Math.round(h * 0.72), P.clothLo, null, null)
  const cw = Math.round((w - 24) / 2)
  box(px, w, 12, Math.round(h * 0.40), cw, Math.round(h * 0.38), P.clothHi, null, P.cloth)
  box(px, w, 14 + cw, Math.round(h * 0.40), cw, Math.round(h * 0.38), P.clothHi, null, P.cloth)
}

function drawRug(px, w, h) {
  // Quiet, and patterned rather than striped: the first version was a bright
  // salmon block with ribs and read as a mattress lying on the floor.
  box(px, w, 0, 0, w, h, P.warmLo, null, null)
  box(px, w, 4, 4, w - 8, h - 8, P.warm, null, null)
  box(px, w, 12, 12, w - 24, h - 24, P.warmLo, null, null)
  for (let y = 16; y < h - 16; y += 12)
    for (let x = 16; x < w - 16; x += 12)
      fillRect(px, w, x, y, x + 3, y + 3, ...P.warmHi)
  // Fringe on the short edges.
  for (let x = 2; x < w - 2; x += 4) {
    fillRect(px, w, x, 0, x + 1, 2, ...P.warmHi)
    fillRect(px, w, x, h - 3, x + 1, h - 1, ...P.warmHi)
  }
}

function drawTable(px, w, h) {
  box(px, w, 2, 2, w - 4, h - 10, P.wood, P.woodHi, P.woodLo)
  ribs(px, w, 3, 3, w - 6, h - 12, 8, P.woodLo, true)
  fillRect(px, w, 5, h - 9, 11, h - 3, ...P.woodLo)
  fillRect(px, w, w - 12, h - 9, w - 6, h - 3, ...P.woodLo)
}

function drawChair(px, w, h) {
  box(px, w, Math.round(w * 0.18), 2, Math.round(w * 0.64), Math.round(h * 0.30), P.woodLo, P.wood, null)
  box(px, w, 3, Math.round(h * 0.34), w - 6, Math.round(h * 0.44), P.wood, P.woodHi, P.woodLo)
  fillRect(px, w, 5, h - 8, 9, h - 3, ...P.woodLo)
  fillRect(px, w, w - 10, h - 8, w - 6, h - 3, ...P.woodLo)
}

function drawCounter(px, w, h) {
  box(px, w, 1, 1, w - 2, h - 2, P.wood, P.woodHi, P.woodLo)
  box(px, w, 4, 4, w - 8, Math.round(h * 0.22), P.metalHi, null, P.metal)   // worktop
  ribs(px, w, 4, Math.round(h * 0.34), w - 8, Math.round(h * 0.56), 12, P.woodLo, true)
  for (let i = 1; i < 3; i++)
    fillCircle(px, w, Math.round(w * i / 3), Math.round(h * 0.62), 2, ...P.metalHi)
}

function drawStove(px, w, h) {
  box(px, w, 1, 1, w - 2, h - 2, P.metal, P.metalHi, P.metalLo)
  for (const [cx, cy] of [[0.30, 0.32], [0.70, 0.32], [0.30, 0.68], [0.70, 0.68]]) {
    fillCircle(px, w, Math.round(w * cx), Math.round(h * cy), Math.round(w * 0.13), ...P.darkLo)
    fillCircle(px, w, Math.round(w * cx), Math.round(h * cy), Math.round(w * 0.08), ...P.dark)
  }
}

function drawSink(px, w, h) {
  box(px, w, 1, 1, w - 2, h - 2, P.metal, P.metalHi, P.metalLo)
  box(px, w, 6, 8, w - 12, h - 16, P.metalLo, null, null)
  box(px, w, 9, 11, w - 18, h - 22, P.dark, null, null)
  fillRect(px, w, Math.round(w / 2) - 1, 3, Math.round(w / 2) + 1, 9, ...P.metalHi)
}

function drawFridge(px, w, h) {
  box(px, w, 2, 1, w - 4, h - 2, P.white, null, P.metal)
  fillRect(px, w, 2, Math.round(h * 0.42), w - 3, Math.round(h * 0.44), ...P.metal)
  fillRect(px, w, w - 10, Math.round(h * 0.18), w - 8, Math.round(h * 0.34), ...P.metalLo)
  fillRect(px, w, w - 10, Math.round(h * 0.56), w - 8, Math.round(h * 0.72), ...P.metalLo)
}

function drawBookshelf(px, w, h) {
  box(px, w, 1, 1, w - 2, h - 2, P.woodLo, P.wood, null)
  const shelves = 3
  for (let s = 0; s < shelves; s++) {
    const y = 4 + Math.round((h - 8) * s / shelves)
    const sh = Math.round((h - 8) / shelves) - 4
    box(px, w, 4, y, w - 8, sh, P.darkLo, null, null)
    let x = 6
    const cols = [P.warm, P.leaf, P.glass, P.accent, P.cloth]
    while (x < w - 9) {
      const bw = 3 + ((x + s) % 3)
      box(px, w, x, y + 2, bw, sh - 4, cols[(x + s) % cols.length], null, null)
      x += bw + 1
    }
  }
}

function drawPainting(px, w, h) {
  box(px, w, 1, 1, w - 2, h - 2, P.accent, null, P.woodLo)
  box(px, w, 5, 5, w - 10, h - 10, P.glass, null, null)
  fillCircle(px, w, Math.round(w * 0.35), Math.round(h * 0.38), Math.round(w * 0.10), ...P.white)
  for (let x = 6; x < w - 6; x++) {
    const y = Math.round(h * 0.68 + Math.sin(x / 5) * h * 0.06)
    fillRect(px, w, x, y, x, h - 6, ...P.leaf)
  }
}

function drawPlant(px, w, h) {
  box(px, w, Math.round(w * 0.28), Math.round(h * 0.62), Math.round(w * 0.44), Math.round(h * 0.34),
      P.warm, P.warmHi, P.warmLo)
  for (const [dx, dy, r] of [[0.5, 0.36, 0.26], [0.32, 0.46, 0.18], [0.68, 0.46, 0.18], [0.5, 0.20, 0.16]])
    fillCircle(px, w, Math.round(w * dx), Math.round(h * dy), Math.round(w * r), ...P.leaf)
  fillCircle(px, w, Math.round(w * 0.44), Math.round(h * 0.30), Math.round(w * 0.12), ...P.leafHi)
}

function drawCrate(px, w, h) {
  box(px, w, 1, 1, w - 2, h - 2, P.wood, P.woodHi, P.woodLo)
  ribs(px, w, 2, 2, w - 4, h - 4, Math.round(h / 3), P.woodLo)
  fillRect(px, w, 2, 2, 4, h - 3, ...P.woodLo)
  fillRect(px, w, w - 5, 2, w - 3, h - 3, ...P.woodLo)
}

function drawPallet(px, w, h) {
  box(px, w, 0, Math.round(h * 0.20), w, Math.round(h * 0.60), P.woodLo, null, null)
  ribs(px, w, 0, Math.round(h * 0.20), w, Math.round(h * 0.60), 7, P.wood, true)
  fillRect(px, w, 0, Math.round(h * 0.20), w - 1, Math.round(h * 0.28), ...P.woodHi)
}

// ── Outdoors ────────────────────────────────────────────────────────────────

function drawTree(px, w, h) {
  fillRect(px, w, Math.round(w / 2) - 3, Math.round(h * 0.62), Math.round(w / 2) + 3, h - 2, ...P.woodLo)
  for (const [dx, dy, r] of [[0.5, 0.36, 0.34], [0.30, 0.46, 0.22], [0.70, 0.46, 0.22]])
    fillCircle(px, w, Math.round(w * dx), Math.round(h * dy), Math.round(w * r), ...P.leafLo)
  fillCircle(px, w, Math.round(w * 0.46), Math.round(h * 0.34), Math.round(w * 0.27), ...P.leaf)
  fillCircle(px, w, Math.round(w * 0.40), Math.round(h * 0.28), Math.round(w * 0.14), ...P.leafHi)
}

function drawBush(px, w, h) {
  for (const [dx, dy, r] of [[0.30, 0.60, 0.28], [0.70, 0.60, 0.28], [0.50, 0.44, 0.32]])
    fillCircle(px, w, Math.round(w * dx), Math.round(h * dy), Math.round(w * r), ...P.leafLo)
  fillCircle(px, w, Math.round(w * 0.44), Math.round(h * 0.44), Math.round(w * 0.20), ...P.leaf)
  fillCircle(px, w, Math.round(w * 0.38), Math.round(h * 0.38), Math.round(w * 0.10), ...P.leafHi)
}

function drawHedge(px, w, h) {
  box(px, w, 0, Math.round(h * 0.18), w, Math.round(h * 0.74), P.leafLo, P.leaf, null)
  for (let x = 3; x < w - 2; x += 7)
    fillCircle(px, w, x, Math.round(h * 0.30), 3, ...P.leaf)
}

function drawBench(px, w, h) {
  box(px, w, 0, Math.round(h * 0.10), w, Math.round(h * 0.34), P.wood, P.woodHi, P.woodLo)
  box(px, w, 0, Math.round(h * 0.52), w, Math.round(h * 0.30), P.wood, P.woodHi, P.woodLo)
  fillRect(px, w, 2, Math.round(h * 0.44), 6, h - 2, ...P.metalLo)
  fillRect(px, w, w - 7, Math.round(h * 0.44), w - 3, h - 2, ...P.metalLo)
}

function drawStreetBin(px, w, h) {
  box(px, w, Math.round(w * 0.16), Math.round(h * 0.22), Math.round(w * 0.68), Math.round(h * 0.72),
      P.dark, P.darkHi, P.darkLo)
  ribs(px, w, Math.round(w * 0.20), Math.round(h * 0.30), Math.round(w * 0.60), Math.round(h * 0.56), 6, P.darkLo)
  box(px, w, Math.round(w * 0.10), Math.round(h * 0.10), Math.round(w * 0.80), Math.round(h * 0.16),
      P.metalLo, P.metal, null)
}

function drawPostbox(px, w, h) {
  box(px, w, Math.round(w * 0.42), Math.round(h * 0.46), Math.round(w * 0.16), Math.round(h * 0.52),
      P.metalLo, null, null)
  box(px, w, Math.round(w * 0.12), Math.round(h * 0.08), Math.round(w * 0.76), Math.round(h * 0.42),
      P.warm, P.warmHi, P.warmLo)
  fillRect(px, w, Math.round(w * 0.24), Math.round(h * 0.24), Math.round(w * 0.76), Math.round(h * 0.28), ...P.darkLo)
}

function drawLamppost(px, w, h) {
  fillRect(px, w, Math.round(w / 2) - 2, Math.round(h * 0.18), Math.round(w / 2) + 2, h - 2, ...P.metalLo)
  fillRect(px, w, Math.round(w / 2) - 5, h - 4, Math.round(w / 2) + 5, h - 2, ...P.dark)
  box(px, w, Math.round(w * 0.18), 2, Math.round(w * 0.64), Math.round(h * 0.18), P.metal, P.metalHi, null)
  fillCircle(px, w, Math.round(w / 2), Math.round(h * 0.12), Math.round(w * 0.18), ...P.accent)
}

function drawHydrant(px, w, h) {
  box(px, w, Math.round(w * 0.30), Math.round(h * 0.26), Math.round(w * 0.40), Math.round(h * 0.62),
      P.warm, P.warmHi, P.warmLo)
  fillCircle(px, w, Math.round(w / 2), Math.round(h * 0.24), Math.round(w * 0.22), ...P.warmHi)
  fillRect(px, w, Math.round(w * 0.14), Math.round(h * 0.44), Math.round(w * 0.86), Math.round(h * 0.52), ...P.warmLo)
  fillRect(px, w, Math.round(w * 0.20), h - 5, Math.round(w * 0.80), h - 2, ...P.dark)
}

function drawBarrier(px, w, h) {
  box(px, w, 0, Math.round(h * 0.24), w, Math.round(h * 0.34), P.white, null, P.metal)
  for (let x = 0; x < w; x += 10)
    fillRect(px, w, x, Math.round(h * 0.24), x + 4, Math.round(h * 0.58), ...P.warm)
  fillRect(px, w, 3, Math.round(h * 0.58), 7, h - 2, ...P.metalLo)
  fillRect(px, w, w - 8, Math.round(h * 0.58), w - 4, h - 2, ...P.metalLo)
}

function drawBicycle(px, w, h) {
  const r = Math.round(h * 0.30)
  for (const cx of [Math.round(w * 0.24), Math.round(w * 0.76)]) {
    fillCircle(px, w, cx, Math.round(h * 0.62), r, ...P.dark)
    fillCircle(px, w, cx, Math.round(h * 0.62), r - 3, ...P.metalLo)
    fillCircle(px, w, cx, Math.round(h * 0.62), 2, ...P.metalHi)
  }
  drawLine(px, w, Math.round(w * 0.24), Math.round(h * 0.62), Math.round(w * 0.52), Math.round(h * 0.34), ...P.glass, 3)
  drawLine(px, w, Math.round(w * 0.52), Math.round(h * 0.34), Math.round(w * 0.76), Math.round(h * 0.62), ...P.glass, 3)
  drawLine(px, w, Math.round(w * 0.34), Math.round(h * 0.30), Math.round(w * 0.58), Math.round(h * 0.30), ...P.glass, 2)
}

function drawCar(px, w, h) {
  box(px, w, Math.round(w * 0.10), 2, Math.round(w * 0.80), h - 4, P.warm, P.warmHi, P.warmLo)
  box(px, w, Math.round(w * 0.18), Math.round(h * 0.16), Math.round(w * 0.64), Math.round(h * 0.22), P.glass, null, null)
  box(px, w, Math.round(w * 0.18), Math.round(h * 0.64), Math.round(w * 0.64), Math.round(h * 0.20), P.glass, null, null)
  for (const y of [Math.round(h * 0.20), Math.round(h * 0.70)]) {
    fillRect(px, w, Math.round(w * 0.02), y, Math.round(w * 0.12), y + Math.round(h * 0.12), ...P.dark)
    fillRect(px, w, Math.round(w * 0.88), y, Math.round(w * 0.98), y + Math.round(h * 0.12), ...P.dark)
  }
}

function drawVending(px, w, h) {
  box(px, w, 1, 1, w - 2, h - 2, P.metalLo, P.metal, P.darkLo)
  box(px, w, 5, 5, Math.round(w * 0.60), h - 12, P.dark, null, null)
  const cols = [P.warm, P.leaf, P.glass, P.accent]
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      box(px, w, 7 + c * 6, 8 + r * Math.round((h - 18) / 3), 4, 5, cols[(r + c) % 4], null, null)
  box(px, w, Math.round(w * 0.70), 8, Math.round(w * 0.22), Math.round(h * 0.30), P.glass, null, null)
}

function drawShopShelf(px, w, h) {
  box(px, w, 0, Math.round(h * 0.10), w, Math.round(h * 0.82), P.metalLo, P.metal, P.darkLo)
  for (let r = 0; r < 2; r++) {
    const y = Math.round(h * 0.18) + r * Math.round(h * 0.34)
    fillRect(px, w, 2, y + Math.round(h * 0.24), w - 3, y + Math.round(h * 0.28), ...P.metalHi)
    const cols = [P.warm, P.leaf, P.accent, P.glass, P.cloth]
    for (let c = 0; c * 9 + 4 < w - 6; c++)
      box(px, w, 4 + c * 9, y, 7, Math.round(h * 0.22), cols[(c + r) % cols.length], null, null)
  }
}

// ── Floors ──────────────────────────────────────────────────────────────────
// Tiled edge to edge, so they must look right against a copy of themselves:
// the seam is drawn on two sides only, never four.

// Floor variants. One tile repeated across a whole room reads as wallpaper, so
// each material gets three, and the tile map picks between them per cell. The
// variation is in the grain, never in the base colour — a floor that changes
// shade looks like a rendering fault, not like a floor.
function woodVariant(seed) {
  return (px, w, h) => {
    box(px, w, 0, 0, w, h, P.fWood, null, null)
    const plank = Math.round(h / 3)
    ribs(px, w, 0, 0, w, h, plank, P.fWoodLo)
    // Staggered end-joints, moved by the seed so neighbours do not line up.
    for (let i = 0; i < 3; i++) {
      const x = Math.round(w * (0.2 + ((i * 7 + seed * 3) % 10) / 14))
      const y = i * plank
      fillRect(px, w, x, y + 1, x, y + plank - 1, ...P.fWoodLo)
    }
    // A few grain streaks.
    for (let i = 0; i < 4; i++) {
      const x = ((i * 13 + seed * 5) % (w - 8)) + 4
      const y = ((i * 9 + seed * 7) % h)
      fillRect(px, w, x, y, x + 3, y, ...P.fWoodHi)
    }
  }
}

function concreteVariant(seed) {
  return (px, w, h) => {
    box(px, w, 0, 0, w, h, P.metalLo, null, null)
    fillRect(px, w, 0, 0, w - 1, 0, ...P.metal)
    fillRect(px, w, 0, 0, 0, h - 1, ...P.metal)
    for (let i = 0; i < 7; i++) {
      const x = ((i * 29 + seed * 11) % (w - 4)) + 2
      const y = ((i * 19 + seed * 7) % (h - 4)) + 2
      fillRect(px, w, x, y, x + (i % 2), y, ...P.darkLo)
    }
    if (seed === 2) drawLine(px, w, 4, h - 8, w - 6, h - 12, ...P.metal, 1)
  }
}

function asphaltVariant(seed) {
  return (px, w, h) => {
    box(px, w, 0, 0, w, h, P.dark, null, null)
    fillRect(px, w, 0, 0, w - 1, 0, ...P.darkHi)
    for (let i = 0; i < 10; i++) {
      const x = ((i * 23 + seed * 13) % (w - 2)) + 1
      const y = ((i * 31 + seed * 5) % (h - 2)) + 1
      fillRect(px, w, x, y, x, y, ...(i % 3 ? P.darkHi : P.metalLo))
    }
  }
}

// ── Walls ───────────────────────────────────────────────────────────────────
// Painted flat until now, in a colour picked by hand per location — which is
// exactly why they never matched the floor. Same palette, same light: a body,
// a lit top edge, a shadow where they meet the floor.
function wallTile(px, w, h) {
  box(px, w, 0, 0, w, h, P.darkHi, null, null)
  fillRect(px, w, 0, 0, w - 1, Math.max(1, Math.round(h * 0.14)), ...P.metalLo)
  fillRect(px, w, 0, h - Math.max(1, Math.round(h * 0.18)), w - 1, h - 1, ...P.darkLo)
  // Brick courses, offset row to row.
  const course = Math.max(4, Math.round(h / 4))
  for (let y = course; y < h - 2; y += course) {
    fillRect(px, w, 0, y, w - 1, y, ...P.dark)
    for (let x = ((y / course) % 2) * Math.round(w / 4); x < w; x += Math.round(w / 2))
      fillRect(px, w, x, y, x, Math.min(h - 1, y + course - 1), ...P.dark)
  }
}

// A doorway: the floor shows through, with a threshold and a lit frame either
// side so the opening reads as a way through rather than as a hole.
function doorTile(px, w, h) {
  box(px, w, 0, 0, w, h, P.woodLo, null, null)
  fillRect(px, w, 0, 0, w - 1, Math.max(1, Math.round(h * 0.12)), ...P.wood)
  fillRect(px, w, 0, h - Math.max(1, Math.round(h * 0.12)), w - 1, h - 1, ...P.darkLo)
  const frame = Math.max(2, Math.round(w * 0.08))
  fillRect(px, w, 0, 0, frame, h - 1, ...P.metalLo)
  fillRect(px, w, w - 1 - frame, 0, w - 1, h - 1, ...P.metalLo)
}

function drawFloorWood(px, w, h) {
  box(px, w, 0, 0, w, h, P.wood, null, null)
  ribs(px, w, 0, 0, w, h, Math.round(h / 3), P.woodLo)
  for (let y = 0; y < h; y += Math.round(h / 3))
    fillRect(px, w, Math.round(w * ((y / h) % 1 < 0.34 ? 0.55 : 0.25)), y,
             Math.round(w * ((y / h) % 1 < 0.34 ? 0.56 : 0.26)), y + Math.round(h / 3) - 1, ...P.woodLo)
}

function drawFloorConcrete(px, w, h) {
  box(px, w, 0, 0, w, h, P.metalLo, null, null)
  fillRect(px, w, 0, 0, w - 1, 0, ...P.metal)
  fillRect(px, w, 0, 0, 0, h - 1, ...P.metal)
  for (let i = 0; i < 5; i++) {
    const x = (i * 37) % (w - 4) + 2
    const y = (i * 23) % (h - 4) + 2
    fillRect(px, w, x, y, x + 1, y, ...P.darkLo)
  }
}

function drawAsphalt(px, w, h) {
  box(px, w, 0, 0, w, h, P.dark, null, null)
  fillRect(px, w, 0, 0, w - 1, 0, ...P.darkHi)
  for (let i = 0; i < 7; i++) {
    const x = (i * 29) % (w - 2) + 1
    const y = (i * 17) % (h - 2) + 1
    fillRect(px, w, x, y, x, y, ...P.darkHi)
  }
}

// ── The four objects you walk up to (V4) ────────────────────────────────────
// Desk, rack, board and bin had no sprite at all — they were the fallback
// rectangle the loader draws when a PNG is missing. They are also the four
// things the game asks the player to walk over to, which made them the worst
// possible place for a stand-in rectangle.

function drawDesk2(px, w, h) {
  box(px, w, 2, Math.round(h * 0.22), w - 4, Math.round(h * 0.60), P.wood, P.woodHi, P.woodLo)
  ribs(px, w, 3, Math.round(h * 0.24), w - 6, Math.round(h * 0.56), 10, P.woodLo, true)
  fillRect(px, w, 6, Math.round(h * 0.82), 12, h - 3, ...P.woodLo)
  fillRect(px, w, w - 13, Math.round(h * 0.82), w - 7, h - 3, ...P.woodLo)
  // Laptop: screen up, keyboard flat, lit from the top-left like everything else.
  box(px, w, Math.round(w * 0.30), 3, Math.round(w * 0.30), Math.round(h * 0.24), P.dark, P.darkHi, null)
  box(px, w, Math.round(w * 0.32), 5, Math.round(w * 0.26), Math.round(h * 0.18), P.glass, null, null)
  box(px, w, Math.round(w * 0.27), Math.round(h * 0.26), Math.round(w * 0.36), Math.round(h * 0.06), P.metalLo, P.metal, null)
  fillCircle(px, w, Math.round(w * 0.80), Math.round(h * 0.36), 4, ...P.warm)
}

function drawRack2(px, w, h) {
  box(px, w, 1, 1, w - 2, h - 2, P.metalLo, P.metal, P.darkLo)
  for (let s = 0; s < 3; s++) {
    const y = 5 + Math.round((h - 10) * s / 3)
    const sh = Math.round((h - 10) / 3) - 4
    box(px, w, 4, y, w - 8, sh, P.darkLo, null, null)
    fillRect(px, w, 4, y + sh, w - 5, y + sh + 1, ...P.metalHi)
  }
  fillCircle(px, w, Math.round(w * 0.35), Math.round(h * 0.20), 4, ...P.metalHi)
  fillCircle(px, w, Math.round(w * 0.35), Math.round(h * 0.20), 2, ...P.darkLo)
  box(px, w, Math.round(w * 0.20), Math.round(h * 0.48), Math.round(w * 0.24), Math.round(h * 0.12), P.accent, null, null)
  box(px, w, Math.round(w * 0.52), Math.round(h * 0.48), Math.round(w * 0.24), Math.round(h * 0.12), P.leaf, null, null)
  box(px, w, Math.round(w * 0.28), Math.round(h * 0.76), Math.round(w * 0.40), Math.round(h * 0.12), P.warm, null, null)
}

function drawJobboard2(px, w, h) {
  box(px, w, 1, 1, w - 2, h - 2, P.woodLo, P.wood, null)
  box(px, w, 5, 5, w - 10, h - 10, P.wood, null, P.woodLo)
  const notes = [[8, 9, 0.42, 0.34], [Math.round(w * 0.52), 12, 0.38, 0.30],
                 [9, Math.round(h * 0.52), 0.40, 0.34], [Math.round(w * 0.50), Math.round(h * 0.58), 0.38, 0.30]]
  for (const [x, y, fw, fh] of notes) {
    const nw = Math.round(w * fw), nh = Math.round(h * fh)
    box(px, w, x, y, nw, nh, P.white, null, P.metal)
    for (let ly = y + 3; ly < y + nh - 2; ly += 4)
      fillRect(px, w, x + 2, ly, x + nw - 3, ly, ...P.metalLo)
    fillCircle(px, w, x + Math.round(nw / 2), y + 1, 1, ...P.warm)
  }
}

function drawTrashbin2(px, w, h) {
  box(px, w, Math.round(w * 0.14), Math.round(h * 0.22), Math.round(w * 0.72), Math.round(h * 0.72),
      P.leafLo, P.leaf, P.darkLo)
  ribs(px, w, Math.round(w * 0.18), Math.round(h * 0.30), Math.round(w * 0.64), Math.round(h * 0.56), 7, P.darkLo)
  box(px, w, Math.round(w * 0.08), Math.round(h * 0.08), Math.round(w * 0.84), Math.round(h * 0.16),
      P.leaf, P.leafHi, null)
  fillRect(px, w, Math.round(w * 0.44), 2, Math.round(w * 0.68), Math.round(h * 0.10), ...P.metalHi)
}

// ── Іконки комплектів (Стадія 13 / А3) ──────────────────────────────────────
//
// На плашці доставки стояло `${kit.emoji} ${час}` — тобто «який дрон їде»
// казав гліф ОС. Тепер це намальована іконка.
//
// Іконка НЕ є зменшеним повним спрайтом: 96×52 стиснуті до третини дають
// брудний піксель (диски пропелерів зливаються в одну пляму), а масштабування
// піксель-арту в рантаймі — те саме, тільки ще й щокадру. Тому іконка — своя
// фігура з тими самими прикметами, за якими дрон упізнають: чотири диски,
// корпус, колір і одна деталь, що відрізняє тип.
function drawKitIcon({ frame, body, bodyHi, accent, mark, bw, bh }) {
  return (px, w, h) => {
    const cx = w >> 1, cy = h >> 1
    const mx = 4, my = 4
    const motors = [[mx, my], [w - 1 - mx, my], [mx, h - 1 - my], [w - 1 - mx, h - 1 - my]]

    for (const [x, y] of motors) fillCircle(px, w, x, y, 4, ...frame, 70)
    if (mark === 'gps') {
      // H-рама: одна горизонтальна балка замість Х — саме нею далекобійний
      // відрізняється від решти навіть у силуеті.
      fillRect(px, w, mx, cy - 1, w - 1 - mx, cy + 1, ...frame)
      for (const [x, y] of motors) drawLine(px, w, x, cy, x, y, ...frame, 2)
    } else {
      for (const [x, y] of motors) drawLine(px, w, cx, cy, x, y, ...frame, 2)
    }
    for (const [x, y] of motors) fillCircle(px, w, x, y, 2, ...frame)

    // Корпус — головна різниця силуетів: гоночний вузький, кінематографічний
    // важкий. Колір лишає їх різними навіть коли розмір ще не читається.
    box(px, w, cx - (bw >> 1), cy - (bh >> 1), bw, bh, body, bodyHi, P.darkLo)
    if (mark === 'cam')    fillCircle(px, w, cx + (bw >> 1), cy, 2, ...accent)
    if (mark === 'gimbal') fillCircle(px, w, cx, cy + (bh >> 1) + 1, 3, ...accent)
    if (mark === 'gps')    fillCircle(px, w, cx, 2, 2, ...accent)
    if (mark === 'led')    fillCircle(px, w, cx, cy, 2, ...accent)
  }
}

const KIT_ICONS = {
  mini_drone: {
    frame: [...PRODUCT.mini.mid], body: [...PRODUCT.mini.body], bodyHi: [...PRODUCT.mini.lo],
    accent: [...PRODUCT.mini.led], mark: 'led', bw: 11, bh: 7,
  },
  racing_drone: {
    frame: [...PRODUCT.racing.mid], body: [...PRODUCT.racing.body], bodyHi: [...PRODUCT.racing.lo],
    accent: [...PRODUCT.racing.led], mark: 'cam', bw: 9, bh: 5,
  },
  cinematic_drone: {
    frame: [...PRODUCT.cinematic.hi], body: [...PRODUCT.cinematic.lo], bodyHi: [...PRODUCT.cinematic.mid],
    accent: [...PRODUCT.cinematic.lens], mark: 'gimbal', bw: 17, bh: 9,
  },
  longrange_drone: {
    frame: [...PRODUCT.longrange.hi], body: [...PRODUCT.longrange.body], bodyHi: [...PRODUCT.longrange.hi],
    accent: [...PRODUCT.longrange.gpsHi], mark: 'gps', bw: 13, bh: 7,
  },
  fixedwing_drone: {
    frame: [...PRODUCT.fixedwing.mid], body: [...PRODUCT.fixedwing.body], bodyHi: [...PRODUCT.fixedwing.hi],
    accent: [...PRODUCT.fixedwing.led], mark: 'led', bw: 19, bh: 7,
  },
  heavy_drone: {
    frame: [...PRODUCT.heavy.mid], body: [...PRODUCT.heavy.body], bodyHi: [...PRODUCT.heavy.hi],
    accent: [...PRODUCT.heavy.led], mark: 'led', bw: 15, bh: 9,
  },
  proto_drone: {
    frame: [...PRODUCT.proto.mid], body: [...PRODUCT.proto.body], bodyHi: [...PRODUCT.proto.hi],
    accent: [...PRODUCT.proto.led], mark: 'cam', bw: 11, bh: 7,
  },
}

// ── Стани верстака (Стадія 13 / А4) ─────────────────────────────────────────
//
// «🔥 Перегрів» і «✓ Зібрано» — два найважливіші повідомлення сцени: одне каже,
// що комплект щойно згорів, друге — що дрон готовий. Обидва починались гліфом
// ОС, тобто саме та частина, яку око ловить першою, малювалась не нами.
//
// Текст поруч лишається текстом (А4): прибираємо картинки-гліфи, а не написи.
const ACCENT_HOT  = ACCENT.hot    // asset_specs.md: помаранчевий акцент
const ACCENT_GOOD = ACCENT.good   // той самий зелений, що в крапках кроків

// Іскра: чотири промені й ядро. Читається як «щось спалахнуло» і на 19 px, і
// в кутку картки, де на неї ніхто не дивиться прямо.
function drawStateOverheat(px, w, h) {
  const cx = w >> 1, cy = h >> 1
  const r  = Math.min(cx, cy) - 1
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]])
    drawLine(px, w, cx, cy, cx + dx * r, cy + dy * r, ...ACCENT_HOT, 3)
  const d = Math.round(r * 0.62)
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    drawLine(px, w, cx, cy, cx + dx * d, cy + dy * d, ...ACCENT_HOT, 2)
  fillCircle(px, w, cx, cy, Math.max(2, Math.round(r * 0.42)), ...ACCENT_HOT)
  fillCircle(px, w, cx, cy, Math.max(1, Math.round(r * 0.20)), ...P.white)
}

// Галочка: дві лінії, коротка вниз і довга вгору.
function drawStateDone(px, w, h) {
  const t = Math.max(2, Math.round(h * 0.18))
  drawLine(px, w, Math.round(w * 0.18), Math.round(h * 0.52),
                  Math.round(w * 0.42), Math.round(h * 0.76), ...ACCENT_GOOD, t)
  drawLine(px, w, Math.round(w * 0.42), Math.round(h * 0.76),
                  Math.round(w * 0.84), Math.round(h * 0.22), ...ACCENT_GOOD, t)
}

// ── Цифри (Стадія 13 / А3) ──────────────────────────────────────────────────
//
// Зворотний відлік доставки — це ЧИСЛО на сцені, і воно малювалось шрифтом ОС
// разом з емодзі. Сімковий сегмент, а не мальована цифра: він читається на
// 17 px, він однаковий у будь-якій локалі, і його ширина фіксована — рядок
// «1:05» не смикається, коли одиниця змінюється на вісімку.
//
// Тінь на піксель нижче-праворуч: цифра має лишатись читаною і над світлою
// підлогою цеху, і над темним асфальтом.
const SEG = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
  5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
}

function digitStrokes(w, h, t) {
  const x0 = 0, x1 = w - 1, y0 = 0, y1 = h - 1, ym = (h - t) >> 1
  return {
    a: [x0, y0, x1, y0 + t - 1],
    b: [x1 - t + 1, y0, x1, ym + t - 1],
    c: [x1 - t + 1, ym, x1, y1],
    d: [x0, y1 - t + 1, x1, y1],
    e: [x0, ym, x0 + t - 1, y1],
    f: [x0, y0, x0 + t - 1, ym + t - 1],
    g: [x0, ym, x1, ym + t - 1],
  }
}

function drawDigit(n) {
  return (px, w, h) => {
    const t = Math.max(2, Math.round(h * 0.16))
    const strokes = digitStrokes(w - 1, h - 1, t)
    for (const pass of [[1, 1, P.darkLo], [0, 0, P.white]]) {
      const [dx, dy, col] = pass
      for (const key of SEG[n])
        fillRect(px, w, strokes[key][0] + dx, strokes[key][1] + dy,
                        strokes[key][2] + dx, strokes[key][3] + dy, ...col)
    }
  }
}

// Двокрапка тієї ж висоти — інакше «2:14» розпадається на три окремі речі.
function drawColon(px, w, h) {
  const t = Math.max(2, Math.round(h * 0.16))
  for (const [dx, dy, col] of [[1, 1, P.darkLo], [0, 0, P.white]])
    for (const y of [Math.round(h * 0.28), Math.round(h * 0.64)])
      fillRect(px, w, dx, y + dy, dx + t - 1, y + t - 1 + dy, ...col)
}

// ── Бейджі ролей (Стадія 13 / А2) ───────────────────────────────────────────
//
// Над головою в кожного робітника висів емодзі: 📦 🔧 💵 🧾. Він малювався
// шрифтом ОС — тобто на Android, iOS і в браузері це були три різні набори
// картинок, жодна з яких не мала стосунку до палітри гри, — і жив у піксельному
// розмірі шрифта, тобто ігнорував одиницю U, до якої Стадія 6 звела все інше.
//
// Тепер це спрайт: темний кружок, кільце в КОЛЬОРІ РОЛІ (той самий `ROLES.color`,
// що тінтує людину й малює кільце під її ногами) і світлий силует усередині.
// Значок має читатись у натовпі з шести робітників, але не бути більшим за
// голову — звідси u(0.34).

// Коробка — кур'єр.
function glyphBox(px, w, cx, cy, r, col) {
  const s = Math.round(r * 1.5)
  box(px, w, cx - (s >> 1), cy - (s >> 1), s, s, col, null, null)
  fillRect(px, w, cx - (s >> 1), cy - 1, cx + (s >> 1) - 1, cy, ...P.darkLo)
  fillRect(px, w, cx - 1, cy - (s >> 1), cx, cy + (s >> 1) - 1, ...P.darkLo)
}

// Ключ — технік. Голівка вгорі, ручка навскіс.
function glyphWrench(px, w, cx, cy, r, col) {
  drawLine(px, w, cx - r + 2, cy + r - 2, cx + r - 3, cy - r + 3, ...col, 3)
  fillCircle(px, w, cx + r - 3, cy - r + 3, 3, ...col)
  fillCircle(px, w, cx + r - 3, cy - r + 3, 1, ...P.darkLo)
}

// Купюра — продавець.
function glyphNote(px, w, cx, cy, r, col) {
  const bw = Math.round(r * 1.8), bh = Math.round(r * 1.1)
  box(px, w, cx - (bw >> 1), cy - (bh >> 1), bw, bh, col, null, null)
  fillCircle(px, w, cx, cy, Math.max(1, Math.round(bh * 0.28)), ...P.darkLo)
}

// Планшет із затискачем — менеджер.
function glyphClipboard(px, w, cx, cy, r, col) {
  const bw = Math.round(r * 1.3), bh = Math.round(r * 1.7)
  box(px, w, cx - (bw >> 1), cy - (bh >> 1) + 1, bw, bh - 1, col, null, null)
  fillRect(px, w, cx - 2, cy - (bh >> 1) - 1, cx + 1, cy - (bh >> 1) + 1, ...P.darkLo)
  for (let y = cy - (bh >> 1) + 4; y < cy + (bh >> 1) - 1; y += 3)
    fillRect(px, w, cx - (bw >> 1) + 2, y, cx + (bw >> 1) - 3, y, ...P.darkLo)
}

// Колба — інженер (Стадія 14 / К2). Вузьке горло й широка основа: на u(0.34)
// це єдина форма, яка не читається ні як коробка, ні як планшет.
function glyphFlask(px, w, cx, cy, r, col) {
  const top = cy - r, bot = cy + Math.round(r * 0.8)
  fillRect(px, w, cx - 1, top, cx + 1, top + Math.round(r * 0.6), ...col)
  for (let y = top + Math.round(r * 0.6); y <= bot; y++) {
    const t  = (y - top - r * 0.6) / Math.max(1, bot - top - r * 0.6)
    const hw = Math.max(1, Math.round(1 + t * (r - 1)))
    fillRect(px, w, cx - hw, y, cx + hw, y, ...col)
  }
  fillRect(px, w, cx - 3, top - 1, cx + 3, top - 1, ...col)
}

const ROLE_GLYPH = {
  courier:  glyphBox,
  tech:     glyphWrench,
  seller:   glyphNote,
  manager:  glyphClipboard,
  engineer: glyphFlask,
}

function drawBadge(roleId) {
  const ring  = hex(ROLES[roleId].color)
  const glyph = ROLE_GLYPH[roleId]
  return (px, w, h) => {
    const cx = w >> 1, cy = h >> 1
    const R  = Math.min(cx, cy) - 1
    fillCircle(px, w, cx, cy, R, ...ring)            // кільце — колір ролі
    fillCircle(px, w, cx, cy, R - 2, ...P.darkLo)    // темне поле під силует
    glyph(px, w, cx, cy, R - 4, P.white)
  }
}

const drawWorkerWalk = (pixels, w, h) => drawWalkCycle(pixels, w, h, WORKER_PALETTE)
const drawPlayerWalk = (pixels, w, h) => drawWalkCycle(pixels, w, h, PLAYER_PALETTE)

// ── Що саме генеруємо ───────────────────────────────────────────────────────

// Кожен спрайт оголошує розмір у СВІТОВИХ одиницях (А5.3). Піксельний виводить
// `finish()` — так спрайт фізично не може приїхати з чужою щільністю пікселя.
//
// Числа тут не «гарні»: u(1.5) — це рівно ті 96 px, у яких дрони й малювались.
// Перевід нічого не перемалював, він лише переклав розмір мовою, якою міряється
// решта світу.
const sprites = [
  // Дрони — u(1.5) × u(0.81), тобто 96×52 (пропорція ~1.85:1).
  { name: 'mini_drone',       wu: u(1.5),  hu: u(0.81), draw: drawMiniDrone       },
  { name: 'racing_drone',     wu: u(1.5),  hu: u(0.81), draw: drawRacingDrone     },
  { name: 'cinematic_drone',  wu: u(1.5),  hu: u(0.81), draw: drawCinematicDrone  },
  { name: 'longrange_drone',  wu: u(1.5),  hu: u(0.81), draw: drawLongrangeDrone  },
  { name: 'fixedwing_drone',  wu: u(1.5),  hu: u(0.81), draw: drawFixedWing       },
  { name: 'heavy_drone',      wu: u(1.5),  hu: u(0.81), draw: drawHeavyLifter     },
  { name: 'proto_drone',      wu: u(1.5),  hu: u(0.81), draw: drawPrototype       },
  { name: 'workbench',        wu: u(3.0),  hu: u(1.0),  draw: drawWorkbench       },
  { name: 'soldering_iron',   wu: u(1.0),  hu: u(0.25), draw: drawSolderingIron   },
  // Персонажі — чотири кадри ходьби в рядок, кожен на зріст персонажа.
  { name: 'worker_walk',      wu: u(4.0),  hu: u(1.0),  draw: drawWorkerWalk      },
  { name: 'player_walk',      wu: u(4.0),  hu: u(1.0),  draw: drawPlayerWalk      },
  { name: 'lamp',             wu: u(0.75), hu: u(0.75), draw: drawLamp            },
  { name: 'mailbox',          wu: u(1.0),  hu: u(0.81), draw: drawMailbox         },
  { name: 'piggy',            wu: u(1.0),  hu: u(1.0),  draw: drawPiggy           },
  // Стрілка цілі — дивиться вниз; сцена повертає її на ціль.

  // Сім кадрів: чотири ходьби, далі сидить, спить, вмивається (V5).

  // Перемальовані зі спільної палітри (V6): перший захід на ці чотири мав
  // власні кольори й вибивався з усього, намальованого пізніше.
  { name: 'desk',             wu: u(1.62), hu: u(1.0),  draw: drawDesk2           },
  { name: 'rack',             wu: u(0.88), hu: u(1.25), draw: drawRack2           },
  { name: 'jobboard',         wu: u(0.88), hu: u(1.0),  draw: drawJobboard2       },
  { name: 'trashbin',         wu: u(0.75), hu: u(0.9),  draw: drawTrashbin2       },
]

// Меблі, вулиця, підлоги й стіни (V6). Той самий список, та сама одиниця —
// `T` тут був локальною копією зросту персонажа, тепер це `u()` з гри.
const T = u(1)
sprites.push(
  { name: 'f_bed',       wu: T * 1.0, hu: T * 1.9, draw: drawBed },
  { name: 'f_sofa',      wu: T * 1.9, hu: T * 0.9, draw: drawSofa },
  { name: 'f_rug',       wu: T * 2.4, hu: T * 1.6, draw: drawRug },
  { name: 'f_table',     wu: T * 1.7, hu: T * 0.9, draw: drawTable },
  { name: 'f_chair',     wu: T * 0.7, hu: T * 0.8, draw: drawChair },
  { name: 'f_counter',   wu: T * 1.0, hu: T * 0.9, draw: drawCounter },
  { name: 'f_stove',     wu: T * 0.9, hu: T * 0.9, draw: drawStove },
  { name: 'f_sink',      wu: T * 0.9, hu: T * 0.9, draw: drawSink },
  { name: 'f_fridge',    wu: T * 0.8, hu: T * 1.2, draw: drawFridge },
  { name: 'f_bookshelf', wu: T * 1.0, hu: T * 1.3, draw: drawBookshelf },
  { name: 'f_painting',  wu: T * 0.9, hu: T * 0.7, draw: drawPainting },
  { name: 'f_plant',     wu: T * 0.7, hu: T * 0.9, draw: drawPlant },
  { name: 'f_crate',     wu: T * 0.8, hu: T * 0.8, draw: drawCrate },
  { name: 'f_pallet',    wu: T * 1.0, hu: T * 0.7, draw: drawPallet },

  { name: 'o_tree',      wu: T * 1.2, hu: T * 1.4, draw: drawTree },
  { name: 'o_bush',      wu: T * 0.9, hu: T * 0.8, draw: drawBush },
  { name: 'o_hedge',     wu: T * 1.4, hu: T * 0.6, draw: drawHedge },
  { name: 'o_bench',     wu: T * 1.2, hu: T * 0.7, draw: drawBench },
  { name: 'o_bin',       wu: T * 0.7, hu: T * 0.9, draw: drawStreetBin },
  { name: 'o_postbox',   wu: T * 0.7, hu: T * 1.0, draw: drawPostbox },
  { name: 'o_lamppost',  wu: T * 0.6, hu: T * 1.5, draw: drawLamppost },
  { name: 'o_hydrant',   wu: T * 0.5, hu: T * 0.7, draw: drawHydrant },
  { name: 'o_barrier',   wu: T * 1.2, hu: T * 0.6, draw: drawBarrier },
  { name: 'o_bicycle',   wu: T * 1.0, hu: T * 0.7, draw: drawBicycle },
  { name: 'o_car',       wu: T * 1.0, hu: T * 1.8, draw: drawCar },
  { name: 'o_vending',   wu: T * 0.8, hu: T * 1.1, draw: drawVending },
  { name: 'o_shelf',     wu: T * 1.6, hu: T * 1.0, draw: drawShopShelf },

  // Базові плитки без суфікса — запасний шлях `tileFloor`, коли варіантів
  // немає. Довго лежали в `public/sprites` як спадок від часів до варіантів і
  // НЕ малювались генератором узагалі: `npm run sprites` із чистої теки дав би
  // гру без запасної плитки, і ніхто б не помітив, поки не зникне якийсь із
  // варіантів. Знайдено тестом ідемпотентності на першому ж прогоні (А5.4).
  { name: 'tile_wood',       wu: T, hu: T, draw: woodVariant(0) },
  { name: 'tile_concrete',   wu: T, hu: T, draw: concreteVariant(0) },
  { name: 'tile_asphalt',    wu: T, hu: T, draw: asphaltVariant(0) },

  { name: 'tile_wood_0',     wu: T, hu: T, draw: woodVariant(0) },
  { name: 'tile_wood_1',     wu: T, hu: T, draw: woodVariant(1) },
  { name: 'tile_wood_2',     wu: T, hu: T, draw: woodVariant(2) },
  { name: 'tile_concrete_0', wu: T, hu: T, draw: concreteVariant(0) },
  { name: 'tile_concrete_1', wu: T, hu: T, draw: concreteVariant(1) },
  { name: 'tile_concrete_2', wu: T, hu: T, draw: concreteVariant(2) },
  { name: 'tile_asphalt_0',  wu: T, hu: T, draw: asphaltVariant(0) },
  { name: 'tile_asphalt_1',  wu: T, hu: T, draw: asphaltVariant(1) },
  { name: 'tile_asphalt_2',  wu: T, hu: T, draw: asphaltVariant(2) },

  { name: 'wall_tile', wu: T, hu: T, draw: wallTile },
  { name: 'door_tile', wu: T, hu: T, draw: doorTile },

  // Бейджі ролей (Стадія 13 / А2). Розмір — u(0.34): третина зросту персонажа.
  ...ROLE_ORDER.map(id => ({
    name: `badge_${id}`, wu: u(0.34), hu: u(0.34), draw: drawBadge(id),
  })),

  // Іконки комплектів (А3). План називав u(0.4); на такій ширині чотири диски
  // пропелерів зливались в одну пляму, тож іконка ширша й тримає пропорцію
  // повного спрайта дрона (96:52), а не квадрат.
  ...Object.entries(KIT_ICONS).map(([id, cfg]) => ({
    name: `icon_${id}`, wu: u(0.62), hu: u(0.34), draw: drawKitIcon(cfg),
  })),

  // Цифри для чисел на сцені (А3).
  ...Array.from({ length: 10 }, (_, n) => ({
    name: `digit_${n}`, wu: u(0.14), hu: u(0.24), draw: drawDigit(n),
  })),
  { name: 'digit_colon', wu: u(0.07), hu: u(0.24), draw: drawColon },

  // Стани верстака (А4).
  { name: 'state_overheat', wu: u(0.30), hu: u(0.30), draw: drawStateOverheat },
  { name: 'state_done',     wu: u(0.30), hu: u(0.30), draw: drawStateDone },
)

// ── Хвіст (Стадія 13 / А6) ──────────────────────────────────────────────────
//
// Правило: ДЖЕРЕЛО ПІКСЕЛІВ ЗМІННЕ, ПОСТПРОЦЕС — НІ.
//
// Кожен спрайт без винятку виходить у світ через `finish()`: розмір у `u()` →
// пікселі, малювання, постобробка, запис PNG. Якщо колись з'явиться згенерована
// заготовка (нейромережею чи звідки завгодно), вона зайде в цей самий хвіст і
// вийде в тому ж стилі — саме заради цього хвіст один.
//
// Стадія 15 закрила останній умовний крок: `quantize` тепер безумовний — і
// робить справжню роботу навіть після того, як усі літерали названі: змішані
// з альфою пікселі на межах фігур інакше лишаються поза набором.
//
// Умовним лишається тільки `trim`, і назавжди: половина спрайтів має якорі в
// `manifest.js`, відраховані від центру повного полотна, і зсув країв тихо
// зрушив би точки пайки на дроні. Для завезеної заготовки, у якої якорів
// немає, він навпаки обов'язковий.

const OUT_DIR = process.argv[2] ?? 'public/sprites'

// Найближчий колір палітри — за квадратом відстані в RGB. Достатньо: палітра
// мала й розведена, а «правильна» відстань у Lab тут не змінила б жодного
// пікселя.
//
// Стадія 15 / П2: квантизація стала БЕЗУМОВНОЮ, і вона не декоративна.
//
// Здавалось, що після П1 вона буде no-op: жодна draw-функція більше не має
// сирого кольору, усе приходить із `palette.js`. Вимірка показала інше —
// вимкнути її означає змінити чотири спрайти (`piggy`, `mailbox`,
// `player_walk`, `worker_walk`).
//
// Причина — АЛЬФА. `setPixel` змішує з тим, що вже лежить під ним, і піксель
// на межі двох фігур виходить проміжним: його немає в палітрі, хоча обидва
// вихідні кольори там є. Тобто дисципліна в літералах принципово не здатна
// втримати набір — тримає його саме цей крок.
const PALETTE_LIST = fullPalette(roleColors(ROLES))

export function quantize(px) {
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue
    let best = null, bestD = Infinity
    for (const c of PALETTE_LIST) {
      const dr = px[i] - c[0], dg = px[i + 1] - c[1], db = px[i + 2] - c[2]
      const d = dr * dr + dg * dg + db * db
      if (d < bestD) { bestD = d; best = c }
    }
    px[i] = best[0]; px[i + 1] = best[1]; px[i + 2] = best[2]
  }
}

export function trim(px, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[(y * w + x) * 4 + 3] === 0) continue
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  if (x1 < 0) return { px, w, h }
  const nw = x1 - x0 + 1, nh = y1 - y0 + 1
  const out = new Uint8Array(nw * nh * 4)
  for (let y = 0; y < nh; y++)
    for (let x = 0; x < nw; x++)
      for (let c = 0; c < 4; c++)
        out[(y * nw + x) * 4 + c] = px[((y + y0) * w + (x + x0)) * 4 + c]
  return { px: out, w: nw, h: nh }
}

export function finish({ name, wu, hu, draw, source = 'drawn' }, outDir = OUT_DIR) {
  let w = Math.round(wu / UNITS_PER_PX)
  let h = Math.round(hu / UNITS_PER_PX)
  let px = new Uint8Array(w * h * 4)
  draw(px, w, h)

  // Квантизація — завжди (П2). Обрізання — тільки для завезеного: половина
  // спрайтів має якорі в `manifest.js`, відраховані від центру повного
  // полотна, і зсув країв тихо зрушив би точки пайки на дроні.
  quantize(px)
  if (source === 'imported') {
    const t = trim(px, w, h)
    px = t.px; w = t.w; h = t.h
  }

  const path = `${outDir}/${name}.png`
  writeFileSync(path, encodePng(w, h, px))
  return { path, w, h }
}

// Запуск як скрипт малює весь набір; імпорт — ні. Без цієї межі тест на
// постобробку (А6) перемальовував би `public/sprites` щоразу, коли його
// запускають.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync(OUT_DIR, { recursive: true })
  for (const spec of sprites) {
    const { path, w, h } = finish(spec)
    console.log(`✓ ${path}  (${w}×${h})`)
  }
}
