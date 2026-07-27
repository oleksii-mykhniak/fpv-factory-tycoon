// Кімнати квартири (П2).
//
// Гараж був окремою локацією: той самий цикл, ті самі об'єкти, інші кольори —
// і переїзд, який скидав касу посеред гри. Тепер це прибудова до квартири:
// купуєш кімнату, світ стає ширшим, стеля апгрейдів і штат ростуть.
//
// Це третій клієнт механіки, яку вже двічі написано для цехів фабрики (F2):
// відкрита одиниця простору несе на собі свої верстаки, свій штат і свої
// ліміти, а сума по відкритих і є «що дозволено тут».
//
// Кімнати відкриваються по черзі, тому «які відкриті» — це насправді «скільки»
// (та сама нормалізація, що й в openHalls: сейв не може описати гараж без
// квартири).

export const APARTMENT_ROOMS = Object.freeze([
  {
    id:   'flat',
    name: 'Квартира',
    cost: 0,
    req:  null,
    // Скільки верстаків СТОЇТЬ у кімнаті — стільки слотів дає layout.
    benches: 1,
    kitIds: ['mini_drone', 'racing_drone', 'cinematic_drone'],
    // Перша кімната навмисно ручна: ти і є весь штат.
    workerCaps:  { courier: 0, tech: 0, seller: 0, manager: 0 },
    upgradeCaps: { soldering: 2, storage: 0, logistics: 0, consumables: 2, benches: 0 },
  },
  {
    id:    'garage',
    name:  'Гараж',
    emoji: '🔧',
    cost:  800,
    // Та сама умова, що була на переїзді до гаража: спершу пристойний паяльник.
    req:   { minUpgrades: { soldering: 2 } },
    benches: 1,
    kitIds: ['longrange_drone'],
    // Штат рахується поролево, а не однією купою: двоє кур'єрів і нікого за
    // верстаком — це не склад команди, це глухий кут. Менеджер лишається
    // фабричним, тож «працює без мене» — те, заради чого ще переїжджають.
    workerCaps:  { courier: 1, tech: 1, seller: 1, manager: 0 },
    upgradeCaps: { soldering: 3, storage: 1, logistics: 1, consumables: 2, benches: 1 },
  },
])

export const APARTMENT_ROOM_IDS = APARTMENT_ROOMS.map(r => r.id)
export const FIRST_ROOM_ID      = APARTMENT_ROOMS[0].id

export function roomDef(roomId) {
  return APARTMENT_ROOMS.find(r => r.id === roomId) ?? null
}

export function openRooms(roomIds) {
  const count = Math.max(1, Math.min(APARTMENT_ROOMS.length, (roomIds ?? []).length))
  return APARTMENT_ROOMS.slice(0, count)
}

// Стеля апгрейдів — максимум по відкритих кімнатах, а не сума: гараж не додає
// рівнів до квартирних, він піднімає планку.
export function roomUpgradeCaps(rooms) {
  const caps = {}
  for (const room of rooms) {
    for (const [trackId, cap] of Object.entries(room.upgradeCaps ?? {})) {
      caps[trackId] = Math.max(caps[trackId] ?? 0, cap)
    }
  }
  return caps
}
