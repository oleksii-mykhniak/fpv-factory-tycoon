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

export const Phase = Object.freeze({
  IDLE:     'IDLE',
  ASSEMBLY: 'ASSEMBLY',
  READY:    'READY',
  BURNT:    'BURNT',
})

// Per-delivery status — lives inside each deliveries[] entry.
export const DeliveryStatus = Object.freeze({
  TRANSIT:  'transit',   // in transit or arrived but not picked up
  CARRYING: 'carrying',  // worker picked it up, walking to bench
})

export function createState() {
  return {
    money:             STARTING_MONEY,
    phase:             Phase.IDLE,
    activeKit:         null,  // kit currently on bench (ASSEMBLY/READY/BURNT)
    solderPoints:      [],
    assemblyQuality:   null,
    coldSolderPenalty: 0,
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

// Total occupied delivery slots = pending deliveries + bench (if kit is being assembled).
function _usedSlots(state) {
  const pending = (state.deliveries ?? []).length
  const bench   = (state.phase !== Phase.IDLE) ? 1 : 0
  return pending + bench
}

export function orderKit(state, kitTypeId, now = Date.now()) {
  if (state.phase === Phase.BURNT)
    throw new Error(`orderKit: недозволено у фазі ${state.phase}`)

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
  const id         = `${now}-${Math.random().toString(36).slice(2, 7)}`

  return {
    ...state,
    money:     state.money - kit.cost,
    deliveries: [
      ...(state.deliveries ?? []),
      { id, kitId: kitTypeId, slotIndex, readyAt: now + deliveryMs, status: DeliveryStatus.TRANSIT },
    ],
  }
}

// Worker picks up an arrived delivery: TRANSIT → CARRYING.
// Bench must be IDLE and no other delivery currently being carried.
export function pickupDelivery(state, deliveryId, now = Date.now()) {
  if (state.phase !== Phase.IDLE)
    throw new Error(`pickupDelivery: недозволено у фазі ${state.phase}`)
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
      d2.id === deliveryId ? { ...d2, status: DeliveryStatus.CARRYING } : d2
    ),
  }
}

// Worker arrives at bench with box: removes carrying delivery, puts kit on bench.
export function startAssembly(state) {
  if (state.phase !== Phase.IDLE)
    throw new Error(`startAssembly: недозволено у фазі ${state.phase}`)
  const carrying = (state.deliveries ?? []).find(d => d.status === DeliveryStatus.CARRYING)
  if (!carrying)
    throw new Error('startAssembly: немає активної доставки (статус carrying)')
  return {
    ...state,
    phase:      Phase.ASSEMBLY,
    activeKit:  carrying.kitId,
    deliveries: (state.deliveries ?? []).filter(d => d.id !== carrying.id),
  }
}

export function recordSolderPoint(state, quality) {
  if (state.phase !== Phase.ASSEMBLY)
    throw new Error(`recordSolderPoint: недозволено у фазі ${state.phase}`)
  if (quality < 0 || quality > 1)
    throw new Error(`recordSolderPoint: якість має бути від 0 до 1, отримано ${quality}`)
  const kit = KIT_TYPES[state.activeKit]
  if (state.solderPoints.length >= kit.solderPointCount)
    throw new Error(`recordSolderPoint: всі ${kit.solderPointCount} точки вже запаяно`)
  return { ...state, solderPoints: [...state.solderPoints, quality] }
}

export function applyColdSolderPenalty(state, amount) {
  if (state.phase !== Phase.ASSEMBLY)
    throw new Error(`applyColdSolderPenalty: недозволено у фазі ${state.phase}`)
  return {
    ...state,
    coldSolderPenalty: Math.min(1, state.coldSolderPenalty + amount),
  }
}

export function finishAssembly(state) {
  if (state.phase !== Phase.ASSEMBLY)
    throw new Error(`finishAssembly: недозволено у фазі ${state.phase}`)
  const kit = KIT_TYPES[state.activeKit]
  if (state.solderPoints.length < kit.solderPointCount)
    throw new Error(
      `finishAssembly: потрібно ${kit.solderPointCount} точок, є ${state.solderPoints.length}`
    )
  const raw     = calcQuality(state.solderPoints)
  const quality = Math.max(0, raw - state.coldSolderPenalty)
  return { ...state, phase: Phase.READY, assemblyQuality: quality }
}

export function burnKit(state) {
  if (state.phase !== Phase.ASSEMBLY)
    throw new Error(`burnKit: недозволено у фазі ${state.phase}`)
  return { ...state, phase: Phase.BURNT }
}

export function abandonBurntDrone(state, salvageRate = 0) {
  if (state.phase !== Phase.BURNT)
    throw new Error(`abandonBurntDrone: недозволено у фазі ${state.phase}`)
  const kit     = KIT_TYPES[state.activeKit]
  const salvage = kit.cost * salvageRate
  return _afterBenchClear(state, state.money + salvage)
}

export function sell(state) {
  if (state.phase !== Phase.READY)
    throw new Error(`sell: недозволено у фазі ${state.phase}`)
  const kit   = KIT_TYPES[state.activeKit]
  const price = calcPrice(kit.basePrice, state.assemblyQuality, state.upgrades.priceMultiplier)
  return _afterBenchClear(state, state.money + price)
}

// After bench is cleared (sell or abandon): return to IDLE.
// deliveries (transit/carrying) stay intact — any worker independently picks up
// an arrived delivery via pickupDelivery(). This fully decouples bench state
// from per-delivery state and enables parallel multi-worker operation.
function _afterBenchClear(state, newMoney) {
  return {
    ...state,
    money:             newMoney,
    solderPoints:      [],
    assemblyQuality:   null,
    coldSolderPenalty: 0,
    activeKit:         null,
    phase:             Phase.IDLE,
    // deliveries intentionally preserved
  }
}

// ── Scrap (Tinder mini-game → free drone assembly) ───────

export function startScrap(state) {
  if (state.phase !== Phase.IDLE)
    throw new Error('startScrap: недозволено поза фазою IDLE')
  if (state.scrapAvailable)
    throw new Error('startScrap: вже активовано')
  return { ...state, scrapAvailable: true }
}

// Called after successful Tinder game — worker returns to bench, assembly begins.
export function startScrapAssembly(state) {
  if (state.phase !== Phase.IDLE)
    throw new Error('startScrapAssembly: phase must be IDLE')
  return {
    ...state,
    phase:             Phase.ASSEMBLY,
    activeKit:         'scrap_drone',
    scrapAvailable:    false,
    solderPoints:      [],
    assemblyQuality:   null,
    coldSolderPenalty: 0,
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
