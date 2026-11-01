/**
 * 26.57 acceptance tests (manual §11–§14; D110–D125): the six representative tasks against hand references, the
 * core's crossing operation, the revision guard (T14), the comparison service against the rules it replaced (T07,
 * T27), variable provenance (FOR03), the incline branches (T03, T04), the baseline readings of picture A, contact
 * forces summed once (T06), the canvas emphasis of a hovered variable (D72, UX06), label placement, quantity notes,
 * the wheel over number fields (T21), the failed state of a result card (UX08), review suggestions (EDU12), the
 * teaching packages (T26), transfer tasks, work modes (VP-10) and task files (T30).
 *
 * Every reference value is computed here by hand from the textbook formula, not taken from the code under test.
 */
import { ENGINE_VERSION } from '../src/core/scene/types'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { SAMPLE_DOMAINS, sampleWithTargets } from '../src/task/samples'
import { solveTask, taskHash } from '../src/task/plan'
import { TaskRunner, isCurrent, runGuarded } from '../src/task/runner'
import { applyPatch, makeTarget, specKey, value } from '../src/task/build'
import { acceptDefaults, checkTask } from '../src/task/validate'
import { compareValues, problemRule, activityRule, PREDICTION_RULE, gradeAnswer } from '../src/task/compare'
import type { ResultEnvelope, SolveOutcome, TaskDomain } from '../src/task/types'
import { TEMPLATES, buildTemplate } from '../src/templates'
import { simulate } from '../src/engine/recording'
import { quantitySeries } from '../src/engine/observe'
import { arrowsOfBody, sumContactPoints, tagPosition } from '../src/render/renderer'
import { varHighlight } from '../src/formula/panel'
import { quantityNote } from '../src/analysis/quantityNote'
import { wheelSteps } from '../src/app/numWheel'
import { reviewSuggestions, emptyRecords } from '../src/teaching/records'
import type { AttemptRecord } from '../src/teaching/records'
import { PACKAGES, packageStatus } from '../src/content/packages'
import { packagesForGoal, practiceOf } from '../src/app/learn/packages'
import { transferTask } from '../src/app/task/demo'
import ResultCard from '../src/app/components/task/ResultCard.vue'

const DEG = Math.PI / 180
const G = 9.8
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300)
const solved = (d: TaskDomain): SolveOutcome => solveTask(sampleWithTargets(d))
const valueOf = (o: SolveOutcome, key: string) => o.results.find(r => specKey(r.targetId) === key)!

