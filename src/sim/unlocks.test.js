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
import { featureIntroduced, trackIntroduced } from './unlocks.js'
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
