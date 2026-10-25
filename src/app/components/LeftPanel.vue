<script setup lang="ts">
/**
 * Left panel of the studio: the tool palette (objects, environment, connectors and forces, measuring and
 * annotation tools), the grid-snap switch and the list of every object in the scene.
 */
import { tl } from '../../i18n'
import { computed } from 'vue'
import { state } from '../store'
import type { Tool } from '../store'
import { settings, fmtQ } from '../settings'
import { editor, clearDrafts } from '../editor/editorState'
import Icon from './Icon.vue'

const groups: Array<{ title: string; tools: Array<{ tool: Tool; icon: string; label: string; tip: string }> }> = [
  { title: tl('操作'), tools: [
    { tool: 'select', icon: 'select', label: tl('选择'), tip: tl('选择、拖动物体；选中后拖动手柄改大小、旋转或编辑顶点（V）') },
    { tool: 'pan', icon: 'pan', label: tl('平移'), tip: tl('拖动视图（H；也可按住空格、中键或右键拖动）') }
  ] },
  { title: tl('物体'), tools: [
    { tool: 'add-ball', icon: 'ball', label: tl('小球'), tip: tl('质点小球（只平动）：单击放置，拖动设定半径（O）') },
    { tool: 'add-block', icon: 'block', label: tl('物块'), tip: tl('矩形刚体：单击放置，从一角拖到对角设定大小（B）') },
    { tool: 'add-disc', icon: 'disc', label: tl('圆柱'), tip: tl('可滚动的匀质圆柱：单击放置，拖动设定半径（C）') },
    { tool: 'add-wedge', icon: 'wedge', label: tl('楔块'), tip: tl('可运动的直角三角形刚体：从直角处拖出底边和高') },
    { tool: 'add-polygon', icon: 'polygon', label: tl('多边形'), tip: tl('依次点击顶点，点击第一个顶点、双击或按 Enter 完成；Esc 取消（P）') }
  ] },
  { title: tl('环境'), tools: [
    { tool: 'add-ground', icon: 'ground', label: tl('地面'), tip: tl('水平固定面：单击放置，水平拖动设定长度（G）') },
    { tool: 'add-incline', icon: 'incline', label: tl('斜面'), tip: tl('固定斜面：单击放置 30° 斜面，或从直角处拖出底边和高（I）') },
    { tool: 'add-wall', icon: 'wall', label: tl('墙'), tip: tl('竖直固定挡板：单击放置，或拖出矩形（W）') },
    { tool: 'add-conveyor', icon: 'conveyor', label: tl('传送带'), tip: tl('以恒定速度运行的水平传送带：水平拖动设定长度') },
    { tool: 'add-pulley', icon: 'pulley', label: tl('定滑轮'), tip: tl('轴固定的轻质光滑滑轮：单击放置，拖动设定半径') }
  ] },
  { title: tl('连接与外力'), tools: [
    { tool: 'connect-rope', icon: 'rope', label: tl('轻绳'), tip: tl('只能拉、不可伸长；可绕过滑轮') },
    { tool: 'connect-rod', icon: 'rod', label: tl('轻杆'), tip: tl('长度不变，可拉可压') },
    { tool: 'connect-spring', icon: 'spring', label: tl('弹簧'), tip: tl('胡克定律 F = kx，可设阻尼') },
    { tool: 'connect-hinge', icon: 'hinge', label: tl('铰链'), tip: tl('光滑转轴') },
    { tool: 'add-force', icon: 'force', label: tl('恒力'), tip: tl('方向和大小不变的外力') }
  ] },
  { title: tl('测量与标注'), tools: [
    { tool: 'measure-ruler', icon: 'ruler', label: tl('尺子'), tip: tl('拖动测量长度和与水平面的夹角，吸附到顶点和质心（M）') },
    { tool: 'measure-angle', icon: 'protractor', label: tl('量角器'), tip: tl('依次点击角的顶点和两边上的点（A）') },
    { tool: 'annotate-text', icon: 'text', label: tl('文字'), tip: tl('点击放置文字标注，双击已有文字可修改（T）') },
    { tool: 'annotate-arrow', icon: 'arrow', label: tl('箭头'), tip: tl('拖动画出标注箭头（L）') }
  ] }
]

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
const connText = (k: string) => ({ rope: tl('绳'), rod: tl('杆'), spring: tl('弹簧'), hinge: tl('铰链'), force: tl('力') } as Record<string, string>)[k] ?? k
</script>

<template>
  <div class="pane left">
    <div class="pane-header">{{ tl('工具') }}</div>
    <div class="tools">
      <template v-for="g in groups" :key="g.title">
        <div class="tool-group tiny muted">{{ g.title }}</div>
        <div class="tool-grid">
          <button v-for="t in g.tools" :key="t.tool" class="tool" :class="{ on: state.tool === t.tool }" :title="t.tip" @click="pick(t.tool)">
            <Icon :name="t.icon" :size="20" />
            <span>{{ t.label }}</span>
          </button>
        </div>
      </template>
      <label class="snap-row small" :title="tl('放置、移动、改大小和编辑顶点时对齐网格；按住 Alt 临时关闭')">
        <input v-model="settings.editor.snap" type="checkbox" />
        <Icon name="snap" :size="15" />
        <span class="grow">{{ tl('网格吸附') }}</span>
        <span class="tiny muted">{{ snapText }}</span>
      </label>
    </div>
    <div class="pane-header">{{ tl('对象') }} <span class="tiny muted">{{ state.scene.bodies.length + state.scene.connectors.length + state.scene.pulleys.length + state.scene.annotations.length }}</span></div>
    <div class="pane-body list">
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
    </div>
  </div>
</template>

<style scoped>
.left { width: 100%; height: 100%; }
.tools { padding: 0 10px 6px; }
.tool-group { margin: 6px 2px 4px; font-weight: 600; }
.tool-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.tool { display: flex; flex-direction: column; align-items: center; gap: 2px; border: 0; background: var(--fill); border-radius: 9px; padding: 6px 2px 5px; cursor: pointer; font-size: 11.5px; color: var(--text-2); }
.tool:hover { background: var(--fill-strong); }
.tool.on { background: var(--accent); color: var(--on-accent); }
.snap-row { display: flex; align-items: center; gap: 6px; margin: 8px 2px 0; padding: 4px 6px; border-radius: var(--radius-row); background: var(--fill); cursor: pointer; color: var(--text-2); }
.snap-row input { margin: 0; }
.list { padding-top: 0; }
.item { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: transparent; padding: 5px 8px; border-radius: var(--radius-row); cursor: pointer; text-align: left; }
.item:hover { background: var(--hover); }
.item.on { background: var(--accent-soft); color: var(--accent); }
.swatch { width: 12px; height: 12px; border-radius: 3px; border: 1.5px solid; flex: 0 0 auto; }
.grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
