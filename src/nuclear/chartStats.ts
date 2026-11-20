/**
 * Cost of the frames of the chart of nuclides (26.64, D276; budget 4 ms a frame while panning): the component records
 * the time of every `drawChart`; the interface regressions read it through `__velophiTest.nuclides.stats`.
 */
export const chartStats = {
  frames: 0, last: 0, max: 0, sum: 0, labelled: 0, times: [] as number[],
  record(ms: number, labelled: number) {
    this.frames++; this.last = ms; this.sum += ms; this.labelled = labelled
    if (ms > this.max) this.max = ms
    this.times.push(ms)
    if (this.times.length > 2000) this.times.shift()
  },
  reset() { this.frames = 0; this.last = 0; this.max = 0; this.sum = 0; this.labelled = 0; this.times = [] },
  summary() {
    const sorted = [...this.times].sort((a, b) => a - b)
    const q = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] : 0)
    return { frames: this.frames, mean: this.frames ? this.sum / this.frames : 0, p95: q(0.95), max: this.max, labelled: this.labelled }
  }
}
