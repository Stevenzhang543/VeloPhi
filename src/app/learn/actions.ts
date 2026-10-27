/**
 * Opening what the learning path and the global search point at (26.55, D96): a template (built with its defaults
 * and run), an experiment of the lab (optionally a circuit preset), a built-in problem, a handbook topic, formula or
 * concept page, a tool of the studio. Steps of the learning path are marked done in the local settings when opened.
 */
import { tl, trDeep, activeLang } from '../../i18n'
import { state, loadScene } from '../store'
import { settings } from '../settings'
import { ask } from '../../platform/ask'
import { logEvent } from '../trialLog'
import { buildTemplate, templateById } from '../../templates'
import { labInfo } from '../lab/catalog'
import { labRequest } from '../lab/state'
import { PRESETS } from '../lab/circuitPresets'
import { BUILTIN_PROBLEMS } from '../../teaching/problemBank'
import { ptext } from '../../teaching/problems'
import { openBuiltin } from '../problemMode'
import { TOPICS } from '../../handbook/topics'
import { conceptById } from '../../handbook/concepts'
import { openHandbook } from '../handbook'
import type { PathStep } from './paths'
import { stepKey } from './paths'

const T = <X extends { zh: string; en: string; de: string }>(t: X) => t[activeLang()] ?? t.zh

/** Display name of a step. */
export function stepTitle(s: PathStep): string {
  switch (s.kind) {
    case 'template': return templateById(s.id)?.name ?? s.id
    case 'lab': {
      const l = labInfo(s.id)
      const name = l?.title ?? s.id
      return s.preset && PRESETS[s.preset] ? `${name} · ${PRESETS[s.preset].label}` : name
    }
    case 'problem': { const p = BUILTIN_PROBLEMS.find(x => x.id === s.id); return p ? ptext(p.title, activeLang()) : s.id }
    case 'topic': { const t = TOPICS.find(x => x.id === s.id); return t ? T(t.title) : s.id }
    case 'concept': { const c = conceptById(s.id); return c ? T(c.title) : s.id }
  }
}

/** Kind label and icon of a step. */
export const KIND_META: Record<PathStep['kind'], { label: string; icon: string }> = trDeep({
  template: { label: '模板', icon: 'template' },
  lab: { label: '实验', icon: 'flask' },
  problem: { label: '题目', icon: 'problem' },
  topic: { label: '手册', icon: 'book' },
  concept: { label: '概念页', icon: 'book' }
})

/** The step was opened before (from the learning path). */
export const isDone = (s: PathStep) => settings.ui.learnDone.includes(stepKey(s))

/** Mark a step done or not. */
export function setDone(s: PathStep, on: boolean) {
  const k = stepKey(s)
  const list = settings.ui.learnDone.filter(x => x !== k)
  if (on) list.push(k)
  settings.ui.learnDone = list
}

/** Load a template (with its defaults) into the studio and run it. */
export async function openTemplate(id: string): Promise<boolean> {
  const t = templateById(id)
  if (!t) return false
  if (state.dirty && !(await ask(tl('当前场景有未保存的修改，确定要用模板替换吗？')))) return false
  loadScene(buildTemplate(id), null)
  state.page = 'studio'
  state.rightTab = 'formula'
  logEvent('template.open', { template: id })
  return true
}

/** Show an experiment of the lab, optionally at a circuit preset. */
export function openLab(id: string, preset?: string): boolean {
  const l = labInfo(id)
  if (!l || l.planned) return false
  settings.ui.lab = id
  state.page = 'lab'
  if (preset) { labRequest.lab = id; labRequest.preset = preset; labRequest.seq++ }
  return true
}

/** Show a handbook topic, concept page (`concept:<id>`) or formula. */
export function openTopic(id: string) {
  openHandbook(null)
  state.handbookTopic = id
}

/** Open a step of the learning path and mark it done. */
export async function openStep(s: PathStep): Promise<boolean> {
  let ok = false
  switch (s.kind) {
    case 'template': ok = await openTemplate(s.id); break
    case 'lab': ok = openLab(s.id, s.preset); break
    case 'problem': { const p = BUILTIN_PROBLEMS.find(x => x.id === s.id); ok = p ? await openBuiltin(p) : false; break }
    case 'topic': openTopic(s.id); ok = true; break
    case 'concept': openTopic(`concept:${s.id}`); ok = true; break
  }
  if (ok) { setDone(s, true); state.showLearning = false; logEvent('learn.open', { step: stepKey(s) }) }
  return ok
}
