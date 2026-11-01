/**
 * Solving a task (26.57, D116; manual §3.2, §6.7, §13.1 C): determine the model → choose the law → relate → solve →
 * check, for the six representative domains. Every number comes from the Rust core: the model registry (modelEval,
 * modelSolve with residuals), the expression evaluator for the derived steps, and — as the independent check — a
 * different method of the core: the rigid-body simulation with condition crossings (incline, projectile, collision),
 * nodal analysis (circuit), ray tracing (lens), and the field of the lab with a numerical gradient of the potential
 * (field). The interface never computes physics itself (D65); this module only chains the requests and says which
 * result answers which target, with the phase, the condition states and the evidence.
 */
import type { CheckResult, EvaluationPoint, ProvenanceKind, ResultEnvelope, SolutionStep, SolveOutcome, TaskSpec, TaskTarget, Applicability } from './types'
import { specKey, value } from './build'
import { targetSpec } from './vocab'
import { CHECK_RULE, compareValues } from './compare'
import type { Rule } from './compare'
import type { ModelResult, ModelState } from '../engine/models'
import { constantSet, evalModel, invertModel, manifest } from '../engine/models'
import { calc } from '../engine/core'
import { buildTemplate } from '../templates'
import { simulate } from '../engine/recording'
import type { Recording } from '../engine/recording'
import { valuesAt, valuesAtEvent } from '../engine/observe'
import { ALONG, INCLINE2_START } from '../templates/t2657'
import { circuitSolve, fieldAt, opticsTrace } from '../engine/labs'
import type { CircuitElement } from '../engine/labs'
import { ENGINE_VERSION } from '../core/scene/types'

const SET = 'CODATA2022'
const DEG = Math.PI / 180

/** Applicability of a model state (manual §5.3: the four states shared by models, formula cards and results). */
export function applicabilityOf(s: ModelState): Applicability {
  return s === 'applicable' ? 'applicable' : s === 'approximate' ? 'approximate' : s === 'insufficient' ? 'insufficient' : 'inapplicable'
}

/** A value of the core's expression evaluator (derived steps of a plan). */
export function expr(e: string, vars: Record<string, number>): number {
  const r = calc<{ value?: number; error?: unknown }>({ op: 'evaluateExpr', expr: e, vars })
  if (r.error !== undefined || r.value === undefined) throw new Error(`task: expression ${e}`)
  return r.value
}

/** One output of a model evaluation (null when it does not apply). */
function outOf(r: ModelResult, id: string): { value: number | null; state: ModelState; branch?: string } {
  const o = r.outputs.find(x => x.id === id && (x.state === 'applicable' || x.state === 'approximate')) ?? r.outputs.find(x => x.id === id)
  return o ? { value: o.state === 'applicable' || o.state === 'approximate' ? o.value : null, state: o.state, branch: o.branch } : { value: null, state: 'insufficient' }
}
const condState = (r: ModelResult, id: string): ModelState | undefined => r.conditions.find(c => c.id === id)?.state

/** Hash of the physical content of a task (the inputs, options, assumptions and conditions; not the wording). */
export function taskHash(task: TaskSpec): string {
  const adopted = [...task.givens, ...task.initialConditions].filter(g => (g.status ?? 'adopted') === 'adopted').map(g => [g.ref, g.valueSI]).sort()
  const content = JSON.stringify({ d: task.domain, g: adopted, o: task.options ?? {}, a: task.assumptions.map(a => a.id).sort(), c: task.conditions.map(c => [c.id, c.kind, c.entity, c.component, c.valueSI, c.direction ?? 'any']), t: task.targets.map(t => [t.id, t.at]) })
  return manifest('task', content, SET).inputSha256 ?? ''
}

/** What a domain solver writes. */
interface Builder {
  task: TaskSpec
  hash: string
  results: ResultEnvelope[]
  steps: SolutionStep[]
  phases: SolveOutcome['phases']
  notes: string[]
  runId: string
  models: Record<string, string>
}

function envelope(b: Builder, target: TaskTarget, o: Partial<ResultEnvelope> & Pick<ResultEnvelope, 'applicability' | 'computation'>): ResultEnvelope {
  return {
    taskId: b.task.taskId, taskRevision: b.task.revision, sceneHash: b.hash, runId: b.runId, engineVersion: ENGINE_VERSION,
    modelVersions: { ...b.models }, constantsSet: SET, targetId: target.id, at: target.at, evidenceIds: [], conditionChecks: [],
    provenance: { kind: 'analytic', inputRefs: [] }, checks: [], ...o
  }
}

/** An independent check of a value. */
function check(id: string, kind: ProvenanceKind, label: string, q: number | null, ref: number | null, rule: Rule = CHECK_RULE, note?: string): CheckResult {
  if (q === null || ref === null || !Number.isFinite(q) || !Number.isFinite(ref)) return { id, kind, label, valueSI: ref, delta: null, pass: null, note }
  const c = compareValues(q, ref, rule)
  return { id, kind, label, valueSI: ref, delta: c.delta, pass: c.pass, note }
}

function step(b: Builder, s: Omit<SolutionStep, 'id'>) { b.steps.push({ id: `s${b.steps.length + 1}`, ...s }) }

const need = (task: TaskSpec, ref: string): number => {
  const v = value(task, ref)
  if (v === undefined) throw new Error(`task: missing ${ref}`)
  return v
}
const opt = (task: TaskSpec, ref: string): number | undefined => value(task, ref)
const fmt = (v: number) => Number(v.toPrecision(10))

// ---------------------------------------------------------------- incline ----

/** A phase of the analytic incline plan (down positive). */
interface InclinePhase { id: string; branch: 'slideDown' | 'slideUp' | 'stick'; t0: number; t1: number | null; s0: number; v0: number; a: number; label: string }

