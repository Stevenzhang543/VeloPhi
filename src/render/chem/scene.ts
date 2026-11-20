/**
 * The bench as one picture (26.64, D268): where every vessel stands (`layoutBench` — also what pointer hit tests and
 * the page's overlays use) and one frame of the drawing (`drawBench`). Everything drawn is read from the state the
 * core gave: levels from volumes, flames from heaters, stoppers from `closed`, the water in a collecting jar from
 * `gas_mL`, readouts from the vessel's fields rounded to the instrument. Positions are the only thing that is the
 * interface's own.
 *
 * Bench coordinates are centimetres: x to the right, y up from the bench top.
 */
import type { BenchObject, BenchState, CircuitState, VesselState } from '../../engine/chem'
import type { ApparatusKind, VesselShape } from '../../chem/apparatus'
import { instrumentReading, kindOf, levelOf, litmusState, radiusAt, shapeOf, volumeResolution, decimalsFor } from '../../chem/apparatus'
import type { Activity, Extras } from '../../chem/bench'
import { extrasOf } from '../../chem/bench'
import { fixed, qty, withUnit } from '../../chem/format'
import type { ChemPalette } from './palette'
import type { Frame } from './glass'
import { STROKE, cavityPath, drawGlass, drawGraduations, drawStopper, fx, fy, halfWidth, uGap, wallOf } from './glass'
import { absorption, drawLiquid } from './liquid'
import type { LiquidLayer } from './liquid'
import type { SolidDraw } from './solids'
import { drawSolids, settledVolume } from './solids'
import { Effects, bubbleRate } from './effects'
import { drawBalance, drawProbe, drawReadout, drawStrip, drawSymbol, drawSyringe, drawThermometer } from './instruments'
import { drawStream, drawTilted, lipTiltCached } from './tilt'
import type { ActiveEffect, Anchor } from './phenomena'
import { Phenomena, crackPath } from './phenomena'
import type { Fixture, TubeEnd } from '../../chem/rig'
import { fixtureBox, isBurner } from '../../chem/rig'
import type { BottleLook, Held, RigView } from './rigdraw'
import { drawBottle, drawFixtureBack, drawFixtureFront, flameAt } from './rigdraw'
import { bottleShapeKind } from '../../chem/rig'

/** Where the bench's origin is on the canvas, and the scale (px per cm). */
export interface View { ox: number; oy: number; ppc: number }

/** A rectangle of the bench (cm) that does something when tapped. */
export interface Zone { vessel: string; part: string; x0: number; y0: number; x1: number; y1: number }

/** A vessel as it stands on the bench. */
export interface Placed {
  id: string
  kind: ApparatusKind
  shape: VesselShape
  v: VesselState
  e: Extras
  x: number
  /** Bench y of the inner bottom (of the closed end, for a vessel on its mouth). */
  base: number
  flip: boolean
  halfW: number
  /** Extent with supports, cm. */
  left: number
  right: number
  top: number
  /** Bench y of the mouth (where things go in). */
  mouth: number
  /** Around a jar collecting over water: the trough's half width and water depth. */
  trough: { halfW: number; depth: number; wall: number } | null
  /** Half width of the vessel this one is clamped over (its stand stays clear of it). */
  overHalfW: number
  /** Held by a fixture (a tripod, a rack, a clamp …): no support of its own is drawn for it. */
  held: boolean
}

const partTool = (p: Placed, action: string) => p.e.parts.find(k => kindOf(k)?.tool?.action === action)

/** Where every vessel stands. */
export function layoutBench(state: BenchState, objects: BenchObject[]): Placed[] {
  const out: Placed[] = []
  const byId = new Map(objects.map(o => [o.id, o]))
  const done = new Map<string, Placed>()
  const put = (v: VesselState, depth: number): Placed | null => {
    const hit = done.get(v.id)
    if (hit) return hit
    const kind = kindOf(v.kind)
    if (!kind?.vessel) return null
    const shape = shapeOf(v.kind, v.capacity_mL)
    const e = extrasOf(byId.get(v.id))
    const data = kind.vessel
    const t = wallOf(shape, data)
    const halfW = halfWidth(shape, data)
    let x = e.x
    // 26.65 (D297 item 3): a vessel stands where it was put — `y` is the height of what it stands on
    let base = e.y + t
    let flip = false
    let trough: Placed['trough'] = null
    const held = !!e.on
    if (data.draw.foot) base += 0.35
    // what 26.64 drew for a vessel by itself, while nothing holds it: the rack of a test tube, the stand of a U-tube
    if (data.draw.rack && !held && e.y === 0) base += 2.2
    if (data.draw.uTube && !held) base += uGap(shape) / 2 + shape.r[0] + 0.6
    const parts = e.parts.map(k => kindOf(k)).filter((k): k is ApparatusKind => !!k)
    if (parts.some(k => k.instrument?.place === 'under')) base += 2.8
    const target = e.above && depth < 4 ? state.vessels.find(x2 => x2.id === e.above) : undefined
    const under = target ? put(target, depth + 1) : null
    if (data.draw.tap && !held) {
      base += 2.5
      if (under) { x = under.x; base += under.top + 0.8 } else base += 6
    }
    // on its mouth in a trough of the bench (26.65), or in the trough 26.64 drew for it
    if (v.collect === 'water' && e.at === 'trough') { flip = true; base = e.y + shape.top + 0.15 }
    else if (v.collect === 'water') { flip = true; trough = { halfW: shape.rMax + 5.5, depth: Math.min(5, shape.top * 0.55), wall: Math.min(7.5, shape.top * 0.8) }; base = 1.4 + shape.top }
    else if (v.collect === 'down') { flip = true; base = 3 + shape.top }
    const topY = flip ? base + t : base + shape.top + (v.closed ? 0.5 : 0)
    const p: Placed = { id: v.id, kind, shape, v, e, x, base, flip, halfW, left: x - (trough ? trough.halfW + 0.3 : halfW), right: x + (trough ? trough.halfW + 0.3 : halfW), top: topY, mouth: flip ? base - shape.top : base + shape.top, trough, overHalfW: under ? under.halfW : 0, held }
    done.set(v.id, p)
    out.push(p)
    return p
  }
  for (const v of state.vessels) put(v, 0)
  return out
}

/** The outer bottom of a placed vessel (bench y). */
export const bottomOf = (p: Placed) => (p.flip ? p.mouth : p.base - wallOf(p.shape, p.kind.vessel) - (p.kind.vessel?.draw.foot ? 0.35 : 0))

/**
 * The vessel under a bench point (the topmost one drawn there): by its outline — the profile's radius at that height
 * plus the wall — with a little slack around small glassware (26.65, D297 item 3).
 */
export function vesselAt(placed: Placed[], x: number, y: number, slack = 0.6): Placed | null {
  for (let i = placed.length - 1; i >= 0; i--) {
    const p = placed[i]
    if (p.trough || p.flip || p.kind.vessel?.draw.uTube) {
      const w = Math.max(p.right - p.x, 1.4) + slack
      if (x >= p.x - w && x <= p.x + w && y >= bottomOf(p) - slack - (p.trough ? 1.5 : 0) && y <= p.top + slack + 1) return p
      continue
    }
    const h = y - p.base
    if (h < -(p.base - bottomOf(p)) - slack || h > p.shape.top + slack + (p.v.closed ? 0.8 : 0)) continue
    const r = radiusAt(p.shape, Math.max(p.shape.h[0], Math.min(p.shape.top, h))) + wallOf(p.shape, p.kind.vessel)
    const foot = p.kind.vessel?.draw.foot && h < 0.5 ? p.halfW : 0
    if (Math.abs(x - p.x) <= Math.max(r, foot, 0.9) + slack) return p
  }
  return null
}

/** Extent of everything on the bench (cm), for fitting the view. */
export function benchExtent(placed: Placed[], fixtures: Fixture[] = []): { x0: number; x1: number; y1: number } {
  if (!placed.length && !fixtures.length) return { x0: -16, x1: 16, y1: 20 }
  let x0 = Infinity, x1 = -Infinity, y1 = 0
  for (const p of placed) { x0 = Math.min(x0, p.left - 3); x1 = Math.max(x1, p.right + 5); y1 = Math.max(y1, p.top + 6) }
  for (const f of fixtures) { const b = fixtureBox(f); x0 = Math.min(x0, b.x0 - 3); x1 = Math.max(x1, b.x1 + 3); y1 = Math.max(y1, Math.min(b.y1, f.kind === 'stand' ? 30 : b.y1) + 4) }
  return { x0, x1, y1 }
}

