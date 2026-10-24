/** Physical dimensions as exponents of (length, mass, time). Angles are dimensionless (rad). */
export type Dim = readonly [number, number, number]

/** Dimension of a pure number. */
export const DIMLESS: Dim = [0, 0, 0]

/** Equality of dimensions (exponents compared to 1e-12, as they may be fractional). */
export function dimEqual(a: Dim, b: Dim): boolean {
  return Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12 && Math.abs(a[2] - b[2]) < 1e-12
}
/** Dimension of a product. */
export function dimMul(a: Dim, b: Dim): Dim { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]] }
/** Dimension of a power. */
export function dimPow(a: Dim, p: number): Dim { return [a[0] * p, a[1] * p, a[2] * p] }

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
  '1/s': [0, 0, -1]
}

/** Dimension of a unit of UNITS; throws for unknown units. */
export function unitDim(unit: string): Dim {
  const d = UNITS[unit]
  if (!d) throw new Error(`未知单位 ${unit}`)
  return d
}

/** Dimension in base units, e.g. m·kg·s^-2. */
export function formatDim(d: Dim): string {
  const names = ['m', 'kg', 's']
  const parts: string[] = []
  d.forEach((e, i) => { if (Math.abs(e) > 1e-12) parts.push(e === 1 ? names[i] : `${names[i]}^${e}`) })
  return parts.length ? parts.join('·') : '1'
}

/** Find the display unit for a dimension (first match). */
export function unitFor(d: Dim): string {
  for (const [u, dim] of Object.entries(UNITS)) if (u !== 'rad' && dimEqual(dim, d)) return u
  return formatDim(d)
}