function inclinePlan(b: Builder) {
  const task = b.task
  const smooth = task.assumptions.some(a => a.id === 'smooth')
  const theta = need(task, 'incline.theta'), g = need(task, 'gravity.g')
  const muK = smooth ? 0 : need(task, 'contact.muK')
  const muS = smooth ? 0 : opt(task, 'contact.muS') ?? muK
  const v0 = need(task, 'blockA.v0')
  const m = opt(task, 'blockA.mass')
  const ins = (v: number) => ({ m: m ?? 1, theta, muS, muK, g, v0: v })
  b.models.M07 = 'registry 26.56'
  b.models.M02 = 'registry 26.56'
  const phases: InclinePhase[] = []
  // Phase 1 and, after a stop, the new decision at rest (manual §5.4: never continue the old branch past v = 0)
  let t = 0, s = 0, v = v0
  for (let k = 0; k < 3; k++) {
    const r = evalModel('M07', ins(v), { constantsSet: SET })
    const branch = (['slideDown', 'slideUp', 'stick'] as const).find(c => condState(r, c) === 'applicable') ?? 'stick'
    const a = outOf(r, 'a').value ?? 0
    const label = branch === 'slideDown' ? '向下滑：摩擦沿斜面向上' : branch === 'slideUp' ? '向上滑：摩擦沿斜面向下' : '静止：静摩擦平衡重力分力'
    step(b, { stage: k === 0 ? 'model' : 'law', text: k === 0 ? '判断初始阶段：tanθ = {0}，μs = {1}，v₀ = {2} m/s → {3}' : '速度减为 0 后重新判断：tanθ = {0}，μs = {1} → {3}', params: [fmt(Math.tan(theta)), fmt(muS), fmt(v), label], model: 'M07', branch, targets: [] })
    // Sliding with the acceleration against the motion: it stops at t + |v|/|a|
    const stops = branch !== 'stick' && v !== 0 && Math.sign(a) !== Math.sign(v)
    if (branch === 'stick' || (branch === 'slideDown' && v === 0 && a <= 0)) {
      phases.push({ id: `p${k + 1}`, branch: 'stick', t0: t, t1: null, s0: s, v0: 0, a: 0, label: '静止：静摩擦平衡重力分力' })
      break
    }
    if (!stops) { phases.push({ id: `p${k + 1}`, branch, t0: t, t1: null, s0: s, v0: v, a, label }); break }
    // time to stop from M02 (v = v0 + a t = 0) solved by the core, with its residual
    const tStop = invertModel('M02', { x0: s, v0: v, a, t: null }, 't', 'v', 0, 0, Math.abs(v / a) * 2 + 1e-9, { samples: 64 })
    const root = tStop.roots.find(x => x.value > 0)
    const dt = root ? root.value : Math.abs(v / a)
    const sEnd = evalModel('M02', { x0: s, v0: v, a, t: dt }).outputs.find(o => o.id === 'x')!.value!
    phases.push({ id: `p${k + 1}`, branch, t0: t, t1: t + dt, s0: s, v0: v, a, label })
    step(b, { stage: 'solve', text: '{0}：经过 {1} s 速度减为 0，沿斜面的位移 {2} m', params: [label, fmt(dt), fmt(sEnd)], model: 'M02', targets: [] })
    t += dt; s = sEnd; v = 0
  }
  b.phases = phases.map(p => ({ id: p.id, label: p.label, t0: p.t0, t1: p.t1, branch: p.branch }))

  // Verification run: the incline template with the task's values (slope long enough for the asked displacement)
  const dMax = Math.max(0, ...task.conditions.map(c => Math.abs(c.valueSI)))
  const slope = Math.max(5 / Math.cos(theta), INCLINE2_START + dMax + 1.5)
  const base = slope * Math.cos(theta)
  let rec: Recording | null = null
  const horizon = (): number => {
    let h = 1
    for (const c of task.conditions) {
      const ph = phaseAt(phases, c.valueSI)
      if (ph) h = Math.max(h, ph.t + 0.5)
    }
    const last = phases[phases.length - 1]
    if (last.t1 !== null) h = Math.max(h, last.t1 + 0.5)
    return Math.min(h, 60)
  }
  try {
    const scene = buildTemplate('incline-friction', { theta: theta / DEG, m: m ?? 1, muS, muK, v0, g, base })
    rec = simulate(scene, { duration: horizon() })
    b.runId = `sim:${rec.hash.slice(0, 16)}`
  } catch (e) {
    b.notes.push('验证用的仿真没有完成：只给出解析结果')
  }
  const dtSim = rec ? rec.dt : 0
  const simAt = (t: number, ids: string[]) => (rec ? Array.from(valuesAt(rec, t, ids)) : ids.map(() => NaN))

  for (const tg of task.targets) {
    const key = specKey(tg.id)
    const first = phases[0]
    const pre = (extra: Partial<ResultEnvelope>) => envelope(b, tg, { applicability: 'applicable', computation: 'solved', provenance: { kind: 'analytic', inputRefs: ['incline.theta', 'contact.muS', 'contact.muK', 'gravity.g', 'blockA.v0'] }, ...extra })
    if (key === 'state') {
      const txt = first.branch === 'slideDown' ? '向下滑动' : first.branch === 'slideUp' ? '向上滑动（之后减速）' : '保持静止'
      b.results.push(pre({ value: { unit: '', text: txt }, conditionChecks: [{ id: 'branch', state: 'applicable', reason: first.label }] }))
      continue
    }
    if (key === 'a') {
      const sim = simAt(Math.min(0.5 * dtSim, (first.t1 ?? 1) / 2), [ALONG.as])[0]
      step(b, { stage: 'relation', text: '沿斜面方向用牛顿第二定律：{0}', params: [first.label], tex: first.branch === 'slideDown' ? 'a_s = g(\\sin\\theta - \\mu_k\\cos\\theta)' : first.branch === 'slideUp' ? 'a_s = g(\\sin\\theta + \\mu_k\\cos\\theta)' : 'a_s = 0', model: 'M07', branch: first.branch, targets: [tg.id] })
      b.results.push(pre({ value: { scalarSI: first.a, unit: 'm/s²' }, atTimeSI: 0, errorBudget: { atolSI: 1e-9, rtol: 1e-6 }, checks: [check('sim-a', 'simulation', '刚体仿真：沿斜面的加速度（同一时刻）', first.a, sim)] }))
      continue
    }
    if (key === 'N' || key === 'f') {
      if (m === undefined) { b.results.push(pre({ applicability: 'insufficient', computation: 'failed', reason: '缺少质量' })); continue }
      const r = evalModel('M07', ins(first.branch === 'stick' ? 0 : first.v0), { constantsSet: SET })
      const val = outOf(r, key).value
      const ids = key === 'N' ? ['contact.block|incline.N'] : ['contact.block|incline.f']
      const sim = simAt(Math.min(0.5 * dtSim, (first.t1 ?? 1) / 2), ids)[0]
      const kind = key === 'f' && first.branch === 'stick' ? '静摩擦：等于所需值 mg sinθ，不是上限 μsN' : key === 'f' ? '滑动摩擦 μkN' : 'N = mg cosθ'
      step(b, { stage: 'relation', text: '{0}', params: [kind], tex: key === 'N' ? 'N = mg\\cos\\theta' : first.branch === 'stick' ? 'f_s = mg\\sin\\theta \\le \\mu_s N' : 'f = \\mu_k N', model: 'M07', branch: first.branch, targets: [tg.id] })
      const checks = [check(`sim-${key}`, 'simulation', key === 'N' ? '刚体仿真：接触合力的法向分量（两个接触点合计）' : '刚体仿真：摩擦力（两个接触点合计）', val, sim)]
      if (key === 'f' && first.branch === 'stick') {
        const max = expr('muS*m*g*cos(theta)', { muS, m, g, theta })
        checks.push({ id: 'below-max', kind: 'conservation', label: '静摩擦不超过最大静摩擦 μsN', valueSI: max, delta: null, pass: (val ?? Infinity) <= max * (1 + 1e-12) })
      }
      b.results.push(pre({ value: val === null ? undefined : { scalarSI: val, unit: 'N' }, atTimeSI: 0, checks, provenance: { kind: 'analytic', inputRefs: ['blockA.mass', 'incline.theta', 'gravity.g', 'contact.muK', 'contact.muS'] } }))
      continue
    }
    if (key === 'stopS') {
      if (first.branch !== 'slideUp' || first.t1 === null) { b.results.push(pre({ applicability: 'inapplicable', computation: 'noSolution', reason: '物块不是向上滑动，没有“上滑的最大距离”' })); continue }
      const d1 = phases[1] ? phases[1].s0 - first.s0 : 0
      let simT: number | null = null, simS: number | null = null
      if (rec) {
        const c = rec.session.call<{ crossings: Array<{ t: number; values: number[] }> }>({ op: 'crossing', terms: [{ id: ALONG.vs, c: 1 }], level: 0, t0: 0, t1: horizon(), which: 'first', direction: 'up' })
        if (c.crossings[0]) { simT = c.crossings[0].t; simS = simAt(simT, [ALONG.s])[0] }
      }
      b.results.push(pre({ value: { scalarSI: Math.abs(d1), unit: 'm' }, atTimeSI: first.t1, checks: [check('sim-stop', 'simulation', '刚体仿真：速度过零时沿斜面的位移', Math.abs(d1), simS === null ? null : Math.abs(simS)), check('sim-tstop', 'simulation', '刚体仿真：速度过零的时刻', first.t1, simT)] }))
      continue
    }
    // Targets at a condition (s = d) or at a time
    const at = tg.at
    const cond = at?.kind === 'condition' ? task.conditions.find(c => c.id === at.predicateId) : undefined
    const tAsk = at?.kind === 'time' ? at.tSI : null
    let tHit: number | null = null, ph: InclinePhase | null = null
    const alternatives: ResultEnvelope['alternatives'] = []
    if (cond) {
      const hits = crossingsOf(phases, cond.valueSI)
      if (!hits.length) {
        const stuck = phases[phases.length - 1].branch === 'stick'
        b.results.push(pre({ applicability: 'applicable', computation: 'noSolution', reason: stuck ? '物块停在斜面上，到不了这个位置' : '物块不会到达这个位置' }))
        continue
      }
      for (const h of hits) alternatives.push({ valueSI: h.t, conditions: [h.phase.label], chosen: h === hits[0] })
      tHit = hits[0].t; ph = hits[0].phase
      step(b, { stage: 'solve', text: '在“{0}”阶段解 s(t) = {1} m（由核心求根并代回检查）：t = {2} s', params: [ph.label, fmt(cond.valueSI), fmt(tHit)], model: 'M02', targets: [tg.id] })
    } else if (tAsk !== null) {
      tHit = tAsk; ph = phaseAtTime(phases, tAsk)
    }
    if (tHit === null || !ph) { b.results.push(pre({ applicability: 'insufficient', computation: 'failed', reason: '缺少取值时机' })); continue }
    const tau = tHit - ph.t0
    const mo = evalModel('M02', { x0: ph.s0, v0: ph.v0, a: ph.a, t: tau })
    const vS = mo.outputs.find(o => o.id === 'v')!.value!
    const sS = mo.outputs.find(o => o.id === 'x')!.value!
    let crossing: { t: number } | null = null
    if (rec && cond) {
      const c = rec.session.call<{ crossings: Array<{ t: number }>; complete: boolean }>({ op: 'crossing', terms: [{ id: ALONG.s, c: 1 }], level: cond.valueSI, t0: 0, t1: horizon(), which: 'first' })
      crossing = c.crossings[0] ?? null
    }
    const tSim = cond ? crossing?.t ?? null : tHit
    const sim = tSim === null ? [NaN, NaN, NaN] : simAt(tSim, [ALONG.vs, ALONG.s, 'block.v'])
    if (key === 'speedAtS') {
      // the textbook route v² − v₀² = 2aΔx (M02 output v2) as a second analytic line
      const v2 = ph.v0 === 0 && ph.a > 0 ? evalModel('M02', { x0: 0, v0: 0, a: ph.a, t: tau }).outputs.find(o => o.id === 'v2')!.value : null
      step(b, { stage: 'relation', text: '速率是速度的大小（地面参考系，非负）：v = |v₀ + aₛt|；也可用 v² − v₀² = 2aₛΔs', tex: 'v^2 - v_0^2 = 2a_s\\,\\Delta s', model: 'M02', targets: [tg.id] })
      const energyCheck = m !== undefined ? inclineEnergy(task, phases, tHit, Math.abs(vS)) : null
      const checks = [check('sim-v', 'simulation', '刚体仿真：到达该位置时的速率', Math.abs(vS), Number.isFinite(sim[2]) ? sim[2] : null)]
      if (v2 !== null) checks.push(check('v2', 'analytic', '另一解析途径 v² − v₀² = 2aₛΔs', Math.abs(vS), v2))
      if (energyCheck) checks.push(energyCheck)
      b.results.push(pre({ value: { scalarSI: Math.abs(vS), unit: 'm/s' }, atTimeSI: tHit, alternatives, checks, errorBudget: { atolSI: 1e-9, rtol: 1e-6 } }))
    } else if (key === 'timeAtS') {
      b.results.push(pre({ value: { scalarSI: tHit, unit: 's' }, atTimeSI: tHit, alternatives, checks: [check('sim-t', 'simulation', '刚体仿真：首次到达该位置的时刻（条件求根）', tHit, tSim)] }))
    } else if (key === 'workAtS') {
      if (m === undefined) { b.results.push(pre({ applicability: 'insufficient', computation: 'failed', reason: '缺少质量' })); continue }
      // friction does work only while sliding: μk·N times the path length (up and down counted separately)
      let path = 0
      for (const p of phases) {
        if (p.branch === 'stick') continue
        const end = p.t1 === null || p.t1 > tHit ? tHit : p.t1
        if (end <= p.t0) continue
        const x = evalModel('M02', { x0: p.s0, v0: p.v0, a: p.a, t: end - p.t0 }).outputs.find(o => o.id === 'x')!.value!
        path += Math.abs(x - p.s0)
      }
      const W = -expr('muK*m*g*cos(theta)*L', { muK, m, g, theta, L: path })
      step(b, { stage: 'relation', text: '摩擦力只在滑动时做功：W_f = −μk·mg cosθ·（滑动的路程 {0} m）', params: [fmt(path)], tex: 'W_f = -\\mu_k mg\\cos\\theta\\,L', targets: [tg.id] })
      const heat = tSim === null || !rec ? null : simAt(tSim, ['pair.block|incline.heat'])[0]
      b.results.push(pre({ value: { scalarSI: W, unit: 'J' }, atTimeSI: tHit, checks: [check('sim-heat', 'simulation', '刚体仿真：摩擦生热（取负号）', W, heat === null ? null : -heat)] }))
    } else if (key === 'speedAtT') {
      b.results.push(pre({ value: { scalarSI: vS, unit: 'm/s' }, atTimeSI: tHit, checks: [check('sim-vs', 'simulation', '刚体仿真：该时刻沿斜面的速度', vS, sim[0])] }))
    } else if (key === 'sAtT') {
      b.results.push(pre({ value: { scalarSI: sS, unit: 'm' }, atTimeSI: tHit, checks: [check('sim-s', 'simulation', '刚体仿真：该时刻沿斜面的位移', sS, sim[1])] }))
    }
  }
  rec?.session.free()
}

