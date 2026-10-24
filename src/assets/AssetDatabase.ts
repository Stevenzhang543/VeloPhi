/** 资源数据库：维护资源登记、导入、文本更新、目录及集合，解析绘制纹理并协调图集缓存。 */
import { runtimeAssetGuid, createRuntimeAssetIndex, resolveRuntimeAssetGuid, readRuntimeScriptText, RUNTIME_SCRIPT_TEXT_TYPES } from '../runtime/runtimeAssetValues'
import { inlinePipeline, defaultFolder, sanitizedName, uniqueAssetPath, normalizeFolder, fontFamilyFor, preflightPersistedAssetRecords, appendNormalizedAssetRecords, restoreDerivedAssetSize } from '../runtime/runtimeAssetPreparation'
export { normalizeFolder } from '../runtime/runtimeAssetPreparation'
import { markRaw, reactive, watch } from 'vue'
import { normalizeUuid } from '../world/identity'
import { RuntimeMediaOwner } from '../runtime/runtimeMediaOwner'
import { createWebMediaPorts } from '../platform/webMediaPorts'
import {
  DEFAULT_ASSET_FOLDERS,
  defaultAnimationImportMetadata,
  defaultImportSettings,
  defaultScriptMetadata,
  type AssetImportSettings,
  type AssetDatabaseSettings,
  type AssetImportPreset,
  type AssetCollection,
  type AssetContentGroup,
  type AssetRecord,
  type AssetSavedFilter,
  type AssetType,
  type TextAssetType,
  type TextureAtlasPage
} from './types'
import type { TextureRegion } from '../renderer'
import { clearAssetImportSession, dismissExternalAssetChange, importPipelineState, processAssetImport, retryAssetImport, stopWatchingAsset, watchAssetSource, type ImportedArtifact } from './importPipeline'
import { buildAssetDependencyGraph, repairAssetPathReferences } from './assetGraph'
import { assetSourceBytes, sha256Bytes } from './contentHash'
import { assetSettingsHash } from './assetProduction'
import { bindInterchangeTexture } from './interchangeBindings'
import { decodeContentInterchangeSource, importContentInterchangeAsync } from './contentInteroperability'
import { applyDerivedSprite, prepareDerivedSpriteRefresh, spriteDefinitions } from './derivedSprites'
const clearDerivedSpriteTextures = () => getEditorMediaOwner().clearDerived()
import { readAssetPixels } from './assetPixels'

export interface AssetDatabaseState {
  records: AssetRecord[]
  folders: string[]
  atlasPages: TextureAtlasPage[]
  generation: number
  importing: boolean
  atlasError: string
  selectedGuid: string | null
  currentFolder: string
  search: string
  typeFilter: AssetType | 'all'
  favoritesOnly: boolean
  tagFilter: string
  selectedCollectionId: string
  favorites: string[]
  savedFilters: AssetSavedFilter[]
  importPresets: AssetImportPreset[]
  collections: AssetCollection[]
  contentGroups: AssetContentGroup[]
  viewMode: 'grid' | 'list'
  thumbnailSize: number
  indexSize: number
  recentGuids: string[]
}

export const assetState = reactive<AssetDatabaseState>({
  records: [],
  folders: [...DEFAULT_ASSET_FOLDERS],
  atlasPages: [],
  generation: 0,
  importing: false,
  atlasError: '',
  selectedGuid: null,
  currentFolder: 'Assets',
  search: '',
  typeFilter: 'all',
  favoritesOnly: false,
  tagFilter: '',
  selectedCollectionId: '',
  favorites: [],
  savedFilters: [],
  importPresets: [],
  collections: [],
  contentGroups: [{ id: 'main', name: 'Main', mode: 'embedded', optional: false }],
  viewMode: 'grid',
  thumbnailSize: 112,
  indexSize: 0,
  recentGuids: []
})

watch(/* 返回 assetState.selectedGuid 的当前值。 */ () => assetState.selectedGuid, /** 将当前有效资源身份移至最近使用列表首位，去重并保留二十项。 */ guid => {
  if (!guid) return
  assetState.recentGuids.splice(0, assetState.recentGuids.length, guid, ...assetState.recentGuids.filter(/* 比较 value 与 guid，返回严格不等的判断结果。 */ value => value !== guid).slice(0, 19))
})

let assetSessionRevision = 0
export function assetSessionVersion():number{return assetSessionRevision}
let editorMediaOwner:RuntimeMediaOwner|undefined
const mediaPorts=createWebMediaPorts()
/** Cold accessor invokes no decoder or World. Runtime/Player must use explicit Catalog owners. */
export function getEditorMediaOwner():RuntimeMediaOwner {
 if(!editorMediaOwner){const catalog={identity:Object.freeze({session:assetSessionRevision}),projectId:'legacy-editor',revision:()=>assetSessionRevision,listRecords:()=>assetState.records,resolveAsset};let owner!:RuntimeMediaOwner;owner=new RuntimeMediaOwner(catalog,mediaPorts,{state:assetState,legacyEditorFontFamilies:true,isCurrentOwner:()=>editorMediaOwner===owner,wrapAtlasPage:page=>markRaw(page)});editorMediaOwner=owner}
 return editorMediaOwner
}
function replaceEditorMediaOwner():void {const previous=editorMediaOwner,revision=previous?.revisionValues();editorMediaOwner=undefined;if(previous)void previous.dispose();const catalog={identity:Object.freeze({session:assetSessionRevision}),projectId:'legacy-editor',revision:()=>assetSessionRevision,listRecords:()=>assetState.records,resolveAsset};let owner!:RuntimeMediaOwner;owner=new RuntimeMediaOwner(catalog,mediaPorts,{state:assetState,legacyEditorFontFamilies:true,isCurrentOwner:()=>editorMediaOwner===owner,wrapAtlasPage:page=>markRaw(page),initialDecodedRevision:revision?.decoded,initialAtlasContentRevision:revision?.atlas});editorMediaOwner=owner;assetState.atlasPages.splice(0)}
export function imageDecodedCacheStats(){return getEditorMediaOwner().imageDecodedCacheStats()}
export function textureContentRevision():number{return getEditorMediaOwner().textureContentRevision()}
const reimportRevisions = new WeakMap<AssetRecord, number>()
let indexRevision = -1
let indexedRecords: AssetRecord[] = []
let recordsByUuid = new Map<string, AssetRecord>()

/** 仅在资源代次变化时重建按路径排序的列表和 UUID 索引，并同步索引数量。 */ function ensureIndex(): void {
  if (indexRevision === assetState.generation) return
  const index = createRuntimeAssetIndex(assetState.records)
  indexedRecords = index.records
  recordsByUuid = index.byUuid
  assetState.indexSize = indexedRecords.length
  indexRevision = assetState.generation
}

