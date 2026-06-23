import { UPGRADE_TRACKS } from './upgrades.js'

// Location registry — data-driven. Each location defines which kits are available,
// the maximum level allowed per upgrade track, and unlock conditions.
// Tunable balance (costs, cap numbers) lives here as content; scene colours in sceneConfig.

export const LOCATIONS = Object.freeze({
  apartment: {
    id:   'apartment',
    name: 'Квартира',
    emoji: '🏠',
    kitIds: ['mini_drone', 'racing_drone', 'cinematic_drone'],
    // Max level achievable at this location per upgrade track.
    // 0 = fully locked (can't buy any level); Infinity = no cap.
    upgradeCaps: { soldering: 2, worker: 1, storage: 0, logistics: 0, consumables: 2 },
    unlockCost: 0,
    unlockReq: null,
    sceneConfig: { bgColor: '#0e0e18', floorColor: '#1a1a26' },
  },
  garage: {
    id:   'garage',
    name: 'Гараж',
    emoji: '🔧',
    kitIds: ['mini_drone', 'racing_drone', 'cinematic_drone', 'longrange_drone'],
    upgradeCaps: { soldering: 3, worker: 2, storage: 1, logistics: 1, consumables: 2 },
    unlockCost: 800,
    unlockReq: { minUpgrades: { soldering: 2 } },
    sceneConfig: { bgColor: '#0d1810', floorColor: '#1a2618' },
  },
  workshop: {
    id:   'workshop',
    name: 'Майстерня',
    emoji: '🏭',
    kitIds: ['mini_drone', 'racing_drone', 'cinematic_drone', 'longrange_drone'],
    upgradeCaps: { soldering: 3, worker: 2, storage: 2, logistics: 2, consumables: 2 },
    unlockCost: 2500,
    unlockReq: { minUpgrades: { soldering: 3, worker: 2 } },
    sceneConfig: { bgColor: '#180d18', floorColor: '#261a26' },
  },
})

// Ordered list of location IDs — used to enforce progression (can only advance).
export const LOCATION_ORDER = Object.freeze(['apartment', 'garage', 'workshop'])

export function currentLocation(state) {
  return LOCATIONS[state.locationId ?? 'apartment']
}

export function kitsForLocation(state) {
  return currentLocation(state).kitIds
}

// Max level allowed for a track at the current location. Infinity when no cap defined.
export function capFor(state, trackId) {
  const caps = currentLocation(state).upgradeCaps
  return caps[trackId] ?? Infinity
}

// Returns { can: bool, reasons: string[] }.
export function canMoveToLocation(state, targetId) {
  const target = LOCATIONS[targetId]
  if (!target) return { can: false, reasons: ['Невідома локація'] }

  const currentIdx = LOCATION_ORDER.indexOf(state.locationId ?? 'apartment')
  const targetIdx  = LOCATION_ORDER.indexOf(targetId)
  if (targetIdx <= currentIdx)
    return { can: false, reasons: ['Вже в цій або пізнішій локації'] }

  const reasons = []

  if (state.money < target.unlockCost)
    reasons.push(`Потрібно $${target.unlockCost} (є $${Math.floor(state.money)})`)

  if (target.unlockReq?.minUpgrades) {
    for (const [trackId, minLevel] of Object.entries(target.unlockReq.minUpgrades)) {
      const track   = UPGRADE_TRACKS[trackId]
      const current = track ? (state.upgrades[track.stateKey] ?? 0) : 0
      if (current < minLevel) {
        const name = track?.name ?? trackId
        reasons.push(`${name}: рівень ${current}/${minLevel}`)
      }
    }
  }

  return { can: reasons.length === 0, reasons }
}
