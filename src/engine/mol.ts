/**
 * Molecules, crystals and orbitals of the Rust core (26.64, D271; engine/velophi-chem/src/mol, engine/CHEM.md
 * "Molecule operations"). Every function is one stateless `calc` request: the 3D viewer only draws — distances,
 * angles, VSEPR classes, dipoles, crystal cells, coordination polyhedra, densities and orbital clouds are computed
 * there. Lengths are ångström, angles degrees, dipoles debye.
 *
 * The data files (`src/chem/data/molecules.json`, `crystals.json`) are loaded on first use, never with the first
 * screen.
 */
import type { CrystalRecord, MoleculeRecord } from '../chem/data'
import { calc } from './core'

export type { CrystalRecord, MoleculeRecord } from '../chem/data'

// ---- Data files ----

/**
 * What the core needs to build a cell: an explicit basis, or a structure type with its species — one `element` for the
 * element structures (`{ structure: 'fcc', element: 'Cu', a: 3.615 }`; `hcp` with `a` and `c`), `species` in the order
 * of the type for compounds (`rock-salt`: cation, anion).
 */
export interface CrystalSpec {
  structure?: string
  element?: string
  species?: string[]
  a: number; b?: number; c?: number
  alpha?: number; beta?: number; gamma?: number
  /** Internal parameter of wurtzite and rutile. */
  u?: number
  basis?: Array<[string, number, number, number]>
}

/** Element properties a request may override (the core has sourced defaults; engine/CHEM.md). */
export type ElementOverrides = Record<string, { mass?: number; en?: number; rcov?: number; rvdw?: number; rion?: number }>

/** A diagnostic of the chemistry core. */
export interface ChemDiagnostic { code: string; severity: 'info' | 'approx' | 'unmodelled' | 'error'; path?: string; params?: Record<string, unknown> }

/** The molecules of the encyclopedia (src/chem/data.ts loads the file on first use, as a chunk of its own). */
export async function loadMolecules(): Promise<MoleculeRecord[]> { return (await (await import('../chem/data')).loadMoleculeData()).molecules }
/** The crystals of the encyclopedia. */
export async function loadCrystals(): Promise<CrystalRecord[]> { return (await (await import('../chem/data')).loadCrystalData()).crystals }

/** The request form of a crystal record. */
export function crystalSpec(c: CrystalRecord | CrystalSpec): CrystalSpec {
  const { structure, a, b, c: cc, alpha, beta, gamma, basis } = c
  const s = c as CrystalSpec
  return { structure, element: s.element, species: s.species, a, b, c: cc, alpha, beta, gamma, u: s.u, basis }
}

// ---- Measurements ----

export type MolMeasurement =
  | { kind: 'distance'; atoms: number[]; distance: number; distancePm: number }
  | { kind: 'angle'; atoms: number[]; angle: number; legs: [number, number] }
  | { kind: 'dihedral'; atoms: number[]; dihedral: number | null }

/**
 * Distance of two points, the angle of three (at the second) or the dihedral of four (IUPAC sign), from their
 * coordinates (flat, ångström).
 */
export function molMeasure(points: ArrayLike<number>): MolMeasurement {
  const xyz = Array.from(points)
  const pick = Array.from({ length: xyz.length / 3 }, (_, i) => i)
  return calc<{ pick: MolMeasurement }>({ op: 'molMeasure', xyz, pick }).pick
}

/** Bond lengths and bond angles of a molecule: bonds in the order given, angles i–j–k with j the vertex. */
export interface MolGeometry {
  bonds: { ij: Int32Array; order: Float64Array; length: Float64Array }
  angles: { ijk: Int32Array; angle: Float64Array }
}

export function molGeometry(xyz: ArrayLike<number>, bonds: ArrayLike<number>): MolGeometry {
  return calc<MolGeometry>({ op: 'molMeasure', xyz: Array.from(xyz), bonds: Array.from(bonds) })
}

// ---- Shape ----

