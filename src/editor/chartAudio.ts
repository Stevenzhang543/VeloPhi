/** 26.46 chart editor audio: decodes the song, plays it from any chart time at 0.5–1× speed on its own
 * AudioContext, schedules the metronome and note clicks ahead on the audio clock, reports the heard chart
 * time and keeps a waveform overview. Separate from the game's AudioRuntime (which only runs in Play). */
import { ChartTempo } from '../runtime/rhythmChartDocument'
import { songSchedule } from '../runtime/rhythmClock'

const LOOKAHEAD = .2

export class ChartAudio {
  private context: AudioContext | null = null
  private song: AudioBuffer | null = null
  private songKey = ''
  private source: AudioBufferSourceNode | null = null
  private master: GainNode | null = null
  private clickBuffers = new Map<string, AudioBuffer>()
  private startContext = 0
  private startChart = 0
  private rate = 1
  private scheduledUntil = Number.NEGATIVE_INFINITY
  private scheduledNodes: AudioScheduledSourceNode[] = []
  playing = false
  metronome = true
  hitSounds = true
  volume = .9
  /** Peak amplitude per 1/200 s of the song (0..1), for the waveform. */
  peaks: Float32Array | null = null
  readonly peaksPerSecond = 200
  error = ''

  get loaded(): boolean { return this.song !== null }
  get duration(): number { return this.song?.duration ?? 0 }

  private ensure(): AudioContext | null {
    if (this.context) return this.context
    const Context = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext
    if (!Context) { this.error = 'This browser has no Web Audio.'; return null }
    this.context = new Context()
    this.master = this.context.createGain(); this.master.gain.value = this.volume; this.master.connect(this.context.destination)
    return this.context
  }

  private latency(): number {
    const context = this.context as (AudioContext & { outputLatency?: number }) | null
    if (!context) return 0
    return Math.max(0, (Number.isFinite(context.baseLatency) ? context.baseLatency : 0) + (Number.isFinite(context.outputLatency) ? context.outputLatency! : 0))
  }

  /** Decodes the song at `source` (data or object URL); cached by `key`. */
  async load(source: string | null, key: string): Promise<boolean> {
    if (key === this.songKey && this.song) return true
    this.stop(); this.song = null; this.peaks = null; this.songKey = key; this.error = ''
    if (!source) return false
    const context = this.ensure()
    if (!context) return false
    try {
      const bytes = await (await fetch(source)).arrayBuffer()
      const buffer = await context.decodeAudioData(bytes)
      if (this.songKey !== key) return false
      this.song = buffer
      this.peaks = computePeaks(buffer, this.peaksPerSecond)
      return true
    } catch (error) {
      if (this.songKey === key) this.error = error instanceof Error ? error.message : String(error)
      return false
    }
  }

  /** Plays from chart time `chartTime`; `audioOffset` is where beat 0 is in the audio (seconds). */
  play(chartTime: number, rate: number, audioOffset: number): boolean {
    const context = this.ensure()
    if (!context || !this.master) return false
    this.stop()
    void context.resume()
    this.rate = Math.max(.25, Math.min(2, rate))
    const when = context.currentTime + .06
    this.startContext = when; this.startChart = chartTime
    if (this.song) {
      const schedule = songSchedule(chartTime, 0, audioOffset)
      if (schedule.offset < this.song.duration) {
        const source = context.createBufferSource()
        source.buffer = this.song; source.playbackRate.value = this.rate
        source.connect(this.master)
        source.start(when + schedule.start / this.rate, schedule.offset)
        this.source = source
      }
    }
    this.scheduledUntil = chartTime - .001
    this.playing = true
    return true
  }

  /** Stops playback; returns the chart time it stopped at. */
  stop(): number {
    const time = this.time()
    try { this.source?.stop() } catch { /* never started */ }
    this.source?.disconnect(); this.source = null
    for (const node of this.scheduledNodes) { try { node.stop() } catch { /* already ended */ } }
    this.scheduledNodes = []
    this.playing = false
    return time
  }

  /** The chart time being heard now (the start time while stopped). */
  time(): number {
    if (!this.playing || !this.context) return this.startChart
    return this.startChart + Math.max(0, this.context.currentTime - this.latency() - this.startContext) * this.rate + Math.min(0, this.context.currentTime - this.latency() - this.startContext)
  }

