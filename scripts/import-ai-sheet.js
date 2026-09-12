// Імпорт зовнішнього аркуша спрайтів (згенерованого ШІ) у формат гри.
//
// Запуск:
//   node scripts/import-ai-sheet.js <вхід.png> <ім'я> [--rows=6] [--cols=6]
//                                   [--height=128] [--skip=N] [--frames=N]
//                                   [--bg=RRGGBB|none] [--json=аркуш.json]
//
// --rows/--cols описують ВХІД (сітку експорту, вона є в імені файлу), --skip і
// --frames вирізають із неї корисний діапазон. Генератор любить починати цикл
// із розгону — кілька кадрів, де персонаж нахиляється й розпрямляється; у грі
// цикл крутиться нескінченно, і цей розгін виглядає як судома. --skip=12 його
// відрізає.
//
// Що робить, по кроках:
//   1. читає PNG (png-decode.js), а сітку кадрів бере з --json, якщо він є;
//   2. вибиває фон-хромакей у прозорість — м'яко, з двома порогами, тому
//      контур не отримує фіолетової облямівки. Аркуш, який уже прийшов із
//      прозорістю, цей крок ПРОПУСКАЄ: там «фон» у кутах — нулі, і хромакей
//      порівнював би все з чорним, з'їдаючи чорний контур персонажа;
//   3. рахує ОДНУ рамку вмісту на всі кадри, тому персонаж не стрибає
//      між кадрами: рух лишається рухом, а не тремтінням обрізки;
//   4. зменшує боксфільтром по попередньо помноженій альфі;
//   5. пише ОДИН рядок кадрів у public/sprites/<ім'я>.png.
//
// Вихід саме рядком, а не сіткою: тоді ширина кадру = ширина файлу / кількість
// кадрів, і грі досить знати ОДНЕ число замість трьох. Три числа, які мусять
// збігатися з файлом, — це три способи порізати персонажа навпіл.
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
  console.error('usage: node scripts/import-ai-sheet.js <вхід.png> <ім\'я> [--rows=6] [--cols=6] [--height=128] [--skip=0] [--frames=N] [--bg=RRGGBB|none] [--json=аркуш.json]')
  process.exit(1)
}

const rows     = Number(flag('rows', 6))
const cols     = Number(flag('cols', 6))
const outH     = Number(flag('height', 128))
const skip     = Number(flag('skip', 0))
const framesFlag = flag('frames', null)
const bgFlag   = flag('bg', null)
const jsonPath = flag('json', null)

const src = decodePng(readFileSync(inputPath))

// Сітка кадрів. Ділення розміру на rows/cols — здогад, який збігається з
// правдою рівно доти, доки генератор не лишить скраю зайвого пікселя. JSON
// (його кладе в архів Ludo.ai) містить рамку КОЖНОГО кадру, тож коли він є —
// віримо йому, а сітку з імені файлу використовуємо лише як перевірку.
let rects
if (jsonPath) {
  const atlas = JSON.parse(readFileSync(jsonPath, 'utf8'))
  rects = Object.values(atlas.frames ?? {}).map(f => f.frame)
  if (!rects.length) { console.error(`${jsonPath}: немає frames`); process.exit(1) }
  const odd = rects.find(r => r.w !== rects[0].w || r.h !== rects[0].h)
  // Спільна рамка вмісту (крок 3) має сенс лише коли кадри однакові.
  if (odd) { console.error('кадри різного розміру — такий аркуш скрипт не ріже'); process.exit(1) }
} else {
  const gw = Math.floor(src.width / cols), gh = Math.floor(src.height / rows)
  rects = [...Array(rows * cols).keys()].map(f => ({
    x: (f % cols) * gw, y: Math.floor(f / cols) * gh, w: gw, h: gh,
  }))
}
const fw = rects[0].w
const fh = rects[0].h
if (!jsonPath && rows * cols !== rects.length) { console.error('сітка не збігається'); process.exit(1) }

// Індекси кадрів у ВХІДНІЙ сітці, які потраплять у вихід. Який діапазон
// вирізати, підказує scripts/analyze-ai-sheet.js: він шукає вікно, де останній
// кадр переходить у перший так само м'яко, як кадри всередині вікна.
const frames = Number(framesFlag ?? rects.length - skip)
const picked = [...Array(frames).keys()].map(i => skip + i).filter(f => f < rects.length)
if (!picked.length) { console.error('порожній діапазон: перевір --skip/--frames'); process.exit(1) }

// Чи прийшов аркуш уже з прозорістю. Кути — гарантований фон; якщо вони
// прозорі, генератор віддав альфу сам, і вибивати нічого не треба.
function alphaNative() {
  if (bgFlag === 'none') return true
  if (bgFlag) return false
  return [[1, 1], [src.width - 2, 1], [1, src.height - 2], [src.width - 2, src.height - 2]]
    .every(([x, y]) => src.pixels[(y * src.width + x) * 4 + 3] < 8)
}

// Фон беремо з кутів: генератор кладе персонажа в центр кадру, тож усі чотири
// кути — це гарантовано фон. Медіана трьох каналів захищає від одного кута,
// що випадково зачепив вміст.
function bgColor() {
  if (bgFlag && bgFlag !== 'none') return [0, 2, 4].map(i => parseInt(bgFlag.slice(i, i + 2), 16))
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
const keyless = alphaNative()
const [br, bg_, bb] = keyless ? [0, 0, 0] : bgColor()

// Хромакей + деспіл в один прохід: RGBA-буфер того самого розміру, що й вхід.
const keyed = Buffer.alloc(src.width * src.height * 4)
if (keyless) src.pixels.copy(keyed)
else for (let i = 0; i < src.width * src.height; i++) {
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
for (const f of picked) {
  const ox = rects[f].x
  const oy = rects[f].y
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
if (maxX < 0) { console.error('порожньо: у вибраних кадрах нема непрозорих пікселів — перевір --bg/--skip'); process.exit(1) }

minX = Math.max(0, minX - PAD); minY = Math.max(0, minY - PAD)
maxX = Math.min(fw - 1, maxX + PAD); maxY = Math.min(fh - 1, maxY + PAD)
const cropW = maxX - minX + 1
const cropH = maxY - minY + 1
const outW  = Math.max(1, Math.round(outH * cropW / cropH))

// Боксфільтр по попередньо помноженій альфі: множити треба ДО усереднення,
// інакше колір прозорих пікселів (а він довільний) підмішується в контур.
function sampleFrame(f, dst, dstW, dx0, dy0) {
  const ox = rects[f].x + minX
  const oy = rects[f].y + minY
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

const sheetW = outW * picked.length
const sheetH = outH
const out = Buffer.alloc(sheetW * sheetH * 4)
picked.forEach((f, i) => sampleFrame(f, out, sheetW, i * outW, 0))

const outPath = `public/sprites/${outName}.png`
writeFileSync(outPath, encodePng(sheetW, sheetH, out))
console.log(`✓ ${outPath}  ${sheetW}×${sheetH}  (кадр ${outW}×${outH}, кадрів ${picked.length}, пропущено ${skip})`)
console.log(keyless
  ? `  прозорість із файлу (хромакей не потрібен), рамка ${cropW}×${cropH} з ${fw}×${fh}`
  : `  фон #${[br, bg_, bb].map(v => v.toString(16).padStart(2, '0')).join('')}, рамка ${cropW}×${cropH} з ${fw}×${fh}`)
