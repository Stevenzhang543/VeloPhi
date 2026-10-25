/**
 * Cross-engine reproducibility check: every template is simulated in Chromium and its recording
 * fingerprint is compared with the one computed in Node (tests/hashes.test.ts → .cache/node-hashes.json).
 *
 *   node scripts/check-browser-hashes.cjs
 *     The built app, through its UI (the fingerprint is shown in the scene tab of the right panel). Usage:
 *       npx vite build && npx vite preview --port 5179 &
 *       npx vitest run tests/hashes.test.ts; node scripts/check-browser-hashes.cjs
 *   node scripts/check-browser-hashes.cjs --worker
 *     No UI: a small page (generated in .cache/worker-check and built with Vite) runs every template through
 *     app/simClient with the Web Worker, and once more on the page's main thread; both must equal Node. Usage:
 *       npx vitest run tests/hashes.test.ts; node scripts/check-browser-hashes.cjs --worker
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const http = require('http')

const repo = path.resolve(__dirname, '..')
const expected = JSON.parse(fs.readFileSync(path.join(repo, '.cache/node-hashes.json'), 'utf8'))

async function uiCheck() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, locale: 'zh-CN' })
  page.on('dialog', d => d.accept())
  await page.goto(process.env.VERITY_URL || 'http://localhost:5179/')
  await page.waitForTimeout(1500)
  let failed = 0
  for (const [name, hash] of Object.entries(expected)) {
    await page.click('text=模板')
    await page.click(`.titem:has-text("${name}")`)
    await page.click('text=创建场景')
    // Templates are unbounded (26.50): stop at their former duration, which reproduces the 26.49 fingerprint
    await page.click('.right .tabs button:has-text("场景")')
    await page.selectOption('.right select:has(option[value="unbounded"])', 'time')
    await page.waitForTimeout(400)
    await page.waitForFunction(() => !document.querySelector('.viewport .badge.info') && !document.querySelector('.viewport .badge.warn'))
    await page.waitForTimeout(600)
    const got = await page.$eval('.fp', el => el.getAttribute('title'))
    const ok = got === hash
    if (!ok) failed++
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${got}${ok ? '' : ' expected ' + hash}`)
  }
  console.log(`${Object.keys(expected).length - failed}/${Object.keys(expected).length} identical in ${await browser.version()}`)
  await browser.close()
  return failed
}

const HARNESS_MAIN = src => `
import { TEMPLATES, buildTemplate } from '${src}/templates'
import { startSimulation } from '${src}/app/simClient'
const W = window.Worker
let workers = 0
window.Worker = class extends W { constructor(u, o) { super(u, o); workers++ } }
async function run(id, useWorker, engine, duration) {
  let partials = 0, used = null, reason = null
  const t0 = performance.now()
  const rec = await startSimulation(buildTemplate(id), { budgetMs: 120000, useWorker, progressive: useWorker, duration, engine }, { onPartial: () => { partials++ }, onStats: s => { used = s.engine; reason = s.engineReason } }).done
  return { hash: rec.hash, rolling: rec.rolling ? rec.rolling.hash : null, frames: rec.frameCount, partials, engine: used, reason, ms: performance.now() - t0 }
}
;(async () => {
  const out = {}
  const only = new URLSearchParams(location.search).get('only')
  for (const t of TEMPLATES) {
    if (only && t.id !== only) continue
    // Templates are unbounded (26.50): run them for their former duration (the 26.49 fingerprint)
    const duration = buildTemplate(t.id).settings.legacyDuration
    const wasm = await run(t.id, true, 'auto', duration)
    const ts = await run(t.id, true, 'ts', duration)
    const main = await run(t.id, false, 'auto', duration)
    out[t.name] = { wasm, ts, main }
  }
  // An unbounded run streams: 30 s of the pendulum through each engine, same rolling fingerprint
  const unb = {}
  for (const engine of ['auto', 'ts']) {
    const h = startSimulation(buildTemplate('pendulum'), { budgetMs: 120000, useWorker: true, progressive: true, duration: null, lookAhead: 30, engine }, {})
    await new Promise(r => setTimeout(r, 3000))
    h.stop()
    const rec = await h.done
    unb[engine] = { frames: rec.frameCount, rolling: rec.rolling ? rec.rolling.hash : null, t: rec.rolling ? rec.rolling.t : null }
  }
  window.__result = { out, unb, workers }
})().catch(e => { window.__result = { error: String(e && e.stack || e) } })
`

async function workerCheck() {
  const dir = path.join(repo, '.cache/worker-check')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="./main.ts"></script></body></html>\n')
  fs.writeFileSync(path.join(dir, 'main.ts'), HARNESS_MAIN(path.join(repo, 'src').split(path.sep).join('/')))
  const vite = await import(path.join(repo, 'node_modules/vite/dist/node/index.js'))
  await vite.build({ configFile: false, root: dir, base: './', worker: { format: 'es' }, build: { outDir: 'out', emptyOutDir: true, target: 'es2022' }, logLevel: 'warn' })
  const root = path.join(dir, 'out')
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm' }
  const server = http.createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'))
    if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' })
    fs.createReadStream(p).pipe(res)
  })
  await new Promise(r => server.listen(0, r))
  const browser = await chromium.launch()
  let failed = 0
  // 1. Normal page: WASM in the worker, TypeScript in the worker, TypeScript on the page
  {
    const page = await browser.newPage()
    page.on('pageerror', e => console.log('page error:', e.message))
    await page.goto(`http://localhost:${server.address().port}/`)
    await page.waitForFunction(() => window.__result, null, { timeout: 600000 })
    const r = await page.evaluate(() => window.__result)
    await page.close()
    if (r.error) { console.log(r.error); return 1 }
    let tsMs = 0, wasmMs = 0
    for (const [name, hash] of Object.entries(expected)) {
      const g = r.out[name]
      const ok = !!g && g.wasm.hash === hash && g.ts.hash === hash && g.main.hash === hash && g.wasm.engine === 'wasm' && g.ts.engine === 'ts'
      if (!ok) failed++
      if (g) { tsMs += g.ts.ms; wasmMs += g.wasm.ms }
      console.log(`${ok ? 'PASS' : 'FAIL'} ${name} wasm ${g && g.wasm.hash.slice(0, 12)} (${g && g.wasm.engine}, ${g && g.wasm.partials} partial) ts ${g && g.ts.hash.slice(0, 12)} main ${g && g.main.hash.slice(0, 12)}${ok ? '' : ' expected ' + hash}`)
    }
    console.log(`${Object.keys(expected).length - failed}/${Object.keys(expected).length} identical (Rust/WASM worker, TypeScript worker, main thread) in Chromium, ${r.workers} workers started; wall time incl. worker start: TS ${tsMs.toFixed(0)} ms, WASM ${wasmMs.toFixed(0)} ms`)
    const u = r.unb
    console.log(`unbounded pendulum, 3 s wall: WASM ${u.auto.frames} frames rolling ${u.auto.rolling && u.auto.rolling.slice(0, 12)} @ ${u.auto.t} s; TS ${u.ts.frames} frames rolling ${u.ts.rolling && u.ts.rolling.slice(0, 12)} @ ${u.ts.t} s`)
    if (r.workers < Object.keys(expected).length) { console.log('FAIL: the Web Worker was not used'); failed++ }
  }
  // 2. The .wasm request fails: the worker falls back to TypeScript and says why
  {
    const page = await browser.newPage()
    await page.route(/\.wasm(\?|$)/, route => route.abort())
    await page.goto(`http://localhost:${server.address().port}/?only=incline`)
    await page.waitForFunction(() => window.__result, null, { timeout: 120000 })
    const r = await page.evaluate(() => window.__result)
    await page.close()
    const g = r.out && r.out[Object.keys(r.out)[0]]
    const ok = !!g && g.wasm.engine === 'ts' && !!g.wasm.reason && g.wasm.hash === g.ts.hash
    if (!ok) failed++
    console.log(`${ok ? 'PASS' : 'FAIL'} fallback when the WASM file cannot be loaded: engine ${g && g.wasm.engine}, reason "${g && g.wasm.reason}"`)
  }
  await browser.close()
  server.close()
  return failed
}

;(async () => {
  const failed = process.argv.includes('--worker') ? await workerCheck() : await uiCheck()
  process.exit(failed ? 1 : 0)
})()
