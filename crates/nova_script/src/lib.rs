// Rhai 沙箱运行时：编译缓存、导出属性、生命周期和受限宿主命令桥接。
//! Sandboxed Rhai execution for Nova_A gameplay scripts.
//!
//! The crate deliberately knows nothing about the editor, DOM, filesystem,
//! network, processes, or Tauri. Scripts can only observe the serialized host
//! context and return a small, validated command list.

use std::cell::RefCell;
use std::collections::BTreeMap;
use std::rc::Rc;

// Rhai selects `web_time::Instant` for wasm32 and `std::time::Instant` on
// native targets. Using its portable clock keeps graph tracing from trapping
// before any lifecycle function can run in the editor/player WebAssembly host.
use rhai::{Array, CallFnOptions, Dynamic, Engine, Instant, Map, Scope, AST, FLOAT, INT};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const MAX_SCRIPT_OPERATIONS: u64 = 100_000;
pub const MAX_SCRIPT_STRING_SIZE: usize = 262_144;
pub const MAX_SCRIPT_ARRAY_SIZE: usize = 8_192;
pub const MAX_SCRIPT_MAP_SIZE: usize = 4_096;
pub const MAX_SCRIPT_COMMANDS: usize = 4_096;
pub const MAX_SCRIPT_LOGS: usize = 512;
pub const CURRENT_SCRIPT_API_VERSION: u8 = 2;
pub const MINIMUM_SCRIPT_API_VERSION: u8 = 1;
pub const MAX_SCRIPT_INSTANCES: usize = 100_000;

