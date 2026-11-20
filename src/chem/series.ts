/**
 * Live curves of the bench (26.65, D297 item 10): per vessel, the core's numbers over bench time — temperature, pH,
 * gas held, pressure — and, for a titration, pH against the vessel's volume after each addition. Samples are taken from
 * the state the core gives (after every action and every frame of the clock); nothing is computed here but the
 * bookkeeping of a capped list (a long run keeps every second sample of its first half, so the curve stays whole).
 */
import type { VesselState } from '../engine/chem'

/** A sample: bench time, the length of the log then (undo cuts by both), and the vessel's numbers. */
export interface Sample { t: number; n: number; T: number; pH: number | null; gas: number; P: number; V: number; closed: boolean }
export type Curve = 'T' | 'pH' | 'pHV' | 'gas' | 'P'

const CAP = 1500

export function createSeries() {
  const byVessel = new Map<string, Sample[]>()

  /** Take a sample of every vessel at bench time `t` with `n` entries in the log (one equal to the last is not repeated). */
  function sample(t: number, n: number, vessels: VesselState[]) {
    for (const v of vessels) {
      let list = byVessel.get(v.id)
      if (!list) { list = []; byVessel.set(v.id, list) }
      const s: Sample = { t, n, T: v.T, pH: v.pH ?? null, gas: v.gas_mL, P: v.P, V: v.volume_mL, closed: v.closed }
      const last = list[list.length - 1]
      if (last && last.t === s.t && last.T === s.T && last.pH === s.pH && last.gas === s.gas && last.V === s.V && last.P === s.P) continue
      // the same time again (an action without time passing): the new state replaces the old one in a time curve, and
      // is kept as a point of the volume curve
      list.push(s)
      if (list.length > CAP) {
        const half = Math.floor(list.length / 2)
        list.splice(0, half, ...list.slice(0, half).filter((_, i) => i % 2 === 0))
      }
    }
    for (const id of byVessel.keys()) if (!vessels.some(v => v.id === id)) byVessel.delete(id)
  }

  /** Forget what lies after bench time `t` or after the log's `n`-th entry (undo went back there). */
  function cut(t: number, n: number) { for (const [id, list] of byVessel) byVessel.set(id, list.filter(s => s.t <= t + 1e-9 && s.n <= n)) }
  function clear() { byVessel.clear() }

  /** The points of a curve of a vessel: x and y in the curve's units (s, °C, mL, kPa); time curves keep the last state of each instant. */
  function points(id: string, curve: Curve): Array<[number, number]> {
    const list = byVessel.get(id) ?? []
    const out: Array<[number, number]> = []
    if (curve === 'pHV') {
      for (const s of list) if (s.pH !== null) out.push([s.V, s.pH])
      return out
    }
    for (let i = 0; i < list.length; i++) {
      const s = list[i]
      if (i + 1 < list.length && list[i + 1].t === s.t) continue
      const y = curve === 'T' ? s.T - 273.15 : curve === 'pH' ? s.pH : curve === 'gas' ? s.gas : s.P / 1000
      if (y !== null && Number.isFinite(y)) out.push([s.t, y])
    }
    return out
  }

  /** The curves that say something for a vessel: pH with a solution, gas when it holds some, pressure when closed. */
  function curvesOf(id: string): Curve[] {
    const list = byVessel.get(id) ?? []
    const out: Curve[] = ['T']
    if (list.some(s => s.pH !== null)) out.push('pH')
    if (new Set(list.filter(s => s.pH !== null).map(s => s.V.toFixed(3))).size >= 3) out.push('pHV')
    if (list.some(s => s.gas > 0)) out.push('gas')
    if (list.some(s => s.closed)) out.push('P')
    return out
  }

  /** A curve as text with a header line (comma separated; the decimal point is a point). */
  function csv(id: string, curve: Curve, head: [string, string]): string {
    return [head.join(','), ...points(id, curve).map(([x, y]) => `${x},${y}`)].join('\n')
  }

  return { sample, cut, clear, points, curvesOf, csv, size: (id: string) => byVessel.get(id)?.length ?? 0 }
}

export type Series = ReturnType<typeof createSeries>
