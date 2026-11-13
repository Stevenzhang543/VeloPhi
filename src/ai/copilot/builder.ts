/**
 * The scene builder (26.60, D204): one request whose answer is exactly one JSON object (the scene file and the
 * questions, simPrompt.ts), parsed leniently (a code block, text around it, trailing commas), checked, placed and
 * loaded by applyAiScene; what is wrong goes back for a corrected object, at most three tries in all. The chat
 * Copilot reaches it through the build_scene tool, the user through "生成仿真场景" under the answer to a problem.
 */
import { tl } from '../../i18n'
import { DATA_RULE } from '../import/prompts'
import { chat } from '../client'
import type { ChatMessage } from '../types'
import { builderAsk, builderSystem, continueNote, repairNote } from './simPrompt'
import { extractJsonObject } from '../looseJson'
import type { BuildAsk } from './simPrompt'
import { applyAiScene } from './simTools'
import { ToolError } from './tools'
import { AiError } from '../types'
import type { SceneCard } from './simTools'
import { logEvent } from '../../app/trialLog'

/** Most tries of one build (the first answer and two corrections). */
export const BUILD_TRIES = 3

export type BuildResult =
  | { ok: true; card: SceneCard; result: Record<string, unknown>; tries: number; assumptions: string[] }
  | { ok: false; errors: string[]; tries: number; raw: string; refused?: string }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** How much an object looks like the builder's answer (the scene file or {scene, questions}). */
const sceneScore = (o: Record<string, unknown>) => (isObj(o.scene) ? 20 : 0) + (Array.isArray(o.bodies) ? 15 : 0) + (Array.isArray(o.questions) ? 3 : 0) + (typeof o.error === 'string' ? 5 : 0)

/**
 * The JSON object of an answer (26.61: the tolerant reader of looseJson.ts — fences, prose, thinking, almost-JSON,
 * a cut-off end); null when there is none.
 */
export function jsonOf(text: string): Record<string, unknown> | null { return extractJsonObject(text, sceneScore)?.value ?? null }

/** Most continuations of one cut-off answer. */
const CONTINUATIONS = 2

/** Build a scene with the builder and load it; `onStatus` reports the steps. */
export async function buildScene(ask: BuildAsk, opts: { signal?: AbortSignal; onStatus?: (s: string) => void; title?: string; think?: boolean } = {}): Promise<BuildResult> {
  const messages: ChatMessage[] = [{ role: 'system', content: builderSystem() + DATA_RULE }, { role: 'user', content: builderAsk(ask) }]
  let errors: string[] = []
  let raw = ''
  for (let k = 1; k <= BUILD_TRIES; k++) {
    opts.onStatus?.(k === 1 ? tl('正在写场景文件（JSON）') : tl('正在修正场景文件（第 {0} 次）', [k - 1]))
    // 26.60 r2: with "深度思考" on the builder thinks too (harder set-ups: compounds, arcs, several stages)
    // 26.61: JSON mode where the connection has it (the client learns when it does not)
    const res = await chat({ messages, temperature: 0.1, max_tokens: opts.think ? 24000 : 12000, reasoning: opts.think ? 'on' : 'off', purpose: 'copilot-build', response_format: { type: 'json_object' } }, { signal: opts.signal })
    raw = typeof res.message.content === 'string' ? res.message.content : ''
    let reasoning = res.message.reasoning_content
    // 26.61: an answer cut off by the token limit is continued (at most twice) instead of being rejected
    let cut = res.truncated
    for (let c = 0; c < CONTINUATIONS && (cut || extractJsonObject(raw, sceneScore)?.truncated === true) && raw.trim(); c++) {
      opts.onStatus?.(tl('场景文件太长被截断，正在续写'))
      const more = await chat({ messages: [...messages, { role: 'assistant', content: raw }, { role: 'user', content: continueNote() }], temperature: 0.1, max_tokens: opts.think ? 24000 : 12000, reasoning: 'off', purpose: 'copilot-build' }, { signal: opts.signal })
      const tail = typeof more.message.content === 'string' ? more.message.content : ''
      // A model that starts again from the beginning: its new answer replaces the old one
      const fresh = extractJsonObject(tail, sceneScore)
      raw = fresh && !fresh.truncated && /^\s*(```|\{)/.test(tail) ? tail : raw + tail.replace(/^\s*```(?:json)?\s*/i, '')
      cut = more.truncated
      if (opts.think && more.message.reasoning_content) reasoning = more.message.reasoning_content
      logEvent('copilot.build.continue', { tries: k, n: c + 1 })
    }
    let parseError = ''
    const got = extractJsonObject(raw, sceneScore, e => { parseError = `JSON syntax error at line ${e.line}, column ${e.column} (${e.error}): …${e.context}…` })
    const obj = got?.value ?? null
    const repaired = got?.repairs.length ? [tl('JSON 已自动修复：{0}', [got.repairs.slice(0, 6).join('；')])] : []
    if (!obj) errors = [cut ? 'the answer was cut off before the JSON object ended, also after continuing: keep it shorter (fewer bodies, no comments, no explanations)' : parseError || 'the answer is not one JSON object: output only the JSON object, starting with { and ending with }']
    else if (got?.truncated) errors = ['the JSON object was cut off (it ends before all brackets are closed): write the complete file again, shorter (fewer bodies, no comments)']
    else if (typeof obj.error === 'string' && !obj.scene && !obj.bodies) {
      logEvent('copilot.build', { ok: false, refused: true, tries: k })
      return { ok: false, errors: [], tries: k, raw, refused: obj.error }
    } else {
      opts.onStatus?.(tl('检查并载入场景'))
      const title = typeof obj.title === 'string' ? obj.title : opts.title
      const stem = typeof obj.stem === 'string' ? obj.stem : ask.problem
      // 26.60 r2: an unexpected failure while loading goes back to the builder as a problem, not to the user as a crash
      const r = await applyAiScene(obj.scene ?? obj, obj.questions, { title, stem, signal: opts.signal }).catch((e: unknown) => {
        // The user's choices (keeping unsaved changes, declining) and a stop are not the file's fault
        if (opts.signal?.aborted || e instanceof ToolError || e instanceof AiError) throw e
        return { ok: false as const, errors: [`the app could not load this file: ${(e as Error)?.message ?? String(e)}`], notes: [] }
      })
      if (r.ok) {
        if (repaired.length) r.card.notes = [...repaired, ...r.card.notes]
        const assumptions = Array.isArray(obj.assumptions) ? obj.assumptions.filter((x): x is string => typeof x === 'string').slice(0, 8) : []
        logEvent('copilot.build', { ok: true, tries: k })
        return { ok: true, card: r.card, result: r.result, tries: k, assumptions }
      }
      errors = r.errors
    }
    if (k < BUILD_TRIES) messages.push({ role: 'assistant', content: raw, ...(opts.think && reasoning ? { reasoning_content: reasoning } : {}) }, { role: 'user', content: repairNote(errors) })
  }
  logEvent('copilot.build', { ok: false, tries: BUILD_TRIES })
  return { ok: false, errors, tries: BUILD_TRIES, raw }
}
