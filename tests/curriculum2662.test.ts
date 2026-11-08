/**
 * The curriculum layer (26.62, D222): the imported blueprint data is complete and matches the workbook (283 topics,
 * 310 components, 283 scenes, 30 acceptance cases, 168 syllabus chapters, 21 required experiments), every topic,
 * experiment and component is mapped, every id of the mapping exists in the app, coverage is never claimed beyond
 * the evidence, the K families are used, every translation exists and every acceptance case names real tests.
 */
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { Curriculum, loadCurriculum, COMPONENT_LINKS, JUNIOR_LINKS, TOPIC_LINKS, SYSTEMS, inCourse, parseLinks, coverageOf, WHERE, REASONS, PARTIAL_NOTES } from '../src/curriculum'
import type { CurriculumData } from '../src/curriculum/types'
import { describe as describeRes, expand } from '../src/app/curriculum'
import { ACCEPTANCE } from '../src/curriculum/acceptance'
import { chapterCodes, chapterMatches, MAPPABLE, SUPPLEMENT } from '../src/curriculum/syllabus'
import { MODELS, modelById } from '../src/content/models'

const data = JSON.parse(readFileSync(new URL('../src/curriculum/data/curriculum.json', import.meta.url), 'utf8')) as CurriculumData
const dict = JSON.parse(readFileSync(new URL('../src/curriculum/data/i18n.json', import.meta.url), 'utf8')) as Record<string, [string, string]>
const cur = new Curriculum(data, dict)
const CJK = /[一-鿿（），；：、。]/

describe('curriculum data', () => {
  it('is the workbook in docs/curriculum, complete', () => {
    const xlsx = readFileSync(new URL('../docs/curriculum/VeloPhi_Physics_Curriculum_Masterplan.xlsx', import.meta.url))
    expect(createHash('sha256').update(xlsx).digest('hex')).toBe(data.source.sha256)
    expect(existsSync(new URL('../docs/curriculum/VeloPhi_Physics_Curriculum_Developer_Blueprint.md', import.meta.url))).toBe(true)
    expect([data.topics.length, data.components.length, data.scenes.length, data.acceptance.length, data.syllabus.length, data.junior.length, data.sources.length]).toEqual([283, 310, 283, 30, 168, 21, 12])
    expect(new Set(cur.topics.map(t => t.id)).size).toBe(283)
    expect(cur.domains().length).toBe(14)
    // the overview's priority counts are the topic table's
    for (const [p, n] of data.priorities) expect(cur.topics.filter(t => t.priority === p).length, p).toBe(n)
    // every dependency is a component
    for (const t of cur.topics) for (const d of t.deps) expect(cur.component(d), `${t.id} → ${d}`).toBeTruthy()
  })

  it('loads lazily through the app loader (the JSON as text, parsed once)', async () => {
    const a = await loadCurriculum()
    expect(a.topics.length).toBe(283)
    expect(await loadCurriculum()).toBe(a)
  })

  it('has an English and a German text for every shown source string', () => {
    const shown = new Set<string>()
    for (const t of cur.topics) { shown.add(t.domain); shown.add(t.name); shown.add(t.scene); shown.add(t.level); shown.add(t.accept); shown.add(t.bound); shown.add(t.courses.university); shown.add(t.courses.myp) }
    for (const c of cur.components) { shown.add(c.layer); shown.add(c.category); shown.add(c.name) }
    for (const e of cur.experiments) { shown.add(e.name); shown.add(e.category); shown.add(e.virtual); shown.add(e.limitation) }
    for (const a of data.acceptance) { shown.add(a[0]); shown.add(a[1]); shown.add(a[2]) }
    for (const r of data.roadmap) { shown.add(r[1]); shown.add(r[2]); shown.add(r[3]) }
    for (const r of data.rules) shown.add(r)
    shown.add(data.advice)
    const missing = [...shown].filter(s => s && s !== '—' && CJK.test(s) && !dict[s])
    expect(missing).toEqual([])
    for (const [zh, [en, de]] of Object.entries(dict)) {
      expect(en && de, zh).toBeTruthy()
      expect(CJK.test(en) || CJK.test(de), `${zh}: ${en} / ${de}`).toBe(false)
    }
    expect(cur.tr('科学计数法与有效数字', 'en')).toBe('Scientific notation and significant figures')
    expect(cur.tr('科学计数法与有效数字', 'zh')).toBe('科学计数法与有效数字')
  })
})

