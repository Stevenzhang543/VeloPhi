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
    await page.waitForFunction(() => !document.querySelector('.viewport .badge.info') && !document.querySelector('.viewport .badge.warn'))
    await page.waitForTimeout(600)
    await page.click('.right .tabs button:has-text("场景")')
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
;(async () => {
  const out = {}
  for (const t of TEMPLATES) {
    let partials = 0
    const viaWorker = await startSimulation(buildTemplate(t.id), { budgetMs: 120000, useWorker: true, progressive: true }, { onPartial: () => { partials++ } }).done
    const here = await startSimulation(buildTemplate(t.id), { budgetMs: 120000, useWorker: false, progressive: false }).done
    out[t.name] = { worker: viaWorker.hash, main: here.hash, partials }
  }
  window.__result = { out, workers }
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
  const types = { '.html': 'text/html', '.js': 'text/javascript' }
  const server = http.createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'))
    if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' })
    fs.createReadStream(p).pipe(res)
  })
  await new Promise(r => server.listen(0, r))
  const browser = await chromium.launch()
  const page = await browser.newPage()
  page.on('pageerror', e => console.log('page error:', e.message))
  await page.goto(`http://localhost:${server.address().port}/`)
  await page.waitForFunction(() => window.__result, null, { timeout: 600000 })
  const r = await page.evaluate(() => window.__result)
  await browser.close()
  server.close()
  if (r.error) { console.log(r.error); return 1 }
  let failed = 0
  for (const [name, hash] of Object.entries(expected)) {
    const got = r.out[name]
    const ok = !!got && got.worker === hash && got.main === hash
    if (!ok) failed++
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name} worker ${got && got.worker} main ${got && got.main} (${got ? got.partials : 0} partial)${ok ? '' : ' expected ' + hash}`)
  }
  console.log(`${Object.keys(expected).length - failed}/${Object.keys(expected).length} identical (Web Worker and main thread) in Chromium, ${r.workers} workers started`)
  if (r.workers < Object.keys(expected).length) { console.log('FAIL: the Web Worker was not used'); failed++ }
  return failed
}

;(async () => {
  const failed = process.argv.includes('--worker') ? await workerCheck() : await uiCheck()
  process.exit(failed ? 1 : 0)
})()
