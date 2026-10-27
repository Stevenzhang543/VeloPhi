<script setup lang="ts">
/**
 * Learning handbook (manual 26.51, D46), a section of the settings page: the topics with their principles, and every
 * library formula with its symbolic form, knowledge-level tags, conditions, symbol table (taken from its example),
 * derivation and an example that opens in the studio. Filtered by the chosen knowledge level (all levels on
 * request) and searchable; a formula card's "Handbook" button opens the entry here.
 */
import { tl } from '../../i18n'
import { computed, nextTick, ref, watch } from 'vue'
import { locale } from '../../i18n/locale'
import type { Tri } from '../../i18n/tri'
import { TOPICS, topicOf } from '../../handbook/topics'
import { CONCEPTS } from '../../handbook/concepts'
import type { Concept } from '../../handbook/concepts'
import { openLab, openTemplate } from '../learn/actions'
import { labInfo } from '../lab/catalog'
import type { FormulaDef } from '../../formula/library'
import { FORMULAS } from '../../formula/library'
import { LEVEL_CHOICES, levelOrdinal, levelTag, withinLevel } from '../../formula/levels'
import { getDerivation, getShared } from '../../formula/derivations'
import type { DerivationStep } from '../../formula/derivations/types'
import { parse, variables } from '../../formula/expr'
import { effectiveCurriculum, fmtQ, settings } from '../settings'
import { state } from '../store'
import type { ExampleDetail } from '../handbook'
import { exampleDetail, exampleOf, openExample } from '../handbook'
import { templateById } from '../../templates'
import Tex from './Tex.vue'
import Icon from './Icon.vue'

const query = ref('')
const topic = ref('all')
const allLevels = ref(false)
const expanded = ref(new Set<string>())
const details = ref(new Map<string, ExampleDetail | null>())

const T = (t: Tri) => t[locale.lang] ?? t.zh
const cur = computed(() => effectiveCurriculum())
const levelName = computed(() => tl(LEVEL_CHOICES[cur.value].find(c => c.ord === settings.knowledge.level)?.name ?? ''))

/** Search: title, symbolic form, id and topic name, ignoring case and spaces. */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
function matches(f: FormulaDef, topicTitle: string): boolean {
  const q = norm(query.value)
  if (!q) return true
  return [f.title, f.latex, f.id, topicTitle, f.note ?? ''].some(s => norm(s).includes(q))
}

/** 26.55: concept pages (no formulas) — shown with all topics, on their own chip, or when the search matches. */
const conceptPages = computed<Concept[]>(() => {
  const q = norm(query.value)
  if (q) return CONCEPTS.filter(c => [T(c.title), ...c.sections.flatMap(s => [T(s.heading), ...s.paragraphs.map(T)])].some(x => norm(x).includes(q)))
  if (topic.value === 'all') return CONCEPTS
  return CONCEPTS.filter(c => `concept:${c.id}` === topic.value)
})
/** What a concept page links to: a template or an experiment (`lab:<id>`). */
function seeName(ref: string): string { return ref.startsWith('lab:') ? labInfo(ref.slice(4))?.title ?? ref : templateById(ref)?.name ?? ref }
function openSee(ref: string) { if (ref.startsWith('lab:')) openLab(ref.slice(4)); else void openTemplate(ref) }

const sections = computed(() => {
  const searching = query.value.trim() !== ''
  const list = TOPICS.filter(t => searching || topic.value === 'all' || t.id === topic.value)
  return list.map(t => {
    // Lower levels first (library order within a level), so a topic reads from the basics up
    const all = FORMULAS.filter(f => topicOf(f.id) === t.id && matches(f, T(t.title)))
      .map((f, i) => ({ f, i, o: levelOrdinal(f.id, cur.value) })).sort((a, b) => a.o - b.o || a.i - b.i).map(x => x.f)
    const shown = all.filter(f => allLevels.value || withinLevel(f.id, cur.value, settings.knowledge.level))
    return { topic: t, formulas: shown, hidden: all.length - shown.length }
  }).filter(s => !searching || s.formulas.length + s.hidden > 0)
})
const total = computed(() => sections.value.reduce((n, s) => n + s.formulas.length, 0))
const hiddenTotal = computed(() => sections.value.reduce((n, s) => n + s.hidden, 0))

