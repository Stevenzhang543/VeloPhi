/**
 * 26.59 fix (D188–D191): reading that matches by structure and builds its own model. The equation solver (solved,
 * contradictory, underdetermined, nonlinear with bounds), the structure check that keeps a "topic-alike" template
 * out, the equation route end to end (the pulley pile of the maintainer's picture, which has no equilibrium), the
 * solution steps filled with the app's numbers, movable pulleys in generated scenes, and when a Copilot message is
 * a problem to read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Scene } from '../../src/core/scene/types'
import { buildTemplate } from '../../src/templates'

const state = {
  dirty: false, page: 'studio', rightTab: 'formula', bottomTab: 'chart', problem: null as unknown, scene: buildTemplate('incline') as Scene, fileName: null,
  recording: null as unknown, situations: [], run: { tComputed: 0, unbounded: true, paused: false }, computing: false, playing: false, time: 0, speed: 1, selection: null,
  showModels: false, modelId: null, modelPreset: null, settingsSection: null, showTemplates: false, showProblems: false, chart: [] as string[], stale: false
}
vi.mock('../../src/app/store', () => ({ state, loadScene: vi.fn(), edit: vi.fn(), play: vi.fn(), pause: vi.fn(), rewind: vi.fn(), seekTime: vi.fn(), showToast: vi.fn(), documentScene: () => state.scene }))
vi.mock('../../src/app/trialLog', () => ({ logEvent() {} }))
vi.mock('../../src/platform/ask', () => ({ ask: vi.fn(async () => true) }))
vi.mock('../../src/app/task/taskState', () => ({ taskUi: { task: null, state: 'draft' }, setTask: vi.fn(), currentResults: () => [], solveCurrent: vi.fn(), readText: vi.fn() }))
vi.mock('../../src/app/problemMode', () => ({ openProblem: vi.fn(async () => true), reveal: vi.fn(), openBuiltin: vi.fn(async () => true) }))

const { parse } = await import('../../src/formula/expr')
const { parseEquation, solveEquations, checkModel, svd, EQ_CONSTANTS } = await import('../../src/ai/import/equations')
const { checkRoute, checkBuild } = await import('../../src/ai/import/contract')
const { readProblem } = await import('../../src/ai/import/pipeline')
const { answersOf, solutionSteps, outcomeText } = await import('../../src/ai/import/answers')
const { compileSceneSpec } = await import('../../src/ai/import/sceneSpec')
const { looksLikeProblem } = await import('../../src/ai/copilot/session')
const { simulate } = await import('../../src/engine/recording')
const { evaluateProblemTarget } = await import('../../src/teaching/problems')
const { setTransport } = await import('../../src/platform/net')
const { settings } = await import('../../src/app/settings')
const { setKey } = await import('../../src/ai/keys')
const { resetCaps } = await import('../../src/ai/client')

const model = (knowns: Array<[string, number]>, unknowns: string[], eqs: string[], asks: string[], opts: Record<string, { guess?: number; min?: number }> = {}) => ({
  knowns: knowns.map(([name, value]) => ({ name, value, unit: '' })),
  unknowns: unknowns.map(name => ({ name, unit: 'N', ...opts[name] })),
  equations: eqs.map(t => ({ text: t, ...parseEquation(t) })),
  asks: asks.map(e => ({ prompt: e, expr: e, node: parse(e, { constants: EQ_CONSTANTS }), unit: 'N' }))
})

/**
 * The pulley pile of the maintainer's picture, traced rope by rope: five ropes (T1, T2, T4, T5 = F, T6), fifteen
 * movable pulley assemblies, the 1000 N weight on one of them. Every assembly gives a balance equation.
 */
const PILE = [
  '2*T1 = T2', '2*T1 = 2*T2', '2*T1 = 2*T2', 'T1 = 2*T5', '2*T2 = T4', '2*T2 = 2*T4', 'T2 = 2*T5', 'G = 2*T4', 'T4 = 2*T5',
  'T5 = 2*T6', '2*T5 = 2*T6', '2*T5 = T6', '2*T5 = 2*T6', '2*T5 = 2*T6', '2*T5 = T6', 'F = T5'
]

