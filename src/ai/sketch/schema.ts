/**
 * The scene sketch, version 2 (26.64, D279; version 1 was the scene description of 26.59, import/sceneSpec.ts).
 *
 * What the language model hands over when it builds a mechanics scene from a problem text: which things there are and
 * how they relate — a block ON the table, a pulley AT the table's right end, a rope along the path [A.right, P, B.top]
 * — and a table of the values the problem gives, each with the words of the problem it was read from. There is not one
 * coordinate in it that needs mental arithmetic: every position, anchor, wrap direction and rope length is computed by
 * the compiler (compile.ts, place.ts). Numbers are written with the unit of the problem (`value: 30, unit: 'cm'`); the
 * app converts.
 *
 * The same object is the argument of the function call `submit_sketch`. Its JSON Schema is flat on purpose: every
 * property is required and no other property is allowed, so the call can be made in a provider's strict mode. "Not
 * there" is therefore written as '' (or an empty list), never left out. Strict mode cannot express length limits;
 * those, and everything else, are checked again by `readSketch` (ladder level L0), which is also the whole check on a
 * connection without strict mode.
 */
import type { JsonSchema, ToolDef } from '../types'
import { extractJsonObject, numberFromText, parseLoose } from '../looseJson'

export const SKETCH_VERSION = 2

export const SURFACE_TYPES = ['ground', 'table', 'wall', 'ceiling', 'incline', 'arc', 'steps'] as const
export const BODY_TYPES = ['block', 'ball', 'point', 'board', 'rod', 'disc', 'ring', 'cart', 'wedge', 'polygon'] as const
export const PLACES = ['on', 'hanging', 'inside', 'outside', 'air'] as const
export const ATS = ['', 'left', 'middle', 'right', 'top', 'bottom', 'fromLeft', 'fromRight', 'fromTop', 'fromBottom', 'atHeight', 'leftOf', 'rightOf', 'connector', 'equilibrium', 'below', 'leftOfBottom', 'rightOfBottom', 'leftOfTop', 'rightOfTop'] as const
export const MOVES = ['rest', 'right', 'left', 'up', 'down', 'upSlope', 'downSlope', 'angle'] as const
export const SIDES = ['', 'left', 'right'] as const
export const SPANS = ['', 'quarter', 'half', 'bowl', 'full', 'hump', 'angles'] as const
export const CONNECTOR_TYPES = ['rope', 'spring', 'rod', 'hinge', 'force'] as const
export const MODES = ['', 'taut', 'slack', 'fastened', 'notFastened', 'right', 'left', 'up', 'down', 'upSlope', 'downSlope', 'angle'] as const
export const EXPECT_STATES = ['atRest', 'moves', 'taut', 'slack', 'aboutToSlide'] as const
export const TARGET_KINDS = ['quantity', 'atEvent', 'event', 'end', 'extreme'] as const
export const ROUTES = ['sketch', 'template', 'unsupported'] as const

export type SurfaceType = typeof SURFACE_TYPES[number]
export type BodyType = typeof BODY_TYPES[number]
export type Place = typeof PLACES[number]
export type At = typeof ATS[number]
export type Moves = typeof MOVES[number]
export type Side = typeof SIDES[number]
export type Span = typeof SPANS[number]
export type ConnectorType = typeof CONNECTOR_TYPES[number]
export type Mode = typeof MODES[number]
export type ExpectState = typeof EXPECT_STATES[number]

/** A fixed surface. `side`: where an incline's high end, a wall, or the upper end of a quarter / half arc is. */
export interface SurfaceSketch { id: string; name: string; type: SurfaceType; side: Side; span: Span; at: string }
/**
 * A movable body and where it is, as a relation: ON a surface, a body or a vertical spring (`ref`) at a place along it
 * (`at`); HANGING from a rope, spring or rod; INSIDE / OUTSIDE an arc track; or in the AIR (the one way to give
 * coordinates — a launch point). `ref2`: the wall or body it touches (at leftOf / rightOf), or the surface a
 * `heightAbove` value is measured from.
 */
export interface BodySketch { id: string; name: string; type: BodyType; place: Place; ref: string; at: At; ref2: string; moves: Moves; side: Side; points: string[] }
/** A pulley wheel and where it is mounted: `table.rightEnd`, `incline.top`, `ceiling`, `ceiling x=0.5m`, or '' (free). */
export interface PulleySketch { id: string; name: string; at: string }
/**
 * A connector between named points. A rope is a path `[A.right, P, B.top]` over pulleys; a spring, rod or hinge has two
 * ends; a force has the one point it acts on. `mode`: rope taut / slack; spring fastened / notFastened (it only
 * pushes); force direction.
 */
