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
