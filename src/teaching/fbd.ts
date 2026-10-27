/**
 * 26.52 free-body diagram (D62): the forces on one body at one instant, drawn as a standalone SVG in the
 * textbook way. The forces are the ones the canvas draws (the forces of the mode solution of the recording at that
 * time; 26.53: computed in the core, teaching.rs `fbd`), merged and ordered for teaching: contact points of one contact
 * unit become one normal force, forces are listed gravity first, then normal forces, friction, tensions, spring forces, drag,
 * gravitation and the rest. Whatever the list misses (gear teeth, a pulley's rope, …) is the difference
 * m·a − ΣF and is drawn as "other constraint forces", so the diagram always adds up to m·a.
 *
 * Pure module (no Vue, no DOM): the dialog, the report and the tests use it.
 */
import { tl } from '../i18n'
import type { Recording } from '../engine/recording'
import type { ShapeModel } from '../engine/model'
import { fbdOf } from '../engine/views'
import type { ForceKind, Palette } from '../render/renderer'
import { DARK, LIGHT, forceColor, forceLabel } from '../render/renderer'
import { FONT } from '../render/style'
import { formatSig } from '../units/units'

/** One force of the diagram (world coordinates, N). */
export interface FbdForce {
  kind: ForceKind | 'other'
  /** Symbol (G, N, f, T, F弹 …) and an index when several forces share it ("1", "2" …). */
  label: string
  sub: string
  /** Point of application (m). */
  x: number
  y: number
  fx: number
  fy: number
  color: string
}

/** The forces on one body at one time. */
export interface FbdData {
  bodyId: string
  name: string
  time: number
  mass: number
  /** Centre of mass (m) and orientation of the body. */
  x: number
  y: number
  c: number
  s: number
  shape: ShapeModel
  forces: FbdForce[]
  /** Sum of the forces (N); equals m·a up to rounding. */
  net: { x: number; y: number }
  /** m·a of the centre of mass (N). */
  ma: { x: number; y: number }
  /** Direction of the main contact surface (rad, the tangent of the largest normal force); null without contact. */
  incline: number | null
}

/** Forces on a dynamic body at time t of a recording; null for a static or unknown body. */
export function fbdData(rec: Recording, time: number, bodyId: string, theme: 'light' | 'dark' = 'light'): FbdData | null {
  const d = fbdOf(rec, time, bodyId)
  if (!d) return null
  const P = theme === 'dark' ? DARK : LIGHT
  return {
    bodyId: d.bodyId, name: d.name, time: d.time, mass: d.mass, x: d.x, y: d.y, c: d.c, s: d.s, shape: d.shape,
    forces: d.forces.map(f => ({ kind: f.kind, label: f.kind === 'other' ? tl(f.label) : forceLabel(f.label), sub: f.sub, x: f.x, y: f.y, fx: f.fx, fy: f.fy, color: forceColor(f.kind, P) })),
    net: d.net, ma: d.ma, incline: d.incline
  }
}

/** Options of the drawing. */
export interface FbdOptions {
  /** Forces at their actual points of application, or all at the centre of mass (concurrent forces). */
  layout: 'actual' | 'concurrent'
  /** The body as its simplified shape or as a particle (small circle). */
  body: 'shape' | 'particle'
  /** Show |F| next to each symbol. */
  magnitudes: boolean
  /** Components along the coordinate axes or along and across the main contact surface (dashed). */
  decompose: 'none' | 'axes' | 'incline'
  /** Draw the resultant force from the centre of mass. */
  resultant: boolean
  theme: 'light' | 'dark'
  digits: number
  /** Caption below the drawing (body and time); default on. */
  caption?: boolean
}

export const FBD_DEFAULTS: FbdOptions = { layout: 'actual', body: 'shape', magnitudes: true, decompose: 'none', resultant: false, theme: 'light', digits: 3 }

/** Text of a symbol with its index (plain text, for tables). */
export function fbdSymbol(f: Pick<FbdForce, 'label' | 'sub'>): string { return f.sub ? `${f.label}${f.sub}` : f.label }

