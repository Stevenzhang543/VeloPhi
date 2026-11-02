/**
 * Equation models (26.59 fix, D188): when no template, example, task or analytic model fits a problem and its
 * physics is algebraic rather than a motion to simulate — statics of a pulley pile, a network of ropes, a circuit
 * no task covers, conservation laws over several stages — the AI writes the model as named knowns, unknowns and
 * equations, and the app solves it. The AI never computes a number: the app parses the equations with the formula
 * language (formula/expr.ts), solves them (Levenberg–Marquardt with numeric derivatives, bounds per unknown), and
 * reports whether the system is solved, contradictory (no solution: the least-squares minimum is not zero) or
 * underdetermined (an asked value is not fixed by the equations: it moves along the null space of the Jacobian).
 */
import { parse, variables, toLatex, ExprError } from '../../formula/expr'
import type { Node } from '../../formula/expr'

/** Constants an equation may use besides its knowns: π and the degree (sin(37*deg)). */
export const EQ_CONSTANTS: Record<string, number> = { pi: Math.PI, deg: Math.PI / 180 }

export interface EqKnown { name: string; value: number; unit: string; meaning?: string }
export interface EqUnknown { name: string; unit: string; meaning?: string; guess?: number; min?: number; max?: number }
export interface EqEquation { text: string; why?: string; lhs: Node; rhs: Node }
export interface EqAsk { prompt: string; expr: string; node: Node; unit: string }

export type EqVerdict = 'solved' | 'inconsistent' | 'underdetermined' | 'failed'

export interface EqResult {
  verdict: EqVerdict
  /** Solved (or least-squares) values of the unknowns, SI. */
  values: Record<string, number>
  /** Asked values in SI; null when not determined. */
  answers: Array<{ prompt: string; value: number | null; unit: string }>
  /** Equations that are not satisfied (index, relative residual), largest first; empty when consistent. */
  conflicts: Array<{ index: number; residual: number }>
  /** Unknowns the equations do not fix. */
  undetermined: string[]
  iterations: number
}

type Fn = (x: Float64Array) => number

const MATH: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log, lg: Math.log10, sign: Math.sign,
  min: Math.min, max: Math.max, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, asinh: Math.asinh, acosh: Math.acosh,
  atanh: Math.atanh, cbrt: Math.cbrt, floor: Math.floor, step: (v: number) => (v >= 0 ? 1 : 0),
  clamp: (v: number, a: number, b: number) => Math.min(Math.max(v, a), b), sinc: (v: number) => (v === 0 ? 1 : Math.sin(v) / v)
}

/** A closure evaluating a parsed expression for the unknown vector (knowns are folded in). */
function compile(node: Node, index: Map<string, number>, knowns: Map<string, number>): Fn {
  switch (node.type) {
    case 'num': { const v = node.value; return () => v }
    case 'var': {
      if (knowns.has(node.name)) { const v = knowns.get(node.name)!; return () => v }
      const i = index.get(node.name)
      if (i === undefined) throw new ExprError(`unknown name ${node.name}`)
      return x => x[i]
    }
    case 'neg': { const a = compile(node.arg, index, knowns); return x => -a(x) }
    case 'bin': {
      const l = compile(node.left, index, knowns), r = compile(node.right, index, knowns)
      switch (node.op) {
        case '+': return x => l(x) + r(x)
        case '-': return x => l(x) - r(x)
        case '*': return x => l(x) * r(x)
        case '/': return x => l(x) / r(x)
        default: return x => Math.pow(l(x), r(x))
      }
    }
    case 'cmp': {
      const l = compile(node.left, index, knowns), r = compile(node.right, index, knowns)
      const op = node.op
      return x => { const a = l(x), b = r(x); return (op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b) ? 1 : 0 }
    }
    case 'call': {
      const args = node.args.map(a => compile(a, index, knowns))
      if (node.fn === 'if') return x => (args[0](x) ? args[1](x) : args[2](x))
      const f = MATH[node.fn]
      if (!f) throw new ExprError(`function ${node.fn} is not available in equations`)
      return x => f(...args.map(a => a(x)))
    }
  }
}

/** Absolute size of the terms of an expression (scale of its residual). */
function magnitude(node: Node, index: Map<string, number>, knowns: Map<string, number>, x: Float64Array): number {
  if (node.type === 'bin' && (node.op === '+' || node.op === '-')) return magnitude(node.left, index, knowns, x) + magnitude(node.right, index, knowns, x)
  if (node.type === 'neg') return magnitude(node.arg, index, knowns, x)
  try { return Math.abs(compile(node, index, knowns)(x)) } catch { return 0 }
}

