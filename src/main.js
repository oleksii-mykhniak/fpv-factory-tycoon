import './style.css'
import { saveGame, loadGame, clearSave } from './save/storage.js'
import { createState, Phase, DeliveryStatus } from './state/gameState.js'
import { ADS_ENABLED, SCRAP_CONSOLATION, INPUT_DEADZONE } from './state/config.js'
import { levelData, SOLDER_MODE } from './state/upgrades.js'
import { currentLocation } from './state/locations.js'
import { setMuted } from './audio/sfx.js'
import { showRewarded, PLACEMENTS } from './monetization/ads.js'

import { apartment } from './defs/layouts/apartment.js'
import { createJoystick } from './input/joystick.js'
import { createKeyboard } from './input/keyboard.js'
import { mergeInput } from './input/inputVector.js'

import { createWorld, serializeWorld } from './sim/world.js'
import { advance } from './sim/loop.js'
import { dispatch, piggyAvailable } from './sim/commands.js'
import { SYSTEMS } from './sim/systems/index.js'

import { createHUD } from './ui/hud.js'
import { createActionBar } from './ui/actionBar.js'
import { createShopModal } from './ui/shopModal.js'
import { createUpgradeModal } from './ui/upgradeModal.js'
import { createSettingsModal } from './ui/settingsModal.js'
import { createSolderModal } from './ui/solderModal.js'
import { createPiggyModal } from './ui/piggyModal.js'
import { createTrashModal } from './ui/trashModal.js'

import { initScene, applyLocationTheme } from './scene/scene.js'
import { syncScene } from './view/sceneSync.js'
import { createEffects } from './view/effects.js'

// ── State init ────────────────────────────────────────────

