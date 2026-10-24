/**
 * Classic model templates (the acceptance scenes). Each template builds a complete scene from a few
 * textbook parameters; the scene stays fully editable afterwards. Values follow docs/DEV_MANUAL_26_48.md §7
 * and, for the 26.49 models (vertical circles, movable pulley, movable wedge, spring-joined blocks, rolling
 * with slipping, variable force), docs/DEV_MANUAL_26_49.md §4.
 *
 * Every gravity parameter defaults to one value, the app's default-gravity setting (setTemplateGravity).
 */
import type { Scene } from '../core/scene/types'
import { DEG, cos, sin, tan } from '../core/math/dmath'
import { addBody, addConnector, addGround, addIncline, addPulley, anchor, defaultGravity, emptyScene, onIncline, setDefaultGravity } from '../core/scene/build'
import type { ForceDef, RodDef, RopeDef, SpringDef, HingeDef } from '../core/scene/types'

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
const gp = (): TemplateParam => p('g', '重力加速度 g', 'm/s²', defaultGravity(), 0)

function inclineBlock(v: Record<string, number>): Scene {
  const s = emptyScene('斜面滑块')
  s.description = '质量为 m 的物块从静止开始沿倾角为 θ 的斜面下滑。'
  const th = v.theta * DEG, base = 4
  addIncline(s, { id: 'incline', angle: th, base, material: { muS: v.mu, muK: v.mu } })
  const w = 0.3, h = 0.2
  const pl = onIncline(th, base, 0.3, w, h)
  addBody(s, { id: 'block', name: '物块', role: 'block', shape: { type: 'box', width: w, height: h }, position: pl.position, angle: pl.angle, mass: v.m, material: { muS: v.mu, muK: v.mu } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.duration = 1.2
  s.view = { center: { x: 2, y: 1.2 }, pixelsPerMeter: 150 }
  s.watch = ['block.x', 'block.v', 'block.a', 'contact.block|incline.N', 'contact.block|incline.f']
  return s
}

function boardBlock(v: Record<string, number>): Scene {
  const s = emptyScene('板块模型')
  s.description = '长木板静止在粗糙水平地面上，小物块以初速度 v₀ 滑上木板左端。'
  addGround(s, { id: 'ground', top: 0, left: -1, right: 12, material: { muS: v.mu2, muK: v.mu2 } })
  const L = 3, th = 0.1, bw = 0.2, bh = 0.2
  addBody(s, { id: 'board', name: '木板', role: 'board', shape: { type: 'box', width: L, height: th }, position: { x: L / 2, y: th / 2 }, mass: v.M, material: { muS: v.mu2, muK: v.mu2 } })
  addBody(s, { id: 'block', name: '物块', role: 'block', shape: { type: 'box', width: bw, height: bh }, position: { x: bw / 2, y: th + bh / 2 }, velocity: { x: v.v0, y: 0 }, mass: v.m, material: { muS: v.mu1, muK: v.mu1 } })
  s.contactPairs.push({ a: 'block', b: 'board', muS: v.mu1, muK: v.mu1, restitution: 0 })
  s.contactPairs.push({ a: 'board', b: 'ground', muS: v.mu2, muK: v.mu2, restitution: 0 })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.duration = 2.5
  s.view = { center: { x: 2.5, y: 0.6 }, pixelsPerMeter: 120 }
  s.watch = ['block.vx', 'board.vx', 'contact.block|board.f', 'contact.board|ground.f', 'pair.block|board.slide', 'pair.block|board.heat']
  return s
}

function conveyorFlat(v: Record<string, number>): Scene {
  const s = emptyScene('水平传送带')
  s.description = '水平传送带以速度 u 顺时针运行，物块轻放在左端（初速度为零）。'
  addGround(s, { id: 'belt', name: '传送带', role: 'conveyor', top: 0, left: -0.5, right: 6, thickness: 0.3, beltSpeed: v.u, material: { muS: v.mu, muK: v.mu } })
  addBody(s, { id: 'block', name: '物块', role: 'block', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0.1, y: 0.1 }, mass: v.m, material: { muS: v.mu, muK: v.mu } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.duration = 1.5
  s.view = { center: { x: 2.2, y: 0.4 }, pixelsPerMeter: 140 }
  s.watch = ['block.vx', 'contact.block|belt.f', 'pair.belt|block.slide', 'ledger.frictionHeat', 'ledger.beltWork']
  return s
}

function conveyorIncline(v: Record<string, number>): Scene {
  const s = emptyScene('倾斜传送带')
  s.description = '倾角 θ 的传送带以速度 u 向下运行，物块轻放在顶端。'
  const th = v.theta * DEG, base = 8
  addIncline(s, { id: 'belt', name: '传送带', role: 'conveyor', angle: th, base, beltSpeed: v.u, material: { muS: v.mu, muK: v.mu } })
  const pl = onIncline(th, base, 0.2, 0.2, 0.2)
  addBody(s, { id: 'block', name: '物块', role: 'block', shape: { type: 'box', width: 0.2, height: 0.2 }, position: pl.position, angle: pl.angle, mass: v.m, material: { muS: v.mu, muK: v.mu } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.duration = 1.5
  s.view = { center: { x: 3, y: 2.6 }, pixelsPerMeter: 90 }
  s.watch = ['block.v', 'contact.block|belt.f', 'pair.belt|block.slide', 'ledger.frictionHeat']
  return s
}

function collision1D(v: Record<string, number>): Scene {
  const s = emptyScene('一维碰撞')
  s.description = '光滑水平面上（俯视，不计重力），小球 A 以 v₀ 正碰静止的小球 B。'
  const r = 0.1
  addBody(s, { id: 'A', name: '小球A', kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 0, y: 0 }, velocity: { x: v.v0, y: 0 }, mass: v.m1, material: { restitution: v.e }, color: '#ef4444' })
  addBody(s, { id: 'B', name: '小球B', kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 1, y: 0 }, mass: v.m2, material: { restitution: v.e }, color: '#2563eb' })
  s.contactPairs.push({ a: 'A', b: 'B', muS: 0, muK: 0, restitution: v.e })
  s.settings.gravity = { x: 0, y: 0 }
  s.settings.duration = 1.5
  s.view = { center: { x: 1, y: 0 }, pixelsPerMeter: 160 }
  s.watch = ['A.vx', 'B.vx', 'system.px', 'system.ek']
  return s
}

function collision2D(v: Record<string, number>): Scene {
  const s = emptyScene('二维斜碰')
  s.description = '光滑水平面上（俯视），小球 A 以 v₀ 斜碰静止的小球 B，瞄准偏移 b。'
  const r = 0.1
  addBody(s, { id: 'A', name: '小球A', kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 0, y: 0 }, velocity: { x: v.v0, y: 0 }, mass: v.m1, color: '#ef4444' })
  addBody(s, { id: 'B', name: '小球B', kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 1, y: v.b }, mass: v.m2, color: '#2563eb' })
  s.contactPairs.push({ a: 'A', b: 'B', muS: 0, muK: 0, restitution: v.e })
  s.settings.gravity = { x: 0, y: 0 }
  s.settings.duration = 1.5
  s.view = { center: { x: 1, y: 0 }, pixelsPerMeter: 160 }
  s.watch = ['A.v', 'B.v', 'system.px', 'system.py', 'system.ek']
  return s
}

function projectile(v: Record<string, number>): Scene {
  const s = emptyScene('抛体运动')
  s.description = '小球从高 h 处以速度 v₀、仰角 α 抛出（α = 0 为平抛）。'
  const r = 0.03
  addGround(s, { id: 'ground', top: 0, left: -1, right: 30 })
  if (v.h > 0) addBody(s, { id: 'platform', name: '平台', kind: 'static', role: 'ground', shape: { type: 'box', width: 1, height: v.h }, position: { x: -0.5, y: v.h / 2 } })
  const a = v.alpha * DEG
  addBody(s, { id: 'ball', name: '小球', kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: v.h > 0 ? r + 1e-3 : 0, y: v.h + r }, velocity: { x: v.v0 * cos(a), y: v.v0 * sin(a) }, mass: v.m })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.duration = 2.2
  s.settings.energyZeroY = r
  s.view = { center: { x: 4, y: 2 }, pixelsPerMeter: 60 }
  s.watch = ['ball.x', 'ball.y', 'ball.vx', 'ball.vy']
  return s
}

