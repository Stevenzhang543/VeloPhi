<script setup lang="ts">
/**
 * Import measured data (26.58, D141, EDU08): read a CSV file, choose the time column and, for each other column,
 * the quantity it measures and its unit (taken from the header when it names one). The series are saved with the
 * scene and drawn as points over the simulated curves, with their RMS deviation. No fitting.
 */
import { computed, ref } from 'vue'
import { vDialog } from '../focusTrap'
import { tl } from '../../i18n'
import { state, edit } from '../store'
import { MeasuredError, parseMeasuredCsv, readMeasured, seriesFrom, unitOptionFor, writeMeasured } from '../../analysis/measured'
import type { MeasuredTable } from '../../analysis/measured'
import { kindInfo, kindOf } from '../../units/units'
import type { QuantityDef } from '../../engine/observe'
import { listQuantities } from '../../engine/observe'
import Icon from './Icon.vue'

const emit = defineEmits<{ (e: 'close'): void }>()
const close = () => emit('close')
const table = ref<MeasuredTable | null>(null)
const fileName = ref('')
const error = ref('')
const timeCol = ref(0)
const timeUnit = ref('s')
const pick = ref<Array<{ id: string; unit: string }>>([])
const quantities = computed<QuantityDef[]>(() => (state.recording && !state.stale ? listQuantities(state.recording) : []))
const existing = computed(() => readMeasured(state.scene))

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  error.value = ''
  fileName.value = f.name
  try {
    if (f.size > 4e6) throw new MeasuredError('size')
    const t = parseMeasuredCsv(await f.text())
    table.value = t
    timeCol.value = Math.max(0, t.columns.findIndex(c => /^(t|time|zeit|时间)$/i.test(c.name)))
    timeUnit.value = t.columns[timeCol.value].unit || 's'
    pick.value = t.columns.map(c => ({ id: guessQuantity(c.name), unit: c.unit }))
  } catch (err) {
    table.value = null
    error.value = err instanceof MeasuredError ? tl('无法读取：文件应为逗号、分号或制表符分隔的数字表，第一列通常是时间（至多 20 000 行、32 列、4 MB）。') : String(err)
  }
}

/** A quantity whose id or label matches the column name (x → the first body's x), else none. */
function guessQuantity(name: string): string {
  const n = name.trim().toLowerCase()
  const hit = quantities.value.find(q => q.id.toLowerCase() === n || q.label.toLowerCase() === n)
  if (hit) return hit.id
  const body = state.recording?.system.model.dynamic[0]
  if (body && ['x', 'y', 'vx', 'vy', 'v', 'a'].includes(n)) return quantities.value.some(q => q.id === `${body.id}.${n}`) ? `${body.id}.${n}` : ''
  return ''
}

const unitsOf = (id: string) => {
  const q = quantities.value.find(x => x.id === id)
  const k = q ? kindOf(q.unit) : null
  return k ? kindInfo(k).options : []
}
const timeOptions = computed(() => kindInfo('time').options)
const ready = computed(() => !!table.value && pick.value.some((p, i) => i !== timeCol.value && p.id))

function apply() {
  const t = table.value
  if (!t) return
  const tu = timeOptions.value.find(o => o.id === timeUnit.value || o.label === timeUnit.value) ?? null
  const list = [...existing.value]
  pick.value.forEach((p, i) => {
    if (i === timeCol.value || !p.id) return
    const q = quantities.value.find(x => x.id === p.id)
    if (!q) return
    const s = seriesFrom(t, timeCol.value, i, q.id, `${fileName.value} · ${t.columns[i].name}`, q.unit, tu, unitOptionFor(q.unit, p.unit))
    if (s.t.length) list.push(s)
  })
  edit(sc => writeMeasured(sc, list.slice(-24)))
  if (!state.chart.includes(pick.value.find((p, i) => i !== timeCol.value && p.id)?.id ?? '')) {
    const first = pick.value.find((p, i) => i !== timeCol.value && p.id)
    if (first) state.chart = [...state.chart, first.id]
  }
  close()
}
function clearAll() { edit(sc => writeMeasured(sc, [])) }
</script>

