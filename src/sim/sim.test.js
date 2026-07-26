import { describe, it, expect } from 'vitest'
import { createWorld, serializeWorld } from './world.js'
import { advance } from './loop.js'
import { dispatch } from './commands.js'
import { SYSTEMS } from './systems/index.js'
import { EV } from './events.js'
import {
  Phase, DeliveryStatus, KIT_TYPES, createState, startAssembly,
} from '../state/gameState.js'
import { TICK_MS, MAX_CATCHUP_STEPS } from '../state/config.js'
import { apartment } from '../defs/layouts/index.js'

// Deterministic rng: cycles through a fixed sequence so quality outcomes and
// overheat rolls are reproducible.
function seq(values) {
  let i = 0
  return () => values[i++ % values.length]
}

const T0 = 1_000_000

// C3: phase/activeKit/assemblyQuality live on a station now. These tests were
// written for one bench, so the factory keeps accepting the old field names and
// puts them where they belong.
const BENCH_FIELDS = { phase: 'phase', activeKit: 'kitId', assemblyQuality: 'quality' }

function world(overrides = {}, opts = {}) {
  const stationPatch = {}
  const statePatch   = {}
  for (const [k, v] of Object.entries(overrides)) {
    if (BENCH_FIELDS[k]) stationPatch[BENCH_FIELDS[k]] = v
    else statePatch[k] = v
  }
  const base  = createState()
  const state = {
    ...base, money: 5000, ...statePatch,
    stations: base.stations.map((st, i) => (i === 0 ? { ...st, ...stationPatch } : st)),
  }
  return createWorld({ state, salesLog: [] }, { now: T0, rng: opts.rng ?? seq([0.5]) })
}

// The single bench these tests talk about.
const bench = (w) => w.game.stations[0]

// Puts the carried delivery onto the default station. C2's bench zone does this
// in the game; here it keeps the setup of these older tests to one line.
function putOnBench(w) {
  w.game = startAssembly(w.game, 'station-0')
}

// Runs the sim forward by `ms` in real-sized chunks, collecting every event.
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

const types = (events) => events.map(e => e.t)

describe('sim/loop', () => {
  it('advances in fixed steps and leaves the remainder for the next call', () => {
    const w = world()
    advance(w, T0 + TICK_MS * 3 + 20, SYSTEMS)
    expect(w.now).toBe(T0 + TICK_MS * 3)
  })

  it('does nothing when no full tick has elapsed', () => {
    const w = world()
    const events = advance(w, T0 + TICK_MS - 1, SYSTEMS)
    expect(w.now).toBe(T0)
    expect(events).toEqual([])
  })

  it('caps catch-up work but never lets the clock fall behind wall time', () => {
    const w = world()
    const hour = 3_600_000
    advance(w, T0 + hour, SYSTEMS)
    expect(w.now).toBe(T0 + hour)
  })

  it('is deterministic — same inputs, same world', () => {
    const build = () => {
      const w = world({ upgrades: { ...createState().upgrades, solderingLevel: 2 } }, { rng: seq([0.1, 0.9, 0.5]) })
      dispatch(w, 'order', { kitId: 'mini_drone' })
      run(w, 60_000)
      return w
    }
    expect(serializeWorld(build())).toEqual(serializeWorld(build()))
  })
})

describe('sim/deliverySystem', () => {
  it('announces an arrival exactly once', () => {
    const w = world()
    dispatch(w, 'order', { kitId: 'mini_drone' })
    const arrivals = run(w, KIT_TYPES.mini_drone.deliveryMs + 1000)
      .filter(e => e.t === EV.DELIVERY_ARRIVED)
    expect(arrivals).toHaveLength(1)
    expect(arrivals[0].kitId).toBe('mini_drone')
  })

  it('does not announce before readyAt', () => {
    const w = world()
    dispatch(w, 'order', { kitId: 'mini_drone' })
    const events = run(w, KIT_TYPES.mini_drone.deliveryMs - 500)
    expect(types(events)).not.toContain(EV.DELIVERY_ARRIVED)
  })

  it('prunes arrival markers once the delivery is consumed', () => {
    const w = world()
    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, KIT_TYPES.mini_drone.deliveryMs + 500)
    dispatch(w, 'pickup', { deliveryId: w.game.deliveries[0].id })
    putOnBench(w)                                     // box lands on the bench
    run(w, 500)
    expect(w.announcedArrivals).toEqual([])
  })
})

