import { describe, it, expect } from 'vitest'
import { createWorld } from './world.js'
import { advance } from './loop.js'
import { dispatch } from './commands.js'
import { SYSTEMS } from './systems/index.js'
import { deriveJobs } from './systems/job.js'
import { chooseIntakeHall, intakeLoad } from './intake.js'
import { createState, Phase, DeliveryStatus } from '../state/gameState.js'
import { layoutFor } from '../defs/layouts/index.js'
import { TICK_MS, INTAKE_CAPACITY } from '../state/config.js'

const T0 = 1_000_000

function factory({ money = 200000, halls = ['hall-1', 'hall-2'], storageLevel = 2 } = {}) {
  const base = createState()
  const state = {
    ...base, money, locationId: 'factory', unlockedHalls: halls,
    upgrades: { ...base.upgrades, storageLevel },
  }
  const w = createWorld({ state, salesLog: [] },
    { now: T0, rng: () => 0.5, layout: layoutFor('factory', state) })
  // Park the player out of every zone: ці тести про ящики, а не про те, хто
  // випадково стоїть там, куди приїхала коробка.
  const p = w.agents.find(a => a.kind === 'player')
  p.x = w.layout.spawns.door.x
  p.y = w.layout.world.h - 100
  return w
}

function run(w, ms) {
  const events = []
  const target = w.now + ms
  while (target - w.now >= TICK_MS) events.push(...advance(w, w.now + TICK_MS, SYSTEMS))
  return events
}

const delivery = (w, i = 0) => w.game.deliveries[i]
const zoneOf = (w, id) => (w.zones ?? []).find(z => z.id === id)

describe('Стадія 12 / Д1 — приймальний ящик', () => {
  it('цех вибирається в момент замовлення, а не в дорозі', () => {
    const w = factory()
    dispatch(w, 'order', { kitId: 'mini_drone' })
    expect(delivery(w).hallId).toBe('hall-1')
    expect(delivery(w).status).toBe(DeliveryStatus.TRANSIT)
  })

  it('замовлення розходяться по цехах, коли верстаки першого зайняті', () => {
    const w = factory()
    // Обидва верстаки цеху 1 — у роботі.
    w.game = { ...w.game, stations: w.game.stations.map((s, i) =>
      w.layout.stationSlots[i].hallId === 'hall-1' ? { ...s, phase: Phase.ASSEMBLY } : s) }
    expect(chooseIntakeHall(w)).toBe('hall-2')
  })

  it('повний ящик відводить наступну коробку в інший цех', () => {
    const w = factory()
    const full = Array.from({ length: INTAKE_CAPACITY }, (_, i) => ({
      id: `d${i}`, kitId: 'mini_drone', slotIndex: i,
      readyAt: T0 + 1e6, status: DeliveryStatus.TRANSIT, hallId: 'hall-1',
    }))
    w.game = { ...w.game, deliveries: full }
    expect(intakeLoad(w.game, 'hall-1')).toBe(INTAKE_CAPACITY)
    expect(chooseIntakeHall(w)).toBe('hall-2')
  })

  it('без цехів (квартира) коробка й далі їде у вуличний слот', () => {
    const base = createState()
    const state = { ...base, money: 20000, locationId: 'apartment' }
    const w = createWorld({ state, salesLog: [] },
      { now: T0, rng: () => 0.5, layout: layoutFor('apartment', state) })
    expect(chooseIntakeHall(w)).toBeNull()
    dispatch(w, 'order', { kitId: 'mini_drone' })
    expect(delivery(w).hallId ?? null).toBeNull()
  })

  it("кур'єр бере коробку саме з ящика її цеху", () => {
    const w = factory()
    dispatch(w, 'order', { kitId: 'mini_drone' })
    // Поки коробка в дорозі — роботи по неї немає взагалі.
    expect(deriveJobs(w).some(j => j.type === 'haul_delivery')).toBe(false)
    run(w, 60_000)
    const job = deriveJobs(w).find(j => j.type === 'haul_delivery')
    expect(job).toBeTruthy()
    expect(zoneOf(w, job.fromZone).kind).toBe('intake')
    expect(zoneOf(w, job.fromZone).meta.hallId).toBe(delivery(w).hallId)
  })

  it('коробку несуть на верстак ТОГО САМОГО цеху', () => {
    const w = factory()
    w.game = { ...w.game, deliveries: [{
      id: 'd0', kitId: 'mini_drone', slotIndex: 0,
      readyAt: T0 - 1, status: DeliveryStatus.TRANSIT, hallId: 'hall-2',
    }] }
    run(w, TICK_MS * 2)
    const job = deriveJobs(w).find(j => j.type === 'haul_delivery')
    const benchZone = (w.zones ?? []).find(z => z.id === job.toZone)
    const i = w.game.stations.findIndex(s => s.id === benchZone.meta.stationId)
    expect(w.layout.stationSlots[i].hallId).toBe('hall-2')
  })
})

describe('Стадія 12 / Д3 — стрічки більше немає', () => {
  it('розкладка фабрики не має ані конвеєра, ані зон скидання', () => {
    const layout = layoutFor('factory', { unlockedHalls: ['hall-1', 'hall-2', 'hall-3'] })
    expect(layout.conveyor).toBeUndefined()
    expect(layout.zones.some(z => z.kind === 'belt_drop')).toBe(false)
    expect(layout.zones.filter(z => z.kind === 'intake')).toHaveLength(3)
  })
})
