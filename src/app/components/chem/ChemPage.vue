<script setup lang="ts">
/**
 * 化学实验 — the chemistry bench (26.64, D240, D242, D268). The page a student lands on: a bench (the stage), one bar
 * and one inspector, in the skeleton the three experiment panels share (StageLayout).
 *
 * The bar holds seven controls (D243): 药品 (the reagent shelf, a popover) · 仪器 (the apparatus shelf) · undo and redo
 * as one pair · 教学 · time (play / pause, the speeds and "到反应结束" in its menu) · 更多 (new, open, save, share,
 * export the record, reset the room) · the inspector's switch. Everything the user does becomes an action of the
 * bench's log (src/chem/bench.ts); the core computes, this page draws and shows.
 *
 * The shell hands the page `active` (false while another page is shown): a hidden bench does not tick or draw.
 */
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { tl } from '../../../i18n'
import { PAGE_ACTIVE } from '../../live'
import { phone } from '../../layout'
import { sysEnv } from '../../settings'
import { showToast } from '../../store'
import { addUiTestHook } from '../../uitest'
import { useBench } from '../../../chem/bench'
import type { Speed } from '../../../chem/bench'
import { loadCatalogue, catalogue, reagentName, reagentOf } from '../../../chem/catalog'
import { kindName, kindOf } from '../../../chem/apparatus'
import { isFixtureKind } from '../../../chem/rig'
import { fmtDuration } from '../../../chem/format'
import { recordText } from '../../../chem/benchText'
import { saveFile } from '../../../platform/files'
import { localeTag } from '../../../i18n'
import StageLayout from '../StageLayout.vue'
import EmptyState from '../EmptyState.vue'
import TeachMenu from '../TeachMenu.vue'
import Icon from '../Icon.vue'
import { vDialog } from '../../focusTrap'
import BenchCanvas from './BenchCanvas.vue'
import BenchInspector from './BenchInspector.vue'
import Shelf from './Shelf.vue'
import ApparatusShelf from './ApparatusShelf.vue'
import AmountDialog from './AmountDialog.vue'
import VesselMenu from './VesselMenu.vue'
import BenchArt from './BenchArt.vue'
import { benchUi, canvasApi, carryText, putPart } from './benchUi'
import { hand, handText, isHandTool, putToolDown, takeTool } from './hand'
import { chemCommand } from './commands'
import GuidePanel from './GuidePanel.vue'
import ExperimentGallery from './ExperimentGallery.vue'
import { guideUi, useGuide } from './guide'
import { ency } from '../../../chem/ency/route'

// 26.64 (D271): the encyclopedia of elements and substances covers the bench while it is open (its own chunk)
const Encyclopedia = defineAsyncComponent(() => import('./ency/Encyclopedia.vue'))

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })
provide(PAGE_ACTIVE, computed(() => props.active))

const bench = useBench()
bench.setNotify(showToast)

const shelfOpen = ref(false)
const apparatusOpen = ref(false)
const apparatusGroup = ref('')
const timeOpen = ref(false)
const inspector = ref(!phone.value)
const tab = ref('readings')
const shareLink = ref<string | null>(null)
const canvas = ref<InstanceType<typeof BenchCanvas> | null>(null)

// 26.64 (D270): a guided experiment adds its own tab to the inspector while it is being run
const guide = useGuide()
const tabs = computed(() => [...(guide.active.value ? [{ id: 'guide', label: tl('引导') }] : []), { id: 'readings', label: tl('读数') }, { id: 'contents', label: tl('内容') }, { id: 'log', label: tl('记录') }])
const loading = computed(() => !bench.ready.value && !bench.failure.value)

