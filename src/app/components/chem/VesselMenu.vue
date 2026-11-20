<script setup lang="ts">
/**
 * What can be done with a vessel (26.64, D268): the menu opened by Enter, the handle beside the selected vessel or a
 * right click. It lists only what the core can do with this vessel as it is now: add and pour, what its attached
 * tools do, how a gas jar collects, the circuit it is part of, taking parts off, removing it. The same component shows
 * the short choice a part asks for when it is put on (electrode material, source voltage, load).
 */
import { computed, onMounted, ref } from 'vue'
import { tl } from '../../../i18n'
import type { CollectMode } from '../../../engine/chem'
import { useBench } from '../../../chem/bench'
import { kindName, kindOf } from '../../../chem/apparatus'
import { speciesName } from '../../../chem/catalog'
import { fmtAmountOf } from '../../../chem/format'
import { showToast } from '../../store'
import Icon from '../Icon.vue'
import { benchUi, flameTest } from './benchUi'

const props = defineProps<{ vessel: string; left: string; top: string }>()
const emit = defineEmits<{ (e: 'shelf'): void }>()
const bench = useBench()
const root = ref<HTMLElement | null>(null)

const v = computed(() => bench.vesselOf(props.vessel))
const kind = computed(() => kindOf(v.value?.kind ?? ''))
const extras = computed(() => { void bench.revision.value; return bench.extras(props.vessel) })
const parts = computed(() => extras.value.parts.map(p => kindOf(p)!).filter(Boolean))
const circuit = computed(() => bench.circuitOf(props.vessel))
const others = computed(() => bench.vessels.value.length > 1)
const hasContents = computed(() => !!v.value && (v.value.volume_mL > 0 || v.value.solids.length > 0))
const close = () => { benchUi.menu = null; benchUi.chooser = null }

interface Item { id: string; icon: string; label: string; run: () => void; checked?: boolean; danger?: boolean }
/** 26.65 (D297): the burner, hot plate or bath that acts on this vessel — things of their own, worked from here too. */
const RIG_KINDS = ['alcoholBurner', 'blastBurner', 'hotPlate', 'waterBath', 'iceBath']
const rig = computed(() => { void bench.revision.value; return RIG_KINDS.map(k => bench.rigOf(props.vessel, k)).filter((f): f is NonNullable<typeof f> => !!f) })
const tools = computed<Item[]>(() => {
  const x = v.value
  if (!x) return []
  const out: Item[] = []
  for (const f of rig.value) {
    const name = kindName(kindOf(f.kind))
    const act = (verb: string) => tl('{0}：{1}', [name, verb])
    if (f.kind === 'alcoholBurner') out.push({ id: f.id, icon: 'flame', label: act(f.lit ? tl('熄灭') : f.cap ? tl('取下灯帽') : tl('点燃')), run: () => bench.tapFixture(f.id) })
    else if (f.kind === 'blastBurner') out.push({ id: f.id, icon: 'flame', label: act(f.lit ? tl('熄灭') : tl('点燃')), run: () => bench.tapFixture(f.id) })
    else if (f.kind === 'hotPlate') out.push({ id: f.id, icon: 'flame', label: act(f.on ? tl('断电') : tl('通电')), run: () => bench.tapFixture(f.id) })
    else out.push({ id: f.id, icon: 'beaker', label: act(tl('取出')), run: () => bench.detach(x.id, f.kind) })
  }
  for (const k of parts.value) {
    const t = k.tool
    if (!t) continue
    const name = kindName(k)
    const act = (verb: string) => tl('{0}：{1}', [name, verb])
    if (t.action === 'heat') out.push({ id: k.id, icon: 'flame', label: act(x.heater > 0 ? tl('熄灭') : tl('点燃')), run: () => bench.useTool(x.id, k.id) })
    else if (t.action === 'bath') out.push({ id: k.id, icon: k.icon, label: act(x.bath !== null ? tl('取出') : tl('放入')), run: () => bench.useTool(x.id, k.id) })
    else if (t.action === 'stopper') out.push({ id: k.id, icon: k.icon, label: act(x.closed ? tl('打开') : tl('塞上')), run: () => bench.useTool(x.id, k.id) })
    else if (t.action === 'ignite') out.push({ id: k.id, icon: 'flame', label: act(x.ignited ? tl('移开') : tl('伸入')), run: () => bench.useTool(x.id, k.id) })
    else if (t.action === 'flame') out.push({ id: k.id, icon: 'flame', label: act(tl('焰色试验')), run: () => flameTest(x.id) })
    else if (t.action === 'connect') out.push(x.outlet ? { id: k.id, icon: k.icon, label: act(tl('拆下')), run: () => bench.disconnect(x.id) } : { id: k.id, icon: k.icon, label: act(tl('连接到…')), run: () => { benchUi.carry = { type: 'connect', id: x.id, dragging: false, x: 0, y: 0 } } })
    else if (t.action === 'pour' && t.amount) out.push({ id: k.id, icon: k.icon, label: tl('{0}：{1}', [name, t.amount.unit === 'drop' ? tl('滴加到…') : tl('移取 {0} 到…', [fmtAmountOf(t.amount)])]), run: () => { benchUi.carry = { type: 'pour', id: x.id, amount: t.amount, dragging: false, x: 0, y: 0 } } })
  }
  return out
})
const collectModes: Array<[CollectMode, () => string]> = [['water', () => tl('排水集气')], ['up', () => tl('向上排空气')], ['down', () => tl('向下排空气')], ['none', () => tl('不集气')]]
const below = computed(() => extras.value.above)

