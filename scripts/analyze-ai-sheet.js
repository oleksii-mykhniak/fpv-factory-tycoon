// Розбір аркуша, згенерованого ШІ: де в ньому цикл і скільки кадрів лишити.
//
// Запуск:
//   node scripts/analyze-ai-sheet.js <аркуш.png> [<аркуш.json>] [--rows=6] [--cols=6]
//                                     [--min-frames=8] [--max-frames=N]
//
// Навіщо окремий крок перед імпортом. Генератор віддає 36 кадрів, і спокуса —
// узяти всі. Але 36 кадрів НЕ є циклом: аркуш містить то два кроки, то два з
// половиною, а на початку буває розгін — кілька майже однакових кадрів, поки
// персонаж розпрямляється. Узяти все означає дві біди одразу: зайвий вміст і
// стрибок на стику, коли останній кадр змінюється першим.
//
// Скрипт шукає ВІКНО [start, start+p), у якому останній кадр переходить у
// перший так само м'яко, як кадри переходять один в одного всередині вікна.
// Це і є цикл: одне вікно дає і безшовність, і мінімум кадрів.
//
// Міра «схожості» — не попіксельна різниця (вона шумить на контурі), а сітка
// 32×32 із середньою яскравістю, помноженою на альфу. Груба навмисне: важлива
// поза, а не піксель.
import { readFileSync } from 'fs'
import { decodePng } from './png-decode.js'

const args = process.argv.slice(2)
const flag = (name, dflt) => {
  const hit = args.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
const positional = args.filter(a => !a.startsWith('--'))
const [pngPath, jsonPath] = positional
if (!pngPath) {
  console.error('usage: node scripts/analyze-ai-sheet.js <аркуш.png> [<аркуш.json>] [--rows=6] [--cols=6]')
  process.exit(1)
}

const rows = Number(flag('rows', 6))
const cols = Number(flag('cols', 6))
const total = rows * cols

const img = decodePng(readFileSync(pngPath))
const fw = Math.floor(img.width / cols)
const fh = Math.floor(img.height / rows)
const px = img.pixels

// JSON від генератора (Ludo.ai) — не обов'язковий, але з нього видно тривалість
// кадру в мілісекундах і те, чи сітка справді така, як обіцяє ім'я файлу.
let duration = null
if (jsonPath) {
  const atlas = JSON.parse(readFileSync(jsonPath, 'utf8'))
  const frames = Object.values(atlas.frames ?? {})
  duration = frames[0]?.duration ?? null
  const bad = frames.find(f => f.frame.w !== fw || f.frame.h !== fh)
  if (bad) console.warn(`! JSON описує кадр ${bad.frame.w}×${bad.frame.h}, а --rows/--cols дають ${fw}×${fh}`)
  console.log(`JSON: кадрів ${frames.length}, кадр ${frames[0]?.frame.w}×${frames[0]?.frame.h}, тривалість ${duration} мс`)
}

// Підпис кадру: 32×32 середньої яскравості по альфі.
const N = 32
function signature(f) {
  const ox = (f % cols) * fw, oy = Math.floor(f / cols) * fh
  const v = new Float64Array(N * N)
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      let s = 0, n = 0
      for (let y = Math.floor(gy * fh / N); y < Math.floor((gy + 1) * fh / N); y += 3) {
        for (let x = Math.floor(gx * fw / N); x < Math.floor((gx + 1) * fw / N); x += 3) {
          const p = ((oy + y) * img.width + ox + x) * 4
          s += px[p + 3] / 255 * (0.3 * px[p] + 0.6 * px[p + 1] + 0.1 * px[p + 2] + 40)
          n++
        }
      }
      v[gy * N + gx] = s / n
    }
  }
  return v
}
const sig = [...Array(total).keys()].map(signature)
const dist = (a, b) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i])
  return s / a.length
}
const motion = sig.slice(1).map((v, i) => dist(sig[i], v))

