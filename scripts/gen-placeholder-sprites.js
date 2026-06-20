// Generates solid-color placeholder PNGs for each sprite in the manifest.
// Run once: node scripts/gen-placeholder-sprites.js
// Replace with real art later — sizes and positions are tuned in scene.js.
import { writeFileSync, mkdirSync } from 'fs'
import { deflateSync } from 'zlib'

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
  const tb = Buffer.from(type)
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const crcBuf = Buffer.concat([tb, data])
  const crcBytes = Buffer.alloc(4); crcBytes.writeUInt32BE(crc32(crcBuf))
  return Buffer.concat([len, tb, data, crcBytes])
}

function makePng(w, h, [r, g, b]) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2   // 8-bit RGB, no alpha

  const rowBytes = 1 + w * 3  // filter byte + RGB per pixel
  const raw = Buffer.alloc(h * rowBytes)
  for (let y = 0; y < h; y++) {
    const base = y * rowBytes
    raw[base] = 0  // filter type: None
    for (let x = 0; x < w; x++) {
      raw[base + 1 + x * 3]     = r
      raw[base + 1 + x * 3 + 1] = g
      raw[base + 1 + x * 3 + 2] = b
    }
  }

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public/sprites', { recursive: true })

// Colors match the fallback rect palette in scene.js
const sprites = {
  mini_drone:     { w: 120, h:  40, rgb: [0x2a, 0x2a, 0x3e] },
  delivery_box:   { w:  80, h:  60, rgb: [0xc4, 0x9a, 0x3c] },
  workbench:      { w: 280, h:  18, rgb: [0x6b, 0x42, 0x26] },
  soldering_iron: { w:  60, h:  16, rgb: [0x64, 0x50, 0x3c] },
}

for (const [name, { w, h, rgb }] of Object.entries(sprites)) {
  const path = `public/sprites/${name}.png`
  writeFileSync(path, makePng(w, h, rgb))
  console.log(`✓ ${path}  (${w}×${h})`)
}
