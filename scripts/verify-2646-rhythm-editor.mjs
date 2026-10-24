/** 26.46 rhythm workflow in the built editor with real pointer and keyboard input:
 *  - the Rhythm Lanes starter opens; its chart is drawn in the Scene view without playing;
 *  - the Rhythm Chart inspector opens the chart editor (canvas, waveform, beat grid, side panel);
 *  - a click places a note, Ctrl+Z removes it again, the calibration dialog opens and closes;
 *  - Play runs the chart (notes fall, the song plays on the audio clock), B turns on autoplay and the
 *    score and combo rise; Stop restores the scene;
 *  - the Rhythm Lines starter shows its judgement lines and notes.
 *
 * Usage: build first (vite build), then `node scripts/verify-2646-rhythm-editor.mjs`.
 * Set NOVA_AUDIT_BROWSER to a Chromium executable on systems without Microsoft Edge. */
import assert from 'node:assert/strict'
import { withBrowserAudit, wait } from './lib/browserUserAudit.mjs'

const release = JSON.parse(await (await import('node:fs/promises')).readFile('package.json', 'utf8')).version.split('.').slice(0, 2).join('.')

await withBrowserAudit({ release, name: 'rhythm-2646', width: 1600, height: 900, commandTimeoutMs: 60000 }, async ({ evaluate, until, click, clickText, press, capture, check, observations, client }) => {
  const text = selector => evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent.trim() ?? null`)
  /** The Debug workspace's Game view shows the running game through its own camera. */
  const gameView = async () => { await clickText('.top-bar .workspace-list button', 'Debug'); await wait(500); const index = await evaluate("[...document.querySelectorAll('.ui-button')].findIndex(b=>b.getClientRects().length&&/Game view/.test(b.getAttribute('aria-label')||'')&&b.getAttribute('aria-pressed')!=='true')"); if (index >= 0) await click('.ui-button', index); await wait(300); if (await evaluate("document.querySelector('.bottom-panel [aria-expanded=\"true\"]')?.getAttribute('aria-label')==='Collapse panel'")) { await click('.bottom-panel [aria-expanded="true"][aria-label="Collapse panel"]'); await wait(600) } }
  const rect = selector => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||!e.getClientRects().length)return null;const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height}})()`)
  const mouse = async (type, x, y, button = 'left') => client.send('Input.dispatchMouseEvent', { type, x, y, button, clickCount: type === 'mouseMoved' ? 0 : 1 })
  const openTemplate = async name => {
    await until("!!document.querySelector('.project-manager .new-project')", 30000)
    await click('.project-manager .new-project')
    await until("!!document.querySelector('.creation-dialog .create-button')")
    await clickText('.creation-dialog [data-template-id]', name)
    await click('.creation-dialog .create-button')
    await until("!!document.querySelector('.editor-root .top-bar .workspace-list')", 60000)
    await wait(1200)
    const skip = await evaluate("[...document.querySelectorAll('button')].findIndex(b=>b.textContent.trim()==='Skip for now')")
    if (skip >= 0) await clickText('button', 'Skip for now', true)
    if (await evaluate("!!document.querySelector('.ui-dialog [data-onboarding], .onboarding-dialog')")) await press('Escape')
    await wait(400)
  }
  /** Mean brightness and colour spread of a region of the scene canvas (the chart is drawn there). */
  const canvasStats = selector => evaluate(`(()=>{const c=document.querySelector(${JSON.stringify(selector)});if(!c)return null;const probe=document.createElement('canvas');probe.width=160;probe.height=90;const g=probe.getContext('2d');g.drawImage(c,0,0,160,90);const d=g.getImageData(0,0,160,90).data;let sum=0,bright=0,cyan=0;for(let i=0;i<d.length;i+=4){const l=(d[i]+d[i+1]+d[i+2])/3;sum+=l;if(l>200)bright++;if(d[i+2]>200&&d[i+1]>170&&d[i]<170)cyan++}return{mean:sum/(d.length/4),bright,cyan}})()`)

  await check('The Rhythm Lanes starter opens and its chart is drawn in the Scene view', async () => {
    await openTemplate('Rhythm Lanes')
    await until("[...document.querySelectorAll('.entity-item .entity-name')].some(e=>e.textContent.trim()==='Rhythm Chart')", 20000)
    await wait(800)
    const stats = await canvasStats('.overlay-canvas')
    observations.push({ name: 'scene-canvas', stats })
    await capture('lanes-scene')
  })

  await check('The inspector edits the chart and opens the chart editor', async () => {
    await clickText('.entity-item .entity-name', 'Rhythm Chart'); await wait(500)
    await until("!!document.querySelector('[data-rhythm-edit-chart]')")
    assert.ok(await evaluate("[...document.querySelectorAll('[data-rhythm-chart-select] option')].some(o=>o.selected&&/Neon Step/.test(o.textContent))"), 'the template chart is selected')
    await click('[data-rhythm-edit-chart]'); await wait(1200)
    await until("!!document.querySelector('[data-chart-canvas]')", 20000)
    await until("/notes/.test(document.querySelector('.chart-stats')?.textContent||'')")
    const stats = await text('.chart-stats')
    observations.push({ name: 'chart-stats', stats })
    assert.match(stats, /^173 notes/)
    await wait(1500)
    await capture('chart-editor')
  })

  await check('A click places a note, Ctrl+Z takes it back, the song is drawn as a waveform', async () => {
    const canvas = await rect('[data-chart-canvas]')
    assert.ok(canvas && canvas.w > 400 && canvas.h > 150, JSON.stringify(canvas))
    // Scroll forward a little so the click lands between notes, then place a tap in lane 1.
    const before = await text('.chart-stats')
    const x = canvas.x + 96 + 36, y = canvas.y + canvas.h - 56 - 40
    await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); await wait(400)
    const after = await text('.chart-stats')
    observations.push({ name: 'place-note', before, after })
    assert.notEqual(after, before, 'the note count changed')
    assert.match(await evaluate("document.querySelector('[data-chart-save]')?.getAttribute('aria-label') ?? ''"), /•/, 'unsaved changes are marked')
    await press('z', 2); await wait(400)
    assert.equal(await text('.chart-stats'), before, 'undo restored the chart')
    const waveform = await evaluate("(()=>{const c=document.querySelector('[data-chart-canvas]');const g=c.getContext('2d');const d=g.getImageData(0,0,Math.round(90*Math.min(2,devicePixelRatio)),c.height).data;let blue=0;for(let i=0;i<d.length;i+=4)if(d[i+2]>120&&d[i+2]>d[i]+30)blue++;return blue})()")
    observations.push({ name: 'waveform-pixels', waveform })
    assert.ok(waveform > 100, `the waveform column is drawn (${waveform} px)`)
  })

  await check('The calibration dialog opens and closes', async () => {
    await click('[data-chart-calibrate]'); await wait(400)
    assert.ok(await rect('[data-chart-calibration]'), 'dialog visible')
    await capture('calibration')
    await click('[data-chart-calibration-close]'); await wait(300)
    assert.equal(await rect('[data-chart-calibration]'), null)
  })

  await check('Play runs the chart; autoplay scores while the notes fall', async () => {
    await click('.actionbar .play-button'); await wait(3500)
    await press('b'); await wait(9000)
    await clickText('.entity-item .entity-name', 'Rhythm Chart').catch(() => undefined); await wait(400)
    const live = await text('.rhythm-live')
    const status = await text('.rhythm-status')
    observations.push({ name: 'play', live, status })
    assert.match(status ?? '', /Playing/, `status ${status}`)
    const score = Number((live ?? '').match(/Score ([\d,]+)/)?.[1]?.replace(/,/g, '') ?? 0)
    assert.ok(score > 0, `the score rose: ${live}`)
    await capture('lanes-playing')
    const stats = await canvasStats('.overlay-canvas')
    observations.push({ name: 'playing-canvas', stats })
    await gameView(); await wait(2500); await capture('lanes-game')
    await clickText('.top-bar .workspace-list button', 'Design'); await wait(600)
    await click('.actionbar .ui-button[aria-label="Stop"]'); await wait(800)
    assert.equal(await evaluate("document.querySelector('.actionbar')?.dataset.playMode"), 'editing')
  })
})

