<script setup lang="ts">
/**
 * Curriculum map (26.62, D222): the 283 topics of the curriculum blueprint from lower secondary to university, the
 * 310 components, the 21 required experiments of the Chinese 2022 standard, the official syllabus chapters and the
 * 30 acceptance cases — each mapped to what the app opens (model families, templates, labs, activities, classroom
 * experiments, handbook pages, workflows) and labelled honestly: simulated, model, concept or real-lab companion.
 * The course tags are the blueprint's candidate mappings, not a certification (sheet 说明与使用规则).
 *
 * Mounted by App.vue while `state.showCurriculum` is true; `state.curriculumTopic` picks a topic. The data is loaded
 * on demand (src/curriculum/index.ts).
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { foldSearch } from '../searchText'
import { dialogKeys } from '../focusTrap'
import { tl, activeLang } from '../../i18n'
import { state } from '../store'
import Icon from './Icon.vue'
import { COVERAGE_TEXT, MODES, REASONS, STATE_TEXT, SYSTEMS, WHERE, inCourse, loadCurriculum } from '../../curriculum'
import type { Component as Comp, Coverage, Curriculum, Experiment, SystemId, Topic, ComponentState } from '../../curriculum'
import { chapterCodes, chapterMatches, MAPPABLE, SUPPLEMENT } from '../../curriculum/syllabus'
import { ACCEPTANCE } from '../../curriculum/acceptance'
import { describe, expand, KIND_LABEL } from '../curriculum'
import type { Described } from '../curriculum'
import type { Resource } from '../../curriculum/types'

type Tab = 'topics' | 'components' | 'junior' | 'syllabus' | 'acceptance' | 'about'
const TABS: Array<[Tab, string]> = [['topics', '知识点'], ['components', '组件'], ['junior', '初中必做实验'], ['syllabus', '课程章节'], ['acceptance', '验收'], ['about', '来源与规则']]

const cur = ref<Curriculum | null>(null)
const failed = ref(false)
const tab = ref<Tab>('topics')
const lang = computed(() => activeLang())
const tr = (s: string) => cur.value?.tr(s, lang.value) ?? s
const T3 = (t: { zh: string; en: string; de: string }) => t[lang.value] ?? t.zh

// ---- topics ----
const q = ref('')
const system = ref<'' | SystemId>('')
const level = ref('')
const domain = ref('')
const coverage = ref<'' | Coverage>('')
const topicId = ref<string | null>(state.curriculumTopic)
// 26.63 (D239): the app's one search folding (full-width forms, dashes, case, spaces)
const norm = foldSearch
const topics = computed<Topic[]>(() => {
  const c = cur.value
  if (!c) return []
  const w = norm(q.value)
  return c.topicsOf(system.value || null).filter(t =>
    (!level.value || t.level === level.value) && (!domain.value || t.domain === domain.value) && (!coverage.value || t.coverage === coverage.value) &&
    (!w || norm(`${t.id} ${t.name} ${tr(t.name)} ${t.scene} ${tr(t.scene)} ${t.equation} ${t.solver}`).includes(w)))
})
const levels = computed(() => [...new Set(cur.value?.topics.map(t => t.level) ?? [])])
const summary = computed(() => cur.value?.summary(topics.value) ?? { simulated: 0, model: 0, concept: 0, real: 0 })
const topic = computed(() => cur.value?.topic(topicId.value ?? '') ?? topics.value[0] ?? null)
watch(() => state.curriculumTopic, id => { if (id) { tab.value = 'topics'; topicId.value = id } })

function described(list: Resource[]): Described[] { return list.map(describe).filter((d): d is Described => !!d) }
const topicOwn = computed(() => described(topic.value?.resources ?? []))
const topicMore = computed(() => {
  const own = topic.value?.resources ?? []
  return described(expand(own).slice(own.length))
})
function open(d: Described) { void d.open(); state.showCurriculum = false }

// ---- components ----
const cq = ref('')
const category = ref('')
const cstate = ref<'' | ComponentState>('')
const compId = ref<string | null>(null)
const categories = computed(() => [...new Set(cur.value?.components.map(c => c.category) ?? [])])
const comps = computed<Comp[]>(() => {
  const c = cur.value
  if (!c) return []
  const w = norm(cq.value)
  return c.components.filter(x => (!category.value || x.category === category.value) && (!cstate.value || x.state === cstate.value) && (!w || norm(`${x.id} ${x.name} ${tr(x.name)} ${x.inputs}`).includes(w)))
})
const comp = computed(() => cur.value?.component(compId.value ?? '') ?? comps.value[0] ?? null)
const csum = computed(() => cur.value?.componentSummary() ?? { done: 0, partial: 0, model: 0, planned: 0 })
function showComponent(id: string) { compId.value = id; tab.value = 'components' }
function showTopic(id: string) { topicId.value = id; tab.value = 'topics' }

// ---- experiments ----
const expCode = ref<string | null>(null)
const exp = computed<Experiment | null>(() => cur.value?.experiments.find(e => e.code === expCode.value) ?? cur.value?.experiments[0] ?? null)

// ---- syllabus ----
const sysSel = ref<SystemId>('cnJunior')
const chapters = computed(() => cur.value?.chapters(sysSel.value) ?? [])
function chapterTopics(code: string): Topic[] {
  const c = cur.value
  if (!c || !MAPPABLE[sysSel.value]) return []
  return c.topics.filter(t => inCourse(t.courses[sysSel.value]) && chapterMatches(sysSel.value, code, chapterCodes(sysSel.value, t.courses[sysSel.value])))
}
/** VeloPhi's additions for chapters the candidate mapping does not reach. */
function chapterExtra(code: string): Topic[] {
  const c = cur.value
  return c ? (SUPPLEMENT[`${sysSel.value}:${code}`] ?? []).map(id => c.topic(id)).filter((t): t is Topic => !!t) : []
}

