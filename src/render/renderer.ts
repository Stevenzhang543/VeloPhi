/**
 * Canvas 2D renderer. Draws a frame view (engine/views.ts); it never computes physics of its own — every
 * position, force and velocity drawn comes from the Rust core (poses, anchors, rope paths, forces, accelerations).
 *
 * Numbers on the canvas go through the unit choice in `DrawInput.units`; sizes of type and strokes follow
 * `DrawInput.style` (projector mode). Optional layers let `renderFrame` put purely visual effects (motion
 * blur, trails, particles) underneath or on top of the bodies.
 */
import { tl, listSep, paren } from '../i18n'
import type { BodyModel, System } from '../engine/model'
import type { Recording } from '../engine/recording'
import type { ForceKind, FrameView, Pose } from '../engine/views'
import { positions, vectorScalesOf } from '../engine/views'
import type { EngineSession } from '../engine/session'
import type { AnnotationDef } from '../core/scene/types'
import type { UnitChoice } from '../units/units'
import type { RenderStyle } from './style'
import { FONT, MONO, beginRender, currentStyle, disp, font, fpx, lw, q, tickText, unit } from './style'
import { drawAnnotations } from './annotations'
import { drawChargeSign, drawFieldMap, drawUniformFields, fieldLegend, frameSources, visibleFieldMap } from './fields'
import { drawRailLoops, drawRegions } from './regions'
import type { Highlight } from '../formula/panel'

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
  /** Electric and magnetic forces, field lines and charge signs (26.54; optional for palettes made elsewhere). */
  electric?: string; magnetic?: string; positive?: string; negative?: string
}

/** Palette of the light theme. */
export const LIGHT: Palette = {
  bg: '#fbfbfd', gridMinor: 'rgba(60,60,67,0.06)', gridMajor: 'rgba(60,60,67,0.15)', text: '#1c1c1e', text2: 'rgba(60,60,67,0.7)', accent: '#0a6cff',
  velocity: '#16a34a', acceleration: '#ea580c', gravity: '#7c3aed', normal: '#2563eb', friction: '#dc2626', tension: '#0891b2', spring: '#ca8a04', applied: '#db2777',
  staticFill: '#d7dbe2', staticStroke: '#6b7280', rope: '#44403c', label: '#1c1c1e', labelBg: 'rgba(255,255,255,0.92)',
  spark: '#f59e0b', dust: '#8b8378', note: '#c2410c',
  electric: '#0f766e', magnetic: '#a16207', positive: '#dc2626', negative: '#2563eb'
}
/** Palette of the dark theme. */
export const DARK: Palette = {
  bg: '#141518', gridMinor: 'rgba(235,235,245,0.05)', gridMajor: 'rgba(235,235,245,0.13)', text: '#f5f5f7', text2: 'rgba(235,235,245,0.7)', accent: '#3b8bff',
  velocity: '#4ade80', acceleration: '#fb923c', gravity: '#a78bfa', normal: '#60a5fa', friction: '#f87171', tension: '#22d3ee', spring: '#facc15', applied: '#f472b6',
  staticFill: '#2c2f36', staticStroke: '#8b93a1', rope: '#d6d3d1', label: '#f5f5f7', labelBg: 'rgba(28,28,31,0.92)',
  spark: '#fcd34d', dust: '#b8b0a4', note: '#fdba74',
  electric: '#2dd4bf', magnetic: '#fbbf24', positive: '#f87171', negative: '#60a5fa'
}

