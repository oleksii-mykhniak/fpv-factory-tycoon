// Settings — a corner button, not a bar.
//
// The bottom bar is gone. It was the last of the "game inside a menu" shape:
// shop, upgrades and hiring are all places in the room now (S2), and a bar
// holding one button still cost ~68px of screen forever. Settings is the one
// thing with nowhere to stand in the room, so it sits in the top-right corner
// and gets out of the way.

export function createSettingsButton(root, { onSettingsOpen }) {
  const el = document.createElement('button')
  el.id = 'settings-btn'
  el.className = 'settings-btn'
  el.type = 'button'
  el.setAttribute('aria-label', 'Налаштування')
  el.textContent = '⚙️'
  root.appendChild(el)

  el.addEventListener('click', onSettingsOpen)

  return { el }
}
