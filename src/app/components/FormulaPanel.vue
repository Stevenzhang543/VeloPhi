<script setup lang="ts">
/**
 * Formula comparison for the current frame: the situations active at that time, each formula with its
 * conditions, the substituted line, theory vs. simulation and the error. Every substituted value and every
 * result is shown in its own display unit (settings), with the unit written next to it, so the line stays
 * consistent whatever units are chosen; the evaluation itself is always SI (in the core).
 * Follows `state.panelFrame` only while `active` (visible tab on the visible page).
 *
 * 26.51: only formulas within the chosen knowledge level are shown (D44; the others are folded into one line
 * that can be expanded), each card carries its level tag, and the substitution is shown compactly as
 * "given → substituted → result" with every known value in its own colour, plus the calculation steps on demand (D45).
 *
 * 26.53 (D70): a tool row — search (`/`), filters by body, category, verdict and favourites, compact or detailed
 * cards, grouping by situation or by body; favourites first; keyboard (↑↓ move, Enter details, Space expand,
 * f favourite); when the filters leave nothing, which ones did and a way to clear them. (D71) The formula timeline
 * focuses a situation here. (D72) Hovering a card or a known value highlights it on the canvas; a body or force
 * clicked on the canvas filters the cards.
 */
import { tl, paren, semiSep } from '../../i18n'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { state, seekTime, problemLocked } from '../store'
import ProblemLock from './ProblemLock.vue'
import { activeSituations, cardsAt, THRESHOLDS } from '../../formula/match'
import type { FormulaCard, Verdict } from '../../formula/match'
import type { Sample, Situation } from '../../formula/recognize'
import { useGated } from '../live'
import { effectiveCurriculum, fmtNum, fmtQ, settings, unitLabel } from '../settings'
import { shownTime } from '../../units/clock'
import { levelTag, withinLevel } from '../../formula/levels'
import type { Solution } from '../../formula/solve'
import { solveFormula } from '../../formula/solve'
import { locale } from '../../i18n/locale'
import type { FormulaFilter } from '../../formula/panel'
import { CATEGORIES, cardHighlight, emptyReasons, forceKindsOf, pinnedFirst, rejectedBy, varHighlight, varRef } from '../../formula/panel'
import { forceLabelOfKind } from '../../render/renderer'
import RichText from './detail/RichText.vue'
import Tex from './Tex.vue'
import Icon from './Icon.vue'
import { openFormulaDetail } from '../details'
import { openHandbook } from '../handbook'
import { FORMULAS } from '../../formula/library'
import { formulaRef } from '../../formula/refKind'
import type { FormulaRef } from '../../formula/refKind'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })

const fu = settings.ui.formula
const showNA = ref(false)
const frame = useGated(() => props.active, () => state.panelFrame)
const search = ref('')
const searchEl = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)

/** Compact worked solution of a card: coloured knowns, substitution and result, steps (D45). */
function compact(c: FormulaCard, sample: Sample, digits: number): Solution | null {
  if (c.theory === null) return null
  try { return solveFormula(c.formula, sample, { digits, units: settings.units, lang: locale.lang }, c.trace, c.reason) } catch { return null }
}

/** Cards whose calculation steps are expanded; compact rows opened into full cards. */
const expanded = ref(new Set<string>())
const opened = ref(new Set<string>())
const toggleIn = (r: typeof expanded, key: string) => { const s = new Set(r.value); if (s.has(key)) s.delete(key); else s.add(key); r.value = s }
const toggleOpen = (key: string) => toggleIn(opened, key)
const toggleSteps = (key: string) => toggleIn(expanded, key)
/** Show the formulas above the chosen knowledge level too. */
const showAbove = ref(false)

const reducedFrom = computed(() => (state.stale ? null : state.recording?.reducedFrom ?? null))
const reducedNow = computed(() => reducedFrom.value !== null && state.recording !== null && frame.value * state.recording.dt >= reducedFrom.value - 1e-12)

const bodyName = (id: string) => state.scene.bodies.find(b => b.id === id)?.name ?? id

/** The filters in effect. */
const filter = computed<FormulaFilter>(() => ({
  search: search.value, body: fu.body, category: fu.category as FormulaFilter['category'], verdict: fu.verdict, pinnedOnly: fu.pinnedOnly, pinned: fu.pinned, pick: state.formulaPick
}))
const filtering = computed(() => !!(search.value.trim() || fu.body || fu.category || fu.verdict !== 'all' || fu.pinnedOnly || state.formulaPick))
function clearFilters() {
  search.value = ''; fu.body = ''; fu.category = ''; fu.verdict = 'all'; fu.pinnedOnly = false; state.formulaPick = null
}

