/**
 * The reactor workshop through the core the application ships (26.64, D275, D278): the reference cases of
 * scripts/oracles/reactor.py (analytic multiplication factors and critical sizes, a reflected slab, the IAEA 2-D
 * PWR benchmark, the in-hour equation, the exact kinetics solution, the xenon chain) with the tolerance each case
 * states; the boundary of the model (it stops before prompt critical); determinism; and the time of one solution
 * on a 64 × 64 grid.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { calc, core, jsonBytes } from '../../src/engine/core'
import { loadReactorData, reactorAdvance, reactorBalance, reactorCriticality, reactorKinetics, reactorMaterials, reactorPresets, reactorTaskCheck, resetNuclearData } from '../../src/engine/nuclear'
import type { Criticality, KineticsRun, PoisonRun, ReactorDoc } from '../../src/engine/nuclear'

interface Case { id: string; kind: string; request: { op: string } & Record<string, unknown>; expect: Record<string, number | number[]>; tol: number }
const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'chem', 'reactor.json'), 'utf8')) as { cases: Case[] }
const rel = (got: number, want: number) => Math.abs(got / want - 1)

describe('reactor: reference cases', () => {
  it('reproduces every case of the fixture within its tolerance', async () => {
    resetNuclearData()
    await loadReactorData()
    expect(fixture.cases.length).toBeGreaterThanOrEqual(20)
    for (const c of fixture.cases) {
      if (c.kind === 'criticality') {
        const r = calc<Criticality>(c.request)
        expect(r.converged, c.id).toBe(true)
        expect(rel(r.keff, c.expect.keff as number), c.id).toBeLessThanOrEqual(c.tol)
      } else if (c.kind === 'iaea') {
        // cells of 10, 5 and 2.5 cm: every grid within 5e-4 of the reference 1.02959, the finest within 2e-4
        const k = [1, 2, 4].map(refine => calc<Criticality>({ ...c.request, grid: { ...(c.request.grid as object), refine } }).keff)
        k.forEach(v => expect(rel(v, c.expect.keff as number), `${c.id} ${v}`).toBeLessThanOrEqual(c.tol))
        expect(rel(k[2], c.expect.keff as number)).toBeLessThan(2e-4)
        expect(Math.abs(k[2] - k[1])).toBeLessThan(0.6 * Math.abs(k[1] - k[0]))
      } else if (c.kind === 'inhour') {
        const r = calc<KineticsRun>(c.request)
        expect(rel(r.inhour.omega!, c.expect.omega as number), c.id).toBeLessThanOrEqual(c.tol)
      } else if (c.kind === 'kinetics') {
        (c.request.times as number[]).forEach((t, i) => {
          const r = calc<KineticsRun>({ ...c.request, duration: t, samples: 1, rtol: 1e-9 })
          expect(rel(r.n[0], (c.expect.n as number[])[i]), `${c.id} t = ${t}`).toBeLessThanOrEqual(c.tol)
          expect(rel(r.promptJump!, c.expect.promptJump as number)).toBeLessThan(1e-12)
        })
      } else if (c.kind === 'poisons') {
        const hours = c.request.hours as number[]
        const last = hours[hours.length - 1]
        const r = calc<PoisonRun>({ ...c.request, duration: last * 3600, samples: last })
        hours.forEach((h, i) => expect(rel(r.xenon[h - 1], (c.expect.xenon as number[])[i]), `${c.id} ${h} h`).toBeLessThanOrEqual(c.tol))
        expect(rel(r.equilibrium.xenon, c.expect.xenonEq as number)).toBeLessThan(1e-12)
        expect(rel(r.peak!.xenon, c.expect.peakXenon as number)).toBeLessThan(1e-10)
        if ((c.expect.peakAfter as number) > 0) expect(rel(r.peak!.after, c.expect.peakAfter as number)).toBeLessThan(1e-10)
      } else throw new Error(`unknown kind ${c.kind}`)
    }
  })
})

describe('reactor: materials and presets', () => {
  it('has the twelve materials, each value with a source, and no fuel above 5 %', async () => {
    const m = await reactorMaterials()
    expect(m.materials.map(x => x.id)).toEqual(['fuel_nat', 'fuel_leu', 'water', 'heavy_water', 'graphite', 'steel', 'zircaloy', 'b4c', 'agincd', 'coolant', 'void', 'source'])
    for (const x of m.materials) {
      expect(x.name.zh && x.name.en && x.name.de, x.id).toBeTruthy()
      for (const key of ['D1', 'D2', 'a1', 'a2', 's12']) expect(Object.keys(m.sources), `${x.id}.${key}`).toContain(x.src[key])
    }
    expect(m.materials.filter(x => x.fuel).every(x => x.fuel!.max <= 5)).toBe(true)
    expect(m.teaching).toContain('not for design')
    expect(m.diagnostics.some(d => d.code === 'reactor.teachingModel')).toBe(true)
  })

  it('presets are shut down with the rods in and critical with the rods where the search puts them', async () => {
    const presets = await reactorPresets()
    expect(presets.map(p => p.id)).toEqual(['pwrLattice', 'graphitePile', 'heavyWater', 'research'])
    for (const p of presets) {
      const shut = await reactorCriticality(p.doc)
      expect(shut.keff, p.id).toBeLessThan(0.999)
      const out = await reactorCriticality(p.doc, { insertions: Object.keys(p.doc.rods!).map(() => 0) })
      expect(out.keff, p.id).toBeGreaterThan(1.002)
      expect(shut.power.length).toBe(shut.nx * shut.ny)
    }
    const research = presets[3].doc
    const run = await reactorAdvance(research, { dt: 600, samples: 30, init: { power: 1, search: true } })
    expect(run.state.ended).toBeNull()
    expect(Array.from(run.series.n).every(n => Math.abs(n - 1) < 5e-4)).toBe(true)
    expect(Math.abs(run.state.shim)).toBeLessThan(1e-4)
    expect((await reactorTaskCheck('critical', research, { state: run.state })).passed).toBe(true)
    expect((await reactorTaskCheck('critical', research)).passed).toBe(false)
    const b = await reactorBalance(research, run.state)
    expect(Math.abs(b.entries.reduce((s, e) => s + e.rho, 0) - b.rho)).toBeLessThan(1e-12)
    expect(b.entries.find(e => e.id === 'xenon')!.rho).toBeLessThan(0)
    expect(b.entries.find(e => e.id === 'rods')!.rho).toBeLessThan(0)
  })
})

describe('reactor: the boundary of the model', () => {
  it('stops before prompt critical and computes nothing beyond', async () => {
    // point kinetics: a step to 0.95 β is refused, a step to 0.5 β runs
    const beta = 0.0075998
    const refused = reactorKinetics({ rho: 0.95 * beta, duration: 1 })
    expect(refused.ended?.reason).toBe('validity')
    expect(refused.samples).toBe(0)
    expect(refused.diagnostics.some(d => d.code === 'reactor.promptCritical' && d.severity === 'unmodelled')).toBe(true)
    expect(reactorKinetics({ rho: 0.5 * beta, duration: 1 }).ended).toBeNull()
    // the whole model: rods pulled fast out of the cold core without protection
    const doc: ReactorDoc = { ...(await reactorPresets())[3].doc, protection: { enabled: false } }
    const cold = await reactorAdvance(doc, { dt: 1 })
    const fast = await reactorAdvance(doc, { state: cold.state, dt: 600, controls: { rods: 0, rodSpeed: 0.05 } })
    expect(fast.state.ended?.reason).toBe('validity')
    expect(fast.state.ended!.limit).toBeCloseTo(0.9 * beta, 12)
    expect(Array.from(fast.series.rho).every(r => r < 0.9 * beta)).toBe(true)
    expect(fast.state.n).toBeLessThan(1e-3)
    const after = await reactorAdvance(doc, { state: fast.state, dt: 10 })
    expect(after.samples).toBe(0)
    expect(after.state.t).toBe(fast.state.t)
  })
})

describe('reactor: determinism and cost', () => {
  it('gives the same bytes and the same state fingerprint for the same request', async () => {
    const doc = (await reactorPresets())[3].doc
    const req = jsonBytes({ op: 'reactorAdvance', doc, dt: 120, samples: 12, init: { power: 0.5, search: true }, controls: { pump: 0.6 } })
    const a = core().calcCall(req)!
    const b = core().calcCall(req)!
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
    const s = await reactorAdvance(doc, { dt: 120, samples: 12, init: { power: 0.5, search: true }, controls: { pump: 0.6 } })
    expect(s.state.hash).toMatch(/^[0-9a-f]{64}$/)
    expect((await reactorAdvance(doc, { dt: 120, samples: 12, init: { power: 0.5, search: true }, controls: { pump: 0.6 } })).state.hash).toBe(s.state.hash)
  })

  it('solves a 64 × 64 grid within the budget of 200 ms', async () => {
    const n = 64
    const cells: string[] = []
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) cells.push(x < 6 || y < 6 || x >= 58 || y >= 58 ? 'water' : (x + y) % 2 === 0 ? 'fuel_leu' : 'water')
    const doc: ReactorDoc = { grid: { nx: n, ny: n, pitch_cm: 1.6 }, cells, enrichment: 2, boundary: 'vacuum' }
    await reactorCriticality(doc)
    const times: number[] = []
    let k = 0
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      k = (await reactorCriticality(doc)).keff
      times.push(performance.now() - t0)
    }
    times.sort((a, b) => a - b)
    console.log(`reactor 64x64 (${core().kind}): k = ${k.toFixed(5)}, median ${times[2].toFixed(1)} ms, min ${times[0].toFixed(1)} ms`)
    expect(k).toBeGreaterThan(1.05)
    expect(times[2]).toBeLessThan(200)
  })
})
