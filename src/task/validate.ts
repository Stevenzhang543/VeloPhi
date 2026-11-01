/**
 * Checking a task before it is solved (26.57, D110; manual §6.4, §6.8): what is missing, what conflicts, which
 * defaults were used, and the smallest set of questions that change the answer. Only ambiguities that change the
 * result or the method interrupt (§6.4); defaults are applied visibly and can be changed. A task with a known
 * ambiguity is never solved silently (§14.2 release blocker).
 */
import type { TaskSpec } from './types'
import type { TaskPatch } from './build'
import { entriesOf, makeTarget, specKey, value } from './build'
import { ASSUMPTIONS, DOMAINS, givenSpec, targetSpec } from './vocab'

/** A question for the user, or a notice of a default. */
export interface Clarification {
  id: string
  kind: 'chooseTarget' | 'chooseEvaluation' | 'chooseOption' | 'missingGiven' | 'frictionKind' | 'conflict' | 'default' | 'invalid' | 'outOfScope'
  /** Chinese source text with {0}… parameters. */
  message: string
  params?: Array<string | number>
  /** The ref or target concerned. */
  ref?: string
  /** Choices; each applies a patch (a free value is entered in the editor). */
  options: Array<{ id: string; label: string; patch: TaskPatch }>
  /** The task cannot be solved before this is answered. */
  blocking: boolean
}

/** Result of a check. */
export interface TaskCheck {
  state: 'ready' | 'needsInput' | 'outOfScope'
  clarifications: Clarification[]
  /** Given refs the targets need. */
  needed: string[]
}

/** Physical range checks of a value (contradictory or impossible inputs, T12). */
function rangeProblem(domain: TaskSpec['domain'], ref: string, v: number): string | null {
  const g = givenSpec(domain, ref)
  if (!g) return null
  if (!Number.isFinite(v)) return '数值无效'
  if (g.min !== undefined && v < g.min) return '不能小于 {1}'
  if (g.max !== undefined && v > g.max) return '不能大于 {1}'
  if ((ref.endsWith('.mass') || ref === 'object.u') && v <= 0) return '必须大于 0'
  if (ref === 'incline.theta' && (v <= 0 || v >= Math.PI / 2)) return '倾角应在 0° 与 90° 之间'
  if (ref === 'lens.f' && v === 0) return '焦距不能为 0'
  return null
}

