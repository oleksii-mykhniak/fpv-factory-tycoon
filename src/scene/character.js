import * as ex from 'excalibur'
import { frameMs } from './frame.js'
import { pickPose } from './pose.js'

// Shared walk-cycle rig for every humanoid in the scene.
//
// Both the player (C1) and the worker puppet use the same 4-frame sheet layout,
// differing only in palette. Keeping the rig in one place means C5's hired
// workers get animation for free — they just pass a different sprite key.

const FRAME_W = 64
const FRAME_H = 64

// Attaches 'walk' and 'idle' graphics to an actor from a 4-frame sheet.
// Returns a setter for the animation state; no-ops safely when the sprite is
// missing (loader.js resolves absent files to null on purpose).
// Kenney characters are four separate tiles — front, front-step, back, side —
// not a walk-cycle strip. There is no animation to play, so movement is read
// from a bob: the sprite lifts and drops as they walk. It costs one sine and
// says "walking" as clearly as swapping legs does at this size.
//
// Kept beside the old rig rather than replacing it: the generated sheets are
// still in the repo and still work (V4 switch to Kenney art).
export function createTileCharacter(actor, frontImage, sideImage) {
  if (!frontImage) return { setMoving: () => {} }

  const front = frontImage.toSprite()
  const side  = sideImage ? sideImage.toSprite() : front
  for (const s of [front, side]) {
    s.width  = actor.width
    s.height = actor.height
  }

  actor.graphics.use(front)
  let moving = false
  let facingRight = true
  let phase = 0
  const baseAnchor = actor.anchor.y

  actor.on('preupdate', (evt) => {
    if (moving) {
      phase += frameMs(evt) / 90
      // Lift by a fraction of the sprite's own height, so it scales with zoom.
      actor.graphics.offset = ex.vec(0, -Math.abs(Math.sin(phase)) * actor.height * 0.10)
    } else {
      phase = 0
      actor.graphics.offset = ex.vec(0, 0)
    }
  })

  return {
    setMoving(isMoving, right) {
      if (isMoving !== moving) {
        moving = isMoving
        actor.graphics.use(moving ? side : front)
      }
      if (right !== undefined && right !== facingRight) {
        facingRight = right
      }
      actor.graphics.flipHorizontal = moving && !facingRight
      actor.anchor.y = baseAnchor
    },
  }
}

export function createCharacterSprite(actor, imageSource, tintHex = null) {
  if (!imageSource) return { setMoving: () => {} }

  const sheet = ex.SpriteSheet.fromImageSource({
    image: imageSource,
    grid: { rows: 1, columns: 4, spriteWidth: FRAME_W, spriteHeight: FRAME_H },
  })
  const sx = actor.width / FRAME_W
  const sy = actor.height / FRAME_H

  const walk = ex.Animation.fromSpriteSheet(sheet, [0, 1, 2, 3], 120)
  walk.scale = ex.vec(sx, sy)
  const idle = ex.Animation.fromSpriteSheet(sheet, [0], 1000)
  idle.scale = ex.vec(sx, sy)

  // Livery (S1.4): one sheet, one palette per role. Tinting the frames is what
  // lets a courier and a technician be told apart across the room without
  // drawing (and shipping) a sprite sheet per role.
  if (tintHex) {
    const tint = ex.Color.fromHex(tintHex)
    for (const anim of [walk, idle]) {
      for (const frame of anim.frames) {
        if (frame.graphic instanceof ex.Sprite) frame.graphic.tint = tint
      }
    }
  }

  actor.graphics.add('walk', walk)
  actor.graphics.add('idle', idle)
  actor.graphics.use('idle')

  return {
    setMoving(moving, facingRight = true) {
      actor.graphics.flipHorizontal = facingRight
      actor.graphics.use(moving ? 'walk' : 'idle')
    },
  }
}

