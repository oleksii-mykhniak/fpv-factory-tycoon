import { describe, it, expect } from 'vitest'
import {
  createState, Phase, DeliveryStatus, KIT_TYPES,
  orderKit, startAssembly, pickupDelivery,
  recordSolderPoint, finishAssembly, sell,
  burnKit, abandonBurntDrone, buyUpgrade,
  applyColdSolderPenalty,
  calcPrice, calcQuality,
  canOpenPiggy, collectPiggy,
  moveToLocation,
} from './gameState.js'
import {
  SOLDERING_UPGRADE_COSTS, WORKER_UPGRADE_COSTS, CONSUMABLES_UPGRADE_COSTS,
  PIGGY_COOLDOWN_MS, PIGGY_TAP_VALUE, PIGGY_MAX_PAYOUT,
  STORAGE_UPGRADE_COSTS, STORAGE_SLOTS_BY_LEVEL,
  LOGISTICS_UPGRADE_COSTS, LOGISTICS_DELIVERY_MULT,
} from './config.js'
import { trackMaxLevel, nextCost, levelData, UPGRADE_TRACKS, SOLDER_MODE, WORKER_MODE } from './upgrades.js'
import { LOCATIONS, LOCATION_ORDER, capFor, canMoveToLocation, currentLocation } from './locations.js'

const SOLDERING_MAX_LEVEL = trackMaxLevel('soldering')

// ── Test helpers ──────────────────────────────────────────

// Simulate delivery arrival by setting readyAt to the past.
function forceArrived(state, id) {
  return {
    ...state,
    deliveries: state.deliveries.map(d => d.id === id ? { ...d, readyAt: 0 } : d),
  }
}

// Full happy-path cycle from IDLE to IDLE.
function runCycle(qualityValues, kitId = 'mini_drone') {
  let s = { ...createState(), money: 9999 }
  s = orderKit(s, kitId)
  s = forceArrived(s, s.deliveries[0].id)
  s = pickupDelivery(s, s.deliveries[0].id)
  s = startAssembly(s)
  for (const q of qualityValues) s = recordSolderPoint(s, q)
  s = finishAssembly(s)
  s = sell(s)
  return s
}

// Bench in ASSEMBLY with N solder points already done.
function inAssembly(pointsDone = 0, extra = {}) {
  let s = { ...createState(), money: 9999, ...extra }
  s = orderKit(s, 'mini_drone')
  s = forceArrived(s, s.deliveries[0].id)
  s = pickupDelivery(s, s.deliveries[0].id)
  s = startAssembly(s)
  for (let i = 0; i < pointsDone; i++) s = recordSolderPoint(s, 0.9)
  return s
}

// ── Tests ─────────────────────────────────────────────────

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
    expect(s.deliveries).toHaveLength(0)
  })

  it('ідеальна пайка — прибутковий цикл', () => {
    const s = runCycle([1, 1, 1, 1])
    // 9999 − 72 + 123.5 = 10050.5
    expect(s.money).toBeCloseTo(9999 - KIT_TYPES.mini_drone.cost + calcPrice(KIT_TYPES.mini_drone.basePrice, 1, 1))
    expect(s.phase).toBe(Phase.IDLE)
    expect(s.activeKit).toBeNull()
    expect(s.assemblyQuality).toBeNull()
    expect(s.deliveries).toHaveLength(0)
  })

  it('нульова якість — цикл завершується', () => {
    const s = runCycle([0, 0, 0, 0])
    expect(s.phase).toBe(Phase.IDLE)
  })

  it('фази змінюються у правильному порядку', () => {
    let s = { ...createState(), money: 9999 }
    expect(s.phase).toBe(Phase.IDLE)

    s = orderKit(s, 'mini_drone')
    expect(s.phase).toBe(Phase.IDLE)           // bench stays IDLE — delivery in transit
    expect(s.deliveries[0].status).toBe(DeliveryStatus.TRANSIT)

    s = forceArrived(s, s.deliveries[0].id)
    s = pickupDelivery(s, s.deliveries[0].id)
    expect(s.phase).toBe(Phase.IDLE)           // still IDLE while worker carries
    expect(s.deliveries[0].status).toBe(DeliveryStatus.CARRYING)

    s = startAssembly(s)
    expect(s.phase).toBe(Phase.ASSEMBLY)
    expect(s.deliveries).toHaveLength(0)       // removed when placed on bench

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

  it('orderKit з фази BURNT кидає помилку', () => {
    const s = inAssembly(1)
    expect(() => orderKit(burnKit(s), 'mini_drone')).toThrow('orderKit')
  })

  it('startAssembly без carrying доставки — помилка', () => {
    expect(() => startAssembly(createState())).toThrow('startAssembly')
  })

  it('recordSolderPoint поза фазою ASSEMBLY', () => {
    expect(() => recordSolderPoint(createState(), 0.5)).toThrow('recordSolderPoint')
  })

  it('recordSolderPoint з якістю > 1', () => {
    const s = inAssembly()
    expect(() => recordSolderPoint(s, 1.5)).toThrow('від 0 до 1')
  })

  it('recordSolderPoint понад допустиму кількість точок', () => {
    const s = inAssembly(4)
    expect(() => recordSolderPoint(s, 1)).toThrow('всі')
  })

  it('finishAssembly без усіх точок', () => {
    const s = inAssembly(1)
    expect(() => finishAssembly(s)).toThrow('потрібно 4 точок')
  })

  it('sell поза фазою READY', () => {
    expect(() => sell(createState())).toThrow('sell')
  })

  it('подвійний orderKit (без апгрейду складу) — другий викидає помилку', () => {
    const s = orderKit({ ...createState(), money: 9999 }, 'mini_drone')
    expect(() => orderKit(s, 'mini_drone')).toThrow('orderKit')
  })
})

