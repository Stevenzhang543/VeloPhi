/** Per-surface rendering policy. Hosts own the values; this module creates no environment, clock or quality adaptation. */
import { applyScriptPostValues } from './postProcessOverrides'
import { DEFAULT_RENDERING_SETTINGS, GPU_TEXTURE_MEMORY_LIMIT_MB, normalizeRenderingSettings, postValues, type PostProcessValues, type RenderingSettings, type RenderQualityPreset, type ShadowQuality } from './renderSettingsSchema'

export interface RuntimeActiveRenderQuality {
 preset: RenderQualityPreset
 maximumPixelRatio: number
 particleBudget: number
 shadowQuality: ShadowQuality
 volumeId: string | null
}
export interface RuntimeRenderingPolicyState {
 renderingSettings: RenderingSettings
 activePostProcessing: PostProcessValues
 activeRenderQuality: RuntimeActiveRenderQuality
}

/** Fresh plain values for an independent Runtime surface. Editor passes its original three proxies explicitly. */
export function createInitialRuntimeRenderingPolicyState(): RuntimeRenderingPolicyState {
 return {
  renderingSettings: normalizeRenderingSettings(DEFAULT_RENDERING_SETTINGS),
  activePostProcessing: structuredClone(DEFAULT_RENDERING_SETTINGS.postProcessing),
  activeRenderQuality: { preset: DEFAULT_RENDERING_SETTINGS.qualityPreset, maximumPixelRatio: DEFAULT_RENDERING_SETTINGS.maximumPixelRatio, particleBudget: DEFAULT_RENDERING_SETTINGS.particleBudget, shadowQuality: DEFAULT_RENDERING_SETTINGS.shadowQuality, volumeId: null }
 }
}

