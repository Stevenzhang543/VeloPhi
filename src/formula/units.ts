/**
 * Physical dimensions as exponents of the seven SI base quantities (26.56, D99): length L, mass M, time T, electric
 * current I, thermodynamic temperature Θ, amount of substance N and luminous intensity J. Angles are dimensionless
 * (rad); whether a temperature is absolute or a difference is a semantic type of the quantity (units/units.ts), not
 * a dimension. Trailing zero exponents may be left out: [L, M, T] means [L, M, T, 0, 0, 0, 0]. (26.54, D78 used the
 * charge as a fourth base; 26.56 follows SI: C = A·s.) The table is the same as the Rust core's (expr.rs UNITS).
 */
import { tl } from '../i18n'
export type Dim = readonly number[]

/** Dimension of a pure number. */
export const DIMLESS: Dim = [0, 0, 0]

/** Number of base dimensions. */
export const BASE_DIMS = 7
const at = (d: Dim, k: number) => d[k] ?? 0

/** Equality of dimensions (exponents compared to 1e-12, as they may be fractional). */
export function dimEqual(a: Dim, b: Dim): boolean {
  for (let k = 0; k < BASE_DIMS; k++) if (Math.abs(at(a, k) - at(b, k)) >= 1e-12) return false
  return true
}
/** Dimension of a product. */
export function dimMul(a: Dim, b: Dim): Dim { return Array.from({ length: BASE_DIMS }, (_, k) => at(a, k) + at(b, k)) }
/** Dimension of a power. */
export function dimPow(a: Dim, p: number): Dim { return Array.from({ length: BASE_DIMS }, (_, k) => at(a, k) * p) }
/** All seven exponents. */
export function dimFull(a: Dim): number[] { return Array.from({ length: BASE_DIMS }, (_, k) => at(a, k)) }

/** Units of the formula language with their dimensions, in display preference order (first match is the display unit). */
export const UNITS: Record<string, Dim> = {
  '': DIMLESS,
  rad: DIMLESS,
  m: [1, 0, 0],
  kg: [0, 1, 0],
  s: [0, 0, 1],
  'm/s': [1, 0, -1],
  'm/s²': [1, 0, -2],
  'rad/s': [0, 0, -1],
  'rad/s²': [0, 0, -2],
  N: [1, 1, -2],
  'N/m': [0, 1, -2],
  J: [2, 1, -2],
  'kg·m/s': [1, 1, -1],
  'kg·m²': [2, 1, 0],
  'kg·m²/s': [2, 1, -1],
  'N·s': [1, 1, -1],
  'N·s/m': [0, 1, -1],
  W: [2, 1, -3],
  'N·m': [2, 1, -2],
  Hz: [0, 0, -1],
  '1/s': [0, 0, -1],
  // 26.51: drag, gravitation, areal velocity, nonlinear springs
  'N·s²/m²': [-1, 1, 0],
  'N·m²/kg²': [3, -1, -2],
  'm²/s': [2, 0, -1],
  'm²': [2, 0, 0],
  'N/m³': [-2, 1, -2],
  // 26.54: electricity and magnetism (26.56: in SI base dimensions, C = A·s)
  C: [0, 0, 1, 1],
  'V/m': [1, 1, -3, -1],
  T: [0, 1, -2, -1],
  V: [2, 1, -3, -1],
  A: [0, 0, 0, 1],
  'Ω': [2, 1, -3, -2],
  F: [-2, -1, 4, 2],
  'N·m²/C²': [3, 1, -4, -2],
  'C/kg': [0, -1, 1, 1],
  // 26.55: liquids and induction
  'kg/m³': [-3, 1, 0],
  'm³': [3, 0, 0],
  Wb: [2, 1, -2, -1],
  // 26.56 (D99): temperature, amount of substance, luminous intensity and the units of the model registry
  K: [0, 0, 0, 0, 1],
  mol: [0, 0, 0, 0, 0, 1],
  cd: [0, 0, 0, 0, 0, 0, 1],
  Pa: [-1, 1, -2],
  'J/K': [2, 1, -2, 0, -1],
  'J/(kg·K)': [2, 0, -2, 0, -1],
  'J/(mol·K)': [2, 1, -2, 0, -1, -1],
  'J/kg': [2, 0, -2],
  'J/mol': [2, 1, -2, 0, 0, -1],
  'W/(m·K)': [1, 1, -3, 0, -1],
  'W/m²': [0, 1, -3],
  'W/(m²·K⁴)': [0, 1, -3, 0, -4],
  'm·K': [1, 0, 0, 0, 1],
  '1/K': [0, 0, 0, 0, -1],
  'kg/mol': [0, 1, 0, 0, 0, -1],
  '1/mol': [0, 0, 0, 0, 0, -1],
  'Pa·s': [-1, 1, -1],
  'm³/s': [3, 0, -1],
  'kg/m': [-1, 1, 0],
  'kg/s': [0, 1, -1],
  '1/m': [-1, 0, 0],
  '1/m³': [-3, 0, 0],
  'J·s': [2, 1, -1],
  'm³/(kg·s²)': [3, -1, -2],
  'm³/s²': [3, 0, -2],
  H: [2, 1, -2, -2],
  'H/m': [1, 1, -2, -2],
  'F/m': [-3, -1, 4, 2],
  'C/m²': [-2, 0, 1, 1],
  'A/m': [-1, 0, 0, 1],
  'A/s': [0, 0, -1, 1],
  'V/s': [2, 1, -4, -1],
  'T/s': [0, 1, -3, -1],
  'Wb/s': [2, 1, -3, -1],
  'V/(m·s)': [1, 1, -4, -1],
  'Wb/m': [1, 1, -2, -1],
  'N/A²': [1, 1, -2, -2],
  'C·m': [1, 0, 1, 1],
  'V·m': [3, 1, -3, -1],
  'Ω·m': [3, 1, -3, -2],
  S: [-2, -1, 3, 2],
  Gy: [2, 0, -2],
  Bq: [0, 0, -1],
  'N/m²': [-1, 1, -2],
  'kg/(m·s)': [-1, 1, -1],
  's²': [0, 0, 2],
  'm·s': [1, 0, 1],
  'N/s': [1, 1, -3],
  'm⁴': [4, 0, 0],
  '1/s²': [0, 0, -2],
  'kg/C': [0, 1, -1, -1],
  'm³/C': [3, 0, -1, -1],
  'V·s': [2, 1, -2, -1],
  'J/m³': [-1, 1, -2],
  'W/m³': [-1, 1, -3],
  'K/W': [-2, -1, 3, 0, 1],
  'J·m': [3, 1, -2],
  'C/m³': [-3, 0, 1, 1]
}

/** Dimension of a unit of UNITS; throws for unknown units. */
export function unitDim(unit: string): Dim {
  const d = UNITS[unit]
  if (!d) throw new Error(tl('未知单位 {0}', [unit]))
  return d
}

/** Dimension in base units, e.g. m·kg·s^-2. */
export function formatDim(d: Dim): string {
  const names = ['m', 'kg', 's', 'A', 'K', 'mol', 'cd']
  const parts: string[] = []
  dimFull(d).forEach((e, i) => { if (Math.abs(e) > 1e-12) parts.push(e === 1 ? names[i] : `${names[i]}^${e}`) })
  return parts.length ? parts.join('·') : '1'
}

/** Find the display unit for a dimension (first match). */
export function unitFor(d: Dim): string {
  for (const [u, dim] of Object.entries(UNITS)) if (u !== 'rad' && dimEqual(dim, d)) return u
  return formatDim(d)
}
