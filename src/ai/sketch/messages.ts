/**
 * What the user reads about a sketch build (26.64, D282): the assumptions the app made, the findings that were left,
 * and — when no scene could be loaded — plainly which parts could not be placed and which were. The diagnostics
 * themselves are written for the model (English, with paths); these are their lines for people, in the interface
 * language.
 */
import { tl } from '../../i18n'
import type { Diagnostic, SceneSketch } from './schema'
import { parsePath } from './patch'
import type { Assumption } from './compile'
import type { Ladder } from './check'

function sizeLabel(key: string): string {
  switch (key) {
    case 'width': return tl('宽度')
    case 'height': return tl('高度')
    case 'length': return tl('长度')
    case 'radius': return tl('半径')
    case 'naturalLength': return tl('原长')
    case 'distance': return tl('到原点的距离')
    case 'slopeAngle': return tl('倾角')
    case 'base': return tl('底边')
    case 'angle': return tl('圆心角')
    case 'count': return tl('级数')
    case 'stepHeight': return tl('每级的高度')
    case 'stepDepth': return tl('每级的深度')
    case 'mass': return tl('质量')
    case 'speed': return tl('初速度')
    case 'mu': case 'muS': case 'muK': return tl('摩擦因数')
    case 'restitution': return tl('恢复系数')
    case 'g': return tl('重力加速度')
    case 'stiffness': return tl('劲度系数')
    case 'heightAbove': return tl('离地高度')
    default: return key
  }
}
const metres = (key: string, v: string) => (/^[-\d.e]+$/i.test(v) && !['count'].includes(key) ? `${v} m` : v)

/** One assumption as a sentence. */
export function assumptionText(a: Assumption): string {
  const p = a.params.map(String)
  switch (a.key) {
    case 'g': return tl('题目没有给 g，取 {0} m/s²', [p[0]])
    case 'size': return tl('{0}的{1}题目没有给，取 {2}', [p[0], sizeLabel(p[1]), metres(p[1], p[2])])
    case 'cart': return tl('{0}按不转动的滑块处理（不计车轮）', [p[0]])
    case 'arcRadius': return tl('{0}：小球半径取 {2} m，球心沿半径 {1} m 的圆运动（与把小球当质点的答案一致）', [p[0], p[1], p[2]])
    case 'drop': return tl('{0}悬挂的高度题目没有给，取滑轮下方 {1} m', [p[0], p[1]])
    case 'smooth': return tl('{0}与{1}之间的摩擦题目没有给，按光滑处理', [p[0], p[1]])
    case 'springRelaxed': return tl('{0}开始时处于原长（原长 {1} m）', [p[0], p[1]])
    case 'springLength': return tl('{0}的原长题目没有给，按初始形变取 {1} m', [p[0], p[1]])
    case 'stated': return tl('{0}的{1}题目没有给，模型取 {2}', [p[0], sizeLabel(p[1]), p[2]])
    case 'templateDefault': return tl('模板参数“{0}”题目没有给，取默认值 {1}', [p[0], p[1]])
  }
  return `${a.key}: ${p.join(', ')}`
}

/** Assumptions as lines for the scene card: sizes are gathered into one line per object. */
export function assumptionLines(list: Assumption[]): string[] {
  const out: string[] = []
  const sizes = new Map<string, string[]>()
  for (const a of list) {
    if (a.key === 'size') { const n = String(a.params[0]); sizes.set(n, [...(sizes.get(n) ?? []), `${sizeLabel(String(a.params[1]))} ${metres(String(a.params[1]), String(a.params[2]))}`]) }
    else out.push(assumptionText(a))
  }
  for (const [name, parts] of sizes) out.push(tl('{0}的尺寸题目没有给，取：{1}', [name, parts.join('，')]))
  return out
}

/** What a diagnostic's path points at, in the words of the sketch (a name, a value row, a question). */
function subject(d: Diagnostic, sketch: SceneSketch | null, names: Record<string, string>): string {
  const p = parsePath(d.path)
  if (!sketch || !p || !p.length || !('key' in p[0])) return ''
  const list = (sketch as unknown as Record<string, unknown>)[p[0].key]
  const i = p[1] && 'index' in p[1] ? p[1].index : -1
  if (!Array.isArray(list) || i < 0 || i >= list.length) return ''
  const o = list[i] as Record<string, unknown>
  if (p[0].key === 'values' || p[0].key === 'templateParams') return `${o.of ? `${String(o.of).split('|').map(x => names[x.trim()] ?? x.trim()).join(' – ')} · ` : ''}${sizeLabel(String(o.quantity ?? o.key ?? ''))} = ${String(o.value)}${o.unit ? ` ${String(o.unit)}` : ''}`
  if (p[0].key === 'questions') return String(o.prompt ?? '')
  if (p[0].key === 'expect') return names[String(o.of)] ?? String(o.of ?? '')
  return String(o.name || names[String(o.id)] || o.id || '')
}

