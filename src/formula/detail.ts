/**
 * Formula detail view (manual 26.50, D28): derivation, step-by-step substitution with the current scene's values,
 * applicability conditions and the comparison with the simulation, for one formula card. Pure (no Vue): the detail
 * panel and the exports call `buildFormulaDetail` and render the returned DetailView.
 *
 * The card is evaluated with the same `evaluateCard` and the same sample time as the formula panel, and the
 * generated solution (formula/solve.ts) ends on a value bit-identical to the card's theoretical value.
 *
 * Situation texts (situation title, variable, measurement and condition labels) are taken from the situation as
 * they are; `situationText` is the single place that turns them into display text.
 */
import type { Recording } from '../core/solver/simulation'
import type { Lang, Tri } from '../i18n/tri'
import { fillParams, triText } from '../i18n/tri'
import type { UnitChoice } from '../units/units'
import { defaultChoice, formatQuantity } from '../units/units'
import type { FormulaDef } from './library'
import { FORMULAS } from './library'
import type { FormulaCard, Verdict } from './match'
import { THRESHOLDS, activeSituations, evaluateCard } from './match'
import type { Condition, Situation } from './situations'
import type { Derivation, SharedSteps } from './derivations/types'
import { getDerivation, getShared } from './derivations'
import { solveFormula } from './solve'
import type { DetailBlock, DetailCell, DetailCondition, DetailSection, DetailView, Tone } from './detailTypes'

/** Options of the detail builders. */
export interface DetailOptions {
  /** Significant digits of the values (default 4, the readout default). */
  digits?: number
  /** Display units (default SI with angles in degrees). */
  units?: UnitChoice
  /** Derivation lookup (default: the registry in formula/derivations). */
  derivation?: (formulaId: string) => Derivation | null
  /** Shared step lookup (default: the registry). */
  shared?: (id: string) => SharedSteps | null
}

const T = (zh: string, en: string, de: string): Tri => ({ zh, en, de })

