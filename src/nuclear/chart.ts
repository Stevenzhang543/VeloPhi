/**
 * The chart of nuclides as a picture (26.64, D276): which colour class every ground state falls in — by main decay
 * mode, by half-life or by binding energy per nucleon — the pixel image of the whole chart (one pixel per nuclide,
 * scaled by the canvas), the view (pan and zoom) and the drawing of one frame. The classes compare numbers of the core
 * with fixed thresholds; nothing is computed from them. Pure except `drawChart`, which draws on a 2D context.
 *
 * Cost: a frame is one scaled image plus, when the cells are large enough, the labels of the visible cells only —
 * measured by the component (`stats`) and by scripts/ui-regressions.mjs; the budget is 4 ms.
 */
import { tl } from '../i18n'
import type { NuclideTable } from './table'
import { zaKey } from './table'

export type ColourScheme = 'mode' | 'halfLife' | 'binding'
export const SCHEMES: ColourScheme[] = ['mode', 'halfLife', 'binding']

export interface ColourClass { key: string; label: string; light: string; dark: string }

/** Okabe–Ito colours for the decay modes (as nuclear charts assign them: β⁻ blue, β⁺ red, α yellow, fission green). */
const INK = { light: '#1b212c', dark: '#e9edf3' }
const UNKNOWN = { light: '#c3c9d3', dark: '#414a59' }
const MODE_CLASSES = (): ColourClass[] => [
  { key: 'stable', label: tl('稳定'), ...INK },
  { key: 'beta-', label: 'β⁻', light: '#0072b2', dark: '#56b4e9' },
  { key: 'beta+', label: tl('β⁺ 或电子俘获'), light: '#d55e00', dark: '#e8743b' },
  { key: 'alpha', label: 'α', light: '#e3c800', dark: '#f0e442' },
  { key: 'fission', label: tl('自发裂变'), light: '#009e73', dark: '#2fbf96' },
  { key: 'proton', label: tl('质子发射'), light: '#e69f00', dark: '#f2b53a' },
  { key: 'neutron', label: tl('中子发射'), light: '#cc79a7', dark: '#dd95bd' },
  { key: 'other', label: tl('其他方式'), light: '#7b8494', dark: '#9aa3b2' },
  { key: 'unknown', label: tl('未知'), ...UNKNOWN }
]
const MODE_CLASS: Record<string, number> = { 'B-': 1, '2B-': 1, 'B+': 2, EC: 2, 'e+': 2, '2B+': 2, A: 3, SF: 4, p: 5, '2p': 5, '3p': 5, n: 6, '2n': 6, '3n': 6 }

/** Colour of a decay mode (the arrows of the decay-chain picture use the colours of the chart). */
export function modeColour(mode: string, dark: boolean): string {
  const c = MODE_CLASSES()[MODE_CLASS[mode] ?? (mode === 'IT' ? 7 : /^B-/.test(mode) ? 1 : /^B\+/.test(mode) ? 2 : 7)]
  return dark ? c.dark : c.light
}

/** A sequential ramp that stays readable for colour-blind readers (viridis, 11 steps: short-lived dark, long-lived bright). */
const RAMP = ['#440154', '#482475', '#414487', '#355f8d', '#2a788e', '#21918c', '#22a884', '#44bf70', '#7ad151', '#bddf26', '#fde725']

/** Upper bounds of the half-life classes in seconds, with their labels. */
const HALF_LIFE_STEPS: Array<[number, string]> = [
  [1e-6, '< 1 µs'], [1e-3, '1 µs – 1 ms'], [1, '1 ms – 1 s'], [60, '1 s – 1 min'], [3600, '1 min – 1 h'], [86400, '1 h – 1 d'], [31556926, '1 d – 1 a'],
  [31556926e3, '1 a – 10³ a'], [31556926e6, '10³ – 10⁶ a'], [31556926e9, '10⁶ – 10⁹ a'], [Infinity, '> 10⁹ a']
]
/** Upper bounds of the classes of the binding energy per nucleon in keV. */
const BINDING_STEPS: Array<[number, string]> = [
  [2000, '< 2 MeV'], [5000, '2 – 5 MeV'], [6500, '5 – 6.5 MeV'], [7000, '6.5 – 7 MeV'], [7400, '7 – 7.4 MeV'], [7700, '7.4 – 7.7 MeV'], [7900, '7.7 – 7.9 MeV'],
  [8100, '7.9 – 8.1 MeV'], [8300, '8.1 – 8.3 MeV'], [8500, '8.3 – 8.5 MeV'], [Infinity, '> 8.5 MeV']
]

export function colourClasses(scheme: ColourScheme): ColourClass[] {
  if (scheme === 'mode') return MODE_CLASSES()
  const steps = scheme === 'halfLife' ? HALF_LIFE_STEPS : BINDING_STEPS
  const out: ColourClass[] = steps.map(([, label], i) => ({ key: `c${i}`, label, light: RAMP[i], dark: RAMP[i] }))
  if (scheme === 'halfLife') out.push({ key: 'stable', label: tl('稳定'), ...INK })
  out.push({ key: 'unknown', label: tl('未知'), ...UNKNOWN })
  return out
}

