/**
 * The chemistry side of the Copilot (26.64, D286). The tools are the bench's own log entries — place a vessel, add a
 * reagent, pour, heat, wait — applied through the bench store (src/chem/bench.ts) exactly as a click on the bench
 * would be, so every one of them is in the bench's log, can be undone there and replays from a file. Readings
 * (temperature, pH, volume, what is dissolved, what has settled, what escaped) are the chemistry core's, read from
 * the bench after the action; an equation is balanced by the core (`chemBalance`); a substance or element is looked
 * up in the catalogue and the element table and can be opened in the encyclopedia. As on the mechanics side, a number
 * in an answer comes from a tool result, never from the model: what the core does not model is passed on as its
 * diagnostic (`unmodelled`), and a value the data do not hold is `null`, not an estimate.
 */
import { tl } from '../../i18n'
import { state } from '../../app/store'
import { useBench } from '../../chem/bench'
import type { BenchStore } from '../../chem/bench'
import { catalogue, loadCatalogue, reagentOf, reagentText, speciesFormula, speciesName, substanceOf } from '../../chem/catalog'
import { kindName, kindOf, shelfKinds } from '../../chem/apparatus'
import { loadElementData } from '../../chem/data'
import { ency, openElement, openSubstance } from '../../chem/ency/route'
import { chemBalance } from '../../engine/chem'
import type { Amount, VesselReading } from '../../engine/chem'
import { ToolError } from './tools'
import type { Tool } from './tools'
import type { JsonSchema } from '../types'

const S = (description: string, extra: Partial<JsonSchema> = {}): JsonSchema => ({ type: 'string', description, ...extra })
const N = (description: string): JsonSchema => ({ type: 'number', description })
const obj = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false })
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const UNITS = ['mL', 'L', 'drop', 'g', 'mg', 'kg', 'mol', 'mmol'] as const
const round = (v: number | null | undefined, digits = 5) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toPrecision(digits)) : null)

/** The bench the tools act on (tests put their own in). */
export const chemHooks: { bench: (() => BenchStore) | null; load: () => Promise<unknown> } = { bench: null, load: loadCatalogue }

/** The bench, started when a tool is the first to use it. */
async function bench(): Promise<BenchStore> {
  const b = (chemHooks.bench ?? useBench)()
  if (!b.ready.value) { try { await b.init(chemHooks.load) } catch { throw new ToolError(`the chemistry bench could not be started: ${b.failure.value || 'the chemistry data did not load'}`) } }
  return b
}

function amountOf(a: Record<string, unknown>, required: boolean): Amount | undefined {
  if (a.value === undefined && !required) return undefined
  const value = typeof a.value === 'string' ? Number(a.value) : a.value
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new ToolError('value must be a number > 0')
  const unit = str(a.unit)
  if (!(UNITS as readonly string[]).includes(unit)) throw new ToolError(`unit must be one of ${UNITS.join(', ')}`)
  return { value, unit: unit as Amount['unit'] }
}

function vessel(b: BenchStore, id: string): string {
  if (!b.vesselOf(id)) throw new ToolError(`no vessel ${id || '""'} on the bench (vessels: ${b.vessels.value.map(v => v.id).join(', ') || 'none — place one with bench_place'})`)
  return id
}

/** What the model is told about a vessel: the core's reading, rounded for reading (never recomputed here). */
function reading(b: BenchStore, id: string, full: boolean): Record<string, unknown> {
  const r: VesselReading | null = b.read(id)
  if (!r) throw new ToolError(`the vessel ${id} cannot be read`)
  const out: Record<string, unknown> = {
    vessel: id, name: b.vesselName(id), kind: r.kind, temperature_C: round(r.T - 273.15, 4), volume_mL: round(r.volume_mL), capacity_mL: r.capacity_mL,
    pH: r.pH === undefined ? null : round(r.pH, 4), heater_W: r.heater, closed: r.closed,
    solids: r.solids.map(s => ({ id: s.id, formula: speciesFormula(s.id), grams: round(s.g, 4) })),
    gasInVessel_mL: round(r.gas_mL, 4), gas: r.gas.map(g => ({ id: g.id, mol: round(g.n, 4) })), escaped: r.released.map(g => ({ id: g.id, mol: round(g.n, 4) }))
  }
  if (full) {
    out.dissolved = (r.species ?? []).filter(s => s.n > 0).sort((x, y) => y.c - x.c).slice(0, 16).map(s => ({ id: s.id, mol_per_L: round(s.c, 4) }))
    out.saturation = (r.si ?? []).filter(s => s.si > -1).slice(0, 8).map(s => ({ id: s.id, saturationIndex: round(s.si, 3) }))
    // what the model does not cover is said, not papered over (D273)
    out.diagnostics = r.diagnostics.map(d => ({ code: d.code, severity: d.severity, ...(d.params ? { params: d.params } : {}) }))
  }
  return out
}

