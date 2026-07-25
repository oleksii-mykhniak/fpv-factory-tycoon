import { describe, it, expect } from 'vitest'
import { createWorld } from '../world.js'
import { advance } from '../loop.js'
import { dispatch } from '../commands.js'
import { SYSTEMS } from './index.js'
import { deriveJobs, reconcile } from './job.js'
import { EV } from '../events.js'
import { apartment } from '../../defs/layouts/index.js'
import { Phase, createState, startAssembly } from '../../state/gameState.js'
import { TICK_MS, MAX_CATCHUP_STEPS } from '../../state/config.js'

const T0 = 1_000_000

function world({ money = 20000, hire = [], upgrades = {}, benchLevel = 0 } = {}) {
  const base = createState()
  let state = {
    ...base,
    money,
    locationId: 'workshop',
    upgrades: { ...base.upgrades, benchLevel, ...upgrades },
  }
  const w = createWorld({ state, salesLog: [] }, { now: T0, rng: () => 0.5, layout: apartment })
  for (const role of hire) dispatch(w, 'hireWorker', { role })
  // Park the player far from every zone so the workers are unambiguously the
  // ones doing the work.
  const p = w.agents.find(a => a.kind === 'player')
  p.x = 900; p.y = 500
  return w
}

function run(w, ms) {
  const events = []
  const target = w.now + ms
  while (target - w.now >= TICK_MS) {
    events.push(...advance(w, Math.min(target, w.now + TICK_MS * MAX_CATCHUP_STEPS), SYSTEMS))
  }
  return events
}

const types = (e) => e.map(x => x.t)
const workers = (w) => w.agents.filter(a => a.kind === 'worker')
const station = (w, i = 0) => w.game.stations[i]

describe('sim/jobSystem — the board is derived, never accumulated', () => {
  it('an arrived box creates exactly one haul job', () => {
    const w = world()
    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, 5000)

    const jobs = deriveJobs(w)
    expect(jobs.filter(j => j.type === 'haul_delivery')).toHaveLength(1)
  })

  it('no job while the courier is still driving', () => {
    const w = world()
    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, 1000)
    expect(deriveJobs(w)).toHaveLength(0)
  })

  it('a bench mid-assembly wants a technician; a finished one wants a seller', () => {
    const w = world()
    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, 5000)
    dispatch(w, 'pickup', { deliveryId: w.game.deliveries[0].id })
    w.game = startAssembly(w.game, 'station-0')

    expect(deriveJobs(w).some(j => j.type === 'assemble')).toBe(true)

    w.game = {
      ...w.game,
      stations: [{ ...station(w), phase: Phase.READY, quality: 0.8 }],
    }
    expect(deriveJobs(w).some(j => j.type === 'sell_drone')).toBe(true)
  })

  it('never asks for more hauls than there are free benches', () => {
    const w = world({ upgrades: { storageLevel: 2 } })
    dispatch(w, 'order', { kitId: 'mini_drone' })
    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, 5000)
    // One station, two boxes waiting: only one of them is worth fetching.
    expect(deriveJobs(w).filter(j => j.type === 'haul_delivery')).toHaveLength(1)
  })

  it('reconcile keeps a claim across ticks', () => {
    const board = [{ id: 'haul_delivery:d1', type: 'haul_delivery', claimedBy: 'w1' }]
    const { next } = reconcile(board, [{ id: 'haul_delivery:d1', type: 'haul_delivery' }])
    expect(next[0].claimedBy).toBe('w1')
  })

  it('reconcile reports jobs that vanished', () => {
    const board = [{ id: 'a', claimedBy: 'w1' }, { id: 'b', claimedBy: null }]
    const { next, dropped } = reconcile(board, [{ id: 'b' }])
    expect(dropped).toEqual(['a'])
    expect(next).toHaveLength(1)
  })

  it('a worker lets go when the player does its job first', () => {
    const w = world({ hire: ['courier'] })
    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, 5000)
    run(w, 500)
    expect(workers(w)[0].task).not.toBeNull()

    // The player grabs the box from under them.
    dispatch(w, 'pickup', { deliveryId: w.game.deliveries[0].id })
    run(w, 500)
    expect(workers(w)[0].task).toBeNull()
  })
})

