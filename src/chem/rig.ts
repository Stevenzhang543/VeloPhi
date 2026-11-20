/**
 * The bench as a set of things (26.65, D297 items 3–5): vessels, which are objects of the core, and fixtures — stands
 * with a clamp and a ring, tripods with gauze, test-tube racks, burners, hot plates, baths — which are drawing only and
 * live in the document's `fixtures` list (the core keeps it as given). Everything stands somewhere: on the bench, on a
 * support, in a rack, a bath or a clamp; a thing put down falls to the nearest support below it.
 *
 * Where geometry decides chemistry the log stays the only truth (D268): this module says what the geometry MEANS —
 * which vessel a lit burner heats, which bath a vessel stands in — and the store turns the difference from the core's
 * state into actions of the log (`heat`, `bath`) at the moment the hand lets go (`rigActions`). Nothing here is
 * chemistry: sizes are those of school apparatus, in cm; powers and temperatures are the settings the user chose.
 *
 * Coordinates: bench cm, x to the right, y up from the bench top. A vessel's `y` is the height of what it stands on
 * (its outer bottom), its `on` the fixture holding it.
 */
import type { BenchFixture } from '../engine/chem'
import { kindOf, shapeOf } from './apparatus'
import type { VesselShape } from './apparatus'

export type FixtureKind = 'stand' | 'tripod' | 'testTubeRack' | 'alcoholBurner' | 'blastBurner' | 'hotPlate' | 'waterBath' | 'iceBath' | 'reagentBottle' | 'pneumaticTrough' | 'tube'

/**
 * An end of a delivery tube (D297 item 8): free at (x, y), or in a vessel — `stopper` (through the stopper of the
 * vessel the gas comes from), `under` (under water, beneath the mouth of a jar standing on its mouth in a trough),
 * `mouth` (down to the bottom of an empty upright jar: collecting by upward displacement), `liquid` (dipping into a
 * vessel's liquid, limewater …).
 */
export interface TubeEnd { x: number; y: number; vessel?: string | null; at?: 'stopper' | 'under' | 'mouth' | 'liquid' | null }

/** How a reagent of the shelf stands on the bench (D297 item 6): a narrow bottle of a liquid, a wide one of a solid, a dropper bottle of an indicator. */
export type BottleStyle = 'narrow' | 'wide' | 'dropper'

/** A fixture as the document holds it. */
export interface Fixture extends BenchFixture {
  id: string
  kind: FixtureKind | string
  x: number
  y: number
  /** stand: height of the clamp's grip and of the ring above the base (cm; null: none), the side they reach to. */
  clamp?: number | null
  ring?: number | null
  side?: 1 | -1
  /** burners: the cap is on (alcohol lamp), it burns, the heat that reaches the vessel (W). */
  cap?: boolean
  lit?: boolean
  power?: number
  /** hot plate: switched on. */
  on?: boolean
  /** bath: temperature (K). */
  T?: number
  /** reagent bottle: the reagent of the shelf it holds, its kind of bottle, its stopper off (laid upside down beside it). */
  reagent?: string
  style?: BottleStyle
  open?: boolean
  /** delivery tube: its two ends — `a` where the gas comes from, `b` where it goes. */
  a?: TubeEnd
  b?: TubeEnd
}

/** Geometry of the fixtures (cm). */
export const RIG = {
  tripod: { h: 12.6, half: 6.8, gauze: 6.5 },
  stand: { rod: 46, baseL: 3, baseR: 15, reach: 8.5, ringR: 4.2, ringReach: 9, clampMin: 6, clampMax: 42, ringMin: 4, ringMax: 36 },
  rack: { w: 17, h: 8, slots: 4, pitch: 3.6, floor: 0.8, hold: 6.6 },
  alcoholBurner: { h: 8.6, half: 3.2, flame: 4.5 },
  blastBurner: { h: 17, half: 4.5, flame: 6.5 },
  hotPlate: { h: 4, half: 8, top: 7 },
  bath: { h: 7.5, half: 7.5, water: 5.2, floor: 0.6 },
  /** A pneumatic trough: half width, height of its walls, depth of its water, the shelf a jar stands on. */
  trough: { half: 12, h: 9, water: 6.6, shelf: 1.2 },
  /** Reagent bottles: half width and height with the stopper (the bodies are the profiles of the narrow and wide bottles). */
  bottle: { narrow: { half: 3.4, h: 14.2 }, wide: { half: 3.4, h: 12.8 }, dropper: { half: 2.7, h: 13.2 } },
  /** A burner heats a vessel whose outer bottom lies this far above its wick: past the inner cone, up to just above the tip. */
  heatFrom: 0.8,
  heatAbove: 1.6
} as const

