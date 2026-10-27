<script setup lang="ts">
/**
 * Hydrogen levels and spectrum (26.54, D82): the Bohr levels Eₙ = −13.6 eV/n² from the core (`hydrogen`), a
 * transition chosen by clicking two levels (photon energy, frequency, wavelength, series), the whole line
 * spectrum with the visible Balmer lines in colour, and what a photon or an electron of a given energy can excite.
 */
import { computed, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import { hydrogen } from '../../../engine/labs'
import { labState } from '../../lab/state'
import { useLabCanvas } from '../../lab/canvas'
import { wavelengthColor } from '../../lab/color'
import { FONT, MONO } from '../../../render/style'
import NumField from '../NumField.vue'
import LabFormula from './LabFormula.vue'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

const S = labState('hydrogen', () => ({ upper: 3, lower: 2, maxN: 6, energy: 12.09, by: 'photon' as 'photon' | 'electron', from: 1 }))
const H = computed(() => { try { return hydrogen({ maxN: S.maxN, upper: S.upper, lower: S.lower, energy: S.energy, from: S.from, by: S.by }) } catch { return null } })
const line = computed(() => H.value?.line ?? null)
const SERIES: Record<string, string> = { lyman: tl('莱曼系（紫外）'), balmer: tl('巴耳末系（可见光为主）'), paschen: tl('帕邢系（红外）'), brackett: tl('布拉开系（红外）'), pfund: tl('普丰德系（红外）'), humphreys: tl('汉弗莱系（红外）') }
const reach = computed(() => new Set(H.value?.excite?.levels ?? []))

const pick = ref<number | null>(null)
const levelBoxes: Array<{ n: number; y: number }> = []

const { canvas, wrap, redraw, at } = useLabCanvas(() => props.active, (ctx, w, h, _dt, P) => {
  const hd = H.value
  if (!hd) return
  const top = 30, bottom = h - 120
  // energy axis: −13.6 … 0 eV (with a log-like spacing so the upper levels are apart)
  const map = (e: number) => top + (bottom - top) * Math.pow(-e / 13.6, 0.55)
  const x0 = 80, x1 = w - 40
  ctx.font = `12px ${FONT}`
  levelBoxes.length = 0
  // ionization
  ctx.strokeStyle = P.text2; ctx.setLineDash([6, 4]); ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(x0, top); ctx.lineTo(x1, top); ctx.stroke(); ctx.setLineDash([])
  ctx.fillStyle = P.text2; ctx.fillText('n = ∞   0 eV', 8, top + 4)
  hd.levels.forEach((e, k) => {
    const n = k + 1, y = map(e)
    levelBoxes.push({ n, y })
    const on = n === S.upper || n === S.lower
    ctx.strokeStyle = reach.value.has(n) ? P.velocity : on ? P.accent : P.text
    ctx.lineWidth = on ? 3 : 2
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke()
    ctx.fillStyle = on ? P.accent : P.text
    ctx.fillText(`n = ${n}`, 8, y + 4)
    ctx.font = `11px ${MONO}`; ctx.fillStyle = P.text2
    ctx.fillText(`${e.toFixed(2)} eV`, x1 - 70, y - 5)
    ctx.font = `12px ${FONT}`
  })
  // all lines as thin arrows, grouped by series
  const series = ['lyman', 'balmer', 'paschen', 'brackett', 'pfund']
  const span = (x1 - x0 - 120) / series.length
  for (const l of hd.lines) {
    const si = series.indexOf(l.series)
    if (si < 0) continue
    const x = x0 + 30 + si * span + (l.upper - l.lower - 1) * 9
    const y1 = map(hd.levels[l.upper - 1]), y2 = map(hd.levels[l.lower - 1])
    ctx.strokeStyle = l.visible ? wavelengthColor(l.wavelength) : P.gridMajor
    ctx.lineWidth = l.upper === S.upper && l.lower === S.lower ? 3.4 : 1.4
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2 - 6); ctx.stroke()
    ctx.fillStyle = ctx.strokeStyle
    ctx.beginPath(); ctx.moveTo(x, y2); ctx.lineTo(x - 4, y2 - 8); ctx.lineTo(x + 4, y2 - 8); ctx.closePath(); ctx.fill()
  }
  ctx.fillStyle = P.text2; ctx.font = `11px ${FONT}`
  series.forEach((s, i) => ctx.fillText(SERIES[s].replace(/（.*）/, ''), x0 + 24 + i * span, bottom + 16))
  // spectrum strip
  const sy = h - 70, sh = 26
  const lam0 = 350, lam1 = 800
  const LX = (l: number) => x0 + (x1 - x0) * (l - lam0) / (lam1 - lam0)
  for (let l = 380; l < 780; l += 2) { ctx.fillStyle = wavelengthColor(l, 0.18); ctx.fillRect(LX(l), sy, LX(l + 2) - LX(l) + 0.5, sh) }
  ctx.strokeStyle = P.gridMajor; ctx.lineWidth = 1; ctx.strokeRect(LX(lam0), sy, LX(lam1) - LX(lam0), sh)
  for (const l of hd.lines) {
    if (l.wavelength < lam0 || l.wavelength > lam1) continue
    ctx.strokeStyle = wavelengthColor(l.wavelength); ctx.lineWidth = l.upper === S.upper && l.lower === S.lower ? 4 : 2.5
    ctx.beginPath(); ctx.moveTo(LX(l.wavelength), sy); ctx.lineTo(LX(l.wavelength), sy + sh); ctx.stroke()
    ctx.fillStyle = P.text2; ctx.font = `10px ${MONO}`; ctx.fillText(l.wavelength.toFixed(0), LX(l.wavelength) - 10, sy + sh + 12)
  }
  ctx.fillStyle = P.text2; ctx.font = `11px ${FONT}`
  ctx.fillText(tl('可见光谱（nm）'), x0, sy - 6)
})
watch(() => [S.upper, S.lower, S.maxN, S.energy, S.by, S.from], redraw)

