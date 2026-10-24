/** 26.46 rhythm charts: draws a RhythmChart2D's published frame (lanes or judgement lines, notes, hit bursts,
 * judgement, combo and score) with the ordinary shape and text commands, so both backends and every camera
 * path draw it the same way. Without a frame (editing, nothing loaded yet) a lane outline is drawn so the
 * chart can be placed in the scene. 26.47: note types draw with their own shape, colour and size (or not at
 * all when a prefab shows them), and the hit error bar. */
import type { Renderer2D, RenderColor } from './types'
import type { RhythmChart2D } from '../world/components'
import type { Vec2 } from '../world/types'
import { RHYTHM_FRAME_LINE_STRIDE, RHYTHM_FRAME_NOTE_STRIDE, type RhythmFrame } from './rhythmFrames'

export interface RhythmTransform { position: Vec2; rotation: number; scale: Vec2 }

/** Height of the lane field above the judgement line, in chart units. */
export const RHYTHM_LANE_LENGTH = 11
const LANE_BELOW = 1.4
const JUDGEMENT_NAMES = ['', 'PERFECT', 'GREAT', 'GOOD', 'BAD', 'MISS']
const JUDGEMENT_COLORS: RenderColor[] = [
  { r: 255, g: 255, b: 255, a: 1 },
  { r: 255, g: 216, b: 110, a: 1 },
  { r: 120, g: 205, b: 255, a: 1 },
  { r: 132, g: 232, b: 160, a: 1 },
  { r: 196, g: 150, b: 255, a: 1 },
  { r: 255, g: 104, b: 112, a: 1 }
]
const FONT = 'Nunito Sans Variable, Nunito Sans, Segoe UI Variable Text, Segoe UI, sans-serif'

function color(value: { r: number; g: number; b: number }, alpha: number): RenderColor {
  const byte = (channel: number) => Math.max(0, Math.min(255, Math.round(Number.isFinite(channel) ? channel : 0)))
  return { r: byte(value.r), g: byte(value.g), b: byte(value.b), a: Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 0)) }
}
const mix = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, t: number) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t })

/** Chamfered rectangle (width × height centred on the origin), reads as a rounded note at game sizes. */
function noteOutline(width: number, height: number): Vec2[] {
  const w = width / 2, h = height / 2, c = Math.min(h * .45, w * .3, .08)
  return [{ x: -w + c, y: -h }, { x: w - c, y: -h }, { x: w, y: -h + c }, { x: w, y: h - c }, { x: w - c, y: h }, { x: -w + c, y: h }, { x: -w, y: h - c }, { x: -w, y: -h + c }]
}
const box = (width: number, height: number): Vec2[] => [{ x: -width / 2, y: -height / 2 }, { x: width / 2, y: -height / 2 }, { x: width / 2, y: height / 2 }, { x: -width / 2, y: height / 2 }]
const diamond = (width: number, height: number): Vec2[] => [{ x: 0, y: -height / 2 }, { x: width / 2, y: 0 }, { x: 0, y: height / 2 }, { x: -width / 2, y: 0 }]

