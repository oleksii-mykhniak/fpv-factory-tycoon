import { UPGRADE_TRACKS } from '../state/upgrades.js'
import { trackIntroduced } from '../sim/quests.js'
import {
  openHallIds, nextHallId, canUnlockHall, openRoomIds, nextRoomId, canUnlockRoom,
} from '../state/gameState.js'
import { FACTORY_HALLS, hallDef } from '../defs/layouts/factory.js'
import { APARTMENT_ROOMS, roomDef } from '../defs/layouts/rooms.js'
import {
  currentLocation, LOCATIONS, LOCATION_ORDER, capFor, canMoveToLocation, startMoneyAt,
  isTerminal,
} from '../state/locations.js'

export function createUpgradeModal(root, {
  onBuyUpgrade, onMoveToLocation, onUnlockHall, onUnlockRoom,
}) {
  const overlay = document.createElement('div')
  overlay.id = 'upgrade-modal'
  overlay.className = 'modal-overlay'
  overlay.setAttribute('hidden', '')
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <span class="modal__title">Поліпшення</span>
        <button class="modal__close" id="upgrade-close">✕</button>
      </div>
      <div class="modal__body" id="upgrade-body"></div>
    </div>
  `
  root.appendChild(overlay)

  overlay.querySelector('#upgrade-close').addEventListener('click', close)
  overlay.addEventListener('click', e => { if (e.target === overlay) close() })

  function open(state) {
    overlay.removeAttribute('hidden')
    render(state)
  }

  function close() {
    overlay.setAttribute('hidden', '')
  }

  function update(state) {
    if (!overlay.hasAttribute('hidden')) render(state)
  }

  function render(state) {
    const body = overlay.querySelector('#upgrade-body')

    // ── Upgrade tracks ────────────────────────────────────
    //
    // Прогресивне розкриття (Стадія 9 / Р5). До цього панель показувала всі
    // п'ять треків одночасно — у момент, коли купити можна було рівно один, —
    // і викуплений трек лишався в списку назавжди рядком «Максимальний
    // рівень». Три правила прибирають і те, і те:
    //
    //   стеля тут 0        → трек у цій локації не існує;
    //   купувати нічого    → трек викуплено (або заморожено) — рядок зникає;
    //   ланцюг не дійшов   → гравцеві ще не показували цей інструмент.
    //
    // Максимум по треку — не інформація, а сміття: він не каже, що робити.
    // Замість нього внизу є один рядок про те, що інструменти скінчились.
    const visible = Object.entries(UPGRADE_TRACKS).filter(([id]) => {
      const level = state.upgrades[UPGRADE_TRACKS[id].stateKey] ?? 0
      const max   = Math.min(UPGRADE_TRACKS[id].costs.length, capFor(state, id))
      if (max <= 0)      return false
      if (level >= max)  return false
      return trackIntroduced(state, id)
    })

    const trackHTML = visible.map(([id, track]) => {
      const level    = state.upgrades[track.stateKey] ?? 0
      const nextInfo = track.levels[level + 1]
      const nextCost = track.costs[level]
      // Money is the only gate. A busy bench used to block this too, from when
      // one bench was the whole game; with staff working nonstop that read as
      // "upgrades are broken".
      const canBuy   = state.money >= nextCost

      return `
        <div class="shop-section">
          <div class="shop-section__title">${track.name}</div>
          <div class="shop-upgrade">
            <span class="shop-upgrade__current">${track.levels[level].name}</span>
            <button class="btn btn--upgrade" data-upgrade="${id}" ${canBuy ? '' : 'disabled'}>
              → ${nextInfo.name} — $${nextCost}
            </button>
            <p class="upgrade-effect-hint">${nextInfo.effect}</p>
          </div>
        </div>
      `
    }).join('')

    // Порожня панель читається як поламана, тому пустоту треба назвати. Слова
    // різні: у квартирі інструменти ще будуть, на фабриці — вже ні.
    const emptyHTML = visible.length ? '' : `
      <div class="shop-section">
        <div class="shop-upgrade">
          <p class="upgrade-effect-hint">${isTerminal(state)
            ? 'Інструменти викуплено — далі росте персонал'
            : 'Інструменти цієї локації викуплено'}</p>
        </div>
      </div>
    `

    // ── Rooms of the flat (П2) ────────────────────────────
    // Written like the hall card below, because it is the same offer: pay, and
    // the floor plan grows. The one difference is worth spelling out on the
    // card — this is a purchase, so the rest of the money stays yours.
    let roomHTML = ''
    const nextRoom = nextRoomId(state)
    if (nextRoom) {
      const room = roomDef(nextRoom)
      const { can, reasons } = canUnlockRoom(state, nextRoom)
      const openCount = openRoomIds(state).length
      roomHTML = `
        <div class="shop-section shop-section--location">
          <div class="shop-section__title">
            🏠 Житло — кімнат ${openCount}/${APARTMENT_ROOMS.length}
          </div>
          <div class="shop-upgrade">
            <span class="shop-upgrade__current">Наступна: ${room.emoji ?? ''} ${room.name}</span>
            <button class="btn btn--upgrade" id="room-btn" ${can ? '' : 'disabled'}>
              Прибудувати ${room.name} — $${room.cost}
            </button>
            ${reasons.length
              ? `<p class="upgrade-effect-hint">${reasons.join(' · ')}</p>`
              : '<p class="upgrade-effect-hint">Умови виконані — можна прибудовувати!</p>'}
            <p class="upgrade-effect-hint">
              +${room.benches} верстак, місця для ${
                Object.values(room.workerCaps ?? {}).reduce((a, b) => a + b, 0)} людей,
              вищі ліміти поліпшень
            </p>
            <p class="upgrade-effect-hint">Це покупка, не переїзд — решта грошей лишається з вами</p>
          </div>
        </div>
      `
    }

    // ── Location section ──────────────────────────────────
    const loc        = currentLocation(state)
    const currentIdx = LOCATION_ORDER.indexOf(state.locationId ?? 'apartment')
    const nextLocId  = LOCATION_ORDER[currentIdx + 1]

    let locationHTML = ''
    if (isTerminal(state)) {
      // The last location. There is no move to offer — what grows here is the
      // factory itself, one hall at a time (F2).
      const open   = openHallIds(state)
      const nextId = nextHallId(state)
      const hall   = nextId ? hallDef(nextId) : null
      const { can, reasons } = nextId ? canUnlockHall(state, nextId) : { can: false, reasons: [] }

      locationHTML = `
        <div class="shop-section shop-section--location">
          <div class="shop-section__title">
            ${loc.emoji} ${loc.name} — цехів ${open.length}/${FACTORY_HALLS.length}
          </div>
          <div class="shop-upgrade">
            ${hall ? `
              <span class="shop-upgrade__current">Наступний: ${hall.name}</span>
              <button class="btn btn--upgrade" id="hall-btn" ${can ? '' : 'disabled'}>
                Відкрити ${hall.name} — $${hall.cost}
              </button>
              ${reasons.length
                ? `<p class="upgrade-effect-hint">${reasons.join(' · ')}</p>`
                : '<p class="upgrade-effect-hint">Умови виконані — цех готовий до відкриття!</p>'}
              <p class="upgrade-effect-hint">
                +${hall.benches} верстаки й місця для ${
                  Object.values(hall.workerCaps).reduce((a, b) => a + b, 0)} людей
              </p>
            ` : '<p class="upgrade-effect-hint">Уся фабрика відкрита</p>'}
          </div>
        </div>
      `
    } else if (nextLocId) {
      const nextLoc        = LOCATIONS[nextLocId]
      const { can, reasons } = canMoveToLocation(state, nextLocId)
      // A bench mid-build no longer blocks the move: the station list carries
      // its progress across (syncStations only ever grows it), so an unfinished
      // drone travels with you. Waiting for an idle shop meant waiting forever
      // once staff were working nonstop.
      const moveEnabled    = can
      locationHTML = `
        <div class="shop-section shop-section--location">
          <div class="shop-section__title">Локація: ${loc.emoji} ${loc.name}</div>
          <div class="shop-upgrade">
            <span class="shop-upgrade__current">Наступна: ${nextLoc.emoji} ${nextLoc.name}</span>
            <button class="btn btn--upgrade" id="move-btn" ${moveEnabled ? '' : 'disabled'}>
              Переїхати до ${nextLoc.name} — $${nextLoc.unlockCost}
            </button>
            ${reasons.length
              ? `<p class="upgrade-effect-hint">${reasons.join(' · ')}</p>`
              : can
                ? '<p class="upgrade-effect-hint">Умови виконані — готово до переїзду!</p>'
                : ''
            }
            <p class="upgrade-effect-hint">
              Після переїзду каса стане $${startMoneyAt(nextLocId)} — накопичене лишається тут
            </p>
          </div>
        </div>
      `
    } else {
      locationHTML = `
        <div class="shop-section shop-section--location">
          <div class="shop-section__title">Локація: ${loc.emoji} ${loc.name}</div>
          <div class="shop-upgrade">
            <p class="upgrade-effect-hint">Максимальна локація</p>
          </div>
        </div>
      `
    }

    // Hiring moved out to its own panel behind the job board (S2): the rack is
    // where tools are bought, the board by the door is where people are taken on.
    body.innerHTML = trackHTML + emptyHTML + roomHTML + locationHTML

    body.querySelectorAll('[data-upgrade]').forEach(btn => {
      btn.addEventListener('click', () => onBuyUpgrade(btn.dataset.upgrade))
    })
    const roomBtn = body.querySelector('#room-btn')
    if (roomBtn) roomBtn.addEventListener('click', () => {
      const nextId = nextRoomId(state)
      if (nextId) { onUnlockRoom?.(nextId); close() }
    })

    const hallBtn = body.querySelector('#hall-btn')
    if (hallBtn) hallBtn.addEventListener('click', () => {
      const nextId = nextHallId(state)
      if (nextId) { onUnlockHall?.(nextId); close() }
    })

    const moveBtn = body.querySelector('#move-btn')
    if (moveBtn) moveBtn.addEventListener('click', () => {
      if (nextLocId) { onMoveToLocation(nextLocId); close() }
    })
  }

  return { open, close, update }
}
