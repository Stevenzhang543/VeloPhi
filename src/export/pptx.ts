/**
 * PPTX courseware (decision D15) generated with PptxGenJS (MIT; bundled, works offline; loaded on demand so it
 * does not weigh on start-up). Slides, 16:9:
 *   1. title slide: scene name, description, engine version, result fingerprint, date;
 *   2. one slide per key moment: screenshot on the left, readouts table and formula cards on the right
 *      (formula cards that do not fit continue on a follow-up slide);
 *   3. a video slide with the simulation video embedded as media (MP4 plays in PowerPoint and WPS; WebM
 *      only in recent PowerPoint versions, which the slide says).
 * Images are PNG (PowerPoint and WPS do not render SVG <foreignObject>), text uses Microsoft YaHei.
 */
import { tl } from '../i18n'
import { bytesToBase64 } from './zip'

/** A PNG with its pixel size. */
export interface DeckImage { png: Uint8Array; width: number; height: number }

/** One key-moment slide. */
export interface DeckMoment {
  /** Slide title: the moment's number and time. */
  title: string
  /** The moment's description (the bodies involved and the change). */
  subtitle?: string
  screenshot: DeckImage | null
  formulas: Array<DeckImage & { title: string }>
  readouts: Array<{ label: string; value: string }>
}

/** Content of the deck. */
export interface DeckInput {
  title: string
  description: string
  /** Small lines on the title slide (version, fingerprint, date …). */
  meta: string[]
  /** Prominent warning on the title slide (the reduced-accuracy notice). */
  notice?: string | null
  moments: DeckMoment[]
  /** Derivation and solution pages (one slide each, after the key moments). */
  derivations?: Array<DeckImage & { title: string }>
  video: { data: Uint8Array; extension: 'mp4' | 'webm'; cover?: DeckImage | null } | null
}

const W = 13.333, H = 7.5
const FONT = 'Microsoft YaHei'
const MONO = 'Consolas'
const TEXT = '1C1C1E', TEXT2 = '6B6B70', ACCENT = '0A6CFF', LINE = 'D9DCE3'

/** Fit a w × h box into a frame, centred; returns inches. */
export function fitBox(w: number, h: number, frame: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const k = Math.min(frame.w / Math.max(w, 1e-9), frame.h / Math.max(h, 1e-9))
  const bw = w * k, bh = h * k
  return { x: frame.x + (frame.w - bw) / 2, y: frame.y + (frame.h - bh) / 2, w: bw, h: bh }
}

const png64 = (img: DeckImage) => `image/png;base64,${bytesToBase64(img.png)}`

/** Formula images that fit a column of height `avail` (at least one), the rest left for later slides. */
export function takeFitting<T extends { width: number; height: number }>(items: T[], colW: number, avail: number, gap: number): { now: T[]; rest: T[] } {
  const now: T[] = []
  let used = 0
  for (const it of items) {
    const h = Math.min(colW * it.height / it.width, avail)
    if (now.length && used + gap + h > avail) break
    used += (now.length ? gap : 0) + h
    now.push(it)
  }
  return { now, rest: items.slice(now.length) }
}

