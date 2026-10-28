/**
 * Unit system.
 *
 * VeloPhi stores and computes every value in SI (m, kg, s, N, J, rad). Units are converted only at the display
 * boundary: inputs convert display -> SI when a value is committed, readouts convert SI -> display when a value
 * is shown. Every quantity carries its SI unit string (for example 'm/s²'); that string is the key into this
 * table, so one preference changes every panel, chart, formula card, export and CSV column consistently.
 *
 * This module is pure (no DOM, no Vue) so the exporters and the tests can use it directly.
 */
import { trDeep } from '../i18n'

/** Physical kind of a quantity; it selects the display unit. */
export type UnitKind =
  | 'length' | 'mass' | 'time' | 'velocity' | 'acceleration' | 'force' | 'energy' | 'power'
  | 'momentum' | 'angularMomentum' | 'angle' | 'angularVelocity' | 'angularAcceleration'
  | 'stiffness' | 'damping' | 'inertia' | 'torque' | 'frequency'
  // 26.51: drag, nonlinear springs, gravitation, Kepler's second law
  | 'quadDrag' | 'cubicStiffness' | 'gravConst' | 'area' | 'arealVelocity'
  // 26.54: charges, fields and circuits
  | 'charge' | 'electricField' | 'magneticField' | 'coulombConst' | 'voltage' | 'current' | 'resistance' | 'capacitance'
  // 26.56 (D99): temperature (absolute: affine °C; difference: scale only), amount of substance and the kinds of the
  // model registry
  | 'temperature' | 'temperatureDifference' | 'amount' | 'pressure' | 'density' | 'volume' | 'heatCapacity'
  | 'specificHeat' | 'molarHeatCapacity' | 'specificEnergy' | 'thermalConductivity' | 'intensity' | 'viscosity'
  | 'flowRate' | 'inductance' | 'magneticFlux' | 'linearDensity' | 'expansion' | 'molarMass' | 'wavenumber'
  | 'numberDensity' | 'permittivity' | 'permeability' | 'surfaceCharge' | 'resistivity' | 'action' | 'activity'

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
  /**
   * Offset of an affine unit (26.56): si = display · factor + offset. Only the Celsius scale of an absolute
   * temperature has one (273.15 K); a temperature difference in °C has none.
   */
  offset?: number
}

/** A kind with its label, SI unit and display options (SI first). */
export interface KindInfo { kind: UnitKind; label: string; si: string; options: UnitOption[] }

/** A unit that is `factor` SI units (km = 1000 m). */
const u = (id: string, factor: number, label = id): UnitOption => ({ id, label, factor })
/** A unit that is 1/n of the SI unit (cm = m / 100). */
const per = (id: string, n: number, label = id): UnitOption => ({ id, label, factor: 1 / n, inv: n })

