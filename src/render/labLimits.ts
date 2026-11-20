/**
 * 26.65: pure helpers of the physics lab readouts — the one unit set of the gas lab (D13), the temperature ranges of the
 * thermal-equilibrium lab (M9) and the input limits of the wave-optics lab (M10). No physics is computed here: the
 * values come from the core; these only choose units and keep inputs in the range a lab models.
 */
import { formatSig } from '../units/units'

// ---- Gas and heat engines (D13) ----

/**
 * The units of the gas lab, on the canvas, in the p–V chart and in the readouts alike: pressure in kPa, volume in L,
 * temperature in K (the cylinder used to say "p = 7.597e+4 Pa, V = 0.003283 m³" beside a chart in kPa and L).
 */
export const GAS_UNITS = { p: { unit: 'kPa', per: 1e-3 }, V: { unit: 'L', per: 1e3 }, T: { unit: 'K', per: 1 } } as const
export type GasQuantity = keyof typeof GAS_UNITS

/** An SI value (Pa, m³, K) in the lab's unit. */
export function gasValue(q: GasQuantity, si: number): number { return si * GAS_UNITS[q].per }

/** An SI value as the lab shows it: "75.97 kPa", "3.283 L", "300 K". */
export function gasText(q: GasQuantity, si: number, digits = 4): string {
  return `${formatSig(gasValue(q, si), digits)} ${GAS_UNITS[q].unit}`
}

// ---- Thermal equilibrium (M9) ----

/**
 * The initial temperatures (°C) the thermal-equilibrium lab accepts for each substance: the substance stays in the
 * phase its specific heat belongs to (water liquid between 0 and 100 °C, ice below 0 °C …). Melting and boiling are
 * not modelled, so a body is never started across a phase change; the lab says so beside the inputs.
 */
export const MIX_RANGES: Readonly<Record<string, { min: number; max: number }>> = {
  water: { min: 0, max: 100 },
  oil: { min: -40, max: 150 },
  alcohol: { min: -100, max: 78 },
  ice: { min: -50, max: 0 },
  al: { min: -50, max: 600 },
  iron: { min: -50, max: 1000 },
  cu: { min: -50, max: 1000 },
  sand: { min: -50, max: 1000 }
}

/** The range of a substance (an unknown one: water's). */
export function phaseRange(id: string): { min: number; max: number } { return MIX_RANGES[id] ?? MIX_RANGES.water }

/** A temperature brought into the substance's range (a body keeps its value when it is already inside). */
export function clampToPhase(id: string, t: number): number {
  const r = phaseRange(id)
  if (!Number.isFinite(t)) return Math.min(r.max, Math.max(r.min, 20))
  return Math.min(r.max, Math.max(r.min, t))
}

/** The temperature lies outside the substance's range (the result would need a phase change the lab does not model). */
export function outsidePhase(id: string, t: number): boolean {
  const r = phaseRange(id)
  return !(t >= r.min - 1e-9 && t <= r.max + 1e-9)
}

// ---- Interference and diffraction (M10) ----

/**
 * Limits of the wave-optics inputs (SI): wide enough for every school setup (slits of 0.1 µm to 1 mm, spacings up to
 * 5 mm, screens up to 10 m away and 0.5 m wide), tight enough that the core never lists more than some ten thousand
 * maxima (about 2·d/λ at most) and a mistyped unit cannot ask for millions.
 */
export const WAVE_LIMITS = {
  a: { min: 1e-7, max: 1e-3 },
  d: { min: 1e-7, max: 5e-3 },
  L: { min: 0.01, max: 10 },
  half: { min: 1e-4, max: 0.5 },
  /** Thin film: thickness range in nm. */
  t: { min: 0, max: 20000 }
} as const
