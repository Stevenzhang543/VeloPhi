/**
 * The reading contract (manual §6, D163–D164): what the AI answers in its two calls and the deterministic checks
 * the app runs on it. Every check failure is a sentence the AI can act on in a repair round.
 */
import { TEMPLATES, templateById, buildTemplate } from '../../templates'
import { BUILTIN_PROBLEMS } from '../../teaching/problemBank'
import { modelById } from '../../content/models'
import { DOMAINS, ASSUMPTIONS, targetSpec, givenSpec } from '../../task/vocab'
import type { TaskDomain } from '../../task/types'
import type { ProblemTarget } from '../../teaching/problems'
import type { Scene } from '../../core/scene/types'
import { EngineSession } from '../../engine/session'
import { listQuantities, canonicalQuantityId } from '../../engine/observe'
import { CATEGORY_TYPES, EVENTS, LEVELS, STAGES, STRUCTURE_KEYS, chapterIds, structureText, templateStructure } from './catalog'
import type { Structure } from './catalog'
import { checkModel, parseEquation, solveEquations, EqError, EQ_CONSTANTS, equationLatex } from './equations'
import type { EqModel, EqResult } from './equations'
import { parse as parseExpr, ExprError } from '../../formula/expr'
import { toParamUnit, toSIOf, qtyToSI, normalizeUnit, siUnitOf } from './units'
import type { Qty } from './units'
import { compileSceneSpec, SpecError } from './sceneSpec'
import type { SceneSpec } from './sceneSpec'

export type Route = 'example' | 'template' | 'task' | 'model' | 'scene' | 'equations' | 'unsupported'
export const ROUTES: Route[] = ['example', 'template', 'task', 'model', 'scene', 'equations', 'unsupported']
/** What kind of physics the problem is about (26.59 fix): a motion to simulate, or a balance / relation to solve. */
export const PROCESSES = ['motion', 'static', 'circuit', 'optics', 'thermal', 'field', 'other'] as const
export type Process = typeof PROCESSES[number]

export interface Category { chapter: string; types: string[]; level: typeof LEVELS[number] | ''; stage: typeof STAGES[number] | '' }
export interface GivenRead { name: string; symbol?: string; value: number; unit: string; raw?: string }

/** Answer of the first call. */
export interface RouteAnswer {
  language: 'zh' | 'en' | 'de'
  summary: string
  category: Category
  route: Route
  id: string | null
  alternatives: string[]
  givens: GivenRead[]
  asks: string[]
  reason: string
  /** 26.59 fix: the kind of physics and the objects of the problem (template matching is checked against them). */
  process: Process
  objects: Partial<Structure>
}

export interface QuestionAnswer { prompt: string; target: ProblemTarget; unit?: string }

/** Answer of the second call (one of template / task / model / scene). */
export interface BuildAnswer {
  template?: { id: string; params: Record<string, Qty> }
  task?: { domain: string; givens: Array<Qty & { ref: string; raw?: string }>; targets: Array<{ key: string; condition?: Qty; t?: Qty }>; assumptions?: string[]; options?: Record<string, string> }
  model?: { id: string; inputs: Record<string, Qty>; outputs?: string[] }
  scene?: SceneSpec
  equations?: { knowns?: unknown[]; unknowns?: unknown[]; equations?: unknown[]; asks?: unknown[] }
  questions?: QuestionAnswer[]
  duration?: number
  assumptions?: string[]
  clarifications?: Array<{ question: string; options: string[] }>
}

const str = (v: unknown, max = 400): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function qty(v: unknown): Qty | null {
  if (typeof v === 'number' && Number.isFinite(v)) return { value: v, unit: '' }
  if (!isObj(v)) return null
  const value = typeof v.value === 'string' ? Number(v.value) : v.value
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return { value, unit: typeof v.unit === 'string' ? v.unit : '' }
}

