/**
 * Step-by-step numeric solution of a library formula (manual 26.50, D28). Nothing here is written by hand: the
 * solution is generated from the formula's expression tree (formula/expr.ts).
 *
 *   1. Known values: the variables the expression uses, in the user's display units (and in SI when the display
 *      unit is not SI, because the substitution is done in SI).
 *   2. The expression with the situation's symbols, then with the SI values and their units substituted.
 *   3. Reduction, innermost operations first: every line evaluates all operations whose operands are already
 *      numbers (a chain of + − or of × ÷ counts as one operation, so a product is computed in one go), until one
 *      number is left. Each evaluated subtree is replaced by a leaf holding the value the Rust core computed for
 *      that node of the tree (26.53: the card's `trace`, the value of every node in pre-order), so the last leaf
 *      is the card's theoretical value. Displayed numbers use the card's rules (`latexNumber`, the readout digits).
 *   4. The result with its SI unit (and in the display unit when that differs).
 *
 * Angles: a quantity in rad (an angle variable, an inverse trigonometric function, a multiple of an angle) is shown
 * in the display unit of angles (degrees by default) in every line, as the card does.
 *
 * 26.51 (D45): the solution is also structured for the textbook layout "given / find / solution / answer": every
 * known value has a colour, used for its symbol in the formula, its value in the substitution and its row in the
 * table of known values; every calculation line carries a short note saying what was evaluated (functions, powers,
 * products, sums), with the function values spelled out; unit conversions are listed as their own step.
 */
import type { Node } from './expr'
import { FUNCS, parse, variables } from './expr'
import type { FormulaDef } from './library'
import type { Sample } from './recognize'
import type { UnitChoice } from '../units/units'
import { defaultChoice, displayLabel, isConverted, latexNumber, latexQuantity, toDisplay, unitLatex } from '../units/units'
import type { Lang, Tri } from '../i18n/tri'

/** Options of the generated solution. */
export interface SolveOptions {
  /** Significant digits of the displayed numbers (the card's readout digits). */
  digits: number
  /** Display units (settings). */
  units: UnitChoice
  /** Language of the few words inside formulas (`if`: "otherwise"). */
  lang: Lang
}

/** One known value of the solution. */
export interface KnownValue {
  /** Variable name in the expression. */
  name: string
  /** KaTeX symbol. */
  symbol: string
  /** Label from the situation. */
  label: string
  /** SI unit and value. */
  unit: string
  value: number
  /** KaTeX value in the display unit, e.g. "30^{\circ}" or "50\,\mathrm{cm}". */
  display: string
  /** KaTeX value in SI when the display unit differs (null otherwise; angles are never converted). */
  si: string | null
  /** Colour of the value (CSS hex), shared by its symbol, its substituted value and its table row. */
  color: string
}

/** One calculation line: the right-hand side after "=", and what was done to get it. */
export interface CalcLine {
  tex: string
  note: string | null
}

/** A generated solution. */
export interface Solution {
  /** Variables the expression uses, in order of first appearance. */
  known: KnownValue[]
  /** Some known value is shown in a non-SI display unit and was converted before substitution. */
  converted: boolean
  /** Left-hand side (KaTeX). */
  lhs: string
  /**
   * Right-hand sides of the chain lhs = rhs₀ = rhs₁ = …: the expression in symbols, with SI values and units
   * substituted, the reduction lines, and finally the result with its unit (KaTeX each).
   */
  rhs: string[]
  /** The exact result (bit-identical to `evaluate` on the formula's tree); null when evaluation failed. */
  value: number | null
  /** Result in SI and in the display unit (KaTeX). */
  resultSi: string
  resultDisplay: string
  /** Error message when the expression could not be evaluated. */
  error: string | null
  /** The expression in symbols with every known symbol in its colour (KaTeX). */
  coloredSymbolic: string
  /** The substitution line with every value in its colour (KaTeX), '' for a constant formula. */
  coloredSubstituted: string
  /**
   * The calculation after the formula: substitution, reduction lines and the result, each with its note (the first
   * line is the coloured substitution).
   */
  lines: CalcLine[]
  /** Unit conversions done before substituting: "50\,\mathrm{cm} = 0.5\,\mathrm{m}" (KaTeX each). */
  conversions: string[]
}

/**
 * Colours of known values (D45): distinguishable, readable on light and dark backgrounds (the 500/600 tones of a
 * common palette), and in an order where neighbours differ in hue.
 */
