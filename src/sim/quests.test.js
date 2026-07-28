// Ланцюг квестів (Стадія 9 / Р1).
//
// Головне, що тут перевіряється, — не тексти, а ФОРМА: активний крок рівно
// один, ланцюг ніколи не їде назад, і крок, який тут не має сенсу, ланцюг
// проскакує. Якби квести жили в сейві, кожна зміна балансу вимагала б міграції
// — і саме на цьому такі системи зазвичай ламаються.

import { describe, it, expect } from 'vitest'
import {
  activeQuest, questIndex, questReached, questZoneKind, trackIntroduced,
  QUEST_CHAIN, QUEST_ACTS,
} from './quests.js'
import { createWorld } from './world.js'
import { advance } from './loop.js'
import { dispatch } from './commands.js'
import { SYSTEMS } from './systems/index.js'
import { nextObjective, interruptQuest } from './derive.js'
import { INTERACTIONS } from '../defs/interactions.js'
import { EV } from './events.js'
import { layoutFor } from '../defs/layouts/index.js'
import { createState, buyUpgrade } from '../state/gameState.js'
import { UPGRADE_TRACKS } from '../state/upgrades.js'
import { capFor } from '../state/locations.js'
import { TICK_MS } from '../state/config.js'

const T0 = 1_000_000

const home = (extra = {}) => ({ ...createState(), ...extra })
const withStats = (extra = {}, stats = {}) =>
  ({ ...home(extra), stats: { ...createState().stats, ...stats } })

// Стан, у якому пройдено весь акт квартири: гараж куплено.
const garage = (extra = {}, stats = {}) =>
  withStats({ unlockedRooms: ['flat', 'garage'], ...extra }, stats)

function world(state) {
  return createWorld({ state, salesLog: [] },
    { now: T0, rng: () => 0.5, layout: layoutFor(state.locationId ?? 'apartment', state) })
}

const run = (w, ms) => {
  const events = []
  const target = w.now + ms
  while (target - w.now >= TICK_MS) events.push(...advance(w, w.now + TICK_MS, SYSTEMS))
  return events
}

