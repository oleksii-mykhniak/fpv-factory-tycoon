// Квести (П1) — цілі виводяться зі стану, а не зберігаються.
//
// Головне, що тут перевіряється: список змінюється САМ, коли гравець щось
// купує. Якби квести жили в сейві, кожна зміна балансу вимагала б міграції — і
// саме на цьому такі системи зазвичай ламаються.

import { describe, it, expect } from 'vitest'
import { activeQuests, pinnedQuest } from './quests.js'
import { createWorld } from './world.js'
import { advance } from './loop.js'
import { dispatch } from './commands.js'
import { SYSTEMS } from './systems/index.js'
import { nextObjective } from './derive.js'
import { INTERACTIONS } from '../defs/interactions.js'
import { EV } from './events.js'
import { layoutFor } from '../defs/layouts/index.js'
import { createState, buyUpgrade } from '../state/gameState.js'
import { TICK_MS } from '../state/config.js'

const T0 = 1_000_000
const idsOf = (game) => activeQuests(game).map(q => q.id)
const questOf = (game, id) => activeQuests(game).find(q => q.id === id)

const home = (extra = {}) => ({ ...createState(), ...extra })

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

describe('П1 — квести виводяться зі стану', () => {
  it('на старті перша ціль — замовити дрон, і вона коштує найдешевший кіт', () => {
    const q = activeQuests(home())[0]
    expect(q.id).toBe('first_order')
    expect(q.need).toBeGreaterThan(0)
    expect(q.zoneKind).toBe('desk')
  })

  it('замовив — ціль зникла сама, без жодного запису в стан', () => {
    const before = home()
    const after  = { ...before, ordersPlaced: 1 }
    expect(idsOf(before)).toContain('first_order')
    expect(idsOf(after)).not.toContain('first_order')
  })

  it('куплений рівень прибирає свою ціль і ставить наступну', () => {
    const s0 = home({ money: 9999 })
    expect(questOf(s0, 'soldering').title).toContain('Кращий паяльник')

    const s1 = buyUpgrade(s0, 'soldering')
    expect(questOf(s1, 'soldering').title).toContain('Напівавтомат')

    // Стеля квартири — 2 рівні; далі ціль зникає зовсім (П2).
    const s2 = buyUpgrade(s1, 'soldering')
    expect(idsOf(s2)).not.toContain('soldering')
  })

  it('прогрес — це гроші: have/need і "готово" беруться з каси', () => {
    const poor = questOf(home({ money: 10 }), 'room')
    expect(poor.have).toBe(10)
    expect(poor.ready).toBe(false)

    const rich = questOf(home({ money: 5000 }), 'room')
    expect(rich.have).toBe(rich.need)   // смужка не переповнюється
    expect(rich.ready).toBe(true)
  })

  it('решта умов іде текстом, бо смужка вміє показати лише одне число', () => {
    // Грошей вистачає, паяльника — ні: у підказці має бути саме паяльник, і
    // жодного слова про гроші.
    const q = questOf(home({ money: 5000 }), 'room')
    expect(q.hint).toContain('Паяльник')
    expect(q.hint).not.toContain('Потрібно $')
  })

  it('цілі, яких тут не буває, не показуються', () => {
    const flat = idsOf(home())
    expect(flat).not.toContain('hire')     // у квартирі нікого не наймають
    expect(flat).not.toContain('hall')     // цехи — лише на фабриці
    expect(flat).not.toContain('benches')  // верстаки відкриває гараж

    const garage = idsOf(home({ money: 9999, unlockedRooms: ['flat', 'garage'] }))
    expect(garage).toContain('hire')
    expect(garage).toContain('benches')
    expect(garage).not.toContain('room')   // прибудовувати вже нічого
  })

  it('порядок фіксований: спершу те, без чого решта не відкриється', () => {
    const ids = idsOf(home({ money: 9999, unlockedRooms: ['flat', 'garage'] }))
    expect(ids.indexOf('soldering')).toBeLessThan(ids.indexOf('hire'))
    expect(ids.indexOf('hire')).toBeLessThan(ids.indexOf('move'))
  })
})

describe('П1 — закріплена ціль веде стрілку', () => {
  it('закріплення переживає тік і вказує на зону свого типу', () => {
    const w = world(home({ money: 9999 }))
    dispatch(w, 'pinQuest', { questId: 'room' })
    run(w, 200)

    expect(pinnedQuest(w.game).id).toBe('room')
    expect(nextObjective(w, INTERACTIONS).kind).toBe('rack')
  })

  it('без закріплення стрілка лишається на петлі', () => {
    const w = world(home({ money: 9999 }))
    expect(nextObjective(w, INTERACTIONS)?.kind).not.toBe('rack')
  })

  it('закріплена ціль веде стрілку і після того, як підказки замовкли', () => {
    // guidanceActive гасне після кількох замовлень — але стрілку, яку гравець
    // попросив сам, це стосуватись не має.
    const w = world(home({ money: 9999, ordersPlaced: 99 }))
    dispatch(w, 'pinQuest', { questId: 'room' })
    expect(nextObjective(w, INTERACTIONS).kind).toBe('rack')
  })

  it('виконана ціль знімає закріплення сама і повідомляє про себе', () => {
    const w = world(home({ money: 9999 }))
    dispatch(w, 'pinQuest', { questId: 'soldering' })
    run(w, 200)
    expect(w.game.pinnedQuestId).toBe('soldering')

    // Купуємо обидва доступні рівні — ціль вичерпана.
    dispatch(w, 'buyUpgrade', { trackId: 'soldering' })
    dispatch(w, 'buyUpgrade', { trackId: 'soldering' })
    const events = run(w, 200)

    expect(events.some(e => e.t === EV.QUEST_DONE && e.questId === 'soldering')).toBe(true)
    expect(w.game.pinnedQuestId).toBeNull()
    expect(nextObjective(w, INTERACTIONS)?.kind).not.toBe('rack')
  })
})
