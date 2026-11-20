/**
 * The validation ladder (26.64, D281). A sketch is checked level by level, and every finding is a structured
 * diagnostic `{ code, path, expected, got, hint }` the model can act on with a patch (patch.ts):
 *
 *   L0  structure     the answer is a sketch (schema.ts `readSketch`)
 *   L1  references    names exist, each value has the dimension of its field and a plausible size (values.ts), the
 *                     values a kind of object cannot do without are there
 *   L2  geometry      after compiling: nothing overlaps, nothing floats unexplained, anchors lie on their bodies, ropes
 *                     are taut or slack as declared, do not pass through bodies and meet their pulleys tangentially, a
 *                     spring's deformation is the given one — and "who rests on whom" is what the ENGINE's contact
 *                     detection says at t = 0 (session operation `contactForces` on the first frame of a trial run),
 *                     not geometry redone here
 *   L3  trial run     the solver does not fail; nothing unexpected happens at t = 0 (a rope going slack, a declared
 *                     contact opening, bodies knocking into each other); "at rest" and "just about to slide" hold
 *   L4  contract      every quote occurs in the problem text and holds its number, every value is used, every question
 *                     can be read, the number of movable bodies is the problem's
 *
 * L5, the comparison of an explanation's numbers with the engine's, stays where it was (copilot/verify.ts).
 * A scene that fails L2 or L3 is never loaded (`loadable`).
 */
import type { Scene } from '../../core/scene/types'
import { parseScene, serializeScene } from '../../core/scene/io'
import { EngineSession } from '../../engine/session'
import { listQuantities } from '../../engine/observe'
import { bodiesAtPoint, frameView } from '../../engine/views'
import { findOverlaps } from '../../engine/overlaps'
import { msgText } from '../../i18n/locale'
import type { Message } from '../../i18n/message'
import { checkTarget } from '../import/contract'
import type { CheckedQuestion } from '../import/contract'
import { normalizeUnit, qtyToSI, siUnitOf, toParamUnit } from '../import/units'
import { buildTemplate, templateById } from '../../templates'
import type { Diagnostic, SceneSketch } from './schema'
import { parsePoint, readSketch } from './schema'
import { Values } from './values'
import { compileSketch } from './compile'
import type { Assumption, Compiled } from './compile'
import { CJK_UNITS } from './prompt'

export type LevelName = 'L0' | 'L1' | 'L2' | 'L3' | 'L4'
export const LEVELS: LevelName[] = ['L0', 'L1', 'L2', 'L3', 'L4']

export interface Ladder {
  /** true: passed; false: it has findings; null: not reached. */
  levels: Record<LevelName, boolean | null>
  diagnostics: Diagnostic[]
  sketch: SceneSketch | null
  via: 'sketch' | 'template' | 'unsupported'
  /** The compiled scene (also when a later level has findings); null when it could not be compiled. */
  scene: Scene | null
  questions: CheckedQuestion[]
  assumptions: Assumption[]
  names: Record<string, string>
  placed: string[]
  unplaced: string[]
  /** L0–L3 passed: the scene may be loaded (L4 findings are then told to the user). */
  loadable: boolean
  ok: boolean
  /** JSON repairs made while reading the answer. */
  repairs: string[]
}

/** Length of the trial run (s): long enough to resolve the start, short enough to stay instant. */
export const PROBE_SECONDS = 0.25

const ok = (list: Diagnostic[], level: number) => !list.some(d => d.level === level)

function result(partial: Partial<Ladder> & { diagnostics: Diagnostic[] }, reached: number): Ladder {
  const levels = Object.fromEntries(LEVELS.map((l, i) => [l, i <= reached ? ok(partial.diagnostics, i) : null])) as Ladder['levels']
  // a level with findings below it is not "passed" just because nothing was found there
  const loadable = !!partial.scene && [0, 1, 2, 3].every(i => levels[LEVELS[i]] === true)
  return { sketch: null, via: 'sketch', scene: null, questions: [], assumptions: [], names: {}, placed: [], unplaced: [], repairs: [], ...partial, levels, loadable, ok: loadable && levels.L4 === true }
}

/** Run the whole ladder on a model's answer (text or object) for a problem text. */
export function runLadder(raw: unknown, problem: string): Ladder {
  const r = readSketch(raw)
  if (!r.sketch || r.diagnostics.length) return result({ diagnostics: r.diagnostics, sketch: r.sketch, repairs: r.repairs }, 0)
  const l = checkSketch(r.sketch, problem)
  return { ...l, repairs: r.repairs }
}

