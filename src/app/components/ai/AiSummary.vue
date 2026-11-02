<script setup lang="ts">
/**
 * What the AI understood (26.59, D162 step 6): route and categories, the values read with their words in the
 * problem, the assumptions, the questions it would like answered (each answer reads the problem again) and the
 * warnings. Every number of the answers is computed by the engine; this view says so.
 */
import { computed, ref } from 'vue'
import { tl } from '../../../i18n'
import type { ImportSuccess } from '../../../ai/import/pipeline'
import { modelOutputs } from '../../../ai/import/pipeline'
import { templateById } from '../../../templates'
import { modelById } from '../../../content/models'
import { DOMAINS } from '../../../task/vocab'
import { CHAPTERS } from '../../../teaching/problems'
import { fmtQ } from '../../settings'

const props = defineProps<{ outcome: ImportSuccess; /** The answers are shown elsewhere (the Copilot card). */ hideOutputs?: boolean }>()
const emit = defineEmits<{ clarify: [hint: string]; reread: [text: string] }>()
const edited = ref(props.outcome.transcript ?? '')

const ROUTE_TEXT: Record<string, string> = { example: '例题', template: '仿真模板', task: '解析任务', model: '解析模型', scene: 'AI 生成的场景', equations: '自建方程模型' }
const LEVEL_TEXT: Record<string, string> = { basic: '基础', advanced: '提高', hard: '压轴' }
const STAGE_TEXT: Record<string, string> = { junior: '初中', senior: '高中', university: '大学' }

const what = computed(() => {
  const o = props.outcome, b = o.build
  if (b.kind === 'template') return `${templateById(b.id)?.name ?? b.id}`
  if (b.kind === 'task') return tl(DOMAINS[b.domain].label)
  if (b.kind === 'model') { const m = modelById(b.id); return m ? `${m.id} ${m.title.zh}` : b.id }
  if (b.kind === 'equations') return tl('{0} 个未知量、{1} 条方程', [b.model.unknowns.length, b.model.equations.length])
  return tl('新场景（{0} 个物体）', [b.scene.bodies.filter(x => x.kind !== 'static').length])
})
const chapter = computed(() => { const c = CHAPTERS.find(x => x.id === props.outcome.first.category.chapter); return c ? tl(c.label.zh) : '' })
const nQuestions = computed(() => { const b = props.outcome.build; return b.kind === 'template' || b.kind === 'scene' ? b.questions.length : b.kind === 'task' ? b.targets.length : b.kind === 'equations' ? b.model.asks.length : b.outputs.length })
const outputs = computed(() => modelOutputs(props.outcome.build))
</script>

<template>
  <div class="ai-summary">
    <div class="chips">
      <span class="chip route">{{ tl(ROUTE_TEXT[outcome.first.route] ?? outcome.first.route) }} · {{ what }}</span>
      <span v-if="chapter" class="chip">{{ chapter }}</span>
      <span v-for="t in outcome.first.category.types" :key="t" class="chip">{{ tl(t) }}</span>
      <span v-if="outcome.first.category.level" class="chip">{{ tl(LEVEL_TEXT[outcome.first.category.level]) }}</span>
      <span v-if="outcome.first.category.stage" class="chip">{{ tl(STAGE_TEXT[outcome.first.category.stage]) }}</span>
      <span class="chip muted">{{ tl('{0} 问', [nQuestions]) }}</span>
    </div>
    <p v-if="outcome.first.summary" class="summary">{{ outcome.first.summary }}</p>
    <details v-if="outcome.transcript" class="transcript" open>
      <summary>{{ tl('AI 从图片中读到的题目（请核对）') }}</summary>
      <textarea v-model="edited" class="field" rows="5" :aria-label="tl('图片转写')" />
      <button type="button" class="btn small" :disabled="edited.trim() === outcome.transcript" @click="emit('reread', edited)">{{ tl('按修改后的文字重新识别') }}</button>
    </details>
    <dl v-if="outcome.first.givens.length" class="givens">
      <template v-for="(g, i) in outcome.first.givens" :key="i">
        <dt>{{ g.name }}<span v-if="g.symbol" class="sym"> {{ g.symbol }}</span></dt>
        <dd>{{ g.value }} {{ g.unit }}<span v-if="g.raw" class="raw">“{{ g.raw }}”</span></dd>
      </template>
    </dl>
    <div v-if="outputs.length && !hideOutputs" class="outputs">
      <div v-for="o in outputs" :key="o.id" class="out"><span>{{ o.label }}</span><b>{{ fmtQ(o.value, o.unit) }}</b></div>
      <p class="note">{{ tl('数值由解析模型计算（公式引擎），不是 AI 给出的。') }}</p>
    </div>
    <ul v-if="outcome.assumptions.length || outcome.warnings.length" class="notes">
      <li v-for="(a, i) in outcome.assumptions" :key="'a' + i">{{ a }}</li>
      <li v-for="(w, i) in outcome.warnings" :key="'w' + i" class="warn">{{ w }}</li>
    </ul>
    <div v-for="(c, i) in outcome.clarifications" :key="'c' + i" class="clarify">
      <span>{{ c.question }}</span>
      <div class="opts"><button v-for="(op, k) in c.options" :key="k" type="button" class="btn small" @click="emit('clarify', `${c.question} → ${op}`)">{{ op }}</button></div>
    </div>
    <p class="foot">{{ tl('AI 只负责读题与建模；每个答案都由引擎计算并核对。') }} · {{ outcome.connection }} · {{ tl('{0} 次调用', [outcome.calls]) }}</p>
  </div>
</template>

<style scoped>
.ai-summary { display: grid; gap: 8px; font-size: var(--type-small); }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { padding: 2px 8px; border-radius: 999px; background: var(--fill); color: var(--text-2); }
.chip.route { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.chip.muted { background: transparent; border: 1px solid var(--separator); }
.summary { margin: 0; color: var(--text); font-size: var(--type-body); }
.transcript { display: grid; gap: 6px; }
.transcript summary { cursor: pointer; color: var(--text-2); }
.transcript textarea { width: 100%; resize: vertical; font: inherit; font-size: var(--type-small); line-height: 1.5; margin: 6px 0; }
.givens { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; margin: 0; }
.givens dt { color: var(--text-2); }
.givens dd { margin: 0; font-family: var(--font-mono); }
.sym { font-style: italic; }
.raw { margin-left: 8px; color: var(--text-3); font-family: var(--font-ui); }
.outputs { display: grid; gap: 2px; }
.out { display: flex; justify-content: space-between; gap: 12px; }
.out b { font-family: var(--font-mono); }
.notes { margin: 0; padding-left: 18px; color: var(--text-2); }
.notes .warn { color: var(--warning); }
.clarify { display: grid; gap: 4px; padding: 8px; border-radius: var(--radius-group); background: var(--warning-soft); }
.opts { display: flex; flex-wrap: wrap; gap: 4px; }
.note, .foot { margin: 0; color: var(--text-3); font-size: var(--type-tiny); }
</style>
