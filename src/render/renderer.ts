/**
 * Canvas 2D renderer. Reads a state vector and draws; it never computes physics of its own — every
 * position, force and velocity drawn comes from the solver (state, mode solution, rope paths).
 *
 * Numbers on the canvas go through the unit choice in `DrawInput.units`; sizes of type and strokes follow
 * `DrawInput.style` (projector mode). Optional layers let `renderFrame` put purely visual effects (motion
 * blur, trails, particles) underneath or on top of the bodies.
 */
import type { System, Mode, ModeSolution } from '../core/solver/dynamics'
import type { Pose } from '../core/solver/kinematics'
import { anchorState, computePoses, pulleyCenter, ropeKin } from '../core/solver/kinematics'
import type { BodyModel } from '../core/solver/model'
import type { Recording } from '../core/solver/simulation'
import type { AnnotationDef } from '../core/scene/types'
import type { UnitChoice } from '../units/units'
import type { RenderStyle } from './style'
import { FONT, MONO, beginRender, disp, font, fpx, lw, q, tickText, unit } from './style'
import { drawAnnotations } from './annotations'

/** View of the world: centre (m), zoom (px/m) and canvas size (CSS px). */
export interface Camera { cx: number; cy: number; ppm: number; width: number; height: number }

/** World point (m) to canvas coordinates (y down). */
export function toScreen(cam: Camera, x: number, y: number): [number, number] {
  return [cam.width / 2 + (x - cam.cx) * cam.ppm, cam.height / 2 - (y - cam.cy) * cam.ppm]
}
/** Canvas coordinates to a world point (m). */
export function toWorld(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: cam.cx + (sx - cam.width / 2) / cam.ppm, y: cam.cy - (sy - cam.height / 2) / cam.ppm }
}

/** Colours of the canvas. */
export interface Palette {
  bg: string; gridMinor: string; gridMajor: string; text: string; text2: string; accent: string
  velocity: string; acceleration: string; gravity: string; normal: string; friction: string; tension: string; spring: string; applied: string
  staticFill: string; staticStroke: string; rope: string; label: string; labelBg: string
  /** Impact sparks, contact dust and teaching annotations (optional for palettes made elsewhere). */
  spark?: string; dust?: string; note?: string
}

/** Palette of the light theme. */
export const LIGHT: Palette = {
  bg: '#fbfbfd', gridMinor: 'rgba(60,60,67,0.06)', gridMajor: 'rgba(60,60,67,0.15)', text: '#1c1c1e', text2: 'rgba(60,60,67,0.7)', accent: '#0a6cff',
  velocity: '#16a34a', acceleration: '#ea580c', gravity: '#7c3aed', normal: '#2563eb', friction: '#dc2626', tension: '#0891b2', spring: '#ca8a04', applied: '#db2777',
  staticFill: '#d7dbe2', staticStroke: '#6b7280', rope: '#44403c', label: '#1c1c1e', labelBg: 'rgba(255,255,255,0.92)',
  spark: '#f59e0b', dust: '#8b8378', note: '#c2410c'
}
/** Palette of the dark theme. */
export const DARK: Palette = {
  bg: '#141518', gridMinor: 'rgba(235,235,245,0.05)', gridMajor: 'rgba(235,235,245,0.13)', text: '#f5f5f7', text2: 'rgba(235,235,245,0.7)', accent: '#3b8bff',
  velocity: '#4ade80', acceleration: '#fb923c', gravity: '#a78bfa', normal: '#60a5fa', friction: '#f87171', tension: '#22d3ee', spring: '#facc15', applied: '#f472b6',
  staticFill: '#2c2f36', staticStroke: '#8b93a1', rope: '#d6d3d1', label: '#f5f5f7', labelBg: 'rgba(28,28,31,0.92)',
  spark: '#fcd34d', dust: '#b8b0a4', note: '#fdba74'
}

/** What the canvas shows (the overlay toggles). */
export interface DrawOptions {
  velocity: boolean; acceleration: boolean; forces: boolean; forcesAll: boolean
  trajectory: boolean; labels: boolean; grid: boolean; axes: boolean; names: boolean
}

/** Extra drawing passes around the bodies (purely visual effects). */
export interface DrawLayers {
  /** After the grid and trajectories, before any body (motion blur, trails). */
  underBodies?: (ctx: CanvasRenderingContext2D, poses: Pose[]) => void
  /** After the bodies and connectors, before vectors and labels (particles). */
  overBodies?: (ctx: CanvasRenderingContext2D, poses: Pose[]) => void
}