export interface ConnectorSketch { id: string; name: string; type: ConnectorType; path: string[]; mode: Mode }
/** One value: the field it is for (`of` an object, `quantity`), as written in the problem, with the words it was read from ('' = assumed). */
export interface ValueRow { of: string; quantity: string; value: number; unit: string; quote: string }
/** What the problem says happens at the start. */
export interface ExpectRow { of: string; state: ExpectState }
/** A question with its readout target (the five kinds of the problem bank, flat). */
export interface QuestionSketch { prompt: string; unit: string; kind: typeof TARGET_KINDS[number]; id: string; t: number; event: string; side: '' | 'before' | 'after'; body: string; which: '' | 'max' | 'min' }
/** A template parameter as written in the problem. */
export interface ParamRow { key: string; value: number; unit: string; quote: string }

export interface SceneSketch {
  version: number
  /** 'sketch': the scene is described below; 'template': a template with parameters says it all (D284); 'unsupported': the engine cannot do it (`reason`). */
  route: typeof ROUTES[number]
  title: string
  reason: string
  templateId: string
  templateParams: ParamRow[]
  /** 'none': a top view or "gravity is negligible". */
  gravity: 'down' | 'none'
  /** How many movable bodies the problem has (checked against `bodies`). */
  movingBodies: number
  surfaces: SurfaceSketch[]
  bodies: BodySketch[]
  pulleys: PulleySketch[]
  connectors: ConnectorSketch[]
  values: ValueRow[]
  expect: ExpectRow[]
  questions: QuestionSketch[]
}

/**
 * One finding of the validation ladder (D281). `expected` / `got` / `hint` are short English sentences for the model;
 * the user reads a translated line (messages.ts). `allow`: the paths a patch may set to resolve it besides `path`
 * (D282: a patch that touches anything else is rejected).
 */
export interface Diagnostic { code: string; level: 0 | 1 | 2 | 3 | 4; path: string; expected: string; got: string; hint: string; allow?: string[] }

// ---- the schema, once: JSON Schema for the call, defaults and limits for the reader ----

type Spec =
  | { k: 'str'; max: number; enum?: readonly string[]; d?: string; desc?: string }
  | { k: 'num'; d?: number; int?: boolean; desc?: string }
  | { k: 'arr'; items: Spec; max: number; desc?: string }
  | { k: 'obj'; props: Record<string, Spec>; desc?: string }

const S = (max: number, desc?: string): Spec => ({ k: 'str', max, desc })
const E = (values: readonly string[], desc?: string, d = values[0]): Spec => ({ k: 'str', max: 24, enum: values, d, desc })
const N = (desc?: string, d = 0): Spec => ({ k: 'num', d, desc })
const A = (items: Spec, max: number, desc?: string): Spec => ({ k: 'arr', items, max, desc })
const O = (props: Record<string, Spec>, desc?: string): Spec => ({ k: 'obj', props, desc })

const ID = 'letters, digits and _ , starting with a letter'
const VALUE_ROW = O({
  of: S(40, 'what the value belongs to: an id, a pair "A|table" (friction, restitution), or "world" (g)'),
  quantity: S(24, 'which field, e.g. mass, mu, angle, length, radius, speed, stiffness'),
  value: N('the number as written in the problem (not converted)'),
  unit: S(16, 'the unit as written, "" for a pure number'),
  quote: S(80, 'the words of the problem this was read from, copied exactly; "" when the problem does not give it')
})

