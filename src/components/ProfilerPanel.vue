<!-- 性能分析面板：查看帧指标、运行诊断和测试结果。 -->
<template>
  <section class="production-panel">
    <UiPanelHeader class="production-header" :title="t('profiler')" :description="t('profilerHint')" />
    <UiTabs :aria-label="t('profiler')" :items="tabs.map(tab => ({ id: tab.id, label: t(tab.label) }))" :model-value="activeTab" @update:model-value="selectTab($event as TabId)" />

    <div v-if="activeTab === 'trace'" class="panel-scroll trace-layout">
      <section class="card metrics-card">
        <header><strong>{{ t('frameTrace') }}</strong><span>{{ profilerState.samples.length }}/{{ settings.performance.traceCapacity }}</span></header>
        <div class="metrics">
          <article v-for="metric in timingMetrics" :key="metric.label"><span>{{ t(metric.label) }}</span><strong>{{ metric.value.toFixed(2) }} ms</strong></article>
          <article><span>{{ t('fps') }}</span><strong>{{ current.fps === null ? measurementCopy.unavailable : current.fps.toFixed(0) }}</strong></article>
          <article><span>{{ t('memory') }}</span><strong>{{ current.memoryMb === null ? 'n/a' : `${current.memoryMb.toFixed(1)} MB` }}</strong></article>
          <article><span>{{ t('gpuPasses') }}</span><strong>{{ current.gpuPasses }}</strong></article>
          <article><span>{{ t('lifetimeChanges') }}</span><strong>{{ current.allocations }}</strong></article>
          <article><span>{{ t('assetJobs') }}</span><strong>{{ current.assetJobs }}</strong></article>
          <article><span>{{ t('mainThreadTime') }}</span><strong>{{ current.mainThreadMs === null ? measurementCopy.unavailable : current.mainThreadMs.toFixed(2) + ' ms' }}</strong></article>
          <article><span>{{ t('workerTime') }}</span><strong>{{ current.workerMs.toFixed(2) }} ms</strong></article>
          <article><span>{{ t('queueWaitTime') }}</span><strong>{{ current.queueWaitMs.toFixed(2) }} ms</strong></article>
          <article><span>{{ t('cacheHitRate') }}</span><strong>{{ (current.cacheHitRate * 100).toFixed(0) }}%</strong></article>
          <article><span>{{ t('onePercentLow') }}</span><strong>{{ current.onePercentLowFps === null ? measurementCopy.unavailable : current.onePercentLowFps.toFixed(0) + ' FPS' }}</strong></article>
          <article><span :title="t('inputToCpuSubmitHint')">{{ t('inputToCpuSubmit') }}</span><strong>{{ current.inputToSubmitMs === null ? measurementCopy.unavailable : current.inputToSubmitMs.toFixed(2) + ' ms' }}</strong></article>
          <article><span>{{ t('drawCalls') }}</span><strong>{{ editorState.rendererStats.drawCalls }}</strong></article>
          <article><span>{{ t('runtimeBodies') }}</span><strong>{{ physicsState.engineDiagnostics.bodyCount }}</strong></article>
          <article><span>{{ t('activeContacts') }}</span><strong>{{ activeContacts }}</strong></article>
          <article><span>{{ t('sleepingBodies') }}</span><strong>{{ sleepingBodies }}</strong></article>
          <article><span>{{ t('continuousBodies') }}</span><strong>{{ continuousBodies }}</strong></article>
          <article><span>{{ t('jointConstraints') }}</span><strong>{{ jointConstraints }}</strong></article>
          <article><span>{{ t('activeVoices') }}</span><strong>{{ audioRuntime.diagnostics.activeVoices }}</strong></article>
          <article><span>{{ t('audioLatency') }}</span><strong>{{ audioRuntime.diagnostics.baseLatencyMs === null ? 'n/a' : `${audioRuntime.diagnostics.baseLatencyMs.toFixed(1)} ms` }}</strong></article>
          <article><span>{{ t('audioUnderruns') }}</span><strong>{{ audioRuntime.diagnostics.underruns }}</strong></article>
        </div>
        <section class="presentation-diagnostics" data-audit="profiler-measurement">
          <h3>{{ measurementCopy.title }}</h3>
          <p>{{ measurementCopy.interval }}: median {{ intervalSummary.median }} ms · p95 {{ intervalSummary.p95 }} ms · p99 {{ intervalSummary.p99 }} ms ({{ intervalSummary.count }})</p>
          <p data-audit="profiler-sampling-window">{{ samplingWindowCopy.profiler }}</p>
          <p data-audit="runtime-sampling-window">{{ samplingWindowCopy.runtime }}</p>
          <dl><div><dt>{{ measurementCopy.backend }}</dt><dd>{{ presentationStats.backend }}</dd></div><div><dt>{{ measurementCopy.resolution }}</dt><dd>{{ presentationStats.backingWidth ?? '—' }} × {{ presentationStats.backingHeight ?? '—' }}</dd></div><div><dt>{{ measurementCopy.samples }}</dt><dd>{{ presentationStats.antiAliasingSamples ?? '—' }}</dd></div><div><dt>{{ measurementCopy.fallback }}</dt><dd>{{ presentationStats.antiAliasingLimited ? t('yes') : t('no') }} / {{ presentationStats.shaderFallbacks }}</dd></div><div><dt>{{ measurementCopy.gpu }}</dt><dd>{{ presentationStats.gpuMs === null ? measurementCopy.unavailable : presentationStats.gpuMs.toFixed(2) + ' ms' }}</dd></div><div><dt>{{ measurementCopy.budget }}</dt><dd>{{ (presentationStats.textureMemoryBytes / 1048576).toFixed(1) }} / {{ (presentationStats.textureBudgetBytes / 1048576).toFixed(1) }} MB</dd></div></dl>
          <p data-audit="render-request-status">{{ renderRequestStatusCopy }}</p>
          <table data-audit="render-current-request"><caption>{{ t('renderLatestRequest') }}</caption><thead><tr><th>{{ measurementCopy.pass }}</th><th>{{ measurementCopy.cpu }}</th><th>{{ t('drawCalls') }}</th></tr></thead><tbody><tr v-for="pass in renderGraphState.passes" :key="pass.name"><th>{{ pass.name }}</th><td>{{ renderGraphState.request.status === 'not-submitted' ? t('renderNotSubmitted') : pass.enabled ? pass.durationMs.toFixed(2) + ' ms' : measurementCopy.disabled }}</td><td>{{ pass.drawCalls }}</td></tr></tbody></table>
          <template v-if="renderGraphState.lastWorldSubmission && renderGraphState.request.status !== 'world-cpu-submitted'"><p data-audit="render-historical-submission">{{ t('renderHistoricalWorldSubmission', { frame: renderGraphState.lastWorldSubmission.requestFrame }) }}</p><table data-audit="render-historical-passes"><thead><tr><th>{{ measurementCopy.pass }}</th><th>{{ measurementCopy.cpu }}</th><th>{{ t('drawCalls') }}</th></tr></thead><tbody><tr v-for="pass in renderGraphState.lastWorldSubmission.passes" :key="pass.name"><th>{{ pass.name }}</th><td>{{ pass.enabled ? pass.durationMs.toFixed(2) + ' ms' : measurementCopy.disabled }}</td><td>{{ pass.drawCalls }}</td></tr></tbody></table></template>
          <p>{{ measurementCopy.quality }}</p><p>{{ measurementCopy.memory }}</p>
        </section>
        <svg class="trace-chart" viewBox="0 0 600 110" preserveAspectRatio="none" :aria-label="t('frameHistory')"><line x1="0" y1="93.3" x2="600" y2="93.3"/><line x1="0" y1="76.7" x2="600" y2="76.7"/><polyline :points="chartPoints" /></svg>
