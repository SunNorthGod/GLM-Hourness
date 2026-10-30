// Score for the full video, written as MIDI in code and rendered with real
// instrument samples (GeneralUser GS) by SpessaSynth. Outputs, not committed:
//   public/music/score.mid   the score, openable in any MIDI editor or DAW
//   public/music/score.wav   the rendered audio, 48 kHz stereo
// Run scripts/get-soundbank.mjs once first.
//
// Form: 20 bars of 4/4 at 120 BPM, 40 s, C major. One bar is 2 s (60 frames
// at 30 fps), one beat 0.5 s (15 frames), so scene cuts land on the bar.
//   bars 1-2    hook      the four-note sound logo  E D G C', full beat at once
//   bars 3-6    verse     piano broken chords, pizzicato, light drums
//   bars 7-10   pre       rising sequence, strings swell, snare roll, reverse cymbal
//   bars 11-18  chorus    hook grown from the logo, full band, timpani on the downbeat
//   bars 19-20  ending    F to borrowed Fm6 (iv) to Cadd9, the logo once more
// Harmony: I - V6 - vi7 - IVmaj7 in the verse; ii7 - iii7 - IVmaj7 - V7sus4 V7 in
// the pre-chorus; in the chorus a secondary dominant (E7/G# to Am7), a ii-V to
// the subdominant (Gm7 C7 to Fmaj7), the borrowed minor iv (Fm6), and V/ii
// (A7) on the way back to the tonic.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  audioToWav,
  BasicMIDI,
  MIDIBuilder,
  SoundBankLoader,
  SpessaLog,
  SpessaSynthProcessor,
  SpessaSynthSequencer,
} from 'spessasynth_core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PPQ = 480
const BEAT = PPQ
const BAR = PPQ * 4
const BPM = 120
const BARS = 20
const SAMPLE_RATE = 48000
const TAIL_SECONDS = 0 // the video ends on the last bar line; the last chord fades with it

// ---------------------------------------------------------------- notes

const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
function midiOf(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name)
  if (!m) throw new Error(`bad note ${name}`)
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
  return (Number(m[3]) + 1) * 12 + PITCH[m[1]] + accidental
}
// "E5:8 D5:8 G5:4 C6:2 r:4" -> [{note, start, len}] relative to the bar start
function line(text) {
  const out = []
  let at = 0
  for (const token of text.trim().split(/\s+/)) {
    const [name, d] = token.split(':')
    const dotted = d.endsWith('.')
    const len = (BAR / Number(d.replace('.', ''))) * (dotted ? 1.5 : 1)
    if (name !== 'r') out.push({ note: midiOf(name), start: at, len })
    at += len
  }
  if (at !== BAR) throw new Error(`bar of ${at} ticks, not ${BAR}: ${text}`)
  return out
}

// Deterministic humanising: small velocity changes, no timing changes (the cuts are on the beat).
let seed = 1031
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 0x100000000
}
const human = (velocity, spread = 6) =>
  Math.max(1, Math.min(127, Math.round(velocity + (random() * 2 - 1) * spread)))

// ---------------------------------------------------------------- harmony

// Pitch classes of the upper voices, and the bass pitch class (slash chords).
const CHORDS = {
  Cadd9: { tones: [0, 4, 7, 2], bass: 0 },
  C: { tones: [0, 4, 7], bass: 0 },
  Fmaj9: { tones: [5, 9, 0, 4, 7], bass: 5 },
  Fmaj7: { tones: [5, 9, 0, 4], bass: 5 },
  G6: { tones: [7, 11, 2, 4], bass: 7 },
  'G/B': { tones: [7, 11, 2], bass: 11 },
  Am7: { tones: [9, 0, 4, 7], bass: 9 },
  Dm7: { tones: [2, 5, 9, 0], bass: 2 },
  Em7: { tones: [4, 7, 11, 2], bass: 4 },
  G7sus4: { tones: [7, 0, 2, 5], bass: 7 },
  G7: { tones: [7, 11, 2, 5], bass: 7 },
  'E7/G#': { tones: [4, 8, 11, 2], bass: 8 },
  Gm7: { tones: [7, 10, 2, 5], bass: 7 },
  C7: { tones: [0, 4, 7, 10], bass: 0 },
  Fm6: { tones: [5, 8, 0, 2], bass: 5 },
  A7: { tones: [9, 1, 4, 7], bass: 9 },
}

