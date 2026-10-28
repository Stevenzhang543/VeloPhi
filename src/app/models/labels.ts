/**
 * Labels of the model registry in the interface (26.56, D105): stage, maturity, status, geometry, reference kinds
 * and condition states. Chinese source keys read through `trDeep`, so the tables follow the language.
 */
import { trDeep, activeLang } from '../../i18n'
import type { Tri } from '../../i18n/tri'
import type { Geometry, Level, ReferenceKind, Stage, Status } from '../../content/models/types'
import type { ModelState } from '../../engine/models'

export const STAGE_TEXT: Record<Stage, string> = trDeep({ j: '初中', s: '高中', u: '大学', g: '研究生' })

export const LEVEL_TEXT: Record<Level, string> = trDeep({
  0: 'L0 概念',
  1: 'L1 受限解析',
  2: 'L2 交互数值仿真',
  3: 'L3 已验证能力'
})

export const STATUS_TEXT: Record<Status, string> = trDeep({ verified: '已验证', partial: '部分实现', unverified: '存在但待验证', missing: '未实现', deferred: '明确暂缓' })

export const TEACHING_TEXT: Record<0 | 1 | 2, string> = trDeep({ 0: '无教学活动', 1: '有教学内容', 2: '有活动与证据收集' })

export const GEOMETRY_TEXT: Record<Geometry, string> = trDeep({
  point: '质点（一维或平面）',
  plane: '平面运动',
  section2d: '二维截面（每米或给定厚度）',
  plane3d: '三维源在平面内求值',
  axisym: '轴对称三维',
  line1d: '一维连续体',
  lumped: '集中参数电路',
  space3d: '三维',
  abstract: '无空间几何'
})

/** How independent a reference is (FOR06). */
export const REFERENCE_TEXT: Record<ReferenceKind, string> = trDeep({
  analytic: '独立解析参照',
  otherMethod: '另一方法或实现',
  experiment: '实测数据',
  sameSource: '同源一致性（不作正确性证据）'
})

export const STATE_TEXT: Record<ModelState, string> = trDeep({ applicable: '适用', notApplicable: '不适用', insufficient: '信息不足', approximate: '近似适用' })

export const T3 = (t: Tri | undefined): string => (t ? t[activeLang()] ?? t.zh : '')
