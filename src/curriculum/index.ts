/**
 * The curriculum layer (26.62, D222): load the blueprint data (lazily — 190 kB of JSON stays out of the first chunk),
 * name its positional rows, resolve each topic, experiment and component to the app's own resources and derive how it
 * is covered. Pure TypeScript: the dialog (CurriculumDialog.vue) and the tests use the same functions.
 *
 * Coverage of a topic (types.ts Coverage): `c:` in links.ts decides when given; otherwise a template, lab or preset
 * makes it "simulated", a verified model family "model", anything else "concept". A topic is never reported as
 * simulated because of a model alone, and never as more than its evidence: every verified family has independent
 * reference values (tests/fixtures/oracles2656.json).
 */
import type { Tri } from '../i18n/tri'
import type { ComponentRow, ComponentState, Coverage, CurriculumData, Resource, TopicRow } from './types'
import { COMPONENT_LINKS, PARTIAL_NOTES } from './components'
import { JUNIOR_LINKS, TOPIC_LINKS } from './links'
import { FEATURES } from './features'

export type { ComponentState, Coverage, CurriculumData, Resource, ResourceKind } from './types'
export { FEATURES } from './features'
export { WHERE, REASONS, PARTIAL_NOTES } from './components'
export { TOPIC_LINKS, JUNIOR_LINKS, COMPONENT_LINKS }

let loading: Promise<Curriculum> | null = null
let loaded: Curriculum | null = null

/** The data and its translations (zh → [en, de]), loaded once. */
export function loadCurriculum(): Promise<Curriculum> {
  if (loaded) return Promise.resolve(loaded)
  // the JSON is imported as text and parsed here: TypeScript never infers a type for 190 kB of rows
  loading ??= Promise.all([import('./data/curriculum.json?raw'), import('./data/i18n.json?raw')]).then(([d, t]) => {
    loaded = new Curriculum(JSON.parse(d.default) as CurriculumData, JSON.parse(t.default) as Record<string, [string, string]>)
    return loaded
  })
  return loading
}

/** The curriculum when it has been loaded (null before). */
export function curriculumIfLoaded(): Curriculum | null { return loaded }

/** The course systems of the topic table, with the column that holds the candidate mapping. */
export const SYSTEMS = [
  { id: 'cnJunior', col: 9, label: { zh: '中国初中 2022', en: 'China lower secondary 2022', de: 'China Sekundarstufe I 2022' } },
  { id: 'cnSenior', col: 10, label: { zh: '中国高中 2017/2020', en: 'China senior high 2017/2020', de: 'China Oberstufe 2017/2020' } },
  { id: 'igcse', col: 11, label: { zh: 'IGCSE 0625', en: 'IGCSE 0625', de: 'IGCSE 0625' } },
  { id: 'myp', col: 12, label: { zh: 'IB MYP', en: 'IB MYP', de: 'IB MYP' } },
  { id: 'ibdp', col: 13, label: { zh: 'IB DP 2025', en: 'IB DP 2025', de: 'IB DP 2025' } },
  { id: 'a9702', col: 14, label: { zh: 'Cambridge 9702', en: 'Cambridge 9702', de: 'Cambridge 9702' } },
  { id: 'university', col: 15, label: { zh: '大学', en: 'University', de: 'Universität' } }
] as const
export type SystemId = (typeof SYSTEMS)[number]['id']

/** How the syllabus index names each system (an ASCII part of its name in the workbook). */
export const SYLLABUS_SYSTEM: Record<SystemId, string> = { cnJunior: '2022', cnSenior: '2017', igcse: '0625', myp: 'MYP', ibdp: 'IB DP', a9702: '9702', university: 'OpenStax' }

/** Whether a candidate-mapping cell says the topic belongs to the course (not “—”, not a university extension). */
export function inCourse(cell: string): boolean {
  const c = cell.trim()
  return !!c && !/^(—|大学扩展|大学进阶)/.test(c)
}

