import './style.css'
import { saveGame, loadGame, clearSave } from './save/storage.js'
import {
  createState, Phase, DeliveryStatus,
  createStation, stationsOf,
} from './state/gameState.js'
import { ADS_ENABLED, SCRAP_CONSOLATION, INPUT_DEADZONE } from './state/config.js'
import { levelData } from './state/upgrades.js'
import { currentLocation } from './state/locations.js'
import { roomDef } from './defs/layouts/rooms.js'
import { hallDef } from './defs/layouts/factory.js'
import { setMuted, unlockAudio } from './audio/sfx.js'
import { setMusicEnabled, startMusic } from './audio/music.js'
import { showRewarded, PLACEMENTS } from './monetization/ads.js'

import { layoutFor } from './defs/layouts/index.js'
import { createJoystick } from './input/joystick.js'
import { createKeyboard } from './input/keyboard.js'
import { mergeInput } from './input/inputVector.js'

import { createWorld, serializeWorld } from './sim/world.js'
import { advance } from './sim/loop.js'
import { dispatch, piggyAvailable } from './sim/commands.js'
import { settleOffline } from './sim/offline.js'
import {
  playerStation, guidanceActive, ironIsHandsOff, incomePerSec, arrowAllowed,
  nextPurchase,
} from './sim/derive.js'
import { SYSTEMS } from './sim/systems/index.js'

import { createHUD, stepHint } from './ui/hud.js'
import { createQuestTracker } from './ui/questTracker.js'
import { createUnlockCard } from './ui/unlockCard.js'
import { createSettingsButton } from './ui/settingsButton.js'
import { createShopModal } from './ui/shopModal.js'
import { createUpgradeModal } from './ui/upgradeModal.js'
import { createHireModal } from './ui/hireModal.js'
import { createPromoteModal } from './ui/promoteModal.js'
import { createSettingsModal } from './ui/settingsModal.js'
import { createSolderModal } from './ui/solderModal.js'
import { createSolderBar } from './ui/solderBar.js'
import { createPiggyModal } from './ui/piggyModal.js'
import { createTrashModal } from './ui/trashModal.js'

import { initScene, rebuildScene, applyLocationTheme } from './scene/scene.js'
import { syncScene, resetSceneSync } from './view/sceneSync.js'
import { createEffects } from './view/effects.js'

// ── State init ────────────────────────────────────────────

// Migrate saves written before the per-delivery-status refactor (D6).
//
// Everything below the current MIN_LOADABLE_VERSION (3, raised in Stage 8) is
// already discarded in storage.js before it gets here, so these branches only
// matter if that floor is ever lowered again. Kept rather than deleted: they
// are also the record of what each shape used to look like.
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

  // C3: the bench's own fields became stations[]. An old save carries them at
  // the top level; move them onto the first station rather than dropping the
  // drone the player was in the middle of building.
  if (!s.stations) {
    const station = {
      ...createStation('station-0'),
      phase:        s.phase ?? Phase.IDLE,
      kitId:        s.activeKit ?? null,
      solderPoints: s.solderPoints ?? [],
      quality:      s.assemblyQuality ?? null,
      coldPenalty:  s.coldSolderPenalty ?? 0,
    }
    const { phase, activeKit, solderPoints, assemblyQuality, coldSolderPenalty, ...rest } = s
    s = { ...rest, stations: [station] }
  }

  // Stage 5: the third location stopped being "one more move" and became the
  // place the game ends up, so it is called the factory now. The id is what a
  // save stores, so an old one has to be carried across or the player wakes up
  // back in the apartment.
  if (s.locationId === 'workshop') s = { ...s, locationId: 'factory' }

  // П2: the garage stopped being an address and became a room of the flat. A
  // save that stands in it comes home — with the room already built, because it
  // was already paid for. The money is deliberately NOT reset: moving used to
  // reset it, buying a room does not, and the player is on the buying side of
  // that change.
  if (s.locationId === 'garage') {
    s = { ...s, locationId: 'apartment', unlockedRooms: ['flat', 'garage'] }
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
    // Лічильники (Стадія 9) мерджаться так само, як апгрейди: сейв версії 3 їх
    // не має взагалі, а сейв, записаний до появи чергового поля, має половину.
    stats:      { ...defaults.stats, ...saved.state.stats },
    locationId: saved.state.locationId ?? defaults.locationId,
  }
  return { state: migrateState(state), salesLog: saved.salesLog, savedAt: saved.savedAt }
}

