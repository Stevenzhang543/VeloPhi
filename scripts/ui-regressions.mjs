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
 * 26.63 (the Workbench 3 shell), updated for the five-panel shell of 26.64 (D240–D241):
 *   5 shell: the rail lists the five panels in order and switches pages (clicks, Alt+1…5, Alt+0 for home, Ctrl+, for
 *     the settings), the home page has five jump blocks and does not scroll, the legacy `classroom` page id lands in
 *     the library's classroom section, a scene opened in the library lands in the motion panel and the home page then
 *     offers to continue it, the teaching menu switches projection, the status bar follows the run, "?" opens the
 *     shortcut sheet;
 *   6 tally: a case opened from the library's classroom section comes with its question, votes are counted, lock and
 *     run plays, the reveal shows the right option and the share, a second round is offered, the tally is listed in
 *     the classroom section afterwards, and the teaching menu opens the tally card;
 *   7 share: the share link of a scene with a breakable rope opens the same document in a fresh page;
 *   8 convergence: RK4 on the spring oscillator gives fourth order in the dialog's table.
 * 26.64 (D248–D251):
 *   onboarding: a device with no data is offered the walkthrough on the home page; its five segments are walked with
 *     real clicks (each step ends because the deed was done), closed half-way and taken up after a reload, a step and
 *     a segment skipped; a device that ran 26.63 is offered only the list of changes; reduced motion.
 *   physics-shell: the catalogue of experiments is a popover with one level filter, the circuit's components are six
 *     named groups, the key readings come first, export / import / reset are in 更多 (D243, D244).
 * 26.64 (D276–D278), 物理实验 › 原子与核:
 *   nuclide-chart: the chart of nuclides from the global search — search, click, pan and zoom (a frame under 4 ms),
 *     the page of a nuclide with the record of the core, the decay chain of U-238 with the core's amounts and
 *     diagnostics, the address #n=…, the citations of NUBASE2020 / AME2020;
 *   reactor-workshop: k_eff on the page is the core's, rods and painting solve the layout again, a run at full power
 *     with a scram and its reset, the reactivity budget, a task the core checks, the notice of the teaching model.
 *
 * Usage: npx vite build && node scripts/ui-regressions.mjs   (serves dist/ itself; VELOPHI_URL to use another server)
 */
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFileSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Playwright is a tool of the test machine, not a dependency of the app (resolved like require, NODE_PATH included)
const { chromium } = createRequire(import.meta.url)('playwright')
const repo = resolve(fileURLToPath(new URL('..', import.meta.url)))
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

