/**
 * The guided experiments in the interface of the chemistry bench (26.64, D270): the one runner of the page, the
 * gallery's switch, and the words for what a check compares — "pH of flask A: 9.93, needed 8.0–10.0". The numbers are
 * those the runner read from the core; this module only names and formats them.
 */
import { reactive } from 'vue'
import { tl } from '../../../i18n'
import { activeLang } from '../../../i18n/locale'
import { useBench } from '../../../chem/bench'
import { kindName, kindOf } from '../../../chem/apparatus'
import { speciesFormula } from '../../../chem/catalog'
import { equationText, reactionName } from '../../../chem/benchText'
import { sig } from '../../../chem/format'
import { createRunner, balanced } from '../../../chem/experiments/runner'
import type { Runner } from '../../../chem/experiments/runner'
import type { Term } from '../../../chem/experiments/check'
import type { Check, Experiment, ExperimentGroup, Quantity } from '../../../chem/experiments/types'

let shared: Runner | null = null
/** The runner of the 化学实验 page. */
export function useGuide(): Runner { return (shared ??= createRunner(useBench())) }

/** The gallery of guided experiments is open. */
export const guideUi = reactive({ gallery: false })

export function groupLabel(g: ExperimentGroup): string {
  return g === 'junior' ? tl('初中必做') : g === 'seniorCompulsory' ? tl('高中必修') : g === 'seniorElective' ? tl('高中选择性必修') : tl('经典演示')
}

const ids = (id: string | string[]) => (Array.isArray(id) ? id : [id]).map(speciesFormula).join(' + ')
const CHANNEL = (ch: 'r' | 'g' | 'b') => (ch === 'r' ? tl('红') : ch === 'g' ? tl('绿') : tl('蓝'))

/** What a quantity is, in words, and its unit. */
function quantityText(q: Quantity): { label: string; unit: string } {
  if (q.q === 'time') return { label: tl('经过的时间'), unit: 's' }
  const v = useBench().vesselName(q.v)
  switch (q.q) {
    case 'pH': return { label: tl('{0}的 pH', [v]), unit: '' }
    case 'T': return { label: tl('{0}的温度', [v]), unit: '°C' }
    case 'volume': return { label: tl('{0}中液体的体积', [v]), unit: 'mL' }
    case 'mass': return { label: tl('{0}中物质的质量', [v]), unit: 'g' }
    case 'water': return { label: tl('{0}中的水', [v]), unit: 'g' }
    case 'gasVolume': return { label: tl('{0}中气体的体积', [v]), unit: 'mL' }
    case 'pressure': return { label: tl('{0}内的压强', [v]), unit: 'kPa' }
    case 'solid': return { label: tl('{0}中的固体 {1}', [v, ids(q.id)]), unit: q.unit === 'g' ? 'g' : 'mol' }
    case 'gas': return { label: tl('{0}中的气体 {1}', [v, ids(q.id)]), unit: q.unit === 'mL' ? 'mL' : 'mol' }
    case 'species': return { label: tl('{0}溶液里的 {1}', [v, ids(q.id)]), unit: q.unit === 'M' ? 'mol/L' : 'mol' }
    case 'solute': case 'liquid': return { label: tl('{0}中的 {1}', [v, ids(q.id)]), unit: 'mol' }
    case 'released': return { label: tl('{0}放出的 {1}', [v, ids(q.id)]), unit: 'mol' }
    case 'colour': return { label: q.gas ? tl('{0}中气体颜色的{1}色分量', [v, CHANNEL(q.ch)]) : tl('{0}中液体颜色的{1}色分量', [v, CHANNEL(q.ch)]), unit: '' }
    case 'flame': return { label: tl('{0}焰色的{1}色分量', [v, CHANNEL(q.ch)]), unit: '' }
    case 'event':
      if (q.code === 'precipitate') return { label: tl('{0}中生成的沉淀 {1}', [v, q.id ? speciesFormula(q.id) : '']), unit: 'mol' }
      if (q.code === 'dissolved') return { label: tl('{0}中溶解的 {1}', [v, q.id ? speciesFormula(q.id) : '']), unit: 'mol' }
      if (q.code === 'gas') return { label: tl('{0}放出的 {1}', [v, q.id ? speciesFormula(q.id) : '']), unit: 'mol' }
      if (q.code === 'boiling') return { label: tl('{0}中蒸发的水', [v]), unit: 'mol' }
      return { label: tl('{0}中的反应：{1}', [v, q.id ? reactionName(q.id, activeLang()) : '']), unit: 'mol' }
    case 'circuit':
      if (q.field === 'emf') return { label: tl('电池的电动势'), unit: 'V' }
      if (q.field === 'I') return { label: tl('电路中的电流'), unit: 'A' }
      if (q.field === 'charge') return { label: tl('通过的电量'), unit: 'C' }
      return { label: tl('{0}电极的质量变化', [speciesFormula(q.electrode ?? '')]), unit: 'g' }
  }
}

