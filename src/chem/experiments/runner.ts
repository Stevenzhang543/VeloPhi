/**
 * Running a guided experiment on the bench (26.64, D270). The runner opens the experiment's starting bench, keeps
 * which step is the current one, and decides from the bench's state — the core's numbers and events, read through
 * the page's store — whether that step is done. It never plays anything: "show me" performs the step's intended
 * actions through the same log every gesture goes through, so undo, the record and the share link treat them like
 * the student's own. A step that passed stays passed; after the last step the bench is simply a bench again.
 */
import { computed, ref, shallowRef } from 'vue'
import type { BenchStore } from '../bench'
import { chemBalance } from '../../engine/chem'
import { baselineOf, evaluate } from './check'
import type { Baseline, BenchView, Outcome } from './check'
import { expandActions, experimentById, resolved, startDoc } from './index'
import type { Experiment, Step } from './types'

const GUIDE_KEY = 'velophi.bench.guide.v1'

export interface RunnerOptions { storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null }

/** The bench as the checks read it. */
export function viewOf(bench: BenchStore): BenchView {
  return {
    get time() { return bench.state.value?.time ?? 0 },
    vessel: id => bench.vesselOf(id),
    reading: id => bench.read(id),
    circuitOf: id => bench.circuitOf(id),
    // the parts on a vessel and the burner, hot plate or bath that acts on it (things of their own since 26.65)
    parts: id => bench.partsOf(id),
    event(vessel, code, id) {
      let n = 0
      for (const p of bench.phenomena.value) if (p.vessel === vessel && p.code === code && (id === undefined || p.subject === id)) n += p.n
      return n
    }
  }
}

/** A balanced equation of an experiment, or null when the core cannot balance it (it is then not shown). */
export function balanced(eq: { reactants: string[]; products: string[] }): { reactants: string[]; products: string[]; coefficients: number[] } | null {
  try {
    const r = chemBalance(eq.reactants, eq.products)
    return r.balanced ? { reactants: eq.reactants, products: eq.products, coefficients: r.coefficients } : null
  } catch { return null }
}

export function createRunner(bench: BenchStore, options: RunnerOptions = {}) {
  const storage = options.storage === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : options.storage
  /** The experiment being run, with ids for the vessels. */
  const active = shallowRef<Experiment | null>(null)
  /** Index of the current step; equal to the number of steps when all are done. */
  const index = ref(0)
  /** What the current step's check shows now. */
  const outcome = shallowRef<Outcome | null>(null)
  /** Texts of the typical mistakes whose condition holds now. */
  const mistakes = shallowRef<string[]>([])
  const view = viewOf(bench)
  let baseline: Baseline = new Map()

  const steps = computed<Step[]>(() => active.value?.steps ?? [])
  const step = computed<Step | null>(() => steps.value[index.value] ?? null)
  const finished = computed(() => !!active.value && index.value >= steps.value.length)

  function remember() {
    try {
      if (!storage) return
      if (active.value) storage.setItem(GUIDE_KEY, JSON.stringify({ id: active.value.id, index: index.value }))
      else storage.removeItem(GUIDE_KEY)
    } catch { /* nothing kept */ }
  }

  function enter(i: number) {
    index.value = i
    const s = steps.value[i]
    baseline = s ? baselineOf(s.check, view) : new Map()
  }

  /** Look at the bench: complete the current step (and those after it) while their checks hold. */
  function check(): Outcome | null {
    if (!active.value || !bench.state.value) { outcome.value = null; mistakes.value = []; return null }
    let moved = false
    for (;;) {
      const s = step.value
      if (!s) { outcome.value = null; mistakes.value = []; break }
      const o = evaluate(s.check, view, baseline)
      if (!o.ok) {
        outcome.value = o
        mistakes.value = (s.mistakes ?? []).filter(m => evaluate(m.when, view, baseline).ok).map(m => m.text)
        break
      }
      enter(index.value + 1)
      moved = true
    }
    if (moved) remember()
    return outcome.value
  }

  /** Start an experiment on a fresh bench (the caller keeps the previous bench for an undo). False when it cannot start. */
  function start(id: string): boolean {
    const e = experimentById(id)
    if (!e || e.unavailable) return false
    try { bench.open(startDoc(e)) } catch { return false }
    // the starting bench is kept like any working bench (a layout call schedules the autosave)
    if (e.vessels.length) bench.setExtras('v1', {})
    active.value = resolved(e)
    enter(0)
    check()
    remember()
    return true
  }

  /** Take up the experiment of the last visit when the bench that came back is still its bench. */
  function resume(): boolean {
    try {
      const raw = storage?.getItem(GUIDE_KEY)
      if (!raw) return false
      const saved = JSON.parse(raw) as { id?: string; index?: number }
      const e = experimentById(saved.id ?? '')
      if (!e || e.unavailable || !e.vessels.every((v, i) => bench.vesselOf(`v${i + 1}`)?.kind === v.kind)) { storage?.removeItem(GUIDE_KEY); return false }
      active.value = resolved(e)
      enter(Math.max(0, Math.min(e.steps.length, saved.index ?? 0)))
      check()
      return true
    } catch { return false }
  }

  /** Perform the intended actions of the current step. Returns false when one of them was refused (the rest are not tried). */
  function showMe(): boolean {
    const s = step.value
    if (!s) return false
    let ok = true
    for (const a of expandActions(s.demo)) {
      if (a.act === 'attach') { if (!bench.attach(a.vessel, a.part)) { ok = false; break } }
      else if (bench.apply(a) === null) { ok = false; break }
    }
    check()
    return ok
  }

  /** Leave the guide; the bench stays as it is. */
  function leave() { active.value = null; outcome.value = null; mistakes.value = []; index.value = 0; remember() }

  return { active, index, steps, step, finished, outcome, mistakes, start, resume, check, showMe, leave }
}

export type Runner = ReturnType<typeof createRunner>
