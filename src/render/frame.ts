/**
 * One rendered frame of a recording at a continuous time, shared by the viewport, the monitor page, the video
 * exporter and the courseware/report image exporters, so every output looks the same.
 *
 * Effects (motion blur, particles, trails) are purely visual and are derived from recorded data only: they
 * never change the state that numbers are read from.
 */
import type { Recording, Segment } from '../engine/recording'
import type { FrameView } from '../engine/views'
import { frameView } from '../engine/views'
import type { AnnotationDef } from '../core/scene/types'
import type { UnitChoice } from '../units/units'
import type { Camera, DrawLayers, DrawOptions, Palette, Trajectories } from './renderer'
import { drawScene } from './renderer'
import type { FrameEffects } from './effects'
import { drawMotionBlur, drawParticles, drawTrails } from './effects'
import { STROBE_DEFAULTS, drawStrobe } from './strobe'
import type { RenderStyle } from './style'
import type { Highlight } from '../formula/panel'

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
  trajectories: Trajectories | null
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
  /** What a hovered formula refers to (26.53, D72). */
  highlight?: Highlight | null
}

/** Segment containing t: the last one with t0 ≤ t (binary search; segments are sorted). */
export function segmentAtTime(rec: Recording, t: number): Segment {
  const s = rec.segments
  let lo = 0, hi = s.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid].t0 <= t) lo = mid + 1; else hi = mid }
  return s[Math.max(0, lo - 1)]
}

/** Draw the recording at `input.time`. Returns the view that was drawn. */
export function renderFrame(ctx: CanvasRenderingContext2D, cam: Camera, input: FrameInput): FrameView {
  const { rec } = input
  const tMax = (rec.frameCount - 1) * rec.dt
  const t = Math.max(0, Math.min(tMax, input.time))
  const op = input.options
  // Forces of the overlay, and of the bodies a hovered formula refers to (D72)
  const hl = input.highlight
  const lit = hl && (hl.forces.length || hl.angle.length) ? hl.bodies : []
  const own = op.forces && input.selectedId && !op.forcesAll ? [input.selectedId] : []
  const forces = op.forces && op.forcesAll ? 'all' : own.length || lit.length ? [...own, ...lit] : null
  const view = frameView(rec, t, { exact: !!input.exact, forces })
  const frame = Math.max(0, view.frame)
  const fx = input.effects
  let layers: DrawLayers | null = null
  if (op.strobe) {
    const so = { interval: op.strobeInterval ?? STROBE_DEFAULTS.interval, count: op.strobeCount ?? STROBE_DEFAULTS.count, opacity: op.strobeOpacity ?? STROBE_DEFAULTS.opacity, labels: op.strobeLabels ?? STROBE_DEFAULTS.labels }
    layers = { underBodies: c => { drawStrobe(c, cam, rec, t, so, input.palette) } }
  }
  if (fx) {
    const blur = fx.motionBlur && fx.shutterSeconds > 0
    const trails = fx.trails && fx.trailSeconds > 0
    if (blur || trails || fx.particles) {
      layers ??= {}
      if (blur || trails) {
        const strobe = layers.underBodies
        layers.underBodies = (c, poses) => {
          if (strobe) { strobe(c, poses); c.globalAlpha = 1 }
          if (trails) drawTrails(c, cam, rec, t, fx.trailSeconds, poses)
          if (blur) drawMotionBlur(c, cam, rec, t, fx.shutterSeconds, poses)
        }
      }
      if (fx.particles) layers.overBodies = c => { drawParticles(c, cam, rec, t, input.palette) }
    }
  }
  drawScene(ctx, cam, {
    sys: rec.system, view, rec, frame, time: t, options: input.options,
    selectedId: input.selectedId ?? null, hoverId: input.hoverId ?? null, palette: input.palette, scales: input.scales,
    trajectories: input.trajectories, editing: false, pending: null, digits: input.digits,
    units: input.units, style: input.style, annotations: input.annotations ?? null, selectedAnnotation: input.selectedAnnotation ?? null, layers,
    highlight: hl ?? null
  })
  return view
}