/** Default settings of a new fixture of a kind. */
export function newFixture(kind: string, id: string, x: number, y = 0): Fixture {
  const f: Fixture = { id, kind, x: Math.round(x * 10) / 10, y }
  if (kind === 'stand') { f.clamp = 22; f.ring = null; f.side = 1 }
  if (kind === 'alcoholBurner') { f.cap = true; f.lit = false; f.power = powerOf('alcoholBurner') }
  if (kind === 'blastBurner') { f.lit = false; f.power = powerOf('blastBurner') }
  if (kind === 'hotPlate') { f.on = false; f.power = powerOf('hotPlate') }
  if (kind === 'waterBath' || kind === 'iceBath') f.T = kindOf(kind)?.tool?.T_K ?? (kind === 'iceBath' ? 273.15 : 333.15)
  return f
}

/** The heat a burner of a kind gives by default (apparatus.json), W. */
export function powerOf(kind: string): number { return kindOf(kind)?.tool?.power_W ?? 0 }

/** Range of the power setting of a heat source, W (the lamp's flame can be turned down and up). */
export function powerRange(kind: string): [number, number] {
  return kind === 'alcoholBurner' ? [50, 300] : kind === 'blastBurner' ? [300, 1200] : [50, 1000]
}

/** Range of a water bath's temperature, K. */
export const BATH_RANGE: [number, number] = [278.15, 368.15]

export const isFixtureKind = (kind: string): boolean => ['stand', 'tripod', 'testTubeRack', 'alcoholBurner', 'blastBurner', 'hotPlate', 'waterBath', 'iceBath', 'reagentBottle', 'pneumaticTrough', 'tube'].includes(kind)

/** The bottle a reagent of the shelf comes in: indicators in dropper bottles, solids in wide bottles, liquids in narrow ones; gases in none. */
export function bottleFor(r: { kind: string; group?: string } | undefined): BottleStyle | null {
  if (!r || r.kind === 'gas') return null
  if (r.group === 'indicator') return 'dropper'
  return r.kind === 'solid' ? 'wide' : 'narrow'
}
/** The profile a bottle is drawn with (the narrow and wide bottles of apparatus.json; a dropper bottle is a small narrow one). */
export function bottleShapeKind(style: BottleStyle | undefined): { kind: string; capacity_mL: number } {
  return style === 'wide' ? { kind: 'wideBottle', capacity_mL: 250 } : style === 'dropper' ? { kind: 'narrowBottle', capacity_mL: 125 } : { kind: 'narrowBottle', capacity_mL: 250 }
}
export const isBurner = (kind: string): boolean => kind === 'alcoholBurner' || kind === 'blastBurner'
export const isBath = (kind: string): boolean => kind === 'waterBath' || kind === 'iceBath'