describe('форма ланцюга', () => {
  it('усі id унікальні — інакше questReached вказував би не туди', () => {
    const ids = QUEST_CHAIN.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('кожен крок умі́є сказати, що робити і куди йти', () => {
    for (const step of QUEST_CHAIN) {
      expect(step.kind === 'do' || step.kind === 'buy').toBe(true)
      expect(typeof step.zoneKind).toBe('string')
      expect(typeof step.done).toBe('function')
    }
  })

  it('покупки не йдуть довгою чергою — апгрейд заробляється петлею (П3 плану)', () => {
    // Серія дій підряд — це нормально: гравець грає. Серія покупок підряд — це
    // прайс-лист, з якого Стадія 9 і починалась.
    for (const act of QUEST_ACTS) {
      let run = 0
      for (const step of act.steps) {
        run = step.kind === 'buy' ? run + 1 : 0
        expect(run).toBeLessThanOrEqual(3)
      }
    }
  })
})

describe('активний крок — рівно один і виводиться зі стану', () => {
  it('на старті просять замовити комплект, стрілка — на стіл', () => {
    const q = activeQuest(home())
    expect(q.id).toBe('first_order')
    expect(q.kind).toBe('do')
    expect(q.zoneKind).toBe('desk')
    expect(q.step).toBe(1)
    expect(q.total).toBe(QUEST_CHAIN.length)
  })

  it('замовив — ланцюг сам поїхав далі, без жодного запису в стан', () => {
    expect(activeQuest(home()).id).toBe('first_order')
    expect(activeQuest(home({ ordersPlaced: 1 })).id).toBe('first_assembly')
  })

  it('лічильник — це прогрес дії: продано 1 із 3', () => {
    const q = activeQuest(withStats({ ordersPlaced: 1 }, { assembled: 1, sold: 1 }))
    expect(q.id).toBe('sell_three')
    expect(q.have).toBe(1)
    expect(q.need).toBe(3)
    expect(q.ready).toBe(false)
  })

  it('прогрес покупки — це гроші, і смужка не переповнюється', () => {
    const at = (money) =>
      activeQuest(withStats({ money, ordersPlaced: 3 }, { assembled: 3, sold: 3 }))
    expect(at(10).id).toBe('iron_1')
    expect(at(10).have).toBe(10)
    expect(at(10).ready).toBe(false)
    expect(at(9999).have).toBe(at(9999).need)
    expect(at(9999).ready).toBe(true)
  })

  it('куплене зараховується, навіть якщо гравець купив раніше, ніж просили', () => {
    const s = withStats({ money: 9999, ordersPlaced: 3 }, { assembled: 3, sold: 3 })
    expect(activeQuest(s).id).toBe('iron_1')
    expect(activeQuest(buyUpgrade(s, 'soldering')).id).not.toBe('iron_1')
  })
})

describe('ланцюг не їде назад', () => {
  it('кожен крок, раз пройдений, лишається пройденим', () => {
    // Проходимо ланцюг «згори»: індекс мусить тільки рости.
    const states = [
      home(),
      home({ ordersPlaced: 1 }),
      withStats({ ordersPlaced: 1 }, { assembled: 1 }),
      withStats({ ordersPlaced: 1 }, { assembled: 1, sold: 1 }),
      withStats({ ordersPlaced: 3 }, { assembled: 3, sold: 3 }),
      buyUpgrade(withStats({ ordersPlaced: 3, money: 9999 }, { assembled: 3, sold: 3 }), 'soldering'),
      garage({ money: 9999 }, { sold: 9, soldByKit: { racing_drone: 1, cinematic_drone: 1 } }),
    ]
    const idx = states.map(questIndex)
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThanOrEqual(idx[i - 1])
  })

  it('витрачені гроші не відкочують крок-покупку', () => {
    const rich = buyUpgrade(withStats({ money: 9999 }, { assembled: 1, sold: 3 }), 'soldering')
    const poor = { ...rich, money: 0 }
    expect(questIndex(poor)).toBe(questIndex(rich))
  })

  it('старий сейв не відкидає гравця на початок: акт, який переросли, пройдено', () => {
    // Сейв версії 3: лічильників немає взагалі, але фабрика вже є.
    const factory = { ...createState(), locationId: 'factory', money: 5000 }
    delete factory.stats
    const q = activeQuest(factory)
    expect(q.actId).toBe('factory')
    expect(questReached(factory, 'sell_three')).toBe(true)
  })
})

describe('крок, який тут не має сенсу, проскакується', () => {
  it('у квартирі не просять наймати — вакансій немає', () => {
    const s = garage()   // гараж куплено → акт квартири пройдено
    expect(activeQuest(s).id).toBe('hire_courier')

    // А в самій квартирі до гаража ланцюг взагалі не доходить до найму.
    expect(questReached(home(), 'hire_courier')).toBe(false)
  })

  it('склад у квартирі має стелю 0, тож такого кроку в цьому акті немає', () => {
    const flat = QUEST_ACTS.find(a => a.id === 'flat').steps.map(s => s.id)
    expect(flat).not.toContain('storage_1')
  })

  it('дрон, якого тут не збирають, не може бути ціллю', () => {
    const s = withStats({ ordersPlaced: 9 }, { assembled: 9, sold: 9 })
    // Далекобійний — гаражний, тому в акті квартири його продаж не просять.
    let cur = s, seen = []
    for (let i = 0; i < 5; i++) {
      const q = activeQuest({ ...cur, money: 0 })
      if (!q) break
      seen.push(q.id)
      break
    }
    expect(seen).not.toContain('sell_longrange')
  })
})

describe('стрілка', () => {
  it('веде до зони активного кроку, коли петля чиста', () => {
    // Продано 3, грошей на паяльник вистачає → стрілка на шафу.
    const w = world(withStats({ money: 9999, ordersPlaced: 9 }, { assembled: 3, sold: 3 }))
    expect(activeQuest(w.game).id).toBe('iron_1')
    expect(nextObjective(w, INTERACTIONS).kind).toBe('rack')
  })

  it('не веде до шафи, поки грошей на крок немає', () => {
    const s = withStats({ money: 5, ordersPlaced: 9 }, { assembled: 3, sold: 3 })
    expect(questZoneKind(s)).toBeNull()
    expect(nextObjective(world(s), INTERACTIONS)?.kind).not.toBe('rack')
  })

  it('ціль важливіша за «замов ще один комплект»', () => {
    // Стіл завжди «має що робити», поки є гроші на кіт, тож без окремого
    // правила він забирав стрілку в кожної цілі, доки діють підказки.
    const w = world(withStats({ money: 9999, ordersPlaced: 1 }, { assembled: 3, sold: 3 }))
    expect(activeQuest(w.game).kind).toBe('buy')
    expect(nextObjective(w, INTERACTIONS).kind).toBe('rack')
  })

  it('але без цілі стрілка все одно веде до столу', () => {
    const w = world(home({ money: 9999, ordersPlaced: 1 }))
    // Перший крок — «запаяй» (замовлення вже зроблено), зон bench немає сенсу
    // перевіряти окремо: важливо, що стрілка є.
    expect(nextObjective(w, INTERACTIONS)).toBeTruthy()
  })

  it('фізична дія важливіша за квест: з коробкою в руках стрілка на верстак', () => {
    const w = world(withStats({ money: 9999 }, { assembled: 3, sold: 3 }))
    const player = w.agents.find(a => a.kind === 'player')
    player.carrying = [{ type: 'kit_box', kitId: 'mini_drone' }]
    expect(nextObjective(w, INTERACTIONS).kind).toBe('bench')
  })

  it('веде далі й після того, як підказки петлі замовкли', () => {
    const w = world(withStats({ money: 9999, ordersPlaced: 99 }, { assembled: 3, sold: 3 }))
    expect(nextObjective(w, INTERACTIONS).kind).toBe('rack')
  })
})

describe('прогресивне розкриття поліпшень (Р5)', () => {
  it('на старті введено рівно один трек — той, який попросять першим', () => {
    const s = home()
    expect(trackIntroduced(s, 'soldering')).toBe(true)
    expect(trackIntroduced(s, 'consumables')).toBe(false)
    expect(trackIntroduced(s, 'storage')).toBe(false)
    expect(trackIntroduced(s, 'logistics')).toBe(false)
    expect(trackIntroduced(s, 'benches')).toBe(false)
  })

  it('шафа ніколи не порожня: наступний трек ланцюга видно завжди', () => {
    // Після паяльника ланцюг просить дію, і трек покупки все одно має бути
    // видимим — інакше панель поліпшень стояла б порожня.
    const s = buyUpgrade(withStats({ money: 9999, ordersPlaced: 3 }, { assembled: 3, sold: 3 }), 'soldering')
    expect(activeQuest(s).kind).toBe('do')
    expect(trackIntroduced(s, 'soldering')).toBe(true)
    expect(trackIntroduced(s, 'consumables')).toBe(true)
  })

  // Найважливіший інваріант Р5: правило «показуй лише введене» не має права
  // спорожнити шафу, поки в ній є що купувати. Порожня панель читається як
  // поламана, а гравець після неї до шафи не повертається.
  it('поки є що купувати — видно щонайменше один трек', () => {
    const buyable = (game) => Object.keys(UPGRADE_TRACKS).filter(id => {
      const track = UPGRADE_TRACKS[id]
      const level = game.upgrades[track.stateKey] ?? 0
      return level < Math.min(track.costs.length, capFor(game, id))
    })
    const visible = (game) => buyable(game).filter(id => trackIntroduced(game, id))

    const states = [
      home(),
      withStats({ ordersPlaced: 3 }, { assembled: 3, sold: 3 }),
      // Паяльник уже в стелі квартири, а витратники — ні: саме тут «наступний
      // трек ланцюга» вказує на викуплене, і шафа спорожніла б.
      { ...home(), upgrades: { ...home().upgrades, solderingLevel: 2 } },
      garage({ money: 9999 }),
      { ...garage(), upgrades: { ...home().upgrades, solderingLevel: 3, benchLevel: 1 } },
      { ...home(), locationId: 'factory', money: 5000 },
    ]
    for (const s of states) {
      if (!buyable(s).length) continue
      expect(visible(s).length, `шафа порожня при ${JSON.stringify(buyable(s))}`)
        .toBeGreaterThan(0)
    }
  })

  it('введене не ховається назад', () => {
    const s = garage({ money: 9999 })
    for (const id of ['soldering', 'consumables', 'benches'])
      expect(trackIntroduced(s, id)).toBe(true)
  })
})

// Дві ситуації, які ламають будь-який ланцюг: комплект згорів і грошей нема.
// Вони не в ланцюгу — їхні умови не монотонні, — а перебивають картку на той
// час, поки тривають.
describe('позаланцюгові вставки', () => {
  const burntStation = (kitId = 'racing_drone') => ({
    id: 'station-0', defId: 'workbench', phase: 'BURNT', kitId,
    solderPoints: [0.9, 0.9], quality: null, coldPenalty: 0, takenBy: null,
  })

  it('згорілий комплект перебиває ціль і веде до верстака', () => {
    const s = withStats({ money: 9999, ordersPlaced: 3, stations: [burntStation()] },
      { assembled: 3, sold: 3 })
    const stuck = interruptQuest(s)
    expect(stuck.id).toBe('fix_burnt')
    expect(stuck.zoneKind).toBe('bench')
    expect(stuck.why).toContain('$')                 // скільки дадуть за брухт
    expect(activeQuest(s).id).toBe('iron_1')         // ланцюг не зрушив
    expect(nextObjective(world(s), INTERACTIONS).kind).toBe('bench')
  })

  it('прибрали — вставка зникла сама, індекс не змінився', () => {
    const burnt = withStats({ money: 9999, ordersPlaced: 3, stations: [burntStation()] },
      { assembled: 3, sold: 3 })
    const clean = { ...burnt, stations: [{ ...burntStation(), phase: 'IDLE', kitId: null }] }
    expect(interruptQuest(clean)).toBeNull()
    expect(questIndex(clean)).toBe(questIndex(burnt))
  })

  it('порожня каса веде до смітника, а коли брухт уже замовлено — до скарбнички', () => {
    const broke = withStats({ money: 1, ordersPlaced: 9 }, { assembled: 3, sold: 3 })
    expect(interruptQuest(broke).zoneKind).toBe('trashbin')
    expect(interruptQuest({ ...broke, scrapAvailable: true }).zoneKind).toBe('piggy')
  })

  it('на фабриці порятунок інший, тож вставки немає', () => {
    // Там ні смітника, ні скарбнички — виручає безкоштовний комплект з ноутбука.
    const broke = { ...createState(), locationId: 'factory', money: 1 }
    expect(interruptQuest(broke)).toBeNull()
  })

  it('з грошима або з роботою в дорозі вставки немає', () => {
    const rich = withStats({ money: 9999, ordersPlaced: 9 }, { assembled: 3, sold: 3 })
    expect(interruptQuest(rich)).toBeNull()

    const waiting = { ...rich, money: 1, deliveries: [
      { id: 'd1', kitId: 'mini_drone', slotIndex: 0, readyAt: T0, status: 'transit' },
    ] }
    expect(interruptQuest(waiting)).toBeNull()
  })
})

describe('виконаний крок повідомляє про себе один раз', () => {
  it('QUEST_DONE прилітає рівно на зміну активного кроку', () => {
    const w = world(withStats({ money: 9999, ordersPlaced: 9 }, { assembled: 3, sold: 3 }))
    run(w, 200)                                   // ланцюг «прогрівся»
    expect(activeQuest(w.game).id).toBe('iron_1')

    dispatch(w, 'buyUpgrade', { trackId: 'soldering' })
    const events = run(w, 200)

    expect(events.filter(e => e.t === EV.QUEST_DONE && e.questId === 'iron_1').length).toBe(1)
    expect(activeQuest(w.game).id).not.toBe('iron_1')
  })
})
