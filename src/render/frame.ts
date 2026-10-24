/**
 * One rendered frame of a recording at a continuous time, shared by the viewport, the monitor page, the video
 * exporter and the courseware/report image exporters, so every output looks the same.
 *
 * Effects (motion blur, particles, trails) are purely visual and are derived from recorded data only: they
 * never change the state that numbers are read from.
 */
import type { Recording, Segment } from '../core/solver/simulation'
import { exactStateAt } from '../core/solver/simulation'
import { solveMode } from '../core/solver/dynamics'
import type { AnnotationDef } from '../core/scene/types'
import type { UnitChoice } from '../units/units'
import type { Camera, DrawLayers, DrawOptions, Palette } from './renderer'
import { computeTrajectories, drawScene } from './renderer'
import { displayStateAt } from './interp'
import type { FrameEffects } from './effects'
import { drawMotionBlur, drawParticles, drawTrails } from './effects'
import type { RenderStyle } from './style'

export type { FrameEffects } from './effects'
export { PROJECTOR_STYLE, DEFAULT_STYLE } from './style'
export type { RenderStyle } from './style'

/** Input of renderFrame. */
export interface FrameInput {
  rec: Recording
  /** Simulated time (s). */
  time: number
  options: DrawOptions
  palette: Palette
  /** Significant digits of the numbers drawn. */
  digits: number
  /** Arrow scales: pixels per m/s, per m/s², per N. */
  scales: { v: number; a: number; f: number }
  trajectories: Map<string, Float64Array> | null
  selectedId?: string | null
  hoverId?: string | null
  /** Exact states (one integration step from the nearest frame) instead of interpolated ones: use for exports. */
  exact?: boolean
  effects?: FrameEffects | null
  annotations?: AnnotationDef[]
  /** Highlighted annotation (editor selection). */
  selectedAnnotation?: string | null
  /** Display units of the numbers on the canvas (SI when absent). */
  units?: UnitChoice | null
  /** Font and line scale; `PROJECTOR_STYLE` for projector mode. */
  style?: RenderStyle | null
}

/** Segment containing t: the last one with t0 ≤ t (binary search; segments are sorted). */
export function segmentAtTime(rec: Recording, t: number): Segment {
  const s = rec.segments
  let lo = 0, hi = s.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid].t0 <= t) lo = mid + 1; else hi = mid }
  return s[Math.max(0, lo - 1)]
}

/** Draw the recording at `input.time`. Returns the state that was drawn. */
export function renderFrame(ctx: CanvasRenderingContext2D, cam: Camera, input: FrameInput): Float64Array {
  const { rec } = input
  const tMax = (rec.frameCount - 1) * rec.dt
  const t = Math.max(0, Math.min(tMax, input.time))
  const X = input.exact ? exactStateAt(rec, t) : displayStateAt(rec, t)
  const seg = segmentAtTime(rec, t)
  const sol = solveMode(rec.system, X, seg.mode)
  const frame = Math.min(rec.frameCount - 1, Math.floor(t / rec.dt + 1e-9))
  const fx = input.effects
  let layers: DrawLayers | null = null
  if (fx) {
    const blur = fx.motionBlur && fx.shutterSeconds > 0
    const trails = fx.trails && fx.trailSeconds > 0
    if (blur || trails || fx.particles) {
      layers = {}
      if (blur || trails) {
        layers.underBodies = (c, poses) => {
          if (trails) drawTrails(c, cam, rec, t, fx.trailSeconds, input.trajectories ?? computeTrajectories(rec), poses)
          if (blur) drawMotionBlur(c, cam, rec, t, fx.shutterSeconds, X)
        }
      }
      if (fx.particles) layers.overBodies = c => { drawParticles(c, cam, rec, t, input.palette) }
    }
  }
  drawScene(ctx, cam, {
    sys: rec.system, X, mode: seg.mode, sol, rec, frame, time: t, options: input.options,
    selectedId: input.selectedId ?? null, hoverId: input.hoverId ?? null, palette: input.palette, scales: input.scales,
    trajectories: input.trajectories, editing: false, pending: null, digits: input.digits,
    units: input.units, style: input.style, annotations: input.annotations ?? null, selectedAnnotation: input.selectedAnnotation ?? null, layers
  })
  return X
}
