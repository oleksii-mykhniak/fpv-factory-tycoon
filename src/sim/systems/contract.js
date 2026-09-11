// Система контрактів (Стадія 14 / К3) — годинник над портфелем замовлень.
//
// Робить рівно дві речі й жодної третьої: тримає слоти повними і викидає
// прострочені. Зарахування відвантажень тут НЕМАЄ навмисно — воно живе у
// взаємодії зі скринькою (`defs/interactions.js`), бо контракт закривається
// саме відвантаженням, і другого місця, яке вважає його виконаним, бути не
// повинно.
//
// Мовчить там, де відділу контрактів немає: кімната — це й є вимикач.

import { refillContracts, expireContracts, contractsOf } from '../../state/contracts.js'
import { kitsForLocation } from '../../state/locations.js'
import { EV, emit } from '../events.js'

// Чи є відкритий відділ контрактів. Питаємо в РОЗКЛАДКИ, а не в сейву: те саме
// правило, що й у лабораторії — кімната існує тоді, коли вона стоїть на плані.
export const hasContractDesk = (world) =>
  (world.zones ?? []).some(z => z.kind === 'contracts')

export function contractSystem(world, _dt, events) {
  if (!hasContractDesk(world)) {
    // Кімнати немає — і портфеля теж. Без цього рядка контракти, видані колись,
    // тікали б по дедлайну й далі списували репутацію в кімнаті, якої вже
    // немає на плані.
    if (contractsOf(world.game).length) world.game = { ...world.game, contracts: [] }
    return
  }

  const expired = expireContracts(world.game, world.now)
  world.game = expired.state
  for (const c of expired.failed) {
    emit(events, EV.CONTRACT_FAILED, { id: c.id, kitId: c.kitId, qty: c.qty, done: c.done })
  }

  const before = contractsOf(world.game).length
  world.game = refillContracts(world.game, {
    kitIds: kitsForLocation(world.game),
    now:    world.now,
    rng:    world.rng,
    makeId: () => `contract-${world.seq++}`,
  })
  if (contractsOf(world.game).length !== before || expired.failed.length) {
    emit(events, EV.STATE_DIRTY)
  }
}