const SPEC: Spec = O({
  version: { k: 'num', d: SKETCH_VERSION, int: true, desc: 'always 2' },
  route: E(ROUTES, 'sketch | template (a listed template says it all) | unsupported'),
  title: S(60, 'short title in the language of the problem'),
  reason: S(300, 'route unsupported: why; else ""'),
  templateId: S(40, 'route template: the template id; else ""'),
  templateParams: A(O({ key: S(24), value: N(), unit: S(16), quote: S(80) }), 16, 'route template: the parameters the problem gives'),
  gravity: E(['down', 'none'], 'none: top view or gravity negligible'),
  movingBodies: { k: 'num', d: 0, int: true, desc: 'number of movable bodies in the problem' },
  surfaces: A(O({
    id: S(24, ID), name: S(30), type: E(SURFACE_TYPES),
    side: E(SIDES, 'incline: side of its high end; wall: where it stands; quarter or half arc: side of its upper end'),
    span: E(SPANS, 'arc only: quarter | half (standing) | bowl | full | hump | angles'),
    at: S(48, 'a named point of another surface where its foot is, or ""')
  }), 12),
  bodies: A(O({
    id: S(24, ID), name: S(30), type: E(BODY_TYPES),
    place: E(PLACES), ref: S(24, 'on: surface, body or vertical spring; hanging: rope, spring or rod; inside / outside: arc; air: ""'),
    at: E(ATS, 'the place along it'), ref2: S(24, 'the wall or body it touches (leftOf / rightOf), or the surface heightAbove is measured from; else ""'),
    moves: E(MOVES, 'initial motion; needs a speed value unless rest'), side: E(SIDES, 'wedge: side of its high end; else ""'),
    points: A(S(40), 24, 'polygon: corners "x y" in metres, counter-clockwise; else []')
  }), 16),
  pulleys: A(O({ id: S(24, ID), name: S(30), at: S(48, 'where it is mounted: table.rightEnd, incline.top, ceiling, or ""') }), 8),
  connectors: A(O({
    id: S(24, ID), name: S(30), type: E(CONNECTOR_TYPES),
    path: A(S(48), 10, 'named points: rope [end, pulleys…, end]; spring / rod / hinge [end, end]; force [point]'),
    mode: E(MODES, 'rope: taut | slack; spring: fastened | notFastened; force: its direction; else ""')
  }), 12),
  values: A(VALUE_ROW, 60, 'every value of the problem once, each for exactly one field'),
  expect: A(O({ of: S(24), state: E(EXPECT_STATES) }), 16, 'what the problem says about the start'),
  questions: A(O({
    prompt: S(200), unit: S(20), kind: E(TARGET_KINDS), id: S(60, 'quantity id such as A.v, rope1.T, contact.A|table.f; "" for kind event'),
    t: N('kind quantity: the time in s; else 0'), event: S(24, 'kind atEvent / event: the event; else ""'),
    side: E(['', 'before', 'after']), body: S(24), which: E(['', 'max', 'min'])
  }), 8)
})

function jsonSchemaOf(s: Spec): JsonSchema {
  const d = s.desc ? { description: s.desc } : {}
  if (s.k === 'str') return { type: 'string', ...(s.enum ? { enum: [...s.enum] } : {}), ...d }
  if (s.k === 'num') return { type: s.int ? 'integer' : 'number', ...d }
  if (s.k === 'arr') return { type: 'array', items: jsonSchemaOf(s.items), ...d }
  return { type: 'object', properties: Object.fromEntries(Object.entries(s.props).map(([k, v]) => [k, jsonSchemaOf(v)])), required: Object.keys(s.props), additionalProperties: false, ...d }
}

/** JSON Schema of a sketch: flat, every property required, nothing else allowed (strict-mode compatible). */
export const SKETCH_SCHEMA: JsonSchema = jsonSchemaOf(SPEC)

/** A tool definition; `strict` is sent only where the connection has strict function calls (client.ts). */
export type StrictToolDef = ToolDef & { function: ToolDef['function'] & { strict?: boolean } }

/** The function call that hands over a sketch. */
export function submitSketchTool(strict: boolean): StrictToolDef {
  return { type: 'function', function: { name: 'submit_sketch', description: 'Hand over the scene sketch (relations and given values; no coordinates), or the template with its parameters.', parameters: SKETCH_SCHEMA, ...(strict ? { strict: true } : {}) } }
}

/**
 * JSON Schema of a patch (D282): a list of "set path to value". `value` is JSON text ("0.2", "\"kg\"",
 * "[\"A.right\",\"P\",\"B.top\"]", "null" to take a list item out) so that the schema stays strict-compatible.
 */
export const PATCH_SCHEMA: JsonSchema = {
  type: 'object', required: ['patch'], additionalProperties: false,
  properties: { patch: { type: 'array', items: { type: 'object', required: ['op', 'path', 'value'], additionalProperties: false, properties: { op: { type: 'string', enum: ['set'] }, path: { type: 'string', description: 'a path a diagnostic names, e.g. connectors[0].path or values[+] to add a row' }, value: { type: 'string', description: 'the new value as JSON text; null removes a list item' } } } } }
}

export function submitPatchTool(strict: boolean): StrictToolDef {
  return { type: 'function', function: { name: 'submit_patch', description: 'Correct the sketch: set the named paths to new values. Only paths the diagnostics name.', parameters: PATCH_SCHEMA, ...(strict ? { strict: true } : {}) } }
}

// ---- reading (ladder level L0) ----

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const ID_RE = /^[A-Za-z][A-Za-z0-9_]{0,23}$/