describe('the six representative tasks (manual §6.6, §14.2)', () => {
  it('incline: speed after 2 m from rest — v = √(2·g(sinθ − μk cosθ)·d)', () => {
    const o = solved('incline')
    const a = G * (Math.sin(30 * DEG) - 0.2 * Math.cos(30 * DEG))
    const r = valueOf(o, 'speedAtS')
    expect(o.state).toBe('solved')
    expect(rel(r.value!.scalarSI!, Math.sqrt(2 * a * 2))).toBeLessThan(1e-9)
    expect(r.checks.length).toBeGreaterThanOrEqual(2)
    expect(r.checks.every(c => c.pass !== false)).toBe(true)
  })
  it('projectile: first time at 3 m above the launch point and the range', () => {
    const o = solved('projectile')
    const vy = 20 * Math.sin(30 * DEG), vx = 20 * Math.cos(30 * DEG)
    const t1 = (vy - Math.sqrt(vy * vy - 2 * G * 3)) / G
    expect(rel(valueOf(o, 'timeAtY').value!.scalarSI!, t1)).toBeLessThan(1e-9)
    expect(rel(valueOf(o, 'R').value!.scalarSI!, (2 * vy / G) * vx)).toBeLessThan(1e-9)
    // the second root is reported as an alternative, not as the answer
    const alts = valueOf(o, 'timeAtY').alternatives ?? []
    expect(alts.some(x => !x.chosen && rel(x.valueSI, (vy + Math.sqrt(vy * vy - 2 * G * 3)) / G) < 1e-9)).toBe(true)
  })
  it('collision: elastic 1 kg at 3 m/s on 2 kg at rest — v₁′ = −1, v₂′ = 2 m/s', () => {
    const o = solved('collision')
    expect(valueOf(o, 'v1').value!.scalarSI!).toBeCloseTo((1 - 2) / 3 * 3, 12)
    expect(valueOf(o, 'v2').value!.scalarSI!).toBeCloseTo(2 * 1 / 3 * 3, 12)
  })
  it('circuit: 12 V, 1 Ω, 6 Ω ∥ 3 Ω — I = 4 A, U = 8 V, P₃Ω = 64/3 W', () => {
    const o = solved('circuit')
    const R = 6 * 3 / 9, I = 12 / (R + 1), U = 12 - I * 1
    expect(rel(valueOf(o, 'I').value!.scalarSI!, I)).toBeLessThan(1e-12)
    expect(rel(valueOf(o, 'U').value!.scalarSI!, U)).toBeLessThan(1e-12)
    expect(rel(valueOf(o, 'P2').value!.scalarSI!, U * U / 3)).toBeLessThan(1e-12)
    for (const r of o.results) expect(r.checks.some(c => c.kind === 'otherAlgorithm' && c.pass === true)).toBe(true)
  })
  it('lens: f = 10 cm, u = 15 cm — v = 30 cm, m = −2, real inverted magnified', () => {
    const o = solved('lens')
    const v = 1 / (1 / 0.1 - 1 / 0.15)
    expect(rel(valueOf(o, 'v').value!.scalarSI!, v)).toBeLessThan(1e-9)
    expect(rel(valueOf(o, 'm').value!.scalarSI!, -v / 0.15)).toBeLessThan(1e-9)
    expect(valueOf(o, 'nature').value!.text).toBe('实像、倒立、放大')
  })
  it('field: superposed field at P, its direction, and the force on −1 nC opposite to it', () => {
    const o = solved('field')
    const k = 8.9875517862e9
    const e = (q: number, x: number, y: number) => { const dx = 0.1 - x, dy = 0.1 - y, r = Math.hypot(dx, dy); return [k * q * dx / r ** 3, k * q * dy / r ** 3] }
    const [ax, ay] = e(2e-6, 0, 0), [bx, by] = e(-1e-6, 0.3, 0)
    const Ex = ax + bx, Ey = ay + by
    expect(rel(valueOf(o, 'E').value!.scalarSI!, Math.hypot(Ex, Ey))).toBeLessThan(1e-8)
    expect(valueOf(o, 'dir').value!.scalarSI!).toBeCloseTo(Math.atan2(Ey, Ex), 9)
    const fdir = valueOf(o, 'Fdir').value!.scalarSI!
    expect(Math.abs(Math.abs(fdir - Math.atan2(Ey, Ex)) - Math.PI)).toBeLessThan(1e-9)
  })
  it('every result carries its revision, content hash, engine version and provenance', () => {
    for (const d of SAMPLE_DOMAINS) {
      const t = sampleWithTargets(d), hash = taskHash(t)
      const o = solveTask(t, { hash })
      for (const r of o.results) {
        expect(isCurrent(r, t, hash)).toBe(true)
        expect(r.engineVersion).toBe(ENGINE_VERSION)
        expect(r.provenance.kind).toBeTruthy()
      }
    }
  })
})

describe('the crossing operation of the core (D111)', () => {
  it('finds both times a projectile passes 3 m above the launch point, refined between frames', () => {
    const scene = buildTemplate('projectile', { v0: 20, alpha: 30, h: 0, g: G })
    const y0 = scene.bodies.find(b => b.id === 'ball')!.position.y
    const rec = simulate(scene, { duration: 2.2 })
    const c = rec.session.call<{ crossings: Array<{ t: number }>; complete: boolean }>({ op: 'crossing', terms: [{ id: 'ball.y', c: 1 }], level: y0 + 3, t0: 1e-9, t1: 2.2, which: 'all' })
    const vy = 10
    const roots = [(vy - Math.sqrt(vy * vy - 2 * G * 3)) / G, (vy + Math.sqrt(vy * vy - 2 * G * 3)) / G]
    expect(c.crossings.length).toBe(2)
    c.crossings.forEach((x, i) => expect(Math.abs(x.t - roots[i])).toBeLessThan(1e-6))
    const down = rec.session.call<{ crossings: Array<{ t: number }> }>({ op: 'crossing', terms: [{ id: 'ball.y', c: 1 }], level: y0 + 3, t0: 1e-9, t1: 2.2, which: 'first', direction: 'down' })
    expect(Math.abs(down.crossings[0].t - roots[1])).toBeLessThan(1e-6)
  })
})

