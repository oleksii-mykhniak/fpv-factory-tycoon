// Background music, synthesised live (A6).
//
// Deliberately NOT a file. A loop long enough not to bore you is thirty seconds
// or more, which is over a megabyte of WAV shipped to a phone — and it still
// has a seam where it wraps. Web Audio builds it as it goes: nothing to
// download, no loop point, and the pattern can drift so the same eight bars are
// never quite the same twice.
//
// Same principle as the sprites and the sound effects: one palette (three
// voices), one envelope, one loudness. The music must sit UNDER the effects —
// it is the room, not the game.

import { CHORDS, MUSIC_BPM, MUSIC_GAIN, MUSIC_ROOT } from '../state/config.js'

let ctx = null
let master = null
let timer = null
let step = 0
let enabled = false
let started = false

const beatMs = () => (60 / MUSIC_BPM) * 1000

// A soft voice with a long tail. Every note in the piece is one of these.
function voice(freq, when, dur, gain, type = 'sine') {
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, when)

  // One envelope shape, as everywhere else: quick in, slow out.
  env.gain.setValueAtTime(0, when)
  env.gain.linearRampToValueAtTime(gain, when + 0.08)
  env.gain.exponentialRampToValueAtTime(0.0001, when + dur)

  osc.connect(env).connect(master)
  osc.start(when)
  osc.stop(when + dur + 0.05)
}

const semitone = (n) => MUSIC_ROOT * Math.pow(2, n / 12)

// One bar: a held chord, a bass note under it, and a single melody note that
// moves between bars. Sparse on purpose — a busy loop under a game that already
// clicks and buzzes is noise.
function bar(when) {
  const chord = CHORDS[step % CHORDS.length]
  const beat  = beatMs() / 1000

  // Pad: the chord, quiet and long.
  for (const n of chord) voice(semitone(n), when, beat * 3.6, MUSIC_GAIN * 0.30, 'sine')
  // Bass: the root, an octave down.
  voice(semitone(chord[0] - 12), when, beat * 1.8, MUSIC_GAIN * 0.55, 'triangle')

  // Melody: one note from the chord, picked by the step so the phrase moves
  // rather than repeats. Skipped every fourth bar, which is what makes the
  // loop breathe.
  if (step % 4 !== 3) {
    const pick = chord[(step * 2 + 1) % chord.length] + 12
    voice(semitone(pick), when + beat * 1.0, beat * 1.4, MUSIC_GAIN * 0.22, 'triangle')
  }

  step++
}

function tick() {
  if (!enabled || !ctx) return
  // Schedule slightly ahead: setInterval is not accurate enough to place notes,
  // but it is accurate enough to decide WHEN to ask the audio clock to.
  bar(ctx.currentTime + 0.05)
}

export function setMusicEnabled(on) {
  enabled = Boolean(on)
  if (!enabled) {
    stop()
    return
  }
  if (started) start()
}

// Called from the first gesture, like the sound effects: an AudioContext
// created before one is created suspended, and stays that way.
export function startMusic() {
  started = true
  if (!enabled) return
  start()
}

function start() {
  if (timer) return
  try {
    ctx = ctx ?? new (window.AudioContext ?? window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    if (!master) {
      master = ctx.createGain()
      master.gain.value = 1
      master.connect(ctx.destination)
    }
    bar(ctx.currentTime + 0.1)
    timer = setInterval(tick, beatMs() * 4)
  } catch {
    // No Web Audio: the game is exactly as playable without it.
  }
}

function stop() {
  if (timer) { clearInterval(timer); timer = null }
  // Let whatever is already scheduled ring out rather than cutting it dead.
  if (master && ctx) {
    try {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.3)
      setTimeout(() => { if (master) master.gain.value = 1 }, 1500)
    } catch {}
  }
}
