/**
 * Cost of the decorations (26.64, D257: under 1 ms a frame). The drawing components add the time of each frame here;
 * the interface regressions read it through the test hook (uitest.ts) and fail when the budget is exceeded.
 */
export const decorStats = { frames: 0, lastMs: 0, maxMs: 0, totalMs: 0 }

/** Mean time of a decoration frame so far (ms); 0 before the first frame. */
export function decorMeanMs(): number { return decorStats.frames ? decorStats.totalMs / decorStats.frames : 0 }
