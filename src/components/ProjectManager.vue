<!-- 项目启动与管理：创建、打开、升级和选择项目模板。 -->
<template>
  <main class="project-manager">
    <header class="manager-header">
      <a class="identity" href="https://whitelists.top" target="_blank" rel="noreferrer"><NovaMark /><strong>Nova_A</strong></a>
      <nav :aria-label="libraryText.utilities">
        <select v-model="prefs.locale" :aria-label="t('language')"><option value="en">English</option><option value="de">Deutsch</option><option value="zh">中文</option></select>
        <UiButton class="manual-link" icon="help" @click="openBundledManual">{{ t('learnNova') }}</UiButton>
        <span class="version">{{ NOVA_RELEASE_NAME }}</span>
      </nav>
    </header>

    <section class="manager-shell">
      <div class="welcome">
        <div ref="welcomeIntro" class="welcome-intro">
          <svg class="welcome-motif" viewBox="0 0 240 240" fill="none" aria-hidden="true" focusable="false">
            <path class="motif-grid" d="M0 48H240M0 96H240M0 144H240M0 192H240M48 0V240M96 0V240M144 0V240M192 0V240" />
            <path class="motif-vector" d="M48 168L96 72L192 120L144 192L48 168ZM96 72L144 192M48 168L192 120" />
            <circle class="motif-node" cx="48" cy="168" r="5" /><circle class="motif-node" cx="96" cy="72" r="5" /><circle class="motif-node" cx="192" cy="120" r="5" /><circle class="motif-node" cx="144" cy="192" r="5" />
          </svg>
          <div class="welcome-brand"><NovaMark /><strong>Nova_A</strong></div>
          <p class="welcome-eyebrow">{{ t('projectManager') }}</p>
          <h1>{{ t('createSomethingPlayable') }}</h1>
          <p class="welcome-description">{{ launcherDescription }}</p>
        </div>
        <div ref="welcomeActions" class="quick-actions main-project-actions">
          <UiButton class="new-project" variant="primary" icon="add" :disabled="state.busy" @click="creationOpen = true">{{ t('newProject') }}</UiButton>
          <UiButton class="open-project" icon="folder" :disabled="state.busy" @click="chooseProject('open')">{{ t('openProject') }}</UiButton>
          <UiButton v-if="state.currentSnapshot" icon="forward" :disabled="state.busy" @click="continueCurrentProject">{{ t('continueProject') }}</UiButton>
        </div>
        <details class="more-project-actions" data-ui-motion-disclosure><summary>{{ moreActionsLabel }}</summary><div class="quick-actions"><button :disabled="state.busy" @click="chooseProject('add')">{{ t('addExistingProject') }}</button>
