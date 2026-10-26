/**
 * Courseware package (decision D15): video, key-moment screenshots (PNG), formula cards (PNG and/or SVG), CSV
 * data and an optional PPTX, generated offline from one recording with the same renderers as the screen.
 * Delivered as one ZIP (under a root folder named after the scene) or as individual files.
 *
 * The orchestration needs a DOM (canvas, video encoder); the parts it combines are tested on their own.
 */
import { tl } from '../i18n'
import type { Recording } from '../core/solver/simulation'
import type { Situation } from '../formula/situations'
import type { FormulaCard } from '../formula/match'
import { ENGINE_VERSION } from '../core/scene/types'
import type { UnitChoice } from '../units/units'
import { eventLabel } from '../render/renderer'
import type { CsvDecimal, CsvSeparator } from './csv'
import { eventsCsv, recordingCsv } from './csv'
import type { KeyMoment } from './moments'
import { cardsForMoment, changeWho, momentFileStem, readoutsAt, reducedNotice } from './moments'
import type { ImageBackground, StillOptions } from './still'
import { stillPng } from './still'
import type { CardImage } from './formulaImage'
import { cardImage, shownCards } from './formulaImage'
import type { LevelFilter } from './formulaImage'
import type { VideoOptions, VideoResult } from './video'
import { exportVideo, timeLabel } from './video'
import type { DeckImage, DeckMoment } from './pptx'
import { buildPptx } from './pptx'
import type { ZipEntry } from './zip'
import { zipStore } from './zip'
import { fingerprintShort, fingerprintText } from './fingerprint'
import type { Lang } from '../i18n/tri'
import type { DerivationPage } from './derivationPages'
import { derivationPages } from './derivationPages'

/** What to put into the package. */
export interface CoursewareOptions {
  title: string
  description: string
  moments: KeyMoment[]
  units: UnitChoice
  digits: number
  theme: 'light' | 'dark'
  /** Common drawing settings of the screenshots (camera, display options, palette …). */
  still: Omit<StillOptions, 'width' | 'height' | 'background' | 'overlay'>
  screenshots: { width: number; height: number; background: ImageBackground } | null
  formulas: { png: boolean; svg: boolean; background: ImageBackground } | null
  csv: { ids: string[]; stride: number; units: 'si' | 'display'; separator: CsvSeparator; decimal: CsvDecimal } | null
  video: VideoOptions | null
  pptx: boolean
  /** Derivation and solution pages of the formulas and events (D28), in this language; null: none. */
  derivations: { lang: Lang } | null
  /** Quantities read out on the slides at each moment. */
  readoutIds: string[]
  /** Knowledge-level filter of the formula cards and pages (D44); null or absent: all formulas. */
  level?: LevelFilter
}

/** A file of the package; `path` is relative to its root. */
export interface CoursewareFile { path: string; data: Uint8Array | string }

/** The generated files, warnings and video. */
export interface CoursewareResult {
  files: CoursewareFile[]
  warnings: string[]
  video: VideoResult | null
  /** Reduced-accuracy notice when the recording used the Moreau–Jean fallback (also written into the files). */
  notice: string | null
}

/** File-name-safe text: characters Windows does not allow become '_'; trailing dots and spaces are dropped. */
export function safeName(s: string, fallback = 'velophi'): string {
  const t = s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().replace(/[. ]+$/, '')
  return t || fallback
}

/** Plan of the work (for progress weights). */
function weights(o: CoursewareOptions) {
  return {
    video: o.video ? 6 : 0,
    shots: o.screenshots || o.pptx ? 1 : 0,
    cards: o.formulas || o.pptx ? 2 : 0,
    csv: o.csv ? 0.3 : 0,
    derivations: o.derivations ? 2 : 0,
    pptx: o.pptx ? 0.7 : 0
  }
}

