/**
 * 26.64 (D279, D282–D284): the sketch's JSON Schema is strict-mode compatible (flat: every property required, nothing
 * else allowed, no keyword strict mode lacks); named points; patches — accepted where a diagnostic names the path,
 * rejected elsewhere; the six sketches of the prompt compile, pass the whole ladder and give the textbook answers; the
 * template search puts the right template among the five it offers.
 */
import { describe, expect, it } from 'vitest'
import { PATCH_SCHEMA, SKETCH_SCHEMA, parsePoint, patchValue, submitSketchTool } from '../../../src/ai/sketch/schema'
import type { Diagnostic } from '../../../src/ai/sketch/schema'
import type { JsonSchema } from '../../../src/ai/types'
import { applyPatch, fragmentsFor, pathAllowed, readPatch } from '../../../src/ai/sketch/patch'
import { SKETCH_EXAMPLES, SCHEMA_NOTES, candidateTable, patchSystem, sketchSystem } from '../../../src/ai/sketch/prompt'
import { runLadder } from '../../../src/ai/sketch/check'
import { rankTemplates } from '../../../src/ai/sketch/templates'
import { assumptionLines, diagnosticLines, failureText } from '../../../src/ai/sketch/messages'
import { BUILTIN_PROBLEMS } from '../../../src/teaching/problemBank'
import { EngineSession } from '../../../src/engine/session'
import type { Scene } from '../../../src/core/scene/types'
import type { CheckedQuestion } from '../../../src/ai/import/contract'

describe('the schema of submit_sketch', () => {
  it('is strict-mode compatible: every object lists all its properties as required and allows no others', () => {
    let objects = 0
    const walk = (s: JsonSchema, path: string) => {
      for (const k of Object.keys(s)) expect(['type', 'description', 'properties', 'required', 'items', 'enum', 'additionalProperties'], `${path}: keyword ${k}`).toContain(k)
      if (s.type === 'object') {
        objects++
        expect(s.additionalProperties, path).toBe(false)
        expect([...(s.required ?? [])].sort(), path).toEqual(Object.keys(s.properties ?? {}).sort())
        for (const [k, v] of Object.entries(s.properties ?? {})) walk(v, `${path}.${k}`)
      } else if (s.type === 'array') walk(s.items!, `${path}[]`)
      else expect(['string', 'number', 'integer'], path).toContain(s.type)
    }
    walk(SKETCH_SCHEMA, 'sketch')
    walk(PATCH_SCHEMA, 'patch')
    expect(objects).toBe(11)
    expect(submitSketchTool(true).function).toMatchObject({ name: 'submit_sketch', strict: true })
    expect('strict' in submitSketchTool(false).function).toBe(false)
  })

  it('named points', () => {
    expect(parsePoint('A.top')).toEqual({ owner: 'A', feature: 'top', coord: null })
    expect(parsePoint('table.rightEnd')).toEqual({ owner: 'table', feature: 'rightEnd', coord: null })
    expect(parsePoint('ceiling x=0.5m')).toEqual({ owner: 'ceiling', feature: '', coord: { axis: 'x', value: 0.5, unit: 'm' } })
    expect(parsePoint('wall height = 120 cm')).toEqual({ owner: 'wall', feature: '', coord: { axis: 'height', value: 120, unit: 'cm' } })
    expect(parsePoint('wall height=120cm')).toEqual({ owner: 'wall', feature: '', coord: { axis: 'height', value: 120, unit: 'cm' } })
    expect(parsePoint('fixed')).toEqual({ owner: 'fixed', feature: '', coord: null })
    expect(parsePoint('A top')).toBeNull()
  })
})

