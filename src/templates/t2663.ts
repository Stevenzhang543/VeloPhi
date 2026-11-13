/**
 * 26.63 templates (D234): two for the rope that breaks at a tension limit (D231) and five "illuminating cases" — small
 * scenes whose outcome contradicts a common belief, used by the misconception index and the class tally
 * (src/teaching/cases.ts). Each one's textbook answer is checked in tests/templates2663.test.ts.
 *  - rope-break-pendulum: a pendulum released at θ₀; T = mg(3cos φ − 2cos θ₀) reaches T_max, the rope breaks and the
 *    bob goes on as a projectile;
 *  - rope-break-circle: a ball whirled on a smooth table (top view) is sped up by a push along its velocity; at
 *    m·v²/r = T_max the rope breaks and the ball leaves along the tangent, in a straight line;
 *  - drop-vs-throw: one ball dropped, one thrown horizontally from the same height — they land together;
 *  - fall-two-masses: a heavy and a light ball of the same size fall side by side, with or without air drag;
 *  - monkey-hunter: a ball aimed straight at a target that drops as it is fired — it hits for every v₀ that reaches;
 *  - ramp-pull: a pull that grows with time, F = k·t — static friction follows it up to μs·N, then the block slides;
 *  - two-blocks-push: F pushes A, A pushes B on a smooth floor — the contact force is F·m_B/(m_A + m_B).
 */
import { tl } from '../i18n'
import type { ForceDef, RopeDef, Scene } from '../core/scene/types'
import { addBody, addConnector, addGround, anchor, defaultGravity, emptyScene } from '../core/scene/build'
import type { TemplateInfo, TemplateParam } from './index'

const p = (key: string, label: string, unit: string, value: number, min?: number, max?: number, step?: number): TemplateParam => ({ key, label, unit, value, min, max, step })
const gp = (): TemplateParam => p('g', '重力加速度 g', 'm/s²', defaultGravity(), 0)
const DEG = Math.PI / 180
const SMOOTH = { muS: 0, muK: 0, restitution: 0 }

