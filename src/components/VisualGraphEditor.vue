<!-- 可视图编辑器：统一编辑结构节点、连线与源码映射，布局和持久化操作均通过现有历史机制。 -->
<template>
  <section ref="editorRoot" class="graph-editor" :data-initial-layout="initialLayoutState||undefined" tabindex="0" @pointerdown.capture="cancelInitialLayout" @keydown.capture="cancelInitialLayout" @wheel.capture.passive="cancelInitialLayout" @keydown="onKeydown">
    <header class="graph-toolbar">
      <div class="primary-actions">
        <UiButton icon="add" variant="primary" :label="t('newVisualGraph')" @click="createGraph" />
        <UiButton icon="code" :label="conversionLabels.newGraph" @click="createSyntaxGraph" />
        <UiButton icon="save" :label="t('saveAsset')" :disabled="!activeAsset || !dirty" @click="saveGraph" />
        <UiButton icon="undo" :disabled="!canUndo" :label="t('undo')" @click="undo" /><UiButton icon="redo" :disabled="!canRedo" :label="t('redo')" @click="redo" />
      </div>
      <select v-model="activeScopeUuid" class="scope-picker" :aria-label="t('graphScope')" :title="t('graphScope')" @change="scopeChanged">
        <option value="main">{{ t('mainGraph') }}</option>
        <option v-for="routine in graph.routines" :key="routine.uuid" :value="routine.uuid">{{ routine.kind }} · {{ routine.name }}</option>
      </select>
      <div class="authoring-switch" role="group" :aria-label="t('visualAuthoringStyle')"><UiButton icon="list" :aria-pressed="studio.authoringMode === 'blocks'" @click="setAuthoringMode('blocks')">{{ t('blockMode') }}</UiButton><UiButton icon="graph" :aria-pressed="studio.authoringMode === 'nodes'" @click="setAuthoringMode('nodes')">{{ t('nodeMode') }}</UiButton></div>
      <details data-ui-motion-popover class="graph-more"><summary>{{ layoutLabels.commands }}</summary><div class="editing-actions">
        <UiButton :class="{ active: studio.paletteOpen }" @click="togglePalette" icon="add">{{ t('nodePalette') }}</UiButton>
        <UiButton :disabled="!selectedNodes.size" @click="duplicateSelected" icon="copy">{{ t('duplicate') }}</UiButton>
        <UiButton :disabled="selectedNodes.size < 2" @click="alignSelected" icon="align-left">{{ t('alignLeft') }}</UiButton>
        <UiButton :disabled="selectedNodes.size < 3" @click="distributeSelected" icon="distribute">{{ t('distributeHorizontal') }}</UiButton>
        <UiButton @click="addComment" icon="comment">{{ t('graphComment') }}</UiButton>
        <button :disabled="layoutRunning" @click="arrangeGraph(false)">{{ layoutLabels.arrangeAll }}</button>
        <button :disabled="layoutRunning || !selectedNodes.size" @click="arrangeGraph(true)">{{ layoutLabels.arrangeSelected }}</button>
        <button :disabled="layoutRunning || !selectedNodes.size" @click="setSelectedLayoutPinned(true)">{{ layoutLabels.pinSelected }}</button>
        <button :disabled="layoutRunning || !selectedNodes.size" @click="setSelectedLayoutPinned(false)">{{ layoutLabels.unpinSelected }}</button>
        <button :disabled="layoutRunning" @click="arrangeGraph(false, undefined, true)">{{ layoutLabels.arrangeIncludingPinned }}</button>
        <button v-if="layoutRunning" @click="cancelGraphLayout">{{ layoutLabels.cancelLayout }}</button>
<!-- 点击回调调用框选全部操作，以忽略按钮事件参数。 -->        <button @click="() => frameAll()">{{ t('frameAll') }}</button>
        <button :aria-pressed="studio.layout.canvasFocused" @click="studio.layout.canvasFocused=!studio.layout.canvasFocused">{{ studio.layout.canvasFocused?layoutLabels.restorePanels:layoutLabels.focusCanvas }}</button>
        <button :aria-pressed="studio.layout.compactNodes" @click="studio.layout.compactNodes=!studio.layout.compactNodes">{{ layoutLabels.compactNodes }}</button>
      </div></details>
      <span class="graph-status" :class="{ invalid: !validation.valid }">{{ validation.valid ? t('graphReady') : t('graphErrors', { count: errorCount }) }} · {{ activeScope.nodes.length }} {{ t('nodes') }} · {{ validation.elapsedMs.toFixed(1) }} ms</span>
    </header>
    <p v-if="graphSaveError" class="graph-save-error" role="alert">{{ graphSaveError }}</p>
    <StudioDraftConflict format="json" v-if="graphDraftConflict" :saved-source="savedGraphSource" :draft-source="JSON.stringify(graph)" @keep="acceptGraphDraftBase" @discard="discardGraphDraft" />
    <div v-if="layoutMessage" class="graph-layout-status" role="status"><span>{{ layoutMessage }}</span><button v-for="item in layoutDiagnostics" :key="item.edgeUuid??item.code" @click="item.edgeUuid&&selectEdge(item.edgeUuid)">{{ item.code }} · {{ item.edgeUuid?.slice(0,8) }}</button></div>

    <div ref="graphBody" class="graph-body" :style="{gridTemplateColumns:paneLayout.columns}" :class="{ 'no-palette': !paneLayout.primaryVisible, 'no-details': !paneLayout.secondaryVisible, 'drawer-layout':paneLayout.drawer, 'blocks-mode': studio.authoringMode === 'blocks', 'compact-nodes':studio.layout.compactNodes }">
      <aside v-if="paneLayout.primaryVisible" class="graph-palette" :style="{width:paneLayout.primaryWidth+'px'}">
        <header><strong>{{ t('nodePalette') }}</strong><UiButton :title="t('close')" @click="closePalette" icon="close" :label="t('close')" /></header>
        <PanelResizeHandle v-if="!paneLayout.drawer" v-model="studio.layout.paletteWidth" orientation="vertical" :minimum="184" :maximum="Math.min(480,graphBodyWidth-440)" :reset-value="264" :label="layoutLabels.resizePalette" style="right:0;top:0;bottom:0" />
        <nav v-if="studio.authoringMode === 'blocks'" class="block-categories" :aria-label="t('blockCategories')"><button v-for="family in scratchFamilies" :key="family.id" :class="{ active: blockFamily === family.id }" :style="{ '--family-color': family.color }" @click="blockFamily = family.id"><i></i><span>{{ t(family.label) }}</span></button></nav>
        <input ref="paletteInput" v-model="paletteSearch" type="search" :aria-label="conversionLabels.searchNodes" :placeholder="conversionLabels.searchNodes" @keydown.enter.prevent="addFirstPaletteNode">
        <div class="asset-list">
          <button v-for="asset in graphAssets" :key="asset.uuid" :class="{ active: asset.uuid === activeAsset?.uuid }" @click="openGraph(asset.uuid)"><EditorIcon name="graph" /><span><strong>{{ asset.name }}</strong><small>{{ asset.path }}</small></span></button>
        </div>
        <div class="palette-list">
          <section v-for="group in paletteGroups" :key="group.category"><h3>{{ localizedCategory(group.category) }}</h3><button v-for="definition in group.items" :key="definition.type" :title="syntaxNodeHelp(definition.type,preferencesState.locale,definition.description)" :style="{ '--family-color': familyColor[scratchFamily(definition.category)] }" @click="addNode(definition.type)"><i :style="{ background: studio.authoringMode === 'blocks' ? familyColor[scratchFamily(definition.category)] : definition.color }"></i><span><strong>{{ graphPaletteTitle(definition.type,definition.title,preferencesState.locale) }}</strong><small>{{ syntaxNodeHelp(definition.type,preferencesState.locale,definition.description) }}</small></span></button></section>
          <p v-if="!paletteResults.length" class="empty">{{ t('noMatchingNodes') }}</p>
        </div>
      </aside>

      <main ref="canvas" class="graph-canvas" :aria-busy="routingBusy || layoutRunning" :class="{ connecting: pendingWire, 'graph-low-detail': lowDetail, 'is-panning': isPanning }" @pointerdown.capture="canvasPointerDownCapture" @pointerdown="canvasPointerDown" @dblclick.self="openPaletteAtPointer" @wheel.capture.prevent.stop="zoomCanvas">
        <div class="graph-grid" :style="gridStyle"></div>
        <svg class="graph-transform wires" :style="transformStyle" aria-hidden="true">
          <g v-for="edge in visibleEdges" :key="edge.uuid"><path :d="edgePath(edge)" :class="[edgeKind(edge), { active: graphDebugState.activeEdgeUuid === edge.uuid, selected:selectedEdgeUuid===edge.uuid, 'routing-pending':routingBusy&&!autoRoutes[edge.uuid] }]" /><path class="wire-hit" :data-edge-uuid="edge.uuid" :d="edgePath(edge)" @pointerdown.stop.prevent="selectEdge(edge.uuid)" @dblclick.stop.prevent="addRerouteAt($event,edge)" /></g>
          <path v-if="pendingWire && pointerGraph" :d="pendingPath" class="pending" />
        </svg>
        <div v-if="selectedEdge" class="graph-transform wire-points" :style="transformStyle"><button v-for="(point,index) in selectedEdge.reroutes" :key="index" class="wire-point" :data-reroute-index="index" :style="{left:point.x+'px',top:point.y+'px'}" :aria-label="layoutLabels.routingPoint+' '+(index+1)" @pointerdown.stop.prevent="startRerouteDrag($event,selectedEdge!,index)" @keydown="rerouteKeydown($event,selectedEdge!,index)"></button></div>
        <div class="graph-transform comments" :style="transformStyle">
          <article v-for="comment in activeScope.comments" :key="comment.uuid" class="graph-comment" :data-comment-uuid="comment.uuid" :class="{ collapsed: comment.collapsed }" :style="commentStyle(comment)" @pointerdown.stop="startCommentDrag($event, comment)"><header :style="{ borderColor: comment.color }"><input v-model="comment.text" :aria-label="t('graphComment')" maxlength="2048" @input="markDirtyLive" @change="markDirty"><button @click.stop="comment.collapsed = !comment.collapsed; markDirty()"><EditorIcon :name="comment.collapsed ? 'add' : 'remove'" /></button></header></article>
        </div>
        <div class="graph-transform nodes-layer" :style="transformStyle">
