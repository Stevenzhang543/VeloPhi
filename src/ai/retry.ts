/**
 * The one retry layer of the AI requests (26.63, D238). A request that failed for a passing reason — the service is
 * busy (429 without a quota code), it answered 5xx, the connection dropped — is sent again, at most twice more, after
 * a wait: the time the server asked for in `Retry-After` when it gave one, otherwise exponential backoff with full
 * jitter (so many clients do not retry in step). A wait longer than the cap is not waited for: the error goes to the
 * user with the time in it. A cancelled request ends the wait at once. Everything else (a wrong key, a refused
 * request, the quota, a timeout that already took minutes) is never retried here.
 *
 * Before 26.63 the reading pipeline retried on its own and the chat did not; both now go through this layer.
 */
import type { AiError } from './types'

export interface RetryPolicy { retries: number; baseMs: number; capMs: number; maxServerWaitMs: number }
export const RETRY: RetryPolicy = { retries: 2, baseMs: 800, capMs: 8000, maxServerWaitMs: 30000 }

/** `Retry-After` as milliseconds: seconds ("7", "1.5") or an HTTP date; null when absent or unreadable. */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | null {
  if (!value) return null
  const v = value.trim()
  if (/^\d+(\.\d+)?$/.test(v)) return Math.max(0, Math.round(Number(v) * 1000))
  const at = Date.parse(v)
  return Number.isNaN(at) ? null : Math.max(0, at - now)
}

/** Passing failures: worth another try without changing the request. */
export function isTransient(e: AiError): boolean {
  if (e.code === 'busy' || e.code === 'network') return true
  // 5xx of the service or a gateway; 501 and 505 are not passing
  return e.code === 'server' && (e.status === undefined || (e.status >= 500 && e.status !== 501 && e.status !== 505))
}

/**
 * How long to wait before retry number `attempt` (0 for the first retry); null: do not retry (the server asked for
 * more than `maxServerWaitMs`). `rand` in [0, 1).
 */
export function retryDelay(attempt: number, retryAfterMs: number | null | undefined, rand: () => number = Math.random, p: RetryPolicy = RETRY): number | null {
  if (retryAfterMs !== null && retryAfterMs !== undefined) {
    if (retryAfterMs > p.maxServerWaitMs) return null
    // a little after the time asked for, so the retry does not land on the boundary
    return retryAfterMs + Math.round(rand() * 250)
  }
  const ceiling = Math.min(p.capMs, p.baseMs * 2 ** attempt)
  // full jitter, but never less than a fifth of the ceiling (an immediate retry helps nobody)
  return Math.round(ceiling * (0.2 + 0.8 * rand()))
}

export interface RetryHooks {
  signal?: AbortSignal
  /** Called before each wait: how long, which retry (1-based), and why. */
  onWait?: (ms: number, retry: number, error: AiError) => void
  /** Called when a wait is over (or the run ended). */
  onResume?: () => void
  rand?: () => number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  policy?: RetryPolicy
}

/** Wait `ms`; rejects with the signal's reason as soon as it aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('aborted', 'AbortError')); return }
    const t = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve() }, ms)
    const stop = () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')) }
    signal?.addEventListener('abort', stop, { once: true })
  })
}

/** Run `once(attempt)`; on a passing failure wait and run it again, up to the policy's retries. */
export async function withRetry<T>(once: (attempt: number) => Promise<T>, isAiError: (e: unknown) => e is AiError, h: RetryHooks = {}): Promise<T> {
  const p = h.policy ?? RETRY
  for (let attempt = 0; ; attempt++) {
    try {
      return await once(attempt)
    } catch (e) {
      if (!isAiError(e) || !isTransient(e) || attempt >= p.retries || h.signal?.aborted) throw e
      const wait = retryDelay(attempt, e.retryAfterMs, h.rand, p)
      if (wait === null) throw e
      h.onWait?.(wait, attempt + 1, e)
      try { await (h.sleep ?? sleep)(wait, h.signal) } catch { h.onResume?.(); throw e } finally { h.onResume?.() }
    }
  }
}
