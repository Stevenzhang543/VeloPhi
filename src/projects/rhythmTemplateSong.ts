/** 26.46 rhythm templates: two original songs composed and synthesised in code (no samples, no external
 * audio), and the charts derived from the very same note events, so music and notes always agree.
 * - "Neon Step": 128 BPM, A minor, four-lane chart (falling notes).
 * - "Skyline Drift": 100 BPM, D major, judgement-line chart with moving, turning and fading lines.
 * - 26.47 "Prism Pulse": 120 BPM, E minor, the Rhythm Lab chart (own note types and a master timeline).
 * Rendering is deterministic (seeded noise) and encodes a 22.05 kHz mono 16-bit WAV. */
import { defaultChartLine, defaultNoteType, serializeChartDocument, type ChartDocument, type ChartEvent, type ChartNote } from '../runtime/rhythmChartDocument'

export type SongVoice = 'kick' | 'snare' | 'clap' | 'hat' | 'openhat' | 'crash' | 'riser' | 'bass' | 'lead' | 'pad' | 'pluck' | 'bell'
export interface SongEvent { beat: number; length: number; voice: SongVoice; pitch: number; velocity: number }
export interface TemplateSong { id: 'neon-step' | 'skyline-drift' | 'prism-pulse'; title: string; artist: string; bpm: number; bars: number; tailBeats: number; events: SongEvent[]; sections: Array<{ bar: number; name: string }> }

const BEATS = 4

// ---------------------------------------------------------------- composition

type Phrase = Array<[offset: number, length: number, pitch: number]>

function push(events: SongEvent[], beat: number, length: number, voice: SongVoice, pitch = 0, velocity = 1): void {
  events.push({ beat, length, voice, pitch, velocity })
}

function melody(events: SongEvent[], bar: number, phrase: Phrase, voice: SongVoice = 'lead', velocity = .9): void {
  for (const [offset, length, pitch] of phrase) push(events, bar * BEATS + offset, length, voice, pitch, velocity)
}

/** "Neon Step": intro, verse, chorus, break with a snare build, final chorus, ending hit. */
export function composeNeonStep(): TemplateSong {
  const events: SongEvent[] = []
  const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]] // Am F C G
  const roots = [33, 29, 36, 31]
  const verseA: Phrase[] = [
    [[0, .5, 76], [.5, .5, 72], [1, 1, 69], [2, .5, 72], [2.5, .5, 74], [3, 1, 76]],
    [[0, .5, 77], [.5, .5, 76], [1, 1, 72], [2, 1.5, 69], [3.5, .5, 72]],
    [[0, .5, 76], [.5, .5, 79], [1, 1, 76], [2, .5, 74], [2.5, .5, 72], [3, 1, 74]],
    [[0, 1.5, 74], [1.5, .5, 71], [2, 2, 67]]
  ]
  const verseB: Phrase = [[0, .5, 74], [.5, .5, 76], [1, .5, 74], [1.5, .5, 71], [2, 2, 69]]
  const chorus: Phrase[] = [
    [[0, .75, 81], [.75, .75, 79], [1.5, .5, 76], [2, 1, 79], [3, 1, 76]],
    [[0, .75, 77], [.75, .75, 76], [1.5, .5, 72], [2, 2, 77]],
    [[0, .75, 79], [.75, .75, 76], [1.5, .5, 72], [2, 1, 76], [3, 1, 79]],
    [[0, .75, 83], [.75, .75, 81], [1.5, .5, 79], [2, 2, 79]]
  ]
  const chorusEnd: Phrase = [[0, .75, 83], [.75, .75, 81], [1.5, .5, 79], [2, 2, 81]]
  const bars = 29
  for (let bar = 0; bar < bars - 1; bar++) {
    const chord = bar % 4, start = bar * BEATS
    const intro = bar < 4, verse = bar >= 4 && bar < 12, hook = (bar >= 12 && bar < 20) || (bar >= 24 && bar < 28), breakdown = bar >= 20 && bar < 24
    // Pad on every bar (softer under the chorus).
    for (const pitch of chords[chord]) push(events, start, 4, 'pad', pitch, hook ? .4 : breakdown ? .75 : .6)
    // Drums.
    if (intro) {
      push(events, start, .5, 'kick', 0, bar < 2 ? .8 : 1)
      if (bar >= 2) for (const beat of [1, 2, 3]) push(events, start + beat, .5, 'kick')
      if (bar >= 1) for (let beat = .5; beat < 4; beat += 1) push(events, start + beat, .25, 'hat', 0, .55)
      if (bar === 3) push(events, start + 3, 1, 'riser', 0, .6)
    } else if (verse || hook) {
      for (const beat of [0, 1, 2, 3]) push(events, start + beat, .5, 'kick')
      if (hook && bar % 2 === 1) push(events, start + 2.5, .5, 'kick', 0, .8)
      for (const beat of [1, 3]) push(events, start + beat, .5, hook ? 'clap' : 'snare')
      if (hook) for (let step = 0; step < 16; step++) { if (step % 4 !== 0) push(events, start + step / 4, .2, 'hat', 0, step % 2 ? .35 : .5) }
      else for (let beat = .5; beat < 4; beat += 1) push(events, start + beat, .25, 'hat', 0, .6)
      if (bar % 2 === 1) push(events, start + 3.5, .5, 'openhat', 0, .5)
      if ((bar === 12 || bar === 16 || bar === 24) ) push(events, start, 2, 'crash', 0, .8)
    } else if (breakdown) {
      if (bar === 23) {
        for (let step = 0; step < 16; step++) push(events, start + step / 4, .2, 'snare', 0, .25 + .7 * step / 15)
        push(events, start, 4, 'riser', 0, .9)
      }
    }
    // Bass.
    const root = roots[chord]
    if (verse || hook) for (let step = 0; step < 8; step++) push(events, start + step / 2, .45, 'bass', step % 2 ? root + 12 : root, step % 2 ? .75 : 1)
    else if (breakdown) push(events, start, 4, 'bass', root, .7)
    else if (bar >= 2) for (const beat of [0, 1.5, 2.5]) push(events, start + beat, .9, 'bass', root, .8)
    // Lead and arpeggios.
    if (verse) melody(events, bar, (bar - 4) % 8 === 7 ? verseB : verseA[(bar - 4) % 4])
    if (hook) melody(events, bar, bar === 19 || bar === 27 ? chorusEnd : chorus[(bar - 12) % 4])
    if (hook) for (let step = 0; step < 16; step++) push(events, start + step / 4, .22, 'pluck', chords[chord][step % 3] + 12 + (step % 6 >= 3 ? 12 : 0), .35)
    if (breakdown) for (let step = 0; step < 8; step++) push(events, start + step / 2, .5, 'bell', chords[chord][step % 3] + 24, .45)
  }
  const end = (bars - 1) * BEATS
  for (const pitch of [57, 60, 64, 69]) push(events, end, 3, 'pad', pitch, .8)
  push(events, end, 1, 'kick'); push(events, end, 3, 'crash', 0, .9); push(events, end, 3, 'bass', 33, .9); push(events, end, 2, 'lead', 81, .8)
  return { id: 'neon-step', title: 'Neon Step', artist: 'Nova_A', bpm: 128, bars, tailBeats: 6, events, sections: [{ bar: 0, name: 'Intro' }, { bar: 4, name: 'Verse' }, { bar: 12, name: 'Chorus' }, { bar: 20, name: 'Break' }, { bar: 24, name: 'Final' }, { bar: 28, name: 'End' }] }
}

