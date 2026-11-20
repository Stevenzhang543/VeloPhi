/**
 * The points editing snaps to in the viewport — the grid, object features and surfaces (the snapping itself is in
 * editor/snap.ts and editor/objectSnap.ts) — and the feedback on the canvas: the guides of the snap in effect and the
 * short ring a contact sends out when it engages.
 */
import { state } from '../../store'
import { calmMotion, settings } from '../../settings'
import { featurePointsOf } from '../../../engine/views'
import type { BodyDef } from '../../../core/scene/types'
import type { OverlayShape } from '../../../render/overlay'
import type { Pt } from '../../editor/geometry'
import { bodyBounds } from '../../editor/geometry'
import { featureSnap, snapOn, snapPoint } from '../../editor/snap'
import type { ContactSnap } from '../../editor/objectSnap'
import { sceneFeatures, snapPointToObjects } from '../../editor/objectSnap'
import type { ViewportCore } from './state'

/** How long the ring of an engaging contact lasts (ms). */
export const PULSE_MS = 280

export interface SnapFeedback {
  /** Snap feedback (26.52, D57): the contact points whose ring is running, and when it started. */
  pulse: { start: number; pts: Pt[] }
  /** Guide shapes of contact snaps: the target surface and the contact point. */
  contactGuides(contacts: ContactSnap[]): OverlayShape[]
  /**
   * Point used for editing (handles, creation corners, text): the grid when grid snapping is on, else object
   * features and surfaces nearby (D47), else the pointer itself. Alt bypasses both. Sets the snap guides.
   */
  editPoint(p: Pt, alt: boolean, exclude?: ReadonlySet<string>): Pt
  /** Measuring tools snap to object features first, then to the grid. */
  measureSnap(p: Pt, alt: boolean): Pt
}

/** Width and height of a body's bounds (m). */
export function bodySize(def: BodyDef): [number, number] {
  const b = bodyBounds(def)
  return [b.maxX - b.minX, b.maxY - b.minY]
}

export function useSnap(vp: ViewportCore): SnapFeedback {
  let pulseKeys = ''
  const pulse = { start: 0, pts: [] as Pt[] }

  function contactGuides(contacts: ContactSnap[]): OverlayShape[] {
    const keys = contacts.map(c => c.key).join('|')
    if (keys && keys !== pulseKeys && !calmMotion()) { pulse.start = performance.now(); pulse.pts = contacts.map(c => c.at) }
    pulseKeys = keys
    const out: OverlayShape[] = []
    for (const c of contacts) {
      if ('a' in c.surface) out.push({ kind: 'line', a: c.surface.a, b: c.surface.b, dashed: true })
      else if (c.surface.r > 0) out.push({ kind: 'circle', c: c.surface.c, r: c.surface.r, dashed: true })
      out.push({ kind: 'circle', c: c.at, r: 3 / vp.cam.value.ppm, fill: true })
    }
    return out
  }

  function editPoint(p: Pt, alt: boolean, exclude: ReadonlySet<string> = new Set()): Pt {
    const ppm = vp.cam.value.ppm
    if (snapOn(alt)) { const q = snapPoint(p, ppm, alt); vp.snapGuides.value = []; return q }
    if (alt || !settings.editor.objectSnap) { vp.snapGuides.value = []; return { x: p.x, y: p.y } }
    const s = snapPointToObjects(state.scene, sceneFeatures(state.scene, exclude), p, ppm, exclude)
    if (!s) { vp.snapGuides.value = []; return { x: p.x, y: p.y } }
    const g: OverlayShape[] = []
    if (s.surface && 'a' in s.surface) g.push({ kind: 'line', a: s.surface.a, b: s.surface.b, dashed: true })
    vp.snapGuides.value = g
    return s.p
  }

  function measureSnap(p: Pt, alt: boolean): Pt {
    if (!alt) {
      const cp = vp.currentPoses()
      if (cp) { const f = featureSnap(featurePointsOf(cp.session, cp.t), p, vp.cam.value.ppm); if (f) return f }
    }
    return snapPoint(p, vp.cam.value.ppm, alt)
  }

  return { pulse, contactGuides, editPoint, measureSnap }
}
