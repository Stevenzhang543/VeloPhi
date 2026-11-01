/**
 * Rule-based reading of a text problem (26.57, D115; manual §6.1–6.4, VP-07). The parser proposes a candidate task:
 * the domain, the known values with the text they came from, the targets and their evaluation points. It never
 * decides a result: validation asks the smallest questions that change the answer, and the core computes.
 * Supported: the six domains of the first phase in Chinese school wording; anything else is reported as out of
 * scope with the manual form still available (§6.9). No language model and no OCR are used.
 *
 * Measured on the labelled set tests/fixtures/task-eval-*-2657.json (165 development cases; the 75 holdout cases were
 * frozen before this file was written, docs/coverage/task-eval-2657-freeze.md).
 */
import type { Evidence, Given, TaskDomain, TaskSpec, TaskTarget, TaskCondition } from './types'
import { makeTarget, makeTask } from './build'
import { toSI } from './compare'

const DEG = Math.PI / 180

/** A number with its unit and its place in the text. */
interface Tok { value: number; unit: string; si: number; start: number; end: number; raw: string }

/** Result of reading a text. */
export interface ParseResult {
  scope: 'in' | 'out'
  domain: TaskDomain | null
  /** Domains that also matched (a tie is reported, not guessed). */
  candidates: TaskDomain[]
  task: TaskSpec | null
  /** Numbers that were read but not used. */
  unused: Array<{ raw: string; span: [number, number] }>
  /** Why the text is out of scope (Chinese source text). */
  reason?: string
  reasonParams?: string[]
}

/** Full-width forms, minus signs, superscript exponents and μ spellings to one form (positions are kept). */
export function normalizeText(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if (c >= 0xff01 && c <= 0xff5e && !'，：；？！（）'.includes(ch)) out += String.fromCodePoint(c - 0xfee0)
    else if (ch === '（') out += '('
    else if (ch === '）') out += ')'
    else if ('−–—－'.includes(ch)) out += '-'
    else if (ch === 'µ') out += 'μ'
    else if (ch === '＋') out += '+'
    else out += ch
  }
  // 2×10⁵ → 2e5 (padded so that positions in the text stay where they were)
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
  return out.replace(/×\s*10(⁻?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (m: string, e: string) => ('e' + [...e].map(x => (x === '⁻' ? '-' : String(SUP.indexOf(x)))).join('')).padEnd(m.length, ' '))
}

const UNITS = ['m/s²', 'm/s^2', 'm/s2', 'km/h', 'm/s', 'kg', 'cm', 'mm', 'km', 'kΩ', 'Ω', 'μC', 'uC', 'nC', 'mC', 'mA', 'A', 'V', 'N', 'J', 'W', '°', '度', 'rad', 'g', 'm', 's', 'C']
const NUM = /([+-]?\d+(?:\.\d+)?(?:e-?\d+)?)\s*(m\/s²|m\/s\^2|m\/s2|km\/h|m\/s|kg|cm|mm|km|kΩ|Ω|μC|uC|nC|mC|mA|A(?![a-zA-Z])|V(?![a-zA-Z])|N(?![a-zA-Z])|J(?![a-zA-Z])|W(?![a-zA-Z])|°|度|rad|g(?![a-zA-Z=取])|m(?![a-zA-Z/²])|s(?![a-zA-Z])|C(?![a-zA-Z]))?/g

/** Every number of the text with its unit (unitless numbers keep unit ''). */
function tokens(t: string): Tok[] {
  const out: Tok[] = []
  for (const m of t.matchAll(NUM)) {
    const start = m.index!
    // skip digits that are part of names (R1, q2, m1, μs = …) and powers (10⁵)
    const prev = t[start - 1] ?? ''
    if (/[A-Za-z_]/.test(prev) && !/[+-]/.test(m[1][0])) continue
    const value = Number(m[1])
    if (!Number.isFinite(value)) continue
    const unit0 = m[2] ?? ''
    const unit = unit0 === '度' ? '°' : unit0 === 'm/s^2' || unit0 === 'm/s2' ? 'm/s²' : unit0 === 'uC' ? 'μC' : unit0
    let si: number
    if (unit === '°') si = value * DEG
    else if (unit === '') si = value
    else si = toSI(value, unit) ?? value
    out.push({ value, unit, si, start, end: start + m[0].length, raw: m[0] })
  }
  void UNITS
  return out
}

const before = (t: string, i: number, n = 14) => t.slice(Math.max(0, i - n), i)
const after = (t: string, i: number, n = 10) => t.slice(i, i + n)

