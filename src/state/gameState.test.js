import { describe, it, expect } from 'vitest'
import {
  createState, Phase, DeliveryStatus, KIT_TYPES,
  orderKit, pickupDelivery, buyUpgrade,
  syncStations, focusStation, beginScrapRun, nextHireCost,
  startAssembly as _startAssembly,
  recordSolderPoint as _recordSolderPoint,
  finishAssembly as _finishAssembly,
  sell as _sell,
  burnKit as _burnKit,
  abandonBurntDrone as _abandonBurntDrone,
  applyColdSolderPenalty as _applyColdSolderPenalty,
  calcPrice, calcQuality,
  canOpenPiggy, collectPiggy, piggyPayoutCap, piggyTapValue, cheapestKitCost,
  moveToLocation, hireWorker, workersInRole,
  openRoomIds, nextRoomId, canUnlockRoom, unlockRoom,
} from './gameState.js'
import {
  SOLDERING_UPGRADE_COSTS, CONSUMABLES_UPGRADE_COSTS,
  PIGGY_COOLDOWN_MS, PIGGY_FULL_TAPS, PIGGY_MIN_PAYOUT, MK_COST_GROWTH,
  STORAGE_UPGRADE_COSTS, STORAGE_SLOTS_BY_LEVEL,
  LOGISTICS_UPGRADE_COSTS, LOGISTICS_DELIVERY_MULT,
} from './config.js'
import { trackMaxLevel, nextCost, levelData, UPGRADE_TRACKS } from './upgrades.js'
import { roleLevelData, ROLE_ORDER, promoteCost } from '../defs/roles.js'
import { FACTORY_HALLS } from '../defs/layouts/factory.js'
import { roomDef } from '../defs/layouts/rooms.js'

// Дім із прибудованим гаражем (П2) — те, що раніше було локацією `garage`.
const withGarage = (extra = {}) => ({
  ...createState(), unlockedRooms: ['flat', 'garage'], ...extra,
})
import { rescueKitAvailable, managerOrderChoice, incomePerSec } from '../sim/derive.js'
import {
  LOCATIONS, LOCATION_ORDER, capFor, canMoveToLocation, currentLocation,
  roleCapHere, maxWorkersHere, isTerminal, ruleAt, hiringAllowed, kitsForLocation,
} from './locations.js'

const SOLDERING_MAX_LEVEL = trackMaxLevel('soldering')

// ── Test helpers ──────────────────────────────────────────

// Simulate delivery arrival by setting readyAt to the past.
// C3 turned the bench into one of possibly several stations. These tests were
// written for a single bench, so they bind to the default one — the multi-station
// behaviour has its own block at the end of the file.
const S0 = 'station-0'
const bench = (state) => state.stations.find(s => s.id === S0)

const startAssembly          = (s) => _startAssembly(s, S0)
const recordSolderPoint      = (s, q) => _recordSolderPoint(s, S0, q)
const finishAssembly         = (s) => _finishAssembly(s, S0)
const sell                   = (s) => _sell(s, S0)
const burnKit                = (s) => _burnKit(s, S0)
const abandonBurntDrone      = (s, rate) => _abandonBurntDrone(s, S0, rate)
const applyColdSolderPenalty = (s, amt) => _applyColdSolderPenalty(s, S0, amt)

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
    expect(bench(s).phase).toBe(Phase.IDLE)
    expect(s.money).toBe(120)
    expect(bench(s).kitId).toBeNull()
    expect(bench(s).solderPoints).toHaveLength(0)
    expect(s.deliveries).toHaveLength(0)
  })

  it('ідеальна пайка — прибутковий цикл', () => {
    const s = runCycle([1, 1, 1, 1])
    // 9999 − 72 + 123.5 = 10050.5
    expect(s.money).toBeCloseTo(9999 - KIT_TYPES.mini_drone.cost + calcPrice(KIT_TYPES.mini_drone.basePrice, 1, 1))
    expect(bench(s).phase).toBe(Phase.IDLE)
    expect(bench(s).kitId).toBeNull()
    expect(bench(s).quality).toBeNull()
    expect(s.deliveries).toHaveLength(0)
  })

  it('нульова якість — цикл завершується', () => {
    const s = runCycle([0, 0, 0, 0])
    expect(bench(s).phase).toBe(Phase.IDLE)
  })

  it('фази змінюються у правильному порядку', () => {
    let s = { ...createState(), money: 9999 }
    expect(bench(s).phase).toBe(Phase.IDLE)

    s = orderKit(s, 'mini_drone')
    expect(bench(s).phase).toBe(Phase.IDLE)           // bench stays IDLE — delivery in transit
    expect(s.deliveries[0].status).toBe(DeliveryStatus.TRANSIT)

    s = forceArrived(s, s.deliveries[0].id)
    s = pickupDelivery(s, s.deliveries[0].id)
    expect(bench(s).phase).toBe(Phase.IDLE)           // still IDLE while worker carries
    expect(s.deliveries[0].status).toBe(DeliveryStatus.CARRYING)

    s = startAssembly(s)
    expect(bench(s).phase).toBe(Phase.ASSEMBLY)
    expect(s.deliveries).toHaveLength(0)       // removed when placed on bench

    s = recordSolderPoint(s, 0.8)
    s = recordSolderPoint(s, 0.8)
    s = recordSolderPoint(s, 0.8)
    s = recordSolderPoint(s, 0.8)
    expect(bench(s).solderPoints).toHaveLength(4)

    s = finishAssembly(s)
    expect(bench(s).phase).toBe(Phase.READY)
    expect(bench(s).quality).toBeCloseTo(0.8)

    s = sell(s)
    expect(bench(s).phase).toBe(Phase.IDLE)
  })
})