/** 摆线被拉断：pivot H above the ground; the rope bears T_max. */
function ropeBreakPendulum(v: Record<string, number>): Scene {
  const s = emptyScene(tl('摆线被拉断'))
  s.description = tl('小球用长 L 的轻绳悬挂，从偏角 θ₀ 处由静止释放。摆到偏角 φ 时绳的拉力 T = mg(3cos φ − 2cos θ₀)，越靠近最低点越大；拉力达到绳能承受的最大值 T_max 时绳断开，小球带着那一刻的速度做抛体运动。T_max ≥ mg(3 − 2cos θ₀) 时绳不会断。')
  const th = v.theta0 * DEG, L = v.L, r = 0.03
  const pivot = { x: 0, y: v.H }
  addGround(s, { id: 'ground', top: 0, left: -6, right: 6, material: SMOOTH })
  const bob = addBody(s, { id: 'bob', name: tl('小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: pivot.x + L * Math.sin(th), y: pivot.y - L * Math.cos(th) }, mass: v.m, material: SMOOTH })
  addConnector<RopeDef>(s, { id: 'rope', name: tl('摆线'), type: 'rope', a: anchor(null, pivot), b: anchor(bob), pulleys: [], length: null, maxTension: v.Tmax })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 3
  s.settings.energyZeroY = r
  s.view = { center: { x: -0.4, y: v.H / 2 + 0.1 }, pixelsPerMeter: Math.max(40, Math.min(220, 520 / Math.max(v.H + 0.6, 1))) }
  s.watch = ['rope.T', 'bob.v', 'bob.x', 'bob.y']
  s.extra = { pivot }
  return s
}

/** 绳断后沿切线飞出（俯视）：a push of constant size along the velocity speeds the ball up until the rope breaks. */
function ropeBreakCircle(v: Record<string, number>): Scene {
  const s = emptyScene(tl('绳断后沿切线飞出（俯视）'))
  s.description = tl('光滑水平桌面上（俯视图），小球用长 r 的轻绳系在中心的钉子上转动，沿速度方向的推力 P 使它越转越快。绳的拉力提供向心力 T = mv²/r；拉力达到 T_max 时绳断开。此后没有力改变速度的方向，小球沿断开时的切线做直线运动——既不沿半径向外，也不继续转弯。')
  const ball = addBody(s, { id: 'ball', name: tl('小球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.04 }, position: { x: v.r, y: 0 }, velocity: { x: 0, y: v.v0 }, mass: v.m })
  addConnector<RopeDef>(s, { id: 'rope', name: tl('绳'), type: 'rope', a: anchor(null, { x: 0, y: 0 }), b: anchor(ball), pulleys: [], length: null, maxTension: v.Tmax })
  addConnector<ForceDef>(s, { id: 'push', name: tl('推力 P'), type: 'force', a: anchor(ball), force: { x: 0, y: v.P }, expr: { x: `${v.P}*vx/v`, y: `${v.P}*vy/v` } })
  s.settings.gravity = { x: 0, y: 0 }
  // speed at the break: √(T_max·r/m); the time to reach it under the push, then about one more turn's worth of straight flight
  const vb = Math.sqrt(Math.max(v.Tmax * v.r / v.m, v.v0 * v.v0))
  const tb = v.P > 0 ? Math.max(0, (vb - v.v0) * v.m / v.P) : 0
  s.settings.legacyDuration = Math.min(120, tb + 4 * v.r / Math.max(vb, 1e-3) + 0.3)
  s.view = { center: { x: 0, y: 0 }, pixelsPerMeter: Math.max(20, Math.min(300, 110 / Math.max(v.r, 0.05))) }
  s.watch = ['ball.v', 'rope.T', 'ball.x', 'ball.y']
  return s
}

/** 平抛与自由落体：A dropped, B thrown horizontally, both from height h. */
function dropVsThrow(v: Record<string, number>): Scene {
  const s = emptyScene(tl('平抛与自由落体同时落地'))
  s.description = tl('小球 A 从高 h 处由静止释放，同一时刻小球 B 从同一高度以 v₀ 水平抛出（不计空气阻力）。两球在竖直方向都做自由落体：任何时刻高度相同，同时落地，t = √(2h/g)；B 的水平位移 x = v₀t。')
  const r = 0.04
  addGround(s, { id: 'ground', top: 0, left: -2, right: 30, material: SMOOTH })
  addBody(s, { id: 'A', name: tl('小球A'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: -0.2, y: v.h + r }, mass: v.m, material: SMOOTH, color: '#ef4444' })
  addBody(s, { id: 'B', name: tl('小球B'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 0, y: v.h + r }, velocity: { x: v.v0, y: 0 }, mass: v.m, material: SMOOTH, color: '#2563eb' })
  s.settings.gravity = { x: 0, y: -v.g }
  const t = Math.sqrt(2 * v.h / Math.max(v.g, 1e-3))
  s.settings.legacyDuration = Math.min(60, t + 0.4)
  s.settings.energyZeroY = r
  const reach = v.v0 * t
  s.view = { center: { x: reach / 2 - 0.1, y: v.h / 2 }, pixelsPerMeter: Math.max(10, Math.min(200, Math.min(900 / Math.max(reach + 1, 1), 480 / Math.max(v.h + 0.5, 0.5)))) }
  s.watch = ['A.y', 'B.y', 'B.x', 'A.vy', 'B.vy']
  return s
}

/** 重球与轻球同时下落：same size, masses m₁ and m₂, linear drag b on both (0: none). */
function fallTwoMasses(v: Record<string, number>): Scene {
  const s = emptyScene(tl('重球与轻球同时下落'))
  s.description = tl('大小相同、质量分别为 m₁ 和 m₂ 的两个小球从同一高度 h 同时由静止释放。不计空气阻力（b = 0）时加速度都是 g，同时落地；有空气阻力 f = bv 时，同样的阻力对轻球的减速作用更大（a = g − bv/m），重球先落地。')
  const r = 0.06
  addGround(s, { id: 'ground', top: 0, left: -2, right: 2, material: SMOOTH })
  const drag = v.b > 0 ? { linear: v.b, quadratic: 0 } : undefined
  addBody(s, { id: 'heavy', name: tl('重球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: -0.25, y: v.h + r }, mass: v.m1, material: SMOOTH, color: '#b45309', ...(drag ? { drag } : {}) })
  addBody(s, { id: 'light', name: tl('轻球'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 0.25, y: v.h + r }, mass: v.m2, material: SMOOTH, color: '#0ea5e9', ...(drag ? { drag } : {}) })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = Math.min(120, Math.sqrt(2 * v.h / Math.max(v.g, 1e-3)) * (v.b > 0 ? 2.5 : 1) + 0.4)
  s.settings.energyZeroY = r
  s.view = { center: { x: 0, y: v.h / 2 }, pixelsPerMeter: Math.max(10, Math.min(200, 480 / Math.max(v.h + 0.5, 0.5))) }
  s.watch = ['heavy.y', 'light.y', 'heavy.vy', 'light.vy']
  return s
}

/** 猎人与猴子：a ball fired from the origin straight at a target at (d, h) that is released at the same instant. */
function monkeyHunter(v: Record<string, number>): Scene {
  const s = emptyScene(tl('猎人与猴子'))
  s.description = tl('子弹从枪口对准树上的猴子射出，同一时刻猴子松手下落（不计空气阻力）。子弹和猴子在竖直方向相对各自“没有重力时的位置”都下落 ½gt²，所以只要子弹能在猴子落地前飞过水平距离 d，就一定击中——与 v₀ 的大小无关。击中时刻 t = √(d² + h²)/v₀。')
  const r = 0.02
  const dist = Math.hypot(v.d, v.h)
  addGround(s, { id: 'ground', top: -0.6, left: -1, right: v.d + 2, material: SMOOTH })
  addBody(s, { id: 'bullet', name: tl('子弹'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: r }, position: { x: 0, y: 0 }, velocity: { x: v.v0 * v.d / dist, y: v.v0 * v.h / dist }, mass: 0.05, material: SMOOTH, color: '#ef4444' })
  addBody(s, { id: 'monkey', name: tl('猴子'), kind: 'particle', role: 'ball', shape: { type: 'circle', radius: 0.06 }, position: { x: v.d, y: v.h }, mass: 2, material: SMOOTH, color: '#b45309' })
  s.contactPairs.push({ a: 'bullet', b: 'monkey', muS: 0, muK: 0, restitution: 0 })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = Math.min(30, dist / Math.max(v.v0, 1e-3) + 0.5)
  s.settings.stopAt = null
  s.view = { center: { x: v.d / 2, y: v.h / 2 - 0.2 }, pixelsPerMeter: Math.max(10, Math.min(200, Math.min(900 / Math.max(v.d + 2, 1), 460 / Math.max(v.h + 1.4, 1)))) }
  s.watch = ['bullet.y', 'monkey.y', 'bullet.x']
  return s
}

/** 逐渐增大的拉力：F = k·t on a block on a rough floor (μs > μk). */
function rampPull(v: Record<string, number>): Scene {
  const s = emptyScene(tl('逐渐增大的拉力与静摩擦'))
  s.description = tl('粗糙水平面上质量 m 的物块受水平拉力 F = kt（从零均匀增大）。物块不动时静摩擦力始终等于拉力 f = F——不是 μsN；拉力超过最大静摩擦力 μs·mg 的时刻 t₁ = μs·mg/k 物块开始滑动，摩擦力变为较小的滑动摩擦力 μk·mg，加速度从零突变为 (μs − μk)g。')
  addGround(s, { id: 'ground', top: 0, left: -1, right: 40, material: { muS: v.muS, muK: v.muK } })
  const blk = addBody(s, { id: 'block', name: tl('物块'), role: 'block', shape: { type: 'box', width: 0.3, height: 0.2 }, position: { x: 0.15, y: 0.1 }, mass: v.m, fixedRotation: true, material: { muS: v.muS, muK: v.muK } })
  addConnector<ForceDef>(s, { id: 'pull', name: tl('拉力'), type: 'force', a: anchor(blk), force: { x: 0, y: 0 }, expr: { x: `${v.k}*t`, y: '0' } })
  s.settings.gravity = { x: 0, y: -v.g }
  const t1 = v.muS * v.m * v.g / Math.max(v.k, 1e-6)
  s.settings.legacyDuration = Math.min(120, t1 * 1.6 + 0.5)
  s.view = { center: { x: 1.2, y: 0.5 }, pixelsPerMeter: 130 }
  s.watch = ['pull.F', 'contact.block|ground.f', 'block.ax', 'block.vx']
  return s
}

/** 推力的传递：F pushes A, A pushes B (both boxes on a smooth floor). */
function twoBlocksPush(v: Record<string, number>): Scene {
  const s = emptyScene(tl('两物块间的推力'))
  s.description = tl('光滑水平面上并排放着物块 A（质量 m_A）和 B（质量 m_B），水平推力 F 作用在 A 上。两物块一起加速 a = F/(m_A + m_B)；A 对 B 的推力只需要让 B 获得这个加速度：N = m_B·a = F·m_B/(m_A + m_B)，小于 F。')
  const w = 0.3, hgt = 0.24
  addGround(s, { id: 'ground', top: 0, left: -1, right: 40, material: SMOOTH })
  const A = addBody(s, { id: 'A', name: tl('物块A'), role: 'block', shape: { type: 'box', width: w, height: hgt }, position: { x: w / 2, y: hgt / 2 }, mass: v.mA, fixedRotation: true, material: SMOOTH, color: '#ef4444' })
  addBody(s, { id: 'B', name: tl('物块B'), role: 'block', shape: { type: 'box', width: w, height: hgt }, position: { x: w + w / 2, y: hgt / 2 }, mass: v.mB, fixedRotation: true, material: SMOOTH, color: '#2563eb' })
  s.contactPairs.push({ a: 'A', b: 'B', muS: 0, muK: 0, restitution: 0 })
  addConnector<ForceDef>(s, { id: 'push', name: tl('推力 F'), type: 'force', a: anchor(A, { x: -w / 2, y: 0 }), force: { x: v.F, y: 0 } })
  s.settings.gravity = { x: 0, y: -v.g }
  s.settings.legacyDuration = 2
  s.view = { center: { x: 2, y: 0.6 }, pixelsPerMeter: 120 }
  s.watch = ['A.ax', 'B.ax', 'contact.A|B.N', 'A.vx']
  return s
}

export const TEMPLATES_2663: TemplateInfo[] = [
  { id: 'rope-break-pendulum', group: '圆周运动', name: '摆线被拉断', description: 'T = mg(3cos φ − 2cos θ₀) 达到 T_max 时绳断，之后做抛体运动', params: [p('L', '绳长 L', 'm', 1, 0.1, 5), p('theta0', '释放偏角 θ₀', '°', 60, 5, 120), p('m', '小球质量 m', 'kg', 0.5, 0.001), p('Tmax', '绳的最大拉力 T_max', 'N', 9, 0.01), p('H', '悬点高度 H', 'm', 2, 0.5, 20), gp()], build: ropeBreakPendulum },
  { id: 'rope-break-circle', group: '圆周运动', name: '绳断后沿切线飞出（俯视）', description: 'mv²/r = T_max 时绳断，小球沿切线做直线运动', params: [p('r', '半径 r', 'm', 0.5, 0.05, 5), p('v0', '初速度 v₀', 'm/s', 1, 0.05), p('m', '小球质量 m', 'kg', 0.2, 0.001), p('P', '切向推力 P', 'N', 0.4, 0), p('Tmax', '绳的最大拉力 T_max', 'N', 3.6, 0.01)], build: ropeBreakCircle },
  { id: 'drop-vs-throw', group: '抛体', name: '平抛与自由落体同时落地', description: '竖直方向都是自由落体：t = √(2h/g)，与 v₀ 无关', params: [p('h', '高度 h', 'm', 1.25, 0.1, 50), p('v0', 'B 的水平初速度 v₀', 'm/s', 3, 0, 50), p('m', '质量 m', 'kg', 0.1, 0.001), gp()], build: dropVsThrow },
  { id: 'fall-two-masses', group: '抛体', name: '重球与轻球同时下落', description: '无阻力时同时落地；有阻力 f = bv 时重球先落地', params: [p('h', '高度 h', 'm', 2, 0.1, 100), p('m1', '重球质量 m₁', 'kg', 2, 0.001), p('m2', '轻球质量 m₂', 'kg', 0.2, 0.001), p('b', '阻力系数 b', 'N·s/m', 0, 0), gp()], build: fallTwoMasses },
  { id: 'monkey-hunter', group: '抛体', name: '猎人与猴子', description: '对准猴子射击、猴子同时下落：必定击中，t = √(d² + h²)/v₀', params: [p('d', '水平距离 d', 'm', 4, 0.5, 100), p('h', '猴子的高度 h', 'm', 3, 0.2, 100), p('v0', '子弹初速度 v₀', 'm/s', 10, 0.5, 500), gp()], build: monkeyHunter },
  { id: 'ramp-pull', group: '力与平衡', name: '逐渐增大的拉力与静摩擦', description: 'F = kt：静摩擦力等于拉力，直到 μs·mg；滑动后变为 μk·mg', params: [p('m', '质量 m', 'kg', 1, 0.01), p('muS', '最大静摩擦因数 μs', '', 0.5, 0, 2, 0.01), p('muK', '动摩擦因数 μk', '', 0.4, 0, 2, 0.01), p('k', '拉力增大的快慢 k', 'N/s', 2, 0.01), gp()], build: rampPull },
  { id: 'two-blocks-push', group: '连接体', name: '两物块间的推力', description: 'A 对 B 的推力 N = F·m_B/(m_A + m_B)', params: [p('F', '推力 F', 'N', 6, 0), p('mA', '质量 m_A', 'kg', 2, 0.01), p('mB', '质量 m_B', 'kg', 1, 0.01), gp()], build: twoBlocksPush }
]
