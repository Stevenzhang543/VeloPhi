/**
 * Signing in with the Whitelists account (26.59, D150–D151).
 *
 * Desktop (and any page not served by velophi.whitelists.top): an app token from the device authorization flow
 * (approve in the browser) or from username and password; kept on this computer. Web build on
 * velophi.whitelists.top: the website's own sign-in cookie (same origin), no token.
 */
import { reactive } from 'vue'
import { tl } from '../i18n'
import { isDesktop } from '../platform/files'
import { NetError, netRequest, openExternal } from '../platform/net'
import type { NetResponse } from '../platform/net'

export const OFFICIAL_ORIGIN = 'https://velophi.whitelists.top'
const STORE = 'velophi.account'

/** The web build served by the website itself uses the site's cookie session. */
export const cookieMode = !isDesktop && typeof location !== 'undefined' && location.origin === OFFICIAL_ORIGIN

export interface AccountUser { id: number; username: string; isAdmin: boolean }
export interface AiInfo {
  enabled: boolean
  model: string | null
  vision: boolean
  /** 26.59 fix: the provider family behind the official AI ('deepseek' takes the thinking switch). */
  provider?: string
  /** 26.59 fix: whether the server passes the thinking switch and the thinking text through. */
  thinking?: boolean
  usage?: { requests: number; tokens: number }
  limits?: { requests: number; tokens: number; resetsAt?: string }
}
export interface DeviceSignIn { userCode: string; url: string; expiresAt: number; deviceCode: string; interval: number }

export const account = reactive({
  user: null as AccountUser | null,
  token: '',
  expiresAt: '',
  ai: null as AiInfo | null,
  device: null as DeviceSignIn | null,
  busy: false,
  error: '',
  /** The last /me answer arrived (false: offline or the server was not reached). */
  checked: false
})

function save() {
  try {
    if (account.token) localStorage.setItem(STORE, JSON.stringify({ token: account.token, expiresAt: account.expiresAt, user: account.user }))
    else localStorage.removeItem(STORE)
  } catch { /* storage unavailable */ }
}

export function loadAccount() {
  if (cookieMode) return
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? 'null') as { token?: string; expiresAt?: string; user?: AccountUser } | null
    if (raw && typeof raw.token === 'string' && /^[a-f0-9]{64}$/.test(raw.token) && (!raw.expiresAt || Date.parse(raw.expiresAt) > Date.now())) {
      account.token = raw.token
      account.expiresAt = raw.expiresAt ?? ''
      account.user = raw.user ?? null
    } else if (raw) localStorage.removeItem(STORE)
  } catch { /* ignore */ }
}

/** Signed in: with a token, or (web on the website) with the site's session. */
export function signedIn(): boolean { return !!account.user && (cookieMode || !!account.token) }

/** Base URL of the official API. */
export function officialBase(): string { return cookieMode ? '' : OFFICIAL_ORIGIN }

/** Headers of an official request. */
export function officialHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = {}
  if (json) h['content-type'] = 'application/json'
  if (!cookieMode && account.token) h.authorization = `Bearer ${account.token}`
  return h
}

/** A request to the official server; `credentials` for the cookie mode. */
export function official(path: string, init: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; timeoutMs?: number; signal?: AbortSignal; auth?: boolean } = {}): Promise<NetResponse> {
  const headers = init.auth === false ? (init.body !== undefined ? { 'content-type': 'application/json' } : {}) : officialHeaders(init.body !== undefined)
  return netRequest({ url: officialBase() + path, method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), timeoutMs: init.timeoutMs ?? 20000, credentials: cookieMode, signal: init.signal })
}

function json<T>(r: NetResponse): T | null {
  try { return JSON.parse(r.body) as T } catch { return null }
}

/** A readable sentence for a failed sign-in request. */
export function netMessage(e: unknown): string {
  if (e instanceof NetError) {
    if (e.kind === 'timeout') return tl('连接 whitelists.top 超时')
    if (e.kind === 'blocked') return tl('无法连接 whitelists.top（网页版只能在 velophi.whitelists.top 上登录）')
    return tl('无法连接 whitelists.top，请检查网络')
  }
  return e instanceof Error ? e.message : String(e)
}

/** A readable sentence for an unexpected answer of the sign-in endpoints (404: the website is not updated yet). */
function serverMessage(status: number, code?: string, error?: string): string {
  if (code === 'not_migrated' || status === 404) return tl('服务器尚未开通 VeloΦ 登录')
  if (status >= 500) return tl('whitelists.top 暂时不可用（{0}），请稍后再试', [status])
  return error ?? tl('登录失败（{0}）', [status])
}

function clientName(): string {
  const os = typeof navigator !== 'undefined' ? (/Windows/.test(navigator.userAgent) ? 'Windows' : /Mac/.test(navigator.userAgent) ? 'macOS' : /Linux/.test(navigator.userAgent) ? 'Linux' : '') : ''
  return `VeloΦ 26.59${isDesktop ? tl(' 桌面版') : tl(' 网页版')}${os ? ` · ${os}` : ''}`
}

