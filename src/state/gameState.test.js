import { describe, it, expect } from 'vitest'
import {
  createState, Phase, KIT_TYPES,
  orderKit, receiveDelivery, startAssembly,
  recordSolderPoint, finishAssembly, sell,
  calcPrice, calcQuality,
} from './gameState.js'

// helper: runs through the full cycle with given solder quality values
function runCycle(qualityValues) {
  let s = createState()
  s = orderKit(s, 'mini_drone')
  s = receiveDelivery(s)
  s = startAssembly(s)
  for (const q of qualityValues) s = recordSolderPoint(s, q)
  s = finishAssembly(s)
  s = sell(s)
  return s
}

describe('calcPrice', () => {
  it('ідеальна якість (1)', () => {
    // 95 × (0.6 + 0.7 × 1) × 1 = 95 × 1.3 = 123.5
    expect(calcPrice(95, 1, 1)).toBeCloseTo(123.5)
  })

  it('нульова якість (0)', () => {
    // 95 × 0.6 × 1 = 57
    expect(calcPrice(95, 0, 1)).toBeCloseTo(57)
  })

  it('множник прокачки подвоює ціну', () => {
    expect(calcPrice(95, 1, 2)).toBeCloseTo(247)
  })
})

describe('calcQuality', () => {
  it('середнє значень', () => {
    expect(calcQuality([1, 0, 0.5, 0.5])).toBeCloseTo(0.5)
  })

  it('порожній масив → 0', () => {
    expect(calcQuality([])).toBe(0)
  })
})

describe('FSM: повний цикл', () => {
  it('стартовий стан', () => {
    const s = createState()
    expect(s.phase).toBe(Phase.IDLE)
    expect(s.money).toBe(120)
    expect(s.activeKit).toBeNull()
    expect(s.solderPoints).toHaveLength(0)
  })

  it('ідеальна пайка — прибутковий цикл', () => {
    const s = runCycle([1, 1, 1, 1])
    // 120 − 72 + 123.5 = 171.5
    expect(s.money).toBeCloseTo(171.5)
    expect(s.phase).toBe(Phase.IDLE)
    expect(s.activeKit).toBeNull()
    expect(s.assemblyQuality).toBeNull()
  })

  it('нульова якість — цикл завершується, але маржа мінімальна', () => {
    const s = runCycle([0, 0, 0, 0])
    // 120 − 72 + 57 = 105  (збиток, але цикл закрився)
    expect(s.money).toBeCloseTo(105)
    expect(s.phase).toBe(Phase.IDLE)
  })

  it('змішана якість — гроші між min і max', () => {
    const s = runCycle([1, 0.5, 0.5, 0])
    expect(s.money).toBeGreaterThan(105)
    expect(s.money).toBeLessThan(171.5)
  })

  it('фази змінюються у правильному порядку', () => {
    let s = createState()
    expect(s.phase).toBe(Phase.IDLE)

    s = orderKit(s, 'mini_drone')
    expect(s.phase).toBe(Phase.ORDERED)

    s = receiveDelivery(s)
    expect(s.phase).toBe(Phase.DELIVERY)

    s = startAssembly(s)
    expect(s.phase).toBe(Phase.ASSEMBLY)

    s = recordSolderPoint(s, 0.8)
    s = recordSolderPoint(s, 0.8)
    s = recordSolderPoint(s, 0.8)
    s = recordSolderPoint(s, 0.8)
    expect(s.solderPoints).toHaveLength(4)

    s = finishAssembly(s)
    expect(s.phase).toBe(Phase.READY)
    expect(s.assemblyQuality).toBeCloseTo(0.8)

    s = sell(s)
    expect(s.phase).toBe(Phase.IDLE)
  })
})

describe('FSM: відхилення невалідних переходів', () => {
  it('orderKit з недостатньою кількістю грошей', () => {
    const broke = { ...createState(), money: 10 }
    expect(() => orderKit(broke, 'mini_drone')).toThrow('недостатньо грошей')
  })

  it('orderKit з невідомим типом', () => {
    expect(() => orderKit(createState(), 'unknown')).toThrow('невідомий тип')
  })

  it('receiveDelivery поза фазою ORDERED', () => {
    expect(() => receiveDelivery(createState())).toThrow('receiveDelivery')
  })

  it('startAssembly поза фазою DELIVERY', () => {
    expect(() => startAssembly(createState())).toThrow('startAssembly')
  })

  it('recordSolderPoint поза фазою ASSEMBLY', () => {
    expect(() => recordSolderPoint(createState(), 0.5)).toThrow('recordSolderPoint')
  })

  it('recordSolderPoint з якістю > 1', () => {
    let s = createState()
    s = orderKit(s, 'mini_drone')
    s = receiveDelivery(s)
    s = startAssembly(s)
    expect(() => recordSolderPoint(s, 1.5)).toThrow('від 0 до 1')
  })

  it('recordSolderPoint понад допустиму кількість точок', () => {
    let s = createState()
    s = orderKit(s, 'mini_drone')
    s = receiveDelivery(s)
    s = startAssembly(s)
    s = recordSolderPoint(s, 1)
    s = recordSolderPoint(s, 1)
    s = recordSolderPoint(s, 1)
    s = recordSolderPoint(s, 1)
    expect(() => recordSolderPoint(s, 1)).toThrow('всі')
  })

  it('finishAssembly без усіх точок', () => {
    let s = createState()
    s = orderKit(s, 'mini_drone')
    s = receiveDelivery(s)
    s = startAssembly(s)
    s = recordSolderPoint(s, 1)
    expect(() => finishAssembly(s)).toThrow('потрібно 4 точок')
  })

  it('sell поза фазою READY', () => {
    expect(() => sell(createState())).toThrow('sell')
  })

  it('подвійний orderKit — другий викидає помилку', () => {
    const s = orderKit(createState(), 'mini_drone')
    expect(() => orderKit(s, 'mini_drone')).toThrow('orderKit')
  })
})

describe('незмінність стану (immutability)', () => {
  it('orderKit не мутує вхідний об\'єкт', () => {
    const s = createState()
    const before = s.money
    orderKit(s, 'mini_drone')
    expect(s.money).toBe(before)
    expect(s.phase).toBe(Phase.IDLE)
  })

  it('recordSolderPoint не мутує масив solderPoints', () => {
    let s = createState()
    s = orderKit(s, 'mini_drone')
    s = receiveDelivery(s)
    s = startAssembly(s)
    const prev = s.solderPoints
    const next = recordSolderPoint(s, 0.5)
    expect(prev).toHaveLength(0)
    expect(next.solderPoints).toHaveLength(1)
  })
})