/** 根据 MIME、扩展名和特定命名规则选择资源类型，未知文件归入其他。 */ export function inferAssetType(file: Pick<File, 'name' | 'type'>): AssetType {
  const mime = file.type.toLowerCase()
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(extension)) return 'image'
  if (mime.startsWith('audio/') || ['wav', 'ogg', 'mp3', 'flac'].includes(extension)) return 'audio'
  if (mime.startsWith('font/') || ['ttf', 'otf', 'woff', 'woff2'].includes(extension)) return 'font'
  if (mime.startsWith('video/') || ['mp4', 'webm', 'm4v', 'ogv', 'mov'].includes(extension)) return 'video'
  if (extension === 'nova-scene' || extension === 'scene') return 'scene'
  if (extension === 'nova-prefab' || extension === 'prefab') return 'prefab'
  if (extension === 'rhai' || mime === 'text/x-rhai') return 'script'
  if (extension === 'nova-graph') return 'visualScript'
  if (extension === 'nova-events') return 'eventSheet'
  if (extension === 'nova-object') return 'objectBlueprint'
  if (extension === 'nova-schema') return 'dataSchema'
  if (extension === 'nova-data' || extension === 'csv') return 'dataTable'
  if (extension === 'nova-replay') return 'replay'
  if (extension === 'nova-path') return 'path'
  if (extension === 'nova-particle') return 'particleSystem'
  if (extension === 'nova-chart') return 'chart'
  if (extension === 'nova-resource') return 'resource'
  if (extension === 'nova-material' || extension === 'material') return 'material'
  if (extension === 'nova-anim') return 'animation'
  if (extension === 'nova-controller') return 'controller'
  if (extension === 'nova-mask') return 'animationMask'
  if (extension === 'nova-rig') return 'rig'
  if (extension === 'nova-skin') return 'skin'
  if (extension === 'nova-timeline') return 'timeline'
  if (extension === 'nova-behavior') return 'behaviorTree'
  if (extension === 'nova-state') return 'stateMachine'
  if (extension === 'nova-palette') return 'tilePalette'
  if (extension === 'nova-brush') return 'brushPreset'
  if (extension === 'nova-terrain') return 'terrainRules'
  if (extension === 'nova-tileset' || ['tmx', 'tmj', 'tsx', 'tsj'].includes(extension)) return 'tileset'
  if (extension === 'nova-atlas' || extension === 'atlas' || extension === 'tpsheet' || /\.(?:aseprite|ase|texturepacker)\.json$/i.test(file.name)) return 'atlas'
  if (['glsl', 'frag', 'vert', 'nova-shader'].includes(extension)) return 'shader'
  if (['csv', 'po', 'arb', 'nova-locale'].includes(extension) || /(?:^|[-_.])locale(?:[-_.]|$)/i.test(file.name)) return 'localization'
  if (extension === 'nova-theme') return 'uiTheme'
  return 'other'
}
/** Existing live Editor path allocation uses the same explicit-record algorithm. */ function uniquePath(folder: string, name: string, ignoreGuid?: string): string { return uniqueAssetPath(assetState.records, folder, name, ignoreGuid) }


/** 加载图像并在十五秒超时内读取自然尺寸，错误时拒绝。 */ function imageMetadata(source:string):Promise<{width:number;height:number}>{ return getEditorMediaOwner().imageMetadata(source) }
/** 加载音频元信息并要求有限非负时长，完成后释放媒体源和监听。 */ function audioMetadata(source:string):Promise<number>{
  return new Promise(/** 建立音频元信息读取器，使用一次性完成保护和超时拒绝。 */ (resolve,reject)=>{
    const audio=new Audio();let finished=false
    const timeout=window.setTimeout(/* 调用 finish(new Error('AUDIO_METADATA_TIMEOUT: Audio decoding exceeded 15 seconds.')) 并返回调用结果。 */ ()=>finish(new Error('AUDIO_METADATA_TIMEOUT: Audio decoding exceeded 15 seconds.')),15000)
    const finish=/** 单次结算音频元信息，清除媒体源和事件，再验证时长或返回错误。 */ (error?:Error)=>{if(finished)return;finished=true;window.clearTimeout(timeout);const duration=audio.duration;audio.onloadedmetadata=null;audio.onerror=null;audio.removeAttribute('src');audio.load();if(error)reject(error);else if(!Number.isFinite(duration)||duration<0)reject(new Error('AUDIO_METADATA: Audio has no finite duration.'));else resolve(duration)}
    audio.onloadedmetadata=/* 调用 finish() 并返回调用结果。 */ ()=>finish();audio.onerror=/* 调用 finish(new Error('AUDIO_METADATA: The audio could not be decoded.')) 并返回调用结果。 */ ()=>finish(new Error('AUDIO_METADATA: The audio could not be decoded.'));audio.src=source
  })
}

/** 为字体资源准备 FontFace，以十五秒超时限制等待并清理计时器，尚不登记文档字体。 */ async function prepareFont(record: AssetRecord): Promise<FontFace | null> { return getEditorMediaOwner().prepareFont(record) }
/** 登记新字体并移除同资源旧 FontFace，更新字体所有权映射。 */ function registerFont(uuid:string,face:FontFace|null):void { return getEditorMediaOwner().registerFont(uuid,face) }
/** 异步准备字体，仅当记录仍属于项目且源未变化时登记，失败不阻断资源列表。 */ function installFont(record: AssetRecord): void { return getEditorMediaOwner().installFont(record) }

/** 转换交换格式、验证媒体及字体；批次调用只暂存记录和字体，单项重试在会话有效时登记。 */ async function recordImportedArtifact(file: File, settings: AssetImportSettings, artifact: ImportedArtifact, requestedFolder?: string, signal?: AbortSignal, session = assetSessionRevision, stagedFonts?: Map<string, FontFace | null>): Promise<AssetRecord> {
  let assetType = inferAssetType(file), source = artifact.source
  const preparationStartedAtMs = performance.now()
  const external = ['atlas', 'tileset', 'other'].includes(assetType) ? await importContentInterchangeAsync(file.name, decodeContentInterchangeSource(file.name, artifact.bytes), undefined, { signal, isCurrent: () => session === assetSessionRevision, sourceIdentity: `import:${file.name.slice(0, 240)}:${file.size}:${file.lastModified}`, inputRevision: session, preparationStartedAtMs }) : null
  if (external) {
    assetType = external.assetType; source = `data:${external.mimeType};charset=utf-8,${encodeURIComponent(external.source)}`
    artifact.metadata.importerId = `nova.${external.metadata.format}`
    artifact.metadata.lastValidSource = source
    artifact.metadata.artifactHash = sha256Bytes(assetSourceBytes(source))
    artifact.metadata.contentHash = artifact.metadata.artifactHash
    artifact.metadata.diagnostics.push(...external.metadata.diagnostics)
  }
  const metadata = assetType === 'image' ? await imageMetadata(source) : { width: 0, height: 0 }
  if (assetType === 'image' && (!metadata.width || !metadata.height)) throw new Error('IMAGE_METADATA: The imported image could not be decoded.')
  const uuid = normalizeUuid(undefined)
  const record: AssetRecord = {
    ...assetBookkeepingDefaults(),
    uuid, name: sanitizedName(file.name), path: uniquePath(requestedFolder || defaultFolder(assetType), file.name), assetType,
    mimeType: external?.mimeType || file.type || 'application/octet-stream', byteLength: file.size, source, sourceModified: file.lastModified, importedAt: Date.now(),
    width: metadata.width, height: metadata.height, duration: assetType === 'audio' ? await audioMetadata(source) : 0,
    fontFamily: assetType === 'font' ? fontFamilyFor(uuid) : '', settings,
    script: assetType === 'script' ? defaultScriptMetadata() : undefined,
    animationImport: assetType === 'animation' ? defaultAnimationImportMetadata() : undefined,
    pipeline: artifact.metadata,
    interchange: external?.metadata
  }
  const font=await prepareFont(record)
  if(signal?.aborted || session !== assetSessionRevision) throw new DOMException('Import cancelled or project replaced', 'AbortError')
  if (stagedFonts) { stagedFonts.set(record.uuid, font); return record }
  registerFont(record.uuid,font)
  assetState.records.push(record)
  const folder = record.path.slice(0, record.path.lastIndexOf('/'))
  if (folder && !assetState.folders.includes(folder)) assetState.folders.push(folder)
  return record
}

