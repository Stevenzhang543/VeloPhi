/**
 * 26.59 fix 3 (D198): the two Copilots. The simulation Copilot's scene files — the prompt's examples load and give
 * the textbook answers, the forgiving normalization (vectors as arrays, degrees, shorthands, rope wraps, centres of
 * mass, "rest"), the errors sent back for repair (deep overlaps, unknown quantity ids, missing masses) — and the
 * conversations: apply_scene through a tool call or a JSON code block, a repair round, the solving Copilot without
 * tools, and the hand-overs between them with the engine's answers.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
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
const { SIM_EXAMPLES, simSystem } = await import('../../src/ai/copilot/simPrompt')
const { simHooks, simToolDefs } = await import('../../src/ai/copilot/simTools')
const session = await import('../../src/ai/copilot/session')
const { copilot, sendToCopilot, setCopilotMode, buildInSim, explainInSolve, resetCopilots, parkedConversation } = session
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
    const [incline, pulley, arc] = prepared.map(p => (p.ok ? p.scene : null)!)
    // 1: a = g(sin30° − μ cos30°) = 3.268 m/s², v(1 s) = 3.268 m/s
    const [v1] = valuesAt(incline, ['block.v'], 1)
    expect(v1).toBeCloseTo(10 * (0.5 - 0.2 * Math.cos(Math.PI / 6)), 3)
    expect(incline.bodies[1].angle).toBeCloseTo(-Math.PI / 6, 6)
    // 2: a = (m_B − μ m_A) g / (m_A + m_B) = 1.96 m/s², T = m_B (g − a) = 7.84 N
    const [a, T] = valuesAt(pulley, ['A.a', 'rope.T'], 0.2)
    expect(a).toBeCloseTo(1.96, 3)
    expect(T).toBeCloseTo(7.84, 3)
    // 3: from 182° on a circle of radius R − r = 0.77 m down to the bottom: v² = 2g·Δh, N = mg + mv²/(R − r)
    const dh = 0.7731 - 0.03
    expect(extreme(arc, 'ball.v', 'max', 1.2)).toBeCloseTo(Math.sqrt(2 * 9.8 * dh), 2)
    expect(extreme(arc, 'contact.ball|track.N', 'max', 1.2)).toBeCloseTo(0.98 + (0.1 * 2 * 9.8 * dh) / 0.77, 1)
    // The prompt carries the examples, the targets and the format
    const sys = simSystem()
    for (const e of SIM_EXAMPLES) expect(sys).toContain(JSON.stringify(e.file))
    expect(sys).toContain('"format": "velophi-scene"')
    expect(sys).toContain('apply_scene')
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
  setCopilotMode('sim')
  resetCopilots()
  simHooks.waitMs = 0
  state.scene = buildTemplate('incline')
  state.problem = null
  loadScene.mockClear()
  openProblem.mockClear()
})
afterEach(() => setTransport(null))

describe('the simulation Copilot', () => {
  it('builds a problem with apply_scene: checked, opened as a problem, shown as a card, undoable', async () => {
    const { questions, ...file } = SIM_EXAMPLES[1].file as { questions: unknown }
    const seen = scripted([
      () => ok(call('apply_scene', { scene: file, questions, title: '桌面连接体', stem: PROBLEM })),
      () => ok({ role: 'assistant', content: '已搭好：A 在桌面上，B 竖直悬挂。' })
    ])
    await sendToCopilot(PROBLEM)
    expect(seen).toHaveLength(2)
    expect(String(seen[0].messages[0].content)).toContain('velophi-scene')
    expect(seen[0].tools!.map(t => t.function.name)).toEqual(simToolDefs().map(t => t.function.name))
    expect(seen[0].tools!.some(t => t.function.name === 'import_problem')).toBe(false)
    expect(openProblem).toHaveBeenCalledTimes(1)
    expect(state.problem!.problem.stem).toBe(PROBLEM)
    expect(state.problem!.problem.questions).toHaveLength(2)
    const toolMsg = seen[1].messages.find(m => m.role === 'tool')!
    expect(JSON.parse(String(toolMsg.content))).toMatchObject({ ok: true, loaded: '桌面连接体' })
    const bot = copilot.bubbles.find(b => b.role === 'assistant')!
    expect(bot.scene).toMatchObject({ ok: true, name: '桌面连接体', bodies: 4, connectors: 1, questions: ['A 的加速度', '绳的拉力'] })
    expect(JSON.parse(bot.scene!.json).format).toBe('velophi-scene')
    expect(bot.problem).toBe(PROBLEM)
    expect(bot.actions[0]).toMatchObject({ tool: 'apply_scene', ok: true })
    session.undoAction(bot.actions[0])
    expect(state.scene.bodies.some(b => b.id === 'block')).toBe(true)
  })

  it('a failed file goes back with its errors and the repaired one loads', async () => {
    const broken = { bodies: [{ id: 'floor', kind: 'static', shape: { type: 'box', width: 4, height: 0.4 }, position: [0, -0.2] }, { id: 'a', shape: { type: 'box', width: 0.4, height: 0.4 }, position: [0, 0.2] }] }
    const fixed = { bodies: [broken.bodies[0], { ...broken.bodies[1], mass: 1 }] }
    const seen = scripted([
      () => ok(call('apply_scene', { scene: broken })),
      () => ok(call('apply_scene', { scene: fixed }, 'c2')),
      () => ok({ role: 'assistant', content: '好了。' })
    ])
    await sendToCopilot('在地面上放一个 1 kg 的方块')
    const first = JSON.parse(String(seen[1].messages.find(m => m.role === 'tool')!.content)) as { ok: boolean; errors: string[] }
    expect(first.ok).toBe(false)
    expect(first.errors[0]).toMatch(/mass/)
    const bot = copilot.bubbles.find(b => b.role === 'assistant')!
    expect(bot.actions.map(a => a.ok)).toEqual([false, true])
    expect(bot.actions[0].undo).toBeUndefined()
    expect(bot.scene?.ok).toBe(true)
    expect(loadScene).toHaveBeenCalledTimes(1)
  })

  it('a scene file written as a JSON code block is loaded without another round', async () => {
    const seen = scripted([
      () => ok({ role: 'assistant', content: `按题意搭建：\n\n\`\`\`json\n${JSON.stringify({ scene: SIM_EXAMPLES[0].file, title: '斜面' })}\n\`\`\`\n\n载入后引擎会计算答案。` })
    ])
    await sendToCopilot('质量 2 kg 的物块从倾角 30° 的斜面上由静止下滑，μ = 0.2，求 1 s 末的速度。')
    expect(seen).toHaveLength(1)
    const bot = copilot.bubbles.find(b => b.role === 'assistant')!
    expect(bot.scene?.name).toBe('斜面')
    expect(bot.text).toContain('按题意搭建')
    expect(bot.text).not.toContain('velophi-scene')
    expect(state.problem!.problem.questions).toHaveLength(2)
  })
})

describe('the solving Copilot and the hand-overs', () => {
  it('explains without tools; its conversation is kept apart; "在仿真中搭建" hands the problem over', async () => {
    setCopilotMode('solve')
    const seen = scripted([
      () => ok({ role: 'assistant', content: '**题意与已知** …\n\n**答案**：a = 1.96 m/s²，T = 7.84 N' }),
      () => ok(call('apply_scene', { scene: SIM_EXAMPLES[1].file })),
      () => ok({ role: 'assistant', content: '已搭建。' })
    ])
    await sendToCopilot(PROBLEM)
    expect(seen[0].tools).toBeUndefined()
    expect(String(seen[0].messages[0].content)).toContain('解题')
    const solved = copilot.bubbles.find(b => b.role === 'assistant')!
    expect(solved.problem).toBe(PROBLEM)
    await buildInSim(solved.problem!)
    expect(copilot.mode).toBe('sim')
    expect(settings.ai.copilotTab).toBe('sim')
    expect(String(seen[1].messages.at(-1)!.content)).toContain(PROBLEM)
    expect(copilot.bubbles[0].text).toContain('在仿真中搭建这道题')
    expect(copilot.bubbles.find(b => b.role === 'assistant')!.scene?.ok).toBe(true)
    // The solving conversation waits, parked, with its answer
    expect(parkedConversation('solve').bubbles).toHaveLength(2)
    setCopilotMode('solve')
    expect(copilot.bubbles[1].text).toContain('1.96')
  })

  it('"讲解这道题" sends the engine\'s answers along as <sim_results>', async () => {
    const seen = scripted([
      () => ok(call('apply_scene', { scene: SIM_EXAMPLES[1].file })),
      () => ok({ role: 'assistant', content: '已搭建。' }),
      () => ok({ role: 'assistant', content: '解题思路……与仿真一致。' })
    ])
    await sendToCopilot(PROBLEM)
    const bot = copilot.bubbles.find(b => b.role === 'assistant')!
    bot.scene!.answers = [{ prompt: 'A 的加速度', value: 1.96, unit: 'm/s²', text: '1.960 m/s²' }, { prompt: '绳的拉力', value: 7.84, unit: 'N', text: '7.840 N' }]
    await explainInSolve(bot.problem!, bot.scene)
    expect(copilot.mode).toBe('solve')
    const sent = String(seen[2].messages.at(-1)!.content)
    expect(sent).toContain('<sim_results>')
    expect(sent).toContain('(1) A 的加速度 = 1.960 m/s²')
    expect(seen[2].tools).toBeUndefined()
    expect(copilot.bubbles[0].text).toContain('附仿真结果')
    expect(copilot.bubbles[0].text).not.toContain('<sim_results>')
  })
})
