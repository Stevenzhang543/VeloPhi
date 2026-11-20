/**
 * The bench in words (26.64, D268, D273): the log as readable lines ("取 20.00 mL 1 mol/L 盐酸到锥形瓶 A"), what
 * happened as brief notes ("生成沉淀：氯化银"), and the core's diagnostics as the lines behind the “未建模” and “近似”
 * marks. Names of reagents and species come from the catalogue; everything else is interface text in the current
 * language. Numbers are the core's, formatted by format.ts.
 */
import { tl, listSep, colonSep, activeLang } from '../i18n'
import type { BenchAction, Diagnostic } from '../engine/chem'
import { kindOf } from './apparatus'
import { reactionOf, reagentText, speciesFormula, speciesName } from './catalog'
import { fixed, fmtAmount, fmtAmountOf, fmtDuration, fmtPower, fmtPressure, fmtTemp, fmtVolume, qty, sig, withUnit } from './format'
import type { Phenomenon } from './bench'

/** What names a vessel in a line: its name on the bench and (for a burette's wording) its kind. */
export interface LineContext { name: (id: string) => string; kind: (id: string) => string | undefined }

function amountText(a: { value: number; unit: string }): string {
  if (a.unit === 'drop') return a.value === 1 ? tl('1 滴') : tl('{0} 滴', [fmtAmountOf(a)])
  if (a.unit === 'fraction') return qty(a.value * 100, '%', 0)
  return fmtAmountOf(a)
}

/** One entry of the log as a line of the record. */
export function logLine(e: BenchAction, ctx: LineContext): string {
  const n = ctx.name
  switch (e.act) {
    case 'place': return tl('放置{0}（{1}）', [n(e.object.id), qty(e.object.capacity_mL ?? null, 'mL', 0)])
    case 'remove': return tl('移走{0}', [n(e.id)])
    case 'add': return tl('取 {0} {1}到{2}', [amountText(e.amount), reagentText(e.reagent), n(e.to)])
    case 'pour':
      if (!e.amount) return tl('把{0}全部倒入{1}', [n(e.from), n(e.to)])
      return kindOf(ctx.kind(e.from) ?? '')?.vessel?.tap ? tl('{0}向{1}滴加 {2}', [n(e.from), n(e.to), amountText(e.amount)]) : tl('从{0}向{1}倒入 {2}', [n(e.from), n(e.to), amountText(e.amount)])
    case 'filter': return tl('把{0}过滤到{1}', [n(e.from), n(e.to)])
    case 'empty': return tl('清空{0}', [n(e.vessel)])
    case 'heat': return e.power > 0 ? tl('加热{0}（{1}）', [n(e.vessel), fmtPower(e.power)]) : tl('停止加热{0}', [n(e.vessel)])
    case 'bath': return e.T === null ? tl('取出{0}的浴', [n(e.vessel)]) : tl('{0}放入 {1} 的浴中', [n(e.vessel), fmtTemp(e.T, 0)])
    case 'stopper': return e.on ? tl('塞上{0}', [n(e.vessel)]) : tl('打开{0}', [n(e.vessel)])
    case 'connect': return tl('用导管连接{0}与{1}', [n(e.from), n(e.to)])
    case 'disconnect': return tl('拆下{0}的导管', [n(e.from)])
    case 'collector': return e.mode === 'water' ? tl('{0}改为排水集气', [n(e.vessel)]) : e.mode === 'up' ? tl('{0}改为向上排空气', [n(e.vessel)]) : e.mode === 'down' ? tl('{0}改为向下排空气', [n(e.vessel)]) : tl('{0}不再集气', [n(e.vessel)])
    case 'ignite': return e.on === false ? tl('熄灭{0}', [n(e.vessel)]) : tl('点燃{0}', [n(e.vessel)])
    case 'light': return e.on === false ? tl('停止光照{0}', [n(e.vessel)]) : tl('光照{0}', [n(e.vessel)])
    case 'ambient': {
      const parts: string[] = []
      if (e.T !== undefined) parts.push(fmtTemp(e.T, 1))
      if (e.P !== undefined) parts.push(fmtPressure(e.P * 101325, 1))
      return tl('室内条件：{0}', [parts.join(listSep())])
    }
    case 'wait': return tl('等待 {0}', [fmtDuration(e.seconds * (e.times ?? 1))])
    case 'circuit': return tl('连接电极：{0}（{1}）与{2}（{3}）', [speciesName(e.a.electrode), n(e.a.vessel), speciesName(e.b.electrode), n(e.b.vessel)])
    case 'circuitSet': {
      const parts: string[] = []
      if (e.load !== undefined) parts.push(tl('负载 {0}', [withUnit(sig(e.load, 3), 'Ω')]))
      if (e.source !== undefined) parts.push(e.source > 0 ? tl('电源 {0}', [withUnit(sig(e.source, 3), 'V')]) : tl('撤去电源'))
      if (e.bridge !== undefined) parts.push(e.bridge ? tl('接入盐桥') : tl('撤去盐桥'))
      if (e.on !== undefined) parts.push(e.on ? tl('闭合开关') : tl('断开开关'))
      return tl('电路 {0}：{1}', [e.id, parts.join(listSep())])
    }
    case 'circuitRemove': return tl('拆除电路 {0}', [e.id])
    default: return String((e as { act: string }).act)
  }
}

