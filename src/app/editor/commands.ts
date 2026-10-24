/**
 * Object commands of the studio editor, shared by the context menu and the keyboard: internal clipboard
 * (copy / paste / duplicate — never the OS clipboard), drawing order, static ⇄ dynamic, fixed rotation,
 * box → polygon, resetting the initial velocity and nudging. Every command is one undoable step.
 */
import type { AnnotationDef, BodyDef, ConnectorDef, ForceDef, PulleyDef, Scene } from '../../core/scene/types'
import { nextId } from '../../core/scene/build'
import { edit, state } from '../store'
import type { Selection } from '../store'
import { deleteObject, moveObject, nextName } from '../editing'
import type { Pt } from './geometry'
import { bodyCenter, boxToPolygon, centroid, localVerts, toWorldPt, translateBody } from './geometry'
import { deleteAnnotation, duplicateAnnotation, editAnnotations, newAnnotationId } from './annotations'
import { editor, notify } from './editorState'

// ---- Clipboard ----

type Clip =
  | { kind: 'body'; body: BodyDef; forces: ForceDef[]; pulleys: PulleyDef[] }
  | { kind: 'pulley'; pulley: PulleyDef }
  | { kind: 'annotation'; annotation: AnnotationDef }

let clipboard: Clip | null = null

/** A body with what belongs to it: forces acting on it and movable pulleys it carries. */
function bodyClip(scene: Scene, b: BodyDef): Clip {
  const forces = scene.connectors.filter((c): c is ForceDef => c.type === 'force' && c.a.body === b.id)
  const pulleys = scene.pulleys.filter(p => p.body === b.id)
  return { kind: 'body', body: JSON.parse(JSON.stringify(b)), forces: JSON.parse(JSON.stringify(forces)), pulleys: JSON.parse(JSON.stringify(pulleys)) }
}
let pasteCount = 0

/** Whether something has been copied. */
export function hasClipboard(): boolean { return clipboard !== null }

/** What is selected: an annotation (editor state) or a body / connector / pulley (store). */
export function currentTarget(): { kind: 'annotation'; id: string } | Selection {
  if (editor.annotationId) return { kind: 'annotation', id: editor.annotationId }
  return state.selection
}

/** Copy the selection to the internal clipboard; false when nothing copyable is selected. */
export function copySelection(): boolean {
  const t = currentTarget()
  if (!t) return false
  const scene = state.scene
  if (t.kind === 'annotation') {
    const a = scene.annotations.find(x => x.id === t.id)
    if (a) clipboard = { kind: 'annotation', annotation: JSON.parse(JSON.stringify(a)) }
  } else if (t.kind === 'body') {
    const b = scene.bodies.find(x => x.id === t.id)
    if (!b) return false
    clipboard = bodyClip(scene, b)
  } else if (t.kind === 'pulley') {
    const p = scene.pulleys.find(x => x.id === t.id)
    if (!p || p.body) return false
    clipboard = { kind: 'pulley', pulley: JSON.parse(JSON.stringify(p)) }
  } else return false
  pasteCount = 0
  notify('已复制（Ctrl+V 粘贴）', 1600)
  return true
}

function connectorName(scene: Scene, base: string): string {
  const used = new Set(scene.connectors.map(c => c.name))
  let k = 1
  while (used.has(`${base}${k}`)) k++
  return `${base}${k}`
}

/** Translate a body definition so that its centre lands at `at`. */
function placeBodyAt(b: BodyDef, at: Pt) {
  const c = bodyCenter(b)
  translateBody(b, at.x - c.x, at.y - c.y)
}

