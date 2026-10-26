<script setup lang="ts">
/**
 * Left panel of the studio: the tool palette grouped by task in collapsible sections (26.52, D56), the snapping
 * switches and the list of every object in the scene. The palette can shrink to an icon rail.
 */
import { tl } from '../../i18n'
import { computed } from 'vue'
import { state } from '../store'
import type { Tool } from '../store'
import { settings, fmtQ } from '../settings'
import { editor, clearDrafts } from '../editor/editorState'
import Icon from './Icon.vue'
import Section from './Section.vue'

interface ToolDef { tool: Tool; icon: string; label: string; tip: string }
const T: Record<string, ToolDef> = {
  select: { tool: 'select', icon: 'select', label: tl('选择'), tip: tl('选择、拖动物体；选中后拖动手柄改大小、旋转或编辑顶点（V）') },
  pan: { tool: 'pan', icon: 'pan', label: tl('平移'), tip: tl('拖动视图（H；也可按住空格、中键或右键拖动）') },
  ball: { tool: 'add-ball', icon: 'ball', label: tl('小球'), tip: tl('质点小球（只平动）：单击放置，拖动设定半径（O）') },
  block: { tool: 'add-block', icon: 'block', label: tl('物块'), tip: tl('矩形刚体：单击放置，从一角拖到对角设定大小（B）') },
  disc: { tool: 'add-disc', icon: 'disc', label: tl('圆柱'), tip: tl('可滚动的匀质圆柱：单击放置，拖动设定半径（C）') },
  wedge: { tool: 'add-wedge', icon: 'wedge', label: tl('楔块'), tip: tl('可运动的直角三角形刚体：从直角处拖出底边和高') },
  polygon: { tool: 'add-polygon', icon: 'polygon', label: tl('多边形'), tip: tl('依次点击顶点，点击第一个顶点、双击或按 Enter 完成；Esc 取消（P）') },
  ground: { tool: 'add-ground', icon: 'ground', label: tl('地面'), tip: tl('水平固定面：单击放置，水平拖动设定长度（G）') },
  incline: { tool: 'add-incline', icon: 'incline', label: tl('斜面'), tip: tl('固定斜面：单击放置 30° 斜面，或从直角处拖出底边和高（I）') },
  wall: { tool: 'add-wall', icon: 'wall', label: tl('墙'), tip: tl('竖直固定挡板：单击放置，或拖出矩形（W）') },
  conveyor: { tool: 'add-conveyor', icon: 'conveyor', label: tl('传送带'), tip: tl('以恒定速度运行的水平传送带：水平拖动设定长度') },
  pulley: { tool: 'add-pulley', icon: 'pulley', label: tl('定滑轮'), tip: tl('轴固定的轻质光滑滑轮：单击放置，拖动设定半径') },
  rope: { tool: 'connect-rope', icon: 'rope', label: tl('轻绳'), tip: tl('只能拉、不可伸长；可绕过滑轮') },
  rod: { tool: 'connect-rod', icon: 'rod', label: tl('轻杆'), tip: tl('长度不变，可拉可压') },
  spring: { tool: 'connect-spring', icon: 'spring', label: tl('弹簧'), tip: tl('胡克定律 F = kx，可设阻尼') },
  damper: { tool: 'connect-damper', icon: 'damper', label: tl('阻尼器'), tip: tl('阻力与相对速度成正比 F = cv，没有弹力') },
  hinge: { tool: 'connect-hinge', icon: 'hinge', label: tl('铰链'), tip: tl('光滑转轴') },
  weld: { tool: 'connect-weld', icon: 'weld', label: tl('焊接'), tip: tl('把两个物体连成一个整体，或把物体固定住') },
  slider: { tool: 'connect-slider', icon: 'slider', label: tl('滑轨'), tip: tl('物体只能沿一条直线滑动（移动副）') },
  motor: { tool: 'connect-motor', icon: 'motor', label: tl('马达'), tip: tl('带驱动的转轴：恒定转速或恒定力矩') },
  gear: { tool: 'connect-gear', icon: 'gear', label: tl('齿轮'), tip: tl('两轮转速成比例：ω₁r₁ = ω₂r₂（齿轮或皮带）') },
  force: { tool: 'add-force', icon: 'force', label: tl('恒力'), tip: tl('方向和大小不变的外力') },
  central: { tool: 'add-central', icon: 'central', label: tl('有心力'), tip: tl('指向（或背离）一个中心的力场 F = k·rⁿ：弹性中心力、平方反比引力等') },
  cut: { tool: 'shape-cut', icon: 'cut', label: tl('切割'), tip: tl('拖出一条直线，把矩形或多边形切成几块') },
  combine: { tool: 'shape-combine', icon: 'compound', label: tl('组合'), tip: tl('依次点击几个物体，组合成一个复合体（一个刚体）') },
  ruler: { tool: 'measure-ruler', icon: 'ruler', label: tl('尺子'), tip: tl('拖动测量长度和与水平面的夹角，吸附到顶点和质心（M）') },
  angle: { tool: 'measure-angle', icon: 'protractor', label: tl('量角器'), tip: tl('依次点击角的顶点和两边上的点（A）') },
  text: { tool: 'annotate-text', icon: 'text', label: tl('文字'), tip: tl('点击放置文字标注，双击已有文字可修改（T）') },
  arrow: { tool: 'annotate-arrow', icon: 'arrow', label: tl('箭头'), tip: tl('拖动画出标注箭头（L）') }
}
/** Groups by task (D56): the common tools first, measuring folded by default. */
const groups: Array<{ id: string; title: string; open: boolean; tools: ToolDef[] }> = [
  { id: 'left.common', title: tl('常用'), open: true, tools: [T.select, T.pan, T.ball, T.block, T.ground, T.incline, T.rope, T.spring] },
  { id: 'left.shapes', title: tl('物体与形状'), open: true, tools: [T.disc, T.wedge, T.polygon, T.cut, T.combine] },
  { id: 'left.env', title: tl('环境与场'), open: true, tools: [T.wall, T.conveyor, T.pulley, T.central] },
  { id: 'left.connect', title: tl('连接件与外力'), open: true, tools: [T.rod, T.damper, T.hinge, T.weld, T.slider, T.motor, T.gear, T.force] },
  { id: 'left.measure', title: tl('测量与标注'), open: false, tools: [T.ruler, T.angle, T.text, T.arrow] }
]
const objectCount = computed(() => state.scene.bodies.length + state.scene.connectors.length + state.scene.pulleys.length + state.scene.annotations.length)

