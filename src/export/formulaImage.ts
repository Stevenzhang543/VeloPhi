/**
 * Formula cards as standalone images (SVG and PNG) for courseware, slides and reports.
 *
 * How it works, offline in Chromium / WebView2:
 *   1. The card is laid out as HTML (KaTeX for the formulas) in an off-screen element of the live document,
 *      where the KaTeX stylesheet and the bundled fonts are already loaded, and measured.
 *   2. Every font face the card actually uses is found from the computed styles of its text (family, weight,
 *      style, and the unicode-range subsets that cover the characters), fetched from the app's own assets and
 *      embedded as a data: URL. Only those faces are embedded, so a card stays a few hundred kB at most.
 *   3. The card is serialised as XHTML inside an SVG <foreignObject>, with the card CSS, the KaTeX rules and the
 *      @font-face rules inlined: the SVG file is self-contained and renders identically anywhere SVG with
 *      foreignObject is supported (browsers, WPS/PowerPoint use the PNG).
 *   4. For PNG the SVG is drawn into a canvas (a data: SVG image with embedded fonts does not taint the canvas).
 *
 * `cardHtml` and the font-selection helpers are pure and run in Node for the tests.
 */
import type { Curriculum } from '../formula/levels'
import { withinLevel } from '../formula/levels'
import { tl, trDeep, paren } from '../i18n'
import katex from 'katex'
import type { FormulaCard, Verdict } from '../formula/match'
import { ENGINE_VERSION } from '../core/scene/types'
import type { UnitChoice } from '../units/units'
import { formatQuantity } from '../units/units'
import type { ImageBackground } from './still'
import { bytesToBase64 } from './zip'

/** Badge text and colour class of each verdict. */
export const VERDICT_TEXT: Record<Verdict, { text: string; cls: 'ok' | 'warn' | 'bad' | '' }> = trDeep({
  match: { text: '一致', cls: 'ok' },
  deviate: { text: '偏差超限', cls: 'bad' },
  'approx-ok': { text: '近似成立', cls: 'ok' },
  approx: { text: '近似', cls: 'warn' },
  'approx-invalid': { text: '近似失效', cls: 'bad' },
  'not-applicable': { text: '不适用', cls: '' },
  'no-measure': { text: '无法比较', cls: '' }
})

/** Options of the card images. */
export interface CardImageOptions {
  /** Significant digits of the values. */
  digits: number
  units: UnitChoice
  /** Colour scheme of the card. */
  theme: 'light' | 'dark'
  background: ImageBackground
  /** CSS width of the card (px); grows when a formula is wider. Default 520. */
  width?: number
  /** PNG pixel ratio. Default 2. */
  scale?: number
  /** Optional caption line (e.g. the moment). */
  caption?: string
}

/** SVG and PNG of a card, its CSS size (px) and the PNG pixel ratio. */
export interface CardImage { svg: string; png: Uint8Array | null; width: number; height: number; scale: number }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function tex(src: string, display: boolean): string {
  try {
    return katex.renderToString(src, { displayMode: display, throwOnError: false, strict: 'ignore', output: 'html' })
  } catch {
    return esc(src)
  }
}

/** Relative error as text: "0.12%" or "3.1e-9". */
export function relErrorText(rel: number | null): string {
  if (rel === null || !Number.isFinite(rel)) return '—'
  if (rel === 0) return '0'
  return rel * 100 < 1e-3 ? rel.toExponential(2) : `${Number((rel * 100).toPrecision(3))}%`
}

/** Card colours for a theme and background. */
export function cardColors(theme: 'light' | 'dark', bg: ImageBackground) {
  const dark = theme === 'dark' && bg !== 'white'
  return {
    dark,
    background: bg === 'transparent' ? 'transparent' : dark ? '#1c1c1f' : '#ffffff',
    text: dark ? '#f5f5f7' : '#1c1c1e',
    text2: dark ? 'rgba(235,235,245,0.72)' : 'rgba(60,60,67,0.75)',
    border: dark ? 'rgba(235,235,245,0.16)' : 'rgba(60,60,67,0.18)',
    ok: dark ? '#34c76b' : '#1f9d55',
    warn: dark ? '#f0a33a' : '#c77700',
    bad: dark ? '#ff5a4f' : '#d92d20',
    neutral: dark ? 'rgba(235,235,245,0.5)' : 'rgba(60,60,67,0.5)'
  }
}

