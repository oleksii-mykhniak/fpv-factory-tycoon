import {
  STARTING_MONEY,
  PRICE_BASE_COEFF, PRICE_QUALITY_COEFF,
  PIGGY_COOLDOWN_MS, PIGGY_TAP_VALUE, PIGGY_MAX_PAYOUT,
  STORAGE_SLOTS_BY_LEVEL, LOGISTICS_DELIVERY_MULT,
} from './config.js'

import { UPGRADE_TRACKS } from './upgrades.js'
import { KIT_TYPES } from './kits.js'
import {
  capFor, canMoveToLocation, LOCATIONS, hiringAllowed, roleCapHere, roleCapInHall,
  startMoneyAt, freezeCapsFor, ruleAt,
} from './locations.js'
import { hireCost, roleDef, ROLE_ORDER, promoteCost } from '../defs/roles.js'
import { FACTORY_HALL_IDS, FIRST_HALL_ID, hallDef } from '../defs/layouts/factory.js'
import { APARTMENT_ROOM_IDS, FIRST_ROOM_ID, roomDef } from '../defs/layouts/rooms.js'

// Re-export so existing consumers keep importing kit data from gameState.js.
export { KIT_TYPES }

// Phase of ONE station, not of the game. Before C3 there was a single bench and
// the two were the same thing; with several stations the game as a whole has no
// phase, so every transition below names the station it acts on.
export const Phase = Object.freeze({
  IDLE:     'IDLE',
  ASSEMBLY: 'ASSEMBLY',
  READY:    'READY',
  BURNT:    'BURNT',
})

export function createStation(id, defId = 'workbench') {
  return {
    id,
    defId,
    phase:        Phase.IDLE,
    kitId:        null,   // kit on this station (ASSEMBLY/READY/BURNT)
    solderPoints: [],
    quality:      null,
    coldPenalty:  0,
    // Who took the finished drone off the output table (S1.1). The station is
    // still READY — it holds the kit and the quality until the sale — but its
    // output is in someone's hands, so nobody may take it a second time.
    takenBy:      null,
  }
}

// Someone lifts the finished drone off the output table. Kept separate from
// sell() because the drone still has to be carried to the mailbox: the station
// must stop offering it the moment it leaves the table, or the job board hands
// a second, imaginary drone to the next free seller.
export function takeOutput(state, stationId, agentId) {
  const station = getStation(state, stationId)
  if (station.phase !== Phase.READY)
    throw new Error(`takeOutput: станція ${stationId} у фазі ${station.phase}`)
  if (station.takenBy)
    throw new Error(`takeOutput: дрон зі станції ${stationId} вже несе ${station.takenBy}`)
  return withStation(state, stationId, s => ({ ...s, takenBy: agentId }))
}

// The carrier is gone (reload, a fired worker, a dropped errand) — the drone
// goes back on the table rather than out of the world.
export function releaseOutput(state, stationId) {
  return withStation(state, stationId, s => ({ ...s, takenBy: null }))
}

// ── Station lookup ────────────────────────────────────────

export function getStation(state, stationId) {
  const st = (state.stations ?? []).find(s => s.id === stationId)
  if (!st) throw new Error(`getStation: станцію "${stationId}" не знайдено`)
  return st
}

export const stationsOf   = (state) => state.stations ?? []
export const idleStations = (state) => stationsOf(state).filter(s => s.phase === Phase.IDLE)
export const busyStations = (state) => stationsOf(state).filter(s => s.phase !== Phase.IDLE)

// The station a single-bench UI should talk about: the one doing something, or
// else the first one. C7 gives the UI a real per-station view.
export function focusStation(state) {
  return busyStations(state)[0] ?? stationsOf(state)[0] ?? null
}

// Replaces one station, leaving the rest untouched.
function withStation(state, stationId, fn) {
  return {
    ...state,
    stations: stationsOf(state).map(s => (s.id === stationId ? fn(s) : s)),
  }
}

