/**
 * The lab calculations of the Rust core (26.54, D76; engine/velophi-core/src/labs, engine/CALC.md): field lines and
 * potentials, DC circuits, geometric optics, atoms and light, radioactive decay, special relativity and heat. Every
 * function is one stateless `calc` request; the interface only edits, draws and shows the results (D65).
 */
import { calc } from './core'

// ---- Fields (D79) ----

/** A point charge for the field map: centre (m), charge (C), radius of its softening ball (m). */
export interface PointCharge { x: number; y: number; q: number; r: number }
/** Sources of a field: point charges, a uniform field (V/m) and the Coulomb constant. */
export interface FieldSources { charges: PointCharge[]; E?: { x: number; y: number }; k?: number }
/** Field lines (polylines) and equipotential lines (segments by level). */
export interface FieldMap {
  lines: { xy: Float64Array; starts: number[]; charge: number[] }
  contours: { levels: number[]; segs: Float64Array; starts: number[] }
}

/** Field lines from the positive charges and equipotentials in a region of the plane. */
export function fieldMap(src: FieldSources, region: { x0: number; y0: number; x1: number; y1: number }, opts: { perCharge?: number; grid?: number; levels?: number } = {}): FieldMap {
  return calc<FieldMap>({ op: 'fieldMap', ...src, region, ...opts })
}

/** Field E (V/m) and potential V (V) at points. */
export function fieldAt(src: FieldSources, points: Array<{ x: number; y: number }>): { E: Array<{ x: number; y: number }>; V: number[] } {
  return calc({ op: 'fieldAt', ...src, points })
}

// ---- DC circuits (D80) ----

/** Kind of a circuit element. */
export type CircuitKind = 'wire' | 'switch' | 'resistor' | 'lamp' | 'rheostat' | 'battery' | 'ammeter' | 'voltmeter' | 'capacitor'
  // 26.55 (D89)
  | 'inductor' | 'ac' | 'diode' | 'motor' | 'transformer' | 'fuse' | 'rcd' | 'thermistor' | 'ldr' | 'fsr' | 'galvanometer' | 'probe'

/**
 * A circuit element between nodes `a` and `b` (any keys; equal keys are connected), with its parameters (SI):
 * battery E, r (a is +); resistor R; lamp U, P (rated); rheostat R, pos (and slider node c); ammeter r; voltmeter r
 * (absent: ideal); capacitor C; switch closed.
 */
export interface CircuitElement {
  id: string
  kind: CircuitKind
  a: string
  b: string
  c?: string
  /** Fourth terminal of a transformer (secondary −) or an RCD (neutral, load side). */
  d?: string
  E?: number; r?: number; R?: number; U?: number; P?: number; pos?: number; C?: number; closed?: boolean
  // 26.55: inductor L; ac f, phase; motor k, J, fr (friction), load, generator, omega; transformer n1, n2, r2; fuse/rcd/galvanometer I;
  // thermistor beta, T; ldr gamma, lux; fsr F0, F; probe channel
  L?: number; f?: number; phase?: number; k?: number; J?: number; fr?: number; load?: number; generator?: boolean; omega?: number
  n1?: number; n2?: number; r2?: number; I?: number; beta?: number; T?: number; gamma?: number; lux?: number; F0?: number; F?: number; channel?: number
}

/** Values of an element: U = V(a) − V(b), I from a to b, P = UI absorbed; lamp brightness or capacitor charge in `extra`. */
export interface CircuitValues { U: number | null; I: number | null; P: number | null; Iparts?: [number, number]; extra?: number }
/** Kinds of circuit issues: shorted ideal battery, contradicting ideal sources, no source, floating part, reversed meter, overloaded lamp. */
export type CircuitIssueKind = 'shortIdeal' | 'conflict' | 'noSource' | 'floating' | 'meterReversed' | 'lampOver' | 'needsRun' | 'motorStalled' | 'fuseBlown' | 'rcdTripped' | 'meterOver'
export interface CircuitSolution {
  ok: boolean
  issues: Array<{ kind: CircuitIssueKind; elements: string[]; fatal: boolean }>
  nodes: Record<string, number | null>
  elements: Record<string, CircuitValues>
  relations: Array<{ kind: 'series' | 'parallel'; elements: string[] }>
}

