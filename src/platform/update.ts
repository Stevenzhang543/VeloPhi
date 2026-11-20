/**
 * In-app update of the Windows desktop app and the Android app (26.64) and of the Linux packages (26.65: AppImage,
 * deb, rpm): the calls to the Rust side (src-tauri/src/update.rs). The web build has none of it — `supported` is false
 * there, every call is refused before anything is loaded, and no address of the update lives in the page: the network
 * requests are made in Rust.
 *
 * The page hands the Rust side only the tag it was offered; which file is downloaded, from where, and whether it may
 * run is decided there. On Android the verified file is handed to the system installer by MainActivity
 * (`window.VeloPhiAndroid.installUpdate`), given nothing but its file name. A Linux deb or rpm goes to the system's
 * package tool (pkexec asks for the authorisation); when that does not happen the answer says how to install it by hand.
 */
import { isDesktop } from './files'

/**
 * How this copy is updated: the installer, a new portable executable, the Android package, a new AppImage next to the
 * old one, the deb or rpm through the system's package tool, or by hand (the release page).
 */
export type UpdateKind = 'installer' | 'portable' | 'android' | 'appimage' | 'deb' | 'rpm' | 'other'

/**
 * A Linux deb or rpm the package tool did not install: why, where the verified file is, and the command to type.
 * `reason`: 'cancelled' (the authorisation was refused), 'no-agent' (no pkexec or authentication agent), 'no-tool'
 * (no package tool found), 'failed' (the tool reported an error: `code`, `detail`). Paths and details are shown as text.
 */
export interface UpdateManual { reason: 'cancelled' | 'no-agent' | 'no-tool' | 'failed'; code: number | null; detail: string; path: string; command: string }

/** The answer of a check. */
export interface UpdateInfo {
  /** The running version and the latest published one, as shown ("26.64", "26.64.1"). */
  current: string
  latest: string
  /** The release's tag (free text of the maintainer; passed back for the download, never shown as HTML). */
  tag: string
  newer: boolean
  /** Release notes: remote plain text. */
  notes: string
  /** Publication time (ISO 8601) or ''. */
  published: string
  kind: UpdateKind
  /** The file for this build; null when the release has none (then only the release page can be opened). */
  asset: { name: string; size: number } | null
  /** The release carries SHA256SUMS.txt (without it nothing is downloaded). */
  sums: boolean
}

export interface UpdateProgress { phase: 'downloading' | 'verifying'; received: number; total: number }

/** A downloaded and verified file. `path` and `old` only for the portable build and the AppImage (shown to the user). */
export interface UpdateDownloaded { kind: UpdateKind; name: string; path: string | null; old: string | null }

/** Why a step failed. `detail` is technical text of the Rust side (English), shown as it is. */
export type UpdateErrorCode =
  | 'unsupported' | 'selftest' | 'timeout' | 'connect' | 'network' | 'redirect' | 'rate' | 'none' | 'http' | 'malformed'
  | 'size' | 'stale' | 'busy' | 'no-asset' | 'no-sums' | 'sums-missing' | 'hash-mismatch' | 'io' | 'cancelled' | 'not-ready' | 'handover' | 'unknown'

const CODES: ReadonlySet<string> = new Set(['unsupported', 'selftest', 'timeout', 'connect', 'network', 'redirect', 'rate', 'none', 'http', 'malformed', 'size', 'stale', 'busy', 'no-asset', 'no-sums', 'sums-missing', 'hash-mismatch', 'io', 'cancelled', 'not-ready', 'handover'])

export class UpdateError extends Error {
  constructor(public code: UpdateErrorCode, public detail = '') {
    super(detail ? `${code}: ${detail}` : code)
  }
}

/** The Rust side reports `code` or `code: detail`. */
export function toUpdateError(e: unknown): UpdateError {
  if (e instanceof UpdateError) return e
  const text = typeof e === 'string' ? e : e instanceof Error ? e.message : String(e)
  const cut = text.indexOf(':')
  const code = (cut < 0 ? text : text.slice(0, cut)).trim()
  return CODES.has(code) ? new UpdateError(code as UpdateErrorCode, cut < 0 ? '' : text.slice(cut + 1).trim()) : new UpdateError('unknown', text.slice(0, 300))
}

/** What the update needs from its host (replaced in tests). */
export interface UpdatePlatform {
  /** False on the web build: nothing below may be called. */
  readonly supported: boolean
  check(): Promise<UpdateInfo>
  download(tag: string, onProgress: (p: UpdateProgress) => void): Promise<UpdateDownloaded>
  cancel(): Promise<void>
  /**
   * Starts the installer, the new executable or AppImage, or the system's package tool (the app then exits), or opens
   * Android's install prompt. Resolves with how to install by hand when a Linux package tool did not install it.
   */
  install(): Promise<UpdateManual | null | void>
  /** The release page in the system browser. */
  openPage(): Promise<void>
  /** Deletes what earlier updates left behind (no network). */
  cleanup(): Promise<void>
  /** Linux: shows the folder of an update to be installed by hand in the file manager. */
  showFile(): Promise<void>
}

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

async function core(): Promise<{ invoke: Invoke; Channel: new <T>() => { onmessage: (m: T) => void } }> {
  if (!isDesktop) throw new UpdateError('unsupported')
  return (await import('@tauri-apps/api/core')) as unknown as { invoke: Invoke; Channel: new <T>() => { onmessage: (m: T) => void } }
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await core()
  try { return await invoke<T>(cmd, args) } catch (e) { throw toUpdateError(e) }
}

interface AndroidBridge { installUpdate?: (name: string) => boolean }

const native: UpdatePlatform = {
  supported: isDesktop,
  check: () => call<UpdateInfo>('update_check'),
  async download(tag, onProgress) {
    const { Channel } = await core()
    const channel = new Channel<UpdateProgress>()
    channel.onmessage = onProgress
    return call<UpdateDownloaded>('update_download', { tag, onProgress: channel })
  },
  cancel: () => call<void>('update_cancel'),
  async install() {
    const done = await call<{ kind: UpdateKind; name: string; manual?: UpdateManual | null }>('update_install')
    // Linux deb/rpm: the package tool did not install it (the app keeps running)
    if (done.manual) return done.manual
    if (done.kind !== 'android') return null
    // Android: the Rust side has checked the file once more; MainActivity gives it to the system installer
    const bridge = (window as unknown as { VeloPhiAndroid?: AndroidBridge }).VeloPhiAndroid
    let started = false
    try { started = typeof bridge?.installUpdate === 'function' && bridge.installUpdate(done.name) === true } catch { started = false }
    if (!started) throw new UpdateError('handover')
    return null
  },
  openPage: () => call<void>('update_open_page'),
  cleanup: () => call<void>('update_cleanup'),
  showFile: () => call<void>('update_show_file')
}

/** The platform in use. */
export let updatePlatform: UpdatePlatform = native

/** Replace the platform (tests); null restores the real one. */
export function setUpdatePlatform(p: UpdatePlatform | null) { updatePlatform = p ?? native }
