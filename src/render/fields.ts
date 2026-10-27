/**
 * Electric and magnetic fields on the canvas (26.54, D78–D79): the symbols of the uniform fields (parallel dashed
 * field lines with arrowheads for E, a grid of ⊙ or × for B), the sign of every charged body, and the field lines
 * and equipotential lines of the charges computed by the core (`fieldMap`, engine/labs.ts). Purely visual: the
 * field map comes from Rust, this module only maps it to the screen.
 */
import type { Camera, Palette } from './renderer'
import { toScreen, toWorld } from './renderer'
import type { SceneSettings } from '../core/scene/types'
import type { BodyModel, System } from '../engine/model'
import type { Pose } from '../engine/views'
import type { FieldMap, FieldSources } from '../engine/labs'
import { fieldMap } from '../engine/labs'
import { COULOMB_K } from '../core/scene/types'
import { font, lw } from './style'

/** Uniform fields of a scene: dashed lines along E with arrowheads, and ⊙ / × marks for B. */
export function drawUniformFields(ctx: CanvasRenderingContext2D, cam: Camera, st: SceneSettings, P: Palette) {
  const col = P.electric ?? '#0f766e'
  if (st.electric) {
    const { x: ex, y: ey } = st.electric.E
    const m = Math.hypot(ex, ey)
    if (m > 0) {
      // screen direction of E and the perpendicular spacing
      const ux = ex / m, uy = -ey / m
      const nx = -uy, ny = ux
      const gap = 72
      const diag = Math.hypot(cam.width, cam.height)
      const cx = cam.width / 2, cy = cam.height / 2
      ctx.save()
      ctx.strokeStyle = col; ctx.fillStyle = col
      ctx.globalAlpha = 0.28
      ctx.lineWidth = lw(1.2)
      ctx.setLineDash([7, 6])
      // lines anchored to the world so they do not swim when the view moves
      const o = toScreen(cam, 0, 0)
      const off = ((o[0] - cx) * nx + (o[1] - cy) * ny) % gap
      for (let k = -Math.ceil(diag / gap); k <= Math.ceil(diag / gap); k++) {
        const d = k * gap + off
        const px = cx + nx * d, py = cy + ny * d
        ctx.beginPath(); ctx.moveTo(px - ux * diag, py - uy * diag); ctx.lineTo(px + ux * diag, py + uy * diag); ctx.stroke()
      }
      ctx.setLineDash([])
      // arrowheads along each line, staggered
      for (let k = -Math.ceil(diag / gap); k <= Math.ceil(diag / gap); k++) {
        const d = k * gap + off
        for (let j = -4; j <= 4; j++) {
          const s = j * 160 + (k % 2) * 80
          const px = cx + nx * d + ux * s, py = cy + ny * d + uy * s
          if (px < -10 || py < -10 || px > cam.width + 10 || py > cam.height + 10) continue
          ctx.beginPath()
          ctx.moveTo(px + ux * 6, py + uy * 6)
          ctx.lineTo(px - ux * 4 + nx * 4, py - uy * 4 + ny * 4)
          ctx.lineTo(px - ux * 4 - nx * 4, py - uy * 4 - ny * 4)
          ctx.closePath(); ctx.fill()
        }
      }
      ctx.restore()
    }
  }
  if (st.magnetic && st.magnetic.B !== 0) {
    const out = st.magnetic.B > 0
    const gap = 56
    const o = toScreen(cam, 0, 0)
    const ox = ((o[0] % gap) + gap) % gap, oy = ((o[1] % gap) + gap) % gap
    ctx.save()
    ctx.strokeStyle = P.magnetic ?? '#a16207'; ctx.fillStyle = P.magnetic ?? '#a16207'
    ctx.globalAlpha = 0.32
    ctx.lineWidth = lw(1.1)
    for (let x = ox - gap / 2; x < cam.width + gap; x += gap) {
      for (let y = oy - gap / 2; y < cam.height + gap; y += gap) {
        if (out) {
          ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke()
          ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill()
        } else {
          ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke()
        }
      }
    }
    ctx.restore()
  }
}

/** The charge sign drawn on a body (+ red, − blue), with a ring when the body is fixed. */
export function drawChargeSign(ctx: CanvasRenderingContext2D, cam: Camera, b: BodyModel, pose: Pose, P: Palette) {
  const q = b.def.charge ?? 0
  if (!q) return
  const [sx, sy] = toScreen(cam, b.dynamic ? pose.x : (b.gravPos?.x ?? pose.x), b.dynamic ? pose.y : (b.gravPos?.y ?? pose.y))
  const col = q > 0 ? P.positive ?? '#dc2626' : P.negative ?? '#2563eb'
  const r = Math.max(7, Math.min(13, 0.45 * b.bound * cam.ppm))
  ctx.save()
  ctx.fillStyle = P.bg
  ctx.globalAlpha = 0.85
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
  ctx.strokeStyle = col; ctx.lineWidth = lw(1.6)
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke()
  const h = r * 0.55
  ctx.lineWidth = lw(2)
  ctx.beginPath(); ctx.moveTo(sx - h, sy); ctx.lineTo(sx + h, sy)
  if (q > 0) { ctx.moveTo(sx, sy - h); ctx.lineTo(sx, sy + h) }
  ctx.stroke()
  ctx.restore()
}