<!-- 节点引用回调将当前节点标识和挂载元素交给测量注册函数。 -->          <article v-for="node in visibleNodes" :key="node.uuid" :ref="element=>setNodeElement(node.uuid,element)" :data-node-uuid="node.uuid" :data-node-type="node.type" :tabindex="selectedNodes.has(node.uuid)||!selectedNodes.size&&node===visibleNodes[0]?0:-1" role="group" :aria-label="syntaxNodeTitle(node,preferencesState.locale)" class="graph-node" :class="[blockKind(node), `family-${scratchFamilyForNode(node)}`, { 'syntax-card':node.type.startsWith('rhai.'), selected: selectedNodes.has(node.uuid), collapsed: node.collapsed, breakpoint: hasBreakpoint(node.uuid), executing: graphDebugState.activeNodeUuid === node.uuid, failed: hasNodeError(node.uuid), covered: graphDebugState.coverage[node.uuid] > 0 }]" :style="nodeStyle(node)" @pointerdown.stop="selectNode($event,node)">
            <header :style="{ '--node-color': nodeColor(node) }" @pointerdown.stop="startNodeDrag($event,node)"><button class="breakpoint-toggle" :tabindex="selectedNodes.has(node.uuid)?0:-1" :title="t('toggleBreakpoint')" @pointerdown.stop @click.stop="toggleBreakpoint(node.uuid)"></button><i></i><strong>{{ syntaxNodeTitle(node,preferencesState.locale) }}</strong><span v-if="node.config.layoutPinned === true" :title="layoutLabels.pinnedPosition" :aria-label="layoutLabels.pinnedPosition"><EditorIcon name="pin" /></span><small>{{ localizedCategory(node.category) }}</small><button :tabindex="selectedNodes.has(node.uuid)?0:-1" :title="t('collapse')" @pointerdown.stop @click.stop="node.collapsed = !node.collapsed; markDirty()"><EditorIcon :name="node.collapsed ? 'add' : 'remove'" /></button></header>
            <div v-if="!node.collapsed" class="node-pins">
              <div v-for="pin in node.pins" :key="pin.uuid" class="node-pin" :class="[pin.direction,pin.kind]">
                <button class="pin-dot" :tabindex="selectedNodes.has(node.uuid)?0:-1" :data-pin-uuid="pin.uuid" :aria-label="`${syntaxNodeTitle(node,preferencesState.locale)}: ${syntaxPinLabel(node,pin,preferencesState.locale)}, ${pin.direction}, ${pin.valueType??pin.kind}`" :aria-pressed="pendingWire?.pin.uuid===pin.uuid" :class="[pin.valueType?.toLowerCase(), { compatible: compatiblePin(pin) }]" :title="`${syntaxPinLabel(node,pin,preferencesState.locale)} · ${pin.kind === 'execution' ? t('executionPin') : pin.valueType}`" @pointerdown.stop.prevent="startWire($event,node,pin)" @pointerup.stop="finishWire(node,pin)" @click.stop="pinClicked(node,pin)"></button>
                <span>{{ syntaxPinLabel(node,pin,preferencesState.locale) }}</span>
                <template v-if="pin.kind === 'data' && pin.direction === 'input' && !pinConnected(pin)">
                  <span v-if="node.type.startsWith('rhai.')" class="syntax-pin-fallback" :data-syntax-default="pin.key" :title="conversionLabels.connectValue">{{ syntaxInputFallback(node,pin) }}</span>
                  <template v-else><input v-if="pin.valueType === 'Number'" :value="pin.defaultValue" type="number" step="0.01" @input="updatePinNumber(pin,$event)" @change="setPinNumber(pin,$event)">
                  <input v-else-if="pin.valueType === 'Boolean'" :checked="pin.defaultValue === true" type="checkbox" @change="pin.defaultValue = ($event.target as HTMLInputElement).checked; markDirty()">
                  <div v-else-if="pin.valueType === 'Vec2'" class="vec-input"><input :value="vecPart(pin.defaultValue,0)" type="number" step="0.01" @input="updatePinVector(pin,0,$event)" @change="setPinVector(pin,0,$event)"><input :value="vecPart(pin.defaultValue,1)" type="number" step="0.01" @input="updatePinVector(pin,1,$event)" @change="setPinVector(pin,1,$event)"></div>
                  <input v-else :value="displayPinValue(pin.defaultValue)" type="text" @input="updatePinText(pin,$event)" @change="setPinText(pin,$event)"></template>
                </template>
                <template v-if="node.type.startsWith('literal.') && pin.direction === 'output'">
                  <input v-if="pin.valueType === 'Number'" :value="node.config.value" type="number" step="0.01" @input="updateLiteralNumber(node,$event)" @change="setLiteralNumber(node,$event)">
                  <input v-else-if="pin.valueType === 'Boolean'" :checked="node.config.value === true" type="checkbox" @change="node.config.value = ($event.target as HTMLInputElement).checked; markDirty()">
                  <div v-else-if="pin.valueType === 'Vec2'" class="vec-input"><input :value="vecPart(node.config.value,0)" type="number" step="0.01" @input="updateLiteralVector(node,0,$event)" @change="setLiteralVector(node,0,$event)"><input :value="vecPart(node.config.value,1)" type="number" step="0.01" @input="updateLiteralVector(node,1,$event)" @change="setLiteralVector(node,1,$event)"></div>
                  <input v-else :value="displayPinValue(node.config.value)" type="text" @input="updateLiteralText(node,$event)" @change="setLiteralText(node,$event)">
                </template>
              </div>
            </div>
            <select v-if="node.type.startsWith('variable.') && !node.collapsed" :value="node.config.variableUuid" @change="selectNodeVariable(node,$event)"><option value="">{{ t('selectVariable') }}</option><option v-for="variable in graph.variables" :key="variable.uuid" :value="variable.uuid">{{ variable.name }} · {{ variable.valueType }}</option></select>
            <select v-if="node.type.startsWith('local.') && activeRoutine && !node.collapsed" :value="node.config.localUuid" @change="selectNodeLocal(node,$event)"><option value="">{{ t('selectLocal') }}</option><option v-for="local in activeRoutine.locals" :key="local.uuid" :value="local.uuid">{{ local.name }} · {{ local.valueType }}</option></select>
            <section v-if="!node.collapsed && (node.type.startsWith('code.') || typeof node.config.rhaiSourceOverride === 'string')" class="node-source" @pointerdown.stop>
              <span>{{ node.config.rhaiSourceOverride ? t('linkedCodeOverride') : t('generatedRhai') }}</span>
              <textarea :value="nodeCodeSource(node)" spellcheck="false" @input="updateNodeCodeSource(node,$event)" @change="setNodeCodeSource(node,$event)"></textarea>
              <button v-if="node.config.rhaiSourceOverride" @click="clearNodeCodeOverride(node)">{{ t('clearCodeOverride') }}</button>
            </section>
            <div v-if="!node.collapsed && nodeLiveValues(node).length" class="node-live-values" aria-live="polite"><span v-for="item in nodeLiveValues(node)" :key="item[0]"><b>{{ item[0] }}</b><code>{{ item[1] }}</code></span></div>
          </article>
        </div>
        <div v-if="selectionBox" class="selection-box" :style="selectionBoxStyle"></div>
        <div class="canvas-controls" role="toolbar" :aria-label="t('graphNavigation')" @pointerdown.stop><UiButton type="button" :aria-label="t('zoomOut')" :title="t('zoomOut')" @click.stop="changeZoom(-.1)" icon="remove" :label="t('zoomOut')" /><UiSlider :precise="false" :aria-label="t('graphZoom')" :aria-valuetext="`${Math.round(activeScope.viewport.zoom * 100)}%`" :value="activeScope.viewport.zoom" min="0.1" max="4" step="0.05" @input="zoomSlider" /><button type="button" class="zoom-value" :aria-label="t('resetZoom')" :title="t('resetZoom')" @click.stop="resetZoom">{{ Math.round(activeScope.viewport.zoom * 100) }}%</button><UiButton type="button" :aria-label="t('zoomIn')" :title="t('zoomIn')" @click.stop="changeZoom(.1)" icon="add" :label="t('add')" /><UiButton type="button" :aria-label="t('frameAll')" :title="t('frameAll')" @click.stop="frameAll()" icon="frame" :label="t('frameAll')" /><UiButton type="button" :aria-label="t('minimap')" :title="t('minimap')" :class="{ active: studio.minimapOpen }" @click.stop="studio.minimapOpen = !studio.minimapOpen" icon="layout" :label="t('minimap')" /></div>
        <div class="graph-hint" aria-live="polite"><span>{{ wireMessage || layoutLabels.keyboardHelp }} · {{ t('graphZoom') }} {{ Math.round(activeScope.viewport.zoom * 100) }}%</span></div>
        <aside v-if="studio.minimapOpen" class="minimap" :class="{'small-minimap':canvasSize.width<650}" @pointerdown.stop><header>{{ t('minimap') }}</header><svg viewBox="0 0 200 120" @pointerdown.stop.prevent="navigateMinimap"><rect v-for="node in activeScope.nodes" :key="node.uuid" :x="miniX(node.position.x)" :y="miniY(node.position.y)" width="8" height="5" :class="{ selected: selectedNodes.has(node.uuid) }" /><rect class="viewport" v-bind="miniViewport" /></svg></aside>
        <UiButton v-if="!paneLayout.primaryVisible" type="button" class="open-palette" @pointerdown.stop @click.stop="openPalette" icon="add">{{ t('nodes') }}</UiButton>
      </main>

      <aside v-if="paneLayout.secondaryVisible" class="graph-details" :style="{width:paneLayout.secondaryWidth+'px'}">
        <header><strong>{{ t('graphDetails') }}</strong><UiButton :title="t('close')" @click="closeDetails" icon="close" :label="t('close')" /></header>
        <PanelResizeHandle v-if="!paneLayout.drawer" v-model="studio.layout.detailsWidth" orientation="vertical" :minimum="224" :maximum="Math.min(560,graphBodyWidth-440)" :reset-value="344" reverse :label="layoutLabels.resizeDetails" style="left:0;top:0;bottom:0" />
        <div class="graph-details-content">
        <section class="graph-symbol-search"><input v-model="symbolQuery" type="search" :aria-label="layoutLabels.nodeNavigation" :placeholder="layoutLabels.findSymbol"><button v-for="node in searchedNodes" :key="node.uuid" @click="focusDiagnostic({severity:'info',code:'node-search',message:'',nodeUuid:node.uuid})">{{ syntaxNodeTitle(node,preferencesState.locale) }} <small>{{ syntaxFields(node).name||node.type }}</small></button></section>
        <details data-ui-motion-disclosure class="wire-inspector" :open="!!selectedEdge"><summary>{{ layoutLabels.wires }} · {{ activeScope.edges.length }}</summary><p v-if="routingBusy" role="status">{{ layoutLabels.routingRunning }}</p>
          <p>{{ layoutLabels.wireHelp }}</p><input v-model="wireQuery" type="search" :aria-label="layoutLabels.wires" :placeholder="layoutLabels.findSymbol">
          <select :value="selectedEdgeUuid" :aria-label="layoutLabels.selectWire" @change="selectEdge(($event.target as HTMLSelectElement).value)"><option value="">{{ layoutLabels.selectWire }}</option><option v-for="edge in listedEdges" :key="edge.uuid" :value="edge.uuid">{{ edgeLabel(edge) }}</option></select>
          <small>{{ listedEdges.length }} / {{ activeScope.edges.length }}</small>
          <template v-if="selectedEdge"><button @click="disconnectEdge">{{ layoutLabels.disconnect }}</button><button :disabled="(selectedEdge.reroutes?.length??0)>=64" @click="addRerouteMidpoint">{{ layoutLabels.addRoutingPoint }}</button><button :disabled="!selectedEdge.reroutes?.length" @click="clearReroutes">{{ layoutLabels.clearReroutes }}</button>
            <div v-for="(point,index) in selectedEdge.reroutes" :key="index" class="reroute-row"><span>{{ layoutLabels.routingPoint }} {{ index+1 }}</span><label>X<input type="number" :value="point.x" :aria-label="layoutLabels.routingPoint+' '+(index+1)+' X'" @change="changeRerouteCoordinate(index,'x',$event)"></label><label>Y<input type="number" :value="point.y" :aria-label="layoutLabels.routingPoint+' '+(index+1)+' Y'" @change="changeRerouteCoordinate(index,'y',$event)"></label><UiButton :aria-label="layoutLabels.removeRoutingPoint+' '+(index+1)" @click="removeReroute(index)" icon="close" :label="t('close')" /></div>
          </template><p v-if="wireMessage" role="status">{{ wireMessage }}</p>
        </details>
        <section class="graph-summary"><label><span>{{ t('graphName') }}</span><input v-model="graph.name" maxlength="120" @change="markDirty"></label><div><span>Format {{ graph.version }}</span><span>Rhai API {{ graph.apiVersion }}</span></div></section>
        <section v-if="selectedSyntaxNode" class="syntax-fields">
          <strong>{{ conversionLabels.fields }} · {{ syntaxKindLabel(selectedSyntaxNode.type.slice(5),preferencesState.locale) }}</strong>
          <label v-for="field in syntaxNodeEditableFields(selectedSyntaxNode)" :key="field.key"><span>{{ syntaxFieldLabel(field.key,preferencesState.locale,field.label) }}</span>
            <input v-if="field.kind === 'boolean'" type="checkbox" :checked="field.value === true" @change="changeSyntaxField(field.key,($event.target as HTMLInputElement).checked)">
            <select v-else-if="field.kind === 'choice'" :value="field.value" @change="changeSyntaxField(field.key,($event.target as HTMLSelectElement).value)"><option v-for="option in field.options" :key="option" :value="option">{{ option }}</option></select>
            <input v-else :value="String(field.value ?? '')" maxlength="8192" @change="changeSyntaxField(field.key,($event.target as HTMLInputElement).value)">
          </label>
          <label v-for="option in syntaxNodeOptionalChildren(selectedSyntaxNode)" :key="option.field" class="syntax-optional"><input type="checkbox" :checked="option.enabled" @change="editSyntaxOptional(option.field,($event.target as HTMLInputElement).checked)"><span>{{ conversionLabels.optionalChild }} · {{ syntaxFieldLabel(option.field,preferencesState.locale,option.label) }}</span></label>
          <section v-for="list in syntaxNodeChildLists(selectedSyntaxNode)" :key="list.field" class="syntax-child-list">
            <strong>{{ conversionLabels.children }} · {{ syntaxFieldLabel(list.field,preferencesState.locale,list.label) }}</strong>
            <article v-for="(slot,index) in list.slots" :key="slot.key" :data-syntax-slot="slot.key"><span>{{ index+1 }} · {{ syntaxChildLabel(slot.key,slot.fallback) }}</span>
              <div><UiButton :aria-label="conversionLabels.moveUp+' '+syntaxFieldLabel(list.field,preferencesState.locale,list.label)+' '+(index+1)" :disabled="index===0" @click="editSyntaxChildren('up',slot.key)" icon="up" :label="t('moveUp')" /><UiButton :aria-label="conversionLabels.moveDown+' '+syntaxFieldLabel(list.field,preferencesState.locale,list.label)+' '+(index+1)" :disabled="index===list.slots.length-1" @click="editSyntaxChildren('down',slot.key)" icon="down" :label="t('moveDown')" /><UiButton :aria-label="conversionLabels.removeChild+' '+syntaxFieldLabel(list.field,preferencesState.locale,list.label)+' '+(index+1)" @click="editSyntaxChildren('remove',slot.key)" icon="close" :label="t('close')" /></div>
            </article>
            <UiButton icon="add" :disabled="selectedSyntaxNode.pins.length>=128" @click="editSyntaxChildren('add',list.field)">{{ conversionLabels.addChild }}</UiButton>
          </section>
          <p v-if="syntaxFieldError" role="alert">{{ syntaxFieldError }}</p>
          <button v-if="selectedSyntaxRegion" @click="navigateConversion({ target:'code',span:selectedSyntaxRegion.span,nodeUuid:selectedSyntaxNode.uuid,scopeUuid:selectedSyntaxRegion.scopeUuid })">{{ conversionLabels.code }}</button>
        </section>
        <details data-ui-motion-disclosure class="graph-conversion"><summary>{{ conversionLabels.title }}</summary><ScriptConversionPanel :assessment="conversionAssessment" :source="conversionSource" @navigate="navigateConversion" /></details>
        <section v-if="graph.language" class="syntax-fields">
          <strong>{{ conversionLabels.declarations }}</strong><p>{{ conversionLabels.declarationHelp }}</p>
          <button v-for="declaration in syntaxDeclarations" :key="declaration.uuid" @click="focusDiagnostic({ severity:'info',code:'syntax-declaration',message:'',nodeUuid:declaration.uuid })">{{ syntaxKindLabel(declaration.type.slice(5),preferencesState.locale) }} · {{ syntaxFields(declaration).name || syntaxFields(declaration).keyword || declaration.title }}</button>
          <UiButton @click="openPalette" icon="add">{{ t('nodePalette') }}</UiButton>
        </section>
        <GraphProductionPanel v-else :graph="graph" :scope-uuid="activeScopeUuid" :selected-node-uuids="[...selectedNodes]" :compiled-source="compileResult.source" @dirty="markDirty" @scope="setActiveScope" @replace-graph="replaceGraph" />
        <section v-if="!graph.language" class="variables"><header><strong>{{ t('graphVariables') }}</strong><UiButton @click="addVariable" icon="add" :label="t('add')" /></header><article v-for="variable in graph.variables" :key="variable.uuid"><div><input v-model="variable.name" maxlength="80" @change="normalizeVariable(variable)"><select v-model="variable.valueType" @change="variableTypeChanged(variable)"><option v-for="type in valueTypes" :key="type">{{ type }}</option></select><UiButton class="danger" @click="removeVariable(variable.uuid)" icon="close" :label="t('close')" /></div><label><input v-model="variable.exposed" type="checkbox" @change="markDirty"><span>{{ t('exposeInInspector') }}</span></label><input v-model="variable.group" :placeholder="t('group')" maxlength="80" @change="markDirty"><input v-model="variable.tooltip" :placeholder="t('tooltip')" maxlength="512" @change="markDirty"><div v-if="variable.valueType === 'Number'" class="number-metadata"><input v-model.number="variable.minimum" type="number" :placeholder="t('minimum')" @change="markDirty"><input v-model.number="variable.maximum" type="number" :placeholder="t('maximum')" @change="markDirty"><input v-model.number="variable.step" type="number" min="0.000001" :placeholder="t('step')" @change="markDirty"></div><input :value="displayPinValue(variable.defaultValue)" :placeholder="t('defaultValue')" @change="setVariableDefault(variable,$event)"></article><p v-if="!graph.variables.length">{{ t('noGraphVariables') }}</p></section>
        <section class="diagnostics"><header><strong>{{ t('validation') }}</strong><button @click="showCompiled = !showCompiled">{{ showCompiled ? t('problems') : t('generatedRhai') }}</button></header><template v-if="!showCompiled"><article v-for="(diagnostic,index) in validation.diagnostics" :key="`${diagnostic.code}:${diagnostic.nodeUuid}:${diagnostic.pinUuid}:${index}`" class="graph-diagnostic"><button :class="diagnostic.severity" @click="focusDiagnostic(diagnostic)"><i></i><span><strong>{{ diagnostic.code }}</strong><small>{{ graphDiagnosticMessage(diagnostic,preferencesState.locale) }}</small></span></button><details data-ui-motion-disclosure v-if="graphDiagnosticMessage(diagnostic,preferencesState.locale)!==diagnostic.message"><summary>{{ graphDiagnosticDetailsLabel(preferencesState.locale) }}</summary><pre>{{ diagnostic.message }}</pre></details></article><p v-if="!validation.diagnostics.length" class="valid"><EditorIcon name="check" /> {{ t('graphValidationPassed') }}</p></template><pre v-else>{{ compileResult.source || t('graphCannotCompile') }}</pre></section>
        </div>
      </aside>
      <button v-if="!paneLayout.secondaryVisible" class="open-details" @click="openDetails"><EditorIcon name="inspector" /> {{ t('graphDetails') }}</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import UiButton from '../ui/components/UiButton.vue'
import EditorIcon from './EditorIcon.vue'
import { computed, nextTick, onActivated, onDeactivated, onBeforeUnmount, onMounted, reactive, ref, shallowRef, triggerRef, watch } from 'vue'
import { assetState, createTextAsset, readTextAsset } from '../assets/AssetDatabase'
import { addEditorLog } from '../store/editor'
import { pushHistory } from '../store/physics'
import { t } from '../i18n'
import { createGraphNode, defaultVisualGraph, graphNodeDefinition, searchGraphNodeCatalog, type GraphNodeDefinition } from '../visual/graphCatalog'
import { compileGraph, type GraphDiagnostic } from '../visual/graphCompiler'
import { takeInitialGraphLayout, graphStudioState as studio, openGraphAsset } from '../visual/graphStudioState'
import { defaultGraphValue, graphUuid, parseGraphDocument, serializeGraphDocument, type GraphCanvasScope, type GraphComment, type GraphEdge, type GraphNode, type GraphPin, type GraphValue, type GraphValueType, type GraphVariable, type NovaGraphDocument } from '../visual/graphTypes'
import { graphDebugState } from '../visual/graphDebugger'
import { assessRhaiConversion, createGraphFromRhaiSource, ensureLinkedScriptForGraph, commitLinkedGraphAsset } from '../visual/graphCodeSync'
import { addSyntaxChildSlot, moveSyntaxChildSlot, removeSyntaxChildSlot, setSyntaxOptionalChild, syntaxFields, syntaxSlots, syntaxNodeChildLists, syntaxNodeEditableFields, syntaxNodeOptionalChildren, setSyntaxNodeField } from '../visual/graphSyntaxSchema'
import { preferencesState } from '../store/preferences'
import { conversionCopy, type ConversionNavigation, type ConversionSnapshot } from '../editor/scriptConversionPresentation'
import ScriptConversionPanel from './ScriptConversionPanel.vue'
import GraphProductionPanel from './GraphProductionPanel.vue'
import { gameplayRuntime } from '../editor/gameplayRuntime'
import { availableGraphPosition, dragGraphPoint, focalGraphZoom, panGraphViewport, stepGraphZoom, useLowDetailGraph, wheelGraphZoom } from '../visual/graphInteraction'
import PanelResizeHandle from './PanelResizeHandle.vue'
import {studioPaneLayout} from '../editor/studioPaneLayout'
import {studioLayoutCopy} from '../editor/studioLayoutCopy'
import { graphStatusMessage, type GraphStatusMessage } from '../editor/graphStatusCopy'
import {requestGraphLayout} from '../visual/graphLayoutService'
import {retainGraphMeasurements} from '../visual/graphMeasurements'
import { graphPaletteTitle, syntaxKindLabel, syntaxNodeTitle, syntaxNodeHelp, syntaxFieldLabel, syntaxPinLabel, syntaxCategoryLabel } from '../editor/graphSyntaxCopy'
import { graphDiagnosticMessage, graphDiagnosticDetailsLabel } from '../editor/graphDiagnosticCopy'
import type {GraphLayoutDiagnostic} from '../visual/graphLayoutEngine'
import {graphEditorNodeSize,graphEditorPinPoint,graphPolylinePath,nearestGraphNode,placeGraphComment,type MeasuredGraphSize} from '../visual/graphEditorGeometry'
import type {GraphPoint} from '../visual/graphTypes'
import {changeWireReroute,insertWireReroute} from '../visual/graphWireEditing'
import {projectSessionState} from '../projects/projectSession'
import {retainStudioDraft,readStudioDraft,clearStudioDraft,registerStudioDraftOwner,type StudioDraftCandidate} from '../editor/studioDraftRetention'
import StudioDraftConflict from './StudioDraftConflict.vue'

const editorRoot = ref<HTMLElement | null>(null), graphBody = ref<HTMLElement | null>(null), canvas = ref<HTMLElement | null>(null), paletteInput = ref<HTMLInputElement | null>(null)
const graph = shallowRef<NovaGraphDocument>(defaultVisualGraph()), dirty = ref(false), loadedAssetUuid = ref(''), paletteSearch = ref(''), showCompiled = ref(false), blockFamily = ref('Events')
const activeScopeUuid = ref('main')
const emit = defineEmits<{ navigate: [request: ConversionNavigation] }>()
const conversionLabels = computed(/* 返回 conversionCopy[preferencesState.locale] 的当前值。 */ () => conversionCopy[preferencesState.locale])
const syntaxFieldError = ref('')
const graphSaveError = ref('')
const selectedNodes = reactive(new Set<string>()), pendingWire = shallowRef<{ node: GraphNode; pin: GraphPin } | null>(null), pointerGraph = shallowRef<{ x: number; y: number } | null>(null)
const selectedEdgeUuid=ref(''),wireQuery=ref(''),wireStatus=ref<GraphStatusMessage>('')
const selectedEdge=computed(/** 按当前标识查找选中连线。 */ ()=>activeScope.value.edges.find(/* 比较 edge.uuid 与 selectedEdgeUuid.value，返回严格相等的判断结果。 */ edge=>edge.uuid===selectedEdgeUuid.value)??null)
const listedEdges=computed(/** 按标签或标识搜索最多二百条连线，并始终保留当前选中项。 */ ()=>{const query=wireQuery.value.toLocaleLowerCase(),items=activeScope.value.edges.filter(/* 先计算 !query||edgeLabel(edge).toLocaleLowerCase().includes(query)；仅当其为假值时求右侧 edge.uuid.includes(query)，返回短路求值结果。 */ edge=>!query||edgeLabel(edge).toLocaleLowerCase().includes(query)||edge.uuid.includes(query)).slice(0,200);if(selectedEdge.value&&!items.includes(selectedEdge.value))items.unshift(selectedEdge.value);return items})
const history = ref<string[]>([]), historyIndex = ref(-1), restoring = ref(false), canvasSize = reactive({ width: 900, height: 600 })
const selectionBox = ref<{ startX: number; startY: number; x: number; y: number; width: number; height: number } | null>(null)
const paletteAnchor = ref<{ x: number; y: number } | null>(null), isPanning = ref(false), compactLayout = ref(false)
const graphBodyWidth=ref(1200),symbolQuery=ref(''),layoutRunning=ref(false),routingBusy=ref(false),layoutStatus=ref<GraphStatusMessage>('')
const layoutDiagnostics=shallowRef<GraphLayoutDiagnostic[]>([])
const wireMessage=computed(/** 根据当前语言展示连线状态，不缓存翻译结果。 */ ()=>graphStatusMessage(wireStatus.value,preferencesState.locale))
const layoutMessage=computed(/** 根据当前语言展示布局进度、结果和诊断。 */ ()=>graphStatusMessage(layoutStatus.value,preferencesState.locale))
const layoutLabels=computed(/* 返回 studioLayoutCopy[preferencesState.locale] 的当前值。 */ ()=>studioLayoutCopy[preferencesState.locale])
const paneLayout=computed(/** 根据工作区宽度和面板状态计算图编辑器分栏。 */ ()=>studioPaneLayout({width:graphBodyWidth.value,primaryOpen:studio.paletteOpen,secondaryOpen:studio.detailsOpen,primaryWidth:studio.layout.paletteWidth,secondaryWidth:studio.layout.detailsWidth,activePanel:studio.layout.activePanel==='palette'?'primary':'secondary',focused:studio.layout.canvasFocused}))
const measuredBounds=shallowRef<Record<string,MeasuredGraphSize>>({}),measuredPorts=shallowRef<Record<string,GraphPoint>>({}),autoRoutes=shallowRef<Record<string,GraphPoint[]>>({})
const nodeElements=new Map<string,HTMLElement>()
let nodeObserver:ResizeObserver|null=null,measurementFrame=0,layoutController:AbortController|null=null
let cancelPointerGesture:(()=>void)|null=null
const initialLayoutState=ref('');let initialLayoutPending=false,initialLayoutInFlight=false,initialLayoutEpoch=0
let geometryRevision=0,routingTimer:ReturnType<typeof setTimeout>|undefined,routingController:AbortController|null=null,editorDisposed=false,editorActive=true
let resizeObserver: ResizeObserver | null = null, compileTimer: number | undefined, viewportHistoryTimer: number | undefined, visualFrame = 0, pointerFrame = 0, queuedVisualUpdate: (() => void) | null = null, queuedPointerEvent: PointerEvent | null = null

