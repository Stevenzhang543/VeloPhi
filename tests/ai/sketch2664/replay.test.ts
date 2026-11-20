/**
 * 26.64 (D285): offline replay. Every sample in tests/fixtures/copilot/replay is the list of raw answers a model gave
 * for one problem (notes, the sketch, patches, the template fallback); the whole build runs on them without a network
 * — reading, compiling, the ladder, the repairs — and must end as the sample's `expect` says: loaded or not, by which
 * way, after which findings in each round, with the engine's answers (relative 1e-6).
 *
 * The samples of this version were written by hand (`"origin": "handwritten"`): realistic answers with the typical
 * mistakes — a wrong unit, a missing connector end, a floating body, an unused and a hallucinated given, a circular
 * placement. Samples recorded from the real service (scripts/copilot-eval.mjs --record) replace them.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildFromProblem } from '../../../src/ai/sketch/pipeline'
import type { BuildOutcome, Step } from '../../../src/ai/sketch/pipeline'
import { failureLines } from '../../../src/ai/sketch/messages'
import type { ChatRequest, ChatResult } from '../../../src/ai/types'
import { EngineSession } from '../../../src/engine/session'
import type { Scene } from '../../../src/core/scene/types'
import type { CheckedQuestion } from '../../../src/ai/import/contract'

interface Sample {
  id: string; origin: 'handwritten' | 'recorded'; note: string; problem: string; strict: boolean
  answers: Array<{ step: Step; raw: string }>
  expect: { ok: boolean; via: 'sketch' | 'template' | null; refused?: string; repairs: number; requests: number; rounds: string[][]; rejected: number; answers?: number[]; failure?: string[] }
}

const dir = join(__dirname, '..', '..', 'fixtures', 'copilot', 'replay')
const samples: Sample[] = readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Sample)

/** Replay a sample: each request gets the next recorded answer, which must be of the step asked for. */
export async function replay(s: Sample): Promise<{ outcome: BuildOutcome; requests: ChatRequest[] }> {
  const left = [...s.answers]
  const requests: ChatRequest[] = []
  const outcome = await buildFromProblem({ problem: s.problem }, {
    strict: s.strict,
    ask: async (req): Promise<ChatResult> => {
      requests.push(req)
      const a = left.shift()
      if (!a) throw new Error(`${s.id}: the build asked for more answers than the sample has (${req.purpose})`)
      if (req.purpose !== `copilot-sketch-${a.step}`) throw new Error(`${s.id}: the build asked for ${req.purpose}, the sample's next answer is a ${a.step}`)
      const tool = req.tools?.[0]?.function.name
      // a strict connection answers with the function call, another with text
      return tool ? { message: { role: 'assistant', content: null, tool_calls: [{ id: 'c', type: 'function', function: { name: tool, arguments: a.raw } }] }, finishReason: 'tool_calls' } : { message: { role: 'assistant', content: a.raw }, finishReason: 'stop' }
    }
  })
  if (left.length) throw new Error(`${s.id}: ${left.length} answers of the sample were not asked for`)
  return { outcome, requests }
}

function answer(scene: Scene, q: CheckedQuestion): number {
  const s = EngineSession.simulate(scene, { duration: scene.settings.duration ?? scene.settings.legacyDuration })
  try {
    const t = q.target
    if (t.kind === 'quantity') return s.call<{ values: Float64Array }>({ op: 'evaluate', ids: [t.id], t: t.t }).values[0]
    if (t.kind === 'extreme') return s.call<{ value: number }>({ op: 'extreme', id: t.id, which: t.which }).value
    const events = s.call<{ events: Array<{ index: number; t: number; changes: Array<{ type: string; bodies?: string[] }> }> }>({ op: 'events' }).events
    const e = events.find(x => x.changes.some(c => 'event' in t && c.type === t.event && (!t.body || (c.bodies ?? []).includes(t.body))))!
    if (t.kind === 'event') return e.t
    if (t.kind === 'atEvent') return s.call<{ values: Float64Array }>({ op: 'evaluate', event: e.index, side: t.side, ids: [t.id] }).values[0]
    return NaN
  } finally { s.free() }
}

describe('replay of recorded answers (D285)', () => {
  it('the fixture set: 13 samples, each marked with its origin; the typical mistakes are all there', () => {
    expect(samples).toHaveLength(13)
    for (const s of samples) expect(['handwritten', 'recorded'], s.id).toContain(s.origin)
    const firstCodes = new Set(samples.flatMap(s => s.expect.rounds[0]))
    for (const code of ['L1.dimension', 'L1.reference', 'L2.floating', 'L2.cycle', 'L4.givenUnused', 'L4.quote', 'L4.quoteUnit']) expect(firstCodes, code).toContain(code)
  })

  for (const s of samples) {
    it(`${s.id}: ${s.expect.ok ? `loads via ${s.expect.via}` : s.expect.refused ? 'refused' : 'fails honestly'} after ${s.expect.repairs} repair round(s)`, async () => {
      const { outcome: o, requests } = await replay(s)
      expect({ ok: o.ok, via: o.via, repairs: o.repairs, requests: o.requests, rounds: o.rounds.map(r => r.codes), rejected: o.rejected.length }).toEqual({ ok: s.expect.ok, via: s.expect.via, repairs: s.expect.repairs, requests: s.expect.requests, rounds: s.expect.rounds, rejected: s.expect.rejected })
      expect(o.refused).toBe(s.expect.refused)
      if (s.expect.ok) {
        // loaded only with geometry and trial run passed
        expect(o.ladder!.loadable).toBe(true)
        expect(o.ladder!.levels).toMatchObject({ L0: true, L1: true, L2: true, L3: true })
        const got = o.ladder!.questions.map(q => answer(o.ladder!.scene!, q))
        expect(got).toHaveLength(s.expect.answers!.length)
        got.forEach((v, i) => expect(Math.abs(v - s.expect.answers![i]), `${s.id} answer ${i}: ${v}`).toBeLessThan(1e-6 * Math.max(1, Math.abs(s.expect.answers![i]))))
      } else if (!s.expect.refused) {
        expect(o.ladder!.loadable).toBe(false)
        expect(failureLines(o.sketchLadder!)).toEqual(s.expect.failure)
      }
      // a repair round never resends the conversation: its request is the patch prompt and one user message
      for (const r of requests.filter(x => x.purpose === 'copilot-sketch-patch')) {
        expect(r.messages).toHaveLength(2)
        expect(JSON.stringify(r.messages)).not.toContain(s.answers[0].raw.slice(0, 30))
        expect(String(r.messages[1].content)).toContain('<diagnostics>')
      }
      // strict mode where the connection has it; JSON mode elsewhere
      const sketchReq = requests.find(x => x.purpose === 'copilot-sketch-sketch')!
      if (s.strict) { expect(sketchReq.tools![0].function).toMatchObject({ name: 'submit_sketch', strict: true }); expect(sketchReq.tool_choice).toEqual({ type: 'function', function: { name: 'submit_sketch' } }) } else { expect(sketchReq.tools).toBeUndefined(); expect(sketchReq.response_format).toEqual({ type: 'json_object' }) }
      // the notes come first, as free text
      expect(requests[0].purpose).toBe('copilot-sketch-notes')
      expect(requests[0].tools).toBeUndefined()
      expect(requests[0].response_format).toBeUndefined()
    })
  }
})