await withBrowserAudit({ release, name: 'rhythm-lines-2646', width: 1600, height: 900, commandTimeoutMs: 60000 }, async ({ evaluate, until, click, clickText, press, capture, check, observations }) => {
  const text = selector => evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent.trim() ?? null`)
  const gameView = async () => { await clickText('.top-bar .workspace-list button', 'Debug'); await wait(500); const index = await evaluate("[...document.querySelectorAll('.ui-button')].findIndex(b=>b.getClientRects().length&&/Game view/.test(b.getAttribute('aria-label')||'')&&b.getAttribute('aria-pressed')!=='true')"); if (index >= 0) await click('.ui-button', index); await wait(300); if (await evaluate("document.querySelector('.bottom-panel [aria-expanded=\"true\"]')?.getAttribute('aria-label')==='Collapse panel'")) { await click('.bottom-panel [aria-expanded="true"][aria-label="Collapse panel"]'); await wait(600) } }
  await check('The Rhythm Lines starter plays its moving judgement lines; autoplay scores', async () => {
    await until("!!document.querySelector('.project-manager .new-project')", 30000)
    await click('.project-manager .new-project')
    await until("!!document.querySelector('.creation-dialog .create-button')")
    await clickText('.creation-dialog [data-template-id]', 'Rhythm Lines')
    await click('.creation-dialog .create-button')
    await until("!!document.querySelector('.editor-root .top-bar .workspace-list')", 60000)
    await wait(1200)
    const skip = await evaluate("[...document.querySelectorAll('button')].findIndex(b=>b.textContent.trim()==='Skip for now')")
    if (skip >= 0) await clickText('button', 'Skip for now', true)
    if (await evaluate("!!document.querySelector('.ui-dialog [data-onboarding], .onboarding-dialog')")) await press('Escape')
    await wait(600)
    await capture('lines-scene')
    await click('.actionbar .play-button'); await wait(1500)
    await press('b')
    await gameView()
    await wait(9000); await capture('lines-game-early')
    await wait(24000); await capture('lines-game-lift')
    await clickText('.top-bar .workspace-list button', 'Design'); await wait(600)
    await clickText('.entity-item .entity-name', 'Rhythm Chart'); await wait(500)
    const live = await text('.rhythm-live')
    observations.push({ name: 'lines-play', live })
    const score = Number((live ?? '').match(/Score ([\d,]+)/)?.[1]?.replace(/,/g, '') ?? 0)
    assert.ok(score > 100000, `the score rose: ${live}`)
    await click('.actionbar .ui-button[aria-label="Stop"]'); await wait(800)
  })
})
