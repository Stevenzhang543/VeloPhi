/** 组件信号目录：声明每种组件（以及场景/输入/网络等作用域）可以发出的信号，供 Inspector 的
 * Signals 区与信号连接对话框使用（主指令 §5.3、§23.4）。
 *
 * 设计约束：**每条信号都必须有真实发射点**。`emittedAt` 记录该信号的发射文件，
 * 校验脚本会到源码里核对该字面量确实存在，因此这里不允许凭想象登记。
 * 动态族（`input.<action>.<phase>`、`ui.*`、`animation.*`）以模板形式登记并标记 `dynamic`。 */

export type SignalScope = 'entity' | 'scene' | 'input' | 'ui' | 'network' | 'animation'
export type SignalParamType = 'entity' | 'number' | 'string' | 'vector2' | 'object'

export interface ComponentSignalParam {
  readonly id: string
  readonly type: SignalParamType
  /** 参数的用途说明键；具体文案由 i18n 层提供，避免在目录里硬编码多语言文本。 */
  readonly summaryKey: string
}

export interface ComponentSignalDescriptor {
  /** 信号名；动态族使用带尖括号的模板。 */
  readonly id: string
  /** 归属的组件种类；非组件作用域使用 @ 前缀的伪种类。 */
  readonly kind: string
  readonly scope: SignalScope
  readonly summaryKey: string
  readonly params: readonly ComponentSignalParam[]
  /** 真实发射点（相对仓库根的路径），用于与源码核对。 */
  readonly emittedAt: string
  /** 由运行时按名称拼接的动态信号。 */
  readonly dynamic?: boolean
}

/** 伪种类：不属于任何组件，但节点/场景级信号需要被展示与连接。 */
export const SIGNAL_SCOPE_KINDS = { scene: '@scene', input: '@input', network: '@network', ui: '@ui', animation: '@animation' } as const

