/**
 * Small expression language for the formula library: numbers, variables, + − * / ^, unary minus,
 * parentheses and the functions below. Expressions are parsed once into an AST that can be evaluated
 * (with the deterministic math library), checked for physical dimensions, and printed as LaTeX with the
 * variable values substituted.
 */
import * as dm from '../core/math/dmath'
import { ellipticK } from './elliptic'
import type { Dim } from './units'
import { DIMLESS, dimEqual, dimMul, dimPow, formatDim } from './units'

export type Node =
  | { type: 'num'; value: number; text: string }
  | { type: 'var'; name: string }
  | { type: 'neg'; arg: Node }
  | { type: 'bin'; op: '+' | '-' | '*' | '/' | '^'; left: Node; right: Node }
  | { type: 'call'; fn: string; args: Node[] }

const FUNCS: Record<string, { arity: number; fn: (...a: number[]) => number; latex: string }> = {
  sin: { arity: 1, fn: dm.sin, latex: '\\sin' },
  cos: { arity: 1, fn: dm.cos, latex: '\\cos' },
  tan: { arity: 1, fn: dm.tan, latex: '\\tan' },
  asin: { arity: 1, fn: dm.asin, latex: '\\arcsin' },
  acos: { arity: 1, fn: dm.acos, latex: '\\arccos' },
  atan: { arity: 1, fn: dm.atan, latex: '\\arctan' },
  sqrt: { arity: 1, fn: Math.sqrt, latex: '\\sqrt' },
  abs: { arity: 1, fn: Math.abs, latex: '' },
  exp: { arity: 1, fn: dm.exp, latex: '\\exp' },
  ln: { arity: 1, fn: dm.log, latex: '\\ln' },
  ellipK: { arity: 1, fn: ellipticK, latex: 'K' },
  min: { arity: 2, fn: Math.min, latex: '\\min' },
  max: { arity: 2, fn: Math.max, latex: '\\max' }
}

export class ExprError extends Error {}