/** Contents note written next to the files. */
export function readmeText(rec: Recording, o: CoursewareOptions, files: string[], warnings: string[]): string {
  const lines = [
    tl('{0} — 课件包', [o.title]),
    '',
    tl('由 VeloPhi {0} 离线生成于 {1}。', [ENGINE_VERSION, new Date().toLocaleString('zh-CN')]),
    tl('仿真结果指纹：{0}', [fingerprintText(rec)]),
    tl('同一场景文件在任何电脑上重新计算，指纹相同、数值逐位一致。'),
    ...(reducedNotice(rec, o.units) ? ['', `【${reducedNotice(rec, o.units)}】`] : []),
    '',
    tl('内容：'),
    ...files.map(f => `  ${f}`),
    '',
    tl('说明：'),
    tl('  · 截图与视频由软件的同一渲染器逐帧生成，与界面画面一致。'),
    tl('  · 公式卡片的 PNG 可直接插入 PowerPoint / WPS；SVG 版本内含 HTML（foreignObject），只能在浏览器中正确显示。'),
    tl('  · 公式卡片中的代入值、理论值、仿真值与误差均按导出时的显示单位给出（计算本身按国际单位进行）。')
  ]
  if (o.csv) lines.push(o.csv.units === 'si' ? tl('  · CSV 为国际单位（表头注明单位），数值与仿真结果逐位一致。') : tl('  · CSV 为显示单位（表头注明单位），由国际单位换算得到。'))
  for (const w of warnings) lines.push(tl('  · 注意：{0}', [w]))
  return lines.join('\r\n') + '\r\n'
}

