/**
 * 26.64 (D283): the builder in the app, with the mocked AI of the other Copilot tests. The sketch path is the default:
 * reading notes, then the sketch — as a strict function call where the connection has it, as a JSON-mode answer
 * elsewhere (an empty one is asked again) — compiled, checked, patched, loaded as a problem; a build that cannot be
 * mended loads nothing and says what could not be placed. The switch brings the scene-file builder of 26.60 back, and
 * "change the current scene" stays with it.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { Scene } from '../../../src/core/scene/types'
import { buildTemplate } from '../../../src/templates'

const state = {
  dirty: false, page: 'studio', rightTab: 'formula', bottomTab: 'chart', problem: null as null | { problem: { id: string; questions: unknown[]; stem: string }; revealed: boolean; answers: Record<string, unknown> }, scene: buildTemplate('incline') as Scene, fileName: null,
  recording: null, situations: [], run: { tComputed: 0, unbounded: true, paused: false }, computing: false, playing: false, time: 0, speed: 1, selection: null, stale: false,
  showModels: false, modelId: null, modelPreset: null, settingsSection: null, showTemplates: false, showProblems: false, chart: [] as string[]
}
const loadScene = vi.fn((s: Scene) => { state.scene = s; state.problem = null })
vi.mock('../../../src/app/store', () => ({ state, loadScene, edit: vi.fn(), play: vi.fn(), pause: vi.fn(), rewind: vi.fn(), seekTime: vi.fn(), showToast: vi.fn(), documentScene: () => state.scene }))
vi.mock('../../../src/app/trialLog', () => ({ logEvent() {} }))
vi.mock('../../../src/platform/ask', () => ({ ask: vi.fn(async () => true) }))
vi.mock('../../../src/app/task/taskState', () => ({ taskUi: { task: null, state: 'draft' }, setTask: vi.fn(), currentResults: () => [], solveCurrent: vi.fn(), readText: vi.fn() }))
const openProblem = vi.fn(async (p: { id: string; scene: Scene; questions: unknown[]; stem: string }) => { state.scene = p.scene; state.problem = { problem: p, revealed: false, answers: {} }; return true })
vi.mock('../../../src/app/problemMode', () => ({ openProblem, reveal: vi.fn(), openBuiltin: vi.fn(async () => true), openProblemText: vi.fn() }))

const { buildScene } = await import('../../../src/ai/copilot/builder')
const { simHooks } = await import('../../../src/ai/copilot/simTools')
const session = await import('../../../src/ai/copilot/session')
const { copilot, sendToCopilot, buildFromAnswer, clearCopilot } = session
const { setTransport } = await import('../../../src/platform/net')
const { settings } = await import('../../../src/app/settings')
const { setKey } = await import('../../../src/ai/keys')
const { resetCaps, aiStrictTools, wireRequest } = await import('../../../src/ai/client')
const { capabilitiesOf } = await import('../../../src/ai/capabilities')
const { SKETCH_EXAMPLES, sketchSystem } = await import('../../../src/ai/sketch/prompt')
const { SIM_EXAMPLES } = await import('../../../src/ai/copilot/simPrompt')
const { DATA_RULE } = await import('../../../src/ai/import/prompts')
const { submitSketchTool } = await import('../../../src/ai/sketch/schema')

type Body = Record<string, unknown> & { messages: Array<{ role: string; content: unknown }>; tools?: Array<{ function: { name: string; strict?: boolean } }> }
const ok = (message: unknown) => ({ status: 200, contentType: 'application/json', retryAfter: null, body: JSON.stringify({ choices: [{ message, finish_reason: 'stop' }], usage: { total_tokens: 50 } }) })
const text = (content: string) => ok({ role: 'assistant', content })
const call = (name: string, args: string) => ok({ role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: args } }] })
function scripted(replies: Array<(b: Body) => ReturnType<typeof ok>>) {
  const seen: Body[] = []
  setTransport(async req => { const b = JSON.parse(req.body ?? '{}') as Body; seen.push(b); const r = replies.shift(); if (!r) throw new Error('no reply'); return r(b) })
  return seen
}
const T = SKETCH_EXAMPLES.find(e => e.key === 'table-pulley')!
const broken = () => { const s = JSON.parse(JSON.stringify(T.sketch)); s.connectors[0].path = ['A.right', 'P', 'A.top']; return JSON.stringify(s) }

beforeEach(() => {
  settings.ai.connection = 'openai'
  settings.ai.openai = { baseUrl: 'https://ai.test/v1', model: 'm', vision: true }
  settings.ai.copilotMode = 'act'
  settings.ai.learningMode = false
  settings.ai.thinking = false
  settings.ai.sceneBuilder = 'sketch'
  setKey('openai', 'sk-test')
  resetCaps()
  clearCopilot()
  simHooks.waitMs = 0
  state.scene = buildTemplate('incline')
  state.problem = null
  loadScene.mockClear()
  openProblem.mockClear()
})
afterEach(() => setTransport(null))

describe('the sketch builder in the app (26.64)', () => {
  it('is the default; on a connection without strict calls: notes, then a JSON-mode sketch; the scene opens as a problem', async () => {
    expect(settings.ai.sceneBuilder).toBe('sketch')
    expect(aiStrictTools()).toBe(false)
    const seen = scripted([() => text(T.notes), () => text(JSON.stringify(T.sketch))])
    const status: string[] = []
    const r = await buildScene({ problem: T.problem, solution: '**答案** a = 1.96 m/s²' }, { onStatus: s => status.push(s) })
    if (!r.ok) throw new Error(r.errors.join('; '))
    expect(seen).toHaveLength(2)
    // 1: the short prompt with the six examples, the problem, the explanation and the five closest templates; free text
    expect(String(seen[0].messages[0].content)).toBe(sketchSystem() + DATA_RULE)
    const ask = String(seen[0].messages[1].content)
    expect(ask).toContain(T.problem)
    expect(ask).toContain('a = 1.96 m/s²')
    expect(ask).toContain('<templates>')
    expect(ask).toContain('table-pulley｜')
    expect(seen[0].tools).toBeUndefined()
    expect(seen[0].response_format).toBeUndefined()
    // 2: the notes go back with the request for the sketch, in JSON mode
    expect(seen[1].messages.map(m => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(seen[1].messages[2].content).toBe(T.notes)
    expect(seen[1].response_format).toEqual({ type: 'json_object' })
    expect(seen[1].tools).toBeUndefined()
    expect(r).toMatchObject({ tries: 1, via: 'sketch' })
    expect(r.card).toMatchObject({ ok: true, name: '桌面—滑轮连接体', bodies: 4, connectors: 1, questions: ['A 的加速度', '绳的拉力'], warnings: [] })
    expect(r.assumptions).toContain('题目没有给 g，取 9.8 m/s²')
    expect(openProblem).toHaveBeenCalledTimes(1)
    expect((state.scene.extra as { ai: { route: string } }).ai.route).toBe('copilot-sketch')
    // every coordinate was computed by the app: the hanging block is under the wheel's rim
    const B = state.scene.bodies.find(b => b.id === 'B')!, P = state.scene.pulleys[0]
    expect(B.position.x).toBeCloseTo(P.position.x + P.radius, 12)
    expect(status).toEqual(['正在读题（写读题笔记）', '正在写场景草图', '正在编译并检查草图', '检查并载入场景'])
  })

  it('a connection with strict function calls gets submit_sketch with strict: true; elsewhere `strict` never leaves the app', async () => {
    settings.ai.openai = { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', vision: true }
    resetCaps()
    expect(aiStrictTools()).toBe(true)
    const seen = scripted([() => text(T.notes), () => call('submit_sketch', JSON.stringify(T.sketch))])
    const r = await buildScene({ problem: T.problem })
    expect(r.ok).toBe(true)
    expect(seen[1].tools).toHaveLength(1)
    expect(seen[1].tools![0].function).toMatchObject({ name: 'submit_sketch', strict: true })
    expect(seen[1].tool_choice).toEqual({ type: 'function', function: { name: 'submit_sketch' } })
    expect(seen[1].response_format).toBeUndefined()
    // the capability table: OpenAI and DeepSeek's beta address have strict calls, DeepSeek's normal address does not
    expect(capabilitiesOf('https://api.deepseek.com/beta', 'deepseek-chat').strictTools).toBe(true)
    expect(capabilitiesOf('https://api.deepseek.com', 'deepseek-chat').strictTools).toBe(false)
    expect(capabilitiesOf('https://ai.test/v1', 'm').strictTools).toBe(false)
    settings.ai.openai = { baseUrl: 'https://ai.test/v1', model: 'm', vision: true }
    resetCaps()
    const wire = wireRequest({ messages: [], tools: [submitSketchTool(true)] }) as { tools: Array<{ function: Record<string, unknown> }> }
    expect('strict' in wire.tools[0].function).toBe(false)
  })

  it('a provider that refuses strict mode is remembered: the same call goes out without it', async () => {
    settings.ai.openai = { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', vision: true }
    resetCaps()
    const refuse = () => ({ status: 400, contentType: 'application/json', retryAfter: null, body: JSON.stringify({ error: { message: 'Invalid schema for function submit_sketch: strict mode is not supported' } }) })
    const seen = scripted([() => text(T.notes), refuse, () => call('submit_sketch', JSON.stringify(T.sketch))])
    const r = await buildScene({ problem: T.problem })
    expect(r.ok).toBe(true)
    expect(seen[1].tools![0].function.strict).toBe(true)
    expect('strict' in seen[2].tools![0].function).toBe(false)
    expect(aiStrictTools()).toBe(false)
  })

  it('an empty JSON-mode answer is asked again, not counted as a round', async () => {
    // (the client asks an empty answer once more with more room; the builder then asks again itself)
    const seen = scripted([() => text(T.notes), () => text('  '), () => text('  '), () => text(JSON.stringify(T.sketch))])
    const r = await buildScene({ problem: T.problem })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.tries).toBe(1)
    expect(seen).toHaveLength(4)
  })

  it('a finding goes back with the fragments it is about; the patch is applied and the scene loads', async () => {
    const seen = scripted([() => text(T.notes), () => text(broken()), () => text('{"patch":[{"op":"set","path":"connectors[0].path","value":["A.right","P","B.top"]}]}')])
    const r = await buildScene({ problem: T.problem })
    if (!r.ok) throw new Error(r.errors.join('; '))
    expect(r.tries).toBe(2)
    // the repair request: its own short prompt, the problem, fragments and diagnostics — not the conversation
    expect(seen[2].messages).toHaveLength(2)
    const repair = String(seen[2].messages[1].content)
    expect(repair).toContain('"code":"L2.floating"')
    expect(repair).toContain('"path":"bodies[1]"')
    expect(repair).toContain('"mayAlsoSet":["connectors[0].path"]')
    expect(repair).toContain('"connectors[0]":{"id":"rope1"')
    expect(repair).not.toContain('"surfaces[0]"')
    expect(repair).not.toContain(T.notes.slice(0, 20))
    expect(String(seen[2].messages[0].content)).not.toContain('# 示例')
    expect(state.scene.connectors[0]).toMatchObject({ type: 'rope', b: { body: 'B' } })
  })

  it('what cannot be mended is not loaded: the user is told what could not be placed and what was', async () => {
    const before = state.scene
    scripted([
      () => text('**答案** a = 1.96 m/s²'),
      () => text(T.notes), () => text(broken()), () => text('{"patch":[]}'), () => text('{"patch":[{"op":"set","path":"title","value":"x"}]}'),
      () => text('{"route":"unsupported","reason":"没有合适的模板"}')
    ])
    await sendToCopilot(T.problem)
    const answer = copilot.bubbles.find(b => b.role === 'assistant')!
    await buildFromAnswer(answer)
    expect(answer.offer?.state).toBe('failed')
    expect(openProblem).not.toHaveBeenCalled()
    expect(loadScene).not.toHaveBeenCalled()
    expect(state.scene).toBe(before)
    const err = copilot.bubbles.at(-1)!
    expect(err.role).toBe('error')
    expect(err.text).toBe('这道题我没能搭对，所以没有载入场景。这几处没摆对：\n· “物块B”没有被支撑，也没有绳或弹簧连到它\n· 已摆好的部分：地面、桌面、物块A、定滑轮\n· 没能摆好的部分：物块B')
  })

  it('a scene whose geometry and run stand but whose contract with the text does not is loaded with the finding told', async () => {
    const s = JSON.parse(JSON.stringify(T.sketch)); s.values.push({ of: 'table', quantity: 'height', value: 0.9, unit: 'm', quote: '桌面高 0.9 m' })
    scripted([() => text(T.notes), () => text(JSON.stringify(s)), () => text('{"patch":[]}'), () => text('{"patch":[]}'), () => text('{"route":"unsupported","reason":"-"}')])
    const r = await buildScene({ problem: T.problem })
    if (!r.ok) throw new Error(r.errors.join('; '))
    expect(r.card.warnings).toEqual(['场景已载入，但与题目的核对有 1 处没有通过：', '这个量在题目里找不到出处：桌面 · 高度 = 0.9 m'])
  })

  it('"template + parameters" keeps the template link; "the engine cannot do it" is a refusal', async () => {
    const tpl = { route: 'template', title: '阿特伍德机', templateId: 'atwood', templateParams: [{ key: 'm1', value: 1, unit: 'kg', quote: '1 kg' }, { key: 'm2', value: 2, unit: 'kg', quote: '2 kg' }], questions: [{ prompt: '加速度', unit: 'm/s²', kind: 'quantity', id: 'm2.a', t: 0.2 }] }
    scripted([() => text('模板 atwood 合适。'), () => text(JSON.stringify(tpl))])
    const r = await buildScene({ problem: '质量 1 kg 和 2 kg 的两个物块跨过定滑轮悬挂，求加速度。' })
    if (!r.ok) throw new Error(r.errors.join('; '))
    expect(r.via).toBe('template')
    expect((state.scene.extra as { template: { id: string; values: Record<string, number> }; ai: { route: string } })).toMatchObject({ template: { id: 'atwood', values: { m1: 1, m2: 2 } }, ai: { route: 'copilot-template' } })
    scripted([() => text('电路题。'), () => text('{"route":"unsupported","reason":"这是电路题，力学引擎不能模拟"}')])
    const no = await buildScene({ problem: '两个电阻串联，求总电阻。' })
    expect(no).toMatchObject({ ok: false, refused: '这是电路题，力学引擎不能模拟' })
  })

  it('the switch brings back the scene-file builder of 26.60; changing the current scene always uses it', async () => {
    const { questions, ...scene } = SIM_EXAMPLES[1].file
    const file = JSON.stringify({ title: String(scene.name), scene, questions })
    settings.ai.sceneBuilder = 'legacy'
    let seen = scripted([() => text(file)])
    expect((await buildScene({ problem: T.problem })).ok).toBe(true)
    expect(seen).toHaveLength(1)
    expect(String(seen[0].messages[0].content)).toContain('"format": "velophi-scene"')
    settings.ai.sceneBuilder = 'sketch'
    seen = scripted([() => text(file)])
    expect((await buildScene({ request: '把 B 的质量改成 2 kg', current: scene })).ok).toBe(true)
    expect(String(seen[0].messages[1].content)).toContain('<current_scene>')
  })
})
