/**
 * Copilot's tools (26.59, D168; manual §7): what the AI may read and do in the app. Three levels — read (always),
 * change (direct or asked first, per the setting; undoable), confirm (always asked). Every tool checks its arguments
 * and either does all of its work or none; the results are short JSON the model reads back.
 */
import { curriculumIfLoaded, loadCurriculum, TOPIC_LINKS } from '../../curriculum'
import type { JsonSchema, ToolDef } from '../types'
import { tl } from '../../i18n'
import { state, play, pause, rewind, seekTime, loadScene } from '../../app/store'
import { settings } from '../../app/settings'
import { BUILTIN_PROBLEMS, builtinById } from '../../teaching/problemBank'
import { CHAPTERS, evaluateProblemTarget, ptext } from '../../teaching/problems'
import type { ProblemTarget } from '../../teaching/problems'
import type { Recording } from '../../engine/recording'
import { openBuiltin, reveal } from '../../app/problemMode'
import { TEMPLATES, templateById, buildTemplate } from '../../templates'
import { MODELS, modelById } from '../../content/models'
import { tryEval } from '../../app/models/run'
import { LABS } from '../../app/lab/catalog'
import { openLab } from '../../app/learn/actions'
import { TOPICS } from '../../handbook/topics'
import { openHandbook } from '../../app/handbook'
import { currentResults, taskUi } from '../../app/task/taskState'
import { DOMAINS, targetSpec } from '../../task/vocab'
import { listQuantities, canonicalQuantityId } from '../../engine/observe'
import { currentTemplate, applyTemplateParams } from '../../app/templateParams'
import { importProblem } from '../import/pipeline'
import { solutionSteps, waitForAnswers } from '../import/answers'
import { EVENTS } from '../import/catalog'
import { compileSceneSpec, SpecError } from '../import/sceneSpec'
import type { SceneSpec } from '../import/sceneSpec'
import { addConnector, anchor } from '../../core/scene/build'
import type { ForceDef } from '../../core/scene/types'
import { pointTo, uiTargets } from '../../app/spotlight'
import { ask } from '../../platform/ask'
import { activeLang } from '../../i18n'
import { myProblems, getMyProblem } from '../../teaching/myProblems'
import { openProblem } from '../../app/problemMode'
import { CATEGORY_TYPES } from '../import/catalog'
import { META } from '../../teaching/problemMeta'

export type ToolLevel = 'read' | 'change' | 'confirm'

export class ToolError extends Error {}

export interface Tool {
  name: string
  description: string
  parameters: JsonSchema
  level: ToolLevel
  /** One line for the action chip ("载入模板 斜面滑块"). */
  label: (args: Record<string, unknown>) => string
  /** Argument checks that run before the user is asked (a wrong call is never put to the user). */
  check?: (args: Record<string, unknown>) => void
  run: (args: Record<string, unknown>) => Promise<unknown> | unknown
}

const S = (description: string, extra: Partial<JsonSchema> = {}): JsonSchema => ({ type: 'string', description, ...extra })
const N = (description: string, extra: Partial<JsonSchema> = {}): JsonSchema => ({ type: 'number', description, ...extra })
const obj = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false })
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const lang = () => activeLang()
const round = (v: number | null | undefined, d = 6) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toPrecision(d)))

/** The app now, as the model sees it. */
export function appState() {
  const t = currentTemplate()
  const p = state.problem
  const task = taskUi.task
  return {
    page: state.page,
    rightTab: state.rightTab,
    bottomTab: state.bottomTab,
    scene: {
      name: state.scene.name,
      template: t ? { id: t.info.id, name: t.info.name, values: t.values } : null,
      ai: (state.scene.extra as { ai?: { route?: string; summary?: string } } | undefined)?.ai ? { route: (state.scene.extra as { ai: { route?: string } }).ai.route } : null,
      bodies: state.scene.bodies.filter(b => b.kind !== 'static').length,
      unsavedChanges: state.dirty
    },
    run: { computing: state.computing, computedTo: round(state.run.tComputed, 4), unbounded: state.run.unbounded, playing: state.playing, time: round(state.time, 4), speed: state.speed, events: state.recording?.events.length ?? 0 },
    selection: state.selection,
    problem: p ? { title: ptext(p.problem.title, lang()), questions: p.problem.questions.length, revealed: p.revealed, answered: Object.values(p.answers).filter(v => v !== null && v !== undefined).length } : null,
    task: task ? { domain: task.domain, state: taskUi.state, targets: task.targets.map(x => x.id) } : null,
    model: state.showModels ? state.modelId : null,
    copilotMode: settings.ai.copilotMode,
    learningMode: settings.ai.learningMode
  }
}

/** Bodies, connections, forces and fields of the scene, briefly. */
export function sceneSummary() {
  const s = state.scene
  const g = Math.hypot(s.settings.gravity.x, s.settings.gravity.y)
  return {
    gravity: round(g, 6),
    duration: s.settings.duration,
    bodies: s.bodies.slice(0, 30).map(b => ({
      id: b.id, name: b.name, kind: b.kind, shape: b.shape.type, mass: b.kind === 'static' ? undefined : round(b.mass),
      position: [round(b.position.x, 4), round(b.position.y, 4)], velocity: b.kind === 'static' ? undefined : [round(b.velocity.x, 4), round(b.velocity.y, 4)],
      muS: round(b.material.muS, 4), muK: round(b.material.muK, 4), e: round(b.material.restitution, 4), charge: b.charge || undefined
    })),
    more: s.bodies.length > 30 ? s.bodies.length - 30 : undefined,
    connectors: s.connectors.slice(0, 20).map(c => ({ id: c.id, type: c.type, a: c.a.body, b: 'b' in c ? (c as { b: { body: string | null } }).b.body : undefined })),
    fields: { electric: s.settings.electric?.E ?? null, magnetic: s.settings.magnetic?.B ?? null, regions: s.settings.regions?.length ?? 0 },
    template: currentTemplate()?.info.id ?? null
  }
}