// The world is the single source of truth. Nothing outside sim/ writes to it —
// UI and scene go through send() below.
// The layout supplies world size, obstacles and spawn points (C1).
// C7 will pick it per location; for now the apartment is the only floor plan.
const _boot = initState()

// What the shop finished while the app was closed (C7). Settled analytically
// rather than by fast-forwarding the tick loop — see sim/offline.js.
const _offline = _boot.savedAt
  ? settleOffline(_boot.state, Date.now() - _boot.savedAt)
  : null
if (_offline && _offline.state !== _boot.state) _boot.state = _offline.state
const world = createWorld(_boot, {
  now: Date.now(),
  layout: layoutFor(_boot.state.locationId, _boot.state),
})

// Dev-only inspection hook: lets the browser smoke test read the sim without
// the view having to expose it. Stripped from production builds.
if (import.meta.env.DEV || import.meta.env.MODE === 'debug') {
  globalThis.__world = world
}

const uiRoot = document.getElementById('ui-root')
const canvas = document.getElementById('game-canvas')

let sceneRefs   = null
let saveQueued  = false   // coalesces STATE_DIRTY events into one save per frame
// Set once the save has been wiped on purpose. location.reload() does NOT stop
// the page: the tick keeps running until the navigation commits, and the very
// next STATE_DIRTY wrote the whole shop back into storage — which is why
// "Скинути збереження" looked like it did nothing at all.
let savingStopped = false
let uiDirty     = true    // forces a UI render even when the state object is unchanged
let coldWarning = null    // transient: consumed by solderModal on the next render

// ── Haptics ───────────────────────────────────────────────

let hapticsEnabled = true

// Patterns, not durations (A5). A single 50 ms buzz for both "sold a drone" and
// "the kit is on fire" says the same thing twice; the shape is what carries the
// meaning, and it costs nothing.
const HAPTIC = {
  light:  15,
  medium: 30,
  heavy:  50,
  sale:   [30, 40, 60],       // ta-da
  burn:   [40, 60, 40, 60, 90], // stutter, then a long one — something is wrong
}

// iOS Safari has no Vibration API at all. Worth knowing rather than guessing,
// because a toggle that silently controls nothing is worse than no toggle.
export const hapticsSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator

function haptic(style = 'light') {
  if (!hapticsEnabled || !hapticsSupported) return
  try {
    navigator.vibrate?.(HAPTIC[style] ?? HAPTIC.light)
  } catch {}
}

// ── Input (C1) ────────────────────────────────────────────

// Movement must not fire while a modal has the player's attention, and a
// pointer that starts on UI chrome belongs to that chrome (see joystick.js).
// The soldering strip deliberately does NOT block movement: it is not a modal,
// and walking away from a bench mid-solder is a legitimate move.
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
  onSaleMade:      (e) => { floatEarning(e); offerSaleBonus() },
  onQuestDone:     ({ questId }) => questTracker.flash(questId),
  onPurchase:      () => hud.markPurchase(incomePerSec(world.salesLog, world.now), world.now),
  onMinigame:      ({ game, agentId }) => openMinigame(game, agentId),
  // Walking up to the laptop / rack / board is what opens these now (S2).
  onPanel:         (e) => openPanel(e.panel, e),
})

// «+$47» над скринькою, у яку щойно поклали дрон (Стадія 10 / D3).
//
// Позиція береться з зони, а не з пропа: скриньок на фабриці кілька (F4), і
// зона — це єдине, що подія про продаж знає напевно. Якщо зони немає (старий
// сейв, нетипова розкладка) — просто нічого не летить: прикраса не має права
// впасти на бойовому шляху продажу.
function floatEarning({ price, zoneId }) {
  if (!(price > 0)) return
  const zone = (world.zones ?? []).find(z => z.id === zoneId)
  if (!zone) return
  sceneRefs?.floatGain?.(zone.cx, zone.y, `+$${price.toFixed(0)}`)
}

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
  if (saveQueued && !savingStopped) {
    const { state, salesLog } = serializeWorld(world)
    saveGame(state, salesLog)
    saveQueued = false
  }
}