/** What the canvas shows (the overlay toggles). */
export interface DrawOptions {
  velocity: boolean; acceleration: boolean; forces: boolean; forcesAll: boolean
  trajectory: boolean; labels: boolean; grid: boolean; axes: boolean; names: boolean
  /** Stroboscopic picture (render/strobe.ts); absent: off. */
  strobe?: boolean; strobeInterval?: number; strobeCount?: number; strobeOpacity?: number; strobeLabels?: boolean
  /** 26.54 (D78–D79): symbols of the uniform fields (absent: on), field lines and equipotentials of the charges. */
  fields?: boolean; fieldLines?: boolean; equipotentials?: boolean
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
  /** What is drawn: poses, anchors, ropes, forces and accelerations from the core. */
  view: FrameView
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
  trajectories: Trajectories | null
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
  /** What a hovered formula card or known variable refers to (26.53, D72). */
  highlight?: Highlight | null
  /** Region selected in the editor (26.55): highlighted with its resize handles. */
  selectedRegion?: string | null
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

/**
 * The grid and axes, drawn once into an offscreen canvas and copied while nothing they depend on changes (26.55, D97:
 * a static camera redrew some hundred lines and labels on every frame). The key holds the camera, the canvas size
 * and transform, the colours, the style factors, the length unit and the state of the web fonts.
 */
let gridCache: { key: string; canvas: HTMLCanvasElement | OffscreenCanvas } | null = null
function drawGrid(ctx: CanvasRenderingContext2D, cam: Camera, P: Palette, axes: boolean, grid: boolean) {
  if (!axes && !grid) return
  const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null
  const target = ctx.canvas as HTMLCanvasElement | OffscreenCanvas | undefined
  if (!m || m.b !== 0 || m.c !== 0 || !target || (typeof OffscreenCanvas === 'undefined' && typeof document === 'undefined')) { paintGrid(ctx, cam, P, axes, grid); return }
  const st = currentStyle()
  const fonts = typeof document !== 'undefined' && document.fonts ? `${document.fonts.status}${document.fonts.size}` : ''
  const key = [cam.cx, cam.cy, cam.ppm, cam.width, cam.height, target.width, target.height, m.a, m.d, m.e, m.f, P.bg, P.gridMinor, P.gridMajor, P.text2, axes, grid, st.font, st.line, unit('m'), disp(1, 'm'), fonts].join('|')
  if (!gridCache || gridCache.key !== key) {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(target.width, target.height) : Object.assign(document.createElement('canvas'), { width: target.width, height: target.height })
    const g = c.getContext('2d') as CanvasRenderingContext2D | null
    if (!g) { paintGrid(ctx, cam, P, axes, grid); return }
    g.setTransform(m.a, 0, 0, m.d, m.e, m.f)
    paintGrid(g, cam, P, axes, grid)
    gridCache = { key, canvas: c }
  }
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(gridCache.canvas as CanvasImageSource, 0, 0)
  ctx.restore()
}

function paintGrid(ctx: CanvasRenderingContext2D, cam: Camera, P: Palette, axes: boolean, grid: boolean) {
  const minor = minorGridStep(cam.ppm), major = minor * 5
  const topLeft = toWorld(cam, 0, 0), br = toWorld(cam, cam.width, cam.height)
  if (grid) {
    for (const [step, color] of [[minor, P.gridMinor], [major, P.gridMajor]] as Array<[number, string]>) {
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = Math.ceil(topLeft.x / step) * step; x <= br.x; x += step) { const [sx] = toScreen(cam, x, 0); ctx.moveTo(Math.round(sx) + 0.5, 0); ctx.lineTo(Math.round(sx) + 0.5, cam.height) }
      for (let y = Math.ceil(br.y / step) * step; y <= topLeft.y; y += step) { const [, sy] = toScreen(cam, 0, y); ctx.moveTo(0, Math.round(sy) + 0.5); ctx.lineTo(cam.width, Math.round(sy) + 0.5) }
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
    for (let x = Math.ceil(topLeft.x / major) * major; x <= br.x; x += major) {
      if (Math.abs(x) < major * 1e-6 || (Math.round(x / major) % every) !== 0) continue
      const [sx] = toScreen(cam, x, 0)
      const s = tickText(disp(x, 'm'))
      ctx.fillText(s, sx + 3, ly)
    }
    const lx = Math.max(4, Math.min(cam.width - 40, ox + 4))
    for (let y = Math.ceil(br.y / major) * major; y <= topLeft.y; y += major) {
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
  // 26.52 (D35): a concave polygon or compound body is drawn part by part (the seams of a compound show)
  const loops: Array<{ kind: 'circle'; center: { x: number; y: number }; radius: number } | { kind: 'polygon'; verts: Array<{ x: number; y: number }> }> =
    b.shape.kind === 'polygon' ? [{ kind: 'polygon', verts: b.shape.verts }] : b.shape.outline
  for (const loop of loops) {
    if (loop.kind === 'circle') {
      const wx = pose.x + pose.c * loop.center.x - pose.s * loop.center.y, wy = pose.y + pose.s * loop.center.x + pose.c * loop.center.y
      const [sx, sy] = toScreen(cam, wx, wy)
      ctx.moveTo(sx + loop.radius * cam.ppm, sy)
      ctx.arc(sx, sy, loop.radius * cam.ppm, 0, Math.PI * 2)
      continue
    }
    const verts = loop.verts
    for (let i = 0; i < verts.length; i++) {
      const v = verts[i]
      const wx = pose.x + pose.c * v.x - pose.s * v.y, wy = pose.y + pose.s * v.x + pose.c * v.y
      const sx = cam.width / 2 + (wx - cam.cx) * cam.ppm, sy = cam.height / 2 - (wy - cam.cy) * cam.ppm
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy)
    }
    ctx.closePath()
  }
}

/** Highest point of a body at a pose (world y). */
function bodyTop(b: BodyModel, pose: Pose): number {
  if (b.shape.kind === 'circle') return pose.y + b.shape.radius
  let top = -Infinity
  if (b.shape.kind === 'polygon') { for (const v of b.shape.verts) top = Math.max(top, pose.y + pose.s * v.x + pose.c * v.y); return top }
  for (const p of b.shape.outline) {
    if (p.kind === 'circle') top = Math.max(top, pose.y + pose.s * p.center.x + pose.c * p.center.y + p.radius)
    else for (const v of p.verts) top = Math.max(top, pose.y + pose.s * v.x + pose.c * v.y)
  }
  return top
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

/** A screen rectangle taken by a label (26.53). */
export interface LabelBox { x: number; y: number; w: number; h: number }

/**
 * A label like `tag`, moved up or down in steps of one line until it no longer covers a label placed before it
 * (26.53: force labels at a shared contact point used to print over each other). The rectangle is added to
 * `placed`; when no free place is found within four lines either way the label goes where it was asked.
 */
export function placeTag(ctx: CanvasRenderingContext2D, placed: LabelBox[], x: number, y: number, text: string, color: string, P: Palette, fontSpec = font(12)) {
  ctx.font = fontSpec
  const w = ctx.measureText(text).width + 6
  const m = /(\d+(?:\.\d+)?)px/.exec(fontSpec)
  const h = (m ? parseFloat(m[1]) : 12) + 4
  const free = (yy: number) => placed.every(r => x - 3 >= r.x + r.w || x - 3 + w <= r.x || yy - h + 4 >= r.y + r.h || yy + 4 <= r.y)
  let yy = y
  for (let k = 1; k <= 8 && !free(yy); k++) yy = y + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (h + 1)
  if (!free(yy)) yy = y
  placed.push({ x: x - 3, y: yy - h + 4, w, h })
  tag(ctx, x, yy, text, color, P, fontSpec)
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

/** Damper (dashpot): a rod from A ending in a piston inside a cup fixed to B. */
function drawDamper(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, ppm: number) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux
  const w = Math.max(5, Math.min(10, 0.045 * ppm))
  const at = (t: number, side = 0): [number, number] => [x0 + ux * t + nx * side, y0 + uy * t + ny * side]
  const cupOpen = len * 0.3, cupBottom = len * 0.68, piston = len * 0.5
  ctx.strokeStyle = color
  ctx.lineWidth = lw(1.8)
  ctx.beginPath()
  // Rod and piston from A
  ctx.moveTo(x0, y0); ctx.lineTo(...at(piston))
  ctx.moveTo(...at(piston, -w * 0.75)); ctx.lineTo(...at(piston, w * 0.75))
  // Cup from B
  ctx.moveTo(...at(cupOpen, -w)); ctx.lineTo(...at(cupBottom, -w)); ctx.lineTo(...at(cupBottom, w)); ctx.lineTo(...at(cupOpen, w))
  ctx.moveTo(...at(cupBottom)); ctx.lineTo(x1, y1)
  ctx.stroke()
}

/** Small gear glyph (teeth as ticks) at a screen point. */
function drawGearGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath()
  for (let k = 0; k < 8; k++) {
    const a = angle + (k * Math.PI) / 4
    ctx.moveTo(x + Math.cos(a) * r, y - Math.sin(a) * r)
    ctx.lineTo(x + Math.cos(a) * (r + 3), y - Math.sin(a) * (r + 3))
  }
  ctx.stroke()
}

/** Category of a force (the free-body diagram orders and names forces by it). */
export type { ForceKind } from '../engine/views'
/** A force to draw: application point (m), components (N), colour and label. */
export interface ForceArrow { x: number; y: number; fx: number; fy: number; color: string; label: string; kind: ForceKind }

/** Colour of a force kind. */
export function forceColor(kind: ForceKind | 'other', P: Palette): string {
  switch (kind) {
    case 'gravity': case 'attract': case 'central': return P.gravity
    case 'normal': case 'limit': return P.normal
    case 'friction': case 'drag': return P.friction
    case 'tension': case 'pin': return P.tension
    case 'spring': case 'damper': return P.spring
    case 'applied': return P.applied
    case 'electric': case 'coulomb': return P.electric ?? '#0f766e'
    case 'magnetic': case 'ampere': return P.magnetic ?? '#a16207'
    case 'buoyancy': return P.normal
    default: return P.text2
  }
}

/** Display text of a force label of the core (source texts such as F弹 are translated; N1, T … stay). */
export function forceLabel(label: string): string { return /[^\x00-\x7f]/.test(label) ? tl(label) : label }

/** Name of a force kind (source text; the formula panel's canvas filter, D72). */
export function forceLabelOfKind(kind: ForceKind | 'other'): string {
  const names: Record<ForceKind | 'other', string> = {
    gravity: '重力', normal: '支持力', limit: '限位力', friction: '摩擦力', tension: '拉力', pin: '铰链力', spring: '弹力', damper: '阻尼力',
    drag: '空气阻力', attract: '引力', central: '有心力', applied: '外力', electric: '电场力', magnetic: '洛伦兹力', coulomb: '库仑力', buoyancy: '浮力', ampere: '安培力', other: '其他力'
  }
  return names[kind]
}

/** Forces acting on a body (computed in the core with the frame view: gravity, contacts, connectors, applied forces). */
export function bodyForces(input: Pick<DrawInput, 'view' | 'palette'>, b: BodyModel): ForceArrow[] {
  return (input.view.forces.get(b.global) ?? []).map(f => ({ x: f.x, y: f.y, fx: f.fx, fy: f.fy, kind: f.kind, color: forceColor(f.kind, input.palette), label: forceLabel(f.label) }))
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
  const { sys, view, options, palette: P } = input
  beginRender(input.style, input.units)
  const model = sys.model
  ctx.fillStyle = P.bg
  ctx.fillRect(0, 0, cam.width, cam.height)
  drawGrid(ctx, cam, P, options.axes, options.grid)
  const poses = view.poses
  // 26.55 (D90–D92): field regions, liquids and rail loops under everything else
  if (model.settings.regions?.length) drawRegions(ctx, cam, model.settings, input.time + (model.settings.startTime ?? 0), P, input.digits, input.editing ? input.selectedRegion ?? null : null)
  if (model.settings.railLoops?.length) drawRailLoops(ctx, cam, model.settings, id => model.byId.get(id)?.def.position ?? null, P, input.digits)
  // 26.54 (D78–D79): uniform fields, then the field lines and equipotentials of the charges (computed by the core)
  if (options.fields !== false) drawUniformFields(ctx, cam, model.settings, P)
  if (options.fieldLines || options.equipotentials) {
    const map = visibleFieldMap(ctx.canvas, cam, frameSources(sys, poses), !!options.equipotentials)
    if (map) drawFieldMap(ctx, cam, map, P, !!options.fieldLines, !!options.equipotentials)
  }
  const A = view.anchors
  const pulleyAt = (i: number) => ({ x: view.pulleys[2 * i], y: view.pulleys[2 * i + 1] })
  const hl = input.editing ? null : input.highlight ?? null

  // Trajectories
  if (options.trajectory && input.trajectories && input.rec) {
    for (const b of model.dynamic) {
      const tr = input.trajectories.paths.get(b.id)
      if (!tr) continue
      const upto = trajectoryUpTo(input.trajectories, input.frame)
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
  model.pulleys.forEach((p, i) => {
    if (!p.body) return
    const c = pulleyAt(i), bp = poses[p.body.global]
    const [x0, y0] = toScreen(cam, c.x, c.y), [x1, y1] = toScreen(cam, bp.x, bp.y)
    ctx.strokeStyle = P.staticStroke
    ctx.lineWidth = lw(2)
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
  })

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
      const sel = b.id === input.selectedId
      bodyPath(ctx, cam, b, pose)
      ctx.strokeStyle = P.accent
      ctx.lineWidth = lw(sel ? 2.5 : 1.5)
      ctx.setLineDash(sel ? [] : [4, 3])
      // 26.52 (D57): a soft halo marks the selection
      if (sel) { ctx.save(); ctx.shadowColor = P.accent; ctx.shadowBlur = 10; ctx.stroke(); ctx.restore() } else ctx.stroke()
      ctx.setLineDash([])
    }
    // 26.54 (D78): sign of the charge
    if (b.def.charge) drawChargeSign(ctx, cam, b, pose, P)
    // 26.53 (D72): the bodies of a hovered formula glow
    if (hl && hl.bodies.includes(b.id)) {
      bodyPath(ctx, cam, b, pose)
      ctx.save()
      ctx.strokeStyle = P.accent; ctx.lineWidth = lw(2.4); ctx.shadowColor = P.accent; ctx.shadowBlur = 14
      ctx.stroke(); ctx.restore()
    }
  }

  // Pulleys
  model.pulleys.forEach((p, pi) => {
    const c = pulleyAt(pi)
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
  })

  // Connectors
  model.ropes.forEach((r, k) => {
    const path = view.ropes[k]
    const taut = path.taut
    const slack = r.length - path.length
    const lit = !!hl && hl.connectors.includes('rope')
    ctx.strokeStyle = r.id === input.selectedId || lit ? P.accent : P.rope
    ctx.lineWidth = lw(r.id === input.selectedId || lit ? 2.6 : 1.6)
    ctx.save()
    if (lit) { ctx.shadowColor = P.accent; ctx.shadowBlur = 10 }
    ctx.beginPath()
    const pts: Array<[number, number]> = []
    for (let i = 0; i + 1 < path.points.length; i += 2) pts.push(toScreen(cam, path.points[i], path.points[i + 1]))
    if (!taut && slack > 1e-6 && r.pulleys.length === 0) {
      // Slack rope: a sagging curve whose arc is about the rope length (visual only)
      const [x0, y0] = pts[0], [x1, y1] = pts[1]
      const sag = Math.sqrt(Math.max(0, (r.length * r.length - path.length * path.length))) * 0.5 * cam.ppm
      ctx.moveTo(x0, y0)
      ctx.quadraticCurveTo((x0 + x1) / 2, Math.max(y0, y1) + sag, x1, y1)
    } else {
      for (let i = 0; i + 1 < pts.length; i += 2) { ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]) }
      for (let i = 0; i + 5 < path.arcs.length; i += 6) {
        const ax = path.arcs[i], ay = path.arcs[i + 1], ar = path.arcs[i + 2], from = path.arcs[i + 3], to = path.arcs[i + 4], wrap = path.arcs[i + 5]
        const [sx, sy] = toScreen(cam, ax, ay)
        ctx.moveTo(sx + Math.cos(-from) * ar * cam.ppm, sy + Math.sin(-from) * ar * cam.ppm)
        ctx.arc(sx, sy, ar * cam.ppm, -from, -to, wrap < 0)
      }
    }
    ctx.stroke()
    ctx.restore()
  })
  model.springs.forEach((s, i) => {
    const [x0, y0] = toScreen(cam, A.springs[4 * i], A.springs[4 * i + 1]), [x1, y1] = toScreen(cam, A.springs[4 * i + 2], A.springs[4 * i + 3])
    const lit = !!hl && hl.connectors.includes('spring')
    const color = s.id === input.selectedId || lit ? P.accent : P.rope
    ctx.save()
    if (lit) { ctx.shadowColor = P.accent; ctx.shadowBlur = 10 }
    if (s.damper) drawDamper(ctx, x0, y0, x1, y1, color, cam.ppm)
    else drawSpring(ctx, x0, y0, x1, y1, color, cam.ppm)
    ctx.restore()
  })
  model.rods.forEach((r, i) => {
    const [x0, y0] = toScreen(cam, A.rods[4 * i], A.rods[4 * i + 1]), [x1, y1] = toScreen(cam, A.rods[4 * i + 2], A.rods[4 * i + 3])
    ctx.strokeStyle = r.id === input.selectedId ? P.accent : P.rope
    ctx.lineWidth = lw(4)
    ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
    ctx.lineCap = 'butt'
  })
  // Connectors of 26.51: sliders (rail and carriage), welds, motors, gears
  model.sliders.forEach((sl, i) => {
    const pa = { px: A.sliders[6 * i], py: A.sliders[6 * i + 1] }, pb = { px: A.sliders[6 * i + 2], py: A.sliders[6 * i + 3] }
    const ax = A.sliders[6 * i + 4], ay = A.sliders[6 * i + 5]
    const reach = Math.max(1.5, Math.hypot(pb.px - pa.px, pb.py - pa.py) + 0.5)
    const [x0, y0] = toScreen(cam, pa.px - ax * reach, pa.py - ay * reach), [x1, y1] = toScreen(cam, pa.px + ax * reach, pa.py + ay * reach)
    const sel = sl.id === input.selectedId
    ctx.strokeStyle = sel ? P.accent : P.staticStroke
    ctx.lineWidth = lw(sel ? 2 : 1.4)
    ctx.setLineDash([6, 4])
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
    ctx.setLineDash([])
    // 26.52: end stops as bars across the rail at s_min and s_max
    if (sl.limited) {
      ctx.lineWidth = lw(3)
      for (const s of [sl.lo, sl.hi]) {
        if (!Number.isFinite(s)) continue
        const [sx, sy] = toScreen(cam, pa.px + ax * s, pa.py + ay * s)
        ctx.beginPath(); ctx.moveTo(sx - ay * 9, sy - ax * 9); ctx.lineTo(sx + ay * 9, sy + ax * 9); ctx.stroke()
      }
      ctx.lineWidth = lw(sel ? 2 : 1.4)
    }
    const [bx, by] = toScreen(cam, pb.px, pb.py)
    const ang = Math.atan2(ay, ax)
    ctx.save(); ctx.translate(bx, by); ctx.rotate(-ang)
    ctx.fillStyle = P.bg; ctx.lineWidth = lw(2)
    ctx.beginPath(); ctx.roundRect(-9, -5, 18, 10, 2); ctx.fill(); ctx.stroke()
    ctx.restore()
  })
  // 26.52: central fields: the centre with four short arrows in (attraction) or out (repulsion)
  model.centrals.forEach((c, ci) => {
    const [x, y] = toScreen(cam, A.centrals[2 * ci], A.centrals[2 * ci + 1])
    const sel = c.id === input.selectedId
    const col = sel ? P.accent : P.gravity
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw(1.6)
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill()
    const inward = c.k >= 0
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a)
      const r0 = inward ? 22 : 12, r1 = inward ? 12 : 22
      const x0 = x + ca * r0, y0 = y + sa * r0, x1 = x + ca * r1, y1 = y + sa * r1
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
      const dx = (x1 - x0) / 10, dy = (y1 - y0) / 10
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - 4 * dx - 3 * dy, y1 - 4 * dy + 3 * dx); ctx.lineTo(x1 - 4 * dx + 3 * dy, y1 - 4 * dy - 3 * dx); ctx.closePath(); ctx.fill()
    }
  })
  model.welds.forEach((w, wi) => {
    const [x, y] = toScreen(cam, A.welds[2 * wi], A.welds[2 * wi + 1])
    ctx.fillStyle = w.id === input.selectedId ? P.accent : P.staticStroke
    const th = w.a.body && w.a.body.dynamic ? poses[w.a.body.global].th : 0
    ctx.save(); ctx.translate(x, y); ctx.rotate(-th)
    ctx.fillRect(-5, -5, 10, 10)
    ctx.strokeStyle = P.bg; ctx.lineWidth = lw(1.4)
    ctx.beginPath(); ctx.moveTo(-3.5, -3.5); ctx.lineTo(3.5, 3.5); ctx.moveTo(3.5, -3.5); ctx.lineTo(-3.5, 3.5); ctx.stroke()
    ctx.restore()
    if (!w.a.body?.dynamic || !w.b.body?.dynamic) { ctx.strokeStyle = P.staticStroke; ctx.lineWidth = lw(2); ctx.beginPath(); ctx.moveTo(x - 8, y - 12); ctx.lineTo(x + 8, y - 12); ctx.stroke() }
  })
  model.motors.forEach((m, mi) => {
    const [x, y] = toScreen(cam, A.motors[2 * mi], A.motors[2 * mi + 1])
    const sel = m.id === input.selectedId
    ctx.strokeStyle = sel ? P.accent : P.applied
    ctx.lineWidth = lw(2)
    // Arc arrow in the sense of the drive (counter-clockwise for a positive speed or torque)
    const sense = (m.mode === 'speed' ? m.speed : m.torque) >= 0 ? 1 : -1
    const r = 11, a0 = -0.6, a1 = 3.6
    ctx.beginPath(); ctx.arc(x, y, r, -a0, -a1, true); ctx.stroke()
    const end = sense > 0 ? a1 : a0, tip = { x: x + Math.cos(end) * r, y: y - Math.sin(end) * r }
    const dir = sense > 0 ? end + Math.PI / 2 : end - Math.PI / 2
    ctx.beginPath()
    ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x - Math.cos(dir - 0.5) * 6, tip.y + Math.sin(dir - 0.5) * 6)
    ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x - Math.cos(dir + 0.5) * 6, tip.y + Math.sin(dir + 0.5) * 6)
    ctx.stroke()
    ctx.fillStyle = P.bg; ctx.strokeStyle = sel ? P.accent : P.staticStroke
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    if (!m.a.body?.dynamic) { ctx.beginPath(); ctx.moveTo(x - 8, y + 16); ctx.lineTo(x + 8, y + 16); ctx.stroke() }
  })
  for (const g of model.gears) {
    const sel = g.id === input.selectedId
    ctx.strokeStyle = sel ? P.accent : P.staticStroke
    ctx.lineWidth = lw(1.5)
    const pa = g.a ? poses[g.a.global] : null, pb = g.b ? poses[g.b.global] : null
    const sa = pa ? toScreen(cam, pa.x, pa.y) : null, sb = pb ? toScreen(cam, pb.x, pb.y) : null
    if (sa && sb) { ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(sa[0], sa[1]); ctx.lineTo(sb[0], sb[1]); ctx.stroke(); ctx.setLineDash([]) }
    if (sa && pa) drawGearGlyph(ctx, sa[0], sa[1], 6, pa.th)
    if (sb && pb) drawGearGlyph(ctx, sb[0], sb[1], 6, pb.th)
  }
  model.hinges.forEach((h, hi) => {
    const [x, y] = toScreen(cam, A.hinges[2 * hi], A.hinges[2 * hi + 1])
    ctx.fillStyle = P.bg
    ctx.strokeStyle = h.id === input.selectedId ? P.accent : P.staticStroke
    ctx.lineWidth = lw(2)
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    if (!h.a.body?.dynamic || !h.b.body?.dynamic) {
      // Ground support symbol
      ctx.beginPath(); ctx.moveTo(x - 8, y - 12); ctx.lineTo(x + 8, y - 12); ctx.stroke()
    }
  })
  model.forces.forEach((f, fi) => {
    if (options.forces && !input.editing) return
    const [x0, y0] = toScreen(cam, A.forces[4 * fi], A.forces[4 * fi + 1])
    const fx = A.forces[4 * fi + 2], fy = A.forces[4 * fi + 3]
    arrow(ctx, x0, y0, x0 + fx * input.scales.f, y0 - fy * input.scales.f, f.id === input.selectedId ? P.accent : P.applied)
  })

  if (input.layers?.overBodies) {
    ctx.save()
    input.layers.overBodies(ctx, poses)
    ctx.restore()
  }

  // Vectors (their value labels avoid each other, 26.53; 26.54, D88: the labels are drawn after all arrows, so no
  // arrow covers a label drawn before it)
  const valueFont = font(11, MONO)
  const forceLabels: LabelBox[] = []
  const pendingTags: Array<[number, number, string, string]> = []
  const later = (x: number, y: number, text: string, color: string) => { pendingTags.push([x, y, text, color]) }
  for (const b of model.dynamic) {
    const pose = poses[b.global]
    const [sx, sy] = toScreen(cam, pose.x, pose.y)
    const litV = !!hl && hl.velocity.includes(b.id)
    if (options.velocity || litV) {
      const vx = pose.vx, vy = pose.vy
      ctx.save()
      if (litV) { ctx.shadowColor = P.velocity; ctx.shadowBlur = 12 }
      arrow(ctx, sx, sy, sx + vx * input.scales.v, sy - vy * input.scales.v, P.velocity, litV ? 3.2 : 2.2, input.editing)
      ctx.restore()
      const speed = Math.sqrt(vx * vx + vy * vy)
      if (speed * input.scales.v > 14 && !input.editing) later(sx + vx * input.scales.v + 4, sy - vy * input.scales.v - 4, `v = ${q(speed, 'm/s', input.digits)}`, P.velocity)
    }
    if (options.acceleration && view.acc) {
      const ax = view.acc[3 * b.index], ay = view.acc[3 * b.index + 1]
      const am = Math.sqrt(ax * ax + ay * ay)
      // Like forces, very large accelerations are drawn shortened (the label keeps the true value)
      const len = am * input.scales.a, maxLen = 0.3 * Math.min(cam.width, cam.height), k = len > maxLen ? maxLen / len : 1
      const x1 = sx + ax * input.scales.a * k, y1 = sy - ay * input.scales.a * k
      arrow(ctx, sx, sy, x1, y1, P.acceleration, 2.2)
      if (len > 14) later(x1 + 4, y1 + fpx(14), `a = ${q(am, 'm/s²', input.digits)}${k < 1 ? tl('（箭头已缩短）') : ''}`, P.acceleration)
    }
  }
  const arrowsDrawn: ForceHit[] = []
  // Forces: the overlay, and (26.53, D72) the forces of a hovered formula on its bodies, emphasised
  const litForces = hl && hl.forces.length ? hl : null
  if ((options.forces || litForces) && !input.editing && view.forces.size) {
    const targets = model.dynamic.filter(b => (options.forces && (options.forcesAll || b.id === input.selectedId)) || (litForces && litForces.bodies.includes(b.id)))
    for (const b of targets) {
      const overlay = options.forces && (options.forcesAll || b.id === input.selectedId)
      for (const f of bodyForces(input, b)) {
        const lit = !!litForces && litForces.bodies.includes(b.id) && litForces.forces.includes(f.kind)
        if (!overlay && !lit) continue
        const [x0, y0] = toScreen(cam, f.x, f.y)
        // Very large forces are drawn shortened (the label keeps the true value)
        const len = Math.hypot(f.fx, f.fy) * input.scales.f, maxLen = 0.3 * Math.min(cam.width, cam.height)
        const k = len > maxLen ? maxLen / len : 1
        const x1 = x0 + f.fx * input.scales.f * k, y1 = y0 - f.fy * input.scales.f * k
        ctx.save()
        if (lit) { ctx.shadowColor = f.color; ctx.shadowBlur = 12 }
        arrow(ctx, x0, y0, x1, y1, f.color, lit ? 3.4 : 2.4)
        ctx.restore()
        arrowsDrawn.push({ body: b.id, kind: f.kind, x0, y0, x1, y1 })
        const mag = Math.sqrt(f.fx * f.fx + f.fy * f.fy)
        if (mag * input.scales.f > 5) later(x1 + 4, y1 + (f.fy > 0 ? -4 : fpx(14)), `${f.label} = ${q(mag, 'N', input.digits)}${k < 1 ? tl('（箭头已缩短）') : ''}`, f.color)
      }
    }
  }
  forceHits.set(ctx.canvas, arrowsDrawn)
  for (const [x, y, text, color] of pendingTags) placeTag(ctx, forceLabels, x, y, text, color, P, valueFont)
  // 26.53 (D72): the angle of a surface (θ of an incline) at the body's main contact
  if (hl && hl.angle.length && view.forces.size) {
    for (const b of model.dynamic) {
      if (!hl.angle.includes(b.id)) continue
      let best: ForceArrow | null = null
      for (const f of bodyForces(input, b)) if (f.kind === 'normal' && (!best || Math.hypot(f.fx, f.fy) > Math.hypot(best.fx, best.fy))) best = f
      if (!best) continue
      const n = Math.hypot(best.fx, best.fy)
      if (!(n > 0)) continue
      const theta = Math.atan2(Math.abs(best.fx), best.fy)
      if (!(theta > 1e-6)) continue
      const [cx, cy] = toScreen(cam, best.x, best.y)
      // Tangent of the surface, pointing down the slope
      const dir = best.fx > 0 ? -1 : 1
      const R = 34
      ctx.save()
      ctx.strokeStyle = P.accent; ctx.fillStyle = P.accent; ctx.lineWidth = lw(1.6)
      ctx.setLineDash([4, 3])
      ctx.beginPath(); ctx.moveTo(cx - dir * 6, cy); ctx.lineTo(cx + dir * (R + 18), cy); ctx.stroke()
      ctx.setLineDash([])
      const tx = Math.cos(theta), ty = Math.sin(theta)
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dir * tx * (R + 18), cy + ty * (R + 18)); ctx.stroke()
      ctx.beginPath()
      if (dir > 0) ctx.arc(cx, cy, R, 0, theta, false)
      else ctx.arc(cx, cy, R, Math.PI - theta, Math.PI, false)
      ctx.stroke()
      ctx.font = font(13)
      ctx.fillText('θ', cx + dir * (R + 6) * Math.cos(theta / 2) - (dir < 0 ? 8 : 0), cy + (R + 6) * Math.sin(theta / 2) + 5)
      ctx.restore()
    }
  }

  // Names
  if (options.names) {
    ctx.font = font(12)
    ctx.fillStyle = P.text2
    for (const b of model.dynamic) {
      const pose = poses[b.global]
      const top = bodyTop(b, pose)
      const [sx] = toScreen(cam, pose.x, pose.y)
      const [, ty] = toScreen(cam, pose.x, top)
      const w = ctx.measureText(b.name).width
      ctx.fillText(b.name, sx - w / 2, ty - 6)
    }
  }

  // Key moments
  if (options.labels && input.rec && !input.editing) drawKeyMoments(ctx, cam, input)
  else labelHits.delete(ctx.canvas)

  // Teaching annotations
  if (input.annotations && input.annotations.length) drawAnnotations(ctx, cam, input.annotations, P, input.digits, input.selectedAnnotation ?? null)
  // 26.54: values of the uniform fields
  if (options.fields !== false && (model.settings.electric || model.settings.magnetic)) fieldLegend(ctx, cam, model.settings, P, (v, u) => q(v, u, input.digits))

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
  switch: '变力切换', timestep: '改用时间步进（精度降级）', pulley: '到达滑轮', limit: '到达限位', unlimit: '离开限位',
  motorSlip: '马达打滑', motorLock: '马达恢复转速', rollStop: '滚动停止', rollStart: '开始滚动', zoneEnter: '进入场区', zoneLeave: '离开场区'
}

