// Thin storage wrapper — today: localStorage; later: @capacitor/preferences.
// main.js only calls saveGame / loadGame / clearSave and never touches the key directly.

const SAVE_KEY     = 'fpv_factory_save'
const SAVE_VERSION = 1

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

// Returns { state, salesLog } or null if no valid save exists.
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const payload = JSON.parse(raw)
    if (payload.version !== SAVE_VERSION) return null
    return { state: payload.state, salesLog: payload.salesLog ?? [] }
  } catch {
    return null
  }
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY)
}
