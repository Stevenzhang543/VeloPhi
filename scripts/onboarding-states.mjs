#!/usr/bin/env node
/**
 * State screenshots of the simplified bars and the walkthrough (26.64, D243–D251) into
 * .cache/ui-states/26.64/onboarding/: Chinese, English and German, light and dark, at 1280 × 720 and on a phone
 * (390 × 844). They are for looking at — the assertions are in scripts/ui-regressions.mjs (flow `onboarding`) and in
 * tests/shell/budget2664.test.ts; this script only checks, for every shot, that the note of the walkthrough is inside
 * the window and that the page does not scroll sideways, and that the home page with the offer does not scroll.
 *
 *   node node_modules/vite/bin/vite.js build --outDir .cache/dist-onboard
 *   NODE_PATH=.cache/tools/node_modules VELOPHI_DIST=.cache/dist-onboard node scripts/onboarding-states.mjs
 */
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(import.meta.url)('playwright')
const repo = resolve(fileURLToPath(new URL('..', import.meta.url)))
const out = join(repo, '.cache', 'ui-states', '26.64', 'onboarding')
mkdirSync(out, { recursive: true })
const dir = resolve(repo, process.env.VELOPHI_DIST ?? 'dist')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png' }
const srv = createServer((req, rsp) => {
  let p = decodeURIComponent((req.url ?? '/').split('?')[0])
  if (p.endsWith('/')) p += 'index.html'
  const f = join(dir, p)
  if (!f.startsWith(dir) || !existsSync(f) || !statSync(f).isFile()) { rsp.writeHead(404); rsp.end(); return }
  rsp.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' })
  rsp.end(readFileSync(f))
})
await new Promise(r => srv.listen(0, '127.0.0.1', r))
const URL0 = `http://127.0.0.1:${srv.address().port}/`
const browser = await chromium.launch()
const problems = []
let shots = 0

const hook = (page, f, arg) => page.evaluate(([src, a]) => (0, eval)(`(${src})`)(window.__velophiTest, a), [f.toString(), arg])
const only = process.env.VELOPHI_SHOT

