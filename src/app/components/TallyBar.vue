<script setup lang="ts">
/**
 * The class tally card (26.63, D235; see app/tally.ts). It floats over the studio, so the scene keeps playing behind
 * it: 提问 → 计票 → 运行 → 揭晓 (→ 讨论后再投一次). Large numbers and bars — it is read from the back of a classroom.
 */
import { computed } from 'vue'
import { tl } from '../../i18n'
import { state, showToast } from '../store'
import { settings } from '../settings'
import { phone } from '../layout'
import { tally, bump, setCount, currentRound, totalOf, shareRight, setOptionCount, lockAndRun, reveal, voteAgain, tallySummary, newTally } from '../tally'
import Icon from './Icon.vue'

const LETTERS = 'ABCD'
const round = computed(() => currentRound())
const total = computed(() => totalOf(round.value))
const revealed = computed(() => tally.stage === 'reveal')
const pct = (counts: number[], i: number) => { const n = totalOf(counts); return n ? Math.round((100 * counts[i]) / n) : 0 }
const widest = computed(() => Math.max(1, ...tally.rounds.flat()))
const share = (k: number) => { const s = shareRight(tally.rounds[k]); return s === null ? null : Math.round(100 * s) }
const STAGES = computed(() => [{ id: 'ask', label: tl('提问') }, { id: 'vote', label: tl('计票') }, { id: 'run', label: tl('运行') }, { id: 'reveal', label: tl('揭晓') }])
const stageIndex = computed(() => STAGES.value.findIndex(s => s.id === tally.stage))
const canStart = computed(() => tally.question.trim().length > 0 && tally.options.every(o => o.trim().length > 0))

async function copy() {
  try { await navigator.clipboard.writeText(tallySummary()); showToast(tl('统计结果已复制')) } catch { showToast(tl('无法写入剪贴板'), true) }
}
function close() { tally.open = false }
</script>

