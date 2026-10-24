/**
 * Classic model templates (the acceptance scenes). Each template builds a complete scene from a few
 * textbook parameters; the scene stays fully editable afterwards. Values follow docs/DEV_MANUAL_26_48.md §7.
 */
import type { Scene } from '../core/scene/types'
import { DEG, cos, sin } from '../core/math/dmath'
import { addBody, addConnector, addGround, addIncline, addPulley, anchor, emptyScene, onIncline } from '../core/scene/build'
import type { RopeDef, SpringDef, HingeDef } from '../core/scene/types'

export interface TemplateParam { key: string; label: string; unit: string; value: number; min?: number; max?: number; step?: number }
export interface TemplateInfo {
  id: string
  group: string
  name: string
  description: string
  params: TemplateParam[]
  build: (p: Record<string, number>) => Scene
}

const p = (key: string, label: string, unit: string, value: number, min?: number, max?: number, step?: number): TemplateParam => ({ key, label, unit, value, min, max, step })

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
  s.watch = ['block.vx', 'contact.block|belt.f', 'pair.block|belt.slide', 'ledger.frictionHeat', 'ledger.beltWork']
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
  s.watch = ['block.v', 'contact.block|belt.f', 'pair.block|belt.slide', 'ledger.frictionHeat']
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