export const COMPONENT_SIGNALS: readonly ComponentSignalDescriptor[] = Object.freeze([
  { id: 'area.entered', kind: 'Area2D', scope: 'entity', summaryKey: 'signal.areaEntered', params: [{ id: 'area', type: 'entity', summaryKey: 'signal.paramArea' }], emittedAt: 'src/runtime/worldGameplayOwner.ts' },
  { id: 'area.exited', kind: 'Area2D', scope: 'entity', summaryKey: 'signal.areaExited', params: [{ id: 'area', type: 'entity', summaryKey: 'signal.paramArea' }], emittedAt: 'src/runtime/worldGameplayOwner.ts' },
  { id: 'area.damage', kind: 'Area2D', scope: 'entity', summaryKey: 'signal.areaDamage', params: [{ id: 'amount', type: 'number', summaryKey: 'signal.paramAmount' }, { id: 'area', type: 'entity', summaryKey: 'signal.paramArea' }], emittedAt: 'src/runtime/worldGameplayOwner.ts' },
  // 名称可被 AreaEffector2D 的 effect.signal 覆盖；area.effect 只是默认值，因此标为动态。
  { id: 'area.effect', kind: 'AreaEffector2D', scope: 'entity', summaryKey: 'signal.areaEffect', params: [{ id: 'area', type: 'entity', summaryKey: 'signal.paramArea' }, { id: 'strength', type: 'number', summaryKey: 'signal.paramStrength' }], emittedAt: 'src/runtime/worldGameplayOwner.ts', dynamic: true },
  { id: 'portal.entered', kind: 'Portal2D', scope: 'entity', summaryKey: 'signal.portalEntered', params: [{ id: 'portal', type: 'entity', summaryKey: 'signal.paramPortal' }, { id: 'targetScene', type: 'string', summaryKey: 'signal.paramTargetScene' }], emittedAt: 'src/runtime/worldGameplayOwner.ts' },
  { id: 'entity.spawned', kind: 'Spawner2D', scope: 'entity', summaryKey: 'signal.entitySpawned', params: [{ id: 'entity', type: 'entity', summaryKey: 'signal.paramEntity' }], emittedAt: 'src/runtime/GameplayRuntimeCore.ts' },
  // 26.46 rhythm charts.
  { id: 'rhythm.started', kind: 'RhythmChart2D', scope: 'entity', summaryKey: 'signal.rhythmStarted', params: [{ id: 'title', type: 'string', summaryKey: 'signal.paramTitle' }, { id: 'time', type: 'number', summaryKey: 'signal.paramTime' }], emittedAt: 'src/runtime/rhythmOwner.ts' },
  { id: 'rhythm.hit', kind: 'RhythmChart2D', scope: 'entity', summaryKey: 'signal.rhythmHit', params: [{ id: 'judgement', type: 'string', summaryKey: 'signal.paramJudgement' }, { id: 'offsetMs', type: 'number', summaryKey: 'signal.paramOffset' }, { id: 'lane', type: 'number', summaryKey: 'signal.paramLane' }, { id: 'combo', type: 'number', summaryKey: 'signal.paramCombo' }], emittedAt: 'src/runtime/rhythmOwner.ts' },
  { id: 'rhythm.miss', kind: 'RhythmChart2D', scope: 'entity', summaryKey: 'signal.rhythmMiss', params: [{ id: 'lane', type: 'number', summaryKey: 'signal.paramLane' }, { id: 'kind', type: 'string', summaryKey: 'signal.paramKind' }], emittedAt: 'src/runtime/rhythmOwner.ts' },
  { id: 'rhythm.beat', kind: 'RhythmChart2D', scope: 'entity', summaryKey: 'signal.rhythmBeat', params: [{ id: 'beat', type: 'number', summaryKey: 'signal.paramBeat' }, { id: 'bpm', type: 'number', summaryKey: 'signal.paramBpm' }], emittedAt: 'src/runtime/rhythmOwner.ts' },
  { id: 'rhythm.finished', kind: 'RhythmChart2D', scope: 'entity', summaryKey: 'signal.rhythmFinished', params: [{ id: 'score', type: 'number', summaryKey: 'signal.paramScore' }, { id: 'accuracy', type: 'number', summaryKey: 'signal.paramAccuracy' }, { id: 'rank', type: 'string', summaryKey: 'signal.paramRank' }], emittedAt: 'src/runtime/rhythmOwner.ts' },
  { id: 'scene.started', kind: SIGNAL_SCOPE_KINDS.scene, scope: 'scene', summaryKey: 'signal.sceneStarted', params: [], emittedAt: 'src/runtime/GameplayRuntimeCore.ts' },
  { id: 'scene.loaded', kind: SIGNAL_SCOPE_KINDS.scene, scope: 'scene', summaryKey: 'signal.sceneLoaded', params: [], emittedAt: 'src/runtime/GameplayRuntimeCore.ts' },
  { id: 'scene.unloading', kind: SIGNAL_SCOPE_KINDS.scene, scope: 'scene', summaryKey: 'signal.sceneUnloading', params: [], emittedAt: 'src/runtime/GameplayRuntimeCore.ts' },
  { id: 'input.<action>.<phase>', kind: SIGNAL_SCOPE_KINDS.input, scope: 'input', summaryKey: 'signal.inputAction', params: [{ id: 'action', type: 'string', summaryKey: 'signal.paramAction' }, { id: 'phase', type: 'string', summaryKey: 'signal.paramPhase' }], emittedAt: 'src/runtime/GameplayRuntimeCore.ts', dynamic: true },
  { id: 'network.input', kind: SIGNAL_SCOPE_KINDS.network, scope: 'network', summaryKey: 'signal.networkInput', params: [{ id: 'player', type: 'string', summaryKey: 'signal.paramPlayer' }], emittedAt: 'src/runtime/GameplayRuntimeCore.ts' },
  { id: 'network.scene_handoff', kind: SIGNAL_SCOPE_KINDS.network, scope: 'network', summaryKey: 'signal.networkSceneHandoff', params: [{ id: 'scene', type: 'string', summaryKey: 'signal.paramScene' }], emittedAt: 'src/runtime/GameplayRuntimeCore.ts' },
])

/** 返回某组件种类可发出的信号；未知种类返回空列表而不是抛错。 */
export function signalsForComponent(kind: string): readonly ComponentSignalDescriptor[] {
  return COMPONENT_SIGNALS.filter(/** 只取该组件登记的信号。 */ signal => signal.kind === kind)
}

/** 汇总一个节点（由它的组件种类集合表示）可发出的信号，用于 Inspector 的 Signals 区。 */
export function signalsForEntity(kinds: readonly string[]): readonly ComponentSignalDescriptor[] {
  const owned = new Set(kinds)
  return COMPONENT_SIGNALS.filter(/** 只保留该节点确实拥有的组件所对应的信号。 */ signal => owned.has(signal.kind))
}

/** 按作用域筛选，供"连接信号"对话框分组展示。 */
export function signalsByScope(scope: SignalScope): readonly ComponentSignalDescriptor[] {
  return COMPONENT_SIGNALS.filter(/** 只取指定作用域。 */ signal => signal.scope === scope)
}
