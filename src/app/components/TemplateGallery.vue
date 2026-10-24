<script setup lang="ts">
import { computed, ref } from 'vue'
import { state, loadScene } from '../store'
import { TEMPLATES } from '../../templates'
import type { TemplateInfo } from '../../templates'
import NumField from './NumField.vue'
import Icon from './Icon.vue'

const chosen = ref<TemplateInfo>(TEMPLATES[0])
const values = ref<Record<string, number>>({})
function choose(t: TemplateInfo) {
  chosen.value = t
  values.value = Object.fromEntries(t.params.map(p => [p.key, p.value]))
}
choose(TEMPLATES[0])
const groups = computed(() => {
  const m = new Map<string, TemplateInfo[]>()
  for (const t of TEMPLATES) { const l = m.get(t.group) ?? []; l.push(t); m.set(t.group, l) }
  return [...m.entries()]
})
const preview = computed(() => { try { return chosen.value.build(values.value).description } catch (e) { return (e as Error).message } })

function create() {
  if (state.dirty && !confirm('当前场景有未保存的修改，确定要用模板替换吗？')) return
  const scene = chosen.value.build(values.value)
  scene.extra = { ...(scene.extra ?? {}), template: { id: chosen.value.id, values: { ...values.value } } }
  loadScene(scene, null)
  state.showTemplates = false
  state.rightTab = 'formula'
}
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="state.showTemplates = false">
    <div class="dialog">
      <div class="dialog-header"><Icon name="template" :size="18" />经典模型模板<span class="spacer" /><button class="btn icon ghost" @click="state.showTemplates = false"><Icon name="close" /></button></div>
      <div class="dialog-body gallery">
        <nav>
          <template v-for="[g, list] in groups" :key="g">
            <div class="tiny muted gname">{{ g }}</div>
            <button v-for="t in list" :key="t.id" class="titem" :class="{ on: chosen.id === t.id }" @click="choose(t)">
              <span>{{ t.name }}</span><span class="tiny muted">{{ t.description }}</span>
            </button>
          </template>
        </nav>
        <section>
          <h3>{{ chosen.name }}</h3>
          <p class="small muted">{{ preview }}</p>
          <div class="group">
            <div v-for="p in chosen.params" :key="p.key" class="row">
              <label>{{ p.label }}</label>
              <NumField class="grow" :model-value="values[p.key]" :unit="p.unit" :min="p.min" :max="p.max" :step="p.step ?? 0.1" @update:model-value="v => (values[p.key] = v)" />
            </div>
          </div>
          <p class="tiny muted">创建后所有物体、连接件和参数都可以继续编辑。角度在场景中以弧度保存。</p>
        </section>
      </div>
      <div class="dialog-footer">
        <button class="btn" @click="state.showTemplates = false">取消</button>
        <button class="btn primary" @click="create">创建场景</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gallery { display: grid; grid-template-columns: 260px 1fr; gap: 16px; min-height: 420px; }
nav { overflow: auto; max-height: 60vh; padding-right: 4px; }
.gname { margin: 10px 4px 4px; font-weight: 600; }
.titem { display: flex; flex-direction: column; align-items: flex-start; width: 100%; border: 0; background: transparent; border-radius: 8px; padding: 6px 8px; cursor: pointer; text-align: left; gap: 1px; }
.titem:hover { background: var(--hover); }
.titem.on { background: var(--accent-soft); }
.titem.on > span:first-child { color: var(--accent); font-weight: 600; }
h3 { margin: 4px 0 4px; font-size: 17px; }
.row > label { width: 150px; }
</style>