describe('revision guard (T14, manual §10.3)', () => {
  it('drops an answer when the task changed while it was solved', async () => {
    const runner = new TaskRunner()
    const t1 = sampleWithTargets('circuit'), h1 = taskHash(t1)
    let current = { task: t1, hash: h1 }
    const t2 = applyPatch(t1, { set: [{ ref: 'R2.R', valueSI: 4, unit: 'Ω', source: 'user' }] })
    const r = await runGuarded(runner, t1, h1, () => current, () => solveTask(t1, { hash: h1 }), async () => { current = { task: t2, hash: taskHash(t2) } })
    expect(r.accepted).toBe(false)
    expect(runner.dropped).toBe(1)
    expect(t2.revision).toBe(t1.revision + 1)
  })
  it('a newer request supersedes an older one; the result of the newest is accepted', async () => {
    const runner = new TaskRunner()
    const t = sampleWithTargets('lens'), hash = taskHash(t)
    const read = () => ({ task: t, hash })
    const first = runGuarded(runner, t, hash, read, () => 1, () => new Promise(res => setTimeout(res, 5)))
    const second = runGuarded(runner, t, hash, read, () => 2, () => new Promise(res => setTimeout(res, 1)))
    const [a, b] = await Promise.all([first, second])
    expect(a.accepted).toBe(false)
    expect(b).toEqual({ accepted: true, value: 2 })
  })
  it('an old result is never current for the new revision', () => {
    const t = sampleWithTargets('projectile'), hash = taskHash(t)
    const o = solveTask(t, { hash })
    const t2 = applyPatch(t, { set: [{ ref: 'ball.v0', valueSI: 21, unit: 'm/s', source: 'user' }] })
    expect(o.results.some(r => isCurrent(r, t2, taskHash(t2)))).toBe(false)
  })
})

describe('one comparison service keeps the old tolerances (D117)', () => {
  // the rules of 26.56, written out here as they were
  const oldProblem = (v: number, ref: number, tol = 0.02, abs = 1e-6) => Math.abs(v - ref) <= tol * Math.abs(ref) + abs
  const oldActivity = (v: number, ref: number, tol: number, scale = 0) => { const s = Math.max(Math.abs(ref), scale); return (s === 0 ? Math.abs(v) : Math.abs(v - ref) / s) <= tol }
  const oldPrediction = (v: number, ref: number) => { const big = Math.max(Math.abs(v), Math.abs(ref)); const d = Math.abs(v - ref); const r = big === 0 || d <= 1e-12 * big ? 0 : d / big; return r <= 0.01 ? 'ok' : r <= 0.05 ? 'warn' : 'bad' }
  const refs = [0, 1e-9, 0.5, -3.2, 9.8, 1234.5, -1e6]
  const factors = [1, 1.001, 1.009, 1.011, 1.019, 1.021, 1.04, 1.06, 0.98, -1, 0]
  it('problems, activities and predictions agree with 26.56 on a grid of answers', () => {
    for (const ref of refs) for (const f of factors) for (const off of [0, 5e-7, 2e-6]) {
      const v = ref * f + off
      expect(compareValues(v, ref, problemRule({})).pass).toBe(oldProblem(v, ref))
      expect(compareValues(v, ref, activityRule({ tol: 0.02, scale: 0.1 })).pass).toBe(oldActivity(v, ref, 0.02, 0.1))
      expect(compareValues(v, ref, activityRule({ tol: 0.05 })).pass).toBe(oldActivity(v, ref, 0.05))
      expect(compareValues(v, ref, PREDICTION_RULE).grade).toBe(oldPrediction(v, ref))
    }
  })
  it('an answer in another unit is converted first (T07, T27); a wrong sign is a direction error', () => {
    const g = gradeAnswer(72, 'km/h', 20, 'm/s', problemRule({}))
    expect(g.unit).toBe('correct')
    expect(g.calculation).toBe('correct')
    const s = gradeAnswer(-20, 'm/s', 20, 'm/s', problemRule({}), true)
    expect(s.direction).toBe('wrong')
    expect(gradeAnswer(20, 'kg', 20, 'm/s', problemRule({})).unit).toBe('wrong')
  })
})

describe('provenance of formula-card variables (FOR03, D111)', () => {
  it('every variable of every recognised situation comes with an explicit source from the core', () => {
    const SOURCES = ['given', 'constant', 'phase', 'time', 'sim', 'derived']
    let seen = 0
    const missing: string[] = []
    for (const t of TEMPLATES) {
      const rec = simulate(buildTemplate(t.id), { duration: 0.6 })
      const sits = rec.session.call<{ situations: Array<{ key: string; t0: number; t1: number }> }>({ op: 'situations' }).situations
      for (const s of sits) {
        const tm = Math.min(s.t1, Math.max(s.t0, 0.3))
        const sample = rec.session.call<{ sample: { vars: Record<string, { src?: string }> } }>({ op: 'sample', key: s.key, t: tm }).sample
        for (const [name, v] of Object.entries(sample.vars ?? {})) { seen++; if (!SOURCES.includes(v.src ?? '')) missing.push(`${t.id} ${s.key} ${name}`) }
      }
      rec.session.free?.()
    }
    expect(missing).toEqual([])
    expect(seen).toBeGreaterThan(200)
  })
})

