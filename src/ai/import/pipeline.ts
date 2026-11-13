/**
 * AI problem reading (26.59, D162–D166): read → choose → check → repair → build → load. The AI's two answers are
 * checked by app code (contract.ts); at most two repair rounds; nothing half-built is ever shown. The numbers of the
 * answers come from the engine (simulation, task solver or analytic model), never from the AI.
 *
 * Used by the import bar, the task panel and Copilot's `import_problem` tool (D170) — one function, one connection,
 * one quota.
 */
import { readableList, typedWithPhoto, withTranscript } from '../aiText'
import { reactive } from 'vue'
import { tl } from '../../i18n'
import { chat, extractJson, aiLabel, aiVision, aiCanThink } from '../client'
import { AiError } from '../types'
import type { ChatMessage, ContentPart, AiErrorCode } from '../types'
import { checkBuild, checkRoute, extrasOf, readableQuantities } from './contract'
import type { Build, EquationsBuild, RouteAnswer } from './contract'
import { compileSceneSpec } from './sceneSpec'
import { alignAngles } from './angles'
import { DATA_RULE, ROUTE_SYSTEM, TRANSCRIBE_SYSTEM, TRANSCRIBE_USER, buildSystem, buildUser, repairUser, routeUser, unreadableUser, verdictUser } from './prompts'
import type { Problem } from '../../teaching/problems'
import { openProblem, reveal } from '../../app/problemMode'
import { state } from '../../app/store'
import { settings } from '../../app/settings'
import { applyPatch, makeTask, makeTarget } from '../../task/build'
import { acceptDefaults, checkTask } from '../../task/validate'
import { setTask, solveCurrent, taskUi } from '../../app/task/taskState'
import { modelById } from '../../content/models'
import { tryEval } from '../../app/models/run'
import type { TaskSpec } from '../../task/types'
import { logEvent } from '../../app/trialLog'

export type ImportStage = 'transcribing' | 'reading' | 'choosing' | 'checking' | 'repairing' | 'building' | 'done'

export const STAGE_TEXT: Record<ImportStage, string> = {
  transcribing: '识别图片中的题目',
  reading: '读题与分类',
  choosing: '选择模型并设定参数',
  checking: '校验',
  repairing: '修正 AI 的输出',
  building: '建立场景并计算',
  done: '完成'
}

export interface ImportOptions {
  /** A problem image as a data URL (models with vision only). */
  image?: string
  /** The user's answer to a clarification, or another hint. */
  hint?: string
  signal?: AbortSignal
  onStage?: (stage: ImportStage) => void
}

export interface ImportSuccess {
  ok: true
  /** What the user typed. */
  text: string
  /** The problem as read: the typed text and, with a photo, its transcript. */
  stem: string
  /** What the AI read from the photo (shown, editable by reading again). */
  transcript?: string
  first: RouteAnswer
  build: Build
  assumptions: string[]
  clarifications: Array<{ question: string; options: string[] }>
  warnings: string[]
  /** 26.59 fix: the solution path in a few steps; {1}, {2} … stand for the computed answers. */
  solution: string[]
  /** An equation model without a unique solution: what that means (the AI's reading of the app's verdict). */
  conclusion: string
  calls: number
  tokens: number
  connection: string
}
export interface ImportFailure { ok: false; text: string; error: string; code?: AiErrorCode | 'unsupported' | 'invalid'; first?: RouteAnswer; errors?: string[]; calls: number; /** The beginning of the AI's last answer (shown under “详情”). */ raw?: string }
export type ImportOutcome = ImportSuccess | ImportFailure

/** State shared by the import bar, the task panel and Copilot. */
export const aiImport = reactive({
  busy: false,
  stage: null as ImportStage | null,
  last: null as ImportOutcome | null,
  /** What was loaded from the last success: a problem, a task or a model. */
  loaded: null as null | { kind: 'problem' | 'task' | 'model' | 'equations'; title: string; id?: string }
})

let controller: AbortController | null = null
export function cancelImport() { controller?.abort() }