/** Card stylesheet (class prefix `vcard`, so it cannot clash with the app styles). */
export function cardCss(o: Pick<CardImageOptions, 'theme' | 'background'>, width: number): string {
  const c = cardColors(o.theme, o.background)
  return [
    `.vcard{box-sizing:border-box;width:${width}px;padding:14px 18px 12px;border-radius:14px;border:1px solid ${c.border};border-left:4px solid ${c.neutral};background:${c.background};color:${c.text};font-family:"Noto Sans SC Variable","Segoe UI","Microsoft YaHei UI","PingFang SC",sans-serif;font-size:14px;line-height:1.45;font-weight:400;-webkit-font-smoothing:antialiased}`,
    `.vcard.ok{border-left-color:${c.ok}}.vcard.warn{border-left-color:${c.warn}}.vcard.bad{border-left-color:${c.bad}}`,
    '.vcard-head{display:flex;align-items:center;gap:8px}',
    '.vcard-title{flex:1;font-weight:600;font-size:15px}',
    `.vcard-badge{display:inline-block;padding:1px 9px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid ${c.neutral};color:${c.neutral}}`,
    `.vcard-badge.ok{color:${c.ok};border-color:${c.ok}}.vcard-badge.warn{color:${c.warn};border-color:${c.warn}}.vcard-badge.bad{color:${c.bad};border-color:${c.bad}}`,
    `.vcard-sit,.vcard-caption{font-size:12px;color:${c.text2}}`,
    '.vcard-formula{text-align:center;font-size:16px;margin:8px 0 4px}',
    '.vcard-formula .katex-display{margin:0}',
    `.vcard-subst{text-align:center;font-size:14px;color:${c.text2};margin:0 0 6px;padding-top:8px;line-height:1.9}`,
    '.vcard-cmp{width:100%;border-collapse:collapse;font-size:13px}',
    `.vcard-cmp td{padding:2px 0;border-top:1px solid ${c.border}}`,
    `.vcard-cmp td.k{color:${c.text2}}`,
    '.vcard-cmp td.v{text-align:right;font-family:"JetBrains Mono Variable",Consolas,monospace;font-variant-numeric:tabular-nums}',
    `.vcard-foot{margin-top:6px;font-size:10.5px;color:${c.text2}}`
  ].join('\n')
}