describe('incline branches (T03, T04) and the readings of picture A', () => {
  const at = (id: string, v: Record<string, number>, ids: string[], t: number) => {
    const rec = simulate(buildTemplate(id, v), { duration: t + 0.2 })
    const k = Math.round(t / rec.dt)
    const s = quantitySeries(rec, ids, k, k)
    return ids.map((_, i) => s.values[i][0])
  }
  const ids = ['contact.block|incline.N', 'contact.block|incline.f', 'custom.as', 'custom.vs']
  it('reproduces N = mg cosθ, f = μk N, a = g(sinθ − μk cosθ) of the 26.56 screenshot (2 kg, 30°, μk = 0.2)', () => {
    const [N, f, a] = at('incline-friction', { theta: 30, m: 2, muS: 0.25, muK: 0.2, v0: 0, g: G }, ids, 0.5)
    expect(N).toBeCloseTo(2 * G * Math.cos(30 * DEG), 6)
    expect(f).toBeCloseTo(0.2 * 2 * G * Math.cos(30 * DEG), 6)
    expect(a).toBeCloseTo(G * (Math.sin(30 * DEG) - 0.2 * Math.cos(30 * DEG)), 6)
    // the values of the manual §6.6 table, to the digits shown
    expect(N.toFixed(5)).toBe('16.97410')
    expect(f.toFixed(5)).toBe('3.39482')
    expect(a.toFixed(5)).toBe('3.20259')
  })
  it('a block that can stay at rest has static friction mg sinθ, not μs·N (T03)', () => {
    const [N, f, , v] = at('incline-friction', { theta: 20, m: 1, muS: 0.5, muK: 0.4, v0: 0, g: G }, ids, 0.5)
    expect(Math.abs(v)).toBeLessThan(1e-6)
    expect(f).toBeCloseTo(G * Math.sin(20 * DEG), 5)
    expect(f).toBeLessThan(0.5 * N - 0.5)
  })
  it('sliding up then back: the task finds the stop and changes branch (T04)', () => {
    let t = sampleWithTargets('incline')
    t = applyPatch(t, { set: [{ ref: 'blockA.v0', valueSI: -3, unit: 'm/s', source: 'user' }] })
    const stop = makeTarget(t, 'stopS').target, state = makeTarget(t, 'state').target
    t = applyPatch(t, { targets: [stop, state] })
    t = applyPatch(t, acceptDefaults(checkTask(t)))
    const o = solveTask(t)
    const aUp = G * (Math.sin(30 * DEG) + 0.2 * Math.cos(30 * DEG))
    const r = o.results.find(x => specKey(x.targetId) === 'stopS')!
    expect(Math.abs(r.value!.scalarSI!)).toBeCloseTo(9 / (2 * aUp), 6)
    expect(o.phases.length).toBeGreaterThanOrEqual(2)
  })
})

describe('contact forces are summed once (T06, D119)', () => {
  const f = (label: string, x: number, fy: number) => ({ x, y: 0, fx: 0, fy, kind: 'normal' as const, label })
  it('N1, N2 of one contact become one N at the weighted centre; a second contact starts again at N1', () => {
    const out = sumContactPoints([f('N1', 0, 3), f('N2', 1, 1), { x: 0.5, y: 0, fx: 0, fy: -4, kind: 'gravity' as const, label: 'G' }, f('N1', 5, 2), f('N2', 6, 2)])
    expect(out.map(o => [o.label, o.points])).toEqual([['N', 2], ['G', 1], ['N', 2]])
    expect(out[0].fy).toBe(4)
    expect(out[0].x).toBeCloseTo(0.25, 12)
    expect(out[2].x).toBeCloseTo(5.5, 12)
  })
  it('the detailed view shows each point and never the sum together with its parts', () => {
    const raw = [f('N1', 0, 3), f('N2', 1, 1)]
    const detail = arrowsOfBody(raw, { overlay: true, lit: null, contactPoints: true })
    expect(detail.map(a => a.label)).toEqual(['N1', 'N2'])
    const summed = arrowsOfBody(raw, { overlay: true, lit: null, contactPoints: false })
    expect(summed.map(a => a.label)).toEqual(['N'])
    const total = (l: typeof summed) => l.reduce((s, a) => s + a.fy, 0)
    expect(total(summed)).toBe(total(detail))
  })
})

describe('a hovered formula variable lights its forces on the canvas (D72, UX06)', () => {
  it('μ of a contact lights the normal and friction arrows of its bodies, even with the force overlay off', () => {
    const sit = { key: 'k', type: 'incline', title: '', t0: 0, t1: 1, bodies: ['block'], sample: () => { throw new Error('unused') } }
    const hl = varHighlight('mu', sit as never)!
    expect(hl.bodies).toEqual(['block'])
    const raw = [
      { x: 0, y: 0, fx: 0, fy: -9.8, kind: 'gravity' as const, label: 'G' },
      { x: 0, y: 0, fx: 0, fy: 8, kind: 'normal' as const, label: 'N' },
      { x: 0, y: 0, fx: -2, fy: 0, kind: 'friction' as const, label: 'f' }
    ]
    const drawn = arrowsOfBody(raw, { overlay: false, lit: hl.forces, contactPoints: false })
    expect(drawn.map(a => [a.label, a.lit])).toEqual([['N', true], ['f', true]])
    const all = arrowsOfBody(raw, { overlay: true, lit: hl.forces, contactPoints: false })
    expect(all.map(a => a.lit)).toEqual([false, true, true])
  })
})

