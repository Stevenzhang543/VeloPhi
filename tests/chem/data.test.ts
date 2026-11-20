/**
 * The element, molecule and crystal data files (26.64, D260, D262, D271): shape, counts, three-language names, and
 * spot values against textbook constants with the tolerance stated at each comparison. The exhaustive checks (bond
 * length of every bond, valences, charges, crystal contacts) are made by scripts/chem/check_data.py; its report is a
 * fixture, and the test below ties that report to the files in the tree by their SHA-256.
 */
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadCrystalData, loadElementData, loadMoleculeData } from '../../src/chem/data'
import type { CrystalRecord, ElementRecord, MoleculeRecord } from '../../src/chem/data'

const root = join(__dirname, '..', '..')
const bytes = (p: string) => readFileSync(join(root, p))

const [elementsFile, moleculesFile, crystalsFile] = await Promise.all([loadElementData(), loadMoleculeData(), loadCrystalData()])
const elements = elementsFile.elements
const molecules = moleculesFile.molecules
const crystals = crystalsFile.crystals
const el = (s: string) => elements.find(e => e.symbol === s) as ElementRecord
const mol = (id: string) => molecules.find(m => m.id === id) as MoleculeRecord
const crystal = (id: string) => crystals.find(c => c.id === id) as CrystalRecord

const dist = (m: MoleculeRecord, i: number, j: number) => Math.hypot(m.xyz[3 * i] - m.xyz[3 * j], m.xyz[3 * i + 1] - m.xyz[3 * j + 1], m.xyz[3 * i + 2] - m.xyz[3 * j + 2])
function angle(m: MoleculeRecord, i: number, j: number, k: number) {
  const a = [0, 1, 2].map(t => m.xyz[3 * i + t] - m.xyz[3 * j + t]), b = [0, 1, 2].map(t => m.xyz[3 * k + t] - m.xyz[3 * j + t])
  return Math.acos((a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b))) * 180 / Math.PI
}
/** Lengths of the bonds between two elements, optionally of one order. */
function bondLengths(m: MoleculeRecord, a: string, b: string, order?: number) {
  const out: number[] = []
  for (let k = 0; k < m.bonds.length; k += 3) {
    const i = m.bonds[k], j = m.bonds[k + 1]
    const pair = [m.atoms[i], m.atoms[j]].sort().join()
    if (pair === [a, b].sort().join() && (order === undefined || m.bonds[k + 2] === order)) out.push(dist(m, i, j))
  }
  return out
}
const unique = (xs: string[]) => new Set(xs).size === xs.length