export interface SceneInput {
  state: BenchState
  placed: Placed[]
  selected: string | null
  /** A vessel something is being carried over (it takes the drop). */
  target: string | null
  activity: Map<string, Activity>
  name: (id: string) => string
  /** Colour, texture and density of a solid, from the catalogue. */
  solid: (id: string) => { colour: string | null; texture: string | null; rho: number | null }
  /** Layers of a vessel with a second liquid, bottom first; null: one clear liquid. */
  layers: (v: VesselState) => LiquidLayer[] | null
  /** Does a couple of the catalogue give a gas at the cathode (its reduced side) or the anode (its oxidised side)? */
  gasAt: (couple: string | null, side: 'cathode' | 'anode') => boolean
  /** The colour of a flame test going on over a vessel (a CSS colour), '' for a flame the sample does not colour; null: none. */
  flameOf: (vessel: string) => string | null
  /** Words for litmus paper. */
  litmus: (state: 'red' | 'blue' | 'between') => string
  dt: number
  calm: boolean
  /** Projector factor for lines and type. */
  line: number
  width: number
  height: number
  /**
   * A pour being held (26.65, D297 item 1): the source tips at the target's mouth and pours `mL` while held; both
   * levels show the amount chosen so far (the core performs the pour when the hand lets go).
   */
  pour?: PourView | null
  /** The effects of reactions going on in a vessel (D297 item 2), from the core's events. */
  effectsOf?: (v: VesselState) => ActiveEffect[]
  /** The particles of those effects. */
  phen?: Phenomena
  /** 26.65 (D297 items 4–5): the fixtures, the one selected, one being carried (its offset), the place a carried vessel would come to rest. */
  fixtures?: Fixture[]
  selectedFixture?: string | null
  liftFixture?: { id: string; dx: number; dy: number } | null
  spot?: { x: number; y: number; what: string } | null
  /** What a reagent bottle holds and says on its label (D297 item 6). */
  bottleLook?: (reagent: string) => BottleLook
  /** The dropper of a dropper bottle in the hand: the bottle it is from, and where it is (null: over a mouth, drawn there). */
  dropper?: { bottle: string; at: { x: number; y: number } | null } | null
  /** A tool in the hand (D297 item 7): which, where its tip is (bench cm), what it holds, squeezed, the surface below. */
  hand?: { tool: string; x: number; y: number; liquid: readonly [number, number, number] | null; loaded: boolean; solid: string | null; squeezed: boolean; floor: number; flare?: boolean } | null
  /** Is a vessel being stirred with the glass rod (a drawing)? */
  stirring?: (id: string) => boolean
  /** Vessels with a delivery tube through their stopper (the stopper is drawn while a free end vents them). */
  tubed?: Set<string>
}

/** What the canvas tells the scene about a pour being held. */
export interface PourView {
  from: string
  to: string
  /** Millilitres chosen so far (the user's amount, not yet poured). */
  mL: number
  /** 0 … 1: how far the source has tipped (it tips in a quarter of a second). */
  tip: number
  /** The flow now, mL/s (0 while tipping). */
  rate: number
  /** The source comes from the left of the target (it then tips to the right). */
  fromLeft: boolean
  /** Effects time, s (the stream wavers). */
  time: number
  /** The source is a reagent bottle of the shelf (a fixture), not a vessel: how it looks; what flows (D297 item 6). */
  bottle?: { f: Fixture; look: BottleLook } | null
  /** Millilitres of a liquid, grams of a solid, drops from a dropper. */
  unit?: 'mL' | 'g' | 'drop'
}

/** Where the lip of a source pouring into `to` sits (bench cm), and its side. */
export function pourLip(to: Placed, fromLeft: boolean): { x: number; y: number; side: 1 | -1 } {
  const side: 1 | -1 = fromLeft ? 1 : -1
  const r = radiusAt(to.shape, to.shape.top)
  return { x: to.x - side * Math.max(0.25, r * 0.4), y: to.mouth + 0.9, side }
}

/** The mouth of a vessel (bench cm) and its inner radius: where things are poured in. */
export function mouthOf(p: Placed): { x: number; y: number; r: number } {
  return { x: p.x, y: p.mouth, r: radiusAt(p.shape, p.shape.top) }
}

const sx = (view: View, x: number) => view.ox + x * view.ppc
const sy = (view: View, y: number) => view.oy - y * view.ppc
const frameOf = (view: View, p: Placed): Frame => ({ cx: sx(view, p.x), base: sy(view, p.base), ppc: view.ppc, flip: p.flip })

/** Draw one frame. Returns the zones that act when tapped (burners, stoppers, the switch of a circuit). */
export function drawBench(ctx: CanvasRenderingContext2D, P: ChemPalette, view: View, s: SceneInput, fxs: Effects): Zone[] {
  const zones: Zone[] = []
  const line = s.line
  const yBench = Math.round(sy(view, 0)) + 0.5
  ctx.save()
  ctx.lineJoin = 'round'
  // the bench: a calm top with its front edge (26.65: no scale ticks — the bench is not a ruler)
  ctx.fillStyle = P.bench
  ctx.fillRect(0, yBench, s.width, Math.max(0, s.height - yBench))
  ctx.fillStyle = P.benchEdge
  ctx.fillRect(0, yBench, s.width, Math.max(2, Math.min(10, 0.5 * view.ppc)))
  ctx.strokeStyle = P.tick
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, yBench); ctx.lineTo(s.width, yBench); ctx.stroke()
  const byId = new Map(s.placed.map(p => [p.id, p]))
  const pour = s.pour && (byId.get(s.pour.from) || s.pour.bottle) && byId.get(s.pour.to) ? s.pour : null
  // the fixtures behind the vessels: stands, racks, burners, plates, baths, then tripods over their burners
  const rv: RigView = { sx: x => sx(view, x), sy: y => sy(view, y), ppc: view.ppc, line }
  const lift = s.liftFixture
  const fixtures = (s.fixtures ?? []).map(f => (lift && f.id === lift.id ? { ...f, x: f.x + lift.dx, y: f.y + lift.dy } : f))
  const heldBy = (f: Fixture): Held | null => {
    if (f.kind !== 'stand' || typeof f.clamp !== 'number') return null
    const p = s.placed.find(q => q.e.on === f.id && q.e.at === 'clamp')
    if (!p) return null
    const t = wallOf(p.shape, p.kind.vessel)
    const gy = f.y + f.clamp
    return { x: p.x, gripY: gy, outerR: radiusAt(p.shape, Math.max(p.shape.h[0], Math.min(p.shape.top, gy - p.base))) + t }
  }
  const order = (k: string) => (k === 'tripod' ? 2 : k === 'stand' ? 0 : 1)
  const sorted = [...fixtures].sort((a, b) => order(a.kind) - order(b.kind))
  for (const f of sorted) {
    if (f.kind === 'reagentBottle') { if (!(pour?.bottle && pour.bottle.f.id === f.id && pour.bottle.f.style !== 'dropper')) drawStock(ctx, P, view, s, { ...f, ...(s.dropper?.bottle === f.id ? { style: 'dropper', open: true } : {}) }, f.id === s.selectedFixture); continue }
    const hot = f.kind === 'hotPlate' && s.placed.some(p => p.e.on === f.id && p.v.heater > 0)
    drawFixtureBack(ctx, P, rv, f, { selected: f.id === s.selectedFixture, held: heldBy(f), hot })
  }
  // flames of the lit burners (the burner's setting: the heat the vessel gets is the core's)
  for (const f of fixtures) {
    if (!isBurner(f.kind)) continue
    const fl = flameAt(rv, f)
    if (fl) fxs.flame(ctx, P, fl.x, fl.y, fl.size, fl.blast ? 'blast' : 'soft', s.calm)
  }
  // where a carried vessel would come to rest
  if (s.spot && s.spot.what !== 'bench') {
    ctx.save()
    ctx.strokeStyle = P.accent
    ctx.lineWidth = Math.max(2, 0.18 * view.ppc)
    ctx.setLineDash([5, 4])
    ctx.beginPath(); ctx.moveTo(sx(view, s.spot.x - 2.2), sy(view, s.spot.y)); ctx.lineTo(sx(view, s.spot.x + 2.2), sy(view, s.spot.y)); ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }
  for (const p of s.placed) {
    if (pour && p.id === pour.from) continue
    drawVessel(ctx, P, view, s, fxs, p, zones, pour && p.id === pour.to ? p.v.volume_mL + pour.mL : p.v.volume_mL)
  }
  for (const f of sorted) drawFixtureFront(ctx, P, rv, f, { selected: f.id === s.selectedFixture, held: heldBy(f), font: P.font })
  // delivery tubes: the things of the bench (26.65), and 26.64's drawing of a tube no thing stands for
  for (const f of fixtures) if (f.kind === 'tube') drawTubeFixture(ctx, P, view, s, f, byId, f.id === s.selectedFixture)
  for (const p of s.placed) if (p.v.outlet && !fixtures.some(f => f.kind === 'tube' && f.a?.vessel === p.id)) drawTube(ctx, P, view, p, byId.get(p.v.outlet), line)
  for (const c of s.state.circuits ?? []) drawCircuit(ctx, P, view, s, fxs, c, byId, zones)
  if (s.dropper?.at) drawDropper(ctx, P, view, s, s.dropper.at.x, s.dropper.at.y, false, 0, null, 0)
  if (s.hand) drawHand(ctx, P, view, s)
  if (pour?.bottle) drawBottlePour(ctx, P, view, s, byId.get(pour.to)!, pour)
  else if (pour) drawPour(ctx, P, view, s, byId.get(pour.from)!, byId.get(pour.to)!, pour)
  fxs.drawPours(ctx, P, x => sx(view, x), y => sy(view, y), view.ppc, s.calm)
  // names under the vessels
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  // the selected vessel's name first; a name that would run into one already written is left out (a crowded phone)
  const taken: Array<[number, number]> = []
  for (const p of [...s.placed].sort((a, b) => Number(b.id === s.selected) - Number(a.id === s.selected))) {
    if ((p.e.above && p.kind.vessel?.draw.tap) || p.id === pour?.from) continue
    const sel = p.id === s.selected
    ctx.font = `${sel ? 600 : 500} ${12 * line}px ${P.font}`
    const text = s.name(p.id), x = sx(view, p.x), half = ctx.measureText(text).width / 2 + 4
    if (taken.some(([a, b]) => x + half > a && x - half < b)) continue
    taken.push([x - half, x + half])
    ctx.fillStyle = sel ? P.accent : P.ink2
    ctx.fillText(text, x, yBench + 12)
  }
  ctx.restore()
  return zones
}