export const VALUE_COLORS = ['#2563eb', '#ea580c', '#059669', '#db2777', '#7c3aed', '#0891b2', '#b45309', '#dc2626']

/** KaTeX in a colour. */
const colored = (color: string, t: string) => `\\textcolor{${color}}{${t}}`

/** Texts of the calculation notes. */
const NOTE: Record<string, Tri> = {
  substitute: { zh: '代入数据（国际单位）', en: 'substitute the values (SI units)', de: 'Werte einsetzen (SI-Einheiten)' },
  result: { zh: '结果', en: 'result', de: 'Ergebnis' },
  inDisplay: { zh: '换算为显示单位', en: 'in the display unit', de: 'in der Anzeigeeinheit' },
  lead: { zh: '计算', en: 'evaluate ', de: 'berechne ' },
  trig: { zh: '三角函数', en: 'trigonometric functions', de: 'Winkelfunktionen' },
  root: { zh: '开方', en: 'square roots', de: 'Wurzeln' },
  func: { zh: '函数值', en: 'functions', de: 'Funktionen' },
  pow: { zh: '乘方', en: 'powers', de: 'Potenzen' },
  mul: { zh: '乘除', en: 'products and quotients', de: 'Produkte und Quotienten' },
  add: { zh: '加减', en: 'sums and differences', de: 'Summen und Differenzen' },
  neg: { zh: '变号', en: 'signs', de: 'Vorzeichen' },
  pick: { zh: '按条件选取', en: 'choose by the condition', de: 'nach der Bedingung auswählen' },
  join: { zh: '、', en: ', ', de: ', ' }
}

const OTHERWISE: Tri = { zh: '否则', en: 'otherwise', de: 'sonst' }

const trees = new Map<string, Node>()
/** Parsed expression of a library formula (cached). */
export function formulaTree(f: FormulaDef): Node {
  let t = trees.get(f.id)
  if (!t) { t = parse(f.expr); trees.set(f.id, t) }
  return t
}

/** Unit choice that is SI everywhere except angles, which keep the user's display unit. */
export function siChoice(units: UnitChoice): UnitChoice {
  return { ...defaultChoice(), angle: units.angle }
}

// ---- Printing ----

/** Leaf printer: KaTeX for a variable node, or null to print the node's own symbol. */
type LeafPrinter = (name: string) => string | null

interface PrintCtx {
  leaf: LeafPrinter
  /** Printer of a leaf that is the argument of sin/cos/tan (a number there is in rad unless it is shown in °). */
  trigArg?: LeafPrinter
  /** Numeric lines: products always use ×. */
  numeric: boolean
  lang: Lang
}

const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 3, '^': 4 }
const TRIG = new Set(['sin', 'cos', 'tan'])
const isLeaf = (n: Node) => n.type === 'var' || n.type === 'num'

function numText(n: Extract<Node, { type: 'num' }>): string {
  return n.text === 'pi' ? '\\pi' : n.text === 'e' ? '\\mathrm{e}' : n.text
}

/**
 * KaTeX of a node. `prec` is the precedence of the context; `lead` marks the first operand of a chain, where a
 * leading minus needs no parentheses. Same layout rules as `toLatex` (\dfrac, \sqrt for ^0.5), plus: a negative
 * operand inside an expression is parenthesised, a value with a unit or in ×10ⁿ form is parenthesised as the base
 * of a power, and trigonometric functions of a single symbol or number are written without parentheses (\sin 30°).
 */