describe('незмінність стану (immutability)', () => {
  it('orderKit не мутує вхідний об\'єкт', () => {
    const s = { ...createState(), money: 9999 }
    const before = s.money
    orderKit(s, 'mini_drone')
    expect(s.money).toBe(before)
    expect(s.phase).toBe(Phase.IDLE)
    expect(s.deliveries).toHaveLength(0)
  })

  it('recordSolderPoint не мутує масив solderPoints', () => {
    const s = inAssembly()
    const prev = s.solderPoints
    const next = recordSolderPoint(s, 0.5)
    expect(prev).toHaveLength(0)
    expect(next.solderPoints).toHaveLength(1)
  })
})

describe('Поломка: гілка перегріву', () => {
  it('burnKit: ASSEMBLY → BURNT, гроші не змінюються', () => {
    const s = inAssembly(1)
    const burnt = burnKit(s)
    expect(burnt.phase).toBe(Phase.BURNT)
    expect(burnt.money).toBe(s.money)
  })

  it('burnKit зберігає вже запаяні точки в стані', () => {
    expect(burnKit(inAssembly(2)).solderPoints).toHaveLength(2)
  })

  it('abandonBurntDrone без salvage: гроші не змінюються', () => {
    const s = burnKit(inAssembly(1))
    const moneyBefore = s.money
    const result = abandonBurntDrone(s, 0)
    expect(result.phase).toBe(Phase.IDLE)
    expect(result.money).toBe(moneyBefore)
    expect(result.activeKit).toBeNull()
    expect(result.solderPoints).toHaveLength(0)
    expect(result.assemblyQuality).toBeNull()
  })

  it('abandonBurntDrone з salvageRate=0.40 повертає 40% вартості комплекту', () => {
    const s = burnKit(inAssembly())
    const moneyAfterBurn = s.money
    const result = abandonBurntDrone(s, 0.40)
    expect(result.money).toBeCloseTo(moneyAfterBurn + KIT_TYPES.mini_drone.cost * 0.40)
    expect(result.money).toBeGreaterThanOrEqual(KIT_TYPES.mini_drone.cost)
  })

  it('abandonBurntDrone: загальні втрати = вартість × (1 - salvageRate)', () => {
    let s = { ...createState(), money: 9999 }
    const startMoney = s.money
    s = orderKit(s, 'mini_drone')
    s = forceArrived(s, s.deliveries[0].id)
    s = pickupDelivery(s, s.deliveries[0].id)
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
    let s = { ...createState(), money: 9999 }
    s = orderKit(s, 'mini_drone')
    s = forceArrived(s, s.deliveries[0].id)
    s = pickupDelivery(s, s.deliveries[0].id)
    s = startAssembly(s)
    s = burnKit(s)
    s = abandonBurntDrone(s)
    s = orderKit(s, 'mini_drone')
    expect(s.phase).toBe(Phase.IDLE)
    expect(s.deliveries).toHaveLength(1)
    expect(s.deliveries[0].status).toBe(DeliveryStatus.TRANSIT)
  })
})