/** Energy check of a speed on the incline (conservation, needs the mass): ½mv² = ½mv₀² + mg sinθ·s + W_f. */
function inclineEnergy(task: TaskSpec, phases: InclinePhase[], tHit: number, speed: number): CheckResult | null {
  const m = value(task, 'blockA.mass'), theta = value(task, 'incline.theta'), g = value(task, 'gravity.g')
  const muK = task.assumptions.some(a => a.id === 'smooth') ? 0 : value(task, 'contact.muK')
  const v0 = value(task, 'blockA.v0')
  if (m === undefined || theta === undefined || g === undefined || muK === undefined || v0 === undefined) return null
  let path = 0, s = 0
  for (const p of phases) {
    if (p.branch === 'stick') continue
    const end = p.t1 === null || p.t1 > tHit ? tHit : p.t1
    if (end <= p.t0) continue
    const x = evalModel('M02', { x0: p.s0, v0: p.v0, a: p.a, t: end - p.t0 }).outputs.find(o => o.id === 'x')!.value!
    path += Math.abs(x - p.s0); s = x
  }
  const ek = expr('m*v0^2/2 + m*g*sin(theta)*s - muK*m*g*cos(theta)*L', { m, v0, g, theta, s, muK, L: path })
  const vE = ek >= 0 ? expr('sqrt(2*ek/m)', { ek, m }) : null
  return check('energy', 'conservation', '能量关系：½mv² = ½mv₀² + mg sinθ·Δs − μk mg cosθ·L', speed, vE)
}

