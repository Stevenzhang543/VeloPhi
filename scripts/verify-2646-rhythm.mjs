/** 26.46 rhythm checks: the Rust core through WASM (the template charts compile, TS and Rust tempo maps
 * agree, chart files round-trip), and the real GameplayRuntime playing RhythmChart2D charts — autoplay
 * reaches 1,000,000, keyboard and pointer presses are judged by their event time (Perfect, Great, Good,
 * Bad, Miss), holds break when let go early, judgement lines map touches through the camera, scripts read
 * and control the chart, signals reach scripts, the song is scheduled on the audio clock and the scene
 * renderer draws the published frames.
 *
 * Usage: node scripts/verify-2646-rhythm.mjs (needs nova_core/pkg built from this source).
 * Results: .cache/verify/rhythm-2646.json */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'
import { build } from 'vite'

const root = process.cwd()
const out = await mkdtemp(join(tmpdir(), 'nova-rhythm-2646-'))
const results = []
const observations = {}
const only = process.env.NOVA_VERIFY_ONLY ? new RegExp(process.env.NOVA_VERIFY_ONLY) : null
const check = async (name, run) => { if (only && !only.test(name)) return; try { await run(); results.push({ name, ok: true }); console.log('PASS', name) } catch (error) { results.push({ name, ok: false, error: String(error?.stack ?? error) }); console.log('FAIL', name, '\n   ', String(error?.message ?? error)) } }
if (!globalThis.crypto) globalThis.crypto = webcrypto
for (const name of ['HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement']) if (!(name in globalThis)) globalThis[name] = class {}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => [], maxTouchPoints: 0, platform: 'Win32' } })

// A virtual performance clock: the runtime, the input timestamps and the mock audio clock all read it.
const clock = { now: 10_000 }
Object.defineProperty(performance, 'now', { configurable: true, value: () => clock.now })

/** A small Web Audio stand-in: the context time follows the virtual clock while running. */
const contexts = []
class MockParam { constructor(value = 0) { this.value = value } setTargetAtTime(value) { this.value = value } setValueAtTime(value) { this.value = value } linearRampToValueAtTime(value) { this.value = value } cancelScheduledValues() {} }
class MockNode { constructor(context) { this.context = context; this.gain = new MockParam(1); this.pan = new MockParam(0); this.delayTime = new MockParam(0); this.frequency = new MockParam(0); this.Q = new MockParam(0); for (const name of ['threshold', 'knee', 'ratio', 'attack', 'release']) this[name] = new MockParam(0) } connect(target) { return target } disconnect() {} }
class MockAnalyser extends MockNode { fftSize = 256; getFloatTimeDomainData(data) { data.fill(0) } }
class MockSource extends MockNode { buffer = null; onended = null; start(when, offset) { this.context.started.push({ when, offset, duration: this.buffer?.duration ?? 0, at: this.context.currentTime }) } stop() { this.stopped = true } }
class MockAudioContext {
  constructor(options = {}) { this.sampleRate = options.sampleRate ?? 48000; this.state = 'running'; this.baseLatency = .01; this.outputLatency = .03; this.destination = new MockNode(this); this.started = []; this.origin = clock.now; this.frozen = 0; contexts.push(this) }
  get currentTime() { return this.state === 'running' ? (clock.now - this.origin) / 1000 : this.frozen }
  getOutputTimestamp() { return { contextTime: Math.max(0, this.currentTime - .002), performanceTime: clock.now - 2 } }
  createGain() { return new MockNode(this) } createAnalyser() { return new MockAnalyser(this) } createDynamicsCompressor() { return new MockNode(this) } createBiquadFilter() { return new MockNode(this) }
  createStereoPanner() { return new MockNode(this) } createDelay() { return new MockNode(this) } createConvolver() { return new MockNode(this) } createBufferSource() { return new MockSource(this) }
  createBuffer(channels, length, rate) { return { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: () => new Float32Array(length) } }
  decodeAudioData() { return Promise.resolve(this.createBuffer(2, this.sampleRate * 20, this.sampleRate)) }
  resume() { if (this.state === 'suspended') { this.origin = clock.now - this.frozen * 1000; this.state = 'running' } return Promise.resolve() }
  suspend() { if (this.state === 'running') { this.frozen = this.currentTime; this.state = 'suspended' } return Promise.resolve() }
  close() { this.state = 'closed'; return Promise.resolve() }
}

