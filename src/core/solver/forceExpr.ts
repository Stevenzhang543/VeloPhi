/**
 * Variable forces F(t, state) given as expressions (decision D14).
 *
 * Each component of a force is an expression of the language of formula/expr.ts in the variables below
 * (time and the state of the body the force acts on). Numbers act as coefficients with whatever SI unit
 * makes the expression a force, so `10*sin(2*pi*t)` reads "10 N · sin(2π s⁻¹ · t)"; the dimension check
 * rejects only what no coefficient can repair (x + vx, sin(t), a bare t …).
 *
 * Expressions are compiled into closures for the right-hand side of the solver. Every piecewise function
 * (step, sign, if, abs, min, max, clamp) is a *switch*: inside a segment of the simulation its branch is
 * frozen (part of the mode), so the right-hand side stays smooth, and the switching argument is an event
 * function, so the integrator stops exactly where the expression jumps or has a kink. Evaluation uses the
 * deterministic math library only.
 */
import type { Node } from '../../formula/expr'
import { ExprError, FUNCS, dimName, inferDimension, parse } from '../../formula/expr'
import type { Dim } from '../../formula/units'
import { dimEqual, unitDim } from '../../formula/units'
import * as dm from '../math/dmath'

/** Result of checkForceExpr. */
export interface ForceExprCheck {
  ok: boolean
  /** Readable problem description (Chinese, shown in the inspector) when not ok. */
  message?: string
}

/** Variables of force expressions, in the order of the evaluation environment. */
export const FORCE_VARIABLES: ReadonlyArray<{ name: string; unit: string; label: string }> = [
  { name: 't', unit: 's', label: '时间' },
  { name: 'x', unit: 'm', label: '受力物体质心的 x 坐标' },
  { name: 'y', unit: 'm', label: '受力物体质心的 y 坐标' },
  { name: 'vx', unit: 'm/s', label: '质心速度的 x 分量' },
  { name: 'vy', unit: 'm/s', label: '质心速度的 y 分量' },
  { name: 'v', unit: 'm/s', label: '质心速率 √(vx² + vy²)' },
  { name: 'theta', unit: 'rad', label: '物体的角位置（逆时针为正）' },
  { name: 'omega', unit: 'rad/s', label: '物体的角速度（逆时针为正）' },
  { name: 'm', unit: 'kg', label: '物体的质量' },
  { name: 'g', unit: 'm/s²', label: '重力加速度的大小 |g|' }
]

/** Index of each variable in the environment array. */
export const ENV_INDEX: Readonly<Record<string, number>> = Object.fromEntries(FORCE_VARIABLES.map((v, i) => [v.name, i]))
/** Length of the evaluation environment. */
export const ENV_SIZE = FORCE_VARIABLES.length

/** Named constants of force expressions. */
export const FORCE_CONSTANTS: Readonly<Record<string, number>> = { pi: dm.PI_VALUE, e: Math.E }

const ALLOWED_FUNCTIONS = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'exp', 'ln', 'log', 'lg', 'sqrt', 'abs', 'min', 'max', 'sign', 'step', 'clamp', 'if']

/** Variables and functions available in force expressions, for the inspector's help text. */
export const FORCE_EXPR_HELP = {
  variables: FORCE_VARIABLES.map(v => v.name),
  constants: ['pi', 'e'],
  functions: ALLOWED_FUNCTIONS.slice(),
  /** One line per variable: name, meaning, SI unit. */
  variableInfo: FORCE_VARIABLES.map(v => ({ ...v })),
  /** One line per function (Chinese). */
  functionInfo: [
    { name: 'sin(a)  cos(a)  tan(a)', label: '三角函数，参数为弧度' },
    { name: 'asin(a)  acos(a)  atan(a)  atan2(y, x)', label: '反三角函数，结果为弧度' },
    { name: 'exp(a)  ln(a)  log(a)  lg(a)', label: '指数；ln 与 log 均为自然对数，lg 为常用对数' },
    { name: 'sqrt(a)  abs(a)', label: '平方根、绝对值' },
    { name: 'min(a, b)  max(a, b)  clamp(a, lo, hi)', label: '较小值、较大值、限制在 [lo, hi] 内' },
    { name: 'sign(a)', label: '符号函数：a > 0 为 1，a < 0 为 −1，a = 0 为 0' },
    { name: 'step(a)', label: '阶跃函数：a ≥ 0 为 1，否则为 0（step(0) = 1）' },
    { name: 'if(a < b, p, q)', label: '条件：满足时取 p，否则取 q；比较可用 < <= > >=' }
  ],
  examples: ['10*sin(2*pi*t)', '5*step(t - 1)', '-0.5*vx', 'if(t < 2, 3*t, 6)', '-m*g*0.1*sign(vx)'],
  notes: [
    '分量写成世界坐标系中的 Fx、Fy（单位 N），x 向右、y 向上为正。',
    '数字视为带有合适单位的系数，例如 2*pi*t 中的 2π 单位为 1/s，-0.5*vx 中的 0.5 单位为 N·s/m。',
    '不连续处（step、sign、if 的切换）和折点（abs、min、max、clamp）作为事件精确定位，事件表中记为“变力切换”。',
    'sign(vx) 之类在速度为零附近来回切换的写法可能无法继续计算，模拟摩擦请使用接触面的摩擦因数。'
  ]
}

