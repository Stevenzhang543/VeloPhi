/**
 * The Android app's own bridge (26.59 fix 3, D199): MainActivity adds `window.VeloPhiAndroid` to the WebView. It
 * locks the screen orientation — some system WebViews crash their renderer while the screen turns (D192), and a
 * locked orientation avoids the turn altogether. The choice is kept by the app itself (it applies before the page
 * loads). Desktop and web builds have no bridge.
 */
export type Orientation = 'auto' | 'portrait' | 'landscape'

interface Bridge { setOrientation(mode: string): void; orientation(): string }

function bridge(): Bridge | null {
  const b = (typeof window !== 'undefined' ? (window as unknown as { VeloPhiAndroid?: Bridge }).VeloPhiAndroid : undefined) ?? null
  return b && typeof b.setOrientation === 'function' ? b : null
}

/** Whether the orientation can be locked (the Android app). */
export function canLockOrientation(): boolean { return bridge() !== null }

/** The orientation the Android app keeps ('auto' when there is no bridge). */
export function orientationMode(): Orientation {
  try { const m = bridge()?.orientation(); return m === 'portrait' || m === 'landscape' ? m : 'auto' } catch { return 'auto' }
}

/** Lock the orientation (or follow the device again with 'auto'); false without a bridge. */
export function setOrientationMode(mode: Orientation): boolean {
  const b = bridge()
  if (!b) return false
  try { b.setOrientation(mode); return true } catch { return false }
}

/** The orientation the screen has now. */
export function currentOrientation(): 'portrait' | 'landscape' {
  return typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
}
