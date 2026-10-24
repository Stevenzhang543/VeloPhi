/**
 * Variable forces (decision D14): expression checks with readable messages, analytic solutions on a
 * smooth floor, exact location of jumps, and the work integral of the energy ledger.
 */
import { describe, expect, it } from 'vitest'
import { addBody, addConnector, addGround, anchor, emptyScene } from '../src/core/scene/build'
import type { ForceDef, Scene } from '../src/core/scene/types'
import { exactStateAt, frameLedger, frameState, simulate } from '../src/core/solver/simulation'
import { FORCE_EXPR_HELP, checkForceExpr, compileForceExpr } from '../src/core/solver/forceExpr'
import { parseScene, serializeScene, validateScene } from '../src/core/scene/io'

/** Block of mass m on a smooth floor with a force (fx, fy) at its centre. */
function floorScene(m: number, fx: string, fy = '0', duration = 3): Scene {
  const s = emptyScene('force')
  s.settings.gravity = { x: 0, y: -9.8 }
  addGround(s, { id: 'ground', top: 0, left: -5, right: 50 })
  const b = addBody(s, { id: 'block', name: '物块', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0, y: 0.1 }, mass: m })
  addConnector<ForceDef>(s, { id: 'F', name: '拉力', type: 'force', a: anchor(b), force: { x: 0, y: 0 }, expr: { x: fx, y: fy } })
  s.settings.duration = duration
  return s
}

describe('force expressions are checked', () => {
  const bad: Array<[string, string]> = [
    ['', '为空'],
    ['x + vx', '量纲不同'],
    ['5*sin(t)', '无量纲'],
    ['foo(t)', '未知函数'],
    ['2*q', '未知变量'],
    ['2*(t', '应为'],
    ['x', '应为力'],
    ['t', '应为力'],
    ['vx < 1', '比较'],
    ['if(t, 5, 0)', '比较式'],
    ['ellipK(t)', '不能使用'],
    ['3 4', '多余字符'],
    ['sin', '括号']
  ]
  for (const [src, fragment] of bad) {
    it(`rejects “${src}”`, () => {
      const r = checkForceExpr(src)
      expect(r.ok).toBe(false)
      expect(r.message, r.message).toContain(fragment)
    })
  }
  const good = ['10*sin(2*pi*t)', '5*step(t - 1)', '-0.5*vx', 'if(t < 2, 3*t, 6)', '-m*g*0.1*sign(vx)', 'm*g', '2*e^(-t/3)', 'clamp(4*t, 0, 3)', 'atan2(y, x)*10', 'sqrt(vx^2 + vy^2)*2', '-3*v*vx', '7']
  for (const src of good) it(`accepts “${src}”`, () => expect(checkForceExpr(src)).toEqual({ ok: true }))

  it('the help lists exactly what the parser accepts', () => {
    for (const v of FORCE_EXPR_HELP.variables) expect(checkForceExpr(`2*${v}`).ok, v).toBe(true)
    for (const f of FORCE_EXPR_HELP.functions) expect(FORCE_EXPR_HELP.functionInfo.some(i => i.name.includes(f + '(')), f).toBe(true)
    expect(FORCE_EXPR_HELP.constants).toEqual(['pi', 'e'])
  })

  it('scene validation reports the component and the problem', () => {
    const s = floorScene(1, 'x + vx')
    expect(() => validateScene(s)).toThrow(/Fx 表达式有误/)
  })

  it('switches are numbered in order and frozen branches give the exact values', () => {
    const c = compileForceExpr('step(t - 1)*3 + 2*abs(t - 2) + if(t <= 0.5, 1, 0)', 4)
    expect(c.switches.map(s => [s.kind, s.index, s.jump])).toEqual([['step', 4, true], ['abs', 5, false], ['if', 6, true]])
    const env = new Float64Array(10)
    env[0] = 1.5
    expect(c.fn(env, null)).toBe(3 + 1 + 0)
    const sw = [0, 0, 0, 0, 1, -1, -1]
    expect(c.fn(env, sw)).toBe(3 + 1 + 0)
    // A frozen branch is used even past the switch point (smooth continuation inside a segment)
    expect(c.fn(env, [0, 0, 0, 0, -1, -1, -1])).toBe(0 + 1 + 0)
  })
})

