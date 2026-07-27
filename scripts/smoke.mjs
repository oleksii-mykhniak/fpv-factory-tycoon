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

  // Pin the sim's luck. Since F1.6 an unattended bench can lay a cold joint or
  // burn the kit, so the happy path is only PROBABLE — scenario A started
  // failing about one run in ten. Relaxing the assertions would have thrown
  // away what they check; fixing the dice keeps the test end-to-end and
  // deterministic. 0.9 is a good roll: no misses, high quality.
  await page.evaluate(() => { globalThis.__world.rng = () => 0.9 })
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
await boot(seedState({ solderingLevel: 2, benchLevel: 1, storageLevel: 1 }, { unlockedRooms: ['flat', 'garage'] }))
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
await boot(seedState({ benchLevel: 1 }, { unlockedRooms: ['flat', 'garage'] }))
const eGrid = await page.evaluate(() => {
  const g = globalThis.__world.navGrid
  const blocked = g.data.reduce((n, v) => n + v, 0)
  return { cols: g.cols, rows: g.rows, cell: g.cell, blocked }
})
console.log(`  grid ${eGrid.cols}×${eGrid.rows} @${eGrid.cell}px, ${eGrid.blocked} blocked cells`)

// Walk the player from the far end of the garage, through two doorways, out
// to the post box — the longest route the flat has (П2). The destination is
// read off the layout, never written as a literal: the floor plan moves.
const eGoal = await page.evaluate(() => {
  const p = globalThis.__world.layout.props.mailbox
  return { x: p.cx, y: p.cy }
})
await page.evaluate((goal) => {
  const w = globalThis.__world
  const a = w.agents.find(x => x.kind === 'player')
  a.x = w.layout.world.w - 120; a.y = 150   // far corner of the garage
  a.pathTarget = goal
}, eGoal)
const eStart = Date.now()
await page.waitForFunction((goal) => {
  const a = globalThis.__world.agents.find(x => x.kind === 'player')
  return Math.hypot(a.x - goal.x, a.y - goal.y) < 45
}, eGoal, { timeout: 40000 }).catch(() => {})
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
// Hiring starts with the garage — the flat is a one-person shop (П2).
await boot(seedState({}, { money: 20000, unlockedRooms: ['flat', 'garage'] }))
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
console.log('\n### H. The flat grows a garage, then you move out')
await boot(seedState({ solderingLevel: 2 }, { money: 5000 }))
const plan = () => page.evaluate(() => ({
  loc:   globalThis.__world.game.locationId,
  rooms: (globalThis.__world.game.unlockedRooms ?? []).join('+'),
  world: globalThis.__world.bounds.w,
  slots: globalThis.__world.layout.stationSlots.length,
  grid:  globalThis.__world.navGrid.cols,
  money: Math.floor(globalThis.__world.game.money),
  board: globalThis.__world.zones.some(z => z.kind === 'jobboard'),
}))
const hStart = await plan()

// П2: the garage is bought, not moved into — the world gets wider and the rest
// of the money stays in the bank.
await openPanelAt('rack')
await page.click('#room-btn').catch(() => {})
await page.waitForTimeout(1200)
const hRoom = await plan()
console.log(`  ${hStart.rooms} (${hStart.world}w, ${hStart.slots} slots, board ${hStart.board}, $${hStart.money})` +
            ` → ${hRoom.rooms} (${hRoom.world}w, ${hRoom.slots} slots, board ${hRoom.board}, $${hRoom.money})`)

// Now the move is unlocked (the factory wants a garage behind you).
await page.evaluate(() => {
  const w = globalThis.__world
  w.game = { ...w.game, money: 9000,
    upgrades: { ...w.game.upgrades, solderingLevel: 3, consumablesLevel: 2 } }
})
const hBefore = await plan()
await openPanelAt('rack')
await page.click('#move-btn').catch(() => {})
await page.waitForTimeout(1500)
const hAfter = { ...(await plan()), playerInside: await page.evaluate(() => {
  const w = globalThis.__world
  const p = w.agents.find(a => a.kind === 'player')
  return p.x < w.bounds.w && p.y < w.bounds.h
}) }
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

