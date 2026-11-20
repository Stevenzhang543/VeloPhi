/**
 * The apparatus of the chemistry bench (26.64, D269): what each kind IS to the core, read from data/apparatus.json.
 *
 * - A **vessel** is an object of the core: a capacity, the heat capacity of its glass (mass × specific heat), a heat
 *   loss to the room, and a profile — the inner radius against the height — from which both the drawing and the
 *   liquid level come. The profile is scaled so that the volume up to its `full` mark is exactly the capacity, so a
 *   full vessel is drawn full and the level is the exact inverse of the volume (`levelOf` ↔ `volumeAt`).
 * - An **instrument** reads one field of the vessel it is put in, to its resolution.
 * - A **tool** performs one action of the log on the vessel it is on.
 *
 * Kinds whose function the core does not have yet carry `available: false` and are not offered on the shelf.
 * Nothing here computes chemistry: the level is geometry, the readings are the core's numbers rounded to what the
 * instrument can show.
 */
import data from './data/apparatus.json'
import type { Tri } from '../i18n/tri'
import { activeLang } from '../i18n/locale'
import type { Amount, BenchObject, CircuitState, VesselState } from '../engine/chem'

export type ApparatusRole = 'vessel' | 'instrument' | 'tool' | 'support'
export type GradStyle = 'none' | 'coarse' | 'fine' | 'mark'

/** A profile as written in the data: points from the bottom, `bowl` parts are slices of a sphere. */
export interface ProfileData {
  section: 'round' | 'box'
  /** Parallel tubes sharing the level (a U-tube has two). */
  arms?: number
  /** Depth of a box section (cm at the reference capacity). */
  depth?: number
  ref_mL: number
  /** Height of the capacity mark (cm at the reference capacity). */
  full: number
  base: [number, number]
  parts: Array<{ to: [number, number] } | { bowl: number; centre: number; to: number }>
}

export interface VesselData {
  capacities: number[]
  default: number
  glass_g?: Record<string, number>
  cp_J_gK?: number
  /** A heat capacity given directly (a calorimeter constant), per capacity. */
  heat_J_K?: Record<string, number>
  loss_W_K: number
  stopper: boolean
  /** Starts closed (a bomb). */
  closed?: boolean
  heat: boolean
  grad: GradStyle
  /** Graduations count down from the top (a burette reads what was delivered). */
  zero?: 'top'
  tap?: boolean
  /** Can be set up to collect gas (over water, by displacement of air). */
  collect?: boolean
  readRes_mL?: Record<string, number>
  profile: ProfileData
  draw: { spout?: boolean; foot?: boolean; rack?: boolean; ring?: boolean; sideArm?: boolean; uTube?: boolean; tubes?: boolean; tap?: 'glass' | 'rubber'; stand?: boolean; opaque?: boolean; wall?: 'thick'; lid?: boolean }
}

/** What an instrument reads: a field of the vessel, or (U, I) of the circuit the vessel is part of. */
export type ReadField = 'T' | 'pH' | 'mass_g' | 'gas_mL' | 'U' | 'I' | 'absorbance'
export interface InstrumentData { reads: ReadField; resolution: number; unit: string; display: 'digital' | 'scale' | 'strip' | 'litmus'; needs?: 'solution' | 'collect' | 'circuit'; place?: 'in' | 'under' | 'wire' | 'side'; range?: [number, number] }

/** `hand` (26.65, D297 item 7): a tool held in the hand — a dropper, a spatula, tweezers, a glass rod — not put on a vessel. */
export type ToolAction = 'heat' | 'bath' | 'stopper' | 'ignite' | 'filter' | 'connect' | 'pour' | 'electrode' | 'source' | 'bridge' | 'load' | 'flame' | 'flameFilter' | 'hand' | 'bottle'
/** `on`: where a tool may go — any vessel, one that may be heated or stoppered, or a vessel that is part of a circuit. */
/** `bottle` (26.65): a stock bottle of a reagent of the shelf (`reagent`), put on the bench as such. */
export interface ToolData { action: ToolAction; reagent?: string; power_W?: number; T_K?: number; amount?: Amount; resolution?: number; on: 'any' | 'heat' | 'stopper' | 'circuit'; flame?: 'soft' | 'blast' | 'none'; materials?: string[]; volts?: number[]; ohms?: number[]; /** Elements whose flame lines a filter absorbs. */ blocks?: string[] }

export interface ApparatusKind {
  id: string
  group: string
  role: ApparatusRole
  available: boolean
  /** Why it is not offered yet (a key; report and tests). */
  reason?: string
  icon: string
  name: Tri
  vessel?: VesselData
  instrument?: InstrumentData
  tool?: ToolData
}

export interface ApparatusGroup { id: string; name: Tri }

const DATA = data as unknown as { groups: ApparatusGroup[]; kinds: ApparatusKind[] }

