// Вибір комплекту (Стадія 11 / B) — менеджер і гравець дивляться на одне число.
//
// До цього менеджер сортував каталог по СОБІВАРТОСТІ й брав найдорожчий
// доступний, а картка комплекту показувала гравцеві $/сек. Це два різні
// критерії «що вигідно» в одній грі, і розходились вони саме там, де гравець
// вклався у прокачку: міні-дрон Mk III вигідніший за гоночний Mk I, але
// найнятий менеджер усе одно тягнув гоночний.

import { describe, it, expect } from 'vitest'
import { createState, KIT_TYPES, kitCost } from '../state/gameState.js'
import { kitRatePerSec, kitsByValue, bestKitByValue } from './economy.js'
import { managerKitChoice } from './derive.js'
import { settleOffline } from './offline.js'
import { kitsForLocation } from '../state/locations.js'
import { MANAGER_RESERVE, OFFLINE_CAP_MS } from '../state/config.js'

// Квартира з відкритим каталогом і касою, якої вистачає на все.
const shop = (extra = {}) => ({
  ...createState(),
  money: 20_000,
  kitMarks: { mini_drone: 2, racing_drone: 2 },
  ...extra,
})

const TIER_ALL = 99

describe('bestKitByValue', () => {
  it('бере найвигідніший по $/сек, а не найдорожчий', () => {
    const s = shop()
    const best = bestKitByValue(s, TIER_ALL)
    const rates = kitsByValue(s, TIER_ALL).map(id => kitRatePerSec(s, id))
    expect(best).not.toBeNull()
    expect(kitRatePerSec(s, best.id)).toBe(Math.max(...rates))
  })

  it('прокачаний дешевий тип перебиває непрокачаний дорогий', () => {
    // Це і є випадок, заради якого фаза існує: вибір мусить рухатись за
    // вкладеннями гравця, а не стояти на ціннику.
    const cheapUp = shop({ kitMarks: { mini_drone: 3, racing_drone: 2 } })
    const richUp  = shop({ kitMarks: { mini_drone: 0, racing_drone: 2 } })

    const a = bestKitByValue(cheapUp, TIER_ALL)
    const b = bestKitByValue(richUp,  TIER_ALL)
    // Прокачали міні — його й беруть; лишили на Mk I — беруть щось дорожче.
    expect(kitRatePerSec(cheapUp, a.id))
      .toBeGreaterThanOrEqual(kitRatePerSec(cheapUp, 'racing_drone'))
    expect(kitRatePerSec(richUp, b.id))
      .toBeGreaterThanOrEqual(kitRatePerSec(richUp, 'mini_drone'))
  })

  it('тир лишається межею: дорожчі за клас не беруться взагалі', () => {
    const s = shop()
    // Ранг рахується в каталозі ЛОКАЦІЇ: далекобійного в квартирі не існує,
    // тож він не займає клас, який менеджер уже веде.
    const byCost = kitsForLocation(s)
      .filter(id => KIT_TYPES[id].cost > 0)
      .sort((a, b) => kitCost(s, a) - kitCost(s, b))
    for (const tier of [0, 1, 2]) {
      const allowed = new Set(byCost.slice(0, tier + 1))
      for (const id of kitsByValue(s, tier)) expect(allowed.has(id)).toBe(true)
    }
  })

  it('резерв каси не витрачається до нуля', () => {
    const s = shop({ money: 60 })
    for (const id of kitsByValue(s, TIER_ALL))
      expect(s.money).toBeGreaterThanOrEqual(kitCost(s, id) * MANAGER_RESERVE)
  })

  it('нічого по кишені — null, а не найдешевше в борг', () => {
    expect(bestKitByValue(shop({ money: 0 }), TIER_ALL)).toBeNull()
  })
})

describe('живий менеджер і нічна зміна не розходяться', () => {
  const staffed = (extra = {}) => shop({
    locationId: 'factory',
    unlockedHalls: ['hall-1'],
    workers: ['courier', 'tech', 'seller', 'manager'].map((role, i) => ({
      id: `w${i}`, role, level: 2, hallId: 'hall-1', x: 0, y: 0,
    })),
    upgrades: { ...createState().upgrades, solderingLevel: 2 },
    ...extra,
  })

  it('обидва беруть той самий комплект', () => {
    const s = staffed()
    const live = managerKitChoice(s, 2)
    expect(live).not.toBeNull()

    const night = settleOffline(s, OFFLINE_CAP_MS)
    // Нічний вибір читається з лічильника: цех збирав саме те, що обрав би
    // менеджер на очах у гравця.
    const built = night.state.stats.assembledByKit ?? {}
    const nightKit = Object.entries(built).sort((a, b) => b[1] - a[1])[0]?.[0]
    expect(nightKit).toBe(live.id)
  })

  it('нічна зміна рахується в норму Mk', () => {
    const s = staffed()
    const night = settleOffline(s, OFFLINE_CAP_MS)
    const built = Object.values(night.state.stats.assembledByKit ?? {})
      .reduce((a, b) => a + b, 0)
    expect(built).toBeGreaterThan(0)
    expect(built).toBe(night.assembled)
  })
})