// 26.64: VELOPHI_DIST serves another build folder (several builds can be checked side by side)
const srv = process.env.VELOPHI_URL ? null : await serve(resolve(repo, process.env.VELOPHI_DIST ?? 'dist'))
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
  // 26.64: VELOPHI_FLOW=<part of a name> runs only the flows whose name contains it
  if (process.env.VELOPHI_FLOW && !name.includes(process.env.VELOPHI_FLOW)) return
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, locale: 'zh-CN', acceptDownloads: true })
  await ctx.tracing.start({ screenshots: true, snapshots: true })
  const page = await ctx.newPage()
  page.on('dialog', d => d.accept())
  const t0 = Date.now()
  const r = { name, ok: false, ms: 0, notes: [] }
  try {
    await page.goto(`${URL0}?uitest=1&download=1`)
    await until(page, T => T && T.run().frames > 1, null, 30000)
    // 26.64 (D248): under the automatic tests nothing of the onboarding shows (the flow `onboarding` asks for it)
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

// 5 · the shell: rail, pages, home, library, status bar, shortcut sheet
await flow('shell-pages', async (page, notes) => {
  expect(await hook(page, T => T.state.page) === 'studio', 'tests start in the motion panel')
  // 26.64 (D240): five panels top to bottom; the mark opens the home page; search, help and settings below
  const order = await page.$$eval('nav.rail .items:not(.foot) [data-ui^="page-"]', els => els.map(e => e.getAttribute('data-ui')))
  expect(order.join(',') === 'page-studio,page-lab,page-chem,page-library,page-monitor', 'the rail lists the five panels in order', order)
  const foot = await page.$$eval('nav.rail .items.foot [data-ui]', els => els.map(e => e.getAttribute('data-ui')))
  expect(foot.join(',') === 'search,help,page-settings', 'search, help and settings are below the panels', foot)
  for (const p of ['home', 'library', 'chem', 'lab', 'monitor', 'settings', 'studio']) {
    await page.click(`[data-ui=page-${p}]`)
    await until(page, (T, q) => T.state.page === q, p)
  }
  for (const [key, p] of [['Alt+2', 'lab'], ['Alt+3', 'chem'], ['Alt+4', 'library'], ['Alt+5', 'monitor'], ['Alt+1', 'studio'], ['Control+,', 'settings'], ['Alt+0', 'home']]) {
    await page.keyboard.press(key)
    await until(page, (T, q) => T.state.page === q, p)
  }
  // the home page (D241): five jump blocks, nothing to continue yet, no scrolling, no context bar
  await page.waitForSelector('[data-ui=home-jump-chem]')
  const home = await page.evaluate(() => { const h = document.querySelector('.home'); return { jumps: h.querySelectorAll('.jump').length, over: h.scrollHeight - h.clientHeight, cont: h.querySelectorAll('[data-ui=home-continue]').length, bar: document.querySelectorAll('header.ctxbar').length } })
  expect(home.jumps === 5 && home.over <= 0 && home.cont === 0 && home.bar === 0, 'the home page: five jumps, no scrolling, nothing to continue, no context bar', home)
  await page.click('[data-ui=home-jump-chem]')
  await until(page, T => T.state.page === 'chem')
  await page.waitForSelector('[data-ui=chem-page] [data-ui=stage-catalogue]')
  // the classroom page of 26.63 is the library's classroom section: the old page id still works
  await hook(page, T => { T.state.page = 'classroom'; return true })
  await until(page, T => T.state.page === 'library' && T.state.librarySection === 'classroom')
  await page.waitForSelector('[data-ui=classroom-tally]')
  // the library keeps the galleries inside the page; a template created there opens in the workbench
  await page.click('[data-ui=library-templates]')
  await page.click('.embed-host .titem:has-text("猎人与猴子")')
  await page.click('.embed-host >> text=创建场景')
  await until(page, T => T.state.page === 'studio' && T.state.scene.bodies.some(b => b.id === 'monkey') && !T.state.stale && T.run().frames > 10)
  expect(await page.locator('.app > .dialog-backdrop').count() === 0, 'no dialog is left open over the motion panel')
  // now there is work to go back to: the home page offers it
  await page.keyboard.press('Alt+0')
  await page.waitForSelector('[data-ui=home-continue]')
  await page.click('[data-ui=home-continue]')
  await until(page, T => T.state.page === 'studio')
  // 教学 is a group of the bar's 更多 (D245): projection on and off
  await page.click('[data-ui=studio-more]')
  await page.click('[data-ui=teach]')
  await page.click('[data-ui=projector]')
  await until(page, T => T.settings.projector === true)
  expect(await page.evaluate(() => document.documentElement.classList.contains('projector') && document.documentElement.classList.contains('glass-solid')), 'projection is on and its material is solid')
  await page.click('[data-ui=projector]')
  await until(page, T => T.settings.projector === false)
  await page.keyboard.press('Escape')
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
  notes.push(`five panels by click and Alt+1…5, home Alt+0, settings Ctrl+,; classroom id → library section; library → motion → home "continue"; status "${ready.trim()}"; zoom ${Math.round(ppm0)} → ${Math.round(await hook(page, T => T.viewStatus.ppm))} px/m`)
})

// 6 · predict first: a case with the class tally
await flow('class-tally', async (page, notes) => {
  // 26.64 (D240): the classroom is a section of the library; its ready-made cases open with the tally
  await page.click('[data-ui=page-library]')
  await page.click('[data-ui=library-classroom]')
  await page.click('[data-ui=classroom-case-drop-throw]')
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
  // the tally is listed in the classroom section, and the teaching menu opens the card from the panel
  await hook(page, T => { T.tally.open = false; T.state.page = 'classroom'; return true })
  await page.waitForSelector('.classroom .history .hrow')
  expect(await page.locator('.classroom .history .hrow').count() === 1, 'the classroom section lists the tally')
  await page.click('[data-ui=page-studio]')
  await page.click('[data-ui=studio-more]')
  await page.click('[data-ui=teach]')
  await page.click('[data-ui=tally]')
  await until(page, T => T.tally.open && T.state.page === 'studio')
  await page.waitForSelector('[data-ui=tally-card]')
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
  await page.click('[data-ui=studio-more]')
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

// 26.64 (D268): the chemistry bench. Its hook is `__velophiTest.chem` (state(), read(id), hash(), byLabel(), …)
async function openBench(page) {
  await page.click('[data-ui=page-chem]')
  await until(page, T => T.chem && T.chem.bench.ready.value, null, 30000)
  await hook(page, T => { T.chem.bench.reset(); return true })
  await page.waitForSelector('[data-ui=chem-empty]')
}
async function placeKind(page, group, kind) {
  await page.click('[data-ui=chem-apparatus]')
  await page.click(`[data-ui=chem-apparatus-shelf] [data-group=${group}]`)
  await page.click(`[data-ui=chem-apparatus-shelf] [data-kind=${kind}]`)
}
/** Add a reagent to the selected vessel through the shelf and the amount dialog. */
async function addReagent(page, reagent, value, unit) {
  await page.click('[data-ui=chem-page] [data-ui=stage-catalogue]')
  await page.fill('[data-ui=chem-shelf-search]', reagent)
  await page.click(`[data-ui=chem-shelf] [data-reagent="${reagent}"]`)
  await page.waitForSelector('[data-ui=chem-amount]')
  if (unit) await page.selectOption('[data-ui=chem-amount-unit]', unit)
  await page.fill('[data-ui=chem-amount-value]', String(value))
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-ui=chem-amount]', { state: 'detached' })
}

// 11 · titration: flask, acid, indicator, base from a burette in portions; pH before, at and after the end point
await flow('chem-titration', async (page, notes) => {
  await openBench(page)
  await placeKind(page, 'container', 'erlenmeyer')
  const flask = await until(page, T => T.chem.byLabel('A'))
  await addReagent(page, 'HCl_0.1M', '20.00')
  expect(Math.abs((await hook(page, (T, id) => T.chem.read(id).volume_mL, flask)) - 20) < 1e-9, '20.00 mL of acid are in the flask')
  const indicator = await hook(page, T => T.chem.reagents().some(r => r.id === 'phenolphthalein'))
  if (indicator) await addReagent(page, 'phenolphthalein', '1', 'drop')
  await placeKind(page, 'transfer', 'buretteBase')
  const burette = await until(page, T => T.chem.byLabel('B'))
  await addReagent(page, 'NaOH_0.1M', '50.00')
  // the burette is clamped over the flask (a drag on the bench; here through the same call the drop makes)
  await hook(page, (T, [b, f]) => { T.chem.bench.setExtras(b, { above: f }); T.chem.bench.select(b); return true }, [burette, flask])
  const deliver = async mL => {
    await page.click('[data-ui=chem-actions]')
    await page.click('[data-ui=chem-act-deliver]')
    await page.waitForSelector('[data-ui=chem-amount]')
    await page.fill('[data-ui=chem-amount-value]', mL)
    await page.keyboard.press('Enter')
    await page.waitForSelector('[data-ui=chem-amount]', { state: 'detached' })
  }
  const shown = async () => Number((await page.locator('[data-ui=chem-readings] [data-reading=pH] dd').innerText()).replace(',', '.').replace('−', '-'))
  const core = () => hook(page, (T, id) => T.chem.read(id).pH, flask)
  const pH = {}
  await deliver('19.00'); await deliver('0.90')
  const beforeHash = await hook(page, T => T.chem.hash())
  await hook(page, (T, id) => { T.chem.bench.select(id); return true }, flask)
  pH.before = await core()
  expect(Math.abs((await shown()) - pH.before) < 0.006, 'the inspector shows the pH of the core before the end point', { shown: await shown(), core: pH.before })
  await hook(page, (T, id) => { T.chem.bench.select(id); return true }, burette)
  await deliver('0.10')
  const atHash = await hook(page, T => T.chem.hash())
  pH.at = await core()
  await deliver('0.10')
  pH.after = await core()
  await hook(page, (T, id) => { T.chem.bench.select(id); return true }, flask)
  expect(Math.abs((await shown()) - pH.after) < 0.006, 'the inspector shows the pH of the core after the end point', { shown: await shown(), core: pH.after })
  expect(pH.before < 5 && pH.after > 9, 'the pH jumps across the end point', pH)
  expect(Math.abs(pH.at - 7) < 0.1, 'pH 7 ± 0.1 at equivalence (20.00 mL of each)', pH.at)
  expect(Math.abs((await hook(page, (T, id) => T.chem.read(id).volume_mL, burette)) - 29.9) < 1e-9, 'the burette delivered 20.10 mL in all')
  const colour = await hook(page, (T, id) => T.chem.state().vessels.find(v => v.id === id).colour, flask)
  if (indicator) expect(colour && Math.min(...colour) < 250, 'past the end point the indicator colours the solution (the colour is the core\'s)', colour)
  // undo twice: back at the end point, then before it — the fingerprints return
  await page.click('[data-ui=chem-undo]')
  expect((await hook(page, T => T.chem.hash())) === atHash, 'one undo returns to the fingerprint at the end point')
  await page.click('[data-ui=chem-undo]')
  expect((await hook(page, T => T.chem.hash())) === beforeHash, 'two undos return to the fingerprint before it')
  const bar = await page.$$eval('[data-ui=chem-page] .sbar .lead > *, [data-ui=chem-page] .sbar .tail > *', els => els.length)
  expect(bar <= 7, 'the bar holds at most seven controls (D243)', bar)
  notes.push(`pH ${pH.before.toFixed(3)} at 19.90 mL, ${pH.at.toFixed(3)} at 20.00 mL, ${pH.after.toFixed(3)} at 20.10 mL${indicator ? '; indicator colour ' + JSON.stringify(colour) : '; no indicator in the catalogue'}; undo ×2 restores both fingerprints; ${bar} controls on the bar`)
})

// 12 · gas over water: a stoppered generator with zinc and acid, a tube, a jar over water
await flow('chem-gas-collection', async (page, notes) => {
  await openBench(page)
  await placeKind(page, 'container', 'erlenmeyer')
  const gen = await until(page, T => T.chem.byLabel('A'))
  await addReagent(page, 'Zn_granule', '5', 'g')
  await addReagent(page, 'HCl_1M', '50')
  await placeKind(page, 'container', 'gasJar')
  const jar = await until(page, T => T.chem.byLabel('B'))
  await page.click('[data-ui=chem-actions]')
  await page.click('[data-ui=chem-vessel-menu] [data-collect=water]')
  await until(page, (T, id) => T.chem.state().vessels.find(v => v.id === id).collect === 'water', jar)
  // stopper and tube on the generator; the tube asks where it leads: the jar (the keyboard path — select, Enter)
  await hook(page, (T, id) => { T.chem.bench.select(id); return true }, gen)
  await placeKind(page, 'transfer', 'stopper')
  await until(page, (T, id) => T.chem.state().vessels.find(v => v.id === id).closed, gen)
  await placeKind(page, 'transfer', 'tube')
  await page.waitForSelector('[data-ui=chem-hint]')
  await hook(page, (T, id) => { T.chem.bench.select(id); return true }, jar)
  await page.locator('[data-ui=chem-bench]').focus()
  await page.keyboard.press('Enter')
  await until(page, (T, [g, j]) => T.chem.state().vessels.find(v => v.id === g).outlet === j, [gen, jar])
  // let time pass at ×60 until the jar holds gas
  await page.click('[data-ui=chem-time-menu]')
  await page.click('[data-ui=chem-time] [data-speed="60"]')
  await page.click('[data-ui=chem-play]')
  await until(page, (T, id) => T.chem.state().vessels.find(v => v.id === id).gas_mL > 20, jar, 60000)
  await page.click('[data-ui=chem-play]')
  await until(page, T => !T.chem.bench.running.value)
  const held = await hook(page, (T, id) => ({ summary: T.chem.state().vessels.find(v => v.id === id).gas_mL, read: T.chem.read(id).gas_mL, gas: T.chem.read(id).gas.map(g => g.id) }), jar)
  expect(held.summary === held.read && held.read > 20, 'the collected volume on the bench is the gas_mL of the core', held)
  expect(held.gas.includes('H2(g)'), 'hydrogen is in the jar', held.gas)
  const shown = Number((await page.locator('[data-ui=chem-readings] [data-reading=gas] dd').innerText()).replace(/[^\d.,]/g, '').replace(',', '.'))
  expect(Math.abs(shown - held.read) < 0.06, 'the inspector shows that volume', { shown, core: held.read })
  // hydrogen chloride is too soluble to be collected over water: reported, not in the jar
  const lost = await hook(page, (T, id) => T.chem.phenomena().find(p => p.vessel === id && p.code === 'collect.dissolved' && p.subject === 'HCl(g)') ?? null, jar)
  expect(lost && lost.n > 0 && !held.gas.includes('HCl(g)'), 'the hydrogen chloride carried along is reported as dissolved, not collected', lost)
  const log = await page.evaluate(() => { document.querySelector('[data-tab=log]')?.click(); return true })
  await page.waitForSelector('[data-ui=chem-log] li')
  const lines = await page.$$eval('[data-ui=chem-log] li .t', els => els.map(e => e.textContent.trim()))
  expect(log && lines.some(l => /导管/.test(l)) && lines.some(l => /排水集气/.test(l)), 'the record names the tube and the collection over water', lines)
  notes.push(`jar holds ${held.read.toFixed(2)} mL (${held.gas.join(', ')}); HCl(g) dissolved in the trough: ${lost.n.toExponential(2)} mol; ${lines.length} lines in the record`)
})

// 26.65 (D297 item 1): pouring on the bench — a beaker carried over another's mouth tips, pours while held, and the
// hand letting go is ONE pour of the log, of the amount shown beside the stream; undo takes it back.
await flow('chem-pour-drag', async (page, notes) => {
  await openBench(page)
  await placeKind(page, 'container', 'beaker')
  const a = await until(page, T => T.chem.byLabel('A'))
  await addReagent(page, 'HCl_1M', '100')
  await placeKind(page, 'container', 'beaker')
  const b = await until(page, T => T.chem.byLabel('B'))
  await addReagent(page, 'NaOH_1M', '20')
  const before = await hook(page, T => ({ hash: T.chem.hash(), log: T.chem.log().length }))
  const pa = await until(page, (T, id) => T.chem.where(id), a), pb = await until(page, (T, id) => T.chem.where(id), b)
  await page.mouse.move(pa.x, pa.midY)
  await page.mouse.down()
  await page.mouse.move(pa.x + 15, pa.midY - 15, { steps: 3 })
  await page.mouse.move(pb.x, pb.mouthY - 30, { steps: 8 })
  await page.waitForSelector('[data-ui=chem-pour-amount]')
  await page.waitForTimeout(1500)
  await page.mouse.up()
  const after = await hook(page, (T, [x, y]) => ({ log: T.chem.log(), a: T.chem.read(x).volume_mL, b: T.chem.read(y).volume_mL }), [a, b])
  const last = after.log[after.log.length - 1]
  expect(after.log.length === before.log + 1, 'letting go adds one entry to the log', after.log.length - before.log)
  expect(last.act === 'pour' && last.from === a && last.to === b && last.amount?.unit === 'mL' && last.amount.value > 1, 'the entry is a pour from A to B in mL', last)
  expect(Math.abs(after.a - (100 - last.amount.value)) < 1e-6 && Math.abs(after.b - (20 + last.amount.value)) < 1e-6, 'the volumes changed by the amount poured (additive volumes)', after)
  await page.click('[data-ui=chem-undo]')
  expect((await hook(page, T => T.chem.hash())) === before.hash, 'one undo returns to the fingerprint before the pour')
  notes.push(`held 1.5 s over the mouth: one pour of ${last.amount.value} mL; undo restores the fingerprint`)
})

// 26.65 (D297 items 3–5): apparatus as things — a tripod and an alcohol lamp put on the bench, the beaker dragged onto
// the tripod's gauze, the lamp dragged under it (it snaps to the tripod), the cap taken off and the lamp lit by taps:
// the heat starts as ONE `heat` entry of the log; undo puts the lamp out again.
async function drag(page, from, to, { steps = 10, hold = 0 } = {}) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 8, from.y - 8, { steps: 2 })
  await page.mouse.move(to.x, to.y, { steps })
  if (hold) await page.waitForTimeout(hold)
  await page.mouse.up()
}
await flow('chem-lamp-tripod', async (page, notes) => {
  await openBench(page)
  await placeKind(page, 'container', 'beaker')
  const beaker = await until(page, T => T.chem.byLabel('A'))
  await addReagent(page, 'water', '100')
  // nothing selected: the tripod and the lamp are put beside what stands there
  await hook(page, T => { T.chem.bench.select(null); return true })
  await placeKind(page, 'heating', 'tripod')
  await hook(page, T => { T.chem.bench.select(null); T.chem.bench.selectFixture(null); return true })
  await placeKind(page, 'heating', 'alcoholBurner')
  const rig = await until(page, T => { const f = T.chem.fixtures(); const t = f.find(x => x.kind === 'tripod'), l = f.find(x => x.kind === 'alcoholBurner'); return t && l ? { tripod: t, lamp: l } : null })
  // the beaker onto the gauze: carried from its middle to above the tripod
  const pb = await until(page, (T, id) => T.chem.where(id), beaker)
  const gauze = await hook(page, (T, t) => T.chem.screenOf(t.x, 12.6 + 5), rig.tripod)
  await drag(page, { x: pb.x, y: pb.midY }, { x: gauze.x, y: gauze.y })
  const on = await until(page, (T, id) => T.chem.bench.extras(id).on, beaker)
  expect(on === rig.tripod.id, 'the beaker rests on the tripod', on)
  // the lamp under the tripod (a little off-centre: it snaps)
  const lampAt = await hook(page, (T, l) => T.chem.screenOf(l.x, 4), rig.lamp)
  const under = await hook(page, (T, t) => T.chem.screenOf(t.x + 1.5, 4), rig.tripod)
  await drag(page, lampAt, under)
  const lampX = await until(page, (T, id) => { const l = T.chem.fixtures().find(f => f.id === id); return l ? String(l.x) : null }, rig.lamp.id)
  expect(Number(lampX) === rig.tripod.x, 'the lamp snapped under the tripod', { lampX, tripod: rig.tripod.x })
  const before = await hook(page, T => ({ n: T.chem.log().length, hash: T.chem.hash() }))
  expect(await hook(page, (T, id) => T.chem.state().vessels.find(v => v.id === id).heater, beaker) === 0, 'nothing heats while the lamp is out')
  // two taps on the lamp: the cap comes off, the lamp is lit
  const lamp = await hook(page, (T, t) => T.chem.screenOf(t.x, 3), rig.tripod)
  await page.mouse.click(lamp.x, lamp.y)
  await until(page, (T, id) => T.chem.fixtures().find(f => f.id === id).cap === false, rig.lamp.id)
  expect((await hook(page, T => T.chem.log().length)) === before.n, 'taking the cap off is not an action of the log')
  await page.mouse.click(lamp.x, lamp.y)
  await until(page, (T, id) => T.chem.state().vessels.find(v => v.id === id).heater > 0, beaker)
  const log = await hook(page, T => T.chem.log())
  expect(log.length === before.n + 1, 'lighting the lamp under the beaker is one entry of the log', log.length - before.n)
  expect(log[log.length - 1].act === 'heat' && log[log.length - 1].vessel === beaker && log[log.length - 1].power === 150, 'the entry is heat 150 W on the beaker', log[log.length - 1])
  await page.click('[data-ui=chem-undo]')
  const back = await hook(page, (T, [id, l]) => ({ hash: T.chem.hash(), lit: T.chem.fixtures().find(f => f.id === l).lit, heater: T.chem.state().vessels.find(v => v.id === id).heater }), [beaker, rig.lamp.id])
  expect(back.hash === before.hash && back.lit === false && back.heater === 0, 'undo puts the lamp out and returns to the fingerprint', back)
  notes.push(`beaker dragged onto the tripod, lamp dragged under it (snapped to x = ${rig.tripod.x} cm), cap off + lit by two taps → one heat entry of 150 W; undo restores`)
})