/** Sources of the field of a frame: every charged body at its current position, the uniform field, k. */
export function frameSources(sys: System, poses: Pose[]): FieldSources | null {
  const st = sys.model.settings
  const charges = sys.model.bodies.filter(b => b.def.charge).map(b => {
    const p = b.dynamic ? poses[b.global] : (b.gravPos ?? poses[b.global])
    return { x: p.x, y: p.y, q: b.def.charge!, r: Math.max(b.bound, 1e-6) }
  })
  if (!charges.length && !st.electric) return null
  return { charges, E: st.electric?.E ?? { x: 0, y: 0 }, k: st.coulomb?.k ?? COULOMB_K }
}

// One cached map per canvas: recomputed when the charges or the view change noticeably
const cache = new WeakMap<object, { key: string; map: FieldMap }>()

/** Field map of the visible region (cached; null without charges). */
export function visibleFieldMap(owner: object, cam: Camera, src: FieldSources | null, levels: boolean): FieldMap | null {
  if (!src || !src.charges.length) return null
  const a = toWorld(cam, 0, cam.height), b = toWorld(cam, cam.width, 0)
  const step = 4 / cam.ppm
  const r = (v: number) => Math.round(v / step)
  const key = [r(a.x), r(a.y), r(b.x), r(b.y), levels ? 1 : 0, ...src.charges.flatMap(c => [r(c.x), r(c.y), c.q, c.r]), src.E?.x ?? 0, src.E?.y ?? 0, src.k ?? 0].join(',')
  const hit = cache.get(owner)
  if (hit && hit.key === key) return hit.map
  const map = fieldMap(src, { x0: a.x, y0: a.y, x1: b.x, y1: b.y }, { perCharge: 12, grid: 110, levels: levels ? 9 : 0 })
  cache.set(owner, { key, map })
  return map
}

/** Draw field lines (with arrowheads) and equipotential lines. */
export function drawFieldMap(ctx: CanvasRenderingContext2D, cam: Camera, map: FieldMap, P: Palette, lines: boolean, equipotentials: boolean) {
  const col = P.electric ?? '#0f766e'
  ctx.save()
  if (equipotentials) {
    ctx.strokeStyle = P.text2
    ctx.globalAlpha = 0.5
    ctx.lineWidth = lw(1)
    ctx.setLineDash([3, 3])
    const { segs, starts } = map.contours
    ctx.beginPath()
    for (let s = 0; s < (starts[starts.length - 1] ?? 0); s++) {
      const [x0, y0] = toScreen(cam, segs[4 * s], segs[4 * s + 1]), [x1, y1] = toScreen(cam, segs[4 * s + 2], segs[4 * s + 3])
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1)
    }
    ctx.stroke()
    ctx.setLineDash([])
  }
  if (lines) {
    ctx.strokeStyle = col; ctx.fillStyle = col
    ctx.globalAlpha = 0.6
    ctx.lineWidth = lw(1.3)
    const { xy, starts } = map.lines
    for (let i = 0; i + 1 < starts.length; i++) {
      const a = starts[i], b = starts[i + 1]
      if (b - a < 2) continue
      ctx.beginPath()
      let len = 0
      let [px, py] = toScreen(cam, xy[2 * a], xy[2 * a + 1])
      ctx.moveTo(px, py)
      const marks: Array<[number, number, number, number]> = []
      let next = 60
      for (let k = a + 1; k < b; k++) {
        const [sx, sy] = toScreen(cam, xy[2 * k], xy[2 * k + 1])
        const d = Math.hypot(sx - px, sy - py)
        len += d
        if (len >= next && d > 0) { marks.push([sx, sy, (sx - px) / d, (sy - py) / d]); next += 140 }
        ctx.lineTo(sx, sy)
        px = sx; py = sy
      }
      ctx.stroke()
      for (const [x, y, ux, uy] of marks) {
        if (x < 0 || y < 0 || x > cam.width || y > cam.height) continue
        ctx.beginPath()
        ctx.moveTo(x + ux * 5, y + uy * 5)
        ctx.lineTo(x - ux * 4 - uy * 3.5, y - uy * 4 + ux * 3.5)
        ctx.lineTo(x - ux * 4 + uy * 3.5, y - uy * 4 - ux * 3.5)
        ctx.closePath(); ctx.fill()
      }
    }
  }
  ctx.restore()
}

/** Label of the uniform fields in a corner of the canvas ("E = … V/m →", "B = … T ⊙"). */
export function fieldLegend(ctx: CanvasRenderingContext2D, cam: Camera, st: SceneSettings, P: Palette, fmt: (v: number, unit: string) => string) {
  const parts: string[] = []
  if (st.electric) {
    const m = Math.hypot(st.electric.E.x, st.electric.E.y)
    if (m > 0) parts.push(`E = ${fmt(m, 'V/m')}`)
  }
  if (st.magnetic && st.magnetic.B !== 0) parts.push(`B = ${fmt(Math.abs(st.magnetic.B), 'T')} ${st.magnetic.B > 0 ? '⊙' : '⊗'}`)
  if (!parts.length) return
  ctx.save()
  ctx.font = font(12)
  const text = parts.join('   ')
  const w = ctx.measureText(text).width
  ctx.fillStyle = P.labelBg
  ctx.fillRect(cam.width - w - 22, 10, w + 12, 22)
  ctx.fillStyle = P.electric ?? P.text
  ctx.fillText(text, cam.width - w - 16, 26)
  ctx.restore()
}
