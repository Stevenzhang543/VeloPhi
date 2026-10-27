/**
 * Engine self-check of a release (26.51; 26.53 D69): started by the desktop app with
 * `velophi.exe --selftest <report.json>` from scripts/release.cmd. Inside the real WebView2 it runs every template
 * (bounded, legacy duration) three ways — the native engine of the desktop application, the WebAssembly core in the
 * worker, and the WebAssembly core on this thread (synchronously) — compares their fingerprints, writes the report
 * and closes the app (exit code 0 only when all agree and the native engine was used). Nothing happens without the
 * flag.
 */
import { TEMPLATES, buildTemplate } from '../templates'
import { simulate } from '../engine/recording'
import { initHost, nativeEngineInfo, setHost, workerHost } from '../engine/host'
import type { SimHost } from '../engine/host'
import { startSimulation } from './simClient'
import { ENGINE_VERSION } from '../core/scene/types'
import { isDesktop } from '../platform/files'

interface Row { template: string; native: string; worker: string; main: string; engine: string; same: boolean; error?: string; nativeMs?: number; workerMs?: number }

async function runOn(host: SimHost, id: string): Promise<{ hash: string; engine: string; ms: number }> {
  setHost(host)
  const scene = buildTemplate(id, {})
  let used = ''
  const t0 = performance.now()
  const handle = startSimulation(scene, { budgetMs: 120000, useWorker: true, progressive: false, duration: scene.settings.legacyDuration }, { onStats: s => { used = s.engine } })
  const rec = await handle.done
  const ms = performance.now() - t0
  rec?.session.free()
  return { hash: rec?.hash ?? '', engine: used, ms }
}

/** Run the self-check when the desktop app was started with --selftest; resolves false otherwise. */
export async function maybeSelfCheck(): Promise<boolean> {
  if (!isDesktop) return false
  const { invoke } = await import('@tauri-apps/api/core')
  const target = await invoke<string | null>('selftest_target').catch(() => null)
  if (!target) return false
  const rows: Row[] = []
  const started = Date.now()
  setHost(null)
  const native = await initHost()
  for (const t of TEMPLATES) {
    try {
      const n = await runOn(native, t.id)
      const w = await runOn(workerHost, t.id)
      const rec = simulate(buildTemplate(t.id, {}))
      const m = rec.hash
      rec.session.free()
      rows.push({ template: t.id, native: n.hash, worker: w.hash, main: m, engine: n.engine, same: !!m && n.hash === m && w.hash === m && n.engine === 'native', nativeMs: Math.round(n.ms), workerMs: Math.round(w.ms) })
    } catch (e) {
      rows.push({ template: t.id, native: '', worker: '', main: '', engine: '', same: false, error: (e as Error).message })
    }
  }
  setHost(native)
  const ok = rows.length > 0 && rows.every(r => r.same)
  const sum = (k: 'nativeMs' | 'workerMs') => rows.reduce((s, r) => s + (r[k] ?? 0), 0)
  const report = {
    ok, version: ENGINE_VERSION, native: nativeEngineInfo(), userAgent: navigator.userAgent, seconds: (Date.now() - started) / 1000, templates: rows.length,
    mismatches: rows.filter(r => !r.same).map(r => r.template), nativeMs: sum('nativeMs'), workerMs: sum('workerMs'), rows
  }
  await invoke('selftest_report', { path: target, report: JSON.stringify(report, null, 1), ok })
  return true
}