// 26.65 (D297 item 8): a tube is a thing — a gas jar dragged onto the shelf of a pneumatic trough stands on its mouth
// there (collector: water); the tube taken for the stoppered generator has a free end, dragged under the jar's mouth
// (connect); time passes and the jar fills with hydrogen.
await flow('chem-tube-trough', async (page, notes) => {
  await openBench(page)
  await placeKind(page, 'container', 'erlenmeyer')
  const gen = await until(page, T => T.chem.byLabel('A'))
  await addReagent(page, 'Zn_granule', '5', 'g')
  await addReagent(page, 'HCl_1M', '50')
  await hook(page, T => { T.chem.bench.select(null); return true })
  await placeKind(page, 'container', 'pneumaticTrough')
  const trough = await until(page, T => T.chem.fixtures().find(f => f.kind === 'pneumaticTrough'))
  await hook(page, T => { T.chem.bench.selectFixture(null); return true })
  await placeKind(page, 'container', 'gasJar')
  const jar = await until(page, T => T.chem.byLabel('B'))
  // the jar onto the trough's shelf: it stands on its mouth, over water
  const pj = await until(page, (T, id) => T.chem.where(id), jar)
  const shelf = await hook(page, (T, t) => T.chem.screenOf(t.x + 4, 6), trough)
  await drag(page, { x: pj.x, y: pj.midY }, shelf)
  await until(page, (T, id) => T.chem.state().vessels.find(v => v.id === id).collect === 'water', jar)
  // the tube for the generator: its stopper goes in, its other end is free
  await hook(page, (T, id) => { T.chem.bench.select(id); return true }, gen)
  await placeKind(page, 'transfer', 'tube')
  const tube = await until(page, T => T.chem.fixtures().find(f => f.kind === 'tube'))
  await until(page, (T, id) => T.chem.state().vessels.find(v => v.id === id).closed, gen)
  // its free end, carried under the jar's mouth in the water
  const end = await hook(page, (T, t) => T.chem.screenOf(t.b.x, t.b.y), tube)
  const jarAt = await hook(page, (T, id) => { const e = T.chem.bench.extras(id); return T.chem.screenOf(e.x + 0.5, e.y + 0.5) }, jar)
  await drag(page, end, jarAt)
  await until(page, (T, [g, j]) => T.chem.state().vessels.find(v => v.id === g).outlet === j, [gen, jar])
  const t2 = await hook(page, T => T.chem.fixtures().find(f => f.kind === 'tube'))
  expect(t2.b.vessel === jar && t2.b.at === 'under', 'the free end came to rest under the jar\'s mouth', t2.b)
  const log = await hook(page, T => T.chem.log().map(e => e.act))
  expect(log.includes('collector') && log.includes('stopper') && log.includes('connect'), 'the record has the collection over water, the stopper and the tube', log)
  // time at ×60 until the jar holds gas
  await page.click('[data-ui=chem-time-menu]')
  await page.click('[data-ui=chem-time] [data-speed="60"]')
  await page.click('[data-ui=chem-play]')
  await until(page, (T, id) => T.chem.state().vessels.find(v => v.id === id).gas_mL > 20, jar, 60000)
  await page.click('[data-ui=chem-play]')
  const held = await hook(page, (T, id) => ({ mL: T.chem.read(id).gas_mL, gas: T.chem.read(id).gas.map(g => g.id) }), jar)
  expect(held.gas.includes('H2(g)'), 'hydrogen is collected in the jar', held)
  notes.push(`jar dragged into the trough (over water), tube from the stoppered generator dragged under its mouth: ${held.mL.toFixed(1)} mL collected (${held.gas.join(', ')})`)
})

// 26.64 (D271): the encyclopedia of elements and substances. Its hook is `__velophiTest.ency` (route, data(), results())
//   · ency-browse: bench → 更多 → 元素与物质 → the periodic table (118 cells) → Cu → a compound → its structure is
//     drawn in the 3D viewer; the address names the page; search finds a substance by formula; "放到实验台" of a
//     substance page opens the amount dialog of the bench; no console errors on the way.
await flow('ency-browse', async (page, notes) => {
  const errors = []
  const foreign = t => /whitelists\.top|Failed to load resource/.test(t)
  page.on('console', m => { if (m.type() === 'error' && !foreign(m.text())) errors.push(m.text()) })
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  await openBench(page)
  await page.click('[data-ui=chem-page] [data-ui=stage-more]')
  await page.click('[data-ui=chem-ency]')
  await page.waitForSelector('[data-ui=ency-table] .cell')
  const cells = await page.$$eval('[data-ui=ency-table] .cell', els => els.length)
  expect(cells === 118, 'the periodic table has 118 cells', cells)
  // colouring by a property: cells without a value stay uncoloured and are counted in the legend
  await page.selectOption('[data-ui=ency-colour]', 'electronegativity')
  const scale = await page.$$eval('[data-ui=ency-table] .cell', els => ({ plain: els.filter(e => e.classList.contains('plain')).length, valued: els.filter(e => e.querySelector('.val')).length }))
  const none = await hook(page, T => T.ency.data().elements.elements.filter(e => e.electronegativity === null).length)
  expect(scale.plain === none && scale.valued === 118 - none, 'cells without an electronegativity are uncoloured', { ...scale, none })
  await page.selectOption('[data-ui=ency-colour]', 'category')
  await page.click('[data-ui=ency-table] .cell[data-symbol=Cu]')
  await page.waitForSelector('[data-ui=ency-element][data-symbol=Cu]')
  expect((await page.locator('[data-ui=ency-title]').innerText()).trim() === '铜', 'the element page is copper')
  expect(await page.evaluate(() => location.hash) === '#e=Cu', 'the address names the element', await page.evaluate(() => location.hash))
  const mass = (await page.locator('[data-ui=ency-element] [data-prop=mass] dd .num').innerText()).trim()
  const data = await hook(page, T => T.ency.data().bySymbol.get('Cu').mass)
  expect(Number(mass.replace(',', '.')) === data, 'the atomic mass shown is the one of the data file', { mass, data })
  await page.waitForSelector('[data-ui=ency-element] [data-ui=mol3d][data-kind=orbital][data-phase=ready]')
  // the crystal of the element: fcc, generated by the core
  await page.click('[data-ui=ency-3d-crystal]')
  await page.waitForSelector('[data-ui=ency-element] [data-ui=mol3d][data-kind=crystal][data-phase=ready]')
  // a compound of copper with a structure
  await page.locator('[data-ui=ency-compounds] [data-substance="tetraamminecopper-ii"]').click()
  await page.waitForSelector('[data-ui=ency-substance][data-substance="tetraamminecopper-ii"]')
  await page.waitForSelector('[data-ui=ency-substance] [data-ui=mol3d][data-kind=molecule][data-phase=ready]')
  await page.waitForTimeout(600)
  const stage = page.locator('[data-ui=ency-substance] [data-ui=mol3d-stage]')
  const box = await stage.boundingBox()
  const shot = await stage.screenshot()
  expect(box.width > 200 && box.height > 200 && shot.length > 8000, 'the structure is drawn in the 3D viewer', { box, bytes: shot.length })
  const method = await page.locator('[data-ui=ency-method]').getAttribute('data-method')
  expect(!!method && (await page.locator('[data-ui=ency-method]').innerText()).trim().length > 10, 'the page says how the geometry was obtained', method)
  expect(await page.evaluate(() => location.hash) === '#m=tetraamminecopper-ii', 'the address names the substance')
  // back leads to copper again
  await page.click('[data-ui=ency-back]')
  await page.waitForSelector('[data-ui=ency-element][data-symbol=Cu]')
  // search by formula, then put the substance on the bench
  await page.fill('[data-ui=ency-search]', 'CuSO4')
  await page.waitForSelector('[data-ui=ency-results] li[data-kind=substance]')
  await page.locator('[data-ui=ency-results] li[data-id="Chalcanthite"]').dispatchEvent('mousedown')
  await page.waitForSelector('[data-ui=ency-substance][data-substance="Chalcanthite"]')
  await page.waitForSelector('[data-ui=ency-solubility]')
  await page.waitForSelector('[data-ui=ency-solution-colour]')
  const reactions = await page.$$eval('[data-ui=ency-reactions] li', els => els.length)
  expect(reactions > 0, 'the substance page lists reactions', reactions)
  await page.click('[data-ui=ency-bench] [data-reagent="CuSO4_0.1M"]')
  await page.waitForSelector('[data-ui=chem-amount]')
  const after = await hook(page, T => ({ open: T.ency.route.open, vessels: T.chem.state().vessels.length, page: T.state.page }))
  expect(!after.open && after.vessels === 1 && after.page === 'chem', 'the bench took over: a beaker and the amount dialog', after)
  await page.keyboard.press('Escape')
  expect(errors.length === 0, 'no console errors', errors.slice(0, 3))
  notes.push(`118 cells, ${none} without electronegativity; Cu ${mass}; [Cu(NH3)4]2+ drawn (${method}, ${shot.length} bytes); CuSO4·5H2O: ${reactions} reactions listed`)
})

