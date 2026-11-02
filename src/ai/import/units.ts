/**
 * Values the AI read from a problem come as `{ value, unit }` in the unit written in the problem (D164); the app
 * converts them, the AI never does. Chinese, English and German spellings are normalised to the unit ids of the
 * unit system (units/units.ts), then converted with task/compare.ts.
 */
import { toSI, unitInfo, sameKind } from '../../task/compare'

export interface Qty { value: number; unit: string }

const ALIASES: Array<[RegExp, string]> = [
  [/^(千克|公斤|kilograms?|kilogramm)$/i, 'kg'], [/^(克|grams?|gramm)$/i, 'g'], [/^(毫克)$/, 'mg'], [/^(吨|tonnes?|tons?)$/i, 't'],
  [/^(米每秒|米\/秒|m\/sec|meters?\/second)$/i, 'm/s'],
  [/^(千米每小时|千米\/时|千米\/小时|公里\/小时|公里每小时|km\/hr|kmh|kilometers?\/hour|km\/std)$/i, 'km/h'],
  [/^(米每二次方秒|米每秒平方|米\/秒²|米\/秒\^2|m\/s\^?2|m\/s\/s|m·s⁻²|m\*s\^-2|N\/kg)$/i, 'm/s²'],
  [/^(厘米每秒)$/, 'cm/s'],
  [/^(千米|公里|kilometers?|kilometer)$/i, 'km'], [/^(厘米|centimeters?|zentimeter)$/i, 'cm'], [/^(毫米|millimeters?)$/i, 'mm'], [/^(米|meters?|metres?|meter)$/i, 'm'],
  [/^(毫秒)$/, 'ms'], [/^(秒|秒钟|seconds?|sekunden?|sec)$/i, 's'], [/^(分钟|分|minutes?|minuten?)$/i, 'min'], [/^(小时|时|hours?|stunden?|hr)$/i, 'h'],
  [/^(度|°|deg|degrees?|grad|º)$/i, '°'], [/^(弧度|radians?)$/i, 'rad'],
  [/^(牛顿|牛|newtons?)$/i, 'N'], [/^(千牛)$/, 'kN'], [/^(焦耳|焦|joules?)$/i, 'J'], [/^(千焦)$/, 'kJ'], [/^(瓦特|瓦|watts?)$/i, 'W'], [/^(千瓦)$/, 'kW'],
  [/^(伏特|伏|volts?)$/i, 'V'], [/^(千伏)$/, 'kV'], [/^(安培|安|amperes?|amps?)$/i, 'A'], [/^(毫安)$/, 'mA'],
  [/^(欧姆|欧|ohms?|Ω)$/i, 'Ω'], [/^(千欧)$/, 'kΩ'], [/^(特斯拉|特|tesla)$/i, 'T'],
  [/^(库仑|库|coulombs?)$/i, 'C'], [/^(微库|微库仑|uC|μC|µC)$/i, 'μC'], [/^(毫库|毫库仑)$/, 'mC'], [/^(nC|纳库)$/i, 'nC'],
  [/^(牛每米|N\/m|牛\/米)$/i, 'N/m'], [/^(千克每立方米|kg\/m\^?3|kg\/m³)$/i, 'kg/m³'], [/^(克每立方厘米|g\/cm\^?3|g\/cm³)$/i, 'g/cm³'],
  [/^(赫兹|赫|hertz|hz)$/i, 'Hz'], [/^(帕斯卡|帕|pascals?|pa)$/i, 'Pa'], [/^(千帕)$/, 'kPa'],
  [/^(rad\/s|弧度每秒|弧度\/秒)$/i, 'rad/s'], [/^(r\/s|转每秒)$/i, 'r/s'], [/^(r\/min|rpm|转每分)$/i, 'r/min'],
  [/^(伏每米|V\/m|N\/C|牛每库)$/i, 'V/m'],
  [/^(1|无单位|unitless|none|-|—|)$/i, '1']
]

/** The unit id of a written unit (spaces, ^ and Chinese / English / German names normalised). */
export function normalizeUnit(u: string | null | undefined): string {
  const raw = String(u ?? '').trim().replace(/\s+/g, '').replace(/\^2/g, '²').replace(/\^3/g, '³').replace(/·/g, '·')
  for (const [re, id] of ALIASES) if (re.test(raw)) return id
  return raw
}

/** SI value of a quantity, or null when the unit is unknown. */
export function qtyToSI(q: Qty): number | null {
  if (!q || typeof q.value !== 'number' || !Number.isFinite(q.value)) return null
  const u = normalizeUnit(q.unit)
  // Percentages of a pure number (efficiency, e) are fractions
  if (u === '%') return q.value / 100
  return toSI(q.value, u)
}

/** SI unit of a written unit ('' when unknown). */
export function siUnitOf(unit: string): string { return unitInfo(normalizeUnit(unit))?.si ?? '' }

/**
 * A quantity converted into the display unit of a template parameter (its `unit`, e.g. '°', 'kg', 'mC'), with a
 * reason when the units do not measure the same kind of quantity.
 */
export function toParamUnit(q: Qty, paramUnit: string): { value: number } | { error: string } {
  const si = qtyToSI(q)
  if (si === null) return { error: `unknown unit "${q.unit}"` }
  const target = unitInfo(paramUnit === '' ? '1' : paramUnit)
  if (!target) return { error: `parameter unit "${paramUnit}" unknown` }
  const from = siUnitOf(q.unit)
  if (from && target.si && !sameKind(from, target.si) && !(from === '1' && target.si === 'rad')) return { error: `unit "${q.unit}" does not measure ${paramUnit}` }
  const v = (si - target.offset) / target.factor
  return { value: Number(v.toPrecision(12)) }
}

/** SI value for a quantity whose SI unit is given (task givens): converted and checked. */
export function toSIOf(q: Qty, siUnit: string): { value: number } | { error: string } {
  const si = qtyToSI(q)
  if (si === null) return { error: `unknown unit "${q.unit}"` }
  const from = siUnitOf(q.unit)
  if (siUnit && from && !sameKind(from, siUnit) && !(siUnit === 'rad' && from === '1')) return { error: `unit "${q.unit}" does not measure ${siUnit}` }
  return { value: si }
}
