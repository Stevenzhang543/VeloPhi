/**
 * In-app update (26.64; Linux 26.65): the state the notice and the settings show, and the steps between them. The
 * Windows desktop app, the Android app and the Linux packages only — on the web build `updatePlatform.supported` is
 * false and nothing here does anything.
 *
 *   idle ─ check ─▶ checking ─▶ available ─ 更新 ─▶ downloading ─▶ verifying ─▶ ready ─▶ installing
 *                      │  └▶ uptodate / failed (shown only when the user asked)      │            └▶ manual
 *                      └▶ idle (nothing new, a skipped version, or a silent failure) └▶ error (with the reason)
 *
 * One check per start, a few seconds after the interface is up, when the setting allows it; never in the release
 * self-check or the interface tests. One click on 更新 downloads, verifies and goes on to the installation: the
 * installer or Android's own prompt at once; the portable build and the AppImage after saying where the new file is;
 * a Linux deb or rpm after saying that the system will ask for the administrator's authorisation. When the system's
 * package tool does not install it (`manual`), the notice shows where the verified file is and the command to type.
 * Before the app closes for an installation the question of closing a window with unsaved changes is asked, with the
 * same words.
 *
 * Release notes are remote text: `notesPreview` turns them into a few plain lines; nothing renders them as HTML.
 */
import { reactive } from 'vue'
import { tl } from '../i18n'
import { state } from './store'
import { settings } from './settings'
import { toUpdateError, updatePlatform } from '../platform/update'
import type { UpdateDownloaded, UpdateErrorCode, UpdateInfo, UpdateKind, UpdateManual } from '../platform/update'

export type UpdatePhase = 'idle' | 'checking' | 'uptodate' | 'failed' | 'available' | 'downloading' | 'verifying' | 'ready' | 'installing' | 'manual' | 'error'

export const update = reactive({
  phase: 'idle' as UpdatePhase,
  /** The check running or last finished was asked for by the user: its outcome is shown whatever it is. */
  manual: false,
  info: null as UpdateInfo | null,
  received: 0,
  total: 0,
  downloaded: null as UpdateDownloaded | null,
  /** Linux deb/rpm: the package tool did not install the verified file; how to do it by hand. */
  manualInstall: null as UpdateManual | null,
  error: null as { code: UpdateErrorCode; detail: string } | null,
  /** 稍后: the notice stays away until the next start or the next check by hand. */
  hidden: false
})

/** Answers of an operation that was superseded (cancelled, restarted) are dropped. */
let seq = 0
let scheduled = false

/** The release self-check and the interface tests never check for updates. */
function testRun(): boolean {
  return typeof location !== 'undefined' && /[?&](selftest|uitest)\b/.test(location.search ?? '')
}

/** Whether the notice has something to show. */
export function noticeVisible(): boolean {
  if (update.hidden || update.phase === 'idle') return false
  if (update.phase === 'checking' || update.phase === 'uptodate' || update.phase === 'failed') return update.manual
  return true
}

/** Whether this build can download and install the offered release itself (else: the release page). */
export function canInstall(info: UpdateInfo | null): info is UpdateInfo & { asset: { name: string; size: number } } {
  return !!info && info.newer && info.kind !== 'other' && !!info.asset && info.sums
}

/** A new file put next to the old one, which the user starts (the portable build, the AppImage). */
export function beside(kind: UpdateKind | undefined): boolean {
  return kind === 'portable' || kind === 'appimage'
}

/** Installed by the system's package tool after the administrator's authorisation (Linux deb, rpm). */
export function viaPackageTool(kind: UpdateKind | undefined): boolean {
  return kind === 'deb' || kind === 'rpm'
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(toUpdateError('timeout')), ms)
    p.then(v => { clearTimeout(timer); resolve(v) }, e => { clearTimeout(timer); reject(e) })
  })
}

/**
 * Ask for the latest release. At start (`manual` false) the outcome is shown only when there is a newer version the
 * user has not skipped; a failure is silent. Asked for by the user, every outcome is shown.
 */
export async function checkForUpdates(manual = false): Promise<void> {
  if (!updatePlatform.supported || testRun()) return
  const p = update.phase
  // Nothing is interrupted, and a downloaded update is not thrown away: show it again
  if (p === 'checking' || p === 'downloading' || p === 'verifying' || p === 'ready' || p === 'installing' || p === 'manual') { if (manual) update.hidden = false; return }
  const mine = ++seq
  update.manual = manual
  update.error = null
  update.phase = 'checking'
  if (manual) update.hidden = false
  let info: UpdateInfo
  try {
    // The Rust side gives up after 8 s; this only makes sure the state never stays at "checking"
    info = await withTimeout(updatePlatform.check(), 15000)
  } catch (e) {
    if (mine !== seq) return
    const err = toUpdateError(e)
    update.error = manual ? { code: err.code, detail: err.detail } : null
    update.phase = manual ? 'failed' : 'idle'
    return
  }
  if (mine !== seq) return
  settings.update.lastCheck = Date.now()
  settings.update.lastLatest = info.latest
  // The Rust side decides what is newer; an offer is taken up only when the versions it names say the same
  // (never a downgrade, whatever the answer claims)
  info = { ...info, newer: info.newer && (compareVersions(info.latest, info.current) ?? 0) > 0 }
  update.info = info
  if (!info.newer) { update.phase = manual ? 'uptodate' : 'idle'; return }
  if (!manual && compareVersions(settings.update.skipped, info.latest) === 0) { update.phase = 'idle'; return }
  update.hidden = false
  update.phase = 'available'
}