function pendulum(v: Record<string, number>): Scene {
  const s = emptyScene('单摆')
  s.description = '长 L 的轻绳一端固定，另一端系小球，从偏角 θ₀ 处静止释放。'
  const th = v.theta0 * DEG, L = v.L, r = 0.03
  const pivot = { x: 0, y: 2 }
  addBody(s, { id: 'bob', name: '摆球', kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: pivot.x + L * sin(th), y: pivot.y - L * cos(th) }, mass: v.m })
  addConnector<RopeDef>(s, { id: 'rope', name: '摆线', type: 'rope', a: anchor(null, pivot), b: anchor(s.bodies[0]), pulleys: [], length: null })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.duration = 6
  s.settings.energyZeroY = pivot.y - L
  s.view = { center: { x: 0, y: 1.4 }, pixelsPerMeter: 180 }
  s.watch = ['bob.angle@pivot', 'bob.v', 'rope.T', 'system.e']
  s.extra = { pivot }
  return s
}

function springOscillator(v: Record<string, number>): Scene {
  const s = emptyScene('弹簧振子')
  s.description = '光滑水平面上，劲度系数 k 的轻弹簧一端固定，另一端连质量 m 的物块，拉开 A 后释放。'
  addGround(s, { id: 'ground', top: 0, left: -0.4, right: 3 })
  const L0 = 0.8, w = 0.2
  addBody(s, { id: 'wall', name: '墙', kind: 'static', role: 'wall', shape: { type: 'box', width: 0.1, height: 0.6 }, position: { x: -0.05, y: 0.3 } })
  addBody(s, { id: 'block', name: '振子', role: 'block', shape: { type: 'box', width: w, height: w }, position: { x: L0 + v.A + w / 2, y: w / 2 }, mass: v.m })
  addConnector<SpringDef>(s, { id: 'spring', name: '弹簧', type: 'spring', a: anchor(s.bodies[2], { x: -w / 2, y: 0 }), b: anchor(null, { x: 0, y: w / 2 }), stiffness: v.k, restLength: L0, damping: 0 })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.duration = 3
  s.view = { center: { x: 1, y: 0.4 }, pixelsPerMeter: 220 }
  s.watch = ['block.x', 'block.vx', 'block.ax', 'spring.F', 'system.e']
  return s
}

