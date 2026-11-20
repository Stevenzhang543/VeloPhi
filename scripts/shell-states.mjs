#!/usr/bin/env node
/**
 * States of the 26.64 shell, photographed and measured (D240–D242, D252–D257; the part of the screenshot wall of D259
 * that belongs to the shell). Real app in Chromium, the build served from VELOPHI_DIST (default dist/).
 *
 * Checks (the script exits 1 when one fails):
 *   - the home page does not scroll at 1280 × 720 in Chinese, English and German, light and dark, and no text of it
 *     is clipped; it has exactly five jump blocks and no solid-accent primary button;
 *   - the Latin face is the bundled one and its figures are tabular in `.num`;
 *   - the decoration costs less than 1 ms a frame (mean; the maximum is reported), stands still under reduced motion
 *     and stops while another page is shown;
 *   - the three material tiers put the right class on <html>, and a menu has a backdrop filter in the two glass tiers
 *     and none in the solid one; no page ground has a gradient.
 * Screenshots go to .cache/ui-states/26.64/ — look at them: a script cannot see a misaligned baseline.
 *
 * Usage: npx vite build --outDir .cache/dist-x --emptyOutDir && VELOPHI_DIST=.cache/dist-x node scripts/shell-states.mjs
 */
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFileSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(import.meta.url)('playwright')
const repo = resolve(fileURLToPath(new URL('..', import.meta.url)))
const out = join(repo, '.cache', 'ui-states', '26.64')
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
const report = { url: URL0, browser: browser.version(), checks: [], shots: [] }
const fail = []
const check = (ok, what, got) => { report.checks.push({ ok: !!ok, what, got }); if (!ok) fail.push(`${what}${got === undefined ? '' : ` (got ${JSON.stringify(got)})`}`) }

const hook = (page, f, arg) => page.evaluate(([src, a]) => { const T = window.__velophiTest; return (0, eval)(`(${src})`)(T, a) }, [f.toString(), arg])
async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'zh-CN', ...opts })
  const page = await ctx.newPage()
  await page.goto(`${URL0}?uitest=1`)
  await page.waitForFunction(() => window.__velophiTest && window.__velophiTest.run().frames > 1, null, { timeout: 30000 })
  await hook(page, T => { T.settings.ui.welcomed = true; T.state.showWelcome = false; T.state.tourStep = null; return true })
  await page.evaluate(() => document.fonts.ready)
  return { ctx, page }
}
async function shot(page, name) {
  await page.waitForTimeout(350)
  await page.screenshot({ path: join(out, `${name}.png`) })
  report.shots.push(`${name}.png`)
}
const setup = (page, o) => hook(page, (T, v) => { if (v.lang) T.settings.language = v.lang; if (v.theme) T.settings.themeMode = v.theme; if (v.page) T.state.page = v.page; if (v.section) T.state.librarySection = v.section; if (v.projector !== undefined) T.settings.projector = v.projector; if (v.tier) T.settings.effects.tier = v.tier; return true }, o)