/** Texts of the formula detail (content, in the three languages). */
export const FORMULA_TEXT = {
  derivation: T('推导', 'Derivation', 'Herleitung'),
  solution: T('解题过程', 'Worked solution', 'Lösungsweg'),
  given: T('已知', 'Given', 'Gegeben'),
  find: T('求', 'Find', 'Gesucht'),
  solve: T('解', 'Solution', 'Lösung'),
  answer: T('答', 'Answer', 'Antwort'),
  findText: T('{t}：${l}$', '{t}: ${l}$', '{t}: ${l}$'),
  byFormula: T('由公式（{t}）：', 'Use the formula ({t}):', 'Mit der Formel ({t}):'),
  conversion: T('单位换算（计算用国际单位）：{c}', 'Convert to SI units (the calculation uses SI): {c}', 'In SI-Einheiten umrechnen (gerechnet wird in SI): {c}'),
  calcLead: T('代入数据，由内向外逐步计算（中间结果显示 {d} 位有效数字，计算保留全部精度）：', 'Substitute and evaluate from the inside out (intermediate results shown to {d} significant digits; full precision is kept):', 'Einsetzen und von innen nach außen ausrechnen (Zwischenergebnisse mit {d} geltenden Ziffern; gerechnet wird mit voller Genauigkeit):'),
  answerText: T('${l} = {v}$', '${l} = {v}$', '${l} = {v}$'),
  conditions: T('适用条件', 'Conditions', 'Gültigkeitsbedingungen'),
  compare: T('与仿真对照', 'Comparison with the simulation', 'Vergleich mit der Simulation'),
  pending: T('这条公式的推导待补充。下面的代入求解、适用条件和对照照常给出。', 'The derivation of this formula is still to be written. Substitution, conditions and comparison are shown below as usual.', 'Die Herleitung dieser Formel folgt noch. Einsetzen, Bedingungen und Vergleich stehen wie gewohnt unten.'),
  steps: T('本公式的推导', 'Derivation of this formula', 'Herleitung dieser Formel'),
  method: T('解题方法：{m}', 'Method: {m}', 'Lösungsweg: {m}'),
  basis: T('依据', 'Basis', 'Grundlage'),
  symbol: T('符号', 'Symbol', 'Symbol'),
  quantity: T('物理量', 'Quantity', 'Größe'),
  value: T('数值', 'Value', 'Wert'),
  inSi: T('国际单位', 'SI', 'SI'),
  known: T('已知量（来自场景与本阶段初态）：', 'Known values (from the scene and the start of this phase):', 'Gegebene Größen (aus der Szene und dem Anfang dieses Abschnitts):'),
  convert: T('代入前先把各量换算为国际单位，计算全部用国际单位进行。', 'All values are converted to SI units before they are substituted; the calculation is done in SI.', 'Vor dem Einsetzen werden alle Größen in SI-Einheiten umgerechnet; gerechnet wird in SI.'),
  substitute: T('代入数据，由内向外逐步计算（中间结果按 {d} 位有效数字显示，计算保留全部精度）：', 'Substitute the values and evaluate from the inside out (intermediate results shown to {d} significant digits; the calculation keeps full precision):', 'Werte einsetzen und von innen nach außen ausrechnen (Zwischenergebnisse mit {d} geltenden Ziffern angezeigt; gerechnet wird mit voller Genauigkeit):'),
  cannot: T('无法求值：{e}', 'Cannot be evaluated: {e}', 'Nicht auswertbar: {e}'),
  noConditions: T('这条公式在本情形下没有附加的适用条件。', 'This formula has no further conditions in this situation.', 'Für diese Formel gibt es in dieser Situation keine weiteren Bedingungen.'),
  required: T('前提', 'Requires', 'Voraussetzung'),
  approxRole: T('近似条件', 'Approximation', 'Näherung'),
  missing: T('情形未提供该条件', 'not provided by the situation', 'von der Situation nicht angegeben'),
  theory: T('理论值（公式）', 'Theory (formula)', 'Theoriewert (Formel)'),
  sim: T('仿真值（{m}）', 'Simulation ({m})', 'Simulation ({m})'),
  error: T('偏差（仿真 − 理论）', 'Deviation (simulation − theory)', 'Abweichung (Simulation − Theorie)'),
  relError: T('相对偏差', 'Relative deviation', 'Relative Abweichung'),
  criterion: T('判定标准', 'Criterion', 'Kriterium'),
  exactRule: T('相对偏差 ≤ {rel} 或绝对偏差 ≤ 10⁻⁹ × max(1, |理论值|) 判为一致', 'agrees when the relative deviation is ≤ {rel} or the absolute deviation ≤ 10⁻⁹ × max(1, |theory|)', 'stimmt überein, wenn die relative Abweichung ≤ {rel} oder die absolute Abweichung ≤ 10⁻⁹ · max(1, |Theorie|) ist'),
  approxRule: T('近似公式：按其近似条件分级（成立 / 近似 / 失效）', 'approximation: graded by its approximation condition (holds / approximate / fails)', 'Näherungsformel: bewertet nach ihrer Näherungsbedingung (gilt / näherungsweise / ungültig)'),
  deviates: T('偏差超过阈值。可能的原因：{c}', 'The deviation exceeds the threshold. Possible causes: {c}', 'Die Abweichung überschreitet die Schwelle. Mögliche Ursachen: {c}'),
  defaultCauses: T('数值积分误差；模型假设与场景不符（请检查条件）', 'numerical integration error; the model assumptions do not fit the scene (check the conditions)', 'numerischer Integrationsfehler; die Modellannahmen passen nicht zur Szene (Bedingungen prüfen)'),
  notApplicable: T('条件不满足：{c}', 'Conditions not met: {c}', 'Bedingungen nicht erfüllt: {c}'),
  noMeasure: T('仿真中没有可比较的测量值。', 'The simulation provides no value to compare with.', 'Die Simulation liefert keinen Vergleichswert.'),
  approxNote: T('（条件近似成立）', ' (conditions hold approximately)', ' (Bedingungen näherungsweise erfüllt)'),
  measured: T('仿真量：{m}', 'Simulated quantity: {m}', 'Simulierte Größe: {m}'),
  note: T('说明：{n}', 'Note: {n}', 'Hinweis: {n}'),
  reduced: T('此时刻在 Moreau–Jean 时间步进（精度降级）的范围内：仿真值精度降低，对照仅供参考。', 'This time lies in the Moreau–Jean time-stepping part (reduced accuracy): simulated values are less accurate, the comparison is for reference only.', 'Dieser Zeitpunkt liegt im Bereich der Moreau–Jean-Zeitschrittrechnung (verringerte Genauigkeit): Die Simulationswerte sind ungenauer, der Vergleich dient nur zur Orientierung.'),
  exact: T('精确公式', 'exact formula', 'exakte Formel'),
  approx: T('近似公式', 'approximation', 'Näherungsformel'),
  unknownFormula: T('未知公式 {id}', 'Unknown formula {id}', 'Unbekannte Formel {id}')
}