function hingedRod(v: Record<string, number>): Scene {
  const s = emptyScene('定轴转动的细杆')
  s.description = '长 L、质量 m 的匀质细杆一端用光滑铰链固定，从水平位置静止释放。'
  const L = v.L, h = 0.04, pivot = { x: 0, y: 1.5 }
  const rod = addBody(s, { id: 'rod', name: '细杆', role: 'rod', shape: { type: 'box', width: L, height: h }, position: { x: pivot.x + L / 2, y: pivot.y }, mass: v.m, inertia: v.m * L * L / 12 })
  addConnector<HingeDef>(s, { id: 'hinge', name: '铰链', type: 'hinge', a: anchor(rod, { x: -L / 2, y: 0 }), b: anchor(null, pivot) })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.duration = 2
  s.settings.energyZeroY = pivot.y
  s.view = { center: { x: 0, y: 1 }, pixelsPerMeter: 160 }
  s.watch = ['rod.angle', 'rod.omega', 'hinge.F', 'system.e']
  s.extra = { pivot, idealization: '细杆：转动惯量按 mL²/12 设定（忽略杆的厚度）' }
  return s
}

function rollingCylinder(v: Record<string, number>): Scene {
  const s = emptyScene('斜面上的圆柱')
  s.description = '匀质圆柱从静止沿倾角 θ 的斜面滚下；μ 足够大时纯滚动，否则边滚边滑。'
  const th = v.theta * DEG, base = 6, r = v.r
  addIncline(s, { id: 'incline', angle: th, base, material: { muS: v.mu, muK: v.mu } })
  const H = base * sin(th) / cos(th)
  const sAlong = 0.3
  const px = cos(th) * sAlong, py = H - sin(th) * sAlong
  addBody(s, { id: 'cyl', name: '圆柱', role: 'wheel', shape: { type: 'circle', radius: r }, position: { x: px + sin(th) * r, y: py + cos(th) * r }, mass: v.m, material: { muS: v.mu, muK: v.mu } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.duration = 1.2
  s.view = { center: { x: 2.4, y: 2 }, pixelsPerMeter: 110 }
  s.watch = ['cyl.v', 'cyl.omega', 'contact.cyl|incline.f', 'contact.cyl|incline.vt']
  return s
}

function ballHitsRod(v: Record<string, number>): Scene {
  const s = emptyScene('小球碰撞悬挂细杆')
  s.description = '竖直悬挂的匀质细杆（上端铰接），小球以 v₀ 水平撞击杆上距转轴 d 处（不计重力）。'
  const L = v.L, h = 0.04, pivot = { x: 0, y: 1.2 }, r = 0.04
  const rod = addBody(s, { id: 'rod', name: '细杆', role: 'rod', shape: { type: 'box', width: h, height: L }, position: { x: pivot.x, y: pivot.y - L / 2 }, mass: v.M, inertia: v.M * L * L / 12 })
  addConnector<HingeDef>(s, { id: 'hinge', name: '铰链', type: 'hinge', a: anchor(rod, { x: 0, y: L / 2 }), b: anchor(null, pivot) })
  addBody(s, { id: 'ball', name: '小球', kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: -0.5, y: pivot.y - v.d }, velocity: { x: v.v0, y: 0 }, mass: v.m })
  s.contactPairs.push({ a: 'ball', b: 'rod', muS: 0, muK: 0, restitution: v.e })
  s.settings.gravity = { x: 0, y: 0 }
  s.settings.duration = 0.6
  s.view = { center: { x: 0, y: 0.7 }, pixelsPerMeter: 200 }
  s.watch = ['ball.vx', 'rod.omega', 'system.Lz@pivot', 'system.ek']
  s.extra = { pivot }
  return s
}

function tablePulley(v: Record<string, number>): Scene {
  const s = emptyScene('连接体（定滑轮）')
  s.description = '水平桌面上的物块 m₁ 通过跨过定滑轮的轻绳与悬挂物块 m₂ 相连，由静止释放。'
  const top = 1.2, edge = 2
  addBody(s, { id: 'table', name: '桌面', kind: 'static', role: 'ground', shape: { type: 'box', width: edge + 1, height: 0.2 }, position: { x: (edge - 1) / 2, y: top - 0.1 }, material: { muS: v.mu, muK: v.mu } })
  const bw = 0.2, pr = 0.04
  const b1 = addBody(s, { id: 'm1', name: '物块1', role: 'block', shape: { type: 'box', width: bw, height: bw }, position: { x: 0.4, y: top + bw / 2 }, mass: v.m1, material: { muS: v.mu, muK: v.mu } })
  const pc = { x: edge + 0.08, y: top + bw / 2 - pr }
  const pul = addPulley(s, { id: 'pulley', name: '定滑轮', position: pc, radius: pr })
  const hw = 0.14
  const b2 = addBody(s, { id: 'm2', name: '物块2', role: 'block', shape: { type: 'box', width: hw, height: hw }, position: { x: pc.x + pr, y: top - 0.5 }, mass: v.m2, color: '#f59e0b' })
  addConnector<RopeDef>(s, { id: 'rope', name: '轻绳', type: 'rope', a: anchor(b1), b: anchor(b2), pulleys: [{ pulley: pul.id, wrap: 'cw' }], length: null })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.duration = 1
  s.view = { center: { x: 1.4, y: 0.9 }, pixelsPerMeter: 170 }
  s.watch = ['m1.vx', 'm2.vy', 'rope.T', 'contact.m1|table.f']
  return s
}

function atwood(v: Record<string, number>): Scene {
  const s = emptyScene('阿特伍德机')
  s.description = '质量 m₁、m₂ 的两物块用轻绳跨过光滑定滑轮悬挂，由静止释放。'
  const pr = 0.12, pc = { x: 0, y: 2 }
  const pul = addPulley(s, { id: 'pulley', name: '定滑轮', position: pc, radius: pr })
  const w = 0.16
  const b1 = addBody(s, { id: 'm1', name: '物块1', role: 'block', shape: { type: 'box', width: w, height: w }, position: { x: pc.x - pr, y: 1.1 }, mass: v.m1 })
  const b2 = addBody(s, { id: 'm2', name: '物块2', role: 'block', shape: { type: 'box', width: w, height: w }, position: { x: pc.x + pr, y: 1.1 }, mass: v.m2, color: '#f59e0b' })
  addConnector<RopeDef>(s, { id: 'rope', name: '轻绳', type: 'rope', a: anchor(b1), b: anchor(b2), pulleys: [{ pulley: pul.id, wrap: 'cw' }], length: null })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.duration = 1
  s.view = { center: { x: 0, y: 1.3 }, pixelsPerMeter: 220 }
  s.watch = ['m1.vy', 'm2.vy', 'rope.T']
  return s
}

// ---- 26.49 models ----
/** Ball on a light rope (or rod) in a vertical circle, started at the lowest point with speed v₀. */
function verticalCircle(v: Record<string, number>, rod: boolean): Scene {
  const s = emptyScene(rod ? '竖直面圆周运动（杆）' : '竖直面圆周运动（绳）')
  s.description = rod
    ? '轻杆一端固定在光滑转轴上，另一端连小球；小球在最低点获得水平速度 v₀。杆既能拉也能推，最高点速度为 √(gL) 时杆对球的作用力为零。'
    : '轻绳一端固定，另一端系小球；小球在最低点获得水平速度 v₀。v₀ ≥ √(5gL) 时能通过最高点，否则绳在上半圆某处松弛，小球做斜抛运动。'
  const L = v.L, r = 0.03
  const pivot = { x: 0, y: 1.2 }
  const ball = addBody(s, { id: 'ball', name: '小球', kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: pivot.x, y: pivot.y - L }, velocity: { x: v.v0, y: 0 }, mass: v.m })
  if (rod) addConnector<RodDef>(s, { id: 'rod', name: '轻杆', type: 'rod', a: anchor(null, pivot), b: anchor(ball), length: null })
  else addConnector<RopeDef>(s, { id: 'rope', name: '轻绳', type: 'rope', a: anchor(null, pivot), b: anchor(ball), pulleys: [], length: null })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.duration = 2
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
  const s = emptyScene('动滑轮')
  s.description = '轻绳一端固定在天花板上，绕过挂着物块 m₂ 的动滑轮，再跨过两个定滑轮挂物块 m₁；由静止释放。滑轮与绳的质量、摩擦不计。'
  const r = 0.05, top = 2
  addBody(s, { id: 'ceiling', name: '天花板', kind: 'static', role: 'wall', shape: { type: 'box', width: 1.4, height: 0.08 }, position: { x: 0.3, y: top + 0.04 } })
  addGround(s, { id: 'ground', top: 0, left: -1, right: 1.6 })
  const load = addBody(s, { id: 'm2', name: '物块2', role: 'block', shape: { type: 'box', width: 0.16, height: 0.16 }, position: { x: 0, y: 0.8 }, mass: v.m2, fixedRotation: true, color: '#f59e0b' })
  const hang = addBody(s, { id: 'm1', name: '物块1', role: 'block', shape: { type: 'box', width: 0.12, height: 0.12 }, position: { x: 0.6 + r, y: 1.1 }, mass: v.m1 })
  addPulley(s, { id: 'pm', name: '动滑轮', position: { x: 0, y: 0.14 }, radius: r, body: load.id })
  addPulley(s, { id: 'p1', name: '定滑轮1', position: { x: 2 * r, y: 1.8 }, radius: r })
  addPulley(s, { id: 'p2', name: '定滑轮2', position: { x: 0.6, y: 1.8 }, radius: r })
  addConnector<RopeDef>(s, { id: 'rope', name: '轻绳', type: 'rope', a: anchor(null, { x: -r, y: top }), b: anchor(hang), pulleys: [{ pulley: 'pm', wrap: 'ccw' }, { pulley: 'p1', wrap: 'cw' }, { pulley: 'p2', wrap: 'cw' }], length: null })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.duration = 0.8
  s.view = { center: { x: 0.3, y: 1.1 }, pixelsPerMeter: 260 }
  s.watch = ['m1.vy', 'm2.vy', 'm1.ay', 'm2.ay', 'rope.T', 'system.e']
  return s
}

