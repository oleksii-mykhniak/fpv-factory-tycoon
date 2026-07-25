import { describe, it, expect } from 'vitest'
import { createWorld, serializeWorld } from './world.js'
import { advance } from './loop.js'
import { dispatch } from './commands.js'
import { SYSTEMS } from './systems/index.js'
import { EV } from './events.js'
import { Phase, DeliveryStatus, KIT_TYPES, createState } from '../state/gameState.js'
import { TICK_MS, MAX_CATCHUP_STEPS } from '../state/config.js'

// Deterministic rng: cycles through a fixed sequence so quality outcomes and
// overheat rolls are reproducible.
function seq(values) {
  let i = 0
  return () => values[i++ % values.length]
}

const T0 = 1_000_000

function world(overrides = {}, opts = {}) {
  const state = { ...createState(), money: 5000, ...overrides }
  return createWorld({ state, salesLog: [] }, { now: T0, rng: opts.rng ?? seq([0.5]) })
}

// Runs the sim forward by `ms` in real-sized chunks, collecting every event.
function run(w, ms) {
  const events = []
  const target = w.now + ms
  // Advance in MAX_CATCHUP_STEPS-sized chunks so long runs are not capped —
  // this is what the engine does frame by frame.
  while (w.now < target) {
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
      const w = world({ upgrades: { ...createState().upgrades, solderingLevel: 3 } }, { rng: seq([0.1, 0.9, 0.5]) })
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
    const w = world({ upgrades: { ...createState().upgrades, workerLevel: 1 } })
    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, KIT_TYPES.mini_drone.deliveryMs + 500)   // arrives → worker picks it up
    dispatch(w, 'benchArrived')                      // box lands on the bench
    run(w, 500)
    expect(w.announcedArrivals).toEqual([])
  })
})

describe('sim/workerSystem', () => {
  it('MANUAL mode never auto-picks a delivery', () => {
    const w = world()   // workerLevel 0 = MANUAL
    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, KIT_TYPES.mini_drone.deliveryMs + 2000)
    expect(w.game.deliveries[0].status).toBe(DeliveryStatus.TRANSIT)
    expect(w.worker.desired).toBeNull()
  })

  it('SEMI mode claims an arrived delivery and asks the worker to haul', () => {
    const w = world({ upgrades: { ...createState().upgrades, workerLevel: 1 } })
    dispatch(w, 'order', { kitId: 'mini_drone' })
    const events = run(w, KIT_TYPES.mini_drone.deliveryMs + 500)
    expect(types(events)).toContain(EV.DELIVERY_PICKED)
    expect(w.game.deliveries[0].status).toBe(DeliveryStatus.CARRYING)
    expect(w.worker.desired).toBe('haul')
  })

  it('keeps hauling while a box is in hand, whatever the phase', () => {
    const w = world({ upgrades: { ...createState().upgrades, workerLevel: 1 } })
    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, KIT_TYPES.mini_drone.deliveryMs + 500)
    run(w, 5000)
    expect(w.worker.desired).toBe('haul')   // must not be reset mid-carry
  })

  it('AUTO mode asks the worker to solder once a kit is on the bench', () => {
    const w = world({ upgrades: { ...createState().upgrades, workerLevel: 2 } })
    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, KIT_TYPES.mini_drone.deliveryMs + 500)
    dispatch(w, 'benchArrived')
    run(w, TICK_MS)
    expect(w.game.phase).toBe(Phase.ASSEMBLY)
    expect(w.worker.desired).toBe('solder')
  })

  it('sends the worker to the trash when scrap is requested', () => {
    const w = world()
    dispatch(w, 'startScrap')
    run(w, TICK_MS)
    expect(w.worker.desired).toBe('scrap')
  })
})

