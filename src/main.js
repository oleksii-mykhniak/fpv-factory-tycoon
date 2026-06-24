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
  moveToLocation,
} from './state/gameState.js'
import {
  COLD_SOLDER_THRESHOLD, SALVAGE_RATE,
  COLD_SOLDER_QUALITY_PENALTY,
  ADS_ENABLED,
} from './state/config.js'
import { levelData, SOLDER_MODE, WORKER_MODE } from './state/upgrades.js'
import { currentLocation } from './state/locations.js'
import { playSfx, setMuted } from './audio/sfx.js'
import { showRewarded, PLACEMENTS } from './monetization/ads.js'
import { createHUD } from './ui/hud.js'
import { createActionBar } from './ui/actionBar.js'
import { createShopModal } from './ui/shopModal.js'
import { createUpgradeModal } from './ui/upgradeModal.js'
import { createSettingsModal } from './ui/settingsModal.js'
import { createSolderModal } from './ui/solderModal.js'
import { createPiggyModal } from './ui/piggyModal.js'
import { initScene, updateScene, applyLocationTheme } from './scene/scene.js'

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
    upgrades:   { ...defaults.upgrades, ...saved.state.upgrades },
    locationId: saved.state.locationId ?? defaults.locationId,
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

// ── Haptics ───────────────────────────────────────────────

let hapticsEnabled = true

function haptic(style = 'light') {
  if (!hapticsEnabled) return
  try {
    const ms = style === 'heavy' ? 50 : style === 'medium' ? 30 : 15
    navigator.vibrate?.(ms)
  } catch {}
}

// ── Onboarding ────────────────────────────────────────────

const onboardingEl = document.createElement('div')
onboardingEl.id = 'onboarding'
onboardingEl.innerHTML = `
  <div class="onboarding__box">
    <div class="onboarding__title">Як грати</div>
    <div class="onboarding__steps">
      <span class="onboarding__step">🛒 Замов дрон</span>
      <span class="onboarding__arrow">→</span>
      <span class="onboarding__step">🔧 Запаяй</span>
      <span class="onboarding__arrow">→</span>
      <span class="onboarding__step">💰 Продай</span>
    </div>
    <div class="onboarding__tap">Тап щоб почати</div>
  </div>
`
if (state.onboarded) onboardingEl.setAttribute('hidden', '')

function dismissOnboarding() {
  if (state.onboarded) return
  onboardingEl.setAttribute('hidden', '')
  update({ ...state, onboarded: true })
}

onboardingEl.addEventListener('click', dismissOnboarding, { once: true })
uiRoot.appendChild(onboardingEl)

// ── UI components ─────────────────────────────────────────

const hud = createHUD(uiRoot)

const shopModal = createShopModal(uiRoot, {
  onOrder: (kitId) => {
    playSfx('order')
    haptic('medium')
    dismissOnboarding()
    update(orderKit(state, kitId))
  },
})

const upgradeModal = createUpgradeModal(uiRoot, {
  onBuyUpgrade:     (id) => update(buyUpgrade(state, id)),
  onMoveToLocation: (id) => {
    applyLocationTheme(currentLocation({ ...state, locationId: id }).sceneConfig)
    update(moveToLocation(state, id))
  },
})

const settingsModal = createSettingsModal(uiRoot, {
  onClearSave:     () => { clearSave(); location.reload() },
  onSoundChange:   (on) => setMuted(!on),
  onHapticsChange: (on) => { hapticsEnabled = on },
  onAddMoney:      (amount) => update({ ...state, money: state.money + amount }),
})

// Apply persisted sound/haptics settings immediately
{
  const s = settingsModal.getSettings()
  setMuted(!s.sound)
  hapticsEnabled = s.haptics
}

const solderModal = createSolderModal(uiRoot, {
  onSolderResult: handleSolderResult,
  onAbandon:      () => update(abandonBurntDrone(state, SALVAGE_RATE)),
})

