import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { AI_SHEETS } from './config.js'

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
