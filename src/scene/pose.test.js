import { describe, it, expect } from 'vitest'
import { pickPose, carryPlacement, catPose, CAT_STILL_POSES } from './pose.js'
import { CAT_SHEETS, CAT_WALK_MOODS, CAT_MOODS, CAT_MOOD_MS,
         CAT_SIDE_FACES_RIGHT, CAT_STILL_SPEED } from '../state/config.js'
import { carrySpriteKey } from '../defs/interactions.js'

// Риг із ШІ-аркушів: що показуємо і куди дивимось.
const full = { hasSide: true, hasIdleUp: true, hasUpCarry: true, sideFacesRight: false }
const walk = (o) => pickPose({ moving: true, ...full, ...o })
const stop = (facedAway) => pickPose({ moving: false, facedAway, ...full })

describe('pickPose — напрямок ходи', () => {
  it('вниз по екрану — вид спереду', () => {
    expect(walk({ vy: 40 }).name).toBe('down')
  })

  it('вгору по екрану — вид ззаду', () => {
    expect(walk({ vy: -40 }).name).toBe('up')
  })

  it('горизонталь — бічний аркуш', () => {
    expect(walk({ vx: 40 }).name).toBe('side')
  })

  it('дрібне вертикальне розштовхування не перемикає на вид ззаду', () => {
    expect(walk({ vx: 40, vy: -3 }).name).toBe('side')
  })

  it('без бічного аркуша бік грає передній цикл і НЕ дзеркалиться', () => {
    const p = pickPose({ moving: true, vx: 40, facingRight: true, hasSide: false })
    expect(p.name).toBe('down')
    expect(p.flip).toBe(false)
  })

  it('бік дзеркалиться лише в протилежний бік від намальованого', () => {
    expect(walk({ vx: 40, facingRight: true }).flip).toBe(true)    // арт іде ліворуч
    expect(walk({ vx: -40, facingRight: false }).flip).toBe(false)
  })
})

describe('pickPose — зупинка', () => {
  it('стоячи після ходи вниз — обличчям', () => {
    expect(stop(walk({ vy: 40 }).facedAway).name).toBe('idle')
  })

  it('стоячи після ходи вгору — спиною, без розвороту до глядача', () => {
    expect(walk({ vy: -40 }).facedAway).toBe(true)
    expect(stop(true).name).toBe('idleUp')
  })

  it('після бічної ходи стоїмо обличчям, а не спиною', () => {
    expect(walk({ vx: 40 }).facedAway).toBe(false)
    expect(stop(false).name).toBe('idle')
  })

  it('без аркуша спиною зупинка повертає до переднього айдлу', () => {
    expect(pickPose({ moving: false, facedAway: true, hasIdleUp: false }).name).toBe('idle')
  })

  it('стоячи ніколи не дзеркалимо — інакше проділ стрибав би на зупинці', () => {
    expect(stop(true).flip).toBe(false)
    expect(stop(false).flip).toBe(false)
  })
})

describe('pickPose — предмет у руках', () => {
  it('несучи вгору — поза з руками вперед', () => {
    expect(walk({ vy: -40, carrying: true }).name).toBe('upCarry')
  })

  it('несучи вниз — звичайний передній цикл, предмет лишається над головою', () => {
    expect(walk({ vy: 40, carrying: true }).name).toBe('down')
  })

  it('несучи вбік — звичайний бічний цикл', () => {
    expect(walk({ vx: 40, carrying: true }).name).toBe('side')
  })

  it('вгору з порожніми руками — звичайний вид ззаду', () => {
    expect(walk({ vy: -40, carrying: false }).name).toBe('up')
  })

  it('без аркуша нести-пози вгору з вантажем грає звичайний вид ззаду', () => {
    const p = pickPose({ moving: true, vy: -40, carrying: true, hasUpCarry: false })
    expect(p.name).toBe('up')
  })

  it('спинившись із вантажем, стоїмо спиною — нести-поза не для стояння', () => {
    const w = walk({ vy: -40, carrying: true })
    expect(w.facedAway).toBe(true)
    expect(stop(true).name).toBe('idleUp')
  })
})

