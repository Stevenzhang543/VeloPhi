/**
 * Numbers of the chemistry bench (26.64, D247, D254): every quantity the bench shows goes through here — a real
 * minus sign, the decimal separator of the readouts, a narrow no-break space between number and unit, and either the
 * resolution of the instrument that shows the value or a fixed number of significant digits. Temperatures are shown
 * in °C (the kelvin value is for the tooltip), volumes in mL, masses in g, amounts in mol / mmol / µmol.
 * Pure (no Vue, no DOM): the canvas, the inspector, the log and the tests use the same functions.
 */
import { formatSig, readableSig, withDecimal } from '../units/units'

/** Narrow no-break space between a number and its unit. */
export const NNBSP = ' '
const MINUS = '−'

/** A number with a fixed count of decimals, the readouts' decimal separator and a real minus sign. */
export function fixed(v: number | null | undefined, decimals: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const s = v.toFixed(Math.max(0, decimals))
  // −0.00 is 0.00
  const zero = Number(s) === 0
  return withDecimal(zero ? s.replace('-', '') : s).replace('-', MINUS)
}

/** A number with significant digits (×10ⁿ outside 10⁻³ … 10⁶), real minus sign. */
export function sig(v: number | null | undefined, digits = 3): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return readableSig(v, digits).replace('-', MINUS)
}

/** Number and unit with the narrow space; a unit of '' gives the bare number. */
export function withUnit(num: string, unit: string): string { return unit && num !== '—' ? `${num}${NNBSP}${unit}` : num }

/** A quantity with fixed decimals: `qty(20, 'mL', 2)` → “20.00 mL”. */
export function qty(v: number | null | undefined, unit: string, decimals: number): string { return withUnit(fixed(v, decimals), unit) }

/** Temperature for display: °C from kelvin. */
export function fmtTemp(kelvin: number | null | undefined, decimals = 1): string {
  return qty(kelvin === null || kelvin === undefined ? null : kelvin - 273.15, '°C', decimals)
}
/** The same temperature in kelvin (tooltips). */
export function fmtKelvin(kelvin: number | null | undefined): string { return qty(kelvin, 'K', 2) }

/** Volume in mL; `decimals` from the vessel's scale when it has one. */
export function fmtVolume(mL: number | null | undefined, decimals = 1): string { return qty(mL, 'mL', decimals) }

/** Mass in g (mg below 0.1 g when no instrument fixes the decimals). */
export function fmtMass(g: number | null | undefined, decimals?: number): string {
  if (g === null || g === undefined || !Number.isFinite(g)) return '—'
  if (decimals !== undefined) return qty(g, 'g', decimals)
  if (g !== 0 && Math.abs(g) < 0.1) return withUnit(sig(g * 1000, 3), 'mg')
  return withUnit(sig(g, 4), 'g')
}

/** Amount of substance: mol, mmol or µmol, three significant digits. */
export function fmtAmount(mol: number | null | undefined, digits = 3): string {
  if (mol === null || mol === undefined || !Number.isFinite(mol)) return '—'
  const a = Math.abs(mol)
  if (a === 0) return withUnit('0', 'mol')
  if (a >= 0.1) return withUnit(sig(mol, digits), 'mol')
  if (a >= 1e-4) return withUnit(sig(mol * 1e3, digits), 'mmol')
  if (a >= 1e-7) return withUnit(sig(mol * 1e6, digits), 'µmol')
  return withUnit(sig(mol, digits), 'mol')
}

/** Concentration: mol/L, mmol/L below 10⁻³ mol/L, powers of ten below 10⁻⁶. */
export function fmtConc(molPerL: number | null | undefined, digits = 3): string {
  if (molPerL === null || molPerL === undefined || !Number.isFinite(molPerL)) return '—'
  const a = Math.abs(molPerL)
  if (a === 0) return withUnit('0', 'mol/L')
  if (a >= 1e-3) return withUnit(sig(molPerL, digits), 'mol/L')
  if (a >= 1e-6) return withUnit(sig(molPerL * 1e3, digits), 'mmol/L')
  return withUnit(sig(molPerL, digits), 'mol/L')
}

/** Pressure in kPa from pascal. */
export function fmtPressure(pa: number | null | undefined, decimals = 1): string { return qty(pa === null || pa === undefined ? null : pa / 1000, 'kPa', decimals) }

/** pH to the decimals of what shows it (a meter: 2). */
export function fmtPH(pH: number | null | undefined, decimals = 2): string { return fixed(pH, decimals) }

/** Power in W. */
export function fmtPower(w: number | null | undefined): string { return qty(w, 'W', 0) }

/** Bench time: s below two minutes, then min:s, then h:min. */
export function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  if (seconds < 120) return qty(seconds, 's', seconds < 10 && seconds !== Math.round(seconds) ? 1 : 0)
  const s = Math.round(seconds)
  if (s < 3600) return `${withUnit(String(Math.floor(s / 60)), 'min')} ${withUnit(String(s % 60).padStart(2, '0'), 's')}`
  return `${withUnit(String(Math.floor(s / 3600)), 'h')} ${withUnit(String(Math.floor((s % 3600) / 60)).padStart(2, '0'), 'min')}`
}

/** An amount of the log (`{ value, unit }`) as the dialog and the record write it. */
export function fmtAmountOf(a: { value: number; unit: string }): string {
  switch (a.unit) {
    case 'mL': return qty(a.value, 'mL', 2)
    case 'L': return withUnit(sig(a.value, 4), 'L')
    case 'drop': return fixed(a.value, 0)
    case 'g': return qty(a.value, 'g', 2)
    case 'mg': return withUnit(sig(a.value, 4), 'mg')
    case 'kg': return withUnit(sig(a.value, 4), 'kg')
    case 'mol': return withUnit(sig(a.value, 4), 'mol')
    case 'mmol': return withUnit(sig(a.value, 4), 'mmol')
    default: return withUnit(formatSig(a.value, 4), a.unit)
  }
}
