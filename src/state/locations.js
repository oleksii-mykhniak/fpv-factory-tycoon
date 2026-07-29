import { UPGRADE_TRACKS } from './upgrades.js'
import { STARTING_MONEY } from './config.js'
import { openHalls } from '../defs/layouts/factory.js'
import { markUnlocked } from './kits.js'
import { APARTMENT_ROOMS, openRooms, roomUpgradeCaps, roomDef } from '../defs/layouts/rooms.js'
import { ROLE_ORDER } from '../defs/roles.js'

// Location registry — data-driven. Each location defines which kits are available,
// the maximum level allowed per upgrade track, and unlock conditions.
// Tunable balance (costs, cap numbers) lives here as content; scene colours in sceneConfig.

export const LOCATIONS = Object.freeze({
  apartment: {
    id:   'apartment',
    name: 'Квартира',
    emoji: '🏠',
    // Kits, upgrade ceilings and headcount are per ROOM here, not per location
    // (П2): the garage used to be a location of its own and is a room you buy
    // now. Everything below sums (or maxes) over the open ones, which is why
    // this entry names none of them.
    rooms: APARTMENT_ROOMS,
    unlockCost: 0,
    unlockReq: null,
    startMoney: STARTING_MONEY,
    // Підвищення робітників вимкнено вдома (валідація Стадії 10). Тут працює
    // щонайбільше кілька людей, і рівні їм нема куди дівати: перша локація —
    // про власні руки й перший найм, а не про платіжну відомість. Штат як
    // предмет прокачки починається на фабриці, де його стає більше за одного.
    rules: { hasTrash: true, hasPiggy: true, hasPromote: false },
    sceneConfig: { bgColor: '#0e0e18', floorColor: '#1a1a26' },
  },
  // The last location. Everything after this point grows inside it — rooms, not
  // another move (Stage 5). See docs/plans/done/stage5_factory.md.
  factory: {
    id:   'factory',
    name: 'Фабрика',
    emoji: '🏭',
    kitIds: ['mini_drone', 'racing_drone', 'cinematic_drone', 'longrange_drone'],
    upgradeCaps: { soldering: 3, storage: 2, logistics: 2, consumables: 2, benches: 2 },
    // Headcount is per HALL here, not per location: opening a hall is what
    // buys the people to run it (F2). Summed over open halls by roleCapHere.
    workerCaps: null,
    unlockCost: 2500,
    // The garage is a room now, so "have you outgrown home" is a room you own
    // rather than a location you passed through (П2).
    unlockReq: { minUpgrades: { soldering: 3, consumables: 2 }, rooms: ['garage'] },
    startMoney: 800,
    // Kits still burn here — risk is the game, and taking it away would make
    // the biggest shop the dullest one. What the factory drops is the two
    // RESCUE mechanics: no salvage bin to walk to and no piggy bank. When the
    // shop runs dry here, the way out is the free kit the manager (or you, at
    // the laptop) can order — see rescueKitAvailable in sim/derive.js.
    rules: { hasTrash: false, hasPiggy: false, hasPromote: true },
    // Nothing further to buy for YOUR hands. The two personal tracks freeze at
    // whatever level you arrived with (see frozenCaps) rather than vanishing:
    // the iron you paid for in the garage is still yours. From here on the
    // thing that gets better is the payroll (F5).
    // `benches` freezes too: a hall arrives with its benches already in it, so
    // buying tables separately would be a second way to grow the same number,
    // and the two would spend the whole stage disagreeing.
    freezeTracks: ['soldering', 'consumables', 'benches'],
    // No further move exists. The upgrade panel must not offer one — and there
    // is nothing to gate, because the button is gone.
    terminal: true,
    sceneConfig: { bgColor: '#180d18', floorColor: '#261a26' },
  },
})

// Ordered list of location IDs — used to enforce progression (can only advance).
export const LOCATION_ORDER = Object.freeze(['apartment', 'factory'])

// Falls back to home rather than to undefined: a save carrying a location id
// this build no longer knows (the garage, before the migration in main.js) must
// land somewhere real instead of taking every derived value down with it.
export function currentLocation(state) {
  return LOCATIONS[state.locationId] ?? LOCATIONS.apartment
}

// The rooms of the current location that are actually open — empty everywhere
// the location is one room (the factory grows by halls instead).
export function openRoomsHere(state) {
  return currentLocation(state).rooms ? openRooms(state.unlockedRooms) : []
}

export function roomIsOpen(state, roomId) {
  return openRoomsHere(state).some(r => r.id === roomId)
}

export function kitsForLocation(state) {
  const loc = currentLocation(state)
  const here = loc.kitIds
    ?? [...new Set(openRoomsHere(state).flatMap(r => r.kitIds ?? []))]
  // Rooms bring their own catalogue with them: the long-range kit is something
  // the garage can build, not something the address unlocks.
  //
  // Другий ключ — Mk (Стадія 10 / B3): гоночний відкриває mini Mk II, а не
  // адреса. Двері односторонні (`kitMarks` тільки росте), і це не стилістика:
  // тип, який може зачинитись назад, відкотив би ланцюг квестів на пройдений
  // крок — рівно те, чого забороняє П2 Стадії 9.
  return here.filter(id => markUnlocked(state, id))
}