async function start() {
  try { await bench.init(loadCatalogue) } catch { return }
  if (guide.resume()) tab.value = 'guide'
  // a bench link in the address opens its bench (and leaves the address clean)
  if (typeof location !== 'undefined' && location.hash.startsWith('#b=')) {
    const hash = location.hash
    try { history.replaceState(null, '', location.pathname + location.search) } catch { /* address only */ }
    if (await bench.openShared(hash)) showToast(tl('已打开分享的实验台'))
  }
}
onMounted(() => {
  void start()
  addUiTestHook('chem', {
    bench, ui: benchUi,
    state: () => bench.state.value,
    read: (id: string) => bench.read(id),
    hash: () => bench.hash(),
    log: () => bench.log.value,
    doc: () => bench.portableDoc(),
    names: () => Object.fromEntries(bench.vessels.value.map(v => [v.id, bench.vesselName(v.id)])),
    byLabel: (label: string) => bench.objects.value.find(o => bench.extras(o.id).label === label)?.id ?? null,
    phenomena: () => bench.phenomena.value,
    frame: () => canvas.value?.stats ?? null,
    where: (id: string) => canvas.value?.where(id) ?? null,
    screenOf: (x: number, y: number) => canvas.value?.screenOf(x, y) ?? null,
    fixtures: () => bench.fixtures.value,
    reagents: () => (catalogue.value?.reagents ?? []).map(r => ({ id: r.id, kind: r.kind, group: r.group, label: r.label, name: r.name })),
    guide: () => ({ id: guide.active.value?.id ?? null, index: guide.index.value, steps: guide.steps.value.length, finished: guide.finished.value, mistakes: guide.mistakes.value.length })
  })
  window.addEventListener('pointerdown', outside)
  window.addEventListener('pagehide', bench.flushAutosave)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', outside)
  window.removeEventListener('pagehide', bench.flushAutosave)
  bench.pause()
  bench.flushAutosave()
})
watch(() => [props.active, sysEnv.hidden], () => bench.setVisible(props.active && !sysEnv.hidden), { immediate: true })
watch(canvas, c => { canvasApi.hit = c ? (x, y) => c.hitClient(x, y) : null; canvasApi.hover = c ? id => c.setHover(id) : null }, { immediate: true })
// commands of the global search reach the page through one request (commands.ts)
watch(() => chemCommand.n, () => {
  const c = chemCommand.last
  chemCommand.last = null
  if (!c) return
  if (c.type === 'new') newBench()
  else if (c.type === 'apparatus') { apparatusGroup.value = c.group; apparatusOpen.value = true; shelfOpen.value = false }
  else if (c.type === 'shelf') { shelfOpen.value = true; apparatusOpen.value = false }
  else if (c.type === 'guide') guideUi.gallery = true
}, { immediate: true })

function outside(e: PointerEvent) {
  const t = e.target as Element
  if (apparatusOpen.value && !t.closest('.app-anchor, .app-sheet')) apparatusOpen.value = false
  if (timeOpen.value && !t.closest('.time-anchor')) timeOpen.value = false
}

// ---- the shelves ----