const piggyModal = createPiggyModal(uiRoot, {
  onCollect:         (taps) => update(collectPiggy(state, taps, Date.now())),
  adsEnabled:        ADS_ENABLED,
  onRewardedRequest: () => showRewarded(PLACEMENTS.REWARD_PIGGY_DOUBLE),
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
  onSellRequested: async () => {
    if (state.phase !== Phase.READY) return

    // D8.2: rewarded ×2 sale hook (button is hidden when ADS_ENABLED=false)
    let priceMultBonus = 1
    if (ADS_ENABLED) {
      const granted = await showRewarded(PLACEMENTS.REWARD_DOUBLE_SALE)
      if (granted) priceMultBonus = 2
    }

    const kit        = KIT_TYPES[state.activeKit]
    const basePrice  = calcPrice(kit.basePrice, state.assemblyQuality, state.upgrades.priceMultiplier)
    const finalPrice = basePrice * priceMultBonus
    salesLog.push({ quality: state.assemblyQuality, price: finalPrice })
    playSfx('sell')
    haptic('heavy')

    // sell() adds basePrice internally; add the bonus delta on top if applicable
    let nextState = sell(state)
    if (priceMultBonus > 1) {
      nextState = { ...nextState, money: nextState.money + (finalPrice - basePrice) }
    }
    update(nextState)
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
  applyLocationTheme(currentLocation(state).sceneConfig)
  hideOverlay()
  draw()
  // If an auto-solder timer is already running (started before scene was ready),
  // retroactively show the progress strip for the current in-progress step.
  const _solderMode = levelData('soldering', state.upgrades.solderingLevel).mode
  if (autoTimer !== null && state.phase === Phase.ASSEMBLY &&
      (_solderMode === SOLDER_MODE.AUTO || _solderMode === SOLDER_MODE.SEMI)) {
    const _data = levelData('soldering', state.upgrades.solderingLevel)
    const _kit  = KIT_TYPES[state.activeKit]
    if (_kit) {
      const _done  = state.solderPoints.length
      const _label = _kit.assemblySteps?.[_done]?.label ?? `Крок ${_done + 1}`
      sceneRefs.benchProgress?.startStep(_label, _kit.solderPointCount, _done, _data.pointDelayMs)
    }
  }
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
  const kit  = KIT_TYPES[state.activeKit]
  if (!kit) return

  const done  = state.solderPoints.length
  const total = kit.solderPointCount
  const label = kit.assemblySteps?.[done]?.label ?? `Крок ${done + 1}`

  sceneRefs?.benchProgress?.startStep(label, total, done, data.pointDelayMs)

  autoTimer = setTimeout(() => {
    autoTimer = null
    if (state.phase !== Phase.ASSEMBLY) return

    const q = data.qualityMin + Math.random() * (data.qualityMax - data.qualityMin)
    const s = recordSolderPoint(state, q)

    if (s.solderPoints.length >= total) {
      const finished = finishAssembly(s)
      const finalQ   = finished.assemblyQuality
      const price    = calcPrice(kit.basePrice, finalQ, s.upgrades.priceMultiplier)
      const pct      = Math.round(finalQ * 100)
      sceneRefs?.benchProgress?.showResult(`✓ Зібрано! ${pct}% → $${price.toFixed(0)}`)
      sceneRefs?.worker?.notifySolderDone()
      update(finished)
    } else {
      sceneRefs?.benchProgress?.advanceDots(total, s.solderPoints.length)
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
      playSfx('overheat')
      haptic('heavy')
      update(burnKit(state))
    } else {
      playSfx('solder_cold')
      haptic('medium')
      warning = 'cold'
      update(applyColdSolderPenalty(state, COLD_SOLDER_QUALITY_PENALTY))
    }
    return
  }
  playSfx('solder_good')
  haptic('light')
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

  // Hide auto-solder progress when not in semi/auto assembly
  if (state.phase !== Phase.ASSEMBLY || mode === SOLDER_MODE.MANUAL) {
    sceneRefs?.benchProgress?.hide()
  }

  if (state.phase === Phase.ASSEMBLY && mode === SOLDER_MODE.AUTO && autoTimer === null) {
    scheduleAutoPoint()
  }

  // Sync scene state BEFORE issuing worker commands:
  //   – updates _carryingSlotIndex so commandDeliver targets the right street slot
  //   – fires worker.reset() for IDLE so workerCanDeliver is true on auto-pickup
  //   – parks carry box off-screen during IDLE (no pointer interference with slot indicators)
  const minCost        = Math.min(...Object.values(KIT_TYPES).map(k => k.cost))
  const hasAnyBoxOrDrone = (state.deliveries ?? []).length > 0 || state.phase !== Phase.IDLE
  const showPiggy      = state.money < minCost && !hasAnyBoxOrDrone
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
