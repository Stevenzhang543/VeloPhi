/**
 * Recovery after the Android WebView's renderer died (26.59 fix 3, D192). Some system WebViews (Chromium 110 on
 * several phones and the MuMu emulator) crash their renderer while the screen turns; MainActivity then restarts
 * VeloΦ instead of letting the WebView take the app down, and marks the new page (`window.__velophiRecovered`).
 * While running on Android the open scene is kept in local storage (every few seconds when it changed), so the
 * restarted app reopens it where the user left it. Desktop and web builds do nothing here.
 */
import { loadScene, showToast, state } from './store'
import { parseScene, serializeScene } from '../core/scene/io'
import { tl } from '../i18n'
import { canLockOrientation, currentOrientation, orientationMode, setOrientationMode } from './androidBridge'

const KEY = 'velophi.recover.v1'
/** A snapshot older than this is not offered again (ms). */
const MAX_AGE = 2 * 3600 * 1000

interface Snapshot { at: number; scene: string; name: string | null; dirty: boolean }

/** Running in the Android app (Tauri on Android). */
export function onAndroidApp(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) && typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function read(): Snapshot | null {
  try {
    const raw = localStorage.getItem(KEY)
    const s = raw ? (JSON.parse(raw) as Snapshot) : null
    return s && typeof s.scene === 'string' && typeof s.at === 'number' ? s : null
  } catch { return null }
}

let last = ''
function save() {
  try {
    const text = serializeScene(state.scene)
    if (text === last) return
    last = text
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), scene: text, name: state.fileName, dirty: state.dirty } satisfies Snapshot))
  } catch { /* storage full or unavailable: nothing to restore later */ }
}

/** Reopen the scene after a recovery restart, then keep snapshots while the app runs on Android. */
export function initRecovery() {
  if (!onAndroidApp()) return
  const recovered = (window as unknown as { __velophiRecovered?: boolean }).__velophiRecovered === true
  const snap = read()
  if (recovered && snap && Date.now() - snap.at < MAX_AGE) {
    try {
      loadScene(parseScene(snap.scene).scene, snap.name)
      state.dirty = snap.dirty
      // 26.59 fix 3 (D199): the turn that crashed it can be avoided by locking the orientation
      const lock = canLockOrientation() && orientationMode() === 'auto'
      showToast(tl('系统的网页组件在旋转屏幕时出错，VeloΦ 已自动重新打开并恢复了刚才的场景'), false, lock ? {
        label: tl('锁定屏幕方向'),
        run: () => { if (setOrientationMode(currentOrientation())) showToast(tl('已锁定为当前方向；可在“设置 › 通用”中改回自动旋转')) }
      } : undefined)
    } catch { /* an unreadable snapshot: start as usual */ }
  }
  last = ''
  setInterval(save, 3000)
  // Turning the screen and leaving the app are the moments that matter most
  window.addEventListener('orientationchange', save)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save() })
}