<button :disabled="state.busy" @click="chooseProject('migrate')">{{ t('migrateOlderProject') }}</button>
<button :disabled="state.busy" @click="chooseProject('archive')">{{ t('importArchive') }}</button>
<button v-if="state.rollbackAvailable" :disabled="state.busy" @click="downloadLastUpgradeRollback">{{ t('downloadRollback') }}</button></div></details>
        <p v-if="state.error" class="error" role="alert">{{ state.error }}</p>
      </div>

      <Teleport to="body"><UiMotionTransition modal><UiDialog motion-owner="parent" v-if="creationOpen" class="creation-dialog" :title="t('newProject')" @close="closeCreation"><section class="creation-card">
        <p v-if="state.error" class="error" role="alert">{{ state.error }}</p>
        <div class="creation-browse">
          <nav class="template-categories" role="tablist" :aria-label="t('templateCategories')">
            <button v-for="category in categories" :key="category" :data-template-category="category" type="button" role="tab" :aria-selected="selectedCategory === category" :class="{ active: selectedCategory === category }" @click="selectCategory(category)">
              <EditorIcon :name="categoryIcon[category]" /><strong>{{ categoryName(category) }}</strong><small>{{ templateCount(category) }}</small>
            </button>
          </nav>
          <div class="template-library-tools">
            <label class="template-search"><EditorIcon name="search" /><input v-model.trim="templateQuery" type="search" :aria-label="t('searchTemplates')" :placeholder="t('searchTemplatesPlaceholder')"></label>
            <select v-model="templateDifficulty" :aria-label="t('difficulty')"><option value="all">{{ t('allDifficulties') }}</option><option value="beginner">{{ t('beginner') }}</option><option value="intermediate">{{ t('intermediate') }}</option><option value="advanced">{{ t('advanced') }}</option></select>
            <select v-model="templateSort" :aria-label="libraryText.sort"><option value="catalog">{{ libraryText.catalog }}</option><option value="newest">{{ libraryText.newest }}</option><option value="name">{{ t('name') }}</option><option value="time">{{ libraryText.quickest }}</option></select>
          </div>
        </div>
        <div class="template-results"><span role="status" aria-live="polite">{{ selectedCategory === 'all' ? libraryText.browse : categoryDescription(selectedCategory) }} · {{ libraryText.results.replace('{count}', String(visibleTemplates.length)).replace('{total}', String(templates.length)) }}</span><button type="button" @click="resetTemplateFilters">{{ libraryText.reset }}</button></div>
        <div class="creation-library"><div class="template-grid">
          <button v-for="template in visibleTemplates" :key="template.id" :data-template-id="template.id" :class="{ selected: selectedTemplate === template.id }" :aria-pressed="selectedTemplate === template.id" @click="selectedTemplate = template.id" @dblclick="create">
            <span class="template-preview"><img :src="templatePreview(template.id)" :alt="`${libraryText.previewOf} ${templateName(template.id, template.name)}`" loading="lazy" width="640" height="360"><small>{{ libraryText.preview }}</small></span>
            <strong>{{ templateName(template.id, template.name) }}</strong>
            <small>{{ templateDescription(template.id, template.description) }}</small>
            <span class="template-requirements" :aria-label="libraryText.requirements"><span v-for="requirement in templateGuide(template.id, prefs.locale).requirements" :key="requirement">{{ requirement }}</span></span>
            <span class="feature-list">{{ templateFeatures(template.id, template.features).join(' · ') }}</span>
            <span class="template-meta"><b>{{ t(template.difficulty) }}</b><span>{{ t('setupMinutes', { count: template.setupMinutes }) }}</span><span v-if="template.classic" class="template-classic" data-template-classic>{{ t('templateClassic') }}</span></span>
          </button>
          <p v-if="!visibleTemplates.length" class="template-empty">{{ t('noMatchingTemplates') }}</p>
        </div>
        <section v-if="selectedTemplateRecord && selectedGuide" class="template-details" :aria-label="t('templateDetails')">
          <img class="detail-preview" :src="templatePreview(selectedTemplateRecord.id)" alt="" width="640" height="360">
          <header><strong>{{ templateName(selectedTemplateRecord.id, selectedTemplateRecord.name) }}</strong><small>{{ t(selectedTemplateRecord.difficulty) }} · {{ t('setupMinutes', { count: selectedTemplateRecord.setupMinutes }) }}</small></header>
          <p class="detail-description">{{ templateDescription(selectedTemplateRecord.id, selectedTemplateRecord.description) }}</p>
          <p class="selected-requirements">{{ selectedGuide.requirements.join(' · ') }}</p><p>{{ templateFeatures(selectedTemplateRecord.id, selectedTemplateRecord.features).join(' · ') }}</p><p v-if="selectedGuide.foundation" class="template-foundation">{{ libraryText.foundation }}: {{ templateName(selectedGuide.foundation, selectedGuide.foundation) }}</p>
          <div class="template-instructions"><section><h3>{{ libraryText.controls }}</h3><p>{{ selectedGuide.controls }}</p></section><section><h3>{{ libraryText.expected }}</h3><p>{{ selectedGuide.expected }}</p></section></div>
          <nav class="template-help" :aria-label="t('documentation')"><button type="button" :aria-label="`${libraryText.guide}: ${templateName(selectedTemplateRecord.id, selectedTemplateRecord.name)}`" @click="openTemplateManual(selectedGuide.manualSection)"><EditorIcon name="help" />{{ libraryText.guide }}</button><button type="button" :aria-label="`${libraryText.task}: ${templateName(selectedTemplateRecord.id, selectedTemplateRecord.name)}`" @click="openTemplateManual(selectedGuide.taskSection)"><EditorIcon name="learn" />{{ libraryText.task }}</button></nav>
          <small>{{ libraryText.captureHint }}</small>
        </section>
        </div>
      </section>
      <template #footer>
        <!-- Name, location and the primary action stay pinned below the library at every window height. -->
        <div class="creation-fields">
          <label><span>{{ t('projectName') }}</span><input v-model="projectName" maxlength="80" @keydown.enter="create"></label>
          <label class="project-location"><span>{{ t('projectLocation') }}</span><input v-model.trim="projectLocation" maxlength="500" :aria-invalid="Boolean(pathError)" :title="pathError || t('projectFolderHint')"></label>
          <small class="location-hint" :class="{ 'path-error': pathError }">{{ pathError || t('projectFolderHint') }}</small>
        </div>
        <p class="template-selection" aria-live="polite">{{ selectedTemplateRecord ? `${libraryText.selected}: ${templateName(selectedTemplateRecord.id, selectedTemplateRecord.name)}` : t('noMatchingTemplates') }}</p>
        <UiButton class="cancel-button" @click="closeCreation">{{ t('cancel') }}</UiButton>
        <UiButton class="create-button" variant="primary" icon="add" :disabled="state.busy || Boolean(pathError) || !projectName.trim() || !selectedTemplateRecord" :title="pathError" @click="create">{{ state.busy ? t('preparingProject') : t('createProject') }}</UiButton>
      </template>
      </UiDialog></UiMotionTransition></Teleport>

      <section class="recents-card">
        <header><div><span>{{ t('recentProjects') }}</span><strong>{{ state.recents.length }}</strong></div><small>{{ t('recentProjectsHint') }}</small></header>
        <div v-if="state.recents.length" class="recent-list">
          <article v-for="recent in state.recents" :key="recent.id">
            <button class="recent-main" :disabled="state.busy || !recent.snapshot" @click="openRecentProject(recent.id)">
              <span class="recent-mark">{{ recent.name.slice(0, 1).toUpperCase() }}</span>
              <span><strong>{{ recent.name }}</strong><small>{{ recent.template }} · {{ formatDate(recent.updatedAt) }}</small></span>
              <em>{{ recent.snapshot ? t('open') : t('selectFileRequired') }}</em>
            </button>
            <UiButton class="remove-recent" icon="close" :label="t('removeRecent')" @click="removeRecentProject(recent.id)" />
          </article>
        </div>
        <div v-else class="empty-recents"><EditorIcon name="folder" /><p>{{ t('noRecentProjects') }}</p></div>
      </section>
    </section>

    <footer><span>{{ t('managerFooter') }}</span><a href="https://github.com/Stevenzhang543/Nova_A/" target="_blank" rel="noreferrer">GitHub</a></footer>
    <UiMotionTransition modal><UiDialog motion-owner="parent" v-if="state.pendingUpgrade" :title="t('projectUpgrade')" @close="cancelPendingProjectUpgrade"><section class="upgrade-dialog">
        <div class="upgrade-flow"><strong>{{ state.pendingUpgrade.preview.sourceEngine }} · Schema {{ state.pendingUpgrade.preview.sourceSchema }}</strong><span>→</span><strong>{{ state.pendingUpgrade.preview.targetEngine }} · Schema {{ state.pendingUpgrade.preview.targetSchema }}</strong></div>
        <div class="compatibility-summary"><strong>{{ state.pendingUpgrade.preview.projectName }}</strong><small>{{ state.pendingUpgrade.preview.projectFormat }} · Engine {{ state.pendingUpgrade.preview.engineCompatibility }}</small></div>
        <div class="upgrade-stats"><span>{{ t('scenes') }} <b>{{ state.pendingUpgrade.preview.sceneCount }}</b></span><span>{{ t('entities') }} <b>{{ state.pendingUpgrade.preview.entityCount }}</b></span><span>{{ t('assets') }} <b>{{ state.pendingUpgrade.preview.assetCount }}</b></span></div>
        <section class="preflight"><strong>{{ t('preflightReport') }}</strong><div v-for="check in state.pendingUpgrade.preview.preflight" :key="check.id" :class="check.status"><EditorIcon :name="check.status === 'passed' ? 'check' : check.status === 'blocked' ? 'close' : check.status === 'warning' ? 'warning' : 'more'" /><p><b>{{ localizedPreflightLabel(check.id) }}</b><small>{{ localizedPreflightDetail(check.id, check.status) }}</small></p></div></section>
        <section v-if="state.pendingUpgrade.preview.warnings.length" class="migration-warnings"><ul><li v-for="warning in state.pendingUpgrade.preview.warnings" :key="warning">{{ warning }}</li></ul><button @click="openBundledManual('migration')">{{ t('documentation') }}</button></section>
        <section v-if="state.pendingUpgrade.preview.packageProblems.length" class="package-audit"><strong>{{ t('packageAudit') }}</strong><p v-for="problem in state.pendingUpgrade.preview.packageProblems" :key="problem">{{ problem }}</p></section>
        <details data-ui-motion-disclosure v-if="state.pendingUpgrade.preview.migrationSteps.length" class="migration-steps"><summary>{{ t('migrationPlan') }} · {{ state.pendingUpgrade.preview.migrationSteps.length }}</summary><ol><li v-for="step in state.pendingUpgrade.preview.migrationSteps" :key="`${step.fromSchema}:${step.toSchema}:${step.name}`">{{ step.fromSchema }} → {{ step.toSchema }} · {{ step.name }}</li></ol></details>
        <label v-if="state.pendingUpgrade.preview.requiresMigration" class="backup-choice"><input checked disabled type="checkbox"><span>{{ t('backupBeforeUpgradeRequired') }}</span></label>
        <p>{{ t('upgradeAtomicHint') }}</p>
        <p v-if="state.lockConflict" class="lock-warning">{{ t('projectLockedBy',{owner:state.lockConflict.owner,time:new Date(state.lockConflict.expiresAt).toLocaleString()}) }}</p>