const num = (x: number, unit: string) => { const s = Math.abs(x) < 1e-12 ? '0' : sig(x, 3); return unit ? `${s} ${unit}` : s }
function needText(min: number | undefined, max: number | undefined, unit: string): string {
  if (min !== undefined && max !== undefined) return `${num(min, '')} – ${num(max, unit)}`
  if (min !== undefined) return `≥ ${num(min, unit)}`
  if (max !== undefined) return `≤ ${num(max, unit)}`
  return ''
}

function flagText(c: Extract<Check, { flag: string }>): string {
  const b = useBench()
  const v = b.vesselName(c.v)
  const off = c.on === false
  switch (c.flag) {
    case 'closed': return off ? tl('{0}没有塞上', [v]) : tl('{0}已塞上塞子', [v])
    case 'heating': return off ? tl('{0}已停止加热', [v]) : tl('{0}正在加热', [v])
    case 'bath': return off ? tl('{0}不在水浴里', [v]) : tl('{0}放在水浴或冰浴里', [v])
    case 'ignited': return off ? tl('{0}处没有火焰', [v]) : tl('燃着的木条伸入{0}', [v])
    case 'collecting': return off ? tl('{0}不集气', [v]) : tl('{0}已设为集气', [v])
    default: return c.to ? tl('{0}的导管通到{1}', [v, b.vesselName(c.to)]) : tl('{0}接了导管', [v])
  }
}

/** One leaf of a check as a line of the runner: what is compared, what the bench shows, what is needed. */
export function termLine(t: Term): { label: string; value: string; need: string; ok: boolean } {
  const c = t.check
  if ('is' in c) {
    const q = quantityText(c.is)
    return { label: c.since ? tl('本步骤以来的变化：{0}', [q.label]) : q.label, value: t.value === null ? '—' : num(t.value, q.unit), need: needText(c.min, c.max, q.unit), ok: t.ok }
  }
  if ('ratio' in c) {
    return { label: tl('{0} 与 {1} 之比', [quantityText(c.ratio[0]).label, quantityText(c.ratio[1]).label]), value: t.value === null ? '—' : num(t.value, ''), need: needText(c.min, c.max, ''), ok: t.ok }
  }
  if ('flag' in c) return { label: flagText(c), value: '', need: '', ok: t.ok }
  if ('part' in c) return { label: tl('{0}上装有{1}', [useBench().vesselName(c.v), kindName(kindOf(c.part))]), value: '', need: '', ok: t.ok }
  if ('wired' in c) return { label: c.on === false ? tl('电路还没有接通') : tl('电路已接通'), value: '', need: '', ok: t.ok }
  return { label: '', value: '', need: '', ok: t.ok }
}

/** The balanced equations of an experiment as text (those the core balances). */
export function equationLines(e: Experiment): string[] {
  const out: string[] = []
  for (const q of e.equations) { const b = balanced(q); if (b) out.push(equationText(b.reactants, b.products, b.coefficients)) }
  return out
}

/** A report of the experiment as text: purpose, principle, steps with what the bench showed, safety. */
export function reportText(e: Experiment, done: number, record: string): string {
  const lines = [tl(e.title), '', `${tl('实验目的')}：${tl(e.goal)}`, `${tl('原理')}：${tl(e.principle)}`, ...equationLines(e).map(x => `  ${x}`), '', tl('步骤')]
  e.steps.forEach((s, i) => lines.push(`${i + 1}. [${i < done ? '✓' : ' '}] ${tl(s.text)}`))
  if (e.reduced) lines.push('', `${tl('范围')}：${tl(e.reduced)}`)
  if (e.limits) lines.push('', `${tl('模型之外')}：${tl(e.limits)}`)
  lines.push('', `${tl('真实实验的安全')}：${tl(e.safety)}`, '', tl('现象与结论（自己填写）：'), '', '', record)
  return lines.join('\n')
}
