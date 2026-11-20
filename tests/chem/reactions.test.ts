/**
 * The declared reactions, the electrode couples and the indicators of the chemistry catalogue (26.64, D265, D266,
 * D270, D272): the source tables under scripts/chem/catalog/ and scripts/chem/supplement_indicators.dat.
 *
 * Three kinds of check. (1) The report of scripts/chem/check_reactions.py (tests/fixtures/chem/reactions-report.json)
 * shows no violation and belongs to the tables as they are now. (2) An independent re-check here, in another language
 * and with its own formula reader: every equation and every half-reaction balances in elements and charge. (3) Closed
 * forms and well-known values: E° of the textbook couples, ln K from ΔH and ΔS, half-lives of the thermal laws, the
 * fraction of an indicator at the ends of its transition range. The core's reader accepts the tables.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setChemData } from '../../src/engine/chem'

const root = join(__dirname, '..', '..')
const text = (p: string) => readFileSync(join(root, p), 'utf8')
const json = (p: string) => JSON.parse(text(p))

type Side = Record<string, number>
interface Name { zh: string; en: string; de: string }
interface Rate { law: string; k?: number; A?: number; Ea?: number; Tref?: number; orders?: Side; on?: string; of?: string; catalyst?: string; lnK?: [number, number]; reversible?: boolean }
interface Reaction {
  id: string; name: Name; class: string; curated?: string; eq?: Side; between?: string[]; rate: Rate; via?: [string, string]
  needs?: { Tmin?: number; Tmax?: number; ignite?: boolean; light?: boolean; min?: Side; max?: Side; unsaturated?: string[] }
  effects: string[]; teaching?: boolean; basis?: string; entry?: string; src: string; note?: Name
}
interface Couple { id: string; ox: Side; red: Side; n: number; E0: number; medium?: string; src: string; entry: string; bench?: boolean; inert?: boolean }
interface Experiment { id: string; group: string; name: Name; reactions?: string[]; couples?: string[]; network?: string[]; substances?: string[]; indicators?: string[]; noReaction?: string }
interface Report {
  violations: string[]
  counts: { reactions: number; couples: number; dissolution: number; experiments: number; indicators: number; teaching: number; measured: number; byClass: Record<string, number> }
  pending: Array<{ id: string; kind: string }>
  teaching: string[]; measured: string[]
  e0: Array<{ id: string; E0: number; network: number; delta_mV: number }>
  indicators: Array<{ element: string; pKa: number; range: [number, number] }>
}

const rdoc = json('scripts/chem/catalog/reactions.json') as { reactions: Reaction[]; curated: Record<string, Name>; activityOrder: string[]; effectKeys: string[]; dissolution: Record<string, Record<string, unknown>>; electrolysis: { overpotential: Record<string, Record<string, number> | string> } }
const cdoc = json('scripts/chem/catalog/couples.json') as { couples: Couple[] }
const xdoc = json('scripts/chem/catalog/experiments_map.json') as { experiments: Experiment[] }
const report = json('tests/fixtures/chem/reactions-report.json') as Report
const aqueous = json('src/chem/data/aqueous.json') as { species: Array<{ id: string; z: number; comp: Record<string, number>; phase: string }> }
const reactions = rdoc.reactions
const couples = cdoc.couples

// ---- an independent reader of formulas and of the three sources of ids ------------------------------------------

/** Element counts of 'Ca(OH)2', 'CuSO4:5H2O', '(C17H35COO)3C3H5', 'CaSO4:0.5H2O'. */
function formula(f: string): Record<string, number> {
  const total: Record<string, number> = {}
  f.split(':').forEach((part, i) => {
    let mult = 1
    const lead = /^(\d+\.?\d*)(.*)$/.exec(part)
    if (i > 0 && lead) { mult = Number(lead[1]); part = lead[2] }
    const stack: Array<Record<string, number>> = [{}]
    const re = /([A-Z][a-z]?)(\d+\.?\d*)?|(\()|\)(\d+\.?\d*)?/g
    let m: RegExpExecArray | null
    let read = 0
    while ((m = re.exec(part))) {
      read += m[0].length
      if (m[3]) stack.push({})
      else if (m[1]) stack[stack.length - 1][m[1]] = (stack[stack.length - 1][m[1]] ?? 0) + Number(m[2] ?? 1)
      else {
        const top = stack.pop()!
        for (const [e, n] of Object.entries(top)) stack[stack.length - 1][e] = (stack[stack.length - 1][e] ?? 0) + n * Number(m[4] ?? 1)
      }
    }
    if (read !== part.length || stack.length !== 1) throw new Error(`formula ${f}`)
    for (const [e, n] of Object.entries(stack[0])) total[e] = (total[e] ?? 0) + n * mult
  })
  return total
}

