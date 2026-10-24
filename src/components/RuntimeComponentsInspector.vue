<!-- 运行组件检查器：编辑实体运行组件配置与资源关联。 -->
<template>
  <UiPropertySection :title="(t('animator'))" v-if="animator && componentVisible('Animator', t('animator'))" >
    <template #actions><UiButton icon="clear" @click="remove('Animator')" :label="t('remove')" /></template>
    <UiPropertyRow :label="t('controller')"><select v-model="animator.controllerAsset"><option :value="null">{{ t('none') }}</option><option v-for="asset in controllerAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('speed')"><NumericExpressionInput v-model="animator.speed" :step="0.1" :resource-key="entity.uuid + ':' + animator.uuid + ':speed'" /></UiPropertyRow>
    <UiPropertyRow :label="t('autoplay')"><input v-model="animator.autoplay" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('currentState')"><code>{{ animator.currentState || '—' }}</code></UiPropertyRow>
    <UiPropertyRow :label="(name)" v-for="(value, name) in animator.parameters" :key="name"><input v-if="typeof value === 'boolean'" v-model="animator.parameters[name]" type="checkbox"><NumericExpressionInput v-else :model-value="Number(animator.parameters[name])" @update:model-value="animator.parameters[name] = $event" :step="0.01" :resource-key="entity.uuid + ':' + animator.uuid + ':parameters:' + name" /></UiPropertyRow>
  </UiPropertySection>

  <UiPropertySection :title="(t('skeleton2D'))" v-if="skeleton && componentVisible('Skeleton2D', t('skeleton2D'))" >
    <template #actions><UiButton icon="clear" @click="remove('Skeleton2D')" :label="t('remove')" /></template>
    <UiPropertyRow :label="t('rigAsset')"><select v-model="skeleton.rigAsset"><option :value="null">{{ t('none') }}</option><option v-for="asset in rigAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('skinAsset')"><select v-model="skeleton.skinAsset"><option :value="null">{{ t('none') }}</option><option v-for="asset in skinAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('previewPose')"><input v-model="skeleton.previewEnabled" type="checkbox"></UiPropertyRow>
  </UiPropertySection>

  <UiPropertySection :title="(t('timelinePlayer'))" v-if="timelinePlayer && componentVisible('TimelinePlayer', t('timelinePlayer'))" >
    <template #actions><UiButton icon="clear" @click="remove('TimelinePlayer')" :label="t('remove')" /></template>
    <UiPropertyRow :label="t('timelineAsset')"><select v-model="timelinePlayer.timelineAsset"><option :value="null">{{ t('none') }}</option><option v-for="asset in timelineAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('autoplay')"><input v-model="timelinePlayer.autoplay" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('loop')"><input v-model="timelinePlayer.loop" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('speed')"><NumericExpressionInput v-model="timelinePlayer.speed" :minimum="-100" :maximum="100" :step="0.1" :resource-key="entity.uuid + ':' + timelinePlayer.uuid + ':speed'" /></UiPropertyRow>
    <UiPropertyRow :label="t('currentTime')"><NumericExpressionInput v-model="timelinePlayer.currentTime" :minimum="0" :step="0.01" :resource-key="entity.uuid + ':' + timelinePlayer.uuid + ':currentTime'" /></UiPropertyRow>
    <UiPropertyRow :label="t('playing')"><input v-model="timelinePlayer.playing" type="checkbox"></UiPropertyRow>
    <div class="component-actions"><button @click="timelineRuntime.skip(entity.uuid, physicsState.world.entities)">{{ t('skip') }}</button><button @click="timelineRuntime.resume(entity.uuid, physicsState.world.entities)">{{ t('resume') }}</button></div>
  </UiPropertySection>

  <UiPropertySection :title="(t('audioSource'))" v-if="audioSource && componentVisible('AudioSource', t('audioSource'))" >
    <template #actions><UiButton icon="clear" @click="remove('AudioSource')" :label="t('remove')" /></template>
    <UiPropertyRow :label="t('audioClip')"><select v-model="audioSource.audioClip"><option :value="null">{{ t('none') }}</option><option v-for="asset in audioAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('volume')"><NumericExpressionInput v-model="audioSource.volume" :minimum="0" :maximum="1" :step="0.01" :resource-key="entity.uuid + ':' + audioSource.uuid + ':volume'" /></UiPropertyRow>
    <UiPropertyRow :label="t('pitch')"><NumericExpressionInput v-model="audioSource.pitch" :minimum="0.25" :maximum="4" :step="0.05" :resource-key="entity.uuid + ':' + audioSource.uuid + ':pitch'" /></UiPropertyRow>
    <UiPropertyRow :label="t('loop')"><input v-model="audioSource.loop" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('autoplay')"><input v-model="audioSource.autoplay" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('audioBus')"><select v-model="audioSource.bus"><option v-for="bus in physicsState.audioSettings.mixer.buses" :key="bus.id" :value="bus.id">{{ bus.name }}</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('spatialBlend')"><UiSlider v-model.number="audioSource.spatialBlend" min="0" max="1" step="0.01" :data-resource-key="entity.uuid + ':' + audioSource.uuid + ':audioSource.spatialBlend'" /></UiPropertyRow>
    <UiPropertyRow :label="t('distanceRange')"><div><NumericExpressionInput v-model="audioSource.minDistance" :minimum="0" :step="0.1" :resource-key="entity.uuid + ':' + audioSource.uuid + ':minDistance'" /><NumericExpressionInput v-model="audioSource.maxDistance" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + audioSource.uuid + ':maxDistance'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('attenuationCurve')"><select v-model="audioSource.attenuationCurve"><option>Linear</option><option>Inverse</option><option>Exponential</option><option>Custom</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('voicePriority')"><NumericExpressionInput v-model="audioSource.voicePriority" :minimum="0" :maximum="255" :step="1" :resource-key="entity.uuid + ':' + audioSource.uuid + ':voicePriority'" /></UiPropertyRow>
    <UiPropertyRow label="Polyphony"><NumericExpressionInput v-model="audioSource.polyphony" :minimum="1" :maximum="32" :step="1" :resource-key="entity.uuid + ':' + audioSource.uuid + ':polyphony'" /></UiPropertyRow>
    <UiPropertyRow label="Random pitch"><NumericExpressionInput v-model="audioSource.randomPitch" :minimum="0" :maximum="1" :step="0.01" :resource-key="entity.uuid + ':' + audioSource.uuid + ':randomPitch'" /></UiPropertyRow>
    <UiPropertyRow label="Random volume"><NumericExpressionInput v-model="audioSource.randomVolume" :minimum="0" :maximum="1" :step="0.01" :resource-key="entity.uuid + ':' + audioSource.uuid + ':randomVolume'" /></UiPropertyRow>
    <UiPropertyRow label="Virtualize when limited"><input v-model="audioSource.virtualizeWhenLimited" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('streamingMode')"><select v-model="audioSource.streamOverride"><option>ImportSetting</option><option>Stream</option><option>Buffer</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('startOffset')"><NumericExpressionInput v-model="audioSource.startOffsetSeconds" :minimum="0" :step=".01" :resource-key="entity.uuid + ':' + audioSource.uuid + ':startOffsetSeconds'" /></UiPropertyRow>
    <UiPropertyRow :label="t('fadeInOut')"><div><NumericExpressionInput v-model="audioSource.fadeInSeconds" :minimum="0" :step=".01" :resource-key="entity.uuid + ':' + audioSource.uuid + ':fadeInSeconds'" /><NumericExpressionInput v-model="audioSource.fadeOutSeconds" :minimum="0" :step=".01" :resource-key="entity.uuid + ':' + audioSource.uuid + ':fadeOutSeconds'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('dopplerScale')"><NumericExpressionInput v-model="audioSource.dopplerScale" :minimum="0" :maximum="4" :step=".05" title="Stereo Web Audio reports Doppler as a limited capability." :resource-key="entity.uuid + ':' + audioSource.uuid + ':dopplerScale'" /></UiPropertyRow>
    <UiPropertyRow :label="t('playlistMode')"><select v-model="audioSource.playlistMode"><option>Single</option><option>Sequential</option><option>Random</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('addPlaylistClip')" v-if="audioSource.playlistMode !== 'Single'"><select value="" @change="addPlaylistClip"><option value="">Choose…</option><option v-for="asset in audioAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></UiPropertyRow>
    <div v-if="audioSource.playlistMode !== 'Single'" class="playlist-list"><button v-for="(reference,index) in audioSource.playlist" :key="`${reference}:${index}`" @click="audioSource.playlist.splice(index,1)"><span>{{ resolveAsset(reference)?.name ?? reference }}</span><EditorIcon name="close" /></button></div>
  </UiPropertySection>

  <UiPropertySection :title="(t('audioListener'))" v-if="audioListener && componentVisible('AudioListener', t('audioListener'))" >
    <template #actions><UiButton icon="clear" @click="remove('AudioListener')" :label="t('remove')" /></template>
    <UiPropertyRow :label="t('active')"><input v-model="audioListener.active" type="checkbox"></UiPropertyRow>
  </UiPropertySection>

  <UiPropertySection :title="(t('tileMap2D'))" v-if="tileMap && componentVisible('TileMap2D', t('tileMap2D'))" >
    <template #actions><UiButton icon="clear" @click="remove('TileMap2D')" :label="t('remove')" /></template>
    <UiPropertyRow :label="t('tileSet')"><select v-model="tileMap.tileSetAsset" @change="tileMapChanged"><option :value="null">{{ t('none') }}</option><option v-for="asset in tileSetAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('mapSize')"><div><NumericExpressionInput :model-value="tileMap.width" :minimum="1" :maximum="2048" :step="1" :resource-key="entity.uuid + ':' + tileMap.uuid + ':width'" @update:model-value="resizeMap('width', $event)" /><NumericExpressionInput :model-value="tileMap.height" :minimum="1" :maximum="2048" :step="1" :resource-key="entity.uuid + ':' + tileMap.uuid + ':height'" @update:model-value="resizeMap('height', $event)" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('tileWorldSize')"><div><NumericExpressionInput v-model="tileMap.tileSize.x" :minimum="0.000001" :step="0.1" @change="tileMapChanged" :resource-key="entity.uuid + ':' + tileMap.uuid + ':tileSize.x'" /><NumericExpressionInput v-model="tileMap.tileSize.y" :minimum="0.000001" :step="0.1" @change="tileMapChanged" :resource-key="entity.uuid + ':' + tileMap.uuid + ':tileSize.y'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('chunkSize')"><NumericExpressionInput v-model="tileMap.chunkSize" :minimum="4" :maximum="128" @change="tileMapChanged" :step="1" :resource-key="entity.uuid + ':' + tileMap.uuid + ':chunkSize'" /></UiPropertyRow>
    <UiPropertyRow :label="t('opacity')"><NumericExpressionInput v-model="tileMap.opacity" :minimum="0" :maximum="100" :step="1" :resource-key="entity.uuid + ':' + tileMap.uuid + ':opacity'" /></UiPropertyRow>
    <UiPropertyRow :label="t('sortingLayer')"><NumericExpressionInput v-model="tileMap.sortingLayer" :step="1" :resource-key="entity.uuid + ':' + tileMap.uuid + ':sortingLayer'" /></UiPropertyRow>
    <UiPropertyRow :label="t('orderInLayer')"><NumericExpressionInput v-model="tileMap.orderInLayer" :step="1" :resource-key="entity.uuid + ':' + tileMap.uuid + ':orderInLayer'" /></UiPropertyRow>
    <UiPropertyRow :label="t('filterMode')"><select v-model="tileMap.filterMode"><option>Nearest</option><option>Linear</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('physicsLayer')"><NumericExpressionInput v-model="tileMap.physicsLayer" :minimum="0" :maximum="31" @change="tileMapChanged" :step="1" :resource-key="entity.uuid + ':' + tileMap.uuid + ':physicsLayer'" /></UiPropertyRow>
    <UiPropertyRow :label="t('collisionMask')"><NumericExpressionInput v-model="tileMap.collisionMask" :minimum="0" :maximum="4294967295" @change="tileMapChanged" :step="1" :resource-key="entity.uuid + ':' + tileMap.uuid + ':collisionMask'" /></UiPropertyRow>
    <button class="open-editor" @click="openTilemapEditor">{{ t('openTilemapEditor') }}</button>
  </UiPropertySection>

  <UiPropertySection :title="(t('particleEmitter2D'))" v-if="particleEmitter && componentVisible('ParticleEmitter2D', t('particleEmitter2D'))" >
    <template #actions><UiButton icon="clear" @click="remove('ParticleEmitter2D')" :label="t('remove')" /></template>
    <UiPropertyRow :label="t('particleTexture')"><select v-model="particleEmitter.textureAsset"><option :value="null">{{ t('none') }}</option><option v-for="asset in imageAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('emissionRate')"><NumericExpressionInput v-model="particleEmitter.emissionRate" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':emissionRate'" /></UiPropertyRow>
    <UiPropertyRow label="Emission shape"><select v-model="particleEmitter.emissionShape"><option>Point</option><option>Box</option><option>Circle</option><option>Edge</option></select></UiPropertyRow>
    <UiPropertyRow label="Shape size" v-if="particleEmitter.emissionShape === 'Box' || particleEmitter.emissionShape === 'Edge'"><div><NumericExpressionInput v-model="particleEmitter.shapeSize.x" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':shapeSize.x'" /><NumericExpressionInput v-model="particleEmitter.shapeSize.y" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':shapeSize.y'" /></div></UiPropertyRow>
    <UiPropertyRow label="Shape radius" v-if="particleEmitter.emissionShape === 'Circle'"><NumericExpressionInput v-model="particleEmitter.shapeRadius" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':shapeRadius'" /></UiPropertyRow>
    <UiPropertyRow :label="t('burst')"><NumericExpressionInput v-model="particleEmitter.burst" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':burst'" /></UiPropertyRow>
    <UiPropertyRow :label="t('lifetime')"><NumericExpressionInput v-model="particleEmitter.lifetime" :minimum="0.0001" :step="0.1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':lifetime'" /></UiPropertyRow>
    <UiPropertyRow :label="t('velocityMin')"><div><NumericExpressionInput v-model="particleEmitter.initialVelocityMin.x" :step="1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':initialVelocityMin.x'" /><NumericExpressionInput v-model="particleEmitter.initialVelocityMin.y" :step="1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':initialVelocityMin.y'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('velocityMax')"><div><NumericExpressionInput v-model="particleEmitter.initialVelocityMax.x" :step="1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':initialVelocityMax.x'" /><NumericExpressionInput v-model="particleEmitter.initialVelocityMax.y" :step="1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':initialVelocityMax.y'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('particleGravity')"><div><NumericExpressionInput v-model="particleEmitter.gravity.x" :step="1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':gravity.x'" /><NumericExpressionInput v-model="particleEmitter.gravity.y" :step="1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':gravity.y'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('rotationRange')"><div><NumericExpressionInput v-model="particleEmitter.rotationMin" :step="0.1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':rotationMin'" /><NumericExpressionInput v-model="particleEmitter.rotationMax" :step="0.1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':rotationMax'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('angularVelocityRange')"><div><NumericExpressionInput v-model="particleEmitter.angularVelocityMin" :step="0.1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':angularVelocityMin'" /><NumericExpressionInput v-model="particleEmitter.angularVelocityMax" :step="0.1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':angularVelocityMax'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('scaleOverLifetime')"><div><NumericExpressionInput v-model="particleEmitter.startScale" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':startScale'" /><NumericExpressionInput v-model="particleEmitter.endScale" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':endScale'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('colorOverLifetime')"><div><input type="color" :value="rgbHex(particleEmitter.startColor)" @input="setColor(particleEmitter.startColor, $event)"><input type="color" :value="rgbHex(particleEmitter.endColor)" @input="setColor(particleEmitter.endColor, $event)"></div></UiPropertyRow>
    <UiPropertyRow :label="t('opacityOverLifetime')"><div><NumericExpressionInput v-model="particleEmitter.startOpacity" :minimum="0" :maximum="100" :step="1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':startOpacity'" /><NumericExpressionInput v-model="particleEmitter.endOpacity" :minimum="0" :maximum="100" :step="1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':endOpacity'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('maxParticles')"><NumericExpressionInput v-model="particleEmitter.maxParticles" :minimum="0" :maximum="100000" :step="1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':maxParticles'" /></UiPropertyRow>
    <UiPropertyRow label="Editor preview"><input v-model="particleEmitter.previewInEditor" type="checkbox"></UiPropertyRow>
    <UiPropertyRow label="Subemitter UUID"><input v-model="particleEmitter.subEmitterUuid" placeholder="optional component UUID"></UiPropertyRow>
    <UiPropertyRow label="Subemitter count"><NumericExpressionInput v-model="particleEmitter.subEmitterCount" :minimum="0" :maximum="1000" :step="1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':subEmitterCount'" /></UiPropertyRow>
    <UiPropertyRow label="Collision"><select v-model="particleEmitter.collisionMode"><option>None</option><option>Bounce</option><option>Stop</option></select></UiPropertyRow>
    <UiPropertyRow label="Restitution" v-if="particleEmitter.collisionMode === 'Bounce'"><UiSlider v-model.number="particleEmitter.collisionRestitution" min="0" max="1" step=".01" :data-resource-key="entity.uuid + ':' + particleEmitter.uuid + ':particleEmitter.collisionRestitution'" /></UiPropertyRow>
    <UiPropertyRow label="Collision layer mask" v-if="particleEmitter.collisionMode !== 'None'"><NumericExpressionInput v-model="particleEmitter.collisionLayerMask" :minimum="0" :maximum="4294967295" :step="1" :resource-key="entity.uuid + ':' + particleEmitter.uuid + ':collisionLayerMask'" /></UiPropertyRow>
    <UiPropertyRow :label="t('autoplay')"><input v-model="particleEmitter.autoplay" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('loop')"><input v-model="particleEmitter.looping" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('worldSpace')"><input v-model="particleEmitter.worldSpace" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('blendMode')"><select v-model="particleEmitter.blendMode"><option>Alpha</option><option>Additive</option></select></UiPropertyRow>
  </UiPropertySection>

  <UiPropertySection :title="(t('light2D'))" v-if="light && componentVisible('Light2D', t('light2D'))" >
    <template #actions><UiButton icon="clear" @click="remove('Light2D')" :label="t('remove')" /></template>
    <UiPropertyRow :label="t('lightType')"><select v-model="light.lightType"><option>Point</option><option>Spot</option><option>Directional</option><option>Area</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('lightColor')"><input type="color" :value="rgbHex(light.color)" @input="setColor(light.color, $event)"></UiPropertyRow>
    <UiPropertyRow :label="t('intensity')"><NumericExpressionInput v-model="light.intensity" :minimum="0" :maximum="32" :step="0.05" :resource-key="entity.uuid + ':' + light.uuid + ':intensity'" /></UiPropertyRow>
    <UiPropertyRow :label="t('range')" v-if="light.lightType !== 'Directional'"><NumericExpressionInput v-model="light.range" :minimum="0.001" :step="0.1" :resource-key="entity.uuid + ':' + light.uuid + ':range'" /></UiPropertyRow>
    <UiPropertyRow :label="t('spotAngles')" v-if="light.lightType === 'Spot'"><div><NumericExpressionInput v-model="light.innerAngle" :minimum="0" :maximum="179" :step="1" :resource-key="entity.uuid + ':' + light.uuid + ':innerAngle'" /><NumericExpressionInput v-model="light.outerAngle" :minimum="0" :maximum="179" :step="1" :resource-key="entity.uuid + ':' + light.uuid + ':outerAngle'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('areaSize')" v-if="light.lightType === 'Area'"><div><NumericExpressionInput v-model="light.areaSize.x" :minimum="0.001" :step="1" :resource-key="entity.uuid + ':' + light.uuid + ':areaSize.x'" /><NumericExpressionInput v-model="light.areaSize.y" :minimum="0.001" :step="1" :resource-key="entity.uuid + ':' + light.uuid + ':areaSize.y'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('lightMask')"><NumericExpressionInput v-model="light.layerMask" :minimum="0" :maximum="4294967295" :step="1" :resource-key="entity.uuid + ':' + light.uuid + ':layerMask'" /></UiPropertyRow>
    <UiPropertyRow :label="t('castsShadows')"><input v-model="light.castsShadows" type="checkbox" :disabled="light.lightType === 'Directional'" :aria-describedby="light.lightType === 'Directional' ? `directional-shadow-${entity.uuid}` : undefined"></UiPropertyRow>
    <UiPropertyRow :label="t('shadowSoftness')"><UiSlider v-model.number="light.shadowSoftness" min="0" max="1" step="0.05" :disabled="light.lightType === 'Directional'" :aria-describedby="light.lightType === 'Directional' ? `directional-shadow-${entity.uuid}` : undefined" :data-resource-key="entity.uuid + ':' + light.uuid + ':light.shadowSoftness'" /></UiPropertyRow>
    <p v-if="light.lightType === 'Directional'" :id="`directional-shadow-${entity.uuid}`" class="renderer-capability-hint">{{ directionalShadowHint[preferencesState.locale] }}</p>
  </UiPropertySection>

  <UiPropertySection :title="(t('shadowCaster2D'))" v-if="shadowCaster && componentVisible('ShadowCaster2D', t('shadowCaster2D'))" >
    <template #actions><UiButton icon="clear" @click="remove('ShadowCaster2D')" :label="t('remove')" /></template>
    <UiPropertyRow :label="t('lightMask')"><NumericExpressionInput v-model="shadowCaster.layerMask" :minimum="0" :maximum="4294967295" :step="1" :resource-key="entity.uuid + ':' + shadowCaster.uuid + ':layerMask'" /></UiPropertyRow>
    <UiPropertyRow :label="t('selfShadows')"><input v-model="shadowCaster.selfShadows" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('opacity')"><UiSlider v-model.number="shadowCaster.opacity" min="0" max="1" step="0.05" :data-resource-key="entity.uuid + ':' + shadowCaster.uuid + ':shadowCaster.opacity'" /></UiPropertyRow>
  </UiPropertySection>

  <UiPropertySection :title="(t(joint.kind))" v-for="joint in visibleJoints" :key="joint.uuid" >
    <template #actions><UiButton icon="clear" @click="remove(joint.kind)" :label="t('remove')" /></template>
    <UiPropertyRow :label="joint.kind === 'WheelJoint2D' ? t('wheelChassis') : t('connectedBody')"><select v-model="joint.targetEntityUuid" @change="joint.initialized = false"><option :value="null">{{ t('none') }}</option><option v-for="entity in jointTargets" :key="entity.uuid" :value="entity.uuid">{{ entity.name }}_{{ entity.id }}</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('anchor')"><div><NumericExpressionInput v-model="joint.anchor.x" :step="1" :resource-key="entity.uuid + ':' + joint.uuid + ':anchor.x'" /><NumericExpressionInput v-model="joint.anchor.y" :step="1" :resource-key="entity.uuid + ':' + joint.uuid + ':anchor.y'" /></div></UiPropertyRow>
    <UiPropertyRow :label="joint.kind === 'WheelJoint2D' ? t('chassisMount') : t('connectedAnchor')"><div><NumericExpressionInput v-model="joint.connectedAnchor.x" :step="1" :resource-key="entity.uuid + ':' + joint.uuid + ':connectedAnchor.x'" /><NumericExpressionInput v-model="joint.connectedAnchor.y" :step="1" :resource-key="entity.uuid + ':' + joint.uuid + ':connectedAnchor.y'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('collideConnected')"><input v-model="joint.collideConnected" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('jointDistance')" v-if="joint.kind === 'DistanceJoint2D' || joint.kind === 'RopeJoint2D' || joint.kind === 'SpringJoint2D'"><NumericExpressionInput v-model="joint.distance" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + joint.uuid + ':distance'" /></UiPropertyRow>
    <UiPropertyRow :label="t('stiffness')" v-if="joint.kind === 'SpringJoint2D'"><NumericExpressionInput v-model="joint.stiffness" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + joint.uuid + ':stiffness'" /></UiPropertyRow>
    <UiPropertyRow :label="t('connectionDamping')" v-if="joint.kind === 'SpringJoint2D'"><NumericExpressionInput v-model="joint.damping" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + joint.uuid + ':damping'" /></UiPropertyRow>
    <UiPropertyRow :label="t('jointAxis')" v-if="joint.kind === 'PrismaticJoint2D' || joint.kind === 'WheelJoint2D'"><div><NumericExpressionInput v-model="joint.axis.x" :step="1" :resource-key="entity.uuid + ':' + joint.uuid + ':axis.x'" /><NumericExpressionInput v-model="joint.axis.y" :step="1" :resource-key="entity.uuid + ':' + joint.uuid + ':axis.y'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('jointLimits')" v-if="joint.kind === 'PrismaticJoint2D' || joint.kind === 'WheelJoint2D'"><input v-model="joint.limitsEnabled" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('limitRange')" v-if="(joint.kind === 'PrismaticJoint2D' || joint.kind === 'WheelJoint2D') && joint.limitsEnabled"><div><NumericExpressionInput v-model="joint.lowerLimit" :step="1" :resource-key="entity.uuid + ':' + joint.uuid + ':lowerLimit'" /><NumericExpressionInput v-model="joint.upperLimit" :step="1" :resource-key="entity.uuid + ':' + joint.uuid + ':upperLimit'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('jointMotor')" v-if="joint.kind === 'RevoluteJoint2D' || joint.kind === 'MotorJoint2D' || joint.kind === 'WheelJoint2D' || joint.kind === 'PrismaticJoint2D'"><input v-model="joint.motorEnabled" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('jointServo')" v-if="joint.kind === 'RevoluteJoint2D' || joint.kind === 'PrismaticJoint2D'"><input v-model="joint.servoEnabled" type="checkbox" data-joint-servo></UiPropertyRow>
    <UiPropertyRow :label="joint.kind === 'RevoluteJoint2D' ? t('servoTargetAngle') : t('servoTargetDistance')" v-if="joint.servoEnabled && (joint.kind === 'RevoluteJoint2D' || joint.kind === 'PrismaticJoint2D')"><NumericExpressionInput v-model="joint.servoTarget" :step="joint.kind === 'RevoluteJoint2D' ? 5 : 0.1" :resource-key="entity.uuid + ':' + joint.uuid + ':servoTarget'" /></UiPropertyRow>
    <UiPropertyRow :label="t('servoGain')" v-if="joint.servoEnabled && (joint.kind === 'RevoluteJoint2D' || joint.kind === 'PrismaticJoint2D')"><NumericExpressionInput v-model="joint.servoGain" :minimum="0" :maximum="200" :step="0.5" :resource-key="entity.uuid + ':' + joint.uuid + ':servoGain'" /></UiPropertyRow>
    <UiPropertyRow :label="t('servoMaxSpeed')" v-if="joint.servoEnabled && (joint.kind === 'RevoluteJoint2D' || joint.kind === 'PrismaticJoint2D')"><NumericExpressionInput v-model="joint.servoMaxSpeed" :minimum="0" :maximum="200" :step="0.5" :resource-key="entity.uuid + ':' + joint.uuid + ':servoMaxSpeed'" /></UiPropertyRow>
    <UiPropertyRow :label="t('motorSpeed')" v-if="joint.motorEnabled"><NumericExpressionInput v-model="joint.motorSpeed" :step="0.1" :resource-key="entity.uuid + ':' + joint.uuid + ':motorSpeed'" /></UiPropertyRow>
    <UiPropertyRow :label="t('maxMotorForce')" v-if="joint.motorEnabled"><NumericExpressionInput v-model="joint.maxMotorForce" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + joint.uuid + ':maxMotorForce'" /></UiPropertyRow>
    <UiPropertyRow :label="joint.kind === 'WheelJoint2D' ? t('suspensionFrequency') : t('weldLinearFrequency')" v-if="joint.kind === 'WheelJoint2D' || joint.kind === 'WeldJoint2D'"><NumericExpressionInput v-model="joint.frequency" :minimum="0" :step="0.5" :resource-key="entity.uuid + ':' + joint.uuid + ':frequency'" /></UiPropertyRow>
    <UiPropertyRow :label="t('springDampingRatio')" v-if="(joint.kind === 'WheelJoint2D' || joint.kind === 'WeldJoint2D') && joint.frequency > 0"><NumericExpressionInput v-model="joint.dampingRatio" :minimum="0" :step="0.1" :resource-key="entity.uuid + ':' + joint.uuid + ':dampingRatio'" /></UiPropertyRow>
    <UiPropertyRow :label="t('weldAngularFrequency')" v-if="joint.kind === 'WeldJoint2D'"><NumericExpressionInput v-model="joint.angularFrequency" :minimum="0" :step="0.5" :resource-key="entity.uuid + ':' + joint.uuid + ':angularFrequency'" /></UiPropertyRow>
    <UiPropertyRow :label="t('angularDampingRatio')" v-if="joint.kind === 'WeldJoint2D' && joint.angularFrequency > 0"><NumericExpressionInput v-model="joint.angularDampingRatio" :minimum="0" :step="0.1" :resource-key="entity.uuid + ':' + joint.uuid + ':angularDampingRatio'" /></UiPropertyRow>
    <UiPropertyRow :label="t('breakForce')"><LimitNumberInput v-model="joint.breakForce" :resource-key="`${entity.uuid}/${joint.uuid}/breakForce`" :label="t('breakForce')" /></UiPropertyRow>
    <UiPropertyRow :label="t('breakTorque')"><LimitNumberInput v-model="joint.breakTorque" :resource-key="`${entity.uuid}/${joint.uuid}/breakTorque`" :label="t('breakTorque')" /></UiPropertyRow>
  </UiPropertySection>

  <UiPropertySection :title="(t('TargetJoint2D'))" v-if="targetJoint && componentVisible('TargetJoint2D', t('TargetJoint2D'))" >
    <template #actions><UiButton icon="clear" @click="remove('TargetJoint2D')" :label="t('remove')" /></template>
    <p class="renderer-capability-hint">{{ t('targetJointHint') }}</p>
    <UiPropertyRow :label="t('anchor')"><div><NumericExpressionInput v-model="targetJoint.anchor.x" :step="0.1" :resource-key="entity.uuid + ':' + targetJoint.uuid + ':anchor.x'" /><NumericExpressionInput v-model="targetJoint.anchor.y" :step="0.1" :resource-key="entity.uuid + ':' + targetJoint.uuid + ':anchor.y'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('targetPoint')"><div><NumericExpressionInput v-model="targetJoint.target.x" :step="0.1" :resource-key="entity.uuid + ':' + targetJoint.uuid + ':target.x'" /><NumericExpressionInput v-model="targetJoint.target.y" :step="0.1" :resource-key="entity.uuid + ':' + targetJoint.uuid + ':target.y'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('targetStartsAtBody')"><input v-model="targetJoint.startAtBody" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('springFrequency')"><NumericExpressionInput v-model="targetJoint.frequency" :minimum="0.01" :step="0.5" :resource-key="entity.uuid + ':' + targetJoint.uuid + ':frequency'" /></UiPropertyRow>
    <UiPropertyRow :label="t('springDampingRatio')"><NumericExpressionInput v-model="targetJoint.dampingRatio" :minimum="0" :step="0.1" :resource-key="entity.uuid + ':' + targetJoint.uuid + ':dampingRatio'" /></UiPropertyRow>
    <UiPropertyRow :label="t('targetMaxForce')"><NumericExpressionInput v-model="targetJoint.maxForce" :minimum="0" :step="10" :resource-key="entity.uuid + ':' + targetJoint.uuid + ':maxForce'" /></UiPropertyRow>
  </UiPropertySection>

  <UiPropertySection :title="(t('rectTransform'))" v-if="rectTransform && componentVisible('RectTransform', t('rectTransform'))" >
    <template #actions><UiButton icon="clear" @click="remove('RectTransform')" :label="t('remove')" /></template>
    <UiPropertyRow :label="t('layoutMode')"><select v-model="rectTransform.layoutMode"><option>Responsive</option><option>Fixed</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('anchorPreset')"><select v-model="rectTransform.anchorPreset"><option v-for="preset in anchorPresets" :key="preset" :value="preset">{{ anchorLabel(preset) }}</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('pivot')"><div><NumericExpressionInput v-model="rectTransform.pivot.x" :minimum="0" :maximum="1" :step="0.05" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':pivot.x'" /><NumericExpressionInput v-model="rectTransform.pivot.y" :minimum="0" :maximum="1" :step="0.05" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':pivot.y'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('uiPosition')"><div><NumericExpressionInput v-model="rectTransform.position.x" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':position.x'" /><NumericExpressionInput v-model="rectTransform.position.y" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':position.y'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('uiSize')"><div><NumericExpressionInput v-model="rectTransform.size.x" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':size.x'" /><NumericExpressionInput v-model="rectTransform.size.y" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':size.y'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('preferredSize')"><div><NumericExpressionInput v-model="rectTransform.preferredSize.x" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':preferredSize.x'" /><NumericExpressionInput v-model="rectTransform.preferredSize.y" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':preferredSize.y'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('anchorRange')"><div class="quad"><NumericExpressionInput v-model="rectTransform.anchorMin.x" :minimum="0" :maximum="1" :step="0.05" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':anchorMin.x'" /><NumericExpressionInput v-model="rectTransform.anchorMin.y" :minimum="0" :maximum="1" :step="0.05" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':anchorMin.y'" /><NumericExpressionInput v-model="rectTransform.anchorMax.x" :minimum="0" :maximum="1" :step="0.05" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':anchorMax.x'" /><NumericExpressionInput v-model="rectTransform.anchorMax.y" :minimum="0" :maximum="1" :step="0.05" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':anchorMax.y'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('offsets')"><div class="quad"><NumericExpressionInput v-model="rectTransform.offsets.left" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':offsets.left'" /><NumericExpressionInput v-model="rectTransform.offsets.top" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':offsets.top'" /><NumericExpressionInput v-model="rectTransform.offsets.right" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':offsets.right'" /><NumericExpressionInput v-model="rectTransform.offsets.bottom" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':offsets.bottom'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('margins')" v-if="rectTransform.anchorPreset === 'stretch'"><div class="quad"><NumericExpressionInput v-model="rectTransform.margins.left" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':margins.left'" /><NumericExpressionInput v-model="rectTransform.margins.top" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':margins.top'" /><NumericExpressionInput v-model="rectTransform.margins.right" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':margins.right'" /><NumericExpressionInput v-model="rectTransform.margins.bottom" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':margins.bottom'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('sizePolicy')"><div><select v-model="rectTransform.horizontalPolicy"><option>Fixed</option><option>Fill</option><option>Content</option></select><select v-model="rectTransform.verticalPolicy"><option>Fixed</option><option>Fill</option><option>Content</option></select></div></UiPropertyRow>
    <UiPropertyRow :label="t('minimumSize')"><div><NumericExpressionInput v-model="rectTransform.minSize.x" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':minSize.x'" /><NumericExpressionInput v-model="rectTransform.minSize.y" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':minSize.y'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('maximumSize')"><div><NumericExpressionInput v-model="rectTransform.maxSize.x" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':maxSize.x'" /><NumericExpressionInput v-model="rectTransform.maxSize.y" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':maxSize.y'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('aspectConstraint')"><div><select v-model="rectTransform.aspectConstraint"><option>None</option><option>Fit</option><option>WidthControlsHeight</option><option>HeightControlsWidth</option></select><NumericExpressionInput v-model="rectTransform.aspectRatio" :minimum="0" :step="0.01" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':aspectRatio'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('zOrder')"><NumericExpressionInput v-model="rectTransform.zOrder" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':zOrder'" /></UiPropertyRow>
    <UiPropertyRow :label="t('mirrorInRtl')"><input v-model="rectTransform.mirrorInRtl" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('reusableComponent')"><div><input v-model="rectTransform.componentSource" placeholder="asset://GUID"><input v-model="rectTransform.componentVariant" placeholder="default"></div></UiPropertyRow>
    <UiPropertyRow :label="t('focusable')"><input v-model="rectTransform.focusable" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('tabIndex')"><NumericExpressionInput v-model="rectTransform.tabIndex" :minimum="-1" :maximum="100000" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':tabIndex'" /></UiPropertyRow>
    <UiPropertyRow :label="t('focusNavigation')"><div class="quad"><input v-model="rectTransform.focusUp" :placeholder="t('upUuid')"><input v-model="rectTransform.focusDown" :placeholder="t('downUuid')"><input v-model="rectTransform.focusLeft" :placeholder="t('leftUuid')"><input v-model="rectTransform.focusRight" :placeholder="t('rightUuid')"></div></UiPropertyRow>
    <UiPropertyRow :label="t('accessibilityRole')"><input v-model="rectTransform.accessibilityRole"></UiPropertyRow>
    <UiPropertyRow :label="t('accessibilityLabel')"><input v-model="rectTransform.accessibilityLabel"></UiPropertyRow>
    <UiPropertyRow :label="t('accessibilityDescription')"><input v-model="rectTransform.accessibilityDescription"></UiPropertyRow>
    <UiPropertyRow :label="t('accessibilityState')"><input v-model="rectTransform.accessibilityState"></UiPropertyRow>
    <UiPropertyRow :label="t('accessibilityValue')"><input v-model="rectTransform.accessibilityValue"></UiPropertyRow>
    <UiPropertyRow :label="t('liveRegion')"><select v-model="rectTransform.accessibilityLive"><option>Off</option><option>Polite</option><option>Assertive</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('readingOrder')"><NumericExpressionInput v-model="rectTransform.readingOrder" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':readingOrder'" /></UiPropertyRow>
    <UiPropertyRow :label="t('skipNavigation')"><input v-model="rectTransform.skipNavigation" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('screenReaderHidden')"><input v-model="rectTransform.accessibilityHidden" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('remapAction')"><div><input v-model="rectTransform.remapAction" :placeholder="t('inputAction')"><NumericExpressionInput v-model="rectTransform.remapBindingIndex" :minimum="0" :maximum="31" :step="1" :resource-key="entity.uuid + ':' + rectTransform.uuid + ':remapBindingIndex'" /></div></UiPropertyRow>
    <div class="breakpoint-editor"><strong>{{ t('responsiveBreakpoints') }}</strong><article v-for="(point,index) in rectTransform.breakpoints" :key="index"><NumericExpressionInput v-model="point.minWidth" :minimum="0" :step="1" :resource-key="breakpointResourceKey(point, 'minWidth')" /><NumericExpressionInput v-model="point.maxWidth" :minimum="0" :step="1" :resource-key="breakpointResourceKey(point, 'maxWidth')" /><input v-model="point.visible" type="checkbox"><UiButton icon="clear" @click="rectTransform.breakpoints.splice(index,1)" :label="t('remove')" /></article><UiButton icon="add" @click="addBreakpoint">{{ t('breakpoint') }}</UiButton></div>
  </UiPropertySection>

  <UiPropertySection :title="(t('uiCanvas'))" v-if="canvas && componentVisible('Canvas', t('uiCanvas'))" >
    <template #actions><UiButton icon="clear" @click="remove('Canvas')" :label="t('remove')" /></template>
    <UiPropertyRow :label="t('referenceSize')"><div><NumericExpressionInput v-model="canvas.referenceSize.x" :minimum="1" :step="1" :resource-key="entity.uuid + ':' + canvas.uuid + ':referenceSize.x'" /><NumericExpressionInput v-model="canvas.referenceSize.y" :minimum="1" :step="1" :resource-key="entity.uuid + ':' + canvas.uuid + ':referenceSize.y'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('scaleWithScreen')"><input v-model="canvas.scaleWithScreen" type="checkbox"></UiPropertyRow>
    <UiPropertyRow label="DPI"><NumericExpressionInput v-model="canvas.dpiScale" :minimum="0.5" :maximum="4" :step="0.25" :resource-key="entity.uuid + ':' + canvas.uuid + ':dpiScale'" /></UiPropertyRow>
    <UiPropertyRow :label="t('liveLocalePreview')"><input v-model="canvas.localePreview" placeholder="en-US / ar"></UiPropertyRow>
    <UiPropertyRow :label="t('sortingOrder')"><NumericExpressionInput v-model="canvas.sortingOrder" :step="1" :resource-key="entity.uuid + ':' + canvas.uuid + ':sortingOrder'" /></UiPropertyRow>
    <UiPropertyRow :label="t('safeArea')"><input v-model="canvas.safeArea" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('safeAreaInsets')" v-if="canvas.safeArea"><div class="quad"><NumericExpressionInput v-model="canvas.safeAreaInsets.left" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + canvas.uuid + ':safeAreaInsets.left'" /><NumericExpressionInput v-model="canvas.safeAreaInsets.top" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + canvas.uuid + ':safeAreaInsets.top'" /><NumericExpressionInput v-model="canvas.safeAreaInsets.right" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + canvas.uuid + ':safeAreaInsets.right'" /><NumericExpressionInput v-model="canvas.safeAreaInsets.bottom" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + canvas.uuid + ':safeAreaInsets.bottom'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('uiTheme')"><select v-model="canvas.themeAsset"><option :value="null">{{ t('none') }}</option><option v-for="asset in themeAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('variant')"><input v-model="canvas.themeVariant" placeholder="default / compact / highContrast"></UiPropertyRow>
  </UiPropertySection>

  <UiPropertySection :title="(t('uiPanel'))" v-if="panel && componentVisible('Panel', t('uiPanel'))" >
    <template #actions><UiButton icon="clear" @click="remove('Panel')" :label="t('remove')" /></template>
    <UiPropertyRow :label="t('color')"><input type="color" :value="rgbHex(panel.color)" @input="setColor(panel.color, $event)"></UiPropertyRow>
    <UiPropertyRow :label="t('opacity')"><NumericExpressionInput v-model="panel.opacity" :minimum="0" :maximum="100" :step="1" :resource-key="entity.uuid + ':' + panel.uuid + ':opacity'" /></UiPropertyRow>
    <UiPropertyRow :label="t('cornerRadius')"><NumericExpressionInput v-model="panel.cornerRadius" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + panel.uuid + ':cornerRadius'" /></UiPropertyRow>
    <UiPropertyRow :label="t('layoutContainer')"><select v-model="panel.layout"><option>None</option><option>Row</option><option>Column</option><option>Grid</option><option>Flow</option><option>Overlay</option><option>Center</option><option>Margin</option><option>Aspect</option><option>Split</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('gapColumns')" v-if="panel.layout !== 'None'"><div><NumericExpressionInput v-model="panel.gap" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + panel.uuid + ':gap'" /><NumericExpressionInput v-model="panel.columns" :minimum="1" :maximum="64" :step="1" :resource-key="entity.uuid + ':' + panel.uuid + ':columns'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('padding')" v-if="panel.layout !== 'None'"><div class="quad"><NumericExpressionInput v-model="panel.padding.left" :step="1" :resource-key="entity.uuid + ':' + panel.uuid + ':padding.left'" /><NumericExpressionInput v-model="panel.padding.top" :step="1" :resource-key="entity.uuid + ':' + panel.uuid + ':padding.top'" /><NumericExpressionInput v-model="panel.padding.right" :step="1" :resource-key="entity.uuid + ':' + panel.uuid + ':padding.right'" /><NumericExpressionInput v-model="panel.padding.bottom" :step="1" :resource-key="entity.uuid + ':' + panel.uuid + ':padding.bottom'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('wrap')"><input v-model="panel.wrap" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('alignment')"><div><select v-model="panel.align"><option>Start</option><option>Center</option><option>End</option><option>Stretch</option></select><select v-model="panel.justify"><option>Start</option><option>Center</option><option>End</option><option>SpaceBetween</option></select></div></UiPropertyRow>
    <UiPropertyRow :label="t('clipMask')"><div><input v-model="panel.clipChildren" type="checkbox"><input v-model="panel.maskChildren" type="checkbox"></div></UiPropertyRow>
    <UiPropertyRow :label="t('scrollView')"><div><input v-model="panel.scrollHorizontal" type="checkbox"><input v-model="panel.scrollVertical" type="checkbox"></div></UiPropertyRow>
    <UiPropertyRow :label="t('scrollOffset')" v-if="panel.scrollHorizontal || panel.scrollVertical"><div><NumericExpressionInput v-model="panel.scrollOffset.x" :step="1" :resource-key="entity.uuid + ':' + panel.uuid + ':scrollOffset.x'" /><NumericExpressionInput v-model="panel.scrollOffset.y" :step="1" :resource-key="entity.uuid + ':' + panel.uuid + ':scrollOffset.y'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('scrollContentSize')" v-if="panel.scrollHorizontal || panel.scrollVertical"><div><NumericExpressionInput v-model="panel.contentSize.x" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + panel.uuid + ':contentSize.x'" /><NumericExpressionInput v-model="panel.contentSize.y" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + panel.uuid + ':contentSize.y'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('scrollSpeed')" v-if="panel.scrollHorizontal || panel.scrollVertical"><NumericExpressionInput v-model="panel.scrollSpeed" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + panel.uuid + ':scrollSpeed'" /></UiPropertyRow>
    <UiPropertyRow :label="t('showScrollbars')" v-if="panel.scrollHorizontal || panel.scrollVertical"><input v-model="panel.showScrollbars" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('uiBehavior')"><select v-model="panel.behavior"><option>Normal</option><option>Modal</option><option>Popup</option><option>Tooltip</option></select></UiPropertyRow>
    <UiPropertyRow :label="t('visible')"><input v-model="panel.visible" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('closeOnOutside')" v-if="panel.behavior === 'Modal' || panel.behavior === 'Popup'"><input v-model="panel.closeOnOutside" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('dragAndDrop')"><div><input v-model="panel.draggable" type="checkbox"><input v-model="panel.dropGroup" :placeholder="t('group')"></div></UiPropertyRow>
    <UiPropertyRow :label="t('tooltip')" v-if="panel.behavior === 'Tooltip'"><div><input v-model="panel.tooltipText"><NumericExpressionInput v-model="panel.tooltipDelay" :minimum="0" :step="0.05" :resource-key="entity.uuid + ':' + panel.uuid + ':tooltipDelay'" /></div></UiPropertyRow>
    <UiPropertyRow :label="t('uiStyleClass')"><input v-model="panel.styleClass"></UiPropertyRow><UiPropertyRow :label="t('overrideBackground')"><input v-model="panel.styleOverrides.background" placeholder="#232934 / $surface"></UiPropertyRow>
  </UiPropertySection>

  <UiPropertySection :title="(t('uiImage'))" v-if="image && componentVisible('Image', t('uiImage'))" >
    <template #actions><UiButton icon="clear" @click="remove('Image')" :label="t('remove')" /></template>
    <UiPropertyRow :label="t('spriteAsset')"><select v-model="image.spriteAsset"><option :value="null">{{ t('none') }}</option><option v-for="asset in imageAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></UiPropertyRow>
    <UiButton icon="add" class="component-import" @click="uiImageInput?.click()">{{ t('importTexture') }}</UiButton><input ref="uiImageInput" hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" @change="importUiImage">
    <UiPropertyRow :label="t('tint')"><input type="color" :value="rgbHex(image.tint)" @input="setColor(image.tint, $event)"></UiPropertyRow><UiPropertyRow :label="t('opacity')"><NumericExpressionInput v-model="image.opacity" :minimum="0" :maximum="100" :step="1" :resource-key="entity.uuid + ':' + image.uuid + ':opacity'" /></UiPropertyRow><UiPropertyRow :label="t('preserveAspect')"><input v-model="image.preserveAspect" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('nineSlice')"><input v-model="image.nineSlice.enabled" type="checkbox"></UiPropertyRow>
    <UiPropertyRow :label="t('sliceBorders')" v-if="image.nineSlice.enabled"><div><NumericExpressionInput v-model="image.nineSlice.left" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + image.uuid + ':nineSlice.left'" /><NumericExpressionInput v-model="image.nineSlice.top" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + image.uuid + ':nineSlice.top'" /><NumericExpressionInput v-model="image.nineSlice.right" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + image.uuid + ':nineSlice.right'" /><NumericExpressionInput v-model="image.nineSlice.bottom" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + image.uuid + ':nineSlice.bottom'" /></div></UiPropertyRow>
  </UiPropertySection>
  <UiPropertySection :title="(t('uiText'))" v-if="text && componentVisible('Text', t('uiText'))" ><template #actions><UiButton icon="clear" @click="remove('Text')" :label="t('remove')" /></template><UiPropertyRow :label="t('textContent')" class="stacked"><textarea v-model="text.text" rows="2"></textarea></UiPropertyRow><UiPropertyRow :label="t('localizationKey')"><input v-model="text.localizationKey"></UiPropertyRow><UiPropertyRow :label="t('fontAsset')"><select v-model="text.fontAsset"><option :value="null">{{ t('defaultFont') }}</option><option v-for="asset in fontAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></UiPropertyRow><UiPropertyRow :label="t('textColor')"><input type="color" :value="rgbHex(text.color)" @input="setColor(text.color, $event)"></UiPropertyRow><UiPropertyRow :label="t('opacity')"><NumericExpressionInput v-model="text.opacity" :minimum="0" :maximum="100" :step="1" :resource-key="entity.uuid + ':' + text.uuid + ':opacity'" /></UiPropertyRow><UiPropertyRow :label="t('fontSize')"><NumericExpressionInput v-model="text.fontSize" :minimum="1" :step="1" :resource-key="entity.uuid + ':' + text.uuid + ':fontSize'" /></UiPropertyRow><UiPropertyRow :label="t('fontWeight')"><NumericExpressionInput v-model="text.fontWeight" :minimum="100" :maximum="900" :step="100" :resource-key="entity.uuid + ':' + text.uuid + ':fontWeight'" /></UiPropertyRow><UiPropertyRow :label="t('alignment')"><select v-model="text.align"><option value="left">{{ t('left') }}</option><option value="center">{{ t('center') }}</option><option value="right">{{ t('right') }}</option></select></UiPropertyRow><UiPropertyRow :label="t('textLayout')"><div><select v-model="text.wrap"><option>None</option><option>Word</option><option>Character</option></select><select v-model="text.overflow"><option>Visible</option><option>Clip</option><option>Ellipsis</option></select></div></UiPropertyRow><UiPropertyRow :label="t('inputPromptAction')"><input v-model="text.inputPromptAction" :placeholder="t('inputAction')"></UiPropertyRow><UiPropertyRow :label="t('captionCategory')"><select v-model="text.captionCategory"><option value="None">{{ t('captionNone') }}</option><option value="Dialogue">{{ t('captionDialogue') }}</option><option value="Effects">{{ t('captionEffects') }}</option><option value="Music">{{ t('captionMusic') }}</option></select></UiPropertyRow></UiPropertySection>
  <UiPropertySection :title="(t('uiButton'))" v-if="button && componentVisible('Button', t('uiButton'))" ><template #actions><UiButton icon="clear" @click="remove('Button')" :label="t('remove')" /></template><UiPropertyRow :label="t('interactable')"><input v-model="button.interactable" type="checkbox"></UiPropertyRow><TimelineButtonAction :entity="entity" :button="button" /><UiPropertyRow label="on_pressed"><input v-model="button.onPressed"></UiPropertyRow><UiPropertyRow label="on_hover_enter"><input v-model="button.onHoverEnter"></UiPropertyRow><UiPropertyRow label="on_hover_exit"><input v-model="button.onHoverExit"></UiPropertyRow><UiPropertyRow :label="t('normalColor')"><input type="color" :value="rgbHex(button.normalColor)" @input="setColor(button.normalColor, $event)"></UiPropertyRow><UiPropertyRow :label="t('hoveredColor')"><input type="color" :value="rgbHex(button.hoveredColor)" @input="setColor(button.hoveredColor, $event)"></UiPropertyRow><UiPropertyRow :label="t('pressedColor')"><input type="color" :value="rgbHex(button.pressedColor)" @input="setColor(button.pressedColor, $event)"></UiPropertyRow><UiPropertyRow :label="t('disabledColor')"><input type="color" :value="rgbHex(button.disabledColor)" @input="setColor(button.disabledColor, $event)"></UiPropertyRow><UiPropertyRow :label="t('pressAudio')"><select v-model="button.pressAudio"><option :value="null">{{ t('none') }}</option><option v-for="asset in audioAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></UiPropertyRow><UiPropertyRow :label="t('hoverAudio')"><select v-model="button.hoverAudio"><option :value="null">{{ t('none') }}</option><option v-for="asset in audioAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></UiPropertyRow><UiPropertyRow :label="t('focusAudio')"><select v-model="button.focusAudio"><option :value="null">{{ t('none') }}</option><option v-for="asset in audioAssets" :key="asset.uuid" :value="assetReference(asset.uuid)">{{ asset.name }}</option></select></UiPropertyRow><UiPropertyRow :label="t('uiStyleClass')"><input v-model="button.styleClass"></UiPropertyRow><UiPropertyRow :label="t('overrideBackground')"><input v-model="button.styleOverrides.background" placeholder="#4f96ff / $accent"></UiPropertyRow></UiPropertySection>
  <UiPropertySection :title="(t('uiSlider'))" v-if="slider && componentVisible('Slider', t('uiSlider'))" ><template #actions><UiButton icon="clear" @click="remove('Slider')" :label="t('remove')" /></template><ValueRange :component="slider" /><UiPropertyRow :label="t('wholeNumbers')"><input v-model="slider.wholeNumbers" type="checkbox"></UiPropertyRow><UiPropertyRow :label="t('interactable')"><input v-model="slider.interactable" type="checkbox"></UiPropertyRow><UiPropertyRow :label="t('uiStyleClass')"><input v-model="slider.styleClass"></UiPropertyRow></UiPropertySection>
  <UiPropertySection :title="(t('uiProgressBar'))" v-if="progress && componentVisible('ProgressBar', t('uiProgressBar'))" ><template #actions><UiButton icon="clear" @click="remove('ProgressBar')" :label="t('remove')" /></template><ValueRange :component="progress" /><UiPropertyRow :label="t('fillColor')"><input type="color" :value="rgbHex(progress.fillColor)" @input="setColor(progress.fillColor, $event)"></UiPropertyRow><UiPropertyRow :label="t('backgroundColor')"><input type="color" :value="rgbHex(progress.backgroundColor)" @input="setColor(progress.backgroundColor, $event)"></UiPropertyRow><UiPropertyRow :label="t('uiStyleClass')"><input v-model="progress.styleClass"></UiPropertyRow></UiPropertySection>
  <UiPropertySection :title="(t('uiCheckbox'))" v-if="checkbox && componentVisible('Checkbox', t('uiCheckbox'))" ><template #actions><UiButton icon="clear" @click="remove('Checkbox')" :label="t('remove')" /></template><UiPropertyRow :label="t('label')"><input v-model="checkbox.label"></UiPropertyRow><UiPropertyRow :label="t('localizationKey')"><input v-model="checkbox.localizationKey"></UiPropertyRow><UiPropertyRow :label="t('checked')"><input v-model="checkbox.checked" type="checkbox"></UiPropertyRow><UiPropertyRow :label="t('interactable')"><input v-model="checkbox.interactable" type="checkbox"></UiPropertyRow><UiPropertyRow :label="t('uiStyleClass')"><input v-model="checkbox.styleClass"></UiPropertyRow></UiPropertySection>
  <UiPropertySection :title="(t('uiTextInput'))" v-if="textInput && componentVisible('TextInput', t('uiTextInput'))" ><template #actions><UiButton icon="clear" @click="remove('TextInput')" :label="t('remove')" /></template><UiPropertyRow :label="t('value')"><input v-model="textInput.value"></UiPropertyRow><UiPropertyRow :label="t('placeholder')"><input v-model="textInput.placeholder"></UiPropertyRow><UiPropertyRow :label="t('maxLength')"><NumericExpressionInput v-model="textInput.maxLength" :minimum="0" :step="1" :resource-key="entity.uuid + ':' + textInput.uuid + ':maxLength'" /></UiPropertyRow><UiPropertyRow :label="t('password')"><input v-model="textInput.password" type="checkbox"></UiPropertyRow><UiPropertyRow :label="t('uiStyleClass')"><input v-model="textInput.styleClass"></UiPropertyRow></UiPropertySection>

  <UiMotionTransition><section v-if="componentVisible('Canvas', t('createGameUi'))" class="ui-palette">
    <strong>{{ t('createGameUi') }}</strong>
    <p>{{ t('uiEditorHint') }}</p>
    <div><UiButton icon="add" v-for="kind in uiKinds" :key="kind" @click="create(kind)">{{ t(`create${kind}`) }}</UiButton></div>
  </section></UiMotionTransition>
