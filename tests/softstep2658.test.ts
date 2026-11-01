/**
 * 26.58 (D126–D142): the many-body solver from the application's side — scene format 8, the Rust-only class, the four
 * many-body templates (they run, stay in their containers and come to rest), the Galton board's distribution,
 * the histogram counts, the solver badge and the comparison of two runs.
 */
import { describe, expect, it } from 'vitest'
import { TEMPLATES, buildTemplate, referenceTemplates } from '../src/templates'
import { SCENE_VERSION_SOFTSTEP, sceneVersionOf, usesFields, usesSoftStep } from '../src/core/scene/types'
import { parseScene, serializeScene } from '../src/core/scene/io'
import { simulate } from '../src/engine/recording'
import { posesAt } from '../src/engine/views'
import { histogramCounts, binomialExpected } from '../src/render/histogram'
import type { HistogramDef } from '../src/templates/t2658'
import { compareTracks, solverKind, withIntegrator } from '../src/app/solver'
import { streamRun } from './helpers/stream'

const MANY = ['pyramid', 'galton', 'dominoes', 'ball-pour']

describe('many-body scenes (format 8, Rust only)', () => {
  it('are written as format 8 and round-trip their solver settings', () => {
    const s = buildTemplate('pyramid')
    s.settings.softStep = { substeps: 8, stepHz: 240, sleep: false }
    expect(usesSoftStep(s)).toBe(true)
    expect(usesFields(s)).toBe(true)
    expect(sceneVersionOf(s)).toBe(SCENE_VERSION_SOFTSTEP)
    const text = serializeScene(s)
    expect(JSON.parse(text).version).toBe(8)
    const back = parseScene(text).scene
    expect(back.settings.integrator).toBe('softstep')
    expect(back.settings.softStep).toEqual({ substeps: 8, stepHz: 240, sleep: false })
  })

  it('reject out-of-range solver settings', () => {
    const s = buildTemplate('pyramid')
    s.settings.softStep = { substeps: 40 }
    expect(() => parseScene(serializeScene(s))).toThrow()
  })

  it('are not reference templates', () => {
    const ref = new Set(referenceTemplates().map(t => t.id))
    for (const id of MANY) expect(ref.has(id), id).toBe(false)
    expect(TEMPLATES.filter(t => usesSoftStep(buildTemplate(t.id))).map(t => t.id)).toEqual(MANY)
  })
})

describe('many-body templates', () => {
  for (const id of MANY) {
    it(`${id} runs to its duration fast and keeps the bodies in the scene`, () => {
      const scene = buildTemplate(id)
      const t0 = performance.now()
      const rec = simulate(scene)
      const ms = performance.now() - t0
      expect(rec.completed, id).toBe(true)
      expect(rec.error ?? null).toBeNull()
      // faster than real time by a wide margin in the test build
      expect(ms / 1000, id).toBeLessThan(scene.settings.legacyDuration)
      const last = posesAt(rec, { frames: [rec.frameCount - 1] })[0]
      for (const b of rec.system.model.dynamic) {
        const p = last[b.global]
        expect(p.y, `${id}: ${b.id}`).toBeGreaterThan(-0.05)
        expect(Math.abs(p.x), `${id}: ${b.id}`).toBeLessThan(20)
      }
    })
  }

  it('streams like it simulates: the same fingerprint through deltas, with a small memory budget (rebuilt chunks)', () => {
    const scene = buildTemplate('ball-pour')
    const direct = simulate(scene)
    const { rec } = streamRun(scene, { duration: scene.settings.legacyDuration, chunkSeconds: 0.25, steps: 7, budgetBytes: 2e5 })
    expect(rec.hash).toBe(direct.hash)
    const k = rec.frameCount - 1
    expect(Array.from(posesAt(rec, { frames: [k, 3] }).flat().map(p => p.x))).toEqual(Array.from(posesAt(direct, { frames: [k, 3] }).flat().map(p => p.x)))
  })

  it('the dominoes all fall: the first one leans past its tipping angle and pushes the rest', () => {
    const scene = buildTemplate('dominoes')
    const rec = simulate(scene)
    const last = posesAt(rec, { frames: [rec.frameCount - 1] })[0]
    for (const b of rec.system.model.dynamic) expect(Math.abs(last[b.global].th), b.id).toBeGreaterThan(0.3)
  })

  it('the Galton board fills the middle bins most', () => {
    const scene = buildTemplate('galton')
    const def = (scene.extra as { histogram: HistogramDef }).histogram
    const rec = simulate(scene)
    const last = posesAt(rec, { frames: [rec.frameCount - 1] })[0]
    const pts = rec.system.model.dynamic.map(b => last[b.global])
    const counts = histogramCounts(def, pts)
    const total = counts.reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThan(0.9 * rec.system.model.dynamic.length)
    const mid = Math.floor(def.bins / 2)
    const centre = counts[mid - 1] + counts[mid] + counts[mid + 1]
    const edges = counts[0] + counts[1] + counts[def.bins - 1] + counts[def.bins - 2]
    expect(centre).toBeGreaterThan(edges)
  })
})

describe('histogram and binomial expectation', () => {
  const def: HistogramDef = { x0: -1, binWidth: 0.5, bins: 4, floorY: 0, topY: 1, rows: 3 }
  it('counts bodies below the top in their bins', () => {
    const c = histogramCounts(def, [{ x: -0.9, y: 0.1 }, { x: -0.6, y: 0.5 }, { x: 0.1, y: 0.2 }, { x: 0.9, y: 0.9 }, { x: 0.9, y: 1.5 }, { x: 3, y: 0.1 }])
    expect(c).toEqual([2, 0, 1, 1])
  })
  it('binomial expectation sums to the number of balls', () => {
    const e = binomialExpected(3, 80)
    expect(e).toEqual([10, 30, 30, 10])
  })
})

describe('solver badge and comparison', () => {
  it('names the solver', () => {
    expect(solverKind('dopri5', null)).toBe('exact')
    expect(solverKind('dopri5', 1.2)).toBe('reduced')
    expect(solverKind('moreau', 0)).toBe('reduced')
    expect(solverKind('softstep', null)).toBe('soft')
  })
  it('compares tracks body by body and keeps the user scene', () => {
    const s = buildTemplate('pyramid')
    const c = withIntegrator(s, 'dopri5')
    expect(c.settings.integrator).toBe('dopri5')
    expect(s.settings.integrator).toBe('softstep')
    const a = { t: [0, 1], xy: [new Float64Array([0, 0, 1, 1]), new Float64Array([0, 0, 1, 1])], energy: [5, 5] }
    const b = { t: [0, 1], xy: [new Float64Array([0, 0, 1, 1]), new Float64Array([0.3, 0.4, 1, 1])], energy: [5, 4.5] }
    const r = compareTracks(a, b)
    expect(r.maxDr).toBeCloseTo(0.5, 12)
    expect(r.maxDrAt).toBe(1)
    expect(r.maxDrBody).toBe(0)
    expect(r.maxDE).toBeCloseTo(-0.5, 12)
  })
})