/** Paste the clipboard at `at` (world) or, without a point, a little offset from the original. */
export function paste(at: Pt | null, offset: number): boolean {
  const clip = clipboard
  if (!clip) return false
  pasteCount++
  const shift = offset * pasteCount
  if (clip.kind === 'annotation') {
    let id: string | null = null
    editAnnotations(scene => {
      const a = JSON.parse(JSON.stringify(clip.annotation)) as AnnotationDef
      a.id = newAnnotationId(scene)
      const pts = a.type === 'text' ? [a.at] : a.type === 'angle' ? [a.vertex, a.a, a.b] : [a.from, a.to]
      const ref = pts[0]
      const dx = at ? at.x - ref.x : shift, dy = at ? at.y - ref.y : -shift
      for (const p of pts) { p.x += dx; p.y += dy }
      scene.annotations.push(a)
      id = a.id
    })
    if (id) { state.selection = null; editor.annotationId = id }
    return true
  }
  let sel: Selection = null
  edit(scene => {
    if (clip.kind === 'pulley') {
      const p = JSON.parse(JSON.stringify(clip.pulley)) as PulleyDef
      p.id = nextId(scene, 'p')
      p.name = nextName(scene, p.name.replace(/\d+$/, '') || '滑轮')
      p.position = at ? { ...at } : { x: p.position.x + shift, y: p.position.y - shift }
      scene.pulleys.push(p)
      sel = { kind: 'pulley', id: p.id }
      return
    }
    const b = JSON.parse(JSON.stringify(clip.body)) as BodyDef
    const oldId = b.id
    b.id = nextId(scene, b.kind === 'static' ? 's' : 'b')
    b.name = nextName(scene, b.name.replace(/\d+$/, '') || '物体')
    scene.bodies.push(b)
    const c = bodyCenter(b)
    placeBodyAt(b, at ?? { x: c.x + shift, y: c.y - (b.kind === 'static' ? shift : 0) })
    for (const f of clip.forces) {
      const copy = JSON.parse(JSON.stringify(f)) as ForceDef
      copy.id = nextId(scene, 'f')
      copy.name = connectorName(scene, f.name.replace(/\d+$/, '') || '拉力')
      if (copy.a.body === oldId) copy.a.body = b.id
      scene.connectors.push(copy)
    }
    // Movable pulleys keep their place on the body (body coordinates); ropes over the originals are not copied
    for (const pl of clip.pulleys ?? []) {
      const copy = JSON.parse(JSON.stringify(pl)) as PulleyDef
      copy.id = nextId(scene, 'p')
      copy.name = nextName(scene, pl.name.replace(/\d+$/, '') || '动滑轮')
      copy.body = b.id
      scene.pulleys.push(copy)
    }
    sel = { kind: 'body', id: b.id }
  })
  if (sel) { editor.annotationId = null; state.selection = sel }
  return true
}

/** Duplicate the selection (copy + paste with an offset, without touching the clipboard). */
export function duplicateSelection(offset: number): boolean {
  const t = currentTarget()
  if (!t) return false
  if (t.kind === 'annotation') {
    let id: string | null = null
    editAnnotations(scene => { id = duplicateAnnotation(scene, t.id, offset, -offset) })
    if (id) editor.annotationId = id
    return !!id
  }
  const saved = clipboard, savedCount = pasteCount
  const ok = copySelectionQuiet(t)
  if (ok) { pasteCount = 0; paste(null, offset) }
  clipboard = saved
  pasteCount = savedCount
  return ok
}

function copySelectionQuiet(t: NonNullable<Selection>): boolean {
  const scene = state.scene
  if (t.kind === 'body') {
    const b = scene.bodies.find(x => x.id === t.id)
    if (!b) return false
    clipboard = bodyClip(scene, b)
    return true
  }
  if (t.kind === 'pulley') {
    const p = scene.pulleys.find(x => x.id === t.id)
    if (!p || p.body) return false
    clipboard = { kind: 'pulley', pulley: JSON.parse(JSON.stringify(p)) }
    return true
  }
  return false
}

/** Delete the selection (annotation or object). */
export function deleteSelection(): boolean {
  const t = currentTarget()
  if (!t) return false
  if (t.kind === 'annotation') {
    editAnnotations(scene => deleteAnnotation(scene, t.id))
    editor.annotationId = null
    return true
  }
  const sel = t
  edit(scene => deleteObject(scene, sel))
  state.selection = null
  return true
}

// ---- Body commands ----

/** Draw a body last (on top). */
export function bringToFront(id: string) {
  edit(scene => {
    const i = scene.bodies.findIndex(b => b.id === id)
    if (i < 0 || i === scene.bodies.length - 1) return
    const [b] = scene.bodies.splice(i, 1)
    scene.bodies.push(b)
  })
}

/** Draw a body first (underneath). */
export function sendToBack(id: string) {
  edit(scene => {
    const i = scene.bodies.findIndex(b => b.id === id)
    if (i <= 0) return
    const [b] = scene.bodies.splice(i, 1)
    scene.bodies.unshift(b)
  })
}

