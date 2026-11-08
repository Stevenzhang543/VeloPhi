/**
 * The curriculum map in the app (26.62, D222): titles, icons and open actions for the resources that a topic,
 * experiment or component points at (src/curriculum/links.ts, components.ts), and the extra resources that the
 * model families themselves link to (templates, problems, formula situations). `describe` returns null for an id
 * the app does not have — tests/curriculum2662.test.ts requires that never to happen.
 */
import { tl, activeLang } from '../i18n'
import { state } from './store'
import { TEMPLATES } from '../templates'
import { LABS } from './lab/catalog'
import { PRESETS } from './lab/circuitPresets'
import { ACTIVITIES } from '../teaching/activities'
import { LESSONS } from '../teaching/lessons/defs'
import { BUILTIN_PROBLEMS } from '../teaching/problemBank'
import { ptext } from '../teaching/problems'
import { TOPICS } from '../handbook/topics'
import { conceptById } from '../handbook/concepts'
import { modelById, linksOf } from '../content/models'
import { FEATURES } from '../curriculum/features'
import type { Resource, ResourceKind } from '../curriculum/types'
import { openActivity, openLab, openTemplate, openTopic } from './learn/actions'
import { openLesson } from './lessons'
import { openBuiltin } from './problemMode'
import { openHandbook } from './handbook'

export interface Described { kind: ResourceKind; id: string; title: string; icon: string; open: () => unknown }

const KIND_ICON: Record<ResourceKind, string> = { model: 'layers', template: 'template', lab: 'flask', preset: 'battery', activity: 'graduation', lesson: 'graduation', problem: 'problem', handbook: 'book', formula: 'phi', feature: 'settings' }
export const KIND_LABEL: Record<ResourceKind, string> = { model: '模型', template: '模板', lab: '实验', preset: '电路预设', activity: '活动', lesson: '课堂实验', problem: '题目', handbook: '手册', formula: '公式', feature: '功能' }

const tri = (t: { zh: string; en: string; de: string }) => t[activeLang()] ?? t.zh

/** Open a workflow of features.ts. */
export function openFeature(id: string): boolean {
  switch (id) {
    case 'prediction': state.page = 'studio'; state.rightTab = 'predict'; return true
    case 'sweep': state.page = 'studio'; state.showSweep = true; return true
    case 'report': state.page = 'studio'; state.showReport = true; return true
    case 'export': state.page = 'studio'; state.showExport = true; return true
    case 'repro': state.showAbout = true; return true
    case 'solverCompare': state.page = 'studio'; state.showSolverCompare = true; return true
    case 'lessons': return openLesson(LESSONS[0].id, true)
    case 'learning': state.showLearning = true; return true
    case 'task': state.page = 'studio'; state.rightTab = 'task'; return true
    case 'problems': state.page = 'studio'; state.showProblems = true; return true
    case 'fbd': state.page = 'studio'; state.showFbd = true; return true
    case 'tape': state.page = 'studio'; state.showTape = true; return true
    case 'copilot': state.page = 'studio'; state.showCopilot = true; return true
    case 'courseware': state.showCourseware = true; return true
    case 'units': state.page = 'settings'; state.settingsSection = 'units'; return true
    case 'handbook': openHandbook(null); return true
    case 'watch': state.page = 'studio'; state.rightTab = 'watch'; return true
    case 'chart': state.page = 'studio'; state.bottomTab = 'chart'; return true
  }
  return false
}

/** Title, icon and action of a resource; null when the app has no such id. */
export function describe(r: Resource): Described | null {
  const base = { kind: r.kind, id: r.id, icon: KIND_ICON[r.kind] }
  switch (r.kind) {
    case 'model': { const m = modelById(r.id); return m ? { ...base, title: `${m.id} ${tri(m.title)}`, open: () => { state.modelId = m.id; state.showModels = true } } : null }
    case 'template': { const t = TEMPLATES.find(x => x.id === r.id); return t ? { ...base, title: t.name, open: () => openTemplate(t.id) } : null }
    case 'lab': { const l = LABS.find(x => x.id === r.id); return l && !l.planned ? { ...base, icon: l.icon, title: l.title, open: () => openLab(l.id) } : null }
    case 'preset': { const p = PRESETS[r.id]; return p && r.lab === 'circuit' ? { ...base, title: `${tl('电路')} · ${p.label}`, open: () => openLab('circuit', r.id) } : null }
    case 'activity': { const a = ACTIVITIES.find(x => x.id === r.id); return a ? { ...base, title: tri(a.title), open: () => openActivity(a.id) } : null }
    case 'lesson': { const l = LESSONS.find(x => x.id === r.id); return l ? { ...base, title: tl('课堂实验：{0}', [tri(l.title)]), open: () => openLesson(l.id) } : null }
    case 'problem': { const p = BUILTIN_PROBLEMS.find(x => x.id === r.id); return p ? { ...base, title: ptext(p.title, activeLang()), open: () => openBuiltin(p) } : null }
    case 'handbook': {
      if (r.id.startsWith('concept:')) { const c = conceptById(r.id.slice(8)); return c ? { ...base, title: tri(c.title), open: () => openTopic(r.id) } : null }
      const t = TOPICS.find(x => x.id === r.id); return t ? { ...base, title: tri(t.title), open: () => openTopic(t.id) } : null
    }
    case 'formula': return { ...base, title: r.id, open: () => openHandbook(r.id) }
    case 'feature': { const f = FEATURES[r.id]; return f ? { ...base, title: tri(f), open: () => openFeature(r.id) } : null }
  }
}

/** The resources of a topic plus what its model families link to (templates, problems), without duplicates. */
export function expand(list: Resource[]): Resource[] {
  const out: Resource[] = [...list]
  const has = (k: ResourceKind, id: string) => out.some(r => r.kind === k && r.id === id)
  for (const r of list) {
    if (r.kind !== 'model') continue
    const m = modelById(r.id)
    if (!m) continue
    const l = linksOf(m)
    for (const t of l.templates ?? []) if (!has('template', t)) out.push({ kind: 'template', id: t })
    for (const p of l.problems ?? []) if (!has('problem', p)) out.push({ kind: 'problem', id: p })
    for (const a of l.activities ?? []) if (!has('activity', a)) out.push({ kind: 'activity', id: a })
  }
  return out
}