function tex(n: Node, c: PrintCtx, prec = 0, lead = false): string {
  let out: string
  let own = 9
  switch (n.type) {
    case 'num': out = numText(n); break
    case 'var': {
      const v = c.leaf(n.name)
      out = v ?? n.name
      if (v !== null && prec >= 4 && /\\mathrm|\\times|\^/.test(v)) out = `\\left(${v}\\right)`
      else if (v !== null && prec >= 2 && !lead && /\\times/.test(v)) out = `\\left(${v}\\right)`
      break
    }
    case 'neg': out = `-${tex(n.arg, c, 2, false)}`; own = 2; break
    case 'cmp': {
      const op = { '<': '<', '<=': '\\le', '>': '>', '>=': '\\ge' }[n.op]
      out = `${tex(n.left, c, 0, true)} ${op} ${tex(n.right, c, 0)}`
      own = 0
      break
    }
    case 'bin': {
      own = PREC[n.op]
      if (n.op === '/') { out = `\\dfrac{${tex(n.left, c, 0, true)}}{${tex(n.right, c, 0, true)}}`; own = 9; break }
      if (n.op === '^') {
        if (n.right.type === 'num' && n.right.value === 0.5) { out = `\\sqrt{${tex(n.left, c, 0, true)}}`; own = 9; break }
        out = `{${tex(n.left, c, 5, false)}}^{${tex(n.right, c, 0, true)}}`
        break
      }
      const l = tex(n.left, c, own, lead || prec === 0 || prec < own)
      if (n.op === '*') {
        const r = tex(n.right, c, own, false)
        const times = c.numeric || /^[-\d]/.test(r)
        out = `${l}${times ? ' \\times ' : ' '}${r}`
      } else {
        out = `${l} ${n.op} ${tex(n.right, c, n.op === '-' ? own + 0.5 : own, false)}`
      }
      break
    }
    case 'call': {
      const f = FUNCS[n.fn]
      if (n.fn === 'sqrt') { out = `\\sqrt{${tex(n.args[0], c, 0, true)}}`; break }
      if (n.fn === 'abs') { out = `\\left|${tex(n.args[0], c, 0, true)}\\right|`; break }
      if (n.fn === 'if') {
        const [cond, a, b] = n.args.map(x => tex(x, c, 0, true))
        out = `\\begin{cases} ${a}, & ${cond} \\\\ ${b}, & \\text{${OTHERWISE[c.lang]}} \\end{cases}`
        break
      }
      const a0 = n.args[0]
      if (TRIG.has(n.fn) && n.args.length === 1 && isLeaf(a0)) {
        const arg = (a0.type === 'var' && c.trigArg?.(a0.name)) || tex(a0, c, 0, true)
        if (!arg.startsWith('-') && !/[+\\]times/.test(arg)) { out = `${f.latex} ${arg}`; own = 2; break }
      }
      out = `${f.latex}\\left(${n.args.map(a => tex(a, c, 0, true)).join(', ')}\\right)`
      break
    }
  }
  if (own < prec) return `\\left(${out}\\right)`
  if (!lead && prec > 0 && out.startsWith('-')) return `\\left(${out}\\right)`
  return out
}

/** KaTeX of an expression tree with a leaf printer (symbols when it returns null). */
export function printExpr(n: Node, leaf: LeafPrinter, numeric: boolean, lang: Lang = 'zh', trigArg?: LeafPrinter): string {
  return tex(n, { leaf, numeric, lang, trigArg })
}

// ---- Angles ----

const INVERSE_TRIG = new Set(['asin', 'acos', 'atan', 'atan2'])

/** Whether a node is an angle (rad) quantity, given which leaves are angles. */
function isAngle(n: Node, leafAngle: (name: string) => boolean): boolean {
  switch (n.type) {
    case 'var': return leafAngle(n.name)
    case 'num': return false
    case 'neg': return isAngle(n.arg, leafAngle)
    case 'bin': {
      const l = isAngle(n.left, leafAngle), r = isAngle(n.right, leafAngle)
      const pure = (x: Node) => x.type === 'num'
      if (n.op === '+' || n.op === '-') return (l && (r || pure(n.right))) || (r && pure(n.left))
      if (n.op === '*') return (l && pure(n.right)) || (r && pure(n.left))
      if (n.op === '/') return l && pure(n.right)
      return false
    }
    case 'call': return INVERSE_TRIG.has(n.fn)
    default: return false
  }
}

// ---- Reduction ----

/** Working state of a reduction: leaves are variable nodes named `#k` holding exact doubles. */
interface Work {
  values: Record<string, number>
  angles: Set<string>
  next: number
  /** Operations evaluated in the current level: their kind and (for functions) the evaluated subtree and leaf. */
  ops: Array<{ kind: string; node: Node; leaf: Node }>
  /** Pre-order index of every node (rebuilt nodes keep the index of the node they replace) and the core's values. */
  ids: WeakMap<Node, number>
  trace: number[]
}

/** Pre-order indices of the nodes of a tree (the order of the core's trace). */
function numberNodes(n: Node, ids: WeakMap<Node, number>, next = 0): number {
  ids.set(n, next++)
  switch (n.type) {
    case 'neg': return numberNodes(n.arg, ids, next)
    case 'bin': case 'cmp': return numberNodes(n.right, ids, numberNodes(n.left, ids, next))
    case 'call': for (const a of n.args) next = numberNodes(a, ids, next); return next
    default: return next
  }
}

/** `made` stands for node `from`: it keeps its index. */
function keep<T extends Node>(w: Work, from: Node, made: T): T {
  const id = w.ids.get(from)
  if (id !== undefined) w.ids.set(made, id)
  return made
}

