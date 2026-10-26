/**
 * 26.52 ticker tape (D63): the paper strip a ticker timer would print for a body. Dots every `period` seconds
 * (0.02 s for 50 Hz), a counting point every `every` dots (T = every × period), positions from exact states of the
 * recording (one integration step from the nearest frame, never interpolated). From the strip: the lengths x₁, x₂ …
 * between counting points, the velocity at each inner counting point vₙ = (xₙ + xₙ₊₁)/(2T), and the acceleration
 * by successive differences a = [(x_{m+1} + … + x_{2m}) − (x₁ + … + x_m)]/(m² T²) over the first 2m lengths, compared
 * with the simulation's average acceleration over the same time.
 *
 * Distance along the tape: the path length (∫|v| dt by Simpson between dots) or the displacement along x or y.
 *
 * Pure module (no Vue, no DOM).
 */
import { tl } from '../i18n'
import type { Recording } from '../core/solver/simulation'
import { exactStateAt } from '../core/solver/simulation'
import type { Palette } from '../render/renderer'
import { DARK, LIGHT } from '../render/renderer'
import { FONT } from '../render/style'
import { formatSig } from '../units/units'
import { textWidth } from './fbd'

/** What the tape measures. */
export type TapeDirection = 'path' | 'x' | 'y'

export interface TapeOptions {
  bodyId: string
  direction: TapeDirection
  /** Dot period (s); 0.02 for a 50 Hz timer. */
  period: number
  /** Dots per counting interval (5: T = 0.1 s). */
  every: number
  /** Time of the first dot (s). */
  start: number
  /** Counting intervals on the tape (default 6, fewer when the recording ends earlier). */
  intervals?: number
}

export const TAPE_DEFAULTS = { direction: 'path' as TapeDirection, period: 0.02, every: 5, start: 0, intervals: 6 }

export interface TapeData {
  bodyId: string
  name: string
  direction: TapeDirection
  period: number
  every: number
  /** Counting interval T (s). */
  T: number
  /** Every dot: time (s) and distance from the first dot (m). */
  dots: Array<{ t: number; s: number }>
  /** Lengths x₁, x₂ … between consecutive counting points (m). */
  lengths: number[]
  /** Velocity at counting point n (1 … lengths − 1): from the tape and from the simulation (m/s). */
  velocities: Array<{ n: number; t: number; tape: number; sim: number }>
  /** Acceleration by successive differences (m/s²), the number of lengths it used (2m), null with fewer than 2. */
  accel: number | null
  used: number
  /** Average acceleration of the simulation over the same span (m/s²). */
  simAccel: number | null
}

/** Velocity component the tape measures at state X (dynamic slot i). */
function speedOf(X: Float64Array, n: number, i: number, dir: TapeDirection): number {
  const vx = X[3 * n + 3 * i], vy = X[3 * n + 3 * i + 1]
  return dir === 'x' ? vx : dir === 'y' ? vy : Math.hypot(vx, vy)
}

