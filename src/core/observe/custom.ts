/**
 * Custom quantities (manual 26.51, D39 and D41): expression quantities defined by the scene, such as
 * `ek(b1) + ep(b1)` or `x(b2) - x(b1)`, which the watch panel, the charts, the exports and the sweeps read like
 * the built-in ones (quantity id `custom.<id>`).
 *
 * Language: the formula expression language (D14) with
 *   - `key(owner)`: a built-in quantity of a body or connector named by id or name (x y angle vx vy v omega ax ay
 *     a alpha ek ep px py fd Fg of bodies; T len of ropes; F x of springs; F Fx Fy of hinges and forces; M P w F of
 *     motors; N s of sliders; F M of welds; M of gears; P of forces; theta and beta are accepted for angle and
 *     alpha);
 *   - `key(on, by)`: contact quantities N f fx fy Nx Ny vt (on body `on`, exerted by body `by`) and slide heat of
 *     a pair;
 *   - the variables t, E, Ek, Ep, Es, Px, Py and g (time, system energies and momentum, |g|).
 * Expressions can only read observed quantities and constants (no code runs) and do not refer to other custom
 * quantities. The unit of the result comes from a dimension check (D39): numbers are dimensionless coefficients,
 * except that a number added to a dimensioned term, or used inside a function whose argument must be a pure
 * number, carries whatever unit makes the expression consistent (so `y(b1) - 2` is in metres and `sin(2*t)` is
 * accepted). Errors are ExprErrors with user-facing messages.
 */
import { tl } from '../../i18n'
import type { Node } from '../../formula/expr'
import { ExprError, evaluate, parse, variables } from '../../formula/expr'
import type { Dim } from '../../formula/units'
import { DIMLESS, UNITS, dimEqual, dimMul, dimPow, formatDim, unitFor } from '../../formula/units'
import type { CustomQuantityDef } from '../scene/types'

export type { CustomQuantityDef }

/** A built-in quantity that expressions may read: its id and SI unit. */
export interface CustomRef { variable: string; id: string }

/** A compiled custom quantity. */
export interface CompiledCustom {
  node: Node
  /** Built-in quantities read, as the synthetic variables of `node`. */
  refs: CustomRef[]
  /** Variables of the system (t, E, …) read. */
  globals: string[]
  /** SI unit of the result ('' for a pure number). */
  unit: string
}

/** Everything compiling needs from the scene: the built-in quantities and the objects that can be named. */
export interface CustomScope {
  /** Built-in quantity id → SI unit. */
  units: Map<string, string>
  /** Bodies, connectors and pulleys: id and display name. */
  owners: Array<{ id: string; name: string }>
  /** Canonical form of an id (pair order). */
  canonical: (id: string) => string
}

/** Quantity keys that take an owner (one body or connector). */
const ONE_ARG = new Set(['x', 'y', 'angle', 'vx', 'vy', 'v', 'omega', 'ax', 'ay', 'a', 'alpha', 'ek', 'ep', 'px', 'py', 'fd', 'Fg',
  'T', 'len', 'F', 'Fx', 'Fy', 'M', 'P', 'w', 'N', 's'])
/** Keys of contact quantities (two bodies). */
const CONTACT = new Set(['N', 'Nx', 'Ny', 'f', 'fx', 'fy', 'vt'])
/** Keys of pair quantities (two bodies, unordered). */
const PAIR = new Set(['slide', 'heat'])
const ALIAS: Record<string, string> = { theta: 'angle', beta: 'alpha' }

/** Variables of the system and the built-in quantity each reads (t and g are computed directly). */
export const CUSTOM_GLOBALS: Record<string, { id: string | null; unit: string }> = {
  t: { id: null, unit: 's' },
  g: { id: null, unit: 'm/s²' },
  E: { id: 'system.e', unit: 'J' },
  Ek: { id: 'system.ek', unit: 'J' },
  Ep: { id: 'system.ep', unit: 'J' },
  Es: { id: 'system.es', unit: 'J' },
  Px: { id: 'system.px', unit: 'kg·m/s' },
  Py: { id: 'system.py', unit: 'kg·m/s' }
}

/** Every key accepted as `key(…)`. */
export function customKeys(): string[] {
  return [...new Set([...ONE_ARG, ...CONTACT, ...PAIR, ...Object.keys(ALIAS)])]
}

function resolveOwner(scope: CustomScope, raw: string): string {
  const name = raw.trim()
  if (!name) throw new ExprError(tl('括号里应写物体或连接件的名称（或 id）'))
  if (scope.owners.some(o => o.id === name)) return name
  const byName = scope.owners.filter(o => o.name.trim() === name)
  if (byName.length === 1) return byName[0].id
  if (byName.length > 1) throw new ExprError(tl('有多个对象叫“{0}”，请改用它的 id', [name]))
  throw new ExprError(tl('找不到名为“{0}”的物体或连接件', [name]))
}