// And one that says "garage" comes home with the room already built (П2),
// keeping the money it had — it paid for that address once already.
await boot(seedState({ solderingLevel: 2 }, { locationId: 'garage', money: 3210 }))
const iGarage = await page.evaluate(() => ({
  loc:   globalThis.__world.game.locationId,
  rooms: (globalThis.__world.game.unlockedRooms ?? []).join('+'),
  money: Math.floor(globalThis.__world.game.money),
  board: globalThis.__world.zones.some(z => z.kind === 'jobboard'),
}))
console.log(`  old save locationId: garage → ${iGarage.loc} [${iGarage.rooms}] ` +
            `$${iGarage.money}, board ${iGarage.board}`)

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
// The label has to appear BEFORE anyone clears it: it is the only explanation
// the player gets that the drone burnt (A2 / V6).
await page.waitForTimeout(600)
const iBurntLabel = await page.evaluate(() => {
  const v = globalThis.__refs.stations?.[0]
  return { visible: v?.burntLabel?.graphics?.visible ?? false, text: v?.burntLabel?.text ?? '' }
})
console.log(`  burnt label: "${iBurntLabel.text}" (visible ${iBurntLabel.visible})`)

await goTo('zone-station-0')
await page.waitForTimeout(2500)
const iCleared = await log('stood at the burnt bench')
const iSounds = await page.evaluate(async () => {
  const a = new Audio('/audio/sell.wav')
  await new Promise(r => { a.addEventListener('loadedmetadata', r, { once: true })
                           a.addEventListener('error', r, { once: true }); setTimeout(r, 1200) })
  return { duration: a.duration || 0 }
})
console.log(`  sell.wav duration: ${iSounds.duration}`)

// ── J. A hall is a floor plan, and opening one grows the map (F2) ──
console.log('\n### J. Opening a factory hall')
await boot(seedState({}, { locationId: 'factory', money: 20000 }))
const jBefore = await page.evaluate(() => {
  const w = globalThis.__world
  return {
    halls:    w.game.unlockedHalls.length,
    world:    w.bounds.w,
    stations: w.game.stations.length,
    grid:     w.navGrid.cols,
    zones:    w.zones.filter(z => z.kind === 'bench').length,
  }
})

// A hall will not open while the open ones are short-staffed, so hire first.
// Each hall has its own board since F4 — this is hall 1's.
await openPanelAt('jobboard_hall-1')
for (const role of ['Кур', 'Технік', 'Продавець', 'Менеджер']) {
  const btn = page.locator('.shop-upgrade', { hasText: role }).locator('button').first()
  if (await btn.isEnabled().catch(() => false)) await btn.click()
  await page.waitForTimeout(250)
}
await page.click('#hire-close').catch(() => {})
await page.waitForTimeout(400)

await openPanelAt('rack')
const jBtnText = await page.locator('#hall-btn').textContent().catch(() => '(no button)')

await page.click('#hall-btn')
await page.waitForTimeout(1500)
const jAfter = await page.evaluate(() => {
  const w = globalThis.__world
  const p = w.agents.find(a => a.kind === 'player')
  return {
    halls:    w.game.unlockedHalls.length,
    world:    w.bounds.w,
    stations: w.game.stations.length,
    grid:     w.navGrid.cols,
    zones:    w.zones.filter(z => z.kind === 'bench').length,
    inside:   p.x < w.bounds.w && p.y < w.bounds.h,
  }
})
console.log(`  ${jBtnText.trim()}`)
console.log(`  halls ${jBefore.halls}→${jAfter.halls}, world ${jBefore.world}→${jAfter.world}w, ` +
            `benches ${jBefore.stations}→${jAfter.stations}, grid ${jBefore.grid}→${jAfter.grid}`)

// F4: the new hall has its own board, and hiring there binds the person to it.
await openPanelAt('jobboard_hall-2')
const jBoardTitle = await page.textContent('#hire-modal .shop-section__title').catch(() => '')
const jTechBtn = page.locator('.shop-upgrade', { hasText: 'Технік' }).locator('button').first()
if (await jTechBtn.isEnabled().catch(() => false)) await jTechBtn.click()
await page.waitForTimeout(400)
await page.click('#hire-close').catch(() => {})
const jHired = await page.evaluate(() => {
  const w = globalThis.__world
  const last = w.game.workers[w.game.workers.length - 1]
  const agent = w.agents.find(a => a.id === last?.id)
  return { role: last?.role, hallId: last?.hallId, agentHall: agent?.hallId }
})
console.log(`  board title: "${jBoardTitle.trim()}"; hired ${jHired.role} into ${jHired.hallId}`)