describe('curriculum mapping', () => {
  it('maps every topic, experiment and component (and nothing else)', () => {
    expect(Object.keys(TOPIC_LINKS).sort()).toEqual(cur.topics.map(t => t.id).sort())
    expect(Object.keys(JUNIOR_LINKS).sort()).toEqual(cur.experiments.map(e => e.code).sort())
    expect(Object.keys(COMPONENT_LINKS).sort()).toEqual(cur.components.map(c => c.id).sort())
  })

  it('every id of the mapping exists in the app', () => {
    const bad: string[] = []
    const check = (owner: string, spec: string) => {
      const p = parseLinks(spec)
      for (const r of p.resources) if (!describeRes(r)) bad.push(`${owner}: ${r.kind} ${r.lab ? r.lab + '/' : ''}${r.id}`)
      for (const w of p.where) if (!WHERE[w]) bad.push(`${owner}: where ${w}`)
      for (const r of p.reasons) if (!REASONS[r]) bad.push(`${owner}: reason ${r}`)
    }
    for (const [id, spec] of Object.entries(TOPIC_LINKS)) check(id, spec)
    for (const [id, spec] of Object.entries(JUNIOR_LINKS)) check(id, spec)
    for (const [id, spec] of Object.entries(COMPONENT_LINKS)) check(id, spec)
    // resources added from the model families exist too
    for (const t of cur.topics) for (const r of expand(t.resources)) if (!describeRes(r)) bad.push(`${t.id}: linked ${r.kind} ${r.id}`)
    for (const id of Object.keys(PARTIAL_NOTES)) if (cur.component(id)?.state !== 'partial') bad.push(`${id}: a note for a component that is not partial`)
    expect(bad).toEqual([])
  })

  it('every topic opens at least one resource, and coverage follows the evidence', () => {
    for (const t of cur.topics) {
      expect(t.resources.length, t.id).toBeGreaterThan(0)
      const p = parseLinks(TOPIC_LINKS[t.id])
      if (t.coverage === 'simulated') expect(p.resources.some(r => ['template', 'lab', 'preset'].includes(r.kind)), t.id).toBe(true)
      if (t.coverage === 'model') expect(p.resources.some(r => r.kind === 'model' && modelById(r.id)?.status === 'verified'), t.id).toBe(true)
    }
    // a real-laboratory topic of the blueprint (mode R) is never claimed as simulated
    for (const t of cur.topics.filter(t => t.mode === 'R')) expect(t.coverage, t.id).toBe('real')
    // the junior experiments are companions: the measuring ones are real-lab skills
    for (const e of cur.experiments.filter(e => e.code.startsWith('4.1.'))) expect(e.coverage, e.code).toBe('real')
    const s = cur.summary()
    expect(s.simulated + s.model + s.concept + s.real).toBe(283)
    expect(s.simulated).toBeGreaterThan(130)
  })

  it('uses all 32 curriculum families K and maps the blueprint gaps they fill', () => {
    const used = new Set(Object.values(TOPIC_LINKS).flatMap(s => parseLinks(s).resources.filter(r => r.kind === 'model').map(r => r.id)))
    for (const m of MODELS.filter(m => m.id.startsWith('K'))) expect(used.has(m.id), m.id).toBe(true)
    expect(coverageOf(TOPIC_LINKS['T07-019'])).toBe('model')
    expect(TOPIC_LINKS['T07-019']).toContain('K18')
  })

  it('a component without an interactive object is never “done”; planned ones give a reason', () => {
    for (const c of cur.components) {
      if (c.state === 'done') expect(c.resources.length + c.where.length, c.id).toBeGreaterThan(0)
      if (c.state === 'planned') expect(c.reasons.length, c.id).toBeGreaterThan(0)
      if (c.state === 'model') expect(c.resources.some(r => r.kind === 'model'), c.id).toBe(true)
      if (c.state === 'done') expect(c.resources.every(r => r.kind !== 'model') || c.where.length > 0 || c.resources.some(r => r.kind !== 'model'), c.id).toBe(true)
    }
    const s = cur.componentSummary()
    expect(s.done + s.partial + s.model + s.planned).toBe(310)
    // the 3D objects are honestly not there
    expect(cur.component('C01-003')!.state).toBe('planned')
  })

  it('course filters follow the candidate mapping', () => {
    expect(inCourse('—')).toBe(false)
    expect(inCourse('大学扩展（非DP必修）')).toBe(false)
    expect(inCourse('相关 2.2/3.2')).toBe(true)
    for (const s of SYSTEMS) expect(cur.topicsOf(s.id).length, s.id).toBeGreaterThan(20)
    expect(cur.topicsOf('cnJunior').every(t => t.courses.cnJunior !== '—')).toBe(true)
  })
})

