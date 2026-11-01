/**
 * Scoring of the task-understanding set (26.57, D115; manual §14.2): object binding, known values and units,
 * targets (object, quantity, frame and evaluation point), recall of missing/conflicting information, direct-output
 * precision and coverage, success after the offered clarifications, rejections by the core, per domain and with the
 * list of errors. Reported with numerators and denominators and a 95 % Wilson interval, never as one total.
 */
import { parseProblem } from '../../src/task/parse'
import { acceptDefaults, checkTask } from '../../src/task/validate'
import type { TaskCheck } from '../../src/task/validate'
import { applyPatch, specKey } from '../../src/task/build'
import { solveTask } from '../../src/task/plan'
import type { TaskSpec } from '../../src/task/types'

export interface EvalCase { id: string; split: 'dev' | 'holdout'; cat: 'complete' | 'ambiguous' | 'conflict' | 'out'; domain: string; text: string; givens: Record<string, number>; targets: string[]; options: Record<string, string>; clarify: string[]; solve: string | null }

/** A ratio with its 95 % Wilson interval. */
export interface Ratio { n: number; d: number; p: number | null; lo: number | null; hi: number | null }
export function ratio(n: number, d: number): Ratio {
  if (d === 0) return { n, d, p: null, lo: null, hi: null }
  const z = 1.959963984540054, p = n / d
  const den = 1 + z * z / d, c = (p + z * z / (2 * d)) / den, h = (z * Math.sqrt(p * (1 - p) / d + z * z / (4 * d * d))) / den
  return { n, d, p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) }
}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))

/** The target strings of a task in the set's notation: key, key@d, key@d:first, key@t=… */
export function targetStrings(task: TaskSpec): string[] {
  return task.targets.map(tg => {
    const key = specKey(tg.id)
    const at = tg.at
    if (at?.kind === 'condition' && !['landing', 'apex', 'stop'].includes(at.predicateId)) {
      const c = task.conditions.find(x => x.id === at.predicateId)
      const v = c ? Number(c.valueSI.toPrecision(10)) : '?'
      const dom = key === 'timeAtY' && tg.answerDomain && ['first', 'rising', 'falling'].includes(tg.answerDomain) ? `:${tg.answerDomain}` : ''
      return `${key}@${v}${dom}`
    }
    if (at?.kind === 'time' && at.tSI !== 0) return `${key}@t=${Number(at.tSI.toPrecision(10))}`
    return key
  }).sort()
}

export interface CaseResult {
  id: string; split: string; cat: string; domain: string
  scope: 'in' | 'out'; domainOk: boolean
  givens: { ok: number; total: number; spurious: number; wrong: string[] }
  binding: boolean | null
  targetsOk: boolean | null
  state: TaskCheck['state']
  kinds: string[]
  direct: boolean
  directCorrect: boolean
  expectedKindsFound: boolean | null
  silent: boolean
  solveState: string | null
  clarifications: number
  clarifiedOk: boolean | null
  errors: string[]
}

const ENTITY: Record<string, RegExp> = { collision: /^[AB]\./, circuit: /^R[12]\.|^source\./, field: /^q[12]\.|^P\.|^test\./ }

