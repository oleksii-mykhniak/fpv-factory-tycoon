import * as ex from 'excalibur'

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
export function createCharacterSprite(actor, imageSource) {
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
