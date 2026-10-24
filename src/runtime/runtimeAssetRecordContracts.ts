/** Shared persisted resource contracts; no renderer/importer/Editor type bucket. */
import type { ContentInterchangeMetadata } from './contentInterchangeMetadata'


export type TextureFilter = 'Nearest' | 'Linear'
/** 资源持久化类型：声明资源记录、导入元数据与配置结构，并提供各类型默认设置。 */

export type AssetType =
  | 'image' | 'audio' | 'font' | 'scene' | 'prefab' | 'script' | 'material'
  | 'animation' | 'controller' | 'animationMask' | 'rig' | 'skin' | 'timeline'
  | 'tileset' | 'atlas' | 'shader' | 'localization' | 'uiTheme' | 'other'
  | 'behaviorTree' | 'stateMachine' | 'tilePalette' | 'brushPreset' | 'terrainRules'
  | 'dataSchema' | 'dataTable' | 'replay' | 'path'
  | 'particleSystem' | 'visualScript' | 'eventSheet' | 'objectBlueprint'
  | 'resource' | 'video' | 'chart'
export type TextAssetType = Extract<AssetType, 'script' | 'visualScript' | 'eventSheet' | 'objectBlueprint' | 'prefab' | 'scene' | 'material' | 'animation' | 'controller' | 'animationMask' | 'rig' | 'skin' | 'timeline' | 'tileset' | 'atlas' | 'shader' | 'localization' | 'uiTheme' | 'behaviorTree' | 'stateMachine' | 'tilePalette' | 'brushPreset' | 'terrainRules' | 'dataSchema' | 'dataTable' | 'replay' | 'path' | 'particleSystem' | 'resource' | 'chart' | 'other'>
export type AssetCompression = 'None' | 'Lossless' | 'Optimized'
export type TextureImportProfile = 'General' | 'PixelArt' | 'UI' | 'NormalMap'
export type AudioImportProfile = 'SoundEffect' | 'Music' | 'Voice' | 'Streaming'
export type AudioCodecProfile = 'Original' | 'PCM' | 'Vorbis' | 'MP3'
export interface AudioLoopRegion { id: string; name: string; start: number; end: number }
export type FontRenderMode = 'Scalable' | 'Bitmap'
export type FontDistanceFieldMode = 'None' | 'SDF' | 'MSDF'
export type AssetSourceControlStatus = 'clean' | 'added' | 'modified' | 'conflict' | 'untracked'
export type AssetContentMode = 'embedded' | 'downloadable' | 'excluded'

export interface AssetPlatformOverride {
  enabled: boolean
  compression: AssetCompression
  maxSize: number
  format: 'Auto' | 'RGBA8' | 'BC7' | 'ASTC' | 'ETC2'
}

export interface SpriteRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface AssetImportSettings {
  textureProfile: TextureImportProfile
  filterMode: TextureFilter
  compression: AssetCompression
  pixelsPerUnit: number
  spriteRegion: SpriteRegion | null
  pivot: { x: number; y: number }
  atlas: boolean
  colorSpace: 'sRGB' | 'Linear'
  generateMipmaps: boolean
  transparency: 'Preserve' | 'Premultiply' | 'Discard'
  platformVariants: Partial<Record<'windows' | 'linux' | 'macos' | 'web', AssetCompression>>
  platformOverrides: Partial<Record<'windows' | 'linux' | 'macos' | 'web', AssetPlatformOverride>>
  atlasSettings: { maxSize: number; padding: number; trim: boolean; rotationPolicy: 'Never' | 'Allow'; trimPolicy: 'None' | 'Transparent'; group: string }
  spriteSheet: { enabled: boolean; columns: number; rows: number; margin: number; spacing: number }
  transparentTrim: boolean
  borders: { left: number; top: number; right: number; bottom: number }
  polygonOutline: Array<{ x: number; y: number }>
  collisionGeneration: { mode: 'None' | 'Box' | 'Polygon'; tolerance: number }
  extractedAnimationFrames: SpriteRegion[]
  svgSettings: { rasterization: 'ImportTime' | 'Runtime' | 'Disabled'; scale: number; allowExternalResources: boolean }
  audioSettings: { profile: AudioImportProfile; codec: AudioCodecProfile; quality: number; trimStart: number; trimEnd: number; normalize: boolean; normalizationGain: number; targetPeakDb: number; streaming: boolean; preload: 'Auto' | 'Preload' | 'Metadata' | 'None'; sampleRate: number; loopStart: number; loopEnd: number; loopRegions: AudioLoopRegion[]; activeLoopRegion: string | null }
  fontSettings: { renderMode: FontRenderMode; fallbackFamilies: string[]; fallbackAssetUuids: string[]; bitmapSize: number; outlineWidth: number; shaping: boolean; openTypeFeatures: string[]; hinting: 'Auto' | 'None' | 'Light' | 'Full'; oversampling: number; distanceField: FontDistanceFieldMode; distanceRange: number; declaredLanguages: string[]; editorFont: boolean }
  tileSettings: { tileWidth: number; tileHeight: number; margin: number; spacing: number }
  scriptSettings: { encoding: 'utf-8'; module: boolean }
  shaderSettings: { stage: 'fragment' | 'vertex'; entry: string }
  localizationSettings: { locale: string; fallbackLocale: string }
}

