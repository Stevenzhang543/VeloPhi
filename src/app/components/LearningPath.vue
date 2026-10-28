<script setup lang="ts">
/**
 * Learning path (26.55, D96; 26.56, D103): the stages of the curriculum on the left with their progress, the units of
 * the chosen stage on the right as lists of steps — templates, experiments, problems, handbook topics, concept pages
 * and teaching activities. Each step shows three separate marks: visited (opened), practised (an activity of the
 * step finished) and mastery evidence (by the visible rule). Opening a page is never mastery. The learner can view,
 * export and clear the records; they stay in this browser.
 *
 * Mounted by App.vue while `state.showLearning` is true.
 */
import { computed, onMounted, ref } from 'vue'
import { dialogKeys } from '../focusTrap'
import { tl, activeLang } from '../../i18n'
import { state } from '../store'
import { settings } from '../settings'
import { PATHS, stepKey } from '../learn/paths'
import type { PathStage, PathStep } from '../learn/paths'
import { KIND_META, openStep, stepState, stepTitle } from '../learn/actions'
import { records, unvisit, visit, exportJson, clearAll } from '../learn/records'
import { MASTERY_RULE } from '../../teaching/records'
import { ask } from '../../platform/ask'
import { saveFile } from '../../platform/files'
import Icon from './Icon.vue'

