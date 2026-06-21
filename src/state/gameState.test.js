import { describe, it, expect } from 'vitest'
import {
  createState, Phase, KIT_TYPES,
  orderKit, receiveDelivery, startAssembly,
  recordSolderPoint, finishAssembly, sell,
  burnKit, abandonBurntDrone, buyUpgrade,
  applyColdSolderPenalty,
  calcPrice, calcQuality,
} from './gameState.js'
import { SOLDERING_UPGRADE_COSTS, WORKER_UPGRADE_COSTS, CONSUMABLES_UPGRADE_COSTS } from './config.js'
import { trackMaxLevel, nextCost, levelData, UPGRADE_TRACKS, SOLDER_MODE, WORKER_MODE } from './upgrades.js'

const SOLDERING_MAX_LEVEL = trackMaxLevel('soldering')

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

describe('Поломка: гілка перегріву', () => {
  function inAssembly(pointsDone = 0) {
    let s = createState()
    s = orderKit(s, 'mini_drone')
    s = receiveDelivery(s)
    s = startAssembly(s)
    for (let i = 0; i < pointsDone; i++) s = recordSolderPoint(s, 0.9)
    return s
  }

  it('burnKit: ASSEMBLY → BURNT, гроші не змінюються', () => {
    const s = inAssembly(1)
    const burnt = burnKit(s)
    expect(burnt.phase).toBe(Phase.BURNT)
    expect(burnt.money).toBe(s.money)
  })

  it('burnKit зберігає вже запаяні точки в стані', () => {
    const s = inAssembly(2)
    expect(burnKit(s).solderPoints).toHaveLength(2)
  })

  it('abandonBurntDrone без salvage: гроші не змінюються', () => {
    let s = inAssembly(1)
    s = burnKit(s)
    const moneyBeforeAbandon = s.money
    s = abandonBurntDrone(s, 0)
    expect(s.phase).toBe(Phase.IDLE)
    expect(s.money).toBe(moneyBeforeAbandon)
    expect(s.activeKit).toBeNull()
    expect(s.solderPoints).toHaveLength(0)
    expect(s.assemblyQuality).toBeNull()
  })

  it('abandonBurntDrone з salvageRate=0.40 повертає 40% вартості комплекту', () => {
    let s = createState()
    s = orderKit(s, 'mini_drone')
    s = receiveDelivery(s)
    s = startAssembly(s)
    s = burnKit(s)
    const moneyAfterBurn = s.money // 120 - 72 = 48
    s = abandonBurntDrone(s, 0.40)
    // 48 + 72 * 0.40 = 48 + 28.80 = 76.80
    expect(s.money).toBeCloseTo(moneyAfterBurn + KIT_TYPES.mini_drone.cost * 0.40)
    expect(s.money).toBeGreaterThanOrEqual(KIT_TYPES.mini_drone.cost) // can reorder
  })

  it('abandonBurntDrone: загальні втрати = вартість × (1 - salvageRate)', () => {
    let s = createState()
    const startMoney = s.money
    s = orderKit(s, 'mini_drone')
    s = receiveDelivery(s)
    s = startAssembly(s)
    s = burnKit(s)
    s = abandonBurntDrone(s, 0.40)
    const expectedLoss = KIT_TYPES.mini_drone.cost * 0.60
    expect(s.money).toBeCloseTo(startMoney - expectedLoss)
  })

  it('burnKit поза ASSEMBLY — помилка', () => {
    expect(() => burnKit(createState())).toThrow('burnKit')
  })

  it('abandonBurntDrone поза BURNT — помилка', () => {
    expect(() => abandonBurntDrone(createState())).toThrow('abandonBurntDrone')
  })

  it('після abandonBurntDrone можна почати новий цикл', () => {
    let s = createState()
    s = { ...s, money: 200 }
    s = orderKit(s, 'mini_drone')
    s = receiveDelivery(s)
    s = startAssembly(s)
    s = burnKit(s)
    s = abandonBurntDrone(s)
    s = orderKit(s, 'mini_drone')
    expect(s.phase).toBe(Phase.ORDERED)
  })
})

