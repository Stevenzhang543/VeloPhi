/**
 * The six representative tasks (26.57, D116; manual §13.1 C, VP-09): one structured task per domain, written as a
 * task file would store it (schema 2), with its stem, known values and their sources, assumptions and targets.
 * They are the quality samples of the first phase: the task panel offers them, the teaching packages open them and
 * tests/task2657.test.ts checks every result against hand-computed references.
 */
import type { Given, TaskDomain, TaskSpec } from './types'
import { makeTarget, makeTask } from './build'

const DEG = Math.PI / 180
const st = (ref: string, valueSI: number, unit: string, raw?: string): Given => ({ ref, valueSI, unit, source: 'stem', status: 'adopted', revision: 1, raw })

/** A sample task by domain. */
export function sampleTask(domain: TaskDomain): TaskSpec {
  switch (domain) {
    case 'incline': {
      // manual §6.6: “2kg 的物块在固定 30° 斜面上从静止释放，μs=0.25，μk=0.2，g=9.8m/s²。求沿斜面移动 2m 时的速率。”
      const t = makeTask('incline', {
        taskId: 'sample-incline', title: '斜面上移动 2 m 时的速率',
        stem: { text: '2 kg 的物块在固定 30° 斜面上从静止释放，μs = 0.25，μk = 0.2，g = 9.8 m/s²。求沿斜面移动 2 m 时的速率。', source: 'pack' },
        givens: [st('blockA.mass', 2, 'kg', '2 kg'), st('incline.theta', 30 * DEG, 'rad', '30°'), st('contact.muS', 0.25, '1', 'μs = 0.25'), st('contact.muK', 0.2, '1', 'μk = 0.2'), st('gravity.g', 9.8, 'm/s²', 'g = 9.8 m/s²')],
        initialConditions: [st('blockA.v0', 0, 'm/s', '从静止释放')],
        assumptions: [{ id: 'fixedIncline', source: 'stem' }, { id: 'uniformGravity', source: 'model' }, { id: 'coulombFriction', source: 'model' }, { id: 'pointMass', source: 'model' }]
      })
      const sp = makeTarget(t, 'speedAtS', { conditionValue: 2 })
      t.targets = [sp.target]
      t.conditions = [sp.condition!]
      return t
    }
    case 'projectile': {
      const t = makeTask('projectile', {
        taskId: 'sample-projectile', title: '斜抛两次经过同一高度',
        stem: { text: '小球以 20 m/s 的速度、与水平面成 30° 斜向上抛出，忽略空气阻力，g = 9.8 m/s²。求小球第一次到达比抛出点高 3 m 处的时刻和射程。', source: 'pack' },
        givens: [st('ball.h0', 0, 'm', '从地面抛出'), st('gravity.g', 9.8, 'm/s²', 'g = 9.8 m/s²')],
        initialConditions: [st('ball.v0', 20, 'm/s', '20 m/s'), st('ball.alpha', 30 * DEG, 'rad', '30°')]
      })
      const ty = makeTarget(t, 'timeAtY', { conditionValue: 3, answerDomain: 'first' })
      t.targets = [ty.target, makeTarget(t, 'R').target]
      t.conditions = [ty.condition!]
      return t
    }
    case 'collision':
      return {
        ...makeTask('collision', {
          taskId: 'sample-collision', title: '一维弹性碰撞',
          stem: { text: '光滑水平面上，质量 1 kg 的小球 A 以 3 m/s 的速度与静止的质量 2 kg 的小球 B 发生弹性正碰。求碰后两球的速度。', source: 'pack' },
          givens: [st('A.mass', 1, 'kg', '1 kg'), st('B.mass', 2, 'kg', '2 kg')],
          initialConditions: [st('A.u', 3, 'm/s', '3 m/s'), st('B.u', 0, 'm/s', '静止')],
          options: { kind: 'elastic' }
        }),
        targets: [] as TaskSpec['targets']
      }
    case 'circuit':
      return makeTask('circuit', {
        taskId: 'sample-circuit', title: '有内阻电源的并联电路',
        stem: { text: '电动势 12 V、内阻 1 Ω 的电源，外接 6 Ω 与 3 Ω 两个并联电阻。求干路电流、路端电压和 3 Ω 电阻消耗的功率。', source: 'pack' },
        givens: [st('source.E', 12, 'V', '12 V'), st('source.r', 1, 'Ω', '1 Ω'), st('R1.R', 6, 'Ω', '6 Ω'), st('R2.R', 3, 'Ω', '3 Ω')],
        options: { connection: 'parallel' }
      })
    case 'lens':
      return makeTask('lens', {
        taskId: 'sample-lens', title: '凸透镜成像',
        stem: { text: '焦距 10 cm 的凸透镜，物体高 2 cm，放在透镜前 15 cm 处。求像距、放大率和像的性质。', source: 'pack' },
        givens: [st('lens.f', 0.1, 'm', '10 cm'), st('object.u', 0.15, 'm', '15 cm'), st('object.h', 0.02, 'm', '2 cm')]
      })
    case 'field':
      return makeTask('field', {
        taskId: 'sample-field', title: '两个点电荷的合场与负电荷受力',
        stem: { text: '电荷 +2 μC 位于 (0, 0)，电荷 −1 μC 位于 (0.3 m, 0)。求点 P(0.1 m, 0.1 m) 的电场强度大小和方向，以及 −1 nC 的试探电荷在 P 点受力的方向。', source: 'pack' },
        givens: [st('q1.q', 2e-6, 'C', '+2 μC'), st('q1.x', 0, 'm'), st('q1.y', 0, 'm'), st('q2.q', -1e-6, 'C', '−1 μC'), st('q2.x', 0.3, 'm', '0.3 m'), st('q2.y', 0, 'm'), st('P.x', 0.1, 'm', '0.1 m'), st('P.y', 0.1, 'm', '0.1 m'), st('test.q', -1e-9, 'C', '−1 nC')]
      })
  }
}

/** The targets of each sample (filled after construction where they need the task). */
export function sampleWithTargets(domain: TaskDomain): TaskSpec {
  const t = sampleTask(domain)
  if (t.targets.length) return t
  const keys: Record<TaskDomain, string[]> = { incline: [], projectile: [], collision: ['v1', 'v2'], circuit: ['I', 'U', 'P2'], lens: ['v', 'm', 'nature'], field: ['E', 'dir', 'Fdir'] }
  t.targets = keys[domain].map(k => makeTarget(t, k).target)
  return t
}

export const SAMPLE_DOMAINS: TaskDomain[] = ['incline', 'projectile', 'collision', 'circuit', 'lens', 'field']
