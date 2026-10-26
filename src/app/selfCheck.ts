/**
 * Engine self-check of a release (26.51, carry-over 5 of 26.50): started by the desktop app with
 * `velophi.exe --selftest <report.json>` from scripts/release.cmd. Inside the real WebView2 it runs every template
 * (bounded, legacy duration) three ways — Rust/WebAssembly in the worker, TypeScript in the worker, TypeScript on
 * this thread — compares their fingerprints, writes the report and closes the app (exit code 0 only when all
 * agree). Nothing happens without the flag.
 */
import { TEMPLATES, buildTemplate } from '../templates'
import { simulate } from '../core/solver/simulation'
import { startSimulation } from './simClient'
import { ENGINE_VERSION } from '../core/scene/types'
import { isDesktop } from '../platform/files'

interface Row { template: string; wasm: string; workerTs: string; mainTs: string; engine: string; same: boolean; error?: string }

async function runWorker(id: string, engine: 'wasm' | 'ts'): Promise<{ hash: string; engine: string }> {
  const scene = buildTemplate(id, {})
  let used = 'ts'
  const handle = startSimulation(scene, { budgetMs: 120000, useWorker: true, progressive: false, duration: scene.settings.legacyDuration, engine }, { onStats: s => { used = s.engine } })
  const rec = await handle.done
  return { hash: rec?.hash ?? '', engine: used }
}

/** Run the self-check when the desktop app was started with --selftest; resolves false otherwise. */
export async function maybeSelfCheck(): Promise<boolean> {
  if (!isDesktop) return false
  const { invoke } = await import('@tauri-apps/api/core')
  const target = await invoke<string | null>('selftest_target').catch(() => null)
  if (!target) return false
  const rows: Row[] = []
  const started = Date.now()
  for (const t of TEMPLATES) {
    try {
      const w = await runWorker(t.id, 'wasm')
      const s = await runWorker(t.id, 'ts')
      const m = simulate(buildTemplate(t.id, {})).hash
      rows.push({ template: t.id, wasm: w.hash, workerTs: s.hash, mainTs: m, engine: w.engine, same: !!m && w.hash === m && s.hash === m && w.engine === 'wasm' })
    } catch (e) {
      rows.push({ template: t.id, wasm: '', workerTs: '', mainTs: '', engine: '', same: false, error: (e as Error).message })
    }
  }
  const ok = rows.length > 0 && rows.every(r => r.same)
  const report = { ok, version: ENGINE_VERSION, userAgent: navigator.userAgent, seconds: (Date.now() - started) / 1000, templates: rows.length, mismatches: rows.filter(r => !r.same).map(r => r.template), rows }
  await invoke('selftest_report', { path: target, report: JSON.stringify(report, null, 1), ok })
  return true
}
