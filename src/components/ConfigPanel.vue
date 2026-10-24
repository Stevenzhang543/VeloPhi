<!-- 对象属性检查器：编辑实体组件、资源绑定及场景属性，协调验证和历史。 -->
<template>
  <div class="config-wrapper" data-doc="manual/inspector" :class="[dock,{'panel-maximized':workspaceState.maximizedPanel==='inspector'}]" :style="{ width: `${panelWidth}px` }">
    <PanelResizeHandle v-model="panelWidth" orientation="vertical" :minimum="260" :maximum="560" :reset-value="320" :reverse="dock==='right'" :label="t('inspector')" :disabled="workspaceState.maximizedPanel==='inspector'" @commit="estate.inspectorWidth=$event" />
    <PanelMaximizeButton panel="inspector" class="inspector-maximize" />
    <aside :data-resource-key="numericResourceKey" class="config-panel" data-ui-motion-surface="smooth" :data-ui-motion-key="numericResourceKey" :class="{ runtime: !canEdit }" :inert="!canEdit">
      <div v-if="selectedEntities.length" class="inspector-sticky">
        <!-- 26.44 G1: two rows. The name and Add component; then search with one filter menu
             (category, modified only, pinned only). An active filter shows as a token that clears it. -->
        <header class="inspector-header">
          <h3 :title="selectedEntities.length > 1 ? undefined : `${selectedEntity?.name} · ${selectedEntity?.uuid}`">{{ selectedEntities.length > 1 ? t('multiSelected', { count: selectedEntities.length }) : selectedEntity?.name }}</h3>
          <span v-if="selectedEntities.length === 1 && selectedEntity" class="entity-meta"><span>{{ selectedEntity.shapeType }}</span><span class="entity-id">#{{ selectedEntity.id }}</span></span>
          <UiButton icon="add" v-if="selectedEntity && addableComponents.length" class="add-component-trigger" :label="t('addComponent')" @click="openComponentPicker" />
        </header>
        <div class="inspector-search-row">
          <input v-model="estate.inspectorSearch" type="search" :placeholder="t('searchInspector')" :aria-label="t('searchInspector')">
          <button v-if="inspectorFilterActive" type="button" class="inspector-filter-token" :title="`${t('inspectorFilter')}: ${inspectorFilterSummary}`" :aria-label="`${inspectorFilterSummary} · ${t('clear')}`" @click="clearInspectorFilters"><span>{{ inspectorFilterSummary }}</span><EditorIcon name="close" /></button>
          <UiButton ref="filterTrigger" icon="filter" class="inspector-filter-trigger" :class="{ filtering: inspectorFilterActive }" :label="t('inspectorFilter')" aria-haspopup="menu" :aria-expanded="filterMenu.visible" @click.stop="toggleFilterMenu" />
        </div>
      </div>
      <div v-if="selectedEntities.length > 1" class="settings-content multi-inspector">
        <InspectorSection :title="t('sharedProperties')" category="general" open>
          <PropertyRow :label="t('entityEnabled')"><button class="batch-toggle" @click="toggleAll('enabled')">{{ sharedBoolean('enabled') }}</button></PropertyRow>
          <PropertyRow :label="t('entityVisible')"><button class="batch-toggle" @click="toggleAll('editorVisible')">{{ sharedBoolean('editorVisible') }}</button></PropertyRow>
          <PropertyRow :label="t('entityLocked')"><button class="batch-toggle" @click="toggleAll('editorLocked')">{{ sharedBoolean('editorLocked') }}</button></PropertyRow>
          <PropertyRow :label="t('sortingLayer')"><select v-model="multiLayer"><option value="">{{ t('mixed') }}</option><option v-for="layer in estate.layers" :key="layer" :value="String(layer)">{{ t('layer') }} {{ layer }}</option></select></PropertyRow>
          <PropertyRow :label="propertyCopy.positionMode"><select v-model="multiPositionMode" data-non-project-control><option value="center">{{ propertyCopy.center }}</option><option value="shared">{{ propertyCopy.shared }}</option></select></PropertyRow>
          <PropertyRow :label="t('position')"><div class="pair"><NumericExpressionInput :resource-key="numericResourceKey + multiPositionMode" :mixed="multiPositionMode === 'shared' && mixedPosition('x')" v-model="multiPositionX" /><NumericExpressionInput :resource-key="numericResourceKey + multiPositionMode" :mixed="multiPositionMode === 'shared' && mixedPosition('y')" v-model="multiPositionY" /></div></PropertyRow>
          <PropertyRow :label="t('entityTags')"><input :value="multiTags" :placeholder="t('mixed')" @change="setMultiTags(($event.target as HTMLInputElement).value)"></PropertyRow>
          <PropertyRow :label="t('entityGroups')"><input :value="multiGroups" :placeholder="t('mixed')" @change="setMultiGroups(($event.target as HTMLInputElement).value)"></PropertyRow>
          <p class="runtime-note">{{ t('multiInspectorCommonComponents', { count: commonComponentKinds.length }) }}</p>
        </InspectorSection>
        <p class="runtime-note">{{ t('runtimeIsolation') }}</p>
      </div>
      <div v-else-if="selectedEntity" class="settings-content" @change="onConfigChange" @pointerdown.capture="onInspectorPointerDown">
        <InspectorSection :title="t('transform2D')" category="transform" open>
          <ComponentTools kind="Transform2D" />
          <PropertyRow :label="t('parentEntity')"><select v-model="selectedParentUuid"><option value="">{{ t('noParent') }}</option><option v-for="entity in parentCandidates" :key="entity.uuid" :value="entity.uuid">{{ entity.name }}_{{ entity.id }}</option></select></PropertyRow>
          <PropertyRow :label="t('position')" path="Transform.position"><div class="pair"><NumericExpressionInput :resource-key="numericResourceKey" v-model="selectedEntity.transform.position.x" /><NumericExpressionInput :resource-key="numericResourceKey" v-model="selectedEntity.transform.position.y" /></div></PropertyRow>
          <PropertyRow :label="t('rotationDegrees')" path="Transform.rotation"><NumberRange v-model="rotationDegrees" :min="-180" :max="180" :step="1" /></PropertyRow>
          <PropertyRow :label="t('scale')" path="Transform.scale"><div class="pair"><NumericExpressionInput :resource-key="numericResourceKey" v-model="selectedEntity.transform.scale.x" :minimum="0.000001" /><NumericExpressionInput :resource-key="numericResourceKey" v-model="selectedEntity.transform.scale.y" :minimum="0.000001" /></div></PropertyRow>
        </InspectorSection>

        <InspectorSection v-if="selectedEntity.hasComponent('RigidBody2D')" :title="t('rigidBody2D')" category="physics" open>
          <ComponentTools kind="RigidBody2D" />
          <SimulationStatusPanel17 />
          <UiSegmented v-model="bodyType" class="body-type-segmented" :label="t('bodyType')" :items="[{ value: 'Dynamic', label: t('dynamic') }, { value: 'Kinematic', label: t('kinematic') }, { value: 'Static', label: t('static') }]" />
          <PropertyRow :label="t('massMode')"><select v-model="selectedEntity.rigidBody.massMode"><option value="Automatic">{{ t('automatic') }}</option><option value="Manual">{{ t('manualMass') }}</option></select></PropertyRow>
          <PropertyRow :label="t('continuousCollision')"><select v-model="selectedEntity.rigidBody.continuousCollision"><option value="Discrete">{{ t('discreteMode') }}</option><option value="Continuous">{{ t('continuousMode') }}</option></select></PropertyRow>
          <PropertyRow :label="t('transformOwnership')"><select v-model="selectedEntity.rigidBody.transformOwnership"><option value="Physics">{{ t('physicsOwned') }}</option><option value="Animation">{{ t('animationOwned') }}</option></select></PropertyRow>
          <PropertyRow :label="t('sleepingAllowed')"><ToggleSwitch v-model="selectedEntity.rigidBody.sleepingAllowed" /></PropertyRow>
          <PropertyRow :label="t('freezeRotation')"><ToggleSwitch v-model="selectedEntity.rigidBody.freezeRotation" /></PropertyRow>
        </InspectorSection>

        <InspectorSection :title="t('connections')" category="physics" :open="selectedConnections.length > 0">
          <div v-if="selectedConnections.length" class="connection-list">
            <article v-for="connection in selectedConnections" :key="connection.id" class="connection-item" :class="connection.breakState">
              <button class="connection-main" :title="connection.binding ? t('boundAsCompound') : undefined" @click="openConnection(connection.id)">
                <span class="connection-dot"></span>
                <span>
                  <strong>{{ connection.name }}</strong>
                  <small>
                    {{ connection.binding ? t('compound') : !connectionSharesLayer(connection, state.world.entities) ? t('layerIsolated') : t(connection.breakState) }}
                    <template v-if="connection.breakState !== 'intact' && connection.breakLink >= 0"> · {{ t('breakLocation', { link: connection.breakLink + 1 }) }}</template>
                    · {{ connection.anchors.length }} {{ t('entities').toLowerCase() }}
                  </small>
                </span>
              </button>
              <UiButton icon="restore" v-if="!connection.binding && connection.breakState !== 'intact'" class="mini-button" :title="t('repairConnection')" @click="repair(connection.id)" />
              <button v-if="connection.binding" class="mini-button separate" :title="t('separateBinding')" @click="separate(connection.id)">⇄</button>
              <UiButton icon="clear" class="mini-button danger" :title="t('deleteConnection')" @click="removeConnection(connection.id)" />
            </article>
          </div>
          <p v-else class="empty-state">{{ t('noConnections') }}</p>
          <UiButton icon="add" class="primary-action" @click="openConnection(null)">{{ t('addConnection') }}</UiButton>
        </InspectorSection>

        <InspectorSection v-if="selectedEntity.hasComponent('ShapeRenderer2D') && !selectedEntity.hasComponent('RectTransform')" :title="t('shapeRenderer2D')" category="render">
          <ComponentTools kind="ShapeRenderer2D" />
          <PropertyRow :label="t('sortingLayer')"><select v-model.number="selectedEntity.layer" @change="onLayerChange"><option v-for="layer in estate.layers" :key="layer" :value="layer">{{ t('layer') }} {{ layer }}</option></select></PropertyRow>
          <PropertyRow :label="t('orderInLayer')"><NumericExpressionInput v-model="selectedEntity.renderer.orderInLayer" :step="1" :resource-key="numericResourceKey + ':selectedEntity.renderer.orderInLayer'" /></PropertyRow>
          <PropertyRow :label="t('colorRgb')"><button class="color-well" :style="{ background: entityColor }" :aria-label="t('pickColor')" @click="openColorPicker"></button></PropertyRow>
          <PropertyRow :label="t('transparency')"><NumberRange v-model="selectedEntity.transparency" :min="0" :max="100" :step="1" /></PropertyRow>
          <PropertyRow :label="t('strokeColor')"><input type="color" :value="rgbHex(selectedEntity.renderer.strokeColor)" @input="setRgb(selectedEntity.renderer.strokeColor, $event)"></PropertyRow>
          <PropertyRow :label="t('strokeWidth')"><NumericExpressionInput v-model="selectedEntity.renderer.strokeWidth" :minimum="0" :step="0.1" :resource-key="numericResourceKey + ':selectedEntity.renderer.strokeWidth'" /></PropertyRow>
          <PropertyRow :label="t('strokeOpacity')"><NumberRange v-model="selectedEntity.renderer.strokeOpacity" :min="0" :max="100" :step="1" /></PropertyRow>
          <PropertyRow :label="t('material')"><select v-model="selectedEntity.renderer.material"><option value="Default">{{ t('default') }}</option><option v-for="asset in materialAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></PropertyRow>
          <PropertyRow :label="t('filterMode')"><select v-model="selectedEntity.renderer.filterMode"><option value="Linear">{{ t('linear') }}</option><option value="Nearest">{{ t('nearest') }}</option></select></PropertyRow>
          <PropertyRow :label="t('imageTexture')"><select v-model="selectedEntity.renderer.textureAsset"><option :value="null">{{ t('none') }}</option><option v-for="asset in imageAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></PropertyRow>
          <UiPropertyRow :label="t('importTexture')" class="stacked-field"><input ref="textureInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" @change="applyTexture"></UiPropertyRow>
          <button v-if="selectedEntity.renderer.textureAsset || selectedEntity.texture" class="secondary-action" @click="clearTexture">{{ t('removeTexture') }}</button>
        </InspectorSection>

        <InspectorSection v-if="selectedEntity.spriteRenderer" :title="t('spriteRenderer2D')" category="render" open>
          <ComponentTools kind="SpriteRenderer2D" />
          <PropertyRow :label="t('spriteAsset')"><select v-model="selectedEntity.spriteRenderer.spriteAsset"><option :value="null">{{ t('none') }}</option><option v-for="asset in imageAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></PropertyRow>
          <PropertyRow :label="t('tint')"><input type="color" :value="rgbHex(selectedEntity.spriteRenderer.tint)" @input="setRgb(selectedEntity.spriteRenderer!.tint, $event)"></PropertyRow>
          <PropertyRow :label="t('opacity')" path="Sprite.opacity"><NumberRange v-model="selectedEntity.spriteRenderer.opacity" :min="0" :max="100" :step="1" /></PropertyRow>
          <PropertyRow :label="t('spriteSize')" path="Sprite.size"><div class="pair"><NumericExpressionInput v-model="selectedEntity.spriteRenderer.size.x" :minimum="0.000001" :step="0.1" :resource-key="numericResourceKey + ':selectedEntity.spriteRenderer.size.x'" /><NumericExpressionInput v-model="selectedEntity.spriteRenderer.size.y" :minimum="0.000001" :step="0.1" :resource-key="numericResourceKey + ':selectedEntity.spriteRenderer.size.y'" /></div></PropertyRow>
          <PropertyRow :label="t('pivot')" path="Sprite.pivot"><div class="pair"><NumericExpressionInput v-model="selectedEntity.spriteRenderer.pivot.x" :minimum="0" :maximum="1" :step="0.05" :resource-key="numericResourceKey + ':selectedEntity.spriteRenderer.pivot.x'" /><NumericExpressionInput v-model="selectedEntity.spriteRenderer.pivot.y" :minimum="0" :maximum="1" :step="0.05" :resource-key="numericResourceKey + ':selectedEntity.spriteRenderer.pivot.y'" /></div></PropertyRow>
          <PropertyRow :label="t('flipX')" path="Sprite.flipX"><ToggleSwitch v-model="selectedEntity.spriteRenderer.flipX" /></PropertyRow>
          <PropertyRow :label="t('flipY')" path="Sprite.flipY"><ToggleSwitch v-model="selectedEntity.spriteRenderer.flipY" /></PropertyRow>
          <PropertyRow :label="t('sortingLayer')"><select v-model.number="selectedEntity.spriteRenderer.sortingLayer"><option v-for="layer in estate.layers" :key="layer" :value="layer">{{ t('layer') }} {{ layer }}</option></select></PropertyRow>
          <PropertyRow :label="t('orderInLayer')"><NumericExpressionInput v-model="selectedEntity.spriteRenderer.orderInLayer" :step="1" :resource-key="numericResourceKey + ':selectedEntity.spriteRenderer.orderInLayer'" /></PropertyRow>
          <PropertyRow :label="t('material')"><select v-model="selectedEntity.spriteRenderer.material"><option value="Default">{{ t('default') }}</option><option v-for="asset in materialAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></PropertyRow>
          <PropertyRow :label="t('filterMode')"><select v-model="selectedEntity.spriteRenderer.filterMode"><option value="Linear">{{ t('linear') }}</option><option value="Nearest">{{ t('nearest') }}</option></select></PropertyRow>
          <PropertyRow :label="t('normalMap')"><select v-model="selectedEntity.spriteRenderer.normalMapAsset"><option :value="null">{{ t('none') }}</option><option v-for="asset in imageAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></PropertyRow>
          <PropertyRow :label="t('lightMask')"><NumericExpressionInput v-model="selectedEntity.spriteRenderer.lightMask" :minimum="0" :maximum="4294967295" :step="1" :resource-key="numericResourceKey + ':selectedEntity.spriteRenderer.lightMask'" /></PropertyRow>
          <PropertyRow :label="t('nineSlice')"><ToggleSwitch v-model="selectedEntity.spriteRenderer.nineSlice.enabled" /></PropertyRow>
          <PropertyRow v-if="selectedEntity.spriteRenderer.nineSlice.enabled" :label="t('sliceBorders')"><div class="quad"><NumericExpressionInput v-model="selectedEntity.spriteRenderer.nineSlice.left" :minimum="0" :resource-key="numericResourceKey + ':selectedEntity.spriteRenderer.nineSlice.left'" /><NumericExpressionInput v-model="selectedEntity.spriteRenderer.nineSlice.top" :minimum="0" :resource-key="numericResourceKey + ':selectedEntity.spriteRenderer.nineSlice.top'" /><NumericExpressionInput v-model="selectedEntity.spriteRenderer.nineSlice.right" :minimum="0" :resource-key="numericResourceKey + ':selectedEntity.spriteRenderer.nineSlice.right'" /><NumericExpressionInput v-model="selectedEntity.spriteRenderer.nineSlice.bottom" :minimum="0" :resource-key="numericResourceKey + ':selectedEntity.spriteRenderer.nineSlice.bottom'" /></div></PropertyRow>
        </InspectorSection>

        <InspectorSection v-if="selectedEntity.textRenderer" :title="t('textRenderer2D')" category="render" open>
          <ComponentTools kind="TextRenderer2D" />
          <UiPropertyRow :label="t('textContent')" class="stacked-field"><textarea v-model="selectedEntity.textRenderer.text" rows="3"></textarea></UiPropertyRow>
          <PropertyRow :label="t('fontAsset')"><select v-model="selectedEntity.textRenderer.fontAsset"><option :value="null">{{ t('defaultFont') }}</option><option v-for="asset in fontAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></PropertyRow>
          <PropertyRow :label="t('fontSize')"><NumericExpressionInput v-model="selectedEntity.textRenderer.fontSize" :minimum="0.000001" :step="0.1" :resource-key="numericResourceKey + ':selectedEntity.textRenderer.fontSize'" /></PropertyRow>
          <PropertyRow :label="t('fontWeight')"><NumericExpressionInput v-model="selectedEntity.textRenderer.fontWeight" :minimum="100" :maximum="900" :step="100" :resource-key="numericResourceKey + ':selectedEntity.textRenderer.fontWeight'" /></PropertyRow>
          <PropertyRow :label="t('lineHeight')"><NumericExpressionInput v-model="selectedEntity.textRenderer.lineHeight" :minimum="0.1" :maximum="10" :step="0.1" :resource-key="numericResourceKey + ':selectedEntity.textRenderer.lineHeight'" /></PropertyRow>
          <PropertyRow :label="t('alignment')"><select v-model="selectedEntity.textRenderer.align"><option value="left">{{ t('left') }}</option><option value="center">{{ t('center') }}</option><option value="right">{{ t('right') }}</option></select></PropertyRow>
          <PropertyRow :label="t('textColor')"><input type="color" :value="rgbHex(selectedEntity.textRenderer.color)" @input="setRgb(selectedEntity.textRenderer!.color, $event)"></PropertyRow>
          <PropertyRow :label="t('opacity')"><NumberRange v-model="selectedEntity.textRenderer.opacity" :min="0" :max="100" :step="1" /></PropertyRow>
          <PropertyRow :label="t('maxWidth')"><NumericExpressionInput v-model="selectedEntity.textRenderer.maxWidth" :minimum="0" :step="0.1" :resource-key="numericResourceKey + ':selectedEntity.textRenderer.maxWidth'" /></PropertyRow>
          <PropertyRow :label="t('sortingLayer')"><select v-model.number="selectedEntity.textRenderer.sortingLayer"><option v-for="layer in estate.layers" :key="layer" :value="layer">{{ t('layer') }} {{ layer }}</option></select></PropertyRow>
          <PropertyRow :label="t('orderInLayer')"><NumericExpressionInput v-model="selectedEntity.textRenderer.orderInLayer" :step="1" :resource-key="numericResourceKey + ':selectedEntity.textRenderer.orderInLayer'" /></PropertyRow>
        </InspectorSection>

        <InspectorSection v-if="selectedEntity.camera2D" :title="t('camera2D')" category="render" open>
          <ComponentTools kind="Camera2D" />
          <PropertyRow :label="t('activeCamera')"><ToggleSwitch v-model="selectedEntity.camera2D.active" /></PropertyRow>
          <PropertyRow :label="t('orthographicSize')" path="Camera.orthographicSize"><NumericExpressionInput v-model="selectedEntity.camera2D.orthographicSize" :minimum="0.000001" :step="0.1" :resource-key="numericResourceKey + ':selectedEntity.camera2D.orthographicSize'" /></PropertyRow>
          <PropertyRow :label="t('cameraZoom')" path="Camera.zoom"><NumericExpressionInput v-model="selectedEntity.camera2D.zoom" :minimum="0.000001" :step="0.1" :resource-key="numericResourceKey + ':selectedEntity.camera2D.zoom'" /></PropertyRow>
          <PropertyRow :label="t('backgroundColor')"><input type="color" :value="rgbHex(selectedEntity.camera2D.backgroundColor)" @input="setRgb(selectedEntity.camera2D!.backgroundColor, $event)"></PropertyRow>
          <PropertyRow :label="t('pixelPerfect')" path="Camera.pixelPerfect"><ToggleSwitch v-model="selectedEntity.camera2D.pixelPerfect" /></PropertyRow>
          <PropertyRow :label="t('cameraPreview')"><ToggleSwitch v-model="selectedEntity.camera2D.previewInEditor" /></PropertyRow>