describe('Лічильник збірок по типах (Стадія 11 / A1)', () => {
  it('росте на завершеній збірці — і саме в свого типу', () => {
    let s = inAssembly(4, {})
    s = finishAssembly(s)
    expect(s.stats.assembledByKit.mini_drone).toBe(1)
    expect(s.stats.assembledByKit.racing_drone).toBeUndefined()
  })

  it('згорілий комплект не рахується — збірки не було', () => {
    const s = burnKit(inAssembly(2))
    expect(s.stats.assembledByKit.mini_drone ?? 0).toBe(0)
    expect(s.stats.burnt).toBe(1)
  })

  it('продаж лічильник не рухає — рахується верстак, а не скринька', () => {
    const before = finishAssembly(inAssembly(4))
    const after  = sell(before)
    expect(after.stats.assembledByKit.mini_drone)
      .toBe(before.stats.assembledByKit.mini_drone)
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

  it('C3: замовлення дозволене навіть коли станція згоріла — інші станції вільні', () => {
    const s = burnKit(inAssembly(1))
    const next = orderKit({ ...s, money: 500 }, 'mini_drone')
    expect(next.deliveries).toHaveLength(1)
    expect(bench(next).phase).toBe(Phase.BURNT)   // станція лишається зайнятою
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
    expect(bench(s).phase).toBe(Phase.IDLE)
    expect(s.deliveries).toHaveLength(0)
  })

  it('recordSolderPoint не мутує масив solderPoints', () => {
    const s = inAssembly()
    const prev = bench(s).solderPoints
    const next = recordSolderPoint(s, 0.5)
    expect(prev).toHaveLength(0)
    expect(bench(next).solderPoints).toHaveLength(1)
  })
})

describe('Поломка: гілка перегріву', () => {
  it('burnKit: ASSEMBLY → BURNT, гроші не змінюються', () => {
    const s = inAssembly(1)
    const burnt = burnKit(s)
    expect(bench(burnt).phase).toBe(Phase.BURNT)
    expect(burnt.money).toBe(s.money)
  })

  it('burnKit зберігає вже запаяні точки в стані', () => {
    expect(bench(burnKit(inAssembly(2))).solderPoints).toHaveLength(2)
  })

  it('abandonBurntDrone без salvage: гроші не змінюються', () => {
    const s = burnKit(inAssembly(1))
    const moneyBefore = s.money
    const result = abandonBurntDrone(s, 0)
    expect(bench(result).phase).toBe(Phase.IDLE)
    expect(result.money).toBe(moneyBefore)
    expect(bench(result).kitId).toBeNull()
    expect(bench(result).solderPoints).toHaveLength(0)
    expect(bench(result).quality).toBeNull()
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
    expect(bench(s).phase).toBe(Phase.IDLE)
    expect(s.deliveries).toHaveLength(1)
    expect(s.deliveries[0].status).toBe(DeliveryStatus.TRANSIT)
  })
})

describe('Холодна пайка: штраф якості', () => {
  it('applyColdSolderPenalty збільшує штраф', () => {
    const s = applyColdSolderPenalty(inAssembly(), 0.15)
    expect(bench(s).coldPenalty).toBeCloseTo(0.15)
    expect(bench(s).phase).toBe(Phase.ASSEMBLY)
    expect(bench(s).solderPoints).toHaveLength(0)
  })

  it('штраф накопичується при кількох промахах', () => {
    let s = inAssembly()
    s = applyColdSolderPenalty(s, 0.15)
    s = applyColdSolderPenalty(s, 0.15)
    expect(bench(s).coldPenalty).toBeCloseTo(0.30)
  })

  it('штраф не перевищує 1', () => {
    let s = inAssembly()
    for (let i = 0; i < 10; i++) s = applyColdSolderPenalty(s, 0.15)
    expect(bench(s).coldPenalty).toBe(1)
  })

  it('finishAssembly враховує штраф у фінальній якості', () => {
    let s = applyColdSolderPenalty(inAssembly(), 0.15)
    for (let i = 0; i < 4; i++) s = recordSolderPoint(s, 1.0)
    s = finishAssembly(s)
    expect(bench(s).quality).toBeCloseTo(0.85)
  })

  it('finishAssembly якість не нижче 0', () => {
    let s = inAssembly()
    for (let i = 0; i < 10; i++) s = applyColdSolderPenalty(s, 0.15)
    for (let i = 0; i < 4; i++) s = recordSolderPoint(s, 0.5)
    s = finishAssembly(s)
    expect(bench(s).quality).toBe(0)
  })

  it('штраф скидається після sell', () => {
    let s = inAssembly()
    s = applyColdSolderPenalty(s, 0.15)
    for (let i = 0; i < 4; i++) s = recordSolderPoint(s, 1.0)
    s = finishAssembly(s)
    s = sell(s)
    expect(bench(s).coldPenalty).toBe(0)
  })
})

describe('Апгрейди: buyUpgrade', () => {
  function richState() {
    return { ...createState(), money: 9999, locationId: 'factory' }
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

  it('C6: кожен рівень дає параметри ручної пайки — трек не гейтить доступ', () => {
    for (let i = 0; i < 4; i++) {
      expect(levelData('soldering', i).greenHalf).toBeGreaterThan(0)
      expect(levelData('soldering', i).overheatChance).toBeGreaterThanOrEqual(0)
    }
  })

  it('руками паяють два перші рівні, далі верстак робить це сам', () => {
    expect(levelData('soldering', 0).qualityMin).toBeUndefined()
    expect(levelData('soldering', 1).qualityMin).toBeUndefined()
    expect(levelData('soldering', 2).qualityMin).toBeGreaterThan(0)
    // Стадія 9 / Р3: раніше тут стояло `toBeUndefined()` — рівень 3 забирав
    // автоматику назад. Форму треку тепер сторожить upgrades.test.js.
    expect(levelData('soldering', 3).qualityMin).toBeGreaterThan(0)
  })

  it('C6: вища прокачка — прощучіша зона й менший ризик перегріву', () => {
    expect(levelData('soldering', 3).greenHalf).toBeGreaterThan(levelData('soldering', 0).greenHalf)
    expect(levelData('soldering', 3).overheatChance).toBeLessThan(levelData('soldering', 0).overheatChance)
  })

  it('buyUpgrade узагальнений: рухає рівень за stateKey трека', () => {
    const track = UPGRADE_TRACKS.soldering
    const s = buyUpgrade({ ...createState(), money: 9999 }, 'soldering')
    expect(s.upgrades[track.stateKey]).toBe(1)
  })
})

describe('Нові типи дронів (D2.1)', () => {
  it('racing_drone: повний цикл з 6 точками', () => {
    const s = runCycle([0.9, 0.9, 0.9, 0.9, 0.9, 0.9], 'racing_drone')
    expect(bench(s).phase).toBe(Phase.IDLE)
    expect(bench(s).quality).toBeNull()
    expect(s.money).toBeGreaterThan(0)
  })

  it('cinematic_drone: повний цикл з 8 точками', () => {
    const s = runCycle([1, 1, 1, 1, 1, 1, 1, 1], 'cinematic_drone')
    expect(bench(s).phase).toBe(Phase.IDLE)
  })

  it('longrange_drone: повний цикл з 5 точками', () => {
    const s = runCycle([0.8, 0.8, 0.8, 0.8, 0.8], 'longrange_drone')
    expect(bench(s).phase).toBe(Phase.IDLE)
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
  function richState() { return { ...createState(), money: 9999, locationId: 'factory' } }

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

  it('collectPiggy: нараховує taps × ціну тапу', () => {
    const now = Date.now()
    const s = createState()
    const result = collectPiggy(s, 10, now)
    expect(result.money).toBeCloseTo(s.money + 10 * piggyTapValue(s), 6)
    expect(result.lastPiggyAt).toBe(now)
  })

  it('collectPiggy: не перевищує стелю сеансу', () => {
    const s = createState()
    expect(collectPiggy(s, 9999, Date.now()).money).toBe(s.money + piggyPayoutCap(s))
  })

  it('стеля — це рівно найдешевший комплект, який тут можна купити', () => {
    // Суть фікса: зашите число $72 було ціною mini на старті, і після Mk та
    // оптових множників скарбничка вже не витягала з глухого кута — гравець
    // тряс її вісім секунд і все одно не міг замовити нічого.
    const s = createState()
    expect(piggyPayoutCap(s)).toBe(Math.max(PIGGY_MIN_PAYOUT, Math.ceil(cheapestKitCost(s))))

    // Дорожчі комплекти (Mk) підіймають і стелю.
    const marked = { ...s, kitMarks: Object.fromEntries(
      kitsForLocation(s).map(id => [id, 2])) }
    expect(piggyPayoutCap(marked)).toBeGreaterThan(piggyPayoutCap(s))
    expect(piggyPayoutCap(marked)).toBe(Math.ceil(cheapestKitCost(marked)))
    expect(MK_COST_GROWTH).toBeGreaterThan(1)
  })

  it('повний сеанс тапів завжди дає рівно стелю, хай яка вона', () => {
    for (const marks of [0, 1, 3]) {
      const s = { ...createState(), kitMarks: Object.fromEntries(
        kitsForLocation(createState()).map(id => [id, marks])) }
      const gained = collectPiggy(s, PIGGY_FULL_TAPS, Date.now()).money - s.money
      expect(gained).toBeCloseTo(piggyPayoutCap(s), 6)
    }
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
  function richState() { return { ...createState(), money: 9999, locationId: 'factory' } }
  const NOW = 1_000_000_000

  it('createState: deliveries порожній', () => {
    expect(createState().deliveries).toEqual([])
  })

  it('orderKit з IDLE → delivery в deliveries зі статусом transit', () => {
    const s = orderKit(richState(), 'mini_drone', NOW)
    expect(s.deliveries).toHaveLength(1)
    expect(s.deliveries[0].status).toBe(DeliveryStatus.TRANSIT)
    expect(s.deliveries[0].readyAt).toBe(NOW + KIT_TYPES.mini_drone.deliveryMs)
    expect(bench(s).phase).toBe(Phase.IDLE)
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
    expect(bench(s).phase).toBe(Phase.ASSEMBLY)
    expect(s.deliveries).toHaveLength(0)
    s = orderKit(s, 'mini_drone', NOW)
    expect(bench(s).phase).toBe(Phase.ASSEMBLY)
    expect(s.deliveries).toHaveLength(1)
  })

  it('storage L1: можна замовити у фазі READY', () => {
    let s = buyUpgrade(richState(), 'storage')
    s = inAssembly(0, { money: s.money, upgrades: s.upgrades })
    for (let i = 0; i < 4; i++) s = recordSolderPoint(s, 1)
    s = finishAssembly(s)
    expect(bench(s).phase).toBe(Phase.READY)
    s = orderKit(s, 'mini_drone', NOW)
    expect(bench(s).phase).toBe(Phase.READY)
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
    expect(bench(s).phase).toBe(Phase.IDLE)
    expect(bench(s).kitId).toBeNull()
    expect(s.deliveries).toHaveLength(1)
    expect(s.deliveries[0].id).toBe('q1')
  })

  it('sell з порожньою чергою → IDLE', () => {
    const s = runCycle([1, 1, 1, 1])
    expect(bench(s).phase).toBe(Phase.IDLE)
    expect(s.deliveries).toHaveLength(0)
  })

  it('abandonBurntDrone з готовим слотом → IDLE, deliveries збережені', () => {
    let s = buyUpgrade(richState(), 'storage')
    s = inAssembly(0, { money: s.money, upgrades: s.upgrades })
    s = burnKit(s)
    s = { ...s, deliveries: [{ id: 'q3', kitId: 'mini_drone', readyAt: NOW - 1, slotIndex: 0, status: 'transit' }] }
    s = abandonBurntDrone(s, 0)
    expect(bench(s).phase).toBe(Phase.IDLE)
    expect(bench(s).kitId).toBeNull()
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
    const kit = KIT_TYPES[bench(s).kitId]
    for (let i = 0; i < kit.solderPointCount; i++) s = recordSolderPoint(s, 1.0)
    s = finishAssembly(s)
    const deliveriesBefore = s.deliveries
    s = sell(s)
    expect(bench(s).phase).toBe(Phase.IDLE)
    expect(s.deliveries).toHaveLength(deliveriesBefore.length)
    expect(s.deliveries[0].id).toBe(deliveriesBefore[0].id)
  })
})

describe('D6.6 — pickupDelivery', () => {
  function richState() { return { ...createState(), money: 9999, locationId: 'factory' } }
  const NOW = 1_000_000_000

  function idleWithArrivedDelivery(slotIndex = 0) {
    const d = { id: 'del-a', kitId: 'mini_drone', readyAt: NOW - 1, slotIndex, status: 'transit' }
    return { ...richState(), deliveries: [d] }
  }

  it('IDLE + arrived → IDLE з delivery status=carrying', () => {
    const s = pickupDelivery(idleWithArrivedDelivery(1), 'del-a', NOW)
    expect(bench(s).phase).toBe(Phase.IDLE)
    expect(s.deliveries[0].status).toBe(DeliveryStatus.CARRYING)
    expect(s.deliveries[0].kitId).toBe('mini_drone')
    expect(s.deliveries[0].slotIndex).toBe(1)
  })

  it('pickupDelivery → startAssembly ставить kit на стіл', () => {
    let s = pickupDelivery(idleWithArrivedDelivery(0), 'del-a', NOW)
    s = startAssembly(s)
    expect(bench(s).phase).toBe(Phase.ASSEMBLY)
    expect(bench(s).kitId).toBe('mini_drone')
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
    expect(bench(s).kitId).toBe('racing_drone')
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

  it('C3: коробку можна забрати поки станція зайнята — вона чекає', () => {
    const s = inAssembly()
    const d = { id: 'del-a', kitId: 'mini_drone', readyAt: NOW - 1, slotIndex: 1, status: 'transit' }
    const next = pickupDelivery({ ...s, deliveries: [d] }, 'del-a', NOW)
    expect(next.deliveries[0].status).toBe('carrying')
  })

  it('вже є carrying → помилка', () => {
    const d1 = { id: 'del-1', kitId: 'mini_drone', readyAt: NOW - 1, slotIndex: 0, status: 'carrying' }
    const d2 = { id: 'del-2', kitId: 'mini_drone', readyAt: NOW - 1, slotIndex: 1, status: 'transit' }
    const s  = { ...richState(), deliveries: [d1, d2] }
    expect(() => pickupDelivery(s, 'del-2', NOW)).toThrow('вже несеться')
  })

  it('pickupDelivery не мутує оригінальний стан', () => {
    const base = idleWithArrivedDelivery()
    const phaseBefore = bench(base).phase
    const statusBefore = base.deliveries[0].status
    pickupDelivery(base, 'del-a', NOW)
    expect(bench(base).phase).toBe(phaseBefore)
    expect(base.deliveries[0].status).toBe(statusBefore)
  })
})

// ── D7 — Прогрес локацій ──────────────────────────────────

describe('D7 — Реєстр локацій', () => {
  it('createState: locationId = apartment', () => {
    expect(createState().locationId).toBe('apartment')
  })

  it('LOCATION_ORDER містить apartment і factory — гараж тепер кімната', () => {
    expect(LOCATION_ORDER).toEqual(['apartment', 'factory'])
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

  it('capFor: гараж піднімає стелю вдома — storage 1, logistics 1', () => {
    const s = withGarage()
    expect(capFor(s, 'storage')).toBe(1)
    expect(capFor(s, 'logistics')).toBe(1)
    // Стеля — максимум по кімнатах, а не сума: паяльник 3, а не 2+3.
    expect(capFor(s, 'soldering')).toBe(3)
  })

  it('capFor: factory — всі кепи = max', () => {
    const s = { ...createState(), locationId: 'factory' }
    expect(capFor(s, 'storage')).toBe(2)
    expect(capFor(s, 'soldering')).toBe(3)
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

  it('buyUpgrade benches у квартирі заблоковано — другий верстак з гаража', () => {
    const s = { ...createState(), money: 9999 }
    expect(() => buyUpgrade(s, 'benches')).toThrow('заблоковано')
  })

  it('після прибудови гаража: storage можна купити', () => {
    let s = withGarage({ money: 9999 })
    s = buyUpgrade(s, 'storage')
    expect(s.upgrades.storageLevel).toBe(1)
  })
})

describe('П2 — гараж як кімната квартири', () => {
  it('спершу гараж — це наступна кімната, і вона одна', () => {
    const s = createState()
    expect(openRoomIds(s)).toEqual(['flat'])
    expect(nextRoomId(s)).toBe('garage')
    expect(nextRoomId(withGarage())).toBeNull()
  })

  it('без грошей і паяльника — причини називають і те, і те', () => {
    const { can, reasons } = canUnlockRoom(createState(), 'garage')  // money=120, soldering=0
    expect(can).toBe(false)
    expect(reasons.some(r => r.includes('800'))).toBe(true)
    expect(reasons.some(r => r.includes('Паяльник'))).toBe(true)
  })

  it('can=true коли є гроші і soldering=2', () => {
    let s = { ...createState(), money: 9999 }
    s = buyUpgrade(s, 'soldering')
    s = buyUpgrade(s, 'soldering')
    const { can, reasons } = canUnlockRoom(s, 'garage')
    expect(can).toBe(true)
    expect(reasons).toHaveLength(0)
  })

  it('кімната КУПУЄТЬСЯ: ціна списується, решта лишається', () => {
    const s = { ...createState(), money: 5000,
      upgrades: { ...createState().upgrades, solderingLevel: 2 } }
    const after = unlockRoom(s, 'garage')
    expect(after.money).toBe(5000 - roomDef('garage').cost)
    expect(openRoomIds(after)).toEqual(['flat', 'garage'])
    // Оригінал не змінився.
    expect(s.money).toBe(5000)
    expect(openRoomIds(s)).toEqual(['flat'])
  })

  it('гараж приносить найм, довгий кіт і другий верстак', () => {
    const before = createState()
    const after  = withGarage()
    expect(hiringAllowed(before)).toBe(false)
    expect(hiringAllowed(after)).toBe(true)
    expect(kitsForLocation(before)).not.toContain('longrange_drone')
    expect(kitsForLocation(after)).toContain('longrange_drone')
    expect(capFor(before, 'benches')).toBe(0)
    expect(capFor(after, 'benches')).toBe(1)
  })

  it('кімнати відкриваються по черзі й не двічі', () => {
    expect(canUnlockRoom({ ...createState(), money: 9999 }, 'flat').can).toBe(false)
    expect(() => unlockRoom(withGarage({ money: 9999 }), 'garage')).toThrow('unlockRoom')
  })

  it('на фабриці кімнат не добудовують — там ростуть цехи', () => {
    const f = { ...createState(), locationId: 'factory', money: 9999 }
    expect(canUnlockRoom(f, 'garage').can).toBe(false)
  })
})

describe('D7 — moveToLocation', () => {
  const readyForFactory = (extra = {}) => withGarage({
    money: 9999,
    upgrades: { ...createState().upgrades, solderingLevel: 3, consumablesLevel: 2 },
    ...extra,
  })

  it('переїзд на фабрику: каса скидається до стартової суми локації', () => {
    const s = moveToLocation(readyForFactory(), 'factory')
    expect(s.locationId).toBe('factory')
    expect(s.money).toBe(LOCATIONS.factory.startMoney)
  })

  it('скидання не залежить від того, скільки було накопичено', () => {
    const rich = readyForFactory({ money: 500000 })
    const poor = readyForFactory({ money: LOCATIONS.factory.unlockCost })
    expect(moveToLocation(rich, 'factory').money).toBe(moveToLocation(poor, 'factory').money)
  })

  it('unlockCost лишається порогом входу, хоч і не списується', () => {
    const s = readyForFactory({ money: LOCATIONS.factory.unlockCost - 1 })
    expect(() => moveToLocation(s, 'factory')).toThrow('moveToLocation')
  })

  it('після переїзду на фабрику: capFor storage = 2', () => {
    const s = moveToLocation(readyForFactory(), 'factory')
    expect(capFor(s, 'storage')).toBe(2)
  })

  it('moveToLocation кидає якщо умови не виконані', () => {
    const s = createState()  // solderingLevel=0, money=120
    expect(() => moveToLocation(s, 'factory')).toThrow('moveToLocation')
  })

  it('переїзд на фабрику вимагає прибудованого гаража', () => {
    const noGarage = { ...createState(), money: 9999,
      upgrades: { ...createState().upgrades, solderingLevel: 3, consumablesLevel: 2 } }
    const { can, reasons } = canMoveToLocation(noGarage, 'factory')
    expect(can).toBe(false)
    expect(reasons.some(r => r.includes('Гараж'))).toBe(true)
  })

  it('moveToLocation не мутує оригінальний стан', () => {
    const s = readyForFactory()
    const locBefore = s.locationId
    const monBefore = s.money
    moveToLocation(s, 'factory')
    expect(s.locationId).toBe(locBefore)
    expect(s.money).toBe(monBefore)
  })

  it('невідома локація → can=false', () => {
    expect(canMoveToLocation(createState(), 'moon').can).toBe(false)
  })

  it('старий save без locationId: createState дефолт — apartment', () => {
    const defaults = createState()
    const saved    = { money: 500, phase: 'IDLE', upgrades: {} }
    const merged   = { ...defaults, ...saved, upgrades: { ...defaults.upgrades } }
    expect(merged.locationId).toBe('apartment')
  })
})

// ── C3 — станції як сутності ─────────────────────────────
//
// Все вище написане для одного верстака і прив'язане до station-0. Цей блок
// перевіряє те, заради чого робився рефактор: станції справді незалежні.

describe('C3: кілька станцій', () => {
  const NOW3 = 1_700_000_000_000

  function twoStations(money = 5000) {
    let s = { ...createState(), money, locationId: 'factory' }
    return syncStations(s, 2)
  }

  // Puts a kit onto `stationId` without going through the whole delivery dance.
  function loadStation(state, stationId, kitId = 'mini_drone') {
    let s = orderKit({ ...state, money: state.money + 1000 }, kitId, NOW3)
    const d = s.deliveries[s.deliveries.length - 1]
    s = pickupDelivery({ ...s, deliveries: s.deliveries.map(x =>
      x.id === d.id ? { ...x, readyAt: NOW3 - 1 } : x) }, d.id, NOW3)
    return _startAssembly(s, stationId)
  }

  it('syncStations створює станції й зберігає прогрес наявних', () => {
    const one = createState()
    const two = syncStations(one, 2)
    expect(two.stations).toHaveLength(2)
    expect(two.stations[0]).toBe(one.stations[0])   // існуюча не перестворена
    expect(two.stations[1].phase).toBe(Phase.IDLE)
  })

  it('syncStations ідемпотентна', () => {
    const s = syncStations(createState(), 2)
    expect(syncStations(s, 2)).toBe(s)
  })

  it('пайка на одній станції не чіпає іншу', () => {
    let s = twoStations()
    s = loadStation(s, 'station-0')
    s = loadStation(s, 'station-1', 'racing_drone')

    s = _recordSolderPoint(s, 'station-0', 0.9)
    s = _recordSolderPoint(s, 'station-0', 0.9)

    expect(s.stations[0].solderPoints).toHaveLength(2)
    expect(s.stations[1].solderPoints).toHaveLength(0)
    expect(s.stations[0].kitId).toBe('mini_drone')
    expect(s.stations[1].kitId).toBe('racing_drone')
  })

  it('дві станції можуть бути в різних фазах одночасно', () => {
    let s = twoStations()
    s = loadStation(s, 'station-0')
    s = loadStation(s, 'station-1')

    for (let i = 0; i < 4; i++) s = _recordSolderPoint(s, 'station-0', 0.8)
    s = _finishAssembly(s, 'station-0')
    s = _burnKit(s, 'station-1')

    expect(s.stations[0].phase).toBe(Phase.READY)
    expect(s.stations[1].phase).toBe(Phase.BURNT)
  })

  it('продаж з однієї станції звільняє тільки її', () => {
    let s = twoStations()
    s = loadStation(s, 'station-0')
    s = loadStation(s, 'station-1')
    for (let i = 0; i < 4; i++) s = _recordSolderPoint(s, 'station-0', 1)
    s = _finishAssembly(s, 'station-0')

    const before = s.money
    s = _sell(s, 'station-0')

    expect(s.stations[0].phase).toBe(Phase.IDLE)
    expect(s.stations[0].kitId).toBeNull()
    expect(s.stations[1].phase).toBe(Phase.ASSEMBLY)   // сусідка працює далі
    expect(s.money).toBeGreaterThan(before)
  })

  it('перегрів на одній станції не блокує роботу на іншій', () => {
    let s = twoStations()
    s = loadStation(s, 'station-0')
    s = _burnKit(s, 'station-0')
    s = loadStation(s, 'station-1')

    s = _recordSolderPoint(s, 'station-1', 0.9)
    expect(s.stations[1].solderPoints).toHaveLength(1)
    expect(s.stations[0].phase).toBe(Phase.BURNT)
  })

  it('невідома станція — гучна помилка, не тиха робота не з тією', () => {
    const s = twoStations()
    expect(() => _startAssembly(s, 'station-9')).toThrow('не знайдено')
  })

  it('копирсання в смітнику лише рахується — станом гри воно не керує', () => {
    // Умова «чи можна зараз» живе в зоні (interactions.trashbin), а не тут:
    // смітник став самообслуговуванням, і стан гри від підходу до нього не
    // перемикається — росте тільки лічильник, на якому тримаються підказки.
    const s = beginScrapRun(createState())
    expect(s.scrapRuns).toBe(1)
    expect(beginScrapRun(s).scrapRuns).toBe(2)
  })

  it('слоти доставки більше не блокуються зайнятим верстаком', () => {
    // storageLevel 0 = 1 слот. Раніше зайнятий верстак з'їдав цей слот.
    let s = loadStation({ ...createState(), money: 5000 }, 'station-0')
    expect(s.deliveries).toHaveLength(0)
    const next = orderKit(s, 'mini_drone', NOW3)
    expect(next.deliveries).toHaveLength(1)
  })

  it('focusStation показує зайняту станцію, а не завжди першу', () => {
    let s = twoStations()
    expect(focusStation(s).id).toBe('station-0')
    s = loadStation(s, 'station-1')
    expect(focusStation(s).id).toBe('station-1')
  })
})

// ── C7 — баланс: інваріанти, які легко зламати числом у конфізі ──

describe('C7: прогресія апгрейдів монотонна', () => {
  it('кожен наступний рівень пайки не гірший за попередній', () => {
    for (let i = 1; i < 4; i++) {
      const prev = levelData('soldering', i - 1)
      const cur  = levelData('soldering', i)
      expect(cur.greenHalf, `рівень ${i}: зона`).toBeGreaterThanOrEqual(prev.greenHalf)
      expect(cur.overheatChance, `рівень ${i}: перегрів`).toBeLessThanOrEqual(prev.overheatChance)
    }
  })

  it('паяльна станція — найпрощучіша зона в грі й нульовий перегрів', () => {
    const station = levelData('soldering', 3)
    for (let i = 0; i < 3; i++) {
      expect(station.greenHalf).toBeGreaterThan(levelData('soldering', i).greenHalf)
    }
    expect(station.overheatChance).toBe(0)
  })

  it('ідеальна ручна пайка лишається вигіднішою за будь-яку автоматику', () => {
    const kit  = KIT_TYPES.mini_drone
    const hand = calcPrice(kit.basePrice, 1, 1)
    // Джерел авто-темпу лишилось одне (напівавтомат) — решта автоматизації це люди.
    for (let i = 0; i < 4; i++) {
      const d = levelData('soldering', i)
      if (d.qualityMax === undefined) continue
      expect(calcPrice(kit.basePrice, d.qualityMax, 1)).toBeLessThan(hand)
    }
  })

  it('кожен рівень техніка кращий за попередній', () => {
    for (let i = 1; i < 3; i++) {
      expect(roleLevelData('tech', i).pointMs).toBeLessThan(roleLevelData('tech', i - 1).pointMs)
      expect(roleLevelData('tech', i).quality).toBeGreaterThan(roleLevelData('tech', i - 1).quality)
    }
  })

  it('найм дешевшає відносно доходу лише через зростання цеху, не через баг', () => {
    // Друга людина тієї ж ролі коштує дорожче, але перша ролі — за своєю кривою.
    expect(nextHireCost(createState(), 'tech')).toBeGreaterThan(nextHireCost(createState(), 'courier'))
  })
})

// ── Fix pass (2026-07-26) ─────────────────────────────────

describe('Апгрейди не чекають на вільний верстак', () => {
  it('buyUpgrade проходить, поки станція в ASSEMBLY', () => {
    const s = inAssembly(1)
    expect(bench(s).phase).toBe(Phase.ASSEMBLY)
    const after = buyUpgrade(s, 'soldering')
    expect(after.upgrades.solderingLevel).toBe(s.upgrades.solderingLevel + 1)
    // Недобудований дрон не постраждав
    expect(bench(after).phase).toBe(Phase.ASSEMBLY)
    expect(bench(after).activeKit).toEqual(bench(s).activeKit)
  })
})

describe('Ліміт персоналу — на роль, не на цех', () => {
  const at = (locationId) => ({ ...createState(), locationId, money: 99999 })

  it('гараж: по одному на роль, менеджер — ні', () => {
    const s = withGarage({ money: 99999 })
    expect(roleCapHere(s, 'courier')).toBe(1)
    expect(roleCapHere(s, 'tech')).toBe(1)
    expect(roleCapHere(s, 'seller')).toBe(1)
    expect(roleCapHere(s, 'manager')).toBe(0)
  })

  it('другий кур\'єр у гаражі відхиляється, а технік — ні', () => {
    let s = hireWorker(withGarage({ money: 99999 }), 'courier')
    expect(() => hireWorker(s, 'courier')).toThrow('не поміститься')
    s = hireWorker(s, 'tech')
    expect(workersInRole(s, 'tech')).toHaveLength(1)
  })

  it('менеджер наймається лише в майстерні', () => {
    expect(() => hireWorker(withGarage({ money: 99999 }), 'manager')).toThrow('не поміститься')
    expect(workersInRole(hireWorker(at('factory'), 'manager'), 'manager')).toHaveLength(1)
  })

  it('повний штат ролі не блокує інші ролі (те, чого не вмів загальний ліміт)', () => {
    let s = { ...at('factory'), unlockedHalls: ['hall-1', 'hall-2'] }
    s = hireWorker(s, 'courier'); s = hireWorker(s, 'courier')
    expect(() => hireWorker(s, 'courier')).toThrow('не поміститься')
    s = hireWorker(s, 'seller')
    expect(workersInRole(s, 'seller')).toHaveLength(1)
  })

  it('maxWorkersHere = сума кепів ролей (єдине джерело правди)', () => {
    for (const id of LOCATION_ORDER) {
      const s = at(id)
      const sum = ROLE_ORDER.reduce((acc, role) => acc + roleCapHere(s, role), 0)
      expect(maxWorkersHere(s), id).toBe(sum)
    }
  })

  it('на фабриці кеп росте з кожним відкритим цехом', () => {
    const one = { ...at('factory'), unlockedHalls: ['hall-1'] }
    const two = { ...at('factory'), unlockedHalls: ['hall-1', 'hall-2'] }
    expect(roleCapHere(one, 'courier')).toBe(1)
    expect(roleCapHere(two, 'courier')).toBe(2)
    expect(maxWorkersHere(two)).toBeGreaterThan(maxWorkersHere(one))
    // Другий менеджер не потрібен: один тримає замовлення всієї фабрики.
    expect(roleCapHere(two, 'manager')).toBe(1)
  })
})

// ── F1 — фабрика як остання локація ──────────────────────

describe('F1 — фабрика', () => {
  const toFactory = () => moveToLocation(withGarage({
    money: 9999,
    upgrades: { ...createState().upgrades, solderingLevel: 3, consumablesLevel: 2 },
  }), 'factory')

  it('фабрика — термінальна: після неї локацій немає', () => {
    expect(LOCATION_ORDER[LOCATION_ORDER.length - 1]).toBe('factory')
    expect(isTerminal(toFactory())).toBe(true)
    expect(isTerminal(createState())).toBe(false)
  })

  it('фабрика лишається без обох рятівних механік', () => {
    const f = toFactory()
    expect(ruleAt(f, 'hasTrash')).toBe(false)
    expect(ruleAt(f, 'hasPiggy')).toBe(false)
    // Локація, яка мовчить про правило, поводиться як завжди.
    expect(ruleAt(createState(), 'hasTrash')).toBe(true)
  })

  it('на фабриці смітника немає — і рятує там безкоштовний комплект', () => {
    expect(ruleAt(toFactory(), 'hasTrash')).toBe(false)
  })

  it('особисті треки заморожуються на рівні, з яким приїхав', () => {
    const f = toFactory()
    expect(f.frozenCaps).toEqual({ soldering: 3, consumables: 2, benches: 0 })
    expect(capFor(f, 'soldering')).toBe(3)
    expect(() => buyUpgrade({ ...f, money: 99999 }, 'soldering'))
      .toThrow('максимальному рівні')
  })

  it('заморожування знімає знімок, а не читає рівень наживо', () => {
    // Приїхав з нижчим рівнем — стеля нижча, і покупка вже неможлива.
    const low = moveToLocation(withGarage({
      money: 9999,
      upgrades: { ...createState().upgrades, solderingLevel: 3, consumablesLevel: 2 },
    }), 'factory')
    const dropped = { ...low, upgrades: { ...low.upgrades, solderingLevel: 1 } }
    // Стеля лишилась 3 — знімок не переписується заднім числом.
    expect(capFor(dropped, 'soldering')).toBe(3)
  })

  it('верстаки теж заморожені — на фабриці їх дає цех, а не покупка', () => {
    const f = toFactory()
    expect(capFor(f, 'benches')).toBe(0)
    // Склад і логістика лишаються звичайними покупками.
    expect(capFor(f, 'storage')).toBe(2)
    expect(capFor(f, 'logistics')).toBe(2)
  })

  it('менеджер зʼявляється саме на фабриці — раніше його ніде не найняти', () => {
    for (const id of LOCATION_ORDER) {
      const s = { ...createState(), locationId: id }
      expect(roleCapHere(s, 'manager'), id).toBe(id === 'factory' ? 1 : 0)
    }
  })
})

describe('F1.5 — аварійна партія за $0', () => {
  const stuckAt = (locationId, money = 0) => ({
    ...createState(), locationId, money,
  })

  it('на фабриці зʼявляється, коли грошей на кіт немає й нічого в дорозі', () => {
    expect(rescueKitAvailable(stuckAt('factory'))).toBe(true)
  })

  it('не зʼявляється там, де є смітник або скарбничка', () => {
    expect(rescueKitAvailable(stuckAt('apartment'))).toBe(false)
    expect(rescueKitAvailable({ ...stuckAt('apartment'), unlockedRooms: ['flat', 'garage'] })).toBe(false)
  })

  it('не зʼявляється, поки є гроші на найдешевший кіт', () => {
    expect(rescueKitAvailable(stuckAt('factory', 100000))).toBe(false)
  })

  it('не зʼявляється, поки щось уже їде', () => {
    const s = orderKit({ ...stuckAt('factory', 100000) }, 'mini_drone')
    expect(rescueKitAvailable({ ...s, money: 0 })).toBe(false)
  })

  it('менеджер бере справжній кіт, коли може, і аварійний, коли ні', () => {
    expect(managerOrderChoice(stuckAt('factory', 100000), 0).id).not.toBe('scrap_drone')
    expect(managerOrderChoice(stuckAt('factory', 0), 0).id).toBe('scrap_drone')
  })
})

// ── F7 — дохід на очах і баланс ──────────────────────────

describe('F7 — $/сек рахується з реальних продажів', () => {
  const T = 10_000_000

  it('порожній журнал — нуль, без ділення на нуль і NaN', () => {
    expect(incomePerSec([], T)).toBe(0)
  })

  it('рахує лише останню хвилину', () => {
    const log = [
      { price: 100, at: T - 30_000 },   // у вікні
      { price: 100, at: T - 90_000 },   // випало
    ]
    expect(incomePerSec(log, T)).toBeCloseTo(100 / 60, 5)
  })

  it('старі записи без часу не рахуються як щойно продані', () => {
    expect(incomePerSec([{ price: 500 }], T)).toBe(0)
  })

  it('розбивається по цехах, і сума частин дорівнює цілому', () => {
    const log = [
      { price: 60, at: T - 1000, hallId: 'hall-1' },
      { price: 30, at: T - 2000, hallId: 'hall-2' },
    ]
    expect(incomePerSec(log, T, 'hall-1')).toBeCloseTo(1, 5)
    expect(incomePerSec(log, T, 'hall-2')).toBeCloseTo(0.5, 5)
    expect(incomePerSec(log, T, 'hall-1') + incomePerSec(log, T, 'hall-2'))
      .toBeCloseTo(incomePerSec(log, T), 5)
  })
})

describe('F7 — інваріанти балансу фабрики', () => {
  it('кожен наступний цех дорожчий', () => {
    for (let i = 1; i < FACTORY_HALLS.length; i++) {
      expect(FACTORY_HALLS[i].cost).toBeGreaterThan(FACTORY_HALLS[i - 1].cost)
    }
  })

  it('цех коштує більше, ніж укомплектувати його людьми', () => {
    // Інакше «відкрий ще зал» завжди вигідніше за «найми когось у цей», і
    // фабрика перетворюється на порожні кімнати.
    for (const hall of FACTORY_HALLS.slice(1)) {
      const staff = ROLE_ORDER.reduce(
        (sum, role) => sum + (hall.workerCaps[role] ?? 0) * nextHireCost(createState(), role), 0)
      expect(hall.cost, hall.id).toBeGreaterThan(staff)
    }
  })

  it('стартова каса фабрики не купує другий цех одразу', () => {
    expect(LOCATIONS.factory.startMoney).toBeLessThan(FACTORY_HALLS[1].cost)
  })

  it('навіть найгірша автоматика лишає маржу на кожному кіті', () => {
    // Технік 0 рівня, якість 0.55: якби маржа була відʼємною, цех, який працює
    // сам, повільно розорював би гравця — і це виглядало б як баг економіки.
    const q = roleLevelData('tech', 0).quality
    for (const kit of Object.values(KIT_TYPES)) {
      if (!kit.cost) continue
      expect(calcPrice(kit.basePrice, q, 1), kit.id).toBeGreaterThan(kit.cost)
    }
  })

  it('підвищити людину дешевше, ніж найняти ще одну тієї ж ролі', () => {
    // Прокачка має бути першим інстинктом, а не запасним планом.
    for (const role of ROLE_ORDER) {
      const promote = promoteCost(role, 0)
      if (promote === null) continue
      expect(promote, role).toBeLessThan(nextHireCost(createState(), role))
    }
  })
})
