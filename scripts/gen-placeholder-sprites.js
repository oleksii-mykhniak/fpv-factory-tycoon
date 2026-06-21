// Generates procedural placeholder PNG sprites for each game object.
// Run: node scripts/gen-placeholder-sprites.js
// Replace with real art later — sizes and shapes tuned to scene.js layout.
import { writeFileSync, mkdirSync } from 'fs'
import { deflateSync } from 'zlib'

// ── PNG encoder (RGBA, color type 6) ─────────────────────────────────────────

function crc32(buf) {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[i] = c
  }
  let crc = 0xFFFFFFFF
  for (const b of buf) crc = t[(crc ^ b) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type, data) {
  const tb  = Buffer.from(type)
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const crcBuf  = Buffer.concat([tb, data])
  const crcBytes = Buffer.alloc(4); crcBytes.writeUInt32BE(crc32(crcBuf))
  return Buffer.concat([len, tb, data, crcBytes])
}

function makePng(w, h, drawFn) {
  const pixels = new Uint8Array(w * h * 4)
  drawFn(pixels, w, h)

  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6

  const rowBytes = 1 + w * 4
  const raw = Buffer.alloc(h * rowBytes)
  for (let y = 0; y < h; y++) {
    raw[y * rowBytes] = 0
    for (let x = 0; x < w; x++) {
      const pi = (y * w + x) * 4
      const ri = y * rowBytes + 1 + x * 4
      raw[ri]     = pixels[pi]
      raw[ri + 1] = pixels[pi + 1]
      raw[ri + 2] = pixels[pi + 2]
      raw[ri + 3] = pixels[pi + 3]
    }
  }

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

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
  fillCircle(pixels, w, mx, my, 2,   0xcc, 0xcc, 0xd8)  // shaft
}

// Mini drone — classic X-frame, blue-gray. 96×52.
function drawMiniDrone(pixels, w, h) {
  const cx = w >> 1, cy = h >> 1
  const motors = [[10, 10], [w - 11, 10], [10, h - 11], [w - 11, h - 11]]

  // Prop discs
  for (const [mx, my] of motors)
    fillCircle(pixels, w, mx, my, 9,  0x60, 0x70, 0xa0, 55)

  // Arms (X-frame)
  for (const [mx, my] of motors)
    drawLine(pixels, w, cx, cy, mx, my,  0x3a, 0x3a, 0x5e, 3)

  // Motors
  for (const [mx, my] of motors)
    droneMotor(pixels, w, mx, my, 7, 5,  0x5a, 0x5a, 0x90,  0x22, 0x22, 0x48)

  // Body
  fillRect(pixels, w, cx - 7, cy - 5, cx + 7, cy + 5,  0x18, 0x18, 0x2e)
  fillRect(pixels, w, cx - 5, cy - 3, cx + 5, cy + 3,  0x28, 0x28, 0x44)
  fillCircle(pixels, w, cx, cy, 2,  0x50, 0x90, 0xff)   // blue LED
}

// Racing drone — narrow cyan X, small motors, front camera. 96×52.
function drawRacingDrone(pixels, w, h) {
  const cx = w >> 1, cy = h >> 1
  const motors = [[8, 8], [w - 9, 8], [8, h - 9], [w - 9, h - 9]]

  // Prop discs (cyan tint)
  for (const [mx, my] of motors)
    fillCircle(pixels, w, mx, my, 8,  0x40, 0xb0, 0xd8, 55)

  // Arms
  for (const [mx, my] of motors)
    drawLine(pixels, w, cx, cy, mx, my,  0x30, 0x88, 0xb0, 2)

  // Motors
  for (const [mx, my] of motors)
    droneMotor(pixels, w, mx, my, 6, 4,  0x40, 0x98, 0xcc,  0x18, 0x58, 0x90)

  // Body (slim, aerodynamic)
  fillRect(pixels, w, cx - 5, cy - 3, cx + 5, cy + 3,  0x10, 0x20, 0x3a)
  fillRect(pixels, w, cx - 3, cy - 2, cx + 3, cy + 2,  0x20, 0x50, 0x78)

  // Front camera bump
  fillCircle(pixels, w, cx + 4, cy, 3,  0x18, 0x18, 0x28)
  fillCircle(pixels, w, cx + 4, cy, 2,  0x08, 0x30, 0x50)
  fillCircle(pixels, w, cx + 4, cy, 1,  0x80, 0xb0, 0xd0)  // lens glint

  fillCircle(pixels, w, cx, cy, 2,  0xff, 0x40, 0x40)   // red LED
}

