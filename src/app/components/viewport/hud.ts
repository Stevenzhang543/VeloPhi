/**
 * The texts over the canvas: the playing time, the hint of the tool in use or of the selection, the short flash of
 * the play and pause symbols, and what a screen reader hears.
 */
import { computed, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import { state } from '../../store'
import { settings, fmtTime } from '../../settings'
import { editor } from '../../editor/editorState'
import { viewStatus } from '../../viewStatus'
import { phone } from '../../layout'
import type { ViewportCore } from './state'
import type { Painter } from './draw'

/** What a screen reader hears (26.55, D43): notices, the selected object and the state of playback. */
export function useLiveText() {
  return computed(() => {
    if (editor.notice) return editor.notice
    const sel = state.selection
    if (sel?.kind === 'body') { const b = state.scene.bodies.find(x => x.id === sel.id); if (b) return tl('已选中 {0}', [b.name]) }
    if (editor.regionId) { const r = state.scene.settings.regions?.find(x => x.id === editor.regionId); if (r) return tl('已选中 {0}', [r.name]) }
    return state.playing ? tl('正在播放') : ''
  })
}

export function useHud(vp: ViewportCore, painter: Painter) {
  // 26.57 (D121): the same playing time, written the same way as the time line and the monitor's clock (one time,
  // not two readings that differ in the last digit)
  const timeText = computed(() => {
    if (vp.editing.value) return null
    return `t = ${fmtTime(state.time, state.recording?.dt ?? state.scene.settings.outputStep)}`
  })

  const toolHint = computed(() => {
    if (!vp.studio.value) return ''
    const snap = settings.editor.snap || settings.editor.objectSnap ? tl('；按住 Alt 暂停吸附') : ''
    switch (state.tool) {
      case 'connect-rope': return state.pendingConnector ? tl('点击滑轮让绳绕过，再点击另一物体或空白处（固定点）完成') : tl('点击物体（靠近中心吸附到质心）或空白处作为绳的一端')
      case 'connect-rod': return state.pendingConnector ? tl('点击另一端') : tl('点击轻杆的一端')
      case 'connect-spring': return state.pendingConnector ? tl('点击弹簧另一端（物体或固定点）') : tl('点击弹簧的一端')
      case 'connect-hinge': return tl('点击物体上的转轴位置（与重叠的物体铰接，否则固定在世界中）')
      case 'connect-damper': return state.pendingConnector ? tl('点击阻尼器另一端（物体或固定点）') : tl('点击阻尼器的一端')
      case 'connect-weld': return tl('点击两物体重叠处把它们焊成一体；只有一个物体时把它固定在世界中')
      case 'connect-motor': return tl('点击转轴位置：上面的物体被驱动，相对下面的物体或世界转动')
      case 'connect-slider': return tl('点击物体：它只能沿自身 x 方向相对下面的物体或世界滑动')
      case 'connect-gear': return state.pendingConnector ? tl('点击另一个物体（两轮的角速度之比由半径决定）') : tl('点击第一个齿轮（物体）')
      case 'add-force': return tl('点击物体上的作用点添加恒力')
      case 'add-central': return tl('点击放置力心：点在运动物体上时力心随它运动（如行星绕恒星），点在空白处时固定不动')
      case 'shape-cut': return tl('按住并拖出一条直线，把它穿过的矩形和多边形切开（质量按面积分配）；撤销可恢复')
      case 'shape-combine': return editor.combineDraft.length >= 2 ? tl('已选 {0} 个物体：点下方的“组合”（或双击、按 Enter）组合成一个复合体；再点一次取消选择', [editor.combineDraft.length]) : tl('依次点击要组合的物体（固定物体只能与固定物体组合）')
      case 'pan': return tl('拖动平移视图')
      case 'select': return ''
      case 'add-polygon': return editor.polyDraft.length >= 3 ? tl('已放 {0} 个顶点：点击第一个顶点、点下方的“完成多边形”、双击或按 Enter 完成', [editor.polyDraft.length]) : tl('依次点击放置顶点（可以是凹多边形；边不能相交）') + snap
      case 'measure-ruler': return tl('按住并拖动测量长度与倾角（自动吸附到顶点和质心）') + snap
      case 'measure-angle': return editor.angleDraft.length === 0 ? tl('点击角的顶点') : editor.angleDraft.length === 1 ? tl('点击第一条边上的一点') : tl('点击第二条边上的一点')
      case 'annotate-text': return tl('点击放置文字标注')
      case 'annotate-arrow': return tl('按住并拖动画箭头') + snap
      case 'add-ball': case 'add-disc': case 'add-pulley': case 'add-charge': case 'add-fixed-charge': return tl('点击放置；按住拖动设定半径；按住 Shift 连续放置') + snap
      case 'add-ground': case 'add-conveyor': return tl('点击放置；按住水平拖动设定长度；按住 Shift 连续放置') + snap
      case 'add-incline': case 'add-wedge': return tl('点击放置；从直角处拖出底边和高；按住 Shift 连续放置') + snap
      default: return tl('点击放置（靠近表面时自动贴合）；按住拖动设定大小；按住 Shift 连续放置') + snap
    }
  })

  const selectionHint = computed(() => {
    if (!vp.studio.value || state.tool !== 'select' || !vp.canEditGeometry.value) return ''
    const sel = state.selection
    if (sel?.kind !== 'body') return ''
    const b = state.scene.bodies.find(x => x.id === sel.id)
    if (!b) return ''
    const rot = settings.editor.angleSnap > 0 ? tl('（按 {0}° 吸附，Shift 自由旋转）', [settings.editor.angleSnap]) : settings.editor.objectSnap ? tl('（任意角度；靠近 0°、90° 或附近表面的倾角时吸附，Alt 关闭）') : ''
    if (b.shape.type === 'polygon') return tl('拖动顶点改形状，双击边添加顶点，Alt+单击顶点删除；圆形手柄旋转{0}', [rot])
    if (b.shape.type === 'box') return tl('拖动方形手柄改大小（Shift 等比），圆形手柄旋转{0}；右键可转为多边形', [rot])
    if (b.shape.type === 'arc') return tl('拖动内侧的手柄改半径，圆形手柄旋转{0}；起始角、圆心角与厚度在“属性”中修改', [rot])
    return tl('拖动手柄改半径')
  })
  // 26.63 (D233): on a desktop the hint is shown in the status bar; the pill over the canvas stays on phones
  watch([toolHint, selectionHint], ([a, b]) => { if (vp.studio.value) viewStatus.hint = a || b }, { immediate: true })
  const hintOnCanvas = computed(() => !vp.studio.value || phone.value)
  // 26.63 (D233): starting and pausing playback flashes its symbol in the middle of the canvas, as video players do
  const flash = ref<{ icon: 'play' | 'pause'; n: number } | null>(null)
  let flashTimer: ReturnType<typeof setTimeout> | null = null
  watch(() => state.playing, on => {
    if (!vp.pageActive.value || !painter.visible() || !settings.ui.motion) return
    flash.value = { icon: on ? 'play' : 'pause', n: (flash.value?.n ?? 0) + 1 }
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => { flash.value = null }, 560)
  })

  return { timeText, toolHint, selectionHint, hintOnCanvas, flash }
}