/** Display text of a change (a switch that is a kink has its own text). */
export function eventLabel(change: { type: string; kink?: boolean }): string {
  if (change.type === 'switch' && change.kink) return tl('变力折点')
  const text = CHANGE_TEXT[change.type]
  return text ? tl(text) : change.type
}

/** Impulses of an impact change in display units (normal impulse, plus the friction impulse if any); '' when none. */
export function impactDetail(c: { type: string; impulse?: number; tangentImpulse?: number }, digits: number): string {
  if (c.type !== 'impact' || c.impulse === undefined) return ''
  const n = `I = ${q(Math.abs(c.impulse), 'N·s', Math.min(digits, 4))}`
  return c.tangentImpulse !== undefined && Math.abs(c.tangentImpulse) > 1e-12 ? tl('{0}，摩擦冲量 {1}', [n, q(Math.abs(c.tangentImpulse), 'N·s', Math.min(digits, 4))]) : n
}

/** At most this many key-moment labels are drawn (the most recent ones); older ones keep their dot. */
const KEY_LABELS = 8

/** A key-moment dot or label on screen (CSS px) and the index of its event in `rec.events`. */
interface LabelHit { x: number; y: number; w: number; h: number; event: number }
/** Key-moment dots and labels drawn last on each canvas, in drawing order (for hit testing). */
const labelHits = new WeakMap<object, LabelHit[]>()

