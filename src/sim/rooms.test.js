// Стадія 14 / К1 — кімната має тип, а фабрика має сітку.
//
// Дві перевірки тут несучі й обидві про те, чого НЕ видно на екрані:
// пакування в ряди (бо саме воно колись зробить світ вужчим за 10 000 юнітів)
// і те, що перший підетап нічого не зламав.

import { describe, it, expect } from 'vitest'
import {
  FACTORY_HALLS, HALL_KINDS, packRows, hallW, hallH, hallsOfKind, buildFactoryLayout,
} from '../defs/layouts/factory.js'

describe('К1 — кімната має тип', () => {
  it('кожна кімната називає свій тип, і тип відомий', () => {
    for (const hall of FACTORY_HALLS) {
      expect(hall.kind, hall.id).toBeTruthy()
      expect(HALL_KINDS[hall.kind], `${hall.id}: невідомий тип ${hall.kind}`).toBeTruthy()
    }
  })

  it('габарити приходять з типу, поки запис їх не перекрив', () => {
    for (const hall of FACTORY_HALLS) {
      expect(hallW(hall)).toBe(hall.w ?? HALL_KINDS[hall.kind].w)
      expect(hallH(hall)).toBe(hall.h ?? HALL_KINDS[hall.kind].h)
    }
  })

  it('три наявні цехи — це три цехи складання в одному ряду', () => {
    expect(hallsOfKind(['hall-1', 'hall-2', 'hall-3'], 'assembly')).toHaveLength(3)
    const rows = packRows(FACTORY_HALLS)
    expect(rows).toHaveLength(1)
    expect(rows[0].w).toBe(5100)
  })
})

describe('К1.2 — кімнати стоять сіткою, не рядком', () => {
  // Пакувалка — чиста функція, тож питати її можна й про кімнати, яких у грі
  // ще немає. Це навмисно: ряд має закритись ПЕРШ НІЖ з'явиться кімната, через
  // яку світ став би довшим за екран.
  const wide = { id: 'w', kind: 'assembly' }
  const lab  = { id: 'l', kind: 'lab' }

  it('четверта кімната йде в другий ряд, а не подовжує перший', () => {
    const rows = packRows([...FACTORY_HALLS, lab])
    expect(rows).toHaveLength(2)
    expect(rows[0].halls.map(h => h.id)).toEqual(['hall-1', 'hall-2', 'hall-3'])
    expect(rows[1].halls.map(h => h.id)).toEqual(['l'])
  })

  it('висота ряду — за найвищою кімнатою в ньому', () => {
    const rows = packRows([lab, wide])
    expect(rows).toHaveLength(1)
    expect(rows[0].h).toBe(HALL_KINDS.assembly.h)
  })

  it('порядок кімнат у рядах — це порядок відкриття, без перестрибувань', () => {
    const rows = packRows([...FACTORY_HALLS, lab, { id: 'f', kind: 'flight' }])
    expect(rows.flatMap(r => r.halls.map(h => h.id)))
      .toEqual(['hall-1', 'hall-2', 'hall-3', 'l', 'f'])
  })
})

describe('К1.3 — перший крок нічого не ламає', () => {
  it('фабрика лишається одним рядом на 5100 юнітів', () => {
    const layout = buildFactoryLayout(['hall-1', 'hall-2', 'hall-3'])
    expect(layout.world.w).toBe(5100)
    expect(layout.room.h).toBe(HALL_KINDS.assembly.h)
    expect(layout.halls.every(h => h.rowIndex === 0)).toBe(true)
    expect(layout.halls.every(h => h.kind === 'assembly')).toBe(true)
  })
})
