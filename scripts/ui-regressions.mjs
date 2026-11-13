#!/usr/bin/env node
/**
 * The interface regressions: four of 26.61 (phase A, roadmap §5): the real app in Chromium, real clicks, semantic
 * assertions on the real state (window.__velophiTest with ?uitest=1, src/app/uitest.ts). Each flow keeps a Playwright
 * trace, a screenshot and the readings when it fails (.cache/ui/<flow>.zip / .png); a JSON report is written to
 * .cache/ui/report.json.
 *   1 template: open a template, play, pause, go to the next event — the frame is the first after the event, and the
 *     readouts are those of that frame (run id unchanged);
 *   2 file: open an older scene file, save it as a new file, open that again — the same document;
 *   3 export: CSV of the analysis — fingerprint, time range and SI units match the run shown;
 *   4 copilot: a mocked AI changes the scene through a tool call; undo restores it; a stopped request changes nothing.
 * 26.63 (the Workbench 3 shell):
 *   5 shell: the rail switches pages (clicks and Alt+digit), the library opens a section, a scene opened there lands in
 *     the workbench, the status bar follows the run, "?" opens the shortcut sheet;
 *   6 tally: a misconception case opens with its question, votes are counted, lock and run plays, the reveal shows the
 *     right option and the share, a second round is offered;
 *   7 share: the share link of a scene with a breakable rope opens the same document in a fresh page;
 *   8 convergence: RK4 on the spring oscillator gives fourth order in the dialog's table.
 *
 * Usage: npx vite build && node scripts/ui-regressions.mjs   (serves dist/ itself; VELOPHI_URL to use another server)
 */
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFileSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'

// Playwright is a tool of the test machine, not a dependency of the app (resolved like require, NODE_PATH included)
const { chromium } = createRequire(import.meta.url)('playwright')
const repo = resolve(new URL('..', import.meta.url).pathname)
const out = join(repo, '.cache', 'ui')
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

const srv = process.env.VELOPHI_URL ? null : await serve(join(repo, 'dist'))
const URL0 = process.env.VELOPHI_URL ?? `http://127.0.0.1:${srv.address().port}/`
const browser = await chromium.launch()
const report = { url: URL0, browser: browser.version(), flows: [] }

const hook = (page, f, arg) => page.evaluate(([src, a]) => { const T = window.__velophiTest; return (0, eval)(`(${src})`)(T, a) }, [f.toString(), arg])
async function until(page, f, arg, ms = 20000) {
  const t0 = Date.now()
  for (;;) {
    const v = await hook(page, f, arg).catch(() => null)
    if (v) return v
    if (Date.now() - t0 > ms) throw new Error(`timed out: ${f.toString().slice(0, 120)}`)
    await page.waitForTimeout(100)
  }
}
const expect = (ok, what, got) => { if (!ok) throw new Error(`${what}${got === undefined ? '' : ` (got ${JSON.stringify(got)})`}`) }

