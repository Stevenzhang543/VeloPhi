/**
 * The sketch compiler (26.64, D280): a scene sketch (schema.ts) becomes a scene, built with the constructors the
 * templates use (core/scene/build.ts). Every coordinate is worked out here — the model gave none: surfaces first, then
 * the bodies on them, bodies on bodies, pulleys, and the bodies whose place follows from a connector (hanging from a
 * rope, held by a spring of given length). The order is not fixed but follows what depends on what; things that wait
 * for each other in a circle, and places fixed twice in different ways, come back as diagnostics — nothing is guessed.
 * What the problem did not give (sizes, g, a rope's drop) takes a default that is recorded as an assumption.
 *
 * The result also says what the sketch declares — who rests on whom, what hangs, which ropes are taut, how far a spring
 * is compressed — so that check.ts can hold the compiled scene against the engine's own contact detection and trial run.
 */
import { addBody, addConnector, addGround, addIncline, addPulley, anchor, defaultGravity, emptyScene } from '../../core/scene/build'
import type { Anchor, BodyDef, BodyRole, ForceDef, HingeDef, Material, RodDef, RopeDef, Scene, ShapeDef, SpringDef } from '../../core/scene/types'
import { arcDeg } from '../../core/scene/arc'
import { cos, sin, tan } from '../../core/math/dmath'
import { polygonCentroid, polygonIsSimple } from '../../engine/calc'
import { EngineSession } from '../../engine/session'
import { frameView } from '../../engine/views'
import { fitSceneView } from '../copilot/simScene'
import type { BodySketch, ConnectorSketch, Diagnostic, ExpectRow, PointName, PulleySketch, SceneSketch, SurfaceSketch } from './schema'
import { idsOf, parsePoint } from './schema'
import { Values, canonicalOf } from './values'
import type { ArcRun, LineRun, Run, Task, V } from './place'
import { DEG, PlaceError, add, arcAngle, dot, inSpan, isLevel, len, mul, num, onLine, placeAlong, polar, pulleyAtEnd, rot, runDir, runLength, runPoint, solve, sub, unit, wrapsOf } from './place'

/** Something the problem did not give and the app chose: a key of messages.ts with its parameters. */
export interface Assumption { key: string; params: Array<string | number> }

/** What a rope end should look like next to its pulley: plumb, or along the surface its body moves on. */
export interface RopeAlign { end: 0 | 1; kind: 'vertical' | 'along'; dir?: V }

export interface Compiled {
  scene: Scene | null
  diagnostics: Diagnostic[]
  assumptions: Assumption[]
  /** Declared contacts: the body rests on `on` (or, where two surfaces join, on `or`), or stands beside it touching (`beside`). */
  supports: Array<{ body: string; on: string; or?: string; path: string; beside?: boolean }>
  /** Bodies declared to touch nothing: hanging, or in the air. */
  free: Array<{ body: string; why: 'hanging' | 'air'; path: string }>
  ropes: Array<{ id: string; index: number; slack: boolean; ends: Array<string | null>; align: RopeAlign[] }>
  springs: Array<{ id: string; index: number; extension: number | null }>
  /** What the sketch says happens at the start (its `expect` rows). */
  expect: ExpectRow[]
  /** Display names by id. */
  names: Record<string, string>
  placed: string[]
  unplaced: string[]
}

interface SurfaceP { sk: SurfaceSketch; index: number; run: Run | null; pts: Record<string, V>; sunk?: { on: string; x: number }; footY?: number; level?: number; x0?: number; x1?: number; face?: { x: number; out: 1 | -1; y0: number; y1: number }; bound?: { x: number; side: 'left' | 'right' }; theta?: number }
interface BodyP { sk: BodySketch; index: number; shape: ShapeDef; kind: 'rigid' | 'particle'; role: BodyRole; w: number; h: number; r: number; round: boolean; foot: V; half: number; mass: number; inertia: number | null; fixedRotation: boolean; position: V | null; angle: number; on: Run | null; def: BodyDef | null; slope?: { theta: number; side: 'left' | 'right'; base: number; height: number; cx: number; cy: number } }
interface PulleyP { sk: PulleySketch; index: number; r: number; centre: V | null; hang: Record<string, 1 | -1> }

const THICK = { table: 0.2, wall: 0.2, ceiling: 0.08, arc: 0.1 }
/**
 * How far (m) a quarter or standing half arc is let into the level surface its lower end joins. Flush, the arc's end
 * face would meet that surface in one corner, and a body gliding from one onto the other would strike the corner and
 * stop. Sunk by this much — above the engine's contact tolerance of 1e-9 m — the two surfaces cross at an angle of
 * about √(2·SINK/R) ≈ 2·10⁻⁴ rad, which costs a relative 10⁻⁸ of the speed.
 */
const SINK = 1e-8
const BODY_FEATURES = ['', 'center', 'top', 'bottom', 'left', 'right']
const SURFACE_FEATURES: Record<string, string[]> = { ground: ['', 'leftEnd', 'rightEnd'], table: ['', 'leftEnd', 'rightEnd'], ceiling: ['', 'leftEnd', 'rightEnd'], steps: ['', 'leftEnd', 'rightEnd', 'top'], wall: ['', 'top', 'bottom'], incline: ['', 'top', 'bottom'], arc: ['', 'top', 'bottom', 'center', 'leftEnd', 'rightEnd'] }

/** Compile a sketch that passed L0. `values` is its value table (L1 findings of the table itself are in it). */
export function compileSketch(sketch: SceneSketch, values: Values = new Values(sketch)): Compiled {
  return new Compiler(sketch, values).run()
}

class Compiler {
  private readonly out: Compiled = { scene: null, diagnostics: [], assumptions: [], supports: [], free: [], ropes: [], springs: [], expect: [], names: {}, placed: [], unplaced: [] }
  private readonly ids: ReturnType<typeof idsOf>
  private readonly surfaces = new Map<string, SurfaceP>()
  private readonly bodies = new Map<string, BodyP>()
  private readonly pulleys = new Map<string, PulleyP>()
  /** Places of the free fixed points, by "connector:end". */
  private readonly fixed = new Map<string, V>()
  private scene!: Scene
  private g = 0
  private reach = 10
  private horizon = 2
  private vmax = 0
  private baseY = 0

  constructor(private readonly sk: SceneSketch, private readonly v: Values) { this.ids = idsOf(sk) }

  private diag(code: string, path: string, expected: string, got: string, hint = '', allow?: string[]) {
    this.out.diagnostics.push({ code, level: Number(code[1]) as Diagnostic['level'], path, expected, got, hint, ...(allow ? { allow } : {}) })
  }
  private assume(key: string, ...params: Array<string | number>) { this.out.assumptions.push({ key, params }) }
  private name(id: string): string { return this.out.names[id] ?? id }

  run(): Compiled {
    const s = this.sk
    for (const list of [s.surfaces, s.bodies, s.pulleys, s.connectors]) for (const o of list) this.out.names[o.id] = o.name || o.id
    this.out.diagnostics.push(...this.v.diagnostics)
    this.out.expect = s.expect
    this.checkReferences()
    if (this.out.diagnostics.length) return this.out
    this.scene = emptyScene(s.title || 'AI')
    this.settings()
    this.sizeBodies()
    if (this.out.diagnostics.length) return this.out
    this.placeAll()
    if (this.out.diagnostics.length) return this.out
    this.connect()
    this.materials()
    if (this.out.diagnostics.length) return this.out
    this.fitRopeLengths()
    this.finish()
    if (!this.out.diagnostics.length) this.out.scene = this.scene
    return this.out
  }

  // ---- level L1: names, combinations, the values a kind of object cannot do without ----