// ---- 1 · the home page: fits, in three languages and two themes ----
{
  const { ctx, page } = await open()
  await setup(page, { page: 'home' })
  await page.waitForSelector('[data-ui=home-wave].ready', { timeout: 20000 })
  for (const theme of ['light', 'dark']) {
    for (const lang of ['zh', 'en', 'de']) {
      await setup(page, { lang, theme, page: 'home' })
      await page.waitForSelector('[data-ui=home-wave].ready', { timeout: 20000 })
      await shot(page, `home-${lang}-${theme}-1280x720`)
      const m = await page.evaluate(() => {
        const home = document.querySelector('.home')
        const clipped = [...home.querySelectorAll('.jname, .jline, .lead, .entry, h1')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim().slice(0, 40))
        const body = home.querySelector('.body').getBoundingClientRect()
        return { scroll: home.scrollHeight - home.clientHeight, doc: document.documentElement.scrollHeight - innerHeight, clipped, jumps: home.querySelectorAll('.jump').length, primary: home.querySelectorAll('.btn.primary').length, bottom: Math.round(body.bottom), band: Math.round(home.querySelector('.band').getBoundingClientRect().height), ground: getComputedStyle(home).backgroundImage, appGround: getComputedStyle(document.getElementById('app')).backgroundImage }
      })
      check(m.scroll <= 0 && m.doc <= 0, `home ${lang} ${theme}: no scrolling at 1280 × 720`, m)
      check(m.clipped.length === 0, `home ${lang} ${theme}: no clipped text`, m.clipped)
      check(m.jumps === 5 && m.primary === 0, `home ${lang} ${theme}: five jump blocks, no primary button`, { jumps: m.jumps, primary: m.primary })
      check(m.ground === 'none' && m.appGround === 'none', `home ${lang} ${theme}: flat ground, no gradient`, { ground: m.ground, app: m.appGround })
      check(m.band >= 120, `home ${lang} ${theme}: the decoration has its own band above the text`, m.band)
    }
  }
  // fonts and figures
  await setup(page, { lang: 'en', theme: 'light', page: 'home' })
  const type = await page.evaluate(() => {
    const el = document.createElement('span'); el.className = 'num'; el.style.cssText = 'position:absolute;visibility:hidden;font-size:40px;white-space:nowrap'
    document.body.appendChild(el)
    const w = s => { el.textContent = s; return el.getBoundingClientRect().width }
    const r = { ones: w('1111111111'), zeros: w('0000000000'), eights: w('8888888888'), face: document.fonts.check('14px "Source Sans 3 Variable"'), family: getComputedStyle(document.body).fontFamily.split(',')[0].trim(), loaded: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/"/g, '')).filter((v, i, a) => a.indexOf(v) === i) }
    el.remove(); return r
  })
  check(type.face && /Source Sans 3/.test(type.family) && type.loaded.some(f => /Source Sans 3/.test(f)), 'the Latin face is the bundled Source Sans 3', { family: type.family, loaded: type.loaded })
  check(Math.abs(type.ones - type.zeros) < 0.01 && Math.abs(type.eights - type.zeros) < 0.01, 'figures in .num are tabular (ten 1s, 0s and 8s are equally wide)', type)

  // the decoration: cost, pause on another page, stillness under reduced motion
  await hook(page, T => { Object.assign(T.decorStats, { frames: 0, lastMs: 0, maxMs: 0, totalMs: 0 }); return true })
  await page.waitForTimeout(3000)
  const cost = await hook(page, T => ({ ...T.decorStats }))
  const mean = cost.frames ? cost.totalMs / cost.frames : 0
  report.decoration = { frames: cost.frames, meanMs: mean, maxMs: cost.maxMs }
  check(cost.frames > 60 && mean < 1, 'the pendulum wave costs under 1 ms a frame (mean over 3 s)', report.decoration)
  await setup(page, { page: 'library' })
  await page.waitForTimeout(300)
  const f0 = await hook(page, T => T.decorStats.frames)
  await page.waitForTimeout(800)
  const f1 = await hook(page, T => T.decorStats.frames)
  check(f1 === f0, 'the wave stops while another page is shown', { before: f0, after: f1 })
  await setup(page, { page: 'home' })
  await hook(page, T => { T.settings.ui.motion = false; return true })
  await page.waitForTimeout(400)
  const s0 = await hook(page, T => T.decorStats.frames)
  await page.waitForTimeout(800)
  const s1 = await hook(page, T => T.decorStats.frames)
  check(s1 === s0, 'the wave stands still under reduced motion', { before: s0, after: s1 })
  await shot(page, 'home-en-light-reduced-motion')
  await hook(page, T => { T.settings.ui.motion = true; return true })

  // projection, keyboard focus, other sizes
  await setup(page, { lang: 'zh', projector: true })
  await shot(page, 'home-zh-light-projector')
  const proj = await page.evaluate(() => { const h = document.querySelector('.home'); return h.scrollHeight - h.clientHeight })
  report.projectorScroll = proj
  await setup(page, { projector: false, lang: 'de' })
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab')
  await shot(page, 'home-de-light-keyboard-focus')
  await page.setViewportSize({ width: 1024, height: 768 }); await shot(page, 'home-de-light-1024x768')
  await page.setViewportSize({ width: 1440, height: 900 }); await setup(page, { lang: 'zh' }); await shot(page, 'home-zh-light-1440x900')
  await ctx.close()
}

// ---- 2 · phones ----
{
  const { ctx, page } = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  for (const lang of ['zh', 'de']) {
    await setup(page, { lang, page: 'home' })
    await page.waitForSelector('[data-ui=home-wave].ready', { timeout: 20000 })
    await shot(page, `home-${lang}-light-390x844`)
    const clipped = await page.evaluate(() => [...document.querySelectorAll('.home .jname, .home .jline, .home .lead')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim().slice(0, 40)))
    check(clipped.length === 0, `home ${lang} on a phone: no clipped text`, clipped)
  }
  await setup(page, { lang: 'zh', theme: 'dark' })
  await page.click('[data-ui=nav]')
  await shot(page, 'drawer-zh-dark-390x844')
  await page.click('.rail.drawer [data-ui=page-chem]')
  await shot(page, 'chem-zh-dark-390x844')
  await ctx.close()
}

// ---- 3 · the shell's pages and layers ----
{
  const { ctx, page } = await open()
  for (const theme of ['light', 'dark']) {
    await setup(page, { lang: 'zh', theme, page: 'studio' })
    await shot(page, `studio-zh-${theme}`)
    await setup(page, { page: 'chem' }); await shot(page, `chem-zh-${theme}`)
    // pages of the other work packages, to see what the new tokens did to them
    await setup(page, { page: 'lab' }); await page.waitForTimeout(600); await shot(page, `lab-zh-${theme}`)
    await setup(page, { page: 'monitor' }); await shot(page, `monitor-zh-${theme}`)
    await setup(page, { page: 'library', section: 'templates' }); await page.waitForTimeout(400); await shot(page, `library-templates-zh-${theme}`)
    await setup(page, { page: 'library', section: 'classroom' }); await shot(page, `library-classroom-zh-${theme}`)
    await setup(page, { page: 'library', section: 'matter' }); await shot(page, `library-matter-zh-${theme}`)
    await setup(page, { page: 'settings' })
    await hook(page, T => { T.state.settingsSection = 'effects'; return true })
    await shot(page, `settings-effects-zh-${theme}`)
  }
  await setup(page, { lang: 'de', theme: 'light', page: 'library', section: 'classroom' }); await shot(page, 'library-classroom-de-light')
  await setup(page, { page: 'chem' })
  await page.click('[data-ui=chem-page] [data-ui=stage-catalogue]'); await shot(page, 'chem-de-light-catalogue')
  await page.keyboard.press('Escape')
  check(await page.evaluate(() => document.activeElement?.getAttribute('data-ui')) === 'stage-catalogue', 'Escape closes the catalogue and gives the focus back to its button')

  // menus over the canvas, in the three tiers
  await setup(page, { lang: 'zh', page: 'studio' })
  for (const tier of ['clear', 'tinted', 'solid']) {
    await setup(page, { tier })
    // 26.64 (D245): the motion bar's layer over the canvas is 更多, here at its 教学 group
    await page.click('[data-ui=studio-more]')
    await page.click('.more-panel [data-ui=teach]')
    await page.waitForSelector('.more-panel')
    const m = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('.more-panel')); return { cls: [...document.documentElement.classList].filter(c => c.startsWith('glass-')), filter: cs.backdropFilter || cs.webkitBackdropFilter, bg: cs.backgroundColor } })
    check(m.cls.length === 1 && m.cls[0] === `glass-${tier}`, `tier ${tier}: one class on <html>`, m.cls)
    check(tier === 'solid' ? m.filter === 'none' : /blur\(/.test(m.filter), `tier ${tier}: the menu ${tier === 'solid' ? 'has no backdrop filter' : 'blurs its backdrop'}`, m)
    await shot(page, `teach-menu-zh-light-${tier}`)
    await page.keyboard.press('Escape')
  }
  await setup(page, { tier: 'tinted' })
  await page.click('[data-ui=file]'); await shot(page, 'file-menu-zh-light'); await page.keyboard.press('Escape')
  await page.click('[data-ui=help]'); await shot(page, 'help-menu-zh-light'); await page.keyboard.press('Escape')
  await page.keyboard.press('Control+k'); await page.waitForSelector('.palette'); await shot(page, 'palette-zh-light')
  await page.keyboard.type('课堂'); await shot(page, 'palette-zh-light-query'); await page.keyboard.press('Escape')
  await hook(page, T => { T.shell.openLink = true; return true }); await page.waitForSelector('.dialog.link')
  await page.fill('[data-ui=open-link-input]', 'not a link'); await page.click('[data-ui=open-link-go]')
  await shot(page, 'open-link-zh-light-error'); await page.keyboard.press('Escape')
  await setup(page, { theme: 'dark' })
  await page.keyboard.press('Control+k'); await page.waitForSelector('.palette'); await shot(page, 'palette-zh-dark'); await page.keyboard.press('Escape')
  // the notice of the automatic step, as the status bar shows it
  await hook(page, T => { T.material.cap = 'solid'; T.material.p95 = 27.4; T.material.notice = 'solid'; return true })
  await shot(page, 'status-tier-notice-zh-dark')
  check(await page.locator('[data-ui=tier-notice]').count() === 1 && (await page.evaluate(() => document.documentElement.classList.contains('glass-solid'))), 'an automatic step shows its notice in the status bar and makes the material solid')
  await ctx.close()
}

writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1))
await browser.close()
srv.close()
for (const f of fail) console.log(`FAIL ${f}`)
console.log(`shell-states: ${report.checks.length - fail.length}/${report.checks.length} checks passed, ${report.shots.length} screenshots in .cache/ui-states/26.64/; decoration ${report.decoration ? `${report.decoration.meanMs.toFixed(3)} ms mean, ${report.decoration.maxMs.toFixed(2)} ms max over ${report.decoration.frames} frames` : 'not measured'}`)
process.exit(fail.length ? 1 : 0)
