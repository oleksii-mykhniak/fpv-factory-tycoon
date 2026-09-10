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
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { P, ACCENT, SPEC, UNITS_PER_PX, hex } from './palette.js'
import { quantize, trim } from './gen-sprites.js'
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
