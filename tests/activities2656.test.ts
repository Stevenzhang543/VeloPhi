/**
 * Teaching activities, learning records and parameterized problems (26.56, D102, D103): the activity data refer to
 * real models, inputs, outputs and conditions; every expected answer comes from the Rust core and is gradable; the
 * grading separates the dimensions; opening a page is never mastery; the parameterized problems are reproducible
 * from their seed and reject draws whose physical conditions fail.
 */
import { describe, expect, it } from 'vitest'
import { ACTIVITIES, activityById } from '../src/teaching/activities'
import { activityInputs, evaluate, expectedChoice, gradeItem, isMastery, keepFirst, tally, trendOf } from '../src/teaching/activities/grade'
import type { FirstCheck } from '../src/teaching/activities/grade'
import type { Answer, ItemGrade } from '../src/teaching/activities/grade'
import type { Question } from '../src/teaching/activities/types'
import { MODELS, modelById } from '../src/content/models'
import { loadRecords, addAttempt, markVisited, stepProgress, exportRecords, clearRecords, RECORDS_KEY } from '../src/teaching/records'
import type { AttemptRecord, KeyStore } from '../src/teaching/records'
import { checkSpec, generate, preview, seeded, onGrid } from '../src/teaching/paramProblem'
import type { ParamSpec } from '../src/teaching/paramProblem'

function rightAnswer(q: Question, ev: ReturnType<typeof evaluate>, observed?: ReturnType<typeof trendOf>): Answer {
  switch (q.kind) {
    case 'choice': return { choice: expectedChoice(q, ev) }
    case 'multi': return { choices: q.answer }
    case 'number': return { value: ev.outputs[q.output].value, unit: ev.outputs[q.output].unit }
    case 'trend': return { choice: observed ?? null }
  }
}

describe('activity data', () => {
  it('there are the activities the models link to, with unique ids', () => {
    expect(new Set(ACTIVITIES.map(a => a.id)).size).toBe(ACTIVITIES.length)
    const linked = new Set(MODELS.flatMap(m => m.links.activities ?? []))
    expect([...linked].sort()).toEqual(ACTIVITIES.map(a => a.id).sort())
    for (const m of MODELS) for (const a of m.links.activities ?? []) expect(activityById(a)!.models, `${m.id} → ${a}`).toContain(m.id)
  })

  for (const a of ACTIVITIES) {
    it(`${a.id}: names, answers and the experiment come from the model`, () => {
      const m = modelById(a.models[0])!
      expect(m, a.models[0]).toBeTruthy()
      for (const id of a.models) expect(modelById(id), id).toBeTruthy()
      for (const p of a.prerequisites.models ?? []) expect(modelById(p), p).toBeTruthy()
      for (const p of a.prerequisites.activities ?? []) expect(activityById(p), p).toBeTruthy()
      const inputIds = new Set(m.inputs.map(i => i.id))
      for (const k of [...Object.keys(a.inputs), ...Object.keys(a.transfer.inputs)]) expect(inputIds.has(k), `${a.id} input ${k}`).toBe(true)
      expect(a.goals.length).toBeGreaterThan(0)
      expect(a.diagnostic.length).toBeGreaterThan(0)
      expect(a.predict.reasons.some(r => r.id === a.predict.reason)).toBe(true)
      const ev = evaluate(m.id, activityInputs(a))
      const tev = evaluate(m.id, activityInputs(a, a.transfer.inputs))
      expect(ev.result.domain).toEqual([])
      expect(tev.result.domain).toEqual([])
      // the experiment varies one input and observes outputs of the model
      let observed: ReturnType<typeof trendOf> = null
      if (a.experiment) {
        expect(inputIds.has(a.experiment.vary)).toBe(true)
        const series = a.experiment.values.map(v => evaluate(m.id, { ...activityInputs(a), [a.experiment!.vary]: v }))
        for (const o of a.experiment.observe) expect(series[0].outputs[o], `${a.id} observes ${o}`).toBeTruthy()
        if (a.predict.question.kind === 'trend') {
          observed = trendOf(series.map(s => s.outputs[(a.predict.question as { output: string }).output]?.value ?? null))
          expect(['increases', 'decreases', 'constant'], `${a.id} trend`).toContain(observed)
        }
      }
      if (a.predict.question.kind === 'choice') expect(expectedChoice(a.predict.question, ev), `${a.id} prediction`).not.toBeNull()
      const all: Array<[Question, ReturnType<typeof evaluate>]> = [...a.diagnostic.map(q => [q, ev] as [Question, typeof ev]), ...a.questions.map(q => [q, ev] as [Question, typeof ev]), ...a.transfer.questions.map(q => [q, tev] as [Question, typeof ev])]
      for (const [q, e] of all) {
        if (q.kind === 'number') {
          expect(m.outputs.some(o => o.id === q.output), `${a.id}.${q.id} output`).toBe(true)
          expect(q.units.filter(u => u === e.outputs[q.output]?.unit).length, `${a.id}.${q.id} units`).toBe(1)
        }
        if (q.kind === 'choice') expect(new Set(q.options.map(o => o.id)).size).toBe(q.options.length)
        const g = gradeItem(q, e, rightAnswer(q, e, observed), observed)
        expect(g.ungradable, `${a.id}.${q.id} gradable`).toBeFalsy()
        expect(Object.values(g.verdicts).every(v => v === 'correct'), `${a.id}.${q.id} right answer`).toBe(true)
      }
    })
  }
})