  private checkReferences() {
    const s = this.sk
    const known = () => [...this.ids.keys()].join(', ')
    const kindOf = (id: string) => this.ids.get(id)
    // (a row that is there but wrong has its own finding: it is not also "missing")
    const need = (of: string, quantity: string, path: string, what: string) => { if (!this.v.has(of, quantity) && !this.v.tried(of, quantity)) this.diag('L1.missing', 'values', `a value {of: "${of}", quantity: "${quantity}"} (${what})`, 'none', 'add the row; if the problem does not give it, choose a value and leave its quote empty', ['values[+]', path]) }
    const point = (text: string, path: string, where: 'rope-end' | 'rope-mid' | 'end' | 'mount' | 'join'): PointName | null => {
      const p = parsePoint(text)
      if (!p) { this.diag('L1.reference', path, 'a named point: A.top, A.center, table.rightEnd, ceiling, "ceiling x=0.5m", "wall height=1m", a pulley id or "fixed"', text || '""', ''); return null }
      if (p.owner === 'fixed' && !p.feature && !p.coord) { if (where === 'mount' || where === 'join' || where === 'rope-mid') this.diag('L1.reference', path, where === 'rope-mid' ? 'a pulley id between the two ends of a rope' : 'a point of a surface', 'fixed', ''); return p }
      const o = kindOf(p.owner)
      if (!o) { this.diag('L1.reference', path, 'the id of something in this sketch', p.owner, `known ids: ${known()}`); return null }
      if (o.list === 'pulleys') { if (where !== 'rope-mid' || p.feature || p.coord) this.diag('L1.reference', path, where === 'rope-mid' ? 'the bare pulley id' : 'a point of a body or surface (pulleys go between the two ends of a rope path)', text, ''); return p }
      if (where === 'rope-mid') { this.diag('L1.reference', path, 'a pulley id between the two ends of a rope', text, 'the first and last entries of a rope path are its ends'); return p }
      if (o.list === 'connectors') { this.diag('L1.reference', path, 'a point of a body or surface', `${p.owner} is a ${o.type}`, ''); return null }
      if (o.list === 'bodies') {
        if (where === 'join') this.diag('L1.reference', path, 'a point of a surface', text, '')
        else if (where === 'mount') this.diag('L1.unsupported', path, 'a pulley mounted on a surface, the ceiling or a wall (fixed pulleys)', `${text} (a movable pulley on a body)`, 'movable pulleys are not built from a sketch: use the template "movable-pulley" (route template) if the problem fits it')
        else if (p.coord || !BODY_FEATURES.includes(p.feature)) this.diag('L1.reference', path, `a point of ${p.owner}: ${p.owner}.center, .top, .bottom, .left, .right`, text, '')
        return p
      }
      const feats = SURFACE_FEATURES[o.type] ?? ['']
      if (p.coord) {
        const okAxis = p.coord.axis === 'x' ? ['ground', 'table', 'ceiling', 'steps'].includes(o.type) : ['wall', 'incline'].includes(o.type)
        if (!okAxis) this.diag('L1.reference', path, p.coord.axis === 'x' ? 'x= on a ground, table or ceiling' : 'height= on a wall or incline', text, '')
        const u = lengthUnit(p.coord.unit)
        if (u === null) this.diag('L1.unit', path, 'a length with its unit, e.g. "ceiling x=0.5m"', text, 'write the unit right after the number')
      } else if (!feats.includes(p.feature)) this.diag('L1.reference', path, `a point of the ${o.type} ${p.owner}: ${feats.map(f => (f ? `${p.owner}.${f}` : p.owner)).join(', ')}`, text, '')
      return p
    }

    if (s.surfaces.filter(x => x.type === 'ground').length > 1) this.diag('L1.unsupported', 'surfaces', 'one ground', `${s.surfaces.filter(x => x.type === 'ground').length} grounds`, 'use a table for a second level')
    s.surfaces.forEach((x, i) => {
      const path = `surfaces[${i}]`
      if (x.at) point(x.at, `${path}.at`, 'join')
      if (x.type === 'incline') need(x.id, 'angle', path, 'the angle of the incline')
      if (x.type === 'arc') {
        need(x.id, 'radius', path, 'the radius of the track')
        if (!x.span) this.diag('L1.missing', `${path}.span`, 'quarter | half | bowl | full | hump | angles', '""', 'say how much of the circle the track is')
        if (x.span === 'angles') { need(x.id, 'startAngle', path, 'where the arc starts'); need(x.id, 'endAngle', path, 'where it ends') }
      } else if (x.span) this.diag('L1.place', `${path}.span`, '"" (span is for arcs)', x.span, '')
    })

    s.bodies.forEach((b, i) => {
      const path = `bodies[${i}]`
      need(b.id, 'mass', path, 'every movable body needs its mass')
      if (b.moves !== 'rest') need(b.id, 'speed', path, `it moves ${b.moves}`)
      if (b.moves === 'angle') need(b.id, 'launchAngle', path, 'the angle of its velocity above the horizontal')
      if (b.type === 'polygon' && b.points.length < 3) this.diag('L1.missing', `${path}.points`, 'at least three corners "x y"', `${b.points.length}`, '')
      const ref = b.ref ? kindOf(b.ref) : undefined
      const bad = (expected: string) => this.diag('L1.reference', `${path}.ref`, expected, b.ref ? `${b.ref}${ref ? ` (a ${ref.type})` : ' (no such id)'}` : '""', `known ids: ${known()}`)
      if (b.ref === b.id) { bad('something else than the body itself'); return }
      if (b.place === 'on') {
        const okSurface = ref?.list === 'surfaces' && ['ground', 'table', 'incline', 'steps'].includes(ref.type)
        const okBody = ref?.list === 'bodies' && ['block', 'board', 'cart', 'wedge'].includes(ref.type)
        const okSpring = ref?.list === 'connectors' && ref.type === 'spring'
        if (ref?.list === 'surfaces' && ref.type === 'arc') this.diag('L1.place', `${path}.place`, 'inside or outside for a body on an arc track', 'on', 'inside: grooves and loops; outside: humps')
        else if (!okSurface && !okBody && !okSpring) bad('a ground, table, incline or steps, a block / board / cart / wedge, or a vertical spring')
        const ats = okSpring ? ['', 'connector', 'equilibrium'] : ['', 'left', 'middle', 'right', 'top', 'bottom', 'fromLeft', 'fromRight', 'fromTop', 'fromBottom', 'atHeight', 'leftOf', 'rightOf', 'connector']
        if (!ats.includes(b.at)) this.diag('L1.place', `${path}.at`, ats.map(a => a || '""').join(' | '), b.at, '')
        if (b.at === 'leftOf' || b.at === 'rightOf') {
          const o = b.ref2 ? kindOf(b.ref2) : undefined
          if (!o || b.ref2 === b.id || !(o.list === 'bodies' || (o.list === 'surfaces' && o.type === 'wall'))) this.diag('L1.reference', `${path}.ref2`, `the wall or body it stands ${b.at === 'leftOf' ? 'left' : 'right'} of`, b.ref2 || '""', '')
        }
        if (b.at === 'connector' && !okSpring && !this.positioner(b)) this.diag('L1.reference', `${path}.at`, 'a spring, rod or rope (without pulleys) with one end on this body', 'no such connector', 'name a point of this body in the connector\'s path, or give the place another way', [`${path}.at`, 'connectors'])
      } else if (b.place === 'hanging') {
        if (!(ref?.list === 'connectors' && ['rope', 'spring', 'rod', 'hinge'].includes(ref.type))) bad('the rope, spring, rod or hinge it hangs from')
        if (!['', 'below', 'left', 'right', 'equilibrium'].includes(b.at)) this.diag('L1.place', `${path}.at`, '"" | below | left | right | equilibrium', b.at, 'left / right: deflected to that side by its "angle" (from the vertical)')
      } else if (b.place === 'inside' || b.place === 'outside') {
        if (!(ref?.list === 'surfaces' && ref.type === 'arc')) bad('an arc track')
      } else if (b.place === 'air') {
        if (b.ref) this.diag('L1.place', `${path}.ref`, '"" for a body in the air', b.ref, 'a height above a surface goes into ref2 with a heightAbove value')
        const hasXY = this.v.has(b.id, 'y'), hasH = !!b.ref2 && this.v.has(b.id, 'heightAbove')
        if (!hasXY && !hasH) this.diag('L1.missing', 'values', `where ${b.id} is: a heightAbove value with ref2 naming the surface, or x and y values`, 'neither', 'a body in the air has no support to place it by', ['values[+]', `${path}.ref2`, `${path}.place`, `${path}.ref`, `${path}.at`])
      }
      if (b.ref2 && !(b.at === 'leftOf' || b.at === 'rightOf')) {
        const o = kindOf(b.ref2)
        if (!(o?.list === 'surfaces' && ['ground', 'table', 'steps'].includes(o.type))) this.diag('L1.reference', `${path}.ref2`, 'the ground or table a heightAbove value is measured from', b.ref2, '')
      }
      if (b.type === 'wedge' && b.at === 'connector') this.diag('L1.unsupported', `${path}.at`, 'a wedge placed on its support by left / middle / right or a distance', 'connector', '')
    })

    s.pulleys.forEach((p, i) => {
      if (p.at) point(p.at, `pulleys[${i}].at`, 'mount')
      if (!s.connectors.some(c => c.type === 'rope' && c.path.slice(1, -1).includes(p.id))) this.diag('L1.reference', `pulleys[${i}]`, 'a rope whose path runs over this pulley', 'no rope uses it', `put "${p.id}" between the ends of the rope's path`, ['connectors'])
    })

    s.connectors.forEach((c, i) => {
      const path = `connectors[${i}]`
      const n = c.path.length
      const want = c.type === 'rope' ? n >= 2 : c.type === 'force' ? n === 1 : n === 2
      if (!want) { this.diag('L1.reference', `${path}.path`, c.type === 'rope' ? 'two ends, with the pulleys it runs over between them' : c.type === 'force' ? 'the one point the force acts on' : 'two ends', `${n} entries`, ''); return }
      const pts = c.path.map((t, k) => point(t, `${path}.path[${k}]`, c.type === 'rope' ? (k === 0 || k === n - 1 ? 'rope-end' : 'rope-mid') : 'end'))
      if (pts.some(p => !p)) return
      const onBody = pts.filter(p => p && this.ids.get(p.owner)?.list === 'bodies').length
      if (c.type !== 'rope' && onBody === 0) this.diag('L1.reference', `${path}.path`, 'at least one end on a body', c.path.join(', '), '')
      if (c.type === 'rope' && n === 2 && pts[0]!.owner === pts[1]!.owner && pts[0]!.owner !== 'fixed') this.diag('L1.reference', `${path}.path`, 'two different ends', c.path.join(', '), '')
      const modes: Record<string, string[]> = { rope: ['', 'taut', 'slack'], spring: ['', 'fastened', 'notFastened'], rod: [''], hinge: [''], force: ['right', 'left', 'up', 'down', 'upSlope', 'downSlope', 'angle'] }
      if (!modes[c.type].includes(c.mode)) this.diag('L1.place', `${path}.mode`, modes[c.type].map(m => m || '""').join(' | '), c.mode || '""', '')
      if (c.type === 'spring') need(c.id, 'stiffness', path, 'the stiffness of the spring')
      if (c.type === 'force') { need(c.id, 'magnitude', path, 'the magnitude of the force'); if (c.mode === 'angle') need(c.id, 'angle', path, 'its angle above the horizontal') }
      if (c.type === 'rope' && c.mode === 'slack') need(c.id, 'length', path, 'a slack rope needs its length')
      if (c.type === 'spring' && this.v.has(c.id, 'compression') && this.v.has(c.id, 'extension')) this.diag('L1.duplicate', `values[${this.v.rowOf(c.id, 'extension')}]`, 'either a compression or an extension', 'both', 'set one of the two rows to null', [`values[${this.v.rowOf(c.id, 'compression')}]`])
    })

    s.expect.forEach((e, i) => {
      const o = kindOf(e.of)
      const rope = e.state === 'taut' || e.state === 'slack'
      if (!o || (rope ? !(o.list === 'connectors' && o.type === 'rope') : o.list !== 'bodies')) this.diag('L1.reference', `expect[${i}].of`, rope ? 'a rope id' : 'a body id', e.of || '""', '')
    })
  }

  /** The connector that fixes where a body stands along its support: the first spring, rod or pulley-less rope with one end on it. */
  private positioner(b: BodySketch): { c: ConnectorSketch; index: number; mine: 0 | 1 } | null {
    for (const [index, c] of this.sk.connectors.entries()) {
      if (!['spring', 'rod', 'rope'].includes(c.type) || c.path.length !== 2) continue
      const owners = c.path.map(t => parsePoint(t)?.owner)
      if (owners[0] === b.id && owners[1] !== b.id) return { c, index, mine: 0 }
      if (owners[1] === b.id && owners[0] !== b.id) return { c, index, mine: 1 }
    }
    return null
  }

  // ---- settings and sizes ----

