/** Nova 资源包格式：组织文件索引与数据，读取、构建及校验归档内容。 */
import { localizationBuildDependencies } from '../assets/localizationDependencies'
import type { AssetRecord } from '../assets/types'
import { NOVA_ENGINE_VERSION } from '../projects/projectFormat'
import { NOVA_PAK_MAGIC, NOVA_PAK_HEADER_BYTES, NOVA_PAK_VERSION, NOVA_PAK_COMPATIBILITY_LIMITS, safePackagePath, runtimePackagePathKey, bytesToBase64, parseRuntimeNovaPak, projectJsonFromParsedNovaPak } from './novaPakReader'
import type { NovaPakEntry, NovaPakIndex, ParsedNovaPak, RuntimePakLimits } from './novaPakReader'
import { createWebNovaPakCapabilities, packageSha256 as sha256 } from '../platform/webNovaPakCodecs'
export { NOVA_PAK_COMPATIBILITY_LIMITS } from './novaPakReader'
const packageCodecs = createWebNovaPakCapabilities()


const MAGIC = new TextEncoder().encode(NOVA_PAK_MAGIC)
const HEADER_BYTES = NOVA_PAK_HEADER_BYTES
export { NOVA_PAK_VERSION } from './novaPakReader'

export type { NovaPakEntry } from './novaPakReader'
export type { NovaPakIndex } from './novaPakReader'

export type { ParsedNovaPak } from './novaPakReader'

/** 结构说明（自动提取）：concatenate；输入 parts；直接调用 Uint8Array、parts.reduce、result.set；写入 cursor；返回路径包含 result；包含循环处理。 */ function concatenate(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce(/* 计算表达式 total + part.byteLength 并返回结果，沿用操作数的原有类型规则。 */ (total, part) => total + part.byteLength, 0))
  let cursor = 0
  for (const part of parts) { result.set(part, cursor); cursor += part.byteLength }
  return result
}

/* 调用 [...bytes].map(value => value.toString(16).padStart(2, '0')).join('') 并返回调用结果。 */ /* Shared bytesToHex implementation is imported above; no second package-read algorithm. */

/** 结构说明（自动提取）：sha256；输入 bytes；直接调用 bytes.buffer.slice、bytesToHex、Uint8Array、crypto.subtle.digest；等待异步结果。 */ /* Shared sha256 implementation is imported above; no second package-read algorithm. */