/** Everything drawScene needs for one frame. */
export interface DrawInput {
  sys: System
  X: Float64Array
  mode: Mode | null
  sol: ModeSolution | null
  rec: Recording | null
  /** Index of the recorded frame; trajectories are drawn up to it. */
  frame: number
  /** Simulated time (s). */
  time: number
  options: DrawOptions
  selectedId: string | null
  hoverId: string | null
  palette: Palette
  /** Scales: pixels per m/s, per m/s², per N. */
  scales: { v: number; a: number; f: number }
  trajectories: Map<string, Float64Array> | null
  /** Edit mode: draw initial velocities as dashed arrows. */
  editing: boolean
  /** Connector being created: first anchor, cursor and the pulleys clicked so far (world, m). */
  pending: { world: { x: number; y: number }; cursor: { x: number; y: number } | null; pulleys: Array<{ x: number; y: number }> } | null
  /** Significant digits of the numbers drawn. */
  digits: number
  /** Display units for every number on the canvas (SI when absent). */
  units?: UnitChoice | null
  /** Font and line scale (projector mode). */
  style?: RenderStyle | null
  /** Teaching annotations drawn above the scene. */
  annotations?: AnnotationDef[] | null
  selectedAnnotation?: string | null
  layers?: DrawLayers | null
}

/** A 1-2-5 step (m) at least `targetPx` pixels long at this zoom. */
export function niceStep(ppm: number, targetPx: number): number {
  const raw = targetPx / ppm
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p
  return 10 * p
}

/** Minor grid step (m) drawn at this zoom; also the default snap step of the editor. */
export function minorGridStep(ppm: number): number { return niceStep(ppm, 24) }

function drawGrid(ctx: CanvasRenderingContext2D, cam: Camera, P: Palette, axes: boolean, grid: boolean) {
  const minor = minorGridStep(cam.ppm), major = minor * 5
  const tl = toWorld(cam, 0, 0), br = toWorld(cam, cam.width, cam.height)
  if (grid) {
    for (const [step, color] of [[minor, P.gridMinor], [major, P.gridMajor]] as Array<[number, string]>) {
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = Math.ceil(tl.x / step) * step; x <= br.x; x += step) { const [sx] = toScreen(cam, x, 0); ctx.moveTo(Math.round(sx) + 0.5, 0); ctx.lineTo(Math.round(sx) + 0.5, cam.height) }
      for (let y = Math.ceil(br.y / step) * step; y <= tl.y; y += step) { const [, sy] = toScreen(cam, 0, y); ctx.moveTo(0, Math.round(sy) + 0.5); ctx.lineTo(cam.width, Math.round(sy) + 0.5) }
      ctx.stroke()
    }
  }
  const lu = unit('m')
  if (axes) {
    const [ox, oy] = toScreen(cam, 0, 0)
    ctx.strokeStyle = P.text2
    ctx.lineWidth = lw(1)
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(cam.width, oy); ctx.moveTo(ox, 0); ctx.lineTo(ox, cam.height); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = P.text2
    ctx.font = font(11)
    const xName = `x / ${lu}`, yName = `y / ${lu}`
    ctx.fillText(xName, cam.width - ctx.measureText(xName).width - 6, Math.max(fpx(12), Math.min(cam.height - 30, oy - 4)))
    ctx.fillText(yName, Math.max(4, Math.min(cam.width - 50, ox + 4)), fpx(12))
    ctx.fillText('O', ox + 3, oy + fpx(12))
    // Tick labels at the major lines, in the display length unit; pinned to the edge when the axis is off screen
    ctx.font = font(10, MONO)
    const ly = Math.max(fpx(12), Math.min(cam.height - 30, oy + fpx(12)))
    // Label every major line, or every other one when they would crowd
    const every = major * cam.ppm < fpx(10) * 7 ? 2 : 1
    for (let x = Math.ceil(tl.x / major) * major; x <= br.x; x += major) {
      if (Math.abs(x) < major * 1e-6 || (Math.round(x / major) % every) !== 0) continue
      const [sx] = toScreen(cam, x, 0)
      const s = tickText(disp(x, 'm'))
      ctx.fillText(s, sx + 3, ly)
    }
    const lx = Math.max(4, Math.min(cam.width - 40, ox + 4))
    for (let y = Math.ceil(br.y / major) * major; y <= tl.y; y += major) {
      if (Math.abs(y) < major * 1e-6 || (Math.round(y / major) % every) !== 0) continue
      const [, sy] = toScreen(cam, 0, y)
      if (sy < fpx(20) || sy > cam.height - 24) continue
      ctx.fillText(tickText(disp(y, 'm')), lx, sy - 3)
    }
  }
  // Scale bar
  const bar = major
  const len = bar * cam.ppm
  ctx.fillStyle = P.text2
  ctx.strokeStyle = P.text2
  ctx.lineWidth = lw(2)
  ctx.beginPath(); ctx.moveTo(14, cam.height - 14); ctx.lineTo(14 + len, cam.height - 14); ctx.moveTo(14, cam.height - 18); ctx.lineTo(14, cam.height - 10); ctx.moveTo(14 + len, cam.height - 18); ctx.lineTo(14 + len, cam.height - 10); ctx.stroke()
  ctx.font = font(11, MONO)
  ctx.fillText(`${tickText(disp(bar, 'm'))} ${lu}`, 18 + len, cam.height - 10)
}