function pickReagent(id: string) {
  shelfOpen.value = false
  const target = bench.selected.value
  if (target) { benchUi.dialog = { mode: 'add', to: target, reagent: id }; return }
  // 26.65 (D297 item 6): with no vessel chosen a reagent comes in its labelled bottle, put on the bench to pour, drop or take from
  if (bench.placeBottle(id)) return
  if (bench.empty.value) { showToast(tl('先放一个容器')); return }
  if (bench.vessels.value.length === 1) { bench.select(bench.vessels.value[0].id); benchUi.dialog = { mode: 'add', to: bench.vessels.value[0].id, reagent: id }; return }
  benchUi.carry = { type: 'reagent', id, dragging: false, x: 0, y: 0 }
}
function pickApparatus(kind: string, capacity?: number) {
  apparatusOpen.value = false
  const k = kindOf(kind)
  if (!k) return
  if (k.vessel) { bench.place(kind, undefined, capacity); return }
  // 26.65 (D297 item 7): a dropper, a spatula, tweezers, a glass rod, a glowing splint are taken in the hand
  if (isHandTool(kind)) { benchUi.carry = null; takeTool(kind); return }
  // a bottle of the shelf's limewater (D297 item 11)
  if (k.tool?.action === 'bottle' && k.tool.reagent) { bench.placeBottle(k.tool.reagent); return }
  // 26.65 (D297): a stand, a rack, a burner … is a thing of its own: under the selected vessel when it goes with one, else beside what stands there
  if (isFixtureKind(kind)) {
    const sel = bench.selected.value
    if (sel && kind !== 'stand' && bench.rigFits(sel, kind)) putPart(sel, kind)
    else bench.addFixture(kind)
    return
  }
  const target = bench.selected.value ?? (bench.vessels.value.length === 1 ? bench.vessels.value[0].id : null)
  if (target) { bench.select(target); putPart(target, kind); if (benchUi.chooser) benchUi.menu = target; return }
  if (bench.empty.value) { showToast(tl('先放一个容器')); return }
  benchUi.carry = { type: 'apparatus', id: kind, dragging: false, x: 0, y: 0 }
}
watch(() => benchUi.chooser, c => { if (c) { bench.select(c.vessel); benchUi.menu = c.vessel } })
// 26.64 (D271): "放到实验台" of a substance page — the encyclopedia closes and the reagent goes the way of the shelf
watch(() => [ency.bench.n, bench.ready.value], () => {
  const id = ency.bench.reagent
  if (!id || !bench.ready.value) return
  ency.bench.reagent = null
  ency.open = false
  if (bench.empty.value) bench.place('beaker')
  pickReagent(id)
}, { immediate: true })
function firstVessel() { const id = bench.place('beaker'); if (id) shelfOpen.value = true }

const ghost = computed(() => {
  const c = benchUi.carry
  if (!c?.dragging) return null
  return { text: c.type === 'reagent' ? reagentName(reagentOf(c.id), c.id) : kindName(kindOf(c.id)), left: `${c.x + 14}px`, top: `${c.y + 14}px` }
})
const hint = computed(() => (benchUi.carry && !benchUi.carry.dragging ? carryText(benchUi.carry) : hand.tool ? handText() : ''))
function cancelHint() { benchUi.carry = null; putToolDown() }

// ---- time ----

const SPEEDS: Speed[] = [1, 10, 60]
const timeText = computed(() => fmtDuration(Math.floor(bench.time.value)))
const timeTitle = computed(() => (bench.finishing.value ? tl('正在运行到反应结束') : bench.running.value ? (bench.idle.value ? tl('暂停（已稳定）') : tl('暂停')) : tl('让时间流逝')))
async function toEnd() {
  timeOpen.value = false
  const r = await bench.runToEnd()
  if (r.settled) showToast(tl('已稳定，经过 {0}', [fmtDuration(r.seconds)]))
}
function toggleTime() { if (bench.finishing.value) bench.pause(); else bench.toggle() }

// ---- 更多 ----

function replaced(text: string, before: ReturnType<typeof bench.portableDoc>, name: string | null) {
  showToast(text, false, { label: tl('撤销'), run: () => { try { bench.open(before, name); bench.dirty.value = true } catch { /* the bench stays */ } } })
}
function newBench() {
  if (bench.empty.value && !bench.log.value.length) return
  const before = bench.portableDoc(), name = bench.fileName.value
  bench.reset()
  guide.leave()
  replaced(tl('已新建实验台'), before, name)
}
async function openFile() {
  const before = bench.portableDoc(), name = bench.fileName.value, had = !bench.empty.value
  if (await bench.openFromFile()) { guide.leave(); if (had) replaced(tl('已打开实验台'), before, name); else showToast(tl('已打开实验台')) }
}
async function save() { const saved = await bench.saveToFile(); if (saved) showToast(tl('已保存 {0}', [saved.split(/[\\/]/).pop() ?? saved])) }
async function share() { try { shareLink.value = await bench.shareLink() } catch (e) { showToast(tl('无法生成链接：{0}', [(e as Error).message]), true) } }
async function copyLink() {
  try { await navigator.clipboard.writeText(shareLink.value ?? ''); showToast(tl('链接已复制（{0} 个字符）', [shareLink.value?.length ?? 0])) } catch { showToast(tl('无法写入剪贴板，请手动选中链接复制'), true) }
}
async function exportRecord() {
  const stem = (bench.fileName.value ?? 'bench').replace(/\.velophi-bench\.json$|\.json$/i, '')
  await saveFile(recordText(bench, new Date().toLocaleDateString(localeTag())), `${stem}.txt`, [{ name: tl('实验记录'), extensions: ['txt'] }])
}
// ---- guided experiments (D270) ----

