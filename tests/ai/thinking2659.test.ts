/**
 * 26.59 fix (D180–D182): DeepSeek's thinking models. The thinking switch and the thinking text on the wire, the
 * forgiving JSON reader, the second try for empty or cut-off answers, Copilot's thinking turns, the new Copilot
 * tools (display, forces, applied force, scene building) and "识别题目" inside the Copilot conversation.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { Scene } from '../../src/core/scene/types'
import { buildTemplate } from '../../src/templates'
import { simulate } from '../../src/engine/recording'

const state = {
  dirty: false, page: 'studio', rightTab: 'formula', bottomTab: 'chart', problem: null as unknown, scene: buildTemplate('incline') as Scene, fileName: null,
  recording: null as unknown, situations: [], run: { tComputed: 0, unbounded: true, paused: false }, computing: false, playing: false, time: 0, speed: 1, selection: null as null | { kind: string; id: string },
  showModels: false, modelId: null, modelPreset: null, settingsSection: null, showTemplates: false, showProblems: false, chart: [] as string[],
  display: { forces: false, forcesAll: false, velocity: false, acceleration: false, trajectory: true, names: true, labels: true, grid: true }
}
const loadScene = vi.fn((s: Scene) => { state.scene = s; state.problem = null })
const edit = vi.fn((m: (s: Scene) => void) => { m(state.scene) })
vi.mock('../../src/app/store', () => ({ state, loadScene, edit, play: vi.fn(), pause: vi.fn(), rewind: vi.fn(), seekTime: vi.fn(), showToast: vi.fn(), documentScene: () => state.scene }))
vi.mock('../../src/app/trialLog', () => ({ logEvent() {} }))
vi.mock('../../src/platform/ask', () => ({ ask: vi.fn(async () => true) }))
vi.mock('../../src/app/task/taskState', () => ({ taskUi: { task: null, state: 'draft' }, setTask: vi.fn(), currentResults: () => [], solveCurrent: vi.fn(), readText: vi.fn() }))
const openProblem = vi.fn(async (p: { scene: Scene }) => { state.scene = p.scene; return true })
vi.mock('../../src/app/problemMode', () => ({ openProblem, reveal: vi.fn(), openBuiltin: vi.fn(async () => true) }))

const { copilot, sendToCopilot, clearCopilot, recognizeInCopilot } = await import('../../src/ai/copilot/session')
const { setTransport } = await import('../../src/platform/net')
const { settings } = await import('../../src/app/settings')
const { setKey } = await import('../../src/ai/keys')
const { account } = await import('../../src/ai/account')
const { resetCaps, chat, wireRequest, aiFlavor, aiCanThink, extractJson, aiLog } = await import('../../src/ai/client')
const { readProblem } = await import('../../src/ai/import/pipeline')
const { readForces, toolByName } = await import('../../src/ai/copilot/tools')
const { AiError } = await import('../../src/ai/types')

type Body = Record<string, unknown> & { messages: Array<Record<string, unknown> & { role: string; content: unknown }>; tools?: unknown[]; max_tokens?: number }
const reply = (message: unknown, finish = 'stop') => ({ status: 200, contentType: 'application/json', retryAfter: null, body: JSON.stringify({ choices: [{ message, finish_reason: finish }], usage: { total_tokens: 50 }, model: 'deepseek-flash' }) })
function scripted(replies: Array<(b: Body) => ReturnType<typeof reply>>) {
  const seen: Body[] = []
  setTransport(async req => { const b = JSON.parse(req.body ?? '{}') as Body; seen.push(b); const r = replies.shift(); if (!r) throw new Error('no reply'); return r(b) })
  return seen
}

beforeEach(() => {
  settings.ai.connection = 'openai'
  settings.ai.openai = { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', vision: true }
  settings.ai.copilotMode = 'act'
  settings.ai.shareScene = true
  settings.ai.thinking = false
  setKey('openai', 'sk-test')
  resetCaps()
  clearCopilot()
  state.scene = buildTemplate('incline')
  state.recording = null
  state.selection = null
  loadScene.mockClear()
})
afterEach(() => setTransport(null))

describe('thinking switch on the wire', () => {
  it('DeepSeek: thinking on sends the thinking back, drops temperature and forced tool choices', () => {
    expect(aiFlavor()).toBe('deepseek')
    expect(aiCanThink()).toBe(true)
    const tools = [{ type: 'function' as const, function: { name: 'f', description: 'd', parameters: { type: 'object', properties: {} } } }]
    const messages = [
      { role: 'system' as const, content: 's' },
      { role: 'user' as const, content: 'q' },
      { role: 'assistant' as const, content: null, reasoning_content: 'r1', tool_calls: [{ id: 'c', type: 'function' as const, function: { name: 'f', arguments: '{}' } }] },
      { role: 'tool' as const, tool_call_id: 'c', content: '{}' },
      { role: 'assistant' as const, content: 'a' }
    ]
    const on = wireRequest({ messages, tools, tool_choice: 'required', temperature: 0.2, max_tokens: 100, reasoning: 'on', purpose: 'x' })
    expect(on.thinking).toEqual({ type: 'enabled' })
    expect(on.reasoning_effort).toBe('high')
    expect(on.temperature).toBeUndefined()
    expect(on.tool_choice).toBe('auto')
    const sent = on.messages as Array<Record<string, unknown>>
    expect(sent[2].reasoning_content).toBe('r1')
    expect(sent[4].reasoning_content).toBe('')
    expect(sent[1].reasoning_content).toBeUndefined()
    expect(on.purpose).toBeUndefined()
    expect(on.reasoning).toBeUndefined()

    const off = wireRequest({ messages, tools, tool_choice: 'auto', temperature: 0.2, max_tokens: 100, reasoning: 'off' })
    expect(off.thinking).toEqual({ type: 'disabled' })
    expect(off.reasoning_effort).toBeUndefined()
    expect(off.temperature).toBe(0.2)
    expect((off.messages as Array<Record<string, unknown>>).some(m => 'reasoning_content' in m)).toBe(false)
  })

  it('other providers get no thinking fields; the official AI thinks only when the server says so', () => {
    settings.ai.openai = { baseUrl: 'https://api.example.com/v1', model: 'gpt-x', vision: true }
    expect(aiFlavor()).toBe('generic')
    const g = wireRequest({ messages: [{ role: 'user', content: 'q' }], reasoning: 'on' })
    expect(g.thinking).toBeUndefined()
    expect(aiCanThink()).toBe(false)
    settings.ai.connection = 'official'
    account.ai = { enabled: true, model: 'deepseek-flash', vision: true, provider: 'deepseek' } as never
    expect(aiFlavor()).toBe('deepseek')
    expect(aiCanThink()).toBe(false)
    account.ai = { enabled: true, model: 'deepseek-flash', vision: true, provider: 'deepseek', thinking: true } as never
    expect(aiCanThink()).toBe(true)
    account.ai = null as never
  })
})

describe('forgiving JSON reader', () => {
  it('reads fenced, commented and trailing-comma JSON; a cut-off object is null', () => {
    expect(extractJson('好的，结果如下：\n```json\n{"route": "template", "id": "incline",}\n```\n以上。')).toEqual({ route: 'template', id: 'incline' })
    expect(extractJson('{\n  // the template\n  "id": "incline", /* angle */ "theta": 30,\n}')).toEqual({ id: 'incline', theta: 30 })
    expect(extractJson('答案：{"a": {"b": [1, 2,]}} 完')).toEqual({ a: { b: [1, 2] } })
    expect(extractJson('[{"x": 1}]')).toEqual({ x: 1 })
    expect(extractJson('{"route": "template", "id": "inc')).toBeNull()
    expect(extractJson('   ')).toBeNull()
    expect(extractJson('{"s": "a, }"}')).toEqual({ s: 'a, }' })
  })
})

