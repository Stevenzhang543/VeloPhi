/**
 * 26.59 fix 3 (D196): reading that does not give up — a reading whose template cannot hold the problem becomes a
 * from-scratch build, a template the AI cannot fill in after its repairs falls back to a generated scene, a busy
 * service is asked once more, and more kinds of questions count as problems in Copilot.
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

const { readProblem } = await import('../../src/ai/import/pipeline')
const { looksLikeProblem } = await import('../../src/ai/copilot/session')
const { setTransport } = await import('../../src/platform/net')
const { settings } = await import('../../src/app/settings')
const { setKey } = await import('../../src/ai/keys')
const { resetCaps } = await import('../../src/ai/client')

type Body = Record<string, unknown> & { messages: Array<{ role: string; content: unknown }>; purpose?: string }
const reply = (content: string) => ({ status: 200, contentType: 'application/json', retryAfter: null, body: JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { total_tokens: 80 } }) })
const busy = () => ({ status: 503, contentType: 'application/json', retryAfter: null, body: JSON.stringify({ error: { message: 'overloaded' } }) })
function scripted(replies: Array<(b: Body) => ReturnType<typeof reply>>) {
  const seen: Body[] = []
  setTransport(async req => { const b = JSON.parse(req.body ?? '{}') as Body; seen.push(b); const r = replies.shift(); if (!r) throw new Error('no reply'); return r(b) })
  return seen
}

const PROBLEM = '半径 R = 0.8 m 的光滑四分之一圆弧轨道固定在竖直面内，底端与光滑水平面相切。质量 0.2 kg 的小球从轨道顶端由静止滑下，求小球到达底端时的速度。'
const ROUTE = { language: 'zh', summary: '小球沿光滑四分之一圆弧轨道下滑，求到达底端的速度', category: { chapter: 'energy', types: [], level: 'basic', stage: 'senior' }, process: 'motion', objects: { bodies: 1, arcs: 1 }, givens: [{ name: '半径', symbol: 'R', value: 0.8, unit: 'm' }], asks: ['到达底端的速度'], reason: '' }
const SCENE = JSON.stringify({
  scene: {
    name: '圆弧轨道', gravity: 9.8,
    surfaces: [{ type: 'ground', id: 'floor', top: 0, left: -2, right: 5 }, { type: 'arc', id: 'track', center: [0, 0.8], radius: 0.8, startDeg: 180, sweepDeg: 90, side: 'inside' }],
    bodies: [{ id: 'ball', shape: 'ball', radius: 0.02, mass: 0.2, particle: true, on: { surface: 'track', angleDeg: 180 } }],
    duration: 1.5
  },
  questions: [{ prompt: '到达底端时的速度', target: { kind: 'quantity', id: 'ball.v', t: 1.4 }, unit: 'm/s' }],
  solution: ['机械能守恒 mgR = ½mv²', 'v = √(2gR) = {1}']
})

describe('reading that does not give up (26.59 fix 3)', () => {
  beforeEach(() => {
    settings.ai.connection = 'openai'
    settings.ai.openai = { baseUrl: 'https://ai.test/v1', model: 'm', vision: true }
    setKey('openai', 'sk-test')
    resetCaps()
  })
  afterEach(() => setTransport(null))

  it('a template that cannot hold the problem becomes a generated scene', async () => {
    // "incline" has no arc track: the reading is refused three times, then built from scratch with what was read
    const wrong = () => reply(JSON.stringify({ ...ROUTE, route: 'template', id: 'incline' }))
    const seen = scripted([wrong, wrong, wrong, () => reply(SCENE)])
    const o = await readProblem(PROBLEM)
    expect(o.ok).toBe(true)
    if (!o.ok) return
    expect(o.first.route).toBe('scene')
    expect(o.build.kind).toBe('scene')
    expect(String(seen.at(-1)!.messages[0].content)).toMatch(/没有合适的模板/)
  })

  it('a template the AI cannot fill in falls back to a generated scene', async () => {
    const bad = () => reply(JSON.stringify({ template: { id: 'arc-slide', params: { R: { value: 'abc', unit: 'm' } } }, questions: [] }))
    const seen = scripted([() => reply(JSON.stringify({ ...ROUTE, route: 'template', id: 'arc-slide' })), bad, bad, bad, () => reply(SCENE)])
    const o = await readProblem(PROBLEM)
    expect(o.ok).toBe(true)
    if (!o.ok) return
    expect(o.first.route).toBe('scene')
    expect(seen.at(-1)!.purpose ?? '').toBe('')
  })

  it('a busy service is asked once more', async () => {
    const seen = scripted([busy, () => reply(JSON.stringify({ ...ROUTE, route: 'scene', id: null })), () => reply(SCENE)])
    const o = await readProblem(PROBLEM)
    expect(o.ok).toBe(true)
    expect(seen).toHaveLength(3)
  }, 15000)

  it('fill-in, choice and "则…为" questions count as problems', () => {
    expect(looksLikeProblem('质量为 m 的小球从高 h 处由静止下落，落地时与地面作用时间为 t，则地面对小球的平均作用力为____。')).toBe(true)
    expect(looksLikeProblem('如图所示，小球在竖直圆轨道内侧运动，下列说法正确的是（  ）A. 最高点速度可以为零 B. …')).toBe(true)
    expect(looksLikeProblem('两颗卫星绕地球做匀速圆周运动，轨道半径之比为 1:4，则它们的周期之比为多少')).toBe(true)
    expect(looksLikeProblem('为什么加速度比没有摩擦时小？')).toBe(false)
  })
})