/** L1–L4 of a sketch that passed L0. */
export function checkSketch(sketch: SceneSketch, problem: string): Ladder {
  if (sketch.route === 'unsupported') return result({ diagnostics: [], sketch, via: 'unsupported' }, 0)
  if (sketch.route === 'template') return checkTemplate(sketch, problem)
  const values = new Values(sketch)
  const c = compileSketch(sketch, values)
  const text = contractText(sketch, problem)
  const base = { sketch, via: 'sketch' as const, assumptions: c.assumptions, names: c.names, placed: c.placed, unplaced: c.unplaced }
  // The words of the problem are checked whatever the geometry does: one round of repairs can then mend both
  if (!c.scene) return result({ ...base, diagnostics: [...c.diagnostics, ...text] }, c.diagnostics.some(d => d.level === 2) ? 2 : 1)
  const s = sceneChecks(c.scene, c, i => `bodies[${i}]`)
  const diagnostics = [...c.diagnostics, ...s.diagnostics]
  const reached = !ok(diagnostics, 2) ? 2 : !ok(diagnostics, 3) ? 3 : 4
  const q = reached === 4 ? questionChecks(sketch, c.scene, s.quantities) : { questions: [], diagnostics: [] }
  for (const u of values.unused()) text.push({ code: 'L4.givenUnused', level: 4, path: `values[${u.row}]`, expected: 'every value used by exactly one field of the sketch', got: `${u.of}.${u.quantity} is not used (${unusedWhy(sketch, u.of, u.quantity)})`, hint: 'change what makes it unused, or set the row to null if the problem does not need it', allow: unusedAllow(sketch, u.of) })
  if (sketch.movingBodies !== sketch.bodies.length) text.push({ code: 'L4.bodyCount', level: 4, path: 'movingBodies', expected: `as many bodies as the problem has movable bodies (movingBodies = ${sketch.movingBodies})`, got: `${sketch.bodies.length} bodies in the sketch`, hint: 'add the missing body, or correct the count', allow: ['movingBodies', 'bodies', 'values[+]', 'connectors'] })
  return result({ ...base, scene: c.scene, questions: q.questions, diagnostics: [...diagnostics, ...text, ...q.diagnostics] }, reached)
}

function unusedWhy(s: SceneSketch, of: string, quantity: string): string {
  const b = s.bodies.find(x => x.id === of)
  if (b && quantity === 'speed') return `its "moves" is ${b.moves}`
  if (b && quantity === 'distance') return `its "at" is ${b.at || '""'}, which takes no distance`
  if (b && quantity === 'heightAbove') return b.ref2 ? `its place "${b.place}" at "${b.at}" takes no height` : 'ref2 does not name the surface it is measured from'
  if (b && quantity === 'angle') return `its "at" is ${b.at || '""'}, which takes no angle`
  return 'nothing in the sketch reads it'
}
function unusedAllow(s: SceneSketch, of: string): string[] {
  const i = s.bodies.findIndex(x => x.id === of)
  return i >= 0 ? [`bodies[${i}]`] : []
}

// ---- L2 and L3: the compiled scene against the engine ----

interface EventInfo { t: number; triggers: string[]; changes: Array<{ type: string; bodies?: string[]; subject?: string }>; impact?: { loss: number; points: Array<{ vnBefore: number; impulse: number }> } | null }
interface Contact { inContact: boolean; N: number; f: number; status: string }

/**
 * Geometry (L2) and trial run (L3) of a scene. `declared`: what the sketch says about it (null for a template, whose
 * scene is checked for what holds for every scene). Returns the readable quantities for L4.
 */
