// Камера не має залежати від частоти кадрів.
//
// Це не абстрактна охайність — це та сама помилка, яку тут і виправили.
// Рушієва `elasticToActor` крокує пружину РАЗ НА КАДР сталими числами, тож на
// 165 Гц вона отримує в 2.75 раза більше кроків на секунду, ніж на 60, стає
// жорсткішою за власне тертя й починає перелітати ціль щокадру. Персонаж при
// цьому йде за ЧАСОМ, і світ через це дрібно смикається навколо нього.
//
// Тому тест питає рівно одне: чи однаково камера доїде за ту саму СЕКУНДУ,
// якщо порізати її на різну кількість кадрів.

import { describe, it, expect } from 'vitest'
import { followFraction, followAxis } from './camera.js'
import { CAMERA_FOLLOW_RATE } from '../state/config.js'

// Проганяє секунду руху камери, порізану на `fps` кадрів.
function runOneSecond(fps, { from = 0, to = 1000, rate = CAMERA_FOLLOW_RATE } = {}) {
  const dt = 1000 / fps
  let focus = from
  for (let i = 0; i < fps; i++) focus = followAxis(focus, to, dt, rate)
  return focus
}

describe('стеження камери', () => {
  it('за ту саму секунду доїжджає однаково на 30, 60, 144 і 165 кадрах', () => {
    const at60 = runOneSecond(60)
    for (const fps of [30, 90, 120, 144, 165, 240]) {
      // Експонента точна, тож розбіжність тут — лише машинний епсилон.
      expect(runOneSecond(fps), `${fps} Гц`).toBeCloseTo(at60, 6)
    }
  })

  it('один крок на 16.7 мс дорівнює двом по 8.35 мс', () => {
    const one = followAxis(0, 1000, 1000 / 60, CAMERA_FOLLOW_RATE)
    const two = followAxis(followAxis(0, 1000, 1000 / 120, CAMERA_FOLLOW_RATE),
                           1000, 1000 / 120, CAMERA_FOLLOW_RATE)
    expect(two).toBeCloseTo(one, 9)
  })

  it('не перелітає ціль — частка завжди в [0, 1]', () => {
    for (const dt of [0, 1, 16.7, 100, 1000, 60_000]) {
      const f = followFraction(dt, CAMERA_FOLLOW_RATE)
      expect(f, `dt=${dt}`).toBeGreaterThanOrEqual(0)
      // Рівно 1 — законно: на дуже довгому кадрі експонента доходить до нуля,
      // і камера просто СІДАЄ на ціль. Заборонено тут інше — щоб частка стала
      // більшою за 1, бо це і є переліт, від якого все й розхитувалось.
      expect(f, `dt=${dt}`).toBeLessThanOrEqual(1)
    }
    // Кадр нульової чи від'ємної тривалості нікуди камеру не рухає.
    expect(followAxis(0, 1000, 0, CAMERA_FOLLOW_RATE)).toBe(0)
    expect(followAxis(0, 1000, -5, CAMERA_FOLLOW_RATE)).toBe(0)
  })

  it('після довгої паузи (згорнута вкладка) приходить до цілі, а не летить повз', () => {
    // Той самий захист, що й вище, але з боку наслідку: величезний `dt` дає
    // частку майже 1, тобто камера ПРИЛИПАЄ до цілі. Пружина, яка накопичує
    // швидкість, на такому кадрі вистрілила б за межі світу.
    const focus = followAxis(0, 1000, 10_000, CAMERA_FOLLOW_RATE)
    expect(focus).toBeCloseTo(1000, 3)
  })

  it('швидкість задана в 1/секунду: за 1/rate проходить ~63% шляху', () => {
    const focus = followAxis(0, 1000, 1000 / CAMERA_FOLLOW_RATE, CAMERA_FOLLOW_RATE)
    expect(focus).toBeCloseTo(1000 * (1 - Math.E ** -1), 6)
  })
})