const COV_CLASS: Record<Coverage, string> = { simulated: 'ok', model: 'model', concept: 'concept', real: 'real' }
const STATE_CLASS: Record<ComponentState, string> = { done: 'ok', partial: 'model', model: 'concept', planned: 'off' }

const root = ref<HTMLElement | null>(null)
function close() { state.showCurriculum = false; state.curriculumTopic = null }
onMounted(async () => {
  root.value?.focus()
  try { cur.value = await loadCurriculum() } catch { failed.value = true }
  // bring the topic asked for (from the model catalogue or search) into view
  await nextTick()
  if (topicId.value) document.getElementById(`cur-${topicId.value}`)?.scrollIntoView({ block: 'center' })
})
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="close">
    <div ref="root" class="dialog curriculum" role="dialog" aria-modal="true" tabindex="-1" :aria-label="tl('课程对照')" @keydown="dialogKeys($event, root, close)">
      <div class="dialog-header">
        <Icon name="graduation" :size="18" />{{ tl('课程对照') }}
        <span class="tiny muted sum">{{ tl('初版候选映射，不是课程机构认证') }}</span>
        <span class="spacer" />
        <button class="btn icon ghost" :title="tl('关闭')" @click="close"><Icon name="close" /></button>
      </div>
      <div class="tabs" role="tablist">
        <button v-for="[id, label] in TABS" :key="id" role="tab" :aria-selected="tab === id" :class="{ on: tab === id }" @click="tab = id">{{ tl(label) }}</button>
      </div>
      <div v-if="failed" class="dialog-body"><p class="small">{{ tl('课程数据没有加载成功。') }}</p></div>
      <div v-else-if="!cur" class="dialog-body"><p class="small muted">{{ tl('正在加载…') }}</p></div>

      <!-- topics -->
      <div v-else-if="tab === 'topics'" class="dialog-body body">
        <aside>
          <input v-model="q" class="search" type="search" :placeholder="tl('搜索编号、名称、方程…')" :aria-label="tl('搜索知识点')" />
          <div class="filters">
            <select v-model="system" :aria-label="tl('课程体系')"><option value="">{{ tl('全部课程体系') }}</option><option v-for="s in SYSTEMS" :key="s.id" :value="s.id">{{ T3(s.label) }}</option></select>
            <select v-model="level" :aria-label="tl('学段')"><option value="">{{ tl('全部学段') }}</option><option v-for="l in levels" :key="l" :value="l">{{ tr(l) }}</option></select>
            <select v-model="domain" :aria-label="tl('领域')"><option value="">{{ tl('全部领域') }}</option><option v-for="d in cur.domains()" :key="d" :value="d">{{ tr(d) }}</option></select>
            <select v-model="coverage" :aria-label="tl('覆盖方式')"><option value="">{{ tl('全部覆盖方式') }}</option><option v-for="(t, k) in COVERAGE_TEXT" :key="k" :value="k">{{ T3(t) }}</option></select>
          </div>
          <div class="tiny muted">{{ tl('{0} 个知识点：可仿真 {1} · 模型 {2} · 概念 {3} · 实物配套 {4}', [topics.length, summary.simulated, summary.model, summary.concept, summary.real]) }}</div>
          <div class="list" role="listbox" :aria-label="tl('知识点')">
            <button v-for="t in topics" :id="`cur-${t.id}`" :key="t.id" class="row" :class="{ on: topic && t.id === topic.id }" role="option" :aria-selected="!!topic && t.id === topic.id" @click="topicId = t.id">
              <span class="mono id">{{ t.id }}</span><span class="name">{{ tr(t.name) }}</span><span class="tiny cov" :class="COV_CLASS[t.coverage]">{{ T3(COVERAGE_TEXT[t.coverage]) }}</span>
            </button>
            <p v-if="!topics.length" class="small muted">{{ tl('没有符合条件的知识点。') }}</p>
          </div>
        </aside>
        <section v-if="topic" class="view">
          <h3><span class="mono">{{ topic.id }}</span> {{ tr(topic.name) }}</h3>
          <p v-if="lang !== 'zh'" class="tiny muted">{{ topic.name }}</p>
          <div class="facts small">
            <span>{{ tr(topic.domain) }}</span><span>{{ tr(topic.level) }}</span><span>{{ topic.mode }} · {{ MODES[topic.mode] ? T3(MODES[topic.mode]) : '' }}</span><span>{{ tl('难度 {0}/5', [topic.difficulty]) }}</span><span>{{ topic.priority }}</span>
          </div>
          <p class="cover small"><span class="cov" :class="COV_CLASS[topic.coverage]">{{ T3(COVERAGE_TEXT[topic.coverage]) }}</span>
            <template v-if="topic.coverage === 'real'">{{ tl('软件给出虚拟读数与数据处理，不代替实物操作与仪器校准。') }}</template>
            <template v-else-if="topic.coverage === 'concept'">{{ tl('这一项以讲解、模型卡片或教学流程呈现，不是定量仿真。') }}</template>
            <template v-else-if="topic.coverage === 'model'">{{ tl('由经过独立参考值核验的模型族计算（条件、分支与适用域都会显示）。') }}</template>
            <template v-else>{{ tl('有可运行的场景或实验；数值与公式卡片、模型族相互核对。') }}</template>
          </p>
          <h4>{{ tl('在 VeloPhi 中打开') }}</h4>
          <div class="res">
            <button v-for="d in topicOwn" :key="d.kind + d.id" class="btn small" @click="open(d)"><Icon :name="d.icon" :size="14" /><span class="tiny muted">{{ tl(KIND_LABEL[d.kind]) }}</span> {{ d.title }}</button>
          </div>
          <template v-if="topicMore.length">
            <h4>{{ tl('相关') }}</h4>
            <div class="res"><button v-for="d in topicMore" :key="d.kind + d.id" class="btn small ghost" @click="open(d)"><Icon :name="d.icon" :size="14" /><span class="tiny muted">{{ tl(KIND_LABEL[d.kind]) }}</span> {{ d.title }}</button></div>
          </template>
          <h4>{{ tl('蓝图内容') }}</h4>
          <dl class="small">
            <dt>{{ tl('核心方程/数学模型') }}</dt><dd>{{ topic.equation }}</dd>
            <dt>{{ tl('求解器/理论') }}</dt><dd class="mono">{{ topic.solver }}</dd>
            <dt>{{ tl('实验/演示场景') }}</dt><dd>{{ tr(topic.scene) }} <span class="tiny muted mono">{{ topic.sceneId }}</span></dd>
            <dt>{{ tl('最低验收条件') }}</dt><dd>{{ tr(topic.accept) }}</dd>
            <dt>{{ tl('模型/教学边界') }}</dt><dd>{{ tr(topic.bound) }}</dd>
          </dl>
          <h4>{{ tl('课程映射（候选）') }}</h4>
          <table class="small courses"><tbody>
            <tr v-for="s in SYSTEMS" :key="s.id" :class="{ off: !inCourse(topic.courses[s.id]) }"><th>{{ T3(s.label) }}</th><td>{{ tr(topic.courses[s.id]) }}</td></tr>
          </tbody></table>
          <h4>{{ tl('组件依赖') }}</h4>
          <div class="res">
            <button v-for="d in topic.deps" :key="d" class="chip" @click="showComponent(d)"><span class="mono">{{ d }}</span> {{ tr(cur.component(d)?.name ?? '') }}</button>
          </div>
          <p class="tiny muted src">{{ tl('来源') }}: <a :href="topic.url" target="_blank" rel="noopener">{{ topic.url }}</a></p>
        </section>
      </div>

      <!-- components -->
      <div v-else-if="tab === 'components'" class="dialog-body body">
        <aside>
          <input v-model="cq" class="search" type="search" :placeholder="tl('搜索组件…')" :aria-label="tl('搜索组件')" />
          <div class="filters">
            <select v-model="category" :aria-label="tl('类别')"><option value="">{{ tl('全部类别') }}</option><option v-for="c in categories" :key="c" :value="c">{{ tr(c) }}</option></select>
            <select v-model="cstate" :aria-label="tl('状态')"><option value="">{{ tl('全部状态') }}</option><option v-for="(t, k) in STATE_TEXT" :key="k" :value="k">{{ T3(t) }}</option></select>
          </div>
          <div class="tiny muted">{{ tl('{0} 个组件：已实现 {1} · 部分 {2} · 仅模型 {3} · 未实现 {4}', [cur.components.length, csum.done, csum.partial, csum.model, csum.planned]) }}</div>
          <div class="list" role="listbox" :aria-label="tl('组件')">
            <button v-for="c in comps" :key="c.id" class="row" :class="{ on: comp && c.id === comp.id }" role="option" :aria-selected="!!comp && c.id === comp.id" @click="compId = c.id">
              <span class="mono id wide">{{ c.id }}</span><span class="name">{{ tr(c.name) }}</span><span class="tiny cov" :class="STATE_CLASS[c.state]">{{ T3(STATE_TEXT[c.state]) }}</span>
            </button>
          </div>
        </aside>
        <section v-if="comp" class="view">
          <h3><span class="mono">{{ comp.id }}</span> {{ tr(comp.name) }}</h3>
          <div class="facts small"><span>{{ tr(comp.layer) }}</span><span>{{ tr(comp.category) }}</span><span>{{ comp.stage }}</span><span v-if="comp.first">{{ tl('首版必须') }}</span></div>
          <p class="cover small"><span class="cov" :class="STATE_CLASS[comp.state]">{{ T3(STATE_TEXT[comp.state]) }}</span><template v-if="comp.note">{{ T3(comp.note) }}</template></p>
          <ul class="small plain">
            <li v-for="w in comp.where" :key="w">{{ T3(WHERE[w]) }}</li>
            <li v-for="r in comp.reasons" :key="r" class="muted">{{ T3(REASONS[r]) }}</li>
          </ul>
          <div class="res"><button v-for="d in described(comp.resources)" :key="d.kind + d.id" class="btn small" @click="open(d)"><Icon :name="d.icon" :size="14" /><span class="tiny muted">{{ tl(KIND_LABEL[d.kind]) }}</span> {{ d.title }}</button></div>
          <dl class="small">
            <dt>{{ tl('输入参数/接口') }}</dt><dd>{{ comp.inputs }}</dd>
            <dt>{{ tl('最低验证要求') }}</dt><dd>{{ comp.verify }}</dd>
          </dl>
          <template v-if="comp.usedBy.length">
            <h4>{{ tl('用到它的知识点（{0}）', [comp.usedBy.length]) }}</h4>
            <div class="res"><button v-for="id in comp.usedBy" :key="id" class="chip" @click="showTopic(id)"><span class="mono">{{ id }}</span> {{ tr(cur.topic(id)?.name ?? '') }}</button></div>
          </template>
        </section>
      </div>

      <!-- the 21 required experiments -->
      <div v-else-if="tab === 'junior'" class="dialog-body body">
        <aside>
          <div class="tiny muted">{{ tl('中国义务教育物理课程标准（2022）的 9 项测量类与 12 项探究类学生必做实验') }}</div>
          <div class="list" role="listbox" :aria-label="tl('必做实验')">
            <button v-for="e in cur.experiments" :key="e.code" class="row" :class="{ on: exp && e.code === exp.code }" role="option" :aria-selected="!!exp && e.code === exp.code" @click="expCode = e.code">
              <span class="mono id wide">{{ e.code }}</span><span class="name">{{ tr(e.name) }}</span><span class="tiny cov" :class="COV_CLASS[e.coverage]">{{ T3(COVERAGE_TEXT[e.coverage]) }}</span>
            </button>
          </div>
        </aside>
        <section v-if="exp" class="view">
          <h3><span class="mono">{{ exp.code }}</span> {{ tr(exp.name) }}</h3>
          <p class="cover small"><span class="cov real">{{ tl('课标必做') }}</span>{{ tl('模拟为辅助，不代替实物操作。') }}</p>
          <div class="res"><button v-for="d in described(exp.resources)" :key="d.kind + d.id" class="btn small" @click="open(d)"><Icon :name="d.icon" :size="14" /><span class="tiny muted">{{ tl(KIND_LABEL[d.kind]) }}</span> {{ d.title }}</button></div>
          <dl class="small">
            <dt>{{ tl('类别') }}</dt><dd>{{ tr(exp.category) }}</dd>
            <dt>{{ tl('仪器/模拟组件') }}</dt><dd>{{ exp.apparatus }}</dd>
            <dt>{{ tl('核心关系') }}</dt><dd>{{ exp.relation }}</dd>
            <dt>{{ tl('虚拟实验内容') }}</dt><dd>{{ tr(exp.virtual) }}</dd>
            <dt>{{ tl('操作或模型局限') }}</dt><dd>{{ tr(exp.limitation) }}</dd>
          </dl>
          <p class="tiny muted src">{{ tl('来源') }}: <a :href="exp.url" target="_blank" rel="noopener">{{ exp.url }}</a></p>
        </section>
      </div>

      <!-- syllabus chapters -->
      <div v-else-if="tab === 'syllabus'" class="dialog-body one">
        <div class="filters row-f">
          <select v-model="sysSel" :aria-label="tl('课程体系')"><option v-for="s in SYSTEMS" :key="s.id" :value="s.id">{{ T3(s.label) }}</option></select>
          <span v-if="!MAPPABLE[sysSel]" class="tiny muted">{{ sysSel === 'myp' ? tl('IB MYP 只有评估维度，没有统一的物理章节：按知识点的概念标签筛选。') : tl('大学部分是代表性目录，按知识点的“大学课程参考”筛选。') }}</span>
        </div>
        <table class="small chapters">
          <thead><tr><th>{{ tl('章节代码') }}</th><th>{{ tl('章节/主题') }}</th><th>{{ tl('适用深度') }}</th><th>{{ tl('知识点') }}</th></tr></thead>
          <tbody>
            <tr v-for="c in chapters" :key="c[1]">
              <td class="mono">{{ c[1] }}</td><td>{{ tr(c[2]) }}<div class="tiny muted">{{ tr(c[5]) }}</div></td><td>{{ tr(c[3]) }}</td>
              <td><button v-for="t in chapterTopics(c[1])" :key="t.id" class="chip" :title="tr(t.name)" @click="showTopic(t.id)">{{ t.id }}</button><template v-if="chapterExtra(c[1]).length"><span class="tiny muted">{{ tl('VeloPhi 补充') }}</span> <button v-for="t in chapterExtra(c[1])" :key="'x' + t.id" class="chip" :title="tr(t.name)" @click="showTopic(t.id)">{{ t.id }}</button></template></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- acceptance -->
      <div v-else-if="tab === 'acceptance'" class="dialog-body one">
        <p class="tiny muted">{{ tl('蓝图的 30 项初始验收测试与 VeloPhi 的自动测试（每次发布前在测试机运行）。') }}</p>
        <table class="small chapters">
          <thead><tr><th>{{ tl('领域') }}</th><th>{{ tl('测试用例') }}</th><th>{{ tl('判定标准') }}</th><th>{{ tl('阶段') }}</th><th>{{ tl('VeloPhi 的证据') }}</th></tr></thead>
          <tbody>
            <tr v-for="(a, i) in cur.data.acceptance" :key="i">
              <td>{{ tr(a[0]) }}</td><td>{{ tr(a[1]) }}</td><td>{{ tr(a[2]) }}</td><td class="mono">{{ a[3] }}</td>
              <td><div v-for="e in ACCEPTANCE[i].tests" :key="e" class="mono tiny">{{ e }}</div><div class="tiny muted">{{ T3(ACCEPTANCE[i].note) }}</div></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- sources and rules -->
      <div v-else class="dialog-body one">
        <p class="small">{{ tr(cur.data.advice) }}</p>
        <h4>{{ tl('使用规则') }}</h4>
        <ol class="small"><li v-for="(r, i) in cur.data.rules" :key="i">{{ tr(r) }}</li></ol>
        <h4>{{ tl('研发阶段') }}</h4>
        <table class="small chapters">
          <thead><tr><th>{{ tl('阶段') }}</th><th>{{ tl('研发主题') }}</th><th>{{ tl('交付内容') }}</th><th>{{ tl('准入/验收门槛') }}</th><th>{{ tl('知识点') }}</th></tr></thead>
          <tbody><tr v-for="r in cur.data.roadmap" :key="r[0]"><td class="mono">{{ r[0] }}</td><td>{{ tr(r[1]) }}</td><td>{{ tr(r[2]) }}</td><td>{{ tr(r[3]) }}</td><td class="mono">{{ cur.topics.filter(t => t.priority === r[0]).length }}</td></tr></tbody>
        </table>
        <h4>{{ tl('课程标准来源') }}</h4>
        <table class="small chapters">
          <tbody><tr v-for="s in cur.data.sources" :key="s[0]"><td>{{ s[0] }}<div class="tiny muted">{{ s[1] }} · {{ tr(s[2]) }}</div></td><td>{{ tr(s[3]) }}<div class="tiny muted">{{ tr(s[4]) }}</div></td><td><a class="tiny" :href="s[5]" target="_blank" rel="noopener">{{ s[5] }}</a></td></tr></tbody>
        </table>
        <p class="tiny muted">{{ cur.data.source.file }} · SHA-256 {{ cur.data.source.sha256.slice(0, 16) }}…</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.curriculum { width: min(1240px, 97vw); }