interface Known { comp: Record<string, number>; z: number; origin: 'network' | 'substance' | 'pending' }
const known = new Map<string, Known>()
for (const s of aqueous.species) known.set(s.id, { comp: s.comp, z: s.z, origin: 'network' })
const substancesPath = 'scripts/chem/catalog/substances.json'
const substanceRows: Array<{ id: string; formula?: string; phase: string }> = existsSync(join(root, substancesPath)) ? json(substancesPath).substances : []
for (const s of substanceRows) if (!known.has(s.id)) known.set(s.id, { comp: formula(s.formula ?? ''), z: 0, origin: 'substance' })
const assumed = text('scripts/chem/catalog/needed_substances.txt').split(/\r?\n/).map(l => l.split('#')[0].trim()).filter(Boolean).map(l => l.split('|').map(x => x.trim()))
for (const [id, f, , z] of assumed) if (!known.has(id)) known.set(id, { comp: formula(f), z: Number(z), origin: 'pending' })

/** Elements and charge of one side; throws on an id nothing defines. */
function sum(side: Side): { el: Record<string, number>; z: number } {
  const el: Record<string, number> = {}
  let z = 0
  for (const [id, nu] of Object.entries(side)) {
    const s = known.get(id)
    if (!s) throw new Error(`unknown id ${id}`)
    for (const [e, n] of Object.entries(s.comp)) el[e] = (el[e] ?? 0) + n * nu
    z += s.z * nu
  }
  return { el, z }
}
const phase = new Map<string, string>([...aqueous.species.map(x => [x.id, x.phase] as [string, string]), ...substanceRows.filter(x => x.phase).map(x => [x.id, x.phase] as [string, string])])
const residual = (a: Record<string, number>) => Math.max(0, ...Object.values(a).map(Math.abs))
const R = 8.314462618
const F = 96485.33212

describe('report of check_reactions.py', () => {
  it('shows no violation and matches the tables', () => {
    expect(report.violations).toEqual([])
    expect(report.counts.reactions).toBe(reactions.length)
    expect(report.counts.couples).toBe(couples.length)
    expect(report.counts.experiments).toBe(40)
    expect(report.counts.indicators).toBe(11)
    expect(report.counts.teaching).toBe(reactions.filter(r => r.teaching).length)
    expect(report.teaching.length + report.measured.length).toBeLessThanOrEqual(reactions.length)
    // Ids that only this package assumes: nothing the substance catalogue still owes
    expect(report.pending.filter(p => p.kind === 'substance').map(p => p.id)).toEqual([])
  })

  it('compares E° with the network: at least twelve couples, none further than 20 mV', () => {
    expect(report.e0.length).toBeGreaterThanOrEqual(12)
    for (const row of report.e0) expect(Math.abs(row.delta_mV), row.id).toBeLessThanOrEqual(20)
  })
})

