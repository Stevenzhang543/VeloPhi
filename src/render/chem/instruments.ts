/**
 * Instruments on the bench (26.64, D269): each shows its reading on itself, in its own resolution — the text is made
 * by the caller from the core's number (src/chem/apparatus.ts `instrumentReading`, src/chem/format.ts) — with tabular
 * figures, so digits keep their place while a value changes (D254). Drawn in the stroke of the glassware.
 */
import type { ChemPalette } from './palette'
import { STROKE } from './glass'

/**
 * Text with tabular figures: every digit takes the width of "0", so a changing number does not shift. `align` is
 * where x lies. Returns the width drawn.
 */
export function tabularText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: 'left' | 'right' | 'center' = 'left'): number {
  const cell = ctx.measureText('0').width
  const widths = [...text].map(c => (c >= '0' && c <= '9' ? cell : ctx.measureText(c).width))
  const total = widths.reduce((a, b) => a + b, 0)
  let at = align === 'left' ? x : align === 'right' ? x - total : x - total / 2
  const keep = ctx.textAlign
  ctx.textAlign = 'center'
  ;[...text].forEach((c, i) => { ctx.fillText(c, at + widths[i] / 2, y); at += widths[i] })
  ctx.textAlign = keep
  return total
}

export function measureTabular(ctx: CanvasRenderingContext2D, text: string): number {
  const cell = ctx.measureText('0').width
  return [...text].reduce((w, c) => w + (c >= '0' && c <= '9' ? cell : ctx.measureText(c).width), 0)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath()
}

export interface ReadoutOptions { label?: string; align?: 'left' | 'center' | 'right'; scale?: number; line?: number; tone?: string }

/**
 * A readout window: the value (tabular figures) with an optional small label before it. (x, y) is the middle of its
 * left edge, its centre or the middle of its right edge by `align`. Returns its box.
 */
export function drawReadout(ctx: CanvasRenderingContext2D, P: ChemPalette, x: number, y: number, value: string, o: ReadoutOptions = {}): { x: number; y: number; w: number; h: number } {
  const k = o.scale ?? 1
  const size = 12.5 * k, small = 10.5 * k, padX = 6 * k, h = 20 * k
  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.font = `500 ${small}px ${P.font}`
  const lw = o.label ? ctx.measureText(o.label).width + 5 * k : 0
  ctx.font = `600 ${size}px ${P.font}`
  const vw = measureTabular(ctx, value)
  const w = lw + vw + padX * 2
  const left = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x
  roundRect(ctx, left, y - h / 2, w, h, 4 * k)
  ctx.fillStyle = P.pane
  ctx.fill()
  ctx.strokeStyle = o.tone ?? P.ink2
  ctx.lineWidth = Math.max(1, (o.line ?? 1) * 1)
  ctx.stroke()
  if (o.label) { ctx.font = `500 ${small}px ${P.font}`; ctx.fillStyle = P.ink2; ctx.textAlign = 'left'; ctx.fillText(o.label, left + padX, y + 0.5) }
  ctx.font = `600 ${size}px ${P.font}`
  ctx.fillStyle = P.ink
  tabularText(ctx, value, left + padX + lw, y + 0.5, 'left')
  ctx.restore()
  return { x: left, y: y - h / 2, w, h }
}

/** A thermometer standing in a vessel: from (x, yTop) down to (x + lean, yBulb); the thread is drawn to `fill` (0…1). */
export function drawThermometer(ctx: CanvasRenderingContext2D, P: ChemPalette, x: number, yTop: number, xBulb: number, yBulb: number, fill: number, line = 1) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = P.ink2
  ctx.lineWidth = 4 * line
  ctx.beginPath(); ctx.moveTo(x, yTop); ctx.lineTo(xBulb, yBulb); ctx.stroke()
  ctx.strokeStyle = P.pane
  ctx.lineWidth = 4 * line - 2 * Math.min(1, STROKE * 0.7)
  ctx.beginPath(); ctx.moveTo(x, yTop); ctx.lineTo(xBulb, yBulb); ctx.stroke()
  const u = Math.max(0.05, Math.min(0.95, fill))
  ctx.strokeStyle = P.danger
  ctx.lineWidth = Math.max(1, 1.25 * line)
  ctx.beginPath(); ctx.moveTo(xBulb, yBulb); ctx.lineTo(xBulb + (x - xBulb) * u, yBulb + (yTop - yBulb) * u); ctx.stroke()
  ctx.fillStyle = P.danger
  ctx.beginPath(); ctx.arc(xBulb, yBulb, 2.6 * line, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

/** A probe (pH electrode) on its cable: a rod from (x, yTop) to (x, yTip). */
export function drawProbe(ctx: CanvasRenderingContext2D, P: ChemPalette, x: number, yTop: number, yTip: number, line = 1) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = P.ink2
  ctx.lineWidth = STROKE * line
  ctx.fillStyle = P.glassBody
  const w = 3.2 * line
  ctx.beginPath(); ctx.rect(x - w, yTop, w * 2, yTip - yTop - w); ctx.fill(); ctx.stroke()
  ctx.beginPath(); ctx.arc(x, yTip - w, w, 0, Math.PI); ctx.fill(); ctx.stroke()
  ctx.fillStyle = P.ink2
  ctx.fillRect(x - w, yTop - 5 * line, w * 2, 5 * line)
  ctx.restore()
}

