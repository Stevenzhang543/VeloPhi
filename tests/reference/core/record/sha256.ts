/** SHA-256 (FIPS 180-4), synchronous and dependency-free, used to fingerprint recordings. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
])

const LITTLE_ENDIAN = new Uint8Array(new Float64Array([1]).buffer)[7] === 0x3f

/** Incremental SHA-256 hasher. */
export class Sha256 {
  private h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  private buf = new Uint8Array(64)
  private bufLen = 0
  private total = 0
  private w = new Uint32Array(64)

  update(data: Uint8Array): this {
    let i = 0
    this.total += data.length
    while (i < data.length) {
      // Whole blocks straight from the input when nothing is buffered
      if (this.bufLen === 0 && data.length - i >= 64) { this.block(data.subarray(i, i + 64)); i += 64; continue }
      const take = Math.min(64 - this.bufLen, data.length - i)
      this.buf.set(data.subarray(i, i + take), this.bufLen)
      this.bufLen += take; i += take
      if (this.bufLen === 64) { this.block(this.buf); this.bufLen = 0 }
    }
    return this
  }

  /** Feed the little-endian IEEE-754 bytes of the values (on little-endian hosts, the array's own bytes). */
  updateFloat64(values: Float64Array): this {
    if (LITTLE_ENDIAN) return this.update(new Uint8Array(values.buffer, values.byteOffset, values.byteLength))
    const bytes = new Uint8Array(values.length * 8)
    const view = new DataView(bytes.buffer)
    for (let k = 0; k < values.length; k++) view.setFloat64(8 * k, values[k], true)
    return this.update(bytes)
  }

  /** Finish and return the 32-byte digest; the hasher cannot be updated afterwards. */
  digest(): Uint8Array {
    const bits = this.total * 8
    const pad = new Uint8Array(((this.bufLen < 56 ? 56 : 120) - this.bufLen) + 8)
    pad[0] = 0x80
    const view = new DataView(pad.buffer)
    view.setUint32(pad.length - 8, Math.floor(bits / 0x100000000), false)
    view.setUint32(pad.length - 4, bits >>> 0, false)
    this.update(pad)
    const out = new Uint8Array(32)
    const ov = new DataView(out.buffer)
    for (let i = 0; i < 8; i++) ov.setUint32(4 * i, this.h[i], false)
    return out
  }

  /** Finish and return the digest as lowercase hex; the hasher cannot be updated afterwards. */
  digestHex(): string { return toHex(this.digest()) }

  private block(b: Uint8Array) {
    const w = this.w, H = this.h
    for (let i = 0; i < 16; i++) w[i] = (b[4 * i] << 24) | (b[4 * i + 1] << 16) | (b[4 * i + 2] << 8) | b[4 * i + 3]
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2]
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }
    let a = H[0] | 0, bb = H[1] | 0, c = H[2] | 0, d = H[3] | 0, e = H[4] | 0, f = H[5] | 0, g = H[6] | 0, h = H[7] | 0
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const maj = (a & bb) ^ (a & c) ^ (bb & c)
      const t2 = (S0 + maj) | 0
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0
    }
    H[0] += a; H[1] += bb; H[2] += c; H[3] += d
    H[4] += e; H[5] += f; H[6] += g; H[7] += h
  }
}

/** Lowercase hex of bytes. */
export function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

/** SHA-256 of the bytes as lowercase hex. */
export function sha256Hex(data: Uint8Array): string { return new Sha256().update(data).digestHex() }
