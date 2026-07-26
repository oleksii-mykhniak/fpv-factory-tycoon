// Generates every sound effect in the game.
// Run: node scripts/gen-sounds.js
//
// Same reasoning as the sprite generator, and the same three rules. A downloaded
// sample pack brings someone else's timbre, someone else's loudness and someone
// else's room; two samples from different packs sound worse together than two
// synthesised ones. And a WAV is a 44-byte header followed by 16-bit samples, so
// there is nothing to install.
//
//   one timbre palette — every sound is built from the four voices below
//   one envelope       — env() shapes all of them, so attacks feel related
//   one loudness       — normalise() at generation time, not `volume` at runtime
//
// The result is what `playSfx(name)` in src/audio/sfx.js has been asking for
// since D8: those calls have been hitting a 404 and failing silently ever since.

import { writeFileSync, mkdirSync } from 'fs'

const RATE = 22050          // plenty for phone speakers, a quarter the bytes of 44.1 stereo
const OUT  = 'public/audio'

// ── WAV container ───────────────────────────────────────────────────────────

function wav(samples) {
  const n = samples.length
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)          // PCM chunk size
  buf.writeUInt16LE(1, 20)           // format: PCM
  buf.writeUInt16LE(1, 22)           // channels: mono
  buf.writeUInt32LE(RATE, 24)
  buf.writeUInt32LE(RATE * 2, 28)    // byte rate
  buf.writeUInt16LE(2, 32)           // block align
  buf.writeUInt16LE(16, 34)          // bits per sample
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  return buf
}

const len = (ms) => Math.round((ms / 1000) * RATE)

// ── The four voices ─────────────────────────────────────────────────────────
// Everything in the game is made of these. Adding a fifth is a deliberate act,
// not something that happens because one sound needed it.

// A pitched tone. `wave` picks the character: soft, bright or hollow.
function tone(freq, ms, wave = 'sine', detune = 0) {
  const out = new Float32Array(len(ms))
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE
    const f = freq * (1 + detune * t)
    const phase = 2 * Math.PI * f * t
    if (wave === 'square')      out[i] = Math.sin(phase) >= 0 ? 0.7 : -0.7
    else if (wave === 'tri')    out[i] = (2 / Math.PI) * Math.asin(Math.sin(phase))
    else                        out[i] = Math.sin(phase)
  }
  return out
}

// A pitch sweep — the difference between "accepted" and "rejected" is mostly
// which direction this goes.
function sweep(from, to, ms, wave = 'sine') {
  const out = new Float32Array(len(ms))
  let phase = 0
  for (let i = 0; i < out.length; i++) {
    const k = i / out.length
    const f = from + (to - from) * k
    phase += (2 * Math.PI * f) / RATE
    out[i] = wave === 'square' ? (Math.sin(phase) >= 0 ? 0.7 : -0.7) : Math.sin(phase)
  }
  return out
}

// Deterministic noise: the generator must produce the same file every run, or
// the repository churns on every regeneration.
let seed = 1
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 0xffffffff * 2 - 1
}
function noise(ms) {
  const out = new Float32Array(len(ms))
  for (let i = 0; i < out.length; i++) out[i] = rnd()
  return out
}

const silence = (ms) => new Float32Array(len(ms))

// ── The one envelope ────────────────────────────────────────────────────────
// attack/release in ms, curve on the decay. Applied to every voice, which is
// what makes unrelated sounds feel like one set.
function env(buf, { attack = 4, release = 120, curve = 2 } = {}) {
  const a = len(attack)
  const out = new Float32Array(buf.length)
  for (let i = 0; i < buf.length; i++) {
    const rise = i < a ? i / a : 1
    const k = Math.max(0, 1 - (i - a) / Math.max(1, len(release)))
    out[i] = buf[i] * rise * Math.pow(k, curve)
  }
  return out
}

function mix(...bufs) {
  const n = Math.max(...bufs.map(b => b.length))
  const out = new Float32Array(n)
  for (const b of bufs) for (let i = 0; i < b.length; i++) out[i] += b[i]
  return out
}

function seq(...bufs) {
  const out = new Float32Array(bufs.reduce((s, b) => s + b.length, 0))
  let o = 0
  for (const b of bufs) { out.set(b, o); o += b.length }
  return out
}

// One loudness for the whole set. `peak` is where an individual sound sits in
// the mix — a sale should land harder than picking a box up.
function normalise(buf, peak = 0.8) {
  let max = 0
  for (const v of buf) max = Math.max(max, Math.abs(v))
  if (max === 0) return buf
  const g = peak / max
  const out = new Float32Array(buf.length)
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] * g
  return out
}

// A short low-pass, so nothing in the set is harsh on a phone speaker.
function soften(buf, amount = 0.35) {
  const out = new Float32Array(buf.length)
  let prev = 0
  for (let i = 0; i < buf.length; i++) {
    prev = prev + (buf[i] - prev) * (1 - amount)
    out[i] = prev
  }
  return out
}

// ── The sounds ──────────────────────────────────────────────────────────────

const sounds = [
  // Order placed: a short rise. Accepted, not celebrated — it happens a lot.
  { name: 'order', peak: 0.55, make: () =>
      soften(env(sweep(420, 720, 130, 'tri'), { attack: 3, release: 130 })) },

  // A clean solder point: a click with a bright tail. This is the sound the
  // player hears most, so it is the quietest and the shortest thing here.
  { name: 'solder_good', peak: 0.45, make: () => mix(
      env(noise(18), { attack: 1, release: 18, curve: 3 }),
      env(tone(1180, 90, 'sine'), { attack: 2, release: 90, curve: 3 }),
    ) },

  // A cold joint: the same click with the tail cut off and pitched down. The
  // player should hear the DIFFERENCE, not a separate alarm.
  { name: 'solder_cold', peak: 0.5, make: () => soften(mix(
      env(noise(26), { attack: 1, release: 26, curve: 2 }),
      env(tone(190, 120, 'tri'), { attack: 3, release: 120, curve: 2 }),
    ), 0.55) },

  // Overheat: noise with a falling body under it.
  { name: 'overheat', peak: 0.85, make: () => soften(mix(
      env(noise(420), { attack: 2, release: 420, curve: 1.4 }),
      env(sweep(320, 70, 380, 'square'), { attack: 4, release: 380, curve: 1.6 }),
    ), 0.4) },

  // A sale: two notes up. The one moment worth a small flourish.
  { name: 'sell', peak: 0.9, make: () => seq(
      env(tone(660, 110, 'tri'), { attack: 2, release: 110, curve: 2.4 }),
      env(mix(tone(990, 200, 'tri'), tone(1320, 200, 'sine')),
          { attack: 2, release: 200, curve: 2.2 }),
    ) },

  // Piggy bank: a scatter of small clicks, like coins landing.
  { name: 'piggy', peak: 0.7, make: () => {
      const parts = []
      for (let i = 0; i < 7; i++) {
        parts.push(env(tone(760 + i * 90, 70, 'sine'), { attack: 1, release: 70, curve: 3 }))
        parts.push(silence(28 + (i % 3) * 12))
      }
      return seq(...parts)
    } },
]

mkdirSync(OUT, { recursive: true })
for (const s of sounds) {
  const data = wav(normalise(s.make(), s.peak))
  const path = `${OUT}/${s.name}.wav`
  writeFileSync(path, data)
  console.log(`✓ ${path}  (${(data.length / 1024).toFixed(1)} KB)`)
}
