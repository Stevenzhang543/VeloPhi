/**
 * Screen turns in the Android app (26.60 r2). MainActivity calls `window.__velophiRotate()` when the orientation
 * changes, before the WebView is resized. The MuMu emulator's system WebView crashed its renderer (SIGSEGV in the
 * renderer's main thread) while relaying the interface out from the old size to the new one, every time the screen
 * turned; pages without the interface, and the interface laid out from scratch at either size, did not crash. So the
 * interface is taken out of layout for the turn and laid out again once the size has stopped changing (about half a
 * second later). Desktop, web and the diagnosis switch "norotguard" leave this off.
 */
import { isAndroidApp } from '../platform/device'

/** Show the interface this long after the last resize of a turn (ms). */
const SETTLE_MS = 280
/** …but never later than this after the turn began (ms). */
const MAX_MS = 1600

export function initRotateGuard() {
  if (!isAndroidApp() || (window as unknown as { __velophiCompat?: string }).__velophiCompat?.split(',').includes('norotguard')) return
  const root = document.getElementById('app')
  if (!root) return
  let settle = 0, cap = 0, hidden = false
  const show = () => {
    if (!hidden) return
    hidden = false
    window.clearTimeout(settle); window.clearTimeout(cap)
    window.removeEventListener('resize', onResize)
    root.style.removeProperty('display')
  }
  const onResize = () => { window.clearTimeout(settle); settle = window.setTimeout(show, SETTLE_MS) }
  ;(window as unknown as { __velophiRotate?: () => void }).__velophiRotate = () => {
    if (!hidden) {
      hidden = true
      root.style.setProperty('display', 'none')
      window.addEventListener('resize', onResize)
      cap = window.setTimeout(show, MAX_MS)
    }
    onResize()
  }
}