export const TEMPLATES: TemplateInfo[] = [
  { id: 'incline', group: '斜面与摩擦', name: '斜面滑块', description: '物块沿斜面下滑；μ 可为 0', params: [p('theta', '倾角 θ', '°', 30, 1, 80), p('m', '质量 m', 'kg', 2, 0.01), p('mu', '动摩擦因数 μ', '', 0.2, 0, 2, 0.01), p('g', '重力加速度 g', 'm/s²', 9.8, 0)], build: inclineBlock },
  { id: 'board-block', group: '斜面与摩擦', name: '板块模型', description: '物块滑上静止长木板，木板与地面有摩擦', params: [p('M', '木板质量 M', 'kg', 2, 0.01), p('m', '物块质量 m', 'kg', 1, 0.01), p('v0', '物块初速度 v₀', 'm/s', 4), p('mu1', '物块—木板 μ₁', '', 0.4, 0, 2, 0.01), p('mu2', '木板—地面 μ₂', '', 0.1, 0, 2, 0.01), p('g', '重力加速度 g', 'm/s²', 9.8, 0)], build: boardBlock },
  { id: 'conveyor', group: '传送带', name: '水平传送带', description: '物块轻放在运行的传送带上', params: [p('u', '带速 u', 'm/s', 2), p('m', '质量 m', 'kg', 1, 0.01), p('mu', '动摩擦因数 μ', '', 0.5, 0, 2, 0.01), p('g', '重力加速度 g', 'm/s²', 9.8, 0)], build: conveyorFlat },
  { id: 'conveyor-incline', group: '传送带', name: '倾斜传送带', description: '传送带沿斜面向下运行，物块轻放在顶端', params: [p('theta', '倾角 θ', '°', 37, 1, 80), p('u', '带速 u（向下）', 'm/s', 2), p('m', '质量 m', 'kg', 1, 0.01), p('mu', '动摩擦因数 μ', '', 0.5, 0, 2, 0.01), p('g', '重力加速度 g', 'm/s²', 9.8, 0)], build: conveyorIncline },
  { id: 'collision-1d', group: '碰撞', name: '一维碰撞', description: '弹性 e=1、非弹性 0<e<1、完全非弹性 e=0', params: [p('m1', '质量 m₁', 'kg', 1, 0.01), p('m2', '质量 m₂', 'kg', 2, 0.01), p('v0', '初速度 v₀', 'm/s', 2), p('e', '恢复系数 e', '', 1, 0, 1, 0.05)], build: collision1D },
  { id: 'collision-2d', group: '碰撞', name: '二维斜碰', description: '光滑小球的斜碰', params: [p('m1', '质量 m₁', 'kg', 1, 0.01), p('m2', '质量 m₂', 'kg', 1, 0.01), p('v0', '初速度 v₀', 'm/s', 2), p('b', '瞄准偏移 b', 'm', 0.1, -0.19, 0.19, 0.01), p('e', '恢复系数 e', '', 1, 0, 1, 0.05)], build: collision2D },
  { id: 'projectile', group: '抛体', name: '抛体运动', description: '平抛（α=0）与斜抛', params: [p('v0', '初速度 v₀', 'm/s', 10), p('alpha', '仰角 α', '°', 45, -89, 89), p('h', '抛出高度 h', 'm', 0, 0), p('m', '质量 m', 'kg', 0.1, 0.001), p('g', '重力加速度 g', 'm/s²', 9.8, 0)], build: projectile },
  { id: 'pendulum', group: '振动', name: '单摆', description: '小角度近似与大角度精确周期对照', params: [p('L', '摆长 L', 'm', 1, 0.05), p('theta0', '初始偏角 θ₀', '°', 5, 0.1, 170), p('m', '摆球质量 m', 'kg', 0.5, 0.001), p('g', '重力加速度 g', 'm/s²', 9.8, 0)], build: pendulum },
  { id: 'spring', group: '振动', name: '弹簧振子', description: '光滑水平面上的弹簧振子', params: [p('k', '劲度系数 k', 'N/m', 50, 0.01), p('m', '质量 m', 'kg', 0.5, 0.001), p('A', '振幅 A', 'm', 0.1, 0.001, 0.6), p('g', '重力加速度 g', 'm/s²', 9.8, 0)], build: springOscillator },
  { id: 'hinged-rod', group: '刚体转动', name: '定轴转动细杆', description: '从水平位置释放的铰接细杆', params: [p('L', '杆长 L', 'm', 1, 0.05), p('m', '质量 m', 'kg', 1, 0.001), p('g', '重力加速度 g', 'm/s²', 9.8, 0)], build: hingedRod },
  { id: 'rolling', group: '刚体转动', name: '斜面上的圆柱', description: '纯滚动与边滚边滑', params: [p('theta', '倾角 θ', '°', 30, 1, 80), p('r', '半径 r', 'm', 0.15, 0.01), p('m', '质量 m', 'kg', 1, 0.001), p('mu', '摩擦因数 μ', '', 0.3, 0, 2, 0.01), p('g', '重力加速度 g', 'm/s²', 9.8, 0)], build: rollingCylinder },
  { id: 'ball-rod', group: '刚体转动', name: '小球碰撞细杆', description: '角动量守恒（对转轴）', params: [p('M', '杆质量 M', 'kg', 1, 0.001), p('L', '杆长 L', 'm', 1, 0.1), p('m', '小球质量 m', 'kg', 0.2, 0.001), p('v0', '小球速度 v₀', 'm/s', 3), p('d', '撞击点到转轴 d', 'm', 0.8, 0.05), p('e', '恢复系数 e', '', 1, 0, 1, 0.05)], build: ballHitsRod },
  { id: 'atwood', group: '连接体', name: '阿特伍德机', description: '两物块跨过定滑轮悬挂', params: [p('m1', '质量 m₁', 'kg', 1, 0.01), p('m2', '质量 m₂', 'kg', 1.5, 0.01), p('g', '重力加速度 g', 'm/s²', 9.8, 0)], build: atwood },
  { id: 'table-pulley', group: '连接体', name: '桌面—滑轮连接体', description: '整体法与隔离法对照', params: [p('m1', '桌上物块 m₁', 'kg', 2, 0.01), p('m2', '悬挂物块 m₂', 'kg', 1, 0.01), p('mu', '桌面 μ', '', 0.2, 0, 2, 0.01), p('g', '重力加速度 g', 'm/s²', 9.8, 0)], build: tablePulley }
]

export function templateById(id: string): TemplateInfo | undefined { return TEMPLATES.find(t => t.id === id) }

export function buildTemplate(id: string, overrides: Record<string, number> = {}): Scene {
  const t = templateById(id)
  if (!t) throw new Error(`unknown template ${id}`)
  const values: Record<string, number> = {}
  for (const prm of t.params) values[prm.key] = overrides[prm.key] ?? prm.value
  const scene = t.build(values)
  scene.extra = { ...(scene.extra ?? {}), template: { id, values } }
  return scene
}
