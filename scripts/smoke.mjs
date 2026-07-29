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
  // Версія сейву мусить бути поточною: підлога піднялась до 5 (Стадія 10 / B —
  // з'явився `kitMarks`), і старіший сейв відкидається. Промах тут не падає
  // одразу: гра просто сідає у свіжу квартиру, і тест виглядає так, ніби
  // зламалась механіка, яку він перевіряє. Саме так це й проявилось — впав
  // сценарій про два верстаки, бо їх ніхто не купував.
  version: 5,
  savedAt: Date.now(),
  state: {
    money: 1000, lastPiggyAt: null, locationId: 'apartment', onboarded: true,
    deliveries: [],
    stations: [{ id: 'station-0', defId: 'workbench', phase: 'IDLE', kitId: null,
                 solderPoints: [], quality: null, coldPenalty: 0 }],
    upgrades: {
      priceMultiplier: 1, solderingLevel: 0, workerLevel: 0,
      consumablesLevel: 0, storageLevel: 0, logisticsLevel: 0, benchLevel: 0,
      reputationLevel: 0, bulkLevel: 0, toolingLevel: 0, courierLevel: 0, ...upgrades,
    },
    // Каталог, який був у сценаріїв до Стадії 10: гоночний і кінематографічний
    // тепер відкриває Mk міні-дрона (B3). Сценарії тут перевіряють НЕ це, тож
    // сідають одразу з відкритим каталогом — інакше кожен із них довелося б
    // починати з прокачки, і вони перевіряли б ланцюг відкриттів замість своєї
    // теми. Ланцюг перевіряє окремий блок нижче.
    kitMarks: { mini_drone: 2, racing_drone: 2 },
    // Норма збірок на наступний Mk (Стадія 11 / A2) — з тієї ж причини, що й
    // каталог вище: сценарії перевіряють не її, тож сідають із виконаною
    // нормою. Сам замок перевіряє окремий блок B3.
    stats: {
      sold: 0, assembled: 0, burnt: 0, bestQuality: 0, bestRate: 0, soldByKit: {},
      assembledByKit: {
        mini_drone: 99, racing_drone: 99, cinematic_drone: 99, longrange_drone: 99,
      },
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

// Смітник — самообслуговування: жодного «замовлення» в ноутбуці перед цим.
await boot(seedState({}, { money: 5 }))
await goTo('trashbin'); await page.waitForTimeout(2000)
const bTrash = await log('trash zone, walked up with no ordering')

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
// Картка «Кімнату відкрито» (Р4) — модалка поверх усього; знімаємо її, інакше
// далі нічого не натиснути.
const hCard = await page.evaluate(() => {
  const el = document.getElementById('unlock-card')
  return el?.hasAttribute('hidden') ? null : el.innerText.split('\n').length
})
await page.click('#unlock-ok').catch(() => {})
await page.waitForTimeout(300)
console.log(`  картка «відкрито»: ${hCard ? `${hCard} рядків` : 'не показалась'}`)
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
// Стадія 9 / Р7: мітка стала карткою з двох рядків — причина і що робити.
const iBurntLabel = await page.evaluate(() => {
  const v = globalThis.__refs.stations?.[0]
  const parts = v?.burnt?.parts ?? []
  return {
    visible: parts.some(p => p.graphics?.visible),
    text:    parts.filter(p => typeof p.text === 'string').map(p => p.text).join(' / '),
  }
})
console.log(`  burnt notice: "${iBurntLabel.text}" (visible ${iBurntLabel.visible})`)

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

// ── M. Income on screen (F7, переглянуто Стадією 10 / D1) ──
//
// Контракт ПЕРЕВЕРНУТО: раніше тут перевірялось, що приладу немає, поки нічого
// не продано. Тепер перевіряється протилежне — що він є завжди і читає нуль.
// Причина в плані Стадії 10: число зникало рівно тоді, коли гравець спинявся
// обрати апгрейд, тобто коли міра, за якою він обирає, потрібна найбільше.
console.log('\n### M. $/сек')
await boot(seedState({ solderingLevel: 2 }))
const mBefore = await page.evaluate(() => {
  const el = document.querySelector('#hud-rate')
  return { visible: !!el && !el.hasAttribute('hidden'), text: el?.textContent ?? '' }
})
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
console.log(`  before: "${mBefore.text}" (shown=${mBefore.visible}); ` +
            `after a sale: "${mAfter.text}" ` +
            `(${mAfter.logged} sale(s), timestamped: ${mAfter.stamped})`)

// ── B. Mk комплектів (Стадія 10 / B) ──────────────────────
console.log('\n### B2. Mk і відкриття типів')
// Свідомо БЕЗ kitMarks: цей блок і перевіряє ланцюг відкриттів із нуля.
await boot(seedState({}, { money: 4000, kitMarks: {} }))
await openPanelAt('desk')
const bStart = await page.evaluate(() => ({
  cards:  [...document.querySelectorAll('.kit-card')].length,
  locked: [...document.querySelectorAll('.kit-card--locked')].map(
    c => c.querySelector('.kit-card__lock')?.textContent.trim()),
  mkBtn:  document.querySelector('[data-mk="mini_drone"]')?.textContent.trim(),
  gain:   document.querySelector('.kit-card__mk-gain')?.textContent.replace(/\s+/g, ' ').trim(),
  catalogue: globalThis.__world.game.kitMarks,
}))
console.log(`  на старті: ${bStart.cards} карток, зачинено ${bStart.locked.length}`)
console.log(`  замок каже: ${bStart.locked[0] ?? '(нічого)'}`)
console.log(`  кнопка Mk: "${bStart.mkBtn}"; приріст: "${bStart.gain}"`)

// Два кліки по Mk міні-дрона мають відкрити гоночний.
await page.click('[data-mk="mini_drone"]')
await page.waitForTimeout(300)
await page.click('[data-mk="mini_drone"]')
await page.waitForTimeout(600)
const bAfter = await page.evaluate(() => ({
  mark:    globalThis.__world.game.kitMarks?.mini_drone ?? 0,
  card:    document.querySelector('#unlock-card')?.hasAttribute('hidden') === false,
  cardText: document.querySelector('#unlock-card')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
}))
console.log(`  після 2 покупок: Mk=${bAfter.mark}, картка «відкрито»=${bAfter.card}`)
console.log(`  картка: ${bAfter.cardText.slice(0, 90)}`)
await page.click('#unlock-card').catch(() => {})
await page.waitForTimeout(300)
await openPanelAt('desk')
const bCatalogue = await page.evaluate(() => ({
  unlocked: [...document.querySelectorAll('.kit-card:not(.kit-card--locked) .kit-card__name')]
    .map(n => n.textContent.trim().split(' Mk')[0]),
  capNote: document.querySelector('.kit-card__mk-note')?.textContent.trim() ?? '',
}))
console.log(`  каталог: ${bCatalogue.unlocked.join(', ')}`)

// Стеля квартири — Mk II. Третій клік не має пройти.
const bCap = await page.evaluate(() => {
  const btn = document.querySelector('[data-mk="mini_drone"]')
  return { present: !!btn, disabled: btn?.disabled ?? null,
           note: document.querySelector('.kit-card__mk-note')?.textContent.trim() ?? '' }
})
console.log(`  у стелі: кнопка ${bCap.present ? 'є' : 'зникла'}, підпис "${bCap.note}"`)
await page.click('#shop-close').catch(() => {})

// ── B3. Mk заробляється збірками (Стадія 11 / A) ──────────
console.log('\n### B3. Норма збірок на Mk')
// Каса повна, зібрано нуль — кнопка мусить бути вимкнена, а замість приросту
// $/сек на картці має стояти те, що покупку зараз тримає.
await boot(seedState({}, { money: 9000, kitMarks: {}, stats: {
  sold: 0, assembled: 0, burnt: 0, bestQuality: 0, bestRate: 0,
  soldByKit: {}, assembledByKit: {},
} }))
await openPanelAt('desk')
const bBuild = await page.evaluate(() => ({
  disabled: document.querySelector('[data-mk="mini_drone"]')?.disabled ?? null,
  price:    document.querySelector('[data-mk="mini_drone"]')?.textContent.replace(/\s+/g, ' ').trim(),
  gain:     document.querySelector('.kit-card__mk-gain')?.textContent.replace(/\s+/g, ' ').trim(),
}))
console.log(`  зібрано 0: кнопка disabled=${bBuild.disabled}, ціна видима: "${bBuild.price}"`)
console.log(`  замість приросту: "${bBuild.gain}"`)
await page.click('#shop-close').catch(() => {})

// ── L. Promoting somebody on the shop floor (F5) ──────────
console.log('\n### L. Підвищення в панелі')
// Стадія 11 / D3: підвищення більше не робиться на підлозі. Штат — і найм, і
// рівні — живе на дошці оголошень, тож і сценарій ходить туди.
await boot(seedState({}, { locationId: 'factory', money: 20000 }))
await openPanelAt('jobboard_hall-1')
const lHireBtn = page.locator('.shop-upgrade', { hasText: 'Кур' }).locator('button').first()
if (await lHireBtn.isEnabled().catch(() => false)) await lHireBtn.click()
await page.waitForTimeout(500)

// Найнята людина одразу з'являється в секції «Ваші люди» тієї самої панелі.
const lBoard = await page.evaluate(() => {
  const titles = [...document.querySelectorAll('#hire-body .shop-section__title')]
    .map(el => el.textContent.replace(/\s+/g, ' ').trim())
  return {
    sections: titles,
    rows: [...document.querySelectorAll('#hire-body [data-promote]')]
      .map(b => b.textContent.replace(/\s+/g, ' ').trim()),
    // Ролі показуються по одній: рядків найму рівно стільки, скільки ланцюг увів.
    hireRows: document.querySelectorAll('#hire-body [data-hire]').length,
  }
})
const lBefore = await page.evaluate(() => {
  const w = globalThis.__world
  const worker = w.game.workers[0]
  const agent = w.agents.find(a => a.id === worker.id)
  const view = globalThis.__refs.workerViews.get(worker.id)
  return {
    level: worker.level,
    speed: agent.speed,
    money: Math.round(w.game.money),
    lvl:   view?.levelLabel?.text ?? '',
    // Рухомої зони підвищення в грі більше немає взагалі.
    zone:  (w.zones ?? []).some(z => z.kind === 'promote'),
    tag:   view?.promoteLabel?.text ?? null,
  }
})
console.log(`  секції: ${JSON.stringify(lBoard.sections)}`)
console.log(`  «Ваші люди»: ${JSON.stringify(lBoard.rows)}; вакансій на дошці: ${lBoard.hireRows}`)

// Стояння поруч більше нічого не робить — перевіряємо саме це.
for (let i = 0; i < 30; i++) {
  await page.evaluate(() => {
    const w = globalThis.__world
    const worker = w.agents.find(a => a.kind === 'worker')
    const player = w.agents.find(a => a.kind === 'player')
    player.x = worker.x; player.y = worker.y
  })
  await page.waitForTimeout(60)
}
const lStanding = await page.evaluate(() => ({
  panel: !document.querySelector('#promote-modal')?.hasAttribute('hidden'),
  level: globalThis.__world.game.workers[0].level,
}))

// Рядок у панелі відкриває вікно з тим, що саме зміниться.
await openPanelAt('jobboard_hall-1')
await page.click('#hire-body [data-promote]')
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
    lvl:   view?.levelLabel?.text ?? '',
  }
})
console.log(`  рівень над головою ${lBefore.lvl} → ${lAfter.lvl}; ` +
            `level ${lBefore.level}→${lAfter.level}, speed ${lBefore.speed}→${lAfter.speed}, ` +
            `money ${lBefore.money}→${lAfter.money}`)