// ---- Three layers (26.54, D86): situation overview → compact formula rows → full cards ----
/** The filter drawer and the reading guide are folded away; the button shows how many filters are on. */
const filtersOpen = ref(false)
const legendOpen = ref(false)
const activeFilters = computed(() => [fu.body, fu.category, fu.verdict !== 'all', fu.pinnedOnly].filter(Boolean).length)
/** Situations the user opened or folded (by key); the others follow the default below. */
const sitOpen = ref(new Map<string, boolean>())
/** Whole-run situations (the energy ledger, momentum) start folded; the phases at the frame start open. */
const WHOLE_RUN = new Set(['energy', 'momentum'])
function groupOpen(g: { key: string; sit: Situation | null }): boolean {
  return sitOpen.value.get(g.key) ?? !(g.sit && WHOLE_RUN.has(g.sit.type))
}
function toggleGroup(g: { key: string; sit: Situation | null }) {
  const m = new Map(sitOpen.value)
  m.set(g.key, !groupOpen(g))
  sitOpen.value = m
}
/** The formula shown on a folded situation: a favourite, else the first card. */
function keyCard(g: { cards: Array<{ c: FormulaCard; pinned: boolean }> }): FormulaCard | null {
  return (g.cards.find(x => x.pinned) ?? g.cards[0])?.c ?? null
}
/** Verdict dots of a situation (at most eight). */
const dotsOf = (g: { cards: Array<{ c: FormulaCard }> }) => g.cards.slice(0, 8).map(x => VERDICT[x.c.verdict].cls)
/** The other situations of the run (not at the frame): one folded line each, a click jumps to them. */
/** Formulas within the knowledge level per situation type (26.55, D97: counted once per level, not per frame). */
const countByType = computed(() => {
  const cur = effectiveCurriculum(), level = settings.knowledge.level
  const m = new Map<string, number>()
  for (const f of FORMULAS) if (withinLevel(f.id, cur, level)) m.set(f.situation, (m.get(f.situation) ?? 0) + 1)
  return m
})
/** Every situation of the run in time order with its formula count (changes only with the recognised situations). */
const runSituations = computed(() => state.situations.map(s => ({ sit: s, count: countByType.value.get(s.type) ?? 0 })).sort((a, b) => a.sit.t0 - b.sit.t0))
/** Keys of the situations at the frame, as one string: the list below is rebuilt only when that set changes. */
const atKeys = computed(() => base.value.map(g => g.sit.key).join('\n'))
const others = computed(() => {
  if (fu.group !== 'situation' || filtering.value) return []
  const at = new Set(atKeys.value.split('\n'))
  return runSituations.value.filter(x => !at.has(x.sit.key))
})
function jumpTo(s: Situation) {
  seekTime(s.tEvent ?? s.t0 + Math.min(1e-9, (s.t1 - s.t0) / 2))
  const m = new Map(sitOpen.value)
  m.set(s.key, true)
  sitOpen.value = m
}

interface Shown { c: FormulaCard; sol: Solution | null; tag: string; pinned: boolean; rk: FormulaRef }
interface Group { key: string; title: string; sit: Situation | null; sample: Sample | null; cards: Shown[]; above: number; na: FormulaCard[]; t0: number; t1: number; tEvent?: number }

/** Every applicable card at the frame, before the filters (the cards of the core, cached per frame). */
const base = computed(() => {
  const rec = state.recording
  if (!rec || state.stale) return []
  const t = frame.value * rec.dt
  const all = cardsAt(rec, t, { digits: state.digits, trace: true }, state.situations)
  return activeSituations(state.situations, t).map(s => ({ sit: s, cards: all.filter(c => c.situation.key === s.key) }))
})

/** Bodies of the situations at the frame (the body filter's choices). */
const bodyChoices = computed(() => [...new Set(base.value.flatMap(g => g.sit.bodies))].map(id => ({ id, name: bodyName(id) })))

const groups = computed<Group[]>(() => {
  const digits = state.digits
  const cur = effectiveCurriculum(), level = settings.knowledge.level
  const f = filter.value
  const show = (c: FormulaCard, sample: Sample): Shown => ({ c, sol: compact(c, sample, digits), tag: tl(levelTag(c.formula.id, cur)), pinned: fu.pinned.includes(c.formula.id), rk: formulaRef(c.formula, sample) })
  const perSit = base.value.map(({ sit: s, cards }) => {
    const sample = cards[0]?.sample ?? s.sample(Math.min(Math.max(frame.value * (state.recording?.dt ?? 0), s.t0), s.t1))
    const applicable = cards.filter(c => c.verdict !== 'not-applicable')
    const within = applicable.filter(c => withinLevel(c.formula.id, cur, level))
    const above = applicable.filter(c => !withinLevel(c.formula.id, cur, level))
    const list = pinnedFirst([...within, ...(showAbove.value ? above : [])].filter(c => rejectedBy(c, f) === null), fu.pinned)
    return { sit: s, sample, cards: list.map(c => show(c, sample)), above: above.length, na: cards.filter(c => c.verdict === 'not-applicable') }
  })
  if (fu.group === 'situation') {
    return perSit.map(g => ({ key: g.sit.key, title: g.sit.title, sit: g.sit, sample: g.sample, cards: g.cards, above: g.above, na: g.na, t0: g.sit.t0, t1: g.sit.t1, tEvent: g.sit.tEvent }))
  }
  // By body: the situations of the same bodies together
  const map = new Map<string, Group>()
  for (const g of perSit) {
    const key = [...g.sit.bodies].sort().join('|') || '—'
    let e = map.get(key)
    if (!e) { e = { key, title: g.sit.bodies.map(bodyName).join(tl('、')) || tl('系统'), sit: null, sample: null, cards: [], above: 0, na: [], t0: g.sit.t0, t1: g.sit.t1 }; map.set(key, e) }
    e.cards.push(...g.cards); e.above += g.above; e.na.push(...g.na)
    e.t0 = Math.min(e.t0, g.sit.t0); e.t1 = Math.max(e.t1, g.sit.t1)
  }
  for (const e of map.values()) e.cards = [...e.cards.filter(x => x.pinned), ...e.cards.filter(x => !x.pinned)]
  return [...map.values()]
})