/** The name of a declared reaction: the catalogue's, else its id. */
export function reactionName(id: string, lang: 'zh' | 'en' | 'de'): string {
  const name = reactionOf(id)?.name
  if (!name) return id
  return typeof name === 'string' ? name : name[lang] ?? name.zh
}

/** A phenomenon as the brief note near its vessel (and a line of the inspector). */
export function phenomenonText(p: Phenomenon, lang: 'zh' | 'en' | 'de'): string {
  switch (p.code) {
    case 'precipitate': return tl('生成沉淀：{0}', [speciesName(p.subject)])
    case 'dissolved': return tl('溶解：{0}', [speciesName(p.subject)])
    case 'gas': return tl('放出气体：{0} {1}', [speciesName(p.subject), fmtAmount(p.n, 2)])
    case 'reaction': return tl('反应：{0}', [reactionName(p.subject, lang)])
    case 'boiling': return tl('沸腾')
    case 'collect.dissolved': return tl('溶于水，未收集：{0} {1}', [speciesName(p.subject), fmtAmount(p.n, 2)])
    case 'collect.full': return tl('已集满')
    case 'collect.wrongWay': return tl('排空气方向不对，气体逸出')
    case 'kinetics.noDissolutionRate': return tl('{0}没有溶解速率数据，按粉末处理', [speciesName(p.subject)])
    case 'kinetics.coarseSteps': return tl('反应很快，时间步偏粗')
    case 'overflow': return tl('溢到台面上：{0}', [fmtVolume(p.n, 1)])
    case 'stopper.blown': return tl('压强过大，塞子冲出')
    case 'vessel.cracked': return p.subject === 'shock' ? tl('骤冷破裂：热的器材遇到冷的液体') : tl('受热破裂：这种器材不能直接加热')
    default: return p.code
  }
}

/** Is this phenomenon an approximation the core made (shown with the “近似” mark) rather than something seen? */
export function isApproxNote(p: Phenomenon): boolean { return p.code.startsWith('kinetics.') || (p.code === 'reaction' && p.teaching) }

export type MarkKind = 'unmodelled' | 'approx' | 'info' | 'error'

/** The word of a mark. */
export function markLabel(kind: MarkKind): string {
  return kind === 'unmodelled' ? tl('未建模') : kind === 'approx' ? tl('近似') : kind === 'error' ? tl('错误') : tl('提示')
}

