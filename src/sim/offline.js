// Offline settlement — what happened while the game was closed.
//
// Deliberately NOT a fast-forward of the simulation. Two hours is 144 000 ticks
// with A* and collision resolution in each one: seconds of frozen screen on a
// phone, to compute something the player will read as one number. This settles
// the work that was already in flight instead, using the same rates the live
// systems use.
//
// It also does not invent income the shop could not have made: nobody orders
// kits while the app is closed, so only deliveries and assemblies that were
// already paid for can finish.

import { Phase, KIT_TYPES, calcPrice, stationsOf, workersInRole } from '../state/gameState.js'
import { levelData } from '../state/upgrades.js'
import { roleLevelData } from '../defs/roles.js'
import { OFFLINE_CAP_MS } from '../state/config.js'

// Milliseconds per solder point for a station, given who could work it.
// Returns null when nothing could have made progress unattended.
function pointMsFor(game) {
  const solder = levelData('soldering', game.upgrades.solderingLevel)
  const techs  = workersInRole(game, 'tech')

  const rates = []
  if (solder.qualityMin !== undefined) rates.push({ ms: solder.pointDelayMs, q: (solder.qualityMin + solder.qualityMax) / 2 })
  if (techs.length) {
    const t = roleLevelData('tech', Math.max(...techs.map(w => w.level)))
    rates.push({ ms: t.pointMs, q: t.quality })
  }
  if (!rates.length) return null
  // Best available on each axis, same rule the live station uses.
  return { ms: Math.min(...rates.map(r => r.ms)), q: Math.max(...rates.map(r => r.q)) }
}

// Returns { elapsedMs, assembled, sold, earned, state } — a pure settlement.
export function settleOffline(game, awayMs, now = Date.now()) {
  const elapsedMs = Math.max(0, Math.min(awayMs, OFFLINE_CAP_MS))
  const empty = { elapsedMs, assembled: 0, sold: 0, earned: 0, state: game }
  if (elapsedMs < 60_000) return empty

  const rate = pointMsFor(game)
  const hasSeller = workersInRole(game, 'seller').length > 0

  let money     = game.money
  let assembled = 0
  let sold      = 0
  let earned    = 0

  const stations = stationsOf(game).map(station => {
    // A bench mid-assembly finishes if something could work it.
    if (station.phase === Phase.ASSEMBLY && rate) {
      const kit  = KIT_TYPES[station.kitId]
      const left = kit.solderPointCount - station.solderPoints.length
      if (left * rate.ms <= elapsedMs) {
        assembled++
        const quality = Math.max(0, rate.q - station.coldPenalty)
        // Only a hired seller can bank it; otherwise it waits on the bench.
        if (hasSeller) {
          const price = calcPrice(kit.basePrice, quality, game.upgrades.priceMultiplier)
          money  += price
          earned += price
          sold++
          return { ...station, phase: Phase.IDLE, kitId: null, solderPoints: [], quality: null, coldPenalty: 0 }
        }
        return { ...station, phase: Phase.READY, quality }
      }
      // Partial progress: award the points that fit in the time away.
      const done = Math.floor(elapsedMs / rate.ms)
      if (done > 0) {
        return {
          ...station,
          solderPoints: [...station.solderPoints, ...Array(Math.min(done, left)).fill(rate.q)],
        }
      }
    }
    return station
  })

  // Hand back the very same state when nothing happened, so a caller can skip
  // the save and the "while you were away" screen on identity alone.
  const changed = stations.some((st, i) => st !== stationsOf(game)[i])
  return {
    elapsedMs, assembled, sold, earned,
    state: changed ? { ...game, money, stations } : game,
  }
}