async function flow(name, body) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, locale: 'zh-CN', acceptDownloads: true })
  await ctx.tracing.start({ screenshots: true, snapshots: true })
  const page = await ctx.newPage()
  page.on('dialog', d => d.accept())
  const t0 = Date.now()
  const r = { name, ok: false, ms: 0, notes: [] }
  try {
    await page.goto(`${URL0}?uitest=1&download=1`)
    await until(page, T => T && T.run().frames > 1, null, 30000)
    // The welcome page of a first start covers the studio (it opens when the app is idle)
    await page.locator('button:has-text("开始使用")').click({ timeout: 6000 }).catch(() => {})
    await hook(page, T => { T.state.showWelcome = false; T.state.tourStep = null; return true })
    await page.waitForTimeout(200)
    await body(page, r.notes)
    r.ok = true
  } catch (e) {
    r.error = String(e?.message ?? e).split('\n').slice(0, 3).join(' ').slice(0, 400)
    await page.screenshot({ path: join(out, `${name}.png`) }).catch(() => {})
    r.state = await hook(page, T => ({ run: T.run(), time: T.state.time, frame: T.state.frame, page: T.state.page })).catch(() => null)
  }
  r.ms = Date.now() - t0
  await ctx.tracing.stop(r.ok ? {} : { path: join(out, `${name}.zip`) })
  await ctx.close()
  report.flows.push(r)
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${name} (${(r.ms / 1000).toFixed(1)} s)${r.ok ? '' : ` — ${r.error}`}`)
  for (const n of r.notes) console.log(`     ${n}`)
}

async function openTemplate(page, name) {
  await page.click('[data-ui=templates]')
  await page.click(`.titem:has-text("${name}")`)
  await page.click('text=创建场景')
  await until(page, T => !T.state.stale && T.run().frames > 10 && T.events() !== null)
}

// 1 · template, play, pause, event sides
await flow('template-events', async (page, notes) => {
  await openTemplate(page, '一维碰撞')
  const run0 = await hook(page, T => T.run().id)
  await until(page, T => (T.events() ?? []).length > 0)
  await page.click('[data-ui=play]')
  await until(page, T => T.state.playing)
  await page.waitForTimeout(300)
  await page.click('[data-ui=play]')
  await until(page, T => !T.state.playing)
  // From t = 0 the next event is the impact of A on B
  await hook(page, T => { T.rewind(); return true })
  const impact = await hook(page, T => T.events().find(e => e.changes.includes('impact')))
  expect(impact, 'the run has an impact event')
  await page.click('[data-ui=next-event]')
  const s = await until(page, (T, te) => { const dt = T.run().dt; return T.state.frame === Math.ceil(te / dt - 1e-9) ? { t: te, time: T.state.time, frame: T.state.frame, dt, id: T.run().id, playing: T.state.playing } : null }, impact.t)
  expect(Math.abs(s.time - s.frame * s.dt) < 1e-12 && !s.playing, 'the time shown is that frame, playback stopped', s)
  expect(s.id === run0, 'the run id did not change', { run0, now: s.id })
  // Readouts at the frame after the impact: A turned (m₂ > m₁) — signed velocity after < 0
  const [vA] = await hook(page, (T, t) => T.valuesAt(t, ['A.vx']), s.time)
  expect(vA < 0, 'A moves back after the impact (signed velocity)', vA)
  notes.push(`event t = ${s.t.toFixed(6)} s, frame ${s.frame}, v_A after = ${vA.toFixed(6)} m/s, run #${s.id}`)
})

// 2 · an older file, save as, open again
await flow('file-save-reopen', async (page, notes) => {
  const old = {
    format: 'verity-scene', version: 3, name: 'old file', dimension: 2,
    settings: { gravity: { x: 0, y: -9.8 }, duration: 2, integrator: 'rk45' },
    bodies: [
      { id: 'ground', name: 'ground', kind: 'static', role: 'ground', shape: { type: 'box', width: 6, height: 0.2 }, position: { x: 0, y: -0.1 }, angle: 0, velocity: { x: 0, y: 0 }, angularVelocity: 0, mass: 0, material: { muS: 0.3, muK: 0.2, restitution: 0 } },
      { id: 'box', name: 'box', kind: 'rigid', role: 'block', shape: { type: 'box', width: 0.3, height: 0.2 }, position: { x: 0, y: 1.1 }, angle: 0, velocity: { x: 1, y: 0 }, angularVelocity: 0, mass: 2, material: { muS: 0.3, muK: 0.2, restitution: 0 } }
    ],
    connectors: []
  }
  const file = join(out, 'old-file.velophi.json')
  writeFileSync(file, JSON.stringify(old))
  await page.click('[data-ui=file]')
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('text=打开…')])
  await chooser.setFiles(file)
  await until(page, T => T.state.scene.bodies.some(b => b.id === 'box') && !T.state.stale)
  const first = await hook(page, T => T.sceneText())
  await page.click('[data-ui=file]')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=另存为…')])
  const saved = join(out, 'saved.velophi.json')
  await dl.saveAs(saved)
  const text = readFileSync(saved, 'utf8')
  expect(JSON.parse(text).format === 'velophi-scene', 'saved in the current format', JSON.parse(text).format)
  await page.click('[data-ui=file]')
  const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.click('text=打开…')])
  await chooser2.setFiles(saved)
  await until(page, (T, f) => T.sceneText() === f, first)
  const dirty = await hook(page, T => T.state.dirty)
  expect(!dirty, 'the reopened file is not marked as changed')
  notes.push(`old format verity-scene v3 → ${JSON.parse(text).format} v${JSON.parse(text).version}; reopened document identical (${first.length} chars)`)
})

