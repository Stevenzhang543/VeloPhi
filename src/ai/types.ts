/**
 * The one request format of the AI features (26.59, D148): OpenAI Chat Completions with function tools. The
 * official proxy forwards it as is; the user's own OpenAI-compatible provider takes it directly; Anthropic is
 * converted in ai/anthropic.ts.
 */

export type Role = 'system' | 'user' | 'assistant' | 'tool'

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }

export interface ChatMessage {
  role: Role
  content: string | ContentPart[] | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  /**
   * The model's thinking (DeepSeek thinking mode, 26.59 fix). Sent back with every assistant turn while thinking is
   * on and tools are used (DeepSeek answers 400 otherwise); never sent to other providers.
   */
  reasoning_content?: string
}

/** JSON Schema of tool parameters (the subset the tools use). */
export interface JsonSchema {
  type?: string | string[]
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  enum?: Array<string | number>
  additionalProperties?: boolean | JsonSchema
  minimum?: number
  maximum?: number
}

export interface ToolDef { type: 'function'; function: { name: string; description: string; parameters: JsonSchema } }

export type ToolChoice = 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }

export interface ChatRequest {
  messages: ChatMessage[]
  tools?: ToolDef[]
  tool_choice?: ToolChoice
  response_format?: { type: 'json_object' | 'text' }
  temperature?: number
  max_tokens?: number
  /**
   * App-level choices, never sent as such (26.59 fix): `reasoning` turns a thinking model's thinking on or off where
   * the provider has a switch (DeepSeek `thinking`; default off — structured answers need the whole token budget);
   * `purpose` names the request in the AI log.
   */
  reasoning?: 'on' | 'off'
  purpose?: string
}

export interface ChatResult {
  message: ChatMessage
  finishReason: string | null
  usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number }
  model?: string
  /** The answer hit the token limit (content may be cut off). */
  truncated?: boolean
}

/** Why an AI request failed; the interface explains each one (ai/errors.ts). */
export type AiErrorCode =
  | 'not_configured' | 'unauthorized' | 'quota' | 'busy' | 'timeout' | 'network' | 'blocked' | 'aborted'
  | 'rejected' | 'vision' | 'server' | 'invalid_response' | 'not_migrated'

export class AiError extends Error {
  constructor(public code: AiErrorCode, message: string, public detail?: string) {
    super(message)
  }
}

/** The text of a message (text parts joined). */
export function textOf(m: ChatMessage | null | undefined): string {
  if (!m || m.content == null) return ''
  if (typeof m.content === 'string') return m.content
  return m.content.filter((p): p is { type: 'text'; text: string } => p.type === 'text').map(p => p.text).join('\n')
}
