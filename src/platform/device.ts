/**
 * Device traits that change how VeloΦ uses resources (26.60 r2): the Android app and Android browsers draw with the
 * system's own fonts (Noto Sans CJK on Android — the bundled variable fonts cost memory and start-up time, and the
 * MuMu WebView's renderer crashed while turning the screen with them), touch-first devices draw the canvas at most at
 * twice the CSS pixel size, and phones keep a smaller recording in memory.
 */

const ua = () => (typeof navigator !== 'undefined' ? navigator.userAgent : '')

/** Running on Android (the app or a browser). */
export function isAndroid(): boolean { return /Android/i.test(ua()) }

/** Running in the Android app (Tauri on Android). */
export function isAndroidApp(): boolean { return isAndroid() && typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window }

/** A touch-first device (phone or tablet): its primary pointer is coarse. */
export function coarsePointer(): boolean {
  try { return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches } catch { return false }
}

/**
 * Pixel ratio of drawing canvases: the screen's, but at most 2 on touch-first devices (a 3× phone screen has 2.25 times
 * the pixels of 2× for no visible gain, and every frame fills them).
 */
export function canvasDpr(): number {
  const d = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
  return coarsePointer() ? Math.min(d, 2) : d
}

/** Memory budget of a recording on this device by default (MB). */
export function defaultMemoryMB(): number { return isAndroid() ? 192 : 512 }
