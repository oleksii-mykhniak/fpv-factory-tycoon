// Values derived from the game state that more than one consumer needs.
//
// Kept here so the zone that opens the piggy bank and the actor that draws it
// can never disagree about whether it exists — they were two separate
// expressions before, and one of them was quietly wrong for a month (the
// scrap kit's cost of 0 dragged the minimum kit cost to zero, so the rescue
// mini-game never appeared).

import { KIT_TYPES, busyStations, Phase, stationsOf } from '../state/gameState.js'
import { GUIDANCE_ORDERS, GUIDANCE_SCRAP_RUNS } from '../state/config.js'
import { levelData } from '../state/upgrades.js'

// Cheapest kit the player could actually buy. Free kits (scrap) are not
// purchases and must not count.
export const cheapestKitCost = Math.min(
  ...Object.values(KIT_TYPES).filter(k => k.cost > 0).map(k => k.cost)
)

// The piggy bank is a rescue: it shows only when the player is stuck — too poor
// for any kit, with nothing already in flight.
export function piggyShouldShow(game) {
  const busy = (game.deliveries ?? []).length > 0 || busyStations(game).length > 0
  return game.money < cheapestKitCost && !busy
}

// The station the player is standing at, if it has a kit on it (C6).
//
// Shared by the view (to show the soldering strip) and by anything else that
// cares about presence, so what you see and what the sim believes cannot
// disagree — the same mistake the piggy bank made for a month.
// Does this iron do the soldering on its own once someone is at the bench?
// Levels 2–3 do; 0–1 need the mini-game. Used to decide whether to offer it.
export function ironIsHandsOff(game) {
  return levelData('soldering', game.upgrades.solderingLevel).qualityMin !== undefined
}

export function playerStation(world) {
  const player = (world.agents ?? []).find(a => a.kind === 'player')
  if (!player) return null

  for (const zone of world.zones ?? []) {
    if (zone.kind !== 'bench') continue
    if (Math.abs(player.x - zone.cx) > zone.w / 2) continue
    if (Math.abs(player.y - zone.cy) > zone.h / 2) continue
    const station = stationsOf(world.game).find(s => s.id === zone.meta?.stationId)
    if (station?.phase === Phase.ASSEMBLY) return station
  }
  return null
}

// Where the player should go next, as a zone — the game never explains itself
// otherwise, and "walk out to the street" is not guessable from a HUD line.
//
// Reuses the zones' own `enabled` predicate, so the arrow can only ever point
// at something that will actually do something when you arrive.
// Training wheels come off once the loop is familiar — but per topic, not all
// at once. A player can get through five clean orders without ever burning a
// kit, and would then have no idea where the salvage bin is; scrap runs get
// their own short allowance.
export function guidanceActive(game) {
  return (game.ordersPlaced ?? 0) <= GUIDANCE_ORDERS
}

export function scrapGuidanceActive(game) {
  return (game.scrapRuns ?? 0) <= GUIDANCE_SCRAP_RUNS
}

export function nextObjective(world, interactions) {
  const player = (world.agents ?? []).find(a => a.kind === 'player')
  if (!player) return null

  const general = guidanceActive(world.game)
  const scrap   = scrapGuidanceActive(world.game)
  if (!general && !scrap) return null

  // Order matters: finish what is in your hands before starting something new.
  // The output table sits just under the mailbox: a finished drone is worth
  // collecting before fetching the next box (S1.2).
  const PRIORITY = ['mailbox', 'bench_out', 'bench', 'delivery_slot', 'trashbin', 'piggy']

  let best = null
  let bestRank = Infinity
  for (const zone of world.zones ?? []) {
    // The bin keeps its arrow after the general hints have stopped.
    if (zone.kind === 'trashbin' ? !scrap : !general) continue
    const rank = PRIORITY.indexOf(zone.kind)
    if (rank < 0 || rank > bestRank) continue
    const def = interactions[zone.kind]
    if (!def?.enabled(world, zone, player)) continue

    if (rank < bestRank) { bestRank = rank; best = zone; continue }
    // Same kind: take the nearer one.
    if (Math.hypot(zone.cx - player.x, zone.cy - player.y) <
        Math.hypot(best.cx - player.x, best.cy - player.y)) best = zone
  }
  return best
}
