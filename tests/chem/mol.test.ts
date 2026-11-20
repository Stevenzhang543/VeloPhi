/**
 * Molecule, crystal and orbital operations of the core through their wrappers (26.64, D271): against closed forms and
 * against the independent references of scripts/oracles/mol.py (numpy geometry, mendeleev masses, scipy.special
 * orbitals) in tests/fixtures/chem/mol/reference.json. Tolerances are stated at each comparison.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CrystalBuild, CrystalSpec, MoleculeRecord } from '../../src/engine/mol'
import { crystalBuild, loadCrystals, loadMolecules, molGeometry, molMeasure, molShape, orbitalSample } from '../../src/engine/mol'

const dir = join(__dirname, '..', 'fixtures', 'chem', 'mol')
const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'))
const molecules: MoleculeRecord[] = read('molecules.json').molecules
const crystals: Array<CrystalSpec & { id: string }> = read('crystals.json').crystals
const ref = read('reference.json')
const mol = (id: string) => molecules.find(m => m.id === id)!
const built = (id: string, opts = {}) => {
  const b = crystalBuild(crystals.find(c => c.id === id)!, opts)
  if (!b.ok) throw new Error(id)
  return b as CrystalBuild
}

describe('mol measure', () => {
  it('distance, angle and dihedral of chosen points (closed forms, 1e-12)', () => {
    const d = molMeasure([0, 0, 0, 3, 4, 0])
    expect(d.kind === 'distance' && d.distance).toBe(5)
    expect(d.kind === 'distance' && d.distancePm).toBe(500)
    const tet = molMeasure([1, 1, 1, 0, 0, 0, 1, -1, -1])
    expect(tet.kind === 'angle' && Math.abs(tet.angle - 109.47122063449069)).toBeLessThan(1e-12)
    // Looking from the second atom to the third, the fourth is a quarter turn clockwise from the first: +90°
    const dih = molMeasure([1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1])
    expect(dih.kind === 'dihedral' && Math.abs((dih.dihedral ?? 0) - 90)).toBeLessThan(1e-12)
    const none = molMeasure([0, 0, 1, 0, 0, 0, 0, 0, 2, 1, 0, 2])
    expect(none.kind === 'dihedral' && none.dihedral).toBe(null)
  })

  it('all bond lengths and angles of every fixture molecule agree with numpy (1e-9 Å, 1e-7°)', () => {
    let lengths = 0, angles = 0
    for (const m of molecules) {
      const g = molGeometry(m.xyz, m.bonds), r = ref.molecules[m.id]
      expect(g.bonds.length.length).toBe(r.bonds.length)
      r.bonds.forEach((b: { length: number }, k: number) => { expect(Math.abs(g.bonds.length[k] - b.length)).toBeLessThan(1e-9); lengths++ })
      expect(g.angles.angle.length).toBe(r.angles.length)
      r.angles.forEach((a: { i: number; j: number; k: number; angle: number }, k: number) => {
        expect([g.angles.ijk[3 * k], g.angles.ijk[3 * k + 1], g.angles.ijk[3 * k + 2]]).toEqual([a.i, a.j, a.k])
        expect(Math.abs(g.angles.angle[k] - a.angle)).toBeLessThan(1e-7)
        angles++
      })
    }
    expect(lengths).toBeGreaterThan(60)
    expect(angles).toBeGreaterThan(90)
    // Water from its coordinates: 0.9572 Å and 104.52° (the fixture is rounded to 1e-6 Å)
    const w = molGeometry(mol('water').xyz, mol('water').bonds)
    expect(Math.abs(w.bonds.length[0] - 0.9572)).toBeLessThan(2e-6)
    expect(Math.abs(w.angles.angle[0] - 104.52)).toBeLessThan(2e-4)
    // Ethanol's dihedrals with the sign convention of the reference
    const e = mol('ethanol')
    for (const d of ref.molecules.ethanol.dihedrals) {
      const m = molMeasure(d.atoms.flatMap((i: number) => e.xyz.slice(3 * i, 3 * i + 3)))
      expect(m.kind === 'dihedral' && Math.abs((m.dihedral ?? 0) - d.dihedral)).toBeLessThan(1e-7)
    }
  })
})

describe('mol shape', () => {
  it('names the thirteen VSEPR classes of the fixtures and counts their lone pairs', () => {
    const classes = new Set<string>()
    for (const m of molecules) {
      const want = ref.molecules[m.id].vsepr
      const s = molShape(m)
      const c = s.centres.find(x => x.atom === want.atom)!
      expect([m.id, c.class, c.geometry, c.lonePairs]).toEqual([m.id, want.class, want.geometry, want.lonePairs])
      expect(c.lobes.length).toBe(want.lonePairs)
      // Real geometries: the coordinates show the predicted shape
      expect(c.observed, m.id).toBe(want.geometry)
      classes.add(c.class!)
    }
    expect([...classes].sort()).toEqual(['AX2', 'AX2E', 'AX2E2', 'AX2E3', 'AX3', 'AX3E', 'AX3E2', 'AX4', 'AX4E', 'AX4E2', 'AX5', 'AX5E', 'AX6'])
    expect(molShape(mol('methane')).centres[0].regular).toBe(true)
    expect(molShape(mol('water')).geometry).toBe('bent')
    expect(molShape(mol('ethanol')).main).toBe(null)
  })

  it('dipole from the partial charges equals Σ q r (1e-9 D); without charges it is a flagged estimate', () => {
    for (const m of molecules.filter(x => x.charges)) {
      const d = molShape(m).dipole!
      const r = ref.molecules[m.id].dipole
      expect(d.source).toBe('charges')
      expect(Math.abs(d.magnitude - r.magnitude)).toBeLessThan(1e-9)
      for (let k = 0; k < 3; k++) expect(Math.abs(d.vector[k] - r.vector[k])).toBeLessThan(1e-9)
    }
    const co2 = molShape(mol('carbon-dioxide'))
    expect(co2.dipole!.source).toBe('bonds')
    expect(co2.dipole!.magnitude).toBeLessThan(1e-9)
    expect(co2.diagnostics.some(d => d.code === 'mol.dipoleEstimated' && d.severity === 'approx')).toBe(true)
    expect(co2.bonds[0].kind).toBe('polar')
    expect(co2.bonds[0].negative).toBe(1)
    // Water without its charges: the estimate is near the measured 1.85 D (stated as an estimate: within 0.3 D)
    const w = molShape({ ...mol('water'), charges: null })
    expect(Math.abs(w.dipole!.magnitude - 1.85)).toBeLessThan(0.3)
    expect(molShape(mol('sulfur-hexafluoride')).dipole!.magnitude).toBeLessThan(1e-9)
  })

  it('gives the frame, the radii and the mass', () => {
    const b = molShape(mol('benzene'))
    // Planar: no extent along the third axis, which is the ring's normal (z in the fixture)
    expect(b.extent[2]).toBeLessThan(1e-6)
    expect(Math.abs(Math.abs(b.axes[8]) - 1)).toBeLessThan(1e-9)
    expect(Math.abs(b.radius - (1.397 + 1.084))).toBeLessThan(1e-6)
    expect(Math.abs(b.mass - (6 * 12.011 + 6 * 1.008))).toBeLessThan(1e-9)
    expect(Array.from(b.radii.vdw.slice(0, 1))).toEqual([1.7])
    expect(b.centres.every(c => c.class === 'AX3' && c.lonePairs === 0)).toBe(true)
  })
})

describe('mol crystals', () => {
  it('density, coordination number and nearest distance agree with the references', () => {
    for (const c of crystals) {
      const b = built(c.id), r = ref.crystals[c.id]
      // Density from the cell contents with independent atomic weights: 1e-9 relative
      expect(Math.abs(b.density / r.density - 1), c.id).toBeLessThan(1e-9)
      expect(Math.abs(b.cell.volume - r.volume)).toBeLessThan(1e-9)
      expect(b.sites.length).toBe(r.atoms)
      expect(b.sites[0].number, c.id).toBe(r.cn)
      // the reference gives the shortest contact of the first site
      if (r.nearest) expect(Math.abs(b.sites[0].nearest - r.nearest)).toBeLessThan(1e-9)
      if (r.packing) expect(Math.abs(b.packing! - r.packing)).toBeLessThan(1e-9)
      else expect(b.species.length === 1 ? b.packing !== null : b.packing === null).toBe(true)
    }
    // The closed forms of the brief
    expect(Math.abs(built('nacl').density - 2.165)).toBeLessThan(2e-3)
    expect(built('cu').packing!.toFixed(4)).toBe('0.7405')
    expect(built('fe').packing!.toFixed(4)).toBe('0.6802')
    expect(built('c-diamond').packing!.toFixed(4)).toBe('0.3401')
    const hcp = crystalBuild({ structure: 'hcp', element: 'Mg', a: 3.2 }) as CrystalBuild
    expect(hcp.packing!.toFixed(4)).toBe('0.7405')
    expect([built('cu').sites[0].number, built('fe').sites[0].number, hcp.sites[0].number, built('c-diamond').sites[0].number]).toEqual([12, 8, 12, 4])
  })

  it('expands with the boundary atoms, draws the bonds and the polyhedron', () => {
    const one = built('nacl')
    expect([one.count, one.bonds.ij.length / 2, one.edges.outer]).toEqual([27, 54, 12])
    const b = built('nacl', { n: [2, 2, 2], polyhedron: 'auto' })
    expect(b.count).toBe(125)
    expect(b.xyz.length).toBe(375)
    expect(b.radiusModel).toBe('ionic')
    expect(b.species.map(s => [s.symbol, s.charge, s.rfill])).toEqual([['Na', 1, 1.02], ['Cl', -1, 1.81]])
    const p = b.polyhedron!
    expect([p.number, p.shape, p.faces.length, p.element]).toEqual([6, 'octahedron', 8, 'Na'])
    expect(Math.abs(p.distance - 2.82)).toBeLessThan(1e-12)
    expect(Array.from(p.index).every(i => i >= 0)).toBe(true)
    expect((built('cu', { n: [2, 2, 2], polyhedron: 'auto' }).polyhedron!).shape).toBe('cuboctahedron')
    expect((built('mg', { n: [2, 2, 2], polyhedron: 'auto' }).polyhedron!).shape).toBe('anticuboctahedron')
    // The generated basis equals the explicit one of the fixture
    const gen = crystalBuild({ structure: 'rock-salt', species: ['Na', 'Cl'], a: 5.64 }) as CrystalBuild
    expect(gen.density).toBe(one.density)
    const odd = crystalBuild({ structure: 'no-such-type', element: 'Mn', a: 8.9 })
    expect(odd.ok).toBe(false)
    expect(odd.diagnostics[0].severity).toBe('unmodelled')
  })
})

describe('mol orbitals', () => {
  it('ψ agrees with scipy at the reference points (1e-10 relative), nodes are n − l − 1', () => {
    const at: number[] = ref.orbitals.points
    for (const c of ref.orbitals.cases) {
      const o = orbitalSample(c.n, c.l, c.m, { Z: c.Z, count: 0, at })
      c.psi.forEach((v: number, k: number) => expect(Math.abs(o.psi![k] - v), `${c.n}${c.l}${c.m}`).toBeLessThan(1e-10 * Math.max(Math.abs(v), 1e-3)))
      expect([o.radialNodes, o.angularNodes, o.nodes]).toEqual([c.n - c.l - 1, c.l, c.n - 1])
      expect(o.nodeRadii.length).toBe(c.radialNodes)
      expect(Math.abs(o.meanRadius - c.meanRadius)).toBeLessThan(1e-12)
      // Normalisation: the numerical integral of the radial distribution over the grid (tail < 1e-9)
      expect(Math.abs(o.enclosed - 1)).toBeLessThan(1e-8)
    }
    expect(ref.orbitals.cases.length).toBe(32)
  })

  it('the sampled cloud follows the density and is reproducible', () => {
    const o = orbitalSample(3, 2, 0, { count: 20000 })
    expect([o.key, o.subshell, o.count, o.xyz.length, o.sign.length]).toEqual(['dz2', '3d', 20000, 60000, 20000])
    let mean = 0, inside = 0
    for (let i = 0; i < o.count; i++) {
      const r = Math.hypot(o.xyz[3 * i], o.xyz[3 * i + 1], o.xyz[3 * i + 2])
      mean += r / o.count
      if (r <= o.r90) inside++
    }
    // ⟨r⟩ within 2 % (standard error 0.3 %), and nine tenths of the points inside r90 (within 1 %)
    expect(Math.abs(mean / o.meanRadius - 1)).toBeLessThan(0.02)
    expect(Math.abs(inside / o.count - 0.9)).toBeLessThan(0.01)
    // The trapezoid sum of the returned curve P(r) is the normalisation again (257 points: 1e-4)
    let sum = 0
    for (let k = 1; k < o.radial.r.length; k++) sum += (o.radial.P[k] + o.radial.P[k - 1]) / 2 * (o.radial.r[k] - o.radial.r[k - 1])
    expect(Math.abs(sum - 1)).toBeLessThan(1e-4)
    const again = orbitalSample(3, 2, 0, { count: 200 })
    expect(Array.from(again.xyz)).toEqual(Array.from(o.xyz.slice(0, 600)))
    expect(Array.from(orbitalSample(3, 2, 0, { count: 200, seed: 5 }).xyz)).not.toEqual(Array.from(again.xyz))
    expect(() => orbitalSample(2, 2, 0)).toThrow()
  })
})

describe('mol data files', () => {
  it('every molecule and crystal of the encyclopedia goes through the core', async () => {
    const mols = await loadMolecules(), crys = await loadCrystals()
    expect(mols.length).toBeGreaterThan(400)
    let centres = 0
    for (const m of mols) {
      const s = molShape(m)
      expect(s.count).toBe(m.atoms.length)
      expect(Number.isFinite(s.radius) && Number.isFinite(s.mass), m.id).toBe(true)
      expect(s.diagnostics.filter(d => d.code === 'mol.unknownElement'), m.id).toEqual([])
      centres += s.centres.length
    }
    expect(centres).toBeGreaterThan(mols.length)
    for (const c of crys) {
      const b = crystalBuild(c, { n: [2, 2, 2], polyhedron: 'auto' })
      expect(b.ok, c.id).toBe(true)
      if (b.ok) { expect(b.density).toBeGreaterThan(0.5); expect(b.count).toBeGreaterThan(b.sites.length) }
    }
  })
})
