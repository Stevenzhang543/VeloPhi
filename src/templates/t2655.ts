/**
 * Templates of 26.55: bounded field regions (mass spectrometer, cyclotron, bounded and circular magnetic fields,
 * the oscilloscope tube, combined fields), rail loops (a rod pulled by a force, coasting, falling between vertical
 * rails), liquids (floating, sinking, rising, weighing in water, three densities, a loaded boat, a ball dropped into
 * water), and more classic mechanics and electricity (double and physical pendulum, coupled oscillators, binary
 * stars, Kepler's third law, a bouncing ball, three-ball collisions, two pendulums colliding, a block pushed up a
 * slope, an incline with a pulley, pursuit, a weight on two ropes, a vertical spring, a charged pendulum, a charged
 * drop). Texts are Chinese source keys read through `trDeep` by the gallery (templates/index.ts).
 */
import { tl } from '../i18n'
import type { Scene, ForceDef, HingeDef, RodDef, RopeDef, SpringDef, RegionDef, RailLoopDef } from '../core/scene/types'
import { DEG, cos, sin, tan } from '../core/math/dmath'
import { addBody, addConnector, addGround, addIncline, addPulley, anchor, defaultGravity, emptyScene, onIncline } from '../core/scene/build'
import type { TemplateInfo, TemplateParam } from './index'

const p = (key: string, label: string, unit: string, value: number, min?: number, max?: number, step?: number): TemplateParam => ({ key, label, unit, value, min, max, step })
const gp = (): TemplateParam => p('g', '重力加速度 g', 'm/s²', defaultGravity(), 0)
const MC = 1e-3, G_ = 1e-3

/** A thin static plate from (x0, y0) to (x1, y1) (horizontal or vertical). */
function plate(s: Scene, id: string, name: string, x0: number, y0: number, x1: number, y1: number, mu = 0) {
  const w = Math.max(Math.abs(x1 - x0), 0.02), h = Math.max(Math.abs(y1 - y0), 0.02)
  addBody(s, { id, name, kind: 'static', role: 'wall', shape: { type: 'box', width: w, height: h }, position: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, material: { muS: mu, muK: mu, restitution: 0 } })
}
const rect = (id: string, name: string, x0: number, y0: number, x1: number, y1: number, f: Partial<RegionDef>): RegionDef => ({ id, name, kind: 'field', shape: 'rect', x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: Math.abs(x1 - x0), h: Math.abs(y1 - y0), ...f })
const regions = (s: Scene, list: RegionDef[]) => { s.settings.regions = list.map(r => ({ ...r, name: tl(r.name) })) }
const num = (v: number) => Number(v.toPrecision(15))

// ---- Bounded field regions (D90) ----
function massSpectrometer(v: Record<string, number>): Scene {
  const s = emptyScene(tl('质谱仪'))
  s.description = tl('两种带正电的粒子（电荷量相同、质量不同）从静止经加速电场（电压 U）加速，垂直于边界进入匀强磁场 B，各转半周后打在照相底片上。半径 r = √(2mU/q)/B，落点到入口的距离 2r ∝ √m，由此可以分辨质量。不计重力。')
  const E = v.U / 1
  const r1 = Math.sqrt(2 * v.m1 * G_ * v.U / (v.q * MC)) / v.B, r2 = Math.sqrt(2 * v.m2 * G_ * v.U / (v.q * MC)) / v.B
  const rmax = Math.max(r1, r2)
  regions(s, [
    rect('acc', '加速电场', -1.2, -0.12, 0, 0.12, { E: { x: E, y: 0 }, B: 0 }),
    rect('mag', '偏转磁场', 0, -2 * rmax - 0.4, Math.max(1.2 * rmax, 0.5) + 0.2, 0.4, { E: { x: 0, y: 0 }, B: v.B })
  ])
  plate(s, 'film', tl('照相底片'), -0.08, -2 * rmax - 0.3, -0.08, -0.25)
  addBody(s, { id: 'p1', name: tl('粒子1'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.015 }, position: { x: -1, y: 0.04 }, mass: v.m1 * G_, material: { restitution: 0 }, color: '#ef4444', charge: v.q * MC })
  addBody(s, { id: 'p2', name: tl('粒子2'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.015 }, position: { x: -1, y: -0.04 }, mass: v.m2 * G_, material: { restitution: 0 }, color: '#2563eb', charge: v.q * MC })
  s.settings.gravity = { x: 0, y: 0 }
  // time to the film: acceleration 2d/v, half a turn πm/(qB), the way back to the film
  const tOf = (m: number) => { const vv = Math.sqrt(2 * v.q * MC * v.U / (m * G_)); return 2 / vv + Math.PI * m * G_ / (v.q * MC * v.B) + 0.08 / vv }
  const t1 = tOf(v.m1), t2 = tOf(v.m2)
  s.settings.stopAt = { on: 'impact', after: num(Math.abs(t2 - t1) + 0.3) }
  s.settings.legacyDuration = Math.min(60, Math.max(t1, t2) + 0.2)
  s.view = { center: { x: 0, y: -rmax + 0.1 }, pixelsPerMeter: Math.max(30, Math.min(300, 330 / (2 * rmax + 0.8))) }
  s.watch = ['p1.v', 'p2.v', 'p1.y', 'p2.y', 'ledger.fieldWork']
  return s
}

function cyclotronDees(v: Record<string, number>): Scene {
  const s = emptyScene(tl('回旋加速器'))
  s.description = tl('两个 D 形盒（这里画成矩形）中有匀强磁场 B，盒间的窄缝中有交变电场，角频率等于粒子的回旋角频率 ω = qB/m。粒子每次穿过窄缝都被加速，半径一圈比一圈大；在盒中转半周的时间 πm/(qB) 与速度无关。离开 D 形盒时的动能 Ek = q²B²R²/(2m)，与加速电压无关。不计重力。')
  const R = v.R, gap = 0.1
  const omega = v.q * MC * v.B / (v.m * G_)
  regions(s, [
    rect('d1', 'D 形盒 1', -gap / 2 - R, -R, -gap / 2, R, { B: v.B }),
    rect('d2', 'D 形盒 2', gap / 2, -R, gap / 2 + R, R, { B: v.B }),
    rect('gap', '加速缝', -gap / 2, -R, gap / 2, R, { E: { x: num(v.U / gap), y: 0 }, B: 0, omega: num(omega), phase: 0 })
  ])
  addBody(s, { id: 'p', name: tl('带电粒子'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.02 }, position: { x: 0, y: 0 }, mass: v.m * G_, color: '#ef4444', charge: v.q * MC })
  s.settings.gravity = { x: 0, y: 0 }
  // about R²qB²/(2mU)/2 turns until the radius reaches R
  const turns = (v.q * MC * v.B * v.B * R * R) / (2 * v.m * G_ * v.U) / 2
  s.settings.legacyDuration = Math.min(120, (turns + 1.5) * 2 * Math.PI / omega)
  s.view = { center: { x: 0, y: 0 }, pixelsPerMeter: Math.max(20, Math.min(300, 270 / (R + 0.2))) }
  s.watch = ['p.v', 'p.ek', 'ledger.fieldWork']
  return s
}

function boundedField(v: Record<string, number>): Scene {
  const s = emptyScene(tl('有界磁场中的偏转'))
  s.description = tl('带正电的粒子以速度 v 从左边界射入宽度为 D 的匀强磁场（垂直纸面向外），速度与边界法线成 θ 角。r = mv/(qB)：垂直射入且 D > r 时转半周从入射边界射出，入射点与出射点相距 2r，在磁场中的时间 πm/(qB)；D < r 时从另一侧穿出，偏转角 sinφ = D/r。不计重力。')
  const th = v.theta * DEG
  const r = v.m * G_ * v.v / (v.q * MC * v.B)
  regions(s, [rect('mag', '磁场区域', 0, -3 * r - 1, v.D, 3 * r + 1, { B: v.B })])
  addBody(s, { id: 'p', name: tl('带电粒子'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: Math.max(0.005, Math.min(0.03, r * 0.04)) }, position: { x: -0.4 * r - 0.1, y: 0 }, velocity: { x: v.v * cos(th), y: v.v * sin(th) }, mass: v.m * G_, color: '#ef4444', charge: v.q * MC })
  // move the start back so the particle reaches the boundary at y = 0
  const b = s.bodies[0]
  b.position = { x: b.position.x, y: b.position.x * Math.tan(th) + 0 }
  s.settings.gravity = { x: 0, y: 0 }
  s.settings.legacyDuration = Math.min(60, (0.4 * r + 0.1) / Math.max(v.v * Math.cos(th), 1e-3) + Math.PI * r / v.v + 1.5 * r / v.v)
  s.view = { center: { x: Math.min(v.D, 2 * r) / 2, y: -0.5 * r }, pixelsPerMeter: Math.max(20, Math.min(400, 280 / Math.max(2.6 * r, v.D + 0.6))) }
  s.watch = ['p.x', 'p.y', 'p.v', 'p.a']
  return s
}