</template>

<script setup lang="ts">
import UiMotionTransition from '../ui/components/UiMotionTransition.vue'

import EditorIcon from './EditorIcon.vue'
import NumericExpressionInput from './NumericExpressionInput.vue'
import LimitNumberInput from './LimitNumberInput.vue'
import TimelineButtonAction from './TimelineButtonAction.vue'
import { computed, defineComponent, h, ref, watch, type PropType } from 'vue'
import { assetReference, assetState, importAssetFiles, resolveAsset } from '../assets/AssetDatabase'
import { t } from '../i18n'
import { preferencesState } from '../store/preferences'
import { directionalShadowHint } from '../editor/lightInspectorCopy'
import { beginHistoryTransaction, commitHistoryTransaction, cancelHistoryTransaction, createUiEntity, physicsState, pushHistory, type UiElementKind } from '../store/physics'
import type { Entity } from '../world/Entity'
import type {
  Animator, AudioListener, AudioSource, Button, Canvas, Checkbox, ComponentKind, Image, Joint2D, Light2D, Panel, TargetJoint2D,
  ParticleEmitter2D, ProgressBar, RectTransform, ShadowCaster2D, Skeleton2D, Slider, Text, TextInput, TileMap2D, TimelinePlayer
} from '../world/components'
import type { InspectorCategory } from '../store/editor'
import { readAnimatorController } from '../runtime/animation'
import { requestConfirmation } from '../store/dialog'
import { editorState } from '../store/editor'
import { invalidateTileMap, resizeTileMap, tilemapEditorState } from '../runtime/tilemap'
import { timelineRuntime } from '../runtime/timeline'

