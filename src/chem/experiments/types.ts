/**
 * Guided experiments of the chemistry bench (26.64, D270): the data a guided experiment is made of.
 *
 * A guided experiment is a layer of steps and checks over the same bench and the same engine. It lays out a starting
 * bench (vessels with their instruments), names the reagents it uses, and lists steps; whether a step is done is
 * decided by a **check** — a condition on numbers the core reports (the state of a vessel, the events of the log, a
 * circuit) — never by a script or an animation. The student may leave the path at any time: the engine computes what
 * follows, and a check simply stays open until its condition holds.
 *
 * Vessels are named by the letter they carry on the bench ("A", "B" …) in the definitions; `resolve` in defs.ts turns
 * the letters into the ids of the starting document. Texts are Chinese source texts of the interface tables
 * (src/i18n/texts/v2664exp.ts).
 */
import type { BenchAction } from '../../engine/chem'

/** A number read from the bench. `v` is a vessel. */
export type Quantity =
  /** pH; temperature (°C); liquid volume (mL); mass of the contents (g); water (g); gas held (mL); pressure (kPa). */
  | { q: 'pH' | 'T' | 'volume' | 'mass' | 'water' | 'gasVolume' | 'pressure'; v: string }
  /**
   * Amount of something in the vessel, summed over `id`: a solid, a gas of the head space or the jar, a dissolved
   * species of the solution (`species`), a solute or liquid outside the aqueous network (`solute`, `liquid`), gas that
   * left an open vessel (`released`). Units: mol (default); g for a solid; mL for a gas (its share of the gas volume
   * the core reports); M (mol/L) for a species.
   */
  | { q: 'solid' | 'gas' | 'species' | 'solute' | 'liquid' | 'released'; v: string; id: string | string[]; unit?: 'mol' | 'g' | 'mL' | 'M' }
  /** A channel of the colour of the liquid (0 … 255) or of the gas (`gas: true`); 255 when there is none. */
  | { q: 'colour'; v: string; ch: 'r' | 'g' | 'b'; gas?: boolean }
  /** What the core's events add up to in this vessel since the experiment began: mol (extent for a reaction). */
  | { q: 'event'; v: string; code: 'precipitate' | 'dissolved' | 'gas' | 'reaction' | 'boiling'; id?: string }
  /** Of the circuit this vessel is part of: e.m.f. (V), current (A, magnitude), charge (C), mass change of an electrode (g; `electrode` is its material). */
  | { q: 'circuit'; v: string; field: 'emf' | 'I' | 'charge' | 'mass'; electrode?: string }
  /** A channel (0 … 255) of the colour of a flame holding what is in the vessel, seen through the filters on it (the core's flame colour); 0 when nothing colours the flame. */
  | { q: 'flame'; v: string; ch: 'r' | 'g' | 'b' }
  /** Bench time, s. */
  | { q: 'time' }

/** A condition on the bench. */
export type Check =
  /** The quantity lies in [min, max]. With `since: 'step'` the change since the step became the current one is meant. */
  | { is: Quantity; min?: number; max?: number; since?: 'step' }
  /** The quotient of two quantities lies in [min, max] (a mass fraction, a mole ratio). */
  | { ratio: [Quantity, Quantity]; min?: number; max?: number }
  /** A state of a vessel: stoppered, heated, held in a bath, lit, set up to collect gas, its tube leading to `to`. */
  | { flag: 'closed' | 'heating' | 'bath' | 'ignited' | 'collecting' | 'connected'; v: string; to?: string; on?: boolean }
  /** An instrument or a tool is on the vessel (a kind of apparatus.json). */
  | { part: string; v: string }
  /** The circuit of the vessel is closed (both electrodes in one solution, or the salt bridge in place). */
  | { wired: string; on?: boolean }
  | { all: Check[] }
  | { any: Check[] }
  | { not: Check }

/** What "show me" does for a step: actions of the log, or putting a part on a vessel (a drawing field of the bench). */
export type DemoAction = BenchAction | { act: 'attach'; vessel: string; part: string }

/** A typical mistake: when its condition holds while the step is open, the runner says which step and why. */
export interface Mistake { when: Check; text: string }

export interface Step {
  /** What to do (one sentence). */
  text: string
  /** How to do it on this bench, or what to watch (optional). */
  hint?: string
  /** The step is done when this holds. */
  check: Check
  /** The intended actions: what "show me" performs, and what the tests perform. */
  demo: DemoAction[]
  mistakes?: Mistake[]
  /**
   * For the tests: actions a student might take instead that must NOT complete the step (performed on a bench where
   * the earlier steps were done as intended).
   */
  wrong?: DemoAction[]
}

export interface SetupVessel {
  kind: string
  capacity_mL?: number
  /** Stoppered from the start (it then holds the room's air). */
  closed?: boolean
  /** Instruments and tools standing on it from the start. */
  parts?: string[]
  /** Clamped over this vessel (a burette over its flask): the letter of that vessel. */
  above?: string
}

export type ExperimentGroup = 'junior' | 'seniorCompulsory' | 'seniorElective' | 'demo'

export interface Equation { reactants: string[]; products: string[] }

export interface Experiment {
  id: string
  group: ExperimentGroup
  title: string
  /** 实验目的. */
  goal: string
  /** 原理: a short explanation; the balanced equations come from the core (`equations`). */
  principle: string
  equations: Equation[]
  /** Safety of the real experiment. */
  safety: string
  /** What the model does not cover (D273), when relevant. */
  limits?: string
  /** The experiment is offered with a reduced scope: what is left out and why (an engine or catalogue gap). */
  reduced?: string
  /** Not offered: the precise reason (species, reaction or apparatus missing). The steps are then empty. */
  unavailable?: string
  vessels: SetupVessel[]
  /** Reagents of the shelf this experiment uses (ids of the catalogue), offered in the runner. */
  reagents: string[]
  steps: Step[]
}