function remove() {
  const name = bench.vesselName(props.vessel)
  if (bench.removeVessel(props.vessel)) showToast(tl('已移走{0}', [name]), false, { label: tl('撤销'), run: () => bench.undo() })
}
function takeOff(part: string) {
  bench.detach(props.vessel, part)
  showToast(tl('已取下{0}', [kindName(kindOf(part))]), false, { label: tl('撤销'), run: () => bench.attach(props.vessel, part) })
}
function removeCircuit() { const c = circuit.value; if (c) bench.removeCircuit(c.id) }

// the short choice of a part being put on
const chooser = computed(() => (benchUi.chooser?.vessel === props.vessel ? benchUi.chooser : null))
const chooserTitle = computed(() => (chooser.value?.kind === 'electrode' ? tl('电极材料') : chooser.value?.kind === 'source' ? tl('电源电压') : tl('负载电阻')))
function choose(value: string | number) {
  const c = chooser.value
  if (!c) return
  const k = circuit.value
  if (c.kind === 'electrode') bench.addElectrode(props.vessel, String(value))
  else if (k && c.kind === 'source') bench.setCircuit(k.id, { source: Number(value) })
  else if (k && c.kind === 'load') bench.setCircuit(k.id, { load: Number(value) })
  close()
}

function pick(e: MouseEvent) { if ((e.target as Element).closest('[role="menuitem"]') && !chooser.value) benchUi.menu = null }
onMounted(() => root.value?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus())
function keys(e: KeyboardEvent) {
  const items = Array.from(root.value?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? [])
  const i = items.indexOf(document.activeElement as HTMLElement)
  if (e.key === 'ArrowDown') { items[(i + 1) % items.length]?.focus(); e.preventDefault(); e.stopPropagation() }
  else if (e.key === 'ArrowUp') { items[(i - 1 + items.length) % items.length]?.focus(); e.preventDefault(); e.stopPropagation() }
  else if (e.key === 'Escape') { close(); (root.value?.closest('.bench') as HTMLElement | null)?.focus(); e.preventDefault(); e.stopPropagation() }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ' || e.key === 'Delete' || e.key === 'Backspace') e.stopPropagation()
}
</script>

