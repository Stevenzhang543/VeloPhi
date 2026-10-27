<script setup lang="ts">
/**
 * Field regions, liquids and rail loops of the scene (26.55, D90–D92), in the scene tab: add, select (also by a
 * click on the canvas), edit and delete. A region is moved and resized on the canvas as well (drag inside it, or
 * its corner handles); everything here is in display units.
 */
import { computed } from 'vue'
import { tl } from '../../i18n'
import { state, edit, viewCamera } from '../store'
import { settings } from '../settings'
import { editor } from '../editor/editorState'
import NumField from './NumField.vue'
import Section from './Section.vue'
import type { RailLoopDef, RegionDef } from '../../core/scene/types'
import { regionSummary } from '../../render/regions'

const st = computed(() => state.scene.settings)
const regions = computed(() => st.value.regions ?? [])
const loops = computed(() => st.value.railLoops ?? [])
const count = computed(() => regions.value.length + loops.value.length || null)
const dynamicBodies = computed(() => state.scene.bodies.filter(b => b.kind !== 'static'))
const digits = computed(() => Math.min(4, settings.digits ?? 4))

/** A fresh id: r1, r2, … (shared by regions and rail loops). */
function freshId(prefix: string): string {
  const used = new Set([...regions.value.map(r => r.id), ...loops.value.map(l => l.id)])
  let k = 1
  while (used.has(`${prefix}${k}`)) k++
  return `${prefix}${k}`
}

function addRegion(kind: 'electric' | 'magnetic' | 'liquid') {
  const id = freshId('r')
  const c = { x: Number(viewCamera.cx.toPrecision(3)), y: Number(viewCamera.cy.toPrecision(3)) }
  const r: RegionDef = kind === 'liquid'
    ? { id, name: tl('水'), kind: 'liquid', shape: 'rect', x: c.x, y: c.y - 1, w: 4, h: 2, density: 1000, depth: 0.1, dragLinear: 0, dragQuadratic: 0 }
    : kind === 'electric'
      ? { id, name: tl('电场区'), kind: 'field', shape: 'rect', x: c.x, y: c.y, w: 2, h: 2, E: { x: 100, y: 0 }, B: 0 }
      : { id, name: tl('磁场区'), kind: 'field', shape: 'rect', x: c.x, y: c.y, w: 2, h: 2, E: { x: 0, y: 0 }, B: 1 }
  edit(sc => { sc.settings.regions = [...(sc.settings.regions ?? []), r] })
  state.selection = null
  editor.annotationId = null
  editor.regionId = id
}

function addLoop() {
  const body = (state.selection?.kind === 'body' && dynamicBodies.value.find(b => b.id === state.selection!.id)) || dynamicBodies.value[0]
  if (!body) return
  const l: RailLoopDef = { id: freshId('rl'), name: tl('导轨回路'), body: body.id, angle: 0, L: 0.5, R: 1, B: 1 }
  edit(sc => { sc.settings.railLoops = [...(sc.settings.railLoops ?? []), l] })
}

function setRegion(id: string, f: (r: RegionDef) => void) {
  edit(sc => { const r = sc.settings.regions?.find(x => x.id === id); if (r) f(r) })
}
function setLoop(id: string, f: (l: RailLoopDef) => void) {
  edit(sc => { const l = sc.settings.railLoops?.find(x => x.id === id); if (l) f(l) })
}
function removeRegion(id: string) {
  edit(sc => { sc.settings.regions = (sc.settings.regions ?? []).filter(r => r.id !== id); if (!sc.settings.regions.length) delete sc.settings.regions })
  if (editor.regionId === id) editor.regionId = null
}
function removeLoop(id: string) {
  edit(sc => { sc.settings.railLoops = (sc.settings.railLoops ?? []).filter(r => r.id !== id); if (!sc.settings.railLoops.length) delete sc.settings.railLoops })
}
function select(id: string) {
  state.selection = null
  editor.annotationId = null
  editor.regionId = editor.regionId === id ? null : id
}

const eMag = (r: RegionDef) => Math.hypot(r.E?.x ?? 0, r.E?.y ?? 0)
const eDir = (r: RegionDef) => (eMag(r) > 0 ? Math.atan2(r.E!.y, r.E!.x) : 0)
/** E of size v along d; components that are zero up to rounding are exactly 0. */
function vecOf(v: number, d: number) {
  const c = Math.cos(d), s = Math.sin(d)
  return { x: Math.abs(c) < 1e-12 ? 0 : v * c, y: Math.abs(s) < 1e-12 ? 0 : v * s }
}
function setShape(r: RegionDef, shape: 'rect' | 'circle') {
  setRegion(r.id, x => {
    if (shape === x.shape) return
    if (shape === 'circle') { x.r = Math.min(x.w ?? 1, x.h ?? 1) / 2; delete x.w; delete x.h }
    else { x.w = x.h = 2 * (x.r ?? 0.5); delete x.r }
    x.shape = shape
  })
}
</script>

