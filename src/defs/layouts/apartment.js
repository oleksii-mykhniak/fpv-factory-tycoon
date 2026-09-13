// Квартира — і гараж, коли його куплено (П2).
//
// Раніше це були дві локації з двома світами; тепер один світ, який росте
// вправо. Контракт той самий, що й у фабрики: `buildApartmentLayout` повертає
// РІВНО той об'єкт, який повертає buildLayout, тож перешкоди, nav-сітка, зони,
// камера і сцена не дізнаються слова «кімната».
//
// Гараж навмисно менший за старий (900×950 проти 1500×1700): він тепер стоїть
// поруч із квартирою, а не замість неї, і мусить читатись як прибудова.

import { buildLayout } from './buildLayout.js'
import { openRooms } from './rooms.js'
import { u } from '../../state/config.js'

// One Kenney tile = one character height (V4).
const T = u(1)

const FLAT_W  = 1000
const ROOM_H  = 950
// Двір глибший, ніж був (400 → 600). Причина не в красі: на 400 одиницях
// парковка, доріжка й газон стояли б упритул один до одного, і двір читався б
// як три смуги, а не як подвір'я. Плюс паркан з'їдає нижні 40.
const WORLD_H = 1550
const GARAGE_W = 900

// ── Двір ────────────────────────────────────────────────────────────────────
//
// Раніше «вулиця» була суцільним асфальтом на всю ширину світу з розкиданими
// по ньому деревами — тобто проїжджою частиною, на якій чомусь ростуть кущі, і
// краєм світу замість межі ділянки.
//
// Тепер це ділянка: газон за замовчуванням, а тверде покриття лежить рівно
// там, де воно навіщось потрібне — майданчик перед дверима (туди приїжджають
// коробки), доріжка від дверей до хвіртки і парковка збоку. Порядок такий
// самий, як у справжньому дворі: спершу питання «де тут ходять і де стоїть
// машина», і лише тоді асфальт.
const YARD_Y = ROOM_H                    // де починається двір
const FENCE_INSET = 24                   // наскільки паркан відступає від краю світу
const FENCE_Y = WORLD_H - FENCE_INSET    // вісь нижнього прогону

// Майданчик перед дверима: сюди привозять коробки, тому він і бетонний.
const APRON = { x: 396, y: YARD_Y, w: 566, h: 172 }
// Доріжка від дверей до хвіртки. Ширина — рівно дверний проріз (180), щоб вона
// читалась як продовження дверей, а не як другий об'єкт поруч.
const PATH  = { x: 414, y: APRON.y + APRON.h, w: 172, h: 390 }
// Парковка. Впритул до доріжки лівим боком: майданчик, з якого нікуди не
// виїхати, читається як пляма фарби на траві.
const PARK  = { x: 110, y: 1150, w: 304, h: 340 }
// Під'їзд до гаражних воріт — та сама роль, що в доріжки, тільки для машини.
const DRIVE_W = 280

// Прогін паркана як список секцій. Одна секція — один спрайт, бо сцена малює
// декор посекційно; ділити довгу сторону на секції ЗАВШИРШКИ В ЗРІСТ
// ПЕРСОНАЖА, а не розтягувати один спрайт, — те саме правило щільності
// пікселя, що й для плитки.
//
// `solid: true` на кожній: паркан і є те, що не дає вийти за локацію, і робить
// це через ті самі перешкоди, що й стіни, а не через окрему перевірку.
//
// Проріз під хвіртку рахує `gateSlot` — і рахує його ОДИН раз на обох
// клієнтів. Перший захід ставив хвіртку на осі дверей, а проріз вирізав
// найближчими секціями, і між ними лишалась смуга газону завширшки в півсекції:
// паркан виглядав суцільним, а пройти крізь нього було можна.
function fenceRun({ axis, at, from, to, gaps = [] }) {
  const step = T
  const out  = []
  const inGap = (c) => gaps.some(g => c > g.at - g.size / 2 && c < g.at + g.size / 2)
  const section = (centre) => axis === 'h'
    ? { sprite: 'o_fence_h', x: centre, y: at, w: T, h: T * 0.55, z: 2 }
    : { sprite: 'o_fence_v', x: at, y: centre, w: T * 0.34, h: T, z: 2 }

  let p = from
  for (; p + step <= to + 1; p += step) {
    const centre = p + step / 2
    if (!inGap(centre)) out.push(section(centre))
  }
  // Хвіст. Сторона рідко ділиться на секції націло, і без цього рядка в кінці
  // кожного прогону лишалась дірка завширшки до цілої секції — рівно в кутку,
  // де її найважче помітити й найлегше в неї вийти. Остання секція
  // ПРИСУВАЄТЬСЯ до кінця й перекриває попередню: перекриття видно лише як
  // зайву штахетину, дірку — як помилку.
  if (p < to - 1 && !inGap(to - step / 2)) out.push(section(to - step / 2))

  return out
}