describe('sim/agentSystem — hired workers', () => {
  it('a courier fetches the box and puts it on the bench, unaided', () => {
    const w = world({ hire: ['courier'] })
    dispatch(w, 'order', { kitId: 'mini_drone' })

    const events = run(w, 45_000)

    expect(types(events)).toContain(EV.JOB_CLAIMED)
    expect(station(w).phase).toBe(Phase.ASSEMBLY)
    expect(station(w).kitId).toBe('mini_drone')
    expect(w.game.deliveries).toHaveLength(0)
  })

  it('a technician solders a bench even with a manual iron', () => {
    // soldering level 0 means the bench cannot run itself at all — the whole
    // point of hiring someone.
    const w = world({ hire: ['courier', 'tech'] })
    dispatch(w, 'order', { kitId: 'mini_drone' })

    run(w, 90_000)
    expect(station(w).phase).toBe(Phase.READY)
    expect(station(w).quality).toBeGreaterThan(0.3)
  })

  it('a seller carries the finished drone to the mailbox and banks it', () => {
    const w = world({ hire: ['courier', 'tech', 'seller'] })
    const before = w.game.money
    dispatch(w, 'order', { kitId: 'mini_drone' })

    run(w, 120_000)

    expect(station(w).phase).toBe(Phase.IDLE)
    expect(w.game.money).toBeGreaterThan(before - KIT_COST)
    expect(w.salesLog.length).toBeGreaterThan(0)
  })

  it('the whole shop runs without the player touching anything', () => {
    const w = world({ hire: ['courier', 'tech', 'seller'] })
    const before = w.game.money

    // Order four kits over time, exactly as an idle player would.
    for (let i = 0; i < 4; i++) {
      dispatch(w, 'order', { kitId: 'mini_drone' })
      run(w, 60_000)
    }
    run(w, 90_000)

    expect(w.salesLog.length).toBeGreaterThanOrEqual(3)
    expect(w.game.money).toBeGreaterThan(before)
  })

  it('two couriers do not both fetch the same box', () => {
    const w = world({ hire: ['courier', 'courier'] })
    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, 6000)

    const claimed = workers(w).filter(a => a.task).length
    expect(claimed).toBeLessThanOrEqual(1)
  })

  it('an idle worker drifts around the rest area instead of freezing', () => {
    const w = world({ hire: ['courier'] })
    const a = workers(w)[0]
    const start = { x: a.x, y: a.y }

    run(w, 20_000)
    expect(Math.hypot(a.x - start.x, a.y - start.y)).toBeGreaterThan(5)
  })

  it('workers keep to the walkable floor', () => {
    const w = world({ hire: ['courier', 'tech', 'seller'], benchLevel: 1 })
    dispatch(w, 'order', { kitId: 'mini_drone' })

    for (let i = 0; i < 1200; i++) {
      advance(w, w.now + TICK_MS, SYSTEMS)
      for (const a of workers(w)) {
        const clipping = w.obstacles.some(box =>
          Math.abs(a.x - box.cx) < a.halfW + box.w / 2 &&
          Math.abs(a.y - box.cy) < a.halfH + box.h / 2
        )
        expect(clipping).toBe(false)
      }
    }
  })

  it('hiring costs money and grows with each hire of the same role', () => {
    const w = world({ money: 20000 })
    const start = w.game.money
    dispatch(w, 'hireWorker', { role: 'courier' })
    const afterFirst = w.game.money
    dispatch(w, 'hireWorker', { role: 'courier' })

    const firstCost  = start - afterFirst
    const secondCost = afterFirst - w.game.money
    expect(secondCost).toBeGreaterThan(firstCost)
    expect(w.game.workers).toHaveLength(2)
  })

  it('a hire immediately gets an agent in the world', () => {
    const w = world()
    expect(workers(w)).toHaveLength(0)
    dispatch(w, 'hireWorker', { role: 'tech' })
    expect(workers(w)).toHaveLength(1)
    expect(workers(w)[0].role).toBe('tech')
  })

  it('hiring is refused when the money is not there', () => {
    const w = world({ money: 5 })
    expect(() => dispatch(w, 'hireWorker', { role: 'courier' })).toThrow('недостатньо грошей')
  })
})

const KIT_COST = 72