/**
 * A problem photo or screenshot as text (26.59, D178): the stem, every number with its unit, and what the figure
 * shows (angles, lengths, positions, how things are connected), so the reading steps work on text. The image goes
 * only into a user message (DeepSeek and others refuse images elsewhere). The transcript is shown to the user.
 */
export async function transcribeImage(image: string, text: string, signal?: AbortSignal): Promise<{ transcript: string; tokens: number }> {
  if (!aiVision()) throw new AiError('vision', tl('当前 AI 模型不支持图片，请输入文字题目（或在设置中换用支持图片的模型）'))
  const content: ContentPart[] = [{ type: 'text', text: `${TRANSCRIBE_USER}${typedWithPhoto(text.trim())}` }, { type: 'image_url', image_url: { url: image } }]
  const r = await chat({ messages: [{ role: 'system', content: TRANSCRIBE_SYSTEM + DATA_RULE }, { role: 'user', content }], temperature: 0, max_tokens: 3000, reasoning: 'off', purpose: 'transcribe' }, { signal })
  const transcript = (typeof r.message.content === 'string' ? r.message.content : '').trim()
  if (!transcript) throw new AiError('invalid_response', tl('没有从图片中识别出题目'))
  return { transcript, tokens: r.usage?.total_tokens ?? 0 }
}