/** Geometry keys of the VSEPR classes (the viewer holds their names in three languages). */
export type GeometryKey = 'linear' | 'bent' | 'trigonalPlanar' | 'trigonalPyramidal' | 'tShaped' | 'tetrahedral' | 'seesaw' | 'squarePlanar'
  | 'trigonalBipyramidal' | 'squarePyramidal' | 'pentagonalPlanar' | 'octahedral' | 'pentagonalPyramidal' | 'pentagonalBipyramidal' | 'trigonalPrismatic'

/** A central atom: its electron-pair count, class and geometry, and where its lone pairs point. */
export interface MolCentre {
  atom: number
  element: string
  neighbours: number[]
  bonded: number
  lonePairs: number
  steric: number
  /** AX2E2 …; null where electron counting does not apply (d- and f-block centres). */
  class: string | null
  geometry: GeometryKey | null
  electronGeometry: GeometryKey | null
  /** The geometry read from the coordinates. */
  observed: GeometryKey | null
  regular: boolean
  ideal: number[]
  angles: number[]
  /** Unit directions of the lone-pair lobes, and nominal lobe centres just outside the covalent radius. */
  lobes: Array<[number, number, number]>
  lobePoints: Array<[number, number, number]>
}

export interface MolBond {
  i: number; j: number; order: number; length: number
  deltaEN: number | null
  /** The more electronegative atom (δ−). */
  negative: number | null
  kind: 'nonpolar' | 'polar' | 'ionic' | 'unknown'
  ionicCharacter: number | null
}

export interface MolShape {
  count: number
  /** Molar mass (g/mol). */
  mass: number
  lonePairs: number[]
  centres: MolCentre[]
  /** Index into `centres` of the atom that names the molecule's shape (the only centre), and that geometry. */
  main: number | null
  geometry: GeometryKey | null
  bonds: MolBond[]
  /** Physics convention: `vector` points from the negative to the positive charge. `source: 'bonds'` is an estimate. */
  dipole: { vector: [number, number, number]; magnitude: number; source: 'charges' | 'bonds'; origin: [number, number, number] } | null
  centre: [number, number, number]
  /** Principal axes, rows, by descending extent (right-handed). */
  axes: number[]
  extent: [number, number, number]
  radius: number
  radiusVdw: number
  radii: { covalent: Float64Array; vdw: Float64Array }
  en: Array<number | null>
  diagnostics: ChemDiagnostic[]
}

/** VSEPR classes, lone pairs, bond polarity, dipole and the viewing frame of a molecule. */
export function molShape(mol: { atoms: string[]; xyz: ArrayLike<number>; bonds: ArrayLike<number>; charges?: ArrayLike<number> | null; formal?: ArrayLike<number> | null }, elements?: ElementOverrides): MolShape {
  const req: { op: string } & Record<string, unknown> = { op: 'molShape', atoms: mol.atoms, xyz: Array.from(mol.xyz), bonds: Array.from(mol.bonds) }
  if (mol.charges) req.charges = Array.from(mol.charges)
  if (mol.formal) req.formal = Array.from(mol.formal)
  if (elements) req.elements = elements
  return calc<MolShape>(req)
}

// ---- Crystals ----

/** Names of coordination polyhedra (keys). */
export type PolyhedronKey = 'linear' | 'triangle' | 'square' | 'tetrahedron' | 'trigonalBipyramid' | 'squarePyramid' | 'octahedron' | 'trigonalPrism' | 'cube' | 'squareAntiprism' | 'cuboctahedron' | 'anticuboctahedron' | 'icosahedron'

export interface CrystalPolyhedron {
  /** The central atom (index into the block). */
  atom: number
  element: string
  /** Coordination number. */
  number: number
  distance: number
  distanceMax: number
  shape: PolyhedronKey | null
  /** Vertex positions (flat), the displayed atom at each vertex (−1: outside the block), its species. */
  vertices: Float64Array
  index: Int32Array
  kind: Int32Array
  /** Faces as vertex loops, counter-clockwise seen from outside. */
  faces: number[][]
}

