// Original background music for the sample video, synthesised from scratch.
// No samples or third-party recordings are used, so the result carries no
// licence other than this repository's. Output: public/music/sample.wav,
// 44.1 kHz, 16-bit stereo, 24 s (twelve bars at 120 BPM).
//
// Style: bright electronic pop, the kind used for product launches.
// Supersaw chords pumped by a sidechain on the kick, a plucked lead,
// a sub bass, four-on-the-floor drums, a riser into the drop and a sub
// impact on it. Layout, aligned with the scenes in src/Sample.tsx:
//   bars 1-2    filtered chords open up, soft plucks, riser   (title)
//   bars 3-6    impact, drop: drums, bass, lead               (/wish and the proposal)
//   bars 7-10   full energy: brighter chords, lead doubled    (the graph works by itself)
//   bars 11-12  drums out, chords and lead resolve, fade      (end card)

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 44100
const BPM = 120
const BEAT = 60 / BPM
const BAR = BEAT * 4
const BARS = 12
const LENGTH = BAR * BARS
const N = Math.round(LENGTH * SR)
const DROP = 2 * BAR // bar 3
const PEAK = 6 * BAR // bar 7
const OUTRO = 10 * BAR // bar 11

const freq = midi => 440 * 2 ** ((midi - 69) / 12)
const at = seconds => Math.round(seconds * SR)

let seed = 20261030
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 0x100000000
}
const noise = () => random() * 2 - 1

const buffers = () => [new Float32Array(N), new Float32Array(N)]
const [chordL, chordR] = buffers()
const [leadL, leadR] = buffers()
const [drumL, drumR] = buffers()
const [fxL, fxR] = buffers()
const [sendL, sendR] = buffers()
const bassBus = new Float32Array(N)

function add(buffer, index, value) {
  if (index >= 0 && index < N) buffer[index] += value
}
function addStereo(l, r, index, value, pan = 0) {
  add(l, index, value * (1 - pan))
  add(r, index, value * (1 + pan))
}

// Second-order low-pass (RBJ cookbook), coefficients can change over time.
class LowPass {
  constructor(q = 0.707) {
    this.q = q
    this.x1 = this.x2 = this.y1 = this.y2 = 0
    this.set(1000)
  }
  set(cutoff) {
    const w = (2 * Math.PI * Math.min(cutoff, SR * 0.45)) / SR
    const cos = Math.cos(w)
    const alpha = Math.sin(w) / (2 * this.q)
    const a0 = 1 + alpha
    this.b0 = (1 - cos) / 2 / a0
    this.b1 = (1 - cos) / a0
    this.b2 = this.b0
    this.a1 = (-2 * cos) / a0
    this.a2 = (1 - alpha) / a0
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2
    this.x2 = this.x1
    this.x1 = x
    this.y2 = this.y1
    this.y1 = y
    return y
  }
}

// First-order high-pass, for hats and the noise layers.
class HighPass {
  constructor(cutoff) {
    const rc = 1 / (2 * Math.PI * cutoff)
    this.a = rc / (rc + 1 / SR)
    this.x1 = this.y1 = 0
  }
  run(x) {
    const y = this.a * (this.y1 + x - this.x1)
    this.x1 = x
    this.y1 = y
    return y
  }
}

// Band-limited sawtooth step (polyBLEP), so the supersaw does not alias.
function polyBlep(t, dt) {
  if (t < dt) {
    const u = t / dt
    return u + u - u * u - 1
  }
  if (t > 1 - dt) {
    const u = (t - 1) / dt
    return u * u + u + u + 1
  }
  return 0
}