/** "26.64", "26.64.1" or "v26.64.1" as numbers (a missing patch is 0); null for anything else. */
export function parseVersion(text: string): [number, number, number] | null {
  const m = /^v?(\d{1,5})\.(\d{1,5})(?:\.(\d{1,5}))?$/.exec(text ?? '')
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null
}

/** Negative, zero or positive as version `a` is older than, the same as or newer than `b`; null when either is no version. */
export function compareVersions(a: string, b: string): number | null {
  const x = parseVersion(a), y = parseVersion(b)
  if (!x || !y) return null
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
}

/** 更新: download and verify, then go on to the installation. */
export async function startUpdate(): Promise<void> {
  if (!updatePlatform.supported || (update.phase !== 'available' && update.phase !== 'error')) return
  const info = update.info
  if (!canInstall(info)) return
  const mine = ++seq
  update.error = null
  update.downloaded = null
  update.received = 0
  update.total = info.asset.size
  update.hidden = false
  update.phase = 'downloading'
  let done: UpdateDownloaded
  try {
    done = await updatePlatform.download(info.tag, pr => {
      if (mine !== seq) return
      update.received = pr.received
      update.total = pr.total
      if (pr.phase === 'verifying' && update.phase === 'downloading') update.phase = 'verifying'
    })
  } catch (e) {
    if (mine !== seq) return
    const err = toUpdateError(e)
    if (err.code === 'cancelled') { update.phase = 'available'; return }
    update.error = { code: err.code, detail: err.detail }
    update.phase = 'error'
    return
  }
  if (mine !== seq) return
  update.downloaded = done
  update.manualInstall = null
  update.phase = 'ready'
  // The portable build and the AppImage first say where the new file is and that the old one can be deleted
  // afterwards; a deb or rpm first says that the system will ask for the administrator's authorisation
  if (!beside(done.kind) && !viaPackageTool(done.kind)) await installUpdate()
}

/** 取消 while downloading: back to the offer; the partial file is deleted by the Rust side. */
export async function cancelUpdate(): Promise<void> {
  if (update.phase !== 'downloading' && update.phase !== 'verifying') return
  seq++
  update.phase = 'available'
  try { await updatePlatform.cancel() } catch { /* Nothing was running */ }
}

/** The question of closing a window with unsaved changes (App.vue asks it with the same words). */
async function confirmLeave(): Promise<boolean> {
  if (!state.dirty) return true
  const { ask } = await import('@tauri-apps/plugin-dialog')
  return ask(tl('当前场景有未保存的修改，确定退出吗？'), { title: 'VeloPhi', kind: 'warning', okLabel: tl('退出'), cancelLabel: tl('取消') })
}

/**
 * Start the verified file: the installer, the new executable or AppImage, or the system's package tool (this app then
 * closes), or Android's install prompt. Unsaved changes are asked about first; answering "cancel" keeps the downloaded
 * update for later. A deb or rpm the package tool did not install ends in `manual` (and can be tried again from there).
 */
export async function installUpdate(): Promise<void> {
  if (!updatePlatform.supported || (update.phase !== 'ready' && update.phase !== 'manual')) return
  if (!(await confirmLeave())) return
  if (update.phase !== 'ready' && update.phase !== 'manual') return
  const mine = ++seq
  const kind = update.downloaded?.kind
  update.manualInstall = null
  update.phase = 'installing'
  let manual: UpdateManual | null | void
  try {
    manual = await updatePlatform.install()
  } catch (e) {
    if (mine !== seq) return
    const err = toUpdateError(e)
    update.error = { code: err.code, detail: err.detail }
    update.downloaded = null
    update.manualInstall = null
    update.phase = 'error'
    // Android could not open its installer: the release page in the browser instead
    if (err.code === 'handover') void openReleasePage()
    return
  }
  if (mine !== seq) return
  // Linux: the package tool did not install it — the verified file and the command to type
  if (manual && viaPackageTool(kind)) {
    update.manualInstall = manual
    update.hidden = false
    update.phase = 'manual'
    return
  }
  // Windows and Linux: the app is closing. Android: the system's prompt is in front and the file stays for another try
  if (kind === 'android') update.phase = 'ready'
}

