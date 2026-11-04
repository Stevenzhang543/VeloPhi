// VeloPhi APK checks on the MuMu emulator through the WebView's DevTools protocol (26.59 fix 3, D192).
// Started by scripts\android\mumu.ps1 -Step cdp|rotation-matrix (which finds adb and the emulator):
//   node scripts/android/mumu-cdp.mjs --adb <adb.exe> --serial <host:port> --out <folder> [--plan rotate|matrix|lock|ui] [--cycles 3]
// 26.60 (D206): --plan ui drives the phone layout with touch events (tab bar, bottom sheets, a tool, the run button).
// The APK enables WebView debugging only when asked over adb (setprop debug.velophi.devtools 1, see MainActivity.kt).
// For every variant: start the app, connect to its page, run the variant's script (CSS or state changes), turn the
// screen landscape / portrait a few times and record whether the app process survived. The table goes to
// <out>\cdp.log, screenshots to <out>\*.png. Nothing outside the emulator and the output folder changes.
import { execFileSync } from 'node:child_process'
import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const ADB = arg('adb'), SERIAL = arg('serial'), OUT = arg('out', '.cache/mumu'), PLAN = arg('plan', 'matrix'), CYCLES = +arg('cycles', 3)
// DevTools attached changes how the WebView renders (an attached page did not crash where a detached one did): the
// variant is applied, then the DevTools connection is closed before the screen turns
const DETACH = arg('detach', '1') !== '0'
const PKG = 'app.velophi.physics'
const PORT = 9333
mkdirSync(OUT, { recursive: true })
const LOG = join(OUT, `cdp-${PLAN}.log`)
writeFileSync(LOG, `VeloPhi MuMu CDP ${PLAN}  ${new Date().toISOString()}\n`)
const log = s => { appendFileSync(LOG, s + '\n'); console.log(s) }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const adb = (...a) => { try { return execFileSync(ADB, ['-s', SERIAL, ...a], { encoding: 'utf8', timeout: 60000 }).trim() } catch (e) { return `ERR ${String(e.stdout || e.message).trim()}` } }
const sh = cmd => adb('shell', cmd)
const pidOf = () => sh(`pidof ${PKG}`).split(/\s+/)[0] || ''
const shot = name => { try { const png = execFileSync(ADB, ['-s', SERIAL, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 << 20, timeout: 30000 }); writeFileSync(join(OUT, `${name}.png`), png) } catch (e) { log(`shot ${name}: ${e.message}`) } }

