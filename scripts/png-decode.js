// Мінімальний декодер PNG для інструментів збірки (Node, без залежностей).
//
// Кодувальник у gen-sprites.js писав PNG, але прочитати чужий файл гра не вміла
// — і кожен зовнішній аркуш спрайтів упирався в те, що на машині немає ні
// ImageMagick, ні PIL. Вісімдесят рядків inflate + розфільтрування знімають цю
// залежність назавжди.
//
// Підтримка навмисно вузька: 8 біт на канал, тип кольору 2 (RGB) або 6 (RGBA),
// без черезрядковості. Саме це віддають генератори спрайтів. Усе інше — кидає.
import { inflateSync } from 'zlib'

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('не PNG')

  let w = 0, h = 0, depth = 0, colorType = 0
  const idat = []

  for (let off = 8; off < buf.length;) {
    const len  = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    off += 12 + len

    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4)
      depth = data[8]; colorType = data[9]
      if (depth !== 8) throw new Error(`підтримується лише 8 біт, тут ${depth}`)
      if (colorType !== 2 && colorType !== 6) throw new Error(`тип кольору ${colorType} не підтримується`)
      if (data[12] !== 0) throw new Error('черезрядковий PNG не підтримується')
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') break
  }

  const bpp      = colorType === 6 ? 4 : 3
  const rowBytes = w * bpp
  const raw      = inflateSync(Buffer.concat(idat))
  const out      = Buffer.alloc(w * h * 4)
  let prev = Buffer.alloc(rowBytes)

  for (let y = 0; y < h; y++) {
    const filter = raw[y * (rowBytes + 1)]
    const row    = Buffer.from(raw.subarray(y * (rowBytes + 1) + 1, (y + 1) * (rowBytes + 1)))

    for (let i = 0; i < rowBytes; i++) {
      const a = i >= bpp ? row[i - bpp] : 0
      const b = prev[i]
      const c = i >= bpp ? prev[i - bpp] : 0
      let v = row[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      row[i] = v & 0xFF
    }

    for (let x = 0; x < w; x++) {
      const s = x * bpp, d = (y * w + x) * 4
      out[d] = row[s]; out[d + 1] = row[s + 1]; out[d + 2] = row[s + 2]
      out[d + 3] = colorType === 6 ? row[s + 3] : 255
    }
    prev = row
  }

  return { width: w, height: h, pixels: out }
}
