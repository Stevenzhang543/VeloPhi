/** Store-only ZIP writer: CRC, UTF-8 names, structure readable by a standard reader. */
import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64, crc32, dataUrl, safeZipPath, zipStore } from '../../src/export/zip'
import { readZip, text } from './zipRead'

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array(0))).toBe(0)
  })

  it('writes entries a reader can list and verify', () => {
    const big = new Uint8Array(70000).map((_, i) => (i * 31) & 0xff)
    const zip = zipStore([
      { name: '板块模型_课件包/说明.txt', data: '内容：视频、截图\r\n' },
      { name: '板块模型_课件包/截图/01_t=0s_初始时刻.png', data: big },
      { name: 'a/b/../c.csv', data: 'x,y\n1,2\n' }
    ], new Date(2026, 9, 24, 12, 30, 10))
    const entries = readZip(zip)
    expect([...entries.keys()]).toEqual(['板块模型_课件包/说明.txt', '板块模型_课件包/截图/01_t=0s_初始时刻.png', 'a/b/c.csv'])
    for (const e of entries.values()) {
      expect(e.method).toBe(0)
      expect(e.flags & 0x0800).toBe(0x0800)
    }
    expect(text(entries.get('板块模型_课件包/说明.txt'))).toBe('内容：视频、截图\r\n')
    expect(entries.get('板块模型_课件包/截图/01_t=0s_初始时刻.png')!.data).toEqual(big)
    // DOS date/time of the first local header: 2026-10-24 12:30:10
    const view = new DataView(zip.buffer)
    expect(view.getUint16(12, true)).toBe(((2026 - 1980) << 9) | (10 << 5) | 24)
    expect(view.getUint16(10, true)).toBe((12 << 11) | (30 << 5) | 5)
  })

  it('rejects duplicate and empty names and normalises paths', () => {
    expect(() => zipStore([{ name: 'a.txt', data: '1' }, { name: './a.txt', data: '2' }])).toThrow(/重复/)
    expect(() => safeZipPath('../..')).toThrow()
    expect(safeZipPath('\\x\\y.txt')).toBe('x/y.txt')
  })

  it('round-trips base64', () => {
    const b = new Uint8Array(100001).map((_, i) => (i * 7) & 0xff)
    expect(base64ToBytes(bytesToBase64(b))).toEqual(b)
    expect(base64ToBytes(dataUrl('image/png', b))).toEqual(b)
  })
})