<template>
  <div ref="root" class="menu vmenu" role="menu" :style="{ left: props.left, top: props.top }" data-ui="chem-vessel-menu" @pointerdown.stop @click="pick" @keydown="keys" @wheel.stop @dblclick.stop @contextmenu.stop.prevent>
    <template v-if="chooser">
      <div class="menu-title">{{ chooserTitle }}</div>
      <button v-for="o in chooser.options" :key="o.value" type="button" role="menuitem" :data-option="o.value" @click.stop="choose(o.value)">{{ chooser.kind === 'electrode' ? speciesName(String(o.value)) : o.label }}</button>
    </template>
    <template v-else-if="v">
      <button type="button" role="menuitem" data-ui="chem-act-add" @click="emit('shelf')"><Icon name="plus" />{{ tl('加入药品…') }}</button>
      <button v-if="kind?.vessel?.tap && below" type="button" role="menuitem" :disabled="!hasContents" data-ui="chem-act-deliver" @click="benchUi.dialog = { mode: 'pour', from: props.vessel, to: below }"><Icon name="dropper" />{{ tl('滴加…') }}</button>
      <button type="button" role="menuitem" :disabled="!hasContents || !others" data-ui="chem-act-pour" @click="benchUi.carry = { type: 'pour', id: props.vessel, dragging: false, x: 0, y: 0 }"><Icon name="arrowRight" />{{ tl('倒入另一容器…') }}</button>
      <button type="button" role="menuitem" :disabled="!hasContents" data-ui="chem-act-empty" @click="bench.emptyVessel(props.vessel)"><Icon name="beaker" />{{ tl('清空') }}</button>
      <template v-if="tools.length">
        <div class="sep" />
        <button v-for="t in tools" :key="t.id" type="button" role="menuitem" :data-tool="t.id" @click="t.run"><Icon :name="t.icon" />{{ t.label }}</button>
      </template>
      <template v-if="kind?.vessel?.collect">
        <div class="sep" />
        <button v-for="[mode, label] in collectModes" :key="mode" type="button" role="menuitemradio" :aria-checked="v.collect === mode" :data-collect="mode" @click="bench.setCollector(props.vessel, mode); benchUi.menu = null"><Icon :name="v.collect === mode ? 'check' : 'tick'" :class="{ faint: v.collect !== mode }" />{{ label() }}</button>
      </template>
      <template v-if="circuit">
        <div class="sep" />
        <button type="button" role="menuitem" data-ui="chem-act-switch" @click="bench.setCircuit(circuit.id, { on: !circuit.on })"><Icon name="switch" />{{ circuit.on ? tl('断开开关') : tl('闭合开关') }}</button>
        <button v-if="circuit.bridge" type="button" role="menuitem" @click="bench.setCircuit(circuit.id, { bridge: false })"><Icon name="link" />{{ tl('撤去盐桥') }}</button>
        <button v-if="circuit.source > 0" type="button" role="menuitem" @click="bench.setCircuit(circuit.id, { source: 0 })"><Icon name="battery" />{{ tl('撤去电源') }}</button>
        <button type="button" role="menuitem" class="danger" data-ui="chem-act-unwire" @click="removeCircuit"><Icon name="cut" />{{ tl('拆除电路') }}</button>
      </template>
      <template v-if="parts.length || extras.electrode || rig.length">
        <div class="sep" />
        <button v-for="k in parts" :key="k.id" type="button" role="menuitem" :data-off="k.id" @click="takeOff(k.id)"><Icon name="close" />{{ tl('取下{0}', [kindName(k)]) }}</button>
        <button v-for="f in rig.filter(r => r.kind !== 'waterBath' && r.kind !== 'iceBath')" :key="f.id" type="button" role="menuitem" :data-off="f.kind" @click="bench.detach(props.vessel, f.kind)"><Icon name="close" />{{ tl('撤去{0}', [kindName(kindOf(f.kind))]) }}</button>
        <button v-if="extras.electrode" type="button" role="menuitem" @click="bench.setExtras(props.vessel, { electrode: null })"><Icon name="close" />{{ tl('取下{0}', [speciesName(extras.electrode)]) }}</button>
      </template>
      <div class="sep" />
      <button type="button" role="menuitem" class="danger" data-ui="chem-act-remove" @click="remove"><Icon name="trash" />{{ tl('移走') }}<kbd>Del</kbd></button>
    </template>
  </div>
</template>

<style scoped>
.vmenu { position: absolute; max-height: min(70vh, 460px); overflow: auto; min-width: 200px; max-width: min(300px, calc(100% - 16px)); }
.vmenu > button { flex: 0 0 auto; }
.vmenu .danger { color: var(--danger); }
.vmenu kbd { margin-left: auto; }
.faint { opacity: 0; }
</style>