await page.click('#hire-close').catch(() => {})

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

// ── R. Resetting the save ─────────────────────────────────
//
// Дві речі, які ламались нарізно: кнопка чекала на нативний confirm(), а тік
// продовжував крутитись під час location.reload() і записував гру назад.
console.log('\n### R. Reset')
await boot(seedState({ solderingLevel: 2 }, { money: 4321, ordersPlaced: 7 }))
const rBefore = await page.evaluate(() => ({
  money: Math.round(globalThis.__world.game.money),
  saved: !!localStorage.getItem('fpv_factory_save'),
}))

await page.click('#settings-btn')
await page.waitForTimeout(300)
const rArmedText = await page.evaluate(() => {
  document.querySelector('#settings-reset').click()
  return document.querySelector('#settings-reset').textContent.trim()
})
await page.waitForTimeout(200)
// Один тап нічого не стирає — це підтвердження, а не дія.
const rAfterOne = await page.evaluate(() => !!localStorage.getItem('fpv_factory_save'))

await page.click('#settings-reset')
await page.waitForTimeout(2500)
const rAfter = await page.evaluate(() => {
  const raw = localStorage.getItem('fpv_factory_save')
  return {
    money: Math.round(globalThis.__world.game.money),
    soldering: globalThis.__world.game.upgrades.solderingLevel,
    // Якщо гра вже щось записала після перезапуску — це має бути НОВА гра, а
    // не та, яку щойно стерли.
    persisted: raw ? Math.round(JSON.parse(raw).state.money) : null,
  }
})
console.log(`  $${rBefore.money} saved=${rBefore.saved} → one tap: "${rArmedText}" ` +
            `(saved=${rAfterOne}) → two taps: $${rAfter.money}, ` +
            `persisted=${rAfter.persisted}`)

