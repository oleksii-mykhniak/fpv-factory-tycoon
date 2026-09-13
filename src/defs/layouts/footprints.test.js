// Слід предмета — не його картинка.
//
// Тест сторожить дві речі, і вони різні. Перша — форма самої таблиці: слід
// мусить лежати НА ЗЕМЛІ, тобто впритул до низу спрайта й усередині нього.
// Друга, і важливіша, — щоб нікого не забули: спрайт, якого немає в таблиці,
// мовчки стає прохідним, і це видно тільки тому, хто спробує пройти крізь нього.

import { describe, it, expect } from 'vitest'
import { FOOTPRINTS, footprintOf } from './footprints.js'
import { rect } from './buildLayout.js'
import { buildApartmentLayout } from './apartment.js'
import { buildFactoryLayout } from './factory.js'
import { FACTORY_HALL_IDS } from './factory.js'

// Крізь ЩО ходять навмисно. Список існує рівно для того, щоб рішення «крізь це
// можна пройти» доводилось приймати вголос: новий спрайт у розкладці не має
// шансу стати прохідним просто тому, що про нього забули.
const WALK_THROUGH = new Set([
  'f_rug',        // килим лежить на підлозі
  'f_painting',   // картина висить на стіні
  'f_plant',      // вазон — його обходять, але не мусять
  'f_chair',      // стілець відсовують
  'floor_mark',       // розмітка цеху
  'o_garage_door',    // намальована на стіні; сама стіна вже суцільна
  'wall_window',      // вікно у фасаді; перешкода — сама стіна під ним
])

const layouts = () => [
  ['apartment', buildApartmentLayout(['flat'])],
  ['apartment+garage', buildApartmentLayout(['flat', 'garage'])],
  ['factory', buildFactoryLayout(FACTORY_HALL_IDS)],
]

describe('слід предмета', () => {
  it('частки в межах (0, 1]', () => {
    for (const [sprite, spec] of Object.entries(FOOTPRINTS)) {
      expect(spec.w, `${sprite}.w`).toBeGreaterThan(0)
      expect(spec.w, `${sprite}.w`).toBeLessThanOrEqual(1)
      expect(spec.h, `${sprite}.h`).toBeGreaterThan(0)
      expect(spec.h, `${sprite}.h`).toBeLessThanOrEqual(1)
    }
  })

  it('стоїть на землі: низ сліду збігається з низом спрайта', () => {
    const box = rect(500, 300, 100, 200)
    for (const sprite of Object.keys(FOOTPRINTS)) {
      const foot = footprintOf(sprite, box)
      expect(foot.y + foot.h, sprite).toBeCloseTo(box.y + box.h)
      expect(foot.cx, sprite).toBeCloseTo(box.cx)
      // І не вилазить за картинку — інакше предмет спиняв би там, де його нема.
      expect(foot.x, sprite).toBeGreaterThanOrEqual(box.x - 1e-9)
      expect(foot.x + foot.w, sprite).toBeLessThanOrEqual(box.x + box.w + 1e-9)
    }
  })

  it('крізь те, чого в таблиці немає, ходять', () => {
    expect(footprintOf('f_rug', rect(0, 0, 10, 10))).toBeNull()
    expect(footprintOf('немає-такого', rect(0, 0, 10, 10))).toBeNull()
  })

  // Головне, заради чого сліди й робились: за високий предмет можна ЗАЙТИ.
  // Дерево — крайній випадок: на землі стоїть стовбур, решта висить над
  // головою. Доки перешкодою був увесь спрайт, дерево перегороджувало смугу
  // двору, у якій нема нічого, крім повітря.
  it('високий предмет займає лише свій низ', () => {
    const box = rect(500, 300, 100, 200)
    for (const sprite of ['o_tree', 'o_lamppost']) {
      const foot = footprintOf(sprite, box)
      expect(foot.h / box.h, sprite).toBeLessThan(0.25)
      expect(foot.w / box.w, sprite).toBeLessThan(0.4)
    }
  })

  it('паркан — навпаки, увесь: за межу ділянки заходити нема куди', () => {
    const box = rect(500, 300, 100, 200)
    for (const sprite of ['o_fence_h', 'o_fence_v', 'o_gate']) {
      const foot = footprintOf(sprite, box)
      expect(foot.w, sprite).toBeCloseTo(box.w)
      expect(foot.h, sprite).toBeCloseTo(box.h)
    }
  })
})

describe('таблиця слідів покриває розкладки', () => {
  it('кожен декор або має слід, або названий прохідним', () => {
    const unknown = new Set()
    for (const [, layout] of layouts()) {
      for (const d of layout.decor) {
        if (FOOTPRINTS[d.sprite] || WALK_THROUGH.has(d.sprite)) continue
        unknown.add(d.sprite)
      }
    }
    expect([...unknown],
      'новий спрайт у розкладці: додай слід у footprints.js або назви прохідним у цьому тесті',
    ).toEqual([])
  })

  it('перешкодою в світі стає слід, а не спрайт', () => {
    for (const [name, layout] of layouts()) {
      for (const d of layout.decor) {
        if (!d.foot) continue
        expect(layout.obstacles, `${name}: ${d.sprite} не потрапив у перешкоди`)
          .toContain(d.foot)

        // І прямокутник САМОГО СПРАЙТА туди не потрапив — інакше предмет
        // спиняв би на всю свою висоту, тобто сліди не робили б нічого.
        if (d.foot.h === d.h) continue     // паркан: слід і є вся картинка
        const wholePicture = layout.obstacles.some(o =>
          o.cx === d.cx && o.cy === d.cy && o.w === d.w && o.h === d.h)
        expect(wholePicture, `${name}: ${d.sprite} — у перешкодах уся картинка`).toBe(false)
      }
    }
  })
})
