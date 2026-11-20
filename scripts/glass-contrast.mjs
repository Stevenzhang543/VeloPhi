#!/usr/bin/env node
/**
 * Contrast of text on glass against what is really behind it (26.64, D255; docs/design/DESIGN_SYSTEM.md §5).
 *
 * A token pair cannot tell whether text on a translucent layer is readable: that depends on the canvas under the
 * layer. So this script opens the real application in Chromium and, for light and dark × an empty and a busy canvas ×
 * the three materials (通透, 着色, 实色), photographs every glass layer on the screen twice — once as it is, once with
 * its text and icons made invisible. The second picture is the layer's real ground, pixel by pixel: fill, blur,
 * saturation and whatever the canvas put underneath. For every piece of text on the layer the contrast between its
 * colour and the **worst pixel** of the ground inside its box is computed (WCAG 2.x: 4.5 : 1, or 3 : 1 for large
 * text — 24 px, or 18.66 px bold). Disabled controls are exempt, as in WCAG.
 *
 * Layers checked: the tool strip and the time dock over the canvas, an open menu over the canvas, a message (toast),
 * the command palette over the dimmed page, and the bar of the stage skeleton (化学实验). It also counts the layers
 * with a backdrop filter in the viewport: never more than four (D255).
 *
 * Usage: npx vite build --outDir .cache/dist-x --emptyOutDir && VELOPHI_DIST=.cache/dist-x node scripts/glass-contrast.mjs
 *        (--keep also writes the pictures to .cache/ui/glass/)
 */
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFileSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(import.meta.url)('playwright')
const repo = resolve(fileURLToPath(new URL('..', import.meta.url)))
const out = join(repo, '.cache', 'ui', 'glass')
const keep = process.argv.includes('--keep')
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
const srv = process.env.VELOPHI_URL ? null : await serve(resolve(repo, process.env.VELOPHI_DIST ?? 'dist'))
const URL0 = process.env.VELOPHI_URL ?? `http://127.0.0.1:${srv.address().port}/`
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-CN' })
const page = await ctx.newPage()
const tool = await ctx.newPage()
await tool.setContent('<canvas id="c"></canvas>')

const hook = (f, arg) => page.evaluate(([src, a]) => { const T = window.__velophiTest; return (0, eval)(`(${src})`)(T, a) }, [f.toString(), arg])
async function until(f, arg, ms = 30000) {
  const t0 = Date.now()
  for (;;) {
    const v = await hook(f, arg).catch(() => null)
    if (v) return v
    if (Date.now() - t0 > ms) throw new Error(`timed out: ${f.toString().slice(0, 100)}`)
    await page.waitForTimeout(100)
  }
}

await page.goto(`${URL0}?uitest=1`)
await until(T => T && T.run().frames > 1)
await hook(T => { T.settings.ui.welcomed = true; T.state.showWelcome = false; T.state.tourStep = null; T.settings.effects.reduceTransparency = 'off'; return true })
await page.evaluate(() => document.fonts.ready)
// text and icons of a layer under test become invisible; everything else (fills, selected rows, key caps) stays
await page.addStyleTag({ content: '.gc-ground, .gc-ground * { -webkit-text-fill-color: transparent !important; color: transparent !important; text-shadow: none !important; caret-color: transparent !important; } .gc-ground svg, .gc-ground select, .gc-ground input[type="range"], .gc-ground canvas { visibility: hidden !important; } .gc-ground ::placeholder { color: transparent !important; }' })

/** The pieces of text on a layer: box, colour, size — read in the page. */
function textsOf(selector) {
  return page.evaluate(sel => {
    const root = document.querySelector(sel)
    if (!root) return null
    const R = root.getBoundingClientRect()
    const items = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent.trim()
      const el = n.parentElement
      if (!text || !el) continue
      if (el.closest(':disabled, [aria-disabled="true"], .sr-only, select, option')) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue
      const range = document.createRange(); range.selectNodeContents(n)
      for (const r of range.getClientRects()) {
        const x0 = Math.max(r.left, R.left), y0 = Math.max(r.top, R.top), x1 = Math.min(r.right, R.right), y1 = Math.min(r.bottom, R.bottom)
        if (x1 - x0 < 2 || y1 - y0 < 2) continue
        // an ancestor may fade its content (a quiet button): the text colour is thinner by that much
        let alpha = 1
        for (let p = el; p && p !== root.parentElement; p = p.parentElement) alpha *= Number(getComputedStyle(p).opacity)
        items.push({ text: text.slice(0, 24), x: x0 - R.left, y: y0 - R.top, w: x1 - x0, h: y1 - y0, colour: cs.color, alpha, size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) || 400 })
      }
    }
    const filter = getComputedStyle(root).backdropFilter || getComputedStyle(root).webkitBackdropFilter || 'none'
    return { rect: { x: R.left, y: R.top, width: R.width, height: R.height }, items, filter }
  }, selector)
}