/** Solve A·d = b (n × n, Gaussian elimination with partial pivoting); null when singular. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (!(Math.abs(M[p][c]) > 1e-300)) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c]
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  const d = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n]
    for (let k = r + 1; k < n; k++) s -= M[r][k] * d[k]
    d[r] = s / M[r][r]
  }
  return d
}

/** Singular values and right singular vectors of an m × n matrix (one-sided Jacobi). */
export function svd(A: number[][], n: number): { s: number[]; V: number[][] } {
  const m = A.length
  const U = A.map(r => r.slice())
  const V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        let a = 0, b = 0, c = 0
        for (let i = 0; i < m; i++) { a += U[i][p] * U[i][p]; b += U[i][q] * U[i][q]; c += U[i][p] * U[i][q] }
        if (Math.abs(c) <= 1e-15 * Math.sqrt(a * b) || c === 0) continue
        off = Math.max(off, Math.abs(c) / Math.sqrt(a * b))
        const zeta = (b - a) / (2 * c)
        const t = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta))
        const cs = 1 / Math.sqrt(1 + t * t), sn = cs * t
        for (let i = 0; i < m; i++) { const up = U[i][p], uq = U[i][q]; U[i][p] = cs * up - sn * uq; U[i][q] = sn * up + cs * uq }
        for (let i = 0; i < n; i++) { const vp = V[i][p], vq = V[i][q]; V[i][p] = cs * vp - sn * vq; V[i][q] = sn * vp + cs * vq }
      }
    }
    if (off < 1e-14) break
  }
  const s = Array.from({ length: n }, (_, j) => Math.sqrt(U.reduce((acc, r) => acc + r[j] * r[j], 0)))
  return { s, V }
}

export class EqError extends Error { constructor(public problems: string[]) { super(problems.join('; ')) } }

const NAME = /^[A-Za-z_][A-Za-z_0-9]{0,23}$/

/** Parse "lhs = rhs" (or an expression equal to 0). */
export function parseEquation(text: string): { lhs: Node; rhs: Node } {
  const parts = text.replace(/==/g, '=').split('=')
  if (parts.length > 2) throw new ExprError('an equation has one "="')
  const lhs = parse(parts[0], { constants: EQ_CONSTANTS })
  const rhs = parts.length === 2 ? parse(parts[1], { constants: EQ_CONSTANTS }) : { type: 'num' as const, value: 0, text: '0' }
  return { lhs, rhs }
}

export interface EqModel { knowns: EqKnown[]; unknowns: EqUnknown[]; equations: EqEquation[]; asks: EqAsk[] }

/** Check names and references; throws EqError with every problem (for a repair round). */
export function checkModel(m: EqModel): void {
  const problems: string[] = []
  const names = new Set<string>()
  for (const [i, k] of m.knowns.entries()) {
    if (!NAME.test(k.name)) problems.push(`knowns[${i}].name "${k.name}" must be an ASCII identifier`)
    else if (names.has(k.name)) problems.push(`name "${k.name}" is defined twice`)
    else if (k.name in EQ_CONSTANTS) problems.push(`name "${k.name}" is reserved (pi, deg)`)
    names.add(k.name)
  }
  for (const [i, u] of m.unknowns.entries()) {
    if (!NAME.test(u.name)) problems.push(`unknowns[${i}].name "${u.name}" must be an ASCII identifier`)
    else if (names.has(u.name)) problems.push(`name "${u.name}" is defined twice`)
    else if (u.name in EQ_CONSTANTS) problems.push(`name "${u.name}" is reserved (pi, deg)`)
    names.add(u.name)
  }
  if (!m.unknowns.length) problems.push('unknowns must list at least one unknown')
  if (!m.equations.length) problems.push('equations must list at least one equation')
  const used = new Set<string>()
  m.equations.forEach((e, i) => {
    for (const v of [...variables(e.lhs), ...variables(e.rhs)]) {
      used.add(v)
      if (!names.has(v)) problems.push(`equations[${i}] uses "${v}", which is neither a known nor an unknown`)
    }
  })
  m.asks.forEach((a, i) => {
    for (const v of variables(a.node)) if (!names.has(v)) problems.push(`asks[${i}].expr uses "${v}", which is neither a known nor an unknown`)
  })
  for (const u of m.unknowns) if (NAME.test(u.name) && !used.has(u.name)) problems.push(`unknown "${u.name}" appears in no equation`)
  if (m.unknowns.length > 80) problems.push('at most 80 unknowns')
  if (m.equations.length > 120) problems.push('at most 120 equations')
  if (problems.length) throw new EqError(problems)
}