/** Solve a DC circuit in the steady state (modified nodal analysis). */
export function circuitSolve(elements: CircuitElement[]): CircuitSolution {
  return calc<CircuitSolution>({ op: 'circuitSolve', elements })
}

/** Equivalent resistance (Ω) between two nodes with the batteries taken out; null: no conducting path. */
export function circuitResistance(elements: CircuitElement[], a: string, b: string): number | null {
  return calc<{ R: number | null }>({ op: 'circuitResistance', elements, a, b }).R
}

// ---- Geometric optics (D81) ----

export interface OpticsSeg { x1: number; y1: number; x2: number; y2: number; virtual: boolean }
/** Image of an object arrow: image distance v and magnification m (null: object at the focal point). */
export interface OpticsImage { v: number | null; m: number | null; tip: { x: number; y: number } | null; real: boolean; upright: boolean; rays: OpticsSeg[][] }

/** Thin lens or spherical mirror (paraxial) of focal length f; object distance u, height h. */
export function opticsImage(element: 'lens' | 'mirror', f: number, u: number, h: number): OpticsImage {
  return calc<OpticsImage>({ op: 'opticsImage', element, f, u, h })
}

/** An element of the ray-tracing bench (angles in rad, lengths in m). */
export type OpticsElement =
  | { type: 'mirror' | 'screen'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'arcMirror'; x: number; y: number; angle: number; R: number; half: number }
  | { type: 'lens'; x: number; y: number; angle: number; f: number; half: number }
  | { type: 'glass'; points: Array<{ x: number; y: number }>; n: number; disp?: number }
  | { type: 'halfDisc' | 'disc'; x: number; y: number; r: number; angle?: number; n: number; disp?: number }
/** A light source; colour white (absent) or one band. */
export type OpticsSource =
  | { type: 'ray'; x: number; y: number; angle: number; color?: 'red' | 'green' | 'blue' }
  | { type: 'beam'; x: number; y: number; angle: number; width: number; count: number; color?: 'red' | 'green' | 'blue' }
  | { type: 'point'; x: number; y: number; angle: number; spread: number; count: number; color?: 'red' | 'green' | 'blue' }
/** An interaction of a primary ray: 0 mirror, 1 refraction, 2 total internal reflection, 3 lens. */
export interface OpticsInteraction { x: number; y: number; kind: 0 | 1 | 2 | 3; nx: number; ny: number; incidence: number; outgoing: number; n1: number; n2: number }
/** Traced rays: segments (x1, y1, x2, y2, band −1 white / 0 red / 1 green / 2 blue, intensity) × N. */
export interface OpticsTrace { segments: Float64Array; interactions: OpticsInteraction[]; hits: Array<[number, number, number, number]> }

export function opticsTrace(elements: OpticsElement[], sources: OpticsSource[], partial = true): OpticsTrace {
  return calc<OpticsTrace>({ op: 'opticsTrace', elements, sources, partial })
}

// ---- Atoms and light (D82) ----

export interface SpectralLine { upper: number; lower: number; energy: number; frequency: number; wavelength: number; series: string; visible: boolean }
export interface HydrogenResult {
  levels: number[]
  lines: SpectralLine[]
  line?: SpectralLine
  excite?: { levels: number[]; ionizes: boolean; free: number | null }
}

/** Hydrogen levels (eV), all lines up to maxN, one transition, and what a photon or electron of `energy` eV can excite. */
export function hydrogen(req: { maxN?: number; upper?: number; lower?: number; energy?: number; from?: number; by?: 'photon' | 'electron' }): HydrogenResult {
  return calc<HydrogenResult>({ op: 'hydrogen', ...req })
}

export interface PhotoResult {
  frequency: number; wavelength: number; photon: number; work: number; ekMax: number; stopVoltage: number
  thresholdFrequency: number; thresholdWavelength: number; photonRate: number; saturation: number; emits: boolean
  current: number | null
  /** I–U curve: U, I pairs. */
  curve: Float64Array
}