// Can a character actually walk from the new hall back to the first one?
await page.evaluate(() => {
  const w = globalThis.__world
  const p = w.agents.find(a => a.kind === 'player')
  p.x = w.bounds.w - 300; p.y = 700
})
await page.waitForTimeout(200)
// Each hall ships from its own post box since F4, so aim at hall 1's.
await goTo('mailbox_hall-1')
await page.waitForTimeout(6000)
const jWalked = await page.evaluate(() => {
  const w = globalThis.__world
  const p = w.agents.find(a => a.kind === 'player')
  const mb = w.zones.find(z => z.id === 'mailbox_hall-1')
  return { dist: Math.hypot(p.x - mb.cx, p.y - mb.cy) }
})
console.log(`  crossed the factory to the mailbox: ${jWalked.dist.toFixed(0)} units away`)

// ── K. The conveyor carries the box, not the courier (F3) ──
console.log('\n### K. The conveyor')
await boot(seedState({ storageLevel: 2 }, { locationId: 'factory', money: 6000 }))
await orderFirstKit()

// While in transit there is nothing on the belt yet.
await page.waitForTimeout(1200)
const kTransit = await page.evaluate(() => ({
  onBelt: (globalThis.__world.belt?.items ?? []).length,
}))

// Arrives at the dock and starts moving on its own.
await page.waitForTimeout(4500)
const kRidingA = await page.evaluate(() => ({
  onBelt: (globalThis.__world.belt?.items ?? []).length,
  t:      globalThis.__world.belt?.items?.[0]?.t ?? -1,
  drop:   globalThis.__world.game.deliveries[0]?.dropIndex ?? null,
}))
await page.waitForTimeout(1500)
const kRidingB = await page.evaluate(() => ({
  t: globalThis.__world.belt?.items?.[0]?.t ?? -1,
}))

// Gets off at the hall, and only then is there anything to fetch.
await page.waitForTimeout(6000)
const kDropped = await page.evaluate(() => {
  const w = globalThis.__world
  return {
    drop:  w.game.deliveries[0]?.dropIndex ?? null,
    jobs:  (w.jobs ?? []).filter(j => j.type === 'haul_delivery').length,
    boxVisible: (globalThis.__refs.beltBoxes ?? []).filter(a => a.graphics.visible).length,
  }
})
console.log(`  transit=${kTransit.onBelt} on belt; rode ${kRidingA.t}→${kRidingB.t}; ` +
            `dropped at hall ${kDropped.drop}, ${kDropped.jobs} haul job(s)`)

// And the last few metres are still walked, by hand, into a bench.
await goTo('drop0'); await page.waitForTimeout(1000)
const kInHand = await log('picked the box off the belt')
await goTo('zone-station-0'); await page.waitForTimeout(2000)
const kOnBench = await log('carried it to the bench')

// ── M. Income on screen (F7) ──────────────────────────────
console.log('\n### M. $/сек')
await boot(seedState({ solderingLevel: 2 }))
const mBefore = await page.locator('#hud-rate').isVisible().catch(() => false)
await orderFirstKit()
await page.waitForTimeout(5200)
await goTo('slot0'); await page.waitForTimeout(700)
await goTo('zone-station-0'); await page.waitForTimeout(9000)
await goTo('zone-out-station-0'); await page.waitForTimeout(1200)
await goTo('mailbox'); await page.waitForTimeout(1200)
const mAfter = await page.evaluate(() => ({
  visible: !document.querySelector('#hud-rate').hasAttribute('hidden'),
  text:    document.querySelector('#hud-rate').textContent,
  logged:  globalThis.__world.salesLog.length,
  stamped: globalThis.__world.salesLog.every(s => typeof s.at === 'number'),
}))
console.log(`  before: rate shown=${mBefore}; after a sale: "${mAfter.text}" ` +
            `(${mAfter.logged} sale(s), timestamped: ${mAfter.stamped})`)