/** 逐项验证并暂存整批资源，守卫会话及取消状态后统一登记、绑定依赖与更新图集；失败不提交部分文件。 */ export async function importAssetFiles(files: Iterable<File>, requestedFolder?: string, signal?: AbortSignal, onPrepared?: (file: File, count: number) => void): Promise<AssetRecord[]> {
  const session = assetSessionRevision
  assetState.importing = true
  const imported: AssetRecord[] = []
  const stagedFonts = new Map<string, FontFace | null>()
  try {
    for (const file of files) {
      if(signal?.aborted || session !== assetSessionRevision) throw new DOMException('Import cancelled or project replaced', 'AbortError')
      const assetType = inferAssetType(file)
      const settings = defaultImportSettings()
      if (assetType === 'image' && /(?:^|[-_.])pixel(?:[-_.]|$)/i.test(file.name)) settings.filterMode = 'Nearest'
      const artifact = await processAssetImport(file, settings, {signal})
      const record = await recordImportedArtifact(file, settings, artifact, requestedFolder, signal, session, stagedFonts)
      imported.push(record)
      onPrepared?.(file, imported.length)
    }
    if(signal?.aborted || session !== assetSessionRevision) throw new DOMException('Import cancelled or project replaced', 'AbortError')
    // 所有文件验证成功后才一次提交；同名文件按提交次序分配路径，失败不留下半批资源。
    for (const record of imported) {
      record.path = uniquePath(requestedFolder || defaultFolder(record.assetType), record.name)
      registerFont(record.uuid, stagedFonts.get(record.uuid) ?? null)
      assetState.records.push(record)
      const folder = record.path.slice(0, record.path.lastIndexOf('/'))
      if (folder && !assetState.folders.includes(folder)) assetState.folders.push(folder)
    }
    return imported
  } finally {
    if (session === assetSessionRevision && imported.some(/** 仅为实际提交的批次更新索引及图集。 */ record => assetState.records.includes(record))) { for (const asset of assetState.records) if (asset.interchange) bindInterchangeTexture(asset, assetState.records); assetState.records.sort(/* 调用 first.path.localeCompare(second.path) 并返回调用结果。 */ (first, second) => first.path.localeCompare(second.path)); assetState.generation++; queueTextureAtlasRebuild() }
    assetState.importing = false
  }
}

/** Creates independently addressable sprite-region assets without duplicating source pixels. */
/** 预检全部帧几何、引用、身份及路径，复用已有派生帧并一次性新增缺失帧，保持稳定引用。 */ export function sliceSpriteSheet(record: AssetRecord): AssetRecord[] {
  if (!assetState.records.includes(record)) throw new Error('SPRITE_DERIVATION: The source asset is no longer in this project.')
  const definitions = spriteDefinitions(record, assetState.records), updates = prepareDerivedSpriteRefresh(record, assetState.records)
  const existing = new Map<string, AssetRecord>()
  for (const child of assetState.records.filter(/* 比较 value.derivedSprite?.ownerAsset 与 'asset://' + record.uuid，返回严格相等的判断结果。 */ value => value.derivedSprite?.ownerAsset === 'asset://' + record.uuid)) {
    if (existing.has(child.derivedSprite!.sourceKey)) throw new Error('SPRITE_DERIVATION: Duplicate derived frame identity.')
    existing.set(child.derivedSprite!.sourceKey, child)
  }
  const folder = record.path.slice(0, record.path.lastIndexOf('/')), paths = new Set(assetState.records.map(/* 调用 value.path.toLowerCase() 并返回调用结果。 */ value => value.path.toLowerCase()))
  const added: AssetRecord[] = [], output: AssetRecord[] = []
  for (const definition of definitions) {
    const retained = existing.get(definition.sprite.sourceKey)
    if (retained) { output.push(retained); continue }
    const name = sanitizedName(definition.name), stem = name.replace(/\.[^.]+$/, '')
    let path = folder + '/' + name, suffix = 2
    while (paths.has(path.toLowerCase())) path = folder + '/' + stem + ' (' + suffix++ + ').png'
    paths.add(path.toLowerCase())
    const settings = JSON.parse(JSON.stringify(record.settings)) as AssetImportSettings
    settings.spriteRegion = null; settings.atlas = false; settings.spriteSheet.enabled = false
    const child: AssetRecord = { ...assetBookkeepingDefaults(), uuid: normalizeUuid(undefined), name: path.slice(path.lastIndexOf('/') + 1), path, assetType: 'image', mimeType: 'image/png',
      source: '', byteLength: 0, sourceModified: 0, importedAt: Date.now(), width: 0, height: 0, duration: definition.durationMs / 1000, fontFamily: '',
      settings, contentGroup: record.contentGroup, editorOnly: record.editorOnly, tags: [...(record.tags ?? [])], pipeline: inlinePipeline(JSON.stringify(definition.sprite)) }
    applyDerivedSprite(child, definition.sprite); child.pipeline!.dependencies = [...new Set([record.uuid, definition.sprite.textureAsset.slice(8)])]
    added.push(child); output.push(child)
  }
  // All geometry, dependencies, identities and prospective names pass before committing anything.
  for (const update of updates) applyDerivedSprite(update.record, update.sprite)
  assetState.records.push(...added); assetState.records.sort(/* 调用 first.path.localeCompare(second.path) 并返回调用结果。 */ (first, second) => first.path.localeCompare(second.path))
  clearDerivedSpriteTextures(); assetState.generation++
  return output.map(/** 将派生帧输出转换为数据库当前索引中的资源记录。 */ record => resolveAsset(record.uuid)!)
}

/** Finds the non-transparent pixel bounds and stores them as the active sprite region. */
/** 读取受守卫像素并计算非透明包围盒，仍有效时写入裁剪区域并请求图集更新。 */ export async function trimTransparentImage(record: AssetRecord): Promise<boolean> {
  const snapshot = await readAssetPixels(record, assetState.records), {width, height, data: pixels} = snapshot
  let left = width, top = height, right = -1, bottom = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (pixels[(y * width + x) * 4 + 3] > 0) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y) }
  snapshot.assertCurrent()
  if (right < left || bottom < top) return false
  record.settings.spriteRegion = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }; record.settings.transparentTrim = true; assetState.generation++; queueTextureAtlasRebuild(); return true
}

/** 复用相同源图像，否则登记内嵌资源并异步补齐尺寸与图集。 */ export function registerEmbeddedImage(source: string, name = 'Legacy texture'): AssetRecord {
  const existing = assetState.records.find(/* 先计算 record.assetType === 'image'；仅当其为真值时求右侧 record.source === source，返回短路求值结果。 */ record => record.assetType === 'image' && record.source === source)
  if (existing) return existing
  const uuid = normalizeUuid(undefined)
  const imagePath = uniquePath('Assets/Sprites/Imported', `${sanitizedName(name)}.png`)
  const record: AssetRecord = {
    ...assetBookkeepingDefaults(),
    uuid, name: imagePath.slice(imagePath.lastIndexOf('/') + 1), path: imagePath,
    assetType: 'image', mimeType: source.slice(5, source.indexOf(';')) || 'image/png', byteLength: source.length,
    source, sourceModified: 0, importedAt: Date.now(), width: 0, height: 0, duration: 0, fontFamily: '',
    settings: defaultImportSettings(), pipeline: inlinePipeline(source)
  }
  assetState.records.push(record)
  if (!assetState.folders.includes('Assets/Sprites/Imported')) assetState.folders.push('Assets/Sprites/Imported')
  const mediaOwner=getEditorMediaOwner()
  void mediaOwner.imageMetadata(source).then(/** 内嵌图像加载后补齐尺寸并安排图集更新。 */ size => { if(mediaOwner.isDisposed||getEditorMediaOwner()!==mediaOwner||resolveAsset(record.uuid)!==record||record.source!==source)return;record.width = size.width; record.height = size.height; queueTextureAtlasRebuild() }).catch(/** 将 error instanceof Error ? error.message : String(error) 赋给 assetState.atlasError，不显式返回值。 */ error => { if(mediaOwner.isDisposed||getEditorMediaOwner()!==mediaOwner)return;assetState.atlasError = error instanceof Error ? error.message : String(error) })
  assetState.generation++
  return record
}