/**
 * 26.61 (R2, C): the recording a reading tool may use — the one of the scene as it is now. While the scene was changed
 * and the new run has not delivered yet, wait up to `ms`; an out-of-date recording is never read (it belongs to
 * another scene or another version of this one).
 */
export async function freshRecording(ms = 8000): Promise<Recording> {
  // Learning mode: what the app hides from the student is not read out by the Copilot either (the app decides)
  const p = state.problem
  if (settings.ai.learningMode && p && !p.revealed && !p.editing) throw new ToolError('learning mode: the results of this problem stay hidden until the student has answered and revealed them; guide the student instead')
  const t0 = Date.now()
  for (;;) {
    const rec = state.recording
    if (rec && !state.stale) return rec
    if (!state.computing && !state.stale && !rec) throw new ToolError('no simulation result yet (the scene has not been computed)')
    if (Date.now() - t0 >= ms) throw new ToolError(state.stale ? 'the results are out of date: the scene was changed and the new run has not delivered yet (read again shortly)' : 'no simulation result yet (the scene has not been computed)')
    await new Promise(r => setTimeout(r, 150))
  }
}

/** Where a reading comes from (26.61, C): the run, the scene and the solver — the panel marks it stale when they change. */
export function evidence(rec: Recording) {
  return { run: state.runId ?? 0, scene: rec.scene.name, solver: rec.scene.settings.integrator ?? 'auto', complete: rec.completed !== false, computedTo: round((rec.frameCount - 1) * rec.dt, 4) }
}

function evalTarget(target: ProblemTarget, rec: Recording | null = state.stale ? null : state.recording) {
  if (!rec) throw new ToolError('no up-to-date simulation result (the scene has not been computed since it changed)')
  const v = evaluateProblemTarget(rec, state.situations, target)
  return { value: round(v.sim), unit: v.unit, formula: round(v.formula), note: v.simNote ?? v.formulaNote ?? undefined }
}

/** Results now: problem answers, task results with checks, formula cards. */
export function readResults() {
  const out: Record<string, unknown> = {}
  const p = state.problem
  if (p) {
    if (settings.ai.learningMode && !p.revealed) out.problem = { note: 'learning mode: the answers stay hidden until the student has answered and revealed them' }
    else out.problem = p.problem.questions.map(q => (q.type === 'numeric' ? { question: ptext(q.prompt, lang()), ...safe(() => evalTarget(q.target)) } : { question: ptext(q.prompt, lang()), type: 'choice' }))
  }
  if (taskUi.task) {
    out.task = currentResults().map(r => ({
      target: tl(targetSpec(taskUi.task!.domain, r.targetId.split('#')[0])?.label ?? r.targetId), value: round(r.value?.scalarSI), unit: r.value?.unit, text: r.value?.text,
      computation: r.computation, checks: r.checks.map(c => ({ kind: c.kind, pass: c.pass })), reason: r.reason
    }))
  }
  out.formulas = state.stale ? [] : state.situations.slice(0, 6).map(s => ({ situation: s.title, t: [round(s.t0, 4), round(s.t1, 4)] }))
  if (state.recording && !state.stale) out.evidence = evidence(state.recording)
  else if (p || state.recording) out.note = 'the simulation results are out of date or still computing; read again shortly'
  return out
}

function safe<T>(f: () => T): T | { error: string } { try { return f() } catch (e) { return { error: (e as Error).message } } }

/** Search the catalogues (examples, my problems, templates, models, labs, handbook). */
export function searchCatalog(query: string, kind?: string, limit = 8) {
  const q = query.toLowerCase().replace(/[\s‐‑‒–—−]+/g, '')
  const grams = (s: string) => { const g = new Set<string>(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g }
  const qg = grams(q)
  const score = (hay: string) => {
    const h = hay.toLowerCase().replace(/[\s‐‑‒–—−]+/g, '')
    if (!q) return 0
    if (h.includes(q)) return 100 + q.length
    let n = 0
    for (const g of qg) if (h.includes(g)) n++
    return qg.size ? (100 * n) / qg.size / 2 : 0
  }
  const items: Array<{ kind: string; id: string; title: string; detail?: string; s: number }> = []
  const add = (k: string, id: string, title: string, hay: string, detail?: string) => { if (kind && kind !== k) return; const s = score(`${title} ${hay}`); if (s > 20) items.push({ kind: k, id, title, detail, s }) }
  for (const p of BUILTIN_PROBLEMS) { const m = META[p.id]; add('example', p.id, ptext(p.title, lang()), `${ptext(p.stem, lang())} ${p.chapter} ${m?.types.join(' ') ?? ''}`, tl(CHAPTERS.find(c => c.id === p.chapter)?.label.zh ?? '')) }
  for (const m of myProblems.list) add('my', m.id, m.title, `${m.chapter} ${m.types.join(' ')}`)
  for (const t of TEMPLATES) add('template', t.id, t.name, `${t.group} ${t.description} ${t.id}`, t.group)
  for (const m of MODELS) add('model', m.id, m.title.zh, `${m.id} ${m.point.zh}`)
  for (const l of LABS) if (!l.planned) add('lab', l.id, l.title, l.summary)
  for (const t of TOPICS) add('handbook', t.id, ptext(t.title, lang()), t.principle.map(x => ptext(x, lang())).join(' ').slice(0, 300))
  // 26.62 (D222): curriculum topics (once the curriculum map is loaded); the detail lists what opens them
  const cur = curriculumIfLoaded()
  if (cur) for (const t of cur.topics) add('curriculum', t.id, cur.tr(t.name, lang()), `${t.name} ${cur.tr(t.name, 'en')} ${t.scene} ${t.equation} ${t.solver}`, `${t.coverage}: ${TOPIC_LINKS[t.id]}`)
  return items.sort((a, b) => b.s - a.s).slice(0, limit).map(({ s: _s, ...x }) => x)
}

export async function confirmReplace(): Promise<void> {
  if (state.dirty && !(await ask(tl('Copilot 要替换当前场景，当前场景有未保存的修改。继续吗？')))) throw new ToolError('the user kept the current scene (unsaved changes)')
}

function numbersOf(v: unknown, where: string): Record<string, number> {
  if (v === undefined || v === null) return {}
  if (typeof v !== 'object' || Array.isArray(v)) throw new ToolError(`${where} must be an object of numbers`)
  const out: Record<string, number> = {}
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const n = typeof x === 'string' ? Number(x) : x
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new ToolError(`${where}.${k} must be a number`)
    out[k] = n
  }
  return out
}

