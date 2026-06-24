import { TINDER_GOOD_CARDS, TINDER_JUNK_CARDS, TINDER_MIN_GOOD } from '../state/config.js'

const GOOD_CARDS = [
  { emoji: '🔩', name: 'Гвинт M3',     desc: 'Ще пригодиться!' },
  { emoji: '🔋', name: 'Акумулятор',   desc: 'Майже новий!' },
  { emoji: '⚙️', name: 'Підшипник',    desc: 'Крутиться!' },
  { emoji: '📡', name: 'Антена VTX',   desc: 'Сигнал є!' },
  { emoji: '🛠️', name: 'ESC плата',    desc: 'Підходить!' },
]

const JUNK_CARDS = [
  { emoji: '🍌', name: 'Шкірка банани', desc: 'Слизько...' },
  { emoji: '🧦', name: 'Старий носок',  desc: 'Точно не деталь' },
  { emoji: '🪣', name: 'Дірявий кошик', desc: 'Непридатний' },
  { emoji: '🐀', name: 'Щур',           desc: 'АА!' },
  { emoji: '📰', name: 'Газета',         desc: 'Читаємо пізніше' },
]

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildDeck() {
  const goods = shuffle(GOOD_CARDS).slice(0, TINDER_GOOD_CARDS).map(c => ({ ...c, good: true }))
  const junks = shuffle(JUNK_CARDS).slice(0, TINDER_JUNK_CARDS).map(c => ({ ...c, good: false }))
  return shuffle([...goods, ...junks])
}

