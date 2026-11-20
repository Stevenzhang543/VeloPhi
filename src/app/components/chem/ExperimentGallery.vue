<script setup lang="ts">
/**
 * The gallery of guided experiments (26.64, D270): the forty experiments in their four groups. Choosing one lays out
 * its apparatus on a fresh bench (the page offers the previous bench back). An experiment that is not offered is
 * listed with the reason — what the model or the catalogue lacks — and cannot be started.
 */
import { computed, ref } from 'vue'
import { tl } from '../../../i18n'
import { EXPERIMENTS, GROUPS } from '../../../chem/experiments'
import type { Experiment } from '../../../chem/experiments'
import Icon from '../Icon.vue'
import { vDialog } from '../../focusTrap'
import { groupLabel } from './guide'

const emit = defineEmits<{ (e: 'close'): void; (e: 'start', id: string): void }>()
const query = ref('')
const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  return GROUPS.map(g => ({ id: g, label: groupLabel(g), items: EXPERIMENTS.filter(e => e.group === g && (!q || tl(e.title).toLowerCase().includes(q) || e.title.includes(q))) })).filter(g => g.items.length)
})
const note = (e: Experiment) => (e.unavailable ? tl(e.unavailable) : tl(e.goal))
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="emit('close')">
    <div v-dialog="() => emit('close')" class="dialog gallery" role="dialog" :aria-label="tl('引导实验')" data-ui="chem-guide-gallery">
      <div class="dialog-header"><Icon name="graduation" :size="18" />{{ tl('引导实验') }}<span class="spacer" /><button type="button" class="btn icon ghost" :title="tl('关闭')" :aria-label="tl('关闭')" @click="emit('close')"><Icon name="close" /></button></div>
      <div class="dialog-body body">
        <input v-model="query" class="field find" type="search" :placeholder="tl('查找实验')" :aria-label="tl('查找实验')" data-ui="chem-guide-find" />
        <section v-for="g in groups" :key="g.id" class="group">
          <h3 class="gh">{{ g.label }}<span class="count num">{{ g.items.length }}</span></h3>
          <ul class="list">
            <li v-for="e in g.items" :key="e.id">
              <button type="button" class="row" :disabled="!!e.unavailable" :data-experiment="e.id" @click="emit('start', e.id)">
                <span class="title">{{ tl(e.title) }}<span v-if="e.unavailable" class="tag off">{{ tl('暂未提供') }}</span><span v-else-if="e.reduced" class="tag">{{ tl('部分提供') }}</span></span>
                <span class="line">{{ note(e) }}</span>
              </button>
            </li>
          </ul>
        </section>
        <p v-if="!groups.length" class="none">{{ tl('没有匹配的实验') }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gallery { width: min(720px, calc(100vw - 32px)); }
.spacer { flex: 1; }
.body { max-height: min(72vh, 640px); overflow: auto; display: flex; flex-direction: column; gap: var(--space-3); }
.find { width: 100%; }
.group { display: flex; flex-direction: column; gap: var(--space-1); }
.gh { display: flex; align-items: baseline; gap: var(--space-2); margin: 0; font-size: var(--type-small); font-weight: var(--weight-strong); color: var(--text-2); }
.count { font-weight: var(--weight-regular); }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.row { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-1); width: 100%; min-height: var(--touch-min); padding: var(--space-2); border: 0; border-radius: var(--radius-row); background: transparent; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
.row:hover:not(:disabled), .row:focus-visible { background: var(--hover); }
.row:disabled { cursor: default; }
.row:disabled .title { color: var(--text-2); }
.title { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); font-weight: var(--weight-medium); }
.line { font-size: var(--type-small); color: var(--text-2); line-height: var(--line-body); }
.tag { padding: 0 var(--space-2); border-radius: var(--radius-pill); border: 1px solid var(--separator); font-size: var(--type-tiny); font-weight: var(--weight-regular); color: var(--text-2); white-space: nowrap; }
.tag.off { color: var(--danger); }
.none { margin: 0; color: var(--text-2); }
</style>
