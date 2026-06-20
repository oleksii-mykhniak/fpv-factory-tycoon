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
import { createHUD } from './ui/hud.js'
import { createShopModal } from './ui/shopModal.js'
import { createSolderModal } from './ui/solderModal.js'
import { initScene, updateScene } from './scene/scene.js'

// ── State init ────────────────────────────────────────────

function initState() {
  const defaults = createState()
  const saved    = loadGame()
  if (!saved) return { state: defaults, salesLog: [] }

  let state = {
    ...defaults,
    ...saved.state,
    upgrades: { ...defaults.upgrades, ...saved.state.upgrades },
  }
  if (state.phase === Phase.ORDERED) state = receiveDelivery(state)
  return { state, salesLog: saved.salesLog }
}

const loaded   = initState()
let state      = loaded.state
const salesLog = loaded.salesLog

let autoTimer     = null
let deliveryTimer = null
let warning       = null

const uiRoot = document.getElementById('ui-root')
const canvas = document.getElementById('game-canvas')

// ── UI components ─────────────────────────────────────────

const hud = createHUD(uiRoot, {
  onShopOpen: () => shopModal.open(state),
})

const shopModal = createShopModal(uiRoot, {
  onOrder:      (kitId) => update(orderKit(state, kitId)),
  onBuyUpgrade: (id)    => update(buyUpgrade(state, id)),
})

const solderModal = createSolderModal(uiRoot, {
  onSolderResult: handleSolderResult,
  onAbandon:      () => update(abandonBurntDrone(state, SALVAGE_RATE)),
})

// ── Loading overlay ───────────────────────────────────────

const loadOverlay = document.getElementById('load-overlay')
const loadBar     = document.getElementById('load-bar')

function hideOverlay() {
  loadOverlay.classList.add('hidden')
  loadOverlay.addEventListener('transitionend', () => loadOverlay.remove(), { once: true })
}

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

// ── Scene ─────────────────────────────────────────────────

let sceneRefs = null
initScene(canvas, {
  onBoxPicked: () => {
    if (state.phase === Phase.DELIVERY) update(startAssembly(state))
  },
  onSolderRequested: () => {
    const level  = state.upgrades.solderingLevel
    const { mode } = levelData('soldering', level)

    if (mode === SOLDER_MODE.MANUAL) {
      solderModal.open(state)
      return
    }
    if (mode === SOLDER_MODE.SEMI) {
      const kit  = KIT_TYPES[state.activeKit]
      const data = levelData('soldering', level)
      let s = state
      while (s.solderPoints.length < kit.solderPointCount) {
        const q = data.qualityMin + Math.random() * (data.qualityMax - data.qualityMin)
        s = recordSolderPoint(s, q)
      }
      const next = finishAssembly(s)
      sceneRefs?.worker?.notifySolderDone()
      update(next)
      return
    }
    // AUTO: solder fires via scheduleAutoPoint — bench tap is no-op
  },
  onSellRequested: () => {
    if (state.phase !== Phase.READY) return
    const kit   = KIT_TYPES[state.activeKit]
    const price = calcPrice(kit.basePrice, state.assemblyQuality, state.upgrades.priceMultiplier)
    salesLog.push({ quality: state.assemblyQuality, price })
    update(sell(state))
  },
  onLoadProgress: (loaded, total) => {
    if (loadBar) loadBar.style.width = `${Math.round((loaded / total) * 100)}%`
  },
}).then(refs => {
  sceneRefs = refs
  hideOverlay()
  draw()
})

// ── Timers ────────────────────────────────────────────────

function clearDeliveryTimer() {
  if (deliveryTimer !== null) { clearTimeout(deliveryTimer); deliveryTimer = null }
}

function scheduleDelivery() {
  deliveryTimer = setTimeout(() => {
    deliveryTimer = null
    if (state.phase === Phase.ORDERED) update(receiveDelivery(state))
  }, DELIVERY_DELAY_MS)
}

function clearAutoTimer() {
  if (autoTimer !== null) { clearTimeout(autoTimer); autoTimer = null }
}

function scheduleAutoPoint() {
  const data = levelData('soldering', state.upgrades.solderingLevel)
  autoTimer = setTimeout(() => {
    autoTimer = null
    if (state.phase !== Phase.ASSEMBLY) return

    const q   = data.qualityMin + Math.random() * (data.qualityMax - data.qualityMin)
    const kit = KIT_TYPES[state.activeKit]
    const s   = recordSolderPoint(state, q)
    if (s.solderPoints.length >= kit.solderPointCount) {
      const next = finishAssembly(s)
      sceneRefs?.worker?.notifySolderDone()
      update(next)
    } else {
      update(s)
      scheduleAutoPoint()
    }
  }, data.pointDelayMs)
}

// ── Solder result handler ─────────────────────────────────

function solderParams(level) {
  return { overheatChance: levelData('soldering', level).overheatChance }
}

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
      warning = 'cold'
      update(applyColdSolderPenalty(state, COLD_SOLDER_QUALITY_PENALTY))
    }
    return
  }
  const newState = recordSolderPoint(state, quality)
  const kit      = KIT_TYPES[newState.activeKit]
  if (newState.solderPoints.length >= kit.solderPointCount) {
    const finished = finishAssembly(newState)
    sceneRefs?.worker?.notifySolderDone()
    update(finished)
  } else {
    update(newState)
  }
}

// ── Draw ──────────────────────────────────────────────────

function draw() {
  hud.update(state)
  shopModal.update(state)
  solderModal.update(state, warning)
  warning = null

  const level = state.upgrades.solderingLevel
  const mode  = levelData('soldering', level).mode

  // Auto mode: start background solder loop if not running
  if (state.phase === Phase.ASSEMBLY && mode === SOLDER_MODE.AUTO && autoTimer === null) {
    scheduleAutoPoint()
  }

  updateScene(sceneRefs, state.phase)
}

function update(newState) {
  if (newState.phase !== Phase.ORDERED)  clearDeliveryTimer()
  if (newState.phase !== Phase.ASSEMBLY) clearAutoTimer()
  state = newState
  saveGame(state, salesLog)
  if (state.phase === Phase.ORDERED && deliveryTimer === null) scheduleDelivery()
  draw()
}

draw()