<!-- 火焰视图过滤回调仅展示耗时大于零的指标。 -->        <div class="flame-view"><article v-for="metric in timingMetrics.filter(item => item.value > 0)" :key="metric.label" :style="{ width: `${Math.max(8, metric.value / Math.max(.001,current.frameMs) * 100)}%` }"><span>{{ t(metric.label) }}</span><output>{{ metric.value.toFixed(2) }} ms</output></article></div>
        <div class="button-row"><UiButton :icon="profilerState.frozen ? 'play' : 'pause'" :label="t(profilerState.frozen ? 'resumeProfiler' : 'freezeProfiler')" :aria-pressed="profilerState.frozen" @click="profilerState.frozen = !profilerState.frozen" /><UiButton icon="clear" :label="t('clearSamples')" @click="clearProfiler" /><UiButton icon="camera" :label="t('capturePerformance')" variant="primary" @click="takeCapture" /></div>
      </section>
      <section class="card settings-card">
        <header><strong>{{ t('traceSettings') }}</strong></header>
        <label><span>{{ t('traceCapacity') }}</span><input v-model.number="settings.performance.traceCapacity" type="number" min="60" max="10000" @change="commit"></label>
        <label><span>{{ t('inputTime') }}</span><output>{{ current.inputMs.toFixed(2) }} ms</output></label>
        <label><span>{{ t('physicsTime') }}</span><output>{{ current.physicsMs.toFixed(2) }} ms</output></label>
        <label><span>{{ t('scriptsTime') }}</span><output>{{ current.scriptsMs.toFixed(2) }} ms</output></label>
        <label><span>{{ t('animationTime') }}</span><output>{{ current.animationMs.toFixed(2) }} ms</output></label>
        <label><span>{{ t('animationBudget') }}</span><input v-model.number="settings.performance.animationBudgetMs" type="number" min="0.05" max="100" step="0.05" @change="commit"></label>
        <label><span>{{ t('uiBudget') }}</span><input v-model.number="settings.performance.uiBudgetMs" type="number" min="0.05" max="100" step="0.05" @change="commit"></label>
        <label><span>{{ t('frameBudget') }}</span><input v-model.number="settings.performance.frameBudgetMs" type="number" min="1" max="1000" step=".1" @change="commit"></label>
        <label><span>{{ t('adaptivePresentationQuality') }}</span><input v-model="settings.performance.adaptiveQuality" type="checkbox" @change="commit"></label>
        <label><span>{{ t('frameWorkBudget') }}</span><input v-model.number="settings.performance.frameWorkBudgetMs" type="number" min=".1" max="20" step=".1" @change="commit"></label>
        <label><span>{{ t('streamingFrameBudget') }}</span><input v-model.number="settings.performance.streamingBudgetMs" type="number" min=".1" max="20" step=".1" @change="commit"></label>
        <label><span>{{ t('commandBudget') }}</span><input v-model.number="settings.performance.maximumCommandsPerFrame" type="number" min="32" max="100000" step="32" @change="commit"></label>
        <label><span>{{ t('reactivePublishInterval') }}</span><input v-model.number="settings.performance.reactivePublishInterval" type="number" min="1" max="120" @change="commit"></label>
        <label><span>{{ t('spatialCellSize') }}</span><input v-model.number="settings.performance.spatialCellSize" type="number" min=".01" max="1000000" step="1" @change="commit"></label>
        <p>{{ t('adaptiveQualityPresentationOnly') }}</p>
        <label><span>{{ t('renderGpuBudget') }}</span><div><input v-model.number="settings.performance.renderingBudgetMs" type="number" min=".05" step=".1" @change="commit"><input v-model.number="settings.performance.gpuBudgetMs" type="number" min=".05" step=".1" @change="commit"></div></label>
        <label><span>{{ t('audioParticleBudget') }}</span><div><input v-model.number="settings.performance.audioBudgetMs" type="number" min=".05" step=".1" @change="commit"><input v-model.number="settings.performance.particleBudgetMs" type="number" min=".05" step=".1" @change="commit"></div></label>
        <label><span>{{ t('profilerMode') }}</span><select v-model="profilerState.overheadMode"><option>Full</option><option>Low overhead</option><option>Off</option></select></label>
        <label><span>{{ t('overheadBudget') }} %</span><input v-model.number="settings.performance.profilerOverheadBudgetPercent" type="number" min="0" max="100" step=".1" @change="commit"></label>
        <label><span>{{ t('remotePlayer') }}</span><input v-model="profilerState.remotePeer" maxlength="160" placeholder="exported-player:port"></label>
        <label><span>{{ t('annotation') }}</span><div class="annotation-control"><input v-model="annotationDraft" maxlength="500"><UiButton icon="add" :label="t('annotation')" @click="annotate" /></div></label>
        <p>{{ profilerState.markers.length }} markers · {{ profilerState.counters.length }} counters · {{ profilerState.annotations.length }} annotations · {{ t('estimatedProfilerOverhead') }} {{ profilerState.estimatedOverheadPercent.toFixed(2) }}%</p>
        <p>{{ t('profilerEstimateHint') }}</p>
        <p :class="{ danger: current.animationMs > settings.performance.animationBudgetMs }">{{ current.animationMs > settings.performance.animationBudgetMs ? t('animationBudgetExceeded') : t('animationWithinBudget') }}</p>
        <label><span>{{ t('audioTime') }}</span><output>{{ current.audioMs.toFixed(2) }} ms</output></label>
        <label><span>{{ t('renderingTime') }}</span><output>{{ current.renderingMs.toFixed(2) }} ms</output></label>
        <p>{{ t('traceCorrelationHint') }}</p>
      </section>
      <section class="card debug-card">
        <header><strong>{{ t('physicsDebugger') }}</strong><input v-model="physicsDebugState.enabled" type="checkbox"></header>
        <label v-for="option in debugOptions" :key="option.key"><span>{{ t(option.label) }}</span><input v-model="physicsDebugState[option.key]" type="checkbox" :disabled="!physicsDebugState.enabled"></label>
      </section>
    </div>

    <div v-else-if="activeTab === 'memory'" class="panel-scroll studio-grid">
      <section class="card">
        <header><strong>{{ t('budgets') }}</strong><span :class="{ danger: tools.memoryBudgetExceeded || tools.assetBudgetExceeded }">{{ tools.memoryBudgetExceeded || tools.assetBudgetExceeded ? t('budgetExceeded') : t('withinBudget') }}</span></header>
        <label><span>{{ t('memoryBudget') }}</span><input v-model.number="settings.performance.memoryBudgetMb" type="number" min="16" max="65536" @change="commit"></label>
        <label><span>{{ t('assetBudget') }}</span><input v-model.number="settings.performance.assetBudgetMb" type="number" min="1" max="1048576" @change="commit"></label>
        <label><span>{{ t('memory') }}</span><output>{{ tools.memoryMb === null ? 'n/a' : `${tools.memoryMb.toFixed(1)} MB` }}</output></label>
        <label><span>{{ t('assetMemory') }}</span><output>{{ tools.assetMb.toFixed(2) }} MB</output></label>
        <label><span>{{ t('liveObjects') }}</span><output>{{ tools.liveEntities }}</output></label>
        <label><span>{{ t('createdReleased') }}</span><output>{{ tools.createdEntities }} / {{ tools.releasedEntities }}</output></label>
        <label><span>{{ t('leakWindow') }}</span><input v-model.number="settings.performance.leakWindowFrames" type="number" min="60" max="60000" @change="commit"></label>
        <p :class="{ danger: tools.possibleLeak }">{{ tools.possibleLeak ? t('possibleLeak', { rate: tools.leakSlopeMbPerMinute.toFixed(2) }) : t('noLeakTrend') }}</p>
      </section>
      <section class="card capture-card">
        <header><strong>{{ t('captureComparison') }}</strong><button @click="takeCapture">+ {{ t('capturePerformance') }}</button></header>
        <label><span>A</span><select v-model="captureA"><option value="">{{ t('none') }}</option><option v-for="capture in tools.captures" :key="capture.id" :value="capture.id">{{ capture.name }}</option></select></label>
        <label><span>B</span><select v-model="captureB"><option value="">{{ t('none') }}</option><option v-for="capture in tools.captures" :key="capture.id" :value="capture.id">{{ capture.name }}</option></select></label>
        <button :disabled="!captureA || !captureB || captureA === captureB" @click="compareCaptures">{{ t('compareCaptures') }}</button>
        <button :disabled="!selectedPerformanceCapture" @click="exportPerformanceCapture">{{ t('exportCaptureCi') }}</button>
        <dl v-if="tools.comparison"><div><dt>{{ t('averageFrameDelta') }}</dt><dd>{{ signed(tools.comparison.averageFrameDeltaMs) }} ms</dd></div><div><dt>{{ t('peakFrameDelta') }}</dt><dd>{{ signed(tools.comparison.peakFrameDeltaMs) }} ms</dd></div><div><dt>GPU delta</dt><dd>{{ tools.comparison.gpuDeltaMs === null ? 'n/a' : `${signed(tools.comparison.gpuDeltaMs)} ms` }}</dd></div><div><dt>Draw-call delta</dt><dd>{{ signedInteger(tools.comparison.drawCallDelta) }}</dd></div><div><dt>Texture delta</dt><dd>{{ signed(tools.comparison.textureMemoryDeltaMb) }} MB</dd></div><div><dt>{{ t('memoryDelta') }}</dt><dd>{{ tools.comparison.memoryDeltaMb === null ? 'n/a' : `${signed(tools.comparison.memoryDeltaMb)} MB` }}</dd></div><div><dt>{{ t('assetDelta') }}</dt><dd>{{ signed(tools.comparison.assetDeltaMb) }} MB</dd></div><div><dt>{{ t('entityDelta') }}</dt><dd>{{ signed(tools.comparison.entityDelta) }}</dd></div></dl>
        <div v-if="selectedPerformanceCapture" class="budget-checks" data-audit="performance-evidence"><strong :class="{ danger: selectedPerformanceCapture.budget.status === 'failed' || !selectedPerformanceCapture.budget.status && !selectedPerformanceCapture.budget.passed }">CI {{ t(captureStatusKey(performanceCaptureCiReport(selectedPerformanceCapture).status)) }}</strong><p>{{ t('performanceEvidenceScope') }}</p><p data-audit="performance-capture-script-collection">{{ performanceCaptureCollectionCopy }}</p><article v-for="check in selectedPerformanceCapture.budget.checks" :key="check.id" :class="{ danger: check.status === 'failed' || !check.status && !check.passed }"><span>{{ check.id }} · {{ t(captureStatusKey(check.status ?? (check.passed ? 'passed' : 'failed'))) }}</span><output>{{ check.actual === null ? t('performanceUnavailable') : check.actual.toFixed(2) }} / {{ check.limit }} {{ check.unit }}</output></article></div>
      </section>
      <section class="card lifetime-card">
        <header><strong>{{ t('objectLifetimes') }}</strong><span>{{ tools.lifetimeEvents.length }}</span></header>
        <label><span>{{ t('lifetimeCapacity') }}</span><input v-model.number="settings.performance.lifetimeCapacity" type="number" min="100" max="20000" @change="commit"></label>
        <div class="event-list"><article v-for="event in recentLifetimeEvents" :key="`${event.frame}:${event.kind}:${event.id}:${event.action}`"><code>#{{ event.frame }}</code><span>{{ event.kind }}</span><strong>{{ event.action }}</strong><em>{{ event.id }}</em></article></div>
        <button @click="clearPerformanceTools">{{ t('clearLifetimeData') }}</button>
      </section>
    </div>

    <div v-else-if="activeTab === 'replay'" class="panel-scroll studio-grid">
      <section class="card">
        <header><strong>{{ t('deterministicReplay') }}</strong><span>{{ replayState.status || t('idle') }}</span></header>
        <label><span>{{ t('randomSeed') }}</span><input v-model.number="settings.replay.seed" type="number" min="0" max="4294967295" @change="commit"></label>
        <label><span>{{ t('replayCapacity') }}</span><input v-model.number="settings.replay.capacity" type="number" min="60" max="60000" @change="commit"></label>
        <label><span>{{ t('strictChecksums') }}</span><input v-model="settings.replay.strictChecksums" type="checkbox" @change="commit"></label>
        <label><span>{{ t('recordedFrames') }}</span><output>{{ replayState.frames.length }}</output></label>
        <label><span>{{ t('checksumMismatches') }}</span><output :class="{ danger: replayState.mismatches.length }">{{ replayState.mismatches.length }}</output></label>
        <div class="button-row"><button class="primary" :disabled="replayState.mode !== 'idle'" @click="recordReplay">{{ t('recordReplay') }}</button><button :disabled="replayState.mode === 'idle'" @click="finishReplay">{{ t('stopReplay') }}</button></div>
        <p>{{ t('determinismLimit') }}</p>
      </section>
      <section class="card">
        <header><strong>{{ t('replayAssets') }}</strong><span>{{ replayAssets.length }}</span></header>
        <label><span>{{ t('replayAsset') }}</span><select v-model="selectedReplay"><option value="">{{ t('none') }}</option><option v-for="asset in replayAssets" :key="asset.uuid" :value="asset.uuid">{{ asset.name }}</option></select></label>
        <div class="button-row"><button :disabled="!selectedReplay || replayState.mode !== 'idle'" @click="playReplay">{{ t('playReplay') }}</button><button :disabled="!selectedReplay" @click="downloadReplay">{{ t('exportJson') }}</button></div>
        <div class="event-list"><article v-for="mismatch in replayState.mismatches.slice(-32)" :key="mismatch.tick"><code>#{{ mismatch.tick }}</code><strong class="danger">{{ t('checksumMismatch') }}</strong><em>{{ mismatch.expected }} → {{ mismatch.actual }}</em></article></div>
      </section>
    </div>

    <div v-else-if="activeTab === 'tests'" class="tests-layout">
      <aside class="test-list card">
        <header><strong>{{ t('projectTests') }}</strong><button @click="addTest">+ {{ t('newTest') }}</button></header>
        <button v-for="test in settings.testing.tests" :key="test.id" :class="{ active: selectedTestId === test.id }" @click="selectedTestId = test.id"><strong>{{ test.name }}</strong><span>{{ test.kind }}</span></button>
        <p v-if="!settings.testing.tests.length">{{ t('noProjectTests') }}</p>
      </aside>
      <main class="card test-editor">
        <template v-if="selectedTest">
          <header><strong>{{ selectedTest.name }}</strong><button class="danger-button" @click="removeTest">{{ t('delete') }}</button></header>
          <div class="form-grid"><label><span>{{ t('name') }}</span><input v-model="selectedTest.name" maxlength="120" @change="commit"></label><label><span>{{ t('testKind') }}</span><select v-model="selectedTest.kind" @change="commit"><option>unit</option><option>integration</option><option>scene</option><option>ui</option><option>physics</option><option>animation</option><option>regression</option><option>headless</option></select></label><label><span>{{ t('scene') }}</span><select v-model="selectedTest.sceneUuid" @change="commit"><option value="">{{ t('activeScene') }}</option><option v-for="scene in sceneManager.scenes" :key="scene.uuid" :value="scene.uuid">{{ scene.name }}</option></select></label><label><span>{{ t('simulationSteps') }}</span><input v-model.number="selectedTest.steps" type="number" min="0" max="60000" @change="commit"></label><label><span>{{ t('timeoutMs') }}</span><input v-model.number="selectedTest.timeoutMs" type="number" min="100" max="120000" @change="commit"></label><label class="check"><input v-model="selectedTest.captureScreenshot" type="checkbox" :disabled="selectedTest.kind === 'headless'" @change="commit"><span>{{ t('captureScreenshot') }}</span></label></div>
          <header><strong>{{ t('assertions') }}</strong><button @click="addAssertion">+ {{ t('assertion') }}</button></header>
          <div class="assertion-list"><article v-for="(assertion, index) in selectedTest.assertions" :key="index"><select v-model="assertion.kind" @change="commit"><option>entityCountAtLeast</option><option>entityExists</option><option>finitePhysics</option><option>checksumEquals</option><option>noRuntimeErrors</option></select><input v-model="assertion.target" :placeholder="t('target')" maxlength="128" @change="commit"><input v-model="assertion.expected" :placeholder="t('expected')" maxlength="256" @change="commit"><UiButton icon="remove" variant="danger" :label="t('remove')" @click="selectedTest.assertions.splice(index, 1); commit()" /></article></div>
          <div class="button-row"><button class="primary" :disabled="testRunnerState.running" @click="runTests(selectedTest.id)">{{ t('runSelectedTest') }}</button><button :disabled="testRunnerState.running" @click="runTests()">{{ t('runAllTests') }}</button><button :disabled="!testRunnerState.lastReport" @click="downloadTestReport('json')">{{ t('exportJson') }}</button><button :disabled="!testRunnerState.lastReport" @click="downloadTestReport('junit')">JUnit XML</button></div>
        </template>
        <p v-else>{{ t('selectProjectTest') }}</p>
      </main>
      <aside class="card results-card">
        <header><strong>{{ t('testResults') }}</strong><span>{{ testRunnerState.completed }}/{{ testRunnerState.total }}</span></header>
        <p v-if="testRunnerState.running">{{ t('runningTest', { name: testRunnerState.activeTest }) }}</p>