/** The core's value of (the original node behind) `n`. */
function valueOf(w: Work, n: Node): number {
  const id = w.ids.get(n)
  if (id === undefined) throw new Error('solve: node without a value')
  return w.trace[id]
}

function newLeaf(w: Work, value: number, angle: boolean): Node {
  const name = `#${w.next++}`
  w.values[name] = value
  if (angle) w.angles.add(name)
  return { type: 'var', name }
}

/** A number, or the negation of one: shown as one signed number. */
const isAtom = (n: Node) => isLeaf(n) || (n.type === 'neg' && isLeaf(n.arg))

const chainClass = (op: string) => (op === '+' || op === '-' ? 1 : op === '*' || op === '/' ? 2 : 0)

/** Operands of a left-associative chain of + − (or of × ÷) rooted at n. */
function chainOperands(n: Node): Node[] {
  if (n.type !== 'bin') return [n]
  const cls = chainClass(n.op)
  const left = n.left.type === 'bin' && chainClass(n.left.op) === cls ? chainOperands(n.left) : [n.left]
  return [...left, n.right]
}

/** The chain rooted at n with its operands replaced (in order) by `f`. */
function mapChain(w: Work, n: Node, f: (x: Node) => Node): Node {
  if (n.type !== 'bin') return f(n)
  const cls = chainClass(n.op)
  const left = n.left.type === 'bin' && chainClass(n.left.op) === cls ? mapChain(w, n.left, f) : f(n.left)
  return keep(w, n, { type: 'bin', op: n.op, left, right: f(n.right) })
}

/**
 * One reduction level: every operation whose operands are numbers is evaluated (with `evaluate`, on the working
 * leaves, so the value is exactly what `evaluate` gives for that part of the original tree) and replaced by a leaf.
 */
function reduceLevel(n: Node, w: Work): Node {
  const angle = (x: Node) => isAngle(x, name => w.angles.has(name))
  const done = (x: Node) => {
    const leaf = newLeaf(w, valueOf(w, x), angle(x))
    w.ops.push({ kind: opKind(x), node: x, leaf })
    return leaf
  }
  const sub = (x: Node) => (isAtom(x) ? x : reduceLevel(x, w))
  switch (n.type) {
    case 'num': case 'var': return n
    case 'neg': return isLeaf(n.arg) ? done(n) : keep(w, n, { type: 'neg', arg: reduceLevel(n.arg, w) })
    case 'cmp': return keep(w, n, { type: 'cmp', op: n.op, left: sub(n.left), right: sub(n.right) })
    case 'bin': {
      if (chainClass(n.op)) return chainOperands(n).every(isAtom) ? done(n) : mapChain(w, n, sub)
      return isAtom(n.left) && isAtom(n.right) ? done(n) : keep(w, n, { type: 'bin', op: n.op, left: sub(n.left), right: sub(n.right) })
    }
    case 'call': {
      if (n.fn === 'if') {
        const cond = n.args[0]
        // The core evaluates only the branch the condition selects: so does the reduction
        if (cond.type === 'cmp' && isAtom(cond.left) && isAtom(cond.right)) { w.ops.push({ kind: 'pick', node: n, leaf: n }); const c = valueOf(w, cond); return c !== 0 && !Number.isNaN(c) ? n.args[1] : n.args[2] }
        return keep(w, n, { type: 'call', fn: n.fn, args: [sub(cond), n.args[1], n.args[2]] })
      }
      return n.args.every(isAtom) ? done(n) : keep(w, n, { type: 'call', fn: n.fn, args: n.args.map(sub) })
    }
  }
}

/** Kind of an evaluated operation (for the notes). */
function opKind(n: Node): string {
  switch (n.type) {
    case 'neg': return 'neg'
    case 'bin': return n.op === '^' ? (n.right.type === 'num' && n.right.value === 0.5 ? 'root' : 'pow') : chainClass(n.op) === 1 ? 'add' : 'mul'
    case 'call': return TRIG.has(n.fn) || INVERSE_TRIG.has(n.fn) ? 'trig' : n.fn === 'sqrt' ? 'root' : 'func'
    default: return 'func'
  }
}