/** Linux: the folder of the update to be installed by hand, in the file manager. */
export async function showUpdateFile(): Promise<void> {
  if (!updatePlatform.supported || update.phase !== 'manual') return
  try { await updatePlatform.showFile() } catch { /* No file manager: the path is shown in the notice */ }
}

/** Why the package tool did not install the update, for the user. */
export function manualReasonText(m: UpdateManual): string {
  switch (m.reason) {
    case 'cancelled': return tl('系统授权被取消，没有安装。')
    case 'no-agent': return tl('无法请求系统授权（没有 pkexec 或授权代理）。')
    case 'no-tool': return tl('没有找到系统的软件包工具。')
    default: return typeof m.code === 'number' ? tl('系统的软件包工具报告了错误（退出码 {0}）。', [m.code]) : tl('系统的软件包工具报告了错误。')
  }
}

/** 稍后: put the notice away (a result that was only information is gone for good). */
export function later() {
  update.hidden = true
  if (update.phase === 'uptodate' || update.phase === 'failed') update.phase = 'idle'
  else if (update.phase === 'error') update.phase = update.info?.newer ? 'available' : 'idle'
}

/** 跳过此版: this version is not announced at start again (a check by hand still shows it). */
export function skipVersion() {
  if (update.phase !== 'available' || !update.info) return
  settings.update.skipped = update.info.latest
  update.phase = 'idle'
}

/** The release page in the system browser. */
export async function openReleasePage(): Promise<void> {
  if (!updatePlatform.supported) return
  try { await updatePlatform.openPage() } catch { /* No browser: nothing else to do */ }
}

/**
 * Once per start, some seconds after the interface is up: clear what an earlier update left behind and, when the
 * setting allows it, check. Returns whether it was scheduled (false on the web build, in tests, and the second time).
 */
export function scheduleStartupCheck(delayMs = 4000): boolean {
  if (scheduled || !updatePlatform.supported || testRun()) return false
  scheduled = true
  setTimeout(() => {
    void updatePlatform.cleanup().catch(() => {})
    if (settings.update.auto) void checkForUpdates(false)
  }, delayMs)
  return true
}

/** Back to the state of a fresh start (tests). */
export function resetUpdateState() {
  seq++
  scheduled = false
  Object.assign(update, { phase: 'idle', manual: false, info: null, received: 0, total: 0, downloaded: null, manualInstall: null, error: null, hidden: false })
}

// ---- Texts ----

/** The first lines of release notes as plain text (headings and emphasis marks dropped, nothing interpreted). */
export function notesPreview(notes: string, maxLines = 6, maxChars = 140): { lines: string[]; more: boolean } {
  const all = String(notes ?? '')
    .replace(/\r\n?/g, '\n')
    // Control characters, zero-width characters and direction overrides have no place in a notice
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, '')
    .split('\n')
    .map(l => l.replace(/\t/g, ' ').replace(/^\s*#{1,6}\s+/, '').replace(/\*\*/g, '').trim())
    .filter(l => l.length > 0)
  const lines = all.slice(0, maxLines).map(l => (l.length > maxChars ? `${l.slice(0, maxChars - 1)}…` : l))
  return { lines, more: all.length > maxLines }
}

/** A size in megabytes with one decimal ("11.2 MB"); the decimal mark follows the readout setting elsewhere. */
export function megabytes(bytes: number): string {
  return `${(Math.max(0, bytes) / 1048576).toFixed(1)} MB`
}

/** The date of an ISO time stamp ("2026-11-13"), or '' when it is none. */
export function isoDate(stamp: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T/.exec(stamp ?? '')
  return m ? m[1] : ''
}

/** Why a step failed, for the user. */
export function updateErrorText(code: UpdateErrorCode): string {
  switch (code) {
    case 'timeout': case 'connect': case 'network': case 'redirect':
      return tl('无法连接 GitHub，请检查网络后重试。')
    case 'rate':
      return tl('这个网络地址的查询次数已用完，请一小时后再试。')
    case 'none': case 'http': case 'malformed':
      return tl('无法识别 GitHub 返回的版本信息。')
    case 'no-asset': case 'no-sums': case 'sums-missing':
      return tl('这个版本没有可以自动安装的文件，请在浏览器中下载。')
    case 'hash-mismatch': case 'size':
      return tl('下载的文件没有通过校验，已删除。')
    case 'io':
      return tl('无法保存下载的文件。')
    case 'stale': case 'not-ready': case 'busy':
      return tl('版本信息已过期，请重新检查。')
    case 'handover':
      return tl('无法打开系统的安装程序，已在浏览器中打开发布页。')
    default:
      return tl('遇到了没有预料到的问题。')
  }
}
