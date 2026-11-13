/**
 * 26.63 (D236): share links — a scene survives the round trip through the address (compressed and plain), options are
 * read, damaged links are refused, and a real template's link stays short.
 */
import { describe, expect, it } from 'vitest'
import { SHARE_LONG, SHARE_PREFIX, buildShareLink, decodeShare, encodeShare } from '../src/app/share'
import { buildTemplate, TEMPLATES } from '../src/templates'
import { parseScene, serializeScene } from '../src/core/scene/io'

describe('share links (26.63)', () => {
  it('round-trips a scene through the link, with non-ASCII names', async () => {
    const scene = buildTemplate('rope-break-pendulum', { Tmax: 8.5 })
    scene.name = '摆线被拉断 – Faden reißt ✓'
    const text = serializeScene(scene)
    const link = await buildShareLink(text, { mode: 'simulate', play: true })
    expect(link).toContain(SHARE_PREFIX)
    const back = await decodeShare(link)
    expect(back).not.toBeNull()
    expect(back!.text).toBe(text)
    expect(back!.mode).toBe('simulate')
    expect(back!.play).toBe(true)
    const again = parseScene(back!.text).scene
    expect(again.name).toBe(scene.name)
    expect(serializeScene(again)).toBe(text)
  })

  it('reads the fragment alone and the bare data, compressed or not', async () => {
    const text = serializeScene(buildTemplate('incline'))
    const data = await encodeShare(text)
    expect(data.startsWith('z1.')).toBe(true)
    expect((await decodeShare(`${SHARE_PREFIX}${data}`))!.text).toBe(text)
    expect((await decodeShare(data))!.text).toBe(text)
    // the uncompressed form (a browser without CompressionStream wrote it)
    const bytes = new TextEncoder().encode(text)
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    const plain = `u1.${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
    expect((await decodeShare(`https://example.org/app/${SHARE_PREFIX}${plain}&m=build`))!).toEqual({ text, mode: 'build', play: false })
  })

  it('is no link, or a damaged one', async () => {
    expect(await decodeShare('质量为 2 kg 的物块从斜面滑下')).toBeNull()
    expect(await decodeShare('https://example.org/#other=1')).toBeNull()
    const data = await encodeShare(serializeScene(buildTemplate('incline')))
    await expect(decodeShare(`${SHARE_PREFIX}${data.slice(0, data.length - 40)}`)).rejects.toBeTruthy()
  })

  it('compression keeps the links of the templates short', async () => {
    let longest = 0
    for (const t of TEMPLATES) {
      const text = serializeScene(buildTemplate(t.id))
      const data = await encodeShare(text)
      longest = Math.max(longest, data.length)
      expect(data.length, t.id).toBeLessThan(text.length)
    }
    // every built-in template fits well under the length at which the dialog warns (the many-body scenes are the largest)
    expect(longest).toBeLessThan(SHARE_LONG * 4)
  })
})