<template>
  <!-- 26.58 (D146): on the body, above every panel (inside the chart panel the right column covered it) -->
  <Teleport to="body">
  <div class="dialog-backdrop" @mousedown.self="close">
    <div v-dialog="close" class="dialog measured-dialog" role="dialog" :aria-label="tl('导入实测数据')">
      <div class="dialog-header">{{ tl('导入实测数据') }}<span class="spacer" /><button class="btn icon ghost" :title="tl('关闭')" @click="close"><Icon name="close" /></button></div>
      <div class="dialog-body">
        <p class="small">{{ tl('把实验中测得的数据（如运动传感器、视频分析或手工计时的表）叠加到仿真曲线上比较。文件为 CSV：第一行可写列名与单位，如“t (s), x (cm)”。数据随场景保存。') }}</p>
        <div v-if="!quantities.length" class="small muted">{{ tl('请先运行仿真，才能选择数据对应的物理量。') }}</div>
        <label class="btn small file"><Icon name="open" :size="14" />{{ tl('选择 CSV 文件…') }}<input type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" :disabled="!quantities.length" @change="onFile" /></label>
        <span v-if="fileName" class="small muted">{{ fileName }}</span>
        <div v-if="error" class="error small" role="alert">{{ error }}</div>
        <template v-if="table">
          <div class="row"><label>{{ tl('时间列') }}</label>
            <select v-model.number="timeCol" class="field grow"><option v-for="(c, i) in table.columns" :key="i" :value="i">{{ c.name }}{{ c.unit ? ` (${c.unit})` : '' }}</option></select>
            <select v-model="timeUnit" class="field unit"><option v-for="o in timeOptions" :key="o.id" :value="o.id">{{ o.label }}</option></select>
          </div>
          <table class="cols small">
            <thead><tr><th>{{ tl('列') }}</th><th>{{ tl('对应的物理量') }}</th><th>{{ tl('单位') }}</th><th>{{ tl('前几行') }}</th></tr></thead>
            <tbody>
              <tr v-for="(c, i) in table.columns" v-show="i !== timeCol" :key="i">
                <td>{{ c.name }}</td>
                <td><select v-model="pick[i].id" class="field"><option value="">{{ tl('不导入') }}</option><option v-for="q in quantities" :key="q.id" :value="q.id">{{ q.owner }} · {{ q.label }}</option></select></td>
                <td><select v-model="pick[i].unit" class="field unit" :disabled="!pick[i].id"><option value="">{{ tl('国际单位') }}</option><option v-for="o in unitsOf(pick[i].id)" :key="o.id" :value="o.id">{{ o.label }}</option></select></td>
                <td class="mono tiny">{{ table.rows.slice(0, 3).map(r => (Number.isFinite(r[i]) ? r[i] : '—')).join('  ') }}</td>
              </tr>
            </tbody>
          </table>
          <div class="tiny muted">{{ tl('共 {0} 行。', [table.rows.length]) }}</div>
        </template>
        <div v-if="existing.length" class="existing small">
          <span>{{ tl('场景中已有 {0} 组实测数据。', [existing.length]) }}</span>
          <button class="btn small ghost" @click="clearAll"><Icon name="trash" :size="13" />{{ tl('全部移除') }}</button>
        </div>
      </div>
      <div class="dialog-footer"><span class="spacer" /><button class="btn" @click="close">{{ tl('取消') }}</button><button class="btn primary" :disabled="!ready" @click="apply">{{ tl('导入') }}</button></div>
    </div>
  </div>
  </Teleport>
</template>

<style scoped>
.measured-dialog { width: min(680px, calc(100vw - 32px)); }
.file { position: relative; overflow: hidden; margin-right: 8px; }
.file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.cols { width: 100%; border-collapse: collapse; margin: 8px 0 4px; }
.cols th { text-align: left; font-weight: 600; color: var(--text-2); padding: 4px 6px; }
.cols td { padding: 3px 6px; border-top: 1px solid var(--separator, var(--border)); }
.cols select { max-width: 220px; }
.unit { width: 96px; }
.existing { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.error { color: var(--danger, #dc2626); margin: 6px 0; }
</style>