/** Why a body cannot change between static and dynamic, or null when it can. */
export function kindChangeBlocker(scene: Scene, b: BodyDef): string | null {
  if (b.kind === 'static') {
    if (b.beltSpeed !== 0) return '传送带只能是固定物体'
    return null
  }
  const touches = (c: ConnectorDef) => c.a.body === b.id || (c.type !== 'force' && c.b.body === b.id)
  for (const c of scene.connectors) {
    if (!touches(c)) continue
    if (c.type === 'force') return '物体上有外力，先删除外力再转为固定'
    const other = c.a.body === b.id ? c.b.body : c.a.body
    const otherBody = other ? scene.bodies.find(x => x.id === other) : null
    if (!otherBody || otherBody.kind === 'static') return `${c.name} 的另一端也是固定的，转为固定后连接没有意义`
  }
  if (scene.pulleys.some(p => p.body === b.id)) return '物体上装有动滑轮'
  return null
}

/** Static ⇄ dynamic. Dynamic polygons are re-centred on their centre of mass; geometry stays where it is. */
export function toggleStatic(id: string) {
  const b0 = state.scene.bodies.find(x => x.id === id)
  if (!b0) return
  const why = kindChangeBlocker(state.scene, b0)
  if (why) { notify(why); return }
  edit(scene => {
    const b = scene.bodies.find(x => x.id === id)!
    if (b.kind === 'static') {
      if (b.shape.type === 'polygon') {
        const lv = localVerts(b)
        const c = centroid(lv)
        const cw = toWorldPt(b, c)
        b.shape = { type: 'polygon', points: lv.map(p => ({ x: p.x - c.x, y: p.y - c.y })) }
        b.position = cw
        // Anchors on the body keep their world points
        for (const conn of scene.connectors) for (const a of conn.type === 'force' ? [conn.a] : [conn.a, conn.b]) if (a.body === b.id) { a.local = { x: a.local.x - c.x, y: a.local.y - c.y } }
      }
      b.kind = b.shape.type === 'circle' && b.role === 'ball' ? 'particle' : 'rigid'
      b.mass = 1
      b.velocity = { x: 0, y: 0 }
      b.angularVelocity = 0
      b.beltSpeed = 0
      if (['ground', 'incline', 'wall', 'conveyor'].includes(b.role)) b.role = b.shape.type === 'circle' ? 'wheel' : 'block'
      if (b.color === '#64748b' || b.color === '#475569') b.color = '#2563eb'
    } else {
      b.kind = 'static'
      b.mass = 0
      b.inertia = null
      b.velocity = { x: 0, y: 0 }
      b.angularVelocity = 0
      b.fixedRotation = false
      b.color = '#64748b'
    }
  })
}

/** Switch a rigid body between rotating and translating only. */
export function toggleFixedRotation(id: string) {
  edit(scene => { const b = scene.bodies.find(x => x.id === id); if (b && b.kind === 'rigid') b.fixedRotation = !b.fixedRotation })
}

/** Turn a box into an editable polygon; false when it is not a box. */
export function convertToPolygon(id: string): boolean {
  let ok = false
  edit(scene => { const b = scene.bodies.find(x => x.id === id); if (b) ok = boxToPolygon(b) })
  if (ok) notify('已转为多边形：拖动顶点改形状，双击边添加顶点，Alt+单击顶点删除')
  return ok
}

/** Zero a body's initial velocity and angular velocity. */
export function resetVelocity(id: string) {
  edit(scene => { const b = scene.bodies.find(x => x.id === id); if (b) { b.velocity = { x: 0, y: 0 }; b.angularVelocity = 0 } })
}

/** Move the selected body, pulley or annotation by (dx, dy) as one undoable step. */
export function nudgeSelection(dx: number, dy: number): boolean {
  const t = currentTarget()
  if (!t) return false
  if (t.kind === 'annotation') {
    editAnnotations(scene => {
      const a = scene.annotations.find(x => x.id === t.id)
      if (!a) return
      const pts = a.type === 'text' ? [a.at] : a.type === 'angle' ? [a.vertex, a.a, a.b] : [a.from, a.to]
      for (const p of pts) { p.x += dx; p.y += dy }
    })
    return true
  }
  if (t.kind !== 'body' && t.kind !== 'pulley') return false
  const sel = t
  edit(scene => moveObject(scene, sel, dx, dy))
  return true
}
