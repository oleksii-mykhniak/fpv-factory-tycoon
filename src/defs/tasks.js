// Worker tasks — behaviour as a script, not as a function.
//
// This is the payoff of C2's trigger zones: a task never says "pick the box
// up". It says "go and stand in that zone", and the zone does exactly what it
// does for the player. One implementation, two sources of intent (plan §6.3).
//
// Ops the interpreter (sim/systems/agent.js) understands:
//   goto    { zone }            walk to a zone's centre; done on arrival
//   waitFor { cond, timeoutMs } stand still until a condition holds
//   done                        release the job
//
// Targets are string refs resolved against the job: 'job.fromZone', etc.
// A new kind of worker errand = a new entry here. No new code path.

export const TASKS = Object.freeze({
  // Street slot → workbench.
  haul_delivery: {
    id:       'haul_delivery',
    role:     'courier',
    priority: 10,
    steps: [
      { op: 'goto',    zone: 'job.fromZone' },
      // The slot zone fires on arrival and puts the box in the courier's hands.
      { op: 'waitFor', cond: 'carrying', timeoutMs: 4000 },
      { op: 'goto',    zone: 'job.toZone' },
      // The bench zone takes it back off them.
      { op: 'waitFor', cond: 'notCarrying', timeoutMs: 6000 },
      { op: 'done' },
    ],
  },

  // Clear a burnt kit off a bench. Ranked above assembling because a burnt
  // bench blocks everything behind it: a technician who kept soldering
  // elsewhere while one station stood smoking would look broken.
  // Like every other task, it names a place and not an action — the bench zone
  // writes the kit off, exactly as it does when the player walks up.
  clear_burnt: {
    id:       'clear_burnt',
    role:     'tech',
    priority: 25,
    steps: [
      { op: 'goto',    zone: 'job.atZone' },
      { op: 'waitFor', cond: 'stationNotBurnt', timeoutMs: 12000 },
      { op: 'done' },
    ],
  },

  // Stand at a bench and work it until the drone is finished.
  assemble: {
    id:       'assemble',
    role:     'tech',
    priority: 20,
    steps: [
      { op: 'goto',    zone: 'job.atZone' },
      { op: 'waitFor', cond: 'stationIdleOrDone', timeoutMs: 120000 },
      { op: 'done' },
    ],
  },

  // Stand at the laptop until the order is placed (S3). Nothing here says
  // "buy a kit": the desk zone does that, exactly as the street slot is what
  // picks a box up. The task is only the walk and the wait.
  order_kit: {
    id:       'order_kit',
    role:     'manager',
    priority: 12,
    steps: [
      { op: 'goto',    zone: 'job.atZone' },
      { op: 'waitFor', cond: 'orderPlaced', timeoutMs: 8000 },
      { op: 'done' },
    ],
  },

  // Комплект → дослідницький стенд (Стадія 14 / К2).
  //
  // Це БУКВАЛЬНО haul_delivery з іншим кінцем маршруту, і саме тому нової
  // гілки коду не з'явилось: зона прийому кладе коробку в руки, зона стенду
  // забирає її назад — рівно так, як це робить верстак.
  //
  // Пріоритет нижчий за haul_delivery навмисно: коли коробка потрібна і цеху,
  // і лабораторії, виграє цех. Лабораторія їсть НАДЛИШОК — і в job.js це
  // закріплено ще й тим, що дослідницька робота взагалі не з'являється, поки
  // є вільний верстак, якому цю коробку можна віддати.
  research: {
    id:       'research',
    role:     'engineer',
    priority: 8,
    steps: [
      { op: 'goto',    zone: 'job.fromZone' },
      { op: 'waitFor', cond: 'carrying', timeoutMs: 6000 },
      { op: 'goto',    zone: 'job.toZone' },
      { op: 'waitFor', cond: 'notCarrying', timeoutMs: 12000 },
      { op: 'done' },
    ],
  },

  // Готовий дрон → майданчик обльоту → скринька (Стадія 14 / К4).
  //
  // Той самий `sell_drone` з однією зупинкою посередині. Маршрут довшає рівно
  // на цю ланку — і саме тому кімната обльоту мусить стояти поруч із цехами.
  sell_via_flight: {
    id:       'sell_via_flight',
    role:     'seller',
    priority: 15,
    steps: [
      { op: 'goto',    zone: 'job.fromZone' },
      { op: 'waitFor', cond: 'carrying', timeoutMs: 6000 },
      { op: 'goto',    zone: 'job.viaZone' },
      // Дрон, відхилений на обльоті, зникає з рук — умова має бути виконана і
      // тоді: інакше продавець стояв би над порожнім майданчиком до таймауту.
      { op: 'waitFor', cond: 'flightDone', timeoutMs: 20000 },
      { op: 'goto',    zone: 'job.toZone' },
      { op: 'waitFor', cond: 'notCarrying', timeoutMs: 6000 },
      { op: 'done' },
    ],
  },

  // Finished drone → mailbox.
  sell_drone: {
    id:       'sell_drone',
    role:     'seller',
    priority: 15,
    steps: [
      { op: 'goto',    zone: 'job.fromZone' },
      { op: 'waitFor', cond: 'carrying', timeoutMs: 6000 },
      { op: 'goto',    zone: 'job.toZone' },
      { op: 'waitFor', cond: 'notCarrying', timeoutMs: 6000 },
      { op: 'done' },
    ],
  },
})

export function taskDef(type) {
  const task = TASKS[type]
  if (!task) throw new Error(`taskDef: невідома задача "${type}"`)
  return task
}
