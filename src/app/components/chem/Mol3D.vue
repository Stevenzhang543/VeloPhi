<script setup lang="ts">
/**
 * 三维查看器 — molecules, crystals and orbitals in three dimensions (26.64, D271). The component edits nothing and
 * computes nothing: positions, shapes, lone pairs, dipoles, cells, polyhedra, clouds and every measured value come
 * from the core (engine/mol.ts); the picture is drawn by render/mol3d (WebGL2, Canvas 2D where there is none).
 *
 * Give it ONE of `molecule`, `crystal` (with `expand` and `polyhedron`) or `orbital`. `static` draws one still
 * picture into a small canvas and holds no WebGL context: use it in lists and cards (a page may hold only a few live
 * contexts). A live viewer holds one context while it is on screen and gives it back when it scrolls away, when its
 * page is not `active`, when the window is hidden and when it unmounts.
 *
 * Mouse: drag turns, Shift-drag (or the right button) moves, the wheel zooms, a double click resets. Touch: one
 * finger turns, two fingers zoom, move and twist, a double tap resets. Keyboard (focus on the picture): arrow keys
 * turn, + and − zoom, Home resets, Esc leaves the measuring tool. With the measuring tool, pick two atoms for a
 * distance, three for an angle (at the second), four for a dihedral.
 *
 * The bar holds at most seven controls (D243); everything else is under 更多.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { msgText, tl } from '../../../i18n'
import { T } from '../../../content/models/types'
import { T3 } from '../../models/labels'
import { MessageError } from '../../../i18n/message'
import { state } from '../../store'
import { calmMotion, settings, sysEnv } from '../../settings'
import { saveFile } from '../../../platform/files'
import type { CrystalSpec, ElementOverrides, MolMeasurement } from '../../../engine/mol'
import { molMeasure } from '../../../engine/mol'
import type { Camera } from '../../../render/mol3d/camera'
import { Trackball, cloneCamera, defaultCamera } from '../../../render/mol3d/camera'
import { MolRenderer, supersampling, webgl2Supported } from '../../../render/mol3d/gl'
import { drawFallback } from '../../../render/mol3d/fallback2d'
import { LABEL_LIMIT, drawOverlay } from '../../../render/mol3d/labels'
import type { MolPalette } from '../../../render/mol3d/palette'
import { molPalette, parseCss } from '../../../render/mol3d/palette'
import { pickAtom } from '../../../render/mol3d/pick'
import type { MolStyle, Scene, SceneInput } from '../../../render/mol3d/scene'
import { buildScene } from '../../../render/mol3d/scene'
import type { Mol3DSource, MoleculeSource, OrbitalSource, SourceResult } from '../../../render/mol3d/source'
import { SourceError, homeCamera, resolveSource } from '../../../render/mol3d/source'
import { renderThumbnail } from '../../../render/mol3d/thumbnail'
import Icon from '../Icon.vue'
import ScopeTrace from '../decor/ScopeTrace.vue'
import { orbitalName, centreText, diagnosticText, dipoleText, fixed, geometryName, measurementBadge, measurementText, polyhedronName } from './mol3dText'

const props = withDefaults(defineProps<{
  molecule?: MoleculeSource | null
  crystal?: CrystalSpec | null
  /** Cells along a, b and c of a crystal. */
  expand?: [number, number, number]
  /** Show a coordination polyhedron: of the atom nearest the middle (true) or of a given atom of the block. */
  polyhedron?: boolean | number
  orbital?: OrbitalSource | null
  /** The style to start with. */
  mode?: MolStyle
  /** One still picture, no interaction, no WebGL context of its own. */
  static?: boolean
  /** Side of a static picture in CSS pixels (0: the size of the element). */
  size?: number
  /** The page is still fetching the data. */
  loading?: boolean
  /** The page could not get the data: the text to show. */
  error?: string
  /** False while the page the viewer is on is not shown. */
  active?: boolean
  /** Element properties from the encyclopedia's data, handed on to the core. */
  elements?: ElementOverrides
  /** What is shown, for assistive technology and the exported file's name. */
  label?: string
  /** How a molecule's geometry was obtained (`method` of its record): said under the picture for `vsepr` and `literature`. */
  method?: string
}>(), { method: '',  molecule: null, crystal: null, expand: () => [1, 1, 1] as [number, number, number], polyhedron: false, orbital: null, mode: 'ball', static: false, size: 0, loading: false, error: '', active: true, elements: undefined, label: '' })