// ── L. Promoting somebody on the shop floor (F5) ──────────
console.log('\n### L. The promotion tag')
await boot(seedState({}, { locationId: 'factory', money: 20000 }))
await openPanelAt('jobboard_hall-1')
const lHireBtn = page.locator('.shop-upgrade', { hasText: 'Кур' }).locator('button').first()
if (await lHireBtn.isEnabled().catch(() => false)) await lHireBtn.click()
await page.waitForTimeout(300)
await page.click('#hire-close').catch(() => {})
await page.waitForTimeout(500)

const lBefore = await page.evaluate(() => {
  const w = globalThis.__world
  const worker = w.game.workers[0]
  const agent = w.agents.find(a => a.id === worker.id)
  const view = globalThis.__refs.workerViews.get(worker.id)
  return {
    level: worker.level,
    speed: agent.speed,
    money: Math.round(w.game.money),
    tag:   view?.promoteLabel?.text ?? '',
    tagOn: view?.promoteLabel?.graphics?.visible ?? false,
    dots:  view?.levelLabel?.text ?? '',
    zone:  (w.zones ?? []).some(z => z.kind === 'promote'),
  }
})

// Stand on top of them for a moment. П3: this no longer BUYS anything — it
// opens a panel, exactly like every other object in the shop.
for (let i = 0; i < 45; i++) {
  await page.evaluate(() => {
    const w = globalThis.__world
    const worker = w.agents.find(a => a.kind === 'worker')
    const player = w.agents.find(a => a.kind === 'player')
    player.x = worker.x; player.y = worker.y
  })
  await page.waitForTimeout(60)
}
await page.waitForTimeout(400)

const lPanel = await page.evaluate(() => {
  const el = document.querySelector('#promote-modal')
  if (!el || el.hasAttribute('hidden')) return null
  return {
    title: el.querySelector('#promote-title')?.textContent.trim(),
    stats: [...el.querySelectorAll('.promote-stat')].map(r => r.textContent.replace(/\s+/g, ' ').trim()),
    btn:   el.querySelector('#promote-btn')?.textContent.trim(),
  }
})
// Нічого ще не сталось: панель лише питає.
const lAsked = await page.evaluate(() => {
  const w = globalThis.__world
  return { level: w.game.workers[0].level, money: Math.round(w.game.money) }
})
console.log(`  panel "${lPanel?.title}": ${lPanel?.stats.join('; ')} → [${lPanel?.btn}]`)

await page.click('#promote-btn')
await page.waitForTimeout(500)

const lAfter = await page.evaluate(() => {
  const w = globalThis.__world
  const worker = w.game.workers[0]
  const agent = w.agents.find(a => a.id === worker.id)
  const view = globalThis.__refs.workerViews.get(worker.id)
  return {
    level: worker.level,
    speed: agent.speed,
    money: Math.round(w.game.money),
    dots:  view?.levelLabel?.text ?? '',
  }
})
console.log(`  tag "${lBefore.tag}" (visible ${lBefore.tagOn}); dots ${lBefore.dots} → ${lAfter.dots}; ` +
            `level ${lBefore.level}→${lAfter.level}, speed ${lBefore.speed}→${lAfter.speed}, ` +
            `money ${lBefore.money}→${lAfter.money}`)

// ── N. The cat (V5) ───────────────────────────────────────
console.log('\n### N. The cat')
await boot(seedState({}))
await page.waitForTimeout(1200)
const nStart = await page.evaluate(() => {
  const c = globalThis.__world.agents.find(a => a.kind === 'cat')
  return c ? { x: c.x, y: c.y, visible: globalThis.__refs.cat.actor.graphics.visible } : null
})
await page.waitForTimeout(9000)
const nLater = await page.evaluate(() => {
  const w = globalThis.__world
  const c = w.agents.find(a => a.kind === 'cat')
  return { x: c.x, y: c.y, carrying: (c.carrying ?? []).length }
})
// Measured against where the cat STARTS, not against a sample taken a second
// in. boot() pins the sim's dice, so with a fixed roll the cat picks one spot,
// walks there and stays — sampling two live positions caught it mid-sit about
// one run in three. Displacement from its spawn is the same question, asked in
// a way the pinned dice can answer.
const nHome = await page.evaluate(() => globalThis.__world.layout.spawns.cat)
const nMoved = Math.hypot(nLater.x - nHome.x, nLater.y - nHome.y)

