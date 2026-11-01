/**
 * Building and changing tasks (26.57, D110). Every change makes a new revision (manual §10.2: a solved task whose
 * conditions change becomes stale); values keep their source, and a value replaced by another source is kept as
 * `overridden` so the summary can show where each number came from (§10.4).
 */
import type { Assumption, Given, TaskCondition, TaskDomain, TaskSpec, TaskTarget } from './types'
import { TASK_SCHEMA } from './types'
import { DOMAINS, targetSpec } from './vocab'

let counter = 0
/** A new task id (stable within the session; files keep theirs). */
export function newTaskId(domain: TaskDomain): string { counter++; return `${domain}-${Date.now().toString(36)}-${counter}` }

/** An empty task of a domain with its frames and model assumptions. */
export function makeTask(domain: TaskDomain, init: Partial<TaskSpec> = {}): TaskSpec {
  const d = DOMAINS[domain]
  const opts: Record<string, string> = {}
  for (const [k, o] of Object.entries(d.options ?? {})) opts[k] = o.default
  return {
    schemaVersion: TASK_SCHEMA,
    taskId: init.taskId ?? newTaskId(domain),
    revision: init.revision ?? 1,
    domain,
    title: init.title,
    stem: init.stem,
    entityBindings: init.entityBindings ?? {},
    givens: init.givens ?? [],
    initialConditions: init.initialConditions ?? [],
    frames: init.frames ?? d.frames.map(f => ({ ...f })),
    conditions: init.conditions ?? [],
    assumptions: init.assumptions ?? d.assumptions.map(id => ({ id, source: 'model' as const })),
    targets: init.targets ?? [],
    evidence: init.evidence ?? [],
    options: { ...opts, ...(init.options ?? {}) }
  }
}

/** The adopted value of a given or initial condition (undefined: not known). */
export function value(task: TaskSpec, ref: string): number | undefined {
  for (const list of [task.givens, task.initialConditions]) {
    const g = list.find(x => x.ref === ref && (x.status ?? 'adopted') === 'adopted')
    if (g) return g.valueSI
  }
  return undefined
}

/** The adopted given entry of a ref. */
export function givenOf(task: TaskSpec, ref: string): Given | undefined {
  return [...task.givens, ...task.initialConditions].find(x => x.ref === ref && (x.status ?? 'adopted') === 'adopted')
}

/** Every entry of a ref, adopted or not (conflicts and replaced values). */
export function entriesOf(task: TaskSpec, ref: string): Given[] { return [...task.givens, ...task.initialConditions].filter(x => x.ref === ref) }

/** A change to a task (serializable: clarification options carry one). */
export interface TaskPatch {
  /** Set values (the previous adopted value of the same ref is kept as overridden). */
  set?: Given[]
  /** Values added as conflicting candidates (not adopted until chosen). */
  conflict?: Given[]
  /** Adopt one candidate of a ref by source (the others become overridden). */
  adopt?: { ref: string; source: Given['source']; valueSI: number }
  /** Remove every entry of these refs. */
  remove?: string[]
  assume?: Assumption[]
  unassume?: string[]
  targets?: TaskTarget[]
  removeTargets?: string[]
  conditions?: TaskCondition[]
  options?: Record<string, string>
  title?: string
}

