/**
 * 26.61 phase B: the three classroom experiments. Their evidence comes from the engine and the model registry and
 * agrees with the textbook (tan θ ≤ μs on both sides of the threshold; elastic collision before/after one event;
 * t = RC → 63.2 %); the sample CSV maps with its units and gives τ and the RMS deviation; every lesson has the six
 * steps, two hints, a teacher flow and three languages.
 */
import { describe, expect, it } from 'vitest'
import { LESSONS, LESSON_STEPS } from '../../src/teaching/lessons/defs'
import { collisionEvidence, fitRcCsv, rcEvidence, rightOption, sampleRcCsv, staticEvidence, transferAnswer } from '../../src/teaching/lessons/evidence'
import { parseMeasuredCsv } from '../../src/analysis/measured'
import { templateById } from '../../src/templates'
import { ACTIVITIES } from '../../src/teaching/activities'

describe('classroom experiments (26.61 B)', () => {
  it('static friction: both sides of the critical angle agree with tan θ ≤ μs', () => {
    const below = staticEvidence(25), above = staticEvidence(28)
    expect(below.thetaC).toBeCloseTo(26.565, 2)
    expect(below.ruleStays).toBe(true)
    expect(below.engineStays).toBe(true)
    expect(below.agrees).toBe(true)
    // At rest the friction is mg sin θ, not μs N
    expect(Math.abs(below.friction!)).toBeCloseTo(2 * 9.8 * Math.sin(25 * Math.PI / 180), 3)
    expect(above.ruleStays).toBe(false)
    expect(above.engineStays).toBe(false)
    expect(above.agrees).toBe(true)
    expect(Math.abs(above.friction!)).toBeCloseTo(0.4 * 2 * 9.8 * Math.cos(28 * Math.PI / 180), 3)
    // Mass does not move the threshold
    expect(staticEvidence(25, 0.5, 0.4, 20).engineStays).toBe(true)
  })

  it('elastic collision: before/after one event, signed velocities, momentum and kinetic energy', () => {
    for (const m2 of [0.5, 1, 2, 4]) {
      const e = collisionEvidence(m2)
      expect(e.agrees, `m2 = ${m2}`).toBe(true)
      expect(e.before.vA).toBeCloseTo(3, 9)
      expect(e.before.vB).toBeCloseTo(0, 9)
    }
    expect(collisionEvidence(2).after.vA!).toBeLessThan(0)
    expect(collisionEvidence(1).after.vA!).toBeCloseTo(0, 9)
  })

  it('RC: τ = RC and 63.2 % at t = τ, for any R, C and Vs', () => {
    for (const [R, C, Vs] of [[1000, 1e-4, 5], [2000, 1e-4, 5], [2200, 4.7e-5, 9]]) {
      const e = rcEvidence(R, C, Vs)
      expect(e.agrees).toBe(true)
      expect(e.ratio).toBeCloseTo(0.6321, 4)
    }
  })

  it('the sample CSV: columns and units mapped (ms → s), τ and the RMS deviation', () => {
    const csv = sampleRcCsv()
    const table = parseMeasuredCsv(csv)
    expect(table.columns.map(c => c.unit)).toEqual(['ms', 'V', 'mA'])
    const fit = fitRcCsv(csv, 0, 1)
    expect(fit.n).toBeGreaterThan(40)
    expect(fit.tau!).toBeGreaterThan(0.09)
    expect(fit.tau!).toBeLessThan(0.11)
    expect(fit.rms!).toBeLessThan(0.06)
    // Mapping the wrong column (current) is visible in the deviation
    expect(fitRcCsv(csv, 0, 2).rms!).toBeGreaterThan(1)
  })

  it('the lessons: six steps, two hints, teacher flow, evidence that opens, answers decided by the evidence', () => {
    expect(LESSONS.map(l => l.activity)).toEqual(['act-static', 'act-collision', 'act-rc'])
    for (const l of LESSONS) {
      expect(l.steps.map(s => s.id)).toEqual(LESSON_STEPS)
      expect(l.hints).toHaveLength(2)
      expect(Number(l.teacher.minutes)).toBeGreaterThanOrEqual(10)
      expect(Number(l.teacher.minutes)).toBeLessThanOrEqual(15)
      expect(ACTIVITIES.some(a => a.id === l.activity)).toBe(true)
      for (const t of [l.title, l.goal, l.start, ...l.assumptions, ...l.misconceptions, ...l.hints, ...l.teacher.flow, ...l.steps.map(s => s.text)]) {
        expect(t.zh && t.en && t.de, JSON.stringify(t)).toBeTruthy()
      }
      for (const s of l.steps) for (const e of s.evidence ?? []) if (e.template) {
        const t = templateById(e.template)!
        expect(t, e.template).toBeTruthy()
        for (const k of Object.keys(e.values ?? {})) expect(t.params.some(p => p.key === k), `${e.template}.${k}`).toBe(true)
      }
      const pr = l.steps.find(s => s.id === 'predict')!
      expect(pr.options!.some(o => o.id === rightOption(l.id, 'predict'))).toBe(true)
      const ex = l.steps.find(s => s.id === 'explain')!
      expect(ex.options!.some(o => o.id === rightOption(l.id, 'explain'))).toBe(true)
      expect(Number.isFinite(transferAnswer(l.id))).toBe(true)
    }
    expect(rightOption('lesson-static', 'predict')).toBe('slide')
    expect(rightOption('lesson-collision', 'predict')).toBe('back')
    expect(rightOption('lesson-rc', 'predict')).toBe('double')
    expect(transferAnswer('lesson-static')).toBeCloseTo(34.99, 1)
    expect(transferAnswer('lesson-collision')).toBeCloseTo(1.5, 6)
    expect(transferAnswer('lesson-rc')).toBeCloseTo(0.1034, 4)
  })
})
