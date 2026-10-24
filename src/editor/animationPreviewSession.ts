/** 动画预览会话：协调播放、暂停、定位和录制草稿，退出时恢复并释放预览状态。 */
import { assetState, readTextAsset } from '../assets/AssetDatabase'
import { projectSessionState } from '../projects/projectSession'
import { gameplayRuntime } from './gameplayRuntime'
import { animationRuntime, type AnimationClipDocument } from '../runtime/animation'
import { timelineRuntime } from '../runtime/timeline'
import { simulationPreflight } from '../runtime/simulationAuthoring26'
import { physicsState, stopPlayMode, toggleSimulation } from '../store/physics'
import type { Animator, TimelinePlayer } from '../world/components'
import { readStudioDraft, restoreAuthoringDrafts, snapshotAuthoringDrafts, type StudioDraftSnapshot } from './studioDraftRetention'

type PreviewKind='animation'|'controller'|'timeline'
/** Owns only a session it started from Edit mode; global Play remains independently owned. */
/** 创建隔离的动画预览会话，保留作者草稿并以项目及运行会话身份防止异步操作污染新项目。 */ export function createAnimationPreviewSession() {
  let session:{runtimeSessionId:number;projectId:string;kind:PreviewKind;target:string;reference:string;drafts:StudioDraftSnapshot[]}|null=null
  let generation=0,captured:AnimationClipDocument|null=null
  const unobserve=animationRuntime.observeRecordingReset(/** 只捕获仍属于当前项目及当前预览运行会话的录制文档。 */ document=>{if(session?.projectId===projectSessionState.id&&session.runtimeSessionId===gameplayRuntime.sessionIdentity)captured=document})
  /** 仅向原项目恢复尚未存在更新草稿的资源快照，避免覆盖用户在预览期间的新编辑。 */ function restoreDrafts(current:NonNullable<typeof session>) {
    if(projectSessionState.id===current.projectId)restoreAuthoringDrafts(current.projectId,assetState.records,current.drafts.filter(/** 保留不存在资源记录或尚无新草稿的快照项，避免恢复覆盖已有草稿。 */ entry=>{const record=assetState.records.find(/* 比较 record.uuid 与 entry.assetUuid，返回严格相等的判断结果。 */ record=>record.uuid===entry.assetUuid);return !record||!readStudioDraft(record,current.projectId,entry.kind,readTextAsset(record.uuid))}),/* 调用 readTextAsset(record.uuid) 并返回调用结果。 */ record=>readTextAsset(record.uuid))
  }
  /** 检测预览已结束或被其他运行会话替换，清理会话并恢复保留的作者草稿。 */ function synchronize(){if(session&&(physicsState.playMode==='editing'||session.runtimeSessionId!==gameplayRuntime.sessionIdentity||!gameplayRuntime.isActive)){const previous=session;session=null;restoreDrafts(previous)}return session}
  /** 取消待启动预览，仅停止仍属于本对象的运行会话，并恢复同项目的作者草稿。 */ function stop(){generation++;const previous=session;session=null;if(!previous||projectSessionState.id!==previous.projectId)return;if(previous.runtimeSessionId===gameplayRuntime.sessionIdentity&&gameplayRuntime.isActive&&physicsState.playMode!=='editing'){gameplayRuntime.stopSession();stopPlayMode()}restoreDrafts(previous)}
  return {
    /* 返回 !synchronize() 的逻辑取反结果。 */ get active(){return !!synchronize()},
    /* 当 synchronize()?.target 为 null 或 undefined 时返回 null，否则保留左侧值。 */ get target(){return synchronize()?.target??null},
    /** 等待物理就绪并核对项目、目标及预检，保存草稿后启动预览；初始化失败时停止并恢复现场。 */ async start(kind:PreviewKind,reference:string,target:string,stillCurrent:()=>boolean=/* 返回固定值 true。 */ ()=>true,stateId?:string){
      if(synchronize())return true
      if(physicsState.playMode!=='editing'||gameplayRuntime.isActive)throw new Error('ANIMATION_PREVIEW_BUSY')
      const token=++generation,projectId=projectSessionState.id
      await physicsState.world.wasmReady
      if(token!==generation||projectSessionState.id!==projectId||!stillCurrent())return false
      if(physicsState.world.wasmError)throw physicsState.world.wasmError
      if(physicsState.playMode!=='editing'||gameplayRuntime.isActive)throw new Error('ANIMATION_PREVIEW_BUSY')
      const entity=physicsState.world.entities.find(/* 比较 entity.uuid 与 target，返回严格相等的判断结果。 */ entity=>entity.uuid===target)
      if(!entity)throw new Error('ANIMATION_PREVIEW_TARGET')
      const blocked=simulationPreflight(physicsState.world.entities,physicsState.world.connections,physicsState.globalSettings).blocked
      if(blocked.length)throw new Error(`ANIMATION_PREVIEW_PREFLIGHT: ${blocked.map(/* 返回 issue.code 的当前值。 */ issue=>issue.code).join(', ')}`)
      if(kind==='controller'&&entity.getComponent<Animator>('Animator')?.controllerAsset!==reference)throw new Error('ANIMATION_PREVIEW_TARGET')
      if(kind==='timeline'&&entity.getComponent<TimelinePlayer>('TimelinePlayer')?.timelineAsset!==reference)throw new Error('ANIMATION_PREVIEW_TARGET')
      const drafts=snapshotAuthoringDrafts(projectId,assetState.records,/* 调用 readTextAsset(record.uuid) 并返回调用结果。 */ record=>readTextAsset(record.uuid))
      session={runtimeSessionId:gameplayRuntime.sessionIdentity+1,projectId,kind,target,reference,drafts}
      try {
        if (!toggleSimulation(true,{assetPreview:true})) throw new Error('ANIMATION_PREVIEW_PENDING_EDITS');gameplayRuntime.beginSession()
        const currentEntity=physicsState.world.entities.find(/* 比较 entity.uuid 与 target，返回严格相等的判断结果。 */ entity=>entity.uuid===target)
        if(!gameplayRuntime.isActive||session.runtimeSessionId!==gameplayRuntime.sessionIdentity||!currentEntity)throw new Error('ANIMATION_PREVIEW_TARGET')
        if(kind==='controller'&&currentEntity.getComponent<Animator>('Animator')?.controllerAsset!==reference)throw new Error('ANIMATION_PREVIEW_TARGET')
        if(kind==='timeline'&&currentEntity.getComponent<TimelinePlayer>('TimelinePlayer')?.timelineAsset!==reference)throw new Error('ANIMATION_PREVIEW_TARGET')
        if(kind==='animation'){if(!animationRuntime.seekClipPlayback(target,reference,0,physicsState.world.entities))throw new Error('ANIMATION_PREVIEW_TARGET')}
        else if(kind==='timeline'){const player=currentEntity.getComponent<TimelinePlayer>('TimelinePlayer')!;player.playing=true;timelineRuntime.seek(target,physicsState.world.entities,0)}
        else if(stateId)currentEntity.getComponent<Animator>('Animator')!.currentState=stateId
        return true
      }catch(error){stop();throw error}
    },
    stop,
    /** 取出一次录制文档并清空缓存，避免重复消费。 */ takeRecordingDraft(){const document=captured;captured=null;return document},
    /** 停止预览并注销录制重置监听。 */ dispose(){stop();unobserve()},
    /** 存在有效预览会话时暂停仿真。 */ pause(){if(synchronize())toggleSimulation(false)},
    /** 存在有效预览会话时恢复仿真。 */ resume(){if(synchronize())toggleSimulation(true)},
    /** 按预览种类定位动画片段或时间线，控制器预览不提供此定位入口。 */ seek(seconds:number){const current=synchronize();if(!current)return false;if(current.kind==='animation')return animationRuntime.seekClipPlayback(current.target,current.reference,seconds,physicsState.world.entities);if(current.kind==='timeline')return timelineRuntime.seek(current.target,physicsState.world.entities,seconds);return false},
    /** 返回仍有效预览的种类、播放状态及动画或时间线时间，控制器时间保持为空。 */ inspect(){const current=synchronize();if(!current)return null;const entity=physicsState.world.entities.find(/* 比较 entity.uuid 与 current.target，返回严格相等的判断结果。 */ entity=>entity.uuid===current.target);return{kind:current.kind,playing:physicsState.playMode==='playing',time:current.kind==='animation'?animationRuntime.inspectClipPlayback(current.target)?.time??null:current.kind==='timeline'?entity?.getComponent<TimelinePlayer>('TimelinePlayer')?.currentTime??null:null}},
  }
}