/** Check the first answer; the route's id must exist. */
export function checkRoute(raw: unknown): { ok: true; value: RouteAnswer } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!isObj(raw)) return { ok: false, errors: ['the answer must be one JSON object'] }
  const route = raw.route as Route
  if (!ROUTES.includes(route)) errors.push(`route must be one of ${ROUTES.join(', ')}`)
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : null
  if (route === 'example' && !BUILTIN_PROBLEMS.some(p => p.id === id)) errors.push(`id "${id}" is not a built-in problem id`)
  if (route === 'template' && !templateById(id ?? '')) errors.push(`id "${id}" is not a template id`)
  if (route === 'task' && !(id && id in DOMAINS)) errors.push(`id "${id}" is not a task domain (${Object.keys(DOMAINS).join(', ')})`)
  if (route === 'model' && !modelById(id ?? '')) errors.push(`id "${id}" is not an analytic model id`)
  const objects: Partial<Structure> = {}
  if (isObj(raw.objects)) for (const k of STRUCTURE_KEYS) { const v = Number(raw.objects[k]); if (Number.isFinite(v) && v >= 0) objects[k] = Math.round(v) }
  const process: Process = (PROCESSES as readonly string[]).includes(raw.process as string) ? (raw.process as Process) : 'other'
  // A template (or an example's template) must hold every object of the problem (26.59 fix, D191)
  if ((route === 'example' || route === 'template') && !errors.length) {
    const tid = route === 'example' ? BUILTIN_PROBLEMS.find(p => p.id === id)?.template ?? '' : id ?? ''
    const st = templateStructure(tid)
    const short = st ? STRUCTURE_KEYS.filter(k => (objects[k] ?? 0) > st[k]) : []
    if (st && short.length) {
      errors.push(`${route} "${id}" cannot hold this problem: the problem has ${short.map(k => `${objects[k]} ${k}`).join(', ')}, the template has ${short.map(k => `${st[k]} ${k}`).join(', ')} (${structureText(st)}). Choose a template whose structure contains every object of the problem, or route "scene" for a motion to simulate, or route "equations" for statics and other algebraic problems.`)
    }
  }
  const cat = isObj(raw.category) ? raw.category : {}
  const chapter = str(cat.chapter, 40)
  const category: Category = {
    chapter: chapterIds().includes(chapter) ? chapter : '',
    types: Array.isArray(cat.types) ? (cat.types as unknown[]).filter((t): t is string => typeof t === 'string' && CATEGORY_TYPES.includes(t)).slice(0, 4) : [],
    level: (LEVELS as readonly string[]).includes(cat.level as string) ? (cat.level as Category['level']) : '',
    stage: (STAGES as readonly string[]).includes(cat.stage as string) ? (cat.stage as Category['stage']) : ''
  }
  const givens: GivenRead[] = Array.isArray(raw.givens) ? (raw.givens as unknown[]).flatMap(g => {
    if (!isObj(g)) return []
    const q = qty(g)
    return q ? [{ name: str(g.name, 40), symbol: str(g.symbol, 12) || undefined, value: q.value, unit: q.unit, raw: str(g.raw, 60) || undefined }] : []
  }).slice(0, 30) : []
  if (errors.length) return { ok: false, errors }
  const lang = raw.language === 'en' || raw.language === 'de' ? raw.language : 'zh'
  return {
    ok: true,
    value: {
      language: lang, summary: str(raw.summary, 300), category, route, id: route === 'scene' || route === 'equations' || route === 'unsupported' ? null : id,
      alternatives: Array.isArray(raw.alternatives) ? (raw.alternatives as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 4) : [],
      givens, asks: Array.isArray(raw.asks) ? (raw.asks as unknown[]).filter((x): x is string => typeof x === 'string').map(x => x.slice(0, 200)).slice(0, 8) : [],
      reason: str(raw.reason, 300), process, objects
    }
  }
}

