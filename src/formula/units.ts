/**
 * Physical dimensions as exponents of (length, mass, time, charge). Angles are dimensionless (rad). The charge
 * exponent (26.54, D78) may be left out: [L, M, T] means [L, M, T, 0].
 */
import { tl } from '../i18n'
export type Dim = readonly [number, number, number] | readonly [number, number, number, number]

/** Dimension of a pure number. */
export const DIMLESS: Dim = [0, 0, 0]

const q = (d: Dim) => d[3] ?? 0

/** Equality of dimensions (exponents compared to 1e-12, as they may be fractional). */
export function dimEqual(a: Dim, b: Dim): boolean {
  return Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12 && Math.abs(a[2] - b[2]) < 1e-12 && Math.abs(q(a) - q(b)) < 1e-12
}
/** Dimension of a product. */
export function dimMul(a: Dim, b: Dim): Dim { return [a[0] + b[0], a[1] + b[1], a[2] + b[2], q(a) + q(b)] }
/** Dimension of a power. */
export function dimPow(a: Dim, p: number): Dim { return [a[0] * p, a[1] * p, a[2] * p, q(a) * p] }

/** Units used in the library, by their display string. */
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
  'Hz': [0, 0, -1],
  '1/s': [0, 0, -1],
  // 26.51: drag, gravitation, areal velocity, nonlinear springs
  'N·s²/m²': [-1, 1, 0],
  'N·m²/kg²': [3, -1, -2],
  'm²/s': [2, 0, -1],
  'm²': [2, 0, 0],
  'N/m³': [-2, 1, -2],
  // 26.54 (D78): electricity and magnetism (charge as the fourth base dimension)
  C: [0, 0, 0, 1],
  'V/m': [1, 1, -2, -1],
  T: [0, 1, -1, -1],
  V: [2, 1, -2, -1],
  A: [0, 0, -1, 1],
  'Ω': [2, 1, -1, -2],
  F: [-2, -1, 2, 2],
  'N·m²/C²': [3, 1, -2, -2],
  'C/kg': [0, -1, 0, 1],
  // 26.55: liquids and induction
  'kg/m³': [-3, 1, 0],
  'm³': [3, 0, 0],
  Wb: [2, 1, -1, -1]
}

/** Dimension of a unit of UNITS; throws for unknown units. */
export function unitDim(unit: string): Dim {
  const d = UNITS[unit]
  if (!d) throw new Error(tl('未知单位 {0}', [unit]))
  return d
}

/** Dimension in base units, e.g. m·kg·s^-2. */
export function formatDim(d: Dim): string {
  const names = ['m', 'kg', 's', 'C']
  const parts: string[] = []
  d.forEach((e, i) => { if (Math.abs(e) > 1e-12) parts.push(e === 1 ? names[i] : `${names[i]}^${e}`) })
  return parts.length ? parts.join('·') : '1'
}

/** Find the display unit for a dimension (first match). */
export function unitFor(d: Dim): string {
  for (const [u, dim] of Object.entries(UNITS)) if (u !== 'rad' && dimEqual(dim, d)) return u
  return formatDim(d)
}
