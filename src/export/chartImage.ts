/**
 * Line charts as still images (report curves, parameter-sweep plots). Drawn directly on a canvas so the
 * output is independent of the page styles and sharp at any pixel ratio. Values are passed in display units
 * already; NaN / null values break the line.
 */
import { tl } from '../i18n'

/** One line of a chart; values are in display units. */
export interface ChartSeries {
  label: string
  color: string
  x: ArrayLike<number>
  y: ArrayLike<number | null>
  /** Draw markers at the data points (sparse data such as sweeps). */
  points?: boolean
}

/** Colours of a chart image. */
export interface ChartColors { bg: string; text: string; text2: string; grid: string }

/** Chart colours of the light theme. */
export const CHART_LIGHT: ChartColors = { bg: '#ffffff', text: '#1c1c1e', text2: 'rgba(60,60,67,0.72)', grid: 'rgba(60,60,67,0.14)' }
/** Chart colours of the dark theme. */
export const CHART_DARK: ChartColors = { bg: '#1c1c1f', text: '#f5f5f7', text2: 'rgba(235,235,245,0.7)', grid: 'rgba(235,235,245,0.14)' }

/** Categorical series colours (same order as the chart panel). */
export const SERIES_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563']

/** Options of renderChart. */
export interface ChartImageOptions {
  /** CSS size (px). */
  width: number
  height: number
  /** Pixel ratio of the PNG. Default 2. */
  scale?: number
  title?: string
  xLabel: string
  yLabel: string
  colors?: ChartColors
  /** Positions on the x axis of dashed vertical marks (event times). */
  marks?: number[]
  /** Transparent background. */
  transparent?: boolean
}

/** "Nice" tick values covering [min, max] with about `target` intervals. */
export function niceTicks(min: number, max: number, target = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  if (max < min) [min, max] = [max, min]
  if (max === min) { const d = Math.abs(min) * 0.1 || 1; min -= d; max += d }
  const raw = (max - min) / Math.max(1, target)
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw) ?? 10 * p
  const out: number[] = []
  const first = Math.ceil(min / step - 1e-9) * step
  for (let v = first; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)))
  return out
}

/** Data range of the series (finite values only), padded so flat lines stay visible. */
export function dataRange(values: Array<ArrayLike<number | null>>): [number, number] {
  let lo = Infinity, hi = -Infinity
  for (const arr of values) for (let i = 0; i < arr.length; i++) { const v = arr[i]; if (v !== null && Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v } }
  if (!Number.isFinite(lo)) return [0, 1]
  const mag = Math.max(Math.abs(lo), Math.abs(hi))
  if (hi - lo <= mag * 1e-9) { const d = mag * 0.05 || 1; return [lo - d, hi + d] }
  return [lo, hi]
}

function tickText(v: number): string {
  if (v === 0) return '0'
  const a = Math.abs(v)
  if (a >= 1e-3 && a < 1e5) return String(Number(v.toPrecision(6)))
  return v.toExponential(2).replace(/\.?0+e/, 'e')
}

const FONT = '"Segoe UI","Noto Sans SC Variable","Microsoft YaHei UI",sans-serif'

