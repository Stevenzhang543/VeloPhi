/**
 * The task of the studio (26.57, D113/D114): one task at a time, with its check, its results and the results it had
 * before the last change (kept for comparison and marked as old, manual §3.4). Results are accepted only for the
 * revision and content they were asked for (task/runner.ts); editing the task or the scene the task was opened in
 * makes them stale. The task and its text draft survive switching pages and work modes and are kept in this browser
 * (a convenience: a task file is exported with “导出任务”).
 */
import { reactive, watch } from 'vue'
import type { ResultEnvelope, SolveOutcome, TaskDomain, TaskSpec, TaskState } from '../../task/types'
import type { TaskCheck } from '../../task/validate'
import { acceptDefaults, checkTask } from '../../task/validate'
import type { TaskPatch } from '../../task/build'
import { applyPatch, makeTask, makeTarget } from '../../task/build'
import { parseProblem } from '../../task/parse'
import type { ParseResult } from '../../task/parse'
import { solveTask, taskHash } from '../../task/plan'
import { TaskRunner, isCurrent, runGuarded } from '../../task/runner'
import { sampleWithTargets } from '../../task/samples'
import { suggestFromScene } from '../../task/scene'
import type { SceneSuggestion } from '../../task/scene'
import { TASK_SCHEMA } from '../../task/types'
import { DOMAINS } from '../../task/vocab'
import { serializeScene } from '../../core/scene/io'
import { ENGINE_VERSION } from '../../core/scene/types'
import { sceneLoads, state } from '../store'

const KEY = 'velophi.task.v1'

export interface TaskUi {
  task: TaskSpec | null
  check: TaskCheck | null
  /** Content hash of the task the results belong to. */
  hash: string
  outcome: SolveOutcome | null
  /** The outcome before the last change (shown greyed, labelled as old). */
  previous: SolveOutcome | null
  state: TaskState
  busy: boolean
  error: string | null
  /** Text being typed into the “paste a problem” box. */
  draft: string
  /** What the last reading of a text found (out of scope, numbers not used). */
  parse: Pick<ParseResult, 'scope' | 'reason' | 'reasonParams' | 'unused' | 'candidates'> | null
  /** A scene's offer of targets (T01). */
  suggestion: SceneSuggestion | null
  /** The scene the task was opened in (its serialized form): editing it makes the results stale. */
  boundScene: string | null
  /** Answers dropped because their question had changed. */
  dropped: number
}

export const taskUi = reactive<TaskUi>({ task: null, check: null, hash: '', outcome: null, previous: null, state: 'draft', busy: false, error: null, draft: '', parse: null, suggestion: null, boundScene: null, dropped: 0 })
const runner = new TaskRunner()

/**
 * The scene the task is shown on, as the count of scene loads at binding (not reactive): another scene loaded since
 * is not the task's scene, so its pinned results and its formula focus do not apply there (hand check H7).
 */
export const bound: { load: number } = { load: -1 }
/** Bind the task to the scene shown now (its demonstration, or the scene it was read from). */
export function bindToCurrentScene() { taskUi.boundScene = serializeScene(state.scene); bound.load = sceneLoads.n }
/** Whether the scene shown now is the one the task is bound to (edited or not; another loaded scene is not). */
export function onTaskScene(): boolean { return !!taskUi.boundScene && sceneLoads.n === bound.load }

function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ task: taskUi.task, draft: taskUi.draft })) } catch { /* storage unavailable: the task lives for this session */ }
}
function restore() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return
    const o = JSON.parse(raw) as { task: TaskSpec | null; draft: string }
    taskUi.draft = typeof o.draft === 'string' ? o.draft : ''
    if (o.task && o.task.schemaVersion === TASK_SCHEMA && o.task.domain in DOMAINS) setTask(o.task, false)
  } catch { /* a damaged entry is ignored */ }
}

/** Show a task (checked; no result until it is solved). */
export function setTask(task: TaskSpec | null, keepPrevious = false) {
  if (taskUi.outcome && keepPrevious) taskUi.previous = taskUi.outcome
  else if (!keepPrevious) taskUi.previous = null
  runner.cancel()
  taskUi.task = task
  taskUi.outcome = null
  taskUi.busy = false
  taskUi.error = null
  taskUi.check = task ? checkTask(task) : null
  taskUi.hash = ''
  taskUi.state = !task ? 'draft' : taskUi.previous ? 'stale' : taskUi.check!.state === 'ready' ? 'ready' : taskUi.check!.state === 'outOfScope' ? 'outOfScope' : 'needsInput'
  save()
}

/** Change the task (a new revision); its results become the “previous” ones. */
export function changeTask(patch: TaskPatch) {
  if (!taskUi.task) return
  setTask(applyPatch(taskUi.task, patch), !!(taskUi.outcome || taskUi.previous))
}

/** Read a text problem; defaults are applied visibly (each says where it came from). */
export function readText(text: string) {
  taskUi.draft = text
  const p = parseProblem(text)
  taskUi.parse = { scope: p.scope, reason: p.reason, reasonParams: p.reasonParams, unused: p.unused, candidates: p.candidates }
  taskUi.suggestion = null
  taskUi.boundScene = null
  if (!p.task) { setTask(null); taskUi.state = 'outOfScope'; return }
  let t = p.task
  t = applyPatch(t, acceptDefaults(checkTask(t)))
  t.revision = 1
  setTask(t)
}

