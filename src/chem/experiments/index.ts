/**
 * The forty guided experiments of D270 as the bench uses them (26.64): the definitions of data.ts with the vessel
 * letters turned into the ids of the starting document, and that document — the apparatus laid out on an empty
 * bench. The list and its order follow docs/DEV_MANUAL_26_64.md D270 and scripts/chem/catalog/experiments_map.json.
 */
import type { BenchDoc, BenchObject } from '../../engine/chem'
import { shapeOf, vesselObject } from '../apparatus'
import { EXPERIMENTS } from './data'
import type { Check, DemoAction, Experiment, ExperimentGroup, Quantity, Step } from './types'

export type { Check, DemoAction, Experiment, ExperimentGroup, Quantity, Step } from './types'
export { EXPERIMENTS } from './data'

export const GROUPS: readonly ExperimentGroup[] = ['junior', 'seniorCompulsory', 'seniorElective', 'demo']

export function experimentById(id: string): Experiment | undefined { return EXPERIMENTS.find(e => e.id === id) }
export const isAvailable = (e: Experiment) => !e.unavailable

/** The letter of the n-th vessel (A … Z). */
export const letterOf = (n: number) => String.fromCharCode(65 + n)
/** The id the n-th vessel of an experiment has in its starting document. */
export const idOfLetter = (letter: string) => `v${letter.charCodeAt(0) - 64}`

function q(x: Quantity): Quantity { return x.q === 'time' ? x : { ...x, v: idOfLetter(x.v) } }

/** A check with the letters replaced by ids. */
export function resolveCheck(c: Check): Check {
  if ('all' in c) return { all: c.all.map(resolveCheck) }
  if ('any' in c) return { any: c.any.map(resolveCheck) }
  if ('not' in c) return { not: resolveCheck(c.not) }
  if ('is' in c) return { ...c, is: q(c.is) }
  if ('ratio' in c) return { ...c, ratio: [q(c.ratio[0]), q(c.ratio[1])] }
  if ('flag' in c) return { ...c, v: idOfLetter(c.v), ...(c.to ? { to: idOfLetter(c.to) } : {}) }
  if ('part' in c) return { ...c, v: idOfLetter(c.v) }
  return { ...c, wired: idOfLetter(c.wired) }
}

/** An action with the letters replaced by ids. */
export function resolveAction(a: DemoAction): DemoAction {
  const id = idOfLetter
  switch (a.act) {
    case 'add': return { ...a, to: id(a.to) }
    case 'pour': case 'filter': return { ...a, from: id(a.from), to: id(a.to) }
    case 'connect': return { ...a, from: id(a.from), to: id(a.to) }
    case 'disconnect': return { ...a, from: id(a.from) }
    case 'empty': case 'heat': case 'bath': case 'stopper': case 'collector': case 'ignite': case 'light': case 'attach': return { ...a, vessel: id(a.vessel) }
    case 'circuit': return { ...a, a: { ...a.a, vessel: id(a.a.vessel) }, b: { ...a.b, vessel: id(a.b.vessel) } }
    default: return a
  }
}

/** Actions as they are performed: a wait written with `times` becomes that many equal waits (one entry of the log). */
export function expandActions(actions: DemoAction[]): DemoAction[] {
  return actions.flatMap(a => (a.act === 'wait' && a.times && a.times > 1 ? Array.from({ length: a.times }, () => ({ act: 'wait' as const, seconds: a.seconds })) : [a]))
}

function resolveStep(s: Step): Step {
  return { ...s, check: resolveCheck(s.check), demo: s.demo.map(resolveAction), mistakes: s.mistakes?.map(m => ({ ...m, when: resolveCheck(m.when) })), wrong: s.wrong?.map(resolveAction) }
}

/** An experiment whose checks and actions name the vessels by the ids of its starting document. */
export function resolved(e: Experiment): Experiment { return { ...e, steps: e.steps.map(resolveStep) } }

/**
 * The starting bench of an experiment: its vessels side by side with their letters and the parts that stand on them,
 * nothing in them and an empty log — everything else is for the student (or "show me") to do.
 */
export function startDoc(e: Experiment): BenchDoc {
  const objects: BenchObject[] = []
  let right = 0
  e.vessels.forEach((v, i) => {
    const id = `v${i + 1}`
    const width = shapeOf(v.kind, v.capacity_mL).rMax * 2
    const above = v.above ? idOfLetter(v.above) : null
    // a burette or funnel clamped over a vessel stands at that vessel's place
    const below = above ? objects.find(o => o.id === above) : undefined
    const x = below ? (below.x as number) : right + width / 2
    if (!below) right += width + 4
    const o: BenchObject = { ...vesselObject(v.kind, id, v.capacity_mL), x: Math.round(x * 100) / 100, y: 0, label: letterOf(i), parts: [...(v.parts ?? [])], above, electrode: null }
    if (v.closed) o.closed = true
    objects.push(o)
  })
  return { format: 'velophi-bench', version: 1, objects, log: [] }
}
