/**
 * Small expression language shared by the formula library and the variable forces of the solver: numbers,
 * variables, + − * / ^, unary minus, parentheses, the functions below and a conditional
 * `if(a < b, x, y)` (comparisons < <= > >= are allowed only as the condition of `if`). Expressions are
 * parsed once into an AST that can be evaluated (with the deterministic math library), checked for physical
 * dimensions, and printed as LaTeX with the variable values substituted.
 */
import { tl } from '../i18n'
import * as dm from '../core/math/dmath'
import { ellipticF, ellipticK } from './elliptic'
import type { Dim } from './units'
import { DIMLESS, dimEqual, dimMul, dimPow, formatDim, unitFor } from './units'

/** Comparison operator (only in the condition of `if`). */
export type CmpOp = '<' | '<=' | '>' | '>='

/** Expression tree; `text` keeps a number's source spelling (or the constant's name). */
export type Node =
  | { type: 'num'; value: number; text: string }
  | { type: 'var'; name: string }
  | { type: 'neg'; arg: Node }
  | { type: 'bin'; op: '+' | '-' | '*' | '/' | '^'; left: Node; right: Node }
  | { type: 'call'; fn: string; args: Node[] }
  /** Comparison; only the condition of `if`. */
  | { type: 'cmp'; op: CmpOp; left: Node; right: Node }

const LN10 = dm.log(10)

function signOf(x: number): number { return x > 0 ? 1 : x < 0 ? -1 : x === 0 ? 0 : Number.NaN }
function stepOf(x: number): number { return x >= 0 ? 1 : x < 0 ? 0 : Number.NaN }
function clampOf(x: number, lo: number, hi: number): number { return Math.min(Math.max(x, lo), hi) }

/** Functions of the language. `if` is listed for its arity and LaTeX; its condition is a comparison node. */
/** Hyperbolic tangent through the deterministic exp (stable for large |x|). */
function tanhOf(x: number): number {
  const e = dm.exp(-2 * Math.abs(x))
  return (x < 0 ? -1 : 1) * (1 - e) / (1 + e)
}

export const FUNCS: Record<string, { arity: number; fn: (...a: number[]) => number; latex: string }> = {
  sin: { arity: 1, fn: dm.sin, latex: '\\sin' },
  cos: { arity: 1, fn: dm.cos, latex: '\\cos' },
  tan: { arity: 1, fn: dm.tan, latex: '\\tan' },
  asin: { arity: 1, fn: dm.asin, latex: '\\arcsin' },
  acos: { arity: 1, fn: dm.acos, latex: '\\arccos' },
  atan: { arity: 1, fn: dm.atan, latex: '\\arctan' },
  atan2: { arity: 2, fn: dm.atan2, latex: '\\operatorname{atan2}' },
  sqrt: { arity: 1, fn: Math.sqrt, latex: '\\sqrt' },
  abs: { arity: 1, fn: Math.abs, latex: '' },
  exp: { arity: 1, fn: dm.exp, latex: '\\exp' },
  tanh: { arity: 1, fn: tanhOf, latex: '\\tanh' },
  ln: { arity: 1, fn: dm.log, latex: '\\ln' },
  log: { arity: 1, fn: dm.log, latex: '\\ln' },
  lg: { arity: 1, fn: x => dm.log(x) / LN10, latex: '\\lg' },
  sign: { arity: 1, fn: signOf, latex: '\\operatorname{sgn}' },
  step: { arity: 1, fn: stepOf, latex: '\\operatorname{step}' },
  clamp: { arity: 3, fn: clampOf, latex: '\\operatorname{clamp}' },
  ellipK: { arity: 1, fn: ellipticK, latex: 'K' },
  ellipF: { arity: 2, fn: ellipticF, latex: 'F' },
  min: { arity: 2, fn: Math.min, latex: '\\min' },
  max: { arity: 2, fn: Math.max, latex: '\\max' },
  if: { arity: 3, fn: (c, a, b) => (c ? a : b), latex: '' }
}

