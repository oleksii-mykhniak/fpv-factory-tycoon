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
// Palettes let one walk-cycle routine produce visually distinct characters.
// The player must be readable at a glance next to a hired worker.
const WORKER_PALETTE = {
  jacket: [0xd8, 0x62, 0x18], jacketHi: [0xf0, 0x84, 0x30], jacketDark: [0xb8, 0x48, 0x10],
  trim:   [0xee, 0xcc, 0x40], pants: [0x22, 0x2e, 0x52], hair: [0x38, 0x1e, 0x0c],
  hairDark: [0x28, 0x14, 0x06],
}

const PLAYER_PALETTE = {
  jacket: [0x1f, 0x9e, 0x92], jacketHi: [0x36, 0xc4, 0xb4], jacketDark: [0x14, 0x74, 0x6c],
  trim:   [0xff, 0xe0, 0x74], pants: [0x2c, 0x2c, 0x3e], hair: [0x6a, 0x33, 0x14],
  hairDark: [0x4a, 0x22, 0x0c],
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
    fillCircle(pixels, w, ox + f.lx, f.ly,  5,  0x18, 0x18, 0x20)
    fillCircle(pixels, w, ox + f.rx, f.ry,  5,  0x18, 0x18, 0x20)
    // Shoe tips (slightly lighter)
    fillCircle(pixels, w, ox + f.lx - 1, f.ly - 1,  2,  0x28, 0x28, 0x34)
    fillCircle(pixels, w, ox + f.rx - 1, f.ry - 1,  2,  0x28, 0x28, 0x34)

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
    fillCircle(pixels, w, cx, 18,  12,  0xf0, 0xc4, 0x84)
    fillCircle(pixels, w, cx, 15,   8,  0xf8, 0xd8, 0xa0)   // forehead highlight

    // Hair / work cap (dark brown, covers top of head)
    for (let dy = -12; dy <= -3; dy++)
      for (let dx = -12; dx <= 12; dx++)
        if (dx * dx + dy * dy <= 144)
          setPixel(pixels, w, cx + dx, 18 + dy,  ...pal.hair)
    // Cap visor (flat brim)
    fillRect(pixels, w, cx - 9, 16, cx + 9, 17,  ...pal.hairDark)

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

// Objective arrow — points down by default; the scene rotates it. Drawn as a
// chevron rather than a solid block, which read as an item held over the head.
function drawArrow(pixels, w, h) {
  const cx = w / 2
  for (let y = 0; y < h; y++) {
    // Triangular head over the top 60%, tail below it.
    const t = y / h
    let halfW
    if (t < 0.62) halfW = (t / 0.62) * (w / 2 - 2)
    else          halfW = w * 0.16
    for (let x = Math.round(cx - halfW); x <= Math.round(cx + halfW); x++) {
      if (x < 0 || x >= w) continue
      const edge = Math.abs(x - cx) > halfW - 2.2
      if (edge) setPixel(pixels, w, x, y, 0xff, 0xf2, 0xb0)
      else      setPixel(pixels, w, x, y, 0xff, 0xc8, 0x3c)
    }
  }
  // Dark outline along the head's slopes so it reads on a light floor too.
  for (let y = 0; y < h * 0.62; y++) {
    const halfW = (y / (h * 0.62)) * (w / 2 - 2)
    setPixel(pixels, w, Math.round(cx - halfW), y, 0x6a, 0x4a, 0x00)
    setPixel(pixels, w, Math.round(cx + halfW), y, 0x6a, 0x4a, 0x00)
  }
}


// ── One palette, one light, one pixel density ───────────────────────────────
//
// This is what makes a set of hand-drawn sprites read as ONE set rather than as
// thirty separate drawings. It is not discipline, it is arithmetic:
//
//   PALETTE     every object picks from this list and nowhere else
//   box()       every object is lit from the top-left, because only box() shades
//   UNITS_PER_PX one world unit is always the same number of pixels
//
// The last one is the rule the Kenney experiment broke: their furniture was
// drawn for a 16px character while ours is 64px, so the same physical object
// arrived with pixels four times the size. Here every sprite declares its size
// in WORLD UNITS and the generator derives the pixel size, so that cannot drift.
const UNITS_PER_PX = 74 / 64   // character: 74 world units tall, 64px sprite

const P = {
  // Woods — furniture, crates, floors
  wood:     [0xa8, 0x7c, 0x4e], woodHi:  [0xc9, 0x9c, 0x6c], woodLo: [0x7a, 0x55, 0x33],
  // Fabric — beds, sofas, rugs
  cloth:    [0x7d, 0x6f, 0xb0], clothHi: [0x9d, 0x8f, 0xd0], clothLo: [0x58, 0x4c, 0x82],
  warm:     [0xc4, 0x6a, 0x62], warmHi:  [0xe0, 0x8a, 0x80], warmLo: [0x94, 0x48, 0x42],
  // Metals — appliances, racks, poles
  metal:    [0x9a, 0xa2, 0xb4], metalHi: [0xc2, 0xc9, 0xd6], metalLo: [0x6b, 0x72, 0x84],
  dark:     [0x3a, 0x38, 0x4c], darkHi:  [0x55, 0x52, 0x6e], darkLo: [0x24, 0x22, 0x32],
  // Nature
  leaf:     [0x5c, 0xa0, 0x58], leafHi:  [0x7c, 0xc4, 0x72], leafLo: [0x3c, 0x70, 0x3c],
  // Accents
  accent:   [0xe0, 0xa8, 0x48], white:   [0xe8, 0xe6, 0xf0], glass:  [0x86, 0xc8, 0xd8],
  // Floors are their own, quieter shades. Furniture wood at full saturation
  // across a whole room turned the flat into one orange field — a floor has to
  // sit UNDER the furniture, not compete with it.
  fWood:    [0x7e, 0x66, 0x4e], fWoodHi: [0x8d, 0x74, 0x5a], fWoodLo: [0x6a, 0x54, 0x40],
}

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
// possible place for a placeholder.

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

function drawDesk(pixels, w, h) {
  // Desk top, seen slightly from above, with a laptop open on it.
  fillRect(pixels, w, 4, 22, w - 5, h - 8, 0x7a, 0x5c, 0x3e)
  fillRect(pixels, w, 4, 22, w - 5, 27, 0x9a, 0x78, 0x52)          // lit front edge
  fillRect(pixels, w, 8, h - 8, 13, h - 2, 0x5a, 0x42, 0x2c)       // legs
  fillRect(pixels, w, w - 14, h - 8, w - 9, h - 2, 0x5a, 0x42, 0x2c)
  // Laptop: screen leaning back, keyboard flat.
  fillRect(pixels, w, 22, 6, 44, 22, 0x33, 0x38, 0x4a)
  fillRect(pixels, w, 24, 8, 42, 20, 0x6e, 0xc8, 0xd8)
  fillRect(pixels, w, 20, 22, 46, 27, 0x50, 0x56, 0x6a)
  // A mug, because a desk with only a laptop reads as furniture, not a place.
  fillCircle(pixels, w, w - 16, 30, 4, 0xd0, 0x6a, 0x5a)
}

function drawRack(pixels, w, h) {
  // Upright tool rack: frame, three shelves, tools hanging.
  fillRect(pixels, w, 3, 2, w - 4, h - 3, 0x46, 0x5a, 0x60)
  fillRect(pixels, w, 6, 5, w - 7, h - 6, 0x2e, 0x3e, 0x44)
  for (const y of [16, 34, 52]) {
    fillRect(pixels, w, 6, y, w - 7, y + 3, 0x6a, 0x86, 0x8e)
  }
  // Tools: a spanner, a coil of solder, a couple of boxes.
  drawLine(pixels, w, 12, 8, 12, 15, 0xc8, 0xc8, 0xd0, 2)
  fillCircle(pixels, w, 12, 7, 3, 0xc8, 0xc8, 0xd0)
  fillCircle(pixels, w, 24, 26, 5, 0xb0, 0xb6, 0xc0)
  fillCircle(pixels, w, 24, 26, 2, 0x2e, 0x3e, 0x44)
  fillRect(pixels, w, 10, 40, 20, 50, 0xc4, 0x8a, 0x40)
  fillRect(pixels, w, 22, 42, 30, 50, 0x8a, 0xb0, 0x60)
}

function drawJobboard(pixels, w, h) {
  // Cork board with pinned notes.
  fillRect(pixels, w, 2, 2, w - 3, h - 3, 0x6a, 0x4c, 0x30)
  fillRect(pixels, w, 5, 5, w - 6, h - 6, 0xb0, 0x8a, 0x5c)
  const notes = [
    [9, 10, 20, 24, 0xf0, 0xf0, 0xe0],
    [24, 14, 34, 30, 0xd8, 0xe8, 0xf0],
    [11, 32, 22, 46, 0xe8, 0xe0, 0xa0],
    [26, 36, 36, 50, 0xf0, 0xd8, 0xd8],
  ]
  for (const [x1, y1, x2, y2, r, g, b] of notes) {
    fillRect(pixels, w, x1, y1, x2, y2, r, g, b)
    // Lines of "writing" so it reads as a notice, not a blank square.
    for (let y = y1 + 3; y < y2 - 2; y += 4)
      fillRect(pixels, w, x1 + 2, y, x2 - 2, y, 0x70, 0x70, 0x78)
    fillCircle(pixels, w, Math.round((x1 + x2) / 2), y1 + 1, 1, 0xd0, 0x40, 0x40)
  }
}

function drawTrashbin(pixels, w, h) {
  // Bin with a lid slightly off and something sticking out.
  fillRect(pixels, w, 8, 14, w - 9, h - 4, 0x3e, 0x56, 0x34)
  fillRect(pixels, w, 8, 14, 13, h - 4, 0x52, 0x6e, 0x44)        // lit side
  for (let y = 20; y < h - 6; y += 8)
    fillRect(pixels, w, 10, y, w - 11, y + 1, 0x2c, 0x3e, 0x26)  // ribs
  fillRect(pixels, w, 4, 8, w - 5, 14, 0x56, 0x74, 0x48)          // lid
  fillRect(pixels, w, 22, 3, 34, 9, 0x8a, 0x8a, 0x96)            // scrap poking out
  drawLine(pixels, w, 24, 3, 30, 8, 0xb0, 0xb0, 0xbc, 2)
}

// ── Cat (V5) ────────────────────────────────────────────────────────────────
// Four frames: three walking, one sitting. Side-on, tiny, and the tail is the
// part that has to read at 30 px — it is what says "cat" rather than "dog".
// Ginger, not grey. The first pass made a dark cat on a dark floor: you could
// not find it in a screenshot, let alone while playing. Everything alive in
// this game has to read against #1a1a26.
const CAT = {
  fur:     [0xd8, 0x8a, 0x40],
  furHi:   [0xf2, 0xac, 0x5c],
  furDark: [0xa6, 0x62, 0x28],
  eye:     [0x3a, 0xe0, 0x9a],
  nose:    [0xf0, 0x9a, 0xaa],
}

function drawCatFrame(pixels, w, ox, { legs, sitting }) {
  const cx = ox + 16
  const baseY = sitting ? 25 : 24

  // Tail — a curve, drawn first so the body overlaps its root.
  const tailPts = sitting
    ? [[cx + 9, baseY], [cx + 13, baseY - 2], [cx + 15, baseY - 7]]
    : [[cx + 9, baseY - 4], [cx + 14, baseY - 6], [cx + 16, baseY - 12]]
  for (let i = 0; i < tailPts.length - 1; i++) {
    const [x0, y0] = tailPts[i], [x1, y1] = tailPts[i + 1]
    drawLine(pixels, w, x0, y0, x1, y1, ...CAT.furDark, 3)
  }

  if (sitting) {
    // Haunches + upright chest.
    fillCircle(pixels, w, cx + 3, baseY - 4, 6, ...CAT.fur)
    fillRect(pixels, w, cx - 4, baseY - 12, cx + 2, baseY - 1, ...CAT.fur)
  } else {
    fillRect(pixels, w, cx - 6, baseY - 10, cx + 8, baseY - 3, ...CAT.fur)
    fillRect(pixels, w, cx - 6, baseY - 10, cx + 8, baseY - 8, ...CAT.furHi)
    // Legs swing between frames so the walk reads even this small.
    for (const [lx, len] of legs) {
      fillRect(pixels, w, cx + lx, baseY - 3, cx + lx + 1, baseY - 3 + len, ...CAT.furDark)
    }
  }

  // Head + ears + face.
  const hx = cx - 8, hy = sitting ? baseY - 16 : baseY - 12
  fillCircle(pixels, w, hx, hy, 5, ...CAT.fur)
  fillCircle(pixels, w, hx, hy - 2, 4, ...CAT.furHi)
  drawLine(pixels, w, hx - 4, hy - 4, hx - 2, hy - 8, ...CAT.furDark, 2)
  drawLine(pixels, w, hx + 2, hy - 4, hx + 4, hy - 8, ...CAT.furDark, 2)
  setPixel(pixels, w, hx - 3, hy, ...CAT.eye)
  setPixel(pixels, w, hx + 1, hy, ...CAT.eye)
  setPixel(pixels, w, hx - 1, hy + 2, ...CAT.nose)
}

function drawCat(pixels, w) {
  const frames = [
    { legs: [[-5, 5], [5, 5]],  sitting: false },
    { legs: [[-6, 6], [6, 4]],  sitting: false },
    { legs: [[-5, 5], [5, 5]],  sitting: false },
    { legs: [[-4, 4], [4, 6]],  sitting: false },
  ]
  frames.forEach((f, i) => drawCatFrame(pixels, w, i * 32, f))
  // Fifth cell: sitting. The rig can hold on it when the cat stops.
  drawCatFrame(pixels, w, 4 * 32, { legs: [], sitting: true })
}

const drawWorkerWalk = (pixels, w, h) => drawWalkCycle(pixels, w, h, WORKER_PALETTE)
const drawPlayerWalk = (pixels, w, h) => drawWalkCycle(pixels, w, h, PLAYER_PALETTE)

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
  { name: 'player_walk',      w: 256, h:  64, draw: drawPlayerWalk      },
  // Environment objects
  { name: 'lamp',             w:  48, h:  48, draw: drawLamp            },
  { name: 'mailbox',          w:  64, h:  52, draw: drawMailbox         },
  // Piggy bank — 64×64
  { name: 'piggy',            w:  64, h:  64, draw: drawPiggy           },
  // Objective arrow — 32×40, points down; the scene rotates it toward the goal
  { name: 'arrow',            w:  32, h:  40, draw: drawArrow           },

  { name: 'cat_walk',         w: 160, h:  32, draw: drawCat             },

  // Redrawn from the shared palette (V6): the first pass at these four used
  // their own colours and stood out against everything drawn since.
  { name: 'desk',             w: 104, h:  64, draw: drawDesk2           },
  { name: 'rack',             w:  56, h:  80, draw: drawRack2           },
  { name: 'jobboard',         w:  56, h:  64, draw: drawJobboard2       },
  { name: 'trashbin',         w:  48, h:  58, draw: drawTrashbin2       },
]

// Sprites whose size is declared in WORLD UNITS. The generator converts, so
// every one of them lands at the same pixel density as the character (V6).
const T = 74   // one character height
const worldSprites = [
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
]

for (const s of worldSprites) {
  sprites.push({
    name: s.name,
    w: Math.round(s.wu / UNITS_PER_PX),
    h: Math.round(s.hu / UNITS_PER_PX),
    draw: s.draw,
  })
}

for (const { name, w, h, draw } of sprites) {
  const path = `public/sprites/${name}.png`
  writeFileSync(path, makePng(w, h, draw))
  console.log(`✓ ${path}  (${w}×${h})`)
}
