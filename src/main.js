import './style.css'
import {
  createState, Phase, KIT_TYPES,
  orderKit, receiveDelivery, startAssembly,
  recordSolderPoint, finishAssembly, sell,
  calcPrice,
} from './state/gameState.js'
import { render } from './ui/domUI.js'
import { createSolderGame } from './ui/solderGame.js'

let state        = createState()
let activeGame   = null
const salesLog   = []
const uiRoot     = document.getElementById('ui-root')

function draw() {
  if (activeGame) {
    activeGame.destroy()
    activeGame = null
  }

  render(uiRoot, state, handlers, salesLog)

  const sgHost = uiRoot.querySelector('#sg-host')
  if (sgHost) {
    activeGame = createSolderGame(sgHost, {
      pointIndex: state.solderPoints.length,
      onResult: (quality) => update(recordSolderPoint(state, quality)),
    })
  }
}

function update(newState) {
  state = newState
  draw()
}

const handlers = {
  onOrder:   () => update(orderKit(state, 'mini_drone')),
  onDeliver: () => update(receiveDelivery(state)),
  onStart:   () => update(startAssembly(state)),
  onFinish:  () => update(finishAssembly(state)),
  onSell: () => {
    const kit   = KIT_TYPES[state.activeKit]
    const price = calcPrice(kit.basePrice, state.assemblyQuality, state.upgrades.priceMultiplier)
    salesLog.push({ quality: state.assemblyQuality, price })
    update(sell(state))
  },
}

draw()