const DIMS: Record<string, Dim> = Object.fromEntries(FORCE_VARIABLES.map(v => [v.name, unitDim(v.unit === 'rad' ? '' : v.unit)]))
const FORCE_DIM = unitDim('N')

function checkNode(node: Node) {
  switch (node.type) {
    case 'var':
      if (!(node.name in ENV_INDEX)) throw new ExprError(`未知变量 ${node.name}。可用变量：${FORCE_VARIABLES.map(v => v.name).join(', ')}；常数 pi、e`)
      return
    case 'neg': checkNode(node.arg); return
    case 'bin': case 'cmp': checkNode(node.left); checkNode(node.right); return
    case 'call':
      if (!ALLOWED_FUNCTIONS.includes(node.fn)) throw new ExprError(`变力表达式中不能使用函数 ${node.fn}`)
      node.args.forEach(checkNode)
      return
    default: return
  }
}

/** Parse a force component (throws ExprError with a Chinese message). */
export function parseForceExpr(src: string): Node {
  const node = parse(src, { constants: FORCE_CONSTANTS })
  checkNode(node)
  const d = inferDimension(node, DIMS)
  if (d && !dimEqual(d, FORCE_DIM)) {
    throw new ExprError(`表达式的量纲是 ${dimName(d)}，应为力（N）。数字可作为带单位的系数，例如 2*vx 表示 (2 N·s/m)·vx`)
  }
  return node
}

/** Check one force component expression: syntax, known variables and functions, and dimension of force (N). */
export function checkForceExpr(src: string): ForceExprCheck {
  if (!src || !src.trim()) return { ok: false, message: '表达式为空（不需要的分量请填 0）' }
  try {
    parseForceExpr(src)
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof ExprError ? e.message : `无法解析：${(e as Error).message}` }
  }
}

// ---- Compiled form ----
/** Evaluates a (sub)expression: env holds the variables, sw the frozen switch branches (null: exact evaluation). */
export type ExprFn = (env: Float64Array, sw: ArrayLike<number> | null) => number

/** Kind of piecewise function behind a switch (clamp compiles to a max and a min switch). */
export type SwitchKind = 'step' | 'sign' | 'if' | 'abs' | 'min' | 'max'

/** A piecewise point of an expression. Its argument is ≥ 0 on branch +1 and < 0 on branch −1. */
export interface SwitchDef {
  kind: SwitchKind
  /** True for jumps (step, sign, if); false for kinks (abs, min, max, clamp). */
  jump: boolean
  /** Branch when the argument is exactly 0. */
  zero: -1 | 0 | 1
  /** Switching argument. */
  arg: ExprFn
  /** Index in the system's switch list. */
  index: number
}

/** A compiled force component. */
export interface CompiledExpr {
  src: string
  node: Node
  fn: ExprFn
  switches: SwitchDef[]
  /** Variables used. */
  uses: string[]
}

/** Branch of a switch for an argument value. */
export function branchOf(def: SwitchDef, arg: number): number {
  return arg > 0 ? 1 : arg < 0 ? -1 : def.zero
}