/** Worst contrast of each text box against the pixels of the ground picture. */
function worst(png, items) {
  return tool.evaluate(async ([b64, list]) => {
    const img = new Image()
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = `data:image/png;base64,${b64}` })
    const c = document.getElementById('c'); c.width = img.width; c.height = img.height
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0)
    const lin = v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
    const lum = (r, gg, b) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b)
    return list.map(it => {
      const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(it.colour)
      const tr = +m[1], tg = +m[2], tb = +m[3], ta = (m[4] === undefined ? 1 : +m[4]) * it.alpha
      const x = Math.max(0, Math.floor(it.x)), y = Math.max(0, Math.floor(it.y))
      const w = Math.max(1, Math.min(img.width - x, Math.ceil(it.w))), h = Math.max(1, Math.min(img.height - y, Math.ceil(it.h)))
      const d = g.getImageData(x, y, w, h).data
      let min = Infinity, at = null
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gg = d[i + 1], b = d[i + 2]
        const lt = lum(tr * ta + r * (1 - ta), tg * ta + gg * (1 - ta), tb * ta + b * (1 - ta)), lg = lum(r, gg, b)
        const ratio = (Math.max(lt, lg) + 0.05) / (Math.min(lt, lg) + 0.05)
        if (ratio < min) { min = ratio; at = [r, gg, b] }
      }
      return { ...it, ratio: min, ground: at }
    })
  }, [png.toString('base64'), items])
}

const report = { url: URL0, browser: browser.version(), cases: [] }
const failures = []
let maxLayers = 0

async function checkLayer(label, selector, name) {
  const info = await textsOf(selector)
  if (!info) { failures.push(`${label}: ${name} (${selector}) is not on the screen`); return }
  const clip = { x: Math.max(0, Math.floor(info.rect.x)), y: Math.max(0, Math.floor(info.rect.y)), width: Math.ceil(info.rect.width), height: Math.ceil(info.rect.height) }
  const origin = { x: info.rect.x - clip.x, y: info.rect.y - clip.y }
  if (keep) await page.screenshot({ path: join(out, `${label.replace(/[^\w]+/g, '-')}-${name}.png`), clip })
  await page.evaluate(sel => document.querySelector(sel).classList.add('gc-ground'), selector)
  const png = await page.screenshot({ clip })
  await page.evaluate(sel => document.querySelector(sel).classList.remove('gc-ground'), selector)
  const res = await worst(png, info.items.map(it => ({ ...it, x: it.x + origin.x, y: it.y + origin.y })))
  let low = null
  for (const r of res) {
    const need = r.size >= 24 || (r.size >= 18.66 && r.weight >= 700) ? 3 : 4.5
    if (!low || r.ratio / need < low.ratio / low.need) low = { ...r, need }
    if (r.ratio < need) failures.push(`${label}: ${name} — "${r.text}" ${r.ratio.toFixed(2)} : 1 (needs ${need}) on rgb(${r.ground.join(', ')})`)
  }
  report.cases.push({ label, layer: name, texts: res.length, filter: info.filter, worst: low ? { text: low.text, ratio: +low.ratio.toFixed(2), need: low.need, ground: low.ground } : null })
}

const countFiltered = () => page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const cs = getComputedStyle(e); const f = cs.backdropFilter || cs.webkitBackdropFilter; if (!f || f === 'none') return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && cs.visibility !== 'hidden' }).length)