export function sceneChecks(scene: Scene, declared: Compiled | null, bodyPath: (index: number) => string): { diagnostics: Diagnostic[]; quantities: Map<string, string> } {
  const out: Diagnostic[] = []
  const quantities = new Map<string, string>()
  const D = (code: string, path: string, expected: string, got: string, hint = '', allow?: string[]) => out.push({ code, level: Number(code[1]) as Diagnostic['level'], path, expected, got, hint, ...(allow ? { allow } : {}) })
  const sketchBodies = declared ? Object.fromEntries(scene.bodies.filter(b => b.kind !== 'static').map((b, i) => [b.id, i])) : {}
  const pathOf = (id: string) => (declared && id in sketchBodies ? bodyPath(sketchBodies[id]) : '')
  const mm = (v: number) => `${Number((v * 1000).toPrecision(3))} mm`

  // the scene is a valid file, and the engine compiles it
  try { parseScene(serializeScene(scene)) } catch (e) { D('L2.compile', '', 'a scene the app can save and read', (e as Error).message, ''); return { diagnostics: out, quantities } }
  let s: EngineSession | null = null
  try {
    s = EngineSession.create(scene)
    for (const q of listQuantities(s)) quantities.set(q.id, q.unit)
  } catch (e) { D('L2.compile', '', 'a scene the engine can compile', (e as Error).message, ''); return { diagnostics: out, quantities } } finally { s?.free() }

  // nothing overlaps at the start
  const ov = findOverlaps(scene)
  for (const p of ov?.pairs ?? []) {
    const moving = scene.bodies.find(b => b.id === p.b && b.kind !== 'static') ? p.b : p.a
    D('L2.overlap', pathOf(moving), 'bodies that touch at most', `${p.a} and ${p.b} overlap by ${mm(p.depth)}`, 'check their sizes and where they stand', [pathOf(p.a), pathOf(p.b), 'values'].filter(Boolean))
  }

  // anchors lie on their bodies
  scene.connectors.forEach(c => {
    for (const a of 'b' in c ? [c.a, c.b] : [c.a]) {
      const b = a.body ? scene.bodies.find(x => x.id === a.body) : null
      if (!b) continue
      const sh = b.shape
      const tol = 1e-6
      const inside = sh.type === 'circle' ? Math.hypot(a.local.x, a.local.y) <= sh.radius + tol
        : sh.type === 'box' ? Math.abs(a.local.x) <= sh.width / 2 + tol && Math.abs(a.local.y) <= sh.height / 2 + tol
          : sh.type === 'polygon' ? a.local.x >= Math.min(...sh.points.map(q => q.x)) - tol && a.local.x <= Math.max(...sh.points.map(q => q.x)) + tol && a.local.y >= Math.min(...sh.points.map(q => q.y)) - tol && a.local.y <= Math.max(...sh.points.map(q => q.y)) + tol
            : true
      if (!inside) D('L2.anchor', declared ? `connectors[${scene.connectors.indexOf(c)}].path` : '', `an anchor of ${c.id} on the body ${b.id}`, `(${a.local.x.toFixed(4)}, ${a.local.y.toFixed(4)}) m from its centre, outside its outline`, 'use a named point of the body')
    }
  })
  if (out.length) return { diagnostics: out, quantities }

  // the trial run: its first frame answers "who touches whom", its events and end say what happens at the start
  let probe: EngineSession | null = null
  try {
    try { probe = EngineSession.simulate(scene, { duration: PROBE_SECONDS }) } catch (e) { D('L3.solver', '', 'a scene the solver can start', (e as Error).message, ''); return { diagnostics: out, quantities } }
    const info = probe.call<{ warnings?: Message[]; error?: Message | string | null; frameCount: number }>({ op: 'info' })
    for (const w of info.warnings ?? []) if (w.key === 'warn.initialDeepOverlap') D('L2.overlap', '', 'bodies that touch at most', msgText(w), 'check their sizes and where they stand')
    const dynamic = scene.bodies.filter(b => b.kind !== 'static')
    const contact = (on: string, by: string): Contact => probe!.call<Contact>({ op: 'contactForces', frame: 0, on, by })
    const touching = new Map<string, string[]>()
    if (info.frameCount > 0 && dynamic.length <= 24) {
      for (const b of dynamic) touching.set(b.id, scene.bodies.filter(o => o.id !== b.id && contact(b.id, o.id).inContact).map(o => o.id))
    }
    if (declared && touching.size) {
      // who rests on whom: the sketch's word against the engine's contacts at t = 0
      for (const sup of declared.supports) {
        if (sup.beside || touching.get(sup.body)?.includes(sup.on) || (sup.or && touching.get(sup.body)?.includes(sup.or))) continue
        D('L2.contact', sup.path, `${sup.body} rests on ${sup.on} (a contact at t = 0)`, `the engine finds no contact between ${sup.body} and ${sup.on}${touching.get(sup.body)?.length ? `; ${sup.body} touches ${touching.get(sup.body)!.join(', ')}` : ''}`, 'check its place, and the sizes of the two')
      }
      for (const f of declared.free) {
        const t = touching.get(f.body) ?? []
        if (t.length) D('L2.contact', f.path, f.why === 'hanging' ? `${f.body} hangs free` : `${f.body} is in the air`, `it touches ${t.join(', ')} at t = 0`, f.why === 'hanging' ? 'check the height it hangs at' : 'if it rests on that, say so: place "on"')
      }
      // a body nothing holds: not in contact, not on a connector, not declared in the air
      const connected = new Set(scene.connectors.flatMap(c => ('b' in c ? [c.a.body, c.b.body] : [c.a.body])).filter(Boolean) as string[])
      const air = new Set(declared.free.filter(f => f.why === 'air').map(f => f.body))
      const heavy = scene.settings.gravity.x !== 0 || scene.settings.gravity.y !== 0
      for (const b of dynamic) {
        if (!heavy || air.has(b.id) || connected.has(b.id) || touching.get(b.id)?.length || out.some(d => d.path === pathOf(b.id))) continue
        D('L2.floating', pathOf(b.id), 'supported, connected or declared in the air', 'no support and no connector', 'place it on its support, hang it from its rope, or declare it in the air (place "air")')
      }
    }

    // ropes: taut or slack as declared, meeting their pulleys tangentially, through no body
    const fv = info.frameCount > 0 ? frameView(probe, 0) : null
    const ropes = scene.connectors.filter(c => c.type === 'rope')
    if (fv && fv.ropes.length === ropes.length) {
      ropes.forEach((rope, k) => {
        if (rope.type !== 'rope') return
        const view = fv.ropes[k]
        const dec = declared?.ropes.find(r => r.id === rope.id)
        const path = dec ? `connectors[${dec.index}]` : ''
        // a slack rope is longer than its path as placed (the engine's measure of the path)
        const short = dec?.slack && rope.length !== null && rope.length <= view.length + 1e-9
        if (dec && (short || view.taut === dec.slack)) D('L2.ropeState', `${path}.mode`, dec.slack ? 'a slack rope (longer than its path)' : 'a taut rope', dec.slack ? `its length ${(rope.length ?? view.length).toFixed(4)} m is not more than its path as placed (${view.length.toFixed(4)} m)` : 'it is slack at the start', dec.slack ? 'give it a length longer than its path, or say taut' : 'check the places and the motion of its ends', [`${path}.mode`, 'values', ...dec.ends.filter(Boolean).map(id => pathOf(id!))])
        const pts: Array<{ x: number; y: number }> = []
        for (let i = 0; i + 1 < view.points.length; i += 2) pts.push({ x: view.points[i], y: view.points[i + 1] })
        const ends = new Set([rope.a.body, rope.b.body].filter(Boolean) as string[])
        const extents = scene.bodies.filter(x => x.kind !== 'static').map(x => (x.shape.type === 'box' ? Math.min(x.shape.width, x.shape.height) : x.shape.type === 'circle' ? 2 * x.shape.radius : 0.1)).filter(x => x > 0)
        const step = Math.max(0.005, Math.min(0.05, ...extents) / 3)
        const dirOf = (a: { x: number; y: number }, b: { x: number; y: number }) => { const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l, l } }
        // each straight stretch: (A, in₁), (out₁, in₂) … (outₙ, B)
        for (let i = 0; i + 1 < pts.length; i += 2) {
          const a = pts[i], b = pts[i + 1], d = dirOf(a, b)
          if (d.l < 1e-9) continue
          const hit = new Set<string>()
          // sampled finer than the smallest body (the engine's own point-in-body test), away from the two ends
          const n = Math.max(5, Math.min(300, Math.ceil(d.l / step)))
          for (let k = 1; k < n; k++) {
            const f = k / n
            if (f * d.l < 1e-3 || (1 - f) * d.l < 1e-3) continue
            const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f, e = 1e-6
            // strictly inside: a rope lying along a surface is not through it
            const one = bodiesAtPoint(probe!, x - d.y * e, y + d.x * e), two = bodiesAtPoint(probe!, x + d.y * e, y - d.x * e)
            for (const id of one) if (two.includes(id) && !ends.has(id)) hit.add(id)
          }
          if (hit.size) D('L2.ropeThroughBody', dec ? `${path}.path` : '', 'a rope that passes through no body', `${rope.id} passes through ${[...hit].join(', ')}`, 'attach it at another point of its body, or check where the bodies stand', dec ? [`${path}.path`, ...[...ends].map(pathOf).filter(Boolean)] : undefined)
        }
        // at each wheel the rope leaves along the tangent
        for (let j = 0; 6 * j + 5 < view.arcs.length && 2 * j + 2 < pts.length; j++) {
          const c = { x: view.arcs[6 * j], y: view.arcs[6 * j + 1] }, r = view.arcs[6 * j + 2]
          for (const [t, from] of [[pts[2 * j + 1], pts[2 * j]], [pts[2 * j + 2], pts[2 * j + 3]]]) {
            if (!from) continue
            const d = dirOf(from, t)
            const radial = (t.x - c.x) * d.x + (t.y - c.y) * d.y
            if (Math.abs(Math.hypot(t.x - c.x, t.y - c.y) - r) > 1e-6 * Math.max(1, r) || Math.abs(radial) > 1e-6 * Math.max(r, 1e-3)) D('L2.tangent', dec ? `${path}.path` : '', `${rope.id} tangent to the pulley ${rope.pulleys[j]?.pulley ?? ''}`, 'it meets the wheel at an angle', '')
          }
        }
        // and its ends lead away as the bodies move: plumb for a hanging body, along the surface for one that slides
        for (const al of dec?.align ?? []) {
          const d = al.end === 0 ? dirOf(pts[0], pts[1]) : dirOf(pts[pts.length - 1], pts[pts.length - 2])
          const off = al.kind === 'vertical' ? Math.abs(d.x) : Math.abs(d.x * al.dir!.y - d.y * al.dir!.x)
          if (off > 1e-6) {
            const body = dec!.ends[al.end]!
            D('L2.tangent', `${path}.path`, al.kind === 'vertical' ? `the rope plumb above ${body}` : `the rope parallel to the surface ${body} moves on`, `it leaves ${body} at ${(Math.asin(Math.min(1, off)) * 180 / Math.PI).toFixed(2)}° to that`, al.kind === 'vertical' ? 'hang the body from this rope (place "hanging")' : 'mount the pulley at the end of the surface the body is on (e.g. table.rightEnd, incline.top)', [`${path}.path`, pathOf(body), 'pulleys'])
          }
        }
      })
    }

    // a spring's deformation at the start is the given one (the engine's reading of its extension)
    if (declared && info.frameCount > 0) {
      const want = declared.springs.filter(x => x.extension !== null)
      if (want.length) {
        const got = probe.call<{ values: Float64Array }>({ op: 'evaluate', frame: 0, ids: want.map(x => `${x.id}.x`) }).values
        want.forEach((x, i) => {
          const e = x.extension!
          if (Math.abs(got[i] - e) > 1e-6 * Math.max(1, Math.abs(e))) D('L2.springDeformation', `connectors[${x.index}]`, e === 0 ? `${x.id} at its natural length at the start` : `${x.id} ${e < 0 ? 'compressed' : 'stretched'} by ${Math.abs(e).toFixed(4)} m at the start`, got[i] === 0 ? 'it is at its natural length' : `it is ${got[i] < 0 ? 'compressed' : 'stretched'} by ${Math.abs(got[i]).toFixed(4)} m`, 'let the spring place its body (at "connector", or hanging from it), or check the natural length', [`connectors[${x.index}]`, 'values', ...declared.supports.map(sup => sup.path)])
        })
      }
    }
    if (out.length) return { diagnostics: out, quantities }

    // ---- L3 ----
    if (info.error) { D('L3.solver', '', 'a run without a solver error', msgText(info.error), ''); return { diagnostics: out, quantities } }
    const events = probe.call<{ events: EventInfo[] }>({ op: 'events' }).events
    const slackOk = new Set(declared?.ropes.filter(r => r.slack).map(r => r.id) ?? [])
    const supported = new Set(declared?.supports.filter(x => !x.beside).map(x => [x.body, x.on].sort().join('|')) ?? [])
    const seen = new Set<string>()
    for (const e of events) {
      if (e.t > 1e-6) break
      for (const ch of e.changes) {
        const who = (ch.bodies ?? []).join(' and ')
        const key = `${ch.type}:${who}`
        if (seen.has(key)) continue
        seen.add(key)
        if (ch.type === 'slack' && ![...slackOk].some(id => ch.subject === id)) D('L3.event', ropePath(declared, ch), 'the rope stays taut at the start', `it goes slack at t = 0 (${who || ch.subject || 'a rope'})`, 'check which way its bodies move and where they stand')
        // a real knock: something arrives with a speed (gliding from one tangent surface onto the next is not one)
        else if (ch.type === 'impact' && e.impact?.points.some(p => Math.abs(p.vnBefore) > 1e-6)) D('L3.event', pathOf((ch.bodies ?? []).find(id => id in sketchBodies) ?? ''), 'nothing collides at the start', `${who} knock into each other at t = 0`, 'they start too close or moving into each other: check their places and velocities')
        else if (ch.type === 'separate' && supported.has([...(ch.bodies ?? [])].sort().join('|'))) D('L3.event', pathOf((ch.bodies ?? []).find(id => id in sketchBodies) ?? ''), `${who} stay in contact at the start`, 'they separate at t = 0', 'check what holds the body on its support')
      }
    }
    // what the problem says about the start
    if (declared?.scene && info.frameCount > 0) {
      const sketch = declared
      const exp = expectOf(sketch)
      const speeds = exp.bodies.length ? exp.bodies.map(x => probe!.call<{ value: number }>({ op: 'extreme', id: `${x.of}.v`, which: 'max' }).value) : []
      exp.bodies.forEach((x, i) => {
        const vmax = speeds[i]
        const path = `expect[${x.index}]`
        const allow = [path, pathOf(x.of), 'values']
        if ((x.state === 'atRest' || x.state === 'aboutToSlide') && vmax > 1e-6) D('L3.notAtRest', path, `${x.of} stays at rest`, `it reaches ${vmax.toPrecision(3)} m/s within ${PROBE_SECONDS} s`, 'check the friction coefficient, the angle and the forces on it', allow)
        else if (x.state === 'moves' && !(vmax > 1e-6)) D('L3.notMoving', path, `${x.of} starts to move`, `it stays at rest for ${PROBE_SECONDS} s`, 'check the friction coefficient, the masses and the forces on it', allow)
        else if (x.state === 'aboutToSlide') {
          // static friction at its limit on the surface it rests on
          const on = sketch.supports.find(sup => sup.body === x.of && !sup.beside)?.on
          const c = on ? contact(x.of, on) : null
          const pair = on ? scene.contactPairs.find(p => (p.a === x.of && p.b === on) || (p.b === x.of && p.a === on)) : undefined
          const muS = pair?.muS ?? 0
          if (c && c.inContact && c.N > 0 && !(muS > 0 && Math.abs(c.f / (muS * c.N) - 1) <= 0.02)) D('L3.notOnVerge', path, `${x.of} just about to slide: friction at its limit μs·N = ${(muS * c.N).toPrecision(4)} N`, `the friction force is ${c.f.toPrecision(4)} N`, 'check the friction coefficient and the forces on it', allow)
        }
      })
      for (const x of exp.ropes) {
        const k = ropes.findIndex(r => r.id === x.of)
        if (x.state === 'taut' && fv && k >= 0 && !fv.ropes[k]?.taut) D('L3.event', `expect[${x.index}]`, `${x.of} is taut`, 'it is slack at the start', 'check its length and the places of its ends', [`expect[${x.index}]`, 'values', 'connectors'])
      }
    }
  } finally { probe?.free() }
  return { diagnostics: out, quantities }
}