/** One finding as a sentence for the user. */
export function diagnosticText(d: Diagnostic, sketch: SceneSketch | null, names: Record<string, string> = {}): string {
  const s = subject(d, sketch, names) || tl('草图')
  switch (d.code) {
    case 'L2.floating': return tl('“{0}”没有被支撑，也没有绳或弹簧连到它', [s])
    case 'L2.contact': return tl('“{0}”与它应当接触的物体没有贴合，或碰到了不该碰的物体', [s])
    case 'L2.overlap': return tl('“{0}”与别的物体重叠', [s])
    case 'L2.offSupport': return tl('“{0}”放不到指定的位置上（超出了它的支撑面）', [s])
    case 'L2.cycle': return tl('这几个物体的位置互相依赖，定不下来（从“{0}”起）', [s])
    case 'L2.overconstrained': return tl('“{0}”被规定了两次且互相矛盾', [s])
    case 'L2.ropeState': return tl('绳“{0}”的松紧与题意不符', [s])
    case 'L2.ropeThroughBody': return tl('绳“{0}”穿过了物体', [s])
    case 'L2.tangent': return tl('绳“{0}”没有顺着物体的运动方向接到滑轮上', [s])
    case 'L2.springDeformation': return tl('弹簧“{0}”开始时的形变与给定值不符', [s])
    case 'L2.anchor': return tl('连接件“{0}”的端点不在物体上', [s])
    case 'L2.compile': return tl('引擎无法编译这个场景')
    case 'L3.solver': return tl('试运行时求解器出错')
    case 'L3.event': return tl('“{0}”在开始的瞬间出现了题目没有的变化（绳松弛、脱离或相撞）', [s])
    case 'L3.notAtRest': return tl('题目说“{0}”保持静止，试运行中它动了', [s])
    case 'L3.notMoving': return tl('题目说“{0}”会运动，试运行中它没有动', [s])
    case 'L3.notOnVerge': return tl('题目说“{0}”恰好不滑动，试运行中摩擦力没有达到最大值', [s])
    case 'L4.quote': return tl('这个量在题目里找不到出处：{0}', [s])
    case 'L4.quoteValue': return tl('这个量的数值与它引用的题目原文不一致：{0}', [s])
    case 'L4.quoteUnit': return tl('这个量的单位与它引用的题目原文不一致：{0}', [s])
    case 'L4.givenUnused': return tl('这个量没有用上：{0}', [s])
    case 'L4.question': return tl('这个所求读不出来：{0}', [s])
    case 'L4.bodyCount': return tl('可动物体的个数与题目不一致')
  }
  if (d.level === 0) return tl('模型的回答不是一份完整的草图（{0}）', [d.path || d.code])
  return tl('草图里“{0}”的描述有误（{1}）', [s, d.code])
}

/** Findings as lines, one per object and kind (several findings about one thing say the same to the user). */
export function diagnosticLines(list: Diagnostic[], sketch: SceneSketch | null, names: Record<string, string> = {}, max = 5): string[] {
  const lines = [...new Set(list.map(d => diagnosticText(d, sketch, names)))]
  return lines.length > max ? [...lines.slice(0, max), tl('……另有 {0} 处', [lines.length - max])] : lines
}

/**
 * The honest failure (D282): what could not be placed, and what was — no scene is loaded. The first line is the
 * summary; the rest are the findings and the placed parts.
 */
export function failureLines(l: Ladder): string[] {
  const out = diagnosticLines(l.diagnostics.filter(d => d.level <= 3).length ? l.diagnostics.filter(d => d.level <= 3) : l.diagnostics, l.sketch, l.names)
  const placed = l.placed.map(id => l.names[id] ?? id)
  if (placed.length) out.push(tl('已摆好的部分：{0}', [placed.join('、')]))
  const missing = l.unplaced.map(id => l.names[id] ?? id)
  if (missing.length) out.push(tl('没能摆好的部分：{0}', [missing.join('、')]))
  return out
}

/** The message of a failed build as one text. */
export function failureText(l: Ladder): string {
  return [tl('这道题我没能搭对，所以没有载入场景。这几处没摆对：'), ...failureLines(l).map(x => `· ${x}`)].join('\n')
}

/** L4 findings of a scene that was loaded all the same: told with the scene. */
export function contractLines(l: Ladder): string[] {
  const left = l.diagnostics.filter(d => d.level === 4)
  return left.length ? [tl('场景已载入，但与题目的核对有 {0} 处没有通过：', [left.length]), ...diagnosticLines(left, l.sketch, l.names)] : []
}

/** Status lines of the build. */
export const STATUS = {
  notes: () => tl('正在读题（写读题笔记）'),
  sketch: () => tl('正在写场景草图'),
  check: () => tl('正在编译并检查草图'),
  repair: (round: number) => tl('正在修正草图（第 {0} 轮）', [round]),
  template: () => tl('正在尝试用模板搭建'),
  retry: () => tl('模型返回了空内容，正在重试')
}