  /** Schedules metronome clicks and note clicks up to LOOKAHEAD ahead; call every frame while playing. */
  schedule(tempo: ChartTempo, noteTimes: readonly number[], beatsPerBar = 4): void {
    const context = this.context
    if (!this.playing || !context || !this.master) return
    const now = this.time(), until = now + LOOKAHEAD * this.rate
    if (until <= this.scheduledUntil) return
    const at = (chartTime: number) => this.startContext + (chartTime - this.startChart) / this.rate
    if (this.metronome) {
      for (let beat = Math.ceil(tempo.timeToBeat(Math.max(this.scheduledUntil, now - .05)) - 1e-9); ; beat++) {
        const time = tempo.beatToTime(beat)
        if (time > until) break
        if (time <= this.scheduledUntil) continue
        this.click(beat % beatsPerBar === 0 ? 'accent' : 'beat', at(time), .55)
      }
    }
    if (this.hitSounds) {
      let previous = Number.NEGATIVE_INFINITY
      for (const time of noteTimes) {
        if (time <= this.scheduledUntil || time < now - .05) continue
        if (time > until) break
        if (time - previous < .001) continue
        previous = time
        this.click('note', at(time), .7)
      }
    }
    this.scheduledUntil = until
    this.scheduledNodes = this.scheduledNodes.filter(node => (node as AudioScheduledSourceNode & { finished?: boolean }).finished !== true).slice(-128)
  }

  /** A click right now (taps in the calibration, placing notes). */
  clickNow(kind: 'accent' | 'beat' | 'note' = 'note', volume = .6): number {
    const context = this.ensure()
    if (!context) return 0
    void context.resume()
    const when = context.currentTime + .005
    this.click(kind, when, volume)
    return when
  }

  get contextTime(): number { return this.context?.currentTime ?? 0 }
  /** The context time of the sound heard from the speakers at performance time `performanceMs`: a click
   * scheduled at context time T is heard when this reaches T (the calibration compares taps with it). */
  heardContextTimeAt(performanceMs: number): number {
    const context = this.context
    if (!context) return 0
    const stamp = typeof context.getOutputTimestamp === 'function' ? context.getOutputTimestamp() : null
    if (stamp?.contextTime && stamp.performanceTime) return stamp.contextTime + (performanceMs - stamp.performanceTime) / 1000
    return context.currentTime - this.latency() + (performanceMs - performance.now()) / 1000
  }
  /** Schedules one click at context time `when` (the calibration metronome). */
  clickAt(when: number, accent = false): void { const context = this.ensure(); if (!context) return; void context.resume(); this.click(accent ? 'accent' : 'beat', when, .7) }

  private click(kind: 'accent' | 'beat' | 'note', when: number, volume: number): void {
    const context = this.context
    if (!context || !this.master) return
    let buffer = this.clickBuffers.get(kind)
    if (!buffer || buffer.sampleRate !== context.sampleRate) {
      const length = Math.round(context.sampleRate * .05)
      buffer = context.createBuffer(1, length, context.sampleRate)
      const data = buffer.getChannelData(0), frequency = kind === 'accent' ? 1760 : kind === 'beat' ? 1180 : 2600
      for (let index = 0; index < length; index++) { const t = index / context.sampleRate; data[index] = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t * (kind === 'note' ? 120 : 70)) * Math.min(1, t * 1500) }
      this.clickBuffers.set(kind, buffer)
    }
    const node = context.createBufferSource(), gain = context.createGain()
    node.buffer = buffer; gain.gain.value = volume
    node.connect(gain).connect(this.master)
    node.onended = () => { (node as AudioScheduledSourceNode & { finished?: boolean }).finished = true; node.disconnect(); gain.disconnect() }
    node.start(Math.max(context.currentTime, when))
    this.scheduledNodes.push(node)
  }

  setVolume(volume: number): void { this.volume = volume; if (this.master) this.master.gain.value = volume }

  dispose(): void {
    this.stop()
    const context = this.context
    this.context = null; this.master = null; this.song = null; this.peaks = null; this.songKey = ''
    if (context && context.state !== 'closed') void context.close().catch(() => undefined)
  }
}

/** Peak of |sample| over all channels per 1/perSecond s. */
export function computePeaks(buffer: Pick<AudioBuffer, 'numberOfChannels' | 'length' | 'sampleRate' | 'getChannelData'>, perSecond: number): Float32Array {
  const step = Math.max(1, Math.floor(buffer.sampleRate / perSecond)), count = Math.ceil(buffer.length / step)
  const peaks = new Float32Array(count)
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel)
    for (let bucket = 0; bucket < count; bucket++) {
      let peak = peaks[bucket]
      const end = Math.min(data.length, (bucket + 1) * step)
      for (let index = bucket * step; index < end; index++) { const value = Math.abs(data[index]); if (value > peak) peak = value }
      peaks[bucket] = peak
    }
  }
  return peaks
}
