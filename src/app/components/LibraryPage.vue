<script setup lang="ts">
/**
 * Library page (26.63, D232; 26.64, D240): everything there is to open, in one place — templates, problems, the
 * misconception index, the classroom (the page of 26.63, now a section), elements and substances, the learning path,
 * the model catalogue, the curriculum map and the handbook. The galleries are the same components as their dialogs,
 * shown inside the page (`.embed-host` takes away the backdrop, the frame and the focus trap); they stay mounted once
 * visited, so switching between them keeps their search and selection.
 */
import { computed, defineAsyncComponent, provide, reactive, watch } from 'vue'
import { tl } from '../../i18n'
import { state } from '../store'
import type { LibrarySection } from '../store'
import { phone } from '../layout'
import { PAGE_ACTIVE } from '../live'
import { TEMPLATES } from '../../templates'
import { PROBLEM_COUNT } from '../../teaching/problemBank'
import { CASES } from '../../teaching/cases'
import Icon from './Icon.vue'
import TemplateGallery from './TemplateGallery.vue'
import ScopeTrace from './decor/ScopeTrace.vue'
const ProblemGallery = defineAsyncComponent(() => import('./ProblemGallery.vue'))
const ModelCatalog = defineAsyncComponent(() => import('./models/ModelCatalog.vue'))
const CurriculumDialog = defineAsyncComponent(() => import('./CurriculumDialog.vue'))
const LearningPath = defineAsyncComponent(() => import('./LearningPath.vue'))
const HandbookView = defineAsyncComponent(() => import('./HandbookView.vue'))
const CaseIndex = defineAsyncComponent(() => import('./CaseIndex.vue'))
// 26.64: the classroom section, and the mount point of elements and substances (a loading trace while they load)
const ClassroomSection = defineAsyncComponent({ loader: () => import('./ClassroomSection.vue'), loadingComponent: ScopeTrace, delay: 200 })
const MatterSection = defineAsyncComponent({ loader: () => import('./chem/MatterSection.vue'), loadingComponent: ScopeTrace, delay: 200 })

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })
provide(PAGE_ACTIVE, computed(() => props.active))

const SECTIONS = computed((): Array<{ id: LibrarySection; label: string; icon: string; note: string }> => [
  { id: 'templates', label: tl('模板'), icon: 'template', note: String(TEMPLATES.length) },
  { id: 'problems', label: tl('题目'), icon: 'problem', note: String(PROBLEM_COUNT) },
  { id: 'cases', label: tl('易错概念'), icon: 'target', note: String(CASES.length) },
  { id: 'classroom', label: tl('课堂'), icon: 'classroom', note: '' },
  { id: 'matter', label: tl('元素与物质'), icon: 'elements', note: '' },
  { id: 'path', label: tl('学习路径'), icon: 'graduation', note: '' },
  { id: 'models', label: tl('模型目录'), icon: 'layers', note: '' },
  { id: 'curriculum', label: tl('课程对照'), icon: 'report', note: '' },
  { id: 'handbook', label: tl('学习手册'), icon: 'book', note: '' }
])
/** Sections shown so far (kept mounted). */
const seen = reactive<Partial<Record<LibrarySection, boolean>>>({})
watch(() => [state.librarySection, props.active] as const, ([s, on]) => { if (on) seen[s] = true }, { immediate: true })
const on = (s: LibrarySection) => state.librarySection === s
</script>

<template>
  <div class="page-shell library" :class="{ phone }">
    <nav class="lnav" :aria-label="tl('资源库分区')">
      <button v-for="s in SECTIONS" :key="s.id" type="button" class="litem" :data-ui="`library-${s.id}`" :class="{ on: on(s.id) }" :aria-current="on(s.id) ? 'page' : undefined" @click="state.librarySection = s.id">
        <Icon :name="s.icon" :size="16" /><span class="grow">{{ s.label }}</span><span v-if="s.note" class="tiny muted num">{{ s.note }}</span>
      </button>
    </nav>
    <div class="lbody">
      <div v-if="seen.templates" v-show="on('templates')" class="embed-host"><TemplateGallery /></div>
      <div v-if="seen.problems" v-show="on('problems')" class="embed-host"><ProblemGallery /></div>
      <div v-if="seen.cases" v-show="on('cases')" class="plain"><CaseIndex /></div>
      <div v-if="seen.classroom" v-show="on('classroom')" class="plain"><ClassroomSection /></div>
      <div v-if="seen.matter" v-show="on('matter')" class="plain"><MatterSection /></div>
      <div v-if="seen.path" v-show="on('path')" class="embed-host"><LearningPath /></div>
      <div v-if="seen.models" v-show="on('models')" class="embed-host"><ModelCatalog /></div>
      <div v-if="seen.curriculum" v-show="on('curriculum')" class="embed-host"><CurriculumDialog /></div>
      <div v-if="seen.handbook" v-show="on('handbook')" class="plain pane reading"><div class="hb"><HandbookView /></div></div>
    </div>
  </div>
</template>

<style scoped>
.library { flex-direction: row; gap: 8px; padding: 0 8px 8px; }
.lnav { flex: 0 0 188px; display: flex; flex-direction: column; gap: 2px; padding: 8px; background: var(--pane); border-radius: var(--radius-panel); box-shadow: var(--elev-1); align-self: flex-start; }
.litem { display: flex; align-items: center; gap: 9px; height: calc(34px * var(--zoom)); padding: 0 10px; border: 0; border-radius: var(--radius-control); background: none; color: var(--text-2); font: inherit; font-size: var(--type-body); cursor: pointer; text-align: left; transition: background var(--dur-fast) ease, color var(--dur-fast) ease; }
.litem:hover { background: var(--hover); color: var(--text); }
.litem.on { background: var(--accent-soft); color: var(--accent); font-weight: var(--weight-strong); }
.litem .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lbody { flex: 1; min-width: 0; min-height: 0; position: relative; }
.lbody > * { position: absolute; inset: 0; }
.plain { overflow: auto; border-radius: var(--radius-panel); }
.plain.pane { display: block; }
.hb { padding: 16px 22px 28px; max-width: 980px; margin: 0 auto; }
/* Phones and narrow windows: the sections become a strip of chips above the content */
@media (max-width: 900px) {
  .library { flex-direction: column; gap: 6px; padding: 0 6px 6px; }
  .lnav { flex: 0 0 auto; flex-direction: row; align-self: stretch; overflow-x: auto; padding: 6px; scrollbar-width: none; }
  .lnav::-webkit-scrollbar { display: none; }
  .litem { flex: 0 0 auto; height: 36px; }
  .litem .num { display: none; }
  .hb { padding: 10px 12px 20px; }
}
</style>
