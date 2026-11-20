/**
 * 26.64 (D286): the chemistry tools of the Copilot, with a scripted fake model. The tools are the bench's own log
 * entries (place, add, pour, heat, wait) applied through the bench store, so what the Copilot did is in the bench's
 * document and can be undone there; every reading the model gets back is the chemistry core's (compared here with a
 * direct read of the bench, and with closed forms: 20 mL of 0.1 mol/L HCl has pH ≈ 1.08 with activities — within
 * 0.05 of −log 0.1; heating 100 g of water with 100 W for 10 s raises it by Q/(m·c) within what the glass takes, so
 * between 0.5 K and 2.39 K); an equation is balanced by the core; a value the data do not hold comes back as null.
 * The core is the WebAssembly build with the small catalogue of the bench tests.
 */
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Scene } from '../../src/core/scene/types'
import { buildTemplate } from '../../src/templates'

const state = {
  dirty: false, page: 'studio', rightTab: 'formula', bottomTab: 'chart', problem: null as unknown, scene: buildTemplate('incline') as Scene, fileName: null,
  recording: null, situations: [], run: { tComputed: 0, unbounded: true, paused: false }, computing: false, playing: false, time: 0, speed: 1, selection: null, stale: false,
  showModels: false, modelId: null, modelPreset: null, settingsSection: null, showTemplates: false, showProblems: false, chart: [] as string[]
}
vi.mock('../../src/app/store', () => ({ state, loadScene: vi.fn(), edit: vi.fn(), play: vi.fn(), pause: vi.fn(), rewind: vi.fn(), seekTime: vi.fn(), showToast: vi.fn(), documentScene: () => state.scene }))
vi.mock('../../src/app/trialLog', () => ({ logEvent() {} }))
vi.mock('../../src/platform/ask', () => ({ ask: vi.fn(async () => true) }))
vi.mock('../../src/app/task/taskState', () => ({ taskUi: { task: null, state: 'draft' }, setTask: vi.fn(), currentResults: () => [], solveCurrent: vi.fn(), readText: vi.fn() }))
vi.mock('../../src/app/problemMode', () => ({ openProblem: vi.fn(async () => true), reveal: vi.fn(), openBuiltin: vi.fn(async () => true), openProblemText: vi.fn() }))

const { CHEM_TOOLS, chemHooks } = await import('../../src/ai/copilot/chemTools')
const { copilotToolDefs, copilotToolByName } = await import('../../src/ai/copilot/simTools')
const { copilotSystem } = await import('../../src/ai/copilot/copilotPrompt')
const { copilot, sendToCopilot, clearCopilot } = await import('../../src/ai/copilot/session')
const { createBench } = await import('../../src/chem/bench')
const { setCatalogue } = await import('../../src/chem/catalog')
const { setChemData } = await import('../../src/engine/chem')
const { ency } = await import('../../src/chem/ency/route')
const { setTransport } = await import('../../src/platform/net')
const { settings } = await import('../../src/app/settings')
const { setKey } = await import('../../src/ai/keys')
const { resetCaps } = await import('../../src/ai/client')
const { ToolError } = await import('../../src/ai/copilot/tools')

const root = join(__dirname, '..', '..')
const json = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'))
let bench: ReturnType<typeof createBench>

beforeAll(() => {
  const cat = json('tests/fixtures/chem/catalog-mini.json')
  setChemData(json('src/chem/data/aqueous.json'), cat)
  setCatalogue(cat)
})
beforeEach(async () => {
  bench = createBench({ storage: null, notify: () => {} })
  await bench.init(async () => {})
  chemHooks.bench = () => bench
  chemHooks.load = async () => {}
  settings.ai.connection = 'openai'
  settings.ai.openai = { baseUrl: 'https://ai.test/v1', model: 'm', vision: true }
  settings.ai.copilotMode = 'act'
  settings.ai.thinking = false
  setKey('openai', 'sk-test')
  resetCaps()
  clearCopilot()
  state.page = 'studio'
  ency.open = false
})
afterEach(() => { setTransport(null); bench.dispose() })