<!-- 相机跟随目标过滤回调排除当前选中实体。 -->          <PropertyRow :label="t('cameraFollowTarget')"><select v-model="selectedEntity.camera2D.followTargetUuid"><option :value="null">{{ t('none') }}</option><option v-for="entity in state.world.entities.filter(entity => entity !== selectedEntity)" :key="entity.uuid" :value="entity.uuid">{{ entity.name }}</option></select></PropertyRow>
          <PropertyRow :label="t('cameraSmoothing')"><ToggleSwitch v-model="selectedEntity.camera2D.smoothing.enabled" /></PropertyRow>
          <PropertyRow v-if="selectedEntity.camera2D.smoothing.enabled" :label="t('smoothingSpeed')" path="Camera.smoothingSpeed"><NumericExpressionInput v-model="selectedEntity.camera2D.smoothing.speed" :minimum="0" :step="0.1" :resource-key="numericResourceKey + ':selectedEntity.camera2D.smoothing.speed'" /></PropertyRow>
          <PropertyRow :label="t('cameraShakeOffset')" path="Camera.shakeOffset"><NumericExpressionInput v-model="selectedEntity.camera2D.shake.maxOffset" :minimum="0" :step="0.05" :resource-key="numericResourceKey + ':selectedEntity.camera2D.shake.maxOffset'" /></PropertyRow>
          <PropertyRow :label="t('cameraShakeAngle')" path="Camera.shakeAngle"><NumericExpressionInput v-model="selectedEntity.camera2D.shake.maxAngle" :minimum="0" :maximum="45" :step="0.5" :resource-key="numericResourceKey + ':selectedEntity.camera2D.shake.maxAngle'" /></PropertyRow>
          <PropertyRow :label="t('cameraShakeFrequency')" path="Camera.shakeFrequency"><NumericExpressionInput v-model="selectedEntity.camera2D.shake.frequency" :minimum="0" :maximum="120" :step="1" :resource-key="numericResourceKey + ':selectedEntity.camera2D.shake.frequency'" /></PropertyRow>
          <PropertyRow :label="t('cameraShakeRecovery')" path="Camera.shakeRecovery"><NumericExpressionInput v-model="selectedEntity.camera2D.shake.recovery" :minimum="0" :step="0.1" :resource-key="numericResourceKey + ':selectedEntity.camera2D.shake.recovery'" /></PropertyRow>
          <PropertyRow :label="t('cameraLimits')"><ToggleSwitch v-model="selectedEntity.camera2D.limits.enabled" /></PropertyRow>
          <PropertyRow v-if="selectedEntity.camera2D.limits.enabled" :label="t('limitLeftRight')"><div class="pair"><NumericExpressionInput v-model="selectedEntity.camera2D.limits.left" :resource-key="numericResourceKey + ':selectedEntity.camera2D.limits.left'" /><NumericExpressionInput v-model="selectedEntity.camera2D.limits.right" :resource-key="numericResourceKey + ':selectedEntity.camera2D.limits.right'" /></div></PropertyRow>
          <PropertyRow v-if="selectedEntity.camera2D.limits.enabled" :label="t('limitBottomTop')"><div class="pair"><NumericExpressionInput v-model="selectedEntity.camera2D.limits.bottom" :resource-key="numericResourceKey + ':selectedEntity.camera2D.limits.bottom'" /><NumericExpressionInput v-model="selectedEntity.camera2D.limits.top" :resource-key="numericResourceKey + ':selectedEntity.camera2D.limits.top'" /></div></PropertyRow>
          <PropertyRow :label="t('dragMargins')"><ToggleSwitch v-model="selectedEntity.camera2D.dragMargins.enabled" /></PropertyRow>
          <PropertyRow v-if="selectedEntity.camera2D.dragMargins.enabled" :label="t('dragMarginLeftRight')"><div class="pair"><NumericExpressionInput v-model="selectedEntity.camera2D.dragMargins.left" :minimum="0" :maximum="1" :step="0.01" :resource-key="numericResourceKey + ':selectedEntity.camera2D.dragMargins.left'" /><NumericExpressionInput v-model="selectedEntity.camera2D.dragMargins.right" :minimum="0" :maximum="1" :step="0.01" :resource-key="numericResourceKey + ':selectedEntity.camera2D.dragMargins.right'" /></div></PropertyRow>
          <PropertyRow v-if="selectedEntity.camera2D.dragMargins.enabled" :label="t('dragMarginTopBottom')"><div class="pair"><NumericExpressionInput v-model="selectedEntity.camera2D.dragMargins.top" :minimum="0" :maximum="1" :step="0.01" :resource-key="numericResourceKey + ':selectedEntity.camera2D.dragMargins.top'" /><NumericExpressionInput v-model="selectedEntity.camera2D.dragMargins.bottom" :minimum="0" :maximum="1" :step="0.01" :resource-key="numericResourceKey + ':selectedEntity.camera2D.dragMargins.bottom'" /></div></PropertyRow>
          <PropertyRow :label="t('viewportOrigin')"><div class="pair"><NumericExpressionInput v-model="selectedEntity.camera2D.viewport.x" :minimum="0" :maximum="1" :step="0.05" :resource-key="numericResourceKey + ':selectedEntity.camera2D.viewport.x'" /><NumericExpressionInput v-model="selectedEntity.camera2D.viewport.y" :minimum="0" :maximum="1" :step="0.05" :resource-key="numericResourceKey + ':selectedEntity.camera2D.viewport.y'" /></div></PropertyRow>
          <PropertyRow :label="t('viewportSize')"><div class="pair"><NumericExpressionInput v-model="selectedEntity.camera2D.viewport.width" :minimum="0.01" :maximum="1" :step="0.05" :resource-key="numericResourceKey + ':selectedEntity.camera2D.viewport.width'" /><NumericExpressionInput v-model="selectedEntity.camera2D.viewport.height" :minimum="0.01" :maximum="1" :step="0.05" :resource-key="numericResourceKey + ':selectedEntity.camera2D.viewport.height'" /></div></PropertyRow>
          <PropertyRow :label="t('sortingRange')"><div class="pair"><NumericExpressionInput v-model="selectedEntity.camera2D.nearSortingLayer" :step="1" :resource-key="numericResourceKey + ':selectedEntity.camera2D.nearSortingLayer'" /><NumericExpressionInput v-model="selectedEntity.camera2D.farSortingLayer" :step="1" :resource-key="numericResourceKey + ':selectedEntity.camera2D.farSortingLayer'" /></div></PropertyRow>
          <PropertyRow :label="t('cameraPriority')"><div class="pair"><NumericExpressionInput v-model="selectedEntity.camera2D.priority" :step="1" :resource-key="numericResourceKey + ':selectedEntity.camera2D.priority'" /><NumericExpressionInput v-model="selectedEntity.camera2D.stackOrder" :step="1" :resource-key="numericResourceKey + ':selectedEntity.camera2D.stackOrder'" /></div></PropertyRow>
          <PropertyRow :label="t('cullingMask')"><NumericExpressionInput v-model="selectedEntity.camera2D.cullingMask" :minimum="0" :maximum="4294967295" :step="1" :resource-key="numericResourceKey + ':selectedEntity.camera2D.cullingMask'" /></PropertyRow>
          <PropertyRow :label="t('renderTexture')"><input v-model="selectedEntity.camera2D.renderTexture" type="text" :placeholder="t('renderTextureName')"></PropertyRow>
        </InspectorSection>

        <InspectorSection v-if="selectedEntity.script2D" :title="t('script2D')" category="gameplay" open>
          <ComponentTools kind="Script2D" />
          <PropertyRow :label="t('scriptAsset')"><select v-model="selectedEntity.script2D.scriptAsset" @change="synchronizeScriptProperties"><option :value="null">{{ t('none') }}</option><option v-for="asset in scriptAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }} · {{ asset.assetType === 'visualScript' ? t('visualGraph') : 'Rhai' }}</option></select></PropertyRow>
          <PropertyRow :label="t('eventSheet')"><select v-model="selectedEntity.script2D.eventSheetAsset" @change="applySelectedEventSheet"><option :value="null">{{ t('none') }}</option><option v-for="asset in eventSheetAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></PropertyRow>
          <PropertyRow :label="t('objectBlueprint')"><select v-model="selectedEntity.script2D.objectBlueprintAsset" @change="selectedEntity.objectBlueprintAsset=selectedEntity.script2D.objectBlueprintAsset"><option :value="null">{{ t('none') }}</option><option v-for="asset in objectBlueprintAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></PropertyRow>
          <button v-if="selectedEntity.script2D.eventSheetAsset" class="secondary-action" @click="openSelectedEventSheet">{{ t('openEventSheet') }}</button>
          <button class="secondary-action" @click="synchronizeScriptProperties">{{ t('refreshScriptProperties') }}</button>
          <div v-for="group in scriptPropertyGroups" :key="group.name" class="script-property-group">
            <h4>{{ group.name }}</h4>
            <div v-for="property in group.properties" :key="property.name" :title="property.metadata?.tooltip || property.name">
              <PropertyRow :label="property.name" :path="`Script.${property.name}`">
                <ToggleSwitch v-if="typeof property.value === 'boolean'" :model-value="property.value" @update:model-value="setScriptProperty(property.name, $event)" />
                <select v-else-if="property.metadata?.enumValues.length" :value="property.value" @change="setScriptProperty(property.name, ($event.target as HTMLSelectElement).value)"><option v-for="option in property.metadata.enumValues" :key="option" :value="option">{{ option }}</option></select>
                <select v-else-if="property.metadata?.resourceType" :value="property.value" @change="setScriptProperty(property.name, ($event.target as HTMLSelectElement).value)"><option value="">{{ t('none') }}</option><option v-for="asset in compatibleScriptResources(property.metadata.resourceType)" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select>
                <select v-else-if="property.metadata?.valueType === 'entity'" :value="property.value" @change="setScriptProperty(property.name, ($event.target as HTMLSelectElement).value)"><option value="">{{ t('none') }}</option><option v-for="entity in state.world.entities" :key="entity.uuid" :value="entity.uuid">{{ entity.name }}</option></select>
                <NumericExpressionInput v-else-if="typeof property.value === 'number'" :model-value="property.value" :minimum="property.metadata?.minimum ?? undefined" :maximum="property.metadata?.maximum ?? undefined" :step="property.metadata?.step ?? 0.01" :resource-key="numericResourceKey + ':script-property:' + property.name" @update:model-value="setScriptProperty(property.name, $event)" />
                <div v-else-if="isScriptVec2(property.value)" class="pair"><NumericExpressionInput :model-value="property.value[0]" :step="0.01" :resource-key="numericResourceKey + ':script-property:' + property.name + ':0'" @update:model-value="setScriptVectorPart(property.name, 0, $event)" /><NumericExpressionInput :model-value="property.value[1]" :step="0.01" :resource-key="numericResourceKey + ':script-property:' + property.name + ':1'" @update:model-value="setScriptVectorPart(property.name, 1, $event)" /></div>
                <textarea v-else-if="property.value === null || typeof property.value === 'object'" class="script-data-value" :value="scriptDataText(property.value)" rows="3" spellcheck="false" @change="setScriptDataProperty(property.name, $event)"></textarea>
                <input v-else :value="property.value" type="text" @change="setScriptProperty(property.name, ($event.target as HTMLInputElement).value)">
              </PropertyRow>
              <small v-if="property.metadata?.tooltip" class="script-property-help">{{ property.metadata.tooltip }}</small>
            </div>
          </div>
          <p v-if="selectedEntity.script2D.lastError" class="script-error">{{ selectedEntity.script2D.lastError }}</p>
        </InspectorSection>

        <InspectorSection v-if="nodeSignals.length" :title="t('signals')" category="general">
          <article v-for="signal in nodeSignals" :key="signal.id" class="signal-row" :data-signal-id="signal.id">
            <strong class="signal-name">{{ signal.id }}</strong>
            <small class="signal-scope">{{ signal.scope }}</small>
            <span v-if="signal.params.length" class="signal-params">{{ signal.params.map(/* 参数以 名:类型 展示，不依赖翻译。 */ param => param.id + ': ' + param.type).join(', ') }}</span>
            <button class="secondary-action signal-connect" :data-connect-signal="signal.id" @click="openSignalConnect(signal.id)">{{ t('addConnection') }}</button>
          </article>
        </InspectorSection>

        <InspectorSection v-if="receiverConnections.length" :title="t('signalConnections')" category="general">
          <article v-for="item in receiverConnections" :key="item.connection.signal + ':' + item.connection.callback + ':' + item.index" class="signal-connection-row" :data-connection-signal="item.connection.signal">
            <strong class="signal-name">{{ item.connection.signal }}</strong>
            <span class="signal-params">{{ item.connection.callback }}</span>
            <small v-if="connectionCallbackMissing(item.connection.callback)" class="signal-warning" :data-missing-callback="item.connection.callback">{{ t('missingCallback') }}</small>
            <button class="secondary-action signal-remove" @click="removeReceiverConnection(item.index)">{{ t('removeConnection') }}</button>
          </article>
        </InspectorSection>

        <UiDialog :open="signalConnectOpen" :title="t('connections')" dismiss-on-backdrop @close="signalConnectOpen = false">
          <label class="signal-connect-field"><span>{{ t('signals') }}</span><input :value="signalConnectSignal" readonly></label>
          <label class="signal-connect-field"><span>{{ t('selectedObject') }}</span>
            <select v-model="signalConnectTarget" :aria-label="t('selectedObject')">
              <option v-for="entity in signalTargets" :key="entity.uuid" :value="entity.uuid">{{ entity.name }}</option>
            </select>
          </label>
          <label class="signal-connect-field"><span>{{ t('callbackFunction') }}</span><input v-model.trim="signalConnectCallback" :placeholder="t('callbackFunction')"></label>
          <UiButton class="primary" :disabled="!signalConnectTarget || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(signalConnectCallback)" @click="commitSignalConnect">{{ t('addConnection') }}</UiButton>
        </UiDialog>

        <InspectorSection v-if="selectedEntity.hasComponent('ShapeRenderer2D') && !selectedEntity.hasComponent('RectTransform')" :title="t('shapeSize')" category="render">
          <PropertyRow :label="t('absoluteSize')"><div class="pair"><NumericExpressionInput v-model="absoluteSizeX" :minimum="0.000001" :step="0.1" :resource-key="numericResourceKey + ':absoluteSizeX'" /><NumericExpressionInput v-model="absoluteSizeY" :minimum="0.000001" :step="0.1" :resource-key="numericResourceKey + ':absoluteSizeY'" /></div></PropertyRow>
        </InspectorSection>


        <InspectorSection v-if="selectedEntity.hasComponent('RigidBody2D')" :title="t('transformMotion')" category="physics">
          <PropertyRow :label="t('linearVelocity')"><div class="pair"><NumericExpressionInput v-model="selectedEntity.velocity.x" :step="0.01" :resource-key="numericResourceKey + ':selectedEntity.velocity.x'" /><NumericExpressionInput v-model="selectedEntity.velocity.y" :step="0.01" :resource-key="numericResourceKey + ':selectedEntity.velocity.y'" /></div></PropertyRow>
          <PropertyRow :label="t('accelerationXY')"><div class="pair"><NumericExpressionInput v-model="selectedEntity.acceleration.x" :step="0.01" :resource-key="numericResourceKey + ':selectedEntity.acceleration.x'" /><NumericExpressionInput v-model="selectedEntity.acceleration.y" :step="0.01" :resource-key="numericResourceKey + ':selectedEntity.acceleration.y'" /></div></PropertyRow>
          <PropertyRow :label="t('angularVelocity')"><NumericExpressionInput v-model="selectedEntity.angularVelocity" :step="0.01" :resource-key="numericResourceKey + ':selectedEntity.angularVelocity'" /></PropertyRow>
        </InspectorSection>

        <InspectorSection v-if="selectedEntity.hasComponent('RigidBody2D')" :title="t('dampingFriction')" category="physics">
          <PropertyRow :label="t('linearDamping')"><NumberRange v-model="selectedEntity.linearDamping" :min="0" :max="Math.max(1, selectedEntity.linearDamping)" :step="0.01" /></PropertyRow>
          <PropertyRow :label="t('angularDamping')"><NumberRange v-model="selectedEntity.angularDamping" :min="0" :max="Math.max(1, selectedEntity.angularDamping)" :step="0.01" /></PropertyRow>
        </InspectorSection>

        <InspectorSection v-if="selectedEntity.hasComponent('RigidBody2D')" :title="t('massProperties')" category="physics">
          <DiagnosticRow :label="t('invMass')" :value="selectedEntity.mass > 0 && bodyType === 'Dynamic' ? (1 / selectedEntity.mass).toPrecision(6) : `0 (${t('infinite')})`" />
          <DiagnosticRow :label="t('invInertia')" :value="effectiveEntityInertia > 0 && bodyType === 'Dynamic' ? (1 / effectiveEntityInertia).toPrecision(6) : `0 (${t('infinite')})`" />
          <DiagnosticRow :label="t('surfaceArea')" :value="selectedEntityArea.toPrecision(7)" />
          <PropertyRow :label="t('density')"><NumberRange v-model="selectedEntity.density" :min="0.000001" :max="Math.max(10, selectedEntity.density)" :step="0.000001" @update:model-value="onDensityChange" /></PropertyRow>
          <PropertyRow :label="t('mass')"><NumberRange v-model="selectedEntity.mass" :min="0.000001" :max="Math.max(100, selectedEntity.mass)" :step="0.000001" @update:model-value="onMassChange" /></PropertyRow>
          <PropertyRow :label="t('automaticInertia')"><ToggleSwitch v-model="selectedEntity.autoInertia" /></PropertyRow>
          <PropertyRow v-if="!selectedEntity.autoInertia" :label="t('momentInertia')"><NumericExpressionInput v-model="selectedEntity.inertia" :minimum="1e-24" :step="0.1" :resource-key="numericResourceKey + ':selectedEntity.inertia'" /></PropertyRow>
          <PropertyRow :label="t('gravityScale')"><NumberRange v-model="selectedEntity.gravityScale" :min="Math.min(0, selectedEntity.gravityScale)" :max="Math.max(5, selectedEntity.gravityScale)" :step="0.1" /></PropertyRow>
          <PropertyRow :label="t('localGravity')"><NumericExpressionInput v-model="selectedEntity.gravity" :step="0.1" :resource-key="numericResourceKey + ':selectedEntity.gravity'" /></PropertyRow>
        </InspectorSection>

        <InspectorSection v-if="selectedEntity.hasComponent('RigidBody2D')" :title="t('continuousForces')" category="physics">
          <PropertyRow :label="t('forceXY')"><div class="pair"><NumericExpressionInput v-model="selectedEntity.force.x" :step="0.01" :resource-key="numericResourceKey + ':selectedEntity.force.x'" /><NumericExpressionInput v-model="selectedEntity.force.y" :step="0.01" :resource-key="numericResourceKey + ':selectedEntity.force.y'" /></div></PropertyRow>
          <PropertyRow :label="t('torque')"><NumericExpressionInput v-model="selectedEntity.torque" :step="0.01" :resource-key="numericResourceKey + ':selectedEntity.torque'" /></PropertyRow>
        </InspectorSection>

        <InspectorSection v-if="selectedEntity.hasComponent('RigidBody2D')" :title="t('interactiveImpulses')" category="physics">
          <div class="pair"><input v-model.number="impulseX" type="number" :placeholder="t('impulseX')"><input v-model.number="impulseY" type="number" :placeholder="t('impulseY')"></div>
          <div class="pair"><input v-model.number="offsetX" type="number" :placeholder="t('offsetX')"><input v-model.number="offsetY" type="number" :placeholder="t('offsetY')"></div>
          <button class="primary-action" :disabled="bodyType !== 'Dynamic'" @click="applyImpulse">{{ t('applyLinearImpulse') }}</button>
          <input v-model.number="angularImpulse" type="number" :placeholder="t('angularImpulse')">
          <button class="primary-action" :disabled="bodyType !== 'Dynamic'" @click="applyAngularImpulse">{{ t('applyAngularImpulse') }}</button>
        </InspectorSection>

        <InspectorSection v-if="selectedEntity.getCollider()" :title="t('collider2D')" category="physics">
          <ComponentTools :kind="selectedEntity.collider.kind" />
          <PropertyRow :label="t('colliderShape')"><select v-model="colliderShapeModel"><option v-for="kind in colliderShapeKinds" :key="kind" :value="kind">{{ kind }}</option></select></PropertyRow>
          <p class="physics-support-note">{{ colliderShapeSupport }}</p>
          <details data-ui-motion-disclosure class="compound-shapes">
            <summary :title="text17('radiusHint')"><span>{{ t('additionalShapes') }} ({{ selectedEntity.collider.shapes.length }})</span><UiButton icon="add" type="button" :disabled="selectedEntity.collider.shapes.length >= 32" @click.prevent="addColliderShape" :label="t('add')" /></summary>
            <article v-for="(shape, index) in selectedEntity.collider.shapes" :key="shape.id">
              <header><select v-model="shape.kind" :aria-label="t('colliderShape')"><option v-for="kind in colliderShapeKinds" :key="kind">{{ kind }}</option></select><label><input v-model="shape.enabled" type="checkbox">{{ t('componentEnabled') }}</label><UiButton icon="clear" type="button" @click="removeColliderShape(index)" :label="t('remove')" /></header>
              <UiPropertyRow :label="t('colliderOffset')"><div class="pair"><NumericExpressionInput v-model="shape.offset.x" :step="0.01" :resource-key="numericResourceKey + ':shape:' + shape.id + ':offset.x'" /><NumericExpressionInput v-model="shape.offset.y" :step="0.01" :resource-key="numericResourceKey + ':shape:' + shape.id + ':offset.y'" /></div></UiPropertyRow>
              <UiPropertyRow :label="t('colliderSize')"><div class="pair"><NumericExpressionInput v-model="shape.size.x" :minimum="0.000001" :step="0.1" :resource-key="numericResourceKey + ':shape:' + shape.id + ':size.x'" /><NumericExpressionInput v-model="shape.size.y" :minimum="0.000001" :step="0.1" :resource-key="numericResourceKey + ':shape:' + shape.id + ':size.y'" /></div></UiPropertyRow>
              <UiPropertyRow :label="t('colliderRotation')"><NumericExpressionInput v-model="shape.rotation" :step="0.01" :resource-key="numericResourceKey + ':shape:' + shape.id + ':rotation'" /></UiPropertyRow>
              <UiPropertyRow :label="t('isSensor')"><input v-model="shape.sensor" type="checkbox"></UiPropertyRow>
              <UiPropertyRow :label="t('physicsLayer')"><select v-model.number="shape.physicsLayer"><option v-for="layer in state.globalSettings.layers" :key="layer.id" :value="layer.id">{{ layer.name }}</option></select></UiPropertyRow>
              <UiPropertyRow :label="t('collisionMask')"><NumericExpressionInput v-model="shape.collisionMask" :minimum="0" :maximum="4294967295" :resource-key="numericResourceKey + ':shape:' + shape.id + ':collisionMask'" /></UiPropertyRow>
              <UiPropertyRow :label="t('oneWayCollider')"><input v-model="shape.oneWay" type="checkbox"></UiPropertyRow>
              <UiPropertyRow :label="t('oneWayNormal')" v-if="shape.oneWay"><div class="pair"><NumericExpressionInput v-model="shape.oneWayNormal.x" :step="0.1" :resource-key="numericResourceKey + ':shape:' + shape.id + ':oneWayNormal.x'" /><NumericExpressionInput v-model="shape.oneWayNormal.y" :step="0.1" :resource-key="numericResourceKey + ':shape:' + shape.id + ':oneWayNormal.y'" /></div></UiPropertyRow>
              <UiPropertyRow :label="t('vertices')" v-if="shape.kind==='Chain'||shape.kind==='ConcavePolygon'||shape.kind==='ConvexPolygon'"><textarea :value="formatColliderPoints(shape.points)" rows="3" spellcheck="false" @change="setColliderPoints(shape, $event)"></textarea></UiPropertyRow>
            </article>
            <p>{{ t('compoundShapeHint') }}</p>
          </details>
          <PropertyRow :label="t('colliderOffset')"><div class="pair"><NumericExpressionInput v-model="selectedEntity.collider.offset.x" :step="0.01" :resource-key="numericResourceKey + ':selectedEntity.collider.offset.x'" /><NumericExpressionInput v-model="selectedEntity.collider.offset.y" :step="0.01" :resource-key="numericResourceKey + ':selectedEntity.collider.offset.y'" /></div></PropertyRow>
          <PropertyRow :label="t('colliderSize')"><div class="pair"><NumericExpressionInput v-model="colliderSizeX" :minimum="0.000001" :step="0.1" :resource-key="numericResourceKey + ':colliderSizeX'" /><NumericExpressionInput v-model="colliderSizeY" :minimum="0.000001" :step="0.1" :resource-key="numericResourceKey + ':colliderSizeY'" /></div></PropertyRow>
          <PropertyRow :label="t('colliderRotation')"><NumericExpressionInput v-model="colliderRotationDegrees" :step="1" :resource-key="numericResourceKey + ':colliderRotationDegrees'" /></PropertyRow>
          <PropertyRow :label="t('physicsLayer')"><select v-model.number="selectedEntity.collider.physicsLayer"><option v-for="layer in state.globalSettings.layers" :key="layer.id" :value="layer.id">{{ layer.name }}</option></select></PropertyRow>
          <PropertyRow :label="t('collisionMask')"><NumericExpressionInput v-model="selectedEntity.collider.collisionMask" :minimum="0" :maximum="4294967295" :step="1" :title="collisionMaskNames" :resource-key="numericResourceKey + ':selectedEntity.collider.collisionMask'" /></PropertyRow>
          <PropertyRow :label="t('isSensor')"><ToggleSwitch v-model="selectedEntity.isSensor" /></PropertyRow>
          <PropertyRow :label="t('oneWayCollider')"><ToggleSwitch v-model="selectedEntity.collider.oneWay" /></PropertyRow>
          <PropertyRow v-if="selectedEntity.collider.oneWay" :label="t('oneWayNormal')"><div class="field-pair"><NumericExpressionInput v-model="selectedEntity.collider.oneWayNormal.x" :step="0.1" :resource-key="numericResourceKey + ':selectedEntity.collider.oneWayNormal.x'" /><NumericExpressionInput v-model="selectedEntity.collider.oneWayNormal.y" :step="0.1" :resource-key="numericResourceKey + ':selectedEntity.collider.oneWayNormal.y'" /></div></PropertyRow>
          <PropertyRow :label="t('physicsMaterial')"><select v-model="selectedEntity.collider.materialAsset" @change="applySelectedPhysicsMaterial"><option :value="null">{{ t('inlineMaterial') }}</option><option v-for="asset in physicsMaterialAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ physicsMaterialName(asset.uuid) }}</option></select></PropertyRow>
          <PropertyRow :label="t('restitution')"><NumberRange v-model="selectedEntity.restitution" :min="0" :max="1" :step="0.01" /></PropertyRow>
          <PropertyRow :label="t('restitutionThreshold')"><NumericExpressionInput v-model="selectedEntity.restitutionThreshold" :minimum="0" :step="0.1" :resource-key="numericResourceKey + ':selectedEntity.restitutionThreshold'" /></PropertyRow>
          <PropertyRow :label="t('staticFriction')"><NumberRange v-model="selectedEntity.staticFriction" :min="0" :max="Math.max(1, selectedEntity.staticFriction)" :step="0.01" /></PropertyRow>
          <PropertyRow :label="t('dynamicFriction')"><NumberRange v-model="selectedEntity.dynamicFriction" :min="0" :max="Math.max(1, selectedEntity.dynamicFriction)" :step="0.01" /></PropertyRow>
          <PropertyRow :label="t('frictionCombine')"><select v-model="selectedEntity.collider.material.frictionCombine"><option v-for="mode in materialCombineModes" :key="mode">{{ mode }}</option></select></PropertyRow>
          <PropertyRow :label="t('restitutionCombine')"><select v-model="selectedEntity.collider.material.restitutionCombine"><option v-for="mode in materialCombineModes" :key="mode">{{ mode }}</option></select></PropertyRow>
          <PropertyRow :label="t('surfaceSpeed')"><NumericExpressionInput v-model="selectedEntity.collider.surfaceSpeed" :step="0.5" :title="t('surfaceSpeedHint')" :resource-key="numericResourceKey + ':selectedEntity.collider.surfaceSpeed'" /></PropertyRow>
          <PropertyRow :label="t('rollingResistance')"><NumericExpressionInput v-model="selectedEntity.collider.rollingResistance" :minimum="0" :step="0.05" :title="t('rollingResistanceHint')" :resource-key="numericResourceKey + ':selectedEntity.collider.rollingResistance'" /></PropertyRow>
        </InspectorSection>

        <InspectorSection v-if="prefs.showDiagnostics && selectedEntity.hasComponent('RigidBody2D')" :title="t('collisionDiagnostics')" category="physics">
          <DiagnosticRow :label="t('contacts')" :value="String(selectedEntity.contactCount)" :active="selectedEntity.contactCount > 0" />
          <DiagnosticRow v-if="selectedEntity.contactCount > 0" :label="t('normal')" :value="`[${selectedEntity.contactNormal.x.toFixed(3)}, ${selectedEntity.contactNormal.y.toFixed(3)}]`" />
          <DiagnosticRow v-if="selectedEntity.contactCount > 0" :label="t('penetration')" :value="`${selectedEntity.penetrationDepth.toPrecision(5)} m`" />
        </InspectorSection>

        <ObjectOwnershipPanel :entity="selectedEntity" @edit-blueprint="blueprintEditorUuid=$event" @create-blueprint="createOwnedBlueprint" @open-callback="requestObjectAuthorNavigation" />
        <RuntimeComponentsInspector :entity="selectedEntity" :search-query="estate.inspectorSearch" :category="estate.inspectorCategory" />
        <WorldComponentsInspector :entity="selectedEntity" />
        <GameplayComponentsInspector :entity="selectedEntity" />
        <RhythmChartInspector :entity="selectedEntity" />
        <InspectorSection :title="t('entitySettings')" category="general">
          <PropertyRow :label="t('entityEnabled')" path="Entity.enabled"><ToggleSwitch v-model="selectedEntity.enabled" /></PropertyRow>
          <PropertyRow :label="t('entityVisible')"><ToggleSwitch v-model="selectedEntity.editorVisible" /></PropertyRow>
          <PropertyRow :label="t('renderVisibility')" path="Entity.visible"><ToggleSwitch v-model="selectedEntity.authoring.visible" /></PropertyRow>
          <PropertyRow :label="t('entityLocked')"><ToggleSwitch v-model="selectedEntity.editorLocked" /></PropertyRow>
          <PropertyRow :label="t('zOrder')" path="Authoring.zOrder"><NumericExpressionInput :model-value="selectedEntity.authoring.zOrder" :step="1" :resource-key="numericResourceKey + ':authoring.zOrder'" @update:model-value="setAuthoringOrder" /></PropertyRow>
          <PropertyRow :label="t('renderLayer')" path="Authoring.renderLayer"><select :value="selectedEntity.layer" @change="setAuthoringLayer(Number(($event.target as HTMLSelectElement).value))"><option v-for="layer in estate.layers" :key="layer" :value="layer">{{ t('layer') }} {{ layer }}</option></select></PropertyRow>
          <PropertyRow :label="t('sortingMode')" path="Authoring.sortMode"><select v-model="selectedEntity.authoring.sortMode"><option value="LayerThenOrder">{{ t('explicitOrder') }}</option><option value="YSort">{{ t('ySort') }}</option></select></PropertyRow>
          <PropertyRow v-if="!selectedEntity.spriteRenderer" :label="t('objectOrigin')" path="Authoring.origin"><div class="pair"><NumericExpressionInput v-model="selectedEntity.authoring.origin.x" :step="0.01" :resource-key="numericResourceKey + ':selectedEntity.authoring.origin.x'" /><NumericExpressionInput v-model="selectedEntity.authoring.origin.y" :step="0.01" :resource-key="numericResourceKey + ':selectedEntity.authoring.origin.y'" /></div></PropertyRow>
          <template v-if="selectedEntity.authoring.kind === 'CanvasLayer'">
            <PropertyRow :label="t('screenSpaceCanvas')" path="Canvas.screenSpace"><ToggleSwitch v-model="selectedEntity.authoring.canvasLayer.screenSpace" /></PropertyRow>
            <PropertyRow :label="t('followCamera')" path="Canvas.followCamera"><ToggleSwitch v-model="selectedEntity.authoring.canvasLayer.followCamera" /></PropertyRow>
          </template>
          <template v-if="selectedEntity.authoring.kind === 'ParallaxLayer'">
            <PropertyRow :label="t('parallaxMotionScale')" path="Parallax.motionScale"><div class="pair"><NumericExpressionInput v-model="selectedEntity.authoring.parallax.motionScale.x" :step="0.05" :resource-key="numericResourceKey + ':selectedEntity.authoring.parallax.motionScale.x'" /><NumericExpressionInput v-model="selectedEntity.authoring.parallax.motionScale.y" :step="0.05" :resource-key="numericResourceKey + ':selectedEntity.authoring.parallax.motionScale.y'" /></div></PropertyRow>
            <PropertyRow :label="t('parallaxRepeat')" path="Parallax.repeat"><div class="pair"><NumericExpressionInput v-model="selectedEntity.authoring.parallax.repeat.x" :minimum="0" :step="0.1" :resource-key="numericResourceKey + ':selectedEntity.authoring.parallax.repeat.x'" /><NumericExpressionInput v-model="selectedEntity.authoring.parallax.repeat.y" :minimum="0" :step="0.1" :resource-key="numericResourceKey + ':selectedEntity.authoring.parallax.repeat.y'" /></div></PropertyRow>
            <PropertyRow :label="t('parallaxMirror')" path="Parallax.mirror"><ToggleSwitch v-model="selectedEntity.authoring.parallax.mirror" /></PropertyRow>
            <PropertyRow :label="t('parallaxDepth')" path="Parallax.depth"><NumericExpressionInput v-model="selectedEntity.authoring.parallax.depth" :step="1" :resource-key="numericResourceKey + ':selectedEntity.authoring.parallax.depth'" /></PropertyRow>
          </template>
          <template v-if="selectedEntity.authoring.kind === 'Path'">
            <PropertyRow :label="t('reusablePath')"><select v-model="selectedEntity.authoring.path.asset" @change="loadSelectedPathAsset"><option :value="null">{{ t('inlinePath') }}</option><option v-for="asset in pathAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></PropertyRow>
            <PropertyRow :label="t('pathClosed')" path="Path.closed"><ToggleSwitch v-model="selectedEntity.authoring.path.closed" /></PropertyRow>
            <PropertyRow :label="t('pathSmoothing')" path="Path.smoothing"><NumberRange v-model="selectedEntity.authoring.path.smoothing" :min="0" :max="1" :step="0.01" /></PropertyRow>
            <UiPropertyRow :label="t('pathPoints')" class="stacked-field"><PathTextInput :model-value="pathPointsText" kind="points" :resource-key="numericResourceKey + ':path.points'" rows="3" @commit="updatePathPoints" /></UiPropertyRow>
            <UiPropertyRow :label="t('pathTangents')" class="stacked-field"><PathTextInput :model-value="pathTangentsText" kind="tangents" :maximum="selectedEntity.authoring.path.points.length" :resource-key="numericResourceKey + ':path.tangents'" rows="3" :placeholder="t('pathTangentsHint')" @commit="updatePathTangents" /></UiPropertyRow>