function ropePath(declared: Compiled | null, ch: { subject?: string; bodies?: string[] }): string {
  const r = declared?.ropes.find(x => x.id === ch.subject) ?? declared?.ropes.find(x => (ch.bodies ?? []).some(b => x.ends.includes(b)))
  return r ? `connectors[${r.index}]` : ''
}

/** What the sketch says about the start, by kind. */
function expectOf(c: Compiled): { bodies: Array<{ of: string; state: string; index: number }>; ropes: Array<{ of: string; state: string; index: number }> } {
  const rows = c.expect.map((e, index) => ({ ...e, index }))
  return { bodies: rows.filter(e => e.state === 'atRest' || e.state === 'moves' || e.state === 'aboutToSlide'), ropes: rows.filter(e => e.state === 'taut' || e.state === 'slack') }
}

// ---- L4: the contract with the problem text ----

/** A text for comparing: compatibility forms folded (full-width, ² → ^2 kept apart), spaces gone, signs unified. */
export function foldText(s: string): string {
  const sup: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' }
  return s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, m => `^${[...m].map(c => sup[c]).join('')}`).normalize('NFKC').replace(/\s+/g, '').replace(/[−–—‐‑]/g, '-').replace(/[“”„‟«»]/g, '"').replace(/[‘’]/g, "'")
}