/** Readable quantity ids of a scene (canonical) with their SI units. */
export function readableQuantities(scene: Scene): Map<string, string> {
  const out = new Map<string, string>()
  let s: EngineSession | null = null
  try {
    s = EngineSession.create(scene)
    for (const q of listQuantities(s)) out.set(q.id, q.unit)
  } finally { s?.free() }
  return out
}

/** Check one question target against the readable quantities and bodies of a scene. */
export function checkTarget(t: unknown, quantities: Map<string, string>, bodies: Set<string>, where: string): { target: ProblemTarget | null; errors: string[] } {
  const errors: string[] = []
  if (!isObj(t)) return { target: null, errors: [`${where}.target must be an object`] }
  const kind = t.kind
  const qid = (key = 'id'): string | null => {
    const id = typeof t[key] === 'string' ? canonicalQuantityId(t[key] as string) : ''
    if (!quantities.has(id)) { errors.push(`${where}.target.${key} "${t[key]}" is not a readable quantity id of this scene`); return null }
    return id
  }
  const ev = (): string | null => {
    const e = t.event as string
    if (!(e in EVENTS)) { errors.push(`${where}.target.event "${e}" must be one of ${Object.keys(EVENTS).join(', ')}`); return null }
    return e
  }
  const body = (): string | null => {
    if (t.body === undefined || t.body === null || t.body === '') return null
    if (typeof t.body !== 'string' || !bodies.has(t.body)) { errors.push(`${where}.target.body "${t.body}" is not a body id`); return null }
    return t.body
  }
  let target: ProblemTarget | null = null
  switch (kind) {
    case 'quantity': {
      const id = qid(); const tt = typeof t.t === 'number' ? t.t : Number(t.t)
      if (!Number.isFinite(tt) || tt < 0) errors.push(`${where}.target.t must be a time ≥ 0 (s)`)
      if (id && Number.isFinite(tt) && tt >= 0) target = { kind: 'quantity', id, t: tt }
      break
    }
    case 'atEvent': {
      const id = qid(), e = ev(), b = body()
      const side = t.side === 'after' ? 'after' : t.side === 'before' ? 'before' : null
      if (!side) errors.push(`${where}.target.side must be before or after`)
      if (id && e && side) target = { kind: 'atEvent', id, event: e as never, side, body: b }
      break
    }
    case 'event': {
      const e = ev(), b = body()
      if (e) target = { kind: 'event', event: e as never, body: b }
      break
    }
    case 'end': { const id = qid(); if (id) target = { kind: 'end', id }; break }
    case 'extreme': {
      const id = qid(); const which = t.which === 'min' ? 'min' : t.which === 'max' ? 'max' : null
      if (!which) errors.push(`${where}.target.which must be max or min`)
      if (id && which) target = { kind: 'extreme', id, which }
      break
    }
    default: errors.push(`${where}.target.kind must be quantity, atEvent, event, end or extreme`)
  }
  return { target: errors.length ? null : target, errors }
}

export interface CheckedQuestion { prompt: string; target: ProblemTarget; unit?: string }

function checkQuestions(raw: unknown, scene: Scene): { questions: CheckedQuestion[]; errors: string[] } {
  const errors: string[] = []
  if (!Array.isArray(raw) || !raw.length) return { questions: [], errors: ['questions must list at least one question (one per thing the problem asks)'] }
  const quantities = readableQuantities(scene)
  const bodies = new Set(scene.bodies.map(b => b.id))
  const questions: CheckedQuestion[] = []
  raw.slice(0, 8).forEach((q, i) => {
    const w = `questions[${i}]`
    if (!isObj(q)) { errors.push(`${w} must be an object`); return }
    const prompt = str(q.prompt, 300)
    if (!prompt) errors.push(`${w}.prompt is empty`)
    const r = checkTarget(q.target, quantities, bodies, w)
    errors.push(...r.errors)
    if (r.target && prompt) questions.push({ prompt, target: r.target, unit: str(q.unit, 20) || undefined })
  })
  return { questions, errors }
}