// Проріз під хвіртку, вирівняний по сітці секцій: завжди ціле їх число,
// починаючи від краю світу. Повертає центр і ширину — те саме, що йде і в
// `gap` прогону, і в спрайт хвіртки, тож ці двоє не можуть розійтись.
function gateSlot(nearX, sections = 2) {
  const first = Math.max(0, Math.round((nearX - sections * T / 2) / T))
  return { at: first * T + sections * T / 2, size: sections * T }
}

// Lighter than it was (V4 polish): the whole game read as a night scene, and
// a home should not. Wall, street and pavement live here too — they were
// hardcoded in the scene, which meant a location could not really have a
// palette of its own.
const THEME = {
  bgColor:       '#242236',
  floorColor:    '#4b4260',
  // Двір — газон, а не проїжджа частина. Колір під плиткою трави, а не сірий:
  // плитка кладеться цілими клітинками, і на краях світу з-під неї видно рівно
  // цю заливку.
  streetColor:   '#3c703c',
  pavementColor: '#3d3d54',
  // Wooden boards indoors, asphalt outside. Tinted rather than redrawn, so
  // one tile serves every location and they still read as different places.
  // Wall and door come from the same palette as everything else, and are lit
  // the same way: body, lighter top edge, shadow where they meet the floor.
  wallColor:     '#55526e',
  wallEdge:      '#6b7284',
  wallShadow:    '#242232',
  doorColor:     '#7a5533',
  floorTile:     'tile_wood',
  streetTile:    'tile_grass',
  // Тверде покриття двору. Бетон там, де ходять, асфальт там, де стоїть
  // машина: одного покриття на все досить, щоб доріжка й парковка злились в
  // одну сіру пляму, а вони мають різні ролі.
  pathTile:      'tile_paving',
  pathColor:     '#9aa2b4',
  parkTile:      'tile_asphalt',
  parkColor:     '#3a384c',
}