/** The glass and contents of a stock bottle at (x, y) (bench cm), with its measures for the stopper and the label. */
function stockBody(ctx: CanvasRenderingContext2D, P: ChemPalette, view: View, f: Fixture, look: BottleLook, line: number) {
  const sk = bottleShapeKind(f.style)
  const shape = shapeOf(sk.kind, sk.capacity_mL)
  const data = kindOf(sk.kind)!.vessel!
  const t = wallOf(shape, data)
  const fr: Frame = { cx: sx(view, f.x), base: sy(view, f.y + t), ppc: view.ppc }
  const draw = () => {
    if (look.solid) {
      // a solid: the lower part of the bottle filled with it, a few marks of its grain, its top edge
      const h = levelOf(shape, shape.capacity_mL * 0.42)
      ctx.save(); cavityPath(ctx, shape, fr); ctx.clip()
      ctx.fillStyle = look.solid
      ctx.fillRect(fr.cx - (shape.rMax + 1) * view.ppc, fy(fr, h), (shape.rMax + 1) * 2 * view.ppc, h * view.ppc + 2)
      ctx.fillStyle = P.ink3; ctx.globalAlpha = 0.35
      for (let i = 0; i < 26; i++) { const a = (i * 0.618) % 1, b = (i * 0.377) % 1; ctx.fillRect(fr.cx + (a * 2 - 1) * shape.rMax * 0.9 * view.ppc, fy(fr, h * b), 1.2, 1.2) }
      ctx.globalAlpha = 1; ctx.strokeStyle = P.ink3; ctx.lineWidth = 0.75
      ctx.beginPath(); ctx.moveTo(fr.cx - shape.rMax * view.ppc, fy(fr, h)); ctx.lineTo(fr.cx + shape.rMax * view.ppc, fy(fr, h)); ctx.stroke()
      ctx.restore()
    } else drawLiquid(ctx, P, shape, fr, shape.capacity_mL * 0.72, { colour: look.colour, line })
    drawGlass(ctx, P, shape, data, fr, { line })
  }
  return { draw, top: shape.top + t, neck: shape.r[shape.r.length - 2] ?? shape.r[shape.r.length - 1], rMax: shape.rMax + t }
}

/** A stock bottle standing on the bench. */
function drawStock(ctx: CanvasRenderingContext2D, P: ChemPalette, view: View, s: SceneInput, f: Fixture, selected: boolean) {
  const look = s.bottleLook?.(f.reagent ?? '') ?? { colour: null, solid: null, name: f.reagent ?? '', label: '' }
  const b = stockBody(ctx, P, view, f, look, s.line)
  drawBottle(ctx, P, { sx: x => sx(view, x), sy: y => sy(view, y), ppc: view.ppc, line: s.line, font: P.font }, f, look, { selected, top: b.top, neck: b.neck, rMax: b.rMax, body: b.draw })
}

/**
 * Taking from a stock bottle over a vessel's mouth (D297 item 6): a narrow or wide bottle is tipped at the mouth, its
 * stream of liquid or grains falls; from a dropper bottle the dropper is held over the mouth and lets fall its drops.
 */
