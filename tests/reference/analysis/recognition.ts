/**
 * Incremental formula recognition while a recording grows (decision D26). Recognising the whole recording on
 * every update would rescan an ever longer run; instead each update recognises only a window of segments:
 *
 *   - a situation whose time span ends before the open (last) segment starts is complete — its run of segments
 *     can no longer grow — and is kept as it is from then on;
 *   - the others are open: recognised again at the next update, from a window that starts at the earliest open
 *     situation (or at the open segment), so the open last phase always covers the whole run so far;
 *   - the whole-run situations (energy ledger, momentum) are recognised on the full recording, which only walks
 *     segments and events, never frames.
 *
 * A complete situation is taken from the pass in which it first appears as complete, and only when it ends at or
 * after the previous pass's frontier: one that ended earlier was already taken (or lies before the window). For a
 * finished recording the caller runs `recognize` once on the whole of it, which gives exactly the 26.49 result.
 */
import type { Recording } from '../core/solver/simulation'
import type { FrameStore } from '../core/record/frames'
import type { Situation } from '../formula/situations'
import { recognizeConservation, recognizePhases } from '../formula/situations'

/** A view of a recording that starts at segment s0 (segment indices of frames shifted to match). */
function windowView(rec: Recording, s0: number): Recording {
  if (s0 === 0) return rec
  const t0 = rec.segments[s0].t0
  let lo = 0, hi = rec.events.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (rec.events[mid].t < t0 - 1e-12) lo = mid + 1; else hi = mid }
  const base = rec.frames
  const frames: FrameStore = {
    state: k => base.state(k),
    segment: k => base.segment(k) - s0,
    impactLoss: k => base.impactLoss(k),
    cheap: k => (base.cheap ? base.cheap(k) : true)
  }
  return { ...rec, segments: rec.segments.slice(s0), events: rec.events.slice(lo), frames }
}

/** Recognises the situations of one growing recording (one run); see the module header. */
export class IncrementalRecognizer {
  private readonly done: Situation[] = []
  private readonly doneKeys = new Set<string>()
  private open: Situation[] = []
  private whole: Situation[] = []
  /** First segment of the next window. */
  private windowSeg = 0
  /** Start of the open segment at the previous pass. */
  private frontier = -Infinity
  private seen = { frames: -1, segments: -1, events: -1 }
  /** Passes run so far (diagnostics, tests). */
  passes = 0

  /** The situations of a (partial) recording of the run; only the open window is recognised again. */
  update(rec: Recording): Situation[] {
    const segs = rec.segments
    if (!segs.length) return []
    if (rec.frameCount === this.seen.frames && segs.length === this.seen.segments && rec.events.length === this.seen.events) return this.current()
    this.seen = { frames: rec.frameCount, segments: segs.length, events: rec.events.length }
    this.passes++
    const s0 = Math.min(this.windowSeg, segs.length - 1)
    const F = segs[segs.length - 1].t0
    const open: Situation[] = []
    for (const sit of recognizePhases(windowView(rec, s0))) {
      if (sit.t1 >= F - 1e-12) { open.push(sit); continue }
      if (sit.t1 >= this.frontier - 1e-12 && !this.doneKeys.has(sit.key)) { this.done.push(sit); this.doneKeys.add(sit.key) }
    }
    this.open = open
    let tStart = F
    for (const o of open) tStart = Math.min(tStart, o.t0)
    let i = s0
    while (i < segs.length - 1 && segs[i].t0 < tStart - 1e-12) i++
    this.windowSeg = i
    this.frontier = F
    this.whole = recognizeConservation(rec)
    return this.current()
  }

  private current(): Situation[] { return [...this.done, ...this.open, ...this.whole] }
}