describe('Холодна пайка: штраф якості', () => {
  function inAssembly() {
    let s = createState()
    s = orderKit(s, 'mini_drone')
    s = receiveDelivery(s)
    s = startAssembly(s)
    return s
  }

  it('applyColdSolderPenalty збільшує штраф', () => {
    const s = applyColdSolderPenalty(inAssembly(), 0.15)
    expect(s.coldSolderPenalty).toBeCloseTo(0.15)
    expect(s.phase).toBe(Phase.ASSEMBLY)   // фаза не змінюється
    expect(s.solderPoints).toHaveLength(0) // точка не записана
  })

  it('штраф накопичується при кількох промахах', () => {
    let s = inAssembly()
    s = applyColdSolderPenalty(s, 0.15)
    s = applyColdSolderPenalty(s, 0.15)
    expect(s.coldSolderPenalty).toBeCloseTo(0.30)
  })

  it('штраф не перевищує 1', () => {
    let s = inAssembly()
    for (let i = 0; i < 10; i++) s = applyColdSolderPenalty(s, 0.15)
    expect(s.coldSolderPenalty).toBe(1)
  })

  it('finishAssembly враховує штраф у фінальній якості', () => {
    let s = inAssembly()
    s = applyColdSolderPenalty(s, 0.15)
    // запаяти всі 4 точки ідеально
    for (let i = 0; i < 4; i++) s = recordSolderPoint(s, 1.0)
    s = finishAssembly(s)
    // quality = 1.0 - 0.15 = 0.85
    expect(s.assemblyQuality).toBeCloseTo(0.85)
  })

  it('finishAssembly якість не нижче 0', () => {
    let s = inAssembly()
    for (let i = 0; i < 10; i++) s = applyColdSolderPenalty(s, 0.15)
    for (let i = 0; i < 4; i++) s = recordSolderPoint(s, 0.5)
    s = finishAssembly(s)
    expect(s.assemblyQuality).toBe(0)
  })

  it('штраф скидається після sell', () => {
    let s = { ...createState(), money: 999 }
    s = orderKit(s, 'mini_drone')
    s = receiveDelivery(s)
    s = startAssembly(s)
    s = applyColdSolderPenalty(s, 0.15)
    for (let i = 0; i < 4; i++) s = recordSolderPoint(s, 1.0)
    s = finishAssembly(s)
    s = sell(s)
    expect(s.coldSolderPenalty).toBe(0)
  })
})

describe('Апгрейди: buyUpgrade', () => {
  function richState() {
    return { ...createState(), money: 9999 }
  }

  it('рівень 0 → 1: гроші зменшуються, solderingLevel зростає', () => {
    const s = buyUpgrade(richState(), 'soldering')
    expect(s.upgrades.solderingLevel).toBe(1)
    expect(s.money).toBe(9999 - SOLDERING_UPGRADE_COSTS[0])
  })

  it('можна прокачати до максимального рівня', () => {
    let s = richState()
    for (let i = 0; i < SOLDERING_MAX_LEVEL; i++) s = buyUpgrade(s, 'soldering')
    expect(s.upgrades.solderingLevel).toBe(SOLDERING_MAX_LEVEL)
  })

  it('вище максимуму — помилка', () => {
    let s = richState()
    for (let i = 0; i < SOLDERING_MAX_LEVEL; i++) s = buyUpgrade(s, 'soldering')
    expect(() => buyUpgrade(s, 'soldering')).toThrow('максимальному рівні')
  })

  it('недостатньо грошей — помилка', () => {
    const broke = { ...createState(), money: 10 }
    expect(() => buyUpgrade(broke, 'soldering')).toThrow('недостатньо грошей')
  })

  it('невідомий апгрейд — помилка', () => {
    expect(() => buyUpgrade(richState(), 'unknown')).toThrow('невідомий апгрейд')
  })

  it('buyUpgrade не мутує стан', () => {
    const s = richState()
    const before = s.upgrades.solderingLevel
    buyUpgrade(s, 'soldering')
    expect(s.upgrades.solderingLevel).toBe(before)
  })
})

