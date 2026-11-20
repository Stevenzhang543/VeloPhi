<script setup lang="ts">
/**
 * The guided experiment in the inspector (26.64, D270): purpose, the list of steps, the current step with its hint,
 * what its check compares and what the bench shows for it, a typical mistake when its condition holds, "show me",
 * the reagents of the experiment, and the explanation with the equations the core balanced, the safety of the real
 * experiment and what the model leaves out. Nothing here decides anything: the runner reads the bench.
 */
import { computed, ref } from 'vue'
import { tl, localeTag } from '../../../i18n'
import { useBench } from '../../../chem/bench'
import { reagentOf, reagentText } from '../../../chem/catalog'
import { recordText } from '../../../chem/benchText'
import { saveFile } from '../../../platform/files'
import { showToast } from '../../store'
import Icon from '../Icon.vue'
import { benchUi } from './benchUi'
import { equationLines, guideUi, reportText, termLine, useGuide } from './guide'

const bench = useBench()
const guide = useGuide()
const e = computed(() => guide.active.value)
const at = computed(() => guide.index.value)
const terms = computed(() => { void bench.revision.value; return (guide.outcome.value?.terms ?? []).map(termLine).filter(t => t.label) })
const equations = computed(() => (e.value ? equationLines(e.value) : []))
const reagents = computed(() => (e.value?.reagents ?? []).filter(id => reagentOf(id)))
const about = ref(false)

function show() {
  if (!guide.showMe()) showToast(tl('这一步没有全部演示成：实验台已经偏离了步骤'), true)
}
/** A reagent of the experiment: into the selected vessel, or carried to the vessel tapped next. */
function take(id: string) {
  const target = bench.selected.value
  if (target) benchUi.dialog = { mode: 'add', to: target, reagent: id }
  else benchUi.carry = { type: 'reagent', id, dragging: false, x: 0, y: 0 }
}
async function report() {
  if (!e.value) return
  const text = reportText(e.value, at.value, recordText(bench, new Date().toLocaleDateString(localeTag())))
  await saveFile(text, `${e.value.id}.txt`, [{ name: tl('实验报告'), extensions: ['txt'] }])
}
function leave() { guide.leave() }
</script>

<template>
  <div v-if="e" class="guide" data-ui="chem-guide">
    <header class="head">
      <h3 class="name">{{ tl(e.title) }}</h3>
      <p class="goal">{{ tl(e.goal) }}</p>
      <p v-if="e.reduced" class="note" data-ui="chem-guide-reduced"><Icon name="info" :size="14" /><span>{{ tl(e.reduced) }}</span></p>
    </header>

    <ol class="steps" :aria-label="tl('步骤')">
      <li v-for="(s, i) in e.steps" :key="i" class="step" :class="{ done: i < at, now: i === at }" :aria-current="i === at ? 'step' : undefined" :data-step="i + 1" :data-state="i < at ? 'done' : i === at ? 'now' : 'todo'">
        <span class="mark" aria-hidden="true"><Icon v-if="i < at" name="check" :size="13" /><span v-else class="num">{{ i + 1 }}</span></span>
        <div class="what">
          <p class="text">{{ tl(s.text) }}</p>
          <template v-if="i === at">
            <p v-if="s.hint" class="hint">{{ tl(s.hint) }}</p>
            <p v-for="m in guide.mistakes.value" :key="m" class="mistake" role="alert" data-ui="chem-guide-mistake"><Icon name="alert" :size="14" /><span>{{ tl('第 {0} 步：{1}', [i + 1, tl(m)]) }}</span></p>
            <ul class="terms" :aria-label="tl('检查')" data-ui="chem-guide-check">
              <li v-for="(t, k) in terms" :key="k" :class="{ ok: t.ok }"><Icon :name="t.ok ? 'check' : 'tick'" :size="12" /><span class="lab">{{ t.label }}</span><span v-if="t.value" class="val num">{{ t.value }}</span><span v-if="t.need" class="need num">{{ t.need }}</span></li>
            </ul>
            <button type="button" class="btn small" data-ui="chem-guide-show" @click="show"><Icon name="play" :size="12" />{{ tl('做给我看') }}</button>
          </template>
        </div>
      </li>
    </ol>

    <p v-if="guide.finished.value" class="finished" role="status" data-ui="chem-guide-done"><Icon name="okCircle" :size="16" /><span>{{ tl('步骤全部完成。实验台还是你的：继续试别的做法。') }}</span></p>

    <section v-if="reagents.length" class="sec">
      <h4>{{ tl('本实验的药品') }}</h4>
      <div class="chips"><button v-for="id in reagents" :key="id" type="button" class="chip" :data-reagent="id" @click="take(id)">{{ reagentText(id) }}</button></div>
    </section>

    <section class="sec">
      <button type="button" class="fold" :aria-expanded="about" data-ui="chem-guide-about" @click="about = !about"><Icon name="chevron" :size="11" :class="{ open: about }" />{{ tl('原理、安全与模型的范围') }}</button>
      <div v-if="about" class="about">
        <p>{{ tl(e.principle) }}</p>
        <p v-for="q in equations" :key="q" class="eq num" data-ui="chem-guide-equation">{{ q }}</p>
        <h4>{{ tl('真实实验的安全') }}</h4>
        <p>{{ tl(e.safety) }}</p>
        <template v-if="e.limits"><h4>{{ tl('模型之外') }}</h4><p>{{ tl(e.limits) }}</p></template>
      </div>
    </section>

    <footer class="foot">
      <button type="button" class="btn small ghost" data-ui="chem-guide-report" @click="report"><Icon name="report" :size="13" />{{ tl('实验报告') }}</button>
      <button type="button" class="btn small ghost" data-ui="chem-guide-other" @click="guideUi.gallery = true"><Icon name="list" :size="13" />{{ tl('换一个') }}</button>
      <span class="spacer" />
      <button type="button" class="btn small ghost" data-ui="chem-guide-leave" @click="leave">{{ tl('结束引导') }}</button>
    </footer>
  </div>