describe('reactions', () => {
  it('are at least 100, with unique ids and names in three languages', () => {
    expect(reactions.length).toBeGreaterThanOrEqual(100)
    expect(new Set(reactions.map(r => r.id)).size).toBe(reactions.length)
    for (const r of reactions) {
      for (const k of ['zh', 'en', 'de'] as const) {
        expect(r.name[k]?.trim().length, `${r.id} name ${k}`).toBeGreaterThan(0)
        if (r.note) expect(r.note[k]?.trim().length, `${r.id} note ${k}`).toBeGreaterThan(0)
      }
      expect(/[一-鿿]/.test(r.name.zh), `${r.id}: Chinese name`).toBe(true)
      expect(/[一-鿿]/.test(r.name.en + r.name.de), `${r.id}: no Chinese in en or de`).toBe(false)
      expect(['redox', 'displacement', 'decomposition', 'combustion', 'organic', 'synthesis']).toContain(r.class)
      for (const e of r.effects) expect(rdoc.effectKeys, `${r.id} effect ${e}`).toContain(e)
    }
  })

  it('balance in elements and charge (independent re-check, tolerance 1e-9)', () => {
    let checked = 0
    for (const r of reactions) {
      if (!r.eq) { expect(['none', 'unmodelled'], r.id).toContain(r.rate.law); expect(r.between?.length, r.id).toBeGreaterThan(0); continue }
      const { el, z } = sum(r.eq)
      expect(residual(el), `${r.id} elements ${JSON.stringify(el)}`).toBeLessThan(1e-9)
      expect(Math.abs(z), `${r.id} charge`).toBeLessThan(1e-9)
      checked++
    }
    expect(checked).toBeGreaterThanOrEqual(190)
  })

  it('carry the parameters of their rate law, activation energies within 0 … 400 kJ/mol', () => {
    const need: Record<string, Array<keyof Rate>> = { none: [], unmodelled: [], instant: [], mass: ['k', 'orders', 'Ea', 'Tref'], surface: ['k', 'orders', 'Ea', 'Tref', 'on'], thermal: ['A', 'Ea'], catalytic: ['catalyst', 'k', 'orders', 'Ea', 'Tref'] }
    for (const r of reactions) {
      expect(Object.keys(need), r.id).toContain(r.rate.law)
      for (const k of need[r.rate.law]) expect(r.rate[k], `${r.id} rate.${k}`).toBeDefined()
      if (r.rate.Ea !== undefined) { expect(r.rate.Ea, r.id).toBeGreaterThanOrEqual(0); expect(r.rate.Ea, r.id).toBeLessThanOrEqual(400) }
      for (const id of [...Object.keys(r.rate.orders ?? {}), ...Object.keys(r.needs?.min ?? {}), ...Object.keys(r.needs?.max ?? {}), ...(r.between ?? [])]) expect(known.has(id), `${r.id}: ${id}`).toBe(true)
      if (r.rate.law === 'none' || r.rate.law === 'unmodelled') expect(r.note, `${r.id} says why`).toBeDefined()
      // The core has areas of solids only; an equilibrium that runs both ways needs its constant
      if (r.rate.on) expect(phase.get(r.rate.on), `${r.id} on ${r.rate.on}`).toBe('s')
      if (r.rate.reversible) { expect(r.rate.law, r.id).toBe('instant'); expect(r.rate.lnK, r.id).toBeDefined() }
      // A teaching value states its basis; a measured constant its citation and that it was typed by hand
      const constant = r.rate.k !== undefined || r.rate.A !== undefined
      if (r.teaching) expect(r.basis?.length, `${r.id} basis`).toBeGreaterThan(20)
      else if (constant) { expect(r.entry, r.id).toBe('hand'); expect(r.src.length, r.id).toBeGreaterThan(60) }
    }
  })

  it('order the metals with dilute acid as the activity series does', () => {
    const k = rdoc.activityOrder.map(id => reactions.find(r => r.id === id)!.rate.k!)
    expect(rdoc.activityOrder).toEqual(['K_acid', 'Na_acid', 'Ca_acid', 'Mg_acid', 'Al_acid', 'Zn_acid', 'Fe_acid', 'Ni_acid', 'Sn_acid', 'Pb_acid'])
    for (let i = 1; i < k.length; i++) expect(k[i], rdoc.activityOrder[i]).toBeLessThan(k[i - 1])
    // Copper and silver do not displace hydrogen: declared as such, with the reason
    for (const id of ['Cu_acid_none', 'Ag_acid_none']) expect(reactions.find(r => r.id === id)?.rate.law).toBe('none')
  })

  it('hold exactly the twenty curated organic reactions of D272', () => {
    const topics = new Set(reactions.map(r => r.curated).filter((c): c is string => !!c && c !== 'test'))
    expect([...topics].sort()).toEqual(Array.from({ length: 20 }, (_, i) => `org${String(i + 1).padStart(2, '0')}`))
    expect(Object.keys(rdoc.curated).sort()).toEqual([...topics].sort())
    for (const r of reactions) if (r.class === 'organic') expect(r.curated, r.id).toBeDefined()
  })

  it('give ln K consistent with the couples they name (0.05 in ln K)', () => {
    const byId = new Map(couples.map(c => [c.id, c]))
    let n = 0
    for (const r of reactions) {
      if (!r.via) continue
      const [ox, red] = r.via.map(id => byId.get(id)!)
      // Electrons of the equation as written, counted on a species that only the oxidant couple has (in a
      // disproportionation the two couples share one)
      const shared = new Set([...Object.keys(red.ox), ...Object.keys(red.red), 'H+', 'H2O', 'OH-'])
      const key = [...Object.keys(ox.ox), ...Object.keys(ox.red)].find(id => !shared.has(id))!
      const electrons = Math.abs(r.eq![key]) / (ox.ox[key] ?? ox.red[key]) * ox.n
      const want = electrons * F * (ox.E0 - red.E0) / (R * 298.15)
      expect(Math.abs(r.rate.lnK![0] + r.rate.lnK![1] / 298.15 - want), r.id).toBeLessThan(0.05)
      n++
    }
    expect(n).toBeGreaterThanOrEqual(4)
  })

  it('reproduce closed forms: K of N2O4 from ΔH and ΔS, half-lives of thermal laws, Liebhafsky’s constant', () => {
    const n2o4 = reactions.find(r => r.id === 'N2O4_equilibrium')!
    const lnK = (T: number) => n2o4.rate.lnK![0] + n2o4.rate.lnK![1] / T
    // ΔG° = ΔH° − TΔS° = −57 200 + 298.15·175.8 J/mol → K = 6.9 (0.5 %)
    expect(Math.exp(lnK(298.15))).toBeCloseTo(Math.exp((57200 - 298.15 * 175.8) / (R * 298.15)), 1)
    expect(Math.exp(lnK(298.15)) / 6.9).toBeCloseTo(1, 1)
    expect(lnK(273.15)).toBeGreaterThan(lnK(323.15))          // warming shifts towards brown NO2
    // KMnO4: half-life of 120 s at 300 °C as its basis says (A is rounded to three digits: 1 %)
    const k = (id: string, T: number) => { const r = reactions.find(x => x.id === id)!.rate; return r.A! * Math.exp(-r.Ea! * 1e3 / (R * T)) }
    expect(Math.abs(Math.LN2 / k('KMnO4_thermal', 573.15) / 120 - 1)).toBeLessThan(0.01)
    expect(Math.abs(Math.LN2 / k('NaHCO3_thermal', 473.15) / 52 - 1)).toBeLessThan(0.01)
    expect(Math.LN2 / k('NaHCO3_thermal', 373.15)).toBeGreaterThan(3600)   // hours at 100 °C
    expect(n2o4.rate.reversible).toBe(true)
    expect(reactions.find(r => r.id === 'H2O2_I')!.rate.k).toBe(0.0115)
    expect(reactions.find(r => r.id === 'ester_hydrolysis_base')!.rate).toMatchObject({ k: 0.11, Ea: 46.9 })
    // Stumm and Lee: 8.0e13 L²/(mol²·atm·min) for Fe(II), a quarter of it per second for the equation with four Fe
    expect(reactions.find(r => r.id === 'Fe2_O2')!.rate.k! / (8.0e13 / 60 / 4)).toBeCloseTo(1, 2)
  })

  it('are accepted by the reader of the core', () => {
    const resolvable = (ids: string[]) => ids.every(id => known.get(id) && known.get(id)!.origin !== 'pending')
    const idsOf = (r: Reaction) => [...Object.keys(r.eq ?? {}), ...Object.keys(r.rate.orders ?? {}), ...Object.keys(r.needs?.min ?? {}), ...(r.rate.catalyst ? [r.rate.catalyst] : [])]
    const substances = substanceRows.map(s => ({ id: s.id, phase: s.phase, comp: formula(s.formula ?? ''), M: 1 }))
    const counts = setChemData(aqueous, { format: 'velophi-chemcat', version: 1, substances, reactions, couples, dissolution: rdoc.dissolution, electrolysis: rdoc.electrolysis }) as unknown as { reactions: number; couples: number; diagnostics: Array<{ code: string; params: { in: string; ids: string[] } }> }
    expect(counts.reactions).toBe(reactions.filter(r => resolvable(idsOf(r))).length)
    expect(counts.couples).toBe(couples.filter(c => resolvable([...Object.keys(c.ox), ...Object.keys(c.red)])).length)
    // Whatever the reader could not resolve is an id this package lists as pending
    for (const d of counts.diagnostics) for (const id of d.params.ids) expect(known.get(id)?.origin, `${d.params.in}: ${id}`).toBe('pending')
    expect(counts.reactions).toBeGreaterThanOrEqual(200)
  })
})

