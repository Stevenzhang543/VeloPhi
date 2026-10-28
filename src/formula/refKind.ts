/**
 * How independent the check of a formula card is (26.56, FOR06, D101). A card compares a formula with the
 * simulation; that comparison is evidence of a different strength:
 *
 * - `analytic`: the formula is an independent closed-form solution from the given parameters (independent evidence);
 * - `conservation`: a conservation law or theorem (energy, momentum, work–energy, impulse) checked on the run — the
 *   law is independent of the solver, but it does not determine the motion by itself;
 * - `consistency`: the formula uses values read from the same run (marked “simulated”), so agreement shows internal
 *   consistency, not correctness (same source).
 *
 * The Rust–TypeScript parity checks of the core are port regressions and are labelled so in the reports.
 */
import type { FormulaDef } from './library'
import type { Sample } from './recognize'

export type FormulaRef = 'analytic' | 'conservation' | 'consistency'

/** Formulas that state a conservation law or a theorem of energy or momentum. */
export const CONSERVATION = new Set([
  'col.px', 'col.py', 'pr.E', 'hi.L', 'wd.px', 'sb.p', 'vf.J', 'vf.W', 'cf.dEk', 'cf.J', 'or.E', 'spin.W', 'ce.W', 'cb.v', 'cb.P',
  'ceb.W', 'ceb.P', 'cl.E', 'rail.Q', 'zb.v', 'ze.W', 'en.ledger', 'mo.px', 'mo.py'
])

const NAME = /[A-Za-z_][A-Za-z0-9_]*/g

/** Names of variables an expression uses (functions and the constants pi, e are not variables of a sample). */
export function exprNames(expr: string): string[] {
  const out = new Set<string>()
  for (const m of expr.matchAll(NAME)) {
    const after = expr.slice((m.index ?? 0) + m[0].length).trimStart()
    if (!after.startsWith('(')) out.add(m[0])
  }
  return [...out]
}

export function formulaRef(f: FormulaDef, sample: Sample | null): FormulaRef {
  if (sample && exprNames(f.expr).some(n => sample.vars[n]?.sim)) return 'consistency'
  if (CONSERVATION.has(f.id)) return 'conservation'
  return 'analytic'
}
