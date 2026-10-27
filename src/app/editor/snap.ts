/**
 * Grid snapping. The step is `settings.editor.snapStep` (m) or, when that is 0, the minor grid step visible
 * at the current zoom, so what you snap to is what you see. Holding Alt bypasses snapping. Measuring tools
 * additionally snap to object features (centres, vertices, pulley axles) near the cursor.
 */
import { settings } from '../settings'
import { minorGridStep } from '../../render/renderer'
import type { Pt } from './geometry'

/** Snap step (m) at zoom `ppm` (px/m). */
export function snapStep(ppm: number): number {
  const s = settings.editor.snapStep
  return s > 0 ? s : minorGridStep(ppm)
}

/** Whether snapping applies: on in the settings and Alt not held. */
export function snapOn(alt: boolean): boolean { return settings.editor.snap && !alt }

/** Round to the step, without floating noise (0.30000000000000004 → 0.3). */
export function roundTo(v: number, step: number): number {
  const r = Math.round(v / step) * step
  const digits = Math.max(0, Math.min(12, Math.ceil(-Math.log10(step)) + 3))
  return Number(r.toFixed(digits))
}

/** A world point snapped to the grid (unchanged when snapping is off). */
export function snapPoint(p: Pt, ppm: number, alt: boolean): Pt {
  if (!snapOn(alt)) return { x: p.x, y: p.y }
  const s = snapStep(ppm)
  return { x: roundTo(p.x, s), y: roundTo(p.y, s) }
}

/** A length snapped to the step (at least one step). */
export function snapLength(v: number, ppm: number, alt: boolean): number {
  if (!snapOn(alt)) return v
  const s = snapStep(ppm)
  return Math.max(s, roundTo(v, s))
}

/** Feature points (centres, vertices, pulley axles, fixed anchors) come from the core: engine/views.ts `featurePointsOf`. */

/** Nearest feature point within `tolPx` screen pixels, or null. */
export function featureSnap(points: Pt[], p: Pt, ppm: number, tolPx = 9): Pt | null {
  let best: Pt | null = null, bd = tolPx / ppm
  for (const f of points) {
    const d = Math.hypot(f.x - p.x, f.y - p.y)
    if (d <= bd) { bd = d; best = f }
  }
  return best ? { x: best.x, y: best.y } : null
}
