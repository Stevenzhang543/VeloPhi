/** 26.46 exported rhythm games in the independent Player (no editor code):
 *  - the Rhythm Lanes and Rhythm Lines starters are packed as the exporter packs them (song, chart and
 *    scripts inside game.nova-pak) and start in player.html;
 *  - the chart loads from the package and waits for a first press when the browser holds sound back;
 *  - a key press starts it, B (the starter's Autoplay action) plays it and the score rises;
 *  - P pauses and resumes through the starter's controller script.
 *
 * Usage: build first (vite build), then `node scripts/verify-2646-rhythm-player.mjs`. The package is
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

const out = await mkdtemp(join(tmpdir(), 'nova-rhythm-player-'))
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
  packages = { lanes: await pack('rhythm-lanes'), lines: await pack('rhythm-lines') }
} finally { await rm(out, { recursive: true, force: true }) }

const dist = join(root, process.env.NOVA_AUDIT_DIST_DIRECTORY || 'dist'), pakPath = join(dist, 'game.nova-pak')
try {
  await withBrowserAudit({ release, name: 'rhythm-player-2646', width: 1280, height: 800, commandTimeoutMs: 60000 }, async ({ evaluate, until, press, capture, check, observations, client }) => {
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

    for (const [name, data] of Object.entries(packages)) {
      await writeFile(pakPath, data)
      await check(`The exported ${name === 'lanes' ? 'Rhythm Lanes' : 'Rhythm Lines'} game loads its chart and song from the package; a key starts it and autoplay scores`, async () => {
        await open()
        const loaded = await chart()
        observations.push({ name: `${name}-loaded`, ...loaded })
        assert.equal(loaded.stage, 'running', JSON.stringify(loaded)); assert.equal(loaded.mode, 'independent')
        assert.ok(loaded.found, 'the chart object exists'); assert.equal(loaded.error, null, `chart error: ${loaded.error}`)
        assert.ok(['loading', 'playing'].includes(loaded.state), `waiting or playing: ${loaded.state}`)
        await press('b'); await wait(600)
        await until(`(()=>{const d=globalThis.__NOVA_PLAYER__,w=d?.session?.runtime?.presentation?.world;const c=w?.entities.flatMap(e=>[...e.componentMap.values()]).find(c=>c.kind==='RhythmChart2D');return c?.state==='playing'&&c.runtimeSongTime>0})()`, 20000)
        await wait(name === 'lanes' ? 7000 : 12000)
        const playing = await chart()
        observations.push({ name: `${name}-playing`, ...playing, lit: await pixels() })
        assert.equal(playing.state, 'playing')
        assert.ok(playing.score > 0 && playing.combo > 0, `autoplay scores: ${JSON.stringify(playing)}`)
        await capture(`${name}-player`)
        await press('p'); await wait(800)
        const paused = await chart()
        await wait(600)
        const still = await chart()
        observations.push({ name: `${name}-paused`, state: paused.state, time: paused.time, later: still.time })
        assert.equal(paused.state, 'paused', 'P pauses through the controller script')
        assert.ok(Math.abs(still.time - paused.time) < .05, `the chart clock stops while paused (${paused.time} → ${still.time})`)
        await press('p'); await wait(1500)
        assert.equal((await chart()).state, 'playing', 'P resumes')
      })
    }
  })
} finally { await rm(pakPath, { force: true }) }
