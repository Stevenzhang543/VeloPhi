/**
 * The nuclide table as the interface reads it (26.64, D276): the arrays of `nuclideChart` for the picture and every
 * record of `nuclideInfo` (ground states and isomers, with the daughters, Q values and binding energies the core
 * computed) with an index by id and by (Z, A). Loaded once, on the first visit of the chart: the data file is not
 * part of the start-up bundle. Nothing is computed here.
 */
import type { NuclideChart, NuclideRecord } from '../engine/nuclear'
import { loadNuclides, nuclideChart, nuclideInfo } from '../engine/nuclear'

export interface NuclideTable {
  chart: NuclideChart
  /** Indices into the chart arrays of the ground states. */
  ground: Int32Array
  records: NuclideRecord[]
  byId: Map<string, NuclideRecord>
  /** Ground state and isomers of (Z, A), ground first. */
  byZA: Map<number, NuclideRecord[]>
  /** Symbol of Z (0: n). */
  symbols: string[]
  zMax: number
  nMax: number
  citations: string[]
  licence: string
  counts: { nuclides: number; ground: number; isomers: number; stable: number }
}

export const zaKey = (Z: number, A: number): number => Z * 1000 + A

let pending: Promise<NuclideTable> | null = null

export function loadNuclideTable(): Promise<NuclideTable> {
  pending ??= build().catch(e => { pending = null; throw e })
  return pending
}

/** Forget the table (tests that replace the core). */
export function resetNuclideTable() { pending = null }

async function build(): Promise<NuclideTable> {
  const info = await loadNuclides()
  const chart = await nuclideChart()
  let zMax = 0, nMax = 0
  const ground: number[] = []
  for (let i = 0; i < chart.count; i++) {
    if (chart.Z[i] > zMax) zMax = chart.Z[i]
    if (chart.N[i] > nMax) nMax = chart.N[i]
    if (chart.state[i] === 0) ground.push(i)
  }
  const records: NuclideRecord[] = []
  for (let z = 0; z <= zMax; z++) records.push(...(await nuclideInfo({ Z: z })).nuclides)
  const byId = new Map<string, NuclideRecord>()
  const byZA = new Map<number, NuclideRecord[]>()
  const symbols: string[] = []
  for (const r of records) {
    byId.set(r.id, r)
    symbols[r.Z] = r.symbol
    const k = zaKey(r.Z, r.A)
    const list = byZA.get(k)
    if (list) list.push(r); else byZA.set(k, [r])
  }
  for (const list of byZA.values()) list.sort((a, b) => a.state - b.state)
  return { chart, ground: Int32Array.from(ground), records, byId, byZA, symbols, zMax, nMax, citations: info.citations, licence: info.licence, counts: { nuclides: info.nuclides, ground: info.ground, isomers: info.isomers, stable: info.stable } }
}

/** The ground state of (Z, A), or the given state of it. */
export function recordOf(t: NuclideTable, Z: number, A: number, state = 0): NuclideRecord | null {
  const list = t.byZA.get(zaKey(Z, A))
  return list?.find(r => r.state === state) ?? null
}
