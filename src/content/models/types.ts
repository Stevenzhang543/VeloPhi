/**
 * The model registry (26.56, D98, D106): the 180 model families of the capability blueprint as data. A model names
 * its typed inputs (SI unit, semantic quantity, display kind, domain, the value of its worked example), its
 * intermediate quantities, its conditions (four states), its outputs (formula, branch or roots) in the formula
 * language, and what it is: geometry, assumptions, validity, sources, maturity, links to the templates, labs and
 * problems that exercise it, and the benchmarks that check it. The Rust core evaluates the expressions
 * (engine/velophi-core/src/modelcalc.rs); the interface shows the results and never computes an answer itself.
 *
 * Texts are trilingual inline (`T(zh, en, de)`). Pure data (no Vue, no DOM).
 */
import type { Tri } from '../../i18n/tri'
import type { UnitKind } from '../../units/units'

/** Trilingual text. */
export const T = (zh: string, en: string, de: string): Tri => ({ zh, en, de })

/** School level: 初中, 高中, 大学, 研究生. */
export type Stage = 'j' | 's' | 'u' | 'g'
/** Priority of the blueprint (P0 is the common foundation, not a model). */
export type Priority = 'P1' | 'P2' | 'P3'
/** Domain letter of the model id. */
export type Domain = 'G' | 'M' | 'F' | 'W' | 'T' | 'E' | 'B' | 'O' | 'Q' | 'N' | 'R' | 'X'

/**
 * Geometry of a model (ENG03): `point` a particle or lumped body in one or two dimensions; `plane` plane motion of
 * rigid bodies; `section2d` a two-dimensional cross-section of a body or field infinite in depth (per-metre
 * quantities, or a stated thickness); `plane3d` three-dimensional sources evaluated in a plane (point charges);
 * `axisym` axially symmetric 3D; `line1d` a one-dimensional continuum (string, rod, chain); `lumped` a circuit or
 * lumped-element network; `space3d` three-dimensional; `abstract` no spatial geometry (states, statistics, units).
 */
export type Geometry = 'point' | 'plane' | 'section2d' | 'plane3d' | 'axisym' | 'line1d' | 'lumped' | 'space3d' | 'abstract'

/** Implementation status (coverage matrix). */
export type Status = 'verified' | 'partial' | 'unverified' | 'missing' | 'deferred'
/** Maturity: L0 concept, L1 restricted analytic, L2 interactive numerical simulation, L3 verified capability. */
export type Level = 0 | 1 | 2 | 3

/**
 * Kind of reference a check compares with (FOR06): an independent analytic solution, another algorithm or
 * implementation, measured data, or a value derived from the same source (consistency only, no evidence).
 */
export type ReferenceKind = 'analytic' | 'otherMethod' | 'experiment' | 'sameSource'

/** A typed input. */
export interface InputSpec {
  id: string
  /** KaTeX symbol. */
  symbol: string
  label: Tri
  /** SI unit (a unit of formula/units.ts). */
  unit: string
  /** Display kind when the SI unit alone is ambiguous (a temperature difference, an angle in rad). */
  kind?: UnitKind
  /** Semantic quantity (V as volume or voltage is told apart here, not by the symbol). */
  quantity: string
  /** Value of the worked example (SI). */
  value: number
  /** Domain bounds (SI); `open` excludes them. */
  min?: number
  max?: number
  open?: boolean
}

/** An intermediate quantity. */
export interface LetSpec { id: string; symbol: string; label: Tri; unit: string; kind?: UnitKind; expr: string }

/** A condition: applicable when `expr` holds, approximately when only `approx` holds (comparisons, && and ||). */
export interface CondSpec { id: string; label: Tri; expr: string; approx?: string; note?: Tri }

/** Roots of f(var) = 0 in [lo, hi], kept when `accept` holds. */
export interface SolveSpec { var: string; f: string; lo: string; hi: string; accept?: string; samples?: number }

/** An output: a formula, one branch of several with the same id (`when`), or the roots of an equation. */
export interface OutputSpec {
  id: string
  symbol: string
  label: Tri
  unit: string
  kind?: UnitKind
  expr?: string
  requires?: string[]
  when?: string
  /** Name of the branch (shown with the result). */
  branch?: Tri
  solve?: SolveSpec
}

/** Where a model is exercised in the application. */
export interface ModelLinks {
  templates?: string[]
  labs?: string[]
  problems?: string[]
  /** Formula situations of the studio (src/formula/library.ts). */
  situations?: string[]
  /** Teaching activities (src/teaching/activities). */
  activities?: string[]
  /** Handbook topics or concept pages (`concept:<id>`). */
  topics?: string[]
}

/** Review state of the content (ENG18): who checked what, when (ISO date) — physics, teaching, language. */
export interface Review { physics?: string; teaching?: string; language?: string }

/** One model family. */
export interface ModelSpec {
  id: string
  title: Tri
  stages: Stage[]
  priority: Priority
  geometry: Geometry
  /** Modelling assumptions (shown with every result). */
  assumptions: Tri[]
  /** Validity domain in words. */
  validity: Tri
  /** Restriction of a P3 model delivered as a restricted analytic model. */
  restricted?: Tri
  /** Source ids of the blueprint (S01 …). */
  sources: string[]
  inputs: InputSpec[]
  lets?: LetSpec[]
  conditions?: CondSpec[]
  outputs: OutputSpec[]
  /** The worked example in words and its rounded answer for reading (doc 02, EX <id>). */
  example: { text: Tri; answer: Tri }
  /** Teaching point. */
  point: Tri
  status: Status
  level: Level
  /** Teaching maturity: 0 none, 1 content, 2 activity with evidence collection (L4 needs learner trials). */
  teaching: 0 | 1 | 2
  /** Kinds of references the benchmarks of this model use. */
  references: ReferenceKind[]
  /** Benchmark ids (tests that check this model; see the coverage matrix). */
  benchmarks: string[]
  links: ModelLinks
  /** What is missing for the next level (shown in the coverage matrix). */
  gap?: Tri
  review: Review
}
