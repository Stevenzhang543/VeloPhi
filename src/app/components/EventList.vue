<script setup lang="ts">
/**
 * Event log: every state change (impact, start of sliding, common velocity, separation, rope slack …) with its
 * exact time; a click seeks to the first frame after the event. Times and impact data are shown in the display
 * units. The latest event at or before the current frame is highlighted; later ones are dimmed.
 * `compact` drops the description column (dashboard).
 */
import { tl, commaSep, colonSep } from '../../i18n'
import { computed } from 'vue'
import { state, seekAfter } from '../store'
import { shownTime } from '../../units/clock'
import { eventLabel } from '../../render/renderer'
import { useGated } from '../live'
import { fmtNum, fmtQ, unitLabel } from '../settings'
import type { ChangeDetail, SimEvent } from '../../core/solver/simulation'
import { openEventDetail } from '../details'

const props = withDefaults(defineProps<{ active?: boolean; compact?: boolean }>(), { active: true, compact: false })

const rec = computed(() => (state.stale ? null : state.recording))
const name = (id: string) => {
  const m = rec.value?.system.model
  return m?.byId.get(id)?.name ?? m?.ropes.find(r => r.id === id)?.name ?? m?.forces.find(f => f.id === id)?.name ?? id
}
const FRICTION: Record<string, string> = { slip: tl('碰撞中一直相对滑动'), stick: tl('碰撞结束时切向相对静止'), reverse: tl('切向相对速度反向') }

/** Description of one change in display units (impacts with their friction, variable-force switches, fallback). */
function detail(e: SimEvent, c: ChangeDetail): string {
  if (c.type === 'impact') {
    const parts = [tl('法向速度 {0} → {1}', [fmtQ(c.vnBefore ?? null, 'm/s', 4), fmtQ(c.vnAfter ?? null, 'm/s', 4)]), tl('冲量 {0}', [fmtQ(c.impulse ?? null, 'N·s', 4)]), `e = ${c.restitution}`]
    if (c.tangentImpulse !== undefined && Math.abs(c.tangentImpulse) > 1e-12) parts.push(tl('摩擦冲量 {0}', [fmtQ(Math.abs(c.tangentImpulse), 'N·s', 4)]))
    if (c.vtBefore !== undefined && c.vtAfter !== undefined) parts.push(tl('切向相对速度 碰前 {0} → 碰后 {1}', [fmtQ(c.vtBefore, 'm/s', 4), fmtQ(c.vtAfter, 'm/s', 4)]))
    const p = e.impact?.points.find(pt => pt.pair?.key === c.subject && pt.friction)
    if (p?.friction) parts.push(FRICTION[p.friction] ?? p.friction)
    return parts.join(commaSep())
  }
  if (c.type === 'taut' && c.impulse !== undefined) return tl('绳突然绷紧，冲量 {0}', [fmtQ(Math.abs(c.impulse), 'N·s', 4)])
  if (c.type === 'switch') return `${name(c.subject)}${colonSep()}${c.kink ? tl('表达式出现折点（abs、min、max、clamp），力连续但斜率突变') : tl('表达式跳变（step、sign、if），力突然改变')}`
  if (c.type === 'timestep') {
    const chosen = rec.value?.scene.settings.integrator === 'moreau'
    return tl('{0}改用 Moreau–Jean 时间步进计算：精度降级，事件时刻不再精确定位', [chosen ? tl('按“场景”页的设置') : tl('事件过于密集，此后')])
  }
  return ''
}

const rows = computed(() => {
  const r = rec.value
  if (!r) return []
  return r.events.map((e, index) => ({ e, index })).filter(({ e }) => e.changes.length > 0).map(({ e, index }) => ({
    e,
    index,
    items: e.changes.map(c => ({
      text: eventLabel(c),
      who: c.bodies.map(name).join(' – ') || (c.type === 'switch' ? name(c.subject) : ''),
      detail: detail(e, c),
      warn: c.type === 'timestep'
    })),
    loss: e.impact?.loss ?? 0
  }))
})
const now = useGated(() => props.active, () => (rec.value ? state.panelFrame * rec.value.dt : 0))
/** Index of the latest event at or before the current time. */
const currentIndex = computed(() => {
  let idx = -1
  rows.value.forEach((row, i) => { if (row.e.t <= now.value + 1e-9) idx = i })
  return idx
})
</script>

<template>
  <div class="events" :class="{ compact }">
    <div v-if="!rec" class="empty">{{ tl('运行仿真后列出事件。') }}</div>
    <div v-else-if="rows.length === 0" class="empty">{{ tl('本次仿真没有碰撞、开始滑动、共速、分离等状态切换。') }}</div>
    <table v-else>
      <thead><tr><th>{{ tl('时刻 / {0}', [unitLabel('s')]) }}</th><th>{{ tl('事件') }}</th><th>{{ tl('对象') }}</th><th v-if="!compact">{{ tl('说明') }}</th></tr></thead>
      <tbody>
        <template v-for="(row, ri) in rows" :key="row.e.index">
          <tr v-for="(it, i) in row.items" :key="i" :class="{ current: ri === currentIndex, future: ri > currentIndex, warn: it.warn }" :title="tl('跳到事件后的第一帧并查看详情')" @click="seekAfter(row.e.t); openEventDetail(row.index)">
            <td v-if="i === 0" :rowspan="row.items.length" class="mono">{{ fmtNum(shownTime(row.e.t), 's', compact ? Math.max(state.digits, 6) : Math.max(state.digits, 9)) }}</td>
            <td>{{ it.text }}<div v-if="compact && it.detail" class="tiny muted sub">{{ it.detail }}<template v-if="i === 0 && row.loss > 1e-12">{{ tl('；损失动能 {0}', [fmtQ(row.loss, 'J', 4)]) }}</template></div></td>
            <td>{{ it.who }}</td>
            <td v-if="!compact" class="small muted">{{ it.detail }}<template v-if="i === 0 && row.loss > 1e-12">{{ tl('；损失动能 {0}', [fmtQ(row.loss, 'J', 5)]) }}</template></td>
          </tr>
        </template>
      </tbody>
    </table>
    <div v-if="!compact" class="tiny muted foot">{{ tl('事件时刻由求解器在两次积分步之间精确定位（误差约 10⁻¹² s）；点击一行跳到事件后的第一帧并打开事件详情。') }}</div>
  </div>
</template>

<style scoped>
.events { padding: 0 12px 8px; overflow: auto; height: 100%; }
.events.compact { padding: 0; height: auto; }
table { width: 100%; border-collapse: collapse; font-size: var(--type-small); }
th { text-align: left; color: var(--text-3); font-weight: 600; font-size: var(--type-tiny); padding: 4px 6px; position: sticky; top: 0; background: var(--pane); z-index: 1; }
td { padding: 4px 6px; border-top: 1px solid var(--separator); cursor: pointer; }
tr:hover td { background: var(--hover); }
tr.current td { background: var(--accent-soft); }
tr.current td:first-child { box-shadow: inset 3px 0 0 var(--accent); }
tr.future td { color: var(--text-3); }
tr.warn td:nth-child(2) { color: var(--warning); font-weight: 600; }
.sub { font-weight: 400; margin-top: 1px; line-height: 1.4; }
.foot { margin-top: 6px; }
</style>