/** Match hydration defaults at creation so the first Undo does not add metadata. */
/* 返回具有所列字段的新对象 { tags: [], collectionIds: [], contentGroup: 'main', editorOnly: false, sourceControlStatus: 'clean', thumbnailKey: '' }。 */ function assetBookkeepingDefaults(): Pick<AssetRecord, 'tags' | 'collectionIds' | 'contentGroup' | 'editorOnly' | 'sourceControlStatus' | 'thumbnailKey'> {
  return { tags: [], collectionIds: [], contentGroup: 'main', editorOnly: false, sourceControlStatus: 'clean', thumbnailKey: '' }
}

/** 按模板 `data:${mimeType};charset=utf-8,${encodeURIComponent(source)}` 生成并返回字符串。 */ function textDataUrl(source: string, mimeType: string): string {
  return `data:${mimeType};charset=utf-8,${encodeURIComponent(source)}`
}

/** 为可编辑文本资源分配身份、类型扩展名和唯一目录路径，登记默认元信息并选中新资源。 */ export function createTextAsset(
  name: string,
  assetType: Exclude<TextAssetType, 'other'>,
  source: string,
  requestedFolder?: string
): AssetRecord {
  const uuid = normalizeUuid(undefined)
  const extension = assetType === 'script' ? '.rhai' : assetType === 'visualScript' ? '.nova-graph' : assetType === 'eventSheet' ? '.nova-events' : assetType === 'objectBlueprint' ? '.nova-object' : assetType === 'prefab' ? '.nova-prefab' : assetType === 'scene' ? '.nova-scene' : assetType === 'material' ? '.nova-material' : assetType === 'animation' ? '.nova-anim' : assetType === 'controller' ? '.nova-controller' : assetType === 'animationMask' ? '.nova-mask' : assetType === 'rig' ? '.nova-rig' : assetType === 'skin' ? '.nova-skin' : assetType === 'timeline' ? '.nova-timeline' : assetType === 'tileset' ? '.nova-tileset' : assetType === 'atlas' ? '.nova-atlas' : assetType === 'shader' ? '.nova-shader' : assetType === 'uiTheme' ? '.nova-theme' : assetType === 'behaviorTree' ? '.nova-behavior' : assetType === 'stateMachine' ? '.nova-state' : assetType === 'tilePalette' ? '.nova-palette' : assetType === 'brushPreset' ? '.nova-brush' : assetType === 'terrainRules' ? '.nova-terrain' : assetType === 'dataSchema' ? '.nova-schema' : assetType === 'dataTable' ? '.nova-data' : assetType === 'replay' ? '.nova-replay' : assetType === 'path' ? '.nova-path' : assetType === 'particleSystem' ? '.nova-particle' : assetType === 'chart' ? '.nova-chart' : assetType === 'resource' ? '.nova-resource' : '.nova-locale'
  const safeName = sanitizedName(name).endsWith(extension) ? sanitizedName(name) : `${sanitizedName(name)}${extension}`
  const mimeType = assetType === 'script' ? 'text/x-rhai' : assetType === 'visualScript' ? 'application/x-nova-graph+json' : `application/x-nova-${assetType}`
  const record: AssetRecord = {
    ...assetBookkeepingDefaults(),
    uuid,
    name: safeName,
    path: uniquePath(requestedFolder || defaultFolder(assetType), safeName),
    assetType,
    mimeType,
    byteLength: new TextEncoder().encode(source).byteLength,
    source: textDataUrl(source, mimeType),
    sourceModified: Date.now(),
    importedAt: Date.now(),
    width: 0,
    height: 0,
    duration: 0,
    fontFamily: '',
    settings: defaultImportSettings(),
    script: assetType === 'script' ? defaultScriptMetadata() : undefined,
    animationImport: assetType === 'animation' ? defaultAnimationImportMetadata() : undefined,
    pipeline: inlinePipeline(source)
  }
  assetState.records.push(record)
  const folder = record.path.slice(0, record.path.lastIndexOf('/'))
  if (folder && !assetState.folders.includes(folder)) assetState.folders.push(folder)
  assetState.records.sort(/* 调用 first.path.localeCompare(second.path) 并返回调用结果。 */ (first, second) => first.path.localeCompare(second.path))
  assetState.selectedGuid = record.uuid
  assetState.currentFolder = folder
  assetState.generation++
  return record
}

/** 仅读取支持的文本资源，兼容原文和百分号或 Base64 数据 URI，解码失败返回 null。 */ export function readTextAsset(reference: string | null | undefined): string | null { return readRuntimeScriptText(resolveAsset(reference)) }

/** 更新可编辑且非生成缓存目录内的文本源、字节及时间，重建内联元信息并保留依赖列表。 */ export function updateTextAsset(uuid: string, source: string): boolean {
  const record = assetState.records.find(/* 比较 asset.uuid 与 uuid，返回严格相等的判断结果。 */ asset => asset.uuid === uuid)
  if (!record || record.path.startsWith('.nova/') || !RUNTIME_SCRIPT_TEXT_TYPES.includes(record.assetType)) return false
  const nextSource = textDataUrl(source, record.mimeType || 'text/plain')
  if (record.source === nextSource) return true
  record.source = nextSource
  record.byteLength = new TextEncoder().encode(source).byteLength
  record.sourceModified = Date.now()
  record.importedAt = Date.now()
  const metadata = inlinePipeline(record.source)
  metadata.dependencies = record.pipeline?.dependencies ?? []
  metadata.reverseDependencies = record.pipeline?.reverseDependencies ?? []
  record.pipeline = metadata
  assetState.generation++
  return true
}

/**
 * Applies an in-memory text-asset write as a verified transaction. The prior
 * record and generation are restored if writing, verification, or an injected
 * qualification fault fails, so prefab sources never remain half-authored.
 */
/** 快照记录与代次后写入文本并回读校验，失败时恢复记录和代次。 */ export function updateTextAssetTransactional(uuid: string, source: string, faultAt?: 'after-write' | 'after-verify'): boolean {
  const record = assetState.records.find(/* 比较 asset.uuid 与 uuid，返回严格相等的判断结果。 */ asset => asset.uuid === uuid)
  if (!record) return false
  const before = JSON.parse(JSON.stringify(record)) as AssetRecord
  const generation = assetState.generation
  try {
    if (!updateTextAsset(uuid, source)) return false
    if (faultAt === 'after-write') throw new Error('Injected text-asset interruption after write.')
    if (readTextAsset(uuid) !== source) throw new Error('Text-asset verification failed.')
    if (faultAt === 'after-verify') throw new Error('Injected text-asset interruption after verification.')
    return true
  } catch {
    Object.assign(record, before)
    assetState.generation = generation
    return false
  }
}

