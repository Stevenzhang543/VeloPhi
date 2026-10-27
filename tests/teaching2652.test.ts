/**
 * 26.52 teaching tools: free-body diagram (D62), ticker tape (D63) and v–t area (D64).
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../src/templates'
import { addBody, addGround, emptyScene } from '../src/core/scene/build'
import { simulate } from '../src/engine/recording'
import { fbdData, fbdSvg, fbdTable, FBD_DEFAULTS } from '../src/teaching/fbd'
import { tapeData, tapeSvg } from '../src/teaching/tape'
import { areaUnder } from '../src/teaching/area'
import { calc } from '../src/engine/core'

const simpson = (values: number[], h: number) => calc<{ value: number }>({ op: 'simpson', values, h }).value
import { BUILTIN_PROBLEMS, builtinProblem, varyParams } from '../src/teaching/problemBank'
import { isCorrect, parseProblem, problemParams, ptext, questionKey, serializeProblem } from '../src/teaching/problems'
import { recognize } from '../src/formula/recognize'

describe('free-body diagram', () => {
  it('a block on a rough incline: G, N and f in textbook order, summing to m·a', () => {
    const s = buildTemplate('incline')
    const rec = simulate(s)
    expect(rec.error).toBeNull()
    const d = fbdData(rec, 0.5, 'block')!
    expect(d).not.toBeNull()
    expect(d.forces.map(f => f.kind)).toEqual(['gravity', 'normal', 'friction'])
    expect(d.forces.map(f => f.label)).toEqual(['G', 'N', 'f'])
    expect(d.forces.every(f => f.sub === '')).toBe(true)
    expect(Math.hypot(d.net.x - d.ma.x, d.net.y - d.ma.y)).toBeLessThan(1e-9)
    // The contact tangent is the incline
    const th = Math.atan2(-(d.forces[1].fx), d.forces[1].fy)
    expect(Math.abs(Math.tan(d.incline!) - Math.tan(th))).toBeLessThan(1e-9)
    const g = s.settings.gravity.y, m = d.mass
    expect(d.forces[0].fy).toBeCloseTo(m * g, 12)
    // N = mg cos θ
    const N = Math.hypot(d.forces[1].fx, d.forces[1].fy)
    expect(N).toBeCloseTo(-m * g * Math.cos(d.incline!), 9)
    for (const opts of [FBD_DEFAULTS, { ...FBD_DEFAULTS, layout: 'concurrent' as const, decompose: 'incline' as const, resultant: true }, { ...FBD_DEFAULTS, body: 'particle' as const, decompose: 'axes' as const, theme: 'dark' as const }]) {
      const out = fbdSvg(d, opts)
      expect(out.svg.startsWith('<svg')).toBe(true)
      expect(out.width).toBeGreaterThan(100)
      expect(out.height).toBeGreaterThan(100)
      expect(out.svg).toContain('>G<')
      expect(out.svg).not.toContain('NaN')
    }
    expect(fbdTable(d)).toHaveLength(3)
  })

  it('a box on two supports: two normal forces numbered, contact points of one face merged', () => {
    const s = emptyScene('two')
    s.settings.gravity = { x: 0, y: -10 }
    s.settings.duration = 0.5
    addGround(s, { id: 'g', top: 0 })
    addBody(s, { id: 'a', name: 'A', kind: 'static', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: -1, y: 0.1 } })
    addBody(s, { id: 'b', name: 'B', kind: 'static', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 1, y: 0.1 } })
    addBody(s, { id: 'p', name: 'P', shape: { type: 'box', width: 3, height: 0.1 }, position: { x: 0, y: 0.25 }, mass: 2 })
    const rec = simulate(s)
    expect(rec.error).toBeNull()
    const d = fbdData(rec, 0.4, 'p')!
    const normals = d.forces.filter(f => f.kind === 'normal')
    expect(normals.length).toBe(2)
    expect(normals.map(f => f.sub)).toEqual(['1', '2'])
    expect(normals[0].fy + normals[1].fy).toBeCloseTo(20, 9)
    expect(d.forces.some(f => f.kind === 'other')).toBe(false)
  })

  it('components along and across the contact surface add up to each force', () => {
    const d = fbdData(simulate(buildTemplate('incline', { theta: 37 })), 0.6, 'block')!
    const th = d.incline!
    const e1 = [Math.cos(th), Math.sin(th)], e2 = [-Math.sin(th), Math.cos(th)]
    for (const f of d.forces) {
      const c1 = f.fx * e1[0] + f.fy * e1[1], c2 = f.fx * e2[0] + f.fy * e2[1]
      expect(Math.abs(c1 * c1 + c2 * c2 - (f.fx * f.fx + f.fy * f.fy))).toBeLessThan(1e-12 * Math.max(1, f.fx * f.fx + f.fy * f.fy))
    }
    // Along the surface: N has no component, friction has no normal component
    const N = d.forces.find(f => f.kind === 'normal')!, fr = d.forces.find(f => f.kind === 'friction')!
    expect(Math.abs(N.fx * e1[0] + N.fy * e1[1])).toBeLessThan(1e-9)
    expect(Math.abs(fr.fx * e2[0] + fr.fy * e2[1])).toBeLessThan(1e-9)
  })

  it('a static body has no diagram', () => {
    const rec = simulate(buildTemplate('incline'))
    expect(fbdData(rec, 0, 'incline')).toBeNull()
    expect(fbdData(rec, 0, 'nope')).toBeNull()
  })
})

/** A block sliding on rough ground: uniform deceleration μg until it stops. */
function slider(v0 = 3, mu = 0.2, g = 9.8) {
  const s = emptyScene('slide')
  s.settings.gravity = { x: 0, y: -g }
  s.settings.duration = 2
  addGround(s, { id: 'g', top: 0, material: { muS: mu, muK: mu, restitution: 0 } })
  addBody(s, { id: 'blk', name: '物块', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0, y: 0.1 }, velocity: { x: v0, y: 0 }, mass: 1, material: { muS: mu, muK: mu, restitution: 0 } })
  return s
}

