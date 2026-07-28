import { describe, it, expect } from 'vitest'
import { createWorld } from '../world.js'
import { advance } from '../loop.js'
import { dispatch } from '../commands.js'
import { SYSTEMS } from './index.js'
import { createState } from '../../state/gameState.js'
import { layoutFor } from '../../defs/layouts/index.js'
import { promoteCost, roleMaxLevel, roleLevelData } from '../../defs/roles.js'
import { TICK_MS, ZONE_DWELL_PROMOTE_MS } from '../../state/config.js'
import { EV } from '../events.js'

const T0 = 1_000_000

function shop({ money = 99999, role = 'courier' } = {}) {
  const base = createState()
  const state = { ...base, money, locationId: 'factory', unlockedHalls: ['hall-1'] }
  const w = createWorld({ state, salesLog: [] },
    { now: T0, rng: () => 0.5, layout: layoutFor('factory', state) })
  dispatch(w, 'hireWorker', { role, hallId: 'hall-1' })
  return w
}

const run = (w, ms) => {
  const events = []
  const target = w.now + ms
  while (target - w.now >= TICK_MS) events.push(...advance(w, w.now + TICK_MS, SYSTEMS))
  return events
}

const workerAgent = (w) => w.agents.find(a => a.kind === 'worker')
const promoteZone = (w) => (w.zones ?? []).find(z => z.kind === 'promote')

// Parks the player right on top of their colleague and holds them there:
// the sim's own separation would otherwise push them apart mid-dwell.
function standNextTo(w, ms) {
  const player = w.agents.find(a => a.kind === 'player')
  const target = w.now + ms
  const events = []
  while (target - w.now >= TICK_MS) {
    const worker = workerAgent(w)
    player.x = worker.x
    player.y = worker.y
    events.push(...advance(w, w.now + TICK_MS, SYSTEMS))
  }
  return events
}

describe('F5 — підвищення просто на підлозі', () => {
  it('навколо кожного робітника є зона, і вона їде разом із ним', () => {
    const w = shop()
    run(w, 200)
    const zone = promoteZone(w)
    expect(zone).toBeTruthy()
    expect(zone.meta.workerId).toBe(w.game.workers[0].id)

    const agent = workerAgent(w)
    agent.x += 300
    run(w, 100)
    expect(promoteZone(w).cx).toBeCloseTo(agent.x, 0)
  })

  // П3: стояння поруч більше НЕ платить. Це був єдиний об'єкт у цеху, який
  // списував гроші сам — і випадковий прохід повз власного техніка коштував
  // $240 без жодного пояснення.
  it('постояти поруч — це питання, а не покупка', () => {
    const w = shop()
    const before = w.game.money
    const events = standNextTo(w, ZONE_DWELL_PROMOTE_MS + 400)

    const panels = events.filter(e => e.t === EV.PANEL_REQUESTED && e.panel === 'promote')
    expect(panels).toHaveLength(1)
    expect(panels[0].workerId).toBe(w.game.workers[0].id)
    // Головне: нічого не сталось, поки гравець не натиснув кнопку.
    expect(events.map(e => e.t)).not.toContain(EV.WORKER_PROMOTED)
    expect(w.game.workers[0].level).toBe(0)
    expect(w.game.money).toBe(before)
  })

  it('платить кнопка в панелі — і рівень росте', () => {
    const w = shop()
    const cost = promoteCost('courier', 0)
    const before = w.game.money
    const events = dispatch(w, 'promoteWorker', { workerId: w.game.workers[0].id })

    expect(events.map(e => e.t)).toContain(EV.WORKER_PROMOTED)
    expect(w.game.workers[0].level).toBe(1)
    expect(before - w.game.money).toBe(cost)
  })

  it('підвищення одразу змінює швидкість агента, а не після перезавантаження', () => {
    const w = shop()
    const was = workerAgent(w).speed
    dispatch(w, 'promoteWorker', { workerId: w.game.workers[0].id })
    run(w, 200)
    expect(workerAgent(w).speed).toBe(roleLevelData('courier', 1).speed)
    expect(workerAgent(w).speed).toBeGreaterThan(was)
  })

  it('без грошей зона мовчить — панель, яка може лише відмовити, не відкривається', () => {
    const w = shop()
    w.game = { ...w.game, money: 0 }
    const events = standNextTo(w, ZONE_DWELL_PROMOTE_MS + 400)
    expect(events.map(e => e.t)).not.toContain(EV.PANEL_REQUESTED)
    expect(w.game.workers[0].level).toBe(0)
  })

  it('на високому рівні зона мовчить — бо ціна виросла', () => {
    // Стелі рівнів більше немає (Стадія 10 / C), тож «нікуди рости» перестало
    // бути причиною мовчати. Причина лишилась одна — і вона тепер єдина:
    // підвищення не по кишені. Зона, яка відкриває панель із мертвою кнопкою,
    // і є той шум, заради якого предикат узагалі писався.
    const w = shop()
    // Рівень шукається, а не зашивається: крива ціни — предмет балансу, і
    // конкретне число тут почервоніло б від будь-якого її підкручування,
    // нічого не зламавши. (Так і сталося: 1.6^12 виявилось дешевшим за касу.)
    let level = 0
    while (promoteCost('courier', level) <= w.game.money) level++
    w.game = {
      ...w.game,
      workers: w.game.workers.map(x => ({ ...x, level })),
    }
    expect(promoteCost('courier', level)).toBeGreaterThan(w.game.money)
    const events = standNextTo(w, ZONE_DWELL_PROMOTE_MS + 400)
    expect(events.map(e => e.t)).not.toContain(EV.PANEL_REQUESTED)
  })

  it('кожен наступний рівень дорожчий, і стелі немає', () => {
    for (const role of ['courier', 'tech', 'seller', 'manager']) {
      expect(roleMaxLevel(role)).toBe(Infinity)
      for (let i = 1; i < 30; i++) {
        expect(promoteCost(role, i), `${role} ${i}`)
          .toBeGreaterThan(promoteCost(role, i - 1))
      }
      // Ніколи не null: підвищувати можна завжди, обмежувач — ціна.
      expect(promoteCost(role, 50)).toBeGreaterThan(0)
    }
  })

  it('без найнятих людей динамічних зон немає взагалі', () => {
    const base = createState()
    const w = createWorld({ state: base, salesLog: [] },
      { now: T0, rng: () => 0.5, layout: layoutFor('apartment') })
    run(w, 200)
    expect(promoteZone(w)).toBeUndefined()
    expect(w.zones).toBe(w.staticZones)
  })
})