</template>

<style scoped>
.guide { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-3); }
.head { display: flex; flex-direction: column; gap: var(--space-1); }
.name { margin: 0; font-size: var(--type-subtitle); font-weight: var(--weight-title); line-height: var(--line-tight); }
.goal { margin: 0; color: var(--text-2); font-size: var(--type-small); }
.note, .mistake, .finished { display: flex; gap: var(--space-2); align-items: flex-start; margin: 0; padding: var(--space-2); border-radius: var(--radius-control); border: 1px solid var(--separator); font-size: var(--type-small); }
.note > .icon, .mistake > .icon, .finished > .icon { flex: 0 0 auto; margin-top: 2px; }
.mistake { border-color: var(--danger); color: var(--danger); }
.finished { border-color: var(--success); }
.steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.step { display: flex; gap: var(--space-2); align-items: flex-start; color: var(--text-2); }
.step.now, .step.done .mark { color: var(--text); }
.mark { flex: 0 0 auto; display: grid; place-items: center; width: var(--hit-min); height: var(--hit-min); border-radius: var(--radius-round); border: 1px solid var(--separator); font-size: var(--type-tiny); }
.step.now .mark { border-color: var(--accent); color: var(--accent); }
.step.done .mark { border-color: var(--success); color: var(--success); }
.what { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start; }
.text { margin: 0; padding-top: 2px; }
.step.now .text { font-weight: var(--weight-medium); }
.hint { margin: 0; font-size: var(--type-small); color: var(--text-2); }
.terms { list-style: none; margin: 0; padding: 0; width: 100%; display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--type-small); }
.terms li { display: flex; align-items: baseline; gap: var(--space-2); color: var(--text-2); }
.terms li > .icon { flex: 0 0 auto; align-self: center; opacity: 0.5; }
.terms li.ok { color: var(--text); }
.terms li.ok > .icon { color: var(--success); opacity: 1; }
.lab { flex: 1; min-width: 0; }
.val { color: var(--text); white-space: nowrap; }
.need { white-space: nowrap; }
.sec { display: flex; flex-direction: column; gap: var(--space-2); }
.sec h4, .about h4 { margin: 0; font-size: var(--type-small); font-weight: var(--weight-strong); color: var(--text-2); }
.chips { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.chip { min-height: var(--control-sm); padding: 0 var(--space-2); border: 1px solid var(--separator); border-radius: var(--radius-pill); background: transparent; color: var(--text); font: inherit; font-size: var(--type-small); cursor: pointer; }
.chip:hover, .chip:focus-visible { background: var(--hover); }
.fold { display: flex; align-items: center; gap: var(--space-2); padding: 0; border: 0; background: transparent; color: var(--text); font: inherit; font-weight: var(--weight-medium); cursor: pointer; min-height: var(--hit-min); }
.fold .icon { transform: rotate(-90deg); transition: transform var(--dur-1, 120ms); }
.fold .icon.open { transform: none; }
.about { display: flex; flex-direction: column; gap: var(--space-2); font-size: var(--type-small); }
.about p { margin: 0; line-height: var(--line-body); }
.eq { color: var(--text); }
.foot { display: flex; align-items: center; gap: var(--space-1); flex-wrap: wrap; }
.spacer { flex: 1; }
</style>
