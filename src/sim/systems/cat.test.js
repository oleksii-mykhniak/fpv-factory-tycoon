import { describe, it, expect } from 'vitest'
import { createWorld } from '../world.js'
import { advance } from '../loop.js'
import { dispatch } from '../commands.js'
import { SYSTEMS } from './index.js'
import { createState, DeliveryStatus } from '../../state/gameState.js'
import { layoutFor } from '../../defs/layouts/index.js'
import { TICK_MS } from '../../state/config.js'

const T0 = 1_000_000

function flat({ money = 5000 } = {}) {
  const base = createState()
  const state = { ...base, money }
  const w = createWorld({ state, salesLog: [] },
    { now: T0, rng: () => 0.5, layout: layoutFor('apartment', state) })
  // The player waits outside the flat: these tests are about the cat.
  const p = w.agents.find(a => a.kind === 'player')
  p.x = w.layout.door.x
  p.y = w.layout.world.h - 60
  return w
}

const run = (w, ms) => {
  const target = w.now + ms
  while (target - w.now >= TICK_MS) advance(w, w.now + TICK_MS, SYSTEMS)
}

const cat = (w) => w.agents.find(a => a.kind === 'cat')

describe('V5 — кіт', () => {
  it('у квартирі кіт є, і він рухається сам', () => {
    const w = flat()
    run(w, 200)
    expect(cat(w)).toBeTruthy()

    const start = { x: cat(w).x, y: cat(w).y }
    run(w, 20_000)
    const moved = Math.hypot(cat(w).x - start.x, cat(w).y - start.y)
    expect(moved).toBeGreaterThan(20)
  })

  it('кіт не виходить за стіни', () => {
    const w = flat()
    run(w, 60_000)
    const c = cat(w)
    expect(c.x).toBeGreaterThan(0)
    expect(c.x).toBeLessThan(w.layout.world.w)
    expect(c.y).toBeGreaterThan(0)
    expect(c.y).toBeLessThan(w.layout.world.h)
  })

  it('НАЙГОЛОВНІШЕ: кіт не може підняти коробку', () => {
    const w = flat()
    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, 6000)

    // Кіт стоїть просто в зоні доставки — там, де гравцю коробка стрибнула б у руки.
    const slot = w.zones.find(z => z.kind === 'delivery_slot')
    const c = cat(w)
    for (let i = 0; i < 60; i++) {
      c.x = slot.cx; c.y = slot.cy
      advance(w, w.now + TICK_MS, SYSTEMS)
    }

    expect(c.carrying ?? []).toHaveLength(0)
    expect(w.game.deliveries[0].status).toBe(DeliveryStatus.TRANSIT)
  })

  it('кіт не запускає жодну зону — навіть верстак', () => {
    const w = flat()
    run(w, 100)   // кіт зʼявляється на першому тіку
    const bench = w.zones.find(z => z.kind === 'bench')
    const c = cat(w)
    for (let i = 0; i < 80; i++) {
      c.x = bench.cx; c.y = bench.cy
      advance(w, w.now + TICK_MS, SYSTEMS)
    }
    expect(w.game.stations[0].phase).toBe('IDLE')
    // Зона навіть не почала рахувати перебування для нього.
    const state = w.zoneState[bench.id]
    expect(state?.dwell?.[c.id]).toBeUndefined()
  })

  it('кіт не штовхає людей', () => {
    const w = flat()
    run(w, 100)
    const p = w.agents.find(a => a.kind === 'player')
    const c = cat(w)
    p.x = 400; p.y = 800
    c.x = 400; c.y = 800
    const before = { x: p.x, y: p.y }
    run(w, 1000)
    expect(Math.hypot(p.x - before.x, p.y - before.y)).toBeLessThan(1)
  })

  it('у гаражі та на фабриці кота немає', () => {
    for (const id of ['garage', 'factory']) {
      const base = createState()
      const state = { ...base, locationId: id }
      const w = createWorld({ state, salesLog: [] },
        { now: T0, rng: () => 0.5, layout: layoutFor(id, state) })
      run(w, 500)
      expect(cat(w), id).toBeUndefined()
    }
  })
})