// Grows or shrinks the station list to `count`, preserving existing progress.
// Called when a new bench is bought and when a save is loaded.
export function syncStations(state, count, defId = 'workbench') {
  const current = stationsOf(state)
  if (current.length === count) return state
  if (current.length > count) return { ...state, stations: current.slice(0, count) }
  const added = Array.from(
    { length: count - current.length },
    (_, i) => createStation(`station-${current.length + i}`, defId),
  )
  return { ...state, stations: [...current, ...added] }
}

// Per-delivery status — lives inside each deliveries[] entry.
export const DeliveryStatus = Object.freeze({
  TRANSIT:  'transit',   // in transit or arrived but not picked up
  CARRYING: 'carrying',  // worker picked it up, walking to bench
})

export function createState() {
  return {
    money:             STARTING_MONEY,
    stations:          [createStation('station-0')],
    // Hired workers (C5): [{ id, role, level, hiredAt }]
    workers:           [],
    // How many kits ordered / salvage runs started ever — drive the guidance
    // arrow, each on its own allowance (C7).
    ordersPlaced:      0,
    scrapRuns:         0,
    lastPiggyAt:       null,
    locationId:        'apartment',
    // Which factory halls are open (F2). Meaningless anywhere else, but kept in
    // the base state so no code path has to ask whether the field exists.
    unlockedHalls:     [FIRST_HALL_ID],
    // Which rooms of the flat are open (П2) — the same idea one location
    // earlier. Kept in the base state for the same reason: no code path should
    // have to ask whether the field exists.
    unlockedRooms:     [FIRST_ROOM_ID],
    onboarded:         false,
    // Історія цеху (Стадія 9 / Р1). Квести-дії («продай 3 дрони») не виводяться
    // з поточного стану: проданого дрона в ньому вже немає. Тому — лічильники.
    //
    // КОЖНЕ поле тут монотонне (тільки росте). Це не дрібниця, а те, на чому
    // тримається весь ланцюг квестів: активний квест — це перший, у якого
    // `done` ще false, тож умова, яка може стати хибною знову, відкотила б
    // гравця на пройдений крок.
    stats: {
      sold:        0,   // продано дронів (згорілий продати неможливо)
      assembled:   0,   // доведено до READY
      burnt:       0,   // згоріло комплектів
      bestQuality: 0,   // найкраща якість збірки, [0..1]
      bestRate:    0,   // найвищий $/сек, який цех колись показував
      soldByKit:   {},  // { racing_drone: 2, … } — для квестів на тип дрона
    },
    scrapAvailable:    false, // true when player has "ordered" scrap from the trash
    // All deliveries: [{id, kitId, slotIndex, readyAt, status}]
    // status 'transit'  = en-route or arrived-but-not-picked-up
    // status 'carrying' = worker is carrying it to bench
    deliveries:        [],
    upgrades: {
      priceMultiplier:  1,
      solderingLevel:   0,
      consumablesLevel: 0,
      storageLevel:     0,
      logisticsLevel:   0,
      benchLevel:       0,
    },
  }
}

// ── Price/quality helpers ─────────────────────────────────

// ціна = база × (BASE_COEFF + QUALITY_COEFF × якість) × множник
export function calcPrice(basePrice, quality, priceMultiplier = 1) {
  return basePrice * (PRICE_BASE_COEFF + PRICE_QUALITY_COEFF * quality) * priceMultiplier
}

export function calcQuality(solderPoints) {
  if (!solderPoints.length) return 0
  return solderPoints.reduce((sum, q) => sum + q, 0) / solderPoints.length
}

// ── FSM transitions ───────────────────────────────────────

