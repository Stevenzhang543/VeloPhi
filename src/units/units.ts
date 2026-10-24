/**
 * Unit system.
 *
 * Verity stores and computes every value in SI (m, kg, s, N, J, rad). Units are converted only at the display
 * boundary: inputs convert display -> SI when a value is committed, readouts convert SI -> display when a value
 * is shown. Every quantity carries its SI unit string (for example 'm/s²'); that string is the key into this
 * table, so one preference changes every panel, chart, formula card, export and CSV column consistently.
 *
 * This module is pure (no DOM, no Vue) so the exporters and the tests can use it directly.
 */

/** Physical kind of a quantity; it selects the display unit. */
export type UnitKind =
  | 'length' | 'mass' | 'time' | 'velocity' | 'acceleration' | 'force' | 'energy' | 'power'
  | 'momentum' | 'angularMomentum' | 'angle' | 'angularVelocity' | 'angularAcceleration'
  | 'stiffness' | 'damping' | 'inertia' | 'torque' | 'frequency'

/** A display unit of a kind. */
export interface UnitOption {
  id: string
  /** Label shown next to values. */
  label: string
  /** Size of one display unit in SI: si = display * factor. */
  factor: number
  /**
   * Exact inverse of `factor` when it is a round number (100 for cm): conversions then multiply or divide by
   * this instead, so 30 cm becomes exactly the double nearest to 0.3 m.
   */
  inv?: number
}

/** A kind with its label, SI unit and display options (SI first). */
export interface KindInfo { kind: UnitKind; label: string; si: string; options: UnitOption[] }

/** A unit that is `factor` SI units (km = 1000 m). */
const u = (id: string, factor: number, label = id): UnitOption => ({ id, label, factor })
/** A unit that is 1/n of the SI unit (cm = m / 100). */
const per = (id: string, n: number, label = id): UnitOption => ({ id, label, factor: 1 / n, inv: n })

/** Every kind with its SI unit first. */
export const KINDS: KindInfo[] = [
  { kind: 'length', label: '长度 / 位移', si: 'm', options: [u('m', 1), per('cm', 100), per('mm', 1000), u('km', 1000)] },
  { kind: 'mass', label: '质量', si: 'kg', options: [u('kg', 1), per('g', 1000)] },
  { kind: 'time', label: '时间', si: 's', options: [u('s', 1), per('ms', 1000)] },
  { kind: 'velocity', label: '速度', si: 'm/s', options: [u('m/s', 1), per('cm/s', 100), per('km/h', 3.6)] },
  { kind: 'acceleration', label: '加速度', si: 'm/s²', options: [u('m/s²', 1), per('cm/s²', 100)] },
  { kind: 'force', label: '力 / 重量', si: 'N', options: [u('N', 1), per('mN', 1000), u('kN', 1000)] },
  { kind: 'energy', label: '能量 / 功', si: 'J', options: [u('J', 1), per('mJ', 1000), u('kJ', 1000)] },
  { kind: 'power', label: '功率', si: 'W', options: [u('W', 1), u('kW', 1000)] },
  { kind: 'momentum', label: '动量 / 冲量', si: 'kg·m/s', options: [u('kg·m/s', 1), u('N·s', 1), per('g·cm/s', 1e5)] },
  { kind: 'angularMomentum', label: '角动量', si: 'kg·m²/s', options: [u('kg·m²/s', 1)] },
  { kind: 'angle', label: '角度', si: 'rad', options: [u('°', Math.PI / 180), u('rad', 1)] },
  { kind: 'angularVelocity', label: '角速度', si: 'rad/s', options: [u('rad/s', 1), u('°/s', Math.PI / 180), u('r/min', (2 * Math.PI) / 60)] },
  { kind: 'angularAcceleration', label: '角加速度', si: 'rad/s²', options: [u('rad/s²', 1), u('°/s²', Math.PI / 180)] },
  { kind: 'stiffness', label: '劲度系数', si: 'N/m', options: [u('N/m', 1), u('N/cm', 100)] },
  { kind: 'damping', label: '阻尼系数', si: 'N·s/m', options: [u('N·s/m', 1)] },
  { kind: 'inertia', label: '转动惯量', si: 'kg·m²', options: [u('kg·m²', 1), per('g·cm²', 1e7)] },
  { kind: 'torque', label: '力矩', si: 'N·m', options: [u('N·m', 1)] },
  { kind: 'frequency', label: '频率', si: 'Hz', options: [u('Hz', 1)] }
]

const BY_KIND = new Map(KINDS.map(k => [k.kind, k]))

/** SI unit string -> kind. Aliases cover the spellings used by the formula library. */
const SI_TO_KIND: Record<string, UnitKind> = {
  m: 'length', kg: 'mass', s: 'time', 'm/s': 'velocity', 'm/s²': 'acceleration', N: 'force', J: 'energy', W: 'power',
  'kg·m/s': 'momentum', 'N·s': 'momentum', 'kg·m²/s': 'angularMomentum', rad: 'angle', 'rad/s': 'angularVelocity',
  'rad/s²': 'angularAcceleration', 'N/m': 'stiffness', 'N·s/m': 'damping', 'kg·m²': 'inertia', 'N·m': 'torque',
  Hz: 'frequency', '1/s': 'frequency'
}

/** Chosen display unit id per kind. */
export type UnitChoice = Record<UnitKind, string>

