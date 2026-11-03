/**
 * The tools of the studio palette (26.54, D86; moved here in 26.55 so the global search can offer them too): name,
 * icon, tip and shortcut of each tool, the common ones, the category pages, and choosing a tool (the field
 * buttons switch the scene's uniform field on or off instead).
 */
import { trDeep } from '../i18n'
import { state, edit } from './store'
import type { Tool } from './store'
import { settings } from './settings'
import { clearDrafts } from './editor/editorState'

export interface ToolDef { tool: Tool; icon: string; label: string; tip: string; key?: string }
/** Every tool of the palette (labels and tips are Chinese source keys read through trDeep). */
export const T: Record<string, ToolDef> = trDeep({
  select: { tool: 'select', icon: 'select', label: '选择', tip: '选择、拖动物体；选中后拖动手柄改大小、旋转或编辑顶点（V）', key: 'V' },
  pan: { tool: 'pan', icon: 'pan', label: '平移', tip: '拖动视图（H；也可按住空格、中键或右键拖动）', key: 'H' },
  ball: { tool: 'add-ball', icon: 'ball', label: '小球', tip: '质点小球（只平动）：单击放置，拖动设定半径（O）', key: 'O' },
  block: { tool: 'add-block', icon: 'block', label: '物块', tip: '矩形刚体：单击放置，从一角拖到对角设定大小（B）', key: 'B' },
  disc: { tool: 'add-disc', icon: 'disc', label: '圆柱', tip: '可滚动的匀质圆柱：单击放置，拖动设定半径（C）', key: 'C' },
  wedge: { tool: 'add-wedge', icon: 'wedge', label: '楔块', tip: '可运动的直角三角形刚体：从直角处拖出底边和高' },
  polygon: { tool: 'add-polygon', icon: 'polygon', label: '多边形', tip: '依次点击顶点，点击第一个顶点、双击或按 Enter 完成；Esc 取消（P）', key: 'P' },
  ground: { tool: 'add-ground', icon: 'ground', label: '地面', tip: '水平固定面：单击放置，水平拖动设定长度（G）', key: 'G' },
  incline: { tool: 'add-incline', icon: 'incline', label: '斜面', tip: '固定斜面：单击放置 30° 斜面，或从直角处拖出底边和高（I）', key: 'I' },
  wall: { tool: 'add-wall', icon: 'wall', label: '墙', tip: '竖直固定挡板：单击放置，或拖出矩形（W）', key: 'W' },
  conveyor: { tool: 'add-conveyor', icon: 'conveyor', label: '传送带', tip: '以恒定速度运行的水平传送带：水平拖动设定长度' },
  pulley: { tool: 'add-pulley', icon: 'pulley', label: '定滑轮', tip: '轴固定的轻质光滑滑轮：单击放置，拖动设定半径' },
  rope: { tool: 'connect-rope', icon: 'rope', label: '轻绳', tip: '只能拉、不可伸长；可绕过滑轮' },
  rod: { tool: 'connect-rod', icon: 'rod', label: '轻杆', tip: '长度不变，可拉可压' },
  spring: { tool: 'connect-spring', icon: 'spring', label: '弹簧', tip: '胡克定律 F = kx，可设阻尼' },
  damper: { tool: 'connect-damper', icon: 'damper', label: '阻尼器', tip: '阻力与相对速度成正比 F = cv，没有弹力' },
  hinge: { tool: 'connect-hinge', icon: 'hinge', label: '铰链', tip: '光滑转轴' },
  weld: { tool: 'connect-weld', icon: 'weld', label: '焊接', tip: '把两个物体连成一个整体，或把物体固定住' },
  slider: { tool: 'connect-slider', icon: 'slider', label: '滑轨', tip: '物体只能沿一条直线滑动（移动副）' },
  motor: { tool: 'connect-motor', icon: 'motor', label: '马达', tip: '带驱动的转轴：恒定转速或恒定力矩' },
  gear: { tool: 'connect-gear', icon: 'gear', label: '齿轮', tip: '两轮转速成比例：ω₁r₁ = ω₂r₂（齿轮或皮带）' },
  force: { tool: 'add-force', icon: 'force', label: '恒力', tip: '方向和大小不变的外力' },
  central: { tool: 'add-central', icon: 'central', label: '有心力', tip: '指向（或背离）一个中心的力场 F = k·rⁿ：弹性中心力、平方反比引力等' },
  charge: { tool: 'add-charge', icon: 'charge', label: '带电小球', tip: '带电荷 q 的小球：单击放置，拖动设定半径；在“属性”中改电荷量与正负' },
  fixedCharge: { tool: 'add-fixed-charge', icon: 'fixedCharge', label: '固定电荷', tip: '不动的点电荷（如原子核）：对其他带电体有库仑力' },
  efield: { tool: 'field-electric', icon: 'efield', label: '匀强电场', tip: '打开或关闭整个场景的匀强电场 E（大小与方向在“场景”中设置）' },
  bfield: { tool: 'field-magnetic', icon: 'bfield', label: '匀强磁场', tip: '打开或关闭垂直纸面的匀强磁场 B（在“场景”中设置）' },
  cut: { tool: 'shape-cut', icon: 'cut', label: '切割', tip: '拖出一条直线，把矩形或多边形切成几块' },
  combine: { tool: 'shape-combine', icon: 'compound', label: '组合', tip: '依次点击几个物体，组合成一个复合体（一个刚体）' },
  ruler: { tool: 'measure-ruler', icon: 'ruler', label: '尺子', tip: '拖动测量长度和与水平面的夹角，吸附到顶点和质心（M）', key: 'M' },
  angle: { tool: 'measure-angle', icon: 'protractor', label: '量角器', tip: '依次点击角的顶点和两边上的点（A）', key: 'A' },
  text: { tool: 'annotate-text', icon: 'text', label: '文字', tip: '点击放置文字标注，双击已有文字可修改（T）', key: 'T' },
  arrow: { tool: 'annotate-arrow', icon: 'arrow', label: '箭头', tip: '拖动画出标注箭头（L）', key: 'L' },
  // 26.59 fix 3 (D194): ready-made parts; arc tracks are exact circles in the physics core
  arcQuarter: { tool: 'add-arc-quarter', icon: 'arcQuarter', label: '1/4 圆弧', tip: '固定的光滑四分之一圆弧轨道（半径 1 m）：单击放在地面上，底端与地面相切' },
  arcHalf: { tool: 'add-arc-half', icon: 'arcHalf', label: '半圆槽', tip: '固定的光滑半圆槽（半径 1 m）：单击放置，槽底在单击处' },
  arcLoop: { tool: 'add-arc-loop', icon: 'arcLoop', label: '圆轨道', tip: '固定的光滑圆环轨道（半径 1 m）：把小球放在环内侧，研究竖直面内的圆周运动' },
  arcHump: { tool: 'add-arc-hump', icon: 'arcHump', label: '拱形桥', tip: '凸形圆弧桥面（半径 2 m）：物体在最高点对桥面的压力小于重力' },
  arcDip: { tool: 'add-arc-dip', icon: 'arcDip', label: '凹形桥', tip: '凹形圆弧桥面（半径 2 m）：物体在最低点对桥面的压力大于重力' },
  arcGroove: { tool: 'add-arc-groove', icon: 'arcGroove', label: '可动槽', tip: '放在光滑水平面上可以滑动的半圆槽（2 kg，不翻转）：小球与槽组成的系统水平方向动量守恒' },
  hoop: { tool: 'add-hoop', icon: 'hoop', label: '圆环', tip: '可滚动的细圆环（I ≈ mr²），与圆柱比较滚动快慢' },
  board: { tool: 'add-board', icon: 'board', label: '长木板', tip: '可运动的长木板（2 kg），用于板块模型' },
  cart: { tool: 'add-cart', icon: 'cart', label: '小车', tip: '带轮的小车（1 kg，与地面无摩擦）' },
  steps: { tool: 'add-steps', icon: 'steps', label: '台阶', tip: '三级固定台阶（每级高 0.3 m、深 0.4 m）' },
  pendulum: { tool: 'add-pendulum', icon: 'pendulum', label: '单摆', tip: '在单击处挂一个单摆：摆长 1 m、摆球 0.2 kg，从 30° 释放' }
})
/** Always on top (D86). */
export const COMMON: ToolDef[] = [T.select, T.pan, T.ball, T.block, T.ground, T.incline, T.rope, T.spring]
/** Category pages, one shown at a time (D86). */
export const PAGES: Array<{ id: string; title: string; tools: ToolDef[] }> = trDeep([
  { id: 'body', title: '物体', tools: [T.disc, T.wedge, T.polygon, T.wall, T.conveyor, T.pulley, T.hoop, T.board, T.cart, T.steps] },
  { id: 'track', title: '轨道', tools: [T.arcQuarter, T.arcHalf, T.arcLoop, T.arcHump, T.arcDip, T.arcGroove, T.pendulum] },
  { id: 'connect', title: '连接', tools: [T.rod, T.damper, T.hinge, T.weld, T.slider, T.motor, T.gear] },
  { id: 'field', title: '力与场', tools: [T.force, T.central, T.charge, T.fixedCharge, T.efield, T.bfield] },
  { id: 'edit', title: '编辑', tools: [T.cut, T.combine] },
  { id: 'mark', title: '标注', tools: [T.ruler, T.angle, T.text, T.arrow] }
])