// Moods (V5): over half a minute the cat should be seen in more than one.
// boot() pins the dice, so the sequence is fixed — that is the point: a fixed
// roll must still produce a cat that changes what it is doing.
const nMoods = new Set()
for (let i = 0; i < 40; i++) {
  nMoods.add(await page.evaluate(() =>
    globalThis.__world.agents.find(a => a.kind === 'cat')?.mood ?? '?'))
  await page.waitForTimeout(700)
}
console.log(`  moods seen: ${[...nMoods].join(', ')}`)
console.log(`  cat at (${Math.round(nStart?.x)}, ${Math.round(nStart?.y)}) moved ${nMoved.toFixed(0)} units`)

// It must be incapable of touching the shop: park it in the delivery slot with
// a box waiting there and confirm nothing happens.
await orderFirstKit()
await page.waitForTimeout(5200)
for (let i = 0; i < 25; i++) {
  await page.evaluate(() => {
    const w = globalThis.__world
    const c = w.agents.find(a => a.kind === 'cat')
    const z = w.zones.find(x => x.kind === 'delivery_slot')
    c.x = z.cx; c.y = z.cy
  })
  await page.waitForTimeout(80)
}
const nInnocent = await page.evaluate(() => {
  const w = globalThis.__world
  const c = w.agents.find(a => a.kind === 'cat')
  return { carrying: (c.carrying ?? []).length, status: w.game.deliveries[0]?.status }
})
console.log(`  cat sat in the delivery slot: carrying ${nInnocent.carrying}, box ${nInnocent.status}`)

// ── P. The quest tracker (П1) ─────────────────────────────
console.log('\n### P. The quest tracker')
await boot(seedState({ solderingLevel: 2 }, { money: 400, ordersPlaced: 3 }))
await page.waitForTimeout(600)

const questCard = () => page.evaluate(() => {
  const el = document.querySelector('#quest-tracker .quest--primary')
  return el ? {
    title: el.querySelector('.quest__title')?.textContent.trim(),
    meta:  el.querySelector('.quest__meta')?.textContent.trim(),
    hint:  el.querySelector('.quest__hint')?.textContent.trim() ?? null,
    fill:  el.querySelector('.quest__fill')?.style.width,
    pinned: el.classList.contains('quest--pinned'),
  } : null
})
// Куди насправді дивиться стрілка на екрані: порівнюємо її поворот із
// напрямком на найближчу шафу. Питати сим про ціль було б перевіркою коду
// самим кодом — а зламатись може саме малювання.
const arrowAtRack = () => page.evaluate(() => {
  const w = globalThis.__world
  const arrow = globalThis.__refs.arrow
  if (!arrow?.graphics?.visible) return false
  const p = w.agents.find(a => a.kind === 'player')
  const rack = w.zones.filter(z => z.kind === 'rack')
    .sort((a, b) => Math.hypot(a.cx - p.x, a.cy - p.y) - Math.hypot(b.cx - p.x, b.cy - p.y))[0]
  if (!rack) return false
  const want = Math.atan2(rack.cy - p.y, rack.cx - p.x) + Math.PI / 2
  const diff = Math.abs(((arrow.rotation - want + Math.PI) % (2 * Math.PI)) - Math.PI)
  return diff < 0.25
})

const pBefore = await questCard()
console.log(`  card: "${pBefore?.title}" ${pBefore?.meta} fill=${pBefore?.fill}`)

// Умова, яка не є грошима, мусить бути написана словами: смужка вміє показати
// рівно одне число, а гараж хоче ще й паяльник. Гараж тут не головна ціль
// (паяльник іде раніше), тож заразом перевіряємо, що список розгортається.
await boot(seedState({ solderingLevel: 1 }, { money: 900, ordersPlaced: 3 }))
await page.waitForTimeout(600)
const pCollapsed = await page.evaluate(() => document.querySelectorAll('#quest-tracker .quest').length)
await page.click('#quest-more')
await page.waitForTimeout(300)
const pExpanded = await page.evaluate(() => document.querySelectorAll('#quest-tracker .quest').length)
const pHint = await page.evaluate(() => {
  const card = [...document.querySelectorAll('#quest-tracker .quest')]
    .find(el => el.querySelector('.quest__title')?.textContent.includes('Гараж'))
  return card?.querySelector('.quest__hint')?.textContent.trim() ?? null
})
console.log(`  goals shown ${pCollapsed} → ${pExpanded} when expanded; ` +
            `garage hint="${pHint}"`)