function circularField(v: Record<string, number>): Scene {
  const s = emptyScene(tl('圆形磁场区域'))
  s.description = tl('带正电的粒子沿半径方向射入半径为 R 的圆形匀强磁场区域，射出时速度方向的反向延长线仍过圆心（沿半径射出）。轨迹半径 r = mv/(qB)，偏转角 φ 满足 tan(φ/2) = R/r。不计重力。')
  const r = v.m * G_ * v.v / (v.q * MC * v.B)
  s.settings.regions = [{ id: 'mag', name: tl('圆形磁场'), kind: 'field', shape: 'circle', x: 0, y: 0, r: v.R, E: { x: 0, y: 0 }, B: v.B }]
  addBody(s, { id: 'p', name: tl('带电粒子'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: Math.max(0.005, Math.min(0.03, v.R * 0.03)) }, position: { x: -v.R - 1, y: 0 }, velocity: { x: v.v, y: 0 }, mass: v.m * G_, color: '#ef4444', charge: v.q * MC })
  s.settings.gravity = { x: 0, y: 0 }
  s.settings.legacyDuration = Math.min(60, (2 * v.R + 3) / v.v + Math.PI * r / v.v)
  s.view = { center: { x: 0, y: 0 }, pixelsPerMeter: Math.max(20, Math.min(300, 200 / (v.R + 1))) }
  s.watch = ['p.x', 'p.y', 'p.vx', 'p.vy']
  return s
}

function oscilloscope(v: Record<string, number>): Scene {
  const s = emptyScene(tl('示波管：加速与偏转'))
  s.description = tl('电子枪：带电粒子从静止经电压 U₁ 加速，获得 qU₁ = ½mv₀²；再垂直射入两板间的偏转电场（电压 U₂、板间距 d、板长 L），沿电场方向做匀加速运动，离开时的侧移 y = U₂L²/(4dU₁)，与粒子的电荷量和质量无关。最后打在荧光屏上。不计重力。')
  const gap0 = 0.3, L = v.L, d = v.d, screen = gap0 + L + 1
  regions(s, [
    rect('acc', '加速电场', -1.2, -0.15, 0, 0.15, { E: { x: num(v.U1 / 1), y: 0 }, B: 0 }),
    rect('defl', '偏转电场', gap0, -d / 2, gap0 + L, d / 2, { E: { x: 0, y: num(-v.U2 / d) }, B: 0 })
  ])
  plate(s, 'top', tl('上极板'), gap0, d / 2 + 0.01, gap0 + L, d / 2 + 0.01)
  plate(s, 'bottom', tl('下极板'), gap0, -d / 2 - 0.01, gap0 + L, -d / 2 - 0.01)
  plate(s, 'screen', tl('荧光屏'), screen, -1.2, screen, 1.2)
  addBody(s, { id: 'p', name: tl('带电粒子'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.015 }, position: { x: -1, y: 0 }, mass: v.m * G_, material: { restitution: 0 }, color: '#ef4444', charge: v.q * MC })
  s.settings.gravity = { x: 0, y: 0 }
  s.settings.stopAt = { on: 'impact', after: 0.2 }
  const v0 = Math.sqrt(2 * v.q * MC * v.U1 / (v.m * G_))
  s.settings.legacyDuration = Math.min(60, 2 / v0 + (screen) / v0 + 0.1)
  s.view = { center: { x: (screen - 1.2) / 2, y: 0 }, pixelsPerMeter: Math.max(40, Math.min(300, 600 / (screen + 1.4))) }
  s.watch = ['p.vx', 'p.vy', 'p.y', 'ledger.fieldWork']
  return s
}

function fieldCombo(v: Record<string, number>): Scene {
  const s = emptyScene(tl('电场与磁场的组合'))
  s.description = tl('带正电的粒子以 v₀ 垂直于电场射入宽 L 的匀强电场（向下），做类平抛运动；离开电场后进入右侧的匀强磁场（垂直纸面向里），在磁场中做匀速圆周运动，半径 r = mv/(qB)，v 是离开电场时的速率。高考常见的“组合场”问题。不计重力。')
  const L = v.L
  regions(s, [
    rect('ef', '电场区', 0, -2.5, L, 1, { E: { x: 0, y: -v.E }, B: 0 }),
    rect('bf', '磁场区', L, -6, L + 4, 3, { B: -v.B })
  ])
  addBody(s, { id: 'p', name: tl('带电粒子'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.02 }, position: { x: -0.3, y: 0 }, velocity: { x: v.v0, y: 0 }, mass: v.m * G_, color: '#ef4444', charge: v.q * MC })
  s.settings.gravity = { x: 0, y: 0 }
  s.settings.legacyDuration = 8
  s.view = { center: { x: L + 0.5, y: -1.2 }, pixelsPerMeter: 70 }
  s.watch = ['p.v', 'p.x', 'p.y', 'ledger.fieldWork']
  return s
}

// ---- Rail loops (D91) ----
function railRod(s: Scene, v: Record<string, number>, angle: number, rod: { w: number; h: number; x: number; y: number; vx?: number; vy?: number }) {
  addBody(s, { id: 'rod', name: tl('导体棒'), role: 'rod', shape: { type: 'box', width: rod.w, height: rod.h }, position: { x: rod.x, y: rod.y }, velocity: { x: rod.vx ?? 0, y: rod.vy ?? 0 }, mass: v.m, fixedRotation: true, color: '#b45309' })
  const loop: RailLoopDef = { id: 'loop', name: tl('导轨回路'), body: 'rod', angle, L: v.L, R: v.R, B: v.B }
  s.settings.railLoops = [loop]
}

function railForce(v: Record<string, number>): Scene {
  const s = emptyScene(tl('导体棒在恒力作用下切割磁感线'))
  s.description = tl('光滑水平导轨（俯视图）间距 L，左端接电阻 R，处在竖直方向的匀强磁场 B 中。质量 m 的导体棒在水平恒力 F 作用下由静止开始运动：ε = BLv，I = BLv/R，安培力 F安 = B²L²v/R 阻碍运动；加速度逐渐减小，最终匀速，收尾速度 v = FR/(B²L²)。外力做的功 = 动能 + 焦耳热。')
  railRod(s, v, 0, { w: 0.06, h: v.L, x: 0, y: 0 })
  addConnector<ForceDef>(s, { id: 'pull', name: tl('拉力 F'), type: 'force', a: anchor(s.bodies[0]), force: { x: v.F, y: 0 } })
  s.settings.gravity = { x: 0, y: 0 }
  const k = v.B * v.B * v.L * v.L / v.R
  s.settings.legacyDuration = Math.min(60, 10 * v.m / Math.max(k, 1e-6))
  const vt = v.F / Math.max(k, 1e-9)
  s.view = { center: { x: Math.min(40, vt * s.settings.legacyDuration * 0.45), y: 0 }, pixelsPerMeter: Math.max(15, Math.min(200, 700 / Math.max(vt * s.settings.legacyDuration, 1))) }
  s.watch = ['rod.vx', 'loop.emf', 'loop.I', 'loop.F', 'ledger.jouleHeat']
  return s
}

function railCoast(v: Record<string, number>): Scene {
  const s = emptyScene(tl('导体棒以初速度滑行'))
  s.description = tl('光滑水平导轨（俯视图）上的导体棒以初速度 v₀ 开始滑行，不受其他外力。安培力使它减速，v = v₀e^(−t/τ)，τ = mR/(B²L²)；最终停下，滑行的总距离 x = mv₀R/(B²L²)，动能全部转化为焦耳热。')
  railRod(s, v, 0, { w: 0.06, h: v.L, x: 0, y: 0, vx: v.v0 })
  s.settings.gravity = { x: 0, y: 0 }
  const k = v.B * v.B * v.L * v.L / v.R
  s.settings.legacyDuration = Math.min(60, 6 * v.m / Math.max(k, 1e-6))
  const x = v.m * v.v0 / Math.max(k, 1e-9)
  s.view = { center: { x: Math.min(40, x / 2), y: 0 }, pixelsPerMeter: Math.max(15, Math.min(200, 600 / Math.max(x + 0.5, 1))) }
  s.watch = ['rod.vx', 'rod.x', 'loop.I', 'ledger.jouleHeat']
  return s
}