/** Words that put a problem outside the first phase even when a domain word appears (manual §6.9). */
const OUT: Array<[RegExp, string]> = [
  [/弹簧|劲度系数/, '弹簧'], [/单摆|摆长/, '单摆'], [/磁场|磁感应|洛伦兹|磁感线/, '磁场'], [/气体|压强/, '气体'], [/光电|逸出功/, '光电效应'],
  [/半衰期|衰变|放射性/, '原子核'], [/卫星|宇宙速度|轨道/, '天体运动'], [/向心|弯道|圆周/, '圆周运动'], [/滑轮/, '连接体'], [/滚动|圆柱/, '滚动'],
  [/木板/, '板块模型'], [/传送带/, '传送带'], [/交流|有效值/, '交流电'], [/振荡|电感/, '振荡'], [/折射|双缝|干涉|衍射|条纹/, '波动光学'],
  [/加热|热量|比热/, '热学'], [/切割|感应电动势/, '电磁感应'], [/电容/, '电容器'], [/波长|波速|频率|简谐/, '波与振动'], [/跃迁|光子|氢原子/, '原子'],
  [/推力|拉力/, '外力作用'], [/飞船|\d\s*c\b|光速/, '相对论'], [/漂浮|浮力|密度/, '浮力'], [/机械效率/, '机械效率'], [/匀强电场/, '匀强电场中的运动']
]

/** Domain scores from the wording. */
function domainScores(t: string): Record<TaskDomain, number> {
  const s: Record<TaskDomain, number> = { incline: 0, projectile: 0, collision: 0, circuit: 0, lens: 0, field: 0 }
  if (/斜面/.test(t)) s.incline += 3
  if (/(抛|扔出|射出|推出)/.test(t) && !/射入/.test(t)) s.projectile += 3
  if (/平抛|斜抛|仰角|抛射角/.test(t)) s.projectile += 2
  if (/碰|撞|追尾|射入|抱在一起|粘在一起|粘合/.test(t)) s.collision += 3
  if (/电阻|内阻|电动势|串联|并联|电源/.test(t)) s.circuit += 3
  if (/Ω/.test(t)) s.circuit += 1
  if (/透镜|焦距|放大镜|物距|镜头|投影仪/.test(t)) s.lens += 3
  if (/电荷|场强|电场强度|电势|电场力|μC|nC/.test(t)) s.field += 3
  return s
}

let evid = 0
/** Read a text problem into a candidate task. */
export function parseProblem(text: string): ParseResult {
  const t = normalizeText(text)
  const scores = domainScores(t)
  const ranked = (Object.keys(scores) as TaskDomain[]).filter(d => scores[d] > 0).sort((a, b) => scores[b] - scores[a])
  const out = OUT.find(([re]) => re.test(t))
  if (out || !ranked.length) return { scope: 'out', domain: null, candidates: ranked, task: null, unused: [], reason: out ? '超出一期支持范围：{0}' : '没有识别到支持的题型（斜面、抛体、一维碰撞、直流电路、薄透镜、点电荷电场）', reasonParams: out ? [out[1]] : [] }
  const domain = ranked[0]
  const candidates = ranked.filter(d => scores[d] === scores[domain])
  const toks = tokens(t)
  const used = new Set<Tok>()
  const task = makeTask(domain, { stem: { text, source: 'text' }, assumptions: [] })
  task.assumptions = makeTask(domain).assumptions
  task.revision = 1
  const ev: Evidence[] = []
  const put = (ref: string, si: number, unit: string, raw: string, span?: [number, number], tok?: Tok, source: Given['source'] = 'stem') => {
    if (tok) used.add(tok)
    const list = isInitial(domain, ref) ? task.initialConditions : task.givens
    const same = list.filter(g => g.ref === ref)
    const g: Given = { ref, valueSI: si, unit, source, raw, span, status: 'adopted', revision: 1 }
    if (same.some(x => x.valueSI === si)) return
    if (same.length) g.status = 'conflict'
    list.push(g)
    ev.push({ id: `e${++evid}`, source, raw, span, boundTo: ref, status: g.status === 'conflict' ? 'conflict' : 'adopted', revision: 1 })
  }
  const q = questionPart(t)
  const ctx: Ctx = { t, toks, used, put, task, q, qStart: t.length - q.length }
  READERS[domain](ctx)
  task.evidence = ev
  const unused = toks.filter(x => !used.has(x)).map(x => ({ raw: x.raw, span: [x.start, x.end] as [number, number] }))
  return { scope: 'in', domain, candidates, task, unused }
}

interface Ctx { t: string; toks: Tok[]; used: Set<Tok>; put: (ref: string, si: number, unit: string, raw: string, span?: [number, number], tok?: Tok, source?: Given['source']) => void; task: TaskSpec; q: string; qStart: number }

const INITIAL = new Set(['blockA.v0', 'ball.v0', 'ball.alpha', 'A.u', 'B.u'])
const isInitial = (_d: TaskDomain, ref: string) => INITIAL.has(ref)

/** The asking part: from the last 求 / question mark clause to the end (or the whole text). */
function questionPart(t: string): string {
  const starts = [t.lastIndexOf('求'), t.search(/判断/), t.search(/[^，。,]*[？?]/)].filter(i => i >= 0)
  const i = starts.length ? Math.min(...starts) : -1
  if (i >= 0) return t.slice(i)
  const j = t.search(/(多少|多大|多长|多远|多久|吗|判断)/)
  if (j >= 0) { const k = Math.max(t.lastIndexOf('，', j), t.lastIndexOf('。', j)); return t.slice(k + 1) }
  return ''
}