/** Read a problem with the AI (no change to the app). */
export async function readProblem(text: string, opts: ImportOptions = {}): Promise<ImportOutcome> {
  const problem = text.trim()
  let calls = 0, tokens = 0
  const stage = (s: ImportStage) => opts.onStage?.(s)
  let lastRaw = ''
  /**
   * One structured call (26.59 fix): no thinking (DeepSeek thinks by default and the thinking eats the budget);
   * the last repair of a DeepSeek connection may think, with room for it.
   */
  const ask = async (messages: ChatMessage[], maxTokens: number, purpose: string, think = false) => {
    calls++
    const req = { messages, response_format: { type: 'json_object' as const }, temperature: 0.1, max_tokens: think ? Math.max(maxTokens, 24000) : maxTokens, reasoning: (think ? 'on' : 'off') as 'on' | 'off', purpose }
    // 26.63 (D238): busy services and dropped connections are retried in one place, the client (ai/retry.ts); an
    // unreadable reply (not a transport failure) is still asked once more here
    let r
    try {
      r = await chat(req, { signal: opts.signal })
    } catch (e) {
      if (!(e instanceof AiError) || e.code !== 'invalid_response' || opts.signal?.aborted) throw e
      calls++
      r = await chat({ ...req, purpose: `${purpose} (retry)` }, { signal: opts.signal })
    }
    tokens += r.usage?.total_tokens ?? 0
    const content = typeof r.message.content === 'string' ? r.message.content : ''
    lastRaw = content
    return { content, json: extractJson(content), truncated: !!r.truncated }
  }
  /** What to tell the AI when its answer could not be read as JSON (empty, cut off, or prose). */
  const unreadable = (a: { content: string; truncated: boolean }): string => unreadableUser(a.content, a.truncated)
  const canThink = aiCanThink()
  try {
    if (!problem && !opts.image) return { ok: false, text, error: tl('请先输入或粘贴一道题'), code: 'invalid', calls }
    // 0. a photo or screenshot becomes text first (with the typed words as context)
    let transcript: string | undefined
    let full = problem
    if (opts.image) {
      stage('transcribing')
      calls++
      const t = await transcribeImage(opts.image, problem, opts.signal)
      tokens += t.tokens
      transcript = t.transcript
      full = withTranscript(problem, transcript)
    }
    // 1. read and route
    stage('reading')
    const m1: ChatMessage[] = [{ role: 'system', content: ROUTE_SYSTEM + DATA_RULE }, { role: 'user', content: routeUser(full, opts.hint) }]
    let a1 = await ask(m1, 3000, 'import: read')
    stage('checking')
    let r1 = checkRoute(a1.json)
    for (let round = 0; !r1.ok && round < 2; round++) {
      stage('repairing')
      m1.push({ role: 'assistant', content: a1.content || '(empty)' }, { role: 'user', content: a1.json === null ? unreadable(a1) : repairUser(r1.errors) })
      a1 = await ask(m1, 3000, `import: read, repair ${round + 1}`, canThink && round === 1)
      r1 = checkRoute(a1.json)
    }
    // 26.59 fix 3 (D196): a reading that names no usable template is not a failure — build the problem from scratch
    // (a scene for a motion, equations for statics and the rest) with what the AI did read
    if (!r1.ok && isObj(a1.json)) {
      const fb = checkRoute({ ...a1.json, route: fallbackRoute(a1.json.process), id: null })
      if (fb.ok) r1 = fb
    }
    if (!r1.ok) return { ok: false, text, error: tl('AI 没有给出可用的读题结果'), code: 'invalid', errors: r1.errors, calls, raw: lastRaw.slice(0, 1500) }
    let first = r1.value
    if (first.route === 'unsupported') return { ok: false, text, error: first.reason || tl('引擎暂时无法表达这道题'), code: 'unsupported', first, calls }
    // 2. choose parameters and questions for the route
    stage('choosing')
    const m2: ChatMessage[] = [{ role: 'system', content: buildSystem(first.route) + DATA_RULE }, { role: 'user', content: buildUser(full, first, opts.hint) }]
    const budget = first.route === 'scene' || first.route === 'equations' ? 8000 : 6000
    // Angles that agree with "sin37° = 0.6" and the like (26.59 fix), then the checks
    let angleNotes: string[] = []
    const checkAligned = (json: unknown) => { angleNotes = alignAngles(json, full); return checkBuild(first.route, first.id, json) }
    let a2 = await ask(m2, budget, `import: ${first.route}`)
    stage('checking')
    let r2 = checkAligned(a2.json)
    for (let round = 0; !r2.ok && round < 2; round++) {
      stage('repairing')
      if (a2.json === null) {
        m2.push({ role: 'assistant', content: a2.content || '(empty)' }, { role: 'user', content: unreadable(a2) })
        a2 = await ask(m2, budget, `import: ${first.route}, repair ${round + 1}`, canThink && round === 1)
        r2 = checkAligned(a2.json)
        continue
      }
      // A generated scene that compiled but whose questions name unknown quantities gets the real list
      let extra = ''
      if (first.route === 'scene' && r2.errors.some(e => /readable quantity/.test(e))) {
        try {
          const raw = a2.json as { scene?: unknown }
          const sc = compileSceneSpec(raw.scene as never)
          extra = readableList([...readableQuantities(sc).keys()].slice(0, 120))
        } catch { /* the errors already say what is wrong */ }
      }
      m2.push({ role: 'assistant', content: a2.content }, { role: 'user', content: repairUser(r2.errors, extra) })
      a2 = await ask(m2, budget, `import: ${first.route}, repair ${round + 1}`, canThink && round === 1)
      r2 = checkAligned(a2.json)
    }
    // An equation model that the app could not solve uniquely gets one look back (26.59 fix, D188): either the AI
    // finds its mistake, or it confirms the equations and says what the verdict means for the problem
    if (r2.ok && r2.value.kind === 'equations' && r2.value.result.verdict !== 'solved') {
      stage('repairing')
      m2.push({ role: 'assistant', content: a2.content }, { role: 'user', content: verdictUser(r2.value) })
      const a3 = await ask(m2, budget, 'import: equations, verdict', canThink)
      const r3 = checkAligned(a3.json)
      if (r3.ok) { a2 = a3; r2 = r3 }
    }
    // 26.59 fix 3 (D196): a template, task or model the AI could not fill in after two repairs — build it from
    // scratch instead (one call and one repair), so the problem still loads
    if (!r2.ok && first.route !== 'scene' && first.route !== 'equations') {
      const route = fallbackRoute(first.process)
      const second: RouteAnswer = { ...first, route, id: null, alternatives: [], reason: `${first.reason}（${tl('改为自行建模')}）` }
      stage('choosing')
      const m3: ChatMessage[] = [{ role: 'system', content: buildSystem(route) + DATA_RULE }, { role: 'user', content: buildUser(full, second, opts.hint) }]
      const check3 = (json: unknown) => { angleNotes = alignAngles(json, full); return checkBuild(route, null, json) }
      let a3 = await ask(m3, 8000, `import: ${route} (fallback)`)
      let r3 = check3(a3.json)
      if (!r3.ok) {
        stage('repairing')
        m3.push({ role: 'assistant', content: a3.content || '(empty)' }, { role: 'user', content: a3.json === null ? unreadable(a3) : repairUser(r3.errors) })
        a3 = await ask(m3, 8000, `import: ${route} (fallback), repair`, canThink)
        r3 = check3(a3.json)
      }
      if (r3.ok) { first = second; a2 = a3; r2 = r3 }
    }
    if (!r2.ok) return { ok: false, text, error: a2.json === null ? (a2.truncated ? tl('AI 的回答太长被截断，没有得到完整的结果') : tl('AI 没有按要求输出结果（已重试 2 次）')) : tl('AI 的输出没有通过校验（已修正 2 次）'), code: 'invalid', first, errors: r2.errors, calls, raw: lastRaw.slice(0, 1500) }
    const ex = extrasOf(a2.json)
    for (const n of angleNotes) if (!ex.assumptions.includes(n)) ex.assumptions.push(n)
    const warnings: string[] = []
    if (r2.value.kind === 'template' && r2.value.outOfRange.length) warnings.push(tl('超出模板的设计范围：{0}', [r2.value.outOfRange.join(', ')]))
    if (r2.value.kind === 'equations' && r2.value.result.verdict !== 'solved' && !ex.conclusion) warnings.push(tl('方程组没有唯一解：{0}', [verdictText(r2.value.result.verdict)]))
    return { ok: true, text, stem: full, transcript, first, build: r2.value, assumptions: ex.assumptions, clarifications: ex.clarifications, warnings, solution: ex.solution, conclusion: ex.conclusion, calls, tokens, connection: aiLabel() }
  } catch (e) {
    if (e instanceof AiError) return { ok: false, text, error: e.message, code: e.code, calls }
    return { ok: false, text, error: (e as Error).message, calls }
  }
}

