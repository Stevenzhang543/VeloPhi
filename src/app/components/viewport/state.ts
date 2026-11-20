/**
 * The state one scene viewport shares between its modules (26.64, D289: the 1701-line component was split):
 *   state.ts     this file: the refs of the canvas, the camera, the pointer's drag in progress, and the shown state
 *                as the core sees it (the scene session of edit mode, the recording during playback);
 *   draw.ts      one draw per animation frame;
 *   camera.ts    size, fitting, glides and zoom;
 *   overlays.ts  what the editor draws over the scene (handles, previews, guides);
 *   snap.ts      the points editing snaps to, and their feedback;
 *   tools.ts     what a press, a drag and a release do with each tool;
 *   input.ts     the DOM events (pointer, keyboard) that drive the tools and the camera;
 *   menu.ts      the context menu and the inline text input;
 *   hud.ts       the texts over the canvas (hints, time, the screen reader's line).
 * Nothing here is reactive unless a template or a watcher reads it: the drag in progress and the flags of held keys
 * are plain fields, read by the next event.
 */
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { state, markStale } from '../../store'
import type { Selection } from '../../store'
import { usePageActive } from '../../live'
import { EngineSession } from '../../../engine/session'
import type { FrameView } from '../../../engine/views'
import { frameView } from '../../../engine/views'
import type { EditView } from '../../editing'
import type { AnnotationDef, RegionDef } from '../../../core/scene/types'
import { cloneScene, parseScene, serializeScene } from '../../../core/scene/io'
import type { Camera, Trajectories } from '../../../render/renderer'
import { computeTrajectories, sceneVectorScales, toWorld, vectorScales } from '../../../render/renderer'
import type { OverlayShape } from '../../../render/overlay'
import type { Pt } from '../../editor/geometry'
import { pulleyWorld } from '../../editor/geometry'
import type { SnapMemory } from '../../editor/objectSnap'
import type { DragFeedback, HandleDrag } from '../../editor/handles'
import type { DragTool } from '../../editor/create'

/** The shown state with its view: what is drawn and what a click is tested against. */
export interface EditSystem extends EditView { view: FrameView }

/**
 * What the tools read from a pointer event. A MouseEvent and a PointerEvent have all of it; the gestures of
 * input.ts build one for what has no event of its own (a long press, a double tap).
 */
export interface PointerInput {
  clientX: number
  clientY: number
  button: number
  altKey: boolean
  shiftKey: boolean
  /** Click count of the press (2: the second press of a double click). */
  detail: number
  preventDefault(): void
}

/** The drag in progress. */
export type Drag =
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'right'; sx: number; sy: number; lastX: number; lastY: number }
  | { kind: 'move'; sel: Selection; start: Pt; applied: Pt; snapshot: string; moved: boolean; sx: number; sy: number; mem: SnapMemory }
  | { kind: 'handle'; hd: HandleDrag; key: string; snapshot: string; moved: boolean; sx: number; sy: number; feedback: DragFeedback | null; heldAngle: number }
  | { kind: 'create'; tool: DragTool; a: Pt; b: Pt; step: number; moved: boolean; sx: number; sy: number }
  | { kind: 'annot-create'; tool: 'measure-ruler' | 'annotate-arrow'; a: Pt; b: Pt; moved: boolean; sx: number; sy: number }
  | { kind: 'annot-move'; id: string; orig: AnnotationDef; point: number; start: Pt; snapshot: string; moved: boolean; sx: number; sy: number }
  | { kind: 'cut'; a: Pt; b: Pt; moved: boolean; sx: number; sy: number }
  | { kind: 'region'; id: string; orig: RegionDef; handle: number; start: Pt; snapshot: string; moved: boolean; sx: number; sy: number }

/** One viewport's shared state (see the module header). */
export interface ViewportCore {
  /** The editor (true) or the playback view of the monitor page. */
  studio: ComputedRef<boolean>
  variant: () => 'studio' | 'monitor'
  pageActive: Ref<boolean>
  host: Ref<HTMLDivElement | null>
  canvas: Ref<HTMLCanvasElement | null>
  cam: Ref<Camera>
  hover: Ref<string | null>
  hotHandle: Ref<string | null>
  cursorWorld: ShallowRef<Pt | null>
  snapMark: ShallowRef<Pt | null>
  /** Guides of the object snap in effect (target surfaces and contact points). */
  snapGuides: ShallowRef<OverlayShape[]>
  cursor: Ref<string>
  editing: ComputedRef<boolean>
  /** Geometry can be changed (move, handles): the studio, and the shown state is the initial one. */
  canEditGeometry: ComputedRef<boolean>
  trajectories: ComputedRef<Trajectories | null>
  // ---- Plain fields ----
  drag: Drag | null
  spaceDown: boolean
  altDown: boolean
  /** Size of the host box from the last resize (26.55, D97: reading clientWidth here forced a layout on every frame). */
  hostW: number
  hostH: number
  /** Floating controls over the bottom of the canvas (the timeline bar of the studio, D205). */
  floatBottom: number
  floatLeft: number
  /** Computed time at which the view is fitted once more (0: none). */
  refitAt: number
  // ---- The shown state ----
  /** The scene being edited as the core sees it (rebuilt only when the scene changed); null: it does not compile. */
  editSystem(): EditSystem | null
  /** The shown state as the core sees it: the recording at the shown frame, or the scene being edited. */
  currentPoses(): EditSystem | null
  /** World centre of a pulley at the shown state (movable pulleys ride on their body). */
  pulleyNow(id: string): Pt | null
  /** Vector scales: fixed per recording during playback, from the initial state in edit mode. */
  currentScales(): { v: number; a: number; f: number }
  screenOf(e: { clientX: number; clientY: number }): [number, number]
  worldOf(e: { clientX: number; clientY: number }): Pt
  /** End a drag that changed the scene in place: one undo step back to `snapshot`. */
  commitSnapshot(snapshot: string): void
  /** Cancel a move or handle drag: put the scene back as it was at the press. */
  restoreSnapshot(snapshot: string): void
}

