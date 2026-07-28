// Стадія 10 / A — нескінченні числові треки.
//
// Перевіряється те, що ламається тихо: підлоги множників і стелі по локаціях.
// Трек без стелі — єдина система в грі, яку гравець може качати доти, доки не
// зламає економіку; якщо підлога протікає, це виявиться не на тесті, а на
// сейві людини, яка грала найдовше.

import { describe, it, expect } from 'vitest'
import { createState, kitCost, calcPrice, KIT_TYPES } from './gameState.js'
import {
  UPGRADE_TRACKS, trackMaxLevel, nextCost, levelData,
  salePriceMult, kitCostMult, toolingQualityBonus, deliveryMult,
} from './upgrades.js'
import { capFor } from './locations.js'
import {
  BULK_COST_FLOOR, COURIER_SPEED_FLOOR, ENDLESS_COST_GROWTH,
  ENDLESS_CAP_FLAT, ENDLESS_CAP_GARAGE,
} from './config.js'

const ENDLESS = ['reputation', 'bulk', 'tooling', 'courier']

const at = (levels) => ({
  ...createState(),
  upgrades: { ...createState().upgrades, ...levels },
})

describe('форма нескінченного треку', () => {
  it('стелі немає', () => {
    for (const id of ENDLESS) expect(trackMaxLevel(id)).toBe(Infinity)
  })

  it('ціна визначена на будь-якому рівні, включно з абсурдним', () => {
    for (const id of ENDLESS) {
      for (const level of [0, 1, 50, 500]) {
        const cost = nextCost(id, level)
        expect(Number.isFinite(cost)).toBe(true)
        expect(cost).toBeGreaterThan(0)
      }
    }
  })

  it('ціна росте строго монотонно', () => {
    for (const id of ENDLESS) {
      for (let l = 0; l < 40; l++)
        expect(nextCost(id, l + 1)).toBeGreaterThan(nextCost(id, l))
    }
  })

  it('росте саме за заявленою кривою', () => {
    for (const id of ENDLESS) {
      const ratio = nextCost(id, 21) / nextCost(id, 20)
      expect(ratio).toBeCloseTo(ENDLESS_COST_GROWTH, 1)
    }
  })

  it('назва рівня і ефект є на будь-якому рівні', () => {
    for (const id of ENDLESS) {
      for (const level of [0, 1, 137]) {
        const d = levelData(id, level)
        expect(typeof d.name).toBe('string')
        expect(d.name.length).toBeGreaterThan(0)
        expect(typeof d.effect).toBe('string')
      }
    }
  })

  it('жоден не відкриває механіку — тільки множник (П5)', () => {
    // Автоматика пайки живе на `qualityMin`. Якби числовий трек її колись
    // приніс, у гри з'явилось би друге джерело «що відкрилось», і воно почало б
    // сперечатися з треком паяльника.
    for (const id of ENDLESS) {
      for (const level of [0, 1, 99]) {
        const d = levelData(id, level)
        expect(d.qualityMin).toBeUndefined()
        expect(d.count).toBeUndefined()
        expect(d.extraSlots).toBeUndefined()
      }
    }
  })
})

describe('підлоги множників', () => {
  it('собівартість не падає нижче підлоги навіть на 10000 рівні', () => {
    expect(kitCostMult(at({ bulkLevel: 10_000 }))).toBe(BULK_COST_FLOOR)
    expect(kitCostMult(at({ bulkLevel: 10_000 }))).toBeGreaterThan(0)
  })

  it('комплект ніколи не стає безкоштовним', () => {
    const rich = at({ bulkLevel: 10_000 })
    for (const id of Object.keys(KIT_TYPES)) {
      if (KIT_TYPES[id].cost === 0) continue    // утиль безкоштовний і має лишитись
      expect(kitCost(rich, id)).toBeGreaterThan(0)
    }
  })

  it('безкоштовний комплект лишається безкоштовним', () => {
    expect(kitCost(at({ bulkLevel: 50 }), 'scrap_drone')).toBe(0)
  })

  it('доставка не стає миттєвою', () => {
    const m = deliveryMult(at({ courierLevel: 10_000, logisticsLevel: 0 }))
    expect(m).toBeGreaterThanOrEqual(COURIER_SPEED_FLOOR * 1)
    expect(m).toBeGreaterThan(0)
  })

  it('кур\'єрська мережа множиться на трек логістики, а не замінює його', () => {
    const network = deliveryMult(at({ courierLevel: 10, logisticsLevel: 0 }))
    const both    = deliveryMult(at({ courierLevel: 10, logisticsLevel: 2 }))
    expect(both).toBeLessThan(network)
  })
})

describe('ефекти застосовуються', () => {
  it('репутація піднімає ціну продажу', () => {
    const base = calcPrice(100, 1, salePriceMult(at({})))
    const up   = calcPrice(100, 1, salePriceMult(at({ reputationLevel: 10 })))
    expect(up).toBeGreaterThan(base)
  })

  it('репутація множиться поверх priceMultiplier, а не замість', () => {
    const withBonus = salePriceMult({ upgrades: { priceMultiplier: 2, reputationLevel: 10 } })
    const noBonus   = salePriceMult({ upgrades: { priceMultiplier: 2, reputationLevel: 0 } })
    expect(noBonus).toBe(2)
    expect(withBonus).toBeGreaterThan(2)
  })

  it('опт знижує собівартість', () => {
    expect(kitCost(at({ bulkLevel: 10 }), 'mini_drone'))
      .toBeLessThan(kitCost(at({}), 'mini_drone'))
  })

  it('оснастка дає надбавку до якості, і вона обмежена знизу нулем', () => {
    expect(toolingQualityBonus(at({}))).toBe(0)
    expect(toolingQualityBonus(at({ toolingLevel: 10 }))).toBeGreaterThan(0)
  })
})

describe('стелі по локаціях (A3)', () => {
  it('квартира тримає нижчу стелю, ніж гараж', () => {
    const flat   = createState()
    const garage = { ...createState(), unlockedRooms: ['flat', 'garage'] }
    for (const id of ENDLESS) {
      expect(capFor(flat, id)).toBe(ENDLESS_CAP_FLAT)
      expect(capFor(garage, id)).toBe(ENDLESS_CAP_GARAGE)
    }
  })

  it('квартира НЕ отримує фабричну стелю', () => {
    // openHalls() нормалізує будь-який сейв до щонайменше одного цеху, тож
    // читання цехів удома віддало б квартирі стелю фабрики. Тут це й ловиться.
    for (const id of ENDLESS)
      expect(capFor(createState(), id)).toBeLessThan(80)
  })

  it('стеля на фабриці росте з цехами', () => {
    const one = { ...createState(), locationId: 'factory', unlockedHalls: ['hall-1'] }
    const two = { ...one, unlockedHalls: ['hall-1', 'hall-2'] }
    for (const id of ENDLESS)
      expect(capFor(two, id)).toBeGreaterThan(capFor(one, id))
  })

  it('просторові треки стелі від цехів не отримують', () => {
    const factory = { ...createState(), locationId: 'factory', unlockedHalls: ['hall-1', 'hall-2'] }
    expect(capFor(factory, 'benches')).toBe(2)
    expect(capFor(factory, 'storage')).toBe(2)
  })
})
