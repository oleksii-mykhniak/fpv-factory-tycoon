import { describe, it, expect } from 'vitest'
import { moveSystem } from './move.js'
import { intentSystem } from './intent.js'
import { rect } from '../../defs/layouts/apartment.js'

// Minimal world: one agent, a few boxes, no game state involved.
function world({ x = 100, y = 100, vx = 0, vy = 0, obstacles = [], bounds = null } = {}) {
  return {
    agents: [{ id: 'a', kind: 'player', x, y, vx, vy, halfW: 10, halfH: 10, speed: 100, facing: 1, moving: false }],
    obstacles,
    bounds,
    input: { x: 0, y: 0 },
  }
}
const agent = (w) => w.agents[0]

describe('sim/moveSystem', () => {
  it('integrates velocity in units per second', () => {
    const w = world({ vx: 100 })
    moveSystem(w, 1000)
    expect(agent(w).x).toBeCloseTo(200)
  })

  it('stops against an obstacle instead of passing through it', () => {
    const wall = rect(200, 100, 20, 200)   // spans x 190..210
    const w = world({ x: 100, vx: 500, obstacles: [wall] })
    moveSystem(w, 1000)
    expect(agent(w).x).toBeCloseTo(190 - 10)   // flush against the left face
  })

  it('resolves from the correct side when moving the other way', () => {
    const wall = rect(200, 100, 20, 200)
    const w = world({ x: 300, vx: -500, obstacles: [wall] })
    moveSystem(w, 1000)
    expect(agent(w).x).toBeCloseTo(210 + 10)
  })

  it('slides along a wall instead of sticking on it', () => {
    // Pushing diagonally into a vertical wall should still move on Y.
    const wall = rect(200, 100, 20, 400)
    const w = world({ x: 175, y: 100, vx: 200, vy: 200, obstacles: [wall] })
    moveSystem(w, 1000)
    expect(agent(w).x).toBeCloseTo(180)        // blocked on X
    expect(agent(w).y).toBeCloseTo(300)        // free on Y — this is the slide
  })

  it('fits through a gap wider than the agent', () => {
    // Two wall halves leaving a 60-wide door at x 170..230; agent is 20 wide.
    const left  = rect(85, 100, 170, 20)
    const right = rect(315, 100, 170, 20)
    const w = world({ x: 200, y: 50, vy: 200, obstacles: [left, right] })
    for (let i = 0; i < 10; i++) moveSystem(w, 100)
    expect(agent(w).y).toBeGreaterThan(110)    // made it through the doorway
  })

  it('is blocked by a gap narrower than the agent', () => {
    const left  = rect(95, 100, 190, 20)
    const right = rect(305, 100, 190, 20)   // gap x 190..210 = 20 wide, agent is 20
    const w = world({ x: 205, y: 50, vy: 200, obstacles: [left, right] })
    for (let i = 0; i < 10; i++) moveSystem(w, 100)
    expect(agent(w).y).toBeLessThan(100)
  })

  it('clamps to the world bounds', () => {
    const w = world({ x: 100, vx: -5000, bounds: { w: 1000, h: 1000 } })
    moveSystem(w, 1000)
    expect(agent(w).x).toBe(10)   // halfW
  })

  it('reports moving=false when shoved into a wall', () => {
    const wall = rect(130, 100, 20, 200)
    const w = world({ x: 110, vx: 100, obstacles: [wall] })
    moveSystem(w, 1000)   // first step closes the gap
    moveSystem(w, 1000)   // second step cannot advance at all
    expect(agent(w).moving).toBe(false)
  })

  it('leaves a still agent alone', () => {
    const w = world()
    moveSystem(w, 1000)
    expect(agent(w)).toMatchObject({ x: 100, y: 100, moving: false })
  })
})

describe('sim/intentSystem', () => {
  it('scales the input vector by the agent speed', () => {
    const w = world()
    w.input = { x: 1, y: -0.5 }
    intentSystem(w)
    expect(agent(w).vx).toBe(100)
    expect(agent(w).vy).toBe(-50)
  })

  it('flips facing only on horizontal input', () => {
    const w = world()
    w.input = { x: -1, y: 0 }; intentSystem(w)
    expect(agent(w).facing).toBe(-1)
    w.input = { x: 0, y: 1 }; intentSystem(w)
    expect(agent(w).facing).toBe(-1)   // walking straight down keeps the last facing
  })

  it('ignores agents that are not the player', () => {
    const w = world()
    w.agents[0].kind = 'worker'
    w.input = { x: 1, y: 0 }
    intentSystem(w)
    expect(agent(w).vx).toBe(0)
  })
})