// One entry per bar: [chord, beats], beats summing to 4.
const CHART = [
  [['Cadd9', 4]],
  [['Fmaj9', 2], ['G6', 2]],
  [['C', 4]],
  [['G/B', 4]],
  [['Am7', 4]],
  [['Fmaj7', 4]],
  [['Dm7', 4]],
  [['Em7', 4]],
  [['Fmaj7', 4]],
  [['G7sus4', 2], ['G7', 2]],
  [['C', 4]],
  [['E7/G#', 4]],
  [['Am7', 4]],
  [['Gm7', 2], ['C7', 2]],
  [['Fmaj7', 4]],
  [['Fm6', 4]],
  [['Em7', 2], ['A7', 2]],
  [['Dm7', 2], ['G7', 2]],
  [['Fmaj7', 2], ['Fm6', 2]],
  [['Cadd9', 4]],
]

const SECTION = bar =>
  bar < 2 ? 'hook' : bar < 6 ? 'verse' : bar < 10 ? 'pre' : bar < 18 ? 'chorus' : 'end'

// Every chord event with its absolute start and length in ticks.
const EVENTS = []
CHART.forEach((entries, bar) => {
  let at = bar * BAR
  for (const [name, beats] of entries) {
    EVENTS.push({ name, chord: CHORDS[name], start: at, len: beats * BEAT, bar })
    at += beats * BEAT
  }
})

// Voice leading: choose the voicing of the chord's pitch classes inside
// [low, high] that moves least from the previous voicing.
function voicings(tones, low, high) {
  const options = tones.map(pc => {
    const notes = []
    for (let n = low; n <= high; n++) if (((n % 12) + 12) % 12 === pc) notes.push(n)
    return notes
  })
  const out = []
  const walk = (i, picked) => {
    if (i === options.length) {
      const sorted = [...picked].sort((a, b) => a - b)
      if (sorted[sorted.length - 1] - sorted[0] <= 14) out.push(sorted)
      return
    }
    for (const n of options[i]) walk(i + 1, [...picked, n])
  }
  walk(0, [])
  return out
}
function voiceLead(low, high) {
  let previous = null
  return EVENTS.map(event => {
    const candidates = voicings(event.chord.tones, low, high)
    if (!previous) {
      previous = candidates.sort((a, b) => Math.abs(a[0] - (low + 7)) - Math.abs(b[0] - (low + 7)))[0]
      return previous
    }
    const centre = previous.reduce((s, n) => s + n, 0) / previous.length
    previous = candidates
      .map(v => [v, Math.abs(v.reduce((s, n) => s + n, 0) / v.length - centre) + Math.abs(v[0] - previous[0]) * 0.3])
      .sort((a, b) => a[1] - b[1])[0][0]
    return previous
  })
}
const pianoVoicing = voiceLead(55, 72) // G3 .. C5
const padVoicing = voiceLead(55, 76) // strings, G3 .. E5
const bassNote = event => {
  let n = 33 + ((event.chord.bass - 33 + 120) % 12) // A1 .. G#2
  if (n > 43) n -= 12
  return n
}

// ---------------------------------------------------------------- melody