export interface CrystalBuild {
  ok: true
  structure: string | null
  cell: { a: number; b: number; c: number; alpha: number; beta: number; gamma: number; vectors: number[]; volume: number }
  species: Array<{ symbol: string; mass: number; rcov: number; rvdw: number; rfill: number; charge: number | null; count: number; formula: number }>
  /** Where `rfill` comes from: ionic radii of the request, touching spheres, Shannon radii, or van der Waals radii. */
  radiusModel: 'given' | 'touching' | 'ionic' | 'vdw'
  sites: Array<{ element: string; frac: [number, number, number]; number: number; nearest: number; farthest: number }>
  n: [number, number, number]
  count: number
  /** Species index, basis site and position of every displayed atom. */
  kind: Int32Array
  site: Int32Array
  xyz: Float64Array
  bonds: { ij: Int32Array; length: Float64Array }
  /** Cell edges as segments (x0, y0, z0, x1, y1, z1); the first `outer` are the edges of the block. */
  edges: { xyz: Float64Array; outer: number }
  polyhedron: CrystalPolyhedron | null
  /** g/cm³ */
  density: number
  cellMass: number
  formulaUnits: number
  /** Packing fraction of touching spheres (one element), else null. */
  packing: number | null
  nearest: number | null
  centre: [number, number, number]
  radius: number
  diagnostics: ChemDiagnostic[]
}

/** A structure the core cannot generate (it needs an explicit basis). */
export interface CrystalUnknown { ok: false; structure: string; diagnostics: ChemDiagnostic[] }

export interface CrystalOptions {
  /** Cells along a, b and c. */
  n?: [number, number, number]
  /** Coordination polyhedron of an atom of the block, or of the default atom. */
  polyhedron?: number | 'auto' | null
  tolerance?: number
  bondScale?: number
  elements?: ElementOverrides
}

/** The cell of a crystal expanded to n₁ × n₂ × n₃ cells, with bonds, cell edges, a polyhedron, density and packing. */
export function crystalBuild(spec: CrystalSpec, opts: CrystalOptions = {}): CrystalBuild | CrystalUnknown {
  const req: { op: string } & Record<string, unknown> = { op: 'crystalBuild' }
  for (const [k, v] of Object.entries(crystalSpec(spec))) if (v !== undefined && v !== null) req[k] = v
  for (const [k, v] of Object.entries(opts)) if (v !== undefined && v !== null) req[k] = v
  return calc<CrystalBuild | CrystalUnknown>(req)
}

// ---- Orbitals ----

export interface OrbitalSample {
  n: number; l: number; m: number; Z: number
  /** Angular part: 's', 'pz', 'dx2-y2' … */
  key: string
  /** '3d' … */
  subshell: string
  count: number
  seed: number
  /** Points drawn from |ψ|² (flat, ångström) and the sign of ψ at each (1: positive). */
  xyz: Float64Array
  sign: Uint8Array
  /** R(r) (Å^−3/2) and the radial distribution P(r) = r²R² (Å^−1) on 257 radii from 0 to rMax. */
  radial: { r: Float64Array; R: Float64Array; P: Float64Array }
  /** ∫P dr over the grid: 1 up to the neglected tail. */
  enclosed: number
  rMax: number; r50: number; r90: number; r99: number
  peakRadius: number
  meanRadius: number
  radialNodes: number
  nodeRadii: number[]
  angularNodes: number
  nodes: number
  energyEv: number
  bohr: number
  /** ψ at the points of `at` (Å^−3/2). */
  psi?: number[]
}

/** A hydrogen-like orbital ψ_nlm (real spherical harmonics, n ≤ 4): a seeded point cloud, the radial curves, the nodes. */
export function orbitalSample(n: number, l: number, m: number, opts: { Z?: number; count?: number; seed?: number; at?: ArrayLike<number> } = {}): OrbitalSample {
  const req: { op: string } & Record<string, unknown> = { op: 'orbitalSample', n, l, m }
  if (opts.Z !== undefined) req.Z = opts.Z
  if (opts.count !== undefined) req.count = opts.count
  if (opts.seed !== undefined) req.seed = opts.seed
  if (opts.at) req.at = Array.from(opts.at)
  return calc<OrbitalSample>(req)
}