export function parse(src: string): Node {
  let pos = 0
  const peek = () => { while (src[pos] === ' ') pos++; return src[pos] }
  const expect = (ch: string) => { if (peek() !== ch) throw new ExprError(`应为 “${ch}”（位置 ${pos}）：${src}`); pos++ }
  function primary(): Node {
    const ch = peek()
    if (ch === '(') { pos++; const e = sum(); expect(')'); return e }
    if (ch === '-') { pos++; return { type: 'neg', arg: power() } }
    if (ch !== undefined && /[0-9.]/.test(ch)) {
      const m = /^[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/.exec(src.slice(pos))
      if (!m) throw new ExprError(`数字格式错误：${src}`)
      pos += m[0].length
      return { type: 'num', value: Number(m[0]), text: m[0] }
    }
    if (ch !== undefined && /[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z_0-9]*/.exec(src.slice(pos))!
      pos += m[0].length
      if (peek() === '(') {
        pos++
        const args: Node[] = []
        if (peek() !== ')') { args.push(sum()); while (peek() === ',') { pos++; args.push(sum()) } }
        expect(')')
        const f = FUNCS[m[0]]
        if (!f) throw new ExprError(`未知函数 ${m[0]}`)
        if (f.arity !== args.length) throw new ExprError(`${m[0]} 需要 ${f.arity} 个参数`)
        return { type: 'call', fn: m[0], args }
      }
      if (m[0] === 'pi') return { type: 'num', value: dm.PI_VALUE, text: 'pi' }
      return { type: 'var', name: m[0] }
    }
    throw new ExprError(`无法解析（位置 ${pos}）：${src}`)
  }
  function power(): Node {
    const base = primary()
    if (peek() === '^') { pos++; return { type: 'bin', op: '^', left: base, right: power() } }
    return base
  }
  function product(): Node {
    let left = power()
    for (;;) {
      const ch = peek()
      if (ch === '*' || ch === '/') { pos++; left = { type: 'bin', op: ch, left, right: power() } } else return left
    }
  }
  function sum(): Node {
    let left = product()
    for (;;) {
      const ch = peek()
      if (ch === '+' || ch === '-') { pos++; left = { type: 'bin', op: ch, left, right: product() } } else return left
    }
  }
  const node = sum()
  if (peek() !== undefined) throw new ExprError(`多余字符（位置 ${pos}）：${src}`)
  return node
}

export function evaluate(node: Node, vars: Record<string, number>): number {
  switch (node.type) {
    case 'num': return node.value
    case 'var': {
      const v = vars[node.name]
      if (v === undefined) throw new ExprError(`变量 ${node.name} 没有取值`)
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
    case 'call': return FUNCS[node.fn].fn(...node.args.map(a => evaluate(a, vars)))
  }
}

export function variables(node: Node, out = new Set<string>()): Set<string> {
  if (node.type === 'var') out.add(node.name)
  else if (node.type === 'neg') variables(node.arg, out)
  else if (node.type === 'bin') { variables(node.left, out); variables(node.right, out) }
  else if (node.type === 'call') node.args.forEach(a => variables(a, out))
  return out
}

/** Physical dimension of an expression; throws on inconsistent sums or dimensioned function arguments. */
export function dimension(node: Node, dims: Record<string, Dim>): Dim {
  switch (node.type) {
    case 'num': return DIMLESS
    case 'var': {
      const d = dims[node.name]
      if (!d) throw new ExprError(`变量 ${node.name} 没有量纲`)
      return d
    }
    case 'neg': return dimension(node.arg, dims)
    case 'bin': {
      const a = dimension(node.left, dims)
      if (node.op === '^') {
        if (node.right.type !== 'num' && !(node.right.type === 'neg' && node.right.arg.type === 'num')) {
          if (!dimEqual(a, DIMLESS)) throw new ExprError('有量纲的量只能取数字次幂')
          return DIMLESS
        }
        const p = node.right.type === 'num' ? node.right.value : -(node.right as { arg: { value: number } }).arg.value
        return dimPow(a, p)
      }
      const b = dimension(node.right, dims)
      if (node.op === '+' || node.op === '-') {
        if (!dimEqual(a, b)) throw new ExprError(`量纲不一致：${formatDim(a)} ${node.op} ${formatDim(b)}`)
        return a
      }
      return node.op === '*' ? dimMul(a, b) : dimMul(a, dimPow(b, -1))
    }
    case 'call': {
      const args = node.args.map(a => dimension(a, dims))
      if (node.fn === 'sqrt') return dimPow(args[0], 0.5)
      if (node.fn === 'abs') return args[0]
      if (node.fn === 'min' || node.fn === 'max') {
        if (!dimEqual(args[0], args[1])) throw new ExprError(`${node.fn} 的两个参数量纲不同`)
        return args[0]
      }
      for (const a of args) if (!dimEqual(a, DIMLESS)) throw new ExprError(`${node.fn} 的参数必须无量纲，实为 ${formatDim(a)}`)
      return DIMLESS
    }
  }
}

// ---------------------------------------------------------------------------------------------- LaTeX
const PREC = { '+': 1, '-': 1, '*': 2, '/': 3, '^': 4 } as const

export interface LatexOptions {
  /** Value printer for variables; when absent the symbol is printed. */
  value?: (name: string) => string | null
  symbol?: (name: string) => string
}

export function toLatex(node: Node, opts: LatexOptions = {}, parentPrec = 0): string {
  const wrap = (s: string, prec: number) => (prec < parentPrec ? `\\left(${s}\\right)` : s)
  switch (node.type) {
    case 'num': return node.text === 'pi' ? '\\pi' : node.text
    case 'var': {
      const v = opts.value?.(node.name)
      if (v != null) return v.startsWith('-') && parentPrec > 0 ? `\\left(${v}\\right)` : v
      return opts.symbol ? opts.symbol(node.name) : node.name
    }
    case 'neg': return wrap(`-${toLatex(node.arg, opts, 2)}`, 1)
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
      return `${f.latex}\\left(${node.args.map(a => toLatex(a, opts, 0)).join(', ')}\\right)`
    }
  }
}