/** Extent of a fixture (cm): left, right, bottom, top — for hit tests, layout and the view. */
export function fixtureBox(f: Fixture): { x0: number; x1: number; y0: number; y1: number } {
  switch (f.kind) {
    case 'stand': { const s = f.side ?? 1; const xs = [f.x - RIG.stand.baseL * s, f.x + RIG.stand.baseR * s]; return { x0: Math.min(...xs), x1: Math.max(...xs), y0: f.y, y1: f.y + RIG.stand.rod } }
    case 'tripod': return { x0: f.x - RIG.tripod.half, x1: f.x + RIG.tripod.half, y0: f.y, y1: f.y + RIG.tripod.h }
    case 'testTubeRack': return { x0: f.x - RIG.rack.w / 2, x1: f.x + RIG.rack.w / 2, y0: f.y, y1: f.y + RIG.rack.h }
    case 'alcoholBurner': return { x0: f.x - RIG.alcoholBurner.half, x1: f.x + RIG.alcoholBurner.half + (f.cap === false ? 3.4 : 0), y0: f.y, y1: f.y + RIG.alcoholBurner.h + (f.cap ? 1.6 : 0) }
    case 'blastBurner': return { x0: f.x - RIG.blastBurner.half, x1: f.x + RIG.blastBurner.half, y0: f.y, y1: f.y + RIG.blastBurner.h }
    case 'hotPlate': return { x0: f.x - RIG.hotPlate.half, x1: f.x + RIG.hotPlate.half, y0: f.y, y1: f.y + RIG.hotPlate.h }
    case 'waterBath': case 'iceBath': return { x0: f.x - RIG.bath.half, x1: f.x + RIG.bath.half, y0: f.y, y1: f.y + RIG.bath.h }
    case 'reagentBottle': { const b = RIG.bottle[f.style ?? 'narrow']; return { x0: f.x - b.half, x1: f.x + b.half + (f.open ? 3.6 : 0), y0: f.y, y1: f.y + b.h } }
    case 'pneumaticTrough': return { x0: f.x - RIG.trough.half, x1: f.x + RIG.trough.half, y0: f.y, y1: f.y + RIG.trough.h }
    case 'tube': { const xs = [f.a?.x ?? f.x, f.b?.x ?? f.x], ys = [f.a?.y ?? f.y, f.b?.y ?? f.y]; return { x0: Math.min(...xs) - 0.5, x1: Math.max(...xs) + 0.5, y0: Math.min(...ys) - 0.5, y1: Math.max(...ys) + 0.5 } }
    default: return { x0: f.x - 3, x1: f.x + 3, y0: f.y, y1: f.y + 6 }
  }
}

/** The x of the clamp's grip and of the ring's centre of a stand. */
export const clampX = (f: Fixture) => f.x + (f.side ?? 1) * RIG.stand.reach
export const ringX = (f: Fixture) => f.x + (f.side ?? 1) * RIG.stand.ringReach

/** A vessel as the rig sees it. */
export interface RigVessel {
  id: string
  kind: string
  capacity_mL: number
  x: number
  /** Height of its outer bottom. */
  y: number
  on: string | null
  /** How the fixture holds it. */
  at?: Spot['what'] | null
}

/** Half width (cm, with the wall) of a vessel kind at a capacity. */
export function halfOf(kind: string, capacity_mL?: number): number {
  try { const s = shapeOf(kind, capacity_mL); const v = kindOf(kind)?.vessel; return (v?.draw.foot ? s.rMax * 1.9 : v?.draw.uTube ? s.r[0] * 3.2 : s.rMax) + 0.2 } catch { return 3 }
}

/** Outer height of a vessel (cm, from its outer bottom to its rim). */
export function heightOf(kind: string, capacity_mL?: number): number {
  try { const s: VesselShape = shapeOf(kind, capacity_mL); return s.top + 0.25 + (kindOf(kind)?.vessel?.draw.foot ? 0.35 : 0) } catch { return 10 }
}

/** Where a clamp grips a vessel: the height above its outer bottom (near the mouth of a tube, at the neck of a flask). */
export function gripOf(kind: string, capacity_mL?: number): number {
  const h = heightOf(kind, capacity_mL)
  const v = kindOf(kind)?.vessel
  if (kind === 'testTube') return h * 0.72
  if (v?.tap) return h * 0.62
  if (kind === 'roundFlask' || kind === 'distillingFlask' || kind === 'volumetricFlask' || kind === 'erlenmeyer') return h * 0.84
  return h * 0.7
}

/** A place a vessel can be put: the height of its outer bottom there, and what holds it. */
export interface Spot { x: number; y: number; on: string | null; what: 'bench' | 'gauze' | 'ring' | 'plate' | 'bath' | 'slot' | 'clamp' | 'trough' }

