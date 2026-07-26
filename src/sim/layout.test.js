import { describe, it, expect } from 'vitest'
import { createWorld, applyLayout } from './world.js'
import { dispatch } from './commands.js'
import { LAYOUTS, layoutFor } from '../defs/layouts/index.js'
import { createState } from '../state/gameState.js'

const boot = (locationId = 'apartment', extra = {}) => {
  const base = createState()
  const state = { ...base, money: 20000, locationId, ...extra }
  return createWorld({ state, salesLog: [] }, { now: 1e6, rng: () => 0.5, layout: layoutFor(locationId) })
}

describe('C7 — locations are floor plans, not palettes', () => {
  it('each location is a different sized room with its own bench slots', () => {
    const sizes = Object.values(LAYOUTS).map(l => l.world.w)
    expect(new Set(sizes).size).toBe(3)
    expect(LAYOUTS.apartment.stationSlots).toHaveLength(1)
    expect(LAYOUTS.garage.stationSlots).toHaveLength(2)
    expect(LAYOUTS.factory.stationSlots).toHaveLength(3)
  })

  it('every layout leaves a doorway a character can actually fit through', () => {
    for (const layout of Object.values(LAYOUTS)) {
      expect(layout.door.w).toBeGreaterThan(80)   // agent is 40 wide
    }
  })

  it('every layout puts its props inside its own world', () => {
    for (const layout of Object.values(LAYOUTS)) {
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

    applyLayout(w, LAYOUTS.factory)

    expect(w.bounds.w).toBe(LAYOUTS.factory.world.w)
    expect(w.navGrid.cols).toBeGreaterThan(before.cols)
    expect(w.zones.some(z => z.kind === 'mailbox')).toBe(true)
  })

  it('a move puts everyone in the new room, not at old coordinates', () => {
    const w = boot('garage')   // hiring starts at the second location
    dispatch(w, 'hireWorker', { role: 'courier' })
    applyLayout(w, LAYOUTS.factory)

    for (const a of w.agents) {
      expect(a.x).toBeLessThan(LAYOUTS.factory.world.w)
      expect(a.y).toBeLessThan(LAYOUTS.factory.world.h)
      expect(a.path).toBeNull()
      expect(a.task).toBeNull()
    }
  })

  it('moving to the factory builds the benches already paid for', () => {
    const w = boot('garage', {
      upgrades: { ...createState().upgrades, solderingLevel: 3, consumablesLevel: 2, benchLevel: 2 },
    })
    // The garage caps benches at 2 slots even though level 2 was bought.
    expect(w.game.stations).toHaveLength(2)

    dispatch(w, 'moveToLocation', { locationId: 'factory' })
    expect(w.game.locationId).toBe('factory')
    expect(w.game.stations).toHaveLength(3)
    expect(w.zones.filter(z => z.kind === 'bench')).toHaveLength(3)
  })

  it('no station footprint blocks its own interaction zone', () => {
    for (const id of Object.keys(LAYOUTS)) {
      const w = boot(id, { upgrades: { ...createState().upgrades, benchLevel: 2 } })
      for (const placed of w.placedStations) {
        const overlaps =
          Math.abs(placed.zone.cx - placed.body.cx) < (placed.zone.w + placed.body.w) / 2 &&
          Math.abs(placed.zone.cy - placed.body.cy) < (placed.zone.h + placed.body.h) / 2
        expect(overlaps, `${id}: zone overlaps its own bench`).toBe(false)
      }
    }
  })
})