// Cinematic drone — heavy X-frame with gimbal, dark gray. 96×52.
function drawCinematicDrone(pixels, w, h) {
  const cx = w >> 1, cy = h >> 1
  const motors = [[12, 10], [w - 13, 10], [12, h - 11], [w - 13, h - 11]]

  // Prop discs
  for (const [mx, my] of motors)
    fillCircle(pixels, w, mx, my, 9,  0x50, 0x50, 0x68, 50)

  // Arms
  for (const [mx, my] of motors)
    drawLine(pixels, w, cx, cy, mx, my,  0x44, 0x44, 0x58, 4)

  // Motors
  for (const [mx, my] of motors)
    droneMotor(pixels, w, mx, my, 7, 5,  0x58, 0x58, 0x70,  0x28, 0x28, 0x40)

  // Large body
  fillRect(pixels, w, cx - 9, cy - 6, cx + 9, cy + 6,  0x20, 0x20, 0x30)
  fillRect(pixels, w, cx - 7, cy - 4, cx + 7, cy + 4,  0x30, 0x30, 0x42)

  // Gimbal camera (center-front)
  fillCircle(pixels, w, cx, cy + 2, 6,  0x18, 0x18, 0x28)
  fillCircle(pixels, w, cx, cy + 2, 4,  0x10, 0x55, 0x88)  // gimbal base
  fillCircle(pixels, w, cx, cy + 2, 2,  0x18, 0x90, 0xd0)  // lens
  fillCircle(pixels, w, cx + 1, cy + 1, 1,  0xee, 0xf8, 0xff)  // lens glint

  fillCircle(pixels, w, cx, cy - 2, 2,  0xf0, 0xf0, 0xff)  // white LED
}

// Longrange drone — elongated H-frame, GPS dome, military green. 96×52.
function drawLongrangeDrone(pixels, w, h) {
  const cx = w >> 1, cy = h >> 1
  const motors = [[10, 12], [w - 11, 12], [10, h - 13], [w - 11, h - 13]]

  // Prop discs (green tint)
  for (const [mx, my] of motors)
    fillCircle(pixels, w, mx, my, 9,  0x40, 0x80, 0x40, 55)

  // Main horizontal bar (H-frame crossbar)
  fillRect(pixels, w, 10, cy - 2, w - 11, cy + 2,  0x30, 0x50, 0x30)

  // Arm stubs to motors (vertical bars)
  for (const [mx, my] of motors)
    drawLine(pixels, w, mx, cy, mx, my,  0x38, 0x58, 0x38, 3)

  // Motors
  for (const [mx, my] of motors)
    droneMotor(pixels, w, mx, my, 7, 5,  0x50, 0x80, 0x50,  0x22, 0x40, 0x22)

  // Elongated body
  fillRect(pixels, w, cx - 10, cy - 4, cx + 10, cy + 4,  0x22, 0x3a, 0x22)
  fillRect(pixels, w, cx - 8,  cy - 3, cx + 8,  cy + 3,  0x32, 0x52, 0x32)

  // GPS dome (top center)
  fillCircle(pixels, w, cx, 7, 5,  0xcc, 0xcc, 0x40)
  fillCircle(pixels, w, cx, 7, 3,  0xee, 0xee, 0x60)
  fillCircle(pixels, w, cx, 7, 1,  0xff, 0xff, 0xcc)

  // Antenna nubs
  setPixel(pixels, w, cx - 4, 4,  0xaa, 0xaa, 0x30)
  setPixel(pixels, w, cx + 4, 4,  0xaa, 0xaa, 0x30)

  fillCircle(pixels, w, cx, cy, 2,  0x50, 0xff, 0x50)   // green LED
}