describe('equation solver', () => {
  it('solves a linear system, finds a contradiction, and says what is not determined', () => {
    const ok = model([['G', 1000]], ['T', 'F'], ['2*T = G', 'F = T'], ['F'])
    checkModel(ok)
    const r = solveEquations(ok)
    expect(r.verdict).toBe('solved')
    expect(r.answers[0].value).toBeCloseTo(500, 9)

    const pile = solveEquations(model([['G', 1000]], ['T1', 'T2', 'T4', 'T5', 'T6', 'F'], PILE, ['F']))
    expect(pile.verdict).toBe('inconsistent')
    expect(pile.conflicts.length).toBeGreaterThan(0)

    const under = solveEquations(model([['G', 1000]], ['T1', 'T2'], ['T1 + T2 = G'], ['T1', 'T1 + T2']))
    expect(under.verdict).toBe('underdetermined')
    expect(under.answers[0].value).toBeNull()
    expect(under.answers[1].value).toBeCloseTo(1000, 9)
    expect(under.undetermined).toEqual(['T1', 'T2'])
  })

  it('a nonlinear equation picks the root inside the bounds', () => {
    const m = model([['v0', 20], ['th', (37 * Math.PI) / 180], ['g', 10]], ['t'], ['0 = v0*sin(th)*t - 0.5*g*t^2'], ['t'], { t: { guess: 1, min: 0.001 } })
    const r = solveEquations(m)
    expect(r.verdict).toBe('solved')
    expect(r.answers[0].value).toBeCloseTo((2 * 20 * Math.sin((37 * Math.PI) / 180)) / 10, 9)
  })

  it('rejects names that are not defined, and the SVD finds the rank', () => {
    expect(() => checkModel(model([], ['a'], ['a = b'], ['a']))).toThrow(/neither a known nor an unknown/)
    expect(() => checkModel(model([['pi', 1]], ['a'], ['a = 1'], ['a']))).toThrow(/reserved/)
    const { s } = svd([[1, 2], [2, 4], [0, 0]], 2)
    expect(Math.min(...s)).toBeLessThan(1e-12)
    expect(Math.max(...s)).toBeCloseTo(5, 9)
  })
})

describe('structure matching', () => {
  const route = (id: string, objects: Record<string, number>) => checkRoute({ route: 'template', id, summary: 's', category: {}, process: 'static', objects })
  it('keeps a template that cannot hold the problem out, and lets a fitting one through', () => {
    const bad = route('movable-pulley', { bodies: 1, pulleys: 15, movablePulleys: 9, ropes: 5 })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.errors[0]).toMatch(/cannot hold this problem.*equations/)
    const good = route('movable-pulley', { bodies: 2, pulleys: 3, movablePulleys: 1, ropes: 1 })
    expect(good.ok).toBe(true)
    if (good.ok) { expect(good.value.process).toBe('static'); expect(good.value.objects.pulleys).toBe(3) }
    // Without counts nothing is blocked (older answers)
    expect(checkRoute({ route: 'template', id: 'atwood', summary: 's', category: {} }).ok).toBe(true)
    // The equations route has no id
    const eq = checkRoute({ route: 'equations', id: 'whatever', summary: 's', category: {} })
    expect(eq.ok && eq.value.id).toBe(null)
  })

  it('an equation build reports its parse errors for a repair', () => {
    const r = checkBuild('equations', null, { equations: { knowns: [{ name: 'G', value: 1, unit: 'furlong' }], unknowns: [{ name: 'T', unit: 'N' }], equations: [{ eq: '2*T = = G' }], asks: [{ prompt: 'T', expr: 'T' }] } })
    expect(r.ok).toBe(false)
    if (!r.ok) { expect(r.errors.join(' ')).toMatch(/unknown unit "furlong"/); expect(r.errors.join(' ')).toMatch(/equations\[0\]/) }
  })
})

type Body = Record<string, unknown> & { messages: Array<{ role: string; content: unknown }> }
const reply = (content: string) => ({ status: 200, contentType: 'application/json', retryAfter: null, body: JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { total_tokens: 80 } }) })
function scripted(replies: Array<(b: Body) => ReturnType<typeof reply>>) {
  const seen: Body[] = []
  setTransport(async req => { const b = JSON.parse(req.body ?? '{}') as Body; seen.push(b); const r = replies.shift(); if (!r) throw new Error('no reply'); return r(b) })
  return seen
}