// 提供新脚本上下文使用的当前脚本接口版本。
fn current_script_api_version() -> u8 {
    CURRENT_SCRIPT_API_VERSION
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeSnapshot {
    pub delta: f64,
    pub fixed_delta: f64,
    pub elapsed: f64,
    pub scale: f64,
    pub frame: u64,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputSnapshot {
    #[serde(default)]
    pub down: BTreeMap<String, bool>,
    #[serde(default)]
    pub pressed: BTreeMap<String, bool>,
    #[serde(default)]
    pub released: BTreeMap<String, bool>,
    #[serde(default)]
    pub performed: BTreeMap<String, bool>,
    #[serde(default)]
    pub cancelled: BTreeMap<String, bool>,
    #[serde(default)]
    pub phases: BTreeMap<String, String>,
    #[serde(default)]
    pub durations: BTreeMap<String, f64>,
    #[serde(default)]
    pub axes: BTreeMap<String, f64>,
    #[serde(default)]
    pub vectors: BTreeMap<String, [f64; 2]>,
    #[serde(default)]
    pub mouse_position: [f64; 2],
    #[serde(default)]
    pub mouse_world_position: [f64; 2],
    #[serde(default)]
    pub view_bounds: [f64; 4],
    #[serde(default)]
    pub viewport_size: [f64; 2],
    #[serde(default)]
    pub wheel: [f64; 2],
    #[serde(default)]
    pub contexts: Vec<String>,
    #[serde(default)]
    pub maps: Vec<String>,
    #[serde(default)]
    pub scheme: String,
    /// 26.45: the prompt of each action for the device in use ("Space", "A", "✕", "LMB").
    #[serde(default)]
    pub prompts: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneEntitySnapshot {
    pub uuid: String,
    #[serde(default)]
    pub generation: u32,
    pub name: String,
    pub enabled: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub groups: Vec<String>,
    #[serde(default)]
    pub components: Vec<String>,
    #[serde(default)]
    pub position: [f64; 2],
}

/// A read-only query projection published by the world Owner at a phase boundary.
/// It is never a simulation world and cannot commit gameplay writes.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScriptWorldSnapshot {
    pub protocol_version: u16,
    pub entity_generations: BTreeMap<String, u32>,
    pub entities: BTreeMap<String, String>,
    pub scene_entities: Vec<SceneEntitySnapshot>,
}

#[derive(Debug, Default)]
pub struct ScriptWorldView {
    epoch: u32,
    revision: u32,
    snapshot: ScriptWorldSnapshot,
    index: BTreeMap<String, usize>,
}

impl ScriptWorldView {
    fn from_snapshot(
        epoch: u32,
        revision: u32,
        snapshot: ScriptWorldSnapshot,
    ) -> Result<Self, String> {
        if snapshot.protocol_version != 1 {
            return Err("unsupported script world context version".into());
        }
        if snapshot.scene_entities.len() > MAX_SCRIPT_INSTANCES
            || snapshot.entities.len() > MAX_SCRIPT_INSTANCES
            || snapshot.entity_generations.len() > MAX_SCRIPT_INSTANCES
        {
            return Err("script query world capacity exceeded".into());
        }
        let mut index = BTreeMap::new();
        for (n, entity) in snapshot.scene_entities.iter().enumerate() {
            Self::validate_entity(entity)?;
            if snapshot.entity_generations.get(&entity.uuid) != Some(&entity.generation)
                || index.insert(entity.uuid.clone(), n).is_some()
            {
                return Err("invalid script world entity generation or duplicate identity".into());
            }
        }
        if snapshot
            .entity_generations
            .iter()
            .any(|(id, generation)| id.is_empty() || *generation == 0)
            || snapshot
                .entities
                .values()
                .any(|id| !snapshot.entity_generations.contains_key(id))
        {
            return Err("invalid script world lookup identity".into());
        }
        Ok(Self {
            epoch,
            revision,
            snapshot,
            index,
        })
    }

    fn validate_entity(entity: &SceneEntitySnapshot) -> Result<(), String> {
        if entity.uuid.is_empty()
            || entity.generation == 0
            || entity.position.iter().any(|value| !value.is_finite())
        {
            return Err("invalid script world entity snapshot".into());
        }
        Ok(())
    }

    fn entity_from_handle(&self, handle: Map) -> Option<&SceneEntitySnapshot> {
        let (id, generation) = target_from_handle(handle)?;
        let entity = self.snapshot.scene_entities.get(*self.index.get(&id)?)?;
        (generation
            == if entity.generation == 0 {
                handle_generation(&id)
            } else {
                entity.generation
            })
        .then_some(entity)
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameFlowSnapshot {
    pub paused: bool,
    pub score: f64,
    #[serde(default)]
    pub session: BTreeMap<String, Value>,
    #[serde(default)]
    pub checkpoints: Vec<String>,
}

/// 26.46: the rhythm chart the script sees (its own RhythmChart2D, else the first chart in the scene).
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RhythmSnapshot {
    pub active: bool,
    pub entity: String,
    pub state: String,
    pub time: f64,
    pub beat: f64,
    pub bpm: f64,
    pub score: f64,
    pub combo: f64,
    pub max_combo: f64,
    pub accuracy: f64,
    pub perfect: f64,
    pub great: f64,
    pub good: f64,
    pub bad: f64,
    pub miss: f64,
    pub judged: f64,
    pub total: f64,
    pub early: f64,
    pub late: f64,
    pub mean_offset_ms: f64,
    pub last_judgement: String,
    pub finished: bool,
    pub full_combo: bool,
    pub all_perfect: bool,
    pub progress: f64,
    pub length: f64,
    pub offset_ms: f64,
    pub autoplay: bool,
    pub title: String,
    pub calibration_ms: f64,
    /// 26.47: the player's picture offset in milliseconds (notes are drawn this much earlier).
    pub visual_offset_ms: f64,
    /// 26.47: on an object that shows a chart note (a prefab note type), that note.
    pub note: Option<Value>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkSnapshot {
    pub enabled: bool,
    pub connected: bool,
    pub authority: bool,
    pub peer_count: u32,
    #[serde(default)]
    pub local_peer_id: String,
    #[serde(default)]
    pub role: String,
    pub tick: u64,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactSnapshot {
    pub other_entity: String,
    pub point: [f64; 2],
    pub normal: [f64; 2],
    pub relative_velocity: [f64; 2],
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventSnapshot {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub payload: Value,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformSnapshot {
    #[serde(default)]
    pub position: [f64; 2],
    pub rotation: f64,
    #[serde(default = "unit_scale")]
    pub scale: [f64; 2],
}

impl Default for TransformSnapshot {
    // 构造零位置、零旋转和单位缩放的实体快照。
    fn default() -> Self {
        Self {
            position: [0.0, 0.0],
            rotation: 0.0,
            scale: unit_scale(),
        }
    }
}

// 返回默认二维单位缩放。
fn unit_scale() -> [f64; 2] {
    [1.0, 1.0]
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RigidBodySnapshot {
    #[serde(default)]
    pub velocity: [f64; 2],
    pub angular_velocity: f64,
    pub mass: f64,
    #[serde(default)]
    pub body_type: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterSnapshot {
    pub on_floor: bool,
    pub on_wall: bool,
    pub on_ceiling: bool,
    pub can_coyote_jump: bool,
    #[serde(default)]
    pub floor_normal: [f64; 2],
    #[serde(default)]
    pub wall_normal: [f64; 2],
    #[serde(default)]
    pub platform_velocity: [f64; 2],
    /// 26.44: the floor is a one-way platform (`character_drop_through` passes it).
    #[serde(default)]
    pub floor_one_way: bool,
}

/// 26.44: the entity's Animator (base layer) as seen by scripts.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimatorSnapshot {
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub state_id: String,
    #[serde(default)]
    pub normalized_time: f64,
    #[serde(default)]
    pub in_transition: bool,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptContext {
    #[serde(skip)]
    pub shared_world: Option<Rc<RefCell<ScriptWorldView>>>,
    #[serde(default = "current_script_api_version")]
    pub api_version: u8,
    pub entity: String,
    #[serde(default)]
    pub invocation_id: u64,
    #[serde(default)]
    pub callback_kind: String,
    #[serde(default)]
    pub entity_generations: BTreeMap<String, u32>,
    #[serde(default)]
    pub entity_name: String,
    #[serde(default)]
    pub components: Vec<String>,
    #[serde(default)]
    pub entities: BTreeMap<String, String>,
    #[serde(default)]
    pub scene_entities: Vec<SceneEntitySnapshot>,
    #[serde(default)]
    pub time: TimeSnapshot,
    #[serde(default)]
    pub random_seed: u64,
    #[serde(default)]
    pub input: InputSnapshot,
    #[serde(default)]
    pub contact: Option<ContactSnapshot>,
    #[serde(default)]
    pub event: Option<EventSnapshot>,
    #[serde(default)]
    pub properties: BTreeMap<String, Value>,
    #[serde(default)]
    pub save: BTreeMap<String, Value>,
    #[serde(default)]
    pub transform: TransformSnapshot,
    #[serde(default)]
    pub rigid_body: Option<RigidBodySnapshot>,
    #[serde(default)]
    pub character: Option<CharacterSnapshot>,
    #[serde(default)]
    pub animator: Option<AnimatorSnapshot>,
    #[serde(default)]
    pub game_flow: GameFlowSnapshot,
    #[serde(default)]
    pub networking: NetworkSnapshot,
    #[serde(default)]
    pub rhythm: RhythmSnapshot,
    #[serde(default)]
    pub editor_automation: bool,
    #[serde(default)]
    pub editor_selection: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ScriptCommand {
    GraphTrace {
        graph_uuid: String,
        scope_uuid: String,
        node_uuid: String,
        edge_uuid: String,
        depth: i64,
        duration_micros: u64,
        values: Value,
    },
    ApplyForce {
        x: f64,
        y: f64,
    },
    ApplyImpulse {
        x: f64,
        y: f64,
    },
    SetVelocity {
        x: f64,
        y: f64,
    },
    SetPosition {
        x: f64,
        y: f64,
    },
    SetRotation {
        radians: f64,
    },
    SetScale {
        x: f64,
        y: f64,
    },
    SetAngularVelocity {
        radians_per_second: f64,
    },
    MoveCharacter {
        x: f64,
        y: f64,
    },
    AnimatorSetBool {
        name: String,
        value: bool,
    },
    AnimatorSetFloat {
        name: String,
        value: f64,
    },
    AnimatorSetInteger {
        name: String,
        value: i64,
    },
    AnimatorTrigger {
        name: String,
    },
    AnimatorPlay {
        state: String,
    },
    /// 26.44: blend from the current state to `state` over `seconds`.
    AnimatorCrossfade {
        state: String,
        seconds: f64,
    },
    /// 26.44: the character passes one-way platforms for `seconds`.
    CharacterDropThrough {
        seconds: f64,
    },
    /// 26.45: move this body's target joint (adding one when missing) to a world point.
    TargetJointMove {
        x: f64,
        y: f64,
    },
    /// 26.45: release this body's target joint.
    TargetJointRelease,
    /// 26.45: conveyor speed of this body's collider surfaces (m/s).
    SetSurfaceSpeed {
        speed: f64,
    },
    /// 26.45: wait for the next key, mouse button or gamepad button and bind it to `action`
    /// (binding `index`); the script gets the `input.rebound` or `input.rebind_cancelled` signal.
    InputRebind {
        action: String,
        index: u32,
    },
    /// 26.45: put the project's bindings back (the player's own are forgotten).
    InputBindingsReset,
    /// 26.45: shake the active camera: `amount` (0–1) is added to its trauma.
    CameraShake {
        amount: f64,
    },
    /// 26.45: zoom of the active camera.
    CameraZoom {
        zoom: f64,
    },
    /// 26.45: the active camera follows an entity (empty target: stop following).
    CameraFollow {
        target: String,
        generation: u32,
    },
    /// 26.45: a full-screen colour flash that fades out over `seconds`.
    ScreenFlash {
        r: f64,
        g: f64,
        b: f64,
        seconds: f64,
    },
    /// 26.44: animate a property of this entity (`target` empty) or of a handle's entity.
    Tween {
        target: String,
        generation: u32,
        property: String,
        to: f64,
        seconds: f64,
        easing: String,
        delay: f64,
        loops: i64,
        yoyo: bool,
        relative: bool,
        signal: String,
    },
    /// 26.44: stop tweens of this entity (`target` empty) or a handle's entity; all properties when empty.
    TweenStop {
        target: String,
        generation: u32,
        property: String,
    },
    AudioPlay,
    AudioPause,
    AudioStop,
    Destroy,
    Despawn,
    Instantiate {
        prefab: String,
    },
    SpawnAt {
        pending_id: String,
        prefab: String,
        x: f64,
        y: f64,
        rotation: f64,
        scale_x: f64,
        scale_y: f64,
    },
    TargetSetPosition {
        target: String,
        generation: u32,
        x: f64,
        y: f64,
    },
    TargetSetRotation {
        target: String,
        generation: u32,
        radians: f64,
    },
    TargetSetScale {
        target: String,
        generation: u32,
        x: f64,
        y: f64,
    },
    TargetSetEnabled {
        target: String,
        generation: u32,
        enabled: bool,
    },
    TargetSetComponentEnabled {
        target: String,
        generation: u32,
        component: String,
        enabled: bool,
    },
    TargetSetUiText {
        target: String,
        generation: u32,
        text: String,
    },
    TargetSetUiValue {
        target: String,
        generation: u32,
        value: f64,
    },
    TargetAddTag {
        target: String,
        generation: u32,
        tag: String,
    },
    TargetRemoveTag {
        target: String,
        generation: u32,
        tag: String,
    },
    TargetAddGroup {
        target: String,
        generation: u32,
        group: String,
    },
    TargetRemoveGroup {
        target: String,
        generation: u32,
        group: String,
    },
    TargetDestroy {
        target: String,
        generation: u32,
    },
    LoadScene {
        scene: String,
    },
    ReloadScene,
    Quit,
    GamePause {
        paused: bool,
    },
    CheckpointSet {
        name: String,
    },
    CheckpointRestore {
        name: String,
    },
    ScoreSet {
        value: f64,
    },
    ScoreAdd {
        value: f64,
    },
    SessionSet {
        key: String,
        value: Value,
    },
    InputContextPush {
        name: String,
        priority: i64,
        consume: bool,
    },
    InputContextPop {
        name: String,
    },
    InputMapEnable {
        name: String,
    },
    InputMapDisable {
        name: String,
    },
    InputSchemeSet {
        name: String,
    },
    StartTimer {
        name: String,
        seconds: f64,
        repeat: bool,
    },
    PauseTimer {
        name: String,
    },
    ResumeTimer {
        name: String,
    },
    CancelTimer {
        name: String,
    },
    StartTask {
        name: String,
        seconds: f64,
    },
    CancelTask {
        name: String,
    },
    EmitSignal {
        name: String,
        target: String,
        payload: Value,
    },
    SaveSet {
        key: String,
        value: Value,
    },
    SaveDelete {
        key: String,
    },
    SaveClear,
    SaveLoad {
        slot: String,
    },
    SaveCommit {
        slot: String,
    },
    UiSetText {
        text: String,
    },
    UiSetValue {
        value: f64,
    },
    NavigationSetTarget {
        x: f64,
        y: f64,
    },
    NetworkRpc {
        name: String,
        payload: Value,
    },
    EditorSelect {
        target: String,
        generation: u32,
    },
    EditorRename {
        target: String,
        generation: u32,
        name: String,
    },
    EditorCreateEntity {
        shape: String,
        name: String,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    },
    EditorCreateTextAsset {
        path: String,
        asset_type: String,
        source: String,
    },
    // 26.43 脚本间调用：在当前阶段的安全边界调用另一个脚本实例的函数（延迟调用，不返回值）。
    CallFunction {
        target: String,
        generation: u32,
        function: String,
        args: Value,
    },
    CallGlobal {
        name: String,
        function: String,
        args: Value,
    },
    CallGroup {
        group: String,
        function: String,
        args: Value,
    },
    CallLater {
        function: String,
        seconds: f64,
        args: Value,
    },
    // 26.43 音视频脚本：一次性音效、背景音乐、总线音量与全屏视频。
    PlaySound {
        asset: String,
        bus: String,
        volume: f64,
        pitch: f64,
        looped: bool,
        tag: String,
    },
    StopSounds {
        tag: String,
        fade: f64,
    },
    PlayMusic {
        asset: String,
        fade: f64,
        volume: f64,
    },
    StopMusic {
        fade: f64,
    },
    SetBusVolume {
        bus: String,
        volume: f64,
    },
    PlayVideo {
        asset: String,
        skippable: bool,
        volume: f64,
        looped: bool,
    },
    StopVideo,
    /// 26.46 rhythm chart control: play, pause, resume, stop, restart, seek, offset, autoplay, speed,
    /// calibration (the device offset in milliseconds).
    Rhythm {
        action: String,
        value: f64,
    },
    /// 26.47: the game judges a note (custom note types): a judgement name, or "" with an offset in
    /// milliseconds that the note's windows classify.
    RhythmJudge {
        note: i64,
        judgement: String,
        offset_ms: f64,
    },
    /// 26.46 script post-processing: set (tweened over `seconds`), pulse (decays over `seconds`) or reset.
    PostSet {
        name: String,
        value: f64,
        seconds: f64,
    },
    PostPulse {
        name: String,
        amount: f64,
        seconds: f64,
    },
    PostReset,
    /// 26.46 joint servo on this object's revolute or prismatic joint (degrees or units along the axis).
    JointServo {
        enabled: bool,
        target: f64,
    },
    /// 26.46 radial impulse on the dynamic bodies around a point, falling off to zero at `radius`.
    Explode {
        x: f64,
        y: f64,
        radius: f64,
        impulse: f64,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptLog {
    pub level: String,
    pub message: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedProperty {
    pub name: String,
    pub value: Value,
    pub value_type: String,
    pub default_value: Value,
    pub minimum: Option<f64>,
    pub maximum: Option<f64>,
    pub step: Option<f64>,
    pub enum_values: Vec<String>,
    pub resource_type: Option<String>,
    pub group: String,
    pub tooltip: String,
    pub serialized: bool,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptExecution {
    pub commands: Vec<ScriptCommand>,
    pub logs: Vec<ScriptLog>,
    pub properties: BTreeMap<String, Value>,
    /// 26.44: set when a debug run stopped at a line; nothing of that run is applied.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pause: Option<ScriptDebugPause>,
}

/// 26.44: where a debug run stops ("snapshot, abort, re-run"). Statements are numbered in the order
/// they run; a run stops at the first statement after `after_event` that matches `mode`: a line in
/// `break_lines` (`continue`), any statement (`into`), one at `depth` or shallower (`over`) or one
/// shallower than `depth` (`out`); `over` and `out` also stop at a line in `break_lines`. Lines are
/// lines of the compiled source.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ScriptDebugProbe {
    pub break_lines: Vec<usize>,
    pub after_event: u64,
    pub mode: String,
    pub depth: usize,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptDebugPause {
    pub event: u64,
    pub line: usize,
    pub column: usize,
    pub depth: usize,
    pub locals: Vec<ScriptDebugLocal>,
    pub stack: Vec<ScriptDebugFrame>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptDebugLocal {
    pub name: String,
    pub value: Value,
    pub constant: bool,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptDebugFrame {
    pub function: String,
    pub line: usize,
}

#[derive(Default)]
struct HostOutput {
    commands: Vec<ScriptCommand>,
    logs: Vec<ScriptLog>,
}

#[derive(Clone, Debug, PartialEq)]
struct PreparedScript {
    source: String,
    exports: Vec<ExportedProperty>,
    compatibility_warnings: Vec<String>,
}

struct CompiledScript {
    prepared: PreparedScript,
    ast: AST,
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct ScriptInstanceKey {
    epoch: u32,
    entity: String,
    generation: u32,
    script: String,
}

struct ScriptInstance {
    program: Rc<CompiledScript>,
    scope: Scope<'static>,
    initialized: bool,
}

/// 26.45: the live script instances at one moment (see `ScriptRuntime::snapshot_instances`).
pub struct ScriptInstancesSnapshot {
    epoch: Option<u32>,
    instances: Vec<(ScriptInstanceKey, Rc<CompiledScript>, Scope<'static>, bool)>,
}

impl ScriptInstancesSnapshot {
    /// Number of instances held.
    pub fn len(&self) -> usize {
        self.instances.len()
    }

    /// True when no instance is held.
    pub fn is_empty(&self) -> bool {
        self.instances.is_empty()
    }
}

#[derive(Default)]
pub struct ScriptRuntime {
    scripts: BTreeMap<String, Rc<CompiledScript>>,
    instances: BTreeMap<ScriptInstanceKey, ScriptInstance>,
    instance_epoch: Option<u32>,
    generations: BTreeMap<String, u32>,
    retired_generations: BTreeMap<String, u32>,
    world_view: Option<Rc<RefCell<ScriptWorldView>>>,
}

impl Clone for ScriptRuntime {
    /// Candidates share immutable ASTs. Live scopes move only at the final owner commit;
    /// cloning a Rhai closure's shared captured values would alias instance state.
    fn clone(&self) -> Self {
        Self {
            scripts: self.scripts.clone(),
            instances: BTreeMap::new(),
            instance_epoch: self.instance_epoch,
            generations: self.generations.clone(),
            retired_generations: self.retired_generations.clone(),
            world_view: self.world_view.clone(),
        }
    }
}

impl ScriptRuntime {
    // 编译脚本并提取声明的函数名，供测试发现和生命周期调度使用。
    /// Discover actual script functions without executing module statements.
    /// Receiver methods are not callable as test/lifecycle callbacks.
    pub fn function_names(&self, source: &str) -> Result<Vec<String>, String> {
        let prepared = prepare_script(source)?;
        let ast = base_engine().compile(&prepared.source).map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )?;
        Ok(ast
            .iter_functions()
            .filter(
                /* 计算并返回 function . this_type . is_none ()，用于当前 function_names 流程。 */
                |function| function.this_type.is_none(),
            )
            .map(
                /* 计算并返回 function . name . to_owned ()，用于当前 function_names 流程。 */
                |function| function.name.to_owned(),
            )
            .collect())
    }

    // 创建空脚本编译缓存的默认运行时。
    pub fn new() -> Self {
        Self::default()
    }

    // 编译并校验脚本，返回可编辑导出属性或错误。
    pub fn validate(&self, source: &str) -> Result<Vec<ExportedProperty>, String> {
        let prepared = prepare_script(source)?;
        let engine = base_engine();
        engine.compile(&prepared.source).map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )?;
        Ok(prepared.exports)
    }

    // 准备脚本后按给定上下文执行指定生命周期回调。
    pub fn execute(
        &self,
        source: &str,
        function: &str,
        context: ScriptContext,
    ) -> Result<ScriptExecution, String> {
        let prepared = prepare_script(source)?;
        let engine = base_engine();
        let ast = engine.compile(&prepared.source).map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )?;
        execute_prepared(&prepared, &ast, function, context)
    }

    // 先完成新脚本编译，再原子替换缓存；失败时保留旧程序。
    /// Compile a script without replacing the previous valid program until
    /// compilation succeeds. The host applies this at a frame boundary.
    pub fn upsert(
        &mut self,
        script_id: &str,
        source: &str,
    ) -> Result<Vec<ExportedProperty>, String> {
        if script_id.trim().is_empty() {
            return Err("script id cannot be empty".into());
        }
        let prepared = prepare_script(source)?;
        if let Some(existing) = self.scripts.get(script_id) {
            if existing.prepared == prepared {
                return Ok(existing.prepared.exports.clone());
            }
        }
        let ast = base_engine().compile(&prepared.source).map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )?;
        let exports = prepared.exports.clone();
        self.scripts.insert(
            script_id.to_owned(),
            Rc::new(CompiledScript { prepared, ast }),
        );
        Ok(exports)
    }

    // 移除指定脚本的缓存条目并返回是否存在。
    pub fn remove(&mut self, script_id: &str) -> bool {
        self.reset_script_instances(script_id);
        self.scripts.remove(script_id).is_some()
    }

    // 从编译缓存读取脚本并按本次上下文执行。
    pub fn execute_cached(
        &self,
        script_id: &str,
        function: &str,
        context: ScriptContext,
    ) -> Result<ScriptExecution, String> {
        let compiled = self
            .scripts
            .get(script_id)
            .ok_or_else(/* 计算并返回 format ! ("script is not compiled: {script_id}")，用于当前 execute_cached 流程。 */ || format!("script is not compiled: {script_id}"))?;
        execute_prepared(&compiled.prepared, &compiled.ast, function, context)
    }

    /// Live gameplay API. Tools keep the explicitly stateless execute/execute_cached path.
    pub fn execute_instance(
        &mut self,
        script_id: &str,
        function: &str,
        epoch: u32,
        generation: u32,
        context: ScriptContext,
    ) -> Result<ScriptExecution, String> {
        self.execute_instance_with(script_id, function, epoch, generation, context, None)
    }

    /// 26.44: runs a callback under a debug probe. When the probe stops the run, the instance state
    /// is restored to what it was before the call and the result carries only the pause (no
    /// commands, logs or property changes), so the host can show the stop and later re-run the
    /// same callback with a probe that resumes after it.
    pub fn execute_instance_debug(
        &mut self,
        script_id: &str,
        function: &str,
        epoch: u32,
        generation: u32,
        context: ScriptContext,
        probe: ScriptDebugProbe,
    ) -> Result<ScriptExecution, String> {
        self.execute_instance_with(script_id, function, epoch, generation, context, Some(probe))
    }

    fn execute_instance_with(
        &mut self,
        script_id: &str,
        function: &str,
        epoch: u32,
        generation: u32,
        context: ScriptContext,
        probe: Option<ScriptDebugProbe>,
    ) -> Result<ScriptExecution, String> {
        if epoch == 0 || generation == 0 || context.entity.is_empty() {
            return Err("invalid live script instance identity".into());
        }
        match self.instance_epoch {
            None => self.instance_epoch = Some(epoch),
            Some(current) if current != epoch => return Err("stale script world epoch".into()),
            _ => {}
        }
        let context_generation = context
            .shared_world
            .as_ref()
            .map(|world| {
                world
                    .borrow()
                    .snapshot
                    .entity_generations
                    .get(&context.entity)
                    .copied()
            })
            .unwrap_or_else(|| context.entity_generations.get(&context.entity).copied());
        if context_generation != Some(generation) {
            return Err("stale script entity generation".into());
        }
        if self
            .retired_generations
            .get(&context.entity)
            .is_some_and(|retired| generation <= *retired)
            || self
                .generations
                .get(&context.entity)
                .is_some_and(|current| generation < *current)
        {
            return Err("stale script entity generation".into());
        }
        let program = self
            .scripts
            .get(script_id)
            .cloned()
            .ok_or_else(|| format!("script is not compiled: {script_id}"))?;
        if self
            .generations
            .get(&context.entity)
            .is_some_and(|current| generation > *current)
        {
            self.instances.retain(|key, _| key.entity != context.entity);
        }
        self.generations.insert(context.entity.clone(), generation);
        let key = ScriptInstanceKey {
            epoch,
            entity: context.entity.clone(),
            generation,
            script: script_id.to_owned(),
        };
        let changed = self
            .instances
            .get(&key)
            .is_some_and(|instance| !Rc::ptr_eq(&instance.program, &program));
        if changed {
            self.instances.remove(&key);
        }
        if !self.instances.contains_key(&key) {
            if self.instances.len() >= MAX_SCRIPT_INSTANCES {
                return Err("script instance capacity exhausted".into());
            }
            self.instances.insert(
                key.clone(),
                ScriptInstance {
                    program: Rc::clone(&program),
                    scope: Scope::new(),
                    initialized: false,
                },
            );
        }
        let instance = self
            .instances
            .get_mut(&key)
            .expect("inserted live script instance");
        if instance.initialized {
            for exported in &program.prepared.exports {
                if let Some(value) = context
                    .properties
                    .get(&exported.name)
                    .and_then(|value| json_to_export_dynamic(exported, value))
                {
                    instance.scope.set_value(&exported.name, value);
                }
            }
        }
        let Some(probe) = probe else {
            return execute_in_scope(
                &program.prepared,
                &program.ast,
                function,
                context,
                &mut instance.scope,
                &mut instance.initialized,
            );
        };
        let saved_scope = instance.scope.clone();
        let saved_initialized = instance.initialized;
        let properties = context.properties.clone();
        let guard = DebugProbeGuard::enter(probe);
        let result = execute_in_scope_with(
            acquire_debug_host_engine(),
            &program.prepared,
            &program.ast,
            function,
            context,
            &mut instance.scope,
            &mut instance.initialized,
        );
        match guard.take_pause() {
            Some(pause) => {
                instance.scope = saved_scope;
                instance.initialized = saved_initialized;
                Ok(ScriptExecution {
                    commands: Vec::new(),
                    logs: Vec::new(),
                    properties,
                    pause: Some(pause),
                })
            }
            None => result,
        }
    }

    pub fn clear_instances(&mut self, epoch: u32) -> Result<(), String> {
        if epoch == 0 || self.instance_epoch.is_some_and(|current| epoch < current) {
            return Err("stale script world epoch".into());
        }
        self.instances.clear();
        self.generations.clear();
        self.retired_generations.clear();
        self.world_view = None;
        self.instance_epoch = Some(epoch);
        Ok(())
    }

    pub fn publish_world_context(
        &mut self,
        epoch: u32,
        revision: u32,
        snapshot: ScriptWorldSnapshot,
    ) -> Result<(), String> {
        if self.instance_epoch != Some(epoch) || epoch == 0 {
            return Err("stale script world epoch".into());
        }
        if revision == 0
            || self
                .world_view
                .as_ref()
                .is_some_and(|world| revision <= world.borrow().revision)
        {
            return Err("stale script world revision".into());
        }
        let view = ScriptWorldView::from_snapshot(epoch, revision, snapshot)?;
        self.world_view = Some(Rc::new(RefCell::new(view)));
        Ok(())
    }

    /// Deltas describe already committed Owner writes. Validate the complete batch before mutation.
    pub fn apply_world_delta(
        &mut self,
        epoch: u32,
        base_revision: u32,
        revision: u32,
        changes: Vec<SceneEntitySnapshot>,
    ) -> Result<(), String> {
        let world = self
            .world_view
            .as_ref()
            .ok_or("script world context is not published")?;
        let mut world = world.borrow_mut();
        if world.epoch != epoch || self.instance_epoch != Some(epoch) {
            return Err("stale script world epoch".into());
        }
        if world.revision != base_revision || base_revision.checked_add(1) != Some(revision) {
            return Err("stale script world revision".into());
        }
        if changes.len() > MAX_SCRIPT_INSTANCES {
            return Err("script world delta capacity exceeded".into());
        }
        let mut ids = std::collections::BTreeSet::new();
        for entity in &changes {
            ScriptWorldView::validate_entity(entity)?;
            let old = world
                .index
                .get(&entity.uuid)
                .and_then(|n| world.snapshot.scene_entities.get(*n))
                .ok_or("script world delta needs a structural publication")?;
            if old.generation != entity.generation
                || old.name != entity.name
                || !ids.insert(&entity.uuid)
            {
                return Err("script world delta identity changed or duplicated".into());
            }
        }
        for entity in changes {
            let n = world.index[&entity.uuid];
            world.snapshot.scene_entities[n] = entity;
        }
        world.revision = revision;
        Ok(())
    }

    pub fn execute_instance_context(
        &mut self,
        script_id: &str,
        function: &str,
        epoch: u32,
        revision: u32,
        generation: u32,
        mut context: ScriptContext,
    ) -> Result<ScriptExecution, String> {
        let world = self
            .world_view
            .as_ref()
            .ok_or("script world context is not published")?;
        {
            let view = world.borrow();
            if view.epoch != epoch {
                return Err("stale script world epoch".into());
            }
            if view.revision != revision {
                return Err("stale script world revision".into());
            }
        }
        if !context.entities.is_empty()
            || !context.entity_generations.is_empty()
            || !context.scene_entities.is_empty()
        {
            return Err("small script context must reference the published world".into());
        }
        context.shared_world = Some(Rc::clone(world));
        self.execute_instance(script_id, function, epoch, generation, context)
    }

    /// 26.44: `execute_instance_context` under a debug probe (see `execute_instance_debug`).
    #[allow(clippy::too_many_arguments)]
    pub fn execute_instance_context_debug(
        &mut self,
        script_id: &str,
        function: &str,
        epoch: u32,
        revision: u32,
        generation: u32,
        mut context: ScriptContext,
        probe: ScriptDebugProbe,
    ) -> Result<ScriptExecution, String> {
        let world = self
            .world_view
            .as_ref()
            .ok_or("script world context is not published")?;
        {
            let view = world.borrow();
            if view.epoch != epoch || view.revision != revision {
                return Err("stale script world revision".into());
            }
        }
        if !context.entities.is_empty()
            || !context.entity_generations.is_empty()
            || !context.scene_entities.is_empty()
        {
            return Err("small script context must reference the published world".into());
        }
        context.shared_world = Some(Rc::clone(world));
        self.execute_instance_debug(script_id, function, epoch, generation, context, probe)
    }

    pub fn remove_entity_instances(&mut self, epoch: u32, entity: &str) -> bool {
        if self.instance_epoch != Some(epoch) {
            return false;
        }
        if let Some(generation) = self.generations.get(entity).copied() {
            self.retired_generations
                .insert(entity.to_owned(), generation);
        }
        let before = self.instances.len();
        self.instances.retain(|key, _| key.entity != entity);
        before != self.instances.len()
    }

    pub fn reset_script_instances(&mut self, script: &str) {
        self.instances.retain(|key, _| key.script != script);
    }

    /// 26.45: a copy of the live instances (their scopes and whether `awake` ran), for the
    /// debugger's rewind. Scopes are cloned the way the debug probe saves them before a stopped run.
    pub fn snapshot_instances(&self) -> ScriptInstancesSnapshot {
        ScriptInstancesSnapshot {
            epoch: self.instance_epoch,
            instances: self
                .instances
                .iter()
                .map(|(key, instance)| {
                    (
                        key.clone(),
                        Rc::clone(&instance.program),
                        instance.scope.clone(),
                        instance.initialized,
                    )
                })
                .collect(),
        }
    }

    /// 26.45: puts the instances of a snapshot back (instances created since are dropped). A
    /// snapshot of another play session, or instances of a script that was recompiled since, are
    /// not restored. Returns the number of instances restored, or None for another session.
    pub fn restore_instances(&mut self, snapshot: &ScriptInstancesSnapshot) -> Option<usize> {
        if snapshot.epoch != self.instance_epoch {
            return None;
        }
        self.instances.clear();
        for (key, program, scope, initialized) in &snapshot.instances {
            let current = self
                .scripts
                .get(&key.script)
                .is_some_and(|live| Rc::ptr_eq(live, program));
            let retired = self
                .retired_generations
                .get(&key.entity)
                .is_some_and(|retired| key.generation <= *retired);
            if current && !retired {
                self.instances.insert(
                    key.clone(),
                    ScriptInstance {
                        program: Rc::clone(program),
                        scope: scope.clone(),
                        initialized: *initialized,
                    },
                );
            }
        }
        Some(self.instances.len())
    }

    /// Called once after candidate validation. Only identical compiled revisions retain private state.
    pub fn take_instances_from(&mut self, source: &mut Self) -> Result<usize, String> {
        if self.instance_epoch != source.instance_epoch {
            return Err("script candidate epoch mismatch".into());
        }
        if !self.instances.is_empty() {
            return Err("script candidate executed before owner commit".into());
        }
        let instances = std::mem::take(&mut source.instances);
        for (key, instance) in instances {
            if self
                .scripts
                .get(&key.script)
                .is_some_and(|program| Rc::ptr_eq(program, &instance.program))
            {
                self.instances.insert(key, instance);
            }
        }
        Ok(self.instances.len())
    }
}

// 建立受限宿主引擎，恢复导出状态，执行回调并汇总命令和属性。
fn execute_prepared(
    prepared: &PreparedScript,
    ast: &AST,
    function: &str,
    context: ScriptContext,
) -> Result<ScriptExecution, String> {
    let mut scope = Scope::new();
    let mut initialized = false;
    execute_in_scope(
        prepared,
        ast,
        function,
        context,
        &mut scope,
        &mut initialized,
    )
}

fn execute_in_scope(
    prepared: &PreparedScript,
    ast: &AST,
    function: &str,
    context: ScriptContext,
    scope: &mut Scope<'static>,
    initialized: &mut bool,
) -> Result<ScriptExecution, String> {
    execute_in_scope_with(
        acquire_host_engine(),
        prepared,
        ast,
        function,
        context,
        scope,
        initialized,
    )
}

fn execute_in_scope_with(
    host: Rc<HostEngine>,
    prepared: &PreparedScript,
    ast: &AST,
    function: &str,
    mut context: ScriptContext,
    scope: &mut Scope<'static>,
    initialized: &mut bool,
) -> Result<ScriptExecution, String> {
    // Legacy tools still own their snapshot; host closures share one projection instead of cloning it.
    if context.shared_world.is_none() {
        let snapshot = ScriptWorldSnapshot {
            protocol_version: 1,
            entity_generations: std::mem::take(&mut context.entity_generations),
            entities: std::mem::take(&mut context.entities),
            scene_entities: std::mem::take(&mut context.scene_entities),
        };
        let mut index = BTreeMap::new();
        for (n, entity) in snapshot.scene_entities.iter().enumerate() {
            index.entry(entity.uuid.clone()).or_insert(n);
        }
        context.shared_world = Some(Rc::new(RefCell::new(ScriptWorldView {
            snapshot,
            index,
            ..ScriptWorldView::default()
        })));
    }
    let _depth = DepthGuard::enter();
    *host.output.borrow_mut() = HostOutput::default();
    host.states.reset(&context);
    let _context = ContextGuard::enter(&context);
    let engine = &host.engine;
    let output = Rc::clone(&host.output);
    if !*initialized {
        if let Err(error) = engine.run_ast_with_scope(scope, ast) {
            scope.clear();
            if let Some(limit) = host_output_limit_error(&output) {
                return Err(limit);
            }
            return Err(error.to_string());
        }
        *initialized = true;
    }
    if let Err(error) = call_lifecycle(engine, scope, ast, function, &context) {
        if let Some(limit) = host_output_limit_error(&output) {
            return Err(limit);
        }
        return Err(error);
    }

    let properties = collect_properties(scope, &prepared.exports, &context.properties);
    let mut output = output.borrow_mut();
    if output.commands.len() > MAX_SCRIPT_COMMANDS {
        return Err(format!(
            "script emitted {} host commands; the per-invocation limit is {MAX_SCRIPT_COMMANDS}",
            output.commands.len()
        ));
    }
    output.logs.truncate(MAX_SCRIPT_LOGS);
    for warning in &prepared.compatibility_warnings {
        if output.logs.len() >= MAX_SCRIPT_LOGS {
            break;
        }
        output.logs.push(ScriptLog {
            level: "warning".into(),
            message: warning.clone(),
        });
    }
    Ok(ScriptExecution {
        commands: std::mem::take(&mut output.commands),
        logs: std::mem::take(&mut output.logs),
        properties,
        pause: None,
    })
}

// ---------------------------------------------------------------------------------------------
// 26.43 engine reuse. Every callback used to build a new Rhai Engine and register about 190 host
// closures that captured copies of that callback's context (146 µs per callback on a desktop CPU,
// several times that in WebAssembly). The engine is now built once per thread. Host closures read the
// context of the callback that is running through `Live` handles, the output buffer and per-call
// states (random seed, trace clock, spawn serial) are reset before each call.
// ---------------------------------------------------------------------------------------------
thread_local! {
    static CURRENT_CONTEXT: std::cell::Cell<*const ScriptContext> = const { std::cell::Cell::new(std::ptr::null()) };
    static FALLBACK_CONTEXT: &'static FallbackContext = Box::leak(Box::default());
    static CACHED_HOST: RefCell<Option<Rc<HostEngine>>> = const { RefCell::new(None) };
    static HOST_DEPTH: std::cell::Cell<u32> = const { std::cell::Cell::new(0) };
}

#[derive(Default)]
struct FallbackContext {
    context: ScriptContext,
    character: CharacterSnapshot,
    animator: AnimatorSnapshot,
}

impl FallbackContext {
    fn character_default(&self) -> &CharacterSnapshot {
        &self.character
    }

    fn animator_default(&self) -> &AnimatorSnapshot {
        &self.animator
    }
}

// 未在执行回调时（例如生成 API 签名）读取的空上下文。
fn fallback_context() -> &'static FallbackContext {
    FALLBACK_CONTEXT.with(|context| *context)
}

// 当前正在执行的回调上下文；回调之外为空上下文。
fn current_context() -> &'static ScriptContext {
    let pointer = CURRENT_CONTEXT.with(|current| current.get());
    if pointer.is_null() {
        &fallback_context().context
    } else {
        // SAFETY: the pointer is set by ContextGuard for exactly the duration of an engine call and
        // points to a context owned by that call frame; host closures only run inside such a call.
        unsafe { &*pointer }
    }
}

/// A field of the running callback's context, read at call time.
struct Live<T: 'static> {
    project: fn(&'static ScriptContext) -> &'static T,
}

impl<T: 'static> Clone for Live<T> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<T: 'static> Copy for Live<T> {}

impl<T: Clone + 'static> Live<T> {
    /// `value.clone()` inside a host closure clones the running callback's value, never the handle
    /// (inherent methods take precedence over `Clone::clone`). Copy the handle with `let a = b;`.
    #[allow(clippy::should_implement_trait)]
    fn clone(&self) -> T {
        (**self).clone()
    }
}

impl<T: 'static> std::ops::Deref for Live<T> {
    type Target = T;
    fn deref(&self) -> &T {
        (self.project)(current_context())
    }
}

impl<T: std::fmt::Display + 'static> std::fmt::Display for Live<T> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        std::fmt::Display::fmt(&**self, formatter)
    }
}

macro_rules! live {
    ($($field:ident).+) => {
        Live { project: |context: &'static ScriptContext| &context.$($field).+ }
    };
}

macro_rules! live_with {
    (|$context:ident| $body:expr) => {
        Live {
            project: |$context: &'static ScriptContext| $body,
        }
    };
}

macro_rules! live_world {
    () => {
        live_with!(|context| context
            .shared_world
            .as_ref()
            .expect("host world projection"))
    };
}

/// Sets the running callback's context and restores the previous one when the call ends.
struct ContextGuard {
    previous: *const ScriptContext,
}

impl ContextGuard {
    fn enter(context: &ScriptContext) -> Self {
        let previous =
            CURRENT_CONTEXT.with(|current| current.replace(context as *const ScriptContext));
        Self { previous }
    }
}

impl Drop for ContextGuard {
    fn drop(&mut self) {
        CURRENT_CONTEXT.with(|current| current.set(self.previous));
    }
}

/// Per-call mutable host state, reset before every callback.
struct HostCallStates {
    random: Rc<RefCell<u64>>,
    trace_clock: Rc<RefCell<Instant>>,
    pending_serial: Rc<RefCell<u64>>,
}

impl HostCallStates {
    fn new() -> Self {
        Self {
            random: Rc::new(RefCell::new(0x6d2b79f5)),
            trace_clock: Rc::new(RefCell::new(Instant::now())),
            pending_serial: Rc::new(RefCell::new(0)),
        }
    }

    fn reset(&self, context: &ScriptContext) {
        *self.random.borrow_mut() = if context.random_seed == 0 {
            0x6d2b79f5
        } else {
            context.random_seed
        };
        *self.trace_clock.borrow_mut() = Instant::now();
        *self.pending_serial.borrow_mut() = 0;
    }
}

struct HostEngine {
    engine: Engine,
    output: Rc<RefCell<HostOutput>>,
    states: HostCallStates,
}

impl HostEngine {
    fn build() -> Self {
        let output = Rc::new(RefCell::new(HostOutput::default()));
        let states = HostCallStates::new();
        let engine = build_host_engine(Rc::clone(&output), &states);
        Self {
            engine,
            output,
            states,
        }
    }
}

impl HostEngine {
    /// 26.44: the same host engine with a statement debugger; used only for debug runs.
    // `register_debugger` is marked volatile (deprecated) by Rhai, not removed.
    #[allow(deprecated)]
    fn build_debug() -> Self {
        let output = Rc::new(RefCell::new(HostOutput::default()));
        let states = HostCallStates::new();
        let mut engine = build_host_engine(Rc::clone(&output), &states);
        engine.register_debugger(
            /* 每次运行从 Init 开始；第一个节点触发 Start，随后由回调保持逐节点步进。 */
            |_, debugger| debugger,
            debug_probe_event,
        );
        Self {
            engine,
            output,
            states,
        }
    }
}

thread_local! {
    static CACHED_DEBUG_HOST: RefCell<Option<Rc<HostEngine>>> = const { RefCell::new(None) };
    static DEBUG_PROBE: RefCell<Option<DebugProbeState>> = const { RefCell::new(None) };
}

struct DebugProbeState {
    probe: ScriptDebugProbe,
    event: u64,
    pause: Option<ScriptDebugPause>,
}

const MAX_DEBUG_LOCALS: usize = 256;

// 26.44: counts statements of a debug run and stops it where the probe asks (see ScriptDebugProbe).
fn debug_probe_event(
    context: rhai::EvalContext,
    event: rhai::debugger::DebuggerEvent,
    node: rhai::ASTNode,
    _source: Option<&str>,
    position: rhai::Position,
) -> Result<rhai::debugger::DebuggerCommand, Box<rhai::EvalAltResult>> {
    use rhai::debugger::{DebuggerCommand, DebuggerEvent};
    let counted = matches!(
        event,
        DebuggerEvent::Start | DebuggerEvent::Step | DebuggerEvent::BreakPoint(_)
    ) && matches!(node, rhai::ASTNode::Stmt(statement) if !matches!(statement, rhai::Stmt::Block(..) | rhai::Stmt::Noop(..)))
        && !position.is_none();
    if !counted {
        return Ok(DebuggerCommand::StepInto);
    }
    let stop = DEBUG_PROBE.with(|probe| {
        let mut probe = probe.borrow_mut();
        let Some(state) = probe.as_mut() else {
            return false;
        };
        if state.pause.is_some() {
            return false;
        }
        state.event += 1;
        let line = position.line().unwrap_or(0);
        let depth = context.global_runtime_state().level;
        // Stepping over or out still stops at a breakpoint inside the code it skips.
        let at_break = state.probe.break_lines.contains(&line);
        let hit = state.event > state.probe.after_event
            && match state.probe.mode.as_str() {
                "into" => true,
                "over" => depth <= state.probe.depth || at_break,
                "out" => depth < state.probe.depth || at_break,
                _ => at_break,
            };
        if !hit {
            return false;
        }
        let locals = context
            .scope()
            .iter()
            .filter(|(name, ..)| !name.starts_with('_') || name.len() > 1)
            .take(MAX_DEBUG_LOCALS)
            .map(|(name, constant, value)| ScriptDebugLocal {
                name: name.to_owned(),
                value: dynamic_to_json(value.clone())
                    .unwrap_or_else(|| Value::String(format!("<{}>", value.type_name()))),
                constant,
            })
            .collect();
        let mut stack: Vec<ScriptDebugFrame> = context
            .debugger()
            .map(|debugger| {
                debugger
                    .call_stack()
                    .iter()
                    .map(|frame| ScriptDebugFrame {
                        function: frame.fn_name.to_string(),
                        line: frame.pos.line().unwrap_or(0),
                    })
                    .collect()
            })
            .unwrap_or_default();
        stack.truncate(64);
        state.pause = Some(ScriptDebugPause {
            event: state.event,
            line,
            column: position.position().unwrap_or(0),
            depth,
            locals,
            stack,
        });
        true
    });
    if stop {
        Err(Box::new(rhai::EvalAltResult::ErrorTerminated(
            Dynamic::UNIT,
            position,
        )))
    } else {
        Ok(DebuggerCommand::StepInto)
    }
}

fn acquire_debug_host_engine() -> Rc<HostEngine> {
    CACHED_DEBUG_HOST.with(|cached| {
        Rc::clone(
            cached
                .borrow_mut()
                .get_or_insert_with(|| Rc::new(HostEngine::build_debug())),
        )
    })
}

/// Installs a probe for one debug run and removes it afterwards (also on panic or early return).
struct DebugProbeGuard;

impl DebugProbeGuard {
    fn enter(probe: ScriptDebugProbe) -> Self {
        DEBUG_PROBE.with(|state| {
            *state.borrow_mut() = Some(DebugProbeState {
                probe,
                event: 0,
                pause: None,
            })
        });
        DebugProbeGuard
    }

    fn take_pause(&self) -> Option<ScriptDebugPause> {
        DEBUG_PROBE.with(|state| {
            state
                .borrow_mut()
                .as_mut()
                .and_then(|state| state.pause.take())
        })
    }
}

impl Drop for DebugProbeGuard {
    fn drop(&mut self) {
        DEBUG_PROBE.with(|state| *state.borrow_mut() = None);
    }
}

/// The thread's reusable host engine; a nested call (a host function running a script) gets its own.
fn acquire_host_engine() -> Rc<HostEngine> {
    if HOST_DEPTH.with(|depth| depth.get()) > 0 {
        return Rc::new(HostEngine::build());
    }
    CACHED_HOST.with(|cached| {
        Rc::clone(
            cached
                .borrow_mut()
                .get_or_insert_with(|| Rc::new(HostEngine::build())),
        )
    })
}

struct DepthGuard;

impl DepthGuard {
    fn enter() -> Self {
        HOST_DEPTH.with(|depth| depth.set(depth.get() + 1));
        DepthGuard
    }
}

impl Drop for DepthGuard {
    fn drop(&mut self) {
        HOST_DEPTH.with(|depth| depth.set(depth.get().saturating_sub(1)));
    }
}

// 检查沙箱宿主输出是否超过命令或文本等预算，并提供错误消息。
fn host_output_limit_error(output: &Rc<RefCell<HostOutput>>) -> Option<String> {
    let output = output.borrow();
    if output.commands.len() > MAX_SCRIPT_COMMANDS {
        Some(format!("script emitted too many host commands; the per-invocation limit is {MAX_SCRIPT_COMMANDS}"))
    } else if output.logs.len() > MAX_SCRIPT_LOGS {
        Some(format!(
            "script emitted too many log entries; the per-invocation limit is {MAX_SCRIPT_LOGS}"
        ))
    } else {
        None
    }
}

// 创建基础 Rhai 引擎并配置操作、集合及调用深度限制。
fn base_engine() -> Engine {
    let mut engine = Engine::new();
    engine.set_max_operations(MAX_SCRIPT_OPERATIONS);
    engine.set_max_call_levels(32);
    engine.set_max_expr_depths(64, 32);
    engine.set_max_string_size(MAX_SCRIPT_STRING_SIZE);
    engine.set_max_array_size(MAX_SCRIPT_ARRAY_SIZE);
    engine.set_max_map_size(MAX_SCRIPT_MAP_SIZE);
    engine.disable_symbol("eval");
    engine.disable_symbol("import");
    engine.disable_symbol("sleep");
    // A VM operation budget cannot interrupt an OS thread sleep, and sleeping
    // traps on wasm32-unknown-unknown. Guard function-pointer dispatch as well
    // as direct syntax; scripts should schedule timers/tasks through the host.
    engine.register_fn(
        "sleep",
        /* 拒绝阻塞睡眠调用，引导脚本使用引擎计时器或任务调度。 */
        |_seconds: INT| -> Result<(), Box<rhai::EvalAltResult>> {
            Err("Blocking sleep is disabled; use Nova_A timer/task scheduling".into())
        },
    );
    engine.register_fn(
        "sleep",
        /* 拒绝阻塞睡眠调用，引导脚本使用引擎计时器或任务调度。 */
        |_seconds: FLOAT| -> Result<(), Box<rhai::EvalAltResult>> {
            Err("Blocking sleep is disabled; use Nova_A timer/task scheduling".into())
        },
    );
    engine
}

// 在基础沙箱注册各宿主接口和有界输出回调。保留旧签名，供 API 签名生成脚本使用；宿主函数读取执行时的上下文。
#[allow(dead_code)]
fn engine_with_host(_context: &ScriptContext, output: Rc<RefCell<HostOutput>>) -> Engine {
    build_host_engine(output, &HostCallStates::new())
}

// 26.43: 构造一次、可复用的宿主引擎。
fn build_host_engine(output: Rc<RefCell<HostOutput>>, states: &HostCallStates) -> Engine {
    let mut engine = base_engine();

    let resource_budget = Rc::clone(&output);
    engine.on_progress(
        /* 在执行进度边界检查宿主命令与日志数量，超过预算立即中止脚本。 */
        move |_| {
            let output = resource_budget.borrow();
            if output.commands.len() > MAX_SCRIPT_COMMANDS {
                Some("Script emitted too many host commands".into())
            } else if output.logs.len() > MAX_SCRIPT_LOGS {
                Some("Script emitted too many log entries".into())
            } else {
                None
            }
        },
    );

    let logs = Rc::clone(&output);
    engine.on_print(
        /* 将脚本打印转换为有条数与字符长度限制的信息日志。 */
        move |message| {
            let mut logs = logs.borrow_mut();
            if logs.logs.len() < MAX_SCRIPT_LOGS {
                logs.logs.push(ScriptLog {
                    level: "info".into(),
                    message: message.chars().take(4_096).collect(),
                });
            }
        },
    );

    let entity = live!(entity);
    engine.register_fn(
        "entity",
        /* 复制 entity . clone () 的结果，避免向调用方暴露可变宿主引用。 */
        move || entity.clone(),
    );
    let requested_api_version = live!(api_version);
    engine.register_fn(
        "api_version",
        /* 返回本次调用上下文请求的 API 版本（0 表示当前版本）。 */
        move || {
            let requested = *requested_api_version;
            (if requested == 0 {
                CURRENT_SCRIPT_API_VERSION
            } else {
                requested.clamp(MINIMUM_SCRIPT_API_VERSION, CURRENT_SCRIPT_API_VERSION)
            }) as INT
        },
    );
    engine.register_fn(
        "api_current_version",
        /* 返回当前快照值 CURRENT_SCRIPT_API_VERSION as INT。 */
        || CURRENT_SCRIPT_API_VERSION as INT,
    );
    engine.register_fn(
        "api_minimum_version",
        /* 返回当前快照值 MINIMUM_SCRIPT_API_VERSION as INT。 */
        || MINIMUM_SCRIPT_API_VERSION as INT,
    );
    engine.register_fn("api_namespace", /* 计算并返回 symbol . split ('_') . next () . unwrap_or (symbol) . to_owned ()，用于当前 engine_with_host 流程。 */ |symbol: &str| {
        symbol.split('_').next().unwrap_or(symbol).to_owned()
    });
    let entity = live!(entity);
    let world = live_world!();
    engine.register_fn(
        "entity_handle",
        /* 计算并返回 entity_handle_map (& entity , generation)，用于当前 engine_with_host 流程。 */
        move || {
            let generation = world
                .borrow()
                .snapshot
                .entity_generations
                .get(&*entity)
                .copied();
            entity_handle_map(&entity, generation)
        },
    );
    let entity_name = live!(entity_name);
    engine.register_fn(
        "entity_name",
        /* 复制 entity_name . clone () 的结果，避免向调用方暴露可变宿主引用。 */
        move || entity_name.clone(),
    );
    let world = live_world!();
    engine.register_fn("find_entity", move |name: &str| {
        world
            .borrow()
            .snapshot
            .entities
            .get(name)
            .cloned()
            .unwrap_or_default()
    });
    // 26.43: a handle for an entity id (e.g. `other` in a collision callback) at its current generation.
    let world = live_world!();
    engine.register_fn("entity_handle_of", move |id: &str| {
        let view = world.borrow();
        match view.snapshot.entity_generations.get(id) {
            Some(generation) => entity_handle_map(id, Some(*generation)),
            None => handle_map(false, "Entity", "", "Entity not found"),
        }
    });
    let world = live_world!();
    engine.register_fn("find_entity_handle", move |name: &str| {
        let view = world.borrow();
        view.snapshot
            .entities
            .get(name)
            .map(|id| entity_handle_map(id, view.snapshot.entity_generations.get(id).copied()))
            .unwrap_or_else(|| handle_map(false, "Entity", "", "Entity not found"))
    });
    let components = live!(components);
    engine.register_fn("has_component", /* 判断 components . iter () . any (| component | component == kind) 是否成立，供过滤或有效性检查使用。 */ move |kind: &str| {
        components.iter().any(/* 判断 component == kind 是否成立，供过滤或有效性检查使用。 */ |component| component == kind)
    });
    let component_entity = live!(entity);
    let components = live!(components);
    engine.register_fn("get_component", /* 查找实体实际拥有的组件，返回其引用字符串；缺失则返回空串。 */ move |kind: &str| {
        components
            .iter()
            .find(/* 判断 component . as_str () == kind 是否成立，供过滤或有效性检查使用。 */ |component| component.as_str() == kind)
            .map(/* 计算并返回 format ! ("component://{component_entity}/{component}")，用于当前 engine_with_host 流程。 */ |component| format!("component://{component_entity}/{component}"))
            .unwrap_or_default()
    });
    let component_entity = live!(entity);
    let components = live!(components);
    engine.register_fn(
        "component_handle",
        /* 仅为当前实体实际拥有的组件生成有效句柄，否则返回带错误的失效句柄。 */
        move |kind: &str| {
            if components.iter().any(
                /* 判断 component == kind 是否成立，供过滤或有效性检查使用。 */
                |component| component == kind,
            ) {
                handle_map(
                    true,
                    kind,
                    &format!("component://{component_entity}/{kind}"),
                    "",
                )
            } else {
                handle_map(false, kind, "", "Component not found")
            }
        },
    );
    engine.register_fn(
        "resource_handle",
        /* 校验资源引用前缀、路径和类型后构造资源句柄。 */
        |reference: &str, resource_type: &str| {
            let valid = reference.starts_with("asset://")
                && reference.len() > "asset://".len()
                && !reference.contains("..")
                && !resource_type.trim().is_empty();
            handle_map(
                valid,
                resource_type.trim(),
                if valid { reference } else { "" },
                if valid {
                    ""
                } else {
                    "Invalid resource reference"
                },
            )
        },
    );
    register_entity_api(&mut engine);

    register_time_api(&mut engine);
    let random_state = Rc::clone(&states.random);
    let state = Rc::clone(&random_state);
    engine.register_fn(
        "random",
        /* 推进异或移位随机状态，并将结果归一化到零到一之间。 */
        move || {
            let mut value = state.borrow_mut();
            *value ^= *value << 13;
            *value ^= *value >> 7;
            *value ^= *value << 17;
            (*value as f64) / (u64::MAX as f64 + 1.0)
        },
    );
    let state = Rc::clone(&random_state);
    engine.register_fn(
        "random_range",
        /* 校验随机范围，推进确定性异或移位种子，并映射到指定浮点区间。 */
        move |minimum: FLOAT, maximum: FLOAT| {
            if !minimum.is_finite() || !maximum.is_finite() || maximum <= minimum {
                return minimum;
            }
            let mut value = state.borrow_mut();
            *value ^= *value << 13;
            *value ^= *value >> 7;
            *value ^= *value << 17;
            minimum + (maximum - minimum) * ((*value as f64) / (u64::MAX as f64 + 1.0))
        },
    );
    register_input_api(&mut engine);
    register_game_flow_api(&mut engine);
    register_network_api(&mut engine);
    register_property_api(&mut engine);
    register_save_api(&mut engine, Rc::clone(&output));
    register_editor_automation_api(&mut engine, Rc::clone(&output));
    register_link_and_media_api(&mut engine, Rc::clone(&output));
    register_rhythm_api(&mut engine, Rc::clone(&output));
    register_effects_api(&mut engine, Rc::clone(&output));
    register_command_api(&mut engine, output, states);
    engine
}

// 构造带有效性、类型、身份和错误信息的脚本句柄映射。
fn handle_map(valid: bool, kind: &str, id: &str, error: &str) -> Map {
    let mut map = Map::new();
    map.insert("valid".into(), Dynamic::from_bool(valid));
    map.insert("kind".into(), Dynamic::from(kind.to_owned()));
    map.insert("id".into(), Dynamic::from(id.to_owned()));
    map.insert("error".into(), Dynamic::from(error.to_owned()));
    map.insert("api_version".into(), Dynamic::from_int(1));
    let generation = handle_generation(id);
    map.insert(
        "generation".into(),
        Dynamic::from_int(INT::from(generation)),
    );
    map
}

// 从句柄标识解析生命周期代数。
fn handle_generation(id: &str) -> u32 {
    id.bytes().fold(2_166_136_261_u32, /* 计算并返回 hash . wrapping_mul (16_777_619) ^ u32 :: from (byte)，用于当前 handle_generation 流程。 */ |hash, byte| {
        hash.wrapping_mul(16_777_619) ^ u32::from(byte)
    })
}

// 构造包含实体身份和生命周期代数的脚本句柄。
fn entity_handle_map(id: &str, generation: Option<u32>) -> Map {
    let mut handle = handle_map(true, "Entity", id, "");
    if let Some(generation) = generation {
        handle.insert(
            "generation".into(),
            Dynamic::from_int(INT::from(generation)),
        );
    }
    handle
}

// 校验句柄映射并取出命令目标身份与代数。
fn target_from_handle(handle: Map) -> Option<(String, u32)> {
    let id = handle.get("id")?.clone().try_cast::<String>()?;
    let generation = handle
        .get("generation")
        .and_then(
            /* 按 value . as_int () . ok () 读取或转换可选值，保留转换失败分支。 */
            |value| value.as_int().ok(),
        )
        .and_then(
            /* 按 u32 :: try_from (value) . ok () 读取或转换可选值，保留转换失败分支。 */
            |value| u32::try_from(value).ok(),
        )?;
    if id.is_empty() {
        None
    } else {
        Some((id, generation))
    }
}

// 按字符边界截断文本，使长度不超过给定上限。
fn bounded_text(value: &str, maximum: usize) -> String {
    value
        .chars()
        .filter(/* 判断 ! character . is_control () || * character == '\n' || * character == '\t' 是否成立，供过滤或有效性检查使用。 */ |character| !character.is_control() || *character == '\n' || *character == '\t')
        .take(maximum)
        .collect()
}

// 仅在允许的编辑器自动化上下文注册受限编辑命令。
fn register_editor_automation_api(engine: &mut Engine, output: Rc<RefCell<HostOutput>>) {
    let enabled = live!(editor_automation);
    engine.register_fn(
        "editor_automation",
        /* 返回当前快照值 enabled。 */ move || *enabled,
    );
    let selection = live!(editor_selection);
    engine.register_fn("editor_selected", /* 仅在自动化启用时读取最多二百五十六个选中实体句柄。 */ move || -> Array {
        if !*enabled {
            return Array::new();
        }
        selection
            .iter()
            .take(256)
            .map(/* 计算并返回 Dynamic :: from_map (handle_map (true , "Entity" , id , ""))，用于当前 register_editor_automation_api 流程。 */ |id| Dynamic::from_map(handle_map(true, "Entity", id, "")))
            .collect()
    });
    let selection = live!(editor_selection);
    engine.register_fn("editor_selected_count", /* 按 if *enabled { INT :: try_from (selection . len ()) . unwrap_or (INT :: MAX) } else { 0 } 读取或转换可选值，保留转换失败分支。 */ move || -> INT {
        if *enabled {
            INT::try_from(selection.len()).unwrap_or(INT::MAX)
        } else {
            0
        }
    });
    let commands = Rc::clone(&output);
    engine.register_fn(
        "editor_select",
        /* 先检查编辑器自动化权限，将“选择编辑器实体”命令加入宿主队列。 */
        move |handle: Map| {
            if !*enabled {
                return false;
            }
            if let Some((target, generation)) = target_from_handle(handle) {
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::EditorSelect { target, generation });
                true
            } else {
                false
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "editor_rename",
        /* 先检查编辑器自动化权限，将“重命名编辑器实体”命令加入宿主队列。 */
        move |handle: Map, name: &str| {
            if !*enabled {
                return false;
            }
            if let Some((target, generation)) = target_from_handle(handle) {
                let name = bounded_text(name.trim(), 120);
                if name.is_empty() {
                    return false;
                }
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::EditorRename {
                        target,
                        generation,
                        name,
                    });
                true
            } else {
                false
            }
        },
    );
    for (function, shape) in [
        ("editor_create_box", "Box"),
        ("editor_create_circle", "Circle"),
        ("editor_create_triangle", "Triangle"),
    ] {
        let commands = Rc::clone(&output);
        let shape = shape.to_owned();
        engine.register_fn(
            function,
            /* 先检查编辑器自动化权限，将“在编辑器创建实体”命令加入宿主队列。 */
            move |name: &str, x: FLOAT, y: FLOAT, width: FLOAT, height: FLOAT| {
                if !*enabled
                    || !x.is_finite()
                    || !y.is_finite()
                    || !width.is_finite()
                    || !height.is_finite()
                    || width.abs() < 0.000_001
                    || height.abs() < 0.000_001
                {
                    return false;
                }
                let name = bounded_text(name.trim(), 120);
                if name.is_empty() {
                    return false;
                }
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::EditorCreateEntity {
                        shape: shape.clone(),
                        name,
                        x,
                        y,
                        width: width.abs().min(1_000_000.0),
                        height: height.abs().min(1_000_000.0),
                    });
                true
            },
        );
    }
    let commands = Rc::clone(&output);
    engine.register_fn(
        "editor_create_text_asset",
        /* 先检查编辑器自动化权限，将“在编辑器创建文本资源”命令加入宿主队列。 */
        move |path: &str, asset_type: &str, source: &str| {
            if !*enabled {
                return false;
            }
            let path = bounded_text(path.trim(), 240);
            let asset_type = bounded_text(asset_type.trim(), 40);
            let source = bounded_text(source, 64_000);
            if path.is_empty() || source.is_empty() {
                return false;
            }
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::EditorCreateTextAsset {
                    path,
                    asset_type,
                    source,
                });
            true
        },
    );
}

// 限制查询结果数量并转换成带生命周期代数的句柄。
fn bounded_query_handles<'a>(
    values: impl Iterator<Item = &'a SceneEntitySnapshot>,
    limit: INT,
) -> Array {
    let maximum = usize::try_from(limit.clamp(0, 256)).unwrap_or(0);
    values
        .take(maximum)
        .map(/* 判断 Dynamic :: from_map (entity_handle_map (& entity . uuid , (entity . generation != 0) . then_some (entity . generation) ,)) 是否成立，供过滤或有效性检查使用。 */ |entity| {
            Dynamic::from_map(entity_handle_map(
                &entity.uuid,
                (entity.generation != 0).then_some(entity.generation),
            ))
        })
        .collect()
}

// 注册时间、帧号和固定步相关只读脚本接口。
fn register_time_api(engine: &mut Engine) {
    let time = live!(time);
    let snapshot = time;
    engine.register_fn(
        "time_delta",
        /* 返回当前快照值 snapshot . delta。 */ move || snapshot.delta,
    );
    let snapshot = time;
    engine.register_fn(
        "time_fixed_delta",
        /* 返回当前快照值 snapshot . fixed_delta。 */ move || snapshot.fixed_delta,
    );
    let snapshot = time;
    engine.register_fn(
        "time_elapsed",
        /* 返回当前快照值 snapshot . elapsed。 */ move || snapshot.elapsed,
    );
    let snapshot = time;
    engine.register_fn(
        "time_scale",
        /* 返回当前快照值 snapshot . scale。 */ move || snapshot.scale,
    );
    engine.register_fn(
        "time_frame",
        /* 返回当前快照值 time . frame as INT。 */ move || time.frame as INT,
    );
    let time = live!(time);
    engine.register_fn(
        "time",
        /* 将当前时间快照字段复制到脚本映射，避免暴露可变宿主引用。 */
        move || {
            let mut map = Map::new();
            map.insert("delta".into(), Dynamic::from_float(time.delta));
            map.insert("fixed_delta".into(), Dynamic::from_float(time.fixed_delta));
            map.insert("elapsed".into(), Dynamic::from_float(time.elapsed));
            map.insert("scale".into(), Dynamic::from_float(time.scale));
            map.insert("frame".into(), Dynamic::from_int(time.frame as INT));
            map
        },
    );
}

// 注册实体快照查询及受控实体访问接口。
fn register_entity_api(engine: &mut Engine) {
    let transform = live!(transform);
    engine.register_fn(
        "transform",
        /* 把实体位置、旋转和缩放快照转换为脚本可读取的映射。 */
        move || {
            let mut map = Map::new();
            map.insert(
                "position_x".into(),
                Dynamic::from_float(transform.position[0]),
            );
            map.insert(
                "position_y".into(),
                Dynamic::from_float(transform.position[1]),
            );
            map.insert("rotation".into(), Dynamic::from_float(transform.rotation));
            map.insert("scale_x".into(), Dynamic::from_float(transform.scale[0]));
            map.insert("scale_y".into(), Dynamic::from_float(transform.scale[1]));
            map
        },
    );
    let world = live_world!();
    engine.register_fn("query_tag", move |tag: &str, limit: INT| {
        bounded_query_handles(
            world
                .borrow()
                .snapshot
                .scene_entities
                .iter()
                .filter(|entity| entity.tags.iter().any(|value| value == tag)),
            limit,
        )
    });
    let world = live_world!();
    engine.register_fn("query_group", move |group: &str, limit: INT| {
        bounded_query_handles(
            world
                .borrow()
                .snapshot
                .scene_entities
                .iter()
                .filter(|entity| entity.groups.iter().any(|value| value == group)),
            limit,
        )
    });
    // 26.43: tag and group tests for an entity id (e.g. `other` in a collision callback) or handle.
    let world = live_world!();
    let scene_entity_matches = move |id: &str, test: &dyn Fn(&SceneEntitySnapshot) -> bool| {
        world
            .borrow()
            .snapshot
            .scene_entities
            .iter()
            .find(|entity| entity.uuid == id)
            .is_some_and(test)
    };
    let matches = scene_entity_matches;
    engine.register_fn("entity_has_tag", move |id: &str, tag: &str| {
        matches(id, &|entity| entity.tags.iter().any(|value| value == tag))
    });
    let matches = scene_entity_matches;
    engine.register_fn("entity_has_tag", move |handle: Map, tag: &str| {
        target_from_handle(handle).is_some_and(|(id, _)| {
            matches(&id, &|entity| entity.tags.iter().any(|value| value == tag))
        })
    });
    let matches = scene_entity_matches;
    engine.register_fn("entity_in_group", move |id: &str, group: &str| {
        matches(id, &|entity| {
            entity.groups.iter().any(|value| value == group)
        })
    });
    let matches = scene_entity_matches;
    engine.register_fn("entity_in_group", move |handle: Map, group: &str| {
        target_from_handle(handle).is_some_and(|(id, _)| {
            matches(&id, &|entity| {
                entity.groups.iter().any(|value| value == group)
            })
        })
    });
    let world = live_world!();
    engine.register_fn("query_component", move |kind: &str, limit: INT| {
        bounded_query_handles(
            world
                .borrow()
                .snapshot
                .scene_entities
                .iter()
                .filter(|entity| entity.components.iter().any(|value| value == kind)),
            limit,
        )
    });
    let world = live_world!();
    engine.register_fn(
        "query_radius",
        move |x: FLOAT, y: FLOAT, radius: FLOAT, limit: INT| {
            if !x.is_finite() || !y.is_finite() || !radius.is_finite() || radius < 0.0 {
                return Array::new();
            }
            let radius_squared = radius.min(1.0e12).powi(2);
            bounded_query_handles(
                world
                    .borrow()
                    .snapshot
                    .scene_entities
                    .iter()
                    .filter(|entity| {
                        let dx = entity.position[0] - x;
                        let dy = entity.position[1] - y;
                        dx * dx + dy * dy <= radius_squared
                    }),
                limit,
            )
        },
    );
    let world = live_world!();
    engine.register_fn("entity_name_on", move |handle: Map| {
        world
            .borrow()
            .entity_from_handle(handle)
            .map(|entity| entity.name.clone())
            .unwrap_or_default()
    });
    let world = live_world!();
    engine.register_fn("entity_enabled_on", move |handle: Map| {
        world
            .borrow()
            .entity_from_handle(handle)
            .map(|entity| entity.enabled)
            .unwrap_or(false)
    });
    let world = live_world!();
    engine.register_fn("entity_position_x_on", move |handle: Map| {
        world
            .borrow()
            .entity_from_handle(handle)
            .map(|entity| entity.position[0])
            .unwrap_or(0.0)
    });
    let world = live_world!();
    engine.register_fn("entity_position_y_on", move |handle: Map| {
        world
            .borrow()
            .entity_from_handle(handle)
            .map(|entity| entity.position[1])
            .unwrap_or(0.0)
    });
    let rigid_body = live!(rigid_body);
    engine.register_fn(
        "rigid_body",
        /* 从可选刚体快照构造有效标志、速度和质量等只读脚本字段。 */
        move || {
            let mut map = Map::new();
            if let Some(body) = &*rigid_body {
                map.insert("valid".into(), Dynamic::from_bool(true));
                map.insert("velocity_x".into(), Dynamic::from_float(body.velocity[0]));
                map.insert("velocity_y".into(), Dynamic::from_float(body.velocity[1]));
                map.insert(
                    "angular_velocity".into(),
                    Dynamic::from_float(body.angular_velocity),
                );
                map.insert("mass".into(), Dynamic::from_float(body.mass));
                map.insert("body_type".into(), Dynamic::from(body.body_type.clone()));
            } else {
                map.insert("valid".into(), Dynamic::from_bool(false));
                map.insert(
                    "error".into(),
                    Dynamic::from("RigidBody2D component not found"),
                );
            }
            map
        },
    );
    let component_entity = live!(entity);
    let components = live!(components);
    engine.register_fn("animator", /* 判断 if components . iter () . any (| kind | kind == "Animator") { format ! ("component://{component_entity}/Animator") } else { String :: new () } 是否成立，供过滤或有效性检查使用。 */ move || {
        if components.iter().any(/* 判断 kind == "Animator" 是否成立，供过滤或有效性检查使用。 */ |kind| kind == "Animator") {
            format!("component://{component_entity}/Animator")
        } else {
            String::new()
        }
    });
    let component_entity = live!(entity);
    let components = live!(components);
    engine.register_fn(
        "animator_handle",
        /* 仅在实体拥有 Animator 时生成有效动画组件句柄。 */
        move || {
            if components.iter().any(
                /* 判断 kind == "Animator" 是否成立，供过滤或有效性检查使用。 */
                |kind| kind == "Animator",
            ) {
                handle_map(
                    true,
                    "Animator",
                    &format!("component://{component_entity}/Animator"),
                    "",
                )
            } else {
                handle_map(false, "Animator", "", "Animator component not found")
            }
        },
    );
    let component_entity = live!(entity);
    let components = live!(components);
    engine.register_fn(
        "audio_source",
        /* 仅在实体拥有音频源组件时返回对应引用字符串，否则返回空串。 */
        move || {
            if components.iter().any(
                /* 判断 kind == "AudioSource" 是否成立，供过滤或有效性检查使用。 */
                |kind| kind == "AudioSource",
            ) {
                format!("component://{component_entity}/AudioSource")
            } else {
                String::new()
            }
        },
    );
    let component_entity = live!(entity);
    let components = live!(components);
    engine.register_fn(
        "audio_source_handle",
        /* 仅在实体拥有 AudioSource 时生成有效音频组件句柄。 */
        move || {
            if components.iter().any(
                /* 判断 kind == "AudioSource" 是否成立，供过滤或有效性检查使用。 */
                |kind| kind == "AudioSource",
            ) {
                handle_map(
                    true,
                    "AudioSource",
                    &format!("component://{component_entity}/AudioSource"),
                    "",
                )
            } else {
                handle_map(false, "AudioSource", "", "AudioSource component not found")
            }
        },
    );
}

// 注册动作、按键、指针和设备输入快照接口。
fn register_input_api(engine: &mut Engine) {
    let input = live!(input);
    let snapshot = input;
    engine.register_fn("input_down", /* 按 snapshot . down . get (action) . copied () . unwrap_or (false) 读取或转换可选值，保留转换失败分支。 */ move |action: &str| {
        snapshot.down.get(action).copied().unwrap_or(false)
    });
    let snapshot = live!(input);
    engine.register_fn("is_down", /* 按 snapshot . down . get (action) . copied () . unwrap_or (false) 读取或转换可选值，保留转换失败分支。 */ move |action: &str| {
        snapshot.down.get(action).copied().unwrap_or(false)
    });
    let snapshot = input;
    engine.register_fn("input_pressed", /* 按 snapshot . pressed . get (action) . copied () . unwrap_or (false) 读取或转换可选值，保留转换失败分支。 */ move |action: &str| {
        snapshot.pressed.get(action).copied().unwrap_or(false)
    });
    let snapshot = live!(input);
    engine.register_fn("was_pressed", /* 按 snapshot . pressed . get (action) . copied () . unwrap_or (false) 读取或转换可选值，保留转换失败分支。 */ move |action: &str| {
        snapshot.pressed.get(action).copied().unwrap_or(false)
    });
    let snapshot = input;
    engine.register_fn("input_released", /* 按 snapshot . released . get (action) . copied () . unwrap_or (false) 读取或转换可选值，保留转换失败分支。 */ move |action: &str| {
        snapshot.released.get(action).copied().unwrap_or(false)
    });
    let snapshot = input;
    engine.register_fn("input_performed", /* 按 snapshot . performed . get (action) . copied () . unwrap_or (false) 读取或转换可选值，保留转换失败分支。 */ move |action: &str| {
        snapshot.performed.get(action).copied().unwrap_or(false)
    });
    let snapshot = input;
    engine.register_fn("input_cancelled", /* 按 snapshot . cancelled . get (action) . copied () . unwrap_or (false) 读取或转换可选值，保留转换失败分支。 */ move |action: &str| {
        snapshot.cancelled.get(action).copied().unwrap_or(false)
    });
    let snapshot = input;
    engine.register_fn("input_phase", /* 按 snapshot . phases . get (action) . cloned () . unwrap_or_else (| | "idle" . into ()) 读取或转换可选值，保留转换失败分支。 */ move |action: &str| {
        snapshot
            .phases
            .get(action)
            .cloned()
            .unwrap_or_else(/* 计算并返回 "idle" . into ()，用于当前 register_input_api 流程。 */ || "idle".into())
    });
    let snapshot = input;
    engine.register_fn("input_duration", /* 按 snapshot . durations . get (action) . copied () . unwrap_or (0.0) 读取或转换可选值，保留转换失败分支。 */ move |action: &str| {
        snapshot.durations.get(action).copied().unwrap_or(0.0)
    });
    let snapshot = input;
    engine.register_fn("input_context_active", /* 判断 snapshot . contexts . iter () . any (| context | context == name) 是否成立，供过滤或有效性检查使用。 */ move |name: &str| {
        snapshot.contexts.iter().any(/* 判断 context == name 是否成立，供过滤或有效性检查使用。 */ |context| context == name)
    });
    let snapshot = input;
    engine.register_fn("input_map_active", /* 判断 snapshot . maps . iter () . any (| map | map == name) 是否成立，供过滤或有效性检查使用。 */ move |name: &str| {
        snapshot.maps.iter().any(/* 判断 map == name 是否成立，供过滤或有效性检查使用。 */ |map| map == name)
    });
    let snapshot = input;
    engine.register_fn(
        "input_prompt",
        /* 26.45: 当前设备上动作的提示符号；未知动作返回空字符串。 */
        move |action: &str| snapshot.prompts.get(action).cloned().unwrap_or_default(),
    );
    let snapshot = input;
    engine.register_fn(
        "input_scheme",
        /* 复制 snapshot . scheme . clone () 的结果，避免向调用方暴露可变宿主引用。 */
        move || snapshot.scheme.clone(),
    );
    let snapshot = live!(input);
    engine.register_fn("was_released", /* 按 snapshot . released . get (action) . copied () . unwrap_or (false) 读取或转换可选值，保留转换失败分支。 */ move |action: &str| {
        snapshot.released.get(action).copied().unwrap_or(false)
    });
    let snapshot = input;
    engine.register_fn("input_axis", /* 按 snapshot . axes . get (action) . copied () . unwrap_or (0.0) 读取或转换可选值，保留转换失败分支。 */ move |action: &str| {
        snapshot.axes.get(action).copied().unwrap_or(0.0)
    });
    let snapshot = live!(input);
    engine.register_fn("axis", /* 按 snapshot . axes . get (action) . copied () . unwrap_or (0.0) 读取或转换可选值，保留转换失败分支。 */ move |action: &str| {
        snapshot.axes.get(action).copied().unwrap_or(0.0)
    });
    let snapshot = input;
    engine.register_fn("input_vector_x", /* 按 snapshot . vectors . get (action) . map_or (0.0 , | value | value [0]) 读取或转换可选值，保留转换失败分支。 */ move |action: &str| {
        snapshot.vectors.get(action).map_or(0.0, /* 返回当前快照值 value [0]。 */ |value| value[0])
    });
    let snapshot = input;
    engine.register_fn("input_vector_y", /* 按 snapshot . vectors . get (action) . map_or (0.0 , | value | value [1]) 读取或转换可选值，保留转换失败分支。 */ move |action: &str| {
        snapshot.vectors.get(action).map_or(0.0, /* 返回当前快照值 value [1]。 */ |value| value[1])
    });
    let snapshot = input;
    engine.register_fn("input_vector", /* 按 vector_map (snapshot . vectors . get (action) . copied () . unwrap_or ([0.0 , 0.0])) 读取或转换可选值，保留转换失败分支。 */ move |action: &str| {
        vector_map(snapshot.vectors.get(action).copied().unwrap_or([0.0, 0.0]))
    });
    let snapshot = live!(input);
    engine.register_fn("vector_x", /* 按 snapshot . vectors . get (action) . map_or (0.0 , | value | value [0]) 读取或转换可选值，保留转换失败分支。 */ move |action: &str| {
        snapshot.vectors.get(action).map_or(0.0, /* 返回当前快照值 value [0]。 */ |value| value[0])
    });
    let snapshot = live!(input);
    engine.register_fn("vector_y", /* 按 snapshot . vectors . get (action) . map_or (0.0 , | value | value [1]) 读取或转换可选值，保留转换失败分支。 */ move |action: &str| {
        snapshot.vectors.get(action).map_or(0.0, /* 返回当前快照值 value [1]。 */ |value| value[1])
    });
    let snapshot = live!(input);
    engine.register_fn("vector", /* 按 vector_map (snapshot . vectors . get (action) . copied () . unwrap_or ([0.0 , 0.0])) 读取或转换可选值，保留转换失败分支。 */ move |action: &str| {
        vector_map(snapshot.vectors.get(action).copied().unwrap_or([0.0, 0.0]))
    });
    let snapshot = input;
    engine.register_fn(
        "mouse_x",
        /* 计算并返回 snapshot . mouse_position [0]，用于当前 register_input_api 流程。 */
        move || snapshot.mouse_position[0],
    );
    let snapshot = input;
    engine.register_fn(
        "mouse_y",
        /* 计算并返回 snapshot . mouse_position [1]，用于当前 register_input_api 流程。 */
        move || snapshot.mouse_position[1],
    );
    let snapshot = input;
    engine.register_fn(
        "mouse_world_x",
        /* 计算并返回 snapshot . mouse_world_position [0]，用于当前 register_input_api 流程。 */
        move || snapshot.mouse_world_position[0],
    );
    let snapshot = input;
    engine.register_fn(
        "mouse_world_y",
        /* 计算并返回 snapshot . mouse_world_position [1]，用于当前 register_input_api 流程。 */
        move || snapshot.mouse_world_position[1],
    );
    let snapshot = input;
    engine.register_fn(
        "view_min_x",
        /* 计算并返回 snapshot . view_bounds [0]，用于当前 register_input_api 流程。 */
        move || snapshot.view_bounds[0],
    );
    let snapshot = input;
    engine.register_fn(
        "view_max_x",
        /* 计算并返回 snapshot . view_bounds [1]，用于当前 register_input_api 流程。 */
        move || snapshot.view_bounds[1],
    );
    let snapshot = input;
    engine.register_fn(
        "view_min_y",
        /* 计算并返回 snapshot . view_bounds [2]，用于当前 register_input_api 流程。 */
        move || snapshot.view_bounds[2],
    );
    let snapshot = input;
    engine.register_fn(
        "view_max_y",
        /* 计算并返回 snapshot . view_bounds [3]，用于当前 register_input_api 流程。 */
        move || snapshot.view_bounds[3],
    );
    let snapshot = input;
    engine.register_fn(
        "viewport_width",
        /* 计算并返回 snapshot . viewport_size [0]，用于当前 register_input_api 流程。 */
        move || snapshot.viewport_size[0],
    );
    let snapshot = input;
    engine.register_fn(
        "viewport_height",
        /* 计算并返回 snapshot . viewport_size [1]，用于当前 register_input_api 流程。 */
        move || snapshot.viewport_size[1],
    );
    let snapshot = input;
    engine.register_fn(
        "wheel_x",
        /* 计算并返回 snapshot . wheel [0]，用于当前 register_input_api 流程。 */
        move || snapshot.wheel[0],
    );
    engine.register_fn(
        "wheel_y",
        /* 计算并返回 input . wheel [1]，用于当前 register_input_api 流程。 */
        move || input.wheel[1],
    );
}

// 把二维数值数组转换成含 x 和 y 字段的脚本映射。
fn vector_map(value: [f64; 2]) -> Map {
    let mut map = Map::new();
    map.insert("x".into(), Dynamic::from_float(value[0]));
    map.insert("y".into(), Dynamic::from_float(value[1]));
    map
}

// 注册当前场景、关卡流程和游戏状态查询接口。
fn register_game_flow_api(engine: &mut Engine) {
    let flow = live!(game_flow);
    engine.register_fn(
        "game_paused",
        /* 返回当前快照值 flow . paused。 */ move || flow.paused,
    );
    let flow = live!(game_flow);
    engine.register_fn(
        "score_get",
        /* 返回当前快照值 flow . score。 */ move || flow.score,
    );
    let flow = live!(game_flow);
    engine.register_fn("checkpoint_has", /* 判断 flow . checkpoints . iter () . any (| checkpoint | checkpoint == name) 是否成立，供过滤或有效性检查使用。 */ move |name: &str| {
        flow.checkpoints.iter().any(/* 判断 checkpoint == name 是否成立，供过滤或有效性检查使用。 */ |checkpoint| checkpoint == name)
    });
    let values = live!(game_flow.session);
    engine.register_fn("session_get", /* 按 values . get (key) . and_then (json_to_dynamic) . unwrap_or (fallback) 读取或转换可选值，保留转换失败分支。 */ move |key: &str, fallback: Dynamic| {
        values
            .get(key)
            .and_then(json_to_dynamic)
            .unwrap_or(fallback)
    });
}

// 26.46: post-processing values, joint servos and explosions (queued commands).
fn register_effects_api(engine: &mut Engine, output: Rc<RefCell<HostOutput>>) {
    let clean_name = |name: &str| bounded_text(name.trim(), 32).to_ascii_lowercase();
    let seconds = |value: FLOAT| {
        if value.is_finite() {
            value.clamp(0.0, 60.0)
        } else {
            0.0
        }
    };
    let commands = Rc::clone(&output);
    let push_set = move |name: &str, value: FLOAT, fade: FLOAT| {
        if !value.is_finite() {
            return;
        }
        commands.borrow_mut().commands.push(ScriptCommand::PostSet {
            name: clean_name(name),
            value,
            seconds: seconds(fade),
        })
    };
    let set = push_set.clone();
    engine.register_fn("post_set", move |name: &str, value: FLOAT| {
        set(name, value, 0.0)
    });
    engine.register_fn("post_set", move |name: &str, value: FLOAT, fade: FLOAT| {
        push_set(name, value, fade)
    });
    let commands = Rc::clone(&output);
    engine.register_fn(
        "post_pulse",
        move |name: &str, amount: FLOAT, fade: FLOAT| {
            if !amount.is_finite() || !fade.is_finite() || fade <= 0.0 {
                return;
            }
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::PostPulse {
                    name: clean_name(name),
                    amount,
                    seconds: fade.min(30.0),
                })
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn("post_reset", move || {
        commands
            .borrow_mut()
            .commands
            .push(ScriptCommand::PostReset)
    });
    let commands = Rc::clone(&output);
    engine.register_fn("joint_servo", move |target: FLOAT| {
        if !target.is_finite() {
            return;
        }
        commands
            .borrow_mut()
            .commands
            .push(ScriptCommand::JointServo {
                enabled: true,
                target,
            })
    });
    let commands = Rc::clone(&output);
    engine.register_fn("joint_servo_off", move || {
        commands
            .borrow_mut()
            .commands
            .push(ScriptCommand::JointServo {
                enabled: false,
                target: 0.0,
            })
    });
    engine.register_fn(
        "explode",
        move |x: FLOAT, y: FLOAT, radius: FLOAT, impulse: FLOAT| {
            if !(x.is_finite() && y.is_finite() && radius.is_finite() && impulse.is_finite())
                || radius <= 0.0
            {
                return;
            }
            output.borrow_mut().commands.push(ScriptCommand::Explode {
                x,
                y,
                radius: radius.min(1.0e4),
                impulse: impulse.clamp(-1.0e7, 1.0e7),
            })
        },
    );
}

// 26.46: rhythm chart state (read from the snapshot) and control (queued commands).
fn register_rhythm_api(engine: &mut Engine, output: Rc<RefCell<HostOutput>>) {
    let rhythm = live!(rhythm);
    engine.register_fn("rhythm_time", move || rhythm.time);
    let rhythm = live!(rhythm);
    engine.register_fn("rhythm_beat", move || rhythm.beat);
    let rhythm = live!(rhythm);
    engine.register_fn("rhythm_bpm", move || rhythm.bpm);
    let rhythm = live!(rhythm);
    engine.register_fn("rhythm_score", move || rhythm.score.round() as INT);
    let rhythm = live!(rhythm);
    engine.register_fn("rhythm_combo", move || rhythm.combo.round() as INT);
    let rhythm = live!(rhythm);
    engine.register_fn("rhythm_max_combo", move || rhythm.max_combo.round() as INT);
    let rhythm = live!(rhythm);
    engine.register_fn("rhythm_accuracy", move || rhythm.accuracy);
    let rhythm = live!(rhythm);
    engine.register_fn("rhythm_progress", move || rhythm.progress);
    let rhythm = live!(rhythm);
    engine.register_fn("rhythm_state", move || {
        if rhythm.state.is_empty() {
            "idle".to_string()
        } else {
            rhythm.state.clone()
        }
    });
    let rhythm = live!(rhythm);
    engine.register_fn("rhythm_judgement", move || rhythm.last_judgement.clone());
    let rhythm = live!(rhythm);
    engine.register_fn("rhythm_playing", move || rhythm.active);
    let rhythm = live!(rhythm);
    engine.register_fn("rhythm_finished", move || rhythm.finished);
    let rhythm = live!(rhythm);
    engine.register_fn("rhythm_full_combo", move || rhythm.full_combo);
    let rhythm = live!(rhythm);
    engine.register_fn("rhythm_calibration", move || rhythm.calibration_ms);
    let rhythm = live!(rhythm);
    engine.register_fn("rhythm_count", move |name: &str| {
        let value = match name.trim().to_ascii_lowercase().as_str() {
            "perfect" => rhythm.perfect,
            "great" => rhythm.great,
            "good" => rhythm.good,
            "bad" => rhythm.bad,
            "miss" => rhythm.miss,
            "early" => rhythm.early,
            "late" => rhythm.late,
            "judged" => rhythm.judged,
            "total" | "notes" => rhythm.total,
            _ => 0.0,
        };
        value.round() as INT
    });
    let rhythm = live!(rhythm);
    engine.register_fn("rhythm_stats", move || {
        let mut map = Map::new();
        for (key, value) in [
            ("score", rhythm.score),
            ("combo", rhythm.combo),
            ("max_combo", rhythm.max_combo),
            ("perfect", rhythm.perfect),
            ("great", rhythm.great),
            ("good", rhythm.good),
            ("bad", rhythm.bad),
            ("miss", rhythm.miss),
            ("early", rhythm.early),
            ("late", rhythm.late),
            ("judged", rhythm.judged),
            ("total", rhythm.total),
        ] {
            map.insert(key.into(), Dynamic::from_int(value.round() as INT));
        }
        map.insert("accuracy".into(), Dynamic::from_float(rhythm.accuracy));
        map.insert(
            "mean_offset_ms".into(),
            Dynamic::from_float(rhythm.mean_offset_ms),
        );
        map.insert("time".into(), Dynamic::from_float(rhythm.time));
        map.insert("length".into(), Dynamic::from_float(rhythm.length));
        map.insert("state".into(), rhythm.state.clone().into());
        map.insert("title".into(), rhythm.title.clone().into());
        map.insert("full_combo".into(), Dynamic::from_bool(rhythm.full_combo));
        map.insert("all_perfect".into(), Dynamic::from_bool(rhythm.all_perfect));
        map
    });
    let judge_output = Rc::clone(&output);
    let push = move |action: &str, value: f64| {
        output.borrow_mut().commands.push(ScriptCommand::Rhythm {
            action: action.into(),
            value: if value.is_finite() { value } else { 0.0 },
        })
    };
    let command = push.clone();
    engine.register_fn("rhythm_play", move || command("play", 0.0));
    let command = push.clone();
    engine.register_fn("rhythm_play", move |start: FLOAT| command("play", start));
    let command = push.clone();
    engine.register_fn("rhythm_pause", move || command("pause", 0.0));
    let command = push.clone();
    engine.register_fn("rhythm_resume", move || command("resume", 0.0));
    let command = push.clone();
    engine.register_fn("rhythm_stop", move || command("stop", 0.0));
    let command = push.clone();
    engine.register_fn("rhythm_restart", move || command("restart", 0.0));
    let command = push.clone();
    engine.register_fn("rhythm_seek", move |seconds: FLOAT| {
        command("seek", seconds)
    });
    let command = push.clone();
    engine.register_fn("rhythm_set_offset", move |milliseconds: FLOAT| {
        command("offset", milliseconds.clamp(-1000.0, 1000.0))
    });
    let command = push.clone();
    engine.register_fn("rhythm_set_autoplay", move |enabled: bool| {
        command("autoplay", if enabled { 1.0 } else { 0.0 })
    });
    let command = push.clone();
    engine.register_fn("rhythm_set_speed", move |speed: FLOAT| {
        command("speed", speed)
    });
    let command = push.clone();
    engine.register_fn("rhythm_set_calibration", move |milliseconds: FLOAT| {
        command("calibration", milliseconds.clamp(-500.0, 500.0))
    });
    engine.register_fn("rhythm_set_visual_offset", move |milliseconds: FLOAT| {
        push("visual", milliseconds.clamp(-500.0, 500.0))
    });
    let rhythm = live!(rhythm);
    engine.register_fn("rhythm_visual_offset", move || rhythm.visual_offset_ms);
    // 26.47: the note an object shows (prefab note types): id, type, beat, time, lane, line, x, data.
    let rhythm = live!(rhythm);
    engine.register_fn("rhythm_my_note", move || {
        rhythm
            .note
            .as_ref()
            .and_then(json_to_dynamic)
            .unwrap_or(Dynamic::UNIT)
    });
    let judge = Rc::clone(&judge_output);
    engine.register_fn("rhythm_judge", move |note: INT, judgement: &str| {
        let name = judgement.trim().to_ascii_lowercase();
        let name = match name.as_str() {
            "perfect" | "great" | "good" | "bad" | "miss" => name,
            _ => "miss".to_string(),
        };
        judge
            .borrow_mut()
            .commands
            .push(ScriptCommand::RhythmJudge {
                note,
                judgement: name,
                offset_ms: 0.0,
            })
    });
    let judge = judge_output;
    engine.register_fn("rhythm_judge", move |note: INT, offset_ms: FLOAT| {
        judge
            .borrow_mut()
            .commands
            .push(ScriptCommand::RhythmJudge {
                note,
                judgement: String::new(),
                offset_ms: if offset_ms.is_finite() {
                    offset_ms.clamp(-10_000.0, 10_000.0)
                } else {
                    10_000.0
                },
            })
    });
}

// 注册受当前上下文约束的网络状态与消息接口。
fn register_network_api(engine: &mut Engine) {
    let network = live!(networking);
    engine.register_fn(
        "network_enabled",
        /* 返回当前快照值 network . enabled。 */ move || network.enabled,
    );
    let network = live!(networking);
    engine.register_fn(
        "network_connected",
        /* 返回当前快照值 network . connected。 */ move || network.connected,
    );
    let network = live!(networking);
    engine.register_fn(
        "network_is_authority",
        /* 返回当前快照值 network . authority。 */ move || network.authority,
    );
    let network = live!(networking);
    engine.register_fn(
        "network_peer_count",
        /* 计算并返回 INT :: from (network . peer_count)，用于当前 register_network_api 流程。 */
        move || INT::from(network.peer_count),
    );
    let network = live!(networking);
    engine.register_fn(
        "network_local_peer",
        /* 复制 network . local_peer_id . clone () 的结果，避免向调用方暴露可变宿主引用。 */
        move || network.local_peer_id.clone(),
    );
    let network = live!(networking);
    engine.register_fn(
        "network_role",
        /* 复制 network . role . clone () 的结果，避免向调用方暴露可变宿主引用。 */
        move || network.role.clone(),
    );
    let network = live!(networking);
    engine.register_fn("network_tick", /* 按 INT :: try_from (network . tick) . unwrap_or (INT :: MAX) 读取或转换可选值，保留转换失败分支。 */ move || {
        INT::try_from(network.tick).unwrap_or(INT::MAX)
    });
}

// 将宿主提供的自定义属性注册为脚本可读取值。
fn register_property_api(engine: &mut Engine) {
    let numbers = live!(properties);
    engine.register_fn("export_value", /* 按 numbers . get (name) . and_then (Value :: as_f64) . unwrap_or (fallback) 读取或转换可选值，保留转换失败分支。 */ move |name: &str, fallback: FLOAT| {
        numbers
            .get(name)
            .and_then(Value::as_f64)
            .unwrap_or(fallback)
    });
    let integers = live!(properties);
    engine.register_fn("export_value", /* 按 integers . get (name) . and_then (Value :: as_i64) . unwrap_or (fallback) 读取或转换可选值，保留转换失败分支。 */ move |name: &str, fallback: INT| {
        integers
            .get(name)
            .and_then(Value::as_i64)
            .unwrap_or(fallback)
    });
    let booleans = live!(properties);
    engine.register_fn("export_value", /* 按 booleans . get (name) . and_then (Value :: as_bool) . unwrap_or (fallback) 读取或转换可选值，保留转换失败分支。 */ move |name: &str, fallback: bool| {
        booleans
            .get(name)
            .and_then(Value::as_bool)
            .unwrap_or(fallback)
    });
    let strings = live!(properties);
    engine.register_fn("export_value", /* 按 strings . get (name) . and_then (Value :: as_str) . unwrap_or (fallback) . to_owned () 读取或转换可选值，保留转换失败分支。 */ move |name: &str, fallback: &str| {
        strings
            .get(name)
            .and_then(Value::as_str)
            .unwrap_or(fallback)
            .to_owned()
    });
    let structured = live!(properties);
    engine.register_fn("export_value", /* 按 structured . get (name) . and_then (json_to_dynamic) . unwrap_or (fallback) 读取或转换可选值，保留转换失败分支。 */ move |name: &str, fallback: Dynamic| {
        structured
            .get(name)
            .and_then(json_to_dynamic)
            .unwrap_or(fallback)
    });
}

// 注册存档读取及排队写入命令，保持沙箱内的数据边界。
fn register_save_api(engine: &mut Engine, output: Rc<RefCell<HostOutput>>) {
    let values = live!(save);
    engine.register_fn(
        "save_has",
        /* 判断 values . contains_key (key) 是否成立，供过滤或有效性检查使用。 */
        move |key: &str| values.contains_key(key),
    );

    let values = live!(save);
    engine.register_fn("save_get", /* 按 values . get (key) . and_then (json_to_dynamic) . unwrap_or (fallback) 读取或转换可选值，保留转换失败分支。 */ move |key: &str, fallback: Dynamic| {
        values
            .get(key)
            .and_then(json_to_dynamic)
            .unwrap_or(fallback)
    });

    let commands = Rc::clone(&output);
    engine.register_fn(
        "save_set",
        /* 先转换可序列化数据，将“设置存档键值”命令加入宿主队列，并限制相关文本长度。 */
        move |key: &str, value: Dynamic| {
            let key = key.trim().chars().take(80).collect::<String>();
            let Some(value) = dynamic_to_json(value) else {
                commands.borrow_mut().logs.push(ScriptLog {
                    level: "error".into(),
                    message: "Save.set received an unsupported value".into(),
                });
                return;
            };
            if key.is_empty() {
                commands.borrow_mut().logs.push(ScriptLog {
                    level: "error".into(),
                    message: "Save.set requires a non-empty key".into(),
                });
                return;
            }
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::SaveSet { key, value });
        },
    );

    let commands = Rc::clone(&output);
    engine.register_fn(
        "save_delete",
        /* 将“删除存档键值”命令加入宿主队列，并限制相关文本长度。 */
        move |key: &str| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::SaveDelete {
                    key: key.trim().chars().take(80).collect(),
                });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "save_clear",
        /* 将“清空存档”命令加入宿主队列。 */
        move || {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::SaveClear);
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "save_load",
        /* 将“加载存档槽”命令加入宿主队列，并限制相关文本长度。 */
        move |slot: &str| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::SaveLoad {
                    slot: slot.trim().chars().take(80).collect(),
                });
        },
    );
    engine.register_fn(
        "save_commit",
        /* 将“提交存档槽”命令加入宿主队列，并限制相关文本长度。 */
        move |slot: &str| {
            output
                .borrow_mut()
                .commands
                .push(ScriptCommand::SaveCommit {
                    slot: slot.trim().chars().take(80).collect(),
                });
        },
    );
}

// 注册修改游戏状态的宿主命令；脚本只产生有界命令，不直接访问编辑器。
/// Lifecycle and event callbacks are run by the runtime itself; `call_on` may not invoke them.
/// (`call` itself is Rhai's function-pointer keyword, hence the `call_on` name.)
const RESERVED_CALL_TARGETS: [&str; 15] = [
    "awake",
    "start",
    "update",
    "fixed_update",
    "late_update",
    "on_destroy",
    "on_timer",
    "on_task",
    "on_signal",
    "on_collision_enter",
    "on_collision_stay",
    "on_collision_exit",
    "on_trigger_enter",
    "on_trigger_stay",
    "on_trigger_exit",
];

/// A callable script function name: an identifier of at most 80 characters, not a lifecycle callback.
fn callable_function_name(name: &str) -> Option<String> {
    let mut characters = name.chars();
    let first = characters.next()?;
    let valid = (first.is_ascii_alphabetic() || first == '_')
        && characters.all(|character| character.is_ascii_alphanumeric() || character == '_')
        && name.len() <= 80
        && !RESERVED_CALL_TARGETS.contains(&name);
    valid.then(|| name.to_owned())
}

/// Reads an option from a Rhai map: floats and integers are both accepted.
fn option_float(options: &Map, key: &str, fallback: f64) -> f64 {
    options
        .get(key)
        .and_then(|value| {
            value
                .as_float()
                .ok()
                .or_else(|| value.as_int().ok().map(|value| value as f64))
        })
        .filter(|value| value.is_finite())
        .unwrap_or(fallback)
}

fn option_bool(options: &Map, key: &str, fallback: bool) -> bool {
    options
        .get(key)
        .and_then(|value| value.as_bool().ok())
        .unwrap_or(fallback)
}

fn option_text(options: &Map, key: &str, fallback: &str, maximum: usize) -> String {
    options
        .get(key)
        .and_then(|value| value.clone().into_immutable_string().ok())
        .map(|value| bounded_text(value.trim(), maximum))
        .unwrap_or_else(|| fallback.to_owned())
}

// 26.43 脚本间调用与音视频 API：所有操作都作为宿主命令排队，在回调边界由运行时执行。
// Every registration keeps an inline typed closure: the API inventory generator reads the
// parameter names and types from these closures.
fn register_link_and_media_api(engine: &mut Engine, output: Rc<RefCell<HostOutput>>) {
    let report = |output: &Rc<RefCell<HostOutput>>, message: String| {
        let mut output = output.borrow_mut();
        if output.logs.len() < MAX_SCRIPT_LOGS {
            output.logs.push(ScriptLog {
                level: "error".into(),
                message,
            });
        }
    };
    let arguments = |args: Array| dynamic_to_json(Dynamic::from_array(args));

    // call_on(handle | entity id, function[, args]): runs `function(args...)` on that entity's
    // script after the current callback phase. Handles keep their generation; a plain id
    // (for example `other` in a collision callback) uses the entity's current generation.
    let commands = Rc::clone(&output);
    let push_call = move |target: Option<(String, u32)>, function: &str, args: Array| {
        let Some(function) = callable_function_name(function) else {
            report(&commands, format!("call_on: \u{201c}{function}\u{201d} is not a callable function name (lifecycle callbacks run on their own)"));
            return;
        };
        let Some((target, generation)) = target else {
            report(
                &commands,
                format!("call_on {function}: the target entity is not valid"),
            );
            return;
        };
        let Some(args) = arguments(args) else {
            report(
                &commands,
                format!("call_on {function}: arguments must be serializable values"),
            );
            return;
        };
        commands
            .borrow_mut()
            .commands
            .push(ScriptCommand::CallFunction {
                target,
                generation,
                function,
                args,
            });
    };
    let world = live_world!();
    let current_generation = move |id: &str| {
        world
            .borrow()
            .snapshot
            .entity_generations
            .get(id)
            .map(|generation| (id.to_owned(), *generation))
    };
    let call = push_call.clone();
    engine.register_fn("call_on", move |handle: Map, function: &str| {
        call(target_from_handle(handle), function, Array::new())
    });
    let call = push_call.clone();
    engine.register_fn(
        "call_on",
        move |handle: Map, function: &str, args: Array| {
            call(target_from_handle(handle), function, args)
        },
    );
    let call = push_call.clone();
    engine.register_fn("call_on", move |id: &str, function: &str| {
        call(current_generation(id), function, Array::new())
    });
    engine.register_fn("call_on", move |id: &str, function: &str, args: Array| {
        push_call(current_generation(id), function, args)
    });

    // call_global(name, function[, args]): calls a project global script (Project Settings >
    // Scripting > Global scripts) by its name.
    let commands = Rc::clone(&output);
    let push_global = move |name: &str, function: &str, args: Array| {
        let name = bounded_text(name.trim(), 80);
        match (callable_function_name(function), arguments(args)) {
            (Some(function), Some(args)) if !name.is_empty() => {
                commands.borrow_mut().commands.push(ScriptCommand::CallGlobal {
                    name,
                    function,
                    args,
                })
            }
            _ => report(&commands, format!("call_global: needs a global script name, a callable function and serializable arguments (\u{201c}{name}\u{201d}.{function})")),
        }
    };
    let call = push_global.clone();
    engine.register_fn("call_global", move |name: &str, function: &str| {
        call(name, function, Array::new())
    });
    engine.register_fn(
        "call_global",
        move |name: &str, function: &str, args: Array| push_global(name, function, args),
    );

    // call_group(group, function[, args]): calls the function on every entity in a group.
    let commands = Rc::clone(&output);
    let push_group = move |group: &str, function: &str, args: Array| {
        let group = bounded_text(group.trim(), 80);
        match (callable_function_name(function), arguments(args)) {
            (Some(function), Some(args)) if !group.is_empty() => {
                commands.borrow_mut().commands.push(ScriptCommand::CallGroup {
                    group,
                    function,
                    args,
                })
            }
            _ => report(&commands, format!("call_group: needs a group, a callable function and serializable arguments (\u{201c}{group}\u{201d}.{function})")),
        }
    };
    let call = push_group.clone();
    engine.register_fn("call_group", move |group: &str, function: &str| {
        call(group, function, Array::new())
    });
    engine.register_fn(
        "call_group",
        move |group: &str, function: &str, args: Array| push_group(group, function, args),
    );

    // after(seconds, function[, args]): calls one of this script's functions later (game time).
    let commands = Rc::clone(&output);
    let push_later = move |seconds: FLOAT, function: &str, args: Array| {
        match (callable_function_name(function), arguments(args)) {
            (Some(function), Some(args)) if seconds.is_finite() && seconds >= 0.0 => {
                commands.borrow_mut().commands.push(ScriptCommand::CallLater {
                    function,
                    seconds,
                    args,
                })
            }
            _ => report(&commands, format!("after: needs a finite non-negative delay, a callable function and serializable arguments ({function})")),
        }
    };
    let call = push_later.clone();
    engine.register_fn("after", move |seconds: FLOAT, function: &str| {
        call(seconds, function, Array::new())
    });
    let call = push_later.clone();
    engine.register_fn("after", move |seconds: INT, function: &str| {
        call(seconds as FLOAT, function, Array::new())
    });
    engine.register_fn(
        "after",
        move |seconds: FLOAT, function: &str, args: Array| push_later(seconds, function, args),
    );

    // Audio: one-shot or looping sounds on a mixer bus, background music with crossfades,
    // runtime bus volume. Asset references are paths ("Assets/Audio/hit.wav") or asset URIs.
    let commands = Rc::clone(&output);
    let push_sound = move |asset: &str, options: Map| {
        let asset = bounded_text(asset.trim(), 512);
        if asset.is_empty() {
            report(&commands, "play_sound needs an audio asset".into());
            return;
        }
        let volume = option_float(&options, "volume", 1.0).clamp(0.0, 4.0);
        let pitch = option_float(&options, "pitch", 1.0).clamp(0.25, 4.0);
        commands
            .borrow_mut()
            .commands
            .push(ScriptCommand::PlaySound {
                asset,
                bus: option_text(&options, "bus", "SFX", 80),
                volume,
                pitch,
                looped: option_bool(&options, "looped", option_bool(&options, "loop", false)),
                tag: option_text(&options, "tag", "", 80),
            });
    };
    let sound = push_sound.clone();
    engine.register_fn("play_sound", move |asset: &str| sound(asset, Map::new()));
    engine.register_fn("play_sound", move |asset: &str, options: Map| {
        push_sound(asset, options)
    });
    let commands = Rc::clone(&output);
    let push_stop = move |tag: &str, fade: FLOAT| {
        commands
            .borrow_mut()
            .commands
            .push(ScriptCommand::StopSounds {
                tag: bounded_text(tag.trim(), 80),
                fade: if fade.is_finite() {
                    fade.clamp(0.0, 30.0)
                } else {
                    0.0
                },
            })
    };
    let stop = push_stop.clone();
    engine.register_fn("stop_sounds", move |tag: &str| stop(tag, 0.0));
    engine.register_fn("stop_sounds", move |tag: &str, fade: FLOAT| {
        push_stop(tag, fade)
    });
    let commands = Rc::clone(&output);
    let push_music = move |asset: &str, fade: FLOAT, volume: FLOAT| {
        let asset = bounded_text(asset.trim(), 512);
        if asset.is_empty() {
            report(&commands, "play_music needs an audio asset".into());
            return;
        }
        commands
            .borrow_mut()
            .commands
            .push(ScriptCommand::PlayMusic {
                asset,
                fade: if fade.is_finite() {
                    fade.clamp(0.0, 30.0)
                } else {
                    0.0
                },
                volume: if volume.is_finite() {
                    volume.clamp(0.0, 4.0)
                } else {
                    1.0
                },
            })
    };
    let music = push_music.clone();
    engine.register_fn("play_music", move |asset: &str| music(asset, 0.5, 1.0));
    let music = push_music.clone();
    engine.register_fn("play_music", move |asset: &str, fade: FLOAT| {
        music(asset, fade, 1.0)
    });
    engine.register_fn(
        "play_music",
        move |asset: &str, fade: FLOAT, volume: FLOAT| push_music(asset, fade, volume),
    );
    let commands = Rc::clone(&output);
    let push_stop_music = move |fade: FLOAT| {
        commands
            .borrow_mut()
            .commands
            .push(ScriptCommand::StopMusic {
                fade: if fade.is_finite() {
                    fade.clamp(0.0, 30.0)
                } else {
                    0.0
                },
            })
    };
    let stop = push_stop_music.clone();
    engine.register_fn("stop_music", move || stop(0.5));
    engine.register_fn("stop_music", move |fade: FLOAT| push_stop_music(fade));
    let commands = Rc::clone(&output);
    engine.register_fn("set_bus_volume", move |bus: &str, volume: FLOAT| {
        let bus = bounded_text(bus.trim(), 80);
        if bus.is_empty() || !volume.is_finite() {
            report(
                &commands,
                "set_bus_volume needs a bus name and a finite volume".into(),
            );
            return;
        }
        commands
            .borrow_mut()
            .commands
            .push(ScriptCommand::SetBusVolume {
                bus,
                volume: volume.clamp(0.0, 4.0),
            })
    });

    // Video: a full-screen video over the game view (cutscenes, intros). When it ends or is
    // skipped the runtime emits the signal "video.finished" with #{ asset, reason }.
    let commands = Rc::clone(&output);
    let push_video = move |asset: &str, options: Map| {
        let asset = bounded_text(asset.trim(), 512);
        if asset.is_empty() {
            report(&commands, "play_video needs a video asset".into());
            return;
        }
        commands
            .borrow_mut()
            .commands
            .push(ScriptCommand::PlayVideo {
                asset,
                skippable: option_bool(&options, "skippable", true),
                volume: option_float(&options, "volume", 1.0).clamp(0.0, 1.0),
                looped: option_bool(&options, "looped", option_bool(&options, "loop", false)),
            })
    };
    let video = push_video.clone();
    engine.register_fn("play_video", move |asset: &str| video(asset, Map::new()));
    engine.register_fn("play_video", move |asset: &str, options: Map| {
        push_video(asset, options)
    });
    engine.register_fn("stop_video", move || {
        output.borrow_mut().commands.push(ScriptCommand::StopVideo)
    });
}

fn register_command_api(
    engine: &mut Engine,
    output: Rc<RefCell<HostOutput>>,
    states: &HostCallStates,
) {
    let traces = Rc::clone(&output);
    let trace_clock = Rc::clone(&states.trace_clock);
    engine.register_fn(
        "__nova_graph_trace",
        /* 先转换可序列化数据，将“记录可视图节点执行追踪”命令加入宿主队列，并限制相关文本长度。 */
        move |graph_uuid: &str,
              scope_uuid: &str,
              node_uuid: &str,
              edge_uuid: &str,
              depth: INT,
              values: Dynamic| {
            let now = Instant::now();
            let duration_micros = now
                .duration_since(*trace_clock.borrow())
                .as_micros()
                .min(u128::from(u64::MAX)) as u64;
            *trace_clock.borrow_mut() = now;
            traces
                .borrow_mut()
                .commands
                .push(ScriptCommand::GraphTrace {
                    graph_uuid: graph_uuid.chars().take(128).collect(),
                    scope_uuid: scope_uuid.chars().take(128).collect(),
                    node_uuid: node_uuid.chars().take(128).collect(),
                    edge_uuid: edge_uuid.chars().take(128).collect(),
                    depth: depth.clamp(0, 32),
                    duration_micros,
                    values: dynamic_to_json(values).unwrap_or(Value::Null),
                });
        },
    );
    for (name, level) in [
        ("log_debug", "debug"),
        ("log_info", "info"),
        ("log_warning", "warning"),
        ("log_error", "error"),
    ] {
        let logs = Rc::clone(&output);
        engine.register_fn(name, /* 计算并返回 logs . borrow_mut () . logs . push (ScriptLog { level : level . into () , message : message . chars () . take (4_096) . collect () , }) ;，用于当前 register_command_api 流程。 */ move |message: &str| {
            logs.borrow_mut().logs.push(ScriptLog {
                level: level.into(),
                message: message.chars().take(4_096).collect(),
            });
        });
    }
    let assertions = Rc::clone(&output);
    engine.register_fn(
        "expect",
        /* 断言条件失败时输出截断后的错误日志，并返回条件值。 */
        move |condition: bool, message: &str| {
            if !condition {
                assertions.borrow_mut().logs.push(ScriptLog {
                    level: "error".into(),
                    message: format!(
                        "Expectation failed: {}",
                        message.chars().take(512).collect::<String>()
                    ),
                });
            }
            condition
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "apply_force",
        /* 将“施加力”命令加入宿主队列。 */
        move |x: FLOAT, y: FLOAT| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::ApplyForce { x, y });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "apply_impulse",
        /* 将“施加冲量”命令加入宿主队列。 */
        move |x: FLOAT, y: FLOAT| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::ApplyImpulse { x, y });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "set_velocity",
        /* 将“设置线速度”命令加入宿主队列。 */
        move |x: FLOAT, y: FLOAT| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::SetVelocity { x, y });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "set_position",
        /* 将“设置位置”命令加入宿主队列。 */
        move |x: FLOAT, y: FLOAT| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::SetPosition { x, y });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "set_rotation",
        /* 将“设置旋转”命令加入宿主队列。 */
        move |radians: FLOAT| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::SetRotation { radians });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "set_scale",
        /* 将“设置缩放”命令加入宿主队列。 */
        move |x: FLOAT, y: FLOAT| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::SetScale { x, y });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "set_angular_velocity",
        /* 将“设置角速度”命令加入宿主队列。 */
        move |radians_per_second: FLOAT| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::SetAngularVelocity { radians_per_second });
        },
    );

    let character = live_with!(|context| context
        .character
        .as_ref()
        .unwrap_or_else(|| fallback_context().character_default()));
    let snapshot = character;
    engine.register_fn(
        "character_is_on_floor",
        /* 返回当前快照值 snapshot . on_floor。 */ move || snapshot.on_floor,
    );
    let snapshot = character;
    engine.register_fn(
        "character_is_on_wall",
        /* 返回当前快照值 snapshot . on_wall。 */ move || snapshot.on_wall,
    );
    let snapshot = character;
    engine.register_fn(
        "character_is_on_ceiling",
        /* 返回当前快照值 snapshot . on_ceiling。 */ move || snapshot.on_ceiling,
    );
    let snapshot = character;
    engine.register_fn(
        "character_can_coyote_jump",
        /* 返回当前快照值 snapshot . can_coyote_jump。 */
        move || snapshot.can_coyote_jump,
    );
    let snapshot = character;
    engine.register_fn(
        "can_coyote_jump",
        /* 返回当前快照值 snapshot . can_coyote_jump。 */
        move || snapshot.can_coyote_jump,
    );
    let snapshot = character;
    engine.register_fn(
        "character_floor_normal_x",
        /* 计算并返回 snapshot . floor_normal [0]，用于当前 register_command_api 流程。 */
        move || snapshot.floor_normal[0],
    );
    let snapshot = character;
    engine.register_fn(
        "character_floor_normal_y",
        /* 计算并返回 snapshot . floor_normal [1]，用于当前 register_command_api 流程。 */
        move || snapshot.floor_normal[1],
    );
    let snapshot = character;
    engine.register_fn(
        "character_floor_normal",
        /* 计算并返回 vector_map (snapshot . floor_normal)，用于当前 register_command_api 流程。 */
        move || vector_map(snapshot.floor_normal),
    );
    let snapshot = character;
    engine.register_fn(
        "character_platform_velocity_x",
        /* 计算并返回 snapshot . platform_velocity [0]，用于当前 register_command_api 流程。 */
        move || snapshot.platform_velocity[0],
    );
    let snapshot = character;
    engine.register_fn("character_platform_velocity", /* 计算并返回 vector_map (snapshot . platform_velocity)，用于当前 register_command_api 流程。 */ move || {
        vector_map(snapshot.platform_velocity)
    });
    engine.register_fn(
        "character_platform_velocity_y",
        /* 计算并返回 character . platform_velocity [1]，用于当前 register_command_api 流程。 */
        move || character.platform_velocity[1],
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "move_character",
        /* 将“移动角色”命令加入宿主队列。 */
        move |x: FLOAT, y: FLOAT| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::MoveCharacter { x, y });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "animator_set_bool",
        /* 将“设置动画布尔参数”命令加入宿主队列，并限制相关文本长度。 */
        move |name: &str, value: bool| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::AnimatorSetBool {
                    name: name.chars().take(80).collect(),
                    value,
                });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "animator_set_float",
        /* 将“设置动画浮点参数”命令加入宿主队列，并限制相关文本长度。 */
        move |name: &str, value: FLOAT| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::AnimatorSetFloat {
                    name: name.chars().take(80).collect(),
                    value,
                });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "animator_set_integer",
        /* 将“设置动画整数参数”命令加入宿主队列，并限制相关文本长度。 */
        move |name: &str, value: INT| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::AnimatorSetInteger {
                    name: name.chars().take(80).collect(),
                    value,
                });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "animator_trigger",
        /* 将“触发动画参数”命令加入宿主队列，并限制相关文本长度。 */
        move |name: &str| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::AnimatorTrigger {
                    name: name.chars().take(80).collect(),
                });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "animator_play",
        /* 将“播放动画状态”命令加入宿主队列，并限制相关文本长度。 */
        move |state: &str| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::AnimatorPlay {
                    state: state.chars().take(80).collect(),
                });
        },
    );
    // 26.44: crossfade, Animator state reads, tweens and one-way drop-through.
    let commands = Rc::clone(&output);
    engine.register_fn(
        "animator_crossfade",
        /* 将“混合过渡到动画状态”命令加入宿主队列。 */
        move |state: &str, seconds: FLOAT| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::AnimatorCrossfade {
                    state: state.chars().take(80).collect(),
                    seconds: if seconds.is_finite() {
                        seconds.clamp(0.0, 60.0)
                    } else {
                        0.0
                    },
                });
        },
    );
    let animator = live_with!(|context| context
        .animator
        .as_ref()
        .unwrap_or_else(|| fallback_context().animator_default()));
    let snapshot = animator;
    engine.register_fn(
        "animator_state",
        /* 当前（基础层）动画状态名。 */ move || snapshot.state.clone(),
    );
    let snapshot = animator;
    engine.register_fn(
        "animator_state_time",
        /* 当前状态的归一化时间（循环时可超过 1）。 */
        move || snapshot.normalized_time,
    );
    let snapshot = animator;
    engine.register_fn(
        "animator_in_transition",
        /* 是否正在两个状态间过渡。 */ move || snapshot.in_transition,
    );
    let snapshot = character;
    engine.register_fn(
        "character_floor_is_one_way",
        /* 脚下是否为单向平台。 */ move || snapshot.floor_one_way,
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "target_joint_move",
        /* 26.45: 把本物体的目标关节移到世界点（没有时添加一个）。 */
        move |x: FLOAT, y: FLOAT| {
            if x.is_finite() && y.is_finite() {
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::TargetJointMove { x, y });
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "target_joint_release",
        /* 26.45: 松开本物体的目标关节。 */
        move || {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::TargetJointRelease);
        },
    );
    // 26.45: `input_rebind(action)` / `input_rebind(action, index)`: the next key, mouse button or
    // gamepad button pressed becomes the action's binding.
    let push_rebind = {
        let commands = Rc::clone(&output);
        Rc::new(move |action: &str, index: INT| {
            let action: String = action.trim().chars().take(120).collect();
            if action.is_empty() {
                commands.borrow_mut().logs.push(ScriptLog {
                    level: "error".into(),
                    message: "input_rebind requires an action name".into(),
                });
                return;
            }
            let index = u32::try_from(index.clamp(0, 31)).unwrap_or(0);
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::InputRebind { action, index });
        })
    };
    let rebind = Rc::clone(&push_rebind);
    engine.register_fn("input_rebind", move |action: &str| rebind(action, 0));
    let rebind = Rc::clone(&push_rebind);
    engine.register_fn("input_rebind", move |action: &str, index: INT| {
        rebind(action, index)
    });
    // 26.45: camera and screen effects.
    let commands = Rc::clone(&output);
    engine.register_fn("camera_shake", move |amount: FLOAT| {
        let amount = if amount.is_finite() {
            amount.clamp(0.0, 1.0)
        } else {
            0.0
        };
        commands
            .borrow_mut()
            .commands
            .push(ScriptCommand::CameraShake { amount });
    });
    let commands = Rc::clone(&output);
    engine.register_fn("camera_zoom", move |zoom: FLOAT| {
        if zoom.is_finite() && zoom > 0.0 {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::CameraZoom {
                    zoom: zoom.clamp(0.01, 100.0),
                });
        }
    });
    let commands = Rc::clone(&output);
    engine.register_fn("camera_follow", move |handle: Map| {
        if let Some((target, generation)) = target_from_handle(handle) {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::CameraFollow { target, generation });
        }
    });
    let commands = Rc::clone(&output);
    engine.register_fn("camera_follow_none", move || {
        commands
            .borrow_mut()
            .commands
            .push(ScriptCommand::CameraFollow {
                target: String::new(),
                generation: 0,
            });
    });
    let commands = Rc::clone(&output);
    engine.register_fn(
        "screen_flash",
        move |r: FLOAT, g: FLOAT, b: FLOAT, seconds: FLOAT| {
            let channel = |value: FLOAT| {
                if value.is_finite() {
                    value.clamp(0.0, 255.0)
                } else {
                    255.0
                }
            };
            let seconds = if seconds.is_finite() {
                seconds.clamp(0.0, 10.0)
            } else {
                0.0
            };
            if seconds > 0.0 {
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::ScreenFlash {
                        r: channel(r),
                        g: channel(g),
                        b: channel(b),
                        seconds,
                    });
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "input_bindings_reset",
        /* 26.45: 恢复项目的按键绑定。 */
        move || {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::InputBindingsReset);
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "set_surface_speed",
        /* 26.45: 设置本物体碰撞表面的传送带速度（m/s）。 */
        move |speed: FLOAT| {
            let speed = if speed.is_finite() {
                speed.clamp(-1.0e4, 1.0e4)
            } else {
                0.0
            };
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::SetSurfaceSpeed { speed });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "character_drop_through",
        /* 让角色在 0.25 秒内穿过单向平台。 */
        move || {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::CharacterDropThrough { seconds: 0.25 });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "character_drop_through",
        /* 让角色在给定秒数内穿过单向平台。 */
        move |seconds: FLOAT| {
            let seconds = if seconds.is_finite() {
                seconds.clamp(0.0, 10.0)
            } else {
                0.25
            };
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::CharacterDropThrough { seconds });
        },
    );
    let tween_command = /* 构造补间命令；选项映射可含 delay、loops、yoyo、relative、signal。 */ |target: String, generation: u32, property: &str, to: FLOAT, seconds: FLOAT, easing: &str, options: Option<&Map>| {
        let number = |key: &str, fallback: f64| options.and_then(|map| map.get(key)).and_then(|value| value.as_float().ok().or_else(|| value.as_int().ok().map(|value| value as f64))).filter(|value| value.is_finite()).unwrap_or(fallback);
        let flag = |key: &str| options.and_then(|map| map.get(key)).and_then(|value| value.as_bool().ok()).unwrap_or(false);
        let signal = options.and_then(|map| map.get("signal")).and_then(|value| value.clone().try_cast::<String>()).unwrap_or_default();
        ScriptCommand::Tween {
            target,
            generation,
            property: property.chars().take(80).collect(),
            to: if to.is_finite() { to } else { 0.0 },
            seconds: if seconds.is_finite() { seconds.clamp(0.0, 3600.0) } else { 0.0 },
            easing: easing.chars().take(40).collect(),
            delay: number("delay", 0.0).clamp(0.0, 3600.0),
            loops: number("loops", 0.0).clamp(-1.0, 1_000_000.0) as i64,
            yoyo: flag("yoyo"),
            relative: flag("relative"),
            signal: signal.chars().take(80).collect(),
        }
    };
    let commands = Rc::clone(&output);
    engine.register_fn(
        "tween",
        /* 线性补间本对象的属性。 */
        move |property: &str, to: FLOAT, seconds: FLOAT| {
            commands.borrow_mut().commands.push(tween_command(
                String::new(),
                0,
                property,
                to,
                seconds,
                "linear",
                None,
            ));
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "tween",
        /* 用给定缓动补间本对象的属性。 */
        move |property: &str, to: FLOAT, seconds: FLOAT, easing: &str| {
            commands.borrow_mut().commands.push(tween_command(
                String::new(),
                0,
                property,
                to,
                seconds,
                easing,
                None,
            ));
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "tween",
        /* 用缓动和选项（delay、loops、yoyo、relative、signal）补间本对象的属性。 */
        move |property: &str, to: FLOAT, seconds: FLOAT, easing: &str, options: Map| {
            commands.borrow_mut().commands.push(tween_command(
                String::new(),
                0,
                property,
                to,
                seconds,
                easing,
                Some(&options),
            ));
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "entity_tween",
        /* 补间另一个对象（句柄）的属性。 */
        move |handle: Map, property: &str, to: FLOAT, seconds: FLOAT, easing: &str| {
            if let Some((target, generation)) = target_from_handle(handle) {
                commands.borrow_mut().commands.push(tween_command(
                    target, generation, property, to, seconds, easing, None,
                ));
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "tween_stop",
        /* 停止本对象的全部补间。 */
        move || {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::TweenStop {
                    target: String::new(),
                    generation: 0,
                    property: String::new(),
                });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "tween_stop",
        /* 停止本对象某个属性的补间。 */
        move |property: &str| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::TweenStop {
                    target: String::new(),
                    generation: 0,
                    property: property.chars().take(80).collect(),
                });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "entity_tween_stop",
        /* 停止另一个对象（句柄）的全部补间。 */
        move |handle: Map| {
            if let Some((target, generation)) = target_from_handle(handle) {
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::TweenStop {
                        target,
                        generation,
                        property: String::new(),
                    });
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "audio_play",
        /* 将“播放音频”命令加入宿主队列。 */
        move || {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::AudioPlay)
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "audio_pause",
        /* 将“暂停音频”命令加入宿主队列。 */
        move || {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::AudioPause)
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "audio_stop",
        /* 将“停止音频”命令加入宿主队列。 */
        move || {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::AudioStop)
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "ui_set_text",
        /* 将“设置界面文本”命令加入宿主队列，并限制相关文本长度。 */
        move |text: &str| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::UiSetText {
                    text: text.chars().take(16_384).collect(),
                });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "ui_set_value",
        /* 先检查数值有限性，将“设置界面数值”命令加入宿主队列。 */
        move |value: FLOAT| {
            if value.is_finite() {
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::UiSetValue { value });
            } else {
                commands.borrow_mut().logs.push(ScriptLog {
                    level: "error".into(),
                    message: "ui_set_value rejected a non-finite value".into(),
                });
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "navigation_set_target",
        /* 先检查数值有限性，将“设置导航目标”命令加入宿主队列。 */
        move |x: FLOAT, y: FLOAT| {
            if x.is_finite() && y.is_finite() {
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::NavigationSetTarget { x, y });
            } else {
                commands.borrow_mut().logs.push(ScriptLog {
                    level: "error".into(),
                    message: "navigation_set_target rejected a non-finite target".into(),
                });
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "destroy",
        /* 将“销毁当前实体”命令加入宿主队列。 */
        move || commands.borrow_mut().commands.push(ScriptCommand::Destroy),
    );

    let commands = Rc::clone(&output);
    engine.register_fn(
        "despawn",
        /* 将“回收当前实体”命令加入宿主队列。 */
        move || commands.borrow_mut().commands.push(ScriptCommand::Despawn),
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "instantiate",
        /* 将“实例化预制体”命令加入宿主队列，并限制相关文本长度。 */
        move |prefab: &str| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::Instantiate {
                    prefab: prefab.chars().take(512).collect(),
                });
        },
    );
    let commands = Rc::clone(&output);
    let pending_serial = Rc::clone(&states.pending_serial);
    let source_entity = live!(entity);
    let invocation_id = live!(invocation_id);
    engine.register_fn(
        "spawn_at",
        /* 先检查数值有限性，将“按位置实例化预制体”命令加入宿主队列，并限制相关文本长度。 */
        move |prefab: &str, x: FLOAT, y: FLOAT, rotation: FLOAT, scale_x: FLOAT, scale_y: FLOAT| {
            let prefab = prefab.trim().chars().take(512).collect::<String>();
            if prefab.is_empty()
                || ![x, y, rotation, scale_x, scale_y].iter().all(
                    /* 判断 value . is_finite () 是否成立，供过滤或有效性检查使用。 */
                    |value| value.is_finite(),
                )
                || scale_x.abs() < 1.0e-9
                || scale_y.abs() < 1.0e-9
            {
                commands.borrow_mut().logs.push(ScriptLog {
                    level: "error".into(),
                    message: "spawn_at requires a prefab, finite transform, and non-zero scale"
                        .into(),
                });
                return handle_map(false, "Entity", "", "Invalid spawn request");
            }
            let serial = {
                let mut value = pending_serial.borrow_mut();
                *value = value.saturating_add(1);
                *value
            };
            let pending_id = format!("pending:{source_entity}:{invocation_id}:{serial}");
            commands.borrow_mut().commands.push(ScriptCommand::SpawnAt {
                pending_id: pending_id.clone(),
                prefab,
                x,
                y,
                rotation,
                scale_x,
                scale_y,
            });
            handle_map(true, "Entity", &pending_id, "")
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "entity_set_position",
        /* 先校验目标句柄及生命周期代数，将“设置目标实体位置”命令加入宿主队列。 */
        move |handle: Map, x: FLOAT, y: FLOAT| {
            if let Some((target, generation)) = target_from_handle(handle) {
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::TargetSetPosition {
                        target,
                        generation,
                        x,
                        y,
                    })
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "entity_set_rotation",
        /* 先校验目标句柄及生命周期代数，将“设置目标实体旋转”命令加入宿主队列。 */
        move |handle: Map, radians: FLOAT| {
            if let Some((target, generation)) = target_from_handle(handle) {
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::TargetSetRotation {
                        target,
                        generation,
                        radians,
                    })
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "entity_set_scale",
        /* 先校验目标句柄及生命周期代数，将“设置目标实体缩放”命令加入宿主队列。 */
        move |handle: Map, x: FLOAT, y: FLOAT| {
            if let Some((target, generation)) = target_from_handle(handle) {
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::TargetSetScale {
                        target,
                        generation,
                        x,
                        y,
                    })
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "entity_set_enabled",
        /* 先校验目标句柄及生命周期代数，将“设置目标实体启用状态”命令加入宿主队列。 */
        move |handle: Map, enabled: bool| {
            if let Some((target, generation)) = target_from_handle(handle) {
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::TargetSetEnabled {
                        target,
                        generation,
                        enabled,
                    })
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "component_set_enabled_on",
        /* 先校验目标句柄及生命周期代数，将“设置目标组件启用状态”命令加入宿主队列，并限制相关文本长度。 */ move |handle: Map, component: &str, enabled: bool| {
            if let Some((target, generation)) = target_from_handle(handle) {
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::TargetSetComponentEnabled {
                        target,
                        generation,
                        component: component.chars().take(80).collect(),
                        enabled,
                    })
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn("ui_set_text_on", /* 先校验目标句柄及生命周期代数，将“设置目标界面文本”命令加入宿主队列，并限制相关文本长度。 */ move |handle: Map, text: &str| {
        if let Some((target, generation)) = target_from_handle(handle) {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::TargetSetUiText {
                    target,
                    generation,
                    text: text.chars().take(16_384).collect(),
                })
        }
    });
    let commands = Rc::clone(&output);
    engine.register_fn(
        "ui_set_value_on",
        /* 先校验目标句柄及生命周期代数，将“设置目标界面数值”命令加入宿主队列。 */
        move |handle: Map, value: FLOAT| {
            if let Some((target, generation)) = target_from_handle(handle) {
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::TargetSetUiValue {
                        target,
                        generation,
                        value,
                    })
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "entity_add_tag",
        /* 先校验目标句柄及生命周期代数，将“添加实体标签”命令加入宿主队列，并限制相关文本长度。 */
        move |handle: Map, tag: &str| {
            if let Some((target, generation)) = target_from_handle(handle) {
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::TargetAddTag {
                        target,
                        generation,
                        tag: tag.trim().chars().take(80).collect(),
                    })
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "entity_remove_tag",
        /* 先校验目标句柄及生命周期代数，将“移除实体标签”命令加入宿主队列，并限制相关文本长度。 */
        move |handle: Map, tag: &str| {
            if let Some((target, generation)) = target_from_handle(handle) {
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::TargetRemoveTag {
                        target,
                        generation,
                        tag: tag.trim().chars().take(80).collect(),
                    })
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "entity_add_group",
        /* 先校验目标句柄及生命周期代数，将“添加实体分组”命令加入宿主队列，并限制相关文本长度。 */
        move |handle: Map, group: &str| {
            if let Some((target, generation)) = target_from_handle(handle) {
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::TargetAddGroup {
                        target,
                        generation,
                        group: group.trim().chars().take(80).collect(),
                    })
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "entity_remove_group",
        /* 先校验目标句柄及生命周期代数，将“移除实体分组”命令加入宿主队列，并限制相关文本长度。 */
        move |handle: Map, group: &str| {
            if let Some((target, generation)) = target_from_handle(handle) {
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::TargetRemoveGroup {
                        target,
                        generation,
                        group: group.trim().chars().take(80).collect(),
                    })
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "entity_destroy",
        /* 先校验目标句柄及生命周期代数，将“销毁目标实体”命令加入宿主队列。 */
        move |handle: Map| {
            if let Some((target, generation)) = target_from_handle(handle) {
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::TargetDestroy { target, generation })
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "scene_load",
        /* 将“加载场景”命令加入宿主队列，并限制相关文本长度。 */
        move |scene: &str| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::LoadScene {
                    scene: scene.chars().take(512).collect(),
                });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "scene_reload",
        /* 将“重载场景”命令加入宿主队列。 */
        move || {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::ReloadScene)
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "scene_quit",
        /* 将“退出游戏”命令加入宿主队列。 */
        move || commands.borrow_mut().commands.push(ScriptCommand::Quit),
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "game_pause",
        /* 将“设置游戏暂停状态”命令加入宿主队列。 */
        move |paused: bool| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::GamePause { paused })
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "checkpoint_set",
        /* 将“保存检查点”命令加入宿主队列，并限制相关文本长度。 */
        move |name: &str| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::CheckpointSet {
                    name: name.trim().chars().take(80).collect(),
                })
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "checkpoint_restore",
        /* 将“恢复检查点”命令加入宿主队列，并限制相关文本长度。 */
        move |name: &str| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::CheckpointRestore {
                    name: name.trim().chars().take(80).collect(),
                })
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "score_set",
        /* 先检查数值有限性，将“设置分数”命令加入宿主队列。 */
        move |value: FLOAT| {
            if value.is_finite() {
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::ScoreSet { value })
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "score_add",
        /* 先检查数值有限性，将“累加分数”命令加入宿主队列。 */
        move |value: FLOAT| {
            if value.is_finite() {
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::ScoreAdd { value })
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "session_set",
        /* 先转换可序列化数据，将“设置会话键值”命令加入宿主队列，并限制相关文本长度。 */
        move |key: &str, value: Dynamic| {
            if let Some(value) = dynamic_to_json(value) {
                commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::SessionSet {
                        key: key.trim().chars().take(80).collect(),
                        value,
                    })
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "network_rpc",
        /* 先转换可序列化数据，将“排队网络远程调用”命令加入宿主队列，并限制相关文本长度。 */
        move |name: &str, payload: Dynamic| {
            let name: String = name.trim().chars().take(80).collect();
            match (name.is_empty(), dynamic_to_json(payload)) {
                (false, Some(payload)) => commands
                    .borrow_mut()
                    .commands
                    .push(ScriptCommand::NetworkRpc { name, payload }),
                _ => commands.borrow_mut().logs.push(ScriptLog {
                    level: "error".into(),
                    message: "network_rpc requires a name and a bounded serializable payload"
                        .into(),
                }),
            }
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "input_context_push",
        /* 将“压入输入上下文”命令加入宿主队列，并限制相关文本长度。 */
        move |name: &str, priority: INT, consume: bool| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::InputContextPush {
                    name: name.trim().chars().take(80).collect(),
                    priority: priority.clamp(-10_000, 10_000),
                    consume,
                })
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "input_context_pop",
        /* 将“弹出输入上下文”命令加入宿主队列，并限制相关文本长度。 */
        move |name: &str| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::InputContextPop {
                    name: name.trim().chars().take(80).collect(),
                })
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "input_map_enable",
        /* 将“启用输入映射”命令加入宿主队列，并限制相关文本长度。 */
        move |name: &str| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::InputMapEnable {
                    name: name.trim().chars().take(80).collect(),
                })
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "input_map_disable",
        /* 将“禁用输入映射”命令加入宿主队列，并限制相关文本长度。 */
        move |name: &str| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::InputMapDisable {
                    name: name.trim().chars().take(80).collect(),
                })
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "input_scheme_set",
        /* 将“切换输入方案”命令加入宿主队列，并限制相关文本长度。 */
        move |name: &str| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::InputSchemeSet {
                    name: name.trim().chars().take(80).collect(),
                })
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "timer_start",
        /* 先检查数值有限性，将“启动计时器”命令加入宿主队列，并限制相关文本长度。 */
        move |name: &str, seconds: FLOAT, repeat: bool| {
            if name.trim().is_empty() || !seconds.is_finite() || seconds < 0.0 {
                commands.borrow_mut().logs.push(ScriptLog {
                    level: "error".into(),
                    message: "timer_start requires a name and a finite non-negative duration"
                        .into(),
                });
                return;
            }
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::StartTimer {
                    name: name.chars().take(128).collect(),
                    seconds,
                    repeat,
                });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "timer_pause",
        /* 将“暂停计时器”命令加入宿主队列，并限制相关文本长度。 */
        move |name: &str| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::PauseTimer {
                    name: name.chars().take(128).collect(),
                });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "timer_resume",
        /* 将“恢复计时器”命令加入宿主队列，并限制相关文本长度。 */
        move |name: &str| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::ResumeTimer {
                    name: name.chars().take(128).collect(),
                });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "timer_cancel",
        /* 将“取消计时器”命令加入宿主队列，并限制相关文本长度。 */
        move |name: &str| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::CancelTimer {
                    name: name.chars().take(128).collect(),
                });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "task_wait",
        /* 先检查数值有限性，将“安排延迟任务”命令加入宿主队列，并限制相关文本长度。 */
        move |name: &str, seconds: FLOAT| {
            if name.trim().is_empty() || !seconds.is_finite() || seconds < 0.0 {
                commands.borrow_mut().logs.push(ScriptLog {
                    level: "error".into(),
                    message: "task_wait requires a name and a finite non-negative duration".into(),
                });
                return;
            }
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::StartTask {
                    name: name.chars().take(128).collect(),
                    seconds,
                });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "task_cancel",
        /* 将“取消任务”命令加入宿主队列，并限制相关文本长度。 */
        move |name: &str| {
            commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::CancelTask {
                    name: name.chars().take(128).collect(),
                });
        },
    );
    let commands = Rc::clone(&output);
    engine.register_fn(
        "signal_emit",
        /* 先转换可序列化数据，将“发送信号”命令加入宿主队列，并限制相关文本长度。 */
        move |name: &str, payload: Dynamic| match dynamic_to_json(payload) {
            Some(payload) => commands
                .borrow_mut()
                .commands
                .push(ScriptCommand::EmitSignal {
                    name: name.chars().take(128).collect(),
                    target: String::new(),
                    payload,
                }),
            None => commands.borrow_mut().logs.push(ScriptLog {
                level: "error".into(),
                message: "Signal payload is not serializable".into(),
            }),
        },
    );
    engine.register_fn(
        "signal_emit_to",
        /* 先转换可序列化数据，将“发送信号”命令加入宿主队列，并限制相关文本长度。 */
        move |target: &str, name: &str, payload: Dynamic| match dynamic_to_json(payload) {
            Some(payload) => output
                .borrow_mut()
                .commands
                .push(ScriptCommand::EmitSignal {
                    name: name.chars().take(128).collect(),
                    target: target.chars().take(128).collect(),
                    payload,
                }),
            None => output.borrow_mut().logs.push(ScriptLog {
                level: "error".into(),
                message: "Signal payload is not serializable".into(),
            }),
        },
    );
}

// 根据回调种类提供对应参数，并兼容允许的零参数历史函数。
fn call_lifecycle(
    engine: &Engine,
    scope: &mut Scope,
    ast: &AST,
    function: &str,
    context: &ScriptContext,
) -> Result<(), String> {
    let exists = ast.iter_functions().any(
        /* 判断 metadata . name == function 是否成立，供过滤或有效性检查使用。 */
        |metadata| metadata.name == function,
    );
    if !exists {
        return Ok(());
    }
    // execute_prepared already initialized this scope. Re-evaluating the AST
    // would duplicate top-level commands and shadow the exported properties
    // whose callback changes must be returned to the host.
    let options = CallFnOptions::new().eval_ast(false);
    let family = match context.callback_kind.as_str() {
        "update" | "late_update" | "fixed_update" | "on_timer" | "on_task" | "on_signal"
        | "on_collision_enter" | "on_collision_stay" | "on_collision_exit" | "on_trigger_enter"
        | "on_trigger_stay" | "on_trigger_exit" | "call" => context.callback_kind.as_str(),
        _ => function,
    };
    // Existing custom handlers without parameters remain callable. Typed custom
    // handlers receive their event family's arguments just like canonical names.
    let family = if family != function
        && ast.iter_functions().any(/* 判断 entry . name == function && entry . this_type . is_none () && entry . params . is_empty () 是否成立，供过滤或有效性检查使用。 */ |entry| {
            entry.name == function && entry.this_type.is_none() && entry.params.is_empty()
        }) {
        ""
    } else {
        family
    };
    let result = match family {
        "update" | "late_update" => engine.call_fn_with_options::<Dynamic>(
            options,
            scope,
            ast,
            function,
            (context.time.delta,),
        ),
        "fixed_update" => engine.call_fn_with_options::<Dynamic>(
            options,
            scope,
            ast,
            function,
            (context.time.fixed_delta,),
        ),
        "on_timer" => {
            let name = context
                .event
                .as_ref()
                .map(/* 复制 event . name . clone () 的结果，避免向调用方暴露可变宿主引用。 */ |event| event.name.clone())
                .or_else(/* 按 context . contact . as_ref () . map (| contact | contact . other_entity . clone ()) 读取或转换可选值，保留转换失败分支。 */ || {
                    context
                        .contact
                        .as_ref()
                        .map(/* 复制 contact . other_entity . clone () 的结果，避免向调用方暴露可变宿主引用。 */ |contact| contact.other_entity.clone())
                })
                .unwrap_or_default();
            engine.call_fn_with_options::<Dynamic>(options, scope, ast, function, (name,))
        }
        "on_task" => {
            let name = context
                .event
                .as_ref()
                .map(
                    /* 复制 event . name . clone () 的结果，避免向调用方暴露可变宿主引用。 */
                    |event| event.name.clone(),
                )
                .unwrap_or_default();
            engine.call_fn_with_options::<Dynamic>(options, scope, ast, function, (name,))
        }
        "call" => {
            // call_on()/call_global()/call_group()/after(): the payload is the argument array. Missing
            // arguments become () and extra ones are dropped, so the callee's arity decides.
            let mut arguments: Vec<Dynamic> =
                match context.event.as_ref().map(|event| &event.payload) {
                    Some(Value::Array(values)) => values
                        .iter()
                        .map(|value| json_to_dynamic(value).unwrap_or(Dynamic::UNIT))
                        .collect(),
                    Some(Value::Null) | None => Vec::new(),
                    Some(value) => vec![json_to_dynamic(value).unwrap_or(Dynamic::UNIT)],
                };
            let arities: Vec<usize> = ast
                .iter_functions()
                .filter(|entry| entry.name == function && entry.this_type.is_none())
                .map(|entry| entry.params.len())
                .collect();
            if !arities.contains(&arguments.len()) {
                if let Some(&arity) = arities
                    .iter()
                    .min_by_key(|arity| arity.abs_diff(arguments.len()))
                {
                    arguments.resize(arity, Dynamic::UNIT);
                }
            }
            engine.call_fn_with_options::<Dynamic>(options, scope, ast, function, arguments)
        }
        "on_signal" => {
            let event = context.event.clone().unwrap_or_default();
            let payload = json_to_dynamic(&event.payload).unwrap_or(Dynamic::UNIT);
            engine.call_fn_with_options::<Dynamic>(
                options,
                scope,
                ast,
                function,
                (event.name, payload, event.source),
            )
        }
        "on_collision_enter" | "on_collision_stay" | "on_collision_exit" | "on_trigger_enter"
        | "on_trigger_stay" | "on_trigger_exit" => {
            let contact = context.contact.clone().unwrap_or_default();
            engine.call_fn_with_options::<Dynamic>(
                options,
                scope,
                ast,
                function,
                (
                    contact.other_entity,
                    contact.point[0],
                    contact.point[1],
                    contact.normal[0],
                    contact.normal[1],
                    contact.relative_velocity[0],
                    contact.relative_velocity[1],
                ),
            )
        }
        _ => engine.call_fn_with_options::<Dynamic>(options, scope, ast, function, ()),
    };
    result
        .map(
            /* 计算并返回 ()，用于当前 call_lifecycle 流程。 */ |_| (),
        )
        .map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )
}

// 从脚本作用域提取可序列化的导出属性状态。
fn collect_properties(
    scope: &Scope,
    exports: &[ExportedProperty],
    previous: &BTreeMap<String, Value>,
) -> BTreeMap<String, Value> {
    let mut values = BTreeMap::new();
    for export in exports {
        let value = scope
            .get_value::<Dynamic>(&export.name)
            .and_then(dynamic_to_json)
            .or_else(/* 按 previous . get (& export . name) . cloned () 读取或转换可选值，保留转换失败分支。 */ || previous.get(&export.name).cloned())
            .unwrap_or_else(/* 复制 export . value . clone () 的结果，避免向调用方暴露可变宿主引用。 */ || export.value.clone());
        values.insert(export.name.clone(), value);
    }
    values
}

// 递归把支持的 Rhai 动态值转换为 JSON，不支持的类型返回空值。
fn dynamic_to_json(value: Dynamic) -> Option<Value> {
    if value.is_unit() {
        Some(Value::Null)
    } else if value.is::<bool>() {
        Some(Value::Bool(value.cast::<bool>()))
    } else if value.is::<INT>() {
        Some(Value::from(value.cast::<INT>()))
    } else if value.is::<FLOAT>() {
        serde_json::Number::from_f64(value.cast::<FLOAT>()).map(Value::Number)
    } else if value.is::<rhai::ImmutableString>() {
        Some(Value::String(
            value.cast::<rhai::ImmutableString>().to_string(),
        ))
    } else if value.is::<rhai::Array>() {
        value
            .cast::<rhai::Array>()
            .into_iter()
            .map(dynamic_to_json)
            .collect::<Option<Vec<_>>>()
            .map(Value::Array)
    } else if value.is::<Map>() {
        value
            .cast::<Map>()
            .into_iter()
            .map(/* 计算并返回 dynamic_to_json (value) . map (| value | (key . to_string () , value))，用于当前 dynamic_to_json 流程。 */ |(key, value)| dynamic_to_json(value).map(/* 计算并返回 (key . to_string () , value)，用于当前 dynamic_to_json 流程。 */ |value| (key.to_string(), value)))
            .collect::<Option<serde_json::Map<String, Value>>>()
            .map(Value::Object)
    } else {
        None
    }
}

// 递归把 JSON 标量、数组及对象转换为 Rhai 动态值。
/// 按导出声明类型把 JSON 值转换为 Rhai 动态值。
/// JSON 不区分整数与浮点：\`@export(type="float")\` 的默认值 2.0 在文档里写成 2，
/// 若原样注入会得到 i64，使 \`set_velocity(2, y)\` 找不到只接受 f64 的物理绑定。
/// 这里按声明的 value_type 把整数值提升为浮点，避免脚本作者被数字书写形式坑到。
fn json_to_export_dynamic(exported: &ExportedProperty, value: &Value) -> Option<Dynamic> {
    let dynamic = json_to_dynamic(value)?;
    if exported.value_type == "float" {
        if let Ok(integer) = dynamic.as_int() {
            return Some(Dynamic::from_float(integer as f64));
        }
    }
    Some(dynamic)
}

fn json_to_dynamic(value: &Value) -> Option<Dynamic> {
    match value {
        Value::Null => Some(Dynamic::UNIT),
        Value::Bool(value) => Some(Dynamic::from_bool(*value)),
        Value::Number(value) if value.is_i64() => value.as_i64().map(Dynamic::from_int),
        Value::Number(value) => value.as_f64().map(Dynamic::from_float),
        Value::String(value) => Some(Dynamic::from(value.clone())),
        Value::Array(values) => values
            .iter()
            .map(json_to_dynamic)
            .collect::<Option<rhai::Array>>()
            .map(Dynamic::from_array),
        Value::Object(values) => values
            .iter()
            .map(/* 复制 json_to_dynamic (value) . map (| value | (key . clone () . into () , value)) 的结果，避免向调用方暴露可变宿主引用。 */ |(key, value)| json_to_dynamic(value).map(/* 复制 (key . clone () . into () , value) 的结果，避免向调用方暴露可变宿主引用。 */ |value| (key.clone().into(), value)))
            .collect::<Option<Map>>()
            .map(Dynamic::from_map),
    }
}

// 解析导出声明、元数据和源码，再编译为可缓存程序。
fn prepare_script(source: &str) -> Result<PreparedScript, String> {
    if source.len() > 1_000_000 {
        return Err("script source exceeds the 1 MB safety limit".into());
    }
    let mut exports = Vec::new();
    let mut compatibility_warnings = Vec::new();
    let mut output = String::with_capacity(source.len());
    for line in source.lines() {
        let trimmed = line.trim();
        let export_line = trimmed
            .strip_prefix("// ")
            .unwrap_or(trimmed)
            .strip_prefix("@export");
        if let Some(raw_declaration) = export_line {
            let (metadata, declaration) = split_export_metadata(raw_declaration.trim())?;
            let declaration = declaration.strip_prefix("let ").unwrap_or(declaration);
            let Some((name, value)) = declaration.trim_end_matches(';').split_once('=') else {
                return Err(format!("invalid exported property declaration: {trimmed}"));
            };
            let name = name.trim().split(':').next().unwrap_or_default().trim();
            if !is_identifier(name) {
                return Err(format!("invalid exported property name: {name}"));
            }
            let expression = value.trim();
            let parsed = parse_export_value(expression).ok_or_else(
                /* 构造错误消息，保留unsupported exported property value: {expression}。 */
                || format!("unsupported exported property value: {expression}"),
            )?;
            let value_type = metadata
                .get("type")
                .cloned()
                .unwrap_or_else(/* 计算并返回 value_type_name (& parsed) . to_owned ()，用于当前 prepare_script 流程。 */ || value_type_name(&parsed).to_owned());
            let minimum = metadata_number(&metadata, "min")?;
            let maximum = metadata_number(&metadata, "max")?;
            let step = metadata_number(&metadata, "step")?;
            if minimum.zip(maximum).is_some_and(
                /* 判断 minimum > maximum 是否成立，供过滤或有效性检查使用。 */
                |(minimum, maximum)| minimum > maximum,
            ) {
                return Err(format!("exported property {name} has min greater than max"));
            }
            if step.is_some_and(
                /* 判断 ! step . is_finite () || step <= 0.0 是否成立，供过滤或有效性检查使用。 */
                |step| !step.is_finite() || step <= 0.0,
            ) {
                return Err(format!("exported property {name} has an invalid step"));
            }
            let enum_values = metadata
                .get("enum")
                .map(/* 按分隔符解析枚举选项，去空白并剔除空项，同时限制选项数量和各项长度。 */ |value| {
                    value
                        .split('|')
                        .map(str::trim)
                        .filter(/* 判断 ! value . is_empty () 是否成立，供过滤或有效性检查使用。 */ |value| !value.is_empty())
                        .take(128)
                        .map(/* 计算并返回 value . chars () . take (128) . collect ()，用于当前 prepare_script 流程。 */ |value| value.chars().take(128).collect())
                        .collect()
                })
                .unwrap_or_default();
            let serialized = metadata
                .get("serialize")
                .map(
                    /* 判断 value != "false" 是否成立，供过滤或有效性检查使用。 */
                    |value| value != "false",
                )
                .unwrap_or(true);
            let expression = export_literal(&parsed);
            exports.push(ExportedProperty {
                name: name.to_owned(),
                value: parsed.clone(),
                value_type,
                default_value: parsed,
                minimum,
                maximum,
                step,
                enum_values,
                resource_type: metadata.get("resource").cloned().filter(
                    /* 判断 ! value . is_empty () 是否成立，供过滤或有效性检查使用。 */
                    |value| !value.is_empty(),
                ),
                group: metadata.get("group").cloned().unwrap_or_else(
                    /* 计算并返回 "Script" . into ()，用于当前 prepare_script 流程。 */
                    || "Script".into(),
                ),
                tooltip: metadata.get("tooltip").cloned().unwrap_or_default(),
                serialized,
            });
            output.push_str(&format!(
                "let {name} = export_value(\"{name}\", {expression});\n"
            ));
        } else {
            output.push_str(line);
            output.push('\n');
        }
    }
    for (legacy, replacement) in [
        ("is_down", "input_down"),
        ("was_pressed", "input_pressed"),
        ("was_released", "input_released"),
        ("axis", "input_axis"),
        ("vector", "input_vector"),
        ("get_component", "component_handle"),
        ("animator", "animator_handle"),
        ("audio_source", "audio_source_handle"),
        ("character_can_coyote_jump", "can_coyote_jump"),
    ] {
        if source_contains_call(source, legacy) {
            compatibility_warnings.push(format!(
                "NOVA-SCRIPT-DEPRECATED: {legacy}() is retained for compatibility; use {replacement}() before API v2"
            ));
        }
    }
    Ok(PreparedScript {
        source: output,
        exports,
        compatibility_warnings,
    })
}

// 解析导出声明前的元数据并返回剩余声明文本。
fn split_export_metadata(value: &str) -> Result<(BTreeMap<String, String>, &str), String> {
    if !value.starts_with('(') {
        return Ok((BTreeMap::new(), value));
    }
    let mut quoted = false;
    let mut escaped = false;
    let mut closing = None;
    for (index, character) in value.char_indices().skip(1) {
        if escaped {
            escaped = false;
            continue;
        }
        if character == '\\' && quoted {
            escaped = true;
        } else if character == '"' {
            quoted = !quoted;
        } else if character == ')' && !quoted {
            closing = Some(index);
            break;
        }
    }
    let closing = closing.ok_or_else(/* 计算并返回 "unterminated @export metadata" . to_owned ()，用于当前 split_export_metadata 流程。 */ || "unterminated @export metadata".to_owned())?;
    let mut metadata = BTreeMap::new();
    for field in split_metadata_fields(&value[1..closing]) {
        let (key, raw) = field.split_once('=').ok_or_else(
            /* 构造错误消息，保留invalid @export metadata field: {field}。 */
            || format!("invalid @export metadata field: {field}"),
        )?;
        let key = key.trim();
        if !matches!(
            key,
            "type"
                | "min"
                | "max"
                | "step"
                | "enum"
                | "resource"
                | "group"
                | "tooltip"
                | "serialize"
        ) {
            return Err(format!("unknown @export metadata field: {key}"));
        }
        let raw = raw.trim();
        let decoded = if raw.starts_with('"') {
            serde_json::from_str::<String>(raw).map_err(
                /* 构造错误消息，保留invalid string metadata value for {key}。 */
                |_| format!("invalid string metadata value for {key}"),
            )?
        } else {
            raw.to_owned()
        };
        metadata.insert(key.to_owned(), decoded);
    }
    Ok((metadata, value[closing + 1..].trim()))
}

// 按字段边界拆分元数据，避免切开带引号的内容。
fn split_metadata_fields(value: &str) -> Vec<&str> {
    let mut fields = Vec::new();
    let mut start = 0;
    let mut quoted = false;
    let mut escaped = false;
    for (index, character) in value.char_indices() {
        if escaped {
            escaped = false;
        } else if character == '\\' && quoted {
            escaped = true;
        } else if character == '"' {
            quoted = !quoted;
        } else if character == ',' && !quoted {
            fields.push(value[start..index].trim());
            start = index + 1;
        }
    }
    if start < value.len() {
        fields.push(value[start..].trim());
    }
    fields
        .into_iter()
        .filter(
            /* 判断 ! field . is_empty () 是否成立，供过滤或有效性检查使用。 */
            |field| !field.is_empty(),
        )
        .collect()
}

// 读取并校验指定元数据字段的数值。
fn metadata_number(metadata: &BTreeMap<String, String>, key: &str) -> Result<Option<f64>, String> {
    metadata
        .get(key)
        .map(
            /* 把导出元数据解析成有限浮点数，失败时返回带字段名称的错误。 */
            |value| {
                value
                    .parse::<f64>()
                    .ok()
                    .filter(
                        /* 判断 value . is_finite () 是否成立，供过滤或有效性检查使用。 */
                        |value| value.is_finite(),
                    )
                    .ok_or_else(
                        /* 构造错误消息，保留invalid numeric @export metadata for {key}。 */
                        || format!("invalid numeric @export metadata for {key}"),
                    )
            },
        )
        .transpose()
}

// 返回 JSON 值对应的脚本导出类型名称。
fn value_type_name(value: &Value) -> &'static str {
    match value {
        Value::Bool(_) => "bool",
        Value::Number(number) if number.is_i64() => "integer",
        Value::Number(_) => "float",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "map",
        Value::Null => "null",
    }
}

// 判断源码是否含指定调用形式，用于兼容诊断。
fn source_contains_call(source: &str, name: &str) -> bool {
    source.lines().any(/* 逐行排除注释文本，再按标识符边界寻找目标函数调用。 */ |line| {
        let code = line.split("//").next().unwrap_or_default();
        code.match_indices(name).any(/* 检查名称前不是标识符字符且后方是左括号，排除相似名称误报。 */ |(index, _)| {
            let before = code[..index].chars().next_back();
            let after = code[index + name.len()..].trim_start().chars().next();
            !before.is_some_and(/* 判断 character == '_' || character . is_ascii_alphanumeric () 是否成立，供过滤或有效性检查使用。 */ |character| character == '_' || character.is_ascii_alphanumeric())
                && after == Some('(')
        })
    })
}

// 检查标识符首字符和后续字符是否合法。
fn is_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    chars
        .next()
        .is_some_and(/* 判断 value == '_' || value . is_ascii_alphabetic () 是否成立，供过滤或有效性检查使用。 */ |value| value == '_' || value.is_ascii_alphabetic())
        && chars.all(/* 判断 value == '_' || value . is_ascii_alphanumeric () 是否成立，供过滤或有效性检查使用。 */ |value| value == '_' || value.is_ascii_alphanumeric())
}

// 把 JSON 默认值转换为可嵌入 Rhai 源码的字面量。
/// Export defaults are serialized data; nested JSON maps need Rhai map syntax.
fn export_literal(value: &Value) -> String {
    match value {
        Value::Null => "()".into(),
        Value::Array(values) => format!(
            "[{}]",
            values
                .iter()
                .map(export_literal)
                .collect::<Vec<_>>()
                .join(",")
        ),
        Value::Object(values) => format!(
            "#{{{}}}",
            values
                .iter()
                .map(
                    /* 转义对象键并递归生成值的 Rhai 字面量，组合为映射条目。 */
                    |(key, value)| format!(
                        "{}:{}",
                        Value::String(key.clone()),
                        export_literal(value)
                    )
                )
                .collect::<Vec<_>>()
                .join(",")
        ),
        _ => value.to_string(),
    }
}

// 将导出值文本转换为可被 JSON 解析的表示。
/// Normalize constant Rhai map/unit tokens into JSON without evaluating source.
fn export_json(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut output = String::with_capacity(value.len());
    let (mut index, mut quoted, mut escaped) = (0, false, false);
    while index < chars.len() {
        let ch = chars[index];
        if quoted {
            output.push(ch);
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                quoted = false;
            }
            index += 1;
            continue;
        }
        if ch == '"' {
            quoted = true;
            output.push(ch);
            index += 1;
            continue;
        }
        if ch == '#' && chars.get(index + 1) == Some(&'{') {
            index += 1;
            continue;
        }
        if ch == '(' {
            let mut end = index + 1;
            while chars.get(end).is_some_and(
                /* 计算并返回 value . is_whitespace ()，用于当前 export_json 流程。 */
                |value| value.is_whitespace(),
            ) {
                end += 1;
            }
            if chars.get(end) == Some(&')') {
                output.push_str("null");
                index = end + 1;
                continue;
            }
        }
        if ch.is_ascii_alphabetic() || ch == '_' {
            let begin = index;
            index += 1;
            while chars
                .get(index)
                .is_some_and(/* 判断 value . is_ascii_alphanumeric () || * value == '_' 是否成立，供过滤或有效性检查使用。 */ |value| value.is_ascii_alphanumeric() || *value == '_')
            {
                index += 1;
            }
            let word: String = chars[begin..index].iter().collect();
            let mut next = index;
            while chars.get(next).is_some_and(
                /* 计算并返回 value . is_whitespace ()，用于当前 export_json 流程。 */
                |value| value.is_whitespace(),
            ) {
                next += 1;
            }
            if chars.get(next) == Some(&':') {
                output.push_str(&Value::String(word).to_string());
            } else {
                output.push_str(&word);
            }
            continue;
        }
        output.push(ch);
        index += 1;
    }
    output
}

// 解析导出属性初值，不支持的表达式返回空值。
fn parse_export_value(value: &str) -> Option<Value> {
    match value {
        "()" | "null" => Some(Value::Null),
        "true" => Some(Value::Bool(true)),
        "false" => Some(Value::Bool(false)),
        _ if value.starts_with("#{") && value.ends_with('}') => {
            serde_json::from_str(&export_json(value)).ok()
        }
        _ if (value.starts_with('[') && value.ends_with(']'))
            || (value.starts_with('{') && value.ends_with('}')) =>
        {
            serde_json::from_str(&export_json(value)).ok()
        }
        _ if value.starts_with('"') && value.ends_with('"') && value.len() >= 2 => {
            serde_json::from_str(value).ok()
        }
        _ => value
            .parse::<i64>()
            .map(Value::from)
            .or_else(/* 判断 value . parse :: < f64 > () . ok () . and_then (serde_json :: Number :: from_f64) . map (Value :: Number) . ok_or (()) 是否成立，供过滤或有效性检查使用。 */ |_| {
                value
                    .parse::<f64>()
                    .ok()
                    .and_then(serde_json::Number::from_f64)
                    .map(Value::Number)
                    .ok_or(())
            })
            .ok(),
    }
}

#[cfg(test)]
mod engine_reuse_tests {
    use super::*;

    // 26.43: the reused host engine reads the running callback's context. Two entities with different
    // contexts run alternately on one runtime; every context-backed function must see its own values,
    // and per-call state (random seed, spawn serials) restarts with every callback.
    #[test]
    fn reused_engine_reads_each_callbacks_own_context() {
        let mut runtime = ScriptRuntime::new();
        let source = r#"
fn probe() {
    print(`entity=${entity()} name=${entity_name()} handle=${entity_handle().id}`);
    print(`delta=${time_delta()} frame=${time().frame}`);
    print(`axis=${input_axis("Move")} down=${input_down("Jump")}`);
    print(`x=${transform().position_x} vy=${rigid_body().velocity_y}`);
    print(`floor=${character_is_on_floor()} coyote=${can_coyote_jump()}`);
    print(`save=${save_get("best", 0)} session=${session_get("lap", 0)}`);
    print(`component=${has_component("Camera2D")} api=${api_version()}`);
    print(`random=${random()}`);
    spawn_at("asset://prefab", 0.0, 0.0, 0.0, 1.0, 1.0);
}
"#;
        runtime.upsert("probe", source).unwrap();
        let context = |entity: &str, value: f64, flag: bool, seed: u64| {
            let mut context = ScriptContext {
                entity: entity.into(),
                entity_name: format!("Name {entity}"),
                random_seed: seed,
                api_version: 2,
                ..ScriptContext::default()
            };
            context.entity_generations.insert(entity.into(), 1);
            context.time.delta = value;
            context.time.frame = (value * 1000.0) as u64;
            context.input.axes.insert("Move".into(), value);
            context.input.down.insert("Jump".into(), flag);
            context.transform.position = [value * 10.0, 0.0];
            context.rigid_body = Some(RigidBodySnapshot {
                velocity: [0.0, -value],
                angular_velocity: 0.0,
                mass: 1.0,
                body_type: "Dynamic".into(),
            });
            context.character = flag.then(|| CharacterSnapshot {
                on_floor: true,
                can_coyote_jump: true,
                ..CharacterSnapshot::default()
            });
            context
                .save
                .insert("best".into(), Value::from(value * 100.0));
            context
                .game_flow
                .session
                .insert("lap".into(), Value::from((value * 7.0).round()));
            if flag {
                context.components.push("Camera2D".into());
            }
            context
        };
        let run = |runtime: &mut ScriptRuntime, entity: &str, value: f64, flag: bool, seed: u64| {
            runtime
                .execute_instance("probe", "probe", 1, 1, context(entity, value, flag, seed))
                .unwrap()
        };
        let first = run(&mut runtime, "a", 0.25, true, 7);
        let second = run(&mut runtime, "b", 0.5, false, 9);
        let third = run(&mut runtime, "a", 0.25, true, 7);
        let lines = |execution: &ScriptExecution| {
            execution
                .logs
                .iter()
                .map(|log| log.message.clone())
                .collect::<Vec<_>>()
        };
        assert_eq!(lines(&first)[0], "entity=a name=Name a handle=a");
        assert_eq!(lines(&second)[0], "entity=b name=Name b handle=b");
        assert_eq!(lines(&first)[1], "delta=0.25 frame=250");
        assert_eq!(lines(&second)[1], "delta=0.5 frame=500");
        assert_eq!(lines(&first)[2], "axis=0.25 down=true");
        assert_eq!(lines(&second)[2], "axis=0.5 down=false");
        assert_eq!(lines(&first)[3], "x=2.5 vy=-0.25");
        assert_eq!(lines(&second)[3], "x=5.0 vy=-0.5");
        assert_eq!(lines(&first)[4], "floor=true coyote=true");
        assert_eq!(lines(&second)[4], "floor=false coyote=false");
        assert_eq!(lines(&first)[5], "save=25.0 session=2.0");
        assert_eq!(lines(&second)[5], "save=50.0 session=4.0");
        assert_eq!(lines(&first)[6], "component=true api=2");
        assert_eq!(lines(&second)[6], "component=false api=2");
        // Same seed, same random value; spawn serials restart with each callback.
        assert_eq!(lines(&first)[7], lines(&third)[7]);
        assert_ne!(lines(&first)[7], lines(&second)[7]);
        assert_eq!(first.commands, third.commands);
    }
}

#[cfg(test)]
mod link_and_media_tests {
    use super::*;

    fn context(entity: &str) -> ScriptContext {
        let mut context = ScriptContext {
            entity: entity.into(),
            api_version: 2,
            ..ScriptContext::default()
        };
        context.entity_generations.insert(entity.into(), 1);
        context.entity_generations.insert("target".into(), 4);
        context.entities.insert("Target".into(), "target".into());
        context
    }

    // 26.45: the debugger's rewind puts instance scopes (hidden variables too) back.
    #[test]
    fn instance_snapshots_restore_hidden_state() {
        let mut runtime = ScriptRuntime::new();
        let source = "@export let count = 0;\nlet hidden = 0;\nfn update(dt) {\n    hidden += 1;\n    count = hidden;\n}\n";
        runtime.upsert("counter", source).unwrap();
        let mut properties = BTreeMap::new();
        let run = |runtime: &mut ScriptRuntime, properties: &mut BTreeMap<String, Value>| {
            let mut context = context("self");
            context.properties = properties.clone();
            let execution = runtime
                .execute_instance("counter", "update", 1, 1, context)
                .unwrap();
            *properties = execution.properties;
            properties["count"].as_f64().unwrap()
        };
        assert_eq!(run(&mut runtime, &mut properties), 1.0);
        let snapshot = runtime.snapshot_instances();
        let saved = properties.clone();
        assert_eq!(snapshot.len(), 1);
        assert_eq!(run(&mut runtime, &mut properties), 2.0);
        assert_eq!(run(&mut runtime, &mut properties), 3.0);
        assert_eq!(runtime.restore_instances(&snapshot), Some(1));
        properties = saved;
        assert_eq!(
            run(&mut runtime, &mut properties),
            2.0,
            "hidden state rewound"
        );
        // A recompiled script starts fresh instead of taking the old scope.
        runtime
            .upsert("counter", &source.replace("+= 1", "+= 10"))
            .unwrap();
        assert_eq!(runtime.restore_instances(&snapshot), Some(0));
        // Another play session (epoch) does not take it at all.
        runtime.clear_instances(2).unwrap();
        assert_eq!(runtime.restore_instances(&snapshot), None);
    }

    // 26.43: call_on / call_global / call_group / after queue host commands with serializable
    // arguments; lifecycle names and invalid targets are rejected with a log, never queued.
    #[test]
    fn calls_are_queued_with_targets_and_arguments() {
        let mut runtime = ScriptRuntime::new();
        let source = r#"
fn update(dt) {
    let target = find_entity_handle("Target");
    call_on(target, "hit", [3, "fire"]);
    call_on("target", "heal");
    call_on("missing", "heal");
    call_global("Game", "add_score", [10]);
    call_group("enemies", "alert");
    after(0.5, "explode", [2.0]);
    after(1, "beep");
    call_on(target, "update");
    call_on(target, "bad name");
}
"#;
        runtime.upsert("caller", source).unwrap();
        let execution = runtime
            .execute_instance("caller", "update", 1, 1, context("self"))
            .unwrap();
        assert_eq!(
            execution.commands,
            vec![
                ScriptCommand::CallFunction {
                    target: "target".into(),
                    generation: 4,
                    function: "hit".into(),
                    args: serde_json::json!([3, "fire"]),
                },
                ScriptCommand::CallFunction {
                    target: "target".into(),
                    generation: 4,
                    function: "heal".into(),
                    args: serde_json::json!([]),
                },
                ScriptCommand::CallGlobal {
                    name: "Game".into(),
                    function: "add_score".into(),
                    args: serde_json::json!([10]),
                },
                ScriptCommand::CallGroup {
                    group: "enemies".into(),
                    function: "alert".into(),
                    args: serde_json::json!([]),
                },
                ScriptCommand::CallLater {
                    function: "explode".into(),
                    seconds: 0.5,
                    args: serde_json::json!([2.0]),
                },
                ScriptCommand::CallLater {
                    function: "beep".into(),
                    seconds: 1.0,
                    args: serde_json::json!([]),
                },
            ]
        );
        let errors: Vec<_> = execution
            .logs
            .iter()
            .filter(|log| log.level == "error")
            .map(|log| log.message.as_str())
            .collect();
        assert_eq!(errors.len(), 3, "{errors:?}");
        assert!(errors[0].contains("target entity is not valid"));
        assert!(errors[1].contains("not a callable function name"));
        assert!(errors[2].contains("not a callable function name"));
    }

    // The callee receives the argument array as parameters; its arity decides (missing -> (),
    // extra dropped), and a zero-parameter function is still callable with arguments.
    #[test]
    fn called_function_receives_arguments_by_arity() {
        let mut runtime = ScriptRuntime::new();
        let source = r#"
fn hit(amount, kind) { print(`hit ${amount} ${kind}`); }
fn heal() { print("healed"); }
fn three(a, b, c) { print(`three ${a} ${b} ${c == ()}`); }
"#;
        runtime.upsert("callee", source).unwrap();
        let call = |runtime: &mut ScriptRuntime, function: &str, payload: Value| {
            let mut context = context("target");
            context.callback_kind = "call".into();
            context.event = Some(EventSnapshot {
                name: function.into(),
                source: "self".into(),
                payload,
            });
            let execution = runtime
                .execute_instance("callee", function, 1, 4, context)
                .unwrap();
            execution.logs[0].message.clone()
        };
        assert_eq!(
            call(&mut runtime, "hit", serde_json::json!([3, "fire"])),
            "hit 3 fire"
        );
        assert_eq!(
            call(&mut runtime, "hit", serde_json::json!([3, "fire", 9])),
            "hit 3 fire"
        );
        assert_eq!(call(&mut runtime, "heal", serde_json::json!([5])), "healed");
        assert_eq!(
            call(&mut runtime, "three", serde_json::json!([1, 2])),
            "three 1 2 true"
        );
    }

    #[test]
    fn audio_and_video_commands_are_bounded() {
        let mut runtime = ScriptRuntime::new();
        let source = r#"
fn update(dt) {
    play_sound("Assets/Audio/hit.wav");
    play_sound("Assets/Audio/wind.ogg", #{ bus: "UI", volume: 9, pitch: 1.5, looped: true, tag: "ambience" });
    stop_sounds("ambience", 1.0);
    play_music("Assets/Audio/theme.ogg");
    play_music("Assets/Audio/boss.ogg", 2.0, 0.5);
    stop_music();
    set_bus_volume("Music", 0.3);
    play_video("Assets/Video/intro.webm");
    play_video("Assets/Video/loop.webm", #{ skippable: false, "loop": true, volume: 0.25 });
    stop_video();
    play_sound("");
}
"#;
        runtime.upsert("media", source).unwrap();
        let execution = runtime
            .execute_instance("media", "update", 1, 1, context("self"))
            .unwrap();
        assert_eq!(
            execution.commands,
            vec![
                ScriptCommand::PlaySound {
                    asset: "Assets/Audio/hit.wav".into(),
                    bus: "SFX".into(),
                    volume: 1.0,
                    pitch: 1.0,
                    looped: false,
                    tag: String::new(),
                },
                ScriptCommand::PlaySound {
                    asset: "Assets/Audio/wind.ogg".into(),
                    bus: "UI".into(),
                    volume: 4.0,
                    pitch: 1.5,
                    looped: true,
                    tag: "ambience".into(),
                },
                ScriptCommand::StopSounds {
                    tag: "ambience".into(),
                    fade: 1.0,
                },
                ScriptCommand::PlayMusic {
                    asset: "Assets/Audio/theme.ogg".into(),
                    fade: 0.5,
                    volume: 1.0,
                },
                ScriptCommand::PlayMusic {
                    asset: "Assets/Audio/boss.ogg".into(),
                    fade: 2.0,
                    volume: 0.5,
                },
                ScriptCommand::StopMusic { fade: 0.5 },
                ScriptCommand::SetBusVolume {
                    bus: "Music".into(),
                    volume: 0.3,
                },
                ScriptCommand::PlayVideo {
                    asset: "Assets/Video/intro.webm".into(),
                    skippable: true,
                    volume: 1.0,
                    looped: false,
                },
                ScriptCommand::PlayVideo {
                    asset: "Assets/Video/loop.webm".into(),
                    skippable: false,
                    volume: 0.25,
                    looped: true,
                },
                ScriptCommand::StopVideo,
            ]
        );
        assert!(execution
            .logs
            .iter()
            .any(|log| log.level == "error" && log.message.contains("play_sound needs")));
        let json = serde_json::to_value(&execution.commands[1]).unwrap();
        assert_eq!(json["type"], "playSound");
        assert_eq!(json["looped"], true);
        let json = serde_json::to_value(&execution.commands[9]).unwrap();
        assert_eq!(json["type"], "stopVideo");
    }
}

#[cfg(test)]
mod tests {
    fn phase_world() -> ScriptWorldSnapshot {
        ScriptWorldSnapshot {
            protocol_version: 1,
            entities: BTreeMap::from([
                ("Target".into(), "target".into()),
                ("Self".into(), "self".into()),
            ]),
            entity_generations: BTreeMap::from([("target".into(), 2), ("self".into(), 1)]),
            scene_entities: vec![
                SceneEntitySnapshot {
                    uuid: "target".into(),
                    generation: 2,
                    name: "Target".into(),
                    enabled: true,
                    tags: vec!["old".into()],
                    position: [3.0, 4.0],
                    ..Default::default()
                },
                SceneEntitySnapshot {
                    uuid: "self".into(),
                    generation: 1,
                    name: "Self".into(),
                    enabled: true,
                    ..Default::default()
                },
            ],
        }
    }

    #[test]
    fn tag_and_group_tests_read_the_published_world() {
        let mut runtime = ScriptRuntime::new();
        runtime.clear_instances(1).unwrap();
        runtime.upsert("tags", "fn update(dt) { print(entity_has_tag(\"target\", \"old\")); print(entity_has_tag(\"target\", \"new\")); print(entity_has_tag(find_entity_handle(\"Target\"), \"old\")); print(entity_in_group(\"self\", \"team\")); print(entity_has_tag(\"missing\", \"old\")); print(entity_handle_of(\"target\").generation); print(entity_handle_of(\"missing\").valid); }").unwrap();
        let mut world = phase_world();
        world.scene_entities[1].groups = vec!["team".into()];
        runtime.publish_world_context(1, 1, world).unwrap();
        let context = ScriptContext {
            entity: "self".into(),
            ..Default::default()
        };
        let logs: Vec<String> = runtime
            .execute_instance_context("tags", "update", 1, 1, 1, context)
            .unwrap()
            .logs
            .into_iter()
            .map(|log| log.message)
            .collect();
        assert_eq!(
            logs,
            ["true", "false", "true", "true", "false", "2", "false"]
        );
    }

    #[test]
    fn phase_context_references_shared_world_and_observes_committed_deltas() {
        let mut runtime = ScriptRuntime::new();
        runtime.clear_instances(1).unwrap();
        runtime.upsert("query", "fn update(dt) { let e = find_entity_handle(\"Target\"); print(entity_position_x_on(e)); print(query_tag(\"new\", 4).len()); }").unwrap();
        runtime.publish_world_context(1, 1, phase_world()).unwrap();
        let small = || ScriptContext {
            entity: "self".into(),
            ..Default::default()
        };
        assert_eq!(
            runtime
                .execute_instance_context("query", "update", 1, 1, 1, small())
                .unwrap()
                .logs[0]
                .message,
            "3.0"
        );
        let mut delta = phase_world().scene_entities.remove(0);
        delta.position = [99.0, 4.0];
        delta.tags = vec!["new".into()];
        runtime.apply_world_delta(1, 1, 2, vec![delta]).unwrap();
        let after = runtime
            .execute_instance_context("query", "update", 1, 2, 1, small())
            .unwrap();
        assert_eq!(after.logs[0].message, "99.0");
        assert_eq!(after.logs[1].message, "1");
        assert!(runtime
            .execute_instance_context("query", "update", 1, 1, 1, small())
            .unwrap_err()
            .contains("revision"));
        assert!(runtime
            .execute_instance_context("query", "update", 2, 2, 1, small())
            .unwrap_err()
            .contains("epoch"));
        let mut full = small();
        full.scene_entities = phase_world().scene_entities;
        assert!(runtime
            .execute_instance_context("query", "update", 1, 2, 1, full)
            .unwrap_err()
            .contains("small"));
    }

    #[test]
    fn phase_delta_validation_is_atomic_and_structural_changes_need_publication() {
        let mut runtime = ScriptRuntime::new();
        runtime.clear_instances(1).unwrap();
        runtime.publish_world_context(1, 1, phase_world()).unwrap();
        let mut valid = phase_world().scene_entities.remove(0);
        valid.position[0] = 10.0;
        let mut invalid = valid.clone();
        invalid.uuid = "missing".into();
        assert!(runtime
            .apply_world_delta(1, 1, 2, vec![valid.clone(), invalid])
            .is_err());
        let view = runtime.world_view.as_ref().unwrap().borrow();
        assert_eq!(view.revision, 1);
        assert_eq!(view.snapshot.scene_entities[0].position[0], 3.0);
        drop(view);
        let mut bad = valid.clone();
        bad.position[0] = f64::NAN;
        assert!(runtime.apply_world_delta(1, 1, 2, vec![bad]).is_err());
        assert!(runtime
            .apply_world_delta(1, 0, 1, vec![valid.clone()])
            .is_err());
        assert!(runtime.publish_world_context(1, 1, phase_world()).is_err());
        assert!(runtime.publish_world_context(2, 2, phase_world()).is_err());
        let mut replacement = phase_world();
        replacement.scene_entities[0].generation = 3;
        replacement.entity_generations.insert("target".into(), 3);
        runtime.publish_world_context(1, 2, replacement).unwrap();
        assert!(runtime.apply_world_delta(1, 2, 3, vec![valid]).is_err());
    }

    use super::*;

    // 构造脚本沙箱测试使用的宿主上下文。
    fn context() -> ScriptContext {
        ScriptContext {
            entity: "entity-1".into(),
            entity_name: "Player".into(),
            components: vec!["RigidBody2D".into()],
            time: TimeSnapshot {
                delta: 0.25,
                fixed_delta: 1.0 / 60.0,
                elapsed: 1.0,
                scale: 1.0,
                frame: 3,
            },
            input: InputSnapshot {
                pressed: BTreeMap::from([("Jump".into(), true)]),
                ..InputSnapshot::default()
            },
            ..ScriptContext::default()
        }
    }

    fn live_context(entity: &str, generation: u32) -> ScriptContext {
        let mut value = context();
        value.entity = entity.into();
        value.entity_generations.insert(entity.into(), generation);
        value
    }

    #[test]
    fn live_instances_initialize_once_retain_private_state_and_isolate_entities() {
        let mut runtime = ScriptRuntime::new();
        runtime.upsert("counter", "@export let exported = 0;\nlet private_count = 0;\nscore_add(1.0);\nfn update(dt) { private_count += 1; exported += 1; print(private_count); }").unwrap();
        let first = runtime
            .execute_instance("counter", "update", 1, 11, live_context("a", 11))
            .unwrap();
        assert_eq!(first.commands, vec![ScriptCommand::ScoreAdd { value: 1.0 }]);
        let mut input = live_context("a", 11);
        input.properties = first.properties;
        let second = runtime
            .execute_instance("counter", "update", 1, 11, input)
            .unwrap();
        assert!(second.commands.is_empty());
        assert_eq!(second.logs[0].message, "2");
        assert_eq!(second.properties["exported"], 2);
        let other = runtime
            .execute_instance("counter", "update", 1, 12, live_context("b", 12))
            .unwrap();
        assert_eq!(other.logs[0].message, "1");
        assert_eq!(other.commands.len(), 1);
    }

    #[test]
    fn debug_runs_stop_at_lines_step_and_leave_no_trace() {
        let source = "let count = 0;\nfn helper(x) {\n    let y = x * 2;\n    y + 1\n}\nfn update(dt) {\n    let a = 1;\n    count += a;\n    let b = helper(a);\n    score_add(1.0);\n    print(`b=${b} count=${count}`);\n}";
        let mut runtime = ScriptRuntime::new();
        runtime.upsert("debug", source).unwrap();
        let probe = |lines: &[usize], after: u64, mode: &str, depth: usize| ScriptDebugProbe {
            break_lines: lines.to_vec(),
            after_event: after,
            mode: mode.into(),
            depth,
        };
        // A breakpoint on line 9 stops before helper runs; count was already incremented in the
        // stopped run but the instance is restored, so nothing of it remains.
        let first = runtime
            .execute_instance_debug(
                "debug",
                "update",
                1,
                3,
                live_context("a", 3),
                probe(&[9], 0, "continue", 0),
            )
            .unwrap();
        let pause = first.pause.expect("stopped at line 9");
        assert_eq!(pause.line, 9);
        assert!(first.commands.is_empty() && first.logs.is_empty());
        let local = |name: &str| {
            pause
                .locals
                .iter()
                .find(|local| local.name == name)
                .map(|local| local.value.clone())
        };
        assert_eq!(local("a"), Some(Value::from(1)));
        assert_eq!(local("count"), Some(Value::from(1)));
        // Step into: the next statement is the first line of helper, one call level deeper.
        let into = runtime
            .execute_instance_debug(
                "debug",
                "update",
                1,
                3,
                live_context("a", 3),
                probe(&[9], pause.event, "into", pause.depth),
            )
            .unwrap()
            .pause
            .expect("stepped into helper");
        assert_eq!(into.line, 3);
        assert!(into.depth > pause.depth);
        assert_eq!(
            into.stack.last().map(|frame| frame.function.as_str()),
            Some("helper")
        );
        assert_eq!(
            into.locals
                .iter()
                .find(|local| local.name == "x")
                .map(|local| local.value.clone()),
            Some(Value::from(1))
        );
        // Step out of helper: back in update on the next statement.
        let out = runtime
            .execute_instance_debug(
                "debug",
                "update",
                1,
                3,
                live_context("a", 3),
                probe(&[9], into.event, "out", into.depth),
            )
            .unwrap()
            .pause
            .expect("stepped out");
        assert_eq!(out.line, 10);
        // Step over from line 9 skips helper's lines.
        let over = runtime
            .execute_instance_debug(
                "debug",
                "update",
                1,
                3,
                live_context("a", 3),
                probe(&[9], pause.event, "over", pause.depth),
            )
            .unwrap()
            .pause
            .expect("stepped over");
        assert_eq!(over.line, 10);
        // Continue past the last breakpoint: the run completes and its effects apply once.
        let done = runtime
            .execute_instance_debug(
                "debug",
                "update",
                1,
                3,
                live_context("a", 3),
                probe(&[9], pause.event, "continue", 0),
            )
            .unwrap();
        assert!(done.pause.is_none());
        assert_eq!(done.commands, vec![ScriptCommand::ScoreAdd { value: 1.0 }]);
        assert_eq!(done.logs[0].message, "b=3 count=1");
        // The ordinary path continues from the committed state.
        let next = runtime
            .execute_instance("debug", "update", 1, 3, live_context("a", 3))
            .unwrap();
        assert_eq!(next.logs[0].message, "b=3 count=2");
    }

    #[test]
    fn live_instances_reject_stale_lifetimes_epochs_and_reuse_after_retirement() {
        let mut runtime = ScriptRuntime::new();
        runtime
            .upsert(
                "counter",
                "let count = 0; fn update(dt) { count += 1; print(count); }",
            )
            .unwrap();
        runtime
            .execute_instance("counter", "update", 1, 11, live_context("a", 11))
            .unwrap();
        assert!(runtime.remove_entity_instances(1, "a"));
        assert!(runtime
            .execute_instance("counter", "update", 1, 11, live_context("a", 11))
            .unwrap_err()
            .contains("generation"));
        let new = runtime
            .execute_instance("counter", "update", 1, 12, live_context("a", 12))
            .unwrap();
        assert_eq!(new.logs[0].message, "1");
        runtime.clear_instances(2).unwrap();
        assert!(runtime
            .execute_instance("counter", "update", 1, 12, live_context("a", 12))
            .unwrap_err()
            .contains("epoch"));
        assert!(runtime.clear_instances(1).is_err());
    }

    #[test]
    fn candidate_instance_ownership_moves_only_after_validation_and_preserves_unchanged_closures() {
        let mut live = ScriptRuntime::new();
        live.upsert("counter", "let count = 0; let increment = || { count += 1; count }; fn update(dt) { print(increment.call()); }").unwrap();
        assert_eq!(
            live.execute_instance("counter", "update", 1, 1, live_context("a", 1))
                .unwrap()
                .logs[0]
                .message,
            "1"
        );
        let mut rejected = live.clone();
        assert!(rejected.upsert("counter", "fn update(").is_err());
        assert_eq!(
            live.execute_instance("counter", "update", 1, 1, live_context("a", 1))
                .unwrap()
                .logs[0]
                .message,
            "2"
        );
        let mut candidate = live.clone();
        candidate.upsert("unrelated", "fn update(dt) {}").unwrap();
        assert_eq!(candidate.take_instances_from(&mut live).unwrap(), 1);
        assert!(live.instances.is_empty());
        assert_eq!(
            candidate
                .execute_instance("counter", "update", 1, 1, live_context("a", 1))
                .unwrap()
                .logs[0]
                .message,
            "3"
        );
        let mut changed = candidate.clone();
        changed
            .upsert(
                "counter",
                "let count = 10; fn update(dt) { count += 1; print(count); }",
            )
            .unwrap();
        changed.take_instances_from(&mut candidate).unwrap();
        assert_eq!(
            changed
                .execute_instance("counter", "update", 1, 1, live_context("a", 1))
                .unwrap()
                .logs[0]
                .message,
            "11"
        );
    }

    #[test]
    fn live_callback_uses_fresh_host_input_and_initialization_is_not_retried_after_callback_error()
    {
        let mut runtime = ScriptRuntime::new();
        runtime.upsert("callback", "score_add(1.0); fn update(dt) { print(input_pressed(\"Jump\")); if input_pressed(\"Jump\") { throw \"intentional\"; } }").unwrap();
        assert!(runtime
            .execute_instance("callback", "update", 1, 1, live_context("a", 1))
            .is_err());
        let mut input = live_context("a", 1);
        input.input.pressed.clear();
        let next = runtime
            .execute_instance("callback", "update", 1, 1, input)
            .unwrap();
        assert_eq!(next.logs[0].message, "false");
        assert!(next.commands.is_empty());
    }

    // 验证导出属性和受控命令正确跨越脚本沙箱边界。
    #[test]
    fn exported_properties_and_commands_cross_the_sandbox_boundary() {
        let source = r#"
            @export let jump_force = 5.0;
            fn update(dt) {
                if input_pressed("Jump") {
                    apply_impulse(0.0, jump_force * dt);
                    print(`jump ${entity_name()}`);
                }
            }
        "#;
        let execution = ScriptRuntime::new()
            .execute(source, "update", context())
            .unwrap();
        assert_eq!(execution.properties["jump_force"], 5.0);
        assert_eq!(
            execution.commands,
            vec![ScriptCommand::ApplyImpulse { x: 0.0, y: 1.25 }]
        );
        assert_eq!(execution.logs[0].message, "jump Player");
    }

    // 验证全局初始化只执行一次且导出状态修改被保留。
    #[test]
    fn lifecycle_runs_global_initialization_once_and_retains_export_changes() {
        let source = r#"
            @export let counter = 0;
            score_add(1.0);
            fn update(dt) { counter += 1; }
        "#;
        let execution = ScriptRuntime::new()
            .execute(source, "update", context())
            .unwrap();
        assert_eq!(
            execution.commands,
            vec![ScriptCommand::ScoreAdd { value: 1.0 }]
        );
        assert_eq!(execution.properties["counter"], 1);

        let mut next_context = context();
        next_context.properties = execution.properties;
        let mut cached = ScriptRuntime::new();
        cached.upsert("counter", source).unwrap();
        let next = cached
            .execute_cached("counter", "update", next_context)
            .unwrap();
        assert_eq!(next.commands, vec![ScriptCommand::ScoreAdd { value: 1.0 }]);
        assert_eq!(next.properties["counter"], 2);
    }

    // 验证向量和数据对象导出值可跨越可视脚本桥接。
    #[test]
    fn exported_graph_values_cross_the_sandbox_boundary() {
        let source = r#"
            @export(type="vec2") let direction = [2.0, -1.0];
            @export(type="data") let payload = #{ "score": 7, "ready": true };
            @export(type="data") let optional = ();
            fn start() { }
        "#;
        let runtime = ScriptRuntime::new();
        let exports = runtime.validate(source).expect("graph exports validate");
        assert_eq!(exports.len(), 3);
        let execution = runtime
            .execute(source, "start", context())
            .expect("graph exports execute");
        assert_eq!(
            execution.properties["direction"],
            serde_json::json!([2.0, -1.0])
        );
        assert_eq!(execution.properties["payload"]["score"], 7);
        assert_eq!(execution.properties["optional"], Value::Null);
    }

    // 验证图追踪命令有界并采用前端预期的驼峰字段。
    #[test]
    fn graph_trace_commands_are_bounded_and_use_the_camel_case_bridge() {
        let source = r#"
            fn start() {
                __nova_graph_trace("graph-1", "routine-1", "node-1", "edge-1", 99, #{ score: 7, ready: true });
            }
        "#;
        let execution = ScriptRuntime::new()
            .execute(source, "start", context())
            .expect("graph trace executes inside the sandbox");
        assert!(matches!(
            execution.commands.first(),
            Some(ScriptCommand::GraphTrace {
                graph_uuid,
                scope_uuid,
                node_uuid,
                edge_uuid,
                depth,
                values,
                ..
            }) if graph_uuid == "graph-1"
                && scope_uuid == "routine-1"
                && node_uuid == "node-1"
                && edge_uuid == "edge-1"
                && *depth == 32
                && values["score"] == 7
                && values["ready"] == true
        ));
        let serialized = serde_json::to_value(&execution.commands[0])
            .expect("graph trace serializes for the TypeScript bridge");
        assert_eq!(serialized["type"], "graphTrace");
        assert_eq!(serialized["graphUuid"], "graph-1");
        assert_eq!(serialized["scopeUuid"], "routine-1");
        assert_eq!(serialized["nodeUuid"], "node-1");
        assert_eq!(serialized["edgeUuid"], "edge-1");
        assert!(serialized.get("durationMicros").is_some());
        assert!(serialized.get("graph_uuid").is_none());
    }

    // 验证动画和音频命令按契约输出到宿主。
    #[test]
    fn animation_and_audio_commands_cross_the_sandbox_boundary() {
        let source = r#"
            fn update(dt) {
                animator_set_bool("moving", true);
                animator_set_float("speed", dt);
                animator_set_integer("direction", 2);
                animator_trigger("jump");
                animator_play("Run");
                audio_play();
                audio_pause();
                audio_stop();
            }
        "#;
        let execution = ScriptRuntime::new()
            .execute(source, "update", context())
            .unwrap();
        assert_eq!(
            execution.commands,
            vec![
                ScriptCommand::AnimatorSetBool {
                    name: "moving".into(),
                    value: true
                },
                ScriptCommand::AnimatorSetFloat {
                    name: "speed".into(),
                    value: 0.25
                },
                ScriptCommand::AnimatorSetInteger {
                    name: "direction".into(),
                    value: 2
                },
                ScriptCommand::AnimatorTrigger {
                    name: "jump".into()
                },
                ScriptCommand::AnimatorPlay {
                    state: "Run".into()
                },
                ScriptCommand::AudioPlay,
                ScriptCommand::AudioPause,
                ScriptCommand::AudioStop,
            ]
        );
    }

    // 26.44: crossfade, tweens, drop-through and the Animator/character reads.
    #[test]
    fn target_joint_and_surface_commands() {
        let source = r#"
            fn update(dt) {
                target_joint_move(2.5, -1.0);
                target_joint_move(1.0 / 0.0, 3.0);
                target_joint_release();
                set_surface_speed(1.5);
                set_surface_speed(1e9);
            }
        "#;
        let execution = ScriptRuntime::new()
            .execute(source, "update", context())
            .unwrap();
        assert_eq!(
            execution.commands,
            vec![
                ScriptCommand::TargetJointMove { x: 2.5, y: -1.0 },
                ScriptCommand::TargetJointRelease,
                ScriptCommand::SetSurfaceSpeed { speed: 1.5 },
                ScriptCommand::SetSurfaceSpeed { speed: 1.0e4 },
            ]
        );
        let json = serde_json::to_string(&execution.commands[0]).unwrap();
        assert_eq!(json, r#"{"type":"targetJointMove","x":2.5,"y":-1.0}"#);
    }

    // 26.46: post-processing values, servos and explosions become commands; bad input is dropped.
    #[test]
    fn effects_servo_and_explosion_commands() {
        let source = r#"
            fn update(dt) {
                post_set("Bloom", 0.8);
                post_set("vignette", 0.4, 120.0);
                post_pulse("exposure", 0.5, 0.25);
                post_pulse("exposure", 0.5, 0.0);
                post_reset();
                joint_servo(45.0);
                joint_servo_off();
                explode(1.0, 2.0, 3.0, 40.0);
                explode(1.0, 2.0, -3.0, 40.0);
            }
        "#;
        let execution = ScriptRuntime::new()
            .execute(source, "update", context())
            .unwrap();
        assert_eq!(
            execution.commands,
            vec![
                ScriptCommand::PostSet {
                    name: "bloom".into(),
                    value: 0.8,
                    seconds: 0.0
                },
                ScriptCommand::PostSet {
                    name: "vignette".into(),
                    value: 0.4,
                    seconds: 60.0
                },
                ScriptCommand::PostPulse {
                    name: "exposure".into(),
                    amount: 0.5,
                    seconds: 0.25
                },
                ScriptCommand::PostReset,
                ScriptCommand::JointServo {
                    enabled: true,
                    target: 45.0
                },
                ScriptCommand::JointServo {
                    enabled: false,
                    target: 0.0
                },
                ScriptCommand::Explode {
                    x: 1.0,
                    y: 2.0,
                    radius: 3.0,
                    impulse: 40.0
                },
            ]
        );
        let json = serde_json::to_string(&execution.commands[6]).unwrap();
        assert_eq!(
            json,
            r#"{"type":"explode","x":1.0,"y":2.0,"radius":3.0,"impulse":40.0}"#
        );
    }

    // 26.46: rhythm charts — the snapshot is readable and control calls become commands.
    #[test]
    fn rhythm_snapshot_and_commands() {
        let source = r#"
            fn update(dt) {
                if rhythm_combo() == 42 && rhythm_state() == "playing" && rhythm_count("perfect") == 40 {
                    rhythm_pause();
                }
                let stats = rhythm_stats();
                if stats.full_combo == false && stats.miss == 2 { rhythm_seek(12.5); }
                rhythm_set_offset(5000.0);
                rhythm_set_autoplay(true);
                rhythm_play();
                rhythm_set_calibration(-32.0);
                rhythm_seek(1.0 / 0.0);
            }
        "#;
        let mut context = context();
        context.rhythm.state = "playing".into();
        context.rhythm.combo = 42.0;
        context.rhythm.perfect = 40.0;
        context.rhythm.miss = 2.0;
        let execution = ScriptRuntime::new()
            .execute(source, "update", context)
            .unwrap();
        let rhythm = |action: &str, value: f64| ScriptCommand::Rhythm {
            action: action.into(),
            value,
        };
        assert_eq!(
            execution.commands,
            vec![
                rhythm("pause", 0.0),
                rhythm("seek", 12.5),
                rhythm("offset", 1000.0),
                rhythm("autoplay", 1.0),
                rhythm("play", 0.0),
                rhythm("calibration", -32.0),
                rhythm("seek", 0.0),
            ]
        );
        let json = serde_json::to_string(&execution.commands[0]).unwrap();
        assert_eq!(json, r#"{"type":"rhythm","action":"pause","value":0.0}"#);
        // A script without a chart reads an idle, empty snapshot.
        let idle = ScriptRuntime::new()
            .execute(
                "fn update(dt) { if rhythm_state() == \"idle\" && rhythm_score() == 0 { rhythm_stop(); } }",
                "update",
                super::tests::context(),
            )
            .unwrap();
        assert_eq!(idle.commands, vec![rhythm("stop", 0.0)]);
    }

    // 26.47: a note's object reads its note; the game judges custom notes.
    #[test]
    fn rhythm_notes_and_judgements() {
        let source = r#"
            fn update(dt) {
                let note = rhythm_my_note();
                if note != () && note.type == "mine" && note.data.damage == 3 {
                    rhythm_judge(note.id, "MISS");
                    rhythm_judge(note.id + 1, 25.5);
                    rhythm_judge(9, "nonsense");
                    rhythm_set_visual_offset(900.0);
                    if rhythm_visual_offset() == 12.0 { rhythm_judge(10, 1.0 / 0.0); }
                }
            }
        "#;
        let mut context = context();
        context.rhythm.visual_offset_ms = 12.0;
        context.rhythm.note = Some(
            serde_json::json!({ "id": 4, "type": "mine", "beat": 6.0, "data": { "damage": 3 } }),
        );
        let execution = ScriptRuntime::new()
            .execute(source, "update", context)
            .unwrap();
        let judge = |note: i64, judgement: &str, offset_ms: f64| ScriptCommand::RhythmJudge {
            note,
            judgement: judgement.into(),
            offset_ms,
        };
        assert_eq!(
            execution.commands,
            vec![
                judge(4, "miss", 0.0),
                judge(5, "", 25.5),
                judge(9, "miss", 0.0),
                ScriptCommand::Rhythm {
                    action: "visual".into(),
                    value: 500.0
                },
                judge(10, "", 10_000.0),
            ]
        );
        assert_eq!(
            serde_json::to_string(&execution.commands[1]).unwrap(),
            r#"{"type":"rhythmJudge","note":5,"judgement":"","offsetMs":25.5}"#
        );
        // An object that is not a note reads ().
        let plain = ScriptRuntime::new()
            .execute(
                "fn update(dt) { if rhythm_my_note() == () { rhythm_stop(); } }",
                "update",
                context_plain(),
            )
            .unwrap();
        assert_eq!(plain.commands.len(), 1);
    }

    fn context_plain() -> ScriptContext {
        context()
    }

    // 26.45: camera and screen effects.
    #[test]
    fn camera_and_flash_commands() {
        let source = r#"
            fn update(dt) {
                camera_shake(0.4);
                camera_shake(7.0);
                camera_zoom(2.0);
                camera_zoom(-1.0);
                camera_follow(find_entity_handle("Target"));
                camera_follow_none();
                screen_flash(255.0, 0.0, 0.0, 0.25);
                screen_flash(255.0, 255.0, 255.0, 0.0);
            }
        "#;
        let mut context = context();
        context.entity_generations.insert("target".into(), 4);
        context.entities.insert("Target".into(), "target".into());
        let execution = ScriptRuntime::new()
            .execute(source, "update", context)
            .unwrap();
        assert_eq!(
            execution.commands,
            vec![
                ScriptCommand::CameraShake { amount: 0.4 },
                ScriptCommand::CameraShake { amount: 1.0 },
                ScriptCommand::CameraZoom { zoom: 2.0 },
                ScriptCommand::CameraFollow {
                    target: "target".into(),
                    generation: 4
                },
                ScriptCommand::CameraFollow {
                    target: String::new(),
                    generation: 0
                },
                ScriptCommand::ScreenFlash {
                    r: 255.0,
                    g: 0.0,
                    b: 0.0,
                    seconds: 0.25
                },
            ]
        );
    }

    // 26.45: rebinding from scripts and device prompts.
    #[test]
    fn input_rebind_reset_and_prompt() {
        let source = r#"
            fn update(dt) {
                input_rebind("Jump");
                input_rebind("Move", 3);
                input_rebind("  ");
                input_bindings_reset();
                log_info(input_prompt("Jump") + "|" + input_prompt("Missing"));
            }
        "#;
        let mut context = context();
        context.input.prompts.insert("Jump".into(), "Space".into());
        let execution = ScriptRuntime::new()
            .execute(source, "update", context)
            .unwrap();
        assert_eq!(
            execution.commands,
            vec![
                ScriptCommand::InputRebind {
                    action: "Jump".into(),
                    index: 0
                },
                ScriptCommand::InputRebind {
                    action: "Move".into(),
                    index: 3
                },
                ScriptCommand::InputBindingsReset,
            ]
        );
        assert!(execution
            .logs
            .iter()
            .any(|log| log.level == "error" && log.message.contains("action name")));
        assert!(execution.logs.iter().any(|log| log.message == "Space|"));
        let json = serde_json::to_string(&execution.commands[1]).unwrap();
        assert_eq!(json, r#"{"type":"inputRebind","action":"Move","index":3}"#);
    }

    #[test]
    fn animator_tween_and_drop_through_commands_and_reads() {
        let source = r#"
            fn update(dt) {
                animator_crossfade("Jump", 0.2);
                tween("x", 3.0, 0.5);
                tween("opacity", 0.0, 1.0, "quad_out");
                tween("rotation", 90.0, 2.0, "back_in_out", #{ delay: 0.5, loops: -1, yoyo: true, relative: true, signal: "spun" });
                tween_stop("x");
                tween_stop();
                character_drop_through();
                character_drop_through(0.4);
                log_info(`${animator_state()}|${animator_state_time()}|${animator_in_transition()}|${character_floor_is_one_way()}`);
            }
        "#;
        let mut context = context();
        context.animator = Some(AnimatorSnapshot {
            state: "Run".into(),
            state_id: "run".into(),
            normalized_time: 0.5,
            in_transition: true,
        });
        context.character = Some(CharacterSnapshot {
            on_floor: true,
            floor_one_way: true,
            ..CharacterSnapshot::default()
        });
        let execution = ScriptRuntime::new()
            .execute(source, "update", context)
            .unwrap();
        let tween = |property: &str, to: f64, seconds: f64, easing: &str| ScriptCommand::Tween {
            target: String::new(),
            generation: 0,
            property: property.into(),
            to,
            seconds,
            easing: easing.into(),
            delay: 0.0,
            loops: 0,
            yoyo: false,
            relative: false,
            signal: String::new(),
        };
        assert_eq!(
            execution.commands,
            vec![
                ScriptCommand::AnimatorCrossfade {
                    state: "Jump".into(),
                    seconds: 0.2
                },
                tween("x", 3.0, 0.5, "linear"),
                tween("opacity", 0.0, 1.0, "quad_out"),
                ScriptCommand::Tween {
                    target: String::new(),
                    generation: 0,
                    property: "rotation".into(),
                    to: 90.0,
                    seconds: 2.0,
                    easing: "back_in_out".into(),
                    delay: 0.5,
                    loops: -1,
                    yoyo: true,
                    relative: true,
                    signal: "spun".into(),
                },
                ScriptCommand::TweenStop {
                    target: String::new(),
                    generation: 0,
                    property: "x".into()
                },
                ScriptCommand::TweenStop {
                    target: String::new(),
                    generation: 0,
                    property: String::new()
                },
                ScriptCommand::CharacterDropThrough { seconds: 0.25 },
                ScriptCommand::CharacterDropThrough { seconds: 0.4 },
            ]
        );
        assert_eq!(
            execution.logs.last().map(|log| log.message.as_str()),
            Some("Run|0.5|true|true")
        );
    }

    // 验证后更新生命周期收到正确渲染时间增量。
    #[test]
    fn late_update_receives_the_render_delta() {
        let source = r#"
            fn late_update(dt) {
                set_position(dt, time_delta());
            }
        "#;
        let execution = ScriptRuntime::new()
            .execute(source, "late_update", context())
            .unwrap();
        assert_eq!(
            execution.commands,
            vec![ScriptCommand::SetPosition { x: 0.25, y: 0.25 }]
        );
    }

    // 验证实体读取使用复制快照及有效组件句柄。
    #[test]
    fn entity_snapshots_use_copied_data_and_safe_component_handles() {
        let mut script_context = context();
        script_context.entity = "player-uuid".into();
        script_context
            .components
            .extend(["Animator".into(), "AudioSource".into()]);
        script_context
            .input
            .vectors
            .insert("Move".into(), [1.0, -0.5]);
        script_context.transform.position = [3.0, 4.0];
        script_context.rigid_body = Some(RigidBodySnapshot {
            velocity: [1.0, 2.0],
            angular_velocity: 0.5,
            mass: 8.0,
            body_type: "Dynamic".into(),
        });
        let source = r#"
            fn update(dt) {
                let pose = transform();
                let body = rigid_body();
                let movement = vector("Move");
                if get_component("RigidBody2D") == "component://player-uuid/RigidBody2D"
                    && animator() == "component://player-uuid/Animator"
                    && audio_source() == "component://player-uuid/AudioSource"
                    && body.valid {
                    set_position(pose.position_x + body.velocity_x * dt + movement.x, pose.position_y + movement.y);
                }
            }
        "#;
        let execution = ScriptRuntime::new()
            .execute(source, "update", script_context)
            .unwrap();
        assert_eq!(
            execution.commands,
            vec![ScriptCommand::SetPosition { x: 4.25, y: 3.5 }]
        );
    }

    // 验证脚本不能导入宿主文件系统等未授权模块。
    #[test]
    fn scripts_cannot_import_host_modules() {
        let error = ScriptRuntime::new()
            .validate("import \"filesystem\";")
            .unwrap_err();
        assert!(
            error.to_lowercase().contains("reserved") || error.to_lowercase().contains("import")
        );
    }

    // 验证存档命令支持标量、数组和映射。
    #[test]
    fn save_commands_support_scalars_arrays_and_maps() {
        let mut script_context = context();
        script_context.save.insert("coins".into(), Value::from(4));
        let source = r#"
            fn update(dt) {
                let next = save_get("coins", 0) + 1;
                save_set("coins", next);
                save_set("checkpoint", [2.0, 3.0]);
                save_set("flags", #{ boss: false, area: "cave" });
                save_commit("slot1");
            }
        "#;
        let execution = ScriptRuntime::new()
            .execute(source, "update", script_context)
            .unwrap();
        assert_eq!(execution.commands.len(), 4);
        assert!(matches!(
            &execution.commands[0],
            ScriptCommand::SaveSet { key, value } if key == "coins" && value == &Value::from(5)
        ));
        assert!(matches!(
            &execution.commands[3],
            ScriptCommand::SaveCommit { slot } if slot == "slot1"
        ));
    }

    // 验证无限运行脚本触发操作预算限制。
    #[test]
    fn runaway_scripts_hit_the_operation_limit() {
        let source = "fn update(dt) { while true { let value = dt * 2.0; } }";
        let error = ScriptRuntime::new()
            .execute(source, "update", context())
            .unwrap_err();
        assert!(error.to_lowercase().contains("operations"));
    }

    // 验证编译失败时缓存仍保留上一有效语法树。
    #[test]
    fn cached_compile_is_atomic_and_keeps_the_previous_valid_ast() {
        let mut runtime = ScriptRuntime::new();
        runtime
            .upsert("player", "fn update(dt) { set_velocity(3.0, 4.0); }")
            .unwrap();
        assert!(runtime.upsert("player", "fn update(dt) {").is_err());
        let result = runtime
            .execute_cached("player", "update", context())
            .unwrap();
        assert!(
            matches!(result.commands.first(), Some(ScriptCommand::SetVelocity { x, y }) if *x == 3.0 && *y == 4.0)
        );
    }

    // 验证信号、任务、类型句柄及断言桥接。
    #[test]
    fn signals_tasks_typed_handles_and_expectations_cross_the_sandbox() {
        let source = r#"
            fn update(dt) {
                let current = entity_handle();
                let missing = find_entity_handle("Nobody");
                expect(current.valid && !missing.valid, "typed handles");
                task_wait("resume", 0.25);
                signal_emit_to(current.id, "player.ready", #{ score: 3 });
            }
        "#;
        let result = ScriptRuntime::new()
            .execute(source, "update", context())
            .unwrap();
        assert!(result.logs.is_empty());
        assert!(result.commands.iter().any(/* 检查事件或命令是否符合当前测试预期：matches ! (command , ScriptCommand :: StartTask { name , seconds } if name == "resume" && * seconds == 0.25)。 */ |command| matches!(command, ScriptCommand::StartTask { name, seconds } if name == "resume" && *seconds == 0.25)));
        assert!(result.commands.iter().any(/* 检查事件或命令是否符合当前测试预期：matches ! (command , ScriptCommand :: EmitSignal { name , target , .. } if name == "player.ready" && target == "entity-1")。 */ |command| matches!(command, ScriptCommand::EmitSignal { name, target, .. } if name == "player.ready" && target == "entity-1")));
    }

    // 验证生命周期末尾可包含有返回值的表达式。
    #[test]
    fn lifecycle_functions_may_end_with_a_value_returning_expression() {
        let source = r#"
            fn test_expectation() {
                expect(true, "the final expression may return a value");
            }
        "#;
        let result = ScriptRuntime::new()
            .execute(source, "test_expectation", context())
            .unwrap();
        assert!(result.logs.is_empty());
    }

    // 验证相同随机种子产生可复现且有界的数值。
    #[test]
    fn seeded_random_numbers_are_repeatable_and_bounded() {
        let source = r#"
            fn update(dt) {
                set_position(random(), random_range(-4.0, 9.0));
            }
        "#;
        let mut seeded = context();
        seeded.random_seed = 0x1234_5678_9abc_def0;
        let first = ScriptRuntime::new()
            .execute(source, "update", seeded.clone())
            .unwrap();
        let second = ScriptRuntime::new()
            .execute(source, "update", seeded)
            .unwrap();
        assert_eq!(first.commands, second.commands);
        assert!(matches!(
            first.commands.first(),
            Some(ScriptCommand::SetPosition { x, y })
                if (0.0..1.0).contains(x) && (-4.0..9.0).contains(y)
        ));
    }

    // 验证第二版导出元数据完整并正确拒绝非法配置。
    #[test]
    fn api_v2_export_metadata_is_complete_and_validated() {
        let source = r#"
            @export(type="float", min=0, max=20, step=0.25, group="Movement", tooltip="Meters per second", serialize=true) let speed = 5.0;
            @export(type="resource", resource="Texture2D", group="Visual", serialize=false) let icon = "asset://texture";
        "#;
        let exports = ScriptRuntime::new().validate(source).unwrap();
        assert_eq!(exports.len(), 2);
        assert_eq!(exports[0].value_type, "float");
        assert_eq!(exports[0].minimum, Some(0.0));
        assert_eq!(exports[0].maximum, Some(20.0));
        assert_eq!(exports[0].step, Some(0.25));
        assert_eq!(exports[0].group, "Movement");
        assert!(exports[0].serialized);
        assert_eq!(exports[1].resource_type.as_deref(), Some("Texture2D"));
        assert!(!exports[1].serialized);
        assert!(ScriptRuntime::new()
            .validate("@export(min=10,max=1) let broken = 2.0;")
            .is_err());
    }

    // 浮点导出属性在 JSON 里是整数写法时，也必须以浮点注入。
    // 否则 set_velocity(i64, f64) 找不到只接受 f64 的物理绑定，出厂 top-down 模板的 Enemy 脚本即会报错。
    #[test]
    fn integral_json_value_for_float_export_is_injected_as_float() {
        let mut runtime = ScriptRuntime::new();
        runtime
            .upsert(
                "enemy",
                "@export(type=\"float\", group=\"AI\") let patrol_speed = 2.0;\nfn fixed_update(dt) { set_velocity(patrol_speed, 0.0); }",
            )
            .unwrap();
        // 首次执行只做初始化；导出属性注入发生在实例已初始化之后。
        let first = runtime
            .execute_instance("enemy", "fixed_update", 1, 11, live_context("enemy-1", 11))
            .unwrap();
        let mut injected = live_context("enemy-1", 11);
        injected.properties = first.properties;
        // 模拟文档保存后的整数写法：2.0 经 JSON 往返变成 2。
        injected
            .properties
            .insert("patrol_speed".into(), Value::from(2));
        let second = runtime
            .execute_instance("enemy", "fixed_update", 1, 11, injected)
            .unwrap();
        assert!(
            second
                .logs
                .iter()
                .all(|log| !log.message.contains("Function not found")),
            "an integral JSON value for a float export must not break f64 physics bindings: {:?}",
            second.logs
        );
        assert!(
            matches!(
                second.commands.first(),
                Some(ScriptCommand::SetVelocity { x, y }) if (*x - 2.0).abs() < 1e-9 && y.abs() < 1e-9
            ),
            "patrol_speed must reach the binding as 2.0, saw {:?}",
            second.commands
        );
    }

    // 验证稳定句柄和第二版接口仍遵守沙箱命令边界。
    #[test]
    fn stable_handles_and_api_v2_domains_are_sandboxed_commands() {
        let mut script_context = context();
        script_context
            .components
            .extend(["Text".into(), "NavigationAgent2D".into()]);
        let source = r#"
            fn update(dt) {
                let current = entity_handle();
                let texture = resource_handle("asset://texture", "Texture2D");
                expect(api_version() == 2 && api_current_version() == 2 && api_minimum_version() == 1 && current.generation > 0 && texture.valid, "v2 handles");
                log_info("ready");
                ui_set_text("Score: 3");
                ui_set_value(0.75);
                navigation_set_target(4.0, 6.0);
            }
        "#;
        let execution = ScriptRuntime::new()
            .execute(source, "update", script_context)
            .unwrap();
        assert_eq!(execution.logs[0].message, "ready");
        assert!(matches!(
            execution.commands[0],
            ScriptCommand::UiSetText { .. }
        ));
        assert!(
            matches!(execution.commands[1], ScriptCommand::UiSetValue { value } if value == 0.75)
        );
        assert!(
            matches!(execution.commands[2], ScriptCommand::NavigationSetTarget { x, y } if x == 4.0 && y == 6.0)
        );
    }

    // 验证动态实体、游戏流程和高级输入接口的边界。
    #[test]
    fn dynamic_object_game_flow_and_advanced_input_api_are_bounded() {
        let mut script_context = context();
        script_context.scene_entities = vec![SceneEntitySnapshot {
            uuid: "enemy-1".into(),
            generation: 0,
            name: "Enemy".into(),
            enabled: true,
            tags: vec!["enemy".into()],
            groups: vec!["actors".into()],
            components: vec!["Health2D".into()],
            position: [4.0, 2.0],
        }];
        script_context.input.performed.insert("Fire".into(), true);
        script_context
            .input
            .phases
            .insert("Fire".into(), "performed".into());
        script_context.input.durations.insert("Fire".into(), 0.4);
        script_context.input.contexts.push("Combat".into());
        script_context.input.maps.push("Default".into());
        script_context.input.scheme = "Gamepad".into();
        script_context.game_flow.score = 12.0;
        script_context.game_flow.checkpoints.push("start".into());
        script_context
            .game_flow
            .session
            .insert("wave".into(), Value::from(2));
        let source = r#"
            fn update(dt) {
                let targets = query_tag("enemy", 9999);
                expect(targets.len == 1 && input_performed("Fire") && input_phase("Fire") == "performed"
                    && input_duration("Fire") == 0.4 && input_context_active("Combat") && input_map_active("Default")
                    && input_scheme() == "Gamepad" && score_get() == 12.0
                    && checkpoint_has("start") && session_get("wave", 0) == 2, "v5.4 reads");
                let created = spawn_at("asset://bullet", 1.0, 2.0, 0.25, 1.0, 1.0);
                entity_set_position(created, 3.0, 4.0);
                entity_add_tag(targets[0], "targeted");
                component_set_enabled_on(targets[0], "Health2D", false);
                game_pause(true); score_add(5.0); checkpoint_set("combat");
                session_set("wave", 3); input_context_push("Menu", 100, true);
                input_context_pop("Menu"); input_map_enable("Combat"); input_map_disable("Combat"); input_scheme_set("KeyboardMouse");
            }
        "#;
        let execution = ScriptRuntime::new()
            .execute(source, "update", script_context)
            .expect("v5.4 gameplay API executes");
        assert!(execution.logs.is_empty());
        assert!(
            matches!(&execution.commands[0], ScriptCommand::SpawnAt { pending_id, prefab, .. } if pending_id == "pending:entity-1:0:1" && prefab == "asset://bullet")
        );
        assert!(
            matches!(&execution.commands[1], ScriptCommand::TargetSetPosition { target, .. } if target == "pending:entity-1:0:1")
        );
        assert!(
            matches!(&execution.commands[2], ScriptCommand::TargetAddTag { target, tag, .. } if target == "enemy-1" && tag == "targeted")
        );
        assert!(execution
            .commands
            .iter()
            .any(/* 检查事件或命令是否符合当前测试预期：matches ! (command , ScriptCommand :: GamePause { paused : true })。 */ |command| matches!(command, ScriptCommand::GamePause { paused: true })));
        assert!(execution.commands.iter().any(/* 检查事件或命令是否符合当前测试预期：matches ! (command , ScriptCommand :: InputContextPush { name , priority : 100 , consume : true } if name == "Menu")。 */ |command| matches!(command, ScriptCommand::InputContextPush { name, priority: 100, consume: true } if name == "Menu")));
        let serialized = serde_json::to_value(&execution.commands[1]).expect("command bridge");
        assert_eq!(serialized["type"], "targetSetPosition");
        assert!(serialized.get("generation").is_some());
    }

    // 验证实体生命周期代数在读取、查询与命令间保持一致。
    #[test]
    fn entity_lifetime_generations_cross_reads_queries_and_commands() {
        let mut script_context = context();
        script_context.entity_generations =
            BTreeMap::from([("entity-1".into(), 41), ("enemy-1".into(), 73)]);
        script_context
            .entities
            .insert("Enemy".into(), "enemy-1".into());
        script_context.scene_entities = vec![SceneEntitySnapshot {
            uuid: "enemy-1".into(),
            generation: 73,
            name: "Enemy".into(),
            enabled: true,
            tags: vec!["enemy".into()],
            groups: vec![],
            components: vec![],
            position: [4.0, 2.0],
        }];
        let execution = ScriptRuntime::new().execute(r#"
            fn update(dt) {
                expect(entity_handle().generation == 41, "self lifetime");
                let found = find_entity_handle("Enemy");
                let queried = query_tag("enemy", 1)[0];
                expect(found.generation == 73 && queried.generation == 73, "target lifetime");
                expect(entity_name_on(found) == "Enemy" && entity_position_x_on(queried) == 4.0, "fresh query");
                let stale = found; stale.generation = 72;
                expect(entity_name_on(stale) == "" && !entity_enabled_on(stale), "stale query rejected");
                entity_set_position(found, 3.0, 5.0);
            }
        "#, "update", script_context).unwrap();
        assert!(execution.logs.is_empty());
        assert!(
            matches!(&execution.commands[0], ScriptCommand::TargetSetPosition { generation: 73, target, .. } if target == "enemy-1")
        );
    }

    // 验证不同回调中待生成实体句柄不会冲突。
    #[test]
    fn pending_spawn_handles_are_unique_across_callback_invocations() {
        let source = r#"fn update(dt) { let item = spawn_at("asset://bullet", 0.0, 0.0, 0.0, 1.0, 1.0); entity_set_position(item, 2.0, 0.0); }"#;
        let mut first = context();
        first.invocation_id = 81;
        let mut second = context();
        second.invocation_id = 82;
        let runtime = ScriptRuntime::new();
        let a = runtime.execute(source, "update", first).unwrap();
        let b = runtime.execute(source, "update", second).unwrap();
        for (execution, expected) in [(&a, "pending:entity-1:81:1"), (&b, "pending:entity-1:82:1")]
        {
            assert!(
                matches!(&execution.commands[0], ScriptCommand::SpawnAt { pending_id, .. } if pending_id == expected)
            );
            assert!(
                matches!(&execution.commands[1], ScriptCommand::TargetSetPosition { target, generation, .. } if target == expected && *generation == handle_generation(expected))
            );
        }
    }

    // 验证缺少新生命周期元数据的旧上下文仍可反序列化。
    #[test]
    fn legacy_context_omitting_lifetime_metadata_still_deserializes() {
        let old: ScriptContext =
            serde_json::from_value(serde_json::json!({ "entity": "legacy" })).unwrap();
        assert_eq!(old.invocation_id, 0);
        assert!(old.entity_generations.is_empty());
        let execution = ScriptRuntime::new()
            .execute(
                "fn start(){ let h = entity_handle(); entity_set_position(h, 1.0, 2.0); }",
                "start",
                old,
            )
            .unwrap();
        assert!(
            matches!(execution.commands[0], ScriptCommand::TargetSetPosition { generation, .. } if generation == handle_generation("legacy"))
        );
    }

    // 验证旧别名只发出一次兼容警告。
    #[test]
    fn deprecated_aliases_emit_one_compatibility_warning() {
        let execution = ScriptRuntime::new()
            .execute(
                "fn update(dt) { if is_down(\"Jump\") { print(\"held\"); } }",
                "update",
                context(),
            )
            .unwrap();
        assert_eq!(execution.logs.len(), 1);
        assert!(execution.logs[0].message.contains("NOVA-SCRIPT-DEPRECATED"));
        assert!(execution.logs[0].message.contains("input_down"));
    }

    // 验证第二版全部宿主绑定可在沙箱执行。
    #[test]
    fn every_api_v2_host_binding_executes_inside_the_sandbox() {
        let mut script_context = context();
        script_context.components = vec![
            "RigidBody2D".into(),
            "Animator".into(),
            "AudioSource".into(),
            "CharacterBody2D".into(),
            "Text".into(),
            "NavigationAgent2D".into(),
        ];
        script_context
            .entities
            .insert("Player".into(), "entity-1".into());
        script_context.input.down.insert("Move".into(), true);
        script_context.input.released.insert("Move".into(), true);
        script_context.input.axes.insert("Move".into(), 0.5);
        script_context
            .input
            .vectors
            .insert("Move".into(), [0.5, -0.25]);
        script_context.input.mouse_world_position = [3.25, -4.5];
        script_context.input.view_bounds = [-12.0, 12.0, -7.0, 7.0];
        script_context.input.viewport_size = [1920.0, 1080.0];
        script_context.rigid_body = Some(RigidBodySnapshot {
            velocity: [1.0, 2.0],
            angular_velocity: 0.25,
            mass: 2.0,
            body_type: "Dynamic".into(),
        });
        script_context.character = Some(CharacterSnapshot {
            on_floor: true,
            can_coyote_jump: true,
            floor_normal: [0.0, -1.0],
            platform_velocity: [1.0, 0.0],
            ..CharacterSnapshot::default()
        });
        let source = r#"
            fn update(dt) {
                let h0 = entity_handle(); let h1 = find_entity_handle("Player"); let h2 = component_handle("RigidBody2D");
                let h3 = animator_handle(); let h4 = audio_source_handle(); let h5 = resource_handle("asset://texture", "Texture2D");
                expect(api_version() == 2 && api_current_version() == 2 && api_minimum_version() == 1 && api_namespace("scene_load") == "scene" && h0.valid && h1.valid && h2.valid && h3.valid && h4.valid && h5.valid, "handles");
                entity(); entity_name(); find_entity("Player"); has_component("RigidBody2D"); get_component("RigidBody2D"); transform(); rigid_body(); animator(); audio_source();
                input_down("Move"); input_pressed("Jump"); input_released("Move"); input_axis("Move"); input_vector("Move"); input_vector_x("Move"); input_vector_y("Move"); mouse_x(); mouse_y(); wheel_x(); wheel_y();
                expect(mouse_world_x() == 3.25 && mouse_world_y() == -4.5 && view_min_x() == -12.0 && view_max_x() == 12.0 && view_min_y() == -7.0 && view_max_y() == 7.0 && viewport_width() == 1920.0 && viewport_height() == 1080.0, "world pointer input");
                time(); time_delta(); time_fixed_delta(); time_elapsed(); time_scale(); time_frame(); random(); random_range(0.0, 1.0);
                apply_force(1.0, 2.0); apply_impulse(1.0, 2.0); set_velocity(1.0, 2.0); set_position(1.0, 2.0); set_rotation(0.5); set_scale(1.0, 1.0); set_angular_velocity(0.5);
                character_is_on_floor(); character_is_on_wall(); character_is_on_ceiling(); can_coyote_jump(); character_floor_normal_x(); character_floor_normal_y(); character_floor_normal(); character_platform_velocity_x(); character_platform_velocity_y(); character_platform_velocity(); move_character(1.0, 0.0);
                animator_set_bool("moving", true); animator_set_float("speed", 1.0); animator_set_integer("state", 1); animator_trigger("jump"); animator_play("Run");
                audio_play(); audio_pause(); audio_stop(); ui_set_text("Ready"); ui_set_value(0.5); navigation_set_target(4.0, 2.0);
                instantiate("asset://prefab"); timer_start("timer", 0.1, false); timer_pause("timer"); timer_resume("timer"); timer_cancel("timer"); task_wait("task", 0.1); task_cancel("task");
                signal_emit("ready", true); signal_emit_to(entity(), "ready", #{ value: 1 });
                save_has("score"); save_get("score", 0); save_set("score", 1); save_delete("score"); save_clear(); save_load("slot"); save_commit("slot");
                log_debug("debug"); log_info("info"); log_warning("warning"); log_error("expected diagnostic");
                scene_load("Main"); scene_reload(); scene_quit(); despawn(); destroy();
            }
        "#;
        let execution = ScriptRuntime::new()
            .execute(source, "update", script_context)
            .unwrap();
        assert!(execution.commands.len() > 30);
        assert!(execution.logs.iter().any(
            /* 在当前宏表达式中计算 log . level == "debug"，供查询映射、过滤或断言使用。 */
            |log| log.level == "debug"
        ));
        assert!(execution.logs.iter().any(
            /* 在当前宏表达式中计算 log . level == "warning"，供查询映射、过滤或断言使用。 */
            |log| log.level == "warning"
        ));
    }

    // 验证第一版上下文通过适配器继续可用。
    #[test]
    fn api_v1_context_remains_available_through_the_v2_adapter() {
        let mut script_context = context();
        script_context.api_version = 1;
        let execution = ScriptRuntime::new()
            .execute(
                "fn update(dt) { expect(api_version() == 1 && api_current_version() == 2, \"v1 adapter\"); input_down(\"Move\"); }",
                "update",
                script_context,
            )
            .unwrap();
        assert!(!execution.logs.iter().any(
            /* 在当前宏表达式中计算 log . level == "error"，供查询映射、过滤或断言使用。 */
            |log| log.level == "error"
        ));
    }

    // 验证编辑器自动化需明确授权、有界且对游戏禁用。
    #[test]
    fn editor_automation_is_explicit_bounded_and_disabled_for_games() {
        let source = r#"
            fn run() {
                expect(editor_automation(), "automation context");
                let selected = editor_selected();
                expect(editor_selected_count() == 1 && selected.len == 1, "selection snapshot");
                editor_rename(selected[0], "Renamed safely");
                editor_select(selected[0]);
                editor_create_box("Generated box", 2.0, 3.0, 4.0, 5.0);
                editor_create_text_asset("Assets/Automation/readme.data", "dataTable", "safe local output");
            }
        "#;
        let mut automation = context();
        automation.editor_automation = true;
        automation.editor_selection = vec![automation.entity.clone()];
        let execution = ScriptRuntime::new()
            .execute(source, "run", automation)
            .unwrap();
        assert_eq!(execution.commands.len(), 4);
        assert!(
            matches!(&execution.commands[0], ScriptCommand::EditorRename { name, .. } if name == "Renamed safely")
        );
        assert!(matches!(
            &execution.commands[1],
            ScriptCommand::EditorSelect { .. }
        ));
        assert!(
            matches!(&execution.commands[2], ScriptCommand::EditorCreateEntity { shape, width, height, .. } if shape == "Box" && *width == 4.0 && *height == 5.0)
        );
        assert!(
            matches!(&execution.commands[3], ScriptCommand::EditorCreateTextAsset { path, .. } if path == "Assets/Automation/readme.data")
        );

        let mut game = context();
        game.editor_selection = vec![game.entity.clone()];
        let disabled = ScriptRuntime::new().execute(
            "fn run() { let selected = editor_selected(); expect(!editor_automation() && selected.len == 0 && !editor_create_box(\"Nope\", 0.0, 0.0, 1.0, 1.0), \"disabled\"); }",
            "run",
            game,
        ).unwrap();
        assert!(disabled.commands.is_empty());
    }

    // 验证过量宿主命令输出被沙箱拒绝。
    #[test]
    fn sandbox_rejects_unbounded_host_command_output() {
        let error = ScriptRuntime::new()
            .execute(
                "fn update(dt) { for value in 0..5000 { score_add(1.0); } }",
                "update",
                context(),
            )
            .expect_err("command flood must stop inside the sandbox");
        assert!(error.contains("too many host commands"), "{error}");
    }

    // 验证脚本自建集合不能超过资源上限。
    #[test]
    fn sandbox_limits_script_owned_collections() {
        let error = ScriptRuntime::new()
            .execute(
                "fn update(dt) { let values = []; for value in 0..9000 { values.push(value); } }",
                "update",
                context(),
            )
            .expect_err("oversized script array must be rejected");
        assert!(error.to_lowercase().contains("array"), "{error}");
    }

    // 验证自定义事件获得所属事件族参数，并兼容零参数旧回调。
    #[test]
    fn custom_event_callbacks_receive_family_arguments_and_keep_zero_arg_compatibility() {
        let runtime = ScriptRuntime::new();
        for (family, source, expected) in [
            ("on_task", "fn custom(name) { log_info(name); }", "task"),
            ("on_timer", "fn custom(name) { log_info(name); }", "task"),
            (
                "on_signal",
                "fn custom(name, payload, source) { log_info(name + payload.n + source); }",
                "task7sender",
            ),
            ("on_task", "fn custom() { log_info(\"legacy\"); }", "legacy"),
        ] {
            let mut input = context();
            input.callback_kind = family.into();
            input.event = Some(EventSnapshot {
                name: "task".into(),
                source: "sender".into(),
                payload: serde_json::json!({"n":7}),
            });
            let result = runtime.execute(source, "custom", input).unwrap();
            assert_eq!(result.logs[0].message, expected);
        }
        let mut input = context();
        input.callback_kind = "update".into();
        input.time.delta = 0.25;
        assert!(runtime
            .execute(
                "fn custom(dt) { expect(dt == 0.25, \"delta\"); }",
                "custom",
                input
            )
            .unwrap()
            .logs
            .is_empty());
    }

    // 验证直接或函数指针调用的阻塞睡眠均被拒绝。
    #[test]
    fn sandbox_rejects_blocking_sleep_including_function_pointers() {
        let runtime = ScriptRuntime::new();
        for source in [
            "fn update(dt) { sleep(0); }",
            "fn update(dt) { sleep(0.0); }",
            "fn update(dt) { Fn(\"sleep\").call(0); }",
            "fn update(dt) { Fn(\"sleep\").call(0.0); }",
        ] {
            let error = runtime
                .execute(source, "update", context())
                .expect_err("direct and indirect sleep must never block a VM callback");
            assert!(error.to_lowercase().contains("sleep"), "{error}");
        }
    }

    // 验证候选缓存共享不可变程序而不修改正在运行的代数。
    #[test]
    fn candidate_cache_shares_immutable_programs_without_mutating_live_generation() {
        let mut live = ScriptRuntime::new();
        live.upsert("changed", "fn start(){print(1);}").unwrap();
        live.upsert("unchanged", "fn start(){print(10);}").unwrap();
        let mut candidate = live.clone();
        assert!(Rc::ptr_eq(
            &live.scripts["changed"],
            &candidate.scripts["changed"]
        ));
        assert!(Rc::ptr_eq(
            &live.scripts["unchanged"],
            &candidate.scripts["unchanged"]
        ));
        candidate
            .upsert("changed", "fn start(){print(2);}")
            .unwrap();
        assert!(!Rc::ptr_eq(
            &live.scripts["changed"],
            &candidate.scripts["changed"]
        ));
        assert!(Rc::ptr_eq(
            &live.scripts["unchanged"],
            &candidate.scripts["unchanged"]
        ));
        assert_eq!(
            live.execute_cached("changed", "start", context())
                .unwrap()
                .logs[0]
                .message,
            "1"
        );
        assert_eq!(
            candidate
                .execute_cached("changed", "start", context())
                .unwrap()
                .logs[0]
                .message,
            "2"
        );
        assert!(candidate.upsert("changed", "fn start( {").is_err());
        assert_eq!(
            candidate
                .execute_cached("changed", "start", context())
                .unwrap()
                .logs[0]
                .message,
            "2"
        );
        assert!(candidate.remove("unchanged"));
        assert!(live.execute_cached("unchanged", "start", context()).is_ok());
        drop(live);
        assert_eq!(
            candidate
                .execute_cached("changed", "start", context())
                .unwrap()
                .logs[0]
                .message,
            "2"
        );
    }

    // 验证嵌套导出默认值和空状态往返时不被后备值覆盖。
    #[test]
    fn nested_export_defaults_and_null_state_round_trip_without_fallback() {
        let source = "@export let bag = [#{\"coins\": 1, \"empty\": null}];\n@export let missing = null;\nfn start(){bag[0].coins+=4;missing=();}";
        let runtime = ScriptRuntime::new();
        let first = runtime.execute(source, "start", context()).unwrap();
        assert_eq!(
            first.properties["bag"],
            serde_json::json!([{"coins":5,"empty":null}])
        );
        assert_eq!(first.properties["missing"], Value::Null);
        let mut next = context();
        next.properties = first.properties;
        let second = runtime.execute(source, "start", next).unwrap();
        assert_eq!(
            second.properties["bag"],
            serde_json::json!([{"coins":9,"empty":null}])
        );
        assert!(dynamic_to_json(Dynamic::UNIT).unwrap().is_null());
        assert!(dynamic_to_json(Dynamic::from(rhai::FnPtr::new("start").unwrap())).is_none());
    }

    // 验证相同源码复用缓存，导出元数据改变时正确失效。
    #[test]
    fn compiled_cache_reuses_equal_content_and_invalidates_export_metadata() {
        let mut runtime = ScriptRuntime::new();
        let source = "@export(min=0) let count = 1;\nfn start(){count+=1;}";
        runtime.upsert("same", source).unwrap();
        let original = Rc::clone(&runtime.scripts["same"]);
        runtime.upsert("same", source).unwrap();
        assert!(Rc::ptr_eq(&original, &runtime.scripts["same"]));
        runtime
            .upsert("same", &source.replace("min=0", "min=1"))
            .unwrap();
        assert!(!Rc::ptr_eq(&original, &runtime.scripts["same"]));
        assert_eq!(
            runtime.scripts["same"].prepared.exports[0].minimum,
            Some(1.0)
        );
        assert!(parse_export_value("#{value: print(1)}").is_none());
        assert_eq!(
            parse_export_value("#{text: \"#{} ()\", nested: [#{value: ()}]}"),
            Some(serde_json::json!({"text":"#{} ()","nested":[{"value":null}]}))
        );
    }
}