/** A force arrow drawn on a canvas (screen pixels), for picking it (26.53, D72). */
interface ForceHit { body: string; kind: ForceKind; x0: number; y0: number; x1: number; y1: number }
const forceHits = new WeakMap<object, ForceHit[]>()

/** The force arrow under a canvas point (within 6 px of its shaft), the last drawn first; null when none. */
export function forceArrowAt(canvas: object, sx: number, sy: number): { body: string; kind: ForceKind } | null {
  const hits = forceHits.get(canvas)
  if (!hits) return null
  for (let k = hits.length - 1; k >= 0; k--) {
    const h = hits[k]
    const dx = h.x1 - h.x0, dy = h.y1 - h.y0, L2 = dx * dx + dy * dy
    if (!(L2 > 0)) continue
    const u = Math.max(0, Math.min(1, ((sx - h.x0) * dx + (sy - h.y0) * dy) / L2))
    if (Math.hypot(h.x0 + u * dx - sx, h.y0 + u * dy - sy) <= 6) return { body: h.body, kind: h.kind }
  }
  return null
}

/**
 * Index (into `rec.events`) of the key-moment label or dot at screen point (sx, sy) (CSS px) of the frame last drawn
 * on `canvas`, or null.
 */
export function eventLabelAt(canvas: object, sx: number, sy: number): number | null {
  const hits = labelHits.get(canvas)
  if (!hits) return null
  for (let k = hits.length - 1; k >= 0; k--) {
    const h = hits[k]
    if (sx >= h.x && sx <= h.x + h.w && sy >= h.y && sy <= h.y + h.h) return h.event
  }
  return null
}