describe('grading', () => {
  const a = activityById('act-incline')!
  const ev = evaluate('M07', activityInputs(a))
  const q = a.questions.find(x => x.id === 'q4')!
  it('separates calculation, unit and direction', () => {
    const ref = ev.outputs.a.value!
    expect(gradeItem(q, ev, { value: ref * 1.001, unit: 'm/s²' }).verdicts).toEqual({ unit: 'correct', calculation: 'correct', direction: 'correct' })
    expect(gradeItem(q, ev, { value: ref, unit: 'N' }).verdicts).toEqual({ unit: 'wrong', calculation: 'correct', direction: 'correct' })
    expect(gradeItem(q, ev, { value: -ref, unit: 'm/s²' }).verdicts).toEqual({ unit: 'correct', calculation: 'correct', direction: 'wrong' })
    expect(gradeItem(q, ev, { value: ref * 1.5, unit: 'm/s²' }).verdicts).toEqual({ unit: 'correct', calculation: 'wrong' })
  })
  it('reads the friction direction from the branch of the model', () => {
    const dir = a.questions.find(x => x.id === 'q2')!
    expect(expectedChoice(dir as never, ev)).toBe('up')
    const up = evaluate('M07', activityInputs(a, { ...a.inputs, v0: -1 }))
    expect(expectedChoice(dir as never, up)).toBe('down')
  })
  it('mastery needs every dimension of core and transfer questions; diagnosis alone is not mastery', () => {
    const ok: ItemGrade = { verdicts: { calculation: 'correct', unit: 'correct' }, expected: 1, feedback: [] }
    const bad: ItemGrade = { verdicts: { calculation: 'correct', unit: 'wrong' }, expected: 1, feedback: [] }
    expect(isMastery([ok, ok], [ok])).toBe(true)
    expect(isMastery([ok, bad], [ok])).toBe(false)
    expect(isMastery([ok], [])).toBe(false)
    expect(tally([ok, bad]).unit).toEqual({ correct: 1, total: 2 })
  })
  it('the first check is the evidence: correcting after seeing the reference answer is practice, not mastery', () => {
    const ok: ItemGrade = { verdicts: { calculation: 'correct', unit: 'correct' }, expected: 1, feedback: [] }
    const bad: ItemGrade = { verdicts: { calculation: 'correct', unit: 'wrong' }, expected: 1, feedback: [] }
    const book: Record<string, FirstCheck> = {}
    keepFirst(book, 'q1', bad, { value: 0.01, unit: 'm²' })
    keepFirst(book, 'q1', ok, { value: 0.01, unit: 'm³' })
    keepFirst(book, 't1', ok, { value: 680, unit: 'N' })
    expect(book.q1.grade).toBe(bad)
    expect(book.q1.answer).toEqual({ value: 0.01, unit: 'm²' })
    expect(isMastery([book.q1.grade], [book.t1.grade])).toBe(false)
  })
})

