<script setup lang="ts">
/**
 * Watch panel: all readings of the selected body at the current frame, and the scene's watch list (values in
 * display units). Values follow `state.panelFrame` only while the panel is visible (`active`).
 */
import { tl, paren } from '../../i18n'
import { computed, ref } from 'vue'
import { state, edit, problemLocked } from '../store'
import ProblemLock from './ProblemLock.vue'
import { canonicalQuantityId, checkCustom, customStatus, groupLabel, listQuantities, nextCustomId, valuesAtFrame } from '../../engine/observe'
import type { QuantityDef } from '../../engine/observe'
import { msgText } from '../../i18n/locale'
import { useGated } from '../live'
import { fmtNum, unitLabel } from '../settings'
import Tex from './Tex.vue'
import Icon from './Icon.vue'
import Section from './Section.vue'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

const quantities = computed<QuantityDef[]>(() => (state.recording ? listQuantities(state.recording) : []))
const byIdMap = computed(() => new Map(quantities.value.map(q => [q.id, q])))
/** Definition of a watched id (ids are compared in their listed form: pair.b|a ≡ pair.a|b). */
const qOf = (id: string) => byIdMap.value.get(canonicalQuantityId(id))
const watched = computed(() => new Set(state.scene.watch.map(canonicalQuantityId)))
const frame = useGated(() => props.active, () => state.panelFrame)

/** The frame read (null without a current recording). */
const shownFrame = computed(() => {
  const rec = state.recording
  if (!rec || state.stale) return null
  return Math.min(frame.value, rec.frameCount - 1)
})

const values = computed(() => {
  const rec = state.recording, k = shownFrame.value
  const out = new Map<string, number>()
  if (!rec || k === null || !state.scene.watch.length) return out
  const v = valuesAtFrame(rec, k, state.scene.watch)
  state.scene.watch.forEach((id, i) => out.set(id, v[i]))
  return out
})

const groups = computed(() => {
  const m = new Map<string, QuantityDef[]>()
  for (const q of quantities.value) {
    const key = q.group === '自定义' ? groupLabel(q.group) : `${groupLabel(q.group)} · ${q.owner}`
    const list = m.get(key) ?? []
    list.push(q); m.set(key, list)
  }
  return [...m.entries()]
})