export const MODES: Record<string, Tri> = {
  S1: { zh: '实时状态积分', en: 'Real-time state integration', de: 'Zeitschrittintegration' },
  S2: { zh: '解析或稳态求解', en: 'Analytic or steady-state solution', de: 'Analytische oder stationäre Lösung' },
  S3: { zh: '空间离散场计算', en: 'Discretised field computation', de: 'Diskretisierte Feldrechnung' },
  S4: { zh: '随机/统计仿真', en: 'Stochastic/statistical simulation', de: 'Stochastische/statistische Simulation' },
  D1: { zh: '概念/结构演示', en: 'Concept/structure demonstration', de: 'Konzept-/Strukturdarstellung' },
  D2: { zh: '数学/数据演示', en: 'Mathematics/data demonstration', de: 'Mathematik-/Datendarstellung' },
  H: { zh: '混合计算与演示', en: 'Mixed computation and demonstration', de: 'Gemischte Rechnung und Darstellung' },
  R: { zh: '真实实验配套（软件不能完全替代）', en: 'Companion to a real experiment (software cannot replace it)', de: 'Begleitung eines realen Versuchs (Software ersetzt ihn nicht)' }
}

export const COVERAGE_TEXT: Record<Coverage, Tri> = {
  simulated: { zh: '可仿真', en: 'Simulated', de: 'Simuliert' },
  model: { zh: '模型计算', en: 'Model', de: 'Modell' },
  concept: { zh: '概念与流程', en: 'Concept and workflow', de: 'Konzept und Ablauf' },
  real: { zh: '实物实验配套', en: 'Real-lab companion', de: 'Begleitung realer Versuche' }
}

export const STATE_TEXT: Record<ComponentState, Tri> = {
  done: { zh: '已实现', en: 'Done', de: 'Vorhanden' },
  partial: { zh: '部分', en: 'Partial', de: 'Teilweise' },
  model: { zh: '仅模型', en: 'Model only', de: 'Nur Modell' },
  planned: { zh: '未实现', en: 'Not yet', de: 'Noch nicht' }
}

/** Parse a links.ts entry: resources, the coverage override, where-keys and reasons. */
export function parseLinks(spec: string): { resources: Resource[]; coverage: Coverage | null; where: string[]; reasons: string[]; state: ComponentState | null } {
  const resources: Resource[] = []
  let coverage: Coverage | null = null
  let state: ComponentState | null = null
  const where: string[] = []
  const reasons: string[] = []
  for (const tok of spec.split(/\s+/).filter(Boolean)) {
    if (/^[A-Z]\d\d$/.test(tok)) { resources.push({ kind: 'model', id: tok }); continue }
    if (['done', 'partial', 'model', 'planned'].includes(tok)) { state = tok as ComponentState; continue }
    const i = tok.indexOf(':')
    const p = tok.slice(0, i)
    const v = tok.slice(i + 1)
    if (p === 't') resources.push({ kind: 'template', id: v })
    else if (p === 'l') { const [lab, preset] = v.split('/'); resources.push(preset ? { kind: 'preset', id: preset, lab } : { kind: 'lab', id: lab }) }
    else if (p === 'a') resources.push({ kind: 'activity', id: v })
    else if (p === 's') resources.push({ kind: 'lesson', id: v })
    else if (p === 'h') resources.push({ kind: 'handbook', id: v })
    else if (p === 'p') resources.push({ kind: 'problem', id: v })
    else if (p === 'f') resources.push({ kind: 'feature', id: v })
    else if (p === 'c') coverage = v as Coverage
    else if (p === 'w') where.push(v)
    else if (p === 'r') reasons.push(v)
    else throw new Error(`curriculum: unknown token ${tok}`)
  }
  return { resources, coverage, where, reasons, state }
}

/** Coverage from resources (a `c:` override wins). */
export function coverageOf(spec: string): Coverage {
  const p = parseLinks(spec)
  if (p.coverage) return p.coverage
  if (p.resources.some(r => r.kind === 'template' || r.kind === 'lab' || r.kind === 'preset')) return 'simulated'
  if (p.resources.some(r => r.kind === 'model')) return 'model'
  return 'concept'
}

