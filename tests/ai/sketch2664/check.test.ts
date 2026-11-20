/**
 * 26.64 (D281): the validation ladder. Each level L0–L4 with cases that fail it — the finding is a structured
 * diagnostic `{ code, path, expected, got, hint }` naming what to change — and a case that passes; a scene with
 * findings at L2 or L3 is not loadable, one with findings only at L4 is (they are told to the user).
 */
import { describe, expect, it } from 'vitest'
import { ask, body, codes, conn, ladder, sk, surface, val } from './helpers'
import { runLadder, sceneChecks } from '../../../src/ai/sketch/check'
import { SKETCH_EXAMPLES } from '../../../src/ai/sketch/prompt'
import type { SceneSketch } from '../../../src/ai/sketch/schema'
import { addBody, addConnector, addGround, anchor, emptyScene } from '../../../src/core/scene/build'
import type { RopeDef } from '../../../src/core/scene/types'

const table = SKETCH_EXAMPLES.find(e => e.key === 'table-pulley')!
const incline = SKETCH_EXAMPLES.find(e => e.key === 'incline')!
const copy = (s: SceneSketch) => JSON.parse(JSON.stringify(s)) as SceneSketch
/** The table-and-pulley example of the handoff with one change. */
const changed = (f: (s: SceneSketch) => void, e = table) => { const s = copy(e.sketch); f(s); return runLadder(s, e.problem) }

describe('L0 structure', () => {
  it('passes a complete sketch; every level is then reached', () => {
    const l = runLadder(JSON.stringify(table.sketch), table.problem)
    expect(l.levels).toEqual({ L0: true, L1: true, L2: true, L3: true, L4: true })
    expect(l.ok && l.loadable).toBe(true)
    expect(l.diagnostics).toEqual([])
  })

  it('an answer that is no JSON object, a cut-off one, an empty one', () => {
    for (const [text, got] of [['好的，我来搭建。', /no JSON object/], ['{"route": "sketch", "bodies": [{"id": "A"', /cut off/], ['   ', /empty/]] as const) {
      const l = runLadder(text, table.problem)
      expect(codes(l)).toEqual(['L0.json'])
      expect(l.diagnostics[0].got).toMatch(got)
      expect(l.levels).toEqual({ L0: false, L1: null, L2: null, L3: null, L4: null })
      expect(l.sketch).toBeNull()
    }
  })

  it('a property the schema does not know, a wrong type, a word outside its list, texts and lists that are too long, ids', () => {
    const raw = copy(table.sketch) as unknown as Record<string, unknown>
    ;(raw.bodies as Array<Record<string, unknown>>)[1].hangingFrom = 'rope1'
    ;(raw.bodies as Array<Record<string, unknown>>)[0].place = 'onTop'
    ;(raw.values as Array<Record<string, unknown>>)[0].value = { v: 2 }
    raw.title = 'x'.repeat(61)
    ;(raw.pulleys as Array<Record<string, unknown>>)[0].id = 'A'
    ;(raw.surfaces as Array<Record<string, unknown>>)[1].id = '桌面'
    raw.version = 1
    const l = runLadder(raw, table.problem)
    expect(l.levels.L0).toBe(false)
    expect(l.levels.L1).toBeNull()
    const by = Object.fromEntries(l.diagnostics.map(d => [d.path, d]))
    expect(by['bodies[1].hangingFrom']).toMatchObject({ code: 'L0.extra', got: 'hangingFrom' })
    expect(by['bodies[0].place']).toMatchObject({ code: 'L0.enum', got: 'onTop', expected: 'one of on | hanging | inside | outside | air' })
    expect(by['values[0].value']).toMatchObject({ code: 'L0.type', expected: 'a number' })
    expect(by.title).toMatchObject({ code: 'L0.length', expected: 'at most 60 characters' })
    expect(by['pulleys[0].id']).toMatchObject({ code: 'L0.id' })
    expect(by['pulleys[0].id'].got).toContain('bodies[0].id')
    expect(by['surfaces[1].id']).toMatchObject({ code: 'L0.id' })
    expect(by.version).toMatchObject({ code: 'L0.version', expected: '2' })
    // the sketch is still there to be patched
    expect(l.sketch).not.toBeNull()
  })

  it('left-out fields take their defaults, numbers written as text are read (a JSON-mode answer)', () => {
    const raw = { route: 'sketch', title: 't', movingBodies: 1, surfaces: [{ id: 'floor', type: 'ground' }], bodies: [{ id: 'A', type: 'block', place: 'on', ref: 'floor', at: 'middle' }], values: [{ of: 'A', quantity: 'mass', value: '2', unit: 'kg' }] }
    const l = runLadder(`\`\`\`json\n${JSON.stringify(raw)}\n\`\`\``, '')
    expect(l.levels.L0).toBe(true)
    expect(l.sketch!.bodies[0]).toMatchObject({ moves: 'rest', ref2: '', points: [] })
    expect(l.sketch!.gravity).toBe('down')
    expect(l.loadable).toBe(true)
  })
})

