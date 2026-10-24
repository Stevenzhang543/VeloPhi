<!-- 编辑器底栏：统一承载资源、日志与生产工具，标签切换不改变项目内容。 -->
<template>
  <section ref="dockRoot" class="bottom-panel" data-control-scope="transient-bottom-dock" @pointerdown.capture="prepareDockPrecision" @keydown.capture="prepareDockPrecision" @dblclick.capture="prepareDockPrecision" :class="{ collapsed: !estate.bottomPanelOpen, unpinned: !estate.bottomPanelPinned, 'panel-maximized': workspaceState.maximizedPanel==='bottom' }" :style="panelStyle" @mouseleave="autoHide">
    <PanelResizeHandle v-if="estate.bottomPanelOpen" v-model="estate.bottomPanelHeight" orientation="horizontal" :minimum="120" :maximum="520" :reset-value="280" @dragging="onDockDragging" @commit="settleDockMotion" reverse :label="t('bottomPanel')" :disabled="workspaceState.maximizedPanel==='bottom'" />
    <header class="panel-tabs">
      <!-- 标签与固定操作分区，长译文只滚动标签，不挤压展开、固定和关闭按钮。 -->
      <select v-model="estate.bottomPanelTab" class="compact-tab-select" :aria-label="t('tools')" @change="estate.bottomPanelOpen = true"><option v-for="tab in tabs" :key="tab.id" :value="tab.id">{{ t(tab.label) }}</option></select>
      <div ref="tabStrip" class="panel-tab-strip">
      <button v-for="tab in tabs" :key="tab.id" class="panel-tab" :class="{ active: estate.bottomPanelTab === tab.id }" :data-ui-drop="dropTabTarget === tab.id ? 'before' : undefined" draggable="true" :aria-pressed="estate.bottomPanelTab === tab.id" @dragstart="startTabDrag($event, tab.id)" @dragend="finishBottomDrag" @dragover="previewTabDrop($event, tab.id)" @dragleave="dropTabTarget = null" @drop="dropTab($event, tab.id)" @click="openTab(tab.id)" :title="t(tab.label)"><EditorIcon :name="tab.icon" /><span class="tab-label">{{ t(tab.label) }}</span><i v-if="tabDirty(tab.id)" class="dirty-indicator"></i></button>
      </div>
      <div class="panel-controls">
      <!-- 26.44 G1: three dock heights next to the free resize handle. -->
      <div v-if="estate.bottomPanelOpen && workspaceState.maximizedPanel !== 'bottom'" class="dock-presets" role="group" :aria-label="t('dockHeight')">
        <button v-for="preset in DOCK_PRESETS" :key="preset.id" type="button" class="dock-preset" :class="{ active: estate.bottomPanelHeight === preset.height }" :aria-pressed="estate.bottomPanelHeight === preset.height" :aria-label="t(preset.label)" :title="t(preset.label)" @click="setDockPreset(preset.height)"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2.5" /><rect class="dock-fill" x="4.5" :y="12 - preset.fill" width="7" :height="preset.fill" rx="1" /></svg></button>
      </div>
      <PanelMaximizeButton v-if="estate.bottomPanelOpen" panel="bottom" />
      <button class="ui-button ui-icon-button" :class="{ active: estate.bottomPanelPinned }" :aria-pressed="estate.bottomPanelPinned" :aria-label="t(estate.bottomPanelPinned ? 'unpinPanel' : 'pinPanel')" :title="t(estate.bottomPanelPinned ? 'unpinPanel' : 'pinPanel')" @click="estate.bottomPanelPinned = !estate.bottomPanelPinned"><EditorIcon :name="estate.bottomPanelPinned ? 'unpin' : 'pin'" /></button>
      <button class="ui-button ui-icon-button" v-if="estate.bottomPanelTab === 'console' && estate.bottomPanelOpen" :aria-label="t('clearConsole')" :title="t('clearConsole')" @click="estate.logs.splice(0)"><EditorIcon name="clear" /></button>
      <button class="ui-button ui-icon-button" :aria-label="t(estate.bottomPanelOpen ? 'collapsePanel' : 'expandPanel')" :aria-expanded="estate.bottomPanelOpen" :title="t(estate.bottomPanelOpen ? 'collapsePanel' : 'expandPanel')" @click="estate.bottomPanelOpen = !estate.bottomPanelOpen"><EditorIcon :name="estate.bottomPanelOpen ? 'down' : 'up'" /></button>
      </div>
    </header>

    <div ref="dockContent" v-show="dockContentVisible" :inert="!estate.bottomPanelOpen" class="panel-content">
      <div v-show="estate.bottomPanelTab === 'assets'" class="asset-browser" :class="{ inspecting: selectedAsset, 'details-visible': assetDetailMode && selectedAsset, 'full-page-details': assetFullPage && selectedAsset }">
        <aside class="folder-tree">
          <strong>{{ t('projectFiles') }}</strong>
          <button
            v-for="folder in visibleFolders"
            :key="folder"
            :title="folder"
            :aria-label="folder"
            :style="{ paddingInlineStart: `${7 + Math.min(4, Math.max(0, folder.split('/').filter(Boolean).length - 1)) * 10}px` }"
            :class="{ active: assets.currentFolder === folder }"
            :data-ui-drop="dropFolder === folder ? folderDropValid ? 'valid' : 'invalid' : undefined"
            @click="assets.currentFolder = folder"
            @dragover="previewFolderDrop($event, folder)"
            @dragleave="leaveFolderDrop($event, folder)"
            @drop="dropOnFolder($event, folder)"
          ><EditorIcon name="folder" /><span class="folder-label">{{ folder.split('/').filter(Boolean).at(-1) ?? folder }}</span></button>
        </aside>

        <section class="asset-workspace">
          <header class="asset-toolbar">
            <div class="asset-actions-row">
              <UiButton class="primary" :disabled="assets.importing || assetBatch.active" @click="assetInput?.click()" icon="upload" :label="t('importAssets')"><span>{{ t('importAssets') }}</span></UiButton>
              <button v-if="selectedAsset" class="asset-detail-toggle" type="button" @click="assetDetailMode = true; assetFullPage = true">{{ assetCopy('previewDetails') }}</button>
              <UiButton @click="createScriptAsset" icon="script" :label="t('newScript')"><span>{{ t('newScript') }}</span></UiButton>
              <UiButton @click="createVisualGraphAsset" icon="graph" :label="t('visualGraph')"><span>{{ t('visualGraph') }}</span></UiButton>
              <UiButton :disabled="!state.selectedEntityIds.length" @click="createSceneAssetFromSelection" icon="design" :label="t('createSceneAsset')"><span>{{ t('createSceneAsset') }}</span></UiButton>
              <UiButton @click="creatingFolder = !creatingFolder" icon="folder" :label="t('newFolder')"><span>{{ t('newFolder') }}</span></UiButton>
              <details data-ui-motion-popover ref="assetOverflow" class="asset-overflow"><summary :title="t('moreActions')" :aria-label="t('moreActions')"><EditorIcon name="more" /></summary><section class="asset-overflow-menu"><strong>{{ t('newSharedResource') }}</strong><button v-for="kind in resourceKinds" :key="kind" type="button" :aria-label="`+ ${t(`resource_${kind}`)}`" @click="createSharedResource(kind); closeAssetOverflow()">+ {{ t(`resource_${kind}`) }}</button><button type="button" @click="exportFolder(); closeAssetOverflow()">{{ t('exportProjectFolder') }}</button><button type="button" :disabled="assetBatch.active" @click="batchReimportVisible(); closeAssetOverflow()">{{ t('batchReimport') }}</button><button type="button" :disabled="!selectedAsset" @click="bulkApplyVisible(); closeAssetOverflow()">{{ t('bulkApplyVisible') }}</button><button v-for="item in pluginAssetContributions" :key="`${item.pluginId}:${item.kind}:${item.id}`" type="button" :title="`${item.pluginName} · ${item.description ?? ''}`" @click="pluginRuntime.invokeContribution(item.kind,item.id,item.pluginId); closeAssetOverflow()">{{ item.label }}</button></section></details>
              <input v-if="creatingFolder" v-model="newFolderName" class="folder-input" :placeholder="t('folderName')" @keydown.enter="createFolder" @keydown.escape="creatingFolder = false">
              <span class="path" :title="assets.currentFolder">{{ assets.currentFolder }}</span>
              <input v-model="assets.search" :aria-label="t('searchAssets')" type="search" :placeholder="t('searchAssets')">
              <button :class="{ active: assets.viewMode === 'grid' }" :aria-label="t('gridView')" :aria-pressed="assets.viewMode === 'grid'" :title="t('gridView')" @click="assets.viewMode = 'grid'"><EditorIcon name="grid" /></button><button :class="{ active: assets.viewMode === 'list' }" :aria-label="t('listView')" :aria-pressed="assets.viewMode === 'list'" :title="t('listView')" @click="assets.viewMode = 'list'"><EditorIcon name="list" /></button>
            </div>
            <div class="filter-menu" :aria-label="t('assetType')">
              <button :class="{ active: assets.typeFilter !== 'all' || assets.favoritesOnly }" @click="filterMenuOpen = !filterMenuOpen"><EditorIcon name="filter" /> {{ activeFilterLabel }} <EditorIcon name="down" /></button>
              <UiMotionTransition><section v-if="filterMenuOpen" class="filter-popover">
                <input v-model="filterQuery" type="search" :placeholder="t('searchFilters')">
                <button v-for="filter in filteredTypeFilters" :key="filter.type" :class="{ active: assets.typeFilter === filter.type }" @click="assets.typeFilter = filter.type; filterMenuOpen = false">{{ t(filter.label) }}</button>
                <button :class="{ active: assets.favoritesOnly }" @click="assets.favoritesOnly = !assets.favoritesOnly"><EditorIcon name="star" /> {{ t('favoritesOnly') }}</button>
                <input v-model="assets.tagFilter" :placeholder="t('filterByTag')">
                <select v-model="assets.selectedCollectionId"><option value="">{{ t('allCollections') }}</option><option v-for="collection in assets.collections" :key="collection.id" :value="collection.id">{{ collection.name }}</option></select>
                <select :value="''" @change="applySavedFilter(($event.target as HTMLSelectElement).value)"><option value="">{{ t('savedFilters') }}</option><option v-for="filter in assets.savedFilters" :key="filter.id" :value="filter.id">{{ filter.name }}</option></select>
                <div><input v-model="savedFilterName" :placeholder="t('filterName')" @keydown.enter="saveFilter"><button @click="saveFilter"><EditorIcon name="add" /></button></div>
              </section></UiMotionTransition>
            </div>
            <div class="asset-diagnostics">
              <UiButton @click="reportUnusedAssets" icon="check" :label="t('unusedAssetReport')" />
              <button :disabled="!assetGraph.missingReferences.length" @click="openMissingRepair">{{ t('missingReferences') }} <span>{{ assetGraph.missingReferences.length }}</span></button>
              <span v-if="assets.atlasError" class="atlas-error" :title="assets.atlasError">{{ t('atlasRebuildFailed') }}</span>
            </div>
            <input ref="assetInput" hidden type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,audio/wav,audio/ogg,audio/mpeg,audio/flac,font/ttf,font/otf,font/woff,font/woff2,.wav,.ogg,.mp3,.flac,.ttf,.otf,.woff,.woff2,.rhai,.nova-graph,.nova-prefab,.nova-scene,.nova-material,.nova-anim,.nova-controller,.nova-mask,.nova-rig,.nova-skin,.nova-timeline,.nova-tileset,.nova-atlas,.nova-resource,.atlas,.tpsheet,.tmx,.tmj,.tsx,.tsj,.json,.nova-path,.glsl,.frag,.vert,.nova-shader,.csv,.po,.arb,.nova-locale,.nova-theme" @change="importFiles">
          </header>

          <section v-if="externalChanges.length" class="external-changes" aria-live="polite">
            <article v-for="change in externalChanges" :key="change.id"><span><strong>{{ t('externalAssetChanged') }}</strong><small>{{ change.name }}</small></span><button @click="resolveExternal(change.id, 'reimport')">{{ t('reimportAsset') }}</button><button @click="resolveExternal(change.id, 'keep')">{{ t('keepCurrent') }}</button><button @click="resolveExternal(change.id, 'duplicate')">{{ t('importAsCopy') }}</button></article>
          </section>

<!-- 导入队列展开检查回调判断是否仍有未完成、未取消且未失败的作业。 -->          <details data-ui-motion-disclosure v-if="importJobs.length" class="import-queue" :open="importJobs.some(job=>!['complete','cancelled','failed'].includes(job.status))" aria-live="polite">
            <summary>{{ t('importLog') }} · {{ importJobs.length }}</summary>
            <article v-for="job in importJobs" :key="job.id">
              <span><strong>{{ job.name }}</strong><small>{{ t(`importStatus_${job.status}`) }}</small></span>
              <progress :value="job.progress" max="1"></progress>
              <button v-if="!['complete','cancelled','failed'].includes(job.status)" @click="cancelAssetImport(job.id)">{{ t('cancel') }}</button>
              <button v-else-if="job.retryable" @click="retryImport(job.id)">{{ t('retry') }}</button>
              <p v-if="job.status==='failed'" role="alert">{{ assetImportFailureSummary(job.logs.join(' ' ),preferencesState.locale) }}</p><details data-ui-motion-disclosure v-if="job.logs.length"><summary>{{ assetImportTechnicalLabel(preferencesState.locale) }}</summary><code v-for="(line,index) in job.logs" :key="index">{{ line }}</code></details>
            </article>
          </details>

          <section v-if="repairMode && missingReferenceIds.length" class="missing-repair" aria-live="polite">
            <strong>{{ t('repairMissingReference') }}</strong>
            <select v-model="selectedMissingReference" :aria-label="t('missingReferences')">
              <option v-for="reference in missingReferenceIds" :key="reference" :value="reference">{{ reference }}</option>
            </select>
            <span>→</span>
            <select v-model="replacementAssetGuid" :aria-label="t('replacementAsset')">
              <option value="" disabled>{{ t('chooseReplacementAsset') }}</option>
              <option v-for="asset in assets.records" :key="asset.uuid" :value="asset.uuid">{{ asset.path }}</option>
            </select>
            <button class="primary" :disabled="!replacementAssetGuid" @click="repairSelectedMissingReference">{{ t('repairReference') }}</button>
            <button :title="t('close')" @click="repairMode = false"><EditorIcon name="close" /></button>
          </section>

          <section v-if="assetBatch.total" class="asset-batch" :aria-label="assetCopy('progress')">
            <header><strong>{{ assetCopy('progress') }} {{ assetBatch.done }}/{{ assetBatch.total }}</strong><button v-if="assetBatch.active" type="button" @click="cancelAssetBatch">{{ assetCopy('cancel') }}</button></header>
            <progress :value="assetBatch.done" :max="assetBatch.total" :aria-label="assetCopy('progress')"></progress>
            <p role="status">{{ assetBatch.name }} · {{ assetCopy('completed') }} {{ assetBatch.completed }} · {{ assetCopy('failed') }} {{ assetBatch.failed }} · {{ assetCopy('cancelled') }} {{ assetBatch.cancelled }}</p>
