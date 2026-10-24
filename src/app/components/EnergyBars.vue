<script setup lang="ts">
/**
 * Energy breakdown at the current frame from the solver's energy ledger (frameLedger): kinetic, gravitational
 * and elastic energy, friction heat, damping, impact loss, work of applied forces and of belt motors, and the
 * ledger total, which stays constant in an exact solution. Bars share one scale for the whole recording (computed
 * once per run), so they do not jump while playing.
 */
import { computed } from 'vue'
import type { Recording } from '../../core/solver/simulation'
import { frameLedger } from '../../core/solver/simulation'
import type { Ledger } from '../../core/solver/simulation'
import { fmtQ } from '../settings'

const props = defineProps<{ rec: Recording; frame: number; runId: number }>()

type Key = keyof Omit<Ledger, 'balance' | 'mechanical'>
const ROWS: Array<{ key: Key; label: string; color: string; always?: boolean; sign?: string }> = [
  { key: 'kinetic', label: '动能 Eₖ', color: '#2f7cf6', always: true },
  { key: 'gravity', label: '重力势能 Eₚ', color: '#16a34a', always: true },
  { key: 'spring', label: '弹性势能 Eₛ', color: '#8b5cf6' },
  { key: 'frictionHeat', label: '摩擦生热 Q', color: '#ef6c2f' },
  { key: 'damping', label: '阻尼耗散', color: '#d97706' },
  { key: 'impactLoss', label: '碰撞损失', color: '#e11d48' },
  { key: 'appliedWork', label: '外力做功 W', color: '#0891b2', sign: '−' },
  { key: 'beltWork', label: '电机做功', color: '#64748b', sign: '−' }
]

/** Extent of every ledger entry over the run (sampled), for a stable scale. */
let cache: { runId: number; frames: number; neg: number; pos: number; used: Set<Key>; b0: number; scale: number } | null = null
const extent = computed(() => {
  const r = props.rec
  if (cache && cache.runId === props.runId && cache.frames === r.frameCount) return cache
  const stride = Math.max(1, Math.floor(r.frameCount / 600))
  let neg = 0, pos = 0, scale = 0
  const used = new Set<Key>()
  for (let k = 0; k < r.frameCount; k += stride) {
    const l = frameLedger(r, k)
    for (const row of ROWS) {
      const v = l[row.key]
      if (Math.abs(v) > 1e-12) used.add(row.key)
      neg = Math.min(neg, v); pos = Math.max(pos, v)
      scale = Math.max(scale, Math.abs(v))
    }
  }
  const b0 = frameLedger(r, 0).balance
  cache = { runId: props.runId, frames: r.frameCount, neg, pos, used, b0, scale: Math.max(scale, 1e-12) }
  return cache
})

const ledger = computed(() => frameLedger(props.rec, Math.min(props.frame, props.rec.frameCount - 1)))
const rows = computed(() => {
  const e = extent.value
  const span = Math.max(1e-12, e.pos - e.neg)
  const zero = -e.neg / span
  return ROWS.filter(r => r.always || e.used.has(r.key)).map(r => {
    const raw = ledger.value[r.key]
    // Round-off far below the scale of the run reads as 0 on the dashboard
    const v = Math.abs(raw) <= e.scale * 1e-12 ? 0 : raw
    const f = v / span
    return { ...r, v, left: (f < 0 ? zero + f : zero) * 100, width: Math.abs(f) * 100, zero: zero * 100 }
  })
})
const drift = computed(() => {
  const e = extent.value
  const d = ledger.value.balance - e.b0
  return { d, rel: Math.abs(d) / e.scale }
})
</script>

<template>
  <div class="bars">
    <div v-for="r in rows" :key="r.key" class="bar-row">
      <span class="label small">{{ r.label }}</span>
      <span class="track"><i class="zero" :style="{ left: `${r.zero}%` }" /><i class="bar" :style="{ left: `${r.left}%`, width: `${r.width}%`, background: r.color }" /></span>
      <span class="val mono small">{{ fmtQ(r.v, 'J') }}</span>
    </div>
    <div class="total small">
      <span class="muted">机械能</span><span class="mono">{{ fmtQ(ledger.mechanical, 'J') }}</span>
      <span class="muted" title="机械能 + 摩擦生热 + 阻尼 + 碰撞损失 − 外力做功 − 电机做功">账本合计</span><span class="mono">{{ fmtQ(ledger.balance, 'J') }}</span>
      <span class="muted">相对初始漂移</span><span class="mono" :class="{ bad: drift.rel > 1e-6 }">{{ drift.rel < 1e-15 ? '0' : drift.rel.toExponential(1) }}</span>
    </div>
  </div>
</template>

<style scoped>
.bars { display: flex; flex-direction: column; gap: 5px; }
.bar-row { display: grid; grid-template-columns: 84px 1fr 92px; gap: 8px; align-items: center; }
.label { color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.track { position: relative; height: 10px; border-radius: 999px; background: var(--fill); overflow: hidden; }
.track .bar { position: absolute; top: 0; bottom: 0; border-radius: 999px; transition: left 90ms linear, width 90ms linear; }
.track .zero { position: absolute; top: -2px; bottom: -2px; width: 1px; background: var(--text-3); opacity: 0.5; }
.val { text-align: right; white-space: nowrap; }
.total { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--separator); }
.total .mono { text-align: right; }
.bad { color: var(--danger); }
</style>
