/**
 * Recovery after the Android WebView's renderer died (26.59 fix 3, D192). Some system WebViews (Chromium 110 on
 * several phones and the MuMu emulator) crash their renderer while the screen turns; MainActivity then restarts
 * VeloΦ instead of letting the WebView take the app down, and marks the new page (`window.__velophiRecovered`).
 * While running on Android the open scene is kept in local storage (every few seconds when it changed), so the
 * restarted app reopens it where the user left it. Desktop and web builds do nothing here.
 *
 * 26.60 r2: the reason of the restart is told apart (the renderer crashed, or the system reclaimed it while the app was
 * in the background); after repeated restarts MainActivity opens the page in safe mode (`window.__velophiSafe`: no
 * glass or effects, and the scene is offered instead of reopened — it may be what crashed); when the last session
 * ended abnormally without a restart (an uncaught exception, or the system ended the app) the scene is offered too.
 * No snapshot is written during playback (the scene does not change, the frame budget matters).
 */
import { loadScene, showToast, state } from './store'
import { parseScene, serializeScene } from '../core/scene/io'
import { tl } from '../i18n'
import { canLockOrientation, currentOrientation, lastIssue, orientationMode, setOrientationMode } from './androidBridge'
import { isAndroidApp } from '../platform/device'
import { logEvent } from './trialLog'

const KEY = 'velophi.recover.v1'
/** A snapshot older than this is not offered again (ms). */
const MAX_AGE = 2 * 3600 * 1000

interface Snapshot { at: number; scene: string; name: string | null; dirty: boolean }

/** Running in the Android app (Tauri on Android). */
export function onAndroidApp(): boolean { return isAndroidApp() }

function read(): Snapshot | null {
  try {
    const raw = localStorage.getItem(KEY)
    const s = raw ? (JSON.parse(raw) as Snapshot) : null
    return s && typeof s.scene === 'string' && typeof s.at === 'number' ? s : null
  } catch { return null }
}

let last = ''
let timer: ReturnType<typeof setInterval> | null = null
function save() {
  if (state.playing) return
  try {
    const text = serializeScene(state.scene)
    if (text === last) return
    last = text
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), scene: text, name: state.fileName, dirty: state.dirty } satisfies Snapshot))
  } catch { /* storage full or unavailable: nothing to restore later */ }
}

function restore(snap: Snapshot): boolean {
  try {
    loadScene(parseScene(snap.scene).scene, snap.name)
    state.dirty = snap.dirty
    return true
  } catch { return false }
}

/** Reopen (or offer) the scene after a restart, then keep snapshots while the app runs on Android. */
export function initRecovery() {
  if (!onAndroidApp()) return
  const w = window as unknown as { __velophiRecovered?: boolean; __velophiRecoverReason?: string; __velophiSafe?: boolean }
  const recovered = w.__velophiRecovered === true
  const safe = w.__velophiSafe === true
  const issue = lastIssue()
  if (issue) logEvent('android.issue', { kind: issue.kind, detail: issue.detail.slice(0, 300), recovered, safe })
  const snap = read()
  const fresh = !!snap && Date.now() - snap.at < MAX_AGE
  const offer = (text: string) => showToast(text, false, { label: tl('恢复刚才的场景'), run: () => { if (snap && restore(snap)) showToast(tl('已恢复')) } })
  if (recovered && fresh && !safe && restore(snap!)) {
    if (w.__velophiRecoverReason === 'killed') showToast(tl('系统回收了网页组件的内存，VeloΦ 已重新打开并恢复了刚才的场景'))
    else {
      // 26.59 fix 3 (D199): the turn that crashed it can be avoided by locking the orientation
      const lock = canLockOrientation() && orientationMode() === 'auto'
      showToast(tl('系统的网页组件意外退出（旧版 WebView 常在旋转屏幕时出错），VeloΦ 已自动重新打开并恢复了刚才的场景'), false, lock ? {
        label: tl('锁定屏幕方向'),
        run: () => { if (setOrientationMode(currentOrientation())) showToast(tl('已锁定为当前方向；可在“设置 › 通用”中改回自动旋转')) }
      } : undefined)
    }
  } else if (safe) {
    if (fresh) offer(tl('VeloΦ 多次意外重启，已用安全模式打开（关闭了界面特效）；刚才的场景没有自动打开'))
    else showToast(tl('VeloΦ 多次意外重启，已用安全模式打开（关闭了界面特效）'))
  } else if (issue && fresh && !recovered) {
    offer(tl('VeloΦ 上次意外退出'))
  }
  last = ''
  // 26.63 (D239): one timer however often this runs (a second call used to leave the first interval running)
  if (timer !== null) clearInterval(timer)
  timer = setInterval(save, 4000)
  // Turning the screen and leaving the app are the moments that matter most
  window.addEventListener('orientationchange', save)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save() })
}