<!-- 路径跟随目标过滤回调排除当前选中实体。 -->            <PropertyRow :label="t('pathFollower')"><select v-model="selectedEntity.authoring.path.follower.targetUuid"><option :value="null">{{ t('none') }}</option><option v-for="entity in state.world.entities.filter(entity => entity !== selectedEntity)" :key="entity.uuid" :value="entity.uuid">{{ entity.name }}</option></select></PropertyRow>
            <PropertyRow :label="t('pathProgress')"><NumberRange v-model="selectedEntity.authoring.path.follower.progress" :min="0" :max="1" :step="0.001" /></PropertyRow>
            <PropertyRow :label="t('pathSpeed')"><NumericExpressionInput v-model="selectedEntity.authoring.path.follower.speed" :step="0.01" :resource-key="numericResourceKey + ':selectedEntity.authoring.path.follower.speed'" /></PropertyRow>
            <PropertyRow :label="t('orientToPath')"><ToggleSwitch v-model="selectedEntity.authoring.path.follower.orient" /></PropertyRow>
            <button class="secondary-action" @click="saveSelectedPathAsset">{{ t('saveReusablePath') }}</button>
          </template>
          <PropertyRow :label="t('persistentEntity')"><ToggleSwitch v-model="selectedEntity.persistentAcrossScenes" /></PropertyRow>
          <PropertyRow :label="t('entityTags')"><input v-model="tagsText" type="text"></PropertyRow>
          <PropertyRow :label="t('entityGroups')"><input v-model="groupsText" type="text"></PropertyRow>
          <PropertyRow :label="t('namedLayer')"><select v-model="selectedEntity.namedLayer"><option v-for="layer in sceneManager.activeScene.settings.namedLayers" :key="layer.id" :value="layer.name">{{ layer.name }}</option></select></PropertyRow>
          <PropertyRow :label="t('entityOwnership')"><select v-model="selectedEntity.ownership"><option value="Scene">{{ t('sceneOwned') }}</option><option value="Prefab">{{ t('prefabOwned') }}</option><option value="Runtime">{{ t('runtimeOwned') }}</option></select></PropertyRow>
<!-- 拥有者候选过滤回调排除当前选中实体。 -->          <PropertyRow :label="t('ownerEntity')"><select v-model="selectedEntity.ownerUuid"><option :value="null">{{ t('none') }}</option><option v-for="entity in state.world.entities.filter(entity => entity !== selectedEntity)" :key="entity.uuid" :value="entity.uuid">{{ entity.name }}</option></select></PropertyRow>
          <PropertyRow :label="t('editorOnlyEntity')"><ToggleSwitch v-model="selectedEntity.editorOnly" /></PropertyRow>
          <PropertyRow :label="t('runtimePersistence')"><select v-model="selectedEntity.runtimePersistence"><option value="Scene">{{ t('persistenceScene') }}</option><option value="Session">{{ t('persistenceSession') }}</option><option value="SaveGame">{{ t('persistenceSaveGame') }}</option><option value="Transient">{{ t('persistenceTransient') }}</option></select></PropertyRow>
          <div v-if="selectedValidation.length" class="authoring-validation" role="status"><strong>{{ t('componentValidation') }}</strong><button v-for="issue in selectedValidation" :key="`${issue.code}:${issue.component}`" :class="issue.severity" :title="issue.fix">{{ issue.message }}</button></div>
          <DiagnosticRow label="UUID" :value="selectedEntity.uuid" />
          <template v-if="selectedEntity.prefabAsset">
            <DiagnosticRow :label="t('prefabInstance')" :value="selectedEntity.prefabAsset" active />
            <DiagnosticRow :label="t('prefabOverrides')" :value="String(prefabOverrideCount)" />
            <details data-ui-motion-disclosure v-if="prefabComparison.length" class="prefab-compare">
              <summary>{{ t('comparePrefabOverrides') }}</summary>
              <article v-for="override in prefabComparison" :key="override.path"><code>{{ override.path }}</code><button @click="resetSelectedPrefabOverride(override.path)">{{ t('resetOverride') }}</button></article>
            </details>
            <details data-ui-motion-disclosure v-if="prefabConflicts.length" class="prefab-compare prefab-conflicts" open>
              <summary>{{ t('prefabConflicts') }} · {{ prefabConflicts.length }}</summary>
              <article v-for="conflict in prefabConflicts" :key="`${conflict.code}:${conflict.path ?? ''}`" :class="conflict.severity"><span>{{ conflict.message }}</span></article>
            </details>
            <div class="prefab-actions">
              <button @click="locateSelectedPrefab">{{ t('locatePrefabSource') }}</button>
              <button @click="applySelectedPrefab">{{ t('applyPrefab') }}</button>
              <button @click="revertSelectedPrefab">{{ t('revertPrefab') }}</button>
              <button @click="createSelectedPrefabVariant">{{ t('createPrefabVariant') }}</button>
              <button @click="unpackSelectedPrefab">{{ t('unpackPrefab') }}</button>
            </div>
          </template>
          <button v-else class="secondary-action" @click="createSelectedPrefab">{{ t('createPrefab') }}</button>
          <template v-if="selectedEntity.sceneLayers.length">
            <DiagnosticRow :label="t('sceneInstance')" :value="selectedEntity.sceneLayers[selectedEntity.sceneLayers.length - 1]?.asset ?? ''" active />
            <button class="secondary-action" @click="unpackSelectedScene">{{ t('unpackScene') }}</button>
          </template>
        </InspectorSection>
        <InspectorSection v-if="pluginInspectorContributions.length" :title="t('extensionActions')" category="general">
          <div class="plugin-inspector-actions">
            <button v-for="item in pluginInspectorContributions" :key="`${item.pluginId}:${item.kind}:${item.id}`" :title="item.description" @click="invokePluginInspector(item.kind,item.id,item.pluginId)"><span>{{ item.label }}</span><small>{{ item.pluginName }} · {{ t(`contribution_${item.kind}`) }}</small></button>
          </div>
        </InspectorSection>
        <p v-if="!inspectorHasMatches" class="inspector-no-results">{{ t('noInspectorResults') }}</p>
      </div>
      <div v-else class="inspector-empty"><UiPanelHeader :title="t('inspector')" /><p>{{ ({en:'No object selected',de:'Kein Objekt ausgewählt',zh:'未选择对象'})[prefs.locale] }}</p><UiButton icon="add" :label="t('createObject')" @click="estate.createObjectPaletteOpen = true">{{ t('createObject') }}</UiButton></div>
    </aside>

    <Teleport to="body"><UiDialog :open="Boolean(showColorPicker)" :title="t('selectColor')" dismiss-on-backdrop @close="showColorPicker = false"><input v-model="tempColor" type="color" :aria-label="t('selectColor')"><template #footer><UiButton @click="showColorPicker = false">{{ t('cancel') }}</UiButton><UiButton variant="primary" @click="applyColor">{{ t('apply') }}</UiButton></template></UiDialog></Teleport>
    <ObjectBlueprintEditor v-if="blueprintEditorUuid" :key="blueprintEditorUuid" :asset-uuid="blueprintEditorUuid" @close="blueprintEditorUuid=null" @derive="deriveOwnedBlueprint" />
    <Teleport to="body">
      <UiDialog :open="Boolean(estate.componentPickerOpen && selectedEntity)" :title="t('addComponent') + ' · ' + (selectedEntity?.name ?? '')" dismiss-on-backdrop @close="closeComponentPicker">
          <input ref="componentSearchInput" v-model="componentSearch" type="search" :placeholder="t('searchComponents')">
          <div class="component-picker-list">
            <section v-for="group in componentGroups" :key="group.name"><h5>{{ group.name }} <small>{{ group.kinds.length }}</small></h5><article v-for="kind in group.kinds" :key="kind"><button class="component-main" @click="chooseComponent(kind)"><EditorIcon :name="componentIcon(kind)" /><span><strong>{{ componentTitle(kind) }}</strong><small>{{ componentPaletteMetadata(kind).category }} · {{ t(`compatibility${componentPaletteMetadata(kind).compatibility}`) }}<template v-if="componentAuthoringRule(kind).required.length"> · {{ t('requires') }} {{ componentAuthoringRule(kind).required.join(', ') }}</template><template v-if="componentAuthoringRule(kind).conflicts.length"> · {{ t('conflictsWith') }} {{ componentAuthoringRule(kind).conflicts.join(', ') }}</template></small><small>{{ componentPaletteMetadata(kind).summary }}</small></span><EditorIcon name="add" /></button><button class="component-favorite" :class="{ active: componentPaletteState.favorites.includes(kind) }" :title="`${t('favorite')} · ${componentAuthoringRule(kind).documentation}`" @click="toggleComponentFavorite(kind)"><EditorIcon name="pin" /></button></article></section>
            <p v-if="!componentGroups.length">{{ t('noComponentsFound') }}</p>
            <label v-if="!componentSearch.trim()" class="component-show-all"><input v-model="componentPickerShowAll" type="checkbox" data-component-show-all>{{ t('componentShowDeprecated') }}</label>
          </div>
      </UiDialog>
      <UiMenu :open="filterMenu.visible" ref="filterMenuRoot" class="inspector-filter-menu" :style="{ left: `${filterMenu.x}px`, top: `${filterMenu.y}px` }" @close="closeFilterMenu(true)">
        <button v-for="category in inspectorCategories" :key="category.id" type="button" :class="{ active: estate.inspectorCategory === category.id }" :aria-current="estate.inspectorCategory === category.id ? 'true' : undefined" @click="chooseInspectorCategory(category.id)"><EditorIcon :name="estate.inspectorCategory === category.id ? 'check' : 'circle'" :class="{ placeholder: estate.inspectorCategory !== category.id }" /><span>{{ category.id === 'all' ? t('allProperties') : t(category.label) }}</span></button>
        <hr>
        <button type="button" :class="{ active: estate.inspectorModifiedOnly }" :aria-current="estate.inspectorModifiedOnly ? 'true' : undefined" @click="toggleInspectorFilter('inspectorModifiedOnly')"><EditorIcon :name="estate.inspectorModifiedOnly ? 'check' : 'circle'" :class="{ placeholder: !estate.inspectorModifiedOnly }" /><span>{{ t('modifiedOnly') }}</span></button>
        <button type="button" :class="{ active: estate.inspectorPinnedOnly }" :aria-current="estate.inspectorPinnedOnly ? 'true' : undefined" @click="toggleInspectorFilter('inspectorPinnedOnly')"><EditorIcon :name="estate.inspectorPinnedOnly ? 'check' : 'circle'" :class="{ placeholder: !estate.inspectorPinnedOnly }" /><span>{{ t('pinnedOnly') }}</span></button>
      </UiMenu>
      <UiMenu :open="propertyMenu.visible" class="property-menu" @close="closePropertyMenu" :style="{ left: `${propertyMenu.x}px`, top: `${propertyMenu.y}px` }"><strong>{{ propertyMenu.path }}</strong><UiButton icon="reset" @click="resetPropertyValue">{{ t('resetProperty') }}</UiButton><UiButton icon="undo" @click="revertPropertyOverride">{{ t('revertOverride') }}</UiButton><button @click="copyPropertyValue">{{ t('copyValue') }}</button><button :disabled="!propertyClipboard" @click="pastePropertyValue">{{ t('pasteValue') }}</button><button @click="copyPropertyPath">{{ t('copyPropertyPath') }}</button><UiButton icon="animation" @click="keyframeProperty">{{ t('keyframeProperty') }}</UiButton><UiButton icon="pin" @click="togglePropertyPin">{{ isCurrentPropertyPinned ? t('unpinProperty') : t('pinProperty') }}</UiButton><p v-if="currentPropertyMetadata">{{ currentPropertyMetadata.help }}<template v-if="currentPropertyMetadata.unit"> · {{ currentPropertyMetadata.unit }}</template><template v-if="currentPropertyMetadata.minimum !== undefined"> · {{ currentPropertyMetadata.minimum }}…{{ currentPropertyMetadata.maximum ?? '∞' }}</template></p></UiMenu>
    </Teleport>
    <ConnectionBuilder v-if="selectedEntity && builderOpen" :selected-id="selectedEntity.id" :connection-id="editingConnectionId" @close="builderOpen = false" />
  </div>