  private settings() {
    const s = this.sk, sc = this.scene
    if (s.gravity === 'none') { this.g = 0; this.v.get('world', 'g') }
    else {
      const g = this.v.get('world', 'g')
      this.g = g ?? defaultGravity()
      if (g === undefined) this.assume('g', num(this.g))
    }
    sc.settings.gravity = { x: 0, y: -this.g }
    const times = s.questions.filter(q => q.kind === 'quantity' && Number.isFinite(q.t) && q.t > 0).map(q => q.t)
    this.horizon = times.length ? Math.max(...times) : 2
    this.vmax = Math.max(0, ...s.bodies.map(b => (this.v.has(b.id, 'speed') ? this.v.rows.find(r => r.of === b.id && r.quantity === 'speed')!.si : 0)))
    // How far anything can get within the asked times: the size of grounds and of slopes whose length is not given
    this.reach = Math.min(200, Math.max(10, this.vmax * this.horizon + 0.5 * this.g * this.horizon * this.horizon + 4))
  }

  private sizeBodies() {
    this.sk.bodies.forEach((b, index) => {
      const v = this.v, id = b.id
      const dim = (qn: string, def: number, label: string) => { const x = v.get(id, qn); if (x === undefined) this.assume('size', this.name(id), label, num(def)); return x ?? def }
      const mass = v.get(id, 'mass')!
      let p: BodyP
      const base = { sk: b, index, mass, position: null, angle: 0, on: null, def: null, inertia: null as number | null }
      if (b.type === 'ball' || b.type === 'disc' || b.type === 'point' || b.type === 'ring') {
        const r = b.type === 'point' ? 0 : dim('radius', b.type === 'ball' ? 0.05 : 0.15, 'radius')
        const t = Math.min(0.012, r / 4)
        const shape: ShapeDef = b.type === 'ring' ? arcDeg(r - t, t, 0, 360) : { type: 'circle', radius: r }
        p = { ...base, shape, kind: b.type === 'ball' || b.type === 'point' ? 'particle' : 'rigid', role: b.type === 'ball' || b.type === 'point' ? 'ball' : 'wheel', w: 2 * r, h: 2 * r, r, round: true, foot: { x: 0, y: -r }, half: r, fixedRotation: false }
      } else if (b.type === 'wedge') {
        const theta = v.get(id, 'slopeAngle') ?? (this.assume('size', this.name(id), 'slopeAngle', '30°'), 30 * DEG)
        const hGiven = v.get(id, 'height'), bGiven = v.get(id, 'base')
        if (hGiven !== undefined && bGiven !== undefined && Math.abs(bGiven * tan(theta) - hGiven) > 1e-6 * Math.max(1, hGiven)) this.diag('L2.overconstrained', `values[${v.rowOf(id, 'height')}]`, `height = base·tan(angle) = ${num(bGiven * tan(theta))} m`, `${num(hGiven)} m`, 'give the angle and one of base / height', [`values[${v.rowOf(id, 'base')}]`])
        const wbase = bGiven ?? (hGiven !== undefined ? hGiven / tan(theta) : (this.assume('size', this.name(id), 'base', '1.2'), 1.2))
        const H = wbase * tan(theta)
        const side = b.side === 'right' ? 'right' : 'left'
        // The triangle about its centroid: the right angle under the high end
        const cx = side === 'left' ? wbase / 3 : (2 * wbase) / 3, cy = H / 3
        const pts = side === 'left' ? [{ x: 0, y: 0 }, { x: wbase, y: 0 }, { x: 0, y: H }] : [{ x: 0, y: 0 }, { x: wbase, y: 0 }, { x: wbase, y: H }]
        const shape: ShapeDef = { type: 'polygon', points: pts.map(q => ({ x: q.x - cx, y: q.y - cy })) }
        p = { ...base, shape, kind: 'rigid', role: 'incline', w: wbase, h: H, r: 0, round: false, foot: { x: wbase / 2 - cx, y: -cy }, half: wbase / 2, fixedRotation: true, slope: { theta, side, base: wbase, height: H, cx, cy } }
      } else if (b.type === 'polygon') {
        const raw = b.points.map(t => t.trim().split(/[\s,;]+/).map(Number))
        if (raw.some(q => q.length !== 2 || !q.every(Number.isFinite))) { this.diag('L0.type', `bodies[${index}].points`, 'corners as "x y" in metres, e.g. "0 0", "0.4 0", "0 0.3"', b.points.join(' | ').slice(0, 80), ''); return }
        let pts = raw.map(([x, y]) => ({ x, y }))
        if (!polygonIsSimple(pts)) { this.diag('L1.range', `bodies[${index}].points`, 'a polygon whose edges do not cross, with an area', b.points.join(' | ').slice(0, 80), 'list the corners in order around the outline'); return }
        if (signedArea(pts) < 0) pts = pts.reverse()
        const c = polygonCentroid(pts)
        pts = pts.map(q => ({ x: q.x - c.x, y: q.y - c.y }))
        const xs = pts.map(q => q.x), ys = pts.map(q => q.y)
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
        // It stands on its lowest edge: the stretch of the outline at the lowest height
        const low = pts.filter(q => q.y - y0 <= 1e-9 * Math.max(1, y1 - y0)).map(q => q.x)
        const fx = low.length >= 2 ? (Math.min(...low) + Math.max(...low)) / 2 : low[0]
        p = { ...base, shape: { type: 'polygon', points: pts }, kind: 'rigid', role: 'generic', w: x1 - x0, h: y1 - y0, r: 0, round: false, foot: { x: fx, y: y0 }, half: low.length >= 2 ? (Math.max(...low) - Math.min(...low)) / 2 : 0, fixedRotation: false }
      } else {
        const long = b.type === 'board' || b.type === 'rod'
        // a board whose length is not given is long enough for what slides on it to come to rest relative to it
        const w = long ? dim('length', b.type === 'board' ? Math.min(30, Math.max(2, Math.ceil(0.3 * this.vmax * this.vmax + 1))) : 1, 'length') : dim('width', b.type === 'cart' ? 0.4 : 0.2, 'width')
        const h = b.type === 'rod' ? 0.04 : dim('height', b.type === 'board' ? 0.1 : b.type === 'cart' ? 0.15 : 0.2, 'height')
        p = { ...base, shape: { type: 'box', width: w, height: h }, kind: 'rigid', role: b.type === 'board' ? 'board' : b.type === 'rod' ? 'rod' : 'block', w, h, r: 0, round: false, foot: { x: 0, y: -h / 2 }, half: w / 2, fixedRotation: b.type === 'cart' }
        // A thin rod: the textbook moment of inertia (its thickness is only drawn), as the hinged-rod template
        if (b.type === 'rod') p.inertia = (mass * w * w) / 12
        if (b.type === 'cart') this.assume('cart', this.name(id))
      }
      this.bodies.set(id, p)
    })
  }

  // ---- placement ----

  private placeAll() {
    const s = this.sk
    const fail = (list: string) => (t: Task, e: unknown) => {
      const [kind, id] = t.id.split(':')
      const o = this.ids.get(id)
      const path = o ? `${o.list}[${o.index}]` : list
      if (e instanceof PlaceError) this.diag(e.code, kind === 'body' && e.code === 'L1.place' ? `${path}.at` : path, e.expected, e.got, e.hint, e.allow ?? (e.code === 'L1.missing' ? ['values[+]', path] : undefined))
      else throw e
    }
    // 1 · surfaces (they depend only on each other), then the free stretch of the ground between them
    // what stands on the ground by default waits for the ground
    const ground = s.surfaces.find(x => x.type === 'ground')
    const st: Task[] = s.surfaces.map((x, index) => ({ id: `surface:${x.id}`, deps: x.at ? this.pointDeps(x.at) : ground && x !== ground ? [`surface:${ground.id}`] : [], run: () => this.placeSurface(x, index) }))
    const r1 = solve(st, fail('surfaces'))
    this.reportStuck(r1.stuck)
    if (this.out.diagnostics.length) { this.out.unplaced = [...s.surfaces, ...s.bodies, ...s.pulleys].map(o => o.id).filter(id => !r1.done.has(`surface:${id}`)); this.out.placed = s.surfaces.map(o => o.id).filter(id => r1.done.has(`surface:${id}`)); return }
    this.groundSpan()
    // 2 · bodies and pulleys, in the order their places allow
    const tasks: Task[] = [
      ...s.bodies.map(b => ({ id: `body:${b.id}`, deps: this.bodyDeps(b), run: () => this.placeBody(b) })),
      ...s.pulleys.map(p => ({ id: `pulley:${p.id}`, deps: this.pulleyDeps(p), run: () => this.placePulley(p) }))
    ]
    for (const t of tasks) t.deps = t.deps.filter(d => !d.startsWith('surface:'))
    const r2 = solve(tasks, fail('bodies'))
    this.reportStuck(r2.stuck)
    const all = [...s.bodies, ...s.pulleys].map(o => o.id)
    this.out.placed = [...s.surfaces.map(o => o.id), ...all.filter(id => r2.done.has(`body:${id}`) || r2.done.has(`pulley:${id}`))]
    this.out.unplaced = all.filter(id => !this.out.placed.includes(id))
    if (this.out.diagnostics.length) return
    // The scene's bodies in the order of the sketch (surfaces were added as they were placed)
    for (const b of s.bodies) this.emitBody(this.bodies.get(b.id)!)
    for (const p of s.pulleys) { const q = this.pulleys.get(p.id)!; addPulley(this.scene, { id: p.id, name: this.name(p.id), position: q.centre!, radius: q.r }) }
  }

  private reportStuck(stuck: Task[]) {
    if (!stuck.length) return
    const ids = stuck.map(t => t.id.split(':')[1])
    const first = this.ids.get(ids[0])
    const allow = ids.map(id => { const o = this.ids.get(id); return o ? `${o.list}[${o.index}]` : '' }).filter(Boolean)
    this.diag('L2.cycle', first ? `${first.list}[${first.index}]` : '', 'places that can be worked out one after another', `${ids.join(', ')} wait for each other: ${stuck.map(t => `${t.id.split(':')[1]} needs ${t.deps.map(d => d.split(':')[1]).filter(d => ids.includes(d)).join(' and ')}`).join('; ')}`, 'give one of them a place of its own (on a surface at left / middle / right or a distance)', allow)
  }

  private pointDeps(text: string): string[] {
    const p = text ? parsePoint(text) : null
    if (!p || p.owner === 'fixed') return []
    const o = this.ids.get(p.owner)
    return o ? [`${o.list === 'surfaces' ? 'surface' : o.list === 'bodies' ? 'body' : 'pulley'}:${p.owner}`] : []
  }