/** Every tool, common ones first. */
export const ALL_TOOLS: ToolDef[] = [...COMMON, ...PAGES.flatMap(p => p.tools)]

/** The field buttons switch the scene's uniform field on or off and show its settings (26.54). */
export function toggleField(kind: 'electric' | 'magnetic') {
  const on = !(kind === 'electric' ? state.scene.settings.electric : state.scene.settings.magnetic)
  edit(sc => {
    if (kind === 'electric') { if (on) sc.settings.electric = { E: { x: 0, y: -100 } }; else delete sc.settings.electric }
    else if (on) sc.settings.magnetic = { B: 1 }; else delete sc.settings.magnetic
  })
  delete settings.ui.sections['scene.fields']
  state.rightTab = 'settings'
}

/** The field tool is on (its field exists in the scene). */
export const fieldOn = (t: Tool) => (t === 'field-electric' ? !!state.scene.settings.electric : t === 'field-magnetic' ? !!state.scene.settings.magnetic : false)

/** Choose a tool (or switch a field). */
export function pickTool(t: Tool) {
  if (t === 'field-electric' || t === 'field-magnetic') { toggleField(t === 'field-electric' ? 'electric' : 'magnetic'); return }
  state.tool = t
  state.pendingConnector = null
  clearDrafts()
}