// ── UI ────────────────────────────────────────────────────

const hud = createHUD(uiRoot)

// Картка квесту (Стадія 9): один активний крок ланцюга і скільки до нього
// лишилось. Тап означає «покажи, куди йти» — після перших кроків ланцюга
// стрілка з екрана зникає й повертається лише на запит.
const questTracker = createQuestTracker(uiRoot, {
  onShowArrow: () => { send('showArrow'); uiDirty = true; present() },
})

// Картка «відкрито» (Р4): що приїхало з новою кімнатою або цехом.
const unlockCard = createUnlockCard(uiRoot)

const shopModal = createShopModal(uiRoot, {
  onOrder: (kitId) => { dismissOnboarding(); send('order', { kitId }) },
})

const upgradeModal = createUpgradeModal(uiRoot, {
  onBuyUpgrade: (id) => {
    send('buyUpgrade', { trackId: id })
    // A new bench is a new object in the room, with its own footprint and its
    // own floor markings — the sim built it, so the scene has to be rebuilt to
    // show it. Without this the station existed but nothing was drawn there.
    if (id === 'benches') {
      sceneRefs = rebuildScene({ getWorld: () => world, onIntent, layout: world.layout, world })
      resetSceneSync()
      uiDirty = true
      present()
    }
  },
  // Buying a room widens the flat: same rebuild as a hall (П2).
  onUnlockRoom: (roomId) => {
    send('unlockRoom', { roomId })
    // Кімната розповідає, що з нею приїхало (Р4) — інакше найдорожча покупка
    // першого акту виглядає як порожня кімната.
    // Панель закривається: покупка відбулась, і читати про кімнату поверх
    // прайс-листа, з якого її щойно купили, — це два екрани про одне.
    upgradeModal.close?.()
    const room = roomDef(roomId)
    if (room) unlockCard.open({
      title:    `${room.emoji ?? '🏠'} ${room.name} відкрито`,
      subtitle: 'Що тепер можна:',
      unlocks:  room.unlocks,
    })
    sceneRefs = rebuildScene({ getWorld: () => world, onIntent, layout: world.layout, world })
    resetSceneSync()
    uiDirty = true
    present()
  },
  // Opening a hall is a different floor plan, exactly like a move — so it is
  // rebuilt exactly like one.
  onUnlockHall: (hallId) => {
    send('unlockHall', { hallId })
    upgradeModal.close?.()
    const hall = hallDef(hallId)
    if (hall) unlockCard.open({
      title:    `🏭 ${hall.name} відкрито`,
      subtitle: 'Що тепер можна:',
      unlocks:  hall.unlocks,
    })
    sceneRefs = rebuildScene({ getWorld: () => world, onIntent, layout: world.layout, world })
    resetSceneSync()
    uiDirty = true
    present()
  },
  onMoveToLocation: (id) => {
    send('moveToLocation', { locationId: id })
    // A move is a different room, not a re-tint: tear the scene down and build
    // the new floor plan (C7).
    sceneRefs = rebuildScene({ getWorld: () => world, onIntent, layout: world.layout, world })
    resetSceneSync()
    applyLocationTheme(world.layout.theme)
    upgradeModal.close?.()
    uiDirty = true
    present()
  },
})

const promoteModal = createPromoteModal(uiRoot, {
  onPromote: (workerId) => send('promoteWorker', { workerId }),
})

const settingsModal = createSettingsModal(uiRoot, {
  onClearSave:     () => { savingStopped = true; clearSave(); location.reload() },
  onSoundChange:   (on) => setMuted(!on),
  onMusicChange:   (on) => setMusicEnabled(on),
  hapticsSupported,
  onHapticsChange: (on) => { hapticsEnabled = on },
  onAddMoney:      (amount) => send('addMoney', { amount }),
})

{
  const s = settingsModal.getSettings()
  setMuted(!s.sound)
  setMusicEnabled(s.music !== false)
  hapticsEnabled = s.haptics
}

// The soldering strip: shown while the player stands at a bench (C6).
const solderBar = createSolderBar(uiRoot, {
  onSolderResult: (quality, stationId) => send('solderResult', { quality, stationId }),
})

