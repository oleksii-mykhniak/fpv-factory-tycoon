// Той самий smoke, але проти ЗІБРАНОЇ гри, а не dev-сервера (фікс «збірка ≠ dev», 2026-09-11).
//
// Приводом стала анімація «+$47» над скринькою: у `npm run dev` вона працювала,
// а `vite build` вирізав її тіло при tree-shaking. Увесь smoke ганявся по dev,
// де tree-shaking не виконується, тож 1300 рядків перевірок бачили здорову гру,
// а на телефоні напис висів вічно. Усе, що перевіряється лише в dev, про
// збірку не говорить нічого.
//
// Режим `debug`, а не звичайний build: smoke лазить у `globalThis.__refs`, і
// саме цей режим їх лишає (див. `main.js`). Решта конвеєра — та сама.
import { execFileSync, spawn } from 'node:child_process'
import { rmSync } from 'node:fs'

const OUT  = 'dist-smoke'
const PORT = 4174
const URL  = `http://localhost:${PORT}/`

console.log('▸ збираю гру (mode=debug)…')
execFileSync('npx', ['vite', 'build', '--mode', 'debug', '--outDir', OUT, '--logLevel', 'error'],
  { stdio: 'inherit' })

console.log(`▸ піднімаю preview на ${URL}`)
const preview = spawn('npx', ['vite', 'preview', '--outDir', OUT, '--port', String(PORT)],
  { stdio: 'ignore' })

const stop = () => {
  preview.kill()
  rmSync(OUT, { recursive: true, force: true })
}
process.on('exit', stop)
process.on('SIGINT', () => { stop(); process.exit(130) })

// Чекаємо, поки порт віддасть сторінку: фіксований sleep або ловить зелене на
// ще не піднятому сервері, або марно стоїть на швидкій машині.
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(URL)).ok) break } catch {}
  await new Promise(r => setTimeout(r, 500))
}

console.log('▸ smoke по збірці\n')
let code = 0
try { execFileSync('node', ['scripts/smoke.mjs', URL], { stdio: 'inherit' }) }
catch (e) { code = e.status ?? 1 }
stop()
process.exit(code)