describe('second try and refusals', () => {
  it('an empty answer is asked again with three times the room, and both go to the AI log', async () => {
    const seen = scripted([
      () => reply({ role: 'assistant', content: '  ', reasoning_content: '想了很久……' }, 'length'),
      () => reply({ role: 'assistant', content: '{"ok": true}' })
    ])
    const r = await chat({ messages: [{ role: 'user', content: 'q' }], max_tokens: 2000, response_format: { type: 'json_object' }, reasoning: 'off', purpose: 'import.route' })
    expect(seen).toHaveLength(2)
    expect(seen[1].max_tokens).toBe(6000)
    expect(r.message.content).toBe('{"ok": true}')
    expect(aiLog.entries[0].purpose).toBe('import.route (again)')
    expect(aiLog.entries[1].finish).toBe('length')
    expect(aiLog.entries[1].reasoningChars).toBeGreaterThan(0)
    expect(JSON.stringify(aiLog.entries)).not.toContain('sk-test')
  })

  it('a JSON answer cut off by the limit is asked again; a cut-off chat answer is kept', async () => {
    let seen = scripted([
      () => reply({ role: 'assistant', content: '{"route": "templ' }, 'length'),
      () => reply({ role: 'assistant', content: '{"route": "template"}' })
    ])
    const r = await chat({ messages: [{ role: 'user', content: 'q' }], max_tokens: 3000, response_format: { type: 'json_object' } })
    expect(seen).toHaveLength(2)
    expect(seen[1].max_tokens).toBe(9000)
    expect(r.truncated).toBeFalsy()
    seen = scripted([() => reply({ role: 'assistant', content: '很长的回答' }, 'length')])
    const c = await chat({ messages: [{ role: 'user', content: 'q' }], max_tokens: 100 })
    expect(seen).toHaveLength(1)
    expect(c.truncated).toBe(true)
  })

  it('"reasoning_content must be passed back" is not mistaken for a refusal of tools', async () => {
    const tools = [{ type: 'function' as const, function: { name: 'f', description: 'd', parameters: { type: 'object', properties: {} } } }]
    scripted([() => ({ status: 400, contentType: 'application/json', retryAfter: null, body: '{"error":{"message":"The reasoning_content in the thinking mode must be passed back to the API (tool calls)."}}' })])
    await expect(chat({ messages: [{ role: 'user', content: 'q' }], tools, reasoning: 'on' })).rejects.toThrow(AiError)
    const seen = scripted([() => reply({ role: 'assistant', content: 'ok' })])
    await chat({ messages: [{ role: 'user', content: 'q' }], tools })
    expect(seen[0].tools).toBeDefined()
  })

  it('an official server without thinking support: a refused tool turn goes once as the JSON protocol', async () => {
    settings.ai.connection = 'official'
    account.user = { id: 1, name: 't' } as never
    account.token = 'tok'
    account.ai = { enabled: true, model: 'deepseek-flash', vision: true, provider: 'deepseek' } as never
    const tools = [{ type: 'function' as const, function: { name: 'f', description: 'd', parameters: { type: 'object', properties: {} } } }]
    const seen = scripted([
      () => ({ status: 400, contentType: 'application/json', retryAfter: null, body: '{"error":"rejected","upstreamMessage":"The reasoning_content in the thinking mode must be passed back to the API."}' }),
      () => reply({ role: 'assistant', content: '{"tool_calls":[{"name":"f","arguments":{}}]}' }),
      () => reply({ role: 'assistant', content: 'ok' })
    ])
    const r = await chat({ messages: [{ role: 'user', content: 'q' }], tools })
    expect(seen[1].tools).toBeUndefined()
    expect(r.message.tool_calls?.[0].function.name).toBe('f')
    // Not remembered: the next request offers the tools again
    await chat({ messages: [{ role: 'user', content: 'q' }], tools })
    expect(seen[2].tools).toBeDefined()
    account.user = null
    account.token = ''
    account.ai = null as never
  })

  it('an official server that always thinks: a second cut-off answer says the server needs the update', async () => {
    settings.ai.connection = 'official'
    account.user = { id: 1, name: 't' } as never
    account.token = 'tok'
    account.ai = { enabled: true, model: 'deepseek-flash', vision: true } as never
    const seen = scripted([
      () => reply({ role: 'assistant', content: '', reasoning_content: '想了很多' }, 'length'),
      () => reply({ role: 'assistant', content: '{"route": "equ', reasoning_content: '想了更多' }, 'length')
    ])
    await expect(chat({ messages: [{ role: 'user', content: 'q' }], max_tokens: 3000, response_format: { type: 'json_object' }, reasoning: 'off' })).rejects.toThrow(/20261102-r2/)
    expect(seen).toHaveLength(2)
    // A server that can switch thinking off keeps the plain second try
    account.ai = { enabled: true, model: 'deepseek-flash', vision: true, provider: 'deepseek', thinking: true } as never
    scripted([() => reply({ role: 'assistant', content: '' }, 'length'), () => reply({ role: 'assistant', content: '' }, 'length')])
    const r = await chat({ messages: [{ role: 'user', content: 'q' }], max_tokens: 3000 })
    expect(r.truncated).toBe(true)
    account.user = null
    account.token = ''
    account.ai = null as never
  })

  it('a provider that refuses the thinking switch is asked again without it', async () => {
    const seen = scripted([
      () => ({ status: 400, contentType: 'application/json', retryAfter: null, body: '{"error":{"message":"Unknown parameter: thinking"}}' }),
      () => reply({ role: 'assistant', content: 'ok' })
    ])
    await chat({ messages: [{ role: 'user', content: 'q' }], reasoning: 'off' })
    expect(seen[0].thinking).toBeDefined()
    expect(seen[1].thinking).toBeUndefined()
  })
})