  /** Whether a rope fixes where the body is: it hangs from it, or stands where the rope (without pulleys) holds it. */
  private positionedBy(body: string, c: ConnectorSketch): boolean {
    const b = this.bodies.get(body)?.sk
    if (!b) return false
    if (b.place === 'hanging') return b.ref === c.id
    if (b.place === 'on' && this.ids.get(b.ref)?.list === 'connectors') return b.ref === c.id
    return b.place === 'on' && b.at === 'connector' && this.positioner(b)?.c.id === c.id
  }

  private bodyDeps(b: BodySketch): string[] {
    const deps: string[] = []
    const ref = this.ids.get(b.ref)
    const other = (c: ConnectorSketch, mine: number) => {
      // the neighbour along the connector: the next pulley of a rope, else the other end
      const k = mine === 0 ? 1 : c.path.length - 2
      deps.push(...this.pointDeps(c.path[k]))
    }
    if (b.place === 'on' && ref?.list === 'connectors') { const c = this.sk.connectors[ref.index]; const mine = this.endOf(c, b.id); if (mine !== null) other(c, mine) }
    else if (b.place === 'on' || b.place === 'inside' || b.place === 'outside') {
      deps.push(`${ref?.list === 'bodies' ? 'body' : 'surface'}:${b.ref}`)
      if (b.at === 'leftOf' || b.at === 'rightOf') deps.push(`${this.ids.get(b.ref2)?.list === 'bodies' ? 'body' : 'surface'}:${b.ref2}`)
      if (b.at === 'connector') { const pc = this.positioner(b); if (pc) other(pc.c, pc.mine) }
    } else if (b.place === 'hanging') { const c = this.sk.connectors[ref!.index]; const mine = this.endOf(c, b.id); if (mine !== null) other(c, mine) }
    return deps
  }

  /** The end (0 or last index) of a connector's path that is a point of the body; null when neither is. */
  private endOf(c: ConnectorSketch, body: string): number | null {
    const n = c.path.length
    if (parsePoint(c.path[0])?.owner === body) return 0
    if (n > 1 && parsePoint(c.path[n - 1])?.owner === body) return n - 1
    return null
  }

  /** The rope over a pulley with the pulley's two neighbours along it. */
  private ropeOver(p: PulleySketch): { c: ConnectorSketch; k: number } | null {
    for (const c of this.sk.connectors) { if (c.type !== 'rope') continue; const k = c.path.indexOf(p.id, 1); if (k > 0 && k < c.path.length - 1) return { c, k } }
    return null
  }

  private pulleyDeps(p: PulleySketch): string[] {
    const deps = this.pointDeps(p.at)
    const ro = this.ropeOver(p)
    if (ro) for (const k of [ro.k - 1, ro.k + 1]) {
      const q = parsePoint(ro.c.path[k])
      if (!q) continue
      const o = this.ids.get(q.owner)
      // a body whose place follows from this rope is placed after the pulley, not before it
      if (o?.list === 'bodies' && !this.positionedBy(q.owner, ro.c)) deps.push(`body:${q.owner}`)
    }
    return deps
  }

  private material(id: string): Partial<Material> {
    const mu = this.v.get(id, 'mu'), muS = this.v.get(id, 'muS') ?? mu, muK = this.v.get(id, 'muK') ?? mu ?? muS, e = this.v.get(id, 'restitution')
    return { muS: muS ?? muK ?? 0, muK: muK ?? 0, restitution: e ?? 0 }
  }

  private placeSurface(x: SurfaceSketch, index: number) {
    const v = this.v, sc = this.scene, id = x.id, name = this.name(id)
    const joint = x.at ? this.pointOf(parsePoint(x.at)!, undefined) : null
    const belt = v.get(id, 'beltSpeed') ?? 0
    const p: SurfaceP = { sk: x, index, run: null, pts: {} }
    const assumeDim = (qn: string, def: number, label: string) => { const g = v.get(id, qn); if (g === undefined) this.assume('size', name, label, num(def)); return g ?? def }
    if (x.type === 'ground') {
      const y = 0
      this.baseY = y
      addGround(sc, { id, name, top: y, left: -this.reach, right: this.reach, material: this.material(id), beltSpeed: belt, role: belt ? 'conveyor' : 'ground' })
      p.level = y; p.x0 = -this.reach; p.x1 = this.reach
      p.run = { kind: 'line', owner: id, a: { x: -2, y }, b: { x: 2, y }, n: { x: 0, y: 1 } }
    } else if (x.type === 'table') {
      const h = assumeDim('height', 0.8, 'height'), L = assumeDim('length', 2, 'length')
      const x0 = joint ? joint.x : 0, y = (joint ? joint.y : this.baseY) + h
      addBody(sc, { id, name, kind: 'static', role: belt ? 'conveyor' : 'ground', shape: { type: 'box', width: L, height: THICK.table }, position: { x: x0 + L / 2, y: y - THICK.table / 2 }, material: this.material(id), beltSpeed: belt })
      p.level = y; p.x0 = x0; p.x1 = x0 + L
      p.run = { kind: 'line', owner: id, a: { x: x0, y }, b: { x: x0 + L, y }, n: { x: 0, y: 1 } }
      p.pts = { leftEnd: { x: x0, y }, rightEnd: { x: x0 + L, y } }
    } else if (x.type === 'ceiling') {
      const h = assumeDim('height', 2.5, 'height'), y = this.baseY + h, half = Math.min(this.reach, 6)
      addBody(sc, { id, name, kind: 'static', role: 'wall', shape: { type: 'box', width: 2 * half, height: THICK.ceiling }, position: { x: 0, y: y + THICK.ceiling / 2 }, material: this.material(id) })
      p.level = y; p.x0 = -half; p.x1 = half
      p.pts = { leftEnd: { x: -half, y }, rightEnd: { x: half, y } }
    } else if (x.type === 'wall') {
      const h = assumeDim('height', 1, 'height')
      const jp = x.at ? parsePoint(x.at)! : null
      // at an end of a surface it faces inward; elsewhere `side` says which side of the scene it closes
      const side = jp?.feature === 'leftEnd' ? 'left' : jp?.feature === 'rightEnd' ? 'right' : x.side || 'left'
      const out: 1 | -1 = side === 'left' ? 1 : -1
      const d = joint ? 0 : (v.get(id, 'distance') ?? (this.assume('size', name, 'distance', '2'), 2))
      const fx = joint ? joint.x : -out * d, y0 = joint ? joint.y : this.baseY
      addBody(sc, { id, name, kind: 'static', role: 'wall', shape: { type: 'box', width: THICK.wall, height: h }, position: { x: fx - (out * THICK.wall) / 2, y: y0 + h / 2 }, material: this.material(id) })
      p.face = { x: fx, out, y0, y1: y0 + h }
      p.bound = { x: fx, side }
      p.footY = y0
      p.pts = { top: { x: fx, y: y0 + h }, bottom: { x: fx, y: y0 } }
    } else if (x.type === 'incline') {
      const th = v.get(id, 'angle')!
      const Lg = v.get(id, 'length'), Hg = v.get(id, 'height'), Bg = v.get(id, 'base')
      const given = [Lg, Hg, Bg].filter(q => q !== undefined).length
      let base: number
      if (Bg !== undefined) base = Bg
      else if (Lg !== undefined) base = Lg * cos(th)
      else if (Hg !== undefined) base = Hg / tan(th)
      else { const L = Math.min(60, Math.max(2, this.vmax * this.horizon + 0.5 * this.g * sin(th) * this.horizon * this.horizon + 1)); base = L * cos(th); this.assume('size', name, 'length', num(L)) }
      if (given > 1) {
        // more than one of length / height / base: they must describe the same triangle
        const want = { length: base / cos(th), height: base * tan(th) }
        for (const [qn, got] of [['length', Lg], ['height', Hg]] as const) if (got !== undefined && Math.abs(got - want[qn]) > 1e-6 * Math.max(1, got)) this.diag('L2.overconstrained', `values[${v.rowOf(id, qn)}]`, `${qn} = ${num(want[qn])} m (from the angle and the other size)`, `${num(got)} m`, 'give the angle and one of length / height / base', ['length', 'height', 'base'].filter(k => v.has(id, k)).map(k => `values[${v.rowOf(id, k)}]`))
      }
      const H = base * tan(th)
      const side = x.side === 'right' ? 'right' : 'left'
      // a bare surface as the joint: the incline stands at that surface's end, its high end outward
      const foot = joint ?? { x: 0, y: this.baseY }
      const mat = this.material(id)
      if (side === 'left') {
        const x0 = foot.x - base
        addIncline(sc, { id, name, angle: th, base, x0, y0: foot.y, material: mat, beltSpeed: belt, role: belt ? 'conveyor' : 'incline' })
        const top = { x: x0, y: foot.y + H }
        p.run = { kind: 'line', owner: id, a: top, b: foot, n: { x: sin(th), y: cos(th) } }
        p.pts = { top, bottom: foot }
      } else {
        addBody(sc, { id, name, kind: 'static', role: belt ? 'conveyor' : 'incline', shape: { type: 'polygon', points: [{ x: foot.x, y: foot.y }, { x: foot.x + base, y: foot.y }, { x: foot.x + base, y: foot.y + H }] }, position: { x: 0, y: 0 }, material: mat, beltSpeed: belt })
        const top = { x: foot.x + base, y: foot.y + H }
        p.run = { kind: 'line', owner: id, a: top, b: foot, n: { x: -sin(th), y: cos(th) } }
        p.pts = { top, bottom: foot }
      }
      p.bound = { x: foot.x, side }
      p.footY = foot.y
      p.theta = th
    } else if (x.type === 'arc') {
      const R = v.get(id, 'radius')!
      // Round bodies ride with their centre on the radius of the problem: the track is made that much wider (inside) or
      // narrower (outside), so the answers are those of the textbook's point mass
      const riders = this.sk.bodies.filter(b => b.ref === id && (b.place === 'inside' || b.place === 'outside')).map(b => this.bodies.get(b.id)!).filter(b => b && b.round)
      const rb = riders.length ? Math.max(...riders.map(b => b.r)) : 0
      if (rb > 0) this.assume('arcRadius', name, num(R), num(rb))
      const side = x.side === 'right' ? 'right' : 'left'
      const J = joint ?? { x: 0, y: this.baseY }
      let startDeg: number, sweepDeg: number, outside = false
      if (x.span === 'hump') { const a = (v.get(id, 'angle') ?? (this.assume('size', name, 'angle', '120°'), 120 * DEG)) / DEG; startDeg = 90 - a / 2; sweepDeg = a; outside = true }
      else if (x.span === 'quarter') { startDeg = side === 'left' ? 180 : 270; sweepDeg = 90 }
      else if (x.span === 'half') { startDeg = side === 'right' ? 270 : 90; sweepDeg = 180 }
      else if (x.span === 'bowl') { startDeg = 180; sweepDeg = 180 }
      else if (x.span === 'full') { startDeg = 0; sweepDeg = 360 }
      else { startDeg = v.get(id, 'startAngle')! / DEG; sweepDeg = v.get(id, 'endAngle')! / DEG - startDeg; if (!(sweepDeg > 0 && sweepDeg <= 360)) throw new PlaceError('L1.range', 'endAngle after startAngle by at most 360° (counter-clockwise)', `${num(startDeg)}° to ${num(startDeg + sweepDeg)}°`, '') }
      const mat = this.material(id)
      let c: V, surface: number
      if (outside) {
        surface = R - rb
        const t = Math.min(0.2, surface / 2)
        if (!(surface > 0)) throw new PlaceError('L1.range', 'a hump larger than the body on it', `radius ${num(R)} m, body radius ${num(rb)} m`, '')
        c = { x: J.x, y: J.y - surface * cos((sweepDeg / 2) * DEG) }
        addBody(sc, { id, name, kind: 'static', role: 'ground', shape: arcDeg(surface - t, t, startDeg, sweepDeg), position: c, material: mat, color: '#64748b' })
      } else {
        surface = R + rb
        const joined = joint ? parsePoint(x.at)!.owner : [...this.surfaces.values()].find(q => q.sk.type === 'ground')?.sk.id
        const level = joined !== undefined && ['ground', 'table', 'steps'].includes(this.surfaces.get(joined)?.sk.type ?? '')
        const sink = level && (x.span === 'quarter' || x.span === 'half') ? SINK : 0
        if (sink) p.sunk = { on: joined!, x: J.x }
        c = { x: J.x, y: J.y + surface - sink }
        addBody(sc, { id, name, kind: 'static', role: 'ground', shape: arcDeg(surface, THICK.arc, startDeg, sweepDeg), position: c, material: mat, color: '#64748b' })
      }
      p.run = { kind: 'arc', owner: id, c, r: surface, side: outside ? 'outside' : 'inside', start: startDeg * DEG, sweep: sweepDeg * DEG }
      const at = (deg: number) => add(c, mul(polar(deg * DEG), surface))
      const ends = [at(startDeg), at(startDeg + sweepDeg)]
      p.pts = { center: c, bottom: outside ? J : at(270), top: outside ? at(90) : ends[0].y >= ends[1].y ? ends[0] : ends[1], leftEnd: ends[0].x <= ends[1].x ? ends[0] : ends[1], rightEnd: ends[0].x <= ends[1].x ? ends[1] : ends[0] }
      if (x.span === 'quarter' || x.span === 'half') { p.bound = { x: J.x, side }; p.footY = J.y }
    } else {
      // steps: a staircase going down towards `side`, with a landing on top
      const n = Math.round(v.get(id, 'count') ?? (this.assume('size', name, 'count', '3'), 3))
      const hs = assumeDim('stepHeight', 0.2, 'stepHeight'), ds = assumeDim('stepDepth', 0.3, 'stepDepth'), landing = 1
      const side = x.side === 'left' ? 'left' : 'right'
      const foot = joint ?? { x: 0, y: this.baseY }
      const sg = side === 'right' ? 1 : -1
      // outline from the foot (the outer bottom corner), in units mirrored for a staircase that goes down to the left
      const xE = 0, xL = -(landing + (n - 1) * ds)
      const local: V[] = [{ x: xL, y: 0 }, { x: xE, y: 0 }]
      for (let j = 1; j <= n; j++) { local.push({ x: xE - (j - 1) * ds, y: j * hs }); if (j < n) local.push({ x: xE - j * ds, y: j * hs }) }
      local.push({ x: xL, y: n * hs })
      let pts = local.map(q => ({ x: foot.x + sg * q.x, y: foot.y + q.y }))
      if (sg < 0) pts = pts.reverse()
      addBody(sc, { id, name, kind: 'static', role: 'ground', shape: { type: 'polygon', points: pts }, position: { x: 0, y: 0 }, material: this.material(id) })
      const y = foot.y + n * hs, a = { x: foot.x + sg * xL, y }, b = { x: foot.x + sg * (xL + landing), y }
      p.level = y
      p.run = { kind: 'line', owner: id, a: sg > 0 ? a : b, b: sg > 0 ? b : a, n: { x: 0, y: 1 } }
      p.pts = { leftEnd: sg > 0 ? a : b, rightEnd: sg > 0 ? b : a, top: sg > 0 ? b : a }
      p.x0 = Math.min(a.x, b.x); p.x1 = Math.max(a.x, b.x)
      p.bound = { x: foot.x, side: side === 'right' ? 'left' : 'right' }
      p.footY = foot.y
    }
    this.surfaces.set(id, p)
  }

