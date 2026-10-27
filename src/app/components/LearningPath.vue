<script setup lang="ts">
/**
 * Learning path (26.55, D96): the stages of the curriculum on the left with their progress, the units of the chosen
 * stage on the right as lists of steps — templates, experiments, problems, handbook topics and concept pages. A
 * click opens a step (and marks it done); the tick marks it done or not by hand. Progress stays in this browser.
 *
 * Mounted by App.vue while `state.showLearning` is true.
 */
import { computed } from 'vue'
import { tl } from '../../i18n'
import { state } from '../store'
import { settings } from '../settings'
import { PATHS, stepKey } from '../learn/paths'
import type { PathStage, PathStep } from '../learn/paths'
import { KIND_META, isDone, openStep, setDone, stepTitle } from '../learn/actions'
import Icon from './Icon.vue'

const stage = computed<PathStage>(() => PATHS.find(s => s.id === settings.ui.learnStage) ?? PATHS[0])
const stepsOf = (s: PathStage) => s.units.flatMap(u => u.steps)
const progress = (s: PathStage) => { const all = stepsOf(s); return { done: all.filter(isDone).length, all: all.length } }
/** The first step not done yet, from the chosen stage on. */
const next = computed<{ stage: PathStage; step: PathStep } | null>(() => {
  const from = PATHS.indexOf(stage.value)
  for (const s of [...PATHS.slice(from), ...PATHS.slice(0, from)]) for (const st of stepsOf(s)) if (!isDone(st)) return { stage: s, step: st }
  return null
})
function close() { state.showLearning = false }
function choose(id: string) { settings.ui.learnStage = id }
function resetStage() { const keys = new Set(stepsOf(stage.value).map(stepKey)); settings.ui.learnDone = settings.ui.learnDone.filter(k => !keys.has(k)) }
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="close">
    <div class="dialog learn" role="dialog" :aria-label="tl('学习路径')">
      <div class="dialog-header"><Icon name="graduation" :size="18" />{{ tl('学习路径') }}<span class="spacer" /><button class="btn icon ghost" :title="tl('关闭')" @click="close"><Icon name="close" /></button></div>
      <div class="dialog-body body">
        <nav :aria-label="tl('学段')">
          <button v-for="s in PATHS" :key="s.id" class="nav-item" :class="{ on: stage.id === s.id }" :aria-current="stage.id === s.id" @click="choose(s.id)">
            <span class="grow">{{ s.title }}</span>
            <span class="n" :class="{ full: progress(s).done === progress(s).all }">{{ progress(s).done }}/{{ progress(s).all }}</span>
          </button>
        </nav>
        <section class="units">
          <div class="stage-head">
            <h3>{{ stage.title }}</h3>
            <p class="small muted">{{ stage.summary }}</p>
            <div class="bar" role="progressbar" :aria-valuenow="progress(stage).done" :aria-valuemax="progress(stage).all"><i :style="{ width: `${(100 * progress(stage).done) / Math.max(1, progress(stage).all)}%` }" /></div>
          </div>
          <div v-for="u in stage.units" :key="u.id" class="unit">
            <div class="unit-title small">{{ u.title }}</div>
            <div v-for="st in u.steps" :key="stepKey(st)" class="step" :class="{ done: isDone(st) }">
              <button class="tick" :title="isDone(st) ? tl('标为未完成') : tl('标为已完成')" :aria-pressed="isDone(st)" @click="setDone(st, !isDone(st))"><Icon v-if="isDone(st)" name="check" :size="12" /></button>
              <button class="open" @click="openStep(st)">
                <Icon :name="KIND_META[st.kind].icon" :size="14" />
                <span class="kind tiny">{{ KIND_META[st.kind].label }}</span>
                <span class="name">{{ stepTitle(st) }}</span>
              </button>
            </div>
          </div>
        </section>
      </div>
      <div class="dialog-footer">
        <span class="tiny muted">{{ tl('按课程标准的顺序：先运行模板看现象，再做实验、做题，最后读手册中的原理。完成情况只保存在本机。') }}</span>
        <span class="spacer" />
        <button class="btn ghost" @click="resetStage">{{ tl('清除本学段的进度') }}</button>
        <button v-if="next" class="btn primary" @click="openStep(next.step)">{{ tl('继续：{0}', [stepTitle(next.step)]) }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.learn { width: min(980px, 96vw); }
.body { display: grid; grid-template-columns: 200px 1fr; gap: 16px; min-height: 440px; max-height: 68vh; }
nav { display: flex; flex-direction: column; gap: 2px; overflow: auto; }
.nav-item { display: flex; align-items: center; gap: 8px; border: 0; background: transparent; border-radius: 8px; padding: 7px 10px; cursor: pointer; text-align: left; color: var(--text); font: inherit; }
.nav-item:hover { background: var(--hover); }
.nav-item.on { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.n { font-family: var(--font-mono); font-size: var(--type-tiny); color: var(--text-2); }
.n.full { color: var(--success, #16a34a); }
.grow { flex: 1; }
.units { overflow: auto; padding-right: 6px; }
.stage-head h3 { margin: 2px 0 2px; }
.stage-head p { margin: 0 0 8px; }
.bar { height: 6px; border-radius: 3px; background: var(--hover); overflow: hidden; margin-bottom: 8px; }
.bar i { display: block; height: 100%; background: var(--accent); transition: width 0.2s; }
.unit { margin: 10px 0 4px; }
.unit-title { font-weight: 600; margin: 0 0 4px; }
.step { display: flex; align-items: center; gap: 6px; }
.tick { width: 18px; height: 18px; border-radius: 5px; border: 1px solid var(--separator); background: var(--bg); display: grid; place-items: center; cursor: pointer; padding: 0; color: #fff; flex: 0 0 auto; }
.step.done .tick { background: var(--accent); border-color: var(--accent); }
.open { flex: 1; display: flex; align-items: center; gap: 8px; border: 0; background: transparent; border-radius: 8px; padding: 5px 8px; cursor: pointer; text-align: left; color: var(--text); font: inherit; min-width: 0; }
.open:hover { background: var(--hover); }
.kind { color: var(--text-2); border: 1px solid var(--separator); border-radius: 5px; padding: 0 5px; flex: 0 0 auto; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.step.done .name { color: var(--text-2); }
@media (max-width: 720px) {
  .body { grid-template-columns: 1fr; max-height: 74vh; }
  nav { flex-direction: row; overflow-x: auto; }
  .nav-item { flex: 0 0 auto; }
}
</style>