/** All readings of the selected body at the current frame (the "click to read" card). */
const readings = computed(() => {
  const rec = state.recording
  const k = shownFrame.value
  const sel = state.selection
  if (!rec || k === null || !sel || sel.kind !== 'body') return null
  const body = rec.system.model.byId.get(sel.id)
  if (!body || !body.dynamic) return null
  const qs = quantities.value.filter(q => q.id.startsWith(`${body.id}.`) || (q.id.startsWith(`contact.${body.id}|`) && (q.id.endsWith('.N') || q.id.endsWith('.f'))))
  const v = valuesAtFrame(rec, k, [...qs.map(q => q.id), `${body.id}.omega`])
  const items = qs.map((q, i) => ({ q, v: v[i] })).filter(x => !(x.q.id.startsWith('contact.') && x.v === 0))
  // Angular momentum about the centre of mass
  if (body.invInertia > 0) {
    const w = v[qs.length]
    items.push({ q: { id: `${body.id}.Lc`, label: tl('对质心角动量 Iω'), symbol: 'L_C', unit: 'kg·m²/s', group: '物体', owner: body.name }, v: body.inertia * w })
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
const unitText = (u: string) => unitLabel(u) || tl('无量纲')

// ---- Custom (expression) quantities, 26.51 ----
const customs = computed(() => state.scene.customQuantities ?? [])
/** Compile errors of the scene's custom quantities in the current recording. */
const customErrors = computed(() => new Map((state.recording ? customStatus(state.recording) : []).filter(e => e.error).map(e => [e.id, msgText(e.error)])))
/** The form: a new quantity (editing null) or an existing one. */
const form = ref<{ editing: string | null; name: string; expr: string } | null>(null)
/** Unit or error of the expression in the form, checked as it is typed. */
const formCheck = computed<{ unit: string } | { error: string } | null>(() => {
  const f = form.value
  const rec = state.recording
  if (!f || !rec || !f.expr.trim()) return null
  const r = checkCustom(rec, f.expr)
  return r.ok ? { unit: r.unit } : { error: msgText(r.error) }
})
/** An example expression with the first moving body of the scene. */
const example = computed(() => {
  const b = state.scene.bodies.find(x => x.kind !== 'static')
  return b ? `ek(${b.name}) + ep(${b.name})` : 'E'
})
function newCustom() {
  form.value = { editing: null, name: tl('自定义量 {0}', [customs.value.length + 1]), expr: '' }
}
function editCustom(id: string) {
  const q = customs.value.find(c => c.id === id)
  if (q) form.value = { editing: id, name: q.name, expr: q.expr }
}
function saveCustom() {
  const f = form.value
  if (!f || !formCheck.value || 'error' in formCheck.value) return
  const name = f.name.trim() || f.expr.trim()
  if (f.editing) {
    const id = f.editing
    edit(s => { s.customQuantities = (s.customQuantities ?? []).map(c => (c.id === id ? { id, name, expr: f.expr.trim() } : c)) })
  } else {
    edit(s => {
      const list = s.customQuantities ?? []
      const id = nextCustomId(list)
      s.customQuantities = [...list, { id, name, expr: f.expr.trim() }]
      s.watch.push(`custom.${id}`)
    })
  }
  form.value = null
}
function removeCustom(id: string) {
  const qid = `custom.${id}`
  edit(s => {
    const list = (s.customQuantities ?? []).filter(c => c.id !== id)
    if (list.length) s.customQuantities = list; else delete s.customQuantities
    s.watch = s.watch.filter(w => w !== qid)
  })
  state.chart = state.chart.filter(c => c !== qid)
  if (form.value?.editing === id) form.value = null
}
</script>

<template>
  <div class="watch">
    <ProblemLock v-if="problemLocked()" />
    <div v-else-if="!state.recording" class="empty">{{ tl('运行仿真后可添加监视量。') }}</div>
    <template v-else>
      <Section v-if="readings" id="watch.readings" class="readings" :title="tl('{0} · 当前时刻读数', [readings.name])">
        <div class="grid">
          <template v-for="r in readings.items" :key="r.q.id">
            <span class="small muted" :title="r.q.id">{{ r.q.label }}<template v-if="r.q.id.startsWith('contact.')">{{ paren(r.q.owner) }}</template></span>
            <span class="mono small val">{{ fmtNum(r.v, r.q.unit) }} <span class="unit">{{ unitLabel(r.q.unit) }}</span></span>
            <button class="btn icon ghost tiny-btn" :title="tl('加入监视')" :disabled="watched.has(r.q.id) || r.q.id.endsWith('.Lc')" @click="picking = r.q.id; add()"><Icon name="plus" :size="13" /></button>
          </template>
        </div>
      </Section>
      <div v-else class="tiny muted pick-hint">{{ tl('在画布上点选一个运动物体，这里会列出它在当前时刻的全部读数。') }}</div>
      <Section id="watch.list" :title="tl('监视列表')" :count="state.scene.watch.length">
      <div class="row add">
        <select v-model="picking" class="field grow">
          <option value="" disabled>{{ tl('添加监视量…') }}</option>
          <optgroup v-for="[g, list] in groups" :key="g" :label="g">
            <option v-for="q in list" :key="q.id" :value="q.id" :disabled="watched.has(q.id)">{{ q.label }}{{ paren(unitText(q.unit)) }}</option>
          </optgroup>
        </select>
        <button class="btn primary" :disabled="!picking" @click="add">{{ tl('添加') }}</button>
      </div>
      <div v-if="state.scene.watch.length === 0" class="empty">{{ tl('还没有监视量。可在物体属性页快速添加，或从上方列表选择。') }}</div>
      <div class="list">
        <div v-for="id in state.scene.watch" :key="id" class="item">
          <div class="name">
            <Tex v-if="qOf(id)" :tex="qOf(id)!.symbol" />
            <span class="small" :title="id">{{ qOf(id)?.label ?? id }}</span>
            <span class="tiny muted">{{ qOf(id)?.owner ?? tl('（本场景中没有这个量）') }}</span>
          </div>
          <div class="value mono">
            <template v-if="state.stale">—</template>
            <template v-else>{{ fmtNum(values.get(id) ?? null, qOf(id)?.unit ?? '') }}</template>
            <span class="unit">{{ unitLabel(qOf(id)?.unit ?? '') }}</span>
          </div>
          <div class="ops">
            <button class="btn icon ghost" :class="{ active: state.chart.includes(id) }" :title="tl('在图表中显示')" @click="toggleChart(id)"><Icon name="chart" /></button>
            <button class="btn icon ghost" :title="tl('移除')" @click="remove(id)"><Icon name="close" /></button>
          </div>
        </div>
      </div>
      </Section>
      <Section id="watch.custom" :title="tl('自定义量')" :count="customs.length || null">
        <template #actions><button class="btn ghost small" :disabled="!!form" @click="newCustom"><Icon name="plus" :size="13" /> {{ tl('新建') }}</button></template>
      <div v-if="customs.length === 0 && !form" class="tiny muted">{{ tl('用表达式定义新的量，如 {0}，可像其他量一样监视、作图和导出。', [example]) }}</div>
      <div class="list">
        <div v-for="c in customs" :key="c.id" class="item custom">
          <div class="name">
            <span class="small">{{ c.name }}</span>
            <span class="tiny mono muted expr" :title="c.expr">{{ c.expr }}</span>
            <span v-if="customErrors.get(c.id)" class="tiny err">{{ customErrors.get(c.id) }}</span>
          </div>
          <div class="ops">
            <button class="btn icon ghost" :title="tl('编辑')" @click="editCustom(c.id)"><Icon name="pen" /></button>
            <button class="btn icon ghost" :title="tl('删除')" @click="removeCustom(c.id)"><Icon name="trash" /></button>
          </div>
        </div>
      </div>
      <div v-if="form" class="custom-form">
        <label class="tiny muted">{{ tl('名称') }}</label>
        <input v-model="form.name" class="field" maxlength="40" />
        <label class="tiny muted">{{ tl('表达式') }}</label>
        <input v-model="form.expr" class="field mono" :placeholder="example" spellcheck="false" @keydown.enter="saveCustom" />
        <div class="tiny check" :class="{ err: formCheck && 'error' in formCheck }">
          <template v-if="!formCheck">{{ tl('写法：x(物体)、v(物体)、ek(物体)、T(绳)、N(物体, 接触物体)；系统量 t、E、Ek、Ep、Es、Px、Py、g；函数 sqrt、abs、sin、min、if 等。物体可写名称或 id。') }}</template>
          <template v-else-if="'error' in formCheck">{{ formCheck.error }}</template>
          <template v-else>{{ tl('单位：{0}', [unitText(formCheck.unit)]) }}</template>
        </div>
        <div class="row form-ops">
          <button class="btn" @click="form = null">{{ tl('取消') }}</button>
          <button class="btn primary" :disabled="!formCheck || 'error' in formCheck" @click="saveCustom">{{ form.editing ? tl('保存') : tl('添加并监视') }}</button>
        </div>
      </div>
      </Section>
      <div class="tiny muted hint">{{ tl('数值为当前帧的仿真结果，单位与有效数字可在“设置 › 单位与数值”中调整。暂停后可逐帧查看。') }}</div>
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
.custom .expr { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.err { color: var(--danger); }
.custom-form { display: flex; flex-direction: column; gap: 4px; background: var(--group); border-radius: var(--radius-group); padding: 8px 10px; margin-top: 6px; }
.custom-form .check { min-height: 1.4em; color: var(--text-2); }
.custom-form .check.err { color: var(--danger); }
.form-ops { justify-content: flex-end; gap: 6px; margin-top: 4px; }
</style>
