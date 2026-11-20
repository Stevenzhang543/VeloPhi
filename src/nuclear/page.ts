/**
 * The page of a nuclide as text (26.64, D276): everything the page shows about one record of the table — half-life,
 * decay modes as published and the branches the core computed (daughter, share, Q value), mass excess, binding
 * energy, the isomers of the same (Z, A) — typeset for the interface. Pure: every number is a field of the record.
 */
import { tl } from '../i18n'
import type { NuclideRecord } from '../engine/nuclear'
import type { NuclideTable } from './table'
import { zaKey } from './table'
import type { ElementName } from './search'
import { fixed, halfLifeText, keVText, lifeText, modeText, nuclideLabel, percentText, sig, stateSuffix, withUnit } from './format'

export interface PageRow { key: string; label: string; value: string; note?: string }
export interface PageDecay { mode: string; intensity: string }
export interface PageBranch {
  mode: string
  /** Id of the daughter, when it is a nuclide of the table. */
  to: string | null
  /** `²³¹Th`, or where the branch leaves the table. */
  target: string
  fraction: string
  q: string
  note: string | null
}
export interface PageIsomer { id: string; label: string; life: string; massExcess: string; current: boolean }
export interface NuclidePage {
  id: string
  label: string
  /** `铀-235`, `Uranium-235`, `Uran-235`: the element's name in the language, when the names are loaded. */
  name: string
  Z: number; N: number; A: number
  stable: boolean
  life: string
  rows: PageRow[]
  decays: PageDecay[]
  branches: PageBranch[]
  isomers: PageIsomer[]
  notes: string[]
  /** A decay chain can be shown from here. */
  chain: boolean
}

function sinkText(sink: string | null): string {
  return sink === 'fission' ? tl('裂变产物（不跟踪）') : sink === 'outside' ? tl('表外的核素') : '—'
}

export function nuclidePage(r: NuclideRecord, t: NuclideTable, name?: ElementName | null, lang: 'zh' | 'en' | 'de' = 'zh'): NuclidePage {
  const approx = r.flags.halfLifeEstimated ? tl('由系统学估计') : r.flags.halfLifeLimit ? tl('只有界限') : undefined
  const rows: PageRow[] = [
    { key: 'halfLife', label: tl('半衰期'), value: lifeText(r.stable, r.halfLife), note: r.stable ? undefined : approx },
    ...(r.lambda !== null && r.lambda > 0 ? [{ key: 'lambda', label: tl('衰变常数 λ'), value: withUnit(sig(r.lambda, 4), 's⁻¹') }] : []),
    ...(r.halfLife !== null && !r.stable ? [{ key: 'seconds', label: tl('半衰期（秒）'), value: withUnit(sig(r.halfLife, 5), 's') }] : []),
    ...(r.abundance > 0 ? [{ key: 'abundance', label: tl('天然丰度'), value: withUnit(sig(r.abundance, 5), '%') }] : []),
    { key: 'massExcess', label: tl('质量过剩'), value: keVText(r.massExcess, 2), note: r.flags.massEstimated ? tl('由系统学估计') : undefined },
    { key: 'mass', label: tl('原子质量'), value: withUnit(fixed(r.mass, 6), 'u') },
    { key: 'binding', label: tl('结合能'), value: keVText(r.binding, 1) },
    { key: 'bindingPerNucleon', label: tl('比结合能'), value: keVText(r.bindingPerNucleon, 2) }
  ]
  const decays = r.decays.map(d => ({ mode: modeText(d.mode), intensity: d.intensity === null ? tl('强度未知') : percentText(d.intensity) }))
  const branches: PageBranch[] = r.branches.map(b => ({
    mode: modeText(b.mode), to: b.to && t.byId.has(b.to) ? b.to : null, target: b.to ? nuclideLabel(b.to) : sinkText(b.sink),
    fraction: percentText(b.fraction), q: b.Q === null ? '—' : keVText(b.Q, 1),
    note: b.isomerUnknown ? tl('到 {0} 的份额未知，按基态计', [nuclideLabel(b.isomerUnknown)]) : null
  }))
  const isomers = (t.byZA.get(zaKey(r.Z, r.A)) ?? []).map(x => ({ id: x.id, label: nuclideLabel(x.id), life: lifeText(x.stable, x.halfLife), massExcess: keVText(x.massExcess, 1), current: x.id === r.id }))
  const notes: string[] = []
  if (r.flags.particleUnstable) notes.push(tl('对粒子发射不稳定：寿命极短，半衰期没有数值。'))
  if (r.flags.modesOpen) notes.push(tl('有的衰变方式只知道存在，强度没有数值。'))
  if (!r.stable && r.branches.length > 0 && Math.abs(r.branchSum - 1) > 1e-6) notes.push(tl('发表的强度合计为 {0}；核心按它们的比例计算分支。', [percentText(r.branchSum)]))
  const element = name ? name[lang] : r.symbol
  return {
    id: r.id, label: nuclideLabel(r.id), name: `${element}-${r.A}${stateSuffix(r.state)}`, Z: r.Z, N: r.N, A: r.A, stable: r.stable,
    life: lifeText(r.stable, r.halfLife), rows, decays, branches, isomers: isomers.length > 1 ? isomers : [], notes,
    chain: !r.stable && r.lambda !== null && r.lambda > 0 && r.branches.some(b => b.to !== null)
  }
}

/** A short line for a tooltip or a search result: `²³⁵U · 7.04×10⁸ a · α`. */
export function nuclideLine(r: NuclideRecord): string {
  const main = r.decays.length ? modeText([...r.decays].sort((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0))[0].mode) : ''
  return [nuclideLabel(r.id), r.stable ? tl('稳定') : halfLifeText(r.halfLife, 3), main].filter(Boolean).join(' · ')
}