</template>

<script setup lang="ts">
import UiSegmented from '../ui/components/UiSegmented.vue'
import NumericExpressionInput from './NumericExpressionInput.vue'
import UiPropertySection from '../ui/components/UiPropertySection.vue'
import UiPropertyRow from '../ui/components/UiPropertyRow.vue'
import UiSlider from '../ui/components/UiSlider.vue'
import UiToggle from '../ui/components/UiToggle.vue'
import UiButton from '../ui/components/UiButton.vue'
import EditorIcon from './EditorIcon.vue'
import PathTextInput from './PathTextInput.vue'
import type {ParsedPathText} from '../editor/pathTextDraft'
import { signalsForEntity } from '../world/componentSignals'
import { addNodeSignalConnection, removeNodeSignalConnection, type ScriptAssetLike } from '../editor/signalConnections'
import {settleEditorDrafts} from '../editor/pendingDrafts'
import ObjectOwnershipPanel from './ObjectOwnershipPanel.vue'
import ObjectBlueprintEditor from './ObjectBlueprintEditor.vue'
import {authorBlueprintFromEntity,authorDerivedBlueprint} from '../editor/objectBlueprintAuthoring'
import {requestObjectAuthorNavigation} from '../editor/objectAuthorNavigation'
import {objectOwnershipCopy} from '../editor/objectOwnershipCopy'
import { registerEditorDraft } from '../editor/pendingDrafts'
import { cloneVNode, computed, defineComponent, h, isVNode, nextTick, onUnmounted, reactive, ref, watch, type VNode } from 'vue'
import PanelMaximizeButton from './PanelMaximizeButton.vue'
import PanelResizeHandle from './PanelResizeHandle.vue'
import { t } from '../i18n'
import { editorState as estate, addEditorLog, type InspectorCategory } from '../store/editor'
import { beginHistoryTransaction, cancelHistoryTransaction, commitHistoryTransaction, deleteConnection, physicsState as state, pushHistory, repairConnection, sceneManager } from '../store/physics'
import { preferencesState as prefs } from '../store/preferences'
import { requestConfirmation } from '../store/dialog'
import { BoxEntity } from '../world/BoxEntity'
import { CircleEntity } from '../world/CircleEntity'
import { TriangleEntity } from '../world/TriangleEntity'
import { effectiveInertia, entityArea, finiteNumber, MIN_AREA, MIN_SIZE, normalizeEntity, syncDensityFromMass, syncMassFromDensity } from '../world/geometry'
import ConnectionBuilder from './ConnectionBuilder.vue'
import SimulationStatusPanel17 from './SimulationStatusPanel17.vue'
import { simulationLabel17 as text17 } from '../editor/simulationLabels17'
import RuntimeComponentsInspector from './RuntimeComponentsInspector.vue'
import WorldComponentsInspector from './WorldComponentsInspector.vue'
import GameplayComponentsInspector from './GameplayComponentsInspector.vue'
import RhythmChartInspector from './RhythmChartInspector.vue'
import { connectionSharesLayer } from '../world/Connection'
import { Animator, Area2D, AreaEffector2D, AudioListener, AudioSource, BehaviorTree2D, Button, Camera2D, CameraFollow2D, TargetJoint2D, Canvas, CharacterBody2D, Checkbox, Collider2D, Collectible2D, Cooldown2D, DamageHitbox2D, GridMover2D, Health2D, Image as UIImage, Joint2D, Lifetime2D, Light2D, MouseFollower2D, NavigationAgent2D, NavigationObstacle2D, NavigationRegion2D, ObjectPool2D, Panel, ParticleEmitter2D, PlatformController2D, Portal2D, ProgressBar, Projectile2D, RectTransform, RhythmChart2D, RigidBody2D, Script2D, ShadowCaster2D, ShapeRenderer2D, Skeleton2D, Slider, Spawner2D, SpriteRenderer2D, StateMachine2D, Text as UIText, TextInput, TextRenderer2D, TileMap2D, TimelinePlayer, TopDownController2D, WorldChunk2D, copyComponentValues, pasteComponentValues, type Component2D, type ComponentKind, type JointKind2D, type ScriptPropertyMetadata, type ScriptPropertyValue } from '../world/components'
import { Transform } from '../world/Transform'
import { setParent, wouldCreateParentCycle } from '../world/hierarchy'
import { applyTranslation, captureTransforms } from '../editor/gizmo'
import { selectionCenter } from '../editor/selection'
import { assetGuid, assetReference, assetState, createTextAsset, importAssetFiles, readTextAsset } from '../assets/AssetDatabase'
import { normalizePhysicsMaterial, PHYSICS_SHAPE_SUPPORT, type PhysicsShapeKind } from '../runtime/physicsProduction'
import { createUuid } from '../world/identity'
import { gameplayRuntime } from '../editor/gameplayRuntime'
import { recordEntityProperties } from '../editor/animationStudioState'
import { applyPrefabFromInstance, lastPrefabPropagation, capturePrefabOverrides, comparePrefabInstance, createPrefabFromEntities, createPrefabVariantFromInstance, prefabConflictReport, resetPrefabOverride, revertPrefabInstance, unpackPrefabInstance } from '../runtime/prefabs'
import { unpackSceneInstance } from '../runtime/sceneInstances'
import { propertyMetadata, type PropertyMetadata } from '../editor/propertyMetadata'
import { CLASSIC_CATEGORIES, DEPRECATED_COMPONENTS, RHYTHM_FIRST_CATEGORIES, componentPaletteMetadata, componentPaletteState, componentPresets, markComponentRecent, saveComponentPreset, toggleComponentFavorite, type ComponentPaletteCategory } from '../editor/componentPalette'
import { componentAuthoringRule, validateEntityAuthoring } from '../editor/sceneAuthoring'
import { OFFICIAL_AI_PACKAGE_ID, OFFICIAL_OBJECT_POOL_PACKAGE_ID, packageEnabled } from '../runtime/packages'
import { configureUiAccessibility } from '../runtime/uiAccessibility'
import { pluginRuntime, pluginState, type PluginContributionKind } from '../runtime/plugins'
import { attachEventSheet } from '../runtime/eventSheets'
import { openEventSheetAsset } from '../visual/graphStudioState'
import { applyEditorWorkspace, workspaceState } from '../editor/workspaces'

const InspectorSection = defineComponent({ props: { title: { type: String, required: true }, category: { type: String, default: 'general' }, open: Boolean }, setup(props, { slots }) { return () => h(UiPropertySection, { title: props.title, collapsible: true, open: props.open, class: 'inspector-section', style: { display: inspectorSectionVisible(props.title, props.category as InspectorCategory) ? '' : 'none' } }, slots) } })
/** 递归复制属性控件并补充无障碍名称，成对数值区分横纵轴。 */ function namePropertyControls(nodes: VNode[], label: string): VNode[] {
  return nodes.map(/** 复制单个节点并为无标签交互控件及其子节点补充名称。 */ node => {
    if (!isVNode(node)) return node
    const interactive = typeof node.type === 'object' || ['input', 'select', 'textarea', 'button'].includes(String(node.type))
    const copy = cloneVNode(node, interactive && !node.props?.['aria-label'] && !node.props?.['aria-labelledby'] ? { 'aria-label': label } : {})
    if (Array.isArray(node.children)) {
      const pair = String(node.props?.class ?? '').split(' ').includes('pair')
      copy.children = node.children.map(/* 根据 isVNode(child) 的真假，分别返回 namePropertyControls([child], pair ? `${label} ${index === 0 ? 'X' : 'Y'}` : label)[0] 或 child。 */ (child, index) => isVNode(child) ? namePropertyControls([child], pair ? `${label} ${index === 0 ? 'X' : 'Y'}` : label)[0] : child)
    }
    return copy
  })
}
const PropertyRow = defineComponent({ props: { label: { type: String, required: true }, path: { type: String, default: '' } }, /** 创建支持固定、修改筛选及属性元数据的属性行组件。 */ setup(props, { slots }) { return /** 按筛选渲染属性名称、单位、控件和默认值、目标及覆盖详情。 */ () => {
  if (estate.inspectorPinnedOnly && (!props.path || !estate.pinnedInspectorProperties.includes(props.path))) return null
  if (estate.inspectorModifiedOnly && (!props.path || !modifiedPropertyPaths.value.has(props.path))) return null
  const metadata = props.path ? propertyMetadata(props.path) : undefined
  // Defaults and the write destination are reference information: they live in the row tooltip and the
  // property context menu instead of a disclosure under every field. Prefab overrides stay visible inline.
  const overridden = Boolean(props.path) && (selectedEntity.value?.prefabOverrides[props.path] !== undefined || overriddenInspectorPaths.value.has(props.path))
  const tooltip = props.path ? [metadata?.help, metadata ? `${propertyCopy.value.defaults}: ${metadata.defaults.join(', ')}` : '', `${propertyCopy.value.destination}: ${numericResourceKey.value}/${props.path}`].filter(Boolean).join('\n') : metadata?.help
  return h(UiPropertyRow, { label: props.label, unit: metadata?.unit, class: ['property-row', { modified: props.path && modifiedPropertyPaths.value.has(props.path), pinned: props.path && estate.pinnedInspectorProperties.includes(props.path), overridden }], 'data-property-path': props.path || undefined, title: tooltip, onContextmenu: props.path ? (event: MouseEvent) => openPropertyMenu(event, props.path) : undefined }, {
    label: () => [props.path && estate.pinnedInspectorProperties.includes(props.path) ? h(EditorIcon, {name:'pin'}) : null, props.label],
    default: () => namePropertyControls(slots.default?.() ?? [], props.label),
    details: () => overridden ? h('small', { class: 'property-details property-override' }, propertyCopy.value.override) : null,
  })
} } })
const DiagnosticRow = defineComponent({ props: { label: { type: String, required: true }, value: { type: String, required: true }, active: Boolean }, /** 建立显示标签、数值和激活样式的诊断行。 */ setup(props) { return /* 调用 h('div', { class: ['diagnostic-row', { active: props.active }] }, [h('span', props.label), h('code', props.value)]) 并返回调用结果。 */ () => h('div', { class: ['diagnostic-row', { active: props.active }] }, [h('span', props.label), h('code', props.value)]) } })
// Domain commits continue to bubble to the inspector's existing change owner.
const ToggleSwitch = UiToggle
const NumberRange = defineComponent({
  inheritAttrs: false,
  props: {modelValue: {type:Number,required:true},min:{type:Number,required:true},max:{type:Number,required:true},step:{type:Number,required:true}},
  emits: ['update:modelValue'],
  setup(props, {emit,attrs}) {
    return () => h(UiSlider, { ...attrs, ...props, resourceKey: numericResourceKey.value, 'onUpdate:modelValue': (value:number) => emit('update:modelValue',value) })
  }
})
const ComponentTools = defineComponent({
  props: { kind: { type: String, required: true } },
  /** 建立所选组件的启停、重置、复制粘贴、预设、排序和删除工具。 */ setup(props) {
    return /** 仅对存在的组件渲染工具按钮，并保护变换组件不可移除和排序。 */ () => {
      const kind = props.kind as ComponentKind
      const component = selectedEntity.value?.getComponent(kind, true)
      if (!component) return null
      return h('div', { class: 'component-tools' }, [
        kind === 'Transform2D' ? null : h(UiButton, { icon:'check', label:t('componentEnabled'), 'aria-pressed':component.enabled, onClick: () => toggleComponent(kind) }),
        h(UiButton, { icon:'restore', label:t('resetComponent'), onClick: () => resetComponent(kind) }),
        h(UiButton, { icon:'copy', label:t('copyComponent'), onClick: () => copyComponent(kind) }),
        h(UiButton, { icon:'paste', label:t('pasteComponent'), disabled:componentClipboard.value?.kind !== kind, onClick: () => pasteComponent(kind) }),
        h(UiButton, { icon:componentPresets(kind).length ? 'list' : 'add', label:t('componentPreset'), onClick: () => useComponentPreset(kind) }),
        kind === 'Transform2D' ? null : h(UiButton, { icon:'up', label:t('moveComponentUp'), onClick: () => reorderComponent(kind,-1) }),
        kind === 'Transform2D' ? null : h(UiButton, { icon:'down', label:t('moveComponentDown'), onClick: () => reorderComponent(kind,1) }),
        kind === 'Transform2D' ? null : h(UiButton, { icon:'clear', variant:'danger', label:t('removeComponent'), onClick: () => removeComponent(kind) }),
      ])
    }
  }
})

const pluginInspectorContributions = computed(/* 调用 pluginState.contributions.filter(item => ['menus', 'inspectors', 'gizmos', 'components'].includes(item.kind)) 并返回调用结果。 */ () => pluginState.contributions.filter(/* 调用 ['menus', 'inspectors', 'gizmos', 'components'].includes(item.kind) 并返回调用结果。 */ item => ['menus', 'inspectors', 'gizmos', 'components'].includes(item.kind)))
/** 调用指定插件贡献的检查器入口。 */ function invokePluginInspector(kind: PluginContributionKind, id: string, pluginId: string): void {
  pluginRuntime.invokeContribution(kind, id, pluginId)
}

const selectedEntities = computed(/** 从世界实体中筛选当前多选标识。 */ () => {
  const ids = new Set(state.selectedEntityIds)
  return state.world.entities.filter(/* 调用 ids.has(entity.id) 并返回调用结果。 */ entity => ids.has(entity.id))
})
const selectedEntity = computed(/** 按主选择标识查找实体，没有选择时返回空值。 */ () => state.selectedEntityId === null ? null : state.world.entities.find(/* 比较 entity.id 与 state.selectedEntityId，返回严格相等的判断结果。 */ entity => entity.id === state.selectedEntityId) ?? null)
const propertyCopy = computed(/** 按当前语言提供属性详情与位置编辑说明。 */ () => ({
  en: {positionMode:'Position editing',center:'Selection center',shared:'Shared value',details:'Property details',defaults:'Default',destination:'Destination',override:'Prefab override'},
  de: {positionMode:'Position bearbeiten',center:'Auswahlmittelpunkt',shared:'Gemeinsamer Wert',details:'Eigenschaftsdetails',defaults:'Standardwert',destination:'Ziel',override:'Prefab-Überschreibung'},
  zh: {positionMode:'位置编辑',center:'选择中心',shared:'共同数值',details:'属性详情',defaults:'默认值',destination:'目标资源',override:'预制体覆盖'}
})[prefs.locale])
const multiPositionMode = ref<'center' | 'shared'>('center')
const numericResourceKey = computed(/** 由已排序实体标识组成数值控件资源键。 */ () => selectedEntities.value.map(/* 返回 entity.uuid 的当前值。 */ entity => entity.uuid).sort().join('|'))
// The Inspector owns pointer gestures: child property controls can be replaced while rendering.
let rangeGesture: {resource:string} | null = null
/** 清除范围拖动状态并解除结束及取消监听。 */ function clearRangeGesture(): void {
  rangeGesture = null
  window.removeEventListener('pointerup', finishRangeGesture)
  window.removeEventListener('pointercancel', cancelRangeGesture)
}
/** 资源身份未变时提交范围手势，否则取消历史事务。 */ function finishRangeGesture(): void {
  if (!rangeGesture) return
  const sameResource = rangeGesture.resource === numericResourceKey.value
  clearRangeGesture()
  if (!sameResource) { cancelHistoryTransaction(); return }
  onConfigChange()
  commitHistoryTransaction()
}
/** 取消范围手势并回滚历史事务。 */ function cancelRangeGesture(): void {
  if (!rangeGesture) return
  clearRangeGesture()
  cancelHistoryTransaction()
}
/** 检测检查器内范围输入按下，并以控件标签开始手势。 */ function onInspectorPointerDown(event: PointerEvent): void { const target = event.target; if (target instanceof HTMLInputElement && target.type === 'range') beginRangeGesture(event, target.labels?.[0]?.innerText.trim() || target.getAttribute('aria-label') || 'property') }
/** 仅左键且无活动手势时开启历史事务并安装结束监听。 */ function beginRangeGesture(event: PointerEvent, label: string): void {
  if (event.button !== 0 || rangeGesture) return
  const target = event.target instanceof HTMLElement ? event.target : null
  const resource = target?.closest<HTMLElement>('[data-resource-key]')?.dataset.resourceKey || numericResourceKey.value
  if (!beginHistoryTransaction('Adjust ' + label, null, resource)) return
  rangeGesture = {resource:numericResourceKey.value}
  window.addEventListener('pointerup', finishRangeGesture)
  window.addEventListener('pointercancel', cancelRangeGesture)
}
watch(numericResourceKey, cancelRangeGesture, {flush:'sync'})
onUnmounted(cancelRangeGesture)
onUnmounted(registerEditorDraft({validate:/* 返回固定值 true。 */ ()=>true,commit:finishRangeGesture,cancel:clearRangeGesture}))