function createRenderingPolicyAlgorithms(state: RuntimeRenderingPolicyState) {
 const { renderingSettings, activePostProcessing, activeRenderQuality } = state

/* 计算表达式 first + (second - first) * amount 并返回结果，沿用操作数的原有类型规则。 */ function mix(first: number, second: number, amount: number): number { return first + (second - first) * amount }
/* 按受限权重插值后处理数值，并在中点切换用户材质。 */
function blendPost(first: PostProcessValues, second: PostProcessValues, amount: number): PostProcessValues {
  const factor = Math.min(1, Math.max(0, amount))
  return { exposure: mix(first.exposure, second.exposure, factor), contrast: mix(first.contrast, second.contrast, factor), saturation: mix(first.saturation, second.saturation, factor), vignette: mix(first.vignette, second.vignette, factor), bloom: mix(first.bloom, second.bloom, factor), blur: mix(first.blur, second.blur, factor), userMaterial: factor >= .5 ? second.userMaterial : first.userMaterial }
}

/* 按当前位置选取最高优先级有效体积并混合后处理参数，更新活动状态。 */
function updateActivePostProcess(position = { x: 0, y: 0 }): PostProcessValues {
  const settings = renderingSettings.postProcessing, preset = settings.presets.find(/* 比较 item.id 与 settings.activePreset，返回严格相等的判断结果。 */ item => item.id === settings.activePreset)
  let result = preset ? { ...preset.values } : postValues(settings)
  const candidates = settings.volumes.filter(/* 筛选已启用且引用现有后处理预设的体积。 */ volume => volume.enabled && settings.presets.some(/* 比较 item.id 与 volume.presetId，返回严格相等的判断结果。 */ item => item.id === volume.presetId)).sort(/* 先计算 b.priority - a.priority；仅当其为假值时求右侧 a.id.localeCompare(b.id)，返回短路求值结果。 */ (a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
  for (const volume of candidates) {
    const outsideX = Math.max(0, Math.abs(position.x - volume.center.x) - volume.size.x * .5), outsideY = Math.max(0, Math.abs(position.y - volume.center.y) - volume.size.y * .5), outside = Math.hypot(outsideX, outsideY)
    if (outside > volume.blendDistance) continue
    const weight = volume.blendDistance <= 0 ? 1 : 1 - outside / volume.blendDistance
    result = blendPost(result, settings.presets.find(/* 比较 item.id 与 volume.presetId，返回严格相等的判断结果。 */ item => item.id === volume.presetId)!.values, weight)
    break
  }
  // 26.46: values set or pulsed by scripts while playing go on top of the preset and volumes.
  Object.assign(activePostProcessing, applyScriptPostValues(postValues(result))); return activePostProcessing
}

/* 返回指定质量预设的像素比、粒子预算和阴影质量默认值。 */
function presetQuality(preset: RenderQualityPreset) {
  if (preset === 'Performance') return { maximumPixelRatio: 1, particleBudget: 2_500, shadowQuality: 'Off' as ShadowQuality }
  if (preset === 'High') return { maximumPixelRatio: 2, particleBudget: 25_000, shadowQuality: 'Soft' as ShadowQuality }
  if (preset === 'Ultra') return { maximumPixelRatio: 3, particleBudget: 50_000, shadowQuality: 'Ultra' as ShadowQuality }
  if (preset === 'PixelArt') return { maximumPixelRatio: 1, particleBudget: 10_000, shadowQuality: 'Hard' as ShadowQuality }
  return { maximumPixelRatio: 1.5, particleBudget: 10_000, shadowQuality: 'Soft' as ShadowQuality }
}

/* 按当前位置选取质量体积并应用其覆盖参数，更新活动渲染质量。 */
function updateActiveRenderQuality(position = { x: 0, y: 0 }) {
  const selected = renderingSettings.qualityVolumes.filter(/* 判断当前位置是否位于启用的质量体积内部。 */ volume => volume.enabled
    && Math.abs(position.x - volume.center.x) <= volume.size.x * .5
    && Math.abs(position.y - volume.center.y) <= volume.size.y * .5)
    .sort(/* 先计算 second.priority - first.priority；仅当其为假值时求右侧 first.id.localeCompare(second.id)，返回短路求值结果。 */ (first, second) => second.priority - first.priority || first.id.localeCompare(second.id))[0]
  const preset = selected?.preset ?? renderingSettings.qualityPreset
  const defaults = presetQuality(preset)
  Object.assign(activeRenderQuality, {
    preset,
    maximumPixelRatio: selected?.maximumPixelRatio ?? (selected ? defaults.maximumPixelRatio : renderingSettings.maximumPixelRatio),
    particleBudget: selected?.particleBudget ?? (selected ? defaults.particleBudget : renderingSettings.particleBudget),
    shadowQuality: selected?.shadowQuality ?? (selected ? defaults.shadowQuality : renderingSettings.shadowQuality),
    volumeId: selected?.id ?? null
  })
  return activeRenderQuality
}

/* 估算后处理通道数量和一千零八十行输出成本，并与项目 GPU 预算比较。 */
function estimatePostProcessCost(values: PostProcessValues = activePostProcessing) {
  const passes = 1 + (values.bloom > 0 ? 2 : 0) + (values.blur > 0 ? 2 : 0) + (values.userMaterial ? 1 : 0)
  const estimatedMsAt1080p = .08 + values.vignette * .03 + values.bloom * .32 + values.blur * .025 + (values.userMaterial ? .18 : 0)
  return { passes, estimatedMsAt1080p: Number(estimatedMsAt1080p.toFixed(3)), withinBudget: estimatedMsAt1080p <= renderingSettings.budgets.gpuMs * .35, recommendation: estimatedMsAt1080p <= renderingSettings.budgets.gpuMs * .35 ? 'Within the post-process budget.' : 'Reduce blur/bloom or switch to the Performance preset.' }
}

/* 载入归一化渲染设置并刷新活动后处理与质量状态。 */
function loadRenderingSettings(value: unknown): void { Object.assign(renderingSettings, normalizeRenderingSettings(value)); updateActivePostProcess(); updateActiveRenderQuality() }
/* 返回归一化渲染设置的可序列化深拷贝。 */
function serializeRenderingSettings(): RenderingSettings { return JSON.parse(JSON.stringify(normalizeRenderingSettings(renderingSettings))) as RenderingSettings }
/* 先计算 renderingSettings.lightingEnabled || renderingSettings.postProcessing.enabled；仅当其为假值时求右侧 renderingSettings.debugView !== 'None'，返回短路求值结果。 */ function advancedRenderingActive(): boolean {
  return renderingSettings.lightingEnabled || renderingSettings.postProcessing.enabled || renderingSettings.debugView !== 'None'
}

/* 应用质量预设对应的阴影、分辨率、粒子、流送和像素对齐设置。 */
function applyQualityPreset(preset: RenderQualityPreset): void {
  renderingSettings.qualityPreset = preset
  if (preset === 'Performance') { Object.assign(renderingSettings, { shadowQuality: 'Off', maximumPixelRatio: 1, particleBudget: 2_500, pixelSnap: false }); Object.assign(renderingSettings.textureStreaming, { enabled: true, memoryBudgetMb: 96, idleFrames: 180, uploadBudgetPerFrame: 6 }); Object.assign(renderingSettings.postProcessing, { enabled: false, bloom: 0, blur: 0 }) }
  else if (preset === 'Balanced') { Object.assign(renderingSettings, { shadowQuality: 'Soft', maximumPixelRatio: 1.5, particleBudget: 10_000, pixelSnap: false }); Object.assign(renderingSettings.textureStreaming, { enabled: true, memoryBudgetMb: 256, idleFrames: 600, uploadBudgetPerFrame: 16 }) }
  else if (preset === 'High') { Object.assign(renderingSettings, { shadowQuality: 'Soft', maximumPixelRatio: 2, particleBudget: 25_000, pixelSnap: false }); Object.assign(renderingSettings.textureStreaming, { enabled: true, memoryBudgetMb: 512, idleFrames: 1_200, uploadBudgetPerFrame: 32 }) }
  else if (preset === 'Ultra') { Object.assign(renderingSettings, { shadowQuality: 'Ultra', maximumPixelRatio: 3, particleBudget: 50_000, pixelSnap: false }); Object.assign(renderingSettings.textureStreaming, { enabled: true, memoryBudgetMb: GPU_TEXTURE_MEMORY_LIMIT_MB, idleFrames: 2_400, uploadBudgetPerFrame: 64 }) }
  else if (preset === 'PixelArt') { Object.assign(renderingSettings, { shadowQuality: 'Hard', maximumPixelRatio: 1, particleBudget: 10_000, pixelSnap: true, colorSpace: 'sRGB' }); Object.assign(renderingSettings.textureStreaming, { enabled: true, memoryBudgetMb: 192, idleFrames: 600, uploadBudgetPerFrame: 16 }) }
}

 return { updateActivePostProcess, updateActiveRenderQuality, estimatePostProcessCost, loadRenderingSettings, serializeRenderingSettings, advancedRenderingActive, applyQualityPreset }
}

/** One host captures one state view. No automatic preset selection or adaptive policy is installed. */
export class RuntimeRenderingPolicyOwner {
 private readonly implementation: ReturnType<typeof createRenderingPolicyAlgorithms>
 constructor(readonly state: RuntimeRenderingPolicyState = createInitialRuntimeRenderingPolicyState()) {
  if (!state || [state.renderingSettings, state.activePostProcessing, state.activeRenderQuality].some(value => !value || typeof value !== 'object')) throw new Error('RENDERING_POLICY_STATE_REQUIRED')
  this.implementation = createRenderingPolicyAlgorithms(state)
 }
 updateActivePostProcess(position = { x: 0, y: 0 }): PostProcessValues { return this.implementation.updateActivePostProcess(position) }
 updateActiveRenderQuality(position = { x: 0, y: 0 }): RuntimeActiveRenderQuality { return this.implementation.updateActiveRenderQuality(position) }
 estimatePostProcessCost(values: PostProcessValues = this.state.activePostProcessing) { return this.implementation.estimatePostProcessCost(values) }
 loadRenderingSettings(value: unknown): void { this.implementation.loadRenderingSettings(value) }
 serializeRenderingSettings(): RenderingSettings { return this.implementation.serializeRenderingSettings() }
 advancedRenderingActive(): boolean { return this.implementation.advancedRenderingActive() }
 /** User-requested quality change only. Frame updates never call this method. */
 applyQualityPreset(preset: RenderQualityPreset): void { this.implementation.applyQualityPreset(preset) }
}