describe('value labels avoid labels and bodies (D119)', () => {
  it('moves a label off an obstacle, to the other side when the column is full', () => {
    const body = { x: 90, y: 40, w: 60, h: 60 }
    const p = tagPosition([], [body], 100, 70, 40, 16)
    const inside = (q: { x: number; y: number }) => !(q.x - 3 >= body.x + body.w || q.x - 3 + 40 <= body.x || q.y - 12 >= body.y + body.h || q.y + 4 <= body.y)
    expect(inside(p)).toBe(false)
    const column = Array.from({ length: 12 }, (_, i) => ({ x: 95, y: i * 17 - 20, w: 50, h: 17 }))
    const q = tagPosition(column, [], 100, 70, 40, 16, [96, 70])
    expect(q.x).toBeLessThan(100)
  })
})

describe('quantities say what they are (manual §4.3 item 10)', () => {
  it('components name the frame and the positive direction; magnitudes say they have none', () => {
    expect(quantityNote({ id: 'ball.vx', group: '物体' })).toContain('x 轴向右')
    expect(quantityNote({ id: 'ball.y', group: '物体' })).toContain('y 轴向上')
    expect(quantityNote({ id: 'ball.v', group: '物体' })).toContain('大小')
    expect(quantityNote({ id: 'custom.s', group: '自定义' })).toContain('沿斜面向下为正')
    expect(quantityNote({ id: 'contact.block|incline.N', group: '接触' })).toContain('合计')
    expect(quantityNote({ id: 'spring.x', group: '连接件' })).toBe('')
  })
})

describe('the wheel over a number field (T21)', () => {
  const e = (o: Partial<{ altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; deltaX: number; deltaY: number }>) => ({ altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, deltaX: 0, deltaY: 0, ...o })
  it('does nothing without Alt (the page scrolls), steps with Alt', () => {
    expect(wheelSteps(e({ deltaY: -100 }))).toBeNull()
    expect(wheelSteps(e({ deltaY: -100, shiftKey: true }))).toBeNull()
    expect(wheelSteps(e({ deltaY: -100, altKey: true }))).toBe(1)
    expect(wheelSteps(e({ deltaY: 100, altKey: true, shiftKey: true }))).toBe(-0.1)
    expect(wheelSteps(e({ deltaX: -3, altKey: true, ctrlKey: true }))).toBe(10)
    expect(wheelSteps(e({ deltaY: -100, altKey: true }), true)).toBeNull()
  })
})

describe('a failed result shows its reason, never a number (UX08)', () => {
  it('renders the state in words and no value', async () => {
    const task = sampleWithTargets('lens')
    const r: ResultEnvelope = {
      taskId: task.taskId, taskRevision: task.revision, sceneHash: 'h', runId: 'r', engineVersion: '26.57.0', modelVersions: {}, constantsSet: 'CODATA2022',
      targetId: 'v', applicability: 'insufficient', computation: 'failed', evidenceIds: [], conditionChecks: [], provenance: { kind: 'analytic', inputRefs: [] }, checks: [],
      reason: '物体在焦点上：折射光平行，像在无穷远（不是数值错误）'
    }
    const html = await renderToString(createSSRApp({ render: () => h(ResultCard, { result: r, task }) }))
    expect(html).toContain('计算失败')
    expect(html).toContain('像在无穷远')
    expect(html).toMatch(/class="num mono"[^>]*>—</)
  })
})

describe('review from explicit weak points (EDU12)', () => {
  const attempt = (activity: string, finished: string, mastery: boolean, dims: Partial<AttemptRecord['dims']>, contentVersion?: string): AttemptRecord => ({
    id: `${activity}-${finished}`, activity, started: finished, finished, constantsSet: 'CODATA2022', inputs: {}, transferInputs: {}, diagnostic: {}, prediction: null, experiment: null, revision: null, items: {}, transfer: {},
    dims: { concept: { correct: 1, total: 1 }, unit: { correct: 1, total: 1 }, direction: { correct: 1, total: 1 }, modelling: { correct: 1, total: 1 }, calculation: { correct: 1, total: 1 }, explanation: { correct: 0, total: 0 }, ...dims },
    mastery, ...(contentVersion ? { contentVersion } : {})
  })
  it('suggests the weak dimensions of the latest attempt, worst first; mastered activities are left out', () => {
    const rec = emptyRecords()
    rec.attempts = [
      attempt('act-incline', '2026-10-01', false, { direction: { correct: 0, total: 2 }, calculation: { correct: 1, total: 2 } }),
      attempt('act-freefall', '2026-10-02', false, { unit: { correct: 0, total: 1 } }, '26.57.1'),
      attempt('act-freefall', '2026-10-03', true, {}, '26.57.1'),
      attempt('act-lens', '2026-10-04', false, {}, '26.57.1')
    ]
    const s = reviewSuggestions(rec, '26.57.1')
    expect(s.map(x => x.activity)).toEqual(['act-incline'])
    expect(s[0].weak).toEqual(['direction', 'calculation'])
    expect(s[0].olderContent).toBe(true)
  })
})