/** Outline path of a body at a pose (screen coordinates). */
export function bodyPath(ctx: CanvasRenderingContext2D, cam: Camera, b: BodyModel, pose: Pose) {
  ctx.beginPath()
  if (b.shape.kind === 'circle') {
    const [sx, sy] = toScreen(cam, pose.x, pose.y)
    ctx.arc(sx, sy, b.shape.radius * cam.ppm, 0, Math.PI * 2)
    return
  }
  const verts = b.shape.verts
  for (let i = 0; i < verts.length; i++) {
    const v = verts[i]
    const wx = pose.x + pose.c * v.x - pose.s * v.y, wy = pose.y + pose.s * v.x + pose.c * v.y
    const sx = cam.width / 2 + (wx - cam.cx) * cam.ppm, sy = cam.height / 2 - (wy - cam.cy) * cam.ppm
    if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy)
  }
  ctx.closePath()
}

let hatchCache: { color: string; pattern: CanvasPattern | null } | null = null
function hatch(ctx: CanvasRenderingContext2D, P: Palette): CanvasPattern | string {
  if (hatchCache && hatchCache.color === P.staticStroke + P.staticFill) return hatchCache.pattern ?? P.staticFill
  const c = document.createElement('canvas')
  c.width = c.height = 10
  const g = c.getContext('2d')!
  g.fillStyle = P.staticFill
  g.fillRect(0, 0, 10, 10)
  g.strokeStyle = P.staticStroke
  g.globalAlpha = 0.35
  g.lineWidth = 1
  g.beginPath(); g.moveTo(0, 10); g.lineTo(10, 0); g.moveTo(-5, 5); g.lineTo(5, -5); g.moveTo(5, 15); g.lineTo(15, 5); g.stroke()
  const pattern = ctx.createPattern(c, 'repeat')
  hatchCache = { color: P.staticStroke + P.staticFill, pattern }
  return pattern ?? P.staticFill
}

/** Arrow from (x0, y0) to (x1, y1) in canvas pixels; `width` is scaled by the style's line factor. */
export function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, width = 2.2, dashed = false) {
  const dx = x1 - x0, dy = y1 - y0
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1.5) return
  const ux = dx / len, uy = dy / len
  const w = lw(width)
  const head = Math.min(10 * Math.sqrt(w / width), 0.35 * len + 4)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = w
  if (dashed) ctx.setLineDash([5, 4])
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * head * 0.8, y1 - uy * head * 0.8); ctx.stroke()
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x1 - ux * head - uy * head * 0.45, y1 - uy * head + ux * head * 0.45)
  ctx.lineTo(x1 - ux * head + uy * head * 0.45, y1 - uy * head - ux * head * 0.45)
  ctx.closePath()
  ctx.fill()
}

/** Text on a rounded label background; (x, y) is the baseline start. */
export function tag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, P: Palette, fontSpec = font(12)) {
  ctx.font = fontSpec
  const w = ctx.measureText(text).width
  const m = /(\d+(?:\.\d+)?)px/.exec(fontSpec)
  const h = m ? parseFloat(m[1]) : 12
  ctx.fillStyle = P.labelBg
  ctx.beginPath()
  ctx.roundRect(x - 3, y - h, w + 6, h + 4, 4)
  ctx.fill()
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

function drawSpring(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, ppm: number) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux
  const coils = 12, amp = Math.max(4, Math.min(9, 0.04 * ppm))
  const lead = Math.min(10, len * 0.12)
  ctx.strokeStyle = color
  ctx.lineWidth = lw(1.8)
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x0 + ux * lead, y0 + uy * lead)
  const body = len - 2 * lead
  for (let i = 1; i <= coils * 2; i++) {
    const t = lead + (body * i) / (coils * 2)
    const side = i === coils * 2 ? 0 : (i % 2 ? 1 : -1)
    ctx.lineTo(x0 + ux * t + nx * amp * side, y0 + uy * t + ny * amp * side)
  }
  ctx.lineTo(x1, y1)
  ctx.stroke()
}

/** A force to draw: application point (m), components (N), colour and label. */
export interface ForceArrow { x: number; y: number; fx: number; fy: number; color: string; label: string }

