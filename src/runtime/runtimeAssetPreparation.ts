/** The actual shared complete AssetRecord restoration algorithm. This does not decode media or upload GPU resources. */
import { defaultAnimationImportMetadata, defaultImportSettings, defaultScriptMetadata } from './runtimeAssetRecordContracts'
import type { AssetRecord, AssetImportSettings, AssetType } from './runtimeAssetRecordContracts'
import { validateDerivedSprite } from './derivedSpriteMetadata'
import { validateInterchangeMetadata } from './contentInterchangeMetadata'
import { assetSourceBytes, sha256Bytes } from '../assets/contentHash'

export interface RuntimeAssetPreparationCapabilities { normalizeUuid(value: unknown): string }



/** 根据内联源真实字节生成摘要，并建立无需外部导入器的可复现流水线元信息。 */ export function inlinePipeline(source: string) {
  const hash = sha256Bytes(assetSourceBytes(source))
  return { importerId: 'nova.inline', importerVersion: '1.0.0', presetId: 'inline', platform: 'web' as const, sourceHash: hash, artifactHash: hash, contentHash: hash, cacheKey: hash, status: 'ready' as const, lastValidSource: source, error: '', dependencies: [] as string[], reverseDependencies: [] as string[], cacheHit: false, settingsHash: hash, artifactSettingsHash: hash, invalidationReason: 'Inline asset', sourceSettings: '{}', artifactSettings: '{}', diagnostics: [] as Array<{ severity: 'info' | 'warning' | 'error'; code: string; message: string }>, reproducible: true, deprecatedSettings: [] as string[] }
}


/** 为每个受支持资源类型选择默认项目目录。 */ export function defaultFolder(type: AssetType): string {
  if (type === 'image') return 'Assets/Sprites'
  if (type === 'audio') return 'Assets/Audio'
  if (type === 'font') return 'Assets/Fonts'
  if (type === 'scene') return 'Assets/Scenes'
  if (type === 'prefab') return 'Assets/Prefabs'
  if (type === 'script') return 'Assets/Scripts'
  if (type === 'visualScript') return 'Assets/Visual Scripts'
  if (type === 'eventSheet') return 'Assets/Event Sheets'
  if (type === 'objectBlueprint') return 'Assets/Object Blueprints'
  if (type === 'material') return 'Assets/Materials'
  if (type === 'animation') return 'Assets/Animations'
  if (type === 'controller') return 'Assets/Controllers'
  if (type === 'animationMask') return 'Assets/AnimationMasks'
  if (type === 'rig') return 'Assets/Rigs'
  if (type === 'skin') return 'Assets/Skins'
  if (type === 'timeline') return 'Assets/Timelines'
  if (type === 'dataSchema') return 'Assets/Data/Schemas'
  if (type === 'dataTable') return 'Assets/Data/Tables'
  if (type === 'replay') return 'Assets/Replays'
  if (type === 'path') return 'Assets/Paths'
  if (type === 'particleSystem') return 'Assets/Particles'
  if (type === 'chart') return 'Assets/Charts'
  if (type === 'resource') return 'Assets/Resources'
  if (type === 'behaviorTree' || type === 'stateMachine') return 'Assets/AI'
  if (type === 'tilePalette') return 'Assets/TilePalettes'
  if (type === 'brushPreset') return 'Assets/BrushPresets'
  if (type === 'terrainRules') return 'Assets/TerrainRules'
  if (type === 'tileset') return 'Assets/TileSets'
  if (type === 'atlas') return 'Assets/Atlases'
  if (type === 'shader') return 'Assets/Shaders'
  if (type === 'localization') return 'Assets/Localization'
  if (type === 'uiTheme') return 'Assets/UI Themes'
  return 'Assets'
}


/* 先计算 value.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 120)；仅当其为假值时求右侧 'Untitled asset'，返回短路求值结果。 */ export function sanitizedName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 120) || 'Untitled asset'
}