function pick(t: Tool) {
  state.tool = t
  state.pendingConnector = null
  clearDrafts()
}

function selectItem(kind: 'body' | 'connector' | 'pulley', id: string) {
  editor.annotationId = null
  state.selection = { kind, id }
  state.rightTab = 'inspect'
}

function selectAnnotation(id: string) {
  state.selection = null
  editor.annotationId = id
}

const snapText = computed(() => (settings.editor.snapStep > 0 ? tl('步长 {0}', [fmtQ(settings.editor.snapStep, 'm', 3)]) : tl('步长随网格')))

const annText = (a: { type: string; text?: string }) => (a.type === 'text' ? a.text || tl('文字') : ({ arrow: tl('箭头'), ruler: tl('尺子'), angle: tl('量角器') } as Record<string, string>)[a.type] ?? a.type)

const kindText = (k: string) => ({ particle: tl('质点'), rigid: tl('刚体'), static: tl('固定') } as Record<string, string>)[k] ?? k
const connText = (k: string) => ({ rope: tl('绳'), rod: tl('杆'), spring: tl('弹簧'), hinge: tl('铰链'), force: tl('力'), damper: tl('阻尼器'), weld: tl('焊接'), slider: tl('滑轨'), motor: tl('马达'), gear: tl('齿轮'), central: tl('有心力') } as Record<string, string>)[k] ?? k
</script>

