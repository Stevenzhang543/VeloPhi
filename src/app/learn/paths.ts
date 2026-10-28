/**
 * Learning paths (26.55, D96): the curriculum in teaching order — 初中, 高中必修 1–3, 选择性必修 1–3, 大学 — each
 * stage a list of units, each unit a list of steps: a template to run, an experiment of the lab, a built-in problem,
 * a handbook topic, a concept page or (26.56) a teaching activity. Progress is kept apart as visits, practice and
 * mastery evidence (learn/records.ts; the 26.55 `ui.learnDone` migrates to visits). Texts are Chinese
 * source keys read through `trDeep`.
 */
import { trDeep } from '../../i18n'

/** What a step opens (26.56: a teaching activity). */
export type StepKind = 'template' | 'lab' | 'problem' | 'topic' | 'concept' | 'activity'
/** One step of a unit: its kind and id (a circuit preset for the circuit lab). */
export interface PathStep { kind: StepKind; id: string; preset?: string }
export interface PathUnit { id: string; title: string; steps: PathStep[] }
export interface PathStage { id: string; title: string; summary: string; units: PathUnit[] }

const t = (id: string): PathStep => ({ kind: 'template', id })
const lab = (id: string, preset?: string): PathStep => (preset ? { kind: 'lab', id, preset } : { kind: 'lab', id })
const pb = (id: string): PathStep => ({ kind: 'problem', id })
const topic = (id: string): PathStep => ({ kind: 'topic', id })
const concept = (id: string): PathStep => ({ kind: 'concept', id })
const act = (id: string): PathStep => ({ kind: 'activity', id })

