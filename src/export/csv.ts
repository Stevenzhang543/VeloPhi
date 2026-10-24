/**
 * CSV export of recorded quantities. Values are written with full double precision (shortest round-trip
 * form) so the numbers in a spreadsheet are exactly the solver's. A UTF-8 BOM lets Excel read the Chinese
 * headers; '#' comment lines record where the data came from.
 */
import type { Recording } from '../core/solver/simulation'
import { listQuantities, quantitySeries } from '../core/observe/quantities'
import { ENGINE_VERSION } from '../core/scene/types'

export interface CsvOptions { ids: string[]; stride: number; from: number; to: number }

export function recordingCsv(rec: Recording, opts: CsvOptions): string {
  const defs = new Map(listQuantities(rec.system).map(q => [q.id, q]))
  const ids = opts.ids.filter(id => defs.has(id))
  const { t, values } = quantitySeries(rec, ids, opts.from, opts.to, Math.max(1, Math.round(opts.stride)))
  const s = rec.scene.settings
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const lines: string[] = []
  lines.push(`# Verity ${ENGINE_VERSION}`)
  lines.push(`# 场景: ${rec.scene.name}`)
  lines.push(`# 记录步长 Δt = ${rec.dt} s; 积分方法 ${s.integrator}; 相对容差 ${s.relTol}; 绝对容差 ${s.absTol}; g = (${s.gravity.x}, ${s.gravity.y}) m/s²`)
  lines.push(`# 结果指纹 SHA-256 ${rec.hash}`)
  lines.push(['t [s]', ...ids.map(id => { const q = defs.get(id)!; return esc(`${q.owner} ${q.label} [${q.unit || '1'}] (${id})`) })].join(','))
  for (let i = 0; i < t.length; i++) {
    const row = [String(t[i])]
    for (const v of values) row.push(Number.isFinite(v[i]) ? String(v[i]) : '')
    lines.push(row.join(','))
  }
  return '﻿' + lines.join('\r\n') + '\r\n'
}

/** Default columns: every body's position, velocity and acceleration plus the watch list and energies. */
export function defaultCsvIds(rec: Recording): string[] {
  const ids: string[] = []
  for (const b of rec.system.model.dynamic) for (const k of ['x', 'y', 'vx', 'vy', 'ax', 'ay']) ids.push(`${b.id}.${k}`)
  for (const w of rec.scene.watch) if (!ids.includes(w)) ids.push(w)
  for (const e of ['system.ek', 'system.ep', 'system.es', 'system.e', 'ledger.balance']) if (!ids.includes(e)) ids.push(e)
  return ids
}
