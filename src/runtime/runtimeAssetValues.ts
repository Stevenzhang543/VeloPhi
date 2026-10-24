/** Shared runtime asset identity and source-text value algorithms; no Editor state. */
import { assetSourceBytes } from '../assets/contentHash'

export interface RuntimeAssetIdentityView { readonly uuid: string; readonly path: string }
export interface RuntimeAssetSourceView { readonly source: string; readonly assetType: string; readonly mimeType: string }
export interface RuntimeAssetModuleView extends RuntimeAssetIdentityView { readonly assetType: string }
export const RUNTIME_SCRIPT_TEXT_TYPES: readonly string[] = Object.freeze(['script', 'visualScript', 'eventSheet', 'objectBlueprint', 'prefab', 'scene', 'material', 'animation', 'controller', 'animationMask', 'rig', 'skin', 'timeline', 'tileset', 'atlas', 'shader', 'localization', 'uiTheme', 'behaviorTree', 'stateMachine', 'tilePalette', 'brushPreset', 'terrainRules', 'dataSchema', 'dataTable', 'replay', 'path', 'particleSystem', 'resource', 'chart'])
export const ASSET_REFERENCE_LIMITS = Object.freeze({ textBytes: 16 * 1024 * 1024, values: 1_000_000, depth: 64 })

export function runtimeAssetGuid(reference: string | null | undefined): string | null {
  if (!reference?.startsWith('asset://')) return null
  return reference.slice('asset://'.length)
}
export function createRuntimeAssetIndex<T extends RuntimeAssetIdentityView>(records: readonly T[]): { records: T[]; byUuid: Map<string, T> } {
  const indexedRecords = [...records].sort(/* 先计算 a.path.localeCompare(b.path)；仅当其为假值时求右侧 a.uuid.localeCompare(b.uuid)，返回短路求值结果。 */ (a, b) => a.path.localeCompare(b.path) || a.uuid.localeCompare(b.uuid))
  const recordsByUuid = new Map(indexedRecords.map(/* 返回按声明顺序构造的数组 [record.uuid, record]。 */ record => [record.uuid, record]))
  return { records: indexedRecords, byUuid: recordsByUuid }
}
export function resolveRuntimeAssetGuid<T>(guid: string | null | undefined, recordsByUuid: ReadonlyMap<string, T>): T | null { return guid ? recordsByUuid.get(guid) ?? null : null }
export function resolveRuntimeModuleAsset<T extends RuntimeAssetModuleView>(reference: string, resolveAsset: (reference: string) => T | null, records: readonly T[]): { uuid: string; path: string; assetType: 'script' | 'visualScript' } | null {
      const asset = resolveAsset(reference) ?? records.find(candidate => candidate.path === reference)
      return asset && (asset.assetType === 'script' || asset.assetType === 'visualScript')
        ? { uuid: asset.uuid, path: asset.path, assetType: asset.assetType } : null
    }
export function resolveRuntimeResourceRecord<T extends RuntimeAssetIdentityView>(referenceValue: string | null | undefined, assets: readonly T[]): T | null {
  const id=(referenceValue??'').replace(/^asset:\/\//,'').toLowerCase()
  return assets.find(/* 比较 asset.uuid.toLowerCase() 与 id，返回严格相等的判断结果。 */ asset=>asset.uuid.toLowerCase()===id)??null
}
export function readRuntimeScriptText(record: RuntimeAssetSourceView | null): string | null {
  if (!record || !RUNTIME_SCRIPT_TEXT_TYPES.includes(record.assetType)) return null
  const comma = record.source.indexOf(',')
  if (!record.source.startsWith('data:') || comma < 0) return record.source || null
  try {
    const metadata = record.source.slice(0, comma)
    const payload = record.source.slice(comma + 1)
    if (!metadata.includes(';base64')) return decodeURIComponent(payload)
    const binary = atob(payload)
    return new TextDecoder().decode(Uint8Array.from(binary, /* 调用 character.charCodeAt(0) 并返回调用结果。 */ character => character.charCodeAt(0)))
  } catch {
    return null
  }
}
export function runtimeAssetSourceText(asset: RuntimeAssetSourceView): string | null {
  if (['image', 'audio', 'font'].includes(asset.assetType)) return null
  const bytes = assetSourceBytes(asset.source)
  if (bytes.length > ASSET_REFERENCE_LIMITS.textBytes) throw new Error('ASSET_REFERENCE_LIMIT: Text asset exceeds the 16 MiB dependency-analysis limit.')
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { return null }
}
