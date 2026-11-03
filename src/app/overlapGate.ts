/**
 * The overlap check before every run (26.59 fix 3, D200): when bodies overlap at the start, the run waits and a
 * dialog asks whether to push them apart along the shortest way (one undoable edit, then the run starts) or to
 * cancel and let the user move them (nothing is computed until the scene changes again). Overlaps too deep to push
 * apart automatically can only be moved by hand.
 */
import { reactive } from 'vue'
import type { Scene } from '../core/scene/types'
import type { OverlapReport } from '../engine/overlaps'

export type OverlapChoice = 'push' | 'cancel'

/** The dialog's state (OverlapDialog.vue); `answer` settles the question. */
export const overlapPrompt = reactive({
  open: false,
  /** "物块1 与 地面：3.2 cm" … */
  lines: [] as string[],
  /** Pairs that the push apart cannot resolve (too deep). */
  stuck: [] as string[],
  canPush: false,
  answer: null as ((c: OverlapChoice) => void) | null
})

const nameOf = (scene: Scene, id: string) => scene.bodies.find(b => b.id === id)?.name || id

/** Overlap depth for reading: mm below 1 cm, else cm. */
export function depthText(d: number): string {
  return d < 0.01 ? `${(d * 1000).toPrecision(2)} mm` : `${(d * 100).toPrecision(3)} cm`
}

/** One line of the dialog from the two names and the depth ("{0} 与 {1}：{2}" in the interface language). */
export type OverlapLine = (a: string, b: string, depth: string) => string

/** Describe the report for the dialog. */
export function describeOverlaps(scene: Scene, r: OverlapReport, format: OverlapLine) {
  const line = (p: { a: string; b: string; depth: number }) => format(nameOf(scene, p.a), nameOf(scene, p.b), depthText(p.depth))
  return { lines: r.pairs.slice(0, 8).map(line), stuck: r.remaining.slice(0, 8).map(line), canPush: r.moved.length > 0 && r.remaining.length === 0 }
}

/** Ask (one question at a time; a second request while open gets 'cancel'). */
export function askOverlap(scene: Scene, r: OverlapReport, format: OverlapLine): Promise<OverlapChoice> {
  if (overlapPrompt.open) return Promise.resolve('cancel')
  const d = describeOverlaps(scene, r, format)
  return new Promise(resolve => {
    Object.assign(overlapPrompt, d, {
      open: true,
      answer: (c: OverlapChoice) => { overlapPrompt.open = false; overlapPrompt.answer = null; resolve(c) }
    })
  })
}
