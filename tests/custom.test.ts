/**
 * Custom (expression) quantities (manual 26.51, D39, D41): compiling against a scene (names and ids, units from the
 * dimension check, readable errors), values equal to the built-in quantities they combine, the scene file
 * round trip, and the quantity list that every panel and export reads.
 */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../src/templates'
import { simulate } from './reference/core/solver/simulation'
import { customQuantities, customScope, evaluateQuantity, listQuantities, makeContext, quantitySeries } from './reference/core/observe/quantities'
import { compileCustom, nextCustomId } from './reference/core/observe/custom'
import { parseScene, serializeScene } from '../src/core/scene/io'

const scene = buildTemplate('collision-1d', {})
scene.customQuantities = [
  { id: 'gap', name: '间距', expr: 'x(B) - x(A)' },
  { id: 'etot', name: '总机械能', expr: 'ek(小球A) + ek(小球B)' },
  { id: 'half', name: 'half time', expr: 't/2' },
  { id: 'bad', name: 'broken', expr: 'x(A) + t' }
]
const rec = simulate(scene)
const sys = rec.system

describe('compiling custom quantities', () => {
  const scope = customScope(sys)
  const unit = (e: string) => compileCustom(e, scope).unit
  const error = (e: string) => { try { compileCustom(e, scope); return '' } catch (err) { return (err as Error).message } }

  it('infers units from the dimension check', () => {
    expect(unit('ek(A) + ep(A)')).toBe('J')
    expect(unit('x(B) - x(A)')).toBe('m')
    expect(unit('x(A) - 2')).toBe('m')
    expect(unit('2*x(A) + 1')).toBe('m')
    expect(unit('vx(A)/t')).toBe('m/s²')
    expect(unit('sqrt(vx(A)^2 + vy(A)^2)')).toBe('m/s')
    expect(unit('px(A) + px(B)')).toBe('kg·m/s')
    expect(unit('sin(2*t)')).toBe('')
    expect(unit('E - Ek')).toBe('J')
    expect(unit('g*t')).toBe('m/s')
    expect(unit('max(x(A), x(B))')).toBe('m')
    expect(unit('if(t < 1, x(A), x(B))')).toBe('m')
  })

  it('names objects by id or name, in any spacing', () => {
    expect(unit('x( 小球B ) - x(A)')).toBe('m')
    expect(unit('N(A, B) + N(小球B,小球A)')).toBe('N')
    expect(unit('heat(B, A)')).toBe('J')
  })

  it('reports what is wrong', () => {
    expect(error('')).toContain('表达式为空')
    expect(error('x(C)')).toContain('找不到')
    expect(error('x(A) + t')).toContain('量纲不一致')
    expect(error('T(A)')).toContain('本场景中没有这个量')
    expect(error('theta(A)')).toContain('本场景中没有这个量')
    expect(error('N(A)')).toContain('本场景中没有这个量')
    expect(error('slide(A)')).toContain('两个物体')
    expect(error('x(A, B)')).toContain('一个对象')
    expect(error('foo + 1')).toContain('未知的量')
    expect(error('__q0')).toContain('下划线')
    expect(error('sin(x(A))')).toContain('无量纲')
    expect(error('x(A) +')).not.toBe('')
  })
})

describe('custom quantities in a recording', () => {
  it('are listed (only those that compile) with their units', () => {
    const list = listQuantities(sys).filter(q => q.group === '自定义')
    expect(list.map(q => [q.id, q.unit])).toEqual([['custom.gap', 'm'], ['custom.etot', 'J'], ['custom.half', 's']])
    const entries = customQuantities(sys)
    expect(entries.find(e => e.def.id === 'bad')!.error).toContain('量纲不一致')
    expect(customQuantities(sys)).toBe(entries)
  })

  it('equal the built-in quantities they combine at every frame', () => {
    for (const k of [0, Math.floor(rec.frameCount / 3), rec.frameCount - 1]) {
      const ctx = makeContext(rec, k)
      expect(evaluateQuantity(ctx, 'custom.gap')).toBe(evaluateQuantity(ctx, 'B.x') - evaluateQuantity(ctx, 'A.x'))
      expect(evaluateQuantity(ctx, 'custom.etot')).toBe(evaluateQuantity(ctx, 'A.ek') + evaluateQuantity(ctx, 'B.ek'))
      expect(evaluateQuantity(ctx, 'custom.half')).toBe(k * rec.dt / 2)
      expect(evaluateQuantity(ctx, 'custom.bad')).toBeNaN()
      expect(evaluateQuantity(ctx, 'custom.none')).toBeNaN()
    }
    const s = quantitySeries(rec, ['custom.gap', 'A.x', 'B.x'], 0, rec.frameCount - 1, 10)
    s.values[0].forEach((v, i) => expect(v).toBe(s.values[2][i] - s.values[1][i]))
  })
})

describe('scene files', () => {
  it('keep custom quantities and check their ids', () => {
    const back = parseScene(serializeScene(scene)).scene
    expect(back.customQuantities).toEqual(scene.customQuantities)
    const text = serializeScene(scene)
    expect(text.indexOf('"customQuantities"')).toBeGreaterThan(text.indexOf('"annotations"'))
    const plain = buildTemplate('collision-1d', {})
    expect('customQuantities' in parseScene(serializeScene(plain)).scene).toBe(false)
    const dup = { ...scene, customQuantities: [{ id: 'a', name: 'a', expr: 't' }, { id: 'a', name: 'b', expr: 't' }] }
    expect(() => parseScene(serializeScene(dup))).toThrow()
    const badId = { ...scene, customQuantities: [{ id: 'custom.x', name: 'a', expr: 't' }] }
    expect(() => parseScene(serializeScene(badId))).toThrow()
  })

  it('give new quantities fresh ids', () => {
    expect(nextCustomId([])).toBe('q1')
    expect(nextCustomId([{ id: 'q1', name: '', expr: '' }, { id: 'q3', name: '', expr: '' }])).toBe('q2')
  })
})
