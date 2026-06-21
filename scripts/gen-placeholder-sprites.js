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

// drawFn(pixels, w, h) — pixels is Uint8Array (RGBA, row-major).
// Returns a PNG Buffer.
function makePng(w, h, drawFn) {
  const pixels = new Uint8Array(w * h * 4) // all zeros = transparent black
  drawFn(pixels, w, h)

  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6  // 8-bit, RGBA

  const rowBytes = 1 + w * 4
  const raw = Buffer.alloc(h * rowBytes)
  for (let y = 0; y < h; y++) {
    raw[y * rowBytes] = 0  // filter: None
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
  // alpha-composite over existing
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

// Bresenham line
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

function drawDrone(pixels, w, h) {
  const cx = w >> 1, cy = h >> 1
  // Arms — dark blue-gray
  fillRect(pixels, w,  6, cy - 2,  w - 7, cy + 2,  0x4a, 0x4a, 0x6a)
  fillRect(pixels, w, cx - 2,  5, cx + 2, h - 6,    0x4a, 0x4a, 0x6a)
  // Motors at arm ends — lighter ring
  for (const [mx, my] of [[8, cy], [w - 9, cy], [cx, 7], [cx, h - 8]]) {
    fillCircle(pixels, w, mx, my, 7,  0x7a, 0x7a, 0x9a)
    fillCircle(pixels, w, mx, my, 5,  0x3a, 0x3a, 0x5a)
    fillCircle(pixels, w, mx, my, 2,  0x8a, 0x8a, 0xaa)  // shaft center
  }
  // Center body
  fillRect(pixels, w, cx - 6, cy - 4, cx + 6, cy + 4,  0x2a, 0x2a, 0x4a)
  fillCircle(pixels, w, cx, cy, 3,  0x6a, 0xb0, 0xff)  // LED dot
}

function drawBox(pixels, w, h) {
  // Body
  fillRect(pixels, w, 0, 0, w - 1, h - 1,  0xc4, 0x9a, 0x3c)
  // Border
  fillRect(pixels, w, 0, 0, w - 1, 1,  0x8a, 0x6a, 0x20)
  fillRect(pixels, w, 0, h - 2, w - 1, h - 1,  0x8a, 0x6a, 0x20)
  fillRect(pixels, w, 0, 0, 1, h - 1,  0x8a, 0x6a, 0x20)
  fillRect(pixels, w, w - 2, 0, w - 1, h - 1,  0x8a, 0x6a, 0x20)
  // Tape X
  drawLine(pixels, w, 2, 2, w - 3, h - 3,  0xe8, 0xd0, 0x80, 2)
  drawLine(pixels, w, w - 3, 2, 2, h - 3,  0xe8, 0xd0, 0x80, 2)
  // Tape center cross
  drawLine(pixels, w, w >> 1, 2, w >> 1, h - 3,  0xe8, 0xd0, 0x80, 1)
  drawLine(pixels, w, 2, h >> 1, w - 3, h >> 1,  0xe8, 0xd0, 0x80, 1)
}

function drawWorkbench(pixels, w, h) {
  // Brown plank
  fillRect(pixels, w, 0, 0, w - 1, h - 1,  0x6b, 0x42, 0x26)
  // Plank grain lines (lighter)
  for (let x = 0; x < w; x += 12)
    fillRect(pixels, w, x, 1, x + 1, h - 2,  0x7a, 0x52, 0x30)
  // Front edge
  fillRect(pixels, w, 0, h - 3, w - 1, h - 1,  0x4a, 0x2a, 0x18)
  // Top highlight
  fillRect(pixels, w, 0, 0, w - 1, 1,  0x8a, 0x5a, 0x36)
}

function drawSolderingIron(pixels, w, h) {
  // Handle — brown
  fillRect(pixels, w, 0, 1, w - 14, h - 2,  0x8a, 0x5a, 0x30)
  fillRect(pixels, w, 0, 3, w - 14, h - 4,  0xa0, 0x70, 0x40)
  // Metal shaft — gray
  fillRect(pixels, w, w - 14, 2, w - 5, h - 3,  0x90, 0x90, 0x90)
  // Tip — bright
  fillRect(pixels, w, w - 5, 3, w - 1, h - 4,  0xd0, 0xd0, 0x60)
  // Grip rings
  for (let x = 4; x < w - 14; x += 5)
    fillRect(pixels, w, x, 1, x + 1, h - 2,  0x60, 0x3a, 0x20)
}

// Worker character — top-down view, 48×48 per frame, 4 frames wide
function drawWorkerWalk(pixels, w, h) {
  // w=192 h=48, 4 frames of 48×48
  const FRAME = 48
  const frames = [
    { headY: 13, bodyY: 26, lx: 19, ly: 38, rx: 29, ry: 38 },  // neutral
    { headY: 12, bodyY: 25, lx: 15, ly: 36, rx: 32, ry: 40 },  // left forward
    { headY: 13, bodyY: 26, lx: 19, ly: 38, rx: 29, ry: 38 },  // neutral
    { headY: 12, bodyY: 25, lx: 16, ly: 40, rx: 33, ry: 36 },  // right forward
  ]
  for (let fi = 0; fi < 4; fi++) {
    const ox = fi * FRAME  // x offset for this frame
    const f  = frames[fi]
    const cx = ox + 24     // frame center x

    // Shadow (subtle dark oval under body)
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -8; dx <= 8; dx++)
        if ((dx * dx) / 64 + (dy * dy) / 16 <= 1)
          setPixel(pixels, w, cx + dx, f.bodyY + 10 + dy, 0, 0, 0, 40)

    // Shoes — dark
    fillCircle(pixels, w, ox + f.lx, f.ly, 4,  0x22, 0x22, 0x22)
    fillCircle(pixels, w, ox + f.rx, f.ry, 4,  0x22, 0x22, 0x22)

    // Pants — dark blue
    fillCircle(pixels, w, ox + f.lx, f.ly - 2, 4,  0x3a, 0x4a, 0x6b)
    fillCircle(pixels, w, ox + f.rx, f.ry - 2, 4,  0x3a, 0x4a, 0x6b)

    // Jacket body — orange
    fillCircle(pixels, w, cx, f.bodyY,     8,  0xf0, 0xa0, 0x30)
    fillCircle(pixels, w, cx, f.bodyY - 1, 6,  0xf8, 0xb4, 0x44)  // highlight
    // Jacket zipper line
    setPixel(pixels, w, cx, f.bodyY - 4,  0xe0, 0x90, 0x20)
    setPixel(pixels, w, cx, f.bodyY - 2,  0xe0, 0x90, 0x20)
    setPixel(pixels, w, cx, f.bodyY,      0xe0, 0x90, 0x20)

    // Head — peach/tan skin
    fillCircle(pixels, w, cx, f.headY,     9,  0xf5, 0xd5, 0xa0)
    fillCircle(pixels, w, cx, f.headY - 3, 5,  0xf8, 0xde, 0xb0)  // forehead highlight
    // Hair — dark brown cap
    for (let dy = -9; dy <= -4; dy++)
      for (let dx = -9; dx <= 9; dx++)
        if (dx * dx + dy * dy <= 81)
          setPixel(pixels, w, cx + dx, f.headY + dy, 0x6b, 0x3a, 0x18)
    // Face: tiny eyes
    setPixel(pixels, w, cx - 3, f.headY,  0x22, 0x22, 0x22)
    setPixel(pixels, w, cx + 3, f.headY,  0x22, 0x22, 0x22)
    // tiny mouth
    setPixel(pixels, w, cx - 1, f.headY + 3,  0xaa, 0x70, 0x50)
    setPixel(pixels, w, cx,     f.headY + 3,  0xaa, 0x70, 0x50)
    setPixel(pixels, w, cx + 1, f.headY + 3,  0xaa, 0x70, 0x50)
  }
}

function drawRacingDrone(pixels, w, h) {
  const cx = w >> 1, cy = h >> 1
  // Slim X-frame arms — cyan/blue
  drawLine(pixels, w, 4, 4, w - 5, h - 5,  0x40, 0x90, 0xd0, 2)
  drawLine(pixels, w, w - 5, 4, 4, h - 5,  0x40, 0x90, 0xd0, 2)
  // Motors
  for (const [mx, my] of [[6, 6], [w - 7, 6], [6, h - 7], [w - 7, h - 7]]) {
    fillCircle(pixels, w, mx, my, 6,  0x60, 0xb0, 0xe0)
    fillCircle(pixels, w, mx, my, 4,  0x20, 0x60, 0xa0)
    fillCircle(pixels, w, mx, my, 2,  0x90, 0xd0, 0xff)
  }
  // Center — compact body
  fillRect(pixels, w, cx - 4, cy - 3, cx + 4, cy + 3,  0x18, 0x28, 0x4a)
  fillCircle(pixels, w, cx, cy, 2,  0xff, 0x40, 0x40)  // red LED
}

function drawCinematicDrone(pixels, w, h) {
  const cx = w >> 1, cy = h >> 1
  // Heavy X-frame — dark gray
  fillRect(pixels, w, 4, cy - 2, w - 5, cy + 2,  0x50, 0x50, 0x60)
  fillRect(pixels, w, cx - 2, 4, cx + 2, h - 5,  0x50, 0x50, 0x60)
  // Diagonal struts
  drawLine(pixels, w, 8, 8, cx - 3, cy - 3,  0x60, 0x60, 0x70, 2)
  drawLine(pixels, w, w - 9, 8, cx + 3, cy - 3,  0x60, 0x60, 0x70, 2)
  drawLine(pixels, w, 8, h - 9, cx - 3, cy + 3,  0x60, 0x60, 0x70, 2)
  drawLine(pixels, w, w - 9, h - 9, cx + 3, cy + 3,  0x60, 0x60, 0x70, 2)
  // Motors
  for (const [mx, my] of [[9, 9], [w - 10, 9], [9, h - 10], [w - 10, h - 10]]) {
    fillCircle(pixels, w, mx, my, 7,  0x70, 0x70, 0x80)
    fillCircle(pixels, w, mx, my, 5,  0x30, 0x30, 0x40)
    fillCircle(pixels, w, mx, my, 2,  0xc0, 0xc0, 0xd0)
  }
  // Camera gimbal — bottom center
  fillCircle(pixels, w, cx, cy + 2, 5,  0x28, 0x28, 0x38)
  fillCircle(pixels, w, cx, cy + 2, 3,  0x10, 0x60, 0x90)  // lens
  fillCircle(pixels, w, cx, cy + 2, 1,  0xd0, 0xd0, 0xff)  // reflection
  // Body
  fillRect(pixels, w, cx - 5, cy - 4, cx + 5, cy + 4,  0x22, 0x22, 0x32)
}

function drawLongrangeDrone(pixels, w, h) {
  const cx = w >> 1, cy = h >> 1
  // Elongated body
  fillRect(pixels, w, 4, cy - 3, w - 5, cy + 3,  0x3a, 0x5a, 0x3a)
  // Side wings
  fillRect(pixels, w, cx - 2, 6, cx + 2, h - 7,  0x3a, 0x5a, 0x3a)
  // Motors — 4-motor standard
  for (const [mx, my] of [[8, cy], [w - 9, cy], [cx, 8], [cx, h - 9]]) {
    fillCircle(pixels, w, mx, my, 6,  0x5a, 0x8a, 0x5a)
    fillCircle(pixels, w, mx, my, 4,  0x28, 0x48, 0x28)
    fillCircle(pixels, w, mx, my, 2,  0x8a, 0xca, 0x8a)
  }
  // GPS antenna nub
  fillRect(pixels, w, cx - 1, 1, cx + 1, 4,  0xaa, 0xaa, 0x50)
  fillCircle(pixels, w, cx, 2, 2,  0xdd, 0xdd, 0x60)
  // Center body
  fillRect(pixels, w, cx - 5, cy - 3, cx + 5, cy + 3,  0x28, 0x48, 0x28)
  fillCircle(pixels, w, cx, cy, 2,  0x50, 0xff, 0x50)  // green LED
}

// ── Generate all sprites ──────────────────────────────────────────────────────

mkdirSync('public/sprites', { recursive: true })

const sprites = [
  { name: 'mini_drone',       w:  80, h:  40, draw: drawDrone          },
  { name: 'racing_drone',     w:  80, h:  40, draw: drawRacingDrone    },
  { name: 'cinematic_drone',  w:  96, h:  56, draw: drawCinematicDrone },
  { name: 'longrange_drone',  w:  88, h:  44, draw: drawLongrangeDrone },
  { name: 'delivery_box',     w:  64, h:  52, draw: drawBox            },
  { name: 'workbench',        w: 300, h:  20, draw: drawWorkbench      },
  { name: 'soldering_iron',   w:  48, h:  12, draw: drawSolderingIron  },
  { name: 'worker_walk',      w: 192, h:  48, draw: drawWorkerWalk     },
]

for (const { name, w, h, draw } of sprites) {
  const path = `public/sprites/${name}.png`
  writeFileSync(path, makePng(w, h, draw))
  console.log(`✓ ${path}  (${w}×${h})`)
}
