/** Parameter sweep: parameter catalogue, scene edits, measures, sequential runs, cancellation. */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../../src/templates'
import { simulate } from '../../src/engine/recording'
import type { Scene } from '../../src/core/scene/types'
import type { SweepRunner } from '../../src/analysis/sweep'
import { MAX_SWEEP_POINTS, linspace, listSweepParams, measureRecording, runSweep, sceneWith, unchangedTemplate } from '../../src/analysis/sweep'

const runner: SweepRunner = (scene: Scene, onProgress) => {
  let cancelled = false
  return {
    cancel() { cancelled = true },
    done: new Promise(resolve => setTimeout(() => { if (cancelled) return resolve(null); const rec = simulate(scene); onProgress(1); resolve(rec) }, 0))
  }
}

/** Board–block common-velocity time for μ1 (M = 2, m = 1, v0 = 4, μ2 = 0.1, g = 9.8). */
const tCommon = (mu1: number) => { const g = 9.8; const a2 = (mu1 * g - 0.1 * 3 * g) / 2; return 4 / (mu1 * g + a2) }

describe('sweep parameters', () => {
  const scene = buildTemplate('board-block')
  const params = listSweepParams(scene)
  const byId = new Map(params.map(p => [p.id, p]))

  it('offers template, body, pair and scene parameters', () => {
    expect(unchangedTemplate(scene)?.id).toBe('board-block')
    for (const id of ['template:mu1', 'template:v0', 'body:block:mass', 'body:block:vx', 'body:block:dir', 'pair:block|board:mu', 'gravity:g']) expect(byId.has(id)).toBe(true)
    expect(byId.get('template:mu1')!.get(scene)).toBe(0.4)
    expect(byId.get('body:block:speed')!.get(scene)).toBe(4)
  })

  it('drops template parameters once the scene was edited', () => {
    const edited = buildTemplate('board-block')
    edited.bodies.find(b => b.id === 'block')!.mass = 1.5
    expect(unchangedTemplate(edited)).toBeNull()
    expect(listSweepParams(edited).some(p => p.id.startsWith('template:'))).toBe(false)
    // Renaming or moving the view is not a physical edit
    const renamed = buildTemplate('board-block')
    renamed.name = 'x'; renamed.view.pixelsPerMeter = 33
    expect(unchangedTemplate(renamed)).not.toBeNull()
  })

  it('edits a copy and validates it', () => {
    const s2 = sceneWith(scene, byId.get('pair:block|board:mu')!, 0.5)
    expect(s2.contactPairs[0].muS).toBe(0.5)
    expect(scene.contactPairs[0].muS).toBe(0.4)
    const s3 = sceneWith(scene, byId.get('body:block:dir')!, Math.PI / 2)
    expect(s3.bodies.find(b => b.id === 'block')!.velocity.x).toBeCloseTo(0, 12)
    expect(s3.bodies.find(b => b.id === 'block')!.velocity.y).toBeCloseTo(4, 12)
    expect(() => sceneWith(scene, byId.get('body:block:mass')!, -1)).toThrow()
    const g = sceneWith(scene, byId.get('gravity:g')!, 10)
    expect(Math.abs(g.settings.gravity.x)).toBe(0)
    expect(g.settings.gravity.y).toBe(-10)
    // Incline angle through the template (degrees in the template, radians here)
    const inc = buildTemplate('incline')
    const theta = listSweepParams(inc).find(p => p.id === 'template:theta')!
    expect(theta.unit).toBe('rad')
    expect(theta.get(inc)).toBeCloseTo(Math.PI / 6, 12)
    const steeper = sceneWith(inc, theta, 40 * Math.PI / 180)
    expect((steeper.extra as { template: { values: Record<string, number> } }).template.values.theta).toBeCloseTo(40, 9)
    expect(JSON.stringify(steeper.bodies)).not.toBe(JSON.stringify(inc.bodies))
    expect(steeper.watch).toEqual(inc.watch)
  })

  it('spaces values evenly and caps the count', () => {
    expect(linspace(0, 1, 5)).toEqual([0, 0.25, 0.5, 0.75, 1])
    expect(linspace(2, 3, 1)).toEqual([2])
    expect(linspace(0, 1, 500).length).toBe(MAX_SWEEP_POINTS)
  })
})