describe('problem reading never thinks', () => {
  it('route and build go with thinking off and a JSON answer in prose is accepted', async () => {
    const seen = scripted([
      () => reply({ role: 'assistant', content: '```json\n' + JSON.stringify({ route: 'template', id: 'projectile-slope', summary: '平抛落到斜面上', category: { types: ['抛体'] } }) + '\n```' }),
      () => reply({ role: 'assistant', content: JSON.stringify({ template: { id: 'projectile-slope', params: { theta: { value: 37, unit: '°' }, v0: { value: 20, unit: 'm/s' } } }, questions: [{ prompt: '飞行时间', target: { kind: 'event', event: 'impact', body: 'ball' } }, { prompt: 'AB', target: { kind: 'atEvent', id: 'custom.AB', event: 'impact', side: 'before', body: 'ball' } }] }) })
    ])
    const o = await readProblem('如图，从倾角 37° 的斜面顶端 A 以 20 m/s 水平抛出一小球，落在斜面上的 B 点，求飞行时间和 AB 的长度。g 取 10 m/s²')
    expect(o.ok).toBe(true)
    expect(seen).toHaveLength(2)
    for (const b of seen) expect(b.thinking).toEqual({ type: 'disabled' })
    if (o.ok && o.build.kind === 'template') expect(o.build.values).toMatchObject({ theta: 37, v0: 20 })
  })

  it('a failed reading keeps the beginning of the AI answer', async () => {
    scripted([
      () => reply({ role: 'assistant', content: '这道题我需要更多信息。' }),
      () => reply({ role: 'assistant', content: '' }),
      () => reply({ role: 'assistant', content: '' }),
      () => reply({ role: 'assistant', content: '还是不行' }),
      () => reply({ role: 'assistant', content: '还是不行' }),
      () => reply({ role: 'assistant', content: '还是不行' }),
      () => reply({ role: 'assistant', content: '还是不行' })
    ])
    const o = await readProblem('一道题')
    expect(o.ok).toBe(false)
    if (!o.ok) expect(o.raw).toContain('还是不行')
  })
})