/** Every kind with its SI unit first. */
export const KINDS: KindInfo[] = trDeep([
  { kind: 'length', label: '长度 / 位移', si: 'm', options: [u('m', 1), per('cm', 100), per('mm', 1000), u('km', 1000)] },
  { kind: 'mass', label: '质量', si: 'kg', options: [u('kg', 1), per('g', 1000), u('u', 1.66053906892e-27)] },
  { kind: 'time', label: '时间', si: 's', options: [u('s', 1), per('ms', 1000)] },
  { kind: 'velocity', label: '速度', si: 'm/s', options: [u('m/s', 1), per('cm/s', 100), per('km/h', 3.6)] },
  { kind: 'acceleration', label: '加速度', si: 'm/s²', options: [u('m/s²', 1), per('cm/s²', 100)] },
  { kind: 'force', label: '力 / 重量', si: 'N', options: [u('N', 1), per('mN', 1000), u('kN', 1000)] },
  { kind: 'energy', label: '能量 / 功', si: 'J', options: [u('J', 1), per('mJ', 1000), u('kJ', 1000), u('eV', 1.602176634e-19), u('keV', 1.602176634e-16), u('MeV', 1.602176634e-13)] },
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
  { kind: 'frequency', label: '频率', si: 'Hz', options: [u('Hz', 1)] },
  { kind: 'quadDrag', label: '平方阻力系数', si: 'N·s²/m²', options: [u('N·s²/m²', 1)] },
  { kind: 'cubicStiffness', label: '非线性劲度系数', si: 'N/m³', options: [u('N/m³', 1)] },
  { kind: 'gravConst', label: '引力常量', si: 'N·m²/kg²', options: [u('N·m²/kg²', 1)] },
  { kind: 'area', label: '面积', si: 'm²', options: [u('m²', 1), per('cm²', 1e4)] },
  { kind: 'arealVelocity', label: '掠面速度', si: 'm²/s', options: [u('m²/s', 1)] },
  { kind: 'charge', label: '电荷量', si: 'C', options: [u('C', 1), per('mC', 1e3), per('μC', 1e6), per('nC', 1e9)] },
  { kind: 'electricField', label: '电场强度', si: 'V/m', options: [u('V/m', 1), u('N/C', 1), u('kV/m', 1e3)] },
  { kind: 'magneticField', label: '磁感应强度', si: 'T', options: [u('T', 1), per('mT', 1e3)] },
  { kind: 'coulombConst', label: '静电力常量', si: 'N·m²/C²', options: [u('N·m²/C²', 1)] },
  { kind: 'voltage', label: '电压 / 电势', si: 'V', options: [u('V', 1), per('mV', 1e3), u('kV', 1e3)] },
  { kind: 'current', label: '电流', si: 'A', options: [u('A', 1), per('mA', 1e3), per('μA', 1e6)] },
  { kind: 'resistance', label: '电阻', si: 'Ω', options: [u('Ω', 1), u('kΩ', 1e3), u('MΩ', 1e6)] },
  { kind: 'capacitance', label: '电容', si: 'F', options: [u('F', 1), per('μF', 1e6), per('pF', 1e12)] },
  // 26.56 (D99)
  { kind: 'temperature', label: '温度', si: 'K', options: [u('K', 1), { id: '°C', label: '°C', factor: 1, offset: 273.15 }] },
  { kind: 'temperatureDifference', label: '温差', si: 'K', options: [u('K', 1), u('°C', 1)] },
  { kind: 'amount', label: '物质的量', si: 'mol', options: [u('mol', 1), per('mmol', 1e3)] },
  { kind: 'pressure', label: '压强', si: 'Pa', options: [u('Pa', 1), u('kPa', 1e3), u('MPa', 1e6), u('atm', 101325)] },
  { kind: 'density', label: '密度', si: 'kg/m³', options: [u('kg/m³', 1), u('g/cm³', 1e3)] },
  { kind: 'volume', label: '体积', si: 'm³', options: [u('m³', 1), per('L', 1e3), per('mL', 1e6), per('cm³', 1e6)] },
  { kind: 'heatCapacity', label: '热容', si: 'J/K', options: [u('J/K', 1)] },
  { kind: 'specificHeat', label: '比热容', si: 'J/(kg·K)', options: [u('J/(kg·K)', 1)] },
  { kind: 'molarHeatCapacity', label: '摩尔热容', si: 'J/(mol·K)', options: [u('J/(mol·K)', 1)] },
  { kind: 'specificEnergy', label: '比能（潜热）', si: 'J/kg', options: [u('J/kg', 1), u('kJ/kg', 1e3)] },
  { kind: 'thermalConductivity', label: '热导率', si: 'W/(m·K)', options: [u('W/(m·K)', 1)] },
  { kind: 'intensity', label: '强度（能流密度）', si: 'W/m²', options: [u('W/m²', 1)] },
  { kind: 'viscosity', label: '动力黏度', si: 'Pa·s', options: [u('Pa·s', 1), per('mPa·s', 1e3)] },
  { kind: 'flowRate', label: '体积流量', si: 'm³/s', options: [u('m³/s', 1), per('L/s', 1e3)] },
  { kind: 'inductance', label: '电感', si: 'H', options: [u('H', 1), per('mH', 1e3)] },
  { kind: 'magneticFlux', label: '磁通量', si: 'Wb', options: [u('Wb', 1)] },
  { kind: 'linearDensity', label: '线密度', si: 'kg/m', options: [u('kg/m', 1), per('g/m', 1e3)] },
  { kind: 'expansion', label: '线膨胀系数', si: '1/K', options: [u('1/K', 1)] },
  { kind: 'molarMass', label: '摩尔质量', si: 'kg/mol', options: [u('kg/mol', 1), per('g/mol', 1e3)] },
  { kind: 'wavenumber', label: '波数', si: '1/m', options: [u('1/m', 1)] },
  { kind: 'numberDensity', label: '数密度', si: '1/m³', options: [u('1/m³', 1)] },
  { kind: 'permittivity', label: '介电常量', si: 'F/m', options: [u('F/m', 1)] },
  { kind: 'permeability', label: '磁导率', si: 'H/m', options: [u('H/m', 1), u('N/A²', 1)] },
  { kind: 'surfaceCharge', label: '面电荷密度', si: 'C/m²', options: [u('C/m²', 1)] },
  { kind: 'resistivity', label: '电阻率', si: 'Ω·m', options: [u('Ω·m', 1)] },
  { kind: 'action', label: '作用量（角动量量纲）', si: 'J·s', options: [u('J·s', 1)] },
  { kind: 'activity', label: '活度', si: 'Bq', options: [u('Bq', 1), u('kBq', 1e3)] }
])

