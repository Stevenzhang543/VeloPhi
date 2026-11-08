/**
 * 26.61: the tolerant JSON reader of model answers (src/ai/looseJson.ts) — the repairs it makes are reported, a cut-off
 * answer is closed and marked, and a text it cannot read comes back with line, column and context. A corpus of the
 * mistakes models make, and a fuzz over a real scene file.
 */
import { describe, expect, it } from 'vitest'
import { extractJsonObject, numberFromText, parseLoose } from '../../src/ai/looseJson'
import { buildTemplate } from '../../src/templates'
import { serializeScene } from '../../src/core/scene/io'

const val = (s: string) => { const r = parseLoose(s); if (!r.ok) throw new Error(`${r.error} at ${r.line}:${r.column} ${r.context}`); return r.value }

describe('almost-JSON', () => {
  it('reads the usual mistakes', () => {
    expect(val(`{'a': 1, b: 'x', "c": [1, 2, 3,], }`)).toEqual({ a: 1, b: 'x', c: [1, 2, 3] })
    expect(val('{"a": True, "b": None, "c": undefined, "d": False}')).toEqual({ a: true, b: null, c: null, d: false })
    expect(val('{\n  "a": 1\n  "b": 2\n}')).toEqual({ a: 1, b: 2 })
    expect(val('{"a": +1, "b": .5, "c": 2., "d": 0x10}')).toEqual({ a: 1, b: 0.5, c: 2, d: 16 })
    expect(val('{“name”： “小球”， “m”： 2}')).toEqual({ name: '小球', m: 2 })
    expect(val('{"a": 1 // one\n, /* two */ "b": 2 # three\n}')).toEqual({ a: 1, b: 2 })
    expect(val('{"kind": rigid, "role": block}')).toEqual({ kind: 'rigid', role: 'block' })
    expect(val('{"a": NaN, "b": -Infinity}')).toEqual({ a: null, b: null })
  })

  it('evaluates arithmetic and converts units to SI', () => {
    const v = val('{"a": Math.PI/6, "b": 2*0.5, "c": sqrt(3)/2, "d": 30°, "e": 25 cm, "f": 30*π/180, "g": 2 kg, "h": -9.8 m/s², "i": 2^3}') as Record<string, number>
    expect(v.a).toBeCloseTo(Math.PI / 6)
    expect(v.b).toBe(1)
    expect(v.c).toBeCloseTo(Math.sqrt(3) / 2)
    expect(v.d).toBeCloseTo(Math.PI / 6)
    expect(v.e).toBeCloseTo(0.25)
    expect(v.f).toBeCloseTo(Math.PI / 6)
    expect(v.g).toBe(2)
    expect(v.h).toBe(-9.8)
    expect(v.i).toBe(8)
    expect(numberFromText('2 kg')).toBe(2)
    expect(numberFromText('pi/4')).toBeCloseTo(Math.PI / 4)
    expect(numberFromText('b1')).toBeNull()
    expect(numberFromText('2 apples and more')).toBeNull()
  })

  it('strings: raw line breaks, LaTeX, invalid escapes, a string left open', () => {
    expect(val('{"t": "第一行\n第二行"}')).toEqual({ t: '第一行\n第二行' })
    expect((val('{"t": "v = \\frac{1}{2} \\theta \\times 3 \\pi"}') as { t: string }).t).toBe('v = \\frac{1}{2} \\theta \\times 3 \\pi')
    expect(val('{"a": "open\n  "b": 2}')).toEqual({ a: 'open', b: 2 })
  })

  it('a cut-off answer is closed and marked', () => {
    const r = parseLoose('{"bodies": [{"id": "a", "mass": 2}, {"id": "b", "ma')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.truncated).toBe(true)
    expect((r.value as { bodies: unknown[] }).bodies[0]).toEqual({ id: 'a', mass: 2 })
  })

  it('reports where it cannot read', () => {
    const r = parseLoose('{"a": 1,\n "b": :}')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.line).toBe(2)
    expect(r.context).toContain('⟨here⟩')
  })

  it('finds the object in an answer: thinking, prose, fences, several objects, a list', () => {
    const score = (o: Record<string, unknown>) => (o.bodies || o.scene ? 10 : 0)
    expect(extractJsonObject('<think>{"x": 1}</think>好的：\n```json\n{"scene": {"bodies": []}}\n```\n说明 {"note": 1}', score)?.value).toEqual({ scene: { bodies: [] } })
    expect(extractJsonObject('Here: {"a": {"b": 1}} and {"bodies": [1]}', score)?.value).toEqual({ bodies: [1] })
    expect(extractJsonObject('[{"a": 1}]')?.value).toEqual({ a: 1 })
    expect(extractJsonObject('no json here')).toBeNull()
    const cut = extractJsonObject('```json\n{"scene": {"bodies": [{"id": "a"}')
    expect(cut?.truncated).toBe(true)
  })

  it('fuzz: a real scene file with typical damage never throws and reads back the bodies', () => {
    const text = serializeScene(buildTemplate('incline'))
    const ref = JSON.parse(text) as { bodies: Array<{ id: string }> }
    let seed = 7
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    let read = 0
    for (let k = 0; k < 600; k++) {
      let s = text
      const kind = k % 6
      if (kind === 0) s = s.replace(/,(\s*[}\]])/g, ',$1').replace(/\}/g, () => (rnd() < 0.2 ? ',}' : '}'))
      if (kind === 1) s = s.replace(/"([a-zA-Z]+)":/g, (m, w: string) => (rnd() < 0.5 ? `${w}:` : m))
      if (kind === 2) s = s.replace(/,\n/g, m => (rnd() < 0.3 ? '\n' : m))
      if (kind === 3) s = s.replace(/"/g, () => (rnd() < 0.02 ? "'" : '"'))
      if (kind === 4) s = s.slice(0, Math.floor(rnd() * s.length))
      if (kind === 5) s = `模型说明：\n\`\`\`json\n${s}\n\`\`\`\n希望有帮助 {"x": 1}`
      const r = extractJsonObject(s, o => (Array.isArray(o.bodies) ? 10 : 0))
      if (kind !== 4 && kind !== 3) {
        expect(r, `kind ${kind}`).not.toBeNull()
        expect((r!.value.bodies as Array<{ id: string }>).map(b => b.id)).toEqual(ref.bodies.map(b => b.id))
      }
      if (r && Array.isArray(r.value.bodies)) read++
    }
    expect(read).toBeGreaterThan(450)
  })
})