// 26.64 (D270): a guided experiment. The hook adds `__velophiTest.chem.guide()` ({ id, index, steps, finished, mistakes }).
//   · chem-guided: empty bench → 引导实验 → the gallery lists forty (one not offered, with its reason) → "6 % 氯化钠
//     溶液" lays out a beaker and a cylinder → a wrong amount (6 g) does not complete step 1 and the mistake is named →
//     undo, 3.0 g completes it (the check shows the core's number) → "做给我看" performs the other steps through the
//     log → all done, and the bench goes on being a bench.
await flow('chem-guided', async (page, notes) => {
  const errors = []
  // the application asks its AI service for its settings on start: not this page's business (as in ency-browse)
  const foreign = t => /whitelists\.top|Failed to load resource/.test(t)
  page.on('console', m => { if (m.type() === 'error' && !foreign(m.text())) errors.push(m.text()) })
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  await openBench(page)
  await page.click('[data-ui=chem-guide-empty]')
  await page.waitForSelector('[data-ui=chem-guide-gallery]')
  const rows = await page.$$eval('[data-ui=chem-guide-gallery] [data-experiment]', els => els.map(e => ({ id: e.dataset.experiment, off: e.disabled })))
  expect(rows.length === 40, 'the gallery lists the forty experiments of D270', rows.length)
  expect(rows.filter(r => r.off).map(r => r.id).join() === 'c8_models', 'the one that is not offered cannot be started', rows.filter(r => r.off))
  await page.click('[data-ui=chem-guide-gallery] [data-experiment=j6_nacl_solution]')
  await until(page, T => T.chem.guide().id === 'j6_nacl_solution')
  await page.waitForSelector('[data-ui=chem-guide] [data-step="1"][data-state=now]')
  const start = await hook(page, T => ({ vessels: T.chem.state().vessels.map(v => v.kind), log: T.chem.log().length, guide: T.chem.guide() }))
  expect(start.vessels.join() === 'beaker,measuringCylinder' && start.log === 0 && start.guide.index === 0 && start.guide.steps === 3, 'the apparatus is laid out and nothing is done', start)
  const beaker = await hook(page, T => T.chem.byLabel('A'))
  const weigh = async g => {
    await hook(page, (T, id) => { T.chem.bench.select(id); return true }, beaker)
    await page.click('[data-ui=chem-guide] [data-reagent="NaCl_solid"]')
    await page.waitForSelector('[data-ui=chem-amount]')
    await page.selectOption('[data-ui=chem-amount-unit]', 'g')
    await page.fill('[data-ui=chem-amount-value]', g)
    await page.keyboard.press('Enter')
    await page.waitForSelector('[data-ui=chem-amount]', { state: 'detached' })
  }
  // a wrong amount: the step stays open and the runner says which step and why
  await weigh('6')
  await page.waitForSelector('[data-ui=chem-guide-mistake]')
  const wrong = await hook(page, T => T.chem.guide())
  expect(wrong.index === 0 && wrong.mistakes === 1, 'six grams do not complete step 1, and the mistake is named', wrong)
  const shownWrong = await page.locator('[data-ui=chem-guide-check] li').first().innerText()
  expect(/\n6(?:[.,]0+)?\s*g\n/.test(shownWrong),'the check shows the mass the core reports', shownWrong)
  await page.click('[data-ui=chem-undo]')
  await weigh('3')
  await until(page, T => T.chem.guide().index === 1)
  await page.waitForSelector('[data-ui=chem-guide] [data-step="1"][data-state=done]')
  // "show me" performs the next steps through the log
  const before = await hook(page, T => T.chem.log().length)
  await page.click('[data-ui=chem-guide-show]')
  await until(page, T => T.chem.guide().index === 2)
  await page.click('[data-ui=chem-guide-show]')
  await until(page, T => T.chem.guide().finished)
  await page.waitForSelector('[data-ui=chem-guide-done]')
  const end = await hook(page, (T, id) => ({ log: T.chem.log().length, mass: T.chem.read(id).mass_g, na: T.chem.read(id).species.find(s => s.id === 'Na+').n, solids: T.chem.read(id).solids.length }), beaker)
  expect(end.log === before + 2 && Math.abs(end.mass - 50) < 0.5 && end.solids === 0, 'the solution was made by actions of the log: 50 g, all dissolved', end)
  // free exploration goes on: one more action, the finished guide stays finished
  await weigh('1')
  const after = await hook(page, (T, id) => ({ guide: T.chem.guide(), mass: T.chem.read(id).mass_g }), beaker)
  expect(after.guide.finished && after.mass > end.mass + 0.9, 'the bench is a bench again after the last step', after)
  await page.click('[data-ui=chem-guide-leave]')
  const left = await hook(page, T => ({ id: T.chem.guide().id, vessels: T.chem.state().vessels.length }))
  expect(left.id === null && left.vessels === 2, 'ending the guide leaves the bench as it is', left)
  expect(errors.length === 0, 'no console errors', errors.slice(0, 3))
  notes.push(`40 listed, 1 not offered; j6: 6 g refused by the check ("${shownWrong.replace(/\s+/g, ' ').trim()}"), 3 g accepted, show-me ×2 → ${end.mass.toFixed(2)} g with ${end.na.toFixed(4)} mol Na⁺`)
})

// 15 · Copilot builds a scene from a sketch (26.64, D279–D282): the mocked AI's sketch has an error (the rope does not
// reach the hanging block); the app's diagnostic goes back, the patch is applied, the scene is loaded — computed by the app
await flow('copilot-sketch', async (page, notes) => {
  const replies = [], seen = []
  await page.route('**/mock-ai/**', async route => {
    seen.push(JSON.parse(route.request().postData() ?? '{}'))
    const r = replies.shift()
    if (!r) { await route.fulfill({ status: 500, body: 'no reply' }); return }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { role: 'assistant', content: r }, finish_reason: 'stop' }], usage: { total_tokens: 10 } }) }).catch(() => {})
  })
  await hook(page, (T, u) => T.useMockAi(u), `${URL0}mock-ai/v1`)
  expect(await hook(page, T => T.settings.ai.sceneBuilder) === 'sketch', 'the sketch builder is the default')
  const problem = '水平桌面上质量 2 kg 的物块 A（与桌面 μ = 0.2）用轻绳跨过桌边的光滑定滑轮与质量 1 kg 的物块 B 相连，B 离地 0.6 m，由静止释放，求 A 的加速度和绳的拉力。'
  const body = (id, name, place, ref, at, ref2) => ({ id, name, type: 'block', place, ref, at, ref2, moves: 'rest', side: '', points: [] })
  const ask = (prompt, unit, id) => ({ prompt, unit, kind: 'quantity', id, t: 0.2, event: '', side: '', body: '', which: '' })
  const sketch = {
    version: 2, route: 'sketch', title: '桌面—滑轮连接体', reason: '', templateId: '', templateParams: [], gravity: 'down', movingBodies: 2,
    surfaces: [{ id: 'floor', name: '地面', type: 'ground', side: '', span: '', at: '' }, { id: 'table', name: '桌面', type: 'table', side: '', span: '', at: '' }],
    bodies: [body('A', '物块A', 'on', 'table', 'middle', ''), body('B', '物块B', 'hanging', 'rope1', 'below', 'floor')],
    pulleys: [{ id: 'P', name: '定滑轮', at: 'table.rightEnd' }],
    // the error: the rope comes back to A
    connectors: [{ id: 'rope1', name: '轻绳', type: 'rope', path: ['A.right', 'P', 'A.top'], mode: 'taut' }],
    values: [{ of: 'A', quantity: 'mass', value: 2, unit: 'kg', quote: '质量 2 kg 的物块 A' }, { of: 'A|table', quantity: 'mu', value: 0.2, unit: '', quote: 'μ = 0.2' }, { of: 'B', quantity: 'mass', value: 1, unit: 'kg', quote: '质量 1 kg 的物块 B' }, { of: 'B', quantity: 'heightAbove', value: 0.6, unit: 'm', quote: 'B 离地 0.6 m' }],
    expect: [{ of: 'A', state: 'moves' }, { of: 'rope1', state: 'taut' }],
    questions: [ask('A 的加速度', 'm/s²', 'A.a'), ask('绳的拉力', 'N', 'rope1.T')]
  }
  replies.push(
    '**答案** a = 1.96 m/s²，T = 7.84 N',
    '对象：桌面、物块 A、B、定滑轮 P、轻绳。A 在桌面上，B 挂在绳上离地 0.6 m。',
    JSON.stringify(sketch),
    JSON.stringify({ patch: [{ op: 'set', path: 'connectors[0].path', value: ['A.right', 'P', 'B.top'] }] })
  )
  await page.click('[data-ui=copilot]')
  await page.fill('[data-ui=copilot-input]', problem)
  await page.click('[data-ui=copilot-send]')
  await page.waitForSelector('[data-ui=copilot-build]')
  await page.click('[data-ui=copilot-build]')
  await until(page, T => !T.copilot.busy && T.state.scene.bodies.some(b => b.id === 'B'), null, 30000)
  expect(seen.length === 4 && replies.length === 0, 'four requests: answer, notes, sketch, patch', seen.length)
  // the repair request carried the diagnostic and the fragment it is about, not the conversation
  const repair = String(seen[3].messages.at(-1).content)
  expect(seen[3].messages.length === 2 && repair.includes('"code":"L2.floating"') && repair.includes('"path":"bodies[1]"') && repair.includes('"connectors[0]"'), 'the diagnostic went back with its fragment', repair.slice(0, 200))
  expect(seen[2].response_format?.type === 'json_object' && !seen[2].tools, 'without strict calls the sketch is asked for in JSON mode')
  const s = await hook(page, T => {
    const sc = T.state.scene, B = sc.bodies.find(b => b.id === 'B'), A = sc.bodies.find(b => b.id === 'A'), P = sc.pulleys[0], rope = sc.connectors[0]
    return { B: B.position, A: A.position, P, rope: { a: rope.a.body, b: rope.b.body, wrap: rope.pulleys[0]?.wrap }, problem: T.state.problem?.problem.questions.length ?? 0, route: sc.extra?.ai?.route, page: T.state.page }
  })
  expect(s.rope.a === 'A' && s.rope.b === 'B' && s.rope.wrap === 'cw', 'the patched rope joins A and B over the pulley', s.rope)
  // coordinates the model never wrote: B plumb under the wheel's rim, its bottom 0.6 m above the floor; the wheel's top level with A
  expect(Math.abs(s.B.x - (s.P.position.x + s.P.radius)) < 1e-9 && Math.abs(s.B.y - 0.7) < 1e-9 && Math.abs(s.P.position.y + s.P.radius - s.A.y) < 1e-9, 'the app computed the places', s)
  expect(s.problem === 2 && s.route === 'copilot-sketch', 'loaded as a problem with both questions', s)
  await until(page, T => !T.state.stale && T.run().frames > 100)
  const [a, T1] = await hook(page, T => T.valuesAt(0.2, ['A.a', 'rope1.T']))
  expect(Math.abs(a - 1.96) < 1e-6 && Math.abs(T1 - 7.84) < 1e-6, 'the engine gives a = 1.96 m/s², T = 7.84 N', { a, T1 })
  const card = await page.locator('.scene-card .sc-head').last().innerText()
  expect(/桌面—滑轮连接体/.test(card), 'the scene card names the scene', card)
  notes.push(`sketch with a rope that missed B → L2.floating → patch → loaded; a = ${a.toFixed(4)} m/s², T = ${T1.toFixed(4)} N; ${seen.length} requests`)
})