const BY_KIND = new Map(KINDS.map(k => [k.kind, k]))

/** SI unit string -> kind. Aliases cover the spellings used by the formula library. */
const SI_TO_KIND: Record<string, UnitKind> = {
  m: 'length', kg: 'mass', s: 'time', 'm/s': 'velocity', 'm/s²': 'acceleration', N: 'force', J: 'energy', W: 'power',
  'kg·m/s': 'momentum', 'N·s': 'momentum', 'kg·m²/s': 'angularMomentum', rad: 'angle', 'rad/s': 'angularVelocity',
  'rad/s²': 'angularAcceleration', 'N/m': 'stiffness', 'N·s/m': 'damping', 'kg·m²': 'inertia', 'N·m': 'torque',
  Hz: 'frequency', '1/s': 'frequency',
  'N·s²/m²': 'quadDrag', 'N/m³': 'cubicStiffness', 'N·m²/kg²': 'gravConst', 'm²': 'area', 'm²/s': 'arealVelocity',
  C: 'charge', 'V/m': 'electricField', 'N/C': 'electricField', T: 'magneticField', 'N·m²/C²': 'coulombConst', V: 'voltage', A: 'current', 'Ω': 'resistance', F: 'capacitance',
  // 26.56: an SI unit string alone means an absolute temperature for K; differences name their kind explicitly
  K: 'temperature', mol: 'amount', Pa: 'pressure', 'kg/m³': 'density', 'm³': 'volume', 'J/K': 'heatCapacity',
  'J/(kg·K)': 'specificHeat', 'J/(mol·K)': 'molarHeatCapacity', 'J/kg': 'specificEnergy', 'W/(m·K)': 'thermalConductivity',
  'W/m²': 'intensity', 'Pa·s': 'viscosity', 'm³/s': 'flowRate', H: 'inductance', Wb: 'magneticFlux', 'kg/m': 'linearDensity',
  '1/K': 'expansion', 'kg/mol': 'molarMass', '1/m': 'wavenumber', '1/m³': 'numberDensity', 'F/m': 'permittivity',
  'H/m': 'permeability', 'C/m²': 'surfaceCharge', 'Ω·m': 'resistivity', 'J·s': 'action', Bq: 'activity'
}

/** Chosen display unit id per kind. */
export type UnitChoice = Record<UnitKind, string>

/** A named set of unit choices; kinds it leaves out use their SI unit. */
export interface UnitPreset { id: string; label: string; choice: Partial<UnitChoice> }

const SI_CHOICE: UnitChoice = Object.fromEntries(KINDS.map(k => [k.kind, k.options[0].id])) as UnitChoice

/** Unit presets offered in the settings. */
export const PRESETS: UnitPreset[] = trDeep([
  { id: 'si', label: '国际单位制（m、kg、s，角度用 °）', choice: { temperature: '°C' } },
  { id: 'si-rad', label: '国际单位制（角度用 rad）', choice: { angle: 'rad', temperature: '°C' } },
  { id: 'lab', label: '实验室尺度（cm、g、cm/s）', choice: { length: 'cm', mass: 'g', velocity: 'cm/s', acceleration: 'cm/s²', energy: 'mJ', force: 'mN', momentum: 'g·cm/s', inertia: 'g·cm²' } }
])

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

/** SI value → value in a display option (affine for °C of an absolute temperature). */
export function siToOption(value: number, o: UnitOption | null): number {
  if (!o) return value
  if (o.offset) return (value - o.offset) / o.factor
  if (o.factor === 1) return value
  return o.inv ? value * o.inv : value / o.factor
}

/** Value in a display option → SI. */
export function optionToSi(value: number, o: UnitOption | null): number {
  if (!o) return value
  if (o.offset) return value * o.factor + o.offset
  if (o.factor === 1) return value
  return o.inv ? value / o.inv : value * o.factor
}

/** Convert an SI value to the display unit. */
export function toDisplay(value: number, siUnit: string, choice: UnitChoice): number {
  return siToOption(value, optionFor(siUnit, choice))
}

/** Convert a display value to SI. */
export function fromDisplay(value: number, siUnit: string, choice: UnitChoice): number {
  return optionToSi(value, optionFor(siUnit, choice))
}

/** The display option of a kind under a choice (26.56: the model registry names kinds, e.g. a temperature difference). */
export function optionForKind(kind: UnitKind, choice: UnitChoice): UnitOption {
  const info = BY_KIND.get(kind)!
  return info.options.find(o => o.id === choice[kind]) ?? info.options[0]
}

