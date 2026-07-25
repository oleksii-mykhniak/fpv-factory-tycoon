import {
  STARTING_MONEY,
  PRICE_BASE_COEFF, PRICE_QUALITY_COEFF,
  PIGGY_COOLDOWN_MS, PIGGY_TAP_VALUE, PIGGY_MAX_PAYOUT,
  STORAGE_SLOTS_BY_LEVEL, LOGISTICS_DELIVERY_MULT,
} from './config.js'

import { UPGRADE_TRACKS } from './upgrades.js'
import { KIT_TYPES } from './kits.js'
import { capFor, canMoveToLocation, LOCATIONS } from './locations.js'

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
  }
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
    lastPiggyAt:       null,
    locationId:        'apartment',
    onboarded:         false,
    scrapAvailable:    false, // true when player has "ordered" scrap from the trash
    // All deliveries: [{id, kitId, slotIndex, readyAt, status}]
    // status 'transit'  = en-route or arrived-but-not-picked-up
    // status 'carrying' = worker is carrying it to bench
    deliveries:        [],
    upgrades: {
      priceMultiplier:  1,
      solderingLevel:   0,
      workerLevel:      0,
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
  return withStation(state, stationId, s => ({ ...s, phase: Phase.READY, quality }))
}

export function burnKit(state, stationId) {
  const station = getStation(state, stationId)
  if (station.phase !== Phase.ASSEMBLY)
    throw new Error(`burnKit: станція ${stationId} у фазі ${station.phase}`)
  return withStation(state, stationId, s => ({ ...s, phase: Phase.BURNT }))
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
  return _afterStationClear(state, stationId, state.money + price)
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

// ── Scrap (Tinder mini-game → free drone assembly) ───────

export function startScrap(state) {
  if (!idleStations(state).length)
    throw new Error('startScrap: немає вільної станції')
  if (state.scrapAvailable)
    throw new Error('startScrap: вже активовано')
  return { ...state, scrapAvailable: true }
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

// Move to a new location (must be further along LOCATION_ORDER, conditions met).
export function moveToLocation(state, targetId) {
  const { can, reasons } = canMoveToLocation(state, targetId)
  if (!can)
    throw new Error(`moveToLocation: ${reasons.join('; ')}`)
  const target = LOCATIONS[targetId]
  return {
    ...state,
    money:      state.money - target.unlockCost,
    locationId: targetId,
  }
}
