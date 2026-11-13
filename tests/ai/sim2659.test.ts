/**
 * Scene files written by the AI (26.59 fix 3, D198) and the merged Copilot of 26.60 (D204). The builder's examples load
 * and give the textbook answers, the forgiving normalization (vectors as arrays, degrees, shorthands, rope wraps,
 * centres of mass, "rest"), the errors sent back for repair (deep overlaps, unknown quantity ids, missing masses); the
 * conversation: a problem gets 答案 · 过程 · 解释 and the offer to build it, the builder (a JSON-only request, repaired
 * at most twice) loads it as a problem, build_scene from a request, and the comparison with the engine's answers.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { DATA_RULE } from '../../src/ai/import/prompts'
import type { Scene } from '../../src/core/scene/types'
import { buildTemplate } from '../../src/templates'

const state = {
  dirty: false, page: 'studio', rightTab: 'formula', bottomTab: 'chart', problem: null as null | { problem: { id: string; questions: unknown[]; stem: string }; revealed: boolean; answers: Record<string, unknown> }, scene: buildTemplate('incline') as Scene, fileName: null,
  recording: null, situations: [], run: { tComputed: 0, unbounded: true, paused: false }, computing: false, playing: false, time: 0, speed: 1, selection: null, stale: false,
  showModels: false, modelId: null, modelPreset: null, settingsSection: null, showTemplates: false, showProblems: false, chart: [] as string[]
}
const loadScene = vi.fn((s: Scene) => { state.scene = s; state.problem = null })
vi.mock('../../src/app/store', () => ({ state, loadScene, edit: vi.fn(), play: vi.fn(), pause: vi.fn(), rewind: vi.fn(), seekTime: vi.fn(), showToast: vi.fn(), documentScene: () => state.scene }))
vi.mock('../../src/app/trialLog', () => ({ logEvent() {} }))
vi.mock('../../src/platform/ask', () => ({ ask: vi.fn(async () => true) }))
vi.mock('../../src/app/task/taskState', () => ({ taskUi: { task: null, state: 'draft' }, setTask: vi.fn(), currentResults: () => [], solveCurrent: vi.fn(), readText: vi.fn() }))
const openProblem = vi.fn(async (p: { id: string; scene: Scene; questions: unknown[]; stem: string }) => { state.scene = p.scene; state.problem = { problem: p, revealed: false, answers: {} }; return true })
vi.mock('../../src/app/problemMode', () => ({ openProblem, reveal: vi.fn(), openBuiltin: vi.fn(async () => true), openProblemText: vi.fn() }))

const { prepareAiScene, compactSceneDoc, sceneBlocks, withoutSceneBlocks } = await import('../../src/ai/copilot/simScene')
const { SIM_EXAMPLES, builderSystem } = await import('../../src/ai/copilot/simPrompt')
const { copilotSystem } = await import('../../src/ai/copilot/copilotPrompt')
const { jsonOf } = await import('../../src/ai/copilot/builder')
const { simHooks, copilotToolDefs } = await import('../../src/ai/copilot/simTools')
const session = await import('../../src/ai/copilot/session')
const { copilot, sendToCopilot, buildFromAnswer, compareWithSim, clearCopilot } = session
const { setTransport } = await import('../../src/platform/net')
const { settings } = await import('../../src/app/settings')
const { setKey } = await import('../../src/ai/keys')
const { resetCaps } = await import('../../src/ai/client')
const { EngineSession } = await import('../../src/engine/session')

/** Values of quantities at time t from a full run of the scene. */
function valuesAt(scene: Scene, ids: string[], t: number): number[] {
  const s = EngineSession.simulate(scene, { duration: Math.max(t + 0.2, 1) })
  try { return Array.from(s.call<{ values: number[] }>({ op: 'evaluate', ids, t }).values) } finally { s.free() }
}
function extreme(scene: Scene, id: string, which: 'max' | 'min', duration: number): number {
  const s = EngineSession.simulate(scene, { duration })
  try { return s.call<{ value: number }>({ op: 'extreme', id, which }).value } finally { s.free() }
}

