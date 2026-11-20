/**
 * The decay-chain view as data (26.64, D276): the network `nuclideChain` returned laid out on the N–Z plane (an α
 * decay goes two cells down and two to the left, a β⁻ decay one up and one to the left — the way chains are drawn on
 * the chart of nuclides), and the amounts and activities `nuclideDecay` returned as curves and as a table at one
 * sample. Pure. The curves are the core's arrays; a logarithmic axis is a way of drawing them, not a result.
 */
import { tl } from '../i18n'
import type { DecayChain, DecayResult } from '../engine/nuclear'
import type { NuclideTable } from './table'
import { halfLifeText, keVText, lifeText, modeText, nuclideLabel, percentText, sig, withUnit } from './format'

export interface ChainNode { index: number; id: string; label: string; Z: number; N: number; state: number; col: number; row: number; stable: boolean; life: string; generation: number; parent: boolean }
export interface ChainEdge { from: number; to: number; modeKey: string; mode: string; fraction: string; q: string; /** the main branch of its parent */ main: boolean }
export interface ChainLayout { nodes: ChainNode[]; edges: ChainEdge[]; cols: number; rows: number; untracked: string[]; members: number; stableEnds: string[] }

function untrackedText(reason: string, who: string, share: string): string {
  switch (reason) {
    case 'fission': return tl('{0}：{1} 自发裂变，裂变产物不跟踪', [who, share])
    case 'outside': return tl('{0}：{1} 衰变到表外的核素', [who, share])
    case 'pruned': return tl('{0}：{1} 走的是低于阈值的分支，没有跟踪', [who, share])
    case 'unknown': return tl('{0}：{1} 的去向未知', [who, share])
    default: return tl('{0}：{1} 没有列出的衰变方式', [who, share])
  }
}

export function chainLayout(chain: DecayChain, t: NuclideTable): ChainLayout {
  const recs = chain.nuclides.map(n => t.byId.get(n.id) ?? null)
  let nMin = Infinity, nMax = -Infinity, zMin = Infinity, zMax = -Infinity
  for (const r of recs) if (r) { nMin = Math.min(nMin, r.N); nMax = Math.max(nMax, r.N); zMin = Math.min(zMin, r.Z); zMax = Math.max(zMax, r.Z) }
  if (!Number.isFinite(nMin)) { nMin = nMax = zMin = zMax = 0 }
  const nodes: ChainNode[] = chain.nuclides.map((n, index) => {
    const r = recs[index]
    // an isomer sits one row above its ground state, half a column to the right
    const shift = r && r.state > 0 ? 1 : 0
    return {
      index, id: n.id, label: nuclideLabel(n.id), Z: r?.Z ?? 0, N: r?.N ?? 0, state: r?.state ?? 0,
      col: (r ? r.N - nMin : index) + shift / 2, row: (r ? zMax - r.Z : 0) + 1 - shift,
      stable: n.stable, life: lifeText(n.stable, n.halfLife), generation: n.generation, parent: n.generation === 0
    }
  })
  const best = new Map<number, number>()
  chain.edges.forEach(e => { if (e.fraction > (best.get(e.from) ?? -1)) best.set(e.from, e.fraction) })
  const edges: ChainEdge[] = chain.edges.map(e => ({ from: e.from, to: e.to, modeKey: e.mode, mode: modeText(e.mode), fraction: percentText(e.fraction), q: e.Q === null ? '—' : keVText(e.Q, 0), main: e.fraction === best.get(e.from) }))
  const untracked = chain.untracked.map(u => untrackedText(u.reason, nuclideLabel(chain.nuclides[u.from].id), percentText(u.fraction)))
  return { nodes, edges, cols: nMax - nMin + 1.5, rows: zMax - zMin + 2, untracked, members: nodes.length, stableEnds: nodes.filter(n => n.stable).map(n => n.label) }
}

/** Colours of the curves (Okabe–Ito, colour-blind safe), light and dark. */
export const CURVE_COLOURS: Array<[string, string]> = [
  ['#0072b2', '#56b4e9'], ['#d55e00', '#e8743b'], ['#009e73', '#2fbf96'], ['#b8860b', '#f0e442'], ['#cc79a7', '#dd95bd'], ['#56b4e9', '#8fd0f5'], ['#7b8494', '#b9c1ce'], ['#e69f00', '#f2b53a']
]