/** A strip of test paper dipped into a vessel, its lower part in `tint`. */
export function drawStrip(ctx: CanvasRenderingContext2D, P: ChemPalette, x: number, yTop: number, yTip: number, tint: string | null, line = 1) {
  ctx.save()
  const w = 3.5 * line
  ctx.fillStyle = P.pane
  ctx.strokeStyle = P.ink2
  ctx.lineWidth = Math.max(1, line)
  ctx.beginPath(); ctx.rect(x - w, yTop, w * 2, yTip - yTop); ctx.fill()
  if (tint) { ctx.fillStyle = tint; ctx.fillRect(x - w, yTop + (yTip - yTop) * 0.55, w * 2, (yTip - yTop) * 0.45) }
  ctx.beginPath(); ctx.rect(x - w, yTop, w * 2, yTip - yTop); ctx.stroke()
  ctx.restore()
}

/** A balance under a vessel: a pan `halfW` px wide at y, on a housing; returns where its readout goes (centre). */
export function drawBalance(ctx: CanvasRenderingContext2D, P: ChemPalette, cx: number, yPan: number, yBench: number, halfW: number, digital: boolean, line = 1): [number, number] {
  ctx.save()
  ctx.strokeStyle = P.ink2
  ctx.lineWidth = STROKE * line
  ctx.lineJoin = 'round'
  ctx.fillStyle = P.tickMinor
  const w = halfW + 10
  ctx.beginPath(); ctx.rect(cx - w, yPan, w * 2, 3 * line); ctx.fill(); ctx.stroke()
  const top = yPan + 3 * line + 3
  ctx.fillStyle = P.pane
  ctx.beginPath()
  if (digital) ctx.rect(cx - w * 0.9, top, w * 1.8, yBench - top)
  else { ctx.moveTo(cx - w * 0.5, top); ctx.lineTo(cx + w * 0.5, top); ctx.lineTo(cx + w * 0.95, yBench); ctx.lineTo(cx - w * 0.95, yBench); ctx.closePath() }
  ctx.fill(); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx, yPan + 3 * line); ctx.lineTo(cx, top); ctx.stroke()
  ctx.restore()
  return [cx, (top + yBench) / 2]
}

/** A gas syringe lying at (x, y), `len` px long; the plunger stands at `fill` (0…1) of its travel. */
export function drawSyringe(ctx: CanvasRenderingContext2D, P: ChemPalette, x: number, y: number, len: number, fill: number, line = 1) {
  ctx.save()
  ctx.strokeStyle = P.ink2
  ctx.lineWidth = STROKE * line
  ctx.fillStyle = P.glassBody
  const h = Math.max(10, len * 0.16)
  ctx.beginPath(); ctx.rect(x, y - h / 2, len, h); ctx.fill(); ctx.stroke()
  // nozzle to the vessel, plunger with its rod
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len * 0.12, y); ctx.stroke()
  const px = x + len * (0.06 + 0.88 * Math.max(0, Math.min(1, fill)))
  ctx.fillStyle = P.ink3
  ctx.fillRect(px - 2 * line, y - h / 2 + 1, 4 * line, h - 2)
  ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(x + len * 1.12, y); ctx.moveTo(x + len * 1.12, y - h * 0.45); ctx.lineTo(x + len * 1.12, y + h * 0.45); ctx.stroke()
  // scale
  ctx.lineWidth = Math.max(0.75, line * 0.7)
  ctx.strokeStyle = P.tick
  for (let i = 1; i < 10; i++) { const tx = x + len * (0.06 + 0.088 * i); ctx.beginPath(); ctx.moveTo(tx, y - h / 2); ctx.lineTo(tx, y - h / 2 + (i % 5 ? 3 : 5) * line); ctx.stroke() }
  ctx.restore()
}

/** Circuit symbols on a wire at (x, y): a cell, a resistor, a switch, a meter (a circle with its letter). */
export function drawSymbol(ctx: CanvasRenderingContext2D, P: ChemPalette, kind: 'source' | 'load' | 'switchOn' | 'switchOff' | 'V' | 'A', x: number, y: number, line = 1) {
  ctx.save()
  ctx.strokeStyle = P.ink
  ctx.fillStyle = P.bg
  ctx.lineWidth = STROKE * line
  ctx.lineCap = 'round'
  const u = 7 * line
  if (kind === 'source') {
    ctx.fillRect(x - u * 0.6, y - u * 1.3, u * 1.2, u * 2.6)
    ctx.beginPath(); ctx.moveTo(x - u * 0.4, y - u * 1.2); ctx.lineTo(x - u * 0.4, y + u * 1.2); ctx.stroke()
    ctx.lineWidth = STROKE * line * 2; ctx.beginPath(); ctx.moveTo(x + u * 0.4, y - u * 0.6); ctx.lineTo(x + u * 0.4, y + u * 0.6); ctx.stroke()
  } else if (kind === 'load') {
    ctx.beginPath(); ctx.rect(x - u * 1.6, y - u * 0.6, u * 3.2, u * 1.2); ctx.fill(); ctx.stroke()
  } else if (kind === 'switchOn' || kind === 'switchOff') {
    ctx.fillRect(x - u * 1.3, y - u, u * 2.6, u * 2)
    ctx.beginPath(); ctx.moveTo(x - u * 1.2, y); ctx.lineTo(x + u * 1.1, kind === 'switchOn' ? y : y - u * 0.95); ctx.stroke()
    ctx.fillStyle = P.ink
    ctx.beginPath(); ctx.arc(x - u * 1.2, y, 1.8 * line, 0, Math.PI * 2); ctx.arc(x + u * 1.2, y, 1.8 * line, 0, Math.PI * 2); ctx.fill()
  } else {
    ctx.beginPath(); ctx.arc(x, y, u * 1.25, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = P.ink
    ctx.font = `600 ${11 * line}px ${P.font}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(kind, x, y + 0.5)
  }
  ctx.restore()
}
