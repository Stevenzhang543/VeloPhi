/**
 * CSV export of recorded quantities. In SI mode values are written with full double precision (shortest
 * round-trip form) so the numbers in a spreadsheet are exactly the solver's; in display mode they are converted
 * to the chosen display units (one multiplication, so the last digit may differ from SI). Every column header
 * names its unit explicitly. A UTF-8 BOM lets Excel read the Chinese headers; '#' comment lines record where
 * the data came from.
 *
 * Separator and decimal mark follow the export settings. When both would be ',' the separator becomes ';'
 * (the convention of spreadsheets in comma-decimal locales) so that no number has to be quoted.
 */
import { tl } from '../i18n'
import type { ChangeDetail, Recording } from '../engine/recording'
import { listQuantities, quantitySeries } from '../engine/observe'
import { ENGINE_VERSION } from '../core/scene/types'
import type { UnitChoice } from '../units/units'
import { displayLabel, toDisplay } from '../units/units'
import { fingerprintText } from './fingerprint'
import { manifest } from '../engine/models'

/** Field separator of CSV exports. */
export type CsvSeparator = ',' | ';' | '\t'
/** Decimal mark of CSV exports. */
export type CsvDecimal = '.' | ','

/** Separator and decimal mark (defaults ',' and '.'). */
export interface CsvFormat {
  separator?: CsvSeparator
  decimal?: CsvDecimal
}

/** Options of recordingCsv: quantity ids, frame range [from, to] and stride. */
export interface CsvOptions extends CsvFormat {
  ids: string[]
  stride: number
  from: number
  to: number
  /** 'si' (default): SI values with SI units in the headers; 'display': converted to `unitChoice`. */
  units?: 'si' | 'display'
  /** Display unit choice (required for units = 'display'). */
  unitChoice?: UnitChoice
}

/** Separator actually used: never equal to the decimal mark. */
export function effectiveSeparator(f: CsvFormat): CsvSeparator {
  const sep = f.separator ?? ','
  return sep === ',' && (f.decimal ?? '.') === ',' ? ';' : sep
}

/** Number cell: shortest round-trip form, decimal mark applied; empty for non-finite values. */
export function csvNumber(v: number, decimal: CsvDecimal = '.'): string {
  if (!Number.isFinite(v)) return ''
  const s = String(v)
  return decimal === ',' ? s.replace('.', ',') : s
}

