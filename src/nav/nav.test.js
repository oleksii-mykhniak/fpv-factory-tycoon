import { describe, it, expect } from 'vitest'
import { buildGrid, isWalkable, worldToCell, cellToWorld, nearestWalkable, lineOfSight } from './navGrid.js'
import { findPath, smoothPath } from './astar.js'
import { rect } from '../defs/layouts/apartment.js'

// A plain 480×480 room, 20×20 cells at the default size, no inflation unless a
// test asks for it — inflation is verified separately.
const bounds = { w: 480, h: 480 }
const grid = (obstacles = [], opts = {}) => buildGrid(bounds, obstacles, { inflate: 0, ...opts })

const cell = (cx, cy) => ({ cx, cy })
const pathLen = (p) => (p ? p.length : -1)

describe('nav/navGrid', () => {
  it('an empty room is entirely walkable', () => {
    const g = grid()
    expect(g.cols).toBe(20)
    expect(g.rows).toBe(20)
    expect(isWalkable(g, 0, 0)).toBe(true)
    expect(isWalkable(g, 19, 19)).toBe(true)
  })

  it('treats everything outside the grid as blocked', () => {
    const g = grid()
    expect(isWalkable(g, -1, 0)).toBe(false)
    expect(isWalkable(g, 20, 0)).toBe(false)
  })

  it('rasterises an obstacle into the cells it covers', () => {
    // Centre (120,120), 48×48 → world 96..144 → cells 4..5 on both axes.
    const g = grid([rect(120, 120, 48, 48)])
    expect(isWalkable(g, 4, 4)).toBe(false)
    expect(isWalkable(g, 5, 5)).toBe(false)
    expect(isWalkable(g, 3, 4)).toBe(true)
    expect(isWalkable(g, 6, 4)).toBe(true)
  })

  it('inflation grows an obstacle by the agent half-extent', () => {
    const box = rect(120, 120, 48, 48)
    const tight = buildGrid(bounds, [box], { inflate: 0 })
    const fat   = buildGrid(bounds, [box], { inflate: 24 })
    expect(isWalkable(tight, 3, 4)).toBe(true)
    expect(isWalkable(fat, 3, 4)).toBe(false)   // one cell of clearance eaten
  })

  it('maps world ↔ cell consistently', () => {
    const g = grid()
    const c = worldToCell(g, 100, 200)
    const w = cellToWorld(g, c.cx, c.cy)
    expect(worldToCell(g, w.x, w.y)).toEqual(c)
  })

  it('clamps world coordinates outside the room into the grid', () => {
    const g = grid()
    expect(worldToCell(g, -50, 9999)).toEqual({ cx: 0, cy: 19 })
  })

  it('finds the nearest free cell when the target sits inside geometry', () => {
    // This is the real case: a work spot pressed right against a bench.
    const g = grid([rect(240, 240, 96, 96)])
    const found = nearestWalkable(g, 240, 240)
    expect(found).not.toBeNull()
    expect(isWalkable(g, found.cx, found.cy)).toBe(true)
  })

  it('gives up rather than searching the whole grid', () => {
    const g = grid([rect(240, 240, 480, 480)])   // everything blocked
    expect(nearestWalkable(g, 240, 240, 2)).toBeNull()
  })
})

describe('nav/lineOfSight', () => {
  it('sees straight across an empty room', () => {
    expect(lineOfSight(grid(), cell(0, 0), cell(19, 19))).toBe(true)
  })

  it('is blocked by a wall in between', () => {
    const g = grid([rect(240, 240, 24, 480)])   // vertical wall, column 10
    expect(lineOfSight(g, cell(2, 10), cell(18, 10))).toBe(false)
  })

  it('refuses to slip diagonally between two touching corners', () => {
    // Blocks at (5,4) and (4,5) leave a corner-to-corner gap that a body cannot
    // actually pass through.
    const g = grid([rect(5 * 24 + 12, 4 * 24 + 12, 24, 24), rect(4 * 24 + 12, 5 * 24 + 12, 24, 24)])
    expect(lineOfSight(g, cell(4, 4), cell(5, 5))).toBe(false)
  })
})

