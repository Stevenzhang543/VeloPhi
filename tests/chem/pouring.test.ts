/**
 * Pouring on the bench (26.65, D297 item 1): the time a source is held over a mouth becomes the amount of ONE pour,
 * and the tipped vessel keeps its liquid's area. Closed forms:
 * - the flow is 0 while the source tips (0.25 s), then rises linearly over 1.2 s to the steady flow
 *   0.06 · capacity (2 … 25 mL/s): held T seconds (T ≥ 1.45 s) the amount is r·(T − 0.25 − 0.6) — tolerance 1e-9
 *   with frames of 1/60 s (the midpoint rule is exact on a linear ramp; the kink at the ends of the ramp costs at most
 *   one frame's worth of r·dt/2 — hence 0.01 mL);
 * - the liquid of a tipped vessel has the area of the upright cross-section below its level (to 1e-6 of it, the
 *   bisection's 40 halvings);
 * - a full beaker pours at a small tilt, a nearly empty one only when turned far over.
 */
import { describe, expect, it } from 'vitest'
import { PourMeter, RAMP_S, TIP_S, inMouthZone, mouthZone, pourAmount, pourRate, steadyRate } from '../../src/chem/pouring'
import { levelOf, shapeOf } from '../../src/chem/apparatus'
import { areaBelow, cavityPolygon, lipTilt, surfaceAt, uprightArea } from '../../src/render/chem/tilt'

describe('the flow of a pour', () => {
  it('grows with the size of the source, within 2 … 25 mL/s', () => {
    expect(steadyRate(20)).toBe(2)
    expect(steadyRate(250)).toBeCloseTo(15, 12)
    expect(steadyRate(500)).toBe(25)
    expect(steadyRate(2000)).toBe(25)
  })

  it('is nothing while the source tips, then ramps up', () => {
    expect(pourRate(0.1, 250)).toBe(0)
    expect(pourRate(TIP_S, 250)).toBe(0)
    expect(pourRate(TIP_S + RAMP_S / 2, 250)).toBeCloseTo(7.5, 12)
    expect(pourRate(10, 250)).toBeCloseTo(15, 12)
    expect(pourRate(10, 250, true)).toBeCloseTo(3, 12)
  })

  it('integrates to the closed form, frame by frame', () => {
    const m = new PourMeter(250, 200)
    for (let i = 0; i < 180; i++) m.step('b', 1 / 60)
    // 3 s held: 15 mL/s × (3 − 0.25 − 0.6) s = 32.25 mL
    expect(Math.abs(m.mL - 32.25)).toBeLessThan(0.01)
    expect(m.all).toBe(false)
  })

  it('starts again over another target, and stops at what the source holds', () => {
    const m = new PourMeter(250, 10)
    for (let i = 0; i < 60; i++) m.step('b', 1 / 60)
    expect(m.mL).toBeGreaterThan(0)
    m.step('c', 1 / 60)
    expect(m.to).toBe('c')
    expect(m.mL).toBe(0)
    for (let i = 0; i < 600; i++) m.step('c', 1 / 60)
    expect(m.mL).toBe(10)
    expect(m.all).toBe(true)
  })

  it('becomes one amount of the log: 0.1 mL steps, or all of it', () => {
    expect(pourAmount(0, 10)).toBeNull()
    expect(pourAmount(0.04, 10)).toBeNull()
    expect(pourAmount(12.345, 50)).toEqual({ value: 12.3, unit: 'mL' })
    expect(pourAmount(10, 10)).toBe('all')
  })

  it('happens over the mouth, not beside it', () => {
    const z = mouthZone(5, 9.5, 3.4)
    expect(inMouthZone(z, 5, 12)).toBe(true)
    expect(inMouthZone(z, 5 + 3.4 + 2, 10)).toBe(true)
    expect(inMouthZone(z, 5 + 3.4 + 2.5, 10)).toBe(false)
    expect(inMouthZone(z, 5, 7)).toBe(false)
    expect(inMouthZone(z, 5, 22)).toBe(false)
  })
})

describe('a tipped vessel', () => {
  const beaker = shapeOf('beaker', 250)
  const poly = cavityPolygon(beaker)

  it('keeps the area of its liquid at every tilt', () => {
    const area = uprightArea(beaker, 120)
    // upright: 2 r × level for the straight wall, less the two small triangles of the taper at the foot
    const r = beaker.rMax, r0 = beaker.r[0], h1 = beaker.h[1]
    expect(Math.abs(area - (2 * r * levelOf(beaker, 120) - (r - r0) * h1)) / area).toBeLessThan(1e-9)
    for (const deg of [10, 35, 60, 90]) {
      const phi = (deg * Math.PI) / 180
      const c = surfaceAt(poly, phi, area)
      expect(Math.abs(areaBelow(poly, -Math.sin(phi), Math.cos(phi), c) / area - 1)).toBeLessThan(1e-6)
    }
  })

  it('pours from a full beaker at a small tilt and from a nearly empty one turned far over', () => {
    // brim-full: it pours as soon as it leans; to the 250 mL mark there are still 2.5 cm of glass above the liquid
    const brim = lipTilt(beaker, beaker.brim_mL * 0.97), full = lipTilt(beaker, 250), half = lipTilt(beaker, 120), little = lipTilt(beaker, 10)
    expect(brim).toBeLessThan(full)
    expect(full).toBeLessThan(half)
    expect(half).toBeLessThan(little)
    expect((brim * 180) / Math.PI).toBeLessThan(10)
    expect((little * 180) / Math.PI).toBeGreaterThan(60)
  })
})
