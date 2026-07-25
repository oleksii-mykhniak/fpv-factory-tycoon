import { chromium } from 'playwright'

const URL = process.argv[2] ?? 'http://localhost:4173/'

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(`PAGEERROR: ${e.message}\n${e.stack}`))

// ── Helpers ───────────────────────────────────────────────

// Trigger zones are the only interaction now (C2), so the test drives the
// character instead of clicking. Teleport for loop tests, real keys for the
// movement tests — otherwise a pathing mistake would look like a zone bug.
const goTo = (zoneId) => page.evaluate((id) => {
  const w = globalThis.__world
  const z = w.zones.find(x => x.id === id)
  const a = w.agents.find(x => x.kind === 'player')
  a.x = z.cx; a.y = z.cy
}, zoneId)

const goAway = () => page.evaluate(() => {
  const a = globalThis.__world.agents.find(x => x.kind === 'player')
  a.x = 800; a.y = 700
})

const player = () => page.evaluate(() => {
  const a = globalThis.__world?.agents?.find(x => x.kind === 'player')
  return a ? { x: Math.round(a.x), y: Math.round(a.y), carrying: a.carrying.map(i => i.type) } : null
})

async function hold(key, ms) {
  await page.keyboard.down(key)
  await page.waitForTimeout(ms)
  await page.keyboard.up(key)
  await page.waitForTimeout(150)
}

const status = async () => ({
  money: (await page.textContent('#hud-money').catch(() => '?')).trim(),
  phase: await page.evaluate(() => globalThis.__world?.game?.phase ?? '?'),
  solderOpen: await page.locator('#solder-modal').isVisible().catch(() => false),
  trashOpen:  await page.locator('.tinder-overlay').isVisible().catch(() => false),
  piggyOpen:  await page.locator('.piggy-overlay').isVisible().catch(() => false),
  carrying: (await player())?.carrying ?? [],
})

const log = async (label) => {
  const s = await status()
  console.log(`— ${label.padEnd(30)} money=${s.money.padEnd(9)} phase=${String(s.phase).padEnd(8)} ` +
              `carry=[${s.carrying}] solder=${s.solderOpen} trash=${s.trashOpen} piggy=${s.piggyOpen}`)
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

const seedState = (upgrades, extra = {}) => ({
  version: 1,
  savedAt: Date.now(),
  state: {
    money: 1000, phase: 'IDLE', activeKit: null, solderPoints: [], assemblyQuality: null,
    coldSolderPenalty: 0, lastPiggyAt: null, locationId: 'workshop', onboarded: true,
    scrapAvailable: false, deliveries: [],
    upgrades: {
      priceMultiplier: 1, solderingLevel: 0, workerLevel: 0,
      consumablesLevel: 0, storageLevel: 0, logisticsLevel: 0, ...upgrades,
    },
    ...extra,
  },
  salesLog: [],
})

// ── A. The whole loop on foot, zero taps ──────────────────
console.log('\n### A. Full cycle through trigger zones (no taps at all)')
await boot(seedState({ solderingLevel: 3 }))   // bench solders itself; player hauls
await log('boot')
await orderFirstKit()
await log('ordered')
await page.waitForTimeout(5000)
await log('courier arrived')

await goTo('slot0')
await page.waitForTimeout(700)
const aPick = await log('stood in the street slot')

await goTo('bench')
await page.waitForTimeout(2000)
const aDrop = await log('stood at the bench')

await page.waitForTimeout(12000)
const aReady = await log('bench finished on its own')

await goAway(); await page.waitForTimeout(600)
await goTo('bench')
await page.waitForTimeout(2000)
const aTake = await log('collected the drone')

await goTo('mailbox')
await page.waitForTimeout(2500)
const aSold = await log('stood at the mailbox')

// ── B. Zones open the mini-games ──────────────────────────
console.log('\n### B. Zones open the mini-games')
await boot(seedState({}))          // manual iron
await orderFirstKit()
await page.waitForTimeout(5000)
await goTo('slot0'); await page.waitForTimeout(600)
await goTo('bench'); await page.waitForTimeout(3500)
const bSolder = await log('bench zone, manual iron')

await boot(seedState({}, { money: 5 }))
await goTo('piggy'); await page.waitForTimeout(900)
const bPiggy = await log('piggy zone while broke')

await boot(seedState({}, { scrapAvailable: true }))
await goTo('trashbin'); await page.waitForTimeout(2000)
const bTrash = await log('trash zone with salvage ordered')

// ── C. Movement, collisions, camera (C1 regression) ───────
console.log('\n### C. Movement (WASD)')
await boot(seedState({}))
const c0 = await player()
await hold('KeyD', 900); const cRight = await player()
await hold('KeyA', 900); const cBack  = await player()
await hold('KeyA', 4000); const cWall = await player()
console.log(`  spawn ${c0.x} → right ${cRight.x} → back ${cBack.x} → wall ${cWall.x}`)

await boot(seedState({}))
await hold('KeyW', 4000); const cBench = await player()
const camBefore = await page.evaluate(() => globalThis.__refs.scene.camera.pos.y)
await hold('KeyS', 1200)
const camAfter = await page.evaluate(() => globalThis.__refs.scene.camera.pos.y)
console.log(`  bench stop y=${cBench.y}; camera ${camBefore.toFixed(0)} → ${camAfter.toFixed(0)}`)

// The real route: line up with the doorway, walk out, pick the box up on foot.
await boot(seedState({}))
await orderFirstKit()
await page.waitForTimeout(5000)
await page.evaluate(() => {
  const a = globalThis.__world.agents.find(x => x.kind === 'player')
  a.x = 420; a.y = 900
})
await hold('KeyS', 2000)
const cWalked = await player()
console.log(`  walked out of the door: ${JSON.stringify(cWalked)}`)

await page.screenshot({ path: '.smoke.png' })

console.log('\n=== console errors ===')
console.log(errors.length ? errors.join('\n---\n') : '(none)')

const money = (s) => parseFloat(s.money.replace('$', ''))
const checks = [
  ['A: slot zone put the box in hand',    aPick.carrying.includes('kit_box')],
  ['A: bench zone started assembly',      aDrop.phase === 'ASSEMBLY' && aDrop.carrying.length === 0],
  ['A: bench finished by itself',         aReady.phase === 'READY'],
  ['A: bench zone handed over the drone', aTake.carrying.includes('drone')],
  ['A: mailbox zone sold it',             aSold.phase === 'IDLE' && money(aSold) > money(aReady)],
  ['B: bench zone opened the mini-game',  bSolder.solderOpen === true],
  ['B: piggy zone opened the piggy game', bPiggy.piggyOpen === true],
  ['B: trash zone opened the swipe game', bTrash.trashOpen === true],
  ['C: moves right on D',                 cRight.x > c0.x + 100],
  ['C: moves back left on A',             cBack.x < cRight.x - 100],
  ['C: stopped by the left wall',         cWall.x >= 24 && cWall.x <= 60],
  ['C: stopped by the workbench',         cBench.y > 420 && cBench.y < 500],
  ['C: camera follows the player',        camAfter > camBefore + 100],
  ['C: walked out and grabbed the box',   cWalked.y > 1050 && cWalked.carrying.includes('kit_box')],
  ['no console errors',                   errors.length === 0],
]
console.log('\n=== checks ===')
for (const [name, ok] of checks) console.log(`${ok ? '✅' : '❌'} ${name}`)

await browser.close()
process.exit(checks.every(([, ok]) => ok) ? 0 : 1)