/** The numbers of a folded text with the unit written after each ('' when there is none or it is not a unit). */
function numbersIn(text: string): Array<{ value: number; unit: string }> {
  const out: Array<{ value: number; unit: string }> = []
  const re = /(\d+(?:\.\d+)?)(?:[×x*]10\^?(-?\d+))?/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const value = Number(m[1]) * (m[2] !== undefined ? 10 ** Number(m[2]) : 1)
    const rest = text.slice(m.index + m[0].length)
    let unit = ''
    const cjk = CJK_UNITS.find(u => rest.startsWith(u))
    if (cjk) unit = normalizeUnit(cjk)
    else {
      // the longest run of unit characters that is a unit ("kgblock" → kg)
      const run = /^[A-Za-zμ°Ω%·/^0-9²³-]{1,10}/.exec(rest)?.[0] ?? ''
      for (let n = run.length; n > 0; n--) { const u = normalizeUnit(run.slice(0, n)); if (u !== '1' && siUnitOf(u)) { unit = u; break } }
    }
    out.push({ value, unit })
  }
  return out
}

/** One row with a quote against the problem text. */
function quoteCheck(path: string, row: { value: number; unit: string; quote: string }, folded: string, out: Diagnostic[]) {
  const q = row.quote.trim()
  if (!q) return
  const fq = foldText(q)
  if (!folded.toLowerCase().includes(fq.toLowerCase())) { out.push({ code: 'L4.quote', level: 4, path: `${path}.quote`, expected: 'words copied from the problem text', got: q, hint: 'copy the words of the problem exactly; if the problem does not give this value, leave the quote empty (it then counts as an assumption) or set the row to null', allow: [path] }); return }
  const nums = numbersIn(fq)
  if (!nums.length) return
  const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b))
  const hit = nums.filter(n => same(n.value, Math.abs(row.value)))
  if (!hit.length) { out.push({ code: 'L4.quoteValue', level: 4, path: `${path}.value`, expected: `a number of the quote "${q}" (${nums.map(n => n.value).join(', ')})`, got: String(row.value), hint: 'write the value as the problem does (the app converts units)', allow: [path] }); return }
  const unit = normalizeUnit(row.unit)
  const mine = qtyToSI({ value: 1, unit })
  const written = hit.map(n => n.unit).filter(Boolean)
  if (written.length && mine !== null && !written.some(u => { const other = qtyToSI({ value: 1, unit: u }); return other !== null && siUnitOf(u) === siUnitOf(unit) && Math.abs(other - mine) <= 1e-12 * Math.abs(mine) })) out.push({ code: 'L4.quoteUnit', level: 4, path: `${path}.unit`, expected: `the unit written in the quote "${q}" (${written.join(', ')})`, got: row.unit || '""', hint: 'write the unit as the problem does', allow: [path] })
}

