/**
 * The sketch build, from a problem text to a checked scene (26.64, D279–D284):
 *
 *   template search → reading notes (free text) → submit_sketch (a function call, strict where the connection has it;
 *   else a JSON-mode answer the app validates itself) → compile → ladder → at most two repair rounds with patches →
 *   the closest template with parameters → an honest failure.
 *
 * The model is reached only through `ask`, so the same code runs in the app (ai/client.ts), in the offline replay of
 * recorded answers (tests/ai/sketch2664/replay.test.ts) and in the evaluation (scripts/copilot-eval.mjs). Nothing here
 * touches the app's state: loading the scene is the caller's business (copilot/builder.ts).
 */
import type { ChatMessage, ChatRequest, ChatResult } from '../types'
import { textOf } from '../types'
import { DATA_RULE } from '../import/prompts'
import { submitPatchTool, submitSketchTool } from './schema'
import type { Diagnostic } from './schema'
import { runLadder } from './check'
import type { Ladder } from './check'
import { applyPatch, fragmentsFor, readPatch } from './patch'
import { PATCH_NOTE, PATCH_NOTE_JSON, SUBMIT_NOTE, SUBMIT_NOTE_JSON, patchAsk, patchSystem, resendNote, sketchAsk, sketchSystem, templateFallbackAsk } from './prompt'
import { rankTemplates } from './templates'
import type { TemplateCandidate } from './templates'
import { STATUS } from './messages'

export type AskFn = (req: ChatRequest) => Promise<ChatResult>
export type Step = 'notes' | 'sketch' | 'patch' | 'template'

/** One answer of the model as it came (a replay sample is a list of these). */
export interface Exchange { step: Step; raw: string; via: 'tool' | 'content' }

export interface PipelineOptions {
  ask: AskFn
  /** Strict function calls (capabilities.ts `strictTools`); false: JSON mode and the app's own validation. */
  strict: boolean
  /** The user's "深度思考": the reading notes are thought about (the constrained call never is). */
  think?: boolean
  candidates?: TemplateCandidate[]
  onStatus?: (text: string) => void
  onExchange?: (x: Exchange) => void
  /** Repair rounds (default and most: 2). */
  maxRepairs?: number
}

export interface BuildOutcome {
  /** A scene may be loaded (`ladder.scene`). */
  ok: boolean
  /** The model says the engine cannot do this problem. */
  refused?: string
  ladder: Ladder | null
  /** The sketch's ladder when a template took over or everything failed (what could not be placed). */
  sketchLadder: Ladder | null
  via: 'sketch' | 'template' | null
  /** Findings after the first answer and after each repair round. */
  rounds: Array<{ codes: string[]; levels: Ladder['levels'] }>
  repairs: number
  requests: number
  notes: string
  /** Patch entries that were rejected. */
  rejected: string[]
  fallback: boolean
}

/** Most repair rounds (D282). */
export const MAX_REPAIRS = 2
/** How often an empty answer is asked again before it counts as unreadable (JSON mode may answer with blanks). */
export const EMPTY_RETRIES = 2
/** Diagnostics sent back in one round. */
const MAX_DIAGNOSTICS = 12