/** Can a vessel of this kind collect gas (a gas jar, a test tube)? Only these stand on their mouth in a trough. */
export const collects = (kind: string): boolean => !!kindOf(kind)?.vessel?.collect || kind === 'testTube'

/** Can a vessel of this kind be held in a rack's slot? */
const slender = (kind: string, capacity_mL?: number) => halfOf(kind, capacity_mL) <= 1.3

/** Every place a vessel of this kind could stand or be held, other than the bench. */
export function spotsFor(fixtures: Fixture[], vessels: RigVessel[], v: { id: string; kind: string; capacity_mL: number }): Spot[] {
  const out: Spot[] = []
  const half = halfOf(v.kind, v.capacity_mL)
  const taken = (on: string, what: Spot['what'], x?: number) => vessels.some(o => o.id !== v.id && o.on === on && o.at === what && (x === undefined || Math.abs(o.x - x) < 0.5))
  for (const f of fixtures) {
    if (f.kind === 'tripod' && half <= RIG.tripod.gauze + 1.5) out.push({ x: f.x, y: f.y + RIG.tripod.h, on: f.id, what: 'gauze' })
    else if (f.kind === 'hotPlate' && half <= RIG.hotPlate.top + 1) out.push({ x: f.x, y: f.y + RIG.hotPlate.h, on: f.id, what: 'plate' })
    else if (isBath(f.kind) && half <= RIG.bath.half - 0.6 && !taken(f.id, 'bath')) out.push({ x: f.x, y: f.y + RIG.bath.floor, on: f.id, what: 'bath' })
    else if (f.kind === 'pneumaticTrough' && collects(v.kind) && !taken(f.id, 'trough')) out.push({ x: f.x + RIG.trough.half * 0.35, y: f.y + RIG.trough.shelf, on: f.id, what: 'trough' })
    else if (f.kind === 'testTubeRack' && slender(v.kind, v.capacity_mL)) {
      for (let i = 0; i < RIG.rack.slots; i++) {
        const x = f.x + (i - (RIG.rack.slots - 1) / 2) * RIG.rack.pitch
        if (!taken(f.id, 'slot', x)) out.push({ x, y: f.y + RIG.rack.floor, on: f.id, what: 'slot' })
      }
    } else if (f.kind === 'stand') {
      if (typeof f.clamp === 'number' && !taken(f.id, 'clamp')) out.push({ x: clampX(f), y: f.y + f.clamp - gripOf(v.kind, v.capacity_mL), on: f.id, what: 'clamp' })
      if (typeof f.ring === 'number' && half <= RIG.stand.ringR + 1.2 && !taken(f.id, 'ring')) out.push({ x: ringX(f), y: f.y + f.ring + 0.15, on: f.id, what: 'ring' })
    }
  }
  return out
}

/**
 * Where a vessel carried to (x, bottom) comes to rest: held by a clamp whose grip it is brought to (within 2.5 cm),
 * else on the highest support under it that is not above its bottom by more than 1.5 cm, else on the bench.
 */
export function dropSpot(fixtures: Fixture[], vessels: RigVessel[], v: { id: string; kind: string; capacity_mL: number }, x: number, bottom: number): Spot {
  const spots = spotsFor(fixtures, vessels, v)
  const half = halfOf(v.kind, v.capacity_mL)
  let best: Spot | null = null
  for (const s of spots) {
    if (s.what === 'clamp') {
      if (Math.abs(s.x - x) <= Math.max(1.6, half + 0.4) && Math.abs(s.y - bottom) <= 2.5) return s
      continue
    }
    const reach = s.what === 'slot' ? 1.4 : s.what === 'trough' ? RIG.trough.half : s.what === 'bath' || s.what === 'ring' ? Math.max(2, RIG.bath.half - half) : s.what === 'gauze' ? RIG.tripod.gauze : RIG.hotPlate.top
    if (Math.abs(s.x - x) > reach) continue
    if (s.y > bottom + 1.5) continue
    if (!best || s.y > best.y) best = s
  }
  if (best) {
    // a gauze and a plate are wide: the vessel stays where it was put on them; a slot, a bath, a ring centre it
    return best.what === 'gauze' || best.what === 'plate' ? { ...best, x: Math.round(x * 10) / 10 } : best
  }
  return { x: Math.round(x * 10) / 10, y: 0, on: null, what: 'bench' }
}