/** Quotes of the value table (or of a template's parameters), and numbers written into point names. */
function contractText(sketch: SceneSketch, problem: string): Diagnostic[] {
  const out: Diagnostic[] = []
  const folded = foldText(problem)
  sketch.values.forEach((r, i) => quoteCheck(`values[${i}]`, r, folded, out))
  sketch.templateParams.forEach((r, i) => quoteCheck(`templateParams[${i}]`, r, folded, out))
  // a coordinate in a point name ("ceiling x=0.5m") is a value of the problem too
  const inline = (text: string, path: string) => {
    const c = parsePoint(text)?.coord
    if (c && !numbersIn(folded).some(n => Math.abs(n.value - Math.abs(c.value)) <= 1e-9 * Math.max(1, Math.abs(c.value)))) out.push({ code: 'L4.quote', level: 4, path, expected: 'a number of the problem text', got: text, hint: 'name the point without a coordinate (the app places it) unless the problem gives one' })
  }
  sketch.surfaces.forEach((x, i) => inline(x.at, `surfaces[${i}].at`))
  sketch.pulleys.forEach((x, i) => inline(x.at, `pulleys[${i}].at`))
  sketch.connectors.forEach((x, i) => x.path.forEach((t, k) => inline(t, `connectors[${i}].path[${k}]`)))
  return out
}