// Розгін: найдовша низка майже нерухомих кадрів у першій половині аркуша.
// Саме низка, а не «поки не почався рух»: нульовий кадр буває викидом, і
// лічильник, що спиняється на першому ж стрибку, розгону не бачить зовсім.
const medAll = [...motion].sort((a, b) => a - b)[Math.floor(motion.length / 2)]
const STILL = medAll * 0.25
let ramp = 0
for (let i = 0, run = 0; i < Math.floor(motion.length / 2); i++) {
  run = motion[i] < STILL ? run + 1 : 0
  // +1: кадр, на якому рух відновився, ще належить розгону.
  if (run >= 3 && i + 2 > ramp) ramp = i + 2
}

console.log(`PNG: ${img.width}×${img.height}, сітка ${cols}×${rows}, кадр ${fw}×${fh}`)
console.log(`рух між кадрами (медіана ${medAll.toFixed(1)}): ${motion.map(m => m.toFixed(1)).join(' ')}`)
console.log(ramp > 0 ? `розгін: кадри 0..${ramp - 1} майже нерухомі` : 'розгін: немає')

// Вікна-кандидати. Стик оцінюємо ВІДНОСНО руху всередині вікна: аркуш ходьби
// рухається різко, аркуш айдлу — ледь-ледь, і спільного абсолютного порога для
// них не буває.
//
// Вікно мусить ще й РУХАТИСЯ. Без цієї умови перемагає шматок розгону: там
// сусідні кадри майже однакові, тож будь-який стик здається малим — і скрипт
// радить вирізати саме те місце, через яке все й затіялося.
//
// Скільки кадрів шукати, вирішує виклик. Стеля (`--max-frames`) потрібна не
// заради розміру файлу, а тому, що на АРКУШІ АЙДЛУ рахунок цього скрипта веде
// не туди: сплячий кіт ворушиться на 1.7 при стику 2.6, тож «майже безшовним»
// виходить вікно на 34 кадри — тобто ввесь аркуш. Формально це правда, по суті
// — дві секунди дихання, які на екрані розміром із долоню не відрізнити від
// восьми кадрів. Питання «а наскільки КОРОТКИМ може бути цикл» цей скрипт
// ставити вмів, але відповідь ховав: сортування за стиком виносило її за
// п'ятірку.
const MIN_FRAMES = Number(flag('min-frames', 8))
const MAX_FRAMES = Number(flag('max-frames', total))
const cands = []
for (let start = 0; start + MIN_FRAMES <= total; start++) {
  for (let p = MIN_FRAMES; p <= Math.min(MAX_FRAMES, total - start); p++) {
    const win = []
    for (let i = start; i < start + p - 1; i++) win.push(dist(sig[i], sig[i + 1]))
    const med = [...win].sort((a, b) => a - b)[Math.floor(win.length / 2)]
    if (med < medAll * 0.6) continue
    const seam = dist(sig[start + p - 1], sig[start])
    cands.push({ start, p, seam, med, excess: seam - med })
  }
}
if (!cands.length) {
  console.error(`жодного рухомого вікна в ${MIN_FRAMES}..${MAX_FRAMES} кадрів: аркуш статичний?`)
  process.exit(1)
}
// За рівних стиків виграє коротше вікно: менше кадрів — менший файл.
cands.sort((a, b) => a.excess - b.excess || a.p - b.p)

console.log('\nнайкращі цикли (стик — наскільки останній кадр далекий від першого):')
for (const c of cands.slice(0, 5)) {
  console.log(`  --skip=${c.start} --frames=${c.p}   стик ${c.seam.toFixed(1)} проти ${c.med.toFixed(1)} всередині`
    + (c.excess <= 0 ? '  ← безшовно' : ''))
}

const wholeStart = ramp
const wholeWin = []
for (let i = wholeStart; i < total - 1; i++) wholeWin.push(dist(sig[i], sig[i + 1]))
const wholeMed = [...wholeWin].sort((a, b) => a - b)[Math.floor(wholeWin.length / 2)]
console.log(`  весь аркуш --skip=${wholeStart} --frames=${total - wholeStart}`
  + `   стик ${dist(sig[total - 1], sig[wholeStart]).toFixed(1)} проти ${wholeMed.toFixed(1)} всередині`)

const best = cands[0]
console.log(`\nрекомендація: --skip=${best.start} --frames=${best.p}`
  + (duration ? `, frameMs ≈ ${duration} (з JSON)` : ''))
