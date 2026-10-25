/**
 * Application preferences (not part of the scene document): appearance, units and digits, default overlays,
 * visual effects, editor snapping, solver and export defaults, projector mode and the optional trial log.
 * Persisted in localStorage ('verity.settings.v2'); the 26.48 preferences ('verity.prefs.v1') are migrated once.
 *
 * Unit helpers live here so every component formats values through the same reactive unit choice: values are
 * SI everywhere and are converted only when shown (`fmtQ`, `toDisp`, `unitLabel`) or entered (`fromDisp`).
 */
import { reactive, watch, watchEffect } from 'vue'
import type { UnitChoice } from '../units/units'
import { defaultChoice, displayLabel, formatQuantity, formatSig, fromDisplay, latexQuantity, numberStyle, presetChoice, toDisplay, withDecimal } from '../units/units'
import type { Curriculum } from '../formula/levels'
import { locale } from '../i18n/locale'
import { shownTime } from '../units/clock'

/** Theme choice; 'system' follows the OS appearance. */
export type ThemeMode = 'system' | 'light' | 'dark'
/** Quality level of the visual effects; 'off' disables them all. */
export type EffectQuality = 'off' | 'standard' | 'high'

/** Overlays drawn on the canvas. */
export interface DisplayOptions {
  velocity: boolean
  acceleration: boolean
  forces: boolean
  forcesAll: boolean
  trajectory: boolean
  labels: boolean
  grid: boolean
  axes: boolean
  names: boolean
  /** Stroboscopic picture (D33): images every `strobeInterval` s, `strobeCount` of them. */
  strobe: boolean
  strobeInterval: number
  strobeCount: number
  strobeOpacity: number
  strobeLabels: boolean
}

/** The on/off overlays of DisplayOptions (the numeric fields are their parameters). */
export type DisplayToggle = { [K in keyof DisplayOptions]: DisplayOptions[K] extends boolean ? K : never }[keyof DisplayOptions]

/** Visual effect preferences. */
export interface EffectSettings {
  /** Master switch: 'off' disables everything below (low-end machines, projectors). */
  quality: EffectQuality
  /** Translucent "glass" panels with a pointer-tracking highlight. */
  glass: boolean
  /** Animated soft background behind the glass panels. */
  ambient: boolean
  /** Motion blur from exact sub-frame states during playback and video export. */
  motionBlur: boolean
  /** Shutter as a fraction of one display frame (0.5 = 180° shutter). */
  shutter: number
  /** Impact sparks and sliding dust. */
  particles: boolean
  /** Fading trails behind moving bodies (in addition to the trajectory lines). */
  trails: boolean
  /** Length of the fading trail (s of simulated time). */
  trailSeconds: number
  /** Follow the OS "reduce motion" setting. */
  respectReducedMotion: boolean
}

/** Editor preferences. */
export interface EditorSettings {
  /** Snap positions, sizes and vertices to the grid (optional, off by default since 26.51). Hold Alt to bypass. */
  snap: boolean
  /** Pull a dragged object into contact with nearby objects, with hysteresis (D47). Hold Alt to bypass. */
  objectSnap: boolean
  /** Snap step in metres; 0 = the visible minor grid step. */
  snapStep: number
  /** Fixed angle steps for rotation handles (degrees); 0 = free rotation with magnetic snapping (D47). */
  angleSnap: number
}

/** Solver run preferences. */
export interface SimSettings {
  /** Compute in a Web Worker (the interface stays responsive; recordings are bit-identical). */
  worker: boolean
  /** Start playback while the rest of the recording is still being computed. */
  progressive: boolean
  /** Wall-clock budget per bounded run (s); the part computed so far is kept. */
  budgetSeconds: number
  /** How far an unbounded run computes ahead of the playhead (s of simulated time; at least 3 s × playback rate). */
  lookAheadSeconds: number
  /** Memory for the frames of a recording (MiB); older chunks beyond it are recomputed when needed. */
  memoryMB: number
  /** Solver engine: Rust/WASM when it loads (auto), or the TypeScript engine (identical results, slower). */
  engine: 'auto' | 'ts'
}

/** Export defaults. */
export interface ExportSettings {
  /** Video frame rate. */
  fps: number
  /** Pixel scale relative to the viewport (1, 1.5, 2). */
  scale: number
  /** Bits per second; 0 = automatic. */
  bitrate: number
  csvSeparator: ',' | ';' | '\t'
  csvDecimal: '.' | ','
  /** Background of still images. */
  imageBackground: 'theme' | 'white' | 'transparent'
  /** Language of reports, courseware, videos and CSV headers (26.51); 'ui': the interface language. */
  language: 'ui' | 'zh' | 'en' | 'de'
}

