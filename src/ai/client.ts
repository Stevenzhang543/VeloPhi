/**
 * One way to ask the AI (26.59, D148): the request in OpenAI Chat Completions format goes to the connection
 * chosen in the settings — the official proxy (signed in), the user's own OpenAI-compatible provider, or the
 * user's own Anthropic key — and the answer comes back in the same format.
 *
 * 26.59 fix (D180): thinking models. DeepSeek's models think by default, and the thinking counts against
 * `max_tokens`: a structured answer could come back empty or cut off ("the answer must be one JSON object"), and a
 * tool conversation was refused (400) because the thinking was not sent back. Requests now say whether to think
 * (`reasoning`, default off; DeepSeek gets `thinking: {type}`), the thinking text is kept with the assistant turn and
 * sent back while thinking is on, an empty or cut-off answer is asked again once with more room, and every exchange
 * is kept briefly in the AI log (Settings › 账号与 AI) so a failure can be looked at.
 *
 * Fallbacks, remembered per connection: a provider that rejects function tools gets the "JSON protocol" (the tool
 * list in the system prompt, the call as a JSON object in the answer); one that rejects `response_format` gets the
 * request without it; `max_tokens` → `max_completion_tokens` and no `temperature` for providers that ask for that.
 */
import { BREVITY, jsonProtocol, toolLine, toolResult } from './aiText'
import { settings } from '../app/settings'
import { tl } from '../i18n'
import { netRequest, NetError } from '../platform/net'
import type { NetResponse } from '../platform/net'
import { account, cookieMode, official, refreshAccount, signedIn } from './account'
import { getKey } from './keys'
import { fromAnthropic, toAnthropic } from './anthropic'
import { isDesktop } from '../platform/files'
import { AiError } from './types'
import { reactive } from 'vue'
import type { ChatMessage, ChatRequest, ChatResult, ToolCall } from './types'
import { textOf } from './types'

export interface ChatOptions { signal?: AbortSignal; timeoutMs?: number }

/**
 * Capabilities learnt from rejections, per connection (kept for the session and on this computer). Version 2
 * (26.59 fix): DeepSeek's 400 for thinking that was not sent back looked like a refusal of tools and switched
 * connections to the JSON protocol for good; those learnt values are dropped.
 */
const CAPS_KEY = 'velophi.ai.caps.v2'
type Caps = { noTools?: boolean; noJsonFormat?: boolean; maxCompletionTokens?: boolean; noTemperature?: boolean; noThinking?: boolean }
try { localStorage.removeItem('velophi.ai.caps') } catch { /* ignore */ }
let caps: Record<string, Caps> = {}
try { caps = JSON.parse(localStorage.getItem(CAPS_KEY) ?? '{}') as Record<string, Caps> } catch { caps = {} }
function connKey(): string {
  const c = settings.ai.connection
  return c === 'official' ? 'official' : `${c}:${settings.ai[c].baseUrl}:${settings.ai[c].model}`
}
function learn(c: Caps) {
  const k = connKey()
  caps[k] = { ...caps[k], ...c }
  try { localStorage.setItem(CAPS_KEY, JSON.stringify(caps)) } catch { /* ignore */ }
}
/** Forget learnt fallbacks (after the connection settings change, "test connection"). */
export function resetCaps() { caps = {}; try { localStorage.removeItem(CAPS_KEY) } catch { /* ignore */ } }

/** Whether AI can be used now, and if not, why (for the interface). */
export function aiReady(): { ok: true } | { ok: false; reason: string; action: 'signin' | 'key' } {
  const c = settings.ai.connection
  if (c === 'official') return signedIn() ? { ok: true } : { ok: false, reason: tl('登录 whitelists.top 账号即可使用官方 AI，或在设置中填写自己的 API key'), action: 'signin' }
  return getKey(c) ? { ok: true } : { ok: false, reason: tl('请在“设置 › 账号与 AI”中填写 API key'), action: 'key' }
}

