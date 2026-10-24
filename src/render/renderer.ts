/**
 * Canvas 2D renderer. Reads a state vector and draws; it never computes physics of its own — every
 * position, force and velocity drawn comes from the solver (state, mode solution, rope paths).
 */
import type { System, Mode, ModeSolution } from '../core/solver/dynamics'
import type { Pose } from '../core/solver/kinematics'
import { anchorState, computePoses, ropeKin } from '../core/solver/kinematics'
import type { BodyModel } from '../core/solver/model'
import type { Recording } from '../core/solver/simulation'

export interface Camera { cx: number; cy: number; ppm: number; width: number; height: number }

export function toScreen(cam: Camera, x: number, y: number): [number, number] {
  return [cam.width / 2 + (x - cam.cx) * cam.ppm, cam.height / 2 - (y - cam.cy) * cam.ppm]
}
export function toWorld(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: cam.cx + (sx - cam.width / 2) / cam.ppm, y: cam.cy - (sy - cam.height / 2) / cam.ppm }
}

export interface Palette {
  bg: string; gridMinor: string; gridMajor: string; text: string; text2: string; accent: string
  velocity: string; acceleration: string; gravity: string; normal: string; friction: string; tension: string; spring: string; applied: string
  staticFill: string; staticStroke: string; rope: string; label: string; labelBg: string
}

export const LIGHT: Palette = {
  bg: '#fbfbfd', gridMinor: 'rgba(60,60,67,0.06)', gridMajor: 'rgba(60,60,67,0.15)', text: '#1c1c1e', text2: 'rgba(60,60,67,0.7)', accent: '#0a6cff',
  velocity: '#16a34a', acceleration: '#ea580c', gravity: '#7c3aed', normal: '#2563eb', friction: '#dc2626', tension: '#0891b2', spring: '#ca8a04', applied: '#db2777',
  staticFill: '#d7dbe2', staticStroke: '#6b7280', rope: '#44403c', label: '#1c1c1e', labelBg: 'rgba(255,255,255,0.92)'
}
export const DARK: Palette = {
  bg: '#141518', gridMinor: 'rgba(235,235,245,0.05)', gridMajor: 'rgba(235,235,245,0.13)', text: '#f5f5f7', text2: 'rgba(235,235,245,0.7)', accent: '#3b8bff',
  velocity: '#4ade80', acceleration: '#fb923c', gravity: '#a78bfa', normal: '#60a5fa', friction: '#f87171', tension: '#22d3ee', spring: '#facc15', applied: '#f472b6',
  staticFill: '#2c2f36', staticStroke: '#8b93a1', rope: '#d6d3d1', label: '#f5f5f7', labelBg: 'rgba(28,28,31,0.92)'
}

export interface DrawOptions {
  velocity: boolean; acceleration: boolean; forces: boolean; forcesAll: boolean
  trajectory: boolean; labels: boolean; grid: boolean; axes: boolean; names: boolean
}

export interface DrawInput {
  sys: System
  X: Float64Array
  mode: Mode | null
  sol: ModeSolution | null
  rec: Recording | null
  frame: number
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
  pending: { world: { x: number; y: number }; cursor: { x: number; y: number } | null; pulleys: Array<{ x: number; y: number }> } | null
  digits: number
}

const FONT = '"Segoe UI Variable Text","Segoe UI","Noto Sans SC Variable","Microsoft YaHei UI",system-ui,sans-serif'
const MONO = '"JetBrains Mono Variable","Cascadia Code",Consolas,monospace'

export function niceStep(ppm: number, targetPx: number): number {
  const raw = targetPx / ppm
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p
  return 10 * p
}

function fmt(v: number, digits: number): string {
  if (v === 0) return '0'
  const a = Math.abs(v)
  if (a >= 1e-3 && a < 1e5) return String(Number(v.toPrecision(Math.min(digits, 6))))
  return v.toExponential(Math.min(digits, 5) - 1)
}

function drawGrid(ctx: CanvasRenderingContext2D, cam: Camera, P: Palette, axes: boolean, grid: boolean) {
  const minor = niceStep(cam.ppm, 24), major = minor * 5
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
  if (axes) {
    const [ox, oy] = toScreen(cam, 0, 0)
    ctx.strokeStyle = P.text2
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(cam.width, oy); ctx.moveTo(ox, 0); ctx.lineTo(ox, cam.height); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = P.text2
    ctx.font = `11px ${FONT}`
    ctx.fillText('x', cam.width - 12, oy - 4)
    ctx.fillText('y', ox + 4, 12)
    ctx.fillText('O', ox + 3, oy + 12)
  }
  // scale bar
  const bar = major
  const len = bar * cam.ppm
  ctx.fillStyle = P.text2
  ctx.strokeStyle = P.text2
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(14, cam.height - 14); ctx.lineTo(14 + len, cam.height - 14); ctx.moveTo(14, cam.height - 18); ctx.lineTo(14, cam.height - 10); ctx.moveTo(14 + len, cam.height - 18); ctx.lineTo(14 + len, cam.height - 10); ctx.stroke()
  ctx.font = `11px ${MONO}`
  ctx.fillText(`${Number(bar.toPrecision(3))} m`, 18 + len, cam.height - 10)
}