describe('scene files of the simulation Copilot', () => {
  it('every example of the prompt loads and gives the textbook answer', () => {
    const prepared = SIM_EXAMPLES.map(e => prepareAiScene(e.file))
    for (const p of prepared) { if (!p.ok) throw new Error(p.errors.join('; ')); expect(p.questions.length).toBeGreaterThan(0) }
    const [incline, pulley, arc, slide] = prepared.map(p => (p.ok ? p.scene : null)!)
    // 1: a = g(sin30° − μ cos30°) = 3.268 m/s², v(1 s) = 3.268 m/s
    const [v1] = valuesAt(incline, ['block.v'], 1)
    expect(v1).toBeCloseTo(10 * (0.5 - 0.2 * Math.cos(Math.PI / 6)), 3)
    expect(incline.bodies[1].angle).toBeCloseTo(-Math.PI / 6, 6)
    // 2: a = (m_B − μ m_A) g / (m_A + m_B) = 1.96 m/s², T = m_B (g − a) = 7.84 N
    const [a, T] = valuesAt(pulley, ['A.a', 'rope.T'], 0.2)
    expect(a).toBeCloseTo(1.96, 3)
    expect(T).toBeCloseTo(7.84, 3)
    // 3 (26.60 r2): the track's inner radius is R + r, so the ball's centre runs on R = 0.8 m from the rim: the
    // textbook answers v = √(2gR) = 3.960 m/s and N = 3mg = 2.94 N
    expect(extreme(arc, 'ball.v', 'max', 1.2)).toBeCloseTo(Math.sqrt(2 * 9.8 * 0.8), 4)
    expect(extreme(arc, 'contact.ball|track.N', 'max', 1.2)).toBeCloseTo(3 * 0.98, 3)
    // 4 (26.60 r2, D207): a slide with an arc part on a smooth floor — v = √(2gR·M/(M+m)) = 2.711 m/s, V = −v·m/M
    const v4 = Math.sqrt(2 * 9.8 * 0.5 * 3 / 4)
    expect(extreme(slide, 'ball.vx', 'max', 1.2)).toBeCloseTo(v4, 4)
    expect(extreme(slide, 'slide.vx', 'min', 1.2)).toBeCloseTo(-v4 / 3, 4)
    // The builder's prompt carries the examples (as whole outputs), the targets and the format; JSON only
    const sys = builderSystem()
    for (const e of SIM_EXAMPLES) { const { questions, ...scene } = e.file; expect(sys).toContain(JSON.stringify(scene)); expect(sys).toContain(JSON.stringify(questions)) }
    expect(sys).toContain('"format": "velophi-scene"')
    expect(sys).toContain('只输出一个 JSON 对象')
    expect(sys).not.toContain('apply_scene')
  })

  it('normalizes hand-written JSON: arrays, degrees, shorthands, wraps, centres of mass, rest', () => {
    const r = prepareAiScene({
      name: 'mix', gravity: 10,
      bodies: [
        { id: 'floor', kind: 'fixed', shape: 'box', width: 8, height: 0.4, position: [0, -0.2], mu: 0.3 },
        { id: 'wedge', kind: 'dynamic', shape: { type: 'triangle', points: [[0, 0], [0, 0.4], [0.6, 0]] }, position: [1, 0.001], mass: 3 },
        { id: 'groove', shape: { type: 'arc', radius: 0.5, thickness: 0.1, startDeg: 180, sweepDeg: 180 }, position: [-2, 0.6], mass: 2, fixedRotation: true },
        { id: 'cart', shape: { type: 'compound', parts: [{ shape: { type: 'box', width: 0.4, height: 0.1 }, position: [0, 0.15] }, { shape: { type: 'circle', radius: 0.05 }, position: [-0.15, 0.05] }, { shape: { type: 'circle', radius: 0.05 }, position: [0.15, 0.05] }] }, position: [2.5, 0], mass: 1 },
        { id: 'box', shape: { type: 'box', width: 0.2, height: 0.2 }, position: [-0.5, 0.7], mass: 1, angleDeg: 20, rest: true }
      ],
      pulleys: [{ id: 'w', position: [3.5, 1.5], radius: 0.1 }],
      connectors: [
        { type: 'rope', a: 'cart', b: [3.6, 0.5], pulleys: ['w'] },
        { type: 'spring', a: 'box', b: { body: null, local: [-1.4, 0.1] }, k: 50 },
        { type: 'force', body: 'wedge', magnitude: 10, angleDeg: 90 }
      ]
    })
    if (!r.ok) throw new Error(r.errors.join('; '))
    const s = r.scene
    expect(s.settings.gravity).toEqual({ x: 0, y: -10 })
    expect(s.bodies.map(b => b.kind)).toEqual(['static', 'rigid', 'rigid', 'rigid', 'rigid'])
    expect(s.bodies[0].material).toMatchObject({ muS: 0.3, muK: 0.3 })
    // The wedge's points were clockwise and off its centre of mass: reversed and re-centred, the shape stays put
    const w = s.bodies[1]
    expect(w.shape.type).toBe('polygon')
    expect(w.position.x).toBeCloseTo(1.2, 9)
    expect(w.position.y).toBeCloseTo(0.001 + 0.4 / 3, 9)
    // The moving arc: position named the circle's centre; now the centre of mass is the origin
    const g = s.bodies[2]
    expect(g.shape.type === 'arc' && g.shape.center).toBeTruthy()
    if (g.shape.type === 'arc') { expect(g.position.x + g.shape.center!.x).toBeCloseTo(-2, 9); expect(g.position.y + g.shape.center!.y).toBeCloseTo(0.6, 9); expect(g.shape.sweep).toBeCloseTo(Math.PI, 12) }
    // The cart's parts were moved to its centre of mass
    const c = s.bodies[3]
    if (c.shape.type !== 'compound') throw new Error('compound expected')
    expect(c.position.y).toBeGreaterThan(0.05)
    // "rest" put the box on the floor, square to it
    const bx = s.bodies[4]
    expect(bx.position.y).toBeCloseTo(0.1, 6)
    expect(bx.angle).toBeCloseTo(0, 9)
    // The rope's wrap came from the geometry (up from the cart, over the wheel, down on the right: clockwise)
    const rope = s.connectors.find(x => x.type === 'rope')!
    expect(rope.type === 'rope' && rope.pulleys[0]).toEqual({ pulley: 'w', wrap: 'cw' })
    expect(s.connectors.find(x => x.type === 'spring')).toMatchObject({ stiffness: 50, restLength: null, damping: 0 })
    expect(s.connectors.find(x => x.type === 'force')).toMatchObject({ force: { x: expect.closeTo(0, 9), y: expect.closeTo(10, 9) } })
    expect(r.notes.some(n => n.includes('counter-clockwise'))).toBe(true)
    expect(s.view.pixelsPerMeter).toBeGreaterThan(0)
  })

  it('pushes overlaps apart and sends back what to fix: quantity ids, masses, references', () => {
    // An overlap at the start is pushed apart (D200) and noted; a body left inside another cannot be
    const overlap = prepareAiScene({ bodies: [{ id: 'floor', kind: 'static', shape: { type: 'box', width: 4, height: 0.4 }, position: [0, -0.2] }, { id: 'a', shape: { type: 'box', width: 0.4, height: 0.4 }, position: [0, 0.05], mass: 1 }] })
    if (!overlap.ok) throw new Error(overlap.errors.join('; '))
    expect(overlap.scene.bodies[1].position.y).toBeCloseTo(0.2, 6)
    expect(overlap.notes.join(' ')).toMatch(/pushed apart/)
    const welded = prepareAiScene({ bodies: [{ id: 'a', shape: { type: 'box', width: 0.4, height: 0.4 }, position: [0, 1], mass: 1 }, { id: 'b', shape: { type: 'box', width: 0.4, height: 0.4 }, position: [0.1, 1], mass: 1 }], connectors: [{ type: 'weld', a: 'a', b: 'b' }] })
    expect(welded.ok).toBe(true)
    const q = prepareAiScene(SIM_EXAMPLES[0].file, [{ prompt: 'v', target: { kind: 'quantity', id: 'blok.v', t: 1 } }])
    expect(q.ok).toBe(false)
    if (!q.ok) { expect(q.errors.join(' ')).toContain('blok.v'); expect(q.errors.join(' ')).toContain('block.v') }
    const m = prepareAiScene({ bodies: [{ id: 'a', shape: { type: 'circle', radius: 0.1 }, position: [0, 1] }] })
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.errors[0]).toContain('bodies[0].mass')
    const ref = prepareAiScene({ bodies: [{ id: 'a', shape: { type: 'circle', radius: 0.1 }, position: [0, 1], mass: 1 }], connectors: [{ type: 'rope', a: 'a', b: 'ghost' }] })
    expect(ref.ok).toBe(false)
    // Arguments sent as JSON text are read as well
    const asText = prepareAiScene(JSON.stringify(SIM_EXAMPLES[1].file), JSON.stringify((SIM_EXAMPLES[1].file as { questions: unknown }).questions))
    expect(asText.ok && asText.questions.length).toBe(2)
    const bad = prepareAiScene('{"bodies": [')
    expect(bad.ok).toBe(false)
  })

  it('a template as a compact file comes back as the same scene', () => {
    const t = buildTemplate('atwood')
    const doc = compactSceneDoc(t)
    expect(JSON.stringify(doc).length).toBeLessThan(JSON.stringify(t).length)
    const r = prepareAiScene(doc)
    if (!r.ok) throw new Error(r.errors.join('; '))
    expect(r.scene.bodies.map(b => [b.id, b.position.x, b.position.y, b.mass])).toEqual(t.bodies.map(b => [b.id, b.position.x, b.position.y, b.mass]))
    expect(r.scene.connectors[0]).toMatchObject({ type: 'rope', pulleys: [{ pulley: 'pulley', wrap: 'cw' }] })
  })

  it('finds scene files in an answer and leaves the prose', () => {
    const text = `我这样搭：\n\n\`\`\`json\n${JSON.stringify({ scene: SIM_EXAMPLES[1].file })}\n\`\`\`\n\n算出来后告诉你。\n\n\`\`\`json\n{"a": 1}\n\`\`\``
    expect(sceneBlocks(text)).toHaveLength(1)
    const rest = withoutSceneBlocks(text)
    expect(rest).toContain('我这样搭')
    expect(rest).toContain('{"a": 1}')
    expect(rest).not.toContain('velophi-scene')
  })
})