const props = defineProps<{ entity: Entity; searchQuery?: string; category?: InspectorCategory }>()
const breakpointIds = new WeakMap<object, number>(); let nextBreakpointId = 0
/** 为断点对象分配稳定的弱引用编号，并结合实体及字段生成编辑资源键。 */ function breakpointResourceKey(point: object, field: string): string { let id = breakpointIds.get(point); if (id === undefined) { id = ++nextBreakpointId; breakpointIds.set(point, id) } return props.entity.uuid + ':breakpoint:' + id + ':' + field }
const uiImageInput = ref<HTMLInputElement | null>(null)
const ValueRange = defineComponent({ props: { component: { type: Object as PropType<Slider | ProgressBar>, required: true } }, /** 为范围组件创建渲染函数，编辑最小值、最大值和当前值。 */ setup(componentProps) { return /** 渲染三个带稳定资源键的数值表达式输入。 */ () => h('div', { class: 'range-values' }, [['min', 'Min'], ['max', 'Max'], ['value', t('value')]].map(/** 为一个范围字段生成标签及输入组件，并绑定更新回调。 */ ([key, label]) => h('label', [h('span', label), h(NumericExpressionInput, { modelValue: componentProps.component[key as 'min'], resourceKey: props.entity.uuid + ':' + componentProps.component.uuid + ':' + key, step: 1, 'onUpdate:modelValue': /** 将已验证的输入数值写回对应范围字段。 */ (value: number) => { componentProps.component[key as 'min'] = value } })])) ) } })
const anchorPresets = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right', 'stretch'] as const
const uiKinds: UiElementKind[] = ['Canvas', 'Panel', 'Image', 'Text', 'Button', 'Slider', 'ProgressBar', 'Checkbox', 'TextInput']
const imageAssets = computed(/** 筛选图片资源供组件绑定。 */ () => assetState.records.filter(/* 比较 asset.assetType 与 'image'，返回严格相等的判断结果。 */ asset => asset.assetType === 'image'))
const audioAssets = computed(/** 筛选音频资源供组件绑定。 */ () => assetState.records.filter(/* 比较 asset.assetType 与 'audio'，返回严格相等的判断结果。 */ asset => asset.assetType === 'audio'))
const fontAssets = computed(/** 筛选字体资源供组件绑定。 */ () => assetState.records.filter(/* 比较 asset.assetType 与 'font'，返回严格相等的判断结果。 */ asset => asset.assetType === 'font'))
const themeAssets = computed(/** 筛选界面主题资源供组件绑定。 */ () => assetState.records.filter(/* 比较 asset.assetType 与 'uiTheme'，返回严格相等的判断结果。 */ asset => asset.assetType === 'uiTheme'))
const controllerAssets = computed(/** 筛选动画控制器资源供绑定。 */ () => assetState.records.filter(/* 比较 asset.assetType 与 'controller'，返回严格相等的判断结果。 */ asset => asset.assetType === 'controller'))
const rigAssets = computed(/** 筛选骨架资源供绑定。 */ () => assetState.records.filter(/* 比较 asset.assetType 与 'rig'，返回严格相等的判断结果。 */ asset => asset.assetType === 'rig'))
const skinAssets = computed(/** 筛选皮肤资源供绑定。 */ () => assetState.records.filter(/* 比较 asset.assetType 与 'skin'，返回严格相等的判断结果。 */ asset => asset.assetType === 'skin'))
const timelineAssets = computed(/** 筛选时间轴资源供绑定。 */ () => assetState.records.filter(/* 比较 asset.assetType 与 'timeline'，返回严格相等的判断结果。 */ asset => asset.assetType === 'timeline'))
const tileSetAssets = computed(/** 筛选图集资源供瓦片绑定。 */ () => assetState.records.filter(/* 比较 asset.assetType 与 'tileset'，返回严格相等的判断结果。 */ asset => asset.assetType === 'tileset'))
const animator = computed(/* 调用 props.entity.getComponent<Animator>('Animator') 并返回调用结果。 */ () => props.entity.getComponent<Animator>('Animator'))
const skeleton = computed(/* 调用 props.entity.getComponent<Skeleton2D>('Skeleton2D') 并返回调用结果。 */ () => props.entity.getComponent<Skeleton2D>('Skeleton2D'))
const timelinePlayer = computed(/* 调用 props.entity.getComponent<TimelinePlayer>('TimelinePlayer') 并返回调用结果。 */ () => props.entity.getComponent<TimelinePlayer>('TimelinePlayer'))
const audioSource = computed(/* 调用 props.entity.getComponent<AudioSource>('AudioSource') 并返回调用结果。 */ () => props.entity.getComponent<AudioSource>('AudioSource'))
const audioListener = computed(/* 调用 props.entity.getComponent<AudioListener>('AudioListener') 并返回调用结果。 */ () => props.entity.getComponent<AudioListener>('AudioListener'))
const rectTransform = computed(/* 调用 props.entity.getComponent<RectTransform>('RectTransform') 并返回调用结果。 */ () => props.entity.getComponent<RectTransform>('RectTransform'))
const canvas = computed(/* 调用 props.entity.getComponent<Canvas>('Canvas') 并返回调用结果。 */ () => props.entity.getComponent<Canvas>('Canvas'))
const panel = computed(/* 调用 props.entity.getComponent<Panel>('Panel') 并返回调用结果。 */ () => props.entity.getComponent<Panel>('Panel'))
const image = computed(/* 调用 props.entity.getComponent<Image>('Image') 并返回调用结果。 */ () => props.entity.getComponent<Image>('Image'))
const text = computed(/* 调用 props.entity.getComponent<Text>('Text') 并返回调用结果。 */ () => props.entity.getComponent<Text>('Text'))
const button = computed(/* 调用 props.entity.getComponent<Button>('Button') 并返回调用结果。 */ () => props.entity.getComponent<Button>('Button'))
const slider = computed(/* 调用 props.entity.getComponent<Slider>('Slider') 并返回调用结果。 */ () => props.entity.getComponent<Slider>('Slider'))
const progress = computed(/* 调用 props.entity.getComponent<ProgressBar>('ProgressBar') 并返回调用结果。 */ () => props.entity.getComponent<ProgressBar>('ProgressBar'))
const checkbox = computed(/* 调用 props.entity.getComponent<Checkbox>('Checkbox') 并返回调用结果。 */ () => props.entity.getComponent<Checkbox>('Checkbox'))
const textInput = computed(/* 调用 props.entity.getComponent<TextInput>('TextInput') 并返回调用结果。 */ () => props.entity.getComponent<TextInput>('TextInput'))
const tileMap = computed(/* 调用 props.entity.getComponent<TileMap2D>('TileMap2D') 并返回调用结果。 */ () => props.entity.getComponent<TileMap2D>('TileMap2D'))
const particleEmitter = computed(/* 调用 props.entity.getComponent<ParticleEmitter2D>('ParticleEmitter2D') 并返回调用结果。 */ () => props.entity.getComponent<ParticleEmitter2D>('ParticleEmitter2D'))
const light = computed(/* 调用 props.entity.getComponent<Light2D>('Light2D') 并返回调用结果。 */ () => props.entity.getComponent<Light2D>('Light2D'))
const shadowCaster = computed(/* 调用 props.entity.getComponent<ShadowCaster2D>('ShadowCaster2D') 并返回调用结果。 */ () => props.entity.getComponent<ShadowCaster2D>('ShadowCaster2D'))
const targetJoint = computed(/* 26.45: target (mouse) joint of this body. */ () => props.entity.getComponent<TargetJoint2D>('TargetJoint2D'))
const jointKinds = ['FixedJoint2D', 'WeldJoint2D', 'DistanceJoint2D', 'RopeJoint2D', 'RevoluteJoint2D', 'MotorJoint2D', 'PrismaticJoint2D', 'SpringJoint2D', 'WheelJoint2D'] as const
const joints = computed(/** 枚举已知关节种类并收集实体实际拥有的关节组件。 */ () => jointKinds.flatMap(/** 读取指定种类关节，存在时返回单项，否则不产生条目。 */ kind => { const component = props.entity.getComponent<Joint2D>(kind); return component ? [component] : [] }))
const visibleJoints = computed(/* 调用 joints.value.filter(joint => componentVisible(joint.kind, t(joint.kind))) 并返回调用结果。 */ () => joints.value.filter(/* 调用 componentVisible(joint.kind, t(joint.kind)) 并返回调用结果。 */ joint => componentVisible(joint.kind, t(joint.kind))))
const jointTargets = computed(/** 筛选其他具有刚体及碰撞体的实体作为关节目标。 */ () => physicsState.world.entities.filter(/* 先计算 entity !== props.entity && entity.hasComponent('RigidBody2D')；仅当其为真值时求右侧 entity.getCollider()，返回短路求值结果。 */ entity => entity !== props.entity && entity.hasComponent('RigidBody2D') && entity.getCollider()))