const graphAssets = computed(/** 随资源变化筛选可视脚本并按路径排序。 */ () => { void assetState.generation; return assetState.records.filter(/* 比较 asset.assetType 与 'visualScript'，返回严格相等的判断结果。 */ asset => asset.assetType === 'visualScript').sort(/* 调用 a.path.localeCompare(b.path) 并返回调用结果。 */ (a,b) => a.path.localeCompare(b.path)) })
const activeAsset = computed(/** 按已加载或工作区活动标识解析当前图资源。 */ () => graphAssets.value.find(/* 比较 asset.uuid 与 (loadedAssetUuid.value || studio.activeGraphUuid)，返回严格相等的判断结果。 */ asset => asset.uuid === (loadedAssetUuid.value || studio.activeGraphUuid)) ?? null)
const draftProjectId=projectSessionState.id,loadedBaseSource=ref<string|null>(null)
const savedGraphSource=computed(/** 随资源代数变化读取当前已保存图源码。 */ ()=>{void assetState.generation;return activeAsset.value?readTextAsset(activeAsset.value.uuid):null})
const graphDraftConflict=computed(/* 先计算 dirty.value；仅当其为真值时求右侧 savedGraphSource.value!==loadedBaseSource.value，返回短路求值结果。 */ ()=>dirty.value&&savedGraphSource.value!==loadedBaseSource.value)
/** 为脏图生成包含历史、作用域和选择状态的恢复草稿。 */ function graphDraftCandidate():StudioDraftCandidate|null {return dirty.value&&activeAsset.value?{record:activeAsset.value,projectId:draftProjectId,kind:'graph',source:JSON.stringify(graph.value),baseSource:loadedBaseSource.value,editorState:{history:history.value,historyIndex:historyIndex.value,scope:activeScopeUuid.value,selection:[...selectedNodes],edge:selectedEdgeUuid.value}}:null}
const unregisterDraftOwner=registerStudioDraftOwner({read:graphDraftCandidate,discard:/** 放弃图草稿失败时将保存错误抛给恢复调用方。 */ ()=>{if(!discardGraphDraft())throw Error(graphSaveError.value)}})
/** 接受最新保存内容为草稿基线并保留当前草稿。 */ function acceptGraphDraftBase(){loadedBaseSource.value=savedGraphSource.value;graphSaveError.value='';const candidate=graphDraftCandidate();if(candidate)retainStudioDraft(candidate)}
/** 校验保存图后清除草稿并重新打开，失败时保留错误信息。 */ function discardGraphDraft(){const asset=activeAsset.value;if(!asset)return false;try{const source=readTextAsset(asset.uuid);if(source===null)throw Error(conversionLabels.value.failed);parseGraphDocument(source);dirty.value=false;clearStudioDraft(asset,draftProjectId);openGraph(asset.uuid);graphSaveError.value='';return true}catch(error){graphSaveError.value=error instanceof Error?error.message:String(error);return false}}
const activeRoutine = computed(/** 按作用域标识查找当前例程。 */ () => graph.value.routines.find(/* 比较 routine.uuid 与 activeScopeUuid.value，返回严格相等的判断结果。 */ routine => routine.uuid === activeScopeUuid.value) ?? null)
const activeScope = computed<GraphCanvasScope>(/* 当 activeRoutine.value 为 null 或 undefined 时返回 graph.value，否则保留左侧值。 */ () => activeRoutine.value ?? graph.value)
const searchedNodes=computed(/** 按符号查询搜索当前作用域节点并限制六十项。 */ ()=>{const query=symbolQuery.value.trim().toLowerCase();return query?activeScope.value.nodes.filter(/** 匹配节点本地化标题、原标题、类型及语法名称。 */ node=>`${syntaxNodeTitle(node,preferencesState.locale)} ${node.title} ${node.type} ${syntaxFields(node).name??''}`.toLowerCase().includes(query)).slice(0,60):[]})
const compileResult = shallowRef(compileGraph(graph.value)), validation = computed(/* 返回 compileResult.value 的当前值。 */ () => compileResult.value), errorCount = computed(/* 返回 validation.value.diagnostics.filter(item => item.severity === 'error').length 的当前值。 */ () => validation.value.diagnostics.filter(/* 比较 item.severity 与 'error'，返回严格相等的判断结果。 */ item => item.severity === 'error').length)
const conversionSource = computed(/* 返回 compileResult.value.source 的当前值。 */ () => compileResult.value.source)
const conversionAssessment = computed(/** 评估生成源码转换覆盖，编译无效时同步标记评估无效。 */ () => {
  const assessment = assessRhaiConversion(conversionSource.value,compileResult.value.graph.name,compileResult.value.graph)
  return compileResult.value.valid ? assessment : { ...assessment, valid: false }
})
const selectedSyntaxNode = computed(/* 调用 activeScope.value.nodes.find(node => selectedNodes.has(node.uuid) && node.type.startsWith('rhai.')) 并返回调用结果。 */ () => activeScope.value.nodes.find(/* 先计算 selectedNodes.has(node.uuid)；仅当其为真值时求右侧 node.type.startsWith('rhai.')，返回短路求值结果。 */ node => selectedNodes.has(node.uuid) && node.type.startsWith('rhai.')))
const syntaxDeclarations = computed(/** 列出顶层变量、函数、模块和导出声明节点。 */ () => graph.value.nodes.filter(/** 判断节点是否属于可列出的声明类型。 */ node => ['rhai.VariableDeclaration','rhai.FunctionDeclaration','rhai.ModuleDeclaration','rhai.ExportDeclaration'].includes(node.type)))
const selectedSyntaxRegion = computed(/** 查找选中语法节点对应的源码转换区域。 */ () => conversionAssessment.value.regions.find(/* 比较 region.nodeUuid 与 selectedSyntaxNode.value?.uuid，返回严格相等的判断结果。 */ region => region.nodeUuid === selectedSyntaxNode.value?.uuid))
/** 立即编译后生成当前资源的转换快照。 */ function getConversionSnapshot(): ConversionSnapshot | null { compileNow(); return activeAsset.value ? { source: conversionSource.value,assetUuid:activeAsset.value.uuid,assessment:conversionAssessment.value } : null }
/** 将转换节点请求适配为图诊断定位。 */ function focusConversionNode(request: ConversionNavigation) { focusDiagnostic({ severity:'info',code:'conversion-navigation',message:'',nodeUuid:request.nodeUuid,scopeUuid:request.scopeUuid }) }
/** 图目标直接定位节点；源码目标重新编译后更新范围并发出导航事件。 */ function navigateConversion(request: ConversionNavigation) { if (request.target === 'graph') focusConversionNode(request); else { compileNow(); const current = request.nodeUuid ? conversionAssessment.value.regions.find(/* 比较 region.nodeUuid 与 request.nodeUuid，返回严格相等的判断结果。 */ region => region.nodeUuid === request.nodeUuid) : undefined; emit('navigate',{...request,span:current?.span ?? request.span}) } }
/** 更新语法字段，重命名时考虑其他脚本源码；失败显示语法错误。 */ function changeSyntaxField(key:string,value:string|boolean) { if (!selectedSyntaxNode.value) return; syntaxFieldError.value=''; try { setSyntaxNodeField(selectedSyntaxNode.value,key,value,graph.value,key==='name'?assetState.records.filter(/* 先计算 asset.assetType==='script'；仅当其为真值时求右侧 asset.script?.linkedGraphUuid!==graph.value.uuid，返回短路求值结果。 */ asset=>asset.assetType==='script'&&asset.script?.linkedGraphUuid!==graph.value.uuid).map(/* 当 readTextAsset(asset.uuid) 为 null 或 undefined 时返回 ''，否则保留左侧值。 */ asset=>readTextAsset(asset.uuid)??''):[]); markDirty() } catch(error) { syntaxFieldError.value=error instanceof Error?error.message:String(error) } }
/** 子列表显示共享本地化节点标题；作者改写的名称与空槽提示保持各自的显示契约。 */
function syntaxChildLabel(key:string,fallback:string):string {
  const pin=selectedSyntaxNode.value?.pins.find(/** 通过稳定槽键找到输入端口。 */ item=>item.key===key)
  const edge=pin?activeScope.value.edges.find(/** 定位此输入当前连接的子节点。 */ item=>item.to.pinUuid===pin.uuid):undefined
  if(edge){const node=activeScope.value.nodes.find(/** 读取连接来源的实际节点。 */ item=>item.uuid===edge.from.nodeUuid);return node?syntaxNodeTitle(node,preferencesState.locale):edge.from.nodeUuid}
  return fallback?conversionLabels.value.defaultChild+': '+fallback:conversionLabels.value.emptySlot
}
/** 取得输入语法槽的回退文本，没有回退时提示连接数值。 */ function syntaxInputFallback(node:GraphNode,pin:GraphPin):string { return syntaxSlots(node).find(/* 比较 slot.key 与 pin.key，返回严格相等的判断结果。 */ slot=>slot.key===pin.key)?.fallback||conversionLabels.value.connectValue }
/** 添加、删除或移动语法子槽，成功后标记草稿。 */ function editSyntaxChildren(action:'add'|'remove'|'up'|'down',key:string) { const node=selectedSyntaxNode.value;if(!node)return;syntaxFieldError.value='';try{if(action==='add')addSyntaxChildSlot(node,key);else if(action==='remove')removeSyntaxChildSlot(graph.value,node,key);else if(!moveSyntaxChildSlot(node,key,action==='up'?-1:1))return;markDirty()}catch(error){syntaxFieldError.value=error instanceof Error?error.message:String(error)} }
/** 启用或禁用可选语法子节点，失败显示错误。 */ function editSyntaxOptional(field:string,enabled:boolean) { const node=selectedSyntaxNode.value;if(!node)return;syntaxFieldError.value='';try{setSyntaxOptionalChild(graph.value,node,field,enabled);markDirty()}catch(error){syntaxFieldError.value=error instanceof Error?error.message:String(error)} }
/** 保存原草稿后创建起始函数语法图及关联脚本，并打开新资源。 */ function createSyntaxGraph() {
  if (dirty.value && !saveGraph()) return
  const document = createGraphFromRhaiSource('fn start() {}\n',conversionLabels.value.newGraph)
  const asset = createTextAsset(conversionLabels.value.newGraph,'visualScript',serializeGraphDocument(document),'Assets/Visual Scripts')
  ensureLinkedScriptForGraph(document); pushHistory('Create Rhai syntax graph and linked source'); openGraphAsset(asset.uuid); openGraph(asset.uuid)
}
defineExpose({ getConversionSnapshot, focusConversionNode })
const canUndo = computed(/* 比较 historyIndex.value 与 0，返回大于的判断结果。 */ () => historyIndex.value > 0), canRedo = computed(/* 先计算 historyIndex.value >= 0；仅当其为真值时求右侧 historyIndex.value < history.value.length - 1，返回短路求值结果。 */ () => historyIndex.value >= 0 && historyIndex.value < history.value.length - 1)
const valueTypes: GraphValueType[] = ['Boolean','Number','String','Vec2','Entity','Resource','Data']
const scratchFamilies = [
  {id:'Motion',label:'blockMotion',color:'#4c97ff'},{id:'Looks',label:'blockLooks',color:'#9966ff'},{id:'Sound',label:'blockSound',color:'#cf63cf'},
  {id:'Events',label:'blockEvents',color:'#ffbf00'},{id:'Control',label:'blockControl',color:'#ffab19'},{id:'Sensing',label:'blockSensing',color:'#5cb1d6'},
  {id:'Operators',label:'blockOperators',color:'#59c059'},{id:'Variables',label:'blockVariables',color:'#ff8c1a'},{id:'MyBlocks',label:'blockMyBlocks',color:'#ff6680'},{id:'Extensions',label:'blockExtensions',color:'#0fbd8c'}
] as const
const familyColor = Object.fromEntries(scratchFamilies.map(/* 返回按声明顺序构造的数组 [item.id,item.color]。 */ item=>[item.id,item.color])) as Record<string,string>
/** 将节点目录分类映射到积木面板的运动、外观等家族。 */ function scratchFamily(category:string):string { if(category==='Transform')return'Motion';if(['UI','Animation','Scene'].includes(category))return'Looks';if(category==='Audio')return'Sound';if(['Events','Signals'].includes(category))return'Events';if(['Flow','Timing'].includes(category))return'Control';if(['Input','Physics','Gameplay'].includes(category))return'Sensing';if(['Math','Comparison','Conversion','Values'].includes(category))return'Operators';if(['Variables','Save'].includes(category))return'Variables';if(category==='Functions')return'MyBlocks';return'Extensions' }
/* 调用 scratchFamily(node.category) 并返回调用结果。 */ function scratchFamilyForNode(node:GraphNode){return scratchFamily(node.category)}
const paletteResults = computed(/** 按查询和积木家族筛选节点目录，限制二百四十项。 */ () => searchGraphNodeCatalog(paletteSearch.value, graph.value, activeRoutine.value).filter(/* 先计算 studio.authoringMode!=='blocks'||paletteSearch.value.trim()；仅当其为假值时求右侧 scratchFamily(item.category)===blockFamily.value，返回短路求值结果。 */ item=>studio.authoringMode!=='blocks'||paletteSearch.value.trim()||scratchFamily(item.category)===blockFamily.value).slice(0,240))
const paletteGroups = computed(/** 按目录分类组织搜索节点列表。 */ () => { const groups = new Map<string, GraphNodeDefinition[]>(); for (const item of paletteResults.value) groups.set(item.category, [...(groups.get(item.category) ?? []), item]); return [...groups].map(/** 将分类映射转换为分类名和节点列表。 */ ([category,items]) => ({category,items})) })
const transformStyle = computed(/** 根据作用域视口生成节点容器平移和缩放样式。 */ () => { void graph.value; return { transform: `translate(${activeScope.value.viewport.x}px,${activeScope.value.viewport.y}px) scale(${activeScope.value.viewport.zoom})` } })
const gridStyle = computed(/** 按视口缩放和平移计算背景网格尺寸与相位。 */ () => { void graph.value; const size = 24 * activeScope.value.viewport.zoom; return { backgroundSize: `${size}px ${size}px`, backgroundPosition: `${activeScope.value.viewport.x % size}px ${activeScope.value.viewport.y % size}px` } })
const visibleNodes = computed(/** 节点较少时全部显示；大图仅显示视口缓冲区内及选中节点。 */ () => { void graph.value; if (activeScope.value.nodes.length <= 300) return activeScope.value.nodes; const z = activeScope.value.viewport.zoom, margin = 400, left = -activeScope.value.viewport.x / z - margin, top = -activeScope.value.viewport.y / z - margin, right = left + canvasSize.width / z + margin * 2, bottom = top + canvasSize.height / z + margin * 2; return activeScope.value.nodes.filter(/** 保留选中节点或与扩展视口相交的节点。 */ node => selectedNodes.has(node.uuid) || node.position.x + node.size.width >= left && node.position.x <= right && node.position.y + node.size.height >= top && node.position.y <= bottom) })
const visibleNodeIds = computed(/** 建立当前可见节点标识集合。 */ () => { void graph.value; return new Set(visibleNodes.value.map(/* 返回 node.uuid 的当前值。 */ node => node.uuid)) })
const visibleEdges = computed(/** 保留至少一端节点可见的连线。 */ () => { void graph.value; return activeScope.value.edges.filter(/* 先计算 visibleNodeIds.value.has(edge.from.nodeUuid)；仅当其为假值时求右侧 visibleNodeIds.value.has(edge.to.nodeUuid)，返回短路求值结果。 */ edge => visibleNodeIds.value.has(edge.from.nodeUuid) || visibleNodeIds.value.has(edge.to.nodeUuid)) })
const activeNodeIndex = computed(/** 建立当前作用域节点标识到节点的索引。 */ () => { void graph.value; return new Map(activeScope.value.nodes.map(/* 返回按声明顺序构造的数组 [node.uuid,node]。 */ node => [node.uuid,node])) })
const connectedInputPins = computed(/** 收集所有已连接输入端口标识。 */ () => { void graph.value; return new Set(activeScope.value.edges.map(/* 返回 edge.to.pinUuid 的当前值。 */ edge => edge.to.pinUuid)) })
const lowDetail = computed(/** 按节点数量与缩放决定是否使用低细节显示。 */ () => { void graph.value; return useLowDetailGraph(activeScope.value.nodes.length, activeScope.value.viewport.zoom) })
const minimapBounds = computed(/** 计算包含实际节点尺寸的缩略图边界，空图使用单位范围。 */ () => { void graph.value; const nodes=activeScope.value.nodes;if(!nodes.length)return{minX:0,minY:0,width:1,height:1};let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const node of nodes){const size=nodeSize(node);minX=Math.min(minX,node.position.x);minY=Math.min(minY,node.position.y);maxX=Math.max(maxX,node.position.x+size.width);maxY=Math.max(maxY,node.position.y+size.height)}return{minX,minY,width:Math.max(1,maxX-minX),height:Math.max(1,maxY-minY)} })
const miniViewport = computed(/** 把主视口映射到缩略图并限制框尺寸与位置。 */ () => { void graph.value; const bounds=minimapBounds.value,viewport=activeScope.value.viewport,worldX=-viewport.x/viewport.zoom,worldY=-viewport.y/viewport.zoom,worldWidth=canvasSize.width/viewport.zoom,worldHeight=canvasSize.height/viewport.zoom,width=Math.min(184,Math.max(4,worldWidth/bounds.width*184)),height=Math.min(94,Math.max(4,worldHeight/bounds.height*94)),x=Math.min(192-width,Math.max(8,8+(worldX-bounds.minX)/bounds.width*184)),y=Math.min(112-height,Math.max(18,18+(worldY-bounds.minY)/bounds.height*94));return{x,y,width,height} })
const liveNodeValueMap=computed(/** 读取当前图的节点执行追踪，每节点保留首条及最多六个截断数值。 */ ()=>{void graphDebugState.revision;const result=new Map<string,Array<[string,string]>>();for(const entry of graphDebugState.trace){if(entry.graphUuid!==graph.value.uuid||!entry.nodeUuid||result.has(entry.nodeUuid))continue;result.set(entry.nodeUuid,Object.entries(entry.values).slice(0,6).map(/* 返回按声明顺序构造的数组 [name,typeof value==='string'?value.slice(0,80):JSON.stringify(value)?.slice(0,80)??String(value)]。 */ ([name,value])=>[name,typeof value==='string'?value.slice(0,80):JSON.stringify(value)?.slice(0,80)??String(value)]))}return result})

/* 调用 serializeGraphDocument(graph.value) 并返回调用结果。 */ function snapshot(): string { return serializeGraphDocument(graph.value) }
/** 取消待编译计时器并立即编译当前图。 */ function compileNow(){if(compileTimer!==undefined){window.clearTimeout(compileTimer);compileTimer=undefined}compileResult.value=compileGraph(graph.value)}
/** 合并编译请求并在指定延迟后执行。 */ function scheduleCompile(delay=55){if(!editorActive)return;if(compileTimer!==undefined)window.clearTimeout(compileTimer);compileTimer=window.setTimeout(compileNow,delay)}
/** 记录去重后的图快照，截断重做分支并保留最多一百项历史。 */ function recordHistory() { if (restoring.value) return; const value = snapshot(); if (history.value[historyIndex.value] === value) return; history.value = history.value.slice(0, historyIndex.value + 1); history.value.push(value); if (history.value.length > 100) history.value.shift(); historyIndex.value = history.value.length - 1 }
/** 失效连线路由、标记脏状态，安排编译并记录历史和测量。 */ function markDirty() { invalidateRouting();dirty.value = true; triggerRef(graph); scheduleCompile(); recordHistory();queueNodeMeasurements() }
/** 实时编辑时失效路由并延迟编译，暂不新增历史快照。 */ function markDirtyLive() { invalidateRouting();dirty.value = true; triggerRef(graph); scheduleCompile(140);queueNodeMeasurements() }
/** 每显示帧仅执行最新视觉更新并触发图刷新。 */ function queueVisual(update: () => void) { queuedVisualUpdate = update; if (visualFrame) return; visualFrame = requestAnimationFrame(/** 清空视觉任务状态，执行最新更新并刷新图引用。 */ () => { visualFrame = 0; const action = queuedVisualUpdate; queuedVisualUpdate = null; action?.(); triggerRef(graph) }) }
/** 取消排队帧并立即执行最新视觉更新。 */ function flushVisualQueue() { if (visualFrame) cancelAnimationFrame(visualFrame); visualFrame = 0; const action = queuedVisualUpdate; queuedVisualUpdate = null; action?.(); triggerRef(graph) }
/** 将视口修改标记为脏并记录快照。 */ function commitViewportHistory() { dirty.value = true; recordHistory() }
/** 结束视口防抖任务，按参数决定是否提交历史。 */ function finishViewportHistory(record=true){if(viewportHistoryTimer===undefined)return;window.clearTimeout(viewportHistoryTimer);viewportHistoryTimer=undefined;if(record)commitViewportHistory()}
/** 合并连续视口变化，在一百八十毫秒后记录历史。 */ function scheduleViewportHistory(){if(viewportHistoryTimer!==undefined)window.clearTimeout(viewportHistoryTimer);viewportHistoryTimer=window.setTimeout(/** 清除视口计时器标识并提交历史。 */ ()=>{viewportHistoryTimer=undefined;commitViewportHistory()},180)}
/** 从快照恢复图，修正失效作用域和选择，重新编译与测量。 */ function restore(source: string) { restoring.value = true;graph.value = parseGraphDocument(source);invalidateRouting(); if (activeScopeUuid.value !== 'main' && !graph.value.routines.some(/* 比较 item.uuid 与 activeScopeUuid.value，返回严格相等的判断结果。 */ item => item.uuid === activeScopeUuid.value)) activeScopeUuid.value = 'main';for(const uuid of selectedNodes)if(!activeScope.value.nodes.some(/* 比较 node.uuid 与 uuid，返回严格相等的判断结果。 */ node=>node.uuid===uuid))selectedNodes.delete(uuid); pendingWire.value = null; compileNow(); nextTick(/** 恢复渲染完成后结束恢复标记并安排节点测量。 */ () => { restoring.value = false;queueNodeMeasurements() }) }
/** 取消拖动和布局后向前恢复撤销快照。 */ function undo() { cancelPointerGesture?.();cancelGraphLayout();finishViewportHistory(false);if (!canUndo.value) return; historyIndex.value--; restore(history.value[historyIndex.value]); dirty.value = true }
/** 取消拖动和布局后向后恢复重做快照。 */ function redo() { cancelPointerGesture?.();cancelGraphLayout();finishViewportHistory(false);if (!canRedo.value) return; historyIndex.value++; restore(history.value[historyIndex.value]); dirty.value = true }

