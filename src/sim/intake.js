// Приймальний ящик — куди приїжджає замовлений комплект (Стадія 12 / Д1).
//
// Тут стояв конвеєр. Він розв'язував справжню задачу — кур'єр не має тягти
// коробку через три цехи, — але показував механізм, а не подію: коробка
// з'являлась у лівій стіні й повзла сірою смугою.
//
// Ящик розв'язує ту саму задачу дешевше. Цех вибирається В МОМЕНТ ЗАМОВЛЕННЯ,
// і коробка приїжджає одразу в ящик того цеху, якому потрібна. Маршрут кур'єра
// тоді ніколи не виходить за межі одного цеху — тобто довга прогулянка, заради
// якої будувалась стрічка, не повертається (інваріант закріплено в
// layout.test.js).
//
// Правило вибору — те саме, що було в `hallWillTake`, лише зсунуте в часі.

import { DeliveryStatus, Phase, orderKit, stationsOf } from '../state/gameState.js'
import { INTAKE_CAPACITY } from '../state/config.js'

// Скільки коробок уже їде або лежить у ящику цього цеху. CARRYING не рахуємо:
// така коробка вже в руках, ящик під нею звільнився.
export const intakeLoad = (game, hallId) =>
  (game.deliveries ?? []).filter(
    d => d.hallId === hallId && d.status === DeliveryStatus.TRANSIT,
  ).length

const hasIdleBench = (world, hallId) => {
  const slots = world.layout?.stationSlots ?? []
  return stationsOf(world.game).some(
    (s, i) => slots[i]?.hallId === hallId && s.phase === Phase.IDLE,
  )
}

// Цех, у який поїде наступне замовлення. `null` там, де цехів немає взагалі
// (квартира, гараж) — там коробку й далі привозять у вуличний слот.
//
// Обидві половини правила несучі: без перевірки верстаків усе валиться в цех 1,
// без місткості один цех, що застряг, ковтає весь портфель замовлень.
export function chooseIntakeHall(world) {
  // Тільки цехи СКЛАДАННЯ (Стадія 14 / К1): у лабораторії чи на майданчику
  // обльоту немає ні верстака, ні приймального ящика, і коробка, привезена
  // туди, просто зникла б з гри.
  const halls = (world.layout?.halls ?? []).filter(h => (h.kind ?? 'assembly') === 'assembly')
  if (!halls.length) return null

  const load  = (h) => intakeLoad(world.game, h.id)
  const ready = halls.filter(h => hasIdleBench(world, h.id) && load(h) < INTAKE_CAPACITY)
  const pool  = ready.length ? ready : halls
  return pool.reduce((best, h) => (load(h) < load(best) ? h : best), pool[0]).id
}

// orderKit + вибір цеху як одна операція. Обидва місця, звідки замовляють
// (кнопка магазину і менеджер за ноутбуком), мають ставити `hallId` — інакше
// коробка приїде в нікуди й кур'єр по неї не піде.
export function orderKitInto(world, kitId, makeId) {
  const known = new Set((world.game.deliveries ?? []).map(d => d.id))
  const hallId = chooseIntakeHall(world)
  const next = orderKit(world.game, kitId, world.now, makeId)
  world.game = {
    ...next,
    deliveries: next.deliveries.map(d => (known.has(d.id) ? d : { ...d, hallId })),
  }
}
