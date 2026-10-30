// Original background music for the sample video, synthesised from scratch.
// No samples or third-party recordings are used, so the result carries no
// licence other than this repository's. Output: public/music/sample.wav,
// 44.1 kHz, 16-bit stereo, 24 s (ten bars at 100 BPM).
//
// Layout, aligned with the scenes in src/Sample.tsx:
//   bars 1-2   pad alone, then the arpeggio enters        (title)
//   bars 3-5   bass enters                                 (/wish and the proposal)
//   bars 6-8   soft kick and hats enter                    (the graph works by itself)
//   bars 9-10  drums drop out, final Cmaj9 rings and fades (end card)

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 44100
const BPM = 100
const BEAT = 60 / BPM
const BAR = BEAT * 4
const BARS = 10
const LENGTH = BAR * BARS
const N = Math.round(LENGTH * SR)

const left = new Float32Array(N)
const right = new Float32Array(N)

const freq = midi => 440 * 2 ** ((midi - 69) / 12)

// One chord per bar; pad voicings and bass roots in MIDI numbers.
const CHORDS = [
  { pad: [53, 57, 60, 64], root: 41 }, // Fmaj7
  { pad: [55, 59, 62, 64], root: 43 }, // G6
  { pad: [52, 55, 59, 62], root: 40 }, // Em7
  { pad: [57, 60, 64, 67], root: 45 }, // Am7
  { pad: [53, 57, 60, 64], root: 41 }, // Fmaj7
  { pad: [55, 59, 62, 69], root: 43 }, // Gadd9
  { pad: [52, 55, 59, 62], root: 40 }, // Em7
  { pad: [57, 60, 64, 67], root: 45 }, // Am7
  { pad: [53, 57, 60, 64], root: 41 }, // Fmaj7
  { pad: [48, 55, 59, 62, 64], root: 36 }, // Cmaj9
]

function add(buffer, index, value) {
  if (index >= 0 && index < N) buffer[index] += value
}

// Pad: three harmonics, two detuned copies, slow attack, release that
// overlaps the next chord, one-pole low-pass to keep it soft.
function pad() {
  CHORDS.forEach((chord, bar) => {
    const start = bar * BAR
    const last = bar === BARS - 1
    const hold = last ? BAR - 0.2 : BAR
    const release = last ? 0.2 : 0.9
    chord.pad.forEach((note, voice) => {
      const pan = voice % 2 === 0 ? -0.35 : 0.35
      const f = freq(note)
      let lp = 0
      const a = 1 - Math.exp((-2 * Math.PI * 2400) / SR)
      const s0 = Math.round(start * SR)
      const s1 = Math.round((start + hold + release) * SR)
      for (let i = s0; i < s1 && i < N; i++) {
        const t = i / SR - start
        const attack = Math.min(1, t / 0.7)
        const tail = t > hold ? Math.max(0, 1 - (t - hold) / release) : 1
        const env = attack * tail
        let x = 0
        for (const detune of [0.997, 1.003]) {
          const w = 2 * Math.PI * f * detune * t
          x += Math.sin(w) + 0.45 * Math.sin(2 * w) + 0.18 * Math.sin(3 * w)
        }
        lp += a * (x - lp)
        const v = lp * env * 0.026
        add(left, i, v * (1 - pan))
        add(right, i, v * (1 + pan))
      }
    })
  })
}

// Arpeggio: plucked tones an octave above the pad, eighth notes, from bar 2,
// with a ping-pong delay.
function arpeggio() {
  const dry = new Float32Array(N)
  const order = [0, 1, 2, 3, 2, 1, 2, 3]
  for (let bar = 1; bar < BARS - 1; bar++) {
    const tones = CHORDS[bar].pad
    order.forEach((step, k) => {
      const note = tones[step % tones.length] + 12
      const f = freq(note)
      const start = bar * BAR + k * (BEAT / 2)
      const s0 = Math.round(start * SR)
      const len = Math.round(0.9 * SR)
      const accent = k % 4 === 0 ? 1 : 0.72
      for (let j = 0; j < len; j++) {
        const t = j / SR
        const attack = Math.min(1, t / 0.004)
        const v = attack * (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 6)
          + 0.28 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 10))
        add(dry, s0 + j, v * 0.11 * accent)
      }
    })
  }
  const dL = Math.round(BEAT * 0.75 * SR)
  const dR = Math.round(BEAT * 0.5 * SR)
  const echoL = new Float32Array(N)
  const echoR = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    echoL[i] = (i >= dL ? dry[i - dL] + 0.35 * echoR[i - dL] : 0)
    echoR[i] = (i >= dR ? dry[i - dR] + 0.35 * echoL[i - dR] : 0)
    left[i] += dry[i] + 0.32 * echoL[i]
    right[i] += dry[i] + 0.32 * echoR[i]
  }
}

// Bass: sine on the root, one note per bar, from bar 3.
function bass() {
  for (let bar = 2; bar < BARS; bar++) {
    const f = freq(CHORDS[bar].root)
    const start = bar * BAR
    const dur = bar === BARS - 1 ? BAR : BAR * 0.95
    const s0 = Math.round(start * SR)
    const len = Math.round(dur * SR)
    for (let j = 0; j < len; j++) {
      const t = j / SR
      const env = Math.min(1, t / 0.02) * (0.65 + 0.35 * Math.exp(-t * 3)) * Math.min(1, (dur - t) / 0.12)
      const v = (Math.sin(2 * Math.PI * f * t) + 0.12 * Math.sin(4 * Math.PI * f * t)) * env * 0.17
      add(left, s0 + j, v)
      add(right, s0 + j, v)
    }
  }
}

// Drums: soft kick on beats 1 and 3, closed hat on the off-beats, bars 6-9.
function drums() {
  let seed = 7
  const noise = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x3fffffff - 1
  }
  for (let bar = 5; bar < BARS - 1; bar++) {
    for (const beat of [0, 2]) {
      const s0 = Math.round((bar * BAR + beat * BEAT) * SR)
      const len = Math.round(0.35 * SR)
      let phase = 0
      for (let j = 0; j < len; j++) {
        const t = j / SR
        const f = 45 + 75 * Math.exp(-t * 28)
        phase += (2 * Math.PI * f) / SR
        const v = Math.sin(phase) * Math.exp(-t * 9) * 0.42
        add(left, s0 + j, v)
        add(right, s0 + j, v)
      }
    }
    for (let k = 0; k < 4; k++) {
      const s0 = Math.round((bar * BAR + k * BEAT + BEAT / 2) * SR)
      const len = Math.round(0.06 * SR)
      let prev = 0
      for (let j = 0; j < len; j++) {
        const t = j / SR
        const n = noise()
        const hp = n - prev
        prev = n
        const v = hp * Math.exp(-t * 70) * 0.035
        add(left, s0 + j, v * 0.8)
        add(right, s0 + j, v * 1.2)
      }
    }
  }
}

pad()
arpeggio()
bass()
drums()

// Master: fades, soft clipping, peak normalisation, 16-bit PCM.
const fadeIn = 0.4 * SR
const fadeOut = 2.2 * SR
let peak = 0
for (let i = 0; i < N; i++) {
  const g = Math.min(1, i / fadeIn) * Math.min(1, (N - i) / fadeOut)
  left[i] = Math.tanh(left[i] * g * 1.1)
  right[i] = Math.tanh(right[i] * g * 1.1)
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
console.log(`make-music: wrote ${out} (${LENGTH.toFixed(1)} s, peak scaled by ${scale.toFixed(2)})`)