/** Provider family of the current connection: decides the thinking switch and whether thinking is sent back. */
export type AiFlavor = 'deepseek' | 'generic' | 'anthropic'
export function aiFlavor(): AiFlavor {
  const c = settings.ai.connection
  if (c === 'anthropic') return 'anthropic'
  if (c === 'official') return account.ai?.provider === 'deepseek' || /deepseek/i.test(account.ai?.model ?? '') ? 'deepseek' : 'generic'
  const p = settings.ai.openai
  return /deepseek/i.test(p.baseUrl) || /^deepseek/i.test(p.model.trim()) ? 'deepseek' : 'generic'
}
/** Whether "深度思考" can be offered: a provider with a thinking switch (and, for the official AI, a server that passes it). */
export function aiCanThink(): boolean {
  if (aiFlavor() !== 'deepseek') return false
  return settings.ai.connection !== 'official' || account.ai?.thinking === true
}

/** Whether the current connection takes images. */
export function aiVision(): boolean {
  const c = settings.ai.connection
  if (c === 'official') return !!account.ai?.vision
  return settings.ai[c].vision
}

/** A short name of the current connection ("官方 · deepseek-…", "OpenAI 兼容 · gpt-…"). */
export function aiLabel(): string {
  const c = settings.ai.connection
  if (c === 'official') return tl('官方') + (account.ai?.model ? ` · ${account.ai.model}` : '')
  return (c === 'openai' ? tl('自带 · OpenAI 兼容') : tl('自带 · Anthropic')) + ` · ${settings.ai[c].model}`
}

function parse<T>(r: NetResponse): T | null { try { return JSON.parse(r.body) as T } catch { return null } }

function netFail(e: unknown): never {
  if (e instanceof NetError) {
    if (e.kind === 'aborted') throw new AiError('aborted', tl('已取消'))
    if (e.kind === 'timeout') throw new AiError('timeout', tl('AI 没有及时回答，请稍后重试'))
    if (e.kind === 'blocked') throw new AiError('blocked', isDesktop ? tl('无法连接 AI 服务，请检查地址与网络') : tl('浏览器无法直接连接该 AI 服务（跨域限制），请改用桌面版或官方 AI'))
    throw new AiError('network', tl('无法连接 AI 服务，请检查网络'), e.message)
  }
  throw e
}

/** Error of a provider's answer (OpenAI / Anthropic / proxy share most status codes). */
function httpFail(r: NetResponse, data: { error?: unknown; code?: string; upstreamMessage?: string } | null): never {
  const msg = typeof data?.error === 'string' ? data.error : (data?.error as { message?: string } | undefined)?.message ?? ''
  const detail = data?.upstreamMessage || msg
  if (r.status === 401 || r.status === 403) {
    if (settings.ai.connection === 'official' && data?.code === 'unauthorized') { account.user = null }
    throw new AiError('unauthorized', settings.ai.connection === 'official' ? tl('登录已失效，请重新登录') : tl('API key 无效或没有权限'), detail)
  }
  if (r.status === 429) {
    if (data?.code === 'quota') throw new AiError('quota', tl('今天的官方 AI 额度已用完，明天再试，或改用自己的 API key'))
    throw new AiError('busy', tl('AI 服务繁忙或请求过于频繁，请稍后重试'), detail)
  }
  if (r.status === 503 && data?.code === 'ai_disabled') throw new AiError('not_configured', tl('服务器还没有配置官方 AI'))
  if (r.status === 503 && data?.code === 'not_migrated') throw new AiError('not_migrated', tl('服务器尚未开通 VeloΦ 登录'))
  if (r.status === 400 && data?.code === 'no_vision') throw new AiError('vision', tl('当前模型不支持图片，请输入文字题目'))
  if (r.status === 400 || r.status === 404 || r.status === 422) throw new AiError('rejected', tl('AI 服务拒绝了请求'), detail)
  if (r.status === 504) throw new AiError('timeout', tl('AI 没有及时回答，请稍后重试'))
  throw new AiError('server', tl('AI 服务出错（{0}）', [r.status]), detail)
}

/**
 * The request as the provider takes it (OpenAI format): app-level fields dropped, the thinking switch and the
 * thinking text only for DeepSeek, learnt renames applied.
 */
