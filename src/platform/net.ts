/**
 * Network requests of the AI features and the app sign-in (26.59, D149).
 *
 * Desktop: the Rust command `net_request` (no browser CORS rules, the system proxy of Windows, https only plus
 * http to this computer). Web: `fetch` (the official AI and sign-in are same-origin on velophi.whitelists.top;
 * the user's own provider must allow cross-origin requests). Bodies are text (JSON).
 */
import { isDesktop } from './files'

export interface NetRequest {
  url: string
  method?: 'GET' | 'POST' | 'DELETE'
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  /** Web only: send the site's cookies (same-origin official endpoints). */
  credentials?: boolean
  /** Desktop only: an HTTP(S) proxy for this request; empty = the system proxy. */
  proxy?: string
  signal?: AbortSignal
}

export interface NetResponse {
  status: number
  contentType: string
  retryAfter: string | null
  body: string
}

/** A failed request (no HTTP status): `timeout`, `connect`, `aborted`, `blocked` (CORS or a forbidden address) or `network`. */
export class NetError extends Error {
  constructor(public kind: 'timeout' | 'connect' | 'aborted' | 'blocked' | 'network', message: string) {
    super(message)
  }
}

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
let invokeFn: Invoke | null = null
async function tauriInvoke(): Promise<Invoke> {
  if (!invokeFn) invokeFn = (await import('@tauri-apps/api/core')).invoke as Invoke
  return invokeFn
}

/** Replaceable transport (tests, the mock AI of the browser checks). */
export let transport: (req: NetRequest) => Promise<NetResponse> = defaultTransport

export function setTransport(t: ((req: NetRequest) => Promise<NetResponse>) | null) { transport = t ?? defaultTransport }

export function netRequest(req: NetRequest): Promise<NetResponse> {
  if (req.signal?.aborted) return Promise.reject(new NetError('aborted', 'aborted'))
  const run = transport(req)
  if (!req.signal) return run
  // The desktop request cannot be interrupted; its answer is dropped when the caller gave up.
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new NetError('aborted', 'aborted'))
    req.signal!.addEventListener('abort', onAbort, { once: true })
    run.then(r => { req.signal!.removeEventListener('abort', onAbort); resolve(r) }, e => { req.signal!.removeEventListener('abort', onAbort); reject(e) })
  })
}

async function defaultTransport(req: NetRequest): Promise<NetResponse> {
  if (isDesktop) {
    const invoke = await tauriInvoke()
    try {
      return await invoke<NetResponse>('net_request', {
        request: { url: req.url, method: req.method ?? 'GET', headers: req.headers ?? {}, body: req.body ?? null, timeoutMs: req.timeoutMs ?? 120000, proxy: req.proxy || null }
      })
    } catch (e) {
      const m = String(e)
      throw new NetError(m === 'timeout' ? 'timeout' : m === 'connect' ? 'connect' : /only https/.test(m) ? 'blocked' : 'network', m)
    }
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs ?? 120000)
  const onAbort = () => ctrl.abort()
  req.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const r = await fetch(req.url, { method: req.method ?? 'GET', headers: req.headers, body: req.body, credentials: req.credentials ? 'same-origin' : 'omit', signal: ctrl.signal, cache: 'no-store' })
    return { status: r.status, contentType: r.headers.get('content-type') ?? '', retryAfter: r.headers.get('retry-after'), body: await r.text() }
  } catch (e) {
    if (req.signal?.aborted) throw new NetError('aborted', 'aborted')
    if (ctrl.signal.aborted) throw new NetError('timeout', 'timeout')
    // A browser reports CORS refusals and unreachable hosts the same way.
    throw new NetError('blocked', e instanceof Error ? e.message : String(e))
  } finally {
    clearTimeout(timer)
    req.signal?.removeEventListener('abort', onAbort)
  }
}

/** Open an https page in the default browser (desktop) or a new tab (web). */
export async function openExternal(url: string): Promise<void> {
  if (isDesktop) {
    const invoke = await tauriInvoke()
    await invoke('open_external', { url })
    return
  }
  window.open(url, '_blank', 'noopener')
}
