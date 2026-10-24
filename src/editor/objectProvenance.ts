/** 对象来源描述：汇总实例与继承关系，生成编辑器可显示的来源条目。 */
import { readTextAsset, resolveAsset } from '../assets/AssetDatabase'
import { readEntityAuthoringData } from '../store/physics'
import { gameplayRuntime } from './gameplayRuntime'
import { eventHandlerKey, readEventSheet, resolveEventHandlers } from '../runtime/eventSheets'
import { readObjectBlueprint, resolvedObjectBlueprint } from '../runtime/objectBlueprints'
import type { Entity } from '../world/Entity'
import { buildObjectProvenance, type ObjectSource, type OwnershipAsset, type OwnershipDiagnostic, type ObjectProvenanceInput } from './objectProvenanceModel'
export * from './objectProvenanceModel'

/** Reads saved source identities and detached snapshots; never normalizes or captures overrides. */
/** 沿蓝图、预制体和事件表继承链收集来源与声明基线，检查循环及缺失资源，并合并运行状态生成归属模型。 */ export function describeObjectProvenance(entity: Entity) {
  const current = readEntityAuthoringData(entity), runtime = gameplayRuntime.inspectObjectRuntime(entity.uuid), authored = runtime.active && runtime.authoredEntity ? runtime.authoredEntity : current
  const sources: ObjectSource[] = [], diagnostics: OwnershipDiagnostic[] = [], composition: NonNullable<ObjectProvenanceInput['composition']> = [], declaredBaselines: NonNullable<ObjectProvenanceInput['declaredBaselines']> = {}
  const asset = /** 解析资源引用并提取身份、名称、路径和类型，缺失资源返回 null。 */ (reference: string | null | undefined): OwnershipAsset | null => {
    const record = resolveAsset(reference)
    return record ? { uuid: record.uuid, name: record.name, path: record.path, assetType: record.assetType } : null
  }
  /** 将存在的资源按关系去重加入来源列表，缺失资源生成可见归属诊断。 */ function add(reference: string | null | undefined, relationship: ObjectSource['relationship'], inherited = false): OwnershipAsset | null {
    if (!reference) return null
    const source = asset(reference)
    if (!source) diagnostics.push({ code: 'OWNERSHIP-ASSET-MISSING', message: `Missing ${relationship} source: ${reference}` })
    else if (!sources.some(/* 先计算 row.asset.uuid === source.uuid；仅当其为真值时求右侧 row.relationship === relationship，返回短路求值结果。 */ row => row.asset.uuid === source.uuid && row.relationship === relationship)) sources.push({ asset: source, relationship, inherited })
    return source
  }
  const components = (Array.isArray(authored.components) ? authored.components : []) as Array<{kind?:string;data?:Record<string,unknown>}>
  const script = components.find(/* 比较 component.kind 与 'Script2D'，返回严格相等的判断结果。 */ component => component.kind === 'Script2D')?.data as Record<string, unknown> | undefined
  const reference = /* 根据 typeof value === 'string' && value 的真假，分别返回 value 或 null。 */ (value: unknown): string | null => typeof value === 'string' && value ? value : null
  const blueprintReference = Object.prototype.hasOwnProperty.call(authored,'objectBlueprintAsset') ? reference(authored.objectBlueprintAsset) : reference(script?.objectBlueprintAsset)
  let blueprint = blueprintReference, first = true
  const blueprintSeen = new Set<string>()
  while (blueprint) {
    const source = add(blueprint, first ? 'blueprint' : 'base-blueprint', !first), document = readObjectBlueprint(blueprint)
    if (!source || !document) { diagnostics.push({ code: 'OWNERSHIP-BLUEPRINT-INVALID', message: `Invalid blueprint source: ${blueprint}` }); break }
    if (blueprintSeen.has(source.uuid) || blueprintSeen.size >= 64) { diagnostics.push({ code: 'OWNERSHIP-BLUEPRINT-CYCLE', message: 'Blueprint inheritance repeats or exceeds 64 sources.', assetUuid: source.uuid }); break }
    for (const kind of document.requiredComponents) composition.push({kind,policy:'required',owner:source})
    for (const kind of document.excludedComponents) composition.push({kind,policy:'excluded',owner:source})
    blueprintSeen.add(source.uuid); blueprint = document.baseBlueprintAsset; first = false
  }
  const prefabReference = reference(authored.prefabAsset), prefabAsset = add(prefabReference, 'prefab', true)
  let prefabEntity: Record<string, unknown> | null = null
  if (prefabReference && prefabAsset) {
    try {
      const document = JSON.parse(readTextAsset(prefabReference) ?? ''), records = document?.bundle?.entities
      prefabEntity = Array.isArray(records) ? records.find(/* 比较 record.uuid 与 authored.prefabSourceUuid，返回严格相等的判断结果。 */ record => record.uuid === authored.prefabSourceUuid) ?? null : null
    } catch { /* The unavailable baseline becomes a visible diagnostic below. */ }
    if (!prefabEntity) diagnostics.push({ code: 'OWNERSHIP-PREFAB-BASELINE', message: 'The matching prefab source entity is unavailable; property ownership cannot be inferred.', assetUuid: prefabAsset.uuid })
  }
  for (const layer of Array.isArray(authored.prefabLayers) ? authored.prefabLayers : []) add(reference(layer.asset), 'prefab-layer', true)
  const resolvedBlueprint = resolvedObjectBlueprint(blueprintReference), blueprintOwner = asset(blueprintReference)
  if (resolvedBlueprint && blueprintOwner) {
    if (prefabEntity) for (const field of ['tags','groups'] as const) declaredBaselines[`Entity.${field}`] = {value:[...new Set([...(Array.isArray(prefabEntity[field]) ? prefabEntity[field] : []),...resolvedBlueprint[field]])],owner:blueprintOwner}
    declaredBaselines['Script2D.objectBlueprintAsset'] = {value:blueprintReference,owner:blueprintOwner}
    if (resolvedBlueprint.eventSheetAsset) declaredBaselines['Script2D.eventSheetAsset'] = {value:resolvedBlueprint.eventSheetAsset,owner:blueprintOwner}
  }
  const eventsReference = reference(script?.eventSheetAsset), sheetSeen = new Set<string>(), ancestorKeys = new Set<string>()
  let sheetReference = eventsReference
  first = true
  while (sheetReference) {
    const source = add(sheetReference, first ? 'events' : 'base-events', !first), document = readEventSheet(sheetReference)
    if (!source || !document) { diagnostics.push({ code: 'OWNERSHIP-EVENTS-INVALID', message: `Invalid Event Sheet source: ${sheetReference}` }); break }
    if (sheetSeen.has(source.uuid) || sheetSeen.size >= 64) { diagnostics.push({ code: 'OWNERSHIP-EVENTS-CYCLE', message: 'Event Sheet inheritance repeats or exceeds 64 sources.', assetUuid: source.uuid }); break }
    sheetSeen.add(source.uuid)
    add(document.logicAsset, 'logic', !first)
    if (!first) for (const handler of document.handlers) ancestorKeys.add(eventHandlerKey(handler))
    sheetReference = document.baseSheetAsset; first = false
  }
  const primaryLogic = add(reference(script?.scriptAsset), 'logic')
  if(primaryLogic && entity.script2D){
    const storedComponents=(Array.isArray(prefabEntity?.components)?prefabEntity.components:[]) as Array<{kind?:string;data?:{properties?:Record<string,unknown>}}>
    const storedProperties=storedComponents.find(/* 比较 item.kind 与 'Script2D'，返回严格相等的判断结果。 */ item=>item.kind==='Script2D')?.data?.properties??{}
    for(const [name,metadata] of Object.entries(entity.script2D.propertyMetadata))if(!Object.prototype.hasOwnProperty.call(storedProperties,name))declaredBaselines[`Script.${name}`]={value:metadata.defaultValue,owner:primaryLogic}
  }
  const events = resolveEventHandlers(eventsReference).map(/** 为解析后的事件处理器标记本地、继承或覆盖来源，并关联事件表和逻辑资源。 */ handler => ({ uuid: handler.uuid, kind: handler.kind, selector: handler.selector, callback: handler.callback, enabled: handler.enabled, priority: handler.priority, origin: handler.inherited ? 'inherited' as const : handler.overrideInherited && ancestorKeys.has(eventHandlerKey(handler)) ? 'overridden' as const : 'local' as const, sheet: asset(handler.sourceSheetAsset), logic: asset(handler.logicAsset) }))
  return buildObjectProvenance({ authored, current, runtime, sources, events, diagnostics, composition, declaredBaselines, prefab: prefabAsset ? { asset: prefabAsset, entity: prefabEntity } : null, hasPrefabReference: Boolean(prefabReference) })
}