/** Wedge of mass M on a smooth floor, block m sliding down its smooth slope (both translate only). */
function movableWedge(v: Record<string, number>): Scene {
  const s = emptyScene('可动斜面')
  s.description = '倾角 θ、质量 M 的斜面放在光滑水平地面上，质量 m 的物块从斜面上由静止沿光滑斜面下滑；斜面向相反方向运动。'
  const th = v.theta * DEG, base = 1.2, h = base * tan(th)
  addGround(s, { id: 'ground', top: 0, left: -3, right: 3 })
  addBody(s, { id: 'wedge', name: '斜面', role: 'incline', shape: { type: 'polygon', points: [{ x: -base / 3, y: -h / 3 }, { x: 2 * base / 3, y: -h / 3 }, { x: -base / 3, y: 2 * h / 3 }] }, position: { x: 0, y: h / 3 }, mass: v.M, fixedRotation: true, color: '#64748b' })
  const c = cos(th), sn = sin(th), bw = 0.12, bh = 0.08, along = 0.15
  const topX = -base / 3, topY = h
  const px = topX + c * along, py = topY - sn * along
  addBody(s, { id: 'block', name: '物块', role: 'block', shape: { type: 'box', width: bw, height: bh }, position: { x: px + c * bw / 2 + sn * bh / 2, y: py - sn * bw / 2 + c * bh / 2 }, angle: -th, mass: v.m, fixedRotation: true })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.duration = 0.6
  s.view = { center: { x: 0.2, y: 0.4 }, pixelsPerMeter: 220 }
  s.watch = ['block.vx', 'wedge.vx', 'wedge.ax', 'contact.block|wedge.N', 'system.px']
  return s
}

