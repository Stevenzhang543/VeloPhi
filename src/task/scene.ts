/**
 * From a scene to a task (26.57, D110; manual §3.3, T01): recognising the physical setting of a scene is not knowing
 * what the user wants. A scene built from a template proposes its domain and the targets it can answer, ranked by
 * relevance, and fills the known values from the scene (source 'scene'); no target is chosen until the user picks
 * one. A scene of another kind says so instead of guessing.
 */
import type { Scene } from '../core/scene/types'
import type { Given, TaskDomain, TaskSpec } from './types'
import { makeTask } from './build'
import { DOMAINS } from './vocab'
import type { TargetSpec } from './vocab'

const DEG = Math.PI / 180

/** What a scene offers. */
export interface SceneSuggestion { domain: TaskDomain | null; message: string; params?: Array<string | number>; targets: TargetSpec[]; task: TaskSpec | null }

const sc = (ref: string, valueSI: number, unit: string): Given => ({ ref, valueSI, unit, source: 'scene', status: 'adopted', revision: 1 })

/** The setting of a scene and the targets it can answer (none chosen). */
export function suggestFromScene(scene: Scene): SceneSuggestion {
  const tpl = (scene.extra as { template?: { id: string; values: Record<string, number> } } | undefined)?.template
  const v = tpl?.values ?? {}
  let domain: TaskDomain | null = null
  let task: TaskSpec | null = null
  if (tpl?.id === 'incline-friction' || tpl?.id === 'incline') {
    domain = 'incline'
    const muS = tpl.id === 'incline' ? v.mu : v.muS, muK = tpl.id === 'incline' ? v.mu : v.muK
    task = makeTask('incline', { title: scene.name, stem: { text: scene.description || scene.name, source: 'scene' }, entityBindings: { blockA: 'block', incline: 'incline' } })
    task.givens = [sc('blockA.mass', v.m, 'kg'), sc('incline.theta', v.theta * DEG, 'rad'), sc('contact.muS', muS, '1'), sc('contact.muK', muK, '1'), sc('gravity.g', v.g, 'm/s²')]
    task.initialConditions = [sc('blockA.v0', tpl.id === 'incline' ? 0 : v.v0, 'm/s')]
    // the single-μ template keeps μs = μk (26.48 meaning), said as an assumption
    if (tpl.id === 'incline') task.assumptions.push({ id: 'muEqual', source: 'scene' })
  } else if (tpl?.id === 'projectile') {
    domain = 'projectile'
    task = makeTask('projectile', { title: scene.name, stem: { text: scene.description || scene.name, source: 'scene' }, entityBindings: { ball: 'ball' } })
    task.givens = [sc('ball.h0', v.h, 'm'), sc('gravity.g', v.g, 'm/s²'), sc('ball.mass', v.m, 'kg')]
    task.initialConditions = [sc('ball.v0', v.v0, 'm/s'), sc('ball.alpha', v.alpha * DEG, 'rad')]
  } else if (tpl?.id === 'collision-1d') {
    domain = 'collision'
    const B = scene.bodies.find(b => b.id === 'B')
    task = makeTask('collision', { title: scene.name, stem: { text: scene.description || scene.name, source: 'scene' }, entityBindings: { A: 'A', B: 'B' }, options: { kind: v.e === 1 ? 'elastic' : v.e === 0 ? 'perfectlyInelastic' : 'inelastic' } })
    task.givens = [sc('A.mass', v.m1, 'kg'), sc('B.mass', v.m2, 'kg'), sc('contact.e', v.e, '1')]
    task.initialConditions = [sc('A.u', v.v0, 'm/s'), sc('B.u', B?.velocity?.x ?? 0, 'm/s')]
  } else if (scene.bodies.some(b => b.role === 'incline' && b.kind === 'static') && !scene.bodies.some(b => b.role === 'incline' && b.kind !== 'static') && scene.bodies.some(b => b.kind !== 'static')) {
    // only a fixed incline is the fixed-incline task: a movable wedge has other physics (T05)
    domain = 'incline'
  }
  if (!domain) return { domain: null, message: '这个场景不属于一期支持的六类题型；可以用“手动填写”描述题目，或者从示例开始。', targets: [], task: null }
  const d = DOMAINS[domain]
  return {
    domain, task,
    message: task ? '识别到“{0}”。可以求下面这些量，请选择本次的目标（不会替你猜题意）：' : '识别到“{0}”，但场景不是由模板建立的，已知量需要手动填写。可以求：',
    params: [d.label],
    targets: d.targets
  }
}
