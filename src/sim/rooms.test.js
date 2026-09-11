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
    const rows = packRows(FACTORY_HALLS.filter(h => h.kind === 'assembly'))
    expect(rows).toHaveLength(1)
    expect(rows[0].w).toBe(5100)
  })
})

describe('К1.2 — кімнати стоять сіткою, не рядком', () => {
  // Пакувалка — чиста функція, тож питати її можна й про кімнати, яких у грі
  // ще немає. Це навмисно: ряд має закритись ПЕРШ НІЖ з'явиться кімната, через
  // яку світ став би довшим за екран.
  const wide  = { id: 'w', kind: 'assembly' }
  const lab   = { id: 'l', kind: 'lab' }
  const halls = FACTORY_HALLS.filter(h => h.kind === 'assembly')

  it('четверта кімната йде в другий ряд, а не подовжує перший', () => {
    const rows = packRows([...halls, lab])
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
    const rows = packRows([...halls, lab, { id: 'f', kind: 'flight' }])
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

// ── К2 — лабораторія: дослідження замість гринду ──────────

import { createWorld } from './world.js'
import { advance } from './loop.js'
import { dispatch } from './commands.js'
import { SYSTEMS } from './systems/index.js'
import { deriveJobs } from './systems/job.js'
import {
  createState, Phase, DeliveryStatus, workersInRole,
  researchPoints, canUpgradeMark, upgradeMark, markResearchCost, markBuildProgress,
} from '../state/gameState.js'
import { layoutFor } from '../defs/layouts/index.js'
import { TICK_MS, RESEARCH_MARK_COST, MK_BUILD_REQ } from '../state/config.js'
import { LOOP_ROLES, ROLE_ORDER } from '../defs/roles.js'
import { shopRunsItself } from './offline.js'

const T0 = 1_000_000
const WITH_LAB = ['hall-1', 'hall-2', 'hall-3', 'lab-1']

function factory(halls = WITH_LAB, extra = {}) {
  const base = createState()
  const state = { ...base, money: 99999, locationId: 'factory', unlockedHalls: halls, ...extra }
  return createWorld({ state, salesLog: [] },
    { now: T0, rng: () => 0.5, layout: layoutFor('factory', state) })
}

const run = (w, ms) => {
  const events = []
  const target = w.now + ms
  while (target - w.now >= TICK_MS) events.push(...advance(w, w.now + TICK_MS, SYSTEMS))
  return events
}

// Коробка, що лежить у ящику цеху й чекає на когось.
const waitingBox = (w, hallId, id = 'box-1', kitId = 'mini_drone') => {
  w.game = {
    ...w.game,
    deliveries: [...(w.game.deliveries ?? []), {
      id, kitId, hallId, slotIndex: 0, readyAt: T0 - 1, status: DeliveryStatus.TRANSIT,
    }],
  }
}

// Усі верстаки зайняті — тобто коробці нема куди йти, окрім лабораторії.
const fillBenches = (w) => {
  w.game = {
    ...w.game,
    stations: w.game.stations.map(s => ({ ...s, phase: Phase.ASSEMBLY, kitId: 'mini_drone' })),
  }
}

describe('К2 — лабораторія', () => {
  it('кімната приносить стенд, дошку й вакансію інженера', () => {
    const w = factory()
    expect(w.zones.filter(z => z.kind === 'research')).toHaveLength(1)
    expect(w.zones.some(z => z.kind === 'jobboard' && z.meta?.hallId === 'lab-1')).toBe(true)
    dispatch(w, 'hireWorker', { role: 'engineer', hallId: 'lab-1' })
    expect(workersInRole(w.game, 'engineer', 'lab-1')).toHaveLength(1)
  })

  it('без лабораторії інженера нема куди наймати', () => {
    const w = factory(['hall-1', 'hall-2', 'hall-3'])
    expect(w.zones.some(z => z.kind === 'research')).toBe(false)
    expect(() => dispatch(w, 'hireWorker', { role: 'engineer', hallId: 'hall-1' })).toThrow()
  })

  it('гравець сам розбирає комплект на стенді — коробка стає очками', () => {
    const w = factory()
    waitingBox(w, 'hall-1')
    const player = w.agents.find(a => a.kind === 'player')
    const intake = w.zones.find(z => z.kind === 'intake' && z.meta?.hallId === 'hall-1')
    const rig    = w.zones.find(z => z.kind === 'research')

    player.x = intake.cx; player.y = intake.cy
    run(w, 1500)
    expect(player.carrying.some(i => i.type === 'kit_box')).toBe(true)

    player.x = rig.cx; player.y = rig.cy
    run(w, 8000)
    expect(researchPoints(w.game)).toBeGreaterThan(0)
    expect(w.game.deliveries).toHaveLength(0)
    expect(player.carrying).toHaveLength(0)
  })

  // Найважливіше правило К2: дослідження не купується зупинкою виробництва.
  it('дослідницька робота береться лише з надлишку — вільний верстак виграє', () => {
    const w = factory()
    waitingBox(w, 'hall-1')
    expect(deriveJobs(w).filter(j => j.type === 'research')).toHaveLength(0)
    expect(deriveJobs(w).filter(j => j.type === 'haul_delivery')).toHaveLength(1)

    fillBenches(w)
    expect(deriveJobs(w).filter(j => j.type === 'research')).toHaveLength(1)
    expect(deriveJobs(w).filter(j => j.type === 'haul_delivery')).toHaveLength(0)
  })

  it('коробка в руках інженера не породжує другої роботи для кур\'єра', () => {
    const w = factory()
    dispatch(w, 'hireWorker', { role: 'engineer', hallId: 'lab-1' })
    const eng = w.agents.find(a => a.role === 'engineer')
    w.game = {
      ...w.game,
      deliveries: [{
        id: 'box-1', kitId: 'mini_drone', hallId: 'hall-1', slotIndex: 0,
        readyAt: T0 - 1, status: DeliveryStatus.CARRYING, carriedBy: eng.id,
      }],
    }
    const jobs = deriveJobs(w)
    expect(jobs.filter(j => j.type === 'haul_delivery')).toHaveLength(0)
    expect(jobs.filter(j => j.type === 'research')).toHaveLength(1)
  })

  it('інженер доносить надлишкову коробку до стенду сам', () => {
    const w = factory()
    dispatch(w, 'hireWorker', { role: 'engineer', hallId: 'lab-1' })
    fillBenches(w)
    waitingBox(w, 'hall-1')
    run(w, 60_000)
    expect(researchPoints(w.game)).toBeGreaterThan(0)
    expect(w.game.deliveries).toHaveLength(0)
  })
})

describe('К2.3 — Mk двома шляхами', () => {
  const mini = 'mini_drone'
  const shop = (extra = {}) => ({
    ...createState(), money: 1e6, locationId: 'factory',
    unlockedHalls: WITH_LAB, ...extra,
  })

  it('норма збірок лишається — без неї і без очок Mk не беруть', () => {
    const s = shop()
    expect(markBuildProgress(s, mini).need).toBe(MK_BUILD_REQ[0])
    expect(canUpgradeMark(s, mini).can).toBe(false)
    expect(canUpgradeMark(s, mini).reasons.join(' ')).toMatch(/очок дослідження/)
  })

  it('очки відкривають той самий Mk і списуються рівно раз', () => {
    const s = shop({ researchPoints: RESEARCH_MARK_COST[0] })
    const check = canUpgradeMark(s, mini)
    expect(check.can).toBe(true)
    expect(check.research).toBe(RESEARCH_MARK_COST[0])

    const after = upgradeMark(s, mini)
    expect(after.kitMarks[mini]).toBe(1)
    expect(researchPoints(after)).toBe(0)
  })

  it('норма, закрита збірками, не коштує жодного очка', () => {
    const s = shop({
      researchPoints: 50,
      stats: { ...createState().stats, assembledByKit: { [mini]: MK_BUILD_REQ[0] } },
    })
    expect(markResearchCost(s, mini)).toBe(null)
    expect(researchPoints(upgradeMark(s, mini))).toBe(50)
  })
})

describe('К2 — інженер не в виробничій петлі', () => {
  it('LOOP_ROLES — це чотири ролі циклу, без інженера', () => {
    expect(LOOP_ROLES).toEqual(['courier', 'tech', 'seller', 'manager'])
    expect(ROLE_ORDER).toContain('engineer')
  })

  it('нічна зміна працює без інженера', () => {
    const staffed = {
      ...createState(),
      workers: LOOP_ROLES.map((role, i) => ({ id: `w${i}`, role, level: 0, hiredAt: 0 })),
    }
    expect(shopRunsItself(staffed)).toBe(true)
  })
})

// ── К3 — відділ контрактів ────────────────────────────────

import {
  contractsOf, contractStanding, creditShipment, expireContracts, refillContracts,
  activeContractFor,
} from '../state/contracts.js'
import { CONTRACT_SLOTS, CONTRACT_REP_PENALTY, CONTRACT_REP_REWARD } from '../state/config.js'
import { EV } from './events.js'

const WITH_DESK = [...WITH_LAB, 'contracts-1']

describe('К3 — контракти', () => {
  it('кімната приносить стіл, і портфель наповнюється сам', () => {
    const w = factory(WITH_DESK)
    expect(w.zones.filter(z => z.kind === 'contracts')).toHaveLength(1)
    run(w, 200)
    expect(contractsOf(w.game)).toHaveLength(CONTRACT_SLOTS)
    for (const c of contractsOf(w.game)) {
      expect(c.qty).toBeGreaterThan(0)
      expect(c.dueAt).toBeGreaterThan(w.now)
      expect(c.bonus).toBeGreaterThan(0)
    }
  })

  it('без кімнати контрактів немає взагалі', () => {
    const w = factory(WITH_LAB)
    run(w, 200)
    expect(contractsOf(w.game)).toHaveLength(0)
  })

  it('контракт просить лише те, що цех уміє зараз', () => {
    const w = factory(WITH_DESK)
    run(w, 200)
    const catalogue = new Set(['mini_drone', 'racing_drone', 'cinematic_drone', 'longrange_drone'])
    for (const c of contractsOf(w.game)) expect(catalogue.has(c.kitId)).toBe(true)
  })

  // К3.3 — виконання це відвантаження, а не окрема дія.
  it('відвантажений дрон зараховується сам; остання штука платить премію', () => {
    const base = { ...createState(), money: 0, contracts: [
      { id: 'c1', kitId: 'mini_drone', qty: 2, done: 0, dueAt: T0 + 1e6, bonus: 400 },
    ] }

    const one = creditShipment(base, 'mini_drone')
    expect(one.completed).toBe(false)
    expect(one.state.money).toBe(0)
    expect(activeContractFor(one.state, 'mini_drone').done).toBe(1)

    const two = creditShipment(one.state, 'mini_drone')
    expect(two.completed).toBe(true)
    expect(two.state.money).toBe(400)
    expect(two.state.contractRep).toBe(CONTRACT_REP_REWARD)
    expect(contractsOf(two.state)).toHaveLength(0)
  })

  it('дрон не того типу нічого не закриває', () => {
    const base = { ...createState(), contracts: [
      { id: 'c1', kitId: 'racing_drone', qty: 1, done: 0, dueAt: T0 + 1e6, bonus: 400 },
    ] }
    const r = creditShipment(base, 'mini_drone')
    expect(r.contract).toBe(null)
    expect(contractsOf(r.state)[0].done).toBe(0)
  })

  // К3.4 — штраф м'який: репутація, і жодного долара.
  it('прострочений контракт коштує репутації, а не грошей', () => {
    const base = { ...createState(), money: 1000, contractRep: 3, contracts: [
      { id: 'c1', kitId: 'mini_drone', qty: 5, done: 1, dueAt: T0 - 1, bonus: 400 },
    ] }
    const { state, failed } = expireContracts(base, T0)
    expect(failed).toHaveLength(1)
    expect(state.money).toBe(1000)
    expect(state.contractRep).toBe(3 - CONTRACT_REP_PENALTY)
    expect(contractsOf(state)).toHaveLength(0)
  })

  it('репутація не падає нижче нуля — контракти не стають гіршими за стартові', () => {
    const broke = { ...createState(), contractRep: -99 }
    expect(contractStanding(broke)).toBe(0)
  })

  it('репутація визначає РОЗМІР партії — трек нарешті щось означає', () => {
    const roll = (state) => refillContracts(
      { ...state, contracts: [] },
      { kitIds: ['mini_drone'], now: T0, rng: () => 0.5, makeId: (() => { let n = 0; return () => `c${n++}` })() },
    )
    const base   = createState()
    const famous = { ...base, upgrades: { ...base.upgrades, reputationLevel: 10 } }
    expect(roll(famous).contracts[0].qty).toBeGreaterThan(roll(base).contracts[0].qty)
    expect(roll(famous).contracts[0].bonus).toBeGreaterThan(roll(base).contracts[0].bonus)
  })

  // Той самий шлях, але через справжню скриньку: К3.3 живе у взаємодії, і
  // саме там він може розійтись із `creditShipment`.
  it('шлях через скриньку справді зараховує — жодної нової дії', () => {
    const w = factory(WITH_DESK)
    run(w, 200)
    const kitId = 'mini_drone'
    w.game = {
      ...w.game,
      money: 0,
      contracts: [{ id: 'c1', kitId, qty: 1, done: 0, dueAt: w.now + 1e6, bonus: 500 }],
      stations: w.game.stations.map((s, i) => i === 0
        ? { ...s, phase: Phase.READY, kitId, quality: 0.9, takenBy: 'player' }
        : s),
    }
    const player = w.agents.find(a => a.kind === 'player')
    player.carrying = [{ type: 'drone', kitId, stationId: w.game.stations[0].id }]
    const box = w.zones.find(z => z.kind === 'mailbox' && z.meta?.hallId === 'hall-1')
    player.x = box.cx; player.y = box.cy

    const events = run(w, 4000)
    expect(events.filter(e => e.t === EV.CONTRACT_FILLED)).toHaveLength(1)
    // Премія ЗВЕРХУ до звичайної ціни, а не замість неї.
    expect(w.game.money).toBeGreaterThan(500)
  })

  it('провал видно подією — репутація не просідає мовчки', () => {
    const w = factory(WITH_DESK)
    run(w, 200)
    w.game = {
      ...w.game,
      contracts: contractsOf(w.game).map(c => ({ ...c, dueAt: w.now - 1 })),
    }
    const events = run(w, 200)
    expect(events.filter(e => e.t === EV.CONTRACT_FAILED)).toHaveLength(CONTRACT_SLOTS)
    // Слоти одразу наповнюються знову: портфель не буває порожнім.
    expect(contractsOf(w.game)).toHaveLength(CONTRACT_SLOTS)
  })
})

// ── К4 — майданчик обльоту ────────────────────────────────

import { rejectDrone } from '../state/gameState.js'
import {
  FLIGHT_REJECT_QUALITY, FLIGHT_PRICE_BONUS, FLIGHT_SKIP_REP_PENALTY, FLIGHT_MS,
} from '../state/config.js'
import { deriveJobs as jobsOf } from './systems/job.js'

const WITH_PAD = [...WITH_DESK, 'flight-1']

// Ставить гравця біля скриньки з готовим дроном у руках. `flown` — чи він уже
// пройшов обліт.
function readyDrone(w, { quality = 0.9, flown = false } = {}) {
  const kitId = 'mini_drone'
  w.game = {
    ...w.game,
    money: 0,
    stations: w.game.stations.map((s, i) => i === 0
      ? { ...s, phase: Phase.READY, kitId, quality, takenBy: 'player' }
      : s),
  }
  const player = w.agents.find(a => a.kind === 'player')
  player.carrying = [{ type: 'drone', kitId, stationId: w.game.stations[0].id, ...(flown ? { flown: true } : {}) }]
  return player
}

describe('К4 — обліт', () => {
  it('кімната приносить майданчик, і продавець їде через нього', () => {
    const w = factory(WITH_PAD)
    expect(w.zones.filter(z => z.kind === 'flight_pad')).toHaveLength(1)

    w.game = {
      ...w.game,
      stations: w.game.stations.map((s, i) => i === 0
        ? { ...s, phase: Phase.READY, kitId: 'mini_drone', quality: 0.9 } : s),
    }
    const job = jobsOf(w).find(j => j.id.startsWith('sell_drone:'))
    expect(job.type).toBe('sell_via_flight')
    expect(job.viaZone).toBe(w.zones.find(z => z.kind === 'flight_pad').id)
  })

  it('без кімнати маршрут продажу лишається тим, що був', () => {
    const w = factory(WITH_DESK)
    w.game = {
      ...w.game,
      stations: w.game.stations.map((s, i) => i === 0
        ? { ...s, phase: Phase.READY, kitId: 'mini_drone', quality: 0.9 } : s),
    }
    const job = jobsOf(w).find(j => j.id.startsWith('sell_drone:'))
    expect(job.type).toBe('sell_drone')
    expect(job.viaZone).toBe(null)
  })

  it('обліт ставить на дрон позначку й не чіпає нічого іншого', () => {
    const w = factory(WITH_PAD)
    const player = readyDrone(w, { quality: 0.9 })
    const pad = w.zones.find(z => z.kind === 'flight_pad')
    player.x = pad.cx; player.y = pad.cy

    const events = run(w, FLIGHT_MS + 1500)
    expect(events.filter(e => e.t === EV.FLIGHT_PASSED)).toHaveLength(1)
    expect(player.carrying[0].flown).toBe(true)
    expect(w.game.stations[0].phase).toBe(Phase.READY)
  })

  it('облітаний дрон коштує дорожче', () => {
    const price = (flown) => {
      const w = factory(WITH_PAD)
      const player = readyDrone(w, { quality: 0.9, flown })
      const box = w.zones.find(z => z.kind === 'mailbox' && z.meta?.hallId === 'hall-1')
      player.x = box.cx; player.y = box.cy
      run(w, 4000)
      return w.salesLog.at(-1).price
    }
    expect(price(true)).toBeCloseTo(price(false) * (1 + FLIGHT_PRICE_BONUS), 5)
  })

  // К4.2 — брак ловиться ТУТ, а не в клієнта.
  it('бракований дрон не проходить обліт — іде в утиль, не в продаж', () => {
    const w = factory(WITH_PAD)
    const player = readyDrone(w, { quality: FLIGHT_REJECT_QUALITY - 0.05 })
    const pad = w.zones.find(z => z.kind === 'flight_pad')
    player.x = pad.cx; player.y = pad.cy

    const events = run(w, FLIGHT_MS + 1500)
    expect(events.filter(e => e.t === EV.FLIGHT_REJECTED)).toHaveLength(1)
    expect(player.carrying).toHaveLength(0)
    expect(w.game.stations[0].phase).toBe(Phase.IDLE)
    expect(w.salesLog).toHaveLength(0)
    expect(w.game.money).toBeGreaterThan(0)     // утиль повернувся
  })

  // DoD — обліт можна пропустити: дешевше й ризикованіше.
  it('брак, пронесений повз майданчик, коштує репутації', () => {
    const w = factory(WITH_PAD)
    const player = readyDrone(w, { quality: FLIGHT_REJECT_QUALITY - 0.05 })
    const box = w.zones.find(z => z.kind === 'mailbox' && z.meta?.hallId === 'hall-1')
    player.x = box.cx; player.y = box.cy

    const events = run(w, 4000)
    expect(events.filter(e => e.t === EV.BAD_SHIPPED)).toHaveLength(1)
    expect(w.game.contractRep).toBe(-FLIGHT_SKIP_REP_PENALTY)
    expect(w.salesLog).toHaveLength(1)          // продався, просто дешево
  })

  it('без майданчика брак нічого не коштує — пропускати нема чого', () => {
    const w = factory(WITH_DESK)
    const player = readyDrone(w, { quality: FLIGHT_REJECT_QUALITY - 0.05 })
    const box = w.zones.find(z => z.kind === 'mailbox' && z.meta?.hallId === 'hall-1')
    player.x = box.cx; player.y = box.cy
    const events = run(w, 4000)
    expect(events.filter(e => e.t === EV.BAD_SHIPPED)).toHaveLength(0)
    expect(w.game.contractRep ?? 0).toBe(0)
  })

  it('rejectDrone працює лише з готового дрона', () => {
    const s = createState()
    expect(() => rejectDrone(s, s.stations[0].id, 0.3)).toThrow('rejectDrone')
  })
})

// ── К5 — нові типи входять через кімнату ──────────────────

import { kitsForLocation } from '../state/locations.js'
import { KIT_TYPES } from '../state/kits.js'
import { FACTORY_HALLS, hasHallKind } from '../defs/layouts/factory.js'

describe('К5 — тип потребує кімнати, а не ще двадцяти п\'яти збірок', () => {
  const at = (halls) => ({
    ...createState(), locationId: 'factory', unlockedHalls: halls,
    // Mk-замки тут не про це: вимикаємо їх, щоб питання лишилось одне —
    // кімната.
    kitMarks: { mini_drone: 5, racing_drone: 5 },
  })

  const GATED = [
    ['proto_drone', 'lab', 'lab-1'],
    ['fixedwing_drone', 'flight', 'flight-1'],
    ['heavy_drone', 'storage', 'storage-1'],
  ]

  it.each(GATED)('%s замкнений, поки немає кімнати «%s»', (kitId, kind, hallId) => {
    const before = at(['hall-1', 'hall-2', 'hall-3'])
    expect(hasHallKind(before.unlockedHalls, kind)).toBe(false)
    expect(kitsForLocation(before)).not.toContain(kitId)

    const ids = FACTORY_HALLS.map(h => h.id)
    const after = at(ids.slice(0, ids.indexOf(hallId) + 1))
    expect(hasHallKind(after.unlockedHalls, kind)).toBe(true)
    expect(kitsForLocation(after)).toContain(kitId)
  })

  it('вимога кімнати описана ДАНИМИ — третій ключ поруч із location і room', () => {
    for (const [kitId, kind] of GATED) {
      expect(KIT_TYPES[kitId].unlock).toEqual({ hallKind: kind })
    }
  })

  it('нові типи мають власний спрайт — жоден не позичає чужий силует', () => {
    const keys = GATED.map(([id]) => KIT_TYPES[id].spriteKey)
    expect(new Set(keys).size).toBe(keys.length)
    for (const [id] of GATED) expect(KIT_TYPES[id].spriteKey).not.toBe('mini_drone')
  })

  it('кожен новий тип дорожчий і довший за наявні — це не переспів', () => {
    const old = ['mini_drone', 'racing_drone', 'cinematic_drone', 'longrange_drone']
    const topCost  = Math.max(...old.map(id => KIT_TYPES[id].cost))
    const topSteps = Math.max(...old.map(id => KIT_TYPES[id].assemblySteps.length))
    for (const [id] of GATED) {
      expect(KIT_TYPES[id].cost, id).toBeGreaterThan(0)
      expect(KIT_TYPES[id].assemblySteps.length, id).toBeGreaterThanOrEqual(5)
      expect(KIT_TYPES[id].basePrice, id).toBeGreaterThan(KIT_TYPES[id].cost)
    }
    // Найдорожчий у грі — важкий носій, і він же найдовший у збірці.
    expect(KIT_TYPES.heavy_drone.cost).toBeGreaterThan(topCost)
    expect(KIT_TYPES.heavy_drone.assemblySteps.length).toBeGreaterThanOrEqual(topSteps - 1)
  })

  it('удома кімнатні типи не з\'являються навіть із відкритими цехами в сейві', () => {
    const home = {
      ...createState(), locationId: 'apartment',
      unlockedRooms: ['flat', 'garage'],
      unlockedHalls: FACTORY_HALLS.map(h => h.id),
    }
    for (const [kitId] of GATED) expect(kitsForLocation(home)).not.toContain(kitId)
  })
})

describe('К7 — кімнат скінченна кількість', () => {
  it('їх 5–7, і кожна свого типу', () => {
    expect(FACTORY_HALLS.length).toBeGreaterThanOrEqual(5)
    expect(FACTORY_HALLS.length).toBeLessThanOrEqual(7)
    const kinds = FACTORY_HALLS.map(h => h.kind)
    expect(new Set(kinds.filter(k => k !== 'assembly')).size)
      .toBe(kinds.filter(k => k !== 'assembly').length)
  })

  it('ціна росте від кімнати до кімнати — наступна завжди амбіція', () => {
    for (let i = 1; i < FACTORY_HALLS.length; i++) {
      expect(FACTORY_HALLS[i].cost, FACTORY_HALLS[i].id)
        .toBeGreaterThan(FACTORY_HALLS[i - 1].cost)
    }
  })

  it('кожна кімната після першої сама розповідає, що з нею приїхало (К6)', () => {
    for (const hall of FACTORY_HALLS.slice(1)) {
      expect(hall.unlocks?.length, hall.id).toBeGreaterThan(0)
    }
  })
})