try {
  const entries = {
    'src/editor/gameplayRuntime.ts': 'gameplayRuntime',
    'src/store/physics.ts': 'physicsState',
    'src/assets/AssetDatabase.ts': 'assetState',
    'src/assets/types.ts': 'defaultScriptMetadata',
    'src/world/BoxEntity.ts': 'BoxEntity',
    'src/world/components.ts': 'Script2D, RhythmChart2D, Camera2D',
    'src/runtime/rhythmChartDocument.ts': 'ChartTempo, normalizeChartDocument, serializeChartDocument, newChartDocument',
    'src/runtime/rhythmClock.ts': 'RhythmChartClock, songSchedule, laneKeyCodes, rhythmSettingsArray, reservedActionKeys, isRhythmKeyboardKey',
    'src/projects/rhythmTemplateSong.ts': 'composeNeonStep, composeSkylineDrift, neonStepChart, skylineDriftChart, chartSource, renderSong',
    'src/projects/templates.ts': 'createTemplateProject',
    'src/renderer/rhythmFrames.ts': 'rhythmFrame, publishRhythmFrame',
    'src/renderer/rhythmRenderer.ts': 'submitRhythmChart',
    'nova_core/pkg/nova_core.js': 'default as initWasm, WasmRuntimeWorld, WasmRhythmSession, rhythm_beat_to_time, rhythm_time_to_beat, rhythm_validate_chart'
  }
  const entry = join(out, 'entry.ts')
  await writeFile(entry, Object.entries(entries).map(([path, names]) => `export { ${names} } from '${join(root, path).replaceAll('\\', '/')}';`).join('\n'))
  await writeFile(join(out, 'package.json'), '{"type":"module"}\n')
  await build({ configFile: false, root, logLevel: 'error', ssr: { noExternal: true }, build: { ssr: true, outDir: join(out, 'build'), emptyOutDir: false, rollupOptions: { input: { rhythm: entry }, output: { entryFileNames: '[name].mjs' } } } })
  const api = await import(pathToFileURL(join(out, 'build', 'rhythm.mjs')).href)

  globalThis.window = Object.assign(new EventTarget(), { performance: globalThis.performance, setTimeout, clearTimeout })
  globalThis.document = Object.assign(new EventTarget(), { hidden: false, activeElement: null })
  globalThis.CustomEvent = class extends Event { constructor(name, options) { super(name); this.detail = options?.detail } }
  await api.initWasm({ module_or_path: await readFile(join(root, 'nova_core/pkg/nova_core_bg.wasm')) })
  const declarations = await readFile(join(root, 'nova_core/pkg/nova_core.d.ts'), 'utf8')
  assert.ok(declarations.includes('WasmRhythmSession'), 'nova_core/pkg exports WasmRhythmSession (rebuild the WASM)')

  // ------------------------------------------------------------------ core and chart files
  const neon = api.composeNeonStep(), skyline = api.composeSkylineDrift()
  const neonChart = api.neonStepChart(neon, 'asset://song'), skylineChart = api.skylineDriftChart(skyline, 'asset://song')

  await check('the template charts compile in the Rust core with every note kind and line events', () => {
    for (const [name, chart] of [['neon', neonChart], ['skyline', skylineChart]]) {
      const source = api.chartSource(chart)
      assert.equal(api.rhythm_validate_chart(source), '', `${name} validates`)
      const session = new api.WasmRhythmSession(source, new Float64Array([]))
      assert.equal(session.note_count(), chart.notes.length)
      observations[`${name}Chart`] = { notes: chart.notes.length, length: session.length(), mode: session.mode(), lines: session.line_count(), bytes: source.length }
      session.free()
    }
    const kinds = new Set(skylineChart.notes.map(note => note.type))
    for (const kind of ['tap', 'hold', 'drag', 'flick']) assert.ok(kinds.has(kind), `skyline has ${kind}`)
    assert.ok(neonChart.notes.some(note => note.type === 'hold'), 'neon has holds')
    assert.ok(skylineChart.lines[0].events.rotation.length && skylineChart.lines[1].events.alpha.length, 'lines move and fade')
    // Notes never overlap a hold in the same lane (unplayable otherwise).
    for (const hold of neonChart.notes.filter(note => note.type === 'hold')) assert.ok(!neonChart.notes.some(note => note !== hold && note.lane === hold.lane && note.beat > hold.beat && note.beat < hold.endBeat + .2), `hold at ${hold.beat} is clear`)
  })

  await check('the TypeScript tempo map equals the Rust one across tempo changes and lead-ins', () => {
    const tempo = [{ beat: 0, bpm: 128 }, { beat: 16, bpm: 64 }, { beat: 20, bpm: 200 }, { beat: 33.5, bpm: 97.25 }]
    const ts = new api.ChartTempo(tempo), flat = new Float64Array(tempo.flatMap(point => [point.beat, point.bpm]))
    let worst = 0
    for (let beat = -4; beat < 60; beat += .37) {
      const time = api.rhythm_beat_to_time(flat, beat)
      worst = Math.max(worst, Math.abs(ts.beatToTime(beat) - time), Math.abs(ts.timeToBeat(time) - api.rhythm_time_to_beat(flat, time)))
    }
    observations.tempoWorstDifference = worst
    assert.ok(worst < 1e-9, `differences ${worst}`)
  })

  await check('chart files round-trip through normalise and serialise, and broken charts are rejected', () => {
    const source = api.chartSource(skylineChart)
    const again = api.serializeChartDocument(api.normalizeChartDocument(JSON.parse(source)))
    assert.equal(again, source)
    assert.ok(source.split('\n').filter(line => line.includes('"type"')).length === skylineChart.notes.length, 'one note per line')
    assert.match(api.rhythm_validate_chart('{"format":"nova-chart","version":1,"notes":[{"type":"hold","beat":2}]}'), /endBeat/)
    assert.match(api.rhythm_validate_chart('{"format":"nova-chart","version":1,"lanes":4,"notes":[{"type":"tap","beat":2,"lane":7}]}'), /lane 7/)
    assert.match(api.rhythm_validate_chart('{"format":"other","version":1}'), /format/)
    assert.throws(() => api.normalizeChartDocument({ format: 'nova-chart', version: 9 }), /version/)
  })

  await check('the template songs render deterministically, loud enough and without clipping', () => {
    const first = api.renderSong(neon, 8000), second = api.renderSong(neon, 8000)
    let peak = 0, energy = 0, same = true
    for (let index = 0; index < first.length; index++) { peak = Math.max(peak, Math.abs(first[index])); energy += first[index] ** 2; if (first[index] !== second[index]) same = false }
    assert.ok(same, 'deterministic')
    assert.ok(peak <= .9001 && peak > .85, `peak ${peak}`)
    const rmsDb = 10 * Math.log10(energy / first.length)
    observations.neonRmsDb = rmsDb
    assert.ok(rmsDb > -20 && rmsDb < -8, `rms ${rmsDb} dB`)
  })

  await check('the rhythm templates build complete projects (song, chart, component, controls)', () => {
    for (const id of ['rhythm-lanes', 'rhythm-lines']) {
      const project = api.createTemplateProject(id, `Test ${id}`)
      const assets = project.assets
      const chart = assets.find(asset => asset.assetType === 'chart'), song = assets.find(asset => asset.assetType === 'audio')
      assert.ok(chart && song, `${id} assets`)
      assert.ok(song.source.startsWith('data:audio/wav;base64,UklGR'), 'a WAV data URL')
      const component = project.scenes[0].entities.flatMap(entity => entity.components).find(part => part.kind === 'RhythmChart2D')
      assert.equal(component.data.chartAsset, `asset://${chart.uuid}`)
      assert.equal(component.data.audioAsset, `asset://${song.uuid}`)
      assert.equal(api.rhythm_validate_chart(chart.source), '')
      observations[id] = { songBytes: song.byteLength, duration: Math.round(song.duration * 10) / 10 }
    }
  })

  // ------------------------------------------------------------------ the runtime
  const world = api.physicsState.world
  world.runtime = new api.WasmRuntimeWorld(); world.wasmLoaded = true
  const runtime = api.gameplayRuntime
  const signals = []
  const emit = runtime.emitSignal.bind(runtime)
  runtime.emitSignal = (name, payload, target, source, delivered) => { if (String(name).startsWith('rhythm.') || String(name).startsWith('probe')) signals.push({ name, payload: JSON.parse(JSON.stringify(payload ?? null)), at: clock.now }); return emit(name, payload, target, source, delivered) }
  let nextId = 9000
  const records = []
  const chartAsset = (uuid, document) => { records.push({ uuid, name: `${uuid}.nova-chart`, path: `Assets/Charts/${uuid}.nova-chart`, assetType: 'chart', source: typeof document === 'string' ? document : JSON.stringify(document) }); return `asset://${uuid}` }
  const scriptAsset = (uuid, source) => { records.push({ uuid, name: `${uuid}.rhai`, path: `Assets/Scripts/${uuid}.rhai`, assetType: 'script', source, script: { ...api.defaultScriptMetadata() } }); return uuid }
  const audioAsset = uuid => { records.push({ uuid, name: `${uuid}.wav`, path: `Assets/Audio/${uuid}.wav`, assetType: 'audio', source: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=', duration: 20, mimeType: 'audio/wav', settings: { audioSettings: { streaming: false, trimStart: 0, trimEnd: 0, normalize: false, normalizationGain: 1, preload: 'Auto', loopRegions: [], activeLoopRegion: null, loopStart: 0, loopEnd: 0 } } }); return `asset://${uuid}` }
  const chartEntity = (reference, setup = () => {}) => {
    const entity = new api.BoxEntity(nextId++, { x: 0, y: 0 }, { x: 1, y: 1 }); entity.name = 'Chart'; entity.rigidBody.bodyType = 'Static'
    const component = entity.addComponent(new api.RhythmChart2D()); component.chartAsset = reference; component.leadInSeconds = 1; component.hitSound = false
    setup(component, entity)
    return { entity, component }
  }
  const cameraEntity = () => { const entity = new api.BoxEntity(nextId++, { x: 0, y: 0 }, { x: .1, y: .1 }); entity.name = 'Camera'; entity.rigidBody.bodyType = 'Static'; const camera = entity.addComponent(new api.Camera2D()); camera.orthographicSize = 5; camera.active = true; return entity }
  const viewport = { left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0 }
  const start = entities => {
    // A check that failed half-way leaves its session running; every check starts from a stopped runtime.
    runtime.stopSession(false)
    api.assetState.records.splice(0, api.assetState.records.length, ...records); api.assetState.generation++
    world.entities.splice(0, world.entities.length, ...entities)
    api.physicsState.playMode = 'playing'
    signals.length = 0
    runtime.beginSession()
  }
  const frame = (ms = 1000 / 60) => { clock.now += ms; runtime.frame(ms / 1000, viewport) }
  const run = (seconds, during) => { const frames = Math.round(seconds * 60); for (let index = 0; index < frames; index++) { frame(); during?.() } }
  const stop = () => { runtime.stopSession(false); records.length = 0 }
  const flush = async () => { for (let index = 0; index < 5; index++) await new Promise(resolve => setTimeout(resolve, 0)) }
  /** Performance time (ms) at which the chart reaches chart time `time` (silent or audio clock alike). */
  const performanceAt = (component, time) => clock.now + (time - component.runtimeSongTime) * 1000
  const key = (code, down, timeStamp) => {
    const event = { code, key: code.replace(/^Key/, '').toLowerCase(), repeat: false, isComposing: false, keyCode: 65, defaultPrevented: false, target: null, timeStamp, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, getModifierState: () => false }
    if (down) runtime.input.onKeyDown(event); else runtime.input.onKeyUp(event)
  }
  const pointer = (kind, id, clientX, clientY, timeStamp) => {
    const event = { pointerType: 'touch', pointerId: id, button: 0, clientX, clientY, timeStamp, target: null, pressure: .5, tiltX: 0, tiltY: 0, twist: 0, getCoalescedEvents: () => [] }
    if (kind === 'down') runtime.input.onPointerDown(event); else if (kind === 'move') runtime.input.onPointerMove(event); else runtime.input.onPointerUp(event)
  }
  /** Delivers an input at chart time `time`: the event carries that timestamp and arrives 6 ms later. */
  const at = (component, time, deliver) => {
    const stamp = performanceAt(component, time)
    while (clock.now + 1000 / 60 < stamp) frame()
    clock.now = Math.max(clock.now, stamp + 6)
    deliver(stamp)
    frame(1)
  }
  delete globalThis.AudioContext

  const lanesChart = { format: 'nova-chart', version: 1, meta: { title: 'Test lanes', offsetMs: 0 }, mode: 'lanes', lanes: 4, tempo: [{ beat: 0, bpm: 120 }],
    notes: [0, 1, 2, 3].map(lane => ({ type: 'tap', beat: 4 + lane, lane })).concat([{ type: 'tap', beat: 8, lane: 1 }, { type: 'hold', beat: 10, endBeat: 12, lane: 0 }, { type: 'hold', beat: 14, endBeat: 16, lane: 3 }]) }

  await check('autoplay plays a whole chart to 1,000,000 and emits started, hits, beats and finished', () => {
    const { entity, component } = chartEntity(chartAsset('autoplay-chart', api.chartSource(neonChart)), value => { value.botPlay = true })
    start([cameraEntity(), entity])
    run(.2)
    assert.equal(component.state, 'playing', `state ${component.state} ${component.lastError ?? ''}`)
    run(observations.neonChart.length + 2)
    assert.equal(component.state, 'finished')
    assert.equal(component.runtimeScore, 1_000_000)
    assert.equal(component.runtimeMaxCombo, neonChart.notes.length)
    const names = signals.map(signal => signal.name)
    assert.ok(names.includes('rhythm.started'), 'started')
    assert.equal(names.filter(name => name === 'rhythm.hit').length, neonChart.notes.length)
    assert.ok(names.filter(name => name === 'rhythm.beat').length >= neon.bars * 4 - 2, 'beats')
    const finished = signals.find(signal => signal.name === 'rhythm.finished')
    assert.ok(finished?.payload.allPerfect && finished.payload.rank === 'P', JSON.stringify(finished?.payload))
    const published = api.rhythmFrame(component.uuid)
    assert.equal(published?.status, 'finished')
    observations.autoplay = { score: component.runtimeScore, hits: names.filter(name => name === 'rhythm.hit').length, message: published.message }
    stop()
  })

  await check('keyboard presses are judged by their event time: Perfect, Great, Good, Bad and Miss', () => {
    const { entity, component } = chartEntity(chartAsset('timing-chart', lanesChart))
    start([cameraEntity(), entity])
    run(.1)
    const offsets = [[0, 'KeyD', 0, 'perfect'], [1, 'KeyF', .07, 'great'], [2, 'KeyJ', -.12, 'good'], [3, 'KeyK', .16, 'bad']]
    for (const [index, code, offset] of offsets) at(component, (4 + index) * .5 + offset, stamp => key(code, true, stamp))
    for (const [, code] of offsets) key(code, false, clock.now)
    run(3)
    const hits = signals.filter(signal => signal.name === 'rhythm.hit').map(signal => signal.payload)
    const misses = signals.filter(signal => signal.name === 'rhythm.miss').map(signal => signal.payload)
    observations.timing = hits.map(hit => ({ judgement: hit.judgement, offsetMs: Math.round(hit.offsetMs * 10) / 10, lane: hit.lane }))
    for (const [index, , offset, judgement] of offsets) {
      const hit = hits.find(value => value.lane === index)
      assert.ok(hit, `lane ${index} was hit`)
      assert.equal(hit.judgement, judgement, `lane ${index}`)
      assert.ok(Math.abs(hit.offsetMs - offset * 1000) < 1.5, `offset ${hit.offsetMs} ≈ ${offset * 1000}`)
    }
    assert.ok(misses.some(miss => miss.lane === 1), 'the unplayed note on lane 1 is a miss')
    assert.equal(component.runtimeCombo, 0, 'the miss broke the combo')
    stop()
  })

  await check('a hold let go early breaks (miss), a hold kept to its end counts', () => {
    const { entity, component } = chartEntity(chartAsset('hold-chart', lanesChart))
    start([cameraEntity(), entity])
    run(.1)
    at(component, 5, stamp => key('KeyD', true, stamp))
    at(component, 5.4, stamp => key('KeyD', false, stamp))
    at(component, 7, stamp => key('KeyK', true, stamp))
    run(1.2)
    at(component, 8.1, stamp => key('KeyK', false, stamp))
    run(.5)
    const holdMiss = signals.find(signal => signal.name === 'rhythm.miss' && signal.payload.kind === 'hold')
    assert.ok(holdMiss?.payload.holdBroken, 'the early release broke the first hold')
    const kept = signals.filter(signal => signal.name === 'rhythm.hit' && signal.payload.kind === 'hold' && signal.payload.lane === 3)
    assert.equal(kept.length, 1, 'the second hold was hit')
    assert.equal(api.rhythmFrame(component.uuid)?.notes.length, 0, 'nothing left to draw')
    stop()
  })

  await check('judgement-line touches are mapped through the camera onto a rotated, moving line', () => {
    const line = { x: 1, y: .5, rotation: 30, alpha: 1, speed: 1, length: 20, events: { y: [{ start: 0, end: 4, from: .5, to: -.5, ease: 'linear' }] } }
    const chart = { format: 'nova-chart', version: 1, meta: { title: 'Lines' }, mode: 'lines', tempo: [{ beat: 0, bpm: 120 }], lines: [line],
      notes: [{ type: 'tap', beat: 4, line: 0, x: 2 }, { type: 'tap', beat: 5, line: 0, x: -3 }, { type: 'flick', beat: 6, line: 0, x: 0 }] }
    const { entity, component } = chartEntity(chartAsset('line-chart', chart))
    start([cameraEntity(), entity])
    run(.1)
    // The camera shows 10 units in 500 px: 50 px per unit, origin at (500, 250), y up.
    const client = (x, y) => [500 + x * 50, 250 - y * 50]
    const radians = 30 * Math.PI / 180
    const onLine = (along, y) => [1 + along * Math.cos(radians), y + along * Math.sin(radians)]
    at(component, 2, stamp => pointer('down', 3, ...client(...onLine(2, -.5)), stamp))
    at(component, 2.05, stamp => pointer('up', 3, ...client(...onLine(2, -.5)), stamp))
    // Far from the second note: no hit, then a miss.
    at(component, 2.5, stamp => pointer('down', 4, ...client(...onLine(3.5, -.5)), stamp))
    at(component, 2.55, stamp => pointer('up', 4, ...client(...onLine(3.5, -.5)), stamp))
    // The flick: a fast swipe across the line.
    at(component, 2.98, stamp => pointer('down', 5, ...client(...onLine(0, -.5)), stamp))
    for (let step = 1; step <= 4; step++) at(component, 2.98 + step * .01, stamp => pointer('move', 5, ...client(...onLine(0, -.5 + step * .3)), stamp))
    at(component, 3.05, stamp => pointer('up', 5, ...client(...onLine(0, .7)), stamp))
    run(1)
    const hits = signals.filter(signal => signal.name === 'rhythm.hit').map(signal => signal.payload)
    observations.lines = { hits: hits.map(hit => `${hit.kind}:${hit.judgement}`), misses: signals.filter(signal => signal.name === 'rhythm.miss').length }
    assert.ok(hits.some(hit => hit.kind === 'tap' && hit.judgement === 'perfect'), 'the first tap is perfect')
    assert.ok(hits.some(hit => hit.kind === 'flick'), 'the flick counts')
    assert.equal(signals.filter(signal => signal.name === 'rhythm.miss').length, 1, 'the touch far along the line missed its note')
    stop()
  })

  await check('in lines mode any letter key hits, except the keys of the project actions', () => {
    const chart = { format: 'nova-chart', version: 1, meta: { title: 'Lines keys' }, mode: 'lines', tempo: [{ beat: 0, bpm: 120 }], lines: [{ x: 0, y: -2, rotation: 0, alpha: 1, speed: 1, length: 20, events: {} }],
      notes: [{ type: 'tap', beat: 4, line: 0, x: 0 }, { type: 'tap', beat: 6, line: 0, x: 2 }] }
    const { entity, component } = chartEntity(chartAsset('line-keys', chart))
    const saved = api.physicsState.inputMap
    api.physicsState.inputMap = [{ name: 'Retry', kind: 'button', enabled: true, bindings: [{ device: 'keyboard', code: 'KeyR' }] }]
    try {
      start([cameraEntity(), entity])
      run(.1)
      at(component, 2, stamp => key('KeyR', true, stamp)); key('KeyR', false, clock.now)
      at(component, 3, stamp => key('KeyG', true, stamp)); key('KeyG', false, clock.now)
      run(1)
      const hits = signals.filter(signal => signal.name === 'rhythm.hit').map(signal => signal.payload)
      observations.linesKeys = { hits: hits.map(hit => `${hit.kind}:${hit.judgement}`), misses: signals.filter(signal => signal.name === 'rhythm.miss').length }
      assert.equal(hits.length, 1, 'only G hit a note')
      assert.equal(hits[0].judgement, 'perfect')
      assert.equal(signals.filter(signal => signal.name === 'rhythm.miss').length, 1, 'the R press (Retry) left its note to be missed')
    } finally { api.physicsState.inputMap = saved }
    stop()
  })

  await check('scripts read the chart (state, score, combo, stats) and pause, resume and seek it', () => {
    const script = scriptAsset('rhythm-probe', `
let paused_once = false;
fn update(dt) {
  if rhythm_combo() >= 2 && !paused_once { paused_once = true; signal_emit("probe.state", #{ state: rhythm_state(), combo: rhythm_combo(), score: rhythm_score(), perfect: rhythm_count("perfect") }); rhythm_pause(); }
}
fn on_signal(name, payload, source) {
  if name == "rhythm.finished" { signal_emit("probe.finished", #{ score: payload.score, stats: rhythm_stats() }); }
}`)
    const { entity, component } = chartEntity(chartAsset('script-chart', lanesChart), value => { value.botPlay = true })
    const behaviour = entity.addComponent(new api.Script2D()); behaviour.scriptAsset = script
    start([cameraEntity(), entity])
    run(4.2)
    const probe = signals.find(signal => signal.name === 'probe.state')
    if (process.env.NOVA_RHYTHM_DEBUG) console.log(JSON.stringify({ signals: signals.map(signal => signal.name).slice(0, 20), logs: (runtime.diagnostics?.scriptErrors ?? null), scriptError: entity.script2D?.lastError, time: component.runtimeSongTime, state: component.state, combo: component.runtimeCombo }))
    assert.ok(probe, 'the script saw the combo')
    assert.equal(probe.payload.state, 'playing')
    assert.ok(probe.payload.combo >= 2 && probe.payload.perfect >= 2 && probe.payload.score > 0, JSON.stringify(probe.payload))
    run(.2)
    assert.equal(component.state, 'paused')
    const pausedAt = component.runtimeSongTime, scoreAtPause = component.runtimeScore, comboAtPause = component.runtimeCombo
    const hitsAtPause = signals.filter(signal => signal.name === 'rhythm.hit').length
    run(1)
    assert.equal(component.runtimeSongTime, pausedAt, 'time stands still while paused')
    assert.ok(runtime.rhythm.command('', 'resume'), 'resume')
    run(.3)
    assert.equal(component.state, 'playing')
    assert.ok(component.runtimeSongTime < pausedAt + .2, 'resumed a second early')
    // 26.46 hand check: resuming used to seek, which reset score and combo and judged the replayed notes again.
    assert.ok(component.runtimeScore >= scoreAtPause && component.runtimeCombo >= comboAtPause, `resume keeps the score: ${scoreAtPause}/${comboAtPause} → ${component.runtimeScore}/${component.runtimeCombo}`)
    run(.6)
    assert.equal(signals.filter(signal => signal.name === 'rhythm.hit').length, hitsAtPause, 'notes judged before the pause are not judged again in the replayed second')
    assert.ok(runtime.rhythm.command('', 'seek', 6.8))
    run(2.5)
    const done = signals.find(signal => signal.name === 'probe.finished')
    assert.ok(done, 'the script received rhythm.finished')
    assert.ok(done.payload.stats.total === 7 && done.payload.stats.judged < 7, `seeking skipped notes: ${JSON.stringify(done.payload.stats)}`)
    stop()
  })

  await check('the template controller script pauses, retries and toggles autoplay from its input actions', () => {
    const project = api.createTemplateProject('rhythm-lanes', 'Controller')
    const controller = project.assets.find(asset => asset.assetType === 'script')
    const script = scriptAsset('rhythm-controller', controller.source)
    const savedMap = api.physicsState.inputMap
    api.physicsState.inputMap = project.projectSettings.inputMap
    try {
      const { entity, component } = chartEntity(chartAsset('controller-chart', lanesChart))
      const behaviour = entity.addComponent(new api.Script2D()); behaviour.scriptAsset = script; behaviour.properties = { save_key: 'controller-test', autoplay_on: false }
      start([cameraEntity(), entity])
      run(.3)
      key('KeyB', true, clock.now); key('KeyB', false, clock.now)
      run(.2)
      assert.equal(entity.script2D.lastError ?? null, null, 'the controller runs without errors')
      assert.equal(component.botPlay, true, 'B turned autoplay on')
      key('Escape', true, clock.now); key('Escape', false, clock.now)
      run(.2)
      assert.equal(component.state, 'paused', 'Esc paused')
      key('Escape', true, clock.now); key('Escape', false, clock.now)
      run(.4)
      assert.equal(component.state, 'playing', 'Esc resumed')
      run(4)
      assert.ok(component.runtimeScore > 0, `autoplay scores: ${component.runtimeScore}`)
      stop()
    } finally { api.physicsState.inputMap = savedMap }
  })

  await check('with Web Audio the song is scheduled on the audio clock and chart time follows the heard output', async () => {
    globalThis.AudioContext = MockAudioContext
    try {
      const song = audioAsset('mock-song')
      const document = { ...lanesChart, meta: { title: 'Audio', audio: song, offsetMs: 250 } }
      const { entity, component } = chartEntity(chartAsset('audio-chart', document), value => { value.offsetMs = 50 })
      start([cameraEntity(), entity])
      if (process.env.NOVA_RHYTHM_DEBUG) console.log('after start', component.state, component.lastError, runtime.rhythm.running)
      frame()
      if (process.env.NOVA_RHYTHM_DEBUG) console.log('after frame', component.state, component.lastError)
      await flush()
      if (process.env.NOVA_RHYTHM_DEBUG) console.log('after flush', component.state, component.lastError)
      run(.2)
      await flush()
      run(.1)
      const context = contexts.at(-1)
      if (process.env.NOVA_RHYTHM_DEBUG) console.log(JSON.stringify({ state: component.state, error: component.lastError, diagnostics: runtime.rhythm.diagnostics, failures: runtime.audio.diagnostics.failures, contexts: contexts.length, started: context?.started }))
      assert.ok(context, 'an audio context')
      const started = context.started.find(value => value.duration >= 19)
      assert.ok(started, `the song was scheduled: ${JSON.stringify(context.started)}`)
      // Lead-in 1 s, beat 0 at 0.25 s + 0.05 s in the audio: the buffer starts 0.7 s after the anchor, from 0.
      const schedule = api.songSchedule(-1, 0, .3)
      assert.ok(Math.abs(schedule.start - .7) < 1e-9 && schedule.offset === 0, JSON.stringify(schedule))
      // Chart time = heard context time − anchor − 1 s lead-in; the heard time trails currentTime by the output latency.
      const heard = (context.getOutputTimestamp().contextTime + (clock.now - context.getOutputTimestamp().performanceTime) / 1000)
      const expected = heard - (started.when - .7) - 1
      observations.audioClock = { songTime: component.runtimeSongTime, expected, scheduledAt: started.when, offset: started.offset }
      assert.ok(Math.abs(component.runtimeSongTime - expected) < .003, `song time ${component.runtimeSongTime} vs ${expected}`)
      // Suspending the context (the editor paused) stops the chart; resuming continues from there.
      await context.suspend()
      const before = component.runtimeSongTime
      api.physicsState.playMode = 'paused'
      run(.5)
      api.physicsState.playMode = 'playing'
      await context.resume()
      run(.1)
      assert.ok(component.runtimeSongTime - before < .2, `paused audio held the chart: ${component.runtimeSongTime - before}`)
      stop()
    } finally { delete globalThis.AudioContext }
  })

  await check('the chart clock smooths a stepping source and snaps after a jump', () => {
    const chartClock = new api.RhythmChartClock()
    chartClock.start(0, 100)
    const samples = []
    for (let frameIndex = 0; frameIndex < 120; frameIndex++) {
      const ms = 50_000 + frameIndex * 1000 / 60
      // A source that only moves every 10 ms (coarse timestamps) around the true time.
      const source = 100 + Math.floor((ms - 50_000) / 10) * .01
      samples.push(chartClock.sample(ms, source))
    }
    const steps = samples.slice(1).map((value, index) => value - samples[index])
    assert.ok(steps.every(step => step > .012 && step < .022), `smooth frame steps: ${Math.min(...steps)}..${Math.max(...steps)}`)
    const jumped = chartClock.sample(52_000, 105)
    assert.ok(Math.abs(jumped - 5) < 1e-9, 'a 3 s jump snaps')
  })

  await check('lane keys follow the lane count; the settings reach the core', () => {
    assert.deepEqual(api.laneKeyCodes(4, ''), ['KeyD', 'KeyF', 'KeyJ', 'KeyK'])
    assert.deepEqual(api.laneKeyCodes(7, ''), ['KeyS', 'KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK', 'KeyL'])
    assert.deepEqual(api.laneKeyCodes(4, 'a, s, ;, space'), ['KeyA', 'KeyS', 'Semicolon', 'Space'])
    // Lines mode hits with any letter, digit or Space except the keys the project's actions use (Pause, Retry…).
    const reserved = api.reservedActionKeys([{ bindings: [{ device: 'keyboard', code: 'Escape' }, { device: 'keyboard', code: 'p' }] }, { bindings: [{ device: 'physical-key', code: 'KeyR' }, { device: 'gamepad-button', code: '3' }] }, { enabled: false, bindings: [{ device: 'keyboard', code: 'KeyB' }] }])
    assert.deepEqual([...reserved].sort(), ['Escape', 'KeyP', 'KeyR'])
    assert.ok(api.isRhythmKeyboardKey('KeyF') && api.isRhythmKeyboardKey('Space') && !api.isRhythmKeyboardKey('Escape') && !api.isRhythmKeyboardKey('ArrowLeft'))
    const settings = api.rhythmSettingsArray({ perfectMs: 40, greatMs: 80, goodMs: 120, badMs: 160, scrollSpeed: 9, laneWidth: 1.5, judgeY: -3, hitWidth: 1.2, flickSpeed: 15, botPlay: true })
    assert.deepEqual([...settings.slice(0, 4)].map(value => Math.round(value * 1000)), [40, 80, 120, 160])
    assert.equal(settings[12], 1)
  })

  await check('the renderer draws lanes, notes, hold bodies, effects and the HUD from a published frame', () => {
    const component = new api.RhythmChart2D()
    const commands = { shapes: 0, polygons: 0, lines: 0, ellipses: 0, texts: [] }
    const renderer = { stats: { backend: 'Canvas2D' }, submitShape(command) { commands.shapes++; if (command.shape === 'Polygon') commands.polygons++; if (command.shape === 'Line') commands.lines++; if (command.shape === 'Ellipse') commands.ellipses++; assert.ok(command.vertices.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) }, submitText(command) { commands.texts.push(command.text) } }
    const frameData = { mode: 0, lanes: 4, laneWidth: 1.6, judgeY: -3.5, time: 10, lines: [0, -3.5, 0, 1, 6.4], notes: [0, 0, -2.4, 1, 0, 4.5, 0, 1, 0, 0, 0, 1, 1, 1, .8, 3, 0, 6.5, 3, 2, 1, 0, 1, 1], types: [], errorBar: null, lanePress: [1, 0, 0, .5],
      effects: [{ x: -2.4, y: -3.5, age: .1, judgement: 1, rotation: 0 }], judgement: { judgement: 2, offsetMs: 30, age: .1 }, combo: 12, score: 523456, accuracy: .9734, progress: .4, status: 'playing', message: '', beatPulse: .5 }
    api.submitRhythmChart(renderer, component, { position: { x: 2, y: 1 }, rotation: .3, scale: { x: 1, y: 1 } }, frameData)
    observations.renderer = { shapes: commands.shapes, texts: commands.texts }
    assert.ok(commands.polygons >= 4 + 2 + 2 && commands.lines >= 5 && commands.ellipses >= 1, JSON.stringify(commands))
    for (const text of ['12', 'COMBO', 'GREAT', 'LATE', '0523456', '97.34%']) assert.ok(commands.texts.includes(text), `HUD shows ${text}`)
    const placeholder = { shapes: 0 }
    api.submitRhythmChart({ stats: { backend: 'WebGL2' }, submitShape() { placeholder.shapes++ }, submitText() {} }, component, { position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } }, null)
    assert.ok(placeholder.shapes >= 5, 'a placeholder lane field without a frame')
  })

  await check('the scene renderer draws RhythmChart2D and the editor exposes the chart tools', async () => {
    const sceneRenderer = await readFile(join(root, 'src/renderer/sceneRenderer.ts'), 'utf8')
    assert.ok(sceneRenderer.includes("getComponent<RhythmChart2D>('RhythmChart2D')") && sceneRenderer.includes('submitRhythmChart('), 'the scene renderer submits rhythm charts')
    const panel = await readFile(join(root, 'src/components/EditorBottomPanel.vue'), 'utf8')
    assert.ok(panel.includes('ChartEditorPanel'), 'the chart editor tab exists')
    const inspector = await readFile(join(root, 'src/components/ConfigPanel.vue'), 'utf8')
    assert.ok(inspector.includes('RhythmChartInspector') && inspector.includes("'RhythmChart2D'"), 'RhythmChart2D can be added and edited')
  })
} finally {
  await mkdir(join(root, '.cache', 'verify'), { recursive: true })
  await writeFile(join(root, '.cache', 'verify', 'rhythm-2646.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), results, observations }, null, 2)}\n`)
  await rm(out, { recursive: true, force: true })
}
const failed = results.filter(result => !result.ok)
console.log(`${results.length - failed.length}/${results.length} rhythm checks passed`)
if (failed.length) process.exit(1)
