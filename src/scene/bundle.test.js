import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// Перевірка ЗІБРАНОЇ гри, а не вихідників.
//
// Причина є в репозиторії: анімація «+$47» над скринькою працювала в `npm run
// dev` і була ВИРІЗАНА з `vite build`. Rollup згорнув `st.live: false` у
// літералі в константу, вирішив, що `if (!st.live) return` — завжди вихід, і
// викинув усе тіло обробника. У грі напис висів вічно; жоден із 1300 рядків
// smoke цього не бачив, бо smoke ганяє dev-сервер, де tree-shaking не
// виконується.
//
// Тому тут ми дивимось на байти, які реально їдуть на телефон. Збірка без
// мініфікації: імена й формули лишаються читними, а tree-shaking — той самий.
const OUT = 'dist-test'
let bundle = ''

beforeAll(() => {
  execFileSync('npx', ['vite', 'build', '--outDir', OUT, '--minify', 'false', '--logLevel', 'error'],
    { stdio: 'pipe' })
  const dir = join(OUT, 'assets')
  const js  = readdirSync(dir).filter(f => f.endsWith('.js'))
  bundle = js.map(f => readFileSync(join(dir, f), 'utf-8')).join('\n')
}, 180_000)

describe('збірка несе той самий код, що й вихідники', () => {
  it('анімація «+$47» доїжджає до бандла', () => {
    expect(bundle).toContain('function floatPose')
    // Формула підйому — те, що rollup зрізав минулого разу.
    expect(bundle).toContain('(1 - (1 - t) * (1 - t))')
    // І цикл, який її крутить: саме форма «стан із масиву», а не замикання.
    expect(bundle).toMatch(/for \(const st of floaters\)/)
  })

  it('жоден обробник подій не приїхав із порожнім тілом', () => {
    // `(evt) => { return; }` — підпис вирізаного тіла. Шукаємо по всьому
    // бандлу: та сама пастка спрацює на будь-якому кадровому обробнику.
    const gutted = [...bundle.matchAll(
      /\.on\(\s*["'][a-z]+["']\s*,\s*(?:\([^)]*\)|\w+)\s*=>\s*\{\s*return;?\s*\}/g)]
    expect(gutted.map(m => m[0])).toEqual([])
  })

  it('кадровий час у збірці читається з події, а не вгадується', () => {
    // `frameMs` мусить лишитись реальним читанням `elapsed`: константа 16
    // замість нього — це знову анімації, що йдуть не в такт реальному fps.
    expect(bundle).toMatch(/elapsed\)\s*\?\?/)
  })
})

afterAll(() => rmSync(OUT, { recursive: true, force: true }))
