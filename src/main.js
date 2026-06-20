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
  COLD_SOLDER_THRESHOLD, SALVAGE_RATE,
  COLD_SOLDER_QUALITY_PENALTY,
} from './state/config.js'
import { levelData, SOLDER_MODE } from './state/upgrades.js'
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

// ── Loading overlay ──────────────────────────────────────

const loadOverlay = document.getElementById('load-overlay')
const loadBar     = document.getElementById('load-bar')

function hideOverlay() {
  loadOverlay.classList.add('hidden')
  // Remove from DOM after fade so it doesn't block touches.
  loadOverlay.addEventListener('transitionend', () => loadOverlay.remove(), { once: true })
}

// 2D scene — initScene is async (loads sprites before first draw).
// sceneRefs starts null; draw() calls updateScene only when ready.
let sceneRefs = null
initScene(canvas, {
  onBoxPicked: () => {
    if (state.phase === Phase.DELIVERY) update(startAssembly(state))
  },
  onSolderRequested: () => { /* T3: open mini-game modal here */ },
  onLoadProgress: (loaded, total) => {
    if (loadBar) loadBar.style.width = `${Math.round((loaded / total) * 100)}%`
  },
}).then(refs => {
  sceneRefs = refs
  hideOverlay()
  draw()
})

// ── Debug FPS counter ─────────────────────────────────────
if (import.meta.env.MODE === 'debug') {
  const fpsEl = Object.assign(document.createElement('div'), {
    id: 'fps-counter',
    style: 'position:fixed;top:6px;right:8px;color:#7de07d;font:bold 13px monospace;' +
           'background:rgba(0,0,0,.55);padding:2px 6px;border-radius:4px;pointer-events:none;z-index:9999',
  })
  document.body.appendChild(fpsEl)
  setInterval(() => {
    const fps = sceneRefs?.engine?.getFps()
    if (fps != null) fpsEl.textContent = `${fps.toFixed(0)} FPS`
  }, 500)
}

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
  const data = levelData('soldering', state.upgrades.solderingLevel)
  autoTimer = setTimeout(() => {
    autoTimer = null
    if (state.phase !== Phase.ASSEMBLY) return

    const q = data.qualityMin + Math.random() * (data.qualityMax - data.qualityMin)
    const kit = KIT_TYPES[state.activeKit]
    state = recordSolderPoint(state, q)
    if (state.solderPoints.length >= kit.solderPointCount) state = finishAssembly(state)
    draw()
    if (state.phase === Phase.ASSEMBLY) scheduleAutoPoint()
  }, data.pointDelayMs)
}

// ── Solder params per level (manual mini-game) ───────────

function solderParams(level) {
  const data = levelData('soldering', level)
  return { greenHalf: data.greenHalf, overheatChance: data.overheatChance }
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
  const mode  = levelData('soldering', level).mode

  // Manual levels: spin up the reaction mini-game
  const sgHost = uiRoot.querySelector('#sg-host')
  if (sgHost && mode === SOLDER_MODE.MANUAL) {
    const { greenHalf } = solderParams(level)
    activeGame = createSolderGame(sgHost, {
      pointIndex: state.solderPoints.length,
      greenHalf,
      onResult: handleSolderResult,
    })
  }

  // Auto level: start the background solder loop if not already running
  if (state.phase === Phase.ASSEMBLY && mode === SOLDER_MODE.AUTO && autoTimer === null) {
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
    const kit  = KIT_TYPES[state.activeKit]
    const data = levelData('soldering', state.upgrades.solderingLevel)
    let s = state
    while (s.solderPoints.length < kit.solderPointCount) {
      const q = data.qualityMin + Math.random() * (data.qualityMax - data.qualityMin)
      s = recordSolderPoint(s, q)
    }
    update(finishAssembly(s))
  },
  onBuyUpgrade: (id) => update(buyUpgrade(state, id)),
}

draw()