// The modal survives for one job only: deciding what to do with a burnt kit.
const solderModal = createSolderModal(uiRoot, {
  onSolderResult: (quality, stationId) => send('solderResult', { quality, stationId }),
  // The burnt drone is carried out first; the state change lands when the
  // worker reaches the bin (worker.droppedBurnt).
  // The burnt kit is written off on the spot: there is no puppet to walk it to
  // the bin any more, and a modal button should resolve immediately.
  onAbandon: (stationId) => send('abandon', { stationId }),
})

const piggyModal = createPiggyModal(uiRoot, {
  onCollect:         (taps) => send('collectPiggy', { taps }),
  adsEnabled:        ADS_ENABLED,
  onRewardedRequest: () => showRewarded(PLACEMENTS.REWARD_PIGGY_DOUBLE),
})

const trashModal = createTrashModal(uiRoot, {
  // Salvage is a player errand: the parts land in whoever's hands opened the
  // game, and they still have to be carried to a bench.
  onSuccess: () => {
    haptic('light')
    send('scrapCollected', { agentId: scrapAgent ?? 'player' })
    scrapAgent = null
  },
  onFail: () => {
    haptic('medium')
    scrapAgent = null
    send('scrapFailed', { consolation: SCRAP_CONSOLATION })
  },
})

const hireModal = createHireModal(uiRoot, {
  onHire: (role, hallId) => send('hireWorker', { role, hallId }),
})

// The bar is gone entirely: everything that used to sit there is a place in the
// room now (S2), and settings moved to the top-right corner.
createSettingsButton(uiRoot, {
  onSettingsOpen: () => settingsModal.open(),
})

// Which panel a zone asked for. One place, so adding an object with a panel
// behind it is a line here and an entry in defs/interactions.js.
function openPanel(panel, e = {}) {
  if (panel === 'shop')    shopModal.open(world.game)
  if (panel === 'upgrade') upgradeModal.open(world.game)
  if (panel === 'hire')    hireModal.open(world.game, e.hallId ?? null)
  // П3: підвищення теж лише ПИТАЄ — гроші списує кнопка в панелі.
  if (panel === 'promote') promoteModal.open(world.game, e.workerId)
}

let _lastRendered = null
let _lastCarrySig = ''
let _lastStation  = ''

function renderUI() {
  // HUD оновлюється КОЖЕН тік, до dirty-перевірки нижче (Стадія 10 / D1).
  //
  // Темп рахується по ковзному вікну продажів, тобто спадає сам собою, коли в
  // грі нічого не змінюється — а це саме той момент, коли dirty-перевірка
  // вирішує нічого не малювати. Поки прилад ховався на нулі, розбіжність була
  // непомітна; тепер він стоїть завжди, і завмерле число читалось би як
  // поламане. Це три присвоєння тексту, не варті власного кешу.
  hud.update(world.game, incomePerSec(world.salesLog, world.now),
             nextPurchase(world.game), world.now)

  // Every state transition returns a fresh object, so identity is a reliable
  // dirty check — it keeps the DOM work off the 20 Hz tick. Carried items are
  // mutated in place though, so they need their own signature.
  const carrySig = (world.agents ?? [])
    .map(a => `${a.id}:${(a.carrying ?? []).map(i => i.type).join('+')}`).join('|')
  // Standing at a bench is not part of game state, so it needs its own signal —
  // without it the strip would not appear until something else changed.
  const atStation = playerStation(world)?.id ?? ''
  if (world.game === _lastRendered && carrySig === _lastCarrySig &&
      atStation === _lastStation && !uiDirty) return
  _lastStation = atStation
  _lastRendered = world.game
  _lastCarrySig = carrySig
  uiDirty = false

  const player = (world.agents ?? []).find(a => a.kind === 'player')

  // Смужка пайки й картка квесту живуть на одній висоті, тож картка мовчить,
  // поки смужка на екрані. Рахується тут, бо `handStation` нижче — це вже
  // відповідь на те саме питання.
  const soldering = !ironIsHandsOff(world.game) && !!playerStation(world)

  // Крок петлі рахує HUD (він знає фази станції), а показує картка квесту —
  // нижньої панелі більше немає (Р2).
  questTracker.update(world.game, stepHint(
    world.game,
    (player?.carrying ?? []).map(i => i.type),
    guidanceActive(world.game),
  ) || null, soldering, !arrowAllowed(world))
  shopModal.update(world.game)
  upgradeModal.update(world.game)
  hireModal.update(world.game)
  promoteModal.update(world.game)
  solderModal.update(world.game, coldWarning ? 'cold' : null)

  // The soldering strip follows the player's feet, not a button (C6) — and is
  // only offered when the iron needs a pair of hands. With a semi-auto or
  // better, standing there is enough and the mini-game would be a second,
  // pointless way to do the same job.
  const handStation = ironIsHandsOff(world.game) ? null : playerStation(world)
  solderBar.update(world.game, handStation, coldWarning)
  coldWarning = null

  // Progress cards belong to the sim's assembly stages; hide the ones whose
  // station is not running one right now.
  for (const view of sceneRefs?.stations ?? []) {
    if (!world.stationRuntime?.[view.id]?.running) view.progress.hide()
  }
}