<template>
  <div class="pane left" :class="{ rail: settings.ui.toolRail }">
    <div class="pane-header head">
      <span v-if="!settings.ui.toolRail" class="grow">{{ tl('工具') }}</span>
      <button class="btn icon ghost small rail-btn" :title="settings.ui.toolRail ? tl('展开工具栏') : tl('收成图标栏')" :aria-pressed="settings.ui.toolRail" @click="settings.ui.toolRail = !settings.ui.toolRail"><Icon name="sidebar" :size="16" /></button>
    </div>
    <!-- Icon rail: every tool as an icon, groups separated by a line -->
    <div v-if="settings.ui.toolRail" class="rail-tools">
      <template v-for="(g, gi) in groups" :key="g.id">
        <div v-if="gi" class="rail-sep" />
        <button v-for="t in g.tools" :key="t.tool" class="rail-tool" :class="{ on: state.tool === t.tool }" :title="`${t.label} — ${t.tip}`" :aria-label="t.label" @click="pick(t.tool)"><Icon :name="t.icon" :size="20" /></button>
      </template>
    </div>
    <div v-else class="tools">
      <Section v-for="g in groups" :id="g.id" :key="g.id" :title="g.title" :open="g.open">
        <div class="tool-grid">
          <button v-for="t in g.tools" :key="t.tool" class="tool" :class="{ on: state.tool === t.tool }" :title="t.tip" @click="pick(t.tool)">
            <Icon :name="t.icon" :size="20" />
            <span>{{ t.label }}</span>
          </button>
        </div>
      </Section>
      <div class="snap-rows">
        <label class="snap-row small" :title="tl('靠近其他物体时吸到刚好接触的位置；按住 Alt 临时关闭')">
          <input v-model="settings.editor.objectSnap" type="checkbox" />
          <Icon name="magnet" :size="15" />
          <span class="grow">{{ tl('物体吸附') }}</span>
        </label>
        <label class="snap-row small" :title="tl('可选：放置、移动、改大小和编辑顶点时对齐网格；按住 Alt 临时关闭')">
          <input v-model="settings.editor.snap" type="checkbox" />
          <Icon name="grid" :size="15" />
          <span class="grow">{{ tl('网格吸附') }}</span>
          <span v-if="settings.editor.snap" class="tiny muted">{{ snapText }}</span>
        </label>
      </div>
    </div>
    <div v-if="!settings.ui.toolRail" class="pane-body list">
      <Section id="left.objects" :title="tl('对象')" :count="objectCount">
        <button v-for="b in state.scene.bodies" :key="b.id" class="item" :class="{ on: state.selection?.id === b.id }" @click="selectItem('body', b.id)">
          <span class="swatch" :style="{ background: b.kind === 'static' ? 'transparent' : b.color, borderColor: b.kind === 'static' ? 'var(--text-3)' : b.color }" />
          <span class="grow">{{ b.name }}</span>
          <span class="tiny muted">{{ b.kind === 'static' && b.beltSpeed ? tl('传送带') : kindText(b.kind) }}</span>
        </button>
        <button v-for="p in state.scene.pulleys" :key="p.id" class="item" :class="{ on: state.selection?.id === p.id }" @click="selectItem('pulley', p.id)">
          <Icon name="pulley" :size="14" /><span class="grow">{{ p.name }}</span><span class="tiny muted">{{ tl('滑轮') }}</span>
        </button>
        <button v-for="c in state.scene.connectors" :key="c.id" class="item" :class="{ on: state.selection?.id === c.id }" @click="selectItem('connector', c.id)">
          <Icon :name="c.type === 'force' ? 'force' : c.type" :size="14" /><span class="grow">{{ c.name }}</span><span class="tiny muted">{{ connText(c.type) }}</span>
        </button>
        <button v-for="a in state.scene.annotations" :key="a.id" class="item" :class="{ on: editor.annotationId === a.id }" @click="selectAnnotation(a.id)">
          <Icon :name="a.type === 'angle' ? 'protractor' : a.type" :size="14" /><span class="grow">{{ annText(a) }}</span><span class="tiny muted">{{ tl('标注') }}</span>
        </button>
        <div v-if="state.scene.bodies.length === 0" class="empty">{{ tl('从“模板”开始，或用上面的工具搭建场景。') }}</div>
      </Section>
    </div>
  </div>
</template>

<style scoped>
.left { width: 100%; height: 100%; }
.head { display: flex; align-items: center; gap: 4px; }
.rail .head { justify-content: center; padding-left: 0; padding-right: 0; }
.rail-btn { width: 26px; height: 26px; padding: 0; }
.tools { padding: 0 10px 6px; overflow: auto; flex: 0 1 auto; min-height: 0; }
.tool-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding-bottom: 2px; }
.tool {
  display: flex; flex-direction: column; align-items: center; gap: 2px; border: 0; background: var(--fill); border-radius: 9px; padding: 6px 2px 5px;
  cursor: pointer; font-size: 11.5px; color: var(--text-2);
  transition: background var(--dur-2) var(--ease-out), color var(--dur-2) var(--ease-out), transform var(--dur-1) var(--ease-out), box-shadow var(--dur-2) var(--ease-out);
}
.tool:hover { background: var(--fill-strong); }
.tool:active { transform: scale(0.95); }
.tool.on { background: var(--accent); color: var(--on-accent); box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 35%, transparent); }
.snap-rows { display: grid; gap: 4px; margin-top: 8px; }
.snap-row { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: var(--radius-row); background: var(--fill); cursor: pointer; color: var(--text-2); }
.snap-row input { margin: 0; }
.list { padding-top: 0; }
.item { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: transparent; padding: 5px 8px; border-radius: var(--radius-row); cursor: pointer; text-align: left; transition: background var(--dur-2) var(--ease-out); }
.item:hover { background: var(--hover); }
.item.on { background: var(--accent-soft); color: var(--accent); }
.swatch { width: 12px; height: 12px; border-radius: 3px; border: 1.5px solid; flex: 0 0 auto; }
.grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Icon rail (D56) */
.rail-tools { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 2px 0 8px; overflow: auto; flex: 1; min-height: 0; }
.rail-sep { width: 60%; height: 1px; background: var(--separator); margin: 4px 0; flex: 0 0 auto; }
.rail-tool {
  width: calc(40px * var(--zoom)); height: calc(36px * var(--zoom)); flex: 0 0 auto; display: grid; place-items: center; border: 0; border-radius: 9px;
  background: transparent; color: var(--text-2); cursor: pointer;
  transition: background var(--dur-2) var(--ease-out), color var(--dur-2) var(--ease-out), transform var(--dur-1) var(--ease-out);
}
.rail-tool:hover { background: var(--fill-strong); }
.rail-tool:active { transform: scale(0.92); }
.rail-tool.on { background: var(--accent); color: var(--on-accent); }
</style>