/** Card markup (HTML; serialised to XHTML before it goes into an SVG). */
export function cardHtml(card: FormulaCard, o: CardImageOptions): string {
  const v = VERDICT_TEXT[card.verdict]
  const unit = card.formula.unit
  const q = (x: number | null) => formatQuantity(x, unit, o.units, o.digits)
  const abs = card.absError === null ? '—' : formatQuantity(card.absError, unit, o.units, 3)
  const rows = [
    [tl('理论值（公式）'), q(card.theory)],
    [tl('仿真值（{0}）', [card.measureLabel]), q(card.sim)],
    [tl('误差'), card.absError === null ? '—' : `${abs}${paren(relErrorText(card.relError))}`]
  ]
  return [
    `<div class="vcard ${v.cls}">`,
    `<div class="vcard-head"><span class="vcard-title">${esc(card.formula.title)}</span><span class="vcard-badge ${v.cls}">${esc(v.text)}</span></div>`,
    `<div class="vcard-sit">${esc(card.situation.title)}${o.caption ? ` · ${esc(o.caption)}` : ''}</div>`,
    `<div class="vcard-formula">${tex(card.symbolic, true)}</div>`,
    card.substituted ? `<div class="vcard-subst">${tex(card.substituted, false)}</div>` : '',
    `<table class="vcard-cmp"><tbody>${rows.map(([k, val]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(val)}</td></tr>`).join('')}</tbody></table>`,
    tl('<div class="vcard-foot">VeloPhi {0} · 数值按显示单位{1}</div>', [ENGINE_VERSION, card.formula.note ? ` · ${esc(card.formula.note)}` : '']),
    '</div>'
  ].join('')
}

// ---- Font faces ----

/** An @font-face rule of the document. */
export interface FaceRule {
  family: string
  style: string
  weightMin: number
  weightMax: number
  /** Code point ranges; null: all characters. */
  ranges: Array<[number, number]> | null
  /** Absolute URL of the font file. */
  url: string
  format: string
  /** Original descriptors, copied into the embedded rule. */
  weightText: string
  rangeText: string
}

/** Parse a unicode-range descriptor such as "U+0-FF, U+4??, U+131"; null when empty. */
export function parseUnicodeRange(text: string): Array<[number, number]> | null {
  const t = text.trim()
  if (!t) return null
  const out: Array<[number, number]> = []
  for (const part of t.split(',')) {
    const m = /^\s*[uU]\+([0-9a-fA-F?]+)(?:-([0-9a-fA-F]+))?\s*$/.exec(part)
    if (!m) continue
    if (m[1].includes('?')) out.push([parseInt(m[1].replace(/\?/g, '0'), 16), parseInt(m[1].replace(/\?/g, 'f'), 16)])
    else out.push([parseInt(m[1], 16), parseInt(m[2] ?? m[1], 16)])
  }
  return out.length ? out : null
}

/** Weight range of a font-weight descriptor ("400", "100 900", "bold"). */
export function parseWeight(text: string): [number, number] {
  const named: Record<string, number> = { normal: 400, bold: 700 }
  const parts = text.trim().split(/\s+/).filter(Boolean).map(p => named[p] ?? Number(p)).filter(n => Number.isFinite(n))
  if (!parts.length) return [400, 400]
  return [Math.min(...parts), Math.max(...parts)]
}

/** First url(...) of a src descriptor, preferring woff2. */
export function pickFontSource(src: string): { url: string; format: string } | null {
  const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)\s*(?:format\(\s*(['"]?)([^'")]+)\3\s*\))?/g
  const all: Array<{ url: string; format: string }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) all.push({ url: m[2], format: m[4] ?? '' })
  if (!all.length) return null
  return all.find(s => s.format.startsWith('woff2') || s.url.endsWith('.woff2')) ?? all[0]
}

/** Families of a CSS font-family value, unquoted. */
export function splitFamilies(value: string): string[] {
  const out: string[] = []
  const re = /\s*(?:"([^"]*)"|'([^']*)'|([^,]+))\s*(?:,|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(value)) && m[0] !== '') out.push((m[1] ?? m[2] ?? m[3] ?? '').trim())
  return out.filter(Boolean)
}

/** Fonts and characters of the text runs that share one computed font. */
export interface FontUsage { families: string[]; weight: number; style: string; chars: Set<number> }

const covers = (r: FaceRule, cp: number) => r.ranges === null || r.ranges.some(([a, b]) => cp >= a && cp <= b)

/**
 * Font faces needed to draw the given text runs: per run the first family (in CSS order) that has @font-face
 * rules, matching style and weight, restricted to the unicode-range subsets that cover its characters;
 * characters no rule covers fall through to the next family.
 */
export function selectFaces(index: FaceRule[], usages: FontUsage[]): FaceRule[] {
  const chosen = new Set<FaceRule>()
  for (const u of usages) {
    let remaining = [...u.chars].filter(cp => cp > 32)
    for (const fam of u.families) {
      if (!remaining.length) break
      let rules = index.filter(r => r.family.toLowerCase() === fam.toLowerCase())
      if (!rules.length) continue
      const italic = u.style === 'italic' || u.style.startsWith('oblique')
      const styled = rules.filter(r => (r.style === 'italic' || r.style.startsWith('oblique')) === italic)
      if (styled.length) rules = styled
      const exact = rules.filter(r => u.weight >= r.weightMin && u.weight <= r.weightMax)
      if (exact.length) rules = exact
      else {
        const dist = (r: FaceRule) => Math.min(Math.abs(u.weight - r.weightMin), Math.abs(u.weight - r.weightMax))
        const best = Math.min(...rules.map(dist))
        rules = rules.filter(r => dist(r) === best)
      }
      const next: number[] = []
      for (const cp of remaining) {
        const r = rules.find(x => covers(x, cp))
        if (r) chosen.add(r); else next.push(cp)
      }
      remaining = next
    }
  }
  return [...chosen]
}

// ---- Browser side ----

let faceIndex: FaceRule[] | null = null
let katexCss: string | null = null

function sheets(): CSSStyleSheet[] {
  return typeof document === 'undefined' ? [] : Array.from(document.styleSheets)
}

function rulesOf(sheet: CSSStyleSheet): CSSRule[] {
  try { return Array.from(sheet.cssRules) } catch { return [] } // Cross-origin sheets are not readable
}

/** @font-face rules of the document (cached). */
export function documentFaces(): FaceRule[] {
  if (faceIndex) return faceIndex
  const out: FaceRule[] = []
  for (const sheet of sheets()) {
    const base = sheet.href ?? document.baseURI
    for (const rule of rulesOf(sheet)) {
      if (!(rule instanceof CSSFontFaceRule)) continue
      const st = (rule as CSSFontFaceRule).style
      const family = splitFamilies(st.getPropertyValue('font-family'))[0]
      const src = pickFontSource(st.getPropertyValue('src'))
      if (!family || !src) continue
      const weightText = st.getPropertyValue('font-weight') || '400'
      const [weightMin, weightMax] = parseWeight(weightText)
      const rangeText = st.getPropertyValue('unicode-range')
      let url: string
      try { url = new URL(src.url, base).href } catch { continue }
      out.push({ family, style: st.getPropertyValue('font-style') || 'normal', weightMin, weightMax, ranges: parseUnicodeRange(rangeText), url, format: src.format, weightText, rangeText })
    }
  }
  faceIndex = out
  return out
}

/** KaTeX style rules of the document (without its @font-face rules, which are embedded selectively). */
function documentKatexCss(): string {
  if (katexCss !== null) return katexCss
  const parts: string[] = []
  for (const sheet of sheets()) {
    for (const rule of rulesOf(sheet)) {
      if (rule instanceof CSSFontFaceRule) continue
      if (rule.cssText.includes('.katex')) parts.push(rule.cssText)
    }
  }
  katexCss = parts.join('\n')
  return katexCss
}

const fontCache = new Map<string, Promise<string>>()

function mimeOfFont(f: FaceRule): string {
  if (f.format.startsWith('woff2') || f.url.endsWith('.woff2')) return 'font/woff2'
  if (f.format.startsWith('woff') || f.url.endsWith('.woff')) return 'font/woff'
  return 'font/ttf'
}

/** The font file as a data: URL (fetched once from the app's own assets; works offline). */
function fontDataUrl(f: FaceRule): Promise<string> {
  let p = fontCache.get(f.url)
  if (!p) {
    p = fetch(f.url).then(async r => {
      if (!r.ok) throw new Error(tl('字体加载失败：{0}', [r.status]))
      return `data:${mimeOfFont(f)};base64,${bytesToBase64(new Uint8Array(await r.arrayBuffer()))}`
    })
    fontCache.set(f.url, p)
    p.catch(() => fontCache.delete(f.url))
  }
  return p
}

/** Text runs of an element with their computed fonts. */
function fontUsages(root: Element): FontUsage[] {
  const groups = new Map<string, FontUsage>()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue ?? ''
    if (!text.trim() || !n.parentElement) continue
    const cs = getComputedStyle(n.parentElement)
    const weight = Number(cs.fontWeight) || 400
    const key = `${cs.fontFamily}|${weight}|${cs.fontStyle}`
    let g = groups.get(key)
    if (!g) { g = { families: splitFamilies(cs.fontFamily), weight, style: cs.fontStyle, chars: new Set() }; groups.set(key, g) }
    for (const ch of text) g.chars.add(ch.codePointAt(0)!)
  }
  return [...groups.values()]
}

/**
 * @font-face rules (data: URLs) for the fonts a laid-out card uses. 'all' embeds every face needed, so the
 * card renders identically anywhere; 'math' embeds the KaTeX faces only and lets the text use the system
 * fonts named in the card CSS (≈ 4× smaller files; Windows has Segoe UI and Microsoft YaHei).
 */
async function embeddedFaces(root: Element, mode: SvgFonts): Promise<string> {
  let usages = fontUsages(root)
  if (mode === 'math') usages = usages.filter(u => u.families[0]?.startsWith('KaTeX'))
  const faces = selectFaces(documentFaces(), usages)
  const rules = await Promise.all(faces.map(async f => {
    const data = await fontDataUrl(f)
    const fmt = f.format ? ` format("${f.format}")` : ''
    return `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weightText};font-display:block;src:url(${data})${fmt};${f.rangeText ? `unicode-range:${f.rangeText};` : ''}}`
  }))
  return rules.join('\n')
}

/** Fonts an SVG embeds: every face used, or only the KaTeX faces (see embeddedFaces). */
export type SvgFonts = 'all' | 'math'

function nextFrame(): Promise<void> {
  return new Promise(r => requestAnimationFrame(() => r()))
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Lay the card out off-screen, call `use` with the card element and its size, then remove it. */
async function withLaidOutCard<T>(card: FormulaCard, o: CardImageOptions, use: (el: HTMLElement, width: number, height: number, css: string) => Promise<T>): Promise<T> {
  let width = o.width ?? 520
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-30000px;top:0;pointer-events:none;contain:layout style'
  const style = document.createElement('style')
  host.appendChild(style)
  const box = document.createElement('div')
  host.appendChild(box)
  document.body.appendChild(host)
  try {
    style.textContent = cardCss(o, width)
    box.innerHTML = cardHtml(card, o)
    const el = box.firstElementChild as HTMLElement
    await document.fonts.ready
    await nextFrame()
    // A wide formula widens the card instead of being clipped
    const need = Math.max(...Array.from(el.querySelectorAll<HTMLElement>('.vcard-formula, .vcard-subst')).map(e => e.scrollWidth - e.clientWidth), 0)
    if (need > 0) {
      width = Math.min(1000, Math.ceil(width + need + 4))
      style.textContent = cardCss(o, width)
      await document.fonts.ready
      await nextFrame()
    }
    const rect = el.getBoundingClientRect()
    return await use(el, Math.ceil(rect.width), Math.ceil(rect.height), cardCss(o, width))
  } finally {
    host.remove()
  }
}

async function buildSvg(el: HTMLElement, w: number, h: number, cardStyle: string, fonts: SvgFonts): Promise<string> {
  const faces = await embeddedFaces(el, fonts)
  const css = `${faces}\n${documentKatexCss()}\n${cardStyle}`
  const xhtml = new XMLSerializer().serializeToString(el)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<style><![CDATA[\n${css.replace(/]]>/g, ']]]]><![CDATA[>')}\n]]></style>`
    + `<foreignObject x="0" y="0" width="${w}" height="${h}">${xhtml}</foreignObject></svg>`
}