const MELODY = [
  'E5:8 D5:8 G5:4 C6:2', // 1  the sound logo
  'C6:8 B5:8 A5:4 G5:2', // 2  its answer
  'E5:8 D5:8 E5:8 G5:8 r:4 C5:8 D5:8', // 3
  'D5:8 B4:8 D5:8 G5:8 r:2', // 4
  'C5:8 B4:8 C5:8 E5:8 r:4 A4:8 B4:8', // 5
  'C5:4 A4:4 E5:2', // 6  ends on the major seventh of F
  'D5:8 F5:8 A5:4 A5:8 G5:8 F5:4', // 7  rising sequence, one step per bar
  'E5:8 G5:8 B5:4 B5:8 A5:8 G5:4', // 8
  'F5:8 A5:8 C6:4 C6:8 B5:8 A5:4', // 9
  'G5:4 C6:4 B5:4 F5:4', // 10 the seventh F resolves down to the chorus E
  'E5:8 D5:8 G5:4 C6:4. B5:8', // 11 chorus: the logo, extended
  'B5:4 G#5:8 E5:8 D6:4 C6:8 B5:8', // 12 over E7/G#
  'C6:8 B5:8 A5:4 E5:4 G5:4', // 13
  'F5:4 G5:8 A5:8 Bb5:4 G5:4', // 14 Bb, the seventh of C7
  'A5:4. G5:8 A5:4 C6:4', // 15
  'Ab5:4. G5:8 F5:4 D5:4', // 16 the borrowed Ab
  'E5:8 D5:8 G5:4 C#6:4 B5:8 A5:8', // 17 the logo again, then C# of A7
  'D6:4 C6:8 A5:8 B5:4 G5:4', // 18
  'A5:4 G5:4 Ab5:4 G5:4', // 19 A falls to Ab over F to Fm6
  'E5:8 D5:8 G5:4 C6:2', // 20 the sound logo
].map(line)

// A cello-like counter line under the chorus and ending, half notes.
const COUNTER = {
  10: 'E4:2 G4:2',
  11: 'G#4:2 B4:2',
  12: 'A4:2 E4:2',
  13: 'D4:2 E4:2',
  14: 'F4:2 A4:2',
  15: 'Ab4:2 C5:2',
  16: 'G4:2 C#4:2',
  17: 'F4:2 F4:2',
  18: 'E4:2 D4:2',
  19: 'E4:1',
}

// ---------------------------------------------------------------- build

// Channel layout and General MIDI programs (0-based).
const CH = {
  piano: { ch: 0, program: 0, volume: 88, pan: 60, reverb: 45 },
  pad: { ch: 1, program: 49, volume: 78, pan: 72, reverb: 75 },
  bass: { ch: 2, program: 33, volume: 104, pan: 64, reverb: 8 },
  glock: { ch: 3, program: 9, volume: 62, pan: 80, reverb: 80 },
  pizz: { ch: 4, program: 45, volume: 70, pan: 92, reverb: 55 },
  guitar: { ch: 5, program: 27, volume: 60, pan: 36, reverb: 45 },
  counter: { ch: 6, program: 48, volume: 76, pan: 52, reverb: 65 },
  melody: { ch: 7, program: 0, volume: 108, pan: 64, reverb: 50 },
  timpani: { ch: 8, program: 47, volume: 96, pan: 64, reverb: 60 },
  drums: { ch: 9, program: 0, volume: 100, pan: 64, reverb: 28 },
  sweep: { ch: 10, program: 119, volume: 84, pan: 64, reverb: 40 },
}

// Format 1: one track per part, so the score opens with named tracks in an editor.
const midi = new MIDIBuilder({ name: 'dsh-hourness promo', timeDivision: PPQ, initialTempo: BPM, format: 1 })
const TRACK = {}
for (const name of Object.keys(CH)) {
  midi.addTrack(name)
  TRACK[name] = Object.keys(TRACK).length + 1
}

const notes = []
function note(part, pitch, start, len, velocity) {
  notes.push({ part, pitch, start, len, velocity })
}
function cc(part, ticks, controller, value) {
  midi.controllerChange(ticks, TRACK[part], CH[part].ch, controller, value)
}

for (const [name, setup] of Object.entries(CH)) {
  if (name !== 'drums') midi.programChange(0, TRACK[name], setup.ch, setup.program)
  cc(name, 0, 7, setup.volume)
  cc(name, 0, 10, setup.pan)
  cc(name, 0, 91, setup.reverb)
  cc(name, 0, 93, name === 'pad' || name === 'counter' ? 30 : 10)
  cc(name, 0, 11, 127)
}

