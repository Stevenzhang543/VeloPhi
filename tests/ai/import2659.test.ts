/**
 * 26.59 AI problem reading (D162–D166): the checks of the AI's answers, the scene compiler, the whole pipeline
 * driven by a scripted AI, and the rule that every number of an answer comes from the engine.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { checkBuild, checkRoute } from '../../src/ai/import/contract'
import { compileSceneSpec, SpecError } from '../../src/ai/import/sceneSpec'
import { normalizeUnit, qtyToSI, toParamUnit } from '../../src/ai/import/units'
import { readProblem, problemOf, taskOf, modelOutputs } from '../../src/ai/import/pipeline'
import type { ImportSuccess } from '../../src/ai/import/pipeline'
import { routeCatalog, templateDetail } from '../../src/ai/import/catalog'
import { setTransport } from '../../src/platform/net'
import type { NetRequest, NetResponse } from '../../src/platform/net'
import { settings } from '../../src/app/settings'
import { setKey } from '../../src/ai/keys'
import { resetCaps } from '../../src/ai/client'
import { simulate } from '../../src/engine/recording'
import { recognize } from '../../src/formula/recognize'
import { evaluateProblemTarget } from '../../src/teaching/problems'
import { solveTask } from '../../src/task/plan'

/** A scripted OpenAI-compatible provider: answers in order, records the requests. */
function scripted(answers: Array<unknown | ((req: Record<string, unknown>) => NetResponse)>) {
  const seen: Array<Record<string, unknown>> = []
  setTransport(async (req: NetRequest) => {
    const body = JSON.parse(req.body ?? '{}') as Record<string, unknown>
    seen.push(body)
    const a = answers.shift()
    if (typeof a === 'function') return (a as (r: Record<string, unknown>) => NetResponse)(body)
    const content = typeof a === 'string' ? a : JSON.stringify(a)
    return { status: 200, contentType: 'application/json', retryAfter: null, body: JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { total_tokens: 100 } }) }
  })
  return seen
}

beforeEach(() => {
  settings.ai.connection = 'openai'
  settings.ai.openai = { baseUrl: 'https://ai.test/v1', model: 'test-model', vision: false }
  setKey('openai', 'sk-test')
  resetCaps()
})
afterEach(() => setTransport(null))

const INCLINE_TEXT = '一个质量是2千克的木块，放在倾角三十度的斜面顶端，从静止开始下滑，木块和斜面之间摩擦因数为0.2，求木块下滑的加速度和1秒末的速度。g取10'

describe('units the AI reads', () => {
  it('normalises Chinese and English spellings and converts to template units', () => {
    expect(normalizeUnit('千克')).toBe('kg')
    expect(normalizeUnit('度')).toBe('°')
    expect(normalizeUnit('m/s^2')).toBe('m/s²')
    expect(qtyToSI({ value: 72, unit: 'km/h' })).toBeCloseTo(20, 12)
    expect(qtyToSI({ value: 30, unit: '度' })).toBeCloseTo(Math.PI / 6, 12)
    expect(toParamUnit({ value: 0.5236, unit: 'rad' }, '°')).toEqual({ value: expect.closeTo(30, 2) })
    expect(toParamUnit({ value: 2000, unit: 'g' }, 'kg')).toEqual({ value: 2 })
    expect('error' in toParamUnit({ value: 2, unit: 'm' }, 'kg')).toBe(true)
  })
})

