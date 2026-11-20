/**
 * The material of floating controls (26.64, D255; docs/design/DESIGN_SYSTEM.md §5): which of the three tiers — 通透
 * (clear), 着色 (tinted), 实色 (solid) — is in effect, and the automatic step down when playback cannot keep its frame
 * time with glass on screen.
 *
 * The user chooses a tier in the settings (default 着色). What is in effect is that choice, lowered to 实色 by
 * projection, by "reduce transparency" (the setting or the system), by the system's "more contrast", by the effects
 * being off and by the Android safe mode — and capped by the automatic step of this run. The cap is not stored: a
 * slow moment must not change what the user chose.
 *
 * Automatic step: while a simulation plays, the intervals between animation frames are collected; when the 95th
 * percentile of a full 2 s window exceeds 20 ms, the tier goes down one step and the status bar says so once.
 */
import { reactive } from 'vue'
import type { GlassTier } from './settings'
import { settings, solidSurfaces, sysEnv } from './settings'

/** The tiers from the most to the least translucent. */
export const TIERS: readonly GlassTier[] = ['clear', 'tinted', 'solid']

/** Run-time state of the material: the cap of the automatic step and the notice the status bar shows once. */
export const material = reactive({
  /** The most translucent tier this run still allows (null: no automatic step happened). */
  cap: null as GlassTier | null,
  /** The tier an automatic step just went down to, until the status bar's notice is dismissed or times out. */
  notice: null as GlassTier | null,
  /** 95th percentile of the frame interval of the window that caused the last step (ms; for the notice's detail). */
  p95: 0
})

/** The less translucent of two tiers. */
function capped(t: GlassTier, cap: GlassTier | null): GlassTier {
  return cap && TIERS.indexOf(cap) > TIERS.indexOf(t) ? cap : t
}

/** The tier one step down, or null from 实色. */
export function lowerTier(t: GlassTier): GlassTier | null {
  const i = TIERS.indexOf(t)
  return i >= 0 && i < TIERS.length - 1 ? TIERS[i + 1] : null
}

/** The tier in effect. `forceSolid`: a host condition that rules translucency out (the Android safe mode). */
export function effectiveTier(forceSolid = false): GlassTier {
  if (forceSolid || settings.projector || settings.effects.quality === 'off' || solidSurfaces() || sysEnv.moreContrast) return 'solid'
  return capped(settings.effects.tier, material.cap)
}

/** Why the tier in effect is 实色 although the user chose glass (null: it is not forced). For the settings page. */
export function solidReason(): 'projector' | 'effectsOff' | 'transparency' | 'contrast' | null {
  if (settings.effects.tier === 'solid') return null
  if (settings.projector) return 'projector'
  if (settings.effects.quality === 'off') return 'effectsOff'
  if (solidSurfaces()) return 'transparency'
  return sysEnv.moreContrast ? 'contrast' : null
}

/** Forget the automatic step of this run (the user asked for the chosen tier again). */
export function restoreTier() { material.cap = null; material.notice = null }

// ---- Frame budget ----

/** Length of a sampling window (ms), the frame interval its 95th percentile may reach (ms), and the timer tolerance. */
export const FRAME_WINDOW_MS = 2000
export const FRAME_LIMIT_MS = 20
/** A 50 Hz display delivers 20.0 ms frames with a little timer noise; it is not slow. */
export const FRAME_TOLERANCE_MS = 1
/** An interval this long is a hidden tab or a stopped debugger, not a frame. */
const GAP_MS = 1000
/** A window with fewer frames than this (about 5 fps) is not judged by a percentile: it is far too slow. */
const MIN_SAMPLES = 10

/** 95th percentile of a list of intervals (nearest rank); 0 for an empty list. */
export function percentile95(intervals: readonly number[]): number {
  if (!intervals.length) return 0
  const sorted = [...intervals].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)]
}

/**
 * Collects frame intervals into consecutive windows of `windowMs`; `push` returns the 95th percentile of a window when
 * that window is full and over the limit, else null. A gap (hidden tab) starts a new window.
 */
export class FrameBudget {
  private samples: number[] = []
  private sum = 0
  constructor(readonly windowMs = FRAME_WINDOW_MS, readonly limitMs = FRAME_LIMIT_MS + FRAME_TOLERANCE_MS) {}

  reset() { this.samples = []; this.sum = 0 }

  push(dt: number): number | null {
    if (!(dt > 0) || dt >= GAP_MS) { this.reset(); return null }
    this.samples.push(dt)
    this.sum += dt
    if (this.sum < this.windowMs) return null
    const p = this.samples.length < MIN_SAMPLES ? Math.max(...this.samples) : percentile95(this.samples)
    this.reset()
    return p > this.limitMs ? p : null
  }
}

/**
 * Step the tier in effect down once because a window was over budget. Returns the new tier, or null when there is
 * nothing to step down from (already 实色, or 实色 for another reason).
 */
export function degradeTier(p95: number, forceSolid = false): GlassTier | null {
  const now = effectiveTier(forceSolid)
  const next = lowerTier(now)
  if (!next) return null
  material.cap = next
  material.p95 = p95
  material.notice = next
  return next
}

let raf = 0
let last = 0
const budget = new FrameBudget()

/**
 * Watch the frame time while `playing()` is true (called by the appearance driver whenever playback starts or stops).
 * Nothing runs while the simulation rests, while the page is hidden or once the tier is 实色.
 */
export function watchFrames(playing: boolean, onStep?: (tier: GlassTier) => void) {
  if (typeof requestAnimationFrame !== 'function') return
  if (!playing || effectiveTier() === 'solid') { if (raf) cancelAnimationFrame(raf); raf = 0; budget.reset(); return }
  if (raf) return
  last = 0
  const tick = (t: number) => {
    raf = 0
    if (last) {
      const over = sysEnv.hidden ? (budget.reset(), null) : budget.push(t - last)
      if (over !== null) { const tier = degradeTier(over); if (tier) onStep?.(tier) }
    }
    last = t
    if (effectiveTier() !== 'solid') raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
}
