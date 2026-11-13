/**
 * OpenAI Chat Completions ⇄ Anthropic Messages (26.59, D148), for the user's own Anthropic key. Pure.
 *
 * System messages become `system`; tool results become `tool_result` blocks of a user turn; assistant tool calls
 * become `tool_use` blocks; data-URL images become base64 image blocks; consecutive turns of the same role are
 * merged (the API alternates user and assistant). Anthropic has no JSON mode: `response_format: json_object` adds
 * an instruction to the system prompt instead.
 */
import type { ChatMessage, ChatRequest, ChatResult, ToolCall } from './types'

type Block =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string }

interface AMessage { role: 'user' | 'assistant'; content: Block[] }

export interface AnthropicRequest {
  model: string
  max_tokens: number
  system?: string
  messages: AMessage[]
  tools?: Array<{ name: string; description: string; input_schema: unknown }>
  tool_choice?: { type: 'auto' } | { type: 'any' } | { type: 'tool'; name: string }
  temperature?: number
}

function blocksOf(m: ChatMessage): Block[] {
  const out: Block[] = []
  if (typeof m.content === 'string') { if (m.content) out.push({ type: 'text', text: m.content }) }
  else if (Array.isArray(m.content)) {
    for (const p of m.content) {
      if (p.type === 'text') { if (p.text) out.push({ type: 'text', text: p.text }) }
      else {
        const match = /^data:(image\/[a-z]+);base64,(.*)$/s.exec(p.image_url.url)
        if (match) out.push({ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } })
      }
    }
  }
  return out
}

function parseArgs(s: string): unknown {
  try { return s ? JSON.parse(s) : {} } catch { return {} }
}

export function toAnthropic(req: ChatRequest, model: string): AnthropicRequest {
  const system: string[] = []
  const messages: AMessage[] = []
  const push = (role: 'user' | 'assistant', blocks: Block[]) => {
    if (!blocks.length) return
    const last = messages[messages.length - 1]
    if (last && last.role === role) last.content.push(...blocks)
    else messages.push({ role, content: blocks })
  }
  for (const m of req.messages) {
    if (m.role === 'system') { const t = blocksOf(m).filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('\n'); if (t) system.push(t); continue }
    if (m.role === 'tool') {
      push('user', [{ type: 'tool_result', tool_use_id: m.tool_call_id ?? '', content: typeof m.content === 'string' ? m.content : blocksOf(m).map(b => (b.type === 'text' ? b.text : '')).join('\n') }])
      continue
    }
    if (m.role === 'assistant') {
      const blocks = blocksOf(m)
      for (const c of m.tool_calls ?? []) blocks.push({ type: 'tool_use', id: c.id, name: c.function.name, input: parseArgs(c.function.arguments) })
      push('assistant', blocks)
      continue
    }
    push('user', blocksOf(m))
  }
  if (req.response_format?.type === 'json_object' || req.response_format?.type === 'json_schema') system.push('Answer with one JSON object only, no other text.')
  const out: AnthropicRequest = { model, max_tokens: req.max_tokens ?? 4096, messages }
  if (system.length) out.system = system.join('\n\n')
  if (req.temperature !== undefined) out.temperature = Math.min(1, req.temperature)
  const choice = req.tool_choice
  if (req.tools?.length && choice !== 'none') {
    out.tools = req.tools.map(t => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters }))
    if (choice === 'required') out.tool_choice = { type: 'any' }
    else if (choice && typeof choice === 'object') out.tool_choice = { type: 'tool', name: choice.function.name }
    else out.tool_choice = { type: 'auto' }
  }
  return out
}

interface AResponse {
  content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>
  stop_reason?: string | null
  usage?: { input_tokens?: number; output_tokens?: number }
  model?: string
}

export function fromAnthropic(r: AResponse): ChatResult {
  const text: string[] = []
  const calls: ToolCall[] = []
  for (const b of r.content ?? []) {
    if (b.type === 'text' && b.text) text.push(b.text)
    if (b.type === 'tool_use' && b.id && b.name) calls.push({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } })
  }
  const message: ChatMessage = { role: 'assistant', content: text.join('\n') || null }
  if (calls.length) message.tool_calls = calls
  const reason = r.stop_reason === 'tool_use' ? 'tool_calls' : r.stop_reason === 'end_turn' ? 'stop' : r.stop_reason === 'max_tokens' ? 'length' : (r.stop_reason ?? null)
  const inp = r.usage?.input_tokens ?? 0, outp = r.usage?.output_tokens ?? 0
  return { message, finishReason: reason, usage: { prompt_tokens: inp, completion_tokens: outp, total_tokens: inp + outp }, model: r.model }
}
