// Перелік того, що стелаж узагалі продає, і бейдж «є що купити».
//
// Перевіряється ФОРМА, а не числа: бейдж мусить світитись рівно тоді, коли
// серед доступних варіантів є по кишені. Доти це були два окремі перебори, і
// рівно так UI розходиться зі станом.

import { describe, it, expect } from 'vitest'
import { createState } from '../state/gameState.js'
import { purchaseOptions, upgradeNeedsAttention } from './derive.js'
import { UPGRADE_TRACKS, trackMaxLevel } from '../state/upgrades.js'
import { capFor } from '../state/locations.js'
import { trackIntroduced } from './quests.js'

const withMoney = (money) => ({ ...createState(), money })

describe('purchaseOptions', () => {
  it('трек пропонується рівно тоді, коли він і введений, і не в стелі', () => {
    // `trackMaxLevel`, а не `costs.length`: у нескінченного треку `costs` —
    // функція, і `.length` на ній дало б арність, тобто 1.
    const game = withMoney(10_000)
    for (const [id, track] of Object.entries(UPGRADE_TRACKS)) {
      const level   = game.upgrades[track.stateKey] ?? 0
      const room    = level < Math.min(trackMaxLevel(id), capFor(game, id))
      const offered = purchaseOptions(game).some(o => o.id === `upgrade:${id}`)
      expect(offered).toBe(room && trackIntroduced(game, id))
    }
  })

  it('кожен варіант має скінченну ціну і назву', () => {
    for (const o of purchaseOptions(withMoney(10_000))) {
      expect(typeof o.label).toBe('string')
      expect(o.label.length).toBeGreaterThan(0)
      expect(Number.isFinite(o.cost)).toBe(true)
    }
  })
})

describe('покупки і панель поліпшень не розходяться', () => {
  it('смужка не веде до треку, якого панель ще не показує', () => {
    // Р5 ховає невведені треки. Поки покупки рахувались окремим перебором,
    // смужка могла вести до «Репутація · $50», а на стелажі такого рядка не
    // було. Нескінченні треки зробили це видимим одразу: вони доступні завжди.
    for (const money of [0, 50, 200, 1000, 5000]) {
      const game = withMoney(money)
      for (const o of purchaseOptions(game)) {
        if (!o.id.startsWith('upgrade:')) continue
        expect(trackIntroduced(game, o.id.slice('upgrade:'.length))).toBe(true)
      }
    }
  })
})