/** Photoelectric effect: work function W (eV), light by wavelength (nm) or frequency (Hz), power (W), anode voltage U. */
export function photoelectric(req: { W: number; wavelength?: number; frequency?: number; power: number; efficiency?: number; U?: number; uMin?: number; uMax?: number; samples?: number }): PhotoResult {
  return calc<PhotoResult>({ op: 'photoelectric', ...req })
}

// ---- Radioactive decay (D83) ----

export interface DecayResult { p: number; stepOf: Float64Array; counts: Float64Array; theory: Float64Array; halvings: Array<number | null> }

/** N₀ nuclei with half-life T½, steps of Δt, a seed: the step each nucleus decays in (0: not within the run). */
export function decay(req: { n0: number; halfLife: number; dt: number; steps: number; seed: number }): DecayResult {
  return calc<DecayResult>({ op: 'decay', ...req })
}

// ---- Special relativity (D84) ----

export interface RelativityResult {
  beta: number; gamma: number; dilated: number; contracted: number
  events: Array<{ x: number; t: number }>
  u: number
  dynamics: { gamma: number; p: number; pClassical: number; E: number; E0: number; Ek: number; EkClassical: number }
  /** γ(β): β, γ pairs. */
  curve: Float64Array
}

export function relativity(req: { beta: number; properTime?: number; properLength?: number; events?: Array<{ x: number; t: number }>; uPrime?: number; mass?: number }): RelativityResult {
  return calc<RelativityResult>({ op: 'relativity', ...req })
}

// ---- Heat (D85) ----

export interface Substance { cSolid: number; cLiquid: number; cGas: number; tMelt: number; tBoil: number; lFusion: number; lVapour: number; softFrom?: number; softTo?: number }
export interface HeatStage { t0: number; t1: number; temp0: number; temp1: number; phase: 'solid' | 'melting' | 'liquid' | 'boiling' | 'gas' | 'softening'; heat: number }

export function heatingCurve(substance: Substance, m: number, P: number, t0: number, tEnd: number): HeatStage[] {
  return calc<{ stages: HeatStage[] }>({ op: 'heatingCurve', substance, m, P, t0, tEnd }).stages
}

export interface MixResult { tEq: number; tau: number; heat: number; curve: Float64Array }

/** Two bodies exchanging heat through conductance k (W/°C): equilibrium, time constant and the temperature curves (t, T₁, T₂). */
export function heatMix(req: { c1: number; m1: number; t1: number; c2: number; m2: number; t2: number; k: number; duration?: number; samples?: number }): MixResult {
  return calc<MixResult>({ op: 'heatMix', ...req })
}

// ---- 26.55: circuits in time (D89) ----

/** Dynamic state of an element: [x (capacitor U, inductor I), ω, switching state, melt / rcd integral]. */
export type ElemState = [number, number, number, number]
export interface CircuitEvent { t: number; kind: 'diodeOn' | 'diodeOff' | 'motorStart' | 'motorStop' | 'motorReverse' | 'fuseBlown' | 'rcdTripped' | 'jump'; element: string | null; energy: number }
export interface CircuitRun {
  ok: boolean
  fatal: string | null
  /** Sample times (samples + 1, from t0). */
  t: Float64Array
  /** Per sample and element (sample-major): U, I and the kind-specific X, Y. */
  U: Float64Array; I: Float64Array; X: Float64Array; Y: Float64Array
  energy: Record<string, number>
  mech: Record<string, number>
  stored: number
  state: Record<string, ElemState>
  events: CircuitEvent[]
  steps: number; minStep: number; maxStep: number
}

/** Integrate a circuit from `state` over `duration` (samples + 1 sample points). */
export function circuitRun(elements: CircuitElement[], req: { t0: number; duration: number; samples: number; state?: Record<string, ElemState>; rtol?: number }): CircuitRun {
  return calc<CircuitRun>({ op: 'circuitRun', elements, ...req })
}