type Body = Record<string, unknown> & { messages: Array<{ role: string; content: unknown }>; tools?: Array<{ function: { name: string } }> }
const ok = (message: unknown) => ({ status: 200, contentType: 'application/json', retryAfter: null, body: JSON.stringify({ choices: [{ message, finish_reason: 'stop' }], usage: { total_tokens: 50 } }) })
const call = (name: string, args: unknown, id = 'c1') => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] })
function scripted(replies: Array<(b: Body) => ReturnType<typeof ok>>) {
  const seen: Body[] = []
  setTransport(async req => { const b = JSON.parse(req.body ?? '{}') as Body; seen.push(b); const r = replies.shift(); if (!r) throw new Error('no reply'); return r(b) })
  return seen
}
const PROBLEM = '水平桌面上质量 2 kg 的物块 A（与桌面 μ = 0.2）用轻绳跨过桌边的光滑定滑轮与质量 1 kg 的物块 B 相连，由静止释放，求 A 的加速度和绳的拉力。'

beforeEach(() => {
  settings.ai.connection = 'openai'
  settings.ai.openai = { baseUrl: 'https://ai.test/v1', model: 'm', vision: true }
  settings.ai.copilotMode = 'act'
  settings.ai.learningMode = false
  settings.ai.thinking = false
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

/** The builder's whole answer for an example (what a model returns: one JSON object). */
const built = (i: number, extra: Record<string, unknown> = {}) => { const { questions, ...scene } = SIM_EXAMPLES[i].file; return JSON.stringify({ title: String(scene.name), stem: SIM_EXAMPLES[i].title, assumptions: ['滑轮半径取 0.05 m'], scene, questions, ...extra }) }

describe('the Copilot (26.60, D204)', () => {
  it('a problem gets 答案 · 过程 · 解释 and the offer; the builder loads it as a problem, shown as a card, undoable', async () => {
    const seen = scripted([
      () => ok({ role: 'assistant', content: '**答案**\n- a = 1.96 m/s²\n- T = 7.84 N\n\n**过程** …\n\n**解释** …' }),
      () => ok({ role: 'assistant', content: built(1) })
    ])
    await sendToCopilot(PROBLEM)
    expect(seen).toHaveLength(1)
    // One prompt (teacher and assistant), the operating tools and build_scene; no scene file is written in the chat
    expect(String(seen[0].messages[0].content)).toBe(copilotSystem())
    expect(String(seen[0].messages[0].content)).toContain('**答案**')
    expect(seen[0].tools!.map(t => t.function.name)).toEqual(copilotToolDefs().map(t => t.function.name))
    expect(seen[0].tools!.some(t => t.function.name === 'build_scene')).toBe(true)
    expect(seen[0].tools!.some(t => t.function.name === 'apply_scene' || t.function.name === 'import_problem')).toBe(false)
    const answer = copilot.bubbles.find(b => b.role === 'assistant')!
    expect(answer.problem).toBe(PROBLEM)
    expect(answer.offer).toEqual({ state: 'open' })
    expect(openProblem).not.toHaveBeenCalled()
    // The user chooses to build it: a JSON-only request with the problem and the explanation
    await buildFromAnswer(answer)
    expect(seen).toHaveLength(2)
    expect(String(seen[1].messages[0].content)).toBe(builderSystem() + DATA_RULE)
    expect(seen[1].tools).toBeUndefined()
    const ask = String(seen[1].messages[1].content)
    expect(ask).toContain(PROBLEM)
    expect(ask).toContain('a = 1.96 m/s²')
    expect(answer.offer).toEqual({ state: 'done' })
    expect(openProblem).toHaveBeenCalledTimes(1)
    expect(state.problem!.problem.questions).toHaveLength(2)
    const card = copilot.bubbles.at(-1)!
    expect(card.scene).toMatchObject({ ok: true, name: '桌面—滑轮连接体', bodies: 4, connectors: 1, questions: ['A 的加速度', '绳的拉力'] })
    expect(JSON.parse(card.scene!.json).format).toBe('velophi-scene')
    expect(card.assumptions).toEqual(['滑轮半径取 0.05 m'])
    expect(card.actions[0]).toMatchObject({ tool: 'build_scene', ok: true })
    // The conversation learns what was built (so a question about it can follow)
    expect(String(copilot.history.at(-1)!.content)).toContain('<sim_results>')
    session.undoAction(card.actions[0])
    expect(state.scene.bodies.some(b => b.id === 'block')).toBe(true)
  })

  it('the builder\'s broken object goes back with its errors; the corrected one loads', async () => {
    const broken = { scene: { bodies: [{ id: 'floor', kind: 'static', shape: { type: 'box', width: 4, height: 0.4 }, position: [0, -0.2] }, { id: 'a', shape: { type: 'box', width: 0.4, height: 0.4 }, position: [0, 0.2] }] }, questions: [] }
    const fixed = { scene: { bodies: [broken.scene.bodies[0], { ...broken.scene.bodies[1], mass: 1 }] }, questions: [] }
    const seen = scripted([
      () => ok(call('build_scene', { request: '在地面上放一个 1 kg 的方块' })),
      // a fenced answer with a trailing comma is still read; it lacks the mass
      () => ok({ role: 'assistant', content: '```json\n' + JSON.stringify(broken).replace(/]}$/, '],}') + '\n```' }),
      () => ok({ role: 'assistant', content: JSON.stringify(fixed) }),
      () => ok({ role: 'assistant', content: '好了。' })
    ])
    await sendToCopilot('在地面上放一个 1 kg 的方块')
    expect(seen).toHaveLength(4)
    expect(String(seen[2].messages.at(-1)!.content)).toMatch(/mass/)
    const toolMsg = JSON.parse(String(seen[3].messages.find(m => m.role === 'tool')!.content)) as { ok: boolean }
    expect(toolMsg.ok).toBe(true)
    const bot = copilot.bubbles.find(b => b.role === 'assistant')!
    expect(bot.actions.map(a => a.ok)).toEqual([true])
    expect(bot.scene?.ok).toBe(true)
    expect(bot.offer).toBeUndefined()
    expect(loadScene).toHaveBeenCalledTimes(1)
  })

  it('reads the JSON of an answer leniently', () => {
    expect(jsonOf('好的：\n```json\n{"a": [1, 2,], // c\n"b": "x,}"}\n```')).toEqual({ a: [1, 2], b: 'x,}' })
    expect(jsonOf('前言 {"scene": {"bodies": []}} 后记')).toEqual({ scene: { bodies: [] } })
    expect(jsonOf('没有 JSON')).toBeNull()
  })

  it('"对照讲解" sends the engine\'s answers along as <sim_results>; no offer under it', async () => {
    const seen = scripted([
      () => ok({ role: 'assistant', content: '**答案** a = 1.96 m/s²' }),
      () => ok({ role: 'assistant', content: built(1) }),
      () => ok({ role: 'assistant', content: '讲解与仿真一致。' })
    ])
    await sendToCopilot(PROBLEM)
    await buildFromAnswer(copilot.bubbles.find(b => b.role === 'assistant')!)
    const card = copilot.bubbles.at(-1)!
    card.scene!.answers = [{ prompt: 'A 的加速度', value: 1.96, unit: 'm/s²', text: '1.960 m/s²' }, { prompt: '绳的拉力', value: 7.84, unit: 'N', text: '7.840 N' }]
    await compareWithSim(card.problem!, card.scene!)
    const sent = String(seen[2].messages.at(-1)!.content)
    expect(sent).toContain('<sim_results>')
    expect(sent).toContain('(1) A 的加速度 = 1.960 m/s²')
    const last = copilot.bubbles.at(-1)!
    expect(last.text).toContain('一致')
    expect(last.offer).toBeUndefined()
    expect(copilot.bubbles.at(-2)!.text).toContain('对照讲解与仿真结果')
    expect(copilot.bubbles.at(-2)!.text).not.toContain('<sim_results>')
  })

  it('a refused build says why and offers to try again', async () => {
    scripted([
      () => ok({ role: 'assistant', content: '**答案** R = 5 Ω' }),
      () => ok({ role: 'assistant', content: '{"error": "这是电路题，力学引擎不能模拟"}' })
    ])
    await sendToCopilot('电阻 R1 = 2 Ω 与 R2 = 3 Ω 串联接在 10 V 电源上，求总电阻和电流是多少？')
    const answer = copilot.bubbles.find(b => b.role === 'assistant')!
    expect(answer.offer).toEqual({ state: 'open' })
    await buildFromAnswer(answer)
    expect(answer.offer?.state).toBe('failed')
    expect(copilot.bubbles.at(-1)!.role).toBe('error')
    expect(copilot.bubbles.at(-1)!.text).toContain('电路')
    expect(openProblem).not.toHaveBeenCalled()
  })
})