function railFall(v: Record<string, number>): Scene {
  const s = emptyScene(tl('导体棒沿竖直导轨下落'))
  s.description = tl('竖直放置的光滑导轨间距 L，上端接电阻 R，处在垂直于导轨平面的匀强磁场 B 中。质量 m 的导体棒由静止释放，下落中安培力向上且随速度增大，最终匀速下落，收尾速度 v = mgR/(B²L²)；此后重力势能的减少全部转化为焦耳热。')
  railRod(s, v, -Math.PI / 2, { w: v.L, h: 0.05, x: 0, y: 0 })
  s.settings.gravity = { x: 0, y: -v.g }
  const k = v.B * v.B * v.L * v.L / v.R
  s.settings.legacyDuration = Math.min(60, 10 * v.m / Math.max(k, 1e-6))
  const fall = (v.m * v.g / Math.max(k, 1e-9)) * s.settings.legacyDuration
  s.view = { center: { x: 0, y: -Math.min(40, fall / 2) }, pixelsPerMeter: Math.max(10, Math.min(200, 600 / Math.max(fall + 1, 1))) }
  s.watch = ['rod.vy', 'loop.emf', 'loop.I', 'loop.F', 'ledger.jouleHeat']
  return s
}

// ---- Liquids (D92) ----
/** A tank: the liquid surface at y = 0, its floor at y = −depth, as wide as w. */
function tank(s: Scene, v: Record<string, number>, depth: number, w: number, drag = 0) {
  s.settings.regions = [{ id: 'water', name: tl('水'), kind: 'liquid', shape: 'rect', x: 0, y: -depth / 2, w, h: depth, density: v.rho, depth: v.d, dragLinear: drag, dragQuadratic: 0 }]
  addGround(s, { id: 'floor', name: tl('容器底'), top: -depth, left: -w / 2 - 0.1, right: w / 2 + 0.1, material: { muS: 0.5, muK: 0.5, restitution: 0 } })
  s.settings.gravity = { x: 0, y: -v.g }
}
const boxMass = (rho: number, w: number, h: number, d: number) => rho * w * h * d

function floatingBlock(v: Record<string, number>): Scene {
  const s = emptyScene(tl('漂浮的木块'))
  s.description = tl('密度为 ρ物 的长方体木块轻放在水面上，上下振动几次后（水有阻力）漂浮静止。漂浮时 F浮 = G，ρ液gV排 = ρ物gV，浸入的比例 V排/V = ρ物/ρ液，吃水深度 h = ρ物H/ρ液。二维中按物体厚度 d 计算体积。')
  tank(s, v, 0.6, 1.6, v.c)
  const w = 0.2, h = 0.1
  addBody(s, { id: 'block', name: tl('木块'), role: 'block', shape: { type: 'box', width: w, height: h }, position: { x: 0, y: h / 2 + 0.01 }, mass: boxMass(v.rhoB, w, h, v.d), material: { muS: 0.3, muK: 0.3, restitution: 0 }, color: '#b45309' })
  s.settings.legacyDuration = 4
  s.settings.energyZeroY = 0
  s.view = { center: { x: 0, y: -0.15 }, pixelsPerMeter: 380 }
  s.watch = ['block.y', 'block.Fb', 'block.Vsub', 'ledger.liquidHeat']
  return s
}