function bodyPath(ctx: CanvasRenderingContext2D, cam: Camera, b: BodyModel, pose: Pose) {
  ctx.beginPath()
  if (b.shape.kind === 'circle') {
    const [sx, sy] = toScreen(cam, pose.x, pose.y)
    ctx.arc(sx, sy, b.shape.radius * cam.ppm, 0, Math.PI * 2)
    return
  }
  b.shape.verts.forEach((v, i) => {
    const wx = pose.x + pose.c * v.x - pose.s * v.y, wy = pose.y + pose.s * v.x + pose.c * v.y
    const [sx, sy] = toScreen(cam, wx, wy)
    if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy)
  })
  ctx.closePath()
}

let hatchCache: { color: string; pattern: CanvasPattern | null } | null = null
function hatch(ctx: CanvasRenderingContext2D, P: Palette): CanvasPattern | string {
  if (hatchCache && hatchCache.color === P.staticStroke) return hatchCache.pattern ?? P.staticFill
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
  hatchCache = { color: P.staticStroke, pattern }
  return pattern ?? P.staticFill
}

export function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, width = 2.2, dashed = false) {
  const dx = x1 - x0, dy = y1 - y0
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1.5) return
  const ux = dx / len, uy = dy / len
  const head = Math.min(10, 0.35 * len + 4)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = width
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

