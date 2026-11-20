<script setup lang="ts">
/**
 * A decay network drawn on the N–Z plane (26.64, D276): one box per nuclide where it sits on the chart of nuclides,
 * one arrow per decay in the colour of its mode; the main branch of a nuclide is a solid line, the others are dashed.
 * The layout is src/nuclear/chain.ts; this component only draws it.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import type { ChainLayout } from '../../../nuclear/chain'
import { modeColour } from '../../../nuclear/chart'

const props = defineProps<{ layout: ChainLayout; selected: string | null; dark: boolean }>()
const emit = defineEmits<{ (e: 'pick', id: string): void }>()

const CW = 56, CH = 42, BW = 50, BH = 34, PAD = 12
const width = computed(() => Math.ceil(props.layout.cols * CW + 2 * PAD))
const height = computed(() => Math.ceil(props.layout.rows * CH + 2 * PAD))
const cx = (col: number) => PAD + (col + 0.5) * CW
const cy = (row: number) => PAD + (row + 0.5) * CH
const boxes = computed(() => props.layout.nodes.map(n => ({ ...n, x: cx(n.col), y: cy(n.row) })))
const arrows = computed(() => props.layout.edges.map((e, i) => {
  const a = boxes.value[e.from], b = boxes.value[e.to]
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1
  // leave the boxes: the segment starts and ends where it crosses their outline
  const cut = (ux: number, uy: number) => Math.min(Math.abs(ux) > 1e-9 ? (BW / 2 + 2) / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-9 ? (BH / 2 + 2) / Math.abs(uy) : Infinity)
  const ux = dx / len, uy = dy / len, c = Math.min(cut(ux, uy), len / 2 - 1)
  const x1 = a.x + ux * c, y1 = a.y + uy * c, x2 = b.x - ux * (c + 3), y2 = b.y - uy * (c + 3)
  return { i, x1, y1, x2, y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2, colour: modeColour(e.modeKey, props.dark), main: e.main, mode: e.mode, title: `${a.label} → ${b.label} · ${e.mode} ${e.fraction} · Q ${e.q}` }
}))

// the parent sits where the chart of nuclides has it — to the upper right of a long chain: bring it into view
const root = ref<HTMLElement | null>(null)
async function showParent() {
  await nextTick()
  const el = root.value, p = boxes.value.find(b => b.parent)
  if (!el || !p) return
  el.scrollLeft = Math.max(0, p.x + BW - el.clientWidth)
  el.scrollTop = Math.max(0, p.y - el.clientHeight + BH)
}
onMounted(showParent)
watch(() => props.layout, showParent)
</script>

<template>
  <div ref="root" class="cdia" data-ui="chain-diagram" tabindex="0" :aria-label="tl('衰变链图：{0} 个核素', [layout.members])">
    <svg :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`">
      <defs>
        <marker v-for="a in arrows" :id="`ch-arrow-${a.i}`" :key="a.i" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" :fill="a.colour" /></marker>
      </defs>
      <g v-for="a in arrows" :key="a.i">
        <title>{{ a.title }}</title>
        <line :x1="a.x1" :y1="a.y1" :x2="a.x2" :y2="a.y2" :stroke="a.colour" :stroke-width="a.main ? 2 : 1.2" :stroke-dasharray="a.main ? undefined : '4 3'" :marker-end="`url(#ch-arrow-${a.i})`" />
      </g>
      <g v-for="b in boxes" :key="b.id" class="node" :class="{ on: b.id === selected, stable: b.stable, parent: b.parent }" :data-nuclide="b.id" tabindex="0" role="button" :aria-label="`${b.label} ${b.life}`" @click="emit('pick', b.id)" @keydown.enter.prevent="emit('pick', b.id)" @keydown.space.prevent="emit('pick', b.id)">
        <title>{{ b.label }} · {{ b.life }}</title>
        <rect :x="b.x - BW / 2" :y="b.y - BH / 2" :width="BW" :height="BH" rx="4" />
        <text :x="b.x" :y="b.y - 2" class="sym">{{ b.label }}</text>
        <text :x="b.x" :y="b.y + 12" class="life">{{ b.life }}</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.cdia { flex: 1; min-width: 0; overflow: auto; max-height: 100%; outline: none; }
.cdia:focus-visible { box-shadow: inset 0 0 0 2px var(--ring); }
svg { display: block; }
.node { cursor: pointer; outline: none; }
.node rect { fill: var(--pane); stroke: var(--tick); stroke-width: 1; }
.node.parent rect { stroke: var(--text); stroke-width: 1.5; }
.node.stable rect { fill: var(--group); stroke: var(--text-2); }
.node.on rect { stroke: var(--accent); stroke-width: 2.5; }
.node:focus-visible rect { stroke: var(--accent); stroke-width: 2.5; }
.node text { text-anchor: middle; fill: var(--text); font-size: 12.5px; font-weight: 600; pointer-events: none; }
.node text.life { fill: var(--text-2); font-size: var(--type-tiny); font-weight: 400; }
</style>