// every change of the bench is looked at by the runner: a step is done when the core's numbers say so
watch(() => bench.revision.value, () => { if (guide.active.value) guide.check() })
/** Lay out a guided experiment on a fresh bench; the bench that was there is offered back. */
function startExperiment(id: string) {
  const before = bench.portableDoc(), name = bench.fileName.value, had = !bench.empty.value || bench.log.value.length > 0
  if (!guide.start(id)) { showToast(tl('这个实验无法开始'), true); return }
  guideUi.gallery = false
  ency.open = false
  inspector.value = true
  tab.value = 'guide'
  requestAnimationFrame(() => canvas.value?.fit())
  if (had) showToast(tl('已摆好引导实验的器材'), false, { label: tl('撤销'), run: () => { try { guide.leave(); bench.open(before, name); bench.dirty.value = true } catch { /* the bench stays */ } } })
}
const guideStrip = computed(() => {
  const s = guide.step.value
  return guide.active.value && s ? tl('第 {0}/{1} 步　{2}', [guide.index.value + 1, guide.steps.value.length, tl(s.text)]) : ''
})

function resetRoom() { bench.apply({ act: 'ambient', T: 298.15, P: 1 }) }

/** The bench as a picture (D297 item 11): the canvas as it is drawn now, saved as a PNG. */
async function snapshot() {
  const png = await canvas.value?.snapshot()
  if (!png) { showToast(tl('无法生成截图'), true); return }
  const stem = (bench.fileName.value ?? 'bench').replace(/\.velophi-bench\.json$|\.json$/i, '')
  const saved = await saveFile(png, `${stem}.png`, [{ name: 'PNG', extensions: ['png'] }])
  if (saved) showToast(tl('已保存 {0}', [saved.split(/[\\/]/).pop() ?? saved]))
}

// ---- keys of the page ----

function keys(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  if (t.closest('input, textarea, select, [contenteditable]')) return
  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    const k = e.key.toLowerCase()
    if (k === 'z' && !e.shiftKey) { bench.undo(); e.preventDefault() }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { bench.redo(); e.preventDefault() }
    else if (k === 's') { void save(); e.preventDefault() }
  } else if (e.key === 'Escape' && (benchUi.carry || hand.tool)) { cancelHint(); e.stopPropagation() }
  else if (e.key === 'Escape' && (apparatusOpen.value || timeOpen.value)) { apparatusOpen.value = false; timeOpen.value = false; e.stopPropagation() }
}

const menuPlace = (a: { left: string; top: string } | null) => ({ left: a ? `min(${a.left}, calc(100% - 240px))` : '50%', top: a ? `max(64px, min(calc(${a.top} - 200px), calc(100% - 470px)))` : '80px' })
</script>