/** Knowledge level of the formulas shown (D44). */
export interface KnowledgeSettings {
  /** Curriculum of the level names and tags; 'auto': Chinese curriculum for the Chinese interface, else IB. */
  curriculum: 'auto' | Curriculum
  /** Ceiling on the ordinal scale of formula/levels.ts (1 lower secondary … 5 beyond). */
  level: number
}

/** All preferences. */
export interface AppSettings {
  /** Interface language (D27): 'auto' follows the system. Never stored in scene files. */
  language: 'auto' | 'zh' | 'en' | 'de'
  themeMode: ThemeMode
  /** Projector mode: larger type, thicker lines, high contrast. */
  projector: boolean
  /** Interface zoom (0.85 … 1.4). */
  uiScale: number
  /** Recompute automatically after each edit. */
  autoRun: boolean
  /** Id of the unit preset the unit choice started from. */
  unitPreset: string
  /** Display unit per kind. */
  units: UnitChoice
  /** Significant digits of every readout (3 … 12). */
  digits: number
  /** Decimal separator of readouts (26.51): point, comma with the German interface, or always comma. */
  decimalSeparator: 'point' | 'auto' | 'comma'
  /** Overlays shown by default (the toggles in the interface change these directly). */
  display: DisplayOptions
  /** Gravity g for new scenes and templates (m/s²); each scene keeps its own g once created. */
  defaultGravity: number
  effects: EffectSettings
  editor: EditorSettings
  /** Knowledge level: which formulas the cards show (D44). */
  knowledge: KnowledgeSettings
  sim: SimSettings
  export: ExportSettings
  /** Local operation log for trials (D16): off by default, never uploaded. */
  trialLog: boolean
  /** Version of the stored settings (for one-time migrations), e.g. 2651 for 26.51. */
  rev: number
}

function defaults(): AppSettings {
  return {
    // Light is the default: classrooms project on white boards
    language: 'auto',
    themeMode: 'light',
    projector: false,
    uiScale: 1,
    autoRun: true,
    unitPreset: 'si',
    units: defaultChoice(),
    digits: 4,
    decimalSeparator: 'point',
    display: { velocity: true, acceleration: false, forces: true, forcesAll: false, trajectory: true, labels: true, grid: true, axes: true, names: true, strobe: false, strobeInterval: 0.1, strobeCount: 10, strobeOpacity: 0.55, strobeLabels: false },
    defaultGravity: 9.8,
    effects: { quality: 'standard', glass: true, ambient: true, motionBlur: true, shutter: 0.5, particles: true, trails: false, trailSeconds: 0.6, respectReducedMotion: true },
    editor: { snap: false, objectSnap: true, snapStep: 0, angleSnap: 0 },
    knowledge: { curriculum: 'auto', level: 2 },
    sim: { worker: true, progressive: true, budgetSeconds: 60, lookAheadSeconds: 20, memoryMB: 512, engine: 'auto' },
    export: { fps: 60, scale: 1, bitrate: 0, csvSeparator: ',', csvDecimal: '.', imageBackground: 'theme', language: 'ui' },
    trialLog: false,
    rev: SETTINGS_REV
  }
}

/** Current settings revision. */
const SETTINGS_REV = 2651

/** The live, reactive preferences (saved automatically). */
export const settings = reactive<AppSettings>(defaults())

/** Settings page sections and the keys each one resets. */
export const SETTINGS_SECTIONS = {
  general: ['language', 'themeMode', 'uiScale', 'autoRun', 'defaultGravity'],
  units: ['unitPreset', 'units', 'digits', 'decimalSeparator'],
  display: ['display', 'projector'],
  effects: ['effects'],
  editor: ['editor'],
  knowledge: ['knowledge'],
  sim: ['sim'],
  export: ['export'],
  privacy: ['trialLog']
} satisfies Record<string, Array<keyof AppSettings>>

/** A section of the settings page. */
export type SettingsSection = keyof typeof SETTINGS_SECTIONS

/**
 * Restore defaults: everything, a settings page section (its name may equal a key: 'units' also resets the preset
 * and the digits, 'display' also projector mode), one key, or a list of keys.
 */
export function resetSettings(what?: keyof AppSettings | Array<keyof AppSettings> | SettingsSection) {
  const d = defaults()
  const target = settings as unknown as Record<string, unknown>
  const src = d as unknown as Record<string, unknown>
  let keys: string[]
  if (what === undefined) keys = Object.keys(d)
  else if (Array.isArray(what)) keys = what
  else if (what in SETTINGS_SECTIONS) keys = SETTINGS_SECTIONS[what as SettingsSection]
  else keys = [what]
  for (const k of keys) target[k] = src[k]
}