/** Parse, evaluation or dimension error with a user-facing message. */
export class ExprError extends Error {}

/** Options of `parse`. */
export interface ParseOptions {
  /** Named constants (default: only pi); force expressions also define e. */
  constants?: Record<string, number>
}

const DEFAULT_CONSTANTS: Record<string, number> = { pi: dm.PI_VALUE }

/** Parse an expression; throws ExprError. `**` is accepted for `^`. */
export function parse(src: string, opts: ParseOptions = {}): Node {
  const constants = opts.constants ?? DEFAULT_CONSTANTS
  let pos = 0
  const peek = () => { while (src[pos] === ' ' || src[pos] === '\t') pos++; return src[pos] }
  const expect = (ch: string) => { if (peek() !== ch) throw new ExprError(tl('应为 “{0}”（位置 {1}）：{2}', [ch, pos + 1, src])); pos++ }
  function primary(): Node {
    const ch = peek()
    if (ch === '(') { pos++; const e = sum(); expect(')'); return e }
    if (ch === '-') { pos++; return { type: 'neg', arg: power() } }
    if (ch === '+') { pos++; return power() }
    if (ch !== undefined && /[0-9.]/.test(ch)) {
      const m = /^[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/.exec(src.slice(pos)) ?? /^[0-9]+\.(?:[eE][-+]?[0-9]+)?/.exec(src.slice(pos))
      if (!m) throw new ExprError(tl('数字格式错误（位置 {0}）：{1}', [pos + 1, src]))
      pos += m[0].length
      return { type: 'num', value: Number(m[0]), text: m[0] }
    }
    if (ch !== undefined && /[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z_0-9]*/.exec(src.slice(pos))!
      pos += m[0].length
      const name = m[0]
      if (peek() === '(') {
        pos++
        const f = FUNCS[name]
        if (!f) throw new ExprError(tl('未知函数 {0}', [name]))
        const args: Node[] = []
        if (name === 'if') {
          args.push(comparison())
          while (peek() === ',') { pos++; args.push(sum()) }
        } else if (peek() !== ')') { args.push(sum()); while (peek() === ',') { pos++; args.push(sum()) } }
        expect(')')
        if (f.arity !== args.length) throw new ExprError(tl('{0} 需要 {1} 个参数，实为 {2} 个', [name, f.arity, args.length]))
        return { type: 'call', fn: name, args }
      }
      if (FUNCS[name] && !(name in constants)) throw new ExprError(tl('函数 {0} 后面应有括号，如 {1}(t)', [name, name]))
      if (name in constants) return { type: 'num', value: constants[name], text: name }
      return { type: 'var', name }
    }
    if (ch === '<' || ch === '>') throw new ExprError(tl('比较运算只能用作 if(条件, 值1, 值2) 的条件（位置 {0}）', [pos + 1]))
    if (ch === undefined) throw new ExprError(tl('表达式不完整：{0}', [src]))
    throw new ExprError(tl('无法识别的字符 “{0}”（位置 {1}）：{2}', [ch, pos + 1, src]))
  }
  function power(): Node {
    const base = primary()
    if (peek() === '^') { pos++; return { type: 'bin', op: '^', left: base, right: power() } }
    if (src[pos] === '*' && src[pos + 1] === '*') { pos += 2; return { type: 'bin', op: '^', left: base, right: power() } }
    return base
  }
  function product(): Node {
    let left = power()
    for (;;) {
      const ch = peek()
      if ((ch === '*' && src[pos + 1] !== '*') || ch === '/') { pos++; left = { type: 'bin', op: ch, left, right: power() } } else return left
    }
  }
  function sum(): Node {
    let left = product()
    for (;;) {
      const ch = peek()
      if (ch === '+' || ch === '-') { pos++; left = { type: 'bin', op: ch, left, right: product() } } else return left
    }
  }
  function comparison(): Node {
    const left = sum()
    const ch = peek()
    if (ch !== '<' && ch !== '>') throw new ExprError(tl('if 的第一个参数应为比较式，例如 if(t < 1, 10, 0)'))
    pos++
    let op: CmpOp = ch
    if (src[pos] === '=') { pos++; op = ch === '<' ? '<=' : '>=' }
    const right = sum()
    return { type: 'cmp', op, left, right }
  }
  if (!src.trim()) throw new ExprError(tl('表达式为空'))
  const node = sum()
  if (peek() !== undefined) {
    const ch = peek()
    if (ch === '<' || ch === '>') throw new ExprError(tl('比较运算只能用作 if(条件, 值1, 值2) 的条件（位置 {0}）', [pos + 1]))
    if (ch === ')') throw new ExprError(tl('括号不匹配（位置 {0}）：{1}', [pos + 1, src]))
    throw new ExprError(tl('多余字符 “{0}”（位置 {1}）：{2}', [ch, pos + 1, src]))
  }
  return node
}

function compare(op: CmpOp, a: number, b: number): boolean {
  switch (op) {
    case '<': return a < b
    case '<=': return a <= b
    case '>': return a > b
    default: return a >= b
  }
}

/** Evaluate with the given variable values (deterministic math); throws ExprError for an unset variable. */
export function evaluate(node: Node, vars: Record<string, number>): number {
  switch (node.type) {
    case 'num': return node.value
    case 'var': {
      const v = vars[node.name]
      if (v === undefined) throw new ExprError(tl('变量 {0} 没有取值', [node.name]))
      return v
    }
    case 'neg': return -evaluate(node.arg, vars)
    case 'bin': {
      const a = evaluate(node.left, vars), b = evaluate(node.right, vars)
      switch (node.op) {
        case '+': return a + b
        case '-': return a - b
        case '*': return a * b
        case '/': return a / b
        case '^': return dm.pow(a, b)
      }
    }
    // eslint-disable-next-line no-fallthrough
    case 'cmp': return compare(node.op, evaluate(node.left, vars), evaluate(node.right, vars)) ? 1 : 0
    case 'call': {
      if (node.fn === 'if') return evaluate(node.args[0], vars) ? evaluate(node.args[1], vars) : evaluate(node.args[2], vars)
      return FUNCS[node.fn].fn(...node.args.map(a => evaluate(a, vars)))
    }
  }
}

/** Names of the variables used, added to `out`. */
export function variables(node: Node, out = new Set<string>()): Set<string> {
  if (node.type === 'var') out.add(node.name)
  else if (node.type === 'neg') variables(node.arg, out)
  else if (node.type === 'bin' || node.type === 'cmp') { variables(node.left, out); variables(node.right, out) }
  else if (node.type === 'call') node.args.forEach(a => variables(a, out))
  return out
}

/** Unit name of a dimension for messages ('N', 'm/s', …, or m·kg·s^-2). */
export function dimName(d: Dim): string { return dimEqual(d, DIMLESS) ? tl('无量纲') : unitFor(d) }

function exponentOf(node: Node): number | null {
  if (node.type === 'num') return node.value
  if (node.type === 'neg' && node.arg.type === 'num') return -node.arg.value
  return null
}

/** Physical dimension of an expression; throws on inconsistent sums or dimensioned function arguments. */
export function dimension(node: Node, dims: Record<string, Dim>): Dim {
  const same = (args: Dim[], what: string): Dim => {
    for (const a of args) if (!dimEqual(a, args[0])) throw new ExprError(tl('{0} 的参数量纲不同：{1} 与 {2}', [what, dimName(args[0]), dimName(a)]))
    return args[0]
  }
  switch (node.type) {
    case 'num': return DIMLESS
    case 'var': {
      const d = dims[node.name]
      if (!d) throw new ExprError(tl('变量 {0} 没有量纲', [node.name]))
      return d
    }
    case 'neg': return dimension(node.arg, dims)
    case 'cmp': same([dimension(node.left, dims), dimension(node.right, dims)], tl('比较 {0}', [node.op])); return DIMLESS
    case 'bin': {
      const a = dimension(node.left, dims)
      if (node.op === '^') {
        const p = exponentOf(node.right)
        if (p === null) {
          if (!dimEqual(a, DIMLESS)) throw new ExprError(tl('有量纲的量只能取数字次幂'))
          return DIMLESS
        }
        return dimPow(a, p)
      }
      const b = dimension(node.right, dims)
      if (node.op === '+' || node.op === '-') {
        if (!dimEqual(a, b)) throw new ExprError(tl('量纲不一致：{0} {1} {2}', [formatDim(a), node.op, formatDim(b)]))
        return a
      }
      return node.op === '*' ? dimMul(a, b) : dimMul(a, dimPow(b, -1))
    }
    case 'call': {
      if (node.fn === 'if') {
        dimension(node.args[0], dims)
        return same([dimension(node.args[1], dims), dimension(node.args[2], dims)], 'if')
      }
      const args = node.args.map(a => dimension(a, dims))
      if (node.fn === 'sqrt') return dimPow(args[0], 0.5)
      if (node.fn === 'abs') return args[0]
      if (node.fn === 'sign' || node.fn === 'step') return DIMLESS
      if (node.fn === 'min' || node.fn === 'max' || node.fn === 'clamp') return same(args, node.fn)
      if (node.fn === 'atan2') { same(args, node.fn); return DIMLESS }
      for (const a of args) if (!dimEqual(a, DIMLESS)) throw new ExprError(tl('{0} 的参数必须无量纲，实为 {1}', [node.fn, formatDim(a)]))
      return DIMLESS
    }
  }
}

/**
 * Dimension with numbers as coefficients of unspecified unit (the convention of the variable-force editor:
 * in `10*sin(2*pi*t)` the 10 carries newtons and the 2·π carries 1/s). Returns null when the expression
 * can take any dimension (it contains a free numeric coefficient), otherwise its dimension. Throws an
 * ExprError (Chinese message) on sums of different dimensions, dimensioned function arguments that no
 * coefficient can fix, and similar inconsistencies.
 */
export function inferDimension(node: Node, dims: Record<string, Dim>): Dim | null {
  const unify = (list: Array<Dim | null>, what: string): Dim | null => {
    let fixed: Dim | null = null
    for (const d of list) {
      if (!d) continue
      if (!fixed) fixed = d
      else if (!dimEqual(fixed, d)) throw new ExprError(tl('{0}两边量纲不同：{1} 与 {2}', [what, dimName(fixed), dimName(d)]))
    }
    return fixed
  }
  const dimless = (d: Dim | null, fn: string) => {
    if (d && !dimEqual(d, DIMLESS)) throw new ExprError(tl('{0}( ) 的参数必须无量纲，实为 {1}（可写成系数乘变量，如 {2}(2*t)）', [fn, dimName(d), fn]))
  }
  switch (node.type) {
    case 'num': return null
    case 'var': {
      const d = dims[node.name]
      if (!d) throw new ExprError(tl('未知变量 {0}', [node.name]))
      return d
    }
    case 'neg': return inferDimension(node.arg, dims)
    case 'cmp': unify([inferDimension(node.left, dims), inferDimension(node.right, dims)], tl('比较 {0} ', [node.op])); return DIMLESS
    case 'bin': {
      const a = inferDimension(node.left, dims)
      if (node.op === '^') {
        const p = exponentOf(node.right)
        if (p !== null) return a ? dimPow(a, p) : null
        dimless(inferDimension(node.right, dims), tl('指数'))
        if (a && !dimEqual(a, DIMLESS)) throw new ExprError(tl('有量纲的量（{0}）只能取数字次幂', [dimName(a)]))
        return DIMLESS
      }
      const b = inferDimension(node.right, dims)
      if (node.op === '+' || node.op === '-') return unify([a, b], node.op === '+' ? tl('加法') : tl('减法'))
      if (!a || !b) return null
      return node.op === '*' ? dimMul(a, b) : dimMul(a, dimPow(b, -1))
    }
    case 'call': {
      if (node.fn === 'if') {
        inferDimension(node.args[0], dims)
        return unify([inferDimension(node.args[1], dims), inferDimension(node.args[2], dims)], tl('if 的两个取值'))
      }
      const args = node.args.map(a => inferDimension(a, dims))
      switch (node.fn) {
        case 'sqrt': return args[0] ? dimPow(args[0], 0.5) : null
        case 'abs': return args[0]
        case 'sign': case 'step': return DIMLESS
        case 'min': case 'max': case 'clamp': return unify(args, tl('{0} 的参数', [node.fn]))
        case 'atan2': unify(args, tl('atan2 的参数')); return DIMLESS
      }
      for (const a of args) dimless(a, node.fn)
      return DIMLESS
    }
  }
}

// ---- LaTeX ----
const PREC = { '+': 1, '-': 1, '*': 2, '/': 3, '^': 4 } as const
const CMP_LATEX: Record<CmpOp, string> = { '<': '<', '<=': '\\le', '>': '>', '>=': '\\ge' }

/** Options of `toLatex`. */
export interface LatexOptions {
  /** Value printer for variables; when absent the symbol is printed. */
  value?: (name: string) => string | null
  /** Symbol printer for variables (default: the name). */
  symbol?: (name: string) => string
}

/** LaTeX of an expression, optionally with values substituted for the variables. */
export function toLatex(node: Node, opts: LatexOptions = {}, parentPrec = 0): string {
  const wrap = (s: string, prec: number) => (prec < parentPrec ? `\\left(${s}\\right)` : s)
  switch (node.type) {
    case 'num': return node.text === 'pi' ? '\\pi' : node.text === 'e' ? '\\mathrm{e}' : node.text
    case 'var': {
      const v = opts.value?.(node.name)
      if (v != null) return v.startsWith('-') && parentPrec > 0 ? `\\left(${v}\\right)` : v
      return opts.symbol ? opts.symbol(node.name) : node.name
    }
    case 'neg': return wrap(`-${toLatex(node.arg, opts, 2)}`, 1)
    case 'cmp': return `${toLatex(node.left, opts, 0)} ${CMP_LATEX[node.op]} ${toLatex(node.right, opts, 0)}`
    case 'bin': {
      const p = PREC[node.op]
      if (node.op === '/') return `\\dfrac{${toLatex(node.left, opts, 0)}}{${toLatex(node.right, opts, 0)}}`
      if (node.op === '^') {
        const base = toLatex(node.left, opts, 5)
        const exp = node.right.type === 'num' && node.right.value === 0.5 ? null : toLatex(node.right, opts, 0)
        return exp === null ? `\\sqrt{${toLatex(node.left, opts, 0)}}` : `{${base}}^{${exp}}`
      }
      if (node.op === '*') {
        const l = toLatex(node.left, opts, p), r = toLatex(node.right, opts, p)
        const numeric = /^[-\d\\(]/.test(r) || /^\\left/.test(r) || opts.value !== undefined
        return wrap(`${l}${numeric ? ' \\times ' : ' '}${r}`, p)
      }
      const l = toLatex(node.left, opts, p)
      const r = toLatex(node.right, opts, node.op === '-' ? p + 0.5 : p)
      return wrap(`${l} ${node.op} ${r}`, p)
    }
    case 'call': {
      const f = FUNCS[node.fn]
      if (node.fn === 'sqrt') return `\\sqrt{${toLatex(node.args[0], opts, 0)}}`
      if (node.fn === 'abs') return `\\left|${toLatex(node.args[0], opts, 0)}\\right|`
      if (node.fn === 'if') {
        const [c, a, b] = node.args.map(x => toLatex(x, opts, 0))
        return `\\begin{cases} ${a}, & ${c} \\\\ ${b}, & \\text{${tl('否则')}} \\end{cases}`
      }
      return `${f.latex}\\left(${node.args.map(a => toLatex(a, opts, 0)).join(', ')}\\right)`
    }
  }
}
