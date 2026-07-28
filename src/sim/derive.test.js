// Стадія 10 / D2 — «скільки лишилось до наступної покупки».
//
// Перевіряється ФОРМА, а не числа: смужка мусить показувати те саме, про що
// світиться бейдж на стелажі. Доти це були два окремі перебори, і рівно так
// UI розходиться зі станом — бейдж каже «є що купити», смужка тягнеться до
// чогось іншого, і гравець не розуміє жодного з них.

import { describe, it, expect } from 'vitest'
import { createState } from '../state/gameState.js'
import { purchaseOptions, nextPurchase, upgradeNeedsAttention } from './derive.js'
import { UPGRADE_TRACKS, trackMaxLevel } from '../state/upgrades.js'
import { capFor } from '../state/locations.js'
import { trackIntroduced } from './quests.js'

const withMoney = (money) => ({ ...createState(), money })

// Стан із просунутим ланцюгом: рівні апгрейдів + лічильники, від яких залежить,
// що вже «введено» (Р5).
const withStats = ({ money = 1e9, ...upgrades }, stats) => {
  const base = createState()
  return {
    ...base, money, ordersPlaced: 9,
    upgrades: { ...base.upgrades, ...upgrades },
    stats:    { ...base.stats, ...stats },
  }
}

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
    // наступної віхи стільки». Сховати друге означало б збрехати про те, куди
    // гравець іде.
    //
    // Стан НЕ свіжий, і це суть: на старті гра навмисно продає рівно одну річ
    // (Р5), тож два ввімкнені індикатори там неможливі за задумом. Сценарій
    // з'являється з другим треком у ланцюгу.
    const mid = withStats(
      { money: 1e9, solderingLevel: 1 },
      { sold: 3, assembled: 3, soldByKit: { racing_drone: 1 } },
    )
    const probe = purchaseOptions(mid)
      .filter(o => !o.blocked && Number.isFinite(o.cost))
      .sort((a, b) => a.cost - b.cost)
    expect(probe.length).toBeGreaterThan(1)

    const game = { ...mid, money: probe[0].cost }
    expect(upgradeNeedsAttention(game)).toBe(true)          // найдешевше вже по кишені
    expect(nextPurchase(game)?.cost).toBeGreaterThan(game.money)  // наступне — ще ні
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