describe('electrode couples', () => {
  it('are at least 60, balanced, with the electrons their charges ask for', () => {
    expect(couples.length).toBeGreaterThanOrEqual(60)
    expect(new Set(couples.map(c => c.id)).size).toBe(couples.length)
    for (const c of couples) {
      const ox = sum(c.ox)
      const red = sum(c.red)
      const diff: Record<string, number> = { ...ox.el }
      for (const [e, n] of Object.entries(red.el)) diff[e] = (diff[e] ?? 0) - n
      expect(residual(diff), `${c.id} elements`).toBeLessThan(1e-9)
      expect(Math.abs(ox.z - c.n - red.z), `${c.id} electrons`).toBeLessThan(1e-9)
      expect(['hand', 'network', 'computed', 'exact']).toContain(c.entry)
      expect(c.src.length, c.id).toBeGreaterThan(0)
    }
  })

  it('carry the well-known values of the electrochemical series (0.005 V)', () => {
    const e = (id: string) => couples.find(c => c.id === id)!.E0
    expect(e('Zn+2/Zn')).toBeCloseTo(-0.76, 2)
    expect(e('Cu+2/Cu')).toBeCloseTo(0.34, 2)
    expect(e('Ag+/Ag')).toBeCloseTo(0.80, 2)
    expect(e('Fe+3/Fe+2')).toBeCloseTo(0.77, 2)
    expect(e('MnO4-/Mn+2')).toBeCloseTo(1.51, 2)
    expect(e('Cl2/Cl-')).toBeCloseTo(1.36, 2)
    expect(e('H+/H2')).toBe(0)
    expect(e('O2/H2O')).toBeCloseTo(1.23, 2)
    expect(e('Li+/Li')).toBeLessThan(e('K+/K'))
    // Acid and base forms of the oxygen and hydrogen couples differ by 14 pH units of 59.16 mV (2 mV)
    expect(e('O2/H2O') - e('O2/OH-')).toBeCloseTo(0.05916 * 14, 2)
    expect(e('H+/H2') - e('H2O/H2')).toBeCloseTo(0.05916 * 14, 2)
    // Nitrate, sulfate and perchlorate never discharge at an electrode
    expect(couples.filter(c => c.inert).map(c => c.id).sort()).toEqual(['ClO4-/ClO3-', 'NO3-/N2O4', 'NO3-/NH4+', 'NO3-/NO', 'NO3-/NO2', 'NO3-/NO2-', 'SO4-2/H2S', 'SO4-2/SO2'])
    // The couples the brief names
    for (const id of ['O2/H2O2', 'H2O2/H2O', 'MnO4-/MnO2', 'MnO2/Mn+2', 'Cr2O7-2/Cr+3', 'Cu+2/Cu+', 'Sn+4/Sn+2', 'NO3-/NO', 'NO3-/NO2', 'NO3-/NH4+', 'SO4-2/SO2', 'S/H2S', 'S4O6-2/S2O3-2', 'ClO-/Cl-', 'ClO3-/Cl-', 'PbO2/Pb+2', 'AgCl/Ag', 'Ferricyanide-3/Ferrocyanide-4', 'I3-/I-', 'Au+3/Au']) expect(couples.some(c => c.id === id), id).toBe(true)
  })
})

