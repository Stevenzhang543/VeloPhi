/**
 * 26.63 (D238): the one retry layer of the AI requests, the capability table, request ids, and the client end to end
 * through a fake transport (busy → retry after the time asked for; quota and refusals are not retried).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AiError } from '../../src/ai/types'
import { RETRY, isTransient, parseRetryAfter, retryDelay, withRetry } from '../../src/ai/retry'
import { ANTHROPIC, GENERIC, capabilitiesOf } from '../../src/ai/capabilities'
import { chat, aiLog, resetCaps, wireRequest, knownCapabilities } from '../../src/ai/client'
import { setTransport } from '../../src/platform/net'
import type { NetRequest, NetResponse } from '../../src/platform/net'
import { settings } from '../../src/app/settings'
import { setKey } from '../../src/ai/keys'

const isAi = (e: unknown): e is AiError => e instanceof AiError
const err = (code: AiError['code'], status?: number, retryAfterMs?: number | null) => { const e = new AiError(code, code); e.status = status; e.retryAfterMs = retryAfterMs; return e }

describe('retry layer', () => {
  it('reads Retry-After as seconds or a date', () => {
    expect(parseRetryAfter('7')).toBe(7000)
    expect(parseRetryAfter('1.5')).toBe(1500)
    expect(parseRetryAfter(null)).toBeNull()
    expect(parseRetryAfter('soon')).toBeNull()
    const now = Date.parse('2026-11-12T08:00:00Z')
    expect(parseRetryAfter('Thu, 12 Nov 2026 08:00:20 GMT', now)).toBe(20000)
    expect(parseRetryAfter('Thu, 12 Nov 2026 07:59:00 GMT', now)).toBe(0)
  })

  it('knows which failures pass', () => {
    expect(isTransient(err('busy', 429))).toBe(true)
    expect(isTransient(err('network'))).toBe(true)
    expect(isTransient(err('server', 502))).toBe(true)
    expect(isTransient(err('server', 501))).toBe(false)
    for (const c of ['quota', 'unauthorized', 'rejected', 'timeout', 'aborted', 'vision', 'not_configured'] as const) expect(isTransient(err(c)), c).toBe(false)
  })

  it('waits what the server asked, else backs off with jitter inside the bounds', () => {
    expect(retryDelay(0, 3000, () => 0)).toBe(3000)
    expect(retryDelay(0, 3000, () => 0.999)).toBeLessThanOrEqual(3250)
    expect(retryDelay(0, RETRY.maxServerWaitMs + 1, () => 0)).toBeNull()
    for (const r of [0, 0.5, 0.999]) {
      for (let a = 0; a < 6; a++) {
        const d = retryDelay(a, null, () => r)!
        const ceiling = Math.min(RETRY.capMs, RETRY.baseMs * 2 ** a)
        expect(d).toBeGreaterThanOrEqual(Math.round(0.2 * ceiling))
        expect(d).toBeLessThanOrEqual(ceiling)
      }
    }
  })

  it('retries passing failures up to the limit and nothing else', async () => {
    const waits: number[] = []
    const sleep = async (ms: number) => { waits.push(ms) }
    let n = 0
    const ok = await withRetry(async () => { if (n++ < 2) throw err('busy', 429, 100); return 'done' }, isAi, { sleep, rand: () => 0 })
    expect(ok).toBe('done'); expect(n).toBe(3); expect(waits).toEqual([100, 100])
    n = 0
    await expect(withRetry(async () => { n++; throw err('server', 503) }, isAi, { sleep, rand: () => 0 })).rejects.toMatchObject({ code: 'server' })
    expect(n).toBe(1 + RETRY.retries)
    n = 0
    await expect(withRetry(async () => { n++; throw err('quota', 429) }, isAi, { sleep })).rejects.toMatchObject({ code: 'quota' })
    expect(n).toBe(1)
    // a wait the server made too long is not waited for
    n = 0
    await expect(withRetry(async () => { n++; throw err('busy', 429, 120000) }, isAi, { sleep })).rejects.toMatchObject({ code: 'busy' })
    expect(n).toBe(1)
  })

  it('a cancelled request stops waiting', async () => {
    const ctrl = new AbortController()
    let n = 0
    const p = withRetry(async () => { n++; throw err('busy', 429, 20000) }, isAi, { signal: ctrl.signal })
    setTimeout(() => ctrl.abort(), 20)
    await expect(p).rejects.toMatchObject({ code: 'busy' })
    expect(n).toBe(1)
  })
})

describe('capability table', () => {
  it('matches services by address and model', () => {
    expect(capabilitiesOf('https://api.openai.com/v1', 'gpt-4o-mini')).toMatchObject({ jsonSchema: true, temperature: true, maxCompletionTokens: false })
    expect(capabilitiesOf('https://api.openai.com/v1', 'o3-mini')).toMatchObject({ jsonSchema: true, temperature: false, maxCompletionTokens: true })
    expect(capabilitiesOf('https://api.deepseek.com', 'deepseek-chat')).toMatchObject({ jsonSchema: false, jsonObject: true, tools: true })
    expect(capabilitiesOf('https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen-vl-max')).toMatchObject({ formatWithImage: false })
    expect(capabilitiesOf('https://example.org/v1', 'some-model')).toEqual(GENERIC)
    expect(ANTHROPIC.jsonObject).toBe(false)
  })
})

describe('client through the retry layer', () => {
  const calls: NetRequest[] = []
  const before = JSON.parse(JSON.stringify(settings.ai))
  const answer = (text: string): NetResponse => ({ status: 200, contentType: 'application/json', retryAfter: null, body: JSON.stringify({ choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }], model: 'm' }) })
  beforeEach(() => {
    calls.length = 0
    aiLog.entries.length = 0
    resetCaps()
    Object.assign(settings.ai, { connection: 'openai', openai: { baseUrl: 'https://example.org/v1', model: 'some-model', vision: false } })
    setKey('openai', 'test-key')
  })
  afterEach(() => { setTransport(null); Object.assign(settings.ai, before) })

  it('a busy service is asked again after the time it gave; the log keeps one id for both tries', async () => {
    let n = 0
    setTransport(async req => { calls.push(req); return n++ === 0 ? { status: 429, contentType: 'application/json', retryAfter: '0', body: '{"error":{"message":"slow down"}}' } : answer('ok') })
    const r = await chat({ messages: [{ role: 'user', content: 'hi' }], purpose: 'test' })
    expect(r.message.content).toBe('ok')
    expect(calls.length).toBe(2)
    const [second, first] = aiLog.entries
    expect(first.status).toContain('HTTP 429'); expect(second.status).toBe('ok')
    expect(first.id).toBeTruthy(); expect(first.id).toBe(second.id)
    expect(first.attempt).toBe(1); expect(second.attempt).toBe(2)
    // a browser talking to the user's own provider sends no extra header (it could fail the preflight)
    expect(Object.keys(calls[0].headers ?? {}).map(h => h.toLowerCase())).not.toContain('x-client-request-id')
  })

  it('a refused request and an invalid key are not retried', async () => {
    setTransport(async req => { calls.push(req); return { status: 401, contentType: 'application/json', retryAfter: null, body: '{"error":{"message":"bad key"}}' } })
    await expect(chat({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toMatchObject({ code: 'unauthorized', status: 401 })
    expect(calls.length).toBe(1)
  })

  it('a strict schema goes out only where the service has it', () => {
    const fmt = { type: 'json_schema' as const, json_schema: { name: 't', strict: true as const, schema: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false } } }
    const req = { messages: [{ role: 'user' as const, content: 'x' }], response_format: fmt }
    expect(knownCapabilities().jsonSchema).toBe(false)
    expect(wireRequest(req, 'generic').response_format).toEqual({ type: 'json_object' })
    settings.ai.openai = { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', vision: true }
    expect(knownCapabilities().jsonSchema).toBe(true)
    expect(wireRequest(req, 'generic').response_format).toEqual(fmt)
    // the known table: a reasoning model takes no temperature and the renamed limit
    settings.ai.openai = { baseUrl: 'https://api.openai.com/v1', model: 'o3-mini', vision: true }
    const w = wireRequest({ ...req, temperature: 0.2, max_tokens: 100 }, 'generic')
    expect(w.temperature).toBeUndefined(); expect(w.max_completion_tokens).toBe(100); expect(w.max_tokens).toBeUndefined()
  })
})
