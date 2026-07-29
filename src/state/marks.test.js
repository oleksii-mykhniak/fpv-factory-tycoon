// Стадія 10 / B — Mk комплектів.
//
// Головне тут — не числа, а ДВА інваріанти, кожен з яких ламається тихо:
//
//   1. Відкриття типу односторонне. Тип, який може зачинитись назад, відкотив
//      би ланцюг квестів на пройдений крок (Стадія 9 / П2).
//   2. Порядок кроків у ланцюгу: «купи Mk» стоїть перед «продай цей тип».
//      Інакше крок продажу став би `moot`, ланцюг проскочив би його, а потім
//      поїхав назад — те саме порушення, знайдене іншим шляхом.

import { describe, it, expect } from 'vitest'
import {
  createState, KIT_TYPES, kitCost, kitBasePrice, kitDeliveryMs,
  kitMark, kitMarkMax, kitSolderPointCount, kitSteps,
  upgradeMark, canUpgradeMark, nextMarkCost, markUnlocked, markUnlockOf,
  markBuildProgress, assembledOfKit,
} from './gameState.js'
import { kitsForLocation, mkCapFor } from './locations.js'
import { MK_MAX, MK_UNLOCKS, MK_CAP_FLAT, MK_CAP_GARAGE, MK_BUILD_REQ } from './config.js'
import { QUEST_CHAIN } from '../sim/quests.js'

// Норму збірок (Стадія 11 / A2) тут вимикаємо навмисно: ці тести про
// арифметику Mk, а не про те, чим він заробляється. Для самої норми — окремий
// блок нижче.
const BUILT = Object.fromEntries(Object.keys(KIT_TYPES).map(id => [id, 999]))

const rich = (extra = {}) => ({
  ...createState(), money: 1e9,
  stats: { ...createState().stats, assembledByKit: BUILT },
  ...extra,
})
const withMk = (marks, extra = {}) => rich({ kitMarks: marks, ...extra })

describe('похідні від Mk', () => {
  it('усе виводиться з рівня — у стані лежить тільки він', () => {
    const s = withMk({ mini_drone: 2 })
    expect(Object.keys(s.kitMarks)).toEqual(['mini_drone'])
    expect(kitCost(s, 'mini_drone')).toBeGreaterThan(kitCost(rich(), 'mini_drone'))
    expect(kitBasePrice(s, 'mini_drone')).toBeGreaterThan(kitBasePrice(rich(), 'mini_drone'))
    expect(kitDeliveryMs(s, 'mini_drone')).toBeGreaterThan(kitDeliveryMs(rich(), 'mini_drone'))
  })

  it('ціна росте швидше за собівартість — маржа з Mk зростає', () => {
    const base = rich(), up = withMk({ mini_drone: 3 })
    const marginBase = kitBasePrice(base, 'mini_drone') / kitCost(base, 'mini_drone')
    const marginUp   = kitBasePrice(up,   'mini_drone') / kitCost(up,   'mini_drone')
    expect(marginUp).toBeGreaterThan(marginBase)
  })

  it('+1 крок збірки дає ТІЛЬКИ останній Mk', () => {
    const kit = KIT_TYPES.mini_drone
    for (let mk = 0; mk < MK_MAX; mk++) {
      expect(kitSolderPointCount(withMk({ mini_drone: mk }), 'mini_drone'))
        .toBe(kit.assemblySteps.length)
    }
    expect(kitSolderPointCount(withMk({ mini_drone: MK_MAX }), 'mini_drone'))
      .toBe(kit.assemblySteps.length + 1)
  })

  it('доданий крок має і підпис, і текст промаху', () => {
    const steps = kitSteps(withMk({ mini_drone: MK_MAX }), 'mini_drone')
    const last  = steps[steps.length - 1]
    expect(last.label.length).toBeGreaterThan(0)
    expect(last.missMsg.length).toBeGreaterThan(0)
  })
})

describe('стеля Mk по простору (B2)', () => {
  it('квартира нижча за гараж', () => {
    expect(mkCapFor(createState())).toBe(MK_CAP_FLAT)
    expect(mkCapFor({ ...createState(), unlockedRooms: ['flat', 'garage'] })).toBe(MK_CAP_GARAGE)
  })

  it('у стелю не можна купити', () => {
    const s = withMk({ mini_drone: MK_CAP_FLAT })
    expect(nextMarkCost(s, 'mini_drone')).toBeNull()
    expect(canUpgradeMark(s, 'mini_drone').can).toBe(false)
    expect(() => upgradeMark(s, 'mini_drone')).toThrow()
  })

  it('стеля росте з цехами і ніде не перевищує MK_MAX', () => {
    const hall = (halls) => ({ ...createState(), locationId: 'factory', unlockedHalls: halls })
    const one = mkCapFor(hall(['hall-1']))
    const all = mkCapFor(hall(['hall-1', 'hall-2', 'hall-3']))
    expect(all).toBeGreaterThan(one)
    expect(kitMarkMax(hall(['hall-1', 'hall-2', 'hall-3']))).toBeLessThanOrEqual(MK_MAX)
  })
})

