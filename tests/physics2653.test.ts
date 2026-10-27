/**
 * Physics of 26.53. D73: statically indeterminate contacts take the least friction, then the least force — a ball at
 * rest in a symmetric V-groove gets no friction and N = mg/(2 cos θ) on each side (both engines, bit for bit); a
 * full-rank scene is unchanged.
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../src/templates'
import { simulate } from '../src/engine/recording'
import { fbdOf } from '../src/engine/views'
import { simulate as refSimulate } from './reference/core/solver/simulation'
import { solveDense } from './reference/core/math/linalg'

describe('D73 minimum-norm forces of redundant contacts', () => {
  it('a ball at rest in a V-groove: no friction, N = mg/(2 cos θ) on each side', () => {
    const theta = 35, m = 0.5, g = 9.8
    const scene = buildTemplate('v-groove', { theta, m, mu: 0.5 })
    scene.settings.duration = 8
    const rec = simulate(scene)
    const ref = refSimulate(scene)
    expect(rec.hash).toBe(ref.hash)
    const T = (rec.frameCount - 1) * rec.dt
    const ball = rec.system.model.dynamic[0].id
    const fbd = fbdOf(rec, T, ball)!
    const normals = fbd.forces.filter(f => f.kind === 'normal')
    const friction = fbd.forces.filter(f => f.kind === 'friction')
    expect(normals.length).toBe(2)
    const N = m * g / (2 * Math.cos(theta * Math.PI / 180))
    for (const f of normals) expect(Math.abs(Math.hypot(f.fx, f.fy) - N) / N).toBeLessThan(1e-9)
    for (const f of friction) expect(Math.hypot(f.fx, f.fy)).toBeLessThan(1e-9)
    expect(fbd.forces.some(f => f.kind === 'other')).toBe(false)
  })

  it('the least first-stage unknowns, then the least others, over the null space of a singular system', () => {
    // x + y = 2 (twice): y (weight above 1) is made least first: y = 0, x = 2; the basic solution is kept as `basic`
    const r = solveDense(2, Float64Array.from([1, 1, 1, 1]), Float64Array.from([2, 2]), 1e-12, false, Float64Array.from([1, 4]))
    expect(r.rank).toBe(1)
    expect(r.x[0]).toBeCloseTo(2, 14)
    expect(Math.abs(r.x[1])).toBeLessThan(1e-15)
    expect(r.basic).toBeDefined()
    // t + n1 + n2 = 2 (three times): t = 0, then n1 = n2 = 1
    const s = solveDense(3, new Float64Array(9).fill(1), Float64Array.from([2, 2, 2]), 1e-12, false, Float64Array.from([1e12, 1, 1]))
    expect(Math.abs(s.x[0])).toBeLessThan(1e-15)
    expect(s.x[1]).toBeCloseTo(1, 14)
    expect(s.x[2]).toBeCloseTo(1, 14)
    // Full rank: unchanged
    const f = solveDense(2, Float64Array.from([2, 1, 1, 3]), Float64Array.from([3, 5]), 1e-12, false, Float64Array.from([1, 4]))
    expect(Array.from(f.x)).toEqual(Array.from(solveDense(2, Float64Array.from([2, 1, 1, 3]), Float64Array.from([3, 5])).x))
  })
})
