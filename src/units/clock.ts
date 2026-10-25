/**
 * Origin of the displayed time (26.51, D52): a branch is computed on its own clock from 0 and shown from the
 * moment it branched off, so every time shown to the user is `clock.origin + t`. The application sets the origin
 * to the start time of the scene on screen; exports of a recording use its scene's start time.
 */
export const clock = { origin: 0 }

/** A recording-clock time as shown (s). */
export function shownTime(t: number): number { return clock.origin + t }