/** 深复制资源，将保留的未知字段合并回文档顶层以支持兼容保存。 */ export function serializeAssets(): AssetRecord[] {
  return assetState.records.map(/** 复制资源并展开未知字段，已知当前字段优先于同名未知值。 */ record => {
    const copy = JSON.parse(JSON.stringify(record)) as AssetRecord
    const unknown = copy.unknownFields && typeof copy.unknownFields === 'object' ? copy.unknownFields : {}
    delete copy.unknownFields
    return { ...unknown, ...copy } as AssetRecord
  })
}

/* 调用 [...assetState.folders].sort((a, b) => a.localeCompare(b)) 并返回调用结果。 */ export function serializeAssetFolders(): string[] {
  return [...assetState.folders].sort(/* 调用 a.localeCompare(b) 并返回调用结果。 */ (a, b) => a.localeCompare(b))
}

/** 导出资源收藏、筛选、预设、集合与内容分组，去重排序并只保留有效收藏。 */ export function serializeAssetDatabaseSettings(): AssetDatabaseSettings {
  return {
    version: 2,
    favorites: [...new Set(assetState.favorites)].filter(/** 只保留数据库中仍存在的收藏身份。 */ uuid => assetState.records.some(/* 比较 record.uuid 与 uuid，返回严格相等的判断结果。 */ record => record.uuid === uuid)).sort(),
    savedFilters: assetState.savedFilters.map(/** 构造并返回记录 { ...filter }，字段按当前实参及捕获状态求值。 */ filter => ({ ...filter })).sort(/* 调用 a.name.localeCompare(b.name) 并返回调用结果。 */ (a, b) => a.name.localeCompare(b.name)),
    importPresets: assetState.importPresets.map(/** 构造并返回记录 { ...preset, settings: JSON.parse(JSON.stringify(preset.settings)) as AssetImportSettings }，字段按当前实参及捕获状态求值。 */ preset => ({ ...preset, settings: JSON.parse(JSON.stringify(preset.settings)) as AssetImportSettings })).sort(/* 调用 a.name.localeCompare(b.name) 并返回调用结果。 */ (a, b) => a.name.localeCompare(b.name)),
    collections: assetState.collections.map(/** 构造并返回记录 { ...collection, assetUuids: [...new Set(collection.assetUuids)].sort() }，字段按当前实参及捕获状态求值。 */ collection => ({ ...collection, assetUuids: [...new Set(collection.assetUuids)].sort() })).sort(/* 调用 a.name.localeCompare(b.name) 并返回调用结果。 */ (a, b) => a.name.localeCompare(b.name)),
    contentGroups: assetState.contentGroups.map(/** 构造并返回记录 { ...group }，字段按当前实参及捕获状态求值。 */ group => ({ ...group })).sort(/* 调用 a.name.localeCompare(b.name) 并返回调用结果。 */ (a, b) => a.name.localeCompare(b.name)),
    viewMode: assetState.viewMode,
    thumbnailSize: assetState.thumbnailSize
  }
}

/** 规范化并限制收藏、筛选、预设、集合及内容分组，恢复资源视图偏好。 */ function loadAssetDatabaseSettings(source: unknown): void {
  const value = source && typeof source === 'object' ? source as Partial<AssetDatabaseSettings> : {}
  assetState.favorites.splice(0, assetState.favorites.length, ...(Array.isArray(value.favorites) ? [...new Set(value.favorites.filter(/* 比较 typeof item 与 'string'，返回严格相等的判断结果。 */ item => typeof item === 'string'))].slice(0, 10_000) : []))
  const filters = Array.isArray(value.savedFilters) ? value.savedFilters.flatMap(/** 校验筛选身份名称，清理查询、目录、类型、标签及集合条件。 */ raw => {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || typeof raw.name !== 'string') return []
    const type = raw.assetType === 'all' || typeof raw.assetType === 'string' ? raw.assetType as AssetType | 'all' : 'all'
    return [{ id: raw.id.slice(0, 80), name: raw.name.trim().slice(0, 80) || 'Filter', query: String(raw.query ?? '').slice(0, 200), folder: normalizeFolder(String(raw.folder ?? 'Assets')), assetType: type, tags: Array.isArray(raw.tags) ? raw.tags.map(String).map(/* 调用 tag.trim() 并返回调用结果。 */ tag => tag.trim()).filter(Boolean).slice(0, 32) : [], collectionId: String(raw.collectionId ?? '').slice(0, 80) }]
  }).slice(0, 128) : []
  assetState.savedFilters.splice(0, assetState.savedFilters.length, ...filters)
  const presets = Array.isArray(value.importPresets) ? value.importPresets.flatMap(/** 校验导入预设结构并与默认设置合并，保留有界名称和身份。 */ raw => {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || typeof raw.name !== 'string' || !raw.settings || typeof raw.settings !== 'object') return []
    return [{ id: raw.id.slice(0, 80), name: raw.name.trim().slice(0, 80) || 'Preset', assetType: raw.assetType === 'all' || typeof raw.assetType === 'string' ? raw.assetType as AssetType | 'all' : 'all', settings: { ...defaultImportSettings(), ...raw.settings } as AssetImportSettings }]
  }).slice(0, 128) : []
  assetState.importPresets.splice(0, assetState.importPresets.length, ...presets)
  const collections = Array.isArray(value.collections) ? value.collections.flatMap(/** 校验集合身份名称、颜色和资源列表，去重并限制成员数量。 */ raw => {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || typeof raw.name !== 'string') return []
    return [{ id: raw.id.slice(0, 80), name: raw.name.trim().slice(0, 80) || 'Collection', color: /^#[0-9a-f]{6}$/i.test(String(raw.color)) ? String(raw.color) : '#6ea8fe', assetUuids: Array.isArray(raw.assetUuids) ? [...new Set(raw.assetUuids.map(String))].slice(0, 20_000) : [] }]
  }).slice(0, 256) : []
  assetState.collections.splice(0, assetState.collections.length, ...collections)
  const groups = Array.isArray(value.contentGroups) ? value.contentGroups.flatMap(/** 校验内容组身份名称，规范化交付模式和可选标记。 */ raw => {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || typeof raw.name !== 'string') return []
    const mode = ['embedded', 'downloadable', 'excluded'].includes(String(raw.mode)) ? raw.mode as AssetContentGroup['mode'] : 'embedded'
    return [{ id: raw.id.slice(0, 80), name: raw.name.trim().slice(0, 80) || 'Content', mode, optional: raw.optional === true }]
  }).slice(0, 128) : []
  assetState.contentGroups.splice(0, assetState.contentGroups.length, ...(groups.length ? groups : [{ id: 'main', name: 'Main', mode: 'embedded' as const, optional: false }]))
  assetState.viewMode = value.viewMode === 'list' ? 'list' : 'grid'
  assetState.thumbnailSize = Math.min(192, Math.max(72, Number(value.thumbnailSize) || 112))
}

