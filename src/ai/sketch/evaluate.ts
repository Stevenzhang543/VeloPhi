/**
 * Evaluation of scene builds (26.64, D285): the engine's answers of a built scene for its questions, held against the
 * answers the engine gives for the built-in problem the statement was taken from. Used by scripts/copilot-eval.mjs
 * (against the real service, or offline on replay samples) and by the tests. Also one build with the scene-file
 * builder of 26.60 through the same `ask`, for the baseline.
 */
import type { Scene } from '../../core/scene/types'
import { simulate } from '../../engine/recording'
import { recognize } from '../../formula/recognize'
import { evaluateProblemTarget } from '../../teaching/problems'
import type { CheckedQuestion } from '../import/contract'
import { DATA_RULE } from '../import/prompts'
import { builderAsk, builderSystem, repairNote } from '../copilot/simPrompt'
import { prepareAiScene } from '../copilot/simScene'
import { extractJsonObject } from '../looseJson'
import type { ChatMessage } from '../types'
import { textOf } from '../types'
import type { AskFn } from './pipeline'

/** The engine's value (SI) for each question of a scene; null where it cannot be read. */
export function readAnswers(scene: Scene, questions: CheckedQuestion[]): Array<number | null> {
  if (!questions.length) return []
  const rec = simulate(scene)
  try {
    if (rec.error) return questions.map(() => null)
    const sits = recognize(rec)
    return questions.map(q => evaluateProblemTarget(rec, sits, q.target).sim)
  } finally { rec.session.free() }
}

export interface Ask { q: string; prompt: string; expected: number; unit: string; tolerance: number }

/**
 * The answers against what was asked, by position (the builder is told to keep the order of the questions). A
 * magnitude is accepted for a signed value: problems ask "how fast", scenes read a component.
 */
export function gradeAnswers(got: Array<number | null>, asks: Ask[]): { correct: number; total: number; each: Array<{ q: string; expected: number; got: number | null; ok: boolean }> } {
  const each = asks.map((a, i) => {
    const v = got[i] ?? null
    const close = (x: number) => Math.abs(x - a.expected) <= Math.max(a.tolerance * Math.abs(a.expected), 1e-6)
    return { q: a.q, expected: a.expected, got: v, ok: v !== null && (close(v) || close(-v)) }
  })
  return { correct: each.filter(e => e.ok).length, total: asks.length, each }
}

/** One build with the scene-file builder of 26.60 (D204): at most three tries, each checked by `prepareAiScene`. */
export async function buildLegacy(problem: string, ask: AskFn): Promise<{ ok: boolean; scene: Scene | null; questions: CheckedQuestion[]; tries: number; errors: string[]; refused?: string }> {
  const messages: ChatMessage[] = [{ role: 'system', content: builderSystem() + DATA_RULE }, { role: 'user', content: builderAsk({ problem }) }]
  let errors: string[] = []
  for (let k = 1; k <= 3; k++) {
    const res = await ask({ messages, temperature: 0.1, max_tokens: 12000, reasoning: 'off', purpose: 'copilot-build', response_format: { type: 'json_object' } })
    const raw = textOf(res.message)
    const obj = extractJsonObject(raw, o => (o.scene ? 20 : 0) + (Array.isArray(o.bodies) ? 15 : 0))?.value ?? null
    if (!obj) errors = ['the answer is not one JSON object']
    else if (typeof obj.error === 'string' && !obj.scene && !obj.bodies) return { ok: false, scene: null, questions: [], tries: k, errors: [], refused: obj.error }
    else {
      const p = prepareAiScene(obj.scene ?? obj, obj.questions)
      if (p.ok) return { ok: true, scene: p.scene, questions: p.questions, tries: k, errors: [] }
      errors = p.errors
    }
    if (k < 3) messages.push({ role: 'assistant', content: raw }, { role: 'user', content: repairNote(errors) })
  }
  return { ok: false, scene: null, questions: [], tries: 3, errors }
}