describe('variable forces in the solver', () => {
  it('F = F0·sin(ωt) on a smooth floor: v(t) and x(t) agree with the integrals (rel ≤ 1e-8)', () => {
    const m = 2, F0 = 5, w = 3
    const rec = simulate(floorScene(m, `${F0}*sin(${w}*t)`, '0', 4))
    expect(rec.error).toBeNull()
    const n = rec.system.n
    const scaleV = F0 / (m * w), scaleX = scaleV * 4
    let worstV = 0, worstX = 0
    for (let k = 0; k < rec.frameCount; k += 7) {
      const t = k * rec.dt
      const X = frameState(rec, k)
      const v = scaleV * (1 - Math.cos(w * t))
      const x = scaleV * (t - Math.sin(w * t) / w)
      worstV = Math.max(worstV, Math.abs(X[3 * n] - v) / scaleV)
      worstX = Math.max(worstX, Math.abs(X[0] - x) / scaleX)
      expect(X[rec.system.timeSlot]).toBe(t)
    }
    expect(worstV).toBeLessThan(1e-8)
    expect(worstX).toBeLessThan(1e-8)
    // Between frames too
    const t = 1.2345678
    const X = exactStateAt(rec, t)
    expect(X[rec.system.timeSlot]).toBe(t)
    expect(Math.abs(X[3 * n] - scaleV * (1 - Math.cos(w * t))) / scaleV).toBeLessThan(1e-8)
  })

  it('the work of the expression force enters the energy ledger', () => {
    const rec = simulate(floorScene(2, '5*sin(3*t) + 2', '1*cos(1*t)', 3))
    const L0 = frameLedger(rec, 0)
    let worst = 0, scale = 1
    for (let k = 0; k < rec.frameCount; k++) {
      const L = frameLedger(rec, k)
      worst = Math.max(worst, Math.abs(L.balance - L0.balance))
      scale = Math.max(scale, Math.abs(L.kinetic), Math.abs(L.appliedWork))
    }
    expect(frameLedger(rec, rec.frameCount - 1).appliedWork).toBeGreaterThan(1)
    expect(worst / scale).toBeLessThan(1e-8)
  })

  it('a step at t = 1 s is located to 1e-12 s and recorded as a switch', () => {
    const m = 1.5, F = 3
    for (const t1 of [1, 1.0000003, 0.7071067811865476]) {
      const rec = simulate(floorScene(m, `${F}*step(t - ${t1})`, '0', 2))
      expect(rec.error).toBeNull()
      const sw = rec.events.filter(e => e.changes.some(c => c.type === 'switch'))
      expect(sw.length).toBe(1)
      expect(Math.abs(sw[0].t - t1)).toBeLessThanOrEqual(1e-12)
      const c = sw[0].changes.find(c => c.type === 'switch')!
      expect(c.subject).toBe('F')
      expect(c.kink).toBe(false)
      expect(c.branch).toBe(1)
      expect(sw[0].triggers).toContain('switch')
      const n = rec.system.n
      const X = frameState(rec, rec.frameCount - 1)
      const T = (rec.frameCount - 1) * rec.dt
      expect(Math.abs(X[3 * n] - F / m * (T - t1))).toBeLessThan(1e-9)
    }
  })

  it('if(), kinks and state variables: piecewise force and linear damping', () => {
    const rec = simulate(floorScene(1, 'if(t < 0.5, 2, -1) - 0*abs(t - 1)', '0', 1.5))
    const kinds = rec.events.flatMap(e => e.changes.filter(c => c.type === 'switch').map(c => [Math.round(e.t * 1e6) / 1e6, c.kink]))
    expect(kinds).toEqual([[0.5, false], [1, true]])
    const n = rec.system.n
    // v(1.5) = 2·0.5 − 1·1.0
    expect(Math.abs(frameState(rec, rec.frameCount - 1)[3 * n] - 0)).toBeLessThan(1e-9)
    // Damping −c·vx with v0: v = v0·e^{−ct/m}
    const s = floorScene(2, '-0.8*vx', '0', 2)
    s.bodies[1].velocity = { x: 3, y: 0 }
    const r2 = simulate(s)
    const X = frameState(r2, r2.frameCount - 1)
    expect(Math.abs(X[3 * r2.system.n] - 3 * Math.exp(-0.8 * 2 / 2)) / 3).toBeLessThan(1e-8)
  })

  it('a force that keeps toggling stops with a clear message', () => {
    const s = floorScene(1, '-2*sign(vx)', '0', 1)
    s.bodies[1].velocity = { x: 1, y: 0 }
    const rec = simulate(s)
    expect(rec.error).toMatch(/反复切换|抖振/)
    expect(Math.abs(rec.events[0].t - 0.5)).toBeLessThan(1e-9)
  })

  it('a force without a finite value stops the run with the time', () => {
    const rec = simulate(floorScene(1, '2*sqrt(1 - t)', '0', 2))
    expect(rec.error).toMatch(/没有有限值/)
    expect(rec.frameCount).toBeGreaterThan(500)
  })

  it('scenes with expressions are deterministic and survive save/load', () => {
    const s = floorScene(2, '5*sin(3*t)*step(t - 0.25)', '0', 1)
    const a = simulate(s), b = simulate(parseScene(serializeScene(s)).scene)
    expect(a.hash).toBe(b.hash)
    expect(parseScene(serializeScene(s)).scene.connectors.find(c => c.type === 'force')).toMatchObject({ expr: { x: '5*sin(3*t)*step(t - 0.25)', y: '0' } })
  })
})

describe('force readouts', () => {
  it('<force>.Fx/.Fy/.F/.P read the applied variable force exactly', async () => {
    const { listQuantities, makeContext, evaluateQuantity } = await import('../src/core/observe/quantities')
    const rec = simulate(floorScene(2, '5*sin(3*t)', '-1', 2))
    const ids = listQuantities(rec.system).map(q => q.id)
    expect(ids).toEqual(expect.arrayContaining(['F.Fx', 'F.Fy', 'F.F', 'F.P']))
    const n = rec.system.n
    for (const k of [0, 300, 900]) {
      const ctx = makeContext(rec, k)
      const t = k * rec.dt
      expect(Math.abs(evaluateQuantity(ctx, 'F.Fx') - 5 * Math.sin(3 * t))).toBeLessThan(1e-14)
      expect(evaluateQuantity(ctx, 'F.Fy')).toBe(-1)
      expect(Math.abs(evaluateQuantity(ctx, 'F.P') - evaluateQuantity(ctx, 'F.Fx') * frameState(rec, k)[3 * n])).toBeLessThan(1e-15)
    }
  })
})