/** A diagnostic of the core as a line: what the model left out, or did approximately, and for which part of the mixture. */
export function diagnosticText(d: Diagnostic): string {
  const p = d.params ?? {}
  const names = (v: unknown) => (Array.isArray(v) ? v.map(x => speciesName(String(x))).join(listSep()) : '')
  const strength = withUnit(sig(Number(p.I), 2), 'mol/kg')
  switch (d.code) {
    case 'reaction.unmodelled': return tl('会反应，但没有模型：{0}', [reactionName(String(p.id), activeLang())])
    case 'reaction.none': return tl('不反应：{0}', [reactionName(String(p.id), activeLang())])
    case 'redox.unmodelled': return tl('{0}与{1}之间的氧化还原反应没有数据，二者只是共存', [speciesName(String(p.oxidant)), speciesName(String(p.reductant))])
    case 'equil.outsideNetwork': return tl('不在平衡网络内，只是共存：{0}', [names(p.species)])
    case 'equil.concentrated': return tl('浓溶液，活度系数为近似（离子强度 {0}）', [strength])
    case 'equil.beyondActivityModel': return tl('超出活度模型的范围（离子强度 {0}）', [strength])
    case 'bench.beyondModel': return tl('混合物有一部分在模型之外')
    case 'thermal.unknownEnthalpy': return tl('焓未知，未计入热量：{0}', [names(p.species)])
    default: return d.code
  }
}

/** The log for reading: equal consecutive entries (a pour by hand, portion after portion) are one line with a count. */
export function groupedLog(log: BenchAction[]): Array<{ entry: BenchAction; count: number; wait: boolean }> {
  const out: Array<{ entry: BenchAction; count: number; wait: boolean; key: string }> = []
  for (const e of log) {
    const key = JSON.stringify(e)
    const last = out[out.length - 1]
    if (last && last.key === key && e.act !== 'wait') last.count++
    else out.push({ entry: e, count: 1, wait: e.act === 'wait', key })
  }
  return out
}

/** The balanced equation of a declared reaction with the coefficients given: "Zn + 2 H⁺ → Zn²⁺ + H₂". */
export function equationText(reactants: string[], products: string[], coefficients: number[]): string {
  const side = (ids: string[], at: number) => ids.map((id, i) => `${coefficients[at + i] === 1 ? '' : `${coefficients[at + i]} `}${speciesFormula(id)}`).join(' + ')
  return `${side(reactants, 0)} → ${side(products, reactants.length)}`
}

/** The bench as a lab record in plain text: the room, every step, and where each vessel stands at the end. */
export function recordText(b: { log: { value: BenchAction[] }; state: { value: { time: number; ambient: { T: number; P: number }; vessels: Array<{ id: string; kind: string; T: number; volume_mL: number; mass_g: number; pH?: number }> } | null }; vesselName: (id: string) => string; objectOf: (id: string) => { kind: string } | undefined; hash: () => string }, date: string): string {
  const s = b.state.value
  const kinds = new Map<string, string>()
  for (const e of b.log.value) if (e.act === 'place') kinds.set(e.object.id, e.object.kind)
  const ctx: LineContext = { name: b.vesselName, kind: id => b.objectOf(id)?.kind ?? kinds.get(id) }
  const lines: string[] = [tl('VeloΦ 实验记录'), date, '']
  if (s) lines.push(tl('室内条件：{0}', [[fmtTemp(s.ambient.T, 1), fmtPressure(s.ambient.P, 1)].join(listSep())]), '')
  groupedLog(b.log.value).forEach((g, i) => lines.push(`${i + 1}. ${logLine(g.entry, ctx)}${g.count > 1 ? ` × ${g.count}` : ''}`))
  if (s?.vessels.length) {
    lines.push('', tl('结束时'))
    for (const v of s.vessels) {
      const parts = [fmtTemp(v.T, 1), qty(v.volume_mL, 'mL', 2), fmtAmountOf({ value: v.mass_g, unit: 'g' })]
      if (v.pH !== undefined) parts.push(`pH ${fixed(v.pH, 2)}`)
      lines.push(`${b.vesselName(v.id)}${colonSep()}${parts.join(listSep())}`)
    }
  }
  lines.push('', tl('状态指纹 {0}', [b.hash().slice(0, 16)]))
  return lines.join('\n')
}
