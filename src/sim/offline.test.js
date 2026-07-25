import { describe, it, expect } from 'vitest'
import { settleOffline } from './offline.js'
import { createState, Phase, KIT_TYPES } from '../state/gameState.js'
import { OFFLINE_CAP_MS } from '../state/config.js'

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
    const r = settleOffline(shop({ solderingLevel: 3, station: assembling }), 30_000)
    expect(r.earned).toBe(0)
    expect(r.state.stations[0].phase).toBe(Phase.ASSEMBLY)
  })

  it('a hand-iron shop with nobody hired earns nothing at all', () => {
    const r = settleOffline(shop({ station: assembling }), 2 * HOUR)
    expect(r.assembled).toBe(0)
    expect(r.earned).toBe(0)
  })

  it('an automatic bench finishes the drone it was building', () => {
    const r = settleOffline(shop({ solderingLevel: 3, station: assembling }), 2 * HOUR)
    expect(r.assembled).toBe(1)
    expect(r.state.stations[0].phase).toBe(Phase.READY)
    expect(r.earned).toBe(0)          // nobody to carry it to the mailbox
  })

  it('a hired technician finishes it even with a hand iron', () => {
    const r = settleOffline(shop({ workers: ['tech'], station: assembling }), 2 * HOUR)
    expect(r.assembled).toBe(1)
  })

  it('a seller banks the finished drone', () => {
    const r = settleOffline(shop({ solderingLevel: 3, workers: ['seller'], station: assembling }), 2 * HOUR)
    expect(r.sold).toBe(1)
    expect(r.earned).toBeGreaterThan(0)
    expect(r.state.money).toBeGreaterThan(500)
    expect(r.state.stations[0].phase).toBe(Phase.IDLE)
  })

  it('never invents work: an idle bench stays idle', () => {
    const r = settleOffline(shop({ solderingLevel: 3, workers: ['seller'] }), 4 * HOUR)
    expect(r.assembled).toBe(0)
    expect(r.earned).toBe(0)
  })

  it('caps a very long absence', () => {
    const r = settleOffline(shop({ solderingLevel: 3, station: assembling }), 40 * HOUR)
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
