/**
 * 26.61 templates: models that use the features of 26.60 (a spring that only pushes, a point mass without volume) and
 * a classic projectile case. Each one's textbook answer is checked in tests/teaching/problems2661.test.ts.
 *  - spring-drop: a block falls onto a vertical spring that is not fastened to it — the largest compression from
 *    mg(h + x) = ½kx²;
 *  - spring-launcher: a ball on a compressed vertical spring is launched — it rises H = kx²/(2mg) above the release;
 *  - dome-slide: a point mass slides off the top of a smooth fixed dome — it leaves at cos φ = (2 + v₀²/gR)/3;
 *  - projectile-wall: a ball thrown horizontally from a table hits a wall at distance d — y = h − g d²/(2v₀²).
 */
import { tl } from '../i18n'
import type { Scene, SpringDef } from '../core/scene/types'
import { addBody, addConnector, addGround, defaultGravity, emptyScene } from '../core/scene/build'
import type { TemplateInfo, TemplateParam } from './index'

const p = (key: string, label: string, unit: string, value: number, min?: number, max?: number, step?: number): TemplateParam => ({ key, label, unit, value, min, max, step })
const gp = (): TemplateParam => p('g', '重力加速度 g', 'm/s²', defaultGravity(), 0)
const SMOOTH = { muS: 0, muK: 0, restitution: 0 }

/** 物块落到弹簧上：the block (side 0.2 m) falls from height h above the free top of a spring of rest length L₀. */
function springDrop(v: Record<string, number>): Scene {
  const s = emptyScene(tl('物块落到弹簧上'))
  s.description = tl('质量为 m 的物块从弹簧上端正上方 h 处由静止下落，压上竖直放置、下端固定的轻弹簧（劲度系数 k，不与物块粘连）。最大压缩量 x 满足 mg(h + x) = ½kx²；之后物块被弹回。')
  const L0 = 0.6, w = 0.2
  addGround(s, { id: 'floor', top: 0, left: -1, right: 1, material: SMOOTH })
  const block = addBody(s, { id: 'block', name: tl('物块'), role: 'block', shape: { type: 'box', width: w, height: w }, position: { x: 0, y: L0 + v.h + w / 2 }, mass: v.m, fixedRotation: true, material: SMOOTH })
  addConnector<SpringDef>(s, { id: 'spring', name: tl('弹簧'), type: 'spring', a: { body: null, local: { x: 0, y: 0 } }, b: { body: block.id, local: { x: 0, y: -w / 2 } }, stiffness: v.k, restLength: L0, damping: 0, pushOnly: true })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 2
  s.customQuantities = [{ id: 'x', name: tl('弹簧压缩量 x'), expr: `${L0} - (y(block) - ${w / 2})` }]
  s.view = { center: { x: 0, y: (L0 + v.h) / 2 + 0.2 }, pixelsPerMeter: Math.max(40, Math.min(220, 360 / (L0 + v.h + 0.4))) }
  s.watch = ['block.vy', 'custom.x', 'spring.F', 'system.e']
  return s
}