const stage = computed<PathStage>(() => PATHS.find(s => s.id === settings.ui.learnStage) ?? PATHS[0])
const stepsOf = (s: PathStage) => s.units.flatMap(u => u.steps)
const progress = (s: PathStage) => {
  const all = stepsOf(s)
  const st = all.map(stepState)
  return { visited: st.filter(x => x.visited).length, practised: st.filter(x => x.practised).length, mastery: st.filter(x => x.mastery).length, all: all.length, activities: all.filter(x => x.kind === 'activity').length }
}
/** The first step not visited yet, from the chosen stage on. */
const next = computed<{ stage: PathStage; step: PathStep } | null>(() => {
  void records.visited
  const from = PATHS.indexOf(stage.value)
  for (const s of [...PATHS.slice(from), ...PATHS.slice(0, from)]) for (const st of stepsOf(s)) if (!stepState(st).visited) return { stage: s, step: st }
  return null
})
const showRule = ref(false)
const rule = computed(() => MASTERY_RULE[activeLang()] ?? MASTERY_RULE.zh)
function close() { state.showLearning = false }
const root = ref<HTMLElement | null>(null)
onMounted(() => root.value?.focus())
function choose(id: string) { settings.ui.learnStage = id }
function toggleVisit(st: PathStep) { const k = stepKey(st); if (stepState(st).visited) unvisit(k); else visit(k) }
function clearStageVisits() { for (const st of stepsOf(stage.value)) unvisit(stepKey(st)) }
async function exportRecords() { await saveFile(exportJson(), 'velophi-learning-records.json', [{ name: 'JSON', extensions: ['json'] }]) }
async function clearRecords() { if (await ask(tl('清除本机的全部学习记录（访问、练习与掌握证据）？此操作不能撤销。'))) clearAll() }
const counts = computed(() => ({ visits: Object.keys(records.visited).length, attempts: records.attempts.length, mastery: records.attempts.filter(a => a.mastery).length }))
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="close">
    <div ref="root" class="dialog learn" role="dialog" aria-modal="true" tabindex="-1" :aria-label="tl('学习路径')" @keydown="dialogKeys($event, root, close)">
      <div class="dialog-header"><Icon name="graduation" :size="18" />{{ tl('学习路径') }}<span class="spacer" /><button class="btn icon ghost" :title="tl('关闭')" @click="close"><Icon name="close" /></button></div>
      <div class="dialog-body body">
        <nav :aria-label="tl('学段')">
          <button v-for="s in PATHS" :key="s.id" class="nav-item" :class="{ on: stage.id === s.id }" :aria-current="stage.id === s.id" @click="choose(s.id)">
            <span class="grow">{{ s.title }}</span>
            <span class="n" :title="tl('已访问 / 全部')">{{ progress(s).visited }}/{{ progress(s).all }}</span>
          </button>
        </nav>
        <section class="units">
          <div class="stage-head">
            <h3>{{ stage.title }}</h3>
            <p class="small muted">{{ stage.summary }}</p>
            <div class="legend tiny">
              <span><Icon name="eye" :size="12" />{{ tl('已访问 {0}', [progress(stage).visited]) }}</span>
              <span><Icon name="pen" :size="12" />{{ tl('已练习 {0}', [progress(stage).practised]) }}</span>
              <span><Icon name="flag" :size="12" />{{ tl('有掌握证据 {0}', [progress(stage).mastery]) }}</span>
              <button class="link tiny" :aria-expanded="showRule" @click="showRule = !showRule">{{ tl('判定规则') }}</button>
            </div>
            <p v-if="showRule" class="tiny rule">{{ rule }}</p>
            <div class="bar" role="progressbar" :aria-label="tl('已访问')" :aria-valuenow="progress(stage).visited" :aria-valuemax="progress(stage).all"><i :style="{ width: `${(100 * progress(stage).visited) / Math.max(1, progress(stage).all)}%` }" /></div>
          </div>
          <div v-for="u in stage.units" :key="u.id" class="unit">
            <div class="unit-title small">{{ u.title }}</div>
            <div v-for="st in u.steps" :key="stepKey(st)" class="step" :class="{ visited: stepState(st).visited }">
              <button class="tick" :title="stepState(st).visited ? tl('标为未访问') : tl('标为已访问')" :aria-label="stepState(st).visited ? tl('标为未访问') : tl('标为已访问')" :aria-pressed="stepState(st).visited" @click="toggleVisit(st)"><Icon v-if="stepState(st).visited" name="eye" :size="11" /></button>
              <button class="open" @click="openStep(st)">
                <Icon :name="KIND_META[st.kind].icon" :size="14" />
                <span class="kind tiny">{{ KIND_META[st.kind].label }}</span>
                <span class="name">{{ stepTitle(st) }}</span>
              </button>
              <span class="marks">
                <span v-if="stepState(st).practised" role="img" :title="tl('已练习')" :aria-label="tl('已练习')"><Icon name="pen" :size="13" /></span>
                <span v-if="stepState(st).mastery" class="m" role="img" :title="tl('有掌握证据')" :aria-label="tl('有掌握证据')"><Icon name="flag" :size="13" /></span>
              </span>
            </div>
          </div>
        </section>
      </div>
      <div class="dialog-footer">
        <span class="tiny muted">{{ tl('本机记录：{0} 次访问、{1} 次活动作答、{2} 次掌握证据。打开页面只算访问。', [counts.visits, counts.attempts, counts.mastery]) }}</span>
        <span class="spacer" />
        <button class="btn ghost" @click="exportRecords">{{ tl('导出学习记录') }}</button>
        <button class="btn ghost" @click="clearRecords">{{ tl('清除学习记录') }}</button>
        <button class="btn ghost" @click="clearStageVisits">{{ tl('清除本学段的访问') }}</button>
        <button v-if="next" class="btn primary" @click="openStep(next.step)">{{ tl('继续：{0}', [stepTitle(next.step)]) }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.learn { width: min(1020px, 96vw); }
.body { display: grid; grid-template-columns: 200px 1fr; gap: 16px; min-height: 440px; max-height: 68vh; }
nav { display: flex; flex-direction: column; gap: 2px; overflow: auto; }
.nav-item { display: flex; align-items: center; gap: 8px; border: 0; background: transparent; border-radius: 8px; padding: 7px 10px; cursor: pointer; text-align: left; color: var(--text); font: inherit; }
.nav-item:hover { background: var(--hover); }
.nav-item.on { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.n { font-family: var(--font-mono); font-size: var(--type-tiny); color: var(--text-2); }
.grow { flex: 1; }
.units { overflow: auto; padding-right: 6px; }
.stage-head h3 { margin: 2px 0 2px; }
.stage-head p { margin: 0 0 6px; }
.legend { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; color: var(--text-2); margin-bottom: 6px; }
.legend span { display: inline-flex; gap: 4px; align-items: center; }
.link { border: 0; background: none; color: var(--accent); cursor: pointer; padding: 0; text-decoration: underline; }
.rule { background: var(--hover); border-radius: 8px; padding: 6px 8px; margin: 0 0 8px; }
.bar { height: 6px; border-radius: 3px; background: var(--hover); overflow: hidden; margin-bottom: 8px; }
.bar i { display: block; height: 100%; background: var(--accent); transition: width 0.2s; }
.unit { margin: 10px 0 4px; }
.unit-title { font-weight: 600; margin: 0 0 4px; }
.step { display: flex; align-items: center; gap: 6px; }
.tick { width: 18px; height: 18px; border-radius: 5px; border: 1px solid var(--separator); background: var(--bg); display: grid; place-items: center; cursor: pointer; padding: 0; color: var(--accent); flex: 0 0 auto; }
.open { flex: 1; display: flex; align-items: center; gap: 8px; border: 0; background: transparent; border-radius: 8px; padding: 5px 8px; cursor: pointer; text-align: left; color: var(--text); font: inherit; min-width: 0; }
.open:hover { background: var(--hover); }
.kind { color: var(--text-2); border: 1px solid var(--separator); border-radius: 5px; padding: 0 5px; flex: 0 0 auto; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.step.visited .name { color: var(--text-2); }
.marks { display: inline-flex; gap: 4px; width: 36px; justify-content: flex-end; color: var(--text-2); }
.marks .m { color: var(--success, #16a34a); }
@media (max-width: 720px) {
  .body { grid-template-columns: 1fr; max-height: 74vh; }
  nav { flex-direction: row; overflow-x: auto; }
  .nav-item { flex: 0 0 auto; }
}
</style>