<!-- 断言过滤回调仅展示测试中未通过的断言。 -->        <article v-for="result in testRunnerState.results" :key="result.id" :class="result.status"><strong>{{ result.name }}</strong><span>{{ result.status }} · {{ result.durationMs.toFixed(1) }} ms</span><small v-if="result.error">{{ result.error }}</small><small v-for="assertion in result.assertions.filter(item => !item.passed)" :key="assertion.kind">{{ assertion.message }}</small><img v-if="result.screenshot" :src="result.screenshot" :alt="result.name"></article>
      </aside>
    </div>

    <div v-else-if="activeTab === 'data'" class="data-layout">
      <aside class="card data-assets">
        <header><strong>{{ t('dataResources') }}</strong></header>
        <button @click="newSchema">+ {{ t('dataSchema') }}</button><button @click="newTable">+ {{ t('dataTable') }}</button>
        <label><span>{{ t('dataSchema') }}</span><select v-model="schemaGuid"><option value="">{{ t('none') }}</option><option v-for="asset in schemaAssets" :key="asset.uuid" :value="asset.uuid">{{ asset.name }}</option></select></label>
        <label><span>{{ t('dataTable') }}</span><select v-model="tableGuid"><option value="">{{ t('none') }}</option><option v-for="asset in tableAssets" :key="asset.uuid" :value="asset.uuid">{{ asset.name }}</option></select></label>
        <p>{{ t('dataResourceHint') }}</p>
      </aside>
      <main class="card data-editor">
        <template v-if="schemaDraft">
          <header><strong>{{ t('schemaFields') }}</strong><div><button @click="addField">+ {{ t('field') }}</button><button class="primary" :disabled="!schemaGuid" @click="saveSchemaDraft">{{ t('saveAsset') }}</button><button @click="downloadAccessors">{{ t('typedAccessors') }}</button></div></header>
          <div class="form-grid"><label><span>{{ t('schemaName') }}</span><input v-model="schemaDraft.name" maxlength="80"></label><label><span>{{ t('schemaVersion') }}</span><input v-model.number="schemaDraft.schemaVersion" type="number" min="1" max="65535"></label><label><span>{{ t('keyField') }}</span><select v-model="schemaDraft.keyField"><option v-for="field in schemaDraft.fields" :key="field.name">{{ field.name }}</option></select></label></div>
          <div class="field-list"><article v-for="(field, index) in schemaDraft.fields" :key="index"><input v-model="field.name" maxlength="80"><select v-model="field.type"><option>string</option><option>number</option><option>integer</option><option>boolean</option><option>json</option></select><label><input v-model="field.required" type="checkbox">{{ t('required') }}</label><input :value="String(field.default ?? '')" :placeholder="t('defaultValue')" @change="setFieldDefault(field, $event)"><UiButton icon="remove" variant="danger" :label="t('remove')" :disabled="schemaDraft.fields.length <= 1" @click="schemaDraft.fields.splice(index, 1)" /></article></div>
        </template>
      </main>
      <aside class="card import-card">
        <header><strong>{{ t('importData') }}</strong><span>{{ tableDraft?.rows.length ?? 0 }} {{ t('rows') }}</span></header>
        <label><span>{{ t('sourceType') }}</span><select v-model="dataSourceType"><option value="csv">CSV</option><option value="json">JSON</option><option value="database">{{ t('databaseJson') }}</option></select></label>
        <textarea v-model="dataImportSource" :placeholder="t('pasteDataSource')"></textarea>
        <div class="button-row"><button :disabled="!schemaDraft || !tableGuid || !dataImportSource" @click="importData">{{ t('validateImport') }}</button><button class="primary" :disabled="!tableGuid || !tableDraft" @click="saveTableDraft">{{ t('saveAsset') }}</button></div>
        <p :class="{ danger: dataIssues.length }">{{ dataStatus }}</p>
        <div class="issue-list"><article v-for="issue in dataIssues.slice(0, 100)" :key="`${issue.row}:${issue.field}:${issue.message}`"><code>#{{ issue.row }}</code><strong>{{ issue.field }}</strong><span>{{ issue.message }}</span></article></div>
      </aside>
    </div>

    <div v-else-if="activeTab === 'jobs'" class="panel-scroll studio-grid">
      <section class="card">
        <header><strong>{{ t('jobScheduler') }}</strong><span>{{ jobs.workerAvailable ? t('workersAvailable') : t('singleThreadFallback') }}</span></header>
        <label><span>{{ t('maxWorkers') }}</span><input v-model.number="settings.jobs.maxWorkers" type="number" min="1" max="8" @change="commit"></label>
        <label><span>{{ t('maxQueuedJobs') }}</span><input v-model.number="settings.jobs.maxQueued" type="number" min="8" max="2048" @change="commit"></label>
        <label><span>{{ t('jobTimeout') }}</span><input v-model.number="settings.jobs.timeoutMs" type="number" min="100" max="120000" @change="commit"></label>
        <dl><div><dt>{{ t('active') }}</dt><dd>{{ jobs.active }}</dd></div><div><dt>{{ t('queued') }}</dt><dd>{{ jobs.queued }}</dd></div><div><dt>{{ t('completed') }}</dt><dd>{{ jobs.completed }}</dd></div><div><dt>{{ t('failed') }}</dt><dd>{{ jobs.failed }}</dd></div><div><dt>{{ t('cancelled') }}</dt><dd>{{ jobs.cancelled }}</dd></div><div><dt>{{ t('staleResults') }}</dt><dd>{{ jobs.stale }}</dd></div><div><dt>{{ t('queueWaitTime') }}</dt><dd>{{ jobs.queueWaitMs.toFixed(2) }} ms</dd></div><div><dt>{{ t('workerFallbacks') }}</dt><dd>{{ jobs.fallbackCount }}</dd></div><div><dt>{{ t('averageTime') }}</dt><dd>{{ jobs.averageMs.toFixed(2) }} ms</dd></div></dl>
      </section>
      <PerformancePolicyPanel />
      <section class="card">
        <header><strong>{{ t('largeWorldRuntime') }}</strong><span>{{ runtimePerformance.entityCount }} / {{ runtimePerformance.componentCount }}</span></header>
        <dl><div><dt>{{ t('dirtyTransforms') }}</dt><dd>{{ runtimePerformance.dirtyTransforms }}</dd></div><div><dt>{{ t('cacheHitRate') }}</dt><dd>{{ (runtimePerformance.cacheHitRate * 100).toFixed(1) }}%</dd></div><div><dt>{{ t('worstFrame') }}</dt><dd>{{ formatMeasuredValue(runtimePerformance.worstFrameMs, 'ms', measurementCopy.unavailable) }}</dd></div><div><dt>{{ t('onePercentLow') }}</dt><dd>{{ formatMeasuredValue(runtimePerformance.onePercentLowFps, 'FPS', measurementCopy.unavailable, 1) }}</dd></div><div><dt :title="t('inputToCpuSubmitHint')">{{ t('inputToCpuSubmit') }}</dt><dd>{{ formatMeasuredValue(runtimePerformance.inputToSubmitMs, 'ms', measurementCopy.unavailable) }}</dd></div><div><dt>{{ t('streamingDeferred') }}</dt><dd>{{ runtimePerformance.streamingDeferred }}</dd></div><div><dt>{{ t('adaptiveTier') }}</dt><dd>{{ runtimePerformance.adaptiveTier }}</dd></div><div><dt>{{ t('coldStartup') }}</dt><dd data-audit="cold-startup">{{ formatMeasuredValue(runtimePerformance.coldStartupMs, 'ms', measurementCopy.unavailable, 1) }}</dd></div><div><dt>{{ t('warmStartup') }}</dt><dd data-audit="warm-startup">{{ formatMeasuredValue(runtimePerformance.warmStartupMs, 'ms', measurementCopy.unavailable, 1) }}</dd></div><div><dt>{{ startupCopy.moduleWall }}</dt><dd data-audit="module-first-host-wall">{{ formatMeasuredValue(runtimePerformance.moduleToFirstHostFrameWallMs, 'ms', measurementCopy.unavailable, 1) }}</dd></div><div><dt>{{ startupCopy.prefetchWall }}</dt><dd data-audit="workspace-prefetch-wall">{{ formatMeasuredValue(runtimePerformance.workspacePrefetchWallMs, 'ms', measurementCopy.unavailable, 1) }}</dd></div></dl>
        <p data-audit="startup-measurement-scope">{{ startupCopy.scope }}</p>
        <p data-audit="profiler-sampling-window">{{ samplingWindowCopy.profiler }}</p>
        <p data-audit="runtime-sampling-window">{{ samplingWindowCopy.runtime }}</p>
        <div class="button-row"><button @click="runJob('hash')">{{ t('testHashJob') }}</button><button @click="runJob('parseJson')">{{ t('testJsonJob') }}</button><button :disabled="!cancelJob" @click="cancelActiveJob">{{ t('cancelJob') }}</button></div>
        <p>{{ jobResult || jobs.lastError || t('jobSchedulerHint') }}</p>
      </section>
    </div>

    <div v-else-if="activeTab === 'scripts'" class="panel-scroll script-profile-layout">
      <section class="card script-profile-table">
        <header><strong>{{ t('scriptProfiler') }}</strong><span>{{ profilerState.scriptFunctions.length }} {{ t('functions') }}</span></header>
        <div class="button-row"><button @click="takeScriptCapture">{{ t('capturePerformance') }}</button><button :disabled="!profilerState.scriptFunctions.length" @click="exportCurrentScriptProfile">{{ t('exportJson') }}</button><button @click="clearProfiler">{{ t('clearSamples') }}</button></div>
        <p data-audit="script-collection-budget">{{ scriptCollectionCopy }}</p>
        <p data-audit="script-allocation-estimate-scope">{{ scriptAllocationEstimateCopy[preferencesState.locale] }}</p>
        <div class="profile-heading"><span>{{ t('function') }}</span><span>{{ t('calls') }}</span><span>{{ t('totalTime') }}</span><span>{{ t('maximumTime') }}</span><span>{{ t('allocationEstimate') }}</span></div>
        <article v-for="entry in profilerState.scriptFunctions" :key="`${entry.scriptUuid}:${entry.functionName}`" class="profile-row"><span><strong>{{ entry.functionName }}</strong><small>{{ entry.scriptName }}</small></span><output>{{ entry.calls }}</output><output>{{ entry.totalMs.toFixed(3) }} ms</output><output>{{ entry.maximumMs.toFixed(3) }} ms</output><output>{{ entry.allocationEstimateBytes }}</output></article>
        <p v-if="!profilerState.scriptFunctions.length">{{ t('scriptProfilerEmpty') }}</p>
      </section>
      <section class="card script-capture-card">
        <header><strong>{{ t('captureComparison') }}</strong><span>{{ profilerState.scriptCaptures.length }}</span></header>
        <label><span>A</span><select v-model.number="scriptCaptureA"><option :value="-1">{{ t('none') }}</option><option v-for="(capture, index) in profilerState.scriptCaptures" :key="capture.createdAt" :value="index">{{ new Date(capture.createdAt).toLocaleTimeString() }}</option></select></label>
        <label><span>B</span><select v-model.number="scriptCaptureB"><option :value="-1">{{ t('none') }}</option><option v-for="(capture, index) in profilerState.scriptCaptures" :key="capture.createdAt" :value="index">{{ new Date(capture.createdAt).toLocaleTimeString() }}</option></select></label>
        <p v-if="scriptCaptureA >= 0" data-audit="script-capture-collection-a">A: {{ scriptCaptureCollectionCopy(scriptCaptureA) }}</p>
        <p v-if="scriptCaptureB >= 0" data-audit="script-capture-collection-b">B: {{ scriptCaptureCollectionCopy(scriptCaptureB) }}</p>
        <button :disabled="scriptCaptureA < 0 || scriptCaptureB < 0 || scriptCaptureA === scriptCaptureB" @click="compareScriptCaptures">{{ t('compareCaptures') }}</button>
        <div class="profile-comparison"><article v-for="entry in scriptComparison" :key="entry.key"><strong>{{ entry.key }}</strong><span>{{ t('calls') }} {{ signedInteger(entry.callsDelta) }}</span><span>{{ t('totalTime') }} {{ signed(entry.totalMsDelta) }} ms</span><span>{{ t('allocationEstimate') }} {{ signedInteger(entry.allocationDelta) }}</span></article></div>
      </section>
    </div>

    <div v-else-if="activeTab === 'runtime'" class="panel-scroll runtime-layout">
      <section class="card">
        <header><strong>{{ t('engineDiagnostics') }}</strong><span>{{ physicsState.simulationRunning ? t('live') : t('paused') }}</span></header>
        <dl><div><dt>{{ t('runtimeBodies') }}</dt><dd>{{ physicsState.engineDiagnostics.bodyCount }}</dd></div><div><dt>{{ t('runtimeConnections') }}</dt><dd>{{ physicsState.engineDiagnostics.connectionCount }}</dd></div><div><dt>{{ t('stepsLastFrame') }}</dt><dd>{{ physicsState.engineDiagnostics.stepsLastFrame }}</dd></div><div><dt>{{ t('totalPhysicsSteps') }}</dt><dd>{{ physicsState.engineDiagnostics.totalPhysicsSteps }}</dd></div><div><dt>{{ t('interpolationAlpha') }}</dt><dd>{{ physicsState.engineDiagnostics.interpolationAlpha.toFixed(3) }}</dd></div><div><dt>{{ t('droppedTime') }}</dt><dd>{{ physicsState.engineDiagnostics.droppedSeconds.toFixed(4) }} s</dd></div><div><dt>{{ t('pendingEvents') }}</dt><dd>{{ physicsState.engineDiagnostics.eventCount }}</dd></div><div><dt>{{ t('configurationRebuilds') }}</dt><dd>{{ physicsState.engineDiagnostics.configurationRebuilds }}</dd></div></dl>
      </section>
      <section class="card save-data-card"><header><strong>{{ t('saveData') }}</strong><span>{{ t('runtimeScope') }}</span></header><SaveDataSettings /></section>
      <section class="card">
        <header><strong>{{ t('diagnostics') }}</strong><span>{{ faultCenterState.recent.length }} {{ t('errors') }}</span></header>
        <p>{{ t('diagnosticDetailsHint') }}</p>
        <div class="event-list"><article v-for="fault in faultCenterState.recent.slice(-20).reverse()" :key="fault.id"><code>{{ new Date(fault.timestamp).toLocaleTimeString() }}</code><span>{{ fault.severity }}</span><strong>{{ fault.context }}</strong><em>{{ fault.message }}</em></article></div>
        <button @click="copyDiagnostics">{{ diagnosticsCopied ? t('copied') : t('copyDiagnostics') }}</button>
      </section>
    </div>

    <div v-else class="panel-scroll network-layout">
      <section class="card">
        <header><strong>{{ t('optionalNetworking') }}</strong><span>{{ networkPackageEnabled ? t('installed') : t('excludedByDefault') }}</span></header>
        <p>{{ t('networkingOptionalHint') }}</p>
        <button v-if="!networkPackageEnabled" class="primary" @click="installNetworking">{{ t('enableNetworkingPackage') }}</button>
        <template v-else>
          <label><span>{{ t('networkingEnabled') }}</span><input v-model="settings.networking.enabled" type="checkbox" @change="commit"></label>
          <label><span>{{ t('networkPermission') }}</span><output>{{ settings.networking.permissionGranted ? t('granted') : t('notGranted') }}</output></label>
          <button v-if="!settings.networking.permissionGranted" @click="grantLegacyNetworkPermission">{{ t('grantNetworkPermission') }}</button>
          <label><span>{{ t('networkRole') }}</span><select v-model="settings.networking.role" @change="commit"><option value="client">Client</option><option value="server">Server</option><option value="host">Host</option></select></label>
          <label><span>{{ t('transport') }}</span><select v-model="settings.networking.transport" @change="commit"><option value="websocket">WebSocket</option><option value="native-udp">Native UDP</option></select></label>
          <label><span>{{ t('endpoint') }}</span><input v-model="settings.networking.endpoint" maxlength="512" @change="commit"></label>
          <label><span>{{ t('bindAddress') }}</span><input v-model="settings.networking.bindAddress" maxlength="256" @change="commit"></label>
          <label><span>{{ t('snapshotRate') }}</span><input v-model.number="settings.networking.snapshotRate" type="number" min="1" max="120" @change="commit"></label>
          <label><span>{{ t('interpolationMs') }}</span><input v-model.number="settings.networking.interpolationMs" type="number" min="0" max="2000" @change="commit"></label>
          <label><span>{{ t('rollbackFrames') }}</span><input v-model.number="settings.networking.rollbackFrames" type="number" min="0" max="600" @change="commit"></label>
          <label><span>{{ t('bandwidthLimit') }}</span><input v-model.number="settings.networking.bandwidthKbps" type="number" min="8" max="1000000" @change="commit"></label>
          <label><span>{{ t('autoReconnect') }}</span><input v-model="settings.networking.reconnect" type="checkbox" @change="commit"></label>
          <div class="button-row"><button :disabled="!settings.networking.enabled || networkBusy" @click="startNetwork">{{ t('connect') }}</button><button :disabled="networkBusy" @click="stopNetwork">{{ t('disconnect') }}</button><button @click="replicateSelected">{{ t('replicateSelected') }}</button></div>
        </template>
      </section>
      <section class="card">
        <header><strong>{{ t('multiplayerDiagnostics') }}</strong><span>{{ networkState?.status ?? 'disabled' }}</span></header>
        <dl v-if="networkState"><div><dt>{{ t('peers') }}</dt><dd>{{ networkState.peers }}</dd></div><div><dt>{{ t('ping') }}</dt><dd>{{ networkState.pingMs === null ? 'n/a' : `${networkState.pingMs.toFixed(1)} ms` }}</dd></div><div><dt>{{ t('sentReceived') }}</dt><dd>{{ networkState.sentBytes }} / {{ networkState.receivedBytes }} B</dd></div><div><dt>{{ t('packets') }}</dt><dd>{{ networkState.sentPackets }} / {{ networkState.receivedPackets }}</dd></div><div><dt>{{ t('droppedPackets') }}</dt><dd>{{ networkState.droppedPackets }}</dd></div><div><dt>RPC</dt><dd>{{ networkState.rpcCalls }}</dd></div><div><dt>{{ t('snapshots') }}</dt><dd>{{ networkState.snapshots }}</dd></div><div><dt>{{ t('rollbacks') }}</dt><dd>{{ networkState.rollbacks }}</dd></div><div><dt>{{ t('predictionCorrections') }}</dt><dd>{{ networkState.predictionCorrections }}</dd></div></dl>
        <p v-if="networkState?.lastError" class="danger">{{ networkState.lastError }}</p>
        <div class="event-list"><article v-for="event in networkState?.events.slice(-30) ?? []" :key="event.at"><code>{{ new Date(event.at).toLocaleTimeString() }}</code><span>{{ event.message }}</span></article></div>
      </section>
      <section class="card">
        <header><strong>{{ t('replicatedProperties') }}</strong><span>{{ settings.networking.replicatedEntities.length }}</span></header>
        <article v-for="definition in settings.networking.replicatedEntities" :key="definition.entityUuid" class="replication-row"><strong>{{ entityName(definition.entityUuid) }}</strong><select v-model="definition.authority" @change="commit"><option value="server">Server</option><option value="owner">Owner</option></select><div class="property-toggles"><label><input v-model="definition.properties" type="checkbox" value="transform" @change="commit">Transform</label><label><input v-model="definition.properties" type="checkbox" value="rotation" @change="commit">Rotation</label><label><input v-model="definition.properties" type="checkbox" value="velocity" @change="commit">Velocity</label></div><label><input v-model="definition.interpolate" type="checkbox" @change="commit">{{ t('interpolate') }}</label><label><input v-model="definition.predict" type="checkbox" @change="commit">{{ t('predict') }}</label><UiButton icon="remove" variant="danger" label="Remove replication" @click="removeReplication(definition.entityUuid)" /></article>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import UiButton from '../ui/components/UiButton.vue'