/** Add a target (with a condition when it has one). */
function addTarget(ctx: Ctx, key: string, opts: { conditionValue?: number; tSI?: number; answerDomain?: string } = {}) {
  const id = ctx.task.targets.some(x => x.id === key) ? `${key}#${ctx.task.targets.length + 1}` : key
  if (ctx.task.targets.some(x => x.id.split('#')[0] === key && JSON.stringify(x.at) === JSON.stringify(opts))) return
  const { target, condition } = makeTarget(ctx.task, key, { ...opts, suffix: id === key ? undefined : id.split('#')[1] })
  if (opts.answerDomain) target.answerDomain = opts.answerDomain
  ctx.task.targets.push(target)
  if (condition) ctx.task.conditions.push(condition)
}
/** A target whose evaluation point is not given (validation asks for it). */
function addOpenTarget(ctx: Ctx, key: string) {
  const { target } = makeTarget(ctx.task, key)
  delete (target as Partial<TaskTarget>).at
  ctx.task.targets.push(target)
}

const g = (ctx: Ctx) => {
  for (const k of ctx.toks) if (k.unit === 'm/s²' && /g\s*(=|取|为)?\s*$|重力加速度\s*(=|取|为)?\s*$|取\s*$/.test(before(ctx.t, k.start, 8))) ctx.put('gravity.g', k.si, 'm/s²', k.raw, [k.start, k.end], k)
}

// ------------------------------------------------------------------ incline
function readIncline(ctx: Ctx) {
  const { t, toks, put } = ctx
  g(ctx)
  if (/光滑/.test(t)) { put('contact.muS', 0, '1', '光滑'); put('contact.muK', 0, '1', '光滑') }
  for (const k of toks) {
    const b = before(t, k.start)
    if (k.unit === 'kg' || (k.unit === 'g' && !/g\s*$/.test(b))) put('blockA.mass', k.si, 'kg', k.raw, [k.start, k.end], k)
    else if (k.unit === '°') put('incline.theta', k.si, 'rad', k.raw, [k.start, k.end], k)
  }
  // friction coefficients, “分别为 a 和 b” in the order the names were listed
  const resp = /(静摩擦因数|动摩擦因数|滑动摩擦因数)[和与、](静摩擦因数|动摩擦因数|滑动摩擦因数)分别为\s*([0-9.]+)\s*[和与、]\s*([0-9.]+)/.exec(t)
  if (resp) {
    const ref = (w: string) => (w === '静摩擦因数' ? 'contact.muS' : 'contact.muK')
    const n3 = toks.find(x => x.start === resp.index + resp[0].indexOf(resp[3], resp[1].length + resp[2].length))
    const n4 = toks.find(x => x.start === resp.index + resp[0].lastIndexOf(resp[4]))
    if (n3) put(ref(resp[1]), n3.si, '1', n3.raw, [n3.start, n3.end], n3)
    if (n4) put(ref(resp[2]), n4.si, '1', n4.raw, [n4.start, n4.end], n4)
  }
  for (const k of toks) {
    if (k.unit !== '' || ctx.used.has(k)) continue
    const b = before(t, k.start, 12)
    if (/(μs|μ_s|最大静摩擦因数|静摩擦因数)\s*(=|为|是|分别为)?\s*$/.test(b)) put('contact.muS', k.si, '1', k.raw, [k.start, k.end], k)
    else if (/(μk|μ_k|动摩擦因数|滑动摩擦因数)\s*(=|为|是)?\s*$/.test(b)) put('contact.muK', k.si, '1', k.raw, [k.start, k.end], k)
    else if (/(摩擦因数|μ)\s*(=|为|是)?\s*$/.test(b)) put('contact.muK', k.si, '1', k.raw, [k.start, k.end], k)
  }
  // initial velocity along the slope: up negative (down the slope is positive, manual §5.4)
  for (const k of toks) {
    if (k.unit !== 'm/s' && k.unit !== 'km/h') continue
    const end = [t.indexOf('，', k.end), t.indexOf('。', k.end), t.indexOf(',', k.end)].filter(x => x >= 0)
    const around = t.slice(Math.max(0, k.start - 16), end.length ? Math.min(...end) : t.length)
    const up = /向上|冲上|上滑|往上/.test(around)
    put('blockA.v0', up ? -Math.abs(k.si) : k.si, 'm/s', k.raw, [k.start, k.end], k)
  }
  if (/(由|从)静止|静止(释放|放|于|在|滑下|开始)|静止。|放在.*由静止/.test(t)) put('blockA.v0', 0, 'm/s', '静止')
  // the displacement of the condition and the time
  let d: number | undefined, tt: number | undefined
  for (const k of toks) {
    if (ctx.used.has(k)) continue
    if (['m', 'cm', 'km'].includes(k.unit) && /(下滑|滑行|移动|滑下|沿斜面|运动|滑|到达)[^，。,]{0,4}$/.test(before(t, k.start, 8))) { d = k.si; ctx.used.add(k) }
    else if (k.unit === 's') { tt = k.si; ctx.used.add(k) }
  }
  const q = ctx.q
  const want: string[] = []
  if (/能否静止|会沿斜面下滑吗|会不会|是否会|能否保持静止|判断物块能否/.test(q)) want.push('state')
  if (/加速度/.test(q)) want.push('a')
  if (/压力|支持力/.test(q)) want.push('N')
  if (/摩擦力(对物块)?做的功|摩擦力做功|克服摩擦/.test(q)) want.push('workAtS')
  else if (/摩擦力/.test(q)) want.push('f')
  if (/最大距离|最远/.test(q)) want.push('stopS')
  else if (/速度|速率/.test(q.replace(/加速度/g, ''))) want.push(d !== undefined ? 'speedAtS' : tt !== undefined ? 'speedAtT' : 'speed?')
  if (/时间|多久|多长时间/.test(q)) want.push(d !== undefined ? 'timeAtS' : 'time?')
  if (/位移/.test(q)) want.push(tt !== undefined ? 'sAtT' : 'disp?')
  for (const w of want) {
    if (w === 'speed?') addOpenTarget(ctx, 'speedAtT')
    else if (w === 'time?') addOpenTarget(ctx, 'timeAtS')
    else if (w === 'disp?') addOpenTarget(ctx, 'sAtT')
    else if (w === 'speedAtS' || w === 'timeAtS' || w === 'workAtS') addTarget(ctx, w, { conditionValue: d })
    else if (w === 'speedAtT' || w === 'sAtT') addTarget(ctx, w, { tSI: tt })
    else addTarget(ctx, w)
  }
  if (/光滑/.test(t)) ctx.task.assumptions.push({ id: 'smooth', source: 'stem' })
}