describe('sweep runs', () => {
  const scene = buildTemplate('board-block')
  const param = listSweepParams(scene).find(p => p.id === 'template:mu1')!

  it('reproduces the common-velocity time against μ1', async () => {
    const values = [0.35, 0.45, 0.6]
    const progress: number[] = []
    const pts = await runSweep(scene, { param, values, measure: { kind: 'eventTime', event: 'stick', body: 'block' } }, runner, { cancelled: () => false, onProgress: p => progress.push(p) })
    expect(pts.length).toBe(3)
    pts.forEach((p, i) => { expect(p.error).toBeUndefined(); expect(p.result!).toBeCloseTo(tCommon(values[i]), 9) })
    expect(progress[progress.length - 1]).toBe(1)
    // The same through the contact-pair parameter
    const pair = listSweepParams(scene).find(p => p.id === 'pair:block|board:mu')!
    const viaPair = await runSweep(scene, { param: pair, values: [0.45], measure: { kind: 'eventTime', event: 'stick' } }, runner, { cancelled: () => false })
    expect(viaPair[0].result!).toBeCloseTo(tCommon(0.45), 9)
  })

  it('measures maxima, minima, final values and values at a time', () => {
    const rec = simulate(scene)
    const vc = (0.4 * 9.8 - 0.1 * 3 * 9.8) / 2 * tCommon(0.4)
    expect(measureRecording(rec, { kind: 'max', id: 'block.vx' })).toBe(4)
    expect(measureRecording(rec, { kind: 'max', id: 'board.vx' })!).toBeCloseTo(vc, 3)
    expect(measureRecording(rec, { kind: 'min', id: 'board.vx' })).toBe(0)
    expect(measureRecording(rec, { kind: 'valueAt', id: 'block.vx', t: 0.1 })!).toBeCloseTo(4 - 0.4 * 9.8 * 0.1, 9)
    expect(measureRecording(rec, { kind: 'final', id: 'ghost.vx' })).toBeNull()
    expect(measureRecording(rec, { kind: 'eventTime', event: 'impact' })).toBeNull()
  })

  it('records failed points and stops when cancelled', async () => {
    const mass = listSweepParams(scene).find(p => p.id === 'body:block:mass')!
    const bad = await runSweep(scene, { param: mass, values: [-1, 1], measure: { kind: 'final', id: 'block.vx' } }, runner, { cancelled: () => false })
    expect(bad[0].result).toBeNull()
    expect(bad[0].error).toBeTruthy()
    expect(bad[1].result).not.toBeNull()
    let n = 0
    const some = await runSweep(scene, { param, values: [0.35, 0.4, 0.45, 0.5], measure: { kind: 'final', id: 'block.vx' } }, runner, { cancelled: () => n >= 2, onPoint: () => { n++ } })
    expect(some.length).toBe(2)
  })

  it('parallel points (D68) are reported in order and equal a sequential sweep', async () => {
    const param = listSweepParams(scene).find(p => p.id === 'template:mu1')!
    const values = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6]
    // A runner whose runs finish in reverse order
    let started = 0
    const slow: SweepRunner = (sc, onProgress) => {
      let cancelled = false
      const delay = 40 - 5 * (started++ % 7)
      return { cancel() { cancelled = true }, done: new Promise(resolve => setTimeout(() => { if (cancelled) return resolve(null); const rec = simulate(sc); onProgress(1); resolve(rec) }, delay)) }
    }
    const order: number[] = []
    const measure = { kind: 'final' as const, id: 'block.vx' }
    const seq = await runSweep(scene, { param, values, measure }, runner, { cancelled: () => false })
    const par = await runSweep(scene, { param, values, measure }, slow, { cancelled: () => false, onPoint: (_p, i) => order.push(i) }, 3)
    expect(order).toEqual(values.map((_v, i) => i))
    expect(par.map(p => [p.value, p.result, p.hash])).toEqual(seq.map(p => [p.value, p.result, p.hash]))
    // Cancelled after two points: the points still running are stopped
    let n = 0
    const some = await runSweep(scene, { param, values, measure }, slow, { cancelled: () => n >= 2, onPoint: () => { n++ } }, 3)
    expect(some.length).toBe(2)
  })
})

describe('sweeps of scenes with variable forces and movable pulleys', () => {
  it('sweeps the force amplitude of an expression force (template rebuild)', async () => {
    const scene = buildTemplate('variable-force')
    const params = listSweepParams(scene)
    // The expression force has no constant components to sweep; its amplitude comes from the template
    expect(params.some(p => p.id === 'force:F:fx')).toBe(false)
    const F0 = params.find(p => p.id === 'template:F0')!
    const pts = await runSweep(scene, { param: F0, values: [2, 5], measure: { kind: 'max', id: 'block.vx' } }, runner, { cancelled: () => false })
    // v(t) = F0/(mω)(1 − cos ωt): maximum 2F0/(mω) at ωt = π (m = 1, ω = 3)
    pts.forEach((p, i) => { expect(p.error).toBeUndefined(); expect(p.result!).toBeCloseTo(2 * [2, 5][i] / 3, 4) })
    // Power of the applied force is a measurable quantity too
    const P = await runSweep(scene, { param: F0, values: [5], measure: { kind: 'max', id: 'F.P' } }, runner, { cancelled: () => false })
    expect(P[0].result!).toBeGreaterThan(0)
  })

  it('sweeps a body field of an edited expression-force scene', async () => {
    const scene = buildTemplate('variable-force')
    scene.bodies.find(b => b.id === 'block')!.mass = 1.0000001 // Edited: template parameters no longer offered
    const mass = listSweepParams(scene).find(p => p.id === 'body:block:mass')!
    expect(listSweepParams(scene).some(p => p.id.startsWith('template:'))).toBe(false)
    const pts = await runSweep(scene, { param: mass, values: [1, 2], measure: { kind: 'max', id: 'block.vx' } }, runner, { cancelled: () => false })
    expect(pts[0].result!).toBeCloseTo(10 / 3, 4)
    expect(pts[1].result!).toBeCloseTo(5 / 3, 4)
  })

  it('sweeps masses of the movable-pulley system', async () => {
    const g = 9.8, m2 = 1.5
    const a2 = (m1: number, mm2 = m2) => (2 * m1 - mm2) * g / (4 * m1 + mm2)
    const scene = buildTemplate('movable-pulley')
    const m1 = listSweepParams(scene).find(p => p.id === 'template:m1')!
    const pts = await runSweep(scene, { param: m1, values: [1, 2], measure: { kind: 'valueAt', id: 'm2.ay', t: 0.2 } }, runner, { cancelled: () => false })
    pts.forEach((p, i) => { expect(p.error).toBeUndefined(); expect(p.result!).toBeCloseTo(a2([1, 2][i]), 8) })
    // The pulley rides on m2: changing m2's mass directly works as well
    const mass2 = listSweepParams(scene).find(p => p.id === 'body:m2:mass')!
    const q = await runSweep(scene, { param: mass2, values: [1], measure: { kind: 'valueAt', id: 'm2.ay', t: 0.2 } }, runner, { cancelled: () => false })
    expect(q[0].result!).toBeCloseTo(a2(1, 1), 8)
  })
})