function toggle(id: string) {
  const s = new Set(expanded.value)
  if (s.has(id)) s.delete(id)
  else {
    s.add(id)
    if (!details.value.has(id)) {
      let d: ExampleDetail | null = null
      try { d = exampleDetail(id) } catch { d = null }
      const m = new Map(details.value); m.set(id, d); details.value = m
    }
  }
  expanded.value = s
}

/** Steps of a formula's derivation: the shared ones it uses, then its own. */
function steps(id: string): DerivationStep[] {
  const d = getDerivation(id)
  if (!d) return []
  return [...(d.uses ?? []).flatMap(u => getShared(u)?.steps ?? []), ...d.steps]
}

/** Symbol table of a formula: the situation variables its expression uses, from its example. */
function symbols(f: FormulaDef) {
  const d = details.value.get(f.id)
  if (!d) return []
  let names: string[] = []
  try { names = [...variables(parse(f.expr))] } catch { names = [] }
  return names.map(n => ({ name: n, v: d.sample.vars[n] })).filter(x => x.v)
}
function conditions(f: FormulaDef) {
  const d = details.value.get(f.id)
  const ids = [...(f.approxOf ? [f.approxOf] : []), ...(f.requires ?? [])]
  return ids.map(id => d?.sample.conditions.find(c => c.id === id)?.label ?? id)
}
const exampleName = (id: string) => { const ex = exampleOf(id); const t = ex ? templateById(ex.template) : null; return t ? t.name : '' }

