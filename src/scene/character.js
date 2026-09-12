import * as ex from 'excalibur'
import { frameMs } from './frame.js'

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

// ── Рig для згенерованих ШІ аркушів (Стадія 16) ──────────────────────────────
//
// Третій риг, а не заміна двох попередніх: аркуші приходять ззовні, і поки не
// доведено, що вони тримають стиль гри, старий арт лишається на місці під
// перемикачем CHARACTER_ART.
//
// Відмінність від обох попередніх — напрямок. Аркуші дають вид ЗЗАДУ (йде
// вгору) і вид СПЕРЕДУ (йде вниз), тому риг читає вертикальну швидкість, а не
// лише `facing`. Виду збоку немає навмисно: горизонтальний хід грає передній
// цикл із віддзеркаленням — на розмірі персонажа в цій грі різниці не видно,
// а це два аркуші замість трьох.
//
// Кадр тут НЕ квадратний (персонаж вищий, ніж ширший), тому спрайт
// вписується по ВИСОТІ актора, а ширина виводиться з пропорції кадру. Розтягти
// його на квадратний бокс актора означало б розплющити людину.
export function createSheetCharacter(actor, sheets, { rows, cols, frames, frameMsWalk, frameMsIdle }) {
  const front = sheets.down ?? sheets.idle
  if (!front) return { setMoving: () => {} }

  const build = (image, durationMs) => {
    if (!image) return null
    const fw = Math.floor(image.width / cols)
    const fh = Math.floor(image.height / rows)
    const sheet = ex.SpriteSheet.fromImageSource({
      image,
      grid: { rows, columns: cols, spriteWidth: fw, spriteHeight: fh },
    })
    const count = Math.min(frames, rows * cols)
    const anim = ex.Animation.fromSpriteSheet(sheet, [...Array(count).keys()], durationMs)
    const sy = actor.height / fh
    anim.scale = ex.vec(sy, sy)   // однаковий множник по обох осях = пропорція кадру збережена
    return anim
  }

  const idle = build(sheets.idle, frameMsIdle) ?? build(front, frameMsIdle)
  const down = build(sheets.down, frameMsWalk) ?? idle
  const up   = build(sheets.up,   frameMsWalk) ?? down

  actor.graphics.add('idle', idle)
  actor.graphics.add('down', down)
  actor.graphics.add('up',   up)
  actor.graphics.use('idle')

  return {
    // vy > 0 — вниз по екрану (до глядача), vy < 0 — вгору (від глядача).
    // Поріг у частках швидкості: чистий горизонтальний хід не має
    // перемикати на вид ззаду через дрібне розштовхування в натовпі.
    setMoving(moving, facingRight = true, vy = 0, vx = 0) {
      if (!moving) { actor.graphics.use('idle'); actor.graphics.flipHorizontal = false; return }
      const vertical = Math.abs(vy) > Math.abs(vx)
      const key = vertical && vy < 0 ? 'up' : 'down'
      actor.graphics.use(key)
      actor.graphics.flipHorizontal = !vertical && !facingRight
    },
  }
}