/** 切换图前保存旧草稿，加载资源及恢复状态，初始化布局与测量并编译。 */ function openGraph(uuid:string){
  cancelPointerGesture?.();cancelGraphLayout();finishViewportHistory()
  if(uuid!==loadedAssetUuid.value&&dirty.value&&!saveGraph()){studio.activeGraphUuid=loadedAssetUuid.value;return}
  const asset=assetState.records.find(/* 先计算 item.uuid===uuid；仅当其为真值时求右侧 item.assetType==='visualScript'，返回短路求值结果。 */ item=>item.uuid===uuid&&item.assetType==='visualScript'),source=readTextAsset(uuid)
  if(!asset||source===null){studio.activeGraphUuid=loadedAssetUuid.value;return}
  try{
    const recovery=readStudioDraft(asset,draftProjectId,'graph',source),fresh=takeInitialGraphLayout(asset);initialLayoutEpoch++;initialLayoutInFlight=false;initialLayoutPending=fresh&&!recovery;initialLayoutState.value=initialLayoutPending?'waiting':''
    graph.value=parseGraphDocument(recovery?.entry.source??source);loadedBaseSource.value=recovery?recovery.entry.baseSource:source
    if(graph.value.language)blockFamily.value='Extensions'
    loadedAssetUuid.value=uuid;activeScopeUuid.value='main';measuredBounds.value={};measuredPorts.value={};invalidateRouting();selectedEdgeUuid.value='';selectedNodes.clear();studio.activeGraphUuid=uuid;assetState.selectedGuid=uuid;dirty.value=!!recovery;history.value=[snapshot()];historyIndex.value=0
    if(recovery?.entry.editorState){try{const view=recovery.entry.editorState as {history:string[];historyIndex:number;scope:string;selection:string[];edge:string};if(Array.isArray(view.history)&&view.history.every(/* 比较 typeof item 与 'string'，返回严格相等的判断结果。 */ (item:unknown)=>typeof item==='string')&&Number.isInteger(view.historyIndex)&&view.historyIndex>=0&&view.historyIndex<view.history.length){history.value=view.history;historyIndex.value=view.historyIndex}if(view.scope==='main'||graph.value.routines.some(/* 比较 item.uuid 与 view.scope，返回严格相等的判断结果。 */ item=>item.uuid===view.scope))activeScopeUuid.value=view.scope;for(const id of Array.isArray(view.selection)?view.selection:[])if(activeScope.value.nodes.some(/* 比较 node.uuid 与 id，返回严格相等的判断结果。 */ node=>node.uuid===id))selectedNodes.add(id);if(activeScope.value.edges.some(/* 比较 edge.uuid 与 view.edge，返回严格相等的判断结果。 */ edge=>edge.uuid===view.edge))selectedEdgeUuid.value=view.edge}catch{/* Source recovery is independent of optional view state. */}}
    nextTick(queueNodeMeasurements);compileNow()
  }catch(error){studio.activeGraphUuid=loadedAssetUuid.value;addEditorLog(error instanceof Error?error.message:String(error),'Script','error',uuid)}
}
/** 保存旧草稿后创建默认图和关联源码，并打开和记录创建结果。 */ function createGraph() { if(dirty.value&&!saveGraph())return;const document = defaultVisualGraph(t('newVisualGraph')); const asset = createTextAsset(t('newVisualGraph'), 'visualScript', serializeGraphDocument(document), 'Assets/Visual Scripts'); const linked=ensureLinkedScriptForGraph(document); pushHistory('Create linked visual graph and Rhai assets'); openGraphAsset(asset.uuid); openGraph(asset.uuid); addEditorLog(t('visualGraphCreatedWithCode', { name: asset.name, script: linked?.scriptUuid.slice(0,8) ?? '' }), 'Script') }
/** 校验草稿冲突、图编译及模块依赖，原子提交关联资源后才排队热重载和清除草稿。 */ function saveGraph(): boolean {
  if (!activeAsset.value) return false
  if(graphDraftConflict.value){graphSaveError.value=layoutLabels.value.resolveDraftConflict;return false}
  graphSaveError.value=''
  flushVisualQueue();finishViewportHistory(); compileNow()
  if (!compileResult.value.valid) { graphSaveError.value=t('graphCannotCompile');addEditorLog(graphSaveError.value,'Script','error',activeAsset.value.uuid);return false }
  const source=serializeGraphDocument(graph.value)
  // The module resolver accepts graph JSON for a visualScript asset and validates
  // its generated Rhai plus project use dependencies before any asset is written.
  const audited=gameplayRuntime.validateModuleSource(activeAsset.value.uuid,source)
  if(audited.error){graphSaveError.value=conversionLabels.value.saveBlocked+' '+audited.error;addEditorLog(graphSaveError.value,'Script','error',activeAsset.value.uuid);return false}
  const previous=readTextAsset(activeAsset.value.uuid)??sourceFromHistory()
  let committed: ReturnType<typeof commitLinkedGraphAsset>
  try { committed=commitLinkedGraphAsset(activeAsset.value.uuid,graph.value) }
  catch(error){graphSaveError.value=conversionLabels.value.saveBlocked+' '+(error instanceof Error?error.message:String(error));addEditorLog(graphSaveError.value,'Script','error',activeAsset.value.uuid);return false}
  // 所有资源完成提交后再通知运行时；失败分支保留草稿与撤销历史。
  gameplayRuntime.queueGraphHotReload(activeAsset.value.uuid,source,previous)
  for(const uuid of committed.scriptUuids){const linkedSource=readTextAsset(uuid);if(linkedSource!==null)gameplayRuntime.queueHotReload(uuid,linkedSource)}
  dirty.value=false;loadedBaseSource.value=source;clearStudioDraft(activeAsset.value,draftProjectId);history.value[historyIndex.value]=source
  pushHistory('Save linked visual graph and Rhai',`visual-graph:${activeAsset.value.uuid}`)
  addEditorLog(t('visualGraphSavedWithCode',{name:activeAsset.value.name}),'Script')
  return true
}
/* 当 history.value[historyIndex.value] 为 null 或 undefined 时返回 serializeGraphDocument(graph.value)，否则保留左侧值。 */ function sourceFromHistory(){return history.value[historyIndex.value]??serializeGraphDocument(graph.value)}

/** 在锚点或选中积木下方创建避开现有节点的新节点，按需自动连接并选中。 */ function addNode(type: string) { const scope = activeScope.value, z = scope.viewport.zoom, selected=scope.nodes.find(/* 调用 selectedNodes.has(item.uuid) 并返回调用结果。 */ item=>selectedNodes.has(item.uuid)), anchored=paletteAnchor.value, x = selected&&studio.authoringMode==='blocks'?selected.position.x:anchored?.x??(canvasSize.width * .5 - scope.viewport.x) / z - 112, y = selected&&studio.authoringMode==='blocks'?selected.position.y+nodeSize(selected).height+10:anchored?.y??(canvasSize.height * .45 - scope.viewport.y) / z - 50; paletteAnchor.value=null; const node = createGraphNode(type, x, y, graph.value, activeRoutine.value); node.position=availableGraphPosition(scope.nodes,node.position,nodeSize(node));scope.nodes.push(node);if(selected&&studio.authoringMode==='blocks')connectScratchBlocks(selected,node); selectedNodes.clear(); selectedNodes.add(node.uuid); paletteSearch.value = ''; markDirty() }
/** 添加目录搜索结果中的首个节点。 */ function addFirstPaletteNode() { const first = paletteResults.value[0]; if (first) addNode(first.type) }
/** 左键按修饰键替换或切换节点选择，并清除连线选择。 */ function selectNode(event: PointerEvent, node: GraphNode) { if (event.button !== 0) return;selectedEdgeUuid.value=''; if (!event.ctrlKey && !event.metaKey && !event.shiftKey) selectedNodes.clear(); if ((event.ctrlKey || event.metaKey) && selectedNodes.has(node.uuid)) selectedNodes.delete(node.uuid); else selectedNodes.add(node.uuid) }
/** 读取画布显示尺寸与布局尺寸之比，缺失时返回单位比例。 */ function canvasScale(){const element=canvas.value,rect=element?.getBoundingClientRect();return{x:element&&rect?rect.width/Math.max(1,element.offsetWidth):1,y:element&&rect?rect.height/Math.max(1,element.offsetHeight):1}}
/** 把窗口指针坐标转换为画布局部坐标。 */ function canvasLocal(event:{clientX:number;clientY:number}):GraphPoint {const rect=canvas.value!.getBoundingClientRect(),scale=canvasScale();return{x:(event.clientX-rect.left)/scale.x,y:(event.clientY-rect.top)/scale.y}}
/** 把画布局部坐标转换为当前视口下的图坐标。 */ function eventGraphPoint(event:{clientX:number;clientY:number}):GraphPoint {const point=canvasLocal(event),view=activeScope.value.viewport;return{x:(point.x-view.x)/view.zoom,y:(point.y-view.y)/view.zoom}}
/** 统一管理指针捕获、移动、释放和取消，结束时清理监听并提交最后视觉更新。 */ function trackPointerGesture(event:PointerEvent,move:(event:PointerEvent)=>void,complete:(cancelled:boolean)=>void){
  cancelPointerGesture?.();const pointerId=event.pointerId,target=event.currentTarget as Element;let finished=false
  const moved=/** 仅转发属于当前手势的指针移动。 */ (next:PointerEvent)=>{if(next.pointerId===pointerId)move(next)}
  const finish=/** 手势仅结束一次，清理监听和捕获，处理最后样本并通知完成或取消。 */ (cancelled:boolean,next?:PointerEvent)=>{if(finished)return;finished=true;window.removeEventListener('pointermove',moved);window.removeEventListener('pointerup',released);window.removeEventListener('pointercancel',cancelledEvent);target.removeEventListener('lostpointercapture',cancelledEvent);if(!cancelled&&next)move(next);flushVisualQueue();cancelPointerGesture=null;try{if(target.hasPointerCapture(pointerId))target.releasePointerCapture(pointerId)}catch{/* Detached target. */}complete(cancelled);triggerRef(graph)}
  const released=/** 所属指针释放时按正常完成结束手势。 */ (next:PointerEvent)=>{if(next.pointerId===pointerId)finish(false,next)},cancelledEvent=/** 所属指针取消或丢失捕获时取消手势。 */ (next:Event)=>{if((next as PointerEvent).pointerId===pointerId)finish(true)}
  cancelPointerGesture=/* 调用 finish(true) 并返回调用结果。 */ ()=>finish(true);window.addEventListener('pointermove',moved);window.addEventListener('pointerup',released);window.addEventListener('pointercancel',cancelledEvent);target.addEventListener('lostpointercapture',cancelledEvent)
  try{target.setPointerCapture(pointerId)}catch{/* Window listeners remain the fallback. */}
}
/** 保存选中节点初始位置并开始拖动，取消恢复原位，完成后固定布局位置并记录历史。 */ function startNodeDrag(event: PointerEvent, node: GraphNode) {
  if(event.button!==0||(event.target as HTMLElement).closest('button,input,textarea,select'))return
  event.preventDefault();selectNode(event,node);const beforeDirty=dirty.value,starts=new Map(activeScope.value.nodes.filter(/* 调用 selectedNodes.has(item.uuid) 并返回调用结果。 */ item=>selectedNodes.has(item.uuid)).map(/* 返回按声明顺序构造的数组 [item.uuid,{...item.position}]。 */ item=>[item.uuid,{...item.position}])),start=canvasLocal(event),z=activeScope.value.viewport.zoom;let moved=false
  trackPointerGesture(event,/** 把节点拖动样本合并到下一视觉帧。 */ e=>queueVisual(/** 按指针增量移动所有选中节点，发生移动时失效路由并标记草稿。 */ ()=>{const current=canvasLocal(e),dx=current.x-start.x,dy=current.y-start.y;if(Math.abs(dx)+Math.abs(dy)>.5)moved=true;for(const [uuid,position] of starts){const item=activeNodeIndex.value.get(uuid);if(item)item.position=dragGraphPoint(position,dx,dy,z)}if(moved){invalidateRouting();dirty.value=true}}),/** 取消时恢复节点位置与脏状态；完成时固定移动节点并记录历史。 */ cancelled=>{if(cancelled){for(const [uuid,position] of starts){const item=activeNodeIndex.value.get(uuid);if(item)item.position=position}dirty.value=beforeDirty;invalidateRouting()}else if(moved){for(const uuid of starts.keys()){const item=activeNodeIndex.value.get(uuid);if(item)item.config.layoutPinned=true}recordHistory()}})
}
/** 保存批注初始位置开始拖动，取消恢复原位，完成记录历史。 */ function startCommentDrag(event: PointerEvent, comment: GraphComment) {
  if(event.button!==0||(event.target as HTMLElement).closest('input,button,textarea,select'))return
  event.preventDefault();const beforeDirty=dirty.value,position={...comment.position},start=canvasLocal(event),z=activeScope.value.viewport.zoom;let moved=false
  trackPointerGesture(event,/** 把批注拖动样本合并到下一视觉帧。 */ e=>queueVisual(/** 按缩放换算批注拖动位置，发生移动时标记草稿。 */ ()=>{const current=canvasLocal(e),dx=current.x-start.x,dy=current.y-start.y;if(Math.abs(dx)+Math.abs(dy)>.5)moved=true;comment.position=dragGraphPoint(position,dx,dy,z);if(moved)dirty.value=true}),/** 批注拖动取消恢复位置和脏状态，否则记录有效移动。 */ cancelled=>{if(cancelled){comment.position=position;dirty.value=beforeDirty;invalidateRouting()}else if(moved)recordHistory()})
}

/** 开始画布平移并清除待连线，取消恢复视口，点击未移动则清除选择。 */ function startCanvasPan(event:PointerEvent){if(!canvas.value)return;event.preventDefault();pendingWire.value=null;editorRoot.value?.focus({preventScroll:true});const scope=activeScope.value,start={...scope.viewport},origin=canvasLocal(event);let moved=false;isPanning.value=true;trackPointerGesture(event,/** 把画布平移样本合并到下一视觉帧。 */ e=>queueVisual(/** 根据局部指针增量从初始视口计算平移。 */ ()=>{const current=canvasLocal(e),dx=current.x-origin.x,dy=current.y-origin.y;if(Math.abs(dx)+Math.abs(dy)>.5)moved=true;scope.viewport=panGraphViewport(start,dx,dy)}),/** 结束平移时恢复取消操作或记录移动，纯点击清除选择。 */ cancelled=>{isPanning.value=false;if(cancelled)scope.viewport=start;else if(moved)commitViewportHistory();else{selectedNodes.clear();selectedEdgeUuid.value=''}})}
/** 中键在捕获阶段启动画布平移。 */ function canvasPointerDownCapture(event:PointerEvent){if(event.button===1)startCanvasPan(event)}
/** 左键排除控件目标后，按修饰键启动框选或普通平移。 */ function canvasPointerDown(event: PointerEvent) { if(event.button!==0||!canvas.value)return;const target=event.target as HTMLElement;if(target.closest('button,input,textarea,select,a,[contenteditable=true],.minimap,.wire-hit'))return;pendingWire.value=null;const scope=activeScope.value,z=scope.viewport.zoom;if(event.shiftKey){event.preventDefault();const point=eventGraphPoint(event),startScreen=canvasLocal(event);selectionBox.value={startX:point.x,startY:point.y,x:startScreen.x,y:startScreen.y,width:0,height:0};trackPointerGesture(event,/** 把框选拖动样本合并到下一视觉帧。 */ e=>queueVisual(/** 由起点与当前指针更新框选矩形。 */ ()=>{if(!selectionBox.value)return;const {x,y}=canvasLocal(e);selectionBox.value.x=Math.min(startScreen.x,x);selectionBox.value.y=Math.min(startScreen.y,y);selectionBox.value.width=Math.abs(x-startScreen.x);selectionBox.value.height=Math.abs(y-startScreen.y)}),/** 正常结束时选择与图空间选框相交的节点，取消时仅清除选框。 */ cancelled=>{const box=selectionBox.value;if(box&&!cancelled){const left=(box.x-scope.viewport.x)/z,top=(box.y-scope.viewport.y)/z,right=left+box.width/z,bottom=top+box.height/z;selectedNodes.clear();selectedEdgeUuid.value='';for(const node of scope.nodes){const size=nodeSize(node);if(node.position.x<=right&&node.position.x+size.width>=left&&node.position.y<=bottom&&node.position.y+size.height>=top)selectedNodes.add(node.uuid)}}selectionBox.value=null});return}startCanvasPan(event) }
/** 忽略近乎相同的视口，否则写入并标记脏状态和刷新。 */ function applyViewport(viewport:ReturnType<typeof focalGraphZoom>){const scope=activeScope.value;if(Math.abs(viewport.zoom-scope.viewport.zoom)<.0001&&Math.abs(viewport.x-scope.viewport.x)<.01&&Math.abs(viewport.y-scope.viewport.y)<.01)return false;scope.viewport=viewport;dirty.value=true;triggerRef(graph);return true}
/* 调用 applyViewport(focalGraphZoom(activeScope.value.viewport,next,px,py)) 并返回调用结果。 */ function setZoom(next:number, px=canvasSize.width*.5, py=canvasSize.height*.5){return applyViewport(focalGraphZoom(activeScope.value.viewport,next,px,py))}
/** 以滚轮位置为焦点缩放画布，并合并视口历史。 */ function zoomCanvas(event: WheelEvent) { if(!canvas.value)return;const point=canvasLocal(event),viewport=wheelGraphZoom(activeScope.value.viewport,event.deltaY,event.deltaMode,point.x,point.y);if(applyViewport(viewport))scheduleViewportHistory() }
/** 以画布中心执行分步缩放并立即记录历史。 */ function changeZoom(delta:number){const viewport=stepGraphZoom(activeScope.value.viewport,delta,canvasSize.width*.5,canvasSize.height*.5);if(applyViewport(viewport))commitViewportHistory()}
/** 读取缩放滑块值，实际变化时安排历史。 */ function zoomSlider(event:Event){if(setZoom(Number((event.target as HTMLInputElement).value)))scheduleViewportHistory()}
/** 恢复单位缩放并记录视口历史。 */ function resetZoom(){if(setZoom(1))commitViewportHistory()}
/** 退出画布专注模式并打开节点目录。 */ function openPalette(){studio.layout.canvasFocused=false;studio.layout.activePanel='palette';studio.paletteOpen=true}
/** 关闭节点目录。 */ function closePalette(){studio.paletteOpen=false}
/** 切换节点目录显示状态。 */ function togglePalette(){studio.paletteOpen?closePalette():openPalette()}
/** 退出画布专注模式并打开详情栏。 */ function openDetails(){studio.layout.canvasFocused=false;studio.layout.activePanel='details';studio.detailsOpen=true}
/** 关闭详情栏。 */ function closeDetails(){studio.detailsOpen=false}
/** 在指针附近设置新节点锚点并打开聚焦目录。 */ function openPaletteAtPointer(event:MouseEvent){const point=eventGraphPoint(event);paletteAnchor.value={x:point.x-112,y:point.y-30};openPalette();nextTick(/* 调用 paletteInput.value?.focus() 并返回调用结果。 */ ()=>paletteInput.value?.focus())}
/** 计算适配全部节点的视口，空图恢复默认视口，按需记录历史。 */ function frameAll(record=true){const scope=activeScope.value;let viewport;if(!scope.nodes.length)viewport={x:80,y:80,zoom:1};else{let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const node of scope.nodes){const size=nodeSize(node);minX=Math.min(minX,node.position.x);minY=Math.min(minY,node.position.y);maxX=Math.max(maxX,node.position.x+size.width);maxY=Math.max(maxY,node.position.y+size.height)}const width=Math.max(1,maxX-minX),height=Math.max(1,maxY-minY),zoom=Math.min(1.2,Math.max(.1,Math.min((canvasSize.width-100)/width,(canvasSize.height-100)/height)));viewport={zoom,x:(canvasSize.width-width*zoom)/2-minX*zoom,y:(canvasSize.height-height*zoom)/2-minY*zoom}}const changed=applyViewport(viewport);if(changed&&record)commitViewportHistory()}

