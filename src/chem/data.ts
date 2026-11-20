/**
 * The element, molecule and crystal data of the encyclopedia (26.64, D262, D271): the types of the three files that
 * scripts/chem/build_elements.py, build_molecules.py and build_crystals.py write into `src/chem/data/`, and loaders
 * that fetch each file on first use. Every value comes from a recorded source (docs/chem/DATA_SOURCES.md); a missing
 * value is `null`, never a guess.
 *
 * `import.meta.glob` makes each file a chunk of its own, so none of them is part of the start-up bundle, and keeps the
 * type check from reading megabytes of JSON.
 */
import type { Tri } from '../i18n/tri'

// ---- elements.json ----

export type ElementCategory = 'alkali-metal' | 'alkaline-earth' | 'transition-metal' | 'post-transition-metal' | 'metalloid'
  | 'reactive-nonmetal' | 'halogen' | 'noble-gas' | 'lanthanide' | 'actinide'
export type StandardState = 'solid' | 'liquid' | 'gas'
/** Structure of the solid element: the first five can be generated from the key and the lattice constants alone. */
export type ElementStructure = 'fcc' | 'bcc' | 'hcp' | 'diamond' | 'sc' | 'hexagonal' | 'tetragonal' | 'orthorhombic' | 'rhombohedral' | 'cubic' | 'monoclinic'

export interface ElementRecord {
  z: number
  symbol: string
  name: Tri
  /** Standard atomic weight; the mass number of the most stable isotope when `massIsMassNumber`. */
  mass: number
  massIsMassNumber: boolean
  /** 1–18; null for the lanthanides (57–71) and actinides (89–103). */
  group: number | null
  period: number
  block: 's' | 'p' | 'd' | 'f'
  category: ElementCategory
  /** Ground state, e.g. `[Ar] 3d5 4s1`. */
  configuration: string
  /** True beyond the elements whose ground state NIST lists (z > 108). */
  configurationPredicted: boolean
  /** `[n, l, electrons]` for every occupied subshell, core included. */
  subshells: Array<[number, number, number]>
  oxidationStates: { common: number[]; other: number[] }
  /** Pauling scale. */
  electronegativity: number | null
  /** pm. */
  radius: { atomic: number | null; covalent: number | null; covalentDouble: number | null; covalentTriple: number | null; vdw: number | null }
  /** First ionisation energy. */
  ionisation: { eV: number; kJmol: number } | null
  /** eV. */
  electronAffinity: number | null
  /** K at 101.325 kPa; `boil` is a sublimation point when `sublimes`. */
  melt: number | null
  boil: number | null
  sublimes: boolean
  /** The allotrope the melting and boiling point refer to, where the source names one. */
  allotrope: string | null
  /** At 25 °C and 101.325 kPa. */
  state: StandardState | null
  /** g/cm³ of the phase `densityPhase` (gases: ideal gas at 25 °C). */
  density: number | null
  densityPhase: StandardState | null
  /** Lattice constants in ångström, `alpha` in degrees (rhombohedral cells). */
  crystal: { structure: ElementStructure; a: number | null; b: number | null; c: number | null; alpha: number | null } | null
  discovery: { year: number | null; by: string | null; ancient: boolean }
  /** mg/kg in the Earth's crust. */
  abundanceCrust: number | null
  /** Naturally occurring isotopes with their abundance in percent; one entry with `abundance: null` otherwise. */
  isotopes: Array<{ a: number; abundance: number | null }>
  /** Visible lines in nm (textbook values, a few elements only). */
  emissionLines?: number[]
}

export interface DataSource { package: string | null; table: string; citation: string | null; note?: string }

export interface ElementsFile {
  format: 'velophi-elements'
  version: 1
  generator: Record<string, string>
  /** Where each field comes from, by field name (`radius.covalent`, `name.zh` …). */
  sources: Record<string, DataSource>
  elements: ElementRecord[]
}

// ---- molecules.json ----

export type MoleculeMethod = 'rdkit-etkdg-mmff' | 'rdkit-etkdg-uff' | 'vsepr' | 'literature'

export interface MoleculeRecord {
  id: string
  /** Display formula, e.g. `C2H5OH`, `SO4^2-`. */
  formula: string
  name: Tri
  /** A key of `MoleculesFile.categories`. */
  category: string
  /** Id of the same substance in the species list of the reaction engine, where linked. */
  species: string | null
  smiles: string | null
  atoms: string[]
  /** `x0, y0, z0, x1, …` in ångström, centred on the centroid. */
  xyz: number[]
  /** `i, j, order, …` with order 1, 2, 3 or 1.5 (aromatic). */
  bonds: number[]
  /** Gasteiger partial charge per atom (e); null where the scheme has no parameters. */
  charges: number[] | null
  /** Net charge. */
  charge: number
  method: MoleculeMethod
  /** Keys of `MoleculesFile.references` for the published lengths and angles (methods `literature` and `vsepr`). */
  sources?: string[]
}

export interface MoleculesFile {
  format: 'velophi-molecules'
  version: 1
  generator: Record<string, string | number>
  /** The categories in display order. */
  categories: Array<{ id: string; name: Tri }>
  /** Citations by key. */
  references: Record<string, string>
  molecules: MoleculeRecord[]
}

// ---- crystals.json ----

export interface CrystalRecord {
  id: string
  name: Tri
  formula: string
  system: 'cubic' | 'tetragonal' | 'orthorhombic' | 'hexagonal' | 'trigonal'
  /** Structure type, e.g. `rock-salt`, `fluorite`, `fcc`. */
  structure: string
  /** ångström and degrees (trigonal cells on hexagonal axes). */
  a: number; b: number; c: number
  alpha: number; beta: number; gamma: number
  /** Every atom of the conventional cell in fractional coordinates. */
  basis: Array<[string, number, number, number]>
  /** Citation of the lattice constants and positions. */
  source: string
  /** What is idealised or left out (perovskite, ice). */
  note?: Tri
}

export interface CrystalsFile {
  format: 'velophi-crystals'
  version: 1
  generator: Record<string, string>
  crystals: CrystalRecord[]
}

// ---- Loading ----

const FILES = import.meta.glob<{ default: unknown }>(['./data/elements.json', './data/molecules.json', './data/crystals.json'])
const loaded = new Map<string, Promise<unknown>>()

function load<T extends { format: string }>(name: string, format: T['format'], key: string): Promise<T> {
  let p = loaded.get(name)
  if (!p) {
    const file = FILES[`./data/${name}`]
    p = file
      ? file().then(m => {
        const doc = m.default as Record<string, unknown> | null
        if (doc?.format !== format || !Array.isArray(doc[key])) throw new Error(`${name}: not a ${format} file`)
        return doc
      })
      : Promise.reject(new Error(`${name}: the data file is not part of this build`))
    // A failed load may be tried again
    p.catch(() => loaded.delete(name))
    loaded.set(name, p)
  }
  return p as Promise<T>
}

/** The 118 elements with the source of every field (loaded once, on first use). */
export function loadElementData(): Promise<ElementsFile> { return load<ElementsFile>('elements.json', 'velophi-elements', 'elements') }
/** The molecules and polyatomic ions with their categories and citations (loaded once, on first use). */
export function loadMoleculeData(): Promise<MoleculesFile> { return load<MoleculesFile>('molecules.json', 'velophi-molecules', 'molecules') }
/** The crystal structures (loaded once, on first use). */
export function loadCrystalData(): Promise<CrystalsFile> { return load<CrystalsFile>('crystals.json', 'velophi-crystals', 'crystals') }
