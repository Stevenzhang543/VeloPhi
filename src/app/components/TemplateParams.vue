<script setup lang="ts">
/**
 * "题目参数" (26.59, D173): all parameters of the template the current scene was built from, in one place at the top
 * of the properties tab. Changing one rebuilds the scene from the template as one undoable step (camera, run length
 * and AI notes kept), so a teacher does not have to visit the body, material and scene pages. Hidden while a student
 * answers a problem (the numbers are part of the problem then).
 */
import { computed } from 'vue'
import { tl } from '../../i18n'
import { state, showToast } from '../store'
import { applyTemplateParams, currentTemplate } from '../templateParams'
import NumField from './NumField.vue'

const cur = computed(() => (state.problem && !state.problem.editing ? null : currentTemplate()))
function set(key: string, v: number) {
  const r = applyTemplateParams({ [key]: v })
  if (!r.ok) showToast(r.error, true)
}
</script>

<template>
  <section v-if="cur" class="template-params group" data-ui="template-params" :aria-label="tl('题目参数')">
    <div class="tp-head"><b>{{ tl('题目参数') }}</b><span class="tiny muted">{{ cur.info.name }}</span></div>
    <div v-for="p in cur.info.params" :key="p.key" class="row">
      <label :title="p.label">{{ p.label }}</label>
      <NumField :model-value="cur.values[p.key]" :label="p.unit" :min="p.min" :max="p.max" :step="p.step" @update:model-value="v => set(p.key, v)" />
    </div>
    <p class="tiny muted note">{{ tl('改一个参数即按模板重建场景（可撤销），视图与运行时长不变。') }}</p>
  </section>
</template>

<style scoped>
.template-params { display: grid; gap: 2px; }
.tp-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 2px 0 4px; }
.row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); align-items: center; gap: 8px; min-height: 30px; }
.row label { color: var(--text-2); font-size: var(--type-small); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.note { margin: 4px 0 0; }
</style>