describe('checks of the AI answers', () => {
  it('routes must name existing ids; categories are filtered', () => {
    expect(checkRoute({ route: 'template', id: 'nope' }).ok).toBe(false)
    const r = checkRoute({ route: 'template', id: 'incline', language: 'zh', summary: 's', category: { chapter: 'newton', types: ['斜面', '不存在'], level: 'basic', stage: 'senior' }, givens: [{ name: '质量', value: 2, unit: '千克' }] })
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.value.category.types).toEqual(['斜面']); expect(r.value.givens[0].value).toBe(2) }
    expect(checkRoute({ route: 'task', id: 'incline' }).ok).toBe(true)
    expect(checkRoute({ route: 'model', id: 'M24' }).ok).toBe(true)
    expect(checkRoute({ route: 'scene', id: 'whatever' }).ok).toBe(true)
  })

  it('template builds: parameter keys, units, quantity ids and events are checked', () => {
    const good = checkBuild('template', 'incline', {
      template: { id: 'incline', params: { theta: { value: 30, unit: '度' }, m: { value: 2, unit: 'kg' }, mu: { value: 0.2, unit: '' }, g: { value: 10, unit: 'm/s2' } } },
      questions: [{ prompt: '加速度', target: { kind: 'quantity', id: 'block.a', t: 0.5 } }, { prompt: '1 s 末速度', target: { kind: 'quantity', id: 'block.v', t: 1 } }]
    })
    expect(good.ok).toBe(true)
    if (good.ok && good.value.kind === 'template') { expect(good.value.values).toEqual({ theta: 30, m: 2, mu: 0.2, g: 10 }); expect(good.value.duration).toBeGreaterThanOrEqual(1.5) }
    const bad = checkBuild('template', 'incline', {
      template: { id: 'incline', params: { angle: { value: 30, unit: '°' }, m: { value: 2, unit: 'm' } } },
      questions: [{ prompt: 'x', target: { kind: 'quantity', id: 'box.v', t: 1 } }, { prompt: 'y', target: { kind: 'event', event: 'explode' } }]
    })
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.errors.join('\n')).toMatch(/angle is not a parameter/)
      expect(bad.errors.join('\n')).toMatch(/does not measure kg/)
    }
    const badQ = checkBuild('template', 'incline', { template: { id: 'incline', params: {} }, questions: [{ prompt: 'x', target: { kind: 'quantity', id: 'box.v', t: 1 } }, { prompt: 'y', target: { kind: 'event', event: 'explode' } }] })
    expect(badQ.ok).toBe(false)
    if (!badQ.ok) { expect(badQ.errors.join('\n')).toMatch(/box\.v.*not a readable quantity/); expect(badQ.errors.join('\n')).toMatch(/explode/) }
  })

  it('task builds use the domain vocabulary and need conditions', () => {
    const r = checkBuild('task', 'incline', { task: { domain: 'incline', givens: [{ ref: 'incline.theta', value: 30, unit: '度' }, { ref: 'contact.muK', value: 0.2, unit: '' }, { ref: 'contact.muS', value: 0.2, unit: '' }, { ref: 'gravity.g', value: 10, unit: 'm/s²' }, { ref: 'blockA.v0', value: 0, unit: 'm/s' }], targets: [{ key: 'timeAtS', condition: { value: 4, unit: '米' } }], assumptions: ['muEqual'] } })
    expect(r.ok).toBe(true)
    const missing = checkBuild('task', 'incline', { task: { domain: 'incline', givens: [], targets: [{ key: 'timeAtS' }] } })
    expect(missing.ok).toBe(false)
  })
})

describe('generated scenes', () => {
  it('compiles a table–pulley scene with the rope wrapping clockwise', () => {
    const s = compileSceneSpec({
      gravity: 10,
      surfaces: [{ type: 'ground', id: 'table', top: 1, left: -2, right: 1, mu: 0.2 }],
      bodies: [{ id: 'A', shape: 'box', width: 0.3, height: 0.2, mass: 2, on: { surface: 'table', x: -1 } }, { id: 'B', shape: 'box', width: 0.2, height: 0.2, mass: 1, position: [1.2, 0.5] }],
      pulleys: [{ id: 'P', position: [1.1, 1.1], radius: 0.1 }],
      connectors: [{ type: 'rope', a: 'A', b: 'B', via: ['P'] }],
      duration: 1
    })
    const rope = s.connectors.find(c => c.type === 'rope') as { pulleys: Array<{ wrap: string }> }
    expect(rope.pulleys[0].wrap).toBe('cw')
    const rec = simulate(s)
    expect(rec.completed).toBe(true)
  })

  it('reports every problem with a path', () => {
    try {
      compileSceneSpec({ surfaces: [{ type: 'incline', id: 's', angleDeg: 95, base: 4 }], bodies: [{ id: 'A', shape: 'box', mass: -1, position: [0, 0] }, { id: 'A', shape: 'ball', mass: 1, on: { surface: 'nope' } }] })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(SpecError)
      const all = (e as SpecError).problems.join('\n')
      expect(all).toMatch(/angleDeg/)
      expect(all).toMatch(/bodies\[0\]\.mass/)
      expect(all).toMatch(/used twice/)
    }
  })
})