/** Every kind of the data, offered or not. */
export const APPARATUS: readonly ApparatusKind[] = DATA.kinds
export const APPARATUS_GROUPS: readonly ApparatusGroup[] = DATA.groups
const BY_ID = new Map(APPARATUS.map(k => [k.id, k]))

export function kindOf(id: string): ApparatusKind | undefined { return BY_ID.get(id) }
/** The kinds on the shelf: those the core can do something with. */
export function shelfKinds(group?: string): ApparatusKind[] { return APPARATUS.filter(k => k.available && (!group || k.group === group)) }
export function kindName(k: ApparatusKind | undefined, fallback = ''): string { return k ? k.name[activeLang()] ?? k.name.zh : fallback }
export function groupName(g: ApparatusGroup): string { return g.name[activeLang()] ?? g.name.zh }

// ---- Profiles: height ↔ volume ----

/** A vessel's shape at one capacity: points (h, r) in cm from the inner bottom, and the volume below each point. */
export interface VesselShape {
  kind: string
  capacity_mL: number
  section: 'round' | 'box'
  arms: number
  depth: number
  /** Heights and inner radii (half widths of a box), cm. */
  h: number[]
  r: number[]
  /** Volume below each point, mL. */
  cum: number[]
  /** Height of the capacity mark and of the brim, cm. */
  full: number
  top: number
  /** Largest inner radius, cm. */
  rMax: number
  /** Volume to the brim, mL. */
  brim_mL: number
}

const BOWL_STEPS = 18

/** The points of a profile as written (reference size). */
function expand(p: ProfileData): Array<[number, number]> {
  const pts: Array<[number, number]> = [[p.base[0], p.base[1]]]
  for (const part of p.parts) {
    if ('bowl' in part) {
      const h0 = pts[pts.length - 1][0]
      const rad = (h: number) => Math.sqrt(Math.max(0, part.bowl * part.bowl - (h - part.centre) * (h - part.centre)))
      // the point the slice starts from lies on the sphere (the data may round it)
      pts[pts.length - 1][1] = rad(h0)
      // cosine spacing: finer where the wall turns fastest
      for (let i = 1; i <= BOWL_STEPS; i++) {
        const u = i / BOWL_STEPS
        const s = h0 === part.centre - part.bowl ? 1 - Math.cos((u * Math.PI) / 2) : u
        const h = h0 + (part.to - h0) * s
        pts.push([h, rad(h)])
      }
    } else pts.push([part.to[0], part.to[1]])
  }
  return pts
}

/** Volume of the part of one segment below x above its lower end (cm³): r = r0 + k·x. */
function segVolume(section: 'round' | 'box', arms: number, depth: number, r0: number, k: number, x: number): number {
  return section === 'round' ? arms * Math.PI * x * (r0 * r0 + r0 * k * x + (k * k * x * x) / 3) : arms * 2 * depth * x * (r0 + (k * x) / 2)
}

const shapes = new Map<string, VesselShape>()

/** The shape of a vessel kind at a capacity (cached). Throws for a kind that is no vessel. */
export function shapeOf(kind: string, capacity_mL?: number): VesselShape {
  const k = BY_ID.get(kind)
  const v = k?.vessel
  if (!v) throw new Error(`apparatus: ${kind} is not a vessel`)
  const cap = capacity_mL && capacity_mL > 0 ? capacity_mL : v.default
  const key = `${kind}@${cap}`
  const cached = shapes.get(key)
  if (cached) return cached
  const p = v.profile
  const arms = p.arms ?? 1
  const ref = expand(p)
  // volume to the mark at the reference size, then one scale factor for every length
  const refShape = build(kind, 0, p.section, arms, p.depth ?? 0, ref, p.full)
  const s = Math.cbrt(cap / volumeAt(refShape, p.full))
  const shape = build(kind, cap, p.section, arms, (p.depth ?? 0) * s, ref.map(([h, r]) => [h * s, r * s] as [number, number]), p.full * s)
  shapes.set(key, shape)
  return shape
}

function build(kind: string, capacity_mL: number, section: 'round' | 'box', arms: number, depth: number, pts: Array<[number, number]>, full: number): VesselShape {
  const h = pts.map(q => q[0]), r = pts.map(q => q[1])
  const cum = [0]
  for (let i = 1; i < h.length; i++) {
    const dh = h[i] - h[i - 1]
    cum.push(cum[i - 1] + (dh > 0 ? segVolume(section, arms, depth, r[i - 1], (r[i] - r[i - 1]) / dh, dh) : 0))
  }
  return { kind, capacity_mL, section, arms, depth, h, r, cum, full, top: h[h.length - 1], rMax: Math.max(...r), brim_mL: cum[cum.length - 1] }
}