// 3 · analysis export matches the run
await flow('export-csv', async (page, notes) => {
  await openTemplate(page, '单摆')
  await until(page, T => T.run().frames > 600)
  await page.click('[data-ui=file]')
  await page.click('[data-ui=output]')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("导出 CSV")')])
  const path = join(out, 'export.csv')
  await dl.saveAs(path)
  const csv = readFileSync(path, 'utf8').replace(/^\uFEFF/, '')
  const fp = await hook(page, T => T.fingerprintText())
  expect(csv.includes(fp), 'the CSV carries the fingerprint of the run shown', fp)
  const lines = csv.split(/\r?\n/).filter(l => l && !l.startsWith('#'))
  const header = lines[0]
  expect(/\(s\)|\[s\]| s\b/.test(header), 'the time column is in s', header)
  const sep = header.includes(';') ? ';' : header.includes('\t') ? '\t' : ','
  const t = lines.slice(1).map(l => Number(l.split(sep)[0].replace(',', '.')))
  const run = await hook(page, T => T.run())
  expect(Math.abs(t[0]) < 1e-12, 'the export starts at t = 0', t[0])
  expect(Math.abs(t[t.length - 1] - (run.frames - 1) * run.dt) < 1e-9, 'the export ends where the run computed', { last: t[t.length - 1], computed: (run.frames - 1) * run.dt })
  notes.push(`${t.length} rows, 0 … ${t[t.length - 1].toFixed(4)} s, ${fp}`)
})

// 4 · Copilot with a mocked AI: apply, undo, stop
await flow('copilot-mock', async (page, notes) => {
  const replies = []
  await page.route('**/mock-ai/**', async route => {
    const r = replies.shift()
    if (!r) { await route.fulfill({ status: 500, body: 'no reply' }); return }
    if (r.delay) await new Promise(s => setTimeout(s, r.delay))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: r.message, finish_reason: 'stop' }], usage: { total_tokens: 10 } }) }).catch(() => {})
  })
  await hook(page, (T, u) => T.useMockAi(u), `${URL0}mock-ai/v1`)
  await openTemplate(page, '斜面滑块')
  const theta = T => T.state.scene.extra?.template?.values?.theta
  expect(await hook(page, theta) === 30, 'the template starts at 30°')
  await page.click('[data-ui=copilot]')
  replies.push({ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'load_template', arguments: JSON.stringify({ id: 'incline', params: { theta: 40 } }) } }] } }, { message: { role: 'assistant', content: '已改为 40°。' } })
  await page.fill('[data-ui=copilot-input]', '把斜面倾角改成 40 度')
  await page.click('[data-ui=copilot-send]')
  await until(page, T => T.state.scene.extra?.template?.values?.theta === 40 && !T.copilot.busy)
  await page.waitForSelector('[data-ui=copilot-undo]')
  await page.click('[data-ui=copilot-undo]')
  await until(page, T => T.state.scene.extra?.template?.values?.theta === 30)
  // A request that is stopped before the answer changes nothing
  replies.push({ delay: 4000, message: { role: 'assistant', content: null, tool_calls: [{ id: 'c2', type: 'function', function: { name: 'load_template', arguments: JSON.stringify({ id: 'incline', params: { theta: 50 } }) } }] } })
  const before = await hook(page, T => T.sceneText())
  await page.fill('[data-ui=copilot-input]', '改成 50 度')
  await page.click('[data-ui=copilot-send]')
  await until(page, T => T.copilot.busy)
  await page.click('[data-ui=copilot-stop]')
  await until(page, T => !T.copilot.busy)
  await page.waitForTimeout(4500)
  expect(await hook(page, (T, b) => T.sceneText() === b, before), 'the stopped request changed nothing')
  notes.push('apply 30° → 40°, undo → 30°, stopped request: scene unchanged')
})