/** Switch to a unit preset. */
export function applyUnitPreset(id: string) {
  settings.unitPreset = id
  settings.units = presetChoice(id)
}

// ---- Units ----

/** Convert an SI value to the current display unit. */
export function toDisp(v: number, siUnit: string): number { return toDisplay(v, siUnit, settings.units) }
/** Convert a display value to SI under the current unit choice. */
export function fromDisp(v: number, siUnit: string): number { return fromDisplay(v, siUnit, settings.units) }
/** Display unit label for an SI unit string. */
export function unitLabel(siUnit: string): string { return displayLabel(siUnit, settings.units) }
/** An SI value with its display unit, e.g. "12.5 cm" (digits default to the readout setting). */
export function fmtQ(v: number | null, siUnit: string, digits: number = settings.digits): string { return formatQuantity(v, siUnit, settings.units, digits) }
/** The number only, in the display unit ("12.5"). */
export function fmtNum(v: number | null, siUnit: string, digits: number = settings.digits): string {
  return v === null || !Number.isFinite(v) ? '—' : formatSig(toDisplay(v, siUnit, settings.units), digits)
}
/**
 * Time of the recording clock as shown (from the start time of a branch, D52), with fixed decimals fine enough for
 * the recording step `dt` (readouts that must not jitter): "0.250 s".
 */
export function fmtTime(t: number, dt: number, withUnit = true): string {
  const si = Math.max(3, Math.min(6, Math.ceil(-Math.log10(dt > 0 ? dt : 1e-3) - 1e-9)))
  const decimals = Math.max(0, si - Math.round(Math.log10(toDisplay(1, 's', settings.units))))
  const s = withDecimal(toDisplay(shownTime(t), 's', settings.units).toFixed(decimals))
  return withUnit ? `${s} ${displayLabel('s', settings.units)}` : s
}
/** An SI value as KaTeX with its display unit, e.g. "12.5\,\mathrm{cm}". */
export function texQ(v: number | null, siUnit: string, digits: number = settings.digits): string { return latexQuantity(v, siUnit, settings.units, digits) }

// ---- Environment ----

const mq = (q: string) => (typeof matchMedia === 'function' ? matchMedia(q) : null)
const reducedMotionQuery = mq('(prefers-reduced-motion: reduce)')
const darkQuery = mq('(prefers-color-scheme: dark)')

/** Live operating-system state the appearance depends on. */
export const sysEnv = reactive({
  reducedMotion: !!reducedMotionQuery?.matches,
  prefersDark: !!darkQuery?.matches,
  hidden: typeof document !== 'undefined' ? document.hidden : false
})
reducedMotionQuery?.addEventListener?.('change', e => { sysEnv.reducedMotion = e.matches })
darkQuery?.addEventListener?.('change', e => { sysEnv.prefersDark = e.matches })
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { sysEnv.hidden = document.hidden })

/** The theme in effect: the explicit choice, or the system appearance in 'system' mode. */
export function effectiveTheme(): 'light' | 'dark' {
  if (settings.themeMode === 'system') return sysEnv.prefersDark ? 'dark' : 'light'
  return settings.themeMode
}

/** True when animations should stay still (OS preference honoured). */
export function calmMotion(): boolean { return settings.effects.respectReducedMotion && sysEnv.reducedMotion }

/** Effective effect switches after the quality level and the OS motion preference. */
export function effectiveEffects(): EffectSettings {
  const e = settings.effects
  const off = e.quality === 'off'
  const calm = calmMotion()
  return {
    ...e,
    glass: !off && e.glass && !settings.projector,
    ambient: !off && e.ambient && !settings.projector,
    motionBlur: !off && !calm && e.motionBlur,
    particles: !off && !calm && e.particles,
    trails: !off && e.trails
  }
}

// ---- Persistence ----

const KEY = 'verity.settings.v2'
const OLD_KEY = 'verity.prefs.v1'

function merge<T extends object>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== 'object') return base
  for (const k of Object.keys(base) as Array<keyof T>) {
    const pv = (patch as Record<string, unknown>)[k as string]
    if (pv === undefined) continue
    const bv = base[k]
    if (bv && typeof bv === 'object' && !Array.isArray(bv)) merge(bv as object, pv)
    else if (typeof pv === typeof bv) base[k] = pv as T[keyof T]
  }
  return base
}

const clamp = (v: number, lo: number, hi: number, fallback: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback)

