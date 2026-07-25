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
  phase: await page.evaluate(() => globalThis.__world?.game?.stations?.[0]?.phase ?? '?'),
  stations: await page.evaluate(() =>
    (globalThis.__world?.game?.stations ?? []).map(s => s.phase).join('/')),
  solderOpen: await page.locator('#solder-modal').isVisible().catch(() => false),
  trashOpen:  await page.locator('.tinder-overlay').isVisible().catch(() => false),
  piggyOpen:  await page.locator('.piggy-overlay').isVisible().catch(() => false),
  carrying: (await player())?.carrying ?? [],
})

const log = async (label) => {
  const s = await status()
  console.log(`— ${label.padEnd(30)} money=${s.money.padEnd(9)} phase=${String(s.phase).padEnd(8)} ` +
              `carry=[${s.carrying}] stations=${s.stations} solder=${s.solderOpen} trash=${s.trashOpen} piggy=${s.piggyOpen}`)
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
    money: 1000, lastPiggyAt: null, locationId: 'workshop', onboarded: true,
    scrapAvailable: false, deliveries: [],
    stations: [{ id: 'station-0', defId: 'workbench', phase: 'IDLE', kitId: null,
                 solderPoints: [], quality: null, coldPenalty: 0 }],
    upgrades: {
      priceMultiplier: 1, solderingLevel: 0, workerLevel: 0,
      consumablesLevel: 0, storageLevel: 0, logisticsLevel: 0, benchLevel: 0, ...upgrades,
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

await goTo('zone-station-0')
await page.waitForTimeout(2000)
const aDrop = await log('stood at the bench')

await page.waitForTimeout(12000)
const aReady = await log('bench finished on its own')

await goAway(); await page.waitForTimeout(600)
await goTo('zone-station-0')
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
await goTo('zone-station-0'); await page.waitForTimeout(3500)
const bSolder = await log('bench zone, manual iron')

await boot(seedState({}, { money: 5 }))
await goTo('piggy'); await page.waitForTimeout(900)
const bPiggy = await log('piggy zone while broke')

await boot(seedState({}, { scrapAvailable: true }))
await goTo('trashbin'); await page.waitForTimeout(2000)
const bTrash = await log('trash zone with salvage ordered')

// ── D. Two stations at once (C3) ──────────────────────────
console.log('\n### D. Two benches in parallel')
await boot(seedState({ solderingLevel: 3, benchLevel: 1, storageLevel: 1 }))
const dCount = await page.evaluate(() => globalThis.__world.game.stations.length)
const dZones = await page.evaluate(() =>
  globalThis.__world.zones.filter(z => z.kind === 'bench').map(z => z.id))
console.log(`  stations built: ${dCount}; bench zones: ${dZones.join(', ')}`)

// Two orders before either is collected: with storage level 1 they occupy
// slot 0 and slot 1 simultaneously.
await orderFirstKit()
await orderFirstKit()
await page.waitForTimeout(5600)
await log('two couriers arrived')

await goTo('slot0'); await page.waitForTimeout(700)
const dCarry = await log('first box picked up')
await goTo('zone-station-0'); await page.waitForTimeout(1800)
await log('first kit on station-0')

await goTo('slot1'); await page.waitForTimeout(700)
await log('second box picked up')
await goTo('zone-station-1'); await page.waitForTimeout(1800)
const dBoth = await log('second kit on station-1')

await page.waitForTimeout(14000)
const dDone = await log('both benches worked')

// ── E. Navigation (C4) ────────────────────────────────────
console.log('\n### E. A* navigation')
await boot(seedState({ benchLevel: 1 }))
const eGrid = await page.evaluate(() => {
  const g = globalThis.__world.navGrid
  const blocked = g.data.reduce((n, v) => n + v, 0)
  return { cols: g.cols, rows: g.rows, cell: g.cell, blocked }
})
console.log(`  grid ${eGrid.cols}×${eGrid.rows} @${eGrid.cell}px, ${eGrid.blocked} blocked cells`)

// Walk the player from the flat, through the door, to the mailbox — a route
// that has to round two benches and thread the doorway.
await page.evaluate(() => {
  const w = globalThis.__world
  const a = w.agents.find(x => x.kind === 'player')
  a.x = 500; a.y = 150            // above the top bench
  a.pathTarget = { x: 170, y: 1300 }
})
const eStart = Date.now()
await page.waitForFunction(() => {
  const a = globalThis.__world.agents.find(x => x.kind === 'player')
  return Math.hypot(a.x - 170, a.y - 1300) < 45
}, null, { timeout: 40000 }).catch(() => {})
const eArrived = await page.evaluate(() => {
  const w = globalThis.__world
  const a = w.agents.find(x => x.kind === 'player')
  const stuck = (w.obstacles ?? []).some(b =>
    Math.abs(a.x - b.cx) < a.halfW + b.w / 2 && Math.abs(a.y - b.cy) < a.halfH + b.h / 2)
  return { x: Math.round(a.x), y: Math.round(a.y), stuck, cached: w.pathCache.size }
})
console.log(`  arrived at (${eArrived.x},${eArrived.y}) in ${((Date.now() - eStart) / 1000).toFixed(1)}s, ` +
            `inside obstacle: ${eArrived.stuck}, cached routes: ${eArrived.cached}`)

// ── F. Hired workers run the shop (C5) ────────────────────
console.log('\n### F. The shop runs without the player')
await boot(seedState({}, { money: 20000 }))
// Hire all three through the real UI, not by seeding state.
await page.click('#ab-upgrade'); await page.waitForTimeout(500)
for (const role of ['courier', 'tech', 'seller']) {
  await page.click(`[data-hire="${role}"]`)
  await page.waitForTimeout(400)
}
await page.click('#upgrade-close'); await page.waitForTimeout(300)
const fHired = await page.evaluate(() => ({
  roster: globalThis.__world.game.workers.map(w => w.role),
  agents: globalThis.__world.agents.filter(a => a.kind === 'worker').length,
}))
console.log(`  hired: ${fHired.roster.join(', ')} (${fHired.agents} agents in the world)`)

// Park the player in a corner: nothing below is the player's doing.
await page.evaluate(() => {
  const a = globalThis.__world.agents.find(x => x.kind === 'player')
  a.x = 900; a.y = 500
})

const fBefore = await page.evaluate(() => globalThis.__world.game.money)
for (let i = 0; i < 3; i++) {
  await orderFirstKit()
  await page.waitForTimeout(22000)
  const st = await page.evaluate(() => ({
    sales: globalThis.__world.salesLog.length,
    money: Math.round(globalThis.__world.game.money),
    station: globalThis.__world.game.stations[0].phase,
    jobs: globalThis.__world.jobs.length,
  }))
  console.log(`  order ${i + 1}: sales=${st.sales} money=${st.money} station=${st.station} jobs=${st.jobs}`)
}
await page.waitForTimeout(8000)
const fDone = await page.evaluate(() => {
  const w = globalThis.__world
  const p = w.agents.find(a => a.kind === 'player')
  return {
    sales: w.salesLog.length,
    money: Math.round(w.game.money),
    playerMoved: Math.hypot(p.x - 900, p.y - 500) > 30,
  }
})
console.log(`  final: ${fDone.sales} sales, money ${fBefore} → ${fDone.money}, player moved: ${fDone.playerMoved}`)

// ── C. Movement, collisions, camera (C1 regression) ───────
console.log('\n### C. Movement (WASD)')
await boot(seedState({}))
const c0 = await player()
await hold('KeyD', 900); const cRight = await player()
await hold('KeyA', 900); const cBack  = await player()
await hold('KeyA', 4000); const cWall = await player()
console.log(`  spawn ${c0.x} → right ${cRight.x} → back ${cBack.x} → wall ${cWall.x}`)

// Stations sit at x≈500 (C3), so line up with them before walking north.
await boot(seedState({}))
await page.evaluate(() => {
  const a = globalThis.__world.agents.find(x => x.kind === 'player')
  a.x = 500; a.y = 950
})
await hold('KeyW', 4000); const cBench = await player()

// Camera follow, measured well away from the world's clamped edges.
await page.evaluate(() => {
  const a = globalThis.__world.agents.find(x => x.kind === 'player')
  a.x = 500; a.y = 300
})
await page.waitForTimeout(700)
const camBefore = await page.evaluate(() => globalThis.__refs.scene.camera.pos.y)
await hold('KeyS', 1500)
await page.waitForTimeout(400)
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
  ['C: stopped by a workbench',           cBench.y > 260 && cBench.y < 300],
  ['C: camera follows the player',        camAfter > camBefore + 150],
  ['C: walked out and grabbed the box',   cWalked.y > 1050 && cWalked.carrying.includes('kit_box')],
  ['D: two stations were built',          dCount === 2],
  ['D: each station got its own zone',    dZones.length === 2],
  ['D: box picked up from a street slot',  dCarry.carrying.includes('kit_box')],
  ['D: both stations busy at once',       dBoth.stations === 'ASSEMBLY/ASSEMBLY'],
  ['D: both finished independently',      dDone.stations === 'READY/READY'],
  ['E: nav grid rasterised the world',    eGrid.blocked > 0 && eGrid.cols > 30],
  ['E: pathed across the flat and out',   Math.hypot(eArrived.x - 170, eArrived.y - 1300) < 60],
  ['E: never ended inside geometry',      eArrived.stuck === false],
  ['E: routes were cached',               eArrived.cached > 0],
  ['F: hired three workers via the UI',   fHired.roster.length === 3 && fHired.agents === 3],
  ['F: workers sold drones on their own', fDone.sales >= 2],
  ['F: the player never moved',           fDone.playerMoved === false],
  ['no console errors',                   errors.length === 0],
]
console.log('\n=== checks ===')
for (const [name, ok] of checks) console.log(`${ok ? '✅' : '❌'} ${name}`)

await browser.close()
process.exit(checks.every(([, ok]) => ok) ? 0 : 1)
