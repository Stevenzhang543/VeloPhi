/**
 * What the AI may choose from when it reads a problem (D162): the built-in problems, the simulation templates,
 * the analytic models and the six task domains — a compact list for the first call, and the details of one choice
 * (parameters with units and ranges, bodies, readable quantities and events, model inputs and outputs, task
 * vocabulary) for the second call and for repairs. Built from the app's own tables, so the AI can only name things
 * that exist.
 */
import { TEMPLATES, templateById, buildTemplate } from '../../templates'
import { BUILTIN_PROBLEMS } from '../../teaching/problemBank'
import { CHAPTERS } from '../../teaching/problems'
import { MODELS, modelById } from '../../content/models'
import { DOMAINS } from '../../task/vocab'
import type { TaskDomain } from '../../task/types'
import { EngineSession } from '../../engine/session'
import { listQuantities } from '../../engine/observe'
import { ASSUMPTIONS } from '../../task/vocab'
import type { Scene } from '../../core/scene/types'

const zh = (t: { zh: string } | string) => (typeof t === 'string' ? t : t.zh)

/** Problem categories the AI assigns (D171): chapters, model types, levels, school stages. */
/** Model types of the problem categories (UI vocabulary, translated; defined with the problem categories). */
export { CATEGORY_TYPES } from '../../teaching/problemMeta'
export const LEVELS = ['basic', 'advanced', 'hard'] as const
export const STAGES = ['junior', 'senior', 'university'] as const

/** Engine events a question may refer to, with their meaning. */
export const EVENTS: Record<string, string> = {
  impact: '碰撞（两物体相碰，含落地）',
  touch: '接触（开始接触，无反弹）',
  separate: '分离（两物体脱离接触）',
  leave: '离开（物体离开某表面，如滑出斜面末端、离开桌边）',
  stick: '相对静止（开始一起运动 / 停止滑动）',
  slip: '开始相对滑动',
  reverse: '速度反向',
  slack: '绳变松弛',
  taut: '绳绷紧',
  zoneEnter: '进入场区（电场、磁场、液体等区域）',
  zoneLeave: '离开场区',
  rollStop: '停止滚动',
  limit: '到达滑轨限位'
}

/**
 * What a scene is made of (26.59 fix, D191): the counts the AI also gives for a problem, so a template is chosen only
 * when it holds every object of the problem — not because the topic sounds alike ("both are pulleys").
 */
export const STRUCTURE_KEYS = ['bodies', 'pulleys', 'movablePulleys', 'ropes', 'springs', 'rods', 'inclines'] as const
export type StructureKey = typeof STRUCTURE_KEYS[number]
export type Structure = Record<StructureKey, number>
export const STRUCTURE_LABEL: Record<StructureKey, string> = { bodies: '运动物体', pulleys: '滑轮', movablePulleys: '动滑轮', ropes: '绳', springs: '弹簧', rods: '轻杆或铰链', inclines: '斜面' }

/** The structure of a scene: moving bodies, pulleys (and how many move), ropes, springs, rods and hinges, inclines. */
export function structureOf(scene: Scene): Structure {
  const carriers = new Set(scene.pulleys.filter(p => p.body).map(p => p.body as string))
  return {
    // A body that only carries a pulley wheel is part of the pulley, not an object of its own
    bodies: scene.bodies.filter(b => b.kind !== 'static' && !(carriers.has(b.id) && b.mass < 1e-3)).length,
    pulleys: scene.pulleys.length,
    movablePulleys: scene.pulleys.filter(p => p.body).length,
    ropes: scene.connectors.filter(c => c.type === 'rope').length,
    springs: scene.connectors.filter(c => c.type === 'spring').length,
    rods: scene.connectors.filter(c => c.type === 'rod' || c.type === 'hinge').length,
    inclines: scene.bodies.filter(b => b.role === 'incline').length
  }
}

