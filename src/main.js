import './style.css'
import {
  createState, Phase, KIT_TYPES,
  orderKit, receiveDelivery, startAssembly,
  recordSolderPoint, finishAssembly, sell,
  burnKit, abandonBurntDrone,
  calcPrice,
} from './state/gameState.js'
import { COLD_SOLDER_THRESHOLD, OVERHEAT_CHANCE, SALVAGE_RATE } from './state/config.js'
import { render } from './ui/domUI.js'
import { createSolderGame } from './ui/solderGame.js'

let state      = createState()
let activeGame = null
let warning    = null   // 'cold' | null — shown above mini-game after a cold-solder miss
const salesLog = []
const uiRoot   = document.getElementById('ui-root')

function draw() {
  if (activeGame) {
    activeGame.destroy()
    activeGame = null
  }

  render(uiRoot, state, handlers, salesLog, warning)
  warning = null

  const sgHost = uiRoot.querySelector('#sg-host')
  if (sgHost) {
    activeGame = createSolderGame(sgHost, {
      pointIndex: state.solderPoints.length,
      onResult: handleSolderResult,
    })
  }
}

function update(newState) {
  state = newState
  draw()
}

function canAffordAfterBurn() {
  const kit     = KIT_TYPES[state.activeKit]
  const salvage = kit.cost * SALVAGE_RATE
  return state.money + salvage >= kit.cost
}

function handleSolderResult(quality) {
  if (quality >= COLD_SOLDER_THRESHOLD) {
    update(recordSolderPoint(state, quality))
    return
  }
  // Overheat blocked when player wouldn't have enough to reorder even with salvage.
  if (Math.random() < OVERHEAT_CHANCE && canAffordAfterBurn()) {
    update(burnKit(state))
  } else {
    warning = 'cold'
    draw()
  }
}

const handlers = {
  onOrder:   () => update(orderKit(state, 'mini_drone')),
  onDeliver: () => update(receiveDelivery(state)),
  onStart:   () => update(startAssembly(state)),
  onFinish:  () => update(finishAssembly(state)),
  onAbandon: () => update(abandonBurntDrone(state, SALVAGE_RATE)),
  onSell: () => {
    const kit   = KIT_TYPES[state.activeKit]
    const price = calcPrice(kit.basePrice, state.assemblyQuality, state.upgrades.priceMultiplier)
    salesLog.push({ quality: state.assemblyQuality, price })
    update(sell(state))
  },
}

draw()