<!-- 批处理结果过滤回调仅保留失败项以显示错误详情。 -->            <details data-ui-motion-disclosure v-if="assetBatch.failed"><summary>{{ assetCopy('failed') }}</summary><section v-for="(item,index) in assetBatch.results.filter(v=>v.status==='failed')" :key="index"><strong>{{ item.name }}</strong><p role="alert">{{ assetImportFailureSummary(item.message,preferencesState.locale) }}</p><details data-ui-motion-disclosure><summary>{{ assetImportTechnicalLabel(preferencesState.locale) }}</summary><code>{{ item.message }}</code></details></section></details>
          </section>
          <div ref="assetGrid" class="asset-grid" :class="`asset-${assets.viewMode}`" @scroll.passive="updateAssetWindow">
            <!-- 占位间距属于内容，不属于被观察的滚动视口，避免虚拟高度反馈到可见行数。 -->
            <div class="asset-grid-window" :style="assetGridStyle">
            <article
              v-for="asset in displayedAssets"
              :key="asset.uuid"
              :class="{ selected: assets.selectedGuid === asset.uuid }"
              tabindex="0"
              :aria-label="asset.path"
              :title="asset.path"
              @keydown.enter.self="assets.selectedGuid = asset.uuid; assetDetailMode = true"
              @keydown.space.self.prevent="assets.selectedGuid = asset.uuid"
              draggable="true"
              @dragstart="dragAsset($event, asset.uuid)"
              @dragend="finishBottomDrag"
              @click="assets.selectedGuid = asset.uuid"
              @dblclick="openAssetEditor(asset.uuid)"
            >
              <AssetImagePreview v-if="asset.assetType === 'image'" class="asset-preview" :asset="asset" /><span v-else class="asset-preview asset-icon"  :style="{ backgroundImage: `url(${contentThumbnailDataUrl(asset)})`, backgroundSize: 'cover' }"><EditorIcon :name="assetIcon(asset.assetType)" /></span>
              <span v-if="assetSourceStatus(asset.uuid)" :class="['source-badge', assetSourceStatus(asset.uuid)]">{{ assetSourceStatus(asset.uuid)?.slice(0, 1).toUpperCase() }}</span>
              <button class="favorite-button" :class="{ active: assets.favorites.includes(asset.uuid) }" :title="t('favorite')" @click.stop="toggleAssetFavorite(asset.uuid)"><EditorIcon name="star" /></button>
              <input v-if="renamingGuid === asset.uuid" v-model="renameValue" @click.stop @keydown.enter="commitRename" @keydown.escape="renamingGuid = null" @blur="commitRename">
              <strong v-else :title="asset.path">{{ asset.name }}</strong>
              <small :title="asset.path">{{ assets.viewMode === 'list' ? asset.path : `${asset.assetType} · ${formatBytes(asset.byteLength)}` }}</small>
            </article>
            <p v-if="!displayedAssets.length" class="empty">{{ t('noAssets') }}</p>
            <p v-else-if="displayedAssets.length < filteredAssetCount" class="asset-window-status">{{ t('virtualizedAssets', { shown: displayedAssets.length, total: filteredAssetCount }) }}</p>
            </div>
          </div>
        </section>

        <aside v-if="selectedAsset" class="asset-inspector" @change="assetSettingsChanged">
          <header><button class="asset-detail-back" type="button" @click="assetDetailMode = false; assetFullPage = false"><EditorIcon name="back" /> {{ assetCopy('browse') }}</button><span>{{ t('assetInspector') }}</span><strong>{{ selectedAsset.name }}</strong></header>
          <nav class="importer-tabs" :aria-label="t('assetImporter')"><button v-for="tab in importerTabs" :key="tab" :class="{ active: inspectorTab === tab }" @click="inspectorTab = tab">{{ t(`importerTab_${tab}`) }}</button></nav>
          <AssetImagePreview v-if="selectedAsset.assetType === 'image'" class="large-preview" :asset="selectedAsset" show-error />
          <audio v-else-if="selectedAsset.assetType === 'audio'" class="asset-media-preview" :src="selectedAsset.source" controls preload="metadata"></audio>
          <video v-else-if="selectedAsset.assetType === 'video'" class="asset-media-preview asset-video-preview" :src="selectedAsset.source" controls playsinline preload="metadata"></video>
          <div v-else-if="selectedAsset.assetType === 'font'" class="font-preview" :style="{ fontFamily: selectedAsset.fontFamily }">Nova_A Aa 123</div>
          <ContentAssetInspector :asset="selectedAsset" @open-animation="openAnimationAsset" @select-asset="assets.selectedGuid=$event" />
          <details data-ui-motion-disclosure v-if="assetOperationError" class="pipeline-error" open><summary>{{ assetCopy('operationFailed') }}</summary><p role="alert">{{ assetImportFailureSummary(assetOperationError,preferencesState.locale) }}</p><details data-ui-motion-disclosure><summary>{{ assetImportTechnicalLabel(preferencesState.locale) }}</summary><code>{{ assetOperationError }}</code></details></details>
          <section v-show="inspectorTab === 'source'" class="inspector-pane">
            <label><span>GUID</span><code>{{ selectedAsset.uuid.slice(0, 13) }}…</code></label>
            <label><span>{{ t('assetPath') }}</span><code>{{ selectedAsset.path }}</code></label>
            <label v-if="selectedAsset.path.startsWith('.nova/')"><span>{{ t('generatedArtifact') }}</span><b>{{ t('readOnly') }}</b></label>
            <label><span>{{ t('sourceControl') }}</span><select v-model="selectedAsset.sourceControlStatus"><option>clean</option><option>added</option><option>modified</option><option>conflict</option><option>untracked</option></select></label>
            <label class="region-field"><span>{{ t('tags') }}</span><input v-model="selectedAssetTags" :placeholder="t('tagsPlaceholder')"></label>
            <label><span>{{ t('contentGroup') }}</span><select v-model="selectedAsset.contentGroup"><option v-for="group in assets.contentGroups" :key="group.id" :value="group.id">{{ group.name }} · {{ t(group.mode) }}</option></select></label>
            <label><span>{{ t('editorOnly') }}</span><input v-model="selectedAsset.editorOnly" type="checkbox"></label>
            <details data-ui-motion-disclosure class="collection-membership"><summary>{{ t('collections') }}</summary><button v-for="collection in assets.collections" :key="collection.id" :class="{ active: collection.assetUuids.includes(selectedAsset.uuid) }" @click="toggleSelectedCollection(collection.id)"><i :style="{ background: collection.color }"></i>{{ collection.name }}</button><div><input v-model="collectionName" :placeholder="t('newCollection')"><button @click="createCollection"><EditorIcon name="add" /></button></div></details>
            <button class="save-script secondary" @click="startRename(selectedAsset.uuid, selectedAsset.name)">{{ t('renameAsset') }}</button>
          </section>
          <section v-show="inspectorTab === 'provenance'" class="inspector-pane provenance-pane">
            <p v-if="!selectedAsset.pipeline" class="pipeline-error">{{ t('missingProvenance') }}</p>
            <template v-else><label><span>{{ t('importer') }}</span><code>{{ selectedAsset.pipeline.importerId }}@{{ selectedAsset.pipeline.importerVersion }}</code></label><label><span>{{ t('preset') }}</span><code>{{ selectedAsset.pipeline.presetId }}</code></label><label><span>{{ t('importCache') }}</span><code>{{ selectedAsset.pipeline.cacheHit ? t('cacheHit') : t('cacheWritten') }}</code></label><label><span>{{ t('cacheInvalidation') }}</span><code>{{ selectedAsset.pipeline.invalidationReason }}</code></label><label><span>{{ t('reproducible') }}</span><b :class="{ dangerText: !selectedAsset.pipeline.reproducible }">{{ selectedAsset.pipeline.reproducible ? t('yes') : t('no') }}</b></label></template>
          <details data-ui-motion-disclosure class="asset-technical">
            <summary>{{ t('technicalDetails') }}</summary>
            <div><span>GUID</span><code>{{ selectedAsset.uuid }}</code><button type="button" :title="t('copy')" @click="copyAssetDetail(selectedAsset.uuid)"><EditorIcon name="copy" /></button></div>
            <div><span>{{ t('assetPath') }}</span><code>{{ selectedAsset.path }}</code><button type="button" :title="t('copy')" @click="copyAssetDetail(selectedAsset.path)"><EditorIcon name="copy" /></button></div>
            <div v-if="selectedAsset.pipeline"><span>{{ t('sourceHash') }}</span><code>{{ selectedAsset.pipeline.sourceHash }}</code><button type="button" :title="t('copy')" @click="copyAssetDetail(selectedAsset.pipeline.sourceHash)"><EditorIcon name="copy" /></button></div>
            <div v-if="selectedAsset.pipeline"><span>{{ t('artifactHash') }}</span><code>{{ selectedAsset.pipeline.artifactHash }}</code><button type="button" :title="t('copy')" @click="copyAssetDetail(selectedAsset.pipeline.artifactHash)"><EditorIcon name="copy" /></button></div>
          </details>
            <article v-for="diagnostic in selectedProvenanceDiagnostics" :key="`${diagnostic.code}-${diagnostic.message}`" :class="['provenance-diagnostic', diagnostic.severity]"><b>{{ diagnostic.code }}</b><span>{{ diagnostic.message }}</span></article>
            <div class="provenance-actions"><button @click="compareSelectedImport">{{ t('compareImport') }}</button><button @click="revertSelectedImport">{{ t('revertImport') }}</button></div>
            <pre v-if="importComparisonText">{{ importComparisonText }}</pre>
          </section>
          <p v-if="selectedAsset.pipeline?.status === 'failed'" class="pipeline-error">{{ selectedAsset.pipeline.error }}</p>
          <section v-show="inspectorTab === 'import'" class="inspector-pane import-controls">
          <template v-if="selectedAsset.assetType === 'image'">
            <label><span>{{ t('dimensions') }}</span><b>{{ selectedAsset.width }} × {{ selectedAsset.height }}</b></label>
            <label><span>{{ t('importProfile') }}</span><select :value="selectedAsset.settings.textureProfile" @change="setTextureProfile"><option>General</option><option>PixelArt</option><option>UI</option><option>NormalMap</option></select></label>
            <label><span>{{ t('filterMode') }}</span><select v-model="selectedAsset.settings.filterMode"><option value="Linear">{{ t('linear') }}</option><option value="Nearest">{{ t('nearest') }}</option></select></label>
            <label><span>{{ t('pixelArtMode') }}</span><input :checked="selectedAsset.settings.filterMode === 'Nearest'" type="checkbox" @change="setPixelArtMode"></label>
            <label><span>{{ t('compression') }}</span><select v-model="selectedAsset.settings.compression"><option value="None">{{ t('none') }}</option><option value="Lossless">{{ t('lossless') }}</option><option value="Optimized">{{ t('optimized') }}</option></select></label>
            <label><span>{{ t('colorSpace') }}</span><select v-model="selectedAsset.settings.colorSpace"><option>sRGB</option><option>Linear</option></select></label>
            <label><span>{{ t('generateMipmaps') }}</span><input v-model="selectedAsset.settings.generateMipmaps" type="checkbox"></label>
            <label><span>{{ t('transparency') }}</span><select v-model="selectedAsset.settings.transparency"><option>Preserve</option><option>Premultiply</option><option>Discard</option></select></label>
            <label><span>{{ t('pixelsPerUnit') }}</span><NumericExpressionInput v-model="selectedAsset.settings.pixelsPerUnit" :minimum="0.000001" :step="1" :resource-key="selectedAsset.uuid + ':settings.pixelsPerUnit'" /></label>
            <label><span>{{ t('pivot') }} X/Y</span><div><NumericExpressionInput v-model="selectedAsset.settings.pivot.x" :minimum="0" :maximum="1" :step="0.05" :resource-key="selectedAsset.uuid + ':settings.pivot.x'" /><NumericExpressionInput v-model="selectedAsset.settings.pivot.y" :minimum="0" :maximum="1" :step="0.05" :resource-key="selectedAsset.uuid + ':settings.pivot.y'" /></div></label>
            <label><span>{{ t('pivotPreset') }}</span><select :value="''" @change="applyPivotPreset(($event.target as HTMLSelectElement).value)"><option value="">{{ t('custom') }}</option><option v-for="preset in pivotPresets" :key="preset.id" :value="preset.id">{{ t(preset.label) }}</option></select></label>
            <label><span>{{ t('useSpriteRegion') }}</span><input :checked="selectedAsset.settings.spriteRegion !== null" type="checkbox" @change="toggleSpriteRegion"></label>
            <label v-if="selectedAsset.settings.spriteRegion" class="region-field"><span>{{ t('spriteRegion') }} X/Y/W/H</span><div><NumericExpressionInput v-model="selectedAsset.settings.spriteRegion.x" :minimum="0" :step="1" :resource-key="selectedAsset.uuid + ':settings.spriteRegion.x'" /><NumericExpressionInput v-model="selectedAsset.settings.spriteRegion.y" :minimum="0" :step="1" :resource-key="selectedAsset.uuid + ':settings.spriteRegion.y'" /><NumericExpressionInput v-model="selectedAsset.settings.spriteRegion.width" :minimum="1" :step="1" :resource-key="selectedAsset.uuid + ':settings.spriteRegion.width'" /><NumericExpressionInput v-model="selectedAsset.settings.spriteRegion.height" :minimum="1" :step="1" :resource-key="selectedAsset.uuid + ':settings.spriteRegion.height'" /></div></label>
            <label><span>{{ t('trimTransparent') }}</span><button type="button" @click="trimSelectedImage">{{ t('trimNow') }}</button></label>
            <label v-if="!selectedAsset.derivedSprite"><span>{{ t('spriteSheetSlicing') }}</span><input v-model="selectedAsset.settings.spriteSheet.enabled" type="checkbox"></label>
            <template v-if="!selectedAsset.derivedSprite && selectedAsset.settings.spriteSheet.enabled"><label><span>{{ t('sheetColumnsRows') }}</span><div><NumericExpressionInput v-model="selectedAsset.settings.spriteSheet.columns" :minimum="1" :maximum="256" :resource-key="selectedAsset.uuid + ':settings.spriteSheet.columns'" /><NumericExpressionInput v-model="selectedAsset.settings.spriteSheet.rows" :minimum="1" :maximum="256" :resource-key="selectedAsset.uuid + ':settings.spriteSheet.rows'" /></div></label><label><span>{{ t('marginSpacing') }}</span><div><NumericExpressionInput v-model="selectedAsset.settings.spriteSheet.margin" :minimum="0" :resource-key="selectedAsset.uuid + ':settings.spriteSheet.margin'" /><NumericExpressionInput v-model="selectedAsset.settings.spriteSheet.spacing" :minimum="0" :resource-key="selectedAsset.uuid + ':settings.spriteSheet.spacing'" /></div></label><button class="save-script" type="button" @click="sliceSelectedSheet">{{ t('createSpriteSlices') }}</button></template>
            <button v-if="!selectedAsset.derivedSprite" class="save-script" type="button" @click="animateSelectedFrames">{{ assetCopy('animation') }}</button>
            <button class="save-script" type="button" @click="autoSliceSelectedImage">{{ t('automaticSpriteSlicing') }}</button>
            <label><span>{{ t('collisionGeneration') }}</span><select v-model="selectedAsset.settings.collisionGeneration.mode"><option>None</option><option>Box</option><option>Polygon</option></select></label>
            <label v-if="selectedAsset.settings.collisionGeneration.mode === 'Polygon'"><span>{{ t('polygonTolerance') }}</span><NumericExpressionInput v-model="selectedAsset.settings.collisionGeneration.tolerance" :minimum="0" :maximum="64" :step="0.25" :resource-key="selectedAsset.uuid + ':settings.collisionGeneration.tolerance'" /></label>
            <label class="region-field"><span>{{ t('sliceBorders') }} L/T/R/B</span><div><NumericExpressionInput v-model="selectedAsset.settings.borders.left" :minimum="0" :resource-key="selectedAsset.uuid + ':settings.borders.left'" /><NumericExpressionInput v-model="selectedAsset.settings.borders.top" :minimum="0" :resource-key="selectedAsset.uuid + ':settings.borders.top'" /><NumericExpressionInput v-model="selectedAsset.settings.borders.right" :minimum="0" :resource-key="selectedAsset.uuid + ':settings.borders.right'" /><NumericExpressionInput v-model="selectedAsset.settings.borders.bottom" :minimum="0" :resource-key="selectedAsset.uuid + ':settings.borders.bottom'" /></div></label>
            <label v-if="!selectedAsset.derivedSprite"><span>{{ t('useTextureAtlas') }}</span><input v-model="selectedAsset.settings.atlas" type="checkbox"></label>
            <label><span>{{ t('atlasGroup') }}</span><input v-model="selectedAsset.settings.atlasSettings.group"></label>
            <label><span>{{ t('atlasRotation') }}</span><select v-model="selectedAsset.settings.atlasSettings.rotationPolicy"><option>Never</option><option>Allow</option></select></label>
            <label><span>{{ t('atlasTrimPolicy') }}</span><select v-model="selectedAsset.settings.atlasSettings.trimPolicy"><option>None</option><option>Transparent</option></select></label>
            <template v-if="selectedAsset.mimeType === 'image/svg+xml'"><label><span>{{ t('svgRasterization') }}</span><select v-model="selectedAsset.settings.svgSettings.rasterization"><option>ImportTime</option><option>Runtime</option><option>Disabled</option></select></label><label><span>{{ t('svgScale') }}</span><NumericExpressionInput v-model="selectedAsset.settings.svgSettings.scale" :minimum="0.01" :maximum="64" :step="0.1" :resource-key="selectedAsset.uuid + ':settings.svgSettings.scale'" /></label></template>
            <label v-for="platform in compressionPlatforms" :key="platform"><span>{{ t(platform) }} {{ t('compression') }}</span><select v-model="selectedAsset.settings.platformVariants[platform]"><option :value="undefined">{{ t('inherit') }}</option><option>None</option><option>Lossless</option><option>Optimized</option></select></label>
          </template>
          <template v-else-if="selectedAsset.assetType === 'audio'">
            <label><span>{{ t('duration') }}</span><b>{{ selectedAsset.duration.toFixed(2) }}s</b></label>
            <label><span>{{ t('importProfile') }}</span><select :value="selectedAsset.settings.audioSettings.profile" @change="setAudioProfile"><option>SoundEffect</option><option>Music</option><option>Voice</option><option>Streaming</option></select></label>
            <label><span>{{ t('audioCodec') }}</span><select v-model="selectedAsset.settings.audioSettings.codec"><option>Original</option><option>PCM</option><option>Vorbis</option><option>MP3</option></select></label>
            <label><span>{{ t('audioQuality') }}</span><UiSlider v-model.number="selectedAsset.settings.audioSettings.quality"  min="0" max="1" step="0.01" /></label>
            <label><span>{{ t('trimRange') }}</span><div><NumericExpressionInput v-model="selectedAsset.settings.audioSettings.trimStart" :minimum="0" :maximum="selectedAsset.duration" :step="0.01" :resource-key="selectedAsset.uuid + ':settings.audioSettings.trimStart'" /><NumericExpressionInput v-model="selectedAsset.settings.audioSettings.trimEnd" :minimum="0" :maximum="selectedAsset.duration" :step="0.01" :resource-key="selectedAsset.uuid + ':settings.audioSettings.trimEnd'" /></div></label>
            <label><span>{{ t('normalizeAudio') }}</span><input v-model="selectedAsset.settings.audioSettings.normalize" type="checkbox"></label>
            <label><span>{{ t('streamAudio') }}</span><input v-model="selectedAsset.settings.audioSettings.streaming" type="checkbox"></label><label><span>{{ t('preloadAudio') }}</span><select v-model="selectedAsset.settings.audioSettings.preload"><option>Auto</option><option>Preload</option><option>Metadata</option><option>None</option></select></label>
            <label><span>{{ t('sampleRate') }}</span><select v-model.number="selectedAsset.settings.audioSettings.sampleRate"><option :value="22050">22050</option><option :value="44100">44100</option><option :value="48000">48000</option><option :value="96000">96000</option></select></label>
          </template>
          <template v-else-if="selectedAsset.assetType === 'font'">
            <label><span>{{ t('fontFamily') }}</span><b :style="{ fontFamily: selectedAsset.fontFamily }">Nova_A</b></label>
            <p class="drag-hint" role="note" data-audit="font-rendering-availability">{{ fontImportAvailabilityCopy() }}</p>
            <label><span>{{ t('fontRenderMode') }}</span><select v-model="selectedAsset.settings.fontSettings.renderMode"><option>Scalable</option><option>Bitmap</option></select></label>
            <label v-if="selectedAsset.settings.fontSettings.renderMode === 'Bitmap'"><span>{{ t('bitmapSize') }}</span><NumericExpressionInput v-model="selectedAsset.settings.fontSettings.bitmapSize" :minimum="6" :maximum="512" :resource-key="selectedAsset.uuid + ':settings.fontSettings.bitmapSize'" /></label>
            <label><span>{{ t('fontOutline') }}</span><NumericExpressionInput v-model="selectedAsset.settings.fontSettings.outlineWidth" :minimum="0" :maximum="32" :step="0.25" :resource-key="selectedAsset.uuid + ':settings.fontSettings.outlineWidth'" /></label>
            <label><span>{{ t('textShaping') }}</span><input v-model="selectedAsset.settings.fontSettings.shaping" type="checkbox"></label>
            <label><span>{{ t('fontHinting') }}</span><select v-model="selectedAsset.settings.fontSettings.hinting"><option>Auto</option><option>None</option><option>Light</option><option>Full</option></select></label>
            <label><span>{{ t('fontOversampling') }}</span><NumericExpressionInput v-model="selectedAsset.settings.fontSettings.oversampling" :minimum="1" :maximum="8" :step="0.25" :resource-key="selectedAsset.uuid + ':settings.fontSettings.oversampling'" /></label>
            <label><span>{{ t('distanceField') }}</span><select v-model="selectedAsset.settings.fontSettings.distanceField"><option>None</option><option>SDF</option><option>MSDF</option></select></label>
            <label v-if="selectedAsset.settings.fontSettings.distanceField !== 'None'"><span>{{ t('distanceRange') }}</span><NumericExpressionInput v-model="selectedAsset.settings.fontSettings.distanceRange" :minimum="1" :maximum="64" :resource-key="selectedAsset.uuid + ':settings.fontSettings.distanceRange'" /></label>
            <label class="region-field"><span>{{ t('openTypeFeatures') }}</span><input :value="selectedAsset.settings.fontSettings.openTypeFeatures.join(', ')" @change="setOpenTypeFeatures"></label>
            <label class="region-field"><span>{{ t('declaredLanguages') }}</span><input :value="selectedAsset.settings.fontSettings.declaredLanguages.join(', ')" @change="setDeclaredLanguages"></label>
            <label><span>{{ t('editorFont') }}</span><input v-model="selectedAsset.settings.fontSettings.editorFont" type="checkbox"></label>
            <label class="region-field"><span>{{ t('fontFallbacks') }}</span><input :value="selectedAsset.settings.fontSettings.fallbackFamilies.join(', ')" @change="setFontFallbacks"></label>
            <section class="glyph-report"><strong>{{ t('glyphCoverage') }}</strong><article v-for="row in selectedGlyphReport" :key="row.language" :class="{ missing: !row.supported }"><b>{{ row.language }}</b><span>{{ row.sample }}</span><small>{{ row.supported ? t('covered') : `${t('missingGlyphs')}: ${row.missing.join(' ')}` }}</small></article></section>
          </template>
          <template v-else-if="selectedAsset.assetType === 'script'">
            <p class="drag-hint">{{ t('scriptStudioAssetHint') }}</p>
            <label><span>{{ t('module') }}</span><input v-model="selectedAsset.settings.scriptSettings.module" type="checkbox"></label>
            <label><span>{{ t('encoding') }}</span><b>UTF-8</b></label>
            <button class="save-script" @click="openInScriptStudio(selectedAsset.uuid)">{{ t('openScriptStudio') }}</button>
          </template>
          <template v-else-if="selectedAsset.assetType === 'visualScript'">
            <label><span>{{ t('graphVersion') }}</span><b>1</b></label>
            <label><span>{{ t('scriptApiVersion') }}</span><b>API v2</b></label>
            <button class="save-script" @click="openInGraphStudio(selectedAsset.uuid)">{{ t('openVisualGraph') }}</button>
          </template>
          <template v-else-if="selectedAsset.assetType === 'eventSheet'">
            <label><span>{{ t('eventSheetVersion') }}</span><b>1</b></label>
            <p class="drag-hint">{{ t('eventSheetAssetVisible') }}</p>
            <button class="save-script" @click="openInEventSheetStudio(selectedAsset.uuid)">{{ t('openEventSheet') }}</button>
          </template>
          <template v-else-if="selectedAsset.assetType === 'objectBlueprint'">
            <label><span>{{ t('objectBlueprintVersion') }}</span><b>1</b></label>
            <textarea class="text-preview" readonly :value="selectedTextSource"></textarea>
          </template>
          <template v-else-if="selectedAsset.assetType === 'atlas'">
            <label><span>{{ t('atlasMaxSize') }}</span><select v-model.number="selectedAsset.settings.atlasSettings.maxSize"><option :value="512">512</option><option :value="1024">1024</option><option :value="2048">2048</option><option :value="4096">4096</option></select></label>
            <label><span>{{ t('atlasPadding') }}</span><NumericExpressionInput v-model="selectedAsset.settings.atlasSettings.padding" :minimum="0" :maximum="32" :resource-key="selectedAsset.uuid + ':settings.atlasSettings.padding'" /></label>
            <label><span>{{ t('trimTransparent') }}</span><input v-model="selectedAsset.settings.atlasSettings.trim" type="checkbox"></label>
            <section v-if="selectedAtlasReport" class="atlas-report"><strong>{{ t('atlasPackingReport') }}</strong><p>{{ t('atlasPages') }}: {{ selectedAtlasReport.pages }} · {{ t('atlasUtilization') }}: {{ (selectedAtlasReport.utilization * 100).toFixed(1) }}%</p><code>{{ selectedAtlasReport.deterministicKey.slice(0, 20) }}…</code><small v-for="message in selectedAtlasReport.diagnostics" :key="message">{{ message }}</small></section>
            <textarea class="text-preview" readonly :value="selectedTextSource"></textarea>
          </template>
          <template v-else-if="selectedAsset.assetType === 'tileset'">
            <label><span>{{ t('tileSize') }}</span><div><NumericExpressionInput v-model="selectedAsset.settings.tileSettings.tileWidth" :minimum="1" :resource-key="selectedAsset.uuid + ':settings.tileSettings.tileWidth'" /><NumericExpressionInput v-model="selectedAsset.settings.tileSettings.tileHeight" :minimum="1" :resource-key="selectedAsset.uuid + ':settings.tileSettings.tileHeight'" /></div></label>
            <label><span>{{ t('marginSpacing') }}</span><div><NumericExpressionInput v-model="selectedAsset.settings.tileSettings.margin" :minimum="0" :resource-key="selectedAsset.uuid + ':settings.tileSettings.margin'" /><NumericExpressionInput v-model="selectedAsset.settings.tileSettings.spacing" :minimum="0" :resource-key="selectedAsset.uuid + ':settings.tileSettings.spacing'" /></div></label>
            <textarea class="text-preview" readonly :value="selectedTextSource"></textarea>
          </template>
          <template v-else-if="selectedAsset.assetType === 'shader'">
            <label><span>{{ t('shaderStage') }}</span><select v-model="selectedAsset.settings.shaderSettings.stage"><option value="fragment">Fragment</option><option value="vertex">Vertex</option></select></label>
            <label><span>{{ t('entryPoint') }}</span><input v-model="selectedAsset.settings.shaderSettings.entry"></label>
            <textarea class="text-preview" readonly :value="selectedTextSource"></textarea>
          </template>
          <template v-else-if="selectedAsset.assetType === 'localization'">
            <label><span>{{ t('locale') }}</span><input v-model="selectedAsset.settings.localizationSettings.locale"></label>
            <label><span>{{ t('fallbackLocale') }}</span><input v-model="selectedAsset.settings.localizationSettings.fallbackLocale"></label>
            <textarea class="text-preview" readonly :value="selectedTextSource"></textarea>
          </template>
          <template v-else-if="selectedAsset.assetType === 'uiTheme'">
            <p class="drag-hint">{{ t('uiThemeAssetHint') }}</p>
            <textarea class="text-preview" readonly :value="selectedTextSource"></textarea>
          </template>
          <template v-else-if="selectedAsset.assetType === 'other' && selectedAsset.path.startsWith('Assets/Tutorials/')">
            <p class="drag-hint">{{ t('projectTutorial') }}</p><textarea class="text-preview tutorial-preview" readonly :value="selectedTextSource"></textarea><button class="save-script" @click="dismissTutorial">{{ t('dismissTutorial') }}</button>
          </template>
          <template v-else-if="selectedAsset.assetType === 'animation' && selectedAsset.animationImport">
            <p class="drag-hint">{{ t('animationImportHint') }}</p>
            <label><span>{{ t('sourceAnimation') }}</span><select v-model="selectedAsset.animationImport.sourceAsset"><option :value="null">{{ t('none') }}</option><option v-for="asset in animationSources" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></label>
            <label><span>{{ t('sourceFrameRate') }}</span><NumericExpressionInput v-model="selectedAsset.animationImport.sourceFrameRate" :minimum="1" :maximum="240" :resource-key="selectedAsset.uuid + ':animationImport.sourceFrameRate'" /></label>
            <label><span>{{ t('sampleRate') }}</span><NumericExpressionInput v-model="selectedAsset.animationImport.sampleRate" :minimum="1" :maximum="240" :resource-key="selectedAsset.uuid + ':animationImport.sampleRate'" /></label>
            <details data-ui-motion-disclosure class="mapping-editor"><summary>{{ t('trackMappings') }}</summary><label v-for="(mapping,index) in selectedAsset.animationImport.trackMappings" :key="index"><input v-model="mapping.source" :placeholder="t('sourceProperty')"><input v-model="mapping.target" :placeholder="t('targetProperty')"><button @click="selectedAsset.animationImport!.trackMappings.splice(index,1)"><EditorIcon name="close" /></button></label><button @click="selectedAsset.animationImport.trackMappings.push({source:'Transform.position.x',target:'Transform.position.x'})">+ {{ t('trackMapping') }}</button></details>
            <button class="save-script" @click="reimportAnimation">{{ t('reimportAnimation') }}</button>
          </template>
          <template v-else-if="selectedAsset.assetType === 'prefab'"><button class="save-script" @click="instantiateSelectedPrefab">{{ t('instantiatePrefabAction') }}</button><button v-if="state.selectedEntityIds.length" class="save-script secondary" @click="replaceSelectionWithSelectedPrefab">{{ t('replaceSelectionWithPrefab') }}</button></template>
          <button v-else-if="selectedAsset.assetType === 'scene'" class="save-script" @click="instantiateSelectedScene">{{ t('instantiateScene') }}</button>
          </section>
          <section v-show="inspectorTab === 'import'" class="import-presets">
            <strong>{{ t('importPresets') }}</strong>
            <select :value="''" @change="applySelectedPreset(($event.target as HTMLSelectElement).value)"><option value="">{{ t('choosePreset') }}</option><option v-for="preset in compatibleImportPresets" :key="preset.id" :value="preset.id">{{ preset.name }}</option></select>
            <div><input v-model="presetName" :placeholder="t('presetName')" @keydown.enter="saveSelectedPreset"><button @click="saveSelectedPreset"><EditorIcon name="add" /></button></div>
          </section>
          <section v-show="inspectorTab === 'dependencies'" class="reference-summary">
            <strong>{{ t('assetReferences') }}</strong>
            <p>{{ t('referenceCount', { count: selectedReferences.length }) }}</p>
            <ul v-if="selectedReferences.length"><li v-for="owner in selectedReferences.slice(0, 8)" :key="owner"><button v-if="owner !== 'project'" @click="navigateAssetReference(owner)">{{ referenceName(owner) }}</button><span v-else>{{ referenceName(owner) }}</span></li></ul>
            <p>{{ t('dependencies') }}: {{ selectedAsset.pipeline?.dependencies.length ?? 0 }} · {{ t('reverseDependencies') }}: {{ selectedAsset.pipeline?.reverseDependencies.length ?? 0 }}</p>
            <ul v-if="selectedAsset.pipeline?.dependencies.length"><li v-for="dependency in selectedAsset.pipeline.dependencies.slice(0,8)" :key="dependency">→ <button @click="navigateAssetReference(dependency)">{{ referenceName(dependency) }}</button></li></ul>
            <ul v-if="selectedAsset.pipeline?.reverseDependencies.length"><li v-for="dependency in selectedAsset.pipeline.reverseDependencies.slice(0,8)" :key="dependency">← <button @click="navigateAssetReference(dependency)">{{ referenceName(dependency) }}</button></li></ul>
            <p v-if="selectedInclusion.length">{{ selectedInclusion.join(' · ') }}</p>
            <p v-else>{{ t('excludedFromBuild') }}</p>
            <p>{{ t('dependencyCycles') }}: {{ productionGraph.cycles.length }} · {{ t('duplicateSources') }}: {{ productionGraph.duplicateSources.length }} · {{ t('missingReferences') }}: {{ productionGraph.missingReferences.length }}</p>
            <details data-ui-motion-disclosure v-if="selectedContentClosure.length" class="content-closure"><summary>{{ t('contentClosure') }} · {{ selectedContentClosure.length }}</summary><article v-for="entry in selectedContentClosure.slice(0,32)" :key="entry.uuid" :class="{ invalid: entry.mode === 'excluded' }"><button @click="navigateAssetReference(entry.uuid)">{{ entry.path }}</button><small>{{ entry.groupId }} · {{ t(entry.mode) }}</small></article><p v-for="issue in selectedClosureIssues" :key="issue.uuid" class="pipeline-error">{{ issue.message }}</p></details>
          </section>
          <section v-show="inspectorTab === 'platform'" class="platform-overrides inspector-pane"><article v-for="platform in compressionPlatforms" :key="platform"><header><strong>{{ t(platform) }}</strong><input :checked="Boolean(selectedAsset.settings.platformOverrides[platform]?.enabled)" type="checkbox" @change="togglePlatformOverride(platform, $event)"></header><template v-if="selectedAsset.settings.platformOverrides[platform]?.enabled"><label><span>{{ t('compression') }}</span><select v-model="selectedAsset.settings.platformOverrides[platform]!.compression"><option>None</option><option>Lossless</option><option>Optimized</option></select></label><label><span>{{ t('maxSize') }}</span><select v-model.number="selectedAsset.settings.platformOverrides[platform]!.maxSize"><option :value="512">512</option><option :value="1024">1024</option><option :value="2048">2048</option><option :value="4096">4096</option><option :value="8192">8192</option></select></label><label><span>{{ t('format') }}</span><select v-model="selectedAsset.settings.platformOverrides[platform]!.format"><option>Auto</option><option>RGBA8</option><option>BC7</option><option>ASTC</option><option>ETC2</option></select></label></template></article></section>
          <div class="asset-actions"><button @click="reimportInput?.click()">{{ t('reimportAsset') }}</button><button @click="linkSelectedSource">{{ t('linkSource') }}</button><button @click="revealAsset">{{ t('revealAsset') }}</button><button class="danger" @click="removeSelectedAsset">{{ t('deleteAsset') }}</button></div>
          <input ref="reimportInput" hidden type="file" @change="reimportSelectedAsset">
          <p class="drag-hint">{{ t('dragAssetHint') }}</p>
        </aside>
      </div>

      <KeepAlive :key="projectSessionState.id"><component v-if="dockContentVisible && activeTool" :is="activeTool" :key="estate.bottomPanelTab" /></KeepAlive>
    </div>
  </section>