/** 清理目录和文件名后检查不区分大小写的冲突，保留扩展名递增后缀直到路径可用。 */ export function uniqueAssetPath(records: readonly AssetRecord[], folder: string, name: string, ignoreGuid?: string): string {
  const normalizedFolder = normalizeFolder(folder)
  const stem = sanitizedName(name)
  let candidate = `${normalizedFolder}/${stem}`
  let suffix = 2
  while (records.some(/* 先计算 record.uuid !== ignoreGuid；仅当其为真值时求右侧 record.path.toLowerCase() === candidate.toLowerCase()，返回短路求值结果。 */ record => record.uuid !== ignoreGuid && record.path.toLowerCase() === candidate.toLowerCase())) {
    const dot = stem.lastIndexOf('.')
    candidate = dot > 0
      ? `${normalizedFolder}/${stem.slice(0, dot)} ${suffix}${stem.slice(dot)}`
      : `${normalizedFolder}/${stem} ${suffix}`
    suffix++
  }
  return candidate
}


/** 统一分隔符并移除点目录，按现有规则保留隐藏或项目设置目录，其他补充 Assets 前缀。 */ export function normalizeFolder(value: string): string {
  const clean = value.replace(/\\/g, '/').split('/').filter(/* 先计算 part && part !== '.'；仅当其为真值时求右侧 part !== '..'，返回短路求值结果。 */ part => part && part !== '.' && part !== '..').join('/')
  return clean.startsWith('.') ? clean : clean.startsWith('Assets') || clean === 'ProjectSettings' ? clean : `Assets/${clean}`
}


/** 按模板 `NovaAsset_${uuid.replace(/-/g, '')}` 生成并返回字符串。 */ export function fontFamilyFor(uuid: string): string { return `NovaAsset_${uuid.replace(/-/g, '')}` }


/** 从资源路径提取规范目录，无有效父目录时使用类型默认目录。 */ export function sourceFolder(path: unknown, type: AssetType): string {
  if (typeof path !== 'string') return defaultFolder(type)
  const separator = path.replace(/\\/g, '/').lastIndexOf('/')
  return separator > 0 ? normalizeFolder(path.slice(0, separator)) : defaultFolder(type)
}