export const PATHS: PathStage[] = trDeep([
  {
    id: 'j', title: '初中', summary: '运动和力、压强与浮力、简单机械、电路、光、热与能源',
    units: [
      { id: 'j-motion', title: '运动和力', steps: [t('uniform-motion'), t('free-fall'), t('inertia'), t('two-ropes'), act('act-units'), topic('motion')] },
      { id: 'j-fluid', title: '压强与浮力', steps: [t('weigh-in-water'), t('floating-block'), act('act-float'), t('densities'), t('sinking-ball'), t('loaded-boat'), topic('fluids')] },
      { id: 'j-machine', title: '简单机械与功', steps: [t('lever'), t('wheel-axle'), t('movable-pulley'), t('incline-efficiency'), topic('energy')] },
      { id: 'j-circuit', title: '电路与欧姆定律', steps: [lab('circuit', 'series'), lab('circuit', 'parallel'), act('act-series'), lab('circuit', 'home'), lab('magnet')] },
      { id: 'j-light', title: '光现象与透镜', steps: [lab('rays'), lab('lens')] },
      { id: 'j-heat', title: '热与能源', steps: [lab('heating'), lab('mixing'), concept('energy')] }
    ]
  },
  {
    id: 's1a', title: '高中必修 1', summary: '匀变速直线运动、相互作用、牛顿运动定律',
    units: [
      { id: 's1-kin', title: '匀变速直线运动', steps: [t('free-fall'), act('act-freefall'), t('pull-force'), t('pursuit'), pb('k-free-fall'), pb('k-pull'), pb('k-incline'), topic('motion')] },
      { id: 's1-force', title: '相互作用与平衡', steps: [t('two-ropes'), t('incline'), act('act-static'), act('act-incline'), pb('f-incline-rest'), pb('f-lever'), pb('f-table-rest'), topic('friction')] },
      { id: 's1-newton', title: '牛顿运动定律', steps: [t('atwood'), t('table-pulley'), t('incline-pulley'), t('slope-up'), t('board-block'), t('conveyor'), t('elevator'), pb('n-atwood'), pb('n-table'), pb('n-board'), pb('n-conveyor')] }
    ]
  },
  {
    id: 's1b', title: '高中必修 2', summary: '抛体运动、圆周运动、万有引力、机械能',
    units: [
      { id: 's2-proj', title: '抛体运动', steps: [t('projectile'), t('bouncing-ball'), pb('p-oblique'), pb('p-horizontal'), pb('p-from-height')] },
      { id: 's2-circle', title: '圆周运动', steps: [t('uniform-circle'), t('vertical-circle-rope'), t('vertical-circle-rod'), pb('c-uniform'), pb('c-rod'), pb('c-rope'), topic('circular')] },
      { id: 's2-grav', title: '万有引力与宇宙航行', steps: [t('orbit'), t('cosmic-velocity'), t('kepler'), t('binary-star'), pb('g-circle'), pb('g-ellipse'), topic('gravitation')] },
      { id: 's2-energy', title: '机械能守恒', steps: [t('pendulum'), t('slope-up'), pb('e-pendulum'), pb('e-work'), pb('e-rod'), topic('energy')] }
    ]
  },
  {
    id: 's1c', title: '高中必修 3', summary: '静电场、电路及其应用、电磁场初步、能源',
    units: [
      { id: 's3-field', title: '静电场', steps: [lab('field'), t('two-charges'), t('charged-pendulum'), t('charge-deflection'), t('oscilloscope'), lab('capacitor'), topic('electric')] },
      { id: 's3-circuit', title: '电路及其应用', steps: [lab('circuit', 'divider'), act('act-meter'), lab('circuit', 'emf'), lab('circuit', 'ammeterConv'), lab('circuit', 'voltmeterConv'), lab('circuit', 'ohmmeter'), lab('circuit', 'rc'), act('act-rc')] },
      { id: 's3-em', title: '电磁场与电磁波初步', steps: [lab('magnet'), concept('energy')] }
    ]
  },
  {
    id: 's2a', title: '选择性必修 1', summary: '动量守恒、机械振动、机械波、光',
    units: [
      { id: 'x1-mom', title: '动量守恒定律', steps: [t('collision-1d'), t('collision-2d'), t('three-balls'), t('pendulum-collision'), t('spring-blocks'), t('movable-wedge'), pb('m-elastic'), pb('m-inelastic'), pb('m-spring'), topic('momentum')] },
      { id: 'x1-osc', title: '机械振动', steps: [t('spring'), t('vertical-spring'), t('pendulum'), t('damped-spring'), t('resonance'), pb('o-spring'), pb('o-pendulum'), topic('oscillation')] },
      { id: 'x1-wave', title: '机械波', steps: [lab('waves')] },
      { id: 'x1-light', title: '光的折射、干涉与衍射', steps: [lab('rays'), lab('wave-optics')] }
    ]
  },
  {
    id: 's2b', title: '选择性必修 2', summary: '磁场中的带电粒子、电磁感应、交变电流、传感器',
    units: [
      { id: 'x2-charge', title: '带电粒子在磁场中的运动', steps: [t('cyclotron'), t('bounded-field'), t('circular-field'), t('mass-spectrometer'), t('cyclotron-dees'), t('velocity-selector'), t('field-combo')] },
      { id: 'x2-induct', title: '电磁感应', steps: [t('rail-force'), act('act-rail'), t('rail-coast'), t('rail-fall'), lab('magnet'), lab('circuit', 'rl'), lab('circuit', 'generator'), topic('induction')] },
      { id: 'x2-ac', title: '交变电流与变压器', steps: [lab('circuit', 'lc'), act('act-lc'), lab('circuit', 'acR'), lab('circuit', 'rlc'), lab('circuit', 'rectifier'), lab('circuit', 'transformer'), lab('circuit', 'transmission')] },
      { id: 'x2-sensor', title: '传感器', steps: [lab('circuit', 'thermistor'), lab('circuit', 'ldr'), lab('circuit', 'fsr')] }
    ]
  },
  {
    id: 's2c', title: '选择性必修 3', summary: '分子动理论与气体、固体和液体、原子结构与原子核',
    units: [
      { id: 'x3-gas', title: '气体与热力学定律', steps: [lab('gas'), act('act-gas'), concept('solids')] },
      { id: 'x3-atom', title: '原子结构与波粒二象性', steps: [lab('photo'), lab('hydrogen'), lab('compton')] },
      { id: 'x3-nucleus', title: '原子核', steps: [lab('decay'), act('act-decay'), lab('nuclear'), act('act-chain')] }
    ]
  },
  {
    id: 'u', title: '大学', summary: '刚体、振动与混沌、有心力、相对论、量子力学与数学方法',
    units: [
      { id: 'u-rigid', title: '刚体力学', steps: [t('hinged-rod'), t('physical-pendulum'), t('rolling'), t('rolling-slip'), t('ball-rod'), t('gears'), t('motor-disc'), pb('r-rolling'), pb('r-slip'), topic('rotation')] },
      { id: 'u-osc', title: '耦合振动与混沌', steps: [t('coupled-oscillators'), t('double-pendulum'), t('resonance')] },
      { id: 'u-central', title: '有心力与两体问题', steps: [t('central-spring'), t('binary-star'), t('alpha-scattering'), t('drag-fall'), topic('drag')] },
      { id: 'u-modern', title: '相对论与量子', steps: [lab('relativity'), lab('quantum'), act('act-well'), act('act-packet'), concept('qft')] },
      { id: 'u-math', title: '数学方法', steps: [concept('math')] }
    ]
  }
])

/** Key of a step in the progress list. */
export function stepKey(s: PathStep): string {
  return s.preset ? `${s.kind}:${s.id}:${s.preset}` : `${s.kind}:${s.id}`
}