/** Errors worth one more try: the connection, a busy or failing service, an unreadable reply (26.59 fix 3, D196). */
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** The from-scratch route for a process: a simulated scene for a motion, an equation model otherwise. */
function fallbackRoute(process: unknown): 'scene' | 'equations' {
  return process === 'motion' || process === 'field' ? 'scene' : 'equations'
}

/** The verdict of an equation model in words. */
export function verdictText(v: EquationsBuild['result']['verdict']): string {
  return v === 'inconsistent' ? tl('方程互相矛盾（不存在满足全部方程的解）') : v === 'underdetermined' ? tl('条件不足（所求的量不能由这些方程确定）') : v === 'failed' ? tl('数值求解失败') : tl('已解出')
}

const shortTitle = (s: string) => (s.length > 40 ? `${s.slice(0, 38)}…` : s)

/** A problem from a template or generated scene build. */
export function problemOf(o: ImportSuccess): Problem | null {
  const b = o.build
  if (b.kind !== 'template' && b.kind !== 'scene') return null
  const scene = JSON.parse(JSON.stringify(b.scene)) as Problem['scene']
  scene.settings.duration = b.duration
  if (b.kind === 'scene') scene.settings.legacyDuration = b.duration
  scene.extra = { ...(scene.extra ?? {}), ai: { route: o.first.route, example: o.first.route === 'example' ? o.first.id : undefined, category: o.first.category, summary: o.first.summary, givens: o.first.givens, assumptions: o.assumptions, solution: o.solution, connection: o.connection, at: new Date().toISOString() } }
  if (!scene.name || scene.name === 'AI 场景') scene.name = shortTitle(o.first.summary || tl('AI 读题'))
  return {
    id: `ai-${Date.now().toString(36)}`,
    title: shortTitle(o.first.summary || tl('AI 读题')),
    chapter: o.first.category.chapter,
    stem: o.stem,
    scene,
    questions: b.questions.map((q, i) => ({ id: `q${i + 1}`, type: 'numeric' as const, prompt: q.prompt, target: q.target }))
  }
}