// 5 · the shell: rail, pages, library, status bar, shortcut sheet
await flow('shell-pages', async (page, notes) => {
  expect(await hook(page, T => T.state.page) === 'studio', 'tests start in the workbench')
  for (const p of ['home', 'library', 'classroom', 'lab', 'monitor', 'settings', 'studio']) {
    await page.click(`[data-ui=page-${p}]`)
    await until(page, (T, q) => T.state.page === q, p)
  }
  await page.keyboard.press('Alt+1')
  await until(page, T => T.state.page === 'home')
  await page.waitForSelector('[data-ui=home-continue]')
  await page.click('[data-ui=home-continue]')
  await until(page, T => T.state.page === 'studio')
  // the library keeps the galleries inside the page; a template created there opens in the workbench
  await page.keyboard.press('Alt+4')
  await until(page, T => T.state.page === 'library')
  await page.click('[data-ui=library-templates]')
  await page.click('.embed-host .titem:has-text("猎人与猴子")')
  await page.click('.embed-host >> text=创建场景')
  await until(page, T => T.state.page === 'studio' && T.state.scene.bodies.some(b => b.id === 'monkey') && !T.state.stale && T.run().frames > 10)
  expect(await page.locator('.app > .dialog-backdrop').count() === 0, 'no dialog is left open over the workbench')
  // status bar: ready, with frames and events; an edit marks the result out of date
  const ready = await page.locator('footer.status .state').innerText()
  expect(/结果已就绪/.test(ready), 'the status bar says the result is ready', ready)
  const hit = await hook(page, T => T.events().some(e => e.changes.includes('impact') || e.changes.includes('touch')))
  expect(hit, 'the bullet meets the monkey')
  // keys: sidebar, drawer, shortcut sheet
  const side0 = await hook(page, T => T.shell.sideOpen)
  await page.keyboard.press('Control+Backslash')
  await until(page, (T, v) => T.shell.sideOpen === !v, side0)
  await page.keyboard.press('Control+Alt+2')
  await until(page, T => T.shell.sideOpen && T.shell.sideTab === 'analysis')
  const drawer0 = await hook(page, T => T.shell.drawerOpen)
  await page.keyboard.press('Control+j')
  await until(page, (T, v) => T.shell.drawerOpen === !v, drawer0)
  await page.locator('.page-studio canvas').first().focus()
  await page.keyboard.press('?')
  await until(page, T => T.shell.shortcuts)
  await page.waitForSelector('.dialog.sheet')
  await page.keyboard.press('Escape')
  await until(page, T => !T.shell.shortcuts)
  // zoom steps from the status bar change the scale shown there
  const ppm0 = await hook(page, T => T.viewStatus.ppm)
  await page.click('footer.status .zoom .zb:last-child')
  await until(page, (T, v) => T.viewStatus.ppm > v * 1.2, ppm0)
  notes.push(`pages by click and Alt+digit; library → workbench; status "${ready.trim()}"; zoom ${Math.round(ppm0)} → ${Math.round(await hook(page, T => T.viewStatus.ppm))} px/m`)
})