describe('L1 references and dimensions', () => {
  it('names that do not exist, in a relation, a rope path and a value', () => {
    expect(changed(s => { s.bodies[0].ref = 'desk' }).diagnostics[0]).toMatchObject({ code: 'L1.reference', level: 1, path: 'bodies[0].ref', got: 'desk (no such id)' })
    const l = changed(s => { s.connectors[0].path = ['A.right', 'Q', 'B.top'] })
    expect(l.diagnostics.map(d => [d.code, d.path])).toContainEqual(['L1.reference', 'connectors[0].path[1]'])
    expect(changed(s => { s.connectors[0].path = ['A.front', 'P', 'B.top'] }).diagnostics[0]).toMatchObject({ code: 'L1.reference', path: 'connectors[0].path[0]', expected: 'a point of A: A.center, .top, .bottom, .left, .right' })
    expect(changed(s => { s.values[0].of = 'C' }).diagnostics.map(d => d.code)).toContain('L1.reference')
    expect(changed(s => { s.pulleys[0].at = 'table.middle' }).diagnostics[0]).toMatchObject({ code: 'L1.reference', path: 'pulleys[0].at' })
    for (const l2 of [changed(s => { s.bodies[0].ref = 'desk' }), l]) { expect(l2.levels).toMatchObject({ L0: true, L1: false, L2: null }); expect(l2.scene).toBeNull(); expect(l2.loadable).toBe(false) }
  })

  it('units: a wrong dimension, an unknown unit, an angle without its unit; values out of range', () => {
    expect(changed(s => { s.values[0].unit = 'N' }).diagnostics[0]).toMatchObject({ code: 'L1.dimension', path: 'values[0].unit', got: 'N (N)', allow: ['values[0]'] })
    expect(changed(s => { s.values[0].unit = 'kgs' }).diagnostics[0]).toMatchObject({ code: 'L1.unit', path: 'values[0].unit', got: 'kgs' })
    expect(changed(s => { s.values[1].unit = '' }, incline).diagnostics[0]).toMatchObject({ code: 'L1.dimension', path: 'values[1].unit', hint: 'angles carry "°" (or "rad")' })
    expect(changed(s => { s.values[1].value = 20 }).diagnostics[0]).toMatchObject({ code: 'L1.range', path: 'values[1].value', expected: 'friction coefficient within [0, 5]', got: '20' })
    expect(changed(s => { s.values[1].value = 95 }, incline).diagnostics[0]).toMatchObject({ code: 'L1.range', expected: 'angle with the horizontal within (0°, 90°)', got: '95 °' })
    expect(changed(s => { s.values[0].value = -2 }).diagnostics[0]).toMatchObject({ code: 'L1.range', path: 'values[0].value' })
    // grams and centimetres are converted, not refused
    const ok = changed(s => { s.values[0] = { ...s.values[0], value: 2000, unit: 'g', quote: '' } })
    expect(ok.levels.L1).toBe(true)
    expect(ok.scene!.bodies.find(b => b.id === 'A')!.mass).toBe(2)
  })

  it('a field given twice, a quantity the object does not have, a value it cannot do without', () => {
    expect(changed(s => { s.values.push({ of: 'A', quantity: 'mass', value: 3, unit: 'kg', quote: '' }) }).diagnostics[0]).toMatchObject({ code: 'L1.duplicate', path: 'values[4]', got: 'A.mass is also values[0]', allow: ['values[4]', 'values[0]'] })
    expect(changed(s => { s.values[0].quantity = 'radius' }).diagnostics[0]).toMatchObject({ code: 'L1.quantity', path: 'values[0].quantity', got: 'radius' })
    const l = changed(s => { s.values.splice(2, 1) })
    expect(l.diagnostics[0]).toMatchObject({ code: 'L1.missing', path: 'values', got: 'none', allow: ['values[+]', 'bodies[1]'] })
    expect(l.diagnostics[0].expected).toContain('{of: "B", quantity: "mass"}')
    expect(changed(s => { s.bodies[0].moves = 'right' }).diagnostics[0]).toMatchObject({ code: 'L1.missing' })
  })

  it('what a sketch cannot say is said so: a movable pulley; a pulley no rope uses', () => {
    expect(changed(s => { s.pulleys[0].at = 'B.top' }).diagnostics[0]).toMatchObject({ code: 'L1.unsupported', path: 'pulleys[0].at' })
    expect(changed(s => { s.connectors[0].path = ['A.right', 'B.top'] }).diagnostics.map(d => d.code)).toContain('L1.reference')
  })
})