function adopt(data: { accessToken: string; expiresAt: string; user: AccountUser }) {
  account.token = data.accessToken
  account.expiresAt = data.expiresAt
  account.user = data.user
  account.error = ''
  save()
}

/** Ask the server who is signed in and the official AI's state and usage (silent on network errors). */
export async function refreshAccount(): Promise<void> {
  if (!cookieMode && !account.token) { account.user = null; account.ai = await aiInfo(); return }
  try {
    const r = await official('/api/velophi/app/me')
    if (r.status === 200) {
      const d = json<{ user: AccountUser; ai: AiInfo }>(r)
      if (d) { account.user = d.user; account.ai = d.ai; account.checked = true; save() }
    } else if (r.status === 401) {
      // Token expired, revoked or the password was changed
      account.user = null
      account.token = ''
      save()
      account.ai = await aiInfo()
      account.checked = true
    }
  } catch { account.checked = false }
}

async function aiInfo(): Promise<AiInfo | null> {
  try {
    const r = await official('/api/velophi/ai/info', { auth: false })
    return r.status === 200 ? json<AiInfo>(r) : null
  } catch { return null }
}

let pollTimer: ReturnType<typeof setTimeout> | null = null

/** Start signing in in the browser: show the code, open the approval page, wait for the approval. */
export async function startDeviceSignIn(): Promise<void> {
  cancelDeviceSignIn()
  account.busy = true
  account.error = ''
  try {
    const r = await official('/api/velophi/app/device', { method: 'POST', body: { client: clientName() }, auth: false })
    const d = json<{ deviceCode: string; userCode: string; verificationUriComplete: string; expiresIn: number; interval: number; error?: string; code?: string }>(r)
    if (r.status !== 201 || !d) throw new Error(serverMessage(r.status, d?.code, d?.error))
    account.device = { userCode: d.userCode, url: d.verificationUriComplete, expiresAt: Date.now() + d.expiresIn * 1000, deviceCode: d.deviceCode, interval: Math.max(2, d.interval) }
    await openExternal(d.verificationUriComplete).catch(() => { /* the link is shown and can be copied */ })
    schedulePoll()
  } catch (e) {
    account.error = netMessage(e)
  } finally {
    account.busy = false
  }
}

function schedulePoll() {
  const dev = account.device
  if (!dev) return
  pollTimer = setTimeout(() => { void poll() }, dev.interval * 1000)
}

async function poll() {
  const dev = account.device
  if (!dev) return
  if (Date.now() > dev.expiresAt) { account.device = null; account.error = tl('代码已过期，请重新登录'); return }
  try {
    const r = await official('/api/velophi/app/token', { method: 'POST', body: { deviceCode: dev.deviceCode }, auth: false })
    const d = json<{ accessToken: string; expiresAt: string; user: AccountUser; code?: string }>(r)
    if (account.device !== dev) return
    if (r.status === 200 && d) { account.device = null; adopt(d); await refreshAccount(); return }
    if (r.status === 428) { schedulePoll(); return }
    if (r.status === 429) { dev.interval += 2; schedulePoll(); return }
    account.device = null
    account.error = r.status === 403 ? tl('已在浏览器中拒绝登录') : r.status === 410 ? tl('代码已过期，请重新登录') : tl('登录未完成，请重试')
  } catch {
    // Network hiccup: keep waiting until the code expires
    if (account.device === dev) schedulePoll()
  }
}

export function cancelDeviceSignIn() {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = null
  account.device = null
}

/** Sign in with the website's username and password. */
export async function passwordSignIn(username: string, password: string): Promise<boolean> {
  account.busy = true
  account.error = ''
  try {
    const r = await official('/api/velophi/app/login', { method: 'POST', body: { username: username.trim(), password, client: clientName() }, auth: false })
    const d = json<{ accessToken: string; expiresAt: string; user: AccountUser; code?: string; error?: string }>(r)
    if (r.status === 200 && d) { adopt(d); await refreshAccount(); return true }
    account.error = r.status === 401 ? tl('用户名或密码错误') : r.status === 429 ? tl('尝试次数过多，请稍后再试') : serverMessage(r.status, d?.code, d?.error)
    return false
  } catch (e) {
    account.error = netMessage(e)
    return false
  } finally {
    account.busy = false
  }
}

/** Sign out: revoke the token on the server (best effort) and forget it here. */
export async function signOut(): Promise<void> {
  cancelDeviceSignIn()
  if (account.token) await official('/api/velophi/app/logout', { method: 'POST', body: {} }).catch(() => null)
  account.token = ''
  account.expiresAt = ''
  account.user = null
  save()
  account.ai = await aiInfo()
}
