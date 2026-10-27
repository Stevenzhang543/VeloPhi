<script setup lang="ts">
/**
 * Left panel of the studio (26.54, D86): eight common tools always on top, the other tools on category pages
 * (bodies, connectors, forces and fields, editing, annotation) of which one is shown at a time, a search over every
 * tool (name, description, shortcut), the snapping switches as icons in the header, and the list of objects
 * (folded by default, with its count). The palette can still shrink to an icon rail (26.52, D56). The category
 * page is remembered in the settings.
 */
import { tl } from '../../i18n'
import { computed, ref } from 'vue'
import { state } from '../store'
import type { Tool } from '../store'
import { settings, fmtQ } from '../settings'
import { editor } from '../editor/editorState'
import Icon from './Icon.vue'
import Section from './Section.vue'
import type { ToolDef } from '../tools'
import { ALL_TOOLS, COMMON, PAGES, fieldOn, pickTool } from '../tools'
import { narrow, railOn } from '../layout'

const page = computed(() => PAGES.find(p => p.id === settings.ui.toolTab) ?? PAGES[0])
const ALL: ToolDef[] = ALL_TOOLS

// ---- Search ----
const query = ref('')
const found = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return null
  return ALL.filter(t => t.label.toLowerCase().includes(q) || t.tip.toLowerCase().includes(q) || (t.key ?? '').toLowerCase() === q || t.tool.includes(q))
})
function onSearchKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { query.value = ''; (e.target as HTMLInputElement).blur() }
  if (e.key === 'Enter' && found.value?.length) { pick(found.value[0].tool); query.value = '' }
}

const objectCount = computed(() => state.scene.bodies.length + state.scene.connectors.length + state.scene.pulleys.length + state.scene.annotations.length)