/** Two blocks joined by a light spring on a smooth floor; block 1 starts with v₀ towards block 2. */
function springBlocks(v: Record<string, number>): Scene {
  const s = emptyScene('弹簧连接体')
  s.description = '光滑水平面上两物块由轻弹簧相连，弹簧处于原长；物块 1 获得指向物块 2 的初速度 v₀。弹簧压缩最大时两物块共速。'
  addGround(s, { id: 'ground', top: 0, left: -2, right: 6 })
  const w = 0.2, L0 = 0.5
  const a = addBody(s, { id: 'b1', name: '物块1', role: 'block', shape: { type: 'box', width: w, height: w }, position: { x: 0, y: w / 2 }, velocity: { x: v.v0, y: 0 }, mass: v.m1 })
  const b = addBody(s, { id: 'b2', name: '物块2', role: 'block', shape: { type: 'box', width: w, height: w }, position: { x: w + L0, y: w / 2 }, mass: v.m2, color: '#f59e0b' })
  addConnector<SpringDef>(s, { id: 'spring', name: '弹簧', type: 'spring', a: anchor(a, { x: w / 2, y: 0 }), b: anchor(b, { x: -w / 2, y: 0 }), stiffness: v.k, restLength: L0, damping: 0 })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.duration = 2
  s.view = { center: { x: 1.2, y: 0.3 }, pixelsPerMeter: 160 }
  s.watch = ['b1.vx', 'b2.vx', 'spring.x', 'system.px', 'system.es']
  return s
}

