// Одні двері для всіх панелей (Стадія 11 / D).
//
// Перевіряється не «що саме видно», а два інваріанти, кожен з яких ламається
// тихо й псує панель цілком:
//
//   1. панель не порожня, поки в ній є що показати;
//   2. відкрите не ховається назад.
//
// Перший — той самий, який колись урятував шафу: правило «показуй лише
// введене» не має права лишити гравця перед порожнім списком у панелі, до якої
// його щойно послав квест.

import { describe, it, expect } from 'vitest'
import {
  featureIntroduced, trackIntroduced, nextUnlock, featureLabel, introducedFeatures,
} from './unlocks.js'
import { QUEST_CHAIN, questIndex } from './quests.js'
import { createState } from '../state/gameState.js'
import { ROLE_ORDER } from '../defs/roles.js'
import { roleCapInHall, hiringAllowed } from '../state/locations.js'

const home    = (extra = {}) => ({ ...createState(), ...extra })
const garage  = (extra = {}) => home({ unlockedRooms: ['flat', 'garage'], ...extra })
const factory = (extra = {}) => home({
  locationId: 'factory', unlockedHalls: ['hall-1'], ...extra,
})

// Скільки ролей дошка показала б у цьому стані: введені й з вільним місцем —
// рівно правило `openRoles` з ui/hireModal.js.
const rolesOnBoard = (game, hallId = null) => ROLE_ORDER.filter(id =>
  featureIntroduced(game, `role:${id}`) &&
  (game.workers ?? []).filter(w => w.role === id).length < roleCapInHall(game, hallId, id))

describe('featureIntroduced', () => {
  it('річ, якої ланцюг не згадує, вважається введеною', () => {
    // Інакше будь-що, додане в гру повз ланцюг, зникло б з екрана назавжди.
    expect(featureIntroduced(home(), 'track:вигадка')).toBe(true)
    expect(featureIntroduced(home(), 'role:вигадка')).toBe(true)
  })

  it('на старті введено рівно те, що попросять першим', () => {
    const s = home()
    expect(trackIntroduced(s, 'soldering')).toBe(true)
    // Решта треків чекає своєї черги — панель росте по рядку.
    expect(trackIntroduced(s, 'bulk')).toBe(false)
    expect(trackIntroduced(s, 'tooling')).toBe(false)
    // Так само й люди: у квартирі ще нікого не наймають.
    expect(featureIntroduced(s, 'role:tech')).toBe(false)
    expect(featureIntroduced(s, 'panel:promote')).toBe(false)
  })

  it('панель не порожня, поки в ній є що показати', () => {
    // Дошка найму: там, де наймати можна, гравець мусить побачити бодай одну
    // роль. Порожня панель читається як поламана — і саме так гараж і
    // виглядав би, якби правило дивилось на «наступне взагалі», а не на
    // «наступне цього ж роду».
    for (const s of [garage({ money: 9999 }), factory({ money: 9999 })]) {
      if (!hiringAllowed(s)) continue
      expect(rolesOnBoard(s).length, 'дошка порожня').toBeGreaterThan(0)
    }
  })

  it('дошка росте по одній ролі, а не вивалює чотири', () => {
    expect(rolesOnBoard(garage({ money: 9999 })).length).toBe(1)
  })

  it('роль без вакансій зникає, а не висить рядком «місць немає»', () => {
    const full = garage({
      money: 9999,
      workers: [{ id: 'w0', role: 'courier', level: 0, x: 0, y: 0 }],
    })
    expect(rolesOnBoard(full)).not.toContain('courier')
  })

  it('відкрите не ховається назад', () => {
    // Проходимо ланцюг «згори»: те, що вже введено, лишається введеним у
    // будь-якому пізнішому стані. Двері односторонні (П3).
    const states = [
      home(),
      home({ money: 9999 }),
      garage({ money: 9999 }),
      factory({ money: 9999 }),
    ]
    const features = [...new Set(QUEST_CHAIN.map(s => s.opens).filter(Boolean))]
    for (const f of features) {
      let seen = false
      for (const s of states) {
        const now = featureIntroduced(s, f)
        if (seen) expect(now, `${f} сховалось назад`).toBe(true)
        seen = seen || now
      }
    }
  })

  it('усе, що ланцюг уже пройшов, — введене', () => {
    const s = factory({ money: 9999 })
    const at = questIndex(s)
    for (const step of QUEST_CHAIN.slice(0, at)) {
      if (!step.opens) continue
      expect(featureIntroduced(s, step.opens), step.opens).toBe(true)
    }
  })
})

describe('«що буде далі» (Стадія 11 / E)', () => {
  it('показує річ, а не відстань до неї', () => {
    const n = nextUnlock(home())
    expect(n).not.toBeNull()
    expect(n.label.length).toBeGreaterThan(0)
    expect(n.where.length).toBeGreaterThan(0)
    // Номера кроку тут немає навмисно: довжина ланцюга змінюється з кожним
    // балансним правленням, і обіцяне число перестало б бути правдою.
    expect(n).not.toHaveProperty('stepsAway')
  })

  it('не показує те, що вже на екрані як поточна ціль', () => {
    // Рядок «далі» рахується від НАСТУПНОГО кроку: інакше він повторював би
    // заголовок картки.
    const s = home({ money: 9999 })
    const active = QUEST_CHAIN[questIndex(s)]
    if (active?.opens) expect(nextUnlock(s).featureId).not.toBe(active.opens)
  })

  it('кожну річ ланцюга можна назвати гравцеві', () => {
    for (const step of QUEST_CHAIN) {
      if (!step.opens) continue
      const { label, where } = featureLabel(step.opens)
      expect(label, step.opens).not.toBe(step.opens)   // не сирий id
      expect(where.length, step.opens).toBeGreaterThan(0)
    }
  })

  it('набір відкритого тільки росте — тост не стріляє двічі', () => {
    const seq = [home(), home({ money: 9999 }), garage({ money: 9999 }), factory({ money: 9999 })]
    let prev = new Set()
    for (const s of seq) {
      const now = introducedFeatures(s)
      for (const f of prev) expect(now.has(f), `${f} зникло`).toBe(true)
      prev = now
    }
  })

  it('у кінці ланцюга обіцяти нічого — і рядок зникає', () => {
    // Стан, у якому всі кроки з `opens` пройдені або безглузді.
    const done = factory({
      money: 1e9,
      unlockedHalls: ['hall-1', 'hall-2', 'hall-3'],
      workers: ROLE_ORDER.map((role, i) => ({ id: `w${i}`, role, level: 3, hallId: 'hall-1', x: 0, y: 0 })),
      kitMarks: { mini_drone: 5, racing_drone: 5, cinematic_drone: 5, longrange_drone: 5 },
      upgrades: {
        priceMultiplier: 1, solderingLevel: 3, consumablesLevel: 2, storageLevel: 2,
        logisticsLevel: 2, benchLevel: 2, reputationLevel: 9, bulkLevel: 9,
        toolingLevel: 9, courierLevel: 9,
      },
    })
    expect(nextUnlock(done)).toBeNull()
  })
})