// Returns the first street slot index (0..maxSlots-1) not currently occupied.
// A slot is occupied by any pending delivery (any status).
function _nextFreeSlotIndex(state) {
  const storageLevel = state.upgrades.storageLevel ?? 0
  const maxSlots     = 1 + (STORAGE_SLOTS_BY_LEVEL[storageLevel] ?? 0)
  const occupied     = new Set((state.deliveries ?? []).map(d => d.slotIndex))
  for (let i = 0; i < maxSlots; i++) {
    if (!occupied.has(i)) return i
  }
  throw new Error('_nextFreeSlotIndex: всі слоти зайняті')
}

// Occupied delivery slots = pending deliveries. Before C3 a busy bench also
// counted, which with several benches would have made the extra ones
// unreachable. Stations now gate themselves: an ordered box may wait in the
// street while every bench is working.
function _usedSlots(state) {
  return (state.deliveries ?? []).length
}

// makeId lets the caller supply a deterministic id source. The sim passes a
// monotonic counter so a headless run is reproducible; the default keeps the
// standalone behaviour for direct callers and tests.
export function orderKit(state, kitTypeId, now = Date.now(), makeId = null) {
  const kit = KIT_TYPES[kitTypeId]
  if (!kit)
    throw new Error(`orderKit: невідомий тип комплекту "${kitTypeId}"`)
  if (state.money < kit.cost)
    throw new Error(`orderKit: недостатньо грошей (є ${state.money}, потрібно ${kit.cost})`)

  const storageLevel = state.upgrades.storageLevel ?? 0
  const maxSlots     = 1 + (STORAGE_SLOTS_BY_LEVEL[storageLevel] ?? 0)
  if (_usedSlots(state) >= maxSlots)
    throw new Error(`orderKit: всі слоти зайняті`)

  const logMult    = LOGISTICS_DELIVERY_MULT[state.upgrades.logisticsLevel ?? 0] ?? 1.0
  const deliveryMs = Math.round(kit.deliveryMs * logMult)
  const slotIndex  = _nextFreeSlotIndex(state)
  const id         = makeId ? makeId() : `${now}-${Math.random().toString(36).slice(2, 7)}`

  return {
    ...state,
    money:     state.money - kit.cost,
    ordersPlaced: (state.ordersPlaced ?? 0) + 1,
    deliveries: [
      ...(state.deliveries ?? []),
      { id, kitId: kitTypeId, slotIndex, readyAt: now + deliveryMs, status: DeliveryStatus.TRANSIT },
    ],
  }
}

// Someone picks up an arrived delivery: TRANSIT → CARRYING.
// Bench must be IDLE and no other delivery currently being carried.
// carriedBy identifies the agent (C2): the player and the worker puppet both
// haul boxes, and each must ignore the one the other has in hand.
export function pickupDelivery(state, deliveryId, now = Date.now(), carriedBy = 'worker') {
  if ((state.deliveries ?? []).some(d => d.status === DeliveryStatus.CARRYING))
    throw new Error('pickupDelivery: інша доставка вже несеться')
  const d = (state.deliveries ?? []).find(d => d.id === deliveryId)
  if (!d)
    throw new Error(`pickupDelivery: доставку ${deliveryId} не знайдено`)
  if (d.readyAt > now)
    throw new Error(`pickupDelivery: доставка ще в дорозі`)
  return {
    ...state,
    deliveries: (state.deliveries ?? []).map(d2 =>
      d2.id === deliveryId ? { ...d2, status: DeliveryStatus.CARRYING, carriedBy } : d2
    ),
  }
}

// A carried box is put down on `stationId`: the delivery is consumed and that
// station starts assembling. Other stations and other deliveries are untouched.
export function startAssembly(state, stationId) {
  const station = getStation(state, stationId)
  if (station.phase !== Phase.IDLE)
    throw new Error(`startAssembly: станція ${stationId} у фазі ${station.phase}`)
  const carrying = (state.deliveries ?? []).find(d => d.status === DeliveryStatus.CARRYING)
  if (!carrying)
    throw new Error('startAssembly: немає активної доставки (статус carrying)')
  return {
    ...withStation(state, stationId, s => ({
      ...s, phase: Phase.ASSEMBLY, kitId: carrying.kitId,
    })),
    deliveries: (state.deliveries ?? []).filter(d => d.id !== carrying.id),
  }
}

