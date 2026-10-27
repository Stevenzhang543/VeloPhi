/**
 * Plain data types of recordings as the Rust core reports them (26.53). They keep the names of the 26.52
 * TypeScript solver so the interface code reads the same; the solver itself lives in Rust (and, as a test
 * reference, in tests/reference).
 */
import type { Message } from '../i18n/message'

/** Event functions (what fired). */
export type EventType = 'contact' | 'liftoff' | 'leave' | 'slip' | 'stop' | 'slack' | 'taut' | 'switch' | 'pulley'
  | 'limit' | 'unlimit' | 'mslip' | 'mlock' | 'rollStart' | 'rollStop' | 'zone'

/** Kind of a state change reported at an event. */
export type ChangeType =
  | 'impact' | 'touch' | 'separate' | 'stick' | 'slip' | 'reverse' | 'leave' | 'slack' | 'taut' | 'switch' | 'timestep' | 'pulley'
  | 'limit' | 'unlimit' | 'motorSlip' | 'motorLock' | 'rollStop' | 'rollStart' | 'zoneEnter' | 'zoneLeave'

/** One change at an event (see engine/velophi-core/src/simulation.rs `ChangeDetail`). */
export interface ChangeDetail {
  type: ChangeType
  /** Pair key "a|b", rope id, force id (switch), slider id (end stop) or motor id. */
  subject: string
  bodies: string[]
  impulse?: number
  vnBefore?: number
  vnAfter?: number
  restitution?: number
  point?: { x: number; y: number }
  normal?: { x: number; y: number }
  tangentImpulse?: number
  vtBefore?: number
  vtAfter?: number
  switchIndex?: number
  branch?: number
  kink?: boolean
}

/** A contact, rope or end stop of an impact. */
export interface ImpactPointInfo {
  kind: 'contact' | 'rope' | 'limit'
  /** Pair key of a contact (null otherwise). */
  pair: string | null
  /** Rope (or slider) index; −1 for a contact. */
  rope: number
  /** Friction state in the impact: 'slip' | 'stick' | 'reverse' (null without friction). */
  friction: string | null
  vnBefore: number
  vnAfter: number
  impulse: number
  cx: number
  cy: number
}

/** Summary of an impact (the full data: the `eventData` operation). */
export interface ImpactInfo { loss: number; energyBefore: number; energyAfter: number; points: ImpactPointInfo[] }

/** An event: the instant, what fired, the changes, the segment it opens and where the canvas labels it. */
export interface SimEvent {
  index: number
  t: number
  triggers: EventType[]
  changes: ChangeDetail[]
  /** Segment starting at this event. */
  segment: number
  impact: ImpactInfo | null
  /** Label point (m): the first change's point, else its first moving body's position before the event. */
  at: [number, number] | null
}

/** A time interval with one mode (the mode itself stays in the core). */
export interface Segment {
  index: number
  t0: number
  t1: number
  /** Compact mode description. */
  label: string
  /** Cumulative impact loss before this segment (J). */
  impactLoss: number
  /** Computed by the Moreau–Jean fallback (reduced accuracy). */
  reduced?: boolean
}

/** Solver statistics of a run. */
export interface SimStats {
  steps: number
  rejected: number
  events: number
  locateIterations: number
  maxPositionCorrection: number
  maxVelocityCorrection: number
  ambiguousModes: number
  /** Computing time (ms). */
  wallMs: number
}

/** Why a run ended. */
export type StopReason = 'duration' | 'stopAt' | 'rest' | 'restApprox' | 'user' | 'error' | 'pulley'

/** Rolling fingerprint of a run up to time `t`. */
export interface RollingFingerprint { hash: string; t: number; chunks: number }

/** End state of a run as the engine reports it. */
export interface RecordingEnd { completed: boolean; error: Message | null; hash: string; stopReason?: StopReason }

/** Energy ledger at one state (J). */
export interface Ledger {
  kinetic: number
  gravity: number
  spring: number
  field: number
  mechanical: number
  frictionHeat: number
  appliedWork: number
  damping: number
  beltWork: number
  impactLoss: number
  balance: number
}

/** Memory and work counters of a recording (solver-information panel). */
export interface StreamStats {
  memoryBytes: number
  residentBytes: number
  chunks: number
  residentChunks: number
  checkpoints: number
  evictions: number
  rebuilds: number
  remoteRebuilds: number
}
