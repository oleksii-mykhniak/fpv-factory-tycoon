// Thin storage wrapper — today: localStorage; later: @capacitor/preferences.
// main.js only calls saveGame / loadGame / clearSave and never touches the key directly.

const SAVE_KEY = 'fpv_factory_save'

// The schema this build writes. Bump it whenever the saved shape changes.
//
// Bumping this ALONE does not throw a save away: migrateState() in main.js has
// been carrying old shapes forward since D6 and there is no reason to discard a
// save we can still read. What throws a save away is raising the floor below.
// 4 (Стадія 9 / Р1): у стані з'явились лічильники `stats` — на них тримаються
// квести-дії.
export const SAVE_VERSION = 5

// The oldest schema this build will still load. Raise it — deliberately, and
// only alongside a comment saying why — when a change is too structural to
// migrate honestly, and starting over is better than a save that half works.
//
// 2 (Stage 5 / F1): the third location changed id, upgrade tracks began
// freezing, and the failure model moved onto the unattended path. A version-1
// save is a shop built under rules the game no longer plays by.
//
// 3 (Stage 8 / П1–П4): the garage stopped being a location and became a room of
// the flat, so the whole middle of the game is a different shape — different
// floor plan, different money (a room is bought, a move used to reset the
// balance), different ceilings. migrateState CAN carry an old save across, and
// it does; what it cannot do is make the result a game anybody actually played.
// Everyone starts the new one from the beginning, deliberately.
//
// 4 (Стадія 9 / Р1–Р8): гра тепер веде по ланцюгу з 27 кроків, і вся її
// послідовність — коли з'являється кожен інструмент, коли відкривається найм,
// коли шафа показує що — виводиться зі стану, якого в сейві версії 3 немає.
// Технічно такий сейв читається: `stats` заповнюються нулями, а `outgrown`
// не дає пропонувати «продай 3 дрони» власникові фабрики. Але результат — це
// шоп, який ніхто не проходив: гравець із середини старої гри падає в середину
// ланцюга з нульовою історією, а половину відкриттів (картку кімнати, введення
// треків) уже не побачить ніколи. Тому — з нуля, навмисно.
//
// `outgrown` і нормалізація `stats` лишаються: вони й далі захищають будь-який
// стан, де гравець об'єктивно далі, ніж каже лічильник (сейв, записаний між
// стадіями; стан, зібраний тестом).
export const MIN_LOADABLE_VERSION = 5

export function saveGame(state, salesLog) {
  const payload = {
    version:  SAVE_VERSION,
    savedAt:  Date.now(),
    state,
    salesLog,
  }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload))
  } catch {
    // storage full or private-mode restriction — silently ignore
  }
}

// Returns { state, salesLog, savedAt } or null when there is nothing loadable.
//
// A save that is too old is DELETED here rather than merely ignored: leaving it
// in place means every launch pays to parse it and, worse, a later build that
// lowers the floor would resurrect a shop the player has long since replaced.
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null

    const payload = JSON.parse(raw)
    const version = payload.version ?? 0

    if (version < MIN_LOADABLE_VERSION) {
      console.info(
        `[save] версія ${version} старіша за мінімальну ${MIN_LOADABLE_VERSION} — починаємо з нуля`,
      )
      clearSave()
      return null
    }
    // A save from a NEWER build (the player downgraded, or two devices share a
    // browser profile) is left alone rather than deleted: this build cannot
    // read it, but it is not ours to destroy.
    if (version > SAVE_VERSION) {
      console.warn(`[save] версія ${version} новіша за цю збірку (${SAVE_VERSION}) — ігноруємо`)
      return null
    }

    return { state: payload.state, salesLog: payload.salesLog ?? [], savedAt: payload.savedAt ?? null }
  } catch {
    return null
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // nothing we can do, and nothing that should stop the game booting
  }
}
