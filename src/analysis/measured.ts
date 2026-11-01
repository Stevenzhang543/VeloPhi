/**
 * Measured data (26.58, D141, EDU08): a CSV table from a lab (a motion sensor, a video analysis, a hand-timed
 * table) laid over the simulated curves. Only parsing, unit conversion, alignment and the RMS deviation — no
 * fitting. Values are stored in SI in `scene.extra.measured` (saved with the scene, undoable) and exported with it.
 */
import type { Scene } from '../core/scene/types'
import type { UnitOption } from '../units/units'
import { kindInfo, kindOf } from '../units/units'

/** A column of the table: its header name and the unit written in the header (“x (cm)”, “v [m/s]”, “t/s”). */
export interface MeasuredColumn { name: string; unit: string }
export interface MeasuredTable { columns: MeasuredColumn[]; rows: number[][] }

/** One imported series: the quantity it is laid over, times (s) and values (SI). */
export interface MeasuredSeries { id: string; label: string; t: number[]; v: number[] }

export class MeasuredError extends Error {}

const UNIT_RE = /^(.*?)\s*(?:\(([^)]*)\)|\[([^\]]*)\]|\/\s*([^/]+))\s*$/

/** Split a header cell into name and unit. */
export function headerUnit(cell: string): MeasuredColumn {
  const s = cell.trim().replace(/^"(.*)"$/, '$1')
  const m = UNIT_RE.exec(s)
  if (m && m[1].trim()) return { name: m[1].trim(), unit: (m[2] ?? m[3] ?? m[4] ?? '').trim() }
  return { name: s, unit: '' }
}

/**
 * Parse CSV text: separator `,`, `;` or tab (the most frequent in the first line); with `;` or tab a decimal
 * comma is accepted. The first line is a header when it is not all numbers. Empty cells are NaN; rows without a
 * number are skipped. At most 20 000 rows and 32 columns.
 */
export function parseMeasuredCsv(text: string): MeasuredTable {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  if (!lines.length) throw new MeasuredError('empty')
  const count = (c: string) => lines[0].split(c).length - 1
  const sep = [',', ';', '\t'].reduce((best, c) => (count(c) > count(best) ? c : best), ',')
  const commaDecimal = sep !== ','
  const num = (cell: string): number => {
    const t = cell.trim().replace(/^"(.*)"$/, '$1')
    if (!t) return NaN
    const v = Number(commaDecimal ? t.replace(',', '.') : t)
    return Number.isFinite(v) ? v : NaN
  }
  const cells = lines.map(l => l.split(sep))
  const headerIsText = cells[0].some(c => c.trim() !== '' && Number.isNaN(num(c)))
  const width = Math.min(32, Math.max(...cells.map(r => r.length)))
  if (width < 2) throw new MeasuredError('columns')
  const columns: MeasuredColumn[] = []
  for (let i = 0; i < width; i++) columns.push(headerIsText ? headerUnit(cells[0][i] ?? '') : { name: `${i + 1}`, unit: '' })
  const rows: number[][] = []
  for (const r of cells.slice(headerIsText ? 1 : 0)) {
    const row = Array.from({ length: width }, (_, i) => num(r[i] ?? ''))
    if (row.some(Number.isFinite)) rows.push(row)
    if (rows.length > 20000) throw new MeasuredError('rows')
  }
  if (!rows.length) throw new MeasuredError('rows')
  return { columns, rows }
}

/** The display option of a header unit for a quantity's SI unit (by id or label; '' or unknown: SI). */
export function unitOptionFor(siUnit: string, unit: string): UnitOption | null {
  const kind = kindOf(siUnit)
  if (!kind) return null
  const u = unit.trim().replace('^2', '²').replace('**2', '²')
  return kindInfo(kind).options.find(o => o.id === u || o.label === u) ?? null
}

/** Convert a value in a display option to SI. */
export function toSi(v: number, o: UnitOption | null): number {
  if (!o) return v
  return (o.inv ? v / o.inv : v * o.factor) + (o.offset ?? 0)
}

/** One series from a table: time column, value column, the quantity (SI unit) and the units of both columns. */
export function seriesFrom(table: MeasuredTable, timeCol: number, col: number, id: string, label: string, siUnit: string, timeUnit: UnitOption | null, valueUnit: UnitOption | null): MeasuredSeries {
  const t: number[] = [], v: number[] = []
  for (const r of table.rows) {
    const tt = r[timeCol], vv = r[col]
    if (!Number.isFinite(tt) || !Number.isFinite(vv)) continue
    t.push(toSi(tt, timeUnit))
    v.push(toSi(vv, valueUnit))
  }
  void siUnit
  return { id, label, t, v }
}

/** Root-mean-square deviation of the measured points from the simulated curve (linear interpolation in time); points outside the simulated time are left out. */
export function rmsDeviation(m: MeasuredSeries, simT: ArrayLike<number>, simV: ArrayLike<number>): { rms: number; n: number } | null {
  if (simT.length < 2) return null
  let sum = 0, n = 0, j = 0
  for (let i = 0; i < m.t.length; i++) {
    const t = m.t[i]
    if (t < simT[0] || t > simT[simT.length - 1]) continue
    while (j + 1 < simT.length && simT[j + 1] < t) j++
    const k = Math.min(j + 1, simT.length - 1)
    const span = simT[k] - simT[j]
    const s = span > 0 ? simV[j] + ((t - simT[j]) / span) * (simV[k] - simV[j]) : simV[j]
    if (!Number.isFinite(s)) continue
    sum += (m.v[i] - s) ** 2
    n++
  }
  return n ? { rms: Math.sqrt(sum / n), n } : null
}

export function readMeasured(scene: Scene): MeasuredSeries[] {
  const raw = (scene.extra as { measured?: unknown } | undefined)?.measured
  if (!Array.isArray(raw)) return []
  return raw.filter((m): m is MeasuredSeries => !!m && typeof m === 'object' && typeof (m as MeasuredSeries).id === 'string'
    && Array.isArray((m as MeasuredSeries).t) && Array.isArray((m as MeasuredSeries).v) && (m as MeasuredSeries).t.length === (m as MeasuredSeries).v.length)
}

/** Store the measured series in the scene (use inside `edit()`); an empty list removes the field. */
export function writeMeasured(scene: Scene, list: MeasuredSeries[]) {
  const extra = { ...(scene.extra ?? {}) }
  if (list.length) extra.measured = JSON.parse(JSON.stringify(list)) as unknown
  else delete extra.measured
  if (Object.keys(extra).length) scene.extra = extra
  else delete scene.extra
}
