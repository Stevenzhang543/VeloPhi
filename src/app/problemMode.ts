/**
 * 26.52 problem mode (D40 revised): open a problem (built-in, imported or written from the current scene), answer
 * it with the playhead at t = 0 and the results hidden, reveal (play the animation, check each answer against the
 * simulation), try again, another set of numbers for built-in problems, and the teacher's side — write the
 * questions for the current scene and export or import problem files.
 */
import { tl, semiSep, activeLang } from '../i18n'
import { reactive } from 'vue'
import { state, loadScene, showToast, rewind, play } from './store'
import type { ProblemSession } from './store'
import { cloneScene, SceneFileError } from '../core/scene/io'
import type { Problem } from '../teaching/problems'
import { parseProblem, ptext, serializeProblem } from '../teaching/problems'
import type { BuiltinProblem } from '../teaching/problemBank'
import { builtinById, builtinProblem, varyParams } from '../teaching/problemBank'
import { safeName } from '../export/safeName'
import { openTextFile, saveFile } from '../platform/files'
import { ask } from '../platform/ask'
import { logEvent } from './trialLog'

/** File type of problem files. */
export function problemFilter() { return [{ name: tl('VeloPhi 题目包'), extensions: ['json'] }] }

function session(problem: Problem, editing: boolean): ProblemSession {
  return reactive({ problem, answers: {}, revealed: false, hints: {}, editing }) as ProblemSession
}

/** Open a problem: its scene replaces the current one (asks first when there are unsaved changes). */
export async function openProblem(problem: Problem, opts: { editing?: boolean; confirm?: boolean } = {}): Promise<boolean> {
  if (opts.confirm !== false && state.dirty && !(await ask(tl('当前场景有未保存的修改，确定打开题目吗？')))) return false
  loadScene(cloneScene(problem.scene), null)
  state.problem = session(problem, !!opts.editing)
  state.page = 'studio'
  state.rightTab = 'problem'
  state.bottomTab = 'chart'
  state.showProblems = false
  rewind()
  logEvent('problem.open', { problem: problem.builtin ?? 'custom' })
  return true
}

/** Open a built-in problem with its own or the given parameters. */
export function openBuiltin(spec: BuiltinProblem, params?: Record<string, number>): Promise<boolean> {
  return openProblem(builtinProblem(spec, params))
}

/** A built-in problem with another set of numbers (parameters drawn in its ranges). */
export async function anotherSet() {
  const p = state.problem
  const spec = p?.problem.builtin ? builtinById(p.problem.builtin) : undefined
  if (!spec) return
  await openProblem(builtinProblem(spec, varyParams(spec)), { confirm: false })
}

/** Check the answers: the run plays from the start and the results are shown. */
export function reveal() {
  const p = state.problem
  if (!p) return
  p.revealed = true
  rewind()
  play()
  logEvent('problem.reveal', { problem: p.problem.builtin ?? 'custom', answered: Object.values(p.answers).filter(v => v !== null && v !== undefined).length })
}

/** Answer again: answers cleared, results hidden, back to t = 0. */
export function retry() {
  const p = state.problem
  if (!p) return
  p.answers = {}
  p.hints = {}
  p.revealed = false
  rewind()
}

/** Leave problem mode (the scene stays). */
export function exitProblem() { state.problem = null }

/** Teacher: a new problem for the current scene (questions written in the problem panel). */
export function newProblemFromScene() {
  const problem: Problem = {
    id: `custom-${Date.now().toString(36)}`,
    title: state.scene.name || tl('新题目'),
    chapter: '',
    stem: state.scene.description ?? '',
    scene: cloneScene(state.scene),
    questions: []
  }
  state.problem = session(problem, true)
  state.page = 'studio'
  state.rightTab = 'problem'
  state.showProblems = false
}

/** The problem with the scene as it is now (the teacher may have edited it). */
export function currentProblem(): Problem | null {
  const p = state.problem
  if (!p) return null
  return { ...p.problem, scene: cloneScene(state.scene) }
}

/** Export the problem as a problem file. */
export async function exportProblem() {
  const p = currentProblem()
  if (!p) return
  if (!p.questions.length) { showToast(tl('请先添加至少一个问题'), true); return }
  try {
    const name = `${safeName(ptext(p.title, activeLang()) || tl('题目'))}.velophi-problem.json`
    const path = await saveFile(serializeProblem(p), name, problemFilter())
    if (path) { showToast(tl('已保存 {0}', [path])); logEvent('problem.export', { questions: p.questions.length }) }
  } catch (e) {
    showToast(tl('保存失败：{0}', [(e as Error).message]), true)
  }
}

/** Import a problem file and open it. */
export async function importProblem() {
  if (state.dirty && !(await ask(tl('当前场景有未保存的修改，确定打开题目吗？')))) return
  try {
    const f = await openTextFile(problemFilter())
    if (!f) return
    await openProblemText(f.text, f.name)
  } catch (e) {
    showToast(e instanceof SceneFileError ? tl('无法打开：{0}', [e.message]) : tl('打开失败：{0}', [(e as Error).message]), true)
  }
}

/** Open the text of a problem file (also used when a problem file is opened as a scene). */
export async function openProblemText(text: string, name: string) {
  const { problem, warnings } = parseProblem(text)
  if (!(await openProblem(problem, { confirm: false }))) return
  showToast(warnings.length ? warnings.join(semiSep()) : tl('已打开题目 {0}', [name]))
}