/** Apply a patch: a new task with the next revision (the input is not changed). */
export function applyPatch(task: TaskSpec, patch: TaskPatch): TaskSpec {
  const t: TaskSpec = JSON.parse(JSON.stringify(task))
  const rev = t.revision + 1
  t.revision = rev
  const d = DOMAINS[t.domain]
  const isInitial = (ref: string) => !!d.givens.find(g => g.ref === ref)?.initial
  const listOf = (ref: string) => (isInitial(ref) ? t.initialConditions : t.givens)
  for (const ref of patch.remove ?? []) {
    t.givens = t.givens.filter(g => g.ref !== ref)
    t.initialConditions = t.initialConditions.filter(g => g.ref !== ref)
  }
  for (const g of patch.set ?? []) {
    const list = listOf(g.ref)
    for (const old of list) if (old.ref === g.ref && (old.status ?? 'adopted') !== 'overridden') old.status = 'overridden'
    list.push({ ...g, status: 'adopted', revision: rev })
  }
  for (const g of patch.conflict ?? []) listOf(g.ref).push({ ...g, status: 'conflict', revision: rev })
  if (patch.adopt) {
    const a = patch.adopt
    for (const g of listOf(a.ref)) {
      if (g.ref !== a.ref) continue
      g.status = g.source === a.source && g.valueSI === a.valueSI ? 'adopted' : 'overridden'
    }
  }
  if (patch.assume) for (const a of patch.assume) if (!t.assumptions.some(x => x.id === a.id)) t.assumptions.push(a)
  if (patch.unassume) t.assumptions = t.assumptions.filter(a => !patch.unassume!.includes(a.id))
  if (patch.removeTargets) t.targets = t.targets.filter(x => !patch.removeTargets!.includes(x.id))
  for (const tg of patch.targets ?? []) {
    const i = t.targets.findIndex(x => x.id === tg.id)
    if (i >= 0) t.targets[i] = tg; else t.targets.push(tg)
  }
  for (const c of patch.conditions ?? []) {
    const i = t.conditions.findIndex(x => x.id === c.id)
    if (i >= 0) t.conditions[i] = c; else t.conditions.push(c)
  }
  if (patch.options) t.options = { ...(t.options ?? {}), ...patch.options }
  if (patch.title !== undefined) t.title = patch.title
  return t
}

/** A target of the domain's catalogue (`key`), with its quantity reference; condition targets get their condition. */
export function makeTarget(task: TaskSpec, key: string, opts: { conditionValue?: number; tSI?: number; answerDomain?: string; suffix?: string; intervalEnd?: number } = {}): { target: TaskTarget; condition?: TaskCondition } {
  const spec = targetSpec(task.domain, key)
  if (!spec) throw new Error(`task: no target ${key} in ${task.domain}`)
  const id = opts.suffix ? `${key}#${opts.suffix}` : key
  const target: TaskTarget = {
    id, kind: spec.quantity === 'motionState' || spec.quantity === 'imageNature' ? 'explain' : 'value',
    ref: { id: `${spec.entity.join('+')}.${key}`, entityIds: [...spec.entity], quantity: spec.quantity, frameId: spec.frame, component: spec.component }
  }
  if (spec.answerDomain || opts.answerDomain) target.answerDomain = opts.answerDomain ?? spec.answerDomain
  let condition: TaskCondition | undefined
  switch (spec.at) {
    case 'static': target.at = { kind: 'static' }; break
    case 'start': target.at = { kind: 'time', tSI: 0 }; break
    case 'time': if (opts.tSI !== undefined) target.at = { kind: 'time', tSI: opts.tSI }; break
    case 'event-after': target.at = { kind: 'event', eventId: 'collision', occurrence: 1, side: 'after' }; break
    case 'event-before': target.at = { kind: 'event', eventId: 'collision', occurrence: 1, side: 'before' }; break
    case 'landing': target.at = { kind: 'condition', predicateId: 'landing', crossing: 'first', intervalSI: [0, opts.intervalEnd ?? 1e6] }; break
    case 'apex': target.at = { kind: 'condition', predicateId: 'apex', crossing: 'first', intervalSI: [0, opts.intervalEnd ?? 1e6] }; break
    case 'stop': target.at = { kind: 'condition', predicateId: 'stop', crossing: 'first', intervalSI: [0, opts.intervalEnd ?? 1e6] }; break
    case 'condition':
      if (spec.condition && opts.conditionValue !== undefined) {
        const cid = `c-${id}`
        condition = { id: cid, kind: spec.condition.kind, entity: spec.entity[0], frameId: spec.frame, component: spec.condition.component, valueSI: opts.conditionValue, direction: 'any' }
        target.at = { kind: 'condition', predicateId: cid, crossing: target.answerDomain === 'all' ? 'all' : 'first', intervalSI: [0, opts.intervalEnd ?? 1e6] }
      }
      break
  }
  return { target, condition }
}

/** The catalogue key of a target id ("speedAtS#2" → "speedAtS"). */
export function specKey(targetId: string): string { return targetId.split('#')[0] }