/** Copy of the tree with every variable replaced by a working leaf holding its SI value. */
function substitute(n: Node, vars: Record<string, number>, w: Work, angleVar: (name: string) => boolean, map: Map<string, string>): Node {
  switch (n.type) {
    case 'num': return n
    case 'var': {
      const v = vars[n.name]
      if (v === undefined) return n
      const leaf = keep(w, n, newLeaf(w, v, angleVar(n.name)))
      map.set((leaf as { name: string }).name, n.name)
      return leaf
    }
    case 'neg': return keep(w, n, { type: 'neg', arg: substitute(n.arg, vars, w, angleVar, map) })
    case 'bin': return keep(w, n, { type: 'bin', op: n.op, left: substitute(n.left, vars, w, angleVar, map), right: substitute(n.right, vars, w, angleVar, map) })
    case 'cmp': return keep(w, n, { type: 'cmp', op: n.op, left: substitute(n.left, vars, w, angleVar, map), right: substitute(n.right, vars, w, angleVar, map) })
    case 'call': return keep(w, n, { type: 'call', fn: n.fn, args: n.args.map(a => substitute(a, vars, w, angleVar, map)) })
  }
}

/** Most reduction lines; further levels are merged pairwise so a long expression stays readable. */
const MAX_LINES = 7

/**
 * Generate the step-by-step solution of formula `f` for a situation sample. `trace` holds the value of every node of
 * the formula's expression in pre-order as the core computed it for the card (FormulaCard.trace); `error` is the
 * card's reason when it has no trace.
 */
export function solveFormula(f: FormulaDef, sample: Sample, opts: SolveOptions, trace: number[] | null | undefined, error = ''): Solution {
  return solveTree(formulaTree(f), f.lhs, f.unit, sample, opts, trace, error)
}