</template>

<script setup lang="ts">
import UiMotionTransition from '../ui/components/UiMotionTransition.vue'

import NumericExpressionInput from './NumericExpressionInput.vue'
import { computed, defineAsyncComponent, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import PanelMaximizeButton from './PanelMaximizeButton.vue'
import EditorIcon, { type EditorIconName } from './EditorIcon.vue'
import UiButton from '../ui/components/UiButton.vue'
import UiSlider from '../ui/components/UiSlider.vue'
import { useProjectInspectionSnapshot } from '../editor/projectInspectionSnapshot'
import { projectSessionState } from '../projects/projectSession'
import PanelResizeHandle from './PanelResizeHandle.vue'
import AssetImagePreview from './AssetImagePreview.vue'
import { emptyAssetBatch, importAssetBatch, reimportAssetBatch, reimportCandidates } from '../assets/assetBatch'
import { readAssetPixels } from '../assets/assetPixels'
import { createSpriteFrameAnimation } from '../assets/assetFrameAnimation'
import { assetWorkflowCopy as assetCopy } from '../assets/assetWorkflowCopy'
import { t } from '../i18n'
import { fontImportAvailabilityCopy } from '../editor/fontImportCopy'
import { addEditorLog, editorState as estate } from '../store/editor'
import { clearAssetReferences, countAssetReferences, getSceneJSON, physicsState as state, pushHistory, pushAssetReimportHistory, replaceAssetReferences } from '../store/physics'
import { requestConfirmation } from '../store/dialog'
import {
  applyAssetFilter, applyImportPreset, assetReference, assetSessionVersion, assetState as assets, createAssetCollection, createAssetFolder, createTextAsset, deleteAsset, filteredAssets,
  linkAssetSource, moveAsset, queueTextureAtlasRebuild, readTextAsset, reimportAsset, renameAsset, resolveExternalAssetChange, retryFailedAssetImport,
  saveCurrentAssetFilter, saveImportPreset, sliceSpriteSheet, toggleAssetFavorite, toggleAssetInCollection, trimTransparentImage
} from '../assets/AssetDatabase'
import type { AssetPipelineMetadata, AssetType } from '../assets/types'
import type { AudioImportProfile, TextureImportProfile } from '../assets/types'
import { applyBulkAssetSettings, buildContentClosure, buildProductionAssetGraph, compareImportMetadata, detectOpaqueRegions, fontGlyphCoverage, packAtlasDeterministic, polygonOutlineForRegion, provenanceDiagnostics, revertToVerifiedArtifact, validateContentClosure } from '../assets/assetProduction'
import { contentThumbnailDataUrl } from '../assets/contentLibrary26'
import { assetImportFailureSummary, assetImportTechnicalLabel } from '../assets/assetImportCopy'
import { preferencesState } from '../store/preferences'
import { applyAudioImportProfile, applyTextureImportProfile, normalizedFontFallbacks } from '../assets/importProfiles'
import { exportProjectFolder } from '../assets/projectFolder'
import { DEFAULT_SCRIPT_SOURCE } from '../editor/scriptTemplates'
import { openScriptAsset } from '../editor/scriptStudioState'
import { defaultVisualGraph } from '../visual/graphCatalog'
import { openEventSheetAsset, openGraphAsset } from '../visual/graphStudioState'
import { serializeGraphDocument } from '../visual/graphTypes'
import { applyEditorWorkspace, reorderBottomTab, workspaceState } from '../editor/workspaces'
import { animateBlockSize, animateReorder, beginNativeDrag, cancelMotion, captureRects, endNativeDrag } from '../ui/motion'
import { instantiatePrefab, replaceEntitiesWithPrefab } from '../runtime/prefabs'
import { createSceneAssetFromEntities, instantiateSceneAsset } from '../runtime/sceneInstances'
import { reimportAnimationClip } from '../runtime/animation'
import ContentAssetInspector from './ContentAssetInspector.vue'
import { buildAssetDependencyGraph, explainAssetBuildInclusion, findAssetReferences, repairMissingAssetReference, unusedAssetReport } from '../assets/assetGraph'
import { cancelAssetImport, importPipelineState } from '../assets/importPipeline'
import { sourceStatusFor } from '../runtime/teamWorkflow'
import { moveAssetToProjectTrash } from '../runtime/projectTrash'
import { projectScopeDirty } from '../runtime/projectTransactions'
import { pluginRuntime, pluginState } from '../runtime/plugins'
import { createResourceAsset, type ResourceKind } from '../runtime/resources'

const assetOperationError = ref('')
const assetBatch = ref(emptyAssetBatch()), assetDetailMode = ref(false), assetFullPage = ref(false)
let assetBatchController: AbortController | null = null
/** 向活动资源批处理发送取消信号。 */ function cancelAssetBatch(){assetBatchController?.abort()}
onBeforeUnmount(cancelAssetBatch)
watch(/* 返回 assets.selectedGuid 的当前值。 */ () => assets.selectedGuid, /** 选择资源时切换为资源详情模式。 */ value => { if(value) assetDetailMode.value = true })

// Bottom tools are substantial, mutually exclusive workspaces. Loading the
// inactive tools only when selected reduces cold-start parsing without changing
// a control, animation, or persisted panel state.
const AnimationPanel = defineAsyncComponent(/* 调用 import('./AnimationPanel.vue') 并返回调用结果。 */ () => import('./AnimationPanel.vue'))
const AudioSystemPanel = defineAsyncComponent(/* 调用 import('./AudioSystemPanel.vue') 并返回调用结果。 */ () => import('./AudioSystemPanel.vue'))
const ConsolePanel = defineAsyncComponent(/* 调用 import('./ConsolePanel.vue') 并返回调用结果。 */ () => import('./ConsolePanel.vue'))
const ProfilerPanel = defineAsyncComponent(/* 调用 import('./ProfilerPanel.vue') 并返回调用结果。 */ () => import('./ProfilerPanel.vue'))
const NetworkStudioPanel = defineAsyncComponent(/* 调用 import('./NetworkStudioPanel.vue') 并返回调用结果。 */ () => import('./NetworkStudioPanel.vue'))
const EcosystemStudioPanel = defineAsyncComponent(/* 调用 import('./EcosystemStudioPanel.vue') 并返回调用结果。 */ () => import('./EcosystemStudioPanel.vue'))
const TilemapPanel = defineAsyncComponent(/* 调用 import('./TilemapPanel.vue') 并返回调用结果。 */ () => import('./TilemapPanel.vue'))
const ChartEditorPanel = defineAsyncComponent(() => import('./ChartEditorPanel.vue'))
const WorldToolsPanel = defineAsyncComponent(/* 调用 import('./WorldToolsPanel.vue') 并返回调用结果。 */ () => import('./WorldToolsPanel.vue'))

const permanentTabs = [
  { id: 'assets' as const, icon: 'assets' as const, label: 'assets' as const }, { id: 'console' as const, icon: 'command' as const, label: 'console' as const },
  { id: 'animation' as const, icon: 'animation' as const, label: 'animation' as const }, { id: 'audio' as const, icon: 'audio' as const, label: 'audioMixer' as const }, { id: 'worldProduction' as const, icon: 'world' as const, label: 'worldStudio' as const }, { id: 'networkStudio' as const, icon: 'network' as const, label: 'networkStudio' as const }, { id: 'ecosystem' as const, icon: 'ecosystem' as const, label: 'ecosystemStudio' as const }, { id: 'profiler' as const, icon: 'profiler' as const, label: 'profiler' as const }
]
const pluginAssetContributions = computed(/* 调用 pluginState.contributions.filter(item => item.kind === 'importers' || item.kind === 'assetEditors') 并返回调用结果。 */ () => pluginState.contributions.filter(/* 先计算 item.kind === 'importers'；仅当其为假值时求右侧 item.kind === 'assetEditors'，返回短路求值结果。 */ item => item.kind === 'importers' || item.kind === 'assetEditors'))
const toolComponents = { console:ConsolePanel, profiler:ProfilerPanel, animation:AnimationPanel, audio:AudioSystemPanel, worldProduction:WorldToolsPanel, networkStudio:NetworkStudioPanel, ecosystem:EcosystemStudioPanel, tilemap:TilemapPanel, chart:ChartEditorPanel }
const activeTool = computed(()=>toolComponents[estate.bottomPanelTab as keyof typeof toolComponents] ?? null)
watch(()=>projectSessionState.id,()=>{cancelAssetBatch();assetDetailMode.value=false;assetFullPage.value=false;finishBottomDrag()})
const tabs = computed(/** 根据是否选中瓦片实体追加上下文标签，再按保存的标签顺序排列。 */ () => {
  const selected = state.world.entities.find(/* 比较 entity.id 与 state.selectedEntityId，返回严格相等的判断结果。 */ entity => entity.id === state.selectedEntityId)
  const contextual: Array<{ id: 'tilemap' | 'chart'; icon: 'grid' | 'audio'; label: 'tilemap' | 'chartEditor' }> = selected?.hasComponent('TileMap2D') ? [{ id: 'tilemap', icon: 'grid', label: 'tilemap' }] : []
  // 26.46: the chart editor appears for a selected RhythmChart2D or while a chart is open.
  if (selected?.hasComponent('RhythmChart2D') || estate.chartEditor || estate.bottomPanelTab === 'chart') contextual.push({ id: 'chart', icon: 'audio', label: 'chartEditor' })
  const available = [...permanentTabs, ...contextual]
  return [...available].sort(/* 计算表达式 workspaceState.bottomTabOrder.indexOf(a.id) - workspaceState.bottomTabOrder.indexOf(b.id) 并返回结果，沿用操作数的原有类型规则。 */ (a, b) => workspaceState.bottomTabOrder.indexOf(a.id) - workspaceState.bottomTabOrder.indexOf(b.id))
})
const assetFilters: Array<{ type: AssetType | 'all'; label: Parameters<typeof t>[0] }> = [
  { type: 'all', label: 'allAssets' }, { type: 'image', label: 'images' }, { type: 'audio', label: 'audioAssets' },
  { type: 'font', label: 'fontAssets' }, { type: 'scene', label: 'scenes' }, { type: 'prefab', label: 'prefabs' },
  { type: 'script', label: 'scripts' }, { type: 'material', label: 'materials' }, { type: 'animation', label: 'animations' },
  { type: 'visualScript', label: 'visualGraphs' },
  { type: 'controller', label: 'controllers' }, { type: 'animationMask', label: 'animationMasks' }, { type: 'rig', label: 'rigs' },
  { type: 'skin', label: 'skins' }, { type: 'timeline', label: 'timelines' }, { type: 'tileset', label: 'tileSets' }, { type: 'atlas', label: 'atlases' },
  { type: 'shader', label: 'shaders' }, { type: 'localization', label: 'localizationFiles' }, { type: 'uiTheme', label: 'uiThemes' },
  { type: 'dataSchema', label: 'dataSchema' }, { type: 'dataTable', label: 'dataTable' }, { type: 'resource', label: 'sharedResources' }, { type: 'replay', label: 'replayAssets' }, { type: 'path', label: 'pathAssets' }, { type: 'other', label: 'otherAssets' }
]
const resourceKinds:ResourceKind[]=['Material','AnimationLibrary','InputMap','PhysicsMaterial','Theme','DataTable']
const compressionPlatforms = ['windows', 'linux', 'macos', 'web'] as const
const pivotPresets = [
  { id: 'top-left', label: 'pivotTopLeft', value: { x: 0, y: 0 } }, { id: 'top', label: 'pivotTop', value: { x: .5, y: 0 } }, { id: 'top-right', label: 'pivotTopRight', value: { x: 1, y: 0 } },
  { id: 'left', label: 'pivotLeft', value: { x: 0, y: .5 } }, { id: 'center', label: 'center', value: { x: .5, y: .5 } }, { id: 'right', label: 'pivotRight', value: { x: 1, y: .5 } },
  { id: 'bottom-left', label: 'pivotBottomLeft', value: { x: 0, y: 1 } }, { id: 'bottom', label: 'pivotBottom', value: { x: .5, y: 1 } }, { id: 'bottom-right', label: 'pivotBottomRight', value: { x: 1, y: 1 } }
] as const
// Only open/close changes animate; stored sizes and separator edits stay immediate.
const dockRoot = ref<HTMLElement | null>(null)
const dockContent = ref<HTMLElement | null>(null)
const dockContentVisible = ref(estate.bottomPanelOpen)
const dockHeldHeight = ref<string | null>(null)
let dockMotionGeneration = 0
// The cap keeps a usable canvas on short windows; the tall preset may use up to ~64% of the window.
function dockNaturalHeight() { return estate.bottomPanelOpen ? `min(${estate.bottomPanelHeight}px, 64vh)` : 'auto' }
/** 26.44 G1: short, medium and tall dock heights (the medium one is the default height). */
const DOCK_PRESETS = [{ id: 'short', label: 'dockShort', height: 160, fill: 3 }, { id: 'medium', label: 'dockMedium', height: 280, fill: 5 }, { id: 'tall', label: 'dockTall', height: 440, fill: 8 }] as const
function setDockPreset(height: number) {
  const root = dockRoot.value
  if (!estate.bottomPanelOpen || !root?.isConnected) { estate.bottomPanelHeight = height; estate.bottomPanelOpen = true; return }
  if (estate.bottomPanelHeight === height) return
  const from = root.offsetHeight, generation = ++dockMotionGeneration
  cancelMotion(root)
  estate.bottomPanelHeight = height
  // Measure the new natural height in this task, then let the motion present the change.
  root.style.height = dockNaturalHeight()
  const to = root.offsetHeight
  root.style.height = to + 'px'; dockHeldHeight.value = to + 'px'
  animateBlockSize(root, from, to, () => { if (generation === dockMotionGeneration) dockHeldHeight.value = null })
}
function settleDockMotion() {
  ++dockMotionGeneration
  const root = dockRoot.value
  if (root) cancelMotion(root)
  dockHeldHeight.value = null
  dockContentVisible.value = estate.bottomPanelOpen
  if (root) root.style.height = dockNaturalHeight()
  if (dockContent.value) {
    dockContent.value.inert = !estate.bottomPanelOpen
    dockContent.value.style.display = estate.bottomPanelOpen ? '' : 'none'
  }
}
function prepareDockPrecision(event: Event) {
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('.panel-resize-handle')?.parentElement === dockRoot.value) settleDockMotion()
}
function onDockDragging(dragging: boolean) { if (dragging) settleDockMotion() }
watch(() => estate.bottomPanelOpen, async open => {
  const root = dockRoot.value
  if (!root || !root.isConnected) { dockContentVisible.value = open; return }
  const from = Number.parseFloat(getComputedStyle(root).height) || root.offsetHeight
  const generation = ++dockMotionGeneration
  cancelMotion(root)
  dockHeldHeight.value = from + 'px'
  dockContentVisible.value = true
  if (dockContent.value) {
    dockContent.value.inert = !open
    if (!open && dockContent.value.contains(document.activeElement)) root.querySelector<HTMLElement>('.panel-controls button[aria-expanded]')?.focus({ preventScroll: true })
  }
  await nextTick()
  if (generation !== dockMotionGeneration || !root.isConnected) return
  if (open && workspaceState.maximizedPanel === 'bottom') { settleDockMotion(); return }
  // Measure natural layout in the same task, then let WAAPI present the old height.
  root.style.height = open ? dockNaturalHeight() : 'auto'
  const style = getComputedStyle(root), number = (value: string) => Number.parseFloat(value) || 0
  const chrome = root.querySelector<HTMLElement>('.panel-tabs')?.offsetHeight ?? 0
  const collapsed = chrome + (style.boxSizing === 'border-box' ? number(style.paddingTop) + number(style.paddingBottom) + number(style.borderTopWidth) + number(style.borderBottomWidth) : 0)
  const to = open ? number(style.height) || root.offsetHeight : collapsed
  root.style.height = to + 'px'
  dockHeldHeight.value = to + 'px'
  animateBlockSize(root, from, to, () => {
    if (generation !== dockMotionGeneration) return
    dockHeldHeight.value = null
    dockContentVisible.value = estate.bottomPanelOpen
    if (dockContent.value) dockContent.value.inert = !estate.bottomPanelOpen
  })
}, { flush: 'pre' })
function bindDockResize() { window.addEventListener('resize', settleDockMotion) }
function unbindDockResize() { window.removeEventListener('resize', settleDockMotion) }
onMounted(bindDockResize)
onActivated(bindDockResize)
onDeactivated(() => { unbindDockResize(); settleDockMotion() })
onBeforeUnmount(() => { unbindDockResize(); settleDockMotion() })