// Який РАКУРС коробки показати — частина того самого рішення, що й поза: арт
// завезено з трьох боків (див. scripts/imported-art.js), і вибирає між ними
// поза того, хто несе. Тест тут, а не поруч із interactions.js, бо перевіряє
// саме зв'язку «поза → картинка», а не правила взаємодії.
describe('ракурс коробки в руках', () => {
  const kit = { type: 'kit_box' }

  it('бічна хода — три чверті: фас у профіль не влучає', () => {
    expect(carrySpriteKey(kit, 'side')).toBe('delivery_box_45')
  })

  it.each(['idle', 'idleUp', 'down', 'up', 'upCarry'])('%s — фас', (pose) => {
    expect(carrySpriteKey(kit, pose)).toBe('delivery_box')
  })

  it('без пози (риг найманого робітника) — фас, а не порожнеча', () => {
    expect(carrySpriteKey(kit)).toBe('delivery_box')
  })

  it('дрон ракурсів не має — поза його не чіпає', () => {
    const drone = { type: 'drone', kitId: 'mini_drone' }
    expect(carrySpriteKey(drone, 'side')).toBe(carrySpriteKey(drone, 'down'))
  })
})

// Розміщення ноші. Перевіряємо не координати (їх дає сцена), а рішення: на
// поясі чи над головою, ближче до камери чи далі, зсунуте по ходу чи ні.
describe('куди кладемо ношу', () => {
  it('у кожній позі — в руки, а не над головою', () => {
    for (const p of ['idle', 'idleUp', 'down', 'up', 'side', 'upCarry'])
      expect(carryPlacement(p).inHands, p).toBe(true)
  })

  it('без пози (риг найманих робітників) — над головою', () => {
    // Там чотири кадри без натяку на напрямок: класти в руки нема куди.
    expect(carryPlacement(null).inHands).toBe(false)
    expect(carryPlacement(undefined).inHands).toBe(false)
  })

  it.each(['up', 'upCarry', 'idleUp'])('%s — ноша ЗА фігурою', (p) => {
    expect(carryPlacement(p).behind).toBe(true)
  })

  it.each(['idle', 'down', 'side'])('%s — ноша ПЕРЕД фігурою', (p) => {
    expect(carryPlacement(p).behind).toBe(false)
  })

  it('зсув по ходу — лише в профіль', () => {
    expect(carryPlacement('side').sideways).toBe(true)
    for (const p of ['idle', 'idleUp', 'down', 'up', 'upCarry'])
      expect(carryPlacement(p).sideways, p).toBe(false)
  })

  it('над головою ноша не буває ні за фігурою, ні зсунутою', () => {
    // Інакше сцена зсувала б те, що ні з чим не перетинається.
    expect(carryPlacement(null)).toEqual({
      inHands: false, behind: false, sideways: false,
    })
  })
})

