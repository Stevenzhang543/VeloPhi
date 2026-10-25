/**
 * Step-by-step numeric solution of a library formula (manual 26.50, D28). Nothing here is written by hand: the
 * solution is generated from the formula's expression tree (formula/expr.ts).
 *
 *   1. Known values: the variables the expression uses, in the user's display units (and in SI when the display
 *      unit is not SI, because the substitution is done in SI).
 *   2. The expression with the situation's symbols, then with the SI values and their units substituted.
 *   3. Reduction, innermost operations first: every line evaluates all operations whose operands are already
 *      numbers (a chain of + − or of × ÷ counts as one operation, so a product is computed in one go), until one
 *      number is left. Each evaluated subtree is replaced by a leaf holding the exact double that `evaluate`
 *      returns for it, so the last leaf is bit-identical to `evaluate` on the whole tree, i.e. to the card's
 *      theoretical value. Displayed numbers use the card's rules (`latexNumber`, the readout digits).
 *   4. The result with its SI unit (and in the display unit when that differs).
 *
 * Angles: a quantity in rad (an angle variable, an inverse trigonometric function, a multiple of an angle) is shown
 * in the display unit of angles (degrees by default) in every line, as the card does.
 */
import type { Node } from './expr'
import { FUNCS, evaluate, parse, variables } from './expr'
import type { FormulaDef } from './library'
import type { Sample } from './situations'
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
function mapChain(n: Node, f: (x: Node) => Node): Node {
  if (n.type !== 'bin') return f(n)
  const cls = chainClass(n.op)
  const left = n.left.type === 'bin' && chainClass(n.left.op) === cls ? mapChain(n.left, f) : f(n.left)
  return { type: 'bin', op: n.op, left, right: f(n.right) }
}

/**
 * One reduction level: every operation whose operands are numbers is evaluated (with `evaluate`, on the working
 * leaves, so the value is exactly what `evaluate` gives for that part of the original tree) and replaced by a leaf.
 */
function reduceLevel(n: Node, w: Work): Node {
  const angle = (x: Node) => isAngle(x, name => w.angles.has(name))
  const done = (x: Node) => newLeaf(w, evaluate(x, w.values), angle(x))
  const sub = (x: Node) => (isAtom(x) ? x : reduceLevel(x, w))
  switch (n.type) {
    case 'num': case 'var': return n
    case 'neg': return isLeaf(n.arg) ? done(n) : { type: 'neg', arg: reduceLevel(n.arg, w) }
    case 'cmp': return { type: 'cmp', op: n.op, left: sub(n.left), right: sub(n.right) }
    case 'bin': {
      if (chainClass(n.op)) return chainOperands(n).every(isAtom) ? done(n) : mapChain(n, sub)
      return isAtom(n.left) && isAtom(n.right) ? done(n) : { type: 'bin', op: n.op, left: sub(n.left), right: sub(n.right) }
    }
    case 'call': {
      if (n.fn === 'if') {
        const cond = n.args[0]
        // `evaluate` evaluates only the branch the condition selects: so does the reduction
        if (cond.type === 'cmp' && isAtom(cond.left) && isAtom(cond.right)) return evaluate(cond, w.values) ? n.args[1] : n.args[2]
        return { type: 'call', fn: n.fn, args: [sub(cond), n.args[1], n.args[2]] }
      }
      return n.args.every(isAtom) ? done(n) : { type: 'call', fn: n.fn, args: n.args.map(sub) }
    }
  }
}

/** Copy of the tree with every variable replaced by a working leaf holding its SI value. */
function substitute(n: Node, vars: Record<string, number>, w: Work, angleVar: (name: string) => boolean, map: Map<string, string>): Node {
  switch (n.type) {
    case 'num': return n
    case 'var': {
      const v = vars[n.name]
      if (v === undefined) return n
      const leaf = newLeaf(w, v, angleVar(n.name))
      map.set((leaf as { name: string }).name, n.name)
      return leaf
    }
    case 'neg': return { type: 'neg', arg: substitute(n.arg, vars, w, angleVar, map) }
    case 'bin': return { type: 'bin', op: n.op, left: substitute(n.left, vars, w, angleVar, map), right: substitute(n.right, vars, w, angleVar, map) }
    case 'cmp': return { type: 'cmp', op: n.op, left: substitute(n.left, vars, w, angleVar, map), right: substitute(n.right, vars, w, angleVar, map) }
    case 'call': return { type: 'call', fn: n.fn, args: n.args.map(a => substitute(a, vars, w, angleVar, map)) }
  }
}

