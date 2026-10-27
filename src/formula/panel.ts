/**
 * Formula viewing (26.53, D70–D72): categories, search and filters of the formula panel, the reasons a filter leaves
 * nothing, the lanes of the formula timeline, and what a card or a known variable refers to on the canvas. Pure
 * functions over the cards of the core (formula/match.ts); the numbers are not touched here.
 */
import type { FormulaDef } from './library'
import type { FormulaCard, TimelineEntry, Verdict } from './match'
import { formulaAst } from './match'
import type { Node } from './expr'
import type { Situation } from './recognize'
import type { ForceKind } from '../engine/views'

/** Topic of a formula (D70 filter). */
export type FormulaCategory = 'kinematics' | 'dynamics' | 'energy' | 'momentum' | 'rotation' | 'collision' | 'fields'

/** The categories in panel order, with their source texts. */
export const CATEGORIES: ReadonlyArray<{ id: FormulaCategory; label: string }> = [
  { id: 'kinematics', label: '运动学' }, { id: 'dynamics', label: '动力学' }, { id: 'energy', label: '能量' }, { id: 'momentum', label: '动量' },
  { id: 'rotation', label: '转动' }, { id: 'collision', label: '碰撞' }, { id: 'fields', label: '场与振动' }
]

const COLLISION_SITUATIONS = new Set(['collision', 'bounce', 'hinged-impact'])
const FIELD_SITUATIONS = new Set(['spring', 'spring-pair', 'pendulum', 'orbit', 'damped'])
const ROTATION_UNITS = new Set(['rad', 'rad/s', 'rad/s²', 'kg·m²/s', 'kg·m²', 'N·m'])

/**
 * Category of a formula: collisions by their situation, then energy and momentum by the unit of the result, then
 * springs, pendulums and orbits, rotation units, forces and accelerations (dynamics), the rest kinematics.
 */
export function formulaCategory(f: FormulaDef): FormulaCategory {
  if (COLLISION_SITUATIONS.has(f.situation)) return 'collision'
  if (f.unit === 'J' || f.unit === 'W') return 'energy'
  if (f.unit === 'kg·m/s' || f.unit === 'N·s') return 'momentum'
  if (FIELD_SITUATIONS.has(f.situation)) return 'fields'
  if (ROTATION_UNITS.has(f.unit)) return 'rotation'
  if (f.unit === 'N' || f.unit === 'm/s²') return 'dynamics'
  return 'kinematics'
}

/** Variable names of a formula's expression. */
export function formulaVars(f: FormulaDef): Set<string> {
  const out = new Set<string>()
  const walk = (n: Node) => {
    if (n.type === 'var') out.add(n.name)
    else if (n.type === 'neg') walk(n.arg)
    else if (n.type === 'bin' || n.type === 'cmp') { walk(n.left); walk(n.right) }
    else if (n.type === 'call') n.args.forEach(walk)
  }
  try { walk(formulaAst(f)) } catch { /* A formula that does not parse refers to nothing */ }
  return out
}

