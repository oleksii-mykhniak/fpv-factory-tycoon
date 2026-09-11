import { FLOAT_GAIN_MS, FLOAT_GAIN_RISE } from '../state/config.js'

// Поза напису «+$47» у конкретний момент його життя (Стадія 10 / D3).
//
// Чиста функція, а не тіло обробника кадру, з двох причин. Перша — її видно
// тестам: анімація на сцені інакше перевіряється тільки очима на телефоні.
// Друга — та, через яку цей файл узагалі з'явився: код у замиканні над
// об'єктом-станом rollup вирізав зі збірки (див. `scene.js` і `bundle.test.js`).
//
// `t` — частка прожитого життя, 0…1.
export function floatPose(age) {
  if (!(age >= 0)) return { done: true, t: 1, rise: FLOAT_GAIN_RISE, opacity: 0 }
  if (age >= FLOAT_GAIN_MS) return { done: true, t: 1, rise: FLOAT_GAIN_RISE, opacity: 0 }
  const t = age / FLOAT_GAIN_MS
  return {
    done: false,
    t,
    // Підйом сповільнюється (1-(1-t)²), знос убік — рівномірний: гроші
    // спурхують і зависають, а не їдуть угору з постійною швидкістю.
    rise: FLOAT_GAIN_RISE * (1 - (1 - t) * (1 - t)),
    // Повний тон більшу частину життя, згасання — в останній третині.
    opacity: t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35,
  }
}