describe('sim/stationSystem', () => {
  const autoUpgrades = { ...createState().upgrades, solderingLevel: 3, workerLevel: 2 }

  function benchWithKit(kitId = 'mini_drone', upgrades = autoUpgrades) {
    const w = world({ upgrades })
    dispatch(w, 'order', { kitId })
    run(w, KIT_TYPES[kitId].deliveryMs + 500)
    dispatch(w, 'benchArrived')
    return w
  }

  it('AUTO arms itself and solders every point', () => {
    const w = benchWithKit()
    const kit = KIT_TYPES.mini_drone
    const events = run(w, 60_000)

    expect(types(events).filter(t => t === EV.STAGE_STARTED)).toHaveLength(kit.solderPointCount)
    expect(types(events).filter(t => t === EV.STAGE_DONE)).toHaveLength(kit.solderPointCount)
    expect(types(events)).toContain(EV.ASSEMBLY_DONE)
    expect(w.game.phase).toBe(Phase.READY)
  })

  it('reports stage labels from the kit definition', () => {
    const w = benchWithKit()
    const first = run(w, TICK_MS * 2).find(e => e.t === EV.STAGE_STARTED)
    expect(first.label).toBe(KIT_TYPES.mini_drone.assemblySteps[0].label)
    expect(first.total).toBe(KIT_TYPES.mini_drone.solderPointCount)
    expect(first.done).toBe(0)
  })

  it('SEMI waits to be armed by the player', () => {
    const semi = { ...createState().upgrades, solderingLevel: 2, workerLevel: 2 }
    const w = benchWithKit('mini_drone', semi)

    expect(types(run(w, 10_000))).not.toContain(EV.STAGE_STARTED)
    dispatch(w, 'armSolder')
    expect(types(run(w, 10_000))).toContain(EV.ASSEMBLY_DONE)
  })

  it('MANUAL leaves the bench alone', () => {
    const manual = { ...createState().upgrades, solderingLevel: 0, workerLevel: 2 }
    const w = benchWithKit('mini_drone', manual)
    expect(types(run(w, 30_000))).not.toContain(EV.STAGE_STARTED)
    expect(w.game.phase).toBe(Phase.ASSEMBLY)
  })

  it('disarms after the assembly finishes', () => {
    const w = benchWithKit()
    run(w, 60_000)
    expect(w.station.armed).toBe(false)
    expect(w.station.running).toBe(false)
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
    expect(w.game.solderPoints).toHaveLength(0)
    expect(w.game.coldSolderPenalty).toBeGreaterThan(0)
  })

  it('a cold solder point can overheat and burn the kit', () => {
    const w = world({ phase: Phase.ASSEMBLY, activeKit: 'mini_drone' }, { rng: seq([0.0]) })
    const events = dispatch(w, 'solderResult', { quality: 0.1 })
    expect(types(events)).toContain(EV.KIT_BURNT)
    expect(w.game.phase).toBe(Phase.BURNT)
  })

  it('sell pays out, logs the sale and clears the bench', () => {
    const w = world({ phase: Phase.READY, activeKit: 'mini_drone', assemblyQuality: 1, money: 0 })
    const events = dispatch(w, 'sell')
    const sale = events.find(e => e.t === EV.SALE_MADE)
    expect(sale.price).toBeGreaterThan(0)
    expect(w.game.money).toBeCloseTo(sale.price)
    expect(w.game.phase).toBe(Phase.IDLE)
    expect(w.salesLog).toHaveLength(1)
  })

  it('the rewarded ×2 hook doubles the payout', () => {
    const plain = world({ phase: Phase.READY, activeKit: 'mini_drone', assemblyQuality: 1, money: 0 })
    dispatch(plain, 'sell')
    const doubled = world({ phase: Phase.READY, activeKit: 'mini_drone', assemblyQuality: 1, money: 0 })
    dispatch(doubled, 'sell', { priceMultBonus: 2 })
    expect(doubled.game.money).toBeCloseTo(plain.game.money * 2)
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
    const w = world({
      money: 500,
      upgrades: { ...createState().upgrades, solderingLevel: 3, workerLevel: 2 },
    })
    const startMoney = w.game.money

    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, KIT_TYPES.mini_drone.deliveryMs + 500)   // courier arrives, worker claims it
    dispatch(w, 'benchArrived')                      // worker drops the box (view-driven)
    const events = run(w, 60_000)                    // bench solders every point

    expect(types(events)).toContain(EV.ASSEMBLY_DONE)
    expect(w.game.phase).toBe(Phase.READY)

    dispatch(w, 'sell')
    expect(w.game.phase).toBe(Phase.IDLE)
    expect(w.game.money).toBeGreaterThan(startMoney)
    expect(w.game.deliveries).toEqual([])
  })

  it('runs two deliveries in parallel without losing one', () => {
    const w = world({
      money: 1000,
      upgrades: { ...createState().upgrades, storageLevel: 1, workerLevel: 1 },
    })
    dispatch(w, 'order', { kitId: 'mini_drone' })
    dispatch(w, 'order', { kitId: 'racing_drone' })
    expect(w.game.deliveries).toHaveLength(2)

    run(w, 20_000)
    // Exactly one is being carried; the other waits its turn in its own slot.
    const carrying = w.game.deliveries.filter(d => d.status === DeliveryStatus.CARRYING)
    expect(carrying).toHaveLength(1)
    expect(w.game.deliveries).toHaveLength(2)
  })

  it('serialises to exactly what save/storage.js expects', () => {
    const w = world()
    dispatch(w, 'order', { kitId: 'mini_drone' })
    const saved = serializeWorld(w)
    expect(Object.keys(saved).sort()).toEqual(['salesLog', 'state'])
    expect(saved.state.deliveries).toHaveLength(1)
    // Runtime-only fields must not leak into the save file.
    expect(saved.state).not.toHaveProperty('station')
    expect(saved.state).not.toHaveProperty('rng')
  })
})