const emit = defineEmits<{
  /** What the core computed for the source (null: nothing to show). */
  data: [result: SourceResult | null]
  /** A measurement was made or cleared. */
  measure: [value: MolMeasurement | null]
}>()

// ---- What is shown ----

const style = ref<MolStyle>(props.mode)
const showLabels = ref(false)
const showLonePairs = ref(false)
const showDipole = ref(false)
const showPolarity = ref(false)
const showFrame = ref(true)
const showPolyhedron = ref(props.polyhedron !== false)
const showSigns = ref(true)
const perspective = ref(true)
const cells = ref<[number, number, number]>([...props.expand] as [number, number, number])
const measuring = ref(false)
const selection = ref<number[]>([])
const measurement = ref<MolMeasurement | null>(null)
/** The atom whose geometry the caption describes (picked outside the measuring tool). */
const focus = ref(-1)
const menu = ref(false)
const problem = ref('')
const fallback = ref(false)
const result = shallowRef<SourceResult | null>(null)
const atomCount = ref(0)

watch(() => props.mode, m => { style.value = m })
watch(() => props.expand, e => { cells.value = [...e] as [number, number, number] })
watch(() => props.polyhedron, p => { showPolyhedron.value = p !== false })

const kind = computed(() => (props.molecule ? 'molecule' : props.crystal ? 'crystal' : props.orbital ? 'orbital' : null))
const source = computed<Mol3DSource | null>(() => {
  if (props.molecule) return { kind: 'molecule', molecule: props.molecule }
  // The polyhedron is always asked for: switching it on is then only a matter of drawing it
  if (props.crystal) return { kind: 'crystal', crystal: props.crystal, expand: cells.value, polyhedron: typeof props.polyhedron === 'number' ? props.polyhedron : 'auto' }
  if (props.orbital) return { kind: 'orbital', orbital: props.orbital }
  return null
})
const phase = computed(() => (props.error || problem.value ? 'error' : props.loading ? 'loading' : !source.value ? 'empty' : 'ready'))

const STYLES: Array<{ id: MolStyle; label: () => string }> = [
  { id: 'ball', label: () => tl('球棍') },
  { id: 'space', label: () => tl('比例') },
  // 线框 already names the conducting loop of the induction experiments, with other translations
  { id: 'wire', label: () => T3(T('线框', 'Wireframe', 'Drahtmodell')) }
]

// ---- The picture (kept out of Vue's reactivity: typed arrays and a GL context) ----

const root = ref<HTMLElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const glCanvas = ref<HTMLCanvasElement | null>(null)
const overlay = ref<HTMLCanvasElement | null>(null)
const still = ref<HTMLCanvasElement | null>(null)
/** A new canvas element for every context: one that has lost its context is not reused. */
const glKey = ref(0)
const onScreen = ref(false)

let input: SceneInput | null = null
let scene: Scene | null = null
let renderer: MolRenderer | null = null
let palette: MolPalette = molPalette('light')
const camera: Camera = defaultCamera()
let home: Camera = defaultCamera()
let view = { width: 0, height: 0 }
let hover = -1
let raf = 0
let resizeObserver: ResizeObserver | null = null
let intersection: IntersectionObserver | null = null
/** Resolution used while the picture moves, lowered when frames come late; a still picture is always drawn in full. */
let motionScale = 1
let lastMotionPaint = 0
let lateFrames = 0
let refine = 0

const trackball = new Trackball(camera, {
  viewport: () => view,
  calm: calmMotion,
  home: () => home,
  onChange: () => requestDraw(),
  onTap: (x, y) => tap(x, y),
  // Inside a scrolling page the wheel belongs to the page until the picture has been clicked
  wheel: () => !!stage.value && (document.activeElement === stage.value || !scrolls(stage.value)),
  onHover: (x, y) => {
    if (!scene || !measuring.value) return
    const i = pickAtom(camera, view, x, y, scene.atoms, 4)
    if (i !== hover) { hover = i; requestDraw() }
  }
})