/** Forces acting on a body, from the mode solution (gravity, contacts, connectors, applied forces). */
export function bodyForces(input: DrawInput, b: BodyModel, poses: Pose[]): ForceArrow[] {
  const { sys, sol, mode } = input
  const out: ForceArrow[] = []
  const P = input.palette
  const g = sys.model.settings.gravity
  const pose = poses[b.global]
  if (g.x !== 0 || g.y !== 0) out.push({ x: pose.x, y: pose.y, fx: b.mass * g.x, fy: b.mass * g.y, color: P.gravity, label: 'G' })
  if (sol && mode) {
    mode.units.forEach((u, ui) => {
      if (u.points.length === 0 || (u.pair.X !== b && u.pair.Y !== b)) return
      const st = sol.units[ui]
      let cx = 0, cy = 0
      u.points.forEach((p, pi) => {
        const k = st.pointKin[pi]
        const sign = p.A.body === b ? 1 : -1
        const l = st.pointLambda[pi]
        out.push({ x: k.cx, y: k.cy, fx: sign * l * k.nx, fy: sign * l * k.ny, color: P.normal, label: u.points.length > 1 ? `N${pi + 1}` : 'N' })
        cx += k.cx / u.points.length; cy += k.cy / u.points.length
      })
      if (u.friction !== 'none' && Math.abs(st.tangent) > 1e-12) {
        const sign = u.ref.A.body === b ? 1 : -1
        out.push({ x: cx, y: cy, fx: sign * st.tangent * st.refKin.tx, fy: sign * st.tangent * st.refKin.ty, color: P.friction, label: 'f' })
      }
    })
    sys.model.ropes.forEach((r, k) => {
      if (!mode.taut[k]) return
      const T = sol.ropeTension[k]
      if (Math.abs(T) < 1e-12) return
      const rk = ropeKin(poses, r)
      if (r.a.body === b) { const p = anchorState(poses, r.a); out.push({ x: p.px, y: p.py, fx: T * rk.path.u1.x, fy: T * rk.path.u1.y, color: P.tension, label: 'T' }) }
      if (r.b.body === b) { const p = anchorState(poses, r.b); out.push({ x: p.px, y: p.py, fx: -T * rk.path.uLast.x, fy: -T * rk.path.uLast.y, color: P.tension, label: 'T' }) }
    })
    sol.rows.forEach((row, k) => {
      if (row.kind !== 'hinge' && row.kind !== 'rod') return
      const c = row.kind === 'hinge' ? sys.model.hinges[row.owner] : sys.model.rods[row.owner]
      if (c.a.body !== b && c.b.body !== b) return
      if (row.kind === 'hinge' && row.sub === 1) return
      if (row.kind === 'hinge') {
        let Fx = 0, Fy = 0
        sol.rows.forEach((r2, k2) => { if (r2.kind === 'hinge' && r2.owner === row.owner) { if (r2.sub === 0) Fx = sol.lambda[k2]; else Fy = sol.lambda[k2] } })
        const side = c.a.body === b ? c.a : c.b
        const sign = c.a.body === b ? 1 : -1
        const p = anchorState(poses, side)
        out.push({ x: p.px, y: p.py, fx: sign * Fx, fy: sign * Fy, color: P.tension, label: 'F' })
      } else {
        const side = c.a.body === b ? c.a : c.b
        const p = anchorState(poses, side)
        const l = sol.lambda[k]
        const fx = side === c.a ? row.j.ax * l : row.j.bx * l, fy = side === c.a ? row.j.ay * l : row.j.by * l
        out.push({ x: p.px, y: p.py, fx, fy, color: P.tension, label: 'F' })
      }

    })
  }
  for (const s of sys.model.springs) {
    if (s.a.body !== b && s.b.body !== b) continue
    const pa = anchorState(poses, s.a), pb = anchorState(poses, s.b)
    const dx = pa.px - pb.px, dy = pa.py - pb.py, L = Math.sqrt(dx * dx + dy * dy)
    if (L === 0) continue
    const ux = dx / L, uy = dy / L
    const vrel = ux * (pa.vx - pb.vx) + uy * (pa.vy - pb.vy)
    const mag = -s.stiffness * (L - s.restLength) - s.damping * vrel
    if (s.a.body === b) out.push({ x: pa.px, y: pa.py, fx: mag * ux, fy: mag * uy, color: P.spring, label: 'F弹' })
    else out.push({ x: pb.px, y: pb.py, fx: -mag * ux, fy: -mag * uy, color: P.spring, label: 'F弹' })
  }
  for (const f of sys.model.forces) {
    if (f.a.body !== b) continue
    const p = anchorState(poses, f.a)
    out.push({ x: p.px, y: p.py, fx: f.force.x, fy: f.force.y, color: P.applied, label: 'F' })
  }
  return out
}

// Static bodies first, then dynamic ones, in scene order (cached per model: no per-frame sort)
const drawOrderCache = new WeakMap<object, BodyModel[]>()
function drawOrder(model: System['model']): BodyModel[] {
  let o = drawOrderCache.get(model)
  if (!o) { o = [...model.bodies.filter(b => !b.dynamic), ...model.bodies.filter(b => b.dynamic)]; drawOrderCache.set(model, o) }
  return o
}

