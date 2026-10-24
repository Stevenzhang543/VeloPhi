import type {Entity} from '../world/Entity'
import type {AudioPlaybackElement} from './audioBuffers'
import type {AudioProjectSettings} from './audioSettingsContracts'
export interface TimelineAudioVoiceRequest {key:string;ownerUuid:string;entity:Entity;reference:string;time:number;playbackRate:number;gain:number;playing:boolean}
export interface AudioTransportTime {seconds:number;playing:boolean;scale:number}
export interface AudioVoiceClock {sample:number;seconds:number;playbackRate:number;playing:boolean;streaming:boolean}
export interface AudioRuntimeDiagnostics {
  clock: {ticks:number;seconds:number;sample:number;sampleRate:number;playing:boolean;scale:number}
  voiceClocks:Record<string,AudioVoiceClock>
  activeVoices: number
  streamingVoices: number
  bufferedVoices: number
  contextState: AudioContextState | 'unavailable'
  busMeters: Record<string, number>
  limitedVoices: number
  virtualVoices: number
  baseLatencyMs: number | null
  outputLatencyMs: number | null
  underruns: number
  deviceChanges: number
  lastDeviceChange: string
  busMeterDetails: Record<string, { rms: number; peak: number; rmsDb: number; peakDb: number; clipped: boolean }>
  clippingEvents: number
  loudnessDb: number
  momentaryLufs: number
  integratedLufs: number
  truePeakDb: number
  crestFactorDb: number
  stolenVoices: number
  failures: Array<{ at: string; operation: string; message: string; recovery: string }>
  outputDevices: Array<{ id: string; label: string }>
  selectedOutputDevice: string
  recoveryCount: number
}


export interface RuntimeAudioAsset {
 readonly assetType:'audio';readonly source:string;readonly duration:number
 readonly settings:{readonly audioSettings:{readonly streaming:boolean;readonly trimStart:number;readonly trimEnd:number;readonly normalize:boolean;readonly normalizationGain:number;readonly preload:string;readonly loopRegions:readonly {id:string;start:number;end:number}[];readonly activeLoopRegion:string|null;readonly loopStart:number;readonly loopEnd:number}}
}
export interface AudioResources {resolveAsset(reference:string|null|undefined):unknown}
export interface RuntimeAudioPlatform {
 readonly Audio: (new(source?:string)=>AudioPlaybackElement)|undefined
 readonly AudioContext:(new(options?:AudioContextOptions)=>AudioContext)|undefined
 readonly mediaDevices:Pick<MediaDevices,'enumerateDevices'|'addEventListener'|'removeEventListener'>|undefined
 createReadAbortController():AbortController
 nowMilliseconds():number;dateIso():string
 readAudioBytes(source:string,maximumBytes:number,signal?:AbortSignal):Promise<ArrayBuffer>
}
export interface AudioRuntimeCapabilities {readonly resources:{resolveAsset(reference:string|null|undefined):RuntimeAudioAsset|null};readonly platform:RuntimeAudioPlatform}
export interface AudioWorld {readonly entities:Entity[]}
export type AudioSettings=AudioProjectSettings

/** 26.46 rhythm audio: a decoded song or hit sound kept outside the shared clip cache. */
export interface RhythmAudioBuffer {readonly duration:number;readonly sampleRate:number;readonly channels:number;readonly native:AudioBuffer}
/** A scheduled buffer voice (AudioBufferSourceNode); stop() is idempotent. */
export interface RhythmAudioVoice {readonly startContextTime:number;readonly startOffset:number;stop(when?:number):void;setVolume(volume:number):void;readonly ended:boolean}
/** Sample-accurate scheduling and the audio clock for rhythm games. */
export interface RhythmAudioPort {
 /** 'unavailable' without Web Audio. */
 state():AudioContextState|'unavailable'
 /** Resumes a suspended context (needs a user gesture in browsers); true once running. */
 resume():Promise<boolean>
 /** The audio clock's current time (seconds), or null without a context. */
 contextTime():number|null
 /** The context time being heard from the speakers at performance time `performanceMs`, or null.
  * Uses getOutputTimestamp when the host provides it, otherwise currentTime minus the reported latency. */
 heardContextTime(performanceMs:number):number|null
 /** Output latency in seconds (base + output latency, 0 when unknown). */
 latency():number
 /** Decodes a whole audio asset (up to 12 minutes of stereo 48 kHz). */
 decode(reference:string|null|undefined):Promise<RhythmAudioBuffer|null>
 /** A short synthesized click (the default hit sound). */
 click():RhythmAudioBuffer|null
 /** Plays `buffer` from `offset` seconds at context time `when` on a mixer bus. */
 start(buffer:RhythmAudioBuffer,when:number,offset:number,options?:{bus?:string;volume?:number}):RhythmAudioVoice|null
}