/** 预检派生元信息后切换资源会话，释放旧字体缓存，迁移设置和未知字段，再恢复目录、字体与图集。 */ export function loadAssets(source: unknown, folderSource?: unknown, databaseSource?: unknown): void {
  preflightPersistedAssetRecords(source)
  assetSessionRevision++
  replaceEditorMediaOwner()
  clearAssetImportSession()
  assetState.records.splice(0)
  getEditorMediaOwner().clearImages()
  clearDerivedSpriteTextures()
  appendNormalizedAssetRecords(source, assetState.records, { normalizeUuid })
  const folders = new Set<string>(DEFAULT_ASSET_FOLDERS)
  if (Array.isArray(folderSource)) {
    for (const value of folderSource) {
      if (typeof value !== 'string' || !value.trim()) continue
      const folder = normalizeFolder(value)
      if (folder === 'Assets' || folder.startsWith('Assets/') || folder === 'ProjectSettings' || folder.startsWith('.nova/')) folders.add(folder)
    }
  }
  assetState.records.forEach(/** 恢复派生资源尺寸、登记父目录并异步安装字体。 */ record => {
    restoreDerivedAssetSize(record)
    const folder = record.path.slice(0, record.path.lastIndexOf('/'))
    if (folder) folders.add(folder)
    installFont(record)
  })
  assetState.folders.splice(0, assetState.folders.length, ...[...folders].sort())
  loadAssetDatabaseSettings(databaseSource)
  assetState.generation++
  queueTextureAtlasRebuild()
}

/** 计算无冲突新名称路径，先修复资源路径引用，再提交名称路径和代次变化。 */ export function renameAsset(uuid: string, name: string): boolean {
  const record = assetState.records.find(/* 比较 asset.uuid 与 uuid，返回严格相等的判断结果。 */ asset => asset.uuid === uuid)
  if (!record) return false
  const folder = record.path.slice(0, record.path.lastIndexOf('/'))
  const oldPath = record.path
  const newName = sanitizedName(name), newPath = uniquePath(folder, newName, uuid)
  repairAssetPathReferences(assetState.records, oldPath, newPath)
  record.name = newName; record.path = newPath
  assetState.generation++
  return true
}

/** 计算目标目录唯一资源路径，修复路径引用后登记目录并移动资源。 */ export function moveAsset(uuid: string, folder: string): boolean {
  const record = assetState.records.find(/* 比较 asset.uuid 与 uuid，返回严格相等的判断结果。 */ asset => asset.uuid === uuid)
  if (!record) return false
  const destination = normalizeFolder(folder)
  const oldPath = record.path
  const newPath = uniquePath(destination, record.name, uuid)
  repairAssetPathReferences(assetState.records, oldPath, newPath)
  if (!assetState.folders.includes(destination)) assetState.folders.push(destination)
  record.path = newPath
  assetState.generation++
  return true
}

/** Validate asynchronously before committing; stale operations never replace newer authoring. */
/** 以记录身份、修订和设置快照守卫重导入，预检格式、媒体、依赖及派生帧后提交；失败保留旧产物并记录错误。 */ export async function reimportAsset(uuid: string, file: File, prepared?: ImportedArtifact, signal?: AbortSignal): Promise<boolean> {
  const record = assetState.records.find(/* 比较 asset.uuid 与 uuid，返回严格相等的判断结果。 */ asset => asset.uuid === uuid)
  if (!record) return false
  const revision = (reimportRevisions.get(record) ?? 0) + 1; reimportRevisions.set(record, revision)
  const before = JSON.parse(JSON.stringify(record)) as AssetRecord
  const settings = JSON.stringify(record.settings)
  const current = /** 检查重导入未取消、原记录仍存在且请求修订、源和设置均未变化。 */ () => !signal?.aborted && assetState.records.includes(record) && reimportRevisions.get(record) === revision && record.source === before.source && JSON.stringify(record.settings) === settings
  try {
    if (record.derivedSprite) throw new Error('SPRITE_DERIVATION: Reimport the linked source image or atlas instead of an extracted frame.')
    const inferred = inferAssetType(file)
    if (inferred !== 'other' && inferred !== record.assetType) throw new Error(`CONTENT_TYPE_MISMATCH: ${inferred} source cannot replace ${record.assetType}.`)
    if (prepared && prepared.metadata.settingsHash !== assetSettingsHash(before.settings)) throw new Error('IMPORT_SETTINGS_CHANGED: Retry settings differ from the current asset. Reimport with the current settings.')
    const artifact = prepared ?? await processAssetImport(file, before.settings, { targetUuid: uuid, signal })
    const preparationStartedAtMs = performance.now()
    const decoded = ['atlas', 'tileset'].includes(record.assetType) ? decodeContentInterchangeSource(file.name, artifact.bytes) : ''
    const external = decoded ? await importContentInterchangeAsync(file.name, decoded, before.interchange, { signal, isCurrent: current, sourceIdentity: `asset:${uuid}`, inputRevision: revision, preparationStartedAtMs }) : null
    if (before.interchange && !external) throw new Error('CONTENT_FORMAT_MISMATCH: Reimport requires the same supported atlas or Tiled metadata family.')
    if (external && external.assetType !== before.assetType) throw new Error(`CONTENT_TYPE_MISMATCH: ${external.assetType} source cannot replace ${before.assetType}.`)
    const candidate = { ...before, source: external ? `data:${external.mimeType};charset=utf-8,${encodeURIComponent(external.source)}` : artifact.source,
      mimeType: external?.mimeType || file.type || before.mimeType, byteLength: file.size, sourceModified: file.lastModified, importedAt: Date.now(), pipeline: structuredClone(artifact.metadata) }
    if (external) {
      candidate.interchange = external.metadata; candidate.pipeline.importerId = `nova.${external.metadata.format}`
      candidate.pipeline.artifactHash = sha256Bytes(assetSourceBytes(candidate.source)); candidate.pipeline.contentHash = candidate.pipeline.artifactHash
      candidate.pipeline.diagnostics.push(...external.metadata.diagnostics)
    }
    candidate.pipeline.lastValidSource = candidate.source
    if (candidate.assetType === 'image') {
      Object.assign(candidate, await imageMetadata(candidate.source))
      if (!candidate.width || !candidate.height) throw new Error('IMAGE_METADATA: The replacement image could not be decoded.')
    }
    if (candidate.assetType === 'audio') candidate.duration = await audioMetadata(candidate.source)
    const font=await prepareFont(candidate)
    const binding = bindInterchangeTexture(candidate, assetState.records, before)
    if (binding.diagnostics.length) throw new Error(binding.diagnostics.map(/** 按模板 `${issue.code}: ${issue.message}` 生成并返回字符串。 */ issue=>`${issue.code}: ${issue.message}`).join('\n'))
    const derivedUpdates = prepareDerivedSpriteRefresh(candidate, assetState.records)
    if (!current()) return false
    registerFont(uuid,font)
    // Keep editor identity/path and any independent metadata edits made while bytes were read.
    for (const key of ['source','mimeType','byteLength','sourceModified','importedAt','pipeline','interchange','width','height','duration'] as const) {
      if (key === 'interchange' && candidate.interchange === undefined) continue
      Object.assign(record, { [key]: candidate[key] })
    }
    for (const update of derivedUpdates) applyDerivedSprite(update.record, update.sprite)
    for (const page of assetState.atlasPages) page.regions.delete(uuid)
    clearDerivedSpriteTextures(); getEditorMediaOwner().invalidate(record); assetState.generation++; queueTextureAtlasRebuild(); return true
  } catch (error) {
    if (!current()) return false
    const message = error instanceof Error ? error.message : String(error)
    record.pipeline = { ...inlinePipeline(before.source), ...before.pipeline, status: 'failed', lastValidSource: before.source, error: message,
      invalidationReason: 'Source reimport failed; previous artifact and identity retained',
      diagnostics: [...(before.pipeline?.diagnostics ?? []).filter(/* 比较 item.code 与 'IMPORT_FAILED'，返回严格不等的判断结果。 */ item => item.code !== 'IMPORT_FAILED'), { severity: 'error', code: 'IMPORT_FAILED', message }] }
    assetState.generation++; return false
  }
}