export interface Topic {
  id: string; domain: string; name: string; level: string; mode: string; equation: string; solver: string; scene: string
  sceneId: string; difficulty: number; courses: Record<SystemId, string>; deps: string[]; priority: string
  accept: string; bound: string; url: string; resources: Resource[]; coverage: Coverage
}
export interface Component { id: string; layer: string; category: string; name: string; inputs: string; verify: string; stage: string; first: boolean; state: ComponentState; resources: Resource[]; where: string[]; reasons: string[]; note: Tri | null; usedBy: string[] }
export interface Experiment { code: string; name: string; category: string; apparatus: string; relation: string; virtual: string; limitation: string; url: string; status: string; resources: Resource[]; coverage: Coverage }

export class Curriculum {
  readonly topics: Topic[]
  readonly components: Component[]
  readonly experiments: Experiment[]
  constructor(readonly data: CurriculumData, readonly dict: Record<string, [string, string]>) {
    const sceneOf = new Map(data.scenes.map(([sid, tid]) => [tid, sid]))
    this.topics = data.topics.map((r: TopicRow) => {
      const spec = TOPIC_LINKS[r[0]] ?? ''
      const courses = Object.fromEntries(SYSTEMS.map(s => [s.id, r[s.col] as string])) as Record<SystemId, string>
      return {
        id: r[0], domain: r[1], name: r[2], level: r[3], mode: r[4], equation: r[5], solver: r[6], scene: r[7], sceneId: sceneOf.get(r[0]) ?? '',
        difficulty: r[8], courses, deps: r[16], priority: r[17], accept: data.accepts[r[18]], bound: data.bounds[r[19]], url: data.urls[r[20]],
        resources: parseLinks(spec).resources, coverage: coverageOf(spec)
      }
    })
    const usedBy = new Map<string, string[]>()
    for (const t of this.topics) for (const d of t.deps) usedBy.set(d, [...(usedBy.get(d) ?? []), t.id])
    this.components = data.components.map((r: ComponentRow) => {
      const p = parseLinks(COMPONENT_LINKS[r[0]] ?? 'planned')
      return { id: r[0], layer: r[1], category: r[2], name: r[3], inputs: r[4], verify: r[5], stage: r[6], first: r[7], state: p.state ?? 'planned', resources: p.resources, where: p.where, reasons: p.reasons, note: PARTIAL_NOTES[r[0]] ?? null, usedBy: usedBy.get(r[0]) ?? [] }
    })
    this.experiments = data.junior.map(r => {
      const spec = JUNIOR_LINKS[r[0]] ?? ''
      return { code: r[0], name: r[1], category: r[2], apparatus: r[3], relation: r[4], virtual: r[5], limitation: r[6], url: data.urls[r[7]], status: r[8], resources: parseLinks(spec).resources, coverage: coverageOf(spec) }
    })
  }

  /** A source string in the language (Chinese is the source; en/de from data/i18n.json; unknown → the source). */
  tr(zh: string, lang: 'zh' | 'en' | 'de'): string {
    if (lang === 'zh' || !zh) return zh
    const t = this.dict[zh]
    return t ? t[lang === 'en' ? 0 : 1] : zh
  }

  topic(id: string): Topic | undefined { return this.topics.find(t => t.id === id) }
  component(id: string): Component | undefined { return this.components.find(c => c.id === id) }
  domains(): string[] { return [...new Set(this.topics.map(t => t.domain))] }

  /** Topics of a course system (candidate mapping, see inCourse). */
  topicsOf(system: SystemId | null): Topic[] { return system ? this.topics.filter(t => inCourse(t.courses[system])) : this.topics }

  /** Counts per coverage for a list of topics. */
  summary(list: Topic[] = this.topics): Record<Coverage, number> {
    const out: Record<Coverage, number> = { simulated: 0, model: 0, concept: 0, real: 0 }
    for (const t of list) out[t.coverage]++
    return out
  }

  /** Counts per component state. */
  componentSummary(): Record<ComponentState, number> {
    const out: Record<ComponentState, number> = { done: 0, partial: 0, model: 0, planned: 0 }
    for (const c of this.components) out[c.state]++
    return out
  }

  /** Syllabus chapters of a system. */
  chapters(system: SystemId) { return this.data.syllabus.filter(r => r[0].includes(SYLLABUS_SYSTEM[system])) }
}

/** The label of a workflow. */
export function featureLabel(id: string): Tri | undefined { return FEATURES[id] }
