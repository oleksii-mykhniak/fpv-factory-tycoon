// Bottom bar — settings only (S2).
//
// It used to hold Shop and Upgrades. Both are places in the room now: a desk
// with a laptop and an upgrade rack, each with its own trigger zone. A bar of
// buttons pinned over the game was the last piece of the old "game inside a
// menu" shape, and the badges that lived here moved onto the objects
// themselves, where the thing that needs attention actually is.

export function createActionBar(root, { onSettingsOpen }) {
  const el = document.createElement('div')
  el.id = 'action-bar'
  el.classList.add('action-bar--single')
  el.innerHTML = `
    <button class="action-bar__btn" id="ab-settings">
      <span class="action-bar__icon">⚙️</span>
      <span class="action-bar__label">Налаштування</span>
    </button>
  `
  root.appendChild(el)

  el.querySelector('#ab-settings').addEventListener('click', onSettingsOpen)

  // Kept so callers need not care whether the bar has anything state-dependent
  // left on it. Right now it has not.
  function update() {}

  return { el, update }
}