/**
 * 26.56 (D99): conversions that honour a named kind — the registry says when an SI unit means something other than
 * its default kind (K as a temperature difference: no offset; rad/s as an angular frequency …).
 */
export function optionOf(siUnit: string, kind: UnitKind | undefined, choice: UnitChoice): UnitOption | null {
  return kind && BY_KIND.has(kind) ? optionForKind(kind, choice) : optionFor(siUnit, choice)
}
export function toDisplayKind(value: number, siUnit: string, kind: UnitKind | undefined, choice: UnitChoice): number { return siToOption(value, optionOf(siUnit, kind, choice)) }
export function fromDisplayKind(value: number, siUnit: string, kind: UnitKind | undefined, choice: UnitChoice): number { return optionToSi(value, optionOf(siUnit, kind, choice)) }
export function labelKind(siUnit: string, kind: UnitKind | undefined, choice: UnitChoice): string { const o = optionOf(siUnit, kind, choice); return o ? o.label : siUnit }

/** True when the unit choice shows this SI unit as something else (cm for m, ° for rad …). */
export function isConverted(siUnit: string, choice: UnitChoice): boolean {
  const o = optionFor(siUnit, choice)
  return !!o && (o.factor !== 1 || !!o.offset)
}

/** Label of the display unit ('' for dimensionless). Unknown units are shown as they are. */
export function displayLabel(siUnit: string, choice: UnitChoice): string {
  const o = optionFor(siUnit, choice)
  return o ? o.label : siUnit
}

/**
 * Decimal separator of readouts (26.51, carry-over of 26.50): '.' or ',' (German style), set by the application
 * from the settings and the language. Input fields accept both.
 */
export const numberStyle: { decimal: '.' | ',' } = { decimal: '.' }
/** A plain-text number with the decimal separator of the readouts. */
export function withDecimal(s: string): string { return numberStyle.decimal === ',' ? s.replace('.', ',') : s }

function trimZeros(s: string): string {
  if (!s.includes('.')) return s
  return s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

/** Plain-text number with `digits` significant digits; scientific notation outside [1e-3, 1e6). */
export function formatSig(v: number | null, digits: number): string {
  if (v === null || !Number.isFinite(v)) return '—'
  if (v === 0) return '0'
  const a = Math.abs(v)
  if (a >= 1e-3 && a < 1e6) return withDecimal(trimZeros(v.toPrecision(digits)))
  return withDecimal(v.toExponential(Math.max(0, digits - 1)).replace(/\.?0+e/, 'e'))
}

/** Format an SI value in the chosen display unit, e.g. "12.5 cm". */
export function formatQuantity(v: number | null, siUnit: string, choice: UnitChoice, digits: number): string {
  if (v === null || !Number.isFinite(v)) return '—'
  const label = displayLabel(siUnit, choice)
  const s = formatSig(toDisplay(v, siUnit, choice), digits)
  if (!label) return s
  return label === '°' ? `${s}°` : `${s} ${label}`
}

/** Format an SI value of a named kind in its display unit (26.56). */
const SUPERSCRIPT: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }

/**
 * `formatSig` for readers rather than files (26.56 model pages and activities): powers of ten as 4.7×10⁻⁵ and 10⁻⁴
 * instead of 4.7e-5 and 1e-4. Exports keep `formatSig`.
 */
export function readableSig(v: number | null, digits: number): string {
  const s = formatSig(v, digits)
  const m = /^(-?[0-9.,]+)e([+-]?\d+)$/.exec(s)
  if (!m) return s
  const exp = [...String(Number(m[2]))].map(c => SUPERSCRIPT[c] ?? c).join('')
  if (m[1] === '1') return `10${exp}`
  if (m[1] === '-1') return `−10${exp}`
  return `${m[1].replace(/^-/, '−')}×10${exp}`
}

export function formatQuantityKind(v: number | null, siUnit: string, kind: UnitKind | undefined, choice: UnitChoice, digits: number): string {
  if (v === null || !Number.isFinite(v)) return '—'
  const label = labelKind(siUnit, kind, choice)
  const s = readableSig(toDisplayKind(v, siUnit, kind, choice), digits)
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
    if (!s.includes('e')) return texDecimal(trimZeros(s))
  }
  const [m, e] = v.toExponential(Math.max(0, digits - 1)).split('e')
  return `${texDecimal(trimZeros(m))}\\times 10^{${Number(e)}}`
}

/** KaTeX decimal comma: `{,}` keeps TeX from adding the space of a punctuation comma. */
function texDecimal(s: string): string { return numberStyle.decimal === ',' ? s.replace('.', '{,}') : s }

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