class ChartPainter {
  private readonly cos: number
  private readonly sin: number
  private readonly sx: number
  private readonly sy: number
  constructor(private renderer: Renderer2D, private transform: RhythmTransform, private component: RhythmChart2D) {
    this.cos = Math.cos(transform.rotation); this.sin = Math.sin(transform.rotation)
    const unit = Number.isFinite(component.unitScale) && component.unitScale > 0 ? component.unitScale : 1
    this.sx = transform.scale.x * unit; this.sy = transform.scale.y * unit
  }
  world(x: number, y: number): Vec2 {
    const lx = x * this.sx, ly = y * this.sy
    return { x: this.transform.position.x + lx * this.cos - ly * this.sin, y: this.transform.position.y + lx * this.sin + ly * this.cos }
  }
  /** Polygon centred at chart (x, y), rotated by `degrees` in the chart frame. */
  polygon(x: number, y: number, degrees: number, vertices: Vec2[], fill: RenderColor, order: number, stroke?: RenderColor, strokeWidth = 0): void {
    if (fill.a <= 0 && (!stroke || stroke.a <= 0)) return
    this.renderer.submitShape({
      shape: 'Polygon', position: this.world(x, y), rotation: this.transform.rotation + degrees * Math.PI / 180, scale: { x: this.sx, y: this.sy },
      vertices, radiusX: 0, radiusY: 0, fill, stroke: stroke ?? { ...fill, a: 0 }, strokeWidth,
      sortingLayer: this.component.sortingLayer, orderInLayer: this.component.orderInLayer + order, material: 'Default'
    })
  }
  ring(x: number, y: number, radius: number, stroke: RenderColor, width: number, order: number, fill?: RenderColor): void {
    if (stroke.a <= 0 && (!fill || fill.a <= 0)) return
    this.renderer.submitShape({
      shape: 'Ellipse', position: this.world(x, y), rotation: this.transform.rotation, scale: { x: this.sx, y: this.sy }, vertices: [],
      radiusX: radius, radiusY: radius, fill: fill ?? { ...stroke, a: 0 }, stroke, strokeWidth: width * Math.abs(this.sx),
      sortingLayer: this.component.sortingLayer, orderInLayer: this.component.orderInLayer + order, material: 'Default'
    })
  }
  line(ax: number, ay: number, bx: number, by: number, stroke: RenderColor, width: number, order: number): void {
    if (stroke.a <= 0) return
    this.renderer.submitShape({
      shape: 'Line', position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, vertices: [this.world(ax, ay), this.world(bx, by)],
      radiusX: 0, radiusY: 0, fill: { ...stroke, a: 0 }, stroke, strokeWidth: width * Math.abs(this.sx),
      sortingLayer: this.component.sortingLayer, orderInLayer: this.component.orderInLayer + order, material: 'Default'
    })
  }
  text(x: number, y: number, text: string, size: number, fill: RenderColor, order: number, align: CanvasTextAlign = 'center', weight = 800): void {
    if (!text || fill.a <= 0) return
    this.renderer.submitText({
      position: this.world(x, y), rotation: this.transform.rotation, scale: { x: this.sx, y: this.sy }, text, fontFamily: FONT,
      fontSize: size, fontWeight: weight, lineHeight: 1.1, align, color: fill, outlineColor: { r: 8, g: 10, b: 20, a: fill.a * .55 },
      outlineWidth: size * .06, maxWidth: 0, sortingLayer: this.component.sortingLayer, orderInLayer: this.component.orderInLayer + order, material: 'Default'
    })
  }
}

function laneGeometry(frame: Pick<RhythmFrame, 'lanes' | 'laneWidth'>) {
  const lanes = Math.max(1, Math.floor(frame.lanes)), width = frame.laneWidth > 0 ? frame.laneWidth : 1.6
  return { lanes, width, left: -lanes * width / 2, right: lanes * width / 2 }
}

function drawLaneField(paint: ChartPainter, component: RhythmChart2D, frame: Pick<RhythmFrame, 'lanes' | 'laneWidth' | 'judgeY' | 'lanePress' | 'beatPulse'>): void {
  const { lanes, width, left, right } = laneGeometry(frame), judge = frame.judgeY
  const bottom = judge - LANE_BELOW, top = judge + RHYTHM_LANE_LENGTH, height = top - bottom, centreY = (top + bottom) / 2
  if (component.showLanes) {
    for (let lane = 0; lane < lanes; lane++) {
      const x = left + (lane + .5) * width, shade = lane % 2 ? .92 : 1
      paint.polygon(x, centreY, 0, box(width, height), color({ r: component.laneColor.r * shade, g: component.laneColor.g * shade, b: component.laneColor.b * shade }, .9), 0)
      const press = Number(frame.lanePress[lane] ?? 0)
      if (press > .01) {
        // The pressed lane lights up from the judgement line, fading upwards.
        for (let step = 0; step < 4; step++) paint.polygon(x, judge + .9 + step * 1.1, 0, box(width * .96, 1.1), color(component.noteColor, press * (.3 - step * .07)), .1)
      }
    }
    for (let lane = 0; lane <= lanes; lane++) paint.line(left + lane * width, bottom, left + lane * width, top, color(component.lineColor, lane === 0 || lane === lanes ? .5 : .14), lane === 0 || lane === lanes ? .05 : .025, .05)
  }
  const pulse = Math.max(0, Math.min(1, frame.beatPulse))
  paint.polygon(0, judge, 0, box(right - left + .2, .1 + pulse * .04), color(component.lineColor, .85 + pulse * .15), .2)
}