// Melody: piano, doubled an octave up by the glockenspiel in the hook, chorus and ending.
MELODY.forEach((bar, i) => {
  const section = SECTION(i)
  const loud = section === 'chorus' || section === 'hook' || section === 'end'
  for (const n of bar) {
    const start = i * BAR + n.start
    const accent = n.start % BEAT === 0 ? 6 : 0
    note('melody', n.note, start, n.len - 10, human((loud ? 100 : 78) + accent))
    if (loud) note('glock', n.note + 12, start, Math.min(n.len, BEAT), human(70))
  }
})

// Counter line: strings.
for (const [bar, text] of Object.entries(COUNTER)) {
  for (const n of line(text)) note('counter', n.note, Number(bar) * BAR + n.start, n.len - 20, human(84, 4))
}

EVENTS.forEach((event, i) => {
  const section = SECTION(event.bar)
  const piano = pianoVoicing[i]
  const pad = padVoicing[i]
  const bass = bassNote(event)
  const { start, len } = event
  const eighths = len / (BEAT / 2)

  // Strings pad: a sustained voicing, an octave higher in the chorus.
  const lift = section === 'chorus' ? 12 : 0
  for (const n of pad) note('pad', n + lift, start, len - 10, human(section === 'verse' ? 62 : 80, 3))

  // Piano accompaniment.
  if (section === 'verse') {
    const order = [0, 1, 2, 3, 2, 1, 2, 3]
    for (let k = 0; k < eighths; k++) {
      const n = piano[order[k % order.length] % piano.length]
      note('piano', n, start + k * (BEAT / 2), BEAT / 2, human(k % 2 === 0 ? 64 : 54))
    }
    note('piano', bass + 12, start, len - 20, human(66))
  } else if (section === 'pre') {
    const ramp = 58 + (event.bar - 6) * 8
    for (let k = 0; k < eighths; k++) {
      for (const n of piano) note('piano', n, start + k * (BEAT / 2), BEAT / 2 - 30, human(ramp + (k % 2 === 0 ? 8 : 0)))
    }
    for (let k = 0; k < len / BEAT; k++) {
      note('piano', bass + 12, start + k * BEAT, BEAT - 30, human(ramp + 6))
      note('piano', bass + 24, start + k * BEAT, BEAT - 30, human(ramp))
    }
  } else if (section === 'chorus' || section === 'hook') {
    // Pop piano: chords on 1, 2& and 4 (eighth positions 0, 3, 6) within each bar.
    const hits = [[0, 3], [3, 3], [6, 2]]
    for (const [pos, span] of hits) {
      const at = event.bar * BAR + pos * (BEAT / 2)
      if (at < start || at >= start + len) continue
      for (const n of piano) note('piano', n, at, span * (BEAT / 2) - 20, human(pos === 0 ? 92 : 80))
    }
    note('piano', bass + 12, start, len - 20, human(84))
  } else {
    for (const n of piano) note('piano', n, start, len - 10, human(80))
    note('piano', bass + 12, start, len - 10, human(80))
  }

  // Bass.
  const bassLine =
    section === 'verse'
      ? [[0, 3, 0], [3, 1, 0], [4, 2, 7], [6, 2, 0]]
      : section === 'pre'
        ? Array.from({ length: 8 }, (_, k) => [k, 1, 0])
        : section === 'chorus'
          ? [[0, 3, 0], [3, 1, 0], [4, 1, 12], [5, 1, 0], [6, 1, 7], [7, 1, 10]]
          : [[0, 8, 0]]
  for (const [pos, span, interval] of bassLine) {
    const at = start + pos * (BEAT / 2)
    if (at >= start + len) continue
    const length = Math.min(span * (BEAT / 2), start + len - at)
    // The last eighth leans into the next chord's bass when the chord changes.
    let pitch = bass + interval
    if (interval === 10) {
      const next = EVENTS[i + 1]
      pitch = next ? bassNote(next) - 1 : bass
    }
    note('bass', pitch, at, length - 20, human(section === 'chorus' ? 104 : 92))
  }

  // Pizzicato in the verse: chord tones in eighths, an octave up.
  if (section === 'verse') {
    const order = [0, 2, 1, 3, 0, 2, 1, 3]
    for (let k = 0; k < eighths; k++) {
      const n = pad[order[k] % pad.length] + 12
      note('pizz', n, start + k * (BEAT / 2), BEAT / 2, human(k % 2 === 0 ? 78 : 66))
    }
    // A glockenspiel sparkle on beat 4.
    note('glock', pad[pad.length - 1] + 24, start + 3 * BEAT, BEAT, human(48))
  }

  // Clean guitar in the chorus: short chords on the off-beats.
  if (section === 'chorus') {
    for (let k = 1; k < eighths; k += 2) {
      for (const n of piano.slice(-3)) note('guitar', n + 12, start + k * (BEAT / 2), 110, human(62))
    }
  }
})