async function scene(kind) {
  if (kind === 'empty') {
    await hook(T => { T.state.dirty = false; return true })
    await page.keyboard.press('Control+n')
    await until(T => T.state.scene.bodies.length === 1 && !T.state.stale)
  } else {
    await page.click('[data-ui=templates]')
    await page.click('.titem:has-text("高尔顿板")')
    await page.click('text=创建场景')
    await until(T => T.state.scene.bodies.length > 30 && !T.state.stale && T.run().frames > 60)
    // let the balls spread over the board, then stop on a frame
    await page.click('[data-ui=play]')
    await page.waitForTimeout(1800)
    await hook(T => { if (T.state.playing) document.querySelector('[data-ui=play]').click(); return true })
    await until(T => !T.state.playing)
  }
  await page.waitForTimeout(300)
}

for (const theme of ['light', 'dark']) {
  for (const canvas of ['empty', 'busy']) {
    await hook((T, v) => { T.settings.themeMode = v; T.state.page = 'studio'; T.material.cap = null; return true }, theme)
    await scene(canvas)
    for (const tier of ['clear', 'tinted', 'solid']) {
      const label = `${theme} / ${canvas} canvas / ${tier}`
      await hook((T, v) => { T.settings.effects.tier = v; T.material.cap = null; T.state.page = 'studio'; return true }, tier)
      await page.waitForTimeout(250)
      const cls = await page.evaluate(() => [...document.documentElement.classList].filter(c => c.startsWith('glass-')).join(' '))
      if (cls !== `glass-${tier}`) failures.push(`${label}: <html> has "${cls}"`)
      // docks over the canvas
      await checkLayer(label, '.page-studio .strip', 'tool strip')
      await checkLayer(label, '.page-studio .tbar', 'time dock')
      maxLayers = Math.max(maxLayers, await countFiltered())
      // a menu over the canvas
      await page.click('[data-ui=file]')
      await page.waitForSelector('.doc-menu')
      await page.waitForTimeout(260)
      await checkLayer(label, '.doc-menu', 'menu')
      maxLayers = Math.max(maxLayers, await countFiltered())
      await page.keyboard.press('Escape')
      // a message
      await hook(T => { T.state.toast = { text: '已保存 scene-01.velophi.json', error: false, action: { label: '撤销', run() {} } }; return true })
      await page.waitForSelector('.toast')
      await page.waitForTimeout(260)
      await checkLayer(label, '.toast', 'message')
      maxLayers = Math.max(maxLayers, await countFiltered())
      await hook(T => { T.state.toast = null; return true })
      // the command palette over the dimmed page
      await page.keyboard.press('Control+k')
      await page.waitForSelector('.palette')
      await page.waitForTimeout(260)
      await checkLayer(label, '.palette', 'command palette')
      maxLayers = Math.max(maxLayers, await countFiltered())
      await page.keyboard.press('Escape')
      await page.waitForTimeout(120)
      // the bar of the stage skeleton (always over an empty stage for now)
      if (canvas === 'empty') {
        await hook(T => { T.state.page = 'chem'; return true })
        await page.waitForSelector('.chem-page .sbar')
        await page.waitForTimeout(260)
        await checkLayer(label, '.chem-page .sbar', 'stage bar')
        maxLayers = Math.max(maxLayers, await countFiltered())
        await hook(T => { T.state.page = 'studio'; return true })
      }
    }
  }
}
if (maxLayers > 4) failures.push(`${maxLayers} layers with a backdrop filter were on screen at once (at most four, D255)`)
report.maxFilteredLayers = maxLayers
report.failures = failures
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1))
await browser.close()
srv?.close()

const tightest = report.cases.filter(c => c.worst).sort((a, b) => a.worst.ratio / a.worst.need - b.worst.ratio / b.worst.need)[0]
for (const f of failures) console.log(`FAIL ${f}`)
console.log(`glass-contrast: ${report.cases.length} layer checks (2 themes × 2 canvases × 3 tiers), ${report.cases.reduce((n, c) => n + c.texts, 0)} text boxes; ${failures.length} failure(s); at most ${maxLayers} filtered layers at once; tightest: ${tightest ? `"${tightest.worst.text}" ${tightest.worst.ratio} : 1 (needs ${tightest.worst.need}) — ${tightest.layer}, ${tightest.label}` : 'none'}`)
process.exit(failures.length ? 1 : 0)