function drawNote(paint: ChartPainter, component: RhythmChart2D, frame: RhythmFrame, at: number): void {
  const n = frame.notes
  const kind = Number(n[at + 1]), x = Number(n[at + 2]), y = Number(n[at + 3]), rotation = Number(n[at + 4]), body = Number(n[at + 6]), flags = Number(n[at + 7])
  const type = frame.types?.[Number(n[at + 10])] ?? null, size = (Number(n[at + 11]) || 1) * (type?.scale ?? 1)
  if (type?.hidden) return
  const lanes = frame.mode === 0, width = (lanes ? laneGeometry(frame).width * .88 : Math.max(.6, component.hitWidth * 1.15)) * size
  const simultaneous = (flags & 1) !== 0, holding = (flags & 2) !== 0
  const radians = rotation * Math.PI / 180, nx = -Math.sin(radians), ny = Math.cos(radians)
  const base = type?.color ?? (kind === 1 ? component.holdColor : kind === 2 ? component.dragColor : kind === 3 ? component.flickColor : component.noteColor)
  if (kind === 1 && Math.abs(body) > 1e-3) {
    const centreX = x + nx * body / 2, centreY = y + ny * body / 2
    paint.polygon(centreX, centreY, rotation, box(width * .62, Math.abs(body)), color(base, holding ? .78 : .5), .3)
    const endX = x + nx * body, endY = y + ny * body
    paint.polygon(endX, endY, rotation, box(width * .7, .08), color(base, .9), .31)
  }
  const height = (kind === 2 ? .16 : .3) * Math.min(size, 2)
  const outline = simultaneous ? color({ r: 255, g: 255, b: 255 }, .95) : color(mix(base, { r: 255, g: 255, b: 255 }, .5), .7)
  const fill = color(holding ? mix(base, { r: 255, g: 255, b: 255 }, .35) : base, 1), strokeWidth = simultaneous ? .06 : .03
  const shape = type?.shape ?? 'bar', round = .3 * size
  if (shape === 'circle') paint.ring(x, y, round, outline, strokeWidth, .4, fill)
  else if (shape === 'ring') { paint.ring(x, y, round, fill, .09 * Math.min(size, 2), .4); paint.ring(x, y, round * .45, { ...fill, a: .5 }, .04, .4) }
  else if (shape === 'diamond') paint.polygon(x, y, rotation, diamond(round * 2.2, round * 2.2), fill, .4, outline, strokeWidth)
  else if (shape === 'square') paint.polygon(x, y, rotation, box(round * 1.9, round * 1.9), fill, .4, outline, strokeWidth)
  else paint.polygon(x, y, rotation, noteOutline(width, height), fill, .4, outline, strokeWidth)
  if (kind === 3) {
    // Flick: a chevron pointing away from the line.
    const tipX = x + nx * .42, tipY = y + ny * .42
    const side = width * .22, tx = Math.cos(radians), ty = Math.sin(radians)
    paint.line(tipX, tipY, x + nx * .2 - tx * side, y + ny * .2 - ty * side, color(base, .95), .07, .41)
    paint.line(tipX, tipY, x + nx * .2 + tx * side, y + ny * .2 + ty * side, color(base, .95), .07, .41)
  }
}