describe('Copilot with thinking', () => {
  it('thinking on: each tool turn carries its thinking back and the thinking is shown', async () => {
    settings.ai.thinking = true
    const seen = scripted([
      () => reply({ role: 'assistant', content: null, reasoning_content: '先读受力', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'set_display', arguments: '{"forces":"all"}' } }] }, 'tool_calls'),
      b => {
        const a = b.messages.find(m => m.role === 'assistant')!
        expect(a.reasoning_content).toBe('先读受力')
        expect(b.thinking).toEqual({ type: 'enabled' })
        expect(b.max_tokens).toBe(16000)
        return reply({ role: 'assistant', content: '已显示全部受力。', reasoning_content: '完成' })
      }
    ])
    await sendToCopilot('显示所有受力')
    expect(seen).toHaveLength(2)
    expect(state.display.forces).toBe(true)
    expect(state.display.forcesAll).toBe(true)
    const bot = copilot.bubbles.find(b => b.role === 'assistant')!
    expect(bot.reasoning).toContain('先读受力')
    expect(bot.reasoning).toContain('完成')
    // Switching thinking off: the next question goes with the earlier turns as text only
    settings.ai.thinking = false
    const next = scripted([b => { expect(b.messages.some(m => m.role === 'tool')).toBe(false); expect(b.thinking).toEqual({ type: 'disabled' }); return reply({ role: 'assistant', content: '好的' }) }])
    await sendToCopilot('谢谢')
    expect(next).toHaveLength(1)
  })

  it('thinking off: thinking text a provider sends anyway stays out of the history', async () => {
    scripted([() => reply({ role: 'assistant', content: '你好', reasoning_content: 'x' })])
    await sendToCopilot('hi')
    expect(copilot.history.some(m => m.reasoning_content)).toBe(false)
  })
})

