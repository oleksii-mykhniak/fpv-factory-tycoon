import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { AI_SHEETS, CAT_SHEETS } from './config.js'

// `frames` у конфізі — єдине число, яке мусить збігатися з файлом: ширину кадру
// риг виводить діленням ширини аркуша на нього (`character.js`). Розійдуться —
// і персонаж поїде навпіл, причому мовчки: жодного винятку, просто зсунутий на
// півлюдини спрайт. Тому перевіряємо саме ділення, а не наявність файлу.
const ihdr = (path) => {
  const b = readFileSync(path)          // PNG: 8 байтів підпису, далі IHDR
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}

describe('AI_SHEETS збігається з аркушами на диску', () => {
  for (const [dir, entry] of Object.entries(AI_SHEETS)) {
    it(`${dir} (${entry.key}): ширина ділиться на ${entry.frames} кадрів`, () => {
      const { width, height } = ihdr(`public/sprites/${entry.key}.png`)
      expect(width % entry.frames).toBe(0)
      // Усі аркуші гравця внесені з --height=96; різна висота означала б, що
      // персонаж міняє зріст, перемикаючи напрямок.
      expect(height).toBe(96)
    })
  }
})

// Те саме для кота, і з тієї самої причини — ділення. Різниця одна: у кота
// висота спільна (48), а ШИРИНА кадру в кожній позі своя, бо аркуші обрізані
// по вмісту. Саме тому тут не можна перевірити ширину кадру числом: сплячий кіт
// ширший за сидячого не помилково, а по суті.
describe('CAT_SHEETS збігається з аркушами на диску', () => {
  for (const [pose, entry] of Object.entries(CAT_SHEETS)) {
    it(`${pose} (${entry.key}): ширина ділиться на ${entry.frames} кадрів`, () => {
      const { width, height } = ihdr(`public/sprites/${entry.key}.png`)
      expect(width % entry.frames).toBe(0)
      expect(height).toBe(48)
    })

    it(`${pose}: зріст у цій позі — додатне число`, () => {
      // Нуль або відʼємне дало б масштаб 0 і кота, якого просто немає на екрані.
      expect(entry.h).toBeGreaterThan(0)
    })
  }

  it('кожен настрій ходьби має аркуш, і жоден не лишився без пози', () => {
    // `catPose` повертає імена поз; аркуші лежать під тими самими іменами.
    // Розійдуться — і кіт у цьому напрямку зникне, бо `anim[pose.name]`
    // поверне undefined.
    expect(Object.keys(CAT_SHEETS).sort()).toEqual(
      ['down', 'side', 'sit', 'sleep', 'up'])
  })
})
