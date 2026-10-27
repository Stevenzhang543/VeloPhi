/**
 * Vector scales (26.51 hand check): in a scene without uniform gravity the acceleration and force arrows used to be
 * scaled for 1 m/s², so the 40 m/s² of the orbit template ran far off the canvas. The scales now follow the
 * gravitational acceleration at the start; scenes with uniform gravity keep their scales.
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../../src/templates'
import { simulate } from '../../src/engine/recording'
import { vectorScales } from '../../src/render/renderer'

describe('vector scales', () => {
  it('the orbit template draws its centripetal acceleration and gravitation at a readable length', () => {
    const rec = simulate(buildTemplate('orbit', {}), { duration: 1 })
    const s = vectorScales(rec)
    // GM / r² = 1000 / 25 = 40 m/s² on a 1 kg planet
    expect(40 * s.a).toBeLessThanOrEqual(60)
    expect(40 * s.a).toBeGreaterThanOrEqual(40)
    expect(40 * s.f).toBeLessThanOrEqual(100)
  })

  it('scenes with uniform gravity keep their scales', () => {
    const rec = simulate(buildTemplate('incline', {}), { duration: 1 })
    const s = vectorScales(rec)
    expect(s.a).toBeCloseTo(55 / 9.8, 12)
  })
})