describe('Реєстр апгрейдів (data-driven)', () => {
  it('max level дорівнює довжині масиву вартостей', () => {
    expect(trackMaxLevel('soldering')).toBe(SOLDERING_UPGRADE_COSTS.length)
  })

  it('nextCost повертає вартість наступного рівня і null на максимумі', () => {
    expect(nextCost('soldering', 0)).toBe(SOLDERING_UPGRADE_COSTS[0])
    expect(nextCost('soldering', trackMaxLevel('soldering'))).toBeNull()
  })

  it('levelData повертає режим збірки для кожного рівня', () => {
    expect(levelData('soldering', 0).mode).toBe(SOLDER_MODE.MANUAL)
    expect(levelData('soldering', 1).mode).toBe(SOLDER_MODE.MANUAL)
    expect(levelData('soldering', 2).mode).toBe(SOLDER_MODE.SEMI)
    expect(levelData('soldering', 3).mode).toBe(SOLDER_MODE.AUTO)
  })

  it('buyUpgrade узагальнений: рухає рівень за stateKey трека', () => {
    const track = UPGRADE_TRACKS.soldering
    const s = buyUpgrade({ ...createState(), money: 9999 }, 'soldering')
    expect(s.upgrades[track.stateKey]).toBe(1)
  })
})

describe('Апгрейди: worker-трек', () => {
  function richState() {
    return { ...createState(), money: 9999 }
  }

  it('початковий стан має workerLevel 0', () => {
    expect(createState().upgrades.workerLevel).toBe(0)
  })

  it('рівень 0 → manual, 1 → semi, 2 → auto', () => {
    expect(levelData('worker', 0).mode).toBe(WORKER_MODE.MANUAL)
    expect(levelData('worker', 1).mode).toBe(WORKER_MODE.SEMI)
    expect(levelData('worker', 2).mode).toBe(WORKER_MODE.AUTO)
  })

  it('buyUpgrade worker: рівень зростає, гроші зменшуються', () => {
    const s = buyUpgrade(richState(), 'worker')
    expect(s.upgrades.workerLevel).toBe(1)
    expect(s.money).toBe(9999 - WORKER_UPGRADE_COSTS[0])
  })

  it('можна прокачати до максимального рівня', () => {
    let s = richState()
    const maxLevel = trackMaxLevel('worker')
    for (let i = 0; i < maxLevel; i++) s = buyUpgrade(s, 'worker')
    expect(s.upgrades.workerLevel).toBe(maxLevel)
  })

  it('вище максимуму — помилка', () => {
    let s = richState()
    const maxLevel = trackMaxLevel('worker')
    for (let i = 0; i < maxLevel; i++) s = buyUpgrade(s, 'worker')
    expect(() => buyUpgrade(s, 'worker')).toThrow('максимальному рівні')
  })

  it('max level збігається з довжиною WORKER_UPGRADE_COSTS', () => {
    expect(trackMaxLevel('worker')).toBe(WORKER_UPGRADE_COSTS.length)
  })

  it('nextCost worker: повертає вартість і null на максимумі', () => {
    expect(nextCost('worker', 0)).toBe(WORKER_UPGRADE_COSTS[0])
    expect(nextCost('worker', trackMaxLevel('worker'))).toBeNull()
  })

  it('upgradeWorker не мутує стан', () => {
    const s = richState()
    const before = s.upgrades.workerLevel
    buyUpgrade(s, 'worker')
    expect(s.upgrades.workerLevel).toBe(before)
  })
})