describe('L2 geometry, against the engine', () => {
  it('the handoff\'s example: the rope does not reach the hanging body', () => {
    const l = changed(s => { s.connectors[0].path = ['A.right', 'P'] })
    // (a rope path needs two ends: the pulley alone is no end)
    expect(l.levels.L1).toBe(false)
    const l2 = changed(s => { s.connectors[0].path = ['A.right', 'P', 'A.top'] })
    expect(l2.diagnostics[0]).toMatchObject({ code: 'L2.floating', level: 2, path: 'bodies[1]', expected: 'supported, connected or declared in the air', hint: 'check connectors[0].path: one of its ends must be a point of B, e.g. B.top' })
    expect(l2.diagnostics[0].got).toContain('no support; rope1 does not reach B')
    expect(l2.levels).toMatchObject({ L1: true, L2: false, L3: null })
    expect(l2.loadable).toBe(false)
    expect(l2.placed).toEqual(['floor', 'table', 'A', 'P'])
    expect(l2.unplaced).toEqual(['B'])
  })

  it('who rests on whom is the engine\'s word: a hanging body that touches the floor', () => {
    const l = changed(s => { s.values[3].value = 0 })
    expect(l.diagnostics[0]).toMatchObject({ code: 'L2.contact', path: 'bodies[1]', expected: 'B hangs free', got: 'it touches floor at t = 0' })
    expect(l.loadable).toBe(false)
  })

  it('bodies that overlap; a body in the air that is said to be at rest on nothing is in the air by its own word', () => {
    const l = changed(s => { s.bodies.push(body('C', 'block', 'on', 'table', 'middle')); s.values.push(val('C', 'mass', 1, 'kg')); s.movingBodies = 3 })
    expect(l.diagnostics[0]).toMatchObject({ code: 'L2.overlap', path: 'bodies[2]' })
    expect(l.diagnostics[0].got).toMatch(/A and C overlap by 200 mm/)
    const air = ladder(sk({ surfaces: [surface('floor', 'ground')], bodies: [body('A', 'block', 'air', '', '', { ref2: 'floor' })], values: [val('A', 'mass', 1, 'kg'), val('A', 'heightAbove', 1, 'm')] }))
    expect(air.loadable).toBe(true)
  })

  it('ropes: slack or taut as declared, through no body, leading to the pulley along the body\'s motion', () => {
    // declared slack, but shorter than its path as placed (1.0985 m)
    const slack = changed(s => { s.connectors[0].mode = 'slack'; s.values.push(val('rope1', 'length', 1, 'm')); s.expect = [] })
    expect(slack.diagnostics[0]).toMatchObject({ code: 'L2.ropeState', path: 'connectors[0].mode', expected: 'a slack rope (longer than its path)' })
    // and truly slack when it is longer
    expect(changed(s => { s.connectors[0].mode = 'slack'; s.values.push(val('rope1', 'length', 1.6, 'm')); s.expect = [] }).levels.L2).toBe(true)
    // a third block stands between A and the pulley: the rope would run through it
    const through = changed(s => { s.bodies[0].at = 'left'; s.bodies.push(body('C', 'block', 'on', 'table', 'middle')); s.values.push(val('C', 'mass', 1, 'kg')); s.movingBodies = 3 })
    expect(through.diagnostics[0]).toMatchObject({ code: 'L2.ropeThroughBody', path: 'connectors[0].path', got: 'rope1 passes through C' })
    // A stands on the floor, the pulley is at the table's edge: the rope leaves A at an angle to the floor
    const skew = changed(s => { s.bodies[0].ref = 'floor'; s.values[1].of = 'A|floor'; s.values[3].value = 0.3 })
    expect(skew.diagnostics.find(d => d.code === 'L2.tangent')).toMatchObject({ path: 'connectors[0].path', expected: 'the rope parallel to the surface A moves on', allow: ['connectors[0].path', 'bodies[0]', 'pulleys'] })
    for (const l of [slack, through, skew]) expect(l.loadable).toBe(false)
  })

  it('a spring whose deformation is not the given one', () => {
    const spring = SKETCH_EXAMPLES.find(e => e.key === 'spring')!
    // the block is put in the middle of the floor instead of where the spring holds it
    const l = changed(s => { s.bodies[0].at = 'middle'; s.values.push(val('spring1', 'naturalLength', 0.5, 'm')) }, spring)
    expect(l.diagnostics[0]).toMatchObject({ code: 'L2.springDeformation', path: 'connectors[0]', expected: 'spring1 compressed by 0.1000 m at the start' })
    expect(l.diagnostics[0].got).toMatch(/stretched by/)
  })

  it('an anchor outside its body (a scene checked without a sketch)', () => {
    const scene = emptyScene('t')
    addGround(scene, { id: 'floor' })
    const b = addBody(scene, { id: 'A', name: 'A', shape: { type: 'box', width: 0.2, height: 0.2 }, position: { x: 0, y: 0.1 }, mass: 1 })
    addConnector<RopeDef>(scene, { id: 'r', name: 'r', type: 'rope', a: anchor(b, { x: 0.5, y: 0 }), b: anchor(null, { x: 2, y: 0.1 }), pulleys: [], length: null })
    const r = sceneChecks(scene, null, () => '')
    expect(r.diagnostics[0]).toMatchObject({ code: 'L2.anchor', level: 2 })
  })
})

