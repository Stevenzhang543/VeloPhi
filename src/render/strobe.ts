/**
 * Stroboscopic picture (manual 26.50, D33): the textbook "频闪照片" — the bodies drawn at the instants t − n·τ
 * (n = 1 … N) as semi-transparent outlines, older images fainter, optionally with their times. It is another way
 * of drawing the recording, not new data: every image is the exact state at its instant (`exactStateAt`, one
 * integration step from the nearest frame), so the spacing of the images shows the motion as a real
 * stroboscope would. Exports draw it the same way (render/frame.ts).
 */
import type { Recording } from '../core/solver/simulation'
import { exactStateAt } from '../core/solver/simulation'
import { computePoses } from '../core/solver/kinematics'
import type { Camera, Palette } from './renderer'
import { bodyPath, tag, toScreen } from './renderer'
import { font, lw } from './style'

/** Stroboscope parameters. */
export interface StrobeOptions {
  /** Flash interval τ (s). */
  interval: number
  /** Number of earlier images N. */
  count: number
  /** Opacity of the newest earlier image (0–1); older ones fade linearly. */
  opacity: number
  /** Write the time of every image. */
  labels: boolean
}

/** Defaults: τ = 0.1 s, N = 10 (manual D33). */
export const STROBE_DEFAULTS: StrobeOptions = { interval: 0.1, count: 10, opacity: 0.55, labels: false }

/** Most images drawn, whatever the settings say (keeps a frame cheap). */
export const STROBE_MAX = 60

/**
 * Instants of the images before t, newest first: t − n·τ for n = 1 … N, those ≥ 0. With `aligned`, the instants
 * are the multiples of τ before t instead (a fixed stroboscope: the images do not move during playback).
 */
export function strobeTimes(t: number, o: StrobeOptions, aligned = true): number[] {
  const tau = o.interval
  if (!(tau > 0) || !(o.count >= 1)) return []
  const N = Math.min(STROBE_MAX, Math.floor(o.count))
  const out: number[] = []
  // A fixed grid k·τ: k·τ computed as a product (not by repeated subtraction) so the instants are exact multiples
  let k = aligned ? Math.floor(t / tau + 1e-9) : 0
  if (aligned && Math.abs(k * tau - t) < 1e-9 * Math.max(1, t)) k--
  for (let n = 1; n <= N; n++) {
    const tn = aligned ? (k - n + 1) * tau : t - n * tau
    if (tn < -1e-12) break
    out.push(Math.max(0, tn))
  }
  return out
}

/** Opacity of image n (1 = newest) of N. */
export function strobeAlpha(n: number, N: number, opacity: number): number {
  return Math.max(0, Math.min(1, opacity)) * (1 - (n - 1) / Math.max(1, N))
}

/** Draw the stroboscopic images of the moving bodies before time t (under the sharp frame). */
export function drawStrobe(ctx: CanvasRenderingContext2D, cam: Camera, rec: Recording, t: number, o: StrobeOptions, P: Palette) {
  const model = rec.system.model
  if (model.dynamic.length === 0) return
  const tMax = (rec.frameCount - 1) * rec.dt
  const times = strobeTimes(Math.min(t, tMax), o)
  const N = times.length
  // Oldest first, so newer images are drawn on top
  for (let i = N - 1; i >= 0; i--) {
    const tn = times[i]
    const X = exactStateAt(rec, tn)
    const poses = computePoses(model, X)
    const alpha = strobeAlpha(i + 1, N, o.opacity)
    for (const b of model.dynamic) {
      bodyPath(ctx, cam, b, poses[b.global])
      ctx.globalAlpha = alpha * 0.45
      ctx.fillStyle = b.def.color
      ctx.fill()
      ctx.globalAlpha = alpha
      ctx.strokeStyle = b.def.color
      ctx.lineWidth = lw(1.2)
      ctx.stroke()
    }
    if (o.labels) {
      const b = model.dynamic[0], p = poses[b.global]
      const [sx, sy] = toScreen(cam, p.x, p.y)
      ctx.globalAlpha = Math.max(0.5, alpha)
      tag(ctx, sx, sy - b.bound * cam.ppm - 12, `${tn.toFixed(2)} s`, b.def.color, P, font(10))
    }
  }
  ctx.globalAlpha = 1
}
