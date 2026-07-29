// Підвищення — покупка в панелі (F5, перенесено Стадією 11 / D3).
//
// Було зоною, яка їздила разом із працівником: щоб підняти комусь рівень,
// гравець мусив наздогнати людину й постояти поруч. Дві причини це прибрати, і
// кожної окремо вистачило б: на телефоні це полювання за рухомою ціллю, а штат
// через це жив у двох різних місцях гри — на дошці брали людей, на підлозі їх
// качали, і жодне з місць не показувало команду цілком.
//
// Тому тут лишилось те, що не залежить від місця: гроші, рівень і крива ціни.
// Плюс сторож на регрес — зони `promote` у грі більше немає ніде.

import { describe, it, expect } from 'vitest'
import { createWorld } from '../world.js'
import { advance } from '../loop.js'
import { dispatch } from '../commands.js'
import { SYSTEMS } from './index.js'
import { createState } from '../../state/gameState.js'
import { layoutFor } from '../../defs/layouts/index.js'
import { promoteCost, roleMaxLevel, roleLevelData } from '../../defs/roles.js'
import { ruleAt } from '../../state/locations.js'
import { TICK_MS } from '../../state/config.js'
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

describe('F5 — підвищення', () => {
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

  it('зони підвищення на підлозі більше немає — і статичні зони не перебудовуються', () => {
    const w = shop()
    run(w, 400)
    expect(workerAgent(w), 'робітника не найнято — тест перевіряє не те').toBeDefined()
    expect((w.zones ?? []).some(z => z.kind === 'promote')).toBe(false)
    // Рухомих зон не лишилось узагалі, тож список зон — це рівно статичні.
    // Порівняння по вмісту, а не по посиланню: копію робить `createWorld`, і
    // саме її бачать системи — важливо, що ніхто нічого туди не дописує.
    expect(w.zones).toEqual(w.staticZones)
  })

  it('вдома підвищень немає — правило локації лишилось', () => {
    // Перша локація — про власні руки, а не про платіжну відомість. Панель
    // читає те саме правило, яким колись вимикалась зона.
    const home = { ...createState(), unlockedRooms: ['flat', 'garage'] }
    expect(ruleAt(home, 'hasPromote')).toBe(false)
    expect(ruleAt({ ...createState(), locationId: 'factory' }, 'hasPromote')).toBe(true)
  })
})