function defaultOf(s: Spec): unknown {
  if (s.k === 'str') return s.d ?? ''
  if (s.k === 'num') return s.d ?? 0
  if (s.k === 'arr') return []
  return Object.fromEntries(Object.entries(s.props).map(([k, v]) => [k, defaultOf(v)]))
}

/** A new sketch with every field at its default (tests, the template route). */
export function emptySketch(): SceneSketch { return defaultOf(SPEC) as SceneSketch }

function read(s: Spec, v: unknown, path: string, out: Diagnostic[]): unknown {
  const bad = (code: string, expected: string, got: unknown, hint = '') => { if (out.length < 40) out.push({ code, level: 0, path, expected, got: typeof got === 'string' ? got.slice(0, 80) : JSON.stringify(got ?? null)?.slice(0, 80) ?? 'null', hint }) }
  if (s.k === 'str') {
    // A model that writes a number where a word is expected ("unit": 1) is read, not rejected
    let t = typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : v === null || v === undefined ? (s.d ?? '') : null
    if (t === null) { bad('L0.type', 'a string', v); return s.d ?? '' }
    if (s.enum && !s.enum.includes(t)) { bad('L0.enum', `one of ${s.enum.map(x => (x === '' ? '""' : x)).join(' | ')}`, t); t = s.d ?? '' }
    if (t.length > s.max) { bad('L0.length', `at most ${s.max} characters`, `${t.length} characters`, 'shorten it'); t = t.slice(0, s.max) }
    return t
  }
  if (s.k === 'num') {
    let n: number | null = typeof v === 'number' && Number.isFinite(v) ? v : null
    // "2", "30°": a number written as text (JSON mode); the unit belongs in the unit field, so only bare numbers
    if (n === null && typeof v === 'string' && /^\s*[-+−]?[\d.]+(e[-+]?\d+)?\s*$/i.test(v)) n = numberFromText(v)
    if (n === null && (v === null || v === undefined)) n = s.d ?? 0
    if (n === null) { bad('L0.type', 'a number', v, 'a plain number; the unit goes into the unit field'); return s.d ?? 0 }
    if (s.int && !Number.isInteger(n)) { bad('L0.type', 'a whole number', n); return Math.round(n) }
    return n
  }
  if (s.k === 'arr') {
    if (v === null || v === undefined) return []
    if (!Array.isArray(v)) { bad('L0.type', 'a list', v); return [] }
    if (v.length > s.max) bad('L0.length', `at most ${s.max} items`, `${v.length} items`)
    return v.slice(0, s.max).map((x, i) => read(s.items, x, `${path}[${i}]`, out))
  }
  if (!isObj(v)) { bad('L0.type', 'an object', v); return defaultOf(s) }
  const o: Record<string, unknown> = {}
  for (const [k, sub] of Object.entries(s.props)) o[k] = read(sub, v[k], path ? `${path}.${k}` : k, out)
  for (const k of Object.keys(v)) if (!(k in s.props) && out.length < 40) out.push({ code: 'L0.extra', level: 0, path: path ? `${path}.${k}` : k, expected: `only ${Object.keys(s.props).join(', ')}`, got: k, hint: 'remove it, or use the field it was meant for' })
  return o
}

/** How much an object looks like a sketch (to pick it out of an answer with prose). */
const sketchScore = (o: Record<string, unknown>) => (Array.isArray(o.bodies) ? 10 : 0) + (Array.isArray(o.values) ? 5 : 0) + (typeof o.route === 'string' ? 5 : 0) + (isObj(o.sketch) ? 8 : 0)

export interface ReadResult { sketch: SceneSketch | null; diagnostics: Diagnostic[]; repairs: string[] }

/**
 * Ladder level L0: a model's answer (the call's arguments as text or object, or a JSON-mode answer) as a sketch.
 * Left-out fields take their defaults, a property the schema does not know is a finding, as are a wrong type, a word
 * outside its list, an over-long text or list, and ids that are not identifiers or are used twice.
 */