describe('elements.json', () => {
  it('has the 118 elements in order with unique names in three languages', () => {
    expect(elementsFile.format).toBe('velophi-elements')
    expect(elements.length).toBe(118)
    expect(elements.map(e => e.z)).toEqual(Array.from({ length: 118 }, (_, i) => i + 1))
    for (const lang of ['zh', 'en', 'de'] as const) {
      const names = elements.map(e => e.name[lang])
      expect(names.every(n => typeof n === 'string' && n.length > 0)).toBe(true)
      expect(unique(names)).toBe(true)
    }
    expect(elements.every(e => [...e.name.zh].length === 1)).toBe(true)
    expect([el('H').name, el('Fe').name, el('Og').name]).toEqual([{ zh: '氢', en: 'Hydrogen', de: 'Wasserstoff' }, { zh: '铁', en: 'Iron', de: 'Eisen' }, { zh: '鿫', en: 'Oganesson', de: 'Oganesson' }])
    expect([el('Al').name.en, el('Cs').name.en, el('I').name.de, el('Si').name.de]).toEqual(['Aluminium', 'Caesium', 'Iod', 'Silicium'])
  })

  it('records a source for every field and keeps every record whole', () => {
    for (const k of ['mass', 'configuration', 'electronegativity', 'radius.covalent', 'ionisation', 'melt', 'density', 'crystal', 'isotopes', 'emissionLines', 'name.zh']) {
      expect(elementsFile.sources[k], k).toBeTruthy()
      expect(typeof elementsFile.sources[k].table).toBe('string')
    }
    for (const e of elements) {
      expect(e.subshells.reduce((s, x) => s + x[2], 0), e.symbol).toBe(e.z)
      expect(e.mass > 0 && e.period >= 1 && e.period <= 7, e.symbol).toBe(true)
      expect(e.group === null ? ['lanthanide', 'actinide'].includes(e.category) : e.group >= 1 && e.group <= 18, e.symbol).toBe(true)
      expect(e.isotopes.length, e.symbol).toBeGreaterThan(0)
    }
    expect(elements.filter(e => e.category === 'lanthanide').length).toBe(15)
    expect(elements.filter(e => e.category === 'actinide').length).toBe(15)
  })

  it('agrees with textbook constants', () => {
    // Standard atomic weights (IUPAC; the file keeps six decimals)
    expect([el('H').mass, el('C').mass, el('O').mass, el('Na').mass, el('Cl').mass, el('Fe').mass, el('Cu').mass]).toEqual([1.008, 12.011, 15.999, 22.989769, 35.45, 55.845, 63.546])
    expect([el('Tc').mass, el('Tc').massIsMassNumber, el('U').massIsMassNumber]).toEqual([98, true, false])
    // Ground-state exceptions
    expect([el('Cr').configuration, el('Cu').configuration, el('Pd').configuration, el('Au').configuration]).toEqual(['[Ar] 3d5 4s1', '[Ar] 3d10 4s1', '[Kr] 4d10', '[Xe] 4f14 5d10 6s1'])
    // Pauling electronegativities, exact
    expect([el('F').electronegativity, el('O').electronegativity, el('Na').electronegativity, el('He').electronegativity]).toEqual([3.98, 3.44, 0.93, null])
    // First ionisation energies: H 13.598 eV = 1312.0 kJ/mol, He 24.587 eV, Na 5.139 eV (tolerance 0.001 eV, 0.1 kJ/mol)
    expect(el('H').ionisation!.eV).toBeCloseTo(13.598, 3)
    expect(el('H').ionisation!.kJmol).toBeCloseTo(1312.0, 1)
    expect(el('He').ionisation!.eV).toBeCloseTo(24.587, 3)
    expect(el('Na').ionisation!.eV).toBeCloseTo(5.139, 3)
    // Melting points: Fe 1811 K, Hg 234.32 K, W 3687 K (tolerance 1 K)
    expect(Math.abs(el('Fe').melt! - 1811)).toBeLessThan(1)
    expect(Math.abs(el('Hg').melt! - 234.32)).toBeLessThan(0.1)
    expect(Math.abs(el('W').melt! - 3687)).toBeLessThan(1)
    // States at 25 °C
    expect(elements.filter(e => e.state === 'liquid').map(e => e.symbol)).toEqual(['Br', 'Hg'])
    expect(elements.filter(e => e.state === 'gas').map(e => e.symbol)).toEqual(['H', 'He', 'N', 'O', 'F', 'Ne', 'Cl', 'Ar', 'Kr', 'Xe', 'Rn'])
    // Densities, g/cm³ (tolerance 1 %)
    for (const [s, rho] of [['Fe', 7.87], ['Au', 19.3], ['Hg', 13.53], ['Al', 2.70]] as const) expect(Math.abs(el(s).density! / rho - 1), s).toBeLessThan(0.01)
    // Crystal structures and lattice constants (Å, tolerance 0.01)
    expect([el('Cu').crystal!.structure, el('Fe').crystal!.structure, el('Mg').crystal!.structure, el('Si').crystal!.structure, el('Po').crystal!.structure]).toEqual(['fcc', 'bcc', 'hcp', 'diamond', 'sc'])
    expect(el('Cu').crystal!.a).toBeCloseTo(3.61, 2)
    expect(el('Mg').crystal!.c! / el('Mg').crystal!.a!).toBeCloseTo(1.624, 2)
    // Isotopes: chlorine 35 and 37 near 75.8 % and 24.2 % (tolerance 0.1), carbon-13 1.06 %
    expect(el('Cl').isotopes.map(i => i.a)).toEqual([35, 37])
    expect(Math.abs(el('Cl').isotopes[0].abundance! - 75.8)).toBeLessThan(0.1)
    expect(Math.abs(el('C').isotopes[1].abundance! - 1.06)).toBeLessThan(0.05)
    // Lines every textbook lists
    expect(el('Na').emissionLines).toEqual([589.0, 589.6])
    expect(el('H').emissionLines).toEqual([410.2, 434.0, 486.1, 656.3])
  })
})

