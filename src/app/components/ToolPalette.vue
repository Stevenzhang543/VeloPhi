<script setup lang="ts">
/**
 * The tool palette (26.60, D205; 26.54 D86 for its content): a search over every tool, the common tools and one
 * category page at a time, each tool with its name. Shown from the tool strip (desktop) or as the tools sheet (phone);
 * choosing a tool emits `pick` so the flyout can close.
 */
import { tl } from '../../i18n'
import { computed, onMounted, ref } from 'vue'
import { state } from '../store'
import type { Tool } from '../store'
import { settings } from '../settings'
import Icon from './Icon.vue'
import type { ToolDef } from '../tools'
import { ALL_TOOLS, COMMON, PAGES, fieldOn, pickTool } from '../tools'

const props = withDefaults(defineProps<{ autofocus?: boolean; touch?: boolean }>(), { autofocus: false, touch: false })
const emit = defineEmits<{ pick: [tool: Tool] }>()
const page = computed(() => PAGES.find(p => p.id === settings.ui.toolTab) ?? PAGES[0])
const query = ref('')
const searchBox = ref<HTMLInputElement | null>(null)
const found = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return null
  return ALL_TOOLS.filter(t => t.label.toLowerCase().includes(q) || t.tip.toLowerCase().includes(q) || (t.key ?? '').toLowerCase() === q || t.tool.includes(q))
})
function onSearchKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { query.value = ''; (e.target as HTMLInputElement).blur() }
  if (e.key === 'Enter' && found.value?.length) choose(found.value[0])
}
const isOn = (t: Tool) => state.tool === t || fieldOn(t)
function choose(t: ToolDef) { pickTool(t.tool); query.value = ''; emit('pick', t.tool) }
onMounted(() => { if (props.autofocus) searchBox.value?.focus() })
</script>

<template>
  <div class="palette" :class="{ touch }">
    <label class="tsearch">
      <Icon name="search" :size="14" />
      <input ref="searchBox" v-model="query" class="field" type="search" :placeholder="tl('搜索工具')" :aria-label="tl('搜索工具')" @keydown="onSearchKey" />
    </label>
    <template v-if="found">
      <div class="ptitle tiny muted">{{ found.length ? tl('找到 {0} 个工具（Enter 选第一个）', [found.length]) : tl('没有匹配的工具') }}</div>
      <div class="tool-grid">
        <button v-for="t in found" :key="t.tool" class="tool" :class="{ on: isOn(t.tool) }" :title="t.tip" @click="choose(t)"><Icon :name="t.icon" :size="20" /><span>{{ t.label }}</span></button>
      </div>
    </template>
    <template v-else>
      <div class="ptitle tiny muted">{{ tl('常用') }}</div>
      <div class="tool-grid">
        <button v-for="t in COMMON" :key="t.tool" class="tool" :class="{ on: isOn(t.tool) }" :title="t.tip" @click="choose(t)"><Icon :name="t.icon" :size="20" /><span>{{ t.label }}</span></button>
      </div>
      <div class="cat-tabs" role="tablist" :aria-label="tl('工具分类')">
        <button v-for="p in PAGES" :key="p.id" role="tab" :aria-selected="page.id === p.id" :class="{ on: page.id === p.id }" @click="settings.ui.toolTab = p.id">{{ p.title }}</button>
      </div>
      <div class="tool-grid" role="tabpanel">
        <button v-for="t in page.tools" :key="t.tool" class="tool" :class="{ on: isOn(t.tool) }" :title="t.tip" @click="choose(t)"><Icon :name="t.icon" :size="20" /><span>{{ t.label }}</span></button>
      </div>
      <p class="tip tiny muted">{{ tl('提示：选中工具后在画布上单击放置，拖动可拉出大小；Esc 回到选择。') }}</p>
    </template>
  </div>
</template>

<style scoped>
.palette { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.tsearch { display: flex; align-items: center; gap: 4px; background: var(--fill); border-radius: 8px; padding: 0 8px; color: var(--text-2); }
.tsearch .field { border: 0; background: transparent; flex: 1; min-width: 0; height: calc(28px * var(--zoom)); padding: 0; box-shadow: none; }
.ptitle { margin: 6px 2px 2px; font-weight: 600; }
.tool-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
.tool {
  display: flex; flex-direction: column; align-items: center; gap: 2px; border: 0; background: var(--fill); border-radius: 9px; padding: 6px 2px 5px;
  cursor: pointer; font-size: 11px; color: var(--text-2); min-width: 0;
  transition: background var(--dur-2) var(--ease-out), color var(--dur-2) var(--ease-out), transform var(--dur-1) var(--ease-out);
}
.tool span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tool:hover { background: var(--fill-strong); }
.tool:active { transform: scale(0.95); }
.tool.on { background: var(--accent); color: var(--on-accent); }
.cat-tabs { display: flex; gap: 2px; margin: 6px 0 4px; border-bottom: 1px solid var(--separator); overflow-x: auto; }
.cat-tabs button { flex: 1 0 auto; border: 0; background: none; padding: 4px 6px 5px; font-size: var(--type-small); color: var(--text-2); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
.cat-tabs button:hover { color: var(--text); }
.cat-tabs button.on { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
.tip { margin: 6px 2px 0; }
/* Phones (D206): five columns of large targets */
.touch .tool-grid { grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 6px; }
.touch .tool { min-height: 60px; font-size: 12px; justify-content: center; }
.touch .cat-tabs button { min-height: 40px; font-size: var(--type-body); }
.touch .tsearch .field { height: 40px; }
</style>
