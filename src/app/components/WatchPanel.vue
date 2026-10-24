<script setup lang="ts">
import { computed, ref } from 'vue'
import { state, edit } from '../store'
import { evaluateQuantity, listQuantities, makeContext } from '../../core/observe/quantities'
import type { QuantityDef } from '../../core/observe/quantities'
import { formatPlain } from '../../formula/match'
import Tex from './Tex.vue'
import Icon from './Icon.vue'

const quantities = computed<QuantityDef[]>(() => (state.recording ? listQuantities(state.recording.system) : []))
const byId = computed(() => new Map(quantities.value.map(q => [q.id, q])))

const values = computed(() => {
  const rec = state.recording
  if (!rec || state.stale) return new Map<string, number>()
  const ctx = makeContext(rec, Math.min(state.frame, rec.frameCount - 1))
  const out = new Map<string, number>()
  for (const id of state.scene.watch) out.set(id, evaluateQuantity(ctx, id))
  return out
})

const groups = computed(() => {
  const m = new Map<string, QuantityDef[]>()
  for (const q of quantities.value) {
    const key = `${q.group} · ${q.owner}`
    const list = m.get(key) ?? []
    list.push(q); m.set(key, list)
  }
  return [...m.entries()]
})

/** All readings of the selected body at the current frame (the "click to read" card). */
const readings = computed(() => {
  const rec = state.recording
  const sel = state.selection
  if (!rec || state.stale || !sel || sel.kind !== 'body') return null
  const body = rec.system.model.byId.get(sel.id)
  if (!body || !body.dynamic) return null
  const ctx = makeContext(rec, Math.min(state.frame, rec.frameCount - 1))
  const qs = quantities.value.filter(q => q.id.startsWith(`${body.id}.`) || (q.id.startsWith(`contact.${body.id}|`) && (q.id.endsWith('.N') || q.id.endsWith('.f'))))
  const items = qs.map(q => ({ q, v: evaluateQuantity(ctx, q.id) })).filter(x => !(x.q.id.startsWith('contact.') && x.v === 0))
  // angular momentum about the centre of mass
  if (body.invInertia > 0) {
    const w = ctx.X[3 * rec.system.n + 3 * body.index + 2]
    items.push({ q: { id: `${body.id}.Lc`, label: '对质心角动量 Iω', symbol: 'L_C', unit: 'kg·m²/s', group: '物体', owner: body.name }, v: body.inertia * w })
  }
  return { name: body.name, items }
})

const picking = ref('')
function add() {
  const id = picking.value
  if (!id || state.scene.watch.includes(id)) return
  edit(s => s.watch.push(id))
  picking.value = ''
}
function remove(id: string) { edit(s => { s.watch = s.watch.filter(w => w !== id) }); state.chart = state.chart.filter(c => c !== id) }
function toggleChart(id: string) {
  state.chart = state.chart.includes(id) ? state.chart.filter(c => c !== id) : [...state.chart, id]
  state.bottomTab = 'chart'
}
</script>

<template>
  <div class="watch">
    <div v-if="!state.recording" class="empty">运行仿真后可添加监视量。</div>
    <template v-else>
      <div v-if="readings" class="readings">
        <div class="group-title">{{ readings.name }} · 当前时刻读数</div>
        <div class="grid">
          <template v-for="r in readings.items" :key="r.q.id">
            <span class="small muted" :title="r.q.id">{{ r.q.label }}<template v-if="r.q.id.startsWith('contact.')">（{{ r.q.owner }}）</template></span>
            <span class="mono small val">{{ formatPlain(r.v, state.digits) }} <span class="unit">{{ r.q.unit }}</span></span>
            <button class="btn icon ghost tiny-btn" title="加入监视" :disabled="state.scene.watch.includes(r.q.id) || r.q.id.endsWith('.Lc')" @click="picking = r.q.id; add()"><Icon name="plus" :size="13" /></button>
          </template>
        </div>
      </div>
      <div v-else class="tiny muted pick-hint">在画布上点选一个运动物体，这里会列出它在当前时刻的全部读数。</div>
      <div class="group-title">监视列表</div>
      <div class="row add">
        <select v-model="picking" class="field grow">
          <option value="" disabled>添加监视量…</option>
          <optgroup v-for="[g, list] in groups" :key="g" :label="g">
            <option v-for="q in list" :key="q.id" :value="q.id" :disabled="state.scene.watch.includes(q.id)">{{ q.label }}（{{ q.unit || '无量纲' }}）</option>
          </optgroup>
        </select>
        <button class="btn primary" :disabled="!picking" @click="add">添加</button>
      </div>
      <div v-if="state.scene.watch.length === 0" class="empty">还没有监视量。可在物体属性页快速添加，或从上方列表选择。</div>
      <div class="list">
        <div v-for="id in state.scene.watch" :key="id" class="item">
          <div class="name">
            <Tex v-if="byId.get(id)" :tex="byId.get(id)!.symbol" />
            <span class="small">{{ byId.get(id)?.label ?? id }}</span>
            <span class="tiny muted">{{ byId.get(id)?.owner }}</span>
          </div>
          <div class="value mono">
            <template v-if="state.stale">—</template>
            <template v-else>{{ formatPlain(values.get(id) ?? null, state.digits) }}</template>
            <span class="unit">{{ byId.get(id)?.unit }}</span>
          </div>
          <div class="ops">
            <button class="btn icon ghost" :class="{ active: state.chart.includes(id) }" title="在图表中显示" @click="toggleChart(id)"><Icon name="chart" /></button>
            <button class="btn icon ghost" title="移除" @click="remove(id)"><Icon name="close" /></button>
          </div>
        </div>
      </div>
      <div class="tiny muted hint">数值为当前帧的仿真结果（精度可在“设置”中调整）。暂停后可逐帧查看。</div>
    </template>
  </div>
</template>

<style scoped>
.readings .grid { display: grid; grid-template-columns: 1fr auto auto; gap: 1px 8px; align-items: center; background: var(--group); border-radius: var(--radius-group); padding: 6px 6px 6px 10px; margin-bottom: 6px; }
.val { text-align: right; white-space: nowrap; }
.tiny-btn { width: 22px; height: 22px; }
.pick-hint { margin: 2px 2px 8px; }
.add { margin-bottom: 8px; }
.list { display: flex; flex-direction: column; gap: 6px; }
.item { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; background: var(--group); border-radius: var(--radius-group); padding: 6px 8px 6px 10px; }
.name { display: flex; flex-direction: column; min-width: 0; }
.value { font-size: 14px; font-weight: 600; text-align: right; white-space: nowrap; }
.unit { font-size: 11px; color: var(--text-3); margin-left: 4px; font-weight: 400; }
.ops { display: flex; gap: 2px; }
.hint { margin-top: 10px; }
</style>