/** True when an ancestor of `el` scrolls vertically. */
function scrolls(el: HTMLElement): boolean {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.scrollHeight > p.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(p).overflowY)) return true
  }
  return false
}

function readPalette() {
  const el = root.value
  const cs = el && typeof getComputedStyle === 'function' ? getComputedStyle(el) : null
  const token = (name: string) => (cs ? parseCss(cs.getPropertyValue(name)) ?? undefined : undefined)
  palette = molPalette(state.theme, { bg: token('--canvas-bg'), text: token('--text'), textMuted: token('--text-2'), accent: token('--accent') })
}

function describe(e: unknown): string {
  if (e instanceof SourceError) return diagnosticText({ code: e.code, severity: 'unmodelled', params: e.params }) || e.code
  if (e instanceof MessageError) return msgText(e.msg)
  return e instanceof Error ? e.message : String(e)
}

/** Ask the core for the source's data; `fit`: start from the scene's own view. */
function resolve() {
  const src = source.value
  problem.value = ''
  selection.value = []
  setMeasurement(null)
  focus.value = -1
  hover = -1
  input = null
  if (src) {
    try {
      const r = resolveSource(src, props.elements)
      input = r.input
      result.value = r.result
    } catch (e) {
      problem.value = describe(e)
    }
  }
  if (!input) result.value = null
  emit('data', result.value)
  rebuild(true)
}

function sceneOptions() {
  const r = result.value
  const d = r?.kind === 'molecule' ? r.shape.dipole : null
  return {
    style: style.value, lonePairs: showLonePairs.value, dipole: showDipole.value, polarity: showPolarity.value, frame: showFrame.value, polyhedron: showPolyhedron.value, signs: showSigns.value,
    dipoleText: d ? dipoleText(d.magnitude, d.source === 'bonds') : undefined
  }
}

/** Build the draw lists again (new data, another style, another theme); `fit` puts the camera back to the start. */
function rebuild(fit: boolean) {
  if (!input) {
    // Nothing to draw: the state panel covers the picture
    scene = null
    atomCount.value = 0
    return
  }
  scene = buildScene(input, sceneOptions(), palette)
  atomCount.value = scene.atoms.length
  renderer?.setScene(scene)
  motionScale = 1
  refit(fit)
  if (props.static) drawStill()
  else requestDraw()
}

/** The camera's start for the current scene and view size; the user's turn and zoom are kept unless `jump`. */
function refit(jump: boolean) {
  if (!scene) return
  const vp = view.width > 0 && view.height > 0 ? view : { width: 320, height: 320 }
  const before = home
  home = homeCamera(scene, vp, !perspective.value)
  trackball.stop()
  if (jump) Object.assign(camera, cloneCamera(home))
  else {
    // Same turn and the same relative zoom around the new start
    camera.distance *= home.distance / before.distance
    camera.ortho = home.ortho
  }
}

function requestDraw() {
  if (props.static || raf) return
  raf = requestAnimationFrame(paint)
}

function overlayState() {
  const m = measurement.value
  return {
    labels: showLabels.value, selection: selection.value, hover: measuring.value ? hover : -1,
    measurement: m ? { atoms: selection.value.slice(0, m.atoms.length), text: measurementBadge(m) } : null,
    fontScale: settings.projector ? 1.4 : 1
  }
}

function paint(now: number) {
  raf = 0
  const o = overlay.value
  if (!o || !scene || view.width < 2 || view.height < 2 || phase.value !== 'ready') return
  // A context is on its way: the first picture is the real one, not the stand-in
  if (!renderer && !fallback.value) return
  const dpr = window.devicePixelRatio || 1
  const moving = trackball.moving || trackball.dragging
  // Late frames while turning: lower the resolution of moving pictures, never of the picture at rest
  if (moving) {
    if (lastMotionPaint && now - lastMotionPaint > 26 && now - lastMotionPaint < 200) lateFrames++
    else lateFrames = Math.max(0, lateFrames - 1)
    if (lateFrames >= 6 && motionScale > 0.5) { motionScale = Math.max(0.5, motionScale * 0.8); lateFrames = 0 }
    lastMotionPaint = now
    clearTimeout(refine)
    if (motionScale < 1) refine = window.setTimeout(requestDraw, 180)
  } else lastMotionPaint = 0
  if (o.width !== Math.round(view.width * dpr) || o.height !== Math.round(view.height * dpr)) { o.width = Math.round(view.width * dpr); o.height = Math.round(view.height * dpr) }
  const ctx = o.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, view.width, view.height)
  const ratio = dpr * supersampling(view.width, view.height, dpr) * (moving ? motionScale : 1)
  const drawn = !!renderer && renderer.render(camera, view, ratio, palette)
  if (!drawn) drawFallback(ctx, scene, camera, view, palette)
  drawOverlay(ctx, scene, camera, view, palette, overlayState())
}

