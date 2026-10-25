/**
 * Lab report (the "实验报告" dialog) as one self-contained HTML file: inline styles, every image a data: URL,
 * no scripts, no network references — it opens offline in any browser and can be archived or mailed as it is.
 *
 * Sections: scene and solver parameters (display units), screenshots, curves, formula comparison with
 * errors, events, the students' predictions when there are any, and the reproducibility footer (engine
 * version, SHA-256 fingerprint of the recording).
 *
 * "PDF": `printHtml` opens the report in a new window and calls print(); the system print dialog offers
 * "另存为 PDF" / "Microsoft Print to PDF". Where a new window is not allowed (pop-up blocked, desktop
 * WebView), it prints from a hidden frame instead. No PDF library is bundled.
 *
 * `buildReportHtml` is pure; the dialog collects the content.
 */
import { tl, stripLabel } from '../i18n'

/** A titled table of text cells. */
export interface ReportTable { title: string; header: string[]; rows: string[][]; note?: string }
/** An embedded image (data: URL) with its caption and optional display width (px). */
export interface ReportFigure { src: string; caption: string; width?: number }

/** One row of the formula comparison, formatted. */
export interface ReportFormulaRow {
  moment: string
  situation: string
  formula: string
  theory: string
  sim: string
  absError: string
  relError: string
  verdict: string
  verdictClass: 'ok' | 'warn' | 'bad' | ''
}

/** One row of the events table. */
export interface ReportEventRow { t: string; what: string; who: string; detail: string }

/** One row of the predictions table. */
export interface ReportPredictionRow {
  target: string
  predicted: string
  sim: string
  formula: string
  error: string
  grade: string
  gradeClass: 'ok' | 'warn' | 'bad' | ''
}

/** Everything the report shows, already formatted. */
export interface ReportInput {
  title: string
  description: string
  engineVersion: string
  hash: string
  /** Formatted generation time. */
  generatedAt: string
  /** Free text written in the dialog (aim, conclusion …); never filled automatically. */
  notes?: string
  /** Prominent notice under the title (e.g. the reduced-accuracy notice of the Moreau–Jean fallback). */
  notice?: string | null
  parameters: ReportTable[]
  screenshots: ReportFigure[]
  curves: ReportFigure[]
  /** Formula cards as images (optional, in addition to the table). */
  formulaImages?: ReportFigure[]
  /** Derivation and solution pages of the formulas and key events (optional, D28). */
  derivations?: ReportFigure[]
  formulas: ReportFormulaRow[]
  events: ReportEventRow[]
  predictions: ReportPredictionRow[]
  warnings: string[]
  /** Explanation of the error thresholds and units. */
  legend: string[]
}

/** HTML-escape text. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Only embedded raster/SVG images are allowed (the report must not reference anything outside itself). */
export function isEmbeddedImage(src: string): boolean {
  return /^data:image\/(png|jpeg|webp|svg\+xml)[;,]/.test(src)
}