/** 从输出开始连线；输入端校验类型并替换旧输入连接，成功后记录草稿。 */ function pinClicked(node:GraphNode,pin:GraphPin){if(pin.direction==='output'){pendingWire.value={node,pin};pointerGraph.value=pinPoint(node,pin);wireStatus.value={kind:'label',key:'wireHelp'};return}const pending=pendingWire.value;if(!pending)return;if(pending.node.uuid===node.uuid||pending.pin.kind!==pin.kind||pin.kind==='data'&&pending.pin.valueType!==pin.valueType&&pending.pin.valueType!=='Data'&&pin.valueType!=='Data'){wireStatus.value={kind:'label',key:'wireMismatch'};return}activeScope.value.edges=activeScope.value.edges.filter(/* 比较 edge.to.pinUuid 与 pin.uuid，返回严格不等的判断结果。 */ edge=>edge.to.pinUuid!==pin.uuid);const edge={uuid:graphUuid(),from:{nodeUuid:pending.node.uuid,pinUuid:pending.pin.uuid},to:{nodeUuid:node.uuid,pinUuid:pin.uuid}};activeScope.value.edges.push(edge);selectedEdgeUuid.value=edge.uuid;pendingWire.value=null;wireStatus.value={kind:'label',key:'wireConnected'};markDirty()}
/** 仅输出端口可开始指针连线并更新预览端点。 */ function startWire(event:PointerEvent,node:GraphNode,pin:GraphPin){if(pin.direction!=='output')return;pendingWire.value={node,pin};pointerMove(event)}
/** 存在待连接输出时在输入端完成连线。 */ function finishWire(node:GraphNode,pin:GraphPin){if(pin.direction==='input'&&pendingWire.value)pinClicked(node,pin)}
/** 判断输入端与待连接输出的执行或数据类型是否兼容。 */ function compatiblePin(pin:GraphPin){const pending=pendingWire.value;if(!pending||pin.direction!=='input'||pending.pin.kind!==pin.kind)return false;return pin.kind==='execution'||pending.pin.valueType===pin.valueType||pending.pin.valueType==='Data'||pin.valueType==='Data'}
/* 调用 connectedInputPins.value.has(pin.uuid) 并返回调用结果。 */ function pinConnected(pin:GraphPin){return connectedInputPins.value.has(pin.uuid)}
/* 调用 graphEditorPinPoint(node,pin,measuredPorts.value[pin.uuid],measuredBounds.value[node.uuid]) 并返回调用结果。 */ function pinPoint(node:GraphNode,pin:GraphPin){return graphEditorPinPoint(node,pin,measuredPorts.value[pin.uuid],measuredBounds.value[node.uuid])}
/** 优先使用自动路由，其次手动转折点，否则绘制曲线；阻塞或缺失端点时不绘制。 */ function edgePath(edge:GraphEdge){if(layoutDiagnostics.value.some(/* 先计算 item.edgeUuid===edge.uuid；仅当其为真值时求右侧 item.code==='WIRE_ROUTE_BLOCKED'，返回短路求值结果。 */ item=>item.edgeUuid===edge.uuid&&item.code==='WIRE_ROUTE_BLOCKED'))return'';const fromNode=activeNodeIndex.value.get(edge.from.nodeUuid),toNode=activeNodeIndex.value.get(edge.to.nodeUuid),fromPin=fromNode?.pins.find(/* 比较 p.uuid 与 edge.from.pinUuid，返回严格相等的判断结果。 */ p=>p.uuid===edge.from.pinUuid),toPin=toNode?.pins.find(/* 比较 p.uuid 与 edge.to.pinUuid，返回严格相等的判断结果。 */ p=>p.uuid===edge.to.pinUuid);if(!fromNode||!toNode||!fromPin||!toPin)return'';const a=pinPoint(fromNode,fromPin),b=pinPoint(toNode,toPin);if(autoRoutes.value[edge.uuid])return graphPolylinePath(autoRoutes.value[edge.uuid]);if(edge.reroutes?.length)return graphPolylinePath([a,...edge.reroutes,b]);const bend=Math.max(45,Math.abs(b.x-a.x)*.45);return`M ${a.x} ${a.y} C ${a.x+bend} ${a.y}, ${b.x-bend} ${b.y}, ${b.x} ${b.y}`}
/** 组合连线两端节点及端口名称供列表显示。 */ function edgeLabel(edge:GraphEdge){const a=activeNodeIndex.value.get(edge.from.nodeUuid),b=activeNodeIndex.value.get(edge.to.nodeUuid);return`${a?.title??edge.from.nodeUuid} (${a?.pins.find(/* 比较 pin.uuid 与 edge.from.pinUuid，返回严格相等的判断结果。 */ pin=>pin.uuid===edge.from.pinUuid)?.name??'?'}) → ${b?.title??edge.to.nodeUuid} (${b?.pins.find(/* 比较 pin.uuid 与 edge.to.pinUuid，返回严格相等的判断结果。 */ pin=>pin.uuid===edge.to.pinUuid)?.name??'?'})`}
/** 选择连线并结束待连接状态，存在选中项时打开详情。 */ function selectEdge(uuid:string){selectedEdgeUuid.value=uuid;pendingWire.value=null;wireStatus.value=uuid?{kind:'label',key:'wireSelected'}:'';if(uuid)openDetails()}
/** 解析连线两端节点和端口并取得实际端点坐标。 */ function edgeEndpoints(edge:GraphEdge):[GraphPoint,GraphPoint]|null {const a=activeNodeIndex.value.get(edge.from.nodeUuid),b=activeNodeIndex.value.get(edge.to.nodeUuid),output=a?.pins.find(/* 比较 pin.uuid 与 edge.from.pinUuid，返回严格相等的判断结果。 */ pin=>pin.uuid===edge.from.pinUuid),input=b?.pins.find(/* 比较 pin.uuid 与 edge.to.pinUuid，返回严格相等的判断结果。 */ pin=>pin.uuid===edge.to.pinUuid);return a&&b&&output&&input?[pinPoint(a,output),pinPoint(b,input)]:null}
/** 在全图转折点数量约束下插入转折点，成功后选择连线并记录草稿。 */ function addReroute(edge:GraphEdge,point:GraphPoint){const endpoints=edgeEndpoints(edge);if(!endpoints)return;try{edge.reroutes=insertWireReroute(edge,point,endpoints,graphScopes().reduce(/* 计算表达式 sum+scope.edges.reduce((sum,edge)=>sum+(edge.reroutes?.length??0),0) 并返回结果，沿用操作数的原有类型规则。 */ (sum,scope)=>sum+scope.edges.reduce(/* 计算表达式 sum+(edge.reroutes?.length??0) 并返回结果，沿用操作数的原有类型规则。 */ (sum,edge)=>sum+(edge.reroutes?.length??0),0),0));selectedEdgeUuid.value=edge.uuid;wireStatus.value='';markDirty()}catch(error){wireStatus.value=String(error instanceof Error?error.message:error)}}
/** 在双击位置插入连线转折点并打开详情。 */ function addRerouteAt(event:MouseEvent,edge:GraphEdge){addReroute(edge,eventGraphPoint(event));openDetails()}
/** 在最后转折点或输出与输入之间的中点插入转折点。 */ function addRerouteMidpoint(){const edge=selectedEdge.value,endpoints=edge&&edgeEndpoints(edge);if(edge&&endpoints){const a=edge.reroutes?.at(-1)??endpoints[0],b=endpoints[1];addReroute(edge,{x:(a.x+b.x)/2,y:(a.y+b.y)/2})}}
/** 删除当前选中连线并清空选择。 */ function disconnectEdge(){if(!selectedEdge.value)return;activeScope.value.edges=activeScope.value.edges.filter(/* 比较 edge.uuid 与 selectedEdgeUuid.value，返回严格不等的判断结果。 */ edge=>edge.uuid!==selectedEdgeUuid.value);selectedEdgeUuid.value='';markDirty()}
/** 清除选中连线全部手动转折点。 */ function clearReroutes(){if(!selectedEdge.value?.reroutes?.length)return;delete selectedEdge.value.reroutes;markDirty()}
/** 删除指定转折点，最后一点删除后移除转折点字段。 */ function removeReroute(index:number){const edge=selectedEdge.value;if(!edge?.reroutes||!edge.reroutes[index])return;edge.reroutes=edge.reroutes.filter(/* 比较 position 与 index，返回严格不等的判断结果。 */ (_,position)=>position!==index);if(!edge.reroutes.length)delete edge.reroutes;markDirty()}
/** 校验并更新转折点坐标，失败时恢复输入显示及报告错误。 */ function changeRerouteCoordinate(index:number,axis:'x'|'y',event:Event){const edge=selectedEdge.value,point=edge?.reroutes?.[index];if(!edge||!point)return;try{edge.reroutes=changeWireReroute(edge,index,{...point,[axis]:Number((event.target as HTMLInputElement).value)});wireStatus.value='';markDirty()}catch(error){wireStatus.value=error instanceof Error?error.message:String(error);(event.target as HTMLInputElement).value=String(point[axis])}}
/** 保存连线转折点副本开始拖动，取消恢复原值，完成后记录历史。 */ function startRerouteDrag(event:PointerEvent,edge:GraphEdge,index:number){if(event.button!==0||!edge.reroutes?.[index])return;(event.currentTarget as HTMLElement).focus({preventScroll:true});const original=edge.reroutes.map(/** 复制转折点以保留拖动前坐标。 */ point=>({...point})),beforeDirty=dirty.value,start=eventGraphPoint(event);let changed=false
  trackPointerGesture(event,/** 把转折点拖动样本合并到下一视觉帧。 */ next=>queueVisual(/** 根据图空间位移校验并移动转折点，更新路由和脏状态。 */ ()=>{const point=eventGraphPoint(next);try{edge.reroutes=changeWireReroute(edge,index,{x:original[index].x+point.x-start.x,y:original[index].y+point.y-start.y});changed=true;invalidateRouting();dirty.value=true}catch(error){wireStatus.value=error instanceof Error?error.message:String(error)}}),/** 取消转折点拖动时恢复原数组和脏状态，否则记录有效移动。 */ cancelled=>{if(cancelled){edge.reroutes=original;dirty.value=beforeDirty;invalidateRouting()}else if(changed)recordHistory()})
}
/** 处理转折点删除、取消及方向键微调，按修饰键使用较大步长。 */ function rerouteKeydown(event:KeyboardEvent,edge:GraphEdge,index:number){if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();event.stopPropagation();removeReroute(index);return}if(event.key==='Escape'){cancelPointerGesture?.();return}const delta:Record<string,GraphPoint>={ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1}},direction=delta[event.key],point=edge.reroutes?.[index];if(!direction||!point)return;event.preventDefault();event.stopPropagation();try{const step=event.shiftKey?40:8;edge.reroutes=changeWireReroute(edge,index,{x:point.x+direction.x*step,y:point.y+direction.y*step});markDirty()}catch(error){wireStatus.value=error instanceof Error?error.message:String(error)}}
/** 按输出端口取得连线执行类型或数据类型样式。 */ function edgeKind(edge:GraphEdge){const node=activeNodeIndex.value.get(edge.from.nodeUuid),pin=node?.pins.find(/* 比较 p.uuid 与 edge.from.pinUuid，返回严格相等的判断结果。 */ p=>p.uuid===edge.from.pinUuid);return pin?.kind==='execution'?'execution':pin?.valueType?.toLowerCase()??'data'}
const pendingPath=computed(/** 为待连接端口和指针生成临时贝塞尔曲线。 */ ()=>{const pending=pendingWire.value,pointer=pointerGraph.value;if(!pending||!pointer)return'';const a=pinPoint(pending.node,pending.pin),bend=Math.max(45,Math.abs(pointer.x-a.x)*.45);return`M ${a.x} ${a.y} C ${a.x+bend} ${a.y}, ${pointer.x-bend} ${pointer.y}, ${pointer.x} ${pointer.y}`})

/** 深复制选中节点并重建节点、端口及内部连线标识，寻找空位并选中新副本。 */ function duplicateSelected(){const scope=activeScope.value,originals=scope.nodes.filter(/* 调用 selectedNodes.has(n.uuid) 并返回调用结果。 */ n=>selectedNodes.has(n.uuid)),map=new Map<string,string>(),pinMap=new Map<string,string>(),placed=[...scope.nodes];const copies=originals.map(/** 复制节点并为节点和端口分配新标识，计算不重叠位置。 */ node=>{const copy=JSON.parse(JSON.stringify(node)) as GraphNode;copy.uuid=graphUuid();map.set(node.uuid,copy.uuid);copy.position=availableGraphPosition(placed,{x:copy.position.x+32,y:copy.position.y+32},nodeSize(copy));placed.push(copy);for(const pin of copy.pins){const old=pin.uuid;pin.uuid=graphUuid();pinMap.set(old,pin.uuid)}return copy});const edges=scope.edges.filter(/* 先计算 map.has(edge.from.nodeUuid)；仅当其为真值时求右侧 map.has(edge.to.nodeUuid)，返回短路求值结果。 */ edge=>map.has(edge.from.nodeUuid)&&map.has(edge.to.nodeUuid)).map(/** 用新节点及端口映射重建选中子图内部连线。 */ edge=>({uuid:graphUuid(),from:{nodeUuid:map.get(edge.from.nodeUuid)!,pinUuid:pinMap.get(edge.from.pinUuid)!},to:{nodeUuid:map.get(edge.to.nodeUuid)!,pinUuid:pinMap.get(edge.to.pinUuid)!}}));scope.nodes.push(...copies);scope.edges.push(...edges);selectedNodes.clear();for(const copy of copies)selectedNodes.add(copy.uuid);markDirty()}
/** 删除选中节点、关联连线和断点，再清空选择。 */ function deleteSelected(){if(!selectedNodes.size)return;const scope=activeScope.value;scope.nodes=scope.nodes.filter(/* 返回 selectedNodes.has(node.uuid) 的逻辑取反结果。 */ node=>!selectedNodes.has(node.uuid));scope.edges=scope.edges.filter(/* 先计算 !selectedNodes.has(edge.from.nodeUuid)；仅当其为真值时求右侧 !selectedNodes.has(edge.to.nodeUuid)，返回短路求值结果。 */ edge=>!selectedNodes.has(edge.from.nodeUuid)&&!selectedNodes.has(edge.to.nodeUuid));graph.value.debug.breakpoints=graph.value.debug.breakpoints.filter(/* 返回 selectedNodes.has(point.nodeUuid) 的逻辑取反结果。 */ point=>!selectedNodes.has(point.nodeUuid));selectedNodes.clear();markDirty()}
/** 将至少两个选中节点左侧对齐。 */ function alignSelected(){const nodes=activeScope.value.nodes.filter(/* 调用 selectedNodes.has(node.uuid) 并返回调用结果。 */ node=>selectedNodes.has(node.uuid));if(nodes.length<2)return;const x=Math.min(...nodes.map(/* 返回 node.position.x 的当前值。 */ node=>node.position.x));for(const node of nodes)node.position.x=x;markDirty()}
/** 将至少三个选中节点在首末横坐标之间均匀分布。 */ function distributeSelected(){const nodes=activeScope.value.nodes.filter(/* 调用 selectedNodes.has(node.uuid) 并返回调用结果。 */ node=>selectedNodes.has(node.uuid)).sort(/* 计算表达式 a.position.x-b.position.x 并返回结果，沿用操作数的原有类型规则。 */ (a,b)=>a.position.x-b.position.x);if(nodes.length<3)return;const first=nodes[0].position.x,last=nodes[nodes.length-1].position.x;nodes.forEach(/** 按节点索引插值设置分布横坐标。 */ (node,index)=>node.position.x=first+(last-first)*index/(nodes.length-1));markDirty()}
/** 在空白位置创建批注并聚焦，不移动已有节点或批注。 */ function addComment(){
  cancelPointerGesture?.();finishViewportHistory()
  const scope=activeScope.value,size={width:360,height:220},desired={x:(canvasSize.width*.5-scope.viewport.x)/scope.viewport.zoom-size.width*.5,y:(canvasSize.height*.4-scope.viewport.y)/scope.viewport.zoom}
  const occupied=[...scope.nodes.map(/** 把节点位置和实际尺寸转换为占用矩形。 */ node=>({...node.position,...nodeSize(node)})),...scope.comments.map(/** 把批注位置和展开或折叠高度转换为占用矩形。 */ comment=>({...comment.position,width:comment.size.width,height:comment.collapsed?34:comment.size.height}))]
  const position=placeGraphComment(occupied,desired,size),comment={uuid:graphUuid(),text:t('graphComment'),position,size,color:'#5b8def',collapsed:false}
  scope.comments.push(comment)
  // Creating an annotation is an explicit focus action; existing nodes and comments stay fixed.
  const zoom=1
  scope.viewport={zoom,x:canvasSize.width*.5-(position.x+size.width*.5)*zoom,y:Math.min(100,canvasSize.height*.3)-position.y*zoom}
  markDirty()
  nextTick(/** 新批注渲染后聚焦并选中标题输入。 */ ()=>{const input=editorRoot.value?.querySelector<HTMLInputElement>(`[data-comment-uuid="${comment.uuid}"] input`);input?.focus({preventScroll:true});input?.select()})
}

