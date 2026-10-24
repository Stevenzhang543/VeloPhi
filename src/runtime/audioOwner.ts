import type {Entity} from '../world/Entity'
import type {AudioWorld,AudioResources,AudioRuntimeCapabilities,AudioTransportTime,TimelineAudioVoiceRequest} from './audioRuntimeContracts'
import type {AudioProjectSettings} from './audioSettingsContracts'
import {AudioRuntime} from './audioRuntime'
/** Fixed World wrapper, containing the single original engine; no second transport or simulation clock. */
export class RuntimeAudioOwner{
 readonly runtime:AudioRuntime
 constructor(readonly world:AudioWorld,readonly resources:AudioResources,capabilities:AudioRuntimeCapabilities,readonly unwrapEntity:(value:Entity)=>Entity,runtime?:AudioRuntime){
  if(!world||!Array.isArray(world.entities)||typeof resources?.resolveAsset!=='function'||typeof unwrapEntity!=='function')throw new Error('AUDIO_OWNER_SERVICES_REQUIRED')
  this.runtime=runtime??new AudioRuntime(capabilities)
 }
 get diagnostics(){return this.runtime.diagnostics}
 private requireEntities(entities:Entity[]):void{if(entities===this.world.entities)return;const members=new Set(this.world.entities.map(this.unwrapEntity));if(entities.some(e=>!members.has(this.unwrapEntity(e))))throw new Error('AUDIO_FOREIGN_WORLD_ENTITIES: Detached or foreign entities were supplied.')}
 private requireEntity(entity:Entity):void{const raw=this.unwrapEntity(entity);if(!this.world.entities.some(e=>this.unwrapEntity(e)===raw))throw new Error('AUDIO_FOREIGN_WORLD_ENTITY: Supply an entity in this fixed World.')}
 begin(settings:AudioProjectSettings){this.runtime.begin(settings)}
 setTransportTime(value:AudioTransportTime){this.runtime.setTransportTime(value)}
 update(entities:Entity[],settings:AudioProjectSettings,playing:boolean,transport?:AudioTransportTime){this.requireEntities(entities);this.runtime.update(entities,settings,playing,transport)}
 play(entity:Entity,entities:Entity[]=this.world.entities){this.requireEntity(entity);this.requireEntities(entities);this.runtime.play(entity,entities)}
 pause(entity:Entity){this.requireEntity(entity);this.runtime.pause(entity)}
 stop(entity:Entity){this.requireEntity(entity);this.runtime.stop(entity)}
 scrub(entity:Entity,seconds:number){this.requireEntity(entity);return this.runtime.scrub(entity,seconds)}
 playbackTime(entity:Entity){this.requireEntity(entity);return this.runtime.playbackTime(entity)}
 reconcileTimelineVoices(requests:readonly TimelineAudioVoiceRequest[],entities:Entity[]){this.requireEntities(entities);if(requests.length){const members=new Set(this.world.entities.map(this.unwrapEntity));if(requests.some(r=>!members.has(this.unwrapEntity(r.entity))))throw new Error('AUDIO_FOREIGN_TIMELINE_ENTITY')}return this.runtime.reconcileTimelineVoices(requests,entities)}
 playUiClip(reference:string|null|undefined,bus='UI'){return this.runtime.playUiClip(reference,bus)}
 /** 26.43 script audio: sounds, music and runtime bus volume (see AudioRuntime). */
 playScriptSound(reference:string|null|undefined,options:{bus?:string;volume?:number;pitch?:number;loop?:boolean;tag?:string}={}){return this.runtime.playScriptSound(reference,options)!==null}
 stopScriptSounds(tag:string,fade=0){return this.runtime.stopScriptSounds(tag,fade)}
 playMusic(reference:string|null|undefined,options:{fade?:number;volume?:number}={}){return this.runtime.playMusic(reference,options)}
 stopMusic(fade=0){return this.runtime.stopMusic(fade)}
 setBusVolume(bus:string,volume:number){return this.runtime.setBusVolume(bus,volume)}
 stopAll(){this.runtime.stopAll()}
 /** 26.46: the audio clock and buffer scheduling for rhythm charts. */
 rhythmPort(){return this.runtime.rhythmPort()}
 dispose(){return this.runtime.dispose()}
 recover(){return this.runtime.recover()}
 refreshOutputDevices(){return this.runtime.refreshOutputDevices()}
 selectOutputDevice(id:string){return this.runtime.selectOutputDevice(id)}
}