// --------------------------------------------------------------- projectile
function readProjectile(ctx: Ctx) {
  const { t, toks, put } = ctx
  g(ctx)
  let Y: number | undefined, tt: number | undefined
  for (const k of toks) {
    const b = before(t, k.start, 10), a = after(t, k.end, 6)
    if (k.unit === 'm/s' || k.unit === 'km/h') { if (!/竖直/.test(b)) put('ball.v0', k.si, 'm/s', k.raw, [k.start, k.end], k) }
    else if (k.unit === '°') put('ball.alpha', k.si, 'rad', k.raw, [k.start, k.end], k)
    else if (k.unit === 'kg' || k.unit === 'g') put('ball.mass', k.si, 'kg', k.raw, [k.start, k.end], k)
    else if (['m', 'cm'].includes(k.unit)) {
      if (/(到达|经过)[^，。,]{0,6}高\s*$/.test(b)) { Y = k.si; ctx.used.add(k) }
      else if (/(比|离|高出)抛出点高\s*$|抛出点高\s*$/.test(b) && !/^\s*的?(平台|楼顶|悬崖|桌面)/.test(a) && /比|离/.test(b)) { Y = k.si; ctx.used.add(k) }
      else if (/^\s*(高|的高)/.test(a) || /(离地|高|枪口离地|出手点离地|抛出点高)\s*$/.test(b)) put('ball.h0', k.si, 'm', k.raw, [k.start, k.end], k)
      else if (/高\s*$/.test(b)) { Y = k.si; ctx.used.add(k) }
    } else if (k.unit === 's') { tt = k.si; ctx.used.add(k) }
  }
  if (/水平(抛出|扔出|射出|推出|抛)|平抛/.test(t)) put('ball.alpha', 0, 'rad', '水平抛出')
  if (/(从|由)地面|地面(以|斜向上|上)/.test(t)) put('ball.h0', 0, 'm', '地面')
  if (/高处|平台|楼顶|悬崖|桌面|高台/.test(t) && !ctx.task.givens.some(x => x.ref === 'ball.h0')) ctx.task.options = { ...ctx.task.options, noDefault: 'ball.h0' }
  const q = ctx.q
  if (/射程|水平距离|落点/.test(q)) addTarget(ctx, 'R')
  if (/飞行(的)?(总)?时间|落地(所用)?的?时间|空中(运动|飞行)的时间|落地所用的时间|多长时间落地/.test(q)) addTarget(ctx, 'T')
  if (/最大高度|最高点/.test(q)) addTarget(ctx, 'H')
  if (/落地(时|前瞬间)?的?(速度|速率)|落地速度/.test(q)) addTarget(ctx, 'speedLand')
  if (/竖直(分)?速度/.test(q)) { if (tt !== undefined) addTarget(ctx, 'vyAtT', { tSI: tt }); else addOpenTarget(ctx, 'vyAtT') }
  if (Y !== undefined && /时刻|时间|何时|什么时候/.test(t)) {
    const dom = /第二次|下降/.test(t) ? 'falling' : /上升/.test(t) ? 'rising' : /第一次/.test(t) ? 'first' : 'ambiguous'
    addTarget(ctx, 'timeAtY', { conditionValue: Y, answerDomain: dom })
  }
  if (!ctx.task.targets.length && /速度|速率/.test(q)) addOpenTarget(ctx, 'vyAtT')
}