/** The forces a formula is about (D72): from its left-hand side and the coefficients it uses. */
export function forceKindsOf(f: FormulaDef): ForceKind[] {
  const out = new Set<ForceKind>()
  const lhs = f.lhs.replace(/\\[a-zA-Z]+|[{}_' ]/g, '')
  const vars = formulaVars(f)
  if (/^N/.test(lhs)) out.add('normal')
  if (/^f/.test(lhs)) out.add('friction')
  if (/^T/.test(lhs)) out.add('tension')
  if ([...vars].some(v => /^mu/.test(v))) { out.add('friction'); out.add('normal') }
  if (vars.has('k')) out.add('spring')
  if (vars.has('g') && (f.unit === 'N' || f.unit === 'm/s²' || f.unit === 'rad/s²')) out.add('gravity')
  if (vars.has('F') || vars.has('F0')) out.add('applied')
  return [...out]
}

/** What a known variable stands for on the canvas (D72). */
export type VarRef =
  | { kind: 'body'; body: string }
  | { kind: 'pair'; a: string; b: string | null }
  | { kind: 'connector'; type: 'rope' | 'spring' }
  | { kind: 'angle'; body: string }
  | { kind: 'velocity'; body: string }
  | { kind: 'gravity' }

/**
 * The drawn element of a known variable, from its name and the situation's bodies (first body: m, m₁, v₁ …; second:
 * M, m₂, v₂ …); null when it has none (times, ratios).
 */
export function varRef(name: string, sit: Situation): VarRef | null {
  const [b0, b1] = sit.bodies
  const second = b1 ?? b0
  if (!b0) return name === 'g' ? { kind: 'gravity' } : null
  if (/^(m|m1|m_1|I|I1|r|r1|R1)$/.test(name)) return { kind: 'body', body: b0 }
  if (/^(M|m2|m_2|I2|r2|R2|R)$/.test(name)) return { kind: 'body', body: second }
  if (/^mu2$/.test(name)) return { kind: 'pair', a: second, b: null }
  if (/^mu/.test(name) || name === 'e') return { kind: 'pair', a: b0, b: b1 ?? null }
  if (/^(theta|alpha|phi|theta0)$/.test(name)) return { kind: 'angle', body: b0 }
  if (/^(v|u|v0|v1|u1|v10|omega|omega0|w0)$/.test(name)) return { kind: 'velocity', body: b0 }
  if (/^(v2|u2|v20)$/.test(name)) return { kind: 'velocity', body: second }
  if (name === 'k') return { kind: 'connector', type: 'spring' }
  if (/^(L|l|L0|T)$/.test(name)) return { kind: 'connector', type: 'rope' }
  if (name === 'g') return { kind: 'gravity' }
  return null
}

/** What the canvas emphasises (D72): bodies, force kinds on them, velocity arrows, connector kinds, angle marks. */
export interface Highlight {
  bodies: string[]
  forces: ForceKind[]
  velocity: string[]
  connectors: Array<'rope' | 'spring'>
  angle: string[]
  /** Contact pairs (body ids, b null: any other body); their normal and friction forces are emphasised. */
  pairs: Array<{ a: string; b: string | null }>
}

export const NO_HIGHLIGHT: Highlight = { bodies: [], forces: [], velocity: [], connectors: [], angle: [], pairs: [] }

/**
 * Highlight of a card: the bodies its variables refer to (masses, coefficients of a contact, angles — all of the
 * situation's bodies when it names none), the forces of the formula and the angle it uses. A support that is only
 * part of the situation (the ground under a board) is not lit for a formula about the block (26.53).
 */
export function cardHighlight(c: FormulaCard): Highlight {
  const sit = c.situation
  const used = new Set<string>(), angle = new Set<string>()
  for (const v of formulaVars(c.formula)) {
    const r = varRef(v, sit)
    if (!r) continue
    if (r.kind === 'body' || r.kind === 'velocity') used.add(r.body)
    else if (r.kind === 'angle') { used.add(r.body); angle.add(r.body) }
    else if (r.kind === 'pair') { used.add(r.a); if (r.b) used.add(r.b) }
  }
  const bodies = used.size ? sit.bodies.filter(b => used.has(b)) : [...sit.bodies]
  return { ...NO_HIGHLIGHT, bodies, forces: forceKindsOf(c.formula), angle: [...angle] }
}

/** Highlight of one known variable of a situation. */
export function varHighlight(name: string, sit: Situation): Highlight | null {
  const r = varRef(name, sit)
  if (!r) return null
  switch (r.kind) {
    case 'body': return { ...NO_HIGHLIGHT, bodies: [r.body] }
    case 'pair': return { ...NO_HIGHLIGHT, bodies: [r.a, ...(r.b ? [r.b] : [])], pairs: [r], forces: ['normal', 'friction'] }
    case 'connector': return { ...NO_HIGHLIGHT, bodies: [...sit.bodies], connectors: [r.type], forces: r.type === 'spring' ? ['spring'] : ['tension'] }
    case 'angle': return { ...NO_HIGHLIGHT, bodies: [r.body], angle: [r.body] }
    case 'velocity': return { ...NO_HIGHLIGHT, bodies: [r.body], velocity: [r.body] }
    case 'gravity': return { ...NO_HIGHLIGHT, bodies: [...sit.bodies], forces: ['gravity'] }
  }
}

// ---- Filters (D70) ----

/** Verdict filter: everything, agreeing (exact or valid approximations), deviating, or approximate. */
export type VerdictFilter = 'all' | 'match' | 'deviate' | 'approx'

/** Group of a verdict for the filter and the timeline colours. */
export function verdictGroup(v: Verdict): 'match' | 'deviate' | 'approx' | 'other' {
  if (v === 'match' || v === 'approx-ok') return 'match'
  if (v === 'deviate' || v === 'approx-invalid') return 'deviate'
  if (v === 'approx') return 'approx'
  return 'other'
}

/** The filters of the panel (persisted in settings.ui.formula, the canvas pick is not). */
export interface FormulaFilter {
  search: string
  /** Body id ('' all). */
  body: string
  /** Category ('' all). */
  category: '' | FormulaCategory
  verdict: VerdictFilter
  pinnedOnly: boolean
  pinned: readonly string[]
  /** Picked on the canvas (D72): a body, or a force of a body. */
  pick: { body: string; force: ForceKind | null } | null
}

/** Normalised text of a search (lower case, no LaTeX commands or braces). */
const plain = (s: string) => s.toLowerCase().replace(/\\(?:d?frac|tfrac|mathrm|operatorname|left|right|quad|,)/g, ' ').replace(/[\\{}^_]/g, '').replace(/\s+/g, ' ')

/** Does a card contain the search text (title, symbols, formula id, situation)? */
export function matchesSearch(c: FormulaCard, search: string): boolean {
  const q = plain(search.trim())
  if (!q) return true
  const hay = plain([c.formula.title, c.formula.id, c.formula.latex, c.formula.lhs, c.situation.title, c.formula.method ?? ''].join(' '))
  return q.split(' ').every(w => hay.includes(w))
}

/** Which filter rejects a card (null: shown). */
export function rejectedBy(c: FormulaCard, f: FormulaFilter): keyof FormulaFilter | null {
  if (!matchesSearch(c, f.search)) return 'search'
  if (f.body && !c.situation.bodies.includes(f.body)) return 'body'
  if (f.category && formulaCategory(c.formula) !== f.category) return 'category'
  if (f.verdict !== 'all' && verdictGroup(c.verdict) !== f.verdict) return 'verdict'
  if (f.pinnedOnly && !f.pinned.includes(c.formula.id)) return 'pinnedOnly'
  if (f.pick) {
    if (!c.situation.bodies.includes(f.pick.body)) return 'pick'
    if (f.pick.force && !forceKindsOf(c.formula).includes(f.pick.force)) return 'pick'
  }
  return null
}

/** The filters that left nothing: each one that rejects cards no other filter rejects, in panel order. */
export function emptyReasons(cards: FormulaCard[], f: FormulaFilter): Array<keyof FormulaFilter> {
  const out: Array<keyof FormulaFilter> = []
  const keys: Array<keyof FormulaFilter> = ['search', 'body', 'category', 'verdict', 'pinnedOnly', 'pick']
  for (const k of keys) {
    // Would the card list be non-empty without this filter?
    const relaxed: FormulaFilter = { ...f, [k]: k === 'verdict' ? 'all' : k === 'pinnedOnly' ? false : k === 'pick' ? null : '' }
    if (cards.some(c => rejectedBy(c, relaxed) === null)) out.push(k)
  }
  return out
}

/** Cards in display order: pinned formulas first, otherwise the core's order. */
export function pinnedFirst<T extends { formula: FormulaDef }>(list: T[], pinned: readonly string[]): T[] {
  const p = list.filter(c => pinned.includes(c.formula.id))
  return p.length ? [...p, ...list.filter(c => !pinned.includes(c.formula.id))] : list
}

// ---- Formula timeline (D71) ----

/** A situation on the formula timeline: lane, span, colour class and counts. */
export interface TimelineBar {
  entry: TimelineEntry
  lane: number
  t0: number
  t1: number
  /** Event-type situation: a mark at `t0`. */
  instant: boolean
  /** All agree, some deviate, some approximate, or nothing to compare. */
  verdict: 'match' | 'deviate' | 'approx' | 'none'
  formulas: number
  pinned: number
  category: FormulaCategory
}

/**
 * Bars of the formula timeline: each situation in the first lane whose last bar ends before it starts (at most
 * `maxLanes` lanes; further ones share the last lane).
 */
export function timelineBars(entries: TimelineEntry[], pinned: readonly string[], maxLanes = 4): TimelineBar[] {
  const sorted = entries.slice().sort((a, b) => (a.situation.tEvent ?? a.situation.t0) - (b.situation.tEvent ?? b.situation.t0))
  const ends: number[] = []
  const out: TimelineBar[] = []
  for (const e of sorted) {
    const s = e.situation
    const instant = s.tEvent !== undefined
    const t0 = instant ? s.tEvent! : s.t0, t1 = instant ? s.tEvent! : s.t1
    let lane = ends.findIndex(end => end < t0 - 1e-12)
    if (lane < 0) { lane = ends.length < maxLanes ? ends.length : maxLanes - 1; if (lane === ends.length) ends.push(t1) }
    ends[lane] = Math.max(ends[lane] ?? -Infinity, t1)
    const shown = e.cards.filter(c => c.verdict !== 'not-applicable')
    const groups = shown.map(c => verdictGroup(c.verdict))
    const verdict = groups.includes('deviate') ? 'deviate' : groups.includes('approx') ? 'approx' : groups.includes('match') ? 'match' : 'none'
    const cats = shown.map(c => formulaCategory(c.formula))
    const category = cats.length ? cats.sort((a, b) => cats.filter(x => x === b).length - cats.filter(x => x === a).length)[0] : 'kinematics'
    out.push({ entry: e, lane, t0, t1, instant, verdict, formulas: shown.length, pinned: shown.filter(c => pinned.includes(c.formula.id)).length, category })
  }
  return out
}