/** A task (six domains) from a task build. */
export function taskOf(o: ImportSuccess): TaskSpec | null {
  const b = o.build
  if (b.kind !== 'task') return null
  let t = makeTask(b.domain, { stem: { text: o.stem, source: 'text' }, title: shortTitle(o.first.summary) })
  t = applyPatch(t, { set: b.givens.map(g => ({ ref: g.ref, valueSI: g.valueSI, unit: g.unit, source: 'stem' as const, raw: g.raw })), assume: b.assumptions.map(id => ({ id, source: 'stem' as const })), options: b.options })
  const targets = [], conditions = []
  const counts: Record<string, number> = {}
  for (const tg of b.targets) {
    counts[tg.key] = (counts[tg.key] ?? 0) + 1
    const r = makeTarget(t, tg.key, { conditionValue: tg.conditionSI, tSI: tg.tSI, suffix: counts[tg.key] > 1 ? String(counts[tg.key]) : undefined })
    targets.push(r.target)
    if (r.condition) conditions.push(r.condition)
  }
  t = applyPatch(t, { targets, conditions })
  t = applyPatch(t, acceptDefaults(checkTask(t)))
  t.revision = 1
  return t
}

/** Load a successful reading into the app; returns what was opened. */
export async function applyOutcome(o: ImportSuccess, opts: { confirm?: boolean } = {}): Promise<boolean> {
  const b = o.build
  if (b.kind === 'template' || b.kind === 'scene') {
    const p = problemOf(o)!
    if (!(await openProblem(p, { confirm: opts.confirm }))) return false
    if (settings.ai.revealAnswers) reveal()
    aiImport.loaded = { kind: 'problem', title: String(p.title), id: p.id }
  } else if (b.kind === 'task') {
    const t = taskOf(o)!
    taskUi.draft = o.stem
    taskUi.parse = null
    taskUi.suggestion = null
    taskUi.boundScene = null
    setTask(t)
    state.page = 'studio'
    state.rightTab = 'task'
    aiImport.loaded = { kind: 'task', title: t.title ?? '' }
    await solveCurrent()
  } else if (b.kind === 'equations') {
    // An equation model changes nothing in the app: the model, its solution and the steps are shown with the reading
    aiImport.loaded = { kind: 'equations', title: o.first.summary }
  } else {
    state.modelPreset = { id: b.id, inputs: { ...b.inputs } }
    state.modelId = b.id
    state.showModels = true
    aiImport.loaded = { kind: 'model', title: b.id }
  }
  logEvent('ai.import', { route: o.first.route, kind: b.kind, calls: o.calls })
  return true
}

/** Values of an analytic model build (for the summary and Copilot). */
export function modelOutputs(b: Build): Array<{ id: string; label: string; unit: string; value: number | null }> {
  if (b.kind !== 'model') return []
  const spec = modelById(b.id)
  if (!spec) return []
  const r = tryEval(b.id, b.inputs, 'CODATA2022')
  if (!r.ok) return []
  const get = (id: string): number | null => r.value.outputs.find(v => v.id === id)?.value ?? null
  return b.outputs.map(id => { const o = spec.outputs.find(x => x.id === id)!; return { id, label: o.label.zh, unit: o.unit, value: get(id) } })
}

/** Read and load (the import bar, the task panel and Copilot). */
export async function importProblem(text: string, opts: Omit<ImportOptions, 'signal' | 'onStage'> & { confirm?: boolean } = {}): Promise<ImportOutcome> {
  controller?.abort()
  controller = new AbortController()
  const ctl = controller
  aiImport.busy = true
  aiImport.stage = 'reading'
  aiImport.loaded = null
  try {
    const o = await readProblem(text, { ...opts, signal: ctl.signal, onStage: s => { if (controller === ctl) aiImport.stage = s } })
    if (controller !== ctl) return o
    aiImport.last = o
    if (o.ok) {
      aiImport.stage = 'building'
      const loaded = await applyOutcome(o, { confirm: opts.confirm })
      if (!loaded) return { ok: false, text, error: tl('已取消'), code: 'aborted', calls: o.calls }
    }
    aiImport.stage = o.ok ? 'done' : null
    return o
  } finally {
    if (controller === ctl) { aiImport.busy = false; controller = null }
  }
}