/** 将有效输入转换为有限数值，空值、布尔及非法数值使用默认值。 */ export function finiteAssetSetting(value: unknown, fallback: number): number {
  if (value == null || value === '' || typeof value === 'boolean') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function preflightPersistedAssetRecords(source: unknown): void {

  for (const raw of Array.isArray(source) ? source : []) if (raw && typeof raw === 'object' && raw.derivedSprite !== undefined) { if (raw.assetType !== 'image') throw new Error('SPRITE_DERIVATION: Only image assets may carry derived sprite metadata.'); validateDerivedSprite(raw.derivedSprite) }
}

/** Explicit target preserves the Editor's original incremental push/error observation order. */
export function appendNormalizedAssetRecords(source: unknown, target: AssetRecord[], supplied: RuntimeAssetPreparationCapabilities): void {
  if (!supplied || typeof supplied.normalizeUuid !== 'function' || !Array.isArray(target)) throw new Error('RUNTIME_ASSET_PREPARATION_REQUIRED: Supply the actual UUID capability and owned target records.')
  const capabilities = { normalizeUuid: supplied.normalizeUuid.bind(supplied) }

  const records = Array.isArray(source) ? source : []
  for (const value of records) {
    if (!value || typeof value !== 'object') continue
    const item = value as Partial<AssetRecord>
    const knownFields = new Set(['uuid', 'name', 'path', 'assetType', 'mimeType', 'byteLength', 'source', 'sourceModified', 'importedAt', 'width', 'height', 'duration', 'fontFamily', 'settings', 'script', 'animationImport', 'interchange', 'derivedSprite', 'pipeline', 'tags', 'collectionIds', 'contentGroup', 'editorOnly', 'sourceControlStatus', 'thumbnailKey', 'unknownFields'])
    const inheritedUnknown = item.unknownFields && typeof item.unknownFields === 'object' ? item.unknownFields : {}
    const unknownFields = { ...inheritedUnknown, ...Object.fromEntries(Object.entries(value).filter(/* 返回 knownFields.has(key) 的逻辑取反结果。 */ ([key]) => !knownFields.has(key))) }
    const assetType = ['image', 'audio', 'font', 'scene', 'prefab', 'script', 'material', 'animation', 'controller', 'animationMask', 'rig', 'skin', 'timeline', 'tileset', 'atlas', 'shader', 'localization', 'uiTheme', 'behaviorTree', 'stateMachine', 'tilePalette', 'brushPreset', 'terrainRules', 'dataSchema', 'dataTable', 'replay', 'path', 'particleSystem', 'visualScript', 'eventSheet', 'objectBlueprint', 'other', 'resource', 'chart'].includes(String(item.assetType)) ? item.assetType as AssetType : 'other'
    const uuid = capabilities.normalizeUuid(item.uuid)
    const defaults = defaultImportSettings()
    const settings: AssetImportSettings = {
      ...defaults,
      ...(item.settings ?? {}),
      atlasSettings: { ...defaults.atlasSettings, ...(item.settings?.atlasSettings ?? {}) },
      spriteSheet: { ...defaults.spriteSheet, ...(item.settings?.spriteSheet ?? {}) },
      borders: { ...defaults.borders, ...(item.settings?.borders ?? {}) },
      platformOverrides: { ...defaults.platformOverrides, ...(item.settings?.platformOverrides ?? {}) },
      collisionGeneration: { ...defaults.collisionGeneration, ...(item.settings?.collisionGeneration ?? {}) },
      svgSettings: { ...defaults.svgSettings, ...(item.settings?.svgSettings ?? {}) },
      audioSettings: { ...defaults.audioSettings, ...(item.settings?.audioSettings ?? {}) },
      fontSettings: { ...defaults.fontSettings, ...(item.settings?.fontSettings ?? {}) },
      tileSettings: { ...defaults.tileSettings, ...(item.settings?.tileSettings ?? {}) },
      scriptSettings: { ...defaults.scriptSettings, ...(item.settings?.scriptSettings ?? {}) },
      shaderSettings: { ...defaults.shaderSettings, ...(item.settings?.shaderSettings ?? {}) },
      localizationSettings: { ...defaults.localizationSettings, ...(item.settings?.localizationSettings ?? {}) }
    }
    settings.audioSettings.normalizationGain = Math.min(16, Math.max(.01, Number(settings.audioSettings.normalizationGain) || 1))
    settings.textureProfile = ['General', 'PixelArt', 'UI', 'NormalMap'].includes(String(settings.textureProfile)) ? settings.textureProfile : 'General'
    settings.audioSettings.profile = ['SoundEffect', 'Music', 'Voice', 'Streaming'].includes(String(settings.audioSettings.profile)) ? settings.audioSettings.profile : 'SoundEffect'
    settings.audioSettings.codec = ['Original', 'PCM', 'Vorbis', 'MP3'].includes(String(settings.audioSettings.codec)) ? settings.audioSettings.codec : 'Original'
    settings.audioSettings.quality = Math.min(1, Math.max(0, finiteAssetSetting(settings.audioSettings.quality, .8)))
    settings.audioSettings.trimStart = Math.max(0, Number(settings.audioSettings.trimStart) || 0)
    settings.audioSettings.trimEnd = Math.max(0, Number(settings.audioSettings.trimEnd) || 0)
    settings.audioSettings.preload = ['Preload', 'Metadata', 'None'].includes(String(settings.audioSettings.preload)) ? settings.audioSettings.preload : 'Auto'
    settings.fontSettings.renderMode = settings.fontSettings.renderMode === 'Bitmap' ? 'Bitmap' : 'Scalable'
    settings.fontSettings.fallbackFamilies = Array.isArray(settings.fontSettings.fallbackFamilies) ? settings.fontSettings.fallbackFamilies.map(String).map(/* 调用 value.trim() 并返回调用结果。 */ value => value.trim()).filter(Boolean).slice(0, 16) : defaults.fontSettings.fallbackFamilies
    settings.fontSettings.bitmapSize = Math.min(512, Math.max(6, Math.round(Number(settings.fontSettings.bitmapSize) || 32)))
    settings.fontSettings.outlineWidth = Math.min(32, Math.max(0, Number(settings.fontSettings.outlineWidth) || 0))
    settings.fontSettings.shaping = settings.fontSettings.shaping !== false
    settings.fontSettings.fallbackAssetUuids = Array.isArray(settings.fontSettings.fallbackAssetUuids) ? [...new Set(settings.fontSettings.fallbackAssetUuids.map(String))].slice(0, 32) : []
    settings.fontSettings.openTypeFeatures = Array.isArray(settings.fontSettings.openTypeFeatures) ? [...new Set(settings.fontSettings.openTypeFeatures.map(String).filter(/* 调用 /^[a-z0-9]{4}$/i.test(value) 并返回调用结果。 */ value => /^[a-z0-9]{4}$/i.test(value)))].slice(0, 64) : defaults.fontSettings.openTypeFeatures
    settings.fontSettings.hinting = ['Auto', 'None', 'Light', 'Full'].includes(String(settings.fontSettings.hinting)) ? settings.fontSettings.hinting : 'Auto'
    settings.fontSettings.oversampling = Math.min(8, Math.max(1, Number(settings.fontSettings.oversampling) || 1))
    settings.fontSettings.distanceField = ['SDF', 'MSDF'].includes(String(settings.fontSettings.distanceField)) ? settings.fontSettings.distanceField : 'None'
    settings.fontSettings.distanceRange = Math.min(64, Math.max(1, Number(settings.fontSettings.distanceRange) || 8))
    settings.fontSettings.declaredLanguages = Array.isArray(settings.fontSettings.declaredLanguages) ? [...new Set(settings.fontSettings.declaredLanguages.map(String).map(/* 调用 value.trim() 并返回调用结果。 */ value => value.trim()).filter(Boolean))].slice(0, 32) : ['en']
    settings.fontSettings.editorFont = settings.fontSettings.editorFont === true
    settings.spriteSheet.columns = Math.min(256, Math.max(1, Math.trunc(Number(settings.spriteSheet.columns) || 1)))
    settings.spriteSheet.rows = Math.min(256, Math.max(1, Math.trunc(Number(settings.spriteSheet.rows) || 1)))
    settings.spriteSheet.margin = Math.max(0, Math.trunc(Number(settings.spriteSheet.margin) || 0))
    settings.spriteSheet.spacing = Math.max(0, Math.trunc(Number(settings.spriteSheet.spacing) || 0))
    for (const side of ['left', 'top', 'right', 'bottom'] as const) settings.borders[side] = Math.max(0, Number(settings.borders[side]) || 0)
    settings.audioSettings.targetPeakDb = Math.min(0, Math.max(-24, finiteAssetSetting(settings.audioSettings.targetPeakDb, -1)))
    settings.audioSettings.loopStart = Math.max(0, Number(settings.audioSettings.loopStart) || 0)
    settings.audioSettings.loopEnd = Math.max(0, Number(settings.audioSettings.loopEnd) || 0)
    settings.audioSettings.loopRegions = (Array.isArray(settings.audioSettings.loopRegions) ? settings.audioSettings.loopRegions : []).slice(0, 64).map(/** 清理音频循环区身份、名称及非负起止时间，后续筛除空区间。 */ (region, index) => ({
      id: String(region?.id || `loop-${index + 1}`).replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 80), name: String(region?.name || `Loop ${index + 1}`).slice(0, 80),
      start: Math.max(0, Number(region?.start) || 0), end: Math.max(0, Number(region?.end) || 0)
    })).filter(/* 比较 region.end 与 region.start，返回大于的判断结果。 */ region => region.end > region.start)
    settings.audioSettings.activeLoopRegion = typeof settings.audioSettings.activeLoopRegion === 'string' && settings.audioSettings.loopRegions.some(/* 比较 region.id 与 settings.audioSettings.activeLoopRegion，返回严格相等的判断结果。 */ region => region.id === settings.audioSettings.activeLoopRegion) ? settings.audioSettings.activeLoopRegion : null
    settings.colorSpace = settings.colorSpace === 'Linear' ? 'Linear' : 'sRGB'
    settings.generateMipmaps = settings.generateMipmaps === true
    settings.transparency = ['Premultiply', 'Discard'].includes(String(settings.transparency)) ? settings.transparency : 'Preserve'
    settings.atlasSettings.rotationPolicy = settings.atlasSettings.rotationPolicy === 'Allow' ? 'Allow' : 'Never'
    settings.atlasSettings.trimPolicy = settings.atlasSettings.trimPolicy === 'None' ? 'None' : 'Transparent'
    settings.atlasSettings.group = String(settings.atlasSettings.group || 'Default').trim().slice(0, 80) || 'Default'
    settings.polygonOutline = Array.isArray(settings.polygonOutline) ? settings.polygonOutline.flatMap(/** 将多边形点规范为非负二维坐标，跳过非对象项。 */ point => point && typeof point === 'object' ? [{ x: Math.max(0, Number(point.x) || 0), y: Math.max(0, Number(point.y) || 0) }] : []).slice(0, 1024) : []
    settings.collisionGeneration.mode = ['Box', 'Polygon'].includes(String(settings.collisionGeneration.mode)) ? settings.collisionGeneration.mode : 'None'
    settings.collisionGeneration.tolerance = Math.min(64, Math.max(.01, Number(settings.collisionGeneration.tolerance) || 1))
    settings.extractedAnimationFrames = Array.isArray(settings.extractedAnimationFrames) ? settings.extractedAnimationFrames.flatMap(/** 将提取帧规范为非负起点和至少一像素宽高，跳过非对象项。 */ frame => frame && typeof frame === 'object' ? [{ x: Math.max(0, Number(frame.x) || 0), y: Math.max(0, Number(frame.y) || 0), width: Math.max(1, Number(frame.width) || 1), height: Math.max(1, Number(frame.height) || 1) }] : []).slice(0, 4096) : []
    settings.svgSettings.rasterization = ['Runtime', 'Disabled'].includes(String(settings.svgSettings.rasterization)) ? settings.svgSettings.rasterization : 'ImportTime'
    settings.svgSettings.scale = Math.min(16, Math.max(.01, Number(settings.svgSettings.scale) || 1)); settings.svgSettings.allowExternalResources = settings.svgSettings.allowExternalResources === true
    const variants = settings.platformVariants && typeof settings.platformVariants === 'object' ? settings.platformVariants : {}
    settings.platformVariants = Object.fromEntries(Object.entries(variants).filter(/** 只保留支持的平台及压缩模式覆盖配置。 */ ([platform, compression]) => ['windows', 'linux', 'macos', 'web'].includes(platform) && ['None', 'Lossless', 'Optimized'].includes(String(compression)))) as AssetImportSettings['platformVariants']
    settings.pixelsPerUnit = Math.min(1_000_000, Math.max(.000001, Number(settings.pixelsPerUnit) || 100))
    settings.pivot = {
      x: Math.min(1, Math.max(0, Number(settings.pivot?.x) || 0)),
      y: Math.min(1, Math.max(0, Number(settings.pivot?.y) || 0))
    }
    const rawRegion = settings.spriteRegion
    settings.spriteRegion = rawRegion && typeof rawRegion === 'object' ? {
      x: Math.max(0, Number(rawRegion.x) || 0), y: Math.max(0, Number(rawRegion.y) || 0),
      width: Math.max(1, Number(rawRegion.width) || 1), height: Math.max(1, Number(rawRegion.height) || 1)
    } : null
    target.push({
      uuid, name: sanitizedName(item.name || item.path?.split('/').pop() || 'Asset'),
      // 显示名可能相同；保存路径中的消歧后缀属于身份，重新打开时不得按显示名重新分配。
      path: uniqueAssetPath(target, sourceFolder(item.path, assetType), (typeof item.path === 'string' ? item.path.replace(/\\/g, '/').split('/').pop() : '') || item.name || 'Asset', uuid),
      assetType, mimeType: String(item.mimeType || 'application/octet-stream'), byteLength: Math.max(0, Number(item.byteLength) || 0),
      source: typeof item.source === 'string' ? item.source : '', sourceModified: Number(item.sourceModified) || 0,
      importedAt: Number(item.importedAt) || 0, width: Math.max(0, Number(item.width) || 0), height: Math.max(0, Number(item.height) || 0),
      duration: Math.max(0, Number(item.duration) || 0), fontFamily: item.fontFamily || (assetType === 'font' ? fontFamilyFor(uuid) : ''), settings,
      script: assetType === 'script' ? {
        ...defaultScriptMetadata(),
        ...(item.script ?? {}),
        version: 2,
        apiVersion: item.script?.apiVersion === undefined || Number(item.script.apiVersion) === 1 ? 1 : 2,
        breakpoints: Array.isArray(item.script?.breakpoints) ? [...new Set(item.script.breakpoints.map(Number).filter(/* 先计算 Number.isInteger(value)；仅当其为真值时求右侧 value > 0，返回短路求值结果。 */ value => Number.isInteger(value) && value > 0))].slice(0, 1000) : [],
        breakpointDetails: Array.isArray(item.script?.breakpointDetails) ? item.script.breakpointDetails.flatMap(/** 校验断点行号并限制身份、条件、日志、计数和分组字段。 */ (point, index) => {
          if (!point || typeof point !== 'object') return []
          const line = Math.round(Number(point.line))
          if (!Number.isFinite(line) || line < 1 || line > 1_000_000) return []
          return [{
            id: String(point.id || `breakpoint-${line}-${index}`).slice(0, 128), line,
            functionName: String(point.functionName || '').slice(0, 80), condition: String(point.condition || '').slice(0, 512),
            hitCondition: Math.min(1_000_000, Math.max(0, Math.round(Number(point.hitCondition) || 0))),
            logMessage: String(point.logMessage || '').slice(0, 1_024), enabled: point.enabled !== false,
            hitCount: Math.min(1_000_000_000, Math.max(0, Math.round(Number(point.hitCount) || 0))),
            group: String(point.group || 'Default').trim().slice(0, 80) || 'Default'
          }]
        }).slice(0, 1000) : [],
        tests: Array.isArray(item.script?.tests) ? item.script.tests.filter(/* 比较 typeof value 与 'string'，返回严格相等的判断结果。 */ value => typeof value === 'string').map(/* 调用 value.slice(0, 80) 并返回调用结果。 */ value => value.slice(0, 80)).slice(0, 256) : [],
        packageDependencies: Array.isArray(item.script?.packageDependencies) ? item.script.packageDependencies.filter(/* 比较 typeof value 与 'string'，返回严格相等的判断结果。 */ value => typeof value === 'string').map(/* 调用 value.slice(0, 256) 并返回调用结果。 */ value => value.slice(0, 256)).slice(0, 128) : [],
        packageName: String(item.script?.packageName || '').slice(0, 128),
        reloadPolicy: ['preserve', 'recreate', 'disabled'].includes(String(item.script?.reloadPolicy)) ? item.script!.reloadPolicy : 'preserve',
        signalConnections: Array.isArray(item.script?.signalConnections) ? item.script.signalConnections.flatMap(/** 保留非空信号及回调连接，限制来源目标字段并规范启用状态。 */ connection => {
          if (!connection || typeof connection !== 'object') return []
          const signal = String(connection.signal || '').trim().slice(0, 128), callback = String(connection.callback || '').trim().slice(0, 80)
          return signal && callback ? [{ signal, callback, source: String(connection.source || '').slice(0, 128), target: String(connection.target || '').slice(0, 128), enabled: connection.enabled !== false }] : []
        }).slice(0, 512) : [],
        recoverySource: String(item.script?.recoverySource || '').slice(0, 1_000_000),
        linkedGraphUuid: String(item.script?.linkedGraphUuid || '').toLowerCase().slice(0, 128),
        lastSavedHash: String(item.script?.lastSavedHash || '').slice(0, 128)
      } : undefined,
      animationImport: assetType === 'animation' ? {
        ...defaultAnimationImportMetadata(),
        ...(item.animationImport ?? {}),
        sourceAsset: typeof item.animationImport?.sourceAsset === 'string' ? item.animationImport.sourceAsset : null,
        sourceFrameRate: Math.min(240, Math.max(1, Number(item.animationImport?.sourceFrameRate) || 60)),
        sampleRate: Math.min(240, Math.max(1, Number(item.animationImport?.sampleRate) || 60)),
        compressionTolerance: Math.min(1e6, Math.max(0, Number(item.animationImport?.compressionTolerance) || .0001)),
        preserveEvents: item.animationImport?.preserveEvents !== false,
        trackMappings: Array.isArray(item.animationImport?.trackMappings) ? item.animationImport.trackMappings.flatMap(/** 只保留有字符串源目标的动画轨道映射并限制长度。 */ mapping => {
          if (!mapping || typeof mapping.source !== 'string' || typeof mapping.target !== 'string') return []
          return [{ source: mapping.source.slice(0, 256), target: mapping.target.slice(0, 256) }]
        }).slice(0, 512) : [],
        lastImportedAt: Math.max(0, Number(item.animationImport?.lastImportedAt) || 0)
      } : undefined,
      interchange: validateInterchangeMetadata(item.interchange) ?? undefined,
      derivedSprite: validateDerivedSprite(item.derivedSprite),
      pipeline: item.pipeline && typeof item.pipeline === 'object' ? {
        importerId: String(item.pipeline.importerId || 'nova.legacy').slice(0, 80),
        importerVersion: String(item.pipeline.importerVersion || '1.0.0').slice(0, 40),
        presetId: String(item.pipeline.presetId || 'legacy').slice(0, 80),
        platform: ['windows', 'linux', 'macos', 'web'].includes(String(item.pipeline.platform)) ? item.pipeline.platform : 'web',
        sourceHash: String(item.pipeline.sourceHash || item.pipeline.contentHash || '').slice(0, 128), artifactHash: String(item.pipeline.artifactHash || item.pipeline.cacheKey || '').slice(0, 128),
        contentHash: String(item.pipeline.contentHash || item.pipeline.sourceHash || '').slice(0, 128), cacheKey: String(item.pipeline.cacheKey || item.pipeline.artifactHash || '').slice(0, 128),
        status: item.pipeline.status === 'failed' ? 'failed' : 'ready', lastValidSource: typeof item.pipeline.lastValidSource === 'string' ? item.pipeline.lastValidSource : (typeof item.source === 'string' ? item.source : ''),
        error: String(item.pipeline.error || '').slice(0, 500), dependencies: Array.isArray(item.pipeline.dependencies) ? item.pipeline.dependencies.filter(/* 比较 typeof value 与 'string'，返回严格相等的判断结果。 */ value => typeof value === 'string').slice(0, 2048) : [],
        reverseDependencies: Array.isArray(item.pipeline.reverseDependencies) ? item.pipeline.reverseDependencies.filter(/* 比较 typeof value 与 'string'，返回严格相等的判断结果。 */ value => typeof value === 'string').slice(0, 2048) : [],
        cacheHit: item.pipeline.cacheHit === true,
        settingsHash: String(item.pipeline.settingsHash || item.pipeline.cacheKey || '').slice(0, 128), artifactSettingsHash: String(item.pipeline.artifactSettingsHash || item.pipeline.cacheKey || '').slice(0, 128),
        invalidationReason: String(item.pipeline.invalidationReason || 'Legacy metadata upgraded').slice(0, 500), sourceSettings: String(item.pipeline.sourceSettings || '{}').slice(0, 100_000), artifactSettings: String(item.pipeline.artifactSettings || '{}').slice(0, 100_000),
        diagnostics: Array.isArray(item.pipeline.diagnostics) ? item.pipeline.diagnostics.flatMap(/** 规范化导入诊断严重性和有界消息，丢弃非对象项。 */ diagnostic => diagnostic && typeof diagnostic === 'object' ? [{ severity: ['warning','error'].includes(String(diagnostic.severity)) ? diagnostic.severity as 'warning'|'error' : 'info' as const, code: String(diagnostic.code || 'IMPORT').slice(0, 80), message: String(diagnostic.message || '').slice(0, 1000) }] : []).slice(0, 256) : [],
        reproducible: item.pipeline.reproducible !== false, deprecatedSettings: Array.isArray(item.pipeline.deprecatedSettings) ? item.pipeline.deprecatedSettings.map(String).slice(0, 128) : []
      } : inlinePipeline(typeof item.source === 'string' ? item.source : ''),
      tags: Array.isArray(item.tags) ? [...new Set(item.tags.map(String).map(/* 调用 tag.trim() 并返回调用结果。 */ tag => tag.trim()).filter(Boolean))].slice(0, 64) : [], collectionIds: Array.isArray(item.collectionIds) ? [...new Set(item.collectionIds.map(String))].slice(0, 64) : [],
      contentGroup: String(item.contentGroup || 'main').slice(0, 80), editorOnly: item.editorOnly === true, sourceControlStatus: ['clean','added','modified','conflict','untracked'].includes(String(item.sourceControlStatus)) ? item.sourceControlStatus : 'clean', thumbnailKey: String(item.thumbnailKey || '').slice(0, 128),
      unknownFields: Object.keys(unknownFields).length ? unknownFields : undefined
    })
  }
}

export function restoreDerivedAssetSize(record: AssetRecord): void { if (record.derivedSprite) { record.width = record.derivedSprite.sourceSize.width; record.height = record.derivedSprite.sourceSize.height } }

/** Detached preparation. Editor still owns session/cache/font/atlas publication and rollback. */
export function prepareRuntimeAssetRecords(source: unknown, capabilities: RuntimeAssetPreparationCapabilities): AssetRecord[] {
  preflightPersistedAssetRecords(source)
  const records: AssetRecord[] = []
  appendNormalizedAssetRecords(source, records, capabilities)
  records.forEach(restoreDerivedAssetSize)
  return records
}
