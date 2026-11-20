/**
 * The context menu of the studio viewport (what a right click or a long press on an object, an annotation or empty
 * space offers, and what each item does) and the inline text input of the text tool.
 */
import { computed } from 'vue'
import { tl } from '../../../i18n'
import { state, edit } from '../../store'
import { toScreen } from '../../../render/renderer'
import { createForce, createHinge, hitTest, placeObject } from '../../editing'
import { editor, notify } from '../../editor/editorState'
import type { MenuTarget } from '../../editor/editorState'
import { snapPoint, snapStep } from '../../editor/snap'
import { addAnnotation, deleteAnnotation, editAnnotations, hitAnnotation } from '../../editor/annotations'
import {
  bringToFront, convertToPolygon, copySelection, deleteSelection, duplicateSelection, hasClipboard, kindChangeBlocker,
  paste, resetVelocity, sendToBack, toggleFixedRotation, toggleStatic
} from '../../editor/commands'
import type { MenuItem } from '../ContextMenu.vue'
import type { PointerInput, ViewportCore } from './state'
import type { CameraControl } from './camera'

export function useMenu(vp: ViewportCore, camera: CameraControl) {
  const cam = vp.cam

  // Texts are taken when the viewport is set up (the language is known by then), not when the module loads
  const ADD_ITEMS: Array<{ tool: string; label: string; icon: string }> = [
    { tool: 'add-ball', label: tl('小球'), icon: 'ball' }, { tool: 'add-block', label: tl('物块'), icon: 'block' },
    { tool: 'add-disc', label: tl('圆柱'), icon: 'disc' }, { tool: 'add-wedge', label: tl('楔块'), icon: 'wedge' },
    { tool: 'add-polygon', label: tl('多边形'), icon: 'polygon' }, { tool: 'add-ground', label: tl('地面'), icon: 'ground' },
    { tool: 'add-incline', label: tl('斜面'), icon: 'incline' }, { tool: 'add-wall', label: tl('墙'), icon: 'wall' },
    { tool: 'add-conveyor', label: tl('传送带'), icon: 'conveyor' }, { tool: 'add-pulley', label: tl('定滑轮'), icon: 'pulley' },
    { tool: 'add-charge', label: tl('带电小球'), icon: 'charge' }, { tool: 'add-fixed-charge', label: tl('固定电荷'), icon: 'fixedCharge' }
  ]

  /** Open the context menu on what is under the pointer (which becomes the selection). */
  function openMenu(e: PointerInput) {
    const p = vp.worldOf(e)
    const [sx, sy] = vp.screenOf(e)
    let target: MenuTarget = { kind: 'empty' }
    const ah = hitAnnotation(cam.value, state.scene.annotations, sx, sy)
    if (ah) { target = { kind: 'annotation', id: ah.id }; state.selection = null; editor.annotationId = ah.id }
    else {
      const cp = vp.currentPoses()
      const hit = cp ? hitTest(cp, p, 8 / cam.value.ppm) : null
      if (hit) { target = hit; editor.annotationId = null; state.selection = hit }
    }
    editor.menu = { x: e.clientX, y: e.clientY, world: p, target }
  }

  const menuItems = computed<MenuItem[]>(() => {
    const m = editor.menu
    if (!m) return []
    const t = m.target
    if (t.kind === 'empty') {
      return [
        { id: 'paste', label: tl('粘贴到此处'), icon: 'paste', shortcut: 'Ctrl+V', disabled: !hasClipboard() },
        { id: 'add', label: tl('添加物体'), icon: 'plus', children: ADD_ITEMS.map(a => ({ id: `add:${a.tool}`, label: a.label, icon: a.icon })) },
        { id: 'text', label: tl('添加文字标注'), icon: 'text' },
        { id: 'fit', label: tl('适合视图'), icon: 'fit', sep: true }
      ]
    }
    if (t.kind === 'annotation') {
      const a = state.scene.annotations.find(x => x.id === t.id)
      return [
        ...(a?.type === 'text' ? [{ id: 'edit-text', label: tl('编辑文字'), icon: 'text' }] : []),
        { id: 'copy', label: tl('复制'), icon: 'copy', shortcut: 'Ctrl+C' },
        { id: 'dup', label: tl('创建副本'), icon: 'duplicate', shortcut: 'Ctrl+D' },
        { id: 'delete', label: tl('删除'), icon: 'trash', shortcut: 'Del', danger: true, sep: true }
      ]
    }
    if (t.kind === 'connector') return [{ id: 'delete', label: tl('删除'), icon: 'trash', shortcut: 'Del', danger: true }]
    if (t.kind === 'pulley') {
      const p = state.scene.pulleys.find(x => x.id === t.id)
      return [
        { id: 'copy', label: tl('复制'), icon: 'copy', shortcut: 'Ctrl+C', disabled: !!p?.body },
        { id: 'dup', label: tl('创建副本'), icon: 'duplicate', shortcut: 'Ctrl+D', disabled: !!p?.body },
        { id: 'delete', label: tl('删除'), icon: 'trash', shortcut: 'Del', danger: true, sep: true }
      ]
    }
    const b = state.scene.bodies.find(x => x.id === t.id)
    if (!b) return []
    const dyn = b.kind !== 'static'
    const block = kindChangeBlocker(state.scene, b)
    const items: MenuItem[] = [
      { id: 'copy', label: tl('复制'), icon: 'copy', shortcut: 'Ctrl+C' },
      { id: 'dup', label: tl('创建副本'), icon: 'duplicate', shortcut: 'Ctrl+D' },
      { id: 'delete', label: tl('删除'), icon: 'trash', shortcut: 'Del', danger: true },
      { id: 'front', label: tl('移到最前'), icon: 'front', sep: true },
      { id: 'back', label: tl('移到最后'), icon: 'back' },
      { id: 'static', label: dyn ? tl('转为固定物体') : tl('转为可运动物体'), icon: dyn ? 'anchor' : 'unlock', sep: true, disabled: !!block, title: block ?? undefined }
    ]
    if (b.kind === 'rigid') items.push({ id: 'fixrot', label: b.fixedRotation ? tl('允许转动') : tl('固定转动（只平动）'), icon: 'norotate' })
    if (b.shape.type === 'box') items.push({ id: 'poly', label: tl('转为多边形（编辑顶点）'), icon: 'polygon' })
    if (dyn) {
      const moving = b.velocity.x !== 0 || b.velocity.y !== 0 || b.angularVelocity !== 0
      items.push({ id: 'v0', label: tl('初速度清零'), icon: 'zero', disabled: !moving })
      items.push({ id: 'force', label: tl('在此处添加外力'), icon: 'force', sep: true })
      items.push({ id: 'hinge', label: tl('在此处添加铰链'), icon: 'hinge' })
    }
    return items
  })

  function runMenu(id: string) {
    const m = editor.menu
    editor.menu = null
    if (!m) return
    const t = m.target
    const tid = t.kind === 'empty' ? '' : t.id
    const offset = snapStep(cam.value.ppm) * 2
    switch (id) {
      case 'paste': paste(snapPoint(m.world, cam.value.ppm, false), offset); return
      case 'text': editor.textInput = { at: snapPoint(m.world, cam.value.ppm, false), text: '', editId: null }; return
      case 'fit': camera.fitView(true); return
      case 'edit-text': {
        const a = state.scene.annotations.find(x => x.id === tid)
        if (a?.type === 'text') editor.textInput = { at: { ...a.at }, text: a.text, editId: a.id }
        return
      }
      case 'copy': copySelection(); return
      case 'dup': duplicateSelection(offset); return
      case 'delete': deleteSelection(); return
      case 'front': bringToFront(tid); return
      case 'back': sendToBack(tid); return
      case 'static': toggleStatic(tid); return
      case 'fixrot': toggleFixedRotation(tid); return
      case 'poly': convertToPolygon(tid); return
      case 'v0': resetVelocity(tid); return
      case 'force': case 'hinge': {
        const cp = vp.currentPoses()
        if (!cp) return
        let cid: string | null = null
        edit(scene => { cid = id === 'force' ? createForce(scene, cp, m.world) : createHinge(scene, cp, m.world) })
        if (cid) { state.selection = { kind: 'connector', id: cid }; state.rightTab = 'inspect' } else notify(tl('此处不在可运动的物体上'))
        return
      }
    }
    if (id.startsWith('add:')) {
      const tool = id.slice(4) as typeof state.tool
      const cp = vp.currentPoses()
      if (!cp) return
      let nid: string | null = null
      edit(scene => { nid = placeObject(scene, cp, tool, snapPoint(m.world, cam.value.ppm, false)) })
      if (nid) { editor.annotationId = null; state.selection = { kind: tool === 'add-pulley' ? 'pulley' : 'body', id: nid }; state.rightTab = 'inspect' }
    }
  }

  // ---- Text input ----
  const textInputPos = computed(() => {
    const ti = editor.textInput
    if (!ti) return null
    const [x, y] = toScreen(cam.value, ti.at.x, ti.at.y)
    return { x, y }
  })

  function commitText(text: string) {
    const ti = editor.textInput
    editor.textInput = null
    if (!ti) return
    const t = text.replace(/\s+$/, '').replace(/^\s+/, '')
    if (ti.editId) {
      const eid = ti.editId
      editAnnotations(scene => {
        if (!t) deleteAnnotation(scene, eid)
        else { const a = scene.annotations.find(x => x.id === eid); if (a?.type === 'text') a.text = t }
      })
      if (!t && editor.annotationId === eid) editor.annotationId = null
      return
    }
    if (!t) return
    let id: string | null = null
    editAnnotations(scene => { id = addAnnotation(scene, { type: 'text', at: { ...ti.at }, text: t }) })
    if (id) { state.selection = null; editor.annotationId = id }
    if (state.tool === 'annotate-text') state.tool = 'select'
  }

  function cancelText() { editor.textInput = null }

  return { openMenu, menuItems, runMenu, textInputPos, commitText, cancelText }
}