/** Verdict texts and tones (as on the cards). */
export const VERDICT_TRI: Record<Verdict, { text: Tri; tone: Tone }> = {
  match: { text: T('一致', 'agrees', 'stimmt überein'), tone: 'ok' },
  deviate: { text: T('偏差超限', 'deviates', 'weicht ab'), tone: 'bad' },
  'approx-ok': { text: T('近似成立', 'approximation holds', 'Näherung gilt'), tone: 'ok' },
  approx: { text: T('近似', 'approximate', 'näherungsweise'), tone: 'warn' },
  'approx-invalid': { text: T('近似失效', 'approximation fails', 'Näherung ungültig'), tone: 'bad' },
  'not-applicable': { text: T('不适用', 'not applicable', 'nicht anwendbar'), tone: 'neutral' },
  'no-measure': { text: T('无法比较', 'no comparison', 'kein Vergleich'), tone: 'neutral' }
}

/** Status texts of a condition. */
export const CONDITION_STATUS: Record<'ok' | 'approx' | 'fail', Tri> = {
  ok: T('成立', 'holds', 'erfüllt'),
  approx: T('近似成立', 'holds approximately', 'näherungsweise erfüllt'),
  fail: T('不成立', 'fails', 'nicht erfüllt')
}

/**
 * Display text of a text that comes from a situation (titles and labels). Situations still carry Chinese texts;
 * this is the one place where they are translated once they become message keys.
 */
export function situationText(text: string, _lang: Lang): string {
  return text
}

/** Number of a relative error as text: "0.12%" or "3.1e-9". */
function relText(rel: number | null): string {
  if (rel === null || !Number.isFinite(rel)) return '—'
  if (rel === 0) return '0'
  return rel * 100 < 1e-3 ? rel.toExponential(2) : `${Number((rel * 100).toPrecision(3))}%`
}

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
/** 10⁻⁶ style text of a power of ten. */
function pow10(v: number): string {
  const e = Math.round(Math.log10(v))
  return `10${String(e).split('').map(c => SUP[c]).join('')}`
}

/** The situation a formula detail refers to: by key, else the first active situation of the formula's type at t. */
export function findSituation(situations: Situation[], formulaId: string, key: string | null, t: number): Situation | null {
  if (key) {
    const s = situations.find(x => x.key === key)
    if (s) return s
  }
  const f = FORMULAS.find(x => x.id === formulaId)
  if (!f) return null
  return activeSituations(situations, t).find(s => s.type === f.situation) ?? null
}

/** Sample time of a card at playback time t: clamped into the situation (as in the formula panel). */
export function cardTime(s: Situation, t: number): number {
  return Math.min(Math.max(t, s.t0), s.t1)
}

/** The formula card a detail is about, evaluated exactly as the formula panel does. */
export function detailCard(situation: Situation, formulaId: string, time: number, digits = 4): FormulaCard | null {
  const f = FORMULAS.find(x => x.id === formulaId)
  if (!f) return null
  return evaluateCard(f, situation, situation.sample(cardTime(situation, time)), { digits })
}

/** Derivation sections: shared steps first, then the formula's own steps (each with its basis). */
function derivationBlocks(f: FormulaDef, d: Derivation | null, lang: Lang, shared: (id: string) => SharedSteps | null): DetailBlock[] {
  const tr = (t: Tri) => triText(t, lang)
  const blocks: DetailBlock[] = []
  const method = d?.method ? tr(d.method) : f.method ? situationText(f.method, lang) : null
  if (method) blocks.push({ kind: 'text', text: fillParams(tr(FORMULA_TEXT.method), { m: method }), small: true })
  if (!d) {
    blocks.push({ kind: 'text', text: tr(FORMULA_TEXT.pending), tone: 'neutral' })
    return blocks
  }
  for (const id of d.uses ?? []) {
    const s = shared(id)
    if (!s) continue
    blocks.push({ kind: 'subhead', text: tr(s.title) })
    blocks.push({ kind: 'steps', steps: s.steps.map(st => ({ tex: st.latex, text: tr(st.text), basis: st.basis ? tr(st.basis) : undefined })) })
  }
  if (d.steps.length) {
    if (d.uses?.length) blocks.push({ kind: 'subhead', text: tr(FORMULA_TEXT.steps) })
    blocks.push({ kind: 'steps', steps: d.steps.map(st => ({ tex: st.latex, text: tr(st.text), basis: st.basis ? tr(st.basis) : undefined })) })
  }
  return blocks
}

/**
 * Build the detail view of formula `formulaId` for `situation` at playback time `time` (the card's time; it is
 * clamped into the situation like the cards), in language `lang`.
 */
