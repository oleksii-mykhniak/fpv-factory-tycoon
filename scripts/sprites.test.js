// Набір спрайтів і скрипт, що його малює, не мають права розійтись.
//
// Стадія 13 / А5.4: без цього тесту набір розходиться зі скриптом поволі —
// хтось підправить PNG руками, хтось забуде перегенерувати після зміни
// функції малювання, і за дві стадії `npm run sprites` почне ЛАМАТИ гру
// замість того, щоб її відтворювати.
//
// Перевіряється те саме, що обіцяє DoD стадії: `rm -rf public/sprites &&
// npm run sprites` дає побайтно той самий набір. Тільки замість `rm -rf`
// генеруємо в тимчасову теку — тест, який видаляє арт із робочої копії, ніхто
// не запускатиме двічі.

import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { P, ACCENT, SPEC, UNITS_PER_PX, hex } from './palette.js'
import { quantize, trim } from './gen-sprites.js'
import { PRODUCT, LIVERY, CAT, PROP, SIGNAL, fullPalette, roleColors } from './palette.js'
import { ROLES } from '../src/defs/roles.js'
import { KIT_TYPES } from '../src/state/kits.js'
import { CHARACTER_U } from '../src/state/config.js'

const ROOT   = new URL('..', import.meta.url).pathname
const PUBLIC = join(ROOT, 'public/sprites')

describe('Стадія 13 / А5.4 — генератор відтворює набір', () => {
  let out
  beforeAll(() => {
    out = mkdtempSync(join(tmpdir(), 'sprites-'))
    execFileSync('node', ['scripts/gen-sprites.js', out], { cwd: ROOT })
  }, 60_000)

  it('малює рівно ті самі файли, що лежать у public/sprites', () => {
    const made = readdirSync(out).sort()
    const have = readdirSync(PUBLIC).filter(f => f.endsWith('.png')).sort()
    expect(made).toEqual(have)
  })

  it('і кожен — побайтно той самий', () => {
    const differ = readdirSync(out).filter(name =>
      !readFileSync(join(out, name)).equals(readFileSync(join(PUBLIC, name))))
    expect(differ).toEqual([])
  })

  it('прибирає за собою', () => {
    rmSync(out, { recursive: true, force: true })
    expect(true).toBe(true)
  })
})

describe('Стадія 13 / А5.2 — палітра звірена з asset_specs.md', () => {
  const doc = readFileSync(join(ROOT, 'docs/asset_specs.md'), 'utf8')

  // Рядок таблиці: | назва | `#hex` | де вживається |
  const inDoc = (h) => new RegExp(`\`${h}\``, 'i').test(doc)

  it.each(Object.entries({ ...ACCENT, ...SPEC }))(
    'колір %s є в таблиці документа', (_name, rgb) => {
      const h = '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('')
      expect(inDoc(h), h).toBe(true)
    })

  it('hex() і таблиця читають однаково', () => {
    expect(hex('#e08a3c')).toEqual([0xe0, 0x8a, 0x3c])
    expect(ACCENT.good).toEqual(hex('#7de07d'))
  })

  // Щільність пікселя виводиться зі зросту персонажа в грі, а не задається
  // окремим числом: якби задавалась, вона розійшлася б із `u()` мовчки.
  it('щільність пікселя виводиться зі зросту персонажа', () => {
    expect(UNITS_PER_PX).toBe(CHARACTER_U / 64)
  })

  it('спільна палітра — трійки RGB, а не рядки', () => {
    for (const [name, c] of Object.entries(P)) {
      expect(c, name).toHaveLength(3)
      for (const v of c) expect(v).toBeGreaterThanOrEqual(0)
    }
  })
})

// ── А6 — двері для іншого джерела пікселів ──────────────────────────────────
//
// Питання «чи можна генерувати картинки нейромережею» лишається відкритим, і
// пайплайн має бути готовий до відповіді «так», не чекаючи на неї. Правило:
// джерело пікселів змінне, постпроцес — ні. Ці два кроки і є той постпроцес;
// вони мають працювати ДО того, як з'явиться перша завезена заготовка, інакше
// «двері» — це мертвий код, який ніхто не пробував відчинити.
describe('Стадія 13 / А6 — хвіст постобробки', () => {
  const rgba = (...vals) => Uint8Array.from(vals)

  it('quantize притягує чужий колір до найближчого в палітрі', () => {
    // Майже P.leaf, але не він: так виглядав би піксель із завезеної картинки.
    const px = rgba(0x5e, 0xa2, 0x5a, 255)
    quantize(px)
    expect([...px.slice(0, 3)]).toEqual(P.leaf)
  })

  it('quantize не чіпає прозоре — інакше поле спрайта стало б кольоровим', () => {
    const px = rgba(0, 0, 0, 0)
    quantize(px)
    expect([...px]).toEqual([0, 0, 0, 0])
  })

  it('trim обрізає порожнє поле й лишає саму фігуру', () => {
    // 3×3, один непрозорий піксель у центрі.
    const px = new Uint8Array(3 * 3 * 4)
    px[(1 * 3 + 1) * 4 + 3] = 255
    const out = trim(px, 3, 3)
    expect([out.w, out.h]).toEqual([1, 1])
    expect(out.px[3]).toBe(255)
  })

  it('trim не падає на повністю прозорому спрайті', () => {
    const px = new Uint8Array(2 * 2 * 4)
    const out = trim(px, 2, 2)
    expect([out.w, out.h]).toEqual([2, 2])
  })
})

