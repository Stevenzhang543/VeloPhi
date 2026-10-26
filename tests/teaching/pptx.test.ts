/** PPTX courseware: package structure, slide count, embedded media and text. */
import { describe, expect, it } from 'vitest'
import { buildPptx, fitBox, takeFitting } from '../../src/export/pptx'
import { PNG_1x1, readZip, text } from './zipRead'

const img = (w: number, h: number) => ({ png: PNG_1x1, width: w, height: h })

describe('pptx', () => {
  it('fits boxes and splits formula columns', () => {
    const b = fitBox(1600, 900, { x: 0, y: 0, w: 8, h: 6 })
    expect(b.w).toBeCloseTo(8)
    expect(b.h).toBeCloseTo(4.5)
    expect(b.y).toBeCloseTo(0.75)
    const items = [img(520, 250), img(520, 250), img(520, 250)]
    const r = takeFitting(items, 4, 4.2, 0.15)
    expect(r.now.length).toBe(2)
    expect(r.rest.length).toBe(1)
    // An item taller than the column is still taken alone (and scaled down when drawn)
    expect(takeFitting([img(100, 1000)], 4, 2, 0.1).now.length).toBe(1)
  })

  it('builds title, moment, continuation and video slides', async () => {
    const formulas = Array.from({ length: 6 }, (_, i) => ({ ...img(520, 250), title: `公式${i}` }))
    const bytes = await buildPptx({
      title: '板块模型', description: '物块滑上长木板', meta: ['VeloPhi 26.49.0', 'SHA-256 abc'],
      moments: [
        { title: '关键时刻 1 · t = 0 s', subtitle: '初始时刻', screenshot: img(1280, 720), formulas: [], readouts: [{ label: '物块 速度', value: '4 m/s' }] },
        { title: '关键时刻 2 · t = 0.907 s', subtitle: '物块–木板 相对静止（共速）', screenshot: img(1280, 720), formulas, readouts: [{ label: '物块 速度', value: '0.4444 m/s' }, { label: '木板 速度', value: '0.4444 m/s' }] }
      ],
      video: { data: new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), extension: 'mp4', cover: img(1280, 720) }
    })
    const zip = readZip(bytes)
    expect(zip.has('[Content_Types].xml')).toBe(true)
    expect(zip.has('ppt/presentation.xml')).toBe(true)
    const slides = [...zip.keys()].filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    // Title + 2 moments + ≥1 continuation + video
    expect(slides.length).toBeGreaterThanOrEqual(5)
    const all = slides.map(s => text(zip.get(s))).join('\n')
    expect(all).toContain('关键时刻 2 · t = 0.907 s')
    expect(all).toContain('0.4444 m/s')
    expect(all).toContain('（续）')
    expect(all).toContain('仿真视频')
    const media = [...zip.keys()].filter(k => k.startsWith('ppt/media/'))
    expect(media.some(k => k.endsWith('.mp4'))).toBe(true)
    expect(media.filter(k => k.endsWith('.png')).length).toBeGreaterThanOrEqual(3)
    expect(text(zip.get('[Content_Types].xml'))).toContain('video/mp4')
  })
})