export function wireRequest(req: ChatRequest, flavor: AiFlavor = aiFlavor()): Record<string, unknown> {
  const cap = caps[connKey()] ?? {}
  const think = flavor === 'deepseek' && !cap.noThinking
  const on = think && req.reasoning === 'on'
  const messages = req.messages.map(m => {
    const out: Record<string, unknown> = { role: m.role, content: m.content }
    if (m.tool_calls?.length) out.tool_calls = m.tool_calls
    if (m.tool_call_id) out.tool_call_id = m.tool_call_id
    // DeepSeek: with thinking on, every assistant turn carries its thinking back (400 otherwise)
    if (on && m.role === 'assistant') out.reasoning_content = m.reasoning_content ?? ''
    return out
  })
  const body: Record<string, unknown> = { messages }
  if (req.tools?.length) {
    body.tools = req.tools
    // Thinking mode refuses "required" and named tool choices
    if (req.tool_choice !== undefined) body.tool_choice = on && req.tool_choice !== 'none' ? 'auto' : req.tool_choice
  }
  if (req.response_format) body.response_format = req.response_format
  if (req.temperature !== undefined && !on && !cap.noTemperature) body.temperature = req.temperature
  if (req.max_tokens !== undefined) body[cap.maxCompletionTokens ? 'max_completion_tokens' : 'max_tokens'] = req.max_tokens
  if (think) {
    body.thinking = { type: on ? 'enabled' : 'disabled' }
    if (on) body.reasoning_effort = 'high'
  }
  return body
}

// ---- AI log (Settings › 账号与 AI › AI 记录; import failures show the last answer) ----

export interface AiLogEntry {
  at: string
  purpose: string
  connection: string
  ms: number
  status: string
  finish: string | null
  model?: string
  tokens?: number
  reasoningChars: number
  /** The beginning of the answer (text or tool calls), never the request or the key. */
  answer: string
}
export const aiLog = reactive({ entries: [] as AiLogEntry[] })
function logExchange(e: AiLogEntry) {
  aiLog.entries.unshift(e)
  if (aiLog.entries.length > 12) aiLog.entries.length = 12
}
function answerText(m: ChatMessage): string {
  const text = textOf(m)
  const calls = m.tool_calls?.map(c => `→ ${c.function.name}(${c.function.arguments.slice(0, 300)})`).join('\n') ?? ''
  return [text, calls].filter(Boolean).join('\n').slice(0, 4000)
}