describe('learning records', () => {
  const mem = (): KeyStore & { data: Record<string, string> } => {
    const data: Record<string, string> = {}
    return { data, getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v }, removeItem: k => { delete data[k] } }
  }
  it('migrates the 26.55 “opened” list to visits only', () => {
    const r = loadRecords(mem(), ['template:incline', 'lab:circuit:series'])
    expect(Object.keys(r.visited)).toEqual(['template:incline', 'lab:circuit:series'])
    expect(r.attempts).toEqual([])
    expect(stepProgress(r, 'template:incline', ['act-incline'])).toEqual({ visited: true, practised: false, mastery: false })
  })
  it('keeps visits, practice and mastery apart; exports and clears', () => {
    const s = mem()
    const r = loadRecords(s, [])
    markVisited(r, 'template:incline')
    const base: AttemptRecord = { id: 'x', activity: 'act-incline', started: 't', finished: 't', constantsSet: 'CODATA2022', inputs: {}, transferInputs: {}, diagnostic: {}, prediction: null, experiment: null, revision: null, items: {}, transfer: {}, dims: { concept: { correct: 0, total: 0 }, unit: { correct: 0, total: 0 }, direction: { correct: 0, total: 0 }, modelling: { correct: 0, total: 0 }, calculation: { correct: 0, total: 0 }, explanation: { correct: 0, total: 0 } }, mastery: false }
    addAttempt(r, base)
    expect(stepProgress(r, 'template:incline', ['act-incline'])).toEqual({ visited: true, practised: true, mastery: false })
    addAttempt(r, { ...base, id: 'y', mastery: true })
    expect(stepProgress(r, 'template:incline', ['act-incline']).mastery).toBe(true)
    const doc = JSON.parse(exportRecords(r))
    expect(doc.format).toBe('velophi-learning-records')
    expect(doc.records.attempts).toHaveLength(2)
    s.setItem(RECORDS_KEY, '{}')
    const c = clearRecords(s)
    expect(s.getItem(RECORDS_KEY)).toBeNull()
    expect(c.attempts).toEqual([])
    // a cleared store does not bring back the old list
    expect(Object.keys(loadRecords(null, ['template:x']).visited)).toEqual(['template:x'])
  })
})

describe('parameterized problems with constraints', () => {
  const spec: ParamSpec = { model: 'E15', ask: ['tau', 'VC'], vary: { R: { lo: 100, hi: 10000, step: 100 }, C: { lo: 1e-5, hi: 1e-3, step: 1e-5 }, t: { lo: 0.01, hi: 1, step: 0.01 } }, fixed: { Vs: 6, V0: 0 }, outputRange: { VC: { min: 0.5, max: 5.5 } } }
  it('checks the specification', () => {
    expect(checkSpec(spec)).toEqual([])
    expect(checkSpec({ ...spec, ask: ['nope'], vary: { R: { lo: -1, hi: 10, step: 1 } } })).toEqual(['unknown output nope', 'R: below the domain (0)'])
  })
  it('neighbouring seeds give spread-out problems (scrambled seed)', () => {
    const one: ParamSpec = { model: 'E15', ask: ['tau'], vary: { R: { lo: 500, hi: 2000, step: 100 } } }
    const rs = [1, 2, 3, 4, 5, 6, 7, 8].map(k => generate(one, k).instance!.inputs.R)
    expect(new Set(rs).size).toBeGreaterThanOrEqual(5)
    expect(Math.max(...rs) - Math.min(...rs)).toBeGreaterThanOrEqual(800)
  })
  it('is reproducible from the seed and the answer is the core’s value for the rounded inputs', () => {
    const a = generate(spec, 42).instance!
    const b = generate(spec, 42).instance!
    expect(a).toEqual(b)
    expect(a.inputs.R % 100).toBeCloseTo(0, 9)
    expect(a.answers.tau.value).toBeCloseTo(a.inputs.R * a.inputs.C, 12)
    expect(a.answers.VC.value).toBeGreaterThanOrEqual(0.5)
    expect(generate(spec, 43).instance!.inputs).not.toEqual(a.inputs)
  })
  it('rejects draws whose conditions fail and reports why', () => {
    const p = preview({ model: 'M08', ask: ['a'], vary: { F: { lo: 1, hi: 12, step: 1 } }, fixed: { m: 2, muS: 0.4, muK: 0.3, g: 10, v0: 0 }, require: ['sliding'] }, [1, 2, 3, 4, 5, 6, 7, 8])
    expect(p.instances.length).toBe(8)
    for (const i of p.instances) expect(i.inputs.F).toBeGreaterThan(8)
    expect(p.reasons.condition).toBeGreaterThan(0)
    expect(onGrid({ lo: 0.1, hi: 0.3, step: 0.1 }, 0.999)).toBe(0.3)
    const r = seeded(7)
    expect([r(), r()]).toEqual([seeded(7)(), (() => { const s = seeded(7); s(); return s() })()])
  })
})
