/**
 * Template of the 26.59 fix: a ball thrown horizontally from the top A of an incline lands on the incline at B
 * (平抛落到斜面上) — a classic problem type the AI problem reader had no template for (it had to build the scene
 * itself). A is the origin; the incline is long enough for the landing point; the custom quantity AB is the
 * distance of the ball from A.
 */
import { tl } from '../i18n'
import type { Scene } from '../core/scene/types'
import { DEG, cos, sin, tan } from '../core/math/dmath'
import { addBody, addIncline, defaultGravity, emptyScene } from '../core/scene/build'
import type { TemplateInfo, TemplateParam } from './index'

const p = (key: string, label: string, unit: string, value: number, min?: number, max?: number, step?: number): TemplateParam => ({ key, label, unit, value, min, max, step })
const gp = (): TemplateParam => p('g', '重力加速度 g', 'm/s²', defaultGravity(), 0)

function projectileSlope(v: Record<string, number>): Scene {
  const s = emptyScene(tl('平抛落到斜面上'))
  s.description = tl('小球从倾角 θ 的斜面顶端 A 以 v₀ 水平抛出，落在斜面上的 B 点。')
  const th = v.theta * DEG, r = 0.03
  const g = Math.max(v.g, 0.1)
  // Point-particle flight: t = 2 v₀ tanθ / g, horizontal distance v₀ t; the incline reaches 30 % further
  const tFly = (2 * v.v0 * tan(th)) / g
  const xB = v.v0 * tFly
  const base = Math.max(2, 1.3 * xB + 1)
  const H = base * tan(th)
  addIncline(s, { id: 'slope', name: tl('斜面'), angle: th, base, x0: 0, y0: -H, material: { muS: 0.3, muK: 0.3, restitution: 0 } })
  addBody(s, { id: 'ball', name: tl('小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 0, y: r + 1e-3 }, velocity: { x: v.v0, y: 0 }, mass: v.m })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = Math.min(60, tFly * 1.4 + 0.3)
  s.settings.energyZeroY = r
  // AB: from A to the point of the ball nearest the incline (centre minus r along the incline's normal)
  const nx = Number((r * sin(th)).toPrecision(12)), ny = Number((r * cos(th)).toPrecision(12))
  s.customQuantities = [{ id: 'AB', name: tl('到 A 点的距离'), expr: `sqrt((x(ball) - ${nx})*(x(ball) - ${nx}) + (y(ball) - ${ny})*(y(ball) - ${ny}))` }]
  const span = Math.max(1, xB)
  s.view = { center: { x: span * 0.55, y: -span * tan(th) * 0.45 }, pixelsPerMeter: Math.max(4, Math.min(400, 520 / span)) }
  s.watch = ['ball.x', 'ball.y', 'ball.vx', 'ball.vy', 'ball.v', 'custom.AB']
  return s
}

export const TEMPLATES_2659: TemplateInfo[] = [
  { id: 'projectile-slope', group: '抛体', name: '平抛落到斜面上', description: '从斜面顶端水平抛出，落回斜面：t = 2v₀tanθ/g', params: [p('theta', '倾角 θ', '°', 30, 5, 75), p('v0', '初速度 v₀', 'm/s', 15, 0.1, 100), p('m', '质量 m', 'kg', 0.1, 0.001), gp()], build: projectileSlope }
]
