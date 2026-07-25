import { chromium } from 'playwright'

const URL = process.argv[2] ?? 'http://localhost:4173/'

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(`PAGEERROR: ${e.message}\n${e.stack}`))

// World fractions → screen pixels, mirroring scene.js layout and camera zoom.
async function tapWorld(fx, fy) {
  const p = await page.evaluate(({ fx, fy }) => {
    const c = document.getElementById('game-canvas')
    const r = c.getBoundingClientRect()
    const zoom = Math.max(0.78, Math.min(0.90, r.height / 980))
    return {
      x: r.left + (fx - 0.5) * r.width * zoom + r.width / 2,
      y: r.top + (fy - 0.5) * r.height * zoom + r.height / 2,
    }
  }, { fx, fy })
  await page.mouse.click(p.x, p.y)
}

const ROOM = 0.70
const SLOT0   = [0.38, ROOM + 0.30 * 0.35]
const BENCH   = [0.50, ROOM * 0.35]
const MAILBOX = [0.16, ROOM + 0.30 * 0.62]

const status = async () => ({
  money: (await page.textContent('#hud-money').catch(() => '?')).trim(),
  hint:  (await page.textContent('#hud-hint').catch(() => '?')).trim(),
  solderOpen: await page.locator('#solder-modal').isVisible().catch(() => false),
  phase: await page.evaluate(() => globalThis.__world?.game?.phase ?? '?'),
  sim: await page.evaluate(() => {
    const w = globalThis.__world
    if (!w) return '?'
    const d = (w.game.deliveries ?? []).map(x => `${x.slotIndex}:${x.status}`).join(',')
    const r = globalThis.__refs
    const a = r?.worker?.actor
    const pos = a ? `(${a.pos.x.toFixed(0)},${a.pos.y.toFixed(0)})` : '?'
    return `desired=${w.worker.desired} fsm=${r?.worker?.getState?.()} pos=${pos} actions=${a?.actions?.getQueue?.()?.isComplete?.() ?? '?'} deliveries=[${d}]`
  }),
})
const log = async (label) => {
  const s = await status()
  console.log(`— ${label.padEnd(26)} money=${s.money.padEnd(9)} phase=${String(s.phase).padEnd(8)} solder=${s.solderOpen} hint="${s.hint}"\n    ${s.sim}`)
  return s
}

async function boot(seed) {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate((seed) => {
    localStorage.clear()
    if (seed) localStorage.setItem('fpv_factory_save', JSON.stringify(seed))
  }, seed)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.click('#onboarding').catch(() => {})
  await page.waitForTimeout(300)
}

async function orderFirstKit() {
  await page.click('#ab-shop')
  await page.waitForTimeout(400)
  await page.locator('button', { hasText: 'Замовити' }).first().click()
  await page.waitForTimeout(600)
}

// ── Scenario A — MANUAL: tap the arrived box, expect the mini-game ─────
console.log('\n### A. MANUAL cycle (tap-driven)')
await boot(null)
await log('boot')
await orderFirstKit()
await log('ordered')
await page.waitForTimeout(5000)
await log('courier arrived')
await tapWorld(...SLOT0)
await page.waitForTimeout(600)
await log('tapped street slot')
await page.waitForTimeout(9000)
const a = await log('worker reached bench')
await tapWorld(...BENCH)
await page.waitForTimeout(800)
const aSolder = await log('tapped bench → mini-game')

// ── Scenario B — full AUTO: nothing but ordering and selling ───────────
console.log('\n### B. AUTO cycle (sim-driven, no taps during assembly)')
const seed = {
  version: 1,
  savedAt: Date.now(),
  state: {
    money: 1000, phase: 'IDLE', activeKit: null, solderPoints: [], assemblyQuality: null,
    coldSolderPenalty: 0, lastPiggyAt: null, locationId: 'workshop', onboarded: true,
    scrapAvailable: false, deliveries: [],
    upgrades: { priceMultiplier: 1, solderingLevel: 3, workerLevel: 2, consumablesLevel: 0, storageLevel: 0, logisticsLevel: 0 },
  },
  salesLog: [],
}
await boot(seed)
const b0 = await log('boot (auto shop)')
await orderFirstKit()
await log('ordered')
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(4000)
  await log(`  +${(i + 1) * 4}s`)
}
const bReady = await log('after assembly window')
await tapWorld(...BENCH)
await page.waitForTimeout(9000)
const bSold = await log('tapped bench → sell')

await page.screenshot({ path: '.smoke.png' })

console.log('\n=== console errors ===')
console.log(errors.length ? errors.join('\n---\n') : '(none)')

const checks = [
  ['A: manual pickup started assembly', a.phase === 'ASSEMBLY'],
  ['A: bench tap opened the mini-game', aSolder.solderOpen === true],
  ['B: assembly completed on its own',  bReady.phase === 'READY'],
  ['B: sale paid out',                  parseFloat(bSold.money.replace('$', '')) > parseFloat(b0.money.replace('$', '')) - 72],
  ['no console errors',                 errors.length === 0],
]
console.log('\n=== checks ===')
for (const [name, ok] of checks) console.log(`${ok ? '✅' : '❌'} ${name}`)

await browser.close()
process.exit(checks.every(([, ok]) => ok) ? 0 : 1)