.sum { margin-left: 10px; }
.spacer { flex: 1; }
.tabs { display: flex; gap: 2px; padding: 0 16px 8px; flex-wrap: wrap; }
.tabs button { border: 0; background: none; padding: 4px 11px; border-radius: 7px; color: var(--text-2); cursor: pointer; font: inherit; }
.tabs button.on { background: var(--accent-soft); color: var(--accent); }
.body { display: grid; grid-template-columns: 330px 1fr; gap: 14px; height: 72vh; }
.one { height: 72vh; overflow: auto; }
aside { display: flex; flex-direction: column; gap: 6px; min-height: 0; }
.search { width: 100%; }
.filters { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 4px; }
.filters select { min-width: 0; width: 100%; }
.row-f { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
.row-f select { width: auto; }
.list { overflow: auto; flex: 1; min-height: 0; }
.row { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: transparent; border-radius: 7px; padding: 4px 6px; cursor: pointer; text-align: left; color: var(--text); font: inherit; }
.row:hover { background: var(--fill); }
.row.on { background: var(--accent-soft); color: var(--accent); }
.id { width: 64px; flex: 0 0 auto; white-space: nowrap; }
.id.wide { width: 64px; }
.name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cov { border: 1px solid var(--separator); border-radius: 5px; padding: 0 5px; color: var(--text-2); white-space: nowrap; margin-right: 6px; }
.cov.ok { color: var(--success); border-color: currentColor; }
.cov.model { color: var(--accent); border-color: currentColor; }
.cov.concept { color: var(--text-2); }
.cov.real { color: var(--warning); border-color: currentColor; }
.cov.off { color: var(--text-3); border-style: dashed; }
.view { overflow: auto; padding-right: 8px; min-height: 0; }
.view h3 { margin: 0 0 2px; }
.view h4 { margin: 14px 0 6px; font-size: var(--type-small); color: var(--text-2); }
.facts { display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--text-2); margin: 6px 0; }
.cover { display: flex; gap: 4px; align-items: baseline; flex-wrap: wrap; }
.res { display: flex; flex-wrap: wrap; gap: 6px; }
.res .btn { display: inline-flex; align-items: center; gap: 5px; }
.chip { display: inline-flex; gap: 4px; align-items: center; border: 0; background: var(--fill); color: var(--text-2); border-radius: 999px; padding: 2px 9px; cursor: pointer; font: inherit; font-size: var(--type-tiny); margin: 0 4px 4px 0; }
.chip:hover { background: var(--fill-strong); color: var(--text); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 0; }
dt { color: var(--text-2); }
dd { margin: 0; }
.courses th { text-align: left; font-weight: 500; color: var(--text-2); padding-right: 12px; white-space: nowrap; }
.courses tr.off td { color: var(--text-3); }
.chapters { width: 100%; border-collapse: collapse; }
.chapters th { text-align: left; font-weight: 600; color: var(--text-2); border-bottom: 1px solid var(--separator); padding: 4px 6px; }
.chapters td { border-bottom: 1px solid var(--separator); padding: 4px 6px; vertical-align: top; }
.plain { list-style: none; padding: 0; margin: 6px 0; }
.src { margin-top: 14px; word-break: break-all; }
.mono { font-family: var(--font-mono); }
@media (max-width: 760px) {
  .body { grid-template-columns: 1fr; height: auto; max-height: 80vh; overflow: auto; }
  .list { max-height: 30vh; }
}
</style>
