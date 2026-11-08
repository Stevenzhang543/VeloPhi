/**
 * 26.61 (C): the app decides whether the explanation's numbers agree with the engine (verify.ts) — values with units,
 * SI, matched by dimension, |x − ref| ≤ atol + rtol·|ref| — and what a change did (sceneDiff).
 */
import { describe, expect, it } from 'vitest'
import { claimsOf, compareAnswers, sceneDiff, within } from '../../src/ai/copilot/verify'
import { buildTemplate } from '../../src/templates'
import { serializeScene } from '../../src/core/scene/io'

const line = (prompt: string, value: number | null, unit: string) => ({ prompt, value, unit, text: value === null ? '—' : `${value} ${unit}` })

describe('explanation against the engine', () => {
  it('reads values with units (decimals, ×10^n, LaTeX, Chinese units, km/h, cm) in SI', () => {
    const c = claimsOf('答案：v = 4.43 m/s，h = 25 cm，$F = 1.2\\times 10^{3}\\,\\text{N}$，速度 36 km/h，用时 2 秒，角度 30°')
    expect(c.map(x => x.unit)).toEqual(['m/s', 'm', 'N', 'm/s', 's', 'rad'])
    expect(c[0].value).toBeCloseTo(4.43)
    expect(c[1].value).toBeCloseTo(0.25)
    expect(c[2].value).toBeCloseTo(1200)
    expect(c[3].value).toBeCloseTo(10)
    expect(c[5].value).toBeCloseTo(Math.PI / 6)
    // Numbers without a unit (step numbers, ratios) are not claims
    expect(claimsOf('第 1 步，比值为 3')).toHaveLength(0)
  })

  it('matches by dimension in order, preferring the answer part; g = 10 rounding still agrees', () => {
    const text = '**答案**\n(1) 最高点速度 v = 2.0 m/s\n(2) 支持力 N = 30 N\n\n**过程**\n由 mg = 20 N 得 …'
    const checks = compareAnswers(text, [line('v', 1.98, 'm/s'), line('N', 29.4, 'N')])
    expect(checks.map(c => c.verdict)).toEqual(['match', 'match'])
    const wrong = compareAnswers(text, [line('v', 3.13, 'm/s'), line('N', 29.4, 'N')])
    expect(wrong[0].verdict).toBe('mismatch')
    expect(wrong[0].rel).toBeCloseTo(Math.abs(2 - 3.13) / 3.13)
    // A quantity the explanation does not state, or no engine value: unverifiable
    const none = compareAnswers(text, [line('E', 12, 'J'), line('t', null, 's')])
    expect(none.map(c => c.verdict)).toEqual(['unverifiable', 'unverifiable'])
  })

  it('the tolerance rule: atol + rtol·|ref|, near zero absolutely', () => {
    expect(within(1.02, 1)).toBe(true)
    expect(within(1.05, 1)).toBe(false)
    expect(within(0.0004, 0)).toBe(true)
    expect(within(0.01, 0)).toBe(false)
  })
})

describe('what a change did', () => {
  it('lists the changed fields of the same scene, and summarises a replaced scene in one line', () => {
    const a = buildTemplate('incline')
    const b = buildTemplate('incline')
    b.bodies.find(x => x.kind !== 'static')!.mass = 3
    b.settings.gravity = { x: 0, y: -10 }
    const d = sceneDiff(serializeScene(a), serializeScene(b))
    expect(d.replaced).toBe(false)
    expect(d.lines.some(l => /\.mass: 2 → 3/.test(l))).toBe(true)
    expect(d.lines.some(l => /settings\.gravity\.y: -9\.8 → -10/.test(l))).toBe(true)
    const r = sceneDiff(serializeScene(a), serializeScene(buildTemplate('pendulum')))
    expect(r.replaced).toBe(true)
    expect(r.lines).toHaveLength(1)
  })
})
