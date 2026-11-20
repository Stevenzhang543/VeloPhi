/**
 * Finding a nuclide by what people type (26.64, D276): `U-235`, `235U`, `u235`, `Tc-99m`, `铀235`, `铀-235`,
 * `Uran 235`, `uranium-235`; an element alone lists its isotopes, a mass number alone its isobars. Pure.
 */
import type { NuclideRecord } from '../engine/nuclear'
import type { NuclideTable } from './table'
import { zaKey } from './table'
import { foldSearch } from '../app/searchText'

/** Names of an element in the three languages (from the element data of the encyclopedia). */
export interface ElementName { z: number; symbol: string; zh: string; en: string; de: string }

const fold = (s: string): string => foldSearch(s).replace(/-/g, '')

/** Natural and stable isotopes first, then the longest-lived. */
function byStability(a: NuclideRecord, b: NuclideRecord): number {
  const rank = (r: NuclideRecord) => (r.stable ? 2 : r.abundance > 0 ? 1 : 0)
  return rank(b) - rank(a) || (b.halfLife ?? -1) - (a.halfLife ?? -1) || a.A - b.A
}

/** The elements a text names: by symbol (exact, case-insensitive) or by the start of a name. */
function elementsOf(text: string, t: NuclideTable, names: ElementName[]): number[] {
  if (!text) return []
  const out: number[] = []
  // the neutron is `n`: it is listed after nitrogen
  t.symbols.forEach((sym, z) => { if (sym && sym.toLowerCase() === text && z > 0) out.push(z) })
  if (text === 'n') out.push(0)
  const named = names.filter(e => [e.zh, e.en, e.de].some(n => fold(n) === text))
  for (const e of named) if (!out.includes(e.z)) out.push(e.z)
  if (!out.length && text.length >= 2) for (const e of names) if ([e.zh, e.en, e.de].some(n => fold(n).startsWith(text)) && !out.includes(e.z)) out.push(e.z)
  return out
}

export function searchNuclides(query: string, t: NuclideTable, names: ElementName[], limit = 12): NuclideRecord[] {
  const q = fold(query)
  if (!q) return []
  const out: NuclideRecord[] = []
  const add = (r: NuclideRecord | undefined) => { if (r && !out.includes(r)) out.push(r) }
  const stateOf = (s: string | undefined) => (s === 'm' ? 1 : s === 'n' ? 2 : null)
  const pick = (zs: number[], A: number, st: number | null) => {
    for (const z of zs) for (const r of t.byZA.get(zaKey(z, A)) ?? []) if (st === null ? true : r.state === st) add(r)
  }
  let m = /^(\d{1,3})([mn])?([^\d]+)$/.exec(q)
  if (m) pick(elementsOf(m[3], t, names), Number(m[1]), stateOf(m[2]))
  m = /^([^\d]+?)(\d{1,3})([mn])?$/.exec(q)
  if (m) pick(elementsOf(m[1], t, names), Number(m[2]), stateOf(m[3]))
  if (!out.length && /^\d{1,3}$/.test(q)) {
    const A = Number(q)
    out.push(...t.records.filter(r => r.A === A && r.state === 0).sort(byStability))
  }
  if (!out.length && /^[^\d]+$/.test(q)) {
    for (const z of elementsOf(q, t, names)) out.push(...t.records.filter(r => r.Z === z && r.state === 0).sort(byStability))
  }
  // an exact ground state before its isomers
  return out.slice(0, limit)
}

/** The nuclide an address or a link names (`U-235`, `Tc-99m`, `92-235`); null when the table has none. */
export function resolveNuclide(text: string, t: NuclideTable): NuclideRecord | null {
  const byNumber = /^(\d{1,3})-(\d{1,3})([mn])?$/.exec(text)
  if (byNumber) return t.byZA.get(zaKey(Number(byNumber[1]), Number(byNumber[2])))?.find(r => r.state === (byNumber[3] === 'm' ? 1 : byNumber[3] === 'n' ? 2 : 0)) ?? null
  const m = /^([A-Za-z]{1,2})-?(\d{1,3})([mn])?$/.exec(text)
  if (!m) return null
  const id = `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()}-${m[2]}${m[3] ?? ''}`
  return t.byId.get(id) ?? t.byId.get(`${m[1]}-${m[2]}${m[3] ?? ''}`) ?? null
}
