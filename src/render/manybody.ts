/**
 * Overlays of many-body scenes (26.58, D133, D137, D142): the Galton board's histogram under the board, and for
 * scenes computed with the many-body solver the contact points of the frame (recomputed from the geometry by the
 * core: position only, no force split) and a small readout — bodies, moving bodies, contact points.
 */
import type { Recording } from '../engine/recording'
import type { FrameView } from '../engine/views'
import type { Scene } from '../core/scene/types'
import type { HistogramDef } from '../templates/t2658'
import type { Camera, Palette } from './renderer'
import { toScreen } from './renderer'
import { drawHistogram, histogramCounts } from './histogram'

/** Contact points of a frame of a many-body run: [bodyA, bodyB, x, y, nx, ny, separation]. */
export function softContacts(rec: Recording, frame: number): Array<[string, string, number, number, number, number, number]> {
  try {
    return rec.session.call<{ points: Array<[string, string, number, number, number, number, number]> }>({ op: 'softContacts', frame }).points
  } catch {
    return []
  }
}

export function histogramOf(scene: Scene): HistogramDef | null {
  const h = (scene.extra as { histogram?: HistogramDef } | undefined)?.histogram
  return h && typeof h.x0 === 'number' && typeof h.bins === 'number' && h.bins > 0 && h.bins < 200 ? h : null
}

export interface ManyBodyText { readout: (bodies: number, moving: number, contacts: number) => string; histogram: (total: number, rows: number) => string }

/** Below this zoom (pixels per metre) the contact points are not drawn. */
const CONTACT_DOTS_PPM = 80

let cache: { rec: Recording | null; frame: number; points: ReturnType<typeof softContacts> } = { rec: null, frame: -1, points: [] }

export function drawManyBody(ctx: CanvasRenderingContext2D, cam: Camera, o: { rec: Recording; view: FrameView; scene: Scene; palette: Palette; show: boolean; text: ManyBodyText }) {
  const { rec, view, palette } = o
  const dyn = rec.system.model.dynamic
  const hist = histogramOf(o.scene)
  if (hist) {
    const counts = histogramCounts(hist, dyn.map(b => view.poses[b.global]))
    drawHistogram(ctx, cam, hist, counts, dyn.length, { bar: palette.accent, expected: palette.note ?? palette.applied, text: palette.text2, grid: palette.gridMajor }, o.text.histogram(dyn.length, hist.rows))
  }
  if (!o.show || rec.scene.settings.integrator !== 'softstep') return
  const frame = Math.max(0, view.frame)
  if (cache.rec !== rec || cache.frame !== frame) cache = { rec, frame, points: softContacts(rec, frame) }
  ctx.save()
  ctx.fillStyle = palette.accent
  ctx.globalAlpha = 0.8
  const r = Math.max(1.5, Math.min(3, cam.ppm * 0.01))
  // zoomed far out the dots would cover the bodies: only the readout then (D146)
  const dots = cam.ppm >= CONTACT_DOTS_PPM
  for (const p of dots ? cache.points : []) {
    if (p[6] > 0.005) continue
    const [x, y] = toScreen(cam, p[2], p[3])
    if (x < -5 || y < -5 || x > cam.width + 5 || y > cam.height + 5) continue
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill()
  }
  ctx.globalAlpha = 1
  let moving = 0
  for (const b of dyn) { const q = view.poses[b.global]; if (q.vx !== 0 || q.vy !== 0 || q.w !== 0) moving++ }
  const text = o.text.readout(dyn.length, moving, cache.points.filter(p => p[6] <= 0.005).length)
  ctx.font = '12px system-ui, sans-serif'
  const w = ctx.measureText(text).width + 16
  ctx.fillStyle = palette.labelBg
  ctx.fillRect(12, cam.height - 58, w, 22)
  ctx.fillStyle = palette.text2
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 20, cam.height - 47)
  ctx.restore()
}
