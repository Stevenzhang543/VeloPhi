/**
 * Derivation data (manual 26.50, D28). A derivation is a list of steps from a force analysis or a
 * conservation law to the formula. Steps are data: LaTeX plus trilingual explanation and the law used.
 * Numeric substitution is not written here; `formula/solve.ts` generates it from the formula expression.
 */
import type { Tri } from '../../i18n/tri'

/** One step of a derivation. */
export interface DerivationStep {
  /** The equation of this step (KaTeX). */
  latex: string
  /** What the step does, e.g. "Resolve gravity along and normal to the incline". */
  text: Tri
  /** Law or reason the step relies on, e.g. "Newton's second law along the incline", "previous step". */
  basis?: Tri
  /**
   * Machine-checkable form of the step's equation in formula/expr.ts syntax over the situation variables
   * (plus the step's own symbols listed in `symbols`). Tests check both sides for equal dimensions.
   */
  check?: { lhs: string; rhs: string }
  /** Units of symbols that `check` introduces and the situation does not provide (e.g. { a1: 'm/s²' }). */
  symbols?: Record<string, string>
}

/** Steps shared by several formulas of a situation (e.g. the force analysis of the block). */
export interface SharedSteps {
  /** Unique id, e.g. "board-block.block-forces". */
  id: string
  title: Tri
  steps: DerivationStep[]
}

/** Derivation and translated card texts of one library formula. */
export interface Derivation {
  /** FormulaDef.id. */
  formula: string
  /** Translations of the card title (FormulaDef.title). */
  title: Tri
  /** Translations of FormulaDef.note / method when the formula has them. */
  note?: Tri
  method?: Tri
  /** Translations of FormulaDef.causes, same order. */
  causes?: Tri[]
  /** Shared step lists shown before `steps`, in order (SharedSteps ids). */
  uses?: string[]
  /** Steps specific to this formula; the last step ends with the formula itself. */
  steps: DerivationStep[]
}
