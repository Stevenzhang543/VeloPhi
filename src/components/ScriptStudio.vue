<!-- 脚本工作室：管理源码草稿、分析、断点、转换和保存，成功提交后才更新历史与运行时。 -->
<template>
  <section class="script-studio" :class="{'compact-toolbar':scriptStudioState.layout.compactToolbar}" @keydown.ctrl.s.prevent="saveActive" @keydown.meta.s.prevent="saveActive">
    <header class="studio-toolbar">
      <div class="studio-title"><EditorIcon class="studio-mark" name="code" /><div><strong>{{ t('scriptStudio') }}</strong><small>{{ t('scriptStudioDescription') }}</small></div></div>
      <div class="toolbar-actions">
        <select v-model="templateId" :title="t('scriptTemplate')"><option v-for="template in SCRIPT_TEMPLATES" :key="template.id" :value="template.id">{{ template.name }}</option></select>
        <UiButton icon="add" :label="t('newScript')" @click="createScript" />
        <UiButton icon="save" :label="t('saveScript')" :disabled="!activeAsset || !activeDirty" variant="primary" @click="saveActive" />
        <UiButton icon="search" :label="t('findReplace')" :aria-pressed="findOpen" @click="findOpen = !findOpen" />
        <UiButton :aria-pressed="scriptStudioState.layout.codeFocused" :aria-label="scriptStudioState.layout.codeFocused?layoutLabels.restorePanels:layoutLabels.focusCode" :title="scriptStudioState.layout.codeFocused?layoutLabels.restorePanels:layoutLabels.focusCode" @click="scriptStudioState.layout.codeFocused=!scriptStudioState.layout.codeFocused" icon="maximize" />
        <UiButton icon="assets" :label="paneLayout.primaryVisible?t('hideExplorer'):t('showExplorer')" :aria-expanded="paneLayout.primaryVisible" @click="toggleExplorer" />
        <UiButton icon="inspector" :label="layoutLabels.scriptDetails" :aria-expanded="detailVisible" @click="toggleDetails" />
        <details data-ui-motion-popover class="studio-more" v-transient-popover><summary>{{ layoutLabels.commands }}</summary><div class="studio-commands">
        <button :disabled="!selectedIdentifier" @click="goToDefinition">F12 {{ t('goToDefinition') }}</button>
        <button :disabled="!activeAsset" @click="formatActive">{{ t('formatCode') }}</button>
        <button :disabled="!selectedIdentifier" @click="showReferences">{{ t('references') }}</button>
        <div class="split-action"><UiButton @click="runTests" icon="play">{{ t('runTests') }}</UiButton><select v-model="testScope" :title="t('testScope')"><option value="file">{{ t('currentFile') }}</option><option value="project">{{ t('currentProject') }}</option><option value="tags">{{ t('selectedTags') }}</option><option value="failed">{{ t('failedTests') }}</option><option value="headless">{{ t('copyHeadlessCommand') }}</option></select></div>
        <button @click="toggleScriptDetailDock">{{ scriptStudioState.layout.detailDock === 'right' ? t('dockBottom') : t('dockRight') }}</button>
        <span class="toolbar-spacer"></span>
        <UiButton :disabled="!debug.paused" @click="runtime.debugContinue" icon="play">{{ t('continueExecution') }}</UiButton>
        <UiButton :disabled="!debug.paused" :title="debugCopy.capability" @click="runtime.debugStep('into')" icon="step-into">{{ debugCopy.into }}</UiButton>
        <UiButton :disabled="!debug.paused" :title="debugCopy.capability" @click="runtime.debugStep('over')" icon="step-over">{{ debugCopy.over }}</UiButton>
        <UiButton :disabled="!debug.paused" :title="debugCopy.capability" @click="runtime.debugStep('out')" icon="step-out">{{ debugCopy.out }}</UiButton>
        <UiButton @click="runtime.debugRestart" icon="refresh">{{ t('restart') }}</UiButton>
        <label class="compact-setting"><input v-model="scriptStudioState.layout.compactToolbar" type="checkbox">{{ layoutLabels.compactToolbar }}</label>
        </div></details>
      </div>
    </header>
    <StudioDraftConflict v-if="sourceDraftConflict" :saved-source="currentSavedSource" :draft-source="draft" @keep="acceptSourceDraftBase" @discard="discardSourceDraft" />
    <p v-if="blocksManaged" class="blocks-managed" role="note"><span>{{ blocksCopyText.codeEdited }}</span><button type="button" @click="openActiveInBlocks">{{ blocksCopyText.title }}</button></p>

    <div ref="studioGrid" data-measured-studio-layout :style="gridStyle" :class="['studio-grid', { 'detail-bottom': detailBottom, 'explorer-hidden': !paneLayout.primaryVisible, 'detail-hidden': !detailVisible, 'drawer-layout':paneLayout.drawer }]">
      <aside v-show="paneLayout.primaryVisible" class="project-scripts" :style="{width:paneLayout.primaryWidth+'px'}">
        <PanelResizeHandle v-if="!paneLayout.drawer" v-model="scriptStudioState.layout.explorerWidth" orientation="vertical" :minimum="184" :maximum="Math.max(184,Math.min(480,studioSize.width-440))" :reset-value="224" :label="layoutLabels.resizeExplorer" style="right:0;top:0;bottom:0" />
        <div class="pane-heading"><strong>{{ t('projectScripts') }}</strong><span>{{ scripts.length }}</span><UiButton :aria-label="t('hideExplorer')" @click="scriptStudioState.layout.explorerVisible=false" icon="close" :label="t('close')" /></div>
        <input v-model="projectQuery" type="search" :placeholder="t('searchProject')">
        <div class="script-list">
          <button v-for="asset in filteredScripts" :key="asset.uuid" :class="{ active: asset.uuid === activeAsset?.uuid }" @click="open(asset.uuid)">
            <EditorIcon name="code" /><span><strong>{{ asset.name }}</strong><small>{{ asset.path }}</small></span>
          </button>
        </div>
        <div v-if="projectQuery" class="search-results">
          <button v-for="result in projectMatches" :key="`${result.uuid}:${result.line}`" @click="openAt(result.uuid, result.line)">
            <strong>{{ result.name }}:{{ result.line }}</strong><small>{{ result.preview }}</small>
          </button>
          <p v-if="!projectMatches.length">{{ t('noResults') }}</p>
        </div>
      </aside>

      <main class="code-workspace">
        <nav class="file-tabs">
          <div v-for="asset in openAssets" :key="asset.uuid" class="file-tab" :class="{active:asset.uuid===activeAsset?.uuid}"><button :class="{ active: asset.uuid === activeAsset?.uuid }" @click="open(asset.uuid)"><span :class="['dirty-dot', { visible: dirtyUuids.has(asset.uuid) }]">●</span>{{ asset.name }}</button><UiButton :aria-label="t('close')+' '+asset.name" class="close-file" @click="close(asset.uuid)" icon="close" :label="t('close')" /></div>
          <span></span>
          <UiButton class="icon-button" :title="t('closeAll')" @click="closeAll" icon="close" :label="t('close')" />
        </nav>

        <div v-if="findOpen" class="find-bar">
          <input ref="findInput" v-model="findText" :placeholder="t('find')" @keydown.enter.prevent="findNext">
          <input v-model="replaceText" :placeholder="t('replace')">
          <UiButton icon="down" :label="t('find')" @click="findNext" /><button @click="replaceOne">{{ t('replace') }}</button><button @click="replaceAll">{{ t('replaceAll') }}</button>
          <span>{{ findCount }}</span><UiButton icon="close" :label="t('close')" @click="findOpen = false" />
        </div>

        <div v-if="activeAsset" class="editor-shell">
          <div class="gutter" aria-label="Breakpoints">
            <button v-for="line in lineCount" :key="line" :class="{ breakpoint: breakpoints.includes(line), error: diagnosticLines.has(line) }" :title="t('toggleBreakpoint')" @click="toggleBreakpoint(line)"><span></span>{{ line }}</button>
          </div>
          <textarea ref="editor" v-model="draft" :aria-label="activeAsset.name" spellcheck="false" autocomplete="off" autocapitalize="off" @input="sourceChanged" @click="cursorChanged" @keyup="cursorChanged" @scroll="syncScroll" @keydown.tab.prevent="insertTab" @keydown.ctrl.space.prevent="requestCompletions" @keydown.meta.space.prevent="requestCompletions"></textarea>
          <UiMotionTransition><div v-if="completionOpen" class="completion-popover">
            <button v-for="item in completions" :key="item" @mousedown.prevent="insertCompletion(item)"><EditorIcon name="code" /><span>{{ item }}</span></button>
            <p v-if="!completions.length">{{ t('noCompletions') }}</p>
          </div></UiMotionTransition>
          <div v-if="contextApi" class="signature-help"><code>{{ contextApi.signature }}</code><span>{{ contextApi.detail }}</span></div>
        </div>
        <div v-else class="empty-editor"><EditorIcon name="code" /><h2>{{ t('openScriptPrompt') }}</h2><p>{{ t('openScriptDescription') }}</p><button class="primary" @click="createScript">{{ t('createFirstScript') }}</button></div>

        <footer class="editor-status">
<!-- 错误计数过滤回调仅统计严重程度为 error 的诊断。 -->          <span :class="scriptHasErrors ? 'status-error' : 'status-ok'">{{ scriptHasErrors ? t('errorsCount', { count: analysis.diagnostics.filter(item => item.severity === 'error').length || 1 }) : t('scriptValid') }}</span>
          <span v-if="linkedGraphUuid" class="linked-graph-status"><EditorIcon name="link" /> {{ t('linkedVisualGraph') }}</span>
          <span :class="scriptIndexState.status === 'error' ? 'status-error' : 'status-ok'">Index {{ scriptIndexState.documentCount }} / {{ scriptIndexState.symbolCount }}</span>
          <span>{{ t('lineColumn', { line: cursor.line, column: cursor.column }) }}</span>
      <span>Rhai API v{{ activeAsset?.script?.apiVersion ?? 2 }} · UTF-8 · {{ analysis.elapsedMs.toFixed(1) }} ms</span><span>{{ t('engineVersion') }} {{ NOVA_RELEASE_NAME }}</span>
        </footer>
      </main>

      <aside v-show="detailVisible" class="studio-inspector" :style="inspectorStyle">
        <PanelResizeHandle v-if="!paneLayout.drawer" v-model="scriptStudioState.layout.detailWidth" v-show="!detailBottom" orientation="vertical" :minimum="320" :maximum="Math.max(320,Math.min(560,studioSize.width-440))" :reset-value="400" reverse :label="layoutLabels.resizeInspector" style="left:0;top:0;bottom:0" />
        <PanelResizeHandle v-if="!paneLayout.drawer" v-model="scriptStudioState.layout.detailHeight" v-show="detailBottom" orientation="horizontal" :minimum="140" :maximum="Math.max(140,studioSize.height-220)" :reset-value="220" reverse :label="layoutLabels.resizeInspector" style="left:0;top:0;right:0" />
        <UiButton class="close-inspector" :aria-label="t('close')" @click="scriptStudioState.layout.detailVisible=false" icon="close" :label="t('close')" />
        <UiTabs class="inspector-tabs" :aria-label="layoutLabels.scriptDetails" :items="[{ id: 'conversion', label: conversionLabels.title }, ...inspectorTabs.map(tab => ({ id: tab.id, label: t(tab.label) }))]" :model-value="inspectorTab" @update:model-value="inspectorTab = $event as typeof inspectorTab" />

        <ScriptConversionPanel v-if="inspectorTab === 'conversion'" class="inspector-pane" :assessment="conversionAssessment" :source="draft" @navigate="navigateConversion" />
        <div v-else-if="inspectorTab === 'problems'" class="inspector-pane">
          <div class="pane-heading"><strong>{{ t('diagnostics') }}</strong><span>{{ analysis.diagnostics.length }}</span><UiButton icon="help" :label="t('documentation')" @click="openBundledManual('script-studio')" /></div>
          <p v-if="validationError" class="source-save-error" role="alert">{{ validationError }}</p>
          <button v-for="item in analysis.diagnostics" :key="`${item.code}:${item.line}:${item.column}`" class="problem" @click="focusSourceRange(spanAt(draft,item.line,item.column,item.endLine,item.endColumn))"><i :class="item.severity"></i><span><strong>{{ item.message }}</strong><small>{{ item.code }} · {{ item.phase }} · {{ t('lineColumn', { line: item.line, column: item.column }) }}</small></span></button>
          <UiButton v-for="action in codeActions" :key="`${action.code}:${action.line}`" class="code-action" @click="applyCodeAction(action)" icon="bolt">{{ action.title }}</UiButton>
          <p v-if="!analysis.diagnostics.length" class="empty-pane"><EditorIcon name="check" /> {{ t('noDiagnostics') }}</p>
        </div>

        <div v-else-if="inspectorTab === 'symbols'" class="inspector-pane">
          <div class="pane-heading"><strong>{{ t('outline') }}</strong><button :disabled="!selectedIdentifier" @click="beginRenameSymbol">F2</button></div>
          <button v-for="symbol in analysis.symbols" :key="`${symbol.name}:${symbol.line}`" class="symbol" @click="focusLine(symbol.line, symbol.column)"><EditorIcon :name="symbol.kind === 'function' || symbol.kind === 'test' ? 'code' : 'design'" /><span>{{ symbol.name }}</span><small>{{ symbol.line }}</small></button>
          <h3 v-if="referenceResults.length">{{ t('references') }}</h3><button v-for="reference in referenceResults" :key="`${reference.uuid}:${reference.line}:${reference.column}`" class="symbol" @click="openAt(reference.uuid, reference.line)"><EditorIcon name="forward" /><span>{{ reference.name }}</span><small>{{ reference.line }}:{{ reference.column }}</small></button>
        </div>

        <div v-else-if="inspectorTab === 'types'" class="inspector-pane type-pane">
          <div class="pane-heading"><strong>{{ t('typesAndStatements') }}</strong><span>{{ analysis.types.length }} · {{ analysis.statements.length }}</span></div>
          <p class="pane-help">{{ t('optionalTypeHint') }}</p>
          <h3>{{ t('inferredTypes') }}</h3>
          <button v-for="item in analysis.types" :key="`${item.name}:${item.line}`" class="symbol type-symbol" @click="focusLine(item.line)"><i>{{ item.declared ? 'T' : '≈' }}</i><span><b>{{ item.name }}</b><small>{{ item.confidence }} · {{ item.source }}</small></span><code>{{ item.type }}</code></button>
          <p v-if="!analysis.types.length" class="empty-pane">{{ t('noTypeInformation') }}</p>
          <h3>{{ t('dataStructures') }}</h3>
