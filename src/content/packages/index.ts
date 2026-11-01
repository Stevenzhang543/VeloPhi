/**
 * Teaching packages, first batch of 24 (26.57, D122; manual §9.2–9.3, §9.7, VP-13). A package is not a model entry:
 * it is a demonstration with standard, boundary and contrast presets, an explanation, practice in four roles
 * (concept, calculation, modelling/conditions, transfer), mistakes with graded hints, independent references and a
 * review record. Its progress is computed from what exists in the code — the presets open real templates or labs,
 * the practice items are real activities, problems or task samples — in six separate fields
 * (discoverable → runnable → explainable → practisable → transferable → trialled), never claimed by hand. No package
 * is “trialled”: there are no learner trials yet.
 */
import type { TaskDomain } from '../../task/types'
import { TEMPLATES } from '../../templates'
import { MODELS } from '../models'
import { ACTIVITIES } from '../../teaching/activities'
import { BUILTIN_PROBLEMS } from '../../teaching/problemBank'

/** Content version of the packages of this release (learning records keep it, D125). */
export const PACKAGE_CONTENT_VERSION = '26.57.1'

export interface PackageDemo { role: 'standard' | 'boundary' | 'contrast'; label: string; template?: string; values?: Record<string, number>; lab?: string; preset?: string }
export interface PackagePractice { role: 'concept' | 'calculation' | 'modelling' | 'transfer'; source: string }
export interface TeachingPackage {
  id: string
  title: string
  stage: 'j' | 's' | 'u'
  concept: string
  system: string
  /** What it answers (searched by goal, T26). */
  goals: string[]
  demos: PackageDemo[]
  practice: PackagePractice[]
  mistakes: string[]
  task?: TaskDomain
}

const D = (role: PackageDemo['role'], label: string, o: Omit<PackageDemo, 'role' | 'label'>): PackageDemo => ({ role, label, ...o })
/** The four roles of an activity (diagnosis, calculation, modelling, transfer). */
const act = (id: string): PackagePractice[] => (['concept', 'calculation', 'modelling', 'transfer'] as const).map(role => ({ role, source: id }))
const pr = (role: PackagePractice['role'], id: string): PackagePractice => ({ role, source: `problem:${id}` })
const tk = (role: PackagePractice['role'], d: TaskDomain): PackagePractice => ({ role, source: `task:${d}` })

