import { describe, it, expect } from 'vitest'
import { floatPose } from './floatGain.js'
import { FLOAT_GAIN_MS, FLOAT_GAIN_RISE } from '../state/config.js'

// Фікс «збірка ≠ dev» (2026-09-11). Ці перевірки існують, бо анімацію «+$47» над скринькою раніше
// можна було перевірити тільки очима — і саме тому її зникнення зі збірки
// пройшло непоміченим через п'ять стадій.
describe('«+$47» над скринькою — поза за віком напису', () => {
  it('щойно з\'явився: на місці, повний тон', () => {
    const p = floatPose(0)
    expect(p.done).toBe(false)
    expect(p.rise).toBe(0)
    expect(p.opacity).toBe(1)
  })

  it('піднімається монотонно і сповільнюється під кінець', () => {
    const at = age => floatPose(age).rise
    const first  = at(FLOAT_GAIN_MS * 0.25) - at(0)
    const second = at(FLOAT_GAIN_MS * 0.5)  - at(FLOAT_GAIN_MS * 0.25)
    const third  = at(FLOAT_GAIN_MS * 0.75) - at(FLOAT_GAIN_MS * 0.5)
    expect(first).toBeGreaterThan(second)
    expect(second).toBeGreaterThan(third)
    expect(third).toBeGreaterThan(0)
    expect(at(FLOAT_GAIN_MS * 0.999)).toBeLessThanOrEqual(FLOAT_GAIN_RISE)
  })

  it('тон повний до двох третин життя і гасне в останній', () => {
    expect(floatPose(FLOAT_GAIN_MS * 0.6).opacity).toBe(1)
    expect(floatPose(FLOAT_GAIN_MS * 0.8).opacity).toBeLessThan(1)
    expect(floatPose(FLOAT_GAIN_MS * 0.8).opacity).toBeGreaterThan(0)
    expect(floatPose(FLOAT_GAIN_MS * 0.99).opacity).toBeLessThan(0.1)
  })

  it('доживши до кінця — гасне назавжди, а не зависає', () => {
    expect(floatPose(FLOAT_GAIN_MS).done).toBe(true)
    expect(floatPose(FLOAT_GAIN_MS * 10).done).toBe(true)
    expect(floatPose(FLOAT_GAIN_MS).opacity).toBe(0)
  })

  // NaN тут — не теорія: рівно так виглядав баг Стадії 10, коли лічильник
  // кадрів отримував undefined (див. `frame.js`). `NaN >= FLOAT_GAIN_MS` —
  // false, тобто напис жив вічно. Тепер зіпсований вік завершує напис.
  it('зіпсований вік не робить напис вічним', () => {
    expect(floatPose(NaN).done).toBe(true)
    expect(floatPose(undefined).done).toBe(true)
    expect(floatPose(-1).done).toBe(true)
  })
})