<!-- 结构字段映射回调组合字段名、可选标记与类型。 -->          <article v-for="structure in analysis.structures" :key="`${structure.name}:${structure.line}`" class="type-structure"><strong>{{ structure.name }}</strong><small>{{ structure.fields.map(field => `${field.name}${field.optional ? '?' : ''}: ${field.type}`).join(' · ') }}</small></article>
          <h3>{{ t('genericHelpers') }}</h3>
<!-- 泛型约束映射回调将参数名与允许类型集合组合为摘要。 -->          <article v-for="helper in analysis.genericHelpers" :key="`${helper.functionName}:${helper.line}`" class="type-structure"><strong>{{ helper.functionName }}&lt;{{ helper.parameters.join(', ') }}&gt;</strong><small>{{ Object.entries(helper.constraints).map(([name, values]) => `${name}: ${values.join(' | ')}`).join(' · ') }}</small></article>
          <h3>{{ t('statementMap') }}</h3>
          <button v-for="statement in analysis.statements.slice(0, 500)" :key="statement.id" class="symbol statement" @click="focusLine(statement.line,statement.column)"><i>{{ statement.kind.slice(0,1).toUpperCase() }}</i><span><b>{{ statement.functionName || t('moduleScope') }}</b><small>{{ statement.normalized }}</small></span><code>{{ statement.line }}</code></button>
        </div>

        <div v-else-if="inspectorTab === 'modules'" class="inspector-pane">
          <div class="pane-heading"><strong>{{ t('scriptModules') }}</strong><span>{{ analysis.dependencies.length }}</span></div>
          <p class="pane-help">{{ t('moduleHelp') }}</p>
          <button v-for="item in projectModuleDiagnostics" :key="item.cycle.join('|')" class="problem" @click="openModuleDiagnostic(item.uri)"><i class="error"></i><span><strong>{{ item.message }}</strong><small>{{ item.code }}</small></span></button>
          <label><span>{{ t('scriptApiVersion') }}</span><select :value="activeAsset?.script?.apiVersion ?? 2" @change="setApiVersion(Number(($event.target as HTMLSelectElement).value))"><option :value="2">API v2</option><option v-if="activeAsset?.script?.apiVersion === 1" :value="1" disabled>API v1 · {{ t('compatibilityMode') }}</option></select></label>
          <label><span>{{ t('scriptPackage') }}</span><input :value="activeAsset?.script?.packageName" maxlength="128" @change="setPackageName(($event.target as HTMLInputElement).value)"></label>
          <label><span>{{ t('hotReloadPolicy') }}</span><select :value="activeAsset?.script?.reloadPolicy" @change="setReloadPolicy(($event.target as HTMLSelectElement).value)"><option value="preserve">{{ t('preserveState') }}</option><option value="recreate">{{ t('recreateState') }}</option><option value="disabled">{{ t('disabled') }}</option></select></label>
          <p :class="['hot-reload-state', debug.hotReload.status]">{{ debug.hotReload.message || t('hotReloadWaiting') }}</p>
          <section class="reload-state" :data-status="debug.hotReload.status" aria-live="polite"><strong>{{ runtimeCopy[debug.hotReload.status] }}</strong><small v-if="reloadSourcePath">{{ runtimeCopy.path }}: {{ reloadSourcePath }}</small><p v-if="debug.hotReload.message">{{ debug.hotReload.message }}</p></section>
          <button :disabled="!activeAsset || !canRollbackReload" @click="rollbackReload">↶ {{ t('rollbackHotReload') }}</button>
          <details data-ui-motion-disclosure v-if="reloadHistory.length"><summary>{{ t('reloadHistory') }} · {{ reloadHistory.length }}</summary><article v-for="entry in reloadHistory.slice(0,12)" :key="entry.id" class="reload-entry"><strong>{{ entry.status }} · {{ entry.classification }}</strong><small>{{ entry.candidateHash }} · {{ entry.message }}</small></article></details>
          <code v-for="dependency in analysis.dependencies" :key="dependency">{{ dependency }}</code>
          <div class="dependency-editor"><input v-model="packageDraft" :placeholder="t('packageDependency')" @keydown.enter="addPackage"><UiButton @click="addPackage" icon="add" :label="t('add')" /></div>
          <label v-for="dependency in packageDependencies" :key="dependency"><span>◇ {{ dependency }}</span><UiButton @click="removePackage(dependency)" icon="close" :label="t('close')" /></label>
          <small>{{ t('readOnlyPackages') }}</small>
        </div>

        <div v-else-if="inspectorTab === 'contract'" class="inspector-pane contract-pane">
          <div class="pane-heading"><strong>{{ t('behaviorContract') }}</strong><span :class="contractReport.valid ? 'contract-valid' : 'contract-invalid'">{{ t(contractReport.valid ? 'contractValid' : 'contractInvalid') }}</span></div>
          <p class="pane-help">{{ t('behaviorContractHint') }}</p>
          <UiButton icon="add" class="contract-action" @click="insertContractHeader">{{ t('addContractHeader') }}</UiButton>
          <div class="contract-flags"><span :class="{ enabled: contractReport.contract.strict }">{{ t('strictBehavior') }}</span><span :class="{ enabled: contractReport.contract.deterministic }">{{ t('deterministicBehavior') }}</span></div>
          <h3>{{ t('runtimeBudgets') }}</h3>
          <div class="contract-metrics"><article><span>{{ t('commandsPerCallback') }}</span><strong>{{ contractReport.contract.budgets.commands }}</strong></article><article><span>{{ t('logsPerCallback') }}</span><strong>{{ contractReport.contract.budgets.logs }}</strong></article></div>
          <h3>{{ t('requirements') }}</h3>
          <article v-for="requirement in contractReport.contract.requirements" :key="`${requirement.kind}:${requirement.value}`" class="contract-row"><span>{{ requirement.kind }}</span><code>{{ requirement.value }}</code><small>{{ t('lineColumn', { line: requirement.line, column: 1 }) }}</small></article>
          <p v-if="!contractReport.contract.requirements.length" class="empty-pane">{{ t('noContractRequirements') }}</p>
          <h3>{{ t('apiUsage') }}</h3>
          <article v-for="entry in contractReport.apiUsage" :key="entry.name" class="contract-row api"><span>{{ entry.module }}</span><code>{{ entry.name }}</code><small>{{ entry.threadRule }} · {{ entry.determinism }}<template v-if="entry.permissions.length"> · {{ entry.permissions.join(', ') }}</template></small></article>
          <p v-if="!contractReport.apiUsage.length" class="empty-pane">{{ t('noApiUsage') }}</p>
          <h3 v-if="contractReport.diagnostics.length">{{ t('diagnostics') }}</h3>
          <button v-for="item in contractReport.diagnostics" :key="`${item.code}:${item.line}`" class="problem" @click="focusLine(item.line, 1)"><i :class="item.severity"></i><span><strong>{{ item.message }}</strong><small>{{ item.code }} · {{ t('lineColumn', { line: item.line, column: 1 }) }}</small></span></button>
        </div>

        <div v-else-if="inspectorTab === 'debug'" class="inspector-pane debug-pane">
          <div class="pane-heading"><strong>{{ t('scriptDebugger') }}</strong><span :class="{ paused: debug.paused }">{{ debug.paused ? t('paused') : t('running') }}</span></div>
          <p>{{ debug.reason || t('debuggerWaiting') }}</p><p v-if="debugLocationError" class="error" role="alert">{{ debugLocationError }}</p>
          <p class="pane-help" role="note">{{ debugCopy.capability }}</p><p>Session {{ debug.sessionRevision }} · Pause {{ debug.pauseCount }}</p><h3>{{ debugCopy.frames }}</h3><button v-for="(frame,index) in debug.callStack" :key="`${frame.entityUuid}:${index}`" :class="{ active: debug.selectedFrame === index }" @click="selectFrame(index,frame.scriptUuid,frame.line)">{{ frame.entityName }} · {{ frame.functionName }}:{{ frame.line }}</button>
          <h3>{{ t('breakpoints') }}</h3><article v-for="point in breakpointDetails" :key="point.id" class="breakpoint-detail"><label><input v-model="point.enabled" type="checkbox"><span>{{ point.line }}</span></label><input v-model="point.group" :placeholder="t('breakpointGroup')"><input v-model="point.functionName" :placeholder="t('functionBreakpoint')"><input v-model="point.condition" :placeholder="t('condition')"><input v-model.number="point.hitCondition" type="number" min="0" max="1000000" :placeholder="t('hitCount')"><input v-model="point.logMessage" :placeholder="t('logpointMessage')"><UiButton @click="removeDetailedBreakpoint(point.id)" icon="close" :label="t('close')" /></article>
          <UiButton icon="add" @click="addFunctionBreakpoint">{{ t('functionBreakpoint') }}</UiButton>
          <h3>{{ t('exceptionPolicy') }}</h3><select v-model="scriptProjectSettings.exceptionPolicy"><option value="never">{{ t('never') }}</option><option value="uncaught">{{ t('uncaught') }}</option><option value="all" disabled :title="debugCopy.capability">{{ t('allExceptions') }}</option></select>
          <h3>{{ t('tasks') }}</h3><label v-for="task in debug.tasks" :key="task.id"><span><b>{{ task.name }}</b><small>{{ task.state }} · {{ task.detail }}</small></span><UiButton v-if="['queued','running','waiting'].includes(task.state)" :title="t('cancelTask')" @click="runtime.cancelDebugTask(task.id)" icon="close" :label="t('close')" /></label><p v-if="!debug.tasks.length" class="empty-pane">{{ t('noDebugTasks') }}</p>
          <h3>{{ t('remoteDebugging') }}</h3><p>{{ scriptProjectSettings.remoteDebug.enabled ? `${scriptProjectSettings.remoteDebug.host}:${scriptProjectSettings.remoteDebug.port} · ${debug.remotePeer?.authenticated ? t('authenticated') : t('waitingForAuthenticatedPlayer')}` : t('remoteDebugDisabled') }}</p>
          <h3>{{ t('locals') }}</h3><p class="pane-help">{{ runtimeCopy.snapshot }}</p><pre>{{ formattedLocals }}</pre>
          <h3>{{ t('watches') }}</h3><p class="pane-help">{{ runtimeCopy.hint }}</p><div class="dependency-editor"><input v-model="watchDraft" :placeholder="t('watchExpression')" @keydown.enter="addWatch"><UiButton @click="addWatch" icon="add" :label="t('add')" /></div>
          <label v-for="watch in debug.watches" :key="watch.id"><span><b>{{ watch.expression }}</b><small :class="{ error: watch.error }">{{ watch.error || `${watch.valueType ?? ''} · ${watch.value}` }}</small></span><UiButton @click="removeDebugWatch(watch.id)" icon="close" :label="t('close')" /></label>
        </div>

        <div v-else-if="inspectorTab === 'tests'" class="inspector-pane">
          <div class="pane-heading"><strong>{{ t('scriptTests') }}</strong><UiButton icon="play" :label="t('runTests')" @click="runTests" /></div>
          <div class="coverage-summary"><span>{{ t('functionCoverage') }} <b>{{ percent(coverage.functionRate) }}</b></span><span>{{ t('lineCoverage') }} <b>{{ percent(coverage.lineRate) }}</b></span><span>{{ t('apiCoverage') }} <b>{{ percent(coverage.bindingRate) }}</b></span></div>
          <input v-model="testTags" :placeholder="t('testTags')">
          <article v-for="result in debug.testResults" :key="`${result.script}:${result.test}:${result.caseName}`" class="test-result"><EditorIcon :class="{ passed: result.passed, skipped: result.skipped }" :name="result.skipped ? 'remove' : result.passed ? 'check' : 'warning'" /><span><strong>{{ result.test }}{{ result.caseName ? ` · ${result.caseName}` : '' }}</strong><small>{{ result.script }} · {{ result.durationMs.toFixed(2) }} ms · seed {{ result.seed }} · {{ result.message }}</small><small v-if="result.tags.length">#{{ result.tags.join(' #') }}</small></span></article>
          <p v-if="!debug.testResults.length" class="empty-pane">{{ t('noTestResults') }}</p>
        </div>

        <div v-else-if="inspectorTab === 'signals'" class="inspector-pane">
          <div class="pane-heading"><strong>{{ t('signals') }}</strong><span>{{ signals.length }}</span></div>
          <div class="dependency-editor"><input v-model="signalDraft" :placeholder="t('signalName')" @keydown.enter="addSignal"><UiButton @click="addSignal" icon="add" :label="t('add')" /></div>
          <label v-for="signal in signals" :key="signal"><button class="emit" @click="runtime.emitSignal(signal)">●</button><span>{{ signal }}</span><UiButton @click="removeSignal(signal)" icon="close" :label="t('close')" /></label>
          <div class="dependency-editor"><input v-model="connectionSignalDraft" :placeholder="t('signalName')"><input v-model="connectionCallbackDraft" :placeholder="t('callback')"><UiButton @click="addSignalConnection" icon="add" :label="t('add')" /></div>
          <label v-for="(connection,index) in signalConnections" :key="`${connection.signal}:${connection.callback}:${index}`"><input v-model="connection.enabled" type="checkbox"><span>{{ connection.signal }} → {{ connection.callback }}</span><UiButton @click="removeSignalConnection(index)" icon="close" :label="t('close')" /></label>
          <small>{{ t('signalSources') }}</small>
        </div>

        <div v-else class="inspector-pane api-reference">
          <div class="pane-heading"><strong>{{ t('engineApi') }} v2</strong><span>{{ filteredApi.length }} · {{ deprecatedCount }} {{ t('deprecated') }}</span></div>
          <input v-model="apiQuery" type="search" :placeholder="t('searchApi')">
          <article v-for="entry in filteredApi" :key="entry.signature"><small>{{ entry.namespace }} · API {{ entry.since }}</small><code>{{ entry.signature }}</code><p>{{ entry.detail }}</p><pre>{{ entry.example }}</pre><b v-if="entry.deprecated">{{ t('deprecated') }} → {{ entry.deprecated.replacement }} ({{ entry.deprecated.removal }})</b><button @click="openBundledManual">{{ t('documentation') }}</button></article>
        </div>
      </aside>
    </div>
    <div v-if="renameOpen" class="rename-overlay" @mousedown.self="renameOpen = false">
      <form class="rename-card" @submit.prevent="confirmRenameSymbol">
        <strong>{{ t('renameSymbol') }}</strong><p>{{ conversionLabels.renameScope.replace('{name}',renameSource) }}</p>
        <input ref="renameInput" v-model="renameDraft" pattern="[A-Za-z_][A-Za-z0-9_]*" maxlength="80" required>
        <div><button type="button" @click="renameOpen = false">{{ t('cancel') }}</button><button class="primary" type="submit">{{ t('rename') }}</button></div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import UiMotionTransition from '../ui/components/UiMotionTransition.vue'

