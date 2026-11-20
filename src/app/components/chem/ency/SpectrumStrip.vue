<script setup lang="ts">
/**
 * 发射光谱条 — the visible lines of an element on a wavelength scale from 380 to 780 nm (26.64, D271). The
 * wavelengths come from the data; the colour a line is drawn in is the drawing approximation of the optics labs
 * (src/app/lab/color.ts) — it shows where in the spectrum the line lies, it is not a measured colour. The ground is
 * the dark of a spectroscope in both themes (src/chem/ency/palette.ts).
 */
import { computed } from 'vue'
import { tl } from '../../../../i18n'
import { wavelengthColor } from '../../../lab/color'
import { plain } from '../../../../chem/ency/model'
import { STRIP_GROUND, STRIP_INK } from '../../../../chem/ency/palette'

const props = defineProps<{ lines: number[]; label: string }>()
const LO = 380, HI = 780, W = 400
const x = (nm: number) => ((nm - LO) / (HI - LO)) * W
const shown = computed(() => props.lines.filter(nm => nm >= LO && nm <= HI))
const outside = computed(() => props.lines.filter(nm => nm < LO || nm > HI))
const TICKS = [400, 500, 600, 700]
const list = (v: number[]) => v.map(n => plain(n)).join(', ')
</script>

<template>
  <figure class="spectrum" data-ui="ency-spectrum">
    <svg :viewBox="`0 0 ${W} 58`" role="img" :aria-label="tl('{0} 的发射谱线：{1} nm', [props.label, list(props.lines)])" preserveAspectRatio="none">
      <rect x="0" y="0" :width="W" height="58" :fill="STRIP_GROUND" />
      <line v-for="nm in shown" :key="nm" :x1="x(nm)" :x2="x(nm)" y1="0" y2="40" :stroke="wavelengthColor(nm)" stroke-width="1.6" vector-effect="non-scaling-stroke" />
      <line v-for="t in TICKS" :key="`t${t}`" :x1="x(t)" :x2="x(t)" y1="40" y2="45" :stroke="STRIP_INK" stroke-width="1" vector-effect="non-scaling-stroke" />
    </svg>
    <div class="scale num" aria-hidden="true" :style="{ color: STRIP_INK }"><span v-for="t in TICKS" :key="t" :style="{ left: `${(x(t) / W) * 100}%` }">{{ t }}</span><span class="unit">nm</span></div>
    <figcaption class="num">{{ list(shown) }} nm<template v-if="outside.length"> · {{ tl('可见光区之外：{0} nm', [list(outside)]) }}</template></figcaption>
  </figure>
</template>

<style scoped>
.spectrum { margin: 0; }
svg { display: block; width: 100%; height: 58px; border-radius: var(--radius-control); }
.scale { position: relative; height: 0; font-size: var(--type-tiny); }
.scale span { position: absolute; top: -15px; transform: translateX(-50%); }
.scale .unit { right: 6px; left: auto; transform: none; }
figcaption { margin-top: var(--space-1); font-size: var(--type-small); color: var(--text-2); }
</style>
