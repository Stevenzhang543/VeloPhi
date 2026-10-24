import type { Entity } from '../world/Entity'
import type { InputSnapshot } from './input'
import { cloneNetworkInput } from './networkInput'
import { NetworkSessionOwner } from './networkSessionOwner'
import type { NetworkConfigurationHost } from './networkSessionContracts'
type NetworkingModule=NetworkSessionOwner
export interface ProductionNetworkPorts { packageId:string;packageEnabled(id:string):boolean;loadSession():Promise<NetworkSessionOwner>;reportRecoverableError(error:unknown,label:string,category:'Runtime'):void }
export interface ProductionRemoteInputFrame {
  readonly peerId: string
  readonly tick: number
  readonly input: InputSnapshot
  readonly targetEntityUuids: readonly string[]
}
export class ProductionNetworkOwner {
 readonly world:NetworkConfigurationHost['world']
 private get configuration(){return this.host.readConfiguration()}
 private networking:NetworkingModule | null=null
 /** 26.47: a network session is running (its state checksums are needed every fixed step). */
 get networkingActive():boolean{return this.networking!==null}
 private loading:Promise<void> | null=null
 private lifecycleGeneration=0
 private rpcListeners=new Set<(name: string, payload: unknown, context: { sender: string; tick: number }) => void>()
 private rpcCleanups:Array<() => void>=[]
 private rpcBindingSignature=''
 private sceneHandoffListeners=new Set<(sceneUuid: string, spawnTag: string, peerId: string) => void>()
 private sceneHandoffCleanup:(() => void) | null=null
 private remoteInputListeners=new Set<(frame: ProductionRemoteInputFrame) => void>()
 constructor(private readonly host:NetworkConfigurationHost,private readonly ports:ProductionNetworkPorts){if(!host?.world||typeof host.readConfiguration!=='function'||typeof ports?.packageId!=='string'||['packageEnabled','loadSession','reportRecoverableError'].some(key=>typeof ports[key as keyof ProductionNetworkPorts]!=='function'))throw new Error('PRODUCTION_NETWORK_PORTS_REQUIRED');this.world=host.world}
dispatchRemoteInputs(module: NetworkingModule): void {
  for (const raw of module.drainRemoteInputs(64)) {
    const peerId = raw.peerId.trim().slice(0, 80)
    const tick = Number.isSafeInteger(raw.tick) ? Math.max(0, Math.min(0x7fff_ffff, raw.tick)) : 0
    const targetEntityUuids = [...new Set(raw.targetEntityUuids
      .filter(/* 比较 typeof uuid 与 'string'，返回严格相等的判断结果。 */ (uuid): uuid is string => typeof uuid === 'string')
      .map(/* 调用 uuid.trim().slice(0, 128) 并返回调用结果。 */ uuid => uuid.trim().slice(0, 128))
      .filter(Boolean))]
      .slice(0, 2_000)
      .sort()
    if (!peerId || !targetEntityUuids.length) continue
    for (const listener of this.remoteInputListeners) {
      try {
        listener(Object.freeze({ peerId, tick, input: cloneNetworkInput(raw.input), targetEntityUuids: Object.freeze([...targetEntityUuids]) }))
      } catch (error) {
        this.ports.reportRecoverableError(error, 'Remote gameplay input listener', 'Runtime')
      }
    }
  }
}

bindRpcHandlers(module: NetworkingModule): void {
  this.rpcBindingSignature = JSON.stringify(this.configuration.networking.rpcContracts.map(/* 返回 contract.name 的当前值。 */ contract => contract.name))
  for (const cleanup of this.rpcCleanups) cleanup()
  this.rpcCleanups = this.configuration.networking.rpcContracts.map(/** 结构说明（自动提取）：productionSettings.networking.rpcContracts.map 回调；输入 contract；直接调用 module.registerRpc；返回表达式求值结果。 */ contract => module.registerRpc(contract.name, /** 结构说明（自动提取）：module.registerRpc 回调；输入 payload、context；直接调用 listener；包含循环处理。 */ (payload, context) => {
    for (const listener of this.rpcListeners) listener(contract.name, payload, context)
  }))
  this.sceneHandoffCleanup?.()
  this.sceneHandoffCleanup = module.registerNetworkSceneHandoff(/** 结构说明（自动提取）：module.registerNetworkSceneHandoff 回调；输入 sceneUuid、spawnTag、peerId；直接调用 listener；包含循环处理。 */ (sceneUuid, spawnTag, peerId) => { for (const listener of this.sceneHandoffListeners) listener(sceneUuid, spawnTag, peerId) })
}

async loadNetworkingModule(): Promise<NetworkingModule> {
  if (!this.ports.packageEnabled(this.ports.packageId)) throw new Error('The optional Nova Networking package is not installed.')
  if (this.networking) return this.networking
  if (this.loading) { const waitingGeneration=this.lifecycleGeneration;await this.loading;if(waitingGeneration!==this.lifecycleGeneration)throw new Error('PRODUCTION_NETWORK_LOAD_CANCELLED'); if (!this.networking) throw new Error('Networking did not finish loading.'); return this.networking }
  const generation = ++this.lifecycleGeneration
  this.loading = this.ports.loadSession()
    .then(/** 结构说明（自动提取）：then 回调；输入 module；直接调用 bindRpcHandlers；写入 networking。 */ module => {
      if (generation !== this.lifecycleGeneration) return
      if(!(module instanceof NetworkSessionOwner)||module.world!==this.world)throw new Error('PRODUCTION_NETWORK_SESSION_WORLD_MISMATCH')
      this.networking = module
      this.bindRpcHandlers(module)
    })
    .catch(/** 结构说明（自动提取）：catch 回调；输入 error；直接调用 reportRecoverableError；写入 networking。 */ error => {
      if(generation!==this.lifecycleGeneration)return
      this.networking = null
      this.ports.reportRecoverableError(error, 'Optional networking startup', 'Runtime')
    })
    .finally(/** 结构说明（自动提取）：finally 回调；无显式参数；写入 loading。 */ () => {
      if (generation === this.lifecycleGeneration) this.loading = null
    })
  await this.loading
  if(generation!==this.lifecycleGeneration)throw new Error('PRODUCTION_NETWORK_LOAD_CANCELLED')
  if (!this.networking) throw new Error('Networking could not be loaded.')
  return this.networking
}

async ensureNetworking(start: boolean): Promise<NetworkingModule> {
  if (!this.configuration.networking.enabled) throw new Error('Networking is disabled for this project.')
  if (!this.configuration.networking.permissionGranted) throw new Error('Network permission has not been granted.')
  const module = await this.loadNetworkingModule()
  if(module!==this.networking)throw new Error('PRODUCTION_NETWORK_LOAD_CANCELLED')
  this.bindRpcHandlers(module)
  if (start) await module.startNetworking()
  return module
}

beginProductionRuntime(): void {
  if (!this.configuration.networking.enabled || !this.configuration.networking.permissionGranted || !this.configuration.networking.autoStart || !this.ports.packageEnabled(this.ports.packageId) || this.loading || this.networking) return
  void this.ensureNetworking(true).catch(error=>{if(error instanceof Error&&(error.name==='AbortError'||error.message==='PRODUCTION_NETWORK_LOAD_CANCELLED'))return;this.ports.reportRecoverableError(error,'Optional networking startup','Runtime')})
}

async startProductionNetworking(): Promise<NetworkingModule> { return this.ensureNetworking(true) }

async networkingModule(): Promise<NetworkingModule> { return this.loadNetworkingModule() }

productionNetworkContext(): { enabled: boolean; connected: boolean; authority: boolean; peerCount: number; localPeerId: string; role: string; tick: number } {
  const state = this.networking?.networkingState
  return { enabled: this.configuration.networking.enabled && this.configuration.networking.permissionGranted, connected: state?.status === 'connected', authority: this.configuration.networking.role === 'server' || this.configuration.networking.role === 'host', peerCount: state?.peers ?? 0, localPeerId: state?.localPeerId ?? '', role: this.configuration.networking.role, tick: state?.currentTick ?? 0 }
}

callProductionRpc(name: string, payload: unknown): boolean { return this.networking?.callRpc(name, payload) ?? false }

onProductionRpc(listener: (name: string, payload: unknown, context: { sender: string; tick: number }) => void): () => void { this.rpcListeners.add(listener); return /* 调用 rpcListeners.delete(listener) 并返回调用结果。 */ () => this.rpcListeners.delete(listener) }

onProductionSceneHandoff(listener: (sceneUuid: string, spawnTag: string, peerId: string) => void): () => void { this.sceneHandoffListeners.add(listener); return /* 调用 sceneHandoffListeners.delete(listener) 并返回调用结果。 */ () => this.sceneHandoffListeners.delete(listener) }

onProductionRemoteInput(listener: (frame: ProductionRemoteInputFrame) => void): () => void {
  if (this.remoteInputListeners.size >= 32) throw new Error('Remote gameplay input listener limit reached.')
  this.remoteInputListeners.add(listener)
  return /* 调用 remoteInputListeners.delete(listener) 并返回调用结果。 */ () => this.remoteInputListeners.delete(listener)
}

async stopProductionNetworking(): Promise<void> {
  this.lifecycleGeneration++
  const active = this.networking
  this.networking = null; this.loading = null; for (const cleanup of this.rpcCleanups) cleanup(); this.rpcCleanups = []; this.sceneHandoffCleanup?.(); this.sceneHandoffCleanup = null
  if (active) await active.stopNetworking()
}

updateProductionRuntime(entities: Entity[], fixedDelta: number, input?: InputSnapshot, physicsChecksum = ''): void {
  if (!this.networking) return
  if (this.rpcBindingSignature !== JSON.stringify(this.configuration.networking.rpcContracts.map(/* 返回 contract.name 的当前值。 */ contract => contract.name))) this.bindRpcHandlers(this.networking)
  this.networking.updateNetworking(entities, fixedDelta, input, physicsChecksum)
  this.dispatchRemoteInputs(this.networking)
}

stopProductionRuntime(): void {
  this.lifecycleGeneration++
  this.loading = null
  const active = this.networking
  this.networking = null
  for (const cleanup of this.rpcCleanups) cleanup(); this.rpcCleanups = []
  this.sceneHandoffCleanup?.(); this.sceneHandoffCleanup = null
  if (active) void active.stopNetworking().catch(/* 调用 reportRecoverableError(error, 'Optional networking shutdown', 'Runtime') 并返回调用结果。 */ error => this.ports.reportRecoverableError(error, 'Optional networking shutdown', 'Runtime'))
}

}