// Delivery box — cardboard with tape X. 96×64.
function drawBox(pixels, w, h) {
  // Body
  fillRect(pixels, w, 0, 0, w - 1, h - 1,  0xc2, 0x96, 0x38)
  fillRect(pixels, w, 2, 2, w - 3, h - 3,  0xd0, 0xa4, 0x44)

  // Top flap seam (horizontal line ~1/3 from top)
  const seam = Math.round(h * 0.32)
  fillRect(pixels, w, 2, seam, w - 3, seam,  0xa0, 0x78, 0x28)

  // Tape X across the whole box
  drawLine(pixels, w, 4, 4, w - 5, h - 5,  0xe8, 0xd4, 0x70, 2)
  drawLine(pixels, w, w - 5, 4, 4, h - 5,  0xe8, 0xd4, 0x70, 2)

  // Tape center strips (along axes)
  drawLine(pixels, w, w >> 1, 2, w >> 1, h - 3,  0xe0, 0xcc, 0x60, 1)
  drawLine(pixels, w, 2, h >> 1, w - 3, h >> 1,  0xe0, 0xcc, 0x60, 1)

  // Border
  fillRect(pixels, w, 0, 0, w - 1, 1,  0x88, 0x62, 0x1e)
  fillRect(pixels, w, 0, h - 2, w - 1, h - 1,  0x88, 0x62, 0x1e)
  fillRect(pixels, w, 0, 0, 1, h - 1,  0x88, 0x62, 0x1e)
  fillRect(pixels, w, w - 2, 0, w - 1, h - 1,  0x88, 0x62, 0x1e)
}

// Workbench — top-down wooden bench with PCBs and tools. 192×64.
function drawWorkbench(pixels, w, h) {
  // Wood base (dark brown)
  fillRect(pixels, w, 0, 0, w - 1, h - 1,  0x5a, 0x36, 0x1c)

  // Wood surface (lighter planks)
  fillRect(pixels, w, 0, 4, w - 1, h - 8,  0x7a, 0x4e, 0x2a)

  // Grain lines (horizontal, one per plank ~12px apart)
  for (let y = 8; y < h - 8; y += 10)
    fillRect(pixels, w, 0, y, w - 1, y,  0x88, 0x5a, 0x32, 120)

  // Light shine along top
  fillRect(pixels, w, 0, 4, w - 1, 5,  0x9a, 0x6a, 0x3e)
  fillRect(pixels, w, 0, 6, w - 1, 6,  0x90, 0x62, 0x36, 160)

  // Front edge (thick dark strip)
  fillRect(pixels, w, 0, h - 7, w - 1, h - 1,  0x3c, 0x24, 0x12)
  fillRect(pixels, w, 0, h - 7, w - 1, h - 6,  0x4a, 0x2e, 0x16)

  // Small green PCB board (left quarter)
  const pcbX = Math.round(w * 0.10)
  fillRect(pixels, w, pcbX, 10, pcbX + 28, 24,  0x1e, 0x5a, 0x2e)
  fillRect(pixels, w, pcbX + 1, 11, pcbX + 27, 23,  0x28, 0x70, 0x38)
  // PCB traces
  drawLine(pixels, w, pcbX + 4, 13, pcbX + 24, 13,  0xcc, 0xaa, 0x20, 1)
  drawLine(pixels, w, pcbX + 4, 17, pcbX + 24, 17,  0xcc, 0xaa, 0x20, 1)
  drawLine(pixels, w, pcbX + 4, 21, pcbX + 24, 21,  0xcc, 0xaa, 0x20, 1)
  // Solder pads
  for (let sx = pcbX + 4; sx < pcbX + 26; sx += 5)
    fillCircle(pixels, w, sx, 13, 1,  0xee, 0xcc, 0x44)

  // Small soldering station icon (right side)
  const stX = Math.round(w * 0.72)
  fillRect(pixels, w, stX, 10, stX + 20, 22,  0x28, 0x28, 0x38)
  fillRect(pixels, w, stX + 1, 11, stX + 19, 21,  0x38, 0x38, 0x50)
  // Iron resting in holder
  fillRect(pixels, w, stX + 8, 8, stX + 12, 22,  0x60, 0x60, 0x70)
  fillRect(pixels, w, stX + 12, 9, stX + 18, 11,  0xd0, 0xd0, 0x50)  // tip

  // A few component resistors scattered
  for (const [rx, ry] of [[w * 0.42, 14], [w * 0.55, 18]]) {
    const bx = Math.round(rx)
    fillRect(pixels, w, bx, ry, bx + 8, ry + 3,  0x60, 0x28, 0x18)
    fillRect(pixels, w, bx + 1, ry + 1, bx + 7, ry + 2,  0x80, 0x40, 0x28)
    setPixel(pixels, w, bx + 3, ry + 1,  0xff, 0xcc, 0x00)  // gold band
    setPixel(pixels, w, bx + 5, ry + 1,  0x88, 0x00, 0x00)  // red band
  }
}