/** Build the PPTX file (PptxGenJS is loaded on first use). */
export async function buildPptx(input: DeckInput): Promise<Uint8Array> {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title = input.title
  pptx.author = 'VeloPhi'
  pptx.subject = tl('物理仿真课件')
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT }

  const footer = (slide: ReturnType<typeof pptx.addSlide>, n: number) => {
    slide.addText(`VeloPhi · ${input.title}`, { x: 0.5, y: H - 0.42, w: 8, h: 0.3, fontFace: FONT, fontSize: 9, color: TEXT2 })
    slide.addText(String(n), { x: W - 1.5, y: H - 0.42, w: 1, h: 0.3, fontFace: FONT, fontSize: 9, color: TEXT2, align: 'right' })
  }
  let n = 0

  // 1. Title slide
  {
    const s = pptx.addSlide()
    n++
    s.addShape('rect', { x: 0, y: 0, w: 0.18, h: H, fill: { color: ACCENT }, line: { color: ACCENT } })
    s.addText(input.title, { x: 0.9, y: 2.0, w: W - 1.8, h: 1.1, fontFace: FONT, fontSize: 36, bold: true, color: TEXT })
    if (input.description) s.addText(input.description, { x: 0.9, y: 3.15, w: W - 1.8, h: 1.2, fontFace: FONT, fontSize: 18, color: TEXT2, valign: 'top' })
    if (input.notice) s.addText(input.notice, { x: 0.9, y: 4.45, w: W - 1.8, h: 0.75, fontFace: FONT, fontSize: 13, bold: true, color: 'C77700', valign: 'top' })
    if (input.meta.length) s.addText(input.meta.join('\n'), { x: 0.9, y: 5.3, w: W - 1.8, h: 1.3, fontFace: FONT, fontSize: 12, color: TEXT2, valign: 'top' })
  }

  // 2. Key moments
  const colX = 8.75, colW = W - 0.5 - colX, top = 1.45, bottom = H - 0.6, gap = 0.15
  for (const m of input.moments) {
    const s = pptx.addSlide()
    n++
    s.addText(m.title, { x: 0.5, y: 0.3, w: W - 1, h: 0.6, fontFace: FONT, fontSize: 24, bold: true, color: TEXT })
    if (m.subtitle) s.addText(m.subtitle, { x: 0.5, y: 0.88, w: W - 1, h: 0.42, fontFace: FONT, fontSize: 14, color: ACCENT })
    if (m.screenshot) {
      const b = fitBox(m.screenshot.width, m.screenshot.height, { x: 0.5, y: top, w: colX - 0.75, h: bottom - top })
      s.addImage({ data: png64(m.screenshot), ...b, altText: m.title })
    }
    let y = top
    if (m.readouts.length) {
      const rowH = 0.28
      const rows = m.readouts.slice(0, 10).map(r => [
        { text: r.label, options: { fontFace: FONT, fontSize: 10, color: TEXT2 } },
        { text: r.value, options: { fontFace: MONO, fontSize: 10, color: TEXT, align: 'right' as const } }
      ])
      s.addTable(rows, { x: colX, y, w: colW, colW: [colW * 0.58, colW * 0.42], rowH, border: { type: 'solid', pt: 0.5, color: LINE }, margin: 0.04, autoPage: false })
      y += rows.length * rowH + 0.25
    }
    let rest = m.formulas
    if (rest.length) {
      const fit = takeFitting(rest, colW, bottom - y, gap)
      for (const f of fit.now) {
        const h = Math.min(colW * f.height / f.width, bottom - y)
        const b = fitBox(f.width, f.height, { x: colX, y, w: colW, h })
        s.addImage({ data: png64(f), ...b, altText: f.title })
        y += h + gap
      }
      rest = fit.rest
    }
    footer(s, n)
    // Formula cards that did not fit: continuation slides, a 3 × 2 grid of cards
    const cols = 3, rowsPerSlide = 2, cellGap = 0.25
    const cellW = (W - 1 - (cols - 1) * cellGap) / cols, cellH = (bottom - 1.15 - (rowsPerSlide - 1) * cellGap) / rowsPerSlide
    while (rest.length) {
      const c = pptx.addSlide()
      n++
      c.addText(tl('{0}（续）· 公式对照', [m.title]), { x: 0.5, y: 0.3, w: W - 1, h: 0.6, fontFace: FONT, fontSize: 22, bold: true, color: TEXT })
      const page = rest.slice(0, cols * rowsPerSlide)
      page.forEach((f, k) => {
        const b = fitBox(f.width, f.height, { x: 0.5 + (k % cols) * (cellW + cellGap), y: 1.15 + Math.floor(k / cols) * (cellH + cellGap), w: cellW, h: cellH })
        c.addImage({ data: png64(f), x: b.x, y: 1.15 + Math.floor(k / cols) * (cellH + cellGap), w: b.w, h: b.h, altText: f.title })
      })
      rest = rest.slice(page.length)
      footer(c, n)
    }
  }

  // 3. Derivations and step-by-step solutions: one image per slide (tall pages are scaled to the slide height)
  for (const d of input.derivations ?? []) {
    const s = pptx.addSlide()
    n++
    s.addText(tl('推导与解题过程 · {0}', [d.title]), { x: 0.5, y: 0.3, w: W - 1, h: 0.6, fontFace: FONT, fontSize: 20, bold: true, color: TEXT })
    const b = fitBox(d.width, d.height, { x: 0.8, y: 1.05, w: W - 1.6, h: H - 1.6 })
    s.addImage({ data: png64(d), ...b, altText: d.title })
    footer(s, n)
  }

  // 4. Video
  if (input.video) {
    const s = pptx.addSlide()
    n++
    s.addText(tl('仿真视频'), { x: 0.5, y: 0.3, w: W - 1, h: 0.6, fontFace: FONT, fontSize: 24, bold: true, color: TEXT })
    const cover = input.video.cover
    const b = fitBox(cover?.width ?? 16, cover?.height ?? 9, { x: 0.8, y: 1.15, w: W - 1.6, h: H - 2.1 })
    const ext = input.video.extension
    s.addMedia({ type: 'video', data: `video/${ext};base64,${bytesToBase64(input.video.data)}`, extn: ext, ...b, ...(cover ? { cover: `data:${png64(cover)}` } : {}) })
    const note = ext === 'mp4' ? tl('放映时点击画面播放。视频按仿真时刻逐帧渲染，与软件画面一致。') : tl('本机只能导出 WebM 视频，部分 PowerPoint / WPS 版本无法播放；请改用课件包中的视频文件。')
    s.addText(note, { x: 0.8, y: H - 0.9, w: W - 1.6, h: 0.35, fontFace: FONT, fontSize: 11, color: TEXT2 })
    footer(s, n)
  }

  const out = await pptx.write({ outputType: 'uint8array', compression: true })
  return out as Uint8Array
}