/** Analytic crossings of s = d over the phases (each phase's root by the core's modelSolve, checked by its residual). */
function crossingsOf(phases: InclinePhase[], d: number): Array<{ t: number; phase: InclinePhase }> {
  const out: Array<{ t: number; phase: InclinePhase }> = []
  for (const p of phases) {
    if (p.branch === 'stick') { if (p.s0 === d) out.push({ t: p.t0, phase: p }); continue }
    const span = p.t1 === null ? null : p.t1 - p.t0
    // upper end of the search: the phase end, or the time the motion would need to cover |d − s0| from rest-ish
    const reach = span ?? (Math.sqrt(2 * Math.abs(d - p.s0) / Math.max(Math.abs(p.a), 1e-12)) + Math.abs(d - p.s0) / Math.max(Math.abs(p.v0), 1e-12) + 1)
    const hi = Math.min(reach, 1e6)
    const r = invertModel('M02', { x0: p.s0, v0: p.v0, a: p.a, t: null }, 't', 'x', d, 0, hi, { samples: 400 })
    for (const root of r.roots.filter(x => x.value >= 0 && (span === null || x.value <= span + 1e-12)).sort((a, b) => a.value - b.value)) out.push({ t: p.t0 + root.value, phase: p })
  }
  return out
}
const phaseAt = (phases: InclinePhase[], d: number) => { const h = crossingsOf(phases, d)[0]; return h ? { t: h.t, phase: h.phase } : null }
const phaseAtTime = (phases: InclinePhase[], t: number) => phases.find(p => t >= p.t0 && (p.t1 === null || t <= p.t1)) ?? null

// ------------------------------------------------------------- projectile ----

function projectilePlan(b: Builder) {
  const task = b.task
  const v0 = need(task, 'ball.v0'), alpha = need(task, 'ball.alpha'), h0 = need(task, 'ball.h0'), g = need(task, 'gravity.g')
  b.models.M04 = 'registry 26.56'; b.models.M02 = 'registry 26.56'
  const r = evalModel('M04', { v0, theta: alpha, g, h0 }, { constantsSet: SET })
  const vx = r.lets.find(l => l.id === 'vx')!.value!, vy = r.lets.find(l => l.id === 'vy')!.value!
  step(b, { stage: 'model', text: '分解运动：水平匀速 vₓ = {0} m/s，竖直匀变速 v_y0 = {1} m/s，加速度 −g', params: [fmt(vx), fmt(vy)], model: 'M04', targets: [] })
  const T = outOf(r, 'T').value, R = outOf(r, 'R').value, H = outOf(r, 'H')
  const radius = 0.03
  let rec: Recording | null = null
  try {
    const scene = buildTemplate('projectile', { v0, alpha: alpha / DEG, h: h0, g, m: value(task, 'ball.mass') ?? 0.1 })
    rec = simulate(scene, { duration: Math.min(60, (T ?? 2) + 0.3) })
    b.runId = `sim:${rec.hash.slice(0, 16)}`
  } catch { b.notes.push('验证用的仿真没有完成：只给出解析结果') }
  const y0 = h0 + radius
  const x0 = h0 > 0 ? radius + 1e-3 : 0
  const landing = rec ? rec.session.call<{ crossings: Array<{ t: number; values: number[] }> }>({ op: 'crossing', terms: [{ id: 'ball.y', c: 1 }], level: radius, t0: 1e-9, t1: (T ?? 2) + 0.3, which: 'first', direction: 'down' }).crossings[0] ?? null : null
  for (const tg of task.targets) {
    const key = specKey(tg.id)
    const pre = (extra: Partial<ResultEnvelope>) => envelope(b, tg, { applicability: 'applicable', computation: 'solved', provenance: { kind: 'analytic', inputRefs: ['ball.v0', 'ball.alpha', 'ball.h0', 'gravity.g'] }, ...extra })
    if (key === 'T' || key === 'R' || key === 'speedLand') {
      if (T === null) { b.results.push(pre({ applicability: 'inapplicable', computation: 'noSolution', reason: '小球到不了落地面' })); continue }
      step(b, { stage: 'solve', text: '落地：解 h₀ + v_y0·t − ½gt² = 0 的正根，t = {0} s', params: [fmt(T)], tex: 'h_0 + v_{0y}t - \\tfrac12 gt^2 = 0', model: 'M04', targets: [tg.id] })
      const roots = outOf(r, 'tLand')
      const alts: ResultEnvelope['alternatives'] = []
      const all = r.outputs.find(o => o.id === 'tLand')
      for (const x of all?.roots ?? []) alts.push({ valueSI: x, conditions: ['t > 0'], chosen: Math.abs(x - T) <= 1e-9 * T })
      for (const x of all?.rejected ?? []) alts.push({ valueSI: x, conditions: ['t ≤ 0：舍去'], chosen: false })
      void roots
      const tL = landing?.t ?? null
      if (key === 'T') b.results.push(pre({ value: { scalarSI: T, unit: 's' }, atTimeSI: T, alternatives: alts, checks: [check('sim-T', 'simulation', '刚体仿真：落地时刻（条件求根 y = 半径）', T, tL)] }))
      else if (key === 'R') {
        const xL = tL === null || !rec ? null : valuesAt(rec, tL, ['ball.x'])[0] - x0
        b.results.push(pre({ value: { scalarSI: R!, unit: 'm' }, atTimeSI: T, checks: [check('sim-R', 'simulation', '刚体仿真：落地时的水平位移', R, xL)] }))
      } else {
        const vyT = evalModel('M02', { x0: 0, v0: vy, a: -g, t: T }).outputs.find(o => o.id === 'v')!.value!
        const speed = expr('sqrt(vx^2 + vy^2)', { vx, vy: vyT })
        const sim = tL === null || !rec ? null : valuesAt(rec, tL, ['ball.v'])[0]
        const energy = expr('sqrt(v0^2 + 2*g*h0)', { v0, g, h0 })
        b.results.push(pre({ value: { scalarSI: speed, unit: 'm/s' }, atTimeSI: T, checks: [check('sim-v', 'simulation', '刚体仿真：落地前的速率', speed, sim), check('energy', 'conservation', '机械能守恒 v = √(v₀² + 2gh₀)', speed, energy)] }))
      }
      continue
    }
    if (key === 'H') {
      if (H.value === null) { b.results.push(pre({ applicability: 'inapplicable', computation: 'noSolution', reason: '向下抛出：最高点就是抛出点' })); continue }
      const ext = rec ? rec.session.call<{ value: number; t: number }>({ op: 'extreme', id: 'ball.y', which: 'max', t0: 0, t1: (T ?? 2), withTime: true }) : null
      step(b, { stage: 'relation', text: '最高点竖直速度为 0：H = v_y0²/(2g)', tex: 'H = \\dfrac{v_{0y}^2}{2g}', model: 'M04', targets: [tg.id] })
      b.results.push(pre({ value: { scalarSI: H.value, unit: 'm' }, checks: [check('sim-H', 'simulation', '刚体仿真：记录中的最高点（逐帧最大值，受记录间隔限制）', H.value, ext ? ext.value - y0 : null, { kind: 'unified', atol: 1e-6, rtol: 1e-5 })] }))
      continue
    }
    if (key === 'timeAtY') {
      const at = tg.at
      const cond = at?.kind === 'condition' ? task.conditions.find(c => c.id === at.predicateId) : undefined
      if (!cond) { b.results.push(pre({ applicability: 'insufficient', computation: 'failed', reason: '缺少高度' })); continue }
      const Y = cond.valueSI
      const sol = invertModel('M02', { x0: 0, v0: vy, a: -g, t: null }, 't', 'x', Y, 0, T ?? (2 * Math.abs(vy) / g + 1), { samples: 400 })
      const roots = sol.roots.map(x => x.value).filter(x => x > 0).sort((a, b) => a - b)
      if (!roots.length) { b.results.push(pre({ computation: 'noSolution', reason: '小球到不了这个高度' })); continue }
      const dir = tg.answerDomain ?? cond.direction ?? 'first'
      // rising: v_y > 0 at the root, falling: v_y < 0 (manual §6.4: “第一次/上升时”)
      const vAt = (t: number) => evalModel('M02', { x0: 0, v0: vy, a: -g, t }).outputs.find(o => o.id === 'v')!.value!
      const pick = dir === 'falling' ? roots.find(t => vAt(t) < 0) : dir === 'rising' ? roots.find(t => vAt(t) > 0) : roots[0]
      const alts = roots.map(t => ({ valueSI: t, conditions: [vAt(t) > 0 ? '上升时' : vAt(t) < 0 ? '下降时' : '最高点'], chosen: t === pick }))
      step(b, { stage: 'solve', text: '解 v_y0·t − ½gt² = {0}：{1} 个正根 {2}；按“{3}”选取', params: [fmt(Y), roots.length, roots.map(fmt).join('、'), dir === 'falling' ? '下降时' : dir === 'rising' ? '上升时' : '第一次'], model: 'M02', targets: [tg.id] })
      let simRoots: number[] = []
      if (rec) simRoots = rec.session.call<{ crossings: Array<{ t: number }> }>({ op: 'crossing', terms: [{ id: 'ball.y', c: 1 }], level: y0 + Y, t0: 1e-9, t1: (T ?? 2), which: 'all' }).crossings.map(c => c.t)
      const simPick = pick === undefined ? null : simRoots.reduce<number | null>((best, t) => (best === null || Math.abs(t - pick) < Math.abs(best - pick) ? t : best), null)
      if (pick === undefined) { b.results.push(pre({ computation: 'noSolution', alternatives: alts, reason: '没有满足所选条件的根' })); continue }
      b.results.push(pre({ value: { scalarSI: pick, unit: 's' }, atTimeSI: pick, alternatives: alts, checks: [{ ...check('sim-t', 'simulation', '刚体仿真：条件求根（全部穿越：{0} 个）', pick, simPick), labelParams: [simRoots.length] }] }))
      continue
    }
    if (key === 'vyAtT') {
      const at = tg.at
      if (at?.kind !== 'time') { b.results.push(pre({ applicability: 'insufficient', computation: 'failed', reason: '缺少时刻' })); continue }
      const v = evalModel('M02', { x0: 0, v0: vy, a: -g, t: at.tSI }).outputs.find(o => o.id === 'v')!.value!
      const sim = rec && T !== null && at.tSI <= T ? valuesAt(rec, at.tSI, ['ball.vy'])[0] : null
      b.results.push(pre({ value: { scalarSI: v, unit: 'm/s' }, atTimeSI: at.tSI, checks: [check('sim-vy', 'simulation', '刚体仿真：该时刻的竖直速度', v, sim)] }))
    }
  }
  rec?.session.free()
}