/** The still picture of `static`. */
function drawStill() {
  const c = still.value
  if (!c || !input) return
  const w = props.size || c.clientWidth || 160, h = props.size || c.clientHeight || w
  try {
    renderThumbnail(input, w, { target: c, height: h, palette, options: { ...sceneOptions(), frame: showFrame.value } })
  } catch (e) {
    problem.value = describe(e)
  }
}

// ---- The WebGL context: held only while the viewer can be seen ----

const live = computed(() => !props.static && props.active && onScreen.value && !sysEnv.hidden && phase.value === 'ready')

async function acquire() {
  if (renderer || props.static) return
  if (!webgl2Supported()) { fallback.value = true; requestDraw(); return }
  glKey.value++
  await nextTick()
  const c = glCanvas.value
  if (!c || !live.value || renderer) return
  const r = new MolRenderer(c)
  if (!r.ready) { r.dispose(); fallback.value = true; requestDraw(); return }
  r.onLost = () => { fallback.value = true; requestDraw() }
  r.onRestored = () => { fallback.value = false; requestDraw() }
  renderer = r
  fallback.value = false
  if (scene) r.setScene(scene)
  requestDraw()
}

function release() {
  renderer?.dispose()
  renderer = null
}

watch(live, on => { if (on) void acquire(); else release() })

// ---- Picking and measuring ----

function setMeasurement(m: MolMeasurement | null) {
  measurement.value = m
  emit('measure', m)
}

function tap(x: number, y: number) {
  if (!scene) return
  const i = pickAtom(camera, view, x, y, scene.atoms, 6)
  if (!measuring.value) {
    focus.value = i
    return
  }
  if (i < 0) return
  const sel = selection.value
  // The atom picked last, picked again, is taken back; a fifth atom starts a new measurement
  if (sel.length && sel[sel.length - 1] === i) selection.value = sel.slice(0, -1)
  else if (sel.includes(i)) return
  else selection.value = sel.length >= 4 ? [i] : [...sel, i]
  measure()
  requestDraw()
}

/** The value of the picked atoms, from the core. */
function measure() {
  const sel = selection.value
  if (!scene || sel.length < 2) { setMeasurement(null); return }
  try {
    setMeasurement(molMeasure(sel.flatMap(i => scene!.atoms[i].pos)))
  } catch (e) {
    setMeasurement(null)
    problem.value = describe(e)
  }
}

function toggleMeasure() {
  measuring.value = !measuring.value
  if (!measuring.value) leaveMeasure()
  else focus.value = -1
}

function leaveMeasure() {
  measuring.value = false
  selection.value = []
  hover = -1
  setMeasurement(null)
  requestDraw()
}

// ---- Bar, menu, keyboard ----

function reset() {
  trackball.home()
}

function stepCells(d: number) {
  const n = Math.min(8, Math.max(1, cells.value[0] + d))
  cells.value = [n, n, n]
}

function onKey(e: KeyboardEvent) {
  if (e.altKey || e.ctrlKey || e.metaKey) return
  const turn = Math.PI / 12
  switch (e.key) {
    case 'ArrowLeft': trackball.nudge(-turn, 0); break
    case 'ArrowRight': trackball.nudge(turn, 0); break
    case 'ArrowUp': trackball.nudge(0, -turn); break
    case 'ArrowDown': trackball.nudge(0, turn); break
    case '+': case '=': trackball.zoom(0.85); break
    case '-': case '_': trackball.zoom(1 / 0.85); break
    case 'Home': reset(); break
    case 'Escape':
      if (menu.value) menu.value = false
      else if (measuring.value) leaveMeasure()
      else return
      break
    default: return
  }
  e.preventDefault()
  e.stopPropagation()
}