/** Solve an equation model. */
export function solveEquations(m: EqModel): EqResult {
  const n = m.unknowns.length
  const index = new Map(m.unknowns.map((u, i) => [u.name, i]))
  const knowns = new Map(m.knowns.map(k => [k.name, k.value]))
  const res: Fn[] = m.equations.map(e => {
    const l = compile(e.lhs, index, knowns), r = compile(e.rhs, index, knowns)
    return x => l(x) - r(x)
  })
  const askFns = m.asks.map(a => compile(a.node, index, knowns))
  const lo = m.unknowns.map(u => (typeof u.min === 'number' && Number.isFinite(u.min) ? u.min : -Infinity))
  const hi = m.unknowns.map(u => (typeof u.max === 'number' && Number.isFinite(u.max) ? u.max : Infinity))
  const clampX = (x: Float64Array) => { for (let i = 0; i < n; i++) x[i] = Math.min(hi[i], Math.max(lo[i], x[i])) }
  const R = (x: Float64Array) => res.map(f => f(x))
  const norm2 = (v: number[]) => v.reduce((a, b) => a + (Number.isFinite(b) ? b * b : 1e300), 0)
  const jacobian = (x: Float64Array, fns: Fn[]): number[][] => {
    const J = fns.map(() => new Array<number>(n).fill(0))
    for (let j = 0; j < n; j++) {
      const h = 1e-6 * Math.max(1, Math.abs(x[j]))
      const xp = Float64Array.from(x), xm = Float64Array.from(x)
      xp[j] += h; xm[j] -= h
      for (let i = 0; i < fns.length; i++) J[i][j] = (fns[i](xp) - fns[i](xm)) / (2 * h)
    }
    return J
  }

  const start = (k: number): Float64Array => {
    const x = Float64Array.from(m.unknowns.map(u => {
      const g = typeof u.guess === 'number' && Number.isFinite(u.guess) ? u.guess : (Number.isFinite(lo[index.get(u.name)!]) && lo[index.get(u.name)!] > 0 ? lo[index.get(u.name)!] + 1 : 1)
      return k === 0 ? g : g * [1, 3, -2, 0.37, 10][k % 5] + k * 0.1
    }))
    clampX(x)
    return x
  }
  let best: { x: Float64Array; f: number; it: number } | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const x = start(attempt)
    let r = R(x), f = norm2(r), lambda = 1e-3, it = 0
    for (; it < 300 && f > 0; it++) {
      const J = jacobian(x, res)
      const JtJ = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => J.reduce((s, row) => s + row[a] * row[b], 0)))
      const g = Array.from({ length: n }, (_, a) => J.reduce((s, row, i) => s + row[a] * r[i], 0))
      let improved = false
      for (let tries = 0; tries < 12; tries++) {
        const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v + lambda * Math.max(v, 1e-12) : v)))
        const d = solveLinear(A, g.map(v => -v))
        if (!d) { lambda *= 10; continue }
        const xn = Float64Array.from(x, (v, i) => v + d[i])
        clampX(xn)
        const rn = R(xn), fn = norm2(rn)
        if (fn < f) { x.set(xn); r = rn; const step = d.reduce((s, v) => s + v * v, 0); lambda = Math.max(lambda / 10, 1e-15); improved = f - fn > 1e-30 || step > 1e-30; f = fn; break }
        lambda *= 10
      }
      if (!improved) break
    }
    if (!best || f < best.f) best = { x: Float64Array.from(x), f, it }
    // A zero residual ends the search (relative to the size of the terms)
    if (consistent(best.x)) break
  }
  function relResiduals(x: Float64Array): number[] {
    return m.equations.map((e, i) => {
      const scale = magnitude(e.lhs, index, knowns, x) + magnitude(e.rhs, index, knowns, x)
      const v = res[i](x)
      return Number.isFinite(v) ? Math.abs(v) / Math.max(scale, 1e-12) : Infinity
    })
  }
  function consistent(x: Float64Array): boolean { return relResiduals(x).every(v => v <= 1e-7) }

  const x = best!.x
  const values: Record<string, number> = {}
  m.unknowns.forEach((u, i) => { values[u.name] = x[i] })
  if (!x.every(Number.isFinite)) return { verdict: 'failed', values, answers: m.asks.map(a => ({ prompt: a.prompt, value: null, unit: a.unit })), conflicts: [], undetermined: [], iterations: best!.it }
  const rel = relResiduals(x)
  const conflicts = rel.map((v, i) => ({ index: i, residual: v })).filter(c => c.residual > 1e-7).sort((a, b) => b.residual - a.residual).slice(0, 6)

  // Null space of the Jacobian: directions the equations do not fix
  const J = jacobian(x, res)
  const { s, V } = svd(J, n)
  const smax = Math.max(...s, 0)
  const tol = Math.max(1e-9 * smax * Math.max(n, J.length), 1e-14)
  const nullDirs: number[][] = []
  for (let j = 0; j < n; j++) if (s[j] <= tol) nullDirs.push(V.map(row => row[j]))
  const undetermined = m.unknowns.filter((_, i) => nullDirs.some(d => Math.abs(d[i]) > 1e-6)).map(u => u.name)
  const G = jacobian(x, askFns)
  const answers = m.asks.map((a, k) => {
    const g = G[k]
    const gn = Math.sqrt(g.reduce((acc, v) => acc + v * v, 0))
    const free = nullDirs.some(d => Math.abs(d.reduce((acc, v, i) => acc + v * g[i], 0)) > 1e-6 * Math.max(gn, 1e-12))
    const v = askFns[k](x)
    return { prompt: a.prompt, value: free || !Number.isFinite(v) ? null : v, unit: a.unit }
  })
  const verdict: EqVerdict = conflicts.length ? 'inconsistent' : answers.some(a => a.value === null) ? 'underdetermined' : 'solved'
  return { verdict, values, answers, conflicts, undetermined, iterations: best!.it }
}

/** LaTeX of an equation ("lhs = rhs"). */
export function equationLatex(e: { lhs: Node; rhs: Node }): string {
  return `${toLatex(e.lhs)} = ${toLatex(e.rhs)}`
}