// Migrate saves written before the per-delivery-status refactor (D6).
// Old saves may have phase=ORDERED/DELIVERY, activeDeliveryReadyAt,
// activeSlotIndex, and deliveryQueue instead of deliveries[].
function migrateState(raw) {
  let s = raw
  const now = Date.now()

  if (!s.deliveries && s.deliveryQueue) {
    s = {
      ...s,
      deliveries: (s.deliveryQueue ?? []).map(d => ({ ...d, status: DeliveryStatus.TRANSIT })),
    }
  }
  if (!s.deliveries) s = { ...s, deliveries: [] }

  if (s.phase === 'ORDERED' || s.phase === 'DELIVERY') {
    const readyAt = s.phase === 'DELIVERY'
      ? now - 1   // already arrived — force readyAt in past
      : (s.activeDeliveryReadyAt ?? now)
    const primary = {
      id:        `migrated-${now}`,
      kitId:     s.activeKit,
      slotIndex: s.activeSlotIndex ?? 0,
      readyAt,
      status:    DeliveryStatus.TRANSIT,
    }
    s = {
      ...s,
      phase:      Phase.IDLE,
      activeKit:  null,
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
  return { state: migrateState(state), salesLog: saved.salesLog }
}

// The world is the single source of truth. Nothing outside sim/ writes to it —
// UI and scene go through send() below.
// The layout supplies world size, obstacles and spawn points (C1).
// C7 will pick it per location; for now the apartment is the only floor plan.
const world = createWorld(initState(), { now: Date.now(), layout: apartment })

// Dev-only inspection hook: lets the browser smoke test read the sim without
// the view having to expose it. Stripped from production builds.
if (import.meta.env.DEV || import.meta.env.MODE === 'debug') {
  globalThis.__world = world
}

const uiRoot = document.getElementById('ui-root')
const canvas = document.getElementById('game-canvas')

let sceneRefs   = null
let saveQueued  = false   // coalesces STATE_DIRTY events into one save per frame
let uiDirty     = true    // forces a UI render even when the state object is unchanged
let coldWarning = null    // transient: consumed by solderModal on the next render

// ── Haptics ───────────────────────────────────────────────

let hapticsEnabled = true

function haptic(style = 'light') {
  if (!hapticsEnabled) return
  try {
    const ms = style === 'heavy' ? 50 : style === 'medium' ? 30 : 15
    navigator.vibrate?.(ms)
  } catch {}
}

// ── Input (C1) ────────────────────────────────────────────

// Movement must not fire while a modal has the player's attention, and a
// pointer that starts on UI chrome belongs to that chrome (see joystick.js).
function inputBlocked() {
  if (document.querySelector('.modal-overlay:not([hidden])')) return true
  const onboarding = document.getElementById('onboarding')
  return !!onboarding && !onboarding.hasAttribute('hidden')
}

const joystick = createJoystick(uiRoot, { isBlocked: inputBlocked })
const keyboard = createKeyboard({ isBlocked: inputBlocked })

// ── Sim plumbing ──────────────────────────────────────────

const effects = createEffects({
  getRefs:      () => sceneRefs,
  haptic,
  onStateDirty: () => { saveQueued = true },
  onColdSolder: (missMsg) => { coldWarning = missMsg ?? 'cold'; uiDirty = true },
  // Trigger zones ask; the view decides how to answer (C2).
  onWorkRequested: () => workAtBench(),
  onSellRequested: () => sellDrone(),
  onMinigame:      ({ game, agentId }) => openMinigame(game, agentId),
})

// Applies a player command and pushes the result through the presentation layer.
// The single entry point for every button, tap and mini-game result.
function send(type, payload) {
  effects.apply(dispatch(world, type, payload))
  present()
}

// Advances the simulation to now and presents the result. Driven by the engine.
// Input is sampled into the world first so the sim itself stays free of the DOM.
function tick() {
  world.input = mergeInput(
    { joystick: joystick.read(), keys: keyboard.read() },
    INPUT_DEADZONE,
  )
  effects.apply(advance(world, Date.now(), SYSTEMS))
  present()
}

function present() {
  syncScene(sceneRefs, world)
  renderUI()
  if (saveQueued) {
    const { state, salesLog } = serializeWorld(world)
    saveGame(state, salesLog)
    saveQueued = false
  }
}

// ── UI ────────────────────────────────────────────────────

const hud = createHUD(uiRoot)

const shopModal = createShopModal(uiRoot, {
  onOrder: (kitId) => { dismissOnboarding(); send('order', { kitId }) },
  onScrapStart: () => send('startScrap'),
})

const upgradeModal = createUpgradeModal(uiRoot, {
  onBuyUpgrade:     (id) => send('buyUpgrade', { trackId: id }),
  onMoveToLocation: (id) => {
    send('moveToLocation', { locationId: id })
    applyLocationTheme(currentLocation(world.game).sceneConfig)
  },
})

const settingsModal = createSettingsModal(uiRoot, {
  onClearSave:     () => { clearSave(); location.reload() },
  onSoundChange:   (on) => setMuted(!on),
  onHapticsChange: (on) => { hapticsEnabled = on },
  onAddMoney:      (amount) => send('addMoney', { amount }),
})

{
  const s = settingsModal.getSettings()
  setMuted(!s.sound)
  hapticsEnabled = s.haptics
}

const solderModal = createSolderModal(uiRoot, {
  onSolderResult: (quality) => send('solderResult', { quality }),
  // The burnt drone is carried out first; the state change lands when the
  // worker reaches the bin (worker.droppedBurnt).
  onAbandon: () => {
    if (sceneRefs?.worker) sceneRefs.worker.commandTrash()
    else send('abandon')
  },
})

const piggyModal = createPiggyModal(uiRoot, {
  onCollect:         (taps) => send('collectPiggy', { taps }),
  adsEnabled:        ADS_ENABLED,
  onRewardedRequest: () => showRewarded(PLACEMENTS.REWARD_PIGGY_DOUBLE),
})

const trashModal = createTrashModal(uiRoot, {
  onSuccess: () => {
    haptic('light')
    // The player carries the parts back themselves; the puppet walks them.
    if (scrapAgent) send('scrapCollected', { agentId: scrapAgent })
    else sceneRefs?.worker?.resumeScrapSuccess()
  },
  onFail: () => {
    haptic('medium')
    if (!scrapAgent) sceneRefs?.worker?.resumeScrapFail()
    scrapAgent = null
    send('scrapFailed', { consolation: SCRAP_CONSOLATION })
  },
})

const actionBar = createActionBar(uiRoot, {
  onShopOpen:     () => shopModal.open(world.game),
  onUpgradeOpen:  () => upgradeModal.open(world.game),
  onSettingsOpen: () => settingsModal.open(),
})

let _lastRendered = null
let _lastCarrySig = ''

function renderUI() {
  // Every state transition returns a fresh object, so identity is a reliable
  // dirty check — it keeps the DOM work off the 20 Hz tick. Carried items are
  // mutated in place though, so they need their own signature.
  const carrySig = (world.agents ?? [])
    .map(a => `${a.id}:${(a.carrying ?? []).map(i => i.type).join('+')}`).join('|')
  if (world.game === _lastRendered && carrySig === _lastCarrySig && !uiDirty) return
  _lastRendered = world.game
  _lastCarrySig = carrySig
  uiDirty = false

  const player = (world.agents ?? []).find(a => a.kind === 'player')
  hud.update(world.game, (player?.carrying ?? []).map(i => i.type))
  actionBar.update(world.game)
  shopModal.update(world.game)
  upgradeModal.update(world.game)
  solderModal.update(world.game, coldWarning ? 'cold' : null)
  coldWarning = null

  // Bench progress belongs to the sim's assembly stages; hide it whenever the
  // bench is not running one.
  const mode = levelData('soldering', world.game.upgrades.solderingLevel).mode
  if (world.game.phase !== Phase.ASSEMBLY || mode === SOLDER_MODE.MANUAL) {
    sceneRefs?.benchProgress?.hide()
  }
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
if (world.game.onboarded) onboardingEl.setAttribute('hidden', '')

function dismissOnboarding() {
  if (world.game.onboarded) return
  onboardingEl.setAttribute('hidden', '')
  send('setOnboarded')
}

onboardingEl.addEventListener('click', dismissOnboarding, { once: true })
uiRoot.appendChild(onboardingEl)

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

// ── Intents from the scene ────────────────────────────────
//
// One channel for taps and for the puppet's animation milestones. The scene
// says what happened; the sim decides what it means.

const INTENTS = {
  // ── Puppet milestones ──────────────────────────────────
  // The automated worker still walks its own routes; these are the points where
  // its animation and the simulation have to agree. C5 replaces the puppet.
  'worker.atBench': () => send('benchArrived'),

  'worker.readyToSolder': () => workAtBench(),

  'worker.atMailbox': () => sellDrone(),

  'worker.droppedBurnt':   () => send('abandon'),
  'worker.atScrapBin':     () => { scrapAgent = null; trashModal.open() },
  'worker.scrapDelivered': () => send('scrapDelivered'),
}

function onIntent(type, payload = {}) {
  const handler = INTENTS[type]
  if (!handler) throw new Error(`onIntent: невідомий намір "${type}"`)
  handler(payload)
}

// ── Shared actions ────────────────────────────────────────
//
// A zone and the worker puppet can both ask for these, so neither owns them.

// Which agent asked for the salvage mini-game; null = the puppet did.
let scrapAgent = null

function workAtBench() {
  const { mode } = levelData('soldering', world.game.upgrades.solderingLevel)
  if (mode === SOLDER_MODE.MANUAL) solderModal.open(world.game)
  else send('armSolder')
}

async function sellDrone() {
  if (world.game.phase !== Phase.READY) return
  // D8.2: rewarded ×2 sale hook (hidden while ADS_ENABLED is false).
  let priceMultBonus = 1
  if (ADS_ENABLED && await showRewarded(PLACEMENTS.REWARD_DOUBLE_SALE)) priceMultBonus = 2
  send('sell', { priceMultBonus })
}

function openMinigame(game, agentId) {
  if (game === 'piggy') {
    if (piggyAvailable(world)) piggyModal.open()
    return
  }
  if (game === 'scrap') {
    scrapAgent = agentId
    trashModal.open()
  }
}

// ── Boot ──────────────────────────────────────────────────

initScene(canvas, {
  getWorld: () => world,
  onIntent,
  layout: apartment,
  onLoadProgress: (loaded, total) => {
    if (loadBar) loadBar.style.width = `${Math.round((loaded / total) * 100)}%`
  },
}).then(refs => {
  sceneRefs = refs
  if (import.meta.env.DEV || import.meta.env.MODE === 'debug') globalThis.__refs = refs
  applyLocationTheme(currentLocation(world.game).sceneConfig)
  hideOverlay()

  // The single drive point: one fixed-step sim advance per rendered frame.
  refs.engine._ex.on('preupdate', tick)

  uiDirty = true
  present()
})
