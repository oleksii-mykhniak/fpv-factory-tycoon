// Стадія 10 / C — рівні працівників без стелі.
//
// Підвищення в грі було й до цього, але рівнів було три: два підвищення на
// людину за все життя. Стеля знята, і разом із нею зникла єдина річ, яка
// стримувала числа. Тепер їх стримують АСИМПТОТИ — і саме вони тут і
// перевіряються, бо протікають вони тихо: кур'єр зі швидкістю 5000 не кидає
// виняток, він просто телепортується.

import { describe, it, expect } from 'vitest'
import { ROLE_ORDER, roleLevelData, roleMaxLevel, promoteCost } from './roles.js'
import { ROLE_CURVES, WORKER_UPGRADE_BASE } from '../state/config.js'

const FAR = 10_000   // «нескінченність» для перевірки границі

// Порівняння ВІДНОСНЕ, а не абсолютне. `toBeCloseTo(x, 1)` вимагає різниці
// менш ніж 0.05 — для якості 0.95 це доречно, а для pointMs 1500 означає
// точність 0.003%, якої від кривої ніхто не чекав і яка нічого не захищає.
const near = (actual, want, tol = 0.01) =>
  Math.abs(actual - want) / Math.max(1e-9, Math.abs(want)) < tol

describe('стелі рівнів немає', () => {
  it('roleMaxLevel — Infinity для кожної ролі', () => {
    for (const id of ROLE_ORDER) expect(roleMaxLevel(id)).toBe(Infinity)
  })

  it('ціна визначена й росте на будь-якому рівні', () => {
    for (const id of ROLE_ORDER) {
      expect(promoteCost(id, 0)).toBe(WORKER_UPGRADE_BASE[id])
      for (const l of [1, 5, 25, 100]) {
        expect(Number.isFinite(promoteCost(id, l))).toBe(true)
        expect(promoteCost(id, l)).toBeGreaterThan(promoteCost(id, l - 1))
      }
    }
  })

  it('дані рівня є на будь-якому рівні', () => {
    for (const id of ROLE_ORDER) {
      for (const l of [0, 1, 40, FAR]) {
        const d = roleLevelData(id, l)
        expect(d).toBeDefined()
        for (const v of Object.values(d)) expect(Number.isFinite(v)).toBe(true)
      }
    }
  })
})

describe('асимптоти тримають', () => {
  it('кожна характеристика йде монотонно й НЕ переходить свою межу', () => {
    for (const [roleId, curves] of Object.entries(ROLE_CURVES)) {
      for (const [key, { from, to }] of Object.entries(curves)) {
        const rising = to > from
        let prev = roleLevelData(roleId, 0)[key]
        expect(near(prev, from, 1e-9), `${roleId}.${key} @0`).toBe(true)

        for (let l = 1; l <= 200; l++) {
          const cur = roleLevelData(roleId, l)[key]
          if (rising) {
            expect(cur, `${roleId}.${key} @${l}`).toBeGreaterThanOrEqual(prev)
            expect(cur, `${roleId}.${key} @${l}`).toBeLessThan(to)
          } else {
            expect(cur, `${roleId}.${key} @${l}`).toBeLessThanOrEqual(prev)
            expect(cur, `${roleId}.${key} @${l}`).toBeGreaterThan(to)
          }
          prev = cur
        }
        // На дуже великому рівні — впритул до межі, але ніколи за неї.
        expect(near(roleLevelData(roleId, FAR)[key], to), `${roleId}.${key} @FAR`).toBe(true)
      }
    }
  })

  it('технік ніколи не паяє миттєво і ніколи не буває бездоганним', () => {
    // Дві межі, кожна з яких зруйнувала б окрему систему: pointMs → 0 знищує
    // сенс верстака, якість → 1 знімає з гри поняття браку.
    const top = roleLevelData('tech', FAR)
    expect(top.pointMs).toBeGreaterThan(0)
    expect(top.quality).toBeLessThan(1)
    expect(top.missChance).toBeGreaterThan(0)
  })

  it('швидкість не виростає до телепорту', () => {
    for (const id of ROLE_ORDER) {
      const speed = roleLevelData(id, FAR).speed
      expect(speed).toBeLessThan(ROLE_CURVES[id].speed.from * 3)
    }
  })
})

describe('криві проходять через уже збалансовані точки', () => {
  // Числа рівнів 0–2 були підібрані руками ще у F5 і встигли пройти тест на
  // залізі. Крива, яка через них не проходить, описує іншу гру — тож це не
  // прискіпливість до знаків після коми, а перевірка, що C нічого не
  // переграла заднім числом.
  const WAS = {
    courier: { 0: { speed: 170 }, 2: { speed: 240 } },
    seller:  { 0: { speed: 170 }, 2: { speed: 240 } },
    manager: { 0: { speed: 170 }, 2: { speed: 240 } },
    tech: {
      0: { speed: 170, pointMs: 2600, quality: 0.55, missChance: 0.15 },
      2: { pointMs: 1500, quality: 0.75 },
    },
  }

  it('рівні 0 і 2 збігаються з дострадійними', () => {
    for (const [roleId, byLevel] of Object.entries(WAS)) {
      for (const [level, stats] of Object.entries(byLevel)) {
        const data = roleLevelData(roleId, Number(level))
        for (const [key, want] of Object.entries(stats)) {
          // 1% — це «крива проходить через ту саму точку», а не «числа
          // однакові до знака»: pointMs @2 дає 1503 замість 1500, і вимагати
          // тут рівності означало б підганяти k під тест.
          expect(near(data[key], want, 0.01), `${roleId}.${key} @${level} = ${data[key]}`).toBe(true)
        }
      }
    }
  })

  it('менеджер отримує класи комплектів східцями, а не дробом', () => {
    // Клас — це «бере й дорогі», а не «трохи краще». Дробового класу не існує.
    for (const l of [0, 1, 2, 9, FAR]) {
      const tier = roleLevelData('manager', l).tier
      expect(Number.isInteger(tier)).toBe(true)
    }
    expect(roleLevelData('manager', 0).tier).toBe(0)
    expect(roleLevelData('manager', 1).tier).toBe(1)
    expect(roleLevelData('manager', 2).tier).toBeGreaterThan(1)
  })
})