<template>
  <aside class="tally" :class="{ phone, collapsed: tally.collapsed, proj: settings.projector }" role="region" :aria-label="tl('班级预测统计')" data-ui="tally-card">
    <header>
      <Icon name="tally" :size="15" />
      <b class="title">{{ tl('先猜后看') }}</b>
      <ol class="stages tiny" :aria-label="tl('步骤')"><li v-for="(s, k) in STAGES" :key="s.id" :class="{ on: k === stageIndex, done: k < stageIndex }">{{ s.label }}</li></ol>
      <span class="spacer" />
      <button type="button" class="btn icon ghost" :title="tally.collapsed ? tl('展开') : tl('收起')" :aria-label="tally.collapsed ? tl('展开') : tl('收起')" @click="tally.collapsed = !tally.collapsed"><Icon :name="tally.collapsed ? 'expandDown' : 'expandUp'" :size="14" /></button>
      <button type="button" class="btn icon ghost" :title="tl('关闭')" :aria-label="tl('关闭')" @click="close"><Icon name="close" :size="14" /></button>
    </header>
    <div v-show="!tally.collapsed" class="body">
      <!-- 提问 -->
      <template v-if="tally.stage === 'ask'">
        <textarea v-model="tally.question" class="field q" rows="2" :placeholder="tl('问题：运行之前，你认为会发生什么？')" :aria-label="tl('问题')" />
        <div v-for="(_o, i) in tally.options" :key="i" class="opt-edit"><span class="letter">{{ LETTERS[i] }}</span><input v-model="tally.options[i]" class="field grow" :aria-label="tl('选项 {0}', [LETTERS[i]])" /></div>
        <div class="line">
          <span class="small muted">{{ tl('选项数') }}</span>
          <span class="segmented"><button v-for="n in [2, 3, 4]" :key="n" :class="{ on: tally.options.length === n }" @click="setOptionCount(n)">{{ n }}</button></span>
          <span class="spacer" />
          <button type="button" class="btn primary" :disabled="!canStart" @click="tally.stage = 'vote'">{{ tl('开始计票') }}<Icon name="arrowRight" :size="14" /></button>
        </div>
      </template>
      <template v-else>
        <p class="question">{{ tally.question }}</p>
        <div v-if="tally.rounds.length > 1" class="tiny muted round">{{ tally.stage === 'vote' ? tl('第 2 轮：讨论之后再投一次') : tl('两轮对比：浅色是第 1 轮') }}</div>
        <div class="opts">
          <div v-for="(o, i) in tally.options" :key="i" class="opt" :class="{ right: revealed && tally.answer === i, wrong: revealed && tally.answer !== null && tally.answer !== i }">
            <div class="opt-head"><span class="letter">{{ LETTERS[i] }}</span><span class="opt-text">{{ o }}</span><Icon v-if="revealed && tally.answer === i" name="okCircle" :size="16" class="ok" /></div>
            <div class="bars">
              <div v-if="tally.rounds.length > 1" class="bar first"><i :style="{ width: `${(100 * tally.rounds[0][i]) / widest}%` }" /><span class="n">{{ tally.rounds[0][i] }}</span></div>
              <div class="bar"><i :style="{ width: `${(100 * round[i]) / widest}%` }" /><span class="n">{{ round[i] }}<small v-if="total"> · {{ pct(round, i) }}%</small></span></div>
            </div>
            <div v-if="tally.stage === 'vote'" class="count">
              <button type="button" class="btn icon" :aria-label="tl('减 1')" :disabled="!round[i]" @click="bump(i, -1)">−</button>
              <input class="field num" type="number" min="0" max="999" inputmode="numeric" :value="round[i]" :aria-label="tl('选 {0} 的人数', [LETTERS[i]])" @change="setCount(i, Number(($event.target as HTMLInputElement).value))" />
              <button type="button" class="btn icon tonal" :aria-label="tl('加 1')" @click="bump(i, 1)">+</button>
              <button type="button" class="btn small ghost" @click="bump(i, 5)">+5</button>
            </div>
          </div>
        </div>
        <div v-if="tally.stage === 'vote'" class="line">
          <span class="small muted">{{ tl('举手计数，或直接输入人数 · 共 {0} 人', [total]) }}</span><span class="spacer" />
          <button v-if="!tally.caseId && tally.rounds.length === 1" type="button" class="btn ghost small" @click="tally.stage = 'ask'">{{ tl('改题') }}</button>
          <button type="button" class="btn primary" data-ui="tally-run" @click="lockAndRun"><Icon name="play" :size="13" />{{ tl('锁定并运行') }}</button>
        </div>
        <div v-else-if="tally.stage === 'run'" class="line">
          <span class="small muted">{{ state.playing ? tl('正在播放…看完再揭晓') : tl('播放结束或已暂停') }}</span><span class="spacer" />
          <label v-if="!tally.caseId" class="small pick">{{ tl('正确选项') }}
            <select v-model="tally.answer" class="field"><option :value="null">{{ tl('不指定') }}</option><option v-for="(_o, i) in tally.options" :key="i" :value="i">{{ LETTERS[i] }}</option></select>
          </label>
          <button type="button" class="btn primary" data-ui="tally-reveal" @click="reveal">{{ tl('揭晓') }}</button>
        </div>
        <template v-else>
          <div v-if="tally.answer !== null && totalOf(tally.rounds[0])" class="result">
            <span v-for="(_r, k) in tally.rounds" :key="k" class="share"><b>{{ share(k) }}%</b><span class="tiny muted">{{ tally.rounds.length > 1 ? tl('第 {0} 轮答对', [k + 1]) : tl('答对') }}</span></span>
            <span v-if="tally.rounds.length === 2 && share(0) !== null && share(1) !== null" class="shift" :class="{ up: share(1)! > share(0)! }">{{ share(1)! >= share(0)! ? '+' : '' }}{{ share(1)! - share(0)! }} {{ tl('个百分点') }}</span>
          </div>
          <p v-if="tally.physics" class="why">{{ tally.physics }}</p>
          <p v-if="tally.watch" class="watch small"><Icon name="eye" :size="13" />{{ tally.watch }}</p>
          <div class="line">
            <button v-if="tally.rounds.length < 2 && totalOf(tally.rounds[0])" type="button" class="btn tonal" :title="tl('同伴教学：先和旁边的同学讨论理由，再投一次')" @click="voteAgain"><Icon name="users" :size="14" />{{ tl('讨论后再投一次') }}</button>
            <span class="spacer" />
            <button v-if="totalOf(tally.rounds[0])" type="button" class="btn ghost small" @click="copy"><Icon name="copy" :size="13" />{{ tl('复制结果') }}</button>
            <button type="button" class="btn ghost small" @click="newTally()">{{ tl('新问题') }}</button>
          </div>
        </template>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.tally { position: absolute; left: calc(var(--float-left, 62px) + 14px); top: 12px; z-index: 30; width: min(400px, calc(100% - 32px)); max-height: calc(100% - var(--float-bottom, 64px) - 28px); display: flex; flex-direction: column; background: var(--pane); border-radius: var(--radius-panel); box-shadow: var(--elev-3); font-size: var(--type-small); animation: pop-in var(--dur-enter) var(--ease-out); }