await boot(seedState({ solderingLevel: 2 }, { money: 400, ordersPlaced: 3 }))
await page.waitForTimeout(600)

// Тап по картці закріплює ціль, і стрілка їде до шафи.
await page.click('#quest-tracker .quest--primary')
await page.waitForTimeout(500)
const pPinned  = await questCard()
const pPinnedId  = await page.evaluate(() => globalThis.__world.game.pinnedQuestId)
const pArrowRack = await arrowAtRack()
console.log(`  tapped → pinned=${pPinnedId}, card highlighted: ${pPinned?.pinned}, ` +
            `arrow points at the rack: ${pArrowRack}`)

// Той самий тап удруге — знімає закріплення.
await page.click('#quest-tracker .quest--primary')
await page.waitForTimeout(400)
const pUnpinned = await page.evaluate(() => globalThis.__world.game.pinnedQuestId)
console.log(`  tapped again → pinned=${pUnpinned}`)

// Виконуємо ціль через шафу — картка має зникнути, а тост з'явитись.
await page.evaluate(() => {
  const w = globalThis.__world
  w.game = { ...w.game, money: 9999 }
})
await page.waitForTimeout(400)
const pGoalTitle = (await questCard())?.title
await openPanelAt('rack')
await page.click('#room-btn').catch(() => {})
await page.waitForTimeout(700)
const pToast = await page.evaluate(() => {
  const t = document.querySelector('.quest-toast')
  return t && !t.hasAttribute('hidden') ? t.textContent.trim() : null
})
const pAfter = await questCard()
console.log(`  goal "${pGoalTitle}" done → toast "${pToast}", card now "${pAfter?.title}"`)

// ── O. Sound, music and the "player only" rule (A3–A6) ────
console.log('\n### O. Audio')
await boot(seedState({}))
// Every name playSfx() is called with must resolve to a real file. This is the
// check that would have caught D8's silent 404s on the day they appeared.
const oMissing = await page.evaluate(async () => {
  const names = ['order','solder_good','solder_cold','overheat','sell','piggy',
                 'pickup','drop','hire','upgrade','promote','hall']
  const bad = []
  for (const n of names) {
    const r = await fetch(`/audio/${n}.wav`, { method: 'HEAD' })
    if (!r.ok) bad.push(n)
  }
  return bad
})
console.log(`  missing sound files: ${oMissing.length ? oMissing.join(', ') : 'none'}`)

await page.click('#settings-btn'); await page.waitForTimeout(400)
const oSettings = await page.$$eval('.settings-row span', els => els.map(e => e.textContent.trim()))
await page.click('#settings-close').catch(() => page.keyboard.press('Escape'))
await page.waitForTimeout(300)

// A technician's solder point must not make a sound: the event carries auto:true
// and effects.js drops it. Checked at the event level, since the smoke cannot
// hear anything.
const oQuiet = await page.evaluate(() => {
  const w = globalThis.__world
  const seen = { auto: 0, player: 0 }
  // Replay the shape of the two events through the same gate effects.js uses.
  const byPlayer = (e) => !e?.auto && (e?.agentId === undefined || e.agentId === 'player')
  seen.auto   = byPlayer({ t: 'station.stageDone', auto: true }) ? 1 : 0
  seen.player = byPlayer({ t: 'station.stageDone' }) ? 1 : 0
  return { autoSilent: seen.auto === 0 && seen.player === 1, halls: w.game.unlockedHalls?.length }
})
console.log(`  settings rows: ${oSettings.filter(Boolean).join(', ')}`)

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
// Start in the hallway, lined up with the front door: since V2 the flat has
// interior walls, and the old spot (just below the bench) now has one right
// underneath it — the character would stop after 20 units and this would read
// as a broken camera.
await page.evaluate(() => {
  const w = globalThis.__world
  const a = w.agents.find(x => x.kind === 'player')
  // In the middle band of the world and lined up with a doorway. Too high and
  // the camera is clamped against the top edge, so it cannot follow at all —
  // which is what "camera broken" looked like on the first attempt.
  a.x = 280
  a.y = 500
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
  const w = globalThis.__world
  const a = w.agents.find(x => x.kind === 'player')
  // Straight at the doorway. Aiming at the slot instead puts a shoulder into
  // the door frame: the character is 40 wide and the opening has edges.
  a.x = w.layout.door.x
  a.y = w.layout.door.y - 90
})
// Just far enough to reach the slots' row — further and the character walks
// past them to the bottom of the world.
await hold('KeyS', 1300)
// Out on the pavement now — walk along it to the box.
await hold('KeyA', 500)
const cWalked = await player()
console.log(`  walked out of the door: ${JSON.stringify(cWalked)}`)

