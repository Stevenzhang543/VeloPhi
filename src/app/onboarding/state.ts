/**
 * Onboarding (26.64, D248): what this device has seen of the walkthrough, and from it what the app offers.
 *
 * Stored on the device (`velophi.onboarding.v1`):
 *   seenVersion   the version whose onboarding or "what is new" was last started, finished or dismissed
 *   segments      for each of the five segments: the step reached and whether it was finished
 *   dismissedAt   when the offer was last put away (ISO date), or null
 *
 * `offer()` is the rule of D248 as a pure function of that record and the situation:
 *   first run                                   → 'first'  (the home page shows 开始; nothing pops up)
 *   another minor version that has a list       → 'new'    (home page and Help show "what is new"; no full replay)
 *   share link, projection, automatic tests     → 'none'
 * Unsaved work never changes the offer: nothing here opens by itself — the offer is a block on the home page and a dot
 * on the Help button, so work is not interrupted (D248, last row).
 *
 * A device that ran 26.58–26.63 has no record but has `settings.ui.welcomed`: it counts as having seen 26.63.
 */
import { reactive } from 'vue'

export const SEGMENTS = ['welcome', 'motion', 'physics', 'chem', 'library'] as const
export type SegmentId = typeof SEGMENTS[number]
/** `whatsnew` is the walk of the list of changes; it is not one of the five segments of the checklist. */
export type WalkId = SegmentId | 'whatsnew'

export interface SegmentRecord { step: number; done: boolean }
export interface OnboardingRecord { seenVersion: string | null; segments: Record<SegmentId, SegmentRecord>; dismissedAt: string | null }
export type Offer = 'first' | 'new' | 'none'
export type Role = 'learn' | 'teach' | 'research'

export const ONBOARDING_KEY = 'velophi.onboarding.v1'
/** The last version before the record existed (its welcome page set `settings.ui.welcomed`). */
export const LEGACY_VERSION = '26.63'

export function emptyRecord(): OnboardingRecord {
  return { seenVersion: null, segments: { welcome: { step: 0, done: false }, motion: { step: 0, done: false }, physics: { step: 0, done: false }, chem: { step: 0, done: false }, library: { step: 0, done: false } }, dismissedAt: null }
}

/** '26.64.0' → '26.64': the first two parts decide whether a version is "another version" (D248). */
export function minorOf(version: string | null | undefined): string {
  const m = /^(\d+)\.(\d+)/.exec(version ?? '')
  return m ? `${m[1]}.${m[2]}` : ''
}

/** A stored record, repaired: unknown fields dropped, wrong types replaced; junk gives the empty record. */
export function parseRecord(raw: string | null | undefined): OnboardingRecord {
  const r = emptyRecord()
  if (!raw) return r
  let d: unknown
  try { d = JSON.parse(raw) } catch { return r }
  if (!d || typeof d !== 'object') return r
  const o = d as Record<string, unknown>
  if (typeof o.seenVersion === 'string' && minorOf(o.seenVersion)) r.seenVersion = o.seenVersion
  if (typeof o.dismissedAt === 'string') r.dismissedAt = o.dismissedAt
  const segs = (o.segments && typeof o.segments === 'object' ? o.segments : {}) as Record<string, unknown>
  for (const id of SEGMENTS) {
    const s = segs[id] as Partial<SegmentRecord> | undefined
    if (!s || typeof s !== 'object') continue
    r.segments[id] = { step: Number.isInteger(s.step) && (s.step as number) >= 0 ? (s.step as number) : 0, done: s.done === true }
  }
  return r
}

export interface Situation {
  /** The version running (`ENGINE_VERSION`). */
  version: string
  /** `settings.ui.welcomed`: the welcome page of 26.58–26.63 was closed on this device. */
  welcomedBefore: boolean
  /** Versions that define a list of changes (keys of WHATS_NEW, as 'major.minor'). */
  versionsWithNews: string[]
  /** Opened from a share link, in classroom projection, or under the automatic tests. */
  quiet: boolean
}

/** The version this device last saw, counting the welcome flag of 26.63 and earlier. */
export function seenVersionOf(rec: OnboardingRecord, welcomedBefore: boolean): string | null {
  return rec.seenVersion ?? (welcomedBefore ? LEGACY_VERSION : null)
}

/** What to offer (D248). */
export function offer(rec: OnboardingRecord, s: Situation): Offer {
  if (s.quiet) return 'none'
  const seen = seenVersionOf(rec, s.welcomedBefore)
  if (!seen) return rec.dismissedAt ? 'none' : 'first'
  if (minorOf(seen) !== minorOf(s.version) && s.versionsWithNews.includes(minorOf(s.version))) return 'new'
  return 'none'
}

/** The segment to go on with: the first that is not finished, or null when all five are. */
export function nextSegment(rec: OnboardingRecord): SegmentId | null {
  return SEGMENTS.find(id => !rec.segments[id].done) ?? null
}

/** A step was reached (kept for resuming) — never moves a finished segment back. */
export function withStep(rec: OnboardingRecord, id: SegmentId, step: number): OnboardingRecord {
  const cur = rec.segments[id]
  if (cur.done) return rec
  return { ...rec, segments: { ...rec.segments, [id]: { step: Math.max(0, step), done: false } } }
}
export function withDone(rec: OnboardingRecord, id: SegmentId): OnboardingRecord {
  return { ...rec, segments: { ...rec.segments, [id]: { step: 0, done: true } } }
}
/** Start a segment again from its first step (Help › 入门). */
export function withRestart(rec: OnboardingRecord, id: SegmentId): OnboardingRecord {
  return { ...rec, segments: { ...rec.segments, [id]: { step: 0, done: false } } }
}
export function withSeen(rec: OnboardingRecord, version: string, dismissed?: string): OnboardingRecord {
  return { ...rec, seenVersion: minorOf(version) || rec.seenVersion, dismissedAt: dismissed ?? rec.dismissedAt }
}

// ---- the record of this device ----

function storage(): Storage | null { try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null } }

/** The record in use (reactive: the home page and the Help menu show it). */
export const onboarding = reactive<{ record: OnboardingRecord; loaded: boolean }>({ record: emptyRecord(), loaded: false })

export function loadOnboarding(): OnboardingRecord {
  onboarding.record = parseRecord(storage()?.getItem(ONBOARDING_KEY))
  onboarding.loaded = true
  return onboarding.record
}
export function saveOnboarding(rec: OnboardingRecord) {
  onboarding.record = rec
  try { storage()?.setItem(ONBOARDING_KEY, JSON.stringify(rec)) } catch { /* the walkthrough works without storage */ }
}

/** What "你主要用它来……" decides (segment 0; every one of them can be changed in the settings afterwards). */
export function roleDefaults(role: Role): { startPage: 'home' | 'studio'; formulaDensity: 'compact' | 'detailed'; moreGroup: 'view' | 'teach' | 'compute' } {
  if (role === 'teach') return { startPage: 'home', formulaDensity: 'compact', moreGroup: 'teach' }
  // 26.65: the role no longer changes the start page — every start opens the home page
  if (role === 'research') return { startPage: 'home', formulaDensity: 'detailed', moreGroup: 'compute' }
  return { startPage: 'home', formulaDensity: 'compact', moreGroup: 'view' }
}