const tool = (name: string) => { const t = CHEM_TOOLS.find(x => x.name === name); if (!t) throw new Error(`no tool ${name}`); return t }
const run = async <T = Record<string, unknown>>(name: string, args: Record<string, unknown>): Promise<T> => { const t = tool(name); t.check?.(args); return (await t.run(args)) as T }

type Body = { messages: Array<{ role: string; content: unknown }>; tools?: Array<{ function: { name: string } }> }
const ok = (message: unknown) => ({ status: 200, contentType: 'application/json', retryAfter: null, body: JSON.stringify({ choices: [{ message, finish_reason: 'stop' }], usage: { total_tokens: 50 } }) })
const call = (name: string, args: unknown, id: string) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] })

describe('the chemistry tools of the Copilot (26.64, D286)', () => {
  it('are offered to the model next to the mechanics tools, and the prompt says numbers come from the bench', () => {
    const names = copilotToolDefs().map(t => t.function.name)
    for (const n of ['bench_state', 'chem_reagents', 'bench_place', 'bench_add', 'bench_pour', 'bench_heat', 'bench_wait', 'bench_read', 'chem_balance', 'chem_lookup', 'open_element', 'open_substance']) { expect(names, n).toContain(n); expect(copilotToolByName(n)).toBeDefined() }
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('build_scene')
    expect(copilotSystem()).toContain('bench_read')
    // read tools never change the bench; the others are log entries
    expect(CHEM_TOOLS.filter(t => t.level === 'read').map(t => t.name)).toEqual(['bench_state', 'chem_reagents', 'bench_read', 'chem_balance', 'chem_lookup'])
  })

  it('place, add, pour: each is an entry of the bench log; the readings are the core\'s', async () => {
    const a = (await run<{ vessel: string }>('bench_place', { kind: 'beaker' })).vessel
    const b = (await run<{ vessel: string }>('bench_place', { kind: 'beaker' })).vessel
    expect(state.page).toBe('chem')
    const added = await run<{ ok: boolean; vessels: Array<{ pH: number; volume_mL: number }>; evidence: { logEntries: number } }>('bench_add', { to: a, reagent: 'HCl_0.1M', value: 20, unit: 'mL' })
    expect(added.ok).toBe(true)
    // the tool's numbers are the bench's own reading, rounded: 20 mL, pH of 0.1 mol/L HCl
    const direct = bench.read(a)!
    expect(added.vessels[0].volume_mL).toBeCloseTo(direct.volume_mL, 3)
    expect(added.vessels[0].pH).toBeCloseTo(direct.pH!, 3)
    expect(Math.abs(added.vessels[0].pH - 1)).toBeLessThan(0.1)
    expect(Math.abs(direct.volume_mL - 20)).toBeLessThan(0.05)
    await run('bench_pour', { from: a, to: b, value: 5, unit: 'mL' })
    expect(bench.read(b)!.volume_mL).toBeCloseTo(5, 1)
    expect(bench.read(a)!.volume_mL).toBeCloseTo(15, 1)
    await run('bench_pour', { from: a, to: b })
    expect(bench.read(a)!.volume_mL).toBeLessThan(1e-6)
    expect(bench.log.value.map(e => e.act)).toEqual(['place', 'place', 'add', 'pour', 'pour'])
    // undone on the bench like a click
    bench.undo()
    expect(bench.read(a)!.volume_mL).toBeCloseTo(15, 1)
    const st = await run<{ vessels: Array<{ vessel: string }>; canPlace: string[] }>('bench_state', {})
    expect(st.vessels.map(v => v.vessel)).toEqual([a, b])
    expect(st.canPlace).toContain('beaker')
  })

  it('neutralisation read back in full: pH 7 at the equivalence point, species from the core', async () => {
    const v = (await run<{ vessel: string }>('bench_place', { kind: 'beaker' })).vessel
    await run('bench_add', { to: v, reagent: 'HCl_0.1M', value: 20, unit: 'mL' })
    await run('bench_add', { to: v, reagent: 'NaOH_0.1M', value: 20, unit: 'mL' })
    const r = await run<{ pH: number; dissolved: Array<{ id: string; mol_per_L: number }>; diagnostics: unknown[]; evidence: { source: string } }>('bench_read', { vessel: v })
    expect(Math.abs(r.pH - 7)).toBeLessThan(0.05)
    const na = r.dissolved.find(s => /^Na\+/.test(s.id))
    expect(na!.mol_per_L).toBeCloseTo(0.05, 3)
    expect(Array.isArray(r.diagnostics)).toBe(true)
    expect(r.evidence.source).toContain('chemistry core')
  })

  it('heat and wait: the temperature rises as the core computes it', async () => {
    const v = (await run<{ vessel: string }>('bench_place', { kind: 'beaker' })).vessel
    await run('bench_add', { to: v, reagent: 'water', value: 100, unit: 'mL' })
    const t0 = bench.read(v)!.T
    await run('bench_heat', { vessel: v, power_W: 100 })
    const w = await run<{ vessels: Array<{ temperature_C: number; heater_W: number }> }>('bench_wait', { seconds: 10 })
    const dT = bench.read(v)!.T - t0
    // 1000 J into 100 g of water alone would be 2.39 K; the glass takes its share and the room a little
    expect(dT).toBeGreaterThan(0.5)
    expect(dT).toBeLessThan(2.4)
    // (the tool rounds readings to four significant digits)
    expect(w.vessels[0].temperature_C).toBeCloseTo(bench.read(v)!.T - 273.15, 1)
    expect(w.vessels[0].heater_W).toBe(100)
    await run('bench_heat', { vessel: v, power_W: 0 })
    expect(bench.read(v)!.heater).toBe(0)
  })

  it('wrong calls are refused before anything changes, with what to do instead', async () => {
    await expect(run('bench_add', { to: 'v9', reagent: 'HCl_0.1M', value: 20, unit: 'mL' })).rejects.toThrow(/no vessel v9 on the bench/)
    const v = (await run<{ vessel: string }>('bench_place', { kind: 'beaker' })).vessel
    await expect(run('bench_add', { to: v, reagent: 'unobtainium', value: 1, unit: 'g' })).rejects.toThrow(/chem_reagents/)
    await expect(run('bench_add', { to: v, reagent: 'HCl_0.1M', value: -1, unit: 'mL' })).rejects.toBeInstanceOf(ToolError)
    await expect(run('bench_add', { to: v, reagent: 'HCl_0.1M', value: 1, unit: 'cup' })).rejects.toThrow(/unit must be one of/)
    await expect(run('bench_place', { kind: 'cauldron' })).rejects.toThrow(/no vessel kind/)
    await expect(run('bench_heat', { vessel: v, power_W: 1e6 })).rejects.toThrow(/0 … 2000/)
    await expect(run('bench_wait', { seconds: 1e9 })).rejects.toThrow(/0\.5 … 3600/)
    await expect(run('bench_pour', { from: v, to: v })).rejects.toThrow(/same vessel/)
    expect(bench.log.value.map(e => e.act)).toEqual(['place'])
  })

  it('balances equations with the core; finds reagents; looks substances and elements up without inventing values', async () => {
    expect(await run('chem_balance', { reactants: ['H2', 'O2'], products: ['H2O'] })).toMatchObject({ balanced: true, coefficients: [2, 1, 2], equation: '2H2 + O2 → 2H2O' })
    expect(await run('chem_balance', { reactants: ['Fe', 'O2'], products: ['Fe2O3'] })).toMatchObject({ coefficients: [4, 3, 2] })
    expect(await run('chem_balance', { reactants: ['H2'], products: ['O2'] })).toMatchObject({ balanced: false, reason: 'impossible' })
    await expect(run('chem_balance', { reactants: [], products: ['H2O'] })).rejects.toBeInstanceOf(ToolError)
    const found = await run<{ reagents: Array<{ id: string; kind: string }> }>('chem_reagents', { query: 'NaOH' })
    expect(found.reagents.map(r => r.id).sort()).toEqual(['NaOH_0.1M', 'NaOH_solid'])
    const cu = await run<{ element: { symbol: string; atomicNumber: number; atomicMass: number } | null }>('chem_lookup', { query: 'Cu' })
    expect(cu.element).toMatchObject({ symbol: 'Cu', atomicNumber: 29 })
    expect(cu.element!.atomicMass).toBeCloseTo(63.546, 2)
    const none = await run<{ element: unknown; substances: unknown[] }>('chem_lookup', { query: 'kryptonite' })
    expect(none).toMatchObject({ element: null, substances: [] })
    const any = await run<{ substances: Array<{ id: string; molarMass_g_mol: number | null; density_kg_m3: number | null }> }>('chem_lookup', { query: 'Zn' })
    for (const s of any.substances) { expect(s.molarMass_g_mol === null || s.molarMass_g_mol > 0).toBe(true); expect(s.density_kg_m3 === null || s.density_kg_m3 > 0).toBe(true) }
  })

  it('opens the encyclopedia page of an element', async () => {
    await run('open_element', { symbol: 'Cu' })
    expect(ency.open).toBe(true)
    expect(ency.view).toEqual({ kind: 'element', symbol: 'Cu' })
    expect(state.page).toBe('chem')
    await expect(run('open_element', { symbol: 'copper' })).rejects.toBeInstanceOf(ToolError)
    await expect(run('open_substance', { id: 'kryptonite' })).rejects.toThrow(/chem_lookup/)
  })

  it('a conversation with a scripted model: it acts on the bench, reads, and the reading goes back to it', async () => {
    const seen: Body[] = []
    const replies = [
      () => ok(call('bench_place', { kind: 'beaker' }, 'c1')),
      (b: Body) => { const id = (JSON.parse(String(b.messages.at(-1)!.content)) as { vessel: string }).vessel; return ok(call('bench_add', { to: id, reagent: 'HCl_0.1M', value: 20, unit: 'mL' }, 'c2')) },
      (b: Body) => { const id = (JSON.parse(String(b.messages.at(-1)!.content)) as { vessels: Array<{ vessel: string }> }).vessels[0].vessel; return ok(call('bench_read', { vessel: id }, 'c3')) },
      (b: Body) => { const r = JSON.parse(String(b.messages.at(-1)!.content)) as { pH: number }; return ok({ role: 'assistant', content: `烧杯里的 pH 是 ${r.pH}（实验台读数）。` }) }
    ]
    setTransport(async req => { const b = JSON.parse(req.body ?? '{}') as Body; seen.push(b); const r = replies.shift(); if (!r) throw new Error('no reply'); return r(b) })
    await sendToCopilot('在烧杯里加 20 mL 0.1 mol/L 的盐酸，pH 是多少？')
    expect(seen).toHaveLength(4)
    expect(seen[0].tools!.some(t => t.function.name === 'bench_add')).toBe(true)
    const bot = copilot.bubbles.find(b => b.role === 'assistant')!
    // the two changes are shown as actions; the read is a reading, not a change
    expect(bot.actions.map(a => [a.tool, a.ok])).toEqual([['bench_place', true], ['bench_add', true]])
    expect(bot.actions[1].label.startsWith('加入 20 mL ')).toBe(true)
    const pH = bench.read(bench.vessels.value[0].id)!.pH!
    expect(bot.text).toBe(`烧杯里的 pH 是 ${Number(pH.toPrecision(4))}（实验台读数）。`)
    expect(bench.log.value.map(e => e.act)).toEqual(['place', 'add'])
    expect(state.page).toBe('chem')
  })
})
