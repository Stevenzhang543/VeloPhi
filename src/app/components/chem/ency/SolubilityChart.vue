<script setup lang="ts">
/**
 * 溶解度曲线 — the solubility table of a salt as a small chart (26.64, D271): the points of the catalogue, joined by
 * straight segments (no curve is fitted), with the values listed under it. Temperatures are shown in °C.
 */
import { computed } from 'vue'
import { tl } from '../../../../i18n'
import { plain } from '../../../../chem/ency/model'
import { fixed } from '../../../../chem/format'

const props = defineProps<{ points: Array<[number, number]>; label: string }>()
const W = 320, H = 180, L = 40, R = 10, T = 10, B = 30

function niceStep(span: number, target: number): number {
  const raw = span / target
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p
}

const chart = computed(() => {
  const pts = props.points.map(([k, s]) => ({ c: k - 273.15, s }))
  const c0 = Math.min(...pts.map(p => p.c)), c1 = Math.max(...pts.map(p => p.c))
  const top = Math.max(...pts.map(p => p.s))
  const ys = niceStep(top || 1, 4)
  const y1 = Math.ceil((top || 1) / ys) * ys
  const xs = niceStep(Math.max(1, c1 - c0), 5)
  const x0 = Math.floor(c0 / xs) * xs, x1 = Math.max(x0 + xs, Math.ceil(c1 / xs) * xs)
  const px = (c: number) => L + ((c - x0) / (x1 - x0)) * (W - L - R)
  const py = (s: number) => H - B - (s / y1) * (H - T - B)
  const xt: number[] = [], yt: number[] = []
  for (let v = x0; v <= x1 + 1e-9; v += xs) xt.push(Math.round(v * 1e6) / 1e6)
  for (let v = 0; v <= y1 + 1e-9; v += ys) yt.push(Math.round(v * 1e6) / 1e6)
  return { pts: pts.map(p => ({ x: px(p.c), y: py(p.s), c: p.c, s: p.s })), xt: xt.map(v => ({ v, x: px(v) })), yt: yt.map(v => ({ v, y: py(v) })), path: pts.map(p => `${px(p.c).toFixed(1)},${py(p.s).toFixed(1)}`).join(' ') }
})
const celsius = (c: number) => { const r = Math.round(c * 100) / 100; return fixed(r, Number.isInteger(r) ? 0 : 2) }
</script>

<template>
  <figure class="sol" data-ui="ency-solubility">
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="tl('{0} 的溶解度随温度的变化', [props.label])">
      <g class="grid">
        <line v-for="t in chart.yt" :key="`y${t.v}`" :x1="L" :x2="W - R" :y1="t.y" :y2="t.y" />
      </g>
      <g class="axis">
        <line :x1="L" :x2="W - R" :y1="H - B" :y2="H - B" /><line :x1="L" :x2="L" :y1="T" :y2="H - B" />
        <text v-for="t in chart.xt" :key="`x${t.v}`" :x="t.x" :y="H - B + 13" text-anchor="middle">{{ plain(t.v) }}</text>
        <text v-for="t in chart.yt" :key="`l${t.v}`" :x="L - 5" :y="t.y + 3.5" text-anchor="end">{{ plain(t.v) }}</text>
        <text :x="W - R" :y="H - 3" text-anchor="end">{{ tl('温度 / °C') }}</text>
      </g>
      <polyline class="curve" :points="chart.path" />
      <circle v-for="p in chart.pts" :key="p.c" class="dot" :cx="p.x" :cy="p.y" r="2.6" />
    </svg>
    <figcaption>{{ tl('溶解度 / (g/100 g 水)') }}</figcaption>
    <div class="values">
      <table>
        <tbody>
          <tr><th scope="row">°C</th><td v-for="p in chart.pts" :key="p.c" class="num">{{ celsius(p.c) }}</td></tr>
          <tr><th scope="row">g</th><td v-for="p in chart.pts" :key="p.c" class="num">{{ plain(p.s) }}</td></tr>
        </tbody>
      </table>
    </div>
  </figure>
</template>

<style scoped>
.sol { margin: 0; max-width: 420px; }
svg { display: block; width: 100%; height: auto; }
.grid line { stroke: var(--tick-minor); stroke-width: 1; }
.axis line { stroke: var(--tick); stroke-width: 1; }
.axis text { fill: var(--text-2); font-size: var(--type-tiny); font-variant-numeric: tabular-nums; }
.curve { fill: none; stroke: var(--accent); stroke-width: 1.6; stroke-linejoin: round; }
.dot { fill: var(--accent); }
figcaption { font-size: var(--type-tiny); color: var(--text-2); margin-top: 2px; }
.values { overflow-x: auto; margin-top: var(--space-2); }
table { border-collapse: collapse; font-size: var(--type-tiny); }
th { text-align: left; font-weight: var(--weight-medium); color: var(--text-2); padding: 2px 8px 2px 0; }
td { padding: 2px 6px; text-align: right; border-left: 1px solid var(--separator); white-space: nowrap; }
</style>