/** Class index of every entry of the chart arrays (isomers get the class too; the picture uses the ground states). */
export function classify(t: NuclideTable, scheme: ColourScheme): Uint8Array {
  const c = t.chart
  const out = new Uint8Array(c.count)
  const classes = colourClasses(scheme)
  const unknown = classes.length - 1
  for (let i = 0; i < c.count; i++) {
    if (scheme === 'mode') {
      if (c.halfLife[i] === Infinity) out[i] = 0
      else if (c.mode[i] < 0) out[i] = unknown
      else out[i] = MODE_CLASS[c.modes[c.mode[i]]] ?? 7
    } else if (scheme === 'halfLife') {
      const h = c.halfLife[i]
      if (h === Infinity) out[i] = unknown - 1
      else if (!(h >= 0)) out[i] = unknown
      else { let k = 0; while (h >= HALF_LIFE_STEPS[k][0]) k++; out[i] = k }
    } else {
      const A = c.Z[i] + c.N[i]
      const b = t.byZA.get(zaKey(c.Z[i], A))?.find(r => r.state === c.state[i])?.bindingPerNucleon
      if (b === null || b === undefined || !Number.isFinite(b)) out[i] = unknown
      else { let k = 0; while (b >= BINDING_STEPS[k][0]) k++; out[i] = k }
    }
  }
  return out
}

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
/** Black or white, whichever reads better on a fill (relative luminance). */
export function inkOn(hex: string): string {
  const [r, g, b] = rgb(hex).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? '#10141b' : '#ffffff'
}

export interface ChartPixels { width: number; height: number; data: Uint8ClampedArray; /** chart index at (N, Z), −1: none */ cell: Int32Array }

/** One pixel per ground state: column N, row zMax − Z (so the image is upright when drawn). */
export function chartPixels(t: NuclideTable, cls: Uint8Array, classes: ColourClass[], dark: boolean): ChartPixels {
  const width = t.nMax + 1, height = t.zMax + 1
  const data = new Uint8ClampedArray(width * height * 4)
  const cell = new Int32Array(width * height).fill(-1)
  const colours = classes.map(c => rgb(dark ? c.dark : c.light))
  for (const i of t.ground) {
    const N = t.chart.N[i], Z = t.chart.Z[i]
    cell[Z * width + N] = i
    const p = ((t.zMax - Z) * width + N) * 4
    const [r, g, b] = colours[cls[i]]
    data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255
  }
  return { width, height, data, cell }
}

// ---- the view ----

/** Screen x of the left edge of column N: `ox + N·scale`; screen y of the top edge of row Z: `oy − (Z + 1)·scale`. */
export interface ChartView { scale: number; ox: number; oy: number }
export const MIN_SCALE = 2
export const MAX_SCALE = 72

/** The view that shows the whole chart in a canvas of w × h. */
export function fitView(t: NuclideTable, w: number, h: number, pad = 28): ChartView {
  const scale = Math.max(MIN_SCALE, Math.min((w - 2 * pad) / (t.nMax + 1), (h - 2 * pad) / (t.zMax + 1)))
  return { scale, ox: (w - (t.nMax + 1) * scale) / 2, oy: h - (h - (t.zMax + 1) * scale) / 2 }
}

/** Zoom by `factor` keeping the screen point (x, y) fixed. */
export function zoomAt(v: ChartView, factor: number, x: number, y: number): ChartView {
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor))
  const f = scale / v.scale
  return { scale, ox: x - (x - v.ox) * f, oy: y - (y - v.oy) * f }
}

/** The view centred on (N, Z) at a scale that shows its neighbourhood. */
export function centreOn(N: number, Z: number, w: number, h: number, scale: number): ChartView {
  return { scale, ox: w / 2 - (N + 0.5) * scale, oy: h / 2 + (Z + 0.5) * scale }
}

/** (N, Z) under a screen point. */
export function cellAt(v: ChartView, x: number, y: number): { N: number; Z: number } {
  return { N: Math.floor((x - v.ox) / v.scale), Z: Math.floor((v.oy - y) / v.scale) }
}

/** Chart index of the ground state at (N, Z); −1 when there is none. */
export function indexAt(px: ChartPixels, N: number, Z: number): number {
  return N < 0 || Z < 0 || N >= px.width || Z >= px.height ? -1 : px.cell[Z * px.width + N]
}

export const MAGIC = [2, 8, 20, 28, 50, 82, 126]

export interface ChartPaint { bg: string; line: string; text: string; accent: string; font: string }
export interface ChartFrame {
  table: NuclideTable; pixels: ChartPixels; cls: Uint8Array; classes: ColourClass[]; dark: boolean
  /** The image of `pixels` (a canvas or bitmap). */
  image: CanvasImageSource
  view: ChartView; width: number; height: number; paint: ChartPaint
  selected: { N: number; Z: number } | null; hover: { N: number; Z: number } | null
}

