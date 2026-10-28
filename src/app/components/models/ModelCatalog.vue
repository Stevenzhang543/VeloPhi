<script setup lang="ts">
/**
 * Model catalogue (26.56, D105; UX01, UX04): the 180 model families of the blueprint, searchable and filtered by
 * domain, stage, maturity and status, with the chosen model's calculator on the right. Maturity and status are the
 * honest ones of the coverage matrix (L4 is never claimed: it needs trials with learners).
 *
 * Mounted by App.vue while `state.showModels` is true; `state.modelId` picks the model.
 */
import { computed, onMounted, ref } from 'vue'
import { dialogKeys } from '../../focusTrap'
import { tl } from '../../../i18n'
import { state } from '../../store'
import { MODELS } from '../../../content/models'
import type { Level, Stage, Status } from '../../../content/models/types'
import { LEVEL_TEXT, STAGE_TEXT, STATUS_TEXT, T3 } from '../../models/labels'
import ModelView from './ModelView.vue'
import Icon from '../Icon.vue'

const DOMAINS: Array<[string, string]> = [['G', '通用'], ['M', '力学'], ['F', '流体与连续介质'], ['W', '振动与波'], ['T', '热学'], ['E', '电学'], ['B', '磁与感应'], ['O', '光学'], ['Q', '量子'], ['N', '原子核'], ['R', '相对论与天体'], ['X', '场与前沿']]
const q = ref('')
const domain = ref('')
const stage = ref<'' | Stage>('')
const level = ref<'' | `${Level}`>('')
const status = ref<'' | Status>('')
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
const list = computed(() => {
  const w = norm(q.value)
  return MODELS.filter(m =>
    (!domain.value || m.id[0] === domain.value) && (!stage.value || m.stages.includes(stage.value)) && (!level.value || String(m.level) === level.value) && (!status.value || m.status === status.value) &&
    (!w || norm(`${m.id} ${m.title.zh} ${m.title.en} ${m.title.de} ${T3(m.point)}`).includes(w)))
})
const counts = computed(() => {
  const c = { 0: 0, 1: 0, 2: 0, 3: 0 } as Record<Level, number>
  for (const m of MODELS) c[m.level]++
  return c
})
const current = computed(() => state.modelId ?? list.value[0]?.id ?? 'G01')
function pick(id: string) { state.modelId = id }
function close() { state.showModels = false }
const root = ref<HTMLElement | null>(null)
onMounted(() => root.value?.focus())
function onKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  e.preventDefault()
  const k = list.value.findIndex(m => m.id === current.value)
  const n = list.value[Math.max(0, Math.min(list.value.length - 1, k + (e.key === 'ArrowDown' ? 1 : -1)))]
  if (n) { pick(n.id); document.getElementById(`mdl-${n.id}`)?.focus() }
}
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="close">
    <div ref="root" class="dialog catalog" role="dialog" aria-modal="true" tabindex="-1" :aria-label="tl('模型目录')" @keydown="dialogKeys($event, root, close)">
      <div class="dialog-header"><Icon name="layers" :size="18" />{{ tl('模型目录') }}<span class="tiny muted sum">{{ tl('{0} 个模型族：L3 {1} · L2 {2} · L1 {3} · L0 {4}', [MODELS.length, counts[3], counts[2], counts[1], counts[0]]) }}</span><span class="spacer" /><button class="btn icon ghost" :title="tl('关闭')" @click="close"><Icon name="close" /></button></div>
      <div class="dialog-body body">
        <aside>
          <input v-model="q" class="search" type="search" :placeholder="tl('搜索编号、名称…')" :aria-label="tl('搜索模型')" />
          <div class="filters">
            <select v-model="domain" :aria-label="tl('领域')"><option value="">{{ tl('全部领域') }}</option><option v-for="[d, n] in DOMAINS" :key="d" :value="d">{{ d }} · {{ tl(n) }}</option></select>
            <select v-model="stage" :aria-label="tl('学段')"><option value="">{{ tl('全部学段') }}</option><option v-for="(t, s) in STAGE_TEXT" :key="s" :value="s">{{ t }}</option></select>
            <select v-model="level" :aria-label="tl('成熟度')"><option value="">{{ tl('全部成熟度') }}</option><option v-for="(t, l) in LEVEL_TEXT" :key="l" :value="String(l)">{{ t }}</option></select>
            <select v-model="status" :aria-label="tl('状态')"><option value="">{{ tl('全部状态') }}</option><option v-for="(t, s) in STATUS_TEXT" :key="s" :value="s">{{ t }}</option></select>
          </div>
          <div class="list" role="listbox" :aria-label="tl('模型')" @keydown="onKey">
            <button v-for="m in list" :id="`mdl-${m.id}`" :key="m.id" class="row" :class="{ on: m.id === current }" role="option" :aria-selected="m.id === current" @click="pick(m.id)">
              <span class="mono id">{{ m.id }}</span><span class="name">{{ T3(m.title) }}</span><span class="tiny lv" :class="`lv${m.level}`">L{{ m.level }}</span>
            </button>
            <p v-if="!list.length" class="small muted">{{ tl('没有符合条件的模型。') }}</p>
          </div>
        </aside>
        <section class="view"><ModelView :id="current" :key="current" /></section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.catalog { width: min(1180px, 97vw); }
.sum { margin-left: 10px; }
.spacer { flex: 1; }
.body { display: grid; grid-template-columns: 280px 1fr; gap: 14px; height: 74vh; }
aside { display: flex; flex-direction: column; gap: 6px; min-height: 0; }
.search { width: 100%; }
.filters { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.list { overflow: auto; flex: 1; min-height: 0; }
.row { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: transparent; border-radius: 7px; padding: 4px 6px; cursor: pointer; text-align: left; color: var(--text); font: inherit; }
.row:hover { background: var(--hover); }
.row.on { background: var(--accent-soft); color: var(--accent); }
.id { width: 34px; flex: 0 0 auto; }
.name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lv { border: 1px solid var(--separator); border-radius: 5px; padding: 0 4px; color: var(--text-2); }
.lv.lv3 { color: var(--success, #16a34a); border-color: currentColor; }
.view { overflow: auto; padding-right: 8px; min-height: 0; }
.mono { font-family: var(--font-mono); }
@media (max-width: 760px) {
  .body { grid-template-columns: 1fr; height: auto; max-height: 80vh; overflow: auto; }
  .list { max-height: 30vh; }
}
</style>