/** Most reduction lines; further levels are merged pairwise so a long expression stays readable. */
const MAX_LINES = 7

/**
 * Generate the step-by-step solution of formula `f` for a situation sample. The value is evaluated exactly as the
 * card does (`evaluate` on the parsed expression with the sample's SI values), level by level.
 */
export function solveFormula(f: FormulaDef, sample: Sample, opts: SolveOptions): Solution {
  return solveTree(formulaTree(f), f.lhs, f.unit, sample, opts)
}

/** `solveFormula` for any expression tree, left-hand side and result unit. */
export function solveTree(tree: Node, lhs: string, unit: string, sample: Sample, opts: SolveOptions): Solution {
  const { digits, units, lang } = opts
  const si = siChoice(units)
  const vars: Record<string, number> = {}
  for (const [k, v] of Object.entries(sample.vars)) vars[k] = v.value
  const used = [...variables(tree)]
  const known: KnownValue[] = used.filter(name => sample.vars[name]).map(name => {
    const v = sample.vars[name]
    const conv = v.unit !== 'rad' && isConverted(v.unit, units)
    return {
      name, symbol: v.symbol, label: v.label, unit: v.unit, value: v.value,
      display: latexQuantity(v.value, v.unit, units, digits),
      si: conv ? latexQuantity(v.value, v.unit, si, digits) : null
    }
  })
  const converted = known.some(k => k.si !== null)
  const symbolic = printExpr(tree, name => (sample.vars[name] ? sample.vars[name].symbol : null), false, lang)
  const rhs: string[] = [symbolic]
  const fail = (error: string): Solution => ({ known, converted, lhs, rhs, value: null, resultSi: '', resultDisplay: '', error })
  const missing = used.filter(name => vars[name] === undefined)
  if (missing.length) return fail(`${missing.join(', ')}?`)

  const w: Work = { values: {}, angles: new Set(), next: 0 }
  const origin = new Map<string, string>()
  const angleVar = (name: string) => sample.vars[name]?.unit === 'rad'
  let work = substitute(tree, vars, w, angleVar, origin)
  // Substitution line: SI values with their units (angles in the display unit of angles)
  const withUnits = printExpr(work, name => {
    const v = sample.vars[origin.get(name) ?? '']
    return v ? latexQuantity(v.value, v.unit, si, digits) : null
  }, true, lang)
  if (isLeaf(tree) && tree.type === 'num') {
    // A constant formula (a = 0): nothing to substitute
  } else if (withUnits !== symbolic) rhs.push(withUnits)

  const rootAngle = unit === 'rad'
  const plain = (name: string): string | null => {
    const v = w.values[name]
    if (v === undefined) return null
    const angle = w.angles.has(name)
    if (angle && si.angle !== 'rad') return `${latexNumber(toDisplay(v, 'rad', si), digits)}^{\\circ}`
    return latexNumber(v, digits)
  }
  // Reduce level by level
  const levels: Node[] = []
  let guard = 0
  try {
    while (!isLeaf(work) && guard++ < 200) {
      work = reduceLevel(work, w)
      levels.push(work)
    }
    if (work.type === 'num') {
      // Constant expression (no operation at all): its value is the number itself
      work = newLeaf(w, work.value, rootAngle)
    }
  } catch (e) {
    return fail((e as Error).message)
  }
  const value = evaluate(work, w.values)
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
  for (const n of shown) {
    const line = printExpr(n, plain, true, lang, trigArg)
    if (line !== rhs[rhs.length - 1]) rhs.push(line)
  }
  const resultSi = latexQuantity(value, unit, si, digits)
  const resultDisplay = latexQuantity(value, unit, units, digits)
  if (rhs[rhs.length - 1] !== resultSi) rhs.push(resultSi)
  if (resultDisplay !== resultSi) rhs.push(resultDisplay)
  return { known, converted, lhs, rhs, value, resultSi, resultDisplay, error: null }
}

/** KaTeX of the unit written after a number in `unit` under a unit choice (e.g. "\,\mathrm{m/s^2}"; '' when dimensionless). */
export function unitTex(unit: string, units: UnitChoice = defaultChoice()): string {
  return unitLatex(displayLabel(unit, units))
}