/** The height of the wick of a burner, and how far its flame reaches. */
export function flameOf(f: Fixture): { x: number; wick: number; reach: number } | null {
  if (!isBurner(f.kind)) return null
  const g = f.kind === 'blastBurner' ? RIG.blastBurner : RIG.alcoholBurner
  // a lower flame reaches less high: the flame's height follows the power setting (its square root)
  const scale = Math.sqrt(Math.max(0.2, (f.power ?? powerOf(f.kind)) / Math.max(1, powerOf(f.kind))))
  return { x: f.x, wick: f.y + g.h, reach: g.flame * scale }
}

/**
 * The vessel a burner heats: the lowest one whose outer bottom is over the flame — past the inner cone, below the
 * flame's tip plus a little — and whose bottom spans the burner's axis.
 */
export function heatedBy(f: Fixture, vessels: RigVessel[]): RigVessel | null {
  const fl = flameOf(f)
  if (!fl) return null
  let best: RigVessel | null = null
  for (const v of vessels) {
    const half = halfOf(v.kind, v.capacity_mL)
    if (Math.abs(v.x - fl.x) > Math.max(0.9, half * 0.85)) continue
    const above = v.y - fl.wick
    if (above < RIG.heatFrom * 0.5 || above > fl.reach + RIG.heatAbove) continue
    if (!best || v.y < best.y) best = v
  }
  return best
}

/** Is the vessel's bottom in the inner cone of the flame (a rule of the bench: heat with the outer flame)? */
export function inInnerFlame(f: Fixture, v: RigVessel): boolean {
  const fl = flameOf(f)
  return !!fl && v.y - fl.wick < fl.reach * 0.35
}

/** What the geometry asks of a vessel: the heat reaching it (W) and the bath it stands in (K, or null). */
export interface RigWant { heater: number; bath: number | null; by: string | null; /** standing on its mouth in a pneumatic trough: collecting over water */ water: boolean }

export function rigWants(fixtures: Fixture[], vessels: RigVessel[]): Map<string, RigWant> {
  const out = new Map<string, RigWant>()
  for (const v of vessels) out.set(v.id, { heater: 0, bath: null, by: null, water: v.at === 'trough' && fixtures.some(f => f.id === v.on && f.kind === 'pneumaticTrough') })
  for (const f of fixtures) {
    if (isBurner(f.kind) && f.lit) {
      const v = heatedBy(f, vessels)
      if (v) { const w = out.get(v.id)!; if ((f.power ?? 0) > w.heater) { w.heater = f.power ?? 0; w.by = f.id } }
    } else if (f.kind === 'hotPlate' && f.on) {
      for (const v of vessels) if (v.on === f.id && v.at === 'plate') { const w = out.get(v.id)!; w.heater = Math.max(w.heater, f.power ?? 0); w.by = f.id }
    } else if (isBath(f.kind)) {
      for (const v of vessels) if (v.on === f.id) { const w = out.get(v.id)!; w.bath = f.T ?? null; w.by = w.by ?? f.id }
    }
  }
  return out
}

/** The kinds of fixtures that act on a vessel (for the guided checks: "a burner is under flask A"). */
export function actingOn(fixtures: Fixture[], vessels: RigVessel[], id: string): string[] {
  const v = vessels.find(x => x.id === id)
  if (!v) return []
  const out: string[] = []
  for (const f of fixtures) {
    if (isBurner(f.kind) && heatedBy(f, vessels)?.id === id) out.push(f.kind)
    else if ((f.kind === 'hotPlate' || isBath(f.kind)) && v.on === f.id) out.push(f.kind)
  }
  return out
}