/** Volume (mL) below the height `level` (cm from the inner bottom). */
export function volumeAt(s: VesselShape, level: number): number {
  if (!(level > s.h[0])) return 0
  if (level >= s.top) return s.brim_mL
  let i = 1
  while (s.h[i] < level) i++
  const dh = s.h[i] - s.h[i - 1]
  return s.cum[i - 1] + segVolume(s.section, s.arms, s.depth, s.r[i - 1], (s.r[i] - s.r[i - 1]) / dh, level - s.h[i - 1])
}

/** Height (cm) of the surface of `volume_mL` of liquid: the inverse of `volumeAt`, clamped to the brim. */
export function levelOf(s: VesselShape, volume_mL: number): number {
  if (!(volume_mL > 0)) return s.h[0]
  if (volume_mL >= s.brim_mL) return s.top
  let i = 1
  while (s.cum[i] < volume_mL) i++
  const dh = s.h[i] - s.h[i - 1]
  const r0 = s.r[i - 1], k = (s.r[i] - r0) / dh
  const v = volume_mL - s.cum[i - 1]
  // a monotonic cubic (or quadratic) in x on [0, dh]: Newton steps kept inside a shrinking bracket
  let lo = 0, hi = dh
  let x = dh * (v / (s.cum[i] - s.cum[i - 1]))
  for (let n = 0; n < 80; n++) {
    const f = segVolume(s.section, s.arms, s.depth, r0, k, x) - v
    if (f > 0) hi = x
    else lo = x
    const rx = r0 + k * x
    const area = s.section === 'round' ? s.arms * Math.PI * rx * rx : s.arms * 2 * s.depth * rx
    let next = area > 0 ? x - f / area : (lo + hi) / 2
    if (!(next > lo && next < hi)) next = (lo + hi) / 2
    if (Math.abs(next - x) <= 1e-15 * dh) { x = next; break }
    x = next
  }
  return s.h[i - 1] + x
}

/** Inner radius (cm) at a height. */
export function radiusAt(s: VesselShape, level: number): number {
  if (level <= s.h[0]) return s.r[0]
  if (level >= s.top) return s.r[s.r.length - 1]
  let i = 1
  while (s.h[i] < level) i++
  return s.r[i - 1] + ((s.r[i] - s.r[i - 1]) * (level - s.h[i - 1])) / (s.h[i] - s.h[i - 1])
}

/** Graduation marks of a vessel: volumes (mL), whether a mark is a major one, and its label. */
export function graduations(kind: string, capacity_mL: number): Array<{ mL: number; major: boolean; label: string | null }> {
  const v = BY_ID.get(kind)?.vessel
  if (!v || v.grad === 'none') return []
  if (v.grad === 'mark') return [{ mL: capacity_mL, major: true, label: null }]
  const nice = (x: number) => { const p = Math.pow(10, Math.floor(Math.log10(x))); const m = x / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p }
  const major = nice(capacity_mL / 5)
  const step = v.grad === 'fine' ? major / 5 : major
  const out: Array<{ mL: number; major: boolean; label: string | null }> = []
  const n = Math.round(capacity_mL / step)
  for (let i = v.zero === 'top' ? 0 : 1; i <= n; i++) {
    const mL = i * step
    const isMajor = Math.abs(mL / major - Math.round(mL / major)) < 1e-9
    // a burette counts from the top: the mark at volume V shows capacity − V
    const shown = v.zero === 'top' ? capacity_mL - mL : mL
    out.push({ mL, major: isMajor, label: isMajor ? String(Math.round(shown * 1000) / 1000) : null })
  }
  return out
}

// ---- Vessels as objects of the core ----

/** Heat capacity of the empty vessel (J/K): glass mass × specific heat, or the constant given in the data. */
export function heatCapacityOf(kind: string, capacity_mL: number): number {
  const v = BY_ID.get(kind)?.vessel
  if (!v) return 0
  const direct = v.heat_J_K?.[String(capacity_mL)]
  if (direct !== undefined) return direct
  const g = v.glass_g?.[String(capacity_mL)] ?? (v.glass_g?.[String(v.default)] ?? 0) * Math.pow(capacity_mL / v.default, 2 / 3)
  return g * (v.cp_J_gK ?? 0.84)
}

/** Heat loss to the room (W/K): the reference value scaled with the surface, capacity^(2/3). */
export function lossOf(kind: string, capacity_mL: number): number {
  const v = BY_ID.get(kind)?.vessel
  return v ? v.loss_W_K * Math.pow(capacity_mL / v.default, 2 / 3) : 0
}

/** Overpressure a rubber stopper pushed in by hand holds before it is blown out, kPa (a classroom figure). */
export const STOPPER_HOLDS_KPA = 50
/** Temperature difference glass and porcelain stand when something colder meets them hot, K (classroom figures). */
export const SHOCK_K = { glass: 100, porcelain: 150 }

