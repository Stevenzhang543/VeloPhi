/**
 * Units consistency: every unit string attached to a quantity, a formula, a formula variable or measure, or a
 * force-expression variable is an SI unit known to units/units.ts (kindOf) or dimensionless, and its
 * dimension in formula/units.ts agrees with that kind. Formulas and recognizers use the scene's gravity.
 */
import { describe, expect, it } from 'vitest'
import { TEMPLATES, buildTemplate } from '../src/templates'
import { simulate } from './reference/core/solver/simulation'
import { listQuantities } from './reference/core/observe/quantities'
import { FORMULAS } from '../src/formula/library'
import { recognize } from './reference/formula/situations'
import { evaluateCard } from './reference/formula/match'
import { UNITS } from '../src/formula/units'
import type { Dim } from '../src/formula/units'
import type { UnitKind } from '../src/units/units'
import { kindOf } from '../src/units/units'
import { FORCE_VARIABLES } from './reference/core/solver/forceExpr'

// 26.56 (D99): the seven SI base dimensions (L, M, T, I, Θ, N, J); trailing zeros are trimmed as in formula/units.ts.
// Electrical kinds move from the former charge dimension to the current dimension (C = A·s).
const KIND_DIM: Record<UnitKind, Dim> = {
  length: [1, 0, 0], mass: [0, 1, 0], time: [0, 0, 1], velocity: [1, 0, -1], acceleration: [1, 0, -2], force: [1, 1, -2],
  energy: [2, 1, -2], power: [2, 1, -3], momentum: [1, 1, -1], angularMomentum: [2, 1, -1], angle: [0, 0, 0],
  angularVelocity: [0, 0, -1], angularAcceleration: [0, 0, -2], stiffness: [0, 1, -2], damping: [0, 1, -1],
  inertia: [2, 1, 0], torque: [2, 1, -2], frequency: [0, 0, -1],
  quadDrag: [-1, 1, 0], cubicStiffness: [-2, 1, -2], gravConst: [3, -1, -2], area: [2, 0, 0], arealVelocity: [2, 0, -1],
  charge: [0, 0, 1, 1], electricField: [1, 1, -3, -1], magneticField: [0, 1, -2, -1], coulombConst: [3, 1, -4, -2],
  voltage: [2, 1, -3, -1], current: [0, 0, 0, 1], resistance: [2, 1, -3, -2], capacitance: [-2, -1, 4, 2],
  temperature: [0, 0, 0, 0, 1], temperatureDifference: [0, 0, 0, 0, 1], amount: [0, 0, 0, 0, 0, 1], pressure: [-1, 1, -2],
  density: [-3, 1, 0], volume: [3, 0, 0], heatCapacity: [2, 1, -2, 0, -1], specificHeat: [2, 0, -2, 0, -1],
  molarHeatCapacity: [2, 1, -2, 0, -1, -1], specificEnergy: [2, 0, -2], thermalConductivity: [1, 1, -3, 0, -1],
  intensity: [0, 1, -3], viscosity: [-1, 1, -1], flowRate: [3, 0, -1], inductance: [2, 1, -2, -2], magneticFlux: [2, 1, -2, -1],
  linearDensity: [-1, 1, 0], expansion: [0, 0, 0, 0, -1], molarMass: [0, 1, 0, 0, 0, -1], wavenumber: [-1, 0, 0],
  numberDensity: [-3, 0, 0], permittivity: [-3, -1, 4, 2], permeability: [1, 1, -2, -2], surfaceCharge: [-2, 0, 1, 1],
  resistivity: [3, 1, -3, -2], action: [2, 1, -1], activity: [0, 0, -1]
}

function checkUnit(unit: string, where: string) {
  if (unit === '') return
  const kind = kindOf(unit)
  expect(kind, `${where}: unit “${unit}” unknown to units/units.ts`).not.toBeNull()
  const dim = UNITS[unit]
  expect(dim, `${where}: unit “${unit}” unknown to formula/units.ts`).toBeTruthy()
  expect([...dim], `${where}: dimension of “${unit}”`).toEqual([...KIND_DIM[kind!]])
}

const recs = TEMPLATES.map(t => ({ id: t.id, rec: simulate(buildTemplate(t.id)) }))

describe('units are SI and consistent', () => {
  it('quantities (watch panel, charts, CSV)', () => {
    let count = 0
    for (const { id, rec } of recs) for (const q of listQuantities(rec.system)) { checkUnit(q.unit, `${id} ${q.id}`); count++ }
    expect(count).toBeGreaterThan(300)
  })
  it('formula results', () => {
    for (const f of FORMULAS) checkUnit(f.unit, f.id)
  })
  it('formula variables and measures of every recognized situation', () => {
    let count = 0
    for (const { id, rec } of recs) {
      for (const s of recognize(rec)) {
        const sample = s.sample(s.tEvent ?? (s.t0 + s.t1) / 2)
        for (const [k, v] of Object.entries(sample.vars)) { checkUnit(v.unit, `${id} ${s.type} var ${k}`); count++ }
        for (const [k, m] of Object.entries(sample.measures)) { checkUnit(m.unit, `${id} ${s.type} measure ${k}`); count++ }
      }
    }
    expect(count).toBeGreaterThan(300)
  })
  it('force-expression variables', () => {
    for (const v of FORCE_VARIABLES) checkUnit(v.unit, `force variable ${v.name}`)
  })
})

describe('formulas use the scene gravity', () => {
  for (const g of [3.7, 9.81]) {
    it(`g = ${g} m/s²: every g variable is the scene's, and no formula deviates`, () => {
      let seen = 0
      for (const t of TEMPLATES) {
        if (!t.params.some(p => p.key === 'g')) continue
        const rec = simulate(buildTemplate(t.id, { g }))
        const gs = rec.scene.settings.gravity
        expect(Math.hypot(gs.x, gs.y)).toBe(g)
        for (const s of recognize(rec)) {
          const sample = s.sample(s.tEvent ?? (s.t0 + s.t1) / 2)
          if (sample.vars.g) { expect(sample.vars.g.value, `${t.id} ${s.type}`).toBe(g); seen++ }
          for (const f of FORMULAS.filter(f => f.situation === s.type)) {
            const c = evaluateCard(f, s, sample, { digits: 8 })
            expect(c.verdict, `${t.id} ${c.key}: ${c.reason}`).not.toBe('deviate')
          }
        }
      }
      expect(seen).toBeGreaterThan(15)
    })
  }
})
