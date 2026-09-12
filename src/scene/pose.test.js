import { describe, it, expect } from 'vitest'
import { pickPose } from './pose.js'

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