/** 创建不与已有目录冲突的规范资源目录，排序并设为当前目录。 */ export function createAssetFolder(parent: string, name: string): string | null {
  const folder = normalizeFolder(`${parent}/${sanitizedName(name)}`)
  if (assetState.folders.some(/* 比较 value.toLowerCase() 与 folder.toLowerCase()，返回严格相等的判断结果。 */ value => value.toLowerCase() === folder.toLowerCase())) return null
  assetState.folders.push(folder)
  assetState.folders.sort()
  assetState.currentFolder = folder
  assetState.generation++
  return folder
}

/** 删除资源并释放文件监听、字体和纹理缓存，清理当前选择并请求图集更新。 */ export function deleteAsset(uuid: string): boolean {
  const index = assetState.records.findIndex(/* 比较 record.uuid 与 uuid，返回严格相等的判断结果。 */ record => record.uuid === uuid)
  if (index < 0) return false
  stopWatchingAsset(uuid)
  getEditorMediaOwner().removeFont(uuid)
  assetState.records.splice(index, 1)
  getEditorMediaOwner().deleteImage(uuid)
  clearDerivedSpriteTextures()
  if (assetState.selectedGuid === uuid) assetState.selectedGuid = null
  assetState.generation++
  queueTextureAtlasRebuild()
  return true
}

/** Restores a recoverable project-trash record without changing its stable GUID. */
/** 仅在身份未占用时恢复深复制资源，补目录、字体和排序并选中恢复项。 */ export function restoreAssetRecord(value: AssetRecord): boolean {
  if (!value || assetState.records.some(/* 比较 record.uuid 与 value.uuid，返回严格相等的判断结果。 */ record => record.uuid === value.uuid)) return false
  const restored = JSON.parse(JSON.stringify(value)) as AssetRecord
  assetState.records.push(restored)
  installFont(restored)
  assetState.records.sort(/* 先计算 a.path.localeCompare(b.path)；仅当其为假值时求右侧 a.uuid.localeCompare(b.uuid)，返回短路求值结果。 */ (a, b) => a.path.localeCompare(b.path) || a.uuid.localeCompare(b.uuid))
  const folder = restored.path.slice(0, restored.path.lastIndexOf('/')) || 'Assets'
  if (!assetState.folders.includes(folder)) assetState.folders.push(folder)
  assetState.selectedGuid = restored.uuid
  assetState.generation++
  queueTextureAtlasRebuild()
  return true
}

/** 移除已收藏身份，否则仅为现存资源添加收藏。 */ export function toggleAssetFavorite(uuid: string): boolean {
  const index = assetState.favorites.indexOf(uuid)
  if (index >= 0) { assetState.favorites.splice(index, 1); return false }
  if (assetState.records.some(/* 比较 record.uuid 与 uuid，返回严格相等的判断结果。 */ record => record.uuid === uuid)) assetState.favorites.push(uuid)
  return true
}

/** 以非空名称保存当前查询、目录、类型、标签和集合筛选。 */ export function saveCurrentAssetFilter(name: string): AssetSavedFilter | null {
  const safe = name.trim().slice(0, 80)
  if (!safe) return null
  const filter: AssetSavedFilter = { id: normalizeUuid(undefined), name: safe, query: assetState.search.slice(0, 200), folder: assetState.currentFolder, assetType: assetState.typeFilter, tags: assetState.tagFilter ? [assetState.tagFilter] : [], collectionId: assetState.selectedCollectionId }
  assetState.savedFilters.push(filter)
  return filter
}

/** 读取已保存筛选并恢复查询、目录、类型、首个标签及集合选择。 */ export function applyAssetFilter(id: string): boolean {
  const filter = assetState.savedFilters.find(/* 比较 item.id 与 id，返回严格相等的判断结果。 */ item => item.id === id)
  if (!filter) return false
  assetState.search = filter.query; assetState.currentFolder = filter.folder; assetState.typeFilter = filter.assetType; assetState.tagFilter = filter.tags[0] ?? ''; assetState.selectedCollectionId = filter.collectionId
  return true
}

/** 删除存在的已保存资源筛选，未找到返回 false。 */ export function deleteAssetFilter(id: string): boolean {
  const index = assetState.savedFilters.findIndex(/* 比较 item.id 与 id，返回严格相等的判断结果。 */ item => item.id === id)
  if (index < 0) return false
  assetState.savedFilters.splice(index, 1); return true
}

