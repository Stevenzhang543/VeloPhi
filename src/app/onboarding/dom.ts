/**
 * What the walkthrough reads from the page itself (26.64, D249). Most steps wait on the application state; a few things
 * the state does not hold — which panel is on screen, whether the user turned a 3-D view — are read from the document:
 * `shown(selector)` and the last drag gesture the engine recorded.
 */

/** The first element matching the selector that is laid out on screen, or null. */
export function shown(selector: string): HTMLElement | null {
  if (typeof document === 'undefined' || !selector) return null
  let list: NodeListOf<HTMLElement>
  try { list = document.querySelectorAll<HTMLElement>(selector) } catch { return null }
  for (const el of list) {
    if (el.closest('[inert]')) continue
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

/** The gestures of the current step (the engine fills it from pointer events and clears it when a step begins). */
export const gestures: { drags: Element[]; clicks: Element[] } = { drags: [], clicks: [] }

/** The user dragged (pressed, moved more than 8 px, released) inside an element matching the selector in this step. */
export function dragged(selector: string): boolean { return gestures.drags.some(el => !!el.closest?.(selector)) }
/** The user clicked inside an element matching the selector in this step. */
export function clicked(selector: string): boolean { return gestures.clicks.some(el => !!el.closest?.(selector)) }

let down: { x: number; y: number; target: Element } | null = null
function onDown(e: PointerEvent) { down = e.target instanceof Element ? { x: e.clientX, y: e.clientY, target: e.target } : null }
function onUp(e: PointerEvent) {
  if (!down) return
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
  ;(moved > 8 ? gestures.drags : gestures.clicks).push(down.target)
  down = null
}
export function watchGestures(on: boolean) {
  if (typeof window === 'undefined') return
  window.removeEventListener('pointerdown', onDown, true)
  window.removeEventListener('pointerup', onUp, true)
  if (on) { window.addEventListener('pointerdown', onDown, true); window.addEventListener('pointerup', onUp, true) }
}
export function clearGestures() { gestures.drags = []; gestures.clicks = [] }