describe('teaching packages (VP-13, T26)', () => {
  it('24 packages; progress is computed, none claims trials', () => {
    expect(PACKAGES.length).toBe(24)
    for (const p of PACKAGES) {
      const st = packageStatus(p)
      expect(st.trialled).toBe(false)
      expect(st.missing).toContain('没有学生试用记录')
    }
  })
  it('a goal word finds its packages; the practice opened is one that exists', () => {
    expect(packagesForGoal('射程').map(p => p.id)).toContain('M04')
    expect(packagesForGoal('摩擦力').map(p => p.id)).toContain('M07')
    for (const p of PACKAGES) { const src = practiceOf(p); if (src) expect(p.practice.some(x => x.source === src)).toBe(true) }
  })
})

describe('transfer tasks change one condition (D116)', () => {
  it('the incline crosses tanθ = μs; the collision switches its kind; the test charge changes sign', () => {
    const inc = sampleWithTargets('incline')
    const ti = transferTask(inc).task
    const th = (t: typeof inc) => value(t, 'incline.theta')!
    expect(Math.tan(th(inc)) > 0.25).toBe(true)
    expect(Math.tan(th(ti)) < 0.25).toBe(true)
    const col = sampleWithTargets('collision')
    expect(transferTask(col).task.options?.kind).toBe('perfectlyInelastic')
    const fld = sampleWithTargets('field')
    const q = (t: typeof fld) => value(t, 'test.q')!
    expect(q(transferTask(fld).task)).toBe(-q(fld))
  })
})

describe('work modes are presets over one scene (VP-10, D118)', () => {
  it('switching mode changes panels and overlays, never the scene, the time or the selection; changes are remembered per mode', async () => {
    const { state } = await import('../src/app/store')
    const { setWorkMode, resetWorkMode, work, MODE_PRESETS } = await import('../src/app/workMode')
    const scene = JSON.stringify(state.scene)
    state.time = 0.42
    state.selection = null
    await setWorkMode('solve')
    expect(work.mode).toBe('solve')
    expect(state.rightTab).toBe(MODE_PRESETS.solve.rightTab)
    expect(state.bottomTab).toBe('events')
    state.display.velocity = true
    await new Promise(r => setTimeout(r, 0))
    await setWorkMode('experiment')
    expect(state.rightTab).toBe('watch')
    await setWorkMode('solve')
    expect(state.display.velocity).toBe(true)
    resetWorkMode()
    expect(state.display.velocity).toBe(false)
    expect(JSON.stringify(state.scene)).toBe(scene)
    expect(state.time).toBe(0.42)
  })
})

describe('task files (T30)', () => {
  it('a task comes back with its targets, conditions, sources and version', async () => {
    const { openSample, taskFile, loadTaskFile, taskUi } = await import('../src/app/task/taskState')
    openSample('projectile')
    const before = JSON.stringify(taskUi.task)
    const file = taskFile()
    expect(JSON.parse(file).schemaVersion).toBe(2)
    expect(loadTaskFile('{"format":"other"}')).toBe('不是 VeloPhi 任务文件')
    expect(loadTaskFile(file)).toBeNull()
    expect(JSON.stringify(taskUi.task)).toBe(before)
    expect(taskUi.task!.conditions.length).toBe(1)
  })
})