// Max level allowed for a track at the current location. Infinity when no cap
// defined. A frozen track caps at the level recorded on arrival — computed once
// at move time rather than read live, because "your current level" as a cap is
// a moving target that cannot be tested or explained to the player.
export function capFor(state, trackId) {
  const frozen = state.frozenCaps?.[trackId]
  if (frozen !== undefined) return frozen
  const loc  = currentLocation(state)
  // The ceiling is the highest any open room allows, not the sum: the garage
  // does not add levels to the flat's, it raises the bar.
  const caps = loc.upgradeCaps ?? roomUpgradeCaps(openRoomsHere(state))

  // Halls raise ceilings the same way rooms do (Стадія 10 / A3). The factory
  // states its caps per LOCATION, which was enough while every track was
  // finite and froze on arrival — but an endless track has to keep growing
  // with the floor, or the third hall would buy space and nothing to spend on.
  // Max, not sum, for exactly the reason the rooms use max.
  //
  // Gated on the location being hall-based, and that gate is load-bearing:
  // `openHalls` normalises to at least one hall for ANY save, so reading it at
  // home would hand the flat the factory's ceilings.
  const halls = loc.rooms ? [] : openHalls(state.unlockedHalls)
  const hallCaps = halls.map(h => h.upgradeCaps?.[trackId]).filter(c => c !== undefined)
  if (!hallCaps.length) return caps[trackId] ?? Infinity
  return Math.max(caps[trackId] ?? -Infinity, ...hallCaps)
}

// Стеля Mk комплектів тут і зараз (Стадія 10 / B2).
//
// Той самий закон, що й у `capFor`: максимум по відкритому простору, не сума.
// Це те, заради чого кімната знову щось важить — не «ще один множник», а
// «сюди дрон можна довести далі, ніж туди».
//
// Свідомо ОКРЕМА функція, а не ще один ключ в `upgradeCaps`: Mk — не трек
// поліпшень, у нього інший стан (`kitMarks`), інша ціна й інша UI. Спільний
// словник змусив би обидві системи вдавати, що вони одне й те саме.
export function mkCapFor(state) {
  const loc = currentLocation(state)
  if (loc.rooms) {
    const rooms = openRoomsHere(state)
    return Math.max(0, ...rooms.map(r => r.mkCap ?? 0))
  }
  const halls = openHalls(state.unlockedHalls)
  return Math.max(0, ...halls.map(h => h.mkCap ?? 0))
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

// Whether workers can be hired here — which is simply "is there room for
// anybody at all". It used to be a flag of its own, and a flag and a set of
// caps that both claim to answer the same question is how the flat ends up
// with a job board that can only ever say no: the flat is a one-person shop
// until the garage (П2) brings the first three vacancies with it.
export function hiringAllowed(state) {
  return ROLE_ORDER.some(id => roleCapHere(state, id) > 0)
}

// How many people of THIS role there is room for right now. The cap is per role
// so that composition is the decision — two couriers and no technician is not a
// strategy, it is a stalled shop.
//
// On the factory the room is per hall and adds up as halls open, which is what
// makes opening one feel like hiring capacity rather than buying floor space.
export function roleCapHere(state, roleId) {
  const loc = currentLocation(state)
  // Same rule one level down: at home the room brings the vacancies (П2).
  if (loc.rooms)
    return openRoomsHere(state).reduce((sum, r) => sum + (r.workerCaps?.[roleId] ?? 0), 0)
  if (loc.workerCaps) return loc.workerCaps[roleId] ?? 0
  return openHalls(state.unlockedHalls)
    .reduce((sum, hall) => sum + (hall.workerCaps?.[roleId] ?? 0), 0)
}

// Room for this role in ONE hall (F4). Hiring happens at a hall's own board, so
// the cap that matters is the hall's — the location total is only ever a sum.
export function roleCapInHall(state, hallId, roleId) {
  if (!hallId) return roleCapHere(state, roleId)
  const open = openHalls(state.unlockedHalls).find(h => h.id === hallId)
  return open?.workerCaps?.[roleId] ?? 0
}

// Total room = the sum of the role caps. Kept as a derived value (never as its
// own field) so a second limit can never quietly disagree with the first.
export function maxWorkersHere(state) {
  return ROLE_ORDER.reduce((sum, id) => sum + roleCapHere(state, id), 0)
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

  for (const roomId of target.unlockReq?.rooms ?? []) {
    if (!roomIsOpen(state, roomId))
      reasons.push(`Спершу відкрийте: ${roomDef(roomId)?.name ?? roomId}`)
  }

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
