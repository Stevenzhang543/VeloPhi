<script setup lang="ts">
/**
 * Watch panel: all readings of the selected body at the current frame, and the scene's watch list (values in
 * display units). Values follow `state.panelFrame` only while the panel is visible (`active`).
 */
import { computed, ref } from 'vue'
import { state, edit } from '../store'
import { canonicalQuantityId, evaluateQuantity, listQuantities, makeContext } from '../../core/observe/quantities'
import type { QuantityDef } from '../../core/observe/quantities'
import { useGated } from '../live'
import { fmtNum, unitLabel } from '../settings'
import Tex from './Tex.vue'
import Icon from './Icon.vue'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

const system = computed(() => state.recording?.system ?? null)
const quantities = computed<QuantityDef[]>(() => (system.value ? listQuantities(system.value) : []))
const byIdMap = computed(() => new Map(quantities.value.map(q => [q.id, q])))
/** Definition of a watched id (ids are compared in their listed form: pair.b|a ≡ pair.a|b). */
const qOf = (id: string) => byIdMap.value.get(canonicalQuantityId(id))
const watched = computed(() => new Set(state.scene.watch.map(canonicalQuantityId)))
const frame = useGated(() => props.active, () => state.panelFrame)

/** One observation context per frame, shared by the list and the readings card. */
const ctx = computed(() => {
  const rec = state.recording
  if (!rec || state.stale) return null
  return makeContext(rec, Math.min(frame.value, rec.frameCount - 1))
})

const values = computed(() => {
  const c = ctx.value
  const out = new Map<string, number>()
  if (!c) return out
  for (const id of state.scene.watch) out.set(id, evaluateQuantity(c, id))
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
  const c = ctx.value
  const sel = state.selection
  if (!rec || !c || !sel || sel.kind !== 'body') return null
  const body = rec.system.model.byId.get(sel.id)
  if (!body || !body.dynamic) return null
  const qs = quantities.value.filter(q => q.id.startsWith(`${body.id}.`) || (q.id.startsWith(`contact.${body.id}|`) && (q.id.endsWith('.N') || q.id.endsWith('.f'))))
  const items = qs.map(q => ({ q, v: evaluateQuantity(c, q.id) })).filter(x => !(x.q.id.startsWith('contact.') && x.v === 0))
  // Angular momentum about the centre of mass
  if (body.invInertia > 0) {
    const w = c.X[3 * rec.system.n + 3 * body.index + 2]
    items.push({ q: { id: `${body.id}.Lc`, label: '对质心角动量 Iω', symbol: 'L_C', unit: 'kg·m²/s', group: '物体', owner: body.name }, v: body.inertia * w })
  }
  return { name: body.name, items }
})

const picking = ref('')
function add() {
  const id = picking.value
  picking.value = ''
  if (!id || watched.value.has(canonicalQuantityId(id))) return
  edit(s => s.watch.push(canonicalQuantityId(id)))
}
function remove(id: string) {
  const key = canonicalQuantityId(id)
  edit(s => { s.watch = s.watch.filter(w => canonicalQuantityId(w) !== key) })
  state.chart = state.chart.filter(c => canonicalQuantityId(c) !== key)
}
function toggleChart(id: string) {
  state.chart = state.chart.includes(id) ? state.chart.filter(c => c !== id) : [...state.chart, id]
  state.bottomTab = 'chart'
}
const unitText = (u: string) => unitLabel(u) || '无量纲'
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
            <span class="mono small val">{{ fmtNum(r.v, r.q.unit) }} <span class="unit">{{ unitLabel(r.q.unit) }}</span></span>
            <button class="btn icon ghost tiny-btn" title="加入监视" :disabled="watched.has(r.q.id) || r.q.id.endsWith('.Lc')" @click="picking = r.q.id; add()"><Icon name="plus" :size="13" /></button>
          </template>
        </div>
      </div>
      <div v-else class="tiny muted pick-hint">在画布上点选一个运动物体，这里会列出它在当前时刻的全部读数。</div>
      <div class="group-title">监视列表</div>
      <div class="row add">
        <select v-model="picking" class="field grow">
          <option value="" disabled>添加监视量…</option>
          <optgroup v-for="[g, list] in groups" :key="g" :label="g">
            <option v-for="q in list" :key="q.id" :value="q.id" :disabled="watched.has(q.id)">{{ q.label }}（{{ unitText(q.unit) }}）</option>
          </optgroup>
        </select>
        <button class="btn primary" :disabled="!picking" @click="add">添加</button>
      </div>
      <div v-if="state.scene.watch.length === 0" class="empty">还没有监视量。可在物体属性页快速添加，或从上方列表选择。</div>
      <div class="list">
        <div v-for="id in state.scene.watch" :key="id" class="item">
          <div class="name">
            <Tex v-if="qOf(id)" :tex="qOf(id)!.symbol" />
            <span class="small" :title="id">{{ qOf(id)?.label ?? id }}</span>
            <span class="tiny muted">{{ qOf(id)?.owner ?? '（本场景中没有这个量）' }}</span>
          </div>
          <div class="value mono">
            <template v-if="state.stale">—</template>
            <template v-else>{{ fmtNum(values.get(id) ?? null, qOf(id)?.unit ?? '') }}</template>
            <span class="unit">{{ unitLabel(qOf(id)?.unit ?? '') }}</span>
          </div>
          <div class="ops">
            <button class="btn icon ghost" :class="{ active: state.chart.includes(id) }" title="在图表中显示" @click="toggleChart(id)"><Icon name="chart" /></button>
            <button class="btn icon ghost" title="移除" @click="remove(id)"><Icon name="close" /></button>
          </div>
        </div>
      </div>
      <div class="tiny muted hint">数值为当前帧的仿真结果，单位与有效数字可在“设置 › 单位与数值”中调整。暂停后可逐帧查看。</div>
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
.value { font-size: var(--type-title); font-weight: 600; text-align: right; white-space: nowrap; }
.unit { font-size: var(--type-tiny); color: var(--text-3); margin-left: 4px; font-weight: 400; }
.ops { display: flex; gap: 2px; }
.hint { margin-top: 10px; }
</style>