/** Start a task by hand (manual structured editor, VP-06). */
export function newManualTask(domain: TaskDomain) {
  taskUi.parse = null
  taskUi.suggestion = null
  taskUi.boundScene = null
  const t = makeTask(domain, { stem: { text: '', source: 'manual' } })
  setTask(applyPatch(t, acceptDefaults(checkTask(t))))
}

/** Open one of the six representative tasks. */
export function openSample(domain: TaskDomain) {
  taskUi.parse = null
  taskUi.suggestion = null
  taskUi.boundScene = null
  taskUi.draft = sampleWithTargets(domain).stem?.text ?? ''
  setTask(sampleWithTargets(domain))
}

/** What the current scene offers (no target is chosen for the user, T01). */
export function suggestFromCurrentScene() {
  const s = suggestFromScene(state.scene)
  taskUi.suggestion = s
  taskUi.parse = null
  if (s.task) { bindToCurrentScene(); setTask(s.task) }
}

/** Add a target of the catalogue (with a condition value or a time when it needs one). */
export function addTarget(key: string, opts: { conditionValue?: number; tSI?: number; answerDomain?: string } = {}) {
  if (!taskUi.task) return
  const n = taskUi.task.targets.filter(t => t.id.split('#')[0] === key).length
  const { target, condition } = makeTarget(taskUi.task, key, { ...opts, suffix: n ? String(n + 1) : undefined })
  changeTask({ targets: [target], conditions: condition ? [condition] : [] })
}

/** Solve the task: results are accepted only for the revision and content they were asked for (T14). */
export async function solveCurrent(): Promise<boolean> {
  const task = taskUi.task
  if (!task || taskUi.check?.state !== 'ready') return false
  taskUi.busy = true
  taskUi.state = 'solving'
  taskUi.error = null
  let hash = ''
  try { hash = taskHash(task) } catch (e) { taskUi.busy = false; taskUi.error = (e as Error).message; taskUi.state = 'failed'; return false }
  const r = await runGuarded(runner, task, hash, () => ({ task: taskUi.task, hash: taskUi.task === task ? hash : taskUi.task ? 'changed' : '' }), () => {
    try { return solveTask(task, { hash }) } catch (e) { return { state: 'failed' as const, results: [], steps: [], phases: [], notes: [(e as Error).message] } }
  }, () => new Promise(res => requestAnimationFrame(() => res())))
  taskUi.dropped = runner.dropped
  if (!r.accepted || !r.value) return false
  taskUi.busy = false
  taskUi.hash = hash
  taskUi.outcome = r.value
  taskUi.previous = null
  taskUi.state = r.value.state
  return true
}

/** Stop waiting for the answer (the user's cancel). */
export function cancelSolve() {
  runner.cancel()
  taskUi.busy = false
  taskUi.state = taskUi.check?.state === 'ready' ? 'ready' : 'needsInput'
}

/** The results that may be shown as current (manual §10.3: revision and content checked before display). */
export function currentResults(): ResultEnvelope[] {
  const o = taskUi.outcome
  if (!o) return []
  return o.results.filter(r => isCurrent(r, taskUi.task, taskUi.hash))
}

/** The task as a file (schema 2), with the run manifest fields of the result. */
export function taskFile(): string {
  return JSON.stringify({ format: 'velophi-task', schemaVersion: TASK_SCHEMA, appVersion: ENGINE_VERSION, task: taskUi.task, results: taskUi.outcome ? { state: taskUi.outcome.state, results: currentResults() } : null }, null, 2)
}

/** Read a task file (T30): the task comes back with its targets, conditions, sources and version. */
export function loadTaskFile(text: string): string | null {
  try {
    const o = JSON.parse(text) as { format?: string; schemaVersion?: number; task?: TaskSpec }
    if (o.format !== 'velophi-task' || !o.task) return '不是 VeloPhi 任务文件'
    if (o.schemaVersion !== TASK_SCHEMA || o.task.schemaVersion !== TASK_SCHEMA) return '任务文件的版本不受支持'
    if (!(o.task.domain in DOMAINS)) return '任务的题型不受支持'
    taskUi.parse = null
    taskUi.suggestion = null
    taskUi.boundScene = null
    setTask(o.task)
    return null
  } catch { return '任务文件无法读取' }
}

// Editing the scene a task was opened in makes its results stale (manual §10.2 “相关条件变化 → stale”)
watch(() => state.scene, () => {
  if (!taskUi.boundScene || !taskUi.outcome) return
  // another scene opened since (a template, a lab, a package demonstration) is not an edit of the task's scene:
  // the results stay current, they are just not shown over that scene (hand check H7)
  if (sceneLoads.n !== bound.load) return
  if (serializeScene(state.scene) === taskUi.boundScene) return
  taskUi.previous = taskUi.outcome
  taskUi.outcome = null
  taskUi.state = 'stale'
}, { deep: true })

watch(() => taskUi.draft, save)
restore()