import UiTabs from '../ui/components/UiTabs.vue'
import UiPanelHeader from '../ui/components/UiPanelHeader.vue'
import { computed, ref, shallowRef, watch } from 'vue'
import { formatMeasuredValue, profilerMeasurementCopy, profilerSamplingWindowCopy, profilerStartupCopy, scriptAllocationEstimateCopy, scriptProfileCollectionCopy } from '../editor/profilerMeasurementCopy'
import { preferencesState } from '../store/preferences'
import type { RendererStats } from '../renderer/types'
import { renderGraphState } from '../renderer/renderGraph'
import { assetState, createTextAsset, readTextAsset } from '../assets/AssetDatabase'
import type { DataFieldSchema, DataSchemaResource, DataTableResource, DataValidationIssue } from '../runtime/dataResources'
import { createDataSchemaAsset, createDataTableAsset, generateTypedDataAccessors, importDataText, readDataSchema, readDataTable, saveDataSchema, saveDataTable } from '../runtime/dataResources'
import { gameplayRuntime } from '../editor/gameplayRuntime'
import { faultCenterState, faultDiagnostics, reportRecoverableError } from '../runtime/faultCenter'
import { jobSchedulerState as jobs, scheduleJob } from '../editor/jobSchedulerAdapter'
import { comparePerformanceCaptures, capturePerformance, clearPerformanceTools, performanceCaptureCiReport, performanceToolsState as tools, serializePerformanceCapture } from '../runtime/performanceTools'
import { physicsDebugState } from '../runtime/physicsDebug'
import { addProfilerAnnotation, captureScriptProfile, clearProfiler, compareScriptProfiles, currentPerformanceSamplingScope, PROFILER_INTERVAL_SUMMARY_CAPACITY, profilerState, scriptProfileCaptureCollectionEvidence } from '../runtime/profiler'
import { loadProductionSettings, productionSettings as settings, serializeProductionSettings } from '../runtime/production'
import { networkingModule as loadProductionNetworkingModule, startProductionNetworking, stopProductionNetworking } from '../runtime/productionRuntime'
import { enableOfficialPackage, OFFICIAL_NETWORKING_PACKAGE_ID, packageEnabled } from '../runtime/packages'
import { exportReplay, normalizeReplayDocument, replayState, startReplayPlayback, startReplayRecording, stopReplay } from '../runtime/replay'
import { runProjectTests, testReportJUnit, testRunnerState } from '../editor/testRunner'
import { t } from '../i18n'
import { playSimulation } from '../editor/runCommands'
import { audioRuntime } from '../runtime/audio'
import { requestConfirmation } from '../store/dialog'
import { editorState } from '../store/editor'
import { getSceneJSON, loadProject, physicsState, pushHistory, sceneManager, toggleSimulation } from '../store/physics'
import SaveDataSettings from './SaveDataSettings.vue'
import PerformancePolicyPanel from './PerformancePolicyPanel.vue'
import { feedbackDiagnostics } from '../runtime/editorFeedback'
import { recoveryDiagnostics } from '../runtime/recovery'
import { performanceRuntimeSettings, performanceRuntimeState as runtimePerformance } from '../runtime/largeWorldPerformance'

