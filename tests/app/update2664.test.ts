/**
 * In-app update (26.64): the state machine of src/app/update.ts on a mocked platform layer — a newer, the same and an
 * older release, a malformed answer, a network failure, a file that fails verification, cancelling, a skipped version,
 * the one check per start, never on the web build and never in the self-check or the interface tests — the calls the
 * real platform layer makes on a faked desktop host, version comparison including hot-fix versions, and release notes
 * as plain text (nothing in them is interpreted as HTML).
 *
 * The network side (GitHub's answer, the checksum file, the allowed hosts, hashing) is Rust: its unit tests are in
 * src-tauri/src/update.rs (`cargo test --manifest-path src-tauri/Cargo.toml --lib`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { UpdateDownloaded, UpdateInfo, UpdatePlatform, UpdateProgress } from '../../src/platform/update'

const tauri = vi.hoisted(() => ({ loaded: 0, invoke: null as null | ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>), asked: [] as Array<{ text: string; options: Record<string, unknown> }>, answer: true }))
const state = { dirty: false }
vi.mock('../../src/app/store', () => ({ state }))
vi.mock('../../src/app/layout', async () => ({ phone: (await import('vue')).ref(false) }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: async (text: string, options: Record<string, unknown>) => { tauri.asked.push({ text, options }); return tauri.answer } }))
vi.mock('@tauri-apps/api/core', () => {
  tauri.loaded++
  return { invoke: (cmd: string, args?: Record<string, unknown>) => tauri.invoke!(cmd, args), Channel: class { onmessage: (m: unknown) => void = () => {} } }
})

const { settings } = await import('../../src/app/settings')
const { setUpdatePlatform, toUpdateError, updatePlatform, UpdateError } = await import('../../src/platform/update')
const upd = await import('../../src/app/update')
const { update } = upd
const { tl } = await import('../../src/i18n')
// The components are loaded once, here: they share the state this file drives
const UpdateNotice = (await import('../../src/app/components/UpdateNotice.vue')).default
const UpdateSettings = (await import('../../src/app/components/UpdateSettings.vue')).default
const { buildTables } = await import('../../src/i18n/tables')

const SETUP = 'VeloPhi-v26.65-windows-x64-setup.exe'
const info = (over: Partial<UpdateInfo> = {}): UpdateInfo => ({
  current: '26.64', latest: '26.65', tag: 'Release26.65(2027.01.10)', newer: true, notes: 'What is new\n- one\n- two', published: '2027-01-10T08:00:00Z',
  kind: 'installer', asset: { name: SETUP, size: 10 }, sums: true, ...over
})
const downloaded = (over: Partial<UpdateDownloaded> = {}): UpdateDownloaded => ({ kind: 'installer', name: SETUP, path: null, old: null, ...over })

/** A desktop host whose answers the test chooses. */
function host(over: Partial<UpdatePlatform> = {}) {
  const p = {
    supported: true,
    check: vi.fn<UpdatePlatform['check']>(over.check ?? (async () => info())),
    download: vi.fn<UpdatePlatform['download']>(over.download ?? (async (_tag, onProgress) => {
      onProgress({ phase: 'downloading', received: 4, total: 10 })
      onProgress({ phase: 'verifying', received: 10, total: 10 })
      return downloaded()
    })),
    cancel: vi.fn<UpdatePlatform['cancel']>(over.cancel ?? (async () => {})),
    install: vi.fn<UpdatePlatform['install']>(over.install ?? (async () => {})),
    openPage: vi.fn<UpdatePlatform['openPage']>(over.openPage ?? (async () => {})),
    cleanup: vi.fn<UpdatePlatform['cleanup']>(over.cleanup ?? (async () => {})),
    showFile: vi.fn<UpdatePlatform['showFile']>(over.showFile ?? (async () => {}))
  }
  setUpdatePlatform(p)
  return p
}

function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}