.tally.proj { width: min(520px, calc(100% - 32px)); font-size: var(--type-body); }
.tally.phone { left: 10px; right: 10px; width: auto; top: 8px; max-height: 62%; }
header { display: flex; align-items: center; gap: 6px; padding: 8px 8px 6px 12px; }
.title { font-size: var(--type-body); }
.stages { display: flex; gap: 2px; list-style: none; margin: 0 0 0 6px; padding: 0; color: var(--text-3); }
.stages li { padding: 1px 7px; border-radius: 999px; }
.stages li.done { color: var(--text-2); }
.stages li.on { background: var(--accent-soft); color: var(--accent); font-weight: 650; }
.collapsed .stages { display: none; }
.body { padding: 2px 12px 12px; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
.q { width: 100%; }
.opt-edit { display: flex; align-items: center; gap: 8px; }
.letter { flex: 0 0 auto; width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; background: var(--fill); font-weight: 700; font-size: var(--type-tiny); }
.line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.question { margin: 2px 0 0; font-size: calc(var(--type-body) * 1.06); font-weight: 600; line-height: 1.45; }
.proj .question { font-size: calc(var(--type-body) * 1.25); }
.round { margin-top: -4px; }
.opts { display: flex; flex-direction: column; gap: 8px; }
.opt { background: var(--group); border-radius: var(--radius-group); padding: 8px 10px; display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; align-items: center; transition: background var(--dur-toggle) ease, box-shadow var(--dur-toggle) ease, opacity var(--dur-toggle) ease; }
.opt-head { display: flex; align-items: center; gap: 8px; min-width: 0; grid-column: 1 / -1; }
.opt-text { font-weight: 550; min-width: 0; overflow-wrap: anywhere; }
.opt.right { background: var(--success-soft); box-shadow: inset 0 0 0 1.5px var(--success); }
.opt.right .letter { background: var(--success); color: #fff; }
.opt.wrong { opacity: 0.72; }
.ok { color: var(--success); }
.bars { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.bar { position: relative; height: 20px; border-radius: 6px; background: var(--fill); overflow: hidden; }
.bar i { position: absolute; inset: 0 auto 0 0; background: var(--accent); border-radius: 6px; min-width: 0; transition: width var(--dur-panel) var(--ease-out); opacity: 0.85; }
.bar.first { height: 10px; }
.bar.first i { background: var(--text-3); opacity: 0.5; }
.bar.first .n { display: none; }
.opt.right .bar:not(.first) i { background: var(--success); }
.n { position: absolute; right: 7px; top: 0; line-height: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
.n small { font-weight: 500; color: var(--text-2); }
.count { display: flex; align-items: center; gap: 4px; }
.count .btn.icon { font-size: 18px; font-weight: 600; }
.num { width: 58px; text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; }
.pick { display: inline-flex; align-items: center; gap: 6px; }
.result { display: flex; align-items: center; gap: 18px; padding: 4px 2px; }
.share { display: flex; flex-direction: column; line-height: 1.15; }
.share b { font-size: calc(26px * var(--zoom)); font-variant-numeric: tabular-nums; }
.shift { font-weight: 650; color: var(--text-2); }
.shift.up { color: var(--success); }
.why { margin: 0; line-height: 1.55; }
.watch { margin: 0; display: flex; gap: 6px; align-items: baseline; color: var(--text-2); }
.watch :deep(.icon) { flex: 0 0 auto; transform: translateY(2px); }
@media (pointer: coarse) { .count .btn.icon { min-width: 44px; } }
</style>
