/**
 * The Galton board's histogram (26.58, D142): counts of the bodies that came to the bins (below `topY`, between
 * the bins' edges) and the expected counts of the binomial distribution B(n, ½), drawn under the board.
 */
import type { HistogramDef } from '../templates/t2658'
import type { Camera } from './renderer'
import { toScreen } from './renderer'

/** Bodies per bin: centres below the top of the bins and inside the bins' span. */
export function histogramCounts(def: HistogramDef, centres: ArrayLike<{ x: number; y: number }>): number[] {
  const counts = new Array<number>(def.bins).fill(0)
  for (let i = 0; i < centres.length; i++) {
    const p = centres[i]
    if (!(p.y < def.topY) || p.y < def.floorY - 0.05) continue
    const k = Math.floor((p.x - def.x0) / def.binWidth)
    if (k >= 0 && k < def.bins) counts[k]++
  }
  return counts
}

/** Expected counts of `total` balls in the n + 1 bins of B(n, ½). */
export function binomialExpected(n: number, total: number): number[] {
  const out: number[] = []
  let c = 1
  const p = Math.pow(0.5, n)
  for (let k = 0; k <= n; k++) {
    out.push(total * c * p)
    c = (c * (n - k)) / (k + 1)
  }
  return out
}

export interface HistogramPalette { bar: string; expected: string; text: string; grid: string }

/**
 * Draw the counts as bars below the floor (one per bin) with the binomial expectation as dots joined by a line,
 * scaled to the larger of the two; the count is written under each bar.
 */
export function drawHistogram(ctx: CanvasRenderingContext2D, cam: Camera, def: HistogramDef, counts: number[], total: number, pal: HistogramPalette, label: string) {
  const expected = binomialExpected(def.rows, total)
  const [left, topY] = toScreen(cam, def.x0, def.floorY - 0.06)
  const right = toScreen(cam, def.x0 + def.bins * def.binWidth, 0)[0]
  const binPx = (right - left) / def.bins
  const height = Math.max(40, Math.min(140, binPx * 3))
  const y0 = topY + 10 + height
  const max = Math.max(1, ...counts, ...expected)
  ctx.save()
  ctx.strokeStyle = pal.grid
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(left, y0 + 0.5); ctx.lineTo(right, y0 + 0.5); ctx.stroke()
  ctx.fillStyle = pal.bar
  for (let k = 0; k < def.bins; k++) {
    const h = (counts[k] / max) * height
    ctx.fillRect(left + k * binPx + 0.15 * binPx, y0 - h, 0.7 * binPx, h)
  }
  ctx.strokeStyle = pal.expected
  ctx.fillStyle = pal.expected
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 3])
  ctx.beginPath()
  for (let k = 0; k < def.bins; k++) {
    const x = left + (k + 0.5) * binPx, y = y0 - (expected[k] / max) * height
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.setLineDash([])
  for (let k = 0; k < def.bins; k++) {
    const x = left + (k + 0.5) * binPx, y = y0 - (expected[k] / max) * height
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 2 * Math.PI); ctx.fill()
  }
  ctx.fillStyle = pal.text
  ctx.font = '11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  if (binPx >= 14) for (let k = 0; k < def.bins; k++) ctx.fillText(String(counts[k]), left + (k + 0.5) * binPx, y0 + 3)
  ctx.textAlign = 'left'
  ctx.fillText(label, left, y0 + 17)
  ctx.restore()
}