export const PACKAGES: TeachingPackage[] = [
  { id: 'M01', title: '匀速运动与参考系', stage: 'j', concept: '速度不变时位移与时间成正比；位置、位移与相对速度依赖参考系', system: '水平面上的物块', goals: ['位置', '位移', '相对速度', '匀速'], demos: [D('standard', '匀速直线运动', { template: 'uniform-motion' }), D('contrast', '匀速与匀加速追及', { template: 'pursuit' })], practice: [], mistakes: ['把位移当路程', '忘记说明参考系'] },
  { id: 'M02', title: '匀变速直线运动', stage: 's', concept: '加速度恒定时 v(t)、x(t) 的闭式成立；停车后不能继续套用', system: '一个质点沿直线运动', goals: ['速度', '位移', '停车', '刹车', '分段'], demos: [D('standard', '拉力作用下的加速', { template: 'pull-force' }), D('boundary', '上滑到停下', { template: 'incline-friction', values: { theta: 15, muS: 0.4, muK: 0.3, v0: -2 } })], practice: [pr('calculation', 'k-pull')], mistakes: ['停车后仍按原加速度计算', '加速度符号与正方向不一致'] },
  { id: 'M03', title: '自由落体与事件时刻', stage: 's', concept: '下落与质量无关；落地是事件，碰前与碰后分开', system: '从高处释放的小球', goals: ['落地时间', '落地速度', '碰前', '碰后', '第一次到达'], demos: [D('standard', '5 m 高处释放', { template: 'free-fall', values: { h: 5 } }), D('boundary', '弹跳（e = 0.8）', { template: 'bouncing-ball' }), D('contrast', '20 m 高处释放', { template: 'free-fall', values: { h: 20 } })], practice: [...act('act-freefall'), pr('calculation', 'k-free-fall')], mistakes: ['认为重的先落地', '把碰后速度当落地速度'] },
  { id: 'M04', title: '斜抛运动', stage: 's', concept: '水平匀速与竖直匀变速的合成；同一高度可能经过两次', system: '抛出的小球', goals: ['射程', '最大高度', '飞行时间', '第一次到达', '两次经过', '落地速度'], demos: [D('standard', '30° 斜抛', { template: 'projectile', values: { v0: 20, alpha: 30, h: 0 } }), D('boundary', '平抛（α = 0）', { template: 'projectile', values: { v0: 10, alpha: 0, h: 5 } }), D('contrast', '60° 斜抛（与 30° 射程相同）', { template: 'projectile', values: { v0: 20, alpha: 60, h: 0 } })], practice: [...act('act-projectile'), pr('calculation', 'p-oblique'), tk('modelling', 'projectile')], mistakes: ['认为最高点速度为零', '两个根都当答案或随意取一个'], task: 'projectile' },
  { id: 'M06', title: '两绳悬挂与静力平衡', stage: 's', concept: '隔离结点，三力平衡；绳越接近水平张力越大', system: '两根绳挂起的重物', goals: ['张力', '平衡', '拉密定理'], demos: [D('standard', '两绳悬挂', { template: 'two-ropes' })], practice: [], mistakes: ['把重物的重力直接当成绳的张力'] },
  { id: 'M07', title: '粗糙斜面滑动', stage: 's', concept: '静止、下滑、上滑三个分支；静摩擦等于所需值，不总是 μsN', system: '固定斜面上的物块', goals: ['加速度', '摩擦力', '摩擦功', '支持力', '能否静止', '沿斜面移动', '第一次到达', '上滑距离'], demos: [D('standard', '下滑', { template: 'incline-friction', values: { theta: 30, muS: 0.25, muK: 0.2, v0: 0 } }), D('boundary', '临界 tanθ = μs', { template: 'incline-friction', values: { theta: 14.036243467926479, muS: 0.25, muK: 0.2, v0: 0 } }), D('contrast', '上滑后再判断', { template: 'incline-friction', values: { theta: 30, muS: 0.25, muK: 0.2, v0: -3 } })], practice: [...act('act-incline'), pr('calculation', 'k-incline'), pr('modelling', 'f-incline-rest'), tk('transfer', 'incline')], mistakes: ['静摩擦总写成 μsN', '上滑时摩擦方向仍向上', '速度为零后继续用原分支'], task: 'incline' },
  { id: 'M08', title: '静摩擦阈值与滑动切换', stage: 's', concept: '静摩擦随外力变化，最大为 μsN；超过后为滑动摩擦', system: '水平面上被推的木箱', goals: ['静摩擦力', '最大静摩擦', '开始滑动'], demos: [D('standard', '6 N 推力（静止）', { template: 'pull-force', values: { F: 6, mu: 0.4, m: 2, g: 10 } }), D('boundary', '8 N 推力（临界）', { template: 'pull-force', values: { F: 8, mu: 0.4, m: 2, g: 10 } }), D('contrast', '9 N 推力（滑动）', { template: 'pull-force', values: { F: 9, mu: 0.4, m: 2, g: 10 } })], practice: act('act-static'), mistakes: ['静止时也用 μN 计算摩擦力'] },
  { id: 'M11', title: '阿特伍德机', stage: 's', concept: '整体法求加速度，隔离法求张力', system: '跨过定滑轮的两物块', goals: ['加速度', '绳的张力'], demos: [D('standard', 'm₁ = 1 kg、m₂ = 1.5 kg', { template: 'atwood' }), D('boundary', '质量相等', { template: 'atwood', values: { m1: 1, m2: 1 } })], practice: [pr('calculation', 'n-atwood')], mistakes: ['把张力当作 m₂g'] },
  { id: 'M12', title: '动滑轮与绳长约束', stage: 's', concept: '绳长不变给出位移与速度的比例', system: '动滑轮下的物块', goals: ['约束', '加速度之比'], demos: [D('standard', '动滑轮', { template: 'movable-pulley' })], practice: [], mistakes: ['认为两物块加速度相等'] },
  { id: 'M13', title: '板块与相对滑动', stage: 's', concept: '相对滑动到共速；热量等于摩擦力乘相对路程', system: '物块与木板', goals: ['共速', '相对位移', '热量'], demos: [D('standard', '物块滑上木板', { template: 'board-block' })], practice: [pr('calculation', 'n-board')], mistakes: ['用对地位移算摩擦热'] },
  { id: 'M14', title: '传送带与共速事件', stage: 's', concept: '摩擦方向由相对运动决定，共速后分段', system: '传送带上的物块', goals: ['共速时间', '摩擦方向', '相对滑动'], demos: [D('standard', '水平传送带', { template: 'conveyor' }), D('contrast', '倾斜传送带', { template: 'conveyor-incline' })], practice: [pr('calculation', 'n-conveyor')], mistakes: ['共速后仍有滑动摩擦'] },
  { id: 'M16', title: '弹簧与能量交换', stage: 's', concept: '动能与弹性势能相互转化', system: '弹簧振子', goals: ['最大速度', '弹性势能'], demos: [D('standard', '弹簧振子', { template: 'spring' }), D('contrast', '弹簧连接体', { template: 'spring-blocks' })], practice: [pr('calculation', 'o-spring')], mistakes: ['忘记弹性势能'] },
  { id: 'M17', title: '一维弹性碰撞', stage: 's', concept: '动量与动能都守恒；等质量交换速度', system: '光滑面上两个小球', goals: ['碰后速度', '碰前', '碰后', '动量守恒', '反弹'], demos: [D('standard', '1 kg 碰 2 kg', { template: 'collision-1d', values: { m1: 1, m2: 2, v0: 3, e: 1 } }), D('boundary', '等质量交换速度', { template: 'collision-1d', values: { m1: 1, m2: 1, v0: 3, e: 1 } }), D('contrast', '完全非弹性', { template: 'collision-1d', values: { m1: 1, m2: 2, v0: 3, e: 0 } })], practice: [...act('act-collision'), pr('calculation', 'm-elastic'), tk('transfer', 'collision')], mistakes: ['速度不带符号', '把碰前速度当碰后'], task: 'collision' },
  { id: 'M18', title: '完全非弹性碰撞', stage: 's', concept: '动量守恒、机械能不守恒；损失转化为内能', system: '碰后粘合的两物体', goals: ['共同速度', '动能损失'], demos: [D('standard', '碰后粘合', { template: 'collision-1d', values: { m1: 1, m2: 2, v0: 3, e: 0 } })], practice: [pr('calculation', 'm-inelastic'), tk('modelling', 'collision')], mistakes: ['认为机械能守恒'] },
  { id: 'M21', title: '杠杆与力矩平衡', stage: 'j', concept: '动力×动力臂 = 阻力×阻力臂', system: '支在中点的杠杆', goals: ['力臂', '力矩', '省力'], demos: [D('standard', '杠杆平衡', { template: 'lever' })], practice: [pr('calculation', 'f-lever')], mistakes: ['把杆长当力臂'] },
  { id: 'M24', title: '竖直圆周与轻绳', stage: 's', concept: '绳只能拉；最高点最小速度 √(gL)', system: '绳拴小球在竖直面内运动', goals: ['最小速度', '绳的拉力', '松弛'], demos: [D('standard', '绳', { template: 'vertical-circle-rope' }), D('contrast', '杆', { template: 'vertical-circle-rod' })], practice: [pr('calculation', 'c-rope')], mistakes: ['认为最高点速度可以为零'] },
  { id: 'W02', title: '单摆与小角近似', stage: 's', concept: '小角时周期 2π√(L/g)；大角时变长', system: '单摆', goals: ['周期', '小角近似'], demos: [D('standard', '5° 摆角', { template: 'pendulum', values: { theta0: 5 } }), D('contrast', '60° 摆角', { template: 'pendulum', values: { theta0: 60 } })], practice: [pr('calculation', 'o-pendulum')], mistakes: ['大摆角也用小角公式'] },
  { id: 'E01', title: '库仑力与叠加', stage: 's', concept: '同号相斥、异号相吸；力按矢量叠加', system: '两个点电荷', goals: ['库仑力', '电场力', '方向'], demos: [D('standard', '两个带电小球', { template: 'two-charges' }), D('contrast', '等量异种电荷的场', { lab: 'field', preset: 'dipole' })], practice: [tk('calculation', 'field')], mistakes: ['力的方向弄反'] },
  { id: 'E02', title: '电场线与合场', stage: 's', concept: '场线表示场强方向，不是粒子轨迹；负电荷受力与场强反向', system: '点电荷的电场', goals: ['场强', '电场强度', '电场方向', '电势', '负电荷受力', '探针'], demos: [D('standard', '等量异种电荷', { lab: 'field', preset: 'dipole' }), D('boundary', '单个正电荷', { lab: 'field', preset: 'single' }), D('contrast', '等量同种电荷', { lab: 'field', preset: 'pair' })], practice: [...act('act-field'), tk('calculation', 'field')], mistakes: ['把场线当轨迹', '负电荷受力方向与场强相同'], task: 'field' },
  { id: 'E04', title: '电势 电势能与功', stage: 's', concept: '电场力做功等于电势能减少；电势差有意义', system: '静电场中的电荷', goals: ['电势', '电势能', '电场力做功'], demos: [D('standard', '等量异种电荷的电势', { lab: 'field', preset: 'dipole' })], practice: [], mistakes: ['电势为零处场强也为零'] },
  { id: 'E06', title: '电容器与储能', stage: 's', concept: '接电源时 U 不变，断开电源时 Q 不变', system: '平行板电容器', goals: ['电容', '储能', '断开电源'], demos: [D('standard', '平行板电容器', { lab: 'capacitor' })], practice: [], mistakes: ['断开电源后仍认为电压不变'] },
  { id: 'E09', title: '串并联电路', stage: 'j', concept: '串联电流处处相等，并联电压相等；内阻使路端电压降低', system: '直流电路', goals: ['电流', '电压', '功率', '电表', '电流表', '电压表', '总电阻'], demos: [D('standard', '串联', { lab: 'circuit', preset: 'series' }), D('contrast', '并联', { lab: 'circuit', preset: 'parallel' }), D('boundary', '混联（有内阻）', { lab: 'circuit', preset: 'mixed' })], practice: [...act('act-series'), tk('calculation', 'circuit')], mistakes: ['电流被电阻“用掉”', '忽略内阻'], task: 'circuit' },
  { id: 'O01', title: '平面镜与反射', stage: 'j', concept: '反射角等于入射角，角度从法线量起', system: '平面镜', goals: ['反射角', '法线'], demos: [D('standard', '光的反射', { lab: 'rays' })], practice: [], mistakes: ['从镜面量角度'] },
  { id: 'O04', title: '薄透镜成像', stage: 'j', concept: '1/u + 1/v = 1/f；物在焦点以内成虚像', system: '凸透镜与物体', goals: ['像距', '放大率', '像的性质', '实像', '虚像', '光屏'], demos: [D('standard', '物在 f 与 2f 之间', { lab: 'lens' }), D('boundary', '物在焦点以内', { lab: 'lens' }), D('contrast', '凹透镜', { lab: 'lens' })], practice: [...act('act-lens'), tk('calculation', 'lens')], mistakes: ['虚像也画在光屏上', '放大率的符号含义'], task: 'lens' }
]