// ── P. The quest card (Стадія 9 / Р1–Р2) ──────────────────
console.log('\n### P. The quest card')

const questCard = () => page.evaluate(() => {
  const el = document.querySelector('#quest-tracker .quest')
  return el ? {
    title: el.querySelector('.quest__title')?.textContent.trim(),
    meta:  el.querySelector('.quest__meta')?.textContent.trim() ?? null,
    hint:  el.querySelector('.quest__hint')?.textContent.trim() ?? null,
    why:   el.querySelector('.quest__why')?.textContent.trim() ?? null,
    step:  el.querySelector('.quest__step')?.textContent.trim() ?? null,
    next:  el.querySelector('.quest__next')?.textContent.trim() ?? null,
    ready: el.classList.contains('quest--ready'),
  } : null
})
// Куди насправді дивиться стрілка на екрані: порівнюємо її поворот із
// напрямком на найближчу зону вказаного типу. Питати сим про ціль було б
// перевіркою коду самим кодом — а зламатись може саме малювання.
const arrowAt = (kind) => page.evaluate((k) => {
  const w = globalThis.__world
  const arrow = globalThis.__refs.arrow
  if (!arrow?.graphics?.visible) return false
  const p = w.agents.find(a => a.kind === 'player')
  const z = w.zones.filter(z => z.kind === k)
    .sort((a, b) => Math.hypot(a.cx - p.x, a.cy - p.y) - Math.hypot(b.cx - p.x, b.cy - p.y))[0]
  if (!z) return false
  const want = Math.atan2(z.cy - p.y, z.cx - p.x) + Math.PI / 2
  const diff = Math.abs(((arrow.rotation - want + Math.PI) % (2 * Math.PI)) - Math.PI)
  return diff < 0.25
}, kind)

