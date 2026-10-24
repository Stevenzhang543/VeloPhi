/** 测试夹具：组件属性处置表（哪些字段由运行时管理、哪些是嵌套结构），供组件元数据生成器使用。 */
/** Exact non-authored component fields; new omissions must be reviewed explicitly. */
export const runtimeComponentFields22 = {
 ShapeRenderer2D:{textureImage:'Decoded browser image cache; texture/textureAsset are the authored sources.'},
 Script2D:{propertyMetadata:'Derived from script export annotations; script source is authoritative.',lastError:'Latest execution/compile diagnostic; not an authored property.'},
 Animator:{currentState:'Runtime state-machine observation; default controller state is authored in the controller asset.'},
 Button:{state:'Pointer/keyboard interaction state; resets when the player starts.'},
 CharacterBody2D:Object.fromEntries(['requestedMotion','motionVelocity','onFloor','onWall','onCeiling','floorNormal','wallNormal','ceilingNormal','platformVelocity','secondsSinceFloor','floorEntity','floorOneWay'].map(/* 返回按声明顺序构造的数组 [field,'Movement/collision step observation; produced by character motion and contact resolution.']。 */ field=>[field,'Movement/collision step observation; produced by character motion and contact resolution.'])),
 NavigationAgent2D:Object.fromEntries(['path','pathIndex','velocity','pathStatus'].map(/* 返回按声明顺序构造的数组 [field,'Navigation query/following result; target and navigation parameters are authored.']。 */ field=>[field,'Navigation query/following result; target and navigation parameters are authored.'])),
 BehaviorTree2D:{currentNode:'Runtime tree execution cursor; tree asset and blackboard are the authored sources.'},
 StateMachine2D:{currentState:'Runtime state cursor; initialState is the authored source.'},
 GridMover2D:{runtimeCooldown:'Runtime movement countdown.'},
 Health2D:{runtimeInvulnerability:'Runtime invulnerability countdown.'},
 Projectile2D:{runtimeLifetime:'Runtime lifetime countdown.'},
 Spawner2D:Object.fromEntries(['runtimeRemaining','runtimeStarted','runtimeSpawned'].map(/* 返回按声明顺序构造的数组 [field,'Runtime spawn scheduling/count observation.']。 */ field=>[field,'Runtime spawn scheduling/count observation.'])),
 Cooldown2D:{runtimeRemaining:'Runtime cooldown countdown.',runtimeReady:'Runtime cooldown completion state.'},
 Lifetime2D:{runtimeRemaining:'Runtime lifetime countdown.'},
 ObjectPool2D:{activeCount:'Runtime count of active pooled objects.'},
 RhythmChart2D:{state:'Runtime chart state (loading, playing, finished …).',lastError:'Latest chart load diagnostic.',...Object.fromEntries(['runtimeSongTime','runtimeScore','runtimeCombo','runtimeMaxCombo','runtimeAccuracy','runtimeJudgement'].map(field=>[field,'Runtime chart observation; the chart asset and settings are authored.']))},
 RigidBody2D:Object.fromEntries(['sleeping','sleepTimer','contactCount','contactNormal','penetrationDepth'].map(/* 返回按声明顺序构造的数组 [field,'Physics step sleep/contact observation; computed by the engine.']。 */ field=>[field,'Physics step sleep/contact observation; computed by the engine.']))
}

/** Populated fixtures for empty authored containers; references test persistence, not resolution. */
export const structuredComponentValues22 = {
 Script2D:{properties:{speed:3.5,enabled:true,label:'Audit',items:[1,'two',false],nested:{score:7}}},
 Animator:{parameters:{enabled:true,speed:1.25,count:3},layerWeights:{base:1,upper:.5}},
 Skeleton2D:{pose:[{boneId:'root',position:{x:1,y:-2},rotation:.75,scale:{x:-1,y:2}}]},
 TimelinePlayer:{variables:{score:3,ready:true,label:'Audit'}},
 AudioSource:{playlist:['asset://00009999-0000-4000-8000-000000000000']},
 WorldChunk2D:{dependencies:['00009999-0000-4000-8000-000000000000']},
 ParticleEmitter2D:{colorGradient:[{time:0,color:{r:32,g:80,b:160},opacity:100},{time:1,color:{r:160,g:80,b:32},opacity:25}]},
 Joint2D:{breakForce:700,breakTorque:400}
}

/** Valid alternatives for dependent/integer/unit-vector fields, separate from discovery's invalid probes. */
/** 结构说明（自动提取）：canonicalComponentValue22；输入 component、field、current；直接调用 encodeURIComponent、colors.includes；写入 tiles[…]；返回路径包含 integers[…]、tiles、undefined。 */ export function canonicalComponentValue22(component,field,current){
 const id=component+'.'+field
 if(id==='ShapeRenderer2D.texture')return 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#ffffff"/></svg>')
 if(id==='Health2D.maximum')return 125
 if(id==='Slider.min'||id==='ProgressBar.min')return .25
 const integers={
  'ShapeRenderer2D.sortingLayer':2,'SpriteRenderer2D.sortingLayer':2,'TextRenderer2D.sortingLayer':2,
  'SpriteRenderer2D.lightMask':5,'Camera2D.cullingMask':5,'AudioSource.voicePriority':37,'Panel.columns':3,
  'TileMap2D.height':20,'TileMap2D.collisionMask':5,'TileMap2D.activeLayer':1,'TileMap2D.streamingRadius':2,
  'CharacterBody2D.collisionMask':5,'Area2D.collisionMask':5,'NavigationRegion2D.navigationLayer':2,
  'NavigationRegion2D.navigationMask':5,'NavigationObstacle2D.navigationLayer':2,'NavigationAgent2D.navigationLayer':2,
  'NavigationAgent2D.navigationMask':5,'Spawner2D.burst':2,'ParticleEmitter2D.subEmitterCount':2,
  'ParticleEmitter2D.collisionLayerMask':5,'Light2D.layerMask':5,'ShadowCaster2D.layerMask':5,'Collider2D.collisionMask':5
 }
 if(id in integers)return integers[id]
 const colors=['Panel.color','Image.tint','Text.color','Button.normalColor','Button.hoveredColor','Button.pressedColor','Button.disabledColor','ProgressBar.fillColor','ProgressBar.backgroundColor','ParticleEmitter2D.startColor','ParticleEmitter2D.endColor','Light2D.color']
 if(colors.includes(id))return{...current,r:current.r===64?65:64}
 if(id==='ShapeRenderer2D.vertices')return[{x:-.75,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}]
 if(id==='RectTransform.anchorMax')return{x:.75,y:.5}
 if(id==='Joint2D.axis')return{x:0,y:1}
 if(id==='Collider2D.oneWayNormal')return{x:1,y:0}
 if(id==='TileMap2D.tiles'){const tiles=[...current];tiles[0]=1;return tiles}
 return undefined
}