const pick = pickTool
const isOn = (t: Tool) => state.tool === t || fieldOn(t)

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
  <div class="pane left" :class="{ rail: railOn }">
    <div class="pane-header head">
      <template v-if="!railOn">
        <label class="tsearch">
          <Icon name="search" :size="14" />
          <input v-model="query" class="field" type="search" :placeholder="tl('搜索工具')" :aria-label="tl('搜索工具')" @keydown="onSearchKey" />
        </label>
        <button class="btn icon ghost small snap-btn" :class="{ on: settings.editor.objectSnap }" :aria-pressed="settings.editor.objectSnap" :title="tl('物体吸附：靠近其他物体时吸到刚好接触的位置；按住 Alt 临时关闭')" @click="settings.editor.objectSnap = !settings.editor.objectSnap"><Icon name="magnet" :size="15" /></button>
        <button class="btn icon ghost small snap-btn" :class="{ on: settings.editor.snap }" :aria-pressed="settings.editor.snap" :title="`${tl('网格吸附：放置、移动、改大小和编辑顶点时对齐网格；按住 Alt 临时关闭')}（${snapText}）`" @click="settings.editor.snap = !settings.editor.snap"><Icon name="grid" :size="15" /></button>
      </template>
      <button v-if="!narrow" class="btn icon ghost small rail-btn" :title="settings.ui.toolRail ? tl('展开工具栏') : tl('收成图标栏')" :aria-pressed="settings.ui.toolRail" @click="settings.ui.toolRail = !settings.ui.toolRail"><Icon name="sidebar" :size="16" /></button>
    </div>
    <!-- Icon rail: every tool as an icon, groups separated by a line -->
    <div v-if="railOn" class="rail-tools">
      <button v-for="t in COMMON" :key="t.tool" class="rail-tool" :class="{ on: isOn(t.tool) }" :title="`${t.label} — ${t.tip}`" :aria-label="t.label" @click="pick(t.tool)"><Icon :name="t.icon" :size="20" /></button>
      <template v-for="g in PAGES" :key="g.id">
        <div class="rail-sep" />
        <button v-for="t in g.tools" :key="t.tool" class="rail-tool" :class="{ on: isOn(t.tool) }" :title="`${t.label} — ${t.tip}`" :aria-label="t.label" @click="pick(t.tool)"><Icon :name="t.icon" :size="20" /></button>
      </template>
    </div>
    <div v-else class="tools">
      <!-- Search results replace the palette while there is a query -->
      <template v-if="found">
        <div class="ptitle tiny muted">{{ found.length ? tl('找到 {0} 个工具（Enter 选第一个）', [found.length]) : tl('没有匹配的工具') }}</div>
        <div class="tool-grid">
          <button v-for="t in found" :key="t.tool" class="tool" :class="{ on: isOn(t.tool) }" :title="t.tip" @click="pick(t.tool); query = ''">
            <Icon :name="t.icon" :size="20" /><span>{{ t.label }}</span>
          </button>
        </div>
      </template>
      <template v-else>
        <div class="ptitle tiny muted">{{ tl('常用') }}</div>
        <div class="tool-grid common">
          <button v-for="t in COMMON" :key="t.tool" class="tool" :class="{ on: isOn(t.tool) }" :title="t.tip" @click="pick(t.tool)">
            <Icon :name="t.icon" :size="20" /><span>{{ t.label }}</span>
          </button>
        </div>
        <div class="cat-tabs" role="tablist" :aria-label="tl('工具分类')">
          <button v-for="p in PAGES" :key="p.id" role="tab" :aria-selected="page.id === p.id" :class="{ on: page.id === p.id }" @click="settings.ui.toolTab = p.id">{{ p.title }}</button>
        </div>
        <div class="tool-grid" role="tabpanel">
          <button v-for="t in page.tools" :key="t.tool" class="tool" :class="{ on: isOn(t.tool) }" :title="t.tip" @click="pick(t.tool)">
            <Icon :name="t.icon" :size="20" /><span>{{ t.label }}</span>
          </button>
        </div>
      </template>
    </div>
    <div v-if="!railOn" class="pane-body list">
      <Section id="left.objects" :title="tl('对象')" :count="objectCount" :open="false">
        <button v-for="b in state.scene.bodies" :key="b.id" class="item" :class="{ on: state.selection?.id === b.id }" @click="selectItem('body', b.id)">
          <span class="swatch" :style="{ background: b.kind === 'static' ? 'transparent' : b.color, borderColor: b.kind === 'static' ? 'var(--text-3)' : b.color }" />
          <span class="grow">{{ b.name }}</span>
          <span v-if="b.charge" class="tiny charge" :class="b.charge > 0 ? 'pos' : 'neg'">{{ b.charge > 0 ? '+' : '−' }}</span>
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
.rail-btn, .snap-btn { width: 26px; height: 26px; padding: 0; flex: 0 0 auto; }
.snap-btn { color: var(--text-3, var(--text-2)); }
.snap-btn.on { color: var(--accent); background: var(--accent-soft); }
.tsearch { flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px; background: var(--fill); border-radius: 8px; padding: 0 8px; color: var(--text-2); }
.tsearch .field { border: 0; background: transparent; flex: 1; min-width: 0; height: calc(26px * var(--zoom)); padding: 0; box-shadow: none; }
.tools { padding: 0 10px 6px; overflow: auto; flex: 0 1 auto; min-height: 0; }
.ptitle { margin: 6px 2px 4px; font-weight: 600; }
.tool-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding-bottom: 2px; }
.tool-grid.common { margin-bottom: 8px; }
.tool {
  display: flex; flex-direction: column; align-items: center; gap: 2px; border: 0; background: var(--fill); border-radius: 9px; padding: 6px 2px 5px;
  cursor: pointer; font-size: 11px; color: var(--text-2); min-width: 0;
  transition: background var(--dur-2) var(--ease-out), color var(--dur-2) var(--ease-out), transform var(--dur-1) var(--ease-out), box-shadow var(--dur-2) var(--ease-out);
}
.tool span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tool:hover { background: var(--fill-strong); }
.tool:active { transform: scale(0.95); }
.tool.on { background: var(--accent); color: var(--on-accent); box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 35%, transparent); }
.cat-tabs { display: flex; gap: 2px; margin: 2px 0 6px; border-bottom: 1px solid var(--separator); }
.cat-tabs button { flex: 1; border: 0; background: none; padding: 4px 2px 5px; font-size: var(--type-small); color: var(--text-2); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
.cat-tabs button:hover { color: var(--text); }
.cat-tabs button.on { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
.list { padding-top: 0; }
.item { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: transparent; padding: 5px 8px; border-radius: var(--radius-row); cursor: pointer; text-align: left; transition: background var(--dur-2) var(--ease-out); }
.item:hover { background: var(--hover); }
.item.on { background: var(--accent-soft); color: var(--accent); }
.swatch { width: 12px; height: 12px; border-radius: 3px; border: 1.5px solid; flex: 0 0 auto; }
.grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.charge { font-weight: 700; }
.charge.pos { color: #dc2626; }
.charge.neg { color: #2563eb; }
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