/** A small DevTools client over the WebView's page socket. */
async function connect(pid) {
  adb('forward', '--remove', `tcp:${PORT}`)
  adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`)
  let pages = []
  for (let i = 0; i < 20 && !pages.length; i++) {
    try { pages = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter(p => p.type === 'page') } catch { /* not yet */ }
    if (!pages.length) await sleep(500)
  }
  if (!pages.length) return null
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let id = 0
  const wait = new Map()
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id) } }
  const send = (method, params = {}) => new Promise(res => { const i = ++id; wait.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (wait.has(i)) { wait.delete(i); res({ error: 'timeout' }) } }, 15000) })
  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    return r.error ? `ERR ${JSON.stringify(r.error)}` : r.result?.exceptionDetails ? `EXC ${r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text}` : r.result?.result?.value
  }
  return { url: pages[0].url, evaluate, send, close: () => { try { ws.close() } catch { /* gone */ } } }
}

// ---- page-side helpers (strings evaluated in the page) ----
const CSSOM = `(() => {
  const out = { rules: 0, changed: 0 };
  const walk = (list, fn) => { for (let i = list.length - 1; i >= 0; i--) { const r = list[i]; out.rules++; if (r.cssRules && !(r instanceof CSSStyleRule)) walk(r.cssRules, fn); fn(r, list, i) } };
  window.__cssEdit = (fn) => { for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules } catch { continue } walk(rules, (r, list, i) => { if (fn(r, list, i)) out.changed++ }) } return out.changed };
  window.__del = (r) => { const p = r.parentRule || r.parentStyleSheet; const list = p.cssRules; for (let i = 0; i < list.length; i++) if (list[i] === r) { p.deleteRule(i); return true } return false };
  return 'ok';
})()`
const VARIANTS = {
  base: '"no change"',
  blank: `(() => { document.querySelectorAll('#app, body > *').forEach(e => e.remove()); document.body.style.background = '#234'; return 'blank' })()`,
  noContentVisibility: `__cssEdit(r => r.style && r.style.contentVisibility ? (r.style.removeProperty('content-visibility'), true) : false)`,
  noContainerQueries: `__cssEdit(r => { if (r.constructor.name === 'CSSContainerRule') return __del(r); if (r.style && r.style.containerType) { r.style.removeProperty('container-type'); return true } return false })`,
  noHas: `__cssEdit(r => r.selectorText && r.selectorText.includes(':has(') ? __del(r) : false)`,
  noBackdrop: `(() => { document.documentElement.classList.remove('fx-glass'); return __cssEdit(r => r.style && (r.style.backdropFilter || r.style.webkitBackdropFilter) ? (r.style.removeProperty('backdrop-filter'), r.style.removeProperty('-webkit-backdrop-filter'), true) : false) })()`,
  noOverflowClip: `__cssEdit(r => r.style && r.style.overflow === 'clip' ? (r.style.overflow = 'hidden', true) : false)`,
  noContain: `__cssEdit(r => r.style && r.style.contain ? (r.style.removeProperty('contain'), true) : false)`,
  noAnimation: `(() => { const s = document.createElement('style'); s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'; document.head.append(s); return 'ok' })()`,
  noCanvas: `(() => { document.querySelectorAll('canvas').forEach(c => { c.width = 1; c.height = 1; c.style.display = 'none' }); return document.querySelectorAll('canvas').length })()`,
  noGlassAmbient: `(() => { document.documentElement.classList.remove('fx-glass', 'fx-ambient'); return document.documentElement.className })()`,
  hideDialogs: `(() => { document.querySelectorAll('.dialog, [role=dialog]').forEach(d => d.remove()); return 'ok' })()`,
  noFixed: `__cssEdit(r => r.style && r.style.position === 'fixed' ? (r.style.position = 'absolute', true) : false)`,
  noGrid: `__cssEdit(r => r.style && (r.style.display === 'grid' || r.style.display === 'inline-grid') ? (r.style.display = 'block', true) : false)`,
  noTransform: `__cssEdit(r => r.style && r.style.transform ? (r.style.removeProperty('transform'), true) : false)`,
  noFilters: `__cssEdit(r => r.style && (r.style.filter || r.style.mask || r.style.webkitMask) ? (r.style.removeProperty('filter'), r.style.removeProperty('mask'), r.style.removeProperty('-webkit-mask'), true) : false)`,
  noCvNoCq: `(() => __cssEdit(r => r.style && r.style.contentVisibility ? (r.style.removeProperty('content-visibility'), true) : false) + __cssEdit(r => { if (r.constructor.name === 'CSSContainerRule') return __del(r); if (r.style && r.style.containerType) { r.style.removeProperty('container-type'); return true } return false }))()`
}
const STATE = `JSON.stringify({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, ua: navigator.userAgent.replace(/^.*Chrome\\//, 'Chrome/').slice(0, 40), root: document.documentElement.className.slice(0, 120), dialogs: [...document.querySelectorAll('.dialog, [role=dialog]')].length, page: document.querySelector('[class*=page-]')?.className?.slice(0, 80) ?? '', recovered: !!window.__velophiRecovered })`

async function run(name, script, opts = {}) {
  sh(`am force-stop ${PKG}`)
  sh('settings put system accelerometer_rotation 0')
  sh('settings put system user_rotation 0')
  await sleep(1500)
  sh(`monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`)
  await sleep(9000)
  const pid0 = pidOf()
  if (!pid0) { log(`${name}: app did not start`); return { name, result: 'no start' } }
  const page = await connect(pid0)
  if (!page) { log(`${name}: no DevTools page (is debug.velophi.devtools set and the test APK installed?)`); return { name, result: 'no devtools' } }
  await page.evaluate(CSSOM)
  if (opts.setup) log(`  setup: ${await page.evaluate(opts.setup)}`)
  const r = await page.evaluate(script)
  await sleep(1500)
  log(`${name}: pid ${pid0}  variant -> ${typeof r === 'string' ? r.slice(0, 120) : JSON.stringify(r)}  state ${await page.evaluate(STATE)}`)
  if (opts.shot) shot(`${name}-portrait`)
  if (DETACH) { page.close(); adb('forward', '--remove', `tcp:${PORT}`); await sleep(1500) }
  let survived = 0
  let note = ''
  for (let c = 1; c <= CYCLES * 2; c++) {
    const rot = c % 2 === 1 ? 1 : 0
    sh(`settings put system user_rotation ${rot}`)
    await sleep(4500)
    const p = pidOf()
    if (p !== pid0) { note = `rotation ${c} (to ${rot ? 'landscape' : 'portrait'}): process ${p ? `replaced by ${p} (recovered)` : 'gone'}`; break }
    if (opts.shot && c === 1) shot(`${name}-landscape`)
    survived = c
  }
  if (!note) note = `survived ${survived} rotations${DETACH ? '' : `; state ${await page.evaluate(STATE).catch(() => '?')}`}`
  page.close()
  sh('settings put system user_rotation 0')
  log(`  => ${note}`)
  return { name, survived, note }
}

/** 26.59 fix 3 (D199): set the orientation the app keeps, through window.VeloPhiAndroid (DevTools on for this run only). */
async function setMode(mode) {
  sh('setprop debug.velophi.devtools 1')
  sh(`am force-stop ${PKG}`)
  await sleep(1500)
  sh(`monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`)
  await sleep(9000)
  const pid = pidOf()
  const page = pid ? await connect(pid) : null
  if (!page) return 'no DevTools page'
  const r = await page.evaluate(`(() => { if (!window.VeloPhiAndroid) return 'no bridge'; VeloPhiAndroid.setOrientation('${mode}'); return 'orientation=' + VeloPhiAndroid.orientation() })()`)
  page.close()
  adb('forward', '--remove', `tcp:${PORT}`)
  return r
}

/**
 * Orientation lock (D199): lock portrait, restart the app without DevTools (the choice applies before the page loads),
 * ask the system for landscape and back a few times — the app must stay up (same process) — then unlock again.
 */
async function lockCheck() {
  sh('settings put system accelerometer_rotation 0')
  sh('settings put system user_rotation 0')
  log(`lock: ${await setMode('portrait')}`)
  sh('setprop debug.velophi.devtools 0')
  sh(`am force-stop ${PKG}`)
  await sleep(1500)
  sh(`monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`)
  await sleep(9000)
  // MuMu turns auto-rotation back on when an app starts: switch it off after the start, as the rotate step does
  sh('settings put system accelerometer_rotation 0')
  const pid0 = pidOf()
  let survived = 0
  let note = ''
  for (let c = 1; c <= CYCLES * 2; c++) {
    const rot = c % 2 === 1 ? 1 : 0
    sh(`settings put system user_rotation ${rot}`)
    await sleep(4500)
    const p = pidOf()
    const disp = sh('dumpsys window displays').match(/mRotation=\d|mCurrentRotation=\w+/)?.[0] ?? '?'
    log(`  rotation request ${c} (user_rotation=${rot}): pid ${p}, display ${disp}`)
    if (c === 1) shot('lock-portrait-after-request')
    if (p !== pid0) { note = `process ${p ? `replaced by ${p}` : 'gone'} at request ${c}`; break }
    survived = c
  }
  sh('settings put system user_rotation 0')
  log(`unlock: ${await setMode('auto')}`)
  // Control: unlocked again, the same request turns the screen (on this WebView the renderer then crashes and the
  // app restarts itself, so the process changes)
  sh('setprop debug.velophi.devtools 0')
  sh(`am force-stop ${PKG}`)
  await sleep(1500)
  sh(`monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`)
  await sleep(9000)
  sh('settings put system accelerometer_rotation 0')
  const pidU = pidOf()
  sh('settings put system user_rotation 1')
  await sleep(4500)
  const dispU = sh('dumpsys window displays').match(/mRotation=\d/)?.[0] ?? '?'
  log(`  unlocked control: pid ${pidU} -> ${pidOf()}, display ${dispU}`)
  sh('settings put system user_rotation 0')
  await sleep(4000)
  sh(`am force-stop ${PKG}`)
  if (!note) note = `app stayed up through ${survived} rotation requests while locked`
  log(`  => ${note}`)
  return { name: 'lock-portrait', survived, note }
}

/**
 * 26.60 (D206): the phone layout on the device — touch events through DevTools (the app's own touch handlers run):
 * open the tools sheet, pick the block and place one on the canvas, open the analysis sheet and drag it to full
 * height and back down to close it, run, and collect the page's errors. Screenshots ui-*.png.
 */
async function uiCheck() {
  sh('setprop debug.velophi.devtools 1')
  sh(`am force-stop ${PKG}`)
  sh('settings put system accelerometer_rotation 0')
  sh('settings put system user_rotation 0')
  await sleep(1500)
  sh(`monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`)
  await sleep(10000)
  sh('settings put system accelerometer_rotation 0')
  const pid0 = pidOf()
  const page = pid0 ? await connect(pid0) : null
  if (!page) { log('ui: no DevTools page'); return { name: 'ui', result: 'no devtools' } }
  const ev = async (label, expr) => { const r = await page.evaluate(expr); log(`  ${label}: ${typeof r === 'string' ? r.slice(0, 200) : JSON.stringify(r)}`); return r }
  await ev('errors hook', `(() => { window.__errs = []; addEventListener('error', e => __errs.push(String(e.message).slice(0, 160))); addEventListener('unhandledrejection', e => __errs.push('rejection: ' + String(e.reason).slice(0, 160))); return 'ok' })()`)
  await ev('state', STATE)
  await ev('layout', `JSON.stringify({ phone: !!document.querySelector('.app.phone'), nav: !!document.querySelector('.pnav'), dialogs: [...document.querySelectorAll('[role=dialog]')].map(d => d.getAttribute('aria-label') || d.className).slice(0, 3) })`)
  // A welcome or other dialog in front: Escape closes it
  await ev('close dialogs', `(() => { for (let i = 0; i < 3 && document.querySelector('[role=dialog]'); i++) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return document.querySelectorAll('[role=dialog]').length })()`)
  const rectOf = async sel => { const r = await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2, top: b.top, w: b.width, h: b.height }) })()`); return typeof r === 'string' && r.startsWith('{') ? JSON.parse(r) : null }
  const touch = async (type, x, y) => page.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  const tap = async (label, sel) => { const r = await rectOf(sel); if (!r) { log(`  tap ${label}: ${sel} not found`); return false } await touch('touchStart', r.x, r.y); await sleep(60); await touch('touchEnd'); log(`  tap ${label} at ${Math.round(r.x)},${Math.round(r.y)}`); await sleep(900); return true }
  const drag = async (label, x, y0, y1) => { await touch('touchStart', x, y0); for (let k = 1; k <= 12; k++) { await touch('touchMove', x, y0 + (y1 - y0) * k / 12); await sleep(16) } await touch('touchEnd'); log(`  drag ${label} ${Math.round(y0)} -> ${Math.round(y1)}`); await sleep(900) }
  await tap('tools tab', '[data-ui="sheet-tools"]')
  shot('ui-1-tools')
  await ev('sheet', `document.querySelector('.sheet')?.className ?? 'none'`)
  const picked = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.palette .tool')].find(e => /物块|Block|Klotz/.test(e.textContent)); if (!b) return null; const r = b.getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) })()`)
  if (typeof picked === 'string' && picked.startsWith('{')) { const p = JSON.parse(picked); await touch('touchStart', p.x, p.y); await sleep(60); await touch('touchEnd'); log('  tap block tool'); await sleep(900) } else log('  block tool not found')
  await ev('sheet after pick', `document.querySelector('.sheet')?.className ?? 'none'`)
  const view = await rectOf('.view canvas')
  if (view) { await touch('touchStart', view.x, view.top + view.h * 0.3); await sleep(60); await touch('touchEnd'); log('  tap canvas'); await sleep(1500) }
  shot('ui-2-placed')
  await tap('analysis tab', '[data-ui="sheet-analysis"]')
  const handle = await rectOf('.sheet .grab, .sheet .handle, .sheet [data-grip]')
  if (handle) { await drag('sheet up', handle.x, handle.y, 80); shot('ui-3-analysis-full'); await drag('sheet down', handle.x, 90, view ? view.top + view.h + 200 : 1400) }
  else log('  sheet handle not found')
  await ev('sheet after drag down', `document.querySelector('.sheet')?.className ?? 'none'`)
  await tap('run', '[data-ui="run"]')
  await sleep(3000)
  shot('ui-4-run')
  await ev('status', `document.querySelector('.ptime')?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 120) ?? ''`)
  const errs = await ev('page errors', `JSON.stringify(window.__errs ?? [])`)
  const alive = pidOf() === pid0
  page.close()
  adb('forward', '--remove', `tcp:${PORT}`)
  sh('setprop debug.velophi.devtools 0')
  const note = `${alive ? 'app stayed up' : 'app process changed'}; errors ${errs}`
  log(`  => ${note}`)
  return { name: 'ui', survived: alive ? 1 : 0, note }
}

const results = []
if (PLAN === 'ui') {
  results.push(await uiCheck())
} else if (PLAN === 'lock') {
  results.push(await lockCheck())
} else if (PLAN === 'rotate') {
  results.push(await run('base', VARIANTS.base, { shot: true }))
} else if (PLAN === 'matrix') {
  for (const [name, script] of Object.entries(VARIANTS)) results.push(await run(name, script, { shot: name === 'base' }))
} else if (VARIANTS[PLAN]) {
  results.push(await run(PLAN, VARIANTS[PLAN], { shot: true }))
}
log('---- summary ----')
for (const r of results) log(`${r.name.padEnd(22)} ${r.survived ?? '-'} / ${CYCLES * 2}  ${r.note ?? r.result}`)
adb('forward', '--remove', `tcp:${PORT}`)
log('done')