/** Compile an expression against the quantities of a scene; throws ExprError with a user-facing message. */
export function compileCustom(expr: string, scope: CustomScope): CompiledCustom {
  const src = expr.trim()
  if (!src) throw new ExprError(tl('表达式为空'))
  if (/(^|[^A-Za-z_0-9])__/.test(src)) throw new ExprError(tl('名称不能以两个下划线开头'))
  const refs: CustomRef[] = []
  const refOf = (id: string): string => {
    const old = refs.find(r => r.id === id)
    if (old) return old.variable
    const variable = `__q${refs.length}`
    refs.push({ variable, id })
    return variable
  }
  // Innermost calls first: `sqrt(x(b1))` rewrites x(b1); calls of the language's functions are kept as they are
  const rewritten = src.replace(/(?<![A-Za-z_0-9])([A-Za-z_][A-Za-z_0-9]*)\s*\(([^()]*)\)/g, (whole, key: string, inner: string) => {
    const k = ALIAS[key] ?? key
    if (!ONE_ARG.has(k) && !CONTACT.has(k) && !PAIR.has(k)) return whole
    const args = inner.split(',')
    let id: string
    if (args.length === 1 && ONE_ARG.has(k)) id = `${resolveOwner(scope, args[0])}.${k}`
    else if (args.length === 2 && CONTACT.has(k)) id = `contact.${resolveOwner(scope, args[0])}|${resolveOwner(scope, args[1])}.${k}`
    else if (args.length === 2 && PAIR.has(k)) id = scope.canonical(`pair.${resolveOwner(scope, args[0])}|${resolveOwner(scope, args[1])}.${k}`)
    else if (CONTACT.has(k) || PAIR.has(k)) throw new ExprError(tl('{0}(…) 需要两个物体，如 {0}(b1, b2)', [key]))
    else throw new ExprError(tl('{0}(…) 只需要一个对象，如 {0}(b1)', [key]))
    if (!scope.units.has(id)) throw new ExprError(tl('{0}({1})：本场景中没有这个量', [key, inner.trim()]))
    return refOf(id)
  })
  const node = parse(rewritten)
  const dims: Record<string, Dim> = {}
  const globals: string[] = []
  for (const v of variables(node)) {
    const ref = refs.find(r => r.variable === v)
    if (ref) { dims[v] = UNITS[scope.units.get(ref.id)!] ?? DIMLESS; continue }
    const g = CUSTOM_GLOBALS[v]
    if (!g) throw new ExprError(tl('未知的量 {0}：可用 t、E、Ek、Ep、Es、Px、Py、g，或 x(物体) 这样的写法', [v]))
    if (g.id && !scope.units.has(g.id)) throw new ExprError(tl('{0}：本场景中没有这个量', [v]))
    globals.push(v)
    dims[v] = UNITS[g.unit]
  }
  const d = dimensionOf(node, dims).d
  return { node, refs, globals, unit: unitFor(d) }
}

/** Dimension of a term and whether a free numeric coefficient can still take a unit. */
interface Dm { d: Dim; free: boolean }

function unify(a: Dm, b: Dm, what: string): Dm {
  if (dimEqual(a.d, b.d)) return { d: a.d, free: a.free && b.free }
  if (b.free) return { d: a.d, free: a.free }
  if (a.free) return { d: b.d, free: false }
  throw new ExprError(tl('量纲不一致：{0} {1} {2}', [formatDim(a.d), what, formatDim(b.d)]))
}

function pure(a: Dm, fn: string) {
  if (!a.free && !dimEqual(a.d, DIMLESS)) throw new ExprError(tl('{0} 的参数必须无量纲，实为 {1}', [fn, formatDim(a.d)]))
}

/** Dimension of a custom expression (see the module comment for the role of numbers). */
function dimensionOf(node: Node, dims: Record<string, Dim>): Dm {
  switch (node.type) {
    case 'num': return { d: DIMLESS, free: true }
    case 'var': return { d: dims[node.name], free: false }
    case 'neg': return dimensionOf(node.arg, dims)
    case 'cmp': unify(dimensionOf(node.left, dims), dimensionOf(node.right, dims), node.op); return { d: DIMLESS, free: false }
    case 'bin': {
      const a = dimensionOf(node.left, dims)
      if (node.op === '^') {
        const r = node.right
        const p = r.type === 'num' ? r.value : r.type === 'neg' && r.arg.type === 'num' ? -r.arg.value : null
        if (p !== null) return { d: dimPow(a.d, p), free: a.free }
        pure(dimensionOf(r, dims), '^')
        if (!a.free && !dimEqual(a.d, DIMLESS)) throw new ExprError(tl('有量纲的量只能取数字次幂'))
        return { d: DIMLESS, free: a.free }
      }
      const b = dimensionOf(node.right, dims)
      if (node.op === '+' || node.op === '-') return unify(a, b, node.op)
      return { d: node.op === '*' ? dimMul(a.d, b.d) : dimMul(a.d, dimPow(b.d, -1)), free: a.free || b.free }
    }
    case 'call': {
      const args = node.args.map(x => dimensionOf(x, dims))
      switch (node.fn) {
        case 'if': return unify(args[1], args[2], ',')
        case 'sqrt': return { d: dimPow(args[0].d, 0.5), free: args[0].free }
        case 'abs': return args[0]
        case 'sign': case 'step': return { d: DIMLESS, free: false }
        case 'min': case 'max': return unify(args[0], args[1], ',')
        case 'clamp': return unify(unify(args[0], args[1], ','), args[2], ',')
        case 'atan2': unify(args[0], args[1], ','); return { d: DIMLESS, free: false }
      }
      for (const a of args) pure(a, node.fn)
      return { d: DIMLESS, free: false }
    }
  }
}

/** Value of a compiled quantity, given the values of its references and the system variables. */
export function evaluateCustom(c: CompiledCustom, value: (id: string) => number, global: (name: string) => number): number {
  const vars: Record<string, number> = {}
  for (const r of c.refs) vars[r.variable] = value(r.id)
  for (const g of c.globals) vars[g] = global(g)
  try { return evaluate(c.node, vars) } catch { return Number.NaN }
}

/** KaTeX symbol of a custom quantity: Q with its id as subscript (the name is shown as its label). */
export function customSymbol(id: string): string {
  return `Q_{\\mathrm{${id.replace(/[^A-Za-z0-9]/g, '')}}}`
}

/** A fresh id for a new custom quantity (q1, q2, …). */
export function nextCustomId(list: CustomQuantityDef[]): string {
  let i = 1
  while (list.some(q => q.id === `q${i}`)) i++
  return `q${i}`
}