export function readSketch(raw: unknown): ReadResult {
  const repairs: string[] = []
  let v = raw
  if (typeof v === 'string') {
    if (!v.trim()) return { sketch: null, diagnostics: [{ code: 'L0.json', level: 0, path: '', expected: 'one JSON object (the sketch)', got: 'an empty answer', hint: 'send the complete sketch object' }], repairs }
    let failure = ''
    const r = extractJsonObject(v, sketchScore, e => { failure = `line ${e.line}, column ${e.column}: ${e.error}; near …${e.context}…` })
    if (!r) return { sketch: null, diagnostics: [{ code: 'L0.json', level: 0, path: '', expected: 'one JSON object (the sketch)', got: failure || 'no JSON object in the answer', hint: 'send only the JSON object, starting with { and ending with }' }], repairs }
    if (r.truncated) return { sketch: null, diagnostics: [{ code: 'L0.json', level: 0, path: '', expected: 'a complete JSON object', got: 'the object ends before all brackets are closed (cut off)', hint: 'send it again, complete' }], repairs }
    repairs.push(...r.repairs)
    v = r.value
  }
  if (isObj(v) && isObj(v.sketch) && !Array.isArray(v.bodies)) v = v.sketch
  if (!isObj(v)) return { sketch: null, diagnostics: [{ code: 'L0.json', level: 0, path: '', expected: 'one JSON object (the sketch)', got: Array.isArray(v) ? 'a list' : typeof v, hint: 'send the sketch object' }], repairs }
  const diagnostics: Diagnostic[] = []
  const sketch = read(SPEC, v, '', diagnostics) as SceneSketch
  if (sketch.version !== SKETCH_VERSION) diagnostics.push({ code: 'L0.version', level: 0, path: 'version', expected: String(SKETCH_VERSION), got: String(sketch.version), hint: 'this app reads sketch version 2' })
  // ids: identifiers (they become quantity ids such as A.v), unique across surfaces, bodies, pulleys and connectors
  const seen = new Map<string, string>()
  for (const list of ['surfaces', 'bodies', 'pulleys', 'connectors'] as const) {
    sketch[list].forEach((o, i) => {
      const path = `${list}[${i}].id`
      if (!ID_RE.test(o.id) || o.id === 'world' || o.id === 'fixed') diagnostics.push({ code: 'L0.id', level: 0, path, expected: `an identifier: ${ID} (not "world" or "fixed")`, got: o.id || '""', hint: 'ids are part of quantity ids such as A.v' })
      else if (seen.has(o.id)) diagnostics.push({ code: 'L0.id', level: 0, path, expected: 'an id used once', got: `"${o.id}" is also ${seen.get(o.id)}`, hint: 'rename one of them' })
      else seen.set(o.id, path)
    })
  }
  return { sketch, diagnostics, repairs }
}

/** Every id of a sketch with what it names. */
export function idsOf(s: SceneSketch): Map<string, { list: 'surfaces' | 'bodies' | 'pulleys' | 'connectors'; index: number; type: string }> {
  const out = new Map<string, { list: 'surfaces' | 'bodies' | 'pulleys' | 'connectors'; index: number; type: string }>()
  s.surfaces.forEach((o, i) => out.set(o.id, { list: 'surfaces', index: i, type: o.type }))
  s.bodies.forEach((o, i) => out.set(o.id, { list: 'bodies', index: i, type: o.type }))
  s.pulleys.forEach((o, i) => out.set(o.id, { list: 'pulleys', index: i, type: 'pulley' }))
  s.connectors.forEach((o, i) => out.set(o.id, { list: 'connectors', index: i, type: o.type }))
  return out
}

/**
 * A named point as written in a sketch: `A.top`, `table.rightEnd`, `ceiling`, `ceiling x=0.5m`, `wall height=1.2 m`,
 * a pulley id, or `fixed` (a fixed point the app places). Null when the text is none of these.
 */
export interface PointName { owner: string; feature: string; coord: null | { axis: 'x' | 'height'; value: number; unit: string } }
export function parsePoint(text: string): PointName | null {
  const t = text.trim()
  let m = /^([A-Za-z][A-Za-z0-9_]*)\s+(x|height)\s*=\s*([-+]?[\d.]+(?:e[-+]?\d+)?)\s*([^\s]*)$/i.exec(t)
  if (m) { const value = Number(m[3]); return Number.isFinite(value) ? { owner: m[1], feature: '', coord: { axis: m[2].toLowerCase() as 'x' | 'height', value, unit: m[4] } } : null }
  m = /^([A-Za-z][A-Za-z0-9_]*)(?:\.([A-Za-z]+))?$/.exec(t)
  return m ? { owner: m[1], feature: m[2] ?? '', coord: null } : null
}

/** The value of a patch entry: JSON text is read (leniently); anything else is taken as it is. */
export function patchValue(v: unknown): unknown {
  if (typeof v !== 'string') return v
  const t = v.trim()
  if (t === '') return ''
  if (/^[[{"]|^(null|true|false)$|^[-+]?[\d.]/.test(t)) { const r = parseLoose(t); if (r.ok && !r.truncated && !r.repairs.includes('text after the JSON value ignored')) return r.value }
  return v
}