  /** The free stretch of the ground: between the feet of what stands on it, 4 m where nothing bounds it. */
  private groundSpan() {
    const g = [...this.surfaces.values()].find(x => x.sk.type === 'ground')
    if (!g) return
    const y = g.level!
    const here = [...this.surfaces.values()].filter(x => x.bound && x !== g && Math.abs((x.footY ?? y) - y) < 1e-9)
    const lefts = here.filter(x => x.bound!.side === 'left').map(x => x.bound!.x), rights = here.filter(x => x.bound!.side === 'right').map(x => x.bound!.x)
    let x0 = lefts.length ? Math.max(...lefts) : NaN, x1 = rights.length ? Math.min(...rights) : NaN
    if (Number.isNaN(x0) && Number.isNaN(x1)) { x0 = -2; x1 = 2 } else if (Number.isNaN(x1)) x1 = x0 + 4; else if (Number.isNaN(x0)) x0 = x1 - 4
    if (!(x1 > x0)) { x0 = -2; x1 = 2 }
    g.run = { kind: 'line', owner: g.sk.id, a: { x: x0, y }, b: { x: x1, y }, n: { x: 0, y: 1 } }
    g.pts = { leftEnd: { x: x0, y }, rightEnd: { x: x1, y } }
  }

  /** The run a body can be put on: a surface's, the top of a block / board / cart, the slope of a wedge. */
  private runOf(id: string): Run | null {
    const s = this.surfaces.get(id)
    if (s) return s.run
    const b = this.bodies.get(id)
    if (!b || !b.position) return null
    if (b.slope) {
      const { theta, side, base, height, cx, cy } = b.slope
      const o = { x: b.position.x - cx, y: b.position.y - cy }
      const top = side === 'left' ? { x: o.x, y: o.y + height } : { x: o.x + base, y: o.y + height }
      const foot = side === 'left' ? { x: o.x + base, y: o.y } : { x: o.x, y: o.y }
      return { kind: 'line', owner: id, a: top, b: foot, n: { x: side === 'left' ? sin(theta) : -sin(theta), y: cos(theta) } }
    }
    const a = add(b.position, rot({ x: -b.w / 2, y: b.h / 2 }, b.angle)), c = add(b.position, rot({ x: b.w / 2, y: b.h / 2 }, b.angle))
    return { kind: 'line', owner: id, a, b: c, n: rot({ x: 0, y: 1 }, b.angle) }
  }

  /**
   * The run a body stands on. The ground is wider than the stretch its named places refer to: a distance from one end,
   * a place next to something or one fixed by a connector may lie beyond the other end.
   */
  private standRun(b: BodySketch): Run | null {
    const run = this.runOf(b.ref)
    const s = this.surfaces.get(b.ref)
    if (!run || run.kind !== 'line' || s?.sk.type !== 'ground') return run
    const y = s.level!, far = this.reach
    if (b.at === 'fromLeft') return { ...run, b: { x: Math.max(run.b.x, far), y } }
    if (b.at === 'fromRight') return { ...run, a: { x: Math.min(run.a.x, -far), y } }
    if (b.at === 'leftOf' || b.at === 'rightOf' || b.at === 'connector') return { ...run, a: { x: -far, y }, b: { x: far, y } }
    return run
  }

  /** A point of a body in its own coordinates. */
  private localPoint(b: BodyP, feature: string): V {
    if (!feature || feature === 'center') return { x: 0, y: 0 }
    if (b.round) return feature === 'top' ? { x: 0, y: b.r } : feature === 'bottom' ? { x: 0, y: -b.r } : feature === 'left' ? { x: -b.r, y: 0 } : { x: b.r, y: 0 }
    if (b.shape.type === 'polygon') {
      const xs = b.shape.points.map(q => q.x), ys = b.shape.points.map(q => q.y)
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
      return feature === 'top' ? { x: 0, y: y1 } : feature === 'bottom' ? { x: b.foot.x, y: y0 } : feature === 'left' ? { x: x0, y: 0 } : { x: x1, y: 0 }
    }
    return feature === 'top' ? { x: 0, y: b.h / 2 } : feature === 'bottom' ? { x: 0, y: -b.h / 2 } : feature === 'left' ? { x: -b.w / 2, y: 0 } : { x: b.w / 2, y: 0 }
  }

  /**
   * The world position of a named point of something already placed. `across`: the point at the other end of a
   * connector — a bare surface then means "straight across from there" (the foot of the perpendicular).
   */
  private pointOf(p: PointName, across: V | undefined): V {
    const b = this.bodies.get(p.owner)
    if (b) { if (!b.position) throw new PlaceError('L2.cycle', `${p.owner} placed first`, 'not placed yet', ''); return add(b.position, rot(this.localPoint(b, p.feature), b.angle)) }
    const q = this.pulleys.get(p.owner)
    if (q) return q.centre!
    const s = this.surfaces.get(p.owner)!
    const t = s.sk.type
    if (p.coord) {
      const d = p.coord.value * lengthUnit(p.coord.unit)!
      if (p.coord.axis === 'x') return { x: t === 'table' || t === 'steps' ? s.x0! + d : d, y: s.level! }
      if (s.face) return { x: s.face.x, y: s.face.y0 + d }
      const r = s.run as LineRun
      const rise = Math.abs(r.a.y - r.b.y)
      if (d > rise + 1e-9) throw new PlaceError('L2.offSupport', `a height up to ${num(rise)} m on ${p.owner}`, `${num(d)} m`, '')
      return add(r.b, mul(sub(r.a, r.b), d / rise))
    }
    if (p.feature) return s.pts[p.feature]
    if (t === 'wall') return { x: s.face!.x, y: across ? Math.min(s.face!.y1, Math.max(s.face!.y0, across.y)) : (s.face!.y0 + s.face!.y1) / 2 }
    if (t === 'arc') return s.pts.bottom
    if (t === 'incline') {
      const r = s.run as LineRun
      if (!across) return runPoint(r, runLength(r) / 2)
      return runPoint(r, Math.min(runLength(r), Math.max(0, dot(sub(across, r.a), runDir(r)))))
    }
    // level surfaces: straight above or below the other end; else the middle of the free stretch (the origin of a ceiling)
    const r = s.run as LineRun | null
    const mid = r ? (r.a.x + r.b.x) / 2 : 0
    return { x: across ? Math.min(s.x1!, Math.max(s.x0!, across.x)) : mid, y: s.level! }
  }