const evidence = (b: BenchStore) => ({ benchTime_s: round(b.time.value, 6), logEntries: b.log.value.length, source: 'chemistry core (bench)' })

function applied(b: BenchStore, events: unknown, vessels: string[]): Record<string, unknown> {
  if (events === null) throw new ToolError(`the bench refused the action${b.failure.value ? `: ${b.failure.value}` : ''} (nothing changed)`)
  return { ok: true, events: (events as Array<{ code: string; vessel: string; params: Record<string, unknown> }>).map(e => ({ what: e.code, vessel: e.vessel, ...e.params })), vessels: vessels.map(id => reading(b, id, false)), evidence: evidence(b) }
}

/** The chemistry tools of the Copilot. */
export const CHEM_TOOLS: Tool[] = [
  {
    name: 'bench_state', level: 'read', label: () => tl('查看实验台'),
    description: 'The chemistry bench now: every vessel with its id, kind, temperature, volume, pH, solids and gas (the chemistry core\'s readings), the vessel kinds that can be placed, and the time on the bench clock.',
    parameters: obj({}),
    run: async () => { const b = await bench(); return { vessels: b.vessels.value.map(v => reading(b, v.id, false)), canPlace: shelfKinds().filter(k => k.role === 'vessel').map(k => k.id), evidence: evidence(b) } }
  },
  {
    name: 'chem_reagents', level: 'read', label: a => tl('查找药品“{0}”', [str(a.query)]),
    description: 'Search the reagent shelf by name, formula or id. Returns reagent ids for bench_add, with kind (solution, solid, liquid, gas) and label.',
    parameters: obj({ query: S('search words: a name, a formula or part of an id') }, ['query']),
    run: async a => {
      await bench()
      const q = str(a.query).toLowerCase().replace(/\s+/g, '')
      const list = (catalogue.value?.reagents ?? []).filter(r => !q || `${r.id}${reagentText(r.id)}${Object.keys(r.recipe?.species ?? {}).join('')}${r.name ? Object.values(r.name).join('') : ''}`.toLowerCase().replace(/\s+/g, '').includes(q))
      return { reagents: list.slice(0, 20).map(r => ({ id: r.id, name: reagentText(r.id), kind: r.kind })), more: Math.max(0, list.length - 20) }
    }
  },
  {
    name: 'bench_place', level: 'change', label: a => tl('在实验台上放置 {0}', [kindName(kindOf(str(a.kind)), str(a.kind))]),
    description: 'Put an empty vessel on the bench. Returns its id (used by the other bench tools). Kinds come from bench_state.canPlace (e.g. beaker, erlenmeyer, testTube).',
    parameters: obj({ kind: S('vessel kind id'), capacity_mL: N('capacity in mL (optional; the kind\'s usual size otherwise)') }, ['kind']),
    check: a => { const k = kindOf(str(a.kind)); if (!k || k.role !== 'vessel' || !k.available) throw new ToolError(`no vessel kind ${a.kind} (kinds: ${shelfKinds().filter(x => x.role === 'vessel').map(x => x.id).join(', ')})`) },
    run: async a => {
      const b = await bench()
      const id = b.place(str(a.kind), undefined, typeof a.capacity_mL === 'number' && a.capacity_mL > 0 ? a.capacity_mL : undefined)
      if (!id) throw new ToolError(`the bench refused to place ${a.kind}${b.failure.value ? `: ${b.failure.value}` : ''}`)
      state.page = 'chem'
      return { ok: true, vessel: id, name: b.vesselName(id), evidence: evidence(b) }
    }
  },
  {
    name: 'bench_add', level: 'change', label: a => tl('加入 {0} {1} {2}', [String(a.value ?? ''), str(a.unit), reagentText(str(a.reagent))]),
    description: 'Add a reagent from the shelf to a vessel (a log entry of the bench, undoable there). Amount as written: value and unit (mL, L, drop for liquids and solutions; g, mg, kg, mol, mmol for solids). Returns what happened (precipitate, gas, …) and the vessel\'s readings from the chemistry core.',
    parameters: obj({ to: S('vessel id'), reagent: S('reagent id from chem_reagents'), value: N('amount'), unit: S('unit of the amount', { enum: [...UNITS] }) }, ['to', 'reagent', 'value', 'unit']),
    check: a => { amountOf(a, true) },
    run: async a => {
      const b = await bench()
      const to = vessel(b, str(a.to))
      if (!reagentOf(str(a.reagent))) throw new ToolError(`no reagent ${a.reagent} on the shelf; use chem_reagents to find its id`)
      state.page = 'chem'
      return applied(b, b.add(to, str(a.reagent), amountOf(a, true)!), [to])
    }
  },
  {
    name: 'bench_pour', level: 'change', label: a => tl('从 {0} 倒入 {1}', [str(a.from), str(a.to)]),
    description: 'Pour from one vessel into another: everything, or an amount (value and unit mL / L / drop). Returns the events and both vessels\' readings.',
    parameters: obj({ from: S('vessel id poured from'), to: S('vessel id poured into'), value: N('amount (optional: all of it)'), unit: S('mL | L | drop', { enum: ['mL', 'L', 'drop'] }) }, ['from', 'to']),
    check: a => { if (str(a.from) === str(a.to)) throw new ToolError('from and to are the same vessel'); amountOf(a, false) },
    run: async a => {
      const b = await bench()
      const from = vessel(b, str(a.from)), to = vessel(b, str(a.to))
      state.page = 'chem'
      return applied(b, b.pour(from, to, amountOf(a, false)), [from, to])
    }
  },
  {
    name: 'bench_heat', level: 'change', label: a => (Number(a.power_W) > 0 ? tl('加热 {0}（{1} W）', [str(a.vessel), String(a.power_W)]) : tl('停止加热 {0}', [str(a.vessel)])),
    description: 'Heat a vessel with a constant power in watts (0 switches the heater off). The temperature changes while time passes: follow with bench_wait, then read.',
    parameters: obj({ vessel: S('vessel id'), power_W: N('heating power in W, 0 … 2000; 0 = off') }, ['vessel', 'power_W']),
    check: a => { const p = Number(a.power_W); if (!Number.isFinite(p) || p < 0 || p > 2000) throw new ToolError('power_W must be within 0 … 2000') },
    run: async a => {
      const b = await bench()
      const v = vessel(b, str(a.vessel))
      state.page = 'chem'
      return applied(b, b.apply({ act: 'heat', vessel: v, power: Number(a.power_W) }), [v])
    }
  },
  {
    name: 'bench_wait', level: 'change', label: a => tl('等待 {0} s', [String(a.seconds ?? '')]),
    description: 'Let time pass on the bench (reactions run, heat flows, gas is delivered). Returns what happened and every vessel\'s readings afterwards.',
    parameters: obj({ seconds: N('seconds to wait, 0.5 … 3600') }, ['seconds']),
    check: a => { const s = Number(a.seconds); if (!Number.isFinite(s) || s < 0.5 || s > 3600) throw new ToolError('seconds must be within 0.5 … 3600') },
    run: async a => {
      const b = await bench()
      return applied(b, b.apply({ act: 'wait', seconds: Number(a.seconds) }), b.vessels.value.map(v => v.id))
    }
  },
  {
    name: 'bench_read', level: 'read', label: a => tl('读取 {0}', [str(a.vessel)]),
    description: 'Read one vessel in full from the chemistry core: temperature, volume, pH, dissolved species with concentrations, solids, gas, saturation indices, and the core\'s diagnostics (severity "unmodelled" means the model does not cover something — say so, do not fill it in). Every number you state about the bench must come from this or another bench tool result.',
    parameters: obj({ vessel: S('vessel id') }, ['vessel']),
    run: async a => { const b = await bench(); return { ...reading(b, vessel(b, str(a.vessel)), true), evidence: evidence(b) } }
  },
  {
    name: 'chem_balance', level: 'read', label: a => tl('配平：{0}', [`${(Array.isArray(a.reactants) ? a.reactants : []).join(' + ')} → ${(Array.isArray(a.products) ? a.products : []).join(' + ')}`]),
    description: 'Balance a chemical equation with the chemistry core: formulas of the reactants and of the products (charges as in "Fe+3", "SO4-2"). Returns the smallest whole-number coefficients, or why there are none (impossible, not unique, an unreadable formula).',
    parameters: obj({ reactants: { type: 'array', items: { type: 'string' }, description: 'formulas, e.g. ["H2", "O2"]' }, products: { type: 'array', items: { type: 'string' }, description: 'formulas, e.g. ["H2O"]' } }, ['reactants', 'products']),
    check: a => { for (const k of ['reactants', 'products']) { const v = a[k]; if (!Array.isArray(v) || !v.length || v.length > 12 || !v.every(x => typeof x === 'string' && x.trim())) throw new ToolError(`${k} must be a list of 1–12 formulas`) } },
    run: async a => {
      await bench()
      const left = (a.reactants as string[]).map(x => x.trim()), right = (a.products as string[]).map(x => x.trim())
      const r = chemBalance(left, right)
      if (!r.balanced) return { balanced: false, reason: r.reason, ...(r.term ? { term: r.term } : {}) }
      const side = (list: string[], at: number) => list.map((f, i) => `${r.coefficients[at + i] === 1 ? '' : r.coefficients[at + i]}${f}`).join(' + ')
      return { balanced: true, coefficients: r.coefficients, equation: `${side(left, 0)} → ${side(right, left.length)}`, source: 'chemistry core (chemBalance)' }
    }
  },
  {
    name: 'chem_lookup', level: 'read', label: a => tl('查阅“{0}”', [str(a.query)]),
    description: 'Look up a substance (by id, formula or name) or an element (by symbol or name) in the app\'s data: formula, molar mass, phase, density and what the encyclopedia page is. A value the data do not hold comes back as null — say "no data", never estimate. Returns ids for open_substance / open_element.',
    parameters: obj({ query: S('a formula, name, id or element symbol') }, ['query']),
    run: async a => {
      await bench()
      const q = str(a.query), ql = q.toLowerCase()
      const elements = (await loadElementData().catch(() => null))?.elements ?? []
      const el = elements.find(e => e.symbol === q) ?? elements.find(e => Object.values(e.name).some(n => n.toLowerCase() === ql))
      const subs = (catalogue.value?.substances ?? []).filter(s => s.id.toLowerCase() === ql || (s.formula ?? '').toLowerCase() === ql || speciesName(s.id).toLowerCase() === ql)
      const near = subs.length ? subs : (catalogue.value?.substances ?? []).filter(s => `${s.id}${s.formula ?? ''}${speciesName(s.id)}`.toLowerCase().includes(ql)).slice(0, 6)
      return {
        element: el ? { symbol: el.symbol, name: el.name, atomicNumber: el.z, atomicMass: el.massIsMassNumber ? null : el.mass, group: el.group, period: el.period, electronegativity: el.electronegativity } : null,
        substances: near.map(s => ({ id: s.id, formula: speciesFormula(s.id), name: speciesName(s.id), phase: s.phase, molarMass_g_mol: round(s.M ?? null, 7), density_kg_m3: round(s.rho ?? null, 6) })),
        source: 'app data (element table, chemistry catalogue)'
      }
    }
  },
  {
    name: 'open_element', level: 'change', label: a => tl('打开元素 {0}', [str(a.symbol)]),
    description: 'Open the encyclopedia page of an element (by its symbol, e.g. Cu).',
    parameters: obj({ symbol: S('element symbol') }, ['symbol']),
    check: a => { if (!/^[A-Z][a-z]?$/.test(str(a.symbol))) throw new ToolError('symbol must be an element symbol such as Cu') },
    run: a => { openElement(str(a.symbol)); ency.open = true; state.page = 'chem'; return { opened: str(a.symbol) } }
  },
  {
    name: 'open_substance', level: 'change', label: a => tl('打开物质 {0}', [speciesName(str(a.id))]),
    description: 'Open the encyclopedia page of a substance (id from chem_lookup).',
    parameters: obj({ id: S('substance id') }, ['id']),
    run: async a => {
      await bench()
      if (!substanceOf(str(a.id))) throw new ToolError(`no substance ${a.id}; use chem_lookup`)
      openSubstance(str(a.id)); ency.open = true; state.page = 'chem'
      return { opened: str(a.id) }
    }
  }
]