/** |F| with its unit. */
export function fbdMagnitude(fx: number, fy: number, digits: number): string { return `${formatSig(Math.hypot(fx, fy), digits)} N` }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n2 = (v: number) => (Math.round(v * 100) / 100).toString()

interface Box { x0: number; y0: number; x1: number; y1: number }
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

/** Estimated text width (px) at a font size: CJK characters are about one em wide, Latin about 0.6 em. */
export function textWidth(s: string, size: number): number {
  let w = 0
  for (const ch of s) w += /[⺀-￿]/.test(ch) ? size : size * 0.6
  return w
}

/** The diagram as an SVG document with its size in CSS pixels. */
export function fbdSvg(d: FbdData, opts: FbdOptions): { svg: string; width: number; height: number } {
  const P: Palette = opts.theme === 'dark' ? DARK : LIGHT
  const bg = opts.theme === 'dark' ? P.bg : '#ffffff'
  const particle = opts.body === 'particle'
  const concurrent = particle || opts.layout === 'concurrent'

  // Body size: its largest radius about the centre of mass is drawn as 64 px
  let R = 0
  const sh = d.shape
  if (sh.kind === 'circle') R = sh.radius
  else if (sh.kind === 'polygon') for (const v of sh.verts) R = Math.max(R, Math.hypot(v.x, v.y))
  else for (const p of sh.outline) {
    if (p.kind === 'circle') R = Math.max(R, Math.hypot(p.center.x, p.center.y) + p.radius)
    else for (const v of p.verts) R = Math.max(R, Math.hypot(v.x, v.y))
  }
  const bodyPx = 64
  const s = R > 0 ? bodyPx / R : 1
  // World → drawing (origin at the centre of mass, y up; the SVG flips y at the end)
  const local = (lx: number, ly: number): [number, number] => [(d.c * lx - d.s * ly) * s, (d.s * lx + d.c * ly) * s]
  const at = (x: number, y: number): [number, number] => concurrent ? [0, 0] : [(x - d.x) * s, (y - d.y) * s]

  // Arrow scale: the largest force is 120 px; small forces keep a visible minimum length
  let fmax = 0
  for (const f of d.forces) fmax = Math.max(fmax, Math.hypot(f.fx, f.fy))
  if (opts.resultant) fmax = Math.max(fmax, Math.hypot(d.net.x, d.net.y))
  const k = fmax > 0 ? 120 / fmax : 1
  const MIN = 18
  const vec = (fx: number, fy: number): [number, number] => {
    const m = Math.hypot(fx, fy)
    if (m === 0) return [0, 0]
    const L = Math.max(MIN, m * k)
    return [fx / m * L, fy / m * L]
  }

  const parts: string[] = []
  const boxes: Box[] = []
  let minX = -bodyPx, maxX = bodyPx, minY = -bodyPx, maxY = bodyPx
  const grow = (x: number, y: number) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }

  /** Small obstacle boxes along a segment (labels keep off outlines, axes and arrows). */
  const obstacle = (x0: number, y0: number, x1: number, y1: number, step = 8, r = 3) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step))
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n
      boxes.push({ x0: x - r, x1: x + r, y0: y - r, y1: y + r })
    }
  }

  // Body
  const stroke = P.text, fill = opts.theme === 'dark' ? 'rgba(235,235,245,0.10)' : 'rgba(60,60,67,0.08)'
  if (particle) {
    parts.push(`<circle cx="0" cy="0" r="6" fill="${P.text}"/>`)
    minX = minY = -40; maxX = maxY = 40
  } else {
    const pieces = sh.kind === 'complex' ? sh.outline : sh.kind === 'circle' ? [{ kind: 'circle' as const, center: { x: 0, y: 0 }, radius: sh.radius }] : [{ kind: 'polygon' as const, verts: sh.verts }]
    for (const p of pieces) {
      if (p.kind === 'circle') {
        const [cx, cy] = local(p.center.x, p.center.y)
        parts.push(`<circle cx="${n2(cx)}" cy="${n2(-cy)}" r="${n2(p.radius * s)}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`)
        for (let i = 0; i < 24; i++) {
          const a0 = i * Math.PI / 12, a1 = (i + 1) * Math.PI / 12, rr = p.radius * s
          obstacle(cx + rr * Math.cos(a0), cy + rr * Math.sin(a0), cx + rr * Math.cos(a1), cy + rr * Math.sin(a1))
        }
        // A radius line shows the rotation of round bodies
        const [ex, ey] = local(p.center.x + p.radius, p.center.y)
        parts.push(`<line x1="${n2(cx)}" y1="${n2(-cy)}" x2="${n2(ex)}" y2="${n2(-ey)}" stroke="${stroke}" stroke-width="1" opacity="0.5"/>`)
      } else {
        const w = p.verts.map(v => local(v.x, v.y))
        w.forEach((a, i) => { const b = w[(i + 1) % w.length]; obstacle(a[0], a[1], b[0], b[1]) })
        const pts = w.map(([x, y]) => `${n2(x)},${n2(-y)}`).join(' ')
        parts.push(`<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/>`)
      }
    }
    parts.push(`<circle cx="0" cy="0" r="2.6" fill="${P.text}"/>`)
  }
  boxes.push({ x0: -6, y0: -6, x1: 6, y1: 6 })

  // Decomposition axes (dashed), through the centre of mass
  const decompose = opts.decompose === 'incline' && d.incline === null ? 'axes' : opts.decompose
  const th = decompose === 'incline' ? d.incline! : 0
  const e1: [number, number] = [Math.cos(th), Math.sin(th)], e2: [number, number] = [-Math.sin(th), Math.cos(th)]
  if (decompose !== 'none') {
    const L = 150
    for (const [e, name] of [[e1, 'x'], [e2, 'y']] as Array<[[number, number], string]>) {
      parts.push(`<line x1="${n2(-e[0] * L)}" y1="${n2(e[1] * L)}" x2="${n2(e[0] * L)}" y2="${n2(-e[1] * L)}" stroke="${P.text2}" stroke-width="1" stroke-dasharray="5 4"/>`)
      obstacle(-e[0] * L, -e[1] * L, e[0] * L, e[1] * L, 10, 2)
      const tx = e[0] * (L + 10), ty = e[1] * (L + 10)
      parts.push(`<text x="${n2(tx)}" y="${n2(-ty + 4)}" font-size="13" font-style="italic" fill="${P.text2}" text-anchor="middle">${name}</text>`)
      grow(e[0] * (L + 16), e[1] * (L + 16)); grow(-e[0] * L, -e[1] * L)
    }
  }

  const arrow = (x0: number, y0: number, vx: number, vy: number, color: string, width: number, dashed: boolean) => {
    const L = Math.hypot(vx, vy)
    if (L === 0) return
    const ux = vx / L, uy = vy / L
    const head = Math.min(11, L * 0.45), hw = head * 0.42
    const x1 = x0 + vx, y1 = y0 + vy
    const bx = x1 - ux * head, by = y1 - uy * head
    parts.push(`<line x1="${n2(x0)}" y1="${n2(-y0)}" x2="${n2(bx)}" y2="${n2(-by)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"${dashed ? ' stroke-dasharray="6 4"' : ''}/>`)
    parts.push(`<polygon points="${n2(x1)},${n2(-y1)} ${n2(bx - uy * hw)},${n2(-(by + ux * hw))} ${n2(bx + uy * hw)},${n2(-(by - ux * hw))}" fill="${color}"/>`)
    grow(x0, y0); grow(x1, y1)
  }

  /** A label near the tip of an arrow, moved around the tip until it overlaps nothing placed before. */
  const label = (tipX: number, tipY: number, ux: number, uy: number, main: string, sub: string, extra: string, color: string, size = 14) => {
    const w = textWidth(main, size) + (sub ? textWidth(sub, size * 0.75) : 0) + (extra ? textWidth(extra, size * 0.85) + 4 : 0)
    const h = size * 1.2
    // Candidates around the tip, nearest first; the label box is pushed out by half its extent along the direction
    let pick: [number, number] = [tipX + ux * (w / 2 + 8), tipY + uy * (h / 2 + 6)], best = Infinity
    for (const r of [10, 18, 28, 40, 56, 74]) for (const a of [0, 0.5, -0.5, 1, -1, Math.PI / 2, -Math.PI / 2, 2.1, -2.1, Math.PI]) {
      const ca = Math.cos(a), sa = Math.sin(a)
      const dx = ux * ca - uy * sa, dy = ux * sa + uy * ca
      const cx = tipX + dx * (r + Math.abs(dx) * w / 2), cy = tipY + dy * (r + Math.abs(dy) * h / 2)
      const b: Box = { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 }
      let hits = 0
      for (const o of boxes) if (overlaps(o, b)) hits++
      const score = hits * 1000 + r + Math.abs(a) * 4
      if (score < best) { best = score; pick = [cx, cy] }
      if (hits === 0) break
    }
    const box: Box = { x0: pick[0] - w / 2, x1: pick[0] + w / 2, y0: pick[1] - h / 2, y1: pick[1] + h / 2 }
    boxes.push(box)
    grow(box.x0, box.y0); grow(box.x1, box.y1)
    const subT = sub ? `<tspan font-size="${n2(size * 0.75)}" dy="4">${esc(sub)}</tspan>` : ''
    const extraT = extra ? `<tspan font-size="${n2(size * 0.85)}" font-style="normal" dy="${sub ? -4 : 0}" dx="3">${esc(extra)}</tspan>` : ''
    parts.push(`<text x="${n2(pick[0])}" y="${n2(-pick[1] + size * 0.36)}" font-size="${size}" font-style="italic" font-weight="600" fill="${color}" text-anchor="middle" stroke="${bg}" stroke-width="3.5" stroke-linejoin="round" paint-order="stroke">${esc(main)}${subT}${extraT}</text>`)
  }

  // Arrows first (so the label placement can avoid them), then labels
  const placed: Array<{ x0: number; y0: number; vx: number; vy: number; f: FbdForce; comp?: boolean }> = []
  for (const f of d.forces) {
    const [x0, y0] = at(f.x, f.y)
    const [vx, vy] = vec(f.fx, f.fy)
    if (decompose !== 'none') {
      const c1 = f.fx * e1[0] + f.fy * e1[1], c2 = f.fx * e2[0] + f.fy * e2[1]
      const m = Math.hypot(f.fx, f.fy)
      if (Math.abs(c1) > 1e-9 * m && Math.abs(c2) > 1e-9 * m) {
        const L = Math.hypot(vx, vy) / m
        const a1: [number, number] = [c1 * e1[0] * L, c1 * e1[1] * L], a2: [number, number] = [c2 * e2[0] * L, c2 * e2[1] * L]
        // Parallelogram sides (thin dotted), then the two dashed components
        parts.push(`<polyline points="${n2(x0 + a1[0])},${n2(-(y0 + a1[1]))} ${n2(x0 + vx)},${n2(-(y0 + vy))} ${n2(x0 + a2[0])},${n2(-(y0 + a2[1]))}" fill="none" stroke="${f.color}" stroke-width="0.9" stroke-dasharray="2 3" opacity="0.7"/>`)
        arrow(x0, y0, a1[0], a1[1], f.color, 1.6, true)
        arrow(x0, y0, a2[0], a2[1], f.color, 1.6, true)
        placed.push({ x0, y0, vx: a1[0], vy: a1[1], f: { ...f, sub: `${f.sub}x`, fx: c1 * e1[0], fy: c1 * e1[1] }, comp: true })
        placed.push({ x0, y0, vx: a2[0], vy: a2[1], f: { ...f, sub: `${f.sub}y`, fx: c2 * e2[0], fy: c2 * e2[1] }, comp: true })
      }
    }
    arrow(x0, y0, vx, vy, f.color, 2.4, false)
    placed.unshift({ x0, y0, vx, vy, f })
  }
  if (opts.resultant) {
    const [vx, vy] = vec(d.net.x, d.net.y)
    if (vx !== 0 || vy !== 0) {
      // A force drawn from the centre in the same direction would hide the resultant: move it aside by a few pixels
      const L = Math.hypot(vx, vy), ux = vx / L, uy = vy / L
      const hidden = placed.some(p => {
        const m = Math.hypot(p.vx, p.vy)
        return m > 0 && Math.hypot(p.x0, p.y0) < 3 && (p.vx * ux + p.vy * uy) / m > Math.cos(4 * Math.PI / 180)
      })
      const ox = hidden ? -uy * 9 : 0, oy = hidden ? ux * 9 : 0
      arrow(ox, oy, vx, vy, P.accent, 3.2, false)
      placed.unshift({ x0: ox, y0: oy, vx, vy, f: { kind: 'other', label: tl('F合'), sub: '', x: d.x, y: d.y, fx: d.net.x, fy: d.net.y, color: P.accent } })
    }
  }
  // Arrow bodies as obstacles for the labels
  for (const p of placed) obstacle(p.x0, p.y0, p.x0 + p.vx, p.y0 + p.vy, 7, 3)
  for (const p of placed) {
    const L = Math.hypot(p.vx, p.vy)
    if (L === 0) continue
    const extra = opts.magnitudes ? `= ${fbdMagnitude(p.f.fx, p.f.fy, opts.digits)}` : ''
    label(p.x0 + p.vx, p.y0 + p.vy, p.vx / L, p.vy / L, p.f.label, p.f.sub, extra, p.f.color, p.comp ? 12 : 14)
  }

  // Frame: drawing coordinates are y-up; the SVG viewBox flips them
  const pad = 22
  const capH = opts.caption === false ? 0 : 40
  const cap1 = tl('{0}的受力分析（t = {1} s）', [d.name, formatSig(d.time, Math.max(3, opts.digits))])
  const cap2 = tl('m = {0} kg；箭头长度与力的大小成正比（很小的力画成最短箭头）', [formatSig(d.mass, opts.digits)])
  const capW = opts.caption === false ? 0 : Math.max(textWidth(cap1, 13), textWidth(cap2, 11))
  // The drawing is centred when the caption is wider
  const extraW = Math.max(0, capW - (maxX - minX))
  minX -= extraW / 2; maxX += extraW / 2
  const W = Math.ceil(maxX - minX + 2 * pad), H = Math.ceil(maxY - minY + 2 * pad + capH)
  const vx0 = minX - pad, vy0 = -maxY - pad
  const caption: string[] = []
  if (opts.caption !== false) {
    const cy = -minY + pad + 18
    caption.push(`<text x="${n2(vx0 + pad)}" y="${n2(cy - 2)}" font-size="13" font-weight="600" fill="${P.text}">${esc(cap1)}</text>`)
    caption.push(`<text x="${n2(vx0 + pad)}" y="${n2(cy + 15)}" font-size="11" fill="${P.text2}">${esc(cap2)}</text>`)
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${n2(vx0)} ${n2(vy0)} ${W} ${H}" font-family="${FONT.replace(/"/g, "'")}">`
    + `<rect x="${n2(vx0)}" y="${n2(vy0)}" width="${W}" height="${H}" fill="${bg}"/>`
    + parts.join('') + caption.join('') + '</svg>'
  return { svg, width: W, height: H }
}

/** Rows of the force table: symbol, magnitude (N), direction (degrees from +x, counter-clockwise), components. */
export function fbdTable(d: FbdData): Array<{ symbol: string; kind: FbdForce['kind']; magnitude: number; angle: number; fx: number; fy: number; color: string }> {
  return d.forces.map(f => {
    // A component below 1e-9 of the force is rounding noise (a normal force on a level floor): shown as 0
    const m = Math.hypot(f.fx, f.fy)
    const fx = Math.abs(f.fx) <= 1e-9 * m ? 0 : f.fx, fy = Math.abs(f.fy) <= 1e-9 * m ? 0 : f.fy
    return { symbol: fbdSymbol(f), kind: f.kind, magnitude: m, angle: Math.atan2(fy, fx) * 180 / Math.PI, fx, fy, color: f.color }
  })
}