describe('new Copilot tools', () => {
  it('read_forces lists gravity, the normal force and friction from the simulation', () => {
    state.recording = simulate(state.scene)
    const r = readForces('block', { t: 0.5 })
    const byId = Object.fromEntries(r.forces.map(f => [f.id, f.value]))
    expect(byId.gravity).toBeCloseTo(2 * 9.8, 6)
    expect(byId['contact.block|incline.N']).toBeCloseTo(2 * 9.8 * Math.cos(Math.PI / 6), 2)
    expect(byId['contact.block|incline.f']).toBeCloseTo(0.2 * 2 * 9.8 * Math.cos(Math.PI / 6), 2)
    expect(r.forces.some(f => /\.(fx|fy)$/.test(f.id))).toBe(false)
    expect(() => readForces('nope', {})).toThrow(/no body/)
  })

  it('add_force adds an applied force; set_display "selected" selects a body', async () => {
    const add = toolByName('add_force')!
    expect(() => add.check!({ body: 'block' })).toThrow(/give F/)
    expect(() => add.check!({ body: 'incline', F: [1, 0] })).toThrow(/fixed/)
    const r = await add.run({ body: 'block', magnitude: 10, angleDeg: 90 }) as { added: string; F: number[] }
    const c = state.scene.connectors.find(x => x.id === r.added)!
    expect(c.type).toBe('force')
    expect(r.F[0]).toBeCloseTo(0, 9)
    expect(r.F[1]).toBeCloseTo(10, 9)
    await toolByName('set_display')!.run({ forces: 'selected' })
    expect(state.selection).toEqual({ kind: 'body', id: 'block' })
    expect(state.display.forcesAll).toBe(false)
  })

  it('build_scene checks the description and loads the scene', async () => {
    const tool = toolByName('build_scene')!
    expect(() => tool.check!({ scene: { name: 'x', bodies: [{ id: 'a', shape: 'box', width: 0.2, height: 0.2, mass: -1 }] } })).toThrow()
    const spec = {
      name: '两物块与滑轮', duration: 2,
      surfaces: [{ type: 'ground', id: 'table', top: 0, left: -2, right: 0.6, muK: 0.2, muS: 0.2 }],
      pulleys: [{ id: 'p', position: [0.65, 0.05], radius: 0.05 }],
      bodies: [{ id: 'A', name: '物块 A', shape: 'box', width: 0.2, height: 0.1, mass: 2, on: { surface: 'table', x: -0.5 } }, { id: 'B', name: '物块 B', shape: 'box', width: 0.1, height: 0.1, mass: 1, position: [0.7, -0.5] }],
      connectors: [{ type: 'rope', a: 'A', b: 'B', via: ['p'] }]
    }
    tool.check!({ scene: spec })
    const r = await tool.run({ scene: spec }) as { bodies: Array<{ id: string }> }
    expect(loadScene).toHaveBeenCalledTimes(1)
    expect(r.bodies.map(b => b.id)).toEqual(expect.arrayContaining(['A', 'B']))
  })
})

describe('识别题目 in the Copilot box', () => {
  it('shows the reading as one item and tells the conversation what was loaded', async () => {
    scripted([
      () => reply({ role: 'assistant', content: JSON.stringify({ route: 'template', id: 'incline', summary: '斜面上的物块', category: {} }) }),
      () => reply({ role: 'assistant', content: JSON.stringify({ template: { id: 'incline', params: { theta: { value: 30, unit: '°' } } }, questions: [{ prompt: 'a', target: { kind: 'quantity', id: 'block.a', t: 0.5 } }] }) })
    ])
    const o = await recognizeInCopilot('一个质量为 2 kg 的木块从倾角 30° 的斜面顶端静止下滑，μ = 0.2，求加速度。')
    expect(o?.ok).toBe(true)
    expect(copilot.bubbles.map(b => b.role)).toEqual(['user', 'import'])
    expect(copilot.bubbles[1].outcome?.ok).toBe(true)
    expect(openProblem).toHaveBeenCalled()
    expect(copilot.history).toHaveLength(2)
    expect(String(copilot.history[1].content)).toContain('斜面上的物块')
    expect(copilot.busy).toBe(false)
  })
})

