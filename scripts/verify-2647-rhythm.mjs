/** 26.47 rhythm checks: the chart's own note types, the master timeline and the lean runtime.
 * - version 2 charts: note types (windows, weight, combo, timeout, hit area), size and data, tracks and
 *   triggers compile in the Rust core and round-trip through the TypeScript document; version 1 stays 1;
 * - the real GameplayRuntime: per-type windows and weights, custom notes reported as touches and judged by a
 *   script (rhythm_judge), untouched notes to avoid counted perfect, prefab notes placed, pooled and told
 *   their judgement (rhythm_my_note), tracks moving objects, the camera and post-processing and restoring
 *   them after a seek back, triggers once per pass, the picture offset, the error bar;
 * - the Rhythm Lab template: autoplay to 1,000,000 with stars, mines, timeline and triggers;
 * - the renderer draws note-type shapes and the error bar; the lean runtime skips the solver for scenes
 *   without physics and hashes state only for replays and networking.
 *
 * Usage: node scripts/verify-2647-rhythm.mjs (needs nova_core/pkg built from this source).
 * Results: .cache/verify/rhythm-2647.json */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { webcrypto } from 'node:crypto'
import { build } from 'vite'

const root = process.cwd()
const out = await mkdtemp(join(tmpdir(), 'nova-rhythm-2647-'))
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
    'src/store/physics.ts': 'physicsState, loadProject',
    'src/assets/AssetDatabase.ts': 'assetState',
    'src/assets/types.ts': 'defaultScriptMetadata',
    'src/world/BoxEntity.ts': 'BoxEntity',
    'src/world/components.ts': 'Script2D, RhythmChart2D, Camera2D, ShapeRenderer2D, RigidBody2D',
    'src/runtime/rhythmChartDocument.ts': 'normalizeChartDocument, serializeChartDocument, newChartDocument, defaultNoteType, chartNeedsVersion2',
    'src/runtime/rhythmOwner.ts': 'storeRhythmVisualOffset, storedRhythmVisualOffset',
    'src/projects/rhythmTemplateSong.ts': 'composePrismPulse, prismPulseChart, chartSource',
    'src/projects/templates.ts': 'createTemplateProject, createTemplateProjectJson, auditTemplateProject, PROJECT_TEMPLATES, PROJECT_TEMPLATE_CATEGORIES',
    'src/projects/templateDiscovery.ts': 'discoverTemplates',
    'src/editor/componentPalette.ts': 'componentPaletteMetadata, DEPRECATED_COMPONENTS, RHYTHM_FIRST_CATEGORIES',
    'src/renderer/rhythmFrames.ts': 'rhythmFrame',
    'src/renderer/rhythmRenderer.ts': 'submitRhythmChart',
    'src/renderer/postProcessOverrides.ts': 'clearScriptPostValues, applyScriptPostValues',
    'nova_core/pkg/nova_core.js': 'default as initWasm, WasmRuntimeWorld, WasmRhythmSession, rhythm_validate_chart'
  }
  const entry = join(out, 'entry.ts')
  await writeFile(entry, Object.entries(entries).map(([path, names]) => `export { ${names} } from '${join(root, path).replaceAll('\\', '/')}';`).join('\n'))
  await writeFile(join(out, 'package.json'), '{"type":"module"}\n')
  await build({ configFile: false, root, logLevel: 'error', ssr: { noExternal: true }, build: { ssr: true, outDir: join(out, 'build'), emptyOutDir: false, rollupOptions: { input: { rhythm: entry }, output: { entryFileNames: '[name].mjs' } } } })
  const api = await import(pathToFileURL(join(out, 'build', 'rhythm.mjs')).href)

  globalThis.window = Object.assign(new EventTarget(), { performance: globalThis.performance, setTimeout, clearTimeout })
  globalThis.document = Object.assign(new EventTarget(), { hidden: false, activeElement: null })
  globalThis.CustomEvent = class extends Event { constructor(name, options) { super(name); this.detail = options?.detail } }
  // A browser-like localStorage for the device offsets.
  const storage = new Map()
  globalThis.localStorage = { getItem: key => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) }
  await api.initWasm({ module_or_path: await readFile(join(root, 'nova_core/pkg/nova_core_bg.wasm')) })
  const declarations = await readFile(join(root, 'nova_core/pkg/nova_core.d.ts'), 'utf8')
  assert.ok(declarations.includes('take_touches') && declarations.includes('track_values'), 'nova_core/pkg is the 26.47 core (rebuild the WASM)')

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
  // Messages the rhythm owner logs (missing timeline targets, prefabs that cannot spawn).
  const rhythmLogs = []
  const rhythmPorts = runtime.rhythm.ports, rhythmLog = rhythmPorts.log
  rhythmPorts.log = (message, level) => { rhythmLogs.push(message); return rhythmLog(message, level) }
  const runtimeLog = () => rhythmLogs

  // ------------------------------------------------------------------ chart format version 2
  const TYPED = {
    format: 'nova-chart', version: 2, meta: { title: 'Typed', offsetMs: 0 }, mode: 'lanes', lanes: 4, tempo: [{ beat: 0, bpm: 120 }],
    noteTypes: [
      { id: 'star', name: 'Star', base: 'tap', weight: 2, windows: [20, 40, 60, 80], shape: 'circle', color: '#ffd76e' },
      { id: 'mine', name: 'Mine', base: 'custom', weight: 0, timeout: 'perfect', windows: [30, 60, 90, 110], shape: 'diamond', color: '#ff4f6a' },
      { id: 'gesture', name: 'Gesture', base: 'custom', shape: 'ring', color: '#9effa8' }
    ],
    notes: [
      { type: 'tap', beat: 4, lane: 0 }, { type: 'star', beat: 6, lane: 1 }, { type: 'mine', beat: 8, lane: 2 },
      { type: 'mine', beat: 10, lane: 3 }, { type: 'gesture', beat: 12, lane: 0, size: 1.5, data: { shape: 'circle', points: 3 } }
    ],
    tracks: [], triggers: []
  }

  await check('version 2 charts: note types, size, data, tracks and triggers compile in Rust and round-trip in TypeScript', () => {
    const source = JSON.stringify(TYPED)
    assert.equal(api.rhythm_validate_chart(source), '')
    const session = new api.WasmRhythmSession(source, new Float64Array([]))
    assert.equal(session.type_ids(), 'tap\nhold\ndrag\nflick\nstar\nmine\ngesture')
    const notes = session.notes()
    assert.equal(notes.length, 5 * 10, 'note list stride 10')
    assert.deepEqual([...notes].filter((_, index) => index % 10 === 8), [0, 4, 5, 5, 6], 'type index per note')
    assert.deepEqual([...notes].filter((_, index) => index % 10 === 9), [0, 1, 2, 3, 4], 'chart-file index per note')
    session.free()
    const document = api.normalizeChartDocument(TYPED)
    assert.equal(document.version, 2)
    assert.equal(document.noteTypes.length, 3)
    assert.deepEqual(document.notes.find(note => note.type === 'gesture').data, { shape: 'circle', points: 3 })
    const written = api.serializeChartDocument(document)
    assert.equal(api.serializeChartDocument(api.normalizeChartDocument(JSON.parse(written))), written, 'stable round trip')
    assert.equal(api.rhythm_validate_chart(written), '')
    assert.ok(written.split('\n').some(line => line.trim().startsWith('{ "id": "mine"')), 'one note type per line')
    // A chart without version 2 features is still written as version 1 (older engines read it).
    const plain = api.newChartDocument('lanes')
    plain.notes.push({ type: 'tap', beat: 1, lane: 0, line: 0, x: 0, side: 1, speed: 1 })
    assert.equal(JSON.parse(api.serializeChartDocument(plain)).version, 1)
    assert.match(api.rhythm_validate_chart(JSON.stringify({ ...TYPED, notes: [{ type: 'bomb', beat: 1, lane: 0 }] })), /unknown note type/)
    assert.throws(() => api.normalizeChartDocument({ format: 'nova-chart', version: 3 }), /version 3/)
  })

  // ------------------------------------------------------------------ note types in the runtime
  const JUDGE_SCRIPT = `fn on_signal(name, payload, source) {
  if name == "rhythm.touch" {
    if payload.type == "mine" { rhythm_judge(payload.note, "miss"); }
    if payload.type == "gesture" { rhythm_judge(payload.note, payload.offsetMs + 60.0); }
    signal_emit("probe.touch", #{ note: payload.note, type: payload.type, data: payload.data });
  }
}`

  await check('note types judge with their own windows and weights; scripts judge custom notes; untouched mines count perfect', () => {
    const script = scriptAsset('judge-script', JUDGE_SCRIPT)
    const { entity, component } = chartEntity(chartAsset('typed-chart', TYPED))
    const behaviour = entity.addComponent(new api.Script2D()); behaviour.scriptAsset = script
    start([cameraEntity(), entity])
    run(.2)
    assert.equal(component.state, 'playing', `${component.state} ${component.lastError ?? ''}`)
    const press = (code, time) => at(component, time, stamp => { key(code, true, stamp); key(code, false, stamp + 30) })
    press('KeyD', 2.0)     // tap, perfect
    press('KeyF', 3.05)    // star 50 ms late: good by its own windows (great by the component's)
    press('KeyJ', 4.0)     // mine pressed: the script judges a miss
    run(1.2)               // the second mine passes untouched
    press('KeyD', 6.02)    // gesture: the script judges offset + 60 ms → great
    run(1.5)
    assert.equal(entity.script2D.lastError ?? null, null, 'the judging script runs without errors')
    const hits = signals.filter(signal => signal.name === 'rhythm.hit').map(signal => [signal.payload.type, signal.payload.judgement, signal.payload.avoided])
    const misses = signals.filter(signal => signal.name === 'rhythm.miss').map(signal => signal.payload.type)
    observations.typedHits = { hits, misses }
    assert.deepEqual(hits, [['tap', 'perfect', false], ['star', 'good', false], ['mine', 'perfect', true], ['gesture', 'great', false]])
    assert.deepEqual(misses, ['mine'])
    const touches = signals.filter(signal => signal.name === 'probe.touch').map(signal => signal.payload)
    assert.deepEqual(touches.map(touch => touch.type), ['mine', 'gesture'], 'presses on custom notes reach the script')
    assert.deepEqual(touches[1].data, { shape: 'circle', points: 3 }, 'the note\'s data travels with it')
    // Weights: tap 1 + star 2 × 0.5 + gesture 0.8 of 4 → 70 %; combo notes 5, longest combo 2.
    assert.equal(component.runtimeScore, Math.round(900_000 * .7 + 100_000 * 2 / 5))
    assert.equal(component.runtimeMaxCombo, 2)
    stop()
  })

  await check('the picture offset moves the notes on screen but not the judgement; the error bar shows the hits', () => {
    api.storeRhythmVisualOffset(100)
    try {
      const chart = { format: 'nova-chart', version: 1, meta: { title: 'Visual' }, mode: 'lanes', lanes: 4, tempo: [{ beat: 0, bpm: 120 }], notes: [{ type: 'tap', beat: 8, lane: 0 }, { type: 'tap', beat: 10, lane: 1 }, { type: 'tap', beat: 12, lane: 2 }] }
      const { entity, component } = chartEntity(chartAsset('visual-chart', chart), value => { value.showErrorBar = true })
      start([cameraEntity(), entity])
      run(2)
      const frame = api.rhythmFrame(component.uuid)
      const time = frame.time, distance = frame.notes[5]
      // The first note (4 s) is drawn as it will be 100 ms from now: 8 units/s × (4 − (t + 0.1)).
      assert.ok(Math.abs(distance - component.scrollSpeed * (4 - (time + .1))) < 1e-6, `distance ${distance} at ${time}`)
      at(component, 4.0, stamp => { key('KeyD', true, stamp); key('KeyD', false, stamp + 20) })
      at(component, 5.03, stamp => { key('KeyF', true, stamp); key('KeyF', false, stamp + 20) })
      at(component, 5.98, stamp => { key('KeyJ', true, stamp); key('KeyJ', false, stamp + 20) })
      run(.2)
      const judged = signals.filter(signal => signal.name === 'rhythm.hit').map(signal => Math.round(signal.payload.offsetMs) + 0)
      assert.deepEqual(judged, [0, 30, -20], 'judged by the input time alone')
      const bar = api.rhythmFrame(component.uuid).errorBar
      assert.deepEqual(bar.windows, [45, 90, 135, 180])
      assert.deepEqual(bar.hits.map(hit => Math.round(hit.offsetMs) + 0), [0, 30, -20], 'every timed hit has a tick')
      stop()
    } finally { api.storeRhythmVisualOffset(0) }
  })

  // ------------------------------------------------------------------ the master timeline
  await check('timeline tracks move objects and the camera and restore them after a seek back; triggers fire once per pass', () => {
    const chart = { format: 'nova-chart', version: 2, meta: { title: 'Timeline' }, mode: 'lanes', lanes: 4, tempo: [{ beat: 0, bpm: 120 }],
      notes: [{ type: 'tap', beat: 30, lane: 0 }], noteTypes: [],
      tracks: [
        { target: 'Mover', property: 'x', events: [{ start: 4, end: 8, from: 0, to: 10, ease: 'linear' }] },
        { target: 'Mover', property: 'rotation', events: [{ start: 4, end: 8, from: 0, to: 90, ease: 'linear' }] },
        { target: 'camera', property: 'zoom', events: [{ start: 2, end: 4, from: 1, to: 2, ease: 'linear' }] },
        { target: 'post', property: 'bloom', events: [{ start: 2, end: 3, from: 0, to: .5, ease: 'linear' }] },
        { target: 'Nobody', property: 'x', events: [{ start: 0, end: 1, from: 0, to: 1, ease: 'linear' }] }
      ],
      triggers: [{ beat: 6, name: 'kick', value: 3 }, { beat: 9, name: 'snare', value: 1 }] }
    const { entity, component } = chartEntity(chartAsset('timeline-chart', chart), value => { value.botPlay = true })
    const mover = new api.BoxEntity(nextId++, { x: -3, y: 2 }, { x: 1, y: 1 }); mover.name = 'Mover'; mover.rigidBody.bodyType = 'Static'
    const camera = cameraEntity()
    start([camera, entity, mover])
    run(1.5)
    assert.equal(mover.transform.position.x, -3, 'before its first event a track leaves the object alone')
    while (component.runtimeSongTime < 3.0) frame()
    assert.ok(Math.abs(mover.transform.position.x - 10 * (component.runtimeSongTime + .0 - 2) / 2) < .4, `x follows the track: ${mover.transform.position.x} at ${component.runtimeSongTime}`)
    assert.ok(Math.abs(camera.camera2D.zoom - 2) < 1e-9, `camera zoom ${camera.camera2D.zoom}`)
    const post = api.applyScriptPostValues({ exposure: 0, contrast: 1, saturation: 1, vignette: 0, bloom: 0, blur: 0 })
    assert.ok(Math.abs(post.bloom - .5) < 1e-6, `bloom ${post.bloom}`)
    run(1.2)
    const fired = () => signals.filter(signal => signal.name === 'rhythm.trigger').map(signal => `${signal.payload.name}:${signal.payload.value}`)
    assert.deepEqual(fired(), ['kick:3'])
    assert.ok(signals.filter(signal => signal.name === 'rhythm.trigger').every(signal => signal.target === undefined || signal.target === ''), 'triggers reach every object')
    // Pause and resume (the clock goes back a second): no trigger fires twice.
    runtime.rhythm.command('', 'pause'); run(.3); runtime.rhythm.command('', 'resume'); run(2.5)
    assert.deepEqual(fired(), ['kick:3', 'snare:1'], 'after a pause the next trigger, not the same one again')
    assert.ok(Math.abs(mover.transform.position.x - 10) < 1e-6 && Math.abs(mover.transform.rotation - Math.PI / 2) < 1e-6, 'tracks hold their last value')
    // Seek back before the tracks: the object gets its own position again and the triggers fire again.
    runtime.rhythm.command('', 'seek', .5); run(.4)
    assert.ok(Math.abs(mover.transform.position.x + 3) < 1e-9 && Math.abs(mover.transform.rotation) < 1e-9, `restored: ${mover.transform.position.x}`)
    run(2.8)
    assert.deepEqual(fired(), ['kick:3', 'snare:1', 'kick:3'])
    assert.ok(runtimeLog().some(line => line.includes('no object named “Nobody”')), 'a missing target is reported once')
    stop()
    api.clearScriptPostValues()
  })

  // ------------------------------------------------------------------ the Rhythm Lab template
  await check('Rhythm Lab plays to 1,000,000 in autoplay: prefab stars, mines, the timeline and triggers', async () => {
    const projectJson = api.createTemplateProjectJson('rhythm-lab', 'Lab check')
    const project = JSON.parse(projectJson)
    assert.deepEqual(api.auditTemplateProject(project, 'rhythm-lab'), [])
    // Found in the 26.47 hand check: Retry left the last result on screen. Every rhythm starter clears it.
    for (const id of ['rhythm-lab', 'rhythm-lanes', 'rhythm-lines']) {
      const controller = JSON.parse(api.createTemplateProjectJson(id, 'Retry check')).assets.find(asset => asset.assetType === 'script' && asset.source?.includes('input_pressed("Retry")'))
      assert.ok(/input_pressed\("Retry"\)[^\n]*find_entity_handle\("Result Text"\), ""\)/.test(controller?.source ?? ''), `${id}: Retry clears the result text`)
    }
    // A probe in the star prefab's script: the object reads its own note and reports its judgement.
    const star = project.assets.find(asset => asset.name === 'StarNote.rhai')
    star.source = star.source.replace('fn on_signal(name, payload, source) {', 'fn on_signal(name, payload, source) {\n  if name == "rhythm.note_hit" { let n = rhythm_my_note(); signal_emit("probe.star", #{ id: if n == () { -1 } else { n.id }, type: if n == () { "" } else { n.type }, judgement: payload.judgement }); }')
    runtime.stopSession(false)
    api.loadProject(JSON.stringify(project))
    const chartObject = world.entities.find(item => item.name === 'Rhythm Chart'), component = chartObject.getComponent('RhythmChart2D')
    component.botPlay = true; component.hitSound = false
    const prism = world.entities.find(item => item.name === 'Prism'), cameraObject = world.entities.find(item => item.camera2D)
    const authored = { rotation: prism.transform.rotation, zoom: cameraObject.camera2D.zoom }
    api.physicsState.playMode = 'playing'; signals.length = 0
    runtime.beginSession()
    // The song is decoded asynchronously (without Web Audio the chart then plays on the silent clock).
    for (let step = 0; step < 10 && component.state !== 'playing'; step++) { frame(); await flush() }
    run(.3)
    assert.equal(component.state, 'playing', `${component.state} ${component.lastError ?? ''}`)
    const chart = JSON.parse(api.assetState.records.find(asset => asset.assetType === 'chart').source)
    let starsSeen = 0, zoomInDrop = 0, prismTurns = 0, opacityInDrop = 0
    while (component.state !== 'finished' && component.runtimeSongTime < 60) {
      frame()
      const time = component.runtimeSongTime
      if (time > 20 && time < 21) {
        const roots = world.entities.filter(item => item.name === 'Star Note' && item.enabled)
        starsSeen = Math.max(starsSeen, roots.length)
        // Each star's spinning core is its child and sits on it.
        for (const root of roots) {
          const core = world.entities.find(item => item.name === 'Star Core' && item.parentUuid === root.uuid)
          assert.ok(core, `the star ${root.uuid} has its core as a child (cores: ${world.entities.filter(item => item.name === 'Star Core').map(item => item.parentUuid).join(', ')})`)
          assert.ok(core.enabled, 'the core is shown with its star')
          const point = world.entities.find(item => item.name === 'Star Point' && item.parentUuid === core.uuid)
          assert.ok(point?.enabled, `the core ${core.uuid} has its point as a child (points: ${world.entities.filter(item => item.name === 'Star Point').map(item => `${item.parentUuid}:${item.enabled}`).join(', ')})`)
        }
        zoomInDrop = cameraObject.camera2D.zoom; prismTurns = prism.transform.rotation; opacityInDrop = prism.getComponent('ShapeRenderer2D').opacity
      }
    }
    assert.equal(component.state, 'finished')
    assert.equal(component.runtimeScore, 1_000_000, `score ${component.runtimeScore}`)
    const starNotes = chart.notes.filter(note => note.type === 'star').length, mines = chart.notes.filter(note => note.type === 'mine').length
    const hits = signals.filter(signal => signal.name === 'rhythm.hit')
    assert.equal(hits.filter(signal => signal.payload.type === 'star').length, starNotes)
    assert.equal(hits.filter(signal => signal.payload.type === 'mine' && signal.payload.avoided).length, mines)
    const probes = signals.filter(signal => signal.name === 'probe.star')
    assert.equal(probes.length, starNotes, 'every star object heard its own judgement')
    assert.ok(probes.every(signal => signal.payload.type === 'star' && signal.payload.id >= 0 && signal.payload.judgement === 'perfect'), JSON.stringify(probes.slice(0, 2)))
    assert.deepEqual(signals.filter(signal => signal.name === 'rhythm.trigger').map(signal => signal.payload.name), ['verse', 'drop', 'outro'])
    assert.ok(starsSeen >= 1 && starsSeen <= 6, `star objects on screen in the drop: ${starsSeen}`)
    assert.ok(Math.abs(zoomInDrop - 1.14) < 1e-6, `camera zoom in the drop ${zoomInDrop}`)
    assert.ok(prismTurns * 180 / Math.PI > 45 && prismTurns * 180 / Math.PI < 405, `prism rotation ${prismTurns}`)
    assert.ok(opacityInDrop > 80, `prism opacity ${opacityInDrop}`)
    const pooled = world.entities.filter(item => item.name === 'Star Note')
    assert.ok(pooled.length <= 8 && pooled.every(item => !item.enabled), `star objects are pooled and hidden at the end (${pooled.length})`)
    observations.lab = { notes: chart.notes.length, stars: starNotes, mines, starObjects: pooled.length, starsSeen, zoomInDrop, authored }
    runtime.stopSession(false)
  })

  // ------------------------------------------------------------------ renderer
  await check('the renderer draws note-type shapes and colours, leaves prefab-only types to their prefab, and draws the error bar', () => {
    const component = new api.RhythmChart2D()
    const commands = { polygons: [], ellipses: 0, lines: 0 }
    const renderer = { stats: { backend: 'Canvas2D' }, submitShape(command) { if (command.shape === 'Polygon') commands.polygons.push(command); if (command.shape === 'Ellipse') commands.ellipses++; if (command.shape === 'Line') commands.lines++ }, submitText() {} }
    const types = [null, null, null, null].map(() => ({ shape: 'bar', color: null, scale: 1, hidden: false }))
    types.push({ shape: 'diamond', color: { r: 255, g: 79, b: 106 }, scale: 1, hidden: false }, { shape: 'none', color: null, scale: 1, hidden: true }, { shape: 'circle', color: { r: 10, g: 200, b: 10 }, scale: 2, hidden: false })
    const note = (type, x) => [0, 4, x, 1, 0, 4.5, 0, 0, 0, 0, type, 1]
    const base = { mode: 0, lanes: 4, laneWidth: 1.6, judgeY: -3.5, time: 1, lines: [0, -3.5, 0, 1, 6.4], lanePress: [0, 0, 0, 0], effects: [], judgement: null, combo: 0, score: 0, accuracy: 1, progress: .1, status: 'playing', message: '', beatPulse: 0, types }
    api.submitRhythmChart(renderer, component, { position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } }, { ...base, notes: [...note(4, -1), ...note(5, 0), ...note(6, 1)], errorBar: null })
    const diamond = commands.polygons.filter(command => command.vertices.length === 4 && command.fill.r === 255 && command.fill.g === 79)
    assert.equal(diamond.length, 1, 'the mine is a red diamond')
    assert.equal(commands.ellipses, 1, 'the circle type is an ellipse; the prefab-only type draws nothing')
    const before = commands.lines
    api.submitRhythmChart(renderer, component, { position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } }, { ...base, notes: [], errorBar: { windows: [45, 90, 135, 180], hits: [{ offsetMs: 30, judgement: 2, age: .1 }, { offsetMs: -12, judgement: 1, age: 1 }] } })
    assert.ok(commands.lines - before >= 3, 'error bar centre and two ticks')
  })

  // ------------------------------------------------------------------ lean runtime
  await check('scenes without physics skip the solver; the state checksum is computed only for replays', () => {
    const { entity } = chartEntity(chartAsset('lean-chart', { format: 'nova-chart', version: 1, mode: 'lanes', lanes: 4, tempo: [{ beat: 0, bpm: 120 }], notes: [{ type: 'tap', beat: 20, lane: 0 }] }))
    // The chart object of the harness is a BoxEntity; a rhythm scene's objects have no RigidBody2D.
    for (const item of [entity]) item.removeComponent?.('RigidBody2D')
    const original = world.stateChecksum.bind(world)
    let hashes = 0
    world.stateChecksum = () => { hashes++; return original() }
    try {
      const camera = cameraEntity(); camera.removeComponent?.('RigidBody2D')
      start([camera, entity])
      run(1)
      observations.lean = { idleFrames: world.physicsIdleFrames, idle: world.physicsIdle(), hashes }
      assert.ok(world.physicsIdle(), 'no rigid body in the scene')
      assert.ok(world.physicsIdleFrames >= 55, `idle frames ${world.physicsIdleFrames}`)
      assert.equal(hashes, 0, 'no checksum without a replay or a network session')
      runtime.replay.startReplayRecording('{}', 60)
      run(.5)
      assert.ok(hashes >= 25, `a recording hashes every fixed step (${hashes})`)
      runtime.replay.stopReplay()
      stop()
      // A scene with a falling body still steps the solver.
      const body = new api.BoxEntity(nextId++, { x: 0, y: 5 }, { x: 1, y: 1 }); body.name = 'Falling'; body.rigidBody.bodyType = 'Dynamic'
      api.physicsState.globalSettings.gravity = 9.8
      start([cameraEntity(), body])
      run(.5)
      assert.equal(world.physicsIdle(), false)
      assert.ok(body.transform.position.y < 4.5, `the body falls: ${body.transform.position.y}`)
      stop()
    } finally { world.stateChecksum = original }
  })

  await check('the editor lists rhythm components and templates first and hides deprecated components', () => {
    assert.equal(api.componentPaletteMetadata('RhythmChart2D').category, 'Rhythm')
    assert.equal(api.RHYTHM_FIRST_CATEGORIES[0], 'Rhythm')
    for (const kind of ['WorldChunk2D', 'Portal2D', 'NavigationAgent2D', 'BehaviorTree2D']) assert.equal(api.componentPaletteMetadata(kind).compatibility, 'Deprecated', kind)
    assert.equal(api.componentPaletteMetadata('RigidBody2D').compatibility, 'Stable', 'physics stays available')
    assert.equal(api.PROJECT_TEMPLATE_CATEGORIES[0], 'rhythm')
    const ordered = api.discoverTemplates(api.PROJECT_TEMPLATES, { category: 'all', difficulty: 'all', query: '', sort: 'catalog', locale: 'en' }, template => template.name).map(template => template.id)
    assert.deepEqual(ordered.slice(0, 3), ['rhythm-lab', 'rhythm-lanes', 'rhythm-lines'])
    const firstClassic = ordered.findIndex(id => api.PROJECT_TEMPLATES.find(template => template.id === id).classic)
    assert.ok(firstClassic > 3 && ordered.slice(firstClassic).every(id => api.PROJECT_TEMPLATES.find(template => template.id === id).classic), 'classic examples come last')
    assert.ok(api.PROJECT_TEMPLATES.find(template => template.id === 'snake').classic && !api.PROJECT_TEMPLATES.find(template => template.id === 'reflex-lab').classic)
    observations.templates = { total: ordered.length, classic: ordered.length - firstClassic }
  })
} finally {
  await mkdir(join(root, '.cache', 'verify'), { recursive: true })
  await writeFile(join(root, '.cache', 'verify', 'rhythm-2647.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), results, observations }, null, 2)}\n`)
  await rm(out, { recursive: true, force: true })
}
const failed = results.filter(result => !result.ok)
console.log(`${results.length - failed.length}/${results.length} rhythm checks passed`)
if (failed.length) process.exit(1)
