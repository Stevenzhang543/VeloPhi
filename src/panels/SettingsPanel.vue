<!-- 设置工作室：管理编辑器体验、项目和运行配置，编辑音频、输入映射及恢复选项。 -->
<template>
  <div class="settings-page">
    <header class="page-header">
      <div>
      <span class="eyebrow">Nova_A {{ NOVA_RELEASE_NAME }}</span>
        <h1>{{ t('settings') }}</h1>
      </div>
      <div class="theme-switch" :aria-label="t('theme')">
        <button :class="{ active: prefs.theme === 'dark' }" @click="setTheme('dark')">{{ t('dark') }}</button>
        <button :class="{ active: prefs.theme === 'light' }" @click="setTheme('light')">{{ t('light') }}</button>
      </div>
    </header>

    <section class="settings-search" aria-label="Settings search">
      <label class="settings-search-field"><EditorIcon name="search" /><input v-model="editorState.settingsSearch" type="search" :aria-label="t('searchSettings')" :placeholder="t('searchSettings')"></label>
      <nav :aria-label="t('settingScope')"><button v-for="scope in settingScopes" :key="scope.id" :class="{ active: editorState.settingsScope === scope.id }" @click="editorState.settingsScope = scope.id">{{ t(scope.label) }}</button></nav>
    </section>

    <div class="ui-section-list settings-sections">
      <UiPropertySection :title="t('appearanceSettings')" v-show="showCard('appearanceSettings formLabelLayout theme color palette language interfaceScale compactMode reduceMotion reduceTransparency transparency glass highContrast launchMaximized workspaceLayoutScope shortcutEditor', 'editor')" >

        <UiPropertyRow :label="t('language')">
          <select v-model="prefs.locale">
            <option value="en">{{ t('english') }}</option>
            <option value="de">{{ t('german') }}</option>
            <option value="zh">{{ t('chinese') }}</option>
          </select>
        </UiPropertyRow>
        <UiPropertyRow :label="PALETTE_COPY[prefs.locale].label">
          <select data-audit="color-palette" :aria-label="PALETTE_COPY[prefs.locale].label" :value="prefs.theme === 'light' ? prefs.lightPalette : prefs.darkPalette" @change="selectColorPalette(($event.target as HTMLSelectElement).value)">
            <option v-for="(palette, index) in COLOR_PALETTES" :key="palette.id" :value="palette.id">{{ PALETTE_COPY[prefs.locale].names[index] }} · {{ t(palette.mode) }}</option>
          </select>
        </UiPropertyRow>
        <p class="setting-hint">{{ PALETTE_COPY[prefs.locale].hint }} <button class="link-action" data-audit="qualification-help" @click="openProductionManual(prefs.locale)">{{ t('documentation') }}</button></p>
        <UiPropertyRow :label="FORM_LAYOUT_COPY[prefs.locale].label" data-non-project-control>
          <select v-model="prefs.formLabelLayout" data-audit="form-label-layout" :aria-label="FORM_LAYOUT_COPY[prefs.locale].label">
            <option value="auto">{{ FORM_LAYOUT_COPY[prefs.locale].auto }}</option>
            <option value="stacked">{{ FORM_LAYOUT_COPY[prefs.locale].stacked }}</option>
          </select>
        </UiPropertyRow>
        <p>{{ FORM_LAYOUT_COPY[prefs.locale].hint }}</p>
        <UiPropertyRow :label="t('interfaceScale')">
          <div class="value-control"><UiSlider :precise="false" v-model.number="prefs.uiScale" min="1" max="2" step="0.05" /><output>{{ Math.round(prefs.uiScale * 100) }}%</output></div>
        </UiPropertyRow>
        <UiPropertyRow :label="t('compactMode')"><UiToggle v-model="prefs.compactMode" /></UiPropertyRow>
        <UiPropertyRow :label="t('reduceMotion')"><UiToggle v-model="prefs.reduceMotion" /></UiPropertyRow>
        <UiPropertyRow :label="t('reduceTransparency')"><UiToggle v-model="prefs.reduceTransparency" data-audit="reduce-transparency" /></UiPropertyRow>
        <UiPropertyRow :label="t('highContrast')"><UiToggle v-model="prefs.highContrast" /></UiPropertyRow>
        <UiPropertyRow :label="t('launchMaximized')"><UiToggle v-model="prefs.launchMaximized" /></UiPropertyRow>
        <UiPropertyRow :label="t('workspaceLayoutScope')"><select v-model="prefs.workspaceLayoutScope"><option value="user">{{ t('editorScope') }}</option><option value="project">{{ t('projectScope') }}</option></select></UiPropertyRow>
        <button class="secondary-action" @click="editorState.shortcutEditorOpen = true">{{ t('shortcutEditor') }}</button>
      </UiPropertySection>

      <UiPropertySection :title="performanceCopy.title" v-show="showCard('performanceProfiles reduceMotion idle preview budget editor performance', 'editor')" class="editor-performance-card" data-non-project-control>

        <p>{{ performanceCopy.scope }}</p>
        <UiPropertyRow :label="t('performanceProfiles')"><select data-audit="editor-performance-profile" :value="prefs.performanceProfile" @change="applyCreatorPerformanceProfile(($event.target as HTMLSelectElement).value as PerformanceProfile)"><option value="balanced">{{ performanceCopy.balanced }}</option><option value="low-end">{{ performanceCopy.low }}</option><option value="quality">{{ performanceCopy.quality }}</option></select></UiPropertyRow>
        <UiPropertyRow :label="performanceCopy.motion"><select v-model="prefs.editorDecorativeMotion" data-audit="editor-motion-override"><option value="auto">{{ performanceCopy.preset }}</option><option value="on">{{ performanceCopy.on }}</option><option value="off">{{ performanceCopy.off }}</option></select></UiPropertyRow>
        <p>{{ performanceCopy.priority }}</p>
        <UiPropertyRow :label="performanceCopy.idle"><select v-model.number="prefs.editorIdleFps" data-audit="editor-idle-fps"><option :value="0">{{ performanceCopy.preset }}</option><option :value="15">15 FPS</option><option :value="30">30 FPS</option><option :value="60">60 FPS</option></select></UiPropertyRow>
        <p>{{ performanceCopy.idleHint }}</p>
        <UiPropertyRow :label="performanceCopy.preview"><select v-model="prefs.editorPreviewPolicy" data-audit="editor-preview-policy"><option value="auto">{{ performanceCopy.preset }}</option><option value="bounded">{{ performanceCopy.bounded }}</option><option value="full">{{ performanceCopy.full }}</option></select></UiPropertyRow>
        <p>{{ performanceCopy.previewHint }}</p>
        <p role="status" data-audit="editor-performance-effective">{{ performanceCopy.effective }}: {{ performanceCopy.motion }} {{ editorPerformancePreferences.decorativeMotion ? performanceCopy.on : performanceCopy.off }} · {{ editorPerformancePreferences.idleFps }} FPS · {{ editorPerformancePreferences.previewMaxDimension }} × {{ editorPerformancePreferences.previewMaxHeight }}</p>
        <p>{{ performanceCopy.system }}: {{ systemReducedMotion ? t('yes') : t('no') }} · {{ performanceCopy.manual }}: {{ prefs.reduceMotion ? t('yes') : t('no') }}</p>
        <button class="secondary-action" data-audit="reset-editor-performance" @click="applyCreatorPerformanceProfile('balanced')">{{ performanceCopy.reset }}</button><p>{{ performanceCopy.resetHint }}</p>
      </UiPropertySection>

      <PhysicsSettingsPanel v-show="showCard('physicsSettings globalGravity collisionLayers physicsMaterials conformance', 'project')" />

      <UiPropertySection :title="t('scriptingSettings')" v-show="showCard('scriptingSettings globalScripts scriptApiVersion debugger hotReload formatting lint indexing testing remoteDebugging', 'project')" >

        <UiPropertyRow :label="t('scriptApiVersion')"><select v-model.number="scriptSettings.apiVersion"><option :value="2">API v2</option><option :value="1">API v1 · {{ t('compatibilityMode') }}</option></select></UiPropertyRow>
        <div class="global-scripts" data-audit="global-scripts">
          <div class="global-scripts-head"><strong>{{ t('globalScripts') }}</strong><button type="button" class="secondary-action" data-audit="add-global-script" @click="addGlobalScript"><EditorIcon name="add" /> {{ t('addGlobalScript') }}</button></div>
          <p>{{ t('globalScriptsHint') }}</p>
          <p v-if="!scriptSettings.globalScripts.length" class="global-scripts-empty">{{ t('noGlobalScripts') }}</p>
          <div v-for="(entry, index) in scriptSettings.globalScripts" :key="index" class="global-script-row">
            <label><span>{{ t('globalScriptName') }}</span><input :value="entry.name" maxlength="64" spellcheck="false" autocomplete="off" pattern="[A-Za-z_][A-Za-z0-9_]*" @change="renameGlobalScript(index, ($event.target as HTMLInputElement).value)"></label>
            <label><span>{{ t('globalScriptAsset') }}</span><select :value="entry.scriptAsset ?? ''" @change="entry.scriptAsset = ($event.target as HTMLSelectElement).value || null; commitGlobalScripts()"><option value="">{{ scriptAssets.length ? '—' : t('noScriptAssets') }}</option><option v-for="asset in scriptAssets" :key="asset.uuid" :value="asset.uuid">{{ asset.path }}</option></select></label>
            <label class="global-script-toggle"><span>{{ t('globalScriptEnabled') }}</span><UiToggle :model-value="entry.enabled" @update:model-value="entry.enabled = $event; commitGlobalScripts()" /></label>
            <button type="button" class="icon-action" :aria-label="t('removeGlobalScript')" :title="t('removeGlobalScript')" @click="removeGlobalScript(index)"><EditorIcon name="close" /></button>
          </div>
        </div>
        <UiPropertyRow :label="t('scriptDebugger')"><UiToggle v-model="scriptSettings.debuggerEnabled" /></UiPropertyRow>
        <UiPropertyRow :label="t('exceptionPolicy')"><select v-model="scriptSettings.exceptionPolicy"><option value="never">{{ t('never') }}</option><option value="uncaught">{{ t('uncaught') }}</option><option value="all">{{ t('allExceptions') }}</option></select></UiPropertyRow>
        <UiPropertyRow :label="t('hotReloadPolicy')"><UiToggle v-model="scriptSettings.hotReloadEnabled" /></UiPropertyRow>
        <UiPropertyRow :label="t('formatIndent')"><select v-model.number="scriptSettings.formatting.indentSize"><option :value="2">2</option><option :value="4">4</option></select></UiPropertyRow>
        <UiPropertyRow :label="t('formatLineWidth')"><NumericExpressionInput v-model="scriptSettings.formatting.lineWidth" :minimum="60" :maximum="240" :resource-key="'project:scriptSettings.formatting.lineWidth'" /></UiPropertyRow>
        <UiPropertyRow :label="t('deprecatedLint')"><select v-model="scriptSettings.lint.deprecatedApi"><option value="off">{{ t('disabled') }}</option><option value="warning">{{ t('warning') }}</option><option value="error">{{ t('error') }}</option></select></UiPropertyRow>
        <UiPropertyRow :label="t('persistLanguageIndex')"><UiToggle v-model="scriptSettings.indexing.persist" /></UiPropertyRow>
        <UiPropertyRow :label="t('languageBudget')"><NumericExpressionInput v-model="scriptSettings.indexing.interactiveBudgetMs" :minimum="10" :maximum="500" :resource-key="'project:scriptSettings.indexing.interactiveBudgetMs'" /></UiPropertyRow>
        <UiPropertyRow :label="t('testParallelism')"><NumericExpressionInput v-model="scriptSettings.testing.parallelism" :minimum="1" :maximum="16" :resource-key="'project:scriptSettings.testing.parallelism'" /></UiPropertyRow>
        <UiPropertyRow :label="t('coverage')"><UiToggle v-model="scriptSettings.testing.coverageEnabled" /></UiPropertyRow>
        <UiPropertyRow :label="t('remoteDebugging')"><UiToggle v-model="scriptSettings.remoteDebug.enabled" /></UiPropertyRow>
        <UiPropertyRow :label="t('remoteDebugPort')"><NumericExpressionInput v-model="scriptSettings.remoteDebug.port" :minimum="1024" :maximum="65535" :resource-key="'project:scriptSettings.remoteDebug.port'" /></UiPropertyRow>
        <UiPropertyRow :label="t('allowExportedPlayers')"><UiToggle v-model="scriptSettings.remoteDebug.allowExportedPlayers" /></UiPropertyRow>
        <UiPropertyRow :label="t('authenticationTokenHash')"><input v-model="scriptSettings.remoteDebug.tokenHash" maxlength="128" autocomplete="off" spellcheck="false" placeholder="SHA-256"></UiPropertyRow>
        <p>{{ t('remoteDebugSecurityHint') }}</p>
      </UiPropertySection>

      <UiPropertySection :title="t('audioSettings')" v-show="showCard('audioSettings masterVolume musicVolume sfxVolume uiVolume sampleRate', 'project')"  @change="commitAudioSettings">

        <UiPropertyRow :label="t('masterVolume')"><div class="value-control"><UiSlider :precise="false" v-model.number="physics.audioSettings.masterVolume" min="0" max="1" step="0.01" /><output>{{ Math.round(physics.audioSettings.masterVolume * 100) }}%</output></div></UiPropertyRow>
        <UiPropertyRow :label="t('musicVolume')"><div class="value-control"><UiSlider :precise="false" v-model.number="physics.audioSettings.buses.Music" min="0" max="1" step="0.01" /><output>{{ Math.round(physics.audioSettings.buses.Music * 100) }}%</output></div></UiPropertyRow>
        <UiPropertyRow :label="t('sfxVolume')"><div class="value-control"><UiSlider :precise="false" v-model.number="physics.audioSettings.buses.SFX" min="0" max="1" step="0.01" /><output>{{ Math.round(physics.audioSettings.buses.SFX * 100) }}%</output></div></UiPropertyRow>
        <UiPropertyRow :label="t('uiVolume')"><div class="value-control"><UiSlider :precise="false" v-model.number="physics.audioSettings.buses.UI" min="0" max="1" step="0.01" /><output>{{ Math.round(physics.audioSettings.buses.UI * 100) }}%</output></div></UiPropertyRow>
        <UiPropertyRow :label="t('sampleRate')"><select v-model.number="physics.audioSettings.sampleRate"><option :value="44100">44.1 kHz</option><option :value="48000">48 kHz</option><option :value="96000">96 kHz</option></select></UiPropertyRow>
      </UiPropertySection>

      <DeviceInputPanel v-show="showCard('deviceInput virtualControls touch gesture gamepad calibration safeArea orientation sensors haptics mobile', 'project')" />
      <UiPropertySection :title="t('inputMap')" v-show="showCard('inputMap inputDevice bindingCode gamepad keyboard', 'project')" class="input-map-card">

        <p>{{ t('inputMapDescription') }}</p>
        <div class="input-map-toolbar"><input v-model="inputSearch" type="search" :placeholder="t('searchActions')"><select v-model="inputDeviceFilter" :aria-label="t('inputDevice')"><option value="all">{{ t('allDevices') }}</option><option v-for="device in inputDevices" :key="device">{{ device }}</option></select><label><input v-model="compactInputMap" type="checkbox"> {{ t('compactMode') }}</label><button :class="{ active: inputRecording }" @click="toggleInputRecording">{{ inputRecording ? t('stop') : t('record') }}</button><UiButton icon="play" :disabled="!lastInputRecording" @click="replayInputRecording">{{ t('replay') }}</UiButton></div>
        <div class="connected-devices"><span v-for="device in connectedInputDevices" :key="`${device.kind}:${device.index}`">{{ device.kind }} {{ device.index }} · {{ device.mapping }}</span></div>
        <div v-if="inputConflicts.length" class="input-conflicts" role="alert"><strong>{{ t('bindingConflicts') }} · {{ inputConflicts.length }}</strong><span v-for="conflict in inputConflicts" :key="`${conflict.signature}:${conflict.action}`">{{ conflict.conflictsWithAction }} ↔ {{ conflict.action }} · {{ conflict.signature }}</span></div>
        <div class="input-actions">
          <article v-for="({ action, actionIndex }) in visibleInputActions" :key="`${action.name}-${actionIndex}`" class="input-action" :class="{ compact: compactInputMap }">
            <div class="input-action-heading">
              <input v-model.trim="action.name" :aria-label="t('actionName')" maxlength="80" @change="commitInputMap">
              <select v-model="action.kind" :aria-label="t('actionType')" @change="commitInputMap">
                <option value="button">{{ t('inputButton') }}</option>
                <option value="axis">{{ t('inputAxis') }}</option>
                <option value="vector2">{{ t('inputVector') }}</option>
              </select>
              <UiButton icon="clear" class="icon-action danger" :title="t('removeInputAction')" @click="removeInputAction(actionIndex)" />
              <UiButton icon="duplicate" class="icon-action" :label="t('duplicate')" @click="duplicateInputAction(actionIndex)" />
            </div>
            <details data-ui-motion-disclosure v-if="!compactInputMap" class="action-advanced">
              <summary>{{ t('actionBehavior') }}</summary>
              <div class="action-advanced-grid">
                <UiPropertyRow :label="t('enabled')"><input v-model="action.enabled" type="checkbox" @change="commitInputMap"></UiPropertyRow>
                <UiPropertyRow :label="t('inputContext')"><input v-model.trim="action.context" maxlength="80" @change="commitInputMap"></UiPropertyRow>
                <UiPropertyRow :label="t('actionMap')"><input v-model.trim="action.map" maxlength="80" @change="commitInputMap"></UiPropertyRow>
                <UiPropertyRow :label="t('controlSchemes')"><input :value="action.schemes.join(', ')" :placeholder="t('allSchemes')" @change="setActionSchemes(actionIndex, $event)"></UiPropertyRow>
                <UiPropertyRow :label="t('interaction')"><select v-model="action.interaction" @change="commitInputMap"><option value="press">{{ t('inputPress') }}</option><option value="hold">{{ t('inputHold') }}</option><option value="tap">{{ t('inputTap') }}</option><option value="multiTap">{{ t('inputMultiTap') }}</option></select></UiPropertyRow>
                <UiPropertyRow :label="t('holdSeconds')" v-if="action.interaction === 'hold'"><NumericExpressionInput v-model="action.holdSeconds" :minimum="0.001" :maximum="60" :step="0.05" @change="commitInputMap" :resource-key="'project:input:' + action.name + ':' + actionIndex + ':action.holdSeconds'" /></UiPropertyRow>
                <UiPropertyRow :label="t('tapSeconds')" v-if="action.interaction === 'tap' || action.interaction === 'multiTap'"><NumericExpressionInput v-model="action.tapSeconds" :minimum="0.001" :maximum="10" :step="0.05" @change="commitInputMap" :resource-key="'project:input:' + action.name + ':' + actionIndex + ':action.tapSeconds'" /></UiPropertyRow>
                <UiPropertyRow :label="t('tapCount')" v-if="action.interaction === 'multiTap'"><NumericExpressionInput v-model="action.multiTapCount" :minimum="2" :maximum="16" :step="1" @change="commitInputMap" :resource-key="'project:input:' + action.name + ':' + actionIndex + ':action.multiTapCount'" /></UiPropertyRow>
                <UiPropertyRow :label="t('consumeInput')"><input v-model="action.consume" type="checkbox" @change="commitInputMap"></UiPropertyRow>
                <UiPropertyRow :label="t('actionPriority')"><NumericExpressionInput v-model="action.priority" :minimum="-10000" :maximum="10000" :step="1" @change="commitInputMap" :resource-key="'project:input:' + action.name + ':' + actionIndex + ':action.priority'" /></UiPropertyRow>
                <UiPropertyRow :label="t('callbackFunction')"><input v-model.trim="action.callback" maxlength="80" placeholder="on_jump" @change="commitInputMap"></UiPropertyRow>
              </div>
            </details>
            <div v-for="(binding, bindingIndex) in action.bindings" :key="bindingIndex" class="input-binding">
              <UiPropertyRow :label="t('inputDevice')" class="binding-field"><select v-model="binding.device" :aria-label="t('inputDevice')" @change="setBindingDevice(binding); commitInputMap()">
                <option v-for="device in inputDevices" :key="device" :value="device">{{ device }}</option>
              </select></UiPropertyRow>
              <UiPropertyRow :label="t('bindingCode')" class="binding-field"><input v-model.trim="binding.code" :aria-label="t('bindingCode')" maxlength="80" @change="commitInputMap"></UiPropertyRow>
              <template v-if="action.kind === 'vector2'">
                <UiPropertyRow :label="t('inputX')" class="binding-field"><NumericExpressionInput v-model="binding.x" :aria-label="t('inputX')" :minimum="-100" :maximum="100" :step="0.1" @change="commitInputMap" :resource-key="'project:input:' + action.name + ':' + actionIndex + ':binding:' + bindingIndex + ':binding.x'" /></UiPropertyRow>
                <UiPropertyRow :label="t('inputY')" class="binding-field"><NumericExpressionInput v-model="binding.y" :aria-label="t('inputY')" :minimum="-100" :maximum="100" :step="0.1" @change="commitInputMap" :resource-key="'project:input:' + action.name + ':' + actionIndex + ':binding:' + bindingIndex + ':binding.y'" /></UiPropertyRow>
              </template>
              <UiPropertyRow :label="t('inputScale')" v-else class="binding-field"><NumericExpressionInput v-model="binding.scale" :aria-label="t('inputScale')" :minimum="-100" :maximum="100" :step="0.1" @change="commitInputMap" :resource-key="'project:input:' + action.name + ':' + actionIndex + ':binding:' + bindingIndex + ':binding.scale'" /></UiPropertyRow>
              <UiPropertyRow :label="t('gamepadIndex')" v-if="binding.device.startsWith('gamepad')" class="binding-field"><NumericExpressionInput v-model="binding.gamepad" :aria-label="t('gamepadIndex')" :minimum="0" :maximum="15" :step="1" @change="commitInputMap" :resource-key="'project:input:' + action.name + ':' + actionIndex + ':binding:' + bindingIndex + ':binding.gamepad'" /></UiPropertyRow>
              <UiPropertyRow :label="t('deadzone')" v-if="binding.device === 'gamepad-axis'" class="binding-field"><NumericExpressionInput v-model="binding.deadzone" :aria-label="t('deadzone')" :minimum="0" :maximum="0.99" :step="0.01" @change="commitInputMap" :resource-key="'project:input:' + action.name + ':' + actionIndex + ':binding:' + bindingIndex + ':binding.deadzone'" /></UiPropertyRow>
              <UiButton icon="clear" class="icon-action danger" :title="t('removeBinding')" @click="removeInputBinding(actionIndex, bindingIndex)" />
              <details data-ui-motion-disclosure v-if="!compactInputMap" class="binding-advanced"><summary>{{ t('advanced') }}</summary><UiPropertyRow :label="(t('threshold'))"><NumericExpressionInput v-model="binding.threshold" :minimum="0" :maximum="1" :step="0.01" @change="commitInputMap" :resource-key="'project:input:' + action.name + ':' + actionIndex + ':binding:' + bindingIndex + ':binding.threshold'" /></UiPropertyRow><UiPropertyRow :label="(t('invert'))"><input v-model="binding.invert" type="checkbox" @change="commitInputMap"></UiPropertyRow><UiPropertyRow :label="(t('responseCurve'))"><select v-model="binding.responseCurve" @change="commitInputMap"><option>linear</option><option>square</option><option>cubic</option><option>exponential</option></select></UiPropertyRow><UiPropertyRow :label="(t('deviceIdentity'))"><input v-model="binding.deviceId" @change="commitInputMap"></UiPropertyRow><UiPropertyRow :label="(t('modifiers'))"><input :value="binding.modifiers.join(', ')" @change="setBindingList(binding,'modifiers',$event)"></UiPropertyRow><UiPropertyRow :label="(t('chord'))"><input :value="binding.chord.join(', ')" @change="setBindingList(binding,'chord',$event)"></UiPropertyRow></details>
            </div>
            <UiButton icon="add" class="secondary-action compact-action" @click="addInputBinding(actionIndex)">{{ t('addBinding') }}</UiButton>
          </article>
        </div>
        <UiButton icon="add" class="secondary-action" @click="addInputAction">{{ t('addInputAction') }}</UiButton>
      </UiPropertySection>

      <UiPropertySection :title="t('canvasSettings')" v-show="showCard('canvasSettings gridSize snapToGrid zoomSensitivity showConnections renderQuality', 'editor')" >

        <UiPropertyRow :label="t('gridSize')"><input v-model.number="prefs.gridSize" type="number" min="0.000001" step="1"></UiPropertyRow>
        <UiPropertyRow :label="t('snapToGrid')"><UiToggle v-model="prefs.snapToGrid" /></UiPropertyRow>
        <UiPropertyRow :label="t('zoomSensitivity')">
          <div class="value-control"><UiSlider :precise="false" v-model.number="prefs.zoomSensitivity" min="0.2" max="3" step="0.1" /><output>{{ prefs.zoomSensitivity.toFixed(1) }}×</output></div>
        </UiPropertyRow>
        <UiPropertyRow :label="t('showConnections')"><UiToggle v-model="prefs.showConnections" /></UiPropertyRow>
        <UiPropertyRow :label="t('connectionThickness')">
          <div class="value-control"><UiSlider :precise="false" v-model.number="prefs.connectionThickness" min="0.5" max="8" step="0.5" /><output>{{ prefs.connectionThickness }} px</output></div>
        </UiPropertyRow>
        <UiPropertyRow :label="t('showDiagnostics')"><UiToggle v-model="prefs.showDiagnostics" /></UiPropertyRow>
        <UiPropertyRow :label="t('renderQuality')">
          <select v-model.number="prefs.maxPixelRatio"><option :value="1">1×</option><option :value="1.5">1.5×</option><option :value="2">2×</option><option :value="3">3×</option></select>
        </UiPropertyRow>
      </UiPropertySection>

      <UiPropertySection :title="t('relatedTools')" v-show="showCard('packages plugins saveData engineDiagnostics projectHealth', 'all')" class="related-tools">

        <p>{{ t('settingsRelocationHint') }}</p>
        <button class="secondary-action" @click="openTool('packages')">{{ t('openPackageManager') }}</button>
        <button class="secondary-action" @click="openTool('profiler')">{{ t('openDebugTools') }}</button>
        <button class="secondary-action" @click="openTool('project')">{{ t('openProjectHealth') }}</button>
      </UiPropertySection>

      <UiPropertySection :title="t('projectSettings')" v-show="showCard('projectSettings autosave autosaveInterval confirmDestructive restoreAutosave', 'project')" >

        <UiPropertyRow :label="t('autosave')"><UiToggle v-model="prefs.autosave" /></UiPropertyRow>
        <UiPropertyRow :label="t('autosaveInterval')"><input v-model.number="prefs.autosaveInterval" type="number" min="5" max="600" step="5"></UiPropertyRow>
        <UiPropertyRow :label="t('confirmDestructive')"><UiToggle v-model="prefs.confirmDestructiveActions" /></UiPropertyRow>
        <button class="secondary-action" :disabled="!autosaveAvailable" @click="restoreSavedScene">{{ t('restoreAutosave') }}</button>
      </UiPropertySection>

      <UiPropertySection :title="t('defaultsSettings')" v-show="showCard('defaultsSettings defaultDensity defaultRestitution defaultFriction', 'editor')" >

        <UiPropertyRow :label="t('defaultDensity')"><input v-model.number="prefs.defaultDensity" type="number" min="0.000001" step="0.1"></UiPropertyRow>
        <UiPropertyRow :label="t('defaultRestitution')"><input v-model.number="prefs.defaultRestitution" type="number" min="0" max="1" step="0.05"></UiPropertyRow>
        <UiPropertyRow :label="t('defaultFriction')"><input v-model.number="prefs.defaultFriction" type="number" min="0" step="0.05"></UiPropertyRow>
        <button class="danger-action" @click="resetExperience">{{ t('resetSettings') }}</button>
      </UiPropertySection>
    </div>
  </div>