const panelStyle = computed(() => ({ height: dockHeldHeight.value ?? dockNaturalHeight() }))
const assetGrid = ref<HTMLElement | null>(null)
const assetScrollTop = ref(0)
const assetViewportHeight = ref(320)
const assetViewportWidth = ref(800)
const assetOverscanRows = 4
const filteredAssetRecords = computed(/** 依赖资源代次重新计算资源筛选结果。 */ () => { void assets.generation; return filteredAssets() })
const filteredAssetCount = computed(/* 返回 filteredAssetRecords.value.length 的当前值。 */ () => filteredAssetRecords.value.length)
const assetRowHeight = computed(()=>56 * preferencesState.uiScale)
const assetGridGap = computed(()=>4 * preferencesState.uiScale)
const assetGridPadding = computed(()=>8 * preferencesState.uiScale)
const assetColumnCount = computed(()=>assets.viewMode==='list'?1:Math.max(1,Math.floor((assetViewportWidth.value - 2 * assetGridPadding.value + assetGridGap.value) / (Math.max(180,assets.thumbnailSize) * preferencesState.uiScale + assetGridGap.value))))
const assetRowStride = computed(()=>assetRowHeight.value + assetGridGap.value)
const assetStartRow = computed(/* 调用 Math.max(0, Math.floor(assetScrollTop.value / assetRowStride.value) - assetOverscanRows) 并返回调用结果。 */ () => Math.max(0, Math.floor(assetScrollTop.value / assetRowStride.value) - assetOverscanRows))
const assetVisibleRows = computed(/* 调用 Math.max(1, Math.ceil(assetViewportHeight.value / assetRowStride.value) + assetOverscanRows * 2) 并返回调用结果。 */ () => Math.max(1, Math.ceil(assetViewportHeight.value / assetRowStride.value) + assetOverscanRows * 2))
const assetWindowStart = computed(/* 调用 Math.min(filteredAssetCount.value, assetStartRow.value * assetColumnCount.value) 并返回调用结果。 */ () => Math.min(filteredAssetCount.value, assetStartRow.value * assetColumnCount.value))
const assetWindowEnd = computed(/* 调用 Math.min(filteredAssetCount.value, assetWindowStart.value + assetVisibleRows.value * assetColumnCount.value) 并返回调用结果。 */ () => Math.min(filteredAssetCount.value, assetWindowStart.value + assetVisibleRows.value * assetColumnCount.value))
const displayedAssets = computed(/* 调用 filteredAssetRecords.value.slice(assetWindowStart.value, assetWindowEnd.value) 并返回调用结果。 */ () => filteredAssetRecords.value.slice(assetWindowStart.value, assetWindowEnd.value))
const assetTotalRows = computed(/* 调用 Math.ceil(filteredAssetCount.value / assetColumnCount.value) 并返回调用结果。 */ () => Math.ceil(filteredAssetCount.value / assetColumnCount.value))
const assetGridStyle = computed(()=>({
  '--asset-thumbnail-size':`${40 * preferencesState.uiScale}px`,
  gridTemplateColumns:`repeat(${assetColumnCount.value},minmax(0,1fr))`,
  gridAutoRows:`${assetRowHeight.value}px`,
  gap:`${assetGridGap.value}px`,
  paddingInline:`${assetGridPadding.value}px`,
  paddingTop:`${assetGridPadding.value + assetStartRow.value * assetRowStride.value}px`,
  paddingBottom:`${assetGridPadding.value + Math.max(0,assetTotalRows.value - Math.ceil(assetWindowEnd.value/assetColumnCount.value)) * assetRowStride.value}px`
}))
const visibleFolders = computed(/** 隐藏内部 .nova 目录。 */ () => assets.folders.filter(/* 返回 folder.startsWith('.nova/') 的逻辑取反结果。 */ folder => !folder.startsWith('.nova/')))
const selectedAsset = computed(/** 查找当前选中资源记录。 */ () => assets.records.find(/* 比较 asset.uuid 与 assets.selectedGuid，返回严格相等的判断结果。 */ asset => asset.uuid === assets.selectedGuid) ?? null)
watch(/* 返回 selectedAsset.value?.uuid 的当前值。 */ () => selectedAsset.value?.uuid, /** 资源选择变化时清除上一次操作错误。 */ () => { assetOperationError.value = '' })
const projectSnapshot = useProjectInspectionSnapshot()
const assetGraph = computed(/* 调用 buildAssetDependencyGraph(assets.records, projectSnapshot.value) 并返回调用结果。 */ () => buildAssetDependencyGraph(assets.records, projectSnapshot.value))
const productionGraph = computed(/* 调用 buildProductionAssetGraph(assets.records, projectSnapshot.value) 并返回调用结果。 */ () => buildProductionAssetGraph(assets.records, projectSnapshot.value))
const selectedReferences = computed(/* 根据 selectedAsset.value 的真假，分别返回 findAssetReferences(selectedAsset.value.uuid, assets.records, projectSnapshot.value) 或 []。 */ () => selectedAsset.value ? findAssetReferences(selectedAsset.value.uuid, assets.records, projectSnapshot.value) : [])
const selectedInclusion = computed(/* 根据 selectedAsset.value 的真假，分别返回 explainAssetBuildInclusion(selectedAsset.value.uuid, assets.records, projectSnapshot.value) 或 []。 */ () => selectedAsset.value ? explainAssetBuildInclusion(selectedAsset.value.uuid, assets.records, projectSnapshot.value) : [])
const selectedTextSource = computed(/* 根据 selectedAsset.value 的真假，分别返回 readTextAsset(selectedAsset.value.uuid) ?? '' 或 ''。 */ () => selectedAsset.value ? readTextAsset(selectedAsset.value.uuid) ?? '' : '')
const importJobs = computed(/* 返回 importPipelineState.jobs 的当前值。 */ () => importPipelineState.jobs)
const externalChanges = computed(/* 返回 importPipelineState.externalChanges 的当前值。 */ () => importPipelineState.externalChanges)
const missingReferenceIds = computed(/** 收集并去重缺失资源引用。 */ () => [...new Set(assetGraph.value.missingReferences.map(/* 返回 item.reference 的当前值。 */ item => item.reference))])
const animationSources = computed(/* 调用 assets.records.filter(asset => asset.assetType === 'animation' && asset.uuid !== selectedAsset.value?.uuid) 并返回调用结果。 */ () => assets.records.filter(/* 先计算 asset.assetType === 'animation'；仅当其为真值时求右侧 asset.uuid !== selectedAsset.value?.uuid，返回短路求值结果。 */ asset => asset.assetType === 'animation' && asset.uuid !== selectedAsset.value?.uuid))
const assetInput = ref<HTMLInputElement | null>(null)
const reimportInput = ref<HTMLInputElement | null>(null)
const assetOverflow = ref<HTMLDetailsElement | null>(null)
const creatingFolder = ref(false), newFolderName = ref('')
const renamingGuid = ref<string | null>(null), renameValue = ref('')
const repairMode = ref(false), selectedMissingReference = ref(''), replacementAssetGuid = ref('')
const filterMenuOpen = ref(false), filterQuery = ref(''), savedFilterName = ref(''), presetName = ref(''), collectionName = ref('')
const importerTabs = ['source', 'import', 'dependencies', 'provenance', 'platform'] as const
const inspectorTab = ref<(typeof importerTabs)[number]>('source')
const previousPipeline = ref<AssetPipelineMetadata | null>(null), importComparisonText = ref('')
const draggedTab = ref<(typeof permanentTabs)[number]['id'] | 'tilemap' | 'chart' | null>(null)
const tabStrip = ref<HTMLElement | null>(null)
const dropTabTarget = ref<typeof draggedTab.value>(null)
const draggedAssetGuid = ref(''), dropFolder = ref(''), folderDropValid = ref(false)
function tabElements() { return tabStrip.value?.querySelectorAll<HTMLElement>('.panel-tab') ?? [] }
function finishBottomDrag() { draggedTab.value = null; dropTabTarget.value = null; draggedAssetGuid.value = ''; dropFolder.value = ''; endNativeDrag() }
function disposeBottomDrag() { for (const element of tabElements()) cancelMotion(element); finishBottomDrag() }
onDeactivated(disposeBottomDrag)
function startTabDrag(event: DragEvent, id: NonNullable<typeof draggedTab.value>) {
  draggedTab.value = id
  event.dataTransfer?.setData('application/x-nova-bottom-tab', id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  beginNativeDrag(event, (event.currentTarget as HTMLElement).textContent?.trim() ?? id)
}
function previewTabDrop(event: DragEvent, id: NonNullable<typeof draggedTab.value>) {
  if (!draggedTab.value || draggedTab.value === id) { dropTabTarget.value = null; return }
  event.preventDefault(); dropTabTarget.value = id
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}
const filteredTypeFilters = computed(/* 调用 assetFilters.filter(filter => t(filter.label).toLowerCase().includes(filterQuery.value.trim().toLowerCase())) 并返回调用结果。 */ () => assetFilters.filter(/* 调用 t(filter.label).toLowerCase().includes(filterQuery.value.trim().toLowerCase()) 并返回调用结果。 */ filter => t(filter.label).toLowerCase().includes(filterQuery.value.trim().toLowerCase())))
const activeFilterLabel = computed(/** 根据当前资源类型过滤项返回本地化标签。 */ () => t(assetFilters.find(/* 比较 filter.type 与 assets.typeFilter，返回严格相等的判断结果。 */ filter => filter.type === assets.typeFilter)?.label ?? 'allAssets'))
const compatibleImportPresets = computed(/** 筛选适用于当前资源类型或全部资源的导入预设。 */ () => selectedAsset.value ? assets.importPresets.filter(/* 先计算 preset.assetType === 'all'；仅当其为假值时求右侧 preset.assetType === selectedAsset.value?.assetType，返回短路求值结果。 */ preset => preset.assetType === 'all' || preset.assetType === selectedAsset.value?.assetType) : [])
const selectedAssetTags = computed({ get: /* 当 selectedAsset.value?.tags?.join(', ') 为 null 或 undefined 时返回 ''，否则保留左侧值。 */ () => selectedAsset.value?.tags?.join(', ') ?? '', set: /** 清理资源标签文本，去重排序并限制最多六十四项。 */ value => { if (selectedAsset.value) selectedAsset.value.tags = [...new Set(value.split(',').map(/* 调用 tag.trim() 并返回调用结果。 */ tag => tag.trim()).filter(Boolean))].sort().slice(0, 64) } })
const selectedProvenanceDiagnostics = computed(/* 根据 selectedAsset.value 的真假，分别返回 provenanceDiagnostics(selectedAsset.value) 或 []。 */ () => selectedAsset.value ? provenanceDiagnostics(selectedAsset.value) : [])
const selectedGlyphReport = computed(/* 根据 selectedAsset.value?.assetType === 'font' 的真假，分别返回 fontGlyphCoverage(selectedAsset.value) 或 []。 */ () => selectedAsset.value?.assetType === 'font' ? fontGlyphCoverage(selectedAsset.value) : [])
const selectedContentClosure = computed(/** 为所选资源计算构建依赖闭包。 */ () => selectedAsset.value ? buildContentClosure(assets.records, assets.contentGroups, [selectedAsset.value.uuid], projectSnapshot.value) : [])
const selectedClosureIssues = computed(/* 调用 validateContentClosure(selectedContentClosure.value) 并返回调用结果。 */ () => validateContentClosure(selectedContentClosure.value))
const selectedAtlasReport = computed(/** 仅对图集资源，按同组已启用图片生成确定性图集布局预览。 */ () => {
  const asset = selectedAsset.value
  if (asset?.assetType !== 'atlas') return null
  const group = asset.settings.atlasSettings.group || 'default'
  return packAtlasDeterministic(assets.records.filter(/** 筛选启用图集合并且分组匹配的图片。 */ candidate => candidate.assetType === 'image' && candidate.settings.atlas && (candidate.settings.atlasSettings.group || 'default') === group).map(/** 提取图片标识、尺寸和分组用于图集装箱。 */ candidate => ({ uuid: candidate.uuid, width: candidate.width, height: candidate.height, group })), { maxSize: asset.settings.atlasSettings.maxSize, padding: asset.settings.atlasSettings.padding, rotationPolicy: asset.settings.atlasSettings.rotationPolicy })
})
watch(/** 监听搜索、目录、类型、标签、收藏、集合和视图尺寸等资源过滤条件。 */ () => [assets.search, assets.currentFolder, assets.typeFilter, assets.tagFilter, assets.selectedCollectionId, assets.favoritesOnly, assets.viewMode, assets.thumbnailSize], /** 过滤条件变化时重置滚动记录和实际视口。 */ () => {
  assetScrollTop.value = 0
  if (assetGrid.value) assetGrid.value.scrollTop = 0
})
let assetResizeObserver: ResizeObserver | null = null
/** 以当前列表元素的实际尺寸更新虚拟窗口，避免继续使用被卸载列表的缓存尺寸。 */
function measureAssetViewport() {
  if (!assetGrid.value) return
  assetViewportHeight.value = Math.max(1, assetGrid.value.clientHeight)
  assetViewportWidth.value = Math.max(1, assetGrid.value.clientWidth)
}
/** 标签切换重建列表时转移观察目标，并恢复该资源窗口已有的滚动位置。 */
watch(assetGrid, /** 资源网格引用变化时解除旧观察，恢复滚动并测量新视口及注册尺寸观察。 */ (element, previous) => {
  if (previous) assetResizeObserver?.unobserve(previous)
  if (!element) return
  element.scrollTop = assetScrollTop.value
  measureAssetViewport()
  assetResizeObserver?.observe(element)
}, { flush:'post' })
onMounted(/* 首次挂载连接当前元素；后续元素替换交给上面的引用监听处理。 */ () => {
  measureAssetViewport()
  if (typeof ResizeObserver !== 'undefined') { assetResizeObserver = new ResizeObserver(measureAssetViewport); if (assetGrid.value) assetResizeObserver.observe(assetGrid.value) }
})
onBeforeUnmount(/* 关闭底栏组件时释放全部元素观察，避免保留旧 DOM。 */ () => { assetResizeObserver?.disconnect(); disposeBottomDrag() })
/* 根据 value 的真假，分别返回 JSON.parse(JSON.stringify(value)) as AssetPipelineMetadata 或 null。 */ function clonePipelineMetadata(value: AssetPipelineMetadata | undefined): AssetPipelineMetadata | null {
  // Asset records are exposed through Vue's reactive database. The import
  // metadata itself is JSON-owned project data, so clone it across that
  // boundary without handing a Proxy to the browser structured-clone API.
  return value ? JSON.parse(JSON.stringify(value)) as AssetPipelineMetadata : null
}
watch(/* 返回 selectedAsset.value?.uuid 的当前值。 */ () => selectedAsset.value?.uuid, /** 选择变化时重置资源检查标签和导入比较，保存当前流水线基线。 */ () => { inspectorTab.value = 'source'; importComparisonText.value = ''; previousPipeline.value = clonePipelineMetadata(selectedAsset.value?.pipeline) })
/** 切换指定底部标签并展开面板。 */ function openTab(id: (typeof permanentTabs)[number]['id'] | 'tilemap' | 'chart') { estate.bottomPanelTab = id; estate.bottomPanelOpen = true }
/** 按资源、动画、音频或瓦片标签映射项目未保存范围。 */ function tabDirty(id:(typeof permanentTabs)[number]['id']|'tilemap'|'chart'){return id==='assets'?projectScopeDirty('asset'):id==='animation'?projectScopeDirty('animation'):id==='audio'?projectScopeDirty('settings'):id==='tilemap'?projectScopeDirty('scene'):false}
/** Commit tab order immediately; only the mounted neighbors settle afterward. */ function dropTab(event: DragEvent, target: (typeof permanentTabs)[number]['id'] | 'tilemap' | 'chart') {
  if (!draggedTab.value || draggedTab.value === target) return
  event.preventDefault()
  const before = captureRects(tabElements())
  reorderBottomTab(draggedTab.value, target)
  finishBottomDrag()
  void nextTick(() => animateReorder(before, tabElements()))
}
/** 未固定、未最大化且焦点不在底部面板时自动收起。 */ function autoHide() {
  if (!draggedTab.value && !draggedAssetGuid.value && !estate.bottomPanelPinned && workspaceState.maximizedPanel!=='bottom' && !document.activeElement?.closest('.bottom-panel')) estate.bottomPanelOpen = false
}
watch(/* 返回 estate.bottomPanelOpen 的当前值。 */ () => estate.bottomPanelOpen, /** 底部面板关闭时清除其最大化状态。 */ open => { if (!open && workspaceState.maximizedPanel==='bottom') workspaceState.maximizedPanel='' })
/** 无批处理运行时导入选择文件，使用取消控制器和会话标识保护异步结果，成功选中新资源并记录历史。 */ async function importFiles(event: Event) {
  const input=event.target as HTMLInputElement,files=[...(input.files??[])];input.value=''
  if(!files.length||assetBatch.value.active)return
  const session=assetSessionVersion(),controller=new AbortController();assetBatchController=controller;assetOperationError.value=''
  try{const result=await importAssetBatch(files,assets.currentFolder==='Assets'?undefined:assets.currentFolder,{signal:controller.signal,progress:/** 将资源导入进度替换为界面批处理状态。 */ value=>assetBatch.value=value})
    if(session===assetSessionVersion() && result.assets.length){const latest=result.assets.at(-1)!;assets.selectedGuid=latest.uuid;assets.currentFolder=latest.path.slice(0,latest.path.lastIndexOf('/'));pushHistory('Import assets');addEditorLog(t('assetsImported',{count:result.assets.length}),'Assets')}
  }catch(error){assetOperationError.value=error instanceof Error?error.message:String(error)}finally{if(assetBatchController===controller)assetBatchController=null}
}

/** Native resource preview follows the cursor exactly, preserving the existing GUID payload. */ function dragAsset(event: DragEvent, guid: string) { draggedAssetGuid.value = guid; event.dataTransfer?.setData('application/x-nova-asset-guid', guid); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copyMove'; beginNativeDrag(event, assets.records.find(asset => asset.uuid === guid)?.name ?? guid) }
function previewFolderDrop(event: DragEvent, folder: string) {
  if (!draggedAssetGuid.value) return
  const asset = assets.records.find(record => record.uuid === draggedAssetGuid.value)
  dropFolder.value = folder
  folderDropValid.value = Boolean(asset && !asset.path.startsWith('.nova/') && asset.path.slice(0, asset.path.lastIndexOf('/')) !== folder)
  if (folderDropValid.value) event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = folderDropValid.value ? 'move' : 'none'
}
function leaveFolderDrop(event: DragEvent, folder: string) { if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null) && dropFolder.value === folder) dropFolder.value = '' }
/** 确认资源移动预览及引用保留信息后移动，成功记录历史日志。 */ async function dropOnFolder(event: DragEvent, folder: string) {
  const guid = event.dataTransfer?.getData('application/x-nova-asset-guid'), asset = assets.records.find(/* 比较 record.uuid 与 guid，返回严格相等的判断结果。 */ record => record.uuid === guid)
  if (!guid || !asset || asset.path.startsWith('.nova/') || asset.path.slice(0, asset.path.lastIndexOf('/')) === folder) { finishBottomDrag(); return }
  event.preventDefault(); finishBottomDrag()
  const references = findAssetReferences(guid, assets.records, projectSnapshot.value)
  const approved = await requestConfirmation({ title: t('moveAssetPreview'), message: `${asset.path}\n→ ${folder}/${asset.name}\n\n${t('referencesPreserved', { count: references.length })}\n${references.slice(0,8).map(referenceName).join('\n')}`, confirmLabel: t('moveAsset'), cancelLabel: t('cancel'), destructive: false })
  if (approved && moveAsset(guid, folder)) { pushHistory('Move asset'); addEditorLog(t('assetMoved'), 'Assets') }
}
/** 创建资源文件夹成功后清理输入并记录历史日志。 */ function createFolder() { if (createAssetFolder(assets.currentFolder, newFolderName.value)) { addEditorLog(t('folderCreated'), 'Assets'); newFolderName.value = ''; creatingFolder.value = false; pushHistory('Create asset folder') } }
/** 创建默认 Rhai 脚本资源，选中并记录历史日志。 */ function createScriptAsset() {
  const asset = createTextAsset(t('newScriptName'), 'script', DEFAULT_SCRIPT_SOURCE, 'Assets/Scripts')
  assets.selectedGuid = asset.uuid
  pushHistory('Create script asset')
  addEditorLog(t('scriptCreated', { name: asset.name }), 'Assets')
}
/** 创建默认可视图资源，选中、记录历史并打开图编辑器。 */ function createVisualGraphAsset() {
  const graph = defaultVisualGraph(t('newVisualGraph'))
  const asset = createTextAsset(t('newVisualGraph'), 'visualScript', serializeGraphDocument(graph), 'Assets/Visual Scripts')
  assets.selectedGuid = asset.uuid
  pushHistory('Create visual graph asset')
  addEditorLog(t('visualGraphCreated', { name: asset.name }), 'Assets')
  openInGraphStudio(asset.uuid)
}
/** 从已选实体创建场景资源，成功选中并定位场景目录。 */ function createSceneAssetFromSelection() {
  const reference = createSceneAssetFromEntities(state.selectedEntityIds, t('newSceneAssetName'))
  if (!reference) return
  assets.selectedGuid = reference.slice('asset://'.length)
  assets.currentFolder = 'Assets/Scenes'
  addEditorLog(t('sceneAssetCreated'), 'Assets')
}
/** 创建指定类型的共享资源，选中目录并记录资源历史。 */ function createSharedResource(kind:ResourceKind){const label=t(`resource_${kind}` as Parameters<typeof t>[0]),asset=createResourceAsset(kind,label);assets.selectedGuid=asset.uuid;assets.currentFolder=asset.path.slice(0,asset.path.lastIndexOf('/'));pushHistory('Create shared resource',`resource:${asset.uuid}`)}
/** 关闭资源更多操作详情菜单。 */ function closeAssetOverflow(){assetOverflow.value?.removeAttribute('open')}
/** 打开脚本资源并切换脚本工作区。 */ function openInScriptStudio(uuid: string) { openScriptAsset(uuid); applyEditorWorkspace('script') }
/** 打开图资源并切换脚本工作区。 */ function openInGraphStudio(uuid: string) { openGraphAsset(uuid); applyEditorWorkspace('script') }
/** 打开事件表并切换脚本工作区。 */ function openInEventSheetStudio(uuid: string) { openEventSheetAsset(uuid); applyEditorWorkspace('script') }
/** 选中动画资源，展开动画面板并切换动画工作区。 */ function openAnimationAsset(uuid:string){assets.selectedGuid=uuid;estate.bottomPanelTab='animation';estate.bottomPanelOpen=true;applyEditorWorkspace('animation')}
/** 按资源类型分派图、事件、代码、动画或音频编辑器，其他资源选择合适的导入或源标签。 */ function openAssetEditor(uuid: string) {
  const asset = assets.records.find(/* 比较 record.uuid 与 uuid，返回严格相等的判断结果。 */ record => record.uuid === uuid); if (!asset) return
  assets.selectedGuid = uuid
  if (asset.assetType === 'visualScript') { openInGraphStudio(uuid); return }
  if (asset.assetType === 'eventSheet') { openInEventSheetStudio(uuid); return }
  if (asset.assetType === 'script' || asset.assetType === 'shader') { openInScriptStudio(uuid); return }
  if (['animation','controller','animationMask','rig','skin','timeline'].includes(asset.assetType)) { openAnimationAsset(uuid); return }
  if (asset.assetType === 'audio') { estate.bottomPanelTab = 'audio'; return }
  inspectorTab.value = asset.assetType === 'image' || asset.assetType === 'font' || asset.assetType === 'atlas' || asset.assetType === 'tileset' ? 'import' : 'source'
}
/** 记录资源滚动位置及视口宽高供虚拟化计算。 */ function updateAssetWindow(event: Event) {
  const element = event.currentTarget as HTMLElement
  assetScrollTop.value = Math.max(0, element.scrollTop)
  assetViewportHeight.value = Math.max(1, element.clientHeight)
  assetViewportWidth.value = Math.max(1, element.clientWidth)
}
/** 创建集合，按需加入所选资源并递增资源代次。 */ function createCollection() { const collection = createAssetCollection(collectionName.value); if (!collection) return; collectionName.value = ''; if (selectedAsset.value) toggleAssetInCollection(selectedAsset.value.uuid, collection.id); assets.generation++ }
/** 切换选中资源的集合成员状态并递增代次。 */ function toggleSelectedCollection(collectionId: string) { if (!selectedAsset.value) return; toggleAssetInCollection(selectedAsset.value.uuid, collectionId); assets.generation++ }
/** 只允许关闭教程目录资源，删除后清除选择并记录教程关闭日志。 */ function dismissTutorial() { const asset = selectedAsset.value; if (!asset || !asset.path.startsWith('Assets/Tutorials/')) return; deleteAsset(asset.uuid); assets.selectedGuid = null; addEditorLog(t('tutorialDismissed'), 'Project') }
/** 复制资源详情，剪贴板失败则在状态栏展示原值。 */ async function copyAssetDetail(value: string) { try { await navigator.clipboard.writeText(value); estate.statusText = t('copied') } catch { estate.statusText = value } }
/** 编辑模式将选中预制体实例化到画布中心或世界原点，成功记录历史日志。 */ function instantiateSelectedPrefab() {
  const asset = selectedAsset.value
  if (!asset || asset.assetType !== 'prefab' || state.playMode !== 'editing') return
  const canvas = document.querySelector<HTMLElement>('.canvas-container')
  const rect = canvas?.getBoundingClientRect()
  const point = rect
    ? state.camera.screenToWorld({ x: rect.width / 2, y: rect.height / 2 })
    : { x: 0, y: 0 }
  const entities = instantiatePrefab(assetReference(asset.uuid), point)
  if (!entities.length) return
  pushHistory('Instantiate prefab')
  addEditorLog(t('prefabInstantiated', { name: asset.name }), 'Assets')
}
/** 编辑模式用选中预制体替换当前实体选择并记录数量。 */ function replaceSelectionWithSelectedPrefab() {
  const asset = selectedAsset.value
  if (!asset || asset.assetType !== 'prefab' || state.playMode !== 'editing' || !state.selectedEntityIds.length) return
  const replacements = replaceEntitiesWithPrefab([...state.selectedEntityIds], assetReference(asset.uuid))
  if (replacements.length) addEditorLog(t('selectionReplacedWithPrefab', { count: replacements.length }), 'Assets')
}
/** 编辑模式将选中场景资源实例化到视口中心或原点，成功记录历史日志。 */ function instantiateSelectedScene() {
  const asset = selectedAsset.value
  if (!asset || asset.assetType !== 'scene' || state.playMode !== 'editing') return
  const canvas = document.querySelector<HTMLElement>('.canvas-container')
  const rect = canvas?.getBoundingClientRect()
  const point = rect ? state.camera.screenToWorld({ x: rect.width / 2, y: rect.height / 2 }) : { x: 0, y: 0 }
  const entities = instantiateSceneAsset(assetReference(asset.uuid), point)
  if (!entities.length) return
  pushHistory('Instantiate scene')
  addEditorLog(t('sceneInstantiated', { name: asset.name }), 'Assets')
}
/** 开始资源重命名并等待 DOM 后选中输入文本。 */ function startRename(guid: string, name: string) { renamingGuid.value = guid; renameValue.value = name; void nextTick(/* 调用 document.querySelector<HTMLInputElement>('.asset-grid article input')?.select() 并返回调用结果。 */ () => document.querySelector<HTMLInputElement>('.asset-grid article input')?.select()) }
/** 跳过内部资源和未变名称，确认引用保留预览后执行重命名并记录历史。 */ async function commitRename() {
  const guid = renamingGuid.value, asset = assets.records.find(/* 比较 record.uuid 与 guid，返回严格相等的判断结果。 */ record => record.uuid === guid)
  if (!guid || !asset) return
  renamingGuid.value = null
  if (asset.path.startsWith('.nova/') || renameValue.value.trim() === asset.name) return
  const references = findAssetReferences(guid, assets.records, projectSnapshot.value)
  const approved = await requestConfirmation({ title: t('renameAssetPreview'), message: `${asset.name} → ${renameValue.value.trim()}\n\n${t('referencesPreserved', { count: references.length })}\n${references.slice(0,8).map(referenceName).join('\n')}`, confirmLabel: t('renameAsset'), cancelLabel: t('cancel'), destructive: false })
  if (approved && renameAsset(guid, renameValue.value)) { pushHistory('Rename asset'); addEditorLog(t('assetRenamed'), 'Assets') }
}
/** 确认删除及引用影响后清理引用并移入项目回收站，成功记录历史和警告日志。 */ async function removeSelectedAsset() {
  const asset = selectedAsset.value
  if (!asset) return
  const referenceCount = countAssetReferences(asset.uuid)
  const owners = findAssetReferences(asset.uuid, assets.records, projectSnapshot.value)
  const approved = await requestConfirmation({ title: t('deleteAsset'), message: `${t('deleteAssetConfirm', { name: asset.name, count: referenceCount })}\n\n${owners.slice(0,12).map(referenceName).join('\n') || t('noReferences')}`, confirmLabel: t('deleteAsset'), cancelLabel: t('cancel'), destructive: true })
  if (!approved) return
  clearAssetReferences(asset.uuid)
  if (!moveAssetToProjectTrash(asset.uuid, referenceCount)) return
  pushHistory('Move asset to project trash', `asset:${asset.uuid}`, asset.path); addEditorLog(t('assetMovedToTrash'), 'Assets', 'warning')
}
/** 打开选中资源所在目录并在状态栏显示路径。 */ function revealAsset() { const asset = selectedAsset.value; if (!asset) return; assets.currentFolder = asset.path.slice(0, asset.path.lastIndexOf('/')); estate.statusText = asset.path }
/** 按像素画开关把图片滤镜设为最近邻或线性。 */ function setPixelArtMode(event: Event) { if (selectedAsset.value?.assetType === 'image') selectedAsset.value.settings.filterMode = (event.target as HTMLInputElement).checked ? 'Nearest' : 'Linear' }
/** 为图片应用所选纹理导入档。 */ function setTextureProfile(event: Event) { const asset = selectedAsset.value; if (asset?.assetType === 'image') applyTextureImportProfile(asset.settings, (event.target as HTMLSelectElement).value as TextureImportProfile) }
/** 为音频应用所选音频导入档。 */ function setAudioProfile(event: Event) { const asset = selectedAsset.value; if (asset?.assetType === 'audio') applyAudioImportProfile(asset.settings, (event.target as HTMLSelectElement).value as AudioImportProfile) }
/** 规范化字体回退家族列表。 */ function setFontFallbacks(event: Event) { const asset = selectedAsset.value; if (asset?.assetType === 'font') asset.settings.fontSettings.fallbackFamilies = normalizedFontFallbacks((event.target as HTMLInputElement).value) }
/** 解析合法四字符 OpenType 标签，去重排序并限制六十四项。 */ function setOpenTypeFeatures(event: Event) { const asset = selectedAsset.value; if (asset?.assetType === 'font') asset.settings.fontSettings.openTypeFeatures = [...new Set((event.target as HTMLInputElement).value.split(',').map(/* 调用 value.trim() 并返回调用结果。 */ value => value.trim()).filter(/* 调用 /^[a-z0-9]{4}$/i.test(value) 并返回调用结果。 */ value => /^[a-z0-9]{4}$/i.test(value)))].sort().slice(0, 64) }
/** 清理声明语言列表，去重排序并限制六十四项。 */ function setDeclaredLanguages(event: Event) { const asset = selectedAsset.value; if (asset?.assetType === 'font') asset.settings.fontSettings.declaredLanguages = [...new Set((event.target as HTMLInputElement).value.split(',').map(/* 调用 value.trim() 并返回调用结果。 */ value => value.trim()).filter(Boolean))].sort().slice(0, 64) }
/** 启用时从当前压缩与图集设置创建平台覆盖，禁用时删除该覆盖。 */ function togglePlatformOverride(platform: typeof compressionPlatforms[number], event: Event) {
  const asset = selectedAsset.value; if (!asset) return
  if ((event.target as HTMLInputElement).checked) asset.settings.platformOverrides[platform] = { enabled: true, compression: asset.settings.platformVariants[platform] ?? asset.settings.compression, maxSize: asset.settings.atlasSettings.maxSize, format: 'Auto' }
  else delete asset.settings.platformOverrides[platform]
}
/** 读取图片像素并检测不透明区域，提交前检查资源未变化，保存切片及首片轮廓并记录历史。 */ async function autoSliceSelectedImage() {
  const asset = selectedAsset.value; if (!asset || asset.assetType !== 'image') return
  try {
    assetOperationError.value = ''
    const pixels = await readAssetPixels(asset, assets.records), {width, height, data: rgba} = pixels, alpha = new Uint8Array(width * height)
    for (let index = 0; index < alpha.length; index++) alpha[index] = rgba[index * 4 + 3]
    const regions = detectOpaqueRegions(width, height, alpha).slice(0, 4096)
    pixels.assertCurrent()
    asset.settings.extractedAnimationFrames = regions
    if (regions[0]) { asset.settings.spriteRegion = regions[0]; asset.settings.polygonOutline = polygonOutlineForRegion(regions[0]) }
    assets.generation++; pushHistory('Automatically slice sprite', `asset:${asset.uuid}`); addEditorLog(t('automaticSlicesCreated', { count: regions.length }), 'Assets', regions.length ? 'info' : 'warning')
  } catch (error) { assetOperationError.value = error instanceof Error ? error.message : String(error); addEditorLog(assetOperationError.value, 'Assets', 'error') }
}
/** 启用精灵区域时使用整张图片边界，否则清除区域。 */ function toggleSpriteRegion(event: Event) {
  const asset = selectedAsset.value
  if (!asset || asset.assetType !== 'image') return
  asset.settings.spriteRegion = (event.target as HTMLInputElement).checked
    ? { x: 0, y: 0, width: Math.max(1, asset.width), height: Math.max(1, asset.height) }
    : null
}
/** 资源设置改变时排队重建图集，并按事件字段记录历史范围。 */ function assetSettingsChanged(event: Event) {
  const asset = selectedAsset.value
  if (!asset) return
  const target = event.target instanceof HTMLElement ? event.target : null
  const field = target?.closest<HTMLElement>('[data-resource-key]')?.dataset.resourceKey
  queueTextureAtlasRebuild()
  pushHistory('Change import settings', field ? 'asset-field:' + field : null, field || 'asset:' + asset.uuid)
}
/** 重新导入带动画导入配置的资源，成功增加代次并记录历史日志。 */ function reimportAnimation() {
  const asset = selectedAsset.value
  if (!asset?.animationImport) return
  if (!reimportAnimationClip(asset)) { addEditorLog(t('animationReimportFailed'), 'Assets', 'error'); return }
  assets.generation++
  pushHistory('Reimport animation', `asset:${asset.uuid}`)
  addEditorLog(t('animationReimported', { name: asset.name }), 'Assets')
}
/** 复制所选枢轴预设到资源并记录历史。 */ function applyPivotPreset(id: string) { const asset = selectedAsset.value, preset = pivotPresets.find(/* 比较 candidate.id 与 id，返回严格相等的判断结果。 */ candidate => candidate.id === id); if (!asset || !preset) return; asset.settings.pivot = { ...preset.value }; pushHistory('Set sprite pivot preset', `asset:${asset.uuid}`) }
/** 裁剪透明图片成功后记录历史，失败显示错误。 */ async function trimSelectedImage() { const asset = selectedAsset.value; if (!asset) return; assetOperationError.value = ''; try { if (await trimTransparentImage(asset)) { pushHistory('Trim transparent sprite', `asset:${asset.uuid}`); addEditorLog(t('transparentTrimApplied'), 'Assets') } } catch(error) { assetOperationError.value = error instanceof Error ? error.message : String(error) } }
/** 从所选帧创建动画并打开，失败显示错误。 */ function animateSelectedFrames() { const asset = selectedAsset.value; if (!asset) return; assetOperationError.value = ''; try { const animation = createSpriteFrameAnimation(asset); pushHistory('Create sprite animation', `asset:${animation.uuid}`); openAnimationAsset(animation.uuid) } catch(error) { assetOperationError.value = error instanceof Error ? error.message : String(error) } }
/** 切分精灵表，成功选中首片并记录数量，失败显示及记录错误。 */ function sliceSelectedSheet() { const asset = selectedAsset.value; if (!asset) return; assetOperationError.value = ''; try { const generated = sliceSpriteSheet(asset); if (generated.length) { assets.selectedGuid = generated[0].uuid; pushHistory('Slice sprite sheet'); addEditorLog(t('spriteSlicesCreated', { count: generated.length }), 'Assets') } } catch (error) { assetOperationError.value = error instanceof Error ? error.message : String(error); addEditorLog(assetOperationError.value, 'Assets', 'error') } }
/** 重导入文件前保存流水线基线，成功后记录资源作者历史；播放结束也保留资源更新，不提交模拟实体位移。 */ async function reimportSelectedAsset(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = ''
  const asset = selectedAsset.value
  if (!asset || !file) return
  previousPipeline.value = clonePipelineMetadata(asset.pipeline)
  const success = await reimportAsset(asset.uuid, file)
  addEditorLog(t(success ? 'assetReimported' : 'assetReimportFailed', { name: asset.name }), 'Assets', success ? 'info' : 'error')
  if (success) pushAssetReimportHistory('Reimport asset', `asset:${asset.uuid}`)
}
/** 比较导入前后流水线元数据并格式化差异文本。 */ function compareSelectedImport() { const current = selectedAsset.value?.pipeline; importComparisonText.value = compareImportMetadata(previousPipeline.value, current).map(/** 为导入字段显示变化标记、字段名及前后值。 */ row => `${row.changed ? '●' : '○'} ${row.field}: ${row.before || '—'} → ${row.after || '—'}`).join('\n') }
/** 恢复到验证过的产物，成功递增代次并清空比较；无可用产物显示警告。 */ function revertSelectedImport() { const asset = selectedAsset.value; if (!asset || !revertToVerifiedArtifact(asset)) { addEditorLog(t('noVerifiedArtifact'), 'Assets', 'warning'); return } assets.generation++; importComparisonText.value = ''; pushAssetReimportHistory('Revert verified asset', `asset:${asset.uuid}`); addEditorLog(t('importReverted'), 'Assets') }
/** 对可见候选执行可取消重导入，经会话校验后记录播放期也有效的资源历史，并显示完成和失败数量。 */ async function batchReimportVisible() {
  if(assetBatch.value.active)return
  const session=assetSessionVersion(),candidates=reimportCandidates(filteredAssetRecords.value),controller=new AbortController();assetBatchController=controller;assetOperationError.value=''
  try{const result=await reimportAssetBatch(candidates,{signal:controller.signal,progress:/** 同步批量重导入进度状态。 */ value=>assetBatch.value=value});if(session===assetSessionVersion() && result.completed)pushAssetReimportHistory('Batch reimport assets');addEditorLog(t('batchReimportComplete',{complete:result.completed,failed:result.failed}),'Assets',result.failed?'warning':'info')}
  catch(error){assetOperationError.value=error instanceof Error?error.message:String(error)}finally{if(assetBatchController===controller)assetBatchController=null}
}

