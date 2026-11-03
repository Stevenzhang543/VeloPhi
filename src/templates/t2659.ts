/**
 * Templates of 26.59. Fix 1: a ball thrown horizontally from the top A of an incline lands on the incline at B
 * (平抛落到斜面上) — a classic problem type the AI problem reader had no template for (it had to build the scene
 * itself). A is the origin; the incline is long enough for the landing point; the custom quantity AB is the
 * distance of the ball from A.
 */
import { tl } from '../i18n'
import type { Scene } from '../core/scene/types'
import { DEG, cos, sin, tan } from '../core/math/dmath'
import { addBody, addGround, addIncline, defaultGravity, emptyScene, onIncline } from '../core/scene/build'
import { arcCentroid, arcDeg } from '../core/scene/arc'
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

// ---- 26.59 fix 3 (D193, D195): arc tracks, exact circles in the Rust core ----
const SMOOTH = { muS: 0, muK: 0, restitution: 0 }

/** 光滑圆弧轨道：a ball slides from the rim of a smooth quarter arc down onto the floor: v = √(2gR), N = 3mg. */
function arcSlide(v: Record<string, number>): Scene {
  const s = emptyScene(tl('光滑圆弧轨道'))
  s.description = tl('小球从半径为 R 的光滑四分之一圆弧轨道顶端由静止滑下，到达底端时 v = √(2gR)，轨道对小球的支持力 N = 3mg；之后在光滑水平面上匀速运动。')
  const R = v.R, r = 0.03
  addGround(s, { id: 'floor', top: 0, left: -R - 1, right: R + 6, material: SMOOTH })
  addBody(s, { id: 'track', name: tl('圆弧轨道'), kind: 'static', role: 'ground', shape: arcDeg(R, 0.1, 180, 90), position: { x: 0, y: R }, material: SMOOTH, color: '#64748b' })
  addBody(s, { id: 'ball', name: tl('小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: -(R - r), y: R }, mass: v.m, material: SMOOTH })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.energyZeroY = r
  s.settings.legacyDuration = Math.min(30, 2.2 * Math.sqrt(R / Math.max(v.g, 0.1)) + 1)
  s.view = { center: { x: R * 0.8, y: R * 0.5 }, pixelsPerMeter: Math.max(20, Math.min(300, 380 / R)) }
  s.watch = ['ball.v', 'ball.vx', 'ball.y', 'ball.ek']
  return s
}

/** 竖直圆轨道：a ball at the bottom of a vertical ring (inside) with speed v₀; it goes round when v₀² ≥ 5gR. */
function verticalLoop(v: Record<string, number>): Scene {
  const s = emptyScene(tl('竖直圆轨道'))
  s.description = tl('小球在光滑竖直圆轨道的最低点以速度 v₀ 沿内侧运动。v₀² ≥ 5gR 时能通过最高点（最高点 v² ≥ gR）；否则在圆心以上某处脱离轨道做斜抛运动。')
  const R = v.R, r = 0.03
  addBody(s, { id: 'loop', name: tl('圆轨道'), kind: 'static', role: 'ground', shape: arcDeg(R, 0.08, 0, 360), position: { x: 0, y: R }, material: SMOOTH, color: '#64748b' })
  addBody(s, { id: 'ball', name: tl('小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 0, y: r }, velocity: { x: v.v0, y: 0 }, mass: v.m, material: SMOOTH })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.energyZeroY = r
  s.settings.legacyDuration = 3
  s.view = { center: { x: 0, y: R }, pixelsPerMeter: Math.max(20, Math.min(300, 300 / R)) }
  s.watch = ['ball.v', 'ball.y', 'ball.ek']
  return s
}

/** 拱形桥：a ball (car) passes the top of a convex arc with speed v₀; it leaves the surface where cos θ = (v₀²/gR + 2)/3. */
function humpBridge(v: Record<string, number>): Scene {
  const s = emptyScene(tl('拱形桥'))
  s.description = tl('小车（视为质点）以速度 v₀ 通过半径为 R 的光滑拱形桥最高点：此处 mg − N = mv₀²/R，压力小于重力；v₀ ≥ √(gR) 时在最高点就离开桥面，否则沿桥面下滑到 cos θ = (v₀²/(gR) + 2)/3 处离开。')
  const R = v.R, r = 0.05, t = 0.2
  const ends = R * sin(30 * DEG)
  addGround(s, { id: 'road', top: ends, left: -R * 3, right: R * 3, material: SMOOTH })
  addBody(s, { id: 'bridge', name: tl('拱形桥'), kind: 'static', role: 'ground', shape: arcDeg(R - t, t, 30, 120), position: { x: 0, y: 0 }, material: SMOOTH, color: '#64748b' })
  addBody(s, { id: 'car', name: tl('小车'), kind: 'particle', role: 'block', shape: { type: 'circle', radius: r }, position: { x: 0, y: R + r }, velocity: { x: v.v0, y: 0 }, mass: v.m, material: SMOOTH })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.energyZeroY = ends + r
  s.settings.legacyDuration = 3
  s.view = { center: { x: R * 0.6, y: R * 0.7 }, pixelsPerMeter: Math.max(10, Math.min(200, 300 / R)) }
  s.watch = ['car.v', 'car.vx', 'car.vy', 'car.y']
  return s
}

/** 圆弧槽与小球：a ball released at the rim of a smooth groove that can slide on a smooth floor. */
function grooveMomentum(v: Record<string, number>): Scene {
  const s = emptyScene(tl('可动圆弧槽'))
  s.description = tl('质量为 M 的光滑半圆槽放在光滑水平面上，质量为 m 的小球从槽口由静止释放。系统水平方向动量守恒：m·v = M·V；机械能守恒：小球到最低点时 v = √(2gRM/(M + m))，并能升到另一侧槽口。')
  const R = v.R, t = 0.1, r = 0.03
  addGround(s, { id: 'floor', top: 0, left: -6, right: 6, material: SMOOTH })
  const shape = arcDeg(R, t, 180, 180)
  const { c } = arcCentroid(shape)
  // The groove's lowest outer point stands on the floor; its origin is its centre of mass
  const centre = { x: 0, y: R + t }
  addBody(s, { id: 'groove', name: tl('圆弧槽'), role: 'block', shape: { ...shape, center: { x: -c.x, y: -c.y } }, position: { x: centre.x + c.x, y: centre.y + c.y }, mass: v.M, fixedRotation: true, material: SMOOTH, color: '#0ea5e9' })
  addBody(s, { id: 'ball', name: tl('小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: -(R - r), y: centre.y }, mass: v.m, material: SMOOTH })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.energyZeroY = 0
  s.settings.legacyDuration = 3
  s.view = { center: { x: 0, y: R }, pixelsPerMeter: Math.max(20, Math.min(300, 280 / R)) }
  s.watch = ['ball.vx', 'groove.vx', 'ball.v', 'groove.x']
  return s
}

/** 圆环与圆柱滚下斜面：a hoop and a disc roll down the same incline; the disc wins (a = ⅔g sinθ vs ½g sinθ). */
function hoopDisc(v: Record<string, number>): Scene {
  const s = emptyScene(tl('圆环与圆柱滚下斜面'))
  s.description = tl('同样半径的匀质圆柱（I = ½mr²）与细圆环（I ≈ mr²）在同一斜面上由静止滚下（不打滑）：圆柱的加速度 a = ⅔g sinθ，圆环约为 ½g sinθ，圆柱先到底端。')
  const th = v.theta * DEG, base = 4, r = 0.15, t = 0.012
  const mat = { muS: v.mu, muK: v.mu, restitution: 0 }
  addIncline(s, { id: 'slope', name: tl('斜面'), angle: th, base, x0: 0, y0: 0, material: mat })
  addGround(s, { id: 'floor', top: 0, left: base, right: base + 6, material: mat })
  const at = (d: number, h: number) => onIncline(th, base, d, 0, h)
  const disc = at(0.9, 2 * r), hoop = at(0.3, 2 * (r))
  addBody(s, { id: 'disc', name: tl('圆柱'), role: 'wheel', shape: { type: 'circle', radius: r }, position: disc.position, mass: 1, material: mat })
  addBody(s, { id: 'hoop', name: tl('圆环'), role: 'wheel', shape: arcDeg(r - t, t, 0, 360), position: hoop.position, mass: 1, material: mat, color: '#f59e0b' })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 3
  s.view = { center: { x: base * 0.6, y: base * tan(th) * 0.4 }, pixelsPerMeter: Math.max(20, Math.min(200, 520 / (base + 2))) }
  s.watch = ['disc.v', 'hoop.v', 'disc.x', 'hoop.x']
  return s
}

export const TEMPLATES_2659: TemplateInfo[] = [
  { id: 'projectile-slope', group: '抛体', name: '平抛落到斜面上', description: '从斜面顶端水平抛出，落回斜面：t = 2v₀tanθ/g', params: [p('theta', '倾角 θ', '°', 30, 5, 75), p('v0', '初速度 v₀', 'm/s', 15, 0.1, 100), p('m', '质量 m', 'kg', 0.1, 0.001), gp()], build: projectileSlope },
  // 26.59 fix 3 (D195): arc tracks
  { id: 'arc-slide', group: '圆周运动', name: '光滑圆弧轨道', description: '从四分之一圆弧顶端滑下：底端 v = √(2gR)，N = 3mg', params: [p('R', '半径 R', 'm', 0.8, 0.1, 10), p('m', '质量 m', 'kg', 0.2, 0.001), gp()], build: arcSlide },
  { id: 'vertical-loop', group: '圆周运动', name: '竖直圆轨道', description: '最低点速度 v₀：v₀² ≥ 5gR 才能通过最高点', params: [p('R', '半径 R', 'm', 0.5, 0.1, 10), p('v0', '最低点速度 v₀', 'm/s', 5, 0, 50), p('m', '质量 m', 'kg', 0.1, 0.001), gp()], build: verticalLoop },
  { id: 'hump-bridge', group: '圆周运动', name: '拱形桥', description: '最高点 mg − N = mv²/R；v ≥ √(gR) 时离开桥面', params: [p('R', '桥面半径 R', 'm', 5, 0.5, 50), p('v0', '最高点速度 v₀', 'm/s', 3, 0, 50), p('m', '质量 m', 'kg', 1, 0.001), gp()], build: humpBridge },
  { id: 'groove-momentum', group: '动量守恒', name: '可动圆弧槽', description: '小球在可滑动的光滑圆弧槽中：水平方向动量守恒', params: [p('R', '半径 R', 'm', 0.5, 0.1, 5), p('M', '槽的质量 M', 'kg', 2, 0.01), p('m', '小球质量 m', 'kg', 0.5, 0.001), gp()], build: grooveMomentum },
  { id: 'hoop-disc', group: '刚体转动', name: '圆环与圆柱滚下斜面', description: '同时由静止滚下：圆柱 a = ⅔g sinθ 先到，圆环 ≈ ½g sinθ', params: [p('theta', '倾角 θ', '°', 30, 5, 60), p('mu', '摩擦因数 μ', '', 0.5, 0, 2), gp()], build: hoopDisc }
]