const CSS = `
*{box-sizing:border-box}
body{margin:0;background:#f3f4f6;color:#1c1c1e;font:14px/1.55 "Segoe UI","Microsoft YaHei UI","PingFang SC","Noto Sans SC",sans-serif}
main{max-width:960px;margin:24px auto;background:#fff;padding:36px 44px;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
h1{font-size:26px;margin:0 0 4px}
h2{font-size:18px;margin:28px 0 10px;padding-bottom:4px;border-bottom:2px solid #0a6cff}
h3{font-size:15px;margin:16px 0 6px}
.sub{color:#5b5b60;margin:0 0 6px}
.meta{color:#6b6b70;font-size:12px}
.notice{background:#fdf3e2;border:1px solid #c77700;border-radius:8px;padding:8px 12px;margin:10px 0;color:#7a4a00}
.notes{white-space:pre-wrap;background:#f6f8fb;border-left:3px solid #0a6cff;padding:8px 12px;margin:10px 0}
table{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:13px}
th,td{border:1px solid #d9dce3;padding:4px 8px;text-align:left;vertical-align:top}
th{background:#f3f5f9;font-weight:600}
td.nowrap{white-space:nowrap}
td.num{text-align:right;font-family:Consolas,"JetBrains Mono",monospace;white-space:nowrap}
.badge{display:inline-block;padding:0 8px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid #9a9aa0;color:#6b6b70;white-space:nowrap}
.badge.ok{color:#1f7a45;border-color:#1f9d55;background:#eaf7ef}
.badge.warn{color:#9a5c00;border-color:#c77700;background:#fdf3e2}
.badge.bad{color:#b42318;border-color:#d92d20;background:#fdeceb}
figure{margin:10px 0 16px;break-inside:avoid;page-break-inside:avoid}
figure img{max-width:100%;border:1px solid #e3e5ea;border-radius:6px;display:block}
figcaption{color:#5b5b60;font-size:12px;margin-top:4px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:12px}
.warn-list li{color:#9a5c00}
.legend{color:#6b6b70;font-size:12px}
footer{margin-top:28px;padding-top:10px;border-top:1px solid #d9dce3;color:#6b6b70;font-size:12px}
@media print{body{background:#fff}main{margin:0;max-width:none;box-shadow:none;border-radius:0;padding:0}h2{break-after:avoid;page-break-after:avoid}tr{break-inside:avoid;page-break-inside:avoid}.grid{grid-template-columns:1fr 1fr}}
@page{size:A4;margin:16mm 14mm}
`