/** 确认后把所选资源生产元数据批量应用到可见资源，递增代次并记录历史数量。 */ async function bulkApplyVisible() {
  const source = selectedAsset.value
  if (!source || !filteredAssetRecords.value.length) return
  const approved = await requestConfirmation({ title: t('bulkApplyVisible'), message: t('bulkApplyVisibleConfirm', { count: filteredAssetRecords.value.length }), confirmLabel: t('apply'), cancelLabel: t('cancel'), destructive: false })
  if (!approved) return
  const count = applyBulkAssetSettings(filteredAssetRecords.value, { contentGroup: source.contentGroup, editorOnly: source.editorOnly, tags: source.tags, collectionIds: source.collectionIds })
  assets.generation++; pushHistory('Bulk edit asset production metadata'); addEditorLog(t('bulkApplyComplete', { count }), 'Assets')
}
/** 分析未使用资源并记录有限数量名称或无问题提示。 */ function reportUnusedAssets() {
  const unused = unusedAssetReport(assets.records, projectSnapshot.value)
  addEditorLog(unused.length ? t('unusedAssetsFound', { count: unused.length, names: unused.slice(0, 12).map(/* 返回 asset.name 的当前值。 */ asset => asset.name).join(', ') }) : t('noUnusedAssets'), 'Assets', unused.length ? 'warning' : 'info')
}
/** 进入缺失引用修复模式，初始化首项及替代选择并记录诊断数量。 */ function openMissingRepair() {
  const missing = assetGraph.value.missingReferences
  repairMode.value = missing.length > 0
  selectedMissingReference.value = missing[0]?.reference ?? ''
  replacementAssetGuid.value = ''
  addEditorLog(missing.length ? t('missingReferencesFound', { count: missing.length, names: missing.slice(0, 12).map(/* 返回 item.reference 的当前值。 */ item => item.reference).join(', ') }) : t('noMissingReferences'), 'Assets', missing.length ? 'error' : 'info')
}
/** 替换项目与资源中的缺失引用，按需递增代次，记录结果并推进下一项。 */ function repairSelectedMissingReference() {
  if (!selectedMissingReference.value || !replacementAssetGuid.value) return
  const projectChanges = replaceAssetReferences(selectedMissingReference.value, replacementAssetGuid.value)
  const assetChanges = repairMissingAssetReference(assets.records, selectedMissingReference.value, replacementAssetGuid.value)
  if (assetChanges) assets.generation++
  const count = projectChanges + assetChanges
  pushHistory('Repair missing asset reference')
  addEditorLog(t('missingReferenceRepaired', { count }), 'Assets', count ? 'info' : 'warning')
  selectedMissingReference.value = missingReferenceIds.value[0] ?? ''
  replacementAssetGuid.value = ''
  repairMode.value = missingReferenceIds.value.length > 0
}
/** 项目拥有者显示本地化项目名，资源拥有者显示路径，缺失时保留标识。 */ function referenceName(owner: string): string { return owner === 'project' ? t('project') : assets.records.find(/* 比较 asset.uuid 与 owner，返回严格相等的判断结果。 */ asset => asset.uuid === owner)?.path ?? owner }
/** 按标识选中引用资源并定位所属文件夹。 */ function navigateAssetReference(guid: string) { const asset = assets.records.find(/* 比较 candidate.uuid 与 guid，返回严格相等的判断结果。 */ candidate => candidate.uuid === guid); if (!asset) return; assets.selectedGuid = asset.uuid; const separator = asset.path.lastIndexOf('/'); assets.currentFolder = separator > 0 ? asset.path.slice(0, separator) : 'Assets' }
/** 保存资源筛选器成功后清空名称并记录日志。 */ function saveFilter() { const saved = saveCurrentAssetFilter(savedFilterName.value); if (saved) { savedFilterName.value = ''; addEditorLog(t('filterSaved', { name: saved.name }), 'Assets') } }
/** 非空标识时应用已保存资源筛选。 */ function applySavedFilter(id: string) { if (id) applyAssetFilter(id) }
/** 以当前资源类型和设置保存导入预设，成功清空名称并记录日志。 */ function saveSelectedPreset() { const asset = selectedAsset.value; if (!asset) return; const preset = saveImportPreset(presetName.value, asset.assetType, asset.settings); if (preset) { presetName.value = ''; addEditorLog(t('presetSaved', { name: preset.name }), 'Assets') } }
/** 应用有效导入预设成功后记录资源历史及日志。 */ function applySelectedPreset(id: string) { const asset = selectedAsset.value; if (asset && id && applyImportPreset(id, asset)) { pushHistory('Apply import preset', `asset:${asset.uuid}`); addEditorLog(t('presetApplied'), 'Assets') } }
/** 为选中资源关联本地源文件，并按关联、不可用或取消结果显示状态。 */ async function linkSelectedSource() { const asset = selectedAsset.value; if (!asset) return; const result = await linkAssetSource(asset.uuid, /** 自动来源重导入成功后记录作者历史。 */ ()=>pushAssetReimportHistory('Reimport linked asset',`asset:${asset.uuid}`)); estate.statusText = t(result === 'linked' ? 'sourceLinked' : result === 'unsupported' ? 'sourceLinkUnsupported' : 'saveCancelled') }
/** 解决指定外部资源变更成功后记录日志。 */ async function resolveExternal(id: string, choice: 'reimport' | 'keep' | 'duplicate') { if (await resolveExternalAssetChange(id, choice)) { if(choice!=='keep')pushAssetReimportHistory(choice==='duplicate'?'Duplicate external asset':'Reimport external asset'); addEditorLog(t('externalChangeResolved'), 'Assets') } }
/** 重试失败导入，并按结果记录成功或错误。 */ async function retryImport(id: number) { const asset = await retryFailedAssetImport(id, assets.currentFolder); if(asset)pushAssetReimportHistory('Retry asset import',`asset:${asset.uuid}`); addEditorLog(t(asset ? 'assetReimported' : 'assetReimportFailed', { name: asset?.name ?? '' }), 'Assets', asset ? 'info' : 'error') }
/** 导出当前项目文件夹，显示保存、取消或不支持结果；失败记录本地化错误。 */ async function exportFolder() {
  try {
    const result = await exportProjectFolder(getSceneJSON(), assets.records, assets.folders)
    estate.statusText = t(result === 'saved' ? 'projectFolderExported' : result === 'unsupported' ? 'projectFolderUnsupported' : 'saveCancelled')
    if (result === 'saved') addEditorLog(t('projectFolderExported'), 'Project')
  } catch (error) {
    estate.statusText = t('projectFolderFailed', { message: error instanceof Error ? error.message : t('unknownError') })
    addEditorLog(estate.statusText, 'Project', 'error')
  }
}
/** 按资源类型返回展示符号。 */ function assetIcon(type: AssetType): EditorIconName { return type==='audio'?'audio':type==='script'?'script':type==='scene'?'design':type==='visualScript'?'graph':type==='rig'?'bone':['animation','controller','animationMask','timeline'].includes(type)?'animation':type==='material'?'render':'assets' }
/** 按字节、千字节或兆字节格式化资源大小。 */ function formatBytes(value: number): string { return value < 1024 ? `${value} B` : value < 1024 ** 2 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 ** 2).toFixed(1)} MB` }
/* 调用 sourceStatusFor(uuid) 并返回调用结果。 */ function assetSourceStatus(uuid: string) { return sourceStatusFor(uuid) }

</script>

<style scoped>
.bottom-panel{position:relative;flex:none;min-height:var(--ui-toolbar-height);display:flex;flex-direction:column;background:var(--surface-1);box-shadow:inset 0 0 0 var(--ui-border-width) var(--border-separator);container:asset-dock/inline-size;border-radius:var(--radius-panel);overflow:clip}
.panel-tabs{display:flex;align-items:center;flex:none;gap:var(--space-1);min-height:var(--ui-toolbar-height);padding:var(--space-1) var(--space-1) var(--space-1) var(--space-2);border-bottom:var(--ui-border-width) solid var(--border-separator)}
.bottom-panel.collapsed .panel-tabs{border-bottom-color:transparent}
.panel-tab-strip{display:flex;align-items:center;gap:2px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none}
.panel-tab-strip::-webkit-scrollbar{display:none}
.panel-tab{position:relative;display:flex;align-items:center;flex:none;gap:var(--space-2);min-height:calc(var(--ui-control-height) - 2px);padding-inline:var(--space-2) var(--space-3);border-color:transparent;background:transparent;white-space:nowrap;border-radius:var(--radius-control);color:var(--text-muted);font-weight:var(--weight-medium);font-size:var(--type-dense)}
.panel-tab .editor-icon{width:14px;height:14px;flex-basis:14px}
.panel-tab:hover:not(.active){color:var(--text-primary)}
.panel-tab.active{background:var(--surface-raised);color:var(--text-primary);box-shadow:var(--shadow-xs),var(--hairline-highlight)}
.bottom-panel.collapsed .panel-tab.active{background:transparent;box-shadow:none;color:var(--text-secondary)}
.dock-presets{display:flex;flex:none;align-items:center;gap:1px;margin-inline-end:var(--space-1);padding:2px;border-radius:var(--radius-pill);background:var(--surface-2)}
.dock-preset{display:grid;place-items:center;width:24px;height:calc(var(--ui-control-height) - 8px);min-height:0;padding:0;border:0;border-radius:var(--radius-pill);background:transparent;color:var(--text-muted);cursor:pointer}
.dock-preset:hover{color:var(--text-primary)}
.dock-preset.active{background:var(--surface-1);color:var(--text-primary);box-shadow:var(--shadow-xs)}
.dock-preset svg{width:14px;height:14px}
.dock-preset rect{fill:none;stroke:currentColor;stroke-width:1.2}
.dock-preset rect.dock-fill{fill:currentColor;stroke:none}
.panel-controls{display:flex;flex:none;align-items:center;gap:0;padding-inline-start:var(--space-1);border-left:var(--ui-border-width) solid var(--border-separator)}
.panel-controls>button,.panel-controls>:deep(.ui-button){width:calc(var(--ui-control-height) - 2px);height:calc(var(--ui-control-height) - 2px);min-height:0;padding:0;color:var(--text-muted)}
.panel-controls>button.active{background:transparent;color:var(--accent)}
.dirty-indicator{position:absolute;inset-block-start:4px;inset-inline-end:4px;inline-size:5px;block-size:5px;border-radius:50%;background:var(--warning)}
.compact-tab-select{display:none;min-width:0;flex:1;font-size:var(--type-body);height:var(--ui-control-height)}
.panel-content{flex:1;min-width:0;min-height:0;overflow:hidden}
.asset-browser{height:100%;display:grid;grid-template-columns:minmax(18ch,22%) minmax(0,1fr);overflow:hidden;min-height:0}.asset-browser.inspecting{grid-template-columns:minmax(18ch,22%) minmax(0,1fr) minmax(24ch,28%)}.folder-tree,.asset-inspector{min-width:0;min-height:0;overflow:auto;padding:var(--ui-panel-inset)}.folder-tree{border-right:1px solid var(--border-subtle)}.folder-tree>strong{display:block;padding:var(--ui-space-xs);font-size:var(--type-caption);color:var(--text-muted)}.folder-tree button{display:flex;align-items:center;gap:var(--ui-space-xs);min-width:0;width:100%;border-color:transparent;background:transparent;white-space:nowrap;text-align:left;border-radius:var(--radius-xs)}.folder-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.asset-workspace{min-width:0;min-height:0;position:relative;display:flex;flex-direction:column;overflow:auto;scrollbar-gutter:stable;container:asset-tools/inline-size}.asset-toolbar{display:flex;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--border-subtle);flex:none;gap:var(--ui-control-gap);padding:var(--ui-panel-inset)}.asset-actions-row,.asset-filters,.asset-diagnostics{display:flex;align-items:center;gap:var(--ui-control-gap);min-width:0}.asset-actions-row{flex:1 1 auto;flex-wrap:wrap;max-width:100%}.asset-toolbar .path{min-width:0;max-width:20ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted)}.asset-toolbar input[type=search]{min-width:min(12ch,100%);max-width:min(28ch,100%);flex:1 1 12ch}.asset-toolbar .folder-input{width:16ch}.asset-diagnostics{margin-inline-start:auto}.asset-diagnostics button{max-width:20ch;font-size:var(--type-body)}.asset-diagnostics .atlas-error{color:var(--danger);max-width:16ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.asset-overflow,.filter-menu{position:relative}.asset-overflow-menu,.filter-popover{position:absolute;top:100%;left:0;z-index:20;display:grid;min-width:24ch;max-width:min(40ch,90vw);max-height:50vh;overflow:auto;border:1px solid var(--border-strong);background:var(--surface-popover);box-shadow:var(--shadow-md);gap:var(--ui-control-gap);padding:var(--space-3);border-radius:var(--radius-floating)}.asset-overflow-menu button,.filter-popover button{text-align:left}.filter-popover>div{display:flex}.filter-menu>button{display:flex;align-items:center;gap:var(--ui-space-xs)}
.asset-grid{flex:1 0 min(40vh,calc(6 * var(--ui-control-height)));min-height:min(40vh,calc(6 * var(--ui-control-height)));overflow:auto}.asset-grid-window{display:grid;align-content:start;padding-inline:var(--ui-space-sm)}.asset-grid article{position:relative;min-width:0;min-height:0;display:grid;grid-template-columns:var(--asset-thumbnail-size) minmax(0,1fr);grid-template-rows:1fr 1fr;gap:0 var(--ui-space-xs);align-items:center;padding:var(--ui-space-xs);border:1px solid transparent;border-radius:var(--radius-control);cursor:pointer}.asset-grid article.selected{background:var(--selection-bg);border-color:var(--accent)}.asset-grid article>strong,.asset-grid article>small{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-inline-end:var(--ui-control-height)}.asset-grid article>strong{align-self:end;font-size:var(--type-dense)}.asset-grid article>small{align-self:start;font-size:var(--type-caption);color:var(--text-muted)}.asset-preview{grid-row:1/3;width:var(--asset-thumbnail-size);height:var(--asset-thumbnail-size);object-fit:contain}.asset-icon{display:grid;place-items:center;color:var(--text-muted);background:var(--surface-2)}.favorite-button{position:absolute;right:0;top:0;border-color:transparent;background:transparent;padding:var(--ui-space-micro)}.source-badge{position:absolute;left:0;top:0;font-size:var(--type-caption);color:var(--warning)}.asset-window-status,.empty{grid-column:1/-1;color:var(--text-muted);font-size:var(--type-caption);padding:var(--ui-space-xs)}
.asset-inspector{border-left:1px solid var(--border-subtle);container:asset-properties/inline-size}.asset-inspector>header{display:flex;align-items:center;gap:var(--ui-control-gap);flex-wrap:wrap;border-bottom:1px solid var(--border-subtle);padding-bottom:var(--ui-space-xs)}.asset-inspector>header>strong{overflow-wrap:anywhere}.asset-inspector>header>span{font-size:var(--type-caption);color:var(--text-muted)}.asset-detail-back{display:none}.importer-tabs{display:flex;overflow-x:auto;border-bottom:1px solid var(--border-subtle);margin-block:var(--ui-space-xs)}.importer-tabs button{flex:none;border-color:transparent;border-radius:var(--radius-control);background:transparent}.large-preview{width:100%;max-height:160px;object-fit:contain}.asset-media-preview{width:100%;max-width:100%}.asset-video-preview{max-height:200px;background:#000;border-radius:var(--radius-control)}.asset-inspector label{display:grid;align-items:center;min-width:0;grid-template-columns:minmax(0,1fr);gap:var(--ui-label-control-gap);padding-block:var(--space-3)}.asset-inspector label>div{display:flex;gap:var(--ui-control-gap);min-width:0}.asset-inspector .region-field{grid-template-columns:minmax(0,1fr)}.asset-inspector code,.asset-inspector p{overflow-wrap:anywhere}.asset-inspector pre{white-space:pre-wrap;overflow-wrap:anywhere}.asset-inspector details{border-bottom:1px solid var(--border-subtle);padding-block:var(--ui-space-xs)}.asset-technical>div{display:grid;grid-template-columns:minmax(0,1fr) var(--ui-control-height);gap:var(--ui-space-xs);padding-block:var(--ui-space-xs)}.asset-technical code{grid-column:1}.asset-technical button{grid-column:2;grid-row:span 2}.provenance-actions,.asset-actions,.batch-actions{display:flex;flex-wrap:wrap;gap:var(--ui-control-gap)}.pipeline-error,.dangerText{color:var(--danger)}.provenance-diagnostic{padding:var(--ui-space-xs);border-left:2px solid var(--warning);overflow-wrap:anywhere}.font-preview{font-size:var(--type-page);padding:var(--ui-space-sm)}
.import-queue,.external-changes,.missing-repair,.asset-batch{flex:none;max-height:30vh;overflow:auto;padding:var(--ui-space-xs) var(--ui-space-sm);border-bottom:1px solid var(--border-subtle)}.import-queue>article,.external-changes>article,.missing-repair{display:flex;gap:var(--ui-space-xs);align-items:center;flex-wrap:wrap}.import-queue>article>span{display:grid;min-width:0}.import-queue details,.import-queue p{flex-basis:100%}.import-queue code{display:block;overflow-wrap:anywhere}.asset-batch header{display:flex;justify-content:space-between}.asset-batch progress{width:100%}.missing-repair select{max-width:28ch;min-width:0}.external-changes small{display:block}
.asset-browser.full-page-details{grid-template-columns:minmax(0,1fr)}.asset-browser.full-page-details>.folder-tree,.asset-browser.full-page-details>.asset-workspace{display:none}.asset-browser.full-page-details>.asset-inspector{display:block;border:0}.full-page-details .asset-detail-back{display:inline-flex}.panel-maximized{height:100%!important}
@container asset-dock (max-width:700px){.asset-browser.inspecting{grid-template-columns:minmax(10ch,20%) minmax(0,1fr)}.asset-browser.inspecting>.asset-inspector{display:none}.asset-browser.details-visible{grid-template-columns:minmax(0,1fr)}.asset-browser.details-visible>.folder-tree,.asset-browser.details-visible>.asset-workspace{display:none}.asset-browser.details-visible>.asset-inspector{display:block}.asset-detail-back{display:inline-flex}}
@container asset-tools (max-width:56em){.asset-toolbar .path{display:none}}
/* Narrow docks keep one tidy row: secondary create actions become labelled icon buttons (name kept for assistive tech and tooltip). */
@container asset-tools (max-width:62em){.asset-actions-row{flex-wrap:nowrap}.asset-actions-row>.ui-button:not(.primary)>span{position:absolute;inline-size:1px;block-size:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.asset-actions-row>.ui-button:not(.primary){inline-size:var(--ui-control-height);padding:0;justify-content:center}.asset-actions-row input[type=search]{min-width:8ch}.asset-diagnostics button:disabled{display:none}}
@container asset-tools (max-width:34em){.asset-actions-row{flex-wrap:wrap}}
/* Medium docks keep every tool one click away: the active tool keeps its label, the others show icon and tooltip. */
@container asset-dock (max-width: 80em){.panel-tab:not(.active) .tab-label{display:none}.panel-tab:not(.active){padding-inline:var(--space-2)}}
@container asset-dock (max-width: 36em){.panel-tab-strip{display:none}.compact-tab-select{display:block;font-size:var(--type-body);height:var(--ui-control-height)}.asset-browser,.asset-browser.inspecting{display:block;overflow:auto;scrollbar-gutter:stable}.folder-tree{max-height:100px;border-right:0;border-bottom:1px solid var(--border-subtle)}.asset-workspace{overflow:visible}.asset-grid{flex:none;block-size:min(40vh,calc(6 * var(--ui-control-height)))}}
.asset-overflow>summary{display:grid;place-items:center;inline-size:var(--ui-control-height);block-size:var(--ui-control-height);min-inline-size:var(--ui-control-height);padding:0;list-style:none;border:1px solid var(--border-subtle);border-radius:var(--radius-control);background:var(--surface-2);cursor:pointer}
.asset-overflow>summary::-webkit-details-marker{display:none}
</style>