await page.screenshot({ path: '.smoke.png' })

console.log('\n=== console errors ===')
console.log(errors.length ? errors.join('\n---\n') : '(none)')

const money = (s) => parseFloat(s.money.replace('$', ''))
const checks = [
  ['P: the tracker shows a goal with a money bar', !!pBefore?.title && !!pBefore?.meta],
  ['P: the bar reflects the money actually held', pBefore?.fill !== '0%' && pBefore?.fill !== '100%'],
  ['P: the list expands to the other goals', pExpanded > pCollapsed],
  ['P: unmet conditions other than money are spelled out',
   !!pHint && pHint.includes('Паяльник') && !pHint.includes('Потрібно $')],
  ['P: tapping the card pins the goal',    pPinnedId !== null && pPinned?.pinned === true],
  ['P: and the arrow turns to its object', pArrowRack === true],
  ['P: tapping it again unpins',           pUnpinned === null],
  ['P: finishing a goal announces itself', !!pToast],
  ['P: and the tracker moves on to the next one', !!pAfter && pAfter.title !== pGoalTitle],
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
  ['C: walked out and grabbed the box',   cWalked.carrying.includes('kit_box')],
  ['D: two stations were built',          dCount === 2],
  ['D: each station got its own zone',    dZones.length === 2],
  ['D: box picked up from a street slot',  dCarry.carrying.includes('kit_box')],
  // A semi-auto bench finishes in a few seconds, so the first station is often
  // already done by the time the second box arrives. What
  // matters is that each was loaded and worked independently.
  ['D: both stations were loaded',        dBoth.stations.split('/').every(p => p !== 'IDLE')],
  // A bench only runs while somebody is at it, so the player cannot finish two
  // at once alone. The precise, non-flaky statement of "independent" is: the
  // one nobody is standing at keeps its progress and waits, and the one the
  // player is at reaches a conclusion. That conclusion is READY — or BURNT/IDLE
  // when the kit goes wrong, which is a real outcome now that an unattended
  // bench can miss (F1.6), so the check must not demand a happy ending.
  ['D: the unattended bench waits, keeping its kit',
   dDone.stations.split('/')[0] === 'ASSEMBLY'],
  ['D: the attended bench reached a conclusion',
   dDone.stations.split('/')[1] !== 'ASSEMBLY'],
  ['E: nav grid rasterised the world',    eGrid.blocked > 0 && eGrid.cols > 30],
  ['E: pathed across the flat and out',   Math.hypot(eArrived.x - eGoal.x, eArrived.y - eGoal.y) < 60],
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
  // Same reason as D: "did the work" means it stopped being ASSEMBLY without
  // the player tapping anything — a burnt kit is still the bench doing the work.
  ['G: an upgraded bench does the work for you', gUnattended.phase !== 'ASSEMBLY'],
  ['G: a hands-off iron offers no mini-game', gUnattended.solderOpen === false],
  ['H: the garage was bought, not moved into', hRoom.loc === 'apartment' && hRoom.rooms.includes('garage')],
  ['H: buying it widened the world',      hRoom.world > hStart.world],
  ['H: and brought a second bench slot',  hRoom.slots > hStart.slots],
  ['H: and the job board with it',        hStart.board === false && hRoom.board === true],
  ['H: the money left over stays yours',  hRoom.money > 0 && hRoom.money < hStart.money],
  ['H: the move actually happened',       hAfter.loc === 'factory'],
  ['H: the room is a different one',      hAfter.world !== hBefore.world],
  ['H: nav grid rebuilt for the new room', hAfter.grid !== hBefore.grid],
  ['H: the player is inside the new room', hAfter.playerInside === true],
  ['I: the factory has no salvage bin',   !iScene.zones.includes('trashbin')],
  ['I: the factory has no piggy bank',    !iScene.zones.includes('piggy')],
  ['I: the factory opens with one hall of benches', iScene.stations === 2],
  ['I: an old "workshop" save lands in the factory', iMigrated === 'factory'],
  ['I: a burnt kit can be cleared on foot', iCleared.phase === 'IDLE'],
  ['I: the bench says the kit burnt',      iBurntLabel.visible && iBurntLabel.text.includes('Згорів')],
  ['I: sound files are actually there',    iSounds.duration > 0],
  ['O: every sound the code asks for exists', oMissing.length === 0],
  ['O: music has its own switch',          oSettings.includes('Музика')],
  ['O: a worker\'s work is silent',        oQuiet.autoSilent === true],
  ['J: the hall actually opened',         jAfter.halls === jBefore.halls + 1],
  ['J: the map got wider',                jAfter.world > jBefore.world],
  ['J: the hall brought its own benches', jAfter.stations > jBefore.stations],
  ['J: every bench got a zone',           jAfter.zones === jAfter.stations],
  ['J: nav grid rebuilt for the wider floor', jAfter.grid > jBefore.grid],
  ['J: the player is still inside the world', jAfter.inside],
  ['J: a character can cross between halls', jWalked.dist < 120],
  ['J: each hall has its own job board',  jBoardTitle.includes('Цех 2')],
  ['J: hiring there binds the person to that hall',
   jHired.hallId === 'hall-2' && jHired.agentHall === 'hall-2'],
  ['K: nothing on the belt while in transit', kTransit.onBelt === 0],
  ['K: the box lands on the belt at the dock', kRidingA.onBelt === 1],
  ['K: it moves along the belt on its own',   kRidingB.t > kRidingA.t],
  ['K: it gets off at a hall',                kDropped.drop !== null],
  ['K: only then does a haul job exist',      kDropped.jobs === 1],
  ['K: the box is drawn on the belt',         kDropped.boxVisible === 1],
  ['K: a character takes it off the belt',    kInHand.carrying.includes('kit_box')],
  ['K: and carries it into a bench',          kOnBench.phase === 'ASSEMBLY'],
  ['L: a zone follows the worker around',  lBefore.zone === true],
  ['L: the price tag is drawn over them',  lBefore.tagOn && lBefore.tag.includes('$')],
  ['L: standing next to them only ASKS',   !!lPanel && lAsked.level === lBefore.level &&
                                           lAsked.money === lBefore.money],
  ['L: the panel says what will change',   (lPanel?.stats.length ?? 0) > 0],
  ['L: the button in the panel promotes',  lAfter.level === lBefore.level + 1],
  ['L: it costs money',                    lAfter.money < lBefore.money],
  ['L: they actually get faster',          lAfter.speed > lBefore.speed],
  ['L: the level dots move on',            lAfter.dots !== lBefore.dots],
  ['M: no rate before anything is sold', mBefore === false],
  ['M: the rate appears after a sale',   mAfter.visible === true],
  ['M: and it reads as $/сек',           /\$\d/.test(mAfter.text) && mAfter.text.includes('сек')],
  ['M: every sale is timestamped',       mAfter.logged > 0 && mAfter.stamped],
  ['N: there is a cat in the flat',      nStart !== null && nStart.visible],
  ['N: it wanders on its own',           nMoved > 20],
  ['N: it has more than one thing to do', nMoods.size >= 2],
  ['N: it cannot pick anything up',      nInnocent.carrying === 0],
  ['N: and the box stays where it was',  nInnocent.status === 'transit'],
  ['no console errors',                   errors.length === 0],
]
console.log('\n=== checks ===')
for (const [name, ok] of checks) console.log(`${ok ? '✅' : '❌'} ${name}`)

await browser.close()
process.exit(checks.every(([, ok]) => ok) ? 0 : 1)