describe('відкриття типів (B3) — двері односторонні', () => {
  it('на старті відкритий лише перший тип у ланцюжку відкриттів', () => {
    const s = createState()
    for (const [from, u] of Object.entries(MK_UNLOCKS)) {
      expect(markUnlocked(s, from) || markUnlockOf(from) !== null).toBe(true)
      expect(markUnlocked(s, u.unlocks)).toBe(false)
      expect(kitsForLocation(s)).not.toContain(u.unlocks)
    }
    expect(kitsForLocation(s)).toContain('mini_drone')
  })

  it('Mk відкриває наступний тип', () => {
    for (const [from, u] of Object.entries(MK_UNLOCKS)) {
      const s = withMk({ [from]: u.mk })
      expect(markUnlocked(s, u.unlocks)).toBe(true)
    }
  })

  it('відкритий тип не зачиняється, коли інший качається далі', () => {
    // Це і є односторонність: `kitMarks` тільки росте, тож умова відкриття
    // ніколи не стає хибною знову.
    let s = withMk({ mini_drone: 2 })
    expect(kitsForLocation(s)).toContain('racing_drone')
    for (let i = 0; i < 3; i++) {
      const cap = kitMarkMax(s)
      if (kitMark(s, 'racing_drone') >= cap) break
      s = upgradeMark(s, 'racing_drone')
      expect(kitsForLocation(s)).toContain('racing_drone')
    }
  })

  it('кожен замок можна пояснити гравцеві', () => {
    // Замок без причини читається як «сюди не можна ніколи».
    for (const u of Object.values(MK_UNLOCKS)) {
      const req = markUnlockOf(u.unlocks)
      expect(req).not.toBeNull()
      expect(KIT_TYPES[req.fromKit]).toBeDefined()
    }
  })
})

describe('Mk заробляється збірками (Стадія 11 / A)', () => {
  const built = (n, kitId = 'mini_drone', extra = {}) => ({
    ...createState(), money: 1e9,
    stats: { ...createState().stats, assembledByKit: { [kitId]: n } },
    ...extra,
  })

  it('повна каса не відкриває Mk, поки дронів зібрано замало', () => {
    const s = built(MK_BUILD_REQ[0] - 1)
    const { can, cost, reasons } = canUpgradeMark(s, 'mini_drone')
    expect(can).toBe(false)
    // Ціна лишається відомою: другий замок не ховає перший.
    expect(cost).toBeGreaterThan(0)
    expect(reasons.join(' ')).toMatch(/Зберіть ще 1/)
    expect(() => upgradeMark(s, 'mini_drone')).toThrow()
  })

  it('норма виконана — Mk купується', () => {
    const s = built(MK_BUILD_REQ[0])
    expect(canUpgradeMark(s, 'mini_drone').can).toBe(true)
    expect(kitMark(upgradeMark(s, 'mini_drone'), 'mini_drone')).toBe(1)
  })

  it('норма своя в кожного типу — чужі збірки не рахуються', () => {
    const s = built(999, 'mini_drone', { kitMarks: { mini_drone: 2 } })
    expect(canUpgradeMark(s, 'racing_drone').can).toBe(false)
    expect(markBuildProgress(s, 'racing_drone').have).toBe(0)
  })

  it('норма росте з кожним Mk', () => {
    const reqs = Array.from({ length: MK_MAX }, (_, mk) =>
      markBuildProgress({ ...built(0), kitMarks: { mini_drone: mk },
        locationId: 'factory', unlockedHalls: ['hall-1', 'hall-2', 'hall-3'] },
      'mini_drone')?.need)
    for (let i = 1; i < reqs.length; i++) expect(reqs[i]).toBeGreaterThan(reqs[i - 1])
  })

  it('у стелі Mk вимоги немає — рости вже нікуди', () => {
    expect(markBuildProgress(withMk({ mini_drone: MK_CAP_FLAT }), 'mini_drone')).toBeNull()
  })

  it('сейв без лічильника сідає з проданих — Mk не відкочується', () => {
    // Гравець зі Стадії 10 має тільки `soldByKit`. Зібрано завжди не менше,
    // ніж продано, тож це коректна нижня оцінка, а не вигадане число.
    const legacy = {
      ...createState(), money: 1e9,
      stats: { sold: 9, assembled: 9, burnt: 0, bestQuality: 0, bestRate: 0,
        soldByKit: { mini_drone: MK_BUILD_REQ[0] } },
    }
    expect(assembledOfKit(legacy, 'mini_drone')).toBe(MK_BUILD_REQ[0])
    expect(canUpgradeMark(legacy, 'mini_drone').can).toBe(true)
  })
})

describe('ланцюг квестів і Mk узгоджені', () => {
  it('крок «купи Mk» стоїть ПЕРЕД кроком «продай цей тип»', () => {
    for (const [from, u] of Object.entries(MK_UNLOCKS)) {
      const mkAt   = QUEST_CHAIN.findIndex(s => s.kitId === from && s.target >= u.mk)
      const sellAt = QUEST_CHAIN.findIndex(s => sellsKit(s, u.unlocks))
      expect(mkAt).toBeGreaterThanOrEqual(0)
      expect(sellAt).toBeGreaterThanOrEqual(0)
      expect(mkAt).toBeLessThan(sellAt)
    }
  })

  it('жоден крок Mk не просить більше, ніж дозволяє його місце', () => {
    // Крок, який просить Mk вище за стелю квартири, стояв би в ланцюгу вічно:
    // купити його там неможливо, а `moot` на стелю не дивиться.
    const flatSteps = QUEST_CHAIN.filter(s => s.actId === 'flat' && s.kitId)
    for (const step of flatSteps) expect(step.target).toBeLessThanOrEqual(MK_CAP_FLAT)
  })
})

// Про який тип цей крок продажу.
//
// Через `moot` це визначити НЕ можна, і дві мої спроби на цьому й розбились:
// відкриття типів ланцюгове, тож будь-який стан, що відкриває кінематографічний,
// відкриває й гоночний — обидва кроки перестають бути безглуздими одночасно.
// А от лічильник у кроку свій: `sellCount(kitId)` рахує `soldByKit[kitId]`,
// і саме він однозначно називає тип.
const MARKER = 7

function sellsKit(step, kitId) {
  if (typeof step.have !== 'function') return false
  const probe = { stats: { sold: 0, soldByKit: { [kitId]: MARKER } } }
  return step.have(probe) === MARKER
}
