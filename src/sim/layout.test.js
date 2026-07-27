import { describe, it, expect } from 'vitest'
import { createWorld, applyLayout } from './world.js'
import { dispatch } from './commands.js'
import { layoutFor } from '../defs/layouts/index.js'
import { createState } from '../state/gameState.js'

const boot = (locationId = 'apartment', extra = {}) => {
  const base = createState()
  const state = { ...base, money: 20000, locationId, ...extra }
  return createWorld({ state, salesLog: [] },
    { now: 1e6, rng: () => 0.5, layout: layoutFor(locationId, state) })
}

// Every floor plan the game can be in: home with and without its garage (П2),
// the factory with one hall and with all three (F2).
const GARAGE = { unlockedRooms: ['flat', 'garage'] }
const homes  = () => [layoutFor('apartment'), layoutFor('apartment', GARAGE)]
const plans  = () => [
  ...homes(),
  layoutFor('factory'),
  layoutFor('factory', { unlockedHalls: ['hall-1', 'hall-2', 'hall-3'] }),
]

describe('C7 — locations are floor plans, not palettes', () => {
  it('each floor plan is a different sized room with its own bench slots', () => {
    const [flat, withGarage] = homes()
    expect(new Set([flat, withGarage, layoutFor('factory')].map(l => l.world.w)).size).toBe(3)
    // The flat starts with one bench; the garage brings the second with it (П2).
    expect(flat.stationSlots).toHaveLength(1)
    expect(withGarage.stationSlots).toHaveLength(2)
    expect(withGarage.world.w).toBeGreaterThan(flat.world.w)
    // The factory opens with one hall; the rest are bought (F2).
    expect(layoutFor('factory').stationSlots).toHaveLength(2)
  })

  it('the garage brings its own door, its bench and the job board', () => {
    const [flat, withGarage] = homes()
    // Hiring is a thing that exists in the garage, so the board is too.
    expect(flat.zones.some(z => z.kind === 'jobboard')).toBe(false)
    expect(withGarage.zones.filter(z => z.kind === 'jobboard')).toHaveLength(1)
    // Two holes in the FRONT wall now — the front door and the garage door —
    // plus the doorway between the flat and the garage inside.
    const onFrontWall = (l) => l.doorVoids.filter(v => Math.abs(v.cy - l.door.y) < 40).length
    expect(onFrontWall(flat)).toBe(1)
    expect(onFrontWall(withGarage)).toBe(2)
    expect(withGarage.doorVoids.length).toBe(flat.doorVoids.length + 2)
  })

  it('every layout leaves a doorway a character can actually fit through', () => {
    for (const layout of plans()) {
      expect(layout.door.w).toBeGreaterThan(80)   // agent is 40 wide
    }
  })

  it('every layout puts its props inside its own world', () => {
    for (const layout of plans()) {
      for (const [name, p] of Object.entries(layout.props)) {
        expect(p.cx, `${layout.id}.${name}.x`).toBeGreaterThan(0)
        expect(p.cx, `${layout.id}.${name}.x`).toBeLessThan(layout.world.w)
        expect(p.cy, `${layout.id}.${name}.y`).toBeLessThan(layout.world.h)
      }
    }
  })

  it('applyLayout rebuilds obstacles, zones and the nav grid', () => {
    const w = boot('apartment')
    const before = { obstacles: w.obstacles.length, cols: w.navGrid.cols }

    applyLayout(w, layoutFor('factory'))

    expect(w.bounds.w).toBe(layoutFor('factory').world.w)
    expect(w.navGrid.cols).toBeGreaterThan(before.cols)
    expect(w.zones.some(z => z.kind === 'mailbox')).toBe(true)
  })

  it('a move puts everyone in the new room, not at old coordinates', () => {
    const w = boot('apartment', GARAGE)   // hiring starts with the garage
    dispatch(w, 'hireWorker', { role: 'courier' })
    applyLayout(w, layoutFor('factory'))

    for (const a of w.agents) {
      expect(a.x).toBeLessThan(layoutFor('factory').world.w)
      expect(a.y).toBeLessThan(layoutFor('factory').world.h)
      expect(a.path).toBeNull()
      expect(a.task).toBeNull()
    }
  })

  it('moving to the factory builds the first hall\'s benches', () => {
    const w = boot('apartment', {
      ...GARAGE,
      upgrades: { ...createState().upgrades, solderingLevel: 3, consumablesLevel: 2, benchLevel: 2 },
    })
    // Home holds two benches even though level 2 was bought.
    expect(w.game.stations).toHaveLength(2)

    dispatch(w, 'moveToLocation', { locationId: 'factory' })
    expect(w.game.locationId).toBe('factory')
    // The hall comes with its benches — the `benches` track no longer decides.
    expect(w.game.stations).toHaveLength(2)
    expect(w.zones.filter(z => z.kind === 'bench')).toHaveLength(2)
  })

  it('opening a hall widens the world and brings its benches with it', () => {
    const w = boot('factory', {
      money: 20000,
      upgrades: { ...createState().upgrades, solderingLevel: 3, consumablesLevel: 2 },
    })
    const before = { w: w.bounds.w, stations: w.game.stations.length, grid: w.navGrid.cols }

    // Every open hall has to be staffed before the next one opens.
    for (const role of ['courier', 'tech', 'seller', 'manager']) {
      dispatch(w, 'hireWorker', { role })
    }
    dispatch(w, 'unlockHall', { hallId: 'hall-2' })

    expect(w.game.unlockedHalls).toEqual(['hall-1', 'hall-2'])
    expect(w.bounds.w).toBeGreaterThan(before.w)
    expect(w.game.stations.length).toBeGreaterThan(before.stations)
    expect(w.navGrid.cols).toBeGreaterThan(before.grid)
    expect(w.zones.filter(z => z.kind === 'bench')).toHaveLength(w.game.stations.length)
  })

  it('a hall will not open while the open ones are short-staffed', () => {
    const w = boot('factory', { money: 20000 })
    expect(() => dispatch(w, 'unlockHall', { hallId: 'hall-2' })).toThrow('укомплектуйте')
  })

  it('halls open in order, never skipping one', () => {
    const w = boot('factory', { money: 99999 })
    expect(() => dispatch(w, 'unlockHall', { hallId: 'hall-3' })).toThrow('по черзі')
  })

  // Found the hard way in F4: the factory's job board sat close enough to the
  // upgrade rack that their zones overlapped, so walking up to the rack opened
  // the hiring panel on top of it — indistinguishable from a broken button.
  it('no two panel zones overlap — one spot, one panel', () => {
    const PANELS = ['desk', 'rack', 'jobboard']
    for (const layout of plans()) {
      const panels = layout.zones.filter(z => PANELS.includes(z.kind))
      for (let i = 0; i < panels.length; i++) {
        for (let j = i + 1; j < panels.length; j++) {
          const a = panels[i], b = panels[j]
          const overlaps =
            Math.abs(a.cx - b.cx) < (a.w + b.w) / 2 &&
            Math.abs(a.cy - b.cy) < (a.h + b.h) / 2
          expect(overlaps, `${layout.id}: ${a.id} ↔ ${b.id}`).toBe(false)
        }
      }
    }
  })

  it('no station footprint blocks its own interaction zone', () => {
    for (const [id, extra] of [['apartment', {}], ['apartment', GARAGE], ['factory', {}]]) {
      const w = boot(id, { ...extra, upgrades: { ...createState().upgrades, benchLevel: 2 } })
      for (const placed of w.placedStations) {
        const overlaps =
          Math.abs(placed.zone.cx - placed.body.cx) < (placed.zone.w + placed.body.w) / 2 &&
          Math.abs(placed.zone.cy - placed.body.cy) < (placed.zone.h + placed.body.h) / 2
        expect(overlaps, `${id}: zone overlaps its own bench`).toBe(false)
      }
    }
  })
})