<template>
  <div class="chem-page" :class="{ phone }" data-ui="chem-page" @keydown="keys">
  <StageLayout
    v-model:catalogue-open="shelfOpen" v-model:inspector="inspector" v-model:tab="tab" panel="chem"
    :catalogue="{ label: tl('药品'), icon: 'flask' }" :tabs="tabs" :loading="loading"
  >
    <template #catalogue>
      <Shelf @pick="pickReagent" @bottle="id => { shelfOpen = false; bench.placeBottle(id) }" @drag="shelfOpen = false" />
    </template>
    <template #bar>
      <div class="app-anchor">
        <button type="button" class="btn ghost" data-ui="chem-apparatus" :class="{ active: apparatusOpen }" aria-haspopup="dialog" :aria-expanded="apparatusOpen" @click="apparatusOpen = !apparatusOpen; shelfOpen = false"><Icon name="beaker" /><span class="lbl">{{ tl('仪器') }}</span><Icon name="chevron" :size="11" /></button>
        <!-- on a phone the shelf rises from the bottom of the window, above everything (out of the bar's box) -->
        <Teleport to="body" :disabled="!phone"><div v-if="apparatusOpen" class="apop glass-float enter app-sheet" :class="{ sheet: phone }" role="dialog" :aria-label="tl('仪器')"><ApparatusShelf v-model:group="apparatusGroup" @pick="pickApparatus" @drag="apparatusOpen = false" /></div></Teleport>
      </div>
      <div v-if="!phone" class="pair" role="group" :aria-label="tl('撤销与重做')">
        <button type="button" class="btn icon ghost" :disabled="!bench.canUndo.value" :title="tl('撤销')" :aria-label="tl('撤销')" data-ui="chem-undo" @click="bench.undo()"><Icon name="undo" /></button>
        <button type="button" class="btn icon ghost" :disabled="!bench.canRedo.value" :title="tl('重做')" :aria-label="tl('重做')" data-ui="chem-redo" @click="bench.redo()"><Icon name="redo" /></button>
      </div>
    </template>
    <template #run>
      <div class="time-anchor" data-ui="chem-time">
        <!-- 26.65 (D290): one control — play and pause, with the speeds and "到反应结束" in its popover -->
        <div class="split" :class="{ active: bench.running.value || bench.finishing.value }">
          <button type="button" class="btn ghost play" :title="timeTitle" :aria-label="timeTitle" :aria-pressed="bench.running.value" data-ui="chem-play" @click="toggleTime"><Icon :name="bench.running.value || bench.finishing.value ? 'pause' : 'play'" /><span class="num clock">{{ timeText }}</span><span v-if="bench.speed.value !== 1" class="num spd">×{{ bench.speed.value }}</span></button>
          <button type="button" class="btn icon ghost more1" :class="{ active: timeOpen }" aria-haspopup="menu" :aria-expanded="timeOpen" :title="tl('时间：速度、到反应结束')" :aria-label="tl('时间：速度、到反应结束')" data-ui="chem-time-menu" @click="timeOpen = !timeOpen"><Icon name="chevron" :size="11" /></button>
        </div>
        <div v-if="timeOpen" class="menu right" role="menu">
          <button v-for="s in SPEEDS" :key="s" type="button" role="menuitemradio" :aria-checked="bench.speed.value === s" :data-speed="s" @click="bench.setSpeed(s); timeOpen = false"><Icon :name="bench.speed.value === s ? 'check' : 'tick'" :class="{ faint: bench.speed.value !== s }" /><span class="num">×{{ s }}</span></button>
          <div class="sep" />
          <button type="button" role="menuitem" data-ui="chem-to-end" @click="toEnd"><Icon name="end" />{{ tl('到反应结束') }}</button>
        </div>
      </div>
    </template>
    <template #more>
      <template v-if="phone">
        <button type="button" role="menuitem" :disabled="!bench.canUndo.value" @click="bench.undo()"><Icon name="undo" />{{ tl('撤销') }}</button>
        <button type="button" role="menuitem" :disabled="!bench.canRedo.value" @click="bench.redo()"><Icon name="redo" />{{ tl('重做') }}</button>
        <div class="sep" />
      </template>
      <button type="button" role="menuitem" data-ui="chem-new" @click="newBench"><Icon name="file" />{{ tl('新建实验台') }}</button>
      <button type="button" role="menuitem" data-ui="chem-open" @click="openFile"><Icon name="open" />{{ tl('打开…') }}</button>
      <button type="button" role="menuitem" data-ui="chem-save" @click="save"><Icon name="save" />{{ tl('保存…') }}</button>
      <button type="button" role="menuitem" data-ui="chem-share" @click="share"><Icon name="share" />{{ tl('分享链接…') }}</button>
      <div class="sep" />
      <button type="button" role="menuitem" data-ui="chem-export-record" @click="exportRecord"><Icon name="report" />{{ tl('导出实验记录') }}</button>
      <button type="button" role="menuitem" data-ui="chem-reset-room" @click="resetRoom"><Icon name="thermometer" />{{ tl('室温与气压复位') }}</button>
      <button type="button" role="menuitem" data-ui="chem-fit" @click="canvas?.fit()"><Icon name="fit" />{{ tl('显示全部') }}</button>
      <button type="button" role="menuitem" data-ui="chem-snapshot" @click="snapshot"><Icon name="image" />{{ tl('实验台截图') }}</button>
      <div class="sep" />
      <!-- 26.65 (D290): the teaching tools live in 更多 -->
      <button type="button" role="menuitem" data-ui="chem-guide-open" @click="guideUi.gallery = true"><Icon name="list" />{{ tl('引导实验…') }}</button>
      <TeachMenu inline />
      <div class="sep" />
      <button type="button" role="menuitem" data-ui="chem-ency" @click="ency.open = true"><Icon name="elements" />{{ tl('元素与物质') }}</button>
    </template>

    <BenchCanvas ref="canvas" @inspect="inspector = true; tab = 'readings'">
      <template #default="{ anchor }">
        <VesselMenu v-if="benchUi.menu" :key="benchUi.menu + (benchUi.chooser ? 'c' : '')" :vessel="benchUi.menu" v-bind="menuPlace(anchor)" @shelf="shelfOpen = true" />
      </template>
    </BenchCanvas>
    <div v-if="bench.failure.value" class="cover">
      <EmptyState tone="chem" icon="alert" :title="tl('化学数据未载入')" :line="bench.failure.value"><button type="button" class="btn" @click="start">{{ tl('重试') }}</button></EmptyState>
    </div>
    <div v-else-if="bench.ready.value && bench.empty.value && !benchUi.carry" class="cover" data-ui="chem-empty">
      <EmptyState tone="chem" :title="tl('空实验台')" :line="tl('取容器，加药品')">
        <template #art><BenchArt /></template>
        <button type="button" class="btn primary" data-ui="chem-first" @click="firstVessel">{{ tl('放置烧杯') }}</button>
        <button type="button" class="btn" data-ui="chem-guide-empty" @click="guideUi.gallery = true">{{ tl('引导实验') }}</button>
      </EmptyState>
    </div>
    <div v-if="hint" class="hint glass-float" role="status" data-ui="chem-hint">
      <span>{{ hint }}</span>
      <label v-if="hand.tool === 'spatula' || hand.tool === 'tweezers'" class="dose"><input v-model.number="hand.dose" class="field num" type="number" min="0.05" max="10" step="0.05" :aria-label="tl('每次的质量')" data-ui="chem-hand-dose" /><span>g</span></label>
      <button type="button" class="btn small ghost" @click="cancelHint">{{ hand.tool ? tl('放下') : tl('取消') }}</button>
    </div>
    <button v-if="guideStrip && !(inspector && tab === 'guide')" type="button" class="gstrip glass-float" data-ui="chem-guide-strip" @click="inspector = true; tab = 'guide'"><Icon name="graduation" :size="14" /><span>{{ guideStrip }}</span></button>
    <span v-if="ghost" class="carried" :style="{ left: ghost.left, top: ghost.top }">{{ ghost.text }}</span>

    <template #inspector="{ tab: shown }"><GuidePanel v-if="shown === 'guide'" /><BenchInspector v-else :tab="shown" /></template>
  </StageLayout>

  <Encyclopedia v-if="ency.open" class="ency-cover" closable :active="props.active" @close="ency.open = false" />
  <AmountDialog v-if="benchUi.dialog" :spec="benchUi.dialog" />
  <ExperimentGallery v-if="guideUi.gallery" @close="guideUi.gallery = false" @start="startExperiment" />
  <div v-if="shareLink !== null" class="dialog-backdrop" @mousedown.self="shareLink = null">
    <div v-dialog="() => { shareLink = null }" class="dialog sharebox" role="dialog" :aria-label="tl('分享链接')">
      <div class="dialog-header"><Icon name="share" :size="18" />{{ tl('分享链接') }}<span class="spacer" /><button type="button" class="btn icon ghost" :title="tl('关闭')" :aria-label="tl('关闭')" @click="shareLink = null"><Icon name="close" /></button></div>
      <div class="dialog-body"><textarea class="field link code" rows="4" readonly :value="shareLink" :aria-label="tl('分享链接')" data-ui="chem-share-link" @focus="($event.target as HTMLTextAreaElement).select()" /></div>
      <div class="dialog-footer"><button type="button" class="btn primary" data-ui="chem-share-copy" @click="copyLink"><Icon name="copy" />{{ tl('复制链接') }}</button></div>
    </div>
  </div>
  </div>
</template>

<style scoped>
/* the page: the stage layout fills it; the dialogs are fixed layers */
.chem-page { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.chem-page > .stage-layout { flex: 1 1 auto; }
/* the encyclopedia covers the bench (content, solid; the bench stays mounted under it) */
.chem-page { position: relative; }
.ency-cover { position: absolute; inset: 0; z-index: 30; }
.app-anchor, .time-anchor { position: relative; flex: 0 0 auto; display: flex; align-items: center; }
.apop { position: absolute; left: 0; top: calc(100% + 8px); z-index: 20; width: min(420px, calc(100vw - 48px)); max-height: min(70vh, 560px); overflow: auto; padding: var(--space-3); border-radius: var(--radius-float); }
.pair { display: flex; align-items: center; flex: 0 0 auto; }
.play { gap: 6px; padding: 0 8px; }
.split { display: flex; align-items: center; border-radius: var(--radius-control); }
.split.active { background: var(--accent-soft); }
.split.active .play { color: var(--accent-strong); }
.clock { min-width: 3.2em; text-align: left; }
.more1 { width: auto; min-width: var(--control-h); padding: 0 6px; }
.spd { font-size: var(--type-small); color: var(--text-2); }
.time-anchor .menu { top: calc(100% + 8px); min-width: 160px; }
.time-anchor .menu.right { left: auto; right: 0; }
.faint { opacity: 0; }
.cover { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; background: var(--canvas-bg); padding-top: var(--bar-h); }
.hint { position: absolute; left: 50%; top: calc(var(--bar-h) + 20px); transform: translateX(-50%); z-index: 4; display: flex; align-items: center; gap: var(--space-2); max-width: calc(100% - 24px); padding: 4px 6px 4px 12px; border-radius: var(--radius-float); font-size: var(--type-small); }
.hint > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* a phone has no room for the sentence on one line: it takes two */
.chem-page.phone .hint > span { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.35; }
.dose { display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto; font-size: var(--type-small); color: var(--text-2); }
.dose .field { width: 5.5em; height: var(--control-sm); }
.gstrip { position: absolute; left: var(--space-3); bottom: var(--space-3); z-index: 4; display: flex; align-items: center; gap: var(--space-2); max-width: calc(100% - 24px); min-height: var(--control-h); padding: 0 var(--space-3); border: 0; border-radius: var(--radius-float); color: var(--text); font: inherit; font-size: var(--type-small); text-align: left; cursor: pointer; }
.gstrip span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.carried { position: fixed; z-index: 9400; padding: 3px 9px; border-radius: var(--radius-pill); background: var(--pane); box-shadow: var(--elev-3); font-size: var(--type-small); pointer-events: none; white-space: nowrap; }
.sharebox { width: min(560px, calc(100vw - 32px)); }
.link { width: 100%; font-size: var(--type-tiny); word-break: break-all; resize: none; }
@media (max-width: 1080px) { .app-anchor .lbl { display: none; } .clock { display: none; } }

/* Phones: the shelves rise from the bottom as sheets */
.chem-page.phone :deep(.sbar .btn) { padding: 0 6px; }
.chem-page.phone :deep(.sbar .cat-anchor .btn .icon:last-child), .chem-page.phone .app-anchor > .btn .icon:last-child { display: none; }
.chem-page.phone :deep(.popover), .apop.sheet { position: fixed; left: 0; right: 0; top: auto; bottom: 0; width: auto; max-height: 62vh; border-radius: var(--radius-float) var(--radius-float) 0 0; z-index: 40; }
</style>