describe('patches (D282)', () => {
  const ex = SKETCH_EXAMPLES.find(e => e.key === 'table-pulley')!
  const broken = () => { const s = JSON.parse(JSON.stringify(ex.sketch)) as typeof ex.sketch; s.connectors[0].path = ['A.right', 'P', 'A.top']; return s }
  const floating: Diagnostic = { code: 'L2.floating', level: 2, path: 'bodies[1]', expected: 'supported, connected or declared in the air', got: 'no support; rope1 does not reach B', hint: 'check connectors[0].path', allow: ['connectors[0].path'] }

  it('the handoff\'s patch is accepted and mends the sketch', () => {
    const d = runLadder(broken(), ex.problem).diagnostics
    expect(d[0]).toMatchObject({ code: 'L2.floating', path: 'bodies[1]' })
    const p = readPatch('[ { "op": "set", "path": "connectors[0].path", "value": ["A.right", "P", "B.top"] } ]')
    const r = applyPatch(broken(), p.entries, [floating])
    expect(r).toMatchObject({ applied: ['connectors[0].path'], rejected: [] })
    expect(runLadder(r.sketch, ex.problem).ok).toBe(true)
  })

  it('a patch that touches a path no diagnostic names is rejected, entry by entry', () => {
    const p = readPatch({ patch: [{ op: 'set', path: 'connectors[0].path', value: '["A.right","P","B.top"]' }, { op: 'set', path: 'values[0].value', value: '5' }, { op: 'replace', path: 'bodies[1].at', value: '"left"' }, { op: 'set', path: 'bodies[1].colour', value: '"red"' }, { op: 'set', path: 'bodies[7].at', value: '"left"' }] })
    const r = applyPatch(broken(), p.entries, [floating])
    expect(r.applied).toEqual(['connectors[0].path'])
    expect(r.rejected).toEqual(['values[0].value: no diagnostic names this path', 'bodies[1].at: op "replace" is not "set"', 'bodies[1].colour: no field "colour"', 'bodies[7].at: no diagnostic names this path'])
    expect(r.sketch.values[0].value).toBe(2)
    expect(r.sketch.connectors[0].path).toEqual(['A.right', 'P', 'B.top'])
  })

  it('what a diagnostic allows: its path and below, its `allow`, adding to a list it names', () => {
    const allowed = ['bodies[1]', 'connectors[0].path', 'values[+]', 'values[3]']
    for (const p of ['bodies[1]', 'bodies[1].at', 'connectors[0].path', 'connectors[0].path[2]', 'values[+]', 'values[3].unit']) expect(pathAllowed(p, allowed), p).toBe(true)
    for (const p of ['bodies[0].at', 'connectors[0].mode', 'connectors[1].path', 'values[2]', 'bodies', 'title', '', 'bodies[1']) expect(pathAllowed(p, allowed), p).toBe(false)
    // a finding about the whole scene allows anything
    expect(pathAllowed('gravity', [''])).toBe(true)
  })

  it('rows are added with [+] and taken out with null; indices refer to the sketch as it was', () => {
    const s = JSON.parse(JSON.stringify(ex.sketch)) as typeof ex.sketch
    const d: Diagnostic[] = [{ code: 'L4.quote', level: 4, path: 'values[1].quote', expected: '', got: '', hint: '', allow: ['values[1]'] }, { code: 'L1.missing', level: 1, path: 'values', expected: '', got: '', hint: '', allow: ['values[+]'] }]
    const r = applyPatch(s, readPatch({ patch: [{ op: 'set', path: 'values[1]', value: 'null' }, { op: 'set', path: 'values[+]', value: '{"of":"world","quantity":"g","value":10,"unit":"m/s²","quote":""}' }, { op: 'set', path: 'values[3].value', value: '0.5' }] }).entries, d)
    expect(r.rejected).toEqual([])
    expect(r.sketch.values.map(v => `${v.of}.${v.quantity}=${v.value}`)).toEqual(['A.mass=2', 'B.mass=1', 'B.heightAbove=0.5', 'world.g=10'])
  })

  it('patch values are JSON text or plain values; an unreadable patch says so', () => {
    expect(patchValue('0.2')).toBe(0.2)
    expect(patchValue('"kg"')).toBe('kg')
    expect(patchValue('kg')).toBe('kg')
    expect(patchValue('["A.right","P"]')).toEqual(['A.right', 'P'])
    expect(patchValue('null')).toBeNull()
    expect(patchValue(3)).toBe(3)
    expect(readPatch('I would change the rope.').error).toBeDefined()
    expect(readPatch('').error).toBe('an empty answer')
    expect(readPatch('```json\n{"patch": [{"op": "set", "path": "bodies[1].at", "value": "left"}]}\n```').entries).toEqual([{ op: 'set', path: 'bodies[1].at', value: 'left' }])
  })

  it('a repair round sees the fragments its diagnostics are about, not the whole sketch', () => {
    const f = fragmentsFor(broken(), [floating])
    expect(Object.keys(f).sort()).toEqual(['bodies[1]', 'connectors[0]', 'ids', 'values[2]', 'values[3]'])
    expect(f.ids).toMatchObject({ bodies: ['A', 'B'], pulleys: ['P'] })
    expect(JSON.stringify(f).length).toBeLessThan(JSON.stringify(broken()).length * 0.6)
  })
})

/** The engine's answer to a checked question of a scene. */
function answer(scene: Scene, q: CheckedQuestion): number {
  const s = EngineSession.simulate(scene, { duration: scene.settings.duration ?? 3 })
  try {
    const t = q.target
    if (t.kind === 'quantity') return s.call<{ values: Float64Array }>({ op: 'evaluate', ids: [t.id], t: t.t }).values[0]
    if (t.kind === 'extreme') return s.call<{ value: number }>({ op: 'extreme', id: t.id, which: t.which }).value
    const events = s.call<{ events: Array<{ index: number; t: number; changes: Array<{ type: string; bodies?: string[] }> }> }>({ op: 'events' }).events
    const e = events.find(x => x.changes.some(c => 'event' in t && c.type === t.event && (!t.body || (c.bodies ?? []).includes(t.body))))!
    if (t.kind === 'event') return e.t
    if (t.kind === 'atEvent') return s.call<{ values: Float64Array }>({ op: 'evaluate', event: e.index, side: t.side, ids: [t.id] }).values[0]
    return NaN
  } finally { s.free() }
}