type TabId = 'trace' | 'memory' | 'replay' | 'tests' | 'data' | 'jobs' | 'scripts' | 'runtime' | 'network'
const activeTab = ref<TabId>('trace')
const current = computed(/* 返回 profilerState.current 的当前值。 */ () => profilerState.current)
const measurementCopy=computed(/** 读取当前语言的实测与不可用提示。 */ ()=>profilerMeasurementCopy[preferencesState.locale])
const startupCopy=computed(()=>profilerStartupCopy[preferencesState.locale])
const samplingWindowCopy=computed(()=>profilerSamplingWindowCopy(currentPerformanceSamplingScope(performanceRuntimeSettings.reactivePublishInterval), preferencesState.locale))
const scriptCollectionCopy=computed(()=>scriptProfileCollectionCopy(profilerState.scriptCollection, preferencesState.locale))
const presentationStats=computed(/** 读取实际渲染器最近发布的统计，不用项目请求值冒充实际后端结果。 */ ()=>editorState.rendererStats as RendererStats)
const renderRequestStatusCopy = computed(() => {
  const status = renderGraphState.request.status
  return t(status === 'world-cpu-submitted' ? 'renderWorldCpuSubmitted' : status === 'not-submitted'
    ? renderGraphState.lastWorldSubmission ? 'renderNotSubmittedRetained' : 'renderNotSubmittedNoHistory'
    : status === 'pending' ? 'renderRequestPending' : status === 'unmeasured' ? 'renderSubmissionUnmeasured' : 'renderNoRequest')
})
const intervalSummary=computed(/** 对最多240个真实记录帧做有限排序，空样本明确显示不可用。 */ ()=>{
 const values=profilerState.samples.slice(-PROFILER_INTERVAL_SUMMARY_CAPACITY).map(sample=>sample.rafIntervalMs).filter((value):value is number=>value!==null&&Number.isFinite(value)&&value>0).sort((a,b)=>a-b)
 /** 没有样本时返回短横线，否则给出两位小数分位数。 */ const at=(quantile:number)=>values.length?values[Math.floor((values.length-1)*quantile)].toFixed(2):'—'
 return{count:values.length,median:at(.5),p95:at(.95),p99:at(.99)}
})
const timingMetrics = computed(/** 按固定顺序生成当前帧各子系统耗时指标。 */ () => [{ label: 'frameTime' as const, value: current.value.frameMs }, { label: 'inputTime' as const, value: current.value.inputMs }, { label: 'physicsTime' as const, value: current.value.physicsMs }, { label: 'renderingTime' as const, value: current.value.renderingMs }, { label: 'scriptsTime' as const, value: current.value.scriptsMs }, { label: 'animationTime' as const, value: current.value.animationMs }, { label: 'audioTime' as const, value: current.value.audioMs }, { label: 'assetsTime' as const, value: current.value.assetsMs }, { label: 'otherTime' as const, value: current.value.otherMs }])
const activeContacts = computed(/* 调用 Math.round(physicsState.world.entities.reduce((total, entity) => total + entity.contactCount, 0) / 2) 并返回调用结果。 */ () => Math.round(physicsState.world.entities.reduce(/* 计算表达式 total + entity.contactCount 并返回结果，沿用操作数的原有类型规则。 */ (total, entity) => total + entity.contactCount, 0) / 2))
const sleepingBodies = computed(/* 返回 physicsState.world.entities.filter(entity => entity.rigidBody.sleeping).length 的当前值。 */ () => physicsState.world.entities.filter(/* 返回 entity.rigidBody.sleeping 的当前值。 */ entity => entity.rigidBody.sleeping).length)
const continuousBodies = computed(/* 返回 physicsState.world.entities.filter(entity => entity.rigidBody.continuousCollision === 'Continuous').length 的当前值。 */ () => physicsState.world.entities.filter(/* 比较 entity.rigidBody.continuousCollision 与 'Continuous'，返回严格相等的判断结果。 */ entity => entity.rigidBody.continuousCollision === 'Continuous').length)
const jointConstraints = computed(/** 统计含关节的实体数加世界连接数。 */ () => physicsState.world.entities.filter(/* 调用 entity.components.some(component => component.kind.endsWith('Joint2D')) 并返回调用结果。 */ entity => entity.components.some(/* 调用 component.kind.endsWith('Joint2D') 并返回调用结果。 */ component => component.kind.endsWith('Joint2D'))).length + physicsState.world.connections.length)
const chartPoints = computed(/** 把帧采样映射为固定宽度折线。 */ () => profilerState.samples.map(/** 按采样索引与受限帧耗时计算折线坐标。 */ (sample, index, all) => `${all.length <= 1 ? 0 : index / (all.length - 1) * 600},${110 - Math.min(100, sample.frameMs * 3)}`).join(' '))
const debugOptions = [{ key: 'showColliders', label: 'showColliders' }, { key: 'showContactPoints', label: 'showContactPoints' }, { key: 'showNormals', label: 'showNormals' }, { key: 'showSleepingBodies', label: 'showSleepingBodies' }, { key: 'showAabbs', label: 'showAabbs' }, { key: 'showJointConstraints', label: 'showJointConstraints' }, { key: 'showRopeNodes', label: 'showRopeNodes' }, { key: 'showCharacterContacts', label: 'showCharacterContacts' }, { key: 'showCentersOfMass', label: 'showCentersOfMass' }, { key: 'showVelocities', label: 'showVelocities' }, { key: 'showForces', label: 'showForces' }, { key: 'colorByPhysicsLayer', label: 'colorByPhysicsLayer' }] as const
const recentLifetimeEvents = computed(/* 调用 tools.lifetimeEvents.slice(-200).reverse() 并返回调用结果。 */ () => tools.lifetimeEvents.slice(-200).reverse())
const captureA = ref(''), captureB = ref('')
const annotationDraft = ref('')
const selectedPerformanceCapture = computed(/** 优先取得比较项 B，否则使用 A 对应捕获。 */ () => tools.captures.find(/* 比较 capture.id 与 (captureB.value || captureA.value)，返回严格相等的判断结果。 */ capture => capture.id === (captureB.value || captureA.value)) ?? null)
const performanceCaptureCollectionCopy = computed(() => scriptProfileCollectionCopy(scriptProfileCaptureCollectionEvidence({ collection: selectedPerformanceCapture.value?.scriptCollection }), preferencesState.locale))
const replayAssets = computed(/** 筛选重放资源。 */ () => assetState.records.filter(/* 比较 asset.assetType 与 'replay'，返回严格相等的判断结果。 */ asset => asset.assetType === 'replay'))
const selectedReplay = ref('')
const selectedTestId = ref(settings.testing.tests[0]?.id ?? '')
const selectedTest = computed(/** 查找当前选中项目测试。 */ () => settings.testing.tests.find(/* 比较 test.id 与 selectedTestId.value，返回严格相等的判断结果。 */ test => test.id === selectedTestId.value) ?? null)
const schemaAssets = computed(/** 筛选数据模式资源。 */ () => assetState.records.filter(/* 比较 asset.assetType 与 'dataSchema'，返回严格相等的判断结果。 */ asset => asset.assetType === 'dataSchema'))
const tableAssets = computed(/** 筛选数据表资源。 */ () => assetState.records.filter(/* 比较 asset.assetType 与 'dataTable'，返回严格相等的判断结果。 */ asset => asset.assetType === 'dataTable'))
const schemaGuid = ref(schemaAssets.value[0]?.uuid ?? ''), tableGuid = ref(tableAssets.value[0]?.uuid ?? '')
const schemaDraft = ref<DataSchemaResource | null>(null), tableDraft = ref<DataTableResource | null>(null)
const dataSourceType = ref<'csv' | 'json' | 'database'>('csv'), dataImportSource = ref(''), dataIssues = ref<DataValidationIssue[]>([]), dataStatus = ref('')
const jobResult = ref(''), cancelJob = ref<(() => void) | null>(null)
type NetworkModule = typeof import('../runtime/networking')
const networkModule = shallowRef<NetworkModule | null>(null), networkState = shallowRef<NetworkModule['networkingState'] | null>(null), networkBusy = ref(false)
const networkPackageEnabled = computed(/* 调用 packageEnabled(OFFICIAL_NETWORKING_PACKAGE_ID) 并返回调用结果。 */ () => packageEnabled(OFFICIAL_NETWORKING_PACKAGE_ID))
const tabs = computed<Array<{ id: TabId; label: Parameters<typeof t>[0] }>>(/** 生成性能工具标签，仅在联网包启用时添加网络标签。 */ () => [
  { id: 'trace', label: 'frameTrace' }, { id: 'memory', label: 'memoryAndLifetimes' }, { id: 'replay', label: 'replay' },
  { id: 'tests', label: 'tests' }, { id: 'data', label: 'data' }, { id: 'jobs', label: 'jobs' }, { id: 'scripts', label: 'scriptProfiler' }, { id: 'runtime', label: 'debug' },
  ...(networkPackageEnabled.value ? [{ id: 'network' as const, label: 'networking' as const }] : [])
])
const diagnosticsCopied = ref(false)
const scriptCaptureA = ref(-1), scriptCaptureB = ref(-1)
const scriptComparison = ref<ReturnType<typeof compareScriptProfiles>>([])
function scriptCaptureCollectionCopy(index: number): string {
  const capture = profilerState.scriptCaptures[index]
  return scriptProfileCollectionCopy(capture ? scriptProfileCaptureCollectionEvidence(capture) : null, preferencesState.locale)
}