function drawKeyMoments(ctx: CanvasRenderingContext2D, cam: Camera, input: DrawInput) {
  const rec = input.rec!
  const P = input.palette
  const hits: LabelHit[] = []
  labelHits.set(ctx.canvas, hits)
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
      if (!solverNote) { solverNote = true; tag(ctx, 12, cam.height - 34, tl('t = {0} 起{1}', [q(e.t, 's', input.digits), eventLabel(c)]), P.friction, P, font(11)) }
      continue
    }
    const body = rec.system.model.byId.get(c.bodies.find(id => rec.system.model.byId.get(id)?.dynamic) ?? '')
    if (!body || !body.dynamic) continue
    if (!e.at) continue
    const x = e.at[0], y = e.at[1]
    const [sx, sy] = toScreen(cam, x, y)
    if (sx < -50 || sy < -50 || sx > cam.width + 50 || sy > cam.height + 50) continue
    ctx.fillStyle = P.accent
    ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI * 2); ctx.fill()
    hits.push({ x: sx - 6, y: sy - 6, w: 12, h: 12, event: i })
    if (labelled >= KEY_LABELS) continue
    ctx.strokeStyle = P.accent
    ctx.lineWidth = lw(1)
    const ly = sy - 30 - (labelled % 4) * fpx(20)
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, ly + 4); ctx.stroke()
    const who = c.bodies.map(id => rec.system.model.byId.get(id)?.name ?? rec.system.model.ropes.find(r => r.id === id)?.name ?? id).join('–')
    const what = e.changes.filter(ch => ch.type !== 'timestep').map(eventLabel).filter((v, i2, a) => a.indexOf(v) === i2).join(listSep())
    const detail = impactDetail(c, input.digits)
    const text = `${who} ${what}${detail ? paren(detail) : ''}  t = ${q(e.t, 's', input.digits)}`
    const f11 = font(11)
    tag(ctx, sx + 3, ly, text, P.accent, P, f11)
    const fh = parseFloat(/(\d+(?:\.\d+)?)px/.exec(f11)?.[1] ?? '11')
    hits.push({ x: sx, y: ly - fh, w: ctx.measureText(text).width + 6, h: fh + 4, event: i })
    labelled++
  }
}

