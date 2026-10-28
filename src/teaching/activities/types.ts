/**
 * Teaching activities (26.56, D102): a goal, prerequisites, a concept diagnosis, a prediction with its reason, a
 * controlled experiment, questions with graded hints, process feedback and a transfer question. Every expected
 * answer comes from the Rust model registry (`modelEval`); the interface only compares the learner's input with it.
 * Pure data; texts are trilingual records (T).
 */
import type { Tri } from '../../i18n/tri'
import type { Stage } from '../../content/models/types'

/** What a graded item checks (blueprint EDU09). */
export type Dimension = 'concept' | 'unit' | 'direction' | 'modelling' | 'calculation' | 'explanation'
export const DIMENSIONS: Dimension[] = ['concept', 'unit', 'direction', 'modelling', 'calculation', 'explanation']

/** An option of a choice question; `feedback` names the misconception behind a wrong option. */
export interface ChoiceOption { id: string; text: Tri; feedback?: Tri }

/**
 * Where the correct option comes from: a fixed id (concept and explanation questions), the condition of the model
 * that holds (`condition`: option ids are condition ids, or mapped through `map`), or the sign of an output.
 */
export type ChoiceAnswer =
  | { fixed: string }
  | { condition: true; map?: Record<string, string> }
  | { sign: { output: string; pos: string; neg: string; zero?: string } }

export interface QuestionBase {
  id: string
  prompt: Tri
  /** Hints shown one by one on request; using them is recorded, not penalized. */
  hints?: Tri[]
}

/** One option is correct. */
export interface ChoiceQuestion extends QuestionBase {
  kind: 'choice'
  dimension: 'concept' | 'direction' | 'modelling' | 'explanation'
  options: ChoiceOption[]
  answer: ChoiceAnswer
}

/** Several options are correct (e.g. the forces present). */
export interface MultiQuestion extends QuestionBase {
  kind: 'multi'
  dimension: 'modelling'
  options: ChoiceOption[]
  answer: string[]
}

/** A number with its unit: the value is compared with an output of the model by the scaled error (D106). */
export interface NumberQuestion extends QuestionBase {
  kind: 'number'
  output: string
  /** SI units offered; the one with the output's dimension is right. */
  units: string[]
  /** Accepted scaled error e = |q − q_ref| / max(|q_ref|, scale). */
  tol: number
  scale?: number
  /** The sign carries a direction: a right magnitude with the wrong sign is a direction error. */
  signed?: boolean
}

/** How an output changes over the experiment (prediction). */
export interface TrendQuestion extends QuestionBase {
  kind: 'trend'
  output: string
}

export type Question = ChoiceQuestion | MultiQuestion | NumberQuestion | TrendQuestion

/** The controlled experiment: one input varied, the others held. */
export interface Experiment {
  vary: string
  values: number[]
  observe: string[]
  note: Tri
}

export interface ActivitySpec {
  id: string
  title: Tri
  stage: Stage
  /** Model families; the first one computes the answers. */
  models: string[]
  goals: Tri[]
  prerequisites: { activities?: string[]; models?: string[]; note?: Tri }
  /** Inputs of the main model (SI); missing ones take the model's worked example. */
  inputs: Record<string, number>
  diagnostic: ChoiceQuestion[]
  /** Prediction (before the experiment) and the reasons offered for it; `reason` is the sound one. */
  predict: { question: ChoiceQuestion | TrendQuestion; reasons: ChoiceOption[]; reason: string }
  experiment?: Experiment
  questions: Question[]
  transfer: { text: Tri; inputs: Record<string, number>; questions: Question[] }
  /** Where to see it happen. */
  open?: { template?: string; lab?: string; preset?: string }
}
