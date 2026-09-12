// Імпорт зовнішнього аркуша спрайтів (згенерованого ШІ) у формат гри.
//
// Запуск:
//   node scripts/import-ai-sheet.js <вхід.png> <ім'я> [--rows=6] [--cols=6]
//                                   [--height=128] [--frames=N] [--bg=RRGGBB]
//
// Що робить, по кроках:
//   1. читає PNG (png-decode.js);
//   2. вибиває фон-хромакей у прозорість — м'яко, з двома порогами, тому
//      контур не отримує фіолетової облямівки;
//   3. рахує ОДНУ рамку вмісту на всі кадри, тому персонаж не стрибає
//      між кадрами: рух лишається рухом, а не тремтінням обрізки;
//   4. зменшує боксфільтром по попередньо помноженій альфі;
//   5. пише сітку rows×cols у public/sprites/<ім'я>.png.
//
// Крок 3 — причина, чому це скрипт, а не разова команда: обрізати кожен кадр
// по його власному вмісту здається правильним рівно доти, доки персонаж не
// почне сіпатися на місці.
import { readFileSync, writeFileSync } from 'fs'
import { decodePng } from './png-decode.js'
import { encodePng } from './png-encode.js'

// Наскільки далеко колір має відійти від фону, щоб рахуватися за персонажа.
// KEY_NEAR і ближче — чистий фон; KEY_FAR і далі — чистий вміст; між ними
// альфа наростає лінійно. Одного порога мало: контур згенерованого арту
// розмитий на кілька пікселів, і різкий поріг лишає фіолетовий кант.
const KEY_NEAR = 42
const KEY_FAR  = 110
// Скільки прозорих пікселів лишати навколо вмісту.
const PAD = 2

const args = process.argv.slice(2)
const flag = (name, dflt) => {
  const hit = args.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
const positional = args.filter(a => !a.startsWith('--'))
const [inputPath, outName] = positional
if (!inputPath || !outName) {
  console.error('usage: node scripts/import-ai-sheet.js <вхід.png> <ім\'я> [--rows=6] [--cols=6] [--height=128]')
  process.exit(1)
}

const rows     = Number(flag('rows', 6))
const cols     = Number(flag('cols', 6))
const outH     = Number(flag('height', 128))
const frames   = Number(flag('frames', rows * cols))
const bgFlag   = flag('bg', null)

const src = decodePng(readFileSync(inputPath))
const fw = Math.floor(src.width / cols)
const fh = Math.floor(src.height / rows)

// Фон беремо з кутів: генератор кладе персонажа в центр кадру, тож усі чотири
// кути — це гарантовано фон. Медіана трьох каналів захищає від одного кута,
// що випадково зачепив вміст.
function bgColor() {
  if (bgFlag) return [0, 2, 4].map(i => parseInt(bgFlag.slice(i, i + 2), 16))
  const pick = []
  for (const [x, y] of [[1, 1], [src.width - 2, 1], [1, src.height - 2], [src.width - 2, src.height - 2]]) {
    const i = (y * src.width + x) * 4
    pick.push([src.pixels[i], src.pixels[i + 1], src.pixels[i + 2]])
  }
  return [0, 1, 2].map(c => {
    const v = pick.map(p => p[c]).sort((a, b) => a - b)
    return Math.round((v[1] + v[2]) / 2)
  })
}
const [br, bg_, bb] = bgColor()

// Хромакей + деспіл в один прохід: RGBA-буфер того самого розміру, що й вхід.
const keyed = Buffer.alloc(src.width * src.height * 4)
for (let i = 0; i < src.width * src.height; i++) {
  const p = i * 4
  const r = src.pixels[p], g = src.pixels[p + 1], b = src.pixels[p + 2]
  const d = Math.hypot(r - br, g - bg_, b - bb)
  let a = d <= KEY_NEAR ? 0 : d >= KEY_FAR ? 1 : (d - KEY_NEAR) / (KEY_FAR - KEY_NEAR)
  a *= src.pixels[p + 3] / 255
  if (a <= 0) continue
  // Піксель контуру — це вміст, змішаний із фоном. Знаючи альфу, домішку фону
  // можна відняти: інакше півпрозорий кант лишається фіолетовим і світиться
  // на темній підлозі цеху.
  keyed[p]     = clamp255((r - br * (1 - a)) / a)
  keyed[p + 1] = clamp255((g - bg_ * (1 - a)) / a)
  keyed[p + 2] = clamp255((b - bb * (1 - a)) / a)
  keyed[p + 3] = Math.round(a * 255)
}

function clamp255(v) { return Math.max(0, Math.min(255, Math.round(v))) }

// Спільна рамка вмісту на всі кадри — крок 3.
let minX = fw, minY = fh, maxX = -1, maxY = -1
for (let f = 0; f < frames; f++) {
  const ox = (f % cols) * fw
  const oy = Math.floor(f / cols) * fh
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      if (keyed[((oy + y) * src.width + ox + x) * 4 + 3] < 24) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
}
if (maxX < 0) { console.error('порожньо: хромакей вибив усе — перевір --bg'); process.exit(1) }

minX = Math.max(0, minX - PAD); minY = Math.max(0, minY - PAD)
maxX = Math.min(fw - 1, maxX + PAD); maxY = Math.min(fh - 1, maxY + PAD)
const cropW = maxX - minX + 1
const cropH = maxY - minY + 1
const outW  = Math.max(1, Math.round(outH * cropW / cropH))

// Боксфільтр по попередньо помноженій альфі: множити треба ДО усереднення,
// інакше колір прозорих пікселів (а він довільний) підмішується в контур.
function sampleFrame(f, dst, dstW, dx0, dy0) {
  const ox = (f % cols) * fw + minX
  const oy = Math.floor(f / cols) * fh + minY
  for (let y = 0; y < outH; y++) {
    const y0 = Math.floor(y * cropH / outH), y1 = Math.max(y0 + 1, Math.floor((y + 1) * cropH / outH))
    for (let x = 0; x < outW; x++) {
      const x0 = Math.floor(x * cropW / outW), x1 = Math.max(x0 + 1, Math.floor((x + 1) * cropW / outW))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const p = ((oy + sy) * src.width + ox + sx) * 4
          const pa = keyed[p + 3] / 255
          r += keyed[p] * pa; g += keyed[p + 1] * pa; b += keyed[p + 2] * pa
          a += pa; n++
        }
      }
      const d = ((dy0 + y) * dstW + dx0 + x) * 4
      if (a <= 0) { dst[d + 3] = 0; continue }
      dst[d]     = clamp255(r / a)
      dst[d + 1] = clamp255(g / a)
      dst[d + 2] = clamp255(b / a)
      dst[d + 3] = clamp255(a / n * 255)
    }
  }
}

const sheetW = outW * cols
const sheetH = outH * rows
const out = Buffer.alloc(sheetW * sheetH * 4)
for (let f = 0; f < frames; f++) {
  sampleFrame(f, out, sheetW, (f % cols) * outW, Math.floor(f / cols) * outH)
}

const outPath = `public/sprites/${outName}.png`
writeFileSync(outPath, encodePng(sheetW, sheetH, out))
console.log(`✓ ${outPath}  ${sheetW}×${sheetH}  (кадр ${outW}×${outH}, сітка ${cols}×${rows}, кадрів ${frames})`)
console.log(`  фон #${[br, bg_, bb].map(v => v.toString(16).padStart(2, '0')).join('')}, рамка ${cropW}×${cropH} з ${fw}×${fh}`)
