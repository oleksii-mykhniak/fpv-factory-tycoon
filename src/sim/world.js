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

import { createState } from '../state/gameState.js'

export function createWorld({ state, salesLog = [] } = {}, { now = Date.now(), rng = Math.random } = {}) {
  return {
    // ── Persisted ──────────────────────────────────────────
    game:     state ?? createState(),
    salesLog,

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
}

// What goes to save/storage.js — deliberately only the persisted slice.
export function serializeWorld(world) {
  return { state: world.game, salesLog: world.salesLog }
}
