const SETTINGS_KEY = 'fpv_settings'
const APP_VERSION  = '0.1.0-dev'

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }
  catch { return {} }
}

function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch {}
}

export function createSettingsModal(root, { onClearSave, onSoundChange, onHapticsChange, onAddMoney }) {
  let settings = { sound: true, haptics: true, ...loadSettings() }

  const overlay = document.createElement('div')
  overlay.id = 'settings-modal'
  overlay.className = 'modal-overlay'
  overlay.setAttribute('hidden', '')
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <span class="modal__title">Налаштування</span>
        <button class="modal__close" id="settings-close">✕</button>
      </div>
      <div class="modal__body">
        <div class="settings-row">
          <span>Звук</span>
          <label class="toggle">
            <input type="checkbox" id="settings-sound" ${settings.sound ? 'checked' : ''}>
            <span class="toggle__slider"></span>
          </label>
        </div>
        <div class="settings-row">
          <span>Гаптика</span>
          <label class="toggle">
            <input type="checkbox" id="settings-haptics" ${settings.haptics ? 'checked' : ''}>
            <span class="toggle__slider"></span>
          </label>
        </div>
        <div class="settings-divider"></div>
        <div class="settings-section-title">Реальні FPV дрони</div>
        <a class="btn btn--fpv-link"
           href="https://s.click.aliexpress.com/e/_c4OzDRhF"
           target="_blank" rel="noopener noreferrer">
          🛒 Компоненти для FPV дрону
        </a>
        <p class="settings-fpv-hint">Збери справжній дрон — ті самі деталі що в грі</p>
        <div class="settings-divider"></div>
        <button class="btn btn--cheat" id="settings-add-money">+1000 💸</button>
        <div class="settings-version">Версія ${APP_VERSION}</div>
        <button class="btn btn--danger" id="settings-reset">Скинути збереження</button>
      </div>
    </div>
  `
  root.appendChild(overlay)

  overlay.querySelector('#settings-close').addEventListener('click', close)
  overlay.addEventListener('click', e => { if (e.target === overlay) close() })

  overlay.querySelector('#settings-sound').addEventListener('change', e => {
    settings.sound = e.target.checked
    saveSettings(settings)
    onSoundChange?.(settings.sound)
  })
  overlay.querySelector('#settings-haptics').addEventListener('change', e => {
    settings.haptics = e.target.checked
    saveSettings(settings)
    onHapticsChange?.(settings.haptics)
  })
  overlay.querySelector('#settings-add-money').addEventListener('click', () => {
    onAddMoney?.(1000)
  })
  overlay.querySelector('#settings-reset').addEventListener('click', () => {
    if (confirm('Скинути збереження? Прогрес буде втрачено.')) {
      close()
      onClearSave()
    }
  })

  function open() { overlay.removeAttribute('hidden') }
  function close() { overlay.setAttribute('hidden', '') }

  return { open, close, getSettings: () => ({ ...settings }) }
}