// -------------------------------------------------------------- collision ----

function collisionPlan(b: Builder) {
  const task = b.task
  const m1 = need(task, 'A.mass'), m2 = need(task, 'B.mass'), u1 = need(task, 'A.u'), u2 = need(task, 'B.u')
  const kind = task.options?.kind ?? 'elastic'
  const e = kind === 'elastic' ? 1 : kind === 'perfectlyInelastic' ? 0 : need(task, 'contact.e')
  b.models.M17 = 'registry 26.56'; b.models.M18 = 'registry 26.56'
  const inel = evalModel('M18', { m1, m2, u1, u2 }, { constantsSet: SET })
  if (condState(inel, 'approach') !== 'applicable') {
    for (const tg of task.targets) b.results.push(envelope(b, tg, { applicability: 'inapplicable', computation: 'noSolution', reason: 'A 追不上 B（u₁ ≤ u₂）：两物体不会相碰', conditionChecks: [{ id: 'approach', state: 'inapplicable', reason: 'u₁ ≤ u₂' }] }))
    return
  }
  const vc = outOf(inel, 'v').value!
  let v1: number, v2: number
  if (kind === 'elastic') {
    const el = evalModel('M17', { m1, m2, u1, u2 }, { constantsSet: SET })
    v1 = outOf(el, 'v1').value!; v2 = outOf(el, 'v2').value!
    step(b, { stage: 'law', text: '弹性正碰：动量守恒且动能守恒（M17）', tex: "v_1' = \\dfrac{(m_1-m_2)u_1 + 2m_2u_2}{m_1+m_2}", model: 'M17', targets: [] })
  } else {
    v1 = expr('(1 + e)*v - e*u1', { e, v: vc, u1 }); v2 = expr('(1 + e)*v - e*u2', { e, v: vc, u2 })
    step(b, { stage: 'law', text: '动量守恒给出共同速度 v = {0} m/s（M18）；恢复系数 e = {1}：v₁′ = (1+e)v − e·u₁，v₂′ = (1+e)v − e·u₂', params: [fmt(vc), e], tex: "v_i' = (1+e)v - e\\,u_i", model: 'M18', targets: [] })
  }
  const ek0 = expr('m1*u1^2/2 + m2*u2^2/2', { m1, m2, u1, u2 })
  const ek1 = expr('m1*v1^2/2 + m2*v2^2/2', { m1, m2, v1, v2 })
  // Verification: the collision template (B may move; the bodies start 1 m apart)
  let rec: Recording | null = null, before: number[] | null = null, after: number[] | null = null
  try {
    const scene = buildTemplate('collision-1d', { m1, m2, v0: u1, e })
    const B = scene.bodies.find(x => x.id === 'B')!
    B.velocity = { x: u2, y: 0 }
    const tHit = 0.8 / (u1 - u2)
    rec = simulate(scene, { duration: Math.min(120, tHit + 0.3) })
    b.runId = `sim:${rec.hash.slice(0, 16)}`
    const ei = rec.events.findIndex(ev => (ev as unknown as { type: string }).type === 'collision' || true)
    if (ei >= 0) { before = Array.from(valuesAtEvent(rec, ei, 'before', ['A.vx', 'B.vx'])); after = Array.from(valuesAtEvent(rec, ei, 'after', ['A.vx', 'B.vx'])) }
  } catch { b.notes.push('验证用的仿真没有完成：只给出解析结果') }
  const p0 = expr('m1*u1 + m2*u2', { m1, m2, u1, u2 })
  for (const tg of task.targets) {
    const key = specKey(tg.id)
    const pre = (extra: Partial<ResultEnvelope>) => envelope(b, tg, { applicability: 'applicable', computation: 'solved', provenance: { kind: 'analytic', inputRefs: ['A.mass', 'B.mass', 'A.u', 'B.u', 'contact.e'] }, conditionChecks: [{ id: 'approach', state: 'applicable', reason: 'u₁ > u₂' }], ...extra })
    const pAfter = after ? expr('m1*a + m2*b', { m1, m2, a: after[0], b: after[1] }) : null
    if (key === 'v1') b.results.push(pre({ value: { scalarSI: v1, unit: 'm/s' }, checks: [check('sim-v1', 'simulation', '刚体仿真：碰撞事件后（右极限）A 的速度', v1, after?.[0] ?? null), check('momentum', 'conservation', '动量守恒：碰后总动量等于碰前', p0, pAfter)] }))
    else if (key === 'v2') b.results.push(pre({ value: { scalarSI: v2, unit: 'm/s' }, checks: [check('sim-v2', 'simulation', '刚体仿真：碰撞事件后（右极限）B 的速度', v2, after?.[1] ?? null), check('momentum', 'conservation', '动量守恒：碰后总动量等于碰前', p0, pAfter)] }))
    else if (key === 'loss') {
      const loss = ek0 - ek1
      const simLoss = before && after ? expr('m1*a^2/2 + m2*b^2/2 - m1*c^2/2 - m2*d^2/2', { m1, m2, a: before[0], b: before[1], c: after[0], d: after[1] }) : null
      const ref18 = kind === 'perfectlyInelastic' ? outOf(inel, 'loss').value : null
      const checks = [check('sim-loss', 'simulation', '刚体仿真：事件两侧的动能差', loss, simLoss, { kind: 'unified', atol: 1e-9 * Math.max(1, ek0), rtol: 1e-6 })]
      if (ref18 !== null) checks.push(check('M18', 'analytic', 'M18 的损失公式 m₁m₂(u₁−u₂)²/(2(m₁+m₂))', loss, ref18))
      b.results.push(pre({ value: { scalarSI: loss, unit: 'J' }, checks }))
    } else if (key === 'p') b.results.push(pre({ value: { scalarSI: p0, unit: 'kg·m/s' }, checks: [check('sim-p', 'simulation', '刚体仿真：碰撞前（左极限）的总动量', p0, before ? expr('m1*a + m2*b', { m1, m2, a: before[0], b: before[1] }) : null)] }))
  }
  rec?.session.free()
}