// ── П4 — правило перестає бути усною домовленістю ───────────────────────────
//
// Це і є те, заради чого робилась Стадія 15. Квантизація виправляє те, що вже
// намальовано; ці два тести не дають намалювати нове повз палітру. Без них усе
// повернеться через дві стадії — рівно як повернулись би емодзі без А1.
//
// Перевірок дві, і вони ловлять різне:
//
//   ДЖЕРЕЛО — жодного сирого кольору у функціях малювання. Ловить намір:
//   хтось узяв три байти замість імені з набору.
//
//   ВИХІД — жодного пікселя поза палітрою в готових PNG. Ловить наслідок,
//   якого дисципліна в джерелі принципово не ловить: `setPixel` змішує з
//   альфою, і піксель на межі двох фігур виходить проміжним, хоча обидва
//   вихідні кольори названі.
describe('Стадія 15 / П4 — колір тільки з палітри', () => {
  it('у generator-і немає жодного сирого кольору', () => {
    const src = readFileSync(join(ROOT, 'scripts/gen-sprites.js'), 'utf8')
    const raws = [...src.matchAll(/0x[0-9a-fA-F]{2}, 0x[0-9a-fA-F]{2}, 0x[0-9a-fA-F]{2}/g)]
      .map(m => m[0])
    expect(raws, `сирі кольори: ${raws.join(' | ')}`).toEqual([])
  })

  it('і жодного hex-літерала повз palette.js', () => {
    const src = readFileSync(join(ROOT, 'scripts/gen-sprites.js'), 'utf8')
    const hexes = [...src.matchAll(/hex\('#[0-9a-fA-F]{6}'\)/g)].map(m => m[0])
    expect(hexes, 'hex() має жити в palette.js, а не в функціях малювання').toEqual([])
  })

  it('кожен піксель кожного спрайта — колір із палітри', () => {
    const PAL = new Set(fullPalette(roleColors(ROLES)).map(c => c.join(',')))
    const offenders = []
    for (const name of readdirSync(PUBLIC).filter(f => f.endsWith('.png'))) {
      const { px } = decodePng(readFileSync(join(PUBLIC, name)))
      const bad = new Set()
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0) continue
        const key = `${px[i]},${px[i + 1]},${px[i + 2]}`
        if (!PAL.has(key)) bad.add(key)
      }
      if (bad.size) offenders.push(`${name}: ${[...bad].slice(0, 4).join(' ')}`)
    }
    expect(offenders).toEqual([])
  })

  it('групи значення не порожні — інакше правило тримає порожнечу', () => {
    // По рампі на КОЖЕН тип продукту, який має власний спрайт. Було зашите
    // число 4; Стадія 14 / К5 додала три типи, і число одразу збрехало. Тепер
    // це те, чим воно завжди й було по суті: у кожного типу свій колір, і
    // жоден не лишився без нього.
    const kinds = new Set(Object.values(KIT_TYPES).map(k => k.spriteKey))
    expect(Object.keys(PRODUCT)).toHaveLength(kinds.size)
    expect(Object.keys(CAT).length).toBeGreaterThan(3)
    expect(Object.keys(SIGNAL).length).toBeGreaterThan(2)
    expect(Object.keys(PROP).length).toBeGreaterThan(3)
    expect(LIVERY.player.jacket).not.toEqual(LIVERY.worker.jacket)
  })

  // Колір ролі виводиться з гри, а не дублюється (Стадія 13 / А2). Якби
  // квантизація притягнула бейдж до меблевої фарби, вона зламала б рівно те,
  // що А2 будував: кільце під ногами й значок над головою — одне число.
  it('кольори ролей у палітрі — ті самі, що в ROLES', () => {
    const PAL = new Set(fullPalette(roleColors(ROLES)).map(c => c.join(',')))
    for (const role of Object.values(ROLES)) {
      const rgb = [1, 3, 5].map(i => parseInt(role.color.slice(i, i + 2), 16))
      expect(PAL.has(rgb.join(',')), `${role.id} ${role.color}`).toBe(true)
    }
  })
})

// Мінімальний декодер PNG — рівно стільки, скільки треба, щоб прочитати
// власний вихід. Тягнути залежність заради перевірки чотирьох байтів на
// піксель було б дорожче за сорок рядків.
function decodePng(buf) {
  let i = 8, w = 0, h = 0
  const idat = []
  while (i < buf.length) {
    const len = buf.readUInt32BE(i)
    const type = buf.toString('ascii', i + 4, i + 8)
    const data = buf.subarray(i + 8, i + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4) }
    if (type === 'IDAT') idat.push(data)
    i += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const px = new Uint8Array(w * h * 4)
  const rowBytes = 1 + w * 4
  let prev = Buffer.alloc(w * 4)
  for (let y = 0; y < h; y++) {
    const filter = raw[y * rowBytes]
    const line = Buffer.from(raw.subarray(y * rowBytes + 1, y * rowBytes + 1 + w * 4))
    for (let x = 0; x < w * 4; x++) {
      const a = x >= 4 ? line[x - 4] : 0
      const b = prev[x]
      const c = x >= 4 ? prev[x - 4] : 0
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      line[x] = v & 255
    }
    for (let k = 0; k < w * 4; k++) px[y * w * 4 + k] = line[k]
    prev = line
  }
  return { w, h, px }
}