/** Every card at the frame within the level (for the empty-state reasons). */
const allCards = computed(() => base.value.flatMap(g => g.cards.filter(c => c.verdict !== 'not-applicable')))
const shownCount = computed(() => groups.value.reduce((n, g) => n + g.cards.length, 0))
const REASON_TEXT: Record<string, string> = { search: '搜索', body: '物体', category: '类别', verdict: '判定', pinnedOnly: '只看收藏', pick: '画面中选中的对象' }
const emptyBecause = computed(() => (filtering.value && shownCount.value === 0 && allCards.value.length ? emptyReasons(allCards.value, filter.value).map(k => tl(REASON_TEXT[k])) : []))

/** Flat list of the cards shown (keyboard navigation). */
const flat = computed(() => groups.value.flatMap(g => g.cards.map(x => x.c)))
const cursor = ref(-1)
watch(flat, l => { if (cursor.value >= l.length) cursor.value = l.length - 1 })

// A formula opened from the handbook: show it even above the chosen level, and bring its card into view
watch(() => [state.formulaFocus, groups.value.length] as const, async ([id]) => {
  if (!id || !base.value.length) return
  if (!groups.value.some(g => g.cards.some(x => x.c.formula.id === id))) { showAbove.value = true; clearFilters() }
  await nextTick()
  const el = listEl.value?.querySelector(`[data-fid="${id}"]`)
  if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => { if (state.formulaFocus === id) state.formulaFocus = null }, 2500) }
})
// A situation clicked on the formula timeline (D71)
watch(() => [state.formulaSituation, groups.value.length] as const, async ([key]) => {
  if (!key) return
  if (fu.group !== 'situation') fu.group = 'situation'
  await nextTick()
  const el = listEl.value?.querySelector(`[data-sit="${CSS.escape(key)}"]`)
  if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' })
  setTimeout(() => { if (state.formulaSituation === key) state.formulaSituation = null }, 1800)
})

/** Open the detail view (derivation, step-by-step solution, conditions) of a card at the frame shown. */
function openDetail(c: FormulaCard) {
  const rec = state.recording
  if (rec) openFormulaDetail(c.formula.id, c.situation.key, frame.value * rec.dt)
}

function togglePin(id: string) {
  fu.pinned = fu.pinned.includes(id) ? fu.pinned.filter(x => x !== id) : [...fu.pinned, id]
}

// ---- Canvas linkage (D72) ----
function hoverCard(c: FormulaCard | null) { state.formulaHighlight = c ? cardHighlight(c) : null }
function hoverVar(name: string | null, sit: Situation | null) { state.formulaHighlight = name && sit ? varHighlight(name, sit) : null }
const linked = (name: string, sit: Situation | null) => !!sit && varRef(name, sit) !== null
onBeforeUnmount(() => { state.formulaHighlight = null })
watch(() => props.active, on => { if (!on) state.formulaHighlight = null })
const pickText = computed(() => {
  const p = state.formulaPick
  if (!p) return ''
  return p.force ? tl('{0} 受到的 {1}', [bodyName(p.body), tl(forceLabelOfKind(p.force))]) : bodyName(p.body)
})

// ---- Keyboard (D70) ----
function focusCard(i: number) {
  if (!flat.value.length) return
  cursor.value = Math.max(0, Math.min(flat.value.length - 1, i))
  const c = flat.value[cursor.value]
  const el = listEl.value?.querySelector<HTMLElement>(`[data-ckey="${CSS.escape(c.key)}"]`)
  el?.focus({ preventScroll: true })
  el?.scrollIntoView({ block: 'nearest' })
}
function onListKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return
  const c = flat.value[cursor.value]
  const own = () => { e.preventDefault(); e.stopPropagation() }
  if (e.key === 'ArrowDown') { own(); focusCard(cursor.value + 1) } else if (e.key === 'ArrowUp') { own(); focusCard(cursor.value - 1) } else if (c && e.key === 'Enter') { own(); openDetail(c) } else if (c && e.key === ' ') { own(); toggleIn(fu.density === 'compact' ? opened : expanded, c.key) } else if (c && e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) { own(); togglePin(c.formula.id) }
}
/** `/` focuses the search box while the formula tab is shown. */
function onGlobalKey(e: KeyboardEvent) {
  if (e.key !== '/' || !props.active || state.rightTab !== 'formula' || e.ctrlKey || e.metaKey || e.altKey) return
  const t = e.target as HTMLElement
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return
  e.preventDefault()
  searchEl.value?.focus()
}
onMounted(() => window.addEventListener('keydown', onGlobalKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey))
function onSearchKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { search.value = ''; (e.target as HTMLInputElement).blur() } else if (e.key === 'ArrowDown') { e.preventDefault(); focusCard(0) }
}