// ---- Per-recording caches ----

/**
 * Centre-of-mass paths of the dynamic bodies: points at frames `ks[i]` (every `stride`-th frame; the stride
 * doubles whenever a long recording exceeds TRAIL_POINTS), x and y interleaved in `paths`. Frames that are not in
 * memory (evicted chunks of a long run) are skipped rather than recomputed. The positions come from the core.
 */
export interface Trajectories { ks: Float64Array; n: number; stride: number; paths: Map<string, Float64Array> }

/** Points kept per path before the stride doubles. */
const TRAIL_POINTS = 1 << 16

interface TrailCache { tr: Trajectories; scanned: number; provisional: boolean }
/** Per session, so the growing snapshots of one streaming run extend the same paths. */
const trailCache = new WeakMap<object, TrailCache>()

/** Number of trajectory points at or before frame k. */
export function trajectoryUpTo(tr: Trajectories, k: number): number {
  let lo = 0, hi = tr.n
  while (lo < hi) { const mid = (lo + hi) >> 1; if (tr.ks[mid] <= k) lo = mid + 1; else hi = mid }
  return lo
}

/** Centre-of-mass paths of every dynamic body up to the recording's last frame (cached and extended per run). */
export function computeTrajectories(rec: Recording): Trajectories {
  let c = trailCache.get(rec.session)
  const dyn = rec.system.model.dynamic
  if (!c) {
    c = { tr: { ks: new Float64Array(1024), n: 0, stride: 1, paths: new Map(dyn.map(b => [b.id, new Float64Array(2048)])) }, scanned: 0, provisional: false }
    trailCache.set(rec.session, c)
  }
  const tr = c.tr
  if (rec.frameCount <= c.scanned) return tr
  // The last point of the previous call was only a provisional end (off the stride)
  if (c.provisional) { tr.n--; c.provisional = false }
  const got = positions(rec, c.scanned, rec.frameCount, tr.stride)
  const nDyn = got.n
  for (let p = 0; p < got.frames.length; p++) {
    const k = got.frames[p]
    if (tr.n === tr.ks.length) {
      const ks = new Float64Array(tr.ks.length * 2); ks.set(tr.ks); tr.ks = ks
      for (const [id, q] of tr.paths) { const z = new Float64Array(q.length * 2); z.set(q); tr.paths.set(id, z) }
    }
    tr.ks[tr.n] = k
    for (const b of dyn) { const q = tr.paths.get(b.id)!; q[2 * tr.n] = got.xy[2 * (p * nDyn + b.index)]; q[2 * tr.n + 1] = got.xy[2 * (p * nDyn + b.index) + 1] }
    tr.n++
    if (k % tr.stride !== 0) c.provisional = true
    if (tr.n > TRAIL_POINTS) {
      // Keep every other point (and the last) and double the stride
      let m = 0
      for (let i = 0; i < tr.n; i++) {
        if (tr.ks[i] % (2 * tr.stride) !== 0 && i !== tr.n - 1) continue
        tr.ks[m] = tr.ks[i]
        for (const q of tr.paths.values()) { q[2 * m] = q[2 * i]; q[2 * m + 1] = q[2 * i + 1] }
        m++
      }
      tr.n = m
      tr.stride *= 2
      c.provisional = tr.ks[tr.n - 1] % tr.stride !== 0
    }
  }
  c.scanned = rec.frameCount
  return tr
}

interface ScaleCache { frames: number; scales: { v: number; a: number; f: number } }
const scaleCache = new WeakMap<object, ScaleCache>()

/** Vector scales chosen once per recording so arrows keep their meaning while playing (cached per recording prefix). */
export function vectorScales(rec: Recording): { v: number; a: number; f: number } {
  const c = scaleCache.get(rec.session)
  if (c && c.frames === rec.frameCount) return c.scales
  const scales = vectorScalesOf(rec, true)
  scaleCache.set(rec.session, { frames: rec.frameCount, scales })
  return scales
}

/** Vector scales of a scene being edited (from its initial velocities). */
export function sceneVectorScales(session: EngineSession): { v: number; a: number; f: number } {
  return vectorScalesOf(session, false)
}

export { FONT, MONO }
