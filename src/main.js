import './style.css'
import {
  createState,
  orderKit, receiveDelivery, startAssembly,
  recordSolderPoint, finishAssembly, sell,
  calcPrice, KIT_TYPES,
} from './state/gameState.js'
import { render } from './ui/domUI.js'

let state    = createState()
const salesLog = []
const uiRoot = document.getElementById('ui-root')

function draw() {
  render(uiRoot, state, handlers, salesLog)
}

function update(newState) {
  state = newState
  draw()
}

const handlers = {
  onOrder:   () => update(orderKit(state, 'mini_drone')),
  onDeliver: () => update(receiveDelivery(state)),
  onStart:   () => update(startAssembly(state)),
  onSolder:  () => update(recordSolderPoint(state, Math.random())),
  onFinish:  () => update(finishAssembly(state)),
  onSell: () => {
    const kit   = KIT_TYPES[state.activeKit]
    const price = calcPrice(kit.basePrice, state.assemblyQuality, state.upgrades.priceMultiplier)
    salesLog.push({ quality: state.assemblyQuality, price })
    update(sell(state))
  },
}

draw()