<!-- 项目迁移预检回调检测阻断项，用于禁止不可执行的打开操作。 -->        <footer><button @click="cancelPendingProjectUpgrade">{{ t('cancel') }}</button><button v-if="state.lockConflict" @click="migrateAndOpen(true)">{{ t('openReadOnly') }}</button><button class="primary" :disabled="state.pendingUpgrade.preview.preflight.some(check => check.status === 'blocked') || Boolean(state.lockConflict)" @click="migrateAndOpen(false)">{{ state.pendingUpgrade.preview.requiresMigration ? t('migrateAndOpen') : t('openProject') }}</button></footer>
      </section>
    </UiDialog></UiMotionTransition>
    <UiMotionTransition modal><UiDialog motion-owner="parent" v-if="state.readOnlyDocument" :title="t('readOnlyCompatibility')" @close="closeReadOnlyDocument"><section class="upgrade-dialog read-only-dialog">
        <p>{{ t('readOnlyCompatibilityHint', { schema: state.readOnlyDocument.preview.sourceSchema, supported: state.readOnlyDocument.preview.targetSchema }) }}</p>
        <textarea readonly :value="state.readOnlyDocument.source"></textarea>
        <footer><button @click="closeReadOnlyDocument">{{ t('close') }}</button><button class="primary" @click="downloadReadOnlyDocument">{{ t('downloadOriginal') }}</button></footer>
      </section>
    </UiDialog></UiMotionTransition>
    <input ref="openInput" hidden type="file" accept=".nova,.json,application/json" @change="readFile($event, false)">
    <input ref="importInput" hidden type="file" accept=".nova,.json,application/json" @change="readFile($event, true)">
    <input ref="migrationInput" hidden type="file" accept=".nova,.json,application/json" @change="readFile($event, false)">
    <input ref="archiveInput" hidden type="file" accept=".zip,.nova-archive,application/zip" @change="readArchive">
  </main>
</template>

<script setup lang="ts">
import UiMotionTransition from '../ui/components/UiMotionTransition.vue'

import UiDialog from '../ui/components/UiDialog.vue'
import UiButton from '../ui/components/UiButton.vue'
import NovaMark from '../ui/components/NovaMark.vue'
import EditorIcon, { type EditorIconName } from './EditorIcon.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { animatePresence, cancelMotion } from '../ui/motion'
import { t } from '../i18n'
import { preferencesState as prefs } from '../store/preferences'
import { applyPendingProjectUpgrade, cancelPendingProjectUpgrade, closeReadOnlyDocument, continueCurrentProject, createNewProject, downloadLastUpgradeRollback, downloadReadOnlyDocument, openProjectDocument, openRecentProject, projectManagerState as state, removeRecentProject } from '../projects/projectManager'
import { PROJECT_TEMPLATE_CATEGORIES, PROJECT_TEMPLATES as templates, type ProjectTemplateCategory, type ProjectTemplateId } from '../projects/templates'
import { discoverTemplates } from '../projects/templateDiscovery'
import { templateGuide } from '../projects/templateGuides'
import { openBundledManual } from '../runtime/openManual'
import { completeTask, failTask, startTask } from '../runtime/editorFeedback'
import { watchProjectFile } from '../runtime/projectExternalChanges'
import { readProjectArchive } from '../projects/projectArchive'
import { NOVA_RELEASE_NAME } from '../projects/projectFormat'

