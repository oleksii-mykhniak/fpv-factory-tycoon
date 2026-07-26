import { describe, it, expect } from 'vitest'
import { createWorld } from '../world.js'
import { advance } from '../loop.js'
import { dispatch } from '../commands.js'
import { SYSTEMS } from './index.js'
import { deriveJobs } from './job.js'
import { createState, Phase, startAssembly, DeliveryStatus } from '../../state/gameState.js'
import { layoutFor } from '../../defs/layouts/index.js'
import { TICK_MS } from '../../state/config.js'
import { EV } from '../events.js'

const T0 = 1_000_000

function factory({ money = 20000, halls = ['hall-1', 'hall-2'] } = {}) {
  const base = createState()
  const state = {
    ...base, money, locationId: 'factory', unlockedHalls: halls,
    upgrades: { ...base.upgrades, storageLevel: 2 },
  }
  const w = createWorld({ state, salesLog: [] },
    { now: T0, rng: () => 0.5, layout: layoutFor('factory', state) })
  // Park the player out of every zone: these tests are about the belt, not
  // about who happens to be standing where the box lands.
  const p = w.agents.find(a => a.kind === 'player')
  p.x = w.layout.spawns.door.x
  p.y = w.layout.world.h - 100
  return w
}

// advance() returns the events it produced — it does not take a sink.
function run(w, ms) {
  const events = []
  const target = w.now + ms
  while (target - w.now >= TICK_MS) events.push(...advance(w, w.now + TICK_MS, SYSTEMS))
  return events
}

const delivery = (w) => w.game.deliveries[0]

describe('sim/beltSystem — the conveyor', () => {
  it('an ordered kit lands on the belt, not in the street', () => {
    const w = factory()
    dispatch(w, 'order', { kitId: 'mini_drone' })
    expect(w.belt?.items ?? []).toHaveLength(0)     // still in transit
    run(w, 6000)
    expect(w.belt.items).toHaveLength(1)
    expect(w.belt.items[0].deliveryId).toBe(delivery(w).id)
  })

  it('it rides to the first hall that has a free bench', () => {
    const w = factory()
    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, 6000)
    const events = run(w, 12_000)
    expect(events.map(e => e.t)).toContain(EV.BELT_DROPPED)
    expect(delivery(w).dropIndex).toBe(0)
  })

  it('a hall with no free bench is skipped — the box rides on', () => {
    const w = factory()
    // Fill every bench in hall 1 so only hall 2 can take a box.
    const hall1 = w.game.stations.filter((_, i) => w.layout.stationSlots[i].hallId === 'hall-1')
    for (const s of hall1) {
      w.game = { ...w.game, stations: w.game.stations.map(st =>
        st.id === s.id ? { ...st, phase: Phase.ASSEMBLY, kitId: 'mini_drone' } : st) }
    }
    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, 6000)
    run(w, 30_000)
    expect(delivery(w).dropIndex).toBe(1)
  })

  it('with nowhere to go it parks at the end instead of vanishing', () => {
    const w = factory()
    w.game = { ...w.game, stations: w.game.stations.map(st =>
      ({ ...st, phase: Phase.ASSEMBLY, kitId: 'mini_drone' })) }
    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, 6000)
    run(w, 40_000)
    expect(delivery(w).dropIndex ?? null).toBeNull()
    expect(w.belt.items[0].t).toBe(w.layout.conveyor.length)
    expect(delivery(w).status).toBe(DeliveryStatus.TRANSIT)
  })

  it('no haul job exists while the box is still riding', () => {
    const w = factory()
    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, 6000)
    expect(deriveJobs(w).filter(j => j.type === 'haul_delivery')).toHaveLength(0)
    run(w, 12_000)
    expect(deriveJobs(w).filter(j => j.type === 'haul_delivery')).toHaveLength(1)
  })

  it('the haul job sends the courier to the drop, and to a bench in that hall', () => {
    const w = factory()
    const hall1 = w.game.stations.filter((_, i) => w.layout.stationSlots[i].hallId === 'hall-1')
    for (const s of hall1) {
      w.game = { ...w.game, stations: w.game.stations.map(st =>
        st.id === s.id ? { ...st, phase: Phase.ASSEMBLY, kitId: 'mini_drone' } : st) }
    }
    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, 6000)
    run(w, 30_000)

    const job = deriveJobs(w).find(j => j.type === 'haul_delivery')
    expect(job.fromZone).toBe('drop1')
    const target = w.zones.find(z => z.id === job.toZone)
    const idx = w.game.stations.findIndex(s => s.id === target.meta.stationId)
    expect(w.layout.stationSlots[idx].hallId).toBe('hall-2')
  })

  it('the belt rebuilds itself from the saved deliveries', () => {
    const w = factory()
    dispatch(w, 'order', { kitId: 'mini_drone' })
    run(w, 20_000)
    const saved = JSON.parse(JSON.stringify({ state: w.game, salesLog: [] }))

    const w2 = createWorld(saved, {
      now: w.now, rng: () => 0.5, layout: layoutFor('factory', saved.state),
    })
    expect(w2.belt ?? null).toBeNull()      // nothing yet — it is not persisted
    run(w2, 200)
    expect(w2.belt.items).toHaveLength(1)
    // It already chose a hall, so it is parked there rather than riding again.
    expect(w2.belt.items[0].dropIndex).toBe(delivery(w).dropIndex)
  })

  it('there is no belt anywhere but the factory', () => {
    const base = createState()
    const w = createWorld({ state: base, salesLog: [] },
      { now: T0, rng: () => 0.5, layout: layoutFor('apartment') })
    run(w, 200)
    expect(w.belt).toBeNull()
  })
})
