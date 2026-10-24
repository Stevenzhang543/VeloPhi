/** 26.47 the Rhythm Lab exported and run in the independent Player (no editor code):
 *  - packed as the exporter packs it (song, chart with note types and timeline, the star prefab and its
 *    scripts inside game.nova-pak) and started in player.html;
 *  - B (autoplay) plays it: in the drop the star prefabs follow their notes with their spinning cores,
 *    the camera has zoomed, the backdrop prism turns; the score rises;
 *  - P pauses and resumes through the lab's controller script.
 *
 * Usage: build first (vite build), then `node scripts/verify-2647-rhythm-player.mjs`. The package is
 * written to dist/game.nova-pak for the run and removed afterwards.
 * Set NOVA_AUDIT_BROWSER to a Chromium executable on systems without Microsoft Edge. */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'
import { build } from 'vite'
import { withBrowserAudit, wait } from './lib/browserUserAudit.mjs'

const root = process.cwd()
const release = JSON.parse(await (await import('node:fs/promises')).readFile('package.json', 'utf8')).version.split('.').slice(0, 2).join('.')
if (!globalThis.crypto) globalThis.crypto = webcrypto

const out = await mkdtemp(join(tmpdir(), 'nova-rhythm-lab-player-'))
let packages
try {
  const entry = join(out, 'entry.ts')
  await writeFile(entry, [`export { createTemplateProjectJson } from '${join(root, 'src/projects/templates.ts').replaceAll('\\', '/')}';`, `export { createNovaPak } from '${join(root, 'src/runtime/novaPak.ts').replaceAll('\\', '/')}';`].join('\n'))
  await writeFile(join(out, 'package.json'), '{"type":"module"}\n')
  await build({ configFile: false, root, logLevel: 'error', ssr: { noExternal: true }, build: { ssr: true, outDir: join(out, 'build'), emptyOutDir: false, rollupOptions: { input: { pack: entry }, output: { entryFileNames: '[name].mjs' } } } })
  const api = await import(pathToFileURL(join(out, 'build', 'pack.mjs')).href)
  const pack = async id => {
    const project = JSON.parse(api.createTemplateProjectJson(id, 'Rhythm Player Check'))
    project.projectSettings.build = { ...(project.projectSettings.build ?? {}), profile: 'debug', developmentBuild: true, gameName: 'Rhythm Player Check' }
    const startup = project.activeSceneUuid ?? project.scenes[0].uuid
    project.activeSceneUuid = startup
    return Buffer.from(await api.createNovaPak(JSON.stringify(project), project.assets ?? [], startup, { deterministic: true, compression: 'balanced', authoritativeAssets: true }))
  }
  packages = { lab: await pack('rhythm-lab') }
} finally { await rm(out, { recursive: true, force: true }) }

const dist = join(root, process.env.NOVA_AUDIT_DIST_DIRECTORY || 'dist'), pakPath = join(dist, 'game.nova-pak')
try {
  await withBrowserAudit({ release, name: 'rhythm-lab-player-2647', width: 1280, height: 800, commandTimeoutMs: 60000 }, async ({ evaluate, until, press, capture, check, observations, client }) => {
    const origin = await evaluate('location.origin')
    const open = async () => {
      await client.send('Page.navigate', { url: `${origin}/player.html?legacyPlayer=0` })
      await wait(300)
      await until("(()=>{const d=globalThis.__NOVA_PLAYER__;return d&&(d.stage==='running'||d.stage==='failed')})()", 40000)
      await wait(1200)
    }
    /** The chart component of the running game as the runtime sees it. */
    const chart = () => evaluate(`(()=>{const d=globalThis.__NOVA_PLAYER__,w=d?.session?.runtime?.presentation?.world;const e=w?.entities.find(e=>e.componentMap&&[...e.componentMap.values()].some(c=>c.kind==='RhythmChart2D'));const c=e?[...e.componentMap.values()].find(c=>c.kind==='RhythmChart2D'):null;return{stage:d?.stage,mode:d?.mode,found:!!c,state:c?.state??null,error:c?.lastError??null,time:c?.runtimeSongTime??null,score:c?.runtimeScore??0,combo:c?.runtimeCombo??0}})()`)
    /** Mean brightness of the game canvas (the chart draws lanes and notes on a dark background). */
    const pixels = () => evaluate(`(()=>{const c=document.querySelector('.nova-player-overlay')||document.querySelector('canvas');if(!c)return null;const p=document.createElement('canvas');p.width=128;p.height=80;const g=p.getContext('2d');g.drawImage(c,0,0,128,80);const d=g.getImageData(0,0,128,80).data;let lit=0;for(let i=0;i<d.length;i+=4)if(d[i]+d[i+1]+d[i+2]>240)lit++;return lit})()`)

    /** The lab's world in the Player: stars on screen, their cores, the prism, the camera zoom. */
    const scene = () => evaluate(`(()=>{const w=globalThis.__NOVA_PLAYER__?.session?.runtime?.presentation?.world;if(!w)return null;const es=w.entities;const stars=es.filter(e=>e.name==='Star Note'&&e.enabled);const cores=stars.map(s=>es.find(e=>e.name==='Star Core'&&e.parentUuid===s.uuid));const prism=es.find(e=>e.name==='Prism');const cam=es.find(e=>e.camera2D);return{stars:stars.length,cores:cores.filter(c=>c&&c.enabled).length,prismRotation:prism?prism.transform.rotation*180/Math.PI:null,zoom:cam?cam.camera2D.zoom:null}})()`)
    await writeFile(pakPath, packages.lab)
    await check('The exported Rhythm Lab plays its stars, mines and timeline in the Player; P pauses and resumes', async () => {
      await open()
      const loaded = await chart()
      observations.push({ name: 'lab-loaded', ...loaded })
      assert.equal(loaded.stage, 'running', JSON.stringify(loaded)); assert.equal(loaded.mode, 'independent')
      assert.ok(loaded.found, 'the chart object exists'); assert.equal(loaded.error, null, `chart error: ${loaded.error}`)
      await press('b'); await wait(600)
      await until(`(()=>{const d=globalThis.__NOVA_PLAYER__,w=d?.session?.runtime?.presentation?.world;const c=w?.entities.flatMap(e=>[...e.componentMap.values()]).find(c=>c.kind==='RhythmChart2D');return c?.state==='playing'&&c.runtimeSongTime>17.5})()`, 40000)
      let best = null
      for (let sample = 0; sample < 12; sample++) { const value = await scene(); if (!best || value.stars > best.stars) best = value; if (best.stars) break; await wait(250) }
      const playing = await chart()
      observations.push({ name: 'lab-drop', ...best, score: playing.score, combo: playing.combo, lit: await pixels() })
      assert.ok(best.stars >= 1 && best.cores === best.stars, `stars with their cores: ${JSON.stringify(best)}`)
      assert.ok(Math.abs(best.zoom - 1.14) < 1e-6, `camera zoom ${best.zoom}`)
      assert.ok(best.prismRotation > 45, `prism rotation ${best.prismRotation}`)
      assert.ok(playing.score > 0 && playing.combo > 0, `autoplay scores: ${JSON.stringify(playing)}`)
      await capture('lab-player-drop')
      await press('p'); await wait(800)
      const paused = await chart()
      assert.equal(paused.state, 'paused', 'P pauses through the controller script')
      await press('p'); await wait(1500)
      assert.equal((await chart()).state, 'playing', 'P resumes')
    })
  })
} finally { await rm(pakPath, { force: true }) }
