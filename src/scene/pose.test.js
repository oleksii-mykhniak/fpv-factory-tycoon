import { describe, it, expect } from 'vitest'
import { pickPose, carryPlacement } from './pose.js'
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