export interface AssetPipelineMetadata {
  importerId: string
  importerVersion: string
  presetId: string
  platform: 'windows' | 'linux' | 'macos' | 'web'
  sourceHash: string
  artifactHash: string
  contentHash: string
  cacheKey: string
  status: 'ready' | 'failed'
  lastValidSource: string
  error: string
  dependencies: string[]
  reverseDependencies: string[]
  cacheHit: boolean
  settingsHash: string
  artifactSettingsHash: string
  invalidationReason: string
  sourceSettings: string
  artifactSettings: string
  diagnostics: Array<{ severity: 'info' | 'warning' | 'error'; code: string; message: string }>
  reproducible: boolean
  deprecatedSettings: string[]
}

export interface AssetSavedFilter {
  id: string
  name: string
  query: string
  folder: string
  assetType: AssetType | 'all'
  tags: string[]
  collectionId: string
}

export interface AssetCollection { id: string; name: string; color: string; assetUuids: string[] }
export interface AssetContentGroup { id: string; name: string; mode: AssetContentMode; optional: boolean }

export interface AssetImportPreset {
  id: string
  name: string
  assetType: AssetType | 'all'
  settings: AssetImportSettings
}

export interface AssetDatabaseSettings {
  version: 2
  favorites: string[]
  savedFilters: AssetSavedFilter[]
  importPresets: AssetImportPreset[]
  collections: AssetCollection[]
  contentGroups: AssetContentGroup[]
  viewMode: 'grid' | 'list'
  thumbnailSize: number
}

export interface ScriptAssetMetadata {
  version: 2
  apiVersion: 1 | 2
  breakpoints: number[]
  breakpointDetails: ScriptBreakpointMetadata[]
  tests: string[]
  packageDependencies: string[]
  packageName: string
  reloadPolicy: 'preserve' | 'recreate' | 'disabled'
  signalConnections: ScriptSignalConnection[]
  recoverySource: string
  lastSavedHash: string
  /** Visual graph UUID when this Rhai asset is a synchronized code projection. */
  linkedGraphUuid: string
}

export interface ScriptBreakpointMetadata {
  id: string
  line: number
  functionName: string
  condition: string
  hitCondition: number
  logMessage: string
  enabled: boolean
  hitCount: number
  group?: string
}

export interface ScriptSignalConnection {
  signal: string
  source: string
  target: string
  callback: string
  enabled: boolean
}

export interface AnimationImportMetadata {
  version: 2
  sourceAsset: string | null
  sourceFrameRate: number
  sampleRate: number
  trackMappings: Array<{ source: string; target: string }>
  compressionTolerance: number
  preserveEvents: boolean
  lastImportedAt: number
}

export interface AssetRecord {
  /** Stable source frame; derived images share the owner's source pixels. */
  derivedSprite?: import('./derivedSpriteMetadata').DerivedSprite
  uuid: string
  name: string
  path: string
  assetType: AssetType
  mimeType: string
  byteLength: number
  source: string
  sourceModified: number
  importedAt: number
  width: number
  height: number
  duration: number
  fontFamily: string
  settings: AssetImportSettings
  script?: ScriptAssetMetadata
  animationImport?: AnimationImportMetadata
  /** Optional external-content identity; absent on native/legacy assets. */
  interchange?: ContentInterchangeMetadata
  pipeline?: AssetPipelineMetadata
  tags?: string[]
  collectionIds?: string[]
  contentGroup?: string
  editorOnly?: boolean
  sourceControlStatus?: AssetSourceControlStatus
  thumbnailKey?: string
  /** Top-level fields from newer tools are emitted unchanged on the next save. */
  unknownFields?: Record<string, unknown>
}