/** Draw one frame of the scene: grid, bodies, connectors, vectors, labels and annotations. */
export function drawScene(ctx: CanvasRenderingContext2D, cam: Camera, input: DrawInput) {
  const { sys, X, options, palette: P } = input
  beginRender(input.style, input.units)
  const model = sys.model
  ctx.fillStyle = P.bg
  ctx.fillRect(0, 0, cam.width, cam.height)
  drawGrid(ctx, cam, P, options.axes, options.grid)
  const poses = computePoses(model, X)

  // Trajectories
  if (options.trajectory && input.trajectories && input.rec) {
    for (const b of model.dynamic) {
      const tr = input.trajectories.get(b.id)
      if (!tr) continue
      const upto = Math.min(tr.length / 2, input.frame + 1)
      if (upto < 2) continue
      ctx.strokeStyle = b.def.color
      ctx.globalAlpha = 0.55
      ctx.lineWidth = lw(1.6)
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      // Decimate by screen distance: vertices closer than ~1.5 px add nothing but rasterization cost
      const W2 = cam.width / 2, H2 = cam.height / 2
      let px = W2 + (tr[0] - cam.cx) * cam.ppm, py = H2 - (tr[1] - cam.cy) * cam.ppm
      ctx.moveTo(px, py)
      for (let k = 1; k < upto; k++) {
        const sx = W2 + (tr[2 * k] - cam.cx) * cam.ppm, sy = H2 - (tr[2 * k + 1] - cam.cy) * cam.ppm
        const dx = sx - px, dy = sy - py
        if (dx * dx + dy * dy < 2.25 && k < upto - 1) continue
        ctx.lineTo(sx, sy)
        px = sx; py = sy
      }
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }
  }

  if (input.layers?.underBodies) {
    ctx.save()
    input.layers.underBodies(ctx, poses)
    ctx.restore()
  }

  // Hangers of movable pulleys, under their bodies
  for (const p of model.pulleys) {
    if (!p.body) continue
    const c = pulleyCenter(poses, p), bp = poses[p.body.global]
    const [x0, y0] = toScreen(cam, c.x, c.y), [x1, y1] = toScreen(cam, bp.x, bp.y)
    ctx.strokeStyle = P.staticStroke
    ctx.lineWidth = lw(2)
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
  }

  // Bodies: static first
  for (const b of drawOrder(model)) {
    const pose = poses[b.global]
    bodyPath(ctx, cam, b, pose)
    if (!b.dynamic) {
      ctx.fillStyle = hatch(ctx, P)
      ctx.fill()
      ctx.strokeStyle = P.staticStroke
      ctx.lineWidth = lw(1.2)
      ctx.stroke()
      if (b.beltSpeed !== 0 && b.shape.kind === 'polygon') drawBelt(ctx, cam, b, pose, input.time, P)
    } else {
      ctx.fillStyle = b.def.color
      ctx.globalAlpha = 0.88
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      ctx.lineWidth = lw(1)
      ctx.stroke()
      if (b.shape.kind === 'circle') {
        // Orientation mark
        const [sx, sy] = toScreen(cam, pose.x, pose.y)
        const r = b.shape.radius * cam.ppm
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.lineWidth = lw(1.5)
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + pose.c * r, sy - pose.s * r); ctx.stroke()
      }
      const [cx, cy] = toScreen(cam, pose.x, pose.y)
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath(); ctx.arc(cx, cy, 2.2 * Math.sqrt(lw(1)), 0, Math.PI * 2); ctx.fill()
    }
    if (b.id === input.selectedId || b.id === input.hoverId) {
      bodyPath(ctx, cam, b, pose)
      ctx.strokeStyle = P.accent
      ctx.lineWidth = lw(b.id === input.selectedId ? 2.5 : 1.5)
      ctx.setLineDash(b.id === input.selectedId ? [] : [4, 3])
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  // Pulleys
  for (const p of model.pulleys) {
    const c = pulleyCenter(poses, p)
    const [sx, sy] = toScreen(cam, c.x, c.y)
    const r = Math.max(3, p.radius * cam.ppm)
    ctx.fillStyle = P.staticFill
    ctx.strokeStyle = P.staticStroke
    ctx.lineWidth = lw(1.5)
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    if (p.body && r > 6) {
      // A movable pulley turns with its body: two spokes show the orientation
      const bp = poses[p.body.global]
      ctx.lineWidth = lw(1)
      ctx.beginPath()
      ctx.moveTo(sx - bp.c * r * 0.8, sy + bp.s * r * 0.8); ctx.lineTo(sx + bp.c * r * 0.8, sy - bp.s * r * 0.8)
      ctx.moveTo(sx - bp.s * r * 0.8, sy - bp.c * r * 0.8); ctx.lineTo(sx + bp.s * r * 0.8, sy + bp.c * r * 0.8)
      ctx.stroke()
    }
    ctx.fillStyle = P.staticStroke
    ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI * 2); ctx.fill()
    if (p.id === input.selectedId || p.id === input.hoverId) {
      ctx.strokeStyle = P.accent; ctx.lineWidth = lw(p.id === input.selectedId ? 2.5 : 1.5)
      ctx.setLineDash(p.id === input.selectedId ? [] : [4, 3])
      ctx.beginPath(); ctx.arc(sx, sy, r + 3, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
    }
  }

  // Connectors
  model.ropes.forEach((r, k) => {
    const path = ropeKin(poses, r).path
    const taut = input.mode ? input.mode.taut[k] : true
    const slack = r.length - path.length
    ctx.strokeStyle = r.id === input.selectedId ? P.accent : P.rope
    ctx.lineWidth = lw(r.id === input.selectedId ? 2.6 : 1.6)
    ctx.beginPath()
    const pts = path.points.map(p => toScreen(cam, p.x, p.y))
    if (!taut && slack > 1e-6 && r.pulleys.length === 0) {
      // Slack rope: a sagging curve whose arc is about the rope length (visual only)
      const [x0, y0] = pts[0], [x1, y1] = pts[1]
      const sag = Math.sqrt(Math.max(0, (r.length * r.length - path.length * path.length))) * 0.5 * cam.ppm
      ctx.moveTo(x0, y0)
      ctx.quadraticCurveTo((x0 + x1) / 2, Math.max(y0, y1) + sag, x1, y1)
    } else {
      for (let i = 0; i + 1 < pts.length; i += 2) { ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]) }
      for (const a of path.arcs) {
        const [sx, sy] = toScreen(cam, a.x, a.y)
        ctx.moveTo(sx + Math.cos(-a.from) * a.r * cam.ppm, sy + Math.sin(-a.from) * a.r * cam.ppm)
        ctx.arc(sx, sy, a.r * cam.ppm, -a.from, -a.to, a.wrap < 0)
      }
    }
    ctx.stroke()
  })
  for (const s of model.springs) {
    const pa = anchorState(poses, s.a), pb = anchorState(poses, s.b)
    const [x0, y0] = toScreen(cam, pa.px, pa.py), [x1, y1] = toScreen(cam, pb.px, pb.py)
    drawSpring(ctx, x0, y0, x1, y1, s.id === input.selectedId ? P.accent : P.rope, cam.ppm)
  }
  for (const r of model.rods) {
    const pa = anchorState(poses, r.a), pb = anchorState(poses, r.b)
    const [x0, y0] = toScreen(cam, pa.px, pa.py), [x1, y1] = toScreen(cam, pb.px, pb.py)
    ctx.strokeStyle = r.id === input.selectedId ? P.accent : P.rope
    ctx.lineWidth = lw(4)
    ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
    ctx.lineCap = 'butt'
  }
  for (const h of model.hinges) {
    const pa = anchorState(poses, h.a)
    const [x, y] = toScreen(cam, pa.px, pa.py)
    ctx.fillStyle = P.bg
    ctx.strokeStyle = h.id === input.selectedId ? P.accent : P.staticStroke
    ctx.lineWidth = lw(2)
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    if (!h.a.body?.dynamic || !h.b.body?.dynamic) {
      // Ground support symbol
      ctx.beginPath(); ctx.moveTo(x - 8, y - 12); ctx.lineTo(x + 8, y - 12); ctx.stroke()
    }
  }
  for (const f of model.forces) {
    if (options.forces && !input.editing) continue
    const p = anchorState(poses, f.a)
    const [x0, y0] = toScreen(cam, p.px, p.py)
    arrow(ctx, x0, y0, x0 + f.force.x * input.scales.f, y0 - f.force.y * input.scales.f, f.id === input.selectedId ? P.accent : P.applied)
  }

  if (input.layers?.overBodies) {
    ctx.save()
    input.layers.overBodies(ctx, poses)
    ctx.restore()
  }

  // Vectors
  const n = sys.n
  const valueFont = font(11, MONO)
  for (const b of model.dynamic) {
    const pose = poses[b.global]
    const [sx, sy] = toScreen(cam, pose.x, pose.y)
    if (options.velocity) {
      const vx = X[3 * n + 3 * b.index], vy = X[3 * n + 3 * b.index + 1]
      arrow(ctx, sx, sy, sx + vx * input.scales.v, sy - vy * input.scales.v, P.velocity, 2.2, input.editing)
      const speed = Math.sqrt(vx * vx + vy * vy)
      if (speed * input.scales.v > 14 && !input.editing) tag(ctx, sx + vx * input.scales.v + 4, sy - vy * input.scales.v - 4, `v = ${q(speed, 'm/s', input.digits)}`, P.velocity, P, valueFont)
    }
    if (options.acceleration && input.sol) {
      const ax = input.sol.acc[3 * b.index], ay = input.sol.acc[3 * b.index + 1]
      arrow(ctx, sx, sy, sx + ax * input.scales.a, sy - ay * input.scales.a, P.acceleration, 2.2)
      const am = Math.sqrt(ax * ax + ay * ay)
      if (am * input.scales.a > 14) tag(ctx, sx + ax * input.scales.a + 4, sy - ay * input.scales.a + fpx(14), `a = ${q(am, 'm/s²', input.digits)}`, P.acceleration, P, valueFont)
    }
  }
  if (options.forces && !input.editing) {
    const targets = options.forcesAll ? model.dynamic : model.dynamic.filter(b => b.id === input.selectedId)
    for (const b of targets) {
      for (const f of bodyForces(input, b, poses)) {
        const [x0, y0] = toScreen(cam, f.x, f.y)
        // Very large forces are drawn shortened (the label keeps the true value)
        const len = Math.hypot(f.fx, f.fy) * input.scales.f, maxLen = 0.3 * Math.min(cam.width, cam.height)
        const k = len > maxLen ? maxLen / len : 1
        const x1 = x0 + f.fx * input.scales.f * k, y1 = y0 - f.fy * input.scales.f * k
        arrow(ctx, x0, y0, x1, y1, f.color, 2.4)
        const mag = Math.sqrt(f.fx * f.fx + f.fy * f.fy)
        if (mag * input.scales.f > 5) tag(ctx, x1 + 4, y1 + (f.fy > 0 ? -4 : fpx(14)), `${f.label} = ${q(mag, 'N', input.digits)}${k < 1 ? '（箭头已缩短）' : ''}`, f.color, P, valueFont)
      }
    }
  }

  // Names
  if (options.names) {
    ctx.font = font(12)
    ctx.fillStyle = P.text2
    for (const b of model.dynamic) {
      const pose = poses[b.global]
      let top = -Infinity
      if (b.shape.kind === 'circle') top = pose.y + b.shape.radius
      else for (const v of b.shape.verts) top = Math.max(top, pose.y + pose.s * v.x + pose.c * v.y)
      const [sx] = toScreen(cam, pose.x, pose.y)
      const [, ty] = toScreen(cam, pose.x, top)
      const w = ctx.measureText(b.name).width
      ctx.fillText(b.name, sx - w / 2, ty - 6)
    }
  }

  // Key moments
  if (options.labels && input.rec && !input.editing) drawKeyMoments(ctx, cam, input)

  // Teaching annotations
  if (input.annotations && input.annotations.length) drawAnnotations(ctx, cam, input.annotations, P, input.digits, input.selectedAnnotation ?? null)

  // Pending connector preview
  if (input.pending) {
    const [x0, y0] = toScreen(cam, input.pending.world.x, input.pending.world.y)
    ctx.strokeStyle = P.accent
    ctx.setLineDash([6, 4])
    ctx.lineWidth = lw(1.5)
    ctx.beginPath(); ctx.moveTo(x0, y0)
    for (const p of input.pending.pulleys) { const [px, py] = toScreen(cam, p.x, p.y); ctx.lineTo(px, py) }
    if (input.pending.cursor) { const [x1, y1] = toScreen(cam, input.pending.cursor.x, input.pending.cursor.y); ctx.lineTo(x1, y1) }
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = P.accent
    ctx.beginPath(); ctx.arc(x0, y0, 4, 0, Math.PI * 2); ctx.fill()
  }
}