export function buildApartmentLayout(roomIds) {
  const rooms  = openRooms(roomIds)
  const garage = rooms.some(r => r.id === 'garage')
  const worldW = FLAT_W + (garage ? GARAGE_W : 0)
  const X0     = FLAT_W   // where the garage starts
  // Хвіртка перед входом і в'їзд до гаража — обидва по сітці секцій паркана.
  const frontGate = gateSlot(500)
  const driveGate = gateSlot(X0 + 450)

  return buildLayout({
    id:    'apartment',
    world: { w: worldW, h: WORLD_H },
    roomH: ROOM_H,
    door:  { x: 500, w: 180 },
    // A garage has a garage door. Same wall, second hole — see extraDoors.
    extraDoors: garage ? [{ x: X0 + 450, w: 260 }] : [],
    partitions: [
      // Between the room and the kitchen, with a doorway in the middle.
      { axis: 'v', at: 620, from: 0, to: 600, gaps: [{ at: 300, size: 170 }] },
      // Between both rooms and the hallway: one opening each, so neither room
      // is reached only by walking through the other.
      { axis: 'h', at: 600, from: 0, to: FLAT_W, gaps: [
        { at: 280, size: 190 },
        { at: 830, size: 190 },
      ] },
      // The garage wall. Until it is bought this is the outer wall of the flat,
      // built the same way — nothing behind it exists, which is the point: a
      // darkened room you cannot enter is either a spoiler or a bug on sight.
      ...(garage
        ? [{ axis: 'v', at: X0, from: 0, to: ROOM_H, gaps: [{ at: 790, size: 200 }] }]
        : []),
    ],
    // Слоти верстаків: перший — у кімнаті, другий приходить із гаражем. Порядок
    // важить: станції розкладаються за індексом, тож station-0 лишається вдома.
    stationSlots: [
      // In the room, far enough down the wall that the output side behind it is
      // a corridor a character can actually walk along (S1.2).
      { def: 'workbench', x: 300, y: 300 },
      ...(garage ? [{ def: 'workbench', x: X0 + 300, y: 320 }] : []),
    ],
    // Sizes are whole tiles: T = 74 world units = one character height, the
    // ratio the Kenney art is drawn at (V4). A bed is 1×2 tiles because a bed
    // is twice as long as a person is tall.
    props: {
      lamp:     { x: 300, y: 90,  w: T,      h: T,      sprite: 'f_painting',  color: '#d4c060', z: 2 },
      rack:     { x: 110, y: 470, w: T,      h: T*1.4,  sprite: 'f_bookshelf', color: '#3a6a72' },
      // The laptop lives on the kitchen table — this is a shop run from home.
      desk:     { x: 820, y: 300, w: T*1.3,  h: T,      sprite: 'desk',        color: '#5a4a7a' },
      piggy:    { x: 120, y: 790, w: T*0.7,  h: T*0.7,  sprite: 'piggy',       color: '#d4607a' },
      // Скринька й бак стоять на газоні обабіч майданчика, а не посеред двору.
      // Обидва — те, до чого ходять щоцикл, тому вони при дверях: скринька
      // ліворуч від виходу, бак праворуч, і жоден не стоїть на доріжці, якою
      // носять коробки.
      mailbox:  { x: 330, y: 1010, w: T*0.8, h: T,      sprite: 'o_postbox',   color: '#3a5db8' },
      trashbin: { x: 760, y: 1200, w: T*0.8, h: T*0.9,  sprite: 'o_bin',       color: '#4a6a3a' },
      // Дошка найму фізично живе в гаражі: наймати можна рівно там, де для
      // людей є місце, і панель не існує раніше за це.
      ...(garage
        ? { jobboard: { x: X0 + 60, y: 200, w: T, h: T, sprite: 'f_painting', color: '#7a5a3a' } }
        : {}),
    },
    // Furniture that does nothing (V3). This is a home: the bench sits in
    // somebody's living room, and the whole point of the first location is that
    // you can see that.
    // Colours are chosen against the floor, not in isolation: the first pass
    // used dark furniture that vanished the moment the floor was lightened.
    // Every size below matches the aspect the sprite was DRAWN at. Stretching a
    // sprite to a different shape is what made the first pass look smeared.
    decor: [
      { sprite: 'f_rug',       x: 300, y: 430, w: T*2.4, h: T*1.6, z: 0.6 },
      { sprite: 'f_bed',       x: 500, y: 150, w: T,     h: T*1.9, z: 2 },
      { sprite: 'f_sofa',      x: 160, y: 690, w: T*1.9, h: T*0.9, z: 2 },
      { sprite: 'f_plant',     x: 560, y: 545, w: T*0.7, h: T*0.9, z: 2 },
      { sprite: 'f_painting',  x: 210, y: 55,  w: T*0.9, h: T*0.7, z: 1 },
      // Kitchen nook
      { sprite: 'f_counter',   x: 930, y: 100, w: T,     h: T*0.9, z: 2 },
      { sprite: 'f_sink',      x: 850, y: 100, w: T*0.9, h: T*0.9, z: 2 },
      { sprite: 'f_stove',     x: 770, y: 100, w: T*0.9, h: T*0.9, z: 2 },
      { sprite: 'f_fridge',    x: 690, y: 110, w: T*0.8, h: T*1.2, z: 2 },
      { sprite: 'f_chair',     x: 820, y: 420, w: T*0.7, h: T*0.8, z: 2 },
      { sprite: 'f_plant',     x: 950, y: 520, w: T*0.7, h: T*0.9, z: 2 },
      // Hallway
      //
      // Правий кінець передпокою тримається ПОРОЖНІМ, і це не смак. Тут стояла
      // шафа (900, 730) і два ящики (700/770, ~890): вони затуляли гирло
      // гаражних воріт і залишок проходу під ним, тобто гараж узагалі не мав
      // внутрішнього маршруту. Робітники ходили з гаража до квартири через
      // ВУЛИЦЮ — і виглядало це як помилка навігації, хоч навігація була права.
      // Тест на досяжність мовчав, бо шлях справді був, просто надворі.
      { sprite: 'f_bookshelf', x: 620, y: 660, w: T,     h: T*1.3, z: 2 },
      { sprite: 'f_crate',     x: 380, y: 900, w: T*0.8, h: T*0.8, z: 2 },
      { sprite: 'f_crate',     x: 300, y: 880, w: T*0.8, h: T*0.8, z: 2 },
      { sprite: 'f_chair',     x: 250, y: 690, w: T*0.7, h: T*0.8, z: 2 },
      { sprite: 'f_painting',  x: 430, y: 55,  w: T*0.9, h: T*0.7, z: 1 },
      { sprite: 'f_plant',     x: 60,  y: 120, w: T*0.7, h: T*0.9, z: 2 },
      { sprite: 'f_rug',       x: 500, y: 800, w: T*2.4, h: T*1.6, z: 0.6 },
      // Гараж: те саме житло, тільки без житла — полиці, ящики, піддони.
      ...(garage ? [
        { sprite: 'o_shelf',    x: X0 + 480, y: 70,  w: T*1.6, h: T,     z: 2 },
        { sprite: 'f_crate',    x: X0 + 810, y: 150, w: T*0.8, h: T*0.8, z: 2 },
        { sprite: 'f_crate',    x: X0 + 810, y: 240, w: T*0.8, h: T*0.8, z: 2 },
        { sprite: 'f_pallet',   x: X0 + 120, y: 620, w: T,     h: T*0.7, z: 2 },
        { sprite: 'f_pallet',   x: X0 + 120, y: 720, w: T,     h: T*0.7, z: 2 },
        { sprite: 'f_table',    x: X0 + 720, y: 640, w: T*1.7, h: T*0.9, z: 2 },
        { sprite: 'o_vending',  x: X0 + 830, y: 480, w: T*0.8, h: T*1.1, z: 2 },
        { sprite: 'f_plant',    x: X0 + 60,  y: 640, w: T*0.7, h: T*0.9, z: 2 },
        { sprite: 'f_rug',      x: X0 + 300, y: 470, w: T*2.4, h: T*1.6, z: 0.6 },
      ] : []),
    ],
    // Тверді покриття двору. Порядок у списку — порядок малювання, тож
    // під'їзд лягає поверх газону, а не навпаки.
    groundPatches: [
      { ...APRON, tile: THEME.pathTile, color: THEME.pathColor },
      { ...PATH,  tile: THEME.pathTile, color: THEME.pathColor },
      { ...PARK,  tile: THEME.parkTile, color: THEME.parkColor },
      ...(garage ? [{
        x: X0 + 450 - DRIVE_W / 2, y: YARD_Y, w: DRIVE_W, h: FENCE_Y - YARD_Y - 20,
        tile: THEME.parkTile, color: THEME.parkColor,
      }, {
        x: X0 + 610, y: 1180, w: 270, h: 320,
        tile: THEME.parkTile, color: THEME.parkColor,
      }] : []),
    ],
    street: [
      // Машина стоїть на парковці, а не «десь на асфальті»: місце під неї і є
      // те, заради чого парковка існує. Завезений арт (`car_blue`) — вид
      // строго згори, носом донизу, тому вона й розвернута до хвіртки.
      //
      // 2.18×3.6 зросту персонажа — удвічі більше за перший захід. Машина на
      // півтора персонажа завдовжки читалась як іграшка на газоні; тепер вона
      // заповнює свій майданчик, і майданчик через це читається як парковка,
      // а не як пляма асфальту.
      { sprite: 'car_blue',   x: 262, y: 1320, w: T*2.18, h: T*3.6 },

      // Сад праворуч від доріжки. Дерева стоять глибоко у дворі, а не при
      // самому будинку: крона заввишки в півтора персонажа біля стіни закриває
      // двері, і гравець не бачить, звідки вийшов.
      { sprite: 'o_tree',     x: 850, y: 1270, w: T*1.2, h: T*1.4 },
      { sprite: 'o_tree',     x: 950, y: 1430, w: T*1.2, h: T*1.4 },
      { sprite: 'o_bush',     x: 660, y: 1400, w: T*0.9, h: T*0.8 },
      { sprite: 'o_hedge',    x: 790, y: 1470, w: T*1.4, h: T*0.6 },
      { sprite: 'o_bench',    x: 690, y: 1250, w: T*1.2, h: T*0.7 },
      { sprite: 'o_bicycle',  x: 640, y: 1340, w: T,     h: T*0.7 },
      { sprite: 'o_bin',      x: 900, y: 1160, w: T*0.7, h: T*0.9 },

      // Ліворуч: ліхтар при вході, гідрант і кущі попід парканом.
      { sprite: 'o_lamppost', x: 62,  y: 1010, w: T*0.6, h: T*1.5 },
      { sprite: 'o_lamppost', x: 620, y: 1440, w: T*0.6, h: T*1.5 },
      { sprite: 'o_hydrant',  x: 70,  y: 1120, w: T*0.5, h: T*0.7 },
      { sprite: 'o_bush',     x: 150, y: 1050, w: T*0.9, h: T*0.8 },
      { sprite: 'o_bush',     x: 300, y: 1075, w: T*0.9, h: T*0.8 },

      // Хвіртка. Стулки закриті — двір замкнений, і паркан тримає це не
      // виглядом, а тим, що хвіртка теж перешкода. Отвір у прогоні пробитий
      // рівно під неї (`gap` у fenceRun), щоб ці два малюнки не наклались.
      { sprite: 'o_gate', x: frontGate.at, y: FENCE_Y, w: frontGate.size, h: T*0.55, z: 2 },
      ...(garage
        ? [{ sprite: 'o_gate', x: driveGate.at, y: FENCE_Y, w: driveGate.size, h: T*0.55, z: 2 }]
        : []),

      // Паркан по периметру ділянки.
      ...fenceRun({ axis: 'h', at: FENCE_Y, from: 0, to: worldW, gaps: [frontGate, ...(garage ? [driveGate] : [])] }),
      // Бічні прогони доходять до нижнього — кут закритий з обох боків.
      //
      // Тримається це на тому, що межа світу спиняє персонажа за ЦЕНТР
      // (`bounds` у moveSystem), тобто півтулуба дістає до краю хай там що
      // намальовано, і в кутку персонаж стоїть одразу в двох перешкодах. Доки
      // розв'язувач зіткнень міг виштовхнути з коробки на її протилежний край,
      // це означало телепорт у протилежний кут світу — див. `moveAxis`.
      ...fenceRun({ axis: 'v', at: FENCE_INSET,          from: YARD_Y, to: FENCE_Y - T * 0.3 }),
      ...fenceRun({ axis: 'v', at: worldW - FENCE_INSET, from: YARD_Y, to: FENCE_Y - T * 0.3 }),

      // Двір гаража.
      ...(garage ? [
        { sprite: 'car_blue',   x: X0 + 745, y: 1320, w: T*2.18, h: T*3.6 },
        { sprite: 'o_lamppost', x: X0 + 830, y: 1010, w: T*0.6,  h: T*1.5 },
        { sprite: 'o_bush',     x: X0 + 120, y: 1300, w: T*0.9,  h: T*0.8 },
        { sprite: 'o_hedge',    x: X0 + 250, y: 1430, w: T*1.4,  h: T*0.6 },
        { sprite: 'o_tree',     x: X0 + 130, y: 1120, w: T*1.2,  h: T*1.4 },
      ] : []),
    ],
    // Коробки приїжджають на майданчик перед дверима — у ряд, праворуч від
    // виходу. Раніше вони лежали посеред проїжджої частини; тепер під ними є
    // покриття, і видно, ЧОМУ вони саме тут.
    deliverySlots: [
      { x: 640, y: 1046 },
      { x: 760, y: 1046 },
      { x: 880, y: 1046 },
    ],
    spawns: {
      player:     { x: 500, y: 780 },
      workerIdle: { x: 560, y: 800 },
      // Somebody lives here, and so does a cat (V5). Only the flat has one.
      cat:        { x: 330, y: 470 },
      // Кожна роль має свій пост (S1.5). Поки гаража нема — наймати нікого, але
      // форма даних лишається однаковою, щоб локація ніколи не була винятком.
      // Продавець стоїть біля ВЕРСТАКІВ, а не біля скриньки (П4). Його
      // маршрут — «вихід верстака → скринька»; чекаючи в кінці цього маршруту,
      // він половину гри проводив там, де на нього ніхто не дивиться, і цех
      // виглядав так, ніби в ньому нікого немає. Тепер він гуляє там, де
      // робота починається.
      posts: garage
        ? {
            courier: { x: X0 + 450, y: 800 },   // біля воріт, звідки носять коробки
            tech:    { x: X0 + 300, y: 440 },   // при верстаку
            seller:  { x: X0 + 140, y: 480 },   // збоку від верстака, на шляху до дверей
            manager: { x: 820,      y: 430 },
          }
        : {
            courier: { x: 480, y: 800 },
            tech:    { x: 300, y: 430 },
            seller:  { x: 470, y: 520 },
            manager: { x: 820, y: 430 },
          },
    },
    theme: THEME,
  })
}