const physicsMaterialAssets = computed(/* 调用 assetState.records.filter(asset => asset.assetType === 'material' && physicsMaterialDocument(asset.uuid)) 并返回调用结果。 */ () => assetState.records.filter(/* 先计算 asset.assetType === 'material'；仅当其为真值时求右侧 physicsMaterialDocument(asset.uuid)，返回短路求值结果。 */ asset => asset.assetType === 'material' && physicsMaterialDocument(asset.uuid)))
const colliderShapeKinds: PhysicsShapeKind[] = ['Box', 'Circle', 'Capsule', 'Segment', 'Chain', 'WorldBoundary', 'ConvexPolygon', 'ConcavePolygon']
const materialCombineModes = ['Average', 'Minimum', 'Maximum', 'Multiply'] as const
const colliderShapeSupport = computed(/** 组合碰撞形状支持说明，并提示动态凹形或链形限制。 */ () => { const entity=selectedEntity.value, model = entity?.collider.shapeModel ?? 'Box'; const support = PHYSICS_SHAPE_SUPPORT[model]; const blocked=model==='Chain'&&entity&&!entity.isStatic&&!entity.isKinematic?' Dynamic bodies must use finite convex children.':''; return `${support.simulation}: ${support.note}${blocked}` })
const colliderShapeModel = computed({ get: /* 当 selectedEntity.value?.collider.shapeModel 为 null 或 undefined 时返回 'Box'，否则保留左侧值。 */ () => selectedEntity.value?.collider.shapeModel ?? 'Box', set: /** 更新碰撞形状；世界边界强制静态非传感器并冻结旋转。 */ (kind: PhysicsShapeKind) => { const entity = selectedEntity.value; if (!entity) return; entity.collider.shapeModel = kind; if (kind === 'WorldBoundary') { entity.rigidBody.bodyType = 'Static'; entity.collider.sensor = false; entity.rigidBody.freezeRotation = true } normalizeEntity(entity); pushHistory('Change collider shape') } })
/** 在最多三十二个子形状限制内添加默认盒形碰撞。 */ function addColliderShape() { const collider = selectedEntity.value?.getCollider(); if (!collider || collider.shapes.length >= 32) return; collider.shapes.push({ id: createUuid(), kind: 'Box', offset: { x: 0, y: 0 }, rotation: 0, size: { x: 1, y: 1 }, radius: .5, points: [], enabled: true, sensor: collider.sensor, physicsLayer: collider.physicsLayer, collisionMask: collider.collisionMask, oneWay: false, oneWayNormal: {x:0,y:1} }); pushHistory('Add collider shape') }
/** 按有效索引删除碰撞子形状并记录历史。 */ function removeColliderShape(index: number) { const collider = selectedEntity.value?.getCollider(); if (!collider || index < 0 || index >= collider.shapes.length) return; collider.shapes.splice(index, 1); pushHistory('Remove collider shape') }
/* 调用 points.map(point=>`${point.x}, ${point.y}`).join('\n') 并返回调用结果。 */ function formatColliderPoints(points: Array<{x:number;y:number}>) { return points.map(/** 将碰撞点格式化为逗号分隔的坐标。 */ point=>`${point.x}, ${point.y}`).join('\n') }
/** 解析最多一百二十八个有效点，至少两点时更新碰撞几何。 */ function setColliderPoints(shape: {points:Array<{x:number;y:number}>}, event: Event) { const rows=(event.target as HTMLTextAreaElement).value.split(/[\n;]+/).flatMap(/** 将单行坐标解析为有限二维点，忽略无效行。 */ row=>{const [x,y]=row.trim().split(/[\s,]+/).map(Number);return Number.isFinite(x)&&Number.isFinite(y)?[{x,y}]:[]}).slice(0,128); if(rows.length>=2){shape.points=rows;pushHistory('Edit collider points')} }
const collisionMaskNames = computed(/** 按碰撞掩码筛选物理层并拼接名称。 */ () => { const mask = selectedEntity.value?.collider.collisionMask ?? 0; return state.globalSettings.layers.filter(/* 比较 (mask & ((2 ** layer.id) >>> 0)) 与 0，返回严格不等的判断结果。 */ layer => (mask & ((2 ** layer.id) >>> 0)) !== 0).map(/* 返回 layer.name 的当前值。 */ layer => layer.name).join(', ') })
const canEdit = computed(/* 比较 state.playMode 与 'editing'，返回严格相等的判断结果。 */ () => state.playMode === 'editing')
const blueprintEditorUuid=ref<string|null>(null)
/** 从当前实体创作对象蓝图，失败时记录资源错误。 */ function createOwnedBlueprint(){const entity=selectedEntity.value;if(!entity)return;try{blueprintEditorUuid.value=authorBlueprintFromEntity(entity)}catch(error){addEditorLog(error instanceof Error?error.message:String(error),'Assets','error')}}
/** 创建派生蓝图并打开，失败时记录资源错误。 */ function deriveOwnedBlueprint(uuid:string){try{blueprintEditorUuid.value=authorDerivedBlueprint(uuid,objectOwnershipCopy[prefs.locale].deriveName)}catch(error){addEditorLog(error instanceof Error?error.message:String(error),'Assets','error')}}
const selectedConnections = computed(/** 列出锚点连接到当前实体的连接。 */ () => selectedEntity.value ? state.world.connections.filter(/** 判断连接是否含当前实体的锚点。 */ connection => connection.anchors.some(/* 比较 anchor.entityId 与 selectedEntity.value!.id，返回严格相等的判断结果。 */ anchor => anchor.entityId === selectedEntity.value!.id)) : [])
const entityColor = computed(/** 把当前实体颜色转换为样式字符串，没有实体时透明。 */ () => selectedEntity.value ? `rgb(${selectedEntity.value.color.r}, ${selectedEntity.value.color.g}, ${selectedEntity.value.color.b})` : 'transparent')
const selectedEntityArea = computed(/* 根据 selectedEntity.value 的真假，分别返回 entityArea(selectedEntity.value) 或 0。 */ () => selectedEntity.value ? entityArea(selectedEntity.value) : 0)
const effectiveEntityInertia = computed(/* 根据 selectedEntity.value 的真假，分别返回 effectiveInertia(selectedEntity.value) 或 0。 */ () => selectedEntity.value ? effectiveInertia(selectedEntity.value) : 0)
const componentClipboard = ref<{ kind: ComponentKind; values: Record<string, unknown> } | null>(null)
const modifiedPropertyPaths = ref(new Set<string>())
const propertyClipboard = ref<Array<string | number | boolean> | null>(null)
const propertyMenu = reactive({ visible: false, x: 0, y: 0, path: '', row: null as HTMLElement | null })
const currentPropertyMetadata = computed<PropertyMetadata | undefined>(/* 调用 propertyMetadata(propertyMenu.path) 并返回调用结果。 */ () => propertyMetadata(propertyMenu.path))
const isCurrentPropertyPinned = computed(/* 调用 estate.pinnedInspectorProperties.includes(propertyMenu.path) 并返回调用结果。 */ () => estate.pinnedInspectorProperties.includes(propertyMenu.path))
const props = withDefaults(defineProps<{ dock?: 'left' | 'right' }>(), { dock: 'right' })
const dock = computed(/* 返回 props.dock 的当前值。 */ () => props.dock)
const panelWidth = ref(estate.inspectorWidth)
watch(/* 返回 estate.inspectorWidth 的当前值。 */ () => estate.inspectorWidth, /** 将外部尺寸更新同步到检查器宽度。 */ value => { panelWidth.value=value })
const imageAssets = computed(/** 筛选图像资源。 */ () => assetState.records.filter(/* 比较 asset.assetType 与 'image'，返回严格相等的判断结果。 */ asset => asset.assetType === 'image'))
const fontAssets = computed(/** 筛选字体资源。 */ () => assetState.records.filter(/* 比较 asset.assetType 与 'font'，返回严格相等的判断结果。 */ asset => asset.assetType === 'font'))
const scriptAssets = computed(/* 调用 assetState.records.filter(asset => asset.assetType === 'script' || asset.assetType === 'visualScript') 并返回调用结果。 */ () => assetState.records.filter(/* 先计算 asset.assetType === 'script'；仅当其为假值时求右侧 asset.assetType === 'visualScript'，返回短路求值结果。 */ asset => asset.assetType === 'script' || asset.assetType === 'visualScript'))
const eventSheetAssets = computed(/** 筛选事件表资源。 */ () => assetState.records.filter(/* 比较 asset.assetType 与 'eventSheet'，返回严格相等的判断结果。 */ asset => asset.assetType === 'eventSheet'))
const objectBlueprintAssets = computed(/** 筛选对象蓝图资源。 */ () => assetState.records.filter(/* 比较 asset.assetType 与 'objectBlueprint'，返回严格相等的判断结果。 */ asset => asset.assetType === 'objectBlueprint'))
const pathAssets = computed(/** 筛选路径资源。 */ () => assetState.records.filter(/* 比较 asset.assetType 与 'path'，返回严格相等的判断结果。 */ asset => asset.assetType === 'path'))
const pathPointsText = computed(/* 当 selectedEntity.value?.authoring.path.points.map(point => `${point.x},${point.y}`).join(' ') 为 null 或 undefined 时返回 ''，否则保留左侧值。 */ () => selectedEntity.value?.authoring.path.points.map(/** 将路径点格式化为紧凑坐标文本。 */ point => `${point.x},${point.y}`).join(' ') ?? '')
const pathTangentsText = computed(/** 把路径所有入射与出射切线串接为编辑文本。 */ () => selectedEntity.value?.authoring.path.tangents.map(/** 格式化单个入射和出射切线坐标。 */ tangent => `${tangent.incoming.x},${tangent.incoming.y}:${tangent.outgoing.x},${tangent.outgoing.y}`).join(' ') ?? '')
const scriptPropertyGroups = computed(/** 按脚本属性元数据分组导出属性，缺省使用脚本组件标题。 */ () => {
  const script = selectedEntity.value?.script2D
  if (!script) return []
  const groups = new Map<string, Array<{ name: string; value: ScriptPropertyValue; metadata: ScriptPropertyMetadata | null }>>()
  for (const [name, value] of Object.entries(script.properties)) {
    const metadata = script.propertyMetadata[name] ?? null, group = metadata?.group || t('script2D')
    groups.set(group, [...(groups.get(group) ?? []), { name, value, metadata }])
  }
  return [...groups].map(/** 将分组映射项转换为组名与属性列表。 */ ([name, properties]) => ({ name, properties }))
})
const materialAssets = computed(/** 筛选材质资源。 */ () => assetState.records.filter(/* 比较 asset.assetType 与 'material'，返回严格相等的判断结果。 */ asset => asset.assetType === 'material'))

/** 按脚本资源类型映射可绑定资源，未知类型保留全部资源。 */ function compatibleScriptResources(resourceType: string) {
  const expected: Record<string, string[]> = { Texture2D: ['image'], AudioClip: ['audio'], Font: ['font'], Scene: ['scene'], Prefab: ['prefab'], AnimationClip: ['animation'], AnimatorController: ['controller'], Material: ['material'], Script: ['script'] }
  const types = expected[resourceType] ?? []
  return types.length ? assetState.records.filter(/* 调用 types.includes(asset.assetType) 并返回调用结果。 */ asset => types.includes(asset.assetType)) : assetState.records
}
const optionalComponents: ComponentKind[] = ['SpriteRenderer2D', 'TextRenderer2D', 'Camera2D', 'Light2D', 'ShadowCaster2D', 'Script2D', 'Animator', 'Skeleton2D', 'TimelinePlayer', 'AudioSource', 'AudioListener', 'Canvas', 'RectTransform', 'Panel', 'Image', 'Text', 'Button', 'Slider', 'ProgressBar', 'Checkbox', 'TextInput', 'TileMap2D', 'ParticleEmitter2D', 'CharacterBody2D', 'GridMover2D', 'PlatformController2D', 'TopDownController2D', 'Health2D', 'DamageHitbox2D', 'Collectible2D', 'Projectile2D', 'Spawner2D', 'Cooldown2D', 'Lifetime2D', 'MouseFollower2D', 'CameraFollow2D', 'Area2D', 'AreaEffector2D', 'NavigationRegion2D', 'NavigationObstacle2D', 'NavigationAgent2D', 'BehaviorTree2D', 'StateMachine2D', 'WorldChunk2D', 'Portal2D', 'ObjectPool2D', 'FixedJoint2D', 'DistanceJoint2D', 'RevoluteJoint2D', 'PrismaticJoint2D', 'SpringJoint2D', 'WheelJoint2D', 'TargetJoint2D', 'RhythmChart2D']
const inspectorCategories = [
  { id: 'all' as const, label: 'all' as const }, { id: 'general' as const, label: 'categoryGeneral' as const },
  { id: 'transform' as const, label: 'categoryTransform' as const }, { id: 'render' as const, label: 'categoryRendering' as const },
  { id: 'physics' as const, label: 'categoryPhysics' as const }, { id: 'gameplay' as const, label: 'categoryGameplay' as const },
  { id: 'ui' as const, label: 'categoryUi' as const }
]
/** 26.44 G1: the Inspector filter menu (replaces the row of category chips). */
const filterMenu = reactive({ visible: false, x: 0, y: 0 })
const filterTrigger = ref<{ $el?: HTMLElement } | null>(null), filterMenuRoot = ref<{ $el?: HTMLElement } | null>(null)
const inspectorFilterActive = computed(() => estate.inspectorCategory !== 'all' || estate.inspectorModifiedOnly || estate.inspectorPinnedOnly)
const inspectorFilterSummary = computed(() => [
  estate.inspectorCategory !== 'all' ? t(inspectorCategories.find(category => category.id === estate.inspectorCategory)?.label ?? 'all') : '',
  estate.inspectorModifiedOnly ? t('modifiedOnly') : '', estate.inspectorPinnedOnly ? t('pinnedOnly') : ''
].filter(Boolean).join(' · '))
function closeFilterMenu(restoreFocus = false) {
  if (!filterMenu.visible) return
  filterMenu.visible = false
  window.removeEventListener('pointerdown', closeFilterMenuOutside, true)
  if (restoreFocus) filterTrigger.value?.$el?.focus?.({ preventScroll: true })
}
function closeFilterMenuOutside(event: PointerEvent) {
  const target = event.target instanceof Node ? event.target : null
  if (target && (filterMenuRoot.value?.$el?.contains?.(target) || filterTrigger.value?.$el?.contains?.(target))) return
  closeFilterMenu()
}
function toggleFilterMenu(event: MouseEvent) {
  if (filterMenu.visible) { closeFilterMenu(); return }
  const anchor = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect()
  const width = 232 * prefs.uiScale
  filterMenu.x = Math.max(8, Math.min((anchor?.right ?? event.clientX) - width, window.innerWidth - width - 8))
  filterMenu.y = Math.min((anchor?.bottom ?? event.clientY) + 6, window.innerHeight - 320)
  filterMenu.visible = true
  window.addEventListener('pointerdown', closeFilterMenuOutside, true)
}
function chooseInspectorCategory(category: typeof estate.inspectorCategory) { estate.inspectorCategory = category; closeFilterMenu(true) }
function toggleInspectorFilter(key: 'inspectorModifiedOnly' | 'inspectorPinnedOnly') { estate[key] = !estate[key]; closeFilterMenu(true) }
function clearInspectorFilters() { estate.inspectorCategory = 'all'; estate.inspectorModifiedOnly = false; estate.inspectorPinnedOnly = false }
onUnmounted(() => window.removeEventListener('pointerdown', closeFilterMenuOutside, true))
const componentSearch = ref('')
/** 26.47: also list components planned for removal (world streaming, navigation, behaviour trees). */
const componentPickerShowAll = ref(false)
const componentSearchInput = ref<HTMLInputElement | null>(null)
const addableComponents = computed(/** 合并已移除与尚未添加的可选组件，并考虑官方包可用性。 */ () => {
  if (!selectedEntity.value) return []
  const removed = [...selectedEntity.value.componentMap.values()].filter(/* 先计算 component.removed；仅当其为真值时求右侧 component.kind !== 'Transform2D'，返回短路求值结果。 */ component => component.removed && component.kind !== 'Transform2D').map(/* 返回 component.kind 的当前值。 */ component => component.kind)
  const packageAvailable = /** 按人工智能或对象池组件类别检查对应包是否启用。 */ (kind: ComponentKind) => !['BehaviorTree2D', 'StateMachine2D'].includes(kind) ? kind !== 'ObjectPool2D' || packageEnabled(OFFICIAL_OBJECT_POOL_PACKAGE_ID) : packageEnabled(OFFICIAL_AI_PACKAGE_ID)
  const missing = optionalComponents.filter(/* 先计算 packageAvailable(kind)；仅当其为真值时求右侧 !selectedEntity.value!.componentMap.has(kind)，返回短路求值结果。 */ kind => packageAvailable(kind) && !selectedEntity.value!.componentMap.has(kind))
  return [...new Set([...removed, ...missing])]
})
/** 当前选中节点可发出的信号：由它实际拥有的组件决定（§23.4）。 */
const nodeSignals = computed(/** 汇总节点组件对应的信号目录项。 */ () => {
  const entity = selectedEntity.value
  return entity ? signalsForEntity([...entity.componentMap.keys()]) : []
})

/** 可作为信号接收方的节点：必须挂接脚本资源，回调才能在运行时被调用。 */
const signalTargets = computed(/** 只列出拥有脚本资源的实体。 */ () => state.world.entities.filter(entity => Boolean(entity.script2D?.scriptAsset)))
const signalConnectOpen = ref(false)
const signalConnectSignal = ref('')
const signalConnectTarget = ref('')
const signalConnectCallback = ref('on_signal')

/** 打开某条信号的连接对话框，默认接收方取第一个拥有脚本的节点。 */
function openSignalConnect(signalId: string): void {
  signalConnectSignal.value = signalId
  signalConnectTarget.value = signalTargets.value[0]?.uuid ?? ''
  signalConnectCallback.value = 'on_signal'
  signalConnectOpen.value = true
}

/** 把连接写入**接收方**脚本资源并记录历史；复用运行时既有的 signalConnections，不新建派发模型。 */
function commitSignalConnect(): void {
  const source = selectedEntity.value
  const target = state.world.entities.find(/** 按 uuid 找到接收方。 */ entity => entity.uuid === signalConnectTarget.value)
  const uuid = target?.script2D?.scriptAsset ? assetGuid(target.script2D.scriptAsset) : null
  const record = uuid ? assetState.records.find(/** 按身份找到脚本资源。 */ candidate => candidate.uuid === uuid) : undefined
  if (!source || !target || !record) return
  const rejected = addNodeSignalConnection(record as unknown as ScriptAssetLike, {
    signal: signalConnectSignal.value,
    source: source.uuid,
    target: target.uuid,
    callback: signalConnectCallback.value,
  })
  // 非法输入由按钮禁用拦截；此处只可能是重复连接，已存在即无需再建。
  if (rejected) return
  pushHistory('Connect signal')
  signalConnectOpen.value = false
}

/** 选中节点自己的脚本资源记录；没有脚本则为 undefined。 */
const selectedScriptRecord = computed(/** 按脚本引用找到资源记录。 */ () => {
  const reference = selectedEntity.value?.script2D?.scriptAsset
  const uuid = reference ? assetGuid(reference) : null
  return uuid ? assetState.records.find(/** 按身份匹配资源。 */ candidate => candidate.uuid === uuid) : undefined
})

