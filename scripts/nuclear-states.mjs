#!/usr/bin/env node
/**
 * States of the nuclide pages and the reactor workshop, photographed and measured (26.64, D276–D278; the part of the
 * screenshot wall of D259 that belongs to 物理实验 › 原子与核). Real app in Chromium, the build served from
 * VELOPHI_DIST (default dist/).
 *
 * Measured (the script exits 1 when one fails):
 *   - a frame of the chart of nuclides while panning costs less than 4 ms (95th percentile of the frames drawn during
 *     scripted drags) — at the whole-chart zoom and at a zoom where every visible cell carries its label;
 *   - no page scrolls sideways at 1440 × 900 or on a phone (390 × 844) in Chinese, English or German.
 * Screenshots go to .cache/ui-states/26.64/nuclear/ — look at them.
 *
 * Usage: node node_modules/vite/bin/vite.js build --outDir .cache/dist-nuc && VELOPHI_DIST=.cache/dist-nuc node scripts/nuclear-states.mjs
 */
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFileSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(import.meta.url)('playwright')
const repo = resolve(fileURLToPath(new URL('..', import.meta.url)))
const out = join(repo, '.cache', 'ui-states', '26.64', 'nuclear')
mkdirSync(out, { recursive: true })

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png' }
function serve(dir) {
  return new Promise(res => {
    const srv = createServer((req, rsp) => {
      let p = decodeURIComponent((req.url ?? '/').split('?')[0])
      if (p.endsWith('/')) p += 'index.html'
      const f = join(dir, p)
      if (!f.startsWith(dir) || !existsSync(f) || !statSync(f).isFile()) { rsp.writeHead(404); rsp.end(); return }
      rsp.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' })
      rsp.end(readFileSync(f))
    })
    srv.listen(0, '127.0.0.1', () => res(srv))
  })
}
const srv = await serve(resolve(repo, process.env.VELOPHI_DIST ?? 'dist'))
const URL0 = `http://127.0.0.1:${srv.address().port}/`
const browser = await chromium.launch()
const report = { url: URL0, browser: browser.version(), checks: [], shots: [], perf: {} }
const fail = []
const check = (ok, what, got) => { report.checks.push({ ok: !!ok, what, got }); if (!ok) fail.push(`${what}${got === undefined ? '' : ` (got ${JSON.stringify(got)})`}`) }
const hook = (page, f, arg) => page.evaluate(([src, a]) => { const T = window.__velophiTest; return (0, eval)(`(${src})`)(T, a) }, [f.toString(), arg])
async function until(page, f, arg, ms = 30000) {
  const t0 = Date.now()
  for (;;) {
    const v = await hook(page, f, arg).catch(() => null)
    if (v) return v
    if (Date.now() - t0 > ms) throw new Error(`timed out: ${f.toString().slice(0, 120)}`)
    await page.waitForTimeout(100)
  }
}