function compileNode(node: Node, sws: SwitchDef[], base: number): ExprFn {
  const sub = (n: Node) => compileNode(n, sws, base)
  const addSwitch = (kind: SwitchKind, jump: boolean, zero: -1 | 0 | 1, arg: ExprFn): number => {
    const index = base + sws.length
    sws.push({ kind, jump, zero, arg, index })
    return index
  }
  switch (node.type) {
    case 'num': { const v = node.value; return () => v }
    case 'var': { const i = ENV_INDEX[node.name]; return env => env[i] }
    case 'neg': { const a = sub(node.arg); return (e, s) => -a(e, s) }
    case 'cmp': throw new ExprError('比较式只能作为 if 的条件')
    case 'bin': {
      const a = sub(node.left), b = sub(node.right)
      switch (node.op) {
        case '+': return (e, s) => a(e, s) + b(e, s)
        case '-': return (e, s) => a(e, s) - b(e, s)
        case '*': return (e, s) => a(e, s) * b(e, s)
        case '/': return (e, s) => a(e, s) / b(e, s)
        default: return (e, s) => dm.pow(a(e, s), b(e, s))
      }
    }
    case 'call': {
      const fn = node.fn
      if (fn === 'if') {
        const c = node.args[0]
        if (c.type !== 'cmp') throw new ExprError('if 的第一个参数应为比较式')
        const l = sub(c.left), r = sub(c.right)
        const less = c.op === '<' || c.op === '<='
        const arg: ExprFn = less ? (e, s) => r(e, s) - l(e, s) : (e, s) => l(e, s) - r(e, s)
        const k = addSwitch('if', true, c.op === '<' || c.op === '>' ? -1 : 1, arg)
        const p = sub(node.args[1]), q = sub(node.args[2])
        const op = c.op
        return (e, s) => {
          const take = s ? s[k] > 0 : (op === '<' ? l(e, s) < r(e, s) : op === '<=' ? l(e, s) <= r(e, s) : op === '>' ? l(e, s) > r(e, s) : l(e, s) >= r(e, s))
          return take ? p(e, s) : q(e, s)
        }
      }
      if (fn === 'clamp') {
        const x = sub(node.args[0]), lo = sub(node.args[1]), hi = sub(node.args[2])
        const inner: ExprFn = (e, s) => (s ? (s[k1] > 0 ? x(e, s) : lo(e, s)) : Math.max(x(e, s), lo(e, s)))
        const k1 = addSwitch('max', false, 1, (e, s) => x(e, s) - lo(e, s))
        const k2 = addSwitch('min', false, 1, (e, s) => hi(e, s) - inner(e, s))
        return (e, s) => (s ? (s[k2] > 0 ? inner(e, s) : hi(e, s)) : Math.min(inner(e, s), hi(e, s)))
      }
      if (fn === 'min' || fn === 'max') {
        const a = sub(node.args[0]), b = sub(node.args[1])
        const k = addSwitch(fn, false, 1, fn === 'min' ? (e, s) => b(e, s) - a(e, s) : (e, s) => a(e, s) - b(e, s))
        if (fn === 'min') return (e, s) => (s ? (s[k] > 0 ? a(e, s) : b(e, s)) : Math.min(a(e, s), b(e, s)))
        return (e, s) => (s ? (s[k] > 0 ? a(e, s) : b(e, s)) : Math.max(a(e, s), b(e, s)))
      }
      if (fn === 'abs') {
        const a = sub(node.args[0])
        const k = addSwitch('abs', false, 1, a)
        return (e, s) => (s ? (s[k] > 0 ? a(e, s) : -a(e, s)) : Math.abs(a(e, s)))
      }
      if (fn === 'sign') {
        const a = sub(node.args[0])
        const k = addSwitch('sign', true, 0, a)
        const f = FUNCS.sign.fn
        return (e, s) => (s ? s[k] : f(a(e, s)))
      }
      if (fn === 'step') {
        const a = sub(node.args[0])
        const k = addSwitch('step', true, 1, a)
        const f = FUNCS.step.fn
        return (e, s) => (s ? (s[k] > 0 ? 1 : 0) : f(a(e, s)))
      }
      const f = FUNCS[fn].fn
      const args = node.args.map(sub)
      if (args.length === 1) { const a = args[0]; return (e, s) => f(a(e, s)) }
      if (args.length === 2) { const a = args[0], b = args[1]; return (e, s) => f(a(e, s), b(e, s)) }
      return (e, s) => f(...args.map(a => a(e, s)))
    }
  }
}

/** Compile a checked force component; its switches are numbered from `base` in the system's switch list. */
export function compileForceExpr(src: string, base = 0): CompiledExpr {
  const node = parseForceExpr(src)
  const switches: SwitchDef[] = []
  const fn = compileNode(node, switches, base)
  const uses: string[] = []
  const walk = (n: Node) => {
    if (n.type === 'var') { if (!uses.includes(n.name)) uses.push(n.name) } else if (n.type === 'neg') walk(n.arg)
    else if (n.type === 'bin' || n.type === 'cmp') { walk(n.left); walk(n.right) } else if (n.type === 'call') n.args.forEach(walk)
  }
  walk(node)
  return { src, node, fn, switches, uses }
}

/**
 * Fill the environment of a force acting on dynamic body `i` (state slot) at state X (layout of
 * core/solver/dynamics: positions, velocities, …, time at `timeSlot`).
 */
export function fillEnv(env: Float64Array, X: Float64Array, n: number, i: number, timeSlot: number, mass: number, g: number) {
  const vx = X[3 * n + 3 * i], vy = X[3 * n + 3 * i + 1]
  env[0] = timeSlot >= 0 ? X[timeSlot] : 0
  env[1] = X[3 * i]; env[2] = X[3 * i + 1]
  env[3] = vx; env[4] = vy; env[5] = Math.sqrt(vx * vx + vy * vy)
  env[6] = X[3 * i + 2]; env[7] = X[3 * n + 3 * i + 2]
  env[8] = mass; env[9] = g
}

/** Raised when a force expression has no finite value (sqrt of a negative number, division by zero …). */
export class ForceExprError extends Error {}
