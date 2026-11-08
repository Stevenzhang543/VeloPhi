/**
 * 26.60 r2: scene files written by the Copilot's builder never crash the app. The reported failure ("Cannot read
 * properties of undefined (reading 'length')" on a board made of an arc and a flat part) came from a compound with an
 * arc part — arcs are now parts of compound shapes (D207) — and from shapes the normalizer could not read. Every
 * mutation of the prompt's examples (fields deleted, nulled, emptied, retyped) must come back as a problem the builder
 * can act on, never as an internal fault; and the usual slips (flat parts, degrees in radian fields, parts on the body)
 * are read as meant.
 */
import { describe, expect, it } from 'vitest'
const { prepareAiScene } = await import('../../src/ai/copilot/simScene')
const { SIM_EXAMPLES } = await import('../../src/ai/copilot/simPrompt')
const { EngineSession } = await import('../../src/engine/session')
const { parseScene, serializeScene } = await import('../../src/core/scene/io')

type J = unknown
const PI = Math.PI

/** A board of the screenshot: a quarter arc and a flat part as one movable body, a ball released at the rim. */
const ARC_BOARD = {
  format: 'velophi-scene', name: '木板上的圆弧与水平段', settings: { gravity: { x: 0, y: -9.8 } },
  bodies: [
    { id: 'ground', kind: 'static', shape: { type: 'box', width: 6, height: 0.2 }, position: { x: 1, y: -0.1 } },
    { id: 'board', name: '木板', kind: 'rigid', mass: 2, fixedRotation: true, position: { x: 0, y: 0.6 }, shape: { type: 'compound', parts: [
      { shape: { type: 'arc', radius: 0.5, thickness: 0.1, startDeg: 180, sweepDeg: 90 }, position: { x: 0, y: 0 }, angle: 0 },
      { shape: { type: 'box', width: 1.2, height: 0.1 }, position: { x: 0.6, y: -0.55 }, angle: 0 } ] } },
    { id: 'ball', kind: 'particle', mass: 0.5, shape: { type: 'circle', radius: 0.05 }, position: { x: -0.45, y: 0.6 } }
  ],
  questions: [{ prompt: 'v', target: { kind: 'extreme', id: 'ball.vx', which: 'max' }, unit: 'm/s' }]
}

const MUT: Array<[string, (v: J) => J]> = [
  ['delete', () => undefined], ['null', () => null], ['[]', () => []], ['{}', () => ({})], ['"x"', () => 'x'], ['0', () => 0], ['-1', () => -1],
  ['str', v => (typeof v === 'number' ? String(v) : v)], ['arr2obj', v => (Array.isArray(v) ? { ...v } : v)], ['obj2arr', v => (v && typeof v === 'object' && !Array.isArray(v) ? Object.values(v) : v)]
]
function paths(v: J, p: Array<string | number> = [], out: Array<Array<string | number>> = []) {
  if (p.length) out.push(p)
  if (Array.isArray(v)) v.forEach((x, i) => paths(x, [...p, i], out))
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) paths((v as Record<string, J>)[k], [...p, k], out)
  return out
}
function setAt(root: J, p: Array<string | number>, f: (v: J) => J): J {
  const c = JSON.parse(JSON.stringify(root)) as Record<string | number, J>
  let o = c
  for (let i = 0; i < p.length - 1; i++) o = o[p[i]] as Record<string | number, J>
  const k = p[p.length - 1]
  const nv = f(o[k])
  if (nv === undefined) { if (Array.isArray(o)) o.splice(k as number, 1); else delete o[k] } else o[k] = nv
  return c
}