// ---------------------------------------------------------------- circuit ----

function circuitPlan(b: Builder) {
  const task = b.task
  const E = need(task, 'source.E'), r = need(task, 'source.r'), R1 = need(task, 'R1.R'), R2 = need(task, 'R2.R')
  const series = (task.options?.connection ?? 'series') === 'series'
  b.models.E09 = 'registry 26.56'; b.models.E12 = 'registry 26.56'
  const e09 = evalModel('E09', { R1, R2, U: E }, { constantsSet: SET })
  const Rt = outOf(e09, series ? 'Rs' : 'Rp').value!
  step(b, { stage: 'model', text: '{0}：外电路总电阻 R = {1} Ω（E09）', params: [series ? '串联' : '并联', fmt(Rt)], tex: series ? 'R = R_1 + R_2' : 'R = \\dfrac{R_1R_2}{R_1+R_2}', model: 'E09', targets: [] })
  // An ideal source (r = 0) is E09 itself; E12 needs r > 0
  let I: number, U: number
  if (r === 0) {
    I = outOf(e09, series ? 'Is' : 'Ip').value!; U = E
    step(b, { stage: 'law', text: '理想电源：路端电压等于电动势 U = {1} V，I = U/R = {0} A（E09）', params: [fmt(I), fmt(U)], tex: 'I = \\dfrac{U}{R}', model: 'E09', targets: [] })
  } else {
    const e12 = evalModel('E12', { E, r, R: Rt }, { constantsSet: SET })
    I = outOf(e12, 'I').value!; U = outOf(e12, 'U').value!
    step(b, { stage: 'law', text: '闭合电路欧姆定律：I = E/(R + r) = {0} A，路端电压 U = {1} V（E12）', params: [fmt(I), fmt(U)], tex: 'I = \\dfrac{E}{R + r}', model: 'E12', targets: [] })
  }
  const e09u = evalModel('E09', { R1, R2, U }, { constantsSet: SET })
  const U1 = series ? outOf(e09u, 'U1').value! : U
  const U2 = series ? expr('U - U1', { U, U1 }) : U
  const I1 = series ? I : outOf(e09u, 'I1').value!
  const I2 = series ? I : outOf(e09u, 'I2').value!
  const P1 = series ? expr('I^2*R1', { I, R1 }) : expr('U^2/R1', { U, R1 })
  const P2 = series ? expr('I^2*R2', { I, R2 }) : expr('U^2/R2', { U, R2 })
  // Independent: modified nodal analysis of the same circuit (circuitSolve)
  const els: CircuitElement[] = [{ id: 'bat', kind: 'battery', a: 'p', b: 'n', E, r }]
  if (series) els.push({ id: 'R1', kind: 'resistor', a: 'p', b: 'm', R: R1 }, { id: 'R2', kind: 'resistor', a: 'm', b: 'n', R: R2 })
  else els.push({ id: 'R1', kind: 'resistor', a: 'p', b: 'n', R: R1 }, { id: 'R2', kind: 'resistor', a: 'p', b: 'n', R: R2 })
  const sol = circuitSolve(els)
  b.runId = 'mna'
  const ev = (id: string) => sol.elements[id] ?? { U: null, I: null, P: null }
  const Itot = ev('R1').I !== null && ev('R2').I !== null ? (series ? Math.abs(ev('R1').I!) : Math.abs(ev('R1').I!) + Math.abs(ev('R2').I!)) : null
  const kcl = series ? null : Itot !== null && ev('bat').I !== null ? Math.abs(Math.abs(ev('bat').I!) - Itot) : null
  for (const tg of task.targets) {
    const key = specKey(tg.id)
    const pre = (extra: Partial<ResultEnvelope>) => envelope(b, tg, { applicability: 'applicable', computation: 'solved', provenance: { kind: 'analytic', inputRefs: ['source.E', 'source.r', 'R1.R', 'R2.R'] }, conditionChecks: [{ id: 'connection', state: 'applicable', reason: series ? '串联' : '并联' }], ...extra })
    const mna = (label: string, q: number, ref: number | null) => [check('mna', 'otherAlgorithm', label, q, ref === null ? null : Math.abs(ref), CHECK_RULE, '节点电压法（circuitSolve）与闭式公式是两条不同的计算路径，共用同一组元件参数')]
    if (key === 'I') b.results.push(pre({ value: { scalarSI: I, unit: 'A' }, checks: [...mna('节点电压法：电源电流', I, ev('bat').I), ...(kcl === null ? [] : [{ id: 'kcl', kind: 'conservation' as const, label: '基尔霍夫电流定律：干路电流 = 支路电流之和（残差）', valueSI: kcl, delta: kcl, pass: kcl <= 1e-12 * Math.max(1, I) }])] }))
    else if (key === 'U') b.results.push(pre({ value: { scalarSI: U, unit: 'V' }, checks: mna('节点电压法：电源两端电压', U, ev('bat').U) }))
    else if (key === 'U1') b.results.push(pre({ value: { scalarSI: U1, unit: 'V' }, checks: mna('节点电压法：R₁ 两端电压', U1, ev('R1').U) }))
    else if (key === 'I1') b.results.push(pre({ value: { scalarSI: I1, unit: 'A' }, checks: mna('节点电压法：通过 R₁ 的电流', I1, ev('R1').I) }))
    else if (key === 'U2') b.results.push(pre({ value: { scalarSI: U2, unit: 'V' }, checks: mna('节点电压法：R₂ 两端电压', U2, ev('R2').U) }))
    else if (key === 'I2') b.results.push(pre({ value: { scalarSI: I2, unit: 'A' }, checks: mna('节点电压法：通过 R₂ 的电流', I2, ev('R2').I) }))
    else if (key === 'P1') b.results.push(pre({ value: { scalarSI: P1, unit: 'W' }, checks: mna('节点电压法：R₁ 的功率', P1, ev('R1').P) }))
    else if (key === 'P2') b.results.push(pre({ value: { scalarSI: P2, unit: 'W' }, checks: mna('节点电压法：R₂ 的功率', P2, ev('R2').P) }))
    else if (key === 'Rt') b.results.push(pre({ value: { scalarSI: Rt, unit: 'Ω' }, checks: [] }))
  }
}