async function run(lang, theme, size) {
  const phone = size === 'phone'
  const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 720 }, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone, locale: 'zh-CN' })
  // the language and the theme are those of the stored settings: texts built when a module loads are in that language
  await ctx.addInitScript(v => { if (!localStorage.getItem('velophi.settings.v2')) localStorage.setItem('velophi.settings.v2', JSON.stringify({ rev: 2664, language: v.lang, themeMode: v.theme })) }, { lang, theme })
  const page = await ctx.newPage()
  const tag = `${lang}-${theme}-${size}`
  const shot = async name => {
    if (only && !name.includes(only)) return
    // the pointer rests where nothing has a hover tip
    if (!phone) await page.mouse.move(1277, 420)
    await page.waitForTimeout(450)
    const m = await page.evaluate(() => {
      const n = document.querySelector('[data-ui=walk-note]')?.getBoundingClientRect()
      return { note: n ? { l: n.left, t: n.top, r: n.right, b: n.bottom } : null, w: innerWidth, h: innerHeight, sx: document.documentElement.scrollWidth - innerWidth }
    })
    if (m.note && (m.note.l < 0 || m.note.t < 0 || m.note.r > m.w + 0.5 || m.note.b > m.h + 0.5)) problems.push(`${name}-${tag}: the note is outside the window ${JSON.stringify(m.note)}`)
    if (m.sx > 1) problems.push(`${name}-${tag}: the page scrolls sideways by ${m.sx}px`)
    await page.screenshot({ path: join(out, `${name}-${tag}.png`) })
    shots++
  }
  const open = async () => {
    await page.goto(`${URL0}?uitest=1&onboard=1`)
    await page.waitForFunction(() => window.__velophiTest && window.__velophiTest.run().frames > 1, null, { timeout: 30000 })
  }
  const walkAt = (id, step) => page.waitForSelector(`[data-ui=walk][data-walk=${id}][data-step=${step}][data-phase=step]`, { timeout: 20000 })
  const go = p => hook(page, (T, q) => { T.state.page = q; return true }, p)
  try {
    await open()
    // the first run: the offer on the home page
    await go('home')
    await page.waitForSelector('[data-ui=home-start]')
    await shot('01-home-offer')
    // the offer is one more row of the home page: at 1280 × 720 it still does not scroll (D241)
    if (!phone) { const over = await page.evaluate(() => { const h = document.querySelector('.home'); return h.scrollHeight - h.clientHeight }); if (over > 0) problems.push(`01-home-offer-${tag}: the home page scrolls by ${over}px`) }
    // segment 0
    await page.click('[data-ui=home-start]')
    await walkAt('welcome', 'language'); await shot('02-setup-language')
    await page.click('[data-ui=walk-next]'); await walkAt('welcome', 'appearance'); await shot('03-setup-appearance')
    await page.click('[data-ui=walk-next]'); await page.click('[data-ui=walk-next]'); await walkAt('welcome', 'role'); await shot('04-setup-role')
    await page.click('[data-ui=walk-role-learn]')
    await page.waitForSelector('[data-ui=walk][data-phase=done]'); await shot('05-segment-done')
    // segment 1: the ring on the rail (another page), then on the control
    await page.click('[data-ui=walk-continue]')
    await walkAt('motion', 'template'); await shot('06-motion-elsewhere')
    await go('studio'); await shot('07-motion-template')
    if (!phone) {
      await page.click('[data-ui=walk-skip]'); await walkAt('motion', 'play'); await shot('08-motion-play')
      await page.click('[data-ui=walk-skip]'); await page.click('[data-ui=walk-skip]'); await walkAt('motion', 'angle'); await shot('09-motion-angle')
      await page.click('[data-ui=walk-skip]'); await walkAt('motion', 'formula'); await shot('10-motion-formula')
    }
    await page.click('[data-ui=walk-skip-segment]')
    // segment 2
    await walkAt('physics', 'choose'); await go('lab'); await shot('11-physics-choose')
    await page.click('[data-ui=walk-skip]'); await walkAt('physics', 'switch'); await page.waitForTimeout(700); await shot('12-physics-switch')
    await page.click('[data-ui=walk-skip-segment]')
    // segment 3
    await walkAt('chem', 'flask'); await go('chem')
    await page.waitForFunction(() => window.__velophiTest.chem && window.__velophiTest.chem.bench.ready.value, null, { timeout: 30000 })
    await shot('13-chem-flask')
    await page.click('[data-ui=walk-skip]'); await walkAt('chem', 'acid'); await shot('14-chem-acid')
    await page.click('[data-ui=walk-skip]'); await page.click('[data-ui=walk-skip]'); await walkAt('chem', 'titrate'); await shot('15-chem-titrate')
    await page.click('[data-ui=walk-skip-segment]')
    // segment 4
    await walkAt('library', 'problem'); await page.waitForTimeout(600); await shot('16-library-problem')
    await page.click('[data-ui=walk-skip]'); await walkAt('library', 'element'); await page.waitForTimeout(900); await shot('17-library-element')
    await page.click('[data-ui=walk-close]')
    // the checklist and the list of changes
    await hook(page, T => { T.state.showWelcome = false; return true })
    await go('home')
    await page.click('[data-ui=home-tour]'); await page.waitForSelector('[data-ui=guide-list]'); await shot('18-guide-checklist')
    await page.click('[data-ui=guide-tab-news]'); await page.waitForSelector('[data-ui=guide-news]'); await shot('19-guide-news')
    await page.click('[data-ui=guide-news-walk]'); await walkAt('whatsnew', 'panels'); await shot('20-news-panels')
    for (let i = 0; i < 4; i++) await page.click('[data-ui=walk-next]')
    await walkAt('whatsnew', 'more'); await shot('21-news-more')
    await page.click('[data-ui=walk-close]')
    // the simplified bars themselves (D243–D245)
    if (!phone) {
      await go('studio')
      await page.click('[data-ui=studio-more]'); await page.click('.more-panel [data-ui=view]'); await shot('30-motion-more-view')
      await page.click('.more-panel [data-ui=teach]'); await shot('31-motion-more-teach')
      await page.click('.more-panel [data-ui=compute]'); await shot('32-motion-more-compute')
      await page.keyboard.press('Escape')
      await hook(page, T => { T.shell.mode = 'build'; T.shell.tools = true; return true })
      await page.click('[data-ui=palette]'); await shot('33-motion-all-tools')
      await page.keyboard.press('Escape')
    }
    await go('lab')
    await hook(page, T => { T.settings.ui.lab = 'circuit'; return true })
    await page.waitForTimeout(500); await shot('34-physics-circuit')
    await page.click('[data-ui=lab-page] [data-ui=stage-catalogue]'); await shot('35-physics-catalogue')
    await page.keyboard.press('Escape')
    if (!phone) { await page.click('[data-ui=circuit-group-meter]'); await shot('36-physics-group'); await page.keyboard.press('Escape') }
  } catch (e) {
    problems.push(`${tag}: ${String(e?.message ?? e).split('\n')[0]}`)
    await page.screenshot({ path: join(out, `FAILED-${tag}.png`) }).catch(() => {})
  }
  await ctx.close()
}

const RUNS = [['zh', 'light', 'desktop'], ['zh', 'dark', 'desktop'], ['en', 'light', 'desktop'], ['en', 'dark', 'desktop'], ['de', 'light', 'desktop'], ['de', 'dark', 'desktop'], ['zh', 'light', 'phone'], ['en', 'light', 'phone'], ['de', 'light', 'phone'], ['zh', 'dark', 'phone'], ['de', 'dark', 'phone']]
for (const [lang, theme, size] of RUNS) {
  if (process.env.VELOPHI_RUN && !`${lang}-${theme}-${size}`.includes(process.env.VELOPHI_RUN)) continue
  await run(lang, theme, size)
}
await browser.close()
srv.close()
for (const p of problems) console.log(`PROBLEM ${p}`)
console.log(`${shots} screenshots in .cache/ui-states/26.64/onboarding; ${problems.length} problem(s)`)
process.exit(problems.length ? 1 : 0)