export function recordSolderPoint(state, stationId, quality) {
  const station = getStation(state, stationId)
  if (station.phase !== Phase.ASSEMBLY)
    throw new Error(`recordSolderPoint: станція ${stationId} у фазі ${station.phase}`)
  if (quality < 0 || quality > 1)
    throw new Error(`recordSolderPoint: якість має бути від 0 до 1, отримано ${quality}`)
  const kit = KIT_TYPES[station.kitId]
  if (station.solderPoints.length >= kit.solderPointCount)
    throw new Error(`recordSolderPoint: всі ${kit.solderPointCount} точки вже запаяно`)
  return withStation(state, stationId, s => ({
    ...s, solderPoints: [...s.solderPoints, quality],
  }))
}

export function applyColdSolderPenalty(state, stationId, amount) {
  const station = getStation(state, stationId)
  if (station.phase !== Phase.ASSEMBLY)
    throw new Error(`applyColdSolderPenalty: станція ${stationId} у фазі ${station.phase}`)
  return withStation(state, stationId, s => ({
    ...s, coldPenalty: Math.min(1, s.coldPenalty + amount),
  }))
}

// Єдиний вхід у `stats` (Р1). Через нього, а не через розкладання об'єкта на
// місці: сейв, записаний до Стадії 9, приходить без цього поля, і нормалізація
// в одному місці означає, що жодна транзиція не мусить про це пам'ятати.
const EMPTY_STATS = {
  sold: 0, assembled: 0, burnt: 0, bestQuality: 0, bestRate: 0, soldByKit: {},
}

export function bumpStats(state, patch) {
  const stats = { ...EMPTY_STATS, ...(state.stats ?? {}) }
  return { ...state, stats: { ...stats, ...patch(stats) } }
}

export function finishAssembly(state, stationId) {
  const station = getStation(state, stationId)
  if (station.phase !== Phase.ASSEMBLY)
    throw new Error(`finishAssembly: станція ${stationId} у фазі ${station.phase}`)
  const kit = KIT_TYPES[station.kitId]
  if (station.solderPoints.length < kit.solderPointCount)
    throw new Error(
      `finishAssembly: потрібно ${kit.solderPointCount} точок, є ${station.solderPoints.length}`
    )
  const raw     = calcQuality(station.solderPoints)
  const quality = Math.max(0, raw - station.coldPenalty)
  return bumpStats(
    withStation(state, stationId, s => ({ ...s, phase: Phase.READY, quality })),
    (st) => ({ assembled: st.assembled + 1, bestQuality: Math.max(st.bestQuality, quality) }),
  )
}

export function burnKit(state, stationId) {
  const station = getStation(state, stationId)
  if (station.phase !== Phase.ASSEMBLY)
    throw new Error(`burnKit: станція ${stationId} у фазі ${station.phase}`)
  return bumpStats(
    withStation(state, stationId, s => ({ ...s, phase: Phase.BURNT })),
    (st) => ({ burnt: st.burnt + 1 }),
  )
}

export function abandonBurntDrone(state, stationId, salvageRate = 0) {
  const station = getStation(state, stationId)
  if (station.phase !== Phase.BURNT)
    throw new Error(`abandonBurntDrone: станція ${stationId} у фазі ${station.phase}`)
  const salvage = KIT_TYPES[station.kitId].cost * salvageRate
  return _afterStationClear(state, stationId, state.money + salvage)
}