// ── Onboarding ────────────────────────────────────────────

// The browser will not play a sound until the player has interacted with the
// page. Most of what makes noise here is triggered by walking into a zone, not
// by pressing a button, so the unlock hangs off the first input of any kind
// rather than off a command.
for (const evt of ['pointerdown', 'keydown', 'touchstart']) {
  window.addEventListener(evt, () => { unlockAudio(); startMusic() }, { once: true, passive: true })
}

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

// ── While you were away ───────────────────────────────────

if (_offline && (_offline.assembled || _offline.sold)) {
  const mins = Math.round(_offline.elapsedMs / 60000)
  const away = mins >= 60 ? `${Math.floor(mins / 60)} год ${mins % 60} хв` : `${mins} хв`
  const box = document.createElement('div')
  box.id = 'offline-report'
  box.className = 'modal-overlay'
  box.innerHTML = `
    <div class="modal">
      <div class="modal__header"><span class="modal__title">Поки вас не було</span></div>
      <div class="modal__body">
        <p class="offline-report__away">Минуло ${away}</p>
        <p>🔧 Зібрано дронів: <b>${_offline.assembled}</b></p>
        ${_offline.sold ? `<p>📮 Продано: <b>${_offline.sold}</b> — <b>$${_offline.earned.toFixed(2)}</b></p>` : ''}
        ${_offline.cycles
          ? `<p class="offline-report__cycles">🏭 Цех працював сам: ${_offline.cycles} ${
              _offline.cycles === 1 ? 'цикл' : 'циклів'} без вас</p>`
          : ''}
        ${!_offline.sold && _offline.assembled
          ? '<p class="upgrade-effect-hint">Готові дрони чекають на верстаку — найміть продавця, щоб їх відносили</p>'
          : ''}
        <button class="btn btn--upgrade" id="offline-ok">Продовжити</button>
      </div>
    </div>
  `
  uiRoot.appendChild(box)
  box.querySelector('#offline-ok').addEventListener('click', () => box.remove())
}

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

// The scene has no intents left to report: taps went in C2 and the worker
// puppet in C5. The channel stays because C6/C7 will add cues (a tutorial
// arrow, a tapped hint) and it costs nothing to keep it wired.
const INTENTS = {}

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

// D8.2: rewarded ×2 sale hook. The sale itself already completed at the
// mailbox — this only offers to double it, and is a no-op while ADS_ENABLED is
// false. Whoever made the sale (player or a hired seller) does not matter.
async function offerSaleBonus() {
  if (!ADS_ENABLED) return
  if (await showRewarded(PLACEMENTS.REWARD_DOUBLE_SALE)) send('grantSaleBonus', { multiplier: 2 })
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
  layout: world.layout,
  world,
  onLoadProgress: (loaded, total) => {
    if (loadBar) loadBar.style.width = `${Math.round((loaded / total) * 100)}%`
  },
}).then(refs => {
  sceneRefs = refs
  if (import.meta.env.DEV || import.meta.env.MODE === 'debug') globalThis.__refs = refs
  applyLocationTheme(world.layout.theme)
  hideOverlay()

  // The single drive point: one fixed-step sim advance per rendered frame.
  refs.engine._ex.on('preupdate', tick)

  uiDirty = true
  present()
})
