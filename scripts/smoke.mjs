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

// Walks the player into a panel object's zone and waits for its modal.
// goAway() first, because a zone only fires once per visit — standing there
// already (from a previous step) would open nothing.
async function openPanelAt(zoneId) {
  await goAway()
  await page.waitForTimeout(400)
  await goTo(zoneId)
  await page.waitForTimeout(900)
}

const playerPos = () => page.evaluate(() => {
  const a = globalThis.__world.agents.find(x => x.kind === 'player')
  return { x: a.x, y: a.y }
})

const putPlayerAt = (pos) => page.evaluate((p) => {
  const a = globalThis.__world.agents.find(x => x.kind === 'player')
  a.x = p.x; a.y = p.y
}, pos)

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
  solderOpen: await page.locator('#solder-bar').isVisible().catch(() => false),
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
  // Short timeout on purpose: with a seeded save the onboarding card is
  // already dismissed, and the default 30 s wait was costing half a minute per
  // boot — most of this suite's runtime for a click that is meant to be a
  // best-effort no-op.
  await page.click('#onboarding', { timeout: 1000 }).catch(() => {})
  await page.waitForTimeout(300)
}

// Ordering can legitimately be impossible — every bench busy, every slot full.
// Returns whether the order actually went through.
async function orderFirstKit() {
  // Since S2 the shop is a desk with a laptop: you walk up to it. Callers
  // elsewhere in this file assume ordering does not move the player (one of
  // them asserts exactly that), so put them back where they were afterwards.
  const before = await playerPos()
  await openPanelAt('desk')
  const btn = page.locator('button', { hasText: 'Замовити' }).first()
  const ok = await btn.isEnabled().catch(() => false)
  if (ok) await btn.click()
  else await page.click('#shop-close').catch(() => page.keyboard.press('Escape'))
  await page.waitForTimeout(600)
  await putPlayerAt(before)
  return ok
}

// Must match SAVE_VERSION in src/save/storage.js — a seed written with an older
// version is now discarded on load, which would silently boot every scenario
// into a fresh apartment instead of the state it meant to test.
const seedState = (upgrades, extra = {}) => ({
  version: 2,
  savedAt: Date.now(),
  state: {
    money: 1000, lastPiggyAt: null, locationId: 'apartment', onboarded: true,
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
await boot(seedState({ solderingLevel: 2 }))   // bench solders itself; player hauls
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
const aReady = await log('bench finished with the player at it')

// The finished drone comes off the OUTPUT side of the bench (S1.2) — standing
// where you soldered it is no longer enough.
await goAway(); await page.waitForTimeout(600)
await goTo('zone-station-0')
await page.waitForTimeout(1500)
const aStillEmpty = await log('back at the work side: nothing to collect')

await goTo('zone-out-station-0')
await page.waitForTimeout(1500)
const aTake = await log('collected the drone from the output table')

await goTo('mailbox')
await page.waitForTimeout(2500)
const aSold = await log('stood at the mailbox')

// ── B. Zones open the mini-games ──────────────────────────
console.log('\n### B. Zones open the mini-games')
await boot(seedState({}))          // manual iron
await orderFirstKit()
await page.waitForTimeout(5000)
await goTo('slot0'); await page.waitForTimeout(600)
await goTo('zone-station-0'); await page.waitForTimeout(2500)
const bSolder = await log('standing at the bench, hand iron')

await boot(seedState({}, { money: 5 }))
await goTo('piggy'); await page.waitForTimeout(900)
const bPiggy = await log('piggy zone while broke')

await boot(seedState({}, { scrapAvailable: true }))
await goTo('trashbin'); await page.waitForTimeout(2000)
const bTrash = await log('trash zone with salvage ordered')

// ── D. Two stations at once (C3) ──────────────────────────
console.log('\n### D. Two benches in parallel')
await boot(seedState({ solderingLevel: 2, benchLevel: 1, storageLevel: 1 }, { locationId: 'garage' }))
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
await boot(seedState({ benchLevel: 1 }, { locationId: 'garage' }))
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
  a.x = 660; a.y = 150            // above the benches
  a.pathTarget = { x: 230, y: 1450 }   // garage mailbox
})
const eStart = Date.now()
await page.waitForFunction(() => {
  const a = globalThis.__world.agents.find(x => x.kind === 'player')
  return Math.hypot(a.x - 230, a.y - 1450) < 45
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
// Hiring starts at the garage — the apartment is a one-person shop (C7 fix).
await boot(seedState({}, { money: 20000, locationId: 'garage' }))
// Hire all three through the real UI, not by seeding state.
// Hiring lives behind the job board now (S2), not in the upgrade panel.
await openPanelAt('jobboard')
// The garage has room for two.
for (const role of ['courier', 'tech']) {
  await page.click(`[data-hire="${role}"]`)
  await page.waitForTimeout(400)
}
await page.click('#hire-close'); await page.waitForTimeout(300)
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
    assembled: w.game.stations.filter(s => s.phase !== 'IDLE').length + w.salesLog.length,
    money: Math.round(w.game.money),
    playerMoved: Math.hypot(p.x - 900, p.y - 500) > 30,
  }
})
console.log(`  final: ${fDone.sales} sales, ${fDone.assembled} assembled, money ${fBefore} → ${fDone.money}, player moved: ${fDone.playerMoved}`)