// A formula card asked for an entry: show its topic, all levels if needed, open it and scroll to it
watch(() => state.handbookFocus, async id => {
  if (!id) return
  state.handbookFocus = null
  query.value = ''
  topic.value = topicOf(id)
  if (!withinLevel(id, cur.value, settings.knowledge.level)) allLevels.value = true
  if (!expanded.value.has(id)) toggle(id)
  await nextTick()
  document.getElementById(`hb-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}, { immediate: true })
// 26.55 (D96): the learning path or the global search asked for a topic or a concept page
watch(() => state.handbookTopic, async id => {
  if (!id) return
  state.handbookTopic = null
  query.value = ''
  topic.value = id
  await nextTick()
  document.querySelector('.handbook')?.scrollIntoView({ block: 'start' })
}, { immediate: true })
</script>

<template>
  <div class="handbook">
    <div class="hb-bar">
      <input v-model="query" class="field search" type="search" :placeholder="tl('搜索公式、符号或主题…')" :aria-label="tl('搜索手册')" />
      <label class="check small" :title="tl('设置 › 知识与公式 中选择的水平')">
        <input v-model="allLevels" type="checkbox" />{{ tl('显示全部级别') }}<span v-if="!allLevels" class="muted">{{ tl('（当前：{0}）', [levelName]) }}</span>
      </label>
    </div>
    <div class="chips" role="tablist">
      <button class="chip" :class="{ on: topic === 'all' }" role="tab" :aria-selected="topic === 'all'" @click="topic = 'all'">{{ tl('全部主题') }}</button>
      <button v-for="t in TOPICS" :key="t.id" class="chip" :class="{ on: topic === t.id }" role="tab" :aria-selected="topic === t.id" @click="topic = t.id; query = ''">
        <Icon :name="t.icon" :size="13" />{{ T(t.title) }}
      </button>
      <span class="chip-sep tiny muted">{{ tl('概念页') }}</span>
      <button v-for="c in CONCEPTS" :key="c.id" class="chip concept" :class="{ on: topic === `concept:${c.id}` }" role="tab" :aria-selected="topic === `concept:${c.id}`" @click="topic = `concept:${c.id}`; query = ''">
        <Icon :name="c.icon" :size="13" />{{ T(c.title) }}
      </button>
    </div>
    <p v-if="total === 0 && !conceptPages.length" class="small muted empty">{{ hiddenTotal ? tl('没有符合当前知识水平的条目；勾选“显示全部级别”查看其余 {0} 条。', [hiddenTotal]) : tl('没有找到匹配的条目。') }}</p>

    <section v-for="s in sections" :key="s.topic.id" class="topic">
      <h3><Icon :name="s.topic.icon" :size="16" />{{ T(s.topic.title) }}<span class="tiny muted">{{ tl('{0} 条公式', [s.formulas.length]) }}</span></h3>
      <div v-if="!query.trim()" class="principle">
        <p v-for="(para, i) in s.topic.principle" :key="i">{{ T(para) }}</p>
        <div class="laws"><Tex v-for="l in s.topic.laws" :key="l" :tex="l" /></div>
      </div>
      <article v-for="f in s.formulas" :id="`hb-${f.id}`" :key="f.id" class="entry" :class="{ open: expanded.has(f.id) }">
        <button class="entry-head" :aria-expanded="expanded.has(f.id)" @click="toggle(f.id)">
          <span class="title">{{ f.title }}</span>
          <span class="badge level">{{ tl(levelTag(f.id, 'cn')) }}</span>
          <span class="badge level">{{ tl(levelTag(f.id, 'ib')) }}</span>
          <span v-if="f.kind === 'approx'" class="badge warn">{{ tl('近似') }}</span>
          <Icon name="chevron" :size="14" class="chev" />
        </button>
        <Tex :tex="f.latex" display />
        <p v-if="f.note || f.method" class="small muted note"><template v-if="f.method">{{ f.method }}<template v-if="f.note"> · </template></template>{{ f.note }}</p>
        <div v-if="expanded.has(f.id)" class="more">
          <div v-if="conditions(f).length" class="block">
            <div class="label">{{ tl('适用条件') }}</div>
            <ul class="conds small"><li v-for="c in conditions(f)" :key="c">{{ c }}</li></ul>
          </div>
          <div v-if="symbols(f).length" class="block">
            <div class="label">{{ tl('符号') }}<span class="tiny muted">{{ tl('（取值来自示例）') }}</span></div>
            <div class="symbols small">
              <template v-for="x in symbols(f)" :key="x.name">
                <Tex :tex="x.v!.symbol" /><span>{{ x.v!.label }}</span><span class="mono">{{ fmtQ(x.v!.value, x.v!.unit) }}</span>
              </template>
            </div>
          </div>
          <div v-if="steps(f.id).length" class="block">
            <div class="label">{{ tl('推导') }}</div>
            <ol class="steps">
              <li v-for="(st, i) in steps(f.id)" :key="i">
                <Tex :tex="st.latex" display />
                <div class="small">{{ T(st.text) }}</div>
                <div v-if="st.basis" class="tiny muted">{{ tl('依据：{0}', [T(st.basis)]) }}</div>
              </li>
            </ol>
          </div>
          <div v-if="exampleOf(f.id)" class="block example">
            <span class="small">{{ tl('示例：{0}', [exampleName(f.id)]) }}</span>
            <button class="btn small" @click="openExample(f.id)"><Icon name="play" :size="13" />{{ tl('打开示例') }}</button>
          </div>
        </div>
      </article>
      <button v-if="s.hidden && !allLevels" class="link small hidden-note" @click="allLevels = true">{{ tl('还有 {0} 条超出所选知识水平的公式，点此显示', [s.hidden]) }}</button>
    </section>

    <!-- 26.55: concept pages (roadmap group E: explained, not simulated) -->
    <section v-for="c in conceptPages" :key="c.id" class="topic concept-page">
      <h3><Icon :name="c.icon" :size="16" />{{ T(c.title) }}<span class="badge level">{{ tl('概念页') }}</span></h3>
      <div v-for="(sec, i) in c.sections" :key="i" class="principle">
        <div class="label">{{ T(sec.heading) }}</div>
        <p v-for="(para, j) in sec.paragraphs" :key="j">{{ T(para) }}</p>
        <div v-if="sec.laws?.length" class="laws"><Tex v-for="l in sec.laws" :key="l" :tex="l" /></div>
      </div>
      <div v-if="c.see.length" class="see small">
        <span class="muted">{{ tl('动手试一试：') }}</span>
        <button v-for="r in c.see" :key="r" class="btn small ghost" @click="openSee(r)"><Icon :name="r.startsWith('lab:') ? 'flask' : 'template'" :size="13" />{{ seeName(r) }}</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.handbook { display: flex; flex-direction: column; gap: 10px; }
.hb-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.search { flex: 1 1 240px; min-width: 0; }
.check { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { display: inline-flex; align-items: center; gap: 5px; border: 0; background: var(--fill); color: var(--text-2); border-radius: 999px; padding: 4px 10px; cursor: pointer; font-size: var(--type-small); }
.chip:hover { background: var(--fill-strong); }
.chip.on { background: var(--accent); color: var(--on-accent); }
.empty { margin: 8px 2px; }
.topic { margin-top: 6px; }
h3 { display: flex; align-items: center; gap: 8px; margin: 10px 2px 6px; font-size: var(--type-title); }
h3 .tiny { font-weight: 400; }
.principle { background: var(--group); border-radius: 12px; padding: 8px 14px 10px; margin-bottom: 8px; line-height: 1.6; }
.principle p { margin: 6px 0; }
.laws { display: flex; flex-wrap: wrap; gap: 6px 20px; padding-top: 4px; border-top: 1px solid var(--separator); margin-top: 6px; }
.entry { background: var(--group); border-radius: 12px; padding: 6px 14px 8px; margin-bottom: 8px; scroll-margin-top: 12px; }
.entry.open { box-shadow: inset 0 0 0 1.5px var(--accent-soft); }
.entry-head { display: flex; align-items: center; gap: 6px; width: 100%; border: 0; background: none; padding: 4px 0; cursor: pointer; text-align: left; color: var(--text); }
.entry-head .title { flex: 1; min-width: 0; font-weight: 600; }
.badge.level { background: var(--fill); color: var(--text-2); }
.chev { transition: transform 150ms ease; color: var(--text-3); }
.entry.open .chev { transform: rotate(180deg); }
.note { margin: 2px 0 4px; }
.more { border-top: 1px solid var(--separator); margin-top: 4px; padding-top: 6px; }
.block { margin: 6px 0 8px; }
.label { font-weight: 600; font-size: var(--type-small); margin-bottom: 4px; display: flex; gap: 6px; align-items: baseline; }
.conds { margin: 0; padding-left: 18px; line-height: 1.5; }
.symbols { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 3px 12px; align-items: baseline; }
.steps { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
.steps li { line-height: 1.5; }
.steps :deep(.katex-display) { text-align: left; margin: 2px 0; }
.steps :deep(.katex-display > .katex) { text-align: left; }
.entry > :deep(.katex-display) { margin: 4px 0; }
.example { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: var(--fill); border-radius: 8px; padding: 6px 10px; }
.link { border: 0; background: none; color: var(--accent); cursor: pointer; padding: 2px; }
.hidden-note { margin: 0 2px 8px; }
.chip-sep { align-self: center; margin: 0 2px 0 8px; }
.chip.concept:not(.on) { background: transparent; box-shadow: inset 0 0 0 1px var(--separator); }
.see { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 2px 2px 10px; }
</style>