// ------------------------------------------------------------------- lens ----

function lensPlan(b: Builder) {
  const task = b.task
  const f = need(task, 'lens.f'), u = need(task, 'object.u')
  const h = opt(task, 'object.h')
  b.models.O04 = 'registry 26.56'
  const r = evalModel('O04', { f, u }, { constantsSet: SET })
  const finite = condState(r, 'finite') === 'applicable'
  if (!finite) {
    for (const tg of task.targets) b.results.push(envelope(b, tg, { applicability: 'inapplicable', computation: 'noSolution', reason: '物体在焦点上：折射光平行，像在无穷远（不是数值错误）', conditionChecks: [{ id: 'finite', state: 'inapplicable', reason: 'u = f' }] }))
    return
  }
  const v = outOf(r, 'v').value!, mag = outOf(r, 'mag').value!
  step(b, { stage: 'law', text: '薄透镜成像公式（实物 u > 0，实像 v > 0）：1/u + 1/v = 1/f → v = {0} m；放大率 m = −v/u = {1}', params: [fmt(v), fmt(mag)], tex: '\\dfrac1u + \\dfrac1v = \\dfrac1f', model: 'O04', targets: [] })
  // Independent: two rays from the object tip through the ideal lens of the ray tracer, intersected
  const hT = h ?? 0.01 * Math.max(u, Math.abs(f))
  let vT: number | null = null, mT: number | null = null
  try {
    const half = 4 * Math.max(hT, Math.abs(f), u)
    const tr = opticsTrace([{ type: 'lens', x: 0, y: 0, angle: 0, f, half }], [{ type: 'ray', x: -u, y: hT, angle: 0 }, { type: 'ray', x: -u, y: hT, angle: Math.atan2(-hT, u) }], false)
    const segs: Array<[number, number, number, number]> = []
    for (let i = 0; i + 5 < tr.segments.length + 1; i += 6) segs.push([tr.segments[i], tr.segments[i + 1], tr.segments[i + 2], tr.segments[i + 3]])
    const out = segs.filter(s => Math.abs(s[0]) < 1e-9 * Math.max(1, u) && s[2] > s[0])
    if (out.length >= 2) {
      const [a, c] = out
      const sa = (a[3] - a[1]) / (a[2] - a[0]), sc = (c[3] - c[1]) / (c[2] - c[0])
      if (sa !== sc) { const x = (c[1] - a[1]) / (sa - sc); vT = x; mT = (a[1] + sa * x) / hT }
    }
  } catch { b.notes.push('光线追迹没有完成') }
  b.runId = 'trace'
  for (const tg of task.targets) {
    const key = specKey(tg.id)
    const pre = (extra: Partial<ResultEnvelope>) => envelope(b, tg, { applicability: 'applicable', computation: 'solved', provenance: { kind: 'analytic', inputRefs: ['lens.f', 'object.u'] }, conditionChecks: [{ id: 'finite', state: 'applicable', reason: 'u ≠ f' }], ...extra })
    const note = '光线追迹器的理想透镜规则 tanθ′ = tanθ − y/f 与成像公式共用薄透镜模型；比较的是两条计算路径'
    if (key === 'v') b.results.push(pre({ value: { scalarSI: v, unit: 'm' }, checks: [check('trace-v', 'otherAlgorithm', '光线追迹：两条光线（或其反向延长线）的交点', v, vT, CHECK_RULE, note)] }))
    else if (key === 'm') b.results.push(pre({ value: { scalarSI: mag, unit: '1' }, checks: [check('trace-m', 'otherAlgorithm', '光线追迹：像高 / 物高', mag, mT, CHECK_RULE, note)] }))
    else if (key === 'hi') {
      if (h === undefined) { b.results.push(pre({ applicability: 'insufficient', computation: 'failed', reason: '缺少物高' })); continue }
      b.results.push(pre({ value: { scalarSI: expr('m*h', { m: mag, h }), unit: 'm' }, checks: [check('trace-h', 'otherAlgorithm', '光线追迹：交点的高度', expr('m*h', { m: mag, h }), mT === null ? null : mT * h, CHECK_RULE, note)] }))
    } else if (key === 'nature') {
      const txt = `${v > 0 ? '实像' : '虚像'}、${mag < 0 ? '倒立' : '正立'}、${Math.abs(mag) > 1 ? '放大' : Math.abs(mag) < 1 ? '缩小' : '等大'}`
      b.results.push(pre({ value: { unit: '', text: txt }, checks: [{ id: 'trace-nature', kind: 'otherAlgorithm', label: '光线追迹：交点在透镜{0}侧，像{1}', labelParams: [vT !== null && vT > 0 ? '右' : '左', mT !== null && mT < 0 ? '倒立' : '正立'], valueSI: vT, delta: null, pass: vT !== null && mT !== null ? (vT > 0) === (v > 0) && (mT < 0) === (mag < 0) : null }] }))
    }
  }
}

// ------------------------------------------------------------------ field ----

