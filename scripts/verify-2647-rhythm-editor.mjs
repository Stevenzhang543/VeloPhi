/** 26.47 rhythm authoring in the built editor with real pointer and keyboard input:
 *  - the Rhythm Lab starter opens; its chart editor lists the chart's own note types (star, mine) and the
 *    master timeline (five tracks, three triggers), and draws the triggers on the beat grid;
 *  - "Add note type" creates a type, the Own type tool (7) places a note of it, Ctrl+Z takes both back;
 *  - "Add trigger at cursor" adds a trigger; the Add Component list puts Rhythm first;
 *  - the calibration dialog's picture test flashes, measures taps on the pad and suggests a picture offset;
 *  - Play runs the lab: autoplay scores while stars, mines and the timeline play.
 *
 * Usage: build first (vite build), then `node scripts/verify-2647-rhythm-editor.mjs`.
 * Set NOVA_AUDIT_BROWSER to a Chromium executable on systems without Microsoft Edge. */
import assert from 'node:assert/strict'
import { withBrowserAudit, wait } from './lib/browserUserAudit.mjs'

const release = JSON.parse(await (await import('node:fs/promises')).readFile('package.json', 'utf8')).version.split('.').slice(0, 2).join('.')

await withBrowserAudit({ release, name: 'rhythm-lab-2647', width: 1600, height: 900, commandTimeoutMs: 60000 }, async ({ evaluate, until, click, clickText, press, capture, check, observations, client }) => {
  const text = selector => evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent.trim() ?? null`)
  const count = selector => evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`)
  const rect = selector => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||!e.getClientRects().length)return null;const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height}})()`)
  const mouse = async (type, x, y, button = 'left') => client.send('Input.dispatchMouseEvent', { type, x, y, button, clickCount: type === 'mouseMoved' ? 0 : 1 })
  /** Pixels in the chart canvas whose colour is close to `rgb` (note-type colours, trigger flags). */
  const colourPixels = (rgb, tolerance = 40) => evaluate(`(()=>{const c=document.querySelector('[data-chart-canvas]');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(Math.abs(d[i]-${rgb[0]})<${tolerance}&&Math.abs(d[i+1]-${rgb[1]})<${tolerance}&&Math.abs(d[i+2]-${rgb[2]})<${tolerance})n++;return n})()`)

  await check('The Rhythm Lab starter opens; the chart editor lists its note types, tracks and triggers', async () => {
    await until("!!document.querySelector('.project-manager .new-project')", 30000)
    await click('.project-manager .new-project')
    await until("!!document.querySelector('.creation-dialog .create-button')")
    // Rhythm starters come first in the launcher.
    const first = await evaluate("[...document.querySelectorAll('.creation-dialog [data-template-id]')].slice(0,3).map(e=>e.getAttribute('data-template-id'))")
    observations.push({ name: 'launcher-order', first })
    assert.deepEqual(first, ['rhythm-lab', 'rhythm-lanes', 'rhythm-lines'])
    await clickText('.creation-dialog [data-template-id]', 'Rhythm Lab')
    await click('.creation-dialog .create-button')
    await until("!!document.querySelector('.editor-root .top-bar .workspace-list')", 60000)
    await wait(1200)
    const skip = await evaluate("[...document.querySelectorAll('button')].findIndex(b=>b.textContent.trim()==='Skip for now')")
    if (skip >= 0) await clickText('button', 'Skip for now', true)
    if (await evaluate("!!document.querySelector('.ui-dialog [data-onboarding], .onboarding-dialog')")) await press('Escape')
    await wait(400)
    await until("[...document.querySelectorAll('.entity-item .entity-name')].some(e=>e.textContent.trim()==='Prism')", 20000)
    // Found in the 26.47 release check: collapsing an object listed its children at the top level.
    const names = () => evaluate("[...document.querySelectorAll('.entity-item .entity-name')].map(e=>e.textContent.trim())")
    const hudToggle = () => evaluate("(()=>{const row=[...document.querySelectorAll('.entity-item')].find(r=>r.querySelector('.entity-name')?.textContent.trim()==='HUD Canvas');const b=row?.querySelector('.disclosure')?.getBoundingClientRect();return b?{x:b.x+b.width/2,y:b.y+b.height/2}:null})()")
    const toggle = async () => { const at = await hudToggle(); assert.ok(at, 'the HUD Canvas disclosure'); await mouse('mouseMoved', at.x, at.y); await mouse('mousePressed', at.x, at.y); await mouse('mouseReleased', at.x, at.y); await wait(500) }
    assert.ok((await names()).includes('Song Title'), 'HUD texts listed under the expanded canvas')
    await toggle()
    const collapsed = await names()
    observations.push({ name: 'hierarchy-collapsed', collapsed })
    assert.ok(!collapsed.includes('Song Title') && collapsed.includes('HUD Canvas'), `collapsed canvas hides its children: ${collapsed.join(', ')}`)
    await toggle()
    assert.ok((await names()).includes('Song Title'), 'expanded again')
    await clickText('.entity-item .entity-name', 'Rhythm Chart'); await wait(500)
    await click('[data-rhythm-edit-chart]'); await wait(1200)
    await until("!!document.querySelector('[data-chart-canvas]')", 20000)
    await until("!!document.querySelector('[data-chart-note-types]')", 10000)
    const types = await evaluate("[...document.querySelectorAll('[data-chart-type]')].map(e=>e.getAttribute('data-chart-type'))")
    const tracks = await count('[data-chart-track]'), triggers = await count('[data-chart-triggers] tbody tr')
    observations.push({ name: 'lab-chart', types, tracks, triggers, stats: await text('.chart-stats') })
    assert.deepEqual(types, ['star', 'mine'])
    assert.equal(tracks, 5)
    assert.equal(triggers, 3)
    assert.ok(await evaluate("!!document.querySelector('[data-rhythm-error-bar]')?.checked"), 'the lab shows the error bar')
    await capture('lab-chart-editor')
  })

  await check('Add note type, place a note with the Own type tool, undo both; add a trigger', async () => {
    const before = await text('.chart-stats')
    await click('[data-chart-add-type]'); await wait(300)
    const typeIds = await evaluate("[...document.querySelectorAll('[data-chart-type]')].map(e=>e.getAttribute('data-chart-type'))")
    observations.push({ name: 'types-after-add', typeIds })
    assert.equal(typeIds.length, 3, `a third type: ${typeIds.join(', ')}`)
    await click('[data-chart-tool="custom"]'); await wait(200)
    assert.ok(await rect('[data-chart-custom-type]'), 'the Own type tool shows its type list')
    await evaluate("(()=>{const s=document.querySelector('[data-chart-custom-type]');s.value=s.options[s.options.length-1].value;s.dispatchEvent(new Event('change'))})()")
    await wait(200)
    // Scroll to an empty stretch (the outro) and place a note in lane 2.
    const canvas = await rect('[data-chart-canvas]')
    await mouse('mouseMoved', canvas.x + canvas.w / 2, canvas.y + canvas.h / 2)
    await client.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: canvas.x + canvas.w / 2, y: canvas.y + canvas.h / 2, deltaX: 0, deltaY: -4000 }); await wait(400)
    const x = canvas.x + 96 + 72 * 2.5, y = canvas.y + canvas.h - 56 - 52
    await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); await wait(500)
    const after = await text('.chart-stats')
    observations.push({ name: 'own-type-note', before, after })
    assert.notEqual(after, before, 'the note count changed')
    await capture('own-type-note')
    await press('z', 2); await wait(300)
    await press('z', 2); await wait(400)
    assert.equal(await text('.chart-stats'), before, 'undo removed the note')
    assert.equal(await count('[data-chart-type]'), 2, 'and the new type')
    await click('[data-chart-add-trigger]'); await wait(300)
    assert.equal(await count('[data-chart-triggers] tbody tr'), 4, 'a fourth trigger')
    const flags = await colourPixels([255, 200, 90], 30)
    observations.push({ name: 'trigger-flag-pixels', flags })
    // The side panel has the focus now: the toolbar's Undo takes the trigger back.
    await click('.chart-toolbar .ui-button[aria-label="Undo"]'); await wait(300)
    assert.equal(await count('[data-chart-triggers] tbody tr'), 3)
  })

  await check('The picture test flashes and turns tapped flashes into a suggested picture offset', async () => {
    await click('[data-chart-calibrate]'); await wait(400)
    await click('[data-chart-picture-start]')
    const pad = await rect('[data-chart-tap-pad]')
    let taps = 0
    for (let index = 0; index < 14; index++) {
      await until("document.querySelector('[data-chart-flash]')?.classList.contains('lit')", 5000)
      await mouse('mouseMoved', pad.x + pad.w / 2, pad.y + pad.h / 2)
      await mouse('mousePressed', pad.x + pad.w / 2, pad.y + pad.h / 2); await mouse('mouseReleased', pad.x + pad.w / 2, pad.y + pad.h / 2)
      taps++
      await until("!document.querySelector('[data-chart-flash]')?.classList.contains('lit')", 5000)
    }
    const result = await text('[data-chart-picture-result]')
    observations.push({ name: 'picture-test', taps, result })
    assert.match(result ?? '', /ms/, 'a measured result')
    await capture('picture-test')
    // Typing a value stores it for this device; put it back to 0.
    await evaluate("(()=>{const i=document.querySelector('[data-chart-visual-offset]');i.value='0';i.dispatchEvent(new Event('change'))})()")
    await click('[data-chart-calibration-close]'); await wait(300)
  })

  await check('Add Component lists Rhythm first and hides deprecated components until asked', async () => {
    await clickText('.entity-item .entity-name', 'Prism'); await wait(400)
    const opened = await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&/Add component/i.test(b.textContent||b.getAttribute('aria-label')||''));if(!b)return false;b.click();return true})()")
    assert.ok(opened, 'the Add component button')
    await until("!!document.querySelector('.component-picker-list h5')", 10000)
    const groups = await evaluate("[...document.querySelectorAll('.component-picker-list h5')].map(h=>h.childNodes[0].textContent.trim())")
    const listed = await evaluate("[...document.querySelectorAll('.component-picker-list article strong')].map(e=>e.textContent.trim())")
    observations.push({ name: 'add-component', groups })
    const categories = groups.filter(name => !/Favorites|Recently used/.test(name))
    assert.equal(categories[0], 'Rhythm', `groups ${groups.join(', ')}`)
    assert.ok(categories.indexOf('More · Physics') > categories.indexOf('Audio'), 'the classic groups follow under More')
    assert.ok(!listed.some(name => /World Chunk|Navigation Agent|Behavior Tree/i.test(name)), 'deprecated components are hidden')
    await click('[data-component-show-all]'); await wait(300)
    const all = await evaluate("[...document.querySelectorAll('.component-picker-list article strong')].map(e=>e.textContent.trim())")
    assert.ok(all.length > listed.length, 'Show all lists more')
    await capture('add-component')
    await press('Escape'); await wait(300)
  })

  await check('Play runs the lab; autoplay scores through the drop', async () => {
    await click('.actionbar .play-button'); await wait(2500)
    await press('b'); await wait(22000)
    await clickText('.entity-item .entity-name', 'Rhythm Chart').catch(() => undefined); await wait(400)
    const live = await text('.rhythm-live')
    observations.push({ name: 'lab-play', live, stars: await evaluate("[...document.querySelectorAll('.entity-item .entity-name')].filter(e=>e.textContent.trim()==='Star Note').length") })
    const score = Number((live ?? '').match(/Score ([\d,]+)/)?.[1]?.replace(/,/g, '') ?? 0)
    assert.ok(score > 100000, `the score rose: ${live}`)
    await capture('lab-playing')
    await click('.actionbar .ui-button[aria-label="Stop"]'); await wait(800)
    assert.equal(await evaluate("document.querySelector('.actionbar')?.dataset.playMode"), 'editing')
  })
})