function drawBelt(ctx: CanvasRenderingContext2D, cam: Camera, b: BodyModel, pose: Pose, time: number, P: Palette) {
  if (b.shape.kind !== 'polygon') return
  const verts = b.shape.verts
  ctx.save()
  ctx.strokeStyle = P.staticStroke
  ctx.fillStyle = P.staticStroke
  ctx.globalAlpha = 0.6
  for (let f = 0; f < verts.length; f++) {
    const n = b.shape.normals[f]
    const wn = { x: pose.c * n.x - pose.s * n.y, y: pose.s * n.x + pose.c * n.y }
    if (wn.y < 0.3) continue // Only faces things can rest on
    const a = verts[f], c = verts[(f + 1) % verts.length]
    const len = b.shape.lengths[f]
    // CCW edge direction; the surface moves along −t for u > 0
    const tx = (c.x - a.x) / len, ty = (c.y - a.y) / len
    const spacing = 0.25
    const phase = ((-b.beltSpeed * time) % spacing + spacing) % spacing
    const dirx = -Math.sign(b.beltSpeed) * (pose.c * tx - pose.s * ty), diry = -Math.sign(b.beltSpeed) * (pose.s * tx + pose.c * ty)
    ctx.beginPath()
    for (let s = phase; s < len; s += spacing) {
      const lx = a.x + tx * s - n.x * 0.03, ly = a.y + ty * s - n.y * 0.03
      const wx = pose.x + pose.c * lx - pose.s * ly, wy = pose.y + pose.s * lx + pose.c * ly
      const [sx, sy] = toScreen(cam, wx, wy)
      ctx.moveTo(sx + dirx * 5, sy - diry * 5)
      ctx.lineTo(sx - dirx * 3 + diry * 3, sy + diry * 3 + dirx * 3)
      ctx.lineTo(sx - dirx * 3 - diry * 3, sy + diry * 3 - dirx * 3)
      ctx.closePath()
    }
    ctx.fill()
  }
  ctx.restore()
}