// Soldering iron — tool lying on bench. 64×16.
function drawSolderingIron(pixels, w, h) {
  // Handle — rubber grip (dark red-brown, textured)
  fillRect(pixels, w, 0, 2, w - 18, h - 3,  0x7a, 0x30, 0x18)
  fillRect(pixels, w, 0, 3, w - 18, h - 4,  0x92, 0x40, 0x22)
  for (let x = 4; x < w - 18; x += 5) {
    fillRect(pixels, w, x, 2, x + 1, h - 3,  0x58, 0x24, 0x12)
  }
  // Collar
  fillRect(pixels, w, w - 18, 1, w - 16, h - 2,  0x70, 0x70, 0x80)
  // Heating element
  fillRect(pixels, w, w - 16, 2, w - 8, h - 3,  0x90, 0x90, 0x98)
  fillRect(pixels, w, w - 15, 3, w - 9, h - 4,  0xb0, 0xb0, 0xb8)
  // Tip (bright — hot)
  fillRect(pixels, w, w - 8, 3, w - 1, h - 4,  0xd0, 0xd0, 0x60)
  fillRect(pixels, w, w - 5, 4, w - 1, h - 5,  0xff, 0xee, 0x80)
  // Tip glow dot
  setPixel(pixels, w, w - 3, h >> 1,  0xff, 0xff, 0xaa)
}

// Ceiling lamp — top-down view with warm glow rings. 48×48.
function drawLamp(pixels, w, h) {
  const cx = w >> 1, cy = h >> 1

  // Outer ambient glow (very faint warm amber)
  fillCircle(pixels, w, cx, cy, 22,  0xff, 0xd8, 0x50, 18)
  fillCircle(pixels, w, cx, cy, 18,  0xff, 0xdc, 0x60, 35)

  // Fixture ring (brass/gold)
  fillCircle(pixels, w, cx, cy, 13,  0xa8, 0x80, 0x28)
  fillCircle(pixels, w, cx, cy, 10,  0xc8, 0x9e, 0x38)

  // Frosted glass bowl
  fillCircle(pixels, w, cx, cy, 8,   0xfe, 0xf0, 0xa0)
  fillCircle(pixels, w, cx, cy, 5,   0xff, 0xf8, 0xd0)
  fillCircle(pixels, w, cx, cy, 2,   0xff, 0xff, 0xf8)

  // Mounting screws (4 dots on ring)
  for (const [dx, dy] of [[-10, -10], [10, -10], [-10, 10], [10, 10]])
    setPixel(pixels, w, cx + dx, cy + dy,  0x70, 0x52, 0x1c)

  // Cord (short line upward)
  fillRect(pixels, w, cx - 1, 0, cx + 1, 3,  0x50, 0x50, 0x58)
}