function closeMenuOutside(e: PointerEvent) {
  if (menu.value && !(e.target as Element | null)?.closest?.('.more')) menu.value = false
}

/** The picture with its labels as PNG bytes, at twice the size shown (at least). */
async function pngBytes(): Promise<Uint8Array> {
  if (!scene) throw new Error(tl('没有可导出的画面'))
  const dpr = window.devicePixelRatio || 1
  const scale = Math.max(2, dpr)
  const vp = view.width > 1 ? view : { width: 480, height: 360 }
  const out = document.createElement('canvas')
  out.width = Math.round(vp.width * scale)
  out.height = Math.round(vp.height * scale)
  const ctx = out.getContext('2d')!
  // Supersampled as far as the drawing buffer allows, then scaled down into the file
  const ss = Math.max(1, Math.min(2, 8000 / (Math.max(vp.width, vp.height) * scale)))
  if (renderer && renderer.render(camera, vp, scale * ss, palette)) {
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(renderer.canvas as HTMLCanvasElement, 0, 0, out.width, out.height)
  } else {
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    drawFallback(ctx, scene, camera, vp, palette)
  }
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  drawOverlay(ctx, scene, camera, vp, palette, overlayState())
  const blob = await new Promise<Blob | null>(done => out.toBlob(done, 'image/png'))
  // The screen's own resolution again
  requestDraw()
  if (!blob) throw new Error(tl('PNG 编码失败'))
  return new Uint8Array(await blob.arrayBuffer())
}

