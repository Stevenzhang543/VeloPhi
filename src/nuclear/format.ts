/**
 * Typesetting of nuclide data (26.64, D276): labels (²³⁵U, ⁹⁹ᵐTc), decay modes as nuclear tables print them, half-lives
 * in the unit that reads best, energies, fractions. Pure (no Vue, no DOM). These functions only format numbers the
 * core returned — a change of unit for display (s → a, fraction → %), never a physical result.
 */
import { tl } from '../i18n'
import { NNBSP, fixed, sig, withUnit } from '../chem/format'

export { NNBSP, fixed, sig, withUnit }

const SUP: Record<string, string> = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', m: 'ᵐ', n: 'ⁿ' }
export const sup = (s: string): string => [...s].map(c => SUP[c] ?? c).join('')

/** Parts of a nuclide id of the core: `U-235` → U, 235, ''; `Tc-99m` → Tc, 99, 'm'. */
export function parseId(id: string): { symbol: string; A: number; suffix: string } | null {
  const m = /^([A-Za-z]{1,2})-(\d{1,3})([mn]?)$/.exec(id)
  return m ? { symbol: m[1], A: Number(m[2]), suffix: m[3] } : null
}

/** `U-235` → `²³⁵U`, `Tc-99m` → `⁹⁹ᵐTc`; anything else unchanged. */
export function nuclideLabel(id: string): string {
  const p = parseId(id)
  return p ? `${sup(String(p.A) + p.suffix)}${p.symbol}` : id
}

export const stateSuffix = (state: number): string => (state === 1 ? 'm' : state === 2 ? 'n' : '')

/** Id of the core for Z's symbol, A and state. */
export const nuclideId = (symbol: string, A: number, state = 0): string => `${symbol}-${A}${stateSuffix(state)}`

const MODE_TEXT: Record<string, string> = { 'B-': 'β⁻', 'B+': 'β⁺', EC: 'EC', 'e+': 'e⁺', A: 'α', IT: 'IT', SF: 'SF', '2B-': '2β⁻', '2B+': '2β⁺', p: 'p', '2p': '2p', '3p': '3p', n: 'n', '2n': '2n', '3n': '3n', d: 'd', '3H': '³H', '3He': '³He' }

/** A decay mode as nuclear tables print it: β⁻, α, EC, β⁻n, ¹⁴C (cluster emission) … */
export function modeText(m: string): string {
  if (MODE_TEXT[m]) return MODE_TEXT[m]
  const cluster = /^(\d+)([A-Z][a-z]?)$/.exec(m)
  if (cluster) return `${sup(cluster[1])}${cluster[2]}`
  return m.replace(/^B-/, 'β⁻').replace(/^B\+/, 'β⁺').replace(/A$/, 'α')
}

/** Seconds of the year of the data file (NUBASE2020: the tropical year). */
export const YEAR_S = 31556926

/** A half-life given in seconds in the unit that reads best; `—` when it is not known. */
export function halfLifeText(s: number | null | undefined, digits = 4): string {
  if (s === null || s === undefined || !Number.isFinite(s)) return '—'
  const steps: Array<[number, string]> = [[YEAR_S, 'a'], [86400, 'd'], [3600, 'h'], [60, 'min'], [1, 's'], [1e-3, 'ms'], [1e-6, 'µs'], [1e-9, 'ns']]
  for (const [size, u] of steps) if (s >= size) return withUnit(sig(s / size, digits), u)
  return withUnit(sig(s, digits), 's')
}

/** A time span for axis labels and readouts (same units as half-lives). */
export const timeText = (s: number, digits = 3): string => (s === 0 ? withUnit('0', 's') : halfLifeText(s, digits))

/** A fraction as a percentage: 0.8778 → `87.78 %`; small ones in scientific notation. */
export function percentText(f: number | null | undefined): string {
  if (f === null || f === undefined || !Number.isFinite(f)) return '—'
  const p = f * 100
  return withUnit(p >= 0.01 || p === 0 ? sig(Number(p.toPrecision(6)), 4) : sig(p, 2), '%')
}

/** An energy the core gives in keV. */
export const keVText = (v: number | null | undefined, decimals = 1): string => withUnit(fixed(v, decimals), 'keV')

/** An amount with three significant digits and its unit. */
export const amountText = (v: number | null | undefined, unit: string, digits = 3): string => withUnit(sig(v, digits), unit)

/** `稳定` for a stable nuclide, else the half-life. */
export function lifeText(stable: boolean, halfLife: number | null): string {
  return stable ? tl('稳定') : halfLife === null ? tl('半衰期未知') : halfLifeText(halfLife)
}

/** Reactivity (dimensionless) in pcm: 1 pcm = 10⁻⁵. */
export const pcmText = (rho: number | null | undefined, decimals = 0): string => (rho === null || rho === undefined || !Number.isFinite(rho) ? '—' : withUnit(fixed(rho * 1e5, decimals), 'pcm'))

/** Kelvin with no decimals. */
export const kelvinText = (T: number | null | undefined): string => withUnit(fixed(T, 0), 'K')

/** Watts in W, kW or MW. */
export function powerText(w: number | null | undefined): string {
  if (w === null || w === undefined || !Number.isFinite(w)) return '—'
  const a = Math.abs(w)
  if (a >= 1e6) return withUnit(sig(w / 1e6, 4), 'MW')
  if (a >= 1e3) return withUnit(sig(w / 1e3, 4), 'kW')
  return withUnit(sig(w, 4), 'W')
}
