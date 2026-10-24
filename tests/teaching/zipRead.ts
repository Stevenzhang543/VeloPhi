/** Test helper: read a ZIP archive (stored or deflated entries) through its central directory. */
import { inflateRawSync } from 'node:zlib'
import { crc32 } from '../../src/export/zip'

/** A central-directory entry with its (inflated) data. */
export interface ReadEntry { name: string; method: number; flags: number; crc: number; data: Uint8Array }

/** Every entry of an archive by name; throws on structural or CRC errors. */
export function readZip(buf: Uint8Array): Map<string, ReadEntry> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('no end of central directory')
  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  const out = new Map<string, ReadEntry>()
  const dec = new TextDecoder()
  for (let k = 0; k < count; k++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('bad central header')
    const flags = view.getUint16(p + 8, true)
    const method = view.getUint16(p + 10, true)
    const crc = view.getUint32(p + 16, true)
    const csize = view.getUint32(p + 20, true)
    const nlen = view.getUint16(p + 28, true), xlen = view.getUint16(p + 30, true), clen = view.getUint16(p + 32, true)
    const off = view.getUint32(p + 42, true)
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen))
    if (view.getUint32(off, true) !== 0x04034b50) throw new Error('bad local header')
    const lnlen = view.getUint16(off + 26, true), lxlen = view.getUint16(off + 28, true)
    const raw = buf.subarray(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize)
    const data = method === 0 ? raw : new Uint8Array(inflateRawSync(raw))
    if (crc32(data) !== crc) throw new Error(`crc mismatch ${name}`)
    out.set(name, { name, method, flags, crc, data })
    p += 46 + nlen + xlen + clen
  }
  return out
}

/** UTF-8 text of an entry ('' when it is missing). */
export const text = (e: ReadEntry | undefined) => (e ? new TextDecoder().decode(e.data) : '')

/** A valid 1 × 1 PNG. */
export const PNG_1x1 = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