describe('ticker tape', () => {
  it('successive differences give the acceleration of a uniformly decelerating block', () => {
    const rec = simulate(slider())
    expect(rec.error).toBeNull()
    for (const direction of ['path', 'x'] as const) {
      const d = tapeData(rec, { bodyId: 'blk', direction, period: 0.02, every: 5, start: 0.1, intervals: 6 })!
      expect(d.lengths).toHaveLength(6)
      expect(d.dots).toHaveLength(31)
      expect(d.used).toBe(6)
      expect(Math.abs(d.accel! - -0.2 * 9.8)).toBeLessThan(1e-9)
      expect(Math.abs(d.simAccel! - -0.2 * 9.8)).toBeLessThan(1e-9)
      for (const v of d.velocities) expect(Math.abs(v.tape - v.sim)).toBeLessThan(1e-9)
      // x₂ − x₁ = aT²
      expect(Math.abs(d.lengths[1] - d.lengths[0] - -1.96 * 0.01)).toBeLessThan(1e-10)
      const out = tapeSvg(d, { theme: 'light', digits: 4 })
      expect(out.svg.startsWith('<svg')).toBe(true)
      expect(out.svg).not.toContain('NaN')
    }
  })

  it('fewer intervals when the run ends early; none for a static body', () => {
    const rec = simulate(slider())
    const d = tapeData(rec, { bodyId: 'blk', direction: 'path', period: 0.02, every: 5, start: 1.75, intervals: 6 })!
    expect(d.lengths.length).toBe(2)
    expect(d.accel).not.toBeNull()
    expect(tapeData(rec, { bodyId: 'g', direction: 'path', period: 0.02, every: 5, start: 0 })).toBeNull()
  })
})

