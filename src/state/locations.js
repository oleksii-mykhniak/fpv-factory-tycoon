import { UPGRADE_TRACKS } from './upgrades.js'
import { STARTING_MONEY } from './config.js'

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
    upgradeCaps: { soldering: 2, storage: 0, logistics: 0, consumables: 2, benches: 0 },
    // The first location is deliberately hands-on: you are the whole workforce.
    hiring: false,
    workerCaps: { courier: 0, tech: 0, seller: 0, manager: 0 },
    unlockCost: 0,
    unlockReq: null,
    startMoney: STARTING_MONEY,
    rules: { hasTrash: true, hasPiggy: true },
    sceneConfig: { bgColor: '#0e0e18', floorColor: '#1a1a26' },
  },
  garage: {
    id:   'garage',
    name: 'Гараж',
    emoji: '🔧',
    kitIds: ['mini_drone', 'racing_drone', 'cinematic_drone', 'longrange_drone'],
    upgradeCaps: { soldering: 3, storage: 1, logistics: 1, consumables: 2, benches: 1 },
    hiring: true,
    // Room is counted per role, not as one pool: a shop with two couriers and
    // nobody at the bench is not a staffing choice, it is a dead end. One of
    // each hands-on role fits in the garage; the manager — the role that makes
    // the shop order for itself — is workshop-only, so "runs without me" stays
    // something you move for (S3).
    workerCaps: { courier: 1, tech: 1, seller: 1, manager: 0 },
    unlockCost: 800,
    unlockReq: { minUpgrades: { soldering: 2 } },
    startMoney: 250,
    rules: { hasTrash: true, hasPiggy: true },
    sceneConfig: { bgColor: '#0d1810', floorColor: '#1a2618' },
  },
  // The last location. Everything after this point grows inside it — rooms, not
  // another move (Stage 5). See docs/plan_stage5_factory.md.
  factory: {
    id:   'factory',
    name: 'Фабрика',
    emoji: '🏭',
    kitIds: ['mini_drone', 'racing_drone', 'cinematic_drone', 'longrange_drone'],
    upgradeCaps: { soldering: 3, storage: 2, logistics: 2, consumables: 2, benches: 2 },
    hiring: true,
    // Doubled hands-on roles plus the manager: the factory is where the shop
    // can finally run itself (S3).
    workerCaps: { courier: 2, tech: 2, seller: 2, manager: 1 },
    unlockCost: 2500,
    unlockReq: { minUpgrades: { soldering: 3, consumables: 2 } },
    startMoney: 800,
    // Kits still burn here — risk is the game, and taking it away would make
    // the biggest shop the dullest one. What the factory drops is the two
    // RESCUE mechanics: no salvage bin to walk to and no piggy bank. When the
    // shop runs dry here, the way out is the free kit the manager (or you, at
    // the laptop) can order — see rescueKitAvailable in sim/derive.js.
    rules: { hasTrash: false, hasPiggy: false },
    // Nothing further to buy for YOUR hands. The two personal tracks freeze at
    // whatever level you arrived with (see frozenCaps) rather than vanishing:
    // the iron you paid for in the garage is still yours. From here on the
    // thing that gets better is the payroll (F5).
    freezeTracks: ['soldering', 'consumables'],
    // No further move exists. The upgrade panel must not offer one — and there
    // is nothing to gate, because the button is gone.
    terminal: true,
    sceneConfig: { bgColor: '#180d18', floorColor: '#261a26' },
  },
})

// Ordered list of location IDs — used to enforce progression (can only advance).
export const LOCATION_ORDER = Object.freeze(['apartment', 'garage', 'factory'])

export function currentLocation(state) {
  return LOCATIONS[state.locationId ?? 'apartment']
}

export function kitsForLocation(state) {
  return currentLocation(state).kitIds
}

// Max level allowed for a track at the current location. Infinity when no cap
// defined. A frozen track caps at the level recorded on arrival — computed once
// at move time rather than read live, because "your current level" as a cap is
// a moving target that cannot be tested or explained to the player.
export function capFor(state, trackId) {
  const frozen = state.frozenCaps?.[trackId]
  if (frozen !== undefined) return frozen
  const caps = currentLocation(state).upgradeCaps
  return caps[trackId] ?? Infinity
}

// Which tracks this location stops selling, and at what level. Returns the
// {trackId: level} map to store; empty when nothing freezes here.
export function freezeCapsFor(state, locationId) {
  const tracks = LOCATIONS[locationId]?.freezeTracks ?? []
  return Object.fromEntries(tracks.map(id => [
    id, state.upgrades[UPGRADE_TRACKS[id].stateKey] ?? 0,
  ]))
}

// One predicate per location rule, so the zone, the prop and the sim can never
// disagree about whether this place has a salvage bin. Rules default to ON:
// a location that says nothing behaves the way the game always has.
export function ruleAt(state, rule) {
  return currentLocation(state).rules?.[rule] ?? true
}

export function isTerminal(state) {
  return currentLocation(state).terminal === true
}

// The bank balance a location starts you on. Moving RESETS the cash to this
// number rather than deducting a price: unlockCost is a threshold you have to
// prove you can clear, not a bill. Without the reset, how the next chapter plays
// depends entirely on whether you ground out $9000 in the garage first — the
// balance of every location after the first would be untunable.
export function startMoneyAt(locationId) {
  return LOCATIONS[locationId]?.startMoney ?? STARTING_MONEY
}

// Returns { can: bool, reasons: string[] }.
// Whether workers can be hired here. The apartment is a one-person shop; the
// point of moving to the garage is that you stop doing everything yourself.
export function hiringAllowed(state) {
  return currentLocation(state).hiring === true
}

// How many people of THIS role the location has room for. The cap is per role
// so that composition is the decision — two couriers and no technician is not a
// strategy, it is a stalled shop. Moving on is what raises every number.
export function roleCapHere(state, roleId) {
  return currentLocation(state).workerCaps?.[roleId] ?? 0
}

// Total room = the sum of the role caps. Kept as a derived value (never as its
// own field) so a second limit can never quietly disagree with the first.
export function maxWorkersHere(state) {
  return Object.values(currentLocation(state).workerCaps ?? {})
    .reduce((sum, n) => sum + n, 0)
}

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