function sinkingBall(v: Record<string, number>): Scene {
  const s = emptyScene(tl('铁球在水中下沉'))
  s.description = tl('浸没在水中的铁球由静止释放（忽略水的阻力）。浮力 F浮 = ρ液gV 小于重力，合力向下且恒定：a = g(1 − ρ液/ρ物)，匀加速下沉到容器底。')
  tank(s, v, 3, 1, 0)
  const r = 0.05
  const area = Math.PI * r * r
  addBody(s, { id: 'ball', name: tl('铁球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 0, y: -r - 0.02 }, mass: num(v.rhoB * area * v.d), material: { restitution: 0 }, color: '#475569' })
  s.settings.legacyDuration = 0.8
  s.view = { center: { x: 0, y: -1.4 }, pixelsPerMeter: 150 }
  s.watch = ['ball.vy', 'ball.ay', 'ball.Fb', 'ledger.buoyancyWork']
  return s
}

function risingBlock(v: Record<string, number>): Scene {
  const s = emptyScene(tl('水中释放的木块上浮'))
  s.description = tl('浸没在水底附近的木块由静止释放（忽略水的阻力）。浮力大于重力，木块加速上浮：a = g(ρ液/ρ物 − 1)；冲出水面一部分后浮力减小，上下振动（没有阻力，振动不停止）。浮力做的功计入能量账本。')
  tank(s, v, 1, 1.2, 0)
  const w = 0.2, h = 0.1
  addBody(s, { id: 'block', name: tl('木块'), role: 'block', shape: { type: 'box', width: w, height: h }, position: { x: 0, y: -0.8 }, mass: boxMass(v.rhoB, w, h, v.d), fixedRotation: true, material: { restitution: 0 }, color: '#b45309' })
  s.settings.legacyDuration = 3
  s.view = { center: { x: 0, y: -0.4 }, pixelsPerMeter: 300 }
  s.watch = ['block.vy', 'block.ay', 'block.Fb', 'ledger.buoyancyWork']
  return s
}

function weighInWater(v: Record<string, number>): Scene {
  const s = emptyScene(tl('称重法测浮力'))
  s.description = tl('用弹簧测力计吊着金属块浸没在水中，静止时测力计的示数 F示 = G − F浮，所以 F浮 = G − F示 = ρ液gV排。换用不同密度的液体，示数随之改变。弹簧有阻尼，振动很快消失。')
  tank(s, v, 0.8, 1, 0)
  const w = 0.1, h = 0.1, m = boxMass(v.rhoB, w, h, v.d)
  const fb = v.rho * w * h * v.d * v.g
  const k = 200, L0 = 0.4, ext = (m * v.g - fb) / k
  // the block hangs fully under water, its centre 0.3 m below the surface
  const top = -0.3 + h / 2 + L0 + ext
  const blk = addBody(s, { id: 'block', name: tl('金属块'), role: 'block', shape: { type: 'box', width: w, height: h }, position: { x: 0, y: top - L0 - ext - h / 2 }, mass: m, fixedRotation: true, color: '#64748b' })
  addConnector<SpringDef>(s, { id: 'scale', name: tl('弹簧测力计'), type: 'spring', a: anchor(null, { x: 0, y: top }), b: anchor(blk, { x: 0, y: h / 2 }), stiffness: k, restLength: L0, damping: 4 })
  s.settings.legacyDuration = 2
  s.view = { center: { x: 0, y: 0 }, pixelsPerMeter: 330 }
  s.watch = ['scale.F', 'block.Fb', 'block.Vsub', 'block.y']
  // start a little above the equilibrium so the reading settles visibly
  blk.position = { x: 0, y: blk.position.y + 0.03 }
  return s
}

function densities(v: Record<string, number>): Scene {
  const s = emptyScene(tl('三种物体的沉浮'))
  s.description = tl('体积相同的木块（ρ = 0.6 g/cm³）、冰块（ρ = 0.9 g/cm³）和铁块（ρ = 7.8 g/cm³）同时放到水面上：木块浮得最高，冰块大部分浸在水中（约 9/10），铁块沉到底。物体密度小于液体时漂浮，大于液体时下沉。水有阻力。')
  tank(s, v, 0.7, 1.8, v.c)
  const w = 0.16, h = 0.12
  const add = (id: string, name: string, x: number, rho: number, color: string) => addBody(s, { id, name, role: 'block', shape: { type: 'box', width: w, height: h }, position: { x, y: h / 2 + 0.005 }, mass: boxMass(rho, w, h, v.d), fixedRotation: true, material: { muS: 0.4, muK: 0.4, restitution: 0 }, color })
  add('wood', tl('木块'), -0.5, 600, '#b45309')
  add('ice', tl('冰块'), 0, 900, '#7dd3fc')
  add('iron', tl('铁块'), 0.5, 7800, '#475569')
  s.settings.legacyDuration = 4
  s.view = { center: { x: 0, y: -0.25 }, pixelsPerMeter: 330 }
  s.watch = ['wood.Vsub', 'ice.Vsub', 'iron.Fb', 'iron.y']
  return s
}

function loadedBoat(v: Record<string, number>): Scene {
  const s = emptyScene(tl('船的载重'))
  s.description = tl('一只平底船（长方体）漂浮在水面上，在它上面放一个重物 m：船下沉一些，重新平衡时 F浮 = (M + m)g，多排开的水的重力等于重物的重力。船的吃水深度 h = (M + m)/(ρ液Sd)。水有阻力。')
  tank(s, v, 0.6, 2, v.c)
  const W = 0.8, H = 0.12, M = boxMass(250, W, H, v.d)
  const boat = addBody(s, { id: 'boat', name: tl('船'), role: 'board', shape: { type: 'box', width: W, height: H }, position: { x: 0, y: H / 2 - M / (v.rho * W * v.d) }, mass: M, fixedRotation: true, material: { muS: 0.6, muK: 0.6, restitution: 0 }, color: '#92400e' })
  const b = 0.12
  addBody(s, { id: 'load', name: tl('重物'), role: 'block', shape: { type: 'box', width: b, height: b }, position: { x: 0, y: boat.position.y + H / 2 + b / 2 + 0.002 }, mass: v.m, fixedRotation: true, material: { muS: 0.6, muK: 0.6, restitution: 0 }, color: '#475569' })
  s.contactPairs.push({ a: 'load', b: 'boat', muS: 0.6, muK: 0.6, restitution: 0 })
  s.settings.legacyDuration = 4
  s.view = { center: { x: 0, y: -0.1 }, pixelsPerMeter: 300 }
  s.watch = ['boat.y', 'boat.Fb', 'boat.Vsub', 'contact.boat|load.N']
  return s
}

function ballIntoWater(v: Record<string, number>): Scene {
  const s = emptyScene(tl('小球落入水中'))
  s.description = tl('木球从水面上方 h 处由静止落下，入水后受到浮力和水的阻力，速度迅速减小，向下冲一段后又浮起，最后漂浮在水面上。重力势能、动能、浮力做功与阻力生热都记在能量账本中。')
  tank(s, v, 1, 1.6, v.c)
  const r = 0.06
  addBody(s, { id: 'ball', name: tl('木球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 0, y: v.h + r }, mass: num(v.rhoB * Math.PI * r * r * v.d), material: { restitution: 0 }, color: '#b45309' })
  s.settings.legacyDuration = 4
  s.view = { center: { x: 0, y: (v.h - 0.6) / 2 }, pixelsPerMeter: Math.max(80, Math.min(300, 420 / (v.h + 1.1))) }
  s.watch = ['ball.vy', 'ball.Fb', 'ledger.buoyancyWork', 'ledger.liquidHeat']
  return s
}

// ---- Mechanics ----
function doublePendulum(v: Record<string, number>): Scene {
  const s = emptyScene(tl('双摆'))
  s.description = tl('两根轻杆串联两个摆球，从偏角 θ₁、θ₂ 处静止释放。双摆是混沌系统：初始角度的微小差别在几秒后变成完全不同的运动，但总机械能始终守恒。')
  const pivot = { x: 0, y: 2.2 }
  const t1 = v.theta1 * DEG, t2 = v.theta2 * DEG
  const p1 = { x: pivot.x + v.L1 * sin(t1), y: pivot.y - v.L1 * cos(t1) }
  const p2 = { x: p1.x + v.L2 * sin(t2), y: p1.y - v.L2 * cos(t2) }
  const b1 = addBody(s, { id: 'bob1', name: tl('摆球1'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.04 }, position: p1, mass: v.m1, color: '#ef4444' })
  const b2 = addBody(s, { id: 'bob2', name: tl('摆球2'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.04 }, position: p2, mass: v.m2, color: '#2563eb' })
  addConnector<RodDef>(s, { id: 'rod1', name: tl('杆1'), type: 'rod', a: anchor(null, pivot), b: anchor(b1), length: null })
  addConnector<RodDef>(s, { id: 'rod2', name: tl('杆2'), type: 'rod', a: anchor(b1), b: anchor(b2), length: null })
  s.contactPairs.push({ a: 'bob1', b: 'bob2', muS: 0, muK: 0, restitution: 1 })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 8
  s.settings.energyZeroY = pivot.y
  s.view = { center: { x: 0, y: pivot.y - 0.8 * (v.L1 + v.L2) }, pixelsPerMeter: Math.max(40, Math.min(300, 300 / (v.L1 + v.L2))) }
  s.watch = ['bob1.angle@pivot', 'bob2.v', 'rod1.F', 'system.e']
  s.extra = { pivot }
  return s
}

function physicalPendulum(v: Record<string, number>): Scene {
  const s = emptyScene(tl('复摆'))
  s.description = tl('匀质细杆绕一端的光滑轴在竖直面内小角度摆动（复摆）。周期 T = 2π√(I/(mgd))，I = mL²/3，d = L/2，所以 T = 2π√(2L/(3g))：等于摆长为 2L/3 的单摆的周期。')
  const L = v.L, th = v.theta0 * DEG, pivot = { x: 0, y: 1.5 }
  const rod = addBody(s, { id: 'rod', name: tl('细杆'), role: 'rod', shape: { type: 'box', width: L, height: 0.03 }, position: { x: pivot.x + (L / 2) * sin(th), y: pivot.y - (L / 2) * cos(th) }, angle: th - Math.PI / 2, mass: v.m, inertia: v.m * L * L / 12 })
  addConnector<HingeDef>(s, { id: 'axis', name: tl('转轴'), type: 'hinge', a: anchor(rod, { x: -L / 2, y: 0 }), b: anchor(null, pivot) })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = Math.min(60, 2.5 * 2 * Math.PI * Math.sqrt(2 * L / (3 * Math.max(v.g, 1e-3))))
  s.settings.energyZeroY = pivot.y - L / 2
  s.view = { center: { x: 0, y: pivot.y - L / 2 }, pixelsPerMeter: Math.max(60, Math.min(300, 220 / L)) }
  s.watch = ['rod.angle', 'rod.omega', 'axis.F', 'system.e']
  s.extra = { pivot, idealization: tl('细杆：转动惯量按 mL²/12 设定（忽略杆的厚度）') }
  return s
}

function coupledOscillators(v: Record<string, number>): Scene {
  const s = emptyScene(tl('耦合振子'))
  s.description = tl('光滑水平面上两个相同的物块，用劲度系数 k 的弹簧分别连到两侧墙上，中间用较弱的耦合弹簧 k_c 相连。只拉开左边的物块再释放：能量在两个物块之间来回转移（拍）。两个简正模式的角频率 ω₁ = √(k/m)、ω₂ = √((k + 2k_c)/m)，拍的周期 2π/(ω₂ − ω₁)。')
  addGround(s, { id: 'ground', top: 0, left: -0.2, right: 3.2 })
  const L0 = 0.8, w = 0.2
  addBody(s, { id: 'wallL', name: tl('左墙'), kind: 'static', role: 'wall', shape: { type: 'box', width: 0.1, height: 0.6 }, position: { x: -0.05, y: 0.3 } })
  addBody(s, { id: 'wallR', name: tl('右墙'), kind: 'static', role: 'wall', shape: { type: 'box', width: 0.1, height: 0.6 }, position: { x: 3 * L0 + 2 * w + 0.05, y: 0.3 } })
  const b1 = addBody(s, { id: 'b1', name: tl('物块1'), role: 'block', shape: { type: 'box', width: w, height: w }, position: { x: L0 + w / 2 + v.A, y: w / 2 }, mass: v.m, material: { muS: 0, muK: 0 } })
  const b2 = addBody(s, { id: 'b2', name: tl('物块2'), role: 'block', shape: { type: 'box', width: w, height: w }, position: { x: 2 * L0 + 1.5 * w, y: w / 2 }, mass: v.m, material: { muS: 0, muK: 0 }, color: '#f59e0b' })
  addConnector<SpringDef>(s, { id: 's1', name: tl('弹簧1'), type: 'spring', a: anchor(null, { x: 0, y: w / 2 }), b: anchor(b1, { x: -w / 2, y: 0 }), stiffness: v.k, restLength: L0, damping: 0 })
  addConnector<SpringDef>(s, { id: 'sc', name: tl('耦合弹簧'), type: 'spring', a: anchor(b1, { x: w / 2, y: 0 }), b: anchor(b2, { x: -w / 2, y: 0 }), stiffness: v.kc, restLength: L0, damping: 0 })
  addConnector<SpringDef>(s, { id: 's2', name: tl('弹簧2'), type: 'spring', a: anchor(b2, { x: w / 2, y: 0 }), b: anchor(null, { x: 3 * L0 + 2 * w, y: w / 2 }), stiffness: v.k, restLength: L0, damping: 0 })
  s.settings.gravity = { x: 0, y: -v.g }
  const w1 = Math.sqrt(v.k / v.m), w2 = Math.sqrt((v.k + 2 * v.kc) / v.m)
  s.settings.legacyDuration = Math.min(120, 1.1 * 2 * Math.PI / Math.max(w2 - w1, 1e-3))
  s.view = { center: { x: 1.5 * L0 + w, y: 0.4 }, pixelsPerMeter: 180 }
  s.watch = ['b1.x', 'b2.x', 'b1.ek', 'b2.ek', 'system.e']
  return s
}

function binaryStar(v: Record<string, number>): Scene {
  const s = emptyScene(tl('双星'))
  s.description = tl('两颗星只受彼此的万有引力（教学单位 G = 1），绕共同的质心做匀速圆周运动：角速度相同，轨道半径与质量成反比 r₁/r₂ = M₂/M₁，周期 T = 2π√(d³/(G(M₁ + M₂)))。')
  s.settings.gravitation = { G: 1 }
  s.settings.gravity = { x: 0, y: 0 }
  const M = v.M1 + v.M2, d = v.d
  const r1 = d * v.M2 / M, r2 = d * v.M1 / M
  const w = Math.sqrt(M / (d * d * d))
  addBody(s, { id: 'star1', name: tl('星体1'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.12 }, position: { x: -r1, y: 0 }, velocity: { x: 0, y: -w * r1 }, mass: v.M1, color: '#f59e0b', material: { restitution: 0 } })
  addBody(s, { id: 'star2', name: tl('星体2'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.08 }, position: { x: r2, y: 0 }, velocity: { x: 0, y: w * r2 }, mass: v.M2, color: '#2563eb', material: { restitution: 0 } })
  s.settings.legacyDuration = Math.min(600, 1.2 * 2 * Math.PI / w)
  s.view = { center: { x: 0, y: 0 }, pixelsPerMeter: Math.max(10, Math.min(300, 220 / Math.max(r1, r2))) }
  s.watch = ['star1.v', 'star2.v', 'star1.Fg', 'system.px', 'system.e']
  return s
}

function kepler(v: Record<string, number>): Scene {
  const s = emptyScene(tl('开普勒第三定律'))
  s.description = tl('两颗行星在不同半径的圆轨道上绕同一恒星运动（教学单位 G = 1，行星质量很小）。轨道半径越大，速度越小、周期越长，T²/r³ = 4π²/(GM) 对两颗行星相同。')
  s.settings.gravitation = { G: 1 }
  s.settings.gravity = { x: 0, y: 0 }
  addBody(s, { id: 'star', name: tl('恒星'), kind: 'static', role: 'generic', shape: { type: 'circle', radius: 0.3 }, position: { x: 0, y: 0 }, mass: v.M, color: '#f59e0b' })
  addBody(s, { id: 'inner', name: tl('内行星'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.08 }, position: { x: v.r1, y: 0 }, velocity: { x: 0, y: Math.sqrt(v.M / v.r1) }, mass: 1e-6, color: '#2563eb' })
  addBody(s, { id: 'outer', name: tl('外行星'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.1 }, position: { x: -v.r2, y: 0 }, velocity: { x: 0, y: -Math.sqrt(v.M / v.r2) }, mass: 1e-6, color: '#16a34a' })
  s.settings.legacyDuration = Math.min(600, 1.05 * 2 * Math.PI * Math.sqrt(v.r2 ** 3 / v.M))
  s.view = { center: { x: 0, y: 0 }, pixelsPerMeter: Math.max(10, Math.min(200, 260 / v.r2)) }
  s.watch = ['inner.v', 'outer.v', 'inner.Fg', 'outer.Fg']
  return s
}

function bouncingBall(v: Record<string, number>): Scene {
  const s = emptyScene(tl('弹跳的小球'))
  s.description = tl('小球从高 h 处水平抛出（水平速度很小），落到光滑的水平地面上，恢复系数为 e：每次碰后速度变为碰前的 e 倍，弹起的高度变为上一次的 e² 倍；相邻两次碰撞的时间间隔也按 e 倍缩短，总时间有限。每次碰撞损失的机械能记在账本的“碰撞损失”中。')
  addGround(s, { id: 'ground', top: 0, left: -1, right: 12, material: { muS: 0, muK: 0, restitution: v.e } })
  const r = 0.05
  // a little horizontal speed, so the bounces are spread out along the floor (the floor is smooth)
  addBody(s, { id: 'ball', name: tl('小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 0, y: v.h + r }, velocity: { x: 0.4, y: 0 }, mass: v.m, material: { muS: 0, muK: 0, restitution: v.e } })
  s.contactPairs.push({ a: 'ball', b: 'ground', muS: 0, muK: 0, restitution: v.e })
  s.settings.gravity = { x: 0, y: -v.g }
  const t0 = Math.sqrt(2 * v.h / Math.max(v.g, 1e-3))
  s.settings.legacyDuration = Math.min(60, t0 * (1 + 2 * v.e / Math.max(1 - v.e, 0.05)) * 0.9)
  s.settings.energyZeroY = r
  s.view = { center: { x: 0.2 * s.settings.legacyDuration, y: v.h / 2 }, pixelsPerMeter: Math.max(10, Math.min(300, 480 / Math.max(v.h + 0.3, 0.4 * s.settings.legacyDuration + 0.4, 0.3))) }
  s.watch = ['ball.y', 'ball.vy', 'system.e', 'ledger.impactLoss']
  return s
}

function threeBalls(v: Record<string, number>): Scene {
  const s = emptyScene(tl('三球依次碰撞'))
  s.description = tl('光滑水平面上（俯视），小球 A 以 v₀ 撞向静止的 B，B 再撞向静止的 C。质量相等的弹性碰撞（e = 1）中速度依次“交换”：最后 A、B 静止，C 以 v₀ 运动。每次碰撞系统的动量守恒。')
  const r = 0.1
  const add = (id: string, name: string, x: number, m: number, vx: number, color: string) => addBody(s, { id, name, kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x, y: 0 }, velocity: { x: vx, y: 0 }, mass: m, material: { restitution: v.e }, color })
  add('A', tl('小球A'), 0, v.m1, v.v0, '#ef4444')
  add('B', tl('小球B'), 0.8, v.m2, 0, '#2563eb')
  add('C', tl('小球C'), 1.6, v.m3, 0, '#16a34a')
  for (const [a, b] of [['A', 'B'], ['B', 'C'], ['A', 'C']]) s.contactPairs.push({ a, b, muS: 0, muK: 0, restitution: v.e })
  s.settings.gravity = { x: 0, y: 0 }
  s.settings.legacyDuration = Math.min(60, 2.6 / Math.max(v.v0, 0.05))
  s.view = { center: { x: 1.4, y: 0 }, pixelsPerMeter: 150 }
  s.watch = ['A.vx', 'B.vx', 'C.vx', 'system.px', 'system.ek']
  return s
}

function pendulumCollision(v: Record<string, number>): Scene {
  const s = emptyScene(tl('两摆球的碰撞'))
  s.description = tl('两个等长的单摆并排悬挂，摆球刚好接触。把左边的摆球拉开 θ₀ 后释放，它在最低点与右边的摆球正碰。质量相等的弹性碰撞后速度交换：左球停下，右球摆到同样的高度。改变恢复系数或质量看动量守恒与能量损失。')
  const L = v.L, r = 0.05, th = v.theta0 * DEG
  const pa = { x: -r, y: 1.6 }, pb = { x: r, y: 1.6 }
  const a = addBody(s, { id: 'A', name: tl('摆球A'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: pa.x - L * sin(th), y: pa.y - L * cos(th) }, mass: v.m1, material: { restitution: v.e }, color: '#ef4444' })
  const b = addBody(s, { id: 'B', name: tl('摆球B'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: pb.x, y: pb.y - L }, mass: v.m2, material: { restitution: v.e }, color: '#2563eb' })
  addConnector<RopeDef>(s, { id: 'ropeA', name: tl('摆线A'), type: 'rope', a: anchor(null, pa), b: anchor(a), pulleys: [], length: null })
  addConnector<RopeDef>(s, { id: 'ropeB', name: tl('摆线B'), type: 'rope', a: anchor(null, pb), b: anchor(b), pulleys: [], length: null })
  s.contactPairs.push({ a: 'A', b: 'B', muS: 0, muK: 0, restitution: v.e })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = Math.min(60, 2 * Math.PI * Math.sqrt(L / Math.max(v.g, 1e-3)) * 0.75)
  s.settings.energyZeroY = 1.6 - L
  s.view = { center: { x: 0, y: 1.6 - L / 2 }, pixelsPerMeter: Math.max(60, Math.min(300, 260 / L)) }
  s.watch = ['A.vx', 'B.vx', 'system.px', 'system.e']
  return s
}

function slopeUp(v: Record<string, number>): Scene {
  const s = emptyScene(tl('物块冲上斜面'))
  s.description = tl('物块以初速度 v₀ 从斜面底端沿粗糙斜面向上滑：上滑时重力的分力与摩擦力都沿斜面向下，a₁ = g(sinθ + μcosθ)；到最高点速度为零，若 tanθ > μ 再滑下，a₂ = g(sinθ − μcosθ)，回到底端时速度小于 v₀。')
  const th = v.theta * DEG, base = 4
  addIncline(s, { id: 'incline', angle: th, base, material: { muS: v.mu, muK: v.mu } })
  const w = 0.3, h = 0.2
  const pl = onIncline(th, base, base / cos(th) - 0.3, w, h)
  const up = { x: -cos(th), y: sin(th) }
  addBody(s, { id: 'block', name: tl('物块'), role: 'block', shape: { type: 'box', width: w, height: h }, position: pl.position, angle: pl.angle, velocity: { x: v.v0 * up.x, y: v.v0 * up.y }, mass: v.m, material: { muS: v.mu, muK: v.mu } })
  addGround(s, { id: 'ground', top: 0, left: base, right: base + 3, material: { muS: v.mu, muK: v.mu } })
  s.settings.gravity = { x: 0, y: -v.g }
  const a1 = v.g * (sin(th) + v.mu * cos(th))
  s.settings.legacyDuration = Math.min(60, 2.2 * v.v0 / Math.max(a1, 0.1))
  s.settings.energyZeroY = pl.position.y
  s.view = { center: { x: 2.4, y: 1.1 }, pixelsPerMeter: 140 }
  s.watch = ['block.v', 'block.a', 'contact.block|incline.f', 'pair.block|incline.heat']
  return s
}

function inclinePulley(v: Record<string, number>): Scene {
  const s = emptyScene(tl('斜面上的连接体'))
  s.description = tl('斜面上的物块 m₁ 用轻绳跨过斜面顶端的定滑轮与悬挂的物块 m₂ 相连，由静止释放。整体法：a = (m₂ − m₁sinθ − μm₁cosθ)g/(m₁ + m₂)（m₁ 沿斜面向上运动时）；隔离 m₂ 求绳的拉力 T = m₂(g − a)。')
  const th = v.theta * DEG, base = 2.4
  addIncline(s, { id: 'incline', angle: th, base, material: { muS: v.mu, muK: v.mu } })
  const H = base * tan(th)
  const w = 0.2, h = 0.16
  // low on the slope, so the blocks move a long way before m₁ reaches the top
  const pl = onIncline(th, base, base / cos(th) - 0.45, w, h)
  const b1 = addBody(s, { id: 'm1', name: tl('物块1'), role: 'block', shape: { type: 'box', width: w, height: h }, position: pl.position, angle: pl.angle, mass: v.m1, material: { muS: v.mu, muK: v.mu } })
  // the rope leaves the block parallel to the slope and runs over the pulley at the top corner
  const u = { x: -cos(th), y: sin(th) }, nrm = { x: sin(th), y: cos(th) }
  const pr = 0.05
  const tAlong = (-0.12 - pl.position.x + pr * nrm.x) / u.x
  const pc = { x: pl.position.x + tAlong * u.x - pr * nrm.x, y: pl.position.y + tAlong * u.y - pr * nrm.y }
  const pul = addPulley(s, { id: 'pulley', name: tl('定滑轮'), position: pc, radius: pr })
  addBody(s, { id: 'stand', name: tl('滑轮架'), kind: 'static', role: 'wall', shape: { type: 'box', width: 0.04, height: Math.max(pc.y - H, 0.05) + 0.02 }, position: { x: 0.02, y: H + Math.max(pc.y - H, 0.05) / 2 - 0.01 } })
  const hw = 0.14
  const b2 = addBody(s, { id: 'm2', name: tl('物块2'), role: 'block', shape: { type: 'box', width: hw, height: hw }, position: { x: pc.x - pr, y: pc.y - 0.35 }, mass: v.m2, color: '#f59e0b' })
  addConnector<RopeDef>(s, { id: 'rope', name: tl('轻绳'), type: 'rope', a: anchor(b1), b: anchor(b2), pulleys: [{ pulley: pul.id, wrap: 'ccw' }], length: null })
  addGround(s, { id: 'ground', top: -1.6, left: -1.5, right: 0 })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 1
  // stop when m₁ reaches the top of the slope (otherwise it is flung over the corner and the blocks tangle at the pulley)
  s.settings.stopAt = { on: 'impact', after: 0 }
  s.view = { center: { x: 0.9, y: H / 2 }, pixelsPerMeter: 170 }
  s.watch = ['m1.v', 'm2.vy', 'rope.T', 'contact.m1|incline.f']
  return s
}

function pursuit(v: Record<string, number>): Scene {
  const s = emptyScene(tl('追及与相遇'))
  s.description = tl('两条平行的光滑轨道上：物体 A 在前方 d 处以速度 v 匀速运动，物体 B 从静止开始以加速度 a 匀加速追赶（恒力 F = ma）。两者速度相等时距离最大；B 追上 A 时 ½at² = d + vt。')
  addGround(s, { id: 'lane1', name: tl('轨道1'), top: 0, left: -1, right: 60 })
  addBody(s, { id: 'lane2', name: tl('轨道2'), kind: 'static', role: 'ground', shape: { type: 'box', width: 61, height: 0.1 }, position: { x: 29.5, y: 0.55 } })
  const w = 0.4, h = 0.25
  addBody(s, { id: 'A', name: tl('物体A'), role: 'block', shape: { type: 'box', width: w, height: h }, position: { x: v.d + w / 2, y: 0.6 + h / 2 }, velocity: { x: v.v, y: 0 }, mass: 1, material: { muS: 0, muK: 0 }, color: '#2563eb' })
  const b = addBody(s, { id: 'B', name: tl('物体B'), role: 'block', shape: { type: 'box', width: w, height: h }, position: { x: w / 2, y: h / 2 }, mass: 1, material: { muS: 0, muK: 0 }, color: '#ef4444' })
  addConnector<ForceDef>(s, { id: 'F', name: tl('牵引力'), type: 'force', a: anchor(b), force: { x: v.a, y: 0 } })
  s.settings.gravity = { x: 0, y: -v.g }
  const tm = (v.v + Math.sqrt(v.v * v.v + 2 * v.a * v.d)) / Math.max(v.a, 1e-3)
  s.settings.legacyDuration = Math.min(60, 1.3 * tm)
  s.customQuantities = [{ id: 'gap', name: tl('A 在 B 前方的距离'), expr: 'x(A) - x(B)' }]
  s.view = { center: { x: Math.min(30, (v.d + v.v * tm) / 2), y: 0.6 }, pixelsPerMeter: Math.max(10, Math.min(150, 700 / Math.max(v.d + v.v * tm + 2, 2))) }
  s.watch = ['A.vx', 'B.vx', 'custom.gap']
  return s
}

function twoRopes(v: Record<string, number>): Scene {
  const s = emptyScene(tl('两绳悬挂重物'))
  s.description = tl('重物用两根轻绳挂在天花板上，绳与竖直方向的夹角分别为 α、β，重物静止。三力平衡：两绳拉力的合力与重力等大反向。T₁ = mg·sinβ/sin(α + β)，T₂ = mg·sinα/sin(α + β)。')
  const a = v.alpha * DEG, b = v.beta * DEG, hgt = 0.8
  const pos = { x: 0, y: 0.6 }
  const box = 0.14
  addBody(s, { id: 'ceiling', name: tl('天花板'), kind: 'static', role: 'wall', shape: { type: 'box', width: 2.4 * hgt * Math.max(tan(a), tan(b), 0.5) + 0.4, height: 0.06 }, position: { x: hgt * (tan(b) - tan(a)) / 2, y: pos.y + box / 2 + hgt + 0.03 } })
  const load = addBody(s, { id: 'load', name: tl('重物'), role: 'block', shape: { type: 'box', width: box, height: box }, position: pos, mass: v.m, color: '#b45309' })
  addConnector<RopeDef>(s, { id: 'rope1', name: tl('绳1'), type: 'rope', a: anchor(null, { x: pos.x - hgt * tan(a), y: pos.y + box / 2 + hgt }), b: anchor(load, { x: 0, y: box / 2 }), pulleys: [], length: null })
  addConnector<RopeDef>(s, { id: 'rope2', name: tl('绳2'), type: 'rope', a: anchor(null, { x: pos.x + hgt * tan(b), y: pos.y + box / 2 + hgt }), b: anchor(load, { x: 0, y: box / 2 }), pulleys: [], length: null })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 1
  s.view = { center: { x: 0, y: pos.y + 0.4 }, pixelsPerMeter: 230 }
  s.watch = ['rope1.T', 'rope2.T', 'load.v']
  return s
}

function verticalSpring(v: Record<string, number>): Scene {
  const s = emptyScene(tl('竖直弹簧振子'))
  s.description = tl('劲度系数 k 的轻弹簧上端固定，下端挂质量 m 的小球。平衡时弹簧伸长 x₀ = mg/k；从平衡位置向下拉 A 后释放，小球以平衡位置为中心做简谐运动，周期 T = 2π√(m/k)，与水平放置时相同。')
  const top = 2, L0 = 0.5, x0 = v.m * v.g / v.k
  const ball = addBody(s, { id: 'ball', name: tl('小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.06 }, position: { x: 0, y: top - L0 - x0 - v.A }, mass: v.m })
  addConnector<SpringDef>(s, { id: 'spring', name: tl('弹簧'), type: 'spring', a: anchor(null, { x: 0, y: top }), b: anchor(ball), stiffness: v.k, restLength: L0, damping: 0 })
  addBody(s, { id: 'support', name: tl('支架'), kind: 'static', role: 'wall', shape: { type: 'box', width: 0.5, height: 0.05 }, position: { x: 0, y: top + 0.025 } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = Math.min(60, 2.5 * 2 * Math.PI * Math.sqrt(v.m / v.k))
  s.settings.energyZeroY = top - L0 - x0
  s.view = { center: { x: 0, y: top - L0 - x0 / 2 }, pixelsPerMeter: Math.max(60, Math.min(300, 300 / (L0 + x0 + v.A + 0.3))) }
  s.watch = ['ball.y', 'ball.vy', 'spring.F', 'system.e']
  return s
}

function chargedPendulum(v: Record<string, number>): Scene {
  const s = emptyScene(tl('电场中的带电摆球'))
  s.description = tl('带正电的小球用绝缘细线悬挂，处在水平向右的匀强电场中。平衡时细线与竖直方向的夹角 tanθ = qE/(mg)。从竖直位置释放后，小球以平衡位置为中心来回摆动，摆动的“等效重力加速度” g′ = √(g² + (qE/m)²)。')
  const L = v.L, pivot = { x: 0, y: 1.8 }
  const ball = addBody(s, { id: 'ball', name: tl('带电小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.04 }, position: { x: pivot.x, y: pivot.y - L }, mass: v.m * G_, color: '#ef4444', charge: v.q * MC })
  addConnector<RopeDef>(s, { id: 'thread', name: tl('绝缘细线'), type: 'rope', a: anchor(null, pivot), b: anchor(ball), pulleys: [], length: null })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.electric = { E: { x: v.E, y: 0 } }
  const geff = Math.hypot(v.g, v.q * MC * v.E / (v.m * G_))
  s.settings.legacyDuration = Math.min(60, 2 * 2 * Math.PI * Math.sqrt(L / Math.max(geff, 1e-3)))
  s.settings.energyZeroY = pivot.y - L
  s.view = { center: { x: 0.2, y: pivot.y - L / 2 }, pixelsPerMeter: Math.max(60, Math.min(300, 240 / L)) }
  s.watch = ['ball.angle@pivot', 'thread.T', 'ball.FE', 'system.e']
  s.extra = { pivot }
  return s
}

function chargedDrop(v: Record<string, number>): Scene {
  const s = emptyScene(tl('电场中的带电油滴'))
  s.description = tl('带负电的油滴在竖直向下的匀强电场中下落，受重力、向上的电场力和空气阻力 f = bv。qE = mg 时油滴悬浮（密立根实验的原理）；否则很快达到收尾速度 v = (mg − |q|E)/b。')
  addGround(s, { id: 'plate', name: tl('下极板'), top: 0, left: -1, right: 1 })
  addBody(s, { id: 'drop', name: tl('油滴'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.03 }, position: { x: 0, y: 1.5 }, mass: v.m * G_, color: '#f59e0b', charge: -v.q * MC, drag: { linear: v.b, quadratic: 0 } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.electric = { E: { x: 0, y: -v.E } }
  s.settings.legacyDuration = 3
  s.view = { center: { x: 0, y: 0.8 }, pixelsPerMeter: 280 }
  s.watch = ['drop.vy', 'drop.FE', 'drop.fd']
  return s
}

/** The 26.55 templates (group names are Chinese source keys). */
export const TEMPLATES_2655: TemplateInfo[] = [
  // Electricity and magnetism: bounded regions (D90)
  { id: 'mass-spectrometer', group: '电与磁', name: '质谱仪', description: '加速电场 + 偏转磁场：落点 2r = (2/B)√(2mU/q)', params: [p('U', '加速电压 U', 'V', 0.5, 1e-6), p('B', '磁感应强度 B', 'T', 2, 1e-6), p('q', '电荷量 q', 'mC', 1, 1e-6), p('m1', '粒子1质量 m₁', 'g', 1, 1e-6), p('m2', '粒子2质量 m₂', 'g', 2, 1e-6)], build: massSpectrometer },
  { id: 'cyclotron-dees', group: '电与磁', name: '回旋加速器', description: 'D 形盒中转半周的时间与速度无关；交变电场每次穿缝都加速', params: [p('B', '磁感应强度 B', 'T', 1, 1e-6), p('U', '缝间电压峰值 U', 'V', 0.5, 1e-6), p('R', 'D 形盒半径 R', 'm', 2.5, 0.5, 10), p('q', '电荷量 q', 'mC', 1, 1e-6), p('m', '质量 m', 'g', 1, 1e-6)], build: cyclotronDees },
  { id: 'bounded-field', group: '电与磁', name: '有界磁场中的偏转', description: '垂直射入转半周；D < r 时穿出，sinφ = D/r', params: [p('B', '磁感应强度 B', 'T', 1, 1e-6), p('v', '速度 v', 'm/s', 1, 0.001), p('theta', '入射角 θ', '°', 0, -80, 80), p('D', '磁场宽度 D', 'm', 2, 0.05, 20), p('q', '电荷量 q', 'mC', 1, 1e-6), p('m', '质量 m', 'g', 1, 1e-6)], build: boundedField },
  { id: 'circular-field', group: '电与磁', name: '圆形磁场区域', description: '沿半径射入必沿半径射出，tan(φ/2) = R/r', params: [p('B', '磁感应强度 B', 'T', 1, 1e-6), p('R', '区域半径 R', 'm', 1, 0.1, 10), p('v', '速度 v', 'm/s', 1, 0.001), p('q', '电荷量 q', 'mC', 1, 1e-6), p('m', '质量 m', 'g', 1, 1e-6)], build: circularField },
  { id: 'oscilloscope', group: '电与磁', name: '示波管：加速与偏转', description: '先加速后偏转：y = U₂L²/(4dU₁)，与 q、m 无关', params: [p('U1', '加速电压 U₁', 'V', 2, 1e-6), p('U2', '偏转电压 U₂', 'V', 0.5, 0), p('L', '极板长 L', 'm', 1, 0.1, 5), p('d', '板间距 d', 'm', 0.5, 0.05, 2), p('q', '电荷量 q', 'mC', 1, 1e-6), p('m', '质量 m', 'g', 1, 1e-6)], build: oscilloscope },
  { id: 'field-combo', group: '电与磁', name: '电场与磁场的组合', description: '先类平抛、后匀速圆周：组合场', params: [p('E', '场强 E', 'V/m', 1, 0), p('B', '磁感应强度 B', 'T', 1, 1e-6), p('L', '电场宽度 L', 'm', 1, 0.1, 5), p('v0', '初速度 v₀', 'm/s', 1, 0.01), p('q', '电荷量 q', 'mC', 1, 1e-6), p('m', '质量 m', 'g', 1, 1e-6)], build: fieldCombo },
  { id: 'charged-pendulum', group: '电与磁', name: '电场中的带电摆球', description: '平衡位置 tanθ = qE/(mg)，等效重力加速度', params: [p('E', '场强 E', 'V/m', 5, 0), p('q', '电荷量 q', 'mC', 1, 0), p('m', '质量 m', 'g', 1, 1e-6), p('L', '线长 L', 'm', 1, 0.1, 5), gp()], build: chargedPendulum },
  { id: 'charged-drop', group: '电与磁', name: '电场中的带电油滴', description: 'qE = mg 时悬浮；否则收尾速度 v = (mg − qE)/b', params: [p('E', '场强 E', 'V/m', 8, 0), p('q', '电荷量 |q|', 'mC', 1, 0), p('m', '质量 m', 'g', 1, 1e-6), p('b', '阻力系数 b', 'N·s/m', 0.01, 1e-6), gp()], build: chargedDrop },
  // Electromagnetic induction: rail loops (D91)
  { id: 'rail-force', group: '电磁感应', name: '导体棒在恒力下运动', description: 'ε = BLv，收尾速度 v = FR/(B²L²)', params: [p('F', '拉力 F', 'N', 2, 0), p('B', '磁感应强度 B', 'T', 1, 0), p('L', '导轨间距 L', 'm', 0.5, 0.01, 5), p('R', '电阻 R', 'Ω', 0.25, 1e-6), p('m', '导体棒质量 m', 'kg', 0.5, 0.001)], build: railForce },
  { id: 'rail-coast', group: '电磁感应', name: '导体棒以初速度滑行', description: 'v = v₀e^(−t/τ)，滑行距离 x = mv₀R/(B²L²)', params: [p('v0', '初速度 v₀', 'm/s', 3), p('B', '磁感应强度 B', 'T', 1, 0), p('L', '导轨间距 L', 'm', 0.5, 0.01, 5), p('R', '电阻 R', 'Ω', 0.25, 1e-6), p('m', '导体棒质量 m', 'kg', 0.5, 0.001)], build: railCoast },
  { id: 'rail-fall', group: '电磁感应', name: '导体棒沿竖直导轨下落', description: '收尾速度 v = mgR/(B²L²)', params: [p('m', '导体棒质量 m', 'kg', 0.1, 0.001), p('B', '磁感应强度 B', 'T', 1, 0), p('L', '导轨间距 L', 'm', 0.5, 0.01, 5), p('R', '电阻 R', 'Ω', 0.5, 1e-6), gp()], build: railFall },
  // Liquids (D92)
  { id: 'floating-block', group: '流体', name: '漂浮的木块', description: 'F浮 = G，V排/V = ρ物/ρ液', params: [p('rhoB', '木块密度 ρ物', 'kg/m³', 600, 1), p('rho', '液体密度 ρ液', 'kg/m³', 1000, 1), p('d', '物体厚度 d', 'm', 0.1, 0.001), p('c', '液体阻力系数', 'N·s/m', 10, 0), gp()], build: floatingBlock },
  { id: 'sinking-ball', group: '流体', name: '铁球在水中下沉', description: 'a = g(1 − ρ液/ρ物)', params: [p('rhoB', '铁球密度 ρ物', 'kg/m³', 7800, 1), p('rho', '液体密度 ρ液', 'kg/m³', 1000, 1), p('d', '物体厚度 d', 'm', 0.1, 0.001), gp()], build: sinkingBall },
  { id: 'rising-block', group: '流体', name: '水中释放的木块上浮', description: '浮力大于重力，加速上浮；无阻力时上下振动', params: [p('rhoB', '木块密度 ρ物', 'kg/m³', 500, 1), p('rho', '液体密度 ρ液', 'kg/m³', 1000, 1), p('d', '物体厚度 d', 'm', 0.1, 0.001), gp()], build: risingBlock },
  { id: 'weigh-in-water', group: '流体', name: '称重法测浮力', description: 'F浮 = G − F示', params: [p('rhoB', '金属块密度 ρ物', 'kg/m³', 2700, 1), p('rho', '液体密度 ρ液', 'kg/m³', 1000, 1), p('d', '物体厚度 d', 'm', 0.1, 0.001), gp()], build: weighInWater },
  { id: 'densities', group: '流体', name: '三种物体的沉浮', description: '木块、冰块、铁块：ρ物 < ρ液 漂浮，ρ物 > ρ液 下沉', params: [p('rho', '液体密度 ρ液', 'kg/m³', 1000, 1), p('d', '物体厚度 d', 'm', 0.1, 0.001), p('c', '液体阻力系数', 'N·s/m', 15, 0), gp()], build: densities },
  { id: 'loaded-boat', group: '流体', name: '船的载重', description: '放上重物后船下沉，F浮 = (M + m)g', params: [p('m', '重物质量 m', 'kg', 2, 0), p('rho', '液体密度 ρ液', 'kg/m³', 1000, 1), p('d', '物体厚度 d', 'm', 0.1, 0.001), p('c', '液体阻力系数', 'N·s/m', 30, 0), gp()], build: loadedBoat },
  { id: 'ball-into-water', group: '流体', name: '小球落入水中', description: '入水后减速、下冲、上浮，最后漂浮', params: [p('h', '下落高度 h', 'm', 0.5, 0, 3), p('rhoB', '木球密度 ρ物', 'kg/m³', 600, 1), p('rho', '液体密度 ρ液', 'kg/m³', 1000, 1), p('d', '物体厚度 d', 'm', 0.1, 0.001), p('c', '液体阻力系数', 'N·s/m', 2, 0), gp()], build: ballIntoWater },
  // Mechanics
  { id: 'slope-up', group: '斜面与摩擦', name: '物块冲上斜面', description: '上滑与下滑的加速度不同：a = g(sinθ ± μcosθ)', params: [p('theta', '倾角 θ', '°', 37, 1, 80), p('v0', '初速度 v₀', 'm/s', 4, 0.01), p('m', '质量 m', 'kg', 1, 0.01), p('mu', '动摩擦因数 μ', '', 0.25, 0, 2, 0.01), gp()], build: slopeUp },
  { id: 'incline-pulley', group: '连接体', name: '斜面上的连接体', description: '绳跨过斜面顶端的定滑轮：整体法与隔离法', params: [p('theta', '倾角 θ', '°', 30, 5, 70), p('m1', '斜面上物块 m₁', 'kg', 1, 0.01), p('m2', '悬挂物块 m₂', 'kg', 1, 0.01), p('mu', '动摩擦因数 μ', '', 0.1, 0, 2, 0.01), gp()], build: inclinePulley },
  { id: 'pursuit', group: '直线运动', name: '追及与相遇', description: '匀速与匀加速：速度相等时距离最大', params: [p('v', 'A 的速度 v', 'm/s', 4, 0), p('a', 'B 的加速度 a', 'm/s²', 2, 0.01), p('d', '初始距离 d', 'm', 6, 0), gp()], build: pursuit },
  { id: 'two-ropes', group: '力与平衡', name: '两绳悬挂重物', description: '三力平衡：T₁ = mg·sinβ/sin(α + β)', params: [p('alpha', '绳1与竖直方向夹角 α', '°', 30, 0, 80), p('beta', '绳2与竖直方向夹角 β', '°', 60, 0, 80), p('m', '重物质量 m', 'kg', 2, 0.01), gp()], build: twoRopes },
  { id: 'bouncing-ball', group: '碰撞', name: '弹跳的小球', description: '每次弹起高度为上次的 e² 倍', params: [p('h', '下落高度 h', 'm', 1, 0.05, 50), p('e', '恢复系数 e', '', 0.8, 0, 0.99, 0.05), p('m', '质量 m', 'kg', 0.1, 0.001), gp()], build: bouncingBall },
  { id: 'three-balls', group: '碰撞', name: '三球依次碰撞', description: '等质量弹性碰撞：速度依次交换', params: [p('v0', '初速度 v₀', 'm/s', 2, 0.05), p('m1', '质量 m₁', 'kg', 1, 0.01), p('m2', '质量 m₂', 'kg', 1, 0.01), p('m3', '质量 m₃', 'kg', 1, 0.01), p('e', '恢复系数 e', '', 1, 0, 1, 0.05)], build: threeBalls },
  { id: 'pendulum-collision', group: '动量守恒', name: '两摆球的碰撞', description: '最低点正碰：动量守恒，弹性碰撞交换速度', params: [p('L', '摆长 L', 'm', 1, 0.1, 3), p('theta0', '拉开角度 θ₀', '°', 30, 1, 80), p('m1', '摆球A质量 m₁', 'kg', 0.2, 0.001), p('m2', '摆球B质量 m₂', 'kg', 0.2, 0.001), p('e', '恢复系数 e', '', 1, 0, 1, 0.05), gp()], build: pendulumCollision },
  { id: 'vertical-spring', group: '振动', name: '竖直弹簧振子', description: '平衡位置 x₀ = mg/k，周期 T = 2π√(m/k)', params: [p('k', '劲度系数 k', 'N/m', 20, 0.01), p('m', '质量 m', 'kg', 0.5, 0.001), p('A', '振幅 A', 'm', 0.1, 0.001, 0.5), gp()], build: verticalSpring },
  { id: 'physical-pendulum', group: '刚体转动', name: '复摆', description: 'T = 2π√(I/(mgd))，细杆为 2π√(2L/(3g))', params: [p('L', '杆长 L', 'm', 1, 0.05, 5), p('theta0', '初始偏角 θ₀', '°', 5, 0.1, 90), p('m', '质量 m', 'kg', 1, 0.001), gp()], build: physicalPendulum },
  { id: 'double-pendulum', group: '振动', name: '双摆', description: '混沌运动，机械能守恒', params: [p('theta1', '杆1偏角 θ₁', '°', 90, -180, 180), p('theta2', '杆2偏角 θ₂', '°', 120, -180, 180), p('L1', '杆1长 L₁', 'm', 0.6, 0.05, 3), p('L2', '杆2长 L₂', 'm', 0.6, 0.05, 3), p('m1', '摆球1质量 m₁', 'kg', 1, 0.001), p('m2', '摆球2质量 m₂', 'kg', 1, 0.001), gp()], build: doublePendulum },
  { id: 'coupled-oscillators', group: '振动', name: '耦合振子', description: '两个简正模式，能量来回转移（拍）', params: [p('k', '弹簧劲度系数 k', 'N/m', 40, 0.01), p('kc', '耦合弹簧 k_c', 'N/m', 4, 0), p('m', '物块质量 m', 'kg', 0.5, 0.001), p('A', '初始位移 A', 'm', 0.15, 0.001, 0.5), gp()], build: coupledOscillators },
  { id: 'binary-star', group: '万有引力', name: '双星', description: '绕共同质心转动，r₁/r₂ = M₂/M₁（G = 1）', params: [p('M1', '星体1质量 M₁', 'kg', 300, 0.1), p('M2', '星体2质量 M₂', 'kg', 100, 0.1), p('d', '两星距离 d', 'm', 4, 0.5, 50)], build: binaryStar },
  { id: 'kepler', group: '万有引力', name: '开普勒第三定律', description: '两颗行星：T²/r³ 相同（G = 1）', params: [p('M', '恒星质量 M', 'kg', 1000, 1), p('r1', '内行星轨道半径 r₁', 'm', 3, 0.5, 50), p('r2', '外行星轨道半径 r₂', 'm', 6, 0.5, 100)], build: kepler }
]