describe('angles that agree with the stated sin / cos values', () => {
  it('finds the stated values and their complements; leaves other angles alone', async () => {
    const { statedAngles, alignAngles } = await import('../../src/ai/import/angles')
    const m = statedAngles('g 取 10 m/s²，sin37° = 0.6，cos 37°=0.8，tan53°=4/3')
    expect(m.get(37)).toBeCloseTo(36.8699, 3)
    expect(m.get(53)).toBeCloseTo(53.1301, 3)
    expect(statedAngles('sin30° = 0.5').size).toBe(0)
    expect(statedAngles('倾角 37°').size).toBe(0)
    const raw = { template: { id: 'projectile-slope', params: { theta: { value: 37 }, v0: { value: 37, unit: 'm/s' } } } }
    const notes = alignAngles(raw, '倾角为 37° 的斜面，sin37° = 0.6')
    expect(raw.template.params.theta.value).toBeCloseTo(36.8699, 3)
    expect(raw.template.params.v0.value).toBe(37)
    expect(notes).toHaveLength(1)
    const scene = { scene: { surfaces: [{ type: 'incline', angleDeg: 53 }] } }
    alignAngles(scene, 'sin37°=0.6')
    expect(scene.scene.surfaces[0].angleDeg).toBeCloseTo(53.1301, 3)
  })

  it('a reading of the 平抛落斜面 problem matches the textbook answers 3 s and 75 m', async () => {
    scripted([
      () => reply({ role: 'assistant', content: JSON.stringify({ route: 'template', id: 'projectile-slope', summary: '平抛落斜面', category: {} }) }),
      () => reply({ role: 'assistant', content: JSON.stringify({ template: { id: 'projectile-slope', params: { theta: { value: 37, unit: '°' }, v0: { value: 20, unit: 'm/s' }, g: { value: 10, unit: 'm/s²' } } }, questions: [{ prompt: 't', target: { kind: 'event', event: 'impact', body: 'ball' } }, { prompt: 'AB', target: { kind: 'atEvent', id: 'custom.AB', event: 'impact', side: 'before', body: 'ball' } }] }) })
    ])
    const o = await readProblem('从倾角为 37° 的斜面顶端 A 以 20 m/s 水平抛出小球，落在斜面上 B 点。g 取 10 m/s²，sin37° = 0.6，cos37° = 0.8。求飞行时间与 AB。')
    expect(o.ok).toBe(true)
    if (!o.ok || o.build.kind !== 'template') return
    expect(o.build.values.theta).toBeCloseTo(36.8699, 3)
    expect(o.assumptions.some(a => a.includes('36.8699'))).toBe(true)
    const { simulate } = await import('../../src/engine/recording')
    const { evaluateProblemTarget } = await import('../../src/teaching/problems')
    const { recognize } = await import('../../src/formula/recognize')
    const rec = simulate(o.build.scene, { duration: o.build.duration })
    const sits = recognize(rec)
    const t = evaluateProblemTarget(rec, sits, o.build.questions[0].target).sim ?? NaN
    const ab = evaluateProblemTarget(rec, sits, o.build.questions[1].target).sim ?? NaN
    expect(t).toBeCloseTo(3, 1)
    expect(Math.abs(t - 3) / 3).toBeLessThan(0.005)
    expect(Math.abs(ab - 75) / 75).toBeLessThan(0.005)
  })
})

describe('Copilot answers with tables', () => {
  it('renders a Markdown table between text lines, escaping the cells', async () => {
    const { renderAnswer } = await import('../../src/ai/copilot/render')
    const html = renderAnswer('此时受力：\n| 力 | 大小 |\n|---|---|\n| 重力 $G = mg$ | 19.6 N |\n| <b>支持力</b> | 16.97 N |\n这些力由引擎算出。')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>力</th>')
    expect(html).toContain('<td>19.6 N</td>')
    expect(html).toContain('katex')
    expect(html).toContain('&lt;b&gt;支持力&lt;/b&gt;')
    expect(html.indexOf('此时受力')).toBeLessThan(html.indexOf('<table>'))
    expect(html.indexOf('这些力由引擎算出')).toBeGreaterThan(html.indexOf('</table>'))
    expect(renderAnswer('| a |\nb')).not.toContain('<table>')
  })
})