/** 26.56 (FOR06, D101): how independent the comparison of a card is. */
const REF_TEXT: Record<FormulaRef, string> = { analytic: tl('独立解析'), conservation: tl('守恒/定理检验'), consistency: tl('同源一致性') }
const REF_TIP: Record<FormulaRef, string> = {
  analytic: tl('公式由给定参数独立求出，与仿真比较是独立证据'),
  conservation: tl('检验守恒律或定理在本次运行中成立；它不单独决定运动'),
  consistency: tl('公式用到同一次仿真读出的量，一致只说明内部自洽，不是正确性证据')
}
const VERDICT: Record<Verdict, { text: string; cls: string }> = {
  match: { text: tl('一致'), cls: 'ok' },
  deviate: { text: tl('偏差超限'), cls: 'bad' },
  'approx-ok': { text: tl('近似成立'), cls: 'ok' },
  approx: { text: tl('近似'), cls: 'warn' },
  'approx-invalid': { text: tl('近似失效'), cls: 'bad' },
  'not-applicable': { text: tl('不适用'), cls: '' },
  'no-measure': { text: tl('无法比较'), cls: '' }
}

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
/** A relative error as people read it: 0, a percentage, or m×10⁻ⁿ when it is below 0.001 % (26.53). */
function relText(r: number, digits: number): string {
  if (r === 0) return '0'
  // Number(): 100 % and more stay plain numbers (toPrecision alone writes 1.0e+2)
  if (r * 100 >= 1e-3) return `${Number((r * 100).toPrecision(digits))}%`
  const [m, e] = r.toExponential(digits - 1).split('e')
  return `${m}×10${String(Number(e)).split('').map(ch => SUP[ch] ?? ch).join('')}`
}
/** A theoretical value of exactly 0 (the power of the Lorentz force …): a relative error means nothing, the absolute error is shown (26.54). */
const zeroTheory = (c: FormulaCard) => c.theory === 0
function err(c: FormulaCard): string {
  if (c.absError === null) return '—'
  if (zeroTheory(c)) return fmtQ(c.absError, c.formula.unit, 3)
  const rel = c.relError !== null ? relText(c.relError, 3) : '—'
  return `${fmtQ(c.absError, c.formula.unit, 3)}${paren(rel)}`
}
/** Relative error alone (compact rows); the absolute error when the theory is 0. */
function relErr(c: FormulaCard): string {
  if (c.relError === null || zeroTheory(c)) return c.absError === null ? '—' : fmtQ(c.absError, c.formula.unit, 2)
  return relText(c.relError, 2)
}
const sci = (v: number) => { const e = Math.round(Math.log10(v)); return `10${String(e).split('').map(c => SUP[c]).join('')}` }
const forceTitle = (c: FormulaCard) => forceKindsOf(c.formula).map(k => tl(forceLabelOfKind(k))).join(tl('、'))
</script>