/** Check a task. */
export function checkTask(task: TaskSpec): TaskCheck {
  const d = DOMAINS[task.domain]
  const out: Clarification[] = []
  if (!d) return { state: 'outOfScope', clarifications: [{ id: 'scope', kind: 'outOfScope', message: '这类题目超出一期支持范围（斜面、抛体、一维碰撞、直流电路、薄透镜、点电荷电场）', options: [], blocking: true }], needed: [] }
  // No target: recommend, never guess (T01, T09)
  if (!task.targets.length) {
    out.push({
      id: 'target', kind: 'chooseTarget', message: '还没有选择所求。可以求：', blocking: true,
      options: d.targets.filter(t => t.at !== 'condition' && t.at !== 'time').map(t => ({ id: t.key, label: t.label, patch: { targets: [makeTarget(task, t.key).target] } }))
    })
  }
  const needed = new Set<string>(d.base)
  for (const tg of task.targets) {
    const spec = targetSpec(task.domain, specKey(tg.id))
    if (!spec) { out.push({ id: `unknown-${tg.id}`, kind: 'outOfScope', message: '无法识别所求“{0}”', params: [tg.id], options: [], blocking: true }); continue }
    for (const n of spec.needs) needed.add(n)
    // A target without its evaluation point: ask when, never take the end of the record (T09, T28)
    if (!tg.at) {
      const opts: Clarification['options'] = []
      if (spec.at === 'time') opts.push({ id: 'time', label: '指定时刻', patch: {} })
      for (const alt of d.targets.filter(t => t.quantity === spec.quantity && t.key !== spec.key && t.at === 'condition')) opts.push({ id: alt.key, label: alt.label, patch: { removeTargets: [tg.id] } })
      out.push({ id: `at-${tg.id}`, kind: 'chooseEvaluation', ref: tg.id, message: '“{0}”需要说明取值时机：指定时刻、首次到达某位置，或整个过程', params: [spec.label], options: opts, blocking: true })
    }
    if (tg.at?.kind === 'condition' && !['landing', 'apex', 'stop'].includes(tg.at.predicateId) && !task.conditions.some(c => c.id === (tg.at as { predicateId: string }).predicateId)) {
      out.push({ id: `cond-${tg.id}`, kind: 'chooseEvaluation', ref: tg.id, message: '“{0}”的条件（{1}）没有给出数值', params: [spec.label, spec.condition?.label ?? ''], options: [], blocking: true })
    }
  }
  // Friction: one coefficient only, and the branch needs the static one (manual §6.4)
  if (task.domain === 'incline') {
    const muS = value(task, 'contact.muS'), muK = value(task, 'contact.muK')
    const v0 = value(task, 'blockA.v0')
    const smooth = task.assumptions.some(a => a.id === 'smooth')
    if (!smooth && muS === undefined && muK !== undefined && needed.has('contact.muS')) {
      // Sliding from the start does not need μs until the block stops; at rest (or slowing to a stop) it decides the branch
      const decides = v0 === undefined || v0 === 0 || v0 < 0
      out.push({
        id: 'mu', kind: 'frictionKind', ref: 'contact.muS', blocking: decides,
        message: decides ? '只给出一个摩擦因数，而判断能否静止需要静摩擦因数 μs：' : '只给出动摩擦因数；物块一直在滑动，判断用不到 μs',
        options: [
          { id: 'same', label: '按 μs = μk 处理（最大静摩擦等于滑动摩擦）', patch: { set: [{ ref: 'contact.muS', valueSI: muK, unit: '1', source: 'default' }], assume: [{ id: 'muEqual', source: 'user' }] } },
          { id: 'enter', label: '输入静摩擦因数 μs', patch: {} }
        ]
      })
    }
    if (smooth) needed.delete('contact.muK')
  }
  // Discrete choices that change the answer (manual §6.4): asked when the text does not say, reported when it says two things
  const opt = (key: string) => task.options?.[key]
  for (const [key, spec] of Object.entries(d.options ?? {})) {
    const v = opt(key)
    if (v === '') out.push({ id: `option-${key}`, kind: 'chooseOption', ref: key, message: '题目没有说明“{0}”，它决定用哪个模型：', params: [spec.label], blocking: true, options: Object.entries(spec.choices).map(([id, label]) => ({ id, label, patch: { options: { [key]: id } } })) })
    else if (v === 'conflict') out.push({ id: `option-${key}`, kind: 'conflict', ref: key, message: '“{0}”前后矛盾，请选择', params: [spec.label], blocking: true, options: Object.entries(spec.choices).map(([id, label]) => ({ id, label, patch: { options: { [key]: id } } })) })
  }
  if (task.domain === 'lens' && opt('lensKind') === '') {
    const f = value(task, 'lens.f')
    out.push({
      id: 'option-lensKind', kind: 'chooseOption', ref: 'lens.f', message: '题目没有说明是凸透镜还是凹透镜（决定焦距的正负）：', blocking: true,
      options: f === undefined ? [] : [{ id: 'convex', label: '凸透镜（f > 0）', patch: { set: [{ ref: 'lens.f', valueSI: Math.abs(f), unit: 'm', source: 'user' }], options: { lensKind: 'convex' } } }, { id: 'concave', label: '凹透镜（f < 0）', patch: { set: [{ ref: 'lens.f', valueSI: -Math.abs(f), unit: 'm', source: 'user' }], options: { lensKind: 'concave' } } }]
    })
  }
  // Collision: the coefficient of restitution follows from the kind, except for a general inelastic collision
  if (task.domain === 'collision') {
    const kind = task.options?.kind ?? 'elastic'
    if (kind === 'inelastic') needed.add('contact.e')
  }
  // Two roots of a condition and no rule to pick one (manual §6.4: first time / on the way up …)
  for (const tg of task.targets) {
    if (tg.answerDomain !== 'ambiguous') continue
    out.push({
      id: `roots-${tg.id}`, kind: 'chooseEvaluation', ref: tg.id, blocking: true, message: '这个高度可能先后经过两次：取哪一次？',
      options: [['first', '第一次（上升时）'], ['falling', '第二次（下降时）'], ['all', '两次都给出']].map(([id, label]) => ({ id, label, patch: { targets: [{ ...tg, answerDomain: id, at: tg.at?.kind === 'condition' ? { ...tg.at, crossing: id === 'all' ? 'all' : 'first' } : tg.at }] } }))
    })
  }
  // Missing values: defaults are applied visibly; the rest are asked for
  for (const ref of needed) {
    if (value(task, ref) !== undefined) continue
    if (task.domain === 'incline' && ref === 'contact.muS' && out.some(c => c.id === 'mu')) continue
    const g = givenSpec(task.domain, ref)
    if (!g) continue
    const noDefault = (task.options?.noDefault ?? '').split(',').includes(ref)
    if (g.fallback && !noDefault) {
      out.push({ id: `default-${ref}`, kind: 'default', ref, message: g.fallback.note, options: [{ id: 'use', label: '采用', patch: { set: [{ ref, valueSI: g.fallback.value, unit: g.unit, source: 'default' }] } }], blocking: true })
    } else {
      out.push({ id: `missing-${ref}`, kind: 'missingGiven', ref, message: '缺少“{0}”', params: [g.label], options: [], blocking: true })
    }
  }
  // Conflicts between sources (T12): both values are shown, one is chosen
  const seen = new Set<string>()
  for (const g of [...task.givens, ...task.initialConditions]) {
    if (seen.has(g.ref)) continue
    seen.add(g.ref)
    const all = entriesOf(task, g.ref).filter(x => x.status === 'adopted' || x.status === 'conflict')
    const distinct = new Set(all.map(x => x.valueSI))
    if (all.length > 1 && distinct.size > 1) {
      const spec = givenSpec(task.domain, g.ref)
      out.push({
        id: `conflict-${g.ref}`, kind: 'conflict', ref: g.ref, blocking: true,
        message: '“{0}”有互相矛盾的值，请选择采用哪一个', params: [spec?.label ?? g.ref],
        options: all.map((x, i) => ({ id: `${i}`, label: `${x.valueSI}（${x.source}${x.raw ? '：' + x.raw : ''}）`, patch: { adopt: { ref: g.ref, source: x.source, valueSI: x.valueSI } } }))
      })
    }
  }
  // Impossible values (T12): a contradiction is reported, never solved around
  for (const g of [...task.givens, ...task.initialConditions]) {
    if ((g.status ?? 'adopted') !== 'adopted') continue
    const p = rangeProblem(task.domain, g.ref, g.valueSI)
    if (p) {
      const spec = givenSpec(task.domain, g.ref)
      out.push({ id: `invalid-${g.ref}`, kind: 'invalid', ref: g.ref, message: '“{0}”的值不合理：' + p, params: [spec?.label ?? g.ref, spec?.min ?? spec?.max ?? ''], options: [], blocking: true })
    }
  }
  // Unknown assumptions are not silently ignored
  for (const a of task.assumptions) if (!(a.id in ASSUMPTIONS) && a.id !== 'smooth') out.push({ id: `assume-${a.id}`, kind: 'outOfScope', message: '无法识别的假设“{0}”', params: [a.id], options: [], blocking: false })
  const blocking = out.some(c => c.blocking)
  return { state: blocking ? 'needsInput' : 'ready', clarifications: out, needed: [...needed] }
}

/** Apply every default of a check (the user can change them later). */
export function acceptDefaults(check: TaskCheck): TaskPatch {
  const set = check.clarifications.filter(c => c.kind === 'default').flatMap(c => c.options[0]?.patch.set ?? [])
  return { set }
}