// ── Риг для згенерованих ШІ аркушів (Стадія 16) ──────────────────────────────
//
// Третій риг, а не заміна двох попередніх: аркуші приходять ззовні, і поки не
// доведено, що вони тримають стиль гри, старий арт лишається на місці під
// перемикачем CHARACTER_ART.
//
// Відмінність від обох попередніх — напрямок. Арт дає вид ззаду, спереду і
// збоку, тому риг читає ОБИДВІ складові швидкості: більша за модулем і вирішує,
// вертикальний це хід чи горизонтальний. Одного `facing` мало — він каже лише
// «ліворуч чи праворуч» і мовчить про те, що персонаж іде вгору.
//
// Бічний аркуш один: протилежний бік — те саме віддзеркалене.
//
// Кадр тут НЕ квадратний (персонаж вищий, ніж ширший), тому спрайт вписується
// по ВИСОТІ актора, а ширина виводиться з пропорції кадру. Розтягти його на
// квадратний бокс актора означало б розплющити людину.
//
// Айдлів два — спереду й ззаду. Персонаж, що спинився дорогою вгору, стоїть
// спиною: розворот до глядача на кожній зупинці — це рух, якого гравець не
// наказував, і він щоразу перебиває напрямок, у якому гравець щойно йшов.
//
// `sheets` — { idle, idleUp, down, up, side, upCarry }, кожен:
// { image, frames, frameMs }.
export function createSheetCharacter(actor, sheets, { sideFacesRight = false } = {}) {
  const build = (entry) => {
    if (!entry?.image) return null
    const image = entry.image
    // Аркуш — один рядок, тому ширина кадру виводиться з файлу. Жодного
    // числа про сітку в грі немає: розійтися з файлом просто нічому.
    const fw = Math.floor(image.width / entry.frames)
    const fh = image.height
    const sheet = ex.SpriteSheet.fromImageSource({
      image,
      grid: { rows: 1, columns: entry.frames, spriteWidth: fw, spriteHeight: fh },
    })
    const anim = ex.Animation.fromSpriteSheet(sheet, [...Array(entry.frames).keys()], entry.frameMs)
    const k = actor.height / fh
    anim.scale = ex.vec(k, k)   // однаковий множник по обох осях = пропорція кадру збережена
    return anim
  }

  const idle   = build(sheets.idle)
  const down   = build(sheets.down)   ?? idle
  const up     = build(sheets.up)     ?? down
  const side   = build(sheets.side)   ?? down
  const idleUp  = build(sheets.idleUp)  ?? up
  const upCarry = build(sheets.upCarry) ?? up
  if (!down) return { setMoving: () => {} }

  actor.graphics.add('idle',   idle ?? down)
  actor.graphics.add('idleUp', idleUp ?? idle ?? down)
  actor.graphics.add('down',   down)
  actor.graphics.add('up',     up)
  actor.graphics.add('side',    side)
  actor.graphics.add('upCarry', upCarry)
  actor.graphics.use('idle')

  // Чи є бічний аркуш ОКРЕМИМ артом. Коли його немає, бік грає передній цикл, і
  // дзеркалити його за напрямком не можна: персонаж дивиться в кадр, і
  // віддзеркалений фас — це просто фас із проділом на інший бік.
  const hasSide = Boolean(sheets.side?.image)
  // Без окремого аркуша спиною стояти спиною нема в чому: підстановка `up`
  // крутила б крок на місці, і це гірше за розворот.
  const hasIdleUp = Boolean(sheets.idleUp?.image)
  const hasUpCarry = Boolean(sheets.upCarry?.image)

  // Куди персонаж дивився, коли востаннє рухався. Напрямок доводиться пам'ятати
  // саме тут: у мить зупинки швидкість уже нульова й сама по собі не каже
  // нічого про те, куди людина щойно йшла.
  let facedAway = false

  return {
    // Саме рішення — у pose.js: воно чисте й тому перевірене тестами, тут
    // лишається тільки те, заради чого потрібен excalibur.
    setMoving(moving, facingRight = true, vy = 0, vx = 0, carrying = false) {
      const pose = pickPose({
        moving, vx, vy, facingRight, facedAway, carrying,
        hasSide, hasIdleUp, hasUpCarry, sideFacesRight,
      })
      facedAway = pose.facedAway
      actor.graphics.use(pose.name)
      actor.graphics.flipHorizontal = pose.flip
      // Сцені треба знати, чи предмет зараз у руках, чи над головою: місце
      // предмета визначає поза, а не навпаки.
      return pose.name
    },
  }
}
