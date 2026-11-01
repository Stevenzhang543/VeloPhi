/**
 * From a task to its demonstration, its practice and a transfer question (26.57, D116; manual §3.2 items 6–7):
 * the mechanics tasks open their template with the task's values (the result can then be located at its time), the
 * static ones open their experiment with the task's circuit, lens or charges. The transfer task changes one
 * condition of the task (a different branch, a different connection, the other kind of lens, a negative test
 * charge) so that the same concept is used again.
 */
import type { TaskDomain, TaskSpec } from '../../task/types'
import { applyPatch } from '../../task/build'
import { value } from '../../task/build'
import { buildTemplate } from '../../templates'
import { loadScene, state } from '../store'
import { settings } from '../settings'
import { labTaskRequest } from '../lab/state'
import { openActivity } from '../learn/actions'
import { bindToCurrentScene } from './taskState'

const DEG = Math.PI / 180

/** Open the demonstration of a task; `seekTo` shows that time once it is computed. */
export function openDemo(task: TaskSpec, seekTo?: number): boolean {
  const v = (ref: string, d = 0) => value(task, ref) ?? d
  switch (task.domain) {
    case 'incline': {
      const smooth = task.assumptions.some(a => a.id === 'smooth')
      const d = Math.max(0, ...task.conditions.map(c => Math.abs(c.valueSI)))
      const theta = v('incline.theta', 30 * DEG)
      const base = Math.max(5, (1.8 + d + 1.5) * Math.cos(theta))
      const scene = buildTemplate('incline-friction', { theta: theta / DEG, m: v('blockA.mass', 1), muS: smooth ? 0 : v('contact.muS', v('contact.muK')), muK: smooth ? 0 : v('contact.muK'), v0: v('blockA.v0'), g: v('gravity.g', 9.8), base })
      return show(scene, seekTo)
    }
    case 'projectile': {
      const v0 = v('ball.v0'), al = v('ball.alpha'), h0 = v('ball.h0'), g = v('gravity.g', 9.8)
      const scene = buildTemplate('projectile', { v0, alpha: al / DEG, h: h0, g, m: v('ball.mass', 0.1) })
      // 26.57 (hand check): the template's ground ends at 30 m; a longer throw would leave it and fall for ever.
      // The demonstration lengthens the ground past the landing point and stops shortly after the landing.
      const vy = v0 * Math.sin(al), vx = v0 * Math.cos(al)
      const tLand = g > 0 ? (vy + Math.sqrt(Math.max(0, vy * vy + 2 * g * h0))) / g : NaN
      if (Number.isFinite(tLand)) {
        const reach = vx * tLand
        const ground = scene.bodies.find(b => b.id === 'ground')
        if (ground && ground.shape.type === 'box' && reach + 3 > 30) {
          const left = -1, right = reach + 5
          ground.shape.width = right - left
          ground.position = { x: (left + right) / 2, y: ground.position.y }
        }
        scene.settings.duration = Math.max(0.5, tLand + 0.5)
      }
      return show(scene, seekTo)
    }
    case 'collision': {
      const kind = task.options?.kind
      const e = kind === 'elastic' ? 1 : kind === 'perfectlyInelastic' ? 0 : v('contact.e', 1)
      const scene = buildTemplate('collision-1d', { m1: v('A.mass', 1), m2: v('B.mass', 1), v0: v('A.u', 1), e })
      const B = scene.bodies.find(b => b.id === 'B')
      if (B) B.velocity = { x: v('B.u'), y: 0 }
      return show(scene, seekTo)
    }
    case 'circuit':
      return lab('circuit', { series: (task.options?.connection ?? 'series') === 'series', E: v('source.E'), r: v('source.r'), R1: v('R1.R', 1), R2: v('R2.R', 1) })
    case 'lens':
      return lab('lens', { f: v('lens.f', 0.1), u: v('object.u', 0.3), h: value(task, 'object.h') })
    case 'field': {
      const charges = [{ x: v('q1.x'), y: v('q1.y'), q: v('q1.q') }]
      if (v('q2.q') !== 0) charges.push({ x: v('q2.x'), y: v('q2.y'), q: v('q2.q') })
      return lab('field', { charges, probe: { x: v('P.x'), y: v('P.y') }, testQ: value(task, 'test.q') ?? 1e-9 })
    }
  }
}