/** Keep stored values inside their valid ranges (hand-edited or older files). */
function sanitize() {
  const d = defaults()
  if (!['auto', 'zh', 'en', 'de'].includes(settings.language)) settings.language = d.language
  if (!['system', 'light', 'dark'].includes(settings.themeMode)) settings.themeMode = d.themeMode
  settings.uiScale = clamp(settings.uiScale, 0.85, 1.4, 1)
  settings.digits = Math.round(clamp(settings.digits, 3, 12, d.digits))
  settings.defaultGravity = clamp(settings.defaultGravity, 0, 1000, d.defaultGravity)
  if (!['off', 'standard', 'high'].includes(settings.effects.quality)) settings.effects.quality = d.effects.quality
  settings.effects.shutter = clamp(settings.effects.shutter, 0.05, 1, d.effects.shutter)
  settings.effects.trailSeconds = clamp(settings.effects.trailSeconds, 0.1, 10, d.effects.trailSeconds)
  settings.editor.snapStep = clamp(settings.editor.snapStep, 0, 100, 0)
  settings.editor.angleSnap = clamp(settings.editor.angleSnap, 0, 90, d.editor.angleSnap)
  if (!['auto', 'cn', 'ib'].includes(settings.knowledge.curriculum)) settings.knowledge.curriculum = d.knowledge.curriculum
  settings.knowledge.level = Math.round(clamp(settings.knowledge.level, 1, 5, d.knowledge.level))
  settings.sim.budgetSeconds = clamp(settings.sim.budgetSeconds, 1, 600, d.sim.budgetSeconds)
  settings.sim.lookAheadSeconds = clamp(settings.sim.lookAheadSeconds, 2, 600, d.sim.lookAheadSeconds)
  settings.sim.memoryMB = clamp(settings.sim.memoryMB, 16, 8192, d.sim.memoryMB)
  settings.export.fps = clamp(settings.export.fps, 1, 240, d.export.fps)
  settings.export.scale = clamp(settings.export.scale, 0.5, 4, d.export.scale)
  settings.export.bitrate = clamp(settings.export.bitrate, 0, 2e8, 0)
  if (!['point', 'auto', 'comma'].includes(settings.decimalSeparator)) settings.decimalSeparator = d.decimalSeparator
  if (!['ui', 'zh', 'en', 'de'].includes(settings.export.language)) settings.export.language = d.export.language
}

/** The 26.48 preferences: theme, digits, overlays and auto-run. */
function migrateOld(raw: string) {
  const p = JSON.parse(raw) as { theme?: string; digits?: number; display?: Partial<DisplayOptions>; autoRun?: boolean }
  if (p.theme === 'dark' || p.theme === 'light') settings.themeMode = p.theme
  if (typeof p.digits === 'number') settings.digits = p.digits
  if (p.display && typeof p.display === 'object') merge(settings.display, p.display)
  if (typeof p.autoRun === 'boolean') settings.autoRun = p.autoRun
}

/** Load the stored settings (call once at startup, before mounting). */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const stored = JSON.parse(raw) as { rev?: unknown }
      merge(settings, stored)
      const rev = typeof stored.rev === 'number' ? stored.rev : 0
      if (rev < 2651) {
        // 26.51 (D47): editing is continuous; grid snapping and fixed angle steps become opt-in
        settings.editor.snap = false
        settings.editor.angleSnap = 0
      }
      settings.rev = SETTINGS_REV
    } else {
      const old = localStorage.getItem(OLD_KEY)
      if (old) {
        migrateOld(old)
        localStorage.setItem(KEY, JSON.stringify(settings))
      }
    }
    // Migrated once; the old key is never read again
    localStorage.removeItem(OLD_KEY)
    } catch { /* Preferences are optional */ }
  sanitize()
}

// Save every change (debounced)
let saveTimer: ReturnType<typeof setTimeout> | null = null
watch(settings, () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
        try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch { /* Ignore */ }
  }, 200)
}, { deep: true })

/** Decimal separator of readouts in a language (26.51): ',' for 'comma', and for 'auto' in German. */
export function decimalFor(lang: 'zh' | 'en' | 'de'): '.' | ',' {
  const s = settings.decimalSeparator
  return s === 'comma' || (s === 'auto' && lang === 'de') ? ',' : '.'
}
// Readouts follow the setting and the interface language
watchEffect(() => { numberStyle.decimal = decimalFor(locale.lang) })

/** The curriculum in effect (D44): the choice, or for 'auto' the Chinese curriculum in the Chinese interface, else IB. */
export function effectiveCurriculum(): Curriculum {
  const c = settings.knowledge.curriculum
  return c === 'auto' ? (locale.lang === 'zh' ? 'cn' : 'ib') : c
}