/** The tape of a body; null for a static or unknown body or when the run is too short for two counting points. */
export function tapeData(rec: Recording, o: TapeOptions): TapeData | null {
  const model = rec.system.model
  const b = model.bodies.find(x => x.id === o.bodyId)
  if (!b || !b.dynamic) return null
  const n = model.n, i = b.index
  const period = o.period > 0 ? o.period : TAPE_DEFAULTS.period
  const every = Math.max(1, Math.round(o.every))
  const T = period * every
  const tEnd = (rec.frameCount - 1) * rec.dt
  const start = Math.max(0, Math.min(tEnd, o.start))
  const maxIntervals = Math.floor((tEnd - start) / T + 1e-9)
  const intervals = Math.min(maxIntervals, Math.max(1, Math.round(o.intervals ?? TAPE_DEFAULTS.intervals)))
  if (intervals < 1) return null
  const dotCount = intervals * every + 1
  const dots: Array<{ t: number; s: number }> = []
  const X0 = exactStateAt(rec, start)
  const x0 = X0[3 * i], y0 = X0[3 * i + 1]
  let s = 0
  // Path length: Simpson on |v| with 4 sub-intervals per dot period
  const SUB = 4
  let prev = X0
  for (let k = 0; k < dotCount; k++) {
    const t = start + k * period
    let X = prev
    if (k > 0) {
      if (o.direction === 'path') {
        const h = period / SUB
        const v: number[] = [speedOf(prev, n, i, 'path')]
        for (let j = 1; j <= SUB; j++) { X = exactStateAt(rec, Math.min(tEnd, start + (k - 1) * period + j * h)); v.push(speedOf(X, n, i, 'path')) }
        s += h / 3 * (v[0] + 4 * v[1] + 2 * v[2] + 4 * v[3] + v[4])
      } else {
        X = exactStateAt(rec, Math.min(tEnd, t))
      }
    }
    const dist = o.direction === 'x' ? X[3 * i] - x0 : o.direction === 'y' ? X[3 * i + 1] - y0 : s
    dots.push({ t, s: dist })
    prev = X
  }
  const counts = Array.from({ length: intervals + 1 }, (_v, c) => dots[c * every])
  const lengths = counts.slice(1).map((c, j) => c.s - counts[j].s)
  const velocities: TapeData['velocities'] = []
  for (let c = 1; c < lengths.length; c++) {
    const t = counts[c].t
    velocities.push({ n: c, t, tape: (lengths[c - 1] + lengths[c]) / (2 * T), sim: speedOf(exactStateAt(rec, t), n, i, o.direction) })
  }
  const m = Math.floor(lengths.length / 2)
  let accel: number | null = null, simAccel: number | null = null
  if (m >= 1) {
    let a1 = 0, a2 = 0
    for (let j = 0; j < m; j++) { a1 += lengths[j]; a2 += lengths[m + j] }
    accel = (a2 - a1) / (m * m * T * T)
    const t1 = counts[2 * m].t
    simAccel = (speedOf(exactStateAt(rec, t1), n, i, o.direction) - speedOf(X0, n, i, o.direction)) / (t1 - start)
  }
  return { bodyId: b.id, name: b.name, direction: o.direction, period, every, T, dots, lengths, velocities, accel, used: 2 * m, simAccel }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n2 = (v: number) => (Math.round(v * 100) / 100).toString()

/** Lengths in centimetres with the given significant digits. */
export function cm(v: number, digits: number): string { return `${formatSig(v * 100, digits)} cm` }

/**
 * The tape as an SVG strip: dots, counting points 0, 1, 2 … with brackets labelled x₁, x₂ … in cm. The tape is
 * drawn at full size (1 cm = 37.8 px) when it fits in `maxWidth`, else scaled down (the scale is printed).
 */
export function tapeSvg(d: TapeData, opts: { theme: 'light' | 'dark'; digits: number; maxWidth?: number }): { svg: string; width: number; height: number } {
  const P: Palette = opts.theme === 'dark' ? DARK : LIGHT
  const paper = opts.theme === 'dark' ? '#2a2620' : '#f6f0dc'
  const edge = opts.theme === 'dark' ? '#5b5246' : '#d8cba3'
  const ink = opts.theme === 'dark' ? '#e7e2d6' : '#2b2620'
  const bg = opts.theme === 'dark' ? P.bg : '#ffffff'
  const smin = Math.min(...d.dots.map(p => p.s)), smax = Math.max(...d.dots.map(p => p.s))
  const span = Math.max(smax - smin, 1e-9)
  const maxW = opts.maxWidth ?? 960
  const full = 3779.5 // px per m at 96 dpi
  const margin = 36
  const ppm = Math.min(full, (maxW - 2 * margin) / span)
  const scale = ppm >= full * 0.999 ? tl('原大') : tl('缩小为 1 : {0}', [formatSig(full / ppm, 3)])
  const what = d.direction === 'path' ? tl('路程') : d.direction === 'x' ? tl('沿 x 的位移') : tl('沿 y 的位移')
  const caption = tl('{0}：打点周期 {1} s，每 {2} 个点取一个计数点（T = {3} s），纸带长度表示{4}；{5}', [d.name, formatSig(d.period, 3), d.every, formatSig(d.T, 3), what, scale])
  const W = Math.ceil(Math.max(span * ppm + 2 * margin, textWidth(caption, 11) + 2 * margin))
  const tapeTop = 30, tapeH = 54, H = tapeTop + tapeH + 86
  const X = (s: number) => margin + (s - smin) * ppm
  const yMid = tapeTop + tapeH / 2
  const parts: string[] = []
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${bg}"/>`)
  // Torn ends: a zig-zag on both sides
  const zig = (x: number, dir: number) => {
    const pts: string[] = []
    for (let k = 0; k <= 6; k++) pts.push(`${n2(x + dir * (k % 2 ? 6 : 0))},${n2(tapeTop + k * tapeH / 6)}`)
    return pts.join(' ')
  }
  const xL = margin - 20, xR = margin + span * ppm + 20
  parts.push(`<polygon points="${zig(xL, -1)} ${n2(xR)},${n2(tapeTop + tapeH)} ${zig(xR, 1).split(' ').reverse().join(' ')} ${n2(xL)},${tapeTop}" fill="${paper}" stroke="${edge}" stroke-width="1"/>`)
  const counts = d.dots.filter((_p, k) => k % d.every === 0)
  d.dots.forEach((p, k) => {
    const isCount = k % d.every === 0
    parts.push(`<circle cx="${n2(X(p.s))}" cy="${yMid}" r="${isCount ? 2.6 : 1.8}" fill="${ink}"/>`)
  })
  counts.forEach((p, c) => {
    const x = X(p.s)
    parts.push(`<line x1="${n2(x)}" y1="${tapeTop + 6}" x2="${n2(x)}" y2="${tapeTop + tapeH - 6}" stroke="${P.accent}" stroke-width="1" stroke-dasharray="3 3"/>`)
    parts.push(`<text x="${n2(x)}" y="${tapeTop - 8}" font-size="12" font-weight="600" fill="${P.accent}" text-anchor="middle">${c}</text>`)
  })
  // Brackets x₁ … below the tape
  const yb = tapeTop + tapeH + 14
  d.lengths.forEach((len, j) => {
    const a = X(counts[j].s), b = X(counts[j + 1].s)
    const lo = Math.min(a, b), hi = Math.max(a, b)
    parts.push(`<path d="M${n2(lo + 1)},${yb - 5} V${yb} H${n2(hi - 1)} V${yb - 5}" fill="none" stroke="${P.text2}" stroke-width="1"/>`)
    const mid = (lo + hi) / 2
    parts.push(`<text x="${n2(mid)}" y="${yb + 15}" font-size="12" font-style="italic" fill="${P.text}" text-anchor="middle">x<tspan font-size="9" dy="3">${j + 1}</tspan></text>`)
    parts.push(`<text x="${n2(mid)}" y="${yb + 30}" font-size="11" fill="${P.text2}" text-anchor="middle">${esc(cm(Math.abs(len), opts.digits))}</text>`)
  })
  parts.push(`<text x="${margin - 20}" y="${H - 10}" font-size="11" fill="${P.text2}">${esc(caption)}</text>`)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT.replace(/"/g, "'")}">${parts.join('')}</svg>`
  return { svg, width: W, height: H }
}