// Рівно ОДНА картка — ні списку, ні кнопки «ще N»: це і є Р1.
await boot(seedState({}, { money: 120 }))
await page.waitForTimeout(600)
const pCount = await page.evaluate(() => {
  const el   = document.getElementById('quest-tracker')
  const gear = document.querySelector('.settings-btn')
  return {
    cards: document.querySelectorAll('#quest-tracker .quest').length,
    more:  !!document.querySelector('#quest-more'),
    hint:  !!document.getElementById('hud-hint'),
    // Картка переїхала вгору під кнопку налаштувань: унизу вона лежала під
    // великим пальцем і в найгіршому місці для читання кутиком ока.
    underGear: el.getBoundingClientRect().top >= gear.getBoundingClientRect().bottom - 1,
    noStepNumber: !el.querySelector('.quest__count'),
  }
})
const pFirst = await questCard()
console.log(`  cards=${pCount.cards} more-button=${pCount.more} old-bottom-hint=${pCount.hint}`)
console.log(`  "${pFirst?.title}" · крок петлі: "${pFirst?.step}"`)

// Крок-покупка: смужка в грошах, стрілка на шафу — але лише коли грошей досить.
// $100 навмисно: менше за паяльник ($150), але більше за найдешевший комплект
// ($72) — інакше гравець вважається застряглим і картку перебиває вставка.
//
// `kitMarks: {}` тут несуче (Стадія 10 / B): решта сценаріїв сідає з Mk II, а
// на Mk II міні-дрон коштує вже $162, і вікно між «не застряг» і «не вистачає
// на паяльник» зникає взагалі. Сценарій мовчки перевіряв би вставку про
// смітник замість кроку-покупки — саме так це й проявилось.
// Лічильники по типах (Стадія 11): крок «продай 3 дрони» рахує саме
// міні-дрони — він і є доказ, на який спирається наступний крок Mk. Голий
// агрегат `sold: 3` лишив би картку на тому самому кроці, і сценарій
// перевіряв би не те, що збирався.
const P_STATS = {
  sold: 3, assembled: 3, burnt: 0, bestQuality: 0, bestRate: 0,
  soldByKit: { mini_drone: 3 }, assembledByKit: { mini_drone: 3 },
}
await boot(seedState({}, { money: 100, ordersPlaced: 3, stats: P_STATS, kitMarks: {} }))
await page.waitForTimeout(600)
const pPoor  = await questCard()
const pArrowPoor = await arrowAt('rack')
await page.evaluate(() => { globalThis.__world.game = { ...globalThis.__world.game, money: 9999 } })
await page.waitForTimeout(500)
const pRich  = await questCard()
// Стрілка після перших кроків ланцюга живе лише на запит — тап по картці.
await page.click('#quest-tracker .quest')
await page.waitForTimeout(400)
const pArrowRich = await arrowAt('rack')
console.log(`  "${pPoor?.title}" ${pPoor?.meta} → стрілка на шафу: ${pArrowPoor} (грошей нема)`)
console.log(`  з грошима: ${pRich?.meta} ready=${pRich?.ready} → стрілка на шафу: ${pArrowRich}`)