describe('L3 trial run', () => {
  const onSlope = (mu: number, state: 'atRest' | 'moves' | 'aboutToSlide') => changed(s => { s.values[2].value = mu; s.values[2].quote = ''; s.expect = [{ of: 'A', state }] }, incline)

  it('"at rest" and "moves" hold in the run, or the finding says what happened', () => {
    expect(onSlope(0.7, 'atRest').levels.L3).toBe(true)
    expect(onSlope(0.2, 'moves').levels.L3).toBe(true)
    const slides = onSlope(0.2, 'atRest')
    expect(slides.diagnostics[0]).toMatchObject({ code: 'L3.notAtRest', level: 3, path: 'expect[0]', expected: 'A stays at rest', allow: ['expect[0]', 'bodies[0]', 'values'] })
    expect(slides.diagnostics[0].got).toMatch(/it reaches 0\.817 m\/s within 0\.25 s/)
    expect(slides.levels).toMatchObject({ L2: true, L3: false, L4: null })
    expect(slides.loadable).toBe(false)
    expect(onSlope(0.7, 'moves').diagnostics[0]).toMatchObject({ code: 'L3.notMoving', path: 'expect[0]' })
  })

  it('"just about to slide": static friction at its limit', () => {
    // μ = tan 30°: the friction needed is exactly μN
    expect(onSlope(Math.tan(Math.PI / 6), 'aboutToSlide').levels.L3).toBe(true)
    const l = onSlope(0.7, 'aboutToSlide')
    expect(l.diagnostics[0]).toMatchObject({ code: 'L3.notOnVerge', path: 'expect[0]' })
    // m g sin θ = 10 N against μ m g cos θ = 12.12 N
    expect(l.diagnostics[0].expected).toContain('12.12 N')
    expect(l.diagnostics[0].got).toContain('10.00 N')
  })

  it('a rope that goes slack at once', () => {
    // two blocks on a table joined by a rope; the rear one is thrown towards the front one
    const l = ladder(sk({
      surfaces: [surface('floor', 'ground')],
      bodies: [body('A', 'block', 'on', 'floor', 'fromLeft', { moves: 'right' }), body('B', 'block', 'on', 'floor', 'connector')],
      connectors: [conn('r', 'rope', ['A.right', 'B.left'], 'taut')],
      values: [val('A', 'mass', 1, 'kg'), val('A', 'distance', 0.5, 'm'), val('A', 'speed', 2, 'm/s'), val('B', 'mass', 1, 'kg'), val('r', 'length', 0.5, 'm')]
    }))
    // the engine's first frame already has it slack: said at L2, and the scene is not loaded
    expect(l.diagnostics[0]).toMatchObject({ code: 'L2.ropeState', level: 2, path: 'connectors[0].mode', expected: 'a taut rope', got: 'it is slack at the start' })
    expect(l.loadable).toBe(false)
  })
})