const structCache = new Map<string, Structure>()
/** The structure of a template with its default values (cached). */
export function templateStructure(id: string): Structure | null {
  if (structCache.has(id)) return structCache.get(id)!
  if (!templateById(id)) return null
  let s: Structure
  try { s = structureOf(buildTemplate(id)) } catch { return null }
  structCache.set(id, s)
  return s
}

/** "运动物体 2，滑轮 3（动滑轮 1），绳 1" — the non-zero counts. */
export function structureText(s: Structure): string {
  const parts: string[] = []
  for (const k of STRUCTURE_KEYS) {
    if (k === 'movablePulleys' || !s[k]) continue
    parts.push(k === 'pulleys' && s.movablePulleys ? `${STRUCTURE_LABEL[k]} ${s[k]}（动滑轮 ${s.movablePulleys}）` : `${STRUCTURE_LABEL[k]} ${s[k]}`)
  }
  return parts.join('，') || '无'
}

/** All chapter ids (built-in and the new ones of D171). */
export function chapterIds(): string[] { return CHAPTERS.map(c => c.id) }

let routeCache: string | null = null

/** The compact catalogue of the first call. */
export function routeCatalog(): string {
  if (routeCache) return routeCache
  const lines: string[] = []
  lines.push('## 内置例题（id｜章节｜标题｜所用模板）')
  for (const p of BUILTIN_PROBLEMS) lines.push(`${p.id}｜${p.chapter}｜${zh(p.title)}｜${p.template}`)
  lines.push('', '## 仿真模板（id｜分组｜名称｜说明｜结构｜参数：键=默认值单位）——模板的结构必须容得下题目里的每个物体')
  for (const t of TEMPLATES) { const st = templateStructure(t.id); lines.push(`${t.id}｜${t.group}｜${t.name}｜${t.description}｜${st ? structureText(st) : '?'}｜${t.params.map(p => `${p.key}=${p.value}${p.unit}`).join(', ')}`) }
  lines.push('', '## 解析模型（id｜名称｜输入｜输出）——不需要运动仿真的计算题（电路、热学、光学、近代物理、流体等）')
  for (const m of MODELS) lines.push(`${m.id}｜${zh(m.title)}｜${m.inputs.map(i => i.id).join(',')}｜${[...new Set(m.outputs.map(o => o.id))].join(',')}`)
  lines.push('', '## 任务领域（domain｜名称｜可求的量 key）——六类题型有解析求解与独立核对，优先用于这些题')
  for (const [id, d] of Object.entries(DOMAINS)) lines.push(`${id}｜${d.label}｜${d.targets.map(t => t.key).join(',')}`)
  lines.push('', `## 章节 id：${chapterIds().join(', ')}`)
  routeCache = lines.join('\n')
  return routeCache
}

/** Bodies of a template scene: id, name, kind. */
function bodiesOf(id: string): string[] {
  const s = buildTemplate(id)
  return s.bodies.map(b => `${b.id}（${b.name}，${b.kind === 'static' ? '固定' : b.kind === 'particle' ? '质点' : '刚体'}）`)
}

/** Readable quantities of a template (ids, label, SI unit), capped for many-body scenes. */
export function quantityLines(id: string, values: Record<string, number> = {}, cap = 160): string[] {
  const scene = buildTemplate(id, values)
  let session: EngineSession | null = null
  try {
    session = EngineSession.create(scene)
    const list = listQuantities(session)
    const dynamic = scene.bodies.filter(b => b.kind !== 'static').map(b => b.id)
    const keepBodies = new Set(dynamic.slice(0, 4))
    const out: string[] = []
    let skipped = 0
    for (const q of list) {
      const owner = q.id.split('.')[0]
      if (dynamic.includes(owner) && !keepBodies.has(owner)) { skipped++; continue }
      if (out.length >= cap) { skipped++; continue }
      out.push(`${q.id}｜${q.label}｜${q.unit || '1'}`)
    }
    if (skipped) out.push(`……另有 ${skipped} 个量（其余物体同理：<物体 id>.x、.v、.vx、.vy、.a、.ek 等）`)
    return out
  } catch {
    return []
  } finally {
    session?.free?.()
  }
}