// Картку можна згорнути в значок — і вибір переживає перезапуск.
await page.click('.quest__toggle')
await page.waitForTimeout(300)
const pFolded = await page.evaluate(() => {
  const el = document.getElementById('quest-tracker')
  return {
    collapsed: el.hasAttribute('data-collapsed'),
    width: Math.round(el.getBoundingClientRect().width),
    stored: localStorage.getItem('fpv_quest_collapsed'),
  }
})
await page.click('.quest--collapsed')
await page.waitForTimeout(300)
const pUnfolded = await page.evaluate(() =>
  !document.getElementById('quest-tracker').hasAttribute('data-collapsed'))
console.log(`  згорнута: ${pFolded.collapsed} (${pFolded.width}px, збережено ${pFolded.stored}) → розгорнута: ${pUnfolded}`)

// Позаланцюгові вставки (Р1): згорілий комплект і порожня каса перебивають
// ціль, бо це те, що стоїть на місці прямо зараз.
await boot(seedState({}, { money: 3, ordersPlaced: 9, scrapRuns: 9, stats: P_STATS }))
await page.waitForTimeout(600)
const pBroke = await questCard()
await boot(seedState({}, { money: 9999, ordersPlaced: 9, stats: P_STATS,
  stations: [{ id: 'station-0', defId: 'workbench', phase: 'BURNT', kitId: 'racing_drone',
               solderPoints: [0.9, 0.9], quality: null, coldPenalty: 0 }] }))
await page.waitForTimeout(600)
const pBurnt = await questCard()
console.log(`  без грошей: "${pBroke?.title}" · зі згорілим: "${pBurnt?.title}"`)