async function send(req: ChatRequest, opts: ChatOptions): Promise<ChatResult> {
  const c = settings.ai.connection
  const timeoutMs = opts.timeoutMs ?? (req.reasoning === 'on' ? 300000 : 150000)
  const flavor = aiFlavor()
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const log = (status: string, res?: ChatResult) => logExchange({
    at: new Date().toISOString(), purpose: req.purpose ?? 'chat', connection: aiLabel(), ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0),
    status, finish: res?.finishReason ?? null, model: res?.model, tokens: res?.usage?.total_tokens, reasoningChars: res?.message.reasoning_content?.length ?? 0, answer: res ? answerText(res.message) : ''
  })
  let r: NetResponse
  try {
    if (c === 'official') {
      if (!cookieMode && !account.token) throw new AiError('not_configured', tl('请先登录'))
      r = await official('/api/velophi/ai/chat', { method: 'POST', body: wireRequest(req, flavor), timeoutMs, signal: opts.signal })
    } else if (c === 'openai') {
      const p = settings.ai.openai
      r = await netRequest({
        url: `${p.baseUrl}/chat/completions`, method: 'POST', timeoutMs, signal: opts.signal, proxy: settings.ai.proxy,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${getKey('openai')}` },
        body: JSON.stringify({ model: p.model, ...wireRequest(req, flavor), stream: false })
      })
    } else {
      const p = settings.ai.anthropic
      const headers: Record<string, string> = { 'content-type': 'application/json', 'x-api-key': getKey('anthropic'), 'anthropic-version': '2023-06-01' }
      if (!isDesktop) headers['anthropic-dangerous-direct-browser-access'] = 'true'
      r = await netRequest({ url: `${p.baseUrl}/v1/messages`, method: 'POST', timeoutMs, signal: opts.signal, proxy: settings.ai.proxy, headers, body: JSON.stringify(toAnthropic(req, p.model)) })
    }
  } catch (e) {
    if (e instanceof AiError) { log(e.code); throw e }
    try { netFail(e) } catch (x) { log(x instanceof AiError ? x.code : 'network'); throw x }
  }
  const data = parse<Record<string, unknown>>(r)
  if (r.status < 200 || r.status >= 300) {
    try { httpFail(r, data as never) } catch (x) { log(`HTTP ${r.status}${x instanceof AiError && x.detail ? ` · ${x.detail.slice(0, 200)}` : ''}`); throw x }
  }
  if (!data) { log('invalid'); throw new AiError('invalid_response', tl('AI 服务返回了无法识别的内容')) }
  let result: ChatResult
  if (c === 'anthropic') result = fromAnthropic(data as never)
  else {
    const choice = (data.choices as Array<{ message?: ChatMessage; finish_reason?: string | null }> | undefined)?.[0]
    if (!choice?.message) { log('invalid'); throw new AiError('invalid_response', tl('AI 服务返回了无法识别的内容')) }
    const message: ChatMessage = { role: 'assistant', content: choice.message.content ?? null }
    if (Array.isArray(choice.message.tool_calls) && choice.message.tool_calls.length) message.tool_calls = choice.message.tool_calls.map((t, i) => ({ id: t.id || `call_${i}`, type: 'function', function: { name: t.function?.name ?? '', arguments: t.function?.arguments ?? '{}' } }))
    if (flavor === 'deepseek' && typeof choice.message.reasoning_content === 'string' && choice.message.reasoning_content) message.reasoning_content = choice.message.reasoning_content
    result = { message, finishReason: choice.finish_reason ?? null, usage: data.usage as ChatResult['usage'], model: data.model as string | undefined }
  }
  if (result.finishReason === 'length') result.truncated = true
  log('ok', result)
  return result
}

// ---- JSON protocol (providers without function tools) ----

/** The request with the tools described in the system prompt and earlier tool turns written as text. */
export function toJsonProtocol(req: ChatRequest): ChatRequest {
  const tools = req.tools ?? []
  const list = tools.map(t => toolLine(t.function.name, t.function.description, t.function.parameters)).join('\n')
  const rule = jsonProtocol(list)
  const messages: ChatMessage[] = [{ role: 'system', content: rule }]
  for (const m of req.messages) {
    if (m.role === 'tool') messages.push({ role: 'user', content: toolResult(m.tool_call_id ?? '', typeof m.content === 'string' ? m.content : '') })
    else if (m.role === 'assistant' && m.tool_calls?.length) messages.push({ role: 'assistant', content: JSON.stringify({ tool_calls: m.tool_calls.map(c => ({ name: c.function.name, arguments: safeJson(c.function.arguments) })) }) })
    else messages.push(m)
  }
  return { ...req, messages, tools: undefined, tool_choice: undefined, response_format: caps[connKey()]?.noJsonFormat ? undefined : { type: 'json_object' } }
}

function safeJson(s: string): unknown { try { return JSON.parse(s) } catch { return {} } }

/** JSON.parse that returns undefined instead of throwing. */
function tryParse(s: string): unknown {
  try { return JSON.parse(s) } catch { return undefined }
}
const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Small repairs of almost-JSON that models write (26.59 fix): comments, trailing commas, and full-width or curly
 * quotes used as the JSON quotes. Strings are left alone.
 */
export function relaxJson(src: string): string {
  let out = ''
  let inStr = false, esc = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inStr) {
      out += ch
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') { inStr = true; out += ch; continue }
    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; out += '\n'; continue }
    if (ch === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; continue }
    if (ch === ',') {
      let j = i + 1
      while (j < src.length && /\s/.test(src[j])) j++
      if (src[j] === '}' || src[j] === ']') continue
    }
    out += ch
  }
  return out
}

/** The first balanced {…} in a text, parsed (strictly, then relaxed); null when there is none or it is cut off. */
function scanObject(src: string): Record<string, unknown> | null {
  let start = src.indexOf('{')
  while (start >= 0) {
    let depth = 0, inStr = false, esc = false
    for (let i = start; i < src.length; i++) {
      const ch = src[i]
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue }
      if (ch === '"') inStr = true
      else if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          const slice = src.slice(start, i + 1)
          const v = tryParse(slice) ?? tryParse(relaxJson(slice))
          if (isPlainObject(v)) return v
          break
        }
      }
    }
    start = src.indexOf('{', start + 1)
    if (depth !== 0) return null
  }
  return null
}

/**
 * The JSON object of an answer (26.59 fix: more forgiving). The whole text, then each fenced block, then the first
 * balanced object in the prose; an array whose first item is an object gives that object. Null when the answer has
 * no complete object (empty, or cut off by the token limit).
 */
export function extractJson(text: string): unknown {
  if (!text) return null
  const t = text.replace(/^\uFEFF/, '').trim()
  if (!t) return null
  const whole = tryParse(t) ?? (t.startsWith('{') || t.startsWith('[') ? tryParse(relaxJson(t)) : undefined)
  if (isPlainObject(whole)) return whole
  if (Array.isArray(whole) && isPlainObject(whole[0])) return whole[0]
  for (const m of t.matchAll(/```[a-zA-Z]*\s*([\s\S]*?)```/g)) {
    const v = scanObject(m[1])
    if (v) return v
  }
  return scanObject(t)
}

let jsonCallId = 0
/** A JSON-protocol answer as a normal assistant message with tool calls. */
export function fromJsonProtocol(res: ChatResult): ChatResult {
  const text = typeof res.message.content === 'string' ? res.message.content : ''
  const obj = extractJson(text) as { tool_calls?: Array<{ name?: string; arguments?: unknown }>; reply?: string } | null
  if (obj && Array.isArray(obj.tool_calls) && obj.tool_calls.length) {
    const calls: ToolCall[] = obj.tool_calls.filter(c => typeof c.name === 'string').map(c => ({ id: `json_${++jsonCallId}`, type: 'function', function: { name: c.name as string, arguments: JSON.stringify(c.arguments ?? {}) } }))
    return { ...res, message: { role: 'assistant', content: null, tool_calls: calls }, finishReason: 'tool_calls' }
  }
  if (obj && typeof obj.reply === 'string') return { ...res, message: { role: 'assistant', content: obj.reply } }
  return res
}

/** One request with the learnt fallbacks: tools → JSON protocol, no response_format, renamed limits, no temperature. */
async function sendLearning(request: ChatRequest, opts: ChatOptions): Promise<ChatResult> {
  const k = connKey()
  let req = request
  if (req.response_format && caps[k]?.noJsonFormat) req = { ...req, response_format: undefined }
  if (req.tools?.length && caps[k]?.noTools) return fromJsonProtocol(await send(toJsonProtocol(req), opts))
  for (let attempt = 0; ; attempt++) {
    try {
      return await send(req, opts)
    } catch (e) {
      if (!(e instanceof AiError) || e.code !== 'rejected' || attempt >= 3) throw e
      const detail = (e.detail ?? '').toLowerCase()
      // Order matters: DeepSeek's "reasoning_content must be passed back" also mentions tools
      if (/reasoning_content/.test(detail)) {
        // An official server older than 20261102-r2 drops the thinking text, so it cannot be sent back: this one
        // request goes as the JSON protocol, which has no tool turns (not remembered: the server may be updated)
        if (req.tools?.length && settings.ai.connection === 'official' && account.ai?.thinking !== true) return fromJsonProtocol(await send(toJsonProtocol(req), opts))
        throw new AiError('rejected', tl('AI 服务拒绝了这轮对话（思考内容没有回传）；请清空对话后重试'), e.detail)
      }
      if (/max_completion_tokens/.test(detail) && !caps[k]?.maxCompletionTokens) { learn({ maxCompletionTokens: true }); continue }
      if (/temperature/.test(detail) && !caps[k]?.noTemperature) { learn({ noTemperature: true }); continue }
      if (/thinking|reasoning_effort/.test(detail) && !caps[k]?.noThinking) { learn({ noThinking: true }); continue }
      if (req.tools?.length && /tool|function/.test(detail)) { learn({ noTools: true }); return fromJsonProtocol(await send(toJsonProtocol(req), opts)) }
      if (req.response_format && /response_format|json/.test(detail)) { learn({ noJsonFormat: true }); req = { ...req, response_format: undefined }; continue }
      throw e
    }
  }
}

/** Whether an answer has nothing usable: no text (or only spaces, as DeepSeek's JSON mode may send) and no tool call. */
const emptyAnswer = (r: ChatResult) => !textOf(r.message).trim() && !r.message.tool_calls?.length

/**
 * Connections whose model thought although thinking was switched off (26.59 fix 3, D197): an official server older
 * than 20261102-r2 drops the switch, and some models think whatever they are told. Learnt per connection while the
 * app runs.
 */
const thinksAnyway = new Set<string>()
/** Room for an answer on such a connection: the whole answer limit of an old official server. */
const THINKING_ROOM = 8192

/** The model thought without being asked (the thinking text came back, or reasoning tokens were counted). */
function thoughtUnasked(req: ChatRequest, r: ChatResult): boolean {
  if (req.reasoning === 'on') return false
  const tokens = (r.usage as { completion_tokens_details?: { reasoning_tokens?: number } } | undefined)?.completion_tokens_details?.reasoning_tokens ?? 0
  return tokens > 0 || !!r.message.reasoning_content
}

/** The request with room for thinking and a reminder to keep it short (a model that cannot be stopped from thinking). */
function roomy(req: ChatRequest): ChatRequest {
  const messages = req.messages.map((m, i) => (i === 0 && m.role === 'system' && typeof m.content === 'string' ? { ...m, content: m.content + BREVITY } : m))
  return { ...req, messages, max_tokens: Math.max(req.max_tokens ?? 2000, THINKING_ROOM) }
}

/**
 * Ask the AI. Throws AiError. An empty answer, or a structured (JSON) answer cut off by the token limit, is asked
 * once more with three times the room (26.59 fix): thinking models spend the budget on thinking, and DeepSeek's JSON
 * mode can answer with blanks. 26.59 fix 3 (D197): on a connection whose model thinks although told not to (an old
 * official server, or such a model), every request gets room for the thinking and a reminder to keep it short from
 * the start; before blaming an old official server, the account information is refreshed (the server may have been
 * updated since the app started) and the request tried once more.
 */
export async function chat(req: ChatRequest, opts: ChatOptions = {}): Promise<ChatResult> {
  const ready = aiReady()
  if (!ready.ok) throw new AiError('not_configured', ready.reason)
  const k = connKey()
  const careful = req.reasoning !== 'on' && (thinksAnyway.has(k) || serverAlwaysThinks())
  const res = await sendLearning(careful ? roomy(req) : req, opts)
  if (thoughtUnasked(req, res)) thinksAnyway.add(k)
  const cut = (r: ChatResult) => emptyAnswer(r) || (r.truncated && !!req.response_format && !r.message.tool_calls?.length)
  if (!cut(res)) return res
  if (opts.signal?.aborted) throw new AiError('aborted', tl('已取消'))
  const room = Math.min(32000, Math.max(4000, (req.max_tokens ?? 2000) * 3, careful ? THINKING_ROOM : 0))
  const base = thinksAnyway.has(k) && req.reasoning !== 'on' ? roomy(req) : req
  let again = await sendLearning({ ...base, max_tokens: room, purpose: `${req.purpose ?? 'chat'} (again)` }, opts)
  if (!cut(again)) return again
  if (settings.ai.connection === 'official' && aiFlavor() === 'deepseek') {
    // Perhaps the server was updated while the app was open: read its capabilities again
    const before = account.ai?.thinking === true
    await refreshAccount().catch(() => {})
    if (!before && account.ai?.thinking === true && !opts.signal?.aborted) {
      thinksAnyway.delete(k)
      again = await sendLearning({ ...req, max_tokens: room, purpose: `${req.purpose ?? 'chat'} (server updated)` }, opts)
      if (!cut(again)) return again
    }
    // An official server older than 20261102-r2 cannot switch DeepSeek's thinking off and caps the answer length
    if (serverAlwaysThinks()) throw new AiError('server', tl('官方 AI 服务器的版本较旧（20261102-r1 或更早），关不掉 DeepSeek 的“思考”，这次的思考超出了单次回答的长度上限。请联系管理员部署网站更新 20261102-r2（运行一次升级脚本）；也可以稍后重试，或在“设置 › 账号与 AI”中改用自己的 API key。'))
  }
  return again
}

/** The official AI is DeepSeek behind a server that cannot pass the thinking switch (before 20261102-r2). */
function serverAlwaysThinks(): boolean {
  return settings.ai.connection === 'official' && aiFlavor() === 'deepseek' && account.ai?.thinking !== true
}

/** "Test connection": a tiny request; the time and the model's answer. */
export async function testConnection(): Promise<{ ms: number; text: string; model?: string }> {
  resetCaps()
  const t0 = performance.now()
  const r = await chat({ messages: [{ role: 'system', content: 'Reply with the single word: OK' }, { role: 'user', content: 'ping' }], max_tokens: 16, temperature: 0, purpose: 'test' }, { timeoutMs: 30000 })
  return { ms: Math.round(performance.now() - t0), text: (typeof r.message.content === 'string' ? r.message.content : '').trim().slice(0, 60), model: r.model }
}