import { NOVA_RELEASE_NAME } from '../projects/projectFormat'
import UiButton from '../ui/components/UiButton.vue'
import UiTabs from '../ui/components/UiTabs.vue'
import EditorIcon from './EditorIcon.vue'
import { computed, nextTick, onActivated, onDeactivated, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { createTextAsset, readTextAsset, assetState } from '../assets/AssetDatabase'
import { defaultScriptMetadata, type ScriptBreakpointMetadata } from '../assets/types'
import { t } from '../i18n'
import { addEditorLog } from '../store/editor'
import { pushHistory } from '../store/physics'
import { requestConfirmation } from '../store/dialog'
import { gameplayRuntime as runtime } from '../editor/gameplayRuntime'
import { debugSourceRevision, scriptDebugState as debug, addDebugWatch, removeDebugWatch, selectDebugFrame } from '../runtime/scriptDebug'
import { scriptProjectSettings } from '../runtime/scriptSettings'
import { SCRIPT_API, apiEntry } from '../editor/scriptApi'
import { ScriptLanguageService, analyzeScript, applyScriptLintPolicy, completionItems, type ScriptAnalysis } from '../editor/scriptLanguage'
import { closeScriptAsset, openScriptAsset, scriptStudioState, toggleScriptDetailDock } from '../editor/scriptStudioState'
import { findScriptReferences, formatScript, renameScriptSymbol, scriptCodeActions, type ScriptCodeAction } from '../editor/scriptLanguage'
import { openBundledManual } from '../runtime/openManual'
import { SCRIPT_TEMPLATES, scriptTemplate, type ScriptTemplateId } from '../editor/scriptTemplates'
import { vTransientPopover } from '../editor/transientPopover'
import { snapshotPreview } from '../runtime/dynamicInspection'
import { hotReloadHistory, scriptHotReloadState } from '../runtime/scriptHotReload'
import { scriptCoverageReport, scriptCoverageState } from '../runtime/scriptCoverage'
import { markScriptIndexApiChanged, rebuildAndPersistScriptIndex, restoreScriptIndex, scriptIndexState } from '../editor/scriptIndexPersistence'
import { assessRhaiConversion, commitLinkedScriptAsset, linkedScriptGraphUuid } from '../visual/graphCodeSync'
import { parseGraphDocument } from '../visual/graphTypes'
import { preferencesState } from '../store/preferences'
import ScriptConversionPanel from './ScriptConversionPanel.vue'
import { conversionCopy, sourceOffsetFromTextarea, spanAt, textareaSelection, type ConversionNavigation, type ConversionSnapshot, type ConversionSpan } from '../editor/scriptConversionPresentation'
import { parseScriptContract, scriptContractHeader } from '../runtime/scriptContracts'
import { analyzeModuleGraph, remapStatementLines } from '../editor/scriptLanguage26'
import { parseRhai } from '../visual/rhaiSyntax'
import PanelResizeHandle from './PanelResizeHandle.vue'
import { studioPaneLayout } from '../editor/studioPaneLayout'
import { studioLayoutCopy } from '../editor/studioLayoutCopy'
import {projectSessionState} from '../projects/projectSession'
import {retainStudioDraft,readStudioDraft,clearStudioDraft,registerStudioDraftOwner,type StudioDraftCandidate} from '../editor/studioDraftRetention'
import {queueInitialGraphLayout} from '../visual/graphStudioState'
import StudioDraftConflict from './StudioDraftConflict.vue'
import { isBlockScriptSource } from '../visual/blockScript'
import { blockCopy } from '../visual/blockScriptCopy'
import { openBlockScriptAsset } from '../visual/graphStudioState'
import {objectOwnershipCopy} from '../editor/objectOwnershipCopy'
import {pendingObjectAuthorNavigation,objectCallbackSpan} from '../editor/objectAuthorNavigation'

const service = new ScriptLanguageService()
const studioGrid=ref<HTMLElement|null>(null),studioSize=reactive({width:1200,height:600})
let studioResizeObserver:ResizeObserver|null=null
const layoutLabels=computed(/* 返回 studioLayoutCopy[preferencesState.locale] 的当前值。 */ ()=>studioLayoutCopy[preferencesState.locale])
const detailBottom=computed(/* 先计算 scriptStudioState.layout.detailDock==='bottom'&&studioSize.width>=640；仅当其为真值时求右侧 studioSize.height>=360，返回短路求值结果。 */ ()=>scriptStudioState.layout.detailDock==='bottom'&&studioSize.width>=640&&studioSize.height>=360)
const paneLayout=computed(/** 根据工作区尺寸、资源树和详情栏状态计算脚本编辑器的分栏布局。 */ ()=>studioPaneLayout({width:studioSize.width,primaryOpen:scriptStudioState.layout.explorerVisible,secondaryOpen:scriptStudioState.layout.detailVisible&&!detailBottom.value,primaryWidth:scriptStudioState.layout.explorerWidth,secondaryWidth:Math.max(320,scriptStudioState.layout.detailWidth),activePanel:scriptStudioState.layout.activePanel==='explorer'?'primary':'secondary',focused:scriptStudioState.layout.codeFocused}))
const detailVisible=computed(/** 按详情栏停靠方向与专注模式判断详情区域是否可见。 */ ()=>detailBottom.value?scriptStudioState.layout.detailVisible&&!scriptStudioState.layout.codeFocused:paneLayout.value.secondaryVisible)
const detailHeight=computed(/* 调用 Math.max(140,Math.min(scriptStudioState.layout.detailHeight,studioSize.height-220)) 并返回调用结果。 */ ()=>Math.max(140,Math.min(scriptStudioState.layout.detailHeight,studioSize.height-220)))
const gridStyle=computed(/** 把分栏计算结果转换为网格列宽和底部详情栏行高。 */ ()=>({gridTemplateColumns:paneLayout.value.columns,gridTemplateRows:detailBottom.value&&detailVisible.value?`minmax(0,1fr) ${detailHeight.value}px`:'minmax(0,1fr)'}))
const inspectorStyle=computed(/** 按底部或侧面停靠方式设置详情面板的实际宽高。 */ ()=>({width:detailBottom.value?'auto':paneLayout.value.secondaryWidth+'px',height:detailBottom.value?detailHeight.value+'px':'auto'}))
/** 切换资源树；重新显示时退出代码专注模式并激活资源树面板。 */ function toggleExplorer(){if(paneLayout.value.primaryVisible){scriptStudioState.layout.explorerVisible=false;return}scriptStudioState.layout.codeFocused=false;scriptStudioState.layout.explorerVisible=true;scriptStudioState.layout.activePanel='explorer'}
/** 切换详情区域；重新显示时退出代码专注模式并激活详情面板。 */ function toggleDetails(){if(detailVisible.value){scriptStudioState.layout.detailVisible=false;return}scriptStudioState.layout.codeFocused=false;scriptStudioState.layout.detailVisible=true;scriptStudioState.layout.activePanel='detail'}
const emit = defineEmits<{ navigate: [request: ConversionNavigation] }>()
const conversionLabels = computed(/* 返回 conversionCopy[preferencesState.locale] 的当前值。 */ () => conversionCopy[preferencesState.locale])
const editor = ref<HTMLTextAreaElement | null>(null), findInput = ref<HTMLInputElement | null>(null), renameInput = ref<HTMLInputElement | null>(null)
const drafts = reactive<Record<string, string>>({}), dirtyUuids = reactive(new Set<string>())
const draft = computed({ get: /* 根据 activeAsset.value 的真假，分别返回 drafts[activeAsset.value.uuid] ?? '' 或 ''。 */ () => activeAsset.value ? drafts[activeAsset.value.uuid] ?? '' : '', set: /** 将编辑文本写入当前脚本对应的内存草稿。 */ value => { if (activeAsset.value) drafts[activeAsset.value.uuid] = value } })
/** 26.43: scripts written by Blocks say so; code edits are replaced when the blocks are saved again. */
const blocksManaged = computed(() => isBlockScriptSource(draft.value))
const blocksCopyText = computed(() => { const copy = blockCopy(preferencesState.locale).ui; return { title: copy.title, codeEdited: copy.managedByBlocks } })
function openActiveInBlocks() { if (activeAsset.value) openBlockScriptAsset(activeAsset.value.uuid) }
const emptyAnalysis = /** 创建没有诊断、符号或引用的初始脚本分析结果。 */ (): ScriptAnalysis => ({ apiVersion: 2, revision: 0, elapsedMs: 0, diagnostics: [], symbols: [], dependencies: [], functions: {}, references: [], tests: [], semanticTokens: [], apiUsage: [], types: [], structures: [], genericHelpers: [], statements: [] })
const analysis = ref<ScriptAnalysis>(emptyAnalysis()), validationError = ref('')
const scriptHasErrors = computed(/** 检查当前保存错误及分析诊断中是否存在错误级别条目。 */ () => !!validationError.value || analysis.value.diagnostics.some(/* 比较 item.severity 与 'error'，返回严格相等的判断结果。 */ item=>item.severity==='error'))
const projectQuery = ref(''), findOpen = ref(false), findText = ref(''), replaceText = ref(''), completionOpen = ref(false)
const templateId = ref<ScriptTemplateId>('component')
const cursor = reactive({ line: 1, column: 1 }), inspectorTab = ref<'conversion' | 'problems' | 'symbols' | 'types' | 'modules' | 'contract' | 'debug' | 'tests' | 'signals' | 'api'>('problems')
const packageDraft = ref(''), watchDraft = ref(''), signalDraft = ref(''), connectionSignalDraft = ref(''), connectionCallbackDraft = ref(''), apiQuery = ref('')
const testScope = ref<'file' | 'project' | 'tags' | 'failed' | 'headless'>('file'), testTags = ref('')
const renameOpen = ref(false), renameSource = ref(''), renameDraft = ref('')
let renameSelection:{uuid:string;source:string;offset:number}|null=null
const referenceResults = ref<Array<{ uuid: string; name: string; line: number; column: number }>>([])
let analysisRevision = 0
const inspectorTabs = [
  { id: 'problems' as const, label: 'problems' }, { id: 'symbols' as const, label: 'symbols' }, { id: 'types' as const, label: 'types' }, { id: 'modules' as const, label: 'modules' }, { id: 'contract' as const, label: 'behaviorContract' },
  { id: 'debug' as const, label: 'debug' }, { id: 'tests' as const, label: 'tests' }, { id: 'signals' as const, label: 'signals' }, { id: 'api' as const, label: 'api' }
]
const scripts = computed(/** 随资源代数更新获取全部脚本，并按路径排序。 */ () => { void assetState.generation; return assetState.records.filter(/* 比较 asset.assetType 与 'script'，返回严格相等的判断结果。 */ asset => asset.assetType === 'script').sort(/* 调用 a.path.localeCompare(b.path) 并返回调用结果。 */ (a, b) => a.path.localeCompare(b.path)) })
const activeAsset = computed(/** 按脚本工作区的活动标识查找当前脚本资源。 */ () => scripts.value.find(/* 比较 asset.uuid 与 scriptStudioState.activeUuid，返回严格相等的判断结果。 */ asset => asset.uuid === scriptStudioState.activeUuid) ?? null)
const draftProjectId=projectSessionState.id,baseSources=reactive<Record<string,string|null>>({})
const currentSavedSource=computed(/** 随资源变化读取当前脚本已经保存的源代码。 */ ()=>{void assetState.generation;return activeAsset.value?readTextAsset(activeAsset.value.uuid):null})
const sourceDraftConflict=computed(/** 判断未保存草稿的原始基线是否已被外部保存内容替换。 */ ()=>!!activeAsset.value&&dirtyUuids.has(activeAsset.value.uuid)&&baseSources[activeAsset.value.uuid]!==currentSavedSource.value)
/** 为当前脏脚本组合项目、资源、草稿和基线，供恢复系统保存。 */ function sourceDraftCandidate():StudioDraftCandidate|null {const asset=activeAsset.value;return asset&&dirtyUuids.has(asset.uuid)?{record:asset,projectId:draftProjectId,kind:'code',source:draft.value,baseSource:baseSources[asset.uuid]??null}:null}
const unregisterDraftOwner=registerStudioDraftOwner({read:sourceDraftCandidate,discard:discardSourceDraft})
/** 存在有效草稿时将其交给编辑恢复系统保留。 */ function retainSourceDraft(){const candidate=sourceDraftCandidate();if(candidate)retainStudioDraft(candidate)}
/** 接受当前保存内容作为新的冲突基线，清除错误并保留草稿。 */ function acceptSourceDraftBase(){if(!activeAsset.value)return;baseSources[activeAsset.value.uuid]=currentSavedSource.value;validationError.value='';retainSourceDraft()}
/** 放弃当前草稿并恢复保存内容，清除恢复标记后重新分析。 */ function discardSourceDraft(){const asset=activeAsset.value;if(!asset)return;const saved=readTextAsset(asset.uuid);drafts[asset.uuid]=saved??'';baseSources[asset.uuid]=saved;dirtyUuids.delete(asset.uuid);if(asset.script)asset.script.recoverySource='';clearStudioDraft(asset,draftProjectId);scriptStudioState.activeDirty=false;validationError.value='';void analyzeCurrent()}
const activeDirty = computed(/* 先计算 !!activeAsset.value；仅当其为真值时求右侧 dirtyUuids.has(activeAsset.value.uuid)，返回短路求值结果。 */ () => !!activeAsset.value && dirtyUuids.has(activeAsset.value.uuid))
const contractReport = computed(/* 调用 parseScriptContract(draft.value) 并返回调用结果。 */ () => parseScriptContract(draft.value))
const linkedGraphUuid = computed(/* 根据 activeAsset.value 的真假，分别返回 linkedScriptGraphUuid(activeAsset.value.uuid) 或 ''。 */ () => activeAsset.value ? linkedScriptGraphUuid(activeAsset.value.uuid) : '')
const linkedGraph = computed(/** 按关联图标识查找可视脚本资源；跳过无法解析的图文档。 */ () => {
  void assetState.generation
  if (!linkedGraphUuid.value) return undefined
  for (const asset of assetState.records.filter(/* 比较 item.assetType 与 'visualScript'，返回严格相等的判断结果。 */ item => item.assetType === 'visualScript')) {
    try { const document = parseGraphDocument(readTextAsset(asset.uuid) ?? ''); if (document.uuid === linkedGraphUuid.value) return document } catch { /* A malformed linked graph is reported by its editor. */ }
  }
  return undefined
})
const conversionAssessment = computed(/* 调用 assessRhaiConversion(draft.value, activeAsset.value?.name, linkedGraph.value) 并返回调用结果。 */ () => assessRhaiConversion(draft.value, activeAsset.value?.name, linkedGraph.value))
/** 为当前脚本生成源码与转换评估快照；没有资源时返回空值。 */ function getConversionSnapshot(): ConversionSnapshot | null { return activeAsset.value ? { source: draft.value, assetUuid: activeAsset.value.uuid, assessment: conversionAssessment.value } : null }
/** 源码定位请求直接选择文本范围，其余导航请求交给父级。 */ function navigateConversion(request: ConversionNavigation) { if (request.target === 'code') focusSourceRange(request.span); else emit('navigate', request) }
defineExpose({ getConversionSnapshot, focusSourceRange })
const openAssets = computed(/** 把打开的脚本标识解析为仍然存在的资源列表。 */ () => scriptStudioState.openTabs.flatMap(/** 为标签页查找脚本资源；资源已经删除时不产生标签项。 */ uuid => scripts.value.find(/* 比较 asset.uuid 与 uuid，返回严格相等的判断结果。 */ asset => asset.uuid === uuid) ?? []))
const filteredScripts = computed(/** 按搜索词匹配脚本名称和路径，空搜索词保留全部脚本。 */ () => { const q = projectQuery.value.trim().toLowerCase(); return q ? scripts.value.filter(/* 调用 `${asset.name} ${asset.path}`.toLowerCase().includes(q) 并返回调用结果。 */ asset => `${asset.name} ${asset.path}`.toLowerCase().includes(q)) : scripts.value })
const projectMatches = computed(/** 搜索各脚本草稿或保存内容中的文本行，并限制为一百项。 */ () => {
  const q = projectQuery.value.trim().toLowerCase(); if (!q) return []
  return scripts.value.flatMap(/** 逐行扫描单个脚本并生成符合项目搜索条件的结果。 */ asset => (drafts[asset.uuid] ?? readTextAsset(asset.uuid) ?? '').split(/\r?\n/).flatMap(/** 将匹配行转换为脚本标识、行号和截断后的预览文本。 */ (line, index) => line.toLowerCase().includes(q) ? [{ uuid: asset.uuid, name: asset.name, line: index + 1, preview: line.trim().slice(0, 120) }] : [])).slice(0, 100)
})
const lineCount = computed(/* 调用 Math.max(1, draft.value.split(/\r?\n/).length) 并返回调用结果。 */ () => Math.max(1, draft.value.split(/\r?\n/).length))
const breakpoints = computed(/* 当 activeAsset.value?.script?.breakpoints 为 null 或 undefined 时返回 []，否则保留左侧值。 */ () => activeAsset.value?.script?.breakpoints ?? [])
const breakpointDetails = computed(/* 当 activeAsset.value?.script?.breakpointDetails 为 null 或 undefined 时返回 []，否则保留左侧值。 */ () => activeAsset.value?.script?.breakpointDetails ?? [])
const diagnosticLines = computed(/** 收集错误诊断所在行，供代码行错误标记查询。 */ () => new Set(analysis.value.diagnostics.filter(/* 比较 item.severity 与 'error'，返回严格相等的判断结果。 */ item => item.severity === 'error').map(/* 返回 item.line 的当前值。 */ item => item.line)))
const packageDependencies = computed(/* 当 activeAsset.value?.script?.packageDependencies 为 null 或 undefined 时返回 []，否则保留左侧值。 */ () => activeAsset.value?.script?.packageDependencies ?? [])
const signals = computed(/* 返回 scriptProjectSettings.customSignals 的当前值。 */ () => scriptProjectSettings.customSignals)
const signalConnections = computed(/* 当 activeAsset.value?.script?.signalConnections 为 null 或 undefined 时返回 []，否则保留左侧值。 */ () => activeAsset.value?.script?.signalConnections ?? [])
const completions = computed(/* 调用 completionItems(wordBeforeCursor.value, analysis.value) 并返回调用结果。 */ () => completionItems(wordBeforeCursor.value, analysis.value))
const codeActions = computed(/* 调用 scriptCodeActions(analysis.value) 并返回调用结果。 */ () => scriptCodeActions(analysis.value))
const wordBeforeCursor = computed(/** 提取光标之前紧邻的标识符片段，作为补全前缀。 */ () => { const pos = editor.value?.selectionStart ?? 0; return draft.value.slice(0, pos).match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0] ?? '' })
const selectedIdentifier = computed(/** 优先返回有效选中标识符，否则拼接光标两侧的标识符片段。 */ () => { void cursor.line;void cursor.column;const el = editor.value; if (!el) return ''; const start=sourceOffsetFromTextarea(draft.value,el.selectionStart),end=sourceOffsetFromTextarea(draft.value,el.selectionEnd),selected = draft.value.slice(start,end); if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(selected)) return selected; const before = draft.value.slice(0,start).match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0] ?? ''; const after = draft.value.slice(start).match(/^[A-Za-z0-9_]*/)?.[0] ?? ''; return `${before}${after}` })
const contextApi = computed(/* 调用 apiEntry(selectedIdentifier.value || wordBeforeCursor.value) 并返回调用结果。 */ () => apiEntry(selectedIdentifier.value || wordBeforeCursor.value))
const findCount = computed(/* 根据 findText.value 的真假，分别返回 (draft.value.match(new RegExp(escapeRegex(findText.value), 'gi')) ?? []).length 或 0。 */ () => findText.value ? (draft.value.match(new RegExp(escapeRegex(findText.value), 'gi')) ?? []).length : 0)
const runtimeCopy = computed(/** 按当前语言提供受限运行时快照与热重载状态的说明文字。 */ () => ({
  en: { snapshot: 'At a line stop: the script variables in scope (bounded previews). At a callback stop: the host snapshot.', rejected: 'Request rejected. No running program was replaced.', pending: 'Reload queued. Running code stays unchanged until the transaction validates.', applied: 'Reload transaction applied.', disabled: 'Hot reload is disabled.', idle: 'No reload request.', path: 'Reload source', hint: 'Inspect a property, items[0], or bag["item name"]. Calls and accessors are not evaluated.' },
  de: { snapshot: 'Bei einem Zeilenhalt: die sichtbaren Skriptvariablen (begrenzte Vorschau). Bei einem Rückrufhalt: der Host-Zustand.', rejected: 'Anfrage abgelehnt. Kein laufendes Programm wurde ersetzt.', pending: 'Neuladen vorgemerkt. Laufender Code bleibt bis zur erfolgreichen Prüfung unverändert.', applied: 'Neuladen als Transaktion angewendet.', disabled: 'Neuladen im Betrieb ist deaktiviert.', idle: 'Keine Anfrage zum Neuladen.', path: 'Quelle zum Neuladen', hint: 'Eigenschaft, items[0] oder bag["item name"] prüfen. Aufrufe und Getter werden nicht ausgeführt.' },
  zh: { snapshot: '在行断点处：作用域内的脚本变量（有界预览）。在回调断点处：宿主状态快照。', rejected: '请求已拒绝，未替换任何正在运行的程序。', pending: '重载已排队；事务通过验证前，运行代码保持不变。', applied: '重载事务已应用。', disabled: '热重载已禁用。', idle: '暂无重载请求。', path: '重载源文件', hint: '可检查属性、items[0] 或 bag["item name"]。不会执行函数调用或访问器。' }
}[preferencesState.locale]))
const debugLocationError = ref('')
const debugCopy = computed(/** 调试器明确说明回调边界与命令回放能力，不宣称 VM 语句暂停。 */ () => ({
  en: { capability: 'Rhai scripts stop at breakpoint lines with their call stack and local variables, and step into, over and out of lines. A stop re-runs the callback from its start to that line; nothing of a stopped run is applied, so effects happen once. Visual graphs step through their commands. Caught exceptions do not stop.', frames: 'Call stack', into: 'Step into', over: 'Step over', out: 'Step out', stale: 'Source changed since this pause. Draft preserved; stale location was not selected.' },
  de: { capability: 'Rhai-Skripte halten an Haltepunktzeilen mit Aufrufstapel und lokalen Variablen und gehen zeilenweise hinein, darüber und hinaus. Ein Halt führt den Rückruf vom Anfang bis zu dieser Zeile erneut aus; vom angehaltenen Lauf wird nichts übernommen, Wirkungen treten einmal ein. Visuelle Graphen gehen ihre Befehle durch. Abgefangene Fehler halten nicht an.', frames: 'Aufrufstapel', into: 'Hineinspringen', over: 'Überspringen', out: 'Herausspringen', stale: 'Quelle seit dieser Pause geändert. Entwurf bleibt erhalten; alte Position nicht ausgewählt.' },
  zh: { capability: 'Rhai 脚本可在断点行停下，显示调用栈和局部变量，并逐行单步进入、越过和跳出。停下时回调会从头重新运行到该行；停下的那次运行不产生任何效果，因此效果只发生一次。可视化图按命令单步。已捕获的异常不会停下。', frames: '调用栈', into: '单步进入', over: '单步越过', out: '单步跳出', stale: '源码已在暂停后改变，已保留草稿，不定位过时位置。' }
}[preferencesState.locale]))
const reloadSourcePath = computed(/** 将热重载记录的脚本标识解析为资源路径，找不到时保留标识。 */ () => assetState.records.find(/* 比较 asset.uuid 与 debug.hotReload.scriptUuid，返回严格相等的判断结果。 */ asset => asset.uuid === debug.hotReload.scriptUuid)?.path ?? debug.hotReload.scriptUuid)
const formattedLocals = computed(/* 调用 snapshotPreview(debug.locals) 并返回调用结果。 */ () => snapshotPreview(debug.locals))
const filteredApi = computed(/** 按名称、分类和详情筛选脚本接口列表。 */ () => { const q = apiQuery.value.toLowerCase(); return q ? SCRIPT_API.filter(/* 调用 `${entry.name} ${entry.category} ${entry.detail}`.toLowerCase().includes(q) 并返回调用结果。 */ entry => `${entry.name} ${entry.category} ${entry.detail}`.toLowerCase().includes(q)) : SCRIPT_API })
const deprecatedCount = computed(/* 返回 analysis.value.diagnostics.filter(item => item.code === 'NOVA-COMPAT-001').length 的当前值。 */ () => analysis.value.diagnostics.filter(/* 比较 item.code 与 'NOVA-COMPAT-001'，返回严格相等的判断结果。 */ item => item.code === 'NOVA-COMPAT-001').length)
const reloadHistory = computed(/* 调用 hotReloadHistory(activeAsset.value?.uuid) 并返回调用结果。 */ () => hotReloadHistory(activeAsset.value?.uuid))
const canRollbackReload = computed(/** 检查当前脚本是否具有可供回滚的先前源代码。 */ () => Boolean(activeAsset.value && (activeAsset.value.uuid in scriptHotReloadState.rollbackSources) && Object.prototype.hasOwnProperty.call(scriptHotReloadState.rollbackSources, activeAsset.value.uuid)))
const coverage = computed(/** 在覆盖率修订变化时重新生成脚本覆盖率报告。 */ () => { void scriptCoverageState.revision; return scriptCoverageReport() })
const projectModuleDiagnostics = computed(/** 分析所有脚本当前草稿的依赖关系并建立模块图。 */ () => analyzeModuleGraph(scripts.value.map(/** 为模块分析生成脚本路径及其依赖列表。 */ asset => ({ uri: asset.path, dependencies: analyzeScript(drafts[asset.uuid] ?? readTextAsset(asset.uuid) ?? '').dependencies }))))