beforeEach(() => {
  upd.resetUpdateState()
  Object.assign(settings.update, { auto: true, skipped: '', lastCheck: 0, lastLatest: '' })
  state.dirty = false
  tauri.asked.length = 0
  tauri.answer = true
  tauri.invoke = null
})
afterEach(() => { setUpdatePlatform(null); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('checking', () => {
  it('announces a newer version quietly at start', async () => {
    const p = host()
    await upd.checkForUpdates(false)
    expect(p.check).toHaveBeenCalledTimes(1)
    expect(update.phase).toBe('available')
    expect(update.info?.latest).toBe('26.65')
    expect(upd.noticeVisible()).toBe(true)
    expect(upd.canInstall(update.info)).toBe(true)
    expect(settings.update.lastCheck).toBeGreaterThan(0)
    expect(settings.update.lastLatest).toBe('26.65')
  })

  it('the same version: nothing at start, said when the user asked', async () => {
    host({ check: vi.fn(async () => info({ latest: '26.64', newer: false })) })
    await upd.checkForUpdates(false)
    expect(update.phase).toBe('idle')
    expect(upd.noticeVisible()).toBe(false)
    await upd.checkForUpdates(true)
    expect(update.phase).toBe('uptodate')
    expect(upd.noticeVisible()).toBe(true)
    upd.later()
    expect(update.phase).toBe('idle')
  })

  it('never offers an older release, whatever the answer claims', async () => {
    const p = host({ check: vi.fn(async () => info({ latest: '26.60', newer: false })) })
    await upd.checkForUpdates(true)
    expect(update.phase).toBe('uptodate')
    expect(upd.canInstall(update.info)).toBe(false)
    await upd.startUpdate()
    expect(p.download).not.toHaveBeenCalled()
    // An answer that calls an older or an unreadable version "newer" is not believed
    for (const lie of [info({ latest: '26.63', newer: true }), info({ latest: '26.64', newer: true }), info({ latest: '26.64.0', newer: true }), info({ latest: 'latest', newer: true }), info({ current: '?', newer: true })]) {
      upd.resetUpdateState()
      const q = host({ check: vi.fn(async () => lie) })
      await upd.checkForUpdates(false)
      expect(update.phase, lie.latest).toBe('idle')
      expect(update.info?.newer).toBe(false)
      await upd.startUpdate()
      expect(q.download).not.toHaveBeenCalled()
    }
  })

  it('a malformed answer is silent at start and explicit when asked', async () => {
    // What the Rust side reports for an answer that is not the release description
    host({ check: vi.fn(async () => { throw 'malformed: not JSON' }) })
    await upd.checkForUpdates(false)
    expect([update.phase, update.error, upd.noticeVisible()]).toEqual(['idle', null, false])
    expect(settings.update.lastCheck).toBe(0)
    await upd.checkForUpdates(true)
    expect(update.phase).toBe('failed')
    expect(update.error).toEqual({ code: 'malformed', detail: 'not JSON' })
    expect(upd.noticeVisible()).toBe(true)
    expect(upd.updateErrorText('malformed')).toBe(tl('无法识别 GitHub 返回的版本信息。'))
  })

  it('a network failure is silent at start and explicit when asked', async () => {
    for (const reason of ['connect', 'timeout', 'network: error sending request', 'rate', 'http: 503']) {
      upd.resetUpdateState()
      const p = host({ check: vi.fn(async () => { throw reason }) })
      await upd.checkForUpdates(false)
      expect([update.phase, upd.noticeVisible()], reason).toEqual(['idle', false])
      await upd.checkForUpdates(true)
      expect(update.phase, reason).toBe('failed')
      expect(update.error?.code).toBe(reason.split(':')[0])
      expect(upd.updateErrorText(update.error!.code).length).toBeGreaterThan(4)
      // Trying again works from the failed state
      p.check.mockImplementation(async () => info())
      await upd.checkForUpdates(true)
      expect(update.phase).toBe('available')
    }
    expect(settings.update.lastCheck).toBeGreaterThan(0)
  })

  it('a check that never answers ends as a time-out', async () => {
    vi.useFakeTimers()
    host({ check: vi.fn(() => new Promise<UpdateInfo>(() => {})) })
    const done = upd.checkForUpdates(true)
    expect(update.phase).toBe('checking')
    await vi.advanceTimersByTimeAsync(15000)
    await done
    expect([update.phase, update.error?.code]).toEqual(['failed', 'timeout'])
  })

  it('reads the error texts of the Rust side', () => {
    expect([toUpdateError('hash-mismatch').code, toUpdateError('hash-mismatch').detail]).toEqual(['hash-mismatch', ''])
    expect([toUpdateError('http: 500').code, toUpdateError('http: 500').detail]).toEqual(['http', '500'])
    expect(toUpdateError(new Error('io: disk full')).code).toBe('io')
    expect([toUpdateError('something else').code, toUpdateError('something else').detail]).toEqual(['unknown', 'something else'])
    expect(toUpdateError(new UpdateError('cancelled')).code).toBe('cancelled')
    expect(toUpdateError({}).code).toBe('unknown')
  })
})

describe('updating', () => {
  it('one click: download, verify, install — only the tag goes to the platform', async () => {
    const seen: string[] = []
    const p = host()
    p.download.mockImplementation(async (_tag, onProgress) => {
      onProgress({ phase: 'downloading', received: 4, total: 10 })
      seen.push(`${update.phase} ${update.received}/${update.total}`)
      onProgress({ phase: 'verifying', received: 10, total: 10 })
      seen.push(update.phase)
      return downloaded()
    })
    await upd.checkForUpdates(false)
    await upd.startUpdate()
    expect(p.download).toHaveBeenCalledTimes(1)
    expect(p.download.mock.calls[0][0]).toBe('Release26.65(2027.01.10)')
    expect(seen).toEqual(['downloading 4/10', 'verifying'])
    expect(p.install).toHaveBeenCalledTimes(1)
    // The app is closing for the installer
    expect(update.phase).toBe('installing')
    expect(tauri.asked).toEqual([])
  })

  it('asks about unsaved changes with the question of closing the window; "cancel" keeps the download', async () => {
    const p = host()
    state.dirty = true
    tauri.answer = false
    await upd.checkForUpdates(false)
    await upd.startUpdate()
    expect(p.install).not.toHaveBeenCalled()
    expect(update.phase).toBe('ready')
    expect(tauri.asked).toHaveLength(1)
    expect(tauri.asked[0].text).toBe(tl('当前场景有未保存的修改，确定退出吗？'))
    expect(tauri.asked[0].options).toMatchObject({ okLabel: tl('退出'), cancelLabel: tl('取消') })
    // The same words as App.vue's question on closing the window
    const app = readFileSync(join(__dirname, '../../src/app/App.vue'), 'utf8')
    expect(app).toContain("ask(tl('当前场景有未保存的修改，确定退出吗？')")
    tauri.answer = true
    await upd.installUpdate()
    expect(tauri.asked).toHaveLength(2)
    expect(p.install).toHaveBeenCalledTimes(1)
    expect(update.phase).toBe('installing')
  })

  it('the portable build first says where the new file is', async () => {
    const file = downloaded({ kind: 'portable', name: 'VeloPhi-v26.65-windows-x64-portable.exe', path: 'D:\\Tools\\VeloPhi-v26.65-windows-x64-portable.exe', old: 'VeloPhi-v26.64-windows-x64-portable.exe' })
    const p = host({ check: vi.fn(async () => info({ kind: 'portable', asset: { name: file.name, size: 10 } })), download: vi.fn(async () => file) })
    await upd.checkForUpdates(false)
    await upd.startUpdate()
    expect(update.phase).toBe('ready')
    expect(update.downloaded).toEqual(file)
    expect(p.install).not.toHaveBeenCalled()
    await upd.installUpdate()
    expect(p.install).toHaveBeenCalledTimes(1)
  })

  it('Android: the prompt of the system; a failed hand-over opens the release page', async () => {
    const file = downloaded({ kind: 'android', name: 'VeloPhi-v26.65-android.apk' })
    const p = host({ check: vi.fn(async () => info({ kind: 'android', asset: { name: file.name, size: 10 } })), download: vi.fn(async () => file) })
    await upd.checkForUpdates(false)
    await upd.startUpdate()
    expect(p.install).toHaveBeenCalledTimes(1)
    // The app keeps running behind Android's prompt: the file stays for another try
    expect(update.phase).toBe('ready')
    p.install.mockImplementation(async () => { throw new UpdateError('handover') })
    await upd.installUpdate()
    expect([update.phase, update.error?.code]).toEqual(['error', 'handover'])
    expect(p.openPage).toHaveBeenCalledTimes(1)
  })

  it('a file that fails verification is never installed', async () => {
    for (const reason of ['hash-mismatch', 'sums-missing', 'size', 'redirect', 'io: access denied']) {
      upd.resetUpdateState()
      const p = host({ download: vi.fn(async () => { throw reason }) })
      await upd.checkForUpdates(false)
      await upd.startUpdate()
      expect(update.phase, reason).toBe('error')
      expect(update.error?.code).toBe(reason.split(':')[0])
      expect(update.downloaded).toBeNull()
      expect(p.install).not.toHaveBeenCalled()
      await upd.installUpdate()
      expect(p.install).not.toHaveBeenCalled()
      expect(upd.noticeVisible()).toBe(true)
    }
    expect(upd.updateErrorText('hash-mismatch')).toBe(tl('下载的文件没有通过校验，已删除。'))
    // The installer step can refuse too (the file changed after it was verified)
    upd.resetUpdateState()
    const p = host({ install: vi.fn(async () => { throw 'hash-mismatch' }) })
    await upd.checkForUpdates(false)
    await upd.startUpdate()
    expect([update.phase, update.error?.code, update.downloaded]).toEqual(['error', 'hash-mismatch', null])
    // 重试 downloads again
    p.install.mockImplementation(async () => {})
    await upd.startUpdate()
    expect(p.download).toHaveBeenCalledTimes(2)
    expect(update.phase).toBe('installing')
  })

  it('cancel returns to the offer and drops the late answer', async () => {
    const pending = deferred<UpdateDownloaded>()
    const p = host({ download: vi.fn(() => pending.promise) })
    await upd.checkForUpdates(false)
    const running = upd.startUpdate()
    expect(update.phase).toBe('downloading')
    await upd.cancelUpdate()
    expect(p.cancel).toHaveBeenCalledTimes(1)
    expect(update.phase).toBe('available')
    // The Rust side answers "cancelled" — or, if it had just finished, with the file: neither changes anything
    pending.resolve(downloaded())
    await running
    expect(update.phase).toBe('available')
    expect(update.downloaded).toBeNull()
    expect(p.install).not.toHaveBeenCalled()
    // A "cancelled" answer without a cancel of ours (the task was stopped) is not an error either
    p.download.mockImplementation(async () => { throw 'cancelled' })
    await upd.startUpdate()
    expect([update.phase, update.error]).toEqual(['available', null])
    // Nothing to cancel outside a download
    await upd.cancelUpdate()
    expect(p.cancel).toHaveBeenCalledTimes(1)
  })

  it('a skipped version is not announced again; asking shows it; a newer one is announced', async () => {
    const p = host()
    await upd.checkForUpdates(false)
    upd.skipVersion()
    expect(settings.update.skipped).toBe('26.65')
    expect(update.phase).toBe('idle')
    await upd.checkForUpdates(false)
    expect([update.phase, upd.noticeVisible()]).toEqual(['idle', false])
    await upd.checkForUpdates(true)
    expect(update.phase).toBe('available')
    upd.resetUpdateState()
    // The same version written with its patch number is still the skipped one; its hot-fix is not
    p.check.mockImplementation(async () => info({ latest: '26.65.0' }))
    await upd.checkForUpdates(false)
    expect(update.phase).toBe('idle')
    p.check.mockImplementation(async () => info({ latest: '26.65.1' }))
    await upd.checkForUpdates(false)
    expect(update.phase).toBe('available')
  })

  it('稍后 hides the notice until the next check by hand', async () => {
    const p = host()
    await upd.checkForUpdates(false)
    upd.later()
    expect([update.phase, upd.noticeVisible()]).toEqual(['available', false])
    await upd.checkForUpdates(true)
    expect([update.phase, upd.noticeVisible()]).toEqual(['available', true])
    expect(p.check).toHaveBeenCalledTimes(2)
  })

  it('without a file for this build or without a checksum file only the release page is offered', async () => {
    for (const lacking of [info({ asset: null }), info({ sums: false }), info({ kind: 'other', asset: null })]) {
      upd.resetUpdateState()
      const p = host({ check: vi.fn(async () => lacking) })
      await upd.checkForUpdates(false)
      expect(update.phase).toBe('available')
      expect(upd.canInstall(update.info)).toBe(false)
      await upd.startUpdate()
      expect(p.download).not.toHaveBeenCalled()
      await upd.openReleasePage()
      expect(p.openPage).toHaveBeenCalledTimes(1)
    }
  })
})

describe('once per start', () => {
  it('one check some seconds after the interface is up', async () => {
    vi.useFakeTimers()
    const p = host()
    expect(upd.scheduleStartupCheck(4000)).toBe(true)
    expect(upd.scheduleStartupCheck(4000)).toBe(false)
    await vi.advanceTimersByTimeAsync(3999)
    expect(p.check).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(p.cleanup).toHaveBeenCalledTimes(1)
    expect(p.check).toHaveBeenCalledTimes(1)
    expect(update.phase).toBe('available')
    await vi.advanceTimersByTimeAsync(600000)
    expect(p.check).toHaveBeenCalledTimes(1)
  })

  it('the setting turns the check off (left-overs are still cleared, without the network)', async () => {
    vi.useFakeTimers()
    const p = host()
    settings.update.auto = false
    expect(upd.scheduleStartupCheck(4000)).toBe(true)
    await vi.advanceTimersByTimeAsync(10000)
    expect(p.cleanup).toHaveBeenCalledTimes(1)
    expect(p.check).not.toHaveBeenCalled()
    expect(update.phase).toBe('idle')
  })

  it('never in the release self-check or the interface tests', async () => {
    vi.useFakeTimers()
    for (const search of ['?selftest', '?selftest=1', '?uitest=1', '?download&uitest=1']) {
      upd.resetUpdateState()
      const p = host()
      vi.stubGlobal('location', { search })
      expect(upd.scheduleStartupCheck(10), search).toBe(false)
      await vi.advanceTimersByTimeAsync(60000)
      await upd.checkForUpdates(false)
      await upd.checkForUpdates(true)
      expect(p.check, search).not.toHaveBeenCalled()
      expect(p.cleanup).not.toHaveBeenCalled()
      expect(update.phase).toBe('idle')
    }
    // An ordinary address checks
    const p = host()
    vi.stubGlobal('location', { search: '?lang=de' })
    expect(upd.scheduleStartupCheck(10)).toBe(true)
    await vi.advanceTimersByTimeAsync(10)
    expect(p.check).toHaveBeenCalledTimes(1)
  })
})

describe('the web build', () => {
  it('has no update: nothing is scheduled, checked, shown or loaded', async () => {
    // The real platform layer in a host without Tauri (this test runs without a window, like a browser without Tauri)
    setUpdatePlatform(null)
    expect(updatePlatform.supported).toBe(false)
    vi.useFakeTimers()
    expect(upd.scheduleStartupCheck(10)).toBe(false)
    await vi.advanceTimersByTimeAsync(60000)
    await upd.checkForUpdates(false)
    await upd.checkForUpdates(true)
    await upd.startUpdate()
    await upd.installUpdate()
    await upd.openReleasePage()
    expect([update.phase, update.info, upd.noticeVisible()]).toEqual(['idle', null, false])
    for (const call of [() => updatePlatform.check(), () => updatePlatform.download('v26.65', () => {}), () => updatePlatform.install(), () => updatePlatform.cancel(), () => updatePlatform.openPage(), () => updatePlatform.cleanup(), () => updatePlatform.showFile()]) {
      await expect(call()).rejects.toMatchObject({ code: 'unsupported' })
    }
    // The Tauri interface was never even imported
    expect(tauri.loaded).toBe(0)
    // The settings and the about dialog show nothing of it
    expect(await renderToString(createSSRApp({ render: () => h(UpdateSettings) }))).toBe('<!---->')
    // No address of the update lives in the page's code: the requests are made by the Rust side
    for (const file of ['src/platform/update.ts', 'src/app/update.ts', 'src/app/components/UpdateNotice.vue']) {
      const src = readFileSync(join(__dirname, '../..', file), 'utf8')
      expect(src, file).not.toMatch(/https?:\/\/|fetch\(|net_request|netRequest|XMLHttpRequest/)
    }
    // App.vue mounts the notice only inside the app
    expect(readFileSync(join(__dirname, '../../src/app/App.vue'), 'utf8')).toContain('<UpdateNotice v-if="isDesktop" />')
  })
})

describe('the platform layer on a desktop host', () => {
  it('names the commands, passes only the tag, and hands the Android file over by its name', async () => {
    vi.resetModules()
    const installUpdate = vi.fn((_name: string) => true)
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {}, VeloPhiAndroid: { installUpdate } })
    const calls: Array<[string, Record<string, unknown> | undefined]> = []
    let installed: unknown = { kind: 'installer', name: SETUP }
    tauri.invoke = async (cmd, args) => {
      calls.push([cmd, args])
      if (cmd === 'update_check') return info()
      if (cmd === 'update_download') {
        ;(args!.onProgress as { onmessage: (m: UpdateProgress) => void }).onmessage({ phase: 'downloading', received: 1, total: 2 })
        return downloaded()
      }
      if (cmd === 'update_install') { if (installed === null) throw 'hash-mismatch'; return installed }
      return undefined
    }
    const fresh = await import('../../src/platform/update')
    const p = fresh.updatePlatform
    expect(p.supported).toBe(true)
    expect(await p.check()).toEqual(info())
    const progress: UpdateProgress[] = []
    expect(await p.download('Release26.65(2027.01.10)', m => progress.push(m))).toEqual(downloaded())
    expect(progress).toEqual([{ phase: 'downloading', received: 1, total: 2 }])
    const args = calls.find(c => c[0] === 'update_download')![1]!
    // Nothing but the tag and the progress channel: no address, no file name, no hash
    expect(Object.keys(args).sort()).toEqual(['onProgress', 'tag'])
    expect(args.tag).toBe('Release26.65(2027.01.10)')
    await p.install()
    expect(installUpdate).not.toHaveBeenCalled()
    await p.cancel(); await p.openPage(); await p.cleanup()
    expect(calls.map(c => c[0])).toEqual(['update_check', 'update_download', 'update_install', 'update_cancel', 'update_open_page', 'update_cleanup'])
    for (const c of calls) if (c[0] !== 'update_download') expect(c[1]).toBeUndefined()
    // Android: the Rust side answers with the file name; MainActivity gets exactly that
    installed = { kind: 'android', name: 'VeloPhi-v26.65-android.apk' }
    await p.install()
    expect(installUpdate.mock.calls).toEqual([['VeloPhi-v26.65-android.apk']])
    // The installer could not be started, the bridge is missing or throws: a hand-over error
    installUpdate.mockImplementation(() => false)
    await expect(p.install()).rejects.toMatchObject({ code: 'handover' })
    installUpdate.mockImplementation(() => { throw new Error('x') })
    await expect(p.install()).rejects.toMatchObject({ code: 'handover' })
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    await expect(p.install()).rejects.toMatchObject({ code: 'handover' })
    // Errors of the commands arrive with their code
    installed = null
    await expect(p.install()).rejects.toMatchObject({ code: 'hash-mismatch' })
    vi.resetModules()
  })
})

describe('versions', () => {
  it('compares part by part, a hot-fix above its base, a missing patch as zero', () => {
    expect(upd.parseVersion('26.64')).toEqual([26, 64, 0])
    expect(upd.parseVersion('26.64.1')).toEqual([26, 64, 1])
    expect(upd.parseVersion('v26.64.1')).toEqual([26, 64, 1])
    for (const bad of ['', '26', '26.', '26.64.1.2', 'Release26.63(2026.12.13)', '26.x', ' 26.64', '26.64-beta', '-26.64', '26.123456']) expect(upd.parseVersion(bad), bad).toBeNull()
    const sign = (a: string, b: string) => Math.sign(upd.compareVersions(a, b)!)
    expect(sign('26.64.1', '26.64')).toBe(1)
    expect(sign('26.64.1', '26.64.0')).toBe(1)
    expect(sign('26.64', '26.64.0')).toBe(0)
    expect(sign('v26.64.1', '26.64.1')).toBe(0)
    expect(sign('26.65', '26.64.9')).toBe(1)
    expect(sign('26.100', '26.99')).toBe(1)
    expect(sign('26.9', '26.10')).toBe(-1)
    expect(sign('27.0', '26.99.9')).toBe(1)
    expect(sign('26.63', '26.64')).toBe(-1)
    expect(upd.compareVersions('26.64', 'latest')).toBeNull()
    expect(upd.compareVersions('', '26.64')).toBeNull()
  })

  it('a hot-fix of the running version is offered', async () => {
    const p = host({ check: vi.fn(async () => info({ current: '26.64', latest: '26.64.1', tag: 'v26.64.1', asset: { name: 'VeloPhi-v26.64.1-windows-x64-setup.exe', size: 10 } })) })
    await upd.checkForUpdates(false)
    expect(update.phase).toBe('available')
    await upd.startUpdate()
    expect(p.download.mock.calls[0][0]).toBe('v26.64.1')
  })

  it('the version the update compares against is the version of the app', async () => {
    // The Rust side compares releases with the version of src-tauri/Cargo.toml; a bump that misses it (or the
    // installer's and the Android package's version in tauri.conf.json) would offer the app its own version
    const { ENGINE_VERSION } = await import('../../src/core/scene/types')
    const root = join(__dirname, '../..')
    const cargo = /^version = "([^"]+)"/m.exec(readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8'))![1]
    const conf = (JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8')) as { version: string }).version
    expect({ cargo, conf }).toEqual({ cargo: ENGINE_VERSION, conf: ENGINE_VERSION })
    expect(upd.parseVersion(ENGINE_VERSION)).not.toBeNull()
  })
})

