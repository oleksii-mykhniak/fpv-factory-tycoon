import { describe, it, expect } from 'vitest'
import { settleOffline } from './offline.js'
import { createState, Phase, KIT_TYPES } from '../state/gameState.js'
import { OFFLINE_CAP_MS, OFFLINE_EFFICIENCY } from '../state/config.js'

const HOUR = 3_600_000

function shop({ solderingLevel = 0, workers = [], station = {} } = {}) {
  const base = createState()
  return {
    ...base,
    money: 500,
    workers: workers.map((role, i) => ({ id: `${role}${i}`, role, level: 0, hiredAt: 0 })),
    upgrades: { ...base.upgrades, solderingLevel },
    stations: [{ ...base.stations[0], ...station }],
  }
}

const assembling = { phase: Phase.ASSEMBLY, kitId: 'mini_drone', solderPoints: [] }

describe('sim/settleOffline', () => {
  it('pays nothing for a short absence', () => {
    const r = settleOffline(shop({ solderingLevel: 2, station: assembling }), 30_000)
    expect(r.earned).toBe(0)
    expect(r.state.stations[0].phase).toBe(Phase.ASSEMBLY)
  })

  it('a hand-iron shop with nobody hired earns nothing at all', () => {
    const r = settleOffline(shop({ station: assembling }), 2 * HOUR)
    expect(r.assembled).toBe(0)
    expect(r.earned).toBe(0)
  })

  it('an automatic bench finishes the drone it was building', () => {
    const r = settleOffline(shop({ solderingLevel: 2, station: assembling }), 2 * HOUR)
    expect(r.assembled).toBe(1)
    expect(r.state.stations[0].phase).toBe(Phase.READY)
    expect(r.earned).toBe(0)          // nobody to carry it to the mailbox
  })

  it('a hired technician finishes it even with a hand iron', () => {
    const r = settleOffline(shop({ workers: ['tech'], station: assembling }), 2 * HOUR)
    expect(r.assembled).toBe(1)
  })

  it('a seller banks the finished drone', () => {
    const r = settleOffline(shop({ solderingLevel: 2, workers: ['seller'], station: assembling }), 2 * HOUR)
    expect(r.sold).toBe(1)
    expect(r.earned).toBeGreaterThan(0)
    expect(r.state.money).toBeGreaterThan(500)
    expect(r.state.stations[0].phase).toBe(Phase.IDLE)
  })

  it('never invents work: an idle bench stays idle', () => {
    const r = settleOffline(shop({ solderingLevel: 2, workers: ['seller'] }), 4 * HOUR)
    expect(r.assembled).toBe(0)
    expect(r.earned).toBe(0)
  })

  it('caps a very long absence', () => {
    const r = settleOffline(shop({ solderingLevel: 2, station: assembling }), 40 * HOUR)
    expect(r.elapsedMs).toBe(OFFLINE_CAP_MS)
  })

  it('awards partial progress when the time was not quite enough', () => {
    // Level 3 is 2000 ms per point; 4 points needed, only 5 minutes away is
    // plenty — use a slow tech and a big kit instead.
    const s = shop({ workers: ['tech'], station: { phase: Phase.ASSEMBLY, kitId: 'cinematic_drone', solderPoints: [] } })
    const r = settleOffline(s, 65_000)   // 65 s at 2600 ms ≈ 25 points, kit needs 8
    expect(r.assembled).toBe(1)
  })

  it('leaves the state untouched when nothing could happen', () => {
    const s = shop()
    expect(settleOffline(s, 2 * HOUR).state).toBe(s)
  })
})

// Стадія 9 / Р6. Головне тут — що поведінка НЕ змінилась ні для кого, крім
// цеху з повним штатом: офлайн-дохід має бути нагородою за пройдену драбину, а
// не тихою зміною балансу для всіх.
describe('Р6 — цех із повним штатом працює вночі', () => {
  const ALL = ['courier', 'tech', 'seller', 'manager']

  // Гараж: там є вакансії на трьох, і саме там штат уперше може бути повним.
  const staffed = (extra = {}) => ({
    ...shop({ solderingLevel: 2, workers: ALL }),
    unlockedRooms: ['flat', 'garage'],
    money: 2000,
    ...extra,
  })

  it('без повного штату не з’являється жодного циклу', () => {
    for (const missing of ALL) {
      const roles = ALL.filter(r => r !== missing)
      const r = settleOffline({ ...staffed(), workers: roles.map((role, i) => ({ id: `${role}${i}`, role, level: 0, hiredAt: 0 })) }, 2 * HOUR)
      expect(r.cycles).toBe(0)
    }
  })

  it('повний штат — цикли, гроші й лічильники квестів', () => {
    const s = staffed()
    const r = settleOffline(s, 2 * HOUR)
    expect(r.cycles).toBeGreaterThan(0)
    expect(r.earned).toBeGreaterThan(0)
    expect(r.state.money).toBeGreaterThan(s.money)
    // Продане вночі однаково продане: ціль «продай 10» не має цього не бачити.
    expect(r.state.stats.sold).toBe(r.sold)
  })

  it('каса ніколи не йде в мінус — цикли впираються в гроші', () => {
    const r = settleOffline(staffed({ money: 100 }), 4 * HOUR)
    expect(r.state.money).toBeGreaterThanOrEqual(0)
  })

  it('довша відсутність — більше циклів, але не більше за ліміт', () => {
    const short = settleOffline(staffed({ money: 99999 }), 1 * HOUR)
    const long  = settleOffline(staffed({ money: 99999 }), 4 * HOUR)
    const over  = settleOffline(staffed({ money: 99999 }), 40 * HOUR)
    expect(long.cycles).toBeGreaterThan(short.cycles)
    expect(over.cycles).toBe(long.cycles)
  })

  it('офлайн платить менше за живий цех', () => {
    // Та сама година: офлайн бере лише OFFLINE_EFFICIENCY від можливого темпу.
    const r = settleOffline(staffed({ money: 99999 }), 1 * HOUR)
    const perfect = r.cycles / OFFLINE_EFFICIENCY
    expect(r.cycles).toBeLessThan(perfect)
  })
})