/** 优先使用后续或完成执行端口连接积木，替换目标输入旧连线。 */ function connectScratchBlocks(from:GraphNode,to:GraphNode){const output=from.pins.find(/* 先计算 pin.kind==='execution'&&pin.direction==='output'；仅当其为真值时求右侧 (pin.key==='next'||pin.key==='completed')，返回短路求值结果。 */ pin=>pin.kind==='execution'&&pin.direction==='output'&&(pin.key==='next'||pin.key==='completed'))??from.pins.find(/* 先计算 pin.kind==='execution'；仅当其为真值时求右侧 pin.direction==='output'，返回短路求值结果。 */ pin=>pin.kind==='execution'&&pin.direction==='output'),input=to.pins.find(/* 先计算 pin.kind==='execution'；仅当其为真值时求右侧 pin.direction==='input'，返回短路求值结果。 */ pin=>pin.kind==='execution'&&pin.direction==='input');if(!output||!input)return;activeScope.value.edges=activeScope.value.edges.filter(/* 比较 edge.to.pinUuid 与 input.uuid，返回严格不等的判断结果。 */ edge=>edge.to.pinUuid!==input.uuid);activeScope.value.edges.push({uuid:graphUuid(),from:{nodeUuid:from.uuid,pinUuid:output.uuid},to:{nodeUuid:to.uuid,pinUuid:input.uuid}})}
/** 替换节点 DOM 引用时解除旧尺寸观测，并观测新元素。 */ function setNodeElement(uuid:string,element:unknown){const previous=nodeElements.get(uuid);if(previous===element)return;if(previous){nodeObserver?.unobserve(previous);nodeElements.delete(uuid)}if(element instanceof HTMLElement){nodeElements.set(uuid,element);nodeObserver?.observe(element);queueNodeMeasurements()}}
/** 合并同一帧的测量请求；组件卸载后不再排入回调。 */
function queueNodeMeasurements(){if(editorDisposed||!editorActive||measurementFrame)return;measurementFrame=requestAnimationFrame(/** 清除测量帧标识并执行节点测量。 */ ()=>{measurementFrame=0;measureNodes()})}
/** 只测量挂载节点；旧标识从缓存移除，屏外但仍存在的节点继续保留测量。 */
function measureNodes(){
  if(editorDisposed)return
  const retained=retainGraphMeasurements(activeScope.value.nodes,measuredBounds.value,measuredPorts.value)
  const scale=canvasScale(),zoom=activeScope.value.viewport.zoom,bounds=retained.bounds,ports=retained.ports;let changed=retained.removed>0
  for(const [uuid,element] of nodeElements){if(!activeNodeIndex.value.has(uuid))continue;const rect=element.getBoundingClientRect();if(!rect.width||!rect.height)continue;const size={width:rect.width/zoom/scale.x,height:rect.height/zoom/scale.y},old=bounds[uuid];if(!old||Math.abs(old.width-size.width)>.25||Math.abs(old.height-size.height)>.25){bounds[uuid]=size;changed=true}
    for(const pin of element.querySelectorAll<HTMLElement>('[data-pin-uuid]')){const p=pin.getBoundingClientRect();if(!p.width||!p.height)continue;const id=pin.dataset.pinUuid!,point={x:(p.left+p.width/2-rect.left)/zoom/scale.x,y:(p.top+p.height/2-rect.top)/zoom/scale.y},old=ports[id];if(!old||Math.abs(old.x-point.x)>.25||Math.abs(old.y-point.y)>.25){ports[id]=point;changed=true}}
  }
  if(changed){measuredBounds.value=bounds;measuredPorts.value=ports;invalidateRouting()}
  if(initialLayoutPending&&!layoutRunning.value&&!initialLayoutInFlight&&visibleNodes.value.length&&visibleNodes.value.every(/* 返回 !measuredBounds.value[node.uuid] 的逻辑取反结果。 */ node=>!!measuredBounds.value[node.uuid])){const token=initialLayoutEpoch;initialLayoutPending=false;initialLayoutInFlight=true;initialLayoutState.value='running';void arrangeGraph(false,token).then(/** 仅初始布局代数仍匹配时更新完成或取消状态。 */ applied=>{if(token===initialLayoutEpoch&&initialLayoutState.value==='running')initialLayoutState.value=applied?'complete':'cancelled'}).finally(/** 仅初始布局代数仍匹配时清除运行中标记。 */ ()=>{if(token===initialLayoutEpoch)initialLayoutInFlight=false})}
}
/** 取消待执行或运行中的初始布局并失效其结果代数。 */ function cancelInitialLayout(){if(!initialLayoutPending&&!initialLayoutInFlight)return;initialLayoutEpoch++;initialLayoutPending=false;initialLayoutState.value='cancelled';if(initialLayoutInFlight)cancelGraphLayout();initialLayoutInFlight=false}
/** 通过中止控制器取消当前图布局。 */ function cancelGraphLayout(){layoutController?.abort()}
/** 清除路由计时器并中止路由请求，恢复空闲状态。 */ function cancelRouting(){if(routingTimer!==undefined){clearTimeout(routingTimer);routingTimer=undefined}routingController?.abort();routingController=null;routingBusy.value=false}
/** 清空自动路由和诊断，增加几何修订并重新安排路由。 */ function invalidateRouting(){autoRoutes.value={};layoutDiagnostics.value=[];geometryRevision++;cancelRouting();scheduleRouting()}
/** 图有效且有连线时防抖安排路由计算。 */ function scheduleRouting(){if(editorDisposed||!editorActive||layoutRunning.value||!activeScope.value.edges.length)return;routingBusy.value=true;if(routingTimer!==undefined)clearTimeout(routingTimer);routingTimer=setTimeout(/** 清除路由计时标识并异步执行当前图路由。 */ ()=>{routingTimer=undefined;void routeCurrentGraph()},220)}
/** 异步请求仅连线路由，检查中止、修订、文档和作用域身份后应用结果。 */ async function routeCurrentGraph(){
  if(editorDisposed||!editorActive||layoutRunning.value||!activeScope.value.edges.length){routingBusy.value=false;return}
  routingController?.abort();const controller=new AbortController();routingController=controller;const revision=geometryRevision,documentUuid=graph.value.uuid,scopeUuid=activeScopeUuid.value
  try{const result=await requestGraphLayout({nodes:activeScope.value.nodes,edges:activeScope.value.edges,measuredBounds:measuredBounds.value,measuredPorts:measuredPorts.value,selectedNodeUuids:[]},{signal:controller.signal})
    if(controller.signal.aborted||editorDisposed||revision!==geometryRevision||documentUuid!==graph.value.uuid||scopeUuid!==activeScopeUuid.value)return
    autoRoutes.value=result.routes;layoutDiagnostics.value=result.diagnostics.filter(/* 返回 !item.edgeUuid 的逻辑取反结果。 */ item=>!!item.edgeUuid);if(result.diagnostics.length)layoutStatus.value={kind:'diagnostics',items:result.diagnostics}
  }catch(error){if(!controller.signal.aborted&&!editorDisposed)layoutStatus.value=error instanceof Error?error.message:String(error)}finally{if(routingController===controller){routingController=null;routingBusy.value=false}}
}
/** 将固定状态作为普通图编辑写入历史；不改动脚本字段或执行连线。 */
function setSelectedLayoutPinned(pinned:boolean){
  flushVisualQueue();finishViewportHistory();cancelGraphLayout()
  for(const node of activeScope.value.nodes)if(selectedNodes.has(node.uuid)){if(pinned)node.config.layoutPinned=true;else delete node.config.layoutPinned}
  markDirty()
}
/** 在应用异步布局前再次核对文档、作用域、几何版本及快照，保护用户后续编辑。 */
async function arrangeGraph(selectedOnly:boolean,initialToken?:number,includePinned=false):Promise<boolean>{
  if(layoutRunning.value)return false
  flushVisualQueue();finishViewportHistory();await nextTick();if(editorDisposed||layoutRunning.value)return false;if(initialToken!==undefined&&(initialToken!==initialLayoutEpoch||initialLayoutState.value!=='running'))return false;measureNodes();cancelRouting();const before=snapshot(),revision=geometryRevision,scopeUuid=activeScopeUuid.value,documentUuid=graph.value.uuid,controller=new AbortController();layoutController=controller;layoutRunning.value=true;layoutDiagnostics.value=[];layoutStatus.value={kind:'label',key:'layoutRunning'}
  try{const result=await requestGraphLayout({nodes:activeScope.value.nodes,edges:activeScope.value.edges,measuredBounds:measuredBounds.value,measuredPorts:measuredPorts.value,fixedNodeUuids:includePinned?[]:activeScope.value.nodes.filter(/* 比较 node.config.layoutPinned 与 true，返回严格相等的判断结果。 */ node=>node.config.layoutPinned===true).map(/* 返回 node.uuid 的当前值。 */ node=>node.uuid),...(selectedOnly?{selectedNodeUuids:[...selectedNodes]}:{})},{signal:controller.signal,onProgress:/** 把布局完成数量和总量更新到进度消息。 */ progress=>{layoutStatus.value={kind:'label',key:'layoutRunning',suffix:` ${progress.completed}/${progress.total}`}}})
    if(controller.signal.aborted||editorDisposed||revision!==geometryRevision||scopeUuid!==activeScopeUuid.value||documentUuid!==graph.value.uuid||before!==snapshot()){layoutStatus.value={kind:'label',key:'layoutChanged'};return false}
    for(const node of activeScope.value.nodes){const position=result.positions[node.uuid];if(position)node.position={...position}}
    markDirty();autoRoutes.value=result.routes;layoutDiagnostics.value=result.diagnostics.filter(/* 返回 !item.edgeUuid 的逻辑取反结果。 */ item=>!!item.edgeUuid);layoutStatus.value=result.diagnostics.length?{kind:'diagnostics',items:result.diagnostics}:{kind:'result',nodes:result.metrics.movedNodes,milliseconds:result.metrics.elapsedMs};return true
  }catch(error){layoutStatus.value=error instanceof Error&&error.name==='AbortError'?{kind:'label',key:'layoutCancelled'}:error instanceof Error?error.message:String(error);return false}finally{layoutRunning.value=false;if(layoutController===controller)layoutController=null;scheduleRouting();queueNodeMeasurements()}
}
/** 切换积木或节点编程展示模式。 */ function setAuthoringMode(mode:'blocks'|'nodes'){studio.authoringMode=mode}

/** 添加默认可导出和序列化的数值变量。 */ function addVariable(){graph.value.variables.push({uuid:graphUuid(),name:`variable_${graph.value.variables.length+1}`,valueType:'Number',defaultValue:0,exposed:true,serialized:true,group:t('graphVariables'),tooltip:'',minimum:null,maximum:null,step:.01,resourceType:null});markDirty()}
/** 净化变量标识符，无有效名称时使用默认名称。 */ function normalizeVariable(variable:GraphVariable){variable.name=variable.name.replace(/[^A-Za-z0-9_]/g,'_').replace(/^[^A-Za-z_]+/,'')||'variable';markDirty()}
/* 返回按声明顺序构造的数组 [graph.value as GraphCanvasScope,...graph.value.routines]。 */ function graphScopes(){return [graph.value as GraphCanvasScope,...graph.value.routines]}
/** 变量类型变化时重置默认值及资源类型，并更新全图相关数据端口。 */ function variableTypeChanged(variable:GraphVariable){variable.defaultValue=defaultGraphValue(variable.valueType);variable.resourceType=variable.valueType==='Resource'?'Resource':null;for(const scope of graphScopes())for(const node of scope.nodes.filter(/* 比较 node.config.variableUuid 与 variable.uuid，返回严格相等的判断结果。 */ node=>node.config.variableUuid===variable.uuid))for(const pin of node.pins.filter(/* 比较 pin.kind 与 'data'，返回严格相等的判断结果。 */ pin=>pin.kind==='data')){pin.valueType=variable.valueType;pin.defaultValue=variable.defaultValue}markDirty()}
/** 删除变量及所有引用节点，再清除失效连线。 */ function removeVariable(uuid:string){graph.value.variables=graph.value.variables.filter(/* 比较 v.uuid 与 uuid，返回严格不等的判断结果。 */ v=>v.uuid!==uuid);for(const scope of graphScopes()){scope.nodes=scope.nodes.filter(/* 比较 n.config.variableUuid 与 uuid，返回严格不等的判断结果。 */ n=>n.config.variableUuid!==uuid);const ids=new Set(scope.nodes.map(/* 返回 node.uuid 的当前值。 */ node=>node.uuid));scope.edges=scope.edges.filter(/* 先计算 ids.has(edge.from.nodeUuid)；仅当其为真值时求右侧 ids.has(edge.to.nodeUuid)，返回短路求值结果。 */ edge=>ids.has(edge.from.nodeUuid)&&ids.has(edge.to.nodeUuid))}markDirty()}
/** 选择节点全局变量并同步数据端口类型和默认值。 */ function selectNodeVariable(node:GraphNode,event:Event){const uuid=(event.target as HTMLSelectElement).value,variable=graph.value.variables.find(/* 比较 v.uuid 与 uuid，返回严格相等的判断结果。 */ v=>v.uuid===uuid);node.config.variableUuid=uuid;if(variable)for(const pin of node.pins.filter(/* 比较 pin.kind 与 'data'，返回严格相等的判断结果。 */ pin=>pin.kind==='data')){pin.valueType=variable.valueType;pin.defaultValue=variable.defaultValue}markDirty()}
/** 选择节点局部变量并同步数据端口类型和默认值。 */ function selectNodeLocal(node:GraphNode,event:Event){const uuid=(event.target as HTMLSelectElement).value,local=activeRoutine.value?.locals.find(/* 比较 v.uuid 与 uuid，返回严格相等的判断结果。 */ v=>v.uuid===uuid);node.config.localUuid=uuid;if(local)for(const pin of node.pins.filter(/* 比较 pin.kind 与 'data'，返回严格相等的判断结果。 */ pin=>pin.kind==='data')){pin.valueType=local.valueType;pin.defaultValue=local.defaultValue}markDirty()}
/** 按变量类型解析默认值；数值和向量净化，结构数据解析失败为空值。 */ function setVariableDefault(variable:GraphVariable,event:Event){const text=(event.target as HTMLInputElement).value;if(variable.valueType==='Number')variable.defaultValue=Number.isFinite(Number(text))?Number(text):0;else if(variable.valueType==='Boolean')variable.defaultValue=/^(true|1|yes)$/i.test(text);else if(variable.valueType==='Vec2'){const values=text.split(/[, ]+/).map(Number);variable.defaultValue=[Number.isFinite(values[0])?values[0]:0,Number.isFinite(values[1])?values[1]:0]}else if(variable.valueType==='Data'){try{variable.defaultValue=JSON.parse(text) as GraphValue}catch{variable.defaultValue=null}}else variable.defaultValue=text;markDirty()}

/** 提交端口有限数值默认值，非法输入归零。 */ function setPinNumber(pin:GraphPin,event:Event){const value=Number((event.target as HTMLInputElement).value);pin.defaultValue=Number.isFinite(value)?value:0;markDirty()}
/** 提交端口文本，数据类型优先解析 JSON，失败保留原文本。 */ function setPinText(pin:GraphPin,event:Event){const value=(event.target as HTMLInputElement).value;if(pin.valueType==='Data'){try{pin.defaultValue=JSON.parse(value) as GraphValue}catch{pin.defaultValue=value}}else pin.defaultValue=value;markDirty()}
/** 复制并更新端口二维向量指定分量。 */ function setPinVector(pin:GraphPin,index:0|1,event:Event){const value=Array.isArray(pin.defaultValue)?[Number(pin.defaultValue[0])||0,Number(pin.defaultValue[1])||0]:[0,0];value[index]=Number((event.target as HTMLInputElement).value)||0;pin.defaultValue=value;markDirty()}
/** 提交数值常量，非法输入归零。 */ function setLiteralNumber(node:GraphNode,event:Event){const value=Number((event.target as HTMLInputElement).value);node.config.value=Number.isFinite(value)?value:0;markDirty()}
/** 复制并更新常量二维向量指定分量。 */ function setLiteralVector(node:GraphNode,index:0|1,event:Event){const value=Array.isArray(node.config.value)?[Number(node.config.value[0])||0,Number(node.config.value[1])||0]:[0,0];value[index]=Number((event.target as HTMLInputElement).value)||0;node.config.value=value;markDirty()}
/** 实时更新端口有限数值并延迟编译，不立即记录历史。 */ function updatePinNumber(pin:GraphPin,event:Event){const value=Number((event.target as HTMLInputElement).value);pin.defaultValue=Number.isFinite(value)?value:0;markDirtyLive()}
/** 实时更新端口文本或可解析 JSON 数据。 */ function updatePinText(pin:GraphPin,event:Event){const value=(event.target as HTMLInputElement).value;if(pin.valueType==='Data'){try{pin.defaultValue=JSON.parse(value) as GraphValue}catch{pin.defaultValue=value}}else pin.defaultValue=value;markDirtyLive()}
/** 实时复制更新端口二维向量指定分量。 */ function updatePinVector(pin:GraphPin,index:0|1,event:Event){const value=Array.isArray(pin.defaultValue)?[Number(pin.defaultValue[0])||0,Number(pin.defaultValue[1])||0]:[0,0];value[index]=Number((event.target as HTMLInputElement).value)||0;pin.defaultValue=value;markDirtyLive()}
/** 实时更新数值常量并延迟编译。 */ function updateLiteralNumber(node:GraphNode,event:Event){const value=Number((event.target as HTMLInputElement).value);node.config.value=Number.isFinite(value)?value:0;markDirtyLive()}
/** 实时复制更新常量二维向量分量。 */ function updateLiteralVector(node:GraphNode,index:0|1,event:Event){const value=Array.isArray(node.config.value)?[Number(node.config.value[0])||0,Number(node.config.value[1])||0]:[0,0];value[index]=Number((event.target as HTMLInputElement).value)||0;node.config.value=value;markDirtyLive()}
/** 实时更新文本常量并延迟编译。 */ function updateLiteralText(node:GraphNode,event:Event){node.config.value=(event.target as HTMLInputElement).value;markDirtyLive()}
/** 提交文本常量并记录草稿历史。 */ function setLiteralText(node:GraphNode,event:Event){node.config.value=(event.target as HTMLInputElement).value;markDirty()}
/* 根据 Array.isArray(value)&&typeof value[index]==='number' 的真假，分别返回 value[index] as number 或 0。 */ function vecPart(value:GraphValue,index:0|1){return Array.isArray(value)&&typeof value[index]==='number'?value[index] as number:0}
/* 根据 typeof value==='string' 的真假，分别返回 value 或 value===null?'null':typeof value==='object'?JSON.stringify(value):String(value)。 */ function displayPinValue(value:GraphValue){return typeof value==='string'?value:value===null?'null':typeof value==='object'?JSON.stringify(value):String(value)}
/* 调用 String(node.config.rhaiSourceOverride??node.config.source??'') 并返回调用结果。 */ function nodeCodeSource(node:GraphNode){return String(node.config.rhaiSourceOverride??node.config.source??'')}
/* 当 liveNodeValueMap.value.get(node.uuid) 为 null 或 undefined 时返回 []，否则保留左侧值。 */ function nodeLiveValues(node:GraphNode){return liveNodeValueMap.value.get(node.uuid)??[]}
/** 提交最多六万四千字符的节点代码或源码覆盖，并保证编辑高度。 */ function setNodeCodeSource(node:GraphNode,event:Event){const value=(event.target as HTMLTextAreaElement).value.slice(0,64_000);if(node.type.startsWith('code.'))node.config.source=value;else node.config.rhaiSourceOverride=value;node.size.height=Math.max(node.size.height,190);markDirty()}
/** 实时更新有限长度节点源码并保证高度，延迟编译。 */ function updateNodeCodeSource(node:GraphNode,event:Event){const value=(event.target as HTMLTextAreaElement).value.slice(0,64_000);if(node.type.startsWith('code.'))node.config.source=value;else node.config.rhaiSourceOverride=value;node.size.height=Math.max(node.size.height,190);markDirtyLive()}
/** 移除节点源码覆盖并记录草稿。 */ function clearNodeCodeOverride(node:GraphNode){delete node.config.rhaiSourceOverride;markDirty()}