// ---- 26.64 (D276–D278): the nuclide pages and the reactor workshop (物理实验 › 原子与核) ----
const setRange = (page, sel, value) => page.locator(sel).evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })) }, value)
const viaSearch = async (page, text) => {
  await page.keyboard.press('Control+k')
  await page.locator('.palette .q').fill(text)
  await page.locator('.palette .row.on').waitFor()
  await page.keyboard.press('Enter')
}

// nuclide-chart: the chart from the global search; search, click, pan and zoom; the page shows the record of the
// core; the decay chain of U-238 with the core's amounts and its diagnostics; the address; the citations
await flow('nuclide-chart', async (page, notes) => {
  await viaSearch(page, '核素图')
  await until(page, T => T.state.page === 'lab' && T.nuclides && T.nuclides.table() && T.nuclides.page(), null, 30000)
  expect((await hook(page, T => T.nuclides.table().ground.length)) === 3558, 'the chart holds the 3558 ground states')
  await page.fill('[data-ui=nuclide-search]', '铀235')
  await page.waitForSelector('[data-ui=nuclide-hits] [data-nuclide="U-235"]')
  await page.keyboard.press('Enter')
  await until(page, T => T.nuclides.page().id === 'U-235')
  const u235 = await hook(page, T => ({ life: T.nuclides.page().life, halfLife: T.nuclides.table().byId.get('U-235').halfLife, be: T.nuclides.page().rows.find(r => r.key === 'bindingPerNucleon').value }))
  expect(u235.halfLife === 22216080000000000, 'the half-life of U-235 is the value of the table (s)', u235.halfLife)
  expect((await page.locator('[data-ui=nuclide-life]').innerText()).trim() === u235.life, 'the page shows the half-life the view-model formatted', u235.life)
  expect((await page.locator('[data-ui=nuclide-page] [data-row=bindingPerNucleon]').innerText()).includes(u235.be), 'the page shows the binding energy per nucleon of the core', u235.be)
  // a click on the cell of U-238 (N = 146, Z = 92) chooses it
  const canvas = page.locator('[data-ui=nuclide-chart] canvas')
  const box = await canvas.boundingBox()
  const at = async (N, Z) => { const v = await hook(page, T => T.nuclides.view()); return [box.x + v.ox + (N + 0.5) * v.scale, box.y + v.oy - (Z + 0.5) * v.scale] }
  const [x, y] = await at(146, 92)
  await page.mouse.click(x, y)
  await until(page, T => T.nuclides.page().id === 'U-238')
  expect((await page.evaluate(() => location.hash)) === '#n=U-238', 'the address names the nuclide shown', await page.evaluate(() => location.hash))
  // pan and zoom: the view follows, a frame stays under 4 ms
  const before = await hook(page, T => T.nuclides.view())
  await hook(page, T => { T.nuclides.stats.reset(); return true })
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (let i = 1; i <= 60; i++) { await page.mouse.move(cx + 3 * i, cy + 2 * i); await page.waitForTimeout(16) }
  await page.mouse.up()
  const panned = await hook(page, T => T.nuclides.view())
  expect(Math.abs(panned.ox - before.ox - 180) < 4 && Math.abs(panned.oy - before.oy - 120) < 4 && panned.scale === before.scale, 'dragging pans the chart by the distance dragged', { before, panned })
  await page.mouse.wheel(0, -400)
  await page.waitForTimeout(200)
  const zoomed = await hook(page, T => T.nuclides.view())
  expect(zoomed.scale > panned.scale, 'the wheel zooms in', zoomed.scale)
  const stats = await hook(page, T => T.nuclides.stats.summary())
  expect(stats.frames >= 20 && stats.p95 < 4, 'a frame of the chart costs less than 4 ms while panning (95th percentile)', stats)
  expect((await hook(page, T => T.nuclides.page().id)) === 'U-238', 'a drag does not change the chosen nuclide')
  // the daughter is a link
  await page.locator('[data-ui=nuclide-branches] .nlink').first().click()
  await until(page, T => T.nuclides.page().id === 'Th-234')
  // colour by half-life: the legend changes
  await page.selectOption('[data-ui=nuclide-scheme]', 'halfLife')
  await page.waitForFunction(() => document.querySelector('[data-ui=nuclide-legend]')?.textContent.includes('1 ms'))
  // the decay chain of U-238
  await hook(page, T => { T.nuclides.select('U-238'); return true })
  await until(page, T => T.nuclides.page().id === 'U-238')
  await page.click('[data-ui=nuclide-open-chain]')
  await until(page, T => T.nuclides.S.view === 'chain' && T.nuclides.decay() && T.nuclides.chain().nuclides[0].id === 'U-238')
  const core = await hook(page, T => { const d = T.nuclides.decay(), n = d.t.length; return { members: d.nuclides.length, rows: T.nuclides.rows().map(r => [r.id, r.N, r.A]), last: d.N[n - 1], total: d.total, analytic: d.analytic, fallback: d.fallback, codes: d.diagnostics.map(x => x.code) } })
  expect(core.members === 21 && (await page.locator('[data-ui=chain-table] tbody tr').count()) === 21, 'the table lists the 21 members of the chain', core.members)
  expect((await page.locator('[data-ui=chain-diagram] .node').count()) === 21, 'the diagram draws 21 nuclides')
  const row = (await page.locator('[data-ui=chain-table] tr[data-nuclide="U-238"]').innerText()).replace(/\s+/g, ' ')
  expect(row.includes(core.rows[0][1].replace(/\s+/g, ' ')) && row.includes(core.rows[0][2].replace(/\s+/g, ' ')), 'the row of U-238 shows the amount and activity of the core', { row, core: core.rows[0] })
  expect(Math.abs(core.last * 32 / core.total - 1) < 1e-9, 'after five half-lives 1/32 of the parent is left (the core\'s number)', core.last / core.total)
  expect(core.codes.includes('nuclide.isomerFeeding') && (await page.locator('[data-ui=chain-diagnostics] [data-code="nuclide.isomerFeeding"]').count()) >= 1, 'the isomer-feeding diagnostic of the core is shown', core.codes)
  expect((await page.evaluate(() => location.hash)) === '#n=U-238;chain', 'the address names the chain', await page.evaluate(() => location.hash))
  // moving the cursor reads another sample of the same result
  await setRange(page, '[data-ui=chain-cursor]', 0)
  const first = await until(page, (T, late) => { const n = T.nuclides.rows()[0].N; return n !== late ? n : null }, core.rows[0][1])
  expect((await page.locator('[data-ui=chain-table] tr[data-nuclide="U-238"]').innerText()).replace(/\s+/g, ' ').includes(first.replace(/\s+/g, ' ')), 'the cursor at the first sample reads the initial amount', first)
  // the citations the licence asks for
  await page.locator('[data-ui=nuclide-sources] summary').click()
  const src = await page.locator('[data-ui=nuclide-sources]').innerText()
  expect(/NUBASE2020/.test(src) && /AME 2020/.test(src) && src.includes('10.1088/1674-1137/abddae') && src.includes('10.1088/1674-1137/abddaf') && /CC BY 3\.0/.test(src), 'NUBASE2020 and AME2020 are cited with DOI and licence')
  const bar = await page.$$eval('[data-ui=nuclides-lab] .lab-bar > *', els => els.length)
  expect(bar <= 7, 'the bar holds at most seven controls (D243)', bar)
  notes.push(`chart frames while panning: ${stats.frames}, mean ${stats.mean.toFixed(2)} ms, p95 ${stats.p95.toFixed(2)} ms, max ${stats.max.toFixed(2)} ms; U-238 chain: ${core.members} nuclides, ${core.analytic} analytic and ${core.fallback} matrix values`)
})