describe('sim/stationSystem', () => {
  const semiAutoUpgrades = { ...createState().upgrades, solderingLevel: 2 }

  // A bench only works while somebody is at it, so these need a real room with
  // zones and a character standing in front of the station.
  function benchWithKit(kitId = 'mini_drone', upgrades = semiAutoUpgrades, { attended = true } = {}) {
    const base = createState()
    const state = {
      ...base, money: 5000, upgrades,
      stations: base.stations,
    }
    const w = createWorld({ state, salesLog: [] }, { now: T0, rng: seq([0.5]), layout: apartment })
    dispatch(w, 'order', { kitId })
    run(w, KIT_TYPES[kitId].deliveryMs + 500)
    dispatch(w, 'pickup', { deliveryId: w.game.deliveries[0].id })
    putOnBench(w)

    const zone = w.zones.find(z => z.kind === 'bench')
    const p = w.agents.find(a => a.kind === 'player')
    if (attended) { p.x = zone.cx; p.y = zone.cy } else { p.x = 900; p.y = 950 }
    return w
  }

  it('an empty bench builds nothing, however good the iron', () => {
    const w = benchWithKit('mini_drone', semiAutoUpgrades, { attended: false })
    expect(types(run(w, 30_000))).not.toContain(EV.STAGE_STARTED)
    expect(bench(w).phase).toBe(Phase.ASSEMBLY)
  })

  it('it picks up again when someone comes back', () => {
    const w = benchWithKit('mini_drone', semiAutoUpgrades, { attended: false })
    run(w, 10_000)
    const zone = w.zones.find(z => z.kind === 'bench')
    const p = w.agents.find(a => a.kind === 'player')
    p.x = zone.cx; p.y = zone.cy
    expect(types(run(w, 30_000))).toContain(EV.ASSEMBLY_DONE)
  })

  it('the semi-auto bench solders every point on its own', () => {
    const w = benchWithKit()
    const kit = KIT_TYPES.mini_drone
    const events = run(w, 60_000)

    expect(types(events).filter(t => t === EV.STAGE_STARTED)).toHaveLength(kit.solderPointCount)
    expect(types(events).filter(t => t === EV.STAGE_DONE)).toHaveLength(kit.solderPointCount)
    expect(types(events)).toContain(EV.ASSEMBLY_DONE)
    expect(bench(w).phase).toBe(Phase.READY)
  })

  it('reports stage labels from the kit definition', () => {
    const w = benchWithKit()
    const first = run(w, TICK_MS * 2).find(e => e.t === EV.STAGE_STARTED)
    expect(first.label).toBe(KIT_TYPES.mini_drone.assemblySteps[0].label)
    expect(first.total).toBe(KIT_TYPES.mini_drone.solderPointCount)
    expect(first.done).toBe(0)
  })

  it('a level-2 iron does the work for the player standing at the bench', () => {
    const semi = { ...createState().upgrades, solderingLevel: 2 }
    const w = benchWithKit('mini_drone', semi)
    expect(types(run(w, 10_000))).toContain(EV.ASSEMBLY_DONE)
  })

  it('a hand iron never solders by itself, even with the player standing there', () => {
    const manual = { ...createState().upgrades, solderingLevel: 0 }
    const w = benchWithKit('mini_drone', manual)
    expect(types(run(w, 30_000))).not.toContain(EV.STAGE_STARTED)
    expect(bench(w).phase).toBe(Phase.ASSEMBLY)
  })

  it('stops running once the assembly finishes', () => {
    const w = benchWithKit()
    run(w, 60_000)
    expect(w.stationRuntime['station-0'].running).toBe(false)
  })
})

