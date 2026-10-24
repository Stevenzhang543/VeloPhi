/** Lab report HTML: self-contained, escaped, all sections present. */
import { describe, expect, it } from 'vitest'
import type { ReportInput } from '../../src/export/report'
import { buildReportHtml, escapeHtml, isEmbeddedImage } from '../../src/export/report'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function input(): ReportInput {
  return {
    title: '板块模型 <script>alert(1)</script>', description: '物块 & 木板', engineVersion: '26.49.0', hash: 'ab'.repeat(32), generatedAt: '2026/10/24 18:00',
    notes: '实验目的：验证 t₁ = v₀/(a₁ + a₂)',
    parameters: [{ title: '物体', header: ['名称', '质量', '初速度'], rows: [['物块', '1 kg', '4 m/s'], ['木板', '2 kg', '0 m/s']] }],
    screenshots: [{ src: PNG, caption: '关键时刻 1 · t = 0 s' }, { src: 'https://example.com/x.png', caption: '外部图片' }],
    curves: [{ src: PNG, caption: 'v–t 图' }],
    formulas: [{ moment: 't = 0.907 s', situation: '板块模型', formula: '达到共速的时间', theory: '0.907 s', sim: '0.907 s', absError: '6e-13 s', relError: '7e-13', verdict: '一致', verdictClass: 'ok' }],
    events: [{ t: '0.907 s', what: '相对静止（共速）', who: '物块–木板', detail: '' }],
    predictions: [{ target: '首次共速的时刻', predicted: '0.889 s', sim: '0.907 s', formula: '0.907 s', error: '-0.018 s（2%）', grade: '接近', gradeClass: 'warn' }],
    warnings: ['示例提示'], legend: ['精确公式：相对误差 ≤ 1e-6 判为一致。']
  }
}

describe('report', () => {
  it('escapes text and accepts only embedded images', () => {
    expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;')
    expect(isEmbeddedImage(PNG)).toBe(true)
    expect(isEmbeddedImage('https://example.com/a.png')).toBe(false)
    expect(isEmbeddedImage('javascript:alert(1)')).toBe(false)
  })

  it('builds a self-contained document with every section', () => {
    const html = buildReportHtml(input())
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).not.toMatch(/<script/i)
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toMatch(/(src|href)\s*=\s*"(https?:|\/\/|file:)/i)
    expect(html).not.toContain('example.com')
    expect(html).not.toMatch(/@import|url\(\s*['"]?http/i)
    for (const h of ['实验参数', '关键时刻截图', '曲线', '公式对照与误差', '预测与对比', '事件', '提示']) expect(html).toContain(h)
    expect(html).toContain('class="badge ok"')
    expect(html).toContain('class="badge warn"')
    expect(html).toContain('ab'.repeat(32))
    expect(html).toContain('Verity 26.49.0')
    expect(html).toContain('物块 &amp; 木板')
    expect((html.match(/<img /g) ?? []).length).toBe(2)
    expect(html).toContain('@media print')
  })

  it('omits empty sections', () => {
    const r = input()
    r.predictions = []; r.events = []; r.warnings = []; r.curves = []
    const html = buildReportHtml(r)
    expect(html).not.toContain('预测与对比')
    expect(html).not.toContain('<h2>4. 事件')
    expect(html).toContain('<h2>3. 公式对照与误差</h2>')
  })
})
