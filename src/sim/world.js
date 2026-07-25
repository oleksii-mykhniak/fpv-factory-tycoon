// The world — single source of truth for the simulation.
//
// Split in two on purpose:
//   world.game    — the persisted game state (exact shape from state/gameState.js).
//                   All existing pure transitions (orderKit, sell, …) operate on it
//                   unchanged, so their 995 lines of tests keep their meaning.
//   world.<rest>  — runtime bookkeeping the sim needs but the save file does not
//                   (station progress accumulator, worker intent, seen-markers).
//
// Everything here is plain data: no Excalibur, no DOM, no timers. `rng` is the
// single injection point for randomness so headless tests are deterministic.

import { createState, stationsOf, syncStations } from '../state/gameState.js'
import { PLAYER_SPEED, PLAYER_HALF_W, PLAYER_HALF_H } from '../state/config.js'
import { stationDef } from '../defs/stations.js'
import { levelData } from '../state/upgrades.js'
import { rect } from '../defs/layouts/apartment.js'
import { buildGrid } from '../nav/navGrid.js'

// An agent is anything that occupies space and moves under its own velocity.
// C1 has exactly one (the player); C5 adds hired workers with the same shape,
// which is why moveSystem already loops over a list.
export function createAgent({ id, kind, x, y, speed = PLAYER_SPEED }) {
  return {
    id, kind,
    x, y,
    vx: 0, vy: 0,
    halfW: PLAYER_HALF_W,
    halfH: PLAYER_HALF_H,
    speed,
    facing: 1,      // 1 = right, -1 = left
    moving: false,
    // Navigation (C4): set pathTarget and pathSystem fills in `path`.
    pathTarget: null,
    path:       null,
    pathIndex:  0,
    pathFailed: false,
    arrived:    false,
    carrying: [],   // [{ type: 'kit_box' | 'drone' | 'burnt' | 'scrap', kitId?, deliveryId? }]
  }
}

// How many stations this save should have: the `benches` upgrade level, capped
// by the slots the location actually provides.
export function stationCountFor(game, layout) {
  const level = game.upgrades?.benchLevel ?? 0
  const want  = levelData('benches', level)?.count ?? 1
  return Math.min(want, layout?.stationSlots?.length ?? 1)
}

// Rebuilds everything derived from the station list: their footprints (solid),
// their interaction zones, and where the view should draw them. Called at
// startup and whenever a bench is bought — nothing else has to know.
export function rebuildStationGeometry(world) {
  const layout = world.layout
  if (!layout) return world

  const placed = stationsOf(world.game).map((station, i) => {
    const def  = stationDef(station.defId)
    const slot = layout.stationSlots[i] ?? layout.stationSlots[layout.stationSlots.length - 1]
    return {
      id:   station.id,
      def,
      body: rect(slot.x, slot.y, def.size.w, def.size.h),
      zone: {
        id:   `zone-${station.id}`,
        kind: 'bench',
        ...rect(slot.x, slot.y + def.zone.offsetY, def.zone.w, def.zone.h),
        meta: { stationId: station.id },
      },
      // Where a character stands to work, and where items sit on the surface.
      workSpot: { x: slot.x, y: slot.y + def.size.h / 2 + 46 },
      surface:  { x: slot.x, y: slot.y },
    }
  })

  world.placedStations = placed
  world.obstacles = [...layout.obstacles, ...placed.map(p => p.body)]
  world.zones     = [...layout.zones, ...placed.map(p => p.zone)]

  // The nav grid is a rasterisation of exactly these obstacles, so it is
  // rebuilt here and nowhere else — a station added without a matching grid
  // would let workers path straight through it (C4).
  world.navGrid   = buildGrid(world.bounds, world.obstacles)
  world.pathCache = new Map()
  return world
}

export function createWorld({ state, salesLog = [] } = {}, { now = Date.now(), rng = Math.random, layout = null } = {}) {
  const game = layout
    ? syncStations(state ?? createState(), stationCountFor(state ?? createState(), layout))
    : (state ?? createState())

  const world = {
    // ── Persisted ──────────────────────────────────────────
    game,
    salesLog,

    // ── Space (C1) ─────────────────────────────────────────
    // Fixed world units from the location's layout. `obstacles` is what
    // moveSystem collides against and what C4 will rasterise into a nav grid.
    layout,
    bounds:    layout ? { w: layout.world.w, h: layout.world.h } : null,
    obstacles: layout?.obstacles ?? [],
    agents:    layout ? [createAgent({ id: 'player', kind: 'player', ...layout.spawns.player })] : [],

    // Trigger zones (C2): the layout's fixed ones plus one per built station
    // (C3), filled in by rebuildStationGeometry below. `triggers` is the
    // hand-off from zoneSystem to interactionSystem.
    zones:          layout?.zones ?? [],
    placedStations: [],
    zoneState:      {},
    triggers:       [],

    // Movement vector published by the view each frame (already deadzoned).
    input: { x: 0, y: 0 },

    // Navigation (C4): grid rasterised from `obstacles`, plus a route cache.
    navGrid:   null,
    pathCache: new Map(),

    // ── Simulated clock ────────────────────────────────────
    // Authoritative "now" for the sim. Advanced by loop.advance(); every
    // timestamp comparison in a system reads this, never Date.now().
    now,

    // ── Station runtime (replaces main.js autoTimer) ───────
    // armed: the bench should be working. AUTO arms itself; SEMI is armed by
    // the player's solder command; MANUAL never arms (mini-game drives it).
    station: {
      armed:       false,
      running:     false,
      elapsedMs:   0,
      durationMs:  0,
    },

    // ── Worker intent (replaces the command calls in draw()) ──
    // The view reads `desired` every frame and drives the puppet idempotently.
    // C5 replaces this with a real AI agent; the view contract stays the same.
    worker: {
      desired:     null,   // null | 'haul' | 'solder' | 'scrap'
      targetSlotIndex: 0,
    },

    // Monotonic counter behind entity ids. Deterministic (unlike Math.random)
    // and collision-free within a session; ids also carry `now`, so they stay
    // unique across reloads.
    seq: 0,

    // ── One-shot markers ───────────────────────────────────
    // Delivery ids already announced as arrived, so the event fires once.
    announcedArrivals: [],

    // ── Non-serialised ─────────────────────────────────────
    rng,
  }

  return layout ? rebuildStationGeometry(world) : world
}

// What goes to save/storage.js — deliberately only the persisted slice.
export function serializeWorld(world) {
  return { state: world.game, salesLog: world.salesLog }
}
