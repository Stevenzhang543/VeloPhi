/**
 * The forty guided experiments of D270 (26.64; src/chem/experiments). For every experiment that is offered, a bench
 * is started from its starting document and its steps are performed through the store of the page — the same
 * actions "show me" performs — on the WebAssembly core with the shipped catalogue:
 *
 * - before a step's actions its check does not hold (no check is trivially true), after them it holds;
 * - a wrong action a student might take instead (`wrong`) does not complete the step;
 * - every equation shown is balanced by the core; every reagent and apparatus named exists; every text has an English
 *   and a German entry.
 *
 * An experiment that is not offered names its reason; the list of those is pinned here so that it can only shrink
 * knowingly.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setChemData, setGasData } from '../../src/engine/chem'
import { createBench } from '../../src/chem/bench'
import type { BenchStore } from '../../src/chem/bench'
import { setCatalogue, reagentOf } from '../../src/chem/catalog'
import type { Catalogue } from '../../src/chem/catalog'
import { kindOf } from '../../src/chem/apparatus'
import { EXPERIMENTS, GROUPS, expandActions, experimentById, resolved, startDoc } from '../../src/chem/experiments'
import type { DemoAction, Experiment } from '../../src/chem/experiments'
import { balanced, createRunner } from '../../src/chem/experiments/runner'
import type { Runner } from '../../src/chem/experiments/runner'
import { TEXTS_2664_EXP } from '../../src/i18n/texts/v2664exp'
import { buildTables } from '../../src/i18n/tables'

const root = join(__dirname, '..', '..')
const json = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'))

beforeAll(() => {
  const cat = json('src/chem/data/catalog.json')
  setChemData(json('src/chem/data/aqueous.json'), cat)
  setGasData(json('src/chem/data/gas.json'))
  setCatalogue(cat as Catalogue)
})

const offered = EXPERIMENTS.filter(e => !e.unavailable)

async function fresh(id: string): Promise<{ bench: BenchStore; runner: Runner; messages: string[] }> {
  const messages: string[] = []
  const bench = createBench({ storage: null, notify: (text, error) => { if (error) messages.push(text) } })
  await bench.init(async () => {})
  const runner = createRunner(bench, { storage: null })
  expect(runner.start(id)).toBe(true)
  return { bench, runner, messages }
}

/** Perform actions as "show me" does; returns the first that was refused. */
function perform(bench: BenchStore, actions: DemoAction[]): DemoAction | null {
  for (const a of expandActions(actions)) {
    if (a.act === 'attach') { if (!bench.attach(a.vessel, a.part)) return a }
    else if (bench.apply(a) === null) return a
  }
  return null
}

const show = (runner: Runner) => JSON.stringify((runner.outcome.value?.terms ?? []).map(t => ({ ok: t.ok, value: t.value, check: t.check })))

describe('the list of guided experiments', () => {
  it('is the forty of D270 in the order of the experiments map, 8 + 9 + 9 + 14', () => {
    const map = json('scripts/chem/catalog/experiments_map.json') as { experiments: Array<{ id: string; group: string }> }
    expect(EXPERIMENTS.map(e => e.id)).toEqual(map.experiments.map(e => e.id))
    expect(EXPERIMENTS.map(e => e.group)).toEqual(map.experiments.map(e => e.group))
    expect(GROUPS.map(g => EXPERIMENTS.filter(e => e.group === g).length)).toEqual([8, 9, 9, 14])
  })

  it('offers all but the ones pinned here, each with its reason', () => {
    expect(EXPERIMENTS.filter(e => e.unavailable).map(e => e.id)).toEqual(['c8_models'])
    for (const e of EXPERIMENTS.filter(x => x.unavailable)) { expect(e.unavailable!.length).toBeGreaterThan(20); expect(e.steps).toEqual([]) }
    expect(EXPERIMENTS.filter(e => e.reduced).map(e => e.id)).toEqual(['j8_combustion', 'c3_sulfur', 'c9_ethanol_acetic', 'e7_ethyl_acetate', 'e8_functional_groups', 'e9_sugars', 'd4_ammonia_fountain', 'd9_electrolysis'])
  })

  it('names only reagents of the shelf and apparatus that is offered', () => {
    const bad: string[] = []
    for (const e of offered) {
      for (const r of e.reagents) if (!reagentOf(r)) bad.push(`${e.id}: reagent ${r}`)
      for (const s of e.steps) for (const a of [...s.demo, ...(s.wrong ?? [])]) if (a.act === 'add' && !reagentOf(a.reagent)) bad.push(`${e.id}: reagent ${a.reagent}`)
      for (const s of e.steps) for (const a of s.demo) if (a.act === 'add' && !e.reagents.includes(a.reagent)) bad.push(`${e.id}: ${a.reagent} is used but not listed`)
      for (const v of e.vessels) {
        const k = kindOf(v.kind)
        if (!k?.vessel || !k.available) bad.push(`${e.id}: vessel ${v.kind}`)
        if (v.capacity_mL && !k?.vessel?.capacities.includes(v.capacity_mL)) bad.push(`${e.id}: ${v.kind} of ${v.capacity_mL} mL`)
        for (const p of v.parts ?? []) if (!kindOf(p)?.available || kindOf(p)?.vessel) bad.push(`${e.id}: part ${p}`)
      }
      expect(e.steps.length).toBeGreaterThanOrEqual(2)
      expect(e.safety.length).toBeGreaterThan(3)
    }
    expect(bad).toEqual([])
  })

  it('shows only equations the core balances', () => {
    const bad: string[] = []
    for (const e of offered) for (const q of e.equations) if (!balanced(q)) bad.push(`${e.id}: ${q.reactants.join(' + ')} → ${q.products.join(' + ')}`)
    expect(bad).toEqual([])
  })

  it('has every text in three languages', () => {
    const tables = buildTables()
    const missing: string[] = []
    const need = (s: string | undefined, where: string) => { if (s && !(s in tables.en && s in tables.de)) missing.push(`${where}: ${s}`) }
    for (const e of EXPERIMENTS) {
      for (const s of [e.title, e.goal, e.principle, e.safety, e.limits, e.reduced, e.unavailable]) need(s, e.id)
      for (const s of e.steps) { need(s.text, e.id); need(s.hint, e.id); for (const m of s.mistakes ?? []) need(m.text, e.id) }
    }
    expect(missing).toEqual([])
    expect(Object.keys(TEXTS_2664_EXP).length).toBeGreaterThan(300)
  })
})