  private placeBody(b: BodySketch) {
    const p = this.bodies.get(b.id)!
    const v = this.v, path = `bodies[${p.index}]`
    const ref = this.ids.get(b.ref)
    if (b.place === 'air') {
      const y = v.get(b.id, 'y'), x = v.get(b.id, 'x') ?? 0, h = b.ref2 ? v.get(b.id, 'heightAbove') : undefined
      if (h !== undefined && y !== undefined) this.diag('L2.overconstrained', `values[${v.rowOf(b.id, 'y')}]`, 'either a heightAbove value or a y coordinate', 'both', 'set one of the two rows to null', [`values[${v.rowOf(b.id, 'heightAbove')}]`])
      p.position = h !== undefined ? { x, y: this.surfaces.get(b.ref2)!.level! + h - p.foot.y } : { x, y: y! }
      this.out.free.push({ body: b.id, why: 'air', path })
      return
    }
    if (b.place === 'inside' || b.place === 'outside') {
      const arc = this.surfaces.get(b.ref)!
      const run = arc.run as ArcRun
      if (arc.sunk && b.at === 'bottom' && b.place === 'inside') {
        // the lower end of the track is let into the surface it joins: a body "at its bottom" stands on that surface
        const floor = this.runOf(arc.sunk.on) as LineRun
        const pl = onLine(floor, (arc.sunk.x - floor.a.x) / runDir(floor).x, p.foot, p.round)
        p.position = pl.position; p.angle = pl.angle; p.on = floor
        this.out.supports.push({ body: b.id, on: arc.sunk.on, or: b.ref, path })
        return
      }
      if (run.side !== b.place) throw new PlaceError('L1.place', run.side === 'outside' ? 'outside (a hump carries bodies on its outer side)' : 'inside (this track carries bodies on its inner side; a hump has span "hump")', b.place, '')
      const theta = arcAngle(b.at, v.get(b.id, 'angle'))
      if (!inSpan(theta, run.start, run.sweep)) throw new PlaceError('L2.offSupport', `a place on the track (it spans ${num(run.start / DEG)}° to ${num((run.start + run.sweep) / DEG)}°, 0° right, 90° up)`, `${b.at}${v.has(b.id, 'angle') ? ` by ${num(v.get(b.id, 'angle')! / DEG)}°` : ''} = ${num(((theta / DEG) % 360 + 360) % 360)}°`, 'check the span of the arc and the place of the body')
      const u = polar(theta)
      if (p.round) p.position = add(run.c, mul(u, run.side === 'inside' ? run.r - p.r : run.r + p.r))
      else if (run.side === 'outside') { p.position = add(run.c, mul(u, run.r - p.foot.y)); p.angle = theta - 90 * DEG }
      else throw new PlaceError('L1.place', 'a ball, point, disc or ring inside an arc track', `a ${b.type}`, 'flat bodies cannot lie in a curve')
      p.on = run
      this.out.supports.push({ body: b.id, on: b.ref, path })
      return
    }
    if (b.place === 'hanging' || (b.place === 'on' && ref?.list === 'connectors')) { this.placeByConnector(b, p, this.sk.connectors[ref!.index], ref!.index); return }
    // on a surface or a body
    const run = this.standRun(b)
    if (!run || run.kind !== 'line') throw new PlaceError('L1.place', 'a support with a face to stand on', b.ref, '')
    const L = runLength(run)
    // (the ground is wider than the stretch its named places refer to)
    if (2 * p.half > L + 1e-9 && b.at !== 'connector' && this.surfaces.get(b.ref)?.sk.type !== 'ground') throw new PlaceError('L2.offSupport', `a body that fits on ${b.ref} (${num(L)} m)`, `${b.id} is ${num(2 * p.half)} m long`, 'check the sizes')
    let s: number
    if (b.at === 'leftOf' || b.at === 'rightOf') {
      // touching the wall's face or the other body's side: the same support, side by side
      const sg = b.at === 'rightOf' ? 1 : -1
      const dx = runDir(run).x
      if (Math.abs(dx) < 1e-9) throw new PlaceError('L1.place', 'a support that is not vertical', b.ref, '')
      const wall = this.surfaces.get(b.ref2), nb = this.bodies.get(b.ref2)
      let edgeX: number
      if (wall?.face) { if (wall.face.out !== sg) throw new PlaceError('L1.place', `${wall.face.out > 0 ? 'rightOf' : 'leftOf'} (the free side of ${b.ref2})`, b.at, ''); edgeX = wall.face.x }
      else { if (!nb?.position) throw new PlaceError('L2.cycle', `${b.ref2} placed first`, 'not placed yet', ''); edgeX = nb.position.x + sg * nb.half * Math.abs(cos(nb.angle)) }
      const cxWorld = edgeX + sg * p.half * Math.abs(dx)
      s = (cxWorld - run.a.x) / dx
      this.out.supports.push({ body: b.id, on: b.ref2, path, beside: true })
    } else if (b.at === 'connector') s = this.alongByConnector(b, p, run)
    else s = placeAlong(run, b.at, p.half, b.at === 'atHeight' ? v.get(b.id, 'heightAbove') : b.at.startsWith('from') ? v.get(b.id, 'distance') : undefined)
    if (s < -1e-9 || s > L + 1e-9) throw new PlaceError('L2.offSupport', `a place on ${b.ref} (0 … ${num(L)} m along it)`, `${num(s)} m`, 'check the lengths that fix where it stands')
    const pl = onLine(run, s, p.foot, p.round)
    p.position = pl.position; p.angle = pl.angle; p.on = run
    this.out.supports.push({ body: b.id, on: b.ref, path })
  }

  /** The length of a connector as it is at the start: a spring's natural length less its compression, a rope's or rod's length. */
  private lengthOf(c: ConnectorSketch, body: BodyP | null, at: string): number {
    const v = this.v
    if (c.type === 'hinge') return 0
    if (c.type === 'spring') {
      const L0 = v.get(c.id, 'naturalLength') ?? (this.assume('size', this.name(c.id), 'naturalLength', '0.5'), 0.5)
      if (at === 'equilibrium' && body) {
        // where the spring carries the weight: x₀ = mg/k (the vertical-spring template places its body the same way)
        const x0 = (body.mass * this.g) / v.get(c.id, 'stiffness')!
        return body.sk.place === 'hanging' ? L0 + x0 : L0 - x0
      }
      const d = L0 - (v.get(c.id, 'compression') ?? 0) + (v.get(c.id, 'extension') ?? 0)
      if (!(d > 0)) throw new PlaceError('L1.range', `a compression smaller than the natural length (${num(L0)} m)`, `${num(v.get(c.id, 'compression') ?? 0)} m`, '')
      return d
    }
    return v.get(c.id, 'length') ?? (this.assume('size', this.name(c.id), 'length', '1'), 1)
  }

  /** Where along its support a body stands when a spring, rod or rope of known length holds it. */
  private alongByConnector(b: BodySketch, p: BodyP, run: LineRun): number {
    const pc = this.positioner(b)!
    const mine = parsePoint(pc.c.path[pc.mine])!, otherName = parsePoint(pc.c.path[1 - pc.mine])!
    const dir = runDir(run)
    // the body's anchor at s = 0, then it moves along the run with s
    const at0 = onLine(run, 0, p.foot, p.round)
    const a0 = add(at0.position, rot(this.localPoint(p, mine.feature), at0.angle))
    if (otherName.owner === 'fixed') throw new PlaceError('L1.place', 'a place of its own for a body held from a free fixed point', 'at "connector" with the other end "fixed"', 'give the body a place (left / middle / right or a distance), or attach the connector to a wall')
    const X = this.pointOf(otherName, a0)
    const ell = this.lengthOf(pc.c, p, b.at)
    const t = dot(sub(X, a0), dir), off = len(sub(sub(X, a0), mul(dir, t)))
    if (off > ell + 1e-9) throw new PlaceError('L2.overconstrained', `a connector long enough to reach (${num(off)} m at least)`, `${num(ell)} m`, 'check its length and where its other end is')
    // which side of the other end the body is on: the side its own anchor faces away from
    const os = this.surfaces.get(otherName.owner)
    const sideX = mine.feature === 'left' ? 1 : mine.feature === 'right' ? -1 : otherName.feature === 'right' ? 1 : otherName.feature === 'left' ? -1 : os?.face ? os.face.out : 1
    const along = Math.sqrt(Math.max(0, ell * ell - off * off))
    return t + (dir.x >= 0 ? sideX : -sideX) * along
  }

