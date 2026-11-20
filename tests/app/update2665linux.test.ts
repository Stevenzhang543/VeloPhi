/**
 * In-app update of the Linux packages (26.65, D298), on a mocked platform layer: the AppImage is handled like the
 * portable build (the new file next to the old one, started by the user); the deb and the rpm stop after the
 * verification to say that the system will ask for the administrator's authorisation, then go to the system's package
 * tool; when it does not install them the notice shows why, where the verified file is and the command to type — as
 * text only — and can show the folder or try again. Also: the platform layer's answers, the label budget, and that the
 * file names agree between the updater (Rust), the build script and the packaging script.
 *
 * The Rust side (asset selection, package-tool detection, the AppImage environment) has its unit tests in
 * src-tauri/src/update.rs and src-tauri/src/net.rs (`cargo test --manifest-path src-tauri/Cargo.toml --lib`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { UpdateDownloaded, UpdateInfo, UpdateManual, UpdatePlatform } from '../../src/platform/update'

const tauri = vi.hoisted(() => ({ invoke: null as null | ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>), asked: [] as string[], answer: true }))
const state = { dirty: false }
vi.mock('../../src/app/store', () => ({ state }))
vi.mock('../../src/app/layout', async () => ({ phone: (await import('vue')).ref(false) }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: async (text: string) => { tauri.asked.push(text); return tauri.answer } }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: (cmd: string, args?: Record<string, unknown>) => tauri.invoke!(cmd, args), Channel: class { onmessage: (m: unknown) => void = () => {} } }))

const { settings } = await import('../../src/app/settings')
const { setUpdatePlatform } = await import('../../src/platform/update')
const upd = await import('../../src/app/update')
const { update } = upd
const { tl } = await import('../../src/i18n')
const UpdateNotice = (await import('../../src/app/components/UpdateNotice.vue')).default
const { buildTables } = await import('../../src/i18n/tables')

const ROOT = join(__dirname, '../..')
const FILES = { appimage: 'VeloPhi-v26.66-linux-x86_64.AppImage', deb: 'VeloPhi-v26.66-linux-amd64.deb', rpm: 'VeloPhi-v26.66-linux-x86_64.rpm' } as const
type LinuxKind = keyof typeof FILES

const info = (kind: LinuxKind, over: Partial<UpdateInfo> = {}): UpdateInfo => ({
  current: '26.65', latest: '26.66', tag: 'v26.66', newer: true, notes: 'What is new', published: '2027-02-01T08:00:00Z',
  kind, asset: { name: FILES[kind], size: 10 }, sums: true, ...over
})
const downloaded = (kind: LinuxKind, over: Partial<UpdateDownloaded> = {}): UpdateDownloaded => ({ kind, name: FILES[kind], path: null, old: null, ...over })
const manual = (over: Partial<UpdateManual> = {}): UpdateManual => ({
  reason: 'cancelled', code: null, detail: '', path: `/home/u/Downloads/${FILES.deb}`, command: `sudo apt install '/home/u/Downloads/${FILES.deb}'`, ...over
})

function host(kind: LinuxKind, over: Partial<UpdatePlatform> = {}, file: UpdateDownloaded = downloaded(kind)) {
  const p = {
    supported: true,
    check: vi.fn<UpdatePlatform['check']>(over.check ?? (async () => info(kind))),
    download: vi.fn<UpdatePlatform['download']>(over.download ?? (async (_tag, onProgress) => { onProgress({ phase: 'verifying', received: 10, total: 10 }); return file })),
    cancel: vi.fn<UpdatePlatform['cancel']>(async () => {}),
    install: vi.fn<UpdatePlatform['install']>(over.install ?? (async () => null)),
    openPage: vi.fn<UpdatePlatform['openPage']>(async () => {}),
    cleanup: vi.fn<UpdatePlatform['cleanup']>(async () => {}),
    showFile: vi.fn<UpdatePlatform['showFile']>(over.showFile ?? (async () => {}))
  }
  setUpdatePlatform(p)
  return p
}

const render = () => renderToString(createSSRApp({ render: () => h(UpdateNotice) }))

beforeEach(() => {
  upd.resetUpdateState()
  Object.assign(settings.update, { auto: true, skipped: '', lastCheck: 0, lastLatest: '' })
  state.dirty = false
  tauri.asked.length = 0
  tauri.answer = true
  tauri.invoke = null
})
afterEach(() => { setUpdatePlatform(null); vi.unstubAllGlobals(); vi.resetModules() })

describe('AppImage', () => {
  it('like the portable build: the new file next to the old one, started by the user', async () => {
    const file = downloaded('appimage', { path: `/home/u/Apps/${FILES.appimage}`, old: 'VeloPhi-v26.65-linux-x86_64.AppImage' })
    const p = host('appimage', {}, file)
    await upd.checkForUpdates(false)
    expect(upd.canInstall(update.info)).toBe(true)
    await upd.startUpdate()
    expect(update.phase).toBe('ready')
    expect(p.install).not.toHaveBeenCalled()
    const html = await render()
    expect(html).toContain(tl('新版本已保存为 {0}。启动它之后，旧文件 {1} 可以删除。', [file.path!, file.old!]))
    expect(html).toContain(tl('启动新版'))
    await upd.installUpdate()
    expect(p.install).toHaveBeenCalledTimes(1)
    // The app is closing; the new AppImage is starting
    expect(update.phase).toBe('installing')
    expect(await render()).toContain(tl('正在启动…'))
    expect(upd.beside('appimage') && upd.beside('portable') && !upd.beside('deb') && !upd.beside('installer')).toBe(true)
  })
})

describe('deb and rpm', () => {
  for (const kind of ['deb', 'rpm'] as const) {
    it(`${kind}: stops after the verification, then hands the file to the system's package tool`, async () => {
      const pending: Array<(m: UpdateManual | null) => void> = []
      const p = host(kind, { install: vi.fn(() => new Promise<UpdateManual | null>(r => pending.push(r))) })
      await upd.checkForUpdates(false)
      await upd.startUpdate()
      // Not straight on to the authorisation window: first said what will happen
      expect(update.phase).toBe('ready')
      expect(p.install).not.toHaveBeenCalled()
      let html = await render()
      expect(html).toContain(tl('已下载并通过校验。安装需要系统管理员授权，装好后 VeloΦ 会自动重新打开。'))
      expect(html).toContain(tl('安装'))
      expect(html).not.toContain(tl('启动新版'))
      const running = upd.installUpdate()
      await vi.waitFor(() => expect(pending).toHaveLength(1))
      expect(update.phase).toBe('installing')
      html = await render()
      expect(html).toContain(tl('正在等待系统授权并安装…'))
      // Installed: the app is closing for the new version
      pending[0](null)
      await running
      expect(update.phase).toBe('installing')
      expect(update.manualInstall).toBeNull()
      expect(upd.viaPackageTool(kind)).toBe(true)
    })
  }

  it('asks about unsaved changes before the package tool runs; "cancel" keeps the download', async () => {
    const p = host('deb')
    state.dirty = true
    tauri.answer = false
    await upd.checkForUpdates(false)
    await upd.startUpdate()
    await upd.installUpdate()
    expect(tauri.asked).toEqual([tl('当前场景有未保存的修改，确定退出吗？')])
    expect(p.install).not.toHaveBeenCalled()
    expect(update.phase).toBe('ready')
  })

  it('not installed: why, where the file is and the command to type; show the folder, try again', async () => {
    const m = manual()
    const p = host('deb', { install: vi.fn(async () => m) })
    await upd.checkForUpdates(false)
    await upd.startUpdate()
    await upd.installUpdate()
    expect(update.phase).toBe('manual')
    expect(update.manualInstall).toEqual(m)
    expect(upd.noticeVisible()).toBe(true)
    const html = await render()
    expect(html).toContain('data-phase="manual"')
    expect(html).toContain(tl('需要手动安装'))
    expect(html).toContain(tl('系统授权被取消，没有安装。'))
    expect(html).toContain(tl('新版本已保存为 {0}。在终端里运行下面的命令即可安装：', [m.path]))
    // The command as it is to be typed (the quotes are HTML-escaped text)
    expect(html).toContain('sudo apt install &#39;/home/u/Downloads/VeloPhi-v26.66-linux-amd64.deb&#39;')
    for (const label of ['复制命令', '显示文件', '重试', '关闭']) expect(html).toContain(tl(label))
    // The folder in the file manager
    await upd.showUpdateFile()
    expect(p.showFile).toHaveBeenCalledTimes(1)
    // A check by hand does not throw the verified file away
    await upd.checkForUpdates(true)
    expect(update.phase).toBe('manual')
    expect(p.check).toHaveBeenCalledTimes(1)
    // 重试: the package tool once more; this time it installs
    p.install.mockImplementation(async () => null)
    await upd.installUpdate()
    expect(p.install).toHaveBeenCalledTimes(2)
    expect(update.phase).toBe('installing')
    expect(update.manualInstall).toBeNull()
  })

  it('稍后/关闭 hides the card but keeps the file; showing the folder outside that state does nothing', async () => {
    const p = host('rpm', { install: vi.fn(async () => manual({ reason: 'no-agent', command: "sudo dnf install '/x.rpm'", path: '/x.rpm' })) })
    await upd.showUpdateFile()
    expect(p.showFile).not.toHaveBeenCalled()
    await upd.checkForUpdates(false)
    await upd.startUpdate()
    await upd.installUpdate()
    upd.later()
    expect([update.phase, upd.noticeVisible(), update.manualInstall?.path]).toEqual(['manual', false, '/x.rpm'])
    await upd.checkForUpdates(true)
    expect([update.phase, upd.noticeVisible()]).toEqual(['manual', true])
  })

  it('a failing file manager or package-tool call is reported, never thrown at the page', async () => {
    const p = host('deb', { install: vi.fn(async () => manual()), showFile: vi.fn(async () => { throw 'unsupported' }) })
    await upd.checkForUpdates(false)
    await upd.startUpdate()
    await upd.installUpdate()
    await expect(upd.showUpdateFile()).resolves.toBeUndefined()
    // The file changed after it was verified: deleted on the Rust side, the update is not finished
    p.install.mockImplementation(async () => { throw 'hash-mismatch' })
    await upd.installUpdate()
    expect([update.phase, update.error?.code, update.manualInstall, update.downloaded]).toEqual(['error', 'hash-mismatch', null, null])
  })

  it('every reason has its own words; error details and paths are text, never HTML', async () => {
    expect(upd.manualReasonText(manual({ reason: 'cancelled' }))).toBe(tl('系统授权被取消，没有安装。'))
    expect(upd.manualReasonText(manual({ reason: 'no-agent' }))).toBe(tl('无法请求系统授权（没有 pkexec 或授权代理）。'))
    expect(upd.manualReasonText(manual({ reason: 'no-tool' }))).toBe(tl('没有找到系统的软件包工具。'))
    expect(upd.manualReasonText(manual({ reason: 'failed', code: 100 }))).toBe(tl('系统的软件包工具报告了错误（退出码 {0}）。', [100]))
    expect(upd.manualReasonText(manual({ reason: 'failed', code: null }))).toBe(tl('系统的软件包工具报告了错误。'))
    const hostile = manual({ reason: 'failed', code: 1, detail: 'E: <img src=x onerror=alert(1)>', path: '/home/<b>u</b>/x.deb', command: "sudo apt install '/home/<b>u</b>/x.deb'" })
    host('deb', { install: vi.fn(async () => hostile) })
    await upd.checkForUpdates(false)
    await upd.startUpdate()
    await upd.installUpdate()
    const html = await render()
    expect(html).toContain('E: &lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('/home/&lt;b&gt;u&lt;/b&gt;/x.deb')
    expect(html).not.toMatch(/<img|<b>/)
  })

  it('a hand-install answer for a kind without a package tool is not taken up', async () => {
    const p = host('appimage', { install: vi.fn(async () => manual()) })
    await upd.checkForUpdates(false)
    await upd.startUpdate()
    await upd.installUpdate()
    expect(p.install).toHaveBeenCalledTimes(1)
    expect([update.phase, update.manualInstall]).toEqual(['installing', null])
  })
})

describe('the platform layer on a Linux host', () => {
  it('passes the hand-install answer on and shows the folder with no argument', async () => {
    vi.resetModules()
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    const calls: Array<[string, Record<string, unknown> | undefined]> = []
    let answer: unknown = { kind: 'deb', name: FILES.deb, manual: null }
    tauri.invoke = async (cmd, args) => { calls.push([cmd, args]); return cmd === 'update_install' ? answer : undefined }
    const { updatePlatform } = await import('../../src/platform/update')
    expect(await updatePlatform.install()).toBeNull()
    answer = { kind: 'rpm', name: FILES.rpm, manual: manual({ reason: 'failed', code: 1 }) }
    expect(await updatePlatform.install()).toEqual(manual({ reason: 'failed', code: 1 }))
    answer = { kind: 'appimage', name: FILES.appimage, manual: null }
    expect(await updatePlatform.install()).toBeNull()
    await updatePlatform.showFile()
    expect(calls).toEqual([['update_install', undefined], ['update_install', undefined], ['update_install', undefined], ['update_show_file', undefined]])
  })
})

describe('names and labels', () => {
  it('buttons stay within the label budget (4 Chinese characters, 14 English, 18 German)', () => {
    const { en, de } = buildTables()
    for (const zh of ['复制命令', '显示文件', '已复制']) {
      expect([...zh].length, zh).toBeLessThanOrEqual(4)
      expect(en[zh].length, en[zh]).toBeLessThanOrEqual(14)
      expect(de[zh].length, de[zh]).toBeLessThanOrEqual(18)
    }
  })

  it('the updater, the build script and the packaging script name the same three files', () => {
    const rust = readFileSync(join(ROOT, 'src-tauri/src/update.rs'), 'utf8')
    const build = readFileSync(join(ROOT, 'scripts/linux/build-linux.sh'), 'utf8')
    const pack = readFileSync(join(ROOT, 'scripts/package-release.ps1'), 'utf8')
    for (const suffix of ['linux-x86_64.AppImage', 'linux-amd64.deb', 'linux-x86_64.rpm']) {
      expect(rust, suffix).toContain(`"${suffix}"`)
      expect(build, suffix).toContain(`-${suffix}`)
      expect(pack, suffix).toContain(`VeloPhi-v$Version-${suffix}`)
    }
    // The kinds the Rust side sends are the ones the page knows
    const kinds = /export type UpdateKind = ([^\n]+)/.exec(readFileSync(join(ROOT, 'src/platform/update.ts'), 'utf8'))![1]
    for (const k of ['appimage', 'deb', 'rpm']) expect(kinds).toContain(`'${k}'`)
  })
})