export function sell(state, stationId) {
  const station = getStation(state, stationId)
  if (station.phase !== Phase.READY)
    throw new Error(`sell: станція ${stationId} у фазі ${station.phase}`)
  const kit   = KIT_TYPES[station.kitId]
  const price = calcPrice(kit.basePrice, station.quality, state.upgrades.priceMultiplier)
  return bumpStats(
    _afterStationClear(state, stationId, state.money + price),
    (st) => ({
      sold:      st.sold + 1,
      soldByKit: { ...st.soldByKit, [station.kitId]: (st.soldByKit[station.kitId] ?? 0) + 1 },
    }),
  )
}

// After a station is cleared (sold or abandoned) it returns to IDLE. Deliveries
// stay intact — they were already decoupled from the bench in D6, which is why
// parallel stations need no extra bookkeeping here.
function _afterStationClear(state, stationId, newMoney) {
  return {
    ...withStation(state, stationId, () => createStation(stationId, getStation(state, stationId).defId)),
    money: newMoney,
  }
}

// ── Hiring (C5) ───────────────────────────────────────────

export const workersOf = (state) => state.workers ?? []

export function workersInRole(state, roleId, hallId = null) {
  return workersOf(state).filter(w =>
    w.role === roleId && (hallId === null || (w.hallId ?? null) === hallId))
}

// Cost of the next worker of this role — the curve is per-role, so hiring a
// second courier does not make the first technician more expensive.
export function nextHireCost(state, roleId) {
  return hireCost(roleId, workersInRole(state, roleId).length)
}

// hallId: which hall this person is taken on for (F4). Null everywhere the
// location has no halls — the board by the door hires for the whole shop.
export function hireWorker(state, roleId, now = Date.now(), makeId = null, hallId = null) {
  roleDef(roleId)   // throws on an unknown role
  if (!hiringAllowed(state))
    throw new Error('hireWorker: у цій локації немає де тримати робітників')
  const room = roleCapInHall(state, hallId, roleId)
  if (workersInRole(state, roleId, hallId).length >= room)
    throw new Error(
      `hireWorker: тут більше ${room} робітників ролі "${roleId}" не поміститься`)
  const cost = nextHireCost(state, roleId)
  if (state.money < cost)
    throw new Error(`hireWorker: недостатньо грошей (є ${Math.floor(state.money)}, потрібно ${cost})`)

  const id = makeId ? makeId() : `${roleId}-${now}-${workersOf(state).length}`
  return {
    ...state,
    money:   state.money - cost,
    workers: [...workersOf(state), { id, role: roleId, level: 0, hiredAt: now, hallId }],
  }
}

export const workerById = (state, id) => workersOf(state).find(w => w.id === id) ?? null

// Promote one person, on the shop floor (F5).
//
// On the factory this is the ONLY way to get stronger — the personal upgrade
// tracks are frozen there — so it deliberately costs money and nothing else:
// no bench to return to, no menu to open, just standing next to someone.
export function promoteWorker(state, workerId) {
  const worker = workerById(state, workerId)
  if (!worker) throw new Error(`promoteWorker: робітника "${workerId}" не знайдено`)
  const cost = promoteCost(worker.role, worker.level ?? 0)
  if (cost === null)
    throw new Error('promoteWorker: вже максимальний рівень')
  if (state.money < cost)
    throw new Error(`promoteWorker: недостатньо грошей (є ${Math.floor(state.money)}, потрібно ${cost})`)
  return {
    ...state,
    money:   state.money - cost,
    workers: workersOf(state).map(w =>
      w.id === workerId ? { ...w, level: (w.level ?? 0) + 1 } : w),
  }
}

// Free delivery slots right now — how many more kits may be in flight.
export function freeSlots(state) {
  const storageLevel = state.upgrades.storageLevel ?? 0
  const maxSlots     = 1 + (STORAGE_SLOTS_BY_LEVEL[storageLevel] ?? 0)
  return Math.max(0, maxSlots - (state.deliveries ?? []).length)
}

// ── Scrap (Tinder mini-game → free drone assembly) ───────

