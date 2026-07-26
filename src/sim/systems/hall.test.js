import { describe, it, expect } from 'vitest'
import { createWorld } from '../world.js'
import { advance } from '../loop.js'
import { dispatch } from '../commands.js'
import { SYSTEMS } from './index.js'
import { deriveJobs } from './job.js'
import { postFor } from './agent.js'
import { createState, Phase, workersInRole } from '../../state/gameState.js'
import { layoutFor } from '../../defs/layouts/index.js'
import { TICK_MS } from '../../state/config.js'

const T0 = 1_000_000

function factory({ money = 99999, halls = ['hall-1', 'hall-2'] } = {}) {
  const base = createState()
  const state = { ...base, money, locationId: 'factory', unlockedHalls: halls }
  const w = createWorld({ state, salesLog: [] },
    { now: T0, rng: () => 0.5, layout: layoutFor('factory', state) })
  const p = w.agents.find(a => a.kind === 'player')
  p.x = w.layout.spawns.door.x
  p.y = w.layout.world.h - 100
  return w
}

const run = (w, ms) => {
  const events = []
  const target = w.now + ms
  while (target - w.now >= TICK_MS) events.push(...advance(w, w.now + TICK_MS, SYSTEMS))
  return events
}

const hallOf = (w, stationId) => {
  const i = w.game.stations.findIndex(s => s.id === stationId)
  return w.layout.stationSlots[i].hallId
}

// Puts a kit on every bench of one hall so its stations want a technician.
function loadHall(w, hallId) {
  w.game = {
    ...w.game,
    stations: w.game.stations.map((s, i) =>
      w.layout.stationSlots[i].hallId === hallId
        ? { ...s, phase: Phase.ASSEMBLY, kitId: 'mini_drone' }
        : s),
  }
}

describe('F4 — штат прив\'язаний до цеху', () => {
  it('найм на дошці цеху записує людину саме в той цех', () => {
    const w = factory()
    dispatch(w, 'hireWorker', { role: 'tech', hallId: 'hall-2' })
    expect(w.game.workers[0].hallId).toBe('hall-2')
    expect(workersInRole(w.game, 'tech', 'hall-2')).toHaveLength(1)
    expect(workersInRole(w.game, 'tech', 'hall-1')).toHaveLength(0)
  })

  it('кеп рахується по цеху, а не по фабриці', () => {
    const w = factory()
    dispatch(w, 'hireWorker', { role: 'tech', hallId: 'hall-1' })
    expect(() => dispatch(w, 'hireWorker', { role: 'tech', hallId: 'hall-1' }))
      .toThrow('не поміститься')
    // Той самий фах у сусідньому цеху — інше місце, інший кеп.
    dispatch(w, 'hireWorker', { role: 'tech', hallId: 'hall-2' })
    expect(w.game.workers).toHaveLength(2)
  })

  it('задача несе цех, у якому вона відбувається', () => {
    const w = factory()
    loadHall(w, 'hall-2')
    const job = deriveJobs(w).find(j => j.type === 'assemble')
    expect(job.hallId).toBe('hall-2')
    expect(hallOf(w, job.stationId)).toBe('hall-2')
  })

  it('технік із першого цеху не бере роботу в другому', () => {
    const w = factory()
    dispatch(w, 'hireWorker', { role: 'tech', hallId: 'hall-1' })
    loadHall(w, 'hall-2')
    run(w, 3000)

    const tech = w.agents.find(a => a.kind === 'worker')
    expect(tech.hallId).toBe('hall-1')
    expect(tech.task).toBeNull()
    // Робота існує — її просто нема кому взяти в тому цеху.
    expect(deriveJobs(w).some(j => j.type === 'assemble' && j.hallId === 'hall-2')).toBe(true)
  })

  it('технік свого цеху бере її одразу', () => {
    const w = factory()
    dispatch(w, 'hireWorker', { role: 'tech', hallId: 'hall-2' })
    loadHall(w, 'hall-2')
    run(w, 3000)
    const tech = w.agents.find(a => a.kind === 'worker')
    expect(tech.task).not.toBeNull()
  })

  it('замовлення за ноутбуком нічийне — його бере будь-який менеджер', () => {
    const w = factory()
    const job = deriveJobs(w).find(j => j.type === 'order_kit')
    expect(job?.hallId ?? null).toBeNull()
  })

  it('продаж іде до пошти свого цеху, а не через усю фабрику', () => {
    const w = factory()
    w.game = {
      ...w.game,
      stations: w.game.stations.map((s, i) =>
        w.layout.stationSlots[i].hallId === 'hall-2'
          ? { ...s, phase: Phase.READY, kitId: 'mini_drone', quality: 0.8 }
          : s),
    }
    const job = deriveJobs(w).find(j => j.type === 'sell_drone')
    expect(job.hallId).toBe('hall-2')
    expect(job.toZone).toBe('mailbox_hall-2')
  })

  it('без діла робітник стоїть у своєму цеху', () => {
    const w = factory()
    dispatch(w, 'hireWorker', { role: 'seller', hallId: 'hall-2' })
    const seller = w.agents.find(a => a.kind === 'worker')
    const post = postFor(w, seller)
    const hall = w.layout.halls.find(h => h.id === 'hall-2')
    expect(post.x).toBeGreaterThanOrEqual(hall.x0)
    expect(post.x).toBeLessThanOrEqual(hall.x0 + hall.w)
  })
})
