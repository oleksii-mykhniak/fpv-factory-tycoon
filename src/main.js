import './style.css'
import { saveGame, loadGame } from './save/storage.js'
import {
  createState, Phase, KIT_TYPES,
  orderKit, receiveDelivery, startAssembly,
  recordSolderPoint, finishAssembly, sell,
  burnKit, abandonBurntDrone, buyUpgrade,
  applyColdSolderPenalty,
  calcPrice,
} from './state/gameState.js'
import {
  DELIVERY_DELAY_MS,
  COLD_SOLDER_THRESHOLD, OVERHEAT_CHANCE, SALVAGE_RATE,
  COLD_SOLDER_QUALITY_PENALTY,
  SOLDER_GREEN_HALF,
  BETTER_IRON_GREEN_HALF, BETTER_IRON_OVERHEAT_CHANCE,
  SEMIAUTO_QUALITY_MIN, SEMIAUTO_QUALITY_MAX,
  AUTO_QUALITY_MIN, AUTO_QUALITY_MAX, AUTO_POINT_DELAY_MS,
} from './state/config.js'
import { render } from './ui/domUI.js'
import { createSolderGame } from './ui/solderGame.js'
import { initScene, updateScene } from './scene/scene.js'

// ── State init: restore save or start fresh ──────────────

function initState() {
  const defaults = createState()
  const saved    = loadGame()
  if (!saved) return { state: defaults, salesLog: [] }

  let state = {
    ...defaults,
    ...saved.state,
    upgrades: { ...defaults.upgrades, ...saved.state.upgrades },
  }
  // Delivery timer ran while the page was closed → deliver immediately on restore.
  if (state.phase === Phase.ORDERED) state = receiveDelivery(state)
  return { state, salesLog: saved.salesLog }
}

const loaded   = initState()
let state      = loaded.state
const salesLog = loaded.salesLog

let activeGame    = null
let autoTimer     = null
let deliveryTimer = null
let warning       = null
const uiRoot   = document.getElementById('ui-root')
const canvas   = document.getElementById('game-canvas')

// 3D scene — always alive; updateScene() syncs visibility each draw.
const sceneRefs = initScene(canvas, {
  onBoxPicked: () => {
    if (state.phase === Phase.DELIVERY) update(startAssembly(state))
  },
})

// ── Delivery timer ───────────────────────────────────────

function clearDeliveryTimer() {
  if (deliveryTimer !== null) { clearTimeout(deliveryTimer); deliveryTimer = null }
}

function scheduleDelivery() {
  deliveryTimer = setTimeout(() => {
    deliveryTimer = null
    if (state.phase === Phase.ORDERED) update(receiveDelivery(state))
  }, DELIVERY_DELAY_MS)
}

// ── Auto-solder timer ────────────────────────────────────

function clearAutoTimer() {
  if (autoTimer !== null) { clearTimeout(autoTimer); autoTimer = null }
}

function scheduleAutoPoint() {
  autoTimer = setTimeout(() => {
    autoTimer = null
    if (state.phase !== Phase.ASSEMBLY) return

    const q = AUTO_QUALITY_MIN + Math.random() * (AUTO_QUALITY_MAX - AUTO_QUALITY_MIN)
    const kit = KIT_TYPES[state.activeKit]
    state = recordSolderPoint(state, q)
    if (state.solderPoints.length >= kit.solderPointCount) state = finishAssembly(state)
    draw()
    if (state.phase === Phase.ASSEMBLY) scheduleAutoPoint()
  }, AUTO_POINT_DELAY_MS)
}

// ── Solder params per level ──────────────────────────────

function solderParams(level) {
  if (level >= 1) return { greenHalf: BETTER_IRON_GREEN_HALF, overheatChance: BETTER_IRON_OVERHEAT_CHANCE }
  return { greenHalf: SOLDER_GREEN_HALF, overheatChance: OVERHEAT_CHANCE }
}

// ── Failure classification ───────────────────────────────

function canAffordAfterBurn() {
  const kit = KIT_TYPES[state.activeKit]
  return state.money + kit.cost * SALVAGE_RATE >= kit.cost
}

function handleSolderResult(quality) {
  const { overheatChance } = solderParams(state.upgrades.solderingLevel)
  if (quality < COLD_SOLDER_THRESHOLD) {
    if (Math.random() < overheatChance && canAffordAfterBurn()) {
      update(burnKit(state))
    } else {
      // Cold solder: apply quality cap penalty and retry the same point.
      warning = 'cold'
      update(applyColdSolderPenalty(state, COLD_SOLDER_QUALITY_PENALTY))
    }
    return
  }
  update(recordSolderPoint(state, quality))
}

// ── Draw ─────────────────────────────────────────────────

function draw() {
  if (activeGame) { activeGame.destroy(); activeGame = null }

  render(uiRoot, state, handlers, salesLog, warning)
  warning = null

  const level = state.upgrades.solderingLevel

  // Level 0-1: manual mini-game
  const sgHost = uiRoot.querySelector('#sg-host')
  if (sgHost && level <= 1) {
    const { greenHalf } = solderParams(level)
    activeGame = createSolderGame(sgHost, {
      pointIndex: state.solderPoints.length,
      greenHalf,
      onResult: handleSolderResult,
    })
  }

  // Level 3: start auto-solder if not already running
  if (state.phase === Phase.ASSEMBLY && level === 3 && autoTimer === null) {
    scheduleAutoPoint()
  }

  updateScene(sceneRefs, state.phase)
}

function update(newState) {
  if (newState.phase !== Phase.ORDERED)   clearDeliveryTimer()
  if (newState.phase !== Phase.ASSEMBLY)  clearAutoTimer()
  state = newState
  saveGame(state, salesLog)
  if (state.phase === Phase.ORDERED && deliveryTimer === null) scheduleDelivery()
  draw()
}

// ── Handlers ─────────────────────────────────────────────

const handlers = {
  onOrder:   () => update(orderKit(state, 'mini_drone')),
  onStart:   () => update(startAssembly(state)),
  onFinish:  () => update(finishAssembly(state)),
  onAbandon: () => update(abandonBurntDrone(state, SALVAGE_RATE)),
  onSell: () => {
    const kit   = KIT_TYPES[state.activeKit]
    const price = calcPrice(kit.basePrice, state.assemblyQuality, state.upgrades.priceMultiplier)
    salesLog.push({ quality: state.assemblyQuality, price })
    update(sell(state))
  },
  onSemiAuto: () => {
    const kit = KIT_TYPES[state.activeKit]
    let s = state
    while (s.solderPoints.length < kit.solderPointCount) {
      const q = SEMIAUTO_QUALITY_MIN + Math.random() * (SEMIAUTO_QUALITY_MAX - SEMIAUTO_QUALITY_MIN)
      s = recordSolderPoint(s, q)
    }
    update(finishAssembly(s))
  },
  onBuyUpgrade: (id) => update(buyUpgrade(state, id)),
}

draw()