// reactor-workshop: from the global search; k_eff of the core on the page; rods, painting, a run at full power with
// a scram and its reset; the reactivity budget; a task the core checks; the notice of the teaching model
await flow('reactor-workshop', async (page, notes) => {
  await viaSearch(page, '反应堆工坊')
  await until(page, T => T.state.page === 'lab' && T.reactor && T.reactor.s.ready && T.reactor.s.crit, null, 30000)
  const shownK = async () => (await page.locator('[data-ui=reactor-keff] b').innerText()).trim()
  const coreK = () => hook(page, T => T.reactor.s.crit.keff.toFixed(5))
  const shut = await coreK()
  expect((await shownK()) === shut && Number(shut) < 0.999, 'the page shows k_eff of the core; the preset is shut down', shut)
  expect((await page.locator('[data-ui=reactor-teaching]').innerText()).includes('不能用于设计或安全分析'), 'the page says it is a teaching model, not for design or safety analysis')
  // all rods out: supercritical, by a new solution of the core
  await setRange(page, '[data-ui=reactor-rods-all]', 0)
  await until(page, T => T.reactor.s.crit.keff > 1.002)
  expect((await shownK()) === (await coreK()), 'k_eff on the page follows the rods', await shownK())
  await setRange(page, '[data-ui=reactor-rods-all]', 1)
  await until(page, (T, k) => T.reactor.s.crit.keff.toFixed(5) === k, shut)
  // paint one fuel cell with graphite: k falls, the layout is a custom one; the flux map is the core's
  const map = await page.locator('[data-ui=reactor-map] canvas').boundingBox()
  const cellAt = (cx, cy, n) => { const cell = Math.max(1, Math.floor(Math.min((map.width - 8) / n, (map.height - 8) / n))); return [map.x + Math.round((map.width - cell * n) / 2) + (cx + 0.5) * cell, map.y + Math.round((map.height - cell * n) / 2) + (cy + 0.5) * cell] }
  const fuel = await hook(page, T => { const d = T.reactor.s.doc, i = d.cells.findIndex((c, k) => c === 'fuel_leu' && k % 36 > 15 && Math.floor(k / 36) > 15); return [i % 36, Math.floor(i / 36)] })
  await page.click('[data-ui=reactor-palette] [data-tool=graphite]')
  await page.mouse.click(...cellAt(fuel[0], fuel[1], 36))
  await until(page, (T, c) => T.reactor.s.doc.cells[c[1] * 36 + c[0]] === 'graphite' && T.reactor.s.presetId === 'custom', fuel)
  expect(Number(await coreK()) < Number(shut), 'replacing fuel by graphite lowers k_eff', await coreK())
  await page.selectOption('[data-ui=reactor-map-mode]', 'flux2')
  expect((await hook(page, T => T.reactor.s.crit.flux2.length === T.reactor.s.crit.nx * T.reactor.s.crit.ny)), 'the thermal flux map has one value per cell of the solution')
  await page.selectOption('[data-ui=reactor-map-mode]', 'material')
  await page.click('[data-ui=reactor-palette] [data-tool=select]')
  await page.selectOption('[data-ui=reactor-preset]', 'research')
  await until(page, (T, k) => T.reactor.s.presetId === 'research' && T.reactor.s.crit.keff.toFixed(5) === k, shut)
  // run at full power, then a scram
  await page.click('[data-ui=reactor-start-power]')
  await until(page, T => T.reactor.s.run && Math.abs(T.reactor.s.run.n - 1) < 1e-6)
  await page.selectOption('[data-ui=reactor-speed]', '10')
  await page.click('[data-ui=reactor-play]')
  await until(page, T => T.reactor.s.history.t.length >= 24 && T.reactor.s.running)
  const steady = await hook(page, T => ({ n: T.reactor.s.run.n, t: T.reactor.s.run.t, fuelT: T.reactor.s.run.fuelT }))
  expect(Math.abs(steady.n - 1) < 0.01 && steady.t > 5, 'at full power the reactor stays at n = 1', steady)
  const controls = await page.$$eval('[data-ui=reactor-lab] .lab-bar > :is(button, label)', els => els.length)
  expect(controls <= 7, 'the bar holds at most seven controls while running (D243)', controls)
  await page.click('[data-ui=reactor-scram]')
  await until(page, T => T.reactor.s.run.trip && T.reactor.s.run.trip.reason === 'manual' && T.reactor.s.run.n < 0.3)
  expect((await page.locator('[data-ui=reactor-status]').innerText()).includes('保护停堆'), 'the status names the trip')
  // the rods fall in a fraction of a second: wait for them instead of reading the instant of the trip
  await until(page, T => T.reactor.s.run.rods.every(r => r > 0.99))
  expect((await hook(page, T => T.reactor.s.run.rods.every(r => r > 0.99))), 'the rods are in after the scram')
  await page.click('[data-ui=reactor-play]')
  await until(page, T => !T.reactor.s.running)
  await page.click('[data-ui=reactor-reset-trip]')
  await until(page, T => !T.reactor.s.run.trip && !T.reactor.s.run.scram)
  // the reactivity budget: seven entries that add up to the reactivity (each a solution of the core)
  await page.click('[data-ui=reactor-lab] [data-tab=balance]')
  await page.click('[data-ui=reactor-balance-run]')
  await until(page, T => T.reactor.s.balance)
  const budget = await hook(page, T => ({ ids: T.reactor.s.balance.entries.map(e => e.id), gap: Math.abs(T.reactor.s.balance.entries.reduce((a, e) => a + e.rho, 0) - T.reactor.s.balance.rho) }))
  expect(budget.ids.length === 7 && budget.gap < 1e-12 && (await page.locator('[data-ui=reactor-balance] tbody tr').count()) === 7, 'the budget lists seven entries that add up to the reactivity', budget)
  // a task: one change that makes the heavy-water layout critical — the verdict is the core's
  await page.click('[data-ui=reactor-lab] [data-tab=tasks]')
  await page.click('[data-ui=task-start-minimalChange]')
  await until(page, T => T.reactor.s.task.id === 'minimalChange' && !T.reactor.s.run && T.reactor.s.crit && T.reactor.s.crit.keff < 1)
  await page.click('[data-ui=task-check]')
  await until(page, T => T.reactor.s.task.result)
  expect((await hook(page, T => T.reactor.s.task.result.passed)) === false && (await page.locator('[data-ui=task-verdict]').innerText()).includes('还没有完成'), 'the task is not passed before anything was changed')
  const rod = await hook(page, T => Object.keys(T.reactor.s.doc.rods)[0].split(',').map(Number))
  await hook(page, (T, c) => { T.reactor.select(c[0], c[1]); return true }, rod)
  await page.click('[data-ui=reactor-lab] [data-tab=core]')
  await setRange(page, '[data-ui=reactor-rod-one]', 0)
  await until(page, T => T.reactor.s.crit.keff >= 1)
  await page.click('[data-ui=reactor-lab] [data-tab=tasks]')
  await page.click('[data-ui=task-check]')
  await until(page, T => T.reactor.s.task.result && T.reactor.s.task.result.passed)
  expect((await page.locator('[data-ui=task-verdict]').innerText()).includes('通过') && (await page.locator('[data-ui=task-checks] li.ok').count()) === 3, 'withdrawing one rod passes the task: three conditions met')
  // what the model leaves out
  await page.click('[data-ui=reactor-about]')
  const about = await page.locator('[data-ui=reactor-about-text]').innerText()
  expect(about.includes('不能用于设计或安全分析') && about.includes('0.9 β') && about.includes('5 %'), 'the page lists the limits of the model (D278)')
  notes.push(`k_eff ${shut} shut down; at full power n = ${steady.n.toFixed(5)} at t = ${steady.t.toFixed(0)} s, fuel ${steady.fuelT.toFixed(0)} K; budget ${budget.ids.join(', ')}; ${controls} controls on the bar while running`)
})