describe.each(offered.map(e => [e.id, e] as [string, Experiment]))('guided experiment %s', (id, e) => {
  it('starts on its own bench with nothing done', async () => {
    const { bench, runner } = await fresh(id)
    expect(bench.vessels.value.length).toBe(e.vessels.length)
    expect(bench.log.value).toEqual([])
    expect(runner.index.value).toBe(0)
    expect(runner.finished.value).toBe(false)
    expect(startDoc(e).objects.map(o => o.label)).toEqual(e.vessels.map((_, i) => String.fromCharCode(65 + i)))
    bench.dispose()
  })

  it('completes each step by its intended actions and not before', async () => {
    const { bench, runner, messages } = await fresh(id)
    const steps = resolved(experimentById(id)!).steps
    for (let i = 0; i < steps.length; i++) {
      runner.check()
      expect(runner.index.value, `step ${i + 1} of ${id} holds before its actions`).toBe(i)
      expect(runner.outcome.value?.ok).toBe(false)
      const refused = perform(bench, steps[i].demo)
      expect(refused, `step ${i + 1} of ${id}: refused ${JSON.stringify(refused)} — ${messages.join(' | ')}`).toBeNull()
      runner.check()
      expect(runner.index.value, `step ${i + 1} of ${id} did not pass: ${show(runner)}`).toBe(i + 1)
    }
    expect(runner.finished.value).toBe(true)
    // the bench is a bench again: time goes on and the record is whole
    expect(bench.apply({ act: 'wait', seconds: 1 })).not.toBeNull()
    expect(bench.log.value.length).toBeGreaterThan(0)
    bench.dispose()
  }, 300000)

  it('does not complete a step by a wrong action', async () => {
    const steps = resolved(experimentById(id)!).steps
    let tried = 0
    for (let i = 0; i < steps.length; i++) {
      const wrong = steps[i].wrong
      if (!wrong) continue
      tried++
      const { bench, runner, messages } = await fresh(id)
      for (let k = 0; k < i; k++) { expect(perform(bench, steps[k].demo)).toBeNull(); runner.check() }
      expect(runner.index.value).toBe(i)
      const refused = perform(bench, wrong)
      expect(refused, `wrong action of step ${i + 1} of ${id} was refused: ${JSON.stringify(refused)} — ${messages.join(' | ')}`).toBeNull()
      runner.check()
      expect(runner.index.value, `step ${i + 1} of ${id} passed by a wrong action`).toBe(i)
      bench.dispose()
    }
    expect(tried).toBeGreaterThanOrEqual(1)
  }, 300000)
})

describe('the runner', () => {
  it('"show me" performs the step through the log, and a typical mistake is named', async () => {
    const { bench, runner } = await fresh('e4_titration')
    expect(runner.showMe()).toBe(true)
    expect(runner.index.value).toBe(1)
    expect(bench.log.value.length).toBe(2)
    expect(runner.showMe()).toBe(true)
    // overshooting the end point: the step stays open and the mistake is named
    expect(bench.pour('v2', 'v1', { value: 25, unit: 'mL' })).not.toBeNull()
    runner.check()
    expect(runner.index.value).toBe(2)
    expect(runner.mistakes.value.length).toBe(1)
    expect(runner.outcome.value!.terms.some(t => !t.ok && typeof t.value === 'number')).toBe(true)
    // undo takes the wrong pour back; the intended titration then completes the step
    bench.undo()
    expect(runner.showMe()).toBe(true)
    expect(runner.finished.value).toBe(true)
    runner.leave()
    expect(runner.active.value).toBeNull()
    expect(bench.vessels.value.length).toBe(2)
    bench.dispose()
  })

  it('does not start an experiment that is not offered, and resumes one after a new start', async () => {
    const data = new Map<string, string>()
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) }, removeItem: (k: string) => { data.delete(k) } }
    const bench = createBench({ storage, notify: () => {} })
    await bench.init(async () => {})
    const runner = createRunner(bench, { storage })
    expect(runner.start('c8_models')).toBe(false)
    expect(runner.start('j6_nacl_solution')).toBe(true)
    runner.showMe()
    expect(runner.index.value).toBe(1)
    bench.flushAutosave(); bench.dispose()
    const again = createBench({ storage, notify: () => {} })
    await again.init(async () => {})
    const r2 = createRunner(again, { storage })
    expect(r2.resume()).toBe(true)
    expect(r2.active.value?.id).toBe('j6_nacl_solution')
    expect(r2.index.value).toBe(1)
    again.dispose()
  })
})