function table(t: ReportTable, numericFrom = 1): string {
  const head = `<tr>${t.header.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`
  // Right-align numbers only ("2 kg", "(0.1, 0.2 m)", "−3"), not words in the same column
  const numeric = (c: string) => /^[-+−(\d.]/.test(c)
  const rows = t.rows.map(r => `<tr>${r.map((c, i) => `<td${i >= numericFrom && numeric(c) ? ' class="num"' : ''}>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')
  return `${t.title ? `<h3>${escapeHtml(t.title)}</h3>` : ''}<table><thead>${head}</thead><tbody>${rows}</tbody></table>${t.note ? `<p class="legend">${escapeHtml(t.note)}</p>` : ''}`
}

function figures(list: ReportFigure[], grid: boolean): string {
  const items = list.filter(f => isEmbeddedImage(f.src)).map(f => `<figure><img src="${f.src}" alt="${escapeHtml(f.caption)}"${f.width ? ` style="width:${Math.round(f.width)}px"` : ''}/><figcaption>${escapeHtml(f.caption)}</figcaption></figure>`).join('')
  return grid ? `<div class="grid">${items}</div>` : items
}

const badge = (text: string, cls: string) => `<span class="badge${cls ? ` ${cls}` : ''}">${escapeHtml(text)}</span>`

/** The report as one self-contained HTML document. */
export function buildReportHtml(r: ReportInput): string {
  const parts: string[] = []
  parts.push(`<h1>${escapeHtml(r.title)}</h1>`)
  if (r.description) parts.push(`<p class="sub">${escapeHtml(r.description)}</p>`)
  parts.push(tl('<p class="meta">实验报告 · 生成于 {0} · Verity {1}</p>', [escapeHtml(r.generatedAt), escapeHtml(r.engineVersion)]))
  if (r.notice) parts.push(tl('<div class="notice"><span class="badge warn">精度降级</span> {0}</div>', [escapeHtml(stripLabel(r.notice))]))
  if (r.notes?.trim()) parts.push(`<div class="notes">${escapeHtml(r.notes.trim())}</div>`)

  let sec = 0
  const h2 = (t: string) => `<h2>${++sec}. ${escapeHtml(t)}</h2>`
  if (r.parameters.length) parts.push(h2(tl('实验参数')), ...r.parameters.map(t => table(t)))
  if (r.screenshots.length) parts.push(h2(tl('关键时刻截图')), figures(r.screenshots, true))
  if (r.curves.length) parts.push(h2(tl('曲线')), figures(r.curves, false))
  if (r.formulas.length || r.formulaImages?.length) {
    parts.push(h2(tl('公式对照与误差')))
    if (r.formulas.length) {
      const head = [tl('时刻'), tl('情形'), tl('公式'), tl('理论值'), tl('仿真值'), tl('绝对误差'), tl('相对误差'), tl('判定')].map(h => `<th>${h}</th>`).join('')
      const rows = r.formulas.map(f => `<tr><td class="nowrap">${escapeHtml(f.moment)}</td><td>${escapeHtml(f.situation)}</td><td>${escapeHtml(f.formula)}</td><td class="num">${escapeHtml(f.theory)}</td><td class="num">${escapeHtml(f.sim)}</td><td class="num">${escapeHtml(f.absError)}</td><td class="num">${escapeHtml(f.relError)}</td><td>${badge(f.verdict, f.verdictClass)}</td></tr>`).join('')
      parts.push(`<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`)
    }
    if (r.formulaImages?.length) parts.push(figures(r.formulaImages, true))
  }
  if (r.predictions.length) {
    parts.push(h2(tl('预测与对比')))
    const head = [tl('预测对象'), tl('我的预测'), tl('仿真结果'), tl('公式结果'), tl('与仿真的误差'), tl('评价')].map(h => `<th>${h}</th>`).join('')
    const rows = r.predictions.map(p => `<tr><td>${escapeHtml(p.target)}</td><td class="num">${escapeHtml(p.predicted)}</td><td class="num">${escapeHtml(p.sim)}</td><td class="num">${escapeHtml(p.formula)}</td><td class="num">${escapeHtml(p.error)}</td><td>${badge(p.grade, p.gradeClass)}</td></tr>`).join('')
    parts.push(`<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`)
  }
  if (r.events.length) {
    parts.push(h2(tl('事件')))
    parts.push(table({ title: '', header: [tl('时刻'), tl('事件'), tl('对象'), tl('说明')], rows: r.events.map(e => [e.t, e.what, e.who, e.detail]) }, 9))
  }
  if (r.derivations?.length) parts.push(h2(tl('推导与解题过程')), figures(r.derivations, false))
  if (r.warnings.length) parts.push(h2(tl('提示')), `<ul class="warn-list">${r.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`)
  if (r.legend.length) parts.push(`<div class="legend">${r.legend.map(l => `<p>${escapeHtml(l)}</p>`).join('')}</div>`)
  parts.push(tl('<footer>Verity {0} · 仿真结果指纹 SHA-256 <code>{1}</code><br/>用同一场景文件重新计算可得到相同的指纹与逐位相同的数值。本报告离线生成，不含任何外部链接。</footer>', [escapeHtml(r.engineVersion), escapeHtml(r.hash)]))
  return tl('<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="generator" content="Verity {0}"/><title>{1} — 实验报告</title><style>{2}</style></head><body><main>{3}</main></body></html>\n', [escapeHtml(r.engineVersion), escapeHtml(r.title), CSS, parts.join('\n')])
}

/**
 * Print the report (the system dialog can save it as PDF). Tries a new window first; falls back to a hidden
 * frame when pop-ups are blocked or not supported. Returns how it was printed.
 */
export function printHtml(html: string): 'window' | 'frame' {
  const w = typeof window !== 'undefined' ? window.open('', '_blank') : null
  if (w) {
    try {
      w.document.open()
      w.document.write(html)
      w.document.close()
      const go = () => { w.focus(); w.print() }
      if (w.document.readyState === 'complete') setTimeout(go, 200)
      else w.addEventListener('load', () => setTimeout(go, 100))
      return 'window'
    } catch {
            try { w.close() } catch { /* Ignore */ }
    }
  }
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  frame.srcdoc = html
  frame.onload = () => {
    setTimeout(() => {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
      setTimeout(() => frame.remove(), 60000)
    }, 100)
  }
  document.body.appendChild(frame)
  return 'frame'
}