/** 以非空名称和合法颜色建立资源集合，排序后返回新集合。 */ export function createAssetCollection(name: string, color = '#6ea8fe'): AssetCollection | null {
  const safe = name.trim().slice(0, 80); if (!safe) return null
  const collection: AssetCollection = { id: normalizeUuid(undefined), name: safe, color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#6ea8fe', assetUuids: [] }
  assetState.collections.push(collection); assetState.collections.sort(/* 调用 a.name.localeCompare(b.name) 并返回调用结果。 */ (a, b) => a.name.localeCompare(b.name)); return collection
}

/** 同步切换集合成员和资源反向集合身份，保持两个方向一致。 */ export function toggleAssetInCollection(assetUuid: string, collectionId: string): boolean {
  const asset = assetState.records.find(/* 比较 record.uuid 与 assetUuid，返回严格相等的判断结果。 */ record => record.uuid === assetUuid), collection = assetState.collections.find(/* 比较 item.id 与 collectionId，返回严格相等的判断结果。 */ item => item.id === collectionId)
  if (!asset || !collection) return false
  const included = collection.assetUuids.includes(assetUuid)
  collection.assetUuids = included ? collection.assetUuids.filter(/* 比较 uuid 与 assetUuid，返回严格不等的判断结果。 */ uuid => uuid !== assetUuid) : [...collection.assetUuids, assetUuid].sort()
  asset.collectionIds = included ? (asset.collectionIds ?? []).filter(/* 比较 id 与 collectionId，返回严格不等的判断结果。 */ id => id !== collectionId) : [...new Set([...(asset.collectionIds ?? []), collectionId])].sort()
  return !included
}

/** 深复制导入设置，以唯一身份及非空名称保存指定资源类型预设。 */ export function saveImportPreset(name: string, assetType: AssetType | 'all', settings: AssetImportSettings): AssetImportPreset | null {
  const safe = name.trim().slice(0, 80)
  if (!safe) return null
  const preset: AssetImportPreset = { id: normalizeUuid(undefined), name: safe, assetType, settings: JSON.parse(JSON.stringify(settings)) as AssetImportSettings }
  assetState.importPresets.push(preset); return preset
}

/** 仅应用类型兼容的导入预设，复制设置并请求资源和图集刷新。 */ export function applyImportPreset(id: string, asset: AssetRecord): boolean {
  const preset = assetState.importPresets.find(/* 先计算 item.id === id；仅当其为真值时求右侧 (item.assetType === 'all' || item.assetType === asset.assetType)，返回短路求值结果。 */ item => item.id === id && (item.assetType === 'all' || item.assetType === asset.assetType))
  if (!preset) return false
  asset.settings = JSON.parse(JSON.stringify(preset.settings)) as AssetImportSettings
  assetState.generation++; queueTextureAtlasRebuild(); return true
}

/** 重建依赖图并把排序后的正反依赖同步至每个资源流水线元信息。 */ export function synchronizeAssetDependencyMetadata(project?: unknown): void {
  const graph = buildAssetDependencyGraph(assetState.records, project)
  for (const record of assetState.records) {
    record.pipeline ??= inlinePipeline(record.source)
    record.pipeline.dependencies = [...(graph.dependencies.get(record.uuid) ?? [])].sort()
    record.pipeline.reverseDependencies = [...(graph.reverseDependencies.get(record.uuid) ?? [])].sort()
  }
}

/** 重试保留的导入输入，按是否具有目标身份选择重导入或登记新资源，再更新图集。 */ export async function retryFailedAssetImport(jobId: number, requestedFolder?: string): Promise<AssetRecord | null> {
  const result = await retryAssetImport(jobId)
  if (!result) return null
  if (result.targetUuid) return await reimportAsset(result.targetUuid, result.file, result.artifact) ? resolveAsset(result.targetUuid) : null
  const record = await recordImportedArtifact(result.file, result.settings, result.artifact, requestedFolder)
  assetState.records.sort(/* 调用 a.path.localeCompare(b.path) 并返回调用结果。 */ (a, b) => a.path.localeCompare(b.path)); assetState.generation++; queueTextureAtlasRebuild()
  return record
}

type SourceFileHandle = { getFile(): Promise<File> }

/** 通过浏览器选择原始文件并建立修改监听，记录初始时间，区分不支持与用户取消。 */ export async function linkAssetSource(uuid: string, onReimported?: () => void): Promise<'linked' | 'cancelled' | 'unsupported'> {
  const picker = (window as unknown as { showOpenFilePicker?: (options?: { multiple: boolean }) => Promise<SourceFileHandle[]> }).showOpenFilePicker
  if (!picker) return 'unsupported'
  let handles: SourceFileHandle[]
  try { handles = await picker({ multiple: false }) } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'; throw error }
  const handle = handles[0]
  if (!handle || !assetState.records.some(/* 比较 record.uuid 与 uuid，返回严格相等的判断结果。 */ record => record.uuid === uuid)) return 'cancelled'
  const initial = await handle.getFile()
  watchAssetSource(uuid, handle, /** 自动换源成功后通知作者历史拥有者，失败保留原源。 */ async file => { const success = await reimportAsset(uuid, file); if (success) onReimported?.(); return success }, initial.lastModified)
  const record = assetState.records.find(/* 比较 asset.uuid 与 uuid，返回严格相等的判断结果。 */ asset => asset.uuid === uuid)
  if (record) record.sourceModified = initial.lastModified
  return 'linked'
}

/** 根据用户选择重导入、复制或忽略外部变更，操作成功后移除待处理记录。 */ export async function resolveExternalAssetChange(changeId: string, choice: 'reimport' | 'keep' | 'duplicate'): Promise<boolean> {
  const change = importPipelineState.externalChanges.find(/* 比较 item.id 与 changeId，返回严格相等的判断结果。 */ item => item.id === changeId)
  if (!change) return false
  let success = true
  if (choice === 'reimport') success = await reimportAsset(change.uuid, change.file)
  else if (choice === 'duplicate') success = (await importAssetFiles([change.file])).length > 0
  if (success) dismissExternalAssetChange(change.id)
  return success
}

/** 按模板 `asset://${normalizeUuid(uuid)}` 生成并返回字符串。 */ export function assetReference(uuid: string): string { return `asset://${normalizeUuid(uuid)}` }
/** 仅从 asset URI 提取身份，其他引用返回 null。 */ export function assetGuid(reference: string | null | undefined): string | null { return runtimeAssetGuid(reference) }
/** 确保索引代次最新后按资源 URI 或裸身份读取记录。 */ export function resolveAsset(reference: string | null | undefined): AssetRecord | null {
  const guid = assetGuid(reference) ?? reference
  ensureIndex()
  return resolveRuntimeAssetGuid(guid, recordsByUuid)
}

/** 检查派生帧来源、拥有者和几何边界，并返回当前源对应的加载拒绝诊断。 */ export function assetTextureDiagnostic(reference: string | null | undefined): string { return getEditorMediaOwner().assetTextureDiagnostic(reference) }

/** 解析图像资源的完整纹理，再应用用户导入裁剪区域。 */ export function resolveTexture(reference: string | null | undefined, filterOverride?: 'Nearest' | 'Linear'): TextureRegion | null { return getEditorMediaOwner().resolveTexture(reference,filterOverride) }

/** 优先解析派生帧或图集区域，否则在有界解码缓存中加载原图，使用源身份保护异步完成。 */ 

/** Resolves a pixel-space sub-region without allocating another texture. */
/** 将显式像素区域限制在资源边界，并组合到完整纹理或图集 UV 范围。 */ export function resolveTextureRegion(
  reference: string | null | undefined,
  region: { x: number; y: number; width: number; height: number },
  filterOverride?: 'Nearest' | 'Linear'
): TextureRegion | null { return getEditorMediaOwner().resolveTextureRegion(reference,region,filterOverride) }

/** 把资源导入裁剪区域限制在尺寸边界，并转换为纹理 UV 子区域。 */ 

/** 异步构建图集，仅提交最新请求修订，更新纹理内容版本并清理派生纹理缓存。 */ export async function rebuildTextureAtlases(): Promise<void> { return getEditorMediaOwner().rebuildTextureAtlases() }

/** 启动图集重建，失败时保留旧有效图集并记录有界错误消息。 */ export function queueTextureAtlasRebuild(): void { return getEditorMediaOwner().queueTextureAtlasRebuild() }

/** 根据目录、全文查询、类型、标签、集合及收藏条件筛选已排序资源索引。 */ export function filteredAssets(): AssetRecord[] {
  ensureIndex()
  const query = assetState.search.trim().toLowerCase()
  const folder = `${assetState.currentFolder}/`
  const favorites = new Set(assetState.favorites)
  const collection = assetState.collections.find(/* 比较 item.id 与 assetState.selectedCollectionId，返回严格相等的判断结果。 */ item => item.id === assetState.selectedCollectionId), collectionAssets = collection ? new Set(collection.assetUuids) : null
  return indexedRecords.filter(/** 组合目录、查询、类型、标签、集合和收藏规则判断资源是否出现在当前视图。 */ record => {
    const inFolder = record.path.startsWith(folder) && !record.path.slice(folder.length).includes('/')
    const typeMatches = assetState.typeFilter === 'all' || record.assetType === assetState.typeFilter
    const queryMatches = !query || record.name.toLowerCase().includes(query) || record.path.toLowerCase().includes(query) || (record.tags ?? []).some(/* 调用 tag.toLowerCase().includes(query) 并返回调用结果。 */ tag => tag.toLowerCase().includes(query))
    const tagMatches = !assetState.tagFilter || (record.tags ?? []).includes(assetState.tagFilter)
    return (query || collectionAssets || inFolder) && typeMatches && queryMatches && tagMatches && (!collectionAssets || collectionAssets.has(record.uuid)) && (!assetState.favoritesOnly || favorites.has(record.uuid))
  })
}

// Temporary direct-constructor compatibility. Production Editor supplies these through rendererAdapter;
// remove with installMigrationRendererEnvironment after the authoring frontend/legacy fixtures migrate.
import { installMigrationRendererEnvironment } from '../renderer/RendererEnvironment'
installMigrationRendererEnvironment({ assets: {
  get generation() { return assetState.generation },
  get atlasPageCount() { return assetState.atlasPages.length },
  resolveTexture,
  readMaterialSource(reference) { const asset = resolveAsset(reference); return asset?.assetType === 'material' ? readTextAsset(asset.uuid) : null }
} })