/** "Skyline Drift": a calmer half-time groove in D major for the judgement-line chart. */
export function composeSkylineDrift(): TemplateSong {
  const events: SongEvent[] = []
  const chords = [[62, 66, 69], [59, 62, 66], [55, 59, 62], [57, 61, 64]] // D Bm G A
  const roots = [38, 35, 31, 33]
  const theme: Phrase[] = [
    [[0, 1, 78], [1, .5, 76], [1.5, .5, 74], [2, 1.5, 76], [3.5, .5, 74]],
    [[0, 1, 71], [1, .5, 74], [1.5, .5, 76], [2, 2, 78]],
    [[0, .5, 79], [.5, .5, 78], [1, 1, 76], [2, .5, 74], [2.5, .5, 71], [3, 1, 74]],
    [[0, 1.5, 76], [1.5, .5, 73], [2, 2, 69]]
  ]
  const lift: Phrase[] = [
    [[0, .5, 81], [.5, .5, 78], [1, .5, 81], [1.5, .5, 83], [2, 1, 81], [3, 1, 78]],
    [[0, .5, 78], [.5, .5, 76], [1, .5, 74], [1.5, .5, 76], [2, 2, 78]],
    [[0, .5, 79], [.5, .5, 81], [1, .5, 83], [1.5, .5, 81], [2, 1, 79], [3, 1, 76]],
    [[0, 1, 76], [1, 1, 78], [2, 2, 81]]
  ]
  const bars = 24
  for (let bar = 0; bar < bars; bar++) {
    const chord = bar % 4, start = bar * BEATS
    const intro = bar < 4, verse = bar >= 4 && bar < 12, hook = bar >= 12 && bar < 20, outro = bar >= 20
    for (const pitch of chords[chord]) push(events, start, 4, 'pad', pitch, hook ? .45 : .65)
    if (intro) {
      push(events, start, .5, 'kick', 0, .7)
      for (let step = 0; step < 4; step++) push(events, start + step, 1, 'bell', chords[chord][step % 3] + 12, .4)
    } else if (verse || hook) {
      push(events, start, .5, 'kick'); push(events, start + 2.5, .5, 'kick', 0, .85)
      if (hook) push(events, start + 1.5, .5, 'kick', 0, .6)
      push(events, start + 2, .5, hook ? 'clap' : 'snare')
      for (let beat = .5; beat < 4; beat += 1) push(events, start + beat, .25, 'hat', 0, .5)
      if (hook) for (let beat = 0; beat < 4; beat += 1) push(events, start + beat, .2, 'hat', 0, .3)
      if (bar === 12 || bar === 16) push(events, start, 2, 'crash', 0, .75)
      if (bar === 11) push(events, start, 4, 'riser', 0, .7)
    } else if (outro && bar < 23) {
      push(events, start, .5, 'kick', 0, .6)
    }
    const root = roots[chord]
    if (verse || hook) for (const [beat, length] of [[0, 1.5], [1.5, .5], [2, 1], [3, .5], [3.5, .5]] as const) push(events, start + beat, length * .9, 'bass', beat === 3.5 ? root + 12 : root, .85)
    else push(events, start, 4, 'bass', root, .55)
    if (verse) melody(events, bar, theme[(bar - 4) % 4], 'lead', .8)
    if (hook) melody(events, bar, lift[(bar - 12) % 4], 'lead', .9)
    if (hook) for (let step = 0; step < 8; step++) push(events, start + step / 2, .45, 'pluck', chords[chord][step % 3] + 12 + (step >= 4 ? 12 : 0), .4)
    if (outro) melody(events, bar, bar === 23 ? [[0, 4, 74]] : theme[bar % 4].map(([offset, length, pitch]) => [offset, length, pitch - 12] as [number, number, number]), 'bell', .5)
  }
  push(events, bars * BEATS, 2, 'crash', 0, .5)
  return { id: 'skyline-drift', title: 'Skyline Drift', artist: 'Nova_A', bpm: 100, bars, tailBeats: 6, events, sections: [{ bar: 0, name: 'Intro' }, { bar: 4, name: 'Theme' }, { bar: 12, name: 'Lift' }, { bar: 20, name: 'Outro' }] }
}

/** 26.47 "Prism Pulse": the Rhythm Lab song. Intro, verse, an eight-bar drop and an outro in E minor. */
export function composePrismPulse(): TemplateSong {
  const events: SongEvent[] = []
  const chords = [[64, 67, 71], [60, 64, 67], [55, 59, 62], [62, 66, 69]] // Em C G D
  const roots = [40, 36, 31, 38]
  const verse: Phrase[] = [
    [[0, .5, 76], [.5, .5, 79], [1, 1, 81], [2, .5, 79], [2.5, .5, 76], [3, 1, 74]],
    [[0, 1, 72], [1, .5, 74], [1.5, .5, 76], [2, 2, 79]],
    [[0, .5, 79], [.5, .5, 81], [1, 1, 83], [2, .5, 81], [2.5, .5, 79], [3, 1, 76]],
    [[0, 1.5, 78], [1.5, .5, 76], [2, 2, 74]]
  ]
  const hook: Phrase[] = [
    [[0, .5, 83], [.5, .5, 81], [1, .5, 79], [1.5, .5, 81], [2, 1, 83], [3, .5, 86]],
    [[0, .5, 84], [.5, .5, 83], [1, .5, 79], [1.5, .5, 76], [2, 1, 79], [3, .5, 76]],
    [[0, .5, 79], [.5, .5, 83], [1, .5, 86], [1.5, .5, 83], [2, 1, 81], [3, .5, 79]],
    [[0, .5, 78], [.5, .5, 81], [1, 1, 83], [2, 1.5, 86]]
  ]
  const bars = 21
  for (let bar = 0; bar < bars - 1; bar++) {
    const chord = bar % 4, start = bar * BEATS
    const intro = bar < 4, verseBar = bar >= 4 && bar < 8, drop = bar >= 8 && bar < 16, outro = bar >= 16
    for (const pitch of chords[chord]) push(events, start, 4, 'pad', pitch, drop ? .4 : .62)
    if (intro) {
      push(events, start, .5, 'kick', 0, .85)
      if (bar >= 2) push(events, start + 2, .5, 'kick', 0, .85)
      for (let step = 0; step < 4; step++) push(events, start + step, 1, 'bell', chords[chord][step % 3] + 12, .38)
      if (bar === 3) push(events, start, 4, 'riser', 0, .7)
    } else if (verseBar || drop) {
      for (const beat of [0, 1, 2, 3]) push(events, start + beat, .5, 'kick', 0, beat % 2 ? .85 : 1)
      for (const beat of [1, 3]) push(events, start + beat, .5, drop ? 'clap' : 'snare')
      if (drop) for (let step = 0; step < 16; step++) { if (step % 4 !== 0) push(events, start + step / 4, .2, 'hat', 0, step % 2 ? .32 : .5) }
      else for (let beat = .5; beat < 4; beat += 1) push(events, start + beat, .25, 'hat', 0, .55)
      if (bar % 2 === 1) push(events, start + 3.5, .5, 'openhat', 0, .45)
      if (bar === 8 || bar === 12) push(events, start, 2, 'crash', 0, .85)
      if (bar === 7) push(events, start, 4, 'riser', 0, .8)
    } else if (outro && bar < 19) push(events, start, .5, 'kick', 0, .6)
    const root = roots[chord]
    if (drop) for (let step = 0; step < 8; step++) push(events, start + step / 2, .45, 'bass', step % 2 ? root + 12 : root, step % 2 ? .75 : 1)
    else if (verseBar) for (const [beat, length] of [[0, 1.5], [1.5, .5], [2, 1.5], [3.5, .5]] as const) push(events, start + beat, length * .9, 'bass', root, .85)
    else push(events, start, 4, 'bass', root, .5)
    if (verseBar) melody(events, bar, verse[(bar - 4) % 4], 'lead', .82)
    if (drop) melody(events, bar, hook[(bar - 8) % 4], 'lead', .9)
    if (drop) for (let step = 0; step < 8; step++) push(events, start + step / 2, .42, 'pluck', chords[chord][step % 3] + 12 + (step >= 4 ? 12 : 0), .36)
    if (outro) for (let step = 0; step < 4; step++) push(events, start + step, 1, 'bell', chords[chord][(step + bar) % 3] + 12, .42)
  }
  const end = (bars - 1) * BEATS
  for (const pitch of [64, 67, 71, 76]) push(events, end, 3, 'pad', pitch, .8)
  push(events, end, 1, 'kick'); push(events, end, 3, 'crash', 0, .85); push(events, end, 3, 'bass', 40, .9); push(events, end, 2, 'lead', 83, .75)
  return { id: 'prism-pulse', title: 'Prism Pulse', artist: 'Nova_A', bpm: 120, bars, tailBeats: 6, events, sections: [{ bar: 0, name: 'Intro' }, { bar: 4, name: 'Verse' }, { bar: 8, name: 'Drop' }, { bar: 16, name: 'Outro' }, { bar: 20, name: 'End' }] }
}

// ---------------------------------------------------------------- synthesis

const midiHz = (note: number) => 440 * 2 ** ((note - 69) / 12)

/** Deterministic white noise (xorshift32). */
function noise(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => { state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 0x8000_0000 - 1 }
}

/** Band-limited sawtooth sample (PolyBLEP). */
function saw(phase: number, increment: number): number {
  let value = 2 * phase - 1
  if (phase < increment) { const t = phase / increment; value -= t + t - t * t - 1 } else if (phase > 1 - increment) { const t = (phase - 1) / increment; value -= t * t + t + t + 1 }
  return value
}

/** Renders the song to mono samples at `sampleRate` (peak normalised, gently limited). */
export function renderSong(song: TemplateSong, sampleRate = 22050): Float32Array {
  const secondsPerBeat = 60 / song.bpm
  const total = Math.ceil(((song.bars * BEATS + song.tailBeats) * secondsPerBeat) * sampleRate)
  const dry = new Float32Array(total), send = new Float32Array(total)
  const random = noise(0x5eed + song.bpm)
  for (const event of song.events) {
    const begin = Math.round(event.beat * secondsPerBeat * sampleRate)
    const seconds = event.length * secondsPerBeat
    const velocity = event.velocity
    const write = (index: number, value: number, wet = 0) => { if (index >= 0 && index < total) { dry[index] += value; if (wet) send[index] += value * wet } }
    switch (event.voice) {
      case 'kick': {
        const length = Math.round(.42 * sampleRate); let phase = 0
        for (let i = 0; i < length; i++) { const t = i / sampleRate, frequency = 46 + 115 * Math.exp(-t * 30); phase += frequency / sampleRate; write(begin + i, Math.sin(2 * Math.PI * phase) * Math.exp(-t * 7.5) * Math.min(1, t * 900) * .95 * velocity) }
        break
      }
      case 'snare': case 'clap': {
        const length = Math.round((event.voice === 'clap' ? .26 : .22) * sampleRate); let low = 0
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate, n = random(); low += .35 * (n - low)
          const body = Math.sin(2 * Math.PI * 186 * t) * Math.exp(-t * 28) * (event.voice === 'clap' ? .15 : .45)
          const bursts = event.voice === 'clap' ? (t < .03 ? (Math.floor(t / .01) % 2 ? .4 : 1) : 1) : 1
          write(begin + i, ((n - low) * .65 * Math.exp(-t * (event.voice === 'clap' ? 16 : 20)) * bursts + body) * .55 * velocity, .15)
        }
        break
      }
      case 'hat': case 'openhat': case 'crash': {
        const decay = event.voice === 'hat' ? 55 : event.voice === 'openhat' ? 11 : 2.6
        const length = Math.round(Math.min(event.voice === 'crash' ? 3 : 1, 6 / decay) * sampleRate); let previous = 0
        const level = event.voice === 'crash' ? .3 : event.voice === 'openhat' ? .24 : .22
        for (let i = 0; i < length; i++) { const t = i / sampleRate, n = random(), high = n - previous; previous = n; write(begin + i, high * Math.exp(-t * decay) * level * velocity, event.voice === 'crash' ? .3 : 0) }
        break
      }
      case 'riser': {
        const length = Math.round(seconds * sampleRate); let previous = 0, low = 0
        for (let i = 0; i < length; i++) { const t = i / length, n = random(); low += (.05 + .5 * t) * (n - low); const value = low - previous * .3; previous = low; write(begin + i, value * t * t * .35 * velocity, .3) }
        break
      }
      case 'bass': {
        const frequency = midiHz(event.pitch), increment = frequency / sampleRate, length = Math.round((seconds + .03) * sampleRate)
        let phase = 0, filtered = 0
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate, release = Math.min(1, (length - i) / (.02 * sampleRate))
          phase = (phase + increment) % 1
          const raw = saw(phase, increment) * .6 + Math.sin(2 * Math.PI * phase) * .7
          const cutoff = 260 + 900 * Math.exp(-t * 9); filtered += (1 - Math.exp(-2 * Math.PI * cutoff / sampleRate)) * (raw - filtered)
          write(begin + i, filtered * Math.min(1, t * 400) * release * .42 * velocity)
        }
        break
      }
      case 'lead': {
        const frequency = midiHz(event.pitch), length = Math.round((seconds + .18) * sampleRate)
        let a = 0, b = .37, filtered = 0
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate, vibrato = 1 + .004 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t * 3)
          const ia = frequency * vibrato / sampleRate, ib = frequency * 1.006 * vibrato / sampleRate
          a = (a + ia) % 1; b = (b + ib) % 1
          const raw = (saw(a, ia) + saw(b, ib)) * .5
          const envelope = Math.min(1, t * 120) * (t < seconds ? .75 + .25 * Math.exp(-t * 6) : Math.exp(-(t - seconds) * 22))
          const cutoff = 1300 + 2600 * Math.exp(-t * 5); filtered += (1 - Math.exp(-2 * Math.PI * cutoff / sampleRate)) * (raw - filtered)
          write(begin + i, filtered * envelope * .2 * velocity, .35)
        }
        break
      }
      case 'pad': {
        const frequency = midiHz(event.pitch), length = Math.round((seconds + .5) * sampleRate)
        let a = 0, b = .5, filtered = 0
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate
          const ia = frequency * .997 / sampleRate, ib = frequency * 1.003 / sampleRate
          a = (a + ia) % 1; b = (b + ib) % 1
          const raw = (saw(a, ia) + saw(b, ib)) * .5
          filtered += (1 - Math.exp(-2 * Math.PI * 900 / sampleRate)) * (raw - filtered)
          const envelope = Math.min(1, t / .35) * (t < seconds ? 1 : Math.exp(-(t - seconds) * 6))
          write(begin + i, filtered * envelope * .07 * velocity, .2)
        }
        break
      }
      case 'pluck': case 'bell': {
        const frequency = midiHz(event.pitch), length = Math.round((event.voice === 'bell' ? .9 : .32) * sampleRate)
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate
          const value = event.voice === 'bell'
            ? (Math.sin(2 * Math.PI * frequency * t) + .4 * Math.sin(2 * Math.PI * frequency * 2.76 * t) * Math.exp(-t * 6)) * Math.exp(-t * 4.5)
            : (Math.sin(2 * Math.PI * frequency * t) * .7 + Math.sign(Math.sin(2 * Math.PI * frequency * t)) * .18) * Math.exp(-t * 14)
          write(begin + i, value * Math.min(1, t * 600) * .14 * velocity, .45)
        }
        break
      }
    }
  }
  // Dotted-eighth feedback delay on the send, then a soft limiter and peak normalisation.
  const delay = Math.round(.75 * secondsPerBeat * sampleRate)
  for (let i = delay; i < total; i++) send[i] += send[i - delay] * .38
  const out = new Float32Array(total)
  let peak = 1e-9
  for (let i = 0; i < total; i++) { const value = Math.tanh((dry[i] + (i >= delay ? send[i - delay] * .32 : 0)) * 1.25); out[i] = value; peak = Math.max(peak, Math.abs(value)) }
  const gain = .9 / peak
  const fade = Math.round(.4 * sampleRate)
  for (let i = 0; i < total; i++) out[i] *= gain * Math.min(1, (total - i) / fade)
  return out
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function base64(bytes: Uint8Array): string {
  const parts: string[] = []
  let chunk = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0
    chunk += BASE64[a >> 2] + BASE64[((a & 3) << 4) | (b >> 4)] + (i + 1 < bytes.length ? BASE64[((b & 15) << 2) | (c >> 6)] : '=') + (i + 2 < bytes.length ? BASE64[c & 63] : '=')
    if (chunk.length >= 65_536) { parts.push(chunk); chunk = '' }
  }
  parts.push(chunk)
  return parts.join('')
}

/** 16-bit mono PCM WAV bytes. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2), view = new DataView(bytes.buffer)
  const word = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i) }
  word(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); word(8, 'WAVE'); word(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); word(36, 'data'); view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), true)
  return bytes
}

export function songWavDataUrl(song: TemplateSong, sampleRate = 22050): { url: string; bytes: number; duration: number } {
  const samples = renderSong(song, sampleRate), wav = encodeWav(samples, sampleRate)
  return { url: `data:audio/wav;base64,${base64(wav)}`, bytes: wav.byteLength, duration: samples.length / sampleRate }
}

// ---------------------------------------------------------------- charts

const melodyEvents = (song: TemplateSong, voices: SongVoice[] = ['lead']) => song.events.filter(event => voices.includes(event.voice)).sort((a, b) => a.beat - b.beat || a.pitch - b.pitch)
const at = (song: TemplateSong, voice: SongVoice, beat: number) => song.events.some(event => event.voice === voice && Math.abs(event.beat - beat) < 1e-6)

/** Four-lane chart for "Neon Step": the lead melody in lanes by pitch, kicks and claps as chords, holds on
 * long notes, a lane stair in the intro, a trill on the snare build. */
export function neonStepChart(song: TemplateSong, audio: string): ChartDocument {
  const notes: ChartNote[] = []
  const used = new Map<number, Set<number>>()
  const add = (beat: number, lane: number, type: ChartNote['type'] = 'tap', endBeat?: number) => {
    const lanes = used.get(beat) ?? new Set<number>()
    if (lanes.has(lane) || lanes.size >= 2) return false
    // A lane is busy while a hold occupies it.
    if (notes.some(note => note.lane === lane && note.type === 'hold' && note.beat < beat && (note.endBeat ?? 0) + .24 > beat)) return false
    lanes.add(lane); used.set(beat, lanes)
    notes.push(type === 'hold' ? { type, beat, endBeat, lane, line: 0, x: 0, side: 1, speed: 1 } : { type, beat, lane, line: 0, x: 0, side: 1, speed: 1 })
    return true
  }
  const laneOf = (pitch: number) => Math.max(0, Math.min(3, Math.floor((pitch - 67) / 4)))
  // Intro: a lane stair on the kicks.
  const stair = [1, 2, 1, 2, 0, 1, 2, 3, 3, 2, 1, 0]
  let step = 0
  for (const event of song.events.filter(event => event.voice === 'kick' && event.beat < 16).sort((a, b) => a.beat - b.beat)) add(event.beat, stair[step++ % stair.length])
  // Melody (verse, chorus, final).
  for (const event of melodyEvents(song)) {
    const lane = laneOf(event.pitch)
    if (event.length >= 1.5) add(event.beat, lane, 'hold', event.beat + event.length - .5)
    else add(event.beat, lane)
  }
  // Downbeat kicks in the verse and claps in the choruses become chords on the far side of the melody.
  for (const event of song.events.filter(event => (event.voice === 'kick' && event.beat >= 16 && event.beat % 4 === 0) || event.voice === 'clap')) {
    const melodyLane = [...(used.get(event.beat) ?? [])][0]
    add(event.beat, melodyLane === undefined ? (event.voice === 'clap' ? 3 : 0) : melodyLane >= 2 ? 0 : 3)
  }
  // Break: bells on beats as a slow walk; the build is a trill.
  let walk = 0
  for (const event of song.events.filter(event => event.voice === 'bell' && event.beat % 1 === 0 && event.beat < 92)) add(event.beat, [0, 1, 2, 3, 2, 1][walk++ % 6])
  for (const event of song.events.filter(event => event.voice === 'snare' && event.beat >= 92 && event.beat < 96)) if ((event.beat - 92) % .5 === 0 || event.beat >= 94) add(event.beat, Math.round((event.beat - 92) * 4) % 2 ? 2 : 1)
  // Ending: all four lanes.
  const end = (song.bars - 1) * BEATS
  for (const lane of [0, 3]) add(end, lane)
  return {
    format: 'nova-chart', version: 1,
    meta: { title: song.title, artist: song.artist, charter: 'Nova_A template', level: '6', audio, offsetMs: 0, previewStart: 12 * BEATS * 60 / song.bpm },
    mode: 'lanes', lanes: 4, tempo: [{ beat: 0, bpm: song.bpm }], lines: [], notes, noteTypes: [], tracks: [], triggers: []
  }
}

/** Judgement-line chart for "Skyline Drift": the melody along the main line by pitch, the arpeggio as
 * drags on a second line that fades in for the lift, flicks on the crashes, and line motion. */
export function skylineDriftChart(song: TemplateSong, audio: string): ChartDocument {
  const notes: ChartNote[] = []
  const xOf = (pitch: number) => Math.max(-6.5, Math.min(6.5, (pitch - 75) * .62))
  const bar = (index: number) => index * BEATS
  const ev = (start: number, end: number, from: number, to: number, ease = 'sine_in_out'): ChartEvent => ({ start, end, from, to, ease })
  const main = defaultChartLine({ y: -2.6, length: 30 })
  main.events.x.push(ev(bar(4), bar(6), 0, 1.6), ev(bar(6), bar(10), 1.6, -1.6), ev(bar(10), bar(12), -1.6, 0))
  main.events.y.push(ev(bar(11), bar(12), -2.6, -1.4, 'back_out'), ev(bar(19), bar(20), -1.4, -2.6, 'quad_in_out'))
  main.events.rotation.push(ev(bar(12), bar(14), 0, 8), ev(bar(14), bar(18), 8, -8), ev(bar(18), bar(20), -8, 0))
  main.events.speed.push(ev(bar(19), bar(20), 1, .6), ev(bar(23), bar(24), .6, .4))
  const upper = defaultChartLine({ y: 2.7, alpha: 0, length: 30 })
  upper.events.alpha.push(ev(bar(11), bar(12), 0, 1, 'quad_out'), ev(bar(19), bar(20), 1, 0, 'quad_in'))
  upper.events.rotation.push(ev(bar(12), bar(16), 0, -6), ev(bar(16), bar(20), -6, 6))
  // Intro bells: a gentle introduction on the main line.
  for (const event of song.events.filter(event => event.voice === 'bell' && event.beat < bar(4))) notes.push({ type: 'tap', beat: event.beat, lane: 0, line: 0, x: xOf(event.pitch - 12), side: 1, speed: 1 })
  // Theme and lift melody on the main line.
  for (const event of melodyEvents(song)) {
    if (event.length >= 1.5) notes.push({ type: 'hold', beat: event.beat, endBeat: event.beat + event.length - .5, lane: 0, line: 0, x: xOf(event.pitch), side: 1, speed: 1 })
    else notes.push({ type: 'tap', beat: event.beat, lane: 0, line: 0, x: xOf(event.pitch), side: 1, speed: 1 })
  }
  // Lift arpeggio as drags on the upper line, coming from below it.
  for (const event of song.events.filter(event => event.voice === 'pluck')) {
    if (at(song, 'lead', event.beat)) continue
    notes.push({ type: 'drag', beat: event.beat, lane: 0, line: 1, x: Math.max(-6, Math.min(6, (event.pitch - 80) * .45)), side: -1, speed: 1 })
  }
  // Crashes: flicks at both ends of the main line.
  for (const event of song.events.filter(event => event.voice === 'crash' && event.beat < bar(song.bars))) notes.push({ type: 'flick', beat: event.beat, lane: 0, line: 0, x: event.beat === bar(16) ? 4.5 : -4.5, side: 1, speed: 1 })
  // Outro bells on the main line, slower.
  for (const event of song.events.filter(event => event.voice === 'bell' && event.beat >= bar(20) && event.beat % 1 === 0)) notes.push({ type: 'tap', beat: event.beat, lane: 0, line: 0, x: xOf(event.pitch + 12), side: 1, speed: 1 })
  // Simultaneous notes at the same place on the same line would be unreadable: keep the first.
  const seen = new Set<string>()
  const unique = notes.filter(note => { const key = `${note.line}:${note.beat}:${Math.round(note.x)}`; if (seen.has(key)) return false; seen.add(key); return true })
  return {
    format: 'nova-chart', version: 1,
    meta: { title: song.title, artist: song.artist, charter: 'Nova_A template', level: '5', audio, offsetMs: 0, previewStart: bar(12) * 60 / song.bpm },
    mode: 'lines', lanes: 1, tempo: [{ beat: 0, bpm: song.bpm }], lines: [main, upper], notes: unique, noteTypes: [], tracks: [], triggers: []
  }
}

