#!/usr/bin/env node
/**
 * Performance baseline of 26.61 (roadmap §4 "渲染的分支决策", A8): three fixed scenes in the built app, measured in
 * Chromium — few bodies (斜面滑块), many bodies (高尔顿板, Soft Step) and a long recording with the curves open (单摆,
 * 120 s computed, playback at 4×). For each: time to the first frame, frame interval p50 / p95 / max while playing,
 * long frames (> 50 ms), the run's computing speed, the recording's memory and the JS heap. The numbers belong to the
 * machine that ran it (OS, browser, window, DPR, GPU or software rendering are printed with them); thresholds are set
 * from such measurements, not before.
 *
 * Usage: npx vite build && node scripts/perf-baseline.mjs   → .cache/perf/baseline.json
 */
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFileSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import os from 'node:os'

const { chromium } = createRequire(import.meta.url)('playwright')
const repo = resolve(new URL('..', import.meta.url).pathname)
const out = join(repo, '.cache', 'perf')
mkdirSync(out, { recursive: true })
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const srv = createServer((req, rsp) => {
  let p = decodeURIComponent((req.url ?? '/').split('?')[0]); if (p.endsWith('/')) p += 'index.html'
  const f = join(repo, 'dist', p)
  if (!existsSync(f) || !statSync(f).isFile()) { rsp.writeHead(404); rsp.end(); return }
  rsp.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' }); rsp.end(readFileSync(f))
})
await new Promise(r => srv.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${srv.address().port}/?uitest=1`

const browser = await chromium.launch()
const viewport = { width: 1600, height: 900 }
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))] : NaN }
const hook = (page, src, arg) => page.evaluate(([f, a]) => (0, eval)(`(${f})`)(window.__velophiTest, a), [src.toString(), arg])

async function scene(name, template, { computeTo = 0, speed = 1, chart = false, playMs = 5000 } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'zh-CN' })
  const page = await ctx.newPage()
  await page.goto(url)
  await page.waitForFunction(() => window.__velophiTest && window.__velophiTest.run().frames > 1, null, { timeout: 30000 })
  await page.locator('button:has-text("开始使用")').click({ timeout: 6000 }).catch(() => {})
  const t0 = Date.now()
  await page.click('[data-ui=templates]')
  await page.click(`.titem:has-text("${template}")`)
  await page.click('text=创建场景')
  await page.waitForFunction(() => { const T = window.__velophiTest; return !T.state.stale && T.run().frames > 2 }, null, { timeout: 60000 })
  const firstFrameMs = Date.now() - t0
  if (computeTo > 0) await page.waitForFunction(t => { const r = window.__velophiTest.run(); return (r.frames - 1) * r.dt >= t }, computeTo, { timeout: 180000 }).catch(() => {})
  if (chart) await page.click('[data-ui=bottom-chart]').catch(() => {})
  await hook(page, (T, s) => { T.state.speed = s; return true }, speed)
  await page.click('[data-ui=play]')
  const frames = await page.evaluate(ms => new Promise(res => {
    const d = []; let last = performance.now(); const end = last + ms
    const f = t => { d.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else res(d) }
    requestAnimationFrame(f)
  }), playMs)
  await page.click('[data-ui=play]').catch(() => {})
  const st = await hook(page, T => ({ run: T.run(), speed: T.state.run.speed, memory: T.state.run.memoryBytes, bodies: T.state.scene.bodies.length, engine: T.state.run.engine }))
  const heap = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : null))
  await ctx.close()
  const d = frames.slice(2)
  return { name, template, bodies: st.bodies, engine: st.engine, firstFrameMs, computed: (st.run.frames - 1) * st.run.dt, simSecondsPerSecond: st.speed, recordingMB: st.memory / 2 ** 20, heapMB: heap === null ? null : heap / 2 ** 20, frames: d.length, p50: pct(d, 0.5), p95: pct(d, 0.95), max: Math.max(...d), long: d.filter(x => x > 50).length }
}

const rows = []
rows.push(await scene('few bodies', '斜面滑块'))
rows.push(await scene('many bodies (Soft Step)', '高尔顿板', { playMs: 6000 }))
rows.push(await scene('long recording + curves', '单摆', { computeTo: 120, speed: 4, chart: true }))
const env = { os: `${os.type()} ${os.release()} ${os.arch()}`, cpus: `${os.cpus().length} × ${os.cpus()[0]?.model ?? '?'}`, browser: `Chromium ${browser.version()} (headless)`, viewport: `${viewport.width}×${viewport.height}`, dpr: 1, at: new Date().toISOString() }
writeFileSync(join(out, 'baseline.json'), JSON.stringify({ env, rows }, null, 1))
console.log(JSON.stringify(env))
console.log('scene | bodies | engine | first frame ms | p50 ms | p95 ms | max ms | long | sim s/s | recording MB | heap MB')
for (const r of rows) console.log(`${r.name} | ${r.bodies} | ${r.engine} | ${r.firstFrameMs} | ${r.p50.toFixed(1)} | ${r.p95.toFixed(1)} | ${r.max.toFixed(1)} | ${r.long} | ${r.simSecondsPerSecond.toFixed(1)} | ${r.recordingMB.toFixed(1)} | ${r.heapMB?.toFixed(1) ?? '—'}`)
await browser.close()
srv.close()
