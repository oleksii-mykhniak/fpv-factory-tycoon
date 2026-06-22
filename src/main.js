import './style.css'
import { saveGame, loadGame, clearSave } from './save/storage.js'
import {
  createState, Phase, DeliveryStatus, KIT_TYPES,
  orderKit, startAssembly, pickupDelivery,
  recordSolderPoint, finishAssembly, sell,
  burnKit, abandonBurntDrone, buyUpgrade,
  applyColdSolderPenalty,
  calcPrice,
  canOpenPiggy, collectPiggy,
} from './state/gameState.js'
import {
  COLD_SOLDER_THRESHOLD, SALVAGE_RATE,
  COLD_SOLDER_QUALITY_PENALTY,
} from './state/config.js'
import { levelData, SOLDER_MODE, WORKER_MODE } from './state/upgrades.js'
import { createHUD } from './ui/hud.js'
import { createActionBar } from './ui/actionBar.js'
import { createShopModal } from './ui/shopModal.js'
import { createUpgradeModal } from './ui/upgradeModal.js'
import { createSettingsModal } from './ui/settingsModal.js'
import { createSolderModal } from './ui/solderModal.js'
import { createPiggyModal } from './ui/piggyModal.js'
import { initScene, updateScene } from './scene/scene.js'

// ── State init ────────────────────────────────────────────

// Migrate saves written before the per-delivery-status refactor.
// Old saves may have phase=ORDERED/DELIVERY, activeDeliveryReadyAt,
// activeSlotIndex, and deliveryQueue instead of deliveries[].
function migrateState(raw) {
  let s = raw
  const now = Date.now()

  // Convert legacy deliveryQueue → deliveries
  if (!s.deliveries && s.deliveryQueue) {
    s = {
      ...s,
      deliveries: (s.deliveryQueue ?? []).map(d => ({ ...d, status: DeliveryStatus.TRANSIT })),
    }
  }
  if (!s.deliveries) s = { ...s, deliveries: [] }

  // Convert legacy ORDERED / DELIVERY phase → IDLE + delivery entry
  if (s.phase === 'ORDERED' || s.phase === 'DELIVERY') {
    const readyAt = s.phase === 'DELIVERY'
      ? now - 1   // already arrived — force readyAt in past
      : (s.activeDeliveryReadyAt ?? now)
    const primary = {
      id:       `migrated-${now}`,
      kitId:    s.activeKit,
      slotIndex: s.activeSlotIndex ?? 0,
      readyAt,
      status:   DeliveryStatus.TRANSIT,
    }
    s = {
      ...s,
      phase:     Phase.IDLE,
      activeKit: null,
      deliveries: [primary, ...s.deliveries.filter(d => d.slotIndex !== primary.slotIndex)],
    }
  }

  return s
}

function initState() {
  const defaults = createState()
  const saved    = loadGame()
  if (!saved) return { state: defaults, salesLog: [] }

  let state = {
    ...defaults,
    ...saved.state,
    upgrades: { ...defaults.upgrades, ...saved.state.upgrades },
  }
  state = migrateState(state)
  return { state, salesLog: saved.salesLog }
}

const loaded   = initState()
let state      = loaded.state
const salesLog = loaded.salesLog

let autoTimer         = null
let deliveryCheckTimer = null  // fires draw() when earliest transit delivery arrives
let warning           = null

const uiRoot = document.getElementById('ui-root')
const canvas = document.getElementById('game-canvas')

// ── UI components ─────────────────────────────────────────

const hud = createHUD(uiRoot)

const shopModal = createShopModal(uiRoot, {
  onOrder: (kitId) => update(orderKit(state, kitId)),
})

const upgradeModal = createUpgradeModal(uiRoot, {
  onBuyUpgrade: (id) => update(buyUpgrade(state, id)),
})

const settingsModal = createSettingsModal(uiRoot, {
  onClearSave: () => {
    clearSave()
    location.reload()
  },
})

const solderModal = createSolderModal(uiRoot, {
  onSolderResult: handleSolderResult,
  onAbandon:      () => update(abandonBurntDrone(state, SALVAGE_RATE)),
})

const piggyModal = createPiggyModal(uiRoot, {
  onCollect: (taps) => update(collectPiggy(state, taps, Date.now())),
})