/** 26.47 "Prism Pulse" (Rhythm Lab): a four-lane chart that uses the chart's own note types and the master
 * timeline. Stars (a prefab, double score) open every drop bar; mines (judged by the lab's script, to avoid)
 * sit on free lanes; the camera, the backdrop prism and bloom follow the song; triggers mark the sections.
 * `prism` is the name of the backdrop object the timeline animates. */
export function prismPulseChart(song: TemplateSong, audio: string, starPrefab: string, prism = 'Prism'): ChartDocument {
  const notes: ChartNote[] = []
  const used = new Map<number, Set<number>>()
  const busy = (lane: number, beat: number, span: number) => notes.some(note => note.lane === lane && note.beat > beat - span && note.beat < beat + span || note.lane === lane && note.endBeat !== undefined && note.beat <= beat && note.endBeat + .25 >= beat)
  const add = (beat: number, lane: number, type = 'tap', endBeat?: number) => {
    const lanes = used.get(beat) ?? new Set<number>()
    if (lanes.has(lane) || lanes.size >= 2 || busy(lane, beat, .24)) return false
    lanes.add(lane); used.set(beat, lanes)
    notes.push(endBeat !== undefined ? { type, beat, endBeat, lane, line: 0, x: 0, side: 1, speed: 1 } : { type, beat, lane, line: 0, x: 0, side: 1, speed: 1 })
    return true
  }
  const laneOf = (pitch: number) => Math.max(0, Math.min(3, Math.floor((pitch - 72) / 4)))
  // Intro: a lane walk on the bells of bars 2 and 3.
  const walk = [0, 1, 2, 3, 3, 2, 1, 0]
  let step = 0
  for (const event of song.events.filter(event => event.voice === 'bell' && event.beat >= 8 && event.beat < 16).sort((a, b) => a.beat - b.beat)) add(event.beat, walk[step++ % walk.length])
  // Verse and drop melody; the first note of every drop bar is a star.
  for (const event of melodyEvents(song)) {
    if (event.beat >= 80) continue
    const lane = laneOf(event.pitch), dropBar = event.beat >= 32 && event.beat < 64 && event.beat % 4 === 0
    if (event.length >= 1.5) add(event.beat, lane, 'hold', event.beat + event.length - .5)
    else add(event.beat, lane, dropBar ? 'star' : 'tap')
  }
  // Mines on the off-beat before each drop bar's last beat, on a lane with nothing near it.
  for (let bar = 8; bar < 16; bar++) {
    const beat = bar * 4 + 3.5
    const free = [0, 1, 2, 3].filter(lane => !busy(lane, beat, 1.01))
    if (free.length) notes.push({ type: 'mine', beat, lane: free[bar % free.length], line: 0, x: 0, side: 1, speed: 1 })
  }
  // Outro: bells as taps; the ending on both outer lanes.
  let outro = 0
  for (const event of song.events.filter(event => event.voice === 'bell' && event.beat >= 64 && event.beat < 80).sort((a, b) => a.beat - b.beat)) add(event.beat, [1, 2, 3, 2, 1, 0][outro++ % 6])
  const end = (song.bars - 1) * BEATS
  add(end, 0); add(end, 3)
  const ev = (start: number, end: number, from: number, to: number, ease = 'sine_in_out'): ChartEvent => ({ start, end, from, to, ease })
  const pulses: ChartEvent[] = []
  for (let bar = 8; bar < 16; bar++) pulses.push(ev(bar * 4, bar * 4 + 1, 1.35, 1.05, 'quad_out'))
  return {
    format: 'nova-chart', version: 2,
    meta: { title: song.title, artist: song.artist, charter: 'Nova_A template', level: '5', audio, offsetMs: 0, previewStart: 32 * 60 / song.bpm },
    mode: 'lanes', lanes: 4, tempo: [{ beat: 0, bpm: song.bpm }], lines: [], notes,
    noteTypes: [
      defaultNoteType('star', { name: 'Star', base: 'tap', weight: 2, shape: 'none', color: '#ffd76e', prefab: starPrefab }),
      defaultNoteType('mine', { name: 'Mine', base: 'custom', weight: 0, combo: true, timeout: 'perfect', windows: [30, 60, 90, 110], shape: 'diamond', color: '#ff4f6a', scale: .9, effect: 'none' })
    ],
    tracks: [
      { target: 'camera', property: 'zoom', events: [ev(31.5, 32.5, 1, 1.14, 'back_out'), ev(63, 64, 1.14, 1)] },
      { target: prism, property: 'rotation', events: [ev(0, 32, 0, 45, 'linear'), ev(32, 64, 45, 405, 'linear'), ev(64, 80, 405, 450, 'sine_out')] },
      { target: prism, property: 'scale', events: pulses },
      { target: prism, property: 'alpha', events: [ev(30, 32, .35, .85, 'quad_in'), ev(62, 64, .85, .35)] },
      { target: 'post', property: 'bloom', events: [ev(32, 32.5, 0, .55, 'quad_out'), ev(63, 64, .55, 0)] }
    ],
    triggers: [{ beat: 16, name: 'verse', value: 0 }, { beat: 32, name: 'drop', value: 1 }, { beat: 64, name: 'outro', value: 0 }]
  }
}

export function chartSource(chart: ChartDocument): string { return serializeChartDocument(chart) }