watch(schemaGuid, /** 模式资源选择变化时加载或清空模式草稿。 */ guid => { schemaDraft.value = guid ? readDataSchema(guid) : null }, { immediate: true })
watch(tableGuid, /** 数据表选择变化时加载或清空表草稿。 */ guid => { tableDraft.value = guid ? readDataTable(guid) : null }, { immediate: true })

/** 切换标签，网络标签按需安全加载联网模块。 */ function selectTab(tab: TabId) { activeTab.value = tab; if (tab === 'network' && networkPackageEnabled.value) void safeLoadNetworkModule() }
/** 复制故障、任务和恢复诊断，短暂显示成功；异常进入可恢复错误中心。 */ async function copyDiagnostics() { try { await navigator.clipboard.writeText(`${faultDiagnostics()}\n\n${feedbackDiagnostics()}\n\n${recoveryDiagnostics()}`); diagnosticsCopied.value = true; setTimeout(/** 复制提示到期后恢复默认状态。 */ () => { diagnosticsCopied.value = false }, 1500) } catch (error) { reportRecoverableError(error, 'Copy Debug diagnostics') } }
/** 序列化再载入以归一化生产设置，并记录项目范围历史。 */ function commit() { loadProductionSettings(serializeProductionSettings()); pushHistory('Edit production settings', 'project:production') }
/** 格式化带正负符号的两位小数。 */ function signed(value: number) { return `${value >= 0 ? '+' : ''}${value.toFixed(2)}` }
/** 格式化带正负符号的整数。 */ function signedInteger(value: number) { return `${value >= 0 ? '+' : ''}${Math.round(value)}` }
function captureStatusKey(status: 'passed' | 'failed' | 'unavailable' | 'estimated'): string { return ({ passed: 'performancePassed', failed: 'performanceFailed', unavailable: 'performanceUnavailable', estimated: 'performanceEstimated' } as const)[status] }
/** 创建性能捕获，依次填入比较选择 A 或 B。 */ function takeCapture() { const capture = capturePerformance(`Capture ${tools.captures.length + 1}`, editorState.rendererStats); if (!captureA.value) captureA.value = capture.id; else captureB.value = capture.id }
/** 比较指定两份性能捕获。 */ function compareCaptures() { comparePerformanceCaptures(captureA.value, captureB.value) }
/** 添加性能注记并清空输入。 */ function annotate() { addProfilerAnnotation(annotationDraft.value); annotationDraft.value = '' }
/** 下载所选性能捕获及对应 CI 报告。 */ function exportPerformanceCapture() { const capture = selectedPerformanceCapture.value; if (!capture) return; download(`${capture.id}.nova-perf.json`, serializePerformanceCapture(capture)); download(`${capture.id}.ci.json`, JSON.stringify(performanceCaptureCiReport(capture), null, 2)) }
/** 捕获脚本性能，并依次设置比较索引 A 或 B。 */ function takeScriptCapture() { const capture = captureScriptProfile(); const index = profilerState.scriptCaptures.indexOf(capture); if (scriptCaptureA.value < 0) scriptCaptureA.value = index; else scriptCaptureB.value = index }
/** 两份脚本捕获都存在时计算差异，否则清空比较结果。 */ function compareScriptCaptures() { const first = profilerState.scriptCaptures[scriptCaptureA.value], second = profilerState.scriptCaptures[scriptCaptureB.value]; scriptComparison.value = first && second ? compareScriptProfiles(first, second) : [] }
/** 捕获当前脚本性能并下载 JSON。 */ function exportCurrentScriptProfile() { const capture = captureScriptProfile(); download(`nova-script-profile-${Date.now()}.json`, JSON.stringify(capture, null, 2)) }