export function startScrap(state) {
  if (!ruleAt(state, 'hasTrash'))
    throw new Error('startScrap: у цій локації немає смітника')
  if (!idleStations(state).length)
    throw new Error('startScrap: немає вільної станції')
  if (state.scrapAvailable)
    throw new Error('startScrap: вже активовано')
  return { ...state, scrapAvailable: true, scrapRuns: (state.scrapRuns ?? 0) + 1 }
}

// Salvaged parts are put down on a station: a free drone starts assembling.
export function startScrapAssembly(state, stationId) {
  const station = getStation(state, stationId)
  if (station.phase !== Phase.IDLE)
    throw new Error(`startScrapAssembly: станція ${stationId} у фазі ${station.phase}`)
  return {
    ...withStation(state, stationId, () => ({
      ...createStation(stationId, station.defId),
      phase: Phase.ASSEMBLY,
      kitId: 'scrap_drone',
    })),
    scrapAvailable: false,
  }
}

// Called when Tinder game fails — clear scrap mode and award consolation UAH.
export function cancelScrap(state, consolation = 0) {
  return { ...state, scrapAvailable: false, money: state.money + consolation }
}

// ── Piggy bank ────────────────────────────────────────────

// Returns { can: bool, remainingMs: number }.
export function canOpenPiggy(state, now = Date.now()) {
  if (state.lastPiggyAt == null) return { can: true, remainingMs: 0 }
  const remaining = PIGGY_COOLDOWN_MS - (now - state.lastPiggyAt)
  return remaining <= 0
    ? { can: true, remainingMs: 0 }
    : { can: false, remainingMs: remaining }
}

// Awards money for taps (capped), sets lastPiggyAt. Pure/immutable.
export function collectPiggy(state, taps, now = Date.now()) {
  const payout = Math.min(taps * PIGGY_TAP_VALUE, PIGGY_MAX_PAYOUT)
  return { ...state, money: state.money + payout, lastPiggyAt: now }
}

// Generic over any track registered in UPGRADE_TRACKS.
export function buyUpgrade(state, trackId) {
  const track = UPGRADE_TRACKS[trackId]
  if (!track)
    throw new Error(`buyUpgrade: невідомий апгрейд "${trackId}"`)
  const level = state.upgrades[track.stateKey] ?? 0
  if (level >= track.costs.length)
    throw new Error('buyUpgrade: апгрейд вже на максимальному рівні')
  const cap   = capFor(state, trackId)
  if (level >= cap)
    throw new Error(`buyUpgrade: апгрейд "${trackId}" заблоковано в поточній локації`)
  const cost = track.costs[level]
  if (state.money < cost)
    throw new Error(`buyUpgrade: недостатньо грошей (є ${state.money}, потрібно ${cost})`)
  return {
    ...state,
    money:    state.money - cost,
    upgrades: { ...state.upgrades, [track.stateKey]: level + 1 },
  }
}

// ── Apartment rooms (П2) ──────────────────────────────────
//
// Deliberately the same three functions as the halls below, in the same order.
// The two are not shared code: a hall is gated on staffing the ones you have,
// a room on the tools you own, and folding those into one predicate would give
// the flat a condition nobody would understand.

export const openRoomIds = (state) =>
  APARTMENT_ROOM_IDS.slice(0, Math.max(1, (state.unlockedRooms ?? []).length))

export const nextRoomId = (state) => APARTMENT_ROOM_IDS[openRoomIds(state).length] ?? null

