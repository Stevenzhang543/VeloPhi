/** The Editor's gameplay runtime: the one GameplayRuntimeCore, composed with the Editor's script services,
 * world host, game flow and debug adapters. 26.46: moved here from src/runtime/GameplayRuntime.ts so no
 * runtime module reaches Editor modules (the last M1 migration gap). */
import { GameplayRuntime as GameplayRuntimeCore } from '../runtime/GameplayRuntimeCore'
import { createEditorGameplayScriptServices } from './gameplayScriptServices'
import { createEditorGameplayWorldHost } from './gameplayWorldHost'
import { getEditorGameFlowOwner } from './gameFlowAdapter'
import { installEditorScriptDebugOwnerProvider } from './scriptDebugAdapter'
import { installEditorScriptHotReloadOwnerProvider } from './scriptHotReloadAdapter'
import type { GameplayScriptServices } from '../runtime/scriptServices'

export type { ExportedProperty, RuntimeDiagnostics, GameplayInputReceiptObservation, GameplayInputFrameObservation, GameplayInputObservationCallbacks } from '../runtime/GameplayRuntimeCore'
export { GameplayRuntimeCore }
export { DEFAULT_SCRIPT_SOURCE } from '../runtime/GameplayRuntimeCore'

/** Existing constructor and import names retain the Editor's existing World/catalog. */
export class GameplayRuntime extends GameplayRuntimeCore {
  constructor(scriptServices?: GameplayScriptServices,options:{legacyDebugRoot?:boolean}={}) { super(scriptServices??createEditorGameplayScriptServices(), createEditorGameplayWorldHost({legacyAnimationRoot:scriptServices===undefined,legacyDebugRoot:options.legacyDebugRoot===true}), null, getEditorGameFlowOwner()) }
}

export const gameplayRuntime = new GameplayRuntime(undefined,{legacyDebugRoot:true})
installEditorScriptDebugOwnerProvider(()=>gameplayRuntime.scriptDebugger)
installEditorScriptHotReloadOwnerProvider(()=>gameplayRuntime.scriptHotReload)