describe('Нові типи дронів (D2.1)', () => {
  function richState() { return { ...createState(), money: 9999 } }

  it('racing_drone: повний цикл з 6 точками', () => {
    let s = richState()
    s = orderKit(s, 'racing_drone')
    expect(s.phase).toBe(Phase.ORDERED)
    s = receiveDelivery(s)
    s = startAssembly(s)
    for (let i = 0; i < 6; i++) s = recordSolderPoint(s, 0.9)
    s = finishAssembly(s)
    expect(s.phase).toBe(Phase.READY)
    expect(s.assemblyQuality).toBeCloseTo(0.9)
    s = sell(s)
    expect(s.phase).toBe(Phase.IDLE)
    expect(s.money).toBeGreaterThan(0)
  })

  it('cinematic_drone: повний цикл з 8 точками', () => {
    let s = richState()
    s = orderKit(s, 'cinematic_drone')
    s = receiveDelivery(s)
    s = startAssembly(s)
    for (let i = 0; i < 8; i++) s = recordSolderPoint(s, 1.0)
    s = finishAssembly(s)
    expect(s.assemblyQuality).toBeCloseTo(1.0)
    s = sell(s)
    expect(s.phase).toBe(Phase.IDLE)
  })

  it('longrange_drone: повний цикл з 5 точками', () => {
    let s = richState()
    s = orderKit(s, 'longrange_drone')
    s = receiveDelivery(s)
    s = startAssembly(s)
    for (let i = 0; i < 5; i++) s = recordSolderPoint(s, 0.8)
    s = finishAssembly(s)
    expect(s.phase).toBe(Phase.READY)
  })

  it('кожен дрон має solderPointCount що збігається з довжиною assemblySteps', () => {
    for (const kit of Object.values(KIT_TYPES)) {
      expect(kit.assemblySteps.length, `${kit.id} steps length`).toBe(kit.solderPointCount)
    }
  })

  it('ціна racing_drone вища за mini_drone при однаковій якості', () => {
    const mini    = calcPrice(KIT_TYPES.mini_drone.basePrice,    1, 1)
    const racing  = calcPrice(KIT_TYPES.racing_drone.basePrice,  1, 1)
    const cinema  = calcPrice(KIT_TYPES.cinematic_drone.basePrice, 1, 1)
    expect(racing).toBeGreaterThan(mini)
    expect(cinema).toBeGreaterThan(racing)
  })
})

describe('Апгрейд consumables (D2.2)', () => {
  function richState() { return { ...createState(), money: 9999 } }

  it('початковий стан має consumablesLevel 0', () => {
    expect(createState().upgrades.consumablesLevel).toBe(0)
  })

  it('рівень 0: overheatMult=1.0, qualityBonus=0', () => {
    const d = levelData('consumables', 0)
    expect(d.overheatMult).toBe(1.0)
    expect(d.qualityBonus).toBe(0)
  })

  it('рівень 1: overheatMult=0.7 (−30% перегрів)', () => {
    expect(levelData('consumables', 1).overheatMult).toBe(0.7)
  })

  it('рівень 2: overheatMult=0.4, qualityBonus=0.05', () => {
    const d = levelData('consumables', 2)
    expect(d.overheatMult).toBe(0.4)
    expect(d.qualityBonus).toBeCloseTo(0.05)
  })

  it('buyUpgrade consumables: рівень зростає, гроші зменшуються', () => {
    const s = buyUpgrade(richState(), 'consumables')
    expect(s.upgrades.consumablesLevel).toBe(1)
    expect(s.money).toBe(9999 - CONSUMABLES_UPGRADE_COSTS[0])
  })

  it('consumables max level збігається з CONSUMABLES_UPGRADE_COSTS', () => {
    expect(trackMaxLevel('consumables')).toBe(CONSUMABLES_UPGRADE_COSTS.length)
  })

  it('вище максимуму — помилка', () => {
    let s = richState()
    const max = trackMaxLevel('consumables')
    for (let i = 0; i < max; i++) s = buyUpgrade(s, 'consumables')
    expect(() => buyUpgrade(s, 'consumables')).toThrow('максимальному рівні')
  })
})