export type Quantity = 'A' | 'N'
export interface DecayCurve { id: string; label: string; color: string; x: number[]; y: number[] }
export interface DecayRow { id: string; label: string; life: string; N: string; A: string; color: string | null }
export interface DecayView {
  curves: DecayCurve[]
  /** The ids drawn, most prominent first. */
  drawn: string[]
  xLabel: string; yLabel: string
  yRange: [number, number] | null
  /** One line about how the values were obtained. */
  method: string
}

/** Time points for a request: evenly spaced, or logarithmically from `tEnd·10^−decades`. */
export function sampleTimes(tEnd: number, samples: number, log: boolean, decades = 9): number[] {
  const out: number[] = []
  for (let i = 0; i < samples; i++) out.push(log ? tEnd * Math.pow(10, -decades * (1 - i / (samples - 1))) : tEnd * i / (samples - 1))
  return out
}

/** The rows of a quantity of the result, by nuclide id. */
function rowOf(r: DecayResult, q: Quantity, i: number): Float64Array {
  const n = r.t.length
  return (q === 'A' ? r.A : r.N).subarray(i * n, (i + 1) * n)
}

export function decayView(r: DecayResult, opts: { quantity: Quantity; logTime: boolean; logValue: boolean; dark: boolean; top?: number; unitTime?: string }): DecayView {
  const top = opts.top ?? 8
  const n = r.t.length
  const peak = r.nuclides.map((_, i) => { let m = 0; const row = rowOf(r, opts.quantity, i); for (let k = 0; k < n; k++) if (row[k] > m) m = row[k]; return m })
  const order = r.nuclides.map((_, i) => i).filter(i => peak[i] > 0).sort((a, b) => peak[b] - peak[a]).slice(0, top)
  // drawn in the order of the chain, coloured in that order too
  order.sort((a, b) => a - b)
  const overall = Math.max(0, ...order.map(i => peak[i]))
  const floor = overall * 1e-12
  const x = Array.from(r.t, t => (opts.logTime ? (t > 0 ? Math.log10(t) : NaN) : t))
  const curves = order.map((i, k) => ({
    id: r.nuclides[i], label: nuclideLabel(r.nuclides[i]), color: CURVE_COLOURS[k % CURVE_COLOURS.length][opts.dark ? 1 : 0], x,
    y: Array.from(rowOf(r, opts.quantity, i), v => (opts.logValue ? (v > floor ? Math.log10(v) : NaN) : v))
  }))
  const unit = opts.quantity === 'A' ? 'Bq' : ''
  const quantity = opts.quantity === 'A' ? tl('活度 A') : tl('核数 N')
  const yLabel = opts.logValue ? `lg(${quantity}${unit ? ' / ' + unit : ''})` : unit ? `${quantity} / ${unit}` : quantity
  const method = r.fallback > 0
    ? tl('贝特曼解析解 {0} 个值，转移矩阵 {1} 个值；相对误差界 {2}', [r.analytic, r.fallback, sig(r.errorBound, 2)])
    : tl('贝特曼解析解 {0} 个值；相对误差界 {1}', [r.analytic, sig(r.errorBound, 2)])
  return {
    curves, drawn: order.map(i => r.nuclides[i]), xLabel: opts.logTime ? 'lg(t / s)' : 't / s', yLabel,
    yRange: opts.logValue && overall > 0 ? [Math.log10(overall) - 12, Math.log10(overall) + 0.6] : null, method
  }
}

/** Amount and activity of every member at sample `k`, in the order of the chain. */
export function decayRows(r: DecayResult, k: number, view: DecayView): DecayRow[] {
  const n = r.t.length
  const at = Math.max(0, Math.min(n - 1, k))
  return r.nuclides.map((id, i) => {
    const node = r.chain.nuclides[i]
    const curve = view.curves.find(c => c.id === id)
    return { id, label: nuclideLabel(id), life: node ? lifeText(node.stable, node.halfLife) : '—', N: sig(r.N[i * n + at], 4), A: node?.stable ? '—' : withUnit(sig(r.A[i * n + at], 4), 'Bq'), color: curve?.color ?? null }
  })
}

/** `t = 4.47×10⁹ a` for the sample `k` of a result. */
export function sampleTime(r: DecayResult, k: number): string {
  const t = r.t[Math.max(0, Math.min(r.t.length - 1, k))]
  return t === 0 ? withUnit('0', 's') : halfLifeText(t, 3)
}
