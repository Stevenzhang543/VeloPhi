/**
 * The curriculum layer (26.62, D222): the topics, components, scenes, acceptance cases, syllabus chapters and the 21
 * required lower-secondary experiments of 《VeloPhi 物理课程 × 仿真 × 组件开发总账》 (docs/curriculum, research baseline
 * 2026-11-08) as data, and their mapping to what the app has (links.ts, components.ts). The rows are positional to keep
 * the generated JSON small; the accessors in index.ts give them names.
 */

/** One row of 知识模拟总表 (positional, see scripts/curriculum/import.py). */
export type TopicRow = [
  id: string, domain: string, name: string, level: string, mode: string, equation: string, solver: string, scene: string,
  difficulty: number, cnJunior: string, cnSenior: string, igcse: string, myp: string, ibdp: string, a9702: string,
  university: string, deps: string[], priority: string, accept: number, bound: number, url: number
]

/** One row of 物理与软件组件库. */
export type ComponentRow = [id: string, layer: string, category: string, name: string, inputs: string, verify: string, stage: string, first: boolean]

export interface CurriculumData {
  source: { file: string; sha256: string; baseline: string }
  kernel: string
  interface: string
  priorities: Array<[string, number, string]>
  advice: string
  urls: string[]
  accepts: string[]
  bounds: string[]
  topics: TopicRow[]
  scenes: Array<[string, string]>
  components: ComponentRow[]
  /** 数值与教学验收: domain, case, criterion, stage. */
  acceptance: Array<[string, string, string, string]>
  /** 研发阶段 Roadmap: stage, theme, deliverables, gate, priority, domain. */
  roadmap: Array<[string, string, string, string, string, string]>
  /** 课程标准来源: name, version, stage, scope, rule, url. */
  sources: Array<[string, string, string, string, string, string]>
  rules: string[]
  /** 官方课程章节索引: system, code, title, depth, url, note. */
  syllabus: Array<[string, string, string, string, string, string]>
  /** 中国初中 21 项必做实验: code, name, category, apparatus, relation, virtual content, limitation, url, status. */
  junior: Array<[string, string, string, string, string, string, string, number, string]>
}

/** What a topic or component opens in the app. */
export type ResourceKind = 'model' | 'template' | 'lab' | 'preset' | 'activity' | 'lesson' | 'problem' | 'handbook' | 'formula' | 'feature'
export interface Resource { kind: ResourceKind; id: string; /** lab id of a circuit preset */ lab?: string }

/**
 * How a topic is covered:
 * - simulated: an interactive scene or lab computes it (template, lab or preset);
 * - model: a verified model family (calculator with conditions, branches and references) and its cards;
 * - concept: a handbook page, a model card read as a concept, or a teaching workflow — the topic is not a computation;
 * - real: a real-laboratory skill: the app offers virtual reading practice, which does not replace the instrument.
 */
export type Coverage = 'simulated' | 'model' | 'concept' | 'real'

/** How a component is realised. */
export type ComponentState = 'done' | 'partial' | 'model' | 'planned'