</template>

<script setup lang="ts">
import NumericExpressionInput from '../components/NumericExpressionInput.vue'
import EditorIcon from '../components/EditorIcon.vue'
import { openProductionManual } from '../runtime/openManual'
import { NOVA_RELEASE_NAME } from '../projects/projectFormat'
import { computed, onActivated, onDeactivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from '../i18n'
import { editorState } from '../store/editor'
import { autosaveState, physicsState as physics, pushHistory, restoreAutosave } from '../store/physics'
import { editorPerformancePreferences, systemReducedMotion, preferencesState as prefs, resetPreferences, selectColorPalette } from '../store/preferences'
import { EDITOR_PERFORMANCE_COPY } from '../store/editorPerformanceCopy'
import { FORM_LAYOUT_COPY } from '../editor/formLayoutCopy'
import { COLOR_PALETTES, PALETTE_COPY } from '../store/colorPalettes'
import type { ThemeMode } from '../store/preferences'
import type { PerformanceProfile } from '../store/preferences'
import { INPUT_DEVICES, createInputAction, createInputBinding, detectInputConflicts, normalizeInputMap, type InputBinding, type InputDevice, type InputDeviceIdentity, type InputModifier, type InputRecording } from '../runtime/input'
import { gameplayRuntime } from '../editor/gameplayRuntime'
import { normalizeAudioSettings } from '../runtime/audio'
import { openEditorTool } from '../editor/workspaces'
import PhysicsSettingsPanel from '../components/PhysicsSettingsPanel.vue'
import DeviceInputPanel from '../components/DeviceInputPanel.vue'
import { scriptProjectSettings as scriptSettings } from '../runtime/scriptSettings'
import { normalizeGlobalScripts, nextGlobalScriptName, MAX_GLOBAL_SCRIPTS } from '../runtime/globalScriptSettings'
import { assetState } from '../assets/AssetDatabase'

/** 26.43 global scripts: script assets that can be chosen, and list edits that keep names unique and valid. */
const scriptAssets = computed(() => assetState.records.filter(asset => asset.assetType === 'script' || asset.assetType === 'visualScript').map(asset => ({ uuid: asset.uuid, path: asset.path })).sort((a, b) => a.path.localeCompare(b.path)))
function commitGlobalScripts() { scriptSettings.globalScripts = normalizeGlobalScripts(scriptSettings.globalScripts); pushHistory('Edit global scripts') }
function addGlobalScript() {
  if (scriptSettings.globalScripts.length >= MAX_GLOBAL_SCRIPTS) return
  scriptSettings.globalScripts = [...scriptSettings.globalScripts, { name: nextGlobalScriptName(scriptSettings.globalScripts), scriptAsset: scriptAssets.value[0]?.uuid ?? null, enabled: true }]
  commitGlobalScripts()
}
function renameGlobalScript(index: number, value: string) {
  const name = value.trim().replace(/[^A-Za-z0-9_]/g, '_').replace(/^(?=[0-9])/, '_').slice(0, 64)
  const others = scriptSettings.globalScripts.filter((_, other) => other !== index)
  const entry = scriptSettings.globalScripts[index]
  if (entry && name) entry.name = others.some(item => item.name.toLowerCase() === name.toLowerCase()) ? nextGlobalScriptName(others, name) : name
  commitGlobalScripts()
}
function removeGlobalScript(index: number) { scriptSettings.globalScripts = scriptSettings.globalScripts.filter((_, other) => other !== index); commitGlobalScripts() }
import { applyCreatorPerformanceProfile } from '../runtime/creatorLearning'

/** 切换明暗主题，选择浅色时关闭高对比模式。 */ function setTheme(theme: ThemeMode) {
  prefs.theme = theme
  if (theme === 'light') prefs.highContrast = false
}

/** 设置文案随界面语言即时更新，不写入项目内容。 */
const performanceCopy = computed(/** 读取当前语言的性能设置文案。 */ () => EDITOR_PERFORMANCE_COPY[prefs.locale])
const autosaveAvailable = computed(/* 返回 autosaveState.available 的当前值。 */ () => autosaveState.available)
const inputDevices: readonly InputDevice[] = INPUT_DEVICES
const inputSearch = ref(''), inputDeviceFilter = ref<InputDevice | 'all'>('all'), compactInputMap = ref(false), inputRecording = ref(false), lastInputRecording = ref<InputRecording | null>(null), connectedInputDevices = ref<InputDeviceIdentity[]>([])
const inputConflicts = computed(/** 检查项目输入映射中的冲突。 */ () => detectInputConflicts(physics.inputMap))
const visibleInputActions = computed(/** 保留原索引后按名称、绑定文本和设备类型筛选输入动作。 */ () => physics.inputMap.map(/** 将动作和其原始索引组合以便编辑筛选结果。 */ (action, actionIndex) => ({ action, actionIndex })).filter(/** 匹配动作名称或绑定搜索，并要求符合当前设备过滤。 */ ({ action }) => {
  const matchesSearch = !inputSearch.value.trim() || action.name.toLocaleLowerCase().includes(inputSearch.value.trim().toLocaleLowerCase()) || action.bindings.some(/** 按设备和代码文本匹配输入搜索词。 */ binding => `${binding.device} ${binding.code}`.toLocaleLowerCase().includes(inputSearch.value.trim().toLocaleLowerCase()))
  return matchesSearch && (inputDeviceFilter.value === 'all' || action.bindings.some(/* 比较 binding.device 与 inputDeviceFilter.value，返回严格相等的判断结果。 */ binding => binding.device === inputDeviceFilter.value))
}))
let inputDeviceTimer = 0
function startDevicePolling() { if (inputDeviceTimer) return; connectedInputDevices.value = gameplayRuntime.input.connectedDevices(); inputDeviceTimer = window.setInterval(() => { connectedInputDevices.value = gameplayRuntime.input.connectedDevices() }, 1000) }
function stopDevicePolling() { window.clearInterval(inputDeviceTimer); inputDeviceTimer = 0 }
onMounted(startDevicePolling)
onActivated(startDevicePolling)
onDeactivated(stopDevicePolling)
onBeforeUnmount(stopDevicePolling)
const settingScopes = [{ id: 'all' as const, label: 'all' }, { id: 'editor' as const, label: 'editorScope' }, { id: 'project' as const, label: 'projectScope' }, { id: 'runtime' as const, label: 'runtimeScope' }]
watch(/* 返回 prefs.locale 的当前值。 */ () => prefs.locale, /** 偏好变化时把编辑器状态更新为就绪。 */ () => { editorState.statusText = t('ready') })

/** 按设置范围和本地化搜索词决定卡片可见性，表单布局文案使用专用匹配。 */ function showCard(keys: string, scope: 'all' | 'editor' | 'project' | 'runtime'): boolean {
  if (editorState.settingsScope !== 'all' && scope !== 'all' && editorState.settingsScope !== scope) return false
  const needle = editorState.settingsSearch.trim().toLocaleLowerCase()
  if (!needle) return true
  if (keys.includes('formLabelLayout') && Object.values(FORM_LAYOUT_COPY[prefs.locale]).some(/** 检查表单布局选项文案是否包含搜索词。 */ value => value.toLocaleLowerCase().includes(needle))) return true
  return keys.split(' ').some(/** 匹配翻译后的设置名或原翻译键。 */ key => t(key).toLocaleLowerCase().includes(needle) || key.toLocaleLowerCase().includes(needle))
}
/** 打开指定包、性能或健康工具。 */ function openTool(tab: 'packages' | 'profiler' | 'project') { openEditorTool(tab) }

/** 归一化音频设置并记录历史。 */ function commitAudioSettings() {
  Object.assign(physics.audioSettings, normalizeAudioSettings(physics.audioSettings))
  pushHistory('Edit audio settings')
}

/** 归一化并原位替换输入映射，记录历史。 */ function commitInputMap() {
  const normalized = normalizeInputMap(physics.inputMap)
  physics.inputMap.splice(0, physics.inputMap.length, ...normalized)
  pushHistory('Edit input map')
}

/** 生成未占用的 Action 名称，创建默认动作并记录历史。 */ function addInputAction() {
  const used = new Set(physics.inputMap.map(/* 返回 action.name 的当前值。 */ action => action.name))
  let suffix = physics.inputMap.length + 1
  while (used.has(`Action${suffix}`)) suffix++
  physics.inputMap.push(createInputAction(`Action${suffix}`))
  pushHistory('Add input action')
}

/** 在数量上限内复制动作，生成唯一名称并复制内部绑定数组，记录历史。 */ function duplicateInputAction(index: number) {
  const source = physics.inputMap[index]; if (!source || physics.inputMap.length >= 128) return
  const names = new Set(physics.inputMap.map(/* 返回 action.name 的当前值。 */ action => action.name)); let suffix = 2, name = `${source.name} Copy`; while (names.has(name)) name = `${source.name} Copy ${suffix++}`
  physics.inputMap.splice(index + 1, 0, { ...source, name, schemes: [...source.schemes], bindings: source.bindings.map(/** 复制绑定及修饰键、和弦数组，避免副本共享可变列表。 */ binding => ({ ...binding, modifiers: [...binding.modifiers], chord: [...binding.chord] })) }); pushHistory('Duplicate input action')
}

/** 删除指定输入动作并记录历史。 */ function removeInputAction(index: number) {
  physics.inputMap.splice(index, 1)
  pushHistory('Remove input action')
}

/** 给指定动作添加默认输入绑定并记录历史。 */ function addInputBinding(actionIndex: number) {
  physics.inputMap[actionIndex]?.bindings.push(createInputBinding())
  pushHistory('Add input binding')
}

/** 删除指定动作的绑定并记录历史。 */ function removeInputBinding(actionIndex: number, bindingIndex: number) {
  physics.inputMap[actionIndex]?.bindings.splice(bindingIndex, 1)
  pushHistory('Remove input binding')
}

/** 设备种类变化时设置该设备的默认输入代码。 */ function setBindingDevice(binding: InputBinding) {
  binding.code = binding.device === 'keyboard' || binding.device === 'physical-key' ? 'Space'
    : binding.device === 'mouse-wheel' || binding.device === 'mouse-motion' ? 'y'
      : binding.device === 'touch' ? 'pressed'
        : binding.device === 'gesture' ? 'tap'
          : binding.device === 'sensor' ? 'tilt-x'
            : binding.device === 'pen-button' ? 'tip'
              : binding.device === 'pen-pressure' ? 'pressure'
                : binding.device === 'pen-tilt' ? 'x'
                  : binding.device === 'pen-twist' ? 'twist' : '0'
}

/** 解析修饰键或和弦列表，过滤及限量后提交归一化输入映射。 */ function setBindingList(binding: InputBinding, property: 'modifiers' | 'chord', event: Event) { const values = (event.target as HTMLInputElement).value.split(',').map(/** 去除单个输入项前后空白。 */ value => value.trim()).filter(Boolean); if (property === 'modifiers') binding.modifiers = values.filter(/** 仅允许 Control、Shift、Alt 和 Meta 修饰键。 */ (value): value is InputModifier => ['Control','Shift','Alt','Meta'].includes(value)).slice(0, 4); else binding.chord = [...new Set(values)].slice(0, 8); commitInputMap() }
/** 解析并去重动作方案名称，最多十六项后提交。 */ function setActionSchemes(actionIndex: number, event: Event) { const action = physics.inputMap[actionIndex]; if (!action) return; action.schemes = [...new Set((event.target as HTMLInputElement).value.split(',').map(/** 去除单个方案名称前后空白。 */ value => value.trim()).filter(Boolean))].slice(0, 16); commitInputMap() }
/** 切换输入录制状态，结束时保存录制结果。 */ function toggleInputRecording() { if (!inputRecording.value) { gameplayRuntime.input.beginRecording(); inputRecording.value = true } else { lastInputRecording.value = gameplayRuntime.input.endRecording(); inputRecording.value = false } }
/** 存在最近录制时交给输入运行时播放。 */ function replayInputRecording() { if (lastInputRecording.value) gameplayRuntime.input.playRecording(lastInputRecording.value) }

/** 恢复自动保存成功则记录历史并提示，否则提示没有可恢复保存。 */ function restoreSavedScene() {
  if (restoreAutosave()) {
    pushHistory()
    editorState.statusText = t('autosaveRestored')
  } else editorState.statusText = t('noAutosave')
}

/** 重置编辑器偏好并显示已重置状态。 */ function resetExperience() {
  resetPreferences()
  void applyCreatorPerformanceProfile('balanced')
  editorState.statusText = t('settingsReset')
}
</script>

<style scoped>
/* 26.43 global scripts: one row per script; fields wrap on narrow panels and iPad portrait. */
.global-scripts{display:grid;gap:var(--ui-field-gap);padding-block:var(--ui-field-gap);border-block-end:var(--ui-border-width) solid var(--border-separator)}
.global-scripts-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--ui-control-gap)}
.global-scripts-head strong{font-size:var(--type-body);color:var(--text-primary)}
.global-script-row{min-width:0;display:flex;flex-wrap:wrap;align-items:flex-end;gap:var(--ui-control-gap)}
.global-script-row>label{min-width:0;display:grid;gap:var(--ui-label-control-gap);flex:1 1 calc(120px * var(--ui-scale))}
.global-script-row>label:nth-child(2){flex:2 1 calc(200px * var(--ui-scale))}
.global-script-row>label>span{color:var(--text-muted);font-size:var(--type-caption)}
.global-script-row input,.global-script-row select{min-width:0;width:100%}
.global-script-row>.global-script-toggle{flex:0 0 auto;justify-items:start}
.global-script-row>.icon-action{flex:0 0 var(--ui-control-height)}
.matrix-card { grid-column: 1 / -1; }.related-tools .secondary-action{ margin-top: 0;}.related-tools p{ margin-left: 0;}
.icon-action { padding: 0; border: 1px solid var(--border-subtle); color: var(--text-muted); background: var(--surface-3); width: var(--ui-control-height); height: var(--ui-control-height); min-height: var(--ui-control-height); min-width: var(--ui-control-height); border-radius: var(--radius-control); }
.icon-action.danger:hover { color: var(--danger); border-color: var(--danger); }
.compact-action { min-height: var(--ui-control-height); margin-top: 0; }
.matrix-card p { margin-bottom: var(--space-3); }
.matrix-scroll { max-width: 100%; padding: var(--space-2); overflow: auto; border: 1px solid var(--border-subtle); background: var(--surface-2); }
.matrix-header, .matrix-row { width: max-content; display: grid; grid-template-columns: 28px repeat(32, 18px); gap: var(--space-0); align-items: center; }
.matrix-header { margin-bottom: var(--space-1); }
.matrix-header b, .matrix-row > b { color: var(--text-muted); text-align: center; }
.matrix-row { margin-bottom: var(--space-0); }
.matrix-row button { width: 18px; height: 18px; padding: 0; border: 1px solid var(--border-subtle); background: var(--surface-3); }
.matrix-row button.active { border-color: var(--accent-fill); background: var(--accent-fill); color: var(--accent-contrast); }
h2 { margin: 0; }
p { color: var(--text-muted); margin: 0; font-size: var(--type-caption); line-height: var(--line-body); }
.value-control { width: max-content; max-width: 100%; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-control-gap); }
.value-control output { text-align: right; color: var(--text-primary); font-variant-numeric: tabular-nums; font-size: var(--type-body); line-height: var(--line-body); }
.metric-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,calc(160px * var(--ui-scale))),1fr)); gap: var(--ui-control-gap); margin-top: 0; }
.metric-grid > div { min-width: 0; display: flex; flex-direction: column; border: 1px solid var(--border-subtle); background: var(--surface-2); padding: var(--ui-panel-inset); gap: var(--ui-control-gap); border-radius: var(--radius-panel); }
.metric-grid span { overflow: hidden; color: var(--text-muted); text-overflow: ellipsis; white-space: normal; overflow-wrap: anywhere; }
.metric-grid strong, :deep(output) { color: var(--text-primary); font-variant-numeric: tabular-nums; }
.secondary-action, .danger-action { align-self: flex-start; min-height: var(--ui-control-height); border: 1px solid var(--border-subtle); background: var(--surface-3); margin-top: 0; font-size: var(--type-body); line-height: var(--line-control); border-radius: var(--radius-control); }
.secondary-action:hover { border-color: var(--accent); background: var(--accent-soft); }
.danger-action { color: var(--danger); background: var(--danger-soft); }
.danger-action:hover { border-color: var(--danger); }.connected-devices{display:flex;flex-wrap:wrap;gap: var(--ui-control-gap);margin-bottom: 0;}.connected-devices span{border:1px solid var(--border-subtle);color:var(--text-muted);padding: var(--space-2) var(--space-3);border-radius: var(--radius-control);font-size: var(--type-caption);line-height: var(--line-body);overflow-wrap: anywhere;}.binding-advanced{grid-column:1/-1;display: grid;grid-template-columns: repeat(auto-fit,minmax(min(100%,calc(240px * var(--ui-scale))),1fr));padding: 0;gap: var(--ui-field-gap);border: 0;border-top: var(--ui-border-width) solid var(--border-separator);padding-top: var(--ui-heading-content-gap);}.binding-advanced summary{cursor:pointer;color:var(--accent);min-height: var(--ui-control-height);line-height: var(--line-control);font-size: var(--type-body);padding: var(--ui-input-padding-block) var(--ui-control-padding);grid-column: 1/-1;gap: var(--ui-control-gap);border-radius: var(--radius-control);}
.binding-advanced summary{display:flex;align-items:center;min-height: var(--ui-control-height);line-height: var(--line-control);font-size: var(--type-body);padding: var(--ui-input-padding-block) var(--ui-control-padding);grid-column: 1/-1;gap: var(--ui-control-gap);border-radius: var(--radius-control);}
.action-advanced{margin-bottom: 0;padding: 0;border: 0;border-bottom: var(--ui-border-width) solid var(--border-separator);background: transparent;}.action-advanced>summary{display:flex;align-items:center;cursor:pointer;color:var(--accent);min-height: var(--ui-control-height);line-height: var(--line-control);font-size: var(--type-body);padding: var(--ui-input-padding-block) var(--ui-control-padding);gap: var(--ui-control-gap);border-radius: var(--radius-control);}.action-advanced-grid{display:grid;grid-template-columns: repeat(auto-fit,minmax(min(100%,calc(240px * var(--ui-scale))),1fr));gap: var(--ui-field-gap);padding-top: var(--ui-heading-content-gap);padding-bottom: var(--ui-panel-inset);}
/* Binding labels remain attached to their fields when the card reflows. */
.binding-field>span{color:var(--text-muted);overflow-wrap:anywhere}
/* Actual input mapping fields keep labels attached and use one comfortable spacing rhythm. */
.input-map-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:var(--ui-control-gap)}
.input-map-toolbar>label{display:flex;align-items:center;gap:var(--ui-control-gap);font-size:var(--type-body);line-height:var(--line-body)}
.input-actions{display:grid;gap:var(--ui-section-gap)}
.input-action{min-width:0;display:grid;gap:var(--ui-field-gap);padding-block:var(--ui-field-gap);border-block-end:var(--ui-border-width) solid var(--border-separator)}
.input-action-heading{min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:var(--ui-control-gap)}
.input-action-heading>input{flex:1 1 calc(200px * var(--ui-scale));max-width:var(--ui-field-width)}
.input-action-heading>select{width:min(100%,calc(160px * var(--ui-scale)))}
.input-action-heading>.icon-action{flex:0 0 var(--ui-control-height)}
.input-binding{min-width:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,calc(240px * var(--ui-scale))),1fr));gap:var(--ui-field-gap);padding-block:var(--ui-field-gap);border-block-end:var(--ui-border-width) solid var(--border-separator)}
.input-binding>.icon-action{justify-self:end;align-self:end}
:deep(.binding-field.ui-property-row),.action-advanced-grid :deep(.ui-property-row),.binding-advanced :deep(.ui-property-row){grid-template-columns:minmax(0,1fr);align-items:start;row-gap:var(--ui-label-control-gap)}
.input-conflicts{min-width:0;display:grid;gap:var(--ui-control-gap);padding:var(--ui-panel-inset);border-inline-start:var(--ui-border-width) solid var(--warning);border-radius:var(--radius-control);background:var(--warning-soft);font-size:var(--type-body);line-height:var(--line-body);overflow-wrap:anywhere}
</style>