const creationOpen = ref(false)
const welcomeIntro = ref<HTMLElement | null>(null), welcomeActions = ref<HTMLElement | null>(null)
const launcherDescription = computed(() => ({ en: 'A 2D physics and game engine.', de: 'Eine 2D-Physik- und Spiele-Engine.', zh: '二维物理与游戏引擎。' }[prefs.locale]))
onMounted(() => {
  for (const element of [welcomeIntro.value, welcomeActions.value]) if (element) {
    const distance = Number.parseFloat(getComputedStyle(element).getPropertyValue('--space-tight')) || 0
    animatePresence(element, 'enter', undefined, { preset: 'smooth', duration: 'emphasized', distance, scale: 1 })
  }
})
onBeforeUnmount(() => { for (const element of [welcomeIntro.value, welcomeActions.value]) if (element) cancelMotion(element) })
const moreActionsLabel = computed(/** 按偏好语言返回更多项目操作标签。 */ () => ({ en: 'More project actions', de: 'Weitere Projektaktionen', zh: '更多项目操作' }[prefs.locale]))
/** 仅在没有忙碌操作时关闭创建面板。 */ function closeCreation() { if (!state.busy) creationOpen.value = false }
const projectName = ref('My Game')
const projectLocation = ref('Projects/My Game')
// The suggested folder follows the name until the user edits the location themselves.
let suggestedLocation = projectLocation.value
watch(projectName, name => {
  if (projectLocation.value !== suggestedLocation) return
  const folder = name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').replace(/[. ]+$/g, '').trim()
  projectLocation.value = suggestedLocation = `Projects/${folder || 'My Game'}`
})
const selectedTemplate = ref<ProjectTemplateId | null>('empty')
const selectedCategory = ref<ProjectTemplateCategory | 'all'>('all')
const categories = ['all', ...PROJECT_TEMPLATE_CATEGORIES] as const
const templateQuery = ref('')
const templateDifficulty = ref<'all' | 'beginner' | 'intermediate' | 'advanced'>('all')
const templateSort = ref<'catalog' | 'name' | 'time' | 'newest'>('catalog')
const libraryText = computed(/** 按偏好语言返回模板库浏览、筛选和说明文案。 */ () => ({
  en: { browse: 'Browse all starters, or narrow the library by category, difficulty, and search.', sort: 'Sort by', catalog: 'Catalog order', newest: 'Newest first', quickest: 'Quickest setup', results: '{count} of {total} templates', reset: 'Reset filters', selected: 'Create from', utilities: 'Project manager utilities', preview: 'Runtime preview', previewOf: 'Runtime preview of', controls: 'Controls and setup', expected: 'Expected result', requirements: 'Requirements', guide: 'Feature manual', task: 'Related task', foundation: 'Uses the complete foundation', captureHint: 'Captured from the running Game view. Colors and motion may vary by renderer and frame.' },
  de: { browse: 'Alle Vorlagen durchsuchen oder nach Kategorie, Schwierigkeit und Suchbegriff filtern.', sort: 'Sortieren', catalog: 'Katalogreihenfolge', newest: 'Neueste zuerst', quickest: 'Schnellster Einstieg', results: '{count} von {total} Vorlagen', reset: 'Filter zurücksetzen', selected: 'Erstellen aus', utilities: 'Projektmanager-Werkzeuge', preview: 'Laufzeitvorschau', previewOf: 'Laufzeitvorschau von', controls: 'Steuerung und Einrichtung', expected: 'Erwartetes Ergebnis', requirements: 'Voraussetzungen', guide: 'Funktionshandbuch', task: 'Verwandte Aufgabe', foundation: 'Nutzt die vollständige Grundlage', captureHint: 'Aus der laufenden Spielansicht aufgenommen. Farben und Bewegung können je nach Renderer und Frame variieren.' },
  zh: { browse: '浏览所有模板，或按分类、难度和关键词筛选。', sort: '排序方式', catalog: '目录顺序', newest: '最新优先', quickest: '最快上手', results: '{count} / {total} 个模板', reset: '重置筛选', selected: '使用模板', utilities: '项目管理工具', preview: '运行时预览', previewOf: '运行时预览：', controls: '操作与准备', expected: '预期结果', requirements: '使用要求', guide: '功能手册', task: '相关任务', foundation: '使用完整基础项目', captureHint: '截图来自正在运行的游戏视口；颜色与运动效果可能因渲染器和帧而异。' }
}[prefs.locale]))
const openInput = ref<HTMLInputElement | null>(null)
const importInput = ref<HTMLInputElement | null>(null)
const migrationInput = ref<HTMLInputElement | null>(null)
const archiveInput = ref<HTMLInputElement | null>(null)

const categoryIcon: Record<ProjectTemplateCategory | 'all', EditorIconName> = { all: 'grid', rhythm: 'audio', scene: 'design', test: 'physics', game: 'play' }