/** A checked template build. */
export interface TemplateBuild { kind: 'template'; id: string; values: Record<string, number>; outOfRange: string[]; scene: Scene; questions: CheckedQuestion[]; duration: number }
export interface TaskBuild { kind: 'task'; domain: TaskDomain; givens: Array<{ ref: string; valueSI: number; unit: string; raw?: string }>; targets: Array<{ key: string; conditionSI?: number; tSI?: number }>; assumptions: string[]; options: Record<string, string> }
export interface ModelBuild { kind: 'model'; id: string; inputs: Record<string, number>; outputs: string[] }
export interface SceneBuild { kind: 'scene'; scene: Scene; questions: CheckedQuestion[]; duration: number }
/** An equation model (D188) with its solution. */
export interface EquationsBuild {
  kind: 'equations'
  model: EqModel
  result: EqResult
  /** Display rows: knowns with their written values, unknowns, equations as LaTeX with the reason. */
  knowns: Array<{ name: string; value: number; unit: string; meaning: string }>
  unknowns: Array<{ name: string; unit: string; meaning: string; value: number | null }>
  equations: Array<{ latex: string; why: string }>
}
export type Build = TemplateBuild | TaskBuild | ModelBuild | SceneBuild | EquationsBuild

function durationFor(raw: unknown, fallback: number, questions: CheckedQuestion[]): number {
  let d = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.min(600, raw) : fallback
  for (const q of questions) if (q.target.kind === 'quantity') d = Math.max(d, q.target.t + 0.5)
  return d
}

