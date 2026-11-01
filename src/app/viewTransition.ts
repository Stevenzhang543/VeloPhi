/**
 * The circular reveal for rare, large switches (26.57, D124; manual §7.6, S14/S16): a work mode, the theme. The new
 * view grows as a circle from where it was asked for (the pointer, or a fixed anchor for the keyboard) over the
 * radius that reaches the farthest corner, in about 320 ms. The state changes at once — the transition only shows
 * it — so an interrupted or skipped animation still ends in the same place. Without the View Transition API, with
 * reduced motion (system or app setting) or with the window hidden, the switch is immediate.
 */
import { nextTick } from 'vue'
import { settings, sysEnv } from './settings'

type VT = { ready: Promise<void>; finished: Promise<void>; skipTransition?: () => void }
type DocVT = Document & { startViewTransition?: (cb: () => Promise<void> | void) => VT }

/** Whether a large transition may play now. */
export function transitionsAllowed(): boolean {
  const d = typeof document !== 'undefined' ? (document as DocVT) : null
  if (!d || typeof d.startViewTransition !== 'function') return false
  if (sysEnv.hidden) return false
  if (!settings.ui.motion) return false
  if (settings.effects.respectReducedMotion && sysEnv.reducedMotion) return false
  return true
}

/** Radius from (x, y) to the farthest corner of a w × h viewport. */
export function coverRadius(x: number, y: number, w: number, h: number): number {
  return Math.hypot(Math.max(x, w - x), Math.max(y, h - y))
}

let running: VT | null = null

/** Run `update` (synchronously applied state) behind a circular reveal when allowed. */
export async function circularTransition(update: () => void, origin?: { x: number; y: number }): Promise<void> {
  if (!transitionsAllowed()) { update(); return }
  // a new switch while one plays: finish the old one at once (no queue of animations)
  running?.skipTransition?.()
  const w = window.innerWidth, h = window.innerHeight
  const x = origin?.x ?? w / 2, y = origin?.y ?? 64
  const r = coverRadius(x, y, w, h)
  let applied = false
  try {
    const vt = (document as DocVT).startViewTransition!(async () => { applied = true; update(); await nextTick() })
    running = vt
    await vt.ready
    document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', pseudoElement: '::view-transition-new(root)' })
    await vt.finished
  } catch {
    // the API refused (another transition, a hidden document): apply the state now if it was not applied yet
    if (!applied) update()
  } finally {
    running = null
  }
}
