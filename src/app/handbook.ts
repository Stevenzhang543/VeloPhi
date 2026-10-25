/**
 * Learning handbook actions (manual 26.51, D46): open the handbook at a formula, open a formula's example in the
 * studio, and the details of an example (symbol table and conditions, from the example's own recording, computed
 * on demand and kept for the session).
 */
import { tl } from '../i18n'
import { markRaw } from 'vue'
import { buildTemplate } from '../templates'
import { simulate } from '../core/solver/simulation'
import type { Recording } from '../core/solver/simulation'
import type { Sample, Situation } from '../formula/situations'
import { recognize } from '../formula/situations'
import { FORMULAS } from '../formula/library'
import EXAMPLES from '../handbook/examples.json'
import { loadScene, state } from './store'
import { logEvent } from './trialLog'
import { ask } from '../platform/ask'

/** The example of a formula: template, parameter overrides and the time at which its card applies. */
export interface HandbookExample { template: string; params?: Record<string, number>; t: number }

/** Example of a formula, or null. */
export function exampleOf(formulaId: string): HandbookExample | null {
  return (EXAMPLES as Record<string, HandbookExample>)[formulaId] ?? null
}

/** Open the settings page at the handbook, optionally at one formula's entry. */
export function openHandbook(formulaId: string | null = null) {
  state.page = 'settings'
  state.settingsSection = 'handbook'
  state.handbookFocus = formulaId
  logEvent('handbook.open', { formula: formulaId ?? '' })
}

/** Load a formula's example into the studio, run it and show the time at which the formula applies. */
export async function openExample(formulaId: string): Promise<boolean> {
  const ex = exampleOf(formulaId)
  if (!ex) return false
  if (state.dirty && !(await ask(tl('当前场景有未保存的修改，确定要用模板替换吗？')))) return false
  const scene = buildTemplate(ex.template, ex.params ?? {})
  loadScene(scene, null)
  state.page = 'studio'
  state.rightTab = 'formula'
  state.pendingSeek = ex.t
  state.formulaFocus = formulaId
  logEvent('handbook.example', { formula: formulaId, template: ex.template })
  return true
}

/** Details of a formula's example: the situation and its sample at the example time. */
export interface ExampleDetail { situation: Situation; sample: Sample }

const recordings = new Map<string, Recording>()

/** The example's situation and sample (simulated once per template and parameters). */
export function exampleDetail(formulaId: string): ExampleDetail | null {
  const ex = exampleOf(formulaId)
  const f = FORMULAS.find(x => x.id === formulaId)
  if (!ex || !f) return null
  const key = `${ex.template}:${JSON.stringify(ex.params ?? {})}`
  let rec = recordings.get(key)
  if (!rec) {
    rec = markRaw(simulate(buildTemplate(ex.template, ex.params ?? {})))
    recordings.set(key, rec)
  }
  const sits = recognize(rec).filter(s => s.type === f.situation)
  const at = sits.find(s => (s.tEvent !== undefined ? Math.abs(s.tEvent - ex.t) <= 1e-9 : ex.t >= s.t0 - 1e-12 && ex.t <= s.t1 + 1e-12)) ?? sits[0]
  if (!at) return null
  return { situation: at, sample: at.sample(Math.min(Math.max(ex.t, at.t0), at.t1)) }
}