describe('L4 the contract with the problem text', () => {
  it('quotes: words that are not in the problem, a number or a unit that is not the quote\'s', () => {
    const l = changed(s => { s.values.push(val('table', 'height', 0.8, 'm', '桌面高 0.8 m')) })
    expect(l.diagnostics).toEqual([expect.objectContaining({ code: 'L4.quote', level: 4, path: 'values[4].quote', got: '桌面高 0.8 m', allow: ['values[4]'] })])
    // geometry and trial run stand: the scene may be loaded, with the finding told
    expect(l.levels).toEqual({ L0: true, L1: true, L2: true, L3: true, L4: false })
    expect(l.loadable).toBe(true)
    expect(l.ok).toBe(false)
    expect(changed(s => { s.values[0].value = 3 }).diagnostics[0]).toMatchObject({ code: 'L4.quoteValue', path: 'values[0].value', got: '3' })
    expect(changed(s => { s.values[0].unit = 'g' }).diagnostics[0]).toMatchObject({ code: 'L4.quoteUnit', path: 'values[0].unit', got: 'g' })
    // full-width characters and spaces do not matter; "光滑" carries no number
    const spaced = runLadder(copy(table.sketch), table.problem.replace('质量 2 kg', '质量２ｋｇ').replace('μ = 0.2', 'μ＝0.2'))
    expect(spaced.ok).toBe(true)
  })

  it('a value nothing uses; a question that cannot be read; the number of bodies', () => {
    const unused = changed(s => { s.values.push(val('A', 'distance', 0.5, 'm')) })
    expect(unused.diagnostics[0]).toMatchObject({ code: 'L4.givenUnused', path: 'values[4]', allow: ['bodies[0]'] })
    expect(unused.diagnostics[0].got).toContain('its "at" is middle, which takes no distance')
    const q = changed(s => { s.questions[0].id = 'A.acc'; s.questions.push(ask('?', 'atEvent', { id: 'B.v', event: 'landing', side: 'before' })) })
    expect(q.diagnostics.map(d => [d.code, d.path])).toEqual([['L4.question', 'questions[0]'], ['L4.question', 'questions[2]']])
    expect(q.diagnostics[0].hint).toContain('A.a')
    expect(q.questions.map(x => x.prompt)).toEqual(['绳的拉力'])
    expect(changed(s => { s.movingBodies = 3 }).diagnostics[0]).toMatchObject({ code: 'L4.bodyCount', path: 'movingBodies' })
  })

  it('a coordinate written into a point name must be a number of the problem', () => {
    const l = changed(s => { s.surfaces.push(surface('top', 'ceiling')); s.pulleys[0].at = 'top x=1.5m' })
    expect(l.diagnostics.map(d => [d.code, d.path])).toContainEqual(['L4.quote', 'pulleys[0].at'])
  })

  it('everything the problem did not give is an assumption', () => {
    const l = runLadder(copy(table.sketch), table.problem)
    const keys = l.assumptions.map(a => `${a.key}:${a.params.slice(0, 2).join('.')}`)
    // g, the sizes of both blocks, the table's height and length
    expect(keys).toEqual(expect.arrayContaining(['g:9.8', 'size:物块A.width', 'size:物块A.height', 'size:物块B.width', 'size:桌面.height', 'size:桌面.length']))
    // a value the model states without a quote is one too
    const stated = changed(s => { s.values.push(val('table', 'height', 1, 'm', '')) })
    expect(stated.ok).toBe(true)
    expect(stated.assumptions).toContainEqual({ key: 'stated', params: ['桌面', 'height', '1 m'] })
    expect(stated.assumptions.some(a => a.key === 'size' && a.params[0] === '桌面' && a.params[1] === 'height')).toBe(false)
  })
})