/** 作用域变化时取消手势和布局，清除选择及测量，再重建路由与尺寸。 */ function scopeChanged(){cancelPointerGesture?.();cancelGraphLayout();selectedNodes.clear();selectedEdgeUuid.value='';pendingWire.value=null;measuredBounds.value={};measuredPorts.value={};invalidateRouting();triggerRef(graph);nextTick(queueNodeMeasurements)}
/** 设置活动作用域并执行统一切换清理。 */ function setActiveScope(uuid:string){activeScopeUuid.value=uuid;scopeChanged()}
/** 规范化替换图文档，修正失效作用域并清除选择、记录草稿。 */ function replaceGraph(document:NovaGraphDocument){graph.value=parseGraphDocument(serializeGraphDocument(document));if(activeScopeUuid.value!=='main'&&!graph.value.routines.some(/* 比较 item.uuid 与 activeScopeUuid.value，返回严格相等的判断结果。 */ item=>item.uuid===activeScopeUuid.value))activeScopeUuid.value='main';selectedNodes.clear();markDirty()}
/* 调用 graph.value.debug.breakpoints.some(point=>point.nodeUuid===nodeUuid&&point.enabled) 并返回调用结果。 */ function hasBreakpoint(nodeUuid:string){return graph.value.debug.breakpoints.some(/* 先计算 point.nodeUuid===nodeUuid；仅当其为真值时求右侧 point.enabled，返回短路求值结果。 */ point=>point.nodeUuid===nodeUuid&&point.enabled)}
/** 切换已有节点断点启用状态，或创建默认断点。 */ function toggleBreakpoint(nodeUuid:string){const existing=graph.value.debug.breakpoints.find(/* 比较 point.nodeUuid 与 nodeUuid，返回严格相等的判断结果。 */ point=>point.nodeUuid===nodeUuid);if(existing)existing.enabled=!existing.enabled;else graph.value.debug.breakpoints.push({nodeUuid,enabled:true,condition:'',hitCondition:0,logMessage:'',hitCount:0});markDirty()}
/* 调用 graphDebugState.errors.some(item=>item.graphUuid===graph.value.uuid&&item.nodeUuid===nodeUuid) 并返回调用结果。 */ function hasNodeError(nodeUuid:string){return graphDebugState.errors.some(/* 先计算 item.graphUuid===graph.value.uuid；仅当其为真值时求右侧 item.nodeUuid===nodeUuid，返回短路求值结果。 */ item=>item.graphUuid===graph.value.uuid&&item.nodeUuid===nodeUuid)}

/** 查找诊断节点所属作用域，选中并居中该节点，更新后聚焦编辑器。 */ function focusDiagnostic(diagnostic:GraphDiagnostic){if(!diagnostic.nodeUuid)return;const owner=graphScopes().map(/** 为图作用域附加主图或例程标识。 */ (scope,index)=>({scope,uuid:index===0?'main':graph.value.routines[index-1].uuid})).find(/** 判断当前作用域是否拥有诊断指向节点。 */ item=>item.scope.nodes.some(/* 比较 node.uuid 与 diagnostic.nodeUuid，返回严格相等的判断结果。 */ node=>node.uuid===diagnostic.nodeUuid));if(!owner)return;activeScopeUuid.value=owner.uuid;const node=owner.scope.nodes.find(/* 比较 item.uuid 与 diagnostic.nodeUuid，返回严格相等的判断结果。 */ item=>item.uuid===diagnostic.nodeUuid)!;selectedNodes.clear();selectedNodes.add(node.uuid);owner.scope.viewport.x=canvasSize.width*.5-(node.position.x+node.size.width*.5)*owner.scope.viewport.zoom;owner.scope.viewport.y=canvasSize.height*.5-(node.position.y+node.size.height*.5)*owner.scope.viewport.zoom;triggerRef(graph);nextTick(/* 调用 editorRoot.value?.focus({preventScroll:true}) 并返回调用结果。 */ ()=>editorRoot.value?.focus({preventScroll:true}))}
/** 处理保存、撤销重做、复制、缩放、节点键盘导航和删除，避免干扰文本输入。 */ function onKeydown(event:KeyboardEvent){
  const target=event.target as HTMLElement,editing=target.matches('input,textarea,select,[contenteditable=true]'),command=event.ctrlKey||event.metaKey,key=event.key.toLowerCase()
  if(event.key==='Escape'){cancelPointerGesture?.();pendingWire.value=null;wireStatus.value='';return}
  if(command&&key==='s'){event.preventDefault();saveGraph();return}
  if(editing)return
  if(command&&key==='z'){event.preventDefault();event.shiftKey?redo():undo();return}
  if(command&&key==='y'){event.preventDefault();redo();return}
  if(target.matches('button'))return
  if(command&&key==='d'){event.preventDefault();duplicateSelected()}
  else if(command&&(event.key==='+'||event.key==='=')){event.preventDefault();changeZoom(.1)}
  else if(command&&event.key==='-'){event.preventDefault();changeZoom(-.1)}
  else if(command&&event.key==='0'){event.preventDefault();resetZoom()}
  else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)&&target.classList.contains('graph-node')){
    event.preventDefault();const directions:Record<string,'left'|'right'|'up'|'down'>={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'},next=nearestGraphNode(activeScope.value.nodes,target.dataset.nodeUuid??'',directions[event.key],measuredBounds.value)
    if(next){selectedNodes.clear();selectedNodes.add(next.uuid);selectedEdgeUuid.value='';revealNode(next);nextTick(/* 调用 nodeElements.get(next.uuid)?.focus({preventScroll:true}) 并返回调用结果。 */ ()=>nodeElements.get(next.uuid)?.focus({preventScroll:true}))}
  }else if(event.key==='Enter'&&target.classList.contains('graph-node')){event.preventDefault();openDetails()}
  else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();selectedEdge.value?disconnectEdge():deleteSelected()}
  else if(event.key===' '){event.preventDefault();openPalette();nextTick(/* 调用 paletteInput.value?.focus() 并返回调用结果。 */ ()=>paletteInput.value?.focus())}
  else if(key==='f'){event.preventDefault();frameAll()}
}
/** 节点超出视口边距时居中显示。 */ function revealNode(node:GraphNode){const size=nodeSize(node),view=activeScope.value.viewport,x=node.position.x*view.zoom+view.x,y=node.position.y*view.zoom+view.y;if(x<20||y<20||x+size.width*view.zoom>canvasSize.width-20||y+size.height*view.zoom>canvasSize.height-20){view.x=canvasSize.width/2-(node.position.x+size.width/2)*view.zoom;view.y=canvasSize.height/2-(node.position.y+size.height/2)*view.zoom;triggerRef(graph)}}


/* 调用 graphEditorNodeSize(node,measuredBounds.value[node.uuid]) 并返回调用结果。 */ function nodeSize(node:GraphNode){return graphEditorNodeSize(node,measuredBounds.value[node.uuid])}
/** 由节点位置、折叠状态和积木家族生成样式。 */ function nodeStyle(node:GraphNode){return{left:`${node.position.x}px`,top:`${node.position.y}px`,width:`${node.size.width}px`,minHeight:`${node.collapsed?38:node.type.startsWith('rhai.')?64:node.size.height}px`,'--block-color':familyColor[scratchFamilyForNode(node)]}}
/** 由批注位置、尺寸、折叠状态及颜色生成样式。 */ function commentStyle(comment:GraphComment){return{left:`${comment.position.x}px`,top:`${comment.position.y}px`,width:`${comment.size.width}px`,height:`${comment.collapsed?34:comment.size.height}px`,background:`color-mix(in srgb,${comment.color} 10%,transparent)`}}
/* 当 graphNodeDefinition(node.type,graph.value,activeRoutine.value)?.color 为 null 或 undefined 时返回 '#8a9aae'，否则保留左侧值。 */ function nodeColor(node:GraphNode){return graphNodeDefinition(node.type,graph.value,activeRoutine.value)?.color??'#8a9aae'}
/** 根据节点语法、事件、控制流和输出类型判断积木外形。 */ function blockKind(node:GraphNode){if(node.type.startsWith('rhai.'))return'block-syntax';if(node.type.startsWith('event.')||node.type.startsWith('custom.event.')||node.type==='routine.entry')return'block-hat';if(node.type==='flow.branch'||node.type==='flow.repeat')return'block-control';if(!node.pins.some(/* 比较 pin.kind 与 'execution'，返回严格相等的判断结果。 */ pin=>pin.kind==='execution'))return node.pins.some(/* 先计算 pin.valueType==='Boolean'；仅当其为真值时求右侧 pin.direction==='output'，返回短路求值结果。 */ pin=>pin.valueType==='Boolean'&&pin.direction==='output')?'block-boolean':'block-reporter';return'block-stack'}
/** 优先使用语法分类翻译，再仅从自有分类键取翻译，未知分类保留原文。 */ function localizedCategory(category:string){const syntaxLabel=syntaxCategoryLabel(category,preferencesState.locale);if(syntaxLabel)return syntaxLabel;const keys:Record<string,string>={Events:'graphCategoryEvents',Flow:'graphCategoryFlow',Values:'graphCategoryValues',Variables:'graphCategoryVariables',Math:'graphCategoryMath',Comparison:'graphCategoryComparison',Conversion:'graphCategoryConversion',Functions:'graphCategoryFunctions',Libraries:'graphCategoryLibraries'};return Object.prototype.hasOwnProperty.call(keys,category)?t(keys[category]):category}
/** 将图横坐标映射到缩略图横坐标。 */ function miniX(x:number){const b=minimapBounds.value;return 8+(x-b.minX)/b.width*184}/** 将图纵坐标映射到缩略图纵坐标。 */ function miniY(y:number){const b=minimapBounds.value;return 18+(y-b.minY)/b.height*94}
/** 拖动缩略图定位主视口，取消恢复原视口和脏状态。 */ function navigateMinimap(event:PointerEvent){const svg=event.currentTarget as SVGSVGElement,scope=activeScope.value,bounds=minimapBounds.value,original={...scope.viewport},beforeDirty=dirty.value;let moved=false;const move=/** 把缩略图指针样本合并到下一视觉帧。 */ (next:PointerEvent)=>queueVisual(/** 限制缩略图指针范围并转换为世界位置，使其居中到主视口。 */ ()=>{const rect=svg.getBoundingClientRect(),localX=Math.min(192,Math.max(8,(next.clientX-rect.left)/Math.max(1,rect.width)*200)),localY=Math.min(112,Math.max(18,(next.clientY-rect.top)/Math.max(1,rect.height)*120)),worldX=bounds.minX+(localX-8)/184*bounds.width,worldY=bounds.minY+(localY-18)/94*bounds.height;scope.viewport={...scope.viewport,x:canvasSize.width*.5-worldX*scope.viewport.zoom,y:canvasSize.height*.5-worldY*scope.viewport.zoom};dirty.value=true;moved=true});trackPointerGesture(event,move,/** 取消缩略图导航时恢复视口，否则记录有效导航。 */ cancelled=>{if(cancelled){scope.viewport=original;dirty.value=beforeDirty}else if(moved)commitViewportHistory()})}
const selectionBoxStyle=computed(/** 把当前框选矩形转换为绝对定位样式。 */ ()=>selectionBox.value?{left:`${selectionBox.value.x}px`,top:`${selectionBox.value.y}px`,width:`${selectionBox.value.width}px`,height:`${selectionBox.value.height}px`}:{})

/** 仅连线期间保留最新指针样本，每显示帧更新一次预览端点。 */ function pointerMove(event:PointerEvent){if(!pendingWire.value||!canvas.value)return;queuedPointerEvent=event;if(pointerFrame)return;pointerFrame=requestAnimationFrame(/** 清除指针帧状态并将最新样本转换为图坐标。 */ ()=>{pointerFrame=0;const latest=queuedPointerEvent;queuedPointerEvent=null;if(latest&&canvas.value)pointerGraph.value=eventGraphPoint(latest)})}
/** 关联图同步事件仅重新加载当前未编辑图，保护脏草稿。 */ function linkedGraphSynchronized(event:Event){const uuid=(event as CustomEvent<{graphAssetUuid:string}>).detail?.graphAssetUuid;if(uuid&&uuid===activeAsset.value?.uuid&&!dirty.value)openGraph(uuid)}
watch(dirty,/** 把当前图脏状态同步到共享工作区。 */ value=>{studio.activeGraphDirty=value},{immediate:true})
watch(/* 返回 studio.activeGraphUuid 的当前值。 */ ()=>studio.activeGraphUuid,/** 活动图标识变化且不同于已加载资源时打开该图。 */ (uuid)=>{if(uuid&&uuid!==loadedAssetUuid.value)openGraph(uuid)})
watch(/* 返回 assetState.generation 的当前值。 */ ()=>assetState.generation,/** 没有有效活动图时打开列表中的首个图资源。 */ ()=>{if(!activeAsset.value&&graphAssets.value[0])openGraph(graphAssets.value[0].uuid)})
onMounted(/** 挂载时安装节点与画布尺寸观测、保存入口和同步监听，并按优先级打开图资源。 */ ()=>{nodeObserver=new ResizeObserver(queueNodeMeasurements);for(const element of nodeElements.values())nodeObserver.observe(element);queueNodeMeasurements();studio.saveActiveGraph=saveGraph;window.addEventListener('pointermove',pointerMove);window.addEventListener('nova-linked-graph-synchronized',linkedGraphSynchronized);resizeObserver=new ResizeObserver(/** 按观测目标更新画布尺寸或工作区宽度及紧凑布局标记。 */ entries=>{for(const entry of entries){const rect=entry.contentRect;if(entry.target===canvas.value){canvasSize.width=Math.max(1,rect.width);canvasSize.height=Math.max(1,rect.height)}else if(entry.target===graphBody.value&&rect.width>0){graphBodyWidth.value=rect.width;compactLayout.value=rect.width<640}}});if(canvas.value)resizeObserver.observe(canvas.value);if(graphBody.value)resizeObserver.observe(graphBody.value);const selected=assetState.records.find(/* 先计算 asset.uuid===studio.activeGraphUuid；仅当其为真值时求右侧 asset.assetType==='visualScript'，返回短路求值结果。 */ asset=>asset.uuid===studio.activeGraphUuid&&asset.assetType==='visualScript')??assetState.records.find(/* 先计算 asset.uuid===assetState.selectedGuid；仅当其为真值时求右侧 asset.assetType==='visualScript'，返回短路求值结果。 */ asset=>asset.uuid===assetState.selectedGuid&&asset.assetType==='visualScript')??graphAssets.value[0];if(selected)openGraph(selected.uuid)})
// KeepAlive retains graph/history, while detached panes stop geometry and gesture work.
onDeactivated(() => {
  editorActive=false; cancelInitialLayout(); cancelPointerGesture?.(); flushVisualQueue(); finishViewportHistory(); cancelGraphLayout(); cancelRouting();
  nodeObserver?.disconnect(); resizeObserver?.disconnect(); window.removeEventListener('pointermove',pointerMove);
  if(measurementFrame)cancelAnimationFrame(measurementFrame); measurementFrame=0;
  if(pointerFrame)cancelAnimationFrame(pointerFrame); pointerFrame=0; queuedPointerEvent=null; pendingWire.value=null;
  if(compileTimer!==undefined)window.clearTimeout(compileTimer); compileTimer=undefined;
  const candidate=graphDraftCandidate(); if(candidate)retainStudioDraft(candidate);
})
onActivated(() => {
  editorActive=true; for(const element of nodeElements.values())nodeObserver?.observe(element);
  if(canvas.value)resizeObserver?.observe(canvas.value); if(graphBody.value)resizeObserver?.observe(graphBody.value);
  window.addEventListener('pointermove',pointerMove); studio.saveActiveGraph=saveGraph;
  nextTick(() => { if(editorActive){queueNodeMeasurements();scheduleRouting();scheduleCompile(0)} });
})
onBeforeUnmount(/** 卸载时保存草稿并清理布局、路由、监听、尺寸观测和所有帧计时任务。 */ ()=>{cancelInitialLayout();cancelPointerGesture?.();flushVisualQueue();finishViewportHistory();const candidate=graphDraftCandidate();if(candidate)retainStudioDraft(candidate);unregisterDraftOwner();editorDisposed=true;cancelGraphLayout();cancelRouting();nodeObserver?.disconnect();if(measurementFrame)cancelAnimationFrame(measurementFrame);nodeElements.clear();if(studio.saveActiveGraph===saveGraph)studio.saveActiveGraph=null;studio.activeGraphDirty=dirty.value;window.removeEventListener('pointermove',pointerMove);window.removeEventListener('nova-linked-graph-synchronized',linkedGraphSynchronized);if(compileTimer!==undefined)window.clearTimeout(compileTimer);if(viewportHistoryTimer!==undefined)window.clearTimeout(viewportHistoryTimer);if(visualFrame)cancelAnimationFrame(visualFrame);if(pointerFrame)cancelAnimationFrame(pointerFrame);resizeObserver?.disconnect()})
</script>

