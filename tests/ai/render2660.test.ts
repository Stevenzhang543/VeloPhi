/**
 * 26.60 (D204): Copilot answers in the answer → working → explanation layout. A list whose items carry a display
 * formula on the next line stays one list (the formula belongs to the item above), and text before the first item is
 * a paragraph.
 */
import { describe, expect, it } from 'vitest'
import { renderAnswer } from '../../src/ai/copilot/render'

describe('Copilot answer layout (26.60)', () => {
  it('keeps a list together when an item continues with a display formula', () => {
    const html = renderAnswer('**过程**\n- 受力：重力、支持力、摩擦力\n- 沿斜面：\n$$mg\\sin\\theta - \\mu mg\\cos\\theta = ma$$\n- 匀加速：$v = at$')
    expect(html.startsWith('<p><b>过程</b></p><ul>')).toBe(true)
    expect(html.match(/<li>/g)?.length).toBe(3)
    expect(html).toContain('katex-display')
    // The formula sits inside the second item
    const second = html.split('<li>')[2]
    expect(second).toContain('katex-display')
    expect(html).not.toContain('- 匀加速')
  })

  it('numbered answers, then a paragraph after a blank line', () => {
    const html = renderAnswer('**答案**\n\n1. 速度：**v = 3.27 m/s**\n2. 加速度：**a = 3.27 m/s²**\n\n其余见过程。')
    expect(html).toContain('<ol><li>速度：<b>v = 3.27 m/s</b></li><li>加速度：<b>a = 3.27 m/s²</b></li></ol>')
    expect(html.endsWith('<p>其余见过程。</p>')).toBe(true)
  })

  it('a heading line is followed by its own block', () => {
    expect(renderAnswer('## 解释\n- 一\n- 二')).toBe('<p><b>解释</b></p><ul><li>一</li><li>二</li></ul>')
  })

  it('still escapes markup in items and continuation lines', () => {
    const html = renderAnswer('- a\n<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})