async function open(o = {}) {
  const ctx = await browser.newContext({ viewport: o.phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: o.phone ? 2 : 1, hasTouch: !!o.phone, locale: 'zh-CN' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  // the build asks a server for the AI service's state; in the test that request fails, which is not ours
  page.on('console', m => { if (m.type() === 'error' && !/CORS|Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(m.text()) })
  await page.goto(`${URL0}?uitest=1${o.hash ?? ''}`)
  await page.waitForFunction(() => window.__velophiTest && window.__velophiTest.run().frames > 1, null, { timeout: 30000 })
  await hook(page, (T, v) => { T.settings.ui.welcomed = true; T.state.showWelcome = false; T.state.tourStep = null; T.settings.language = v.lang ?? 'zh'; T.settings.themeMode = v.theme ?? 'light'; return true }, o)
  await page.evaluate(() => document.fonts.ready)
  return { ctx, page, errors }
}
async function shot(page, name) {
  await page.waitForTimeout(350)
  await page.screenshot({ path: join(out, `${name}.png`) })
  report.shots.push(name)
  // read once the page has settled: right after a scripted scroll on the phone the reading is 10 px too wide in some
  // runs and 0 a moment later (the scroll bar of the page while it is shown); a real overflow stays
  let wide = 0
  for (let i = 0; i < 8; i++) {
    wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    if (wide <= 0) break
    await page.waitForTimeout(250)
  }
  check(wide <= 0, `${name}: the page does not scroll sideways`, wide)
}
const openLab = (page, id) => hook(page, (T, lab) => { T.settings.ui.lab = lab; T.state.page = 'lab'; return true }, id)

// ---- the chart of nuclides ----
{
  const { ctx, page, errors } = await open({ hash: '#n=U-235' })
  await until(page, T => T.nuclides && T.nuclides.table() && T.nuclides.page())
  check((await hook(page, T => T.nuclides.page().id)) === 'U-235', 'the address #n=U-235 opens the page of U-235')
  await shot(page, 'chart-zh-light-U235')
  await page.click('[data-ui=nuclide-fit]')
  await shot(page, 'chart-zh-light-whole')

  // cost of a frame while panning: the whole chart, then a zoom where the visible cells are labelled
  const box = await page.locator('[data-ui=nuclide-chart] canvas').boundingBox()
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  async function pan(label) {
    await hook(page, T => { T.nuclides.stats.reset(); return true })
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    for (let i = 1; i <= 90; i++) { await page.mouse.move(cx + 160 * Math.sin(i / 9), cy + 90 * Math.sin(i / 6)); await page.waitForTimeout(16) }
    await page.mouse.up()
    const s = await hook(page, T => T.nuclides.stats.summary())
    const scale = await hook(page, T => T.nuclides.view().scale)
    report.perf[label] = { ...s, scale }
    check(s.frames >= 30, `${label}: frames were drawn while panning`, s.frames)
    check(s.p95 < 4, `${label}: a frame costs less than 4 ms (95th percentile)`, s)
  }
  await pan('pan, whole chart')
  await hook(page, T => { T.nuclides.select('U-235'); return true })
  await page.waitForTimeout(300)
  await pan('pan, labelled cells')
  for (let i = 0; i < 4; i++) await page.click('[data-ui=nuclide-zoom-in]')
  await page.waitForTimeout(200)
  await pan('pan, largest cells')

  // search by a Chinese name
  await page.fill('[data-ui=nuclide-search]', '锝99m')
  await page.waitForSelector('[data-ui=nuclide-hits] [data-nuclide="Tc-99m"]')
  await shot(page, 'chart-zh-search')
  await page.keyboard.press('Enter')
  await until(page, T => T.nuclides.page().id === 'Tc-99m')
  await shot(page, 'chart-zh-light-Tc99m')

  await hook(page, T => { T.settings.language = 'en'; T.settings.themeMode = 'dark'; T.nuclides.S.scheme = 'halfLife'; T.nuclides.select('Cs-137'); return true })
  await shot(page, 'chart-en-dark-halflife')
  await page.click('[data-ui=nuclide-fit]')
  await shot(page, 'chart-en-dark-whole')
  await hook(page, T => { T.settings.language = 'de'; T.settings.themeMode = 'light'; T.nuclides.S.scheme = 'binding'; T.nuclides.select('Fe-56'); return true })
  await page.locator('[data-ui=nuclide-sources] summary').click()
  await shot(page, 'chart-de-light-binding-sources')
  check((await page.locator('[data-ui=nuclide-sources]').innerText()).includes('10.1088/1674-1137/abddae'), 'the nuclide page cites NUBASE2020 with its DOI')

  // ---- the decay chain ----
  await hook(page, T => { T.settings.language = 'zh'; T.nuclides.S.parent = 'U-238'; T.nuclides.S.view = 'chain'; return true })
  await until(page, T => T.nuclides.decay() && T.nuclides.chain().nuclides[0].id === 'U-238')
  await shot(page, 'chain-zh-light-U238')
  await hook(page, T => { T.settings.language = 'en'; T.settings.themeMode = 'dark'; T.nuclides.S.parent = 'Mo-99'; T.nuclides.S.unit = 'Bq'; T.nuclides.S.amount = 1e9; T.nuclides.S.logTime = false; T.nuclides.S.logValue = false; return true })
  await until(page, T => T.nuclides.decay() && T.nuclides.chain().nuclides[0].id === 'Mo-99' && T.nuclides.rows().length === 4)
  await shot(page, 'chain-en-dark-Mo99')
  await hook(page, T => { T.settings.language = 'de'; T.settings.themeMode = 'light'; T.nuclides.S.parent = 'Th-232'; T.nuclides.S.unit = 'g'; T.nuclides.S.amount = 1; T.nuclides.S.logTime = true; T.nuclides.S.logValue = true; return true })
  await until(page, T => T.nuclides.decay() && T.nuclides.chain().nuclides[0].id === 'Th-232')
  await shot(page, 'chain-de-light-Th232')
  check(errors.length === 0, 'the nuclide pages log no error', errors.slice(0, 3))
  await ctx.close()
}
for (const lang of ['zh', 'de']) {
  const { ctx, page } = await open({ phone: true, hash: '#n=Cs-137', lang, theme: lang === 'de' ? 'dark' : 'light' })
  await until(page, T => T.nuclides && T.nuclides.page())
  await shot(page, `phone-chart-${lang}`)
  await page.locator('[data-ui=nuclide-page]').scrollIntoViewIfNeeded()
  await shot(page, `phone-page-${lang}`)
  await hook(page, T => { T.nuclides.S.parent = 'Cs-137'; T.nuclides.S.view = 'chain'; return true })
  await until(page, T => T.nuclides.decay())
  await page.evaluate(() => window.scrollTo(0, 0))
  await shot(page, `phone-chain-${lang}`)
  await ctx.close()
}

// ---- the reactor workshop ----
{
  const { ctx, page, errors } = await open({})
  await openLab(page, 'reactor')
  await until(page, T => T.reactor && T.reactor.s.ready && T.reactor.s.crit)
  await shot(page, 'reactor-zh-light-build')
  await hook(page, T => { T.reactor.S.map = 'flux2'; T.reactor.select(18, 17); return true })
  await shot(page, 'reactor-zh-light-flux2')
  await hook(page, T => { T.settings.language = 'en'; T.settings.themeMode = 'dark'; T.reactor.S.map = 'power'; return true })
  await page.selectOption('[data-ui=reactor-preset]', 'pwrLattice')
  await until(page, T => T.reactor.s.presetId === 'pwrLattice' && T.reactor.s.crit && T.reactor.s.crit.nx === 56)
  await shot(page, 'reactor-en-dark-pwr-power')
  await hook(page, T => { T.reactor.S.map = 'material'; return true })
  await page.selectOption('[data-ui=reactor-preset]', 'graphitePile')
  await until(page, T => T.reactor.s.presetId === 'graphitePile' && T.reactor.s.crit && T.reactor.s.crit.nx === 64)
  await shot(page, 'reactor-en-dark-graphite')

  // run: research reactor at full power, then a scram
  await hook(page, T => { T.settings.language = 'de'; T.settings.themeMode = 'light'; return true })
  await page.selectOption('[data-ui=reactor-preset]', 'research')
  await until(page, T => T.reactor.s.presetId === 'research' && T.reactor.s.crit && T.reactor.s.crit.nx === 36)
  await page.click('[data-ui=reactor-start-power]')
  await until(page, T => T.reactor.s.run)
  await page.selectOption('[data-ui=reactor-speed]', '10')
  await page.click('[data-ui=reactor-play]')
  await until(page, T => T.reactor.s.history.t.length > 40)
  await shot(page, 'reactor-de-light-run')
  await page.click('[data-ui=reactor-scram]')
  await until(page, T => T.reactor.s.run.trip && T.reactor.s.run.n < 0.2)
  await hook(page, T => { T.reactor.S.plot = 'reactivity'; return true })
  await shot(page, 'reactor-de-light-scram')
  await hook(page, T => { T.settings.language = 'zh'; T.reactor.stopClock(); T.reactor.S.tab = 'balance'; return true })
  await page.click('[data-ui=reactor-balance-run]')
  await until(page, T => T.reactor.s.balance)
  await shot(page, 'reactor-zh-light-balance')
  for (const [lang, theme] of [['zh', 'light'], ['en', 'dark'], ['de', 'light']]) {
    await hook(page, (T, v) => { T.settings.language = v[0]; T.settings.themeMode = v[1]; T.reactor.S.tab = 'about'; return true }, [lang, theme])
    await shot(page, `reactor-${lang}-${theme}-about`)
  }
  // a task with its checks; the two studies
  await hook(page, T => { T.settings.language = 'zh'; T.settings.themeMode = 'light'; T.reactor.S.tab = 'tasks'; return true })
  await page.click('[data-ui=task-start-minimalChange]')
  await until(page, T => T.reactor.s.task.id === 'minimalChange' && T.reactor.s.crit && T.reactor.s.crit.nx === 44)
  await page.click('[data-ui=task-check]')
  await until(page, T => T.reactor.s.task.result)
  await shot(page, 'reactor-zh-light-task')
  await hook(page, T => { T.settings.language = 'en'; T.reactor.S.tab = 'studies'; T.reactor.S.study = 'kinetics'; return true })
  await page.waitForSelector('[data-ui=kinetics-readout]')
  await shot(page, 'reactor-en-light-kinetics')
  await hook(page, T => { T.settings.language = 'de'; T.settings.themeMode = 'dark'; T.reactor.S.study = 'poisons'; return true })
  await page.waitForSelector('[data-ui=poisons-readout]')
  await shot(page, 'reactor-de-dark-poisons')
  check(errors.length === 0, 'the reactor workshop logs no error', errors.slice(0, 3))
  await ctx.close()
}
for (const lang of ['zh', 'en']) {
  const { ctx, page } = await open({ phone: true, lang, theme: lang === 'en' ? 'dark' : 'light' })
  await openLab(page, 'reactor')
  await until(page, T => T.reactor && T.reactor.s.ready && T.reactor.s.crit)
  await page.locator('[data-ui=reactor-lab]').scrollIntoViewIfNeeded()
  await shot(page, `phone-reactor-${lang}`)
  await page.locator('[data-ui=reactor-lab] .lab-side').scrollIntoViewIfNeeded()
  await shot(page, `phone-reactor-side-${lang}`)
  await ctx.close()
}

writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1))
await browser.close()
srv.close()
for (const [k, v] of Object.entries(report.perf)) console.log(`${k}: ${v.frames} frames at ${v.scale.toFixed(1)} px a cell, mean ${v.mean.toFixed(2)} ms, p95 ${v.p95.toFixed(2)} ms, max ${v.max.toFixed(2)} ms, ${v.labelled} labelled cells`)
console.log(`${report.shots.length} screenshots in .cache/ui-states/26.64/nuclear/; ${report.checks.length - fail.length}/${report.checks.length} checks passed in ${report.browser}`)
for (const f of fail) console.log('  FAILED: ' + f)
process.exit(fail.length ? 1 : 0)