  /** A body that hangs from a rope, spring, rod or hinge, or stands on a vertical spring. */
  private placeByConnector(b: BodySketch, p: BodyP, c: ConnectorSketch, cIndex: number) {
    const v = this.v, path = `bodies[${p.index}]`
    const mineK = this.endOf(c, b.id)
    if (mineK === null) {
      // the example of the handoff: the rope does not reach the body
      throw new PlaceError('L2.floating', 'supported, connected or declared in the air', `no support; ${c.id} does not reach ${b.id} (its path is ${c.path.join(', ')})`, `check connectors[${cIndex}].path: one of its ends must be a point of ${b.id}, e.g. ${b.id}.top`, [`connectors[${cIndex}].path`])
    }
    const mine = parsePoint(c.path[mineK])!
    const local = this.localPoint(p, mine.feature)
    const nbK = mineK === 0 ? 1 : c.path.length - 2
    const nb = parsePoint(c.path[nbK])!
    const standing = b.place === 'on'
    const pulley = this.pulleys.get(nb.owner)
    let anchorAt: V, dir: V = { x: 0, y: standing ? 1 : -1 }
    if (pulley) {
      // under the wheel, on the side the rope leaves it
      const side = pulley.hang[`${c.id}:${mineK}`] ?? (mineK === 0 ? -1 : 1)
      const x = pulley.centre!.x + side * pulley.r
      const h = b.ref2 ? v.get(b.id, 'heightAbove') : undefined
      let cy: number
      if (h !== undefined) cy = this.surfaces.get(b.ref2)!.level! + h - p.foot.y
      else { const drop = Math.max(0.3, Math.min(0.6, (pulley.centre!.y - this.baseY) / 2)); cy = pulley.centre!.y - drop - p.h / 2; if (!v.has(c.id, 'length')) this.assume('drop', this.name(b.id), num(drop)) }
      p.position = { x: x - local.x, y: cy }
      if (cy + local.y > pulley.centre!.y - 1e-6) throw new PlaceError('L2.offSupport', `${b.id} below the pulley ${nb.owner} (at ${num(pulley.centre!.y)} m)`, `its ${mine.feature || 'centre'} at ${num(cy + local.y)} m`, 'check the height it hangs at')
      this.out.free.push({ body: b.id, why: 'hanging', path })
      return
    }
    // from a point: a fixed one, a surface's, or another body's
    const ell = this.lengthOf(c, p, b.at)
    const phi = b.at === 'left' || b.at === 'right' ? (v.get(b.id, 'angle') ?? 90 * DEG) : 0
    if (!standing && phi !== 0) dir = { x: (b.at === 'left' ? -1 : 1) * sin(phi), y: -cos(phi) }
    let X: V
    if (nb.owner === 'fixed') {
      const h = !standing && b.ref2 ? v.get(b.id, 'heightAbove') : undefined
      // a free point: over the middle, high enough for what hangs from it (or where the given height puts it)
      const y = h !== undefined ? this.surfaces.get(b.ref2)!.level! + h - p.foot.y + local.y - ell * dir.y : standing ? this.baseY : this.baseY + Math.max(2, ell + p.h + 0.5)
      X = { x: v.get(b.id, 'x') ?? 0, y }
      this.fixed.set(`${c.id}:${nbK}`, X)
    } else X = this.pointOf(nb, undefined)
    anchorAt = add(X, mul(dir, ell))
    // turned so that the body lies beyond its anchor along the connector (a rod hinged at its end points away from the hinge)
    const inward = mul(local, -1)
    const turn = len(inward) > 1e-12 && !p.round ? Math.atan2(dir.y, dir.x) - Math.atan2(inward.y, inward.x) : 0
    p.angle = standing ? 0 : turn
    p.position = sub(anchorAt, rot(local, p.angle))
    this.out.free.push({ body: b.id, why: 'hanging', path })
  }

  private placePulley(p: PulleySketch) {
    const index = this.sk.pulleys.indexOf(p)
    const r = this.v.get(p.id, 'radius') ?? 0.05
    const q: PulleyP = { sk: p, index, r, centre: null, hang: {} }
    const ro = this.ropeOver(p)!
    const { c, k } = ro
    const n = c.path.length
    // the neighbours along the rope: placed points, and bodies that will hang from this wheel
    const nbs = [k - 1, k + 1].map(i => {
      const pn = parsePoint(c.path[i])!
      const body = this.bodies.get(pn.owner)
      const hangs = !!body && this.positionedBy(pn.owner, c)
      const pos = hangs || pn.owner === 'fixed' || this.pulleys.has(pn.owner) || this.ids.get(pn.owner)?.list === 'pulleys' ? null : this.pointOf(pn, undefined)
      return { i, pn, body, hangs, pos, end: i === 0 || i === n - 1 }
    })
    const hanger = nbs.find(x => x.hangs), runner = nbs.find(x => x.pos)
    const mount = p.at ? parsePoint(p.at)! : null
    const ms = mount ? this.surfaces.get(mount.owner) : undefined
    if (mount && ms && (mount.feature === 'leftEnd' || mount.feature === 'rightEnd' || mount.feature === 'top' || mount.feature === 'bottom') && ms.run?.kind === 'line') {
      // at the end of a surface: tangent to the rope that runs along it, standing out beyond the end
      const run = ms.run
      const corner = ms.pts[mount.feature]
      const atA = len(sub(corner, run.a)) <= len(sub(corner, run.b))
      const u = mul(runDir(run), atA ? -1 : 1)
      const h = runner?.pos ? Math.max(r, dot(sub(runner.pos, corner), run.n)) : r
      const place = pulleyAtEnd(corner, u, run.n, h, r, hanger?.body ? hanger.body.w / 2 : 0)
      q.centre = place.centre
      for (const x of nbs) if (x.hangs && x.end) q.hang[`${c.id}:${x.i}`] = place.hangSide
    } else {
      if (mount && ms?.sk.type === 'wall') { const at = this.pointOf(mount, runner?.pos ?? undefined); q.centre = { x: at.x + ms.face!.out * (r + 0.05), y: at.y } }
      else if (mount && ms) { const at = this.pointOf(mount, runner?.pos ?? undefined); q.centre = ms.sk.type === 'ceiling' ? { x: at.x, y: at.y - r - 0.25 } : { x: at.x, y: at.y + r } }
      else q.centre = { x: 0, y: this.baseY + 2 }
      // two bodies hang: the first of the path on the left, the last on the right; one: on the side away from the rest of the rope
      const hangers = nbs.filter(x => x.hangs && x.end)
      if (hangers.length === 2) { q.hang[`${c.id}:${hangers[0].i}`] = -1; q.hang[`${c.id}:${hangers[1].i}`] = 1 }
      else if (hangers.length === 1) q.hang[`${c.id}:${hangers[0].i}`] = runner?.pos && runner.pos.x > q.centre.x ? -1 : 1
    }
    this.pulleys.set(p.id, q)
  }

  private emitBody(p: BodyP) {
    const b = p.sk, v = this.v
    let velocity = { x: 0, y: 0 }
    if (b.moves !== 'rest') {
      const speed = v.get(b.id, 'speed')!
      let d: V
      if (b.moves === 'angle') d = polar(v.get(b.id, 'launchAngle')!)
      else if (b.moves === 'upSlope' || b.moves === 'downSlope') {
        const run = p.on
        if (!run || run.kind !== 'line' || isLevel(run)) { this.diag('L1.place', `bodies[${p.index}].moves`, 'right or left for a body that is not on a slope', b.moves, ''); return }
        const down = run.a.y > run.b.y ? runDir(run) : mul(runDir(run), -1)
        d = b.moves === 'downSlope' ? down : mul(down, -1)
      } else {
        d = b.moves === 'right' ? { x: 1, y: 0 } : b.moves === 'left' ? { x: -1, y: 0 } : b.moves === 'up' ? { x: 0, y: 1 } : { x: 0, y: -1 }
        // on a track or slope the velocity is along it, in the sense asked for
        const run = p.on
        const t = run?.kind === 'arc' ? (() => { const u = unit(sub(p.position!, run.c)); return { x: -u.y, y: u.x } })() : run?.kind === 'line' && (b.moves === 'right' || b.moves === 'left') ? runDir(run) : null
        if (t) { const k = dot(t, d); if (Math.abs(k) < 1e-6) { this.diag('L1.place', `bodies[${p.index}].moves`, 'a direction along the track at that place', b.moves, 'at the side of a track it can only move up or down'); return } d = mul(t, k > 0 ? 1 : -1) }
      }
      velocity = mul(d, speed)
    }
    p.def = addBody(this.scene, { id: b.id, name: this.name(b.id), kind: p.kind, role: p.role, shape: p.shape, position: p.position!, angle: p.angle, velocity, mass: p.mass, inertia: p.inertia, fixedRotation: p.fixedRotation, material: this.material(b.id) })
  }

  // ---- connectors ----

