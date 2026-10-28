/**
 * Dimension checks of the formula language in the Rust core (26.56, D99, D106): the model registry is refused when an
 * expression adds a voltage to an acceleration or takes the logarithm of a length; the real registry installs clean.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { calc } from '../src/engine/core'
import { registryJson } from '../src/content/models'

const bad = (expr: string) => [{ id: 'X99', inputs: [{ id: 'U', unit: 'V' }, { id: 'a', unit: 'm/s²' }, { id: 'L', unit: 'm' }], lets: [], conditions: [], outputs: [{ id: 'y', unit: '', expr }] }]
const problems = (models: unknown) => calc<{ problems: Array<{ model: string; detail: string }> }>({ op: 'setModels', models }).problems

describe('dims2656 rejects V + m/s² and ln(1 m)', () => {
  afterAll(() => { expect(problems(registryJson())).toEqual([]) })
  it('adding a voltage to an acceleration is a dimension error', () => {
    const p = problems(bad('U + a'))
    expect(p.length).toBe(1)
    expect(p[0].detail).toContain('dimMismatch')
  })
  it('the logarithm of a length is refused; of a ratio it is fine', () => {
    expect(problems(bad('ln(L)'))[0].detail).toContain('argumentNotDimensionless')
    expect(problems([{ ...bad('ln(L)')[0], outputs: [{ id: 'y', unit: '', expr: 'ln(L/(1*L))' }] }])).toEqual([])
  })
})