/** Self-contained SVG of a formula card. */
export async function cardSvg(card: FormulaCard, o: CardImageOptions, fonts: SvgFonts = 'all'): Promise<{ svg: string; width: number; height: number }> {
  return withLaidOutCard(card, o, async (el, w, h, css) => ({ svg: await buildSvg(el, w, h, css, fonts), width: w, height: h }))
}

/** Cheap fingerprint of a canvas (sampled pixels). */
function canvasSignature(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const data = new Uint32Array(ctx.getImageData(0, 0, w, h).data.buffer)
  let hsh = 2166136261
  for (let i = 0; i < data.length; i += 5) hsh = Math.imul(hsh ^ data[i], 16777619)
  return hsh >>> 0
}

/**
 * Rasterise an SVG string to PNG bytes at `scale` × its size. Fonts embedded in an SVG image load
 * asynchronously after the image itself has decoded, so the image is redrawn until the pixels stop changing
 * (at least ~150 ms stable, at most ~3 s).
 */
export async function svgToPng(svg: string, width: number, height: number, scale = 2): Promise<Uint8Array> {
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await img.decode()
  const canvas = document.createElement('canvas')
  const W = canvas.width = Math.max(1, Math.round(width * scale))
  const H = canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error(tl('无法创建画布'))
  let last = -1, stable = 0
  const start = performance.now()
  for (;;) {
    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(img, 0, 0, W, H)
    const sig = canvasSignature(ctx, W, H)
    stable = sig === last ? stable + 1 : 0
    last = sig
    const elapsed = performance.now() - start
    if ((stable >= 3 && elapsed >= 150) || elapsed > 3000) break
    await sleep(50)
  }
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error(tl('PNG 编码失败'))
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * SVG and (optionally) PNG of a card from one layout. The PNG is always drawn from a fully embedded SVG; the
 * returned SVG embeds `svgFonts` ('math' by default: small files, Chinese text in the system font).
 */
export async function cardImage(card: FormulaCard, o: CardImageOptions, opts: { png?: boolean; svgFonts?: SvgFonts } = {}): Promise<CardImage> {
  const scale = o.scale ?? 2
  const want = opts.png ?? true
  const svgFonts = opts.svgFonts ?? 'math'
  return withLaidOutCard(card, o, async (el, w, h, css) => {
    const full = await buildSvg(el, w, h, css, 'all')
    const svg = svgFonts === 'all' ? full : await buildSvg(el, w, h, css, svgFonts)
    return { svg, width: w, height: h, scale, png: want ? await svgToPng(full, w, h, scale) : null }
  })
}

/** Knowledge-level filter of exported cards (D44): curriculum and ceiling; null: all formulas. */
export type LevelFilter = { curriculum: Curriculum; level: number } | null

/** Formula cards worth showing: applicable ones (a card whose conditions fail is left out), within the level. */
export function shownCards(cards: FormulaCard[], level: LevelFilter = null): FormulaCard[] {
  return cards.filter(c => c.verdict !== 'not-applicable' && (!level || withinLevel(c.formula.id, level.curriculum, level.level)))
}
