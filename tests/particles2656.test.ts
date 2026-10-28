/**
 * Particle processes (26.56, D100; N11): the general checker (`particleProcess`: charge, baryon number, the three
 * lepton-family numbers, energy at rest or the threshold of a collision) and the scope of the nuclear reaction balance
 * (`reaction`: A and Z only), which must not be used as a general particle-process validator.
 */
import { describe, expect, it } from 'vitest'
import { particleProcess, reaction } from '../src/engine/labs'
import { evalModel } from '../src/engine/models'

const err = (q: number, ref: number) => Math.abs(q - ref) / Math.abs(ref)

describe('particles2656 conservation rules', () => {
  it('free-neutron decay is allowed with the antineutrino and its Q agrees with N11', () => {
    const p = particleProcess(['n'], ['p', 'e-', 'anti_nu_e'])
    expect(p.allowed).toBe(true)
    const K = evalModel('N11', { mnu: 0 }).outputs.find(o => o.id === 'K')!.value!
    expect(err(p.Q! * 1.602176634e-13, K)).toBeLessThan(1e-9)
  })
  it('each rule is checked on its own: lepton number, charge, energy, lepton family', () => {
    expect(particleProcess(['n'], ['p', 'e-', 'nu_e']).violations).toEqual(['leptonE'])
    expect(particleProcess(['n'], ['p']).violations).toEqual(['charge'])
    expect(particleProcess(['p'], ['n', 'e+', 'nu_e']).violations).toEqual(['energy'])
    expect(particleProcess(['mu-'], ['e-', 'gamma']).violations).toEqual(['leptonE', 'leptonMu'])
    expect(particleProcess(['pi+'], ['mu+', 'nu_mu']).allowed).toBe(true)
    expect(particleProcess(['quark'], ['p']).known).toBe(false)
  })
  it('collisions report the threshold; strangeness changes are flagged (weak processes only)', () => {
    const t = particleProcess(['p', 'p'], ['p', 'p', 'p', 'anti_p'])
    expect(err(t.threshold!, 6 * t.mass[0] / 2)).toBeLessThan(1e-9)
    expect(particleProcess(['Lambda'], ['p', 'pi-']).strangenessChanges).toBe(true)
    expect(particleProcess(['K-', 'p'], ['Lambda', 'pi0']).strangenessChanges).toBe(false)
  })
})

describe('particles2656 reaction validator scope', () => {
  it('the nuclear balance accepts n → p + e⁻ + ν (it does not know lepton numbers); the particle checker does not', () => {
    // the nuclear lab's "nu" is the antineutrino of β⁻ decay; written as a neutrino the particle checker rejects it
    const r = reaction([{ kind: 'n' }], [{ kind: 'nuclide', Z: 1, A: 1 }, { kind: 'e-' }, { kind: 'nu' }])
    expect(r.balanced).toBe(true)
    expect(particleProcess(['n'], ['p', 'e-', 'nu_e']).allowed).toBe(false)
  })
  it('the electron rest energy of the set enters the positron balance; without a set the 26.55 value stays', () => {
    const before = [{ kind: 'nuclide' as const, Z: 11, A: 22 }], after = [{ kind: 'nuclide' as const, Z: 10, A: 22 }, { kind: 'e+' as const }, { kind: 'nu' as const }]
    const old = reaction(before, after), r18 = reaction(before, after, 'CODATA2018'), r22 = reaction(before, after, 'CODATA2022')
    expect(old.Q).toBe(r18.Q)
    expect(Math.abs(r22.Q! - r18.Q!)).toBeCloseTo(2 * (0.51099895069 - 0.51099895), 12)
  })
})
