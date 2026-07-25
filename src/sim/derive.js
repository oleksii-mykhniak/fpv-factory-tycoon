// Values derived from the game state that more than one consumer needs.
//
// Kept here so the zone that opens the piggy bank and the actor that draws it
// can never disagree about whether it exists — they were two separate
// expressions before, and one of them was quietly wrong for a month (the
// scrap kit's cost of 0 dragged the minimum kit cost to zero, so the rescue
// mini-game never appeared).

import {
  KIT_TYPES, busyStations, idleStations, Phase, stationsOf, nextHireCost,
} from '../state/gameState.js'
import { GUIDANCE_ORDERS, GUIDANCE_SCRAP_RUNS } from '../state/config.js'
import { levelData, UPGRADE_TRACKS } from '../state/upgrades.js'
import {
  kitsForLocation, hiringAllowed, maxWorkersHere, capFor,
  canMoveToLocation, LOCATION_ORDER,
} from '../state/locations.js'
import { ROLE_ORDER } from '../defs/roles.js'

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

// ── Does this object want the player's attention? (S2) ────
//
// The badges that used to live on the bottom bar moved onto the objects the
// panels now sit behind. Kept here rather than in the view because the trigger
// zone, the pulsing prop and the guidance arrow must agree — three copies of
// "is there anything worth doing at the desk" is exactly how the piggy bank
// went wrong.

// The desk: somewhere to put a kit, and enough money to buy one.
export function shopNeedsAttention(game) {
  if (!idleStations(game).length) return false
  const affordable = kitsForLocation(game)
    .map(id => KIT_TYPES[id])
    .filter(k => k && k.cost > 0)
    .some(k => game.money >= k.cost)
  return affordable
}

// The rack: an upgrade (or a move) is affordable, and no bench is mid-build —
// both are between-cycles purchases.
export function upgradeNeedsAttention(game) {
  if (busyStations(game).length > 0) return false

  const currentIdx = LOCATION_ORDER.indexOf(game.locationId ?? 'apartment')
  const nextLocId  = LOCATION_ORDER[currentIdx + 1]
  if (nextLocId && canMoveToLocation(game, nextLocId).can) return true

  return Object.entries(UPGRADE_TRACKS).some(([id, track]) => {
    const level = game.upgrades[track.stateKey] ?? 0
    if (level >= Math.min(track.costs.length, capFor(game, id))) return false
    return game.money >= track.costs[level]
  })
}

// The board: hiring is allowed here, there is room, and somebody is affordable.
export function hireNeedsAttention(game) {
  if (!hiringAllowed(game)) return false
  if ((game.workers ?? []).length >= maxWorkersHere(game)) return false
  return ROLE_ORDER.some(id => game.money >= nextHireCost(game, id))
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
  // The desk sits last: fetch, build and sell what is already in the shop
  // before ordering more.
  const PRIORITY = [
    'mailbox', 'bench_out', 'bench', 'delivery_slot', 'trashbin', 'piggy', 'desk',
  ]

  let best = null
  let bestRank = Infinity
  for (const zone of world.zones ?? []) {
    // The bin keeps its arrow after the general hints have stopped.
    if (zone.kind === 'trashbin' ? !scrap : !general) continue
    const rank = PRIORITY.indexOf(zone.kind)
    if (rank < 0 || rank > bestRank) continue
    const def = interactions[zone.kind]
    if (!def?.enabled(world, zone, player)) continue
    // A desk you cannot usefully use must not pull the arrow (S2).
    if (def.attention && !def.attention(world, zone, player)) continue

    if (rank < bestRank) { bestRank = rank; best = zone; continue }
    // Same kind: take the nearer one.
    if (Math.hypot(zone.cx - player.x, zone.cy - player.y) <
        Math.hypot(best.cx - player.x, best.cy - player.y)) best = zone
  }
  return best
}
