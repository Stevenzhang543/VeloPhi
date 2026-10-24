/**
 * Minimal ZIP writer (method 0, "stored"): enough to bundle the courseware package into one file without a
 * compression library. Media (MP4, PNG) is already compressed, so storing costs little. File names are
 * written as UTF-8 with general-purpose flag bit 11 set, which Windows Explorer, macOS Archive Utility,
 * 7-Zip and WPS read correctly for Chinese names. No ZIP64: one archive stays below 4 GiB and 65 535 entries.
 *
 * Pure (no DOM), so the tests can read the archive back.
 */

/** A file to store in the archive. */
export interface ZipEntry {
  /** Path inside the archive, '/' separated (folders are implied by the paths). */
  name: string
  /** Contents; strings are written as UTF-8. */
  data: Uint8Array | string
  /** Modification time stored in the entry (default: the archive time). */
  date?: Date
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/** CRC-32 (IEEE 802.3), as stored in ZIP entries. */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const utf8 = new TextEncoder()

/** UTF-8 bytes of a string; byte arrays pass through. */
export function toBytes(data: Uint8Array | string): Uint8Array {
  return typeof data === 'string' ? utf8.encode(data) : data
}

function dosTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, Math.min(2107, d.getFullYear()))
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  }
}

/** Normalise an archive path: forward slashes, no leading slash, no '.' or '..' segments, no empty names. */
export function safeZipPath(name: string): string {
  const parts = name.replace(/\\/g, '/').split('/').filter(p => p !== '' && p !== '.' && p !== '..')
  if (parts.length === 0) throw new Error('压缩包内的文件名为空')
  return parts.join('/')
}

/** Build a stored (uncompressed) ZIP archive. */
export function zipStore(entries: ZipEntry[], now: Date = new Date()): Uint8Array {
  if (entries.length > 0xffff) throw new Error('文件数量过多，无法打包为 ZIP')
  const items = entries.map(e => {
    const name = utf8.encode(safeZipPath(e.name))
    const data = toBytes(e.data)
    return { name, data, crc: crc32(data), dos: dosTime(e.date ?? now) }
  })
  const seen = new Set<string>()
  for (const e of entries) {
    const key = safeZipPath(e.name)
    if (seen.has(key)) throw new Error(`压缩包内文件名重复：${key}`)
    seen.add(key)
  }
  let localSize = 0, centralSize = 0
  for (const it of items) { localSize += 30 + it.name.length + it.data.length; centralSize += 46 + it.name.length }
  const total = localSize + centralSize + 22
  if (localSize > 0xffffffff || total > 0xffffffff) throw new Error('课件包超过 4 GB，无法打包为 ZIP；请改为逐个保存文件')
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  let p = 0
  const offsets: number[] = []
  const FLAGS = 0x0800 // Bit 11: names are UTF-8
  for (const it of items) {
    offsets.push(p)
    view.setUint32(p, 0x04034b50, true)
    view.setUint16(p + 4, 20, true) // Version needed: 2.0
    view.setUint16(p + 6, FLAGS, true)
    view.setUint16(p + 8, 0, true) // Method 0: stored
    view.setUint16(p + 10, it.dos.time, true)
    view.setUint16(p + 12, it.dos.date, true)
    view.setUint32(p + 14, it.crc, true)
    view.setUint32(p + 18, it.data.length, true)
    view.setUint32(p + 22, it.data.length, true)
    view.setUint16(p + 26, it.name.length, true)
    view.setUint16(p + 28, 0, true)
    out.set(it.name, p + 30)
    out.set(it.data, p + 30 + it.name.length)
    p += 30 + it.name.length + it.data.length
  }
  const cdStart = p
  items.forEach((it, i) => {
    view.setUint32(p, 0x02014b50, true)
    view.setUint16(p + 4, 20, true) // Version made by: 2.0, MS-DOS attributes
    view.setUint16(p + 6, 20, true)
    view.setUint16(p + 8, FLAGS, true)
    view.setUint16(p + 10, 0, true)
    view.setUint16(p + 12, it.dos.time, true)
    view.setUint16(p + 14, it.dos.date, true)
    view.setUint32(p + 16, it.crc, true)
    view.setUint32(p + 20, it.data.length, true)
    view.setUint32(p + 24, it.data.length, true)
    view.setUint16(p + 28, it.name.length, true)
    view.setUint16(p + 30, 0, true) // Extra field length
    view.setUint16(p + 32, 0, true) // Comment length
    view.setUint16(p + 34, 0, true) // Disk number
    view.setUint16(p + 36, 0, true) // Internal attributes
    view.setUint32(p + 38, 0, true) // External attributes
    view.setUint32(p + 42, offsets[i], true)
    out.set(it.name, p + 46)
    p += 46 + it.name.length
  })
  view.setUint32(p, 0x06054b50, true)
  view.setUint16(p + 4, 0, true)
  view.setUint16(p + 6, 0, true)
  view.setUint16(p + 8, items.length, true)
  view.setUint16(p + 10, items.length, true)
  view.setUint32(p + 12, p - cdStart, true)
  view.setUint32(p + 16, cdStart, true)
  view.setUint16(p + 20, 0, true)
  return out
}

// ---- Base64 ----

/** Base64 of a byte array (browser and Node). */
export function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)))
  return btoa(s)
}

/** Bytes of a base64 string (an optional `data:…;base64,` prefix is skipped). */
export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64.slice(b64.indexOf(',') + 1))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/** `data:` URL of a byte array. */
export function dataUrl(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${bytesToBase64(bytes)}`
}
