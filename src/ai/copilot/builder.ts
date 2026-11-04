/**
 * The scene builder (26.60, D204): one request whose answer is exactly one JSON object (the scene file and the
 * questions, simPrompt.ts), parsed leniently (a code block, text around it, trailing commas), checked, placed and
 * loaded by applyAiScene; what is wrong goes back for a corrected object, at most three tries in all. The chat
 * Copilot reaches it through the build_scene tool, the user through "生成仿真场景" under the answer to a problem.
 */
import { tl } from '../../i18n'
import { chat } from '../client'
import type { ChatMessage } from '../types'
import { builderAsk, builderSystem, repairNote } from './simPrompt'
import type { BuildAsk } from './simPrompt'
import { applyAiScene } from './simTools'
import type { SceneCard } from './simTools'
import { logEvent } from '../../app/trialLog'

/** Most tries of one build (the first answer and two corrections). */
export const BUILD_TRIES = 3

export type BuildResult =
  | { ok: true; card: SceneCard; result: Record<string, unknown>; tries: number; assumptions: string[] }
  | { ok: false; errors: string[]; tries: number; raw: string; refused?: string }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * The JSON object of an answer: the whole text, a fenced block, or the outermost braces; trailing commas and
 * comments are forgiven. Null when there is none.
 */
export function jsonOf(text: string): Record<string, unknown> | null {
  const tries: string[] = [text.trim()]
  const fence = /```(?:json|jsonc|velophi)?\s*\n?([\s\S]*?)```/i.exec(text)
  if (fence) tries.push(fence[1].trim())
  const a = text.indexOf('{'), b = text.lastIndexOf('}')
  if (a >= 0 && b > a) tries.push(text.slice(a, b + 1))
  for (const t of tries) {
    for (const s of [t, lenient(t)]) {
      try { const v = JSON.parse(s) as unknown; if (isObj(v)) return v } catch { /* next */ }
    }
  }
  return null
}

/** Remove comments and trailing commas (outside strings). */
function lenient(s: string): string {
  let out = '', inStr = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inStr) { out += c; if (c === '\\') { out += s[++i] ?? '' } else if (c === '"') inStr = false; continue }
    if (c === '"') { inStr = true; out += c; continue }
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue }
    if (c === '/' && s[i + 1] === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i++; continue }
    if (c === ',') { let j = i + 1; while (j < s.length && /\s/.test(s[j])) j++; if (s[j] === '}' || s[j] === ']') continue }
    out += c
  }
  return out
}

/** Build a scene with the builder and load it; `onStatus` reports the steps. */
export async function buildScene(ask: BuildAsk, opts: { signal?: AbortSignal; onStatus?: (s: string) => void; title?: string } = {}): Promise<BuildResult> {
  const messages: ChatMessage[] = [{ role: 'system', content: builderSystem() }, { role: 'user', content: builderAsk(ask) }]
  let errors: string[] = []
  let raw = ''
  for (let k = 1; k <= BUILD_TRIES; k++) {
    opts.onStatus?.(k === 1 ? tl('正在写场景文件（JSON）') : tl('正在修正场景文件（第 {0} 次）', [k - 1]))
    const res = await chat({ messages, temperature: 0.1, max_tokens: 12000, reasoning: 'off', purpose: 'copilot-build' }, { signal: opts.signal })
    raw = typeof res.message.content === 'string' ? res.message.content : ''
    const obj = jsonOf(raw)
    if (!obj) errors = [res.truncated ? 'the answer was cut off before the JSON object ended: keep it shorter (fewer bodies, no comments)' : 'the answer is not one JSON object: output only the JSON object, starting with { and ending with }']
    else if (typeof obj.error === 'string' && !obj.scene && !obj.bodies) {
      logEvent('copilot.build', { ok: false, refused: true, tries: k })
      return { ok: false, errors: [], tries: k, raw, refused: obj.error }
    } else {
      opts.onStatus?.(tl('检查并载入场景'))
      const title = typeof obj.title === 'string' ? obj.title : opts.title
      const stem = typeof obj.stem === 'string' ? obj.stem : ask.problem
      const r = await applyAiScene(obj.scene ?? obj, obj.questions, { title, stem })
      if (r.ok) {
        const assumptions = Array.isArray(obj.assumptions) ? obj.assumptions.filter((x): x is string => typeof x === 'string').slice(0, 8) : []
        logEvent('copilot.build', { ok: true, tries: k })
        return { ok: true, card: r.card, result: r.result, tries: k, assumptions }
      }
      errors = r.errors
    }
    if (k < BUILD_TRIES) messages.push({ role: 'assistant', content: raw }, { role: 'user', content: repairNote(errors) })
  }
  logEvent('copilot.build', { ok: false, tries: BUILD_TRIES })
  return { ok: false, errors, tries: BUILD_TRIES, raw }
}