describe('molecules.json', () => {
  it('has at least 400 well-formed records with unique ids and names', () => {
    expect(moleculesFile.format).toBe('velophi-molecules')
    expect(molecules.length).toBeGreaterThanOrEqual(400)
    expect(unique(molecules.map(m => m.id))).toBe(true)
    for (const lang of ['zh', 'en', 'de'] as const) {
      expect(molecules.every(m => typeof m.name[lang] === 'string' && m.name[lang].length > 0)).toBe(true)
      expect(unique(molecules.map(m => m.name[lang]))).toBe(true)
    }
    const categories = new Set(moleculesFile.categories.map(c => c.id))
    const symbols = new Set(elements.map(e => e.symbol))
    for (const m of molecules) {
      expect(/^[a-z][a-z0-9-]*$/.test(m.id), m.id).toBe(true)
      expect(categories.has(m.category), m.id).toBe(true)
      expect(m.atoms.length > 0 && m.atoms.every(a => symbols.has(a)), m.id).toBe(true)
      expect(m.xyz.length === 3 * m.atoms.length && m.xyz.every(Number.isFinite), m.id).toBe(true)
      expect(m.bonds.length % 3, m.id).toBe(0)
      for (let k = 0; k < m.bonds.length; k += 3) {
        expect(m.bonds[k] >= 0 && m.bonds[k] < m.bonds[k + 1] && m.bonds[k + 1] < m.atoms.length, m.id).toBe(true)
        expect([1, 1.5, 2, 3].includes(m.bonds[k + 2]), m.id).toBe(true)
      }
      expect(m.charges === null || m.charges.length === m.atoms.length, m.id).toBe(true)
      expect(Number.isInteger(m.charge), m.id).toBe(true)
      expect(['rdkit-etkdg-mmff', 'rdkit-etkdg-uff', 'vsepr', 'literature'].includes(m.method), m.id).toBe(true)
      if (m.method === 'literature') expect(m.sources!.length > 0 && m.sources!.every(s => typeof moleculesFile.references[s] === 'string'), m.id).toBe(true)
      // three decimals, centred on the centroid (tolerance: rounding)
      for (let t = 0; t < 3; t++) expect(Math.abs(m.xyz.filter((_, i) => i % 3 === t).reduce((s, v) => s + v, 0) / m.atoms.length), m.id).toBeLessThan(0.002)
    }
    expect(moleculesFile.categories.every(c => c.name.zh && c.name.en && c.name.de)).toBe(true)
  })

  it('covers what the encyclopedia promises', () => {
    const need = ['water', 'ammonia', 'methane', 'carbon-dioxide', 'sulfate', 'nitrate', 'ammonium', 'boron-trifluoride', 'phosphorus-pentachloride',
      'sulfur-hexafluoride', 'sulfur-tetrafluoride', 'chlorine-trifluoride', 'xenon-difluoride', 'xenon-tetrafluoride', 'iodine-pentafluoride', 'triiodide',
      'decane', 'benzene', 'toluene', 'phenol', 'aniline', 'naphthalene', 'styrene', 'nitrobenzene', 'ethanol', 'acetic-acid', 'ethyl-acetate',
      'glucose', 'fructose', 'sucrose', 'ribose', 'urea', 'glycerol', 'palmitic-acid', 'stearic-acid', 'oleic-acid', 'tristearin', 'adenine', 'thymine',
      'vinyl-chloride', 'tetrafluoroethene', 'methyl-methacrylate', 'caprolactam', 'ethylene-glycol', 'terephthalic-acid', 'lactic-acid',
      'phenolphthalein', 'methyl-orange', 'methyl-red', 'bromothymol-blue', 'edta', 'ethylenediamine', 'tetraamminecopper-ii', 'diamminesilver-i',
      'hexacyanoferrate-ii', 'hexacyanoferrate-iii', 'tetrahydroxoaluminate', 'pentaaquathiocyanatoiron-iii', 'ascorbic-acid']
    expect(need.filter(id => !mol(id))).toEqual([])
    const acids = ['glycine', 'alanine', 'valine', 'leucine', 'isoleucine', 'proline', 'phenylalanine', 'tryptophan', 'methionine', 'serine', 'threonine',
      'cysteine', 'tyrosine', 'asparagine', 'glutamine', 'aspartic-acid', 'glutamic-acid', 'lysine', 'arginine', 'histidine']
    expect(acids.filter(id => mol(id)?.category !== 'amino-acid')).toEqual([])
    // D274: none of these belongs in the data
    const never = ['sarin', 'tabun', 'soman', 'vx', 'mustard', 'sulfur-mustard', 'phosgene', 'hydrogen-cyanide', 'nitroglycerin', 'tnt', 'trinitrotoluene', 'rdx', 'petn', 'picric-acid', 'morphine', 'heroin', 'cocaine', 'methamphetamine', 'amphetamine', 'ephedrine', 'lsd', 'mdma']
    expect(never.filter(id => mol(id))).toEqual([])
  })

  it('agrees with textbook geometries', () => {
    // Water: O–H 0.958 Å, H–O–H 104.5° (accepted 0.94–0.98 Å, 103–106°)
    const w = mol('water')
    for (const d of bondLengths(w, 'O', 'H')) expect(d > 0.94 && d < 0.98).toBe(true)
    expect(angle(w, 1, 0, 2)).toBeGreaterThan(103)
    expect(angle(w, 1, 0, 2)).toBeLessThan(106)
    // Ammonia: N–H 1.012 Å, H–N–H 106.7° (tolerance 0.01 Å, 1°)
    const a = mol('ammonia')
    expect(Math.abs(dist(a, 0, 1) - 1.012)).toBeLessThan(0.01)
    expect(Math.abs(angle(a, 1, 0, 2) - 106.7)).toBeLessThan(1)
    // Methane: tetrahedral angle 109.47° (tolerance 0.3°)
    expect(Math.abs(angle(mol('methane'), 1, 0, 2) - 109.47)).toBeLessThan(0.3)
    // Carbon dioxide: linear, C=O 1.16 Å (tolerance 0.01 Å, 0.5°)
    const c = mol('carbon-dioxide')
    expect(Math.abs(dist(c, 0, 1) - 1.16)).toBeLessThan(0.01)
    expect(angle(c, 1, 0, 2)).toBeGreaterThan(179.5)
    // Ethane C–C 1.52–1.54 Å, ethene C=C 1.33–1.34 Å, ethyne C≡C 1.20–1.21 Å, benzene C–C 1.39–1.40 Å (all six equal to 0.005 Å)
    expect(bondLengths(mol('ethane'), 'C', 'C').every(d => d > 1.52 && d < 1.54)).toBe(true)
    expect(bondLengths(mol('ethene'), 'C', 'C').every(d => d > 1.33 && d < 1.345)).toBe(true)
    expect(bondLengths(mol('ethyne'), 'C', 'C').every(d => d > 1.20 && d < 1.21)).toBe(true)
    const cc = bondLengths(mol('benzene'), 'C', 'C', 1.5)
    expect(cc.length).toBe(6)
    expect(cc.every(d => d > 1.39 && d < 1.40)).toBe(true)
    expect(Math.max(...cc) - Math.min(...cc)).toBeLessThan(0.005)
    // VSEPR shapes: SF6 all F–S–F 90° or 180°; XeF4 planar; PCl5 axial bonds longer than equatorial; I3⁻ linear
    const sf6 = mol('sulfur-hexafluoride')
    for (let i = 1; i <= 6; i++) for (let j = i + 1; j <= 6; j++) { const t = angle(sf6, i, 0, j); expect(Math.min(Math.abs(t - 90), Math.abs(t - 180))).toBeLessThan(0.1) }
    expect(mol('xenon-tetrafluoride').xyz.filter((_, i) => i % 3 === 2).every(z => Math.abs(z) < 1e-3)).toBe(true)
    const pcl = bondLengths(mol('phosphorus-pentachloride'), 'P', 'Cl').sort()
    expect(pcl[4] - pcl[0]).toBeCloseTo(0.10, 2)
    expect(angle(mol('triiodide'), 1, 0, 2)).toBeGreaterThan(179.9)
    // Complexes: square-planar [Cu(NH3)4]2+ (N–Cu–N 90° and 180°), octahedral [Fe(CN)6]4− (13 atoms, charge −4)
    const cu = mol('tetraamminecopper-ii')
    const ns = cu.atoms.map((s, i) => s === 'N' ? i : -1).filter(i => i >= 0)
    expect(ns.length).toBe(4)
    for (const i of ns) for (const j of ns) if (i < j) { const t = angle(cu, i, 0, j); expect(Math.min(Math.abs(t - 90), Math.abs(t - 180))).toBeLessThan(0.1) }
    expect([cu.charge, mol('hexacyanoferrate-ii').charge, mol('hexacyanoferrate-ii').atoms.length, mol('sulfate').charge]).toEqual([2, -4, 13, -2])
    // Sulfate: four equal S–O near 1.47–1.49 Å, equal partial charges on the four oxygens
    const s = mol('sulfate')
    const so = bondLengths(s, 'S', 'O')
    expect(so.every(d => d > 1.46 && d < 1.50) && Math.max(...so) - Math.min(...so) < 0.005).toBe(true)
    expect(new Set(s.atoms.map((x, i) => x === 'O' ? s.charges![i] : null).filter(v => v !== null)).size).toBe(1)
    // Polarity of water from the partial charges: oxygen negative, the two hydrogens equal and positive
    expect(w.charges![0] < 0 && w.charges![1] > 0 && w.charges![1] === w.charges![2]).toBe(true)
    // C60: 60 atoms, 90 bonds, every atom 3.55 Å from the centre (tolerance 0.02 Å)
    const c60 = mol('fullerene-c60')
    expect([c60.atoms.length, c60.bonds.length / 3]).toEqual([60, 90])
    for (let i = 0; i < 60; i++) expect(Math.abs(Math.hypot(c60.xyz[3 * i], c60.xyz[3 * i + 1], c60.xyz[3 * i + 2]) - 3.55)).toBeLessThan(0.02)
  })
})