describe('AI scene files (26.60 r2)', () => {
  it('no mutation of the examples is an internal fault', () => {
    let n = 0
    const faults: string[] = []
    for (const base of [...SIM_EXAMPLES.map(e => e.file), ARC_BOARD]) {
      for (const p of paths(base)) {
        for (const [name, f] of MUT) {
          n++
          let r
          try { r = prepareAiScene(setAt(base, p, f)) } catch (e) { faults.push(`${p.join('.')} ${name}: threw ${(e as Error).message}`); continue }
          if (!r.ok) {
            if (r.errors.some(e => e.includes('could not read this file'))) faults.push(`${p.join('.')} ${name}: ${r.errors[0]}`)
            expect(r.errors.length).toBeGreaterThan(0)
          }
        }
      }
    }
    expect(n).toBeGreaterThan(2500)
    expect(faults).toEqual([])
  }, 120000)

  it('a compound with an arc part loads, saves and runs (D207)', () => {
    const r = prepareAiScene(ARC_BOARD)
    if (!r.ok) throw new Error(r.errors.join('; '))
    const board = r.scene.bodies.find(b => b.id === 'board')!
    expect(board.shape.type).toBe('compound')
    if (board.shape.type !== 'compound') return
    const arc = board.shape.parts[0].shape
    expect(arc.type).toBe('arc')
    if (arc.type === 'arc') { expect(arc.start).toBeCloseTo(PI, 9); expect(arc.sweep).toBeCloseTo(PI / 2, 9) }
    // Moved to the centre of mass, the parts keep their place in the world
    expect(r.notes.some(n => n.includes('re-centred'))).toBe(true)
    // The file round-trips (version with arcs) and the engine keeps the momentum: m v + M V = 0
    const again = parseScene(serializeScene(r.scene)).scene
    expect(again.bodies[1].shape).toEqual(board.shape)
    const s = EngineSession.simulate(r.scene, { duration: 1.2 })
    try {
      const v = s.call<{ value: number }>({ op: 'extreme', id: 'ball.vx', which: 'max' }).value
      const V = s.call<{ value: number }>({ op: 'extreme', id: 'board.vx', which: 'min' }).value
      // Centre of the ball on a circle of radius 0.45 m: v = √(2g·0.45·M/(M+m))
      expect(v).toBeCloseTo(Math.sqrt(2 * 9.8 * 0.45 * 2 / 2.5), 3)
      expect(0.5 * v + 2 * V).toBeCloseTo(0, 6)
    } finally { s.free() }
  })

  it('reads the usual slips as meant', () => {
    const r = prepareAiScene({
      name: 'slips',
      bodies: [
        { id: 'floor', kind: 'static', shape: { type: 'box', width: 6, height: 0.4 }, position: [0, -0.2] },
        // parts written flat, an arc part with sweep in degrees, part positions as x/y
        { id: 'slide', mass: 2, fixedRotation: true, position: [0, 0.6], shape: { type: 'compound', parts: [
          { type: 'arc', radius: 0.5, thickness: 0.1, start: 180, sweep: 90, x: 0, y: 0 },
          { type: 'box', width: 1, height: 0.1, position: [0.5, -0.55] } ] } },
        // parts on the body instead of a compound shape
        { id: 'cart', mass: 1, position: [2, 0.1], parts: [{ shape: { type: 'box', width: 0.4, height: 0.1 }, position: [0, 0.05] }, { shape: { type: 'circle', radius: 0.05 }, position: [-0.15, -0.05] }, { shape: { type: 'circle', radius: 0.05 }, position: [0.15, -0.05] }] },
        { id: 'ball', kind: 'particle', mass: 0.5, shape: { type: 'circle', radius: 0.02 }, position: [-0.48, 0.6] },
        // an angle in degrees
        { id: 'plank', kind: 'static', shape: { type: 'box', width: 1, height: 0.05 }, position: [-2, 0.5], angle: 30 }
      ]
    })
    if (!r.ok) throw new Error(r.errors.join('; '))
    const slide = r.scene.bodies.find(b => b.id === 'slide')!
    expect(slide.shape.type === 'compound' && slide.shape.parts.map(p => p.shape.type)).toEqual(['arc', 'box'])
    if (slide.shape.type === 'compound' && slide.shape.parts[0].shape.type === 'arc') expect(slide.shape.parts[0].shape.sweep).toBeCloseTo(PI / 2, 9)
    expect(r.scene.bodies.find(b => b.id === 'cart')!.shape.type).toBe('compound')
    expect(r.scene.bodies.find(b => b.id === 'plank')!.angle).toBeCloseTo(PI / 6, 9)
    expect(r.notes.some(n => n.includes('read as degrees'))).toBe(true)
    expect(r.notes.some(n => n.includes('shape fields read as'))).toBe(true)
  })

  it('a broken compound comes back as a sentence with a path', () => {
    const bad = prepareAiScene({ bodies: [{ id: 'b', mass: 1, position: [0, 0], shape: { type: 'compound', parts: [{ shape: { type: 'arc', radius: 0.5 }, position: [0, 0] }, null, { position: [1, 0] }] } }] })
    expect(bad.ok).toBe(false)
    if (bad.ok) return
    expect(bad.errors.some(e => e.startsWith('bodies[0].shape.parts[1]'))).toBe(true)
    expect(bad.errors.some(e => e.startsWith('bodies[0].shape.parts[2].shape is missing'))).toBe(true)
    expect(bad.errors.join(' ')).not.toMatch(/Cannot read|undefined \(reading/)
  })
})