const CHORDS = {
  F: { notes: [53, 57, 60, 64], root: 41 }, // Fmaj7
  G: { notes: [55, 59, 62, 67], root: 43 }, // G
  Am: { notes: [57, 60, 64, 67], root: 45 }, // Am7
  C: { notes: [55, 60, 64, 67], root: 36 }, // C/G voicing, C root
  Cadd9: { notes: [55, 60, 62, 64, 67], root: 36 },
}
const PROGRESSION = ['F', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G', 'F', 'Cadd9']

// Sidechain: everything tonal ducks on each kick during the drop.
function duck(t) {
  if (t < DROP || t >= OUTRO) return 1
  const since = (t - DROP) % BEAT
  return 1 - 0.62 * Math.exp(-since / 0.085)
}

// Chord filter: opens across the intro, brightens at the peak, closes in the outro.
function chordCutoff(t) {
  if (t < DROP) return 320 * (2600 / 320) ** (t / DROP)
  if (t < PEAK) return 3400
  if (t < OUTRO) return 5600
  return 2600 * (700 / 2600) ** Math.min(1, (t - OUTRO) / (LENGTH - OUTRO))
}

function chords() {
  const detune = [-24, -15, -7, 0, 7, 15, 24]
  PROGRESSION.forEach((name, bar) => {
    const start = bar * BAR
    const last = bar === BARS - 1
    const attack = bar < 2 ? 0.35 : 0.015
    const hold = last ? BAR - 0.1 : BAR
    const release = last ? 0.1 : 0.12
    for (const note of CHORDS[name].notes) {
      detune.forEach((cents, v) => {
        const f = freq(note) * 2 ** (cents / 1200)
        const dt = f / SR
        let phase = random()
        const pan = (v / (detune.length - 1)) * 1.6 - 0.8
        const s0 = at(start)
        const s1 = Math.min(N, at(start + hold + release))
        for (let i = s0; i < s1; i++) {
          const t = i / SR - start
          const env = Math.min(1, t / attack) * (t > hold ? Math.max(0, 1 - (t - hold) / release) : 1)
          const saw = 2 * phase - 1 - polyBlep(phase, dt)
          phase += dt
          if (phase >= 1) phase -= 1
          addStereo(chordL, chordR, i, saw * env * 0.022, pan * 0.7)
        }
      })
    }
  })
  const fl = new LowPass(0.9)
  const fr = new LowPass(0.9)
  for (let i = 0; i < N; i++) {
    if (i % 64 === 0) {
      const c = chordCutoff(i / SR)
      fl.set(c)
      fr.set(c)
    }
    const t = i / SR
    const level = t < DROP ? 0.55 : t < OUTRO ? 0.5 : 0.6
    const g = duck(t) * level
    chordL[i] = fl.run(chordL[i]) * g
    chordR[i] = fr.run(chordR[i]) * g
    sendL[i] += chordL[i] * 0.18
    sendR[i] += chordR[i] * 0.18
  }
}

// Bass: sub sine with two soft harmonics on the root, from the drop.
function bass() {
  for (let bar = 2; bar < BARS; bar++) {
    const f = freq(CHORDS[PROGRESSION[bar]].root)
    const start = bar * BAR
    const dur = bar === BARS - 1 ? BAR - 0.05 : BAR - 0.02
    const s0 = at(start)
    for (let j = 0; j < at(dur); j++) {
      const t = j / SR
      const env = Math.min(1, t / 0.008) * Math.min(1, (dur - t) / 0.04)
      const w = 2 * Math.PI * f * t
      const v = (Math.sin(w) + 0.32 * Math.sin(2 * w) + 0.1 * Math.sin(3 * w)) * env
      add(bassBus, s0 + j, v * 0.3 * duck(start + t))
    }
  }
}

// Plucked lead: additive tone whose upper partials die away first.
function pluck(midi, startSec, level, pan) {
  const f = freq(midi)
  const s0 = at(startSec)
  for (let j = 0; j < at(1.1); j++) {
    const t = j / SR
    let v = 0
    for (let k = 1; k <= 7; k++) v += (Math.sin(2 * Math.PI * f * k * t) / k) * Math.exp(-t * (3 + 2.6 * k))
    v *= Math.min(1, t / 0.003) * level
    addStereo(leadL, leadR, s0 + j, v, pan)
    add(sendL, s0 + j, v * 0.42)
    add(sendR, s0 + j, v * 0.42)
  }
}

// One row per bar, eight eighth-notes each; null is a rest.
const MELODY = [
  [65, null, 69, null, 72, null, 76, null], // F    intro
  [67, null, 71, null, 74, null, 79, null], // G    intro
  [76, null, 81, null, 79, 76, null, 74], // Am
  [72, null, 77, null, 76, 72, null, 69], // F
  [76, null, 79, null, 84, 79, null, 76], // C
  [74, null, 79, null, 74, 71, null, 74], // G
  [76, null, 81, null, 79, 76, null, 74], // Am   peak
  [72, null, 77, null, 76, 72, null, 69], // F
  [76, null, 79, null, 84, 79, null, 76], // C
  [74, null, 79, null, 81, 83, 84, null], // G    lift into the outro
  [77, null, null, 76, null, null, 72, null], // F    outro
  [74, null, 76, null, 79, null, 84, null], // Cadd9
]

function lead() {
  MELODY.forEach((row, bar) => {
    row.forEach((note, k) => {
      if (note === null) return
      const start = bar * BAR + k * (BEAT / 2)
      const intro = bar < 2
      const level = intro ? 0.075 : 0.13
      const pan = k % 2 === 0 ? -0.18 : 0.18
      pluck(note, start, level, pan)
      if (bar >= 6 && bar < 10) pluck(note + 12, start, 0.05, -pan)
    })
  })
}

function kick(startSec, level) {
  const s0 = at(startSec)
  let phase = 0
  for (let j = 0; j < at(0.42); j++) {
    const t = j / SR
    const f = 48 + 110 * Math.exp(-t * 32)
    phase += (2 * Math.PI * f) / SR
    const click = t < 0.004 ? noise() * (1 - t / 0.004) * 0.25 : 0
    const v = (Math.sin(phase) * Math.exp(-t * 7.5) + click) * level
    addStereo(drumL, drumR, s0 + j, v)
  }
}

function clap(startSec, level) {
  const s0 = at(startSec)
  const hp = new HighPass(900)
  const lp = new LowPass(0.8)
  lp.set(5200)
  for (let j = 0; j < at(0.32); j++) {
    const t = j / SR
    let env = Math.exp(-t * 14)
    for (const offset of [0, 0.011, 0.022]) {
      if (t >= offset && t < offset + 0.009) env += 0.9 * (1 - (t - offset) / 0.009)
    }
    const v = lp.run(hp.run(noise())) * env * level
    addStereo(drumL, drumR, s0 + j, v, 0.05)
    add(sendL, s0 + j, v * 0.3)
    add(sendR, s0 + j, v * 0.3)
  }
}

function hat(startSec, level, decay, pan) {
  const s0 = at(startSec)
  const h1 = new HighPass(6500)
  const h2 = new HighPass(6500)
  for (let j = 0; j < at(decay * 6); j++) {
    const t = j / SR
    const v = h2.run(h1.run(noise())) * Math.exp(-t / decay) * level
    addStereo(drumL, drumR, s0 + j, v, pan)
  }
}

function drums() {
  for (let bar = 2; bar < 10; bar++) {
    const start = bar * BAR
    const peak = bar >= 6
    for (let beat = 0; beat < 4; beat++) {
      const t = start + beat * BEAT
      if (!(bar === 9 && beat === 3)) kick(t, 0.8)
      if (beat === 1 || beat === 3) clap(t, peak ? 0.34 : 0.3)
      hat(t + BEAT / 2, peak ? 0.1 : 0.08, 0.018, 0.25)
      if (peak) hat(t + BEAT / 2, 0.035, 0.11, -0.3)
      if (peak) {
        hat(t + BEAT / 4, 0.03, 0.012, -0.2)
        hat(t + (3 * BEAT) / 4, 0.03, 0.012, -0.2)
      }
    }
  }
  // Roll into the drop (bar 2) and into the outro (end of bar 10).
  for (const [from, count] of [[DROP - 2 * BEAT, 8], [OUTRO - BEAT, 4]]) {
    for (let k = 0; k < count; k++) clap(from + k * (BEAT / 4), 0.1 + 0.22 * (k / count))
  }
}

function riser() {
  const start = BAR
  const len = DROP - start
  const bp1 = new LowPass(2.5)
  const hp = new HighPass(300)
  let phase = 0
  for (let j = 0; j < at(len); j++) {
    const t = j / SR
    const p = t / len
    if (j % 64 === 0) bp1.set(500 * (9000 / 500) ** p)
    const n = bp1.run(hp.run(noise()))
    phase += (2 * Math.PI * (220 * (880 / 220) ** p)) / SR
    const v = (n * 0.9 + Math.sin(phase) * 0.08) * p ** 2.2 * 0.32
    addStereo(fxL, fxR, at(start) + j, v)
    add(sendL, at(start) + j, v * 0.25)
    add(sendR, at(start) + j, v * 0.25)
  }
}

function impact(startSec, level) {
  const s0 = at(startSec)
  const hp = new HighPass(2500)
  let phase = 0
  for (let j = 0; j < at(2.2); j++) {
    const t = j / SR
    phase += (2 * Math.PI * (38 + 22 * Math.exp(-t * 3))) / SR
    const boom = Math.sin(phase) * Math.exp(-t * 2.1)
    const crash = hp.run(noise()) * Math.exp(-t * 2.8) * 0.28
    const v = (boom + crash) * level
    addStereo(fxL, fxR, s0 + j, v)
    add(sendL, s0 + j, crash * level * 0.6)
    add(sendR, s0 + j, crash * level * 0.6)
  }
}

// Freeverb (Jezar's public-domain design): eight combs and four all-passes per side.
function reverb(input, offset) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(n => ({ buf: new Float32Array(n + offset), i: 0, store: 0 }))
  const passes = [556, 441, 341, 225].map(n => ({ buf: new Float32Array(n + offset), i: 0 }))
  const feedback = 0.84
  const damp = 0.28
  const out = new Float32Array(N)
  for (let s = 0; s < N; s++) {
    const x = input[s] * 0.015
    let y = 0
    for (const c of combs) {
      const o = c.buf[c.i]
      c.store = o * (1 - damp) + c.store * damp
      c.buf[c.i] = x + c.store * feedback
      c.i = (c.i + 1) % c.buf.length
      y += o
    }
    for (const a of passes) {
      const o = a.buf[a.i]
      a.buf[a.i] = y + o * 0.5
      a.i = (a.i + 1) % a.buf.length
      y = o - y
    }
    out[s] = y
  }
  return out
}

