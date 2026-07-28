import { describe, it, expect } from 'vitest'
import { UPGRADE_TRACKS, levelData } from './upgrades.js'

// Стадія 9 / Р3. Трек паяльника один раз уже поїхав назад: у L3 забрали
// `qualityMin`, і найдорожчий паяльник у грі повертав гравцеві міні-гру. Це
// тест на саму форму треку, а не на конкретні числа — балансувати можна, їхати
// назад не можна.
describe('трек паяльника не має регресів', () => {
  const levels = UPGRADE_TRACKS.soldering.levels

  it('автоматика, з’явившись, більше не зникає', () => {
    const auto = levels.map(l => l.qualityMin !== undefined)
    const first = auto.indexOf(true)
    expect(first).toBeGreaterThan(0)              // перші рівні — руками, і це задум
    expect(auto.slice(first).every(Boolean)).toBe(true)
  })

  it('кожен наступний рівень не гірший за попередній по кожній осі', () => {
    for (let i = 1; i < levels.length; i++) {
      const prev = levels[i - 1], cur = levels[i]
      expect(cur.greenHalf).toBeGreaterThanOrEqual(prev.greenHalf)
      expect(cur.overheatChance).toBeLessThanOrEqual(prev.overheatChance)

      if (prev.qualityMin === undefined) continue  // порівнювати нічого
      expect(cur.qualityMin).toBeGreaterThanOrEqual(prev.qualityMin)
      expect(cur.qualityMax).toBeGreaterThanOrEqual(prev.qualityMax)
      expect(cur.pointDelayMs).toBeLessThanOrEqual(prev.pointDelayMs)
      expect(cur.missChance ?? 0).toBeLessThanOrEqual(prev.missChance ?? 0)
    }
  })

  it('верхній рівень паяє сам', () => {
    const top = levelData('soldering', UPGRADE_TRACKS.soldering.costs.length)
    expect(top.qualityMin).toBeDefined()
    expect(top.overheatChance).toBe(0)
  })
})