/**
 * Every force on one body at one moment (26.59 fix, D181): gravity, the normal force and friction of each contact,
 * rope tension, spring force, applied forces, Coulomb force — the readable quantities in newtons that belong to the
 * body, with their names, read from the simulation like read_quantity.
 */
export async function readForces(bodyId: string, when: { t?: number; event?: string; side?: 'before' | 'after' }) {
  const rec = await freshRecording()
  const body = state.scene.bodies.find(b => b.id === bodyId)
  if (!body) throw new ToolError(`no body ${bodyId}; bodies: ${state.scene.bodies.map(b => b.id).join(', ')}`)
  const attached = new Set(state.scene.connectors.filter(c => c.a.body === bodyId || ('b' in c && (c as { b?: { body: string | null } }).b?.body === bodyId)).map(c => c.id))
  const qs = listQuantities(rec).filter(q => q.unit === 'N' && !/\.(fx|fy|Fx|Fy)$/.test(q.id) && (q.id.startsWith(`contact.${bodyId}|`) || q.id.startsWith(`${bodyId}.`) || attached.has(q.id.split('.')[0])))
  const at = (id: string): ProblemTarget => (when.event ? { kind: 'atEvent', id, event: when.event as never, side: when.side === 'after' ? 'after' : 'before', body: bodyId } : { kind: 'quantity', id, t: when.t ?? state.time })
  const forces: Array<{ id: string; name: string; value: number | null; unit: string }> = []
  const g = Math.hypot(state.scene.settings.gravity.x, state.scene.settings.gravity.y)
  if (body.kind !== 'static' && g > 0) forces.push({ id: 'gravity', name: tl('重力 G = mg'), value: round(body.mass * g), unit: 'N' })
  for (const q of qs) {
    const v = safe(() => evalTarget(at(q.id), rec))
    forces.push({ id: q.id, name: q.label, value: 'value' in v ? v.value : null, unit: 'N' })
  }
  return { body: bodyId, at: when.event ? `${when.side ?? 'before'} ${when.event}` : `t = ${round(when.t ?? state.time, 4)} s`, forces, note: 'computed by the engine from the scene (contacts, ropes, springs, fields); a contact force of 0 means no contact at that moment', evidence: evidence(rec) }
}

const SHOW_TARGETS = ['studio', 'lab', 'monitor', 'settings', 'settings-ai', 'task', 'problem', 'formulas', 'watch', 'predict', 'inspector', 'scene-settings', 'curves', 'events', 'templates', 'problems', 'models', 'learning', 'fbd', 'handbook'] as const