function drawHud(paint: ChartPainter, component: RhythmChart2D, frame: RhythmFrame): void {
  const lanes = frame.mode === 0
  const geometry = laneGeometry(frame)
  // Lines charts keep the middle of the screen free for the lines: combo at the top, the judgement under the score.
  const comboY = lanes ? frame.judgeY + 4.6 : 4.25, judgementY = lanes ? frame.judgeY + 2.6 : 3.15
  // Lanes: score to the right of the field, level with the upper notes; lines: the top-right corner of a
  // 16 × 9 chart frame. Both stay inside a camera that shows the chart's usual area.
  const hudX = lanes ? geometry.right + .6 : 8.4, hudTop = lanes ? frame.judgeY + 7.6 : 4.4, hudAlign: CanvasTextAlign = lanes ? 'left' : 'right'
  if (component.showCombo && frame.combo >= 3) {
    paint.text(0, comboY, String(frame.combo), 1.25, color({ r: 255, g: 255, b: 255 }, .92), .6)
    paint.text(0, comboY - .55, 'COMBO', .32, color({ r: 220, g: 228, b: 255 }, .75), .6, 'center', 700)
  }
  if (component.showJudgements && frame.judgement && frame.judgement.age < .55) {
    const value = Math.max(1, Math.min(5, Math.round(frame.judgement.judgement))), age = frame.judgement.age
    const fade = age < .4 ? 1 : 1 - (age - .4) / .15, grow = 1 + Math.max(0, .12 - age) * 1.4
    const judgementX = lanes ? 0 : 8.4, judgementAlign: CanvasTextAlign = lanes ? 'center' : 'right', size = lanes ? .62 : .4
    paint.text(judgementX, judgementY, JUDGEMENT_NAMES[value], size * grow, { ...JUDGEMENT_COLORS[value], a: fade }, .61, judgementAlign)
    if (value >= 2 && value <= 4 && Math.abs(frame.judgement.offsetMs) >= 1) paint.text(judgementX, judgementY - .45, frame.judgement.offsetMs < 0 ? 'EARLY' : 'LATE', .26, color({ r: 230, g: 236, b: 255 }, fade * .8), .61, judgementAlign, 700)
  }
  if (component.showCombo) {
    paint.text(hudX, hudTop, String(Math.round(frame.score)).padStart(7, '0'), .5, color({ r: 255, g: 255, b: 255 }, .95), .6, hudAlign, 800)
    paint.text(hudX, hudTop - .55, `${(frame.accuracy * 100).toFixed(2)}%`, .32, color({ r: 210, g: 220, b: 255 }, .8), .6, hudAlign, 700)
    // Progress: under the judgement line (lanes) or along the top of the frame (lines).
    const span = lanes ? geometry.right - geometry.left : 16, from = lanes ? geometry.left : -8, y = lanes ? frame.judgeY - LANE_BELOW + .35 : 4.85
    paint.line(from, y, from + span, y, color(component.lineColor, .18), .06, .55)
    if (frame.progress > 0) paint.line(from, y, from + span * Math.min(1, frame.progress), y, color(component.lineColor, .85), .06, .56)
  }
  if (frame.errorBar && (frame.status === 'playing' || frame.status === 'paused' || frame.status === 'countdown')) drawErrorBar(paint, frame, lanes ? frame.judgeY - .75 : -4.55)
  if (frame.message && frame.status !== 'playing') {
    // Lanes: in the gap between the combo (centre +4.6, about 1.2 high) and the accuracy line under the score
    // (centre +7.05); the box is 1.15 high. 26.46 put it at +5.5, over the combo.
    const y = lanes ? frame.judgeY + 6.05 : 0
    paint.polygon(0, y, 0, box(Math.min(14, .32 * frame.message.length + 2), 1.15), color({ r: 10, g: 12, b: 24 }, .72), .62)
    paint.text(0, y - .16, frame.message, .42, frame.status === 'error' ? JUDGEMENT_COLORS[5] : color({ r: 255, g: 255, b: 255 }, .95), .63, 'center', 700)
  }
}