/** 成功进入仿真后，以项目初始源和 tick 频率启动录制；会话启动由共享命令负责。 */ async function recordReplay() { if (!await playSimulation()) return; startReplayRecording(getSceneJSON(), physicsState.globalSettings.tickRate) }
/** 停止重放，若此前录制则导出文档为资源、选中新资源并记录历史。 */ function finishReplay() { const wasRecording = replayState.mode === 'recording'; const document = wasRecording ? exportReplay(physicsState.globalSettings.tickRate) : null; stopReplay(); if (document) { const asset = createTextAsset(`Replay ${new Date().toISOString().replace(/[:.]/g, '-')}`, 'replay', JSON.stringify(document, null, 2), 'Assets/Replays'); selectedReplay.value = asset.uuid; pushHistory('Record deterministic replay') } }
/** 读取规范化重放，加载初始项目并启动会话，再开始重放。 */ function playReplay() { const source = readTextAsset(selectedReplay.value); if (!source) return; const document = normalizeReplayDocument(JSON.parse(source)); if (!loadProject(document.initialProject)) return; if (!toggleSimulation(true)) return; gameplayRuntime.beginSession(); startReplayPlayback(document) }
/** 下载指定内容和媒体类型，下一轮释放临时对象地址。 */ function download(name: string, source: string, type = 'application/json') { const url = URL.createObjectURL(new Blob([source], { type })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); window.setTimeout(/* 调用 URL.revokeObjectURL(url) 并返回调用结果。 */ () => URL.revokeObjectURL(url), 0) }
/** 存在所选重放源时下载为重放文件。 */ function downloadReplay() { const source = readTextAsset(selectedReplay.value); if (source) download('recording.nova-replay', source) }

/** 创建带有限物理断言的默认场景测试，选中并提交设置。 */ function addTest() { const id = `test-${Date.now().toString(36)}`; settings.testing.tests.push({ id, name: t('newTest'), kind: 'scene', sceneUuid: sceneManager.activeSceneUuid, steps: 60, timeoutMs: settings.testing.defaultTimeoutMs, captureScreenshot: false, tags: [], fixture: '', setup: '', teardown: '', seed: 1, retries: 0, flakyInfrastructure: false, assertions: [{ kind: 'finitePhysics', target: '', expected: '' }] }); selectedTestId.value = id; commit() }
/** 确认后删除选中测试，选择下一项并提交设置。 */ async function removeTest() { const test = selectedTest.value; if (!test || !await requestConfirmation({ title: t('delete'), message: test.name, confirmLabel: t('delete'), cancelLabel: t('cancel'), destructive: true })) return; settings.testing.tests.splice(settings.testing.tests.indexOf(test), 1); selectedTestId.value = settings.testing.tests[0]?.id ?? ''; commit() }
/** 给选中测试增加默认断言并提交设置。 */ function addAssertion() { selectedTest.value?.assertions.push({ kind: 'finitePhysics', target: '', expected: '' }); commit() }
/** 运行全部或指定测试，失败显示运行器错误。 */ async function runTests(id?: string) { try { await runProjectTests(id) } catch (error) { testRunnerState.error = error instanceof Error ? error.message : String(error) } }
/** 存在报告时按 JSON 或 JUnit XML 格式下载。 */ function downloadTestReport(format: 'json' | 'junit') { const report = testRunnerState.lastReport; if (!report) return; download(format === 'json' ? 'nova-test-report.json' : 'nova-test-report.xml', format === 'json' ? JSON.stringify(report, null, 2) : testReportJUnit(report), format === 'json' ? 'application/json' : 'application/xml') }

/** 创建数据模式资源、选中并记录历史。 */ function newSchema() { const asset = createDataSchemaAsset(); schemaGuid.value = asset.uuid; pushHistory('Create data schema') }
/** 按当前模式引用创建数据表资源并记录历史。 */ function newTable() { const asset = createDataTableAsset('Data Table', schemaGuid.value || null); tableGuid.value = asset.uuid; pushHistory('Create data table') }
/** 为模式草稿添加默认字符串字段。 */ function addField() { schemaDraft.value?.fields.push({ name: `field_${(schemaDraft.value?.fields.length ?? 0) + 1}`, type: 'string', required: false, default: '' }) }
/** 按字段类型将输入转换为布尔、数值或字符串默认值。 */ function setFieldDefault(field: DataFieldSchema, event: Event) { const value = (event.target as HTMLInputElement).value; field.default = field.type === 'boolean' ? value === 'true' : field.type === 'number' || field.type === 'integer' ? Number(value) || 0 : value }
/** 保存有效模式草稿成功后重读并记录历史。 */ function saveSchemaDraft() { if (schemaDraft.value && schemaGuid.value && saveDataSchema(schemaGuid.value, schemaDraft.value)) { schemaDraft.value = readDataSchema(schemaGuid.value); pushHistory('Save data schema') } }
/** 保存有效数据表草稿成功后记录历史。 */ function saveTableDraft() { if (tableDraft.value && tableGuid.value && saveDataTable(tableGuid.value, tableDraft.value)) pushHistory('Save data table') }
/** 存在模式草稿时生成并下载 TypeScript 类型化访问器。 */ function downloadAccessors() { if (!schemaDraft.value) return; download(`${schemaDraft.value.name}.generated.ts`, generateTypedDataAccessors(schemaDraft.value), 'text/typescript') }
/** 按数据源类型导入文本到表草稿，更新模式引用、诊断和状态，异常显示错误。 */ async function importData() { if (!schemaDraft.value || !tableDraft.value) return; try { const result = await importDataText(dataImportSource.value, dataSourceType.value, schemaDraft.value); tableDraft.value.rows = result.rows; tableDraft.value.source = dataSourceType.value; tableDraft.value.schemaAsset = schemaGuid.value || null; dataIssues.value = result.issues; dataStatus.value = result.issues.length ? t('dataValidationIssues', { count: result.issues.length }) : t('dataValidationPassed', { count: result.rows.length }) } catch (error) { dataIssues.value = []; dataStatus.value = error instanceof Error ? error.message : String(error) } }

/** 调度哈希或 JSON 任务，登记取消入口并处理成功与失败结果。 */ function runJob(kind: 'hash' | 'parseJson') { jobResult.value = ''; const job = scheduleJob(kind, kind === 'hash' ? getSceneJSON() : '{"nova":2.8}'); cancelJob.value = job.cancel; void job.promise.then(/** 显示作业字符串或 JSON 结果并清除取消入口。 */ value => { jobResult.value = typeof value === 'string' ? value : JSON.stringify(value); cancelJob.value = null }).catch(/** 显示作业异常并清除取消入口。 */ error => { jobResult.value = error instanceof Error ? error.message : String(error); cancelJob.value = null }) }
/** 调用活动作业取消函数并清除引用。 */ function cancelActiveJob() { cancelJob.value?.(); cancelJob.value = null }