// ---------------------------------------------------------------- collision
function readCollision(ctx: Ctx) {
  const { t, toks, put } = ctx
  const label = (k: Tok): 'A' | 'B' | null => {
    const b = before(t, k.start, 8)
    const m = /(?:m|v|u)\s*([12AB])\s*=\s*$|m([AB])\s*=\s*$|([AB])\s*(?:球|物体|物块|滑块|冰壶)?\s*[（(]\s*$|(?:小球|物块|物体|滑块|球|冰壶)\s*([AB])\s*[（(]?\s*$/.exec(b)
    const l = m ? (m[1] ?? m[2] ?? m[3] ?? m[4]) : null
    return l === '1' || l === 'A' ? 'A' : l === '2' || l === 'B' ? 'B' : null
  }
  const masses = toks.filter(k => k.unit === 'kg' || k.unit === 'g')
  const vel = toks.filter(k => k.unit === 'm/s' || k.unit === 'km/h')
  if (/质量均为|质量都为|质量都是/.test(t) && masses.length === 1) { put('A.mass', masses[0].si, 'kg', masses[0].raw, [masses[0].start, masses[0].end], masses[0]); put('B.mass', masses[0].si, 'kg', masses[0].raw) }
  else {
    let next: 'A' | 'B' = 'A'
    const seen: number[] = []
    for (const k of masses) {
      // “碰前 1 kg 的球” names a ball already given, it is not a third mass
      if (seen.length >= 2 && seen.includes(k.si) || (seen.includes(k.si) && /^\s*的(球|小球|物体)/.test(after(t, k.end, 5)))) { ctx.used.add(k); continue }
      seen.push(k.si)
      const who: 'A' | 'B' = label(k) ?? (/又知\s*B|B\s*的质量为\s*$/.test(before(t, k.start, 10)) ? 'B' : null) ?? next
      put(`${who}.mass`, k.si, 'kg', k.raw, [k.start, k.end], k)
      next = who === 'A' ? 'B' : 'B'
    }
    if (/同质量|质量相同的/.test(t) && masses.length === 1) put('B.mass', masses[0].si, 'kg', '同质量')
  }
  let nextV: 'A' | 'B' = 'A'
  for (const k of vel) {
    const who = label(k) ?? nextV
    const around = t.slice(k.start, k.end + 10)
    const neg = /^\S*\s*(的速度)?\s*(向左|相向)/.test(t.slice(k.end, k.end + 8)) || (who === 'B' && /相向/.test(around))
    put(`${who}.u`, neg ? -Math.abs(k.si) : k.si, 'm/s', k.raw, [k.start, k.end], k)
    nextV = 'B'
  }
  for (const k of toks) {
    if (k.unit !== '') continue
    const b = before(t, k.start, 12)
    if (/恢复系数\s*(e)?\s*(=|为|是)?\s*$/.test(b)) put('contact.e', k.si, '1', k.raw, [k.start, k.end], k)
    else if (/v2\s*=\s*$|u2\s*=\s*$/.test(b) && k.si === 0) put('B.u', 0, 'm/s', k.raw, [k.start, k.end], k)
  }
  if (/(静止|原来静止)的?(小球|物块|物体|球|滑块|木块|冰壶|人|钢球)?\s*B|B\s*(原来)?静止|静止的|m2\s*静止|与静止|静止在/.test(t)) put('B.u', 0, 'm/s', '静止')
  const e = ctx.task.givens.find(x => x.ref === 'contact.e')
  const pi = /完全非弹性|粘在一起|粘合|结合在一起|连在一起|抱在一起|留在其中|一起运动/.test(t)
  const el = /弹性/.test(t.replace(/非弹性/g, ''))
  const inel = /非弹性/.test(t) && !/完全非弹性/.test(t)
  let kind = pi ? 'perfectlyInelastic' : el ? 'elastic' : inel || e ? 'inelastic' : ''
  if (el && e && e.valueSI !== 1) kind = 'conflict'
  ctx.task.options = { ...ctx.task.options, kind }
  const q = ctx.q
  if (/损失|转化为内能|产生的热/.test(q)) addTarget(ctx, 'loss')
  if (/总动量/.test(q)) addTarget(ctx, 'p')
  if (/速度/.test(q.replace(/碰前/g, ''))) {
    if (/两球|两物体|A、B|两者|两车/.test(q)) { addTarget(ctx, 'v1'); addTarget(ctx, 'v2') }
    else if (/B|木块|后者|第二/.test(q)) addTarget(ctx, 'v2')
    else if (/A|第一个/.test(q)) addTarget(ctx, 'v1')
    else if (/共同/.test(q) || kind === 'perfectlyInelastic') addTarget(ctx, 'v1')
    else { addTarget(ctx, 'v1'); addTarget(ctx, 'v2') }
  }
}

// ------------------------------------------------------------------ circuit
function readCircuit(ctx: Ctx) {
  const { t, toks, put } = ctx
  const volts = toks.filter(k => k.unit === 'V')
  for (const k of volts) put('source.E', k.si, 'V', k.raw, [k.start, k.end], k)
  const ideal = /理想电源|不计内阻|内阻不计|不计电源内阻/.test(t)
  if (ideal) put('source.r', 0, 'Ω', '理想电源')
  const ohms = toks.filter(k => k.unit === 'Ω' || k.unit === 'kΩ')
  const rs: Tok[] = []
  for (const k of ohms) {
    if (k.start >= ctx.qStart) { ctx.used.add(k); continue }
    const b = before(t, k.start, 10)
    if (/(内阻|r)\s*(=|为|是)?\s*$/.test(b)) { put('source.r', k.si, 'Ω', k.raw, [k.start, k.end], k); continue }
    const lab = /R\s*([12])\s*(=|为)?\s*$/.exec(b)
    if (lab) { put(`R${lab[1]}.R`, k.si, 'Ω', k.raw, [k.start, k.end], k); continue }
    rs.push(k)
  }
  const both = /两(只|个)(均为|都是)|两个(并联|串联)的/.exec(t)
  if (both && rs.length === 1) { put('R1.R', rs[0].si, 'Ω', rs[0].raw, [rs[0].start, rs[0].end], rs[0]); put('R2.R', rs[0].si, 'Ω', rs[0].raw) }
  else for (const k of rs) { const free = ctx.task.givens.some(x => x.ref === 'R1.R') ? 'R2.R' : 'R1.R'; put(free, k.si, 'Ω', k.raw, [k.start, k.end], k) }
  const ser = /串联/.test(t), par = /并联/.test(t)
  ctx.task.options = { ...ctx.task.options, connection: ser && par ? 'conflict' : ser ? 'series' : par ? 'parallel' : '' }
  const R1 = ctx.task.givens.find(x => x.ref === 'R1.R' && x.status === 'adopted')?.valueSI
  const R2 = ctx.task.givens.find(x => x.ref === 'R2.R' && x.status === 'adopted')?.valueSI
  /** Which resistor a phrase names: R1/R2, or by its value. */
  const which = (s: string): 1 | 2 | null => {
    const m = /R\s*([12])/.exec(s)
    if (m) return m[1] === '1' ? 1 : 2
    const v = /([0-9.]+)\s*Ω/.exec(s)
    if (v) { const x = Number(v[1]); return x === R1 ? 1 : x === R2 ? 2 : null }
    if (/灯丝/.test(s)) return 1
    return null
  }
  const q = ctx.q
  const parts = q.split(/[，,和与及以及]/)
  let any = false
  for (const p of parts) {
    if (/总电阻|等效电阻/.test(p)) { addTarget(ctx, 'Rt'); any = true }
    if (/每只|每个/.test(p) && /电压/.test(p)) { addTarget(ctx, 'U1'); addTarget(ctx, 'U2'); any = true; continue }
    if (/路端电压|输出电压|电压表|端电压/.test(p) && !/电阻两端|R\s*[12]\s*两端|灯丝/.test(p)) { addTarget(ctx, 'U'); any = true }
    else if (/两端的?电压/.test(p)) { const w = which(p); if (w) { addTarget(ctx, `U${w}`); any = true } }
    if (/通过/.test(p) && /电流/.test(p)) { const w = which(p); if (w) { addTarget(ctx, `I${w}`); any = true } }
    else if (/干路电流|总电流|电流表|电路中的电流|^\s*求?\s*电流/.test(p)) { addTarget(ctx, 'I'); any = true }
    if (/功率/.test(p)) { const w = which(p) ?? (/R\s*2|它/.test(p) ? 2 : null); if (w) { addTarget(ctx, `P${w}`); any = true } }
  }
  if (!any && /的电流和/.test(q)) addTarget(ctx, 'I')
}

// --------------------------------------------------------------------- lens
function readLens(ctx: Ctx) {
  const { t, toks, put } = ctx
  const concave = /凹透镜/.test(t), convex = /凸透镜|放大镜|照相机|镜头|投影仪/.test(t)
  for (const k of toks) {
    if (!['m', 'cm', 'mm'].includes(k.unit)) continue
    const b = before(t, k.start, 12)
    if (/焦距\s*(f)?\s*(=|为|是)?\s*$/.test(b)) {
      if (convex && k.si < 0) { put('lens.f', Math.abs(k.si), 'm', '凸透镜'); put('lens.f', k.si, 'm', k.raw, [k.start, k.end], k); continue }
      put('lens.f', concave ? -Math.abs(k.si) : k.si, 'm', k.raw, [k.start, k.end], k)
    } else if (/(物高|物体高|高)\s*(h)?\s*(=|为|是)?\s*$/.test(b) && /^\s*的?物体|^\s*[，,。]|^\s*$/.test(after(t, k.end, 4)) || /物高\s*(=|为)?\s*$/.test(b)) put('object.h', k.si, 'm', k.raw, [k.start, k.end], k)
    else if (/(物距\s*(u)?\s*(=|为|是)?|透镜前|它前面|距(凸)?透镜|距镜头|距放大镜|放大镜|透镜|镜头)\s*$/.test(b) || /^\s*(处|的物体)/.test(after(t, k.end, 4)) && /前\s*$/.test(b)) put('object.u', k.si, 'm', k.raw, [k.start, k.end], k)
  }
  if (!concave && !convex) ctx.task.options = { ...ctx.task.options, lensKind: '' }
  const q = ctx.q
  if (/像距|像的位置|光屏.*多远|离透镜多远/.test(q)) addTarget(ctx, 'v')
  if (/放大率|放大倍数/.test(q)) addTarget(ctx, 'm')
  if (/像高|像的高度/.test(q)) addTarget(ctx, 'hi')
  if (/性质|什么像/.test(q)) addTarget(ctx, 'nature')
}

// -------------------------------------------------------------------- field
function readField(ctx: Ctx) {
  const { t, toks, put } = ctx
  // coordinates “(a, b)” (units optional) and “x = a” positions
  const coords: Array<{ x: number; y: number; start: number; end: number; impliedY?: boolean }> = []
  for (const m of t.matchAll(/\(\s*([+-]?\d+(?:\.\d+)?)\s*(m|cm)?\s*,\s*([+-]?\d+(?:\.\d+)?)\s*(m|cm)?\s*\)/g)) {
    const f = (v: string, u?: string) => (u === 'cm' ? Number(v) / 100 : Number(v))
    coords.push({ x: f(m[1], m[2]), y: f(m[3], m[4]), start: m.index!, end: m.index! + m[0].length })
  }
  for (const m of t.matchAll(/x\s*=\s*([+-]?\d+(?:\.\d+)?)\s*(m|cm)?/g)) coords.push({ x: m[2] === 'cm' ? Number(m[1]) / 100 : Number(m[1]), y: 0, start: m.index!, end: m.index! + m[0].length, impliedY: true })
  for (const m of t.matchAll(/原点/g)) coords.push({ x: 0, y: 0, start: m.index!, end: m.index! + 2 })
  coords.sort((a, b) => a.start - b.start)
  for (const k of toks) if (coords.some(c => k.start >= c.start && k.end <= c.end)) ctx.used.add(k)
  const charges = toks.filter(k => ['C', 'μC', 'nC', 'mC'].includes(k.unit))
  const isTest = (k: Tok) => /试探电荷\s*(q)?\s*(=|为)?\s*$/.test(before(t, k.start, 8)) || /^\s*的试探电荷/.test(after(t, k.end, 8))
  const src = charges.filter(k => !isTest(k))
  const test = charges.find(isTest)
  // the question names the field point; the test charge's position is the field point too
  const qCoord = coords.filter(c => c.start >= ctx.qStart)
  const clause = (i: number) => { const a = Math.max(t.lastIndexOf('，', i - 1), t.lastIndexOf('。', i - 1), t.lastIndexOf('；', i - 1)); const b = [t.indexOf('，', i), t.indexOf('。', i), t.indexOf('；', i)].filter(x => x >= 0); return [a + 1, b.length ? Math.min(...b) : t.length] }
  const resp = /分别(位于|放在|在)/.exec(t)
  const srcCoords = coords.filter(c => c.start < ctx.qStart && !(test && Math.abs(c.start - test.end) < 12 && c.start > test.start) && !/P\s*(在|位于|点)?\s*$|场点\s*P?\s*(在|位于)?\s*$/.test(before(t, c.start, 8)) && !/P\s*$/.test(before(t, c.start, 2)))
  let positions: Array<{ x: number; y: number; impliedY?: boolean }> = []
  if (resp) positions = srcCoords.filter(c => c.start > resp.index).map(c => ({ x: c.x, y: c.y, impliedY: c.impliedY }))
  else positions = src.map(k => {
    const [a, b] = clause(k.start)
    const inClause = srcCoords.filter(c => c.start >= a && c.end <= b)
    // a position after the charge (“q 位于 (x, y)”) unless the text puts it first (“(x, y) 处有 q”)
    const dist = (c: { start: number; end: number }) => (c.start >= k.end ? c.start - k.end : k.start - c.end + (/处有|处的|处放/.test(t.slice(c.end, k.start)) ? 0 : 8))
    const near = inClause.sort((p, q2) => dist(p) - dist(q2))[0]
    return near ? { x: near.x, y: near.y, impliedY: near.impliedY } : null
  }).filter((p): p is { x: number; y: number; impliedY: boolean | undefined } => p !== null)
  const relabel = /又标为|同一电荷/.test(t)
  if (src.length === 1 && positions.length < 2 && /两个|等量/.test(t)) {
    const [a, b] = clause(src[0].start)
    const inClause = srcCoords.filter(c => c.start >= a && c.end <= b)
    if (inClause.length >= 2) positions = inClause.map(c => ({ x: c.x, y: c.y, impliedY: c.impliedY }))
  }
  if (src.length === 1 && positions.length === 2 && !relabel) src.push(src[0])
  // “相距 d”: the first charge at the origin, the second at x = d
  const apart = /相距\s*([0-9.]+)\s*(m|cm)/.exec(t)
  if (apart && src.length === 2 && positions.length === 0) { const d0 = apart[2] === 'cm' ? Number(apart[1]) / 100 : Number(apart[1]); positions = [{ x: 0, y: 0 }, { x: d0, y: 0 }] }
  src.forEach((k, i) => {
    const n = relabel ? 1 : i + 1
    if (n > 2) return
    put(`q${n}.q`, k.si, 'C', k.raw, [k.start, k.end], k)
    const p = positions[i] ?? (relabel ? positions[0] : undefined)
    if (p) { put(`q${n}.x`, p.x, 'm', '坐标'); put(`q${n}.y`, p.y, 'm', p.impliedY ? '在 x 轴上' : '坐标', undefined, undefined, p.impliedY ? 'default' : 'stem') }
  })
  if (test) put('test.q', test.si, 'C', test.raw, [test.start, test.end], test)
  // a second charge that is mentioned without its value must be asked for, not taken as zero
  if (src.length === 1 && /另一个(点)?电荷|两个(点)?电荷|q2/.test(t) && !ctx.task.givens.some(x => x.ref === 'q2.q')) {
    ctx.task.options = { ...ctx.task.options, noDefault: 'q2.q' }
    const other = srcCoords.find(c => !positions.some(p => p.x === c.x && p.y === c.y))
    if (other) { put('q2.x', other.x, 'm', '坐标'); put('q2.y', other.y, 'm', '坐标') }
  }
  // field point: the coordinate of the question, the test charge's place, “距它 d 处”, or the midpoint
  const testCoord = test ? coords.find(c => c.start > test.end && c.start - test.end < 14) : undefined
  const named = coords.filter(c => /P\s*(在|位于|点)?\s*$|场点\s*P?\s*(在|位于)?\s*$/.test(before(t, c.start, 8)) || /P\s*$/.test(before(t, c.start, 2)))
  const pList = [...(testCoord ? [testCoord] : []), ...named, ...qCoord]
  const pDistinct = pList.filter((c, i) => pList.findIndex(o => o.x === c.x && o.y === c.y) === i)
  for (const c of pDistinct) { put('P.x', c.x, 'm', '坐标'); put('P.y', c.y, 'm', c.impliedY ? '在 x 轴上' : '坐标', undefined, undefined, c.impliedY ? 'default' : 'stem') }
  for (const k of toks) {
    if (ctx.used.has(k) || !['m', 'cm'].includes(k.unit)) continue
    const b = before(t, k.start, 10)
    const b14 = before(t, k.start, 16)
    if ((/(?<!相)距(它|点电荷|该电荷)?\s*$/.test(b) || /^\s*处/.test(after(t, k.end, 3)) && /(?<!相)距/.test(b14)) && !/相距/.test(b14)) {
      put('P.x', k.si, 'm', k.raw, [k.start, k.end], k)
      if (!ctx.task.givens.some(x => x.ref === 'q1.x')) { put('q1.x', 0, 'm', '点电荷所在处为原点', undefined, undefined, 'default'); put('q1.y', 0, 'm', '点电荷所在处为原点', undefined, undefined, 'default') }
    } else if (/又说\s*P\s*在\s*$/.test(b)) put('P.x', k.si, 'm', k.raw, [k.start, k.end], k)
  }
  if (test && !ctx.task.givens.some(x => x.ref === 'P.x') && /所在(的)?(位置|处)|同一位置/.test(t)) {
    const x1 = ctx.task.givens.find(x => x.ref === 'q1.x')?.valueSI, y1 = ctx.task.givens.find(x => x.ref === 'q1.y')?.valueSI
    if (x1 !== undefined && y1 !== undefined) { put('P.x', x1, 'm', '电荷所在的位置'); put('P.y', y1, 'm', '电荷所在的位置') }
  }
  if (/中点/.test(t)) {
    const a = ctx.task.givens
    const x1 = a.find(x => x.ref === 'q1.x')?.valueSI, x2 = a.find(x => x.ref === 'q2.x')?.valueSI
    const y1 = a.find(x => x.ref === 'q1.y')?.valueSI ?? 0, y2 = a.find(x => x.ref === 'q2.y')?.valueSI ?? 0
    if (x1 !== undefined && x2 !== undefined) { put('P.x', (x1 + x2) / 2, 'm', '中点'); put('P.y', (y1 + y2) / 2, 'm', '中点') }
  }
  const q = ctx.q
  const eq = q.split(/以及|；/).filter(x => /场强|电场强度/.test(x)).join('')
  if (eq && !/(场强|电场强度|电场)的方向/.test(eq.replace(/大小和方向/, ''))) addTarget(ctx, 'E')
  if (/(场强|电场强度|电场)(的)?(大小)?和?方向|场强的方向/.test(eq)) addTarget(ctx, 'dir')
  if (/电势/.test(q)) addTarget(ctx, 'V')
  const fq = q.split(/以及|；/).filter(x => /电场力|受力/.test(x)).join('')
  if (fq) {
    if (/大小/.test(fq) || !/方向/.test(fq)) addTarget(ctx, 'F')
    if (/方向/.test(fq)) addTarget(ctx, 'Fdir')
  }
}

const READERS: Record<TaskDomain, (ctx: Ctx) => void> = { incline: readIncline, projectile: readProjectile, collision: readCollision, circuit: readCircuit, lens: readLens, field: readField }

/** Conditions of a parsed task (for the summary). */
export function conditionsOf(task: TaskSpec): TaskCondition[] { return task.conditions }

/** The SI value and unit of a number as written in a stem (“30°”, “72 km/h”, “2 μC”); null when it has none. */
export function tokenValue(raw: string): { si: number; siUnit: string; unit: string } | null {
  const t = tokens(normalizeText(raw))[0]
  if (!t) return null
  const siUnit = t.unit === '°' ? 'rad' : t.unit === '' ? '1' : t.unit === 'cm' || t.unit === 'mm' || t.unit === 'km' ? 'm' : t.unit === 'g' ? 'kg' : t.unit === 'km/h' ? 'm/s' : t.unit === 'μC' || t.unit === 'nC' || t.unit === 'mC' ? 'C' : t.unit === 'kΩ' ? 'Ω' : t.unit === 'mA' ? 'A' : t.unit
  return { si: t.si, siUnit, unit: t.unit }
}