describe('crystals.json', () => {
  it('has at least 12 structures with complete cells and a citation each', () => {
    expect(crystalsFile.format).toBe('velophi-crystals')
    expect(crystals.length).toBeGreaterThanOrEqual(12)
    expect(unique(crystals.map(c => c.id))).toBe(true)
    for (const lang of ['zh', 'en', 'de'] as const) expect(unique(crystals.map(c => c.name[lang])) && crystals.every(c => c.name[lang].length > 0)).toBe(true)
    for (const c of crystals) {
      expect([c.a, c.b, c.c, c.alpha, c.beta, c.gamma].every(v => Number.isFinite(v) && v > 0), c.id).toBe(true)
      expect(c.basis.length > 0 && c.basis.every(b => b.length === 4 && b.slice(1).every(v => typeof v === 'number' && v >= 0 && v < 1)), c.id).toBe(true)
      expect(c.source.length, c.id).toBeGreaterThan(20)
    }
    for (const id of ['nacl', 'cscl', 'zns-sphalerite', 'zns-wurtzite', 'caf2', 'tio2-rutile', 'catio3', 'diamond', 'graphite', 'silicon', 'sio2-quartz', 'ice-ih', 'co2', 'copper', 'iron', 'magnesium']) expect(crystal(id), id).toBeTruthy()
    // What is idealised or left out is said in three languages
    expect(crystal('catio3').note!.en).toMatch(/[Ii]dealised/)
    expect(crystal('ice-ih').note!.en).toMatch(/disordered/)
    expect(crystal('ice-ih').basis.every(b => b[0] === 'O')).toBe(true)
  })

  it('agrees with textbook cells', () => {
    // Lattice constants in Å (tolerance 0.005): NaCl 5.640, CsCl 4.123, diamond 3.567, Si 5.431, Cu 3.615, Fe 2.867
    for (const [id, a] of [['nacl', 5.640], ['cscl', 4.123], ['diamond', 3.567], ['silicon', 5.431], ['copper', 3.615], ['iron', 2.867], ['caf2', 5.463]] as const) expect(Math.abs(crystal(id).a - a), id).toBeLessThan(0.005)
    // Atoms per conventional cell
    expect(['nacl', 'cscl', 'zns-sphalerite', 'caf2', 'diamond', 'copper', 'iron', 'magnesium', 'graphite', 'tio2-rutile', 'catio3', 'sio2-quartz', 'co2'].map(id => crystal(id).basis.length)).toEqual([8, 2, 8, 12, 8, 4, 2, 2, 4, 6, 5, 9, 12])
    // Formula units per cell: NaCl 4 + 4, fluorite 4 Ca + 8 F, rutile 2 Ti + 4 O
    const count = (id: string, s: string) => crystal(id).basis.filter(b => b[0] === s).length
    expect([count('nacl', 'Na'), count('nacl', 'Cl'), count('caf2', 'Ca'), count('caf2', 'F'), count('tio2-rutile', 'Ti'), count('tio2-rutile', 'O')]).toEqual([4, 4, 4, 8, 2, 4])
    // Densities from the cell: NaCl 2.165 g/cm³, diamond 3.51, copper 8.93 (tolerance 1 %)
    const mass = (s: string) => elements.find(e => e.symbol === s)!.mass
    const density = (id: string) => { const c = crystal(id); return c.basis.reduce((m, b) => m + mass(b[0]), 0) / 6.02214076e23 / (c.a * c.b * c.c * 1e-24) }
    for (const [id, rho] of [['nacl', 2.165], ['diamond', 3.51], ['copper', 8.93]] as const) expect(Math.abs(density(id) / rho - 1), id).toBeLessThan(0.01)
    // Hexagonal cells: γ = 120°, c/a of magnesium 1.624 (ideal 1.633; tolerance 0.002)
    expect([crystal('magnesium').gamma, crystal('graphite').gamma, crystal('sio2-quartz').gamma]).toEqual([120, 120, 120])
    expect(crystal('magnesium').c / crystal('magnesium').a).toBeCloseTo(1.624, 2)
  })
})

describe('scripts/chem/check_data.py', () => {
  const report = JSON.parse(readFileSync(join(root, 'tests/fixtures/chem/data-report.json'), 'utf8'))
  it('reported no violation for exactly these files', () => {
    for (const name of ['elements.json', 'molecules.json', 'crystals.json']) {
      expect(report.files[name].sha256, `${name}: rerun scripts/chem/check_data.py`).toBe(createHash('sha256').update(bytes(`src/chem/data/${name}`)).digest('hex'))
    }
    expect(report.violations).toEqual([])
    expect(report.counts).toEqual({ elements: elements.length, molecules: molecules.length, crystals: crystals.length })
    const byMethod: Record<string, number> = {}
    for (const m of molecules) byMethod[m.method] = (byMethod[m.method] ?? 0) + 1
    expect(report.moleculesByMethod).toEqual(byMethod)
  })

  it('keeps the molecule file small enough to load on demand', () => {
    expect(report.files['molecules.json'].bytes).toBeLessThan(1_500_000)
  })
})