export const TOOLS: Tool[] = [
  {
    name: 'get_app_state', level: 'read', label: () => tl('查看软件状态'),
    description: 'Current page, panels, scene (template and its parameters), run and playback state, selection, open problem or task. Call this before acting when unsure.',
    parameters: obj({}), run: () => appState()
  },
  {
    name: 'get_scene_summary', level: 'read', label: () => tl('查看场景'),
    description: 'Bodies (id, mass, position, velocity, friction), connectors, gravity, fields of the current scene.',
    parameters: obj({}), run: () => sceneSummary()
  },
  {
    name: 'read_results', level: 'read', label: () => tl('读取结果'),
    description: 'Computed results now: the open problem\'s answers from the simulation (with the formula value), the task results with their independent checks, the recognised situations. Use these numbers; never invent numbers.',
    parameters: obj({}), run: async () => { if (state.problem || state.recording) await freshRecording().catch(() => null); return readResults() }
  },
  {
    name: 'read_quantity', level: 'read', label: a => tl('读取 {0}', [str(a.id) || str(a.event)]),
    description: 'Read one quantity from the simulation: at time t, just before/after the first event of a kind, the time of an event, the end value, or the max/min over the run. Quantity ids: <body>.x .y .vx .vy .v .ax .ay .a .ek .angle .omega, contact.<a>|<b>.N .f, <rope>.T, system.*. Use list_quantities to see them.',
    parameters: obj({ kind: S('quantity | atEvent | event | end | extreme', { enum: ['quantity', 'atEvent', 'event', 'end', 'extreme'] }), id: S('quantity id'), t: N('time (s) for kind quantity'), event: S(`event: ${Object.keys(EVENTS).join(', ')}`), side: S('before | after', { enum: ['before', 'after'] }), body: S('body id taking part in the event (optional)'), which: S('max | min', { enum: ['max', 'min'] }) }, ['kind']),
    run: async a => {
      const kind = str(a.kind)
      const id = a.id ? canonicalQuantityId(str(a.id)) : ''
      const rec = await freshRecording()
      if (id && !listQuantities(rec).some(q => q.id === id)) throw new ToolError(`unknown quantity id ${id}; call list_quantities`)
      let target: ProblemTarget
      if (kind === 'quantity') { const t = Number(a.t); if (!(t >= 0)) throw new ToolError('t must be ≥ 0'); target = { kind: 'quantity', id, t } }
      else if (kind === 'atEvent') target = { kind: 'atEvent', id, event: str(a.event) as never, side: a.side === 'after' ? 'after' : 'before', body: str(a.body) || null }
      else if (kind === 'event') target = { kind: 'event', event: str(a.event) as never, body: str(a.body) || null }
      else if (kind === 'end') target = { kind: 'end', id }
      else if (kind === 'extreme') target = { kind: 'extreme', id, which: a.which === 'min' ? 'min' : 'max' }
      else throw new ToolError('kind must be quantity, atEvent, event, end or extreme')
      return { ...evalTarget(target, rec), at: kind === 'quantity' ? { t: target.kind === 'quantity' ? target.t : undefined } : kind === 'atEvent' ? { event: str(a.event), side: a.side === 'after' ? 'after' : 'before' } : undefined, evidence: evidence(rec) }
    }
  },
  {
    name: 'list_quantities', level: 'read', label: () => tl('查看可读的量'),
    description: 'The readable quantity ids of the current scene (id, label, SI unit), at most 120.',
    parameters: obj({ filter: S('optional text to filter ids or labels') }),
    run: async a => {
      const rec = await freshRecording()
      const f = str(a.filter).toLowerCase()
      return listQuantities(rec).filter(q => !f || q.id.toLowerCase().includes(f) || q.label.toLowerCase().includes(f)).slice(0, 120).map(q => `${q.id} | ${q.label} | ${q.unit}`)
    }
  },
  {
    name: 'search_catalog', level: 'read', label: a => tl('搜索“{0}”', [str(a.query)]),
    description: 'Search built-in examples (kind example), the user\'s saved problems (my), simulation templates (template), analytic models (model), labs (lab), handbook topics (handbook) and curriculum topics from lower secondary to university (curriculum; the detail lists the model ids, t:template, l:lab/preset, a:activity that open it). Returns ids to open.',
    parameters: obj({ query: S('search words (any language)'), kind: S('optional: example | my | template | model | lab | handbook | curriculum', { enum: ['example', 'my', 'template', 'model', 'lab', 'handbook', 'curriculum'] }) }, ['query']),
    run: async a => { if (!a.kind || a.kind === 'curriculum') await loadCurriculum().catch(() => null); return searchCatalog(str(a.query), str(a.kind) || undefined) }
  },
  {
    name: 'list_examples', level: 'read', label: () => tl('列出例题'),
    description: `Built-in examples by chapter, model type or level. Chapters: ${CHAPTERS.map(c => c.id).join(', ')}. Types: ${CATEGORY_TYPES.join(', ')}. Levels: basic, advanced, hard.`,
    parameters: obj({ chapter: S('chapter id (optional)'), type: S('model type (optional)'), level: S('basic | advanced | hard (optional)') }),
    run: a => BUILTIN_PROBLEMS.filter(p => (!a.chapter || p.chapter === a.chapter) && (!a.type || META[p.id]?.types.includes(str(a.type))) && (!a.level || META[p.id]?.level === a.level)).slice(0, 40).map(p => ({ id: p.id, title: ptext(p.title, lang()), chapter: p.chapter, types: META[p.id]?.types ?? [], level: META[p.id]?.level ?? '' }))
  },
  {
    name: 'open_example', level: 'change', label: a => tl('打开例题 {0}', [ptext(builtinById(str(a.id))?.title ?? str(a.id), lang())]),
    description: 'Open a built-in example (problem mode) by id, optionally with other parameter values (template parameter keys, display units).',
    parameters: obj({ id: S('example id from search_catalog or list_examples'), params: { type: 'object', description: 'optional parameter values by key', additionalProperties: { type: 'number' } } }, ['id']),
    check: a => {
      const spec = builtinById(str(a.id))
      if (!spec) throw new ToolError(`no example ${a.id}`)
      const t = templateById(spec.template)!
      for (const k of Object.keys(numbersOf(a.params, 'params'))) if (!t.params.some(p => p.key === k)) throw new ToolError(`example ${spec.id} has no parameter ${k} (${t.params.map(p => p.key).join(', ')})`)
    },
    run: async a => {
      const spec = builtinById(str(a.id))!
      const params = numbersOf(a.params, 'params')
      await confirmReplace()
      if (!(await openBuiltin(spec, { ...spec.params, ...params }))) throw new ToolError('not opened')
      return { opened: ptext(spec.title, lang()), stem: ptext(spec.stem, lang(), Object.fromEntries(Object.entries({ ...spec.params, ...params }).map(([k, v]) => [k, String(v)]))), questions: spec.questions.map(q => ptext(q.prompt, lang())) }
    }
  },
  {
    name: 'open_my_problem', level: 'change', label: () => tl('打开我的题目'),
    description: 'Open a problem the user saved ("my problems") by id (from search_catalog kind my).',
    parameters: obj({ id: S('saved problem id') }, ['id']),
    run: async a => {
      const p = getMyProblem(str(a.id))
      if (!p) throw new ToolError(`no saved problem ${a.id}`)
      await confirmReplace()
      await openProblem(p, { confirm: false })
      return { opened: typeof p.title === 'string' ? p.title : p.title.zh }
    }
  },
  {
    name: 'load_template', level: 'change', label: a => tl('载入模板 {0}', [templateById(str(a.id))?.name ?? str(a.id)]),
    description: 'Load a simulation template into the studio, optionally with parameter values (keys and display units of the template). Replaces the current scene.',
    parameters: obj({ id: S('template id'), params: { type: 'object', description: 'parameter values by key', additionalProperties: { type: 'number' } } }, ['id']),
    check: a => {
      const t = templateById(str(a.id))
      if (!t) throw new ToolError(`no template ${a.id}; use search_catalog`)
      for (const k of Object.keys(numbersOf(a.params, 'params'))) if (!t.params.some(p => p.key === k)) throw new ToolError(`template ${t.id} has no parameter ${k} (${t.params.map(p => `${p.key} [${p.unit}]`).join(', ')})`)
    },
    run: async a => {
      const t = templateById(str(a.id))!
      const params = numbersOf(a.params, 'params')
      await confirmReplace()
      loadScene(buildTemplate(t.id, params), null)
      state.page = 'studio'
      return { loaded: t.name, parameters: t.params.map(p => ({ key: p.key, label: p.label, unit: p.unit, value: params[p.key] ?? p.value, min: p.min, max: p.max })) }
    }
  },
  {
    name: 'set_parameters', level: 'change', label: a => tl('修改参数 {0}', [Object.keys((a.params as object) ?? {}).concat(a.body ? [str(a.body)] : []).join(', ')]),
    description: 'Change the current scene: template parameters (keys and display units of the template, rebuilt as one undoable step), or one body (mass kg, velocity [vx, vy] m/s, friction muS/muK), or gravity g (m/s²).',
    parameters: obj({ params: { type: 'object', description: 'template parameter values by key', additionalProperties: { type: 'number' } }, body: S('body id to change (optional)'), mass: N('kg'), vx: N('m/s'), vy: N('m/s'), muS: N('static friction'), muK: N('kinetic friction'), g: N('gravity magnitude m/s²') }),
    check: a => {
      const params = numbersOf(a.params, 'params')
      if (Object.keys(params).length) {
        const cur = currentTemplate()
        if (!cur) throw new ToolError('the current scene is not built from a template; change a body instead, or load a template')
        for (const k of Object.keys(params)) if (!cur.info.params.some(p => p.key === k)) throw new ToolError(`template ${cur.info.id} has no parameter ${k} (${cur.info.params.map(p => `${p.key} [${p.unit}]`).join(', ')})`)
      }
      if (a.body !== undefined && !state.scene.bodies.some(x => x.id === str(a.body))) throw new ToolError(`no body ${a.body}`)
      if (!Object.keys(params).length && a.body === undefined && a.g === undefined) throw new ToolError('nothing to change')
    },
    run: async a => {
      const params = numbersOf(a.params, 'params')
      const changed: string[] = []
      if (Object.keys(params).length) {
        const r = applyTemplateParams(params)
        if (!r.ok) throw new ToolError(r.error)
        changed.push(...Object.keys(params))
      }
      const { edit } = await import('../../app/store')
      if (a.body !== undefined) {
        const id = str(a.body)
        const b = state.scene.bodies.find(x => x.id === id)
        if (!b) throw new ToolError(`no body ${id}`)
        if (b.kind === 'static' && (a.mass !== undefined || a.vx !== undefined || a.vy !== undefined)) throw new ToolError(`${id} is fixed`)
        for (const k of ['mass', 'vx', 'vy', 'muS', 'muK'] as const) if (a[k] !== undefined && !Number.isFinite(Number(a[k]))) throw new ToolError(`${k} must be a number`)
        if (a.mass !== undefined && !(Number(a.mass) > 0)) throw new ToolError('mass must be positive')
        edit(s => {
          const x = s.bodies.find(y => y.id === id)!
          if (a.mass !== undefined) x.mass = Number(a.mass)
          if (a.vx !== undefined) x.velocity.x = Number(a.vx)
          if (a.vy !== undefined) x.velocity.y = Number(a.vy)
          if (a.muS !== undefined) x.material.muS = Number(a.muS)
          if (a.muK !== undefined) x.material.muK = Number(a.muK)
        })
        changed.push(id)
      }
      if (a.g !== undefined) {
        const g = Number(a.g)
        if (!(g >= 0)) throw new ToolError('g must be ≥ 0')
        edit(s => { s.settings.gravity = { x: 0, y: -g } })
        changed.push('g')
      }
      if (!changed.length) throw new ToolError('nothing to change')
      return { changed, template: currentTemplate()?.values ?? null }
    }
  },
  {
    name: 'import_problem', level: 'change', label: () => tl('AI 读题'),
    description: 'Read a complete physics problem with the problem reader — ALWAYS use this for a whole problem the user gives (never load_template + set_parameters for it): it works out the physics, matches it against the templates, examples, tasks and analytic models, or builds a new scene or an equation model when nothing fits, loads it, and returns the answers computed by the app with the solution steps. Explain from what it returns.',
    parameters: obj({ text: S('the full problem text'), hint: S('optional clarification from the user') }, ['text']),
    run: async a => {
      await confirmReplace()
      const o = await importProblem(str(a.text), { hint: str(a.hint) || undefined, confirm: false })
      if (!o.ok) return { ok: false, error: o.error, details: o.errors?.slice(0, 6) }
      const b = o.build
      const answers = await waitForAnswers(o)
      return {
        ok: true, route: o.first.route, summary: o.first.summary, category: o.first.category, built: b.kind,
        answers: answers?.map(x => ({ question: x.prompt, value: x.text })) ?? 'still computing; call read_results shortly',
        solution: solutionSteps(o, answers), conclusion: o.conclusion || undefined, assumptions: o.assumptions, clarifications: o.clarifications,
        equations: b.kind === 'equations' ? { verdict: b.result.verdict, equations: b.model.equations.map(e => e.text) } : undefined
      }
    }
  },
  {
    name: 'open_model', level: 'change', label: a => tl('打开解析模型 {0}', [str(a.id)]),
    description: 'Open an analytic model (formula calculator) with input values in SI units and return its outputs (computed by the formula engine).',
    parameters: obj({ id: S('model id, e.g. M11, E09'), inputs: { type: 'object', description: 'input values in SI by input id', additionalProperties: { type: 'number' } } }, ['id']),
    check: a => {
      const m = modelById(str(a.id))
      if (!m) throw new ToolError(`no model ${a.id}`)
      for (const k of Object.keys(numbersOf(a.inputs, 'inputs'))) if (!m.inputs.some(i => i.id === k)) throw new ToolError(`model ${m.id} has no input ${k} (${m.inputs.map(i => i.id).join(', ')})`)
    },
    run: a => {
      const m = modelById(str(a.id))!
      const inputs = numbersOf(a.inputs, 'inputs')
      const all: Record<string, number> = {}
      for (const i of m.inputs) all[i.id] = inputs[i.id] ?? i.value
      const r = tryEval(m.id, all, 'CODATA2022')
      state.modelPreset = { id: m.id, inputs: all }
      state.modelId = m.id
      state.showModels = true
      if (!r.ok) return { opened: m.id, error: r.error }
      return { opened: `${m.id} ${m.title.zh}`, outputs: r.value.outputs.map(o => ({ id: o.id, value: round(o.value), unit: o.unit, state: o.state })) }
    }
  },
  {
    name: 'open_lab', level: 'change', label: a => tl('打开实验 {0}', [str(a.id)]),
    description: `Open a lab experiment (circuits, optics, heat, atomic, waves): ${LABS.filter(l => !l.planned).map(l => `${l.id} (${l.title})`).join(', ')}.`,
    parameters: obj({ id: S('lab id') }, ['id']),
    run: a => { if (!openLab(str(a.id))) throw new ToolError(`no lab ${a.id}`); return { opened: str(a.id) } }
  },
  {
    name: 'playback', level: 'change', label: a => tl('播放控制：{0}', [str(a.action)]),
    description: 'Control playback: play, pause, restart (to t = 0), seek (to t seconds), next_event (just after the next event), speed (rate: 0.25 / 0.5 / 1 / 2 / 4).',
    parameters: obj({ action: S('play | pause | restart | seek | next_event | speed', { enum: ['play', 'pause', 'restart', 'seek', 'next_event', 'speed'] }), t: N('seconds, for seek'), rate: N('playback rate, for speed') }, ['action']),
    run: a => {
      const act = str(a.action)
      if (act === 'play') play()
      else if (act === 'pause') pause()
      else if (act === 'restart') rewind()
      else if (act === 'seek') { const t = Number(a.t); if (!(t >= 0)) throw new ToolError('t must be ≥ 0'); pause(); seekTime(t) }
      else if (act === 'next_event') {
        const ev = state.recording?.events.find(e => e.t > state.time + 1e-9)
        if (!ev) throw new ToolError('no later event')
        pause(); seekTime(ev.t + 1e-6)
        return { at: round(ev.t, 6), event: ev.triggers }
      } else if (act === 'speed') { const r = Number(a.rate); if (!(r > 0 && r <= 16)) throw new ToolError('rate must be within (0, 16]'); state.speed = r }
      else throw new ToolError('unknown action')
      return { time: round(state.time, 4), playing: state.playing }
    }
  },
  {
    name: 'show', level: 'change', label: a => tl('打开 {0}', [str(a.target)]),
    description: `Switch the view: ${SHOW_TARGETS.join(', ')}.`,
    parameters: obj({ target: S('what to show', { enum: [...SHOW_TARGETS] }) }, ['target']),
    run: a => {
      const t = str(a.target)
      const studio = () => { state.page = 'studio' }
      switch (t) {
        case 'studio': case 'lab': case 'monitor': case 'settings': state.page = t; break
        case 'settings-ai': state.page = 'settings'; state.settingsSection = 'ai'; break
        case 'task': studio(); state.rightTab = 'task'; break
        case 'problem': if (!state.problem) throw new ToolError('no problem is open'); studio(); state.rightTab = 'problem'; break
        case 'formulas': studio(); state.rightTab = 'formula'; break
        case 'watch': studio(); state.rightTab = 'watch'; break
        case 'predict': studio(); state.rightTab = 'predict'; break
        case 'inspector': studio(); state.rightTab = 'inspect'; break
        case 'scene-settings': studio(); state.rightTab = 'settings'; break
        case 'curves': studio(); state.bottomTab = 'chart'; break
        case 'events': studio(); state.bottomTab = 'events'; break
        case 'templates': state.showTemplates = true; break
        case 'problems': state.showProblems = true; break
        case 'models': state.showModels = true; break
        case 'learning': state.showLearning = true; break
        case 'fbd': if (!state.recording) throw new ToolError('no result yet'); state.showFbd = true; break
        case 'handbook': openHandbook(null); break
        default: throw new ToolError(`unknown target ${t}`)
      }
      return { shown: t }
    }
  },
  {
    name: 'show_curves', level: 'change', label: () => tl('显示曲线'),
    description: 'Show curves in the chart panel: a preset (kinematics x/v/a of the selected or first body, energy, forces) or a list of quantity ids.',
    parameters: obj({ preset: S('kinematics | energy | forces', { enum: ['kinematics', 'energy', 'forces'] }), ids: { type: 'array', items: { type: 'string' }, description: 'quantity ids' } }),
    run: a => {
      const rec = state.recording
      if (!rec) throw new ToolError('no simulation result yet')
      const q = new Set(listQuantities(rec).map(x => x.id))
      let ids: string[]
      if (Array.isArray(a.ids) && a.ids.length) {
        ids = (a.ids as unknown[]).map(x => canonicalQuantityId(str(x)))
        const bad = ids.filter(i => !q.has(i))
        if (bad.length) throw new ToolError(`unknown quantity ids: ${bad.join(', ')}`)
      } else {
        const body = state.scene.bodies.find(b => b.id === (state.selection?.kind === 'body' ? state.selection.id : '')) ?? state.scene.bodies.find(b => b.kind !== 'static')
        if (a.preset === 'energy') ids = ['system.ek', 'system.ep', 'system.es', 'system.e'].filter(i => q.has(i))
        else if (a.preset === 'forces') ids = [...q].filter(i => body && i.startsWith(`contact.${body.id}|`) && (i.endsWith('.N') || i.endsWith('.f')))
        else ids = body ? [`${body.id}.x`, `${body.id}.vx`, `${body.id}.ax`].filter(i => q.has(i)) : []
      }
      state.chart = ids.slice(0, 8)
      state.page = 'studio'
      state.bottomTab = 'chart'
      return { curves: state.chart }
    }
  },
  {
    name: 'reveal_answers', level: 'change', label: () => tl('揭晓答案'),
    description: 'In problem mode: reveal the answers (plays the run and shows the simulated answers). In learning mode only after the student has entered an answer.',
    parameters: obj({}),
    run: () => {
      const p = state.problem
      if (!p) throw new ToolError('no problem is open')
      if (settings.ai.learningMode && !Object.values(p.answers).some(v => v !== null && v !== undefined)) throw new ToolError('learning mode: let the student answer first')
      reveal()
      return { revealed: true }
    }
  },
  {
    name: 'set_display', level: 'change', label: () => tl('修改画面显示'),
    description: 'What the canvas draws: force arrows (forces: off | selected (the selected body) | all (every body)), velocity and acceleration arrows, trajectory, body names, key moments, grid. Forces such as the normal force and rope tension are computed by the engine; this only shows them (after a run).',
    parameters: obj({ forces: S('off | selected | all', { enum: ['off', 'selected', 'all'] }), velocity: { type: 'boolean' }, acceleration: { type: 'boolean' }, trajectory: { type: 'boolean' }, names: { type: 'boolean' }, labels: { type: 'boolean', description: 'key moments (impacts, sticking …)' }, grid: { type: 'boolean' } }),
    check: a => { if (!Object.keys(a).length) throw new ToolError('nothing to change') },
    run: a => {
      const d = state.display as unknown as Record<string, boolean>
      if (a.forces !== undefined) {
        const f = str(a.forces)
        d.forces = f !== 'off'
        d.forcesAll = f === 'all'
        if (f === 'selected' && state.selection?.kind !== 'body') {
          const first = state.scene.bodies.find(b => b.kind !== 'static')
          if (first) state.selection = { kind: 'body', id: first.id }
        }
      }
      for (const k of ['velocity', 'acceleration', 'trajectory', 'names', 'labels', 'grid'] as const) if (typeof a[k] === 'boolean') d[k] = a[k] as boolean
      state.page = 'studio'
      return { display: { forces: d.forces ? (d.forcesAll ? 'all' : 'selected') : 'off', velocity: d.velocity, acceleration: d.acceleration, trajectory: d.trajectory }, selected: state.selection?.kind === 'body' ? state.selection.id : null, computed: !!state.recording }
    }
  },
  {
    name: 'select_body', level: 'change', label: a => tl('选中 {0}', [str(a.body)]),
    description: 'Select a body (its properties open in the inspector; "selected" force arrows and the kinematics curves follow it).',
    parameters: obj({ body: S('body id') }, ['body']),
    check: a => { if (!state.scene.bodies.some(b => b.id === str(a.body))) throw new ToolError(`no body ${a.body}; bodies: ${state.scene.bodies.map(b => b.id).join(', ')}`) },
    run: a => { state.selection = { kind: 'body', id: str(a.body) }; state.page = 'studio'; return { selected: str(a.body) } }
  },
  {
    name: 'read_forces', level: 'read', label: a => tl('读取 {0} 的受力', [str(a.body)]),
    description: 'Every force on one body from the simulation: gravity, normal force and friction of each contact, rope tension, spring and applied forces, Coulomb force — names and values in N, at time t (default: the time shown) or just before/after an event.',
    parameters: obj({ body: S('body id'), t: N('time in s (optional)'), event: S(`optional event: ${Object.keys(EVENTS).join(', ')}`), side: S('before | after', { enum: ['before', 'after'] }) }, ['body']),
    run: a => readForces(str(a.body), { t: a.t === undefined ? undefined : Number(a.t), event: str(a.event) || undefined, side: a.side === 'after' ? 'after' : 'before' })
  },
  {
    name: 'add_force', level: 'change', label: a => tl('给 {0} 加力', [str(a.body)]),
    description: 'Apply a constant force (a pull or push by hand) to a body: F = [Fx, Fy] in N (x right, y up), or magnitude N with angleDeg from the +x axis. The engine adds it to the motion; its readings are <force id>.F, .Fx, .Fy.',
    parameters: obj({ body: S('body id'), F: { type: 'array', items: { type: 'number' }, description: '[Fx, Fy] in N' }, magnitude: N('N (with angleDeg)'), angleDeg: N('direction, degrees from +x (counter-clockwise)'), name: S('optional display name of the force') }, ['body']),
    check: a => {
      const b = state.scene.bodies.find(x => x.id === str(a.body))
      if (!b) throw new ToolError(`no body ${a.body}; bodies: ${state.scene.bodies.map(x => x.id).join(', ')}`)
      if (b.kind === 'static') throw new ToolError(`${b.id} is fixed`)
      const vec = Array.isArray(a.F) && a.F.length === 2 && a.F.every(x => Number.isFinite(Number(x)))
      if (!vec && !(Number.isFinite(Number(a.magnitude)) && a.magnitude !== undefined)) throw new ToolError('give F = [Fx, Fy] or magnitude (and angleDeg)')
    },
    run: async a => {
      const id = str(a.body)
      let F: { x: number; y: number }
      if (Array.isArray(a.F) && a.F.length === 2) F = { x: Number(a.F[0]), y: Number(a.F[1]) }
      else { const m = Number(a.magnitude), th = (Number(a.angleDeg) || 0) * Math.PI / 180; F = { x: m * Math.cos(th), y: m * Math.sin(th) } }
      const { edit } = await import('../../app/store')
      let made = ''
      edit(s => {
        const b = s.bodies.find(x => x.id === id)!
        const c = addConnector<ForceDef>(s, { type: 'force', name: str(a.name).slice(0, 24) || tl('拉力 F'), a: anchor(b), force: F, expr: null })
        made = c.id
      })
      state.page = 'studio'
      return { added: made, body: id, F: [round(F.x), round(F.y)], readings: [`${made}.F`, `${made}.Fx`, `${made}.Fy`] }
    }
  },
  {
    name: 'build_scene', level: 'change', label: a => tl('搭建场景 {0}', [str((a.scene as { name?: string } | undefined)?.name) || '']),
    description: `Build a new scene when no template fits (replaces the current scene). SI units, x right, y up. scene = { name, gravity (m/s², default 9.8), duration (s),
surfaces: [{type:"ground", id, top, left, right, muS, muK} | {type:"incline", id, angleDeg, base, x0, y0, mu} | {type:"wall", id, x, bottom, top} | {type:"arc", id, center:[x,y], radius (the running surface), startDeg, sweepDeg (0° right, 90° up; quarter track: 180, 90; vertical loop: 0, 360), side:"inside"|"outside" (hump), mu}],
bodies: [{id, name, shape:"box"|"ball"|"rod"|"cylinder"|"groove"|"hoop", width, height, radius, length, thickness, startDeg, sweepDeg, mass, position:[x,y] (groove: its circle's centre) or on:{surface, s (m from the top of an incline) | x | angleDeg (on an arc track)}, velocity:[vx,vy], mu, restitution, charge (C), fixedRotation}],
pulleys: [{id, position:[x,y], radius}],
connectors: [{type:"rope", a, b, via:[pulley ids]} | {type:"spring", a, b, k, restLength} | {type:"rod", a, b, anchorB:[x,y]} | {type:"hinge", a, anchorB} | {type:"force", body, F:[Fx,Fy]}],
fields: [{type:"electric", E:[Ex,Ey], region:[[x0,y0],[x1,y1]] | null} | {type:"magnetic", B (T, out of the page +), region} | {type:"liquid", density, region}] }.
Normal forces, friction, tension and spring forces come from contacts and connectors automatically. Bodies must not overlap at the start.`,
    parameters: obj({ scene: { type: 'object', description: 'the scene description above' } }, ['scene']),
    check: a => {
      try { compileSceneSpec(a.scene as SceneSpec) } catch (e) { throw new ToolError(e instanceof SpecError ? `fix the scene: ${e.problems.slice(0, 8).join('; ')}` : (e as Error).message) }
    },
    run: async a => {
      const scene = compileSceneSpec(a.scene as SceneSpec)
      await confirmReplace()
      loadScene(scene, null)
      state.page = 'studio'
      return { built: scene.name, bodies: scene.bodies.map(b => ({ id: b.id, name: b.name, kind: b.kind })), connectors: scene.connectors.map(c => ({ id: c.id, type: c.type })) }
    }
  },
  {
    name: 'point_to', level: 'read', label: a => tl('指给你看：{0}', [uiTargets()[str(a.target)]?.name ?? str(a.target)]),
    description: `Highlight a control so the user can click it themselves (use when the user asks how to do something). Targets: ${Object.keys(uiTargets()).join(', ')}.`,
    parameters: obj({ target: S('interface part', { enum: Object.keys(uiTargets()) }), note: S('one short sentence: what to do there') }, ['target', 'note']),
    run: a => {
      const key = str(a.target)
      if (!uiTargets()[key]) throw new ToolError(`unknown target ${key}`)
      if (!pointTo(key, str(a.note).slice(0, 200))) throw new ToolError(`${key} is not visible now (open its page or panel first with show)`)
      return { highlighted: key }
    }
  }
]

/** The tools as the API sees them. */
export function toolDefs(): ToolDef[] {
  return TOOLS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
}

export function toolByName(name: string): Tool | undefined { return TOOLS.find(t => t.name === name) }

/** Domains the task solver knows (for the prompt). */
export const TASK_DOMAINS = Object.keys(DOMAINS)