<template>
  <div class="formulas">
    <ProblemLock v-if="problemLocked()" />
    <div v-else-if="!state.recording || state.stale" class="empty">{{ tl('运行仿真后，这里会按当前时刻列出匹配的公式，') }}<br />{{ tl('代入参数后与仿真结果逐项对照。') }}</div>
    <template v-else>
      <div class="ftools" role="toolbar" :aria-label="tl('公式筛选')">
        <div class="row">
          <label class="search">
            <Icon name="eye" :size="14" />
            <input ref="searchEl" v-model="search" class="field" type="search" :placeholder="tl('搜索公式、符号或情形（/）')" :aria-label="tl('搜索公式')" @keydown="onSearchKey" />
          </label>
          <button class="btn ghost small tool-btn" :class="{ active: filtersOpen || activeFilters }" :aria-expanded="filtersOpen" :title="tl('按物体、类别、判定筛选，切换紧凑或详细、分组方式')" @click="filtersOpen = !filtersOpen">
            <Icon name="sliders" :size="14" />{{ tl('筛选') }}<span v-if="activeFilters" class="nbadge">{{ activeFilters }}</span>
          </button>
          <button class="btn ghost small icon-btn" :class="{ active: legendOpen }" :aria-expanded="legendOpen" :title="tl('判定与读法')" @click="legendOpen = !legendOpen">?</button>
        </div>
        <div v-if="filtersOpen" class="drawer">
          <div class="row filters">
            <select v-model="fu.body" class="field small" :aria-label="tl('按物体筛选')">
              <option value="">{{ tl('全部物体') }}</option>
              <option v-for="b in bodyChoices" :key="b.id" :value="b.id">{{ b.name }}</option>
              <option v-if="fu.body && !bodyChoices.some(b => b.id === fu.body)" :value="fu.body">{{ bodyName(fu.body) }}</option>
            </select>
            <select v-model="fu.category" class="field small" :aria-label="tl('按类别筛选')">
              <option value="">{{ tl('全部类别') }}</option>
              <option v-for="c in CATEGORIES" :key="c.id" :value="c.id">{{ tl(c.label) }}</option>
            </select>
            <select v-model="fu.verdict" class="field small" :aria-label="tl('按判定筛选')">
              <option value="all">{{ tl('全部判定') }}</option>
              <option value="match">{{ tl('一致') }}</option>
              <option value="deviate">{{ tl('偏差') }}</option>
              <option value="approx">{{ tl('近似') }}</option>
            </select>
          </div>
          <div class="row">
            <button class="chip" :class="{ on: fu.pinnedOnly }" :aria-pressed="fu.pinnedOnly" :title="tl('只显示收藏的公式')" @click="fu.pinnedOnly = !fu.pinnedOnly">★ {{ tl('收藏') }}</button>
            <div class="seg" role="radiogroup" :aria-label="tl('密度')">
              <button :class="{ on: fu.density === 'compact' }" role="radio" :aria-checked="fu.density === 'compact'" :title="tl('每条公式一行：判定、公式、理论值与仿真值、误差')" @click="fu.density = 'compact'">{{ tl('紧凑') }}</button>
              <button :class="{ on: fu.density === 'detailed' }" role="radio" :aria-checked="fu.density === 'detailed'" :title="tl('完整卡片：代入过程、条件与原因')" @click="fu.density = 'detailed'">{{ tl('详细') }}</button>
            </div>
            <select v-model="fu.group" class="field small" :aria-label="tl('分组方式')">
              <option value="situation">{{ tl('按情形') }}</option>
              <option value="body">{{ tl('按物体') }}</option>
            </select>
            <span class="spacer" />
            <button v-if="filtering" class="btn ghost small" @click="clearFilters">{{ tl('清除筛选') }}</button>
          </div>
        </div>
        <div v-if="legendOpen" class="legend tiny muted">
          {{ tl('精确公式：相对误差 ≤ {0} 判为一致（能量账本 ≤ {1}）。近似公式按适用条件分级。已知量按“设置 › 单位与数值”显示，代入时换算为国际单位；颜色对应同一个量。', [sci(THRESHOLDS.exactRel), sci(THRESHOLDS.energyRel)]) }}
          <br />{{ tl('键盘：/ 搜索，↑↓ 移动，Enter 详情，空格展开，F 收藏。悬停公式或已知量会在画面中标出相关物体与力；在画面中点击物体或力可按它筛选公式。') }}
          <br />{{ tl('三层查看：先看每个情形的一行概览，展开后是每条公式一行，再点开是完整的代入与对照。') }}
        </div>
        <div v-if="state.formulaPick || (filtering && !filtersOpen)" class="row pickrow">
          <span v-if="state.formulaPick" class="pick small"><span class="muted">{{ tl('画面筛选：') }}</span>{{ pickText }}<button class="x" :title="tl('取消画面筛选')" @click="state.formulaPick = null">×</button></span>
          <span class="spacer" />
          <button v-if="filtering" class="btn ghost small" @click="clearFilters">{{ tl('清除筛选') }}</button>
        </div>
      </div>
      <div v-if="reducedFrom !== null" class="reduced small" :class="{ now: reducedNow }">
        <span class="badge warn">{{ tl('精度降级') }}</span>
        <span>{{ tl('{0} Moreau–Jean 时间步进计算，{1}仿真值精度降低、事件时刻不精确定位，下面的对照仅供参考。', [reducedFrom > 0 ? tl('事件过于密集，自 t = {0} 起改用', [fmtQ(shownTime(reducedFrom), 's', 6)]) : tl('本次使用'), reducedFrom > 0 ? tl('此后的') : '']) }}</span>
      </div>
      <div v-if="state.computing && !state.situations.length" class="empty">{{ tl('正在计算，完成后识别典型情形并对照公式…') }}</div>
      <div v-else-if="base.length === 0" class="empty">{{ tl('当前时刻没有识别到可匹配的典型情形。') }}</div>
      <div v-else-if="emptyBecause.length" class="empty filtered">
        {{ tl('没有符合筛选的公式：被“{0}”排除。', [emptyBecause.join(tl('、'))]) }}
        <button class="btn small" @click="clearFilters">{{ tl('清除筛选') }}</button>
      </div>
      <div ref="listEl" class="list" @keydown="onListKey">
        <section v-for="g in groups" v-show="g.cards.length || !filtering" :key="g.key" class="situation" :class="{ flash: g.sit && state.formulaSituation === g.sit.key, open: groupOpen(g) }" :data-sit="g.key">
          <div class="shead">
            <button type="button" class="stoggle" :aria-expanded="groupOpen(g)" @click="toggleGroup(g)">
              <Icon name="chevron" :size="12" class="schev" />
              <span class="stitle">{{ g.title }}</span>
              <span class="scount">{{ g.cards.length }}</span>
              <span class="sdots" aria-hidden="true"><i v-for="(d, i) in dotsOf(g)" :key="i" class="dot" :class="d" /></span>
            </button>
            <button v-if="g.tEvent !== undefined" class="btn ghost small" @click="seekTime(g.tEvent!)">{{ tl('跳到 t = {0}', [fmtQ(shownTime(g.tEvent!), 's', 6)]) }}</button>
            <span v-else class="tiny muted mono stime">{{ fmtNum(shownTime(g.t0), 's', 4) }}–{{ fmtNum(shownTime(g.t1), 's', 4) }} {{ unitLabel('s') }}</span>
          </div>
          <button v-if="!groupOpen(g) && keyCard(g)" type="button" class="skey" :title="keyCard(g)!.formula.title" @click="toggleGroup(g)" @mouseenter="hoverCard(keyCard(g))" @mouseleave="hoverCard(null)">
            <span class="dot" :class="VERDICT[keyCard(g)!.verdict].cls" /><Tex :tex="keyCard(g)!.symbolic" />
          </button>
          <div v-if="groupOpen(g)" class="sbody">
          <details v-if="g.sample && fu.density === 'detailed'" class="vars">
            <summary class="tiny muted">{{ tl('已知量（来自场景与本阶段初态）') }}</summary>
            <div v-for="(v, k) in g.sample.vars" :key="k" class="var small" :class="{ linked: linked(String(k), g.sit) }" @mouseenter="hoverVar(String(k), g.sit)" @mouseleave="hoverVar(null, null)">
              <Tex :tex="v.symbol" /> <span class="muted">{{ v.label }}</span> <span class="spacer" />
              <span class="mono">{{ fmtQ(v.value, v.unit) }}</span>
            </div>
          </details>
          <template v-for="{ c, sol, tag, pinned, rk } in g.cards" :key="c.key">
            <!-- Compact: one line per formula, opened into the full card on click -->
            <div
              v-if="fu.density === 'compact' && !opened.has(c.key)" class="crow" :class="[VERDICT[c.verdict].cls, { focus: state.formulaFocus === c.formula.id, cur: flat[cursor]?.key === c.key }]"
              tabindex="0" :data-fid="c.formula.id" :data-ckey="c.key" role="button" :aria-expanded="false" :title="forceTitle(c) ? tl('涉及：{0}', [forceTitle(c)]) : c.formula.title"
              @click="toggleOpen(c.key); cursor = flat.indexOf(c)" @focus="cursor = flat.indexOf(c)" @mouseenter="hoverCard(c)" @mouseleave="hoverCard(null)"
            >
              <span class="dot" :class="VERDICT[c.verdict].cls" :title="VERDICT[c.verdict].text" />
              <span class="ctitle">{{ c.formula.title }}<span v-if="fu.group === 'body'" class="tiny muted sit"> · {{ c.situation.title }}</span></span>
              <span class="ctex"><Tex :tex="c.symbolic" /></span>
              <span class="cvals mono small"><span :title="tl('理论值')">{{ fmtQ(c.theory, c.formula.unit) }}</span><span class="muted" :title="tl('仿真值')">{{ fmtQ(c.sim, c.formula.unit) }}</span></span>
              <span class="cerr mono tiny" :class="VERDICT[c.verdict].cls" :title="tl('误差')">{{ relErr(c) }}</span>
              <button class="star" :class="{ on: pinned }" :aria-pressed="pinned" :title="pinned ? tl('取消收藏（F）') : tl('收藏（F）')" @click.stop="togglePin(c.formula.id)">{{ pinned ? '★' : '☆' }}</button>
            </div>
            <article
              v-else class="card" :class="[VERDICT[c.verdict].cls, { focus: state.formulaFocus === c.formula.id, cur: flat[cursor]?.key === c.key }]" tabindex="0" :data-fid="c.formula.id" :data-ckey="c.key"
              @focus="cursor = flat.indexOf(c)" @mouseenter="hoverCard(c)" @mouseleave="hoverCard(null)"
            >
              <div class="card-head">
                <button class="star" :class="{ on: pinned }" :aria-pressed="pinned" :title="pinned ? tl('取消收藏（F）') : tl('收藏（F）')" @click.stop="togglePin(c.formula.id)">{{ pinned ? '★' : '☆' }}</button>
                <span class="card-title">{{ c.formula.title }}<span v-if="fu.group === 'body'" class="tiny muted"> · {{ c.situation.title }}</span></span>
                <span v-if="c.formula.method" class="badge info">{{ c.formula.method }}</span>
                <span class="badge level" :title="tl('知识水平（设置 › 知识与公式）')">{{ tag }}</span>
                <span class="badge ref" :class="rk" :title="REF_TIP[rk]">{{ REF_TEXT[rk] }}</span>
                <span class="spacer" />
                <span class="badge" :class="VERDICT[c.verdict].cls">{{ VERDICT[c.verdict].text }}</span>
                <button class="btn ghost small detail-btn" :title="tl('在学习手册中查看这条公式的原理与推导')" @click="openHandbook(c.formula.id)">{{ tl('手册') }}</button>
                <button class="btn ghost small detail-btn" :title="tl('推导、解题过程与适用条件')" @click="openDetail(c)">{{ tl('详情') }}</button>
                <button v-if="fu.density === 'compact'" class="btn ghost small detail-btn" :title="tl('收起为一行')" @click="toggleOpen(c.key)">▴</button>
              </div>
              <Tex :tex="c.symbolic" display />
              <template v-if="sol && !sol.error">
                <div v-if="sol.known.length" class="knowns small">
                  <span class="muted">{{ tl('已知') }}</span>
                  <span v-for="k in sol.known" :key="k.name" class="known" :class="{ linked: linked(k.name, c.situation) }" @mouseenter="hoverVar(k.name, c.situation)" @mouseleave="hoverCard(c)"><Tex :tex="`\\textcolor{${k.color}}{${k.symbol} = ${k.display}}`" /></span>
                </div>
                <div class="subst"><Tex :tex="sol.coloredSubstituted ? `${sol.lhs} = ${sol.coloredSubstituted} = ${sol.resultDisplay}` : `${sol.lhs} = ${sol.resultDisplay}`" /></div>
                <button v-if="sol.lines.length > 1" class="steps-toggle tiny" :aria-expanded="expanded.has(c.key)" @click="toggleSteps(c.key)">{{ expanded.has(c.key) ? tl('收起计算步骤') : tl('展开计算步骤（{0} 步）', [sol.lines.length]) }}</button>
                <div v-if="expanded.has(c.key)" class="steps">
                  <template v-for="(ln, li) in sol.lines" :key="li">
                    <div class="step-eq"><Tex :tex="li === 0 ? `${sol.lhs} = ${ln.tex}` : `= ${ln.tex}`" /></div>
                    <div class="step-note tiny muted"><RichText v-if="ln.note" :text="ln.note" /></div>
                  </template>
                </div>
              </template>
              <div class="compare small">
                <span class="muted">{{ tl('理论值') }}</span><span class="mono">{{ fmtQ(c.theory, c.formula.unit) }}</span>
                <span class="muted">{{ tl('仿真值') }}</span><span class="mono">{{ fmtQ(c.sim, c.formula.unit) }}</span>
                <span class="muted">{{ tl('误差') }}</span><span class="mono">{{ err(c) }}</span>
              </div>
              <div class="tiny muted">{{ tl('仿真量：{0}', [c.measureLabel]) }}<template v-if="c.formula.note">{{ semiSep() }}{{ c.formula.note }}</template></div>
              <div v-if="c.conditions.length" class="conds">
                <span v-for="cd in c.conditions" :key="cd.id" class="badge" :class="cd.status === 'ok' ? 'ok' : cd.status === 'approx' ? 'warn' : 'bad'" :title="cd.detail">{{ cd.label }}<template v-if="cd.detail">：{{ cd.detail }}</template></span>
              </div>
              <div v-if="c.reason && (c.verdict === 'deviate' || c.verdict === 'no-measure' || c.verdict === 'not-applicable')" class="reason small">{{ c.reason }}</div>
            </article>
          </template>
          <div v-if="showNA && g.na.length" class="na">
            <div v-for="c in g.na" :key="c.key" class="na-item small">
              <Tex :tex="c.symbolic" /> <span class="muted">— {{ c.reason }}</span>
            </div>
          </div>
          <button v-if="g.above && !showAbove" class="above small" @click="showAbove = true">{{ tl('还有 {0} 条超出所选知识水平的公式，点此显示', [g.above]) }}</button>
          </div>
        </section>
        <template v-if="others.length">
          <div class="others-head tiny muted">{{ tl('本次运行的其他情形（点击跳到该时段）') }}</div>
          <button v-for="o in others" :key="o.sit.key" type="button" class="orow" @click="jumpTo(o.sit)">
            <Icon name="chevron" :size="12" class="schev" />
            <span class="stitle">{{ o.sit.title }}</span>
            <span class="scount">{{ o.count }}</span>
            <span class="tiny muted mono stime">{{ o.sit.tEvent !== undefined ? `t = ${fmtNum(shownTime(o.sit.tEvent), 's', 4)}` : `${fmtNum(shownTime(o.sit.t0), 's', 4)}–${fmtNum(shownTime(o.sit.t1), 's', 4)}` }} {{ unitLabel('s') }}</span>
          </button>
        </template>
      </div>
      <label v-if="groups.some(g => g.above) || showAbove" class="check small na-toggle"><input v-model="showAbove" type="checkbox" />{{ tl('显示超出所选知识水平的公式') }}</label>
      <label class="check small na-toggle"><input v-model="showNA" type="checkbox" />{{ tl('显示本时刻不适用的公式及原因') }}</label>
    </template>
  </div>