/** Uniform disc (a cylinder in 2D) put on rough ground with v₀ and no spin: it slips, then rolls. */
function rollingSlip(v: Record<string, number>): Scene {
  const s = emptyScene('滚动带滑动')
  s.description = '匀质圆柱（二维中为圆盘，I = ½mr²）以速度 v₀、角速度 0 放到粗糙水平地面上：先边滚边滑，经 t = v₀/(3μg) 后以 2v₀/3 纯滚动。'
  addGround(s, { id: 'ground', top: 0, left: -1, right: 12, material: { muS: v.mu, muK: v.mu } })
  addBody(s, { id: 'disc', name: '圆柱', role: 'wheel', shape: { type: 'circle', radius: v.r }, position: { x: 0, y: v.r }, velocity: { x: v.v0, y: 0 }, angularVelocity: 0, mass: v.m, material: { muS: v.mu, muK: v.mu } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.duration = 1.5
  s.view = { center: { x: 2.5, y: 0.6 }, pixelsPerMeter: 110 }
  s.watch = ['disc.vx', 'disc.omega', 'contact.disc|ground.f', 'contact.disc|ground.vt', 'pair.disc|ground.heat']
  return s
}

/** Shortest decimal text of a number for expressions. */
const num = (x: number) => String(x)

/** Block on a smooth floor pushed by F = F₀·sin(ωt). */
function variableForce(v: Record<string, number>): Scene {
  const s = emptyScene('变力作用')
  s.description = '光滑水平面上的物块受水平变力 F = F₀ sin(ωt) 作用，由静止开始运动；速度、位移与积分解析式对照。'
  addGround(s, { id: 'ground', top: 0, left: -2, right: 40 })
  const b = addBody(s, { id: 'block', name: '物块', role: 'block', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0, y: 0.1 }, mass: v.m })
  addConnector<ForceDef>(s, { id: 'F', name: '变力 F', type: 'force', a: anchor(b), force: { x: 0, y: 0 }, expr: { x: `${num(v.F0)}*sin(${num(v.omega)}*t)`, y: '0' } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.duration = 4
  s.view = { center: { x: 1.5, y: 0.5 }, pixelsPerMeter: 120 }
  s.watch = ['block.x', 'block.vx', 'block.ax', 'ledger.appliedWork']
  return s
}

/** All templates, in gallery order. */
export const TEMPLATES: TemplateInfo[] = [
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
  { id: 'variable-force', group: '变力', name: '变力 F = F₀ sin ωt', description: '光滑水平面上受正弦变力的物块', params: [p('F0', '力的幅值 F₀', 'N', 5), p('omega', '角频率 ω', 'rad/s', 3, 0.01), p('m', '质量 m', 'kg', 1, 0.001), gp()], build: variableForce }
]

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