export function buildFormulaDetail(rec: Recording | null, situation: Situation, formulaId: string, time: number, lang: Lang, opts: DetailOptions = {}): DetailView {
  const tr = (t: Tri, params?: Record<string, string | number>) => fillParams(triText(t, lang), params)
  const digits = opts.digits ?? 4
  const units = opts.units ?? defaultChoice()
  const f = FORMULAS.find(x => x.id === formulaId)
  if (!f) return { kind: 'formula', title: tr(FORMULA_TEXT.unknownFormula, { id: formulaId }), subtitle: '', headline: null, badges: [], sections: [] }
  const d = (opts.derivation ?? getDerivation)(formulaId)
  const shared = opts.shared ?? getShared
  const tc = cardTime(situation, time)
  const sample = situation.sample(tc)
  const card = evaluateCard(f, situation, sample, { digits })
  const q = (v: number | null, nd = digits) => formatQuantity(v, f.unit, units, nd)
  const st = (s: string) => situationText(s, lang)

  // ---- Derivation ----
  const derivation: DetailSection = { id: 'derivation', title: tr(FORMULA_TEXT.derivation), blocks: derivationBlocks(f, d, lang, shared) }

  // ---- Worked solution (D45): given / find / solution / answer ----
  const sol = solveFormula(f, sample, { digits, units, lang })
  const solution: DetailSection = { id: 'solution', title: tr(FORMULA_TEXT.solution), blocks: [] }
  if (sol.known.length) {
    solution.blocks.push({ kind: 'subhead', text: tr(FORMULA_TEXT.given) })
    const head = [tr(FORMULA_TEXT.symbol), tr(FORMULA_TEXT.quantity), tr(FORMULA_TEXT.value)]
    if (sol.converted) head.push(tr(FORMULA_TEXT.inSi))
    const rows: DetailCell[][] = sol.known.map(k => {
      const row: DetailCell[] = [{ tex: `\\textcolor{${k.color}}{${k.symbol}}` }, { text: st(k.label) }, { tex: `\\textcolor{${k.color}}{${k.display}}` }]
      if (sol.converted) row.push(k.si ? { tex: k.si } : { text: '' })
      return row
    })
    solution.blocks.push({ kind: 'table', head, rows, align: sol.converted ? ['left', 'left', 'right', 'right'] : ['left', 'left', 'right'] })
  }
  solution.blocks.push({ kind: 'subhead', text: tr(FORMULA_TEXT.find) })
  solution.blocks.push({ kind: 'text', text: tr(FORMULA_TEXT.findText, { t: d ? tr(d.title) : st(f.title), l: sol.lhs }) })
  solution.blocks.push({ kind: 'subhead', text: tr(FORMULA_TEXT.solve) })
  solution.blocks.push({ kind: 'equation', tex: `${sol.lhs} = ${sol.coloredSymbolic}`, text: tr(FORMULA_TEXT.byFormula, { t: d ? tr(d.title) : st(f.title) }) })
  if (sol.conversions.length) solution.blocks.push({ kind: 'text', text: tr(FORMULA_TEXT.conversion, { c: sol.conversions.map(c => `$${c}$`).join(lang === 'zh' ? '，' : ', ') }), small: true })
  if (sol.error) {
    solution.blocks.push({ kind: 'chain', lhs: sol.lhs, rhs: sol.rhs })
    solution.blocks.push({ kind: 'text', text: tr(FORMULA_TEXT.cannot, { e: sol.error }), tone: 'bad' })
  } else {
    if (sol.lines.length) {
      solution.blocks.push({ kind: 'text', text: tr(FORMULA_TEXT.calcLead, { d: digits }) })
      solution.blocks.push({ kind: 'calc', lhs: sol.lhs, lines: sol.lines })
    }
    solution.blocks.push({ kind: 'subhead', text: tr(FORMULA_TEXT.answer) })
    solution.blocks.push({ kind: 'text', text: tr(FORMULA_TEXT.answerText, { l: sol.lhs, v: sol.resultDisplay }) })
  }

  // ---- Conditions ----
  const conditions: DetailSection = { id: 'conditions', title: tr(FORMULA_TEXT.conditions), blocks: [] }
  const condOf = (id: string): Condition => sample.conditions.find(c => c.id === id) ?? { id, label: id, status: 'fail', detail: tr(FORMULA_TEXT.missing) }
  const items: DetailCondition[] = []
  if (f.approxOf) {
    const c = sample.conditions.find(x => x.id === f.approxOf)
    if (c) items.push({ status: c.status, label: st(c.label), detail: st(c.detail), role: tr(FORMULA_TEXT.approxRole) })
  }
  for (const id of f.requires ?? []) {
    const c = condOf(id)
    items.push({ status: c.status, label: st(c.label), detail: st(c.detail), role: tr(FORMULA_TEXT.required) })
  }
  if (items.length) conditions.blocks.push({ kind: 'conditions', items })
  else conditions.blocks.push({ kind: 'text', text: tr(FORMULA_TEXT.noConditions) })

  // ---- Comparison ----
  const compare: DetailSection = { id: 'compare', title: tr(FORMULA_TEXT.compare), blocks: [] }
  const measure = sample.measures[f.measure]
  const measureLabel = st(measure?.label ?? f.measure)
  const rel = f.situation === 'energy' ? THRESHOLDS.energyRel : THRESHOLDS.exactRel
  const v = VERDICT_TRI[card.verdict]
  const rows: DetailCell[][] = [
    [{ text: tr(FORMULA_TEXT.theory) }, { text: q(card.theory, Math.max(digits, 6)), mono: true }],
    [{ text: tr(FORMULA_TEXT.sim, { m: measureLabel }) }, { text: q(card.sim, Math.max(digits, 6)), mono: true }],
    [{ text: tr(FORMULA_TEXT.error) }, { text: card.absError === null ? '—' : q(card.absError, 3), mono: true }],
    [{ text: tr(FORMULA_TEXT.relError) }, { text: relText(card.relError), mono: true, tone: v.tone }]
  ]
  compare.blocks.push({ kind: 'table', rows, align: ['left', 'right'] })
  const colon = lang === 'zh' ? '：' : ': '
  compare.blocks.push({ kind: 'text', text: `${tr(FORMULA_TEXT.criterion)}${colon}${f.kind === 'approx' ? tr(FORMULA_TEXT.approxRule) : tr(FORMULA_TEXT.exactRule, { rel: pow10(rel) })}`, small: true })
  const reason = verdictReason(card, f, d, lang, items)
  compare.blocks.push({ kind: 'text', text: `${tr(v.text)}${reason ? colon + reason : ''}`, tone: v.tone })
  if (measure?.note) compare.blocks.push({ kind: 'text', text: st(measure.note), small: true })
  const note = d?.note ? tr(d.note) : f.note ? st(f.note) : null
  if (note) compare.blocks.push({ kind: 'text', text: tr(FORMULA_TEXT.note, { n: note }), small: true })
  if (rec && rec.reducedFrom != null && tc >= rec.reducedFrom - 1e-12) compare.blocks.push({ kind: 'text', text: tr(FORMULA_TEXT.reduced), tone: 'warn' })

  const timeText = `t = ${formatQuantity(time, 's', units, Math.max(digits, 5))}`
  return {
    kind: 'formula',
    title: d ? tr(d.title) : st(f.title),
    subtitle: `${st(situation.title)} · ${timeText}`,
    headline: f.latex,
    badges: [{ text: tr(v.text), tone: v.tone }, { text: tr(f.kind === 'approx' ? FORMULA_TEXT.approx : FORMULA_TEXT.exact), tone: 'info' }],
    sections: [derivation, solution, conditions, compare]
  }
}