/** Check the second answer for a route (example and template share the template check). */
export function checkBuild(route: Route, id: string | null, raw: unknown): { ok: true; value: Build } | { ok: false; errors: string[] } {
  if (!isObj(raw)) return { ok: false, errors: ['the answer must be one JSON object'] }
  const errors: string[] = []
  if (route === 'example' || route === 'template') {
    const tid = route === 'example' ? BUILTIN_PROBLEMS.find(p => p.id === id)?.template ?? '' : (isObj(raw.template) && typeof raw.template.id === 'string' ? raw.template.id : id ?? '')
    const t = templateById(tid)
    if (!t) return { ok: false, errors: [`template.id "${tid}" is not a template id`] }
    const params = isObj(raw.template) && isObj(raw.template.params) ? raw.template.params : {}
    const values: Record<string, number> = {}
    const outOfRange: string[] = []
    for (const [k, v] of Object.entries(params)) {
      const p = t.params.find(x => x.key === k)
      if (!p) { errors.push(`template.params.${k} is not a parameter of ${t.id} (${t.params.map(x => x.key).join(', ')})`); continue }
      const q = qty(v)
      if (!q) { errors.push(`template.params.${k} must be {"value": number, "unit": "…"}`); continue }
      const c = toParamUnit(q.unit ? q : { value: q.value, unit: p.unit }, p.unit)
      if ('error' in c) { errors.push(`template.params.${k}: ${c.error}`); continue }
      values[k] = c.value
      if ((p.min !== undefined && c.value < p.min) || (p.max !== undefined && c.value > p.max)) outOfRange.push(`${k}=${c.value}${p.unit}`)
    }
    if (errors.length) return { ok: false, errors }
    let scene: Scene
    try { scene = buildTemplate(t.id, values) } catch (e) { return { ok: false, errors: [`template ${t.id} could not be built with these values: ${(e as Error).message}`] } }
    const qs = checkQuestions(raw.questions, scene)
    if (qs.errors.length) return { ok: false, errors: qs.errors }
    return { ok: true, value: { kind: 'template', id: t.id, values, outOfRange, scene, questions: qs.questions, duration: durationFor(raw.duration, scene.settings.legacyDuration, qs.questions) } }
  }
  if (route === 'task') {
    const task = isObj(raw.task) ? raw.task : null
    const domain = (task && typeof task.domain === 'string' ? task.domain : id ?? '') as TaskDomain
    const d = DOMAINS[domain]
    if (!task || !d) return { ok: false, errors: [`task.domain must be one of ${Object.keys(DOMAINS).join(', ')}`] }
    const givens: TaskBuild['givens'] = []
    for (const [i, g] of (Array.isArray(task.givens) ? task.givens : []).entries()) {
      if (!isObj(g)) { errors.push(`task.givens[${i}] must be an object`); continue }
      const spec = givenSpec(domain, String(g.ref))
      if (!spec) { errors.push(`task.givens[${i}].ref "${g.ref}" is not a known value of ${domain} (${d.givens.map(x => x.ref).join(', ')})`); continue }
      const q = qty(g)
      if (!q) { errors.push(`task.givens[${i}] needs value and unit`); continue }
      const c = toSIOf(q.unit ? q : { value: q.value, unit: spec.unit }, spec.unit)
      if ('error' in c) { errors.push(`task.givens[${i}] (${spec.ref}): ${c.error}`); continue }
      givens.push({ ref: spec.ref, valueSI: c.value, unit: spec.unit, raw: str(g.raw, 60) || undefined })
    }
    const targets: TaskBuild['targets'] = []
    for (const [i, tg] of (Array.isArray(task.targets) ? task.targets : []).entries()) {
      if (!isObj(tg)) { errors.push(`task.targets[${i}] must be an object`); continue }
      const spec = targetSpec(domain, String(tg.key))
      if (!spec) { errors.push(`task.targets[${i}].key "${tg.key}" is not a target of ${domain} (${d.targets.map(x => x.key).join(', ')})`); continue }
      const out: TaskBuild['targets'][number] = { key: spec.key }
      if (spec.at === 'condition') {
        const q = qty(tg.condition)
        const c = q ? toSIOf(q.unit ? q : { value: q.value, unit: spec.condition?.unit ?? '' }, spec.condition?.unit ?? '') : null
        if (!c || 'error' in c) { errors.push(`task.targets[${i}] (${spec.key}) needs condition {value, unit}: ${spec.condition?.label ?? ''}`); continue }
        out.conditionSI = c.value
      }
      if (spec.at === 'time') {
        const q = qty(tg.t)
        const c = q ? toSIOf(q.unit ? q : { value: q.value, unit: 's' }, 's') : null
        if (!c || 'error' in c || c.value < 0) { errors.push(`task.targets[${i}] (${spec.key}) needs t {value, unit} ≥ 0`); continue }
        out.tSI = c.value
      }
      targets.push(out)
    }
    if (!targets.length && !errors.length) errors.push('task.targets must name at least one target key')
    const assumptions = (Array.isArray(task.assumptions) ? task.assumptions : []).filter((a): a is string => typeof a === 'string')
    for (const a of assumptions) if (!(a in ASSUMPTIONS)) errors.push(`task.assumptions "${a}" is not an assumption id`)
    const options: Record<string, string> = {}
    if (isObj(task.options)) for (const [k, v] of Object.entries(task.options)) {
      const o = d.options?.[k]
      if (!o || typeof v !== 'string' || !(v in o.choices)) { errors.push(`task.options.${k} = "${v}" is not a valid option`); continue }
      options[k] = v
    }
    if (errors.length) return { ok: false, errors }
    return { ok: true, value: { kind: 'task', domain, givens, targets, assumptions: assumptions.filter(a => a in ASSUMPTIONS), options } }
  }
  if (route === 'model') {
    const m = isObj(raw.model) ? raw.model : null
    const spec = modelById(m && typeof m.id === 'string' ? m.id : id ?? '')
    if (!m || !spec) return { ok: false, errors: [`model.id must be an analytic model id`] }
    const inputs: Record<string, number> = {}
    for (const [k, v] of Object.entries(isObj(m.inputs) ? m.inputs : {})) {
      const inp = spec.inputs.find(i => i.id === k)
      if (!inp) { errors.push(`model.inputs.${k} is not an input of ${spec.id} (${spec.inputs.map(i => i.id).join(', ')})`); continue }
      const q = qty(v)
      if (!q) { errors.push(`model.inputs.${k} must be {value, unit}`); continue }
      const c = toSIOf(q.unit ? q : { value: q.value, unit: inp.unit }, inp.unit)
      if ('error' in c) { errors.push(`model.inputs.${k}: ${c.error}`); continue }
      inputs[k] = c.value
    }
    const outs = new Set(spec.outputs.map(o => o.id))
    const outputs = (Array.isArray(m.outputs) ? m.outputs : []).filter((o): o is string => typeof o === 'string')
    for (const o of outputs) if (!outs.has(o)) errors.push(`model.outputs "${o}" is not an output of ${spec.id}`)
    if (errors.length) return { ok: false, errors }
    return { ok: true, value: { kind: 'model', id: spec.id, inputs, outputs: outputs.length ? outputs : [...outs] } }
  }
  if (route === 'scene') {
    let scene: Scene
    try { scene = compileSceneSpec(raw.scene as SceneSpec) } catch (e) {
      return { ok: false, errors: e instanceof SpecError ? e.problems.map(p => `scene: ${p}`) : [`scene: ${(e as Error).message}`] }
    }
    const qs = checkQuestions(raw.questions, scene)
    if (qs.errors.length) return { ok: false, errors: qs.errors }
    return { ok: true, value: { kind: 'scene', scene, questions: qs.questions, duration: durationFor(raw.duration ?? (raw.scene as SceneSpec)?.duration, scene.settings.duration ?? 5, qs.questions) } }
  }
  if (route === 'equations') return checkEquations(raw.equations)
  return { ok: false, errors: [`route ${route} cannot be built`] }
}

