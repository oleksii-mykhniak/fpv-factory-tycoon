// A* over the navigation grid — 8-directional, octile heuristic.
//
// Pure and deterministic: the same grid and endpoints always produce the same
// path, which is what makes a headless "ten minutes with three workers" test
// meaningful. Ties are broken by insertion order, never by object identity.

import { ASTAR_MAX_NODES } from '../state/config.js'
import { isWalkable, lineOfSight } from './navGrid.js'

const SQRT2 = Math.SQRT2

// Neighbour order is fixed — part of what makes the search deterministic.
const NEIGHBOURS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
]

// Octile: the true cost of moving on a grid where diagonals cost √2. Admissible
// (never overestimates), so A* stays optimal, and far tighter than Euclidean —
// meaning fewer nodes expanded on a phone.
function octile(ax, ay, bx, by) {
  const dx = Math.abs(ax - bx)
  const dy = Math.abs(ay - by)
  return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy)
}

// Binary min-heap. An array + sort would dominate the runtime at this grid size.
class Heap {
  constructor() { this.items = [] }
  get size() { return this.items.length }

  push(node) {
    const a = this.items
    a.push(node)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.less(a[i], a[p])) { [a[i], a[p]] = [a[p], a[i]]; i = p } else break
    }
  }

  pop() {
    const a = this.items
    const top = a[0]
    const last = a.pop()
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let m = i
        if (l < a.length && this.less(a[l], a[m])) m = l
        if (r < a.length && this.less(a[r], a[m])) m = r
        if (m === i) break
        ;[a[i], a[m]] = [a[m], a[i]]
        i = m
      }
    }
    return top
  }

  // Lower f wins; equal f is broken by insertion order so results are stable.
  less(x, y) { return x.f !== y.f ? x.f < y.f : x.seq < y.seq }
}

// Returns an array of {cx, cy} from start to goal (inclusive), or null if the
// goal is unreachable or the search hit its node budget.
export function findPath(grid, start, goal, { maxNodes = ASTAR_MAX_NODES } = {}) {
  if (!isWalkable(grid, start.cx, start.cy)) return null
  if (!isWalkable(grid, goal.cx, goal.cy)) return null
  if (start.cx === goal.cx && start.cy === goal.cy) return [{ ...start }]

  const idx = (cx, cy) => cy * grid.cols + cx
  const gScore = new Map()
  const cameFrom = new Map()
  const closed = new Uint8Array(grid.cols * grid.rows)

  const open = new Heap()
  let seq = 0
  const startIdx = idx(start.cx, start.cy)
  gScore.set(startIdx, 0)
  open.push({ cx: start.cx, cy: start.cy, f: octile(start.cx, start.cy, goal.cx, goal.cy), seq: seq++ })

  let expanded = 0

  while (open.size) {
    const current = open.pop()
    const ci = idx(current.cx, current.cy)
    if (closed[ci]) continue
    closed[ci] = 1

    if (current.cx === goal.cx && current.cy === goal.cy) {
      return reconstruct(cameFrom, ci, grid)
    }

    if (++expanded > maxNodes) return null

    for (const [dx, dy] of NEIGHBOURS) {
      const nx = current.cx + dx
      const ny = current.cy + dy
      if (!isWalkable(grid, nx, ny)) continue

      // No corner cutting: a diagonal step needs both orthogonals clear,
      // otherwise agents clip through the corner of a workbench.
      if (dx !== 0 && dy !== 0) {
        if (!isWalkable(grid, current.cx + dx, current.cy)) continue
        if (!isWalkable(grid, current.cx, current.cy + dy)) continue
      }

      const ni = idx(nx, ny)
      if (closed[ni]) continue

      const step = dx !== 0 && dy !== 0 ? SQRT2 : 1
      const tentative = gScore.get(ci) + step
      if (gScore.has(ni) && tentative >= gScore.get(ni)) continue

      gScore.set(ni, tentative)
      cameFrom.set(ni, ci)
      open.push({ cx: nx, cy: ny, f: tentative + octile(nx, ny, goal.cx, goal.cy), seq: seq++ })
    }
  }

  return null
}

function reconstruct(cameFrom, endIdx, grid) {
  const out = []
  let i = endIdx
  while (i !== undefined) {
    out.push({ cx: i % grid.cols, cy: Math.floor(i / grid.cols) })
    i = cameFrom.get(i)
  }
  return out.reverse()
}

// String pulling: drop every waypoint that can be skipped without crossing a
// blocked cell. Without it agents walk in visible staircases — the grid shows
// through, and it reads as a bug even though the path is correct.
export function smoothPath(grid, cells) {
  if (!cells || cells.length <= 2) return cells
  const out = [cells[0]]
  let anchor = 0

  for (let i = 2; i < cells.length; i++) {
    if (lineOfSight(grid, cells[anchor], cells[i])) continue
    out.push(cells[i - 1])
    anchor = i - 1
  }
  out.push(cells[cells.length - 1])
  return out
}
