/**
 * Editor overlay: handles, creation previews, dimension labels and the snap marker, drawn over the scene in
 * the studio viewport. The editor builds an `EditorOverlay` (world coordinates, labels already formatted in
 * display units); this module only draws it. Handle sizes are in screen pixels so they stay grabbable at any
 * zoom.
 */
import type { Camera, Palette } from './renderer'
import { tag, toScreen } from './renderer'
import { MONO, font, lw } from './style'

/** A world point (m). */
export interface Pt { x: number; y: number }

/** An outline drawn by the editor (world coordinates; an arc's radius is in screen pixels). */
export type OverlayShape =
  | { kind: 'poly'; pts: Pt[]; closed: boolean; invalid?: boolean; fill?: boolean; dashed?: boolean }
  | { kind: 'circle'; c: Pt; r: number; invalid?: boolean; fill?: boolean; dashed?: boolean }
  | { kind: 'line'; a: Pt; b: Pt; dashed?: boolean; invalid?: boolean }
  | { kind: 'arc'; c: Pt; rPx: number; from: number; to: number }

/** Kind of a handle: corners and edges are squares, vertices diamonds, the rest circles. */
export type HandleKind = 'corner' | 'edge' | 'rotate' | 'radius' | 'vertex' | 'point'

/** A draggable handle. */
export interface OverlayHandle {
  at: Pt
  kind: HandleKind
  /** Being dragged. */
  active?: boolean
  /** Under the cursor. */
  hot?: boolean
  /** World angle (rad) of square handles, so they turn with the body. */
  angle?: number
}

/** A dimension label (text already in display units). */
export interface OverlayLabel {
  at: Pt
  text: string
  /** Screen offset (px) from the anchor. */
  dx?: number
  dy?: number
  /** Centre the label on the anchor. */
  center?: boolean
  invalid?: boolean
}

/** Everything the editor draws over the scene. */
export interface EditorOverlay {
  shapes: OverlayShape[]
  handles: OverlayHandle[]
  labels: OverlayLabel[]
  /** Stem from the shape to the rotation handle. */
  stem?: { from: Pt; to: Pt } | null
  /** Snapped point under the cursor. */
  snap?: Pt | null
}

/** An overlay with nothing to draw. */
export function emptyOverlay(): EditorOverlay { return { shapes: [], handles: [], labels: [], stem: null, snap: null } }

/** Handle radius in screen pixels (hit testing uses a little more). */
export const HANDLE_PX = 4.5

const INVALID = '#ef4444'

/** Draw the editor overlay over the scene. */
export function drawEditorOverlay(ctx: CanvasRenderingContext2D, cam: Camera, ov: EditorOverlay, P: Palette) {
  ctx.save()
  for (const s of ov.shapes) {
    const color = 'invalid' in s && s.invalid ? INVALID : P.accent
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = lw(1.6)
    ctx.setLineDash('dashed' in s && s.dashed ? [6, 4] : [])
    ctx.beginPath()
    if (s.kind === 'poly') {
      s.pts.forEach((p, i) => { const [x, y] = toScreen(cam, p.x, p.y); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) })
      if (s.closed) ctx.closePath()
    } else if (s.kind === 'circle') {
      const [x, y] = toScreen(cam, s.c.x, s.c.y)
      ctx.arc(x, y, Math.max(1, s.r * cam.ppm), 0, Math.PI * 2)
    } else if (s.kind === 'line') {
      const [x0, y0] = toScreen(cam, s.a.x, s.a.y), [x1, y1] = toScreen(cam, s.b.x, s.b.y)
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1)
    } else {
      const [x, y] = toScreen(cam, s.c.x, s.c.y)
      let diff = s.to - s.from
      while (diff > Math.PI) diff -= 2 * Math.PI
      while (diff < -Math.PI) diff += 2 * Math.PI
      ctx.arc(x, y, s.rPx, -s.from, -s.from - diff, diff > 0)
    }
    if ('fill' in s && s.fill) {
      ctx.globalAlpha = 0.1
      ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.stroke()
  }
  ctx.setLineDash([])
  if (ov.stem) {
    const [x0, y0] = toScreen(cam, ov.stem.from.x, ov.stem.from.y), [x1, y1] = toScreen(cam, ov.stem.to.x, ov.stem.to.y)
    ctx.strokeStyle = P.accent
    ctx.lineWidth = lw(1)
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
  }
  for (const h of ov.handles) {
    const [x, y] = toScreen(cam, h.at.x, h.at.y)
    const r = HANDLE_PX * (h.hot || h.active ? 1.25 : 1)
    ctx.lineWidth = lw(1.5)
    ctx.strokeStyle = P.accent
    ctx.fillStyle = h.active ? P.accent : P.bg
    ctx.beginPath()
    if (h.kind === 'corner' || h.kind === 'edge') {
      const a = -(h.angle ?? 0), c = Math.cos(a) * r, s = Math.sin(a) * r
      ctx.moveTo(x - c + s, y - s - c); ctx.lineTo(x + c + s, y + s - c); ctx.lineTo(x + c - s, y + s + c); ctx.lineTo(x - c - s, y - s + c); ctx.closePath()
    }
    else if (h.kind === 'vertex') { ctx.moveTo(x, y - r - 1); ctx.lineTo(x + r + 1, y); ctx.lineTo(x, y + r + 1); ctx.lineTo(x - r - 1, y); ctx.closePath() }
    else ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    if (h.kind === 'rotate') {
      // A small turning arrow inside the rotation handle
      ctx.beginPath(); ctx.arc(x, y, r * 0.5, -Math.PI * 0.9, Math.PI * 0.4); ctx.stroke()
    }
    if (h.hot && !h.active) {
      ctx.globalAlpha = 0.25
      ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.fillStyle = P.accent; ctx.fill()
      ctx.globalAlpha = 1
    }
  }
  const f = font(11, MONO)
  for (const l of ov.labels) {
    const [x, y] = toScreen(cam, l.at.x, l.at.y)
    ctx.font = f
    const w = ctx.measureText(l.text).width
    const bx = (l.center ? x - w / 2 : x) + (l.dx ?? 0), by = y + (l.dy ?? 0) + (l.center ? 4 : 0)
    tag(ctx, bx, by, l.text, l.invalid ? INVALID : P.accent, P, f)
  }
  if (ov.snap) {
    const [x, y] = toScreen(cam, ov.snap.x, ov.snap.y)
    ctx.strokeStyle = P.accent
    ctx.lineWidth = lw(1.2)
    ctx.beginPath()
    ctx.moveTo(x - 7, y); ctx.lineTo(x - 2, y); ctx.moveTo(x + 2, y); ctx.lineTo(x + 7, y)
    ctx.moveTo(x, y - 7); ctx.lineTo(x, y - 2); ctx.moveTo(x, y + 2); ctx.lineTo(x, y + 7)
    ctx.stroke()
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.restore()
}