// Mailbox — blue postal box with slot and flag. 64×52.
function drawMailbox(pixels, w, h) {
  const cx = w >> 1, cy = h >> 1

  // Body base
  fillRect(pixels, w, 3, 4, w - 4, h - 5,  0x28, 0x48, 0xa0)
  fillRect(pixels, w, 4, 5, w - 5, h - 6,  0x3a, 0x5d, 0xb8)

  // Top lighter band (curved roof from above)
  fillRect(pixels, w, 4, 5, w - 5, 12,  0x52, 0x78, 0xd0)
  fillRect(pixels, w, 4, 13, w - 5, 14,  0x42, 0x66, 0xc0)

  // Rounded front end (left) — pill shape suggestion
  fillRect(pixels, w, 3, 5, 5, h - 6,  0x44, 0x68, 0xcc)
  fillCircle(pixels, w, 5, cy,  (h - 10) >> 1,  0x3a, 0x5d, 0xb8)

  // Rounded back end (right)
  fillRect(pixels, w, w - 6, 5, w - 4, h - 6,  0x30, 0x50, 0xb0)

  // Mail slot (horizontal dark slit)
  fillRect(pixels, w, 10, cy - 1, w - 11, cy + 1,  0x14, 0x22, 0x58)
  fillRect(pixels, w, 10, cy - 2, w - 11, cy - 2,  0x50, 0x7a, 0xd8, 180)  // highlight above slot

  // Door seam (vertical line on left face)
  fillRect(pixels, w, 12, 7, 12, h - 8,  0x28, 0x48, 0xa0)

  // Flag (right side, raised = mail waiting)
  fillRect(pixels, w, w - 8, cy - 10, w - 6, cy - 4,  0x18, 0x18, 0x22)  // pole
  fillRect(pixels, w, w - 8, cy - 10, w - 4, cy - 7,  0xcc, 0x30, 0x30)  // flag
  fillRect(pixels, w, w - 7, cy - 7,  w - 4, cy - 5,  0xaa, 0x28, 0x28)  // flag shadow

  // Border
  fillRect(pixels, w, 3, 4, w - 4, 4,  0x20, 0x38, 0x88)
  fillRect(pixels, w, 3, h - 5, w - 4, h - 5,  0x20, 0x38, 0x88)
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
    fillRect(pixels, w, cx - halfW, y, cx + halfW, y,  0xd8, 0x72, 0xa0)
  }
  // Body highlight (top-left)
  for (let y = 8; y <= cy - 2; y++) {
    const dy = y - (cy - 8)
    const halfW = Math.round(Math.sqrt(Math.max(0, 1 - (dy * dy) / ((cy - 10) * (cy - 10)))) * (cx - 12))
    fillRect(pixels, w, cx - halfW, y, cx + halfW - 4, y,  0xf0, 0x98, 0xc4, 200)
  }

  // Ears (side bumps)
  fillCircle(pixels, w, cx - 24, cy - 2, 8,  0xc0, 0x60, 0x90)
  fillCircle(pixels, w, cx - 24, cy - 2, 5,  0xd8, 0x78, 0xac)
  fillCircle(pixels, w, cx + 24, cy - 2, 8,  0xc0, 0x60, 0x90)
  fillCircle(pixels, w, cx + 24, cy - 2, 5,  0xd8, 0x78, 0xac)

  // Coin slot (dark slit on top)
  fillRect(pixels, w, cx - 6, 9, cx + 6, 11,  0x80, 0x38, 0x58)
  fillRect(pixels, w, cx - 5, 10, cx + 5, 10,  0x38, 0x14, 0x28)

  // Eyes (cute dots on front half)
  fillCircle(pixels, w, cx - 7, cy + 6, 3,  0x40, 0x14, 0x2a)
  fillCircle(pixels, w, cx - 7, cy + 6, 2,  0x18, 0x08, 0x14)
  setPixel(pixels, w, cx - 8, cy + 5,  0xff, 0xff, 0xff)   // glint
  fillCircle(pixels, w, cx + 7, cy + 6, 3,  0x40, 0x14, 0x2a)
  fillCircle(pixels, w, cx + 7, cy + 6, 2,  0x18, 0x08, 0x14)
  setPixel(pixels, w, cx + 6, cy + 5,  0xff, 0xff, 0xff)

  // Snout
  fillCircle(pixels, w, cx, cy + 16, 7,  0xc8, 0x60, 0x90)
  fillCircle(pixels, w, cx, cy + 16, 5,  0xe0, 0x78, 0xa8)
  fillCircle(pixels, w, cx - 2, cy + 17, 2,  0xa0, 0x48, 0x70)   // nostril
  fillCircle(pixels, w, cx + 2, cy + 17, 2,  0xa0, 0x48, 0x70)

  // Curly tail (top-center — viewed from above)
  setPixel(pixels, w, cx,     cy - 20,  0xc8, 0x68, 0x98)
  setPixel(pixels, w, cx + 2, cy - 21,  0xbc, 0x5c, 0x8c)
  setPixel(pixels, w, cx + 3, cy - 20,  0xc8, 0x68, 0x98)
  setPixel(pixels, w, cx + 2, cy - 19,  0xbc, 0x5c, 0x8c)
}