/** Every question reads a quantity (or event) the scene has. */
function questionChecks(sketch: SceneSketch, scene: Scene, quantities: Map<string, string>): { questions: CheckedQuestion[]; diagnostics: Diagnostic[] } {
  const out: Diagnostic[] = []
  const questions: CheckedQuestion[] = []
  const ids = new Set(scene.bodies.map(b => b.id))
  const sample = () => [...quantities.keys()].filter(k => !k.startsWith('ledger.') && !/\.(fx|fy|px|py|vt|P|Lz|lagr|ham|Nx|Ny)$/.test(k)).slice(0, 36).join(', ')
  sketch.questions.forEach((q, i) => {
    const path = `questions[${i}]`
    const target: Record<string, unknown> = { kind: q.kind }
    if (q.kind !== 'event') target.id = q.id
    if (q.kind === 'quantity') target.t = q.t
    if (q.kind === 'atEvent' || q.kind === 'event') { target.event = q.event; if (q.body) target.body = q.body }
    if (q.kind === 'atEvent') target.side = q.side
    if (q.kind === 'extreme') target.which = q.which
    const r = checkTarget(target, quantities, ids, path)
    if (!q.prompt.trim()) out.push({ code: 'L4.question', level: 4, path: `${path}.prompt`, expected: 'what is asked, in the words of the problem', got: '""', hint: '' })
    else if (r.target) questions.push({ prompt: q.prompt.trim(), target: r.target, unit: q.unit || undefined })
    for (const e of r.errors) out.push({ code: 'L4.question', level: 4, path, expected: 'a question the scene can answer', got: e.replace(`${path}.target.`, ''), hint: `readable quantities include: ${sample()}`, allow: [path] })
  })
  return { questions, diagnostics: out }
}