export function createViewport(variant: () => 'studio' | 'monitor'): ViewportCore {
  const studio = computed(() => variant() !== 'monitor')
  const pageActive = usePageActive()

  const host = ref<HTMLDivElement | null>(null)
  const canvas = ref<HTMLCanvasElement | null>(null)
  const cam = ref<Camera>({ cx: state.scene.view.center.x, cy: state.scene.view.center.y, ppm: state.scene.view.pixelsPerMeter, width: 800, height: 600 })
  const hover = ref<string | null>(null)
  const hotHandle = ref<string | null>(null)
  const cursorWorld = shallowRef<Pt | null>(null)
  const snapMark = shallowRef<Pt | null>(null)
  const snapGuides = shallowRef<OverlayShape[]>([])
  const cursor = ref('default')

  const editing = computed(() => state.stale || !state.recording)
  const canEditGeometry = computed(() => studio.value && (editing.value || (state.frame === 0 && !state.playing)))

  // ---- Edit-mode system ----
  // The scene's version counts mutations, so the scene session of the core (compiled model, initial state and its
  // view) is rebuilt only when the scene changed; the previous one is released
  let sceneVersion = 0
  watch(() => state.scene, () => { sceneVersion++ }, { deep: true, flush: 'sync' })
  let editCache: { version: number; value: EditSystem | null } | null = null
  function editSystem(): EditSystem | null {
    if (editCache && editCache.version === sceneVersion) return editCache.value
    editCache?.value?.session.free()
    let value: EditSystem | null = null
    try {
      const session = EngineSession.create(cloneScene(state.scene))
      const view = frameView(session, 0)
      value = { session, sys: session.system, view, poses: view.poses, t: 0 }
    } catch { value = null }
    editCache = { version: sceneVersion, value }
    return value
  }
  onBeforeUnmount(() => { editCache?.value?.session.free(); editCache = null })

  const trajectories = computed(() => (state.recording ? computeTrajectories(state.recording) : null))
  function currentScales(): { v: number; a: number; f: number } {
    const rec = state.recording
    if (rec && !state.stale) return vectorScales(rec)
    const es = editSystem()
    return es ? sceneVectorScales(es.session) : { v: 30, a: 30, f: 3 }
  }

  let shownCache: { rec: object; frame: number; value: EditSystem } | null = null
  function currentPoses(): EditSystem | null {
    if (!editing.value && state.recording) {
      const rec = state.recording
      if (shownCache && shownCache.rec === rec && shownCache.frame === state.frame) return shownCache.value
      const t = state.frame * rec.dt
      const view = frameView(rec, t)
      const value = { session: rec.session, sys: rec.system, view, poses: view.poses, t }
      shownCache = { rec, frame: state.frame, value }
      return value
    }
    return editSystem()
  }

  function pulleyNow(id: string): Pt | null {
    const cp = currentPoses()
    const pi = cp?.sys.model.pulleys.findIndex(p => p.id === id) ?? -1
    if (cp && pi >= 0) return { x: cp.view.pulleys[2 * pi], y: cp.view.pulleys[2 * pi + 1] }
    const def = state.scene.pulleys.find(p => p.id === id)
    return def ? pulleyWorld(state.scene, def) : null
  }

  function screenOf(e: { clientX: number; clientY: number }): [number, number] {
    const r = canvas.value!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  function worldOf(e: { clientX: number; clientY: number }): Pt {
    const [sx, sy] = screenOf(e)
    return toWorld(cam.value, sx, sy)
  }

  function commitSnapshot(snapshot: string) {
    if (snapshot === serializeScene(state.scene)) return
    state.past.push(snapshot)
    if (state.past.length > 200) state.past.shift()
    state.future = []
    state.dirty = true
    markStale()
  }
  function restoreSnapshot(snapshot: string) {
    if (serializeScene(state.scene) === snapshot) return
    state.scene = parseScene(snapshot).scene
    markStale()
  }

  return {
    studio, variant, pageActive, host, canvas, cam, hover, hotHandle, cursorWorld, snapMark, snapGuides, cursor, editing, canEditGeometry, trajectories,
    drag: null, spaceDown: false, altDown: false, hostW: 0, hostH: 0, floatBottom: 0, floatLeft: 0, refitAt: 0,
    editSystem, currentPoses, pulleyNow, currentScales, screenOf, worldOf, commitSnapshot, restoreSnapshot
  }
}