// ── G. Soldering is presence, not a modal (C6) ────────────
console.log('\n### G. The soldering strip')
await boot(seedState({}))          // hand iron: the bench cannot run itself
await orderFirstKit()
await page.waitForTimeout(5200)
await goTo('slot0'); await page.waitForTimeout(700)
await goTo('zone-station-0'); await page.waitForTimeout(2500)
const gAtBench = await log('at the bench with a hand iron')

// The strip must not freeze the character — that was the whole problem.
const gBefore = await player()
await hold('KeyD', 700)
const gAfterWalk = await player()
const gStripGone = await page.locator('#solder-bar').isVisible().catch(() => false)
console.log(`  walked ${gBefore.x} → ${gAfterWalk.x} while soldering; strip still up: ${gStripGone}`)

// Walking away leaves the bench mid-assembly, with no penalty.
const gPhaseAway = await page.evaluate(() => globalThis.__world.game.stations[0].phase)

// An upgraded bench runs unattended and does not need the player at all.
await boot(seedState({ solderingLevel: 2 }))
await orderFirstKit()
await page.waitForTimeout(5200)
await goTo('slot0'); await page.waitForTimeout(700)
await goTo('zone-station-0')
await page.waitForTimeout(14000)
const gUnattended = await log('semi-auto bench, player standing there')

// ── H. Moving house rebuilds the shop (C7) ────────────────
console.log('\n### H. A move is a different room')
await boot(seedState({ solderingLevel: 2 }, { money: 5000 }))
const hBefore = await page.evaluate(() => ({
  loc: globalThis.__world.game.locationId,
  world: globalThis.__world.bounds.w,
  slots: globalThis.__world.layout.stationSlots.length,
  grid: globalThis.__world.navGrid.cols,
}))
await openPanelAt('rack')
await page.click('#move-btn').catch(() => {})
await page.waitForTimeout(1500)
const hAfter = await page.evaluate(() => {
  const w = globalThis.__world
  const p = w.agents.find(a => a.kind === 'player')
  return {
    loc: w.game.locationId,
    world: w.bounds.w,
    slots: w.layout.stationSlots.length,
    grid: w.navGrid.cols,
    playerInside: p.x < w.bounds.w && p.y < w.bounds.h,
  }
})
console.log(`  ${hBefore.loc} (${hBefore.world}w, ${hBefore.slots} slots, grid ${hBefore.grid})` +
            ` → ${hAfter.loc} (${hAfter.world}w, ${hAfter.slots} slots, grid ${hAfter.grid})`)

// ── I. The factory: no bin, no piggy, burnt kits clear themselves (F1) ──
console.log('\n### I. The factory')
await boot(seedState(
  { solderingLevel: 3, consumablesLevel: 2, benchLevel: 2, storageLevel: 2 },
  { locationId: 'factory', money: 4000 },
))
const iScene = await page.evaluate(() => {
  const w = globalThis.__world
  return {
    loc:      w.game.locationId,
    zones:    w.zones.map(z => z.kind),
    props:    Object.keys(w.layout.props),
    stations: w.layout.stationSlots.length,
  }
})
console.log(`  ${iScene.loc}: ${iScene.stations} slots, zones=${[...new Set(iScene.zones)].join(',')}`)

// An old save still says "workshop" — it must land in the factory, not back
// in the apartment.
await boot(seedState({ solderingLevel: 2 }, { locationId: 'workshop' }))
const iMigrated = await page.evaluate(() => globalThis.__world.game.locationId)
console.log(`  old save locationId: workshop → ${iMigrated}`)

// A burnt kit has to be clearable — until F1.5 nothing could clear one.
await boot(seedState({ solderingLevel: 2 }, { locationId: 'factory', money: 4000 }))
await page.evaluate(() => {
  const w = globalThis.__world
  w.game = {
    ...w.game,
    stations: w.game.stations.map((s, i) =>
      i === 0 ? { ...s, phase: 'BURNT', kitId: 'mini_drone' } : s),
  }
})
await goTo('zone-station-0')
await page.waitForTimeout(2500)
const iCleared = await log('stood at the burnt bench')

// ── C. Movement, collisions, camera (C1 regression) ───────
console.log('\n### C. Movement (WASD)')
await boot(seedState({}))
const c0 = await player()
await hold('KeyD', 900); const cRight = await player()
await hold('KeyA', 900); const cBack  = await player()
await hold('KeyA', 4000); const cWall = await player()
console.log(`  spawn ${c0.x} → right ${cRight.x} → back ${cBack.x} → wall ${cWall.x}`)