export async function buildFromProblem(input: { problem: string; solution?: string }, opts: PipelineOptions): Promise<BuildOutcome> {
  const problem = input.problem.trim()
  const candidates = opts.candidates ?? rankTemplates(problem, 5)
  const out: BuildOutcome = { ok: false, ladder: null, sketchLadder: null, via: null, rounds: [], repairs: 0, requests: 0, notes: '', rejected: [], fallback: false }
  const system: ChatMessage = { role: 'system', content: sketchSystem() + DATA_RULE }

  /** One request; an answer with nothing in it is asked again (a passing failure, not a round). */
  const call = async (step: Step, messages: ChatMessage[], tool: 'sketch' | 'patch' | null, maxTokens: number): Promise<string> => {
    for (let attempt = 0; ; attempt++) {
      const req: ChatRequest = tool && opts.strict
        ? { messages, tools: [tool === 'sketch' ? submitSketchTool(true) : submitPatchTool(true)], tool_choice: { type: 'function', function: { name: tool === 'sketch' ? 'submit_sketch' : 'submit_patch' } }, temperature: 0.1, max_tokens: maxTokens, reasoning: 'off', purpose: `copilot-sketch-${step}` }
        : { messages, ...(tool ? { response_format: { type: 'json_object' as const } } : {}), temperature: 0.1, max_tokens: maxTokens, reasoning: !tool && opts.think ? 'on' : 'off', purpose: `copilot-sketch-${step}` }
      out.requests++
      const res = await opts.ask(req)
      const args = res.message.tool_calls?.[0]?.function.arguments ?? ''
      const raw = args.trim() ? args : textOf(res.message)
      if (raw.trim() || attempt >= EMPTY_RETRIES) { opts.onExchange?.({ step, raw, via: args.trim() ? 'tool' : 'content' }); return raw }
      opts.onStatus?.(STATUS.retry())
    }
  }
  const round = (l: Ladder) => { out.rounds.push({ codes: l.diagnostics.map(d => d.code), levels: l.levels }) }

  // 1 · reading notes: free text first — constrained output alone loses accuracy
  opts.onStatus?.(STATUS.notes())
  const ask: ChatMessage = { role: 'user', content: sketchAsk({ problem, solution: input.solution }, candidates) }
  out.notes = (await call('notes', [system, ask], null, opts.think ? 6000 : 900)).trim()
  // 2 · the constrained call
  opts.onStatus?.(STATUS.sketch())
  const submit = (extra = ''): ChatMessage[] => [system, ask, { role: 'assistant', content: out.notes || '…' }, { role: 'user', content: (opts.strict ? SUBMIT_NOTE : SUBMIT_NOTE_JSON) + (extra ? `\n\n${extra}` : '') }]
  let raw = await call('sketch', submit(), 'sketch', 6000)
  opts.onStatus?.(STATUS.check())
  let ladder = runLadder(raw, problem)
  round(ladder)

  // 3 · repairs: patches for what the diagnostics name, never the conversation again
  const most = Math.min(MAX_REPAIRS, opts.maxRepairs ?? MAX_REPAIRS)
  let rejectedLast: string[] = []
  for (let k = 1; k <= most && !ladder.ok && ladder.via !== 'unsupported'; k++) {
    opts.onStatus?.(STATUS.repair(k))
    out.repairs = k
    const diagnostics = ladder.diagnostics.slice(0, MAX_DIAGNOSTICS)
    if (!ladder.sketch) {
      // nothing to patch: the answer was not a sketch at all
      raw = await call('sketch', submit(resendNote(diagnostics)), 'sketch', 6000)
      ladder = runLadder(raw, problem)
    } else {
      const fragments = fragmentsFor(ladder.sketch, diagnostics)
      const text = await call('patch', [{ role: 'system', content: patchSystem() + DATA_RULE }, { role: 'user', content: `${patchAsk(problem, fragments, diagnostics, rejectedLast)}\n\n${opts.strict ? PATCH_NOTE : PATCH_NOTE_JSON}` }], 'patch', 2500)
      const patch = readPatch(text)
      const done = applyPatch(ladder.sketch, patch.entries, diagnostics)
      rejectedLast = patch.error ? [patch.error] : done.rejected
      out.rejected.push(...rejectedLast)
      // a patch that changed nothing leaves the findings as they are (the round is used up)
      if (done.applied.length) ladder = runLadder(done.sketch, problem)
    }
    opts.onStatus?.(STATUS.check())
    round(ladder)
  }

  if (ladder.via === 'unsupported') { out.ladder = ladder; out.refused = ladder.sketch?.reason || 'unsupported'; return out }
  if (ladder.ok) { out.ok = true; out.ladder = ladder; out.via = ladder.via === 'template' ? 'template' : 'sketch'; return out }

  // 4 · the closest template with parameters (when the model did not already try one)
  if (ladder.via !== 'template' && candidates.length) {
    opts.onStatus?.(STATUS.template())
    out.fallback = true
    const text = await call('template', [system, { role: 'user', content: `${templateFallbackAsk(problem, candidates)}\n\n${opts.strict ? SUBMIT_NOTE : SUBMIT_NOTE_JSON}` }], 'sketch', 3000)
    const t = runLadder(text, problem)
    round(t)
    if (t.via === 'template' && t.ok) { out.ok = true; out.ladder = t; out.sketchLadder = ladder; out.via = 'template'; return out }
    // a sketch whose scene stands (only the contract with the text has findings) is better than a template that does not
    if (!ladder.loadable && t.via === 'template' && t.loadable) { out.ok = true; out.ladder = t; out.sketchLadder = ladder; out.via = 'template'; return out }
  }
  // 5 · a scene that passed geometry and trial run is loaded with its findings told; anything else is not loaded
  out.ladder = ladder
  out.sketchLadder = ladder
  if (ladder.loadable) { out.ok = true; out.via = ladder.via === 'template' ? 'template' : 'sketch' }
  return out
}

/** The findings that keep a scene from being loaded (levels 0–3), or all of them when there are none of those. */
export function blocking(l: Ladder): Diagnostic[] {
  const hard = l.diagnostics.filter(d => d.level <= 3)
  return hard.length ? hard : l.diagnostics
}
