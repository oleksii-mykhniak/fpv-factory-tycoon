import { PIGGY_TAP_VALUE, PIGGY_DURATION_MS, PIGGY_MAX_PAYOUT } from '../state/config.js'

export function createPiggyModal(root, { onCollect, adsEnabled = false, onRewardedRequest }) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay piggy-overlay'
  overlay.setAttribute('hidden', '')
  overlay.innerHTML = `
    <div class="modal piggy-modal" id="piggy-tap-area">
      <div class="piggy-modal__body" id="piggy-game-screen">
        <div class="piggy-modal__title">Скарбничка</div>
        <div class="piggy-emoji" id="piggy-emoji">🐷</div>
        <div class="piggy-timer-wrap">
          <div class="piggy-timer__bar"><div class="piggy-timer__fill" id="piggy-fill"></div></div>
        </div>
        <div class="piggy-taps-display">
          <span id="piggy-taps">0</span> тапів → <span id="piggy-earn" class="piggy-earn">$0</span>
        </div>
        <div class="piggy-hint">Тапай будь-де!</div>
        <div id="piggy-coins-layer" aria-hidden="true"></div>
      </div>
      <div class="piggy-modal__body piggy-result-screen" id="piggy-result-screen" hidden>
        <div class="piggy-modal__title">Зібрано!</div>
        <div class="piggy-result-amount" id="piggy-result-amount">$0</div>
        <button class="btn btn--rewarded" id="piggy-rewarded-btn" hidden>📺 ×2 за рекламу</button>
        <button class="btn btn--primary" id="piggy-collect-btn">Забрати</button>
      </div>
    </div>
  `
  root.appendChild(overlay)

  const gameScreen  = overlay.querySelector('#piggy-game-screen')
  const resultScreen = overlay.querySelector('#piggy-result-screen')
  const emojiEl     = overlay.querySelector('#piggy-emoji')
  const fillEl      = overlay.querySelector('#piggy-fill')
  const tapsEl      = overlay.querySelector('#piggy-taps')
  const earnEl      = overlay.querySelector('#piggy-earn')
  const coinsLayer  = overlay.querySelector('#piggy-coins-layer')
  const resultAmt   = overlay.querySelector('#piggy-result-amount')
  const rewardedBtn = overlay.querySelector('#piggy-rewarded-btn')
  const collectBtn  = overlay.querySelector('#piggy-collect-btn')

  let rafId   = null
  let startTs = 0
  let taps    = 0
  let doubled = false

  function currentPayout() {
    return Math.min(taps * PIGGY_TAP_VALUE, PIGGY_MAX_PAYOUT)
  }

  function spawnCoin(x, y) {
    const coin = document.createElement('span')
    coin.className = 'piggy-coin'
    coin.textContent = '💰'
    const px = Math.max(5, Math.min(85, (x / overlay.offsetWidth) * 100))
    coin.style.setProperty('--px', `${px}%`)
    coinsLayer.appendChild(coin)
    coin.addEventListener('animationend', () => coin.remove(), { once: true })
  }

  function handlePointerDown(e) {
    e.preventDefault()
    taps++
    tapsEl.textContent = taps
    earnEl.textContent = `$${currentPayout()}`

    emojiEl.classList.remove('piggy-emoji--shake')
    void emojiEl.offsetWidth
    emojiEl.classList.add('piggy-emoji--shake')

    spawnCoin(e.clientX, e.clientY)
  }

  function tick(now) {
    const elapsed  = now - startTs
    const progress = Math.min(elapsed / PIGGY_DURATION_MS, 1)
    fillEl.style.width = `${(1 - progress) * 100}%`
    if (progress < 1) {
      rafId = requestAnimationFrame(tick)
    } else {
      onSessionEnd()
    }
  }

  function onSessionEnd() {
    overlay.removeEventListener('pointerdown', handlePointerDown)
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }

    if (!adsEnabled) {
      // No ads — close immediately as before.
      overlay.setAttribute('hidden', '')
      onCollect(taps)
      return
    }

    // Show result screen with optional rewarded button.
    doubled = false
    const payout = currentPayout()
    resultAmt.textContent = `$${payout}`
    if (!rewardedBtn.hasAttribute('hidden')) { /* already visible */ }
    rewardedBtn.removeAttribute('hidden')
    gameScreen.setAttribute('hidden', '')
    resultScreen.removeAttribute('hidden')
  }

  rewardedBtn.addEventListener('click', async () => {
    if (doubled) return
    rewardedBtn.disabled = true
    rewardedBtn.textContent = '⏳ Зачекайте...'
    const granted = onRewardedRequest ? await onRewardedRequest() : false
    if (granted) {
      doubled = true
      const newPayout = Math.min(currentPayout() * 2, PIGGY_MAX_PAYOUT * 2)
      resultAmt.textContent = `$${newPayout}`
      rewardedBtn.setAttribute('hidden', '')
    } else {
      rewardedBtn.disabled = false
      rewardedBtn.textContent = '📺 ×2 за рекламу'
    }
  })

  collectBtn.addEventListener('click', () => {
    const finalTaps = doubled ? taps * 2 : taps
    overlay.setAttribute('hidden', '')
    gameScreen.removeAttribute('hidden')
    resultScreen.setAttribute('hidden', '')
    onCollect(finalTaps)
  })

  function open() {
    taps = 0
    doubled = false
    tapsEl.textContent = '0'
    earnEl.textContent = '$0'
    fillEl.style.width = '100%'
    emojiEl.classList.remove('piggy-emoji--shake')
    coinsLayer.innerHTML = ''
    gameScreen.removeAttribute('hidden')
    resultScreen.setAttribute('hidden', '')
    rewardedBtn.disabled = false
    rewardedBtn.textContent = '📺 ×2 за рекламу'

    overlay.removeAttribute('hidden')
    overlay.addEventListener('pointerdown', handlePointerDown)
    startTs = performance.now()
    rafId   = requestAnimationFrame(tick)
  }

  function close() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }
    overlay.setAttribute('hidden', '')
    overlay.removeEventListener('pointerdown', handlePointerDown)
  }

  return { open, close }
}