/** Cells get their label from this size on. */
export const LABEL_SCALE = 24

/** Draw one frame. Returns the number of labelled cells (for the measurements). */
export function drawChart(ctx: CanvasRenderingContext2D, f: ChartFrame): number {
  const { view: v, table: t, pixels: px, width: w, height: h, paint } = f
  const s = v.scale
  ctx.fillStyle = paint.bg
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(f.image, v.ox, v.oy - px.height * s, px.width * s, px.height * s)
  const n0 = Math.max(0, Math.floor(-v.ox / s)), n1 = Math.min(t.nMax, Math.floor((w - v.ox) / s))
  const z0 = Math.max(0, Math.floor((v.oy - h) / s)), z1 = Math.min(t.zMax, Math.floor(v.oy / s))
  // separators between the cells, in the colour of the paper (invisible where there is no nuclide)
  if (s >= 7) {
    ctx.strokeStyle = paint.bg
    ctx.lineWidth = s >= 16 ? 1.5 : 1
    ctx.beginPath()
    for (let N = n0; N <= n1 + 1; N++) { const x = Math.round(v.ox + N * s) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, h) }
    for (let Z = z0; Z <= z1 + 1; Z++) { const y = Math.round(v.oy - Z * s) + 0.5; ctx.moveTo(0, y); ctx.lineTo(w, y) }
    ctx.stroke()
  }
  // magic numbers: a thin frame around the column or row
  ctx.strokeStyle = paint.line
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const m of MAGIC) {
    if (m >= n0 - 1 && m <= n1 + 1) { const x = Math.round(v.ox + m * s) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.moveTo(x + Math.round(s), 0); ctx.lineTo(x + Math.round(s), h) }
    if (m <= t.zMax && m >= z0 - 1 && m <= z1 + 1) { const y = Math.round(v.oy - m * s) + 0.5; ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.moveTo(0, y - Math.round(s)); ctx.lineTo(w, y - Math.round(s)) }
  }
  ctx.stroke()
  // labels of the visible cells
  let labelled = 0
  if (s >= LABEL_SCALE) {
    const inks = f.classes.map(c => inkOn(f.dark ? c.dark : c.light))
    const big = Math.max(9, Math.min(20, s * 0.34)), small = Math.max(7, Math.min(13, s * 0.24))
    ctx.textAlign = 'center'
    for (let pass = 0; pass < 2; pass++) {
      ctx.font = `${pass === 0 ? 600 : 400} ${pass === 0 ? big : small}px ${paint.font}`
      ctx.textBaseline = pass === 0 ? 'alphabetic' : 'top'
      for (let Z = z0; Z <= z1; Z++) {
        for (let N = n0; N <= n1; N++) {
          const i = px.cell[Z * px.width + N]
          if (i < 0) continue
          ctx.fillStyle = inks[f.cls[i]]
          const x = v.ox + (N + 0.5) * s, y = v.oy - (Z + 1) * s
          if (pass === 0) { ctx.fillText(t.symbols[Z] ?? '', x, y + s * 0.78); labelled++ } else ctx.fillText(String(Z + N), x, y + s * 0.1)
        }
      }
    }
  }
  // axes: numbers along the lower and the left edge
  const step = s >= 28 ? 1 : s >= 12 ? 5 : s >= 5 ? 10 : 20
  ctx.font = `11px ${paint.font}`
  ctx.fillStyle = paint.bg
  ctx.fillRect(0, h - 16, w, 16)
  ctx.fillRect(0, 0, 26, h)
  ctx.fillStyle = paint.text
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'
  for (let N = Math.ceil(n0 / step) * step; N <= n1; N += step) { const x = v.ox + (N + 0.5) * s; if (x > 40) ctx.fillText(String(N), x, h - 4) }
  ctx.textAlign = 'right'
  for (let Z = Math.ceil(z0 / step) * step; Z <= z1; Z += step) { const y = v.oy - (Z + 0.5) * s; if (y < h - 22 && y > 8) ctx.fillText(String(Z), 22, y + 4) }
  ctx.textAlign = 'left'
  ctx.fillText('Z', 4, 12)
  ctx.textAlign = 'right'
  ctx.fillText('N', w - 4, h - 4)
  // hover and selection
  const frame = (c: { N: number; Z: number }, width: number) => {
    ctx.lineWidth = width
    ctx.strokeStyle = paint.accent
    const size = Math.max(s, 6), x = v.ox + (c.N + 0.5) * s - size / 2, y = v.oy - (c.Z + 0.5) * s - size / 2
    ctx.strokeRect(x, y, size, size)
  }
  if (f.hover) frame(f.hover, 1.5)
  if (f.selected) { frame(f.selected, 3); ctx.strokeStyle = paint.bg; ctx.lineWidth = 1; const size = Math.max(s, 6) + 4; ctx.strokeRect(v.ox + (f.selected.N + 0.5) * s - size / 2, v.oy - (f.selected.Z + 0.5) * s - size / 2, size, size) }
  ctx.textAlign = 'left'
  return labelled
}