/** Details of a template for the second call. */
export function templateDetail(id: string): string {
  const t = templateById(id)
  if (!t) return `（没有模板 ${id}）`
  const lines = [`## 模板 ${t.id}：${t.name}`, t.description, '', '### 参数（键｜名称｜单位｜默认值｜范围）']
  for (const p of t.params) lines.push(`${p.key}｜${p.label}｜${p.unit || '1'}｜${p.value}｜${p.min ?? '-∞'} ~ ${p.max ?? '+∞'}`)
  lines.push('', `### 物体：${bodiesOf(id).join('；')}`)
  lines.push('', '### 可读的量（id｜名称｜SI 单位）')
  lines.push(...quantityLines(id))
  lines.push('', '### 事件（event｜含义）', ...Object.entries(EVENTS).map(([k, v]) => `${k}｜${v}`))
  return lines.join('\n')
}

/** Details of an analytic model. */
export function modelDetail(id: string): string {
  const m = modelById(id)
  if (!m) return `（没有模型 ${id}）`
  const lines = [`## 解析模型 ${m.id}：${zh(m.title)}`, `适用：${zh(m.validity)}`, `假设：${m.assumptions.map(zh).join('；')}`, '', '### 输入（id｜名称｜SI 单位｜示例值）']
  for (const i of m.inputs) lines.push(`${i.id}｜${zh(i.label)}｜${i.unit || '1'}｜${i.value}`)
  lines.push('', '### 输出（id｜名称｜SI 单位）')
  const seen = new Set<string>()
  for (const o of m.outputs) { if (seen.has(o.id)) continue; seen.add(o.id); lines.push(`${o.id}｜${zh(o.label)}｜${o.unit || '1'}`) }
  lines.push('', `例：${zh(m.example.text)}`)
  return lines.join('\n')
}

/** Vocabulary of a task domain. */
export function taskDetail(domain: string): string {
  const d = DOMAINS[domain as TaskDomain]
  if (!d) return `（没有任务领域 ${domain}）`
  const lines = [`## 任务领域 ${d.id}：${d.label}`, '', '### 已知量（ref｜名称｜SI 单位）']
  for (const g of d.givens) lines.push(`${g.ref}｜${g.label}｜${g.unit || '1'}${g.initial ? '｜初始条件' : ''}`)
  lines.push('', '### 可求的量（key｜名称｜需要的条件）')
  for (const t of d.targets) lines.push(`${t.key}｜${t.label}｜${t.at === 'condition' ? `需要 condition：${t.condition?.label ?? ''}（${t.condition?.unit ?? ''}）` : t.at === 'time' ? '需要 t（时刻）' : '无'}`)
  if (d.options) {
    lines.push('', '### 选项（key｜可选值）')
    for (const [k, o] of Object.entries(d.options)) lines.push(`${k}｜${Object.keys(o.choices).join(' / ')}（默认 ${o.default}）`)
  }
  lines.push('', '### 假设 id', ...Object.entries(ASSUMPTIONS).map(([k, v]) => `${k}｜${v}`))
  return lines.join('\n')
}

/** Details of a built-in problem (its template and the parameters it varies). */
export function exampleDetail(id: string): string {
  const p = BUILTIN_PROBLEMS.find(x => x.id === id)
  if (!p) return `（没有例题 ${id}）`
  return [`## 例题 ${p.id}：${zh(p.title)}`, zh(p.stem), `模板：${p.template}；默认参数：${Object.entries(p.params).map(([k, v]) => `${k}=${v}`).join(', ')}`, '', templateDetail(p.template)].join('\n')
}
