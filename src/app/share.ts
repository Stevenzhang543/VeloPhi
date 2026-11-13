/**
 * Share links (26.63, D236): the whole scene travels in the address itself — `#s=z1.<data>` — so a link opens the same
 * scene in the web version or, pasted into the desktop app, there; nothing is uploaded and no account is needed.
 *
 * Format: `z1.` + base64url of the raw-deflate of the scene file's UTF-8 text, or `u1.` + base64url of the text when
 * the browser has no CompressionStream. Options follow as `&m=simulate` (open in the simulate mode) and `&p=1` (start
 * playing). A link is only as long as the scene; very long ones (some chat programs cut addresses) say so.
 */
import { OFFICIAL_ORIGIN } from '../ai/account'
import { isDesktop } from '../platform/files'

export const SHARE_PREFIX = '#s='
/** Addresses longer than this are cut by some chat programs and mail clients. */
export const SHARE_LONG = 8000

const b64url = (bytes: Uint8Array): string => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64url = (text: string): Uint8Array => {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
type Streams = { CompressionStream?: new (f: string) => TransformStream<Uint8Array, Uint8Array>; DecompressionStream?: new (f: string) => TransformStream<Uint8Array, Uint8Array> }
async function pipe(bytes: Uint8Array, t: TransformStream<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  const w = t.writable.getWriter()
  void w.write(bytes).then(() => w.close()).catch(() => {})
  const parts: Uint8Array[] = []
  const r = t.readable.getReader()
  for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value) }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

/** The data part of a share link for a scene file's text. */
export async function encodeShare(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const C = (globalThis as Streams).CompressionStream
  if (C) { try { return `z1.${b64url(await pipe(bytes, new C('deflate-raw')))}` } catch { /* plain below */ } }
  return `u1.${b64url(bytes)}`
}

export interface Shared { text: string; mode: string | null; play: boolean }

/**
 * Read a share link, an address fragment or the bare data; null when it is none. Throws when it is one but cannot be
 * read (cut off, or compressed and this browser cannot decompress).
 */
export async function decodeShare(input: string): Promise<Shared | null> {
  const raw = input.trim()
  const at = raw.indexOf(SHARE_PREFIX)
  const body = at >= 0 ? raw.slice(at + SHARE_PREFIX.length) : /^[zu]1\./.test(raw) ? raw : null
  if (body === null) return null
  const [data, ...opts] = body.split('&')
  const opt = new Map(opts.map(o => { const k = o.indexOf('='); return [k < 0 ? o : o.slice(0, k), k < 0 ? '' : o.slice(k + 1)] as [string, string] }))
  const kind = data.slice(0, 3), payload = data.slice(3)
  let bytes = fromB64url(payload)
  if (kind === 'z1.') {
    const D = (globalThis as Streams).DecompressionStream
    if (!D) throw new Error('no DecompressionStream')
    bytes = await pipe(bytes, new D('deflate-raw'))
  } else if (kind !== 'u1.') return null
  return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), mode: opt.get('m') ?? null, play: opt.get('p') === '1' }
}

/** Where a share link points: this page on the web, the public web version from the desktop and Android apps. */
export function shareBase(): string {
  if (!isDesktop && typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) return `${location.origin}${location.pathname}`
  return `${OFFICIAL_ORIGIN}/online/`
}

/** A share link for a scene file's text. */
export async function buildShareLink(text: string, o: { mode?: string | null; play?: boolean } = {}): Promise<string> {
  return `${shareBase()}${SHARE_PREFIX}${await encodeShare(text)}${o.mode ? `&m=${o.mode}` : ''}${o.play ? '&p=1' : ''}`
}
