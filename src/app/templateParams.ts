/**
 * Template parameters of the current scene in one place (26.59, D173): a scene built from a template remembers the
 * template and its values (`scene.extra.template`); changing a parameter rebuilds the scene from the template as one
 * undoable edit, keeping the camera, the run length and the AI reading notes. Used by the "题目参数" card in the
 * properties tab and by Copilot's `set_parameters`.
 */
import { edit, state } from './store'
import { buildTemplate, templateById } from '../templates'
import type { TemplateInfo } from '../templates'
import { tl } from '../i18n'

export interface CurrentTemplate { info: TemplateInfo; values: Record<string, number> }

/** The template the current scene was built from, with its values; null for a hand-built or edited-away scene. */
export function currentTemplate(): CurrentTemplate | null {
  const t = (state.scene.extra as { template?: { id?: unknown; values?: unknown } } | undefined)?.template
  if (!t || typeof t.id !== 'string') return null
  const info = templateById(t.id)
  if (!info) return null
  const values: Record<string, number> = {}
  const stored = (t.values && typeof t.values === 'object' ? t.values : {}) as Record<string, unknown>
  for (const p of info.params) values[p.key] = typeof stored[p.key] === 'number' ? (stored[p.key] as number) : p.value
  return { info, values }
}

/** Rebuild the current template scene with some values changed (display units of the parameters). */
export function applyTemplateParams(changes: Record<string, number>): { ok: true; values: Record<string, number> } | { ok: false; error: string } {
  const cur = currentTemplate()
  if (!cur) return { ok: false, error: tl('当前场景不是由模板建立的') }
  const values = { ...cur.values }
  for (const [k, v] of Object.entries(changes)) {
    const p = cur.info.params.find(x => x.key === k)
    if (!p) return { ok: false, error: tl('模板 {0} 没有参数 {1}', [cur.info.id, k]) }
    if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, error: tl('参数 {0} 应为数值', [k]) }
    values[k] = v
  }
  let next
  try { next = buildTemplate(cur.info.id, values) } catch (e) { return { ok: false, error: (e as Error).message } }
  const prev = state.scene
  next.view = prev.view
  // A problem or an AI reading fixes the run length; templates are unbounded otherwise
  next.settings.duration = prev.settings.duration
  next.watch = prev.watch.length ? prev.watch : next.watch
  next.extra = { ...(prev.extra ?? {}), ...(next.extra ?? {}), template: { id: cur.info.id, values } }
  next.name = prev.name || next.name
  edit(s => {
    for (const k of Object.keys(s)) delete (s as unknown as Record<string, unknown>)[k]
    Object.assign(s, next)
  })
  return { ok: true, values }
}
