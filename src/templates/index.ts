/**
 * Classic model templates (the acceptance scenes). Each template builds a complete scene from a few
 * textbook parameters; the scene stays fully editable afterwards. Values follow docs/DEV_MANUAL_26_48.md §7
 * and, for the 26.49 models (vertical circles, movable pulley, movable wedge, spring-joined blocks, rolling
 * with slipping, variable force), docs/DEV_MANUAL_26_49.md §4.
 *
 * Every gravity parameter defaults to one value, the app's default-gravity setting (setTemplateGravity).
 *
 * Templates are unbounded (`settings.duration` null, decision D26): they run until stopped. Each keeps its 26.49
 * duration as `settings.legacyDuration`, the finite length of sweeps, predictions, tests and `simulate()`, so a
 * bounded run of a template reproduces the 26.49 recording and fingerprint.
 */
import { tl, trDeep } from '../i18n'
import type { Scene } from '../core/scene/types'
import { COULOMB_K, usesFields } from '../core/scene/types'
import { DEG, cos, sin, tan } from '../core/math/dmath'
import { addBody, addConnector, addGround, addIncline, addPulley, anchor, defaultGravity, emptyScene, onIncline, setDefaultGravity } from '../core/scene/build'
import type { ForceDef, RodDef, RopeDef, SpringDef, HingeDef, WeldDef, MotorDef, GearDef, CentralDef, SliderDef } from '../core/scene/types'
import { TEMPLATES_2655 } from './t2655'

/** A template parameter: key, label, display unit ('°' for angles), default value and limits. */
export interface TemplateParam { key: string; label: string; unit: string; value: number; min?: number; max?: number; step?: number }
/** A template: gallery group, name and description, parameters, and the scene builder. */
export interface TemplateInfo {
  id: string
  group: string
  name: string
  description: string
  params: TemplateParam[]
  build: (p: Record<string, number>) => Scene
}

const p = (key: string, label: string, unit: string, value: number, min?: number, max?: number, step?: number): TemplateParam => ({ key, label, unit, value, min, max, step })
/** The gravity parameter of every template (default: the app's default g). */
const gp = (): TemplateParam => p('g', tl('重力加速度 g'), 'm/s²', defaultGravity(), 0)