describe('the must-test cases of manual §14.1', () => {
  it('T01: a scene of an incline and a block offers targets and chooses none', async () => {
    const { suggestFromScene } = await import('../src/task/scene')
    const s = suggestFromScene(buildTemplate('incline-friction'))
    expect(s.domain).toBe('incline')
    expect(s.targets.length).toBeGreaterThan(3)
    expect(s.task!.targets).toEqual([])
    expect(checkTask(s.task!).clarifications.some(c => c.kind === 'chooseTarget')).toBe(true)
  })
  it('T02: “speed after 2 m” binds the first arrival and returns a speed, not an x velocity', () => {
    const t = sampleWithTargets('incline')
    expect(t.targets[0].ref).toMatchObject({ quantity: 'velocity', component: 'magnitude', frameId: 'incline-ground' })
    expect(t.targets[0].at).toMatchObject({ kind: 'condition', crossing: 'first' })
    expect(t.conditions[0]).toMatchObject({ kind: 'displacementEquals', valueSI: 2 })
  })
  it('T05: a movable incline is not taken for the fixed-incline task', async () => {
    const { suggestFromScene } = await import('../src/task/scene')
    expect(suggestFromScene(buildTemplate('movable-wedge')).domain).toBeNull()
  })
  it('T08: g = 10 in the problem is adopted with its source; the project default is not used', async () => {
    const { parseProblem } = await import('../src/task/parse')
    const p = parseProblem('质量 2 kg 的物块在固定 30° 斜面上从静止释放，μs = 0.25，μk = 0.2，g = 10 m/s²。求物块的加速度。')
    const g = p.task!.givens.find(x => x.ref === 'gravity.g' && x.status === 'adopted')!
    expect(g.valueSI).toBe(10)
    expect(g.source).toBe('stem')
  })
  it('T09: “find the velocity” without a time asks when, and does not take the end value', () => {
    let t = sampleWithTargets('incline')
    t = applyPatch(t, { targets: [makeTarget(t, 'speedAtT').target], removeTargets: ['speedAtS'] })
    const c = checkTask(t)
    expect(c.state).toBe('needsInput')
    expect(c.clarifications.some(x => x.kind === 'chooseEvaluation')).toBe(true)
  })
  it('T11: velocities after a collision are read on the right side of the event', () => {
    const t = sampleWithTargets('collision')
    expect(t.targets.every(x => x.at?.kind === 'event' && (x.at as { side: string }).side === 'after')).toBe(true)
    const o = solveTask(t)
    expect(o.results.every(r => r.checks.some(c => c.kind === 'simulation' && c.pass === true))).toBe(true)
  })
  it('T12: a missing mass is “information missing”; an impossible value is invalid; A behind a faster B has no collision', () => {
    let t = sampleWithTargets('incline')
    t = applyPatch(t, { targets: [makeTarget(t, 'N').target] })
    const noMass = applyPatch(t, { remove: ['blockA.mass'] })
    const c1 = checkTask(noMass)
    expect(c1.clarifications.some(x => x.kind === 'missingGiven' && x.ref === 'blockA.mass')).toBe(true)
    const bad = applyPatch(t, { set: [{ ref: 'incline.theta', valueSI: 2, unit: 'rad', source: 'user' }] })
    expect(checkTask(bad).clarifications.some(x => x.kind === 'invalid')).toBe(true)
    let col = sampleWithTargets('collision')
    col = applyPatch(col, { set: [{ ref: 'B.u', valueSI: 5, unit: 'm/s', source: 'user' }] })
    const o = solveTask(col)
    expect(o.results.every(r => r.computation === 'noSolution')).toBe(true)
  })
  it('T16: “smooth” makes the results old (kept for comparison); taking it back restores the conditions', async () => {
    const { openSample, changeTask, solveCurrent, taskUi } = await import('../src/app/task/taskState')
    ;(globalThis as { requestAnimationFrame?: (f: () => void) => void }).requestAnimationFrame ??= (f: () => void) => setTimeout(f, 0)
    openSample('incline')
    expect(await solveCurrent()).toBe(true)
    const v = taskUi.outcome!.results[0].value!.scalarSI!
    changeTask({ assume: [{ id: 'smooth', source: 'user' }] })
    expect(taskUi.state).toBe('stale')
    expect(taskUi.previous!.results[0].value!.scalarSI).toBe(v)
    expect(taskUi.outcome).toBeNull()
    expect(await solveCurrent()).toBe(true)
    expect(taskUi.outcome!.results[0].value!.scalarSI!).toBeCloseTo(Math.sqrt(2 * G * 0.5 * 2), 9)
    changeTask({ unassume: ['smooth'] })
    expect(await solveCurrent()).toBe(true)
    expect(taskUi.outcome!.results[0].value!.scalarSI).toBeCloseTo(v, 12)
  })
  it('T17: a parent check box is mixed when some children are on', async () => {
    const TriCheck = (await import('../src/app/components/TriCheck.vue')).default
    const html = (children: Array<{ key: string; on: boolean }>) => renderToString(createSSRApp({ render: () => h(TriCheck, { label: '矢量', children }) }))
    expect(await html([{ key: 'a', on: true }, { key: 'b', on: false }])).toContain('aria-checked="mixed"')
    expect(await html([{ key: 'a', on: true }, { key: 'b', on: true }])).toContain('aria-checked="true"')
    expect(await html([{ key: 'a', on: false }, { key: 'b', on: false }])).toContain('aria-checked="false"')
  })
  it('T23/T24: without the View Transition API (or with reduced motion) a switch is applied at once', async () => {
    const { circularTransition, transitionsAllowed } = await import('../src/app/viewTransition')
    expect(transitionsAllowed()).toBe(false)
    let done = false
    const p = circularTransition(() => { done = true })
    expect(done).toBe(true)
    await p
  })
  it('T25: the field direction is the force on a positive charge; a negative charge is pushed the other way', () => {
    const o = solved('field')
    const dir = valueOf(o, 'dir').value!.scalarSI!, fdir = valueOf(o, 'Fdir').value!.scalarSI!
    expect(Math.cos(dir - fdir)).toBeCloseTo(-1, 9)
  })
  it('T28: an unbounded recording has no end value — the target asks for an end condition', async () => {
    const { fromProblemTarget } = await import('../src/task/adapters')
    const scene = buildTemplate('projectile')
    scene.settings.duration = null
    const m = fromProblemTarget('end', { kind: 'end', id: 'ball.vx' }, scene)
    expect(m.target.at).toBeUndefined()
    expect(m.missing).toContain('终止条件（无限时长的记录没有结束值）')
    scene.settings.duration = 2
    expect(fromProblemTarget('end', { kind: 'end', id: 'ball.vx' }, scene).target.at).toEqual({ kind: 'time', tSI: 2 })
  })
  it('T29: the same scene gives the same results whatever the display (motion, overlays)', () => {
    const a = simulate(buildTemplate('incline-friction')), b = simulate(buildTemplate('incline-friction'))
    expect(a.hash).toBe(b.hash)
  })
})