/** 将界面、渲染、关节或其他组件分类到对应检查器组。 */ function componentCategory(kind: ComponentKind): InspectorCategory {
  if (['Canvas', 'RectTransform', 'Panel', 'Image', 'Text', 'Button', 'Slider', 'ProgressBar', 'Checkbox', 'TextInput'].includes(kind)) return 'ui'
  if (['TileMap2D', 'ParticleEmitter2D', 'Light2D', 'ShadowCaster2D'].includes(kind)) return 'render'
  if (kind.endsWith('Joint2D')) return 'physics'
  return 'gameplay'
}
/** 先检查类别，再用搜索词匹配组件标题和种类。 */ function componentVisible(kind: ComponentKind, title: string): boolean {
  const category = props.category ?? 'all'
  if (category !== 'all' && category !== componentCategory(kind)) return false
  const needle = (props.searchQuery ?? '').trim().toLocaleLowerCase()
  return !needle || `${title} ${kind}`.toLocaleLowerCase().includes(needle)
}
watch(/* 返回 animator.value?.controllerAsset 的当前值。 */ () => animator.value?.controllerAsset, /** 控制器引用变化时同步参数默认值和默认状态；无控制器时清空参数与状态。 */ reference => {
  if (!animator.value) return
  const document = readAnimatorController(reference ?? null)
  if (!document) { animator.value.parameters = {}; animator.value.currentState = ''; return }
  animator.value.parameters = Object.fromEntries(document.parameters.map(/* 返回按声明顺序构造的数组 [parameter.name, animator.value!.parameters[parameter.name] ?? parameter.defaultValue]。 */ parameter => [parameter.name, animator.value!.parameters[parameter.name] ?? parameter.defaultValue]))
  animator.value.currentState = document.defaultState
})
/** 确认移除组件，成功后记录历史。 */ async function remove(kind: ComponentKind) {
  const approved = await requestConfirmation({ title: t('removeComponent'), message: `${t('removeComponent')}: ${kind}?`, confirmLabel: t('confirmAction'), cancelLabel: t('cancel'), destructive: true })
  if (approved && props.entity.removeComponent(kind)) pushHistory(`Remove ${kind}`)
}
/** 按当前实体是否能容纳界面元素决定父级，再创建界面实体。 */ function create(kind: UiElementKind) {
  const canContainUi = props.entity.hasComponent('Canvas') || props.entity.hasComponent('Panel')
  createUiEntity(kind, canContainUi ? props.entity.uuid : props.entity.parentUuid)
}
/** 导入图片到精灵目录，将首个图片资源绑定到界面图片并记录历史，最后清空文件输入。 */ async function importUiImage(event: Event) {
  const input = event.target as HTMLInputElement
  if (!image.value || !input.files?.length) return
  const imported = await importAssetFiles(input.files, 'Assets/Sprites')
  const asset = imported.find(/* 比较 candidate.assetType 与 'image'，返回严格相等的判断结果。 */ candidate => candidate.assetType === 'image')
  if (asset) { image.value.spriteAsset = assetReference(asset.uuid); pushHistory('Import UI image') }
  input.value = ''
}
/** 将 RGB 通道转换为两位十六进制颜色文本。 */ function rgbHex(value: { r: number; g: number; b: number }) { return `#${[value.r, value.g, value.b].map(/* 调用 Math.round(channel).toString(16).padStart(2, '0') 并返回调用结果。 */ channel => Math.round(channel).toString(16).padStart(2, '0')).join('')}` }
/** 从颜色输入解析并写入 RGB 通道。 */ function setColor(target: { r: number; g: number; b: number }, event: Event) { const value = (event.target as HTMLInputElement).value; target.r = parseInt(value.slice(1, 3), 16); target.g = parseInt(value.slice(3, 5), 16); target.b = parseInt(value.slice(5, 7), 16) }
/** 未达到二百五十六项时将所选音频引用添加到播放列表，然后清空选择。 */ function addPlaylistClip(event: Event) { const select = event.target as HTMLSelectElement, reference = select.value; if (audioSource.value && reference && audioSource.value.playlist.length < 256) audioSource.value.playlist.push(reference); select.value = '' }
/* 调用 t(`anchor_${preset.replace(/-/g, '_')}` as Parameters<typeof t>[0]) 并返回调用结果。 */ function anchorLabel(preset: typeof anchorPresets[number]) { return t(`anchor_${preset.replace(/-/g, '_')}` as Parameters<typeof t>[0]) }
/** 在历史事务内调整瓦片地图尺寸，成功提交，异常取消事务并重新抛出。 */ function resizeMap(axis: 'width' | 'height', value: number) { const map = tileMap.value; if (!map || !beginHistoryTransaction('Resize TileMap', null, props.entity.uuid + ':' + map.uuid + ':' + axis)) return; try { resizeTileMap(map, axis === 'width' ? value : map.width, axis === 'height' ? value : map.height); commitHistoryTransaction() } catch (error) { cancelHistoryTransaction(); throw error } }
/** 瓦片地图改变时递增修订、使缓存失效并记录历史。 */ function tileMapChanged() { if (!tileMap.value) return; tileMap.value.revision++; invalidateTileMap(tileMap.value); pushHistory('Edit TileMap') }
/** 选中当前瓦片实体并打开底部瓦片编辑器。 */ function openTilemapEditor() { tilemapEditorState.selectedEntityUuid = props.entity.uuid; tilemapEditorState.active = true; editorState.bottomPanelTab = 'tilemap'; editorState.bottomPanelOpen = true }
/** 矩形布局断点未达到三十二项时添加默认区间，并复制当前位移和尺寸。 */ function addBreakpoint() { if (rectTransform.value && rectTransform.value.breakpoints.length < 32) rectTransform.value.breakpoints.push({ minWidth: 0, maxWidth: 1280, visible: true, position: { ...rectTransform.value.position }, size: { ...rectTransform.value.size } }) }
</script>