// 6 · predict first: a case with the class tally
await flow('class-tally', async (page, notes) => {
  await page.click('[data-ui=page-library]')
  await page.click('[data-ui=library-cases]')
  await page.click('[data-ui=case-drop-throw] >> text=先猜后看')
  await until(page, T => T.state.page === 'studio' && T.tally.open && T.tally.stage === 'vote' && T.state.scene.bodies.some(b => b.id === 'B') && !T.state.stale)
  await page.waitForSelector('[data-ui=tally-card]')
  // the answer is not on the screen before the reveal
  expect(await page.locator('[data-ui=tally-card] .opt.right').count() === 0, 'no option is marked before the reveal')
  const plus = page.locator('[data-ui=tally-card] .count .btn.tonal')
  for (const [i, n] of [[0, 3], [1, 2], [2, 4]]) for (let k = 0; k < n; k++) await plus.nth(i).click()
  expect((await hook(page, T => T.tally.rounds[0].join(','))) === '3,2,4', 'the votes are counted', await hook(page, T => T.tally.rounds[0]))
  await page.click('[data-ui=tally-run]')
  await until(page, T => T.tally.stage === 'run' && T.state.playing)
  await page.click('[data-ui=tally-reveal]')
  await until(page, T => T.tally.stage === 'reveal' && !T.state.playing)
  expect(await page.locator('[data-ui=tally-card] .opt.right').count() === 1, 'exactly one option is marked right')
  const share = await page.locator('[data-ui=tally-card] .share b').first().innerText()
  expect(share.trim() === '44%', 'the share of right answers is 4 of 9', share)
  await page.click('[data-ui=tally-card] >> text=讨论后再投一次')
  await until(page, T => T.tally.stage === 'vote' && T.tally.rounds.length === 2 && T.state.frame === 0)
  expect((await hook(page, T => T.tally.history.length)) === 1, 'the first round is in the history')
  notes.push(`votes 3/2/4 → ${share.trim()} right; second round offered; both balls land together: ${JSON.stringify(await hook(page, T => T.events().slice(0, 2).map(e => e.t.toFixed(4))))}`)
})

// 7 · share link
await flow('share-link', async (page, notes) => {
  await openTemplate(page, '摆线被拉断')
  await until(page, T => (T.events() ?? []).some(e => e.changes.includes('break')))
  const first = await hook(page, T => T.sceneText())
  await page.click('[data-ui=file]')
  await page.click('[data-ui=share]')
  await page.waitForSelector('[data-ui=share-link]')
  const link = await until(page, () => { const el = document.querySelector('[data-ui=share-link]'); return el && el.value.includes('#s=z1.') ? el.value : null })
  expect(link.startsWith(URL0.replace(/\?.*$/, '')), 'on the web the link points at this page', link.slice(0, 60))
  const other = await page.context().newPage()
  await other.goto(link.replace('#s=', '?uitest=1#s='))
  await until(other, T => T && T.state.page === 'studio' && T.state.scene.connectors.some(c => c.type === 'rope' && c.maxTension > 0) && !T.state.stale, null, 30000)
  const again = await hook(other, T => T.sceneText())
  expect(again === first, 'the opened scene is the same document', { a: first.length, b: again.length })
  expect(await hook(other, T => T.shell.mode) === 'simulate', 'it opened in the simulate mode')
  expect(!(await other.evaluate(() => location.hash)), 'the address was cleaned')
  await until(other, T => (T.events() ?? []).some(e => e.changes.includes('break')))
  await other.close()
  notes.push(`link of ${link.length} characters for a scene of ${first.length}; opened as the same document, rope breaks there too`)
})

// 8 · convergence study
await flow('convergence', async (page, notes) => {
  await openTemplate(page, '弹簧振子')
  await page.click('[data-ui=compute]')
  await page.click('[data-ui=convergence]')
  await page.waitForSelector('.dialog.conv')
  await page.selectOption('[data-ui=conv-method]', 'rk4')
  await page.selectOption('[data-ui=conv-quantity]', 'block.x')
  await page.selectOption('[data-ui=conv-levels]', '7')
  await page.click('[data-ui=conv-run]')
  await page.waitForSelector('.dialog.conv table.tbl tbody tr', { timeout: 60000 })
  const orders = await page.$$eval('.dialog.conv table.tbl tbody tr:not(.ref) td:nth-child(4)', tds => tds.map(td => td.textContent.trim()).filter(t => t !== '—').map(Number))
  expect(orders.length >= 2 && orders.slice(-2).every(o => o > 3.6 && o < 4.4), 'RK4 converges at fourth order', orders)
  const verdict = await page.locator('.dialog.conv .verdict').innerText()
  expect(/一致/.test(verdict), 'the verdict says the order agrees', verdict)
  notes.push(`RK4 observed orders ${orders.map(o => o.toFixed(2)).join(', ')}`)
})

writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1))
await browser.close()
srv?.close()
const failed = report.flows.filter(f => !f.ok).length
console.log(`${report.flows.length - failed}/${report.flows.length} flows passed in ${report.browser}`)
process.exit(failed ? 1 : 0)