export function createTrashModal(root, { onSuccess, onFail }) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay tinder-overlay'
  overlay.setAttribute('hidden', '')
  overlay.innerHTML = `
    <div class="modal tinder-modal">
      <div class="modal__header">
        <span class="modal__title">🗑️ Копаємось у смітнику</span>
      </div>

      <div class="tinder-game" id="tinder-game">
        <div class="tinder-hints">
          <span class="tinder-hint tinder-hint--left" id="hint-left">← Викинь</span>
          <span class="tinder-hint tinder-hint--right" id="hint-right">Збережи →</span>
        </div>

        <div class="tinder-card-wrap" id="tinder-card-wrap">
          <div class="tinder-card" id="tinder-card" touch-action="none">
            <div class="tinder-card__emoji" id="tinder-emoji"></div>
            <div class="tinder-card__name"  id="tinder-name"></div>
            <div class="tinder-card__desc"  id="tinder-desc"></div>
          </div>
        </div>

        <div class="tinder-counter" id="tinder-counter">1 / ${TINDER_GOOD_CARDS + TINDER_JUNK_CARDS}</div>

        <div class="tinder-btns">
          <button class="tinder-btn tinder-btn--toss" id="btn-toss">❌ Викинути</button>
          <button class="tinder-btn tinder-btn--keep" id="btn-keep">✅ Зберегти</button>
        </div>
      </div>

      <div class="tinder-result" id="tinder-result" hidden>
        <div class="tinder-result__emoji" id="tinder-res-emoji"></div>
        <div class="tinder-result__text"  id="tinder-res-text"></div>
        <div class="tinder-result__sub"   id="tinder-res-sub"></div>
      </div>
    </div>
  `
  root.appendChild(overlay)

  const gameEl      = overlay.querySelector('#tinder-game')
  const resultEl    = overlay.querySelector('#tinder-result')
  const cardEl      = overlay.querySelector('#tinder-card')
  const emojiEl     = overlay.querySelector('#tinder-emoji')
  const nameEl      = overlay.querySelector('#tinder-name')
  const descEl      = overlay.querySelector('#tinder-desc')
  const counterEl   = overlay.querySelector('#tinder-counter')
  const hintLeft    = overlay.querySelector('#hint-left')
  const hintRight   = overlay.querySelector('#hint-right')
  const btnToss     = overlay.querySelector('#btn-toss')
  const btnKeep     = overlay.querySelector('#btn-keep')
  const resEmoji    = overlay.querySelector('#tinder-res-emoji')
  const resText     = overlay.querySelector('#tinder-res-text')
  const resSub      = overlay.querySelector('#tinder-res-sub')

  const TOTAL = TINDER_GOOD_CARDS + TINDER_JUNK_CARDS

  let deck      = []
  let cardIdx   = 0
  let goodKept  = 0
  let animating = false

  // ── Swipe drag ────────────────────────────────────────
  let dragStartX  = 0
  let dragging    = false

  function onPointerDown(e) {
    if (animating) return
    dragging   = true
    dragStartX = e.clientX
    cardEl.style.transition = 'none'
    cardEl.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e) {
    if (!dragging) return
    const dx  = e.clientX - dragStartX
    const rot = Math.max(-15, Math.min(15, dx * 0.12))
    cardEl.style.transform = `translateX(${dx}px) rotate(${rot}deg)`

    // Hint emphasis
    if (dx > 30) {
      hintRight.classList.add('tinder-hint--active')
      hintLeft.classList.remove('tinder-hint--active')
    } else if (dx < -30) {
      hintLeft.classList.add('tinder-hint--active')
      hintRight.classList.remove('tinder-hint--active')
    } else {
      hintLeft.classList.remove('tinder-hint--active')
      hintRight.classList.remove('tinder-hint--active')
    }
  }

  function onPointerUp(e) {
    if (!dragging) return
    dragging = false
    const dx = e.clientX - dragStartX
    cardEl.style.transition = 'transform 0.25s, opacity 0.25s'
    hintLeft.classList.remove('tinder-hint--active')
    hintRight.classList.remove('tinder-hint--active')

    if (dx > 50)       doSwipe('right')
    else if (dx < -50) doSwipe('left')
    else               cardEl.style.transform = ''  // snap back
  }

  cardEl.addEventListener('pointerdown', onPointerDown)
  cardEl.addEventListener('pointermove', onPointerMove)
  cardEl.addEventListener('pointerup',   onPointerUp)

  btnKeep.addEventListener('click', () => { if (!animating) doSwipe('right') })
  btnToss.addEventListener('click', () => { if (!animating) doSwipe('left') })

  function doSwipe(dir) {
    animating = true
    const card = deck[cardIdx]
    const flyX = dir === 'right' ? '160%' : '-160%'
    const rot  = dir === 'right' ? '22deg' : '-22deg'

    if (dir === 'right' && card.good) goodKept++

    cardEl.style.transition = 'transform 0.3s ease, opacity 0.3s'
    cardEl.style.transform  = `translateX(${flyX}) rotate(${rot})`
    cardEl.style.opacity    = '0'

    setTimeout(() => {
      cardIdx++
      animating = false
      if (cardIdx >= TOTAL) {
        showResult()
      } else {
        renderCard()
      }
    }, 320)
  }

  function renderCard() {
    const card = deck[cardIdx]
    cardEl.style.transition = 'none'
    cardEl.style.transform  = 'translateX(0) rotate(0deg)'
    cardEl.style.opacity    = '1'
    emojiEl.textContent = card.emoji
    nameEl.textContent  = card.name
    descEl.textContent  = card.desc
    counterEl.textContent = `${cardIdx + 1} / ${TOTAL}`
    // Tease the card type: good = subtle green border, junk = subtle red border
    cardEl.className = `tinder-card ${card.good ? 'tinder-card--good' : 'tinder-card--junk'}`
  }

  function showResult() {
    gameEl.setAttribute('hidden', '')
    resultEl.removeAttribute('hidden')

    const success = goodKept >= TINDER_MIN_GOOD
    if (success) {
      resEmoji.textContent = goodKept >= TINDER_GOOD_CARDS ? '🏆' : '✅'
      resText.textContent  = `Знайдено ${goodKept}/${TINDER_GOOD_CARDS} деталей!`
      resSub.textContent   = 'Несемо паяти!'
    } else {
      resEmoji.textContent = '😬'
      resText.textContent  = `Лише ${goodKept} деталей...`
      resSub.textContent   = 'Не вистачає для збирання'
    }

    setTimeout(() => {
      overlay.setAttribute('hidden', '')
      if (success) onSuccess?.(goodKept)
      else         onFail?.()
    }, 1600)
  }

  function open() {
    deck      = buildDeck()
    cardIdx   = 0
    goodKept  = 0
    animating = false
    dragging  = false

    hintLeft.classList.remove('tinder-hint--active')
    hintRight.classList.remove('tinder-hint--active')

    gameEl.removeAttribute('hidden')
    resultEl.setAttribute('hidden', '')
    overlay.removeAttribute('hidden')
    renderCard()
  }

  function close() {
    overlay.setAttribute('hidden', '')
  }

  return { open, close }
}