/** 结构说明（自动提取）：gzip；输入 bytes；直接调用 pipeThrough、stream、Blob、bytes.buffer.slice、CompressionStream 等；等待异步结果。 */ async function gzip(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (!('CompressionStream' in globalThis) || bytes.byteLength < 128) return null
  const stream = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** 结构说明（自动提取）：gunzip；输入 bytes；直接调用 Error、pipeThrough、stream、Blob、bytes.buffer.slice 等；等待异步结果；包含显式抛错路径。 */ /* Shared gunzip implementation is imported above; no second package-read algorithm. */

/** 结构说明（自动提取）：safePackagePath；输入 value；直接调用 replace、value.replace、some、normalized.split、Error；返回路径包含 normalized；包含显式抛错路径。 */ /* Shared safePackagePath implementation is imported above; no second package-read algorithm. */

const INLINE_TEXT_ASSET_TYPES = new Set(['script', 'prefab', 'scene', 'material', 'animation', 'controller', 'animationMask', 'rig', 'skin', 'timeline', 'tileset', 'atlas', 'shader', 'localization', 'uiTheme', 'behaviorTree', 'stateMachine', 'tilePalette', 'brushPreset', 'terrainRules', 'dataSchema', 'dataTable', 'replay', 'resource', 'chart'])

/** 结构说明（自动提取）：assetBytes；输入 asset；直接调用 Error、INLINE_TEXT_ASSET_TYPES.has、asset.mimeType.startsWith、asset.mimeType.includes、test 等；等待异步结果；包含显式抛错路径。 */ async function assetBytes(asset: AssetRecord): Promise<Uint8Array> {
  if (!asset.source) throw new Error(`Asset ${asset.name} has no imported source data`)
  const inlineText = INLINE_TEXT_ASSET_TYPES.has(asset.assetType)
    || asset.mimeType?.startsWith('text/')
    || asset.mimeType?.includes('json')
    || asset.mimeType?.startsWith('application/x-nova-')
  if (inlineText && !/^(?:data:|blob:|https?:)/i.test(asset.source)) return new TextEncoder().encode(asset.source)
  const response = await fetch(asset.source)
  if (!response.ok && !asset.source.startsWith('data:') && !asset.source.startsWith('blob:')) throw new Error(`Could not read ${asset.path}`)
  return new Uint8Array(await response.arrayBuffer())
}

export interface NovaPakBuildOptions { deterministic?: boolean; compression?: 'store' | 'balanced' | 'maximum'; authoritativeAssets?: boolean }

/** 结构说明（自动提取）：createNovaPak；输入 projectJson、assets、startupSceneUuid、options；直接调用 assets.map、Set、toLowerCase、safePackagePath、asset.uuid.toLowerCase 等；写入 assets、projectAssets、project.assets、settings.scripting.debuggerEnabled 等；包含循环处理；等待异步结果；包含显式抛错路径。 */ export async function createNovaPak(projectJson: string, assets: AssetRecord[], startupSceneUuid: string, options: NovaPakBuildOptions = {}): Promise<Uint8Array> {
  // All package identity/source fields are scalar: capture them before the first asynchronous read.
  assets=assets.map(/** 构造并返回记录 {...asset}，字段按当前实参及捕获状态求值。 */ asset=>({...asset}))
  const identities=new Set<string>(),paths=new Set(['project.nova'])
  for(const asset of assets){const path=runtimePackagePathKey(safePackagePath(asset.path)),id=asset.uuid.toLowerCase();if(identities.has(id)||paths.has(path))throw new Error(`Duplicate package asset identity/path: ${asset.path}`);identities.add(id);paths.add(path)}
  const project = JSON.parse(projectJson) as Record<string, unknown>
  const developmentBuild = (project.projectSettings as { build?: { developmentBuild?: boolean } } | undefined)?.build?.developmentBuild !== false
  const packageEntries = project.packages && typeof project.packages === 'object' && Array.isArray((project.packages as Record<string, unknown>).installed)
    ? (project.packages as { installed: Array<Record<string, unknown>> }).installed : []
  const networkingIncluded = packageEntries.some(/** 结构说明（自动提取）：packageEntries.some 回调；输入 item。 */ item => {
    const manifest = item.manifest && typeof item.manifest === 'object' ? item.manifest as Record<string, unknown> : {}
    return manifest.id === 'top.whitelists.novaa.networking' && item.enabled !== false && item.project !== false
  })
  const projectSettings = project.projectSettings && typeof project.projectSettings === 'object' ? project.projectSettings as Record<string, unknown> : {}
  const production = projectSettings.production && typeof projectSettings.production === 'object' ? projectSettings.production as Record<string, unknown> : null
  if (production && !networkingIncluded) delete production.networking
  let projectAssets = Array.isArray(project.assets) ? project.assets as Array<Record<string, unknown>> : []
  const componentKinds = new Set((Array.isArray(project.scenes) ? project.scenes : []).flatMap(/** 结构说明（自动提取）：flatMap 回调；输入 scene；直接调用 Array.isArray、entities.flatMap。 */ scene => {
    const entities = scene && typeof scene === 'object' && Array.isArray((scene as Record<string, unknown>).entities) ? (scene as { entities: unknown[] }).entities : []
    return entities.flatMap(/** 结构说明（自动提取）：entities.flatMap 回调；输入 entity；直接调用 Array.isArray、components.map；返回表达式求值结果。 */ entity => entity && typeof entity === 'object' && Array.isArray((entity as Record<string, unknown>).components)
      ? (entity as { components: Array<Record<string, unknown>> }).components.map(/* 返回 component.kind 的当前值。 */ component => component.kind)
      : [])
  }).filter(/* 比较 typeof kind 与 'string'，返回严格相等的判断结果。 */ (kind): kind is string => typeof kind === 'string'))
  const usesRigging = componentKinds.has('Skeleton2D')
  const usesTimeline = componentKinds.has('TimelinePlayer')
  const selectedLocaleAssets = localizationBuildDependencies(assets, project).assetUuids
  const excludedOptionalUuids = new Set(projectAssets.flatMap(/** 结构说明（自动提取）：projectAssets.flatMap 回调；输入 asset；直接调用 String、selectedLocaleAssets.has、toLowerCase。 */ asset => {
    const type = String(asset.assetType)
    const unused = (type === 'rig' || type === 'skin') ? !usesRigging : type === 'timeline' ? !usesTimeline : type === 'localization' ? !selectedLocaleAssets.has(String(asset.uuid).toLowerCase()) : false
    return unused && typeof asset.uuid === 'string' ? [asset.uuid] : []
  }))
  if(options.authoritativeAssets)excludedOptionalUuids.clear()
  const selectedUuids=new Set(assets.map(/* 返回 asset.uuid 的当前值。 */ asset=>asset.uuid))
  projectAssets = projectAssets.filter(/* 先计算 selectedUuids.has(String(asset.uuid))；仅当其为真值时求右侧 !excludedOptionalUuids.has(String(asset.uuid))，返回短路求值结果。 */ asset => selectedUuids.has(String(asset.uuid)) && !excludedOptionalUuids.has(String(asset.uuid)))
  project.assets = projectAssets
  for (const asset of projectAssets) {
    delete asset.source
    if (!developmentBuild && (asset.assetType === 'script' || asset.assetType === 'visualScript')) delete asset.script
  }
  if (!developmentBuild) {
    const settings = project.projectSettings as { scripting?: Record<string, unknown> } | undefined
    if (settings?.scripting) {
      settings.scripting.debuggerEnabled = false
      delete settings.scripting.customSignals
    }
  }
  const projectBytes = new TextEncoder().encode(JSON.stringify(project))
  const sources: Array<{ path: string; bytes: Uint8Array; mimeType: string; asset?: AssetRecord }> = [
    { path: 'project.nova', bytes: projectBytes, mimeType: 'application/x-nova-project' }
  ]
  for (const asset of assets) {
    if (excludedOptionalUuids.has(asset.uuid)) continue
    sources.push({ path: safePackagePath(asset.path), bytes: await assetBytes(asset), mimeType: asset.mimeType || 'application/octet-stream', asset })
  }
  sources.sort(/* 根据 first.path < second.path 的真假，分别返回 -1 或 first.path > second.path ? 1 : 0。 */ (first, second) => first.path < second.path ? -1 : first.path > second.path ? 1 : 0)

  const entries: NovaPakEntry[] = []
  const blocks: Uint8Array[] = []
  let offset = 0
  for (const source of sources) {
    const compressed = options.compression === 'store' ? null : await gzip(source.bytes)
    const savingsRequired = options.compression === 'maximum' ? 0 : 16
    const useCompressed = compressed !== null && compressed.byteLength + savingsRequired < source.bytes.byteLength
    const block = useCompressed ? compressed : source.bytes
    entries.push({
      path: source.path,
      offset,
      length: block.byteLength,
      originalLength: source.bytes.byteLength,
      codec: useCompressed ? 'gzip' : 'store',
      mimeType: source.mimeType,
      sha256: await sha256(source.bytes),
      assetUuid: source.asset?.uuid,
      assetType: source.asset?.assetType
    })
    blocks.push(block)
    offset += block.byteLength
  }

  const physicsProfile = projectSettings.physics && typeof projectSettings.physics === 'object'
    ? (projectSettings.physics as { profile?: unknown }).profile
    : undefined
  const index: NovaPakIndex = {
    format: 'nova-pak', version: NOVA_PAK_VERSION,
    engineVersion: String(project.engineVersion ?? NOVA_ENGINE_VERSION),
    createdAt: options.deterministic === false ? new Date().toISOString() : '1970-01-01T00:00:00.000Z', startupSceneUuid,
    physicsProfile: physicsProfile && typeof physicsProfile === 'object' ? structuredClone(physicsProfile as Record<string, unknown>) : undefined,
    entries
  }
  const indexBytes = new TextEncoder().encode(JSON.stringify(index))
  const header = new Uint8Array(HEADER_BYTES)
  header.set(MAGIC)
  const view = new DataView(header.buffer)
  view.setUint32(8, NOVA_PAK_VERSION, true)
  view.setUint32(12, indexBytes.byteLength, true)
  return concatenate([header, indexBytes, ...blocks])
}

/** 结构说明（自动提取）：parseNovaPak；输入 source；直接调用 Uint8Array、MAGIC.every、Error、DataView、view.getUint32 等；包含循环处理；等待异步结果；包含显式抛错路径。 */ export async function parseNovaPak(source: ArrayBuffer | Uint8Array, limits: RuntimePakLimits = NOVA_PAK_COMPATIBILITY_LIMITS, signal?: AbortSignal): Promise<ParsedNovaPak> {
  return parseRuntimeNovaPak(source, packageCodecs, limits, signal)
}

/** 结构说明（自动提取）：bytesToBase64；输入 bytes；直接调用 String.fromCharCode、bytes.subarray、btoa；写入 index、result；包含循环处理。 */ /* Shared bytesToBase64 implementation is imported above; no second package-read algorithm. */

/* 调用 bytesToBase64(bytes) 并返回调用结果。 */ export function packageBase64(bytes: Uint8Array): string { return bytesToBase64(bytes) }

/** 结构说明（自动提取）：projectJsonFromNovaPak；输入 source；直接调用 parseNovaPak、parsed.files.get、Error、JSON.parse、decode 等；写入 asset.source、project.activeSceneUuid；包含循环处理；等待异步结果；包含显式抛错路径。 */ export async function projectJsonFromNovaPak(source: ArrayBuffer | Uint8Array, limits: RuntimePakLimits = NOVA_PAK_COMPATIBILITY_LIMITS, signal?: AbortSignal): Promise<string> {
  return projectJsonFromParsedNovaPak(await parseNovaPak(source, limits, signal))
}