chords()
bass()
lead()
drums()
riser()
impact(DROP, 0.55)
impact(OUTRO, 0.3)

const wetL = reverb(sendL, 0)
const wetR = reverb(sendR, 23)

// Master: sum, fades, soft clipping, peak normalisation, 16-bit PCM.
const left = new Float32Array(N)
const right = new Float32Array(N)
const fadeIn = 0.05 * SR
const fadeOut = 1.6 * SR
let peak = 0
for (let i = 0; i < N; i++) {
  const g = Math.min(1, i / fadeIn) * Math.min(1, (N - i) / fadeOut)
  const l = chordL[i] + leadL[i] + drumL[i] + fxL[i] + bassBus[i] + wetL[i] * 0.9
  const r = chordR[i] + leadR[i] + drumR[i] + fxR[i] + bassBus[i] + wetR[i] * 0.9
  left[i] = Math.tanh(l * g * 1.15)
  right[i] = Math.tanh(r * g * 1.15)
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))
}
const scale = peak > 0 ? 0.89 / peak : 1

const data = Buffer.alloc(N * 4)
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(left[i] * scale * 32767), i * 4)
  data.writeInt16LE(Math.round(right[i] * scale * 32767), i * 4 + 2)
}
const header = Buffer.alloc(44)
header.write('RIFF', 0)
header.writeUInt32LE(36 + data.length, 4)
header.write('WAVE', 8)
header.write('fmt ', 12)
header.writeUInt32LE(16, 16)
header.writeUInt16LE(1, 20)
header.writeUInt16LE(2, 22)
header.writeUInt32LE(SR, 24)
header.writeUInt32LE(SR * 4, 28)
header.writeUInt16LE(4, 32)
header.writeUInt16LE(16, 34)
header.write('data', 36)
header.writeUInt32LE(data.length, 40)

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'music', 'sample.wav')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, Buffer.concat([header, data]))
console.log(`make-music: wrote ${out} (${LENGTH.toFixed(1)} s at ${BPM} BPM, peak scaled by ${scale.toFixed(2)})`)