/** Score one case. */
export function scoreCase(c: EvalCase): CaseResult {
  const r: CaseResult = { id: c.id, split: c.split, cat: c.cat, domain: c.domain, scope: 'out', domainOk: false, givens: { ok: 0, total: 0, spurious: 0, wrong: [] }, binding: null, targetsOk: null, state: 'outOfScope', kinds: [], direct: false, directCorrect: false, expectedKindsFound: null, silent: false, solveState: null, clarifications: 0, clarifiedOk: null, errors: [] }
  const p = parseProblem(c.text)
  r.scope = p.scope
  if (c.cat === 'out') { r.domainOk = p.scope === 'out'; if (!r.domainOk) r.errors.push(`判为 ${p.domain}，应为超出范围`); return r }
  if (p.scope === 'out' || !p.task) { r.errors.push(`误判为超出范围：${p.reason}`); return r }
  r.domainOk = p.domain === c.domain
  if (!r.domainOk) { r.errors.push(`题型 ${p.domain}，应为 ${c.domain}`); return r }
  let task = p.task
  // defaults are applied visibly (they are not questions)
  task = applyPatch(task, acceptDefaults(checkTask(task)))
  const chk = checkTask(task)
  r.state = chk.state
  r.kinds = [...new Set(chk.clarifications.filter(x => x.blocking).map(x => x.kind))]
  r.clarifications = chk.clarifications.filter(x => x.blocking).length
  // known values (stem only) against the labels
  const stem = [...task.givens, ...task.initialConditions].filter(g => g.source === 'stem' && (g.status ?? 'adopted') === 'adopted')
  for (const [ref, v] of Object.entries(c.givens)) {
    r.givens.total++
    const got = stem.find(g => g.ref === ref)
    if (got && close(got.valueSI, v)) r.givens.ok++
    else r.givens.wrong.push(`${ref}: ${got ? got.valueSI : '—'} ≠ ${v}`)
  }
  const extra = stem.filter(g => !(g.ref in c.givens) && c.cat === 'complete')
  r.givens.spurious = extra.length
  if (extra.length) r.errors.push(`多余的已知量：${extra.map(g => g.ref + '=' + g.valueSI).join('，')}`)
  const ent = ENTITY[c.domain]
  if (ent && c.cat === 'complete') {
    const refs = Object.keys(c.givens).filter(k => ent.test(k))
    r.binding = refs.every(ref => { const got = stem.find(g => g.ref === ref); return !!got && close(got.valueSI, c.givens[ref]) })
  }
  if (c.cat === 'complete') {
    const want = [...c.targets].sort().join(' '), got = targetStrings(task).join(' ')
    r.targetsOk = want === got
    if (!r.targetsOk) r.errors.push(`所求 [${got}]，应为 [${want}]`)
    const optOk = Object.entries(c.options).every(([k, v]) => task.options?.[k] === v)
    if (!optOk) r.errors.push(`选项 ${JSON.stringify(task.options)}，应为 ${JSON.stringify(c.options)}`)
    if (r.givens.wrong.length) r.errors.push(`已知量：${r.givens.wrong.join('；')}`)
    r.direct = chk.state === 'ready'
    if (!r.direct) r.errors.push(`没有直出：${chk.clarifications.filter(x => x.blocking).map(x => x.kind + ' ' + x.message + (x.params ? ' ' + x.params.join(',') : '')).join('；')}`)
    r.directCorrect = r.direct && r.targetsOk && r.givens.ok === r.givens.total && optOk
    if (r.direct) {
      const o = solveTask(task)
      r.solveState = o.state
      if (o.state !== 'solved') r.errors.push(`核心未求出：${o.state} ${o.results.map(x => x.reason ?? '').join(' ')}`)
    }
    return r
  }
  // ambiguous and conflicting cases: the expected kinds must be raised; a ready state is a silent output
  if (c.clarify.length) {
    r.expectedKindsFound = c.clarify.every(k => r.kinds.includes(k))
    if (!r.expectedKindsFound) r.errors.push(`应提出 ${c.clarify.join('、')}，实际 ${r.kinds.join('、') || '无'}`)
  }
  if (c.solve) {
    if (chk.state === 'ready') {
      const o = solveTask(task)
      r.solveState = o.state
      r.expectedKindsFound = o.state === c.solve
      if (o.state !== c.solve) r.errors.push(`求解状态 ${o.state}，应为 ${c.solve}`)
    } else {
      r.expectedKindsFound = r.kinds.includes('invalid') || r.kinds.includes('conflict')
      if (!r.expectedKindsFound) r.errors.push(`应在求解时得到 ${c.solve}，却停在 ${r.kinds.join('、')}`)
    }
  }
  r.silent = chk.state === 'ready' && !c.solve
  if (r.silent) r.errors.push('有歧义或矛盾却直接给出结果（发布阻断）')
  // after the offered choices (first option of each blocking question that has options)
  const blocking = chk.clarifications.filter(x => x.blocking)
  if (blocking.length && blocking.every(x => x.options.length && Object.keys(x.options[0].patch).length)) {
    let t2 = task
    for (const x of blocking) t2 = applyPatch(t2, x.options[0].patch)
    t2 = applyPatch(t2, acceptDefaults(checkTask(t2)))
    r.clarifiedOk = checkTask(t2).state === 'ready'
  }
  return r
}

/** Metrics of a list of results (manual §14.2 items 1–8). */
export function metrics(rs: CaseResult[]) {
  const comp = rs.filter(r => r.cat === 'complete')
  const amb = rs.filter(r => r.cat === 'ambiguous'), conf = rs.filter(r => r.cat === 'conflict'), out = rs.filter(r => r.cat === 'out')
  const inScope = rs.filter(r => r.cat !== 'out')
  const bind = comp.filter(r => r.binding !== null)
  const givensTotal = comp.reduce((s, r) => s + r.givens.total, 0), givensOk = comp.reduce((s, r) => s + r.givens.ok, 0)
  const direct = comp.filter(r => r.direct)
  const clar = [...amb, ...conf].filter(r => r.expectedKindsFound !== null)
  const tried = [...amb].filter(r => r.clarifiedOk !== null)
  return {
    cases: rs.length,
    scope: ratio(inScope.filter(r => r.scope === 'in' && r.domainOk).length + out.filter(r => r.domainOk).length, rs.length),
    outRecall: ratio(out.filter(r => r.domainOk).length, out.length),
    domain: ratio(inScope.filter(r => r.domainOk).length, inScope.length),
    binding: ratio(bind.filter(r => r.binding).length, bind.length),
    givens: ratio(givensOk, givensTotal),
    spurious: comp.reduce((s, r) => s + r.givens.spurious, 0),
    targets: ratio(comp.filter(r => r.targetsOk).length, comp.length),
    clarifyRecall: ratio(clar.filter(r => r.expectedKindsFound).length, clar.length),
    silent: ratio([...amb, ...conf].filter(r => r.silent).length, amb.length + conf.length),
    directCoverage: ratio(direct.length, comp.length),
    directPrecision: ratio(direct.filter(r => r.directCorrect).length, direct.length),
    coreRejected: ratio(direct.filter(r => r.solveState !== 'solved').length, direct.length),
    clarifiedSuccess: ratio(tried.filter(r => r.clarifiedOk).length, tried.length),
    meanClarifications: amb.length ? amb.reduce((s, r) => s + r.clarifications, 0) / amb.length : null
  }
}