describe('experiments map (D270)', () => {
  it('has the forty experiments, each with a path through the model', () => {
    const xs = xdoc.experiments
    expect(xs.length).toBe(40)
    const count = (g: string) => xs.filter(x => x.group === g).length
    expect([count('junior'), count('seniorCompulsory'), count('seniorElective'), count('demo')]).toEqual([8, 9, 9, 14])
    const rids = new Set(reactions.map(r => r.id))
    const cids = new Set(couples.map(c => c.id))
    for (const x of xs) {
      for (const k of ['zh', 'en', 'de'] as const) expect(x.name[k]?.trim().length, `${x.id} ${k}`).toBeGreaterThan(0)
      for (const id of x.reactions ?? []) expect(rids.has(id), `${x.id}: ${id}`).toBe(true)
      for (const id of x.couples ?? []) expect(cids.has(id), `${x.id}: ${id}`).toBe(true)
      for (const id of x.network ?? []) expect(known.get(id)?.origin, `${x.id}: ${id}`).toBe('network')
      for (const id of x.substances ?? []) expect(known.has(id), `${x.id}: ${id}`).toBe(true)
      const path = (x.reactions?.length ?? 0) + (x.couples?.length ?? 0) + (x.network?.length ?? 0)
      if (path === 0) expect(x.noReaction?.length, x.id).toBeGreaterThan(10)
    }
  })
})

