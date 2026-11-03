/**
 * The answers of a reading and its solution path (26.59 fix, D189). Every number comes from the app: the simulation
 * for problems (once the scene is computed), the task solver, the analytic model, or the equation solver. The AI's
 * solution steps refer to them as {1}, {2} …, filled in here, so the explanation never carries a number the AI made up.
 */
import { tl } from '../../i18n'
import { state } from '../../app/store'
import { fmtQ } from '../../app/settings'
import { questionKey, ptext } from '../../teaching/problems'
import { recognize } from '../../formula/recognize'
import { currentResults, taskUi } from '../../app/task/taskState'
import { targetSpec } from '../../task/vocab'
import { aiImport, modelOutputs } from './pipeline'
import type { ImportSuccess } from './pipeline'

export interface AnswerLine { prompt: string; value: number | null; unit: string; text: string; note?: string }

const fmt = (v: number | null, unit: string): string => {
  if (v === null || !Number.isFinite(v)) return '—'
  const s = fmtQ(v, unit)
  return s && s !== '—' ? s : `${Number(v.toPrecision(4))}${unit ? ` ${unit}` : ''}`
}

/** Whether the scene now in the app is the one this reading loaded, computed and current. */
function loadedProblem(o: ImportSuccess): boolean {
  const id = aiImport.loaded?.kind === 'problem' ? aiImport.loaded.id : undefined
  return !!id && state.problem?.problem.id === id && (o.build.kind === 'template' || o.build.kind === 'scene')
}

/**
 * The answers now: null while they are not available yet (the scene is still being computed, or the reading was
 * not loaded), [] when the reading asks nothing numeric.
 */
export function answersOf(o: ImportSuccess): AnswerLine[] | null {
  const b = o.build
  if (b.kind === 'equations') {
    const none = b.result.verdict === 'inconsistent' ? tl('无解（见结论）') : b.result.verdict === 'underdetermined' ? tl('不能确定') : '—'
    return b.result.answers.map(a => ({ prompt: a.prompt, value: a.value, unit: a.unit, text: a.value === null ? none : fmt(a.value, a.unit) }))
  }
  if (b.kind === 'model') return modelOutputs(b).map(x => ({ prompt: x.label, value: x.value, unit: x.unit, text: fmt(x.value, x.unit) }))
  if (b.kind === 'task') {
    if (!taskUi.task) return null
    const res = currentResults()
    if (!res.length) return null
    return res.map(r => {
      const v = r.value?.scalarSI ?? null
      const label = targetSpec(taskUi.task!.domain, r.targetId.split('#')[0])?.label ?? r.targetId
      return { prompt: tl(label), value: v, unit: r.value?.unit ?? '', text: r.value?.text ?? fmt(v, r.value?.unit ?? '') }
    })
  }
  if (!loadedProblem(o)) return null
  return problemAnswers(state.problem!.problem.id)
}

/**
 * The answers of the open problem `id` from its simulation (26.59 fix 3, D198: also the simulation Copilot's
 * scenes): null while another problem is open or the run is still being computed.
 */
export function problemAnswers(id: string): AnswerLine[] | null {
  if (state.problem?.problem.id !== id) return null
  const rec = !state.stale && state.recording && state.recording.completed !== false && !state.computing ? state.recording : null
  if (!rec) return null
  // Read only once the run is complete (events late in the run are not known before)
  void state.run.tComputed
  const sits = state.situations.length ? state.situations : recognize(rec)
  return state.problem!.problem.questions.map(q => {
    const prompt = ptext(q.prompt, 'zh')
    try {
      const k = questionKey(rec, sits, q)
      return { prompt, value: typeof k.value === 'number' ? k.value : null, unit: k.unit, text: q.type === 'numeric' ? fmt(typeof k.value === 'number' ? k.value : null, k.unit) : String(k.value ?? '—'), note: k.note }
    } catch {
      return { prompt, value: null, unit: '', text: '—', note: tl('无法读取答案') }
    }
  })
}

/** The solution steps with {1}, {2} … replaced by the answers (or "…" while they are computed). */
export function solutionSteps(o: ImportSuccess, answers: AnswerLine[] | null): string[] {
  return o.solution.map(s => s.replace(/\{(\d{1,2})\}/g, (_, n: string) => answers?.[Number(n) - 1]?.text ?? '…'))
}

/** Wait (up to `ms`) for the answers of a loaded reading — the simulation computes in the background. */
export async function waitForAnswers(o: ImportSuccess, ms = 15000): Promise<AnswerLine[] | null> {
  const t0 = Date.now()
  for (;;) {
    const a = answersOf(o)
    if (a) return a
    if (Date.now() - t0 > ms) return null
    await new Promise(r => setTimeout(r, 250))
  }
}

/** Wait (up to `ms`) for the answers of the open problem `id`. */
export async function waitForProblemAnswers(id: string, ms = 15000): Promise<AnswerLine[] | null> {
  const t0 = Date.now()
  for (;;) {
    const a = problemAnswers(id)
    if (a) return a
    if (Date.now() - t0 >= ms) return null
    await new Promise(r => setTimeout(r, 250))
  }
}

/** A plain-text account of a reading (the Copilot conversation and the import_problem tool). */
export function outcomeText(o: ImportSuccess, answers: AnswerLine[] | null): string {
  const lines: string[] = []
  const b = o.build
  const kind = b.kind === 'template' ? tl('仿真模板') : b.kind === 'scene' ? tl('自建场景') : b.kind === 'equations' ? tl('自建方程模型') : b.kind === 'task' ? tl('解析求解与核对') : tl('解析模型')
  lines.push(`${tl('已识别并建模（{0}）：{1}', [kind, o.first.summary])}`)
  if (answers?.length) lines.push(`${tl('答案')}：${answers.map((a, i) => `(${i + 1}) ${a.prompt} = ${a.text}`).join('；')}`)
  if (o.conclusion) lines.push(`${tl('结论')}：${o.conclusion}`)
  const steps = solutionSteps(o, answers)
  if (steps.length) lines.push(`${tl('思路')}：${steps.map((s, i) => `${i + 1}. ${s}`).join(' ')}`)
  if (o.assumptions.length) lines.push(`${tl('假设')}：${o.assumptions.join('；')}`)
  return lines.join('\n')
}
