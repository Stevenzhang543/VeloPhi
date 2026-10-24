/** 26.46 rhythm timing: the chart clock (audio clock or, for silent charts, the performance clock), its
 * smoothing, lane keys and the settings array handed to the Rust core. Pure functions and small classes so
 * the verify scripts test them without a browser. */

/** Default lane keys by lane count (osu!mania-style home-row layouts). */
const DEFAULT_LANE_KEYS: Record<number, readonly string[]> = {
  1: ['Space'],
  2: ['KeyF', 'KeyJ'],
  3: ['KeyF', 'Space', 'KeyJ'],
  4: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
  5: ['KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK'],
  6: ['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'],
  7: ['KeyS', 'KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK', 'KeyL'],
  8: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'],
  9: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'],
  10: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyV', 'KeyN', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon']
}

/** "D, F, J, K" or "KeyD,KeyF" → KeyboardEvent.code values. Letters and digits are accepted as written. */
export function normalizeKeyName(name: string): string {
  const value = name.trim()
  if (!value) return ''
  if (/^[a-z]$/i.test(value)) return `Key${value.toUpperCase()}`
  if (/^[0-9]$/.test(value)) return `Digit${value}`
  const named: Record<string, string> = { space: 'Space', ';': 'Semicolon', ',': 'Comma', '.': 'Period', '/': 'Slash', "'": 'Quote', '[': 'BracketLeft', ']': 'BracketRight', left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', shift: 'ShiftLeft', enter: 'Enter' }
  return named[value.toLowerCase()] ?? value
}

/** Key codes per lane: the component's list when it names one key per lane, otherwise the default layout. */
export function laneKeyCodes(lanes: number, authored: string): string[] {
  const count = Math.max(1, Math.min(16, Math.floor(lanes) || 4))
  const custom = authored.split(',').map(normalizeKeyName).filter(Boolean)
  if (custom.length >= count) return custom.slice(0, count)
  const fallback = DEFAULT_LANE_KEYS[count]
  if (fallback) return [...fallback]
  return Array.from({ length: count }, (_, index) => `Digit${(index + 1) % 10}`)
}

/** Keys that never count as a rhythm press in judgement-line charts (navigation and system keys). */
export function isRhythmKeyboardKey(code: string): boolean {
  return /^(Key[A-Z]|Digit[0-9]|Space|Semicolon|Comma|Period|Slash|Quote|Bracket(Left|Right)|Numpad[0-9])$/.test(code)
}

/** Physical key codes bound to enabled input actions ("r" and "KeyR" both reserve KeyR, " " reserves Space). */
export function reservedActionKeys(actions: readonly { enabled?: boolean; bindings: readonly { device: string; code: string; chord?: readonly string[] }[] }[]): Set<string> {
  const keys = new Set<string>()
  for (const action of actions) {
    if (action.enabled === false) continue
    for (const binding of action.bindings) {
      if (binding.device !== 'keyboard' && binding.device !== 'physical-key') continue
      const code = binding.code
      keys.add(code === ' ' ? 'Space' : /^[a-z]$/i.test(code) ? `Key${code.toUpperCase()}` : /^[0-9]$/.test(code) ? `Digit${code}` : code)
    }
  }
  return keys
}

/** The settings array for WasmRhythmSession (see nova_wasm::rhythm::settings_from). */
export function rhythmSettingsArray(component: {
  perfectMs: number; greatMs: number; goodMs: number; badMs: number; scrollSpeed: number; laneWidth: number
  judgeY: number; hitWidth: number; flickSpeed: number; botPlay: boolean
}, visibleDistance = 30, visibleSeconds = 8): Float64Array {
  const seconds = (ms: number) => Math.max(.005, (Number.isFinite(ms) ? ms : 0) / 1000)
  return new Float64Array([
    seconds(component.perfectMs), seconds(component.greatMs), seconds(component.goodMs), seconds(component.badMs),
    component.scrollSpeed, component.laneWidth, component.judgeY, component.hitWidth, component.flickSpeed,
    .12, visibleDistance, visibleSeconds, component.botPlay ? 1 : 0
  ])
}

/**
 * The chart clock. Chart time c relates to the source clock s (the heard audio-context time, or the
 * performance clock for silent charts) by c = base + (s - anchor). Rendering reads a smoothed version:
 * the source clock of browsers moves in steps (render quanta, coarse timestamps), so the offset between
 * chart time and performance time is low-pass filtered and snapped back when it drifts too far (a seek,
 * a pause, an underrun).
 */
export class RhythmChartClock {
  private base = 0
  private anchor = 0
  private bias: number | null = null
  private running = false
  private frozenAt = 0
  /** Largest smoothing correction before the clock snaps (seconds). */
  snapThreshold = .03
  /** Fraction of the remaining error removed per sample. */
  smoothing = .1

  /** Starts (or restarts) at chart time `chartTime` when the source clock reads `source`. */
  start(chartTime: number, source: number): void { this.base = chartTime; this.anchor = source; this.running = true; this.bias = null }
  /** Freezes at the chart time the source clock `source` gives. */
  pause(source: number): number { const time = this.raw(source); this.frozenAt = time; this.running = false; this.bias = null; return time }
  get isRunning(): boolean { return this.running }
  /** Unsmoothed chart time at source time `source`. */
  raw(source: number): number { return this.running ? this.base + (source - this.anchor) : this.frozenAt }
  /** Source-clock time at which the chart reaches `chartTime` (for scheduling sounds on the audio clock). */
  sourceAt(chartTime: number): number { return this.anchor + (chartTime - this.base) }
  /** Moves the anchor (the source clock stood still for `seconds` while the chart did not move). */
  shift(seconds: number): void { if (Number.isFinite(seconds)) this.anchor += seconds }
  /** Smoothed chart time for performance time `performanceMs`, given the source clock at that moment. */
  sample(performanceMs: number, source: number): number {
    const raw = this.raw(source)
    if (!this.running) return raw
    const offset = raw - performanceMs / 1000
    if (this.bias === null || Math.abs(offset - this.bias) > this.snapThreshold) this.bias = offset
    else this.bias += (offset - this.bias) * this.smoothing
    return performanceMs / 1000 + this.bias
  }
  /** Chart time of an input event at performance time `eventMs`, consistent with the last sample. */
  eventTime(eventMs: number, fallbackSource: number): number {
    if (!this.running) return this.frozenAt
    return this.bias === null ? this.raw(fallbackSource) : eventMs / 1000 + this.bias
  }
  reset(): void { this.base = 0; this.anchor = 0; this.bias = null; this.running = false; this.frozenAt = 0 }
}

/** Where the song must start for chart time `chartTime` to be heard at context time `when`:
 * the audio offset into the file and the context time the buffer starts (later than `when` while the
 * chart is still in its lead-in before the audio begins). `audioOffset` is where beat 0 is in the audio. */
export function songSchedule(chartTime: number, when: number, audioOffset: number): { start: number; offset: number } {
  const position = chartTime + audioOffset
  return position >= 0 ? { start: when, offset: position } : { start: when - position, offset: 0 }
}

export const JUDGEMENT_LABELS = ['', 'perfect', 'great', 'good', 'bad', 'miss'] as const
