/**
 * 26.59 Copilot and the AI client (D148, D167–D170, D179): the tool loop with a scripted AI, undo of Copilot's
 * changes, settings "ask first", photos read as text first, the JSON protocol for providers without tools, and the
 * Anthropic conversion.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { Scene } from '../../src/core/scene/types'
import { buildTemplate } from '../../src/templates'

const state = {
  dirty: false, page: 'studio', rightTab: 'formula', bottomTab: 'chart', problem: null as unknown, scene: buildTemplate('incline') as Scene, fileName: null,
  recording: null, situations: [], run: { tComputed: 0, unbounded: true, paused: false }, computing: false, playing: false, time: 0, speed: 1, selection: null,
  showModels: false, modelId: null, modelPreset: null, settingsSection: null, showTemplates: false, showProblems: false, chart: [] as string[]
}
const loadScene = vi.fn((s: Scene) => { state.scene = s; state.problem = null })
const edit = vi.fn((m: (s: Scene) => void) => { m(state.scene) })
vi.mock('../../src/app/store', () => ({ state, loadScene, edit, play: vi.fn(), pause: vi.fn(), rewind: vi.fn(), seekTime: vi.fn(), showToast: vi.fn(), documentScene: () => state.scene }))
vi.mock('../../src/app/trialLog', () => ({ logEvent() {} }))
const askAnswers: boolean[] = []
vi.mock('../../src/platform/ask', () => ({ ask: vi.fn(async () => askAnswers.shift() ?? true) }))
vi.mock('../../src/app/task/taskState', () => ({ taskUi: { task: null, state: 'draft' }, setTask: vi.fn(), currentResults: () => [], solveCurrent: vi.fn(), readText: vi.fn() }))

const { copilot, sendToCopilot, undoAction, clearCopilot } = await import('../../src/ai/copilot/session')
const { setTransport } = await import('../../src/platform/net')
const { settings } = await import('../../src/app/settings')
const { setKey } = await import('../../src/ai/keys')
const { resetCaps, chat, toJsonProtocol } = await import('../../src/ai/client')
const { toAnthropic, fromAnthropic } = await import('../../src/ai/anthropic')
const { readProblem } = await import('../../src/ai/import/pipeline')
const { toolDefs } = await import('../../src/ai/copilot/tools')
const { renderAnswer } = await import('../../src/ai/copilot/render')

type Body = Record<string, unknown> & { messages: Array<{ role: string; content: unknown }>; tools?: unknown[] }
const ok = (message: unknown) => ({ status: 200, contentType: 'application/json', retryAfter: null, body: JSON.stringify({ choices: [{ message, finish_reason: 'stop' }], usage: { total_tokens: 50 } }) })
function scripted(replies: Array<(b: Body) => ReturnType<typeof ok>>) {
  const seen: Body[] = []
  setTransport(async req => { const b = JSON.parse(req.body ?? '{}') as Body; seen.push(b); const r = replies.shift(); if (!r) throw new Error('no reply'); return r(b) })
  return seen
}

beforeEach(() => {
  settings.ai.connection = 'openai'
  settings.ai.openai = { baseUrl: 'https://ai.test/v1', model: 'm', vision: true }
  settings.ai.copilotMode = 'act'
  settings.ai.shareScene = true
  setKey('openai', 'sk-test')
  resetCaps()
  clearCopilot()
  state.scene = buildTemplate('incline')
  loadScene.mockClear()
})
afterEach(() => setTransport(null))

describe('Copilot tool loop', () => {
  it('loads a template through a tool call, answers, and the change can be undone', async () => {
    const seen = scripted([
      () => ok({ role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'load_template', arguments: JSON.stringify({ id: 'incline', params: { theta: 40 } }) } }] }),
      () => ok({ role: 'assistant', content: '已把斜面改为 40°。' })
    ])
    await sendToCopilot('把斜面倾角改成 40 度')
    expect(seen).toHaveLength(2)
    expect((seen[0].tools as unknown[]).length).toBe(toolDefs().length)
    expect(String(seen[0].messages[1].content)).toContain('<app_state>')
    expect(seen[1].messages.some(m => m.role === 'tool')).toBe(true)
    expect((state.scene.extra as { template: { values: { theta: number } } }).template.values.theta).toBe(40)
    const bot = copilot.bubbles.find(b => b.role === 'assistant')!
    expect(bot.text).toBe('已把斜面改为 40°。')
    expect(bot.actions[0].ok).toBe(true)
    undoAction(bot.actions[0])
    expect((state.scene.extra as { template: { values: { theta: number } } }).template.values.theta).toBe(30)
    expect(bot.actions[0].undone).toBe(true)
    // Older turns keep only their text in the history
    expect(String(copilot.history[0].content)).not.toContain('<app_state>')
  })

  it('a wrong tool argument goes back to the AI as an error; "ask first" can be declined', async () => {
    settings.ai.copilotMode = 'ask'
    askAnswers.push(false)
    scripted([
      () => ok({ role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'load_template', arguments: JSON.stringify({ id: 'incline', params: { angle: 40 } }) } }, { id: 'c2', type: 'function', function: { name: 'load_template', arguments: JSON.stringify({ id: 'incline' }) } }] }),
      b => {
        const results = b.messages.filter(m => m.role === 'tool').map(m => String(m.content))
        expect(results[0]).toMatch(/has no parameter angle/)
        expect(results[1]).toMatch(/declined/)
        return ok({ role: 'assistant', content: '没有修改。' })
      }
    ])
    await sendToCopilot('改一下')
    expect(loadScene).not.toHaveBeenCalled()
    const bot = copilot.bubbles.find(b => b.role === 'assistant')!
    expect(bot.actions.every(a => !a.ok)).toBe(true)
  })

  it('a photo is transcribed first; the chat turn carries text only', async () => {
    const seen = scripted([
      b => { expect(JSON.stringify(b.messages[1].content)).toContain('image_url'); expect(b.messages[0].role).toBe('system'); expect(typeof b.messages[0].content).toBe('string'); return ok({ role: 'assistant', content: '质量为 2 kg 的物块……【图】斜面倾角 30°' }) },
      () => ok({ role: 'assistant', content: '这是一道斜面题。' })
    ])
    await sendToCopilot('这题怎么做', 'data:image/jpeg;base64,AAAA')
    expect(seen).toHaveLength(2)
    expect(JSON.stringify(seen[1].messages)).not.toContain('image_url')
    expect(JSON.stringify(seen[1].messages)).toContain('斜面倾角 30°')
  })

  it('AI errors become an error bubble and the history stays well-formed', async () => {
    setTransport(async () => ({ status: 429, contentType: 'application/json', retryAfter: null, body: '{"error":"slow down"}' }))
    await sendToCopilot('hi')
    expect(copilot.bubbles.at(-1)!.role).toBe('error')
    expect(copilot.bubbles.at(-1)!.code).toBe('busy')
  })
})

describe('problem reading with a photo', () => {
  it('image only, text only and both: the photo becomes text before reading', async () => {
    const seen = scripted([
      () => ok({ role: 'assistant', content: '一个质量为 2 kg 的木块从倾角 30° 的斜面顶端静止下滑，μ = 0.2，求加速度。g = 10' }),
      () => ok({ role: 'assistant', content: JSON.stringify({ route: 'template', id: 'incline', summary: '斜面', category: {} }) }),
      () => ok({ role: 'assistant', content: JSON.stringify({ template: { id: 'incline', params: { theta: { value: 30, unit: '°' } } }, questions: [{ prompt: 'a', target: { kind: 'quantity', id: 'block.a', t: 0.5 } }] }) })
    ])
    const o = await readProblem('只求加速度', { image: 'data:image/png;base64,AAAA' })
    expect(o.ok).toBe(true)
    if (o.ok) { expect(o.transcript).toMatch(/倾角 30°/); expect(o.stem).toMatch(/^只求加速度/); expect(o.stem).toMatch(/倾角 30°/) }
    expect(JSON.stringify(seen[0].messages[1].content)).toContain('只求加速度')
    expect(JSON.stringify(seen[1].messages)).not.toContain('image_url')
    settings.ai.openai.vision = false
    const v = await readProblem('', { image: 'data:image/png;base64,AAAA' })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.code).toBe('vision')
  })
})

describe('AI client', () => {
  it('falls back to the JSON protocol when tools are rejected, and remembers it', async () => {
    let calls = 0
    setTransport(async req => {
      const b = JSON.parse(req.body!) as Body
      calls++
      if (b.tools) return { status: 400, contentType: 'application/json', retryAfter: null, body: '{"error":{"message":"tools are not supported by this model"}}' }
      expect(JSON.stringify(b.messages[0])).toContain('tool_calls')
      return ok({ role: 'assistant', content: '{"tool_calls":[{"name":"get_app_state","arguments":{}}]}' })
    })
    const r = await chat({ messages: [{ role: 'user', content: 'x' }], tools: toolDefs() })
    expect(r.message.tool_calls?.[0].function.name).toBe('get_app_state')
    expect(calls).toBe(2)
    await chat({ messages: [{ role: 'user', content: 'x' }], tools: toolDefs() })
    expect(calls).toBe(3)
    const j = toJsonProtocol({ messages: [{ role: 'assistant', content: null, tool_calls: [{ id: 'a', type: 'function', function: { name: 'f', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'a', content: '{"ok":1}' }], tools: toolDefs() })
    expect(j.tools).toBeUndefined()
    expect(j.messages.at(-1)!.role).toBe('user')
  })

  it('converts to and from Anthropic messages', () => {
    const a = toAnthropic({
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: [{ type: 'text', text: 'see' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } }] },
        { role: 'assistant', content: 'calling', tool_calls: [{ id: 't1', type: 'function', function: { name: 'f', arguments: '{"x":1}' } }] },
        { role: 'tool', tool_call_id: 't1', content: 'r1' },
        { role: 'user', content: 'thanks' }
      ],
      tools: [{ type: 'function', function: { name: 'f', description: 'd', parameters: { type: 'object' } } }],
      tool_choice: 'required', response_format: { type: 'json_object' }
    }, 'claude-x')
    expect(a.system).toMatch(/^sys/)
    expect(a.system).toMatch(/JSON/)
    expect(a.messages.map(m => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(a.messages[0].content[1]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } })
    expect(a.messages[1].content[1]).toEqual({ type: 'tool_use', id: 't1', name: 'f', input: { x: 1 } })
    expect(a.messages[2].content[0]).toEqual({ type: 'tool_result', tool_use_id: 't1', content: 'r1' })
    expect(a.tool_choice).toEqual({ type: 'any' })
    const back = fromAnthropic({ content: [{ type: 'text', text: 'hi' }, { type: 'tool_use', id: 'u1', name: 'g', input: { y: 2 } }], stop_reason: 'tool_use', usage: { input_tokens: 3, output_tokens: 4 } })
    expect(back.message.tool_calls?.[0].function.arguments).toBe('{"y":2}')
    expect(back.finishReason).toBe('tool_calls')
    expect(back.usage?.total_tokens).toBe(7)
  })

  it('renders answers safely (no markup from the model, KaTeX for formulas)', () => {
    const html = renderAnswer('**a** = `x` <img src=x onerror=alert(1)>\n\n- one\n- $v = gt$')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
    expect(html).toContain('<b>a</b>')
    expect(html).toContain('<ul>')
    expect(html).toContain('katex')
  })
})