<style scoped>
.graph-editor { container: graph-studio / inline-size; height: 100%; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; outline: 0; background: var(--bg-canvas); }
.graph-toolbar { position: relative; z-index: 30; flex: 0 0 auto; min-height: var(--ui-toolbar-height); padding: var(--space-1) var(--space-2); display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); border-bottom: var(--ui-border-width) solid var(--border-subtle); background: var(--surface-1); }
.primary-actions,.authoring-switch { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-control-gap); min-width: 0; }.scope-picker { max-width: 22ch; flex: 0 1 auto; }.graph-status { margin-inline-start: auto; color: var(--success); font-size: var(--type-caption); overflow-wrap: anywhere; }.graph-status.invalid { color: var(--danger); }
.graph-more { position: relative; margin-inline-start: auto; }.editing-actions { position: absolute; z-index: 40; inset-inline-end: 0; top: 100%; width: min(42ch,calc(100cqw - 2 * var(--space-2))); max-height: 65vh; display: flex; flex-direction: column; gap: var(--ui-control-gap); overflow: auto; border: var(--ui-border-width) solid var(--border-strong); background: var(--surface-popover); box-shadow: var(--shadow-md); padding: var(--space-3); border-radius: var(--radius-floating); }.editing-actions button { justify-content: start; text-align: start; white-space: normal; }
.graph-save-error,.graph-layout-status { flex: 0 0 auto; margin: 0; padding: var(--space-1) var(--space-2); font-size: var(--type-caption); overflow-wrap: anywhere; border-bottom: var(--ui-border-width) solid var(--border-subtle); }.graph-save-error { color: var(--danger); }.graph-layout-status { max-height: calc(3 * var(--ui-tree-row-height)); overflow: auto; }
.graph-body { position: relative; min-width: 0; min-height: 0; flex: 1; display: grid; overflow: hidden; isolation: isolate; }
.graph-palette,.graph-details { position: relative; z-index: 6; min-width: 0; min-height: 0; max-width: 100%; display: flex; flex-direction: column; overflow: hidden; background: var(--surface-1); }.graph-palette { border-right: var(--ui-border-width) solid var(--border-subtle); }.graph-details { container: graph-details / inline-size; border-left: var(--ui-border-width) solid var(--border-subtle); }
.graph-palette > header,.graph-details > header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; border-bottom: var(--ui-border-width) solid var(--border-subtle); min-height: var(--ui-panel-header-height); padding: var(--space-1) var(--ui-panel-inset); gap: var(--ui-control-gap); }.graph-palette > input { flex-shrink: 0; margin: var(--ui-panel-inset); max-width: calc(100% - 2 * var(--ui-panel-inset)); }
.block-categories { flex-shrink: 0; max-height: calc(5 * var(--ui-control-height)); overflow: auto; display: grid; border-bottom: var(--ui-border-width) solid var(--border-subtle); padding: var(--ui-panel-inset); gap: var(--ui-control-gap); grid-template-columns: repeat(auto-fit,minmax(min(100%,calc(120px * var(--ui-scale))),1fr)); }.block-categories button { display: flex; align-items: center; min-width: 0; text-align: start; font-size: var(--type-body); gap: var(--ui-control-gap); white-space: normal; }.block-categories i { width: var(--space-1); height: var(--space-1); flex: 0 0 var(--space-1); background: var(--family-color); }
.asset-list { flex-shrink: 0; max-height: calc(5 * var(--ui-standard-height)); overflow: auto; border-bottom: var(--ui-border-width) solid var(--border-subtle); padding: var(--ui-panel-inset); }.asset-list button,.palette-list button { width: 100%; min-width: 0; display: flex; align-items: center; text-align: start; padding: var(--space-3); gap: var(--ui-control-gap); }.asset-list span,.palette-list span { display: grid; min-width: 0; gap: var(--space-2); }.asset-list strong,.palette-list strong { font-size: var(--type-dense); overflow-wrap: anywhere; }.asset-list small,.palette-list small { color: var(--text-muted); font-size: var(--type-caption); overflow-wrap: anywhere; }.palette-list { flex: 1; min-height: 0; overflow: auto; padding: var(--ui-panel-inset); }.palette-list h3 { color: var(--text-secondary); font-size: var(--type-section); margin: var(--ui-section-gap) 0 var(--ui-heading-content-gap); }.palette-list button > i { width: var(--space-1); align-self: stretch; flex: 0 0 var(--space-1); }.empty { padding: var(--space-2); color: var(--text-muted); font-size: var(--type-caption); }
.graph-details-content { flex: 1; min-height: 0; min-width: 0; overflow: auto; overscroll-behavior: contain; }.graph-summary,.variables,.diagnostics,.syntax-fields,.graph-symbol-search,.wire-inspector { min-width: 0; display: grid; border-bottom: var(--ui-border-width) solid var(--border-subtle); font-size: var(--type-dense); padding: var(--ui-panel-inset); gap: var(--ui-field-gap); }.graph-summary label,.syntax-fields label { min-width: 0; display: grid; color: var(--text-secondary); gap: var(--ui-label-control-gap); }.graph-summary > div { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-2); font-size: var(--type-caption); color: var(--text-muted); }
.variables > header,.diagnostics > header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ui-control-gap); min-height: var(--ui-standard-height); }.variables article { display: grid; border-bottom: var(--ui-border-width) solid var(--border-subtle); gap: var(--ui-field-gap); padding-block: var(--ui-field-gap); }.variables article > div:first-child { flex-wrap: wrap; display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,calc(144px * var(--ui-scale))),1fr)); gap: var(--ui-control-gap); }.variables article label { display: flex; align-items: center; gap: var(--ui-control-gap); font-size: var(--type-body); }.number-metadata { flex-wrap: wrap; display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,calc(144px * var(--ui-scale))),1fr)); gap: var(--ui-control-gap); }.variables > p,.syntax-fields p,.wire-inspector p { font-size: var(--type-caption); line-height: var(--line-body); color: var(--text-muted); overflow-wrap: anywhere; }
.syntax-fields .syntax-optional { grid-template-columns: auto minmax(0,1fr); align-items: start; }.syntax-child-list { display: grid; border-top: var(--ui-border-width) solid var(--border-subtle); gap: var(--ui-field-gap); padding-top: var(--ui-heading-content-gap); }.syntax-child-list article { display: grid; gap: var(--ui-control-gap); }.syntax-child-list article > div { display: flex; gap: var(--ui-control-gap); flex-wrap: wrap; }.syntax-fields button { white-space: normal; text-align: start; }.graph-conversion { border-bottom: var(--ui-border-width) solid var(--border-subtle); }.graph-symbol-search button { display: grid; text-align: start; white-space: normal; }.graph-symbol-search small { color: var(--text-muted); }.reroute-row { display: grid; align-items: end; grid-template-columns: repeat(auto-fit,minmax(min(100%,calc(144px * var(--ui-scale))),1fr)); gap: var(--ui-control-gap); }.reroute-row > span { grid-column: 1 / -1; }
.graph-diagnostic { min-width: 0; }.graph-diagnostic > button { width: 100%; display: flex; gap: var(--space-2); padding: var(--space-1); text-align: start; }.graph-diagnostic > button > i { width: var(--space-2); height: var(--space-2); margin-top: var(--space-1); flex: 0 0 var(--space-2); border-radius: 50%; background: var(--warning); }.graph-diagnostic > button.error > i { background: var(--danger); }.graph-diagnostic > button.info > i { background: var(--accent); }.graph-diagnostic > button span { min-width: 0; display: grid; }.graph-diagnostic small { color: var(--text-muted); font-size: var(--type-caption); overflow-wrap: anywhere; }.diagnostics .valid { color: var(--success); }.diagnostics pre { max-height: calc(12 * var(--ui-control-height)); margin: 0; overflow: auto; background: var(--bg-canvas); white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--type-code); line-height: var(--line-body); padding: var(--space-3); }
.canvas-controls { position: absolute; z-index: 8; left: var(--space-2); bottom: var(--space-2); max-width: calc(100% - 2 * var(--space-2)); display: flex; align-items: center; gap: var(--ui-control-gap); overflow-x: auto; border: var(--ui-border-width) solid var(--border-strong); background: var(--surface-1); border-radius: var(--radius-floating); padding: var(--space-1); }.canvas-controls button { flex-shrink: 0; }.canvas-controls .zoom-value { min-width: 6ch; }.canvas-controls :deep(.ui-slider) { flex: 0 0 auto; }
.open-palette,.open-details { position: absolute; z-index: 9; top: var(--space-2); max-width: calc(50% - 2 * var(--space-2)); display: flex; align-items: center; gap: var(--space-1); background: var(--surface-1); border: var(--ui-border-width) solid var(--border-strong); }.open-palette { left: var(--space-2); }.open-details { right: var(--space-2); }.graph-hint { position: absolute; left: var(--space-2); bottom: calc(var(--ui-control-height) + var(--space-4)); font-size: var(--type-caption); color: var(--text-muted); pointer-events: none; }
.drawer-layout .graph-palette,.drawer-layout .graph-details { position: absolute; z-index: 20; top: 0; bottom: 0; box-shadow: var(--shadow-lg); }.drawer-layout .graph-palette { left: 0; }.drawer-layout .graph-details { right: 0; }.drawer-layout .graph-canvas { grid-column: 1; height: 100%; }
@container graph-studio (max-width: 48em) { .graph-status { flex-basis: 100%; }.authoring-switch { margin-inline-start: auto; } }
/* Canvas coordinates, pin hit areas and routing geometry are intentionally local. */
.syntax-pin-fallback{min-width:0;max-width:130px;overflow-wrap:anywhere;white-space:normal!important;color:var(--text-muted);font: 14px/1.5 var(--font-mono);}
.graph-canvas{position:relative;z-index:1;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;overscroll-behavior:contain;touch-action:none;background:var(--bg-canvas);cursor:grab}
.graph-canvas.is-panning{cursor:grabbing}
.graph-canvas.connecting{cursor:crosshair}
.graph-grid{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,var(--border-strong) 1px,transparent 1.25px);opacity:.55}
.graph-transform{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;--type-body: 16px;--type-dense: 16px;--type-caption: 14px;--type-code: 14px;--ui-icon-size: 20px;--line-body: 1.5;--line-control: 1.5;}
.wires{width:1px;height:1px;overflow:visible;pointer-events:none}
.wires path{fill:none;stroke:var(--text-muted);stroke-width:2;vector-effect:non-scaling-stroke;filter:drop-shadow(0 1px 2px rgba(0,0,0,.25))}
.wires path.execution{stroke:var(--text-primary);stroke-width:2.5}
.wires path.boolean{stroke:var(--danger)}
.wires path.number{stroke:var(--success)}
.wires path.string{stroke:var(--warning)}
.wires path.vec2{stroke:var(--accent)}
.wires path.entity{stroke:var(--accent-secondary)}
.wires path.resource{stroke:var(--creation)}
.wires path.pending{stroke:var(--accent);stroke-dasharray:5 4}
.wires path.active{stroke:var(--accent);stroke-width:4;stroke-dasharray:9 6;animation:graph-wire-flow .55s linear infinite;filter:drop-shadow(0 0 5px var(--accent))}
.comments,.nodes-layer{width:1px;height:1px;overflow:visible}
.graph-comment{position:absolute;border:1px solid var(--border-strong);border-radius:12px;pointer-events:auto}
.graph-comment>header{height:34px;padding:0 6px 0 9px;display:flex;align-items:center;border-top:3px solid;border-radius:10px 10px 0 0;background:color-mix(in srgb,var(--surface-1) 88%,transparent)}
.graph-comment input{min-width:0;flex:1;border:0;background:transparent;font-weight:700;text-align:end;height: 28px;min-height: 28px;padding: 2px 6px;font-size: 16px;line-height: 24px;}
.graph-comment button{width:26px;height:26px;border:0;background:transparent}
.graph-comment.collapsed{overflow:hidden}
.graph-node{position:absolute;overflow:visible;border:1px solid var(--border-strong);border-radius:11px;pointer-events:auto;color:var(--text-primary);background:color-mix(in srgb,var(--surface-2) 97%,transparent);box-shadow:var(--shadow-md);cursor:default}
.graph-node.covered{border-bottom-color:color-mix(in srgb,var(--success) 65%,var(--border-strong))}
.graph-node.selected{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft),var(--shadow-lg)}
.graph-node.executing{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft),0 0 18px color-mix(in srgb,var(--accent) 45%,transparent)}
.graph-node.failed{border-color:var(--danger)}
.graph-node>header{height:40px;padding:0 6px 0 5px;display:flex;align-items:center;gap:7px;border-radius:10px 10px 0 0;background:linear-gradient(100deg,color-mix(in srgb,var(--node-color) 22%,var(--surface-3)),var(--surface-2));cursor:grab;user-select:none}
.graph-node>header:active{cursor:grabbing}
.graph-node>header>i{width:8px;height:8px;border-radius:50%;background:var(--node-color);box-shadow:0 0 9px var(--node-color)}
.graph-node>header strong{min-width:0;overflow:hidden;flex:1;font-size:var(--type-body);text-overflow:ellipsis;white-space:nowrap}
.graph-node>header small{max-width:38%;overflow:hidden;color:var(--text-muted);font-size:var(--type-caption);text-overflow:ellipsis;white-space:nowrap}
.graph-node>header button{width:24px;height:24px;flex:0 0 auto;border:0;border-radius:7px;background:transparent}
.breakpoint-toggle{position:relative;width:17px!important;height:26px!important;flex:0 0 17px}
.breakpoint-toggle::after{content:'';position:absolute;inset:8px 4px;width:8px;height:8px;border:1px solid color-mix(in srgb,var(--text-muted) 70%,transparent);border-radius:50%;background:var(--surface-2)}
.graph-node.breakpoint .breakpoint-toggle::after{border-color:var(--danger);background:var(--danger);box-shadow:0 0 7px color-mix(in srgb,var(--danger) 70%,transparent)}
.node-pins{padding:8px 0 9px;display:grid;gap:3px}
.node-pin{position:relative;min-height:27px;padding:3px 11px;display:flex;align-items:center;gap:7px}
.node-pin.output{flex-direction:row-reverse;text-align:right}
.node-pin>span{min-width:0;overflow:hidden;flex:1;color:var(--text-secondary);font-size:var(--type-caption);line-height:1.35;text-overflow:ellipsis;white-space:nowrap}
.pin-dot{position:absolute;left:-7px;width:14px;height:14px;padding:0;border:2px solid var(--text-muted);border-radius:50%;background:var(--surface-1)}
.node-pin.output .pin-dot{right:-7px;left:auto}
.pin-dot:hover{transform:scale(1.3);border-color:var(--accent)}
.pin-dot.boolean{border-color:var(--danger)}
.pin-dot.number{border-color:var(--success)}
.pin-dot.string{border-color:var(--warning)}
.pin-dot.vec2{border-color:var(--accent)}
.pin-dot.entity{border-color:var(--accent-secondary)}
.pin-dot.resource{border-color:var(--creation)}
.execution .pin-dot{border-radius:3px;transform:rotate(45deg);border-color:var(--text-primary)}
.node-pin input[type=text],.node-pin input[type=number],.graph-node>select{min-width:0;width:92px;text-align:end;min-height: 28px;height: 28px;padding: 1px 6px;border-width: 1px;font-size: 16px;line-height: 24px;}
.node-pin input[type=checkbox]{width:16px;height:16px}
.vec-input{width:112px;display:flex;gap:4px}
.vec-input input{width:54px!important}
.graph-node>select{width:calc(100% - 18px);margin:0 9px 9px;text-align-last:start}
.selection-box{position:absolute;z-index:3;pointer-events:none;border:1px solid var(--accent);background:var(--accent-soft)}
.minimap{position:absolute;z-index:7;right:12px;bottom:12px;width:210px;overflow:hidden;border:1px solid var(--border-strong);box-shadow:var(--shadow-md);height: auto;max-width: calc(100% - 2 * var(--space-3));border-radius: var(--radius-panel);background: var(--surface-1);backdrop-filter: none;}
.minimap header{color:var(--text-muted);letter-spacing:.05em;height: auto;min-height: var(--ui-panel-header-height);padding: var(--space-3) var(--space-4);font-size: var(--type-body);line-height: var(--line-body);overflow-wrap: anywhere;text-transform: none;}
.minimap svg{width:100%;height:120px;cursor:crosshair}
.minimap rect{fill:var(--text-muted);rx:2}
.minimap rect.selected{fill:var(--accent)}
.minimap rect.viewport{fill:color-mix(in srgb,var(--accent) 12%,transparent);stroke:var(--accent);stroke-width:1;vector-effect:non-scaling-stroke;pointer-events:none}
@keyframes graph-wire-flow{to{stroke-dashoffset:-15}}
@media(prefers-reduced-motion:reduce){.wires path.active{animation:none;stroke-dasharray:none}}
.node-source{margin:0 8px 8px;padding:6px;display:grid;gap:5px;border:1px solid color-mix(in srgb,var(--accent) 35%,var(--border-subtle));border-radius:7px;background:var(--bg-canvas)}
.node-source span{color:var(--accent);font-size:var(--type-caption)}
.node-source textarea{width:100%;min-height:78px;padding:6px;resize:vertical;border:1px solid var(--border-subtle);border-radius:6px;color:var(--text-primary);background:var(--surface-1);font: 14px/1.5 var(--font-mono);}
.node-source button{min-height:25px;border:1px solid var(--border-subtle);border-radius:6px;color:var(--text-secondary);background:var(--surface-3);padding: 0 6px;line-height: 21px;font-size: 14px;}
.blocks-mode .wires path.execution{display:none}
.blocks-mode .graph-node{overflow:visible;border:1px solid color-mix(in srgb,var(--block-color) 72%,#111);border-radius:9px;background:linear-gradient(180deg,color-mix(in srgb,var(--block-color) 92%,#fff),color-mix(in srgb,var(--block-color) 86%,#111));box-shadow:inset 0 1px rgba(255,255,255,.28),0 3px 7px rgba(0,0,0,.24);color:#fff}
.blocks-mode .graph-node>header{background:transparent;color:#fff}
.blocks-mode .graph-node>header>i{display:none}
.blocks-mode .graph-node>header small,.blocks-mode .node-pin>span{color:rgba(255,255,255,.82)}
.blocks-mode .graph-node.block-hat{border-radius:26px 10px 9px 9px}
.blocks-mode .graph-node.block-hat::before{content:'';position:absolute;left:18px;top:-8px;width:76px;height:16px;border-radius:50% 50% 0 0;background:var(--block-color)}
.blocks-mode .graph-node.block-reporter{border-radius:999px}
.blocks-mode .graph-node.block-boolean{clip-path:polygon(12px 0,calc(100% - 12px) 0,100% 50%,calc(100% - 12px) 100%,12px 100%,0 50%)}
.blocks-mode .graph-node.block-control{border-radius:9px 9px 9px 18px}
.blocks-mode .graph-node.block-control::after{content:'';position:absolute;left:18px;bottom:-6px;width:48px;height:7px;border-radius:0 0 8px 8px;background:var(--block-color)}
.blocks-mode .node-pin.execution{display:none}
.blocks-mode .pin-dot{display:none}
.blocks-mode .node-pin input,.blocks-mode .graph-node>select{border:1px solid rgba(0,0,0,.25);color:var(--text-primary);background:#fff}
.blocks-mode .node-source{border-color:rgba(255,255,255,.35);background:rgba(0,0,0,.18)}
.blocks-mode .node-source span{color:#fff}
.blocks-mode .node-source textarea{background:rgba(16,20,28,.92)}
.graph-canvas{contain:strict}
.pin-dot:hover,.pin-dot.compatible{transform:scale(1.3);border-color:var(--accent);box-shadow:0 0 0 4px var(--accent-soft)}
.graph-low-detail .wires path{filter:none}
.graph-low-detail .graph-node{box-shadow:var(--shadow-sm)}
.node-live-values{margin:0 8px 8px;padding:5px;display:grid;gap:3px;border:1px solid color-mix(in srgb,var(--success) 38%,var(--border-subtle));border-radius:7px;background:color-mix(in srgb,var(--success) 8%,var(--surface-1))}
.node-live-values span{min-width:0;display:grid;grid-template-columns:minmax(42px,.7fr) minmax(0,1fr);gap:5px;align-items:center}
.node-live-values b{overflow:hidden;color:var(--success);font-size:var(--type-caption);text-overflow:ellipsis}
.node-live-values code{min-width:0;overflow:hidden;color:var(--text-secondary);font:var(--type-caption) var(--font-mono);text-overflow:ellipsis;white-space:nowrap}
.graph-low-detail .node-live-values{display:none}
.drawer-layout .graph-canvas{grid-column:1;height:100%}
.wires path.routing-pending{stroke-dasharray:4 5;opacity:.5}
.graph-node.syntax-card,.blocks-mode .graph-node.syntax-card{border:1px solid color-mix(in srgb,var(--block-color) 50%,var(--border-strong));border-radius:9px;background:var(--surface-2);color:var(--text-primary);clip-path:none;box-shadow:var(--shadow-sm)}
.graph-node.syntax-card>header{height:auto;min-height:48px;padding:7px 6px;display:grid;grid-template-columns:17px minmax(0,1fr) 24px;gap:3px 6px;background:color-mix(in srgb,var(--block-color) 14%,var(--surface-3));color:var(--text-primary)}
.syntax-card>header>i{display:none}
.syntax-card>header strong{grid-column:2;grid-row:1;white-space:normal;overflow-wrap:anywhere;font-size:var(--type-body);line-height:1.35;overflow:visible}
.syntax-card>header small{grid-column:2;grid-row:2;max-width:none;white-space:normal;overflow-wrap:anywhere;color:var(--text-muted)}
.syntax-card>header>button:last-child{grid-column:3;grid-row:1/3}
.syntax-card .node-pin>span{white-space:normal;overflow-wrap:anywhere;overflow:visible;color:var(--text-secondary)}
.blocks-mode .syntax-card .pin-dot{display:block}
.syntax-card .pin-dot{width:18px;height:18px;left:-10px}
.syntax-card .node-pin.output .pin-dot{left:auto;right:-10px}
.pin-dot:focus-visible,.wire-point:focus-visible{outline:3px solid var(--accent);outline-offset:4px}
.pin-dot[aria-pressed=true]{background:var(--accent)}
.syntax-card .node-pin{min-height:31px}
.syntax-card .syntax-pin-fallback{flex:0 1 48%;text-align:right;font-family:var(--font-mono);color:var(--text-muted)}
.compact-nodes .syntax-card>header{min-height:38px;padding-block:4px}
.compact-nodes .syntax-card>header small{display:none}
.compact-nodes .syntax-card .node-pin{min-height:25px;padding-block:2px}
.compact-nodes .syntax-card .node-pins{padding-block:5px;gap:1px}
.wires path.selected{stroke:var(--accent);stroke-width:4}
.wires path.wire-hit{stroke:transparent;stroke-width:14;pointer-events:stroke;cursor:pointer;fill:none;vector-effect:non-scaling-stroke}
.wire-points{pointer-events:none;width:1px;height:1px;overflow:visible}
.wire-point{position:absolute;width:16px;height:16px;padding:0;transform:translate(-50%,-50%);pointer-events:auto;border:2px solid var(--accent);border-radius:3px;background:var(--surface-1);cursor:move}
.minimap.small-minimap{width:140px;height:100px;bottom:56px;right:8px}
.small-minimap svg{height:74px}
.small-minimap header{height:24px;padding:4px 7px}
.reroute-row>label{min-width:0;display:grid;gap:var(--ui-label-control-gap)}
.reroute-row>label input,.number-metadata input,.variables article>div:first-child>input,.variables article>div:first-child>select{width:100%;min-width:0}
.reroute-row>.ui-button,.variables article>div:first-child>.ui-button{grid-column:1/-1;inline-size:var(--ui-control-height);justify-self:end}
/* Diagram typography uses graph zoom; precise node/port/router coordinates stay local. */
.graph-transform :is(button,input,select){min-height:0;min-width:0}
.graph-transform button{padding:0}
.graph-transform .node-source button{padding:0 6px;min-height:25px}
</style>