/** 按需加载联网模块并绑定其状态。 */ async function loadNetworkModule() { if (!networkModule.value) networkModule.value = await loadProductionNetworkingModule(); networkState.value = networkModule.value.networkingState }
/** 加载联网模块失败时报告可恢复运行错误。 */ async function safeLoadNetworkModule() { try { await loadNetworkModule() } catch (error) { reportRecoverableError(error, 'Load optional networking', 'Runtime') } }
/** 启用官方联网包成功后保存配置并安全加载模块。 */ function installNetworking() { if (enableOfficialPackage(OFFICIAL_NETWORKING_PACKAGE_ID)) { commit(); void safeLoadNetworkModule() } }
/** 经权限确认后启用并授权联网，再保存配置。 */ async function grantLegacyNetworkPermission() { if (!await requestConfirmation({ title: t('grantNetworkPermission'), message: t('networkPermissionPrompt'), confirmLabel: t('grant'), cancelLabel: t('cancel'), destructive: false })) return; settings.networking.permissionGranted = true; settings.networking.enabled = true; commit() }
/** 标记忙碌并启动联网模块，失败报告可恢复错误，结束清除忙碌状态。 */ async function startNetwork() { networkBusy.value = true; try { networkModule.value = await startProductionNetworking(); networkState.value = networkModule.value.networkingState } catch (error) { reportRecoverableError(error, 'Start optional networking', 'Runtime') } finally { networkBusy.value = false } }
/** 标记忙碌并停止联网，失败报告可恢复错误，结束清除忙碌状态。 */ async function stopNetwork() { networkBusy.value = true; try { await stopProductionNetworking() } catch (error) { reportRecoverableError(error, 'Stop optional networking', 'Runtime') } finally { networkBusy.value = false } }
/** 选中实体尚未复制时添加服务端权威的默认位置速度复制配置并保存。 */ function replicateSelected() { const entity = physicsState.world.entities.find(/* 比较 item.id 与 physicsState.selectedEntityId，返回严格相等的判断结果。 */ item => item.id === physicsState.selectedEntityId); if (!entity || settings.networking.replicatedEntities.some(/* 比较 item.entityUuid 与 entity.uuid，返回严格相等的判断结果。 */ item => item.entityUuid === entity.uuid)) return; settings.networking.replicatedEntities.push({ entityUuid: entity.uuid, authority: 'server', properties: ['transform', 'velocity'], interpolate: true, predict: false, ownerPeerId: '', alwaysRelevant: true, interestRadius: 0, sceneUuid: sceneManager.activeSceneUuid ?? '' }); commit() }
/** 按实体标识删除复制配置并保存。 */ function removeReplication(uuid: string) {
  const index = settings.networking.replicatedEntities.findIndex(/* 比较 item.entityUuid 与 uuid，返回严格相等的判断结果。 */ item => item.entityUuid === uuid)
  if (index < 0) return
  settings.networking.replicatedEntities.splice(index, 1)
  commit()
}
/** 查找实体名称，缺失时显示标识。 */ function entityName(uuid: string) { return physicsState.world.entities.find(/* 比较 entity.uuid 与 uuid，返回严格相等的判断结果。 */ entity => entity.uuid === uuid)?.name ?? uuid }
</script>

<style scoped>
.production-panel { height: 100%; min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--surface-1); container: profiler / inline-size; }
.production-panel > .ui-tabs { border-bottom: var(--ui-border-width) solid var(--border-subtle); }
.panel-scroll, .tests-layout, .data-layout { min-height: 0; flex: 1; overflow: auto; }
.trace-layout, .studio-grid, .network-layout, .runtime-layout { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr); align-content: start; }
.tests-layout, .data-layout { display: grid; grid-template-columns: minmax(16ch, .6fr) minmax(0, 1.5fr) minmax(0, 1fr); align-content: start; }
.script-profile-layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); align-content: start; }
.card { min-width: 0; padding: var(--space-2) var(--space-3); border-right: var(--ui-border-width) solid var(--border-subtle); border-bottom: var(--ui-border-width) solid var(--border-subtle); }
.card > header { min-height: var(--ui-standard-height); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--space-1); }
.card > header span, .card p, .card dt, .card small { color: var(--text-muted); font-size: var(--type-caption); overflow-wrap: anywhere; }
.card p { margin-block: var(--space-2); line-height: var(--line-body); }
.card label { min-height: var(--ui-standard-height); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-1) var(--space-2); padding-block: var(--space-1); color: var(--text-secondary); font-size: var(--type-dense); }
.card label > span { flex: 1 1 var(--ui-label-width); }
.card label > div { display: flex; flex-wrap: wrap; gap: var(--ui-control-gap); min-width: 0; }
.annotation-control { flex: 1 1 var(--ui-field-width); }
.annotation-control input { flex: 1 1 12ch; width: 0; }
.button-row, .data-editor > header > div, .property-toggles { display: flex; flex-wrap: wrap; gap: var(--ui-control-gap); }
.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 19ch), 1fr)); gap: 0 var(--space-3); }
.metrics article, .card dl div { min-width: 0; min-height: var(--ui-tree-row-height); display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-2); border-bottom: var(--ui-border-width) solid var(--border-subtle); font-size: var(--type-caption); }
.metrics span { color: var(--text-muted); }.metrics strong, .card dd { margin: 0; font-variant-numeric: tabular-nums; }
.card dl { display: grid; gap: var(--space-1); }
.trace-chart { display: block; width: 100%; height: calc(4 * var(--ui-control-height)); margin-block: var(--space-2); background: var(--bg-canvas); }
.trace-chart line { stroke: var(--border-subtle); stroke-width: 1; }.trace-chart polyline { fill: none; stroke: var(--accent); stroke-width: 2; vector-effect: non-scaling-stroke; }
.flame-view { display: flex; flex-direction: column; align-items: start; gap: var(--space-0); margin-block: var(--space-2); }
.flame-view article { min-width: min(100%, 16ch); max-width: 100%; display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-1); padding: var(--space-1); border-left: var(--space-0) solid var(--accent); background: var(--accent-soft); font-size: var(--type-caption); }
.event-list, .field-list, .assertion-list, .issue-list { margin-block: var(--space-2); overflow: auto; max-height: calc(10 * var(--ui-tree-row-height)); }
.event-list article { display: grid; grid-template-columns: 7ch 9ch 9ch minmax(10ch, 1fr); min-height: var(--ui-tree-row-height); gap: var(--space-1); border-bottom: var(--ui-border-width) solid var(--border-subtle); align-items: center; font-size: var(--type-caption); }
.event-list em { font-style: normal; color: var(--text-muted); overflow-wrap: anywhere; }
.test-list, .data-assets { display: flex; flex-direction: column; gap: var(--space-1); }.test-list > button { display: flex; flex-direction: column; align-items: start; text-align: start; }.test-list > button span { font-size: var(--type-caption); }
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18ch), 1fr)); gap: var(--space-2); }.form-grid label { display: grid; align-content: start; justify-content: stretch; }.form-grid .check { display: flex; }
.assertion-list article, .field-list article { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-control-gap); margin-block: var(--space-1); }.assertion-list article > :not(button), .field-list article > :not(button) { flex: 1 1 12ch; min-width: 0; }
.results-card > article { padding-block: var(--space-2); display: grid; gap: var(--space-1); border-bottom: var(--ui-border-width) solid var(--border-subtle); font-size: var(--type-caption); }.results-card img { max-width: 100%; }.results-card .passed { color: var(--success); }.results-card :is(.failed,.error,.timeout), .danger, .danger-button { color: var(--danger); }
.issue-list article { display: grid; grid-template-columns: 5ch 9ch minmax(0, 1fr); gap: var(--space-1); font-size: var(--type-caption); }
.replication-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); padding-block: var(--space-2); border-bottom: var(--ui-border-width) solid var(--border-subtle); }.replication-row > strong { flex: 1 1 16ch; }.replication-row select { width: auto; }.replication-row label { justify-content: start; }
.profile-heading, .profile-row { display: grid; grid-template-columns: minmax(16ch, 1fr) 7ch 11ch 11ch 13ch; gap: var(--space-2); align-items: center; font-size: var(--type-caption); }.profile-heading { color: var(--text-muted); }.profile-row { min-height: var(--ui-standard-height); border-bottom: var(--ui-border-width) solid var(--border-subtle); }.profile-row > span { min-width: 0; display: grid; }.profile-row strong, .profile-row small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.script-profile-table { overflow-x: auto; }
.profile-comparison, .budget-checks { display: grid; gap: var(--space-1); margin-block: var(--space-2); }.profile-comparison article, .budget-checks article { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-2); border-bottom: var(--ui-border-width) solid var(--border-subtle); font-size: var(--type-caption); }
.presentation-diagnostics { margin-block: var(--space-2); min-width: 0; }.presentation-diagnostics h3 { font-size: var(--type-section); }.presentation-diagnostics dl { grid-template-columns: repeat(auto-fit, minmax(min(100%, 24ch), 1fr)); }.presentation-diagnostics p, .presentation-diagnostics dd { overflow-wrap: anywhere; }.presentation-diagnostics table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: var(--type-caption); }.presentation-diagnostics th, .presentation-diagnostics td { padding: var(--space-1); text-align: start; overflow-wrap: anywhere; border-bottom: var(--ui-border-width) solid var(--border-subtle); }
.save-data-card :deep(.save-data-settings) { padding: 0; }
@container profiler (max-width: 940px) { .trace-layout,.studio-grid,.network-layout,.runtime-layout { grid-template-columns: repeat(2,minmax(0,1fr)); }.tests-layout,.data-layout { grid-template-columns: minmax(16ch,.6fr) minmax(0,1.5fr); }.results-card,.import-card { grid-column: 1 / -1; }.script-profile-layout { grid-template-columns: minmax(0,1fr); } }
@container profiler (max-width: 560px) { .trace-layout,.studio-grid,.network-layout,.runtime-layout,.tests-layout,.data-layout { display: block; }.card { width: 100%; border-right: 0; }.test-list { max-height: calc(6 * var(--ui-tree-row-height)); overflow: auto; }.profile-heading,.profile-row { min-width: 64ch; } }
</style>