// Drums (General MIDI key map, channel 10).
const KICK = 36, SNARE = 38, STICK = 37, CLAP = 39, HAT = 42, OPEN = 46, CRASH = 49, TAMB = 54, SHAKER = 70
const TOMS = [50, 48, 47, 45]
const SIXTEENTH = BEAT / 4
function hit(key, bar, pos, velocity) {
  note('drums', key, bar * BAR + pos * SIXTEENTH, SIXTEENTH, human(velocity, 5))
}
for (let bar = 0; bar < BARS; bar++) {
  const section = SECTION(bar)
  if (section === 'hook') {
    if (bar === 0) hit(CRASH, bar, 0, 100)
    for (const p of [0, 8, 10]) hit(KICK, bar, p, 108)
    for (const p of [4, 12]) { hit(SNARE, bar, p, 96); hit(CLAP, bar, p, 70) }
    for (let p = 0; p < 16; p += 2) hit(HAT, bar, p, p % 4 === 0 ? 80 : 60)
    if (bar === 1) TOMS.forEach((t, k) => hit(t, bar, 12 + k, 90 + k * 4))
  } else if (section === 'verse') {
    for (const p of [0, 6, 8]) hit(KICK, bar, p, 92)
    for (const p of [4, 12]) hit(STICK, bar, p, 80)
    for (let p = 0; p < 16; p += 2) hit(HAT, bar, p, p % 4 === 0 ? 62 : 46)
    for (let p = 1; p < 16; p += 2) hit(SHAKER, bar, p, 40)
  } else if (section === 'pre') {
    for (const p of [0, 4, 8, 12]) hit(KICK, bar, p, 96 + (bar - 6) * 3)
    if (bar < 9) {
      for (const p of [4, 12]) hit(SNARE, bar, p, 88)
      for (let p = 0; p < 16; p += 2) hit(bar === 8 ? OPEN : HAT, bar, p + (bar === 8 ? 1 : 0) - (bar === 8 ? 1 : 0), 60)
    } else {
      for (let p = 0; p < 16; p++) hit(SNARE, bar, p, 50 + p * 4)
    }
  } else if (section === 'chorus') {
    if (bar === 10 || bar === 14) hit(CRASH, bar, 0, 110)
    for (const p of [0, 6, 8]) hit(KICK, bar, p, 112)
    for (const p of [4, 12]) { hit(SNARE, bar, p, 104); hit(CLAP, bar, p, 82) }
    for (let p = 0; p < 16; p += 2) hit(p % 4 === 2 ? OPEN : HAT, bar, p, p % 4 === 2 ? 66 : 70)
    for (let p = 2; p < 16; p += 4) hit(TAMB, bar, p, 58)
    if (bar === 13) TOMS.forEach((t, k) => hit(t, bar, 12 + k, 92 + k * 4))
    if (bar === 17) {
      for (const p of [8, 10]) hit(SNARE, bar, p, 100)
      TOMS.forEach((t, k) => hit(t, bar, 12 + k, 96 + k * 4))
    }
  } else {
    if (bar === 18 || bar === 19) {
      hit(CRASH, bar, 0, bar === 19 ? 112 : 96)
      hit(KICK, bar, 0, 110)
    }
  }
}