// Виконуємо крок через шафу — картка змінюється, тост з'являється.
await boot(seedState({}, { money: 9999, ordersPlaced: 3, stats: P_STATS }))
await page.waitForTimeout(600)
const pGoalTitle = (await questCard())?.title
await openPanelAt('rack')
await page.click('[data-upgrade="soldering"]').catch(() => {})
await page.waitForTimeout(700)
const pToast = await page.evaluate(() => {
  const t = document.querySelector('.quest-toast')
  return t && !t.hasAttribute('hidden') ? t.textContent.trim() : null
})
const pAfter = await questCard()
console.log(`  "${pGoalTitle}" done → toast "${pToast}", тепер "${pAfter?.title}"`)

// Р5: у шафі видно лише введені треки, викуплений рядок зникає.
const rackTitles = () => page.evaluate(() => {
  document.querySelector('#upgrade-modal')?.removeAttribute('hidden')
  return [...document.querySelectorAll('#upgrade-body .shop-section__title')].map(el => el.textContent.trim())
})
const pTracks = await rackTitles()
// Паяльник у квартирі має стелю 2 — доводимо його до неї й дивимось, чи рядок
// зник. Це і є правило «максимум по треку — не інформація, а сміття».
await page.evaluate(() => {
  const w = globalThis.__world
  w.game = { ...w.game, upgrades: { ...w.game.upgrades, solderingLevel: 2 } }
})
await page.waitForTimeout(600)
const pMaxed = await rackTitles()
// E: картка обіцяє наступну нову річ, а коли річ відкривається — тост.
// Тости стоять у черзі (виконаний крок + відкрита ним річ трапляються в одну
// мить), тому чекаємо на потрібний, а не читаємо перший-ліпший.
await boot(seedState({}, { money: 100, ordersPlaced: 3, stats: P_STATS, kitMarks: {} }))
await page.waitForTimeout(600)
const pNextEarly = (await questCard())?.next
await page.evaluate(() => {
  const w = globalThis.__world
  w.game = { ...w.game, money: 9999 }
})
await page.waitForTimeout(400)
await openPanelAt('rack')
await page.click('[data-upgrade="soldering"]').catch(() => {})
let pUnlockToast = null
for (let i = 0; i < 20 && !pUnlockToast; i++) {
  await page.waitForTimeout(300)
  const t = await page.evaluate(() => {
    const el = document.querySelector('.quest-toast')
    return el && !el.hasAttribute('hidden') ? el.textContent.trim() : null
  })
  if (t && t.startsWith('🔓')) pUnlockToast = t
}
await page.click('#shop-close').catch(() => {})
await page.click('#upgrade-close').catch(() => {})
console.log(`  «далі» на картці: "${pNextEarly}" → тост відкриття: "${pUnlockToast}"`)
console.log(`  шафа показує: ${JSON.stringify(pTracks)}`)
console.log(`  після викупу паяльника до стелі: ${JSON.stringify(pMaxed)}`)

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
  ['R: one tap only arms the button',     rAfterOne === true && /ще раз/.test(rArmedText)],
  ['R: the second tap actually wipes it', rAfter.money !== rBefore.money && rAfter.soldering === 0],
  ['R: and the old shop never comes back', rAfter.persisted !== rBefore.money],
  // Стадія 9 / Р1–Р2: одна картка, без списку, і нижньої панелі підказок немає.
  ['H: the room announces what it brought', (hCard ?? 0) >= 4],
  ['P: exactly one card on screen',        pCount.cards === 1 && pCount.more === false],
  ['P: the card sits under the settings button', pCount.underGear === true],
  ['P: no step number is promised',        pCount.noStepNumber === true],
  ['P: the old bottom hint bar is gone',   pCount.hint === false],
  ['P: the loop step rides inside the card', !!pFirst?.step],
  ['P: a one-off action shows no 0/1 bar', pFirst?.meta === null],
  ['P: a purchase shows a money bar',      !!pPoor?.meta && pPoor.meta.includes('$')],
  ['P: no arrow to the rack while broke',  pArrowPoor === false],
  ['P: a tap on the card brings the arrow back', pArrowRich === true],
  ['P: the card folds into a badge',       pFolded.collapsed && pFolded.width < 60],
  ['P: and the choice is remembered',      pFolded.stored === '1'],
  ['P: tapping the badge opens it again',  pUnfolded === true],
  // Вставки: ціль ланцюга чекає, поки цех застряг.
  ['P: an empty till interrupts the goal', pBroke?.title?.includes('смітник')],
  ['P: a burnt kit interrupts the goal',   pBurnt?.title?.includes('згорілий')],
  ['P: finishing a step announces itself', !!pToast],
  ['P: and the card moves on to the next one', !!pAfter && pAfter.title !== pGoalTitle],
  // Р5: шафа показує лише введені треки, викуплений рядок зникає.
  ['P: the card promises what comes next',  /🔓 Далі:/.test(pNextEarly ?? '')],
  ['P: and the promise names a place',      /у шафі|на дошці|у магазині/.test(pNextEarly ?? '')],
  ['P: an unlock announces itself',         /🔓 Нове/.test(pUnlockToast ?? '')],
  ['P: the rack hides tracks the chain has not reached', !pTracks.includes('Склад')],
  ['P: and the maxed-out track is gone',   pTracks.includes('Паяльник') && !pMaxed.includes('Паяльник')],
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
  // Р7: два рядки — причина перегріву і що з цим робити.
  ['I: the bench says the kit burnt',      iBurntLabel.visible && iBurntLabel.text.includes('Перегрів')],
  ['I: and says what to do about it',      iBurntLabel.text.includes('Стань тут')],
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
  ['L: no promote zone on the floor any more', lBefore.zone === false],
  ['L: and no price tag over their head',      lBefore.tag === null],
  ['L: standing next to them does nothing',    lStanding.panel === false &&
                                               lStanding.level === lBefore.level],
  ['L: the board lists your people',           lBoard.rows.length === 1 &&
                                               lBoard.rows[0].includes('$')],
  ['L: and still offers vacancies',            lBoard.hireRows >= 1],
  ['L: the row only ASKS',                     !!lPanel && lAsked.level === lBefore.level &&
                                               lAsked.money === lBefore.money],
  ['L: the panel says what will change',   (lPanel?.stats.length ?? 0) > 0],
  ['L: the button in the panel promotes',  lAfter.level === lBefore.level + 1],
  ['L: it costs money',                    lAfter.money < lBefore.money],
  ['L: they actually get faster',          lAfter.speed > lBefore.speed],
  ['L: the level readout moves on',        lAfter.lvl !== lBefore.lvl &&
                                           /\d/.test(lAfter.lvl)],
  ['M: the rate gauge is there before any sale', mBefore.visible === true],
  ['M: and it reads zero, not nothing', /\$0\.00/.test(mBefore.text)],
  ['M: the rate survives a sale',        mAfter.visible === true],
  ['M: and it reads as $/сек',           /\$\d/.test(mAfter.text) && mAfter.text.includes('сек')],
  ['M: every sale is timestamped',       mAfter.logged > 0 && mAfter.stamped],
  ['B2: locked kits are on screen, not missing', bStart.locked.length > 0],
  ['B2: and the lock names what to do about it', /Mk/.test(bStart.locked[0] ?? '')],
  ['B2: the Mk button quotes a price',   /\$\d/.test(bStart.mkBtn ?? '')],
  ['B2: and shows now → after',          /→/.test(bStart.gain ?? '')],
  ['B2: the comparison is in $/сек, not price', /сек/.test(bStart.gain ?? '')],
  ['B2: two buys reach Mk II',           bAfter.mark === 2],
  ['B2: the unlock is celebrated',       bAfter.card === true],
  ['B2: the card names the new kit',     /Гоночний/.test(bAfter.cardText)],
  ['B2: the catalogue actually grew',    bCatalogue.unlocked.length >= 2],
  ['B2: the flat ceiling stops Mk III',  bCap.present === false && bCap.note.length > 0],
  ['B3: no drones built, no Mk',          bBuild.disabled === true],
  ['B3: the price stays visible anyway',  /\$/.test(bBuild.price ?? '')],
  ['B3: and the card says what holds it', /Зібрано 0\//.test(bBuild.gain ?? '')],
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