/** 弹簧竖直弹射：a ball (radius 0.05 m) rests on a spring pressed by x; released, the spring lets go at its rest length. */
function springLauncher(v: Record<string, number>): Scene {
  const s = emptyScene(tl('弹簧竖直弹射'))
  s.description = tl('竖直轻弹簧（劲度系数 k，下端固定、上端不与小球粘连）被质量为 m 的小球压缩 x 后由静止释放。弹簧恢复原长时小球离开弹簧，以释放处为零点小球上升的最大高度 H = kx²/(2mg)（kx > mg 时）。')
  const L0 = 0.5, r = 0.05
  addGround(s, { id: 'floor', top: 0, left: -1, right: 1, material: SMOOTH })
  const y0 = L0 - v.x + r
  const ball = addBody(s, { id: 'ball', name: tl('小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 0, y: y0 }, mass: v.m, material: SMOOTH })
  addConnector<SpringDef>(s, { id: 'spring', name: tl('弹簧'), type: 'spring', a: { body: null, local: { x: 0, y: 0 } }, b: { body: ball.id, local: { x: 0, y: -r } }, stiffness: v.k, restLength: L0, damping: 0, pushOnly: true })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 2
  s.customQuantities = [{ id: 'H', name: tl('高出释放点 H'), expr: `y(ball) - ${y0}` }]
  const top = v.k * v.x * v.x / (2 * v.m * Math.max(v.g, 0.1))
  s.view = { center: { x: 0, y: Math.min(12, y0 + top / 2) }, pixelsPerMeter: Math.max(15, Math.min(220, 400 / Math.max(1, top + 1))) }
  s.watch = ['ball.vy', 'custom.H', 'spring.F', 'system.e']
  return s
}

/** 质点从光滑半球顶滑落：a point mass at the top of a fixed smooth dome of radius R with speed v₀. */
function domeSlide(v: Record<string, number>): Scene {
  const s = emptyScene(tl('质点从光滑半球顶滑落'))
  s.description = tl('质点（无体积）从固定光滑半球的顶端以水平速度 v₀ 滑下。离开球面时 N = 0：mg cos φ = mv²/R，且 v² = v₀² + 2gR(1 − cos φ)，故 cos φ = (2 + v₀²/(gR))/3；v₀ ≥ √(gR) 时在顶端就离开。')
  const R = v.R
  addGround(s, { id: 'floor', top: 0, left: -R * 3, right: R * 4, material: SMOOTH })
  addBody(s, { id: 'dome', name: tl('半球'), kind: 'static', role: 'ground', shape: { type: 'circle', radius: R }, position: { x: 0, y: 0 }, material: SMOOTH, color: '#64748b' })
  addBody(s, { id: 'p', name: tl('质点'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0 }, position: { x: 0, y: R }, velocity: { x: v.v0, y: 0 }, mass: v.m, material: SMOOTH })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 2
  s.customQuantities = [{ id: 'cos', name: tl('位置角的余弦 cos φ'), expr: `y(p) / ${R}` }]
  s.view = { center: { x: R, y: R / 2 }, pixelsPerMeter: Math.max(20, Math.min(200, 300 / R)) }
  s.watch = ['p.v', 'contact.p|dome.N', 'custom.cos', 'p.y']
  return s
}

/** 平抛撞墙：a ball leaves a table of height h at v₀ toward a wall at distance d. */
function projectileWall(v: Record<string, number>): Scene {
  const s = emptyScene(tl('平抛撞墙'))
  s.description = tl('小球从高 h 的桌面边缘以 v₀ 水平抛出，水平距离 d 处有竖直墙。撞墙前历时 t = d/v₀，撞墙处高 y = h − g d²/(2v₀²)（y > 0 时先撞墙）。')
  const r = 0.03, wall = 0.1
  addGround(s, { id: 'floor', top: 0, left: -1.5, right: v.d + wall + 1 })
  addBody(s, { id: 'table', name: tl('桌子'), kind: 'static', role: 'ground', shape: { type: 'box', width: 1, height: v.h }, position: { x: -0.5, y: v.h / 2 } })
  addBody(s, { id: 'wall', name: tl('墙'), kind: 'static', role: 'wall', shape: { type: 'box', width: wall, height: Math.max(v.h, 1) + 0.5 }, position: { x: v.d + r + wall / 2, y: (Math.max(v.h, 1) + 0.5) / 2 } })
  addBody(s, { id: 'ball', name: tl('小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 0, y: v.h + r + 1e-4 }, velocity: { x: v.v0, y: 0 }, mass: v.m, material: { restitution: 0.5 } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 2
  // The height of the ball's lowest point above the floor at the wall is y − r; the stem asks for the ball's centre
  s.view = { center: { x: v.d / 2, y: v.h / 2 + 0.3 }, pixelsPerMeter: Math.max(30, Math.min(200, 500 / Math.max(v.d + 1.5, v.h + 1))) }
  s.watch = ['ball.x', 'ball.y', 'ball.vx', 'ball.vy']
  return s
}

export const TEMPLATES_2661: TemplateInfo[] = [
  { id: 'spring-drop', group: '振动', name: '物块落到弹簧上', description: '不粘连的竖直弹簧：mg(h + x) = ½kx² 求最大压缩量', params: [p('h', '下落高度 h', 'm', 0.4, 0, 3), p('m', '质量 m', 'kg', 1, 0.01), p('k', '劲度系数 k', 'N/m', 400, 1), gp()], build: springDrop },
  { id: 'spring-launcher', group: '能量守恒', name: '弹簧竖直弹射', description: '弹簧恢复原长时小球离开：H = kx²/(2mg)', params: [p('k', '劲度系数 k', 'N/m', 500, 1), p('x', '压缩量 x', 'm', 0.1, 0.01, 0.4), p('m', '质量 m', 'kg', 0.2, 0.001), gp()], build: springLauncher },
  { id: 'dome-slide', group: '圆周运动', name: '质点从光滑半球顶滑落', description: '离开球面处 cos φ = (2 + v₀²/gR)/3', params: [p('R', '半径 R', 'm', 1, 0.1, 10), p('v0', '顶端速度 v₀', 'm/s', 0.5, 0, 20), p('m', '质量 m', 'kg', 0.1, 0.001), gp()], build: domeSlide },
  { id: 'projectile-wall', group: '抛体', name: '平抛撞墙', description: '撞墙时刻 t = d/v₀，撞墙高度 y = h − gd²/(2v₀²)', params: [p('h', '桌面高度 h', 'm', 1.25, 0.1, 10), p('v0', '初速度 v₀', 'm/s', 4, 0.1, 50), p('d', '到墙的距离 d', 'm', 1.6, 0.1, 20), p('m', '质量 m', 'kg', 0.1, 0.001), gp()], build: projectileWall }
]