/** 优先使用模板内嵌本地化名称，再尝试翻译键，最后使用默认名称。 */ function templateName(id: ProjectTemplateId, fallback: string): string { const translated = templates.find(/* 比较 value.id 与 id，返回严格相等的判断结果。 */ value => value.id === id)?.localized?.[prefs.locale as 'de' | 'zh']; if (translated) return translated.name; const key = `template_${id}_name`, localized = t(key); return localized && localized !== key ? localized : fallback }
/** 优先使用模板内嵌本地化摘要，再尝试翻译键，最后使用默认摘要。 */ function templateDescription(id: ProjectTemplateId, fallback: string): string { const translated = templates.find(/* 比较 value.id 与 id，返回严格相等的判断结果。 */ value => value.id === id)?.localized?.[prefs.locale as 'de' | 'zh']; if (translated) return translated.description; const key = `template_${id}_description`, localized = t(key); return localized && localized !== key ? localized : fallback }
/** 将有效本地化功能文本按竖线拆分，否则保留默认功能列表。 */ function templateFeatures(id: ProjectTemplateId, fallback: string[]): string[] { const key = `template_${id}_features`, localized = t(key); return localized && localized !== key ? localized.split('|') : fallback }
/* 根据 category === 'all' 的真假，分别返回 t('all') 或 t(`templateCategory_${category}`)。 */ function categoryName(category: ProjectTemplateCategory | 'all'): string { return category === 'all' ? t('all') : t(`templateCategory_${category}`) }
/* 调用 t(`templateCategory_${category}_description`) 并返回调用结果。 */ function categoryDescription(category: ProjectTemplateCategory): string { return t(`templateCategory_${category}_description`) }
/** 返回全部模板数或指定类别模板数。 */ function templateCount(category: ProjectTemplateCategory | 'all'): number { return category === 'all' ? templates.length : templates.filter(/* 比较 template.category 与 category，返回严格相等的判断结果。 */ template => template.category === category).length }
/** 更新模板类别筛选项。 */ function selectCategory(category: ProjectTemplateCategory | 'all'): void {
  selectedCategory.value = category
}
const visibleTemplates = computed(/** 根据类别、难度、搜索、排序和语言发现模板，并提供本地化可检索文本。 */ () => discoverTemplates(templates, { category: selectedCategory.value, difficulty: templateDifficulty.value, query: templateQuery.value, sort: templateSort.value, locale: prefs.locale }, /** 组合模板名称、说明、功能、操作、预期结果和要求作为搜索文本。 */ template => `${templateName(template.id, template.name)} ${templateDescription(template.id, template.description)} ${templateFeatures(template.id, template.features).join(' ')} ${templateGuide(template.id, prefs.locale).controls} ${templateGuide(template.id, prefs.locale).expected} ${templateGuide(template.id, prefs.locale).requirements.join(' ')}`))
watch(visibleTemplates, /** 当前模板已不在可见结果中时选中首项或清空选择。 */ visible => { if (!visible.some(/* 比较 template.id 与 selectedTemplate.value，返回严格相等的判断结果。 */ template => template.id === selectedTemplate.value)) selectedTemplate.value = visible[0]?.id ?? null }, { flush: 'sync' })
const selectedTemplateRecord = computed(/** 查找当前已选且可见的模板记录。 */ () => visibleTemplates.value.find(/* 比较 template.id 与 selectedTemplate.value，返回严格相等的判断结果。 */ template => template.id === selectedTemplate.value))
const selectedGuide = computed(/* 根据 selectedTemplateRecord.value 的真假，分别返回 templateGuide(selectedTemplateRecord.value.id, prefs.locale) 或 null。 */ () => selectedTemplateRecord.value ? templateGuide(selectedTemplateRecord.value.id, prefs.locale) : null)
const previews = import.meta.glob('../assets/template-previews/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
/* 当 previews[`../assets/template-previews/${id}.png`] 为 null 或 undefined 时返回 ''，否则保留左侧值。 */ function templatePreview(id: ProjectTemplateId): string { return previews[`../assets/template-previews/${id}.png`] ?? '' }
/** 按当前语言和章节打开内置模板手册。 */ function openTemplateManual(section: string): void { openBundledManual(`${prefs.locale === 'zh' ? 'zh-CN' : prefs.locale}-${section}`) }
/** 重置模板类别、难度、搜索和排序条件。 */ function resetTemplateFilters(): void { selectedCategory.value = 'all'; templateDifficulty.value = 'all'; templateQuery.value = ''; templateSort.value = 'catalog' }
const pathError = computed(/** 校验项目位置非空、无非法字符或父目录跳转，且不使用 Windows 保留设备名。 */ () => {
  const value = projectLocation.value.trim()
  if (!value) return t('projectLocationRequired')
  if (/[<>"|?*\u0000-\u001f]/.test(value) || /(^|[\\/])\.\.([\\/]|$)/.test(value)) return t('projectLocationInvalid')
  if (/(^|[\\/])(con|prn|aux|nul|com[1-9]|lpt[1-9])([.\\/]|$)/i.test(value)) return t('projectLocationReserved')
  return ''
})
/** 未忙碌且路径、名称和模板均有效时发起项目创建。 */ function create(): void { if (!state.busy && !pathError.value && projectName.value.trim() && selectedTemplateRecord.value) void createNewProject(projectName.value, selectedTemplateRecord.value.id, projectLocation.value) }
/** 根据打开模式选择压缩包或项目文件，优先使用文件句柄 API 并按需监视打开文件；不支持时使用文件输入。 */ async function chooseProject(mode:'open'|'add'|'migrate'|'archive'):Promise<void>{
  if(mode==='archive'){archiveInput.value?.click();return}
  const picker=(window as unknown as {showOpenFilePicker?: (options:unknown)=>Promise<Array<{getFile():Promise<File>}>>}).showOpenFilePicker
  if(picker){try{const projectHandle=(await picker({multiple:false,types:[{description:'Nova_A Project',accept:{'application/json':['.nova','.json']}}]}))[0];if(!projectHandle)return;const file=await projectHandle.getFile();await openProjectDocument(await file.text(),file.name,mode==='add');if(mode==='open')await watchProjectFile(projectHandle)}catch(error){if(!(error instanceof DOMException&&error.name==='AbortError'))state.error=error instanceof Error?error.message:String(error)};return}
  ;(mode==='add'?importInput:mode==='migrate'?migrationInput:openInput).value?.click()
}
/** 对待升级项目启动任务，执行升级或只读打开并记录成功或失败。 */ async function migrateAndOpen(readOnly=false): Promise<void> {
  const pending = state.pendingUpgrade
  if (!pending) return
  const task = startTask(t('projectUpgrade'), { detail: `Schema ${pending.preview.sourceSchema} → ${pending.preview.targetSchema}` })
  try {
    if (!await applyPendingProjectUpgrade(readOnly)) throw new Error(state.error || t('operationFailed'))
    completeTask(task, t('upgradeComplete'))
  } catch (error) { failTask(task, error) }
}
/** 将有效日期按偏好语言格式显示，解析失败保留原文本。 */ function formatDate(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(prefs.locale === 'zh' ? 'zh-CN' : prefs.locale) }

/* 调用 t(`preflight_${id}_label`) 并返回调用结果。 */ function localizedPreflightLabel(id: string): string { return t(`preflight_${id}_label`) }
/** 按预检项及状态生成文档、格式、版本、包、备份和验证说明，未知项回退原详情。 */ function localizedPreflightDetail(id: string, status: string): string {
  const preview = state.pendingUpgrade?.preview
  if (!preview) return ''
  if (id === 'document') return t('preflight_document_detail')
  if (id === 'format') return t(status === 'blocked' ? 'preflight_format_blocked' : 'preflight_format_ok', { format: preview.projectFormat, schema: preview.sourceSchema })
  if (id === 'schema') return t(status === 'blocked' ? 'preflight_schema_blocked' : 'preflight_schema_ok', { source: preview.sourceSchema, target: preview.targetSchema })
  if (id === 'engine') return t(status === 'blocked' ? 'preflight_engine_blocked' : 'preflight_engine_ok', { range: preview.engineCompatibility, engine: preview.targetEngine })
  if (id === 'packages') return t(preview.packageProblems.length ? 'preflight_packages_warning' : 'preflight_packages_ok', { count: preview.packageProblems.length })
  if (id === 'backup') return t('preflight_backup_detail')
  if (id === 'validation') return t(status === 'blocked' ? 'preflight_validation_blocked' : 'preflight_validation_pending')
  return preview.preflight.find(/* 比较 check.id 与 id，返回严格相等的判断结果。 */ check => check.id === id)?.detail ?? id
}

/** 读取选中文件并设置成功或失败回调，启动读取后清空文件输入。 */ function readFile(event: Event, asCopy: boolean): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = /** 文件读取为字符串时按指定副本模式打开项目文档。 */ () => { if (typeof reader.result === 'string') void openProjectDocument(reader.result, file.name, asCopy) }
  reader.onerror = /** 读取失败时显示具体错误或本地化默认提示。 */ () => { state.error = reader.error?.message ?? t('fileReadFailed') }
  reader.readAsText(file)
  input.value = ''
}
/** 以任务方式检查并导入项目归档为副本，显示已检查条目数，失败记录错误，最后清空输入。 */ async function readArchive(event:Event):Promise<void>{const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;const task=startTask(t('importArchive'),{detail:file.name,progress:null});try{const archive=await readProjectArchive(file);await openProjectDocument(archive.source,archive.entry,true);completeTask(task,`${archive.entries} archive entries checked.`)}catch(error){state.error=error instanceof Error?error.message:String(error);failTask(task,error)}finally{input.value=''}}
</script>

<style scoped>
.project-manager { height: 100%; min-height: 0; display: flex; flex-direction: column; background: var(--surface-app); color: var(--text-primary); overflow: auto; }
.manager-header { display: flex; justify-content: space-between; align-items: center; gap: var(--space-4); min-height: var(--ui-titlebar-height); padding: 0 var(--space-3) 0 var(--space-4); border-bottom: var(--ui-border-width) solid var(--border-separator); background: var(--surface-1); flex: none; }
.identity { display: flex; align-items: center; gap: var(--space-2); text-decoration: none; color: var(--text-primary); font-size: var(--type-section); }
.identity:hover { text-decoration: none; }
.manager-header nav { display: flex; align-items: center; gap: var(--space-2); min-width: 0; flex-wrap: wrap; justify-content: flex-end; }
.manager-header select { width: auto; }
.manual-link { color: var(--text-secondary); }
.version { padding: 0 var(--space-2); border-radius: var(--radius-pill); background: var(--surface-3); color: var(--text-muted); font-size: var(--type-caption); white-space: nowrap; }
.manager-shell { width: min(1040px, 100%); margin-inline: auto; display: grid; grid-template-columns: minmax(0, 320px) minmax(0, 1fr); gap: var(--space-8); padding: clamp(var(--space-5), 6vh, var(--space-launch-large)) var(--space-6) var(--space-6); flex: 1; align-content: start; }
.welcome { min-width: 0; display: flex; flex-direction: column; }
.welcome-intro { position: relative; isolation: isolate; overflow: hidden; display: grid; gap: var(--space-2); padding: var(--space-6); border-radius: var(--radius-launch); background: var(--brand-gradient); box-shadow: inset 0 0 0 var(--ui-border-width) var(--border-separator), var(--shadow-sm); }
.welcome-intro > :not(.welcome-motif) { position: relative; z-index: 1; }
.welcome-brand { display: flex; align-items: center; gap: var(--space-3); margin-block-end: var(--space-2); }
.welcome-brand .nova-mark { inline-size: var(--ui-brand-hero-size); block-size: var(--ui-brand-hero-size); border-radius: 10px; }
.welcome-brand strong { font-family: var(--font-display); font-size: var(--type-page); }
.welcome-eyebrow { color: var(--text-muted); font-size: var(--type-caption); }
.welcome h1 { font-family: var(--font-display); font-size: calc(26px * var(--ui-scale)); font-weight: var(--weight-strong); line-height: var(--line-hero); letter-spacing: -0.01em; overflow-wrap: anywhere; text-wrap: balance; }
.welcome-description { color: var(--text-secondary); font-size: var(--type-body); line-height: var(--line-body); }
.welcome-motif { position: absolute; z-index: 0; inset-block-start: calc(-1 * var(--space-3)); inset-inline-end: calc(-1 * var(--space-6)); inline-size: var(--ui-launcher-motif-size); block-size: var(--ui-launcher-motif-size); max-inline-size: 80%; opacity: var(--brand-motif-opacity); pointer-events: none; }
.motif-grid { stroke: var(--brand-line); stroke-width: 1; opacity: .45; }
.motif-vector { stroke: var(--brand-line); stroke-width: 1.5; }
.motif-node { fill: var(--brand-accent); }
.quick-actions { display: flex; flex-direction: column; gap: var(--space-1); margin-block: var(--space-4) var(--space-3); }
.quick-actions button { text-align: left; justify-content: flex-start; }
.main-project-actions > button { min-height: var(--control-launcher); padding-inline: var(--space-3); font-size: var(--type-body); }
.main-project-actions > button:not(.new-project) { background: var(--surface-1); box-shadow: inset 0 0 0 var(--ui-border-width) var(--border-separator); }
.main-project-actions > button:not(.new-project):hover:not(:disabled) { background: var(--surface-hover); }
.more-project-actions { padding-block-start: var(--space-2); border-top: var(--ui-border-width) solid var(--border-separator); }
.more-project-actions > summary { display: flex; align-items: center; color: var(--text-muted); font-size: var(--type-dense); font-weight: var(--weight-regular); }
.more-project-actions > summary { list-style: none; gap: var(--space-2); }
.more-project-actions > summary::-webkit-details-marker { display: none; }
.more-project-actions > summary::before { content: ''; width: 5px; height: 5px; margin-inline: 3px 2px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; rotate: -45deg; transition: rotate var(--motion-fast) var(--ease-smooth); }
.more-project-actions[open] > summary::before { rotate: 45deg; }
.more-project-actions .quick-actions { margin-block: var(--space-1) 0; }
.more-project-actions .quick-actions button { font-weight: var(--weight-regular); color: var(--text-secondary); }
.recents-card { min-width: 0; display: flex; flex-direction: column; }
.recents-card > header { display: flex; justify-content: space-between; gap: var(--space-2); align-items: baseline; flex-wrap: wrap; padding-block: var(--space-1) var(--space-3); }
.recents-card > header > div { display: flex; gap: var(--space-2); align-items: baseline; font-size: var(--type-page); font-weight: var(--weight-strong); font-family: var(--font-display); }
.recents-card > header > div > strong { min-width: 22px; padding: 0 7px; border-radius: var(--radius-pill); background: var(--surface-3); font-size: var(--type-caption); color: var(--text-muted); font-family: var(--font-ui); text-align: center; }
.recents-card > header small { flex-basis: 100%; color: var(--text-muted); font-size: var(--type-caption); }
.recent-list { display: grid; gap: 2px; padding: var(--space-1); border-radius: var(--radius-lg); background: var(--surface-1); box-shadow: inset 0 0 0 var(--ui-border-width) var(--border-separator); }
.recent-list > article { position: relative; display: flex; align-items: center; gap: var(--space-1); }
.recent-main { flex: 1; min-width: 0; display: grid; grid-template-columns: calc(36px * var(--ui-scale)) minmax(0,1fr) auto; gap: var(--space-3); align-items: center; min-height: calc(52px * var(--ui-scale)); text-align: left; padding: var(--space-2) var(--space-3); border: 0; border-radius: var(--radius-md); background: transparent; font-weight: var(--weight-regular); }
.recent-main:hover:not(:disabled) { background: var(--surface-hover); }
.recent-mark { display: grid; place-items: center; inline-size: calc(36px * var(--ui-scale)); block-size: calc(36px * var(--ui-scale)); color: var(--accent-contrast); background: linear-gradient(150deg, color-mix(in srgb, var(--color-primary) 80%, white), var(--color-primary)); border-radius: 9px; font-weight: var(--weight-strong); box-shadow: var(--shadow-xs); }
.recent-main strong, .recent-main small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recent-main strong { font-weight: var(--weight-medium); }
.recent-main small, .recent-main em { color: var(--text-muted); font-size: var(--type-caption); font-style: normal; }
.recent-main em { padding: 2px var(--space-2); border-radius: var(--radius-pill); opacity: 0; transition: opacity var(--motion-micro) var(--ease-standard); }
.recent-main:hover em, .recent-main:focus-visible em { opacity: 1; background: var(--accent-fill); color: var(--accent-contrast); }
.remove-recent { color: var(--text-muted); opacity: 0; transition: opacity var(--motion-micro) var(--ease-standard); }
.recent-list > article:hover .remove-recent, .remove-recent:focus-visible { opacity: 1; }
.empty-recents { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-2); min-height: calc(220px * var(--ui-scale)); padding: var(--ui-empty-inset); border-radius: var(--radius-lg); border: 1px dashed var(--border-subtle); color: var(--text-muted); font-size: var(--type-body); text-align: center; }
.empty-recents > .editor-icon { width: 28px; height: 28px; color: var(--text-tertiary); }
.empty-recents p { max-inline-size: 40ch; overflow-wrap: anywhere; }
.project-manager > footer { display: flex; justify-content: space-between; gap: var(--space-4); padding: var(--space-2) var(--space-4); border-top: var(--ui-border-width) solid var(--border-separator); font-size: var(--type-caption); color: var(--text-muted); }

/* New Project: browse on top, the decision (name, location, Create) pinned in the footer. */
.creation-dialog :deep(.ui-dialog) { width: min(1100px, 100%); height: min(780px, calc(100dvh - 2 * var(--space-5))); max-height: none; }
.creation-dialog :deep(.ui-dialog-body) { flex: 1; display: flex; padding: 0; overflow: hidden; }
.creation-dialog :deep(.ui-dialog-footer) { justify-content: flex-start; flex-wrap: wrap; gap: var(--space-2) var(--space-3); padding-block: var(--space-3); }
.creation-card { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3) var(--ui-dialog-inset) 0; }
.creation-browse { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.template-categories { display: flex; gap: 2px; padding: 2px; border-radius: calc(var(--radius-control) + 2px); background: var(--surface-inset); overflow-x: auto; scrollbar-width: none; flex: none; }
.template-categories button { display: flex; align-items: center; gap: var(--space-2); flex: none; min-height: calc(var(--ui-control-height) - 2px); padding-inline: var(--space-3); border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-muted); }
.template-categories button strong { font-weight: var(--weight-medium); }
.template-categories button.active { background: var(--surface-raised); color: var(--text-primary); box-shadow: var(--shadow-xs); }
.template-categories small { color: var(--text-tertiary); font-size: var(--type-caption); font-variant-numeric: tabular-nums; }
.template-categories .editor-icon { width: 14px; height: 14px; }
.template-library-tools { display: flex; align-items: center; flex: 1 1 320px; min-width: 0; gap: var(--space-1); }
.template-search { position: relative; flex: 1 1 auto; min-width: 12ch; display: flex; align-items: center; }
.template-search > .editor-icon { position: absolute; inset-inline-start: var(--space-2); width: 14px; height: 14px; color: var(--text-tertiary); }
.template-search input { width: 100%; padding-inline-start: calc(var(--space-2) + 20px); }
.template-library-tools select { width: auto; flex: none; }
.template-results { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); font-size: var(--type-caption); color: var(--text-muted); }
.template-results > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.template-results button { min-height: 0; padding: var(--space-0) var(--space-2); font-size: var(--type-caption); color: var(--accent); }
.creation-library { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(28ch, 1fr); gap: var(--space-4); }
.template-grid { min-height: 0; display: flex; flex-direction: column; gap: 2px; overflow: auto; padding: 2px var(--space-1) var(--space-3) 2px; }
.template-grid > button { position: relative; display: grid; grid-template-columns: 96px minmax(0,1fr); column-gap: var(--space-3); row-gap: 2px; text-align: left; padding: var(--space-2); border: 0; border-radius: var(--radius-md); background: transparent; flex: none; font-weight: var(--weight-regular); }
.template-grid > button:hover:not(.selected) { background: var(--surface-hover); }
.template-grid > button.selected { background: var(--selection-bg); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 50%, transparent); }
.template-preview { grid-row: 1 / 4; align-self: center; display: block; }
.template-preview img { display: block; width: 96px; height: auto; aspect-ratio: 16/9; object-fit: cover; border-radius: var(--radius-sm); background: var(--bg-canvas); box-shadow: inset 0 0 0 1px var(--border-separator); }
.template-preview > small, .template-requirements, .feature-list { display: none; }
.template-grid > button > strong, .template-grid > button > small { min-width: 0; white-space: normal; }
.template-grid > button > strong { font-weight: var(--weight-medium); }
.template-grid > button > small { color: var(--text-muted); font-size: var(--type-caption); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.template-meta { display: flex; gap: var(--space-2); font-size: var(--type-caption); color: var(--text-tertiary); }
.template-meta b { font-weight: var(--weight-medium); color: var(--text-muted); }
.template-classic { margin-left: auto; color: var(--text-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm, 4px); padding: 0 var(--space-1); }
.template-details { min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: var(--space-2); padding: 0 var(--space-1) var(--space-3) var(--space-4); border-left: var(--ui-border-width) solid var(--border-separator); }
.detail-preview { width: 100%; height: auto; aspect-ratio: 16/9; object-fit: cover; border-radius: var(--radius-md); background: var(--bg-canvas); box-shadow: inset 0 0 0 1px var(--border-separator), var(--shadow-xs); }
.template-details > header { display: grid; gap: 2px; }
.template-details > header strong { font-size: var(--type-section); }
.template-details small, .template-details p { font-size: var(--type-caption); color: var(--text-muted); overflow-wrap: anywhere; }
.template-details .detail-description { font-size: var(--type-body); color: var(--text-secondary); }
.template-instructions { display: grid; gap: var(--space-2); }
.template-instructions h3 { font-size: var(--type-dense); margin-block-end: 2px; color: var(--text-primary); }
.template-help { display: flex; gap: var(--space-1); flex-wrap: wrap; }
.template-help button { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--accent); }
.creation-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 2px var(--space-3); flex: 1 1 520px; min-width: 0; }
.creation-fields > label { display: flex; align-items: center; gap: var(--space-2); min-width: 0; color: var(--text-secondary); white-space: nowrap; }
.creation-fields input { flex: 1; width: auto; min-width: 0; }
.location-hint { grid-column: 2; color: var(--text-muted); font-size: var(--type-caption); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.template-selection { display: none; }
.cancel-button { margin-inline-start: auto; }
.create-button { min-width: calc(140px * var(--ui-scale)); }
.error, .path-error, .lock-warning { color: var(--danger); }
.template-empty { padding: var(--space-3); color: var(--text-muted); }

.upgrade-dialog { display: grid; gap: var(--space-3); }
.upgrade-flow, .upgrade-stats { display: flex; gap: var(--space-2); flex-wrap: wrap; align-items: center; }
.compatibility-summary { display: grid; gap: var(--space-1); }
.preflight > div { display: flex; gap: var(--space-2); align-items: center; padding-block: var(--space-1); border-bottom: var(--ui-border-width) solid var(--border-separator); }
.preflight p { display: grid; gap: 2px; }
.preflight small { color: var(--text-muted); }
.preflight .passed { color: var(--success); }
.preflight .blocked { color: var(--danger); }
.preflight .warning { color: var(--warning); }
.backup-choice { display: flex; gap: var(--space-2); align-items: center; }
.upgrade-dialog > footer { display: flex; justify-content: flex-end; gap: var(--space-1); flex-wrap: wrap; }
.read-only-dialog textarea { height: 45vh; width: 100%; font-family: var(--font-mono); }

@media (max-width: 860px) {
  .manager-shell { grid-template-columns: minmax(0, 1fr); gap: var(--space-5); padding: var(--space-5); }
  .main-project-actions { max-inline-size: 360px; }
  .creation-library { grid-template-columns: minmax(0, 1fr); }
  .template-details { display: none; }
  .creation-fields { grid-template-columns: minmax(0, 1fr); }
  .location-hint { grid-column: 1; }
  .manager-header .version { display: none; }
}
</style>