/** Check and solve an equation model (D188). The verdict (solved, inconsistent, underdetermined) is part of the build. */
function checkEquations(raw: unknown): { ok: true; value: EquationsBuild } | { ok: false; errors: string[] } {
  if (!isObj(raw)) return { ok: false, errors: ['equations must be an object with knowns, unknowns, equations and asks'] }
  const errors: string[] = []
  const list = (v: unknown, name: string): Record<string, unknown>[] => {
    if (v === undefined) return []
    if (!Array.isArray(v)) { errors.push(`equations.${name} must be an array`); return [] }
    return v.filter((x, i) => (isObj(x) ? true : (errors.push(`equations.${name}[${i}] must be an object`), false))) as Record<string, unknown>[]
  }
  const knownsRaw = list(raw.knowns, 'knowns'), unknownsRaw = list(raw.unknowns, 'unknowns'), eqRaw = list(raw.equations, 'equations'), asksRaw = list(raw.asks, 'asks')
  const model: EqModel = { knowns: [], unknowns: [], equations: [], asks: [] }
  const shown: EquationsBuild['knowns'] = []
  knownsRaw.forEach((k, i) => {
    const q = qty(k)
    const name = str(k.name, 24)
    if (!q) { errors.push(`equations.knowns[${i}] needs value and unit`); return }
    const si = q.unit ? qtyToSI(q) : q.value
    if (si === null) { errors.push(`equations.knowns[${i}] (${name}): unknown unit "${q.unit}"`); return }
    model.knowns.push({ name, value: si, unit: siUnitOf(q.unit) || normalizeUnit(q.unit), meaning: str(k.meaning, 80) })
    shown.push({ name, value: q.value, unit: q.unit, meaning: str(k.meaning, 80) })
  })
  unknownsRaw.forEach(u => {
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
    model.unknowns.push({ name: str(u.name, 24), unit: normalizeUnit(str(u.unit, 16)), meaning: str(u.meaning, 80), guess: n(u.guess), min: n(u.min), max: n(u.max) })
  })
  eqRaw.forEach((e, i) => {
    const text = str(e.eq ?? e.equation, 300)
    try { model.equations.push({ text, why: str(e.why, 160), ...parseEquation(text) }) } catch (x) { errors.push(`equations.equations[${i}] "${text}": ${(x as Error).message}`) }
  })
  asksRaw.forEach((a, i) => {
    const expr = str(a.expr, 200)
    try { model.asks.push({ prompt: str(a.prompt, 200) || expr, expr, node: parseExpr(expr, { constants: EQ_CONSTANTS }), unit: str(a.unit, 16) }) } catch (x) { errors.push(`equations.asks[${i}].expr "${expr}": ${(x as Error).message}`) }
  })
  if (errors.length) return { ok: false, errors }
  try { checkModel(model) } catch (x) { return { ok: false, errors: x instanceof EqError ? x.problems.map(p => `equations: ${p}`) : [(x as Error).message] } }
  let result: EqResult
  try { result = solveEquations(model) } catch (x) { return { ok: false, errors: [`equations could not be evaluated: ${x instanceof ExprError ? x.message : (x as Error).message}`] } }
  // Values in the asked unit (the solver works in SI)
  result.answers = result.answers.map(a => {
    if (a.value === null || !a.unit) return a
    const si = siUnitOf(a.unit)
    if (!si || si === normalizeUnit(a.unit)) return a
    const c = toParamUnit({ value: a.value, unit: si }, normalizeUnit(a.unit))
    return 'error' in c ? a : { ...a, value: c.value }
  })
  if (result.verdict === 'inconsistent') result.answers = result.answers.map(a => ({ ...a, value: null }))
  const determined = new Set(model.unknowns.map(u => u.name).filter(n => !result.undetermined.includes(n)))
  return {
    ok: true,
    value: {
      kind: 'equations', model, result, knowns: shown,
      unknowns: model.unknowns.map(u => ({ name: u.name, unit: u.unit, meaning: u.meaning ?? '', value: result.verdict !== 'inconsistent' && determined.has(u.name) ? result.values[u.name] : null })),
      equations: model.equations.map(e => ({ latex: equationLatex(e), why: e.why ?? '' }))
    }
  }
}

