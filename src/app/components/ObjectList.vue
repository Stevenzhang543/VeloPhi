<script setup lang="ts">
/** The objects of the scene (26.60, D205; from the 26.54 left panel): bodies, pulleys, connectors and annotations. */
import { tl } from '../../i18n'
import { state } from '../store'
import { editor } from '../editor/editorState'
import Icon from './Icon.vue'

const emit = defineEmits<{ pick: [] }>()
function selectItem(kind: 'body' | 'connector' | 'pulley', id: string) {
  editor.annotationId = null
  state.selection = { kind, id }
  state.rightTab = 'inspect'
  emit('pick')
}
function selectAnnotation(id: string) { state.selection = null; editor.annotationId = id; emit('pick') }
const annText = (a: { type: string; text?: string }) => (a.type === 'text' ? a.text || tl('文字') : ({ arrow: tl('箭头'), ruler: tl('尺子'), angle: tl('量角器') } as Record<string, string>)[a.type] ?? a.type)
const kindText = (k: string) => ({ particle: tl('质点'), rigid: tl('刚体'), static: tl('固定') } as Record<string, string>)[k] ?? k
const connText = (k: string) => ({ rope: tl('绳'), rod: tl('杆'), spring: tl('弹簧'), hinge: tl('铰链'), force: tl('力'), damper: tl('阻尼器'), weld: tl('焊接'), slider: tl('滑轨'), motor: tl('马达'), gear: tl('齿轮'), central: tl('有心力') } as Record<string, string>)[k] ?? k
</script>

<template>
  <div class="objects" role="list" :aria-label="tl('对象')">
    <button v-for="b in state.scene.bodies" :key="b.id" class="item" role="listitem" :class="{ on: state.selection?.id === b.id }" @click="selectItem('body', b.id)">
      <span class="swatch" :style="{ background: b.kind === 'static' ? 'transparent' : b.color, borderColor: b.kind === 'static' ? 'var(--text-3)' : b.color }" />
      <span class="grow">{{ b.name }}</span>
      <span v-if="b.charge" class="tiny charge" :class="b.charge > 0 ? 'pos' : 'neg'">{{ b.charge > 0 ? '+' : '−' }}</span>
      <span class="tiny muted">{{ b.kind === 'static' && b.beltSpeed ? tl('传送带') : kindText(b.kind) }}</span>
    </button>
    <button v-for="p in state.scene.pulleys" :key="p.id" class="item" role="listitem" :class="{ on: state.selection?.id === p.id }" @click="selectItem('pulley', p.id)">
      <Icon name="pulley" :size="14" /><span class="grow">{{ p.name }}</span><span class="tiny muted">{{ tl('滑轮') }}</span>
    </button>
    <button v-for="c in state.scene.connectors" :key="c.id" class="item" role="listitem" :class="{ on: state.selection?.id === c.id }" @click="selectItem('connector', c.id)">
      <Icon :name="c.type === 'force' ? 'force' : c.type" :size="14" /><span class="grow">{{ c.name }}</span><span class="tiny muted">{{ connText(c.type) }}</span>
    </button>
    <button v-for="a in state.scene.annotations" :key="a.id" class="item" role="listitem" :class="{ on: editor.annotationId === a.id }" @click="selectAnnotation(a.id)">
      <Icon :name="a.type === 'angle' ? 'protractor' : a.type" :size="14" /><span class="grow">{{ annText(a) }}</span><span class="tiny muted">{{ tl('标注') }}</span>
    </button>
    <div v-if="state.scene.bodies.length === 0" class="empty">{{ tl('从“模板”开始，或用工具搭建场景。') }}</div>
  </div>
</template>

<style scoped>
.objects { display: flex; flex-direction: column; gap: 1px; }
.item { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: transparent; padding: 6px 8px; border-radius: var(--radius-row); cursor: pointer; text-align: left; color: var(--text); font: inherit; font-size: var(--type-small); min-height: 30px; }
.item:hover { background: var(--hover); }
.item.on { background: var(--accent-soft); color: var(--accent); }
.swatch { width: 12px; height: 12px; border-radius: 3px; border: 1.5px solid; flex: 0 0 auto; }
.grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.charge { font-weight: 700; }
.charge.pos { color: #dc2626; }
.charge.neg { color: #2563eb; }
.empty { color: var(--text-3); font-size: var(--type-small); padding: 8px; }
</style>