async function exportPng() {
  menu.value = false
  try {
    const name = (props.label || tl('三维结构')).replace(/[\\/:*?"<>|]+/g, '_')
    await saveFile(await pngBytes(), `${name}.png`, [{ name: tl('PNG 图片'), extensions: ['png'] }])
  } catch (e) {
    problem.value = describe(e)
  }
}

/**
 * Frame time of the current scene: the picture is turned `frames` times and each frame waits for the GPU. For the
 * performance record (not used by the interface).
 */
function benchmark(frames = 60): { mean: number; p95: number; atoms: number; pixels: number; adapter: string; webgl: boolean } {
  const times: number[] = []
  const dpr = window.devicePixelRatio || 1
  const ratio = dpr * supersampling(view.width, view.height, dpr)
  const ctx = overlay.value?.getContext('2d')
  for (let k = 0; k < frames && scene; k++) {
    trackball.nudge(0.05, 0.02)
    const t0 = performance.now()
    if (renderer && renderer.render(camera, view, ratio, palette, true)) times.push(renderer.frameMs)
    else if (ctx) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawFallback(ctx, scene, camera, view, palette); times.push(performance.now() - t0) }
  }
  times.sort((a, b) => a - b)
  const mean = times.reduce((s, t) => s + t, 0) / Math.max(1, times.length)
  return { mean, p95: times[Math.min(times.length - 1, Math.floor(times.length * 0.95))] ?? 0, atoms: scene?.atoms.length ?? 0, pixels: Math.round(view.width * ratio) * Math.round(view.height * ratio), adapter: renderer?.adapter() ?? '', webgl: !!renderer }
}

defineExpose({ reset, exportPng, pngBytes, benchmark })

// ---- Captions ----

const caption = computed(() => {
  const r = result.value
  if (!r) return ''
  if (r.kind === 'molecule') {
    const s = r.shape
    const picked = focus.value >= 0 ? s.centres.find(c => c.atom === focus.value) : undefined
    const c = picked ?? (s.main !== null ? s.centres[s.main] : undefined)
    if (c) return (picked || s.centres.length > 1 ? `${c.element}: ` : '') + centreText(c)
    return geometryName(s.geometry)
  }
  if (r.kind === 'crystal') {
    const b = r.build
    const parts: string[] = []
    if (showPolyhedron.value && b.polyhedron) parts.push(tl('{0} 的配位数 {1}', [b.polyhedron.element, b.polyhedron.number]) + (b.polyhedron.shape ? ` · ${polyhedronName(b.polyhedron.shape)}` : ''))
    parts.push(`ρ = ${fixed(b.density, 3)} g/cm³`)
    if (b.packing !== null) parts.push(tl('堆积率 {0} %', [fixed(b.packing * 100, 1)]))
    return parts.join(' · ')
  }
  const o = r.sample
  return tl('{0} 轨道 · 径向节面 {1} 个，角向节面 {2} 个', [orbitalName(o.subshell, o.key), o.radialNodes, o.angularNodes])
})

const readout = computed(() => {
  if (!measuring.value) return ''
  const m = measurement.value
  if (!m || !scene) return tl('点两个原子量距离，三个量键角，四个量二面角')
  return measurementText(m, selection.value.slice(0, m.atoms.length).map(i => scene!.atoms[i]?.element ?? ''))
})

const notes = computed(() => {
  const r = result.value
  if (!r || r.kind === 'orbital') return []
  const list = r.kind === 'molecule' ? r.shape.diagnostics : r.build.diagnostics
  // The estimate's caveat only while the dipole is shown; the others always
  const origin = r.kind === 'molecule' ? (props.method === 'vsepr' ? [tl('构型由价层电子对互斥模型生成，键角是理想值。')] : props.method === 'literature' ? [tl('构型取自文献的实测键长与键角。')] : []) : []
  return [...origin, ...list.filter(d => (d.code === 'mol.dipoleEstimated' || d.code === 'mol.dipoleIncomplete' || d.code === 'mol.dipoleOfIon' ? showDipole.value : d.code !== 'mol.geometryDiffers' || focus.value >= 0)).map(diagnosticText).filter(Boolean)].slice(0, 3)
})

const manyAtoms = computed(() => atomCount.value > LABEL_LIMIT)
const ariaLabel = computed(() => (props.label ? tl('{0} 的三维结构', [props.label]) : tl('三维结构')))

// ---- Life cycle ----

watch(source, resolve)
watch(() => props.elements, resolve)
watch([style, showLonePairs, showDipole, showPolarity, showFrame, showPolyhedron, showSigns], () => rebuild(false))
watch([showLabels, measuring, selection], requestDraw)
watch(perspective, () => { refit(false); requestDraw() })
watch(() => [state.theme, settings.projector], async () => {
  // The tokens change with the classes on <html>: read them after the styles have been applied
  await nextTick()
  readPalette()
  rebuild(false)
})
watch(phase, p => { if (p === 'ready') { if (props.static) void nextTick(drawStill); else requestDraw() } })

function measureStage() {
  const el = props.static ? still.value : stage.value
  if (!el) return
  const w = el.clientWidth, h = el.clientHeight
  if (w === view.width && h === view.height) return
  view = { width: w, height: h }
  if (props.static) { drawStill(); return }
  refit(false)
  requestDraw()
}

onMounted(() => {
  readPalette()
  measureStage()
  resolve()
  const el = props.static ? still.value : stage.value
  if (el && typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(measureStage)
    resizeObserver.observe(el)
  }
  if (!props.static) {
    if (stage.value) trackball.attach(stage.value)
    if (root.value && typeof IntersectionObserver === 'function') {
      intersection = new IntersectionObserver(entries => { onScreen.value = entries.some(e => e.isIntersecting) })
      intersection.observe(root.value)
    } else onScreen.value = true
    window.addEventListener('pointerdown', closeMenuOutside, true)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  intersection?.disconnect()
  trackball.detach()
  window.removeEventListener('pointerdown', closeMenuOutside, true)
  if (raf) cancelAnimationFrame(raf)
  clearTimeout(refine)
  release()
})
</script>

<template>
  <div v-if="props.static" ref="root" class="mol3d still" :style="props.size ? { width: `${props.size}px`, height: `${props.size}px` } : undefined" data-ui="mol3d-still">
    <canvas ref="still" role="img" :aria-label="ariaLabel" />
  </div>
  <div v-else ref="root" class="mol3d" data-ui="mol3d" @keydown.esc="menu = false" :data-kind="kind ?? 'none'" :data-phase="phase" :data-renderer="fallback ? 'canvas2d' : 'webgl2'">
    <div v-if="phase === 'ready'" class="bar" role="toolbar" :aria-label="tl('三维查看器的工具')">
      <div v-if="kind !== 'orbital'" class="segmented" role="radiogroup" :aria-label="tl('画法')">
        <button v-for="s in STYLES" :key="s.id" role="radio" :aria-checked="style === s.id" :class="{ on: style === s.id }" :data-ui="`mol3d-style-${s.id}`" @click="style = s.id">{{ s.label() }}</button>
      </div>
      <button v-if="kind !== 'orbital'" class="btn small ghost" :class="{ active: measuring }" :aria-pressed="measuring" data-ui="mol3d-measure" :title="tl('量距离、键角与二面角')" @click="toggleMeasure"><Icon name="ruler" />{{ tl('测量') }}</button>
      <button v-if="kind !== 'orbital'" class="btn small ghost" :class="{ active: showLabels }" :aria-pressed="showLabels" :disabled="manyAtoms" data-ui="mol3d-labels" :title="manyAtoms ? tl('原子超过 {0} 个时不标元素符号', [LABEL_LIMIT]) : tl('元素符号')" @click="showLabels = !showLabels">{{ tl('标签') }}</button>
      <template v-if="kind === 'molecule'">
        <button class="btn small ghost" :class="{ active: showLonePairs }" :aria-pressed="showLonePairs" :disabled="style === 'space'" data-ui="mol3d-lonepairs" :title="tl('中心原子上的孤对电子')" @click="showLonePairs = !showLonePairs">{{ tl('孤对电子') }}</button>
        <button class="btn small ghost" :class="{ active: showDipole }" :aria-pressed="showDipole" data-ui="mol3d-dipole" :title="tl('分子的偶极矩，箭头指向负端')" @click="showDipole = !showDipole">{{ tl('偶极') }}</button>
      </template>
      <template v-else-if="kind === 'crystal'">
        <span class="stepper" role="group" :aria-label="tl('扩胞')">
          <button class="btn small ghost" :disabled="cells[0] <= 1" :aria-label="tl('少一层晶胞')" data-ui="mol3d-cells-less" @click="stepCells(-1)">−</button>
          <span class="count" data-ui="mol3d-cells">{{ tl('扩胞') }} {{ cells[0] }}³</span>
          <button class="btn small ghost" :disabled="cells[0] >= 8" :aria-label="tl('多一层晶胞')" data-ui="mol3d-cells-more" @click="stepCells(1)">+</button>
        </span>
        <button class="btn small ghost" :class="{ active: showPolyhedron }" :aria-pressed="showPolyhedron" data-ui="mol3d-polyhedron" :title="tl('配位多面体')" @click="showPolyhedron = !showPolyhedron">{{ tl('多面体') }}</button>
      </template>
      <template v-else>
        <button class="btn small ghost" :class="{ active: showSigns }" :aria-pressed="showSigns" data-ui="mol3d-signs" :title="tl('按波函数的正负着色')" @click="showSigns = !showSigns">{{ tl('正负') }}</button>
        <button class="btn small ghost" :class="{ active: showFrame }" :aria-pressed="showFrame" data-ui="mol3d-axes" @click="showFrame = !showFrame">{{ tl('坐标轴') }}</button>
      </template>
      <span class="spacer" />
      <button class="btn small ghost" data-ui="mol3d-reset" :title="tl('回到起始视角（双击画面）')" @click="reset">{{ tl('复位') }}</button>
      <div class="more">
        <button class="btn small ghost" :class="{ active: menu }" aria-haspopup="menu" :aria-expanded="menu" data-ui="mol3d-more" @click="menu = !menu"><Icon name="more" />{{ tl('更多') }}</button>
        <div v-if="menu" class="menu" role="menu">
          <label v-if="kind === 'molecule'" role="menuitemcheckbox" :aria-checked="showPolarity"><input v-model="showPolarity" type="checkbox" data-ui="mol3d-polarity" />{{ tl('键的极性') }}</label>
          <label v-if="kind === 'crystal'" role="menuitemcheckbox" :aria-checked="showFrame"><input v-model="showFrame" type="checkbox" data-ui="mol3d-frame" />{{ tl('晶胞棱') }}</label>
          <label role="menuitemcheckbox" :aria-checked="perspective"><input v-model="perspective" type="checkbox" data-ui="mol3d-perspective" />{{ tl('透视') }}</label>
          <div class="sep" />
          <button role="menuitem" data-ui="mol3d-export" @click="exportPng"><Icon name="image" />{{ tl('导出图片') }}</button>
          <div class="sep" />
          <p class="keys">{{ tl('方向键旋转，+ / − 缩放，Home 复位，Esc 退出测量') }}</p>
        </div>
      </div>
    </div>
    <div ref="stage" class="stage" :class="{ measuring }" tabindex="0" role="application" :aria-label="ariaLabel" data-ui="mol3d-stage" @keydown="onKey">
      <canvas v-if="!fallback" :key="glKey" ref="glCanvas" class="gl" aria-hidden="true" />
      <canvas ref="overlay" class="overlay" aria-hidden="true" />
      <div v-if="phase === 'ready'" class="caption" aria-live="polite">
        <span v-if="readout" class="readout" data-ui="mol3d-readout">{{ readout }}</span>
        <span v-if="caption" class="shape" data-ui="mol3d-caption">{{ caption }}</span>
        <span v-for="n in notes" :key="n" class="note">{{ n }}</span>
        <span v-if="fallback" class="note">{{ tl('这台设备没有 WebGL2，画面由平面绘制代替。') }}</span>
      </div>
      <div v-if="phase !== 'ready'" class="state" :data-ui="`mol3d-${phase}`">
        <template v-if="phase === 'loading'"><ScopeTrace :fill="false" :label="tl('正在取结构数据…')" /></template>
        <template v-else-if="phase === 'error'">
          <Icon name="alert" :size="28" />
          <strong>{{ tl('这个结构画不出来') }}</strong>
          <p>{{ props.error || problem }}</p>
        </template>
        <template v-else>
          <Icon name="elements" :size="28" />
          <strong>{{ tl('这里显示三维结构') }}</strong>
          <p>{{ tl('选一种分子、晶体或轨道，就能转动它、量它。') }}</p>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mol3d { display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; background: var(--pane); border-radius: var(--radius-panel); overflow: hidden; }
.mol3d.still { display: block; background: var(--canvas-bg); height: auto; aspect-ratio: 1; }
.mol3d.still canvas { display: block; width: 100%; height: 100%; }
.bar { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-1); padding: var(--space-1) var(--space-2); border-bottom: 1px solid var(--separator); min-height: calc(var(--control-sm) + 2 * var(--space-1)); }
.bar .spacer { flex: 1; min-width: var(--space-1); }
.stepper { display: inline-flex; align-items: center; gap: 2px; }
.stepper .count { font-size: var(--type-small); color: var(--text-2); font-variant-numeric: tabular-nums; padding: 0 var(--space-1); white-space: nowrap; }
.more { position: relative; }
.more .menu { top: calc(100% + var(--space-1)); right: 0; }
.more .menu input { accent-color: var(--accent); }
.more .keys { margin: 0; padding: var(--space-1) 10px; max-width: 260px; font-size: var(--type-tiny); color: var(--text-2); line-height: var(--line-body); }
.stage { position: relative; flex: 1; min-height: 120px; background: var(--canvas-bg); touch-action: none; cursor: grab; user-select: none; outline-offset: -2px; }
.stage:active { cursor: grabbing; }
.stage.measuring { cursor: crosshair; }
.stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.stage .overlay { pointer-events: none; }
.caption { position: absolute; left: var(--space-3); right: var(--space-3); bottom: var(--space-2); display: flex; flex-direction: column; align-items: flex-start; gap: 2px; pointer-events: none; font-size: var(--type-small); color: var(--text-2); }
.caption .shape, .caption .readout { color: var(--text); font-weight: var(--weight-strong); font-variant-numeric: tabular-nums; }
.caption .readout { color: var(--accent-strong); }
.caption .note { font-size: var(--type-tiny); max-width: 60ch; }
.state { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-2); padding: var(--space-4); text-align: center; color: var(--text-2); background: var(--canvas-bg); cursor: default; }
.state strong { color: var(--text); font-size: var(--type-subtitle); font-weight: var(--weight-title); }
.state p { margin: 0; max-width: 44ch; font-size: var(--type-small); line-height: var(--line-body); }
@media (pointer: coarse) {
  .bar .btn, .bar .segmented button { min-height: var(--touch-min); }
}
</style>
