import { describe, it, expect } from 'vitest'
import { createWorld, createAgent, rebuildStationGeometry } from '../world.js'
import { advance } from '../loop.js'
import { SYSTEMS } from './index.js'
import { planPath, stopPath } from './path.js'
import { apartment, rect } from '../../defs/layouts/index.js'
import { buildGrid } from '../../nav/navGrid.js'
import { createState, syncStations } from '../../state/gameState.js'
import { TICK_MS, MAX_CATCHUP_STEPS } from '../../state/config.js'

// The real apartment, so these exercise the geometry the game actually ships.
function world({ benchLevel = 0 } = {}) {
  const base = createState()
  const state = {
    ...base,
    money: 5000,
    locationId: 'factory',
    upgrades: { ...base.upgrades, benchLevel },
  }
  return createWorld({ state, salesLog: [] }, { now: 1e6, rng: () => 0.5, layout: apartment })
}

const player = (w) => w.agents.find(a => a.kind === 'player')

function run(w, ms) {
  const target = w.now + ms
  while (target - w.now >= TICK_MS) {
    advance(w, Math.min(target, w.now + TICK_MS * MAX_CATCHUP_STEPS), SYSTEMS)
  }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

// Landmarks come from the floor plan, never from literals — the apartment has
// been resized once already and every hardcoded coordinate went stale with it.
const MAILBOX = { x: apartment.props.mailbox.cx, y: apartment.props.mailbox.cy }

// Does the agent's body overlap any solid geometry right now?
function insideObstacle(w, agent) {
  return (w.obstacles ?? []).some(box =>
    Math.abs(agent.x - box.cx) < agent.halfW + box.w / 2 &&
    Math.abs(agent.y - box.cy) < agent.halfH + box.h / 2
  )
}

describe('sim/pathSystem — routes in the real apartment', () => {
  it('builds a nav grid covering the world', () => {
    const w = world()
    expect(w.navGrid.cols).toBe(Math.ceil(apartment.world.w / w.navGrid.cell))
    expect(w.navGrid.rows).toBe(Math.ceil(apartment.world.h / w.navGrid.cell))
  })

  it('walks from the spawn to the mailbox, out through the door', () => {
    const w = world()
    const p = player(w)
    const goal = MAILBOX

    p.pathTarget = goal
    run(w, 30_000)

    expect(dist(p, goal)).toBeLessThan(40)
    expect(insideObstacle(w, p)).toBe(false)
  })

  it('reaches a work spot pressed against a station', () => {
    // The interesting case: the target cell is inside inflated geometry, so a
    // naive request would fail outright.
    const w = world()
    const p = player(w)
    const spot = w.placedStations[0].workSpot

    p.pathTarget = spot
    run(w, 30_000)

    expect(dist(p, spot)).toBeLessThan(45)
    expect(insideObstacle(w, p)).toBe(false)
  })

  it('goes around a station rather than through it', () => {
    const w = world({ benchLevel: 1 })
    const p = player(w)
    const bench = apartment.stationSlots[0]
    p.x = bench.x; p.y = bench.y + 400        // below the bench
    p.pathTarget = { x: bench.x, y: bench.y - 140 }   // above it

    const touched = []
    for (let i = 0; i < 600; i++) {
      advance(w, w.now + TICK_MS, SYSTEMS)
      touched.push(insideObstacle(w, p))
    }

    expect(dist(p, { x: bench.x, y: bench.y - 140 })).toBeLessThan(60)
    expect(touched.some(Boolean)).toBe(false)
  })

  it('never leaves the agent standing inside a bench it just passed', () => {
    const w = world({ benchLevel: 1 })
    const p = player(w)
    p.pathTarget = { x: 120, y: 120 }
    run(w, 30_000)
    expect(insideObstacle(w, p)).toBe(false)
  })

  it('snaps a target buried in a wall to the nearest spot beside it', () => {
    const w = world()
    const p = player(w)
    p.pathTarget = { x: apartment.world.w / 2, y: 2 }   // dead centre of the top wall
    run(w, 30_000)

    expect(insideObstacle(w, p)).toBe(false)
    expect(p.y).toBeLessThan(160)     // got as close as the wall allows
  })

  it('gives up cleanly when there is genuinely nowhere to go', () => {
    const w = world()
    const p = player(w)
    // Wall the agent in completely: every cell blocked.
    w.navGrid = buildGrid(w.bounds, [rect(w.bounds.w / 2, w.bounds.h / 2, w.bounds.w, w.bounds.h)])
    p.pathTarget = MAILBOX

    expect(planPath(w, p)).toBe(false)
    expect(p.pathFailed).toBe(true)
    expect(p.path).toBeNull()

    // And the sim keeps running rather than retrying forever.
    run(w, 3000)
    expect(p.path).toBeNull()
  })

  it('caches repeated journeys instead of re-searching', () => {
    const w = world()
    const p = player(w)
    p.pathTarget = MAILBOX
    planPath(w, p)
    const size = w.pathCache.size
    expect(size).toBeGreaterThan(0)

    stopPath(p)
    p.pathTarget = MAILBOX
    planPath(w, p)
    expect(w.pathCache.size).toBe(size)   // served from cache
  })

  it('throws the cache away when a station is added', () => {
    const w = world()
    player(w).pathTarget = MAILBOX
    planPath(w, player(w))
    expect(w.pathCache.size).toBeGreaterThan(0)

    w.game = syncStations(w.game, 2)
    rebuildStationGeometry(w)
    expect(w.pathCache.size).toBe(0)
  })
})

describe('sim/moveSystem — crowds', () => {
  function crowd(w, n) {
    for (let i = 0; i < n; i++) {
      const home = apartment.spawns.workerIdle
      w.agents.push(createAgent({ id: `w${i}`, kind: 'worker', x: home.x + i * 6, y: home.y }))
    }
    return w.agents.filter(a => a.kind === 'worker')
  }

  it('five agents heading to the same spot do not end up on top of each other', () => {
    const w = world()
    const workers = crowd(w, 5)
    const goal = MAILBOX
    for (const a of workers) a.pathTarget = goal

    run(w, 40_000)

    // All arrived...
    for (const a of workers) expect(dist(a, goal)).toBeLessThan(90)
    // ...and none is sitting exactly inside another.
    for (let i = 0; i < workers.length; i++) {
      for (let j = i + 1; j < workers.length; j++) {
        expect(dist(workers[i], workers[j])).toBeGreaterThan(6)
      }
    }
  })

  it('agents spawned in the same spot push apart instead of overlapping', () => {
    const w = world()
    const home = apartment.spawns.workerIdle
    const a = createAgent({ id: 'a', kind: 'worker', x: home.x, y: home.y })
    const b = createAgent({ id: 'b', kind: 'worker', x: home.x, y: home.y + 0.1 })
    w.agents.push(a, b)

    run(w, 2000)
    expect(dist(a, b)).toBeGreaterThan(10)
  })

  it('a crowd squeezing through the doorway all gets out', () => {
    const w = world()
    const workers = crowd(w, 4)
    const goal = { x: apartment.door.x, y: apartment.world.h - 120 }   // out into the street
    for (const a of workers) a.pathTarget = goal

    run(w, 60_000)
    for (const a of workers) expect(a.y).toBeGreaterThan(apartment.room.h)
  })
})