export interface PlateResult { C: number; Q: number; U: number; E: number; sigma: number; energy: number; density: number; C0: number; Q0: number; U0: number; E0: number; energy0: number; batteryWork: number; handWork: number }
/** Parallel-plate capacitor (S m², d m, εr), connected to a battery (U fixed) or isolated (Q fixed); S0, d0, er0: before a change. */
export function plateCapacitor(req: { S: number; d: number; er: number; mode: 'battery' | 'isolated'; U?: number; Q?: number; S0?: number; d0?: number; er0?: number }): PlateResult {
  return calc<PlateResult>({ op: 'plateCapacitor', ...req })
}

// ---- Magnetic fields ----

export interface MagnetSources {
  wires?: Array<{ x: number; y: number; I: number; r?: number }>
  magnets?: Array<{ x: number; y: number; angle: number; length: number; thickness: number; M: number }>
  solenoids?: Array<{ x: number; y: number; angle: number; length: number; thickness: number; turns: number; I: number; r?: number }>
  B?: { x: number; y: number }
}
export interface MagnetMap {
  contours: { levels: number[]; segs: Float64Array; starts: number[] }
  arrows: Float64Array
  probes: Array<{ Bx: number; By: number; A: number }>
  forces: Array<{ x: number; y: number }>
  flux: number | null
  wires: Array<[number, number, number]>
}
export function magnetMap(src: MagnetSources, req: { region: { x0: number; y0: number; x1: number; y1: number }; grid?: number; lines?: number; arrows?: number; probes?: Array<{ x: number; y: number }>; loop?: { x1: number; y1: number; x2: number; y2: number } | null }): MagnetMap {
  return calc<MagnetMap>({ op: 'magnetMap', ...src, ...req })
}

// ---- Waves and sound (D93) ----

export interface WaveEnd { type: 'fixed' | 'free' | 'driven' | 'absorb'; amp?: number; freq?: number; phase?: number; pulse?: number }
export interface WaveSpec { n: number; length: number; c1: number; c2?: number; split?: number; damping?: number; left: WaveEnd; right: WaveEnd }
export interface WaveRun { dt: number; dx: number; stepsPerFrame: number; frames: Float64Array; t: number[]; u: number[]; prev: number[]; energy: number }
/** Advance the string; without `prev` the displacements `u` are at rest. */
export function waveRun(spec: WaveSpec, req: { u: number[]; prev?: number[]; t0: number; duration: number; frames: number }): WaveRun {
  return calc<WaveRun>({ op: 'waveRun', ...spec, ...req })
}
export interface DopplerResult { ahead: number | null; behind: number | null; mach: number; fronts: number[] }
export function doppler(req: { f: number; c: number; vs: number; vo: number; t: number; max?: number }): DopplerResult {
  return calc<DopplerResult>({ op: 'doppler', ...req })
}
export interface SoundInfo { note: number; octave: number; cents: number; intensity: number; level: number; wavelength: number; period: number }
export function soundInfo(req: { f: number; amp: number; rho?: number; v?: number }): SoundInfo {
  return calc<SoundInfo>({ op: 'sound', ...req })
}

export interface SlitPattern { x: Float64Array; I: Float64Array; rgb: Float64Array; maxima: Array<[number, number]>; minima: Array<[number, number]>; spacing: number; centralWidth: number; color: number[] }
export interface FilmPattern { t: Float64Array; R: Float64Array; rgb: Float64Array; Rat: number }
/** Fraunhofer pattern of 1, 2 or N slits (a, d, L, half in m; lambda in nm). */
export function slitPattern(req: { setup: 'single' | 'double' | 'grating'; lambda: number; white: boolean; a: number; d: number; N?: number; L: number; half: number; samples?: number }): SlitPattern {
  return calc<SlitPattern>({ op: 'waveOptics', ...req })
}
/** Reflectance of a thin film over thicknesses t0 … t1 (nm). */
export function filmPattern(req: { lambda: number; white: boolean; n0: number; n1: number; n2: number; t0: number; t1: number; t: number; samples?: number }): FilmPattern {
  return calc<FilmPattern>({ op: 'waveOptics', setup: 'film', ...req })
}
/** Intensity after each polarizer (angles in rad); input polarization angle or unpolarized. */
export function polarizers(angles: number[], input: number | null): number[] {
  return calc<{ I: number[] }>({ op: 'waveOptics', setup: 'polarizer', angles, input }).I
}

// ---- Quantum (D94) ----