describe('the equation route end to end', () => {
  beforeEach(() => {
    settings.ai.connection = 'openai'
    settings.ai.openai = { baseUrl: 'https://ai.test/v1', model: 'm', vision: true }
    setKey('openai', 'sk-test')
    resetCaps()
  })
  afterEach(() => setTransport(null))

  const ROUTE = { language: 'zh', summary: '房顶与地面之间的一堆滑轮吊着 1000 N 的重物，求提起重物所需的拉力', category: { chapter: 'statics', types: [], level: 'hard', stage: 'senior' }, process: 'static', objects: { bodies: 1, pulleys: 24, movablePulleys: 15, ropes: 5, springs: 0, rods: 0, inclines: 0 }, route: 'equations', id: null, givens: [{ name: '重力', symbol: 'G', value: 1000, unit: 'N' }], asks: ['拉力 F'], reason: '没有能装下这么多滑轮的模板，静力学，用方程模型' }
  const unknowns = ['T1', 'T2', 'T4', 'T5', 'T6', 'F'].map(n => ({ name: n, unit: 'N', min: 0 }))
  const build = (extra: Record<string, unknown> = {}) => JSON.stringify({ equations: { knowns: [{ name: 'G', value: 1000, unit: 'N', meaning: '重物的重力' }], unknowns, equations: PILE.map(eq => ({ eq, why: '滑轮平衡' })), asks: [{ prompt: '拉力 F', expr: 'F', unit: 'N' }] }, solution: ['逐个滑轮列平衡方程', '解出 F = {1}'], assumptions: ['滑轮与绳的质量、摩擦不计'], ...extra })

  it('a contradiction goes back to the AI once; confirmed, the reading says what it means', async () => {
    const seen = scripted([
      () => reply(JSON.stringify(ROUTE)),
      () => reply(build()),
      b => {
        const last = String(b.messages.at(-1)!.content)
        expect(last).toMatch(/方程互相矛盾/)
        expect(last).toMatch(/conclusion/)
        return reply(build({ conclusion: '理想滑轮下这堆滑轮不存在平衡：重物所在的滑轮组可以自由下落，拉力传不到重物上，无论多大的拉力都提不起来。', solution: ['逐个动滑轮列平衡方程', '方程互相矛盾：系统不能静止，重物会下落'] }))
      }
    ])
    const o = await readProblem('如图：房顶与地面之间有一堆滑轮，已知重物重力为1000牛。求：要提动重物，需要多大的拉力？')
    expect(seen).toHaveLength(3)
    expect(o.ok).toBe(true)
    if (!o.ok || o.build.kind !== 'equations') return
    expect(o.build.result.verdict).toBe('inconsistent')
    expect(o.conclusion).toMatch(/提不起来/)
    expect(o.build.equations[0].latex).toContain('=')
    const answers = answersOf(o)!
    expect(answers[0].value).toBeNull()
    expect(outcomeText(o, answers)).toMatch(/结论/)
    for (const b of seen) expect(String(b.messages[0].content)).toMatch(/读题助手/)
  })

  it('a solvable model fills the solution steps with the solver\'s numbers', async () => {
    scripted([
      () => reply(JSON.stringify({ ...ROUTE, objects: { bodies: 1, pulleys: 1, movablePulleys: 1, ropes: 1 } })),
      () => reply(JSON.stringify({ equations: { knowns: [{ name: 'G', value: 1, unit: 'kN' }], unknowns: [{ name: 'T', unit: 'N', min: 0 }, { name: 'F', unit: 'N', min: 0 }], equations: [{ eq: '2*T = G' }, { eq: 'F = T' }], asks: [{ prompt: '拉力 F', expr: 'F', unit: 'N' }] }, solution: ['动滑轮两段绳承担重物', '所以 F = {1}'] }))
    ])
    const o = await readProblem('重 1 kN 的物体挂在动滑轮下，绳一端固定，另一端竖直向上拉，求拉力 F 至少多大？')
    expect(o.ok).toBe(true)
    if (!o.ok) return
    const answers = answersOf(o)!
    expect(answers[0].value).toBeCloseTo(500, 9)
    expect(solutionSteps(o, answers)[1]).toMatch(/F = 500/)
  })
})

describe('movable pulleys in a generated scene', () => {
  it('a pulley rides on its body, and a 2 kg load balances 1 kg over it', () => {
    const scene = compileSceneSpec({
      name: '动滑轮', duration: 1,
      bodies: [
        { id: 'M', name: '重物与动滑轮', shape: 'box', width: 0.16, height: 0.16, mass: 2, position: [0, 0.8] },
        { id: 'm', name: '配重', shape: 'box', width: 0.1, height: 0.1, mass: 1, position: [0.3, 0.8] }
      ],
      pulleys: [{ id: 'Q', position: [0, 1], radius: 0.1, on: 'M' }, { id: 'P', position: [0.2, 2], radius: 0.1 }],
      connectors: [{ type: 'rope', a: null, anchorA: [-0.1, 2.2], b: 'm', via: ['Q', 'P'] }]
    } as never)
    const q = scene.pulleys.find(p => p.id === 'Q')!
    expect(q.body).toBe('M')
    expect(q.position.y).toBeCloseTo(0.2, 9)
    const rec = simulate(scene, { duration: 1 })
    const y = (t: number) => evaluateProblemTarget(rec, [], { kind: 'quantity', id: 'M.y', t }).sim ?? NaN
    expect(Math.abs(y(1) - y(0))).toBeLessThan(0.01)
  })
})

describe('when a Copilot message is a problem', () => {
  it('reads whole problems and keeps questions about the app as chat', () => {
    expect(looksLikeProblem('质量为 2 kg 的物块从倾角 30° 的斜面顶端由静止滑下，μ = 0.2，求 1 s 末的速度。')).toBe(true)
    expect(looksLikeProblem('如图：房顶与地面之间有一堆滑轮，已知重物重力为1000牛。求：要提动重物，需要多大的拉力？')).toBe(true)
    expect(looksLikeProblem('A 2 kg block slides down a 30° incline from rest. Find its speed after 1 s.')).toBe(true)
    expect(looksLikeProblem('为什么加速度比没有摩擦时小？')).toBe(false)
    expect(looksLikeProblem('显示物块受到的支持力和摩擦力')).toBe(false)
    expect(looksLikeProblem('帮我把这个场景里物块的质量改成 3 kg，再算一下 2 s 时的速度是多少')).toBe(false)
  })
})