describe('release notes are plain text', () => {
  const HOSTILE = '## What is new\r\n\r\n<img src=x onerror=alert(1)>\n<script>alert(2)</script>\n**bold** and [a link](javascript:alert(3))\n\u202Egnp.exe\u0007\u0000\n<a href="https://evil.example">click</a>'

  it('keeps the first lines as they are written', () => {
    const { lines, more } = upd.notesPreview(HOSTILE)
    expect(lines).toEqual(['What is new', '<img src=x onerror=alert(1)>', '<script>alert(2)</script>', 'bold and [a link](javascript:alert(3))', 'gnp.exe', '<a href="https://evil.example">click</a>'])
    expect(more).toBe(false)
    const long = upd.notesPreview(Array.from({ length: 30 }, (_, i) => `line ${i} ${'x'.repeat(300)}`).join('\n'))
    expect(long.lines).toHaveLength(6)
    expect(long.more).toBe(true)
    expect(long.lines.every(l => l.length <= 140 && l.endsWith('…'))).toBe(true)
    expect(upd.notesPreview('')).toEqual({ lines: [], more: false })
    expect(upd.notesPreview(null as unknown as string)).toEqual({ lines: [], more: false })
    expect(upd.megabytes(11153878)).toBe('10.6 MB')
    expect(upd.isoDate('2026-11-13T17:07:14Z')).toBe('2026-11-13')
    expect(upd.isoDate('<b>')).toBe('')
  })

  it('the notice shows notes, file paths and error details as text, never as HTML', async () => {
    host({ check: vi.fn(async () => info({ notes: HOSTILE, latest: '26.65' })) })
    await upd.checkForUpdates(false)
    const render = () => renderToString(createSSRApp({ render: () => h(UpdateNotice) }))
    let html = await render()
    expect(html).toContain('data-phase="available"')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;')
    expect(html).not.toMatch(/<img|<script|<a[\s>]|<iframe/i)
    expect(html).toContain(tl('更新'))
    expect(html).toContain(tl('跳过此版'))
    expect(html).toContain(tl('在浏览器中查看'))
    // An error detail and a file path are text as well
    update.error = { code: 'unknown', detail: '<img src=x onerror=alert(4)>' }
    update.phase = 'error'
    html = await render()
    expect(html).toContain('&lt;img src=x onerror=alert(4)&gt;')
    expect(html).not.toMatch(/<img/i)
    update.downloaded = downloaded({ kind: 'portable', path: 'C:\\<b>x</b>\\new.exe', old: 'old<i>.exe' })
    update.phase = 'ready'
    html = await render()
    expect(html).toContain('C:\\&lt;b&gt;x&lt;/b&gt;\\new.exe')
    expect(html).toContain(tl('启动新版'))
    // Hidden states render nothing
    upd.later()
    expect(await render()).toBe('<!---->')
    // And no template of the update hands text to the HTML parser
    for (const file of ['UpdateNotice.vue', 'UpdateSettings.vue']) expect(readFileSync(join(__dirname, '../../src/app/components', file), 'utf8'), file).not.toMatch(/v-html|innerHTML|insertAdjacentHTML|outerHTML/)
  })
})

describe('labels', () => {
  it('buttons stay within the label budget (4 Chinese characters, 14 English, 18 German)', () => {
    const { en, de } = buildTables()
    for (const zh of ['更新', '稍后', '跳过此版', '重试', '安装', '启动新版', '立即检查', '取消', '关闭']) {
      expect([...zh].length, zh).toBeLessThanOrEqual(4)
      expect(en[zh].length, en[zh]).toBeLessThanOrEqual(14)
      expect(de[zh].length, de[zh]).toBeLessThanOrEqual(18)
    }
  })

  it('the setting says exactly what is contacted', () => {
    const src = readFileSync(join(__dirname, '../../src/app/components/UpdateSettings.vue'), 'utf8')
    const text = /tl\('(每次启动后[^']+)'/.exec(src)![1]
    const { en, de } = buildTables()
    for (const t of [text, en[text], de[text]]) {
      expect(t).toContain('api.github.com')
      expect(t).toContain('github.com')
      expect(t).toContain('VeloPhi/{0}')
    }
  })
})