export interface QPotential { kind: 'free' | 'barrier' | 'step' | 'well' | 'harmonic' | 'double' | 'box' | 'points'; V0?: number; c?: number; w?: number; gap?: number; omega?: number; points?: Array<{ x: number; V: number }> }
export interface QSetup { units: { length: number; energy: number; time: number }; x: Float64Array; V: Float64Array; dx: number; energies: number[]; states: Float64Array }
export interface QExpect { t: number; norm: number; x: number; dx: number; p?: number; dp?: number; energy: number; left?: number; right?: number }
export interface QRun { prob: Float64Array; re: Float64Array; im: Float64Array; expect: QExpect[]; absorbed: number; dt?: number; steps?: number; theoryT?: number; energies?: number[] }
export function quantumSetup(req: { potential: QPotential; x0?: number; x1?: number; n: number; states: number }): QSetup {
  return calc<QSetup>({ op: 'quantumSetup', ...req })
}
export function quantumRun(req: { potential: QPotential; x0?: number; x1?: number; n: number; re?: number[]; im?: number[]; packet?: { x0: number; sigma: number; k0: number }; cre?: number[]; cim?: number[]; t0: number; duration: number; frames: number; absorb?: number; split?: number }): QRun {
  return calc<QRun>({ op: 'quantumRun', ...req })
}
export function barrierT(V0: number, w: number, E: number[]): number[] {
  return calc<{ T: number[] }>({ op: 'barrierT', V0, w, E }).T
}

// ---- Gases (D95) ----

export interface GasState { p: number; V: number; T: number }
export interface GasProcess { kind: 'isothermal' | 'isobaric' | 'isochoric' | 'adiabatic'; from: GasState; to: GasState; W: number; Q: number; dU: number; curve: number[] }
export interface GasCycle { processes: GasProcess[]; Qin: number; Qout: number; W: number; efficiency: number; theory: number }
export function gasProcess(req: { n: number; gamma: number; p: number; V: number; kind: GasProcess['kind']; target: number; samples?: number }): GasProcess {
  return calc<GasProcess>({ op: 'gasProcess', ...req })
}
export function gasCycle(req: { kind: 'carnot' | 'otto' | 'rectangle'; n: number; gamma: number; Th?: number; Tc?: number; V1?: number; V2?: number; T1?: number; r?: number; T3?: number; p1?: number; p2?: number; samples?: number }): GasCycle {
  return calc<GasCycle>({ op: 'gasCycle', ...req })
}

// ---- Nuclear and modern ----

export interface ChainResult { t: Float64Array; N: Float64Array; A: Float64Array; lambda: number[]; at: number[] | null }
/** Decay chain (half-lives in any time unit, 0 = stable) from initial amounts n0. */
export function decayChain(req: { halfLives: number[]; n0: number[]; tEnd: number; samples?: number; t?: number }): ChainResult {
  return calc<ChainResult>({ op: 'decayChain', ...req })
}
export interface NuclideInfo { Z: number; A: number; symbol: string; B: number; BA: number; measured?: boolean; massExcess?: number; mass?: number }
export function binding(nuclides: Array<{ Z: number; A: number }> = []): { measured: NuclideInfo[]; semf: Array<[number, number, number]>; nuclides: NuclideInfo[] } {
  return calc({ op: 'binding', nuclides })
}
export interface ReactionParticle { kind: 'nuclide' | 'n' | 'e-' | 'e+' | 'gamma' | 'nu'; Z?: number; A?: number }
export interface ReactionResult { valid: boolean; A?: [number, number]; Z?: [number, number]; balanced?: boolean; Q?: number | null; estimated?: boolean }
export function reaction(before: ReactionParticle[], after: ReactionParticle[]): ReactionResult {
  return calc<ReactionResult>({ op: 'reaction', before, after })
}
export interface ComptonResult { lambda2: number; shift: number; compton: number; E1: number; E2: number; Ek: number; phi: number; curve: Float64Array }
/** Compton scattering of a photon of wavelength lambda (pm) by theta (rad). */
export function compton(lambda: number, theta: number): ComptonResult {
  return calc<ComptonResult>({ op: 'compton', lambda, theta })
}