/** Generate every part of the package; rejects when cancelled. */
export async function buildCourseware(rec: Recording, sits: Situation[], o: CoursewareOptions, progress: (p: number, step: string) => void, cancelled: () => boolean): Promise<CoursewareResult> {
  const files: CoursewareFile[] = []
  const warnings: string[] = []
  const w = weights(o)
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1
  let done = 0
  const step = (weight: number, frac: number, label: string) => progress(Math.min(1, (done + weight * frac) / total), label)
  const check = () => { if (cancelled()) throw new Error(tl('已取消')) }
  const base = safeName(o.title)
  const nMoments = o.moments.length
  const notice = reducedNotice(rec, o.units)
  /** Moments in the reduced-accuracy part of the recording are marked on screenshots, cards and slides. */
  const reducedAt = (t: number) => rec.reducedFrom !== null && rec.reducedFrom !== undefined && t >= rec.reducedFrom - 1e-12

  // Video
  let video: VideoResult | null = null
  if (o.video) {
    step(w.video, 0, tl('正在编码视频'))
    video = await exportVideo(rec, o.video, p => step(w.video, p, tl('正在编码视频')), cancelled)
    if (video.extension !== 'mp4') warnings.push(tl('本机没有 H.264 编码器，视频为 WebM 格式；PowerPoint 可能无法播放，可用其他播放器或转换为 MP4。'))
    files.push({ path: tl('视频/{0}.{1}', [base, video.extension]), data: video.data })
    done += w.video
  }

  // Screenshots (also needed for the slides)
  const shots: Array<DeckImage | null> = []
  if (w.shots) {
    const size = o.screenshots ?? { width: 1600, height: 900, background: 'theme' as ImageBackground }
    for (let i = 0; i < nMoments; i++) {
      check()
      const m = o.moments[i]
      step(w.shots, i / Math.max(1, nMoments), tl('正在生成截图 {0}/{1}', [i + 1, nMoments]))
      const img = await stillPng(rec, m.t, {
        ...o.still, width: size.width, height: size.height, background: size.background,
        overlay: { title: o.title, lines: [`${timeLabel(m.t, o.units)}  ${m.label}`, ...(reducedAt(m.t) ? [tl('精度降级（时间步进），数值仅供参考')] : [])], footer: `VeloPhi ${ENGINE_VERSION} · ${fingerprintShort(rec)}` }
      })
      shots.push(img)
      if (o.screenshots) files.push({ path: tl('截图/{0}.png', [momentFileStem(i, m)]), data: img.png })
    }
    done += w.shots
  }

  // Formula cards
  const cardsByMoment: Array<Array<CardImage & { card: FormulaCard }>> = []
  if (w.cards) {
    const f = o.formulas ?? { png: false, svg: false, background: 'white' as ImageBackground }
    const lists = o.moments.map(m => {
      const seen = new Set<string>()
      return shownCards(cardsForMoment(sits, m.t, o.digits, o.units), o.level ?? null).filter(c => (seen.has(c.key) ? false : (seen.add(c.key), true)))
    })
    const count = lists.reduce((a, l) => a + l.length, 0)
    let k = 0
    for (let i = 0; i < nMoments; i++) {
      const out: Array<CardImage & { card: FormulaCard }> = []
      for (const card of lists[i]) {
        check()
        step(w.cards, k / Math.max(1, count), tl('正在生成公式卡片 {0}/{1}', [k + 1, count]))
        const img = await cardImage(card, { digits: o.digits, units: o.units, theme: o.theme, background: f.background, caption: `${timeLabel(o.moments[i].t, o.units)}${reducedAt(o.moments[i].t) ? tl(' · 精度降级，仅供参考') : ''}` }, { png: f.png || o.pptx, svgFonts: 'math' })
        out.push({ ...img, card })
        const stem = tl('公式卡片/{0}/{1}_{2}', [momentFileStem(i, o.moments[i]), String(out.length).padStart(2, '0'), safeName(card.formula.title)])
        if (f.png && img.png) files.push({ path: `${stem}.png`, data: img.png })
        if (f.svg) files.push({ path: `${stem}.svg`, data: img.svg })
        k++
      }
      cardsByMoment.push(out)
    }
    done += w.cards
  }

  // Data
  if (o.csv) {
    check()
    step(w.csv, 0, tl('正在写出 CSV'))
    const c = o.csv
    const fmt = { separator: c.separator, decimal: c.decimal, units: c.units, unitChoice: o.units }
    files.push({ path: tl('数据/{0}.csv', [base]), data: recordingCsv(rec, { ...fmt, ids: c.ids, stride: c.stride, from: 0, to: rec.frameCount - 1 }) })
    if (rec.events.some(e => e.changes.length > 0)) files.push({ path: tl('数据/事件.csv'), data: eventsCsv(rec, { ...fmt, labelOf: c => eventLabel(c), whoOf: c => changeWho(rec, c) }) })
    done += w.csv
  }

  // Derivations and step-by-step solutions (one page per formula and per key event)
  let derivations: DerivationPage[] = []
  if (o.derivations) {
    derivations = await derivationPages(rec, sits, o.moments, { digits: o.digits, units: o.units, lang: o.derivations.lang, theme: 'light', background: 'white', caption: o.title, level: o.level ?? null }, check, p => step(w.derivations, p, tl('正在生成推导与解题过程')))
    derivations.forEach((d, i) => {
      const stem = tl('推导与解题过程/{0}_{1}{2}', [String(i + 1).padStart(2, '0'), d.kind === 'event' ? tl('事件_') : '', safeName(d.title)])
      if (d.png) files.push({ path: `${stem}.png`, data: d.png })
    })
    done += w.derivations
  }

  // Slides
  if (o.pptx) {
    check()
    step(w.pptx, 0, tl('正在生成 PPTX'))
    const moments: DeckMoment[] = o.moments.map((m, i) => ({
      title: tl('关键时刻 {0} · {1}', [i + 1, timeLabel(m.t, o.units)]),
      subtitle: reducedAt(m.t) ? tl('{0}（精度降级区段，仅供参考）', [m.label]) : m.label,
      screenshot: shots[i] ?? null,
      formulas: (cardsByMoment[i] ?? []).filter(c => c.png).map(c => ({ png: c.png!, width: c.width * c.scale, height: c.height * c.scale, title: c.card.formula.title })),
      readouts: readoutsAt(rec, m.t, o.readoutIds, o.units, o.digits).map(r => ({ label: r.label, value: r.value }))
    }))
    let cover: DeckImage | null = null
    if (video && o.video) {
      cover = await stillPng(rec, o.video.t0, { ...o.still, width: 1280, height: 720, background: 'theme', overlay: { title: o.title } })
    }
    const bytes = await buildPptx({
      title: o.title,
      description: o.description,
      notice,
      meta: [tl('VeloPhi {0} · 仿真结果指纹 {1}…', [ENGINE_VERSION, fingerprintShort(rec, 16)]), tl('生成时间 {0}', [new Date().toLocaleString('zh-CN')]), tl('记录 {0} 帧，Δt = {1} s', [rec.frameCount, Number(rec.dt.toPrecision(6))])],
      moments,
      derivations: derivations.filter(d => d.png).map(d => ({ png: d.png!, width: d.width * d.scale, height: d.height * d.scale, title: d.title })),
      video: video ? { data: video.data, extension: video.extension, cover } : null
    })
    files.push({ path: `${base}.pptx`, data: bytes })
    done += w.pptx
  }

  files.push({ path: tl('说明.txt'), data: readmeText(rec, o, files.map(f => f.path), warnings) })
  progress(1, tl('完成'))
  return { files, warnings, video, notice }
}

/** All files in one ZIP under a root folder named after the scene. */
export function coursewareZip(files: CoursewareFile[], root: string): Uint8Array {
  const entries: ZipEntry[] = files.map(f => ({ name: `${safeName(root)}/${f.path}`, data: f.data }))
  return zipStore(entries)
}