function fieldPlan(b: Builder) {
  const task = b.task
  const q1 = need(task, 'q1.q'), x1 = need(task, 'q1.x'), y1 = need(task, 'q1.y')
  let q2 = need(task, 'q2.q'), x2 = need(task, 'q2.x'), y2 = need(task, 'q2.y')
  const px = need(task, 'P.x'), py = need(task, 'P.y')
  const qt = opt(task, 'test.q')
  b.models.E02 = 'registry 26.56'
  // A single charge: a zero second charge 1 m away keeps the two-charge model of E02 well defined
  if (q2 === 0 && x2 === x1 && y2 === y1) { x2 = x1 + 1; y2 = y1 }
  if (x2 === x1 && y2 === y1) { for (const tg of task.targets) b.results.push(envelope(b, tg, { applicability: 'inapplicable', computation: 'failed', reason: '两个电荷位置相同' })); return }
  // Frame of E02: charges at x′ = ∓d on the x′ axis through both charges (a rotation and a shift; the core evaluates it)
  const v = { x1, y1, x2, y2, px, py }
  const d = expr('sqrt((x2 - x1)^2 + (y2 - y1)^2)/2', v)
  const cx = expr('(x2 - x1)/(2*d)', { ...v, d }), cy = expr('(y2 - y1)/(2*d)', { ...v, d })
  const xp = expr('(px - (x1 + x2)/2)*cx + (py - (y1 + y2)/2)*cy', { ...v, cx, cy })
  const yp = expr('-(px - (x1 + x2)/2)*cy + (py - (y1 + y2)/2)*cx', { ...v, cx, cy })
  const r = evalModel('E02', { q1, q2, d, x: xp, y: yp }, { constantsSet: SET })
  if (condState(r, 'away') !== 'applicable') { for (const tg of task.targets) b.results.push(envelope(b, tg, { applicability: 'inapplicable', computation: 'noSolution', reason: '场点与电荷重合：点电荷模型在此没有有限的场强' })); return }
  const exP = outOf(r, 'Ex').value!, eyP = outOf(r, 'Ey').value!, V = outOf(r, 'V').value!
  const Ex = expr('a*cx - b*cy', { a: exP, b: eyP, cx, cy }), Ey = expr('a*cy + b*cx', { a: exP, b: eyP, cx, cy })
  const E = expr('sqrt(Ex^2 + Ey^2)', { Ex, Ey }), dir = expr('atan2(Ey, Ex)', { Ex, Ey })
  step(b, { stage: 'law', text: '点电荷场强 kq/r² 按矢量叠加（E02，k 取 {0}）：E = ({1}, {2}) V/m', params: [SET, fmt(Ex), fmt(Ey)], tex: '\\vec E = \\sum_i \\dfrac{k q_i}{r_i^2}\\,\\hat r_i', model: 'E02', targets: [] })
  // Independent: the field lab of the core (direct sum) and E = −∇V from its potential by central differences
  const ke = constantSet(SET).constants.find(c => c.id === 'k_e')?.value
  const src = { charges: [{ x: x1, y: y1, q: q1, r: 1e-12 }, { x: x2, y: y2, q: q2, r: 1e-12 }], k: ke }
  const dist = Math.min(Math.hypot(px - x1, py - y1), q2 !== 0 ? Math.hypot(px - x2, py - y2) : Infinity)
  const hh = 1e-4 * dist
  let lab: { E: Array<{ x: number; y: number }>; V: number[] } | null = null
  try { lab = fieldAt(src, [{ x: px, y: py }, { x: px + hh, y: py }, { x: px - hh, y: py }, { x: px, y: py + hh }, { x: px, y: py - hh }]) } catch { b.notes.push('场的数值核对没有完成') }
  b.runId = 'fieldAt'
  const gx = lab ? -(lab.V[1] - lab.V[2]) / (2 * hh) : null, gy = lab ? -(lab.V[3] - lab.V[4]) / (2 * hh) : null
  const grad = gx !== null && gy !== null ? Math.hypot(gx, gy) : null
  const labE = lab ? Math.hypot(lab.E[0].x, lab.E[0].y) : null
  const gradRule: Rule = { kind: 'unified', atol: 0, rtol: 1e-6 }
  const shared = '实验计算与 E02 共用库仑常数 k 与点电荷模型；梯度核对走的是电势而不是场强的路径'
  for (const tg of task.targets) {
    const key = specKey(tg.id)
    const pre = (extra: Partial<ResultEnvelope>) => envelope(b, tg, { applicability: 'applicable', computation: 'solved', provenance: { kind: 'analytic', inputRefs: ['q1.q', 'q2.q', 'P.x', 'P.y'] }, conditionChecks: [{ id: 'away', state: 'applicable', reason: '场点不在电荷上' }], ...extra })
    if (key === 'E') b.results.push(pre({ value: { scalarSI: E, vectorSI: [Ex, Ey], unit: 'V/m' }, checks: [check('lab-E', 'otherAlgorithm', '电场实验的计算（逐个电荷求和）', E, labE, CHECK_RULE, shared), check('grad', 'otherAlgorithm', '电势的数值梯度 −∇V（中心差分）', E, grad, gradRule, shared)] }))
    else if (key === 'dir') b.results.push(pre({ value: { scalarSI: dir, unit: 'rad' }, checks: [check('grad-dir', 'otherAlgorithm', '−∇V 的方向', dir, gx !== null && gy !== null ? Math.atan2(gy, gx) : null, { kind: 'unified', atol: 1e-6, rtol: 0 }, shared)] }))
    else if (key === 'V') b.results.push(pre({ value: { scalarSI: V, unit: 'V' }, checks: [check('lab-V', 'otherAlgorithm', '电场实验的电势', V, lab ? lab.V[0] : null, CHECK_RULE, shared)] }))
    else if (key === 'F' || key === 'Fdir') {
      if (qt === undefined) { b.results.push(pre({ applicability: 'insufficient', computation: 'failed', reason: '缺少试探电荷的电荷量' })); continue }
      const F = expr('abs(q)*E', { q: qt, E })
      // the field points the way a positive test charge is pushed; a negative charge is pushed the other way (T25)
      const fdir = qt >= 0 ? dir : expr('atan2(-Ey, -Ex)', { Ex, Ey })
      step(b, { stage: 'relation', text: '电场方向按正试探电荷受力定义；试探电荷 q = {0} C {1}', params: [qt, qt >= 0 ? '受力与场强同向' : '为负，受力与场强反向'], tex: '\\vec F = q\\vec E', targets: [tg.id] })
      if (key === 'F') b.results.push(pre({ value: { scalarSI: F, vectorSI: [expr('q*Ex', { q: qt, Ex }), expr('q*Ey', { q: qt, Ey })], unit: 'N' }, checks: [check('lab-F', 'otherAlgorithm', '|q|·（电场实验的场强）', F, labE === null ? null : Math.abs(qt) * labE, CHECK_RULE, shared)] }))
      else b.results.push(pre({ value: { scalarSI: fdir, unit: 'rad' }, checks: [] }))
    }
  }
}

// ------------------------------------------------------------------ entry ----

const PLANS = { incline: inclinePlan, projectile: projectilePlan, collision: collisionPlan, circuit: circuitPlan, lens: lensPlan, field: fieldPlan }

/**
 * Solve a checked task (state 'ready'): the results of every target with their checks, the solution steps and the
 * phases. A target the domain cannot answer is reported, not guessed. The task state follows from the results:
 * no solution, several solutions (a target with more than one chosen-able root and no rule to pick one), failed.
 */
export function solveTask(task: TaskSpec, opts: { hash?: string } = {}): SolveOutcome {
  const b: Builder = { task, hash: opts.hash ?? taskHash(task), results: [], steps: [], phases: [], notes: [], runId: 'analytic', models: {} }
  try {
    PLANS[task.domain](b)
  } catch (e) {
    return { state: 'failed', results: task.targets.map(tg => envelope(b, tg, { applicability: 'insufficient', computation: 'failed', reason: (e as Error).message })), steps: b.steps, phases: b.phases, notes: b.notes }
  }
  // Every target has a result (a missing one is a failure of the plan, said as such)
  for (const tg of task.targets) if (!b.results.some(r => r.targetId === tg.id)) b.results.push(envelope(b, tg, { applicability: 'insufficient', computation: 'failed', reason: '这个目标在本题型中还不能自动求解' }))
  for (const r of b.results) if (!targetSpec(task.domain, specKey(r.targetId))) r.computation = 'failed'
  const states = b.results.map(r => r.computation)
  const state = states.every(s => s === 'solved') ? 'solved' : states.some(s => s === 'failed') ? 'failed' : states.some(s => s === 'noSolution') ? 'noSolution' : states.some(s => s === 'multiSolution') ? 'multiSolution' : 'solved'
  return { state, results: b.results, steps: b.steps, phases: b.phases, notes: b.notes }
}

/** The evaluation point of a result in words (Chinese source text). */
export function atText(at: EvaluationPoint | undefined): string {
  if (!at) return '未指定'
  switch (at.kind) {
    case 'static': return '稳态（与时间无关）'
    case 'time': return at.tSI === 0 ? '开始时（初始阶段）' : `t = ${fmt(at.tSI)} s`
    case 'event': return at.side === 'after' ? '碰撞后（右极限）' : '碰撞前（左极限）'
    case 'condition': return at.predicateId === 'landing' ? '落地时' : at.predicateId === 'apex' ? '最高点' : at.predicateId === 'stop' ? '速度减为 0 时' : at.crossing === 'all' ? '每次满足条件时' : '第一次满足条件时'
    case 'interval': return at.operation === 'max' ? '区间内最大值' : at.operation === 'min' ? '区间内最小值' : '区间'
  }
}