</template>

<style scoped>
.badge.ref { font-weight: 500; }
.badge.ref.consistency { color: var(--warning, #b45309); }
.badge.ref.conservation { color: var(--accent); }
.formulas { padding-top: 4px; }
.ftools { position: sticky; top: 0; z-index: 3; background: var(--pane); padding: 2px 0 6px; margin-bottom: 4px; box-shadow: 0 1px 0 var(--separator); }
.ftools .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
.ftools .filters select { flex: 1 1 6.5em; min-width: 5.5em; max-width: 11em; }
.search { flex: 1 1 10em; display: flex; align-items: center; gap: 4px; background: var(--fill); border-radius: 8px; padding: 0 8px; color: var(--text-2); min-width: 8em; }
.search .field { border: 0; background: transparent; flex: 1; min-width: 0; height: calc(26px * var(--zoom)); padding: 0; box-shadow: none; }
.seg { display: inline-flex; background: var(--fill); border-radius: 8px; padding: 2px; flex: 0 0 auto; }
.seg button { border: 0; background: none; padding: 2px 9px; border-radius: 6px; font-size: var(--type-small); color: var(--text-2); cursor: pointer; }
.seg button.on { background: var(--pane); color: var(--text); box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.15)); }
.chip { border: 1px solid var(--separator); background: none; border-radius: 999px; padding: 1px 9px; font-size: var(--type-small); color: var(--text-2); cursor: pointer; flex: 0 0 auto; }
.chip.on { border-color: var(--warning); color: var(--text); background: var(--warning-soft); }
.pickrow { margin-top: 4px; }
.pick { display: inline-flex; align-items: center; gap: 4px; background: var(--accent-soft); border-radius: 999px; padding: 1px 4px 1px 10px; }
.pick .x { border: 0; background: none; cursor: pointer; color: var(--text-2); font-size: 1.1em; line-height: 1; padding: 0 4px; }
.legend { margin: 2px 2px 8px; line-height: 1.45; }
.reduced { display: flex; gap: 8px; align-items: flex-start; background: var(--warning-soft); border-radius: var(--radius-group); padding: 8px 10px; margin-bottom: 10px; line-height: 1.5; }
.reduced.now { box-shadow: inset 3px 0 0 var(--warning); }
.reduced .badge { flex: 0 0 auto; }
.empty.filtered { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.situation { margin-bottom: 6px; border-radius: var(--radius-group); }
.situation.open { margin-bottom: 12px; }
.shead { display: flex; align-items: center; gap: 4px; min-height: 28px; }
.stoggle, .orow { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; border: 0; background: transparent; padding: 4px 2px; border-radius: 6px; cursor: pointer; text-align: left; color: var(--text); }
.stoggle:hover, .orow:hover { background: var(--hover); }
.schev { flex: 0 0 auto; transition: transform var(--dur-2) var(--ease-out); color: var(--text-3, var(--text-2)); }
.situation.open .schev { transform: rotate(90deg); }
.stitle { font-weight: 600; font-size: var(--type-body, 13px); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scount { flex: 0 0 auto; font-size: var(--type-tiny); color: var(--text-2); background: var(--fill); border-radius: 999px; padding: 0 6px; }
.sdots { display: inline-flex; gap: 3px; flex: 0 0 auto; margin-left: auto; }
.sdots .dot { width: 6px; height: 6px; }
.stime { flex: 0 0 auto; white-space: nowrap; }
.skey { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: var(--group); border-radius: 8px; padding: 4px 10px; margin: 0 0 2px 18px; max-width: calc(100% - 18px); cursor: pointer; color: var(--text-2); font-size: 0.86em; overflow: hidden; white-space: nowrap; text-align: left; }
.skey:hover { background: var(--fill); }
.sbody { padding-left: 6px; }
.others-head { margin: 14px 2px 4px; padding-top: 8px; border-top: 1px solid var(--separator); }
.orow { width: 100%; color: var(--text-2); }
.orow .schev { transform: none; }
.tool-btn { gap: 4px; flex: 0 0 auto; }
.tool-btn.active, .icon-btn.active { color: var(--accent); background: var(--accent-soft); }
.icon-btn { width: calc(26px * var(--zoom)); padding: 0; justify-content: center; font-weight: 700; flex: 0 0 auto; }
.nbadge { background: var(--accent); color: var(--on-accent); border-radius: 999px; font-size: 10px; min-width: 15px; height: 15px; display: inline-grid; place-items: center; padding: 0 4px; }
.drawer { background: var(--group); border-radius: var(--radius-group); padding: 4px 8px 6px; margin-top: 6px; }
.situation.flash { animation: flash 1.6s ease-out; border-radius: var(--radius-group); }
@keyframes flash { 0%, 30% { box-shadow: 0 0 0 2px var(--accent); } 100% { box-shadow: 0 0 0 0 transparent; } }
.vars { background: var(--group); border-radius: var(--radius-group); padding: 4px 10px; margin-bottom: 8px; }
.vars summary { cursor: pointer; padding: 2px 0; }
.var { display: flex; align-items: center; gap: 6px; padding: 2px 4px; margin: 0 -4px; border-radius: 6px; }
.var.linked, .known.linked { cursor: help; }
.var.linked:hover, .known.linked:hover { background: var(--accent-soft); }
.crow { display: grid; grid-template-columns: auto minmax(5em, 1fr) minmax(0, auto) auto auto auto; align-items: center; gap: 2px 8px; padding: 4px 8px; border-radius: 8px; cursor: pointer; outline: none; background: var(--group); margin-bottom: 3px; }
.crow:hover { background: var(--fill); }
.crow.cur, .crow:focus-visible, .card.cur:focus-visible { box-shadow: 0 0 0 2px var(--accent); }
.crow.focus { box-shadow: 0 0 0 2px var(--accent); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--fill-strong); }
.dot.ok { background: var(--success); }
.dot.warn { background: var(--warning); }
.dot.bad { background: var(--danger); }
.ctitle { font-size: var(--type-small); font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctex { font-size: 0.82em; max-width: 13em; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--text-2); }
.cvals { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.2; white-space: nowrap; }
.cerr { white-space: nowrap; color: var(--text-2); }
.cerr.bad { color: var(--danger); }
.star { border: 0; background: none; cursor: pointer; color: var(--text-3, var(--text-2)); font-size: 1em; padding: 0 2px; line-height: 1; }
.star.on { color: var(--warning); }
@container (max-width: 380px) { .ctex { display: none; } .crow { grid-template-columns: auto minmax(5em, 1fr) auto auto auto; } }
.card { background: var(--group); border-radius: var(--radius-group); padding: 8px 10px; margin-bottom: 8px; border-left: 3px solid transparent; outline: none; }
.card.ok { border-left-color: var(--success); }
.card.warn { border-left-color: var(--warning); }
.card.bad { border-left-color: var(--danger); }
.card-head { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; }
.card-title { flex: 1 1 9em; min-width: 0; font-weight: 600; font-size: var(--type-small); overflow-wrap: anywhere; hyphens: auto; }
.card-head .badge, .card-head .detail-btn { flex: 0 0 auto; }
.detail-btn { height: calc(22px * var(--zoom)); padding: 0 6px; margin-right: -4px; color: var(--accent); }
.card.focus { box-shadow: 0 0 0 2px var(--accent); transition: box-shadow 300ms ease; }
.knowns { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; margin: 2px 0 2px; }
.known { white-space: nowrap; border-radius: 6px; padding: 0 2px; }
.level { background: var(--fill); color: var(--text-2); font-weight: 600; flex: 0 0 auto; }
.steps-toggle { border: 0; background: none; color: var(--accent); cursor: pointer; padding: 0; margin: 0 0 4px; }
.steps { display: grid; grid-template-columns: minmax(0, auto) minmax(6em, 1fr); gap: 2px 10px; align-items: center; background: var(--fill); border-radius: 8px; padding: 6px 8px; margin: 2px 0 6px; overflow-x: auto; }
.step-eq { white-space: nowrap; }
.step-note { line-height: 1.35; }
.above { display: block; width: 100%; border: 1px dashed var(--separator); background: none; border-radius: var(--radius-group); color: var(--text-2); padding: 6px 10px; cursor: pointer; text-align: left; margin-bottom: 8px; }
.above:hover { color: var(--accent); border-color: var(--accent); }
.subst { color: var(--text-2); font-size: 0.95em; line-height: 1.9; padding: 2px 0 4px; text-align: center; overflow-x: auto; overflow-y: hidden; }
.compare { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 4px 0; }
.compare .mono { text-align: right; }
.conds { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.conds .badge { height: auto; min-height: 20px; white-space: normal; padding: 2px 7px; }
.reason { margin-top: 4px; color: var(--text-2); }
.na { background: var(--group); border-radius: var(--radius-group); padding: 6px 10px; opacity: 0.8; }
.na-item { padding: 3px 0; }
.na-toggle { margin: 4px 2px; }
.list { container-type: inline-size; }
</style>