watch(activeAsset,/** 切换活动脚本时恢复草稿或保存内容，同步脏状态并重新分析。 */ asset=>{
  if(!asset){analysis.value=emptyAnalysis();scriptStudioState.activeDirty=false;return}
  if(!(asset.uuid in drafts)){
    const saved=readTextAsset(asset.uuid),retained=readStudioDraft(asset,draftProjectId,'code',saved),recovery=asset.script?.recoverySource??''
    drafts[asset.uuid]=retained?.entry.source??(recovery&&recovery!==saved?recovery:saved??'');baseSources[asset.uuid]=retained?retained.entry.baseSource:saved
    if(retained||recovery&&recovery!==saved)dirtyUuids.add(asset.uuid)
  }
  if(!dirtyUuids.has(asset.uuid)){const saved=readTextAsset(asset.uuid);drafts[asset.uuid]=saved??'';baseSources[asset.uuid]=saved}
  scriptStudioState.activeDirty=dirtyUuids.has(asset.uuid);void analyzeCurrent()
},{immediate:true})
watch([activeAsset,pendingObjectAuthorNavigation],/** 等待对象作者导航目标就绪，校验项目与请求身份后定位回调范围。 */ async()=>{
  const request=pendingObjectAuthorNavigation.value
  if(!request||request.projectId!==projectSessionState.id||request.record!==activeAsset.value)return
  await nextTick()
  if(pendingObjectAuthorNavigation.value!==request||request.record!==activeAsset.value)return
  const span=objectCallbackSpan(draft.value,request.callback)
  pendingObjectAuthorNavigation.value=null
  if(span)focusSourceRange(span)
  else{validationError.value=objectOwnershipCopy[preferencesState.locale].callbackLocationFailed+' · '+request.callback;inspectorTab.value='problems'}
},{immediate:true,flush:'post'})
watch(activeDirty, /** 把当前草稿脏状态同步到脚本工作区共享状态。 */ value => { scriptStudioState.activeDirty = value })
watch(/* 返回 assetState.generation 的当前值。 */ ()=>assetState.generation,/** 保存内容变化时仅刷新干净草稿，并重新运行源码分析。 */ ()=>{const asset=activeAsset.value;if(!asset)return;if(!dirtyUuids.has(asset.uuid)){const saved=readTextAsset(asset.uuid);drafts[asset.uuid]=saved??'';baseSources[asset.uuid]=saved}void analyzeCurrent()})
watch(findOpen, /** 搜索框展开后等待界面更新，再将输入焦点移入搜索框。 */ open => { if (open) void nextTick(/* 调用 findInput.value?.focus() 并返回调用结果。 */ () => findInput.value?.focus()) })
onMounted(/** 挂载时监听工作区尺寸、注册保存入口、恢复项目索引并打开初始脚本。 */ () => { studioResizeObserver=new ResizeObserver(/** 读取观测到的工作区边界，并把宽高限制为至少一个像素。 */ entries=>{const bounds=entries[0]?.contentRect;if(bounds){studioSize.width=Math.max(1,bounds.width);studioSize.height=Math.max(1,bounds.height)}});if(studioGrid.value)studioResizeObserver.observe(studioGrid.value);scriptStudioState.saveActiveDraft = saveActive; restoreScriptIndex(); rebuildProjectIndex(); const selected = assetState.records.find(/* 先计算 asset.uuid === assetState.selectedGuid；仅当其为真值时求右侧 asset.assetType === 'script'，返回短路求值结果。 */ asset => asset.uuid === assetState.selectedGuid && asset.assetType === 'script'); if (selected) open(selected.uuid); else if (!activeAsset.value && scripts.value[0]) open(scripts.value[0].uuid) })
// Cached workspaces keep drafts and selection, but do not observe detached geometry.
onDeactivated(() => { studioResizeObserver?.disconnect(); retainSourceDraft() })
onActivated(() => { if (studioGrid.value) studioResizeObserver?.observe(studioGrid.value); scriptStudioState.saveActiveDraft = saveActive })
onBeforeUnmount(/** 卸载前保留所有脏草稿，解除保存与尺寸监听并销毁分析服务。 */ () => { for(const uuid of dirtyUuids){const record=scripts.value.find(/* 比较 asset.uuid 与 uuid，返回严格相等的判断结果。 */ asset=>asset.uuid===uuid);if(record)retainStudioDraft({record,projectId:draftProjectId,kind:'code',source:drafts[uuid],baseSource:baseSources[uuid]??null})}unregisterDraftOwner();studioResizeObserver?.disconnect();if (scriptStudioState.saveActiveDraft === saveActive) scriptStudioState.saveActiveDraft = null; service.dispose() })