/** `solveFormula` for any expression tree, left-hand side and result unit. */
export function solveTree(tree: Node, lhs: string, unit: string, sample: Sample, opts: SolveOptions, trace: number[] | null | undefined, error = ''): Solution {
  const { digits, units, lang } = opts
  const si = siChoice(units)
  const vars: Record<string, number> = {}
  for (const [k, v] of Object.entries(sample.vars)) vars[k] = v.value
  const used = [...variables(tree)]
  const known: KnownValue[] = used.filter(name => sample.vars[name]).map((name, i) => {
    const v = sample.vars[name]
    const conv = v.unit !== 'rad' && isConverted(v.unit, units)
    return {
      name, symbol: v.symbol, label: v.label, unit: v.unit, value: v.value,
      display: latexQuantity(v.value, v.unit, units, digits),
      si: conv ? latexQuantity(v.value, v.unit, si, digits) : null,
      color: VALUE_COLORS[i % VALUE_COLORS.length]
    }
  })
  const colorOf = new Map(known.map(k => [k.name, k.color]))
  const converted = known.some(k => k.si !== null)
  const conversions = known.filter(k => k.si !== null).map(k => `${k.display} = ${k.si}`)
  const symbolic = printExpr(tree, name => (sample.vars[name] ? sample.vars[name].symbol : null), false, lang)
  const coloredSymbolic = printExpr(tree, name => (sample.vars[name] ? colored(colorOf.get(name)!, sample.vars[name].symbol) : null), false, lang)
  const rhs: string[] = [symbolic]
  const lines: CalcLine[] = []
  const note = (key: string) => NOTE[key][lang]
  const fail = (error: string): Solution => ({ known, converted, lhs, rhs, value: null, resultSi: '', resultDisplay: '', error, coloredSymbolic, coloredSubstituted: '', lines, conversions })
  const missing = used.filter(name => vars[name] === undefined)
  if (missing.length) return fail(`${missing.join(', ')}?`)
  if (!trace || !trace.length) return fail(error || '—')

  const w: Work = { values: {}, angles: new Set(), next: 0, ops: [], ids: new WeakMap(), trace }
  numberNodes(tree, w.ids)
  const origin = new Map<string, string>()
  const angleVar = (name: string) => sample.vars[name]?.unit === 'rad'
  let work = substitute(tree, vars, w, angleVar, origin)
  // Substitution line: SI values with their units (angles in the display unit of angles)
  const withUnits = printExpr(work, name => {
    const v = sample.vars[origin.get(name) ?? '']
    return v ? latexQuantity(v.value, v.unit, si, digits) : null
  }, true, lang)
  const coloredSubstituted = isLeaf(tree) && tree.type === 'num' ? '' : printExpr(work, name => {
    const o = origin.get(name) ?? ''
    const v = sample.vars[o]
    return v ? colored(colorOf.get(o)!, latexQuantity(v.value, v.unit, si, digits)) : null
  }, true, lang)
  if (isLeaf(tree) && tree.type === 'num') {
    // A constant formula (a = 0): nothing to substitute
  } else if (withUnits !== symbolic) {
    rhs.push(withUnits)
    lines.push({ tex: coloredSubstituted, note: note('substitute') })
  }

  const rootAngle = unit === 'rad'
  const plain = (name: string): string | null => {
    const v = w.values[name]
    if (v === undefined) return null
    const angle = w.angles.has(name)
    if (angle && si.angle !== 'rad') return `${latexNumber(toDisplay(v, 'rad', si), digits)}^{\\circ}`
    return latexNumber(v, digits)
  }
  // Reduce level by level, remembering what each level evaluated
  const levels: Node[] = []
  const levelOps: Array<Work['ops']> = []
  let guard = 0
  try {
    while (!isLeaf(work) && guard++ < 200) {
      w.ops = []
      work = reduceLevel(work, w)
      levels.push(work)
      levelOps.push(w.ops)
    }
    if (work.type === 'num') {
      // Constant expression (no operation at all): its value is the number itself
      work = newLeaf(w, work.value, rootAngle)
    }
  } catch (e) {
    return fail((e as Error).message)
  }
  const value = work.type === 'var' ? w.values[work.name] : trace[0]
  // The final leaf takes the result's unit: an angle result is an angle whatever its operands were
  if (work.type === 'var' && rootAngle) w.angles.add(work.name)
  // Merge levels pairwise while there are too many lines (the last level is always shown)
  let shown = levels.slice(0, -1)
  while (shown.length > MAX_LINES - 1) shown = shown.filter((_, i) => i % 2 === 1 || i === shown.length - 1)
  // The argument of a trigonometric function is in rad unless it is an angle shown in degrees
  const trigArg = (name: string): string | null => {
    const v = w.values[name]
    if (v === undefined || v === 0 || (w.angles.has(name) && si.angle !== 'rad')) return null
    return `${latexNumber(v, digits)}\\,\\mathrm{rad}`
  }
  // Notes: the kinds of operations evaluated since the previous shown line, with function values spelled out
  const ORDER = ['pick', 'trig', 'root', 'func', 'pow', 'mul', 'add', 'neg']
  const noteOf = (ops: Work['ops']): string | null => {
    if (!ops.length) return null
    const kinds = ORDER.filter(k => ops.some(o => o.kind === k))
    const words = kinds.map(k => note(k)).join(note('join'))
    const fn = ops.filter(o => o.kind === 'trig' || o.kind === 'root' || o.kind === 'func').slice(0, 3)
    const vals = fn.map(o => `$${printExpr(o.node, plain, true, lang, trigArg)} = ${plain((o.leaf as { name: string }).name) ?? ''}$`)
    const lead = note('lead')
    const sep = lang === 'zh' ? '：' : ': '
    const text = lang === 'zh' ? `${lead}${words}` : `${lead}${words}`
    return vals.length ? `${text}${sep}${vals.join(lang === 'zh' ? '，' : ', ')}` : text
  }
  const shownSet = new Set(shown)
  let pending: Work['ops'] = []
  for (let i = 0; i < levels.length; i++) {
    pending = pending.concat(levelOps[i])
    const n = levels[i]
    if (!shownSet.has(n)) continue
    const line = printExpr(n, plain, true, lang, trigArg)
    if (line !== rhs[rhs.length - 1]) {
      rhs.push(line)
      lines.push({ tex: line, note: noteOf(pending) })
      pending = []
    }
  }
  const resultSi = latexQuantity(value, unit, si, digits)
  const resultDisplay = latexQuantity(value, unit, units, digits)
  if (rhs[rhs.length - 1] !== resultSi) {
    rhs.push(resultSi)
    lines.push({ tex: resultSi, note: noteOf(pending) ?? note('result') })
  } else if (lines.length) lines[lines.length - 1].note = lines[lines.length - 1].note ?? note('result')
  if (resultDisplay !== resultSi) {
    rhs.push(resultDisplay)
    lines.push({ tex: resultDisplay, note: note('inDisplay') })
  }
  return { known, converted, lhs, rhs, value, resultSi, resultDisplay, error: null, coloredSymbolic, coloredSubstituted, lines, conversions }
}

/** KaTeX of the unit written after a number in `unit` under a unit choice (e.g. "\,\mathrm{m/s^2}"; '' when dimensionless). */
export function unitTex(unit: string, units: UnitChoice = defaultChoice()): string {
  return unitLatex(displayLabel(unit, units))
}