function show(scene: ReturnType<typeof buildTemplate>, seekTo?: number): boolean {
  loadScene(scene, null)
  state.page = 'studio'
  if (seekTo !== undefined && Number.isFinite(seekTo)) state.pendingSeek = seekTo
  // the results of the task belong to this scene now: editing it makes them stale
  bindToCurrentScene()
  return true
}

function lab(id: string, payload: Record<string, unknown>): boolean {
  settings.ui.lab = id
  state.page = 'lab'
  labTaskRequest.lab = id
  labTaskRequest.payload = payload
  labTaskRequest.seq++
  return true
}

/** The activity that practises a domain. */
export const PRACTICE: Record<TaskDomain, string> = { incline: 'act-incline', projectile: 'act-projectile', collision: 'act-collision', circuit: 'act-series', lens: 'act-lens', field: 'act-field' }
export function openPractice(domain: TaskDomain): boolean { return openActivity(PRACTICE[domain]) }

/** A transfer task: the same question with one condition changed (Chinese source text says which). */
export function transferTask(task: TaskSpec): { task: TaskSpec; change: string } {
  const t = { ...task, taskId: `${task.taskId}-transfer`, revision: task.revision }
  switch (task.domain) {
    case 'incline': {
      const theta = value(task, 'incline.theta') ?? 30 * DEG
      const muS = value(task, 'contact.muS') ?? 0.25
      // the other side of tan θ = μs: a sliding block becomes one that stays, and the other way round
      const sliding = Math.tan(theta) > muS
      const next = sliding ? Math.atan(muS) * 0.7 : Math.min(Math.atan(muS) * 1.4, 80 * DEG)
      return { task: applyPatch(t, { set: [{ ref: 'incline.theta', valueSI: next, unit: 'rad', source: 'user' }], title: (task.title ?? '') + '（迁移）' }), change: sliding ? '把倾角改小到 tanθ < μs：物块还会滑吗？摩擦力是多少？' : '把倾角改大到 tanθ > μs：物块开始下滑，加速度是多少？' }
    }
    case 'projectile': return { task: applyPatch(t, { set: [{ ref: 'ball.h0', valueSI: (value(task, 'ball.h0') ?? 0) + 10, unit: 'm', source: 'user' }] }), change: '从高 10 m 的平台以同样的速度抛出：飞行时间与射程如何变化？' }
    case 'collision': return { task: applyPatch(t, { options: { kind: task.options?.kind === 'elastic' ? 'perfectlyInelastic' : 'elastic' } }), change: task.options?.kind === 'elastic' ? '同样的两个物体碰后粘在一起：共同速度与动能损失是多少？' : '同样的两个物体发生弹性碰撞：碰后速度各是多少？' }
    case 'circuit': return { task: applyPatch(t, { options: { connection: task.options?.connection === 'parallel' ? 'series' : 'parallel' } }), change: task.options?.connection === 'parallel' ? '同样的电阻改为串联：电流与路端电压怎样变化？' : '同样的电阻改为并联：电流与路端电压怎样变化？' }
    case 'lens': {
      const f = value(task, 'lens.f') ?? 0.1
      return { task: applyPatch(t, { set: [{ ref: 'object.u', valueSI: Math.abs(f) / 2, unit: 'm', source: 'user' }] }), change: '把物体移到焦点以内（u = f/2）：像的位置与性质如何变化？' }
    }
    case 'field': {
      const q = value(task, 'test.q') ?? 1e-9
      return { task: applyPatch(t, { set: [{ ref: 'test.q', valueSI: -q, unit: 'C', source: 'user' }] }), change: '把试探电荷换成等量的异号电荷：受力的方向如何变化？场强呢？' }
    }
  }
}