describe('area under a curve', () => {
  it('Simpson is exact for cubics, with the 3/8 rule for an odd interval count', () => {
    const f = (t: number) => t * t * t - 2 * t + 1
    const F = (t: number) => t ** 4 / 4 - t * t + t
    for (const n of [1, 2, 3, 4, 5, 7, 10]) {
      const h = 0.1, v = Array.from({ length: n + 1 }, (_x, i) => f(i * h))
      const exact = F(n * h) - F(0)
      expect(Math.abs(simpson(v, h) - exact)).toBeLessThan(n === 1 ? 1e-2 : 1e-12)
    }
  })

  it('the area under v–t equals the displacement read from the recording', () => {
    const rec = simulate(slider())
    const r = areaUnder(rec, 'blk.vx', 0.2, 1.1)!
    expect(r.compareId).toBe('blk.x')
    expect(Math.abs(r.area - r.compare!)).toBeLessThan(1e-6)
    expect(r.negative).toBe(0)
    const a = areaUnder(rec, 'blk.ax', 0.2, 1.1)!
    expect(Math.abs(a.area - a.compare!)).toBeLessThan(1e-6)
    expect(a.positive).toBe(0)
    expect(areaUnder(rec, 'blk.vx', 0.5, 0.5)).toBeNull()
  })
})

describe('problems', () => {
  it('has 30 built-in problems in ten chapters, each with answers from the simulation', () => {
    expect(BUILTIN_PROBLEMS.length).toBe(30)
    expect(new Set(BUILTIN_PROBLEMS.map(p => p.id)).size).toBe(30)
    expect(new Set(BUILTIN_PROBLEMS.map(p => p.chapter)).size).toBe(10)
    const report: string[] = []
    for (const spec of BUILTIN_PROBLEMS) {
      const prob = builtinProblem(spec)
      const rec = simulate(prob.scene)
      expect(rec.error, spec.id).toBeNull()
      const sits = recognize(rec)
      const params = problemParams(prob)
      for (const k of Object.keys(spec.params)) expect(params[k], `${spec.id} ${k}`).toBeDefined()
      for (const lang of ['zh', 'en', 'de'] as const) expect(ptext(prob.stem, lang, params)).not.toMatch(/\{\w+\}/)
      for (const q of prob.questions) {
        const key = questionKey(rec, sits, q)
        report.push(`${spec.id}/${q.id}: ${key.value} th=${key.theory} ${key.unit} ${key.note ?? ''}`)
        expect(key.value, `${spec.id}/${q.id} ${key.note ?? ''}`).not.toBeNull()
        if (q.type === 'numeric') {
          expect(isCorrect(q, key.value!, key)).toBe(true)
          expect(isCorrect(q, key.value! * 1.1 + 0.01, key)).toBe(false)
          if (key.theory !== null) expect(Math.abs(key.theory - key.value!), `${spec.id}/${q.id} theory`).toBeLessThanOrEqual(0.02 * Math.abs(key.value!) + 1e-6)
        } else {
          expect(key.value!).toBeGreaterThanOrEqual(0)
          expect(key.value!).toBeLessThan(q.options.length)
        }
      }
    }
  }, 120000)

  it('another set of numbers gives other answers, still read from the simulation', () => {
    let seed = 7
    const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
    for (const spec of BUILTIN_PROBLEMS) {
      const params = varyParams(spec, rand)
      const prob = builtinProblem(spec, params)
      const rec = simulate(prob.scene)
      expect(rec.error, spec.id).toBeNull()
      const sits = recognize(rec)
      for (const q of prob.questions) expect(questionKey(rec, sits, q).value, `${spec.id}/${q.id} ${JSON.stringify(params)}`).not.toBeNull()
    }
  }, 120000)

  it('round-trips through a problem file', () => {
    const prob = builtinProblem(BUILTIN_PROBLEMS[0])
    const back = parseProblem(serializeProblem(prob)).problem
    expect(back.questions).toEqual(prob.questions)
    expect(back.title).toEqual(prob.title)
    expect(back.stem).toEqual(prob.stem)
    const a = simulate(prob.scene), b = simulate(back.scene)
    expect(questionKey(b, recognize(b), back.questions[0]).value).toBe(questionKey(a, recognize(a), prob.questions[0]).value)
    expect(() => parseProblem('{}')).toThrow()
    expect(() => parseProblem(JSON.stringify({ format: 'velophi-problem', version: 1, problem: { title: 'x', stem: 'y', questions: [{ id: 'a', type: 'choice', prompt: 'p', options: ['1'] }], scene: {} } }))).toThrow()
  })
})