/** A named set of unit choices; kinds it leaves out use their SI unit. */
export interface UnitPreset { id: string; label: string; choice: Partial<UnitChoice> }

const SI_CHOICE: UnitChoice = Object.fromEntries(KINDS.map(k => [k.kind, k.options[0].id])) as UnitChoice

/** Unit presets offered in the settings. */
export const PRESETS: UnitPreset[] = [
  { id: 'si', label: '国际单位制（m、kg、s，角度用 °）', choice: {} },
  { id: 'si-rad', label: '国际单位制（角度用 rad）', choice: { angle: 'rad' } },
  { id: 'lab', label: '实验室尺度（cm、g、cm/s）', choice: { length: 'cm', mass: 'g', velocity: 'cm/s', acceleration: 'cm/s²', energy: 'mJ', force: 'mN', momentum: 'g·cm/s', inertia: 'g·cm²' } }
]

/** Full unit choice of a preset (unknown ids: the first preset). */
export function presetChoice(id: string): UnitChoice {
  const p = PRESETS.find(x => x.id === id) ?? PRESETS[0]
  return { ...SI_CHOICE, ...p.choice }
}

/** The default unit choice: SI, angles in degrees. */
export function defaultChoice(): UnitChoice { return presetChoice('si') }

/** Kind of an SI unit string; null for dimensionless or unknown units. */
export function kindOf(siUnit: string): UnitKind | null { return SI_TO_KIND[siUnit] ?? null }

/** Description of a kind. */
export function kindInfo(kind: UnitKind): KindInfo { return BY_KIND.get(kind)! }

/** The display option for an SI unit under a choice; null for dimensionless or unknown units. */
export function optionFor(siUnit: string, choice: UnitChoice): UnitOption | null {
  const kind = kindOf(siUnit)
  if (!kind) return null
  const info = BY_KIND.get(kind)!
  return info.options.find(o => o.id === choice[kind]) ?? info.options[0]
}

/** Convert an SI value to the display unit. */
export function toDisplay(value: number, siUnit: string, choice: UnitChoice): number {
  const o = optionFor(siUnit, choice)
  if (!o || o.factor === 1) return value
  return o.inv ? value * o.inv : value / o.factor
}

/** Convert a display value to SI. */
export function fromDisplay(value: number, siUnit: string, choice: UnitChoice): number {
  const o = optionFor(siUnit, choice)
  if (!o || o.factor === 1) return value
  return o.inv ? value / o.inv : value * o.factor
}

/** True when the unit choice shows this SI unit as something else (cm for m, ° for rad …). */
export function isConverted(siUnit: string, choice: UnitChoice): boolean {
  const o = optionFor(siUnit, choice)
  return !!o && o.factor !== 1
}

/** Label of the display unit ('' for dimensionless). Unknown units are shown as they are. */
export function displayLabel(siUnit: string, choice: UnitChoice): string {
  const o = optionFor(siUnit, choice)
  return o ? o.label : siUnit
}

function trimZeros(s: string): string {
  if (!s.includes('.')) return s
  return s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

/** Plain-text number with `digits` significant digits; scientific notation outside [1e-3, 1e6). */
export function formatSig(v: number | null, digits: number): string {
  if (v === null || !Number.isFinite(v)) return '—'
  if (v === 0) return '0'
  const a = Math.abs(v)
  if (a >= 1e-3 && a < 1e6) return trimZeros(v.toPrecision(digits))
  return v.toExponential(Math.max(0, digits - 1)).replace(/\.?0+e/, 'e')
}

/** Format an SI value in the chosen display unit, e.g. "12.5 cm". */
export function formatQuantity(v: number | null, siUnit: string, choice: UnitChoice, digits: number): string {
  if (v === null || !Number.isFinite(v)) return '—'
  const label = displayLabel(siUnit, choice)
  const s = formatSig(toDisplay(v, siUnit, choice), digits)
  if (!label) return s
  return label === '°' ? `${s}°` : `${s} ${label}`
}

/** Number in KaTeX form with `digits` significant digits (×10ⁿ outside [1e-3, 1e6)). */
export function latexNumber(v: number | null, digits: number): string {
  if (v === null || !Number.isFinite(v)) return '\\text{—}'
  if (v === 0) return '0'
  const a = Math.abs(v)
  if (a >= 1e-3 && a < 1e6) {
    const s = v.toPrecision(digits)
    if (!s.includes('e')) return trimZeros(s)
  }
  const [m, e] = v.toExponential(Math.max(0, digits - 1)).split('e')
  return `${trimZeros(m)}\\times 10^{${Number(e)}}`
}

/** SI value in KaTeX form with its display unit, e.g. 12.5 cm or 30° (thin space before the unit). */
export function latexQuantity(v: number | null, siUnit: string, choice: UnitChoice, digits: number): string {
  const label = displayLabel(siUnit, choice)
  return `${latexNumber(v === null ? null : toDisplay(v, siUnit, choice), digits)}${unitLatex(label)}`
}

/** KaTeX form of a display unit label. */
export function unitLatex(label: string): string {
  if (!label) return ''
  if (label === '°') return '^{\\circ}'
  return `\\,\\mathrm{${label.replace(/·/g, '\\cdot ').replace(/²/g, '^2').replace(/°/g, '^{\\circ}')}}`
}
