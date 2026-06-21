import {
  STARTING_MONEY,
  PRICE_BASE_COEFF, PRICE_QUALITY_COEFF,
} from './config.js'
import { UPGRADE_TRACKS } from './upgrades.js'
import { KIT_TYPES } from './kits.js'

// Re-export so existing consumers keep importing kit data from gameState.js.
export { KIT_TYPES }

export const Phase = Object.freeze({
  IDLE:     'IDLE',
  ORDERED:  'ORDERED',
  DELIVERY: 'DELIVERY',
  ASSEMBLY: 'ASSEMBLY',
  READY:    'READY',
  BURNT:    'BURNT',   // part overheated during assembly
})

export function createState() {
  return {
    money:              STARTING_MONEY,
    phase:              Phase.IDLE,
    activeKit:          null,
    solderPoints:       [],
    assemblyQuality:    null,
    coldSolderPenalty:  0,   // accumulated quality cap reduction from cold-solder misses
    upgrades: {
      priceMultiplier:  1,
      solderingLevel:   0,  // 0=manual, 1=better iron, 2=semi-auto, 3=auto
      workerLevel:      0,  // 0=manual, 1=auto-deliver, 2=full-auto
      consumablesLevel: 0,  // 0=cheap solder, 1=good flux, 2=silver solder
    },
  }
}

// ціна = база × (BASE_COEFF + QUALITY_COEFF × якість) × множник
export function calcPrice(basePrice, quality, priceMultiplier = 1) {
  return basePrice * (PRICE_BASE_COEFF + PRICE_QUALITY_COEFF * quality) * priceMultiplier
}

export function calcQuality(solderPoints) {
  if (!solderPoints.length) return 0
  return solderPoints.reduce((sum, q) => sum + q, 0) / solderPoints.length
}

// ── FSM transitions ───────────────────────────────────────

export function orderKit(state, kitTypeId) {
  if (state.phase !== Phase.IDLE)
    throw new Error(`orderKit: недозволено у фазі ${state.phase}`)
  const kit = KIT_TYPES[kitTypeId]
  if (!kit)
    throw new Error(`orderKit: невідомий тип комплекту "${kitTypeId}"`)
  if (state.money < kit.cost)
    throw new Error(`orderKit: недостатньо грошей (є ${state.money}, потрібно ${kit.cost})`)
  return {
    ...state,
    money:             state.money - kit.cost,
    phase:             Phase.ORDERED,
    activeKit:         kitTypeId,
    solderPoints:      [],
    assemblyQuality:   null,
    coldSolderPenalty: 0,
  }
}

export function receiveDelivery(state) {
  if (state.phase !== Phase.ORDERED)
    throw new Error(`receiveDelivery: недозволено у фазі ${state.phase}`)
  return { ...state, phase: Phase.DELIVERY }
}

export function startAssembly(state) {
  if (state.phase !== Phase.DELIVERY)
    throw new Error(`startAssembly: недозволено у фазі ${state.phase}`)
  return { ...state, phase: Phase.ASSEMBLY }
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
  return {
    ...state,
    money:             state.money + salvage,
    phase:             Phase.IDLE,
    activeKit:         null,
    solderPoints:      [],
    assemblyQuality:   null,
    coldSolderPenalty: 0,
  }
}

export function sell(state) {
  if (state.phase !== Phase.READY)
    throw new Error(`sell: недозволено у фазі ${state.phase}`)
  const kit   = KIT_TYPES[state.activeKit]
  const price = calcPrice(kit.basePrice, state.assemblyQuality, state.upgrades.priceMultiplier)
  return {
    ...state,
    money:             state.money + price,
    phase:             Phase.IDLE,
    activeKit:         null,
    solderPoints:      [],
    assemblyQuality:   null,
    coldSolderPenalty: 0,
  }
}

// Generic over any track registered in UPGRADE_TRACKS.
export function buyUpgrade(state, trackId) {
  const track = UPGRADE_TRACKS[trackId]
  if (!track)
    throw new Error(`buyUpgrade: невідомий апгрейд "${trackId}"`)
  const level = state.upgrades[track.stateKey] ?? 0
  if (level >= track.costs.length)
    throw new Error('buyUpgrade: апгрейд вже на максимальному рівні')
  const cost = track.costs[level]
  if (state.money < cost)
    throw new Error(`buyUpgrade: недостатньо грошей (є ${state.money}, потрібно ${cost})`)
  return {
    ...state,
    money:    state.money - cost,
    upgrades: { ...state.upgrades, [track.stateKey]: level + 1 },
  }
}
