/**
 * The actions of a teaching package (26.57, D122; manual §9.2, T26): 看演示 opens a demonstration preset (a template
 * with the preset's values, or a lab at a preset), 做练习 opens the first practice that exists (an activity, a
 * built-in problem or a task sample), 自由实验 opens the standard demonstration's template or lab without a fixed
 * question. Each action says whether it could open something; nothing is opened that does not exist.
 */
import { tl } from '../../i18n'
import type { PackageDemo, TeachingPackage } from '../../content/packages'
import { PACKAGES, sourceExists } from '../../content/packages'
import type { TaskDomain } from '../../task/types'
import { buildTemplate, templateById } from '../../templates'
import { BUILTIN_PROBLEMS } from '../../teaching/problemBank'
import { loadScene, state } from '../store'
import { ask } from '../../platform/ask'
import { openBuiltin } from '../problemMode'
import { logEvent } from '../trialLog'
import { openActivity, openLab } from './actions'
import { openSample } from '../task/taskState'

export { PACKAGES }

/** Open one demonstration preset of a package. */
export async function openPackageDemo(p: TeachingPackage, d: PackageDemo): Promise<boolean> {
  if (d.template) {
    if (!templateById(d.template)) return false
    if (state.dirty && !(await ask(tl('当前场景有未保存的修改，确定要用模板替换吗？')))) return false
    loadScene(buildTemplate(d.template, d.values ?? {}), null)
    state.page = 'studio'
    state.rightTab = 'formula'
    logEvent('package.demo', { package: p.id, role: d.role })
    return true
  }
  if (d.lab) { logEvent('package.demo', { package: p.id, role: d.role }); return openLab(d.lab, d.preset) }
  return false
}

/** The practice of a package that exists, in role order (concept, calculation, modelling, transfer). */
export function practiceOf(p: TeachingPackage): string | null {
  for (const role of ['concept', 'calculation', 'modelling', 'transfer'] as const) {
    const x = p.practice.find(q => q.role === role && sourceExists(q.source))
    if (x) return x.source
  }
  return null
}

/** Open a practice source: an activity id, `problem:<id>` or `task:<domain>`. */
export async function openPractice(src: string): Promise<boolean> {
  if (src.startsWith('problem:')) {
    const pr = BUILTIN_PROBLEMS.find(x => x.id === src.slice(8))
    if (!pr) return false
    await openBuiltin(pr)
    return true
  }
  if (src.startsWith('task:')) {
    openSample(src.slice(5) as TaskDomain)
    state.page = 'studio'
    state.rightTab = 'task'
    return true
  }
  return openActivity(src)
}

/** Open the package's practice (the first that exists). */
export async function openPackagePractice(p: TeachingPackage): Promise<boolean> {
  const src = practiceOf(p)
  if (!src) return false
  logEvent('package.practice', { package: p.id })
  return openPractice(src)
}

/** Free experiment: the standard demonstration's apparatus with its defaults (no fixed question). */
export async function openPackageExperiment(p: TeachingPackage): Promise<boolean> {
  const d = p.demos.find(x => x.role === 'standard') ?? p.demos[0]
  if (!d) return false
  logEvent('package.experiment', { package: p.id })
  if (d.template) return openPackageDemo(p, { ...d, values: {} })
  return d.lab ? openLab(d.lab) : false
}

/** The packages that answer a goal word (T26: search by what is asked, not only by model name). */
export function packagesForGoal(word: string): TeachingPackage[] {
  const w = word.trim()
  if (!w) return []
  return PACKAGES.filter(p => p.goals.some(g => g.includes(w) || w.includes(g)) || p.title.includes(w))
}