describe('sim/commands', () => {
  it('order charges the kit cost and books a slot', () => {
    const w = world({ money: 200 })
    dispatch(w, 'order', { kitId: 'mini_drone' })
    expect(w.game.money).toBe(200 - KIT_TYPES.mini_drone.cost)
    expect(w.game.deliveries).toHaveLength(1)
  })

  it('manual pickup is rejected while the delivery is still in transit', () => {
    const w = world()
    dispatch(w, 'order', { kitId: 'mini_drone' })
    const id = w.game.deliveries[0].id
    const events = dispatch(w, 'pickup', { deliveryId: id })
    expect(types(events)).toContain(EV.COMMAND_REJECTED)
    expect(w.game.deliveries[0].status).toBe(DeliveryStatus.TRANSIT)
  })

  it('manual pickup works once the delivery has arrived', () => {
    const w = world()
    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, KIT_TYPES.mini_drone.deliveryMs + 500)
    dispatch(w, 'pickup', { deliveryId: w.game.deliveries[0].id })
    expect(w.game.deliveries[0].status).toBe(DeliveryStatus.CARRYING)
  })

  it('a cold solder point applies a penalty instead of a point', () => {
    const w = world({ phase: Phase.ASSEMBLY, activeKit: 'mini_drone' }, { rng: seq([0.99]) })
    const events = dispatch(w, 'solderResult', { quality: 0.1 })
    expect(types(events)).toContain(EV.STAGE_COLD)
    expect(bench(w).solderPoints).toHaveLength(0)
    expect(bench(w).coldPenalty).toBeGreaterThan(0)
  })

  it('a cold solder point can overheat and burn the kit', () => {
    const w = world({ phase: Phase.ASSEMBLY, activeKit: 'mini_drone' }, { rng: seq([0.0]) })
    const events = dispatch(w, 'solderResult', { quality: 0.1 })
    expect(types(events)).toContain(EV.KIT_BURNT)
    expect(bench(w).phase).toBe(Phase.BURNT)
  })

  it('the rewarded ×2 hook tops up a sale that already happened', () => {
    const w = world({ money: 0 })
    w.salesLog.push({ quality: 1, price: 100 })
    dispatch(w, 'grantSaleBonus', { multiplier: 2 })
    expect(w.game.money).toBeCloseTo(100)
    expect(w.salesLog[0].price).toBeCloseTo(200)
  })

  it('the ×2 bonus cannot be claimed twice for one sale', () => {
    const w = world({ money: 0 })
    w.salesLog.push({ quality: 1, price: 100 })
    dispatch(w, 'grantSaleBonus')
    dispatch(w, 'grantSaleBonus')
    expect(w.game.money).toBeCloseTo(100)
  })

  it('every command marks the state dirty so persistence has one hook', () => {
    const w = world()
    expect(types(dispatch(w, 'setOnboarded'))).toContain(EV.STATE_DIRTY)
  })

  it('rejects an unknown command loudly', () => {
    expect(() => dispatch(world(), 'teleport')).toThrow(/невідома команда/)
  })
})

describe('sim — full cycle, headless', () => {
  it('order → deliver → assemble → sell turns a profit with a full-auto shop', () => {
    const base = createState()
    const w = createWorld({
      state: { ...base, money: 500, upgrades: { ...base.upgrades, solderingLevel: 2 } },
      salesLog: [],
    }, { now: T0, rng: seq([0.5]), layout: apartment })
    const startMoney = w.game.money

    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, KIT_TYPES.mini_drone.deliveryMs + 500)   // courier arrives
    dispatch(w, 'pickup', { deliveryId: w.game.deliveries[0].id })
    putOnBench(w)                                     // carried to the bench

    // Someone has to be at the bench for it to run (see stationSystem).
    const zone = w.zones.find(z => z.kind === 'bench')
    const p = w.agents.find(a => a.kind === 'player')
    p.x = zone.cx; p.y = zone.cy

    const events = run(w, 60_000)

    expect(types(events)).toContain(EV.ASSEMBLY_DONE)
    expect(bench(w).phase).toBe(Phase.READY)

    // Selling happens at the mailbox zone now (C5), which has its own tests in
    // zone.test.js; here it is enough that the bench produced a sellable drone.
    expect(bench(w).quality).toBeGreaterThan(0)
    expect(w.game.deliveries).toEqual([])
    expect(startMoney).toBeGreaterThan(0)
  })

  it('runs two deliveries in parallel without losing one', () => {
    const w = world({
      money: 1000,
      upgrades: { ...createState().upgrades, storageLevel: 1 },
    })
    dispatch(w, 'order', { kitId: 'mini_drone' })
    dispatch(w, 'order', { kitId: 'racing_drone' })
    expect(w.game.deliveries).toHaveLength(2)

    run(w, 20_000)
    // Both arrive and wait in their own slots. Nobody is hired, so nothing
    // claims them — C5's couriers do that, and have their own tests.
    expect(w.game.deliveries).toHaveLength(2)
    expect(w.game.deliveries.every(d => d.status === DeliveryStatus.TRANSIT)).toBe(true)

    // One of them can then be claimed without disturbing the other.
    dispatch(w, 'pickup', { deliveryId: w.game.deliveries[0].id })
    const carrying = w.game.deliveries.filter(d => d.status === DeliveryStatus.CARRYING)
    expect(carrying).toHaveLength(1)
  })

  it('serialises to exactly what save/storage.js expects', () => {
    const w = world()
    dispatch(w, 'order', { kitId: 'mini_drone' })
    const saved = serializeWorld(w)
    expect(Object.keys(saved).sort()).toEqual(['salesLog', 'state'])
    expect(saved.state.deliveries).toHaveLength(1)
    // Runtime-only fields must not leak into the save file.
    expect(saved.state).not.toHaveProperty('stationRuntime')
    expect(saved.state).not.toHaveProperty('rng')
  })
})