/** Why a card has its verdict, in the requested language (built from the card's data, not from its Chinese reason). */
function verdictReason(card: FormulaCard, f: FormulaDef, d: Derivation | null, lang: Lang, items: DetailCondition[]): string {
  const tr = (t: Tri, params?: Record<string, string | number>) => fillParams(triText(t, lang), params)
  const sep = lang === 'zh' ? '；' : '; '
  switch (card.verdict) {
    case 'not-applicable': {
      const failed = items.filter(c => c.status === 'fail')
      if (!failed.length) return card.reason
      return tr(FORMULA_TEXT.notApplicable, { c: failed.map(c => c.label + (c.detail ? (lang === 'zh' ? `（${c.detail}）` : ` (${c.detail})`) : '')).join(sep) })
    }
    case 'no-measure': return tr(FORMULA_TEXT.noMeasure)
    case 'deviate': {
      const causes = d?.causes?.length ? d.causes.map(c => tr(c)).join(sep) : f.causes?.length ? f.causes.map(c => situationText(c, lang)).join(sep) : tr(FORMULA_TEXT.defaultCauses)
      return tr(FORMULA_TEXT.deviates, { c: causes })
    }
    case 'approx': case 'approx-ok': case 'approx-invalid': {
      const a = items.find(c => c.role === tr(FORMULA_TEXT.approxRole))
      return a ? `${a.label}${a.detail ? (lang === 'zh' ? '：' : ': ') + a.detail : ''}` : ''
    }
    default: return items.some(c => c.status === 'approx') ? tr(FORMULA_TEXT.approxNote).trim() : ''
  }
}
