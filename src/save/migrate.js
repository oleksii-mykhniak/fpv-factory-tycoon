// Міграції збереженого стану, які варті власного тесту.
//
// Решта живе в migrateState() у main.js — там вона переважно перекладає поля з
// місця на місце. Сюди виноситься те, де помилка коштує гравцеві предмета: якщо
// доставку не перекласти на нову схему, коробка, за яку вже заплачено, зникає з
// гри, і зникає тихо.

import { FACTORY_HALL_IDS } from '../defs/layouts/factory.js'

// Стадія 12 / Д3.1: конвеєра більше немає, і коробка знає не «яку точку скидання
// стрічка їй обрала» (`dropIndex`), а «в ящику якого цеху вона лежить»
// (`hallId`). Порядок цехів і був порядком точок скидання, тому переклад
// однозначний.
//
// Доставка без `dropIndex` — це або замовлення в квартирі/гаражі (там і далі
// вуличний слот), або коробка, яка на момент збереження ще їхала стрічкою. І
// та, і та лишаються без `hallId`: перша так і задумана, друга приїде у
// вуличний слот замість того, щоб загубитись.
export function migrateDeliveries(state) {
  const deliveries = state.deliveries ?? []
  if (!deliveries.some(d => d.dropIndex !== undefined)) return state

  return {
    ...state,
    deliveries: deliveries.map(({ dropIndex, ...d }) => {
      if (d.hallId) return d
      const hallId = FACTORY_HALL_IDS[dropIndex]
      return hallId ? { ...d, hallId } : d
    }),
  }
}