/** Display text of each change type. */
const CHANGE_TEXT: Record<string, string> = {
  impact: '碰撞', touch: '接触', separate: '分离', stick: '相对静止（共速）', slip: '开始相对滑动', reverse: '相对滑动反向', slack: '绳松弛', taut: '绳绷紧', leave: '离开',
  switch: '变力切换', timestep: '改用时间步进（精度降级）'
}

/** Display text of a change (a switch that is a kink has its own text). */
export function eventLabel(change: { type: string; kink?: boolean }): string {
  if (change.type === 'switch' && change.kink) return '变力折点'
  return CHANGE_TEXT[change.type] ?? change.type
}

/** Impulses of an impact change in display units (normal impulse, plus the friction impulse if any); '' when none. */
export function impactDetail(c: { type: string; impulse?: number; tangentImpulse?: number }, digits: number): string {
  if (c.type !== 'impact' || c.impulse === undefined) return ''
  const n = `I = ${q(Math.abs(c.impulse), 'N·s', Math.min(digits, 4))}`
  return c.tangentImpulse !== undefined && Math.abs(c.tangentImpulse) > 1e-12 ? `${n}，摩擦冲量 ${q(Math.abs(c.tangentImpulse), 'N·s', Math.min(digits, 4))}` : n
}

/** At most this many key-moment labels are drawn (the most recent ones); older ones keep their dot. */
const KEY_LABELS = 8