/** 创建独立的脚本调试、包依赖、热重载和关联图表元信息默认记录。 */ export function defaultScriptMetadata(): ScriptAssetMetadata {
  return {
    version: 2, apiVersion: 2, breakpoints: [], breakpointDetails: [], tests: [], packageDependencies: [],
    packageName: '', reloadPolicy: 'preserve', signalConnections: [], recoverySource: '', lastSavedHash: '', linkedGraphUuid: ''
  }
}

/** 构造并返回记录 { version: 2, sourceAsset: null, sourceFrameRate: 60, sampleRate: 60, trackMappings: [], compressionTolerance: .0001, preserveEvents: true, lastImportedAt: 0 }，字段按当前实参及捕获状态求值。 */ export function defaultAnimationImportMetadata(): AnimationImportMetadata {
  return { version: 2, sourceAsset: null, sourceFrameRate: 60, sampleRate: 60, trackMappings: [], compressionTolerance: .0001, preserveEvents: true, lastImportedAt: 0 }
}

export const DEFAULT_ASSET_FOLDERS = [
  'Assets', 'Assets/Scenes', 'Assets/Sprites', 'Assets/Audio', 'Assets/Scripts',
  'Assets/Fonts', 'Assets/Prefabs', 'Assets/Plugins', 'Assets/Tiles', 'Assets/TileSets', 'Assets/Materials',
  'Assets/Animations', 'Assets/Controllers', 'Assets/AnimationMasks', 'Assets/Rigs', 'Assets/Skins', 'Assets/Timelines',
  'Assets/Atlases', 'Assets/Shaders', 'Assets/Localization', 'Assets/UI Themes', 'Assets/Packages', 'ProjectSettings',
  'Assets/AI', 'Assets/TilePalettes', 'Assets/BrushPresets', 'Assets/TerrainRules',
  'Assets/Data', 'Assets/Data/Schemas', 'Assets/Data/Tables', 'Assets/Replays', 'Assets/Paths',
  'Assets/Particles', 'Assets/Visual Scripts', 'Assets/Event Sheets', 'Assets/Object Blueprints',
  'Assets/Resources', 'Assets/Resources/Animation Libraries', 'Assets/Resources/Input Maps', 'Assets/Resources/Physics Materials',
  '.nova/cache', '.nova/imported', '.nova/user'
] as const

/** 为图像、图集、音频、字体、瓦片、脚本、着色器及本地化创建完整导入默认设置。 */ export function defaultImportSettings(): AssetImportSettings {
  return {
    textureProfile: 'General', filterMode: 'Linear', compression: 'Lossless', pixelsPerUnit: 100,
    spriteRegion: null, pivot: { x: .5, y: .5 }, atlas: true, colorSpace: 'sRGB', generateMipmaps: false, transparency: 'Preserve', platformVariants: {}, platformOverrides: {},
    atlasSettings: { maxSize: 2048, padding: 2, trim: true, rotationPolicy: 'Never', trimPolicy: 'Transparent', group: 'Default' },
    spriteSheet: { enabled: false, columns: 1, rows: 1, margin: 0, spacing: 0 }, transparentTrim: false,
    borders: { left: 0, top: 0, right: 0, bottom: 0 }, polygonOutline: [], collisionGeneration: { mode: 'None', tolerance: 1 }, extractedAnimationFrames: [],
    svgSettings: { rasterization: 'ImportTime', scale: 1, allowExternalResources: false },
    audioSettings: { profile: 'SoundEffect', codec: 'Original', quality: .8, trimStart: 0, trimEnd: 0, normalize: false, normalizationGain: 1, targetPeakDb: -1, streaming: false, preload: 'Auto', sampleRate: 48_000, loopStart: 0, loopEnd: 0, loopRegions: [], activeLoopRegion: null },
    fontSettings: { renderMode: 'Scalable', fallbackFamilies: ['Nunito Sans Variable', 'Noto Sans SC Variable', 'sans-serif'], fallbackAssetUuids: [], bitmapSize: 32, outlineWidth: 0, shaping: true, openTypeFeatures: ['kern', 'liga'], hinting: 'Auto', oversampling: 1, distanceField: 'None', distanceRange: 8, declaredLanguages: ['en'], editorFont: false },
    tileSettings: { tileWidth: 32, tileHeight: 32, margin: 0, spacing: 0 },
    scriptSettings: { encoding: 'utf-8', module: true },
    shaderSettings: { stage: 'fragment', entry: 'main' },
    localizationSettings: { locale: 'en', fallbackLocale: 'en' }
  }
}