/** 接收方脚本中已定义的函数名，用于校验连接的回调是否真的存在。 */
const receiverScriptFunctions = computed(/** 从脚本源里提取 fn 名称。 */ () => {
  const record = selectedScriptRecord.value
  const source = record ? readTextAsset(record.source) : null
  return source ? new Set([...source.matchAll(/fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map(/** 取函数名。 */ match => match[1])) : new Set<string>()
})

/** 指向当前节点的已有连接，带原始索引以便删除。 */
const receiverConnections = computed(/** 过滤出 target 为当前节点的连接。 */ () => {
  const entity = selectedEntity.value
  const connections = selectedScriptRecord.value?.script?.signalConnections ?? []
  if (!entity) return []
  return connections.map(/** 保留原始索引。 */ (connection, index) => ({ connection, index })).filter(/** 只保留指向当前节点的连接。 */ item => item.connection.target === entity.uuid)
})

/** 回调在该节点脚本里缺失，连接无法执行 —— 必须显式提示而不是让它静默失效。 */
function connectionCallbackMissing(callback: string): boolean {
  return !receiverScriptFunctions.value.has(callback)
}

/** 删除一条指向当前节点的连接并记录历史。 */
function removeReceiverConnection(index: number): void {
  const record = selectedScriptRecord.value
  if (!record) return
  if (!removeNodeSignalConnection(record as unknown as ScriptAssetLike, index)) return
  pushHistory('Remove signal connection')
}

const filteredAddableComponents = computed(/** 按组件名、类型和分类标签筛选可添加组件。 */ () => {
  const needle = componentSearch.value.trim().toLocaleLowerCase()
  return addableComponents.value.filter(/** 判断组件的本地化名称、类型或分类是否匹配搜索词。 */ kind => !needle || `${componentTitle(kind)} ${kind} ${t(componentCategoryLabel(componentCategory(kind)))}`.toLocaleLowerCase().includes(needle))
})
const componentGroups = computed(/** 组织收藏、最近使用及分类组件列表。 */ () => {
  const groups: Array<{ name: string; kinds: ComponentKind[] }> = []
  const append = /** 仅当来源中含可用组件时追加分组。 */ (name: string, source: ComponentKind[]) => { const kinds = source.filter(/* 调用 filteredAddableComponents.value.includes(kind) 并返回调用结果。 */ kind => filteredAddableComponents.value.includes(kind)); if (kinds.length) groups.push({ name, kinds }) }
  if (!componentSearch.value.trim()) { append(t('favorites'), componentPaletteState.favorites); append(t('recentlyUsed'), componentPaletteState.recent.filter(/* 返回 componentPaletteState.favorites.includes(kind) 的逻辑取反结果。 */ kind => !componentPaletteState.favorites.includes(kind))) }
  // 26.47: rhythm groups first, the classic ones under "More"; deprecated components only when searched for
  // or with "Show all".
  const searching = !!componentSearch.value.trim(), showAll = searching || componentPickerShowAll.value
  const inCategory = (category: ComponentPaletteCategory) => filteredAddableComponents.value.filter(kind => componentPaletteMetadata(kind).category === category && (showAll || !DEPRECATED_COMPONENTS.has(kind)))
  for (const category of RHYTHM_FIRST_CATEGORIES) append(category, inCategory(category))
  for (const category of CLASSIC_CATEGORIES) append(`${t('componentMore')} · ${category}`, inCategory(category))
  return groups
})
const coreInspectorSections = computed(/** 根据当前实体已有组件构造核心属性分区列表。 */ () => {
  if (!selectedEntity.value) return []
  const entity = selectedEntity.value
  return [
    [t('entitySettings'), 'general'], [t('connections'), 'physics'], [t('transform2D'), 'transform'],
    entity.hasComponent('ShapeRenderer2D') && !entity.hasComponent('RectTransform') ? [t('shapeRenderer2D'), 'render'] : null,
    entity.spriteRenderer ? [t('spriteRenderer2D'), 'render'] : null, entity.textRenderer ? [t('textRenderer2D'), 'render'] : null,
    entity.camera2D ? [t('camera2D'), 'render'] : null, entity.script2D ? [t('script2D'), 'gameplay'] : null,
    entity.hasComponent('RigidBody2D') ? [t('rigidBody2D'), 'physics'] : null, entity.getCollider() ? [t('collider2D'), 'physics'] : null
  ].filter(/* 比较 entry 与 null，返回严格不等的判断结果。 */ (entry): entry is [string, string] => entry !== null)
})
const inspectorHasMatches = computed(/** 检查核心分区或未移除组件中是否存在可见结果。 */ () => {
  if (coreInspectorSections.value.some(/* 调用 inspectorSectionVisible(title, category as InspectorCategory) 并返回调用结果。 */ ([title, category]) => inspectorSectionVisible(title, category as InspectorCategory))) return true
  if (!selectedEntity.value) return false
  return [...selectedEntity.value.componentMap.values()].some(/* 先计算 !component.removed；仅当其为真值时求右侧 inspectorSectionVisible(componentTitle(component.kind), componentCategory(component.kind))，返回短路求值结果。 */ component => !component.removed && inspectorSectionVisible(componentTitle(component.kind), componentCategory(component.kind)))
})

/** 按检查器分类及标题搜索判断分区可见性。 */ function inspectorSectionVisible(title: string, category: InspectorCategory): boolean {
  if (estate.inspectorCategory !== 'all' && estate.inspectorCategory !== category) return false
  const needle = estate.inspectorSearch.trim().toLocaleLowerCase()
  return !needle || title.toLocaleLowerCase().includes(needle)
}

/** 把组件类型映射到界面、渲染、物理或玩法分类。 */ function componentCategory(kind: ComponentKind): InspectorCategory {
  if (['Canvas', 'RectTransform', 'Panel', 'Image', 'Text', 'Button', 'Slider', 'ProgressBar', 'Checkbox', 'TextInput'].includes(kind)) return 'ui'
  if (['SpriteRenderer2D', 'TextRenderer2D', 'Camera2D', 'TileMap2D', 'ParticleEmitter2D', 'Light2D', 'ShadowCaster2D'].includes(kind)) return 'render'
  if (['Area2D'].includes(kind)) return 'physics'
  if (kind.endsWith('Joint2D')) return 'physics'
  return 'gameplay'
}
/** 将检查器分类转换为本地化标签键。 */ function componentCategoryLabel(category: InspectorCategory): 'categoryGeneral' | 'categoryTransform' | 'categoryRendering' | 'categoryPhysics' | 'categoryGameplay' | 'categoryUi' {
  const labels: Record<InspectorCategory, 'categoryGeneral' | 'categoryTransform' | 'categoryRendering' | 'categoryPhysics' | 'categoryGameplay' | 'categoryUi'> = { general: 'categoryGeneral', transform: 'categoryTransform', render: 'categoryRendering', physics: 'categoryPhysics', gameplay: 'categoryGameplay', ui: 'categoryUi', all: 'categoryGeneral' }
  return labels[category]
}
/** 按组件分类返回对应图形标记。 */ function componentIcon(kind: ComponentKind): import('./EditorIcon.vue').EditorIconName {
  const category = componentCategory(kind)
  return ({ ui: 'ui', render: 'render', physics: 'physics', gameplay: 'script', general: 'settings', transform: 'design', all: 'settings' } as const)[category]
}
/** 清空组件搜索并打开选择器，更新后聚焦输入。 */ function openComponentPicker(): void {
  componentSearch.value = ''
  estate.componentPickerOpen = true
  void nextTick(/* 调用 componentSearchInput.value?.focus() 并返回调用结果。 */ () => componentSearchInput.value?.focus())
}
/** 关闭组件选择器。 */ function closeComponentPicker(): void { estate.componentPickerOpen = false }
/** 添加组件、记录最近使用并关闭选择器。 */ function chooseComponent(kind: ComponentKind): void { addComponent(kind); markComponentRecent(kind); closeComponentPicker() }
const parentCandidates = computed(/** 列出既非自身又不会产生父子循环的父级候选。 */ () => selectedEntity.value
  ? state.world.entities.filter(/* 先计算 entity !== selectedEntity.value；仅当其为真值时求右侧 !wouldCreateParentCycle(selectedEntity.value!, entity.uuid, state.world.entities)，返回短路求值结果。 */ entity => entity !== selectedEntity.value && !wouldCreateParentCycle(selectedEntity.value!, entity.uuid, state.world.entities))
  : [])
const selectedParentUuid = computed({
  get: /* 当 selectedEntity.value?.parentUuid 为 null 或 undefined 时返回 ''，否则保留左侧值。 */ () => selectedEntity.value?.parentUuid ?? '',
  set: /** 设置或清除父级，成功后记录历史。 */ value => {
    if (!selectedEntity.value) return
    if (setParent(selectedEntity.value, value || null, state.world.entities)) pushHistory()
  }
})
const tagsText = computed({
  get: /* 当 selectedEntity.value?.tags.join(', ') 为 null 或 undefined 时返回 ''，否则保留左侧值。 */ () => selectedEntity.value?.tags.join(', ') ?? '',
  set: /** 拆分并净化标签，去重后限制为三十二项。 */ value => {
    if (!selectedEntity.value) return
    selectedEntity.value.tags = [...new Set(value.split(',').map(/* 调用 tag.trim() 并返回调用结果。 */ tag => tag.trim()).filter(Boolean))].slice(0, 32)
  }
})
const groupsText = computed({
  get: /* 当 selectedEntity.value?.groups.join(', ') 为 null 或 undefined 时返回 ''，否则保留左侧值。 */ () => selectedEntity.value?.groups.join(', ') ?? '',
  set: /** 净化输入列表并写入当前实体分组。 */ value => { if (selectedEntity.value) selectedEntity.value.groups = cleanList(value) }
})
/* 调用 [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))].slice(0, 32) 并返回调用结果。 */ function cleanList(value: string): string[] { return [...new Set(value.split(',').map(/* 调用 item.trim() 并返回调用结果。 */ item => item.trim()).filter(Boolean))].slice(0, 32) }
// 26.45: prefab overrides name one field of one component (components.Kind.data.field); the rows
// of the inspector that show such a field are marked overridden.
const OVERRIDE_ROW_PREFIX: Record<string, string> = { Transform2D: 'Transform', SpriteRenderer2D: 'Sprite', Camera2D: 'Camera', Canvas: 'Canvas' }
const overriddenInspectorPaths = computed(() => {
  const paths = new Set<string>()
  for (const key of Object.keys(selectedEntity.value?.prefabOverrides ?? {})) {
    const match = /^components\.([A-Za-z0-9]+)\.data\.([A-Za-z0-9]+)/.exec(key)
    if (match && OVERRIDE_ROW_PREFIX[match[1]]) paths.add(`${OVERRIDE_ROW_PREFIX[match[1]]}.${match[2]}`)
    else if (key === 'enabled' || key === 'visible') paths.add(`Entity.${key}`)
  }
  return paths
})
const prefabOverrideCount = computed(/* 根据 selectedEntity.value 的真假，分别返回 Object.keys(selectedEntity.value.prefabOverrides).length 或 0。 */ () => selectedEntity.value ? Object.keys(selectedEntity.value.prefabOverrides).length : 0)
const prefabComparison = computed(/* 根据 selectedEntity.value?.prefabAsset 的真假，分别返回 comparePrefabInstance(selectedEntity.value) 或 []。 */ () => selectedEntity.value?.prefabAsset ? comparePrefabInstance(selectedEntity.value) : [])
const prefabConflicts = computed(/* 根据 selectedEntity.value 的真假，分别返回 prefabConflictReport(selectedEntity.value) 或 []。 */ () => selectedEntity.value ? prefabConflictReport(selectedEntity.value) : [])
const selectedValidation = computed(/* 根据 selectedEntity.value 的真假，分别返回 validateEntityAuthoring(selectedEntity.value, state.world.entities) 或 []。 */ () => selectedEntity.value ? validateEntityAuthoring(selectedEntity.value, state.world.entities) : [])

/** 按组件类型取得本地化标题，碰撞组件使用通用标题。 */ function componentTitle(kind: ComponentKind): string {
  if (kind === 'Transform2D') return t('transform2D')
  if (kind === 'ShapeRenderer2D') return t('shapeRenderer2D')
  if (kind === 'SpriteRenderer2D') return t('spriteRenderer2D')
  if (kind === 'TextRenderer2D') return t('textRenderer2D')
  if (kind === 'Camera2D') return t('camera2D')
  if (kind === 'Script2D') return t('script2D')
  if (kind === 'RigidBody2D') return t('rigidBody2D')
  if (kind === 'Animator') return t('animator')
  if (kind === 'Skeleton2D') return t('skeleton2D')
  if (kind === 'TimelinePlayer') return t('timelinePlayer')
  if (kind === 'AudioSource') return t('audioSource')
  if (kind === 'AudioListener') return t('audioListener')
  if (kind === 'RectTransform') return t('rectTransform')
  if (kind === 'Canvas') return t('uiCanvas')
  if (kind === 'Panel') return t('uiPanel')
  if (kind === 'Image') return t('uiImage')
  if (kind === 'Text') return t('uiText')
  if (kind === 'Button') return t('uiButton')
  if (kind === 'Slider') return t('uiSlider')
  if (kind === 'ProgressBar') return t('uiProgressBar')
  if (kind === 'Checkbox') return t('uiCheckbox')
  if (kind === 'TextInput') return t('uiTextInput')
  if (kind === 'TileMap2D') return t('tileMap2D')
  if (kind === 'ParticleEmitter2D') return t('particleEmitter2D')
  if (kind === 'Light2D') return t('light2D')
  if (kind === 'ShadowCaster2D') return t('shadowCaster2D')
  if (kind === 'CharacterBody2D') return t('characterBody2D')
  if (kind === 'Area2D') return t('area2D')
  if (kind === 'AreaEffector2D') return t('areaEffector2D')
  if (kind === 'NavigationRegion2D') return t('navigationRegion2D')
  if (kind === 'NavigationObstacle2D') return t('navigationObstacle2D')
  if (kind === 'NavigationAgent2D') return t('navigationAgent2D')
  if (kind === 'BehaviorTree2D') return t('behaviorTree2D')
  if (kind === 'StateMachine2D') return t('stateMachine2D')
  if (kind === 'GridMover2D') return t('gridMover2D')
  if (kind === 'PlatformController2D') return t('platformController2D')
  if (kind === 'TopDownController2D') return t('topDownController2D')
  if (kind === 'Health2D') return t('health2D')
  if (kind === 'DamageHitbox2D') return t('damageHitbox2D')
  if (kind === 'Collectible2D') return t('collectible2D')
  if (kind === 'Projectile2D') return t('projectile2D')
  if (kind === 'Spawner2D') return t('spawner2D')
  if (kind === 'Cooldown2D') return t('cooldown2D')
  if (kind === 'RhythmChart2D') return t('rhythmChart2D')
  if (kind === 'Lifetime2D') return t('lifetime2D')
  if (kind === 'MouseFollower2D') return t('mouseFollower2D')
  if (kind === 'CameraFollow2D') return t('cameraFollow2D')
  if (kind === 'WorldChunk2D') return t('worldChunk2D')
  if (kind === 'Portal2D') return t('portal2D')
  if (kind === 'ObjectPool2D') return t('objectPool2D')
  if (kind.endsWith('Joint2D')) return t(kind as Parameters<typeof t>[0])
  return t('collider2D')
}

/** 按可选组件类型创建默认实例，不支持时返回空值。 */ function newOptionalComponent(kind: ComponentKind): Component2D | null {
  if (kind === 'Animator') return new Animator()
  if (kind === 'Skeleton2D') return new Skeleton2D()
  if (kind === 'TimelinePlayer') return new TimelinePlayer()
  if (kind === 'AudioSource') return new AudioSource()
  if (kind === 'AudioListener') return new AudioListener()
  if (kind === 'Canvas') return new Canvas()
  if (kind === 'RectTransform') return new RectTransform()
  if (kind === 'Panel') return new Panel()
  if (kind === 'Image') return new UIImage()
  if (kind === 'Text') return new UIText()
  if (kind === 'Button') return new Button()
  if (kind === 'Slider') return new Slider()
  if (kind === 'ProgressBar') return new ProgressBar()
  if (kind === 'Checkbox') return new Checkbox()
  if (kind === 'TextInput') return new TextInput()
  if (kind === 'TileMap2D') return new TileMap2D()
  if (kind === 'ParticleEmitter2D') return new ParticleEmitter2D()
  if (kind === 'Light2D') return new Light2D()
  if (kind === 'ShadowCaster2D') return new ShadowCaster2D()
  if (kind === 'CharacterBody2D') return new CharacterBody2D()
  if (kind === 'Area2D') return new Area2D()
  if (kind === 'AreaEffector2D') return new AreaEffector2D()
  if (kind === 'NavigationRegion2D') return new NavigationRegion2D()
  if (kind === 'NavigationObstacle2D') return new NavigationObstacle2D()
  if (kind === 'NavigationAgent2D') return new NavigationAgent2D()
  if (kind === 'BehaviorTree2D') return new BehaviorTree2D()
  if (kind === 'StateMachine2D') return new StateMachine2D()
  if (kind === 'GridMover2D') return new GridMover2D()
  if (kind === 'PlatformController2D') return new PlatformController2D()
  if (kind === 'TopDownController2D') return new TopDownController2D()
  if (kind === 'Health2D') return new Health2D()
  if (kind === 'DamageHitbox2D') return new DamageHitbox2D()
  if (kind === 'Collectible2D') return new Collectible2D()
  if (kind === 'Projectile2D') return new Projectile2D()
  if (kind === 'Spawner2D') return new Spawner2D()
  if (kind === 'Cooldown2D') return new Cooldown2D()
  if (kind === 'RhythmChart2D') return new RhythmChart2D()
  if (kind === 'Lifetime2D') return new Lifetime2D()
  if (kind === 'MouseFollower2D') return new MouseFollower2D()
  if (kind === 'CameraFollow2D') return new CameraFollow2D()
  if (kind === 'WorldChunk2D') return new WorldChunk2D()
  if (kind === 'Portal2D') return new Portal2D()
  if (kind === 'ObjectPool2D') return new ObjectPool2D()
  if (kind === 'TargetJoint2D') return new TargetJoint2D()
  if (kind.endsWith('Joint2D')) return new Joint2D(kind as JointKind2D)
  return null
}
/** 切换组件启用状态并记录历史，变换组件保持启用。 */ function toggleComponent(kind: ComponentKind) {
  const component = selectedEntity.value?.getComponent(kind, true)
  if (!component || kind === 'Transform2D') return
  component.enabled = !component.enabled
  pushHistory()
}
/** 在允许范围内调整组件顺序并重建有序映射。 */ function reorderComponent(kind: ComponentKind, direction: -1 | 1) {
  const entity = selectedEntity.value; if (!entity || kind === 'Transform2D') return
  const entries = [...entity.componentMap.entries()], index = entries.findIndex(/* 比较 candidate 与 kind，返回严格相等的判断结果。 */ ([candidate]) => candidate === kind), destination = index + direction
  if (index < 0 || destination < 1 || destination >= entries.length) return
  const [entry] = entries.splice(index, 1); entries.splice(destination, 0, entry)
  entity.componentMap.clear(); for (const [entryKind, component] of entries) entity.componentMap.set(entryKind, component)
  pushHistory('Reorder component', `components:${entity.uuid}`)
}

/** 取得属性行内输入框、选择框、文本框和开关按钮。 */ function propertyControls(row: HTMLElement | null): Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement> {
  return row ? [...row.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>('input,select,textarea,button[role="switch"]')] : []
}
/** 按开关、复选框、数值或文本类型读取控件值。 */ function readControl(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement): string | number | boolean {
  if (control instanceof HTMLButtonElement) return control.getAttribute('aria-checked') === 'true'
  if (control instanceof HTMLInputElement && control.type === 'checkbox') return control.checked
  if (control instanceof HTMLInputElement && (control.type === 'number' || control.type === 'range')) return Number(control.value)
  return control.value
}
/** 按控件类型写值，并触发原有输入与变更事件。 */ function writeControl(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement, value: string | number | boolean): void {
  if (control instanceof HTMLButtonElement) { if ((control.getAttribute('aria-checked') === 'true') !== Boolean(value)) control.click(); return }
  if (control instanceof HTMLInputElement && control.type === 'checkbox') control.checked = Boolean(value)
  else control.value = String(value)
  control.dispatchEvent(new Event('input', { bubbles: true })); control.dispatchEvent(new Event('change', { bubbles: true }))
}
/** 打开属性菜单并限制位置，保存属性路径和来源行。 */ function openPropertyMenu(event: MouseEvent, path: string) { event.preventDefault(); propertyMenu.visible = true; propertyMenu.x = Math.min(event.clientX, window.innerWidth - 230); propertyMenu.y = Math.min(event.clientY, window.innerHeight - 330); propertyMenu.path = path; propertyMenu.row = event.currentTarget as HTMLElement }
/** 关闭属性菜单并清除来源行。 */ function closePropertyMenu() { propertyMenu.visible = false; propertyMenu.row = null }
/** 用属性元数据默认值重置控件，清除修改标记并记录历史。 */ function resetPropertyValue() { const metadata = currentPropertyMetadata.value, controls = propertyControls(propertyMenu.row); if (!metadata) return; controls.forEach(/* 调用 writeControl(control, metadata.defaults[Math.min(index, metadata.defaults.length - 1)]) 并返回调用结果。 */ (control, index) => writeControl(control, metadata.defaults[Math.min(index, metadata.defaults.length - 1)])); modifiedPropertyPaths.value.delete(propertyMenu.path); modifiedPropertyPaths.value = new Set(modifiedPropertyPaths.value); pushHistory('Reset property', `property:${numericResourceKey.value}:${propertyMenu.path}`); closePropertyMenu() }
/** 撤销指定预制体覆盖，清除修改标记并记录历史。 */ function revertPropertyOverride() { const entity = selectedEntity.value; if (entity?.prefabAsset) resetPrefabOverride(entity, propertyMenu.path); modifiedPropertyPaths.value.delete(propertyMenu.path); modifiedPropertyPaths.value = new Set(modifiedPropertyPaths.value); pushHistory('Revert property override', `property:${numericResourceKey.value}:${propertyMenu.path}`); closePropertyMenu() }
/** 将属性行控件值复制到内部剪贴板。 */ function copyPropertyValue() { propertyClipboard.value = propertyControls(propertyMenu.row).map(readControl); closePropertyMenu() }
/** 把剪贴板值写入属性控件，标记修改并记录历史。 */ function pastePropertyValue() { const values = propertyClipboard.value; if (!values) return; propertyControls(propertyMenu.row).forEach(/* 调用 writeControl(control, values[Math.min(index, values.length - 1)]) 并返回调用结果。 */ (control, index) => writeControl(control, values[Math.min(index, values.length - 1)])); modifiedPropertyPaths.value.add(propertyMenu.path); modifiedPropertyPaths.value = new Set(modifiedPropertyPaths.value); pushHistory('Paste property value', `property:${numericResourceKey.value}:${propertyMenu.path}`); closePropertyMenu() }
/** 复制属性路径到系统剪贴板，同时在状态栏显示路径。 */ function copyPropertyPath() { void navigator.clipboard?.writeText(propertyMenu.path).catch(/* 返回 undefined 的当前值。 */ () => undefined); estate.statusText = propertyMenu.path; closePropertyMenu() }
/** 记录当前实体动画属性并打开动画面板。 */ function keyframeProperty() { if (selectedEntity.value) { recordEntityProperties([selectedEntity.value]); estate.bottomPanelTab = 'animation'; estate.bottomPanelOpen = true; estate.statusText = t('propertyKeyframed') } closePropertyMenu() }
/** 切换当前属性路径的固定状态。 */ function togglePropertyPin() { const index = estate.pinnedInspectorProperties.indexOf(propertyMenu.path); if (index >= 0) estate.pinnedInspectorProperties.splice(index, 1); else estate.pinnedInspectorProperties.push(propertyMenu.path); closePropertyMenu() }
/** 复制组件可序列化值并显示完成状态。 */ function copyComponent(kind: ComponentKind) {
  const component = selectedEntity.value?.getComponent(kind, true)
  if (!component) return
  componentClipboard.value = { kind, values: copyComponentValues(component) }
  estate.statusText = t('componentCopied')
}
/** 在历史事务中应用组件值、规范化并捕获覆盖及录制；失败时回滚并显示错误。 */ function applyInspectorComponentValues(component: Component2D, values: Record<string, unknown>, label: string): boolean {
  const entity = selectedEntity.value
  if (!entity || !beginHistoryTransaction(label, null, `component:${entity.uuid}:${component.kind}`)) return false
  try {
    pasteComponentValues(component, values)
    normalizeEntity(entity)
    if (entity.prefabAsset) capturePrefabOverrides(entity)
    recordEntityProperties([entity])
    commitHistoryTransaction()
    return true
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error)
    try { cancelHistoryTransaction() } catch (rollbackError) { message += `; ${String(rollbackError)}` }
    estate.statusText = message
    return false
  }
}
/** 仅同类型组件允许粘贴，并使用事务入口应用值。 */ function pasteComponent(kind: ComponentKind) {
  const component = selectedEntity.value?.getComponent(kind, true)
  if (!component || componentClipboard.value?.kind !== kind) return
  if (applyInspectorComponentValues(component, componentClipboard.value.values, `Paste ${kind} values`)) estate.statusText = t('componentPasted')
}
/** 存在预设时应用首个预设，否则保存当前组件为预设。 */ function useComponentPreset(kind: ComponentKind) {
  const component = selectedEntity.value?.getComponent(kind, true)
  if (!component) return
  const existing = componentPresets(kind)[0]
  if (existing) {
    if (applyInspectorComponentValues(component, existing.values, `Apply ${kind} preset`)) estate.statusText = t('componentPresetApplied')
    return
  }
  saveComponentPreset(kind, `${selectedEntity.value?.name ?? kind} ${kind}`, copyComponentValues(component))
  estate.statusText = t('componentPresetSaved')
}

/** 恢复组件默认配置，形状和碰撞保留几何，再启用并记录历史。 */ function resetComponent(kind: ComponentKind) {
  const entity = selectedEntity.value
  const component = entity?.getComponent(kind, true)
  if (!entity || !component) return
  if (component instanceof Transform) pasteComponentValues(component, copyComponentValues(new Transform()))
  else if (component instanceof ShapeRenderer2D) {
    const fresh = new ShapeRenderer2D(component.shape)
    fresh.vertices = component.vertices.map(/** 复制保留的渲染几何顶点。 */ vertex => ({ ...vertex }))
    fresh.radiusX = component.radiusX
    fresh.radiusY = component.radiusY
    pasteComponentValues(component, copyComponentValues(fresh))
  } else if (component instanceof SpriteRenderer2D) pasteComponentValues(component, copyComponentValues(new SpriteRenderer2D()))
  else if (component instanceof TextRenderer2D) pasteComponentValues(component, copyComponentValues(new TextRenderer2D()))
  else if (component instanceof Camera2D) pasteComponentValues(component, copyComponentValues(new Camera2D()))
  else if (component instanceof Script2D) pasteComponentValues(component, copyComponentValues(new Script2D()))
  else if (component instanceof RigidBody2D) pasteComponentValues(component, copyComponentValues(new RigidBody2D()))
  else if (component instanceof Collider2D) {
    const fresh = new Collider2D(component.kind)
    fresh.size = { ...component.size }
    fresh.vertices = component.vertices.map(/** 复制保留的碰撞几何顶点。 */ vertex => ({ ...vertex }))
    fresh.radiusX = component.radiusX
    fresh.radiusY = component.radiusY
    pasteComponentValues(component, copyComponentValues(fresh))
  } else {
    const fresh = newOptionalComponent(kind)
    if (fresh) pasteComponentValues(component, copyComponentValues(fresh))
  }
  component.enabled = true
  component.removed = false
  normalizeEntity(entity)
  pushHistory()
  estate.statusText = t('componentReset')
}
/** 确认后移除非变换组件并记录历史。 */ async function removeComponent(kind: ComponentKind) {
  const entity = selectedEntity.value
  if (!entity || kind === 'Transform2D') return
  const approved = await requestConfirmation({ title: t('removeComponent'), message: `${t('removeComponent')}: ${componentTitle(kind)}?`, confirmLabel: t('confirmAction'), cancelLabel: t('cancel'), destructive: true })
  if (!approved || !entity.removeComponent(kind)) return
  pushHistory()
  estate.statusText = t('componentRemoved')
}
/** 恢复已移除组件的存在和启用状态。 */ function addRemovedComponent(kind: ComponentKind) {
  const component = selectedEntity.value?.getComponent(kind, true)
  if (!component) return
  component.removed = false
  component.enabled = true
  pushHistory()
  estate.statusText = t('componentAdded')
}
/** 检查冲突后添加组件及依赖，配置角色物理和界面无障碍并记录历史。 */ function addComponent(kind: ComponentKind) {
  const entity = selectedEntity.value
  if (!entity) return
  const existing = entity.getComponent(kind, true)
  if (existing) { addRemovedComponent(kind); return }
  const rule = componentAuthoringRule(kind)
  if (rule.conflicts.some(/* 调用 entity.hasComponent(conflict) 并返回调用结果。 */ conflict => entity.hasComponent(conflict))) { estate.statusText = t('componentConflictWarning', { component: kind, conflict: rule.conflicts.find(/* 调用 entity.hasComponent(conflict) 并返回调用结果。 */ conflict => entity.hasComponent(conflict)) ?? '' }); return }
  if (kind === 'SpriteRenderer2D') { const component = entity.addComponent(new SpriteRenderer2D()); component.sortingLayer = entity.layer }
  else if (kind === 'TextRenderer2D') { const component = entity.addComponent(new TextRenderer2D()); component.sortingLayer = entity.layer }
  else if (kind === 'Camera2D') entity.addComponent(new Camera2D())
  else if (kind === 'Script2D') entity.addComponent(new Script2D())
  else {
    const component = newOptionalComponent(kind)
    if (!component) return
    entity.addComponent(component)
    if (kind === 'CharacterBody2D') {
      const body = entity.getComponent<RigidBody2D>('RigidBody2D', true) ?? entity.addComponent(new RigidBody2D())
      body.removed = false; body.enabled = true; body.bodyType = 'Kinematic'; body.gravityScale = 0
    }
    if (kind === 'Area2D') {
      const collider = entity.getCollider(true)
      if (collider) { collider.removed = false; collider.enabled = true; collider.sensor = true }
    }
  }
  for (const dependency of rule.required) if (!entity.hasComponent(dependency)) addComponent(dependency)
  if (kind === 'Button' || kind === 'Slider' || kind === 'Checkbox' || kind === 'TextInput') {
    const rect = entity.getComponent<RectTransform>('RectTransform')
    if (rect) rect.skipNavigation = false
  }
  configureUiAccessibility(entity, state.world.entities)
  normalizeEntity(entity)
  pushHistory('Add component', `component:${entity.uuid}:${kind}`)
  estate.statusText = t('componentAdded')
}

const builderOpen = ref(false)
const editingConnectionId = ref<number | null>(null)
/** 设置待编辑连接并打开连接构建器。 */ function openConnection(id: number | null) { editingConnectionId.value = id; builderOpen.value = true }
/** 按偏好决定是否请求破坏性连接操作确认。 */ async function confirmConnectionAction(title: string, message: string): Promise<boolean> { return !prefs.confirmDestructiveActions || requestConfirmation({ title, message, confirmLabel: t('confirmAction'), cancelLabel: t('cancel'), destructive: true }) }
/** 确认后删除连接，记录历史并更新状态。 */ async function removeConnection(id: number) { if (!await confirmConnectionAction(t('deleteConnectionTitle'), t('confirmConnectionDelete'))) return; deleteConnection(id); pushHistory(); estate.statusText = t('connectionDeleted') }
/** 确认后删除绑定连接，使复合体分离并记录历史。 */ async function separate(id: number) { if (!await confirmConnectionAction(t('separateBindingTitle'), t('confirmSeparateBinding'))) return; deleteConnection(id); pushHistory(); estate.statusText = t('bindingSeparated') }
/** 修复指定连接并记录历史。 */ function repair(id: number) { repairConnection(id); pushHistory() }

const inspectorControlIds = new WeakMap<HTMLElement, number>()
let nextInspectorControlId = 0
/** 规范化实体、捕获预制体覆盖及动画属性，并按实体和控件身份合并历史。 */ function onConfigChange(event?: Event) {
  if (!canEdit.value || !selectedEntity.value) return
  const target = event?.target instanceof HTMLElement ? event.target : null
  const path = target?.closest<HTMLElement>('[data-property-path]')?.dataset.propertyPath
  if (path) { modifiedPropertyPaths.value.add(path); modifiedPropertyPaths.value = new Set(modifiedPropertyPaths.value) }
  if (selectedEntity.value.isStatic) selectedEntity.value.isKinematic = false
  normalizeEntity(selectedEntity.value)
  if (selectedEntity.value.prefabAsset) capturePrefabOverrides(selectedEntity.value)
  recordEntityProperties([selectedEntity.value])
  // Field identity includes the entity because Vue reuses controls on selection changes.
  // Calls without an originating control remain separate explicit commands.
  if (target && !inspectorControlIds.has(target)) inspectorControlIds.set(target, ++nextInspectorControlId)
  const mergeKey = target ? `property:${selectedEntity.value.uuid}:${path ?? 'field'}:${inspectorControlIds.get(target)}` : null
  pushHistory('Set property', mergeKey)
}
/** 解析并验证物理材质格式，失败时返回空值。 */ function physicsMaterialDocument(uuid: string) { const source = readTextAsset(uuid); if (!source) return null; try { const value = JSON.parse(source) as Record<string, unknown>; return value.format === 'nova-physics-material' ? normalizePhysicsMaterial(value) : null } catch { return null } }
/* 当 physicsMaterialDocument(uuid)?.name 为 null 或 undefined 时返回 t('physicsMaterial')，否则保留左侧值。 */ function physicsMaterialName(uuid: string) { return physicsMaterialDocument(uuid)?.name ?? t('physicsMaterial') }
/** 应用绑定物理材质，自动质量模式同步密度，再提交配置。 */ function applySelectedPhysicsMaterial() { const entity = selectedEntity.value; if (!entity?.collider.materialAsset) return; const material = physicsMaterialDocument(entity.collider.materialAsset.replace(/^asset:\/\//, '')); if (!material) return; Object.assign(entity.collider.material, material); if (entity.rigidBody.massMode === 'Automatic') entity.rigidBody.density = material.density; onConfigChange() }
/** 仅接受有限数并将作者排序值截为整数。 */ function setAuthoringOrder(value: number) { const entity = selectedEntity.value; if (!entity || !Number.isFinite(value)) return; entity.authoring.zOrder = Math.trunc(value) }
/** 设置有效图层，同步作者渲染层及编辑器活动层。 */ function setAuthoringLayer(value: number) { const entity = selectedEntity.value; if (!entity || !estate.layers.includes(value)) return; entity.layer = value; entity.authoring.renderLayer = value; estate.activeLayer = value }
/** 更新作者路径点和独立渲染顶点，截短切线并提交配置。 */ function updatePathPoints(value: ParsedPathText, event?: Event) { const entity = selectedEntity.value; if (!entity || value.kind !== 'points') return; entity.authoring.path.points = value.points; entity.renderer.vertices = value.points.map(/** 复制路径点避免作者与渲染几何共享对象。 */ point => ({ ...point })); entity.authoring.path.tangents = entity.authoring.path.tangents.slice(0, value.points.length); onConfigChange(event) }
/** 更新已解析路径切线并提交配置。 */ function updatePathTangents(value: ParsedPathText, event?: Event) { const entity = selectedEntity.value; if (!entity || value.kind !== 'tangents') return; entity.authoring.path.tangents = value.tangents; onConfigChange(event) }
/** 验证路径资源格式、版本和点数组，解析失败返回空值。 */ function pathDocument(source: string) { try { const value = JSON.parse(source) as Record<string, unknown>; if (value.format !== 'nova-path-2d' || value.version !== 1 || !Array.isArray(value.points)) return null; return value } catch { return null } }
/** 加载路径资源并限制点数、净化坐标和切线，同步渲染几何并记录历史。 */ function loadSelectedPathAsset() { const entity = selectedEntity.value, source = readTextAsset(entity?.authoring.path.asset); if (!entity || !source) return; const document = pathDocument(source); if (!document) { estate.statusText = t('invalidPathAsset'); return } const points = (document.points as Array<Record<string, unknown>>).slice(0, 10_000).map(/** 将资源点坐标转换为有限数。 */ point => ({ x: finiteNumber(point.x), y: finiteNumber(point.y) })); if (points.length < 2) return; entity.authoring.path.points = points; entity.authoring.path.closed = document.closed === true; entity.authoring.path.smoothing = Math.min(1, Math.max(0, finiteNumber(document.smoothing, .5))); entity.authoring.path.tangents = Array.isArray(document.tangents) ? (document.tangents as Array<Record<string, Record<string, unknown>>>).slice(0, points.length).map(/** 将资源入射和出射切线坐标转换为有限数。 */ tangent => ({ incoming: { x: finiteNumber(tangent.incoming?.x), y: finiteNumber(tangent.incoming?.y) }, outgoing: { x: finiteNumber(tangent.outgoing?.x), y: finiteNumber(tangent.outgoing?.y) } })) : []; entity.renderer.vertices = points.map(/** 复制加载后的路径点到渲染几何。 */ point => ({ ...point })); pushHistory('Load reusable path', `path:${entity.uuid}`) }
/** 结算编辑草稿后保存可复用路径资源，绑定并选中新资源。 */ function saveSelectedPathAsset() { if (!settleEditorDrafts()) return; const entity = selectedEntity.value; if (!entity || entity.authoring.path.points.length < 2) return; const source = JSON.stringify({ format: 'nova-path-2d', version: 1, closed: entity.authoring.path.closed, smoothing: entity.authoring.path.smoothing, points: entity.authoring.path.points, tangents: entity.authoring.path.tangents }, null, 2); const asset = createTextAsset(`${entity.name} Path`, 'path', source, 'Assets/Paths'); entity.authoring.path.asset = assetReference(asset.uuid); assetState.selectedGuid = asset.uuid; pushHistory('Save reusable path', `path:${entity.uuid}`); estate.statusText = t('reusablePathSaved') }
/** 从运行时同步脚本导出属性，成功时记录历史。 */ function synchronizeScriptProperties() {
  if (!selectedEntity.value?.script2D) return
  const error = gameplayRuntime.synchronizeExports(selectedEntity.value)
  estate.statusText = error ?? t('scriptPropertiesUpdated')
  if (!error) pushHistory('Refresh script properties')
}
/** 绑定当前事件表后刷新脚本属性、记录历史并失效运行时。 */ function applySelectedEventSheet() { const entity=selectedEntity.value,reference=entity?.script2D?.eventSheetAsset;if(!entity||!reference)return;if(attachEventSheet(entity,reference)){synchronizeScriptProperties();pushHistory('Attach Event Sheet');state.world.invalidateRuntime()} }
/** 打开绑定的事件表并切换到脚本工作区。 */ function openSelectedEventSheet() { const uuid=assetGuid(selectedEntity.value?.script2D?.eventSheetAsset);if(!uuid)return;openEventSheetAsset(uuid);applyEditorWorkspace('script') }
/** 设置脚本导出属性并提交配置变化。 */ function setScriptProperty(name: string, value: ScriptPropertyValue) {
  if (!selectedEntity.value?.script2D) return
  selectedEntity.value.script2D.properties[name] = value
  onConfigChange()
}
/* 先计算 Array.isArray(value) && value.length === 2；仅当其为真值时求右侧 value.every(item => typeof item === 'number' && Number.isFinite(item))，返回短路求值结果。 */ function isScriptVec2(value: ScriptPropertyValue): value is [number, number] { return Array.isArray(value) && value.length === 2 && value.every(/* 先计算 typeof item === 'number'；仅当其为真值时求右侧 Number.isFinite(item)，返回短路求值结果。 */ item => typeof item === 'number' && Number.isFinite(item)) }
/** 将脚本结构数据格式化为 JSON，序列化失败时显示空值文本。 */ function scriptDataText(value: ScriptPropertyValue): string { try { return JSON.stringify(value, null, 2) } catch { return 'null' } }
/** 仅对二维向量和有限输入复制更新指定分量。 */ function setScriptVectorPart(name: string, index: 0 | 1, number: number) { const value = selectedEntity.value?.script2D?.properties[name]; if (value === undefined || !isScriptVec2(value)) return; if (!Number.isFinite(number)) return; const next: [number, number] = [value[0], value[1]]; next[index] = number; setScriptProperty(name, next) }
/** 解析脚本 JSON 属性并提交，失败则显示无效数据提示。 */ function setScriptDataProperty(name: string, event: Event) { try { const value = JSON.parse((event.target as HTMLTextAreaElement).value) as ScriptPropertyValue; setScriptProperty(name, value); estate.statusText = t('scriptPropertiesUpdated') } catch { estate.statusText = t('invalidGraphData') } }
/** 将当前实体保存为预制体并显示成功或失败状态。 */ function createSelectedPrefab() {
  if (!selectedEntity.value) return
  const reference = createPrefabFromEntities([selectedEntity.value.id], selectedEntity.value.name)
  estate.statusText = reference ? t('prefabCreated') : t('prefabFailed')
}
/** 把当前实例修改应用回预制体并显示状态。 */ function applySelectedPrefab() {
  if (!selectedEntity.value || !applyPrefabFromInstance(selectedEntity.value)) return
  // 26.45: say what followed beyond the open scene (closed scenes and variants).
  const carried = lastPrefabPropagation
  estate.statusText = carried.scenes || carried.variants ? `${t('prefabApplied')} · ${t('prefabPropagated').replace('{scenes}', String(carried.scenes)).replace('{variants}', String(carried.variants))}` : t('prefabApplied')
}
/** 恢复当前预制体实例并显示状态。 */ function revertSelectedPrefab() { if (selectedEntity.value && revertPrefabInstance(selectedEntity.value)) estate.statusText = t('prefabReverted') }
/** 解包当前预制体实例并显示状态。 */ function unpackSelectedPrefab() { if (selectedEntity.value && unpackPrefabInstance(selectedEntity.value)) estate.statusText = t('prefabUnpacked') }
/** 从当前实例创建预制体变体并显示结果。 */ function createSelectedPrefabVariant() { const entity = selectedEntity.value; if (!entity) return; const reference = createPrefabVariantFromInstance(entity); estate.statusText = reference ? t('prefabVariantCreated') : t('prefabFailed') }
/** 在资源面板定位当前预制体并打开底栏。 */ function locateSelectedPrefab() { const guid = assetGuid(selectedEntity.value?.prefabAsset); if (!guid) return; assetState.selectedGuid = guid; estate.bottomPanelTab = 'assets'; estate.bottomPanelVisible = true; estate.bottomPanelOpen = true; estate.statusText = selectedEntity.value?.prefabAsset ?? '' }
/** 重置指定预制体属性覆盖并显示状态。 */ function resetSelectedPrefabOverride(path: string) { if (selectedEntity.value && resetPrefabOverride(selectedEntity.value, path)) estate.statusText = t('prefabOverrideReset') }
/** 解包当前场景实例并显示状态。 */ function unpackSelectedScene() { if (selectedEntity.value && unpackSceneInstance(selectedEntity.value)) estate.statusText = t('sceneUnpacked') }
/** 将编辑器活动层同步到实体所在层。 */ function onLayerChange() { if (selectedEntity.value) estate.activeLayer = selectedEntity.value.layer }
const bodyType = computed({ get: /** 按实体静态及运动学状态取得物理体类型。 */ () => !selectedEntity.value ? 'Dynamic' : selectedEntity.value.isStatic ? 'Static' : selectedEntity.value.isKinematic ? 'Kinematic' : 'Dynamic', set: /** 更新静态和运动学标记并规范化实体。 */ value => { if (!selectedEntity.value) return; selectedEntity.value.isStatic = value === 'Static'; selectedEntity.value.isKinematic = value === 'Kinematic'; normalizeEntity(selectedEntity.value) } })
/** 密度修改时切换自动质量并重新计算质量。 */ function onDensityChange() { if (selectedEntity.value) { selectedEntity.value.rigidBody.massMode = 'Automatic'; syncMassFromDensity(selectedEntity.value) } }
/** 质量修改时切换手动质量并反算密度。 */ function onMassChange() { if (selectedEntity.value) { selectedEntity.value.rigidBody.massMode = 'Manual'; syncDensityFromMass(selectedEntity.value) } }
watch(selectedEntityArea, /** 面积有效且使用自动质量时重新计算质量。 */ area => { if (selectedEntity.value && area > MIN_AREA && selectedEntity.value.rigidBody.massMode === 'Automatic') syncMassFromDensity(selectedEntity.value) })

const textureInput = ref<HTMLInputElement | null>(null)
/** 导入纹理文件并绑定资源，清除旧纹理缓存并记录历史。 */ async function applyTexture(event: Event) { const entity = selectedEntity.value; const file = (event.target as HTMLInputElement).files?.[0]; if (!entity || !file) return; try { const [asset] = await importAssetFiles([file], 'Assets/Sprites'); if (!asset) return; entity.renderer.textureAsset = assetReference(asset.uuid); entity.texture = null; entity.textureImage = undefined; pushHistory('Import texture asset') } catch { estate.statusText = t('textureFailed') } }
/** 清除纹理资源和缓存及文件选择，记录历史。 */ function clearTexture() { if (!selectedEntity.value) return; selectedEntity.value.renderer.textureAsset = null; selectedEntity.value.texture = null; selectedEntity.value.textureImage = undefined; if (textureInput.value) textureInput.value.value = ''; pushHistory() }
/** 将颜色通道约束为字节并编码为十六进制颜色。 */ function rgbHex(color: { r: number; g: number; b: number }): string { return `#${[color.r, color.g, color.b].map(/* 调用 Math.min(255, Math.max(0, Math.round(value))).toString(16).padStart(2, '0') 并返回调用结果。 */ value => Math.min(255, Math.max(0, Math.round(value))).toString(16).padStart(2, '0')).join('')}` }
/** 解析颜色输入并更新三通道，再提交配置变化。 */ function setRgb(target: { r: number; g: number; b: number }, event: Event) { const value = Number.parseInt((event.target as HTMLInputElement).value.slice(1), 16); target.r = value >> 16 & 255; target.g = value >> 8 & 255; target.b = value & 255; onConfigChange() }

const impulseX = ref(0), impulseY = ref(0), offsetX = ref(0), offsetY = ref(0), angularImpulse = ref(0)
/** 为动态刚体应用线性与偏心角冲量，规范化并记录历史。 */ function applyImpulse() { const entity = selectedEntity.value; if (!entity || bodyType.value !== 'Dynamic') return; normalizeEntity(entity); const x = finiteNumber(impulseX.value), y = finiteNumber(impulseY.value); entity.velocity.x += x / entity.mass; entity.velocity.y += y / entity.mass; entity.angularVelocity += (finiteNumber(offsetX.value) * y - finiteNumber(offsetY.value) * x) / effectiveInertia(entity); normalizeEntity(entity); pushHistory() }
/** 为动态刚体按有效转动惯量应用角冲量。 */ function applyAngularImpulse() { const entity = selectedEntity.value; if (!entity || bodyType.value !== 'Dynamic') return; entity.angularVelocity += finiteNumber(angularImpulse.value) / effectiveInertia(entity); normalizeEntity(entity); pushHistory() }

const showColorPicker = ref(false), tempColor = ref('#ffffff')
/** 以当前实体颜色初始化并打开颜色选择器。 */ function openColorPicker() { if (!selectedEntity.value) return; const { r, g, b } = selectedEntity.value.color; tempColor.value = `#${[r, g, b].map(/* 调用 Math.round(value).toString(16).padStart(2, '0') 并返回调用结果。 */ value => Math.round(value).toString(16).padStart(2, '0')).join('')}`; showColorPicker.value = true }
/** 将临时颜色写入实体并记录历史，然后关闭选择器。 */ function applyColor() { if (selectedEntity.value) { const value = Number.parseInt(tempColor.value.slice(1), 16); selectedEntity.value.color = { r: value >> 16 & 255, g: value >> 8 & 255, b: value & 255 }; pushHistory() } showColorPicker.value = false }

const rotationDegrees = computed({ get: /* 根据 selectedEntity.value 的真假，分别返回 Number((-selectedEntity.value.transform.rotation * 180 / Math.PI).toFixed(4)) 或 0。 */ () => selectedEntity.value ? Number((-selectedEntity.value.transform.rotation * 180 / Math.PI).toFixed(4)) : 0, set: /** 把有限的界面角度转换为反向弧度写入实体旋转。 */ value => { if (selectedEntity.value && Number.isFinite(value)) selectedEntity.value.transform.rotation = -value * Math.PI / 180 } })
const colliderRotationDegrees = computed({ get: /* 根据 selectedEntity.value 的真假，分别返回 Number((-selectedEntity.value.collider.rotation * 180 / Math.PI).toFixed(4)) 或 0。 */ () => selectedEntity.value ? Number((-selectedEntity.value.collider.rotation * 180 / Math.PI).toFixed(4)) : 0, set: /** 把有限的界面角度转换为反向弧度写入碰撞旋转。 */ value => { if (selectedEntity.value && Number.isFinite(value)) selectedEntity.value.collider.rotation = -value * Math.PI / 180 } })
/** 按椭圆直径或顶点范围取得碰撞形状尺寸。 */ function colliderDimension(axis: 'x' | 'y'): number {
  const collider = selectedEntity.value?.getCollider()
  if (!collider) return 0
  if (collider.kind === 'EllipseCollider2D') return (axis === 'x' ? collider.radiusX : collider.radiusY) * 2
  const values = collider.vertices.map(/* 返回 vertex[axis] 的当前值。 */ vertex => vertex[axis])
  return values.length ? Math.max(...values) - Math.min(...values) : collider.size[axis]
}
/** 验证目标尺寸后调整椭圆半径或按比例缩放多边形轴向顶点。 */ function setColliderDimension(axis: 'x' | 'y', value: number) {
  const collider = selectedEntity.value?.getCollider()
  if (!collider || !Number.isFinite(value) || value < MIN_SIZE) return
  if (collider.kind === 'EllipseCollider2D') {
    if (axis === 'x') collider.radiusX = value / 2
    else collider.radiusY = value / 2
  } else {
    const current = colliderDimension(axis)
    if (current > 0) collider.vertices.forEach(/** 按目标与当前尺寸比例缩放顶点指定轴。 */ vertex => { vertex[axis] *= value / current })
    collider.size[axis] = value
  }
}
const colliderSizeX = computed({ get: /* 调用 colliderDimension('x') 并返回调用结果。 */ () => colliderDimension('x'), set: /* 调用 setColliderDimension('x', value) 并返回调用结果。 */ value => setColliderDimension('x', value) })
const colliderSizeY = computed({ get: /* 调用 colliderDimension('y') 并返回调用结果。 */ () => colliderDimension('y'), set: /* 调用 setColliderDimension('y', value) 并返回调用结果。 */ value => setColliderDimension('y', value) })
/** 计算带实体缩放的圆、盒或三角形轴向尺寸。 */ function entityDimension(axis: 'x' | 'y'): number { const entity = selectedEntity.value; if (!entity) return 0; if (entity instanceof CircleEntity) return (axis === 'x' ? entity.radiusX * entity.transform.scale.x : entity.radiusY * entity.transform.scale.y) * 2; if (!(entity instanceof BoxEntity || entity instanceof TriangleEntity)) return 0; const values = entity.vertices.map(/* 返回 vertex[axis] 的当前值。 */ vertex => vertex[axis]); return (Math.max(...values) - Math.min(...values)) * entity.transform.scale[axis] }
/** 由目标尺寸反算实体缩放，拒绝非法或过小输入。 */ function setEntityDimension(axis: 'x' | 'y', value: number) { const entity = selectedEntity.value; if (!entity || !Number.isFinite(value) || value < MIN_SIZE) return; if (entity instanceof CircleEntity) entity.transform.scale[axis] = value / ((axis === 'x' ? entity.radiusX : entity.radiusY) * 2); else if (entity instanceof BoxEntity || entity instanceof TriangleEntity) { const values = entity.vertices.map(/* 返回 vertex[axis] 的当前值。 */ vertex => vertex[axis]); entity.transform.scale[axis] = value / (Math.max(...values) - Math.min(...values)) } }
const absoluteSizeX = computed({ get: /* 调用 entityDimension('x') 并返回调用结果。 */ () => entityDimension('x'), set: /* 调用 setEntityDimension('x', value) 并返回调用结果。 */ value => setEntityDimension('x', value) })
const absoluteSizeY = computed({ get: /* 调用 entityDimension('y') 并返回调用结果。 */ () => entityDimension('y'), set: /* 调用 setEntityDimension('y', value) 并返回调用结果。 */ value => setEntityDimension('y', value) })

type SharedBooleanProperty = 'enabled' | 'editorVisible' | 'editorLocked'
/** 多选布尔值不一致时显示混合，否则显示是或否。 */ function sharedBoolean(property: SharedBooleanProperty): string {
  const values = new Set(selectedEntities.value.map(/* 返回 entity[property] 的当前值。 */ entity => entity[property]))
  if (values.size !== 1) return t('mixed')
  return values.has(true) ? t('yes') : t('no')
}
/** 将多选布尔属性统一切换为全部为真状态的反值并记录历史。 */ function toggleAll(property: SharedBooleanProperty) {
  if (!canEdit.value) return
  const next = !selectedEntities.value.every(/* 返回 entity[property] 的当前值。 */ entity => entity[property])
  for (const entity of selectedEntities.value) entity[property] = next
  pushHistory('Set shared property', `multi:${numericResourceKey.value}:${property}`)
}
const multiLayer = computed({
  get: /** 多选对象同层时返回层值，混合层时返回空值。 */ () => {
    const layers = new Set(selectedEntities.value.map(/* 返回 entity.layer 的当前值。 */ entity => entity.layer))
    return layers.size === 1 ? String([...layers][0]) : ''
  },
  set: /** 验证图层后批量设置选择实体并记录历史。 */ value => {
    if (!canEdit.value || value === '') return
    const layer = Number(value)
    if (!estate.layers.includes(layer)) return
    for (const entity of selectedEntities.value) entity.layer = layer
    pushHistory('Set shared sorting layer', `multi:${numericResourceKey.value}:layer`)
  }
})
/** 按共享值或选择中心模式修改多选位置，捕获覆盖或整体平移并记录历史。 */ function setMultiPosition(axis: 'x' | 'y', value: number) {
  if (!canEdit.value || !Number.isFinite(value)) return
  if (multiPositionMode.value === 'shared') {
    for (const entity of selectedEntities.value) { entity.transform.position[axis] = value; capturePrefabOverrides(entity) }
    recordEntityProperties(selectedEntities.value)
    pushHistory('Set shared position', `multi-position:${numericResourceKey.value}:shared:${axis}`)
    return
  }
  const ids = selectedEntities.value.map(/* 返回 entity.id 的当前值。 */ entity => entity.id)
  const center = selectionCenter(ids, state.world.entities)
  const delta = { x: 0, y: 0 }
  delta[axis] = value - center[axis]
  applyTranslation(captureTransforms(ids, state.world.entities), delta, state.world.entities)
  pushHistory('Move entities', `multi-position:${numericResourceKey.value}:${axis}`)
}
const multiPositionX = computed({ get: /** 读取共享横坐标或保留四位小数的选择中心横坐标。 */ () => multiPositionMode.value === 'shared' ? selectedEntities.value[0]?.transform.position.x ?? 0 : Number(selectionCenter(selectedEntities.value.map(/* 返回 entity.id 的当前值。 */ entity => entity.id), state.world.entities).x.toFixed(4)), set: /* 调用 setMultiPosition('x', value) 并返回调用结果。 */ value => setMultiPosition('x', value) })
const multiPositionY = computed({ get: /** 读取共享纵坐标或保留四位小数的选择中心纵坐标。 */ () => multiPositionMode.value === 'shared' ? selectedEntities.value[0]?.transform.position.y ?? 0 : Number(selectionCenter(selectedEntities.value.map(/* 返回 entity.id 的当前值。 */ entity => entity.id), state.world.entities).y.toFixed(4)), set: /* 调用 setMultiPosition('y', value) 并返回调用结果。 */ value => setMultiPosition('y', value) })
/** 判断多选对象指定位置分量是否存在不同数值。 */ function mixedPosition(axis: 'x' | 'y'): boolean { return new Set(selectedEntities.value.map(/* 返回 entity.transform.position[axis] 的当前值。 */ entity => entity.transform.position[axis])).size > 1 }
/** 仅所有选择对象列表相同时返回共同文本，否则返回空值。 */ function sharedList(selector: (entity: typeof selectedEntities.value[number]) => string[]): string {
  const values = selectedEntities.value.map(/* 调用 selector(entity).join(', ') 并返回调用结果。 */ entity => selector(entity).join(', '))
  return new Set(values).size === 1 ? values[0] ?? '' : ''
}
const multiTags = computed(/** 读取多选实体的共同标签文本。 */ () => sharedList(/* 返回 entity.tags 的当前值。 */ entity => entity.tags))
const multiGroups = computed(/** 读取多选实体的共同分组文本。 */ () => sharedList(/* 返回 entity.groups 的当前值。 */ entity => entity.groups))
const commonComponentKinds = computed(/** 计算所有选中实体共同拥有的组件类型。 */ () => {
  const [first, ...rest] = selectedEntities.value
  return first ? first.components.map(/* 返回 component.kind 的当前值。 */ component => component.kind).filter(/* 调用 rest.every(entity => entity.hasComponent(kind)) 并返回调用结果。 */ kind => rest.every(/* 调用 entity.hasComponent(kind) 并返回调用结果。 */ entity => entity.hasComponent(kind))) : []
})
/** 净化标签后为每个选中实体复制设置并记录历史。 */ function setMultiTags(value: string) { if (!canEdit.value) return; const tags = cleanList(value); for (const entity of selectedEntities.value) entity.tags = [...tags]; pushHistory('Set shared tags', `multi:${numericResourceKey.value}:tags`) }
/** 净化分组后为每个选中实体复制设置并记录历史。 */ function setMultiGroups(value: string) { if (!canEdit.value) return; const groups = cleanList(value); for (const entity of selectedEntities.value) entity.groups = [...groups]; pushHistory('Set shared groups', `multi:${numericResourceKey.value}:groups`) }

</script>

<style scoped>
.config-wrapper { position: relative; flex: 0 0 auto; z-index: 180; min-width: 0; max-width: none; border-radius: var(--radius-panel); background: var(--surface-1); box-shadow: inset 0 0 0 var(--ui-border-width) var(--border-separator); }
.resize-handle { position: absolute; inset: 0 auto 0 0; width: 8px; cursor: ew-resize; z-index: 6; }
.config-wrapper.left .resize-handle { inset: 0 0 0 auto; }
.config-panel { position: absolute; inset: 1px; overflow: auto; color: var(--text-secondary); background: var(--surface-1); scroll-padding-block: var(--ui-panel-inset); border-radius: calc(var(--radius-panel) - 1px); scrollbar-gutter: stable; }
.config-panel.runtime { pointer-events: none; opacity: .72; }
.settings-content { min-height: 100%; display: flex; flex-direction: column; padding: 0 0 var(--ui-panel-inset); gap: 0; }
.inspector-sticky { position: sticky; top: 0; z-index: 4; box-sizing: border-box; padding: var(--space-3) var(--ui-panel-inset) var(--space-2); border-bottom: var(--ui-border-width) solid var(--border-separator); background: var(--surface-1); }
.inspector-search-row { display: flex; gap: var(--space-1); flex-wrap: nowrap; margin-top: var(--space-2); }
.inspector-search-row > input { flex: 1 1 auto; width: auto; min-width: 0; }
.add-component-trigger { flex: none; color: var(--accent-contrast); background: var(--accent-fill); box-shadow: var(--shadow-xs); }
.add-component-trigger:hover:not(:disabled) { background: var(--accent-fill-hover); }
.inspector-filter-trigger { flex: none; color: var(--text-muted); }
.inspector-filter-trigger.filtering { color: var(--accent); }
.inspector-filter-token { flex: 0 1 auto; display: inline-flex; align-items: center; gap: var(--space-1); min-width: 0; max-width: 48%; height: var(--ui-control-height); padding: 0 var(--space-1) 0 var(--space-2); border: 0; border-radius: var(--radius-pill); background: var(--selection-bg); color: var(--text-primary); font-size: var(--type-dense); font-weight: var(--weight-medium); cursor: pointer; }
.inspector-filter-token > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inspector-filter-token .editor-icon { flex: none; width: 12px; height: 12px; color: var(--text-muted); }
.inspector-filter-menu { position: fixed; z-index: 1600; display: flex; flex-direction: column; width: calc(232px * var(--ui-scale)); padding: var(--space-1); border-radius: var(--radius-menu, 16px); background: var(--surface-1); box-shadow: var(--shadow-menu, 0 12px 32px rgb(0 0 0 / 0.28)), inset 0 0 0 var(--ui-border-width) var(--border-separator); }
.inspector-filter-menu > button { display: flex; align-items: center; gap: var(--space-2); min-height: var(--ui-control-height); padding: 0 var(--space-2); border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-primary); font-size: var(--type-body); text-align: start; cursor: pointer; }
.inspector-filter-menu > button:hover, .inspector-filter-menu > button:focus-visible { background: var(--fill-hover, var(--surface-3)); }
.inspector-filter-menu > button .editor-icon { flex: none; width: 14px; height: 14px; color: var(--accent); }
.inspector-filter-menu > button .editor-icon.placeholder { visibility: hidden; }
.inspector-filter-menu > hr { width: 100%; height: var(--ui-border-width); margin: var(--space-1) 0; border: 0; background: var(--border-separator); }
.empty-inspector { height: 100%; padding: var(--space-4); display: flex; flex-direction: column; justify-content: center; align-items: center; color: var(--text-muted); text-align: center; }.empty-inspector > strong { margin-top: var(--space-3); color: var(--text-secondary); }.empty-ui-actions { width: 100%; margin-top: var(--space-2); display: grid; grid-template-columns: 1fr 1fr; gap: var(--ui-control-gap); }.runtime-note { color: var(--text-muted); line-height: 1.45; }
.authoring-validation{padding:var(--space-2);display:grid;gap:var(--space-1);border:1px solid color-mix(in srgb,var(--warning) 40%,var(--border-subtle));background:color-mix(in srgb,var(--warning) 7%,transparent)}.authoring-validation strong{color:var(--warning)}
.batch-toggle { min-width: 76px; border: 1px solid var(--border-subtle); color: var(--accent); background: var(--surface-3);
 height: var(--ui-control-height);
 min-height: var(--ui-control-height);
 font-size: var(--type-body);
 border-radius: var(--radius-control);
}
.inspector-header { display: flex; align-items: center; gap: var(--space-2); min-width: 0; padding-inline-end: calc(var(--ui-control-height) + var(--space-1)); }
.inspector-header > .add-component-trigger { margin-inline-start: auto; }
.eyebrow { color: var(--accent); }
h3 { margin: 0; min-width: 0; color: var(--text-primary); font-size: calc(17px * var(--ui-scale)); font-weight: var(--weight-strong); line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
h3 small { color: var(--text-muted); }
.entity-meta { display: inline-flex; align-items: baseline; gap: var(--space-2); flex: none; color: var(--text-muted); font-size: var(--type-caption); }
.entity-id { font-variant-numeric: tabular-nums; color: var(--text-tertiary); }
:deep(.component-tools) { display: flex; align-items: center; justify-content: flex-end;
 min-height: var(--ui-control-height);
 gap: var(--ui-control-gap);
 flex-wrap: wrap;
}
.pair { width: 100%;
 gap: var(--ui-control-gap);
 flex-wrap: wrap;
 display: grid;
 grid-template-columns: repeat(auto-fit,minmax(min(100%,calc(144px * var(--ui-scale))),1fr));
}
.physics-support-note { margin: -var(--space-0) 0 var(--space-0); padding: var(--space-2) var(--space-2); overflow-wrap: anywhere; border: 1px solid var(--border-subtle); color: var(--text-muted); background: var(--surface-1); line-height: 1.4; }
.compound-shapes { border: 1px solid var(--border-subtle); background: var(--surface-1); border-radius: var(--radius-control); container-name: nova-compound; }.compound-shapes>summary{display:flex;align-items:center;justify-content:space-between;list-style:none;color:var(--text-secondary);cursor:pointer;min-height: var(--ui-control-height);padding: var(--ui-input-padding-block) var(--space-4);font-size: var(--type-body);line-height: var(--line-body);border-radius: var(--radius-control)}.compound-shapes>summary::-webkit-details-marker{display:none}.compound-shapes article{display:grid;border:1px solid var(--border-subtle);margin: var(--space-3);padding: 0;gap: var(--ui-field-gap)}.compound-shapes article header{display:grid;align-items:center;gap: var(--ui-control-gap);min-height: var(--ui-panel-header-height);grid-template-columns: minmax(0,1fr) auto var(--ui-control-height);}.compound-shapes>p{margin:var(--space-1) var(--space-2) var(--space-2);color:var(--text-muted);line-height:1.4}
:deep(.diagnostic-row) { display: flex; align-items: center; justify-content: space-between; color: var(--text-muted); min-height: var(--ui-control-height); gap: var(--ui-control-gap); padding: var(--space-3) var(--space-4); font-size: var(--type-caption); border-radius: var(--radius-control); }:deep(.diagnostic-row code) { color: var(--accent); }:deep(.diagnostic-row.active code) { color: var(--warning); }
.stacked-field { display: flex; flex-direction: column; color: var(--text-secondary);
 gap: var(--ui-label-control-gap);
}
.color-well { border: 3px solid var(--surface-3); width: var(--ui-control-height); height: var(--ui-control-height); border-radius: var(--radius-control); }
.primary-action, .secondary-action { width: 100%; display: flex; align-items: center; justify-content: center; border: 1px solid transparent; color: var(--accent-contrast); background: var(--accent-fill); min-height: var(--ui-control-height); gap: var(--ui-control-gap); font-size: var(--type-body); border-radius: var(--radius-control); }.secondary-action { border-color: var(--border-subtle); color: var(--text-secondary); background: var(--surface-3); }
.prefab-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--ui-control-gap); }
.prefab-compare{padding:var(--space-1);border:1px solid var(--border-subtle)}.prefab-compare summary{cursor:pointer;color:var(--text-secondary)}.prefab-compare article{min-width:0;display:flex;align-items:center;gap:var(--space-1);padding-top:var(--space-1)}.prefab-compare code{min-width:0;flex:1;overflow:hidden;color:var(--accent);text-overflow:ellipsis;white-space:nowrap}.prefab-conflicts article{line-height:1.35}.prefab-conflicts article.error{color:var(--danger)}.prefab-conflicts article.warning{color:var(--warning)}
.script-error { margin: 0; padding: var(--space-2); overflow-wrap: anywhere; border: 1px solid color-mix(in srgb, var(--danger) 50%, var(--border-subtle)); color: var(--danger); background: var(--danger-soft); line-height: 1.45; }
.script-property-group{display:grid;gap: var(--ui-field-gap);padding-top: var(--ui-heading-content-gap)}.script-property-group h4{margin:0;padding:var(--space-2) var(--space-0) var(--space-0);border-bottom:1px solid var(--border-subtle);color:var(--text-muted)}.script-property-help{display:block;color:var(--text-muted);overflow-wrap:anywhere;margin: 0;font-size: var(--type-caption);line-height: var(--line-body)}
.inspector-no-results { margin: var(--space-3) var(--space-1); padding: var(--space-4) var(--space-2); border: 1px dashed var(--border-strong); color: var(--text-muted); text-align: center; line-height: 1.45; }
.plugin-inspector-actions { display: grid; gap: var(--ui-control-gap); }.plugin-inspector-actions span, .plugin-inspector-actions small { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.plugin-inspector-actions small { color: var(--text-muted); }
.empty-state { margin: var(--space-1) 0; color: var(--text-muted); text-align: center; }.connection-list { display: flex; flex-direction: column; gap: var(--space-1); }.connection-item { display: flex; align-items: center; border: 1px solid var(--border-subtle); background: var(--surface-1); }.connection-main { min-width: 0; flex: 1; padding: var(--space-2); display: flex; align-items: center; gap: var(--space-2); border: 0; background: transparent; text-align: left; }.connection-main > span:last-child { min-width: 0; display: flex; flex-direction: column; }.connection-main strong, .connection-main small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.connection-main strong { color: var(--text-primary); }.connection-main small { color: var(--text-muted); }.connection-dot { width: 8px; height: 8px; flex: 0 0 8px; background: var(--connection); }.connection-item.snapped .connection-dot, .connection-item.torn .connection-dot { background: var(--connection-broken); }
.modal-scrim { position: fixed; inset: 0; z-index: 1300; display: grid; place-items: center; background: var(--scrim); pointer-events: auto; }.color-modal { display: flex; flex-direction: column; align-items: center; gap: var(--space-3); border: 1px solid var(--border-subtle); background: var(--surface-2); width: min(calc(340px * var(--ui-scale)),calc(100vw - 2 * var(--ui-panel-inset))); padding: var(--ui-dialog-inset); border-radius: var(--radius-dialog); }.color-modal h4 { margin: 0; }.color-modal > div { width: 100%; display: flex; gap: var(--space-2); }
.component-picker-scrim { z-index: 1400; }.component-picker { max-height: min(700px, calc(var(--vh100) - 60px)); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border-strong); background: var(--surface-1); width: min(calc(720px * var(--ui-scale)), calc(100vw - 2 * var(--space-5))); padding: var(--space-6); gap: var(--ui-field-gap); border-radius: var(--radius-dialog); }.component-picker > header { display: flex; align-items: center; justify-content: space-between; }.component-picker > header h4 { margin: var(--space-0) 0 0; }.component-picker-list { min-height: 60px;overflow:auto;display:block}.component-picker-list>section{display:grid;grid-template-columns: repeat(auto-fit,minmax(min(100%,calc(260px * var(--ui-scale))),1fr));gap: var(--ui-control-gap)}.component-picker-list h5{grid-column:1/-1;margin:var(--space-2) var(--space-0) var(--space-0);color:var(--text-muted)}.component-picker-list h5 small{padding:var(--space-0) var(--space-1);background:var(--surface-3)}.component-picker-list article{position:relative;min-width:0;container: component-choice / inline-size;}.component-main{width:100%;min-width:0;display:grid;align-items:center;border:1px solid var(--border-subtle);color:var(--text-secondary);background:var(--surface-2);text-align:left;min-height: var(--ui-panel-header-height);padding: var(--space-3) calc(var(--ui-control-height) + var(--space-3)) var(--space-3) var(--space-4);gap: var(--ui-control-gap);font-size: var(--type-body);line-height: var(--line-body);grid-template-columns: var(--ui-icon-size) minmax(0,1fr) var(--ui-icon-size);}.component-main:hover{border-color:color-mix(in srgb,var(--accent) 55%,var(--border-subtle));background:var(--accent-soft)}.component-main>span:nth-child(2){min-width:0;display:flex;flex-direction:column;gap: var(--space-2);}.component-main strong{overflow:hidden;text-overflow:ellipsis;white-space: normal;overflow-wrap: anywhere}.component-main small{color:var(--text-muted);font-size: var(--type-caption);line-height: var(--line-body)}.component-main i{color:var(--accent);font-style:normal}.component-favorite{position:absolute;border:0;color:var(--text-muted);background:transparent;opacity:.4;width: var(--ui-control-height);height: var(--ui-control-height);right: var(--space-1);top: var(--space-1);padding: 0;border-radius: var(--radius-control)}.component-favorite.active{color:#f4c95d;opacity:1}.component-picker-list>p{padding:var(--space-6);color:var(--text-muted);text-align:center}
.property-menu{position:fixed;z-index:1600;display:flex;flex-direction:column;gap:var(--ui-control-gap);border:1px solid var(--border-strong);background:var(--surface-1);width: min(calc(320px * var(--ui-scale)),calc(100vw - 2 * var(--ui-panel-inset)));padding: var(--space-3);max-height: calc(var(--vh100) - 2 * var(--ui-panel-inset));overflow: auto;border-radius: var(--radius-floating)}.property-menu>strong{padding:var(--space-1) var(--space-2);color:var(--accent);overflow-wrap:anywhere;font: 600 var(--type-body)/var(--line-body) var(--font-mono)}.property-menu>p{margin:var(--space-1);padding:var(--space-2);border-top:1px solid var(--border-subtle);color:var(--text-muted);line-height:1.4}

@media (max-width: 560px) { .component-picker-list>section { grid-template-columns: repeat(auto-fit,minmax(min(100%,calc(260px * var(--ui-scale))),1fr)); gap: var(--ui-control-gap); } }
/* Dock width, not window width, determines when labels need their own line. */
.config-wrapper { container: nova-inspector / inline-size; }
@container nova-inspector (max-width: 22em) {
  .inspector-search-row { flex-wrap: wrap; }
  .inspector-view-controls { flex-wrap: wrap; }
  .prefab-actions, .empty-ui-actions { grid-template-columns: 1fr; }
  :deep(.component-tools) { flex-wrap: wrap; }
}
.compound-shapes{container-type:inline-size;border-radius: var(--radius-control);container-name: nova-compound;}.compound-shapes article{min-width:0;margin: var(--space-3);padding: 0;gap: var(--ui-field-gap)}
.compound-shapes article header{ gap: var(--ui-control-gap); min-height: var(--ui-panel-header-height); grid-template-columns: minmax(0,1fr) auto var(--ui-control-height);}
.settings-content > :not(.ui-property-section):not(.inspector-section){margin-inline:var(--ui-panel-inset)}
.component-main>.editor-icon:first-child{color:var(--accent);justify-self:center}
.component-main>.editor-icon:last-child{justify-self:center}
.compound-shapes article header>label{min-width:0;display:flex;align-items:center;gap:var(--ui-control-gap);font-size:var(--type-body);line-height:var(--line-body)}
.compound-shapes article header>select{width:100%;min-width:0}
@container nova-compound (max-width:22em){.compound-shapes article header{grid-template-columns:minmax(0,1fr)}.compound-shapes article header>.ui-button{inline-size:var(--ui-control-height);justify-self:end}}
@container component-choice (max-width:22em){.component-main{grid-template-columns:var(--ui-icon-size) minmax(0,1fr);grid-template-rows:var(--ui-control-height) auto;column-gap:0;row-gap:var(--ui-control-gap);padding-inline:var(--space-4)}.component-main>.editor-icon:first-child{grid-column:1;grid-row:1}.component-main>.editor-icon:last-child{grid-column:2;grid-row:1;justify-self:start}.component-main>span:nth-child(2){grid-column:1/-1;grid-row:2}}
</style>
