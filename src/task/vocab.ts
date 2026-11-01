/**
 * Controlled vocabulary of tasks (26.57, D110): the quantities a target can name, the assumptions, and for each of
 * the six domains of the first phase its entities, known values, frames and the targets it can answer. The
 * parser, the manual editor, validation and the solver all read these tables — a target is never bound to a bare
 * symbol (manual §6.5). Labels are Chinese source texts (tl() translates them).
 */
import type { Component, FrameDef, TaskDomain } from './types'

/** A quantity kind: SI unit, scalar or vector, and its name. */
export interface QuantitySpec { unit: string; vector: boolean; label: string }

export const QUANTITIES: Record<string, QuantitySpec> = {
  position: { unit: 'm', vector: true, label: '位置' },
  displacement: { unit: 'm', vector: true, label: '位移' },
  distance: { unit: 'm', vector: false, label: '路程' },
  height: { unit: 'm', vector: false, label: '高度' },
  range: { unit: 'm', vector: false, label: '射程' },
  velocity: { unit: 'm/s', vector: true, label: '速度' },
  acceleration: { unit: 'm/s²', vector: true, label: '加速度' },
  time: { unit: 's', vector: false, label: '时间' },
  normalForce: { unit: 'N', vector: true, label: '支持力' },
  frictionForce: { unit: 'N', vector: true, label: '摩擦力' },
  frictionWork: { unit: 'J', vector: false, label: '摩擦力做的功' },
  kineticEnergy: { unit: 'J', vector: false, label: '动能' },
  energyLoss: { unit: 'J', vector: false, label: '损失的机械能' },
  momentum: { unit: 'kg·m/s', vector: true, label: '动量' },
  motionState: { unit: '', vector: false, label: '运动状态' },
  current: { unit: 'A', vector: false, label: '电流' },
  voltage: { unit: 'V', vector: false, label: '电压' },
  power: { unit: 'W', vector: false, label: '功率' },
  resistance: { unit: 'Ω', vector: false, label: '电阻' },
  imageDistance: { unit: 'm', vector: false, label: '像距' },
  magnification: { unit: '1', vector: false, label: '放大率' },
  imageHeight: { unit: 'm', vector: false, label: '像高' },
  imageNature: { unit: '', vector: false, label: '像的性质' },
  fieldStrength: { unit: 'V/m', vector: true, label: '电场强度' },
  fieldDirection: { unit: 'rad', vector: false, label: '电场方向' },
  potential: { unit: 'V', vector: false, label: '电势' },
  electricForce: { unit: 'N', vector: true, label: '电场力' }
}

/** An assumption: id → label (Chinese source text). */
export const ASSUMPTIONS: Record<string, string> = {
  fixedIncline: '斜面固定',
  uniformGravity: '匀强重力场',
  coulombFriction: '库仑摩擦（静摩擦不超过 μsN，滑动时 f = μkN）',
  muEqual: '只给出一个摩擦因数：按 μs = μk 处理',
  pointMass: '物体看作质点（不翻转）',
  noAirResistance: '忽略空气阻力',
  headOn: '正碰（一维）',
  noExternalImpulse: '碰撞过程系统不受外力冲量',
  idealWires: '导线电阻为零',
  linearResistors: '电阻为线性（欧姆）电阻',
  idealSource: '电源内阻为零',
  thinLens: '薄透镜、近轴光线',
  realObject: '实物（在透镜左侧）',
  pointCharges: '点电荷，真空',
  zeroAtInfinity: '电势零点在无穷远'
}

/** A known value of a domain. */
export interface GivenSpec {
  ref: string
  label: string
  symbol: string
  unit: string
  /** Default value and why it may be used (recorded as source 'default'). */
  fallback?: { value: number; note: string }
  min?: number
  max?: number
  /** It is an initial condition (stored in `initialConditions`). */
  initial?: boolean
}

/** A target a domain can answer. */
export interface TargetSpec {
  key: string
  label: string
  quantity: string
  component?: Component
  entity: string[]
  frame: string
  /** Given refs it needs (beyond the ones every target of the domain needs). */
  needs: string[]
  /** How it is evaluated by default. */
  at: 'static' | 'start' | 'condition' | 'time' | 'event-after' | 'event-before' | 'landing' | 'apex' | 'stop'
  /** Condition kind for 'condition' targets (the value is asked for). */
  condition?: { kind: 'displacementEquals' | 'heightEquals' | 'velocityEquals'; component: Component; unit: string; label: string }
  answerDomain?: string
  /** Search words of this target (T26). */
  words: string[]
}