describe('the pipeline with a scripted AI', () => {
  it('reads a re-worded incline problem; the answers come from the simulation', async () => {
    const seen = scripted([
      { language: 'zh', summary: '木块沿粗糙斜面由静止下滑', category: { chapter: 'newton', types: ['斜面'], level: 'basic', stage: 'senior' }, route: 'template', id: 'incline', givens: [{ name: '倾角', value: 30, unit: '度', raw: '三十度' }], asks: ['加速度', '1 s 末速度'] },
      { template: { id: 'incline', params: { theta: { value: 30, unit: '度' }, m: { value: 2, unit: '千克' }, mu: { value: 0.2, unit: '' }, g: { value: 10, unit: 'm/s²' } } }, questions: [{ prompt: '加速度', target: { kind: 'quantity', id: 'block.a', t: 0.5 } }, { prompt: '1 秒末的速度', target: { kind: 'quantity', id: 'block.v', t: 1 } }], duration: 1.2, assumptions: ['最大静摩擦力等于滑动摩擦力'] }
    ])
    const o = await readProblem(INCLINE_TEXT)
    expect(o.ok).toBe(true)
    expect(seen).toHaveLength(2)
    expect(seen[0].response_format).toEqual({ type: 'json_object' })
    expect(JSON.stringify(seen[0].messages)).toContain('incline｜')
    expect(JSON.stringify(seen[1].messages)).toContain('block.v')
    const p = problemOf(o as ImportSuccess)!
    expect(p.stem).toBe(INCLINE_TEXT)
    const rec = simulate(p.scene)
    const sits = recognize(rec)
    const a = evaluateProblemTarget(rec, sits, p.questions[0].type === 'numeric' ? p.questions[0].target : (null as never)).sim!
    const v = evaluateProblemTarget(rec, sits, p.questions[1].type === 'numeric' ? p.questions[1].target : (null as never)).sim!
    const expected = 10 * (Math.sin(Math.PI / 6) - 0.2 * Math.cos(Math.PI / 6))
    expect(a).toBeCloseTo(expected, 6)
    expect(v).toBeCloseTo(expected * 1, 6)
  })

  it('repairs a wrong answer once and gives up after two failed repairs', async () => {
    scripted([
      { route: 'template', id: 'incline', summary: 's', category: {} },
      { template: { id: 'incline', params: { angle: { value: 30, unit: '°' } } }, questions: [{ prompt: 'a', target: { kind: 'quantity', id: 'block.a', t: 0.5 } }] },
      { template: { id: 'incline', params: { theta: { value: 30, unit: '°' } } }, questions: [{ prompt: 'a', target: { kind: 'quantity', id: 'block.a', t: 0.5 } }] }
    ])
    const o = await readProblem('斜面题')
    expect(o.ok).toBe(true)
    expect(o.ok && o.calls).toBe(3)
    scripted([{ route: 'template', id: 'incline', summary: 's' }, { template: { params: { x: 1 } } }, { template: { params: { y: 1 } } }, { template: { params: { z: 1 } } }])
    const f = await readProblem('斜面题')
    expect(f.ok).toBe(false)
    if (!f.ok) { expect(f.code).toBe('invalid'); expect(f.calls).toBe(4) }
  })

  it('task route: the task solver answers and checks', async () => {
    scripted([
      { route: 'task', id: 'incline', summary: '斜面下滑 4 m 所用时间', category: { chapter: 'newton' } },
      { task: { domain: 'incline', givens: [{ ref: 'incline.theta', value: 30, unit: '°' }, { ref: 'contact.muK', value: 0.2, unit: '1' }, { ref: 'contact.muS', value: 0.2, unit: '1' }, { ref: 'gravity.g', value: 10, unit: 'm/s²' }, { ref: 'blockA.v0', value: 0, unit: 'm/s' }], targets: [{ key: 'timeAtS', condition: { value: 4, unit: 'm' } }], assumptions: ['muEqual'] } }
    ])
    const o = await readProblem('木块从倾角 30° 的斜面顶端静止下滑，μ=0.2，斜面长 4 m，求滑到底端所用时间，g=10')
    expect(o.ok).toBe(true)
    const t = taskOf(o as ImportSuccess)!
    const out = solveTask(t)
    const r = out.results.find(x => x.targetId === 'timeAtS')!
    const a = 10 * (Math.sin(Math.PI / 6) - 0.2 * Math.cos(Math.PI / 6))
    expect(r.value!.scalarSI!).toBeCloseTo(Math.sqrt(2 * 4 / a), 8)
    expect(r.checks.length).toBeGreaterThan(0)
  })

  it('model route: the analytic model computes the outputs', async () => {
    scripted([
      { route: 'model', id: 'E09', summary: '串并联电路', category: { chapter: '' } },
      { model: { id: 'E09', inputs: { R1: { value: 4, unit: 'Ω' }, R2: { value: 6, unit: 'Ω' }, U: { value: 12, unit: 'V' } }, outputs: ['Rs', 'Is'] } }
    ])
    const o = await readProblem('4 Ω 与 6 Ω 的电阻串联接在 12 V 电源上，求总电阻与电流。')
    expect(o.ok).toBe(true)
    const outs = modelOutputs((o as ImportSuccess).build)
    expect(outs.find(x => x.id === 'Rs')!.value).toBeCloseTo(10, 12)
    expect(outs.find(x => x.id === 'Is')!.value).toBeCloseTo(1.2, 12)
  })

  it('scene route: a generated two-body scene whose questions use its own ids', async () => {
    scripted([
      { route: 'scene', id: null, summary: '两个物块用弹簧相连', category: { chapter: 'momentum' } },
      { scene: { gravity: 10, surfaces: [{ type: 'ground', id: 'ground', top: 0, left: -3, right: 6, mu: 0 }], bodies: [{ id: 'A', shape: 'box', mass: 1, on: { surface: 'ground', x: 0 }, velocity: [2, 0] }, { id: 'B', shape: 'box', mass: 1, on: { surface: 'ground', x: 1 } }], connectors: [{ type: 'spring', a: 'A', b: 'B', k: 100 }], duration: 2 }, questions: [{ prompt: 'B 的最大速度', target: { kind: 'extreme', id: 'B.v', which: 'max' } }] }
    ])
    const o = await readProblem('光滑地面上两个 1 kg 物块用 k=100 N/m 的弹簧相连，A 以 2 m/s 冲向 B，求 B 的最大速度。')
    expect(o.ok).toBe(true)
    const p = problemOf(o as ImportSuccess)!
    const rec = simulate(p.scene)
    const q = p.questions[0]
    const v = evaluateProblemTarget(rec, recognize(rec), q.type === 'numeric' ? q.target : (null as never)).sim!
    expect(v).toBeCloseTo(2, 2)
  })

  it('unsupported problems say why; transport failures are AI errors', async () => {
    scripted([{ route: 'unsupported', id: null, summary: '证明题', reason: '这是证明题，没有数值可以仿真' }])
    const u = await readProblem('证明动能定理')
    expect(u.ok).toBe(false)
    if (!u.ok) { expect(u.code).toBe('unsupported'); expect(u.error).toMatch(/证明题/) }
    setTransport(async () => ({ status: 401, contentType: 'application/json', retryAfter: null, body: '{"error":{"message":"bad key"}}' }))
    const e = await readProblem('x')
    expect(e.ok).toBe(false)
    if (!e.ok) expect(e.code).toBe('unauthorized')
  })
})

describe('catalogue', () => {
  it('lists every template and readable quantities of a template', () => {
    const c = routeCatalog()
    expect(c).toContain('table-pulley｜')
    expect(c).toContain('M24｜')
    const d = templateDetail('table-pulley')
    expect(d).toMatch(/m1｜/)
    expect(d).toMatch(/\.v｜/)
  })
})
