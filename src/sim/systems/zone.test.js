import { describe, it, expect } from 'vitest'
import { createWorld } from '../world.js'
import { advance } from '../loop.js'
import { dispatch } from '../commands.js'
import { SYSTEMS } from './index.js'
import { dwellProgress } from './zone.js'
import { EV } from '../events.js'
import { apartment } from '../../defs/layouts/apartment.js'
import { Phase, KIT_TYPES, createState } from '../../state/gameState.js'
import { TICK_MS, MAX_CATCHUP_STEPS, ZONE_DWELL_BENCH_MS } from '../../state/config.js'

const T0 = 1_000_000
// Bench zones are generated from the built stations (C3), so look them up on
// the world rather than in the static layout.
const BENCH_ZONE = 'zone-station-0'
let _w = null
const zone = (id) => _w.zones.find(z => z.id === id)

function world(overrides = {}) {
  const base  = createState()
  const state = { ...base, money: 5000, ...overrides }
  _w = createWorld({ state, salesLog: [] }, { now: T0, rng: () => 0.5, layout: apartment })
  return _w
}

const bench = (w) => w.game.stations[0]

const player = (w) => w.agents.find(a => a.kind === 'player')

// Teleport rather than walk: zone behaviour is what is under test, not movement.
function standAt(w, { cx, cy }) {
  const p = player(w)
  p.x = cx
  p.y = cy
}

function run(w, ms) {
  const events = []
  const target = w.now + ms
  // Chunked so long runs are not capped, and stopping with less than a tick to
  // go: advance() deliberately banks a sub-tick remainder instead of consuming
  // it, so `while (now < target)` would spin forever.
  while (target - w.now >= TICK_MS) {
    const next = Math.min(target, w.now + TICK_MS * MAX_CATCHUP_STEPS)
    events.push(...advance(w, next, SYSTEMS))
  }
  return events
}

const types = (e) => e.map(x => x.t)
const carrying = (w) => player(w).carrying.map(i => i.type)

// Gets a delivery to the point where it is sitting in slot 0, unclaimed.
function withArrivedBox(w) {
  dispatch(w, 'order', { kitId: 'mini_drone' })
  // Stand well clear of every zone while the courier drives.
  standAt(w, { cx: 800, cy: 700 })
  run(w, KIT_TYPES.mini_drone.deliveryMs + 200)
  return w
}

describe('sim/zoneSystem — occupancy', () => {
  it('emits enter and exit as the character crosses the boundary', () => {
    const w = withArrivedBox(world())
    standAt(w, zone('slot0'))
    expect(types(run(w, TICK_MS))).toContain(EV.ZONE_ENTER)

    standAt(w, { cx: 800, cy: 700 })
    expect(types(run(w, 2000))).toContain(EV.ZONE_EXIT)
  })

  it('holds no progress in a zone with nothing to do', () => {
    const w = world()   // bench is idle and the player carries nothing
    standAt(w, zone(BENCH_ZONE))
    run(w, ZONE_DWELL_BENCH_MS * 2)
    expect(dwellProgress(w, 'player')).toBe(0)
  })
})

describe('sim/zoneSystem — dwell', () => {
  function benchWithBoxInHand() {
    const w = withArrivedBox(world())
    standAt(w, zone('slot0'))
    run(w, TICK_MS)                 // instant pickup
    standAt(w, zone(BENCH_ZONE))
    return w
  }

  it('fills progress while standing in an enabled zone', () => {
    const w = benchWithBoxInHand()
    run(w, ZONE_DWELL_BENCH_MS / 2)
    const p = dwellProgress(w, 'player')
    expect(p).toBeGreaterThan(0.3)
    expect(p).toBeLessThan(0.75)
  })

  it('does not fire before the dwell time is up', () => {
    const w = benchWithBoxInHand()
    run(w, ZONE_DWELL_BENCH_MS - 200)
    expect(bench(w).phase).toBe(Phase.IDLE)
  })

  it('fires once the dwell time is up', () => {
    const w = benchWithBoxInHand()
    const events = run(w, ZONE_DWELL_BENCH_MS + 200)
    expect(types(events)).toContain(EV.ZONE_FIRED)
    expect(bench(w).phase).toBe(Phase.ASSEMBLY)
  })

  it('drains progress on leaving instead of snapping to zero', () => {
    const w = benchWithBoxInHand()
    run(w, ZONE_DWELL_BENCH_MS * 0.8)
    const before = dwellProgress(w, 'player')

    standAt(w, { cx: 800, cy: 700 })
    run(w, 100)
    const after = dwellProgress(w, 'player')

    expect(after).toBeLessThan(before)
    expect(after).toBeGreaterThan(0)
  })

  it('an instant zone fires once per entry, not every tick', () => {
    const w = withArrivedBox(world())
    standAt(w, zone('slot0'))
    const events = run(w, 3000)
    expect(types(events).filter(t => t === EV.ZONE_FIRED)).toHaveLength(1)
  })

  it('a dwell zone keeps working while you stand in it', () => {
    // Drop the box, then keep standing: the bench should ask to be worked on
    // without making the player step out and back in.
    const w = benchWithBoxInHand()
    const events = run(w, ZONE_DWELL_BENCH_MS * 2 + 400)
    expect(bench(w).phase).toBe(Phase.ASSEMBLY)
    expect(types(events)).toContain(EV.WORK_REQUESTED)
  })
})