export function canUnlockRoom(state, roomId) {
  if (!LOCATIONS[state.locationId ?? 'apartment']?.rooms)
    return { can: false, reasons: ['Кімнати добудовуються лише вдома'] }

  const expected = nextRoomId(state)
  if (!expected)           return { can: false, reasons: ['Усі кімнати вже відкриті'] }
  if (roomId !== expected) return { can: false, reasons: ['Кімнати відкриваються по черзі'] }

  const room    = roomDef(roomId)
  const reasons = []
  if (state.money < room.cost)
    reasons.push(`Потрібно $${room.cost} (є $${Math.floor(state.money)})`)

  for (const [trackId, minLevel] of Object.entries(room.req?.minUpgrades ?? {})) {
    const track   = UPGRADE_TRACKS[trackId]
    const current = track ? (state.upgrades[track.stateKey] ?? 0) : 0
    if (current < minLevel) reasons.push(`${track?.name ?? trackId}: рівень ${current}/${minLevel}`)
  }

  return { can: reasons.length === 0, reasons }
}

// A room is BOUGHT, not moved into: the money is deducted and what is left is
// still yours. That is the whole reason the garage stopped being a location —
// a move resets the balance (see startMoneyAt), and having the mid-game wipe
// the savings is exactly what made progress impossible to feel.
export function unlockRoom(state, roomId) {
  const { can, reasons } = canUnlockRoom(state, roomId)
  if (!can) throw new Error(`unlockRoom: ${reasons.join('; ')}`)
  return {
    ...state,
    money:         state.money - roomDef(roomId).cost,
    unlockedRooms: [...openRoomIds(state), roomId],
  }
}

// ── Factory halls (F2) ────────────────────────────────────

export const openHallIds = (state) =>
  FACTORY_HALL_IDS.slice(0, Math.max(1, (state.unlockedHalls ?? []).length))

export const nextHallId = (state) => FACTORY_HALL_IDS[openHallIds(state).length] ?? null

// Returns { can, reasons } — the same shape as canMoveToLocation, because the
// panel renders both the same way.
//
// Money is not the only gate. A hall you cannot staff is a wider room you walk
// across, not more production: without the staffing condition the fastest route
// through the factory would be to open everything and run it yourself, which is
// the opposite of what the place is for.
export function canUnlockHall(state, hallId) {
  if ((state.locationId ?? 'apartment') !== 'factory')
    return { can: false, reasons: ['Цехи є лише на фабриці'] }

  const expected = nextHallId(state)
  if (!expected)      return { can: false, reasons: ['Усі цехи вже відкриті'] }
  if (hallId !== expected) return { can: false, reasons: ['Цехи відкриваються по черзі'] }

  const hall    = hallDef(hallId)
  const reasons = []
  if (state.money < hall.cost)
    reasons.push(`Потрібно $${hall.cost} (є $${Math.floor(state.money)})`)

  const missing = ROLE_ORDER
    .filter(id => workersInRole(state, id).length < roleCapHere(state, id))
    .length
  if (missing) reasons.push(`Спершу укомплектуйте відкриті цехи (${missing} вакансій)`)

  return { can: reasons.length === 0, reasons }
}

export function unlockHall(state, hallId) {
  const { can, reasons } = canUnlockHall(state, hallId)
  if (!can) throw new Error(`unlockHall: ${reasons.join('; ')}`)
  return {
    ...state,
    money:         state.money - hallDef(hallId).cost,
    unlockedHalls: [...openHallIds(state), hallId],
  }
}

// Move to a new location (must be further along LOCATION_ORDER, conditions met).
export function moveToLocation(state, targetId) {
  const { can, reasons } = canMoveToLocation(state, targetId)
  if (!can)
    throw new Error(`moveToLocation: ${reasons.join('; ')}`)
  // The cash RESETS rather than being charged: unlockCost proves you can afford
  // the step up, startMoney decides how the next chapter opens. See startMoneyAt.
  // Frozen tracks are snapshotted here, on arrival — the level you walked in
  // with becomes the ceiling (F1.4).
  const frozen = freezeCapsFor(state, targetId)
  return {
    ...state,
    money:      startMoneyAt(targetId),
    locationId: targetId,
    ...(Object.keys(frozen).length ? { frozenCaps: { ...state.frozenCaps, ...frozen } } : {}),
  }
}