/** Text cell, quoted when it contains the separator, a quote or a line break. */
export function csvText(v: string, sep: CsvSeparator): string {
  return v.includes(sep) || /["\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/**
 * Generic table: header row plus rows of numbers or text; `comments` become '#' lines at the top.
 * Returns the file text with BOM and CRLF line ends.
 */
export function tableCsv(header: string[], rows: Array<Array<number | string | null>>, f: CsvFormat = {}, comments: string[] = []): string {
  const sep = effectiveSeparator(f)
  const dec = f.decimal ?? '.'
  const cell = (v: number | string | null) => (v === null ? '' : typeof v === 'number' ? csvNumber(v, dec) : csvText(v, sep))
  const lines = comments.map(c => `# ${c}`)
  lines.push(header.map(h => csvText(h, sep)).join(sep))
  for (const r of rows) lines.push(r.map(cell).join(sep))
  return '﻿' + lines.join('\r\n') + '\r\n'
}

/** CSV of quantities over the recorded frames, with '#' lines describing the run. */
export function recordingCsv(rec: Recording, opts: CsvOptions): string {
  const defs = new Map(listQuantities(rec).map(q => [q.id, q]))
  const ids = opts.ids.filter(id => defs.has(id))
  const { t, values } = quantitySeries(rec, ids, opts.from, opts.to, Math.max(1, Math.round(opts.stride)))
  const display = opts.units === 'display' && !!opts.unitChoice
  const choice = opts.unitChoice
  const conv = (v: number, unit: string) => (display ? toDisplay(v, unit, choice!) : v)
  const label = (unit: string) => (display ? displayLabel(unit, choice!) : unit) || '1'
  const s = rec.scene.settings
  const sep = effectiveSeparator(opts)
  const comments = [
    `VeloPhi ${ENGINE_VERSION}`,
    tl('场景: {0}', [rec.scene.name]),
    tl('记录步长 Δt = {0} s; 积分方法 {1}; 相对容差 {2}; 绝对容差 {3}; g = ({4}, {5}) m/s²', [rec.dt, s.integrator, s.relTol, s.absTol, s.gravity.x, s.gravity.y]),
    tl('结果指纹 {0}', [fingerprintText(rec)]),
    // 26.56 (ENG13, D104): the run manifest of the core
    ...runManifestLines(rec),
    display ? tl('数值单位: 显示单位（由国际单位换算，见各列表头）') : tl('数值单位: 国际单位（SI，见各列表头）；数值为双精度完整写出，与仿真结果逐位一致'),
    tl('分隔符 {0}，小数点 “{1}”', [sep === '\t' ? tl('制表符') : `“${sep}”`, opts.decimal ?? '.']),
    ...(s.startTime ? [tl('分支：从 t = {0} s 开始，表中 t 为绝对时间', [s.startTime])] : [])
  ]
  const header = [`t [${label('s')}]`, ...ids.map(id => { const q = defs.get(id)!; return `${q.owner} ${q.label} [${label(q.unit)}] (${id})` })]
  const units = ids.map(id => defs.get(id)!.unit)
  const rows: number[][] = []
  for (let i = 0; i < t.length; i++) {
    const row = [conv(t[i] + (s.startTime ?? 0), 's')]
    values.forEach((v, j) => row.push(conv(v[i], units[j])))
    rows.push(row)
  }
  return tableCsv(header, rows, opts, comments)
}

/** '#' lines of the run manifest: core, scene format, backend and its physics version, constant set, scene hash. */
export function runManifestLines(rec: Recording): string[] {
  try {
    // rigid-body scenes keep the Coulomb constant of 26.55 (CODATA 2018) so that their fingerprints stay (D97, D100)
    const m = manifest('rigid', JSON.stringify(rec.scene), 'CODATA2018')
    return [tl('运行清单: 核心 {0}; 场景格式 {1}; 后端 {2}（物理版本 {3}，{4}）; 常数 {6}; 场景 SHA-256 {5}', [m.core, m.sceneFormat, m.backend, m.physicsVersion ?? '—', m.solver ?? '—', m.inputSha256 ?? '—', m.constantsSet])]
  } catch {
    return []
  }
}

/** Default columns: every body's position, velocity and acceleration plus the watch list and energies. */
export function defaultCsvIds(rec: Recording): string[] {
  const ids: string[] = []
  for (const b of rec.system.model.dynamic) for (const k of ['x', 'y', 'vx', 'vy', 'ax', 'ay']) ids.push(`${b.id}.${k}`)
  for (const w of rec.scene.watch) if (!ids.includes(w)) ids.push(w)
  for (const e of ['system.ek', 'system.ep', 'system.es', 'system.e', 'ledger.balance']) if (!ids.includes(e)) ids.push(e)
  return ids
}

/** Events table (impacts, sticking, slack …) as CSV: time, change, objects and impact data. */
export function eventsCsv(rec: Recording, opts: CsvFormat & { units?: 'si' | 'display'; unitChoice?: UnitChoice; labelOf: (c: ChangeDetail) => string; whoOf: (c: ChangeDetail) => string }): string {
  const display = opts.units === 'display' && !!opts.unitChoice
  const conv = (v: number | undefined, unit: string) => (v === undefined ? null : display ? toDisplay(v, unit, opts.unitChoice!) : v)
  const label = (unit: string) => (display ? displayLabel(unit, opts.unitChoice!) : unit)
  const header = [`t [${label('s')}]`, tl('事件'), tl('对象'), tl('碰前法向速度 [{0}]', [label('m/s')]), tl('碰后法向速度 [{0}]', [label('m/s')]), tl('冲量 [{0}]', [label('N·s')]), tl('摩擦冲量 [{0}]', [label('N·s')]), tl('恢复系数'), tl('本次损失动能 [{0}]', [label('J')])]
  const rows: Array<Array<number | string | null>> = []
  for (const e of rec.events) {
    e.changes.forEach((c, i) => rows.push([
      conv(e.t, 's'), opts.labelOf(c), opts.whoOf(c),
      conv(c.vnBefore, 'm/s'), conv(c.vnAfter, 'm/s'), conv(c.impulse, 'N·s'), conv(c.tangentImpulse, 'N·s'), c.restitution ?? null,
      i === 0 && e.impact ? conv(e.impact.loss, 'J') : null
    ]))
  }
  const comments = [`VeloPhi ${ENGINE_VERSION}`, tl('场景: {0}', [rec.scene.name]), tl('结果指纹 {0}', [fingerprintText(rec)]), tl('事件时刻由求解器精确定位（约 1e-12 s）')]
  if (rec.reducedFrom !== null && rec.reducedFrom !== undefined) comments.push(tl('精度降级: 自 t = {0} s 起改用 Moreau–Jean 时间步进，此后的事件时刻不精确定位', [rec.reducedFrom]))
  return tableCsv(header, rows, opts, comments)
}