describe('syllabus chapters', () => {
  it('reads the chapter codes of the candidate cells', () => {
    expect(chapterCodes('cnJunior', '相关 2.2/3.2')).toEqual(['2.2', '3.2'])
    expect(chapterCodes('cnSenior', '衔接/复习 必修1/2；选必1').sort()).toEqual(['B1', 'B2', 'X1'])
    expect(chapterCodes('cnSenior', '相关 必修2/选修1').sort()).toEqual(['B2', 'O1'])
    expect(chapterMatches('cnSenior', '选择性必修1.2', ['X1'])).toBe(true)
    expect(chapterMatches('cnSenior', '选修1.1', ['X1'])).toBe(false)
    expect(chapterCodes('igcse', '基础候选：3.2-3.4')).toEqual(['3.2', '3.3', '3.4'])
    expect(chapterCodes('igcse', '扩展候选：4 Electricity magnetism')).toEqual(['4'])
    expect(chapterCodes('ibdp', '相关 A.1/A.2/A.3/A.4')).toEqual(['A.1', 'A.2', 'A.3', 'A.4'])
    expect(chapterCodes('a9702', '相关 2-6,12-13')).toEqual(['2', '3', '4', '5', '6', '12', '13'])
    expect(chapterCodes('a9702', '基础衔接：1·实验技能')).toEqual(['1'])
    expect(chapterCodes('a9702', '大学扩展（非9702必修）')).toEqual([])
    expect(chapterMatches('cnSenior', '必修1.2', ['B1'])).toBe(true)
    expect(chapterMatches('igcse', '4.3', ['4'])).toBe(true)
  })

  it('every physics chapter of the mappable systems has at least one topic', () => {
    const empty: string[] = []
    for (const s of SYSTEMS.filter(s => MAPPABLE[s.id])) {
      for (const c of cur.chapters(s.id)) {
        if (/实验|跨学科|物理学与|Medical|Particle physics/.test(c[2]) && s.id !== 'ibdp') continue
        const n = cur.topics.filter(t => inCourse(t.courses[s.id]) && chapterMatches(s.id, c[1], chapterCodes(s.id, t.courses[s.id]))).length
        const extra = SUPPLEMENT[`${s.id}:${c[1]}`] ?? []
        for (const id of extra) expect(cur.topic(id), id).toBeTruthy()
        if (!n && !extra.length) empty.push(`${s.id} ${c[1]} ${c[2]}`)
      }
    }
    expect(empty).toEqual([])
  })
})

describe('acceptance evidence', () => {
  it('names test files and titles that exist', () => {
    expect(ACCEPTANCE.length).toBe(30)
    for (const a of ACCEPTANCE) {
      expect(a.tests.length).toBeGreaterThan(0)
      for (const ref of a.tests) {
        const [file, title] = ref.split(' › ')
        const text = existsSync(file) ? readFileSync(file, 'utf8') : null
        expect(text, file).not.toBeNull()
        if (title) expect(text!.includes(title), `${file}: ${title}`).toBe(true)
      }
    }
  })
})