/** The six progress fields of a package (manual §9.7), with the reasons a field is not met. */
export interface PackageStatus { discoverable: boolean; runnable: boolean; explainable: boolean; practisable: boolean; transferable: boolean; trialled: boolean; complete: boolean; missing: string[] }

const templateIds = new Set(TEMPLATES.map(t => t.id))
const LAB_IDS = new Set(['circuit', 'field', 'capacitor', 'magnet', 'lens', 'rays', 'wave-optics', 'hydrogen', 'photo', 'compton', 'decay', 'nuclear', 'heating', 'mixing', 'gas', 'relativity', 'waves', 'quantum'])
const activityIds = new Set(ACTIVITIES.map(a => a.id))
const problemIds = new Set(BUILTIN_PROBLEMS.map(p => p.id))

/** Whether a practice source exists. */
export function sourceExists(src: string): boolean {
  if (src.startsWith('problem:')) return problemIds.has(src.slice(8))
  if (src.startsWith('task:')) return ['incline', 'projectile', 'collision', 'circuit', 'lens', 'field'].includes(src.slice(5))
  return activityIds.has(src)
}

/** Progress of a package, from the content that exists. */
export function packageStatus(p: TeachingPackage): PackageStatus {
  const missing: string[] = []
  const model = MODELS.find(m => m.id === p.id)
  const discoverable = !!model && p.goals.length > 0
  if (!discoverable) missing.push('没有登记的模型族或目标词')
  const demosOk = p.demos.filter(d => (d.template ? templateIds.has(d.template) : !!d.lab && LAB_IDS.has(d.lab)))
  const runnable = demosOk.length > 0
  if (!runnable) missing.push('没有可运行的演示')
  const roles = new Set(demosOk.map(d => d.role))
  if (!(roles.has('standard') && roles.has('boundary') && roles.has('contrast'))) missing.push('标准、边界、对比预设不全')
  const explainable = !!model && !!model.example && (model.status === 'verified')
  if (!explainable) missing.push('缺少例题或模型尚未核验')
  const ok = p.practice.filter(x => sourceExists(x.source))
  const practiceRoles = new Set(ok.map(x => x.role))
  const practisable = (['concept', 'calculation', 'modelling'] as const).every(r => practiceRoles.has(r))
  if (!practisable) missing.push('练习不足四种角色（概念、计算、建模）')
  const transferable = practiceRoles.has('transfer')
  if (!transferable) missing.push('没有迁移题')
  missing.push('没有学生试用记录')
  const complete = discoverable && runnable && roles.size === 3 && explainable && practisable && transferable
  return { discoverable, runnable, explainable, practisable, transferable, trialled: false, complete, missing }
}

/** The package of a model family, if there is one. */
export function packageOf(modelId: string): TeachingPackage | undefined { return PACKAGES.find(p => p.id === modelId) }