function drawBottlePour(ctx: CanvasRenderingContext2D, P: ChemPalette, view: View, s: SceneInput, to: Placed, pour: PourView) {
  const f = pour.bottle!.f, look = pour.bottle!.look
  const lip = pourLip(to, pour.fromLeft)
  const floor = to.base + levelOf(to.shape, Math.max(0, to.v.volume_mL + (pour.unit === 'mL' ? pour.mL : 0)))
  if (f.style === 'dropper') {
    // the dropper over the middle of the mouth, its bulb squeezed while it drops
    drawDropper(ctx, P, view, s, to.x, to.mouth + 1.2, pour.rate > 0, pour.time, look.colour, floor)
    return
  }
  const sk = bottleShapeKind(f.style)
  const shape = shapeOf(sk.kind, sk.capacity_mL)
  const volume = look.solid ? shape.capacity_mL * 0.42 : shape.capacity_mL * 0.72
  const full = lipTiltCached(shape, volume)
  const phi = (full + (pour.rate > 0 ? 0.12 : -0.05)) * Math.min(1, Math.max(0, pour.tip))
  const tint = drawTilted(ctx, P, shape, kindOf(sk.kind)!.vessel!, { lipX: sx(view, lip.x), lipY: sy(view, lip.y), phi, left: lip.side < 0, ppc: view.ppc, volume_mL: volume, colour: look.solid ? null : look.colour, line: s.line, selected: true })
  if (pour.rate > 0 && !s.calm) {
    if (look.solid) {
      // grains falling from the lip
      ctx.save(); ctx.fillStyle = look.solid; ctx.strokeStyle = P.ink3; ctx.lineWidth = 0.5
      const x0 = sx(view, lip.x), y0 = sy(view, lip.y), y1 = sy(view, floor)
      for (let i = 0; i < 9; i++) { const u = (pour.time * 1.7 + i / 9) % 1; const yy = y0 + (y1 - y0) * u * u; const xx = x0 + lip.side * (2 + 5 * u) + Math.sin(i * 7.1) * 2; ctx.beginPath(); ctx.arc(xx, yy, Math.max(1.2, 0.08 * view.ppc), 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
      ctx.restore()
    } else {
      const width = Math.max(1.6, Math.min(0.42 * view.ppc, 1.2 + Math.sqrt(pour.rate) * 0.5 * view.ppc * 0.12))
      drawStream(ctx, P, sx(view, lip.x), sy(view, lip.y), sx(view, lip.x + lip.side * 0.35), sy(view, floor), width, tint, pour.time, s.line)
    }
  }
}

/** The tool in the hand, at the pointer or at the mouth it is over (D297 item 7). */
function drawHand(ctx: CanvasRenderingContext2D, P: ChemPalette, view: View, s: SceneInput) {
  const h = s.hand!
  const k = view.ppc, x = sx(view, h.x), y = sy(view, h.y)
  if (h.tool === 'dropper') { drawDropper(ctx, P, view, s, h.x, h.y, h.squeezed, fxsTime(s), h.liquid, h.floor, h.loaded); return }
  ctx.save()
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  if (h.tool === 'glowingSplint') {
    ctx.strokeStyle = P.rubber; ctx.lineWidth = Math.max(2.5, 0.24 * k)
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6 * k, y - 8 * k); ctx.stroke()
    ctx.fillStyle = P.glow
    ctx.beginPath(); ctx.arc(x, y, Math.max(2.5, 0.22 * k), 0, Math.PI * 2); ctx.fill()
    ctx.restore()
    // flared up by the rule of the splint (the note says it is the rule)
    if (h.flare) drawFlare(ctx, P, x, y, k, s)
    return
  }
  if (h.tool === 'glassRod') {
    ctx.strokeStyle = P.ink2; ctx.lineWidth = Math.max(3, 0.32 * k)
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 2.2 * k, y - 13 * k); ctx.stroke()
    ctx.strokeStyle = P.glassLight; ctx.lineWidth = Math.max(1, 0.1 * k)
    ctx.beginPath(); ctx.moveTo(x + 0.3 * k, y - 1 * k); ctx.lineTo(x + 2.2 * k, y - 12.5 * k); ctx.stroke()
  } else if (h.tool === 'spatula') {
    // the steel strip and its scoop, with a spoonful when loaded
    ctx.strokeStyle = P.steel; ctx.lineWidth = Math.max(2.5, 0.25 * k)
    ctx.beginPath(); ctx.moveTo(x + 0.9 * k, y - 0.25 * k); ctx.lineTo(x + 8 * k, y - 4.5 * k); ctx.stroke()
    ctx.fillStyle = P.metal; ctx.strokeStyle = P.ink2; ctx.lineWidth = STROKE * s.line * 0.8
    ctx.beginPath(); ctx.ellipse(x, y, 1.0 * k, 0.45 * k, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    if (h.loaded) { ctx.fillStyle = h.solid ?? P.solid; ctx.beginPath(); ctx.ellipse(x, y - 0.25 * k, 0.75 * k, 0.35 * k, -0.5, Math.PI, 0); ctx.fill(); ctx.stroke() }
  } else {
    // tweezers: two arms meeting at the tip, a piece held there when loaded
    ctx.strokeStyle = P.steel; ctx.lineWidth = Math.max(2, 0.18 * k)
    ctx.beginPath(); ctx.moveTo(x - 0.15 * k, y); ctx.lineTo(x + 4.4 * k, y - 6.6 * k); ctx.moveTo(x + 0.15 * k, y); ctx.lineTo(x + 5.6 * k, y - 6 * k); ctx.stroke()
    if (h.loaded) { ctx.fillStyle = h.solid ?? P.metal; ctx.strokeStyle = P.ink2; ctx.lineWidth = STROKE * s.line * 0.8; ctx.beginPath(); ctx.ellipse(x, y + 0.2 * k, 0.45 * k, 0.35 * k, 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
  }
  ctx.restore()
}
const fxsTime = (s: SceneInput) => (s.phen?.time ?? 0)
function drawFlare(ctx: CanvasRenderingContext2D, P: ChemPalette, x: number, y: number, k: number, s: SceneInput) {
  const t = s.calm ? 0 : fxsTime(s)
  const hh = (1.4 + 0.15 * Math.sin(t * 12)) * k
  ctx.save()
  ctx.fillStyle = P.flameOuter
  ctx.beginPath(); ctx.moveTo(x - 0.35 * k, y); ctx.quadraticCurveTo(x - 0.4 * k, y - hh * 0.6, x, y - hh); ctx.quadraticCurveTo(x + 0.4 * k, y - hh * 0.6, x + 0.35 * k, y); ctx.closePath(); ctx.fill()
  ctx.restore()
}

/** A dropper (a glass tube with its rubber bulb) with its tip at (x, y) bench cm; squeezed, a drop falls to `floor` (cm). */
function drawDropper(ctx: CanvasRenderingContext2D, P: ChemPalette, view: View, s: SceneInput, bx: number, by: number, squeezed: boolean, time: number, colour: readonly [number, number, number] | null, floor: number, filled = false) {
  const x = sx(view, bx), y = sy(view, by), k = view.ppc
  ctx.save()
  ctx.strokeStyle = P.ink2; ctx.lineWidth = STROKE * s.line * 0.9
  ctx.fillStyle = P.glassBody
  ctx.beginPath(); ctx.moveTo(x - 0.2 * k, y - 4.2 * k); ctx.lineTo(x - 0.2 * k, y - 0.4 * k); ctx.lineTo(x - 0.06 * k, y); ctx.lineTo(x + 0.06 * k, y); ctx.lineTo(x + 0.2 * k, y - 0.4 * k); ctx.lineTo(x + 0.2 * k, y - 4.2 * k); ctx.closePath(); ctx.fill(); ctx.stroke()
  if (filled) { ctx.fillStyle = colour ? 'rgba(' + colour[0] + ', ' + colour[1] + ', ' + colour[2] + ', 0.85)' : P.stream; ctx.fillRect(x - 0.13 * k, y - 2.4 * k, 0.26 * k, 2.0 * k) }
  ctx.fillStyle = P.rubber
  ctx.beginPath(); ctx.ellipse(x, y - 5.1 * k, 0.55 * k * (squeezed ? 0.78 : 1), 1.0 * k, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  if (squeezed && !s.calm) {
    const tint = colour ? 'rgb(' + colour[0] + ', ' + colour[1] + ', ' + colour[2] + ')' : P.stream
    const u = (time * 3) % 1, yf = sy(view, floor)
    const yd = y + (yf - y) * u * u
    ctx.fillStyle = tint; ctx.strokeStyle = P.waterLine; ctx.lineWidth = 1
    ctx.beginPath(); ctx.ellipse(x, yd, Math.max(1.5, 0.1 * k), Math.max(2, 0.16 * k), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  }
  ctx.restore()
}

/** The source of a pour, tipped at the target's mouth, and its stream (D297 item 1). */
function drawPour(ctx: CanvasRenderingContext2D, P: ChemPalette, view: View, s: SceneInput, from: Placed, to: Placed, pour: PourView) {
  const lip = pourLip(to, pour.fromLeft)
  const left = lip.side < 0
  const full = lipTiltCached(from.shape, from.v.volume_mL)
  // tip towards the angle at which the liquid reaches the lip, a little beyond it while it flows
  const phi = (full + (pour.rate > 0 ? 0.12 : -0.05)) * Math.min(1, Math.max(0, pour.tip))
  const remaining = Math.max(0, from.v.volume_mL - pour.mL)
  const tint = drawTilted(ctx, P, from.shape, from.kind.vessel!, { lipX: sx(view, lip.x), lipY: sy(view, lip.y), phi, left, ppc: view.ppc, volume_mL: remaining, colour: from.v.colour ?? null, line: s.line, selected: true })
  if (pour.rate > 0 && !s.calm) {
    const floor = to.base + levelOf(to.shape, Math.max(0, to.v.volume_mL + pour.mL))
    const width = Math.max(1.6, Math.min(0.42 * view.ppc, 1.2 + Math.sqrt(pour.rate) * 0.5 * view.ppc * 0.12))
    drawStream(ctx, P, sx(view, lip.x), sy(view, lip.y), sx(view, lip.x + lip.side * 0.35), sy(view, floor), width, tint, pour.time, s.line)
  }
}

function drawVessel(ctx: CanvasRenderingContext2D, P: ChemPalette, view: View, s: SceneInput, fxs: Effects, p: Placed, zones: Zone[], volume_mL = p.v.volume_mL) {
  const { shape, v } = p
  const data = p.kind.vessel!
  const f = frameOf(view, p)
  const line = s.line
  const t = wallOf(shape, data)
  const yBench = sy(view, 0)
  const uTube = !!data.draw.uTube
  const parts = p.e.parts.map(k => kindOf(k)).filter((k): k is ApparatusKind => !!k)
  const act = s.activity.get(v.id)
  const selected = p.id === s.selected || p.id === s.target
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = P.ink2
  ctx.lineWidth = STROKE * line
  // ---- what the vessel stands on ----
  const under = parts.find(k => k.instrument?.place === 'under')
  if (under) {
    // a balance under the vessel, on what the vessel stands on
    const floor = sy(view, p.e.y), top = sy(view, p.e.y + 2.6)
    const [rx, ry] = drawBalance(ctx, P, f.cx, top, floor, p.halfW * view.ppc, under.instrument!.display === 'digital', line)
    const r = instrumentReading(under.id, v)
    drawReadout(ctx, P, rx, ry, r ? qty(r.value, r.unit, r.decimals) : '—', { align: 'center', scale: Math.min(1, line), line })
  }
  // (burners, hot plates and baths are things of their own since 26.65: src/render/chem/rigdraw.ts)
  if (p.trough) {
    const w = p.trough.halfW * view.ppc, yb = sy(view, 0.4), yw = sy(view, 0.4 + p.trough.depth), yt = sy(view, 0.4 + p.trough.wall)
    ctx.fillStyle = P.water
    ctx.fillRect(f.cx - w, yw, w * 2, yb - yw)
    ctx.strokeStyle = P.waterLine; ctx.lineWidth = Math.max(1, line); ctx.beginPath(); ctx.moveTo(f.cx - w, yw); ctx.lineTo(f.cx + w, yw); ctx.stroke()
    ctx.strokeStyle = P.ink2; ctx.lineWidth = STROKE * line
    ctx.beginPath(); ctx.moveTo(f.cx - w, yt); ctx.lineTo(f.cx - w, yb); ctx.lineTo(f.cx + w, yb); ctx.lineTo(f.cx + w, yt); ctx.stroke()
  }
  if (data.draw.rack && !p.held && p.e.y === 0) {
    const w = (p.halfW + 1.3) * view.ppc, y1 = fy(f, shape.top * 0.62), y2 = fy(f, shape.top * 0.12)
    ctx.strokeStyle = P.steel
    ctx.beginPath(); ctx.moveTo(f.cx - w, y1); ctx.lineTo(f.cx + w, y1); ctx.moveTo(f.cx - w, y2); ctx.lineTo(f.cx + w, y2); ctx.moveTo(f.cx - w, y1 - 4); ctx.lineTo(f.cx - w, yBench); ctx.moveTo(f.cx + w, y1 - 4); ctx.lineTo(f.cx + w, yBench); ctx.stroke()
    ctx.strokeStyle = P.ink2
  }
  if ((data.draw.stand && !p.held) || (p.flip && !p.trough && !p.held)) {
    // a stand with a clamp holds what cannot stand by itself (26.64's drawing, while no stand of the bench holds it)
    const rod = f.cx + (Math.max(p.halfW + 1.4, p.overHalfW) + 1) * view.ppc, top = fy(f, p.flip ? 0 : shape.top * 0.86) - (p.flip ? 0 : 0), clampY = fy(f, shape.top * 0.6)
    ctx.strokeStyle = P.steel
    ctx.lineWidth = STROKE * line * 1.4
    ctx.beginPath(); ctx.moveTo(rod, Math.min(top, clampY) - 8); ctx.lineTo(rod, yBench); ctx.moveTo(rod - 2.6 * view.ppc, yBench); ctx.lineTo(rod + 1.4 * view.ppc, yBench); ctx.stroke()
    ctx.lineWidth = STROKE * line
    ctx.beginPath(); ctx.moveTo(rod, clampY); ctx.lineTo(fx(f, radiusAt(shape, shape.top * 0.6) + t), clampY); ctx.stroke()
    ctx.strokeStyle = P.ink2
  }

  // ---- contents ----
  const eff = s.effectsOf?.(v) ?? []
  // a piece that melts into a ball and darts about on the water (sodium) is not lying at the bottom
  const afloat = eff.some(e => e.key === 'dart') ? new Set(eff.filter(e => e.key === 'dart' || e.key === 'melt').map(e => e.reactant).filter((x): x is string => !!x)) : null
  const bead = !afloat && eff.some(e => e.key === 'melt') ? new Set(eff.filter(e => e.key === 'melt').map(e => e.reactant).filter((x): x is string => !!x)) : null
  const solids: SolidDraw[] = v.solids.filter(x => !afloat?.has(x.id) && !bead?.has(x.id)).map(x => ({ id: x.id, form: x.form, g: x.g, ...s.solid(x.id) }))
  let surface: number | null = null
  let sources: Array<[number, number]> = []
  if (p.trough) {
    // over water: the jar stands full of water on its mouth; the gas it holds (at the room's pressure) pushes the
    // water down from the closed end
    const gasShare = Math.max(0, Math.min(1, v.gas_mL / v.capacity_mL))
    const gasDepth = levelOf(shape, v.capacity_mL * gasShare)
    ctx.save()
    cavityPath(ctx, shape, f)
    ctx.clip()
    const yGas = fy(f, gasDepth), yMouth = fy(f, shape.top)
    ctx.fillStyle = P.water
    ctx.fillRect(f.cx - (shape.rMax + 1) * view.ppc, yGas, (shape.rMax + 1) * 2 * view.ppc, yMouth - yGas)
    if (gasShare < 1) { ctx.strokeStyle = P.waterLine; ctx.lineWidth = Math.max(1, line * 1.25); ctx.beginPath(); ctx.moveTo(f.cx - shape.rMax * view.ppc, yGas); ctx.lineTo(f.cx + shape.rMax * view.ppc, yGas); ctx.stroke() }
    ctx.restore()
    // gas arriving bubbles up through the water in the jar
    const up: Frame = { cx: f.cx, base: yMouth, ppc: view.ppc }
    const depth = shape.top - gasDepth
    ctx.save(); cavityPath(ctx, shape, f); ctx.clip()
    fxs.bubbles(ctx, P, v.id, { f: up, surface: depth, floor: 0, radius: h => radiusAt(shape, shape.top - h), sources: [] }, act?.inflow ? Math.min(24, 4 + act.inflow * 6) : 0, s.dt, s.calm)
    ctx.restore()
  } else if (!p.flip) {
    const under_mL = settledVolume(solids)
    surface = drawLiquid(ctx, P, shape, f, volume_mL, { uTube, layers: s.layers(v) ?? undefined, under_mL, line, colour: v.colour ?? null })
    // a coloured gas above the liquid (chlorine, nitrogen dioxide): the head space in the core's colour
    if (v.gasColour && absorption(v.gasColour) > 0.004) {
      ctx.save(); cavityPath(ctx, shape, f, uTube); ctx.clip()
      const yTop = fy(f, shape.top + 1), ySurf = fy(f, surface ?? shape.h[0])
      ctx.fillStyle = `rgba(${v.gasColour[0]}, ${v.gasColour[1]}, ${v.gasColour[2]}, ${Math.min(0.85, Math.pow(absorption(v.gasColour), 0.55)).toFixed(3)})`
      ctx.fillRect(f.cx - (p.halfW + 1) * view.ppc, Math.min(yTop, ySurf), (p.halfW + 1) * 2 * view.ppc, Math.abs(ySurf - yTop))
      ctx.restore()
    }
    sources = drawSolids(ctx, P, shape, f, solids, uTube, line)
    // a molten piece: a bright ball, floating and darting on the water, or lying in the dish
    const balls = v.solids.filter(x => (afloat?.has(x.id) || bead?.has(x.id)) && x.g > 0)
    if (balls.length) {
      const t = s.calm ? 0 : (s.phen?.time ?? 0)
      ctx.save(); cavityPath(ctx, shape, f, uTube); ctx.clip()
      balls.forEach((b, i) => {
        const r = Math.max(4.5, Math.min(0.6 * view.ppc, Math.cbrt(b.g) * 0.5 * view.ppc))
        const onTop = !!afloat && surface !== null
        const h = onTop ? surface! : shape.h[0]
        const span = Math.max(0, radiusAt(shape, h) * view.ppc - r - 2)
        const x = f.cx + (onTop ? Math.sin(t * 1.3 + i * 2.1) * span * 0.75 + Math.sin(t * 3.7 + i) * span * 0.15 : 0)
        const y = fy(f, h) + (onTop ? -r * 0.35 : -r)
        if (onTop && !s.calm) { ctx.strokeStyle = P.waterLine; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y + r * 0.6, r * 1.6, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke() }
        ctx.fillStyle = s.solid(b.id).colour ?? P.metal
        ctx.strokeStyle = P.ink2; ctx.lineWidth = Math.max(0.75, line * 0.8)
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        ctx.fillStyle = P.glassLight; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, Math.PI * 2); ctx.fill()
        sources.push([x, y])
      })
      ctx.restore()
    }
    // inside the glass: a silver mirror on the wall, a deposit on the piece, char rising from the sugar
    if (eff.length && s.phen) {
      ctx.save(); cavityPath(ctx, shape, f, uTube); ctx.clip()
      const wall = (y: number): [number, number] | null => { const h = (f.base - y) / view.ppc; const r = radiusAt(shape, h); return r > 0 ? [fx(f, -r) + 1, fx(f, r) - 1] : null }
      s.phen.drawInside(ctx, P, v.id, eff, anchorOf(f, shape, surface, sources, view.ppc, true), wall, fy(f, shape.h[0]))
      ctx.restore()
    }
    if (surface !== null) {
      const boil = (act?.boil ?? 0) > 0
      const rate = Math.max(bubbleRate(act?.gas ?? 0), boil ? 22 : 0, act?.inflow ? Math.min(24, 4 + act.inflow * 6) : 0)
      const floor = levelOf(shape, under_mL)
      // gas led in through a tube rises from the tube's end
      const from: Array<[number, number]> = act?.inflow && !act.gas ? [[f.cx + radiusAt(shape, floor + 1) * 0.35 * view.ppc, fy(f, Math.min(surface, floor + 1.2))]] : boil ? [] : sources
      ctx.save(); cavityPath(ctx, shape, f, uTube); ctx.clip()
      fxs.bubbles(ctx, P, v.id, { f, surface, floor, radius: h => (uTube ? shape.r[0] * 3 : radiusAt(shape, h)), sources: from }, rate, s.dt, s.calm)
      ctx.restore()
      if (boil) fxs.steam(ctx, P, f.cx, fy(f, shape.top), radiusAt(shape, shape.top) * 2 * view.ppc, s.calm)
      if (s.stirring?.(v.id)) {
        // the glass rod going round in the liquid (a drawing: stirring does not change a rate in the model)
        const t = s.calm ? 0 : fxsTime(s)
        const r = radiusAt(shape, surface) * 0.55
        const xr = f.cx + Math.sin(t * 5) * r * view.ppc
        ctx.save()
        ctx.strokeStyle = P.ink2; ctx.lineWidth = Math.max(3, 0.3 * view.ppc); ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(xr, fy(f, Math.max(shape.h[0] + 0.5, floor + 0.4))); ctx.lineTo(f.cx + (xr - f.cx) * 0.3 + 0.6 * view.ppc, fy(f, shape.top + 5)); ctx.stroke()
        ctx.strokeStyle = P.waterLine; ctx.lineWidth = 1
        ctx.beginPath(); ctx.ellipse(f.cx, fy(f, surface) + 2, r * view.ppc, Math.max(2, 0.18 * view.ppc), 0, Math.PI * 0.1 + t, Math.PI * 0.9 + t); ctx.stroke()
        ctx.restore()
      }
    }
  }

  // what ran over onto what it stands on (the core's spilled volume): a puddle, larger with more of it
  if ((v.spilled_mL ?? 0) > 0.05) {
    const w = Math.min(16, 2 + Math.sqrt(v.spilled_mL!) * 1.3) * view.ppc, y = sy(view, p.e.y) - 1
    ctx.save(); ctx.fillStyle = P.stream; ctx.strokeStyle = P.waterLine; ctx.lineWidth = 1
    ctx.beginPath(); ctx.ellipse(f.cx - (p.halfW * 0.3) * view.ppc, y, w / 2, Math.max(2, 0.22 * view.ppc), 0, Math.PI, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.restore()
  }

  // ---- the glass ----
  drawGlass(ctx, P, shape, data, f, { line, selected })
  if (v.cracked) {
    // broken: the crack stays on the glass
    ctx.save(); ctx.strokeStyle = P.ink; ctx.lineWidth = Math.max(1.25, line * 1.1); ctx.lineJoin = 'miter'
    crackPath(ctx, anchorOf(f, shape, null, [], view.ppc, false)); ctx.stroke(); ctx.restore()
  }
  if (!p.flip) drawGraduations(ctx, P, v.kind, shape, f, P.font, line)
  if ((v.closed || s.tubed?.has(v.id)) && !data.draw.lid) drawStopper(ctx, P, shape, f, line, uTube)
  // what the reactions show at and above the vessel; in a stoppered vessel it stays inside
  if (eff.length && s.phen) {
    const open = !v.closed && !p.flip && !data.draw.lid
    ctx.save()
    if (!open) { cavityPath(ctx, shape, f, uTube); ctx.clip() }
    s.phen.draw(ctx, P, v.id, eff, anchorOf(f, shape, surface, sources, view.ppc, open), s.dt, s.calm, (x, y, size, colour) => fxs.flame(ctx, P, x, y, size, 'soft', s.calm, colour))
    ctx.restore()
  }
  const stop = partTool(p, 'stopper')
  if (stop) zones.push({ vessel: v.id, part: stop, x0: p.x - 1.6, x1: p.x + 1.6, y0: p.mouth - 1.2, y1: p.mouth + 1.4 })

  // ---- what stands in it or shows its reading ----
  const mouthY = fy(f, shape.top)
  const rMouth = radiusAt(shape, shape.top)
  const readouts: Array<{ label: string; text: string }> = []
  const inside = parts.filter(k => k.instrument && (k.instrument.place ?? 'in') === 'in')
  inside.forEach((k, i) => {
    const off = inside.length === 1 ? 0 : ((i / (inside.length - 1)) * 2 - 1) * 0.55
    const x = fx(f, off * rMouth * 0.8)
    const tipH = Math.max(shape.h[0] + 0.8, Math.min(surface ?? shape.full * 0.3, shape.full * 0.3))
    const top = mouthY - 3.2 * view.ppc
    const r = instrumentReading(k.id, v)
    if (k.instrument!.reads === 'T') {
      const xb = fx(f, off * radiusAt(shape, tipH) * 0.5)
      drawThermometer(ctx, P, x, top, xb, fy(f, tipH), (v.T - 263.15) / 120, line)
      readouts.push({ label: 'T', text: r ? qty(r.value, r.unit, r.decimals) : '—' })
    } else if (k.instrument!.display === 'digital') {
      drawProbe(ctx, P, x, top, fy(f, tipH), line)
      readouts.push({ label: 'pH', text: r ? fixed(r.value, r.decimals) : '—' })
    } else {
      const state = k.instrument!.display === 'litmus' ? litmusState(k.id, v) : null
      drawStrip(ctx, P, x, top + 1.2 * view.ppc, fy(f, tipH), state === 'red' ? P.litmusRed : state === 'blue' ? P.litmusBlue : state === 'between' ? P.litmusBetween : null, line)
      readouts.push(k.instrument!.display === 'litmus' ? { label: '', text: state ? s.litmus(state) : '—' } : { label: 'pH', text: r ? fixed(r.value, r.decimals) : '—' })
    }
  })
  // a burette (and any finely graduated vessel) is its own instrument: the reading at the meniscus
  const res = volumeResolution(v.kind, v.capacity_mL)
  if (res !== null && data.grad === 'fine' && surface !== null) {
    const shown = data.zero === 'top' ? v.capacity_mL - v.volume_mL : v.volume_mL
    drawReadout(ctx, P, fx(f, -shape.rMax - t) - 8, fy(f, surface), qty(shown, 'mL', decimalsFor(res)), { align: 'right', scale: Math.min(1, line), line })
  }
  for (const k of parts) {
    if (k.instrument?.reads !== 'absorbance') continue
    const r = instrumentReading(k.id, v)
    readouts.push({ label: r?.nm ? `A${String(r.nm)}` : 'A', text: r ? fixed(r.value, r.decimals) : '—' })
  }
  const syringe = parts.find(k => k.instrument?.reads === 'gas_mL')
  if (syringe) {
    const r = instrumentReading(syringe.id, v)
    const len = 5.5 * view.ppc, x0 = fx(f, p.trough ? p.trough.halfW + 1 : p.halfW + 1.2), y = fy(f, p.flip ? shape.top * 0.2 : shape.top * 0.8)
    drawSyringe(ctx, P, x0, y, len, v.gas_mL / Math.max(1, v.capacity_mL), line)
    drawReadout(ctx, P, x0 + len / 2, y - Math.max(10, len * 0.08) - 14, r ? qty(r.value, r.unit, r.decimals) : '—', { align: 'center', scale: Math.min(1, line), line })
  }
  readouts.forEach((r, i) => drawReadout(ctx, P, fx(f, p.halfW) + 10, mouthY - 3.2 * view.ppc + 10 + i * 24 * Math.min(1, line), r.text, { label: r.label || undefined, scale: Math.min(1, line), line }))

  // ---- tools in the mouth ----
  for (const k of parts) {
    const a = k.tool?.action
    if (a === 'filter') {
      const w = Math.max(rMouth * 1.5, 1.6) * view.ppc, y0 = mouthY - 2.6 * view.ppc
      ctx.fillStyle = P.glassBody
      ctx.beginPath(); ctx.moveTo(f.cx - w, y0); ctx.lineTo(f.cx - 3 * line, mouthY + 0.4 * view.ppc); ctx.lineTo(f.cx - 3 * line, mouthY + 2.2 * view.ppc); ctx.moveTo(f.cx + 3 * line, mouthY + 2.2 * view.ppc); ctx.lineTo(f.cx + 3 * line, mouthY + 0.4 * view.ppc); ctx.lineTo(f.cx + w, y0); ctx.stroke()
      // the paper cone
      ctx.strokeStyle = P.ink3; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(f.cx - w * 0.82, y0 + 3); ctx.lineTo(f.cx, mouthY); ctx.lineTo(f.cx + w * 0.82, y0 + 3); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = P.ink2
    } else if (a === 'ignite') {
      const x0 = fx(f, rMouth + 2.2), y0 = mouthY - 2.4 * view.ppc, x1 = fx(f, rMouth * 0.3), y1 = mouthY - 0.3 * view.ppc
      ctx.strokeStyle = P.rubber; ctx.lineWidth = Math.max(2, 0.22 * view.ppc); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.strokeStyle = P.ink2; ctx.lineWidth = STROKE * line
      if (v.ignited) fxs.flame(ctx, P, x1, y1, 0.5 * view.ppc, 'soft', s.calm)
      zones.push({ vessel: v.id, part: k.id, x0: p.x - 1, x1: p.x + rMouth + 2.6, y0: p.mouth - 0.6, y1: p.mouth + 3 })
    } else if (a === 'pour') {
      const x = fx(f, rMouth * 0.55), bulb = k.tool!.amount?.unit === 'drop'
      ctx.beginPath(); ctx.moveTo(x, mouthY - 4.2 * view.ppc); ctx.lineTo(x - (bulb ? 0 : 0.3 * view.ppc), fy(f, Math.max(shape.h[0] + 0.6, (surface ?? shape.full * 0.3) * 0.5))); ctx.stroke()
      if (bulb) { ctx.fillStyle = P.rubber; ctx.beginPath(); ctx.ellipse(x, mouthY - 4.6 * view.ppc, 0.42 * view.ppc, 0.7 * view.ppc, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
      else { ctx.fillStyle = P.glassBody; ctx.beginPath(); ctx.ellipse(x - 0.12 * view.ppc, mouthY - 1.9 * view.ppc, 0.4 * view.ppc, 1 * view.ppc, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
    } else if (a === 'flame') {
      // a wire with a loop, held over the mouth; its flame while a test is shown
      const x0 = fx(f, rMouth + 2.6), y0 = mouthY - 3.4 * view.ppc, x1 = fx(f, rMouth + 0.8), y1 = mouthY - 1.5 * view.ppc
      ctx.strokeStyle = P.steel; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
      ctx.beginPath(); ctx.arc(x1 - 2.5 * line, y1 + 2.5 * line, 3 * line, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = P.ink2
      const tone = s.flameOf(v.id)
      if (tone !== null) fxs.flame(ctx, P, x1 - 2.5 * line, y1 + 1 * line, 0.9 * view.ppc, 'soft', s.calm, tone || P.flameBlue)
      zones.push({ vessel: v.id, part: k.id, x0: p.x + rMouth, x1: p.x + rMouth + 3.4, y0: p.mouth + 0.6, y1: p.mouth + 4.2 })
    } else if (a === 'connect' && !v.outlet) {
      // a tube that leads nowhere yet
      ctx.beginPath(); ctx.moveTo(f.cx, mouthY + 0.6 * view.ppc); ctx.lineTo(f.cx, mouthY - 2.2 * view.ppc); ctx.lineTo(f.cx + 2.5 * view.ppc, mouthY - 2.2 * view.ppc); ctx.stroke()
    }
  }
  if (data.draw.tubes) {
    // a gas wash bottle: the long tube dips under the liquid, the short one leaves from the top
    ctx.beginPath(); ctx.moveTo(fx(f, -rMouth * 0.45), mouthY - 2.4 * view.ppc); ctx.lineTo(fx(f, -rMouth * 0.45), fy(f, shape.h[0] + 0.9)); ctx.moveTo(fx(f, rMouth * 0.45), mouthY - 1.6 * view.ppc); ctx.lineTo(fx(f, rMouth * 0.45), mouthY + 0.8 * view.ppc); ctx.stroke()
  }
  // an electrode that waits for its partner
  if (p.e.electrode) drawElectrode(ctx, P, view, p, 0, null, surface, line)
  ctx.restore()
}

/** Where the effects of a vessel happen on the screen: its mouth, its liquid surface, its solid. */
function anchorOf(f: Frame, shape: VesselShape, surface: number | null, sources: Array<[number, number]>, ppc: number, open: boolean): Anchor {
  return {
    mouthX: f.cx, mouthY: fy(f, shape.top), mouthR: radiusAt(shape, shape.top) * ppc,
    surfaceY: surface === null ? null : fy(f, surface), surfaceR: surface === null ? 0 : radiusAt(shape, surface) * ppc,
    solid: sources.length ? [sources[0][0], sources[0][1]] : null, pieces: sources.slice(0, 6), ppc, open, floorY: fy(f, shape.h[0]) + 2
  }
}

/** A plate electrode in a vessel at `off` (−1 … 1 of the mouth radius); returns the screen point its wire leaves from. */
function drawElectrode(ctx: CanvasRenderingContext2D, P: ChemPalette, view: View, p: Placed, off: number, sign: string | null, surface: number | null, line: number): [number, number] {
  const f = frameOf(view, p)
  const { shape } = p
  const rMouth = radiusAt(shape, shape.top)
  const x = fx(f, off * rMouth * 0.6)
  const top = fy(f, shape.top + 1.6), tip = fy(f, Math.max(shape.h[0] + 0.7, (surface ?? shape.full * 0.5) * 0.25))
  const w = Math.max(2.5, Math.min(0.32 * view.ppc, rMouth * 0.22 * view.ppc))
  ctx.save()
  ctx.fillStyle = P.metal
  ctx.strokeStyle = P.ink2
  ctx.lineWidth = STROKE * line * 0.8
  ctx.beginPath(); ctx.rect(x - w, top, w * 2, tip - top); ctx.fill(); ctx.stroke()
  if (sign) { ctx.fillStyle = P.ink; ctx.font = `600 ${13 * line}px ${P.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(sign, x + (off < 0 ? -1 : 1) * (w + 8 * line), top + 12 * line) }
  ctx.restore()
  return [x, top]
}

/** Where an end of a delivery tube is on the bench (cm), from the vessel it is in. */
export function tubeEndAt(end: TubeEnd | undefined, byId: Map<string, Placed>): { x: number; y: number; p: Placed | null } {
  if (!end) return { x: 0, y: 0, p: null }
  const p = end.vessel ? byId.get(end.vessel) ?? null : null
  if (!p) return { x: end.x, y: end.y, p: null }
  if (end.at === 'stopper') return { x: p.x, y: p.mouth + 0.5, p }
  if (end.at === 'under') return { x: p.x, y: p.mouth + 0.7, p }
  if (end.at === 'liquid') return { x: p.x + radiusAt(p.shape, p.shape.top) * 0.3, y: p.base + Math.max(0.8, levelOf(p.shape, p.v.volume_mL) * 0.35), p }
  return { x: p.x, y: p.flip ? p.mouth + 0.6 : p.v.closed ? p.mouth - 1 : p.base + 0.8, p }
}

/**
 * A delivery tube of the bench (D297 item 8): up from the stopper of the vessel the gas comes from, over, and down to
 * where its other end is — under the mouth of a jar in the trough (through the water beside it), to the bottom of a
 * jar, into a liquid, or hanging free. From a free end the gas that leaves the vessel is seen as faint puffs (the core's
 * gas leaving the vessel, at the rate of the last steps).
 */
function drawTubeFixture(ctx: CanvasRenderingContext2D, P: ChemPalette, view: View, s: SceneInput, t: Fixture, byId: Map<string, Placed>, selected: boolean) {
  const A = tubeEndAt(t.a, byId), B = tubeEndAt(t.b, byId)
  const top = Math.max(A.p ? A.p.top : A.y, B.p ? B.p.top : B.y, A.y, B.y) + 2.5
  const pts: Array<[number, number]> = []
  pts.push([A.x, A.y])
  if (A.p || B.p || Math.abs(A.y - B.y) > 1) {
    pts.push([A.x, top])
    if (B.p && t.b?.at === 'under') {
      const side = A.x <= B.x ? -1 : 1
      const xd = B.x + side * (halfOfPlaced(B.p) + 1.4)
      pts.push([xd, top], [xd, B.p.mouth - 0.8], [B.x, B.p.mouth - 0.8], [B.x, B.y])
    } else { pts.push([B.x, top], [B.x, B.y]) }
  } else pts.push([B.x, B.y])
  const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => { const px = sx(view, x), py = sy(view, y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py) }) }
  ctx.save()
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  const w = Math.max(4, 0.4 * view.ppc)
  ctx.strokeStyle = selected ? P.accent : P.ink2; ctx.lineWidth = w; path(); ctx.stroke()
  ctx.strokeStyle = P.bg; ctx.lineWidth = w - 2 * Math.max(1, STROKE * s.line * 0.7); path(); ctx.stroke()
  // the ends one takes hold of
  for (const [e, end] of [[A, t.a], [B, t.b]] as const) {
    if (end?.vessel && !selected) continue
    ctx.fillStyle = P.pane; ctx.strokeStyle = selected ? P.accent : P.ink3; ctx.lineWidth = 1.25
    ctx.beginPath(); ctx.arc(sx(view, e.x), sy(view, e.y), Math.max(3.5, 0.32 * view.ppc), 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  }
  // gas leaving the vessel through a free end
  const src = t.a?.vessel ? byId.get(t.a.vessel) : undefined
  const gas = src ? s.activity.get(src.id)?.gas ?? 0 : 0
  if (!t.b?.vessel && src && gas > 0 && !s.calm) {
    const time = s.phen?.time ?? 0
    ctx.fillStyle = P.smoke
    for (let i = 0; i < 4; i++) { const u = (time * 0.8 + i / 4) % 1; ctx.globalAlpha = 0.28 * (1 - u); ctx.beginPath(); ctx.arc(sx(view, B.x + Math.sin(i * 2.3 + time) * 0.4), sy(view, B.y + 0.3 + u * 3), (0.25 + u * 0.6) * view.ppc, 0, Math.PI * 2); ctx.fill() }
  }
  ctx.restore()
}
const halfOfPlaced = (p: Placed) => p.halfW

function drawTube(ctx: CanvasRenderingContext2D, P: ChemPalette, view: View, from: Placed, to: Placed | undefined, line: number) {
  if (!to) return
  const x0 = sx(view, from.x), y0 = sy(view, from.mouth - 0.4)
  const rail = sy(view, Math.max(from.top, to.top) + 3)
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const path = () => {
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x0, rail)
    if (to.trough) {
      // down into the trough beside the jar and up under its mouth
      const side = from.x <= to.x ? -1 : 1
      const xd = sx(view, to.x + side * (to.halfW + 1.6)), yd = sy(view, 0.9)
      ctx.lineTo(xd, rail); ctx.lineTo(xd, yd); ctx.lineTo(sx(view, to.x), yd); ctx.lineTo(sx(view, to.x), sy(view, to.mouth + 0.9))
    } else {
      const xe = sx(view, to.x + (to.kind.vessel?.draw.tubes ? -radiusAt(to.shape, to.shape.top) * 0.45 : 0))
      const end = to.flip ? to.base - to.shape.top * 0.25 : to.v.closed ? to.mouth - 1 : to.base + Math.max(1, to.shape.full * 0.12)
      ctx.lineTo(xe, rail); ctx.lineTo(xe, sy(view, end))
    }
  }
  // a glass tube: two fine lines around a clear core
  ctx.strokeStyle = P.ink2; ctx.lineWidth = Math.max(4, 0.4 * view.ppc); path(); ctx.stroke()
  ctx.strokeStyle = P.bg; ctx.lineWidth = Math.max(4, 0.4 * view.ppc) - 2 * Math.max(1, STROKE * line * 0.7); path(); ctx.stroke()
  ctx.restore()
}

function drawCircuit(ctx: CanvasRenderingContext2D, P: ChemPalette, view: View, s: SceneInput, fxs: Effects, c: CircuitState, byId: Map<string, Placed>, zones: Zone[]) {
  const pa = byId.get(c.a.vessel), pb = byId.get(c.b.vessel)
  if (!pa || !pb) return
  const line = s.line
  const same = pa === pb
  const live = c.on && c.connected && Math.abs(c.I) > 1e-12
  // a cell: the anode is the negative pole; under a source the anode is wired to the positive pole
  const cell = !(c.source > 0)
  const sign = (pole: 'a' | 'b') => (c.anode === null ? null : (c.anode === pole) === cell ? '−' : '+')
  const surf = (p: Placed) => (p.v.volume_mL > 0 ? levelOf(p.shape, p.v.volume_mL) : null)
  const ea = drawElectrode(ctx, P, view, pa, same ? -0.75 : 0, sign('a'), surf(pa), line)
  const eb = drawElectrode(ctx, P, view, pb, same ? 0.75 : 0, sign('b'), surf(pb), line)
  // bubbles where a couple gives a gas, at a rate that follows the current
  if (live) {
    for (const pole of ['a', 'b'] as const) {
      const isAnode = c.anode === pole
      if (!s.gasAt(isAnode ? c.anodeCouple : c.cathodeCouple, isAnode ? 'anode' : 'cathode')) continue
      const p = pole === 'a' ? pa : pb, e = pole === 'a' ? ea : eb, f = frameOf(view, p), h = surf(p)
      if (h === null) continue
      ctx.save(); cavityPath(ctx, p.shape, f); ctx.clip()
      fxs.bubbles(ctx, P, `${p.id}#${c.id}${pole}`, { f, surface: h, floor: p.shape.h[0], radius: r => radiusAt(p.shape, r), sources: [[e[0], fy(f, h * 0.35)], [e[0], fy(f, h * 0.6)]] }, Math.min(26, 3 + Math.abs(c.I) * 40), s.dt, s.calm)
      ctx.restore()
    }
  }
  const rail = sy(view, Math.max(pa.top, pb.top) + 5.5)
  const xa = ea[0], xb = eb[0]
  ctx.save()
  ctx.strokeStyle = P.ink
  ctx.lineWidth = STROKE * line
  ctx.lineJoin = 'round'
  ctx.beginPath(); ctx.moveTo(xa, ea[1]); ctx.lineTo(xa, rail); ctx.lineTo(xb, rail); ctx.lineTo(xb, eb[1]); ctx.stroke()
  // along the rail: source (when there is one), switch, load, ammeter; the voltmeter hangs across
  const meters = [...pa.e.parts, ...(same ? [] : pb.e.parts)].map(k => kindOf(k)?.instrument).filter(m => m?.needs === 'circuit')
  const items: Array<'source' | 'switch' | 'load' | 'A'> = []
  if (c.source > 0) items.push('source')
  items.push('switch', 'load')
  if (meters.some(m => m!.reads === 'I')) items.push('A')
  const span = xb - xa
  items.forEach((it, i) => {
    const x = xa + (span * (i + 1)) / (items.length + 1)
    if (it === 'switch') {
      drawSymbol(ctx, P, c.on ? 'switchOn' : 'switchOff', x, rail, line)
      zones.push({ vessel: pa.id, part: `circuit:${c.id}`, x0: (x - 14 - view.ox) / view.ppc, x1: (x + 14 - view.ox) / view.ppc, y0: (view.oy - rail - 12) / view.ppc, y1: (view.oy - rail + 14) / view.ppc })
    } else if (it === 'A') {
      drawSymbol(ctx, P, 'A', x, rail, line)
      drawReadout(ctx, P, x, rail - 24 * line, qty(live ? Math.abs(c.I) : 0, 'A', 3), { align: 'center', scale: Math.min(1, line), line })
    } else {
      drawSymbol(ctx, P, it, x, rail, line)
      ctx.fillStyle = P.ink2; ctx.font = `500 ${11 * line}px ${P.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(it === 'source' ? withUnit(fixed(c.source, c.source % 1 ? 1 : 0), 'V') : withUnit(fixed(c.load, c.load < 10 && c.load % 1 ? 1 : 0), 'Ω'), x, rail + 12 * line)
    }
  })
  if (meters.some(m => m!.reads === 'U')) {
    const y = rail - 34 * line - (items.includes('A') ? 30 * line : 0), xm = (xa + xb) / 2
    ctx.beginPath(); ctx.moveTo(xa, rail); ctx.lineTo(xa, y); ctx.lineTo(xb, y); ctx.lineTo(xb, rail); ctx.stroke()
    drawSymbol(ctx, P, 'V', xm, y, line)
    const u = c.on && c.connected ? c.U : c.connected ? c.emf : 0
    drawReadout(ctx, P, xm + 14 * line, y - 16 * line, qty(u, 'V', 2), { scale: Math.min(1, line), line })
  }
  // the salt bridge: an inverted U between the two liquids
  if (c.bridge && !same) {
    const ya = sy(view, pa.base + Math.max(1, (surf(pa) ?? 2) * 0.5)), yb = sy(view, pb.base + Math.max(1, (surf(pb) ?? 2) * 0.5)), top = sy(view, Math.max(pa.mouth, pb.mouth) + 2)
    const x1 = sx(view, pa.x + (pa.x < pb.x ? 1 : -1) * radiusAt(pa.shape, pa.shape.top) * 0.5), x2 = sx(view, pb.x + (pa.x < pb.x ? -1 : 1) * radiusAt(pb.shape, pb.shape.top) * 0.5)
    const path = () => { ctx.beginPath(); ctx.moveTo(x1, ya); ctx.lineTo(x1, top); ctx.lineTo(x2, top); ctx.lineTo(x2, yb) }
    ctx.lineCap = 'round'
    ctx.strokeStyle = P.ink2; ctx.lineWidth = Math.max(6, 0.6 * view.ppc); path(); ctx.stroke()
    ctx.strokeStyle = P.solid; ctx.lineWidth = Math.max(6, 0.6 * view.ppc) - 2 * Math.max(1, STROKE * line * 0.7); path(); ctx.stroke()
  }
  ctx.restore()
}

export { Effects, Phenomena }