// Кіт. Вхід у нього інший, ніж у людини: напрямок задає не гравець, а настрій
// плюс швидкість, яку цей настрій породив.
describe('кіт — яку позу показати', () => {
  const cp = (o) => catPose({
    walkMoods: CAT_WALK_MOODS, sideFacesRight: CAT_SIDE_FACES_RIGHT,
    stillSpeed: CAT_STILL_SPEED, ...o,
  })

  it('спить — окремий аркуш, а не сидить із заплющеними очима', () => {
    expect(cp({ mood: 'sleep' }).name).toBe('sleep')
  })

  it('усе нерухоме, крім сну, — сидить', () => {
    expect(cp({ mood: 'sit' }).name).toBe('sit')
  })

  it('нерухомий кіт не дзеркалиться — хоч би куди він щойно біг', () => {
    // Через це сплячий кіт раніше перевертався: риг брав останню швидкість.
    expect(cp({ mood: 'sleep', vx: 900 }).flip).toBe(false)
    expect(cp({ mood: 'sit', vx: 900 }).flip).toBe(false)
  })

  it('іде вниз, угору й убік — за швидкістю, а не за настроєм', () => {
    expect(cp({ mood: 'stroll', vy: 50 }).name).toBe('down')
    expect(cp({ mood: 'stroll', vy: -50 }).name).toBe('up')
    expect(cp({ mood: 'stroll', vx: 50 }).name).toBe('side')
  })

  it('усі три настрої ходьби беруть ті самі аркуші', () => {
    for (const mood of CAT_WALK_MOODS)
      expect(cp({ mood, vy: 50 }).name, mood).toBe('down')
  })

  it('бічний аркуш дзеркалиться лише праворуч — намальований ліворуч', () => {
    expect(cp({ mood: 'run', vx: 50 }).flip).toBe(true)
    expect(cp({ mood: 'run', vx: -50 }).flip).toBe(false)
  })

  it('чистий горизонтальний хід не зривається у вид ззаду через дрібний зсув', () => {
    expect(cp({ mood: 'stroll', vx: 80, vy: -3 }).name).toBe('side')
  })

  it('настрій каже йти, а швидкості немає — хід до глядача, не боком', () => {
    // Нульова швидкість не каже про напрямок нічого, і |vy| > |vx| дає false:
    // без цієї гілки кіт буксував би боком, стоячи на місці.
    expect(cp({ mood: 'stroll', vx: 0, vy: 0 }).name).toBe('down')
    expect(cp({ mood: 'stroll', vx: 1, vy: 1 }).name).toBe('down')
  })

  it('кожна поза, яку може повернути catPose, має свій аркуш', () => {
    // Те, через що кіт зник би в одному з напрямків: `anim[name]` — undefined.
    const poses = new Set([...CAT_STILL_POSES])
    for (const mood of CAT_WALK_MOODS)
      for (const v of [{ vy: 50 }, { vy: -50 }, { vx: 50 }])
        poses.add(cp({ mood, ...v }).name)
    for (const name of poses) expect(CAT_SHEETS[name], name).toBeDefined()
  })

  it('кожен НЕходячий настрій названий так само, як його аркуш', () => {
    // Саме за це вилетів `groom`: настрій був, кадру під нього не стало.
    //
    // Перевірка навмисне НЕ через `catPose`: невідомий настрій він чемно
    // зводить до сидіння, тож «показатись уміє» будь-що, і тест, побудований
    // на його відповіді, пропустив би вмивання назад не помітивши. Питання
    // тут інше й строгіше: чи є в кота аркуш, який ЦЕЙ настрій називає.
    const moods = new Set([
      ...Object.keys(CAT_MOODS), ...Object.keys(CAT_MOOD_MS),
      ...Object.values(CAT_MOODS).flatMap(row => Object.keys(row)),
    ])
    const still = [...moods].filter(m => !CAT_WALK_MOODS.includes(m))
    expect(still.sort()).toEqual([...CAT_STILL_POSES].sort())
    for (const mood of still) expect(CAT_SHEETS[mood], mood).toBeDefined()
  })

  it('а настрій ходьби показується котом, що йде', () => {
    // Дзеркальна половина: ходячі настрої не мають аркуша ВЛАСНОГО імені
    // (`stroll.png` не існує), і не повинні — їх показує напрямок.
    for (const mood of CAT_WALK_MOODS) {
      expect(CAT_SHEETS[mood], mood).toBeUndefined()
      expect(CAT_STILL_POSES).not.toContain(cp({ mood, vy: 50 }).name)
    }
  })
})

// Напрямок стрілки цілі. Тест не про графіку, а про ЗНАК: стрілка з
// переставленим знаком показує рівно в протилежний бік, і на екрані це
// однаково схоже на робочу стрілку — поки не піти за нею.
describe('стрілка цілі показує на ціль', () => {
  // Те саме, що робить syncArrow. Дублюється сюди свідомо: сама функція сидить
  // у sceneSync поруч із excalibur, а перевіряти треба одну формулу.
  const aim = (dx, dy) => Math.atan2(dy, dx) + Math.PI / 2

  // Куди дивиться вістря після повороту. Арт намальований угору, тобто (0,-1);
  // поворот у excalibur — за годинниковою, бо вісь Y дивиться вниз.
  const tip = (rot) => ({
    x: Math.sin(rot),
    y: -Math.cos(rot),
  })

  it.each([
    ['праворуч', 1, 0],
    ['ліворуч', -1, 0],
    ['униз', 0, 1],
    ['угору', 0, -1],
    ['по діагоналі', 0.6, 0.8],
  ])('ціль %s — вістря туди ж', (_name, dx, dy) => {
    const t = tip(aim(dx, dy))
    expect(t.x).toBeCloseTo(dx, 5)
    expect(t.y).toBeCloseTo(dy, 5)
  })

  it('переставлений знак дає стрілку, що показує НАЗАД', () => {
    // Страхувальний тест: він падає, якщо хтось «виправить» π/2 на -π/2,
    // побачивши стару приписку «points down».
    const wrong = (dx, dy) => Math.atan2(dy, dx) - Math.PI / 2
    const t = tip(wrong(1, 0))
    expect(t.x).toBeCloseTo(-1, 5)
  })
})
