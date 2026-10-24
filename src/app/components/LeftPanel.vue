<script setup lang="ts">
import { state } from '../store'
import type { Tool } from '../store'
import Icon from './Icon.vue'

const groups: Array<{ title: string; tools: Array<{ tool: Tool; icon: string; label: string; tip: string }> }> = [
  { title: '操作', tools: [
    { tool: 'select', icon: 'select', label: '选择', tip: '选择并拖动物体（V）' },
    { tool: 'pan', icon: 'pan', label: '平移', tip: '拖动视图（也可按住空格或用中键）' }
  ] },
  { title: '物体', tools: [
    { tool: 'add-ball', icon: 'ball', label: '小球', tip: '质点小球（只平动）' },
    { tool: 'add-block', icon: 'block', label: '物块', tip: '矩形刚体，可放在斜面、木板上' },
    { tool: 'add-disc', icon: 'disc', label: '圆柱', tip: '可滚动的匀质圆柱（圆盘）' },
    { tool: 'add-wedge', icon: 'incline', label: '楔块', tip: '可运动的三角形刚体（多边形）' }
  ] },
  { title: '环境', tools: [
    { tool: 'add-ground', icon: 'ground', label: '地面', tip: '水平固定面，点击处为上表面' },
    { tool: 'add-incline', icon: 'incline', label: '斜面', tip: '倾角 30° 的固定斜面，点击处为左下角' },
    { tool: 'add-wall', icon: 'wall', label: '墙', tip: '竖直固定挡板' },
    { tool: 'add-conveyor', icon: 'conveyor', label: '传送带', tip: '以恒定速度运行的水平传送带' },
    { tool: 'add-pulley', icon: 'pulley', label: '定滑轮', tip: '轴固定的轻质光滑滑轮' }
  ] },
  { title: '连接与外力', tools: [
    { tool: 'connect-rope', icon: 'rope', label: '轻绳', tip: '只能拉、不可伸长；可绕过滑轮' },
    { tool: 'connect-rod', icon: 'rod', label: '轻杆', tip: '长度不变，可拉可压' },
    { tool: 'connect-spring', icon: 'spring', label: '弹簧', tip: '胡克定律 F = kx，可设阻尼' },
    { tool: 'connect-hinge', icon: 'hinge', label: '铰链', tip: '光滑转轴' },
    { tool: 'add-force', icon: 'force', label: '恒力', tip: '方向和大小不变的外力' }
  ] }
]

function pick(t: Tool) {
  state.tool = t
  state.pendingConnector = null
}

function selectItem(kind: 'body' | 'connector' | 'pulley', id: string) {
  state.selection = { kind, id }
  state.rightTab = 'inspect'
}

const kindText = (k: string) => ({ particle: '质点', rigid: '刚体', static: '固定' } as Record<string, string>)[k] ?? k
const connText = (k: string) => ({ rope: '绳', rod: '杆', spring: '弹簧', hinge: '铰链', force: '力' } as Record<string, string>)[k] ?? k
</script>

<template>
  <div class="pane left">
    <div class="pane-header">工具</div>
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
    </div>
    <div class="pane-header">对象 <span class="tiny muted">{{ state.scene.bodies.length + state.scene.connectors.length + state.scene.pulleys.length }}</span></div>
    <div class="pane-body list">
      <button v-for="b in state.scene.bodies" :key="b.id" class="item" :class="{ on: state.selection?.id === b.id }" @click="selectItem('body', b.id)">
        <span class="swatch" :style="{ background: b.kind === 'static' ? 'transparent' : b.color, borderColor: b.kind === 'static' ? 'var(--text-3)' : b.color }" />
        <span class="grow">{{ b.name }}</span>
        <span class="tiny muted">{{ b.kind === 'static' && b.beltSpeed ? '传送带' : kindText(b.kind) }}</span>
      </button>
      <button v-for="p in state.scene.pulleys" :key="p.id" class="item" :class="{ on: state.selection?.id === p.id }" @click="selectItem('pulley', p.id)">
        <Icon name="pulley" :size="14" /><span class="grow">{{ p.name }}</span><span class="tiny muted">滑轮</span>
      </button>
      <button v-for="c in state.scene.connectors" :key="c.id" class="item" :class="{ on: state.selection?.id === c.id }" @click="selectItem('connector', c.id)">
        <Icon :name="c.type === 'force' ? 'force' : c.type" :size="14" /><span class="grow">{{ c.name }}</span><span class="tiny muted">{{ connText(c.type) }}</span>
      </button>
      <div v-if="state.scene.bodies.length === 0" class="empty">从“模板”开始，或用上面的工具搭建场景。</div>
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
.list { padding-top: 0; }
.item { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: transparent; padding: 5px 8px; border-radius: var(--radius-row); cursor: pointer; text-align: left; }
.item:hover { background: var(--hover); }
.item.on { background: var(--accent-soft); color: var(--accent); }
.swatch { width: 12px; height: 12px; border-radius: 3px; border: 1.5px solid; flex: 0 0 auto; }
.grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