describe('indicators', () => {
  const dat = text('scripts/chem/supplement_indicators.dat')
  const rows = [...dat.matchAll(/^#\s*@indicator\s+(.*)$/gm)].map(m => Object.fromEntries(m[1].split(/\s+/).map(kv => kv.split('=') as [string, string])))
  const logK = new Map<string, number>()
  for (const m of dat.matchAll(/^(\S+) \+ (?:(\d) )?H\+ = (\S+)\s*\n\s+log_k\s+([\d.]+)/gm)) logK.set(m[3], Number(m[4]))

  it('are the eleven of the brief, each pKa inside its textbook transition range', () => {
    expect(new Set(rows.map(r => r.element))).toEqual(new Set(['Phph', 'Thph', 'Meor', 'Mered', 'Btb', 'Bcg', 'Phred', 'Thyb', 'Litmus', 'Alyr', 'Congo']))
    for (const r of rows) {
      const [lo, hi] = r.range.split('..').map(Number)
      expect(Number(r.pKa), `${r.element} step ${r.step}`).toBeGreaterThanOrEqual(lo)
      expect(Number(r.pKa), `${r.element} step ${r.step}`).toBeLessThanOrEqual(hi)
    }
    expect(rows.filter(r => r.element === 'Thyb').length).toBe(2)   // thymol blue: two steps
    expect(report.indicators.length).toBe(rows.length)
    // Every element has its composition for the LIGAND table in the header
    for (const el of new Set(rows.map(r => r.element))) expect(dat, el).toMatch(new RegExp(`^#\\s+'${el}': \\{`, 'm'))
  })

  it('change colour inside the range: closed-form fractions of the base form', () => {
    // One step: base fraction 1 / (1 + 10^(pKa − pH)) is between 1 % and 99 % at both ends of the range
    for (const r of rows.filter(r => !['Phph', 'Thyb'].includes(r.element))) {
      const [lo, hi] = r.range.split('..').map(Number)
      const f = (pH: number) => 1 / (1 + 10 ** (Number(r.pKa) - pH))
      expect(f(lo), r.element).toBeGreaterThan(0.01)
      expect(f(lo), r.element).toBeLessThan(0.5)
      expect(f(hi), r.element).toBeGreaterThan(0.5)
      expect(f(hi), r.element).toBeLessThan(0.99)
      expect(logK.get([...logK.keys()].find(k => k.includes(`(${r.element})`))!), r.element).toBe(Number(r.pKa))
    }
    // Phenolphthalein, two close steps (log β1 = 9.50, log β2 = 18.55): pink fraction below 1 % at pH 8.2, half at
    // pH 9.6, three quarters at pH 10.0
    const pink = (pH: number) => 1 / (1 + 10 ** (logK.get('H(Phph)-')! - pH) + 10 ** (logK.get('H2(Phph)')! - 2 * pH))
    expect(pink(8.2)).toBeLessThan(0.01)
    expect(pink(9.63)).toBeCloseTo(0.5, 1)
    expect(pink(10.0)).toBeGreaterThan(0.7)
    // Thymol blue: red below 1.65, yellow between, blue above 9.20
    expect(logK.get('H2(Thyb)')! - logK.get('H(Thyb)-')!).toBeCloseTo(1.65, 9)
    expect(logK.get('H(Thyb)-')).toBe(9.2)
  })
})