function drawKeyMoments(ctx: CanvasRenderingContext2D, cam: Camera, input: DrawInput) {
  const rec = input.rec!
  const P = input.palette
  // Events up to the current time (binary search; events are sorted by time)
  let lo = 0, hi = rec.events.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (rec.events[mid].t > input.time + 1e-12) hi = mid; else lo = mid + 1 }
  const end = lo
  let labelled = 0
  const start = Math.max(0, end - 400)
  // Newest first so the most recent moments get labels
  let solverNote = false
  for (let i = end - 1; i >= start; i--) {
    const e = rec.events[i]
    if (e.changes.length === 0) continue
    const c = e.changes[0]
    if (c.type === 'timestep') {
      // A solver change has no place in the scene: one note above the scale bar
      if (!solverNote) { solverNote = true; tag(ctx, 12, cam.height - 34, `t = ${q(e.t, 's', input.digits)} 起${eventLabel(c)}`, P.friction, P, font(11)) }
      continue
    }
    const body = rec.system.model.byId.get(c.bodies.find(id => rec.system.model.byId.get(id)?.dynamic) ?? '')
    if (!body || !body.dynamic) continue
    const x = c.point?.x ?? e.before[3 * body.index], y = c.point?.y ?? e.before[3 * body.index + 1]
    const [sx, sy] = toScreen(cam, x, y)
    if (sx < -50 || sy < -50 || sx > cam.width + 50 || sy > cam.height + 50) continue
    ctx.fillStyle = P.accent
    ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI * 2); ctx.fill()
    if (labelled >= KEY_LABELS) continue
    ctx.strokeStyle = P.accent
    ctx.lineWidth = lw(1)
    const ly = sy - 30 - (labelled % 4) * fpx(20)
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, ly + 4); ctx.stroke()
    const who = c.bodies.map(id => rec.system.model.byId.get(id)?.name ?? rec.system.model.ropes.find(r => r.id === id)?.name ?? id).join('–')
    const what = e.changes.filter(ch => ch.type !== 'timestep').map(eventLabel).filter((v, i2, a) => a.indexOf(v) === i2).join('、')
    const detail = impactDetail(c, input.digits)
    const text = `${who} ${what}${detail ? `（${detail}）` : ''}  t = ${q(e.t, 's', input.digits)}`
    tag(ctx, sx + 3, ly, text, P.accent, P, font(11))
    labelled++
  }
}

// ---- Per-recording caches ----

interface RecCache { frames: number; trajectories?: Map<string, Float64Array>; scales?: { v: number; a: number; f: number } }
const recCache = new WeakMap<Recording, RecCache>()
function cacheFor(rec: Recording): RecCache {
  let c = recCache.get(rec)
  if (!c || c.frames !== rec.frameCount) { c = { frames: rec.frameCount }; recCache.set(rec, c) }
  return c
}

/** Centre-of-mass paths of every dynamic body over the whole recording (cached per recording). */
export function computeTrajectories(rec: Recording): Map<string, Float64Array> {
  const c = cacheFor(rec)
  if (c.trajectories) return c.trajectories
  const out = new Map<string, Float64Array>()
  for (const b of rec.system.model.dynamic) {
    const arr = new Float64Array(rec.frameCount * 2)
    for (let k = 0; k < rec.frameCount; k++) {
      arr[2 * k] = rec.states[k * rec.size + 3 * b.index]
      arr[2 * k + 1] = rec.states[k * rec.size + 3 * b.index + 1]
    }
    out.set(b.id, arr)
  }
  c.trajectories = out
  return out
}

/** Vector scales chosen once per recording so arrows keep their meaning while playing (cached per recording). */
export function vectorScales(rec: Recording | null, sys: System): { v: number; a: number; f: number } {
  if (rec && rec.system === sys) {
    const c = cacheFor(rec)
    if (!c.scales) c.scales = computeScales(rec, sys)
    return c.scales
  }
  return computeScales(rec, sys)
}

function computeScales(rec: Recording | null, sys: System): { v: number; a: number; f: number } {
  let vmax = 0, amax = 0
  const n = sys.n
  if (rec) {
    const stride = Math.max(1, Math.floor(rec.frameCount / 400))
    for (let k = 0; k < rec.frameCount; k += stride) {
      for (const b of sys.model.dynamic) {
        const o = k * rec.size + 3 * n + 3 * b.index
        vmax = Math.max(vmax, Math.hypot(rec.states[o], rec.states[o + 1]))
      }
    }
    const g = Math.hypot(sys.model.settings.gravity.x, sys.model.settings.gravity.y)
    amax = Math.max(g, 1)
  } else {
    for (const b of sys.model.dynamic) vmax = Math.max(vmax, Math.hypot(b.def.velocity.x, b.def.velocity.y))
  }
  let fmax = 0
  for (const b of sys.model.dynamic) fmax = Math.max(fmax, b.mass * Math.max(1, Math.hypot(sys.model.settings.gravity.x, sys.model.settings.gravity.y)))
  return { v: 70 / Math.max(vmax, 0.5), a: 55 / Math.max(amax, 0.5), f: 90 / Math.max(fmax, 1e-6) }
}

export { FONT, MONO }