// ---- the template route (D284): a template with parameters passes the same ladder ----

export function checkTemplate(sketch: SceneSketch, problem: string): Ladder {
  const out: Diagnostic[] = []
  const D = (code: string, path: string, expected: string, got: string, hint = '') => out.push({ code, level: Number(code[1]) as Diagnostic['level'], path, expected, got, hint })
  const t = templateById(sketch.templateId)
  if (!t) { D('L1.reference', 'templateId', 'the id of one of the templates offered', sketch.templateId || '""', 'or describe the scene as a sketch (route "sketch")'); return result({ diagnostics: out, sketch, via: 'template' }, 1) }
  const values: Record<string, number> = {}
  const assumptions: Assumption[] = []
  sketch.templateParams.forEach((r, i) => {
    const path = `templateParams[${i}]`
    const p = t.params.find(x => x.key === r.key)
    if (!p) { D('L1.reference', `${path}.key`, `a parameter of ${t.id}: ${t.params.map(x => `${x.key} [${x.unit || '1'}]`).join(', ')}`, r.key || '""'); return }
    if (r.key in values) { D('L1.duplicate', path, 'each parameter once', `${r.key} twice`, 'set one of the rows to null'); return }
    const c = toParamUnit(r.unit ? { value: r.value, unit: r.unit } : { value: r.value, unit: p.unit }, p.unit)
    if ('error' in c) { D(/unknown unit/.test(c.error) ? 'L1.unit' : 'L1.dimension', `${path}.unit`, `a unit of ${p.label} (${p.unit || 'a pure number'})`, r.unit || '""', c.error); return }
    if ((p.min !== undefined && c.value < p.min) || (p.max !== undefined && c.value > p.max)) { D('L1.range', `${path}.value`, `${p.label} within ${p.min ?? '−∞'} … ${p.max ?? '+∞'} ${p.unit}`, `${c.value} ${p.unit}`, 'if the problem is outside what this template does, describe the scene as a sketch'); return }
    values[r.key] = c.value
    if (!r.quote.trim()) assumptions.push({ key: 'stated', params: [t.name, p.label, `${r.value}${r.unit ? ` ${r.unit}` : ''}`] })
  })
  const text = contractText(sketch, problem)
  if (out.length) return result({ diagnostics: [...out, ...text], sketch, via: 'template' }, 1)
  for (const p of t.params) if (!(p.key in values)) assumptions.push({ key: 'templateDefault', params: [p.label, `${p.value}${p.unit ? ` ${p.unit}` : ''}`] })
  let scene: Scene
  try { scene = buildTemplate(t.id, values) } catch (e) { D('L2.compile', 'templateParams', `values the template ${t.id} can be built with`, (e as Error).message); return result({ diagnostics: [...out, ...text], sketch, via: 'template', assumptions }, 2) }
  if (sketch.title) scene.name = sketch.title
  const names = Object.fromEntries(scene.bodies.map(b => [b.id, b.name]))
  const s = sceneChecks(scene, null, () => '')
  const diagnostics = [...s.diagnostics]
  const reached = !ok(diagnostics, 2) ? 2 : !ok(diagnostics, 3) ? 3 : 4
  const q = reached === 4 ? questionChecks(sketch, scene, s.quantities) : { questions: [], diagnostics: [] }
  if (reached === 4 && q.questions.length) {
    let d = scene.settings.duration ?? scene.settings.legacyDuration
    for (const x of q.questions) if (x.target.kind === 'quantity') d = Math.max(d, x.target.t + 0.5)
    scene.settings.duration = Math.min(600, d)
    scene.settings.legacyDuration = scene.settings.duration
  }
  return result({ sketch, via: 'template', scene, questions: q.questions, assumptions, names, placed: scene.bodies.map(b => b.id), diagnostics: [...diagnostics, ...text, ...q.diagnostics] }, reached)
}
