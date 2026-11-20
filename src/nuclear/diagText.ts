/**
 * The wording of the diagnostics of the nuclear and reactor operations (26.64, D276–D278; the codes are listed in
 * engine/MESSAGES.md), of their errors and of the task checks. The core returns `{ code, severity, params }`; the
 * interface says it in the user's language. Pure.
 */
import { tl } from '../i18n'
import type { CoreDiagnostic } from '../engine/nuclear'
import { MessageError } from '../i18n/message'
import { fixed, halfLifeText, kelvinText, modeText, nuclideLabel, pcmText, percentText, sig, timeText } from './format'

/** Every diagnostic code the nuclear and reactor operations return (tests compare the list with the Rust source). */
export const NUCLEAR_CODES = [
  'nuclide.isomerFeeding', 'nuclide.branchSum', 'nuclide.branchUnknown', 'nuclide.halfLifeUnknown', 'nuclide.matrixSolution',
  'reactor.teachingModel', 'reactor.notConverged', 'reactor.promptCritical', 'reactor.shimPositive', 'reactor.solveBudget', 'reactor.trip', 'reactor.coreDamage'
] as const

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v))
const str = (v: unknown): string => String(v ?? '')

export function tripReason(reason: string): string {
  switch (reason) {
    case 'power': return tl('功率超过限值')
    case 'period': return tl('周期短于限值')
    case 'fuelTemperature': return tl('燃料温度超过限值')
    case 'manual': return tl('手动停堆')
    default: return reason
  }
}

/** One line for a diagnostic; the code itself for one this build does not know. */
export function diagnosticText(d: CoreDiagnostic): string {
  const p = d.params ?? {}
  switch (d.code) {
    case 'nuclide.isomerFeeding': return tl('{0} 的 {1} 衰变有多少落到同质异能态 {2} 没有数据，这里按全部到基态 {3} 计算。', [nuclideLabel(str(p.nuclide)), modeText(str(p.mode)), nuclideLabel(str(p.isomer)), nuclideLabel(str(p.assumed))])
    case 'nuclide.branchSum': return tl('{0} 已知的分支比合计只有 {1}，其余的去向没有跟踪。', [nuclideLabel(str(p.nuclide)), percentText(num(p.sum))])
    case 'nuclide.branchUnknown': return tl('{0} 的衰变方式或分支比未知，衰变链到它为止。', [nuclideLabel(str(p.nuclide))])
    case 'nuclide.halfLifeUnknown': return tl('{0} 的半衰期未知，衰变链到它为止。', [nuclideLabel(str(p.nuclide))])
    case 'nuclide.matrixSolution': return tl('{1} 个数值中有 {0} 个改用转移矩阵求出（衰变常数相近或时间很早，解析求和的舍入误差过大）；两种算法解的是同一组方程。', [num(p.values), num(p.of)])
    case 'reactor.teachingModel': return tl('教学模型：两群扩散、均匀化截面、集总热工，不能用于设计或安全分析。')
    case 'reactor.notConverged': return tl('增殖因数的迭代没有收敛到设定的精度，k = {0} 只是近似值。', [fixed(num(p.k), 5)])
    case 'reactor.promptCritical': return tl('反应性 {0} 已达到 0.9 β（{1}），接近瞬发临界：超出本模型的适用范围，仿真在 t = {2} 停下，不再往后算。', [pcmText(num(p.rho)), pcmText(num(p.limit)), timeText(num(p.t))])
    case 'reactor.shimPositive': return tl('这个布局在所给功率下不临界（k = {0}），平衡状态靠一项正的补偿反应性 {1} 维持；真实的堆里没有吸收体能提供它。', [fixed(num(p.k), 5), pcmText(num(p.shim))])
    case 'reactor.solveBudget': return tl('这一步里重新求解布局的次数用完了，只算到 t = {0}；继续运行会接着算。', [timeText(num(p.t))])
    case 'reactor.trip': return tl('保护停堆（{0}）：t = {1}，测得 {2}，限值 {3}。', [tripReason(str(p.reason)), timeText(num(p.t)), sig(num(p.value), 4), sig(num(p.limit), 4)])
    case 'reactor.coreDamage': return tl('堆芯损坏：t = {0} 时燃料最高温度 {1} 超过了损坏限值 {2}，仿真结束。', [timeText(num(p.t)), kelvinText(num(p.fuelT)), kelvinText(num(p.limit))])
    default: return d.code
  }
}

export function severityText(s: CoreDiagnostic['severity']): string {
  return s === 'error' ? tl('错误') : s === 'unmodelled' ? tl('未建模') : s === 'approx' ? tl('近似') : tl('说明')
}

/** Diagnostics without repeats (the same code and parameters said once), the general notice of the model left out. */
export function diagnosticLines(list: CoreDiagnostic[] | undefined, skip: string[] = ['reactor.teachingModel']): Array<{ code: string; severity: CoreDiagnostic['severity']; text: string }> {
  const seen = new Set<string>()
  const out: Array<{ code: string; severity: CoreDiagnostic['severity']; text: string }> = []
  for (const d of list ?? []) {
    if (skip.includes(d.code)) continue
    const key = d.code + JSON.stringify(d.params ?? {})
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ code: d.code, severity: d.severity, text: diagnosticText(d) })
  }
  return out
}

/**
 * The text of an error of the nuclear or reactor operations. The core reports them as `err.internal` with an English
 * detail (`nuclide: 'Xx-1' is not in the table`); the interface says which part failed and shows the detail as given.
 */
export function nuclearErrorText(e: unknown): string {
  const detail = e instanceof MessageError ? str(e.msg.params.message ?? e.msg.key) : e instanceof Error ? e.message : str(e)
  const m = /^(nuclide data|nuclide|decay network|reactor data|reactor task|reactor): (.*)$/s.exec(detail)
  if (!m) return tl('计算没有完成：{0}', [detail])
  switch (m[1]) {
    case 'nuclide data': return tl('核素数据文件无效：{0}', [m[2]])
    case 'nuclide': return tl('核素请求无法计算：{0}', [m[2]])
    case 'decay network': return tl('衰变网络无法计算：{0}', [m[2]])
    case 'reactor data': return tl('反应堆截面数据无效：{0}', [m[2]])
    case 'reactor task': return tl('任务无法检查：{0}', [m[2]])
    default: return tl('反应堆布局无法计算：{0}', [m[2]])
  }
}

export { halfLifeText }