describe('nav/astar', () => {
  it('walks a straight line across an empty room', () => {
    const g = grid()
    const p = findPath(g, cell(1, 1), cell(1, 10))
    expect(p[0]).toEqual(cell(1, 1))
    expect(p[p.length - 1]).toEqual(cell(1, 10))
    expect(pathLen(p)).toBe(10)   // no detours
  })

  it('routes around a wall through the gap', () => {
    // Wall across the middle with a hole at row 10, columns 8..11.
    const g = grid([
      rect(4 * 24, 10 * 24 + 12, 8 * 24, 24),
      rect(16 * 24, 10 * 24 + 12, 8 * 24, 24),
    ])
    const p = findPath(g, cell(2, 2), cell(2, 18))
    expect(p).not.toBeNull()
    // Must pass through the gap rather than teleport across the wall.
    expect(p.some(c => c.cy === 10 && c.cx >= 8 && c.cx <= 11)).toBe(true)
  })

  it('returns null when the goal is walled off', () => {
    const g = grid([rect(240, 10 * 24 + 12, 480, 24)])   // unbroken wall
    expect(findPath(g, cell(2, 2), cell(2, 18))).toBeNull()
  })

  it('returns null instead of freezing when the budget runs out', () => {
    const g = grid()
    expect(findPath(g, cell(0, 0), cell(19, 19), { maxNodes: 3 })).toBeNull()
  })

  it('refuses a start or goal inside an obstacle', () => {
    const g = grid([rect(120, 120, 48, 48)])
    expect(findPath(g, cell(4, 4), cell(10, 10))).toBeNull()
    expect(findPath(g, cell(10, 10), cell(4, 4))).toBeNull()
  })

  it('handles start === goal', () => {
    expect(findPath(grid(), cell(3, 3), cell(3, 3))).toEqual([cell(3, 3)])
  })

  it('is deterministic — identical input, identical path', () => {
    const g = grid([rect(240, 240, 120, 120)])
    const a = findPath(g, cell(1, 1), cell(18, 18))
    const b = findPath(g, cell(1, 1), cell(18, 18))
    expect(a).toEqual(b)
  })

  it('never cuts the corner of an obstacle', () => {
    const g = grid([rect(240, 240, 96, 96)])   // cells 8..11
    const p = findPath(g, cell(6, 6), cell(13, 13))
    for (const c of p) expect(isWalkable(g, c.cx, c.cy)).toBe(true)
    // Every consecutive pair must be a legal step with both orthogonals clear.
    for (let i = 1; i < p.length; i++) {
      const dx = p[i].cx - p[i - 1].cx
      const dy = p[i].cy - p[i - 1].cy
      if (dx !== 0 && dy !== 0) {
        expect(isWalkable(g, p[i - 1].cx + dx, p[i - 1].cy)).toBe(true)
        expect(isWalkable(g, p[i - 1].cx, p[i - 1].cy + dy)).toBe(true)
      }
    }
  })
})

describe('nav/smoothPath', () => {
  it('collapses a straight run to its endpoints', () => {
    const g = grid()
    const raw = findPath(g, cell(1, 1), cell(1, 10))
    expect(smoothPath(g, raw)).toHaveLength(2)
  })

  it('keeps the corners it actually needs', () => {
    const g = grid([
      rect(4 * 24, 10 * 24 + 12, 8 * 24, 24),
      rect(16 * 24, 10 * 24 + 12, 8 * 24, 24),
    ])
    const raw    = findPath(g, cell(2, 2), cell(2, 18))
    const smooth = smoothPath(g, raw)
    expect(smooth.length).toBeLessThan(raw.length)
    expect(smooth.length).toBeGreaterThan(2)   // it has to bend around the wall
  })

  it('never smooths a segment through a wall', () => {
    const g = grid([
      rect(4 * 24, 10 * 24 + 12, 8 * 24, 24),
      rect(16 * 24, 10 * 24 + 12, 8 * 24, 24),
    ])
    const smooth = smoothPath(g, findPath(g, cell(2, 2), cell(2, 18)))
    for (let i = 1; i < smooth.length; i++) {
      expect(lineOfSight(g, smooth[i - 1], smooth[i])).toBe(true)
    }
  })

  it('leaves short paths alone', () => {
    expect(smoothPath(grid(), [cell(1, 1), cell(1, 2)])).toHaveLength(2)
  })
})