function tag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, P: Palette, font = `12px ${FONT}`) {
  ctx.font = font
  const w = ctx.measureText(text).width
  ctx.fillStyle = P.labelBg
  ctx.beginPath()
  ctx.roundRect(x - 3, y - 12, w + 6, 16, 4)
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
  ctx.lineWidth = 1.8
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

export function drawScene(ctx: CanvasRenderingContext2D, cam: Camera, input: DrawInput) {
  const { sys, X, options, palette: P } = input
  const model = sys.model
  ctx.fillStyle = P.bg
  ctx.fillRect(0, 0, cam.width, cam.height)
  drawGrid(ctx, cam, P, options.axes, options.grid)
  const poses = computePoses(model, X)

  // trajectories
  if (options.trajectory && input.trajectories && input.rec) {
    for (const b of model.dynamic) {
      const tr = input.trajectories.get(b.id)
      if (!tr) continue
      const upto = Math.min(tr.length / 2, input.frame + 1)
      if (upto < 2) continue
      ctx.strokeStyle = b.def.color
      ctx.globalAlpha = 0.55
      ctx.lineWidth = 1.6
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      const stride = Math.max(1, Math.floor(upto / 3000))
      for (let k = 0; k < upto; k += stride) {
        const [sx, sy] = toScreen(cam, tr[2 * k], tr[2 * k + 1])
        if (k === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy)
      }
      const [lx, ly] = toScreen(cam, tr[2 * (upto - 1)], tr[2 * (upto - 1) + 1])
      ctx.lineTo(lx, ly)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }
  }

  // bodies: static first
  const order = [...model.bodies].sort((a, b) => Number(a.dynamic) - Number(b.dynamic))
  for (const b of order) {
    const pose = poses[b.global]
    bodyPath(ctx, cam, b, pose)
    if (!b.dynamic) {
      ctx.fillStyle = hatch(ctx, P)
      ctx.fill()
      ctx.strokeStyle = P.staticStroke
      ctx.lineWidth = 1.2
      ctx.stroke()
      if (b.beltSpeed !== 0 && b.shape.kind === 'polygon') drawBelt(ctx, cam, b, pose, input.time, P)
    } else {
      ctx.fillStyle = b.def.color
      ctx.globalAlpha = 0.88
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      ctx.lineWidth = 1
      ctx.stroke()
      if (b.shape.kind === 'circle') {
        // orientation mark
        const [sx, sy] = toScreen(cam, pose.x, pose.y)
        const r = b.shape.radius * cam.ppm
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + pose.c * r, sy - pose.s * r); ctx.stroke()
      }
      const [cx, cy] = toScreen(cam, pose.x, pose.y)
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, Math.PI * 2); ctx.fill()
    }
    if (b.id === input.selectedId || b.id === input.hoverId) {
      bodyPath(ctx, cam, b, pose)
      ctx.strokeStyle = P.accent
      ctx.lineWidth = b.id === input.selectedId ? 2.5 : 1.5
      ctx.setLineDash(b.id === input.selectedId ? [] : [4, 3])
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  // pulleys
  for (const p of model.pulleys) {
    const [sx, sy] = toScreen(cam, p.position.x, p.position.y)
    const r = Math.max(3, p.radius * cam.ppm)
    ctx.fillStyle = P.staticFill
    ctx.strokeStyle = P.staticStroke
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = P.staticStroke
    ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI * 2); ctx.fill()
    if (p.id === input.selectedId) { ctx.strokeStyle = P.accent; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(sx, sy, r + 3, 0, Math.PI * 2); ctx.stroke() }
  }

  // connectors
  model.ropes.forEach((r, k) => {
    const path = ropeKin(poses, r).path
    const taut = input.mode ? input.mode.taut[k] : true
    const slack = r.length - path.length
    ctx.strokeStyle = r.id === input.selectedId ? P.accent : P.rope
    ctx.lineWidth = r.id === input.selectedId ? 2.6 : 1.6
    ctx.beginPath()
    const pts = path.points.map(p => toScreen(cam, p.x, p.y))
    if (!taut && slack > 1e-6 && r.pulleys.length === 0) {
      // slack rope: a sagging curve whose arc is about the rope length (visual only)
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
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
    ctx.lineCap = 'butt'
  }
  for (const h of model.hinges) {
    const pa = anchorState(poses, h.a)
    const [x, y] = toScreen(cam, pa.px, pa.py)
    ctx.fillStyle = P.bg
    ctx.strokeStyle = h.id === input.selectedId ? P.accent : P.staticStroke
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    if (!h.a.body?.dynamic || !h.b.body?.dynamic) {
      // ground support symbol
      ctx.beginPath(); ctx.moveTo(x - 8, y - 12); ctx.lineTo(x + 8, y - 12); ctx.stroke()
    }
  }
  for (const f of model.forces) {
    if (options.forces) continue
    const p = anchorState(poses, f.a)
    const [x0, y0] = toScreen(cam, p.px, p.py)
    arrow(ctx, x0, y0, x0 + f.force.x * input.scales.f, y0 - f.force.y * input.scales.f, P.applied)
  }

  // vectors
  const n = sys.n
  for (const b of model.dynamic) {
    const pose = poses[b.global]
    const [sx, sy] = toScreen(cam, pose.x, pose.y)
    if (options.velocity) {
      const vx = X[3 * n + 3 * b.index], vy = X[3 * n + 3 * b.index + 1]
      arrow(ctx, sx, sy, sx + vx * input.scales.v, sy - vy * input.scales.v, P.velocity, 2.2, input.editing)
      const speed = Math.sqrt(vx * vx + vy * vy)
      if (speed * input.scales.v > 14 && !input.editing) tag(ctx, sx + vx * input.scales.v + 4, sy - vy * input.scales.v - 4, `v = ${fmt(speed, input.digits)} m/s`, P.velocity, P, `11px ${MONO}`)
    }
    if (options.acceleration && input.sol) {
      const ax = input.sol.acc[3 * b.index], ay = input.sol.acc[3 * b.index + 1]
      arrow(ctx, sx, sy, sx + ax * input.scales.a, sy - ay * input.scales.a, P.acceleration, 2.2)
      const am = Math.sqrt(ax * ax + ay * ay)
      if (am * input.scales.a > 14) tag(ctx, sx + ax * input.scales.a + 4, sy - ay * input.scales.a + 14, `a = ${fmt(am, input.digits)} m/s²`, P.acceleration, P, `11px ${MONO}`)
    }
  }
  if (options.forces && !input.editing) {
    const targets = options.forcesAll ? model.dynamic : model.dynamic.filter(b => b.id === input.selectedId)
    for (const b of targets) {
      for (const f of bodyForces(input, b, poses)) {
        const [x0, y0] = toScreen(cam, f.x, f.y)
        // very large forces are drawn shortened (the label keeps the true value)
        const len = Math.hypot(f.fx, f.fy) * input.scales.f, maxLen = 0.3 * Math.min(cam.width, cam.height)
        const k = len > maxLen ? maxLen / len : 1
        const x1 = x0 + f.fx * input.scales.f * k, y1 = y0 - f.fy * input.scales.f * k
        arrow(ctx, x0, y0, x1, y1, f.color, 2.4)
        const mag = Math.sqrt(f.fx * f.fx + f.fy * f.fy)
        if (mag * input.scales.f > 5) tag(ctx, x1 + 4, y1 + (f.fy > 0 ? -4 : 14), `${f.label} = ${fmt(mag, input.digits)} N${k < 1 ? '（箭头已缩短）' : ''}`, f.color, P, `11px ${MONO}`)
      }
    }
  }

  // names
  if (options.names) {
    ctx.font = `12px ${FONT}`
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

  // key moments
  if (options.labels && input.rec && !input.editing) drawKeyMoments(ctx, cam, input)

  // pending connector preview
  if (input.pending) {
    const [x0, y0] = toScreen(cam, input.pending.world.x, input.pending.world.y)
    ctx.strokeStyle = P.accent
    ctx.setLineDash([6, 4])
    ctx.lineWidth = 1.5
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
  for (let f = 0; f < verts.length; f++) {
    const n = b.shape.normals[f]
    const wn = { x: pose.c * n.x - pose.s * n.y, y: pose.s * n.x + pose.c * n.y }
    if (wn.y < 0.3) continue // only faces things can rest on
    const a = verts[f], c = verts[(f + 1) % verts.length]
    const len = b.shape.lengths[f]
    const tx = (c.x - a.x) / len, ty = (c.y - a.y) / len // CCW edge direction; the surface moves along −t for u > 0
    const spacing = 0.25
    const phase = ((-b.beltSpeed * time) % spacing + spacing) % spacing
    for (let s = phase; s < len; s += spacing) {
      const lx = a.x + tx * s - n.x * 0.03, ly = a.y + ty * s - n.y * 0.03
      const wx = pose.x + pose.c * lx - pose.s * ly, wy = pose.y + pose.s * lx + pose.c * ly
      const [sx, sy] = toScreen(cam, wx, wy)
      const dirx = -Math.sign(b.beltSpeed) * (pose.c * tx - pose.s * ty), diry = -Math.sign(b.beltSpeed) * (pose.s * tx + pose.c * ty)
      ctx.beginPath()
      ctx.moveTo(sx + dirx * 5, sy - diry * 5)
      ctx.lineTo(sx - dirx * 3 + diry * 3, sy + diry * 3 + dirx * 3)
      ctx.lineTo(sx - dirx * 3 - diry * 3, sy + diry * 3 - dirx * 3)
      ctx.closePath()
      ctx.globalAlpha = 0.6
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }
  ctx.restore()
}

const CHANGE_TEXT: Record<string, string> = {
  impact: '碰撞', touch: '接触', separate: '分离', stick: '相对静止（共速）', slip: '开始相对滑动', reverse: '相对滑动反向', slack: '绳松弛', taut: '绳绷紧', leave: '离开'
}

export function eventLabel(change: { type: string }): string { return CHANGE_TEXT[change.type] ?? change.type }

function drawKeyMoments(ctx: CanvasRenderingContext2D, cam: Camera, input: DrawInput) {
  const rec = input.rec!
  const P = input.palette
  let placed = 0
  for (const e of rec.events) {
    if (e.t > input.time + 1e-12) break
    if (e.changes.length === 0) continue
    const c = e.changes[0]
    const body = rec.system.model.byId.get(c.bodies.find(id => rec.system.model.byId.get(id)?.dynamic) ?? '')
    if (!body || !body.dynamic) continue
    const x = c.point?.x ?? e.before[3 * body.index], y = c.point?.y ?? e.before[3 * body.index + 1]
    const [sx, sy] = toScreen(cam, x, y)
    ctx.fillStyle = P.accent
    ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = P.accent
    ctx.lineWidth = 1
    const ly = sy - 30 - (placed % 4) * 20
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, ly + 4); ctx.stroke()
    const who = c.bodies.map(id => rec.system.model.byId.get(id)?.name ?? rec.system.model.ropes.find(r => r.id === id)?.name ?? id).join('–')
    const text = `${who} ${e.changes.map(eventLabel).filter((v, i, a) => a.indexOf(v) === i).join('、')}  t = ${fmt(e.t, input.digits)} s`
    tag(ctx, sx + 3, ly, text, P.accent, P, `11px ${FONT}`)
    placed++
  }
}

/** Centre-of-mass paths of every dynamic body over the whole recording. */
export function computeTrajectories(rec: Recording): Map<string, Float64Array> {
  const out = new Map<string, Float64Array>()
  for (const b of rec.system.model.dynamic) {
    const arr = new Float64Array(rec.frameCount * 2)
    for (let k = 0; k < rec.frameCount; k++) {
      arr[2 * k] = rec.states[k * rec.size + 3 * b.index]
      arr[2 * k + 1] = rec.states[k * rec.size + 3 * b.index + 1]
    }
    out.set(b.id, arr)
  }
  return out
}

/** Vector scales chosen once per recording so arrows keep their meaning while playing. */
export function vectorScales(rec: Recording | null, sys: System): { v: number; a: number; f: number } {
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

