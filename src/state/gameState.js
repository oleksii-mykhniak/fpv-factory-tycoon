export const Phase = Object.freeze({
  IDLE: 'IDLE',
  ORDERED: 'ORDERED',
  DELIVERY: 'DELIVERY',
  ASSEMBLY: 'ASSEMBLY',
  READY: 'READY',
})

export const KIT_TYPES = Object.freeze({
  mini_drone: {
    id: 'mini_drone',
    name: 'Міні-дрон',
    cost: 72,
    basePrice: 95,
    solderPointCount: 4,
  },
})

export function createState() {
  return {
    money: 120,
    phase: Phase.IDLE,
    activeKit: null,        // KIT_TYPES key
    solderPoints: [],       // quality values [0..1] per solder point
    assemblyQuality: null,  // final quality, set by finishAssembly
    upgrades: {
      priceMultiplier: 1,   // grows with per-type upgrade tree (Axis B)
    },
  }
}

// ціна = база × (0.6 + 0.7 × якість) × множник_прокачки
export function calcPrice(basePrice, quality, priceMultiplier = 1) {
  return basePrice * (0.6 + 0.7 * quality) * priceMultiplier
}

export function calcQuality(solderPoints) {
  if (!solderPoints.length) return 0
  return solderPoints.reduce((sum, q) => sum + q, 0) / solderPoints.length
}

// --- FSM transitions ---

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
    money: state.money - kit.cost,
    phase: Phase.ORDERED,
    activeKit: kitTypeId,
    solderPoints: [],
    assemblyQuality: null,
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

export function finishAssembly(state) {
  if (state.phase !== Phase.ASSEMBLY)
    throw new Error(`finishAssembly: недозволено у фазі ${state.phase}`)

  const kit = KIT_TYPES[state.activeKit]
  if (state.solderPoints.length < kit.solderPointCount)
    throw new Error(
      `finishAssembly: потрібно ${kit.solderPointCount} точок, є ${state.solderPoints.length}`
    )

  return {
    ...state,
    phase: Phase.READY,
    assemblyQuality: calcQuality(state.solderPoints),
  }
}

export function sell(state) {
  if (state.phase !== Phase.READY)
    throw new Error(`sell: недозволено у фазі ${state.phase}`)

  const kit = KIT_TYPES[state.activeKit]
  const price = calcPrice(kit.basePrice, state.assemblyQuality, state.upgrades.priceMultiplier)

  return {
    ...state,
    money: state.money + price,
    phase: Phase.IDLE,
    activeKit: null,
    solderPoints: [],
    assemblyQuality: null,
  }
}