// Timpani on the hook, the chorus downbeat and the last bar; a reverse cymbal into the chorus.
for (const bar of [0, 10, 19]) note('timpani', 36, bar * BAR, BAR, human(110, 3))
note('sweep', 60, 8 * BAR, 2 * BAR, 96)

// Sustain pedal on the verse broken chords and the ending, changed with each chord.
for (const event of EVENTS) {
  const section = SECTION(event.bar)
  if (section === 'verse' || section === 'end') {
    cc('piano', event.start, 64, 0)
    cc('piano', event.start + 10, 64, 127)
  }
}
cc('piano', BARS * BAR - 1, 64, 0)

// Strings swell through the pre-chorus.
for (let t = 0; t <= 4 * BAR; t += BEAT / 2) {
  cc('pad', 6 * BAR + t, 11, Math.round(82 + (45 * t) / (4 * BAR)))
}
cc('pad', 10 * BAR, 11, 127)

for (const n of notes) {
  midi.noteOn(n.start, TRACK[n.part], CH[n.part].ch, n.pitch, n.velocity)
  midi.noteOff(n.start + n.len, TRACK[n.part], CH[n.part].ch, n.pitch)
}
midi.flush()

const outDir = join(root, 'public', 'music')
mkdirSync(outDir, { recursive: true })
const midiBytes = new Uint8Array(midi.writeMIDI())
writeFileSync(join(outDir, 'score.mid'), midiBytes)
console.log(`make-score: wrote public/music/score.mid (${notes.length} notes, ${BARS} bars at ${BPM} BPM)`)

// ---------------------------------------------------------------- render

const bankPath = join(root, 'assets', 'GeneralUser-GS.sf2')
const bankBytes = readFileSync(bankPath)
const bank = SoundBankLoader.fromArrayBuffer(bankBytes.buffer.slice(bankBytes.byteOffset, bankBytes.byteOffset + bankBytes.byteLength))
// The processor sets every channel to preset 0:0:0 while it is built, before
// any bank can be added, and warns once per channel; mute that one moment.
SpessaLog.setLogLevel(false, false, false)
const synth = new SpessaSynthProcessor(SAMPLE_RATE, { eventsEnabled: false })
SpessaLog.setLogLevel(false, true, false)
synth.soundBankManager.addSoundBank(bank, 'main')
await synth.ready
synth.setSystemParameter('autoAllocateVoices', true)

const song = BasicMIDI.fromArrayBuffer(midiBytes.buffer)
const sequencer = new SpessaSynthSequencer(synth)
sequencer.loadNewSongList([song])
sequencer.play()

const seconds = (BARS * 4 * 60) / BPM + TAIL_SECONDS
const total = Math.round(seconds * SAMPLE_RATE)
const left = new Float32Array(total)
const right = new Float32Array(total)
const BLOCK = 128
for (let done = 0; done < total; done += BLOCK) {
  sequencer.processTick()
  synth.process(left, right, done, Math.min(BLOCK, total - done))
}

// Master: a short fade at the very end, gentle soft clipping, peak at -1 dBFS.
const fade = Math.round(1.2 * SAMPLE_RATE)
let peak = 0
for (let i = 0; i < total; i++) {
  const g = Math.min(1, (total - i) / fade)
  left[i] = Math.tanh(left[i] * g * 1.2)
  right[i] = Math.tanh(right[i] * g * 1.2)
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))
}
const target = 10 ** (-1 / 20)
for (let i = 0; i < total; i++) {
  left[i] *= target / peak
  right[i] *= target / peak
}
writeFileSync(join(outDir, 'score.wav'), new Uint8Array(audioToWav([left, right], SAMPLE_RATE, { normalizeAudio: false })))
console.log(`make-score: wrote public/music/score.wav (${seconds.toFixed(1)} s, ${SAMPLE_RATE} Hz)`)
