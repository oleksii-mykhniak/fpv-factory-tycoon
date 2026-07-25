// Navigation grid — the world's solid geometry, rasterised.
//
// Pure: no Excalibur, no DOM. Built once per layout (and again whenever a
// station is added, since a new bench is a new obstacle).
//
// Obstacles are INFLATED before rasterising. A* plans for a point, but a
// character is ~40 units wide; without inflation every path would hug corners
// and the collision resolver would grind the agent along the wall for the whole
// journey. Growing the obstacles instead means a point-path is safe for a body.

import { NAV_CELL, NAV_INFLATE } from '../state/config.js'

const BLOCKED = 1

export function buildGrid(bounds, obstacles = [], { cell = NAV_CELL, inflate = NAV_INFLATE } = {}) {
  const cols = Math.ceil(bounds.w / cell)
  const rows = Math.ceil(bounds.h / cell)
  const data = new Uint8Array(cols * rows)

  for (const box of obstacles) {
    // Rect corners in world space, grown by the agent's half-extent.
    const left   = box.x - inflate
    const top    = box.y - inflate
    const right  = box.x + box.w + inflate
    const bottom = box.y + box.h + inflate

    const c0 = Math.max(0, Math.floor(left / cell))
    const r0 = Math.max(0, Math.floor(top / cell))
    const c1 = Math.min(cols - 1, Math.floor((right - 1e-6) / cell))
    const r1 = Math.min(rows - 1, Math.floor((bottom - 1e-6) / cell))

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) data[r * cols + c] = BLOCKED
    }
  }

  return { cols, rows, cell, data }
}

export function isWalkable(grid, cx, cy) {
  if (cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows) return false
  return grid.data[cy * grid.cols + cx] !== BLOCKED
}

export function worldToCell(grid, x, y) {
  return {
    cx: Math.min(grid.cols - 1, Math.max(0, Math.floor(x / grid.cell))),
    cy: Math.min(grid.rows - 1, Math.max(0, Math.floor(y / grid.cell))),
  }
}

// Centre of a cell — waypoints sit in the middle, never on an edge.
export function cellToWorld(grid, cx, cy) {
  return { x: (cx + 0.5) * grid.cell, y: (cy + 0.5) * grid.cell }
}

// The nearest walkable cell to a point, searched in rings.
//
// Needed because legitimate targets often sit inside inflated geometry: the
// spot where a character stands to work a bench is right up against it, so its
// own cell reads as blocked. Without this, every such request would fail.
export function nearestWalkable(grid, x, y, maxRings = 6) {
  const { cx, cy } = worldToCell(grid, x, y)
  if (isWalkable(grid, cx, cy)) return { cx, cy }

  for (let r = 1; r <= maxRings; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        // Ring only — the interior was covered by a smaller r.
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        if (isWalkable(grid, cx + dx, cy + dy)) return { cx: cx + dx, cy: cy + dy }
      }
    }
  }
  return null
}

// Supercover line test: visits every cell the segment passes through, so a
// diagonal cannot slip between two blocked cells that touch at a corner.
export function lineOfSight(grid, a, b) {
  let x = a.cx, y = a.cy
  let dx = Math.abs(b.cx - a.cx)
  let dy = Math.abs(b.cy - a.cy)
  const xInc = b.cx > a.cx ? 1 : -1
  const yInc = b.cy > a.cy ? 1 : -1
  let n = 1 + dx + dy
  let error = dx - dy
  dx *= 2
  dy *= 2

  for (; n > 0; n--) {
    if (!isWalkable(grid, x, y)) return false
    // Reaching the far end ends the walk. Without this a perfect diagonal runs
    // the corner check one step past the target and reads out of bounds.
    if (x === b.cx && y === b.cy) return true
    if (error > 0) {
      x += xInc
      error -= dy
    } else if (error < 0) {
      y += yInc
      error += dx
    } else {
      // Exactly diagonal: refuse to squeeze between two blocked corners.
      if (!isWalkable(grid, x + xInc, y) || !isWalkable(grid, x, y + yInc)) return false
      x += xInc
      y += yInc
      error -= dy
      error += dx
      n--
    }
  }
  return true
}