/** A domain of the first phase. */
export interface DomainSpec {
  id: TaskDomain
  label: string
  entities: Record<string, string>
  frames: FrameDef[]
  givens: GivenSpec[]
  /** Givens every target needs. */
  base: string[]
  assumptions: string[]
  options?: Record<string, { label: string; choices: Record<string, string>; default: string }>
  targets: TargetSpec[]
  /** Template (or lab) the demonstration and the verification use. */
  scene: { template?: string; lab?: string }
  /** Model families of the analytic plan. */
  models: string[]
}

const G = (ref: string, label: string, symbol: string, unit: string, extra: Partial<GivenSpec> = {}): GivenSpec => ({ ref, label, symbol, unit, ...extra })
const gDefault = { value: 9.8, note: '题目未给出 g：采用项目默认 9.8 m/s²（可修改）' }

export const DOMAINS: Record<TaskDomain, DomainSpec> = {
  incline: {
    id: 'incline', label: '固定斜面上的物块',
    entities: { blockA: '物块', incline: '斜面' },
    frames: [{ id: 'incline-ground', kind: 'incline', origin: 'blockA.initialPosition', positiveAxis: 'downIncline' }, { id: 'ground', kind: 'ground' }],
    givens: [
      G('blockA.mass', '质量', 'm', 'kg', { min: 0 }),
      G('incline.theta', '倾角', '\\theta', 'rad', { min: 0, max: Math.PI / 2 }),
      G('contact.muS', '静摩擦因数', '\\mu_s', '1', { min: 0 }),
      G('contact.muK', '动摩擦因数', '\\mu_k', '1', { min: 0 }),
      G('gravity.g', '重力加速度', 'g', 'm/s²', { min: 0, fallback: gDefault }),
      G('blockA.v0', '沿斜面的初速度（向下为正）', 'v_0', 'm/s', { initial: true })
    ],
    base: ['incline.theta', 'contact.muK', 'gravity.g', 'blockA.v0'],
    assumptions: ['fixedIncline', 'uniformGravity', 'coulombFriction', 'pointMass'],
    targets: [
      { key: 'state', label: '运动状态（静止、下滑或上滑）', quantity: 'motionState', entity: ['blockA'], frame: 'incline-ground', needs: ['contact.muS'], at: 'start', words: ['会不会滑', '是否滑动', '静止', '运动状态', '能否静止'] },
      { key: 'a', label: '沿斜面的加速度（向下为正）', quantity: 'acceleration', component: 'tangent', entity: ['blockA'], frame: 'incline-ground', needs: ['contact.muS'], at: 'start', words: ['加速度'] },
      { key: 'N', label: '支持力大小', quantity: 'normalForce', component: 'magnitude', entity: ['blockA'], frame: 'ground', needs: ['blockA.mass'], at: 'start', words: ['支持力', '压力', '弹力'] },
      { key: 'f', label: '摩擦力大小', quantity: 'frictionForce', component: 'magnitude', entity: ['blockA'], frame: 'incline-ground', needs: ['blockA.mass', 'contact.muS'], at: 'start', words: ['摩擦力'] },
      { key: 'speedAtS', label: '沿斜面移动 d 时的速率', quantity: 'velocity', component: 'magnitude', entity: ['blockA'], frame: 'incline-ground', needs: ['contact.muS'], at: 'condition', condition: { kind: 'displacementEquals', component: 'tangent', unit: 'm', label: '沿斜面的位移 d' }, answerDomain: 'nonnegative', words: ['速率', '速度大小', '速度', '第一次到达'] },
      { key: 'timeAtS', label: '沿斜面移动 d 所用的时间', quantity: 'time', entity: ['blockA'], frame: 'incline-ground', needs: ['contact.muS'], at: 'condition', condition: { kind: 'displacementEquals', component: 'tangent', unit: 'm', label: '沿斜面的位移 d' }, answerDomain: 'first', words: ['时间', '多久', '第一次到达'] },
      { key: 'workAtS', label: '移动 d 的过程中摩擦力做的功', quantity: 'frictionWork', entity: ['blockA'], frame: 'incline-ground', needs: ['blockA.mass', 'contact.muS'], at: 'condition', condition: { kind: 'displacementEquals', component: 'tangent', unit: 'm', label: '沿斜面的位移 d' }, words: ['摩擦功', '摩擦力做功', '摩擦力做的功', '克服摩擦'] },
      { key: 'speedAtT', label: 't 时刻的速度（沿斜面，向下为正）', quantity: 'velocity', component: 'tangent', entity: ['blockA'], frame: 'incline-ground', needs: ['contact.muS'], at: 'time', words: ['速度'] },
      { key: 'sAtT', label: 't 时刻沿斜面的位移（向下为正）', quantity: 'displacement', component: 'tangent', entity: ['blockA'], frame: 'incline-ground', needs: ['contact.muS'], at: 'time', words: ['位移'] },
      { key: 'stopS', label: '上滑的最大距离（速度减为 0 时）', quantity: 'distance', entity: ['blockA'], frame: 'incline-ground', needs: [], at: 'stop', words: ['最大距离', '最远', '上滑距离'] }
    ],
    scene: { template: 'incline-friction' },
    models: ['M07', 'M02']
  },
  projectile: {
    id: 'projectile', label: '抛体运动',
    entities: { ball: '小球' },
    frames: [{ id: 'ground', kind: 'ground', origin: 'ball.initialPosition' }],
    givens: [
      G('ball.v0', '初速度大小', 'v_0', 'm/s', { min: 0, initial: true }),
      G('ball.alpha', '抛射角（仰角）', '\\alpha', 'rad', { min: -Math.PI / 2, max: Math.PI / 2, initial: true }),
      G('ball.h0', '抛出点高度（高于落地面）', 'h_0', 'm', { min: 0, fallback: { value: 0, note: '题目未给出抛出高度：按从落地面抛出（h₀ = 0）处理' } }),
      G('gravity.g', '重力加速度', 'g', 'm/s²', { min: 0, fallback: gDefault }),
      G('ball.mass', '质量', 'm', 'kg', { min: 0 })
    ],
    base: ['ball.v0', 'ball.alpha', 'ball.h0', 'gravity.g'],
    assumptions: ['uniformGravity', 'noAirResistance', 'pointMass'],
    targets: [
      { key: 'R', label: '水平射程', quantity: 'range', entity: ['ball'], frame: 'ground', needs: [], at: 'landing', words: ['射程', '水平距离', '落点'] },
      { key: 'T', label: '飞行时间', quantity: 'time', entity: ['ball'], frame: 'ground', needs: [], at: 'landing', words: ['飞行时间', '落地时间', '多长时间落地'] },
      { key: 'H', label: '最高点高出抛出点的高度', quantity: 'height', entity: ['ball'], frame: 'ground', needs: [], at: 'apex', words: ['最大高度', '最高点'] },
      { key: 'timeAtY', label: '到达高度 y 的时刻', quantity: 'time', entity: ['ball'], frame: 'ground', needs: [], at: 'condition', condition: { kind: 'heightEquals', component: 'y', unit: 'm', label: '相对抛出点的高度 y' }, answerDomain: 'first', words: ['到达高度', '经过高度', '第一次到达', '两次'] },
      { key: 'speedLand', label: '落地时的速率', quantity: 'velocity', component: 'magnitude', entity: ['ball'], frame: 'ground', needs: [], at: 'landing', words: ['落地速度', '落地时的速度', '着地速度'] },
      { key: 'vyAtT', label: 't 时刻的竖直速度（向上为正）', quantity: 'velocity', component: 'y', entity: ['ball'], frame: 'ground', needs: [], at: 'time', words: ['竖直速度', '竖直分速度'] }
    ],
    scene: { template: 'projectile' },
    models: ['M04', 'M02']
  },
  collision: {
    id: 'collision', label: '一维碰撞',
    entities: { A: '物体 A', B: '物体 B' },
    frames: [{ id: 'ground', kind: 'ground', positiveAxis: 'right' }],
    givens: [
      G('A.mass', 'A 的质量', 'm_1', 'kg', { min: 0 }),
      G('B.mass', 'B 的质量', 'm_2', 'kg', { min: 0 }),
      G('A.u', 'A 碰前的速度（向右为正）', 'u_1', 'm/s', { initial: true }),
      G('B.u', 'B 碰前的速度（向右为正）', 'u_2', 'm/s', { initial: true }),
      G('contact.e', '恢复系数', 'e', '1', { min: 0, max: 1 })
    ],
    base: ['A.mass', 'B.mass', 'A.u', 'B.u'],
    assumptions: ['headOn', 'noExternalImpulse'],
    options: { kind: { label: '碰撞类型', choices: { elastic: '弹性碰撞（e = 1）', inelastic: '非弹性碰撞（给出 e）', perfectlyInelastic: '完全非弹性碰撞（碰后粘合，e = 0）' }, default: 'elastic' } },
    targets: [
      { key: 'v1', label: 'A 碰后的速度（向右为正）', quantity: 'velocity', component: 'signed', entity: ['A'], frame: 'ground', needs: [], at: 'event-after', words: ['碰后速度', '碰撞后'] },
      { key: 'v2', label: 'B 碰后的速度（向右为正）', quantity: 'velocity', component: 'signed', entity: ['B'], frame: 'ground', needs: [], at: 'event-after', words: ['碰后速度', '碰撞后'] },
      { key: 'loss', label: '碰撞中损失的动能', quantity: 'energyLoss', entity: ['A', 'B'], frame: 'ground', needs: [], at: 'event-after', words: ['损失', '动能损失', '机械能损失', '转化为内能'] },
      { key: 'p', label: '系统总动量', quantity: 'momentum', component: 'signed', entity: ['A', 'B'], frame: 'ground', needs: [], at: 'event-before', words: ['总动量', '动量'] }
    ],
    scene: { template: 'collision-1d' },
    models: ['M17', 'M18']
  },
  circuit: {
    id: 'circuit', label: '直流串并联电路',
    entities: { source: '电源', R1: '电阻 R₁', R2: '电阻 R₂' },
    frames: [],
    givens: [
      G('source.E', '电源电动势', 'E', 'V', { min: 0 }),
      G('source.r', '电源内阻', 'r', 'Ω', { min: 0, fallback: { value: 0, note: '题目未给出内阻：按理想电源（r = 0）处理' } }),
      G('R1.R', '电阻 R₁', 'R_1', 'Ω', { min: 0 }),
      G('R2.R', '电阻 R₂', 'R_2', 'Ω', { min: 0 })
    ],
    base: ['source.E', 'source.r', 'R1.R', 'R2.R'],
    assumptions: ['idealWires', 'linearResistors'],
    options: { connection: { label: '连接方式', choices: { series: '串联', parallel: '并联' }, default: 'series' } },
    targets: [
      { key: 'I', label: '干路电流', quantity: 'current', entity: ['source'], frame: '', needs: [], at: 'static', words: ['电流', '总电流', '干路电流', '电流表'] },
      { key: 'U', label: '路端电压', quantity: 'voltage', entity: ['source'], frame: '', needs: [], at: 'static', words: ['路端电压', '端电压', '电压表'] },
      { key: 'U1', label: 'R₁ 两端的电压', quantity: 'voltage', entity: ['R1'], frame: '', needs: [], at: 'static', words: ['电压', 'R1 两端'] },
      { key: 'U2', label: 'R₂ 两端的电压', quantity: 'voltage', entity: ['R2'], frame: '', needs: [], at: 'static', words: ['电压', 'R2 两端'] },
      { key: 'I1', label: '通过 R₁ 的电流', quantity: 'current', entity: ['R1'], frame: '', needs: [], at: 'static', words: ['通过 R1', '支路电流'] },
      { key: 'I2', label: '通过 R₂ 的电流', quantity: 'current', entity: ['R2'], frame: '', needs: [], at: 'static', words: ['通过 R2', '支路电流'] },
      { key: 'P1', label: 'R₁ 消耗的功率', quantity: 'power', entity: ['R1'], frame: '', needs: [], at: 'static', words: ['功率', '电功率', '消耗'] },
      { key: 'P2', label: 'R₂ 消耗的功率', quantity: 'power', entity: ['R2'], frame: '', needs: [], at: 'static', words: ['功率', '电功率', '消耗'] },
      { key: 'Rt', label: '外电路总电阻', quantity: 'resistance', entity: ['R1', 'R2'], frame: '', needs: [], at: 'static', words: ['总电阻', '等效电阻'] }
    ],
    scene: { lab: 'circuit' },
    models: ['E09', 'E12']
  },
  lens: {
    id: 'lens', label: '薄透镜成像',
    entities: { lens: '透镜', object: '物体' },
    frames: [],
    givens: [
      G('lens.f', '焦距（凸透镜为正，凹透镜为负）', 'f', 'm'),
      G('object.u', '物距', 'u', 'm', { min: 0 }),
      G('object.h', '物高', 'h', 'm', { min: 0 })
    ],
    base: ['lens.f', 'object.u'],
    assumptions: ['thinLens', 'realObject'],
    targets: [
      { key: 'v', label: '像距（正为实像，负为虚像）', quantity: 'imageDistance', entity: ['lens'], frame: '', needs: [], at: 'static', words: ['像距', '成像位置', '光屏'] },
      { key: 'm', label: '放大率（负为倒立）', quantity: 'magnification', entity: ['lens'], frame: '', needs: [], at: 'static', words: ['放大率', '放大倍数'] },
      { key: 'hi', label: '像高', quantity: 'imageHeight', entity: ['lens'], frame: '', needs: ['object.h'], at: 'static', words: ['像高', '像的大小'] },
      { key: 'nature', label: '像的性质（虚实、正倒、大小）', quantity: 'imageNature', entity: ['lens'], frame: '', needs: [], at: 'static', words: ['像的性质', '成什么像', '实像', '虚像', '倒立', '正立'] }
    ],
    scene: { lab: 'lens' },
    models: ['O04']
  },
  field: {
    id: 'field', label: '点电荷的电场',
    entities: { q1: '电荷 1', q2: '电荷 2', P: '场点 P', test: '试探电荷' },
    frames: [{ id: 'ground', kind: 'ground' }],
    givens: [
      G('q1.q', '电荷 1 的电荷量', 'q_1', 'C'),
      G('q1.x', '电荷 1 的 x 坐标', 'x_1', 'm'),
      G('q1.y', '电荷 1 的 y 坐标', 'y_1', 'm', { fallback: { value: 0, note: '未给出 y：两个电荷与场点在 x 轴上' } }),
      G('q2.q', '电荷 2 的电荷量', 'q_2', 'C', { fallback: { value: 0, note: '只有一个电荷：q₂ = 0' } }),
      G('q2.x', '电荷 2 的 x 坐标', 'x_2', 'm', { fallback: { value: 0, note: '只有一个电荷：q₂ 的位置不影响结果' } }),
      G('q2.y', '电荷 2 的 y 坐标', 'y_2', 'm', { fallback: { value: 0, note: '未给出 y：两个电荷与场点在 x 轴上' } }),
      G('P.x', '场点 P 的 x 坐标', 'x_P', 'm'),
      G('P.y', '场点 P 的 y 坐标', 'y_P', 'm', { fallback: { value: 0, note: '未给出 y：两个电荷与场点在 x 轴上' } }),
      G('test.q', '试探电荷的电荷量', 'q', 'C')
    ],
    base: ['q1.q', 'q1.x', 'q1.y', 'q2.q', 'q2.x', 'q2.y', 'P.x', 'P.y'],
    assumptions: ['pointCharges', 'zeroAtInfinity'],
    targets: [
      { key: 'E', label: 'P 点的电场强度大小', quantity: 'fieldStrength', component: 'magnitude', entity: ['P'], frame: 'ground', needs: [], at: 'static', words: ['场强', '电场强度'] },
      { key: 'dir', label: 'P 点电场的方向（与 +x 轴的夹角）', quantity: 'fieldDirection', entity: ['P'], frame: 'ground', needs: [], at: 'static', words: ['方向', '场强方向', '电场方向'] },
      { key: 'V', label: 'P 点的电势', quantity: 'potential', entity: ['P'], frame: 'ground', needs: [], at: 'static', words: ['电势'] },
      { key: 'F', label: '试探电荷在 P 点受的电场力大小', quantity: 'electricForce', component: 'magnitude', entity: ['test'], frame: 'ground', needs: ['test.q'], at: 'static', words: ['电场力', '受力', '库仑力'] },
      { key: 'Fdir', label: '试探电荷受力的方向（与 +x 轴的夹角）', quantity: 'fieldDirection', entity: ['test'], frame: 'ground', needs: ['test.q'], at: 'static', words: ['受力方向', '力的方向'] }
    ],
    scene: { lab: 'field' },
    models: ['E02', 'E01']
  }
}

/** The target spec of a domain by key. */
export function targetSpec(domain: TaskDomain, key: string): TargetSpec | undefined { return DOMAINS[domain].targets.find(t => t.key === key) }
/** The given spec of a domain by ref. */
export function givenSpec(domain: TaskDomain, ref: string): GivenSpec | undefined { return DOMAINS[domain].givens.find(g => g.ref === ref) }