function onDown(e: PointerEvent) {
  const [, y] = at(e)
  let best: { n: number; y: number } | null = null
  for (const b of levelBoxes) if (!best || Math.abs(b.y - y) < Math.abs(best.y - y)) best = b
  if (!best || Math.abs(best.y - y) > 18) return
  if (pick.value === null) { pick.value = best.n; return }
  const a = pick.value, b = best.n
  pick.value = null
  if (a === b) return
  S.upper = Math.max(a, b); S.lower = Math.min(a, b)
}
const nm = (m: number) => `${m.toFixed(1)} nm`
</script>

<template>
  <div class="lab-shell">
    <div class="lab-stage">
      <div class="lab-bar">
        <span class="small muted">{{ pick === null ? tl('依次点击两条能级，选出一次跃迁') : tl('已选 n = {0}，再点另一条能级', [pick]) }}</span>
        <span class="grow" />
        <label class="ctl">{{ tl('能级数') }}<input v-model.number="S.maxN" type="range" min="3" max="8" step="1" /><span class="mono">{{ S.maxN }}</span></label>
      </div>
      <div ref="wrap" class="lab-canvas"><canvas ref="canvas" @pointerdown="onDown" /></div>
    </div>
    <aside class="lab-side">
      <section v-if="line" class="lab-block">
        <div class="lab-btitle">{{ tl('跃迁 n = {0} → n = {1}', [line.upper, line.lower]) }}<span class="swatch" :style="{ background: line.visible ? wavelengthColor(line.wavelength) : 'transparent' }" /></div>
        <div class="lab-kv">
          <span>{{ tl('光子能量 hν') }}</span><b class="big">{{ line.energy.toFixed(4) }} eV</b>
          <span>{{ tl('频率 ν') }}</span><b>{{ line.frequency.toExponential(4) }} Hz</b>
          <span>{{ tl('波长 λ') }}</span><b class="big">{{ nm(line.wavelength) }}</b>
          <span>{{ tl('谱线系') }}</span><b>{{ SERIES[line.series] }}</b>
          <span>{{ tl('是否可见') }}</span><b>{{ line.visible ? tl('可见光') : line.wavelength < 380 ? tl('紫外') : tl('红外') }}</b>
        </div>
        <LabFormula :title="tl('玻尔频率条件')" tex="h\nu = E_m - E_n = 13.6\,\mathrm{eV}\left(\dfrac{1}{n^2} - \dfrac{1}{m^2}\right)" expr="13.6*(1/n^2 - 1/m^2)" :vars="[{ name: 'n', symbol: 'n', value: line.lower, unit: '' }, { name: 'm', symbol: 'm', value: line.upper, unit: '' }]" unit="" lhs="h\nu\,(\mathrm{eV})" :result="line.energy" />
        <LabFormula :title="tl('波长')" tex="\lambda = \dfrac{c}{\nu} = \dfrac{hc}{E}" expr="1239.8419843320026/E" :vars="[{ name: 'E', symbol: 'E\,(\mathrm{eV})', value: line.energy, unit: '' }]" unit="" lhs="\lambda\,(\mathrm{nm})" :result="line.wavelength" />
      </section>
      <section class="lab-block">
        <div class="lab-btitle">{{ tl('激发') }}</div>
        <div class="lab-fields">
          <label>{{ tl('方式') }}</label>
          <div class="lab-seg"><button :class="{ on: S.by === 'photon' }" @click="S.by = 'photon'">{{ tl('光子') }}</button><button :class="{ on: S.by === 'electron' }" @click="S.by = 'electron'">{{ tl('电子碰撞') }}</button></div>
          <label>{{ tl('能量（eV）') }}</label><NumField :model-value="S.energy" label="eV" :min="0" :step="0.01" @update:model-value="v => (S.energy = v)" />
          <label>{{ tl('原子所在能级') }}</label><NumField :model-value="S.from" label="n" :min="1" :max="7" :step="1" @update:model-value="v => (S.from = Math.round(v))" />
        </div>
        <div v-if="H?.excite" class="small lab-note">
          <template v-if="H.excite.ionizes">{{ tl('能量足以使原子电离') }}<template v-if="H.excite.free !== null">{{ tl('，电离后电子的动能为 {0} eV', [H.excite.free.toFixed(3)]) }}</template>。</template>
          <template v-else-if="H.excite.levels.length">{{ tl('可以跃迁到：') }}{{ H.excite.levels.map(n => `n = ${n}`).join(tl('、')) }}{{ tl('（能级图中绿色）') }}</template>
          <template v-else>{{ tl('不能被吸收：光子的能量必须恰好等于两能级之差（电子碰撞则只需不少于能级差）。') }}</template>
        </div>
      </section>
      <details class="lab-block lab-details">
        <summary>{{ tl('原理') }}</summary>
        <p class="tiny muted lab-note">{{ tl('玻尔模型：氢原子的能量只能取 Eₙ = −13.6 eV/n²。电子从高能级跃迁到低能级时放出光子，hν = E高 − E低；终止于 n = 1 的谱线组成莱曼系（紫外），终止于 n = 2 的组成巴耳末系，其中前几条在可见光区。') }}</p>
      </details>
    </aside>
  </div>
</template>

<style scoped>
.swatch { width: 14px; height: 14px; border-radius: 50%; display: inline-block; border: 1px solid var(--separator); }
</style>