<style scoped>
.renderer-capability-hint { margin: var(--space-2) var(--space-2); color: var(--text-muted); line-height: 1.5; overflow-wrap: anywhere; }.range-values { display: grid; }.component-import { width: calc(100% - 18px); min-height: 28px; margin: var(--space-2) var(--space-2); border: 1px solid var(--border-subtle); color: var(--accent); background: var(--surface-3); }.ui-palette { padding: var(--space-3); border: 1px dashed var(--border-strong); }.ui-palette > strong { color: var(--text-secondary); }.ui-palette > p { margin: var(--space-1) 0 0; color: var(--text-muted); line-height: 1.4; }.ui-palette > div { margin-top: var(--space-2); display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-1); }
.open-editor { width: calc(100% - 16px); min-height: 28px; margin: var(--space-2); border: 1px solid var(--accent); color: var(--accent); background: var(--accent-soft); }
.playlist-list{padding:var(--space-1) var(--space-2);display:grid;gap:var(--space-0)}.playlist-list span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.breakpoint-editor { padding: var(--space-2); display: grid; gap: var(--space-1); border-top: 1px solid var(--border-subtle); }.breakpoint-editor > strong { color: var(--text-muted); }.breakpoint-editor article { display: grid; grid-template-columns: 1fr 1fr 24px 24px; gap: var(--space-1); }.breakpoint-editor article{grid-template-columns:minmax(0,1fr) 24px 24px}
</style>