describe('the prompt (D283)', () => {
  // closed forms of the six examples, in the order of their questions
  const WANT: Record<string, number[]> = {
    incline: [10 * (0.5 - 0.2 * Math.cos(Math.PI / 6)), 10 * (0.5 - 0.2 * Math.cos(Math.PI / 6))],
    'table-pulley': [1.96, 7.84],
    'board-block': [4 / 4.5, 0.5 * (4 / 4.5)],
    spring: [0.1 * Math.sqrt(100 / 0.5)],
    arc: [Math.sqrt(2 * 9.8 * 0.8), 3 * 0.1 * 9.8],
    projectile: [0.5, Math.hypot(3, 5)]
  }

  it('has six examples; each compiles, passes L0–L4 against its problem text and gives the textbook answers (1e-6)', () => {
    expect(SKETCH_EXAMPLES.map(e => e.key)).toEqual(['incline', 'table-pulley', 'board-block', 'spring', 'arc', 'projectile'])
    for (const e of SKETCH_EXAMPLES) {
      const l = runLadder(JSON.stringify(e.sketch), e.problem)
      expect(l.diagnostics, e.key).toEqual([])
      expect(l.levels, e.key).toEqual({ L0: true, L1: true, L2: true, L3: true, L4: true })
      expect(l.questions.length, e.key).toBe(e.sketch.questions.length)
      l.questions.forEach((q, i) => { const got = answer(l.scene!, q); expect(Math.abs(got - WANT[e.key][i]), `${e.key} ${q.prompt}: ${got} vs ${WANT[e.key][i]}`).toBeLessThan(1e-6 * Math.max(1, Math.abs(WANT[e.key][i]))) })
      // no coordinate anywhere in a sketch: no x or y value, no point with a number
      expect(e.sketch.values.some(v => v.quantity === 'x' || v.quantity === 'y'), e.key).toBe(false)
      expect(JSON.stringify(e.sketch)).not.toMatch(/ x=| height=/)
    }
  })

  it('carries the vocabulary and the examples, and is short', () => {
    const sys = sketchSystem()
    for (const e of SKETCH_EXAMPLES) { expect(sys).toContain(JSON.stringify(e.sketch)); expect(sys).toContain(e.problem) }
    expect(sys).toContain(SCHEMA_NOTES)
    // one paragraph per list of the schema instead of a file format with geometry recipes: under 45 lines of notes
    expect(SCHEMA_NOTES.split('\n').length).toBeLessThan(45)
    expect(sys).not.toMatch(/cosθ|sinθ|tanθ/)
    expect(patchSystem()).toContain(SCHEMA_NOTES)
    expect(patchSystem()).not.toContain(SKETCH_EXAMPLES[0].problem)
  })

  it('messages for people: assumptions in one line per object, findings by object, the honest failure', () => {
    const l = runLadder(JSON.stringify(SKETCH_EXAMPLES[1].sketch), SKETCH_EXAMPLES[1].problem)
    const lines = assumptionLines(l.assumptions)
    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe('题目没有给 g，取 9.8 m/s²')
    expect(lines).toContain('桌面的尺寸题目没有给，取：高度 0.8 m，长度 2 m')
    const s = JSON.parse(JSON.stringify(SKETCH_EXAMPLES[1].sketch)); s.connectors[0].path = ['A.right', 'P', 'A.top']
    const bad = runLadder(s, SKETCH_EXAMPLES[1].problem)
    expect(diagnosticLines(bad.diagnostics, bad.sketch, bad.names)).toEqual(['“物块B”没有被支撑，也没有绳或弹簧连到它'])
    expect(failureText(bad)).toBe('这道题我没能搭对，所以没有载入场景。这几处没摆对：\n· “物块B”没有被支撑，也没有绳或弹簧连到它\n· 已摆好的部分：地面、桌面、物块A、定滑轮\n· 没能摆好的部分：物块B')
  })
})

describe('template first (D284)', () => {
  it('the template of a built-in problem is among the five offered for its statement (all 98, in three languages)', () => {
    let hit = 0, first = 0, n = 0
    for (const p of BUILTIN_PROBLEMS) for (const lang of ['zh', 'en', 'de'] as const) {
      const text = p.stem[lang].replace(/\{(\w+)\}/g, (_, k: string) => String(p.params[k] ?? 9.8))
      const ids = rankTemplates(text, 5).map(t => t.id)
      n++
      if (ids.includes(p.template)) hit++
      if (ids[0] === p.template) first++
    }
    expect(n).toBe(294)
    // the stems are part of what is searched, so this is a floor, not a measure of the search on new problems
    expect(hit).toBe(n)
    expect(first / n).toBeGreaterThan(0.9)
  })

  it('a reworded problem still finds its template; the table for the model lists parameters with units and ranges', () => {
    const list = rankTemplates('一个木块放在水平桌子上，细线绕过桌子边缘的滑轮吊着另一个重物，松手后两者一起加速，问加速度多大。', 5)
    expect(list).toHaveLength(5)
    expect(list.map(t => t.id)).toContain('table-pulley')
    const table = candidateTable(list)
    expect(table).toContain('table-pulley｜桌面—滑轮连接体')
    expect(table).toMatch(/mu（[^）]+）=0\.2/)
    expect(rankTemplates('', 5)).toEqual([])
  })
})