// 9 · the walkthrough (26.64, D248–D251): a device with no data is offered it on the home page (nothing opens by
// itself); the five segments are walked with real clicks — every step ends because the deed was done, not by a
// button; closed half-way, it is taken up at the same step after a reload, and the user's scene is back in between;
// a step and a segment can be skipped; a device that ran 26.63 is offered only the list of changes; reduced motion.
await flow('onboarding', async (page, notes) => {
  const KEY = 'velophi.onboarding.v1'
  const walkOf = p => p.evaluate(() => { const w = document.querySelector('[data-ui=walk]'); return w ? { id: w.dataset.walk, step: w.dataset.step, phase: w.dataset.phase, index: Number(w.dataset.index) } : null })
  /** Wait until the walk is at a step (or, with `step` 'done', at the end of a segment). */
  const at = async (id, step, p = page) => {
    const t0 = Date.now()
    for (;;) {
      const w = await walkOf(p)
      if (w && w.id === id && (step === 'done' ? w.phase === 'done' : w.step === step && w.phase === 'step')) return w
      if (Date.now() - t0 > 25000) throw new Error(`the walk did not reach ${id}.${step} (it is at ${JSON.stringify(w)})`)
      await p.waitForTimeout(80)
    }
  }
  const record = (p = page) => p.evaluate(k => JSON.parse(localStorage.getItem(k) ?? 'null'), KEY)
  /** The ring is drawn around the element (it follows it within a few frames). */
  const ringed = async (sel, p = page) => {
    const t0 = Date.now()
    for (;;) {
      const ok = await p.evaluate(s => {
        const ring = document.querySelector('[data-ui=walk-ring]'), el = [...document.querySelectorAll(s)].find(e => !e.closest('[inert]') && e.getBoundingClientRect().width > 0)
        if (!ring || !el) return false
        const a = ring.getBoundingClientRect(), b = el.getBoundingClientRect()
        return Math.abs(a.left - b.left) < 12 && Math.abs(a.top - b.top) < 12 && Math.abs(a.right - b.right) < 12 && Math.abs(a.bottom - b.bottom) < 12
      }, sel)
      if (ok) return true
      if (Date.now() - t0 > 8000) throw new Error(`the ring is not on ${sel}`)
      await p.waitForTimeout(80)
    }
  }
  const fresh = async (p = page) => { await p.goto(`${URL0}?uitest=1&onboard=1`); await until(p, T => T && T.run().frames > 1, null, 30000) }

  // under the automatic tests (and likewise from a share link or in projection) nothing is offered
  await page.keyboard.press('Alt+0')
  await page.waitForSelector('[data-ui=home-tour]')
  expect(await page.locator('[data-ui=home-offer], [data-ui=help-dot], [data-ui=walk]').count() === 0, 'nothing of the onboarding shows under ?uitest=1')

  // ---- a first run ----
  await fresh()
  await page.waitForTimeout(1200)
  expect(await page.locator('[data-ui=walk], .dialog').count() === 0, 'nothing opens by itself on a first run')
  await page.keyboard.press('Alt+0')
  await page.waitForSelector('[data-ui=home-start]')
  expect(await page.locator('[data-ui=help-dot]').count() === 1, 'the Help button carries a dot while the walkthrough is on offer')
  const home = await page.evaluate(() => { const h = document.querySelector('.home'); return { over: h.scrollHeight - h.clientHeight, primary: h.querySelectorAll('.btn.primary').length } })
  expect(home.over <= 0 && home.primary === 1, 'the home page still does not scroll, and the offer is its one primary button', home)
  const mine = await hook(page, T => T.sceneText())

  // segment 0: the choices
  await page.click('[data-ui=home-start]')
  await at('welcome', 'language')
  expect(await page.locator('[data-ui=walk-ring]').count() === 0, 'a choice is not ringed')
  await page.click('[data-ui=walk-lang-zh]')
  await page.click('[data-ui=walk-next]')
  await at('welcome', 'appearance')
  await page.click('[data-ui=walk-theme-light]')
  await page.click('[data-ui=walk-tier-tinted]')
  await page.click('[data-ui=walk-next]')
  await at('welcome', 'size')
  await page.click('[data-ui=walk-next]')
  await at('welcome', 'role')
  await page.click('[data-ui=walk-role-learn]')
  await at('welcome', 'done')
  expect((await record()).segments.welcome.done === true && (await hook(page, T => T.settings.ui.role)) === 'learn', 'the set-up is recorded as done, with the role')

  // segment 1: motion, on a temporary document
  await page.click('[data-ui=walk-continue]')
  await at('motion', 'template')
  expect((await hook(page, T => T.sceneText())) !== mine, 'the walk happens on a temporary document')
  // the step is on another page: the ring is on the rail, and the walk waits there
  await ringed('[data-ui=page-studio]')
  expect(await hook(page, T => T.state.page) === 'home', 'the walk does not switch pages by itself')
  await page.click('[data-ui=page-studio]')
  await ringed('[data-ui=templates]')
  expect(await page.locator('[data-ui=walk-next]').count() === 0, 'a deed has no "next" button')
  await page.click('[data-ui=templates]')
  await ringed('.titem[data-template=incline]')
  await page.click('.titem[data-template=incline]')
  await page.click('text=创建场景')
  await at('motion', 'play')
  await until(page, T => !T.state.stale && T.run().frames > 10)
  await ringed('[data-ui=play]')
  await page.click('[data-ui=play]')
  await at('motion', 'event')
  const hasEvent = await until(page, T => (T.events() ? { n: T.events().length } : null))
  if (hasEvent.n) await page.click('[data-ui=next-event]')
  else { await page.click('[data-ui=play]'); await page.keyboard.press('ArrowRight') }
  await at('motion', 'angle')

  // "稍后继续" half-way: the user's scene is back, the step is kept
  await page.click('[data-ui=walk-close]')
  await page.waitForSelector('[data-ui=walk]', { state: 'detached' })
  expect((await hook(page, T => T.sceneText())) === mine, 'closing the walk gives the user\'s scene back')
  expect(JSON.stringify((await record()).segments.motion) === '{"step":3,"done":false}', 'the step reached is stored', (await record()).segments.motion)

  // another session: the home page offers nothing new, the checklist says where the walk stands, and it goes on there
  await fresh()
  const mine2 = await hook(page, T => T.sceneText())
  await page.keyboard.press('Alt+0')
  await page.waitForSelector('[data-ui=home-tour]')
  expect(await page.locator('[data-ui=home-offer]').count() === 0,'the offer does not come back once the walk was begun')
  expect((await page.locator('[data-ui=home-tour]').innerText()).includes('1/5'), 'the home page shows 1 of 5 segments done', await page.locator('[data-ui=home-tour]').innerText())
  await page.click('[data-ui=home-tour]')
  await page.waitForSelector('[data-ui=guide-list]')
  const row = await page.locator('[data-ui=guide-list] [data-segment=motion]').innerText()
  expect(/4\/5/.test(row), 'the checklist shows the motion segment at step 4 of 5', row)
  expect(await page.locator('[data-ui=guide-list] [data-done=true]').count() === 1, 'one segment is ticked')
  await page.click('[data-ui=guide-start-motion]')
  await at('motion', 'angle')
  expect(await hook(page, T => T.state.scene.extra?.template?.id) === 'incline', 'taken up at the same step, on the scene the earlier steps leave')
  await page.click('[data-ui=page-studio]')
  await ringed('[data-ui=template-params]')
  const theta = page.locator('[data-ui=template-params] .row').first().locator('input').first()
  await theta.fill('40')
  await theta.press('Enter')
  await at('motion', 'formula')
  await page.waitForSelector('.page-studio [data-fid]')
  await page.locator('.page-studio [data-fid]').first().click()
  await at('motion', 'done')
  expect(await hook(page, T => T.state.scene.extra?.template?.values?.theta) === 40, 'the angle of the template is 40°')
  await hook(page, T => { T.state.showModels = false; return true })
  await page.keyboard.press('Escape')

  // segment 2: physics — the circuit
  await page.click('[data-ui=walk-continue]')
  await at('physics', 'choose')
  await ringed('[data-ui=page-lab]')
  await page.click('[data-ui=page-lab]')
  await ringed('[data-ui=lab-page] [data-ui=stage-catalogue]')
  await page.click('[data-ui=lab-page] [data-ui=stage-catalogue]')
  await ringed('[data-ui=lab-pick-circuit]')
  await page.click('[data-ui=lab-pick-circuit]')
  await at('physics', 'switch')
  await until(page, T => T.circuit && T.circuit.S.preset === 'emf' && T.circuit.S.elements.some(e => e.kind === 'switch' && e.closed === false))
  await page.waitForTimeout(400)
  const clickEl = async kind => { const p = await hook(page, (T, k) => T.circuit.at(k), kind); await page.mouse.click(p.x, p.y) }
  await clickEl('switch')
  await page.waitForTimeout(150)
  await clickEl('switch')
  await at('physics', 'ammeter')
  await clickEl('ammeter')
  await at('physics', 'rheostat')
  await ringed('[data-tour=lab-canvas]')
  await page.waitForTimeout(300)
  await clickEl('rheostat')
  const slider = page.locator('[data-ui=lab-page] [data-selected-kind=rheostat] input[type=range]').first()
  await slider.focus()
  await page.keyboard.press('End')
  await at('physics', 'done')
  const circuit = await hook(page, T => ({ closed: T.circuit.S.elements.find(e => e.kind === 'switch').closed, pos: T.circuit.S.elements.find(e => e.kind === 'rheostat').pos }))
  expect(circuit.closed === true && circuit.pos === 1, 'the switch is closed and the rheostat at its other end', circuit)

  // segment 3: chemistry — a titration on the bench, then the guided experiments
  await page.click('[data-ui=walk-continue]')
  expect(await hook(page, T => T.settings.ui.lab) !== 'lens', 'the physics panel is back on the user\'s experiment')
  await at('chem', 'flask')
  await page.click('[data-ui=page-chem]')
  await until(page, T => T.chem && T.chem.bench.ready.value, null, 30000)
  await ringed('[data-ui=chem-apparatus]')
  await placeKind(page, 'container', 'erlenmeyer')
  await at('chem', 'acid')
  const flask = await until(page, T => T.chem.byLabel('A'))
  await addReagent(page, 'HCl_0.1M', '20.00')
  await at('chem', 'indicator')
  await addReagent(page, 'phenolphthalein', '2', 'drop')
  await at('chem', 'titrate')
  await placeKind(page, 'transfer', 'buretteBase')
  const burette = await until(page, T => T.chem.byLabel('B'))
  await addReagent(page, 'NaOH_0.1M', '50.00')
  // the burette is clamped over the flask (a drag on the bench; here through the same call the drop makes)
  await hook(page, (T, [b, f]) => { T.chem.bench.setExtras(b, { above: f }); T.chem.bench.select(b); return true }, [burette, flask])
  await page.click('[data-ui=chem-actions]')
  await page.click('[data-ui=chem-act-deliver]')
  await page.waitForSelector('[data-ui=chem-amount]')
  await page.fill('[data-ui=chem-amount-value]', '20.10')
  await page.keyboard.press('Enter')
  await at('chem', 'guided')
  const pH = await hook(page, (T, id) => T.chem.read(id).pH, flask)
  expect(pH > 8.2, 'past the end point: the pH of the core is above the indicator\'s range', pH)
  // 26.65 (D290): 引导实验 is in the bench's 更多 (⋯)
  await page.click('[data-ui=chem-page] [data-ui=stage-more]')
  await ringed('[data-ui=chem-guide-open]')
  await page.click('[data-ui=chem-guide-open]')
  await at('chem', 'done')
  await page.click('[data-ui=walk-continue]')
  expect(await page.locator('[data-ui=chem-guide-gallery]').count() === 0 && await hook(page, T => T.chem.bench.empty.value), 'the bench is the user\'s again (it was empty), the list of guided experiments closed')

  // segment 4: the library — a problem the engine checks, an element in 3-D, the monitor
  await at('library', 'problem')
  await until(page, T => T.state.page === 'library' && T.state.librarySection === 'problems')
  await page.locator('.embed-host .card').first().click()
  await until(page, T => T.state.page === 'studio' && !!T.state.problem && !T.state.stale && T.run().frames > 10)
  await page.locator('button:has-text("揭晓答案")').click()
  await at('library', 'element')
  await until(page, T => T.state.page === 'library' && T.state.librarySection === 'matter')
  await page.click('[data-ui=ency-table] .cell[data-symbol=Cu]')
  await page.waitForSelector('[data-ui=ency-element] [data-ui=mol3d][data-phase=ready]')
  await page.click('[data-ui=ency-3d-crystal]')
  await page.waitForSelector('[data-ui=ency-element] [data-ui=mol3d][data-kind=crystal][data-phase=ready]')
  const stage = await page.locator('[data-ui=ency-element] [data-ui=mol3d-stage]').boundingBox()
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2)
  await page.mouse.down()
  await page.mouse.move(stage.x + stage.width / 2 + 90, stage.y + stage.height / 2 + 30, { steps: 8 })
  await page.mouse.up()
  // no account and no key on this machine: the Copilot step is left out
  await at('library', 'monitor')
  await ringed('[data-ui=page-monitor]')
  await page.click('[data-ui=page-monitor]')
  await page.locator('.page.is-on [data-ui=play]').first().click()
  await at('library', 'done')
  await page.waitForSelector('[data-ui=walk-finish]')
  const rec = await record()
  expect(Object.values(rec.segments).every(s => s.done) && rec.seenVersion === '26.65', 'all five segments are recorded as done', rec)
  await page.click('[data-ui=walk-finish]')
  await page.waitForSelector('[data-ui=walk]', { state: 'detached' })
  expect(!(await hook(page, T => T.state.problem)) && (await hook(page, T => T.sceneText())) === mine2,'the user\'s scene is back after the last segment')
  await page.keyboard.press('Alt+0')
  expect((await page.locator('[data-ui=home-tour]').innerText()).includes('5/5'), 'the home page shows 5 of 5')

  // any segment again from Help › 入门; a step and a segment can be skipped
  await page.click('[data-ui=help]')
  await page.click('[data-ui=help-guide]')
  await page.click('[data-ui=guide-start-chem]')
  await at('chem', 'flask')
  await page.click('[data-ui=page-chem]')
  await page.click('[data-ui=walk-skip]')
  await at('chem', 'acid')
  await until(page, T => T.chem.state() && T.chem.state().vessels.length === 1 && T.chem.state().vessels[0].volume_mL === 0) // a skipped step is done for the user: the flask is on the bench
  await page.click('[data-ui=walk-skip-segment]')
  await at('library', 'problem')
  expect((await record()).segments.chem.done === false, 'a skipped segment is not ticked')
  await page.click('[data-ui=walk-close]')
  await page.waitForSelector('[data-ui=walk]', { state: 'detached' })

  // reduced motion: the ring neither pulses nor glides
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.keyboard.press('Control+k')
  await page.waitForSelector('.palette input')
  await page.keyboard.type('入门：运动')
  await page.waitForFunction(() => (document.querySelector('.palette')?.textContent ?? '').includes('入门：运动'))
  await page.keyboard.press('Enter')
  await at('motion', 'template')
  await page.waitForSelector('[data-ui=walk-ring]')
  const calm = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('[data-ui=walk-ring]')); const sec = v => Math.max(...v.split(',').map(x => parseFloat(x) * (x.trim().endsWith('ms') ? 0.001 : 1))); return { animation: cs.animationName, run: sec(cs.animationDuration), glide: sec(cs.transitionDuration) } })
  expect((calm.animation === 'none' || calm.run < 0.01) && calm.glide < 0.01, 'with reduced motion the ring does not pulse and jumps to its place', calm)
  await page.click('[data-ui=walk-close]')
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  // ---- a device that ran 26.63: only the list of changes ----
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, locale: 'zh-CN' })
  await ctx.addInitScript(() => { if (!localStorage.getItem('velophi.settings.v2')) localStorage.setItem('velophi.settings.v2', JSON.stringify({ rev: 2663, ui: { welcomed: true } })) })
  const old = await ctx.newPage()
  try {
    await fresh(old)
    await old.keyboard.press('Alt+0')
    await old.waitForSelector('[data-ui=home-whatsnew]')
    expect(await old.locator('[data-ui=home-start]').count() === 0, 'an updated device is not offered the whole walkthrough')
    await old.click('[data-ui=home-whatsnew]')
    // 26.65: the newest list is that of 26.65 (one bar, one inspector, the status bar, the home page, the bench)
    const first = await at('whatsnew', 'bar', old)
    const total = Number((await old.locator('[data-ui=walk-count]').innerText()).split('/')[1])
    expect(first.index === 0 && total >= 5, 'the list of changes is walked entry by entry', { first, total })
    await until(old, T => T.state.page === 'studio')
    await ringed('header.ctxbar .views', old)
    for (let i = 0; i < total; i++) {
      await old.waitForSelector(`[data-ui=walk][data-index="${i}"]`)
      await old.waitForTimeout(250)
      // an entry about another page shows that page and rings the control it is about
      if ((await walkOf(old)).step === 'bench') { await until(old, T => T.state.page === 'chem'); await ringed('[data-ui=chem-page] .sbar', old) }
      await old.click('[data-ui=walk-next]')
    }
    await old.waitForSelector('[data-ui=walk]', { state: 'detached' })
    const r2 = await record(old)
    expect(r2.seenVersion === '26.65' && Object.values(r2.segments).every(s => !s.done), 'the version is recorded as seen; the five segments were not replayed', r2)
    await old.keyboard.press('Alt+0')
    await old.waitForSelector('[data-ui=home-tour]')
    expect(await old.locator('[data-ui=home-offer]').count() === 0, 'the list is not offered twice')
    // Help › 新变化 stays with every list; "带我去看" on an entry of 26.64 walks that list (26.65)
    await old.click('[data-ui=help]')
    await old.click('[data-ui=help-news]')
    await old.waitForSelector('[data-ui=guide-news]')
    await old.click('[data-ui=guide-show-classroom]')
    await at('whatsnew', 'classroom', old)
    await until(old, T => T.state.page === 'library' && T.state.librarySection === 'classroom')
    await ringed('[data-ui=library-classroom]', old)
    await old.click('[data-ui=walk-next]')
    await old.waitForSelector('[data-ui=walk]', { state: 'detached' })
    // Alt+6 was a page of 26.63: said once
    await old.keyboard.press('Alt+6')
    await old.waitForSelector('.toast')
    const hint = await old.locator('.toast .toast-text').innerText()
    expect(/Alt\+1…5/.test(hint), 'Alt+6 says once where things went', hint)
    notes.push(`upgrade from 26.63: ${total} entries walked, nothing replayed; hint "${hint.trim()}"`)
  } finally { await ctx.close() }
  notes.push(`first run: offer on the home page only; 5 segments walked by real deeds (pH ${pH.toFixed(2)} past the end point, rheostat at ${circuit.pos}); closed at motion step 4 and taken up there after a reload; skip step / skip segment; reduced motion ${JSON.stringify(calm)}`)
})