/** 26.47: the hit error bar: the windows as bands (bad … perfect, early to the left), a tick for each recent
 * hit that fades with age, and a centre mark. */
function drawErrorBar(paint: ChartPainter, frame: RhythmFrame, y: number): void {
  const bar = frame.errorBar
  if (!bar) return
  const windows = bar.windows.map(value => Math.max(1, Number(value) || 1)), span = 3.2, scale = span / windows[3]
  for (let index = 3; index >= 0; index--) paint.polygon(0, y, 0, box(windows[index] * scale * 2, .14), { ...JUDGEMENT_COLORS[index + 1], a: .22 + (3 - index) * .05 }, .57)
  paint.line(0, y - .2, 0, y + .2, color({ r: 255, g: 255, b: 255 }, .9), .03, .58)
  for (const hit of bar.hits) {
    if (hit.age < 0 || hit.age > 3) continue
    const offset = Math.max(-windows[3], Math.min(windows[3], hit.offsetMs)) * scale
    paint.line(offset, y - .17, offset, y + .17, { ...JUDGEMENT_COLORS[Math.max(1, Math.min(4, Math.round(hit.judgement)))], a: Math.max(0, 1 - hit.age / 3) }, .05, .59)
  }
}

/** Draws one RhythmChart2D. `frame` null draws the placeholder lane field (4 lanes, or the lines frame). */
export function submitRhythmChart(renderer: Renderer2D, component: RhythmChart2D, transform: RhythmTransform, frame: RhythmFrame | null): void {
  const paint = new ChartPainter(renderer, transform, component)
  if (!frame) {
    drawLaneField(paint, component, { lanes: 4, laneWidth: component.laneWidth, judgeY: component.judgeY, lanePress: [], beatPulse: 0 })
    return
  }
  if (frame.mode === 0) drawLaneField(paint, component, frame)
  else {
    const lines = frame.lines
    for (let at = 0; at + RHYTHM_FRAME_LINE_STRIDE <= lines.length; at += RHYTHM_FRAME_LINE_STRIDE) {
      const x = Number(lines[at]), y = Number(lines[at + 1]), rotation = Number(lines[at + 2]) * Math.PI / 180, alpha = Number(lines[at + 3]), length = Number(lines[at + 4])
      if (alpha <= .002) continue
      const dx = Math.cos(rotation) * length / 2, dy = Math.sin(rotation) * length / 2
      paint.line(x - dx, y - dy, x + dx, y + dy, color(component.lineColor, alpha * (.88 + frame.beatPulse * .12)), .07 + frame.beatPulse * .02, .2)
    }
  }
  for (let at = 0; at + RHYTHM_FRAME_NOTE_STRIDE <= frame.notes.length; at += RHYTHM_FRAME_NOTE_STRIDE) drawNote(paint, component, frame, at)
  if (component.hitEffects) for (const effect of frame.effects) {
    if (effect.age < 0 || effect.age > .4 || effect.judgement >= 5) continue
    const t = effect.age / .4, tint = JUDGEMENT_COLORS[Math.max(1, Math.min(4, Math.round(effect.judgement)))]
    paint.ring(effect.x, effect.y, .25 + t * .95, { ...tint, a: (1 - t) * .9 }, .08 * (1 - t) + .02, .5)
    if (t < .5) paint.ring(effect.x, effect.y, .2 + t * .3, { ...tint, a: 0 }, 0, .5, { ...tint, a: (.5 - t) * .7 })
  }
  // The editor's still preview shows the chart only, without score and judgements.
  if (frame.status !== 'preview') drawHud(paint, component, frame)
}