// Worker character — top-down view, 64×64 per frame, 4 frames wide = 256×64.
function drawWorkerWalk(pixels, w, h) {
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
    fillCircle(pixels, w, ox + f.lx, f.ly,  5,  0x18, 0x18, 0x20)
    fillCircle(pixels, w, ox + f.rx, f.ry,  5,  0x18, 0x18, 0x20)
    // Shoe tips (slightly lighter)
    fillCircle(pixels, w, ox + f.lx - 1, f.ly - 1,  2,  0x28, 0x28, 0x34)
    fillCircle(pixels, w, ox + f.rx - 1, f.ry - 1,  2,  0x28, 0x28, 0x34)

    // Pants (dark navy blue)
    fillCircle(pixels, w, ox + f.lx, f.ly - 5,  5,  0x22, 0x2e, 0x52)
    fillCircle(pixels, w, ox + f.rx, f.ry - 5,  5,  0x22, 0x2e, 0x52)

    // Body / work jacket (orange)
    fillCircle(pixels, w, cx, 34,  10,  0xd8, 0x62, 0x18)
    fillCircle(pixels, w, cx, 32,   7,  0xf0, 0x84, 0x30)   // highlight
    // Jacket collar / zipper stripe
    fillRect(pixels, w, cx - 1, 28, cx + 1, 36,  0xb8, 0x48, 0x10)
    // Side buttons / reflective strips
    fillRect(pixels, w, cx - 8, 32, cx - 6, 35,  0xee, 0xcc, 0x40)
    fillRect(pixels, w, cx + 6, 32, cx + 8, 35,  0xee, 0xcc, 0x40)

    // Head (warm skin tone)
    fillCircle(pixels, w, cx, 18,  12,  0xf0, 0xc4, 0x84)
    fillCircle(pixels, w, cx, 15,   8,  0xf8, 0xd8, 0xa0)   // forehead highlight

    // Hair / work cap (dark brown, covers top of head)
    for (let dy = -12; dy <= -3; dy++)
      for (let dx = -12; dx <= 12; dx++)
        if (dx * dx + dy * dy <= 144)
          setPixel(pixels, w, cx + dx, 18 + dy,  0x38, 0x1e, 0x0c)
    // Cap visor (flat brim)
    fillRect(pixels, w, cx - 9, 16, cx + 9, 17,  0x28, 0x14, 0x06)

    // Eyes (small dark dots below cap brim)
    setPixel(pixels, w, cx - 4, 18,  0x18, 0x18, 0x22)
    setPixel(pixels, w, cx + 4, 18,  0x18, 0x18, 0x22)
    setPixel(pixels, w, cx - 4, 17,  0x18, 0x18, 0x22)
    setPixel(pixels, w, cx + 4, 17,  0x18, 0x18, 0x22)
    // Eye glints
    setPixel(pixels, w, cx - 3, 17,  0xee, 0xee, 0xff)
    setPixel(pixels, w, cx + 5, 17,  0xee, 0xee, 0xff)

    // Mouth / slight smile
    setPixel(pixels, w, cx - 2, 22,  0xc0, 0x80, 0x60)
    setPixel(pixels, w, cx,     22,  0xc8, 0x88, 0x68)
    setPixel(pixels, w, cx + 2, 22,  0xc0, 0x80, 0x60)
    setPixel(pixels, w, cx - 2, 23,  0xb0, 0x70, 0x50)
    setPixel(pixels, w, cx + 2, 23,  0xb0, 0x70, 0x50)
  }
}

// ── Generate all sprites ──────────────────────────────────────────────────────

mkdirSync('public/sprites', { recursive: true })

const sprites = [
  // Drones — 96×52 (ratio ~1.85:1, matches SCENE_DRONE_W_RATIO : DRONE_H = W*0.09 : W*0.09*0.55)
  { name: 'mini_drone',       w:  96, h:  52, draw: drawMiniDrone       },
  { name: 'racing_drone',     w:  96, h:  52, draw: drawRacingDrone     },
  { name: 'cinematic_drone',  w:  96, h:  52, draw: drawCinematicDrone  },
  { name: 'longrange_drone',  w:  96, h:  52, draw: drawLongrangeDrone  },
  // Box — 96×64 (ratio 1.5:1, matches scene box: W*0.12 × W*0.12*0.65)
  { name: 'delivery_box',     w:  96, h:  64, draw: drawBox             },
  // Workbench — 192×64 (ratio 3:1, matches scene bench: W*0.60 × RH*0.13)
  { name: 'workbench',        w: 192, h:  64, draw: drawWorkbench       },
  { name: 'soldering_iron',   w:  64, h:  16, draw: drawSolderingIron   },
  // Worker — 4 frames × 64×64 = 256×64
  { name: 'worker_walk',      w: 256, h:  64, draw: drawWorkerWalk      },
  // Environment objects
  { name: 'lamp',             w:  48, h:  48, draw: drawLamp            },
  { name: 'mailbox',          w:  64, h:  52, draw: drawMailbox         },
  // Piggy bank — 64×64
  { name: 'piggy',            w:  64, h:  64, draw: drawPiggy           },
]

for (const { name, w, h, draw } of sprites) {
  const path = `public/sprites/${name}.png`
  writeFileSync(path, makePng(w, h, draw))
  console.log(`✓ ${path}  (${w}×${h})`)
}