describe('sim/interactions — the full loop without a single tap', () => {
  it('slot → bench → mailbox pays out', () => {
    const w = withArrivedBox(world({
      upgrades: { ...createState().upgrades, solderingLevel: 3 },   // bench solders itself
    }))
    const startMoney = w.game.money

    // 1. Walk into the street slot: the box goes into the player's hands.
    standAt(w, zone('slot0'))
    run(w, TICK_MS * 2)
    expect(carrying(w)).toEqual(['kit_box'])

    // 2. Stand at the bench: the box goes down, assembly starts and completes.
    standAt(w, zone(BENCH_ZONE))
    run(w, ZONE_DWELL_BENCH_MS + 200)
    expect(carrying(w)).toEqual([])
    expect(bench(w).phase).toBe(Phase.ASSEMBLY)

    run(w, 60_000)
    expect(bench(w).phase).toBe(Phase.READY)

    // 3. Back to the bench to collect the finished drone.
    standAt(w, { cx: 800, cy: 700 })
    run(w, 3000)                       // clear the zone so it can fire again
    standAt(w, zone(BENCH_ZONE))
    run(w, ZONE_DWELL_BENCH_MS + 200)
    expect(carrying(w)).toEqual(['drone'])

    // 4. The mailbox completes the sale on the spot — no view required.
    standAt(w, zone('mailbox'))
    const events = run(w, 2000)
    expect(types(events)).toContain(EV.SALE_MADE)
    expect(carrying(w)).toEqual([])
    expect(w.game.money).toBeGreaterThan(startMoney)
    expect(bench(w).phase).toBe(Phase.IDLE)
  })

  it('refuses to hand over a box while the bench is busy', () => {
    const w = withArrivedBox(world())
    standAt(w, zone('slot0'))
    run(w, TICK_MS * 2)
    w.game = { ...w.game, stations: [{ ...bench(w), phase: Phase.ASSEMBLY, kitId: 'mini_drone' }] }

    standAt(w, zone(BENCH_ZONE))
    run(w, ZONE_DWELL_BENCH_MS + 500)
    expect(carrying(w)).toEqual(['kit_box'])   // still in hand
  })

  it('will not pick up a second box while one is already carried', () => {
    const w = withArrivedBox(world({ upgrades: { ...createState().upgrades, storageLevel: 1 } }))
    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, KIT_TYPES.mini_drone.deliveryMs + 200)

    standAt(w, zone('slot0'))
    run(w, TICK_MS * 2)
    standAt(w, zone('slot1'))
    run(w, TICK_MS * 4)

    expect(carrying(w)).toEqual(['kit_box'])
  })

  it('the mailbox ignores a character with empty hands', () => {
    const w = world()
    w.game = { ...w.game, stations: [{ ...bench(w), phase: Phase.READY, kitId: 'mini_drone', quality: 0.8 }] }
    standAt(w, zone('mailbox'))
    expect(types(run(w, 3000))).not.toContain(EV.SALE_MADE)
  })

  it('the piggy zone only opens the game when the player is actually broke', () => {
    const rich = world({ money: 5000 })
    standAt(rich, zone('piggy'))
    expect(types(run(rich, 1000))).not.toContain(EV.MINIGAME_REQUESTED)

    const broke = world({ money: 3 })
    standAt(broke, zone('piggy'))
    expect(types(run(broke, 1000))).toContain(EV.MINIGAME_REQUESTED)
  })

  it('the trash bin opens the salvage game only after it is ordered', () => {
    const w = world()
    standAt(w, zone('trashbin'))
    expect(types(run(w, 3000))).not.toContain(EV.MINIGAME_REQUESTED)

    dispatch(w, 'startScrap')
    const events = run(w, 3000)
    expect(events.find(e => e.t === EV.MINIGAME_REQUESTED)?.game).toBe('scrap')
  })

  it('salvaged parts are carried to the bench, not teleported there', () => {
    const w = world()
    dispatch(w, 'startScrap')
    dispatch(w, 'scrapCollected', { agentId: 'player' })
    expect(carrying(w)).toEqual(['scrap'])
    expect(bench(w).phase).toBe(Phase.IDLE)

    standAt(w, zone(BENCH_ZONE))
    run(w, ZONE_DWELL_BENCH_MS + 200)
    expect(bench(w).phase).toBe(Phase.ASSEMBLY)
    expect(bench(w).kitId).toBe('scrap_drone')
    expect(carrying(w)).toEqual([])
  })
})
