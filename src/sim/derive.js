// Values derived from the game state that more than one consumer needs.
//
// Kept here so the zone that opens the piggy bank and the actor that draws it
// can never disagree about whether it exists — they were two separate
// expressions before, and one of them was quietly wrong for a month (the
// scrap kit's cost of 0 dragged the minimum kit cost to zero, so the rescue
// mini-game never appeared).

import { Phase, KIT_TYPES } from '../state/gameState.js'

// Cheapest kit the player could actually buy. Free kits (scrap) are not
// purchases and must not count.
export const cheapestKitCost = Math.min(
  ...Object.values(KIT_TYPES).filter(k => k.cost > 0).map(k => k.cost)
)

// The piggy bank is a rescue: it shows only when the player is stuck — too poor
// for any kit, with nothing already in flight.
export function piggyShouldShow(game) {
  const busy = (game.deliveries ?? []).length > 0 || game.phase !== Phase.IDLE
  return game.money < cheapestKitCost && !busy
}
