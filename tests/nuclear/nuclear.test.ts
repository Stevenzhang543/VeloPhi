/**
 * Nuclides and decay chains through the core the application ships (26.64, D275, D276): the reference cases of
 * scripts/oracles/nuclear.py (closed Bateman formulas and matrix exponentials in mpmath; radioactivedecay in high
 * precision with the same data in the request) with the relative tolerance each case states, the table of
 * NUBASE2020 / AME2020, and determinism.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { calc, core, jsonBytes } from '../../src/engine/core'
import { decayRow, loadNuclides, networkDecay, nuclideChain, nuclideChart, nuclideDecay, nuclideInfo, resetNuclearData } from '../../src/engine/nuclear'
import type { DecayResult } from '../../src/engine/nuclear'

interface Case { id: string; kind: string; request: { op: string } & Record<string, unknown>; expect: Record<string, number | number[] | string[]>; tol: number; floor?: number }
const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'chem', 'nuclear.json'), 'utf8')) as { cases: Case[] }

describe('nuclear: reference cases', () => {
  it('reproduces every case of the fixture within its tolerance', async () => {
    resetNuclearData()
    await loadNuclides()
    let worst = 0
    let worstData = 0
    for (const c of fixture.cases) {
      const r = calc<DecayResult>(c.request)
      const row = (id: string, key: 'N' | 'A') => Array.from(decayRow(r, r[key], id))
      let err = 0
      if (c.kind === 'equilibrium') {
        const of = c.expect.of as string[]
        err = Math.abs(row(of[0], 'A')[0] / row(of[1], 'A')[0] / (c.expect.ratio as number) - 1)
      } else {
        for (const [name, value] of Object.entries(c.expect)) {
          const want = Array.isArray(value) ? value as number[] : [value as number]
          const got = row(name, c.kind === 'activity' ? 'A' : 'N')
          expect(got.length, `${c.id} ${name}`).toBe(want.length)
          want.forEach((w, k) => { if (Math.abs(w) > (c.floor ?? 0)) err = Math.max(err, Math.abs(got[k] / w - 1)) })
        }
      }
      expect(err, c.id).toBeLessThanOrEqual(c.tol)
      if (c.kind === 'data') worstData = Math.max(worstData, err); else worst = Math.max(worst, err)
    }
    expect(fixture.cases.length).toBeGreaterThanOrEqual(80)
    // the solution itself agrees to 1e-11 or better everywhere; the comparison of two data evaluations to a percent
    expect(worst).toBeLessThan(1e-11)
    expect(worstData).toBeLessThan(2e-2)
  })
})

describe('nuclear: the table', () => {
  it('holds NUBASE2020 with its citations and computes daughters and Q values', async () => {
    const info = await loadNuclides()
    expect(info.nuclides).toBe(4171)
    expect(info.ground).toBe(3558)
    expect(info.citations.length).toBe(3)
    expect(info.citations[0]).toContain('NUBASE2020')
    expect(info.licence).toContain('CC BY 3.0')
    const r = await nuclideInfo({ ids: ['U-238', 'Co-60', 'Cs-137', 'nope'] })
    expect(r.missing).toEqual(['nope'])
    const [u, co, cs] = r.nuclides
    expect(u.branches.find(b => b.mode === 'A')!.to).toBe('Th-234')
    // Q(β⁻) of Co-60: 2822.8 keV; half-life 5.2711 y
    expect(Math.abs(co.branches[0].Q! - 2822.8)).toBeLessThan(0.5)
    expect(Math.abs(co.halfLife! / (5.2711 * 31556926) - 1)).toBeLessThan(1e-4)
    // Cs-137 feeds the isomer Ba-137m with the sourced share, the rest goes to the ground state
    expect(cs.branches.map(b => [b.to, b.fraction])).toEqual([['Ba-137m', 0.947], ['Ba-137', expect.closeTo(0.053, 12)]])
    const chart = await nuclideChart()
    expect(chart.Z.length).toBe(4171)
    expect(chart.modes[chart.mode[Array.from(chart.Z).findIndex((z, i) => z === 92 && chart.N[i] === 146)]]).toBe('A')
  })

  it('follows the uranium series and says what it does not know', async () => {
    const c = await nuclideChain('U-238')
    expect(c.nuclides[0].id).toBe('U-238')
    expect(c.nuclides.some(n => n.id === 'Ra-226') && c.nuclides.some(n => n.id === 'Pb-206' && n.stable)).toBe(true)
    expect(c.diagnostics.some(d => d.code === 'nuclide.isomerFeeding' && d.severity === 'approx')).toBe(true)
    // Mo-99 after 6 h: activity of Tc-99m per becquerel of Mo-99 at the start (0.4228 with ICRP-107; NUBASE2020
    // half-lives and the ENSDF feeding 0.8778 give 0.4233)
    const r = await nuclideDecay({ 'Mo-99': 1 }, { times: [6 * 3600] }, { unit: 'Bq' })
    expect(Math.abs(decayRow(r, r.A, 'Tc-99m')[0] - 0.4228)).toBeLessThan(1e-3)
  })

  it('solves equal half-lives, which have no closed formula, and custom chains without the table', () => {
    const r = networkDecay({ nuclides: [{ id: 'A', halfLife: 2 }, { id: 'B', halfLife: 2 }, { id: 'C' }], decays: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }] }, { A: 1000 }, { grid: { tEnd: 10, samples: 11 } })
    const lam = Math.LN2 / 2
    Array.from(r.t).forEach((t, k) => expect(Math.abs(decayRow(r, r.N, 'B')[k] - 1000 * lam * t * Math.exp(-lam * t))).toBeLessThan(1e-9))
    expect(r.fallback).toBeGreaterThan(0)
  })
})

describe('nuclear: determinism', () => {
  it('gives the same bytes for the same request', async () => {
    await loadNuclides()
    const req = jsonBytes({ op: 'nuclideDecay', inventory: { 'U-238': 1, 'Th-232': 2 }, grid: { tEnd: 1e17, samples: 64 }, minBranch: 0 })
    const a = core().calcCall(req)!
    const b = core().calcCall(req)!
    const hash = (x: Uint8Array) => createHash('sha256').update(x).digest('hex')
    expect(hash(a)).toBe(hash(b))
    expect(a.length).toBeGreaterThan(1000)
  })
})
