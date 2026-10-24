<script setup lang="ts">
import { computed } from 'vue'
import { state, seekTime, pause } from '../store'
import { eventLabel } from '../../render/renderer'
import { formatPlain } from '../../formula/match'

const rec = computed(() => (state.stale ? null : state.recording))
const name = (id: string) => rec.value?.system.model.byId.get(id)?.name ?? rec.value?.system.model.ropes.find(r => r.id === id)?.name ?? id
const rows = computed(() => {
  const r = rec.value
  if (!r) return []
  return r.events.filter(e => e.changes.length > 0).map(e => ({
    e,
    items: e.changes.map(c => ({
      text: eventLabel(c),
      who: c.bodies.map(name).join(' – '),
      detail: c.type === 'impact' ? `法向速度 ${formatPlain(c.vnBefore ?? null, 4)} → ${formatPlain(c.vnAfter ?? null, 4)} m/s，冲量 ${formatPlain(c.impulse ?? null, 4)} N·s，e = ${c.restitution}` : ''
    })),
    loss: e.impact?.loss ?? 0
  }))
})
function go(t: number) { pause(); const r = rec.value!; seekTime(Math.ceil(t / r.dt - 1e-9) * r.dt) }
</script>

<template>
  <div class="events">
    <div v-if="!rec" class="empty">运行仿真后列出事件。</div>
    <div v-else-if="rows.length === 0" class="empty">本次仿真没有碰撞、开始滑动、共速、分离等状态切换。</div>
    <table v-else>
      <thead><tr><th>时刻 / s</th><th>事件</th><th>对象</th><th>说明</th></tr></thead>
      <tbody>
        <template v-for="row in rows" :key="row.e.index">
          <tr v-for="(it, i) in row.items" :key="i" @click="go(row.e.t)">
            <td v-if="i === 0" :rowspan="row.items.length" class="mono">{{ formatPlain(row.e.t, Math.max(state.digits, 9)) }}</td>
            <td>{{ it.text }}</td>
            <td>{{ it.who }}</td>
            <td class="small muted">{{ it.detail }}<template v-if="i === 0 && row.loss > 1e-12">；损失动能 {{ formatPlain(row.loss, 5) }} J</template></td>
          </tr>
        </template>
      </tbody>
    </table>
    <div class="tiny muted foot">事件时刻由求解器在两次积分步之间精确定位（误差约 10⁻¹² s）；点击一行跳到事件后的第一帧。</div>
  </div>
</template>

<style scoped>
.events { padding: 0 12px 8px; overflow: auto; height: 100%; }
table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
th { text-align: left; color: var(--text-3); font-weight: 600; font-size: 11.5px; padding: 4px 6px; position: sticky; top: 0; background: var(--pane); }
td { padding: 4px 6px; border-top: 1px solid var(--separator); cursor: pointer; }
tr:hover td { background: var(--hover); }
.foot { margin-top: 6px; }
</style>