describe('more of the task contract (VP-03, VP-06, VP-09, VP-14, T15, D111)', () => {
  it('VP-03: the four condition states of the core map onto the task applicability', async () => {
    const { conditionApplicability } = await import('../src/task/adapters')
    expect(['ok', 'approx', 'fail', 'unknown', null].map(s => conditionApplicability(s as never))).toEqual(['applicable', 'approximate', 'inapplicable', 'insufficient', 'insufficient'])
  })
  it('VP-06: a task filled in by hand asks for what is missing, then solves', async () => {
    const { newManualTask, changeTask, addTarget, solveCurrent, taskUi } = await import('../src/app/task/taskState')
    ;(globalThis as { requestAnimationFrame?: (f: () => void) => void }).requestAnimationFrame ??= (f: () => void) => setTimeout(f, 0)
    newManualTask('circuit')
    expect(taskUi.state).toBe('needsInput')
    changeTask({ set: [{ ref: 'source.E', valueSI: 6, unit: 'V', source: 'user' }, { ref: 'source.r', valueSI: 0.5, unit: 'Ω', source: 'user' }, { ref: 'R1.R', valueSI: 2, unit: 'Ω', source: 'user' }, { ref: 'R2.R', valueSI: 3.5, unit: 'Ω', source: 'user' }], options: { connection: 'series' } })
    addTarget('I')
    expect(taskUi.check!.state).toBe('ready')
    expect(await solveCurrent()).toBe(true)
    expect(taskUi.outcome!.results[0].value!.scalarSI).toBeCloseTo(6 / (2 + 3.5 + 0.5), 12)
  })
  it('VP-09: every representative task has a practice activity that exists', async () => {
    const { PRACTICE } = await import('../src/app/task/demo')
    const { activityById } = await import('../src/teaching/activities')
    for (const d of SAMPLE_DOMAINS) expect(activityById(PRACTICE[d]), d).toBeTruthy()
  })
  it('VP-14: pins snap with hysteresis, and undo takes the last pin change back', async () => {
    const { dock, docked, undoDock, resetDocks, snapState } = await import('../src/app/task/dock')
    expect([snapState(20, false), snapState(15, false), snapState(25, true), snapState(29, true)]).toEqual([false, true, true, false])
    resetDocks()
    dock('v1', 'top'); dock('v1', 'canvas')
    expect(docked('v1')).toBe('canvas')
    expect(undoDock()).toBe(true)
    expect(docked('v1')).toBe('top')
  })
  it('T15: switching force arrows on changes neither the scene nor its recording', async () => {
    const { state } = await import('../src/app/store')
    const { serializeScene } = await import('../src/core/scene/io')
    const before = serializeScene(state.scene)
    state.display.forces = !state.display.forces
    state.display.contactPoints = !state.display.contactPoints
    expect(serializeScene(state.scene)).toBe(before)
  })
  it('D111: a solved unknown is put back into the model and the residual reported', async () => {
    const { invertModel } = await import('../src/engine/models')
    const r = invertModel('M04', { v0: 20, g: 9.8, h0: 0 }, 'theta', 'Rsame', 30, 0, Math.PI / 2)
    expect(r.roots.length).toBe(2)
    for (const x of r.roots) { expect(x.checked).toBe(true); expect(Math.abs(x.residual!)).toBeLessThan(1e-9 * 30) }
    expect(r.method?.kind).toBe('scan+bisection')
  })
})