  private connect() {
    const sc = this.scene
    this.sk.connectors.forEach((c, index) => {
      const path = `connectors[${index}]`
      const n = c.path.length
      const names = c.path.map(t => parsePoint(t)!)
      // the end points: bodies are placed, bare surfaces are straight across from the other end, free points are worked out last
      const ends: Array<{ p: V | null; anchor: Anchor | null; body: BodyP | null }> = [0, n - 1].map(k => {
        const pn = names[k]
        const body = this.bodies.get(pn.owner) ?? null
        if (body) { const local = this.localPoint(body, pn.feature); return { p: add(body.position!, rot(local, body.angle)), anchor: anchor(body.def, local), body } }
        // a free fixed point a body was hung from is where that put it
        const at = this.fixed.get(`${c.id}:${k}`)
        return { p: at ?? null, anchor: at ? anchor(null, at) : null, body: null }
      })
      const resolve = (e: number) => {
        if (ends[e].p) return
        const k = e === 0 ? 0 : n - 1, pn = names[k]
        const nbK = e === 0 ? 1 : n - 2
        const towards = this.pulleys.get(names[nbK].owner)?.centre ?? ends[1 - e].p ?? undefined
        let p: V
        if (pn.owner === 'fixed') {
          // a free point next to a body that has its place: the connector's length away, on the side the body's anchor faces
          const o = ends[1 - e]
          if (!o.p || !o.body) { this.diag('L1.reference', `${path}.path[${k}]`, 'a fixed point with a body at the other end', 'fixed', ''); return }
          const ell = c.type === 'hinge' ? 0 : this.lengthOf(c, o.body, '')
          const f = names[e === 0 ? n - 1 : 0].feature
          const away = f === 'left' ? { x: -1, y: 0 } : f === 'right' ? { x: 1, y: 0 } : f === 'bottom' ? { x: 0, y: -1 } : { x: 0, y: 1 }
          p = add(o.p, mul(rot(away, f === 'left' || f === 'right' ? o.body.angle : 0), ell))
        } else p = this.pointOf(pn, towards)
        ends[e] = { p, anchor: anchor(null, p), body: null }
      }
      if (n === 1) { if (!ends[0].body) { this.diag('L1.reference', `${path}.path[0]`, 'a point of a body', c.path[0], ''); return } } else { resolve(0); resolve(1) }
      if (ends.slice(0, n === 1 ? 1 : 2).some(e => !e.p || !e.anchor)) { if (!this.out.diagnostics.length) this.diag('L2.overconstrained', path, 'both ends of the connector at a place', 'an end could not be placed', ''); return }
      const [A, B] = ends
      if (c.type === 'rope') {
        const mids = names.slice(1, -1).map(pn => this.pulleys.get(pn.owner)!)
        const wraps = wrapsOf([A.p!, ...mids.map(m => m.centre!), B.p!])
        const slack = c.mode === 'slack'
        const maxT = this.v.get(c.id, 'maxTension')
        const given = this.v.get(c.id, 'length')
        addConnector<RopeDef>(sc, { id: c.id, name: this.name(c.id), type: 'rope', a: A.anchor!, b: B.anchor!, pulleys: mids.map((m, i) => ({ pulley: m.sk.id, wrap: wraps[i] })), length: slack ? given! : null, ...(maxT !== undefined ? { maxTension: maxT } : {}) })
        // how each end should meet its pulley: plumb when its body hangs, along the surface when its body moves on one
        const align: RopeAlign[] = []
        if (mids.length) for (const e of [0, 1] as const) {
          const body = ends[e].body
          if (!body) continue
          if (body.sk.place === 'hanging') align.push({ end: e, kind: 'vertical' })
          else if (body.on?.kind === 'line') align.push({ end: e, kind: 'along', dir: runDir(body.on) })
        }
        this.out.ropes.push({ id: c.id, index, slack, ends: ends.map(e => e.body?.sk.id ?? null), align })
        return
      }
      if (c.type === 'spring') {
        const k = this.v.get(c.id, 'stiffness')!
        const L0g = this.v.get(c.id, 'naturalLength')
        const comp = this.v.get(c.id, 'compression'), ext = this.v.get(c.id, 'extension')
        const dist = len(sub(B.p!, A.p!))
        // natural length: given; else from the deformation the problem gives; else the spring starts relaxed
        const positioned = [A.body, B.body].some(b => b && this.positionedBy(b.sk.id, c))
        let rest: number
        if (L0g !== undefined) rest = L0g
        else if (positioned) rest = 0.5
        else { rest = dist + (comp ?? 0) - (ext ?? 0); this.assume(comp === undefined && ext === undefined ? 'springRelaxed' : 'springLength', this.name(c.id), num(rest)) }
        // not fastened: the loose end is the body's (end b of the engine's spring)
        const loose = c.mode === 'notFastened'
        const swap = loose && !B.body && !!A.body
        addConnector<SpringDef>(sc, { id: c.id, name: this.name(c.id), type: 'spring', a: (swap ? B : A).anchor!, b: (swap ? A : B).anchor!, stiffness: k, restLength: rest, damping: 0, ...(loose ? { pushOnly: true } : {}) })
        const equilibrium = [A.body, B.body].some(b => b && b.sk.at === 'equilibrium' && this.positionedBy(b.sk.id, c))
        // what the engine should read at the start: the given deformation; a spring the problem does not deform is relaxed
        this.out.springs.push({ id: c.id, index, extension: equilibrium ? null : comp !== undefined ? -comp : ext ?? 0 })
        return
      }
      if (c.type === 'rod') {
        const given = this.v.get(c.id, 'length')
        const dist = len(sub(B.p!, A.p!))
        if (given !== undefined && Math.abs(given - dist) > 1e-6 * Math.max(1, given)) this.diag('L2.overconstrained', `values[${this.v.rowOf(c.id, 'length')}]`, `the distance of its two ends as placed (${num(dist)} m)`, `${num(given)} m`, 'let the rod place one of its bodies (place hanging, or at "connector"), or leave its length out', [`values[${this.v.rowOf(c.id, 'length')}]`, ...[A.body, B.body].filter(Boolean).map(b => `bodies[${b!.index}]`)])
        addConnector<RodDef>(sc, { id: c.id, name: this.name(c.id), type: 'rod', a: A.anchor!, b: B.anchor!, length: null })
        return
      }
      if (c.type === 'hinge') {
        // a pin: the two points coincide — the body's point where it was placed
        const body = A.body ? A : B, world = A.body ? B : A
        if (!world.body && len(sub(world.p!, body.p!)) > 1e-6) { this.diag('L2.overconstrained', path, `the two points of a hinge in one place (${c.path[0]} is at ${fmtV(A.p!)})`, `${c.path[1]} is at ${fmtV(B.p!)}`, 'let the hinge place the body (place hanging, ref this hinge), or use "fixed" for its other point', [path, ...[A.body, B.body].filter(Boolean).map(b => `bodies[${b!.index}]`)]); return }
        addConnector<HingeDef>(sc, { id: c.id, name: this.name(c.id), type: 'hinge', a: body.anchor!, b: world.body ? world.anchor! : anchor(null, body.p!) })
        return
      }
      // a force
      const F = this.v.get(c.id, 'magnitude')!
      const body = A.body!
      let d: V
      if (c.mode === 'angle') d = polar(this.v.get(c.id, 'angle')!)
      else if (c.mode === 'upSlope' || c.mode === 'downSlope') {
        const run = body.on
        if (!run || run.kind !== 'line' || isLevel(run)) { this.diag('L1.place', `${path}.mode`, 'right, left, up, down or angle for a force on a body that is not on a slope', c.mode, ''); return }
        const down = run.a.y > run.b.y ? runDir(run) : mul(runDir(run), -1)
        d = c.mode === 'downSlope' ? down : mul(down, -1)
      } else d = c.mode === 'right' ? { x: 1, y: 0 } : c.mode === 'left' ? { x: -1, y: 0 } : c.mode === 'up' ? { x: 0, y: 1 } : { x: 0, y: -1 }
      addConnector<ForceDef>(sc, { id: c.id, name: this.name(c.id), type: 'force', a: A.anchor!, force: mul(d, F), expr: null })
    })
  }

  /**
   * Friction and restitution: a value for a pair is that pair's; a value of one object alone holds for all its
   * contacts. Written as the scene's pair materials, since the engine would otherwise take the smaller of two bodies'
   * values — and a body the problem says nothing about would make every contact smooth.
   */
  private materials() {
    const v = this.v, sc = this.scene
    const own = (id: string) => { const mu = v.get(id, 'mu'); return { muS: v.get(id, 'muS') ?? mu, muK: v.get(id, 'muK') ?? mu, e: v.get(id, 'restitution') } }
    const world = own('world')
    const done = new Set<string>()
    const touching = new Set(this.out.supports.map(s => canonicalOf(`${s.body}|${s.on}`)))
    const movable = this.sk.bodies.map(b => b.id), everything = [...this.sk.surfaces.map(s => s.id), ...movable]
    for (const a of movable) for (const b of everything) {
      if (a === b) continue
      const key = canonicalOf(`${a}|${b}`)
      if (done.has(key)) continue
      done.add(key)
      const pair = own(key), A = own(a), B = own(b)
      const pick = (k: 'muS' | 'muK' | 'e'): number | undefined => pair[k] ?? (A[k] !== undefined && B[k] !== undefined ? Math.min(A[k]!, B[k]!) : A[k] ?? B[k] ?? world[k])
      const muS = pick('muS'), muK = pick('muK'), e = pick('e')
      if (muS === undefined && muK === undefined && e === undefined) {
        // the problem says nothing about a contact the sketch declares: smooth, and said so
        if (touching.has(key) && this.surfaces.get(b)?.sk.type !== 'wall') this.assume('smooth', this.name(a), this.name(b))
        continue
      }
      sc.contactPairs.push({ a, b, muS: muS ?? muK ?? 0, muK: muK ?? muS ?? 0, restitution: e ?? 0 })
    }
  }

  /**
   * A taut rope of given length over pulleys: the body that hangs at a height the problem did not give is moved along
   * the plumb line until the rope, measured by the engine, has that length. Without such a body the length must agree.
   */
  private fitRopeLengths() {
    const todo = this.out.ropes.filter(r => !r.slack && this.v.has(r.id, 'length'))
    if (!todo.length) return
    const measure = (): number[] | null => {
      let s: EngineSession | null = null
      try { s = EngineSession.create(this.scene); return frameView(s, 0).ropes.map(r => r.length) } catch { return null } finally { s?.free() }
    }
    const ropeIds = this.scene.connectors.filter(c => c.type === 'rope').map(c => c.id)
    for (const r of todo) {
      const given = this.v.get(r.id, 'length')!
      const c = this.sk.connectors[r.index]
      const k = ropeIds.indexOf(r.id)
      let lengths = measure()
      if (!lengths) return
      const off = given - lengths[k]
      if (Math.abs(off) <= 1e-9 * Math.max(1, given)) continue
      // the end that can give: a body hanging under a pulley at a height nobody fixed, else a body hanging from a point
      const loose = r.ends.map((id, e) => ({ id, e })).find(x => { const b = x.id ? this.bodies.get(x.id) : null; return !!b && b.sk.place === 'hanging' && b.sk.ref === r.id && !(b.sk.ref2 && this.v.has(b.sk.id, 'heightAbove')) && c.path.length > 2 })
      const body = loose?.id ? this.bodies.get(loose.id) : null
      if (body?.def) {
        body.def.position = { x: body.def.position.x, y: body.def.position.y - off }
        body.position = { ...body.def.position }
        lengths = measure()
        if (lengths && Math.abs(given - lengths[k]) <= 1e-9 * Math.max(1, given)) continue
      }
      if (c.path.length === 2 && r.ends.some(id => id && this.positionedBy(id, c))) continue
      this.diag('L2.overconstrained', `values[${this.v.rowOf(r.id, 'length')}]`, `the length of the rope as placed (${num(lengths ? lengths[k] : NaN)} m)`, `${num(given)} m`, 'a taut rope has the length of its path: leave the length out, or leave out the height of the body that hangs from it', [`values[${this.v.rowOf(r.id, 'length')}]`, `connectors[${r.index}].mode`])
    }
  }

  private finish() {
    const sc = this.scene, s = this.sk
    // long enough for every asked time; runs go on past it while anything moves
    const d = Math.min(600, Math.max(3, this.horizon + 0.5))
    sc.settings.duration = d
    sc.settings.legacyDuration = d
    const asked = s.questions.map(q => q.id).filter(Boolean)
    sc.watch = [...new Set([...asked, ...s.bodies.slice(0, 3).map(b => `${b.id}.v`)])].slice(0, 8)
    sc.view = fitSceneView(sc)
    // values the model stated without words of the problem are assumptions too
    for (const r of this.v.rows) if (r.used && !r.quote.trim()) this.assume('stated', r.of === 'world' ? 'g' : r.of.includes('|') ? r.of.split('|').map(x => this.name(x.trim())).join(' – ') : this.name(r.of), r.quantity, `${num(r.value)}${r.unit && r.unit !== '1' ? ` ${r.unit}` : ''}`)
  }
}

function signedArea(pts: V[]): number { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y } return a / 2 }
const fmtV = (p: V) => `(${num(p.x)}, ${num(p.y)}) m`
/** Metres per unit of a length written in a point name; null when it is not a length unit. */
function lengthUnit(u: string): number | null { return ({ m: 1, cm: 0.01, mm: 0.001, km: 1000, '': 1 } as Record<string, number>)[u.trim()] ?? null }