describe('Холодна пайка: штраф якості', () => {
  it('applyColdSolderPenalty збільшує штраф', () => {
    const s = applyColdSolderPenalty(inAssembly(), 0.15)
    expect(s.coldSolderPenalty).toBeCloseTo(0.15)
    expect(s.phase).toBe(Phase.ASSEMBLY)
    expect(s.solderPoints).toHaveLength(0)
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
    let s = applyColdSolderPenalty(inAssembly(), 0.15)
    for (let i = 0; i < 4; i++) s = recordSolderPoint(s, 1.0)
    s = finishAssembly(s)
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
    let s = inAssembly()
    s = applyColdSolderPenalty(s, 0.15)
    for (let i = 0; i < 4; i++) s = recordSolderPoint(s, 1.0)
    s = finishAssembly(s)
    s = sell(s)
    expect(s.coldSolderPenalty).toBe(0)
  })
})

describe('Апгрейди: buyUpgrade', () => {
  function richState() {
    return { ...createState(), money: 9999, locationId: 'workshop' }
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
    expect(() => buyUpgrade({ ...createState(), money: 10 }, 'soldering')).toThrow('недостатньо грошей')
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
  function richState() { return { ...createState(), money: 9999, locationId: 'workshop' } }

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
  it('racing_drone: повний цикл з 6 точками', () => {
    const s = runCycle([0.9, 0.9, 0.9, 0.9, 0.9, 0.9], 'racing_drone')
    expect(s.phase).toBe(Phase.IDLE)
    expect(s.assemblyQuality).toBeNull()
    expect(s.money).toBeGreaterThan(0)
  })

  it('cinematic_drone: повний цикл з 8 точками', () => {
    const s = runCycle([1, 1, 1, 1, 1, 1, 1, 1], 'cinematic_drone')
    expect(s.phase).toBe(Phase.IDLE)
  })

  it('longrange_drone: повний цикл з 5 точками', () => {
    const s = runCycle([0.8, 0.8, 0.8, 0.8, 0.8], 'longrange_drone')
    expect(s.phase).toBe(Phase.IDLE)
  })

  it('кожен дрон має solderPointCount що збігається з довжиною assemblySteps', () => {
    for (const kit of Object.values(KIT_TYPES)) {
      expect(kit.assemblySteps.length, `${kit.id} steps length`).toBe(kit.solderPointCount)
    }
  })

  it('ціна racing_drone вища за mini_drone при однаковій якості', () => {
    const mini    = calcPrice(KIT_TYPES.mini_drone.basePrice,      1, 1)
    const racing  = calcPrice(KIT_TYPES.racing_drone.basePrice,    1, 1)
    const cinema  = calcPrice(KIT_TYPES.cinematic_drone.basePrice, 1, 1)
    expect(racing).toBeGreaterThan(mini)
    expect(cinema).toBeGreaterThan(racing)
  })
})

describe('Апгрейд consumables (D2.2)', () => {
  function richState() { return { ...createState(), money: 9999, locationId: 'workshop' } }

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

describe('Скарбничка (piggy bank)', () => {
  it('canOpenPiggy: true коли lastPiggyAt null', () => {
    const { can, remainingMs } = canOpenPiggy(createState(), Date.now())
    expect(can).toBe(true)
    expect(remainingMs).toBe(0)
  })

  it('canOpenPiggy: false одразу після сесії', () => {
    const now = Date.now()
    const s = { ...createState(), lastPiggyAt: now - 1000 }
    const { can, remainingMs } = canOpenPiggy(s, now)
    expect(can).toBe(false)
    expect(remainingMs).toBeGreaterThan(0)
  })

  it('canOpenPiggy: remainingMs відповідає часу що лишився', () => {
    const now = Date.now()
    const ago = 30_000
    const s = { ...createState(), lastPiggyAt: now - ago }
    const { remainingMs } = canOpenPiggy(s, now)
    expect(remainingMs).toBeCloseTo(PIGGY_COOLDOWN_MS - ago, -2)
  })

  it('canOpenPiggy: true після закінчення кулдауну', () => {
    const s = { ...createState(), lastPiggyAt: Date.now() - PIGGY_COOLDOWN_MS - 1 }
    expect(canOpenPiggy(s, Date.now()).can).toBe(true)
  })

  it('collectPiggy: нараховує taps × tap_value', () => {
    const now = Date.now()
    const s = createState()
    const result = collectPiggy(s, 10, now)
    expect(result.money).toBe(s.money + Math.min(10 * PIGGY_TAP_VALUE, PIGGY_MAX_PAYOUT))
    expect(result.lastPiggyAt).toBe(now)
  })

  it('collectPiggy: не перевищує PIGGY_MAX_PAYOUT', () => {
    const s = createState()
    expect(collectPiggy(s, 9999, Date.now()).money).toBe(s.money + PIGGY_MAX_PAYOUT)
  })

  it('collectPiggy: 0 тапів → 0 грошей', () => {
    const s = createState()
    expect(collectPiggy(s, 0, Date.now()).money).toBe(s.money)
  })

  it('collectPiggy: не мутує оригінальний стан', () => {
    const s = createState()
    const moneyBefore = s.money
    collectPiggy(s, 5, Date.now())
    expect(s.money).toBe(moneyBefore)
    expect(s.lastPiggyAt).toBeNull()
  })

  it('lastPiggyAt зберігається в стані після collectPiggy', () => {
    const s = createState()
    const now = 1_700_000_000_000
    expect(collectPiggy(s, 5, now).lastPiggyAt).toBe(now)
  })
})

describe('D6 — слоти доставки та логістика', () => {
  function richState() { return { ...createState(), money: 9999, locationId: 'workshop' } }
  const NOW = 1_000_000_000

  it('createState: deliveries порожній', () => {
    expect(createState().deliveries).toEqual([])
  })

  it('orderKit з IDLE → delivery в deliveries зі статусом transit', () => {
    const s = orderKit(richState(), 'mini_drone', NOW)
    expect(s.deliveries).toHaveLength(1)
    expect(s.deliveries[0].status).toBe(DeliveryStatus.TRANSIT)
    expect(s.deliveries[0].readyAt).toBe(NOW + KIT_TYPES.mini_drone.deliveryMs)
    expect(s.phase).toBe(Phase.IDLE)
  })

  it('без апгрейду складу — другий orderKit кидає помилку', () => {
    const s = orderKit(richState(), 'mini_drone', NOW)
    expect(() => orderKit(s, 'mini_drone', NOW)).toThrow('orderKit')
  })

  it('storage L1: можна замовити ще один kit', () => {
    let s = buyUpgrade(richState(), 'storage')
    s = orderKit(s, 'mini_drone', NOW)
    s = orderKit(s, 'racing_drone', NOW)
    expect(s.deliveries).toHaveLength(2)
    expect(s.deliveries[1].kitId).toBe('racing_drone')
  })

  it('storage L1: можна замовити під час ASSEMBLY', () => {
    let s = buyUpgrade(richState(), 'storage')
    s = inAssembly(0, { money: s.money, upgrades: s.upgrades })
    expect(s.phase).toBe(Phase.ASSEMBLY)
    expect(s.deliveries).toHaveLength(0)
    s = orderKit(s, 'mini_drone', NOW)
    expect(s.phase).toBe(Phase.ASSEMBLY)
    expect(s.deliveries).toHaveLength(1)
  })

  it('storage L1: можна замовити у фазі READY', () => {
    let s = buyUpgrade(richState(), 'storage')
    s = inAssembly(0, { money: s.money, upgrades: s.upgrades })
    for (let i = 0; i < 4; i++) s = recordSolderPoint(s, 1)
    s = finishAssembly(s)
    expect(s.phase).toBe(Phase.READY)
    s = orderKit(s, 'mini_drone', NOW)
    expect(s.phase).toBe(Phase.READY)
    expect(s.deliveries).toHaveLength(1)
  })

  it('sell з готовим вторинним слотом → IDLE, deliveries збережені', () => {
    let s = buyUpgrade(richState(), 'storage')
    s = inAssembly(0, { money: s.money, upgrades: s.upgrades })
    for (let i = 0; i < 4; i++) s = recordSolderPoint(s, 1)
    s = finishAssembly(s)
    // Add a secondary delivery manually
    s = { ...s, deliveries: [{ id: 'q1', kitId: 'racing_drone', readyAt: NOW - 1, slotIndex: 0, status: 'transit' }] }
    s = sell(s)
    expect(s.phase).toBe(Phase.IDLE)
    expect(s.activeKit).toBeNull()
    expect(s.deliveries).toHaveLength(1)
    expect(s.deliveries[0].id).toBe('q1')
  })

  it('sell з порожньою чергою → IDLE', () => {
    const s = runCycle([1, 1, 1, 1])
    expect(s.phase).toBe(Phase.IDLE)
    expect(s.deliveries).toHaveLength(0)
  })

  it('abandonBurntDrone з готовим слотом → IDLE, deliveries збережені', () => {
    let s = buyUpgrade(richState(), 'storage')
    s = inAssembly(0, { money: s.money, upgrades: s.upgrades })
    s = burnKit(s)
    s = { ...s, deliveries: [{ id: 'q3', kitId: 'mini_drone', readyAt: NOW - 1, slotIndex: 0, status: 'transit' }] }
    s = abandonBurntDrone(s, 0)
    expect(s.phase).toBe(Phase.IDLE)
    expect(s.activeKit).toBeNull()
    expect(s.deliveries).toHaveLength(1)
  })

  it('не можна замовити більше за maxSlots', () => {
    let s = buyUpgrade(richState(), 'storage')   // L1 → total 2 slots
    s = orderKit(s, 'mini_drone', NOW)
    s = orderKit(s, 'mini_drone', NOW)
    expect(() => orderKit(s, 'mini_drone', NOW)).toThrow('orderKit')
  })

  it('storage L2: дозволяє 3 слоти', () => {
    let s = richState()
    s = buyUpgrade(s, 'storage')
    s = buyUpgrade(s, 'storage')
    s = orderKit(s, 'mini_drone', NOW)
    s = orderKit(s, 'mini_drone', NOW)
    s = orderKit(s, 'mini_drone', NOW)
    expect(s.deliveries).toHaveLength(3)
    expect(() => orderKit(s, 'mini_drone', NOW)).toThrow('orderKit')
  })

  it('logistics L1: скорочує час доставки на 30%', () => {
    let s = buyUpgrade(richState(), 'logistics')
    s = orderKit(s, 'mini_drone', NOW)
    const expected = Math.round(KIT_TYPES.mini_drone.deliveryMs * LOGISTICS_DELIVERY_MULT[1])
    expect(s.deliveries[0].readyAt).toBe(NOW + expected)
  })

  it('logistics L2: скорочує час доставки на 50%', () => {
    let s = richState()
    s = buyUpgrade(s, 'logistics')
    s = buyUpgrade(s, 'logistics')
    s = orderKit(s, 'mini_drone', NOW)
    const expected = Math.round(KIT_TYPES.mini_drone.deliveryMs * LOGISTICS_DELIVERY_MULT[2])
    expect(s.deliveries[0].readyAt).toBe(NOW + expected)
  })

  it('logistics застосовується до всіх доставок', () => {
    let s = richState()
    s = buyUpgrade(s, 'storage')
    s = buyUpgrade(s, 'logistics')
    s = orderKit(s, 'mini_drone', NOW)
    s = orderKit(s, 'racing_drone', NOW)
    const expected = Math.round(KIT_TYPES.racing_drone.deliveryMs * LOGISTICS_DELIVERY_MULT[1])
    expect(s.deliveries[1].readyAt).toBe(NOW + expected)
  })

  it('storage: buyUpgrade збільшує storageLevel', () => {
    const s = buyUpgrade(richState(), 'storage')
    expect(s.upgrades.storageLevel).toBe(1)
    expect(s.money).toBe(9999 - STORAGE_UPGRADE_COSTS[0])
  })

  it('logistics: buyUpgrade збільшує logisticsLevel', () => {
    const s = buyUpgrade(richState(), 'logistics')
    expect(s.upgrades.logisticsLevel).toBe(1)
    expect(s.money).toBe(9999 - LOGISTICS_UPGRADE_COSTS[0])
  })

  // D6.6 — кожна доставка отримує унікальний slotIndex
  it('orderKit → slotIndex = 0 для першої доставки', () => {
    const s = orderKit(richState(), 'mini_drone', NOW)
    expect(s.deliveries[0].slotIndex).toBe(0)
  })

  it('два orderKit → різні slotIndex (0 і 1)', () => {
    let s = buyUpgrade(richState(), 'storage')
    s = orderKit(s, 'mini_drone', NOW)
    s = orderKit(s, 'mini_drone', NOW)
    const indices = s.deliveries.map(d => d.slotIndex)
    expect(new Set(indices).size).toBe(2)
  })

  it('після startAssembly слот 0 звільняється і наступна доставка може його зайняти', () => {
    let s = buyUpgrade(richState(), 'storage')
    s = orderKit(s, 'mini_drone', NOW)  // slot 0
    s = forceArrived(s, s.deliveries[0].id)
    s = pickupDelivery(s, s.deliveries[0].id)
    s = startAssembly(s)                // slot 0 freed (box on bench)
    s = orderKit(s, 'mini_drone', NOW)  // gets slot 0 again
    expect(s.deliveries).toHaveLength(1)
    expect(s.deliveries[0].slotIndex).toBe(0)
  })

  it('три доставки → три різних slotIndex', () => {
    let s = richState()
    s = buyUpgrade(s, 'storage')
    s = buyUpgrade(s, 'storage')
    s = orderKit(s, 'mini_drone', NOW)
    s = orderKit(s, 'mini_drone', NOW)
    s = orderKit(s, 'mini_drone', NOW)
    const indices = s.deliveries.map(d => d.slotIndex)
    expect(new Set(indices).size).toBe(3)
  })

  it('_afterBenchClear → IDLE зберігає deliveries без змін', () => {
    let s = inAssembly(0, { money: 9999, upgrades: { ...createState().upgrades, storageLevel: 1 } })
    const secondary = { id: 'q-kept', kitId: 'racing_drone', readyAt: NOW - 1, slotIndex: 0, status: 'transit' }
    s = { ...s, deliveries: [secondary] }
    const kit = KIT_TYPES[s.activeKit]
    for (let i = 0; i < kit.solderPointCount; i++) s = recordSolderPoint(s, 1.0)
    s = finishAssembly(s)
    const deliveriesBefore = s.deliveries
    s = sell(s)
    expect(s.phase).toBe(Phase.IDLE)
    expect(s.deliveries).toHaveLength(deliveriesBefore.length)
    expect(s.deliveries[0].id).toBe(deliveriesBefore[0].id)
  })
})

describe('D6.6 — pickupDelivery', () => {
  function richState() { return { ...createState(), money: 9999, locationId: 'workshop' } }
  const NOW = 1_000_000_000

  function idleWithArrivedDelivery(slotIndex = 0) {
    const d = { id: 'del-a', kitId: 'mini_drone', readyAt: NOW - 1, slotIndex, status: 'transit' }
    return { ...richState(), deliveries: [d] }
  }

  it('IDLE + arrived → IDLE з delivery status=carrying', () => {
    const s = pickupDelivery(idleWithArrivedDelivery(1), 'del-a', NOW)
    expect(s.phase).toBe(Phase.IDLE)
    expect(s.deliveries[0].status).toBe(DeliveryStatus.CARRYING)
    expect(s.deliveries[0].kitId).toBe('mini_drone')
    expect(s.deliveries[0].slotIndex).toBe(1)
  })

  it('pickupDelivery → startAssembly ставить kit на стіл', () => {
    let s = pickupDelivery(idleWithArrivedDelivery(0), 'del-a', NOW)
    s = startAssembly(s)
    expect(s.phase).toBe(Phase.ASSEMBLY)
    expect(s.activeKit).toBe('mini_drone')
    expect(s.deliveries).toHaveLength(0)
  })

  it('два слоти: можна вибрати другий першим', () => {
    const d1 = { id: 'del-1', kitId: 'mini_drone',  readyAt: NOW - 100, slotIndex: 0, status: 'transit' }
    const d2 = { id: 'del-2', kitId: 'racing_drone', readyAt: NOW - 50,  slotIndex: 1, status: 'transit' }
    let s = { ...richState(), deliveries: [d1, d2] }
    // Pick up d2 first (slot 1)
    s = pickupDelivery(s, 'del-2', NOW)
    expect(s.deliveries.find(d => d.id === 'del-2').status).toBe(DeliveryStatus.CARRYING)
    expect(s.deliveries.find(d => d.id === 'del-1').status).toBe(DeliveryStatus.TRANSIT)
    s = startAssembly(s)
    expect(s.activeKit).toBe('racing_drone')
    expect(s.deliveries).toHaveLength(1)
    expect(s.deliveries[0].id).toBe('del-1')  // d1 still waiting
  })

  it('доставка ще в дорозі → помилка', () => {
    const d = { id: 'del-a', kitId: 'mini_drone', readyAt: NOW + 5000, slotIndex: 0, status: 'transit' }
    const s = { ...richState(), deliveries: [d] }
    expect(() => pickupDelivery(s, 'del-a', NOW)).toThrow('ще в дорозі')
  })

  it('невідомий deliveryId → помилка', () => {
    expect(() => pickupDelivery(idleWithArrivedDelivery(), 'no-such-id', NOW)).toThrow('не знайдено')
  })

  it('не IDLE фаза → помилка', () => {
    const s = inAssembly()
    const d = { id: 'del-a', kitId: 'mini_drone', readyAt: NOW - 1, slotIndex: 1, status: 'transit' }
    expect(() => pickupDelivery({ ...s, deliveries: [d] }, 'del-a', NOW)).toThrow('недозволено')
  })

  it('вже є carrying → помилка', () => {
    const d1 = { id: 'del-1', kitId: 'mini_drone', readyAt: NOW - 1, slotIndex: 0, status: 'carrying' }
    const d2 = { id: 'del-2', kitId: 'mini_drone', readyAt: NOW - 1, slotIndex: 1, status: 'transit' }
    const s  = { ...richState(), deliveries: [d1, d2] }
    expect(() => pickupDelivery(s, 'del-2', NOW)).toThrow('вже несеться')
  })

  it('pickupDelivery не мутує оригінальний стан', () => {
    const base = idleWithArrivedDelivery()
    const phaseBefore = base.phase
    const statusBefore = base.deliveries[0].status
    pickupDelivery(base, 'del-a', NOW)
    expect(base.phase).toBe(phaseBefore)
    expect(base.deliveries[0].status).toBe(statusBefore)
  })
})

// ── D7 — Прогрес локацій ──────────────────────────────────

describe('D7 — Реєстр локацій', () => {
  it('createState: locationId = apartment', () => {
    expect(createState().locationId).toBe('apartment')
  })

  it('LOCATION_ORDER містить apartment, garage, workshop', () => {
    expect(LOCATION_ORDER).toEqual(['apartment', 'garage', 'workshop'])
  })

  it('currentLocation(apartment): повертає дані квартири', () => {
    const s = createState()
    expect(currentLocation(s).id).toBe('apartment')
    expect(currentLocation(s).emoji).toBe('🏠')
  })

  it('currentLocation: default apartment якщо locationId відсутній', () => {
    const s = { ...createState(), locationId: undefined }
    expect(currentLocation(s).id).toBe('apartment')
  })

  it('capFor: apartment — storage cap = 0, soldering cap = 2', () => {
    const s = createState()
    expect(capFor(s, 'storage')).toBe(0)
    expect(capFor(s, 'soldering')).toBe(2)
  })

  it('capFor: garage — storage cap = 1, logistics cap = 1', () => {
    const s = { ...createState(), locationId: 'garage' }
    expect(capFor(s, 'storage')).toBe(1)
    expect(capFor(s, 'logistics')).toBe(1)
  })

  it('capFor: workshop — всі кепи = max', () => {
    const s = { ...createState(), locationId: 'workshop' }
    expect(capFor(s, 'storage')).toBe(2)
    expect(capFor(s, 'soldering')).toBe(3)
    expect(capFor(s, 'worker')).toBe(2)
  })
})

describe('D7 — Кепи апгрейдів за локацією', () => {
  it('buyUpgrade storage в apartment → помилка "заблоковано"', () => {
    const s = { ...createState(), money: 9999 }
    expect(() => buyUpgrade(s, 'storage')).toThrow('заблоковано')
  })

  it('buyUpgrade logistics в apartment → помилка "заблоковано"', () => {
    const s = { ...createState(), money: 9999 }
    expect(() => buyUpgrade(s, 'logistics')).toThrow('заблоковано')
  })

  it('buyUpgrade soldering в apartment: можна до рівня 2', () => {
    let s = { ...createState(), money: 9999 }
    s = buyUpgrade(s, 'soldering')  // level 0 → 1
    s = buyUpgrade(s, 'soldering')  // level 1 → 2
    expect(s.upgrades.solderingLevel).toBe(2)
  })

  it('buyUpgrade soldering до рівня 3 в apartment → помилка "заблоковано"', () => {
    let s = { ...createState(), money: 9999 }
    s = buyUpgrade(s, 'soldering')
    s = buyUpgrade(s, 'soldering')
    expect(() => buyUpgrade(s, 'soldering')).toThrow('заблоковано')
  })

  it('buyUpgrade worker в apartment: до рівня 1, але не 2', () => {
    let s = { ...createState(), money: 9999 }
    s = buyUpgrade(s, 'worker')
    expect(s.upgrades.workerLevel).toBe(1)
    expect(() => buyUpgrade(s, 'worker')).toThrow('заблоковано')
  })

  it('після переїзду до garage: storage можна купити', () => {
    let s = { ...createState(), money: 9999, locationId: 'garage' }
    s = buyUpgrade(s, 'storage')
    expect(s.upgrades.storageLevel).toBe(1)
  })
})

describe('D7 — canMoveToLocation', () => {
  it('apartment → garage: причини без грошей і солдерингу', () => {
    const s = createState()  // money=120, solderingLevel=0
    const { can, reasons } = canMoveToLocation(s, 'garage')
    expect(can).toBe(false)
    expect(reasons.length).toBeGreaterThan(0)
    expect(reasons.some(r => r.includes('800'))).toBe(true)
  })

  it('apartment → garage: can=true коли є гроші + soldering=2', () => {
    let s = { ...createState(), money: 9999, locationId: 'apartment' }
    s = buyUpgrade(s, 'soldering')
    s = buyUpgrade(s, 'soldering')
    const { can, reasons } = canMoveToLocation(s, 'garage')
    expect(can).toBe(true)
    expect(reasons).toHaveLength(0)
  })

  it('apartment → garage: нема грошей — у причинах вартість', () => {
    let s = { ...createState(), money: 100, locationId: 'apartment' }
    s = { ...s, upgrades: { ...s.upgrades, solderingLevel: 2 } }
    const { can, reasons } = canMoveToLocation(s, 'garage')
    expect(can).toBe(false)
    expect(reasons.some(r => r.includes('800'))).toBe(true)
  })

  it('вже в garage: переїзд до apartment → помилка', () => {
    const s = { ...createState(), locationId: 'garage' }
    const { can, reasons } = canMoveToLocation(s, 'apartment')
    expect(can).toBe(false)
    expect(reasons[0]).toMatch(/Вже/)
  })

  it('невідома локація → can=false', () => {
    expect(canMoveToLocation(createState(), 'moon').can).toBe(false)
  })
})

describe('D7 — moveToLocation', () => {
  it('переїзд до garage: locationId змінюється, гроші знімаються', () => {
    let s = { ...createState(), money: 9999, locationId: 'apartment' }
    s = buyUpgrade(s, 'soldering')
    s = buyUpgrade(s, 'soldering')
    const before = s.money
    s = moveToLocation(s, 'garage')
    expect(s.locationId).toBe('garage')
    expect(s.money).toBe(before - LOCATIONS.garage.unlockCost)
  })

  it('після переїзду до garage: capFor storage = 1', () => {
    let s = { ...createState(), money: 9999, locationId: 'apartment' }
    s = { ...s, upgrades: { ...s.upgrades, solderingLevel: 2 } }
    s = moveToLocation(s, 'garage')
    expect(capFor(s, 'storage')).toBe(1)
  })

  it('moveToLocation кидає якщо умови не виконані', () => {
    const s = createState()  // solderingLevel=0, money=120
    expect(() => moveToLocation(s, 'garage')).toThrow('moveToLocation')
  })

  it('moveToLocation не мутує оригінальний стан', () => {
    let s = { ...createState(), money: 9999, locationId: 'apartment' }
    s = { ...s, upgrades: { ...s.upgrades, solderingLevel: 2 } }
    const locBefore  = s.locationId
    const monBefore  = s.money
    moveToLocation(s, 'garage')
    expect(s.locationId).toBe(locBefore)
    expect(s.money).toBe(monBefore)
  })

  it('garage → workshop: requires soldering=3 і worker=2', () => {
    const s = { ...createState(), money: 9999, locationId: 'garage',
      upgrades: { ...createState().upgrades, solderingLevel: 3, workerLevel: 2 } }
    const result = moveToLocation(s, 'workshop')
    expect(result.locationId).toBe('workshop')
  })

  it('старий save без locationId: createState дефолт — apartment', () => {
    const defaults = createState()
    const saved    = { money: 500, phase: 'IDLE', upgrades: {} }
    const merged   = { ...defaults, ...saved, upgrades: { ...defaults.upgrades } }
    expect(merged.locationId).toBe('apartment')
  })
})
