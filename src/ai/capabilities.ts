/**
 * What each kind of AI service can do (26.63, D238): the starting point of a connection's capabilities, before
 * anything is learnt from its answers. Providers differ in how they take structured output — a strict JSON schema, a
 * plain "JSON object" mode, or neither — whether they call tools, and whether a request with an image may also carry
 * an output format. Asking for something a service refuses costs a rejected round trip (the client then learns and
 * retries, client.ts `sendLearning`); this table avoids the first refusal for the services we know.
 *
 * Matched by the base address and the model name, first match wins. Unknown services get `GENERIC`: JSON-object mode
 * and tools are tried and unlearnt on refusal. Sources and dates are in docs/research/2663/teaching.md §3.1; the table
 * is data — when a provider changes, change the row.
 */
export interface Capabilities {
  /** Function tools (OpenAI format). */
  tools: boolean
  /** `response_format: { type: 'json_object' }`. */
  jsonObject: boolean
  /** `response_format: { type: 'json_schema', strict: true }` (strict structured output). */
  jsonSchema: boolean
  /** A request with an image may also carry a response format (false: transcribe first, then ask for structure). */
  formatWithImage: boolean
  /** The token limit is called `max_completion_tokens`. */
  maxCompletionTokens: boolean
  /** A sampling temperature is accepted. */
  temperature: boolean
  /** Name shown in the settings. */
  family: string
}

export const GENERIC: Capabilities = { tools: true, jsonObject: true, jsonSchema: false, formatWithImage: true, maxCompletionTokens: false, temperature: true, family: 'OpenAI-compatible' }

interface Row { host?: RegExp; model?: RegExp; caps: Partial<Capabilities> & { family: string } }
const ROWS: Row[] = [
  // Reasoning models of OpenAI: no temperature, the limit is max_completion_tokens
  { host: /api\.openai\.com/i, model: /^(o\d|gpt-5)/i, caps: { family: 'OpenAI (reasoning)', jsonSchema: true, maxCompletionTokens: true, temperature: false } },
  { host: /api\.openai\.com/i, caps: { family: 'OpenAI', jsonSchema: true } },
  // DeepSeek: JSON-object mode and tools; no schema mode
  { host: /deepseek/i, caps: { family: 'DeepSeek' } },
  { model: /^deepseek/i, caps: { family: 'DeepSeek' } },
  // Qwen (DashScope, OpenAI-compatible mode): a response format is dropped when the request carries an image
  { host: /dashscope|aliyuncs/i, caps: { family: 'Qwen (DashScope)', formatWithImage: false } },
  { model: /^qwen|^qvq/i, caps: { family: 'Qwen', formatWithImage: false } },
  { host: /moonshot/i, caps: { family: 'Moonshot (Kimi)' } },
  { host: /siliconflow/i, caps: { family: 'SiliconFlow' } },
  // OpenRouter passes the format on; whether it holds depends on the model behind it
  { host: /openrouter/i, caps: { family: 'OpenRouter' } },
  { host: /(127\.0\.0\.1|localhost)/i, caps: { family: 'local' } }
]

/** Anthropic's Messages API (converted in anthropic.ts): tools yes, no response-format field at all. */
export const ANTHROPIC: Capabilities = { tools: true, jsonObject: false, jsonSchema: false, formatWithImage: true, maxCompletionTokens: false, temperature: true, family: 'Anthropic' }

/** Capabilities of an OpenAI-compatible connection. */
export function capabilitiesOf(baseUrl: string, model: string): Capabilities {
  for (const r of ROWS) {
    if (r.host && !r.host.test(baseUrl)) continue
    if (r.model && !r.model.test(model.trim())) continue
    return { ...GENERIC, ...r.caps }
  }
  return GENERIC
}