/** 通过共享脚本工作区打开指定脚本标识。 */ function open(uuid: string) { openScriptAsset(uuid) }
/** 脏脚本关闭请求仅激活该脚本；干净脚本才直接关闭标签。 */ function close(uuid: string) { if (dirtyUuids.has(uuid)) { scriptStudioState.activeUuid = uuid; return }; closeScriptAsset(uuid) }
/** 遍历打开标签的副本，逐一执行保留脏草稿的关闭逻辑。 */ function closeAll() { for (const uuid of [...scriptStudioState.openTabs]) close(uuid) }
/** 打开指定脚本后等待编辑器更新，再定位目标行。 */ function openAt(uuid: string, line: number) { open(uuid); void nextTick(/* 调用 focusLine(line, 1) 并返回调用结果。 */ () => focusLine(line, 1)) }
/** 从选定模板创建脚本资源，记录历史并选中和打开新资源。 */ function createScript() { const template = scriptTemplate(templateId.value), asset = createTextAsset(`${template.name} ${t('newScriptName')}`, 'script', template.source, 'Assets/Scripts'); pushHistory('Create script asset'); open(asset.uuid); assetState.selectedGuid = asset.uuid; addEditorLog(t('scriptCreated', { name: asset.name }), 'Script') }
/** 为所有脚本构建当前源码索引，重建后持久化项目索引。 */ function rebuildProjectIndex() { rebuildAndPersistScriptIndex(scripts.value.map(/** 组合单个脚本的路径、草稿源码、接口版本和非负修订号。 */ asset => ({ uri: asset.path, source: drafts[asset.uuid] ?? readTextAsset(asset.uuid) ?? '', apiVersion: asset.script?.apiVersion ?? scriptProjectSettings.apiVersion, revision: Math.max(0, Math.round(asset.sourceModified || 0)) }))) }
/** 递增分析修订并解析模块和宿主约束，仅将最新请求的诊断应用到界面。 */ async function analyzeCurrent() {
  const revision=++analysisRevision,asset=activeAsset.value,source=draft.value
  const bundled=asset?runtime.resolveModuleSource(asset.uuid,source):{source:null,error:null}
  const program=bundled.source?parseRhai(bundled.source,{moduleMode:'host',limits:{maxSourceLength:1_000_000}}):null
  const externalFunctions=program?.body.filter(/* 比较 node.kind 与 'FunctionDeclaration'，返回严格相等的判断结果。 */ node=>node.kind==='FunctionDeclaration').map(/* 返回 node.name 的当前值。 */ node=>node.name) ?? []
  const next=await service.analyze(source,{apiVersion:asset?.script?.apiVersion??scriptProjectSettings.apiVersion,revision,externalFunctions})
  const moduleError=bundled.error??program?.diagnostics.find(/* 调用 item.code.startsWith('RHAI-LIMIT-') 并返回调用结果。 */ item=>item.code.startsWith('RHAI-LIMIT-'))?.message
  if(moduleError){const match=asset&&moduleError.startsWith(asset.path+':')?/^(\d+):(\d+):/.exec(moduleError.slice(asset.path.length+1)):null,line=Number(match?.[1]??1),column=Number(match?.[2]??1),endColumn=Math.max(column,(source.split(/\r?\n/)[line-1]?.length??0)+1);next.diagnostics.push({code:'NOVA-MODULE-RESOLUTION',severity:'error',phase:'semantic',message:moduleError,line,column,endLine:line,endColumn,range:{start:{line,column},end:{line,column:endColumn}},source:'Nova Rhai',documentation:'manual/index.html#script-modules'})}
  if(revision===analysisRevision)analysis.value=applyScriptLintPolicy(next,scriptProjectSettings.lint)
}
/** 源码编辑后保存恢复信息、标记脏状态并更新诊断、光标与补全显示。 */ function sourceChanged() { const asset = activeAsset.value; if (!asset) return; asset.script ??= defaultScriptMetadata(); asset.script.recoverySource = draft.value.slice(0, 1_000_000); dirtyUuids.add(asset.uuid);retainSourceDraft(); validationError.value = ''; void analyzeCurrent(); cursorChanged(); void nextTick(/** 编辑器更新后仅在前缀足够长且有候选项时显示自动补全。 */ () => { completionOpen.value = wordBeforeCursor.value.length >= 2 && completions.value.length > 0 }) }
/** 根据光标前的源码计算当前行号和列号。 */ function cursorChanged() { const pos = editor.value?.selectionStart ?? 0; const before = draft.value.slice(0, pos); const lines = before.split(/\r?\n/); cursor.line = lines.length; cursor.column = (lines[lines.length - 1]?.length ?? 0) + 1 }
/** 让代码行号栏的垂直滚动位置与文本编辑器保持一致。 */ function syncScroll() { const gutter = document.querySelector<HTMLElement>('.script-studio .gutter'); if (gutter && editor.value) gutter.scrollTop = editor.value.scrollTop }
/** 用两个空格替换当前选区，实现编辑器的缩进输入。 */ function insertTab() { replaceSelection('  ') }
/** 替换文本选区并标记草稿，更新后恢复插入点与焦点。 */ function replaceSelection(value: string) { const el = editor.value; if (!el) return; const start = el.selectionStart, end = el.selectionEnd; draft.value = `${draft.value.slice(0, start)}${value}${draft.value.slice(end)}`; dirtyUuids.add(activeAsset.value!.uuid); void nextTick(/** 文本更新后把光标放到插入内容末尾，并触发源码变更处理。 */ () => { el.selectionStart = el.selectionEnd = start + value.length; el.focus(); sourceChanged() }) }
/** 显示补全列表并将焦点交还代码编辑器。 */ function requestCompletions() { completionOpen.value = true; editor.value?.focus() }
/** 选中当前补全前缀并替换为候选名称，然后关闭补全列表。 */ function insertCompletion(name: string) { const prefix = wordBeforeCursor.value; const el = editor.value; if (!el) return; el.selectionStart -= prefix.length; replaceSelection(name); completionOpen.value = false }
/** 把源码范围转换为文本选区，定位滚动位置并同步光标和行号栏。 */ function focusSourceRange(span: ConversionSpan) { const el = editor.value; if (!el) return; const [start,end] = textareaSelection(draft.value,span); el.focus(); el.setSelectionRange(start,end); const height = Number.parseFloat(getComputedStyle(el).lineHeight) || 22; el.scrollTop = Math.max(0,(span.line-4)*height); cursorChanged(); syncScroll() }
/** 将目标行转换为源码范围后执行统一的编辑器定位。 */ function focusLine(line: number, column = 1) { focusSourceRange(spanAt(draft.value,line,column)) }
/** 切换指定行的断点及详细配置，保留函数断点并记录修改。 */ function toggleBreakpoint(line: number) { const asset = activeAsset.value; if (!asset) return; asset.script ??= defaultScriptMetadata(); const index = asset.script.breakpoints.indexOf(line); if (index >= 0) { asset.script.breakpoints.splice(index, 1); asset.script.breakpointDetails = asset.script.breakpointDetails.filter(/* 先计算 point.line !== line；仅当其为假值时求右侧 point.functionName，返回短路求值结果。 */ point => point.line !== line || point.functionName) } else { asset.script.breakpoints.push(line); asset.script.breakpointDetails.push({ id: `line-${line}-${Date.now()}`, line, functionName: '', condition: '', hitCondition: 0, logMessage: '', enabled: true, hitCount: 0 }) } asset.script.breakpoints.sort(/* 计算表达式 a - b 并返回结果，沿用操作数的原有类型规则。 */ (a, b) => a - b); pushHistory('Toggle script breakpoint', `script-breakpoint:${asset.uuid}`); assetState.generation++ }
/** 验证草稿冲突与模块后原子保存关联脚本和图，迁移断点并排队热重载、清理恢复状态及更新索引。 */ async function saveActive(): Promise<boolean> {
  const asset=activeAsset.value;if(!asset)return false
  if(sourceDraftConflict.value){validationError.value=layoutLabels.value.resolveDraftConflict;return false}
  const result=runtime.validateModuleSource(asset.uuid,draft.value);validationError.value=result.error?runtimeCopy.value.rejected+' '+result.error:''
  if(result.error){addEditorLog(result.error,'Script','error',asset.uuid);inspectorTab.value='problems';return false}
  const previousScript=readTextAsset(asset.uuid)??'',previousGraphs=new Map(assetState.records.filter(/* 比较 item.assetType 与 'visualScript'，返回严格相等的判断结果。 */ item=>item.assetType==='visualScript').map(/* 返回按声明顺序构造的数组 [item.uuid,readTextAsset(item.uuid)??'']。 */ item=>[item.uuid,readTextAsset(item.uuid)??'']))
  // 先在独立副本计算断点迁移；资源事务成功前不清空草稿恢复信息。
  const metadata=JSON.parse(JSON.stringify(asset.script??defaultScriptMetadata())) as NonNullable<typeof asset.script>
  const remapped=remapStatementLines(analyzeScript(previousScript).statements,analysis.value.statements,metadata.breakpoints),lineMap=new Map(remapped.map(/* 返回按声明顺序构造的数组 [item.from,item.to]。 */ item=>[item.from,item.to]))
  metadata.breakpoints=remapped.map(/* 返回 item.to 的当前值。 */ item=>item.to).sort(/* 计算表达式 a-b 并返回结果，沿用操作数的原有类型规则。 */ (a,b)=>a-b);metadata.breakpointDetails=metadata.breakpointDetails.map(/** 复制详细断点，并按源码映射更新其行号，缺少映射时保留原行。 */ point=>({...point,line:lineMap.get(point.line)??point.line}));metadata.tests=analysis.value.tests.map(/* 返回 test.name 的当前值。 */ test=>test.name);metadata.recoverySource='';metadata.lastSavedHash=sourceHash(draft.value)
  let synchronized: ReturnType<typeof commitLinkedScriptAsset>
  try { synchronized=commitLinkedScriptAsset(asset.uuid,draft.value,metadata) }
  catch(error){validationError.value=error instanceof Error?error.message:String(error);addEditorLog(validationError.value,'Script','error',asset.uuid);inspectorTab.value='problems';return false}
    if(synchronized){if(synchronized.created){const created=assetState.records.find(/* 比较 record.uuid 与 synchronized.graphAssetUuid，返回严格相等的判断结果。 */ record=>record.uuid===synchronized.graphAssetUuid);if(created)queueInitialGraphLayout(created)}const graphSource=readTextAsset(synchronized.graphAssetUuid)??'';runtime.queueGraphHotReload(synchronized.graphAssetUuid,graphSource,previousGraphs.get(synchronized.graphAssetUuid)??'');window.dispatchEvent(new CustomEvent('nova-linked-graph-synchronized',{detail:{graphAssetUuid:synchronized.graphAssetUuid,scriptUuid:asset.uuid}}));addEditorLog(t(synchronized.created?'linkedGraphCreatedFromCode':'linkedGraphUpdatedFromCode'),'Script','info',synchronized.graphAssetUuid)}

  runtime.queueHotReload(asset.uuid,draft.value);baseSources[asset.uuid]=draft.value;clearStudioDraft(asset,draftProjectId);dirtyUuids.delete(asset.uuid);scriptStudioState.activeDirty=false;rebuildProjectIndex();pushHistory('Edit script asset',`script:${asset.uuid}`);addEditorLog(t('scriptSaved',{name:asset.name}),'Script','info',asset.uuid);return true
}
/** 按模块诊断路径找到脚本资源，并打开其第一行。 */ function openModuleDiagnostic(uri:string){const asset=scripts.value.find(/* 比较 item.path 与 uri，返回严格相等的判断结果。 */ item=>item.path===uri);if(asset)openAt(asset.uuid,1)}
/** 从当前选区末尾查找下一个忽略大小写的匹配，必要时回绕源码开头。 */ function findNext() { const el = editor.value; if (!el || !findText.value) return; const lower = draft.value.toLowerCase(), needle = findText.value.toLowerCase(); let index = lower.indexOf(needle, el.selectionEnd); if (index < 0) index = lower.indexOf(needle); if (index >= 0) { el.focus(); el.setSelectionRange(index, index + needle.length); cursorChanged() } }
/** 当前选区匹配查找词时替换该处，否则先定位下一个匹配。 */ function replaceOne() { const el = editor.value; if (!el) return; if (draft.value.slice(el.selectionStart, el.selectionEnd).toLowerCase() !== findText.value.toLowerCase()) { findNext(); return }; replaceSelection(replaceText.value) }
/** 将查找词转义为字面量正则后，忽略大小写替换全部匹配。 */ function replaceAll() { if (!findText.value) return; draft.value = draft.value.replace(new RegExp(escapeRegex(findText.value), 'gi'), replaceText.value); sourceChanged() }
/** 记录重命名前的脚本、源码和光标身份，打开名称输入框。 */ function beginRenameSymbol() { cursorChanged();const name = selectedIdentifier.value,asset=activeAsset.value; if (!name||!asset||!editor.value) return; renameSelection={uuid:asset.uuid,source:draft.value,offset:sourceOffsetFromTextarea(draft.value,editor.value.selectionStart)};renameSource.value = name; renameDraft.value = name; renameOpen.value = true; void nextTick(/* 调用 renameInput.value?.select() 并返回调用结果。 */ () => renameInput.value?.select()) }
/** 验证新标识符和源码身份，分析重命名结果并确认后保存；期间源码变化则拒绝覆盖。 */ async function confirmRenameSymbol() {
  const name=renameSource.value,replacement=renameDraft.value.trim(),selection=renameSelection
  if(!selection||!replacement||replacement===name||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(replacement))return
  renameOpen.value=false
  try{
    if(activeAsset.value?.uuid!==selection.uuid||draft.value!==selection.source)throw Error(conversionLabels.value.renameChanged)
    const renamed=renameScriptSymbol(selection.source,name,replacement,{offset:selection.offset,externalSources:scripts.value.filter(/* 比较 asset.uuid 与 selection.uuid，返回严格不等的判断结果。 */ asset=>asset.uuid!==selection.uuid).map(/* 当 drafts[asset.uuid]??readTextAsset(asset.uuid) 为 null 或 undefined 时返回 ''，否则保留左侧值。 */ asset=>drafts[asset.uuid]??readTextAsset(asset.uuid)??'')})
    const validation=runtime.validateModuleSource(selection.uuid,renamed);if(validation.error)throw Error(validation.error)
    const approved=await requestConfirmation({title:t('renameSymbol'),message:conversionLabels.value.renameConfirm.replace('{name}',name).replace('{replacement}',replacement),confirmLabel:t('rename'),cancelLabel:t('cancel'),destructive:false})
    if(!approved)return
    if(activeAsset.value?.uuid!==selection.uuid||draft.value!==selection.source)throw Error(conversionLabels.value.renameChanged)
    draft.value=renamed;sourceChanged();await analyzeCurrent()
    if(await saveActive())addEditorLog(t('symbolRenamed',{name,replacement}),'Script')
  }catch(error){validationError.value=error instanceof Error?error.message:String(error);inspectorTab.value='problems';addEditorLog(validationError.value,'Script','error',selection.uuid)}
}
/** 在项目脚本符号中查找当前标识符的首个定义并打开其位置。 */ function goToDefinition() { const name = selectedIdentifier.value; if (!name) return; for (const asset of scripts.value) { const source = drafts[asset.uuid] ?? readTextAsset(asset.uuid) ?? ''; const symbol = analyzeScript(source).symbols.find(/* 比较 candidate.name 与 name，返回严格相等的判断结果。 */ candidate => candidate.name === name); if (symbol) { openAt(asset.uuid, symbol.line); return } } }
/** 跨项目脚本查找当前标识符的引用，并切换到符号结果面板。 */ function showReferences() { const name = selectedIdentifier.value; if (!name) return; referenceResults.value = scripts.value.flatMap(/** 查找单个脚本中的目标引用，并附上该资源的信息。 */ asset => findScriptReferences(drafts[asset.uuid] ?? readTextAsset(asset.uuid) ?? '', name).map(/** 将符号引用转换为可导航的脚本标识、名称、行号和列号。 */ reference => ({ uuid: asset.uuid, name: asset.name, line: reference.line, column: reference.column }))); inspectorTab.value = 'symbols' }
/** 按格式设置整理当前脚本，内容变化时标记草稿并记录历史；失败则显示诊断。 */ function formatActive() { if (!activeAsset.value) return; try{const formatted = formatScript(draft.value, scriptProjectSettings.formatting); if (formatted !== draft.value) { draft.value = formatted; sourceChanged(); pushHistory('Format script', `script-format:${activeAsset.value.uuid}`) }}catch(error){validationError.value=error instanceof Error?error.message:String(error);inspectorTab.value='problems'} }
/** 应用废弃接口替换或缺失语法追加等诊断修复，并重新分析修改后的草稿。 */ function applyCodeAction(action: ScriptCodeAction) { if (action.code === 'NOVA-COMPAT-001') { focusLine(action.line); const deprecated = analysis.value.diagnostics.find(/* 先计算 item.line === action.line；仅当其为真值时求右侧 item.code === action.code，返回短路求值结果。 */ item => item.line === action.line && item.code === action.code)?.message.match(/“([^”]+)”/)?.[1]; if (deprecated) { draft.value = draft.value.replace(new RegExp(`\\b${escapeRegex(deprecated)}\\b`, 'g'), action.replacement); sourceChanged() } } else if (action.code === 'NOVA-PARSE-003') { draft.value = `${draft.value.replace(/\s*$/, '')}\n${action.replacement}\n`; sourceChanged() } }
/** 为当前脚本添加经过长度限制且不重复的包依赖。 */ function addPackage() { const asset = activeAsset.value, name = packageDraft.value.trim().slice(0, 256); if (!asset?.script || !name || asset.script.packageDependencies.includes(name)) return; asset.script.packageDependencies.push(name); packageDraft.value = ''; assetState.generation++; pushHistory('Add script package dependency') }
/** 从当前脚本移除指定包依赖，并更新资源代数和历史。 */ function removePackage(name: string) { const asset = activeAsset.value; if (!asset?.script) return; asset.script.packageDependencies = asset.script.packageDependencies.filter(/* 比较 value 与 name，返回严格不等的判断结果。 */ value => value !== name); assetState.generation++; pushHistory('Remove script package dependency') }
/** 设置经过长度限制的脚本包名称并记录资源修改。 */ function setPackageName(value: string) { const asset = activeAsset.value; if (!asset) return; asset.script ??= defaultScriptMetadata(); asset.script.packageName = value.trim().slice(0, 128); assetState.generation++; pushHistory('Set script package') }
/** 仅接受保留、重建或禁用三种热重载策略并保存到脚本元数据。 */ function setReloadPolicy(value: string) { const asset = activeAsset.value; if (!asset || !['preserve', 'recreate', 'disabled'].includes(value)) return; asset.script ??= defaultScriptMetadata(); asset.script.reloadPolicy = value as 'preserve' | 'recreate' | 'disabled'; assetState.generation++; pushHistory('Set hot reload policy') }
/** 更新允许的脚本接口版本，同时失效并重建索引，再重新分析。 */ function setApiVersion(value: number) { const asset = activeAsset.value; if (!asset) return; asset.script ??= defaultScriptMetadata(); asset.script.apiVersion = value === 2 ? 2 : asset.script.apiVersion === 1 ? 1 : 2; assetState.generation++; markScriptIndexApiChanged(); rebuildProjectIndex(); pushHistory('Set script API version'); void analyzeCurrent() }
/** 没有契约头时插入契约模板并记录草稿；已有契约时直接显示契约面板。 */ function insertContractHeader() { if (!activeAsset.value || /^\s*\/\/\s*@nova\b/m.test(draft.value)) { inspectorTab.value = 'contract'; return }; draft.value = `${scriptContractHeader()}\n\n${draft.value}`; sourceChanged(); inspectorTab.value = 'contract'; pushHistory('Add script behavior contract') }
/** 请求运行时回滚脚本热重载，并在请求成功时记录排队提示。 */ function rollbackReload() { if (activeAsset.value && runtime.rollbackHotReload(activeAsset.value.uuid)) addEditorLog(t('hotReloadRollbackQueued'), 'Script', 'warning', activeAsset.value.uuid) }
/** 在光标所在函数上添加默认函数断点，并记录资源变化。 */ function addFunctionBreakpoint() { const asset = activeAsset.value; if (!asset) return; asset.script ??= defaultScriptMetadata(); const point: ScriptBreakpointMetadata = { id: `function-${Date.now()}`, line: cursor.line, functionName: analysis.value.symbols.find(/* 先计算 symbol.kind === 'function' && symbol.line <= cursor.line；仅当其为真值时求右侧 symbol.endLine >= cursor.line，返回短路求值结果。 */ symbol => symbol.kind === 'function' && symbol.line <= cursor.line && symbol.endLine >= cursor.line)?.name ?? '', condition: '', hitCondition: 0, logMessage: '', enabled: true, hitCount: 0 }; asset.script.breakpointDetails.push(point); assetState.generation++; pushHistory('Add function breakpoint') }
/** 移除指定详细断点；只有该行没有其他配置时才移除普通行断点。 */ function removeDetailedBreakpoint(id: string) { const asset = activeAsset.value; if (!asset?.script) return; const point = asset.script.breakpointDetails.find(/* 比较 item.id 与 id，返回严格相等的判断结果。 */ item => item.id === id); asset.script.breakpointDetails = asset.script.breakpointDetails.filter(/* 比较 item.id 与 id，返回严格不等的判断结果。 */ item => item.id !== id); if (point && !asset.script.breakpointDetails.some(/* 比较 item.line 与 point.line，返回严格相等的判断结果。 */ item => item.line === point.line)) asset.script.breakpoints = asset.script.breakpoints.filter(/* 比较 line 与 point.line，返回严格不等的判断结果。 */ line => line !== point.line); assetState.generation++; pushHistory('Remove script breakpoint') }
/** 把输入表达式加入调试监视列表后清空输入。 */ function addWatch() { addDebugWatch(watchDraft.value); watchDraft.value = '' }
/** 添加经过长度限制且不重复的信号名称，并记录历史。 */ function addSignal() { const name = signalDraft.value.trim().slice(0, 128); if (!name || signals.value.includes(name)) return; signals.value.push(name); signalDraft.value = ''; pushHistory('Add custom signal') }
/** 按有效索引删除信号并记录历史。 */ function removeSignal(name: string) { const index = signals.value.indexOf(name); if (index >= 0) { signals.value.splice(index, 1); pushHistory('Remove custom signal') } }
/** 验证信号名称和回调标识符后创建默认启用的信号连接，并清空输入。 */ function addSignalConnection() { const asset = activeAsset.value, signal = connectionSignalDraft.value.trim().slice(0, 128), callback = connectionCallbackDraft.value.trim().slice(0, 80); if (!asset || !signal || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(callback)) return; asset.script ??= defaultScriptMetadata(); asset.script.signalConnections.push({ signal, callback, source: '', target: '', enabled: true }); connectionSignalDraft.value = ''; connectionCallbackDraft.value = ''; assetState.generation++; pushHistory('Connect script signal') }
/** 按索引移除信号连接并更新资源代数和历史。 */ function removeSignalConnection(index: number) { const asset = activeAsset.value; if (!asset?.script) return; asset.script.signalConnections.splice(index, 1); assetState.generation++; pushHistory('Disconnect script signal') }
/** 无界面模式复制测试命令；其余模式按文件、标签或失败用例筛选后运行测试。 */ async function runTests() {
  if (testScope.value === 'headless') { const command = `pnpm nova script-test Assets/Scripts --format json --output reports/rhai-tests.json --coverage-output reports/rhai-coverage.json${testTags.value.trim() ? ` --tag ${testTags.value.trim().split(/[,\s]+/).filter(Boolean)[0]}` : ''}`; await navigator.clipboard?.writeText(command); addEditorLog(t('headlessCommandCopied'), 'Script'); return }
  const tags = testTags.value.trim().split(/[,\s]+/).filter(Boolean)
  const target = testScope.value === 'file' ? activeAsset.value?.uuid : undefined
  const failed = testScope.value === 'failed' ? [...new Set(debug.testResults.filter(/* 先计算 !result.passed；仅当其为真值时求右侧 !result.skipped，返回短路求值结果。 */ result => !result.passed && !result.skipped).map(/* 返回 result.test 的当前值。 */ result => result.test))] : undefined
  runtime.runScriptTests(target, { tags: testScope.value === 'tags' ? tags : undefined, testNames: failed })
  inspectorTab.value = 'tests'
}
/** 选中调试栈帧，并打开该帧对应脚本与源码行。 */ function selectFrame(index: number, uuid: string, line: number) {
  const frame=debug.callStack[index],source=drafts[uuid]??readTextAsset(uuid)??''
  if(!frame || frame.sessionRevision!==debug.sessionRevision || frame.sourceRevision!==debugSourceRevision(source)){debugLocationError.value=debugCopy.value.stale;return}
  debugLocationError.value='';selectDebugFrame(index); openAt(uuid, line)
}
/** 将输入限制到零至一之间，转换为保留一位小数的百分比。 */ function percent(value: number) { return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%` }
/* 调用 value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') 并返回调用结果。 */ function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
/** 逐字符执行异或和整数乘法，生成用于源码变化识别的八位十六进制散列。 */ function sourceHash(value: string) { let hash = 2166136261; for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0; return hash.toString(16).padStart(8, '0') }
</script>

<style scoped>
.blocks-managed{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2);margin:0;padding:var(--space-2) var(--space-3);border-bottom:1px solid var(--border-subtle);background:color-mix(in srgb,var(--warning,#d89b00) 12%,var(--surface-1));font-size:var(--type-dense)}.blocks-managed button{min-height:var(--ui-control-height);border:1px solid var(--border-subtle);background:var(--surface-2)}
.script-studio { container: source-studio / inline-size; position: relative; height: 100%; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--surface-1); }
.studio-toolbar { position: relative; z-index: 15; flex: 0 0 auto; min-height: var(--ui-toolbar-height); padding: var(--space-1) var(--space-2); display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); border-bottom: var(--ui-border-width) solid var(--border-subtle); }
.studio-title { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }.studio-title small { display: block; font-size: var(--type-caption); color: var(--text-muted); }.compact-toolbar .studio-title small { display: none; }
.toolbar-actions { display: flex; flex: 1 1 auto; min-width: 0; flex-wrap: wrap; align-items: center; gap: var(--ui-control-gap); }.toolbar-actions > select { max-width: 18ch; }.split-action { display: flex; flex-wrap: wrap; gap: var(--space-1); }.split-action select { max-width: 22ch; }
.studio-more { position: relative; margin-inline-start: auto; }.studio-commands { position: absolute; z-index: 30; inset-inline-end: 0; top: 100%; width: min(42ch,calc(100cqw - 2 * var(--space-2))); max-height: 65vh; padding: var(--space-1); display: flex; flex-direction: column; gap: var(--space-1); overflow: auto; border: var(--ui-border-width) solid var(--border-strong); border-radius: var(--radius-control); background: var(--surface-popover); box-shadow: var(--shadow-md); }.studio-commands > button { justify-content: start; text-align: start; white-space: normal; }.compact-setting { display: flex; align-items: center; gap: var(--ui-control-gap); font-size: var(--type-body); line-height: var(--line-body); }.toolbar-spacer { display: none; }
.studio-grid { position: relative; flex: 1; min-width: 0; min-height: 0; display: grid; overflow: hidden; isolation: isolate; }
.project-scripts,.studio-inspector { position: relative; z-index: 2; min-width: 0; min-height: 0; max-width: 100%; display: flex; flex-direction: column; overflow: hidden; background: var(--surface-1); }.project-scripts { padding: var(--space-2); gap: var(--space-2); border-right: var(--ui-border-width) solid var(--border-subtle); }.project-scripts > input,.project-scripts > .pane-heading { flex-shrink: 0; }
.pane-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); min-height: var(--ui-standard-height); color: var(--text-secondary); font-size: var(--type-section); }.pane-heading span { color: var(--text-muted); font-size: var(--type-caption); }
.script-list,.search-results { min-height: 0; display: grid; align-content: start; grid-auto-rows: max-content; gap: var(--space-0); overflow: auto; flex: 1; }.search-results { max-height: 45%; border-top: var(--ui-border-width) solid var(--border-subtle); }.script-list button,.search-results button { width: 100%; min-width: 0; display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1); text-align: start; }.script-list button > span { min-width: 0; }.script-list strong,.script-list small,.search-results strong,.search-results small { display: block; overflow-wrap: anywhere; }.script-list small,.search-results small { color: var(--text-muted); font-size: var(--type-caption); }.search-results button { display: block; }
.code-workspace { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--bg-canvas); }.file-tabs { flex: 0 0 auto; min-height: var(--ui-tab-height); display: flex; align-items: center; overflow-x: auto; border-bottom: var(--ui-border-width) solid var(--border-subtle); background: var(--surface-1); }.file-tabs > span { flex: 1; }.file-tab { display: flex; flex: 0 0 auto; max-width: 32ch; align-items: center; border-inline-end: var(--ui-border-width) solid var(--border-subtle); }.file-tab > button:first-child { display: flex; align-items: center; gap: var(--space-1); min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }.file-tab.active { background: var(--selection-bg); }.dirty-dot { width: var(--space-1); height: var(--space-1); flex: 0 0 var(--space-1); border-radius: 50%; background: var(--accent); font-size: 0; visibility: hidden; }.dirty-dot.visible { visibility: visible; }
.find-bar { flex: 0 0 auto; min-width: 0; padding: var(--space-1) var(--space-2); display: flex; flex-wrap: wrap; gap: var(--space-1); align-items: center; border-bottom: var(--ui-border-width) solid var(--border-subtle); }.find-bar input { flex: 1 1 14ch; }.find-bar span { color: var(--text-muted); font-size: var(--type-caption); }
/* Gutter and textarea share exact line geometry so breakpoint hit targets align. */
.editor-shell { position: relative; flex: 1; min-height: 0; display: grid; grid-template-columns: 6ch minmax(0,1fr); overflow: hidden; --source-line-height: calc(24px * var(--ui-scale)); }
.gutter { padding-top: var(--space-2); overflow: hidden; border-right: var(--ui-border-width) solid var(--border-subtle); background: var(--surface-1); }.gutter button { width: 100%; height: var(--source-line-height); min-height: var(--source-line-height); padding: 0 var(--space-2); display: flex; align-items: center; justify-content: end; gap: var(--space-1); border: 0; color: var(--text-muted); background: transparent; font: var(--type-code)/var(--source-line-height) var(--font-mono); }.gutter button span { width: var(--space-2); height: var(--space-2); flex: 0 0 var(--space-2); border: var(--ui-border-width) solid transparent; border-radius: 50%; }.gutter button:hover span { border-color: var(--accent); }.gutter button.breakpoint span { border-color: var(--danger); background: var(--danger); }.gutter button.error { color: var(--danger); }
.editor-shell textarea { width: 100%; height: 100%; min-height: 0; max-width: none; padding: var(--space-2) var(--space-4); border: 0; border-radius: 0; outline: 0; resize: none; tab-size: 2; white-space: pre; overflow: auto; color: var(--text-primary); caret-color: var(--accent); background: var(--bg-canvas); font: var(--type-code)/var(--source-line-height) var(--font-mono); }
.completion-popover { position: absolute; left: 10ch; top: calc(2 * var(--source-line-height)); z-index: 4; width: 30ch; max-height: 50%; padding: var(--space-1); display: grid; overflow: auto; border: var(--ui-border-width) solid var(--border-strong); border-radius: var(--radius-control); background: var(--surface-popover); box-shadow: var(--shadow-md); }.completion-popover button { display: flex; align-items: center; gap: var(--space-2); text-align: start; }
.signature-help { position: absolute; left: 8ch; bottom: var(--space-3); max-width: calc(100% - 10ch); padding: var(--space-2); display: grid; gap: var(--space-1); border: var(--ui-border-width) solid var(--border-subtle); background: var(--surface-popover); box-shadow: var(--shadow-md); }.signature-help code { color: var(--accent); }.signature-help span { color: var(--text-muted); font-size: var(--type-caption); }
.editor-status { flex: 0 0 auto; max-height: calc(3 * var(--ui-tree-row-height)); overflow: auto; min-height: var(--ui-tree-row-height); padding: var(--space-1) var(--space-2); display: flex; flex-wrap: wrap; align-items: center; justify-content: end; gap: var(--space-1) var(--space-3); border-top: var(--ui-border-width) solid var(--border-subtle); background: var(--surface-1); color: var(--text-muted); font-size: var(--type-caption); }.editor-status span { overflow-wrap: anywhere; }.editor-status span:first-child { margin-inline-end: auto; }.linked-graph-status { display: inline-flex; align-items: center; gap: var(--space-1); }.status-ok,.contract-valid { color: var(--success); }.status-error,.contract-invalid,.source-save-error { color: var(--danger); }
.empty-editor { flex: 1; display: grid; align-content: center; justify-items: center; gap: var(--space-2); padding: var(--space-4); color: var(--text-muted); text-align: center; }.empty-editor h2 { font-size: var(--type-section); color: var(--text-primary); }
.studio-inspector { border-left: var(--ui-border-width) solid var(--border-subtle); }.studio-grid.detail-bottom .project-scripts { grid-row: 1 / 3; }.studio-grid.detail-bottom .studio-inspector { grid-column: 2; grid-row: 2; border-left: 0; border-top: var(--ui-border-width) solid var(--border-subtle); }.studio-grid.detail-bottom.explorer-hidden .code-workspace,.studio-grid.detail-bottom.explorer-hidden .studio-inspector { grid-column: 1; }
.inspector-tabs { flex: 0 0 auto; margin-inline-end: var(--ui-control-height); border-bottom: var(--ui-border-width) solid var(--border-subtle); }.close-inspector { position: absolute; z-index: 3; top: var(--space-0); right: 0; }.inspector-pane { flex: 1; min-height: 0; padding: var(--space-2); display: flex; flex-direction: column; gap: var(--space-2); overflow: auto; }.inspector-pane > * { flex-shrink: 0; }.empty-pane,.pane-help { color: var(--text-muted); font-size: var(--type-caption); line-height: var(--line-body); }
.problem,.symbol,.test-result { display: flex; align-items: start; gap: var(--space-2); padding: var(--space-1); text-align: start; }.problem > span,.test-result > span,.type-symbol > span,.statement > span { min-width: 0; display: grid; gap: var(--space-1); }.problem small,.test-result small,.symbol small { color: var(--text-muted); font-size: var(--type-caption); overflow-wrap: anywhere; }.problem i { width: var(--space-2); height: var(--space-2); margin-top: var(--space-1); flex: 0 0 var(--space-2); border-radius: 50%; background: var(--warning); }.problem i.error { background: var(--danger); }.problem i.info { background: var(--accent); }.symbol i { width: var(--ui-icon-size); color: var(--accent); font-style: normal; }.symbol span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.dependency-editor { display: flex; flex-wrap: wrap; gap: var(--space-1); }.dependency-editor input { flex: 1 1 14ch; }.inspector-pane > label { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); min-height: var(--ui-standard-height); border-bottom: var(--ui-border-width) solid var(--border-subtle); }.inspector-pane > label span { min-width: 0; display: grid; overflow-wrap: anywhere; }.inspector-pane > label small { color: var(--text-muted); }.inspector-pane > label small.error { color: var(--danger); }.emit { color: var(--accent); }.debug-pane p { padding-block: var(--space-1); color: var(--text-muted); }.inspector-pane > h3 { font-size: var(--type-section); color: var(--text-secondary); }.inspector-pane pre { max-height: calc(8 * var(--ui-control-height)); margin: 0; padding: var(--space-2); overflow: auto; background: var(--bg-canvas); font-size: var(--type-caption); }.paused { color: var(--warning); }.test-result i { color: var(--danger); font-style: normal; }.test-result i.passed { color: var(--success); }.test-result i.skipped { color: var(--text-muted); }
.api-reference article,.type-structure,.contract-row,.contract-metrics article,.reload-entry,.reload-state { min-width: 0; padding-block: var(--space-2); display: grid; gap: var(--space-1); border-bottom: var(--ui-border-width) solid var(--border-subtle); }.api-reference article small,.contract-metrics strong { color: var(--accent); }.api-reference article p,.api-reference article code,.type-structure small,.contract-row small { color: var(--text-muted); font-size: var(--type-caption); overflow-wrap: anywhere; }.api-reference article b { color: var(--warning); }
.breakpoint-detail { display: grid; grid-template-columns: auto minmax(0,1fr) var(--ui-control-height); gap: var(--space-1); padding-block: var(--space-2); border-bottom: var(--ui-border-width) solid var(--border-subtle); }.breakpoint-detail > label { display: flex; align-items: center; gap: var(--ui-control-gap); }.breakpoint-detail > input { grid-column: 2; }.breakpoint-detail > button { grid-column: 3; grid-row: 1 / 6; color: var(--danger); }
.hot-reload-state,.reload-state { overflow-wrap: anywhere; font-size: var(--type-caption); }.hot-reload-state.applied { color: var(--success); }.hot-reload-state.rejected,.reload-state[data-status='rejected'] { color: var(--warning); }.coverage-summary,.contract-metrics { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: var(--space-2); }.coverage-summary span { display: grid; color: var(--text-muted); }.coverage-summary b { color: var(--text-primary); }.contract-flags { display: flex; flex-wrap: wrap; gap: var(--space-2); font-size: var(--type-caption); color: var(--text-muted); }.contract-flags .enabled { color: var(--success); }.contract-row { grid-template-columns: auto minmax(0,1fr); }.contract-row > span { color: var(--accent); font-size: var(--type-caption); }.contract-row small { grid-column: 1 / -1; }
.rename-overlay { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; background: var(--scrim); }.rename-card { width: min(42ch,calc(100% - 2 * var(--space-4))); padding: var(--space-4); display: grid; gap: var(--space-2); border: var(--ui-border-width) solid var(--border-strong); border-radius: var(--radius-dialog); background: var(--surface-1); box-shadow: var(--shadow-lg); }.rename-card > div { display: flex; justify-content: end; gap: var(--space-1); }
.inspector-pane :is(pre,code),.reload-entry small { max-width: 100%; white-space: pre-wrap; overflow-wrap: anywhere; }.drawer-layout .project-scripts,.drawer-layout .studio-inspector { position: absolute; z-index: 10; top: 0; bottom: 0; box-shadow: var(--shadow-lg); }.drawer-layout .project-scripts { left: 0; }.drawer-layout .studio-inspector { right: 0; }.drawer-layout .code-workspace { grid-column: 1; grid-row: 1; }
@container source-studio (max-width: 1000px) { .compact-toolbar .studio-title { display: none; } }
@container source-studio (max-width: 640px) { .studio-title small { display: none; }.toolbar-actions > select { max-width: 14ch; }.editor-shell textarea { padding-inline: var(--space-2); } }
</style>