// 10 · the simplified physics panel (26.64, D243, D244): the catalogue is a popover with one level filter, the header
// keeps the experiment's name (the rest is in "about"), the circuit's components are six named groups with the three
// used last on the strip, the inspector shows the key readings first, export / import / reset are in 更多.
await flow('physics-shell', async (page, notes) => {
  await page.click('[data-ui=page-lab]')
  await page.waitForSelector('[data-ui=lab-page] [data-ui=stage-catalogue]')
  const bar = await page.$$eval('[data-ui=lab-page] .sbar .lead > *, [data-ui=lab-page] .sbar .tail > *', els => els.length)
  expect(bar <= 7, 'the bar holds at most seven controls (D243)', bar)
  expect(await page.locator('[data-ui=lab-page] aside.catalog, [data-ui=lab-page] .lab-item').count() === 0, 'no permanent catalogue column')
  // the catalogue: every experiment, by field; the school level is one filter
  await page.click('[data-ui=lab-page] [data-ui=stage-catalogue]')
  const all = await page.locator('[data-ui^=lab-pick-]').count()
  expect(all >= 18, 'the catalogue lists the experiments', all)
  expect(await page.locator('[data-ui^=lab-pick-] .lvl').count() === 0, 'no level tags on the entries')
  await page.click('[data-ui=lab-level-j]')
  const junior = await page.locator('[data-ui^=lab-pick-]').count()
  expect(junior > 0 && junior < all, 'the level filter narrows the list', { all, junior })
  await page.click('[data-ui=lab-level-all]')
  await page.click('[data-ui=lab-pick-lens]')
  await until(page, T => T.settings.ui.lab === 'lens')
  expect(await page.locator('[data-ui^=lab-pick-]').count() === 0, 'choosing closes the catalogue')
  await page.click('[data-ui=lab-page] [data-ui=stage-catalogue]')
  await page.click('[data-ui=lab-pick-circuit]')
  await until(page, T => T.settings.ui.lab === 'circuit' && !!T.circuit)
  // the header: the name only; summary and model families are in "about"
  // 26.65 (D290): the name is on the catalogue button itself; the about button is the small ⓘ after it
  const name = (await page.locator('[data-ui=lab-page] [data-ui=stage-catalogue]').innerText()).trim()
  expect(name === '电路', 'the header shows the experiment\'s name only', name)
  expect(!/[A-Z]\d{2}\s*·\s*L\d/.test(await page.locator('[data-ui=lab-page] .sbar').innerText()), 'no internal ids on the bar')
  await page.click('[data-ui=lab-about]')
  const about = await page.locator('[data-ui=lab-page] [role=dialog]').first().innerText()
  expect(about.includes('欧姆定律'), 'the summary is in "about"', about.slice(0, 80))
  await page.keyboard.press('Escape')
  await page.locator('[data-ui=lab-page] canvas').first().click({ position: { x: 30, y: 30 } })
  // components: six named groups; a component used goes to the strip
  const groups = await page.$$eval('[data-ui^=circuit-group-]', els => els.map(e => e.getAttribute('data-ui').replace('circuit-group-', '')))
  expect(groups.join(',') === 'source,wiring,load,meter,sensor,other', 'six groups of components', groups)
  const kinds = new Set()
  for (const g of groups) {
    await page.click(`[data-ui=circuit-group-${g}]`)
    for (const k of await page.$$eval('[data-ui^=circuit-tool-]', els => els.map(e => e.getAttribute('data-ui')))) kinds.add(k)
    await page.keyboard.press('Escape')
  }
  expect(kinds.size >= 20 && kinds.has('circuit-tool-measure'), 'every component of the old strip is in a group', kinds.size)
  await page.click('[data-ui=circuit-group-meter]')
  await page.click('[data-ui=circuit-tool-voltmeter]')
  await page.waitForSelector('[data-ui=circuit-recent] [aria-label]')
  const recent = await page.locator('[data-ui=circuit-recent] button').count()
  expect(recent >= 1 && recent <= 3, 'the strip keeps the components used last, three at most', recent)
  // the inspector: the key readings first, the rest under "all readings"; the values are the solver's
  await page.click('[data-ui=lab-page] [data-ui=stage-more]')
  await page.click('[data-ui=lab-reset]')
  await page.click('[data-ui=lab-tab-readings]')
  await page.waitForSelector('[data-tour=lab-readings]')
  const key = await page.$$eval('[data-tour=lab-readings] > .lab-kv > span, [data-tour=lab-readings] > .kv > span', els => els.length)
  const rows = await page.locator('[data-tour=lab-readings]').innerText()
  expect(/A/.test(rows) && /V/.test(rows), 'the readings carry units', rows.slice(0, 120))
  expect(await page.locator('[data-ui=circuit-all-readings]').count() === 1 && !(await page.locator('[data-ui=circuit-all-readings]').getAttribute('open')), 'the other readings are folded under "all readings"')
  // the inspector switch closes and opens the column
  await page.click('[data-ui=lab-inspector]')
  expect(await page.locator('[data-ui=lab-page] [data-lab-side=closed]').count() === 1, 'the inspector closes')
  await page.click('[data-ui=lab-inspector]')
  // export, import and reset are items of 更多
  await page.click('[data-ui=lab-page] [data-ui=stage-more]')
  expect(await page.locator('[data-ui=lab-export]:visible, [data-ui=lab-import]:visible, [data-ui=lab-reset]:visible').count() === 3, 'export, import and reset are in 更多')
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-ui=lab-export]')])
  expect(/circuit\.velophi-lab\.json$/.test(download.suggestedFilename()), 'the experiment is exported as a file', download.suggestedFilename())
  notes.push(`${bar} controls on the bar; ${all} experiments (${junior} for 初中); ${groups.length} groups, ${kinds.size} components; key readings block of ${key} cells; exported ${download.suggestedFilename()}`)
})

writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1))
await browser.close()
srv?.close()
const failed = report.flows.filter(f => !f.ok).length
console.log(`${report.flows.length - failed}/${report.flows.length} flows passed in ${report.browser}`)
process.exit(failed ? 1 : 0)