function inclineBlock(v: Record<string, number>): Scene {
  const s = emptyScene(tl('斜面滑块'))
  s.description = tl('质量为 m 的物块从静止开始沿倾角为 θ 的斜面下滑。')
  const th = v.theta * DEG, base = 4
  addIncline(s, { id: 'incline', angle: th, base, material: { muS: v.mu, muK: v.mu } })
  const w = 0.3, h = 0.2
  const pl = onIncline(th, base, 0.3, w, h)
  addBody(s, { id: 'block', name: tl('物块'), role: 'block', shape: { type: 'box', width: w, height: h }, position: pl.position, angle: pl.angle, mass: v.m, material: { muS: v.mu, muK: v.mu } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 1.2
  s.view = { center: { x: 2, y: 1.2 }, pixelsPerMeter: 150 }
  s.watch = ['block.x', 'block.v', 'block.a', 'contact.block|incline.N', 'contact.block|incline.f']
  return s
}

function boardBlock(v: Record<string, number>): Scene {
  const s = emptyScene(tl('板块模型'))
  s.description = tl('长木板静止在粗糙水平地面上，小物块以初速度 v₀ 滑上木板左端。')
  addGround(s, { id: 'ground', top: 0, left: -1, right: 12, material: { muS: v.mu2, muK: v.mu2 } })
  const L = 3, th = 0.1, bw = 0.2, bh = 0.2
  addBody(s, { id: 'board', name: tl('木板'), role: 'board', shape: { type: 'box', width: L, height: th }, position: { x: L / 2, y: th / 2 }, mass: v.M, material: { muS: v.mu2, muK: v.mu2 } })
  addBody(s, { id: 'block', name: tl('物块'), role: 'block', shape: { type: 'box', width: bw, height: bh }, position: { x: bw / 2, y: th + bh / 2 }, velocity: { x: v.v0, y: 0 }, mass: v.m, material: { muS: v.mu1, muK: v.mu1 } })
  s.contactPairs.push({ a: 'block', b: 'board', muS: v.mu1, muK: v.mu1, restitution: 0 })
  s.contactPairs.push({ a: 'board', b: 'ground', muS: v.mu2, muK: v.mu2, restitution: 0 })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 2.5
  s.view = { center: { x: 2.5, y: 0.6 }, pixelsPerMeter: 120 }
  s.watch = ['block.vx', 'board.vx', 'contact.block|board.f', 'contact.board|ground.f', 'pair.block|board.slide', 'pair.block|board.heat']
  return s
}

function conveyorFlat(v: Record<string, number>): Scene {
  const s = emptyScene(tl('水平传送带'))
  s.description = tl('水平传送带以速度 u 顺时针运行，物块轻放在左端（初速度为零）。')
  addGround(s, { id: 'belt', name: tl('传送带'), role: 'conveyor', top: 0, left: -0.5, right: 6, thickness: 0.3, beltSpeed: v.u, material: { muS: v.mu, muK: v.mu } })
  addBody(s, { id: 'block', name: tl('物块'), role: 'block', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0.1, y: 0.1 }, mass: v.m, material: { muS: v.mu, muK: v.mu } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 1.5
  s.view = { center: { x: 2.2, y: 0.4 }, pixelsPerMeter: 140 }
  s.watch = ['block.vx', 'contact.block|belt.f', 'pair.belt|block.slide', 'ledger.frictionHeat', 'ledger.beltWork']
  return s
}

function conveyorIncline(v: Record<string, number>): Scene {
  const s = emptyScene(tl('倾斜传送带'))
  s.description = tl('倾角 θ 的传送带以速度 u 向下运行，物块轻放在顶端。')
  const th = v.theta * DEG, base = 8
  addIncline(s, { id: 'belt', name: tl('传送带'), role: 'conveyor', angle: th, base, beltSpeed: v.u, material: { muS: v.mu, muK: v.mu } })
  const pl = onIncline(th, base, 0.2, 0.2, 0.2)
  addBody(s, { id: 'block', name: tl('物块'), role: 'block', shape: { type: 'box', width: 0.2, height: 0.2 }, position: pl.position, angle: pl.angle, mass: v.m, material: { muS: v.mu, muK: v.mu } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 1.5
  s.view = { center: { x: 3, y: 2.6 }, pixelsPerMeter: 90 }
  s.watch = ['block.v', 'contact.block|belt.f', 'pair.belt|block.slide', 'ledger.frictionHeat']
  return s
}

function collision1D(v: Record<string, number>): Scene {
  const s = emptyScene(tl('一维碰撞'))
  s.description = tl('光滑水平面上（俯视，不计重力），小球 A 以 v₀ 正碰静止的小球 B。')
  const r = 0.1
  addBody(s, { id: 'A', name: tl('小球A'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 0, y: 0 }, velocity: { x: v.v0, y: 0 }, mass: v.m1, material: { restitution: v.e }, color: '#ef4444' })
  addBody(s, { id: 'B', name: tl('小球B'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 1, y: 0 }, mass: v.m2, material: { restitution: v.e }, color: '#2563eb' })
  s.contactPairs.push({ a: 'A', b: 'B', muS: 0, muK: 0, restitution: v.e })
  s.settings.gravity = { x: 0, y: 0 }
  s.settings.legacyDuration = 1.5
  s.view = { center: { x: 1, y: 0 }, pixelsPerMeter: 160 }
  s.watch = ['A.vx', 'B.vx', 'system.px', 'system.ek']
  return s
}

function collision2D(v: Record<string, number>): Scene {
  const s = emptyScene(tl('二维斜碰'))
  s.description = tl('光滑水平面上（俯视），小球 A 以 v₀ 斜碰静止的小球 B，瞄准偏移 b。')
  const r = 0.1
  addBody(s, { id: 'A', name: tl('小球A'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 0, y: 0 }, velocity: { x: v.v0, y: 0 }, mass: v.m1, color: '#ef4444' })
  addBody(s, { id: 'B', name: tl('小球B'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 1, y: v.b }, mass: v.m2, color: '#2563eb' })
  s.contactPairs.push({ a: 'A', b: 'B', muS: 0, muK: 0, restitution: v.e })
  s.settings.gravity = { x: 0, y: 0 }
  s.settings.legacyDuration = 1.5
  s.view = { center: { x: 1, y: 0 }, pixelsPerMeter: 160 }
  s.watch = ['A.v', 'B.v', 'system.px', 'system.py', 'system.ek']
  return s
}

function projectile(v: Record<string, number>): Scene {
  const s = emptyScene(tl('抛体运动'))
  s.description = tl('小球从高 h 处以速度 v₀、仰角 α 抛出（α = 0 为平抛）。')
  const r = 0.03
  addGround(s, { id: 'ground', top: 0, left: -1, right: 30 })
  if (v.h > 0) addBody(s, { id: 'platform', name: tl('平台'), kind: 'static', role: 'ground', shape: { type: 'box', width: 1, height: v.h }, position: { x: -0.5, y: v.h / 2 } })
  const a = v.alpha * DEG
  addBody(s, { id: 'ball', name: tl('小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: v.h > 0 ? r + 1e-3 : 0, y: v.h + r }, velocity: { x: v.v0 * cos(a), y: v.v0 * sin(a) }, mass: v.m })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 2.2
  s.settings.energyZeroY = r
  s.view = { center: { x: 4, y: 2 }, pixelsPerMeter: 60 }
  s.watch = ['ball.x', 'ball.y', 'ball.vx', 'ball.vy']
  return s
}

function pendulum(v: Record<string, number>): Scene {
  const s = emptyScene(tl('单摆'))
  s.description = tl('长 L 的轻绳一端固定，另一端系小球，从偏角 θ₀ 处静止释放。')
  const th = v.theta0 * DEG, L = v.L, r = 0.03
  const pivot = { x: 0, y: 2 }
  addBody(s, { id: 'bob', name: tl('摆球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: pivot.x + L * sin(th), y: pivot.y - L * cos(th) }, mass: v.m })
  addConnector<RopeDef>(s, { id: 'rope', name: tl('摆线'), type: 'rope', a: anchor(null, pivot), b: anchor(s.bodies[0]), pulleys: [], length: null })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 6
  s.settings.energyZeroY = pivot.y - L
  s.view = { center: { x: 0, y: 1.4 }, pixelsPerMeter: 180 }
  s.watch = ['bob.angle@pivot', 'bob.v', 'rope.T', 'system.e']
  s.extra = { pivot }
  return s
}

function springOscillator(v: Record<string, number>): Scene {
  const s = emptyScene(tl('弹簧振子'))
  s.description = tl('光滑水平面上，劲度系数 k 的轻弹簧一端固定，另一端连质量 m 的物块，拉开 A 后释放。')
  addGround(s, { id: 'ground', top: 0, left: -0.4, right: 3 })
  const L0 = 0.8, w = 0.2
  addBody(s, { id: 'wall', name: tl('墙'), kind: 'static', role: 'wall', shape: { type: 'box', width: 0.1, height: 0.6 }, position: { x: -0.05, y: 0.3 } })
  addBody(s, { id: 'block', name: tl('振子'), role: 'block', shape: { type: 'box', width: w, height: w }, position: { x: L0 + v.A + w / 2, y: w / 2 }, mass: v.m })
  addConnector<SpringDef>(s, { id: 'spring', name: tl('弹簧'), type: 'spring', a: anchor(s.bodies[2], { x: -w / 2, y: 0 }), b: anchor(null, { x: 0, y: w / 2 }), stiffness: v.k, restLength: L0, damping: 0 })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 3
  s.view = { center: { x: 1, y: 0.4 }, pixelsPerMeter: 220 }
  s.watch = ['block.x', 'block.vx', 'block.ax', 'spring.F', 'system.e']
  return s
}

function hingedRod(v: Record<string, number>): Scene {
  const s = emptyScene(tl('定轴转动的细杆'))
  s.description = tl('长 L、质量 m 的匀质细杆一端用光滑铰链固定，从水平位置静止释放。')
  const L = v.L, h = 0.04, pivot = { x: 0, y: 1.5 }
  const rod = addBody(s, { id: 'rod', name: tl('细杆'), role: 'rod', shape: { type: 'box', width: L, height: h }, position: { x: pivot.x + L / 2, y: pivot.y }, mass: v.m, inertia: v.m * L * L / 12 })
  addConnector<HingeDef>(s, { id: 'hinge', name: tl('铰链'), type: 'hinge', a: anchor(rod, { x: -L / 2, y: 0 }), b: anchor(null, pivot) })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 2
  s.settings.energyZeroY = pivot.y
  s.view = { center: { x: 0, y: 1 }, pixelsPerMeter: 160 }
  s.watch = ['rod.angle', 'rod.omega', 'hinge.F', 'system.e']
  s.extra = { pivot, idealization: tl('细杆：转动惯量按 mL²/12 设定（忽略杆的厚度）') }
  return s
}

function rollingCylinder(v: Record<string, number>): Scene {
  const s = emptyScene(tl('斜面上的圆柱'))
  s.description = tl('匀质圆柱从静止沿倾角 θ 的斜面滚下；μ 足够大时纯滚动，否则边滚边滑。')
  const th = v.theta * DEG, base = 6, r = v.r
  addIncline(s, { id: 'incline', angle: th, base, material: { muS: v.mu, muK: v.mu } })
  const H = base * sin(th) / cos(th)
  const sAlong = 0.3
  const px = cos(th) * sAlong, py = H - sin(th) * sAlong
  addBody(s, { id: 'cyl', name: tl('圆柱'), role: 'wheel', shape: { type: 'circle', radius: r }, position: { x: px + sin(th) * r, y: py + cos(th) * r }, mass: v.m, material: { muS: v.mu, muK: v.mu } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 1.2
  s.view = { center: { x: 2.4, y: 2 }, pixelsPerMeter: 110 }
  s.watch = ['cyl.v', 'cyl.omega', 'contact.cyl|incline.f', 'contact.cyl|incline.vt']
  return s
}

function ballHitsRod(v: Record<string, number>): Scene {
  const s = emptyScene(tl('小球碰撞悬挂细杆'))
  s.description = tl('竖直悬挂的匀质细杆（上端铰接），小球以 v₀ 水平撞击杆上距转轴 d 处（不计重力）。')
  const L = v.L, h = 0.04, pivot = { x: 0, y: 1.2 }, r = 0.04
  const rod = addBody(s, { id: 'rod', name: tl('细杆'), role: 'rod', shape: { type: 'box', width: h, height: L }, position: { x: pivot.x, y: pivot.y - L / 2 }, mass: v.M, inertia: v.M * L * L / 12 })
  addConnector<HingeDef>(s, { id: 'hinge', name: tl('铰链'), type: 'hinge', a: anchor(rod, { x: 0, y: L / 2 }), b: anchor(null, pivot) })
  addBody(s, { id: 'ball', name: tl('小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: -0.5, y: pivot.y - v.d }, velocity: { x: v.v0, y: 0 }, mass: v.m })
  s.contactPairs.push({ a: 'ball', b: 'rod', muS: 0, muK: 0, restitution: v.e })
  s.settings.gravity = { x: 0, y: 0 }
  s.settings.legacyDuration = 0.6
  s.view = { center: { x: 0, y: 0.7 }, pixelsPerMeter: 200 }
  s.watch = ['ball.vx', 'rod.omega', 'system.Lz@pivot', 'system.ek']
  s.extra = { pivot }
  return s
}

function tablePulley(v: Record<string, number>): Scene {
  const s = emptyScene(tl('连接体（定滑轮）'))
  s.description = tl('水平桌面上的物块 m₁ 通过跨过定滑轮的轻绳与悬挂物块 m₂ 相连，由静止释放。')
  const top = 1.2, edge = 2
  addBody(s, { id: 'table', name: tl('桌面'), kind: 'static', role: 'ground', shape: { type: 'box', width: edge + 1, height: 0.2 }, position: { x: (edge - 1) / 2, y: top - 0.1 }, material: { muS: v.mu, muK: v.mu } })
  const bw = 0.2, pr = 0.04
  const b1 = addBody(s, { id: 'm1', name: tl('物块1'), role: 'block', shape: { type: 'box', width: bw, height: bw }, position: { x: 0.4, y: top + bw / 2 }, mass: v.m1, material: { muS: v.mu, muK: v.mu } })
  const pc = { x: edge + 0.08, y: top + bw / 2 - pr }
  const pul = addPulley(s, { id: 'pulley', name: tl('定滑轮'), position: pc, radius: pr })
  const hw = 0.14
  const b2 = addBody(s, { id: 'm2', name: tl('物块2'), role: 'block', shape: { type: 'box', width: hw, height: hw }, position: { x: pc.x + pr, y: top - 0.5 }, mass: v.m2, color: '#f59e0b' })
  addConnector<RopeDef>(s, { id: 'rope', name: tl('轻绳'), type: 'rope', a: anchor(b1), b: anchor(b2), pulleys: [{ pulley: pul.id, wrap: 'cw' }], length: null })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 1
  s.view = { center: { x: 1.4, y: 0.9 }, pixelsPerMeter: 170 }
  s.watch = ['m1.vx', 'm2.vy', 'rope.T', 'contact.m1|table.f']
  return s
}

function atwood(v: Record<string, number>): Scene {
  const s = emptyScene(tl('阿特伍德机'))
  s.description = tl('质量 m₁、m₂ 的两物块用轻绳跨过光滑定滑轮悬挂，由静止释放。')
  const pr = 0.12, pc = { x: 0, y: 2 }
  const pul = addPulley(s, { id: 'pulley', name: tl('定滑轮'), position: pc, radius: pr })
  const w = 0.16
  const b1 = addBody(s, { id: 'm1', name: tl('物块1'), role: 'block', shape: { type: 'box', width: w, height: w }, position: { x: pc.x - pr, y: 1.1 }, mass: v.m1 })
  const b2 = addBody(s, { id: 'm2', name: tl('物块2'), role: 'block', shape: { type: 'box', width: w, height: w }, position: { x: pc.x + pr, y: 1.1 }, mass: v.m2, color: '#f59e0b' })
  addConnector<RopeDef>(s, { id: 'rope', name: tl('轻绳'), type: 'rope', a: anchor(b1), b: anchor(b2), pulleys: [{ pulley: pul.id, wrap: 'cw' }], length: null })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 1
  s.view = { center: { x: 0, y: 1.3 }, pixelsPerMeter: 220 }
  s.watch = ['m1.vy', 'm2.vy', 'rope.T']
  return s
}

// ---- 26.49 models ----
/** Ball on a light rope (or rod) in a vertical circle, started at the lowest point with speed v₀. */
function verticalCircle(v: Record<string, number>, rod: boolean): Scene {
  const s = emptyScene(rod ? tl('竖直面圆周运动（杆）') : tl('竖直面圆周运动（绳）'))
  s.description = rod
    ? tl('轻杆一端固定在光滑转轴上，另一端连小球；小球在最低点获得水平速度 v₀。杆既能拉也能推，最高点速度为 √(gL) 时杆对球的作用力为零。')
    : tl('轻绳一端固定，另一端系小球；小球在最低点获得水平速度 v₀。v₀ ≥ √(5gL) 时能通过最高点，否则绳在上半圆某处松弛，小球做斜抛运动。')
  const L = v.L, r = 0.03
  const pivot = { x: 0, y: 1.2 }
  const ball = addBody(s, { id: 'ball', name: tl('小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: pivot.x, y: pivot.y - L }, velocity: { x: v.v0, y: 0 }, mass: v.m })
  if (rod) addConnector<RodDef>(s, { id: 'rod', name: tl('轻杆'), type: 'rod', a: anchor(null, pivot), b: anchor(ball), length: null })
  else addConnector<RopeDef>(s, { id: 'rope', name: tl('轻绳'), type: 'rope', a: anchor(null, pivot), b: anchor(ball), pulleys: [], length: null })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 2
  s.settings.energyZeroY = pivot.y - L
  s.view = { center: { x: 0, y: pivot.y }, pixelsPerMeter: Math.min(240, 160 / Math.max(L, 0.2)) }
  s.watch = rod ? ['ball.v', 'rod.F', 'ball.angle@pivot', 'system.e'] : ['ball.v', 'rope.T', 'ball.angle@pivot', 'system.e']
  s.extra = { pivot }
  return s
}

/**
 * Movable pulley: one rope end is tied to the ceiling, the rope runs down around the movable pulley that
 * carries block m₂, up over fixed pulley 1, across to fixed pulley 2 and down to the hanging block m₁.
 * All free segments next to the bodies are vertical, so a₁ = 2a₂ exactly.
 */
function movablePulley(v: Record<string, number>): Scene {
  const s = emptyScene(tl('动滑轮'))
  s.description = tl('轻绳一端固定在天花板上，绕过挂着物块 m₂ 的动滑轮，再跨过两个定滑轮挂物块 m₁；由静止释放。滑轮与绳的质量、摩擦不计。')
  const r = 0.05, top = 2
  addBody(s, { id: 'ceiling', name: tl('天花板'), kind: 'static', role: 'wall', shape: { type: 'box', width: 1.4, height: 0.08 }, position: { x: 0.3, y: top + 0.04 } })
  addGround(s, { id: 'ground', top: 0, left: -1, right: 1.6 })
  const load = addBody(s, { id: 'm2', name: tl('物块2'), role: 'block', shape: { type: 'box', width: 0.16, height: 0.16 }, position: { x: 0, y: 0.8 }, mass: v.m2, fixedRotation: true, color: '#f59e0b' })
  const hang = addBody(s, { id: 'm1', name: tl('物块1'), role: 'block', shape: { type: 'box', width: 0.12, height: 0.12 }, position: { x: 0.6 + r, y: 1.1 }, mass: v.m1 })
  addPulley(s, { id: 'pm', name: tl('动滑轮'), position: { x: 0, y: 0.14 }, radius: r, body: load.id })
  addPulley(s, { id: 'p1', name: tl('定滑轮1'), position: { x: 2 * r, y: 1.8 }, radius: r })
  addPulley(s, { id: 'p2', name: tl('定滑轮2'), position: { x: 0.6, y: 1.8 }, radius: r })
  addConnector<RopeDef>(s, { id: 'rope', name: tl('轻绳'), type: 'rope', a: anchor(null, { x: -r, y: top }), b: anchor(hang), pulleys: [{ pulley: 'pm', wrap: 'ccw' }, { pulley: 'p1', wrap: 'cw' }, { pulley: 'p2', wrap: 'cw' }], length: null })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 0.8
  s.view = { center: { x: 0.3, y: 1.1 }, pixelsPerMeter: 260 }
  s.watch = ['m1.vy', 'm2.vy', 'm1.ay', 'm2.ay', 'rope.T', 'system.e']
  return s
}

/** Wedge of mass M on a smooth floor, block m sliding down its smooth slope (both translate only). */
function movableWedge(v: Record<string, number>): Scene {
  const s = emptyScene(tl('可动斜面'))
  s.description = tl('倾角 θ、质量 M 的斜面放在光滑水平地面上，质量 m 的物块从斜面上由静止沿光滑斜面下滑；斜面向相反方向运动。')
  const th = v.theta * DEG, base = 1.2, h = base * tan(th)
  addGround(s, { id: 'ground', top: 0, left: -3, right: 3 })
  addBody(s, { id: 'wedge', name: tl('斜面'), role: 'incline', shape: { type: 'polygon', points: [{ x: -base / 3, y: -h / 3 }, { x: 2 * base / 3, y: -h / 3 }, { x: -base / 3, y: 2 * h / 3 }] }, position: { x: 0, y: h / 3 }, mass: v.M, fixedRotation: true, color: '#64748b' })
  const c = cos(th), sn = sin(th), bw = 0.12, bh = 0.08, along = 0.15
  const topX = -base / 3, topY = h
  const px = topX + c * along, py = topY - sn * along
  addBody(s, { id: 'block', name: tl('物块'), role: 'block', shape: { type: 'box', width: bw, height: bh }, position: { x: px + c * bw / 2 + sn * bh / 2, y: py - sn * bw / 2 + c * bh / 2 }, angle: -th, mass: v.m, fixedRotation: true })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 0.6
  s.view = { center: { x: 0.2, y: 0.4 }, pixelsPerMeter: 220 }
  s.watch = ['block.vx', 'wedge.vx', 'wedge.ax', 'contact.block|wedge.N', 'system.px']
  return s
}

/** Two blocks joined by a light spring on a smooth floor; block 1 starts with v₀ towards block 2. */
function springBlocks(v: Record<string, number>): Scene {
  const s = emptyScene(tl('弹簧连接体'))
  s.description = tl('光滑水平面上两物块由轻弹簧相连，弹簧处于原长；物块 1 获得指向物块 2 的初速度 v₀。弹簧压缩最大时两物块共速。')
  addGround(s, { id: 'ground', top: 0, left: -2, right: 6 })
  const w = 0.2, L0 = 0.5
  const a = addBody(s, { id: 'b1', name: tl('物块1'), role: 'block', shape: { type: 'box', width: w, height: w }, position: { x: 0, y: w / 2 }, velocity: { x: v.v0, y: 0 }, mass: v.m1 })
  const b = addBody(s, { id: 'b2', name: tl('物块2'), role: 'block', shape: { type: 'box', width: w, height: w }, position: { x: w + L0, y: w / 2 }, mass: v.m2, color: '#f59e0b' })
  addConnector<SpringDef>(s, { id: 'spring', name: tl('弹簧'), type: 'spring', a: anchor(a, { x: w / 2, y: 0 }), b: anchor(b, { x: -w / 2, y: 0 }), stiffness: v.k, restLength: L0, damping: 0 })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 2
  s.view = { center: { x: 1.2, y: 0.3 }, pixelsPerMeter: 160 }
  s.watch = ['b1.vx', 'b2.vx', 'spring.x', 'system.px', 'system.es']
  return s
}

/** Uniform disc (a cylinder in 2D) put on rough ground with v₀ and no spin: it slips, then rolls. */
function rollingSlip(v: Record<string, number>): Scene {
  const s = emptyScene(tl('滚动带滑动'))
  s.description = tl('匀质圆柱（二维中为圆盘，I = ½mr²）以速度 v₀、角速度 0 放到粗糙水平地面上：先边滚边滑，经 t = v₀/(3μg) 后以 2v₀/3 纯滚动。')
  addGround(s, { id: 'ground', top: 0, left: -1, right: 12, material: { muS: v.mu, muK: v.mu } })
  addBody(s, { id: 'disc', name: tl('圆柱'), role: 'wheel', shape: { type: 'circle', radius: v.r }, position: { x: 0, y: v.r }, velocity: { x: v.v0, y: 0 }, angularVelocity: 0, mass: v.m, material: { muS: v.mu, muK: v.mu } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 1.5
  s.view = { center: { x: 2.5, y: 0.6 }, pixelsPerMeter: 110 }
  s.watch = ['disc.vx', 'disc.omega', 'contact.disc|ground.f', 'contact.disc|ground.vt', 'pair.disc|ground.heat']
  return s
}

/** Shortest decimal text of a number for expressions. */
const num = (x: number) => String(x)

// ---- 26.52 models (D58–D61, D35) ----

/** A ball in an elastic central field F = −k·r (top view): an ellipse about the centre, period 2π√(m/k). */
function centralSpring(v: Record<string, number>): Scene {
  const s = emptyScene(tl('弹性中心力'))
  s.description = tl('光滑水平面上（俯视），小球受指向中心 O 的力 F = k·r（与到 O 的距离成正比）。从距 O 为 A 处以垂直于连线的速度 v₀ 出发：轨道是以 O 为中心的椭圆，周期 T = 2π√(m/k) 与 A、v₀ 无关。')
  addBody(s, { id: 'ball', name: tl('小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.05 }, position: { x: v.A, y: 0 }, velocity: { x: 0, y: v.v0 }, mass: v.m })
  addConnector<CentralDef>(s, { id: 'field', name: tl('力心'), type: 'central', a: anchor(null, { x: 0, y: 0 }), k: v.k, n: 1, targets: ['ball'] })
  s.settings.gravity = { x: 0, y: 0 }
  s.settings.legacyDuration = Math.min(600, 2.5 * 2 * Math.PI * Math.sqrt(v.m / Math.max(v.k, 1e-6)))
  s.view = { center: { x: 0, y: 0 }, pixelsPerMeter: Math.max(20, Math.min(400, 160 / Math.max(v.A, v.v0 * Math.sqrt(v.m / Math.max(v.k, 1e-6)), 0.05))) }
  s.watch = ['ball.x', 'ball.y', 'ball.v', 'system.e']
  return s
}

/** A carriage sliding down a frictionless inclined rail onto an end stop with restitution e. */
function sliderStop(v: Record<string, number>): Scene {
  const s = emptyScene(tl('滑轨限位'))
  s.description = tl('滑块沿倾角 θ 的光滑滑轨由静止下滑，滑行 L 后撞上滑轨下端的限位：反弹速度为碰前的 e 倍，之后在限位上反复弹跳直到停下。')
  const th = v.theta * DEG
  const top = { x: 0, y: v.L * sin(th) + 0.3 }
  const blk = addBody(s, { id: 'block', name: tl('滑块'), role: 'block', shape: { type: 'box', width: 0.24, height: 0.14 }, position: top, angle: -th, mass: v.m })
  addConnector<SliderDef>(s, { id: 'rail', name: tl('滑轨'), type: 'slider', a: anchor(null, top), b: anchor(blk), axis: { x: cos(th), y: -sin(th) }, limits: { min: -0.2, max: v.L, restitution: v.e } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 3
  s.view = { center: { x: v.L * cos(th) / 2, y: top.y - v.L * sin(th) / 2 }, pixelsPerMeter: Math.max(40, Math.min(300, 420 / Math.max(v.L, 0.2))) }
  s.watch = ['block.v', 'system.e', 'ledger.impactLoss']
  return s
}

/** A rolling disc slowed by rolling resistance (C_rr) until it stops. */
function rollingResistance(v: Record<string, number>): Scene {
  const s = emptyScene(tl('滚动阻力'))
  s.description = tl('匀质圆柱在水平地面上以 v₀ 纯滚动，受滚动阻力偶 M = C_rr·N·r：速度均匀减小直到停下，机械能转化为热。')
  addGround(s, { id: 'ground', top: 0, left: -1, right: 30, material: { muS: v.mu, muK: v.mu } })
  addBody(s, { id: 'disc', name: tl('圆柱'), role: 'wheel', shape: { type: 'circle', radius: v.r }, position: { x: 0, y: v.r }, velocity: { x: v.v0, y: 0 }, angularVelocity: -v.v0 / v.r, mass: v.m, material: { muS: v.mu, muK: v.mu, restitution: 0, rolling: v.crr } })
  s.settings.gravity = { x: 0, y: -v.g }
  // Stops after v₀ / (⅔·C_rr·g) for a disc (I = ½mr²)
  s.settings.legacyDuration = Math.min(600, 1.2 * v.v0 / Math.max(2 / 3 * v.crr * v.g, 1e-3))
  s.view = { center: { x: 2.5, y: 0.6 }, pixelsPerMeter: 110 }
  s.watch = ['disc.vx', 'disc.omega', 'contact.disc|ground.f', 'ledger.frictionHeat']
  return s
}

/** A ball rolling to and fro in a V-groove cut into a fixed block (a concave body, D35). */
function vGroove(v: Record<string, number>): Scene {
  const s = emptyScene(tl('V 形槽中的小球'))
  s.description = tl('固定物块上开有 V 形槽（凹多边形），小球从左侧槽面高 h 处由静止释放：在两个槽面之间来回滚动，每次经过槽底都与另一面相碰而损失能量。')
  const th = v.theta * DEG, H = 0.8, w = H / tan(th)
  addBody(s, { id: 'groove', name: tl('V 形槽'), kind: 'static', role: 'ground', shape: { type: 'polygon', points: [{ x: -w - 0.4, y: -0.3 }, { x: w + 0.4, y: -0.3 }, { x: w + 0.4, y: H }, { x: w, y: H }, { x: 0, y: 0 }, { x: -w, y: H }, { x: -w - 0.4, y: H }] }, position: { x: 0, y: 0 }, material: { muS: v.mu, muK: v.mu, restitution: 0 } })
  const y0 = Math.min(v.h, H - v.r), x0 = -y0 / tan(th)
  addBody(s, { id: 'ball', name: tl('小球'), role: 'ball', shape: { type: 'circle', radius: v.r }, position: { x: x0 + v.r * sin(th), y: y0 + v.r * cos(th) }, mass: v.m, material: { muS: v.mu, muK: v.mu, restitution: 0 } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 4
  s.view = { center: { x: 0, y: H / 2 }, pixelsPerMeter: Math.max(60, Math.min(400, 300 / Math.max(w + 0.4, 0.3))) }
  s.watch = ['ball.v', 'system.e', 'ledger.impactLoss']
  return s
}

/** Block on a smooth floor pushed by F = F₀·sin(ωt). */
function variableForce(v: Record<string, number>): Scene {
  const s = emptyScene(tl('变力作用'))
  s.description = tl('光滑水平面上的物块受水平变力 F = F₀ sin(ωt) 作用，由静止开始运动；速度、位移与积分解析式对照。')
  addGround(s, { id: 'ground', top: 0, left: -2, right: 40 })
  const b = addBody(s, { id: 'block', name: tl('物块'), role: 'block', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0, y: 0.1 }, mass: v.m })
  addConnector<ForceDef>(s, { id: 'F', name: tl('变力 F'), type: 'force', a: anchor(b), force: { x: 0, y: 0 }, expr: { x: `${num(v.F0)}*sin(${num(v.omega)}*t)`, y: '0' } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 4
  s.view = { center: { x: 1.5, y: 0.5 }, pixelsPerMeter: 120 }
  s.watch = ['block.x', 'block.vx', 'block.ax', 'ledger.appliedWork']
  return s
}

// ---- 26.54: charges and fields (D78) and the mechanics A group (D87) ----
const MC = 1e-3, UC = 1e-6, G_ = 1e-3

/** A thin static plate (capacitor plate, screen) from x0 to x1 at height y, or vertical at x from y0 to y1. */
function plate(s: Scene, id: string, name: string, x0: number, y0: number, x1: number, y1: number) {
  const w = Math.max(Math.abs(x1 - x0), 0.02), h = Math.max(Math.abs(y1 - y0), 0.02)
  addBody(s, { id, name, kind: 'static', role: 'wall', shape: { type: 'box', width: w, height: h }, position: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, material: { muS: 0, muK: 0, restitution: 0 } })
}

function chargeDeflection(v: Record<string, number>): Scene {
  const s = emptyScene(tl('带电粒子在电场中的偏转'))
  s.description = tl('带正电的小球以初速度 v₀ 垂直于电场方向射入两板之间（不计重力）：沿初速度方向匀速、沿电场方向匀加速，轨迹为抛物线。电场充满整个区域（有界场区在 26.55 加入），右侧为荧光屏。')
  const d = 0.5, L = v.L
  plate(s, 'top', tl('上极板'), 0, d / 2 + 0.01, L, d / 2 + 0.01)
  plate(s, 'bottom', tl('下极板'), 0, -d / 2 - 0.01, L, -d / 2 - 0.01)
  plate(s, 'screen', tl('荧光屏'), L + 0.5, -0.9, L + 0.5, 0.9)
  addBody(s, { id: 'p', name: tl('带电小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.02 }, position: { x: 0, y: 0 }, velocity: { x: v.v0, y: 0 }, mass: v.m * G_, material: { restitution: 0 }, color: '#ef4444', charge: v.q * MC })
  s.settings.gravity = { x: 0, y: 0 }
  s.settings.electric = { E: { x: 0, y: -v.E } }
  // The field fills all space: end the run soon after the ball hits a plate or the screen
  s.settings.stopAt = { on: 'impact', after: 0.3 }
  s.settings.legacyDuration = Math.min(60, (L + 0.5) / Math.max(v.v0, 1e-3))
  s.view = { center: { x: L / 2 + 0.2, y: -0.1 }, pixelsPerMeter: Math.max(60, Math.min(400, 520 / (L + 0.8))) }
  s.watch = ['p.x', 'p.y', 'p.vy', 'p.FE', 'system.eE']
  return s
}

function cyclotron(v: Record<string, number>): Scene {
  const s = emptyScene(tl('带电粒子在匀强磁场中的圆周运动'))
  s.description = tl('带正电的小球在垂直纸面向外的匀强磁场中运动（不计重力）：洛伦兹力提供向心力，r = mv/(qB)，周期 T = 2πm/(qB) 与速度无关。')
  const r = (v.m * G_ * v.v) / (v.q * MC * v.B)
  addBody(s, { id: 'p', name: tl('带电小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: Math.max(0.005, Math.min(0.03, r * 0.05)) }, position: { x: 0, y: 0 }, velocity: { x: v.v, y: 0 }, mass: v.m * G_, color: '#ef4444', charge: v.q * MC })
  s.settings.gravity = { x: 0, y: 0 }
  s.settings.magnetic = { B: v.B }
  s.settings.legacyDuration = Math.min(600, 1.2 * 2 * Math.PI * v.m * G_ / (v.q * MC * v.B))
  s.view = { center: { x: 0, y: -r }, pixelsPerMeter: Math.max(20, Math.min(600, 150 / Math.max(r, 1e-3))) }
  s.watch = ['p.v', 'p.FB', 'p.a']
  return s
}

function velocitySelector(v: Record<string, number>): Scene {
  const s = emptyScene(tl('速度选择器'))
  s.description = tl('两板间有竖直向下的匀强电场 E 和垂直纸面向里的匀强磁场 B。带正电的小球（不计重力）以 v₀ 水平射入：v₀ = E/B 时电场力与洛伦兹力平衡，做匀速直线运动；否则偏转。')
  const d = 0.8, L = 3
  plate(s, 'top', tl('上极板'), 0, d / 2 + 0.01, L, d / 2 + 0.01)
  plate(s, 'bottom', tl('下极板'), 0, -d / 2 - 0.01, L, -d / 2 - 0.01)
  addBody(s, { id: 'p', name: tl('带电小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.02 }, position: { x: -0.4, y: 0 }, velocity: { x: v.v0, y: 0 }, mass: v.m * G_, material: { restitution: 0 }, color: '#ef4444', charge: v.q * MC })
  s.settings.gravity = { x: 0, y: 0 }
  s.settings.electric = { E: { x: 0, y: -v.E } }
  s.settings.magnetic = { B: -v.B }
  s.settings.legacyDuration = Math.min(60, (L + 0.8) / Math.max(v.v0, 1e-3))
  s.view = { center: { x: 1.3, y: 0 }, pixelsPerMeter: 150 }
  s.watch = ['p.vx', 'p.vy', 'p.FE', 'p.FB']
  return s
}

function twoCharges(v: Record<string, number>): Scene {
  const s = emptyScene(tl('两个带电小球'))
  s.description = tl('光滑水平面上（俯视，不计重力）两个带电小球由静止释放，相互作用的库仑力 F = kq₁q₂/r² 大小相等、方向相反：同种电荷相互排斥，异种电荷相互吸引（相碰后弹开）。系统的总动量守恒，动能与电势能之和守恒。')
  const r = 0.04
  addBody(s, { id: 'A', name: tl('小球A'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: -v.d / 2, y: 0 }, mass: v.m1 * G_, material: { restitution: 1 }, color: '#ef4444', charge: v.q1 * UC })
  addBody(s, { id: 'B', name: tl('小球B'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: v.d / 2, y: 0 }, mass: v.m2 * G_, material: { restitution: 1 }, color: '#2563eb', charge: v.q2 * UC })
  s.settings.gravity = { x: 0, y: 0 }
  s.settings.coulomb = { k: COULOMB_K }
  s.settings.legacyDuration = 2
  s.view = { center: { x: 0, y: 0 }, pixelsPerMeter: 220 }
  s.watch = ['A.Fc', 'A.vx', 'B.vx', 'system.px', 'system.eE']
  return s
}

function alphaScattering(v: Record<string, number>): Scene {
  const s = emptyScene(tl('α 粒子散射'))
  s.description = tl('带正电的 α 粒子从远处射向固定的原子核（教学单位：k = 1），瞄准距离为 b。库仑斥力使它沿双曲线偏转，b 越小偏转越大，正对射入时被弹回。最近距离与偏转角可与卢瑟福的公式对照。')
  addBody(s, { id: 'nucleus', name: tl('原子核'), kind: 'static', role: 'generic', shape: { type: 'circle', radius: 0.05 }, position: { x: 0, y: 0 }, color: '#dc2626', charge: v.Q })
  addBody(s, { id: 'alpha', name: tl('α 粒子'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.03 }, position: { x: -6, y: v.b }, velocity: { x: v.v0, y: 0 }, mass: v.m, color: '#f59e0b', charge: v.q })
  s.settings.gravity = { x: 0, y: 0 }
  s.settings.coulomb = { k: 1 }
  s.settings.legacyDuration = Math.min(60, 12 / Math.max(v.v0, 0.05))
  s.view = { center: { x: 0, y: 0 }, pixelsPerMeter: 70 }
  s.watch = ['alpha.v', 'alpha.Fc', 'system.e', 'system.eE']
  return s
}

function inertia(v: Record<string, number>): Scene {
  const s = emptyScene(tl('惯性：快速抽出纸条'))
  s.description = tl('物块放在一张纸条上，用较大的力 F 迅速抽出纸条：物块与纸条间的摩擦力很小、作用时间很短，物块几乎留在原处（惯性）。减小 F 再试，物块会随纸条一起移动。')
  addGround(s, { id: 'table', name: tl('桌面'), top: 0, left: -1, right: 3, material: { muS: 0.6, muK: 0.6 } })
  const paper = addBody(s, { id: 'paper', name: tl('纸条'), role: 'board', shape: { type: 'box', width: 1, height: 0.01 }, position: { x: 0.5, y: 0.005 }, mass: 0.01, material: { muS: 0, muK: 0 }, color: '#e5e7eb' })
  addBody(s, { id: 'block', name: tl('物块'), role: 'block', shape: { type: 'box', width: 0.2, height: 0.15 }, position: { x: 0.5, y: 0.01 + 0.075 }, mass: v.m, material: { muS: v.mu, muK: v.mu } })
  s.contactPairs.push({ a: 'block', b: 'paper', muS: v.mu, muK: v.mu, restitution: 0 })
  s.contactPairs.push({ a: 'paper', b: 'table', muS: 0, muK: 0, restitution: 0 })
  s.contactPairs.push({ a: 'block', b: 'table', muS: 0.6, muK: 0.6, restitution: 0 })
  addConnector<ForceDef>(s, { id: 'pull', name: tl('拉力'), type: 'force', a: anchor(paper, { x: 0.5, y: 0 }), force: { x: v.F, y: 0 } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 0.6
  s.view = { center: { x: 0.9, y: 0.3 }, pixelsPerMeter: 260 }
  s.watch = ['block.x', 'paper.x', 'block.vx', 'contact.block|paper.f']
  return s
}

function elevator(v: Record<string, number>): Scene {
  const s = emptyScene(tl('电梯中的弹簧秤'))
  s.description = tl('电梯厢在竖直滑轨上由拉力 F 带动加速上升，厢顶用弹簧秤挂一个质量 m 的物体（弹簧有阻尼，振动很快消失）。稳定后弹簧秤示数 F弹 = m(g + a)：加速上升时超重，减速上升或加速下降时失重。')
  const cabin = addBody(s, { id: 'cabin', name: tl('电梯厢顶'), role: 'block', shape: { type: 'box', width: 0.8, height: 0.08 }, position: { x: 0, y: 1.2 }, mass: v.M, fixedRotation: true, color: '#64748b' })
  addConnector<SliderDef>(s, { id: 'rail', name: tl('滑轨'), type: 'slider', a: anchor(null, { x: 0, y: 1.2 }), b: anchor(cabin), axis: { x: 0, y: 1 } })
  const L0 = 0.4, ext = (v.m * v.g) / v.k
  const load = addBody(s, { id: 'load', name: tl('物体'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.06 }, position: { x: 0, y: 1.2 - 0.04 - L0 - ext }, mass: v.m, color: '#f59e0b' })
  addConnector<SpringDef>(s, { id: 'scale', name: tl('弹簧秤'), type: 'spring', a: anchor(cabin, { x: 0, y: -0.04 }), b: anchor(load), stiffness: v.k, restLength: L0, damping: v.c })
  addConnector<ForceDef>(s, { id: 'lift', name: tl('拉力 F'), type: 'force', a: anchor(cabin), force: { x: 0, y: v.F } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 3
  s.view = { center: { x: 0, y: 2.2 }, pixelsPerMeter: 110 }
  s.watch = ['scale.F', 'cabin.ay', 'load.ay', 'cabin.vy']
  return s
}

function cosmicVelocity(v: Record<string, number>): Scene {
  const s = emptyScene(tl('宇宙速度'))
  s.description = tl('在地球表面附近水平发射卫星（教学单位 G = 1，地球质量 M、半径 R）。v = v₁ = √(GM/R)（k = 1）时贴地做圆周运动，第一宇宙速度；v₁ < v < √2·v₁ 为椭圆轨道；v ≥ √2·v₁（第二宇宙速度）时逃离地球；v < v₁ 时落回地面。')
  s.settings.gravitation = { G: 1 }
  s.settings.gravity = { x: 0, y: 0 }
  addBody(s, { id: 'earth', name: tl('地球'), kind: 'static', role: 'generic', shape: { type: 'circle', radius: v.R }, position: { x: 0, y: 0 }, mass: v.M, color: '#2563eb', material: { muS: 0, muK: 0, restitution: 0 } })
  const r0 = v.R + 0.03 + 1e-3
  const v1 = Math.sqrt(v.M / r0)
  addBody(s, { id: 'sat', name: tl('卫星'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.03 }, position: { x: 0, y: r0 }, velocity: { x: -v.k * v1, y: 0 }, mass: 1, color: '#f59e0b', material: { restitution: 0 } })
  const eps = (v.k * v1) ** 2 / 2 - v.M / r0
  const a = eps < 0 ? -v.M / (2 * eps) : 3 * r0
  s.settings.legacyDuration = Math.min(600, eps < 0 ? 1.15 * 2 * Math.PI * Math.sqrt(a ** 3 / v.M) : 20 * r0 / v1)
  s.view = { center: { x: 0, y: eps < 0 ? r0 - a : 0 }, pixelsPerMeter: Math.max(10, Math.min(300, 260 / Math.max(a, r0))) }
  s.watch = ['sat.v', 'sat.Fg', 'system.e']
  return s
}

function resonance(v: Record<string, number>): Scene {
  const s = emptyScene(tl('受迫振动与共振'))
  s.description = tl('有阻尼的弹簧振子受周期性驱动力 F = F₀ sin(ωt)。稳定后以驱动频率振动，振幅 A = F₀/√((k − mω²)² + (cω)²)；ω 接近固有频率 ω₀ = √(k/m) 时振幅最大（共振）。')
  addGround(s, { id: 'ground', top: 0, left: -0.4, right: 3 })
  const L0 = 0.8, w = 0.2
  addBody(s, { id: 'wall', name: tl('墙'), kind: 'static', role: 'wall', shape: { type: 'box', width: 0.1, height: 0.6 }, position: { x: -0.05, y: 0.3 } })
  const b = addBody(s, { id: 'block', name: tl('振子'), role: 'block', shape: { type: 'box', width: w, height: w }, position: { x: L0 + w / 2, y: w / 2 }, mass: v.m })
  addConnector<SpringDef>(s, { id: 'spring', name: tl('弹簧'), type: 'spring', a: anchor(b, { x: -w / 2, y: 0 }), b: anchor(null, { x: 0, y: w / 2 }), stiffness: v.k, restLength: L0, damping: v.c })
  addConnector<ForceDef>(s, { id: 'drive', name: tl('驱动力'), type: 'force', a: anchor(b), force: { x: 0, y: 0 }, expr: { x: `${num(v.F0)}*sin(${num(v.omega)}*t)`, y: '0' } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 20
  s.view = { center: { x: 1, y: 0.4 }, pixelsPerMeter: 200 }
  s.watch = ['block.x', 'block.vx', 'spring.F', 'drive.Fx']
  return s
}

function inclineEfficiency(v: Record<string, number>): Scene {
  const s = emptyScene(tl('斜面的机械效率'))
  s.description = tl('用平行于斜面的拉力 F 把物块匀速拉上倾角 θ 的粗糙斜面。有用功是克服重力做的功 W有 = mgh，总功 W总 = Fs = mgh + Q（Q 为摩擦生热），机械效率 η = W有/W总 = sinθ/(sinθ + μcosθ)。')
  const th = v.theta * DEG, base = 4
  addIncline(s, { id: 'incline', angle: th, base, material: { muS: v.mu, muK: v.mu } })
  const w = 0.3, h = 0.2
  // near the foot of the slope (onIncline measures from the top)
  const pl = onIncline(th, base, base / cos(th) - 0.8, w, h)
  const blk = addBody(s, { id: 'block', name: tl('物块'), role: 'block', shape: { type: 'box', width: w, height: h }, position: pl.position, angle: pl.angle, mass: v.m, material: { muS: v.mu, muK: v.mu } })
  // uniform motion up the slope: F = mg(sin θ + μ cos θ) along the slope, starting with speed v up the slope
  const F = v.m * v.g * (sin(th) + v.mu * cos(th))
  const up = { x: -cos(th), y: sin(th) }
  addConnector<ForceDef>(s, { id: 'pull', name: tl('拉力'), type: 'force', a: anchor(blk), force: { x: F * up.x, y: F * up.y } })
  blk.velocity = { x: v.v0 * up.x, y: v.v0 * up.y }
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.energyZeroY = pl.position.y
  s.settings.legacyDuration = 1.2
  s.customQuantities = [{ id: 'eta', name: tl('机械效率 η'), expr: 'ep(block)/(ep(block) + heat(block, incline))' }]
  s.view = { center: { x: 2, y: 1.2 }, pixelsPerMeter: 150 }
  s.watch = ['custom.eta', 'pull.P', 'block.v', 'ledger.appliedWork', 'pair.block|incline.heat']
  return s
}

function wheelAxle(v: Record<string, number>): Scene {
  const s = emptyScene(tl('轮轴'))
  s.description = tl('轮（半径 R）和轴（半径 r）固定在一起，绕共同的中心转动。轴上用绳挂重物 G = mg，轮的边缘用绳竖直向下拉住，轮轴静止。拉力 F = G·r/R：轮半径是轴半径的几倍，所用的力就是物重的几分之一（省力），但拉绳移动的距离是重物移动距离的 R/r 倍。')
  const pivot = { x: 0, y: 1.2 }
  const R = Math.max(v.R, v.r + 0.02), r = v.r
  const wheel = addBody(s, { id: 'wheel', name: tl('轮'), role: 'generic', shape: { type: 'circle', radius: R }, position: pivot, mass: v.M, color: '#94a3b8' })
  const axle = addBody(s, { id: 'axle', name: tl('轴'), role: 'generic', shape: { type: 'circle', radius: r }, position: pivot, mass: 0.2 * v.M * (r / R) ** 2, color: '#475569' })
  addConnector<HingeDef>(s, { id: 'hinge', name: tl('转轴'), type: 'hinge', a: anchor(wheel), b: anchor(null, pivot) })
  addConnector<WeldDef>(s, { id: 'weld', name: tl('轮与轴固定'), type: 'weld', a: anchor(axle), b: anchor(wheel) })
  const box = 0.16
  const load = addBody(s, { id: 'load', name: tl('重物'), kind: 'particle', role: 'block', shape: { type: 'box', width: box, height: box }, position: { x: pivot.x + r, y: pivot.y - R - 0.45 }, mass: v.m, color: '#b45309' })
  addConnector<RopeDef>(s, { id: 'loadRope', name: tl('挂重物的绳'), type: 'rope', a: anchor(axle, { x: r, y: 0 }), b: anchor(load, { x: 0, y: box / 2 }), pulleys: [], length: null })
  addConnector<RopeDef>(s, { id: 'effort', name: tl('拉绳'), type: 'rope', a: anchor(wheel, { x: -R, y: 0 }), b: anchor(null, { x: pivot.x - R, y: pivot.y - R - 0.5 }), pulleys: [], length: null })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 1
  // G/F equals R/r while the wheel and axle is at rest (F·R = G·r)
  s.customQuantities = [{ id: 'gain', name: tl('省力倍数 G/F（R/r = {0}）', [Number((R / r).toPrecision(4))]), expr: 'T(loadRope)/T(effort)' }]
  s.view = { center: { x: 0, y: 0.75 }, pixelsPerMeter: 240 }
  s.watch = ['effort.T', 'loadRope.T', 'custom.gain', 'wheel.omega']
  return s
}

/** All templates, in gallery order. */
export const TEMPLATES: TemplateInfo[] = trDeep([
  { id: 'incline', group: '斜面与摩擦', name: '斜面滑块', description: '物块沿斜面下滑；μ 可为 0', params: [p('theta', '倾角 θ', '°', 30, 1, 80), p('m', '质量 m', 'kg', 2, 0.01), p('mu', '动摩擦因数 μ', '', 0.2, 0, 2, 0.01), gp()], build: inclineBlock },
  { id: 'board-block', group: '斜面与摩擦', name: '板块模型', description: '物块滑上静止长木板，木板与地面有摩擦', params: [p('M', '木板质量 M', 'kg', 2, 0.01), p('m', '物块质量 m', 'kg', 1, 0.01), p('v0', '物块初速度 v₀', 'm/s', 4), p('mu1', '物块—木板 μ₁', '', 0.4, 0, 2, 0.01), p('mu2', '木板—地面 μ₂', '', 0.1, 0, 2, 0.01), gp()], build: boardBlock },
  { id: 'conveyor', group: '传送带', name: '水平传送带', description: '物块轻放在运行的传送带上', params: [p('u', '带速 u', 'm/s', 2), p('m', '质量 m', 'kg', 1, 0.01), p('mu', '动摩擦因数 μ', '', 0.5, 0, 2, 0.01), gp()], build: conveyorFlat },
  { id: 'conveyor-incline', group: '传送带', name: '倾斜传送带', description: '传送带沿斜面向下运行，物块轻放在顶端', params: [p('theta', '倾角 θ', '°', 37, 1, 80), p('u', '带速 u（向下）', 'm/s', 2), p('m', '质量 m', 'kg', 1, 0.01), p('mu', '动摩擦因数 μ', '', 0.5, 0, 2, 0.01), gp()], build: conveyorIncline },
  { id: 'collision-1d', group: '碰撞', name: '一维碰撞', description: '弹性 e=1、非弹性 0<e<1、完全非弹性 e=0', params: [p('m1', '质量 m₁', 'kg', 1, 0.01), p('m2', '质量 m₂', 'kg', 2, 0.01), p('v0', '初速度 v₀', 'm/s', 2), p('e', '恢复系数 e', '', 1, 0, 1, 0.05)], build: collision1D },
  { id: 'collision-2d', group: '碰撞', name: '二维斜碰', description: '光滑小球的斜碰', params: [p('m1', '质量 m₁', 'kg', 1, 0.01), p('m2', '质量 m₂', 'kg', 1, 0.01), p('v0', '初速度 v₀', 'm/s', 2), p('b', '瞄准偏移 b', 'm', 0.1, -0.19, 0.19, 0.01), p('e', '恢复系数 e', '', 1, 0, 1, 0.05)], build: collision2D },
  { id: 'projectile', group: '抛体', name: '抛体运动', description: '平抛（α=0）与斜抛', params: [p('v0', '初速度 v₀', 'm/s', 10), p('alpha', '仰角 α', '°', 45, -89, 89), p('h', '抛出高度 h', 'm', 0, 0), p('m', '质量 m', 'kg', 0.1, 0.001), gp()], build: projectile },
  { id: 'pendulum', group: '振动', name: '单摆', description: '小角度近似与大角度精确周期对照', params: [p('L', '摆长 L', 'm', 1, 0.05), p('theta0', '初始偏角 θ₀', '°', 5, 0.1, 170), p('m', '摆球质量 m', 'kg', 0.5, 0.001), gp()], build: pendulum },
  { id: 'spring', group: '振动', name: '弹簧振子', description: '光滑水平面上的弹簧振子', params: [p('k', '劲度系数 k', 'N/m', 50, 0.01), p('m', '质量 m', 'kg', 0.5, 0.001), p('A', '振幅 A', 'm', 0.1, 0.001, 0.6), gp()], build: springOscillator },
  { id: 'hinged-rod', group: '刚体转动', name: '定轴转动细杆', description: '从水平位置释放的铰接细杆', params: [p('L', '杆长 L', 'm', 1, 0.05), p('m', '质量 m', 'kg', 1, 0.001), gp()], build: hingedRod },
  { id: 'rolling', group: '刚体转动', name: '斜面上的圆柱', description: '纯滚动与边滚边滑', params: [p('theta', '倾角 θ', '°', 30, 1, 80), p('r', '半径 r', 'm', 0.15, 0.01), p('m', '质量 m', 'kg', 1, 0.001), p('mu', '摩擦因数 μ', '', 0.3, 0, 2, 0.01), gp()], build: rollingCylinder },
  { id: 'ball-rod', group: '刚体转动', name: '小球碰撞细杆', description: '角动量守恒（对转轴）', params: [p('M', '杆质量 M', 'kg', 1, 0.001), p('L', '杆长 L', 'm', 1, 0.1), p('m', '小球质量 m', 'kg', 0.2, 0.001), p('v0', '小球速度 v₀', 'm/s', 3), p('d', '撞击点到转轴 d', 'm', 0.8, 0.05), p('e', '恢复系数 e', '', 1, 0, 1, 0.05)], build: ballHitsRod },
  { id: 'atwood', group: '连接体', name: '阿特伍德机', description: '两物块跨过定滑轮悬挂', params: [p('m1', '质量 m₁', 'kg', 1, 0.01), p('m2', '质量 m₂', 'kg', 1.5, 0.01), gp()], build: atwood },
  { id: 'table-pulley', group: '连接体', name: '桌面—滑轮连接体', description: '整体法与隔离法对照', params: [p('m1', '桌上物块 m₁', 'kg', 2, 0.01), p('m2', '悬挂物块 m₂', 'kg', 1, 0.01), p('mu', '桌面 μ', '', 0.2, 0, 2, 0.01), gp()], build: tablePulley },
  // 26.49 models
  { id: 'vertical-circle-rope', group: '圆周运动', name: '竖直面圆周（绳）', description: '最高点临界速度 √(gL)；v₀ < √(5gL) 时绳松弛', params: [p('L', '绳长 L', 'm', 0.5, 0.05, 3), p('v0', '最低点速度 v₀', 'm/s', 4.5, 0), p('m', '小球质量 m', 'kg', 0.2, 0.001), gp()], build: v => verticalCircle(v, false) },
  { id: 'vertical-circle-rod', group: '圆周运动', name: '竖直面圆周（杆）', description: '最高点杆力方向随速度改变，v = √(gL) 时为零', params: [p('L', '杆长 L', 'm', 0.5, 0.05, 3), p('v0', '最低点速度 v₀', 'm/s', 4.5, 0), p('m', '小球质量 m', 'kg', 0.2, 0.001), gp()], build: v => verticalCircle(v, true) },
  { id: 'movable-pulley', group: '连接体', name: '动滑轮', description: '一个动滑轮、两个定滑轮：a₁ = 2a₂', params: [p('m1', '悬挂物块 m₁', 'kg', 1, 0.01), p('m2', '动滑轮下物块 m₂', 'kg', 1.5, 0.01), gp()], build: movablePulley },
  { id: 'movable-wedge', group: '动量守恒', name: '可动斜面', description: '光滑地面上的斜面与下滑物块：水平动量守恒', params: [p('M', '斜面质量 M', 'kg', 3, 0.01), p('m', '物块质量 m', 'kg', 1, 0.01), p('theta', '倾角 θ', '°', 30, 5, 70), gp()], build: movableWedge },
  { id: 'spring-blocks', group: '动量守恒', name: '弹簧连接体', description: '压缩最大时共速，动量守恒，弹性势能最大值', params: [p('m1', '物块1质量 m₁', 'kg', 1, 0.01), p('m2', '物块2质量 m₂', 'kg', 2, 0.01), p('k', '劲度系数 k', 'N/m', 50, 0.01), p('v0', '物块1初速度 v₀', 'm/s', 2), gp()], build: springBlocks },
  { id: 'rolling-slip', group: '刚体转动', name: '滚动带滑动', description: '圆柱以 v₀、ω₀ = 0 放在粗糙地面上：先打滑后纯滚动', params: [p('r', '半径 r', 'm', 0.15, 0.01), p('m', '质量 m', 'kg', 1, 0.001), p('v0', '初速度 v₀', 'm/s', 3), p('mu', '动摩擦因数 μ', '', 0.2, 0.001, 2, 0.01), gp()], build: rollingSlip },
  { id: 'variable-force', group: '变力', name: '变力 F = F₀ sin ωt', description: '光滑水平面上受正弦变力的物块', params: [p('F0', '力的幅值 F₀', 'N', 5), p('omega', '角频率 ω', 'rad/s', 3, 0.01), p('m', '质量 m', 'kg', 1, 0.001), gp()], build: variableForce },
  // 26.51 models
  { id: 'uniform-motion', group: '直线运动', name: '匀速直线运动', description: '光滑水平面上的匀速运动：s = vt', params: [p('v', '速度 v', 'm/s', 2), p('m', '质量 m', 'kg', 1, 0.01), gp()], build: uniformMotion },
  { id: 'pull-force', group: '直线运动', name: '拉力作用下的物块', description: '恒力做功、功率、动能定理与动量定理', params: [p('F', '拉力 F', 'N', 10, 0), p('alpha', '拉力仰角 α', '°', 0, -80, 80), p('m', '质量 m', 'kg', 2, 0.01), p('mu', '动摩擦因数 μ', '', 0.2, 0, 2, 0.01), gp()], build: pullForce },
  { id: 'free-fall', group: '抛体', name: '自由落体', description: 'h = ½gt²，v = gt，机械能守恒', params: [p('h', '下落高度 h', 'm', 5, 0.05, 500), p('m', '质量 m', 'kg', 0.1, 0.001), gp()], build: freeFall },
  { id: 'lever', group: '力与平衡', name: '杠杆平衡', description: '杠杆平衡条件 F₁l₁ = F₂l₂', params: [p('m', '重物质量 m', 'kg', 2, 0.01), p('l2', '阻力臂 l₂', 'm', 0.3, 0.05, 2), p('l1', '动力臂 l₁', 'm', 0.5, 0.05, 2), p('M', '杠杆质量 M', 'kg', 1, 0.01), gp()], build: lever },
  { id: 'uniform-circle', group: '圆周运动', name: '匀速圆周运动（俯视）', description: '向心力 F = mv²/r，周期 T = 2πr/v', params: [p('r', '半径 r', 'm', 0.5, 0.05, 5), p('v', '线速度 v', 'm/s', 2, 0.01), p('m', '小球质量 m', 'kg', 0.2, 0.001)], build: uniformCircle },
  { id: 'orbit', group: '万有引力', name: '行星绕恒星运动', description: '圆轨道与椭圆轨道：开普勒定律、活力公式（G = 1）', params: [p('M', '恒星质量 M', 'kg', 1000, 1), p('r0', '初始距离 r₀', 'm', 5, 1, 50), p('k', '速度倍数 k = v₀/√(GM/r₀)', '', 1, 0.5, 1.4, 0.05), p('m', '行星质量 m', 'kg', 1, 0.001)], build: orbit },
  { id: 'drag-fall', group: '空气阻力', name: '有空气阻力的下落', description: '终端速度；线性阻力 v = v_t(1 − e^(−bt/m))', params: [p('m', '质量 m', 'kg', 0.5, 0.001), p('b', '线性阻力系数 b', 'N·s/m', 0.5, 0), p('c', '平方阻力系数 c', 'N·s²/m²', 0, 0), p('h', '下落高度 h', 'm', 100, 1, 10000), gp()], build: dragFall },
  { id: 'damped-spring', group: '振动', name: '阻尼振动', description: '振幅按指数衰减，周期比无阻尼时略长', params: [p('k', '劲度系数 k', 'N/m', 50, 0.01), p('m', '质量 m', 'kg', 0.5, 0.001), p('c', '阻尼系数 c', 'N·s/m', 0.5, 0), p('A', '振幅 A', 'm', 0.1, 0.001, 0.6), gp()], build: dampedSpring },
  { id: 'motor-disc', group: '刚体转动', name: '恒力矩转盘', description: '转动定律 β = M/I', params: [p('M', '力矩 M', 'N·m', 0.5), p('m', '圆盘质量 m', 'kg', 2, 0.001), p('r', '半径 r', 'm', 0.3, 0.01), gp()], build: motorDisc },
  { id: 'gears', group: '刚体转动', name: '齿轮传动', description: '啮合点线速度相等；等效转动惯量', params: [p('rA', '主动轮半径 r_A', 'm', 0.2, 0.01), p('rB', '从动轮半径 r_B', 'm', 0.4, 0.01), p('mA', '主动轮质量 m_A', 'kg', 1, 0.001), p('mB', '从动轮质量 m_B', 'kg', 2, 0.001), p('M', '马达力矩 M', 'N·m', 0.5), gp()], build: gears },
  // 26.52 models
  { id: 'central-spring', group: '有心力', name: '弹性中心力', description: '有心力 F = k·r：以力心为中心的椭圆，周期与振幅无关', params: [p('k', '强度 k', 'N/m', 20, 0.01), p('m', '质量 m', 'kg', 0.5, 0.001), p('A', '初始距离 A', 'm', 0.5, 0.05, 5), p('v0', '初速度 v₀', 'm/s', 2, 0)], build: centralSpring },
  { id: 'slider-stop', group: '连接体', name: '滑轨限位', description: '滑块撞上滑轨限位后按恢复系数 e 反弹', params: [p('theta', '倾角 θ', '°', 30, 5, 80), p('L', '到限位的距离 L', 'm', 1, 0.1, 5), p('m', '质量 m', 'kg', 1, 0.01), p('e', '限位恢复系数 e', '', 0.5, 0, 1, 0.05), gp()], build: sliderStop },
  { id: 'rolling-resistance', group: '刚体转动', name: '滚动阻力', description: '滚动阻力偶 M = C_rr·N·r 使滚动的圆柱停下', params: [p('r', '半径 r', 'm', 0.15, 0.01), p('m', '质量 m', 'kg', 1, 0.001), p('v0', '初速度 v₀', 'm/s', 2), p('crr', '滚动阻力系数 C_rr', '', 0.05, 0.001, 0.5, 0.005), p('mu', '摩擦因数 μ', '', 0.5, 0.05, 2, 0.01), gp()], build: rollingResistance },
  { id: 'v-groove', group: '凹形与复合体', name: 'V 形槽中的小球', description: '凹形物体：小球在两个槽面间来回滚动，经过槽底时碰撞', params: [p('theta', '槽面倾角 θ', '°', 35, 10, 70), p('h', '释放高度 h', 'm', 0.5, 0.05, 0.7), p('r', '小球半径 r', 'm', 0.08, 0.02, 0.2), p('m', '质量 m', 'kg', 0.5, 0.001), p('mu', '摩擦因数 μ', '', 0.5, 0, 2, 0.01), gp()], build: vGroove },
  // 26.54: charges and fields (D78)
  { id: 'charge-deflection', group: '电与磁', name: '带电粒子在电场中的偏转', description: '类平抛：沿初速度匀速、沿电场匀加速（不计重力）', params: [p('q', '电荷量 q', 'mC', 1, 1e-6), p('m', '质量 m', 'g', 1, 1e-6), p('E', '场强 E', 'V/m', 2, 0), p('v0', '初速度 v₀', 'm/s', 3, 0.01), p('L', '极板长 L', 'm', 1.2, 0.1, 5)], build: chargeDeflection },
  { id: 'cyclotron', group: '电与磁', name: '磁场中的圆周运动', description: '洛伦兹力提供向心力：r = mv/(qB)，T = 2πm/(qB)', params: [p('q', '电荷量 q', 'mC', 1, 1e-6), p('m', '质量 m', 'g', 1, 1e-6), p('B', '磁感应强度 B', 'T', 2, 1e-6), p('v', '速度 v', 'm/s', 1, 0.001)], build: cyclotron },
  { id: 'velocity-selector', group: '电与磁', name: '速度选择器', description: 'v₀ = E/B 时匀速直线通过，否则偏转', params: [p('E', '场强 E', 'V/m', 4, 0), p('B', '磁感应强度 B', 'T', 2, 1e-6), p('v0', '入射速度 v₀', 'm/s', 2, 0.01), p('q', '电荷量 q', 'mC', 1, 1e-6), p('m', '质量 m', 'g', 1, 1e-6)], build: velocitySelector },
  { id: 'two-charges', group: '电与磁', name: '两个带电小球', description: '库仑定律；同种相斥、异种相吸；动量守恒', params: [p('q1', '电荷量 q₁', 'μC', 1), p('q2', '电荷量 q₂', 'μC', 1), p('m1', '质量 m₁', 'g', 10, 0.001), p('m2', '质量 m₂', 'g', 10, 0.001), p('d', '初始距离 d', 'm', 0.3, 0.1, 2)], build: twoCharges },
  { id: 'alpha-scattering', group: '电与磁', name: 'α 粒子散射', description: '库仑斥力使 α 粒子偏转；b 越小偏转越大（k = 1）', params: [p('Q', '原子核电荷 Q', 'C', 2, 0.01), p('q', 'α 粒子电荷 q', 'C', 1, 0.01), p('m', 'α 粒子质量 m', 'kg', 1, 0.001), p('v0', '初速度 v₀', 'm/s', 2, 0.05), p('b', '瞄准距离 b', 'm', 0.5, 0, 3, 0.05)], build: alphaScattering },
  // 26.54: mechanics A group (D87)
  { id: 'inertia', group: '力与平衡', name: '惯性：抽纸条', description: '快速抽出纸条，物块几乎不动', params: [p('F', '拉力 F', 'N', 20, 0), p('m', '物块质量 m', 'kg', 0.5, 0.01), p('mu', '物块—纸条 μ', '', 0.15, 0, 2, 0.01), gp()], build: inertia },
  { id: 'elevator', group: '超重与失重', name: '电梯中的弹簧秤', description: '加速上升超重，F弹 = m(g + a)', params: [p('F', '拉力 F', 'N', 80, 0), p('M', '厢顶质量 M', 'kg', 5, 0.01), p('m', '物体质量 m', 'kg', 1, 0.01), p('k', '弹簧劲度系数 k', 'N/m', 400, 1), p('c', '弹簧阻尼 c', 'N·s/m', 12, 0), gp()], build: elevator },
  { id: 'cosmic-velocity', group: '万有引力', name: '宇宙速度', description: '第一宇宙速度贴地环绕，√2 倍时逃逸（G = 1）', params: [p('M', '地球质量 M', 'kg', 1000, 1), p('R', '地球半径 R', 'm', 1, 0.1, 10), p('k', '速度倍数 k = v/v₁', '', 1, 0.5, 1.6, 0.05)], build: cosmicVelocity },
  { id: 'resonance', group: '振动', name: '受迫振动与共振', description: '驱动频率接近固有频率时振幅最大', params: [p('k', '劲度系数 k', 'N/m', 50, 0.01), p('m', '质量 m', 'kg', 0.5, 0.001), p('c', '阻尼系数 c', 'N·s/m', 0.5, 0), p('F0', '驱动力幅值 F₀', 'N', 1, 0), p('omega', '驱动角频率 ω', 'rad/s', 10, 0.01), gp()], build: resonance },
  { id: 'incline-efficiency', group: '斜面与摩擦', name: '斜面的机械效率', description: '匀速拉上斜面：η = mgh/(Fs)', params: [p('theta', '倾角 θ', '°', 30, 1, 80), p('m', '质量 m', 'kg', 2, 0.01), p('mu', '动摩擦因数 μ', '', 0.2, 0, 2, 0.01), p('v0', '速度 v', 'm/s', 0.5, 0.01), gp()], build: inclineEfficiency },
  { id: 'wheel-axle', group: '力与平衡', name: '轮轴', description: '轮轴平衡：F·R = G·r，轮半径越大越省力', params: [p('R', '轮半径 R', 'm', 0.3, 0.05, 1), p('r', '轴半径 r', 'm', 0.1, 0.02, 0.8), p('m', '重物质量 m', 'kg', 3, 0.01), p('M', '轮的质量 M', 'kg', 1, 0.01), gp()], build: wheelAxle },
  // 26.55: regions, rail loops, liquids and more classic models
  ...TEMPLATES_2655
])

/** Templates the TypeScript reference can run (D77): the ones without charges or fields. */
export function referenceTemplates(): TemplateInfo[] { return TEMPLATES.filter(t => !usesFields(t.build(Object.fromEntries(t.params.map(p => [p.key, p.value]))))) }

// ---- 26.51 models (graded formula library, D44; fields and connectors, D50/D51) ----
function uniformMotion(v: Record<string, number>): Scene {
  const s = emptyScene(tl('匀速直线运动'))
  s.description = tl('光滑水平面上的物块以速度 v 运动：合力为零，速度保持不变（牛顿第一定律）。')
  addGround(s, { id: 'ground', top: 0, left: -1, right: 30 })
  addBody(s, { id: 'block', name: tl('物块'), role: 'block', shape: { type: 'box', width: 0.3, height: 0.2 }, position: { x: 0.15, y: 0.1 }, velocity: { x: v.v, y: 0 }, mass: v.m, material: { muS: 0, muK: 0, restitution: 0 } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 2
  s.view = { center: { x: 2.5, y: 0.6 }, pixelsPerMeter: 110 }
  s.watch = ['block.x', 'block.vx', 'block.a']
  return s
}

function pullForce(v: Record<string, number>): Scene {
  const s = emptyScene(tl('拉力作用下的物块'))
  s.description = tl('粗糙水平面上质量 m 的物块，受与水平成 α 角的恒定拉力 F，从静止开始运动。')
  addGround(s, { id: 'ground', top: 0, left: -1, right: 40, material: { muS: v.mu, muK: v.mu } })
  const blk = addBody(s, { id: 'block', name: tl('物块'), role: 'block', shape: { type: 'box', width: 0.3, height: 0.2 }, position: { x: 0.15, y: 0.1 }, mass: v.m, material: { muS: v.mu, muK: v.mu } })
  const a = v.alpha * DEG
  addConnector<ForceDef>(s, { id: 'pull', name: tl('拉力'), type: 'force', a: anchor(blk), force: { x: v.F * cos(a), y: v.F * sin(a) } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 2
  s.view = { center: { x: 2.5, y: 0.6 }, pixelsPerMeter: 110 }
  s.watch = ['block.vx', 'block.ax', 'pull.P', 'ledger.appliedWork', 'contact.block|ground.N']
  return s
}

function freeFall(v: Record<string, number>): Scene {
  const s = emptyScene(tl('自由落体'))
  s.description = tl('小球从高 h 处由静止释放，只受重力。')
  addGround(s, { id: 'ground', top: 0, left: -2, right: 2 })
  const r = 0.05
  addBody(s, { id: 'ball', name: tl('小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 0, y: v.h + r }, mass: v.m })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = Math.min(60, Math.sqrt(2 * v.h / Math.max(v.g, 1e-3)) + 0.3)
  s.view = { center: { x: 0, y: v.h / 2 }, pixelsPerMeter: Math.max(10, Math.min(200, 500 / Math.max(v.h, 0.5))) }
  s.watch = ['ball.y', 'ball.vy', 'ball.ek', 'ball.ep', 'system.e']
  return s
}

function lever(v: Record<string, number>): Scene {
  const s = emptyScene(tl('杠杆平衡'))
  s.description = tl('支点在杠杆的中点（自重不产生力矩）。左边距支点 l₂ 处固定重物 m，右边距支点 l₁ 处用绳竖直向下拉住，杠杆保持水平。')
  const pivot = { x: 0, y: 1 }, th = 0.05, half = Math.max(v.l1, v.l2) + 0.1
  const bar = addBody(s, { id: 'lever', name: tl('杠杆'), role: 'board', shape: { type: 'box', width: 2 * half, height: th }, position: pivot, mass: v.M })
  addConnector<HingeDef>(s, { id: 'fulcrum', name: tl('支点'), type: 'hinge', a: anchor(bar), b: anchor(null, pivot) })
  const box = 0.12
  const load = addBody(s, { id: 'load', name: tl('重物'), role: 'block', shape: { type: 'box', width: box, height: box }, position: { x: pivot.x - v.l2, y: pivot.y + th / 2 + box / 2 }, mass: v.m, color: '#b45309' })
  addConnector<WeldDef>(s, { id: 'weld', name: tl('固定点'), type: 'weld', a: anchor(load, { x: 0, y: -box / 2 }), b: anchor(bar, { x: -v.l2, y: th / 2 }) })
  addConnector<RopeDef>(s, { id: 'rope', name: tl('绳'), type: 'rope', a: anchor(bar, { x: v.l1, y: -th / 2 }), b: anchor(null, { x: pivot.x + v.l1, y: pivot.y - th / 2 - 0.6 }), pulleys: [], length: null })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 1
  s.view = { center: { x: 0, y: 0.85 }, pixelsPerMeter: 260 }
  s.watch = ['rope.T', 'fulcrum.F', 'lever.omega']
  return s
}

function uniformCircle(v: Record<string, number>): Scene {
  const s = emptyScene(tl('匀速圆周运动（俯视）'))
  s.description = tl('光滑水平桌面上，小球用长 r 的轻绳系在中心的钉子上，以速度 v 做匀速圆周运动（俯视图，重力与支持力平衡，不画出）。')
  const ball = addBody(s, { id: 'ball', name: tl('小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.04 }, position: { x: v.r, y: 0 }, velocity: { x: 0, y: v.v }, mass: v.m })
  addConnector<RopeDef>(s, { id: 'rope', name: tl('绳'), type: 'rope', a: anchor(null, { x: 0, y: 0 }), b: anchor(ball), pulleys: [], length: null })
  s.settings.gravity = { x: 0, y: 0 }
  s.settings.legacyDuration = Math.min(600, 1.2 * 2 * Math.PI * v.r / Math.max(Math.abs(v.v), 1e-3))
  s.view = { center: { x: 0, y: 0 }, pixelsPerMeter: Math.max(20, Math.min(400, 180 / Math.max(v.r, 0.05))) }
  s.watch = ['ball.v', 'ball.a', 'rope.T']
  return s
}

function orbit(v: Record<string, number>): Scene {
  const s = emptyScene(tl('行星绕恒星运动'))
  s.description = tl('只受恒星引力的行星（教学用 G = 1）。k = 1 时为圆轨道，其他值为椭圆轨道。')
  s.settings.gravitation = { G: 1 }
  s.settings.gravity = { x: 0, y: 0 }
  const GM = v.M
  addBody(s, { id: 'star', name: tl('恒星'), kind: 'static', role: 'generic', shape: { type: 'circle', radius: 0.3 }, position: { x: 0, y: 0 }, mass: v.M, color: '#f59e0b' })
  const v0 = v.k * Math.sqrt(GM / v.r0)
  addBody(s, { id: 'planet', name: tl('行星'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.08 }, position: { x: v.r0, y: 0 }, velocity: { x: 0, y: v0 }, mass: v.m, color: '#2563eb' })
  const eps = v0 * v0 / 2 - GM / v.r0
  const a = eps < 0 ? -GM / (2 * eps) : v.r0 * 3
  const T = eps < 0 ? 2 * Math.PI * Math.sqrt(a * a * a / GM) : 10
  s.settings.legacyDuration = Math.min(600, 1.15 * T)
  s.view = { center: { x: eps < 0 ? v.r0 - a : 0, y: 0 }, pixelsPerMeter: Math.max(10, Math.min(200, 300 / Math.max(a, v.r0))) }
  s.watch = ['planet.v', 'planet.Fg', 'system.e']
  return s
}

function dragFall(v: Record<string, number>): Scene {
  const s = emptyScene(tl('有空气阻力的下落'))
  s.description = tl('小球由静止下落，受空气阻力 f = bv + cv²；速度逐渐趋于终端速度。')
  addGround(s, { id: 'ground', top: 0, left: -5, right: 5 })
  const r = 0.3
  addBody(s, { id: 'ball', name: tl('小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 0, y: v.h + r }, mass: v.m, drag: { linear: v.b, quadratic: v.c } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 8
  s.view = { center: { x: 0, y: v.h / 2 }, pixelsPerMeter: Math.max(2, Math.min(100, 450 / Math.max(v.h, 1))) }
  s.watch = ['ball.vy', 'ball.fd', 'ledger.damping']
  return s
}

function dampedSpring(v: Record<string, number>): Scene {
  const s = emptyScene(tl('阻尼振动'))
  s.description = tl('光滑水平面上的弹簧振子带阻尼器（阻尼系数 c），拉开 A 后释放：振幅按指数衰减。')
  addGround(s, { id: 'ground', top: 0, left: -0.4, right: 3 })
  const L0 = 0.8, w = 0.2
  addBody(s, { id: 'wall', name: tl('墙'), kind: 'static', role: 'wall', shape: { type: 'box', width: 0.1, height: 0.6 }, position: { x: -0.05, y: 0.3 } })
  addBody(s, { id: 'block', name: tl('振子'), role: 'block', shape: { type: 'box', width: w, height: w }, position: { x: L0 + v.A + w / 2, y: w / 2 }, mass: v.m })
  addConnector<SpringDef>(s, { id: 'spring', name: tl('弹簧'), type: 'spring', a: anchor(s.bodies[2], { x: -w / 2, y: 0 }), b: anchor(null, { x: 0, y: w / 2 }), stiffness: v.k, restLength: L0, damping: v.c })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 4
  s.view = { center: { x: 1, y: 0.4 }, pixelsPerMeter: 220 }
  s.watch = ['block.x', 'block.vx', 'spring.F', 'system.e', 'ledger.damping']
  return s
}

function motorDisc(v: Record<string, number>): Scene {
  const s = emptyScene(tl('恒力矩转盘'))
  s.description = tl('绕中心光滑轴转动的匀质圆盘，马达对它施加恒定力矩 M，从静止开始转动。')
  const c = { x: 0, y: 1 }
  const disc = addBody(s, { id: 'disc', name: tl('圆盘'), role: 'wheel', shape: { type: 'circle', radius: v.r }, position: c, mass: v.m })
  addConnector<MotorDef>(s, { id: 'motor', name: tl('马达'), type: 'motor', a: anchor(null, c), b: anchor(disc), mode: 'torque', speed: 0, torque: v.M })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 2
  s.view = { center: c, pixelsPerMeter: Math.max(40, Math.min(400, 120 / Math.max(v.r, 0.05))) }
  s.watch = ['disc.omega', 'disc.alpha', 'motor.P', 'ledger.beltWork']
  return s
}

function gears(v: Record<string, number>): Scene {
  const s = emptyScene(tl('齿轮传动'))
  s.description = tl('两个圆盘齿轮外啮合，主动轮 A 受马达的恒定力矩 M，从动轮 B 反向转动。')
  const ca = { x: 0, y: 1 }, cb = { x: v.rA + v.rB, y: 1 }
  const A = addBody(s, { id: 'gearA', name: tl('主动轮'), role: 'wheel', shape: { type: 'circle', radius: v.rA }, position: ca, mass: v.mA, color: '#2563eb' })
  const B = addBody(s, { id: 'gearB', name: tl('从动轮'), role: 'wheel', shape: { type: 'circle', radius: v.rB }, position: cb, mass: v.mB, color: '#0d9488' })
  addConnector<MotorDef>(s, { id: 'motor', name: tl('马达'), type: 'motor', a: anchor(null, ca), b: anchor(A), mode: 'torque', speed: 0, torque: v.M })
  addConnector<HingeDef>(s, { id: 'axle', name: tl('轴'), type: 'hinge', a: anchor(B), b: anchor(null, cb) })
  addConnector<GearDef>(s, { id: 'gear', name: tl('齿轮'), type: 'gear', a: anchor(A), b: anchor(B), ratio: v.rB / v.rA })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 2
  s.view = { center: { x: (v.rA + v.rB) / 2, y: 1 }, pixelsPerMeter: Math.max(40, Math.min(400, 180 / Math.max(v.rA + v.rB, 0.1))) }
  s.watch = ['gearA.omega', 'gearB.omega', 'gear.M', 'motor.P']
  return s
}

/**
 * Set the default gravity magnitude (m/s²): the value of every template's g parameter and of new empty
 * scenes. Called by the app's default-gravity setting; existing scenes are not changed.
 */
export function setTemplateGravity(g: number) {
  setDefaultGravity(g)
  for (const t of TEMPLATES) for (const prm of t.params) if (prm.key === 'g') prm.value = g
}

/** The default gravity magnitude (m/s²) used by the templates and new scenes. */
export function templateGravity(): number { return defaultGravity() }

/** The template with this id, if any. */
export function templateById(id: string): TemplateInfo | undefined { return TEMPLATES.find(t => t.id === id) }

/**
 * Build a template's scene; parameters missing from `overrides` take the template's values. The id and the
 * values are recorded in `scene.extra.template`.
 */
export function buildTemplate(id: string, overrides: Record<string, number> = {}): Scene {
  const t = templateById(id)
  if (!t) throw new Error(`unknown template ${id}`)
  const values: Record<string, number> = {}
  for (const prm of t.params) values[prm.key] = overrides[prm.key] ?? prm.value
  const scene = t.build(values)
  scene.extra = { ...(scene.extra ?? {}), template: { id, values } }
  return scene
}