/** Draw a line chart on a new canvas of `scale` × the CSS size. */
export function renderChart(series: ChartSeries[], o: ChartImageOptions): HTMLCanvasElement {
  const k = o.scale ?? 2
  const C = o.colors ?? CHART_LIGHT
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(o.width * k)
  canvas.height = Math.round(o.height * k)
  const ctx = canvas.getContext('2d')!
  ctx.scale(k, k)
  if (!o.transparent) { ctx.fillStyle = C.bg; ctx.fillRect(0, 0, o.width, o.height) }
  const top = o.title ? 34 : 14, left = 66, right = 16, bottom = 44 + (series.length > 1 ? 22 : 0)
  const pw = o.width - left - right, ph = o.height - top - bottom
  const [xa, xb] = dataRange(series.map(s => s.x))
  const [ya, yb] = dataRange(series.map(s => s.y))
  // A little air around the data so end points and markers are not cut by the frame
  const xPad = series.some(s => s.points) ? (xb - xa) * 0.03 : 0, yPad = (yb - ya) * 0.06
  const x0 = xa - xPad, x1 = xb + xPad, y0 = ya - yPad, y1 = yb + yPad
  const xt = niceTicks(x0, x1, Math.max(3, Math.round(pw / 90)))
  const yt = niceTicks(y0, y1, Math.max(3, Math.round(ph / 50)))
  const xmin = Math.min(x0, xt[0] ?? x0), xmax = Math.max(x1, xt[xt.length - 1] ?? x1)
  const ymin = Math.min(y0, yt[0] ?? y0), ymax = Math.max(y1, yt[yt.length - 1] ?? y1)
  const X = (v: number) => left + ((v - xmin) / (xmax - xmin || 1)) * pw
  const Y = (v: number) => top + ph - ((v - ymin) / (ymax - ymin || 1)) * ph

  ctx.font = `600 14px ${FONT}`
  ctx.fillStyle = C.text
  if (o.title) ctx.fillText(o.title, left, 20)
  ctx.font = `11px ${FONT}`
  ctx.lineWidth = 1
  ctx.strokeStyle = C.grid
  ctx.fillStyle = C.text2
  ctx.textAlign = 'center'
  for (const v of xt) { const x = X(v); ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + ph); ctx.stroke(); ctx.fillText(tickText(v), x, top + ph + 15) }
  ctx.textAlign = 'right'
  for (const v of yt) { const y = Y(v); ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + pw, y); ctx.stroke(); ctx.fillText(tickText(v), left - 6, y + 4) }
  ctx.textAlign = 'center'
  ctx.fillText(o.xLabel, left + pw / 2, top + ph + 32)
  ctx.save()
  ctx.translate(14, top + ph / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText(o.yLabel, 0, 0)
  ctx.restore()
  ctx.textAlign = 'left'
  ctx.strokeStyle = C.text2
  ctx.strokeRect(left, top, pw, ph)

  if (o.marks?.length) {
    ctx.save()
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = '#c77700'
    for (const m of o.marks) { if (m < xmin || m > xmax) continue; const x = X(m); ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + ph); ctx.stroke() }
    ctx.restore()
  }

  ctx.save()
  ctx.beginPath(); ctx.rect(left, top, pw, ph); ctx.clip()
  for (const s of series) {
    ctx.strokeStyle = s.color
    ctx.fillStyle = s.color
    ctx.lineWidth = 1.8
    ctx.beginPath()
    let pen = false
    const n = Math.min(s.x.length, s.y.length)
    for (let i = 0; i < n; i++) {
      const v = s.y[i]
      if (v === null || !Number.isFinite(v) || !Number.isFinite(s.x[i])) { pen = false; continue }
      const x = X(s.x[i]), y = Y(v)
      if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y)
      pen = true
    }
    ctx.stroke()
    if (s.points) for (let i = 0; i < n; i++) { const v = s.y[i]; if (v === null || !Number.isFinite(v)) continue; ctx.beginPath(); ctx.arc(X(s.x[i]), Y(v), 2.8, 0, Math.PI * 2); ctx.fill() }
  }
  ctx.restore()

  if (series.length > 1) {
    let lx = left
    const ly = o.height - 12
    for (const s of series) {
      ctx.fillStyle = s.color
      ctx.fillRect(lx, ly - 5, 14, 3)
      ctx.fillStyle = C.text
      ctx.fillText(s.label, lx + 18, ly)
      lx += 18 + ctx.measureText(s.label).width + 16
    }
  }
  return canvas
}

/** PNG bytes of a chart. */
export async function chartPng(series: ChartSeries[], o: ChartImageOptions): Promise<Uint8Array> {
  const canvas = renderChart(series, o)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error(tl('PNG 编码失败'))
  return new Uint8Array(await blob.arrayBuffer())
}