<template>
  <Section id="scene.regions" :title="tl('场区、液体与导轨')" :open="!!count" :count="count">
    <div class="group">
      <div class="adders">
        <button class="btn small" :title="tl('有边界的匀强电场（可设为交变电场）')" @click="addRegion('electric')">+ {{ tl('电场区') }}</button>
        <button class="btn small" :title="tl('有边界的匀强磁场')" @click="addRegion('magnetic')">+ {{ tl('磁场区') }}</button>
        <button class="btn small" :title="tl('液体：浮力与液体阻力')" @click="addRegion('liquid')">+ {{ tl('液体') }}</button>
        <button class="btn small" :disabled="!dynamicBodies.length" :title="tl('让选中的物体作为导体棒在导轨上滑动')" @click="addLoop">+ {{ tl('导轨回路') }}</button>
      </div>
      <div v-for="r in regions" :key="r.id" class="item" :class="{ on: editor.regionId === r.id }">
        <button class="head" @click="select(r.id)">
          <span class="dot" :class="r.kind === 'liquid' ? 'liquid' : r.B && !eMag(r) ? 'mag' : 'ele'" />
          <span class="grow name">{{ r.name }}</span>
          <span class="tiny muted">{{ regionSummary(r, digits) }}</span>
        </button>
        <template v-if="editor.regionId === r.id">
          <div class="row"><label>{{ tl('名称') }}</label><input class="field grow" :value="r.name" @change="setRegion(r.id, x => { x.name = ($event.target as HTMLInputElement).value || x.name })" /></div>
          <div v-if="r.kind === 'field'" class="row"><label>{{ tl('形状') }}</label>
            <span class="seg grow"><button :class="{ on: r.shape === 'rect' }" @click="setShape(r, 'rect')">{{ tl('矩形') }}</button><button :class="{ on: r.shape === 'circle' }" @click="setShape(r, 'circle')">{{ tl('圆形') }}</button></span>
          </div>
          <div class="row"><label>{{ tl('中心 x, y') }}</label><NumField class="grow" :model-value="r.x" unit="m" @update:model-value="v => setRegion(r.id, x => { x.x = v })" /><NumField class="grow" :model-value="r.y" unit="m" @update:model-value="v => setRegion(r.id, x => { x.y = v })" /></div>
          <div v-if="r.shape === 'rect'" class="row"><label>{{ tl('宽, 高') }}</label><NumField class="grow" :model-value="r.w ?? 1" unit="m" :min="1e-6" @update:model-value="v => setRegion(r.id, x => { x.w = v })" /><NumField class="grow" :model-value="r.h ?? 1" unit="m" :min="1e-6" @update:model-value="v => setRegion(r.id, x => { x.h = v })" /></div>
          <div v-else class="row"><label>{{ tl('半径') }}</label><NumField class="grow" :model-value="r.r ?? 1" unit="m" :min="1e-6" @update:model-value="v => setRegion(r.id, x => { x.r = v })" /></div>
          <template v-if="r.kind === 'field'">
            <div class="row"><label>{{ tl('场强 E') }}</label><NumField class="grow" :model-value="eMag(r)" unit="V/m" :min="0" @update:model-value="v => setRegion(r.id, x => { x.E = vecOf(v, eDir(x)) })" /></div>
            <div class="row"><label>{{ tl('E 的方向') }}</label><NumField class="grow" :model-value="eDir(r)" unit="rad" @update:model-value="v => setRegion(r.id, x => { x.E = vecOf(eMag(x), v) })" /></div>
            <div class="row"><label>{{ tl('磁感应强度 B') }}</label><NumField class="grow" :model-value="r.B ?? 0" unit="T" @update:model-value="v => setRegion(r.id, x => { x.B = v })" /></div>
            <div class="row"><label>{{ tl('交变角频率 ω') }}</label><NumField class="grow" :model-value="r.omega ?? 0" unit="rad/s" :min="0" @update:model-value="v => setRegion(r.id, x => { if (v) x.omega = v; else delete x.omega })" /></div>
            <div v-if="r.omega" class="row"><label>{{ tl('初相 φ') }}</label><NumField class="grow" :model-value="r.phase ?? 0" unit="rad" @update:model-value="v => setRegion(r.id, x => { x.phase = v })" /></div>
            <div class="tiny muted note">{{ tl('带电体的中心在区域内时受 F = q(E + v×B)；ω ≠ 0 时电场按 E·cos(ωt + φ) 变化（回旋加速器的加速缝）。进出区域是事件，时刻精确定位。B > 0 指向纸外（⊙）。') }}</div>
          </template>
          <template v-else>
            <div class="row"><label>{{ tl('密度 ρ') }}</label><NumField class="grow" :model-value="r.density ?? 1000" unit="kg/m³" :min="0" @update:model-value="v => setRegion(r.id, x => { x.density = v })" /></div>
            <div class="row"><label>{{ tl('物体厚度') }}</label><NumField class="grow" :model-value="r.depth ?? 0.1" unit="m" :min="1e-6" @update:model-value="v => setRegion(r.id, x => { x.depth = v })" /></div>
            <div class="row"><label>{{ tl('线性阻力系数') }}</label><NumField class="grow" :model-value="r.dragLinear ?? 0" unit="N·s/m" :min="0" @update:model-value="v => setRegion(r.id, x => { x.dragLinear = v })" /></div>
            <div class="row"><label>{{ tl('平方阻力系数') }}</label><NumField class="grow" :model-value="r.dragQuadratic ?? 0" unit="N·s²/m²" :min="0" @update:model-value="v => setRegion(r.id, x => { x.dragQuadratic = v })" /></div>
            <div class="tiny muted note">{{ tl('液面在矩形的上边。浮力 F浮 = ρgV排，V排 = 浸入部分的面积 × 厚度，作用在浸入部分的形心；阻力按浸入比例计。浮力做功与阻力生热计入能量账本。') }}</div>
          </template>
          <div class="row"><span class="grow" /><button class="btn small danger" @click="removeRegion(r.id)">{{ tl('删除') }}</button></div>
        </template>
      </div>
      <div v-for="l in loops" :key="l.id" class="item rail">
        <div class="row"><input class="field grow" :value="l.name" :aria-label="tl('名称')" @change="setLoop(l.id, x => { x.name = ($event.target as HTMLInputElement).value || x.name })" /><button class="btn small ghost danger" :title="tl('删除')" @click="removeLoop(l.id)">✕</button></div>
        <div class="row"><label>{{ tl('导体棒') }}</label>
          <select class="field grow" :value="l.body" @change="setLoop(l.id, x => { x.body = ($event.target as HTMLSelectElement).value })">
            <option v-for="b in dynamicBodies" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </div>
        <div class="row"><label>{{ tl('导轨方向') }}</label><NumField class="grow" :model-value="l.angle" unit="rad" @update:model-value="v => setLoop(l.id, x => { x.angle = v })" /></div>
        <div class="row"><label>{{ tl('导轨间距 L') }}</label><NumField class="grow" :model-value="l.L" unit="m" :min="1e-6" @update:model-value="v => setLoop(l.id, x => { x.L = v })" /></div>
        <div class="row"><label>{{ tl('回路电阻 R') }}</label><NumField class="grow" :model-value="l.R" unit="Ω" :min="1e-9" @update:model-value="v => setLoop(l.id, x => { x.R = v })" /></div>
        <div class="row"><label>{{ tl('磁感应强度 B') }}</label><NumField class="grow" :model-value="l.B" unit="T" @update:model-value="v => setLoop(l.id, x => { x.B = v })" /></div>
      </div>
      <div v-if="loops.length" class="tiny muted note">{{ tl('导体棒沿导轨运动时 ε = BLv，I = ε/R，所受安培力 F = B²L²v/R 与运动方向相反；安培力做的负功全部变成焦耳热。导体棒通常要设为“不转动”，并用光滑导轨（地面或滑块约束）限制它沿导轨运动。') }}</div>
      <div v-if="!count" class="tiny muted note">{{ tl('质谱仪、回旋加速器、导体棒切割磁感线与浮力的模板在“模板”的“电与磁”“电磁感应”和“流体”中。') }}</div>
    </div>
  </Section>
</template>

<style scoped>
.adders { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 0 8px; }
.item { border: 1px solid var(--separator); border-radius: var(--radius-group); padding: 4px 8px; margin: 0 0 6px; }
.item.on { border-color: var(--accent); }
.head { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: 0; padding: 4px 0; color: var(--text); cursor: pointer; text-align: left; font: inherit; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { width: 10px; height: 10px; border-radius: 3px; flex: 0 0 auto; }
.dot.ele { background: #0f766e; }
.dot.mag { background: #a16207; }
.dot.liquid { background: #2563eb; }
.seg { display: inline-flex; gap: 0; }
.seg button { flex: 1; border: 1px solid var(--separator); background: none; color: var(--text); padding: 3px 8px; font: inherit; cursor: pointer; }
.seg button:first-child { border-radius: 6px 0 0 6px; }
.seg button:last-child { border-radius: 0 6px 6px 0; border-left: 0; }
.seg button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.note { padding: 6px 2px 4px; line-height: 1.5; }
.danger { color: var(--danger, #dc2626); }
</style>