const actionBar = createActionBar(uiRoot, {
  onShopOpen:     () => shopModal.open(state),
  onUpgradeOpen:  () => upgradeModal.open(state),
  onSettingsOpen: () => settingsModal.open(),
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
    // Worker delivered box to bench — any carrying delivery triggers assembly.
    const hasCarrying = (state.deliveries ?? []).some(d => d.status === DeliveryStatus.CARRYING)
    if (hasCarrying) update(startAssembly(state))
  },
  onPiggyRequested: () => {
    const { can } = canOpenPiggy(state, Date.now())
    if (can) piggyModal.open()
  },
  onSolderRequested: () => {
    const level  = state.upgrades.solderingLevel
    const { mode } = levelData('soldering', level)

    if (mode === SOLDER_MODE.MANUAL) {
      solderModal.open(state)
      return
    }
    if (mode === SOLDER_MODE.SEMI) {
      scheduleAutoPoint()
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
  onSlotTapped: (deliveryId) => {
    if (state.phase !== Phase.IDLE) return
    const now      = Date.now()
    const delivery = (state.deliveries ?? []).find(d => d.id === deliveryId)
    if (!delivery || delivery.readyAt > now) return
    update(pickupDelivery(state, deliveryId, now))
    // MANUAL worker: draw() won't auto-deliver — trigger explicitly
    const workerMode = levelData('worker', state.upgrades.workerLevel ?? 0).mode
    if (workerMode === WORKER_MODE.MANUAL) {
      sceneRefs?.worker?.commandDeliver(sceneRefs?.activeBoxSpawn)
    }
  },
}).then(refs => {
  sceneRefs = refs
  hideOverlay()
  draw()
})

// ── Timers ────────────────────────────────────────────────

function clearAutoTimer() {
  if (autoTimer !== null) { clearTimeout(autoTimer); autoTimer = null }
}

function clearDeliveryCheckTimer() {
  if (deliveryCheckTimer !== null) { clearTimeout(deliveryCheckTimer); deliveryCheckTimer = null }
}

// Schedule draw() for when the earliest transit delivery arrives.
// Fires regardless of bench phase so indicators update and auto-pickup triggers.
function scheduleDeliveryCheck() {
  clearDeliveryCheckTimer()
  const transit = (state.deliveries ?? []).filter(d => d.status === DeliveryStatus.TRANSIT)
  if (!transit.length) return
  const now  = Date.now()
  const next = transit.reduce((min, d) => Math.min(min, d.readyAt), Infinity)
  if (next <= now) { draw(); return }
  deliveryCheckTimer = setTimeout(() => { deliveryCheckTimer = null; draw() }, next - now + 50)
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

function handleSolderResult(quality) {
  const solderLevel      = state.upgrades.solderingLevel
  const consumablesLevel = state.upgrades.consumablesLevel ?? 0
  const overheatChance   = levelData('soldering', solderLevel).overheatChance
  const fluxData         = levelData('consumables', consumablesLevel)
  const effectiveOverheat = overheatChance * fluxData.overheatMult
  const boostedQuality    = Math.min(1, quality + fluxData.qualityBonus)

  if (boostedQuality < COLD_SOLDER_THRESHOLD) {
    if (Math.random() < effectiveOverheat) {
      update(burnKit(state))
    } else {
      warning = 'cold'
      update(applyColdSolderPenalty(state, COLD_SOLDER_QUALITY_PENALTY))
    }
    return
  }
  const newState = recordSolderPoint(state, boostedQuality)
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
  actionBar.update(state)
  shopModal.update(state)
  upgradeModal.update(state)
  solderModal.update(state, warning)
  warning = null

  const level = state.upgrades.solderingLevel
  const mode  = levelData('soldering', level).mode

  if (state.phase === Phase.ASSEMBLY && mode === SOLDER_MODE.AUTO && autoTimer === null) {
    scheduleAutoPoint()
  }

  // Sync scene state BEFORE issuing worker commands:
  //   – updates _carryingSlotIndex so commandDeliver targets the right street slot
  //   – fires worker.reset() for IDLE so workerCanDeliver is true on auto-pickup
  //   – parks carry box off-screen during IDLE (no pointer interference with slot indicators)
  const minCost        = Math.min(...Object.values(KIT_TYPES).map(k => k.cost))
  const showPiggy      = state.money < minCost && state.phase === Phase.IDLE
  const droneSpriteKey = state.activeKit ? (KIT_TYPES[state.activeKit]?.spriteKey ?? null) : null
  const carrying       = (state.deliveries ?? []).find(d => d.status === DeliveryStatus.CARRYING)
  updateScene(
    sceneRefs,
    state.phase,
    { show: showPiggy, lastAt: state.lastPiggyAt ?? null },
    droneSpriteKey,
    state.deliveries ?? [],
    carrying?.slotIndex ?? 0,
  )

  const workerMode = levelData('worker', state.upgrades.workerLevel ?? 0).mode

  // IDLE + arrived delivery → auto-pickup (SEMI/AUTO) or schedule timer for arrival (MANUAL).
  if (state.phase === Phase.IDLE && !carrying) {
    const now     = Date.now()
    const arrived = (state.deliveries ?? []).find(d =>
      d.status === DeliveryStatus.TRANSIT && d.readyAt <= now
    )
    if (arrived) {
      if (workerMode === WORKER_MODE.SEMI || workerMode === WORKER_MODE.AUTO) {
        update(pickupDelivery(state, arrived.id, now))
        return
      }
    } else if (deliveryCheckTimer === null) {
      scheduleDeliveryCheck()
    }
  }

  // carrying delivery → trigger worker to fetch it
  if (carrying && (workerMode === WORKER_MODE.SEMI || workerMode === WORKER_MODE.AUTO)) {
    sceneRefs?.worker?.commandDeliver(sceneRefs?.activeBoxSpawn)
  }

  if (state.phase === Phase.ASSEMBLY && workerMode === WORKER_MODE.AUTO) {
    sceneRefs?.worker?.commandSolder()
  }
}

function update(newState) {
  if (newState.phase !== Phase.ASSEMBLY) clearAutoTimer()
  state = newState
  saveGame(state, salesLog)
  scheduleDeliveryCheck()
  draw()
}

draw()
