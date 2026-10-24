/** Formula card markup and font-face selection (the browser part is checked in Chromium). */
import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../../src/templates'
import { simulate } from '../../src/core/solver/simulation'
import { recognize } from '../../src/formula/situations'
import { cardsForMoment } from '../../src/export/moments'
import type { FaceRule } from '../../src/export/formulaImage'
import { cardCss, cardHtml, parseUnicodeRange, parseWeight, pickFontSource, relErrorText, selectFaces, shownCards, splitFamilies } from '../../src/export/formulaImage'
import { presetChoice } from '../../src/units/units'

describe('formula card markup', () => {
  const rec = simulate(buildTemplate('board-block'))
  const sits = recognize(rec)
  const t = rec.events.find(e => e.changes.some(c => c.type === 'stick'))!.t
  const cards = shownCards(cardsForMoment(sits, t, 6))

  it('renders title, verdict, KaTeX and values in display units', () => {
    const a1 = cards.find(c => c.formula.id === 'bb.a1')!
    const html = cardHtml(a1, { digits: 4, units: presetChoice('lab'), theme: 'light', background: 'white', caption: 't = 0.907 s' })
    expect(html).toContain('物块的加速度大小')
    expect(html).toContain('vcard-badge ok')
    expect(html).toContain('一致')
    expect(html).toContain('class="katex')
    expect(html).toContain('392 cm/s²')
    expect(html).toContain('t = 0.907 s')
    expect(cardCss({ theme: 'dark', background: 'theme' }, 520)).toContain('#1c1c1f')
    expect(cardCss({ theme: 'dark', background: 'transparent' }, 520)).toContain('background:transparent')
  })

  it('formats relative errors', () => {
    expect(relErrorText(0)).toBe('0')
    expect(relErrorText(0.0123)).toBe('1.23%')
    expect(relErrorText(3e-12)).toBe('3.00e-12')
    expect(relErrorText(null)).toBe('—')
  })
})

describe('font faces', () => {
  it('parses descriptors', () => {
    expect(parseUnicodeRange('U+0-FF, U+131, U+4??')).toEqual([[0, 255], [0x131, 0x131], [0x400, 0x4ff]])
    expect(parseUnicodeRange('')).toBeNull()
    expect(parseWeight('100 900')).toEqual([100, 900])
    expect(parseWeight('bold')).toEqual([700, 700])
    expect(pickFontSource('url("a.woff") format("woff"), url(./b.woff2) format("woff2")')).toEqual({ url: './b.woff2', format: 'woff2' })
    expect(splitFamilies('KaTeX_Main, "Times New Roman", serif')).toEqual(['KaTeX_Main', 'Times New Roman', 'serif'])
  })

  const face = (family: string, style: string, w: [number, number], ranges: Array<[number, number]> | null, url: string): FaceRule => ({ family, style, weightMin: w[0], weightMax: w[1], ranges, url, format: 'woff2', weightText: `${w[0]} ${w[1]}`, rangeText: '' })
  const index = [
    face('KaTeX_Main', 'normal', [400, 400], null, 'main-r'),
    face('KaTeX_Main', 'normal', [700, 700], null, 'main-b'),
    face('KaTeX_Math', 'italic', [400, 400], null, 'math-i'),
    face('Noto Sans SC Variable', 'normal', [100, 900], [[0x4e00, 0x5fff]], 'cjk-1'),
    face('Noto Sans SC Variable', 'normal', [100, 900], [[0x6000, 0x9fff]], 'cjk-2'),
    face('Noto Sans SC Variable', 'normal', [100, 900], [[0x20, 0x7e]], 'latin')
  ]

  it('embeds only the faces and subsets the text needs', () => {
    const chars = (s: string) => new Set([...s].map(c => c.codePointAt(0)!))
    const picked = selectFaces(index, [
      { families: ['KaTeX_Math', 'serif'], weight: 400, style: 'italic', chars: chars('ag') },
      { families: ['KaTeX_Main'], weight: 400, style: 'normal', chars: chars('=0.4') },
      { families: ['Noto Sans SC Variable', 'sans-serif'], weight: 600, style: 'normal', chars: chars('一致') },
      { families: ['Segoe UI', 'sans-serif'], weight: 400, style: 'normal', chars: chars('abc') }
    ]).map(f => f.url).sort()
    // U+4E00 and U+81F4 (the badge text) fall in subsets 1 and 2; no Latin subset, no bold KaTeX face, nothing
    // for system fonts
    expect(picked).toEqual(['cjk-1', 'cjk-2', 'main-r', 'math-i'])
  })
})
