/**
 * Templates of 26.57 (D112): the incline with separate static and kinetic friction and an initial velocity along
 * the slope (manual §5.4, VP-04). The 26.48 template 'incline' keeps its single μ (μs = μk) and its fingerprint;
 * this one names both coefficients, starts the block in the middle of a longer slope (room to slide up and back) and
 * adds readouts along the slope: the displacement s and the velocity vₛ from the initial position, down positive,
 * written as custom quantities of the scene so that they are ordinary, exportable quantities.
 *
 * Presets (the gallery's chips, the teaching package and the task samples): the three branches of M07 — slides
 * down, sticks, slides up and decides again at rest — the threshold tan θ = μs, and a smooth slope.
 */
import { tl } from '../i18n'
import type { Scene } from '../core/scene/types'
import { DEG, atan, cos, sin } from '../core/math/dmath'
import { addBody, addGround, addIncline, defaultGravity, emptyScene, onIncline } from '../core/scene/build'
import type { TemplateInfo, TemplateParam } from './index'

const p = (key: string, label: string, unit: string, value: number, min?: number, max?: number, step?: number): TemplateParam => ({ key, label, unit, value, min, max, step })
const gp = (): TemplateParam => p('g', '重力加速度 g', 'm/s²', defaultGravity(), 0)
/** Full-precision literal of a number in an expression. */
const lit = (v: number) => (Object.is(v, -0) ? '0' : String(v))

/** Length of the slope's base (m) and the distance of the block from the top along the slope (m). */
export const INCLINE2_BASE = 5
export const INCLINE2_START = 1.8

/** Ids of the along-slope readouts (custom quantities). */
export const ALONG = { s: 'custom.s', vs: 'custom.vs', as: 'custom.as' } as const

function inclineFriction(v: Record<string, number>): Scene {
  const s = emptyScene(tl('斜面：静摩擦与动摩擦'))
  s.description = tl('物块放在固定斜面上，静摩擦因数 μs 与动摩擦因数 μk 分开给出；初速度沿斜面（向下为正，负值表示向上）。静止时用 mg sinθ ≤ μs·mg cosθ 判定能否保持静止；滑动时摩擦力 μk·mg cosθ 与相对滑动方向相反；向上滑到速度为零后重新判定。')
  const th = v.theta * DEG, base = v.base ?? INCLINE2_BASE
  addIncline(s, { id: 'incline', angle: th, base, material: { muS: v.muS, muK: v.muK } })
  addGround(s, { id: 'ground', top: 0, left: base, right: base + 14, material: { muS: v.muS, muK: v.muK } })
  const w = 0.3, h = 0.2
  const pl = onIncline(th, base, INCLINE2_START, w, h)
  const c = cos(th), sn = sin(th)
  addBody(s, { id: 'block', name: tl('物块'), role: 'block', shape: { type: 'box', width: w, height: h }, position: pl.position, angle: pl.angle, velocity: { x: v.v0 * c, y: 0 - v.v0 * sn }, mass: v.m, material: { muS: v.muS, muK: v.muK } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 2
  s.view = { center: { x: base * 0.48, y: base * Math.tan(th) * 0.48 }, pixelsPerMeter: Math.max(20, Math.min(160, 600 / base)) }
  const x0 = pl.position.x, y0 = pl.position.y
  // Along the slope from the initial position, down positive: s = (x − x₀)cosθ − (y − y₀)sinθ
  s.customQuantities = [
    { id: 's', name: tl('沿斜面的位移 s（向下为正）'), expr: `(x(block) - ${lit(x0)})*${lit(c)} - (y(block) - ${lit(y0)})*${lit(sn)}` },
    { id: 'vs', name: tl('沿斜面的速度 vₛ（向下为正）'), expr: `vx(block)*${lit(c)} - vy(block)*${lit(sn)}` },
    { id: 'as', name: tl('沿斜面的加速度 aₛ（向下为正）'), expr: `ax(block)*${lit(c)} - ay(block)*${lit(sn)}` }
  ]
  s.watch = [ALONG.s, ALONG.vs, ALONG.as, 'contact.block|incline.N', 'contact.block|incline.f']
  return s
}

/** A named set of template values (gallery chips, teaching packages, task samples). */
export interface TemplatePreset { id: string; name: string; description: string; values: Record<string, number> }

/** Threshold angle of μs = 0.25 (tan θ = μs), in degrees. */
const THRESHOLD = atan(0.25) / DEG

export const TEMPLATES_2657: TemplateInfo[] = [
  {
    id: 'incline-friction', group: '斜面与摩擦', name: '斜面：静摩擦与动摩擦', description: 'μs 与 μk 分开；初速度可沿斜面向上或向下；三种分支',
    params: [p('theta', '倾角 θ', '°', 30, 1, 80), p('m', '质量 m', 'kg', 2, 0.01), p('muS', '静摩擦因数 μs', '', 0.25, 0, 2, 0.01), p('muK', '动摩擦因数 μk', '', 0.2, 0, 2, 0.01), p('v0', '沿斜面的初速度 v₀（向下为正）', 'm/s', 0, -8, 8, 0.1), p('base', '斜面底边长 L', 'm', INCLINE2_BASE, 1, 60, 0.5), gp()],
    build: inclineFriction,
    presets: [
      { id: 'down', name: '下滑', description: 'tanθ > μs，从静止开始下滑', values: { theta: 30, muS: 0.25, muK: 0.2, v0: 0 } },
      { id: 'stick', name: '静止', description: 'tanθ ≤ μs，静摩擦等于 mg sinθ（小于最大值）', values: { theta: 20, muS: 0.5, muK: 0.4, v0: 0 } },
      { id: 'up-back', name: '上滑后下滑', description: '先向上滑，速度为零后 tanθ > μs，再向下滑', values: { theta: 30, muS: 0.25, muK: 0.2, v0: -3 } },
      { id: 'up-stop', name: '上滑后静止', description: '先向上滑，速度为零后 tanθ ≤ μs，停在斜面上', values: { theta: 15, muS: 0.4, muK: 0.3, v0: -2 } },
      { id: 'threshold', name: '临界', description: 'tanθ = μs：理想模型中恰好保持静止', values: { theta: THRESHOLD, muS: 0.25, muK: 0.2, v0: 0 } },
      { id: 'smooth', name: '光滑', description: 'μs = μk = 0：a = g sinθ', values: { theta: 30, muS: 0, muK: 0, v0: 0 } }
    ]
  }
]