/**
 * The object the core gets for a vessel kind (drawing fields are added by the bench). 26.65 (D297 item 9): with its
 * limits — the volume to its brim (more runs over onto the bench), whether it may be heated directly, the temperature
 * difference its glass stands. The overpressure its stopper holds (`burst_kPa`) is given to the vessels the user puts
 * on the bench (`bench.place`); a guided experiment's vessels are sealed as its set-up needs them.
 */
export function vesselObject(kind: string, id: string, capacity_mL?: number): BenchObject {
  const v = BY_ID.get(kind)?.vessel
  if (!v) throw new Error(`apparatus: ${kind} is not a vessel`)
  const cap = capacity_mL ?? v.default
  const o: BenchObject = { id, kind, capacity_mL: cap, heat_J_K: Math.round(heatCapacityOf(kind, cap) * 1000) / 1000, loss_W_K: Math.round(lossOf(kind, cap) * 1e6) / 1e6 }
  if (v.closed) o.closed = true
  else o.brim_mL = Math.round(shapeOf(kind, cap).brim_mL * 100) / 100
  o.heatable = v.heat
  if (!v.draw.wall) o.shock_K = (v.cp_J_gK ?? 0.84) > 1 ? SHOCK_K.porcelain : SHOCK_K.glass
  return o
}

/** Smallest volume step a graduated vessel shows (mL); null when it has no scale. */
export function volumeResolution(kind: string, capacity_mL: number): number | null {
  return BY_ID.get(kind)?.vessel?.readRes_mL?.[String(capacity_mL)] ?? null
}

// ---- Instruments: a field of the vessel, to the instrument's resolution ----

/** Decimals that show a resolution: 0.01 → 2, 0.5 → 1, 1 → 0. */
export function decimalsFor(resolution: number): number {
  if (!(resolution > 0) || resolution >= 1) return 0
  return Math.min(6, Math.ceil(-Math.log10(resolution) - 1e-9))
}

/** A value rounded to a resolution. */
export function quantise(value: number, resolution: number): number {
  return resolution > 0 ? Math.round(value / resolution) * resolution : value
}

/**
 * What an instrument shows on a vessel: the core's number in the instrument's unit, rounded to its resolution; null
 * when the vessel has nothing for it to read (a pH meter in a dry vessel).
 */
export function instrumentReading(kind: string, v: VesselState, circuit?: CircuitState | null): { value: number; decimals: number; unit: string; nm?: number } | null {
  const ins = BY_ID.get(kind)?.instrument
  if (!ins) return null
  let raw: number | undefined
  if (ins.reads === 'U' || ins.reads === 'I') {
    if (!circuit) return null
    // a voltmeter across the electrodes: the voltage on the load while current flows, the cell's e.m.f. on open circuit
    const live = circuit.on && circuit.connected
    raw = ins.reads === 'I' ? (live ? Math.abs(circuit.I) : 0) : live ? circuit.U : circuit.connected ? circuit.emf : 0
  } else if (ins.reads === 'absorbance') {
    // a 1 cm cuvette at the wavelength of the strongest absorption (16 values per cm, 400 … 700 nm)
    const a = v.absorbance
    if (!a?.length) return null
    let at = 0
    for (let i = 1; i < a.length; i++) if (a[i] > a[at]) at = i
    return { value: quantise(a[at], ins.resolution), decimals: decimalsFor(ins.resolution), unit: ins.unit, nm: 400 + 20 * at }
  } else if (ins.reads === 'T') raw = v.T - 273.15
  else if (ins.reads === 'pH') raw = v.pH
  else if (ins.reads === 'mass_g') raw = v.mass_g
  else raw = v.gas_mL
  if (raw === undefined || !Number.isFinite(raw)) return null
  if (ins.needs === 'solution' && v.pH === undefined) return null
  return { value: quantise(raw, ins.resolution), decimals: decimalsFor(ins.resolution), unit: ins.unit }
}

/** Litmus paper: 'red' below its range, 'blue' above, 'between' inside; null without a solution. */
export function litmusState(kind: string, v: VesselState): 'red' | 'blue' | 'between' | null {
  const ins = BY_ID.get(kind)?.instrument
  if (!ins || ins.display !== 'litmus' || v.pH === undefined) return null
  const [lo, hi] = ins.range ?? [4.5, 8.3]
  return v.pH < lo ? 'red' : v.pH > hi ? 'blue' : 'between'
}

/** May this tool or instrument go on this vessel kind? */
export function fits(part: ApparatusKind, vesselKind: string): boolean {
  const v = BY_ID.get(vesselKind)?.vessel
  if (!v) return false
  if (part.tool) return part.tool.on === 'any' || part.tool.on === 'circuit' || (part.tool.on === 'heat' && v.heat) || (part.tool.on === 'stopper' && v.stopper)
  return !!part.instrument
}