describe('the template route passes the same ladder (D284)', () => {
  const tpl = (params: Array<[string, number, string, string]>, more: Partial<SceneSketch> = {}): SceneSketch => sk({ route: 'template', templateId: 'table-pulley', templateParams: params.map(([key, value, unit, quote]) => ({ key, value, unit, quote })), questions: [ask('A 的加速度', 'quantity', { id: 'm1.a', t: 0.2 })], ...more })

  it('a template with the problem\'s values: built, run, its defaults recorded as assumptions', () => {
    const l = runLadder(tpl([['m1', 2, 'kg', '质量 2 kg 的物块 A'], ['m2', 1000, 'g', ''], ['mu', 0.2, '', 'μ = 0.2']]), table.problem)
    expect(l.via).toBe('template')
    expect(l.ok).toBe(true)
    expect((l.scene!.extra as { template: { id: string; values: Record<string, number> } }).template).toMatchObject({ id: 'table-pulley', values: { m1: 2, m2: 1, mu: 0.2 } })
    expect(l.assumptions.map(a => a.key)).toEqual(['stated', 'templateDefault'])
    expect(l.questions).toHaveLength(1)
  })

  it('an unknown template or parameter, a wrong unit, a value outside the template\'s range, a quote that is not in the problem', () => {
    expect(runLadder(tpl([], { templateId: 'table-pully' }), '').diagnostics[0]).toMatchObject({ code: 'L1.reference', path: 'templateId' })
    expect(runLadder(tpl([['mass', 2, 'kg', '']]), '').diagnostics[0]).toMatchObject({ code: 'L1.reference', path: 'templateParams[0].key' })
    expect(runLadder(tpl([['m1', 2, 'N', '']]), '').diagnostics[0]).toMatchObject({ code: 'L1.dimension', path: 'templateParams[0].unit' })
    expect(runLadder(tpl([['mu', 7, '', '']]), '').diagnostics[0]).toMatchObject({ code: 'L1.range', path: 'templateParams[0].value' })
    const l = runLadder(tpl([['m1', 2, 'kg', '质量 5 kg']]), table.problem)
    expect(l.diagnostics.map(d => d.code)).toEqual(['L4.quote'])
    expect(l.loadable).toBe(true)
  })

  it('"the engine cannot do this" is an answer, not a failure of the ladder', () => {
    const l = runLadder(sk({ route: 'unsupported', reason: '这是电路题' }), '')
    expect(l.via).toBe('unsupported')
    expect(l.scene).toBeNull()
    expect(l.loadable).toBe(false)
  })
})
