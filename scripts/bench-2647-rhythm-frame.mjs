/** 26.47 frame-time bench for rhythm scenes: the real GameplayRuntime plays a template project headless (mock
 * Web Audio, no rendering) for 1,000 frames at 120 Hz and reports the mean and 95th-percentile frame time and
 * the runtime's own buckets (physics, scripts, animation, audio, input), plus whether the physics solver was
 * skipped (a scene without rigid bodies). It records numbers for the release notes; it fails only on errors.
 *
 * Usage: node scripts/bench-2647-rhythm-frame.mjs (needs nova_core/pkg built from this source).
 * IDS=rhythm-lanes,rhythm-lab,platformer selects the templates. Results: .cache/verify/bench-2647-rhythm-frame.json */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'
import { build } from 'vite'
const root = process.cwd(), out = await mkdtemp(join(tmpdir(), 'nova-bench-2647-'))
if (!globalThis.crypto) globalThis.crypto = webcrypto
for (const name of ['HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement']) if (!(name in globalThis)) globalThis[name] = class {}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => [], maxTouchPoints: 0, platform: 'Win32' } })
const entries = { 'src/editor/gameplayRuntime.ts': 'gameplayRuntime', 'src/store/physics.ts': 'physicsState, loadProject', 'src/projects/templates.ts': 'createTemplateProjectJson', 'nova_core/pkg/nova_core.js': 'default as initWasm, WasmRuntimeWorld' }
const entry = join(out, 'entry.ts')
await writeFile(entry, Object.entries(entries).map(([p, n]) => `export { ${n} } from '${join(root, p).replaceAll('\\', '/')}';`).join('\n'))
await writeFile(join(out, 'package.json'), '{"type":"module"}\n')
await build({ configFile: false, root, logLevel: 'error', ssr: { noExternal: true }, build: { ssr: true, outDir: join(out, 'build'), emptyOutDir: false, rollupOptions: { input: { probe: entry }, output: { entryFileNames: '[name].mjs' } } } })
const api = await import(pathToFileURL(join(out, 'build', 'probe.mjs')).href)
globalThis.window = Object.assign(new EventTarget(), { performance: globalThis.performance, setTimeout, clearTimeout })
globalThis.document = Object.assign(new EventTarget(), { hidden: false, activeElement: null })
globalThis.CustomEvent = class extends Event { constructor(name, options) { super(name); this.detail = options?.detail } }
/** A small Web Audio stand-in: the context time follows the virtual clock while running. */
const contexts = []
class MockParam { constructor(value = 0) { this.value = value } setTargetAtTime(value) { this.value = value } setValueAtTime(value) { this.value = value } linearRampToValueAtTime(value) { this.value = value } cancelScheduledValues() {} }
class MockNode { constructor(context) { this.context = context; this.gain = new MockParam(1); this.pan = new MockParam(0); this.delayTime = new MockParam(0); this.frequency = new MockParam(0); this.Q = new MockParam(0); for (const name of ['threshold', 'knee', 'ratio', 'attack', 'release']) this[name] = new MockParam(0) } connect(target) { return target } disconnect() {} }
class MockAnalyser extends MockNode { fftSize = 256; getFloatTimeDomainData(data) { data.fill(0) } }
class MockSource extends MockNode { buffer = null; onended = null; start(when, offset) { this.context.started.push({ when, offset, duration: this.buffer?.duration ?? 0, at: this.context.currentTime }) } stop() { this.stopped = true } }
class MockAudioContext {
  constructor(options = {}) { this.sampleRate = options.sampleRate ?? 48000; this.state = 'running'; this.baseLatency = .01; this.outputLatency = .03; this.destination = new MockNode(this); this.started = []; this.origin = performance.now(); this.frozen = 0; contexts.push(this) }
  get currentTime() { return this.state === 'running' ? (performance.now() - this.origin) / 1000 : this.frozen }
  getOutputTimestamp() { return { contextTime: Math.max(0, this.currentTime - .002), performanceTime: performance.now() - 2 } }
  createGain() { return new MockNode(this) } createAnalyser() { return new MockAnalyser(this) } createDynamicsCompressor() { return new MockNode(this) } createBiquadFilter() { return new MockNode(this) }
  createStereoPanner() { return new MockNode(this) } createDelay() { return new MockNode(this) } createConvolver() { return new MockNode(this) } createBufferSource() { return new MockSource(this) }
  createBuffer(channels, length, rate) { return { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: () => new Float32Array(length) } }
  decodeAudioData() { return Promise.resolve(this.createBuffer(2, this.sampleRate * 20, this.sampleRate)) }
  resume() { if (this.state === 'suspended') { this.origin = performance.now() - this.frozen * 1000; this.state = 'running' } return Promise.resolve() }
  suspend() { if (this.state === 'running') { this.frozen = this.currentTime; this.state = 'suspended' } return Promise.resolve() }
  close() { this.state = 'closed'; return Promise.resolve() }
}


globalThis.AudioContext = MockAudioContext; window.AudioContext = MockAudioContext
class FakeAudio extends EventTarget { play() { return Promise.resolve() } pause() {} load() {} }
globalThis.Audio = FakeAudio; window.Audio = FakeAudio
await api.initWasm({ module_or_path: await readFile(join(root, 'nova_core/pkg/nova_core_bg.wasm')) })
const world = api.physicsState.world
world.runtime = new api.WasmRuntimeWorld(); world.wasmLoaded = true
const results = []
for (const id of (process.env.IDS || 'rhythm-lanes,rhythm-lab,platformer').split(',')) {
  api.loadProject(api.createTemplateProjectJson(id, 'Bench'))
  api.physicsState.playMode = 'playing'
  const runtime = api.gameplayRuntime
  runtime.stopSession(false); runtime.beginSession()
  const times = [], parts = { physicsMs: 0, scriptsMs: 0, animationMs: 0, audioMs: 0, inputMs: 0 }
  for (let f = 0; f < 1200; f++) { const t0 = performance.now(); runtime.frame(1 / 120); const dt = performance.now() - t0; if (f >= 200) { times.push(dt); for (const k in parts) parts[k] += runtime.diagnostics?.timings?.[k] ?? 0 } }
  times.sort((a, b) => a - b)
  const mean = times.reduce((a, b) => a + b, 0) / times.length
  const result = {
    template: id, entities: world.entities.length, rigidBodies: world.entities.filter(e => e.hasComponent?.('RigidBody2D')).length,
    physicsSkipped: world.physicsIdle(), meanMs: +mean.toFixed(3), p95Ms: +times[Math.floor(times.length * .95)].toFixed(3),
    buckets: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, +(v / times.length).toFixed(3)]))
  }
  results.push(result)
  console.log(JSON.stringify(result))
  runtime.stopSession(false)
}
await mkdir(join(root, '.cache', 'verify'), { recursive: true })
await writeFile(join(root, '.cache', 'verify', 'bench-2647-rhythm-frame.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), node: process.version, results }, null, 2)}\n`)
await rm(out, { recursive: true, force: true })
process.exit(0)