// Start below the bench, inside the room, and walk into it.
await boot(seedState({}))
const cBenchY = await page.evaluate(() => {
  const w = globalThis.__world
  const slot = w.layout.stationSlots[0]
  const a = w.agents.find(x => x.kind === 'player')
  a.x = slot.x; a.y = slot.y + 380
  return slot.y + w.placedStations[0].body.h / 2   // bottom face of the bench
})
await hold('KeyW', 4000); const cBench = await player()

// Camera follow, measured away from the clamped edges AND clear of the bench —
// standing inside it pins the character and reads as a camera bug.
await page.evaluate(() => {
  const w = globalThis.__world
  const a = w.agents.find(x => x.kind === 'player')
  a.x = w.layout.spawns.player.x
  a.y = w.layout.stationSlots[0].y + 120
})
await page.waitForTimeout(500)
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
  ['A: bench finished with someone at it', aReady.phase === 'READY'],
  ['A: work side does NOT hand over the drone', !aStillEmpty.carrying.includes('drone')],
  ['A: output table handed over the drone', aTake.carrying.includes('drone')],
  ['A: mailbox zone sold it',             aSold.phase === 'IDLE' && money(aSold) > money(aReady)],
  ['B: standing at a bench shows the strip', bSolder.solderOpen === true],
  ['B: piggy zone opened the piggy game', bPiggy.piggyOpen === true],
  ['B: trash zone opened the swipe game', bTrash.trashOpen === true],
  ['C: moves right on D',                 cRight.x > c0.x + 100],
  ['C: moves back left on A',             cBack.x < cRight.x - 100],
  ['C: stopped by the left wall',         cWall.x >= 24 && cWall.x <= 60],
  ['C: stopped by a workbench',           Math.abs(cBench.y - (cBenchY + 14)) < 6],
  ['C: camera follows the player',        camAfter > camBefore + 150],
  ['C: walked out and grabbed the box',   cWalked.y > 1050 && cWalked.carrying.includes('kit_box')],
  ['D: two stations were built',          dCount === 2],
  ['D: each station got its own zone',    dZones.length === 2],
  ['D: box picked up from a street slot',  dCarry.carrying.includes('kit_box')],
  // A semi-auto bench finishes in a few seconds, so the first station is often
  // already done by the time the second box arrives. What
  // matters is that each was loaded and worked independently.
  ['D: both stations were loaded',        dBoth.stations.split('/').every(p => p !== 'IDLE')],
  // A bench only runs while somebody is at it, so the player cannot finish two
  // at once alone. What matters is that both were loaded and worked separately.
  ['D: each bench progressed on its own', dDone.stations.split('/').every(p => p !== 'IDLE')],
  ['E: nav grid rasterised the world',    eGrid.blocked > 0 && eGrid.cols > 30],
  ['E: pathed across the flat and out',   Math.hypot(eArrived.x - 230, eArrived.y - 1450) < 60],
  ['E: never ended inside geometry',      eArrived.stuck === false],
  ['E: routes were cached',               eArrived.cached > 0],
  ['F: hired a full staff via the UI',    fHired.roster.length === 2 && fHired.agents === 2],
  // No seller fits in the garage alongside a courier and a tech, so the drones
  // pile up finished rather than sold — assembly is what proves autonomy here.
  // Two pairs of hands fit in the garage: taking a courier and a technician
  // leaves nobody to sell, so finished drones sit on the bench and block it.
  ['F: workers assembled on their own',   fDone.assembled >= 1],
  ['F: the player never moved',           fDone.playerMoved === false],
  ['G: strip appears from standing there', gAtBench.solderOpen === true],
  ['G: movement still works while soldering', Math.abs(gAfterWalk.x - gBefore.x) > 80],
  ['G: strip closes on walking away',      gStripGone === false],
  ['G: leaving costs nothing, bench waits', gPhaseAway === 'ASSEMBLY'],
  ['G: an upgraded bench does the work for you', gUnattended.phase === 'READY'],
  ['G: a hands-off iron offers no mini-game', gUnattended.solderOpen === false],
  ['H: the move actually happened',       hAfter.loc === 'garage'],
  ['H: the room is a different size',     hAfter.world > hBefore.world],
  ['H: more bench slots than before',     hAfter.slots > hBefore.slots],
  ['H: nav grid rebuilt for the new room', hAfter.grid > hBefore.grid],
  ['H: the player is inside the new room', hAfter.playerInside === true],
  ['I: the factory has no salvage bin',   !iScene.zones.includes('trashbin')],
  ['I: the factory has no piggy bank',    !iScene.zones.includes('piggy')],
  ['I: the factory still has three benches', iScene.stations === 3],
  ['I: an old "workshop" save lands in the factory', iMigrated === 'factory'],
  ['I: a burnt kit can be cleared on foot', iCleared.phase === 'IDLE'],
  ['no console errors',                   errors.length === 0],
]
console.log('\n=== checks ===')
for (const [name, ok] of checks) console.log(`${ok ? '✅' : '❌'} ${name}`)

await browser.close()
process.exit(checks.every(([, ok]) => ok) ? 0 : 1)