/** Free-text extras of the second answer. */
export function extrasOf(raw: unknown): { assumptions: string[]; clarifications: Array<{ question: string; options: string[] }>; solution: string[]; conclusion: string } {
  if (!isObj(raw)) return { assumptions: [], clarifications: [], solution: [], conclusion: '' }
  const assumptions = (Array.isArray(raw.assumptions) ? raw.assumptions : []).filter((a): a is string => typeof a === 'string').map(a => a.slice(0, 200)).slice(0, 8)
  const clarifications = (Array.isArray(raw.clarifications) ? raw.clarifications : []).flatMap(c => {
    if (!isObj(c) || typeof c.question !== 'string') return []
    const options = (Array.isArray(c.options) ? c.options : []).filter((o): o is string => typeof o === 'string').map(o => o.slice(0, 120)).slice(0, 4)
    return options.length >= 2 ? [{ question: c.question.slice(0, 200), options }] : []
  }).slice(0, 3)
  // 26.59 fix: the solution path in a few steps ({1}, {2} … stand for the computed answers) and, for an equation
  // model that has no solution, what that means physically
  const solution = (Array.isArray(raw.solution) ? raw.solution : typeof raw.solution === 'string' ? [raw.solution] : []).filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim().slice(0, 400)).slice(0, 8)
  return { assumptions, clarifications, solution, conclusion: str(raw.conclusion, 600) }
}

/** Every template id (tests). */
export function templateIds(): string[] { return TEMPLATES.map(t => t.id) }
