/** Prediction & compare: targets, formula values, grades, persistence in scene.extra. */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../../src/templates'
import { simulate } from '../../src/core/solver/simulation'
import { recognize } from '../../src/formula/situations'
import { listQuantities } from '../../src/core/observe/quantities'
import { parseScene, serializeScene } from '../../src/core/scene/io'
import type { Prediction } from '../../src/analysis/prediction'
import { comparePrediction, evaluateTarget, gradeOf, newPredictionId, readPredictions, relativeError, targetLabel, targetUnit, writePredictions } from '../../src/analysis/prediction'

const scene = buildTemplate('board-block')
const rec = simulate(scene)
const sits = recognize(rec)
const a1 = 0.4 * 9.8, a2 = (0.4 * 1 * 9.8 - 0.1 * 3 * 9.8) / 2, t1 = 4 / (a1 + a2), vc = a2 * t1

describe('prediction targets', () => {
  it('first event time with its formula value', () => {
    const v = evaluateTarget(rec, sits, { kind: 'event', event: 'stick', body: 'block' })
    expect(v.unit).toBe('s')
    expect(v.sim!).toBeCloseTo(t1, 9)
    expect(v.formula!).toBeCloseTo(t1, 12)
    expect(v.formulaNote).toContain('共速')
    const none = evaluateTarget(rec, sits, { kind: 'event', event: 'impact' })
    expect(none.sim).toBeNull()
    expect(none.simNote).toBeTruthy()
  })

  it('quantity at a time', () => {
    const v = evaluateTarget(rec, sits, { kind: 'quantity', id: 'block.vx', t: 0.2 })
    expect(v.sim!).toBeCloseTo(4 - a1 * 0.2, 9)
    expect(v.unit).toBe('m/s')
    expect(evaluateTarget(rec, sits, { kind: 'quantity', id: 'block.vx', t: 99 }).sim).toBeNull()
    expect(evaluateTarget(rec, sits, { kind: 'quantity', id: 'ghost.vx', t: 0.1 }).sim).toBeNull()
  })

  it('formula of a recognised situation', () => {
    const v = evaluateTarget(rec, sits, { kind: 'formula', situation: 'board-block', formula: 'bb.vc' })
    expect(v.sim!).toBeCloseTo(vc, 9)
    expect(v.formula!).toBeCloseTo(vc, 12)
    expect(evaluateTarget(rec, sits, { kind: 'formula', situation: 'pendulum', formula: 'pd.T' }).sim).toBeNull()
  })

  it('labels and units', () => {
    const quantities = new Map(listQuantities(rec.system).map(q => [q.id, q]))
    const ctx = { quantities, bodyName: (id: string) => (id === 'block' ? '物块' : id), time: (t: number) => `t = ${t} s` }
    expect(targetLabel({ kind: 'event', event: 'stick', body: 'block' }, ctx)).toBe('首次共速（相对静止）的时刻（物块）')
    expect(targetLabel({ kind: 'quantity', id: 'block.vx', t: 0.5 }, ctx)).toContain('t = 0.5 s 时 物块')
    expect(targetLabel({ kind: 'formula', situation: 'board-block', formula: 'bb.t' }, ctx)).toBe('板块模型（相对滑动）：达到共速的时间')
    expect(targetUnit({ kind: 'formula', situation: 'board-block', formula: 'bb.vc' }, quantities)).toBe('m/s')
  })
})

describe('comparison', () => {
  it('grades by relative error', () => {
    expect(relativeError(1, 1)).toBe(0)
    expect(relativeError(0, 0)).toBe(0)
    expect(relativeError(1.02, 1)).toBeCloseTo(0.02 / 1.02, 12)
    expect(relativeError(1, null)).toBeNull()
    expect(gradeOf(0.005)).toBe('ok')
    expect(gradeOf(0.03)).toBe('warn')
    expect(gradeOf(0.2)).toBe('bad')
    expect(gradeOf(null)).toBe('none')
  })

  it('compares a hand calculation with g = 10 and with g = 9.8', () => {
    const exact: Prediction = { id: 'p1', target: { kind: 'event', event: 'stick' }, value: 0.907 }
    const c = comparePrediction(rec, sits, exact)
    expect(c.grade).toBe('ok')
    expect(c.absError!).toBeCloseTo(0.907 - t1, 9)
    // With g = 10: t = 4 / (4 + 0.5) = 0.889 s, about 2 % off
    const rough = comparePrediction(rec, sits, { ...exact, value: 4 / 4.5 })
    expect(rough.grade).toBe('warn')
    expect(rough.relErrorFormula!).toBeCloseTo(rough.relError!, 6)
    expect(comparePrediction(rec, sits, { ...exact, value: 1.5 }).grade).toBe('bad')
  })

  it('persists predictions in scene.extra through save and load', () => {
    const s = buildTemplate('board-block')
    const list: Prediction[] = [
      { id: 'p1', target: { kind: 'event', event: 'stick', body: null }, value: 0.9, note: '用 g = 10' },
      { id: newPredictionId([{ id: 'p1', target: { kind: 'event', event: 'stick' }, value: 1 }]), target: { kind: 'quantity', id: 'block.vx', t: 0.5 }, value: 2 }
    ]
    writePredictions(s, list)
    expect(list[1].id).toBe('p2')
    const back = parseScene(serializeScene(s)).scene
    expect(readPredictions(back)).toEqual(list)
    expect((back.extra as { template?: unknown }).template).toBeDefined()
    // Malformed entries are ignored; an empty list removes the field
    ;(back.extra as Record<string, unknown>).predictions = [...list, { id: 'x', value: 'a' }, null]
    expect(readPredictions(back).length).toBe(2)
    writePredictions(back, [])
    expect((back.extra as Record<string, unknown>).predictions).toBeUndefined()
  })
})
