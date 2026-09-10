import { describe, it, expect } from 'vitest'
import { migrateDeliveries } from './migrate.js'
import { FACTORY_HALL_IDS } from '../defs/layouts/factory.js'

const box = (extra) => ({ id: 'd1', kitId: 'mini_drone', slotIndex: 0, readyAt: 1, status: 'transit', ...extra })

describe('Стадія 12 / Д3.1 — сейв зі стрічки', () => {
  it('точка скидання стає цехом, а коробка не губиться', () => {
    const s = migrateDeliveries({ deliveries: [box({ dropIndex: 2 })] })
    expect(s.deliveries).toHaveLength(1)
    expect(s.deliveries[0].hallId).toBe(FACTORY_HALL_IDS[2])
    expect('dropIndex' in s.deliveries[0]).toBe(false)
  })

  it('коробка, що на момент збереження ще їхала стрічкою, приїжджає у вуличний слот', () => {
    const s = migrateDeliveries({ deliveries: [box({ dropIndex: null })] })
    expect(s.deliveries[0].hallId ?? null).toBeNull()
    expect(s.deliveries[0].slotIndex).toBe(0)
  })

  it('стан без dropIndex взагалі не чіпається', () => {
    const state = { deliveries: [box({ hallId: 'hall-1' })] }
    expect(migrateDeliveries(state)).toBe(state)
    expect(migrateDeliveries({ deliveries: [] })).toEqual({ deliveries: [] })
  })
})
