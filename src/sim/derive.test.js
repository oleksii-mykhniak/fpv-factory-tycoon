// Стадія 10 / D2 — «скільки лишилось до наступної покупки».
//
// Перевіряється ФОРМА, а не числа: смужка мусить показувати те саме, про що
// світиться бейдж на стелажі. Доти це були два окремі перебори, і рівно так
// UI розходиться зі станом — бейдж каже «є що купити», смужка тягнеться до
// чогось іншого, і гравець не розуміє жодного з них.

import { describe, it, expect } from 'vitest'
import { createState } from '../state/gameState.js'
import { purchaseOptions, nextPurchase, upgradeNeedsAttention } from './derive.js'
import { UPGRADE_TRACKS } from '../state/upgrades.js'
import { capFor } from '../state/locations.js'

const withMoney = (money) => ({ ...createState(), money })

describe('purchaseOptions', () => {
  it('не пропонує трек, який уперся в стелю локації', () => {
    const game = withMoney(10_000)
    for (const [id, track] of Object.entries(UPGRADE_TRACKS)) {
      const cap = capFor(game, id)
      const offered = purchaseOptions(game).some(o => o.id === `upgrade:${id}`)
      const level = game.upgrades[track.stateKey] ?? 0
      expect(offered).toBe(level < Math.min(track.costs.length, cap))
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

describe('nextPurchase', () => {
  it('на старті веде до найдешевшого, що ще не по кишені', () => {
    const game = withMoney(0)
    const next = nextPurchase(game)
    const cheapest = Math.min(...purchaseOptions(game)
      .filter(o => !o.blocked).map(o => o.cost))
    expect(next).not.toBeNull()
    expect(next.cost).toBe(cheapest)
  })

  it('мовчить, коли все доступне вже по кишені — тоді говорить бейдж', () => {
    // Стільки, що жоден варіант не лишається недосяжним.
    const game = withMoney(1e9)
    expect(nextPurchase(game)).toBeNull()
    expect(upgradeNeedsAttention(game)).toBe(true)
  })

  it('ніколи не веде до заблокованого — це обіцянка, яку стелаж не виконає', () => {
    for (const money of [0, 500, 2500, 1e9]) {
      const game = purchaseOptions(withMoney(money))
      for (const o of game.filter(x => x.blocked))
        expect(nextPurchase(withMoney(money))?.id).not.toBe(o.id)
    }
  })

  it('бідний І без вимог — це заблоковано, а не «ще не назбирав»', () => {
    // Переїзд на фабрику вимагає гараж і рівні апгрейдів, не лише $2500.
    // Найпростіша перевірка «money >= cost» назвала б це просто дорогим, і
    // смужка повзла б до того, чого стелаж не продасть.
    const broke = purchaseOptions(withMoney(0))
    const move  = broke.find(o => o.id.startsWith('move:'))
    if (move) expect(move.blocked).toBe(true)
  })

  it('смужка і бейдж кажуть різне і можуть світитись разом', () => {
    // Спокуса була зробити їх взаємовиключними — «дві підказки про одне» —
    // але вони не про одне: бейдж каже «щось уже доступне», смужка каже «до
    // наступної віхи стільки». При $120 флюс по кишені, а паяльник ще ні, і
    // сховати друге означало б збрехати про те, куди гравець іде.
    const game = withMoney(120)
    expect(upgradeNeedsAttention(game)).toBe(true)
    expect(nextPurchase(game)?.cost).toBeGreaterThan(game.money)
  })

  it('смужка завжди націлена на те, чого ще НЕ вистачає', () => {
    for (const money of [0, 50, 120, 150, 299, 300, 800, 5000]) {
      const next = nextPurchase(withMoney(money))
      if (next) expect(next.cost).toBeGreaterThan(money)
    }
  })

  it('ціль дорожчає монотонно, поки гравець багатіє', () => {
    let prev = 0
    for (const money of [0, 100, 200, 400, 900, 2000]) {
      const next = nextPurchase(withMoney(money))
      if (!next) break
      expect(next.cost).toBeGreaterThanOrEqual(prev)
      prev = next.cost
    }
  })
})
