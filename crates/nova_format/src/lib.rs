// 工程格式边界：定义版本、迁移历史、资源及组件校验，并保留兼容性回归测试。
#![recursion_limit = "512"]
//! Central ownership of Nova_A's persisted project format and migrations.

use std::collections::{BTreeMap, HashMap};
use std::fmt;

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

pub const PROJECT_FORMAT_NAME: &str = "Nova_A Project Format 2";
pub const PROJECT_FORMAT_MAJOR: u32 = 2;
pub const CURRENT_FORMAT_VERSION: u32 = 29;
pub const MINIMUM_SUPPORTED_FORMAT_VERSION: u32 = 5;
pub const CURRENT_ENGINE_VERSION: &str = "26.47.0";

// 建立默认命名物理层，同时保留各层既有位掩码。
fn default_named_physics_layers() -> Value {
    let colors = [
        "#62a8ff", "#ff8c62", "#7bd88f", "#d994ff", "#ffd166", "#5ed4d4", "#ff6b96", "#a9b7c9",
    ];
    Value::Array(
        (0..32)
            .map(
                /* 按层编号建立名称、说明、配色和碰撞位；零号层使用默认世界碰撞语义。 */
                |id| {
                    json!({
                        "id": id,
                        "name": if id == 0 { "Default".into() } else { format!("Layer {id}") },
                        "description": if id == 0 { "Default world collision" } else { "" },
                        "color": colors[id % colors.len()]
                    })
                },
            )
            .collect(),
    )
}

// 为缺省的可选布尔字段提供启用值。
fn default_true() -> bool {
    true
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFile {
    pub project_format: String,
    pub project_format_major: u32,
    pub format_version: u32,
    pub engine_version: String,
    pub compatibility: CompatibilityFile,
    pub manifest: ProjectManifestFile,
    #[serde(default)]
    pub active_scene_uuid: String,
    #[serde(default)]
    pub scenes: Vec<SceneFile>,
    #[serde(default)]
    pub assets: Vec<AssetReference>,
    #[serde(default, flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectManifestFile {
    pub manifest_version: u32,
    pub project_uuid: String,
    pub name: String,
    pub engine_compatibility: EngineCompatibilityFile,
    pub schema_version: u32,
    pub package_lockfile: String,
    #[serde(default)]
    pub build_presets: Vec<String>,
    pub directories: ProjectDirectoriesFile,
    #[serde(default, flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineCompatibilityFile {
    pub minimum: String,
    pub maximum_exclusive: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDirectoriesFile {
    pub source: String,
    pub shared: String,
    pub generated: String,
    pub cache: String,
    pub user_local: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationDescriptor {
    pub from_schema: u32,
    pub to_schema: u32,
    pub name: String,
}

// 返回可按版本追踪的工程迁移登记表。
pub fn migration_registry() -> Vec<MigrationDescriptor> {
    (MINIMUM_SUPPORTED_FORMAT_VERSION..CURRENT_FORMAT_VERSION)
        .map(
            /* 把各历史结构版本映射为紧邻的下一版本迁移描述，并标记相应迁移阶段。 */
            |from_schema| MigrationDescriptor {
                from_schema,
                to_schema: from_schema + 1,
                name: if from_schema == 28 {
                    "build-package-collaboration-freeze".into()
                } else if from_schema == 27 {
                    "world-data-foundation".into()
                } else if from_schema == 26 {
                    "visual-audio-pipeline".into()
                } else if from_schema == 25 {
                    "presentation-layer-foundation".into()
                } else if from_schema == 24 {
                    "scripting-api-v1".into()
                } else if from_schema == 23 {
                    "production-physics-layers".into()
                } else if from_schema == 22 {
                    "authoritative-project-data".into()
                } else {
                    format!("legacy-schema-{from_schema}-projection")
                },
            },
        )
        .collect()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityFile {
    pub format: String,
    pub major: u32,
    pub schema_version: u32,
    pub minimum_schema_version: u32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneFile {
    pub uuid: String,
    #[serde(default)]
    pub name: String,
    #[serde(default = "default_true")]
    pub loaded: bool,
    #[serde(default)]
    pub entities: Vec<EntityFile>,
    #[serde(default)]
    pub connections: Vec<ConnectionFile>,
    #[serde(default, flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityFile {
    pub uuid: String,
    #[serde(default)]
    pub name: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub editor_visible: bool,
    #[serde(default)]
    pub editor_locked: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub components: Vec<ComponentFile>,
    #[serde(default, flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentFile {
    pub uuid: String,
    pub kind: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub removed: bool,
    #[serde(default)]
    pub data: Value,
    #[serde(default, flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionFile {
    pub uuid: String,
    #[serde(default)]
    pub anchors: Vec<Value>,
    #[serde(default, flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetReference {
    pub uuid: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub asset_type: String,
    #[serde(default, flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FormatError(pub String);

impl fmt::Display for FormatError {
    // 将格式错误的内部消息写入标准格式化输出。
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for FormatError {}

// 解析工程 JSON，迁移并校验后重新序列化；错误通过结果返回。
pub fn migrate_project_str(source: &str) -> Result<String, FormatError> {
    let value: Value = serde_json::from_str(source).map_err(
        /* 构造工程格式错误，标明失败条件：invalid project JSON: {error}。 */
        |error| FormatError(format!("invalid project JSON: {error}")),
    )?;
    let migrated = migrate_project_value(value)?;
    serde_json::to_string_pretty(&migrated)
        .map(
            /* 计算并返回 format ! ("{text}\n")，用于当前 migrate_project_str 流程。 */
            |text| format!("{text}\n"),
        )
        .map_err(
            /* 构造工程格式错误，标明失败条件：could not serialize project: {error}。 */
            |error| FormatError(format!("could not serialize project: {error}")),
        )
}

// 将历史工程值逐步迁移为当前结构，保留扩展字段并拒绝不支持的未来版本。
pub fn migrate_project_value(value: Value) -> Result<ProjectFile, FormatError> {
    let mut root = match value {
        Value::Array(entities) => {
            Map::from_iter([(String::from("entities"), Value::Array(entities))])
        }
        Value::Object(root) => root,
        _ => {
            return Err(FormatError(
                "project root must be an object or entity array".into(),
            ))
        }
    };
    let legacy_project_settings = if root.get("scenes").is_some_and(Value::is_array) {
        None
    } else {
        root.remove("projectSettings")
    };
    let read_version = /* 读取结构版本字段；缺省使用历史版本一，已提供值必须是可无损转换的无符号三十二位整数。 */ |field: &str| -> Result<u32, FormatError> {
        match root.get(field) {
            None => Ok(1),
            Some(value) => value
                .as_u64()
                .and_then(/* 按 u32 :: try_from (value) . ok () 读取或转换可选值，保留转换失败分支。 */ |value| u32::try_from(value).ok())
                .ok_or_else(/* 构造工程格式错误，标明失败条件：{field} must be an unsigned 32-bit integer。 */ || FormatError(format!("{field} must be an unsigned 32-bit integer"))),
        }
    };
    let source_version = read_version("formatVersion")?;
    let source_engine_version = root
        .get("engineVersion")
        .and_then(Value::as_str)
        .unwrap_or("legacy")
        .to_owned();
    let source_major = read_version("projectFormatMajor")?;
    if source_major > PROJECT_FORMAT_MAJOR {
        return Err(FormatError(format!(
            "project format major {source_major} is newer than supported major {PROJECT_FORMAT_MAJOR}"
        )));
    }
    if source_version > CURRENT_FORMAT_VERSION {
        return Err(FormatError(format!("project format {source_version} is newer than supported format {CURRENT_FORMAT_VERSION}")));
    }
    if !root.get("scenes").is_some_and(Value::is_array) {
        let assets = root.remove("assets");
        let plugins = root.remove("plugins");
        let packages = root.remove("packages");
        root.remove("formatVersion");
        root.remove("engineVersion");
        root.remove("projectFormat");
        root.remove("projectFormatMajor");
        root.remove("compatibility");
        root.remove("projectMetadata");
        root.remove("activeSceneUuid");
        let mut scene = std::mem::take(&mut root);
        let scene_uuid = deterministic_uuid("nova-a-scene:main");
        scene.insert("uuid".into(), Value::String(scene_uuid.clone()));
        scene.insert("name".into(), Value::String("Main Scene".into()));
        scene.insert("loaded".into(), Value::Bool(true));
        root.insert("activeSceneUuid".into(), Value::String(scene_uuid));
        root.insert("scenes".into(), Value::Array(vec![Value::Object(scene)]));
        if let Some(assets) = assets {
            root.insert("assets".into(), assets);
        }
        if let Some(plugins) = plugins {
            root.insert("plugins".into(), plugins);
        }
        if let Some(packages) = packages {
            root.insert("packages".into(), packages);
        }
        if let Some(settings) = legacy_project_settings {
            root.insert("projectSettings".into(), settings);
        }
    }
    root.entry("assets").or_insert_with(
        /* 提供缺省或失败路径的空值：Value :: Array (Vec :: new ())。 */
        || Value::Array(Vec::new()),
    );
    root.entry("plugins").or_insert_with(
        /* 提供缺省或失败路径的空值：Value :: Array (Vec :: new ())。 */
        || Value::Array(Vec::new()),
    );
    root.entry("packages").or_insert_with(/* 构造包含 manifestVersion、installed、lockfile、offlineCache、offlineMode 字段的 JSON 默认值，供缺省配置补齐。 */ || {
        json!({
            "manifestVersion": 1,
            "installed": [],
            "lockfile": [],
            "offlineCache": [],
            "offlineMode": true
        })
    });
    root.entry("projectMetadata").or_insert_with(/* 构造包含 id、name、createdAt、updatedAt、format、template 字段的 JSON 默认值，供缺省配置补齐。 */ || {
        json!({
            "id": deterministic_uuid("nova-a-project:imported"),
            "name": "Imported Project",
            "createdAt": "1970-01-01T00:00:00.000Z",
            "updatedAt": "1970-01-01T00:00:00.000Z",
            "format": PROJECT_FORMAT_NAME,
            "template": "imported"
        })
    });
    let metadata = root
        .get("projectMetadata")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let project_uuid = metadata
        .get("id")
        .and_then(Value::as_str)
        .filter(/* 计算并返回 is_uuid (value)，用于当前 migrate_project_value 流程。 */ |value| is_uuid(value))
        .map(str::to_owned)
        .unwrap_or_else(/* 计算并返回 deterministic_uuid ("nova-a-project:imported")，用于当前 migrate_project_value 流程。 */ || deterministic_uuid("nova-a-project:imported"));
    let project_name = metadata
        .get("name")
        .and_then(Value::as_str)
        .filter(
            /* 判断 ! value . trim () . is_empty () 是否成立，供过滤或有效性检查使用。 */
            |value| !value.trim().is_empty(),
        )
        .unwrap_or("Imported Project")
        .to_owned();
    root.entry("manifest").or_insert_with(/* 构造包含 manifestVersion、projectUuid、name、engineCompatibility、minimum、maximumExclusive 等 字段的 JSON 默认值，供缺省配置补齐。 */ || {
        json!({
            "manifestVersion": 1,
            "projectUuid": project_uuid.clone(),
            "name": project_name.clone(),
            "engineCompatibility": {"minimum":"3.9.0","maximumExclusive":"27.0.0"},
            "schemaVersion": CURRENT_FORMAT_VERSION,
            "packageLockfile": "Packages.lock",
            "buildPresets": ["ProjectSettings/build.presets.json"],
            "directories": {"source":"Assets","shared":"ProjectSettings","generated":".nova/imported","cache":".nova/cache","userLocal":".nova/user"}
        })
    });
    if let Some(manifest) = root.get_mut("manifest").and_then(Value::as_object_mut) {
        manifest.insert("manifestVersion".into(), json!(1));
        manifest.insert("projectUuid".into(), json!(project_uuid));
        manifest.insert("name".into(), json!(project_name));
        manifest.insert("schemaVersion".into(), json!(CURRENT_FORMAT_VERSION));
        manifest.entry("engineCompatibility").or_insert_with(
            /* 构造包含 minimum、maximumExclusive 字段的 JSON 默认值，供缺省配置补齐。 */
            || json!({"minimum":"3.9.0","maximumExclusive":"27.0.0"}),
        );
        if parse_semver(&source_engine_version).map_or(
            true,
            /* 判断 version . 0 < 26 是否成立，供过滤或有效性检查使用。 */
            |version| version.0 < 26,
        ) {
            if let Some(compatibility) = manifest
                .get_mut("engineCompatibility")
                .and_then(Value::as_object_mut)
            {
                if matches!(
                    compatibility
                        .get("maximumExclusive")
                        .and_then(Value::as_str),
                    Some("4.0.0" | "5.0.0" | "6.0.0" | "7.0.0" | "8.0.0")
                ) {
                    compatibility.insert("maximumExclusive".into(), json!("27.0.0"));
                }
            }
        }
        manifest.entry("packageLockfile").or_insert_with(
            /* 提供 JSON 默认值 json ! ("Packages.lock")。 */
            || json!("Packages.lock"),
        );
        manifest.entry("buildPresets").or_insert_with(
            /* 提供 JSON 默认值 json ! (["ProjectSettings/build.presets.json"])。 */
            || json!(["ProjectSettings/build.presets.json"]),
        );
        manifest.entry("directories").or_insert_with(/* 构造包含 source、shared、generated、cache、userLocal 字段的 JSON 默认值，供缺省配置补齐。 */ || json!({"source":"Assets","shared":"ProjectSettings","generated":".nova/imported","cache":".nova/cache","userLocal":".nova/user"}));
    }
    root.entry("assetDatabase").or_insert_with(
        /* 构造包含 version、favorites、savedFilters、importPresets 字段的 JSON 默认值，供缺省配置补齐。 */ || json!({"version":1,"favorites":[],"savedFilters":[],"importPresets":[]}),
    );
    if let Some(assets) = root.get_mut("assets").and_then(Value::as_array_mut) {
        for (index, asset) in assets.iter_mut().enumerate() {
            let Some(asset) = asset.as_object_mut() else {
                continue;
            };
            let uuid = asset
                .get("uuid")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            let source = asset
                .get("source")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            let legacy_hash = format!(
                "legacy-unverified:{}",
                deterministic_uuid(&format!("asset-metadata:{index}:{uuid}:{source}"))
            );
            asset.entry("pipeline").or_insert_with(/* 构造包含 importerVersion、platform、sourceHash、artifactHash、contentHash、cacheKey 等 字段的 JSON 默认值，供缺省配置补齐。 */ || json!({
                "importerVersion":"legacy-1","platform":"web","sourceHash":legacy_hash.clone(),"artifactHash":legacy_hash.clone(),
                "contentHash":legacy_hash.clone(),"cacheKey":legacy_hash.clone(),"status":"ready","lastValidSource":source.clone(),
                "error":"","dependencies":[],"reverseDependencies":[],"cacheHit":false
            }));
            if let Some(pipeline) = asset.get_mut("pipeline").and_then(Value::as_object_mut) {
                let source_hash = pipeline
                    .get("sourceHash")
                    .or_else(/* 读取可选字段 contentHash，由外层继续处理缺省值。 */ || pipeline.get("contentHash"))
                    .and_then(Value::as_str)
                    .filter(/* 计算并返回 valid_content_hash (value)，用于当前 migrate_project_value 流程。 */ |value| valid_content_hash(value))
                    .unwrap_or(&legacy_hash)
                    .to_owned();
                let artifact_hash = pipeline
                    .get("artifactHash")
                    .or_else(/* 读取可选字段 cacheKey，由外层继续处理缺省值。 */ || pipeline.get("cacheKey"))
                    .and_then(Value::as_str)
                    .filter(/* 计算并返回 valid_content_hash (value)，用于当前 migrate_project_value 流程。 */ |value| valid_content_hash(value))
                    .unwrap_or(&legacy_hash)
                    .to_owned();
                pipeline.insert("sourceHash".into(), json!(source_hash));
                pipeline.insert("artifactHash".into(), json!(artifact_hash));
                pipeline
                    .entry("dependencies")
                    .or_insert_with(/* 提供 JSON 默认值 json ! ([])。 */ || json!([]));
                pipeline
                    .entry("reverseDependencies")
                    .or_insert_with(/* 提供 JSON 默认值 json ! ([])。 */ || json!([]));
            }
            let import_settings = asset.entry("settings").or_insert_with(
                /* 提供 JSON 默认值 json ! ({ })。 */ || json!({}),
            );
            if let Some(import_settings) = import_settings.as_object_mut() {
                import_settings.entry("textureProfile").or_insert_with(
                    /* 提供 JSON 默认值 json ! ("General")。 */ || json!("General"),
                );
                import_settings.entry("audioSettings").or_insert_with(
                    /* 提供 JSON 默认值 json ! ({ })。 */ || json!({}),
                );
                if let Some(audio) = import_settings
                    .get_mut("audioSettings")
                    .and_then(Value::as_object_mut)
                {
                    audio.entry("profile").or_insert_with(
                        /* 提供 JSON 默认值 json ! ("SoundEffect")。 */
                        || json!("SoundEffect"),
                    );
                    audio.entry("codec").or_insert_with(
                        /* 提供 JSON 默认值 json ! ("Original")。 */
                        || json!("Original"),
                    );
                    audio.entry("quality").or_insert_with(
                        /* 提供 JSON 默认值 json ! (0.8)。 */ || json!(0.8),
                    );
                    audio.entry("trimStart").or_insert_with(
                        /* 提供 JSON 默认值 json ! (0.0)。 */ || json!(0.0),
                    );
                    audio.entry("trimEnd").or_insert_with(
                        /* 提供 JSON 默认值 json ! (0.0)。 */ || json!(0.0),
                    );
                }
                import_settings.entry("fontSettings").or_insert_with(
                    /* 提供 JSON 默认值 json ! ({ })。 */ || json!({}),
                );
                if let Some(font) = import_settings
                    .get_mut("fontSettings")
                    .and_then(Value::as_object_mut)
                {
                    font.entry("renderMode").or_insert_with(
                        /* 提供 JSON 默认值 json ! ("Scalable")。 */
                        || json!("Scalable"),
                    );
                    font.entry("fallbackFamilies").or_insert_with(
                        /* 提供 JSON 默认值 json ! ([])。 */ || json!([]),
                    );
                    font.entry("bitmapSize").or_insert_with(
                        /* 提供 JSON 默认值 json ! (32)。 */ || json!(32),
                    );
                    font.entry("outlineWidth").or_insert_with(
                        /* 提供 JSON 默认值 json ! (0.0)。 */ || json!(0.0),
                    );
                    font.entry("shaping").or_insert_with(
                        /* 提供 JSON 默认值 json ! (true)。 */ || json!(true),
                    );
                }
            }
            migrate_tileset_asset(asset)?;
        }
    }
    root.entry("projectSettings").or_insert_with(
        /* 构造包含 inputMap 字段的 JSON 默认值，供缺省配置补齐。 */
        || json!({ "inputMap": [] }),
    );
    if let Some(settings) = root
        .get_mut("projectSettings")
        .and_then(Value::as_object_mut)
    {
        settings.entry("inputMap").or_insert_with(
            /* 提供缺省或失败路径的空值：Value :: Array (Vec :: new ())。 */
            || Value::Array(Vec::new()),
        );
        settings.entry("audio").or_insert_with(/* 构造包含 masterVolume、sampleRate、buses、Master、Music、SFX 等 字段的 JSON 默认值，供缺省配置补齐。 */ || {
            json!({
                "masterVolume": 1.0,
                "sampleRate": 48000,
                "buses": { "Master": 1.0, "Music": 1.0, "SFX": 1.0, "UI": 1.0 },
                "mixer": {
                    "buses": [
                        {"id":"Master","name":"Master","gain":1.0,"mute":false,"solo":false,"parent":null,"voiceLimit":32,"sends":[],"effects":[]},
                        {"id":"Music","name":"Music","gain":1.0,"mute":false,"solo":false,"parent":"Master","voiceLimit":4,"sends":[],"effects":[]},
                        {"id":"SFX","name":"SFX","gain":1.0,"mute":false,"solo":false,"parent":"Master","voiceLimit":32,"sends":[],"effects":[]},
                        {"id":"UI","name":"UI","gain":1.0,"mute":false,"solo":false,"parent":"Master","voiceLimit":32,"sends":[],"effects":[]}
                    ],
                    "snapshots": [{"id":"default","name":"Default","masterVolume":1.0,"busGains":{"Master":1.0,"Music":1.0,"SFX":1.0,"UI":1.0}}],
                    "activeSnapshot": null, "ducking": [], "masterVoiceLimit": 128
                }
            })
        });
        settings.entry("build").or_insert_with(/* 构造包含 gameName、target、architecture、runtimeMode、profile、sceneOrder 等 字段的 JSON 默认值，供缺省配置补齐。 */ || {
            json!({
                "gameName": "MyGame", "target": "windows", "architecture": "x86_64",
                "runtimeMode": "game", "profile": "debug",
                "sceneOrder": [], "startupSceneUuid": "", "packageIntoExecutable": false,
                "developmentBuild": true, "outputDirectory": "",
                "platform": {"identifier":"top.whitelists.mygame","version":"1.0.0","iconAsset":null,"splashAsset":null,"orientation":"auto","permissions":[],"signingMode":"none","signingIdentity":"","notarizationProfile":""},
                "delivery": {"deterministic":true,"incremental":true,"compression":"balanced","patchManifest":true,"structuredLogs":true,"crashReports":true,"telemetryEnabled":false,"telemetryEndpoint":"","privacyPolicyUrl":""}
            })
        });
        if let Some(build) = settings.get_mut("build").and_then(Value::as_object_mut) {
            for (key, value) in json!({"gameName":"MyGame","target":"windows","architecture":"x86_64","sceneOrder":[],"startupSceneUuid":"","packageIntoExecutable":false,"developmentBuild":true,"outputDirectory":""}).as_object().unwrap() {
                build.entry(key.clone()).or_insert_with(/* 复制 value . clone () 的结果，避免向调用方暴露可变宿主引用。 */ || value.clone());
            }
            build.entry("runtimeMode").or_insert_with(
                /* 提供 JSON 默认值 json ! ("game")。 */ || json!("game"),
            );
            let development = build
                .get("developmentBuild")
                .and_then(Value::as_bool)
                .unwrap_or(true);
            build.entry("profile").or_insert_with(
                /* 提供 JSON 默认值 json ! (if development { "debug" } else { "release" })。 */
                || json!(if development { "debug" } else { "release" }),
            );
            build.entry("platform").or_insert_with(/* 构造包含 identifier、version、iconAsset、splashAsset、orientation、permissions 等 字段的 JSON 默认值，供缺省配置补齐。 */ || json!({"identifier":"top.whitelists.mygame","version":"1.0.0","iconAsset":null,"splashAsset":null,"orientation":"auto","permissions":[],"signingMode":"none","signingIdentity":"","notarizationProfile":""}));
            build.entry("delivery").or_insert_with(/* 构造包含 deterministic、incremental、compression、patchManifest、structuredLogs、crashReports 等 字段的 JSON 默认值，供缺省配置补齐。 */ || json!({"deterministic":true,"incremental":true,"compression":"balanced","patchManifest":true,"structuredLogs":true,"crashReports":true,"telemetryEnabled":false,"telemetryEndpoint":"","privacyPolicyUrl":""}));
            for (section, defaults) in [
                (
                    "platform",
                    json!({"identifier":"top.whitelists.mygame","version":"1.0.0","iconAsset":null,"splashAsset":null,"orientation":"auto","permissions":[],"signingMode":"none","signingIdentity":"","notarizationProfile":""}),
                ),
                (
                    "delivery",
                    json!({"deterministic":true,"incremental":true,"compression":"balanced","patchManifest":true,"structuredLogs":true,"crashReports":true,"telemetryEnabled":false,"telemetryEndpoint":"","privacyPolicyUrl":""}),
                ),
            ] {
                if let Some(values) = build.get_mut(section).and_then(Value::as_object_mut) {
                    for (key, value) in defaults.as_object().unwrap() {
                        values.entry(key.clone()).or_insert_with(
                            /* 复制 value . clone () 的结果，避免向调用方暴露可变宿主引用。 */
                            || value.clone(),
                        );
                    }
                }
            }
        }
        settings.entry("scripting").or_insert_with(
            /* 构造包含 apiVersion、customSignals、maxConsoleEntries、debuggerEnabled、hotReloadEnabled、breakOnRuntimeError 等 字段的 JSON 默认值，供缺省配置补齐。 */ || json!({ "apiVersion": 1, "customSignals": [], "maxConsoleEntries": 2000, "debuggerEnabled": true, "hotReloadEnabled": true, "breakOnRuntimeError": true, "deterministicTestSeed": 1, "externalEditorProtocol": true }),
        );
        if let Some(scripting) = settings.get_mut("scripting").and_then(Value::as_object_mut) {
            scripting
                .entry("apiVersion")
                .or_insert_with(/* 提供 JSON 默认值 json ! (1)。 */ || json!(1));
            scripting
                .entry("customSignals")
                .or_insert_with(/* 提供 JSON 默认值 json ! ([])。 */ || json!([]));
            scripting.entry("maxConsoleEntries").or_insert_with(
                /* 提供 JSON 默认值 json ! (2000)。 */ || json!(2000),
            );
            scripting.entry("debuggerEnabled").or_insert_with(
                /* 提供 JSON 默认值 json ! (true)。 */ || json!(true),
            );
            scripting.entry("hotReloadEnabled").or_insert_with(
                /* 提供 JSON 默认值 json ! (true)。 */ || json!(true),
            );
            scripting.entry("breakOnRuntimeError").or_insert_with(
                /* 提供 JSON 默认值 json ! (true)。 */ || json!(true),
            );
            scripting
                .entry("deterministicTestSeed")
                .or_insert_with(/* 提供 JSON 默认值 json ! (1)。 */ || json!(1));
            scripting.entry("externalEditorProtocol").or_insert_with(
                /* 提供 JSON 默认值 json ! (true)。 */ || json!(true),
            );
        }
        settings.entry("rendering").or_insert_with(/* 构造包含 qualityPreset、lightingEnabled、ambientColor、r、g、b 等 字段的 JSON 默认值，供缺省配置补齐。 */ || json!({
            "qualityPreset": "Balanced",
            "lightingEnabled": false,
            "ambientColor": { "r": 255, "g": 255, "b": 255 },
            "ambientIntensity": 1.0,
            "shadowQuality": "Soft",
            "colorSpace": "sRGB",
            "postProcessing": { "enabled": false, "exposure": 0.0, "contrast": 1.0, "saturation": 1.0, "vignette": 0.0, "bloom": 0.0, "blur": 0.0, "userMaterial": null },
            "debugView": "None",
            "pixelSnap": false,
            "maximumPixelRatio": 2.0,
            "particleBudget": 10000
        }));
        if let Some(rendering) = settings.get_mut("rendering").and_then(Value::as_object_mut) {
            rendering.entry("qualityPreset").or_insert_with(
                /* 提供 JSON 默认值 json ! ("Balanced")。 */ || json!("Balanced"),
            );
            rendering.entry("pixelSnap").or_insert_with(
                /* 提供 JSON 默认值 json ! (false)。 */ || json!(false),
            );
            rendering.entry("maximumPixelRatio").or_insert_with(
                /* 提供 JSON 默认值 json ! (2.0)。 */ || json!(2.0),
            );
            rendering.entry("particleBudget").or_insert_with(
                /* 提供 JSON 默认值 json ! (10000)。 */ || json!(10000),
            );
            rendering.entry("colorSpace").or_insert_with(
                /* 提供 JSON 默认值 json ! ("sRGB")。 */ || json!("sRGB"),
            );
        }
        settings.entry("world").or_insert_with(/* 构造包含 navigationDebug、areaDebug、chunkDebug、streamingEnabled、memoryBudgetMb、originShiftThreshold 字段的 JSON 默认值，供缺省配置补齐。 */ || {
            json!({
                "navigationDebug": false, "areaDebug": false, "chunkDebug": false,
                "streamingEnabled": true, "memoryBudgetMb": 256.0, "originShiftThreshold": 10000.0
            })
        });
        settings.entry("presentation").or_insert_with(/* 构造包含 localization、sourceLocale、previewLocale、fallbackChain、pseudolocalization、pseudolocalizationMode 等 字段的 JSON 默认值，供缺省配置补齐。 */ || {
            json!({
                "localization": {"sourceLocale":"en","previewLocale":"en","fallbackChain":["en"],"pseudolocalization":false,"pseudolocalizationMode":"expanded","expansionRatio":0.35,"buildLocales":["en"]},
                "accessibility": {"keyboardNavigation":true,"gamepadNavigation":true,"screenReaderMetadata":true,"focusRingColor":"#79b2ff","focusRingWidth":3.0,"reducedMotion":false,"highContrast":false,"textScale":1.0,"minimumTargetSize":44.0,"announceFocusChanges":true},
                "uiAudio": {"hover":null,"press":null,"focus":null,"cancel":null,"bus":"UI"}
            })
        });
        if let Some(presentation) = settings
            .get_mut("presentation")
            .and_then(Value::as_object_mut)
        {
            presentation.entry("localization").or_insert_with(
                /* 提供 JSON 默认值 json ! ({ })。 */ || json!({}),
            );
            if let Some(localization) = presentation
                .get_mut("localization")
                .and_then(Value::as_object_mut)
            {
                localization.entry("pseudolocalizationMode").or_insert_with(
                    /* 提供 JSON 默认值 json ! ("expanded")。 */ || json!("expanded"),
                );
                localization.entry("expansionRatio").or_insert_with(
                    /* 提供 JSON 默认值 json ! (0.35)。 */ || json!(0.35),
                );
            }
            presentation.entry("accessibility").or_insert_with(
                /* 提供 JSON 默认值 json ! ({ })。 */ || json!({}),
            );
            if let Some(accessibility) = presentation
                .get_mut("accessibility")
                .and_then(Value::as_object_mut)
            {
                accessibility.entry("highContrast").or_insert_with(
                    /* 提供 JSON 默认值 json ! (false)。 */ || json!(false),
                );
                accessibility.entry("textScale").or_insert_with(
                    /* 提供 JSON 默认值 json ! (1.0)。 */ || json!(1.0),
                );
                accessibility.entry("minimumTargetSize").or_insert_with(
                    /* 提供 JSON 默认值 json ! (44.0)。 */ || json!(44.0),
                );
            }
            presentation.entry("uiAudio").or_insert_with(
                /* 构造包含 hover、press、focus、cancel、bus 字段的 JSON 默认值，供缺省配置补齐。 */
                || json!({"hover":null,"press":null,"focus":null,"cancel":null,"bus":"UI"}),
            );
        }
        settings.entry("production").or_insert_with(/* 构造包含 performance、traceCapacity、memoryBudgetMb、assetBudgetMb、leakWindowFrames、lifetimeCapacity 等 字段的 JSON 默认值，供缺省配置补齐。 */ || {
            json!({
                "performance": {"traceCapacity":600,"memoryBudgetMb":300.0,"assetBudgetMb":512.0,"leakWindowFrames":600,"lifetimeCapacity":2000},
                "replay": {"seed":1313822273_u64,"capacity":3600,"strictChecksums":true},
                "testing": {"defaultTimeoutMs":10000,"tests":[]},
                "data": {"saveSchemaVersion":1,"saveMigrations":[]},
                "jobs": {"maxWorkers":2,"maxQueued":256,"timeoutMs":15000},
                "networking": {"enabled":false,"permissionGranted":false,"autoStart":false,"role":"client","sessionMode":"local","sessionName":"Local game","playerName":"Player","maxPeers":8,"transport":"websocket","transportAdapterId":"","endpoint":"ws://127.0.0.1:7777","bindAddress":"127.0.0.1:0","snapshotRate":20,"interpolationMs":100,"rollbackFrames":120,"bandwidthKbps":256,"reconnect":true,"reconnectMaxAttempts":8,"protocolVersion":2,"schemaVersion":1,"maximumPacketBytes":65507,"maximumMessagesPerSecond":240,"maximumPendingReliable":512,"reliableRetryMs":120,"reliableMaximumAttempts":8,"reconciliationThreshold":0.05,"lateJoin":true,"channels":[{"id":"state","delivery":"unreliable-sequenced","maximumPayloadBytes":48000,"messagesPerSecond":120,"priority":2},{"id":"input","delivery":"unreliable-sequenced","maximumPayloadBytes":16000,"messagesPerSecond":240,"priority":3},{"id":"events","delivery":"reliable-ordered","maximumPayloadBytes":32000,"messagesPerSecond":120,"priority":4}],"rpcContracts":[],"simulation":{"enabled":false,"latencyMs":0,"jitterMs":0,"lossPercent":0.0,"duplicatePercent":0.0,"reorderPercent":0.0,"seed":1313166423_u64},"authentication":{"mode":"none","providerId":"","requireVerifiedPeers":false,"handshakeTimeoutMs":5000},"security":{"requireEncryption":false,"maximumPacketAgeMs":15000,"replayWindow":2048},"interest":{"enabled":false,"defaultRadius":64.0,"maximumRadius":4096.0},"multiInstance":{"peerCount":2,"separateLogs":true,"separateInspectors":true},"services":{"identityProviderId":"","lobbyProviderId":"","relayProviderId":""},"allowAuthorityTransfer":true,"allowSceneHandoff":true,"replicatedEntities":[]}
            })
        });
        if let Some(production) = settings
            .get_mut("production")
            .and_then(Value::as_object_mut)
        {
            // Historical schema-29 files can contain only the settings available
            // when authored. Fill missing leaves without repairing explicit bad data.
            for (section, defaults) in [
                (
                    "performance",
                    json!({"traceCapacity":600,"memoryBudgetMb":300.0,"assetBudgetMb":512.0,"leakWindowFrames":600,"lifetimeCapacity":2000}),
                ),
                (
                    "replay",
                    json!({"seed":1313822273_u64,"capacity":3600,"strictChecksums":true}),
                ),
                ("testing", json!({"defaultTimeoutMs":10000,"tests":[]})),
                ("data", json!({"saveSchemaVersion":1,"saveMigrations":[]})),
                (
                    "jobs",
                    json!({"maxWorkers":2,"maxQueued":256,"timeoutMs":15000}),
                ),
            ] {
                let value = production.entry(section).or_insert_with(
                    /* 复制 defaults . clone () 的结果，避免向调用方暴露可变宿主引用。 */
                    || defaults.clone(),
                );
                if let (Some(values), Some(defaults)) =
                    (value.as_object_mut(), defaults.as_object())
                {
                    for (key, default) in defaults {
                        values.entry(key.clone()).or_insert_with(
                            /* 复制 default . clone () 的结果，避免向调用方暴露可变宿主引用。 */
                            || default.clone(),
                        );
                    }
                }
            }
            production.entry("networking").or_insert_with(
                /* 提供 JSON 默认值 json ! ({ })。 */ || json!({}),
            );
            if let Some(networking) = production
                .get_mut("networking")
                .and_then(Value::as_object_mut)
            {
                networking.entry("enabled").or_insert_with(
                    /* 提供 JSON 默认值 json ! (false)。 */ || json!(false),
                );
                networking.entry("permissionGranted").or_insert_with(
                    /* 提供 JSON 默认值 json ! (false)。 */ || json!(false),
                );
                networking.entry("autoStart").or_insert_with(
                    /* 提供 JSON 默认值 json ! (false)。 */ || json!(false),
                );
                networking.entry("role").or_insert_with(
                    /* 提供 JSON 默认值 json ! ("client")。 */ || json!("client"),
                );
                networking.entry("sessionMode").or_insert_with(
                    /* 提供 JSON 默认值 json ! ("local")。 */ || json!("local"),
                );
                networking.entry("sessionName").or_insert_with(
                    /* 提供 JSON 默认值 json ! ("Local game")。 */
                    || json!("Local game"),
                );
                networking.entry("playerName").or_insert_with(
                    /* 提供 JSON 默认值 json ! ("Player")。 */ || json!("Player"),
                );
                networking
                    .entry("maxPeers")
                    .or_insert_with(/* 提供 JSON 默认值 json ! (8)。 */ || json!(8));
                networking.entry("transport").or_insert_with(
                    /* 提供 JSON 默认值 json ! ("websocket")。 */
                    || json!("websocket"),
                );
                networking
                    .entry("transportAdapterId")
                    .or_insert_with(/* 提供 JSON 默认值 json ! ("")。 */ || json!(""));
                networking.entry("endpoint").or_insert_with(
                    /* 提供 JSON 默认值 json ! ("ws://127.0.0.1:7777")。 */
                    || json!("ws://127.0.0.1:7777"),
                );
                networking.entry("bindAddress").or_insert_with(
                    /* 提供 JSON 默认值 json ! ("127.0.0.1:0")。 */
                    || json!("127.0.0.1:0"),
                );
                networking
                    .entry("snapshotRate")
                    .or_insert_with(/* 提供 JSON 默认值 json ! (20)。 */ || json!(20));
                networking.entry("interpolationMs").or_insert_with(
                    /* 提供 JSON 默认值 json ! (100)。 */ || json!(100),
                );
                networking.entry("rollbackFrames").or_insert_with(
                    /* 提供 JSON 默认值 json ! (120)。 */ || json!(120),
                );
                networking.entry("bandwidthKbps").or_insert_with(
                    /* 提供 JSON 默认值 json ! (256)。 */ || json!(256),
                );
                networking.entry("reconnect").or_insert_with(
                    /* 提供 JSON 默认值 json ! (true)。 */ || json!(true),
                );
                networking
                    .entry("reconnectMaxAttempts")
                    .or_insert_with(/* 提供 JSON 默认值 json ! (8)。 */ || json!(8));
                networking
                    .entry("protocolVersion")
                    .or_insert_with(/* 提供 JSON 默认值 json ! (2)。 */ || json!(2));
                networking
                    .entry("schemaVersion")
                    .or_insert_with(/* 提供 JSON 默认值 json ! (1)。 */ || json!(1));
                networking.entry("maximumPacketBytes").or_insert_with(
                    /* 提供 JSON 默认值 json ! (65_507)。 */ || json!(65_507),
                );
                networking.entry("maximumMessagesPerSecond").or_insert_with(
                    /* 提供 JSON 默认值 json ! (240)。 */ || json!(240),
                );
                networking.entry("maximumPendingReliable").or_insert_with(
                    /* 提供 JSON 默认值 json ! (512)。 */ || json!(512),
                );
                networking.entry("reliableRetryMs").or_insert_with(
                    /* 提供 JSON 默认值 json ! (120)。 */ || json!(120),
                );
                networking
                    .entry("reliableMaximumAttempts")
                    .or_insert_with(/* 提供 JSON 默认值 json ! (8)。 */ || json!(8));
                networking.entry("reconciliationThreshold").or_insert_with(
                    /* 提供 JSON 默认值 json ! (0.05)。 */ || json!(0.05),
                );
                networking.entry("lateJoin").or_insert_with(
                    /* 提供 JSON 默认值 json ! (true)。 */ || json!(true),
                );
                networking.entry("channels").or_insert_with(/* 构造包含 id、delivery、maximumPayloadBytes、messagesPerSecond、priority 等 字段的 JSON 默认值，供缺省配置补齐。 */ || json!([
                    {"id":"state","delivery":"unreliable-sequenced","maximumPayloadBytes":48000,"messagesPerSecond":120,"priority":2},
                    {"id":"input","delivery":"unreliable-sequenced","maximumPayloadBytes":16000,"messagesPerSecond":240,"priority":3},
                    {"id":"events","delivery":"reliable-ordered","maximumPayloadBytes":32000,"messagesPerSecond":120,"priority":4}
                ]));
                networking
                    .entry("rpcContracts")
                    .or_insert_with(/* 提供 JSON 默认值 json ! ([])。 */ || json!([]));
                networking.entry("simulation").or_insert_with(/* 构造包含 enabled、latencyMs、jitterMs、lossPercent、duplicatePercent、reorderPercent 等 字段的 JSON 默认值，供缺省配置补齐。 */ || {
                    json!({
                        "enabled":false,"latencyMs":0,"jitterMs":0,"lossPercent":0.0,
                        "duplicatePercent":0.0,"reorderPercent":0.0,"seed":1313166423_u64
                    })
                });
                networking.entry("authentication").or_insert_with(/* 构造包含 mode、providerId、requireVerifiedPeers、handshakeTimeoutMs 字段的 JSON 默认值，供缺省配置补齐。 */ || json!({
                    "mode":"none","providerId":"","requireVerifiedPeers":false,"handshakeTimeoutMs":5000
                }));
                networking.entry("security").or_insert_with(/* 构造包含 requireEncryption、maximumPacketAgeMs、replayWindow 字段的 JSON 默认值，供缺省配置补齐。 */ || {
                    json!({
                        "requireEncryption":false,"maximumPacketAgeMs":15000,"replayWindow":2048
                    })
                });
                networking.entry("interest").or_insert_with(/* 构造包含 enabled、defaultRadius、maximumRadius 字段的 JSON 默认值，供缺省配置补齐。 */ || {
                    json!({
                        "enabled":false,"defaultRadius":64.0,"maximumRadius":4096.0
                    })
                });
                networking.entry("multiInstance").or_insert_with(/* 构造包含 peerCount、separateLogs、separateInspectors 字段的 JSON 默认值，供缺省配置补齐。 */ || {
                    json!({
                        "peerCount":2,"separateLogs":true,"separateInspectors":true
                    })
                });
                networking.entry("services").or_insert_with(/* 构造包含 identityProviderId、lobbyProviderId、relayProviderId 字段的 JSON 默认值，供缺省配置补齐。 */ || {
                    json!({
                        "identityProviderId":"","lobbyProviderId":"","relayProviderId":""
                    })
                });
                networking.entry("allowAuthorityTransfer").or_insert_with(
                    /* 提供 JSON 默认值 json ! (true)。 */ || json!(true),
                );
                networking.entry("allowSceneHandoff").or_insert_with(
                    /* 提供 JSON 默认值 json ! (true)。 */ || json!(true),
                );
                networking
                    .entry("replicatedEntities")
                    .or_insert_with(/* 提供 JSON 默认值 json ! ([])。 */ || json!([]));

                if let Some(authentication) = networking
                    .get_mut("authentication")
                    .and_then(Value::as_object_mut)
                {
                    authentication.entry("mode").or_insert_with(
                        /* 提供 JSON 默认值 json ! ("none")。 */ || json!("none"),
                    );
                    authentication.entry("providerId").or_insert_with(
                        /* 提供 JSON 默认值 json ! ("")。 */ || json!(""),
                    );
                    authentication.entry("requireVerifiedPeers").or_insert_with(
                        /* 提供 JSON 默认值 json ! (false)。 */ || json!(false),
                    );
                    authentication.entry("handshakeTimeoutMs").or_insert_with(
                        /* 提供 JSON 默认值 json ! (5000)。 */ || json!(5000),
                    );
                }
                if let Some(security) = networking
                    .get_mut("security")
                    .and_then(Value::as_object_mut)
                {
                    security.entry("requireEncryption").or_insert_with(
                        /* 提供 JSON 默认值 json ! (false)。 */ || json!(false),
                    );
                    security.entry("maximumPacketAgeMs").or_insert_with(
                        /* 提供 JSON 默认值 json ! (15000)。 */ || json!(15000),
                    );
                    security.entry("replayWindow").or_insert_with(
                        /* 提供 JSON 默认值 json ! (2048)。 */ || json!(2048),
                    );
                }
                if let Some(interest) = networking
                    .get_mut("interest")
                    .and_then(Value::as_object_mut)
                {
                    interest.entry("enabled").or_insert_with(
                        /* 提供 JSON 默认值 json ! (false)。 */ || json!(false),
                    );
                    interest.entry("defaultRadius").or_insert_with(
                        /* 提供 JSON 默认值 json ! (64.0)。 */ || json!(64.0),
                    );
                    interest.entry("maximumRadius").or_insert_with(
                        /* 提供 JSON 默认值 json ! (4096.0)。 */ || json!(4096.0),
                    );
                }
                if let Some(multi_instance) = networking
                    .get_mut("multiInstance")
                    .and_then(Value::as_object_mut)
                {
                    multi_instance
                        .entry("peerCount")
                        .or_insert_with(/* 提供 JSON 默认值 json ! (2)。 */ || json!(2));
                    multi_instance.entry("separateLogs").or_insert_with(
                        /* 提供 JSON 默认值 json ! (true)。 */ || json!(true),
                    );
                    multi_instance.entry("separateInspectors").or_insert_with(
                        /* 提供 JSON 默认值 json ! (true)。 */ || json!(true),
                    );
                }
                if let Some(services) = networking
                    .get_mut("services")
                    .and_then(Value::as_object_mut)
                {
                    services.entry("identityProviderId").or_insert_with(
                        /* 提供 JSON 默认值 json ! ("")。 */ || json!(""),
                    );
                    services.entry("lobbyProviderId").or_insert_with(
                        /* 提供 JSON 默认值 json ! ("")。 */ || json!(""),
                    );
                    services.entry("relayProviderId").or_insert_with(
                        /* 提供 JSON 默认值 json ! ("")。 */ || json!(""),
                    );
                }
                if let Some(definitions) = networking
                    .get_mut("replicatedEntities")
                    .and_then(Value::as_array_mut)
                {
                    for definition in definitions {
                        if let Some(definition) = definition.as_object_mut() {
                            definition.entry("ownerPeerId").or_insert_with(
                                /* 提供 JSON 默认值 json ! ("")。 */ || json!(""),
                            );
                            definition.entry("alwaysRelevant").or_insert_with(
                                /* 提供 JSON 默认值 json ! (false)。 */
                                || json!(false),
                            );
                            definition.entry("interestRadius").or_insert_with(
                                /* 提供 JSON 默认值 json ! (64.0)。 */ || json!(64.0),
                            );
                            definition.entry("sceneUuid").or_insert_with(
                                /* 提供 JSON 默认值 json ! ("")。 */ || json!(""),
                            );
                        }
                    }
                }
            }
        }
    }

    let requested_active_scene = root
        .get("activeSceneUuid")
        .and_then(Value::as_str)
        .map(str::to_owned);
    let scenes = root
        .get_mut("scenes")
        .and_then(Value::as_array_mut)
        .ok_or_else(
            /* 构造工程格式错误，标明失败条件：project scenes must be an array。 */
            || FormatError("project scenes must be an array".into()),
        )?;
    if scenes.is_empty() {
        return Err(FormatError(
            "project must contain at least one scene".into(),
        ));
    }
    for (scene_index, scene) in scenes.iter_mut().enumerate() {
        let scene = scene.as_object_mut().ok_or_else(
            /* 构造工程格式错误，标明失败条件：every scene must be an object。 */
            || FormatError("every scene must be an object".into()),
        )?;
        if !scene
            .get("uuid")
            .and_then(Value::as_str)
            .is_some_and(is_uuid)
        {
            scene.insert(
                "uuid".into(),
                Value::String(deterministic_uuid(&format!("nova-a-scene:{scene_index}"))),
            );
        }
        scene.entry("name").or_insert_with(
            /* 提供 JSON 默认值 json ! (format ! ("Scene {}" , scene_index + 1))。 */
            || json!(format!("Scene {}", scene_index + 1)),
        );
        scene.entry("loaded").or_insert(Value::Bool(true));
        let settings = scene.entry("globalSettings").or_insert_with(/* 构造包含 gravity、airFriction、timeScale、tickRate、maxCatchUpSteps、collisionMatrix 字段的 JSON 默认值，供缺省配置补齐。 */ || {
            json!({
                "gravity": 9.80665, "airFriction": 0.01, "timeScale": 1.0,
                "tickRate": 60, "maxCatchUpSteps": 8,
                "collisionMatrix": (0..32).map(/* 把层编号转换为单比特碰撞掩码。 */ |layer| 1_u64 << layer).collect::<Vec<_>>()
            })
        });
        if let Some(settings) = settings.as_object_mut() {
            settings.entry("interpolation").or_insert_with(
                /* 提供 JSON 默认值 json ! ("Interpolate")。 */
                || json!("Interpolate"),
            );
            settings
                .entry("layers")
                .or_insert_with(default_named_physics_layers);
        }
        migrate_legacy_identities(scene)?;
        migrate_legacy_components(scene)?;
        migrate_visual_audio_pipeline(scene, source_version)?;
        migrate_world_data_components(scene)?;
    }

    let active_is_valid = requested_active_scene.as_deref().is_some_and(/* 判断 scenes . iter () . any (| scene | scene . get ("uuid") . and_then (Value :: as_str) == Some (active)) 是否成立，供过滤或有效性检查使用。 */ |active| {
        scenes
            .iter()
            .any(/* 判断 scene . get ("uuid") . and_then (Value :: as_str) == Some (active) 是否成立，供过滤或有效性检查使用。 */ |scene| scene.get("uuid").and_then(Value::as_str) == Some(active))
    });
    if !active_is_valid {
        let active = scenes[0]["uuid"].clone();
        root.insert("activeSceneUuid".into(), active);
    }
    root.insert("projectFormat".into(), json!(PROJECT_FORMAT_NAME));
    root.insert("projectFormatMajor".into(), json!(PROJECT_FORMAT_MAJOR));
    root.insert("formatVersion".into(), json!(CURRENT_FORMAT_VERSION));
    root.insert("engineVersion".into(), json!(CURRENT_ENGINE_VERSION));
    root.insert(
        "compatibility".into(),
        json!({
            "format": PROJECT_FORMAT_NAME,
            "major": PROJECT_FORMAT_MAJOR,
            "schemaVersion": CURRENT_FORMAT_VERSION,
            "minimumSchemaVersion": MINIMUM_SUPPORTED_FORMAT_VERSION
        }),
    );
    if let Some(assets) = root.get_mut("assets").and_then(Value::as_array_mut) {
        for asset in assets.iter_mut() {
            let Some(asset) = asset.as_object_mut() else {
                continue;
            };
            if asset.get("assetType").and_then(Value::as_str) != Some("script") {
                continue;
            }
            let metadata = asset.entry("script").or_insert_with(
                /* 提供 JSON 默认值 json ! ({ })。 */ || json!({}),
            );
            let Some(metadata) = metadata.as_object_mut() else {
                continue;
            };
            metadata.insert("version".into(), json!(1));
            metadata
                .entry("apiVersion")
                .or_insert_with(/* 提供 JSON 默认值 json ! (1)。 */ || json!(1));
            metadata
                .entry("breakpoints")
                .or_insert_with(/* 提供 JSON 默认值 json ! ([])。 */ || json!([]));
            metadata
                .entry("breakpointDetails")
                .or_insert_with(/* 提供 JSON 默认值 json ! ([])。 */ || json!([]));
            metadata
                .entry("tests")
                .or_insert_with(/* 提供 JSON 默认值 json ! ([])。 */ || json!([]));
            metadata
                .entry("packageDependencies")
                .or_insert_with(/* 提供 JSON 默认值 json ! ([])。 */ || json!([]));
            metadata
                .entry("packageName")
                .or_insert_with(/* 提供 JSON 默认值 json ! ("")。 */ || json!(""));
            metadata.entry("reloadPolicy").or_insert_with(
                /* 提供 JSON 默认值 json ! ("preserve")。 */ || json!("preserve"),
            );
            metadata
                .entry("signalConnections")
                .or_insert_with(/* 提供 JSON 默认值 json ! ([])。 */ || json!([]));
            metadata
                .entry("recoverySource")
                .or_insert_with(/* 提供 JSON 默认值 json ! ("")。 */ || json!(""));
            metadata
                .entry("lastSavedHash")
                .or_insert_with(/* 提供 JSON 默认值 json ! ("")。 */ || json!(""));
        }
        assets.sort_by(/* 先按资源路径排序；路径相同时再按 UUID 排序，保证工程输出稳定。 */ |left, right| {
            left.get("path")
                .and_then(Value::as_str)
                .unwrap_or("")
                .cmp(right.get("path").and_then(Value::as_str).unwrap_or(""))
                .then_with(/* 按 left . get ("uuid") . and_then (Value :: as_str) . unwrap_or ("") . cmp (right . get ("uuid") . and_then (Value :: as_str) . unwrap_or ("")) 比较顺序，供稳定排序使用。 */ || {
                    left.get("uuid")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .cmp(right.get("uuid").and_then(Value::as_str).unwrap_or(""))
                })
        });
    }
    let mut project: ProjectFile = serde_json::from_value(Value::Object(root)).map_err(
        /* 构造工程格式错误，标明失败条件：project schema is invalid: {error}。 */
        |error| FormatError(format!("project schema is invalid: {error}")),
    )?;
    // Pre-calendar script references used bare asset UUIDs. Canonicalize only
    // known script assets; unknown references and modern malformed files stay errors.
    if source_engine_version
        .split('.')
        .next()
        .and_then(
            /* 判断 part . parse :: < u32 > () . ok () 是否成立，供过滤或有效性检查使用。 */
            |part| part.parse::<u32>().ok(),
        )
        .is_some_and(
            /* 判断 major < 26 是否成立，供过滤或有效性检查使用。 */
            |major| major < 26,
        )
    {
        let scripts: std::collections::HashSet<String> = project
            .assets
            .iter()
            .filter(/* 判断 matches ! (asset . asset_type . as_str () , "script" | "visualScript") 是否成立，供过滤或有效性检查使用。 */ |asset| matches!(asset.asset_type.as_str(), "script" | "visualScript"))
            .map(/* 复制 asset . uuid . clone () 的结果，避免向调用方暴露可变宿主引用。 */ |asset| asset.uuid.clone())
            .collect();
        for scene in &mut project.scenes {
            for entity in &mut scene.entities {
                for component in &mut entity.components {
                    if component.kind == "Script2D" {
                        if let Some(reference) =
                            component.data.get("scriptAsset").and_then(Value::as_str)
                        {
                            if scripts.contains(reference) {
                                component.data["scriptAsset"] =
                                    json!(format!("asset://{reference}"));
                            }
                        }
                    }
                }
            }
        }
    }
    validate_project(&project)?;
    Ok(project)
}

// 检查场景、实体、资源、组件和设置之间的工程契约，发现错误即返回。
pub fn validate_project(project: &ProjectFile) -> Result<(), FormatError> {
    if project.project_format != PROJECT_FORMAT_NAME
        || project.project_format_major != PROJECT_FORMAT_MAJOR
        || project.compatibility.format != PROJECT_FORMAT_NAME
        || project.compatibility.major != PROJECT_FORMAT_MAJOR
        || project.compatibility.schema_version != CURRENT_FORMAT_VERSION
        || project.compatibility.minimum_schema_version != MINIMUM_SUPPORTED_FORMAT_VERSION
    {
        return Err(FormatError(
            "project compatibility metadata does not match Nova_A Project Format 2".into(),
        ));
    }
    if project.format_version != CURRENT_FORMAT_VERSION {
        return Err(FormatError(format!(
            "expected format {}, received {}",
            CURRENT_FORMAT_VERSION, project.format_version
        )));
    }
    if project.manifest.manifest_version != 1
        || project.manifest.schema_version != CURRENT_FORMAT_VERSION
        || !is_uuid(&project.manifest.project_uuid)
        || project.manifest.name.trim().is_empty()
        || project.manifest.package_lockfile != "Packages.lock"
    {
        return Err(FormatError(
            "project manifest identity or schema is invalid".into(),
        ));
    }
    let engine = parse_semver(CURRENT_ENGINE_VERSION).expect("current engine version is valid");
    let minimum =
        parse_semver(&project.manifest.engine_compatibility.minimum).ok_or_else(/* 构造工程格式错误，标明失败条件：project manifest has an invalid minimum engine version。 */ || {
            FormatError("project manifest has an invalid minimum engine version".into())
        })?;
    let maximum = parse_semver(&project.manifest.engine_compatibility.maximum_exclusive)
        .ok_or_else(/* 构造工程格式错误，标明失败条件：project manifest has an invalid maximum engine version。 */ || {
            FormatError("project manifest has an invalid maximum engine version".into())
        })?;
    if minimum >= maximum || engine < minimum || engine >= maximum {
        return Err(FormatError(
            "current engine is outside the project manifest compatibility range".into(),
        ));
    }
    if project
        .extra
        .get("projectMetadata")
        .and_then(
            /* 读取可选字段 id，由外层继续处理缺省值。 */
            |value| value.get("id"),
        )
        .and_then(Value::as_str)
        != Some(project.manifest.project_uuid.as_str())
    {
        return Err(FormatError(
            "project manifest UUID does not match project metadata".into(),
        ));
    }
    for path in [
        project.manifest.directories.source.as_str(),
        project.manifest.directories.shared.as_str(),
        project.manifest.directories.generated.as_str(),
        project.manifest.directories.cache.as_str(),
        project.manifest.directories.user_local.as_str(),
    ] {
        if path.is_empty()
            || path.split(['/', '\\']).any(
                /* 判断 part == ".." 是否成立，供过滤或有效性检查使用。 */
                |part| part == "..",
            )
        {
            return Err(FormatError(format!(
                "project manifest contains unsafe directory: {path}"
            )));
        }
    }
    if project.manifest.build_presets.len() > 64
        || project
            .manifest
            .build_presets
            .iter()
            .any(/* 判断 path . is_empty () || path . split (['/' , '\\']) . any (| part | part == "..") 是否成立，供过滤或有效性检查使用。 */ |path| path.is_empty() || path.split(['/', '\\']).any(/* 判断 part == ".." 是否成立，供过滤或有效性检查使用。 */ |part| part == ".."))
    {
        return Err(FormatError(
            "project manifest contains invalid build preset references".into(),
        ));
    }
    if project.scenes.is_empty() {
        return Err(FormatError(
            "project must contain at least one scene".into(),
        ));
    }
    validate_project_settings(project.extra.get("projectSettings"))?;
    let mut identities = std::collections::HashSet::new();
    let mut asset_types = HashMap::<&str, &str>::new();
    for asset in &project.assets {
        if !is_uuid(&asset.uuid) || !identities.insert(asset.uuid.as_str()) {
            return Err(FormatError(format!(
                "invalid or duplicate asset UUID: {}",
                asset.uuid
            )));
        }
        if asset.path.split('/').any(
            /* 判断 part == ".." 是否成立，供过滤或有效性检查使用。 */
            |part| part == "..",
        ) {
            return Err(FormatError(format!(
                "asset {} contains an unsafe project path",
                asset.uuid
            )));
        }
        asset_types.insert(asset.uuid.as_str(), asset.asset_type.as_str());
        let pipeline = asset
            .extra
            .get("pipeline")
            .and_then(Value::as_object)
            .ok_or_else(
                /* 构造工程格式错误，标明失败条件：asset {} has no import metadata。 */
                || FormatError(format!("asset {} has no import metadata", asset.uuid)),
            )?;
        if pipeline
            .get("importerVersion")
            .and_then(Value::as_str)
            .map_or(true, str::is_empty)
        {
            return Err(FormatError(format!(
                "asset {} has invalid importerVersion metadata",
                asset.uuid
            )));
        }
        for field in ["sourceHash", "artifactHash"] {
            if !pipeline
                .get(field)
                .and_then(Value::as_str)
                .is_some_and(valid_content_hash)
            {
                return Err(FormatError(format!(
                    "asset {} has invalid {field} metadata",
                    asset.uuid
                )));
            }
        }
        if asset.asset_type == "script" {
            validate_script_asset(asset)?;
        }
    }
    validate_project_metadata(project.extra.get("projectMetadata"))?;
    validate_plugins(project.extra.get("plugins"), &asset_types)?;
    validate_packages(project.extra.get("packages"))?;
    let mut scene_ids = std::collections::HashSet::new();
    for scene in &project.scenes {
        if !is_uuid(&scene.uuid) || !scene_ids.insert(scene.uuid.as_str()) {
            return Err(FormatError(format!(
                "invalid or duplicate scene UUID: {}",
                scene.uuid
            )));
        }
        let entity_ids: std::collections::HashSet<&str> = scene
            .entities
            .iter()
            .map(
                /* 按 entity . uuid . as_str () 读取或转换可选值，保留转换失败分支。 */
                |entity| entity.uuid.as_str(),
            )
            .collect();
        let mut parents = HashMap::<&str, &str>::new();
        for entity in &scene.entities {
            if !is_uuid(&entity.uuid) || !identities.insert(entity.uuid.as_str()) {
                return Err(FormatError(format!(
                    "invalid or duplicate entity UUID: {}",
                    entity.uuid
                )));
            }
            let mut component_kinds = std::collections::HashSet::new();
            for component in &entity.components {
                if !is_standard_component_kind(&component.kind) {
                    return Err(FormatError(format!(
                        "entity {} contains unsupported component kind {}",
                        entity.uuid, component.kind
                    )));
                }
                if !is_uuid(&component.uuid) || !identities.insert(component.uuid.as_str()) {
                    return Err(FormatError(format!(
                        "invalid or duplicate component UUID: {}",
                        component.uuid
                    )));
                }
                if !component_kinds.insert(component.kind.as_str()) {
                    return Err(FormatError(format!(
                        "entity {} contains duplicate component kind {}",
                        entity.uuid, component.kind
                    )));
                }
                if component.kind == "Transform2D" {
                    if let Some(parent) = component.data.get("parentUuid").and_then(Value::as_str) {
                        if !entity_ids.contains(parent) {
                            return Err(FormatError(format!(
                                "entity {} refers to missing parent {}",
                                entity.uuid, parent
                            )));
                        }
                        parents.insert(entity.uuid.as_str(), parent);
                    }
                } else if component.kind == "Script2D" {
                    validate_asset_reference_one_of(
                        component.data.get("scriptAsset"),
                        &["script", "visualScript"],
                        &asset_types,
                    )?;
                } else if component.kind == "SpriteRenderer2D" {
                    validate_asset_reference(
                        component.data.get("spriteAsset"),
                        "image",
                        &asset_types,
                    )?;
                    validate_asset_reference(
                        component.data.get("normalMapAsset"),
                        "image",
                        &asset_types,
                    )?;
                } else if component.kind == "TextRenderer2D" {
                    validate_asset_reference(
                        component.data.get("fontAsset"),
                        "font",
                        &asset_types,
                    )?;
                } else if component.kind == "RhythmChart2D" {
                    validate_asset_reference(
                        component.data.get("chartAsset"),
                        "chart",
                        &asset_types,
                    )?;
                    validate_asset_reference(
                        component.data.get("audioAsset"),
                        "audio",
                        &asset_types,
                    )?;
                    validate_asset_reference(
                        component.data.get("hitSoundAsset"),
                        "audio",
                        &asset_types,
                    )?;
                } else if component.kind == "Animator" {
                    validate_asset_reference(
                        component.data.get("controllerAsset"),
                        "controller",
                        &asset_types,
                    )?;
                } else if component.kind == "Skeleton2D" {
                    validate_asset_reference(component.data.get("rigAsset"), "rig", &asset_types)?;
                    validate_asset_reference(
                        component.data.get("skinAsset"),
                        "skin",
                        &asset_types,
                    )?;
                } else if component.kind == "TimelinePlayer" {
                    validate_asset_reference(
                        component.data.get("timelineAsset"),
                        "timeline",
                        &asset_types,
                    )?;
                } else if component.kind == "AudioSource" {
                    validate_asset_reference(
                        component.data.get("audioClip"),
                        "audio",
                        &asset_types,
                    )?;
                } else if component.kind == "Canvas" {
                    validate_asset_reference(
                        component.data.get("themeAsset"),
                        "uiTheme",
                        &asset_types,
                    )?;
                } else if component.kind == "Image" {
                    validate_asset_reference(
                        component.data.get("spriteAsset"),
                        "image",
                        &asset_types,
                    )?;
                } else if component.kind == "Text" {
                    validate_asset_reference(
                        component.data.get("fontAsset"),
                        "font",
                        &asset_types,
                    )?;
                } else if component.kind == "TileMap2D" {
                    validate_asset_reference(
                        component.data.get("tileSetAsset"),
                        "tileset",
                        &asset_types,
                    )?;
                } else if component.kind == "ParticleEmitter2D" {
                    validate_asset_reference(
                        component.data.get("textureAsset"),
                        "image",
                        &asset_types,
                    )?;
                } else if component.kind == "BehaviorTree2D" {
                    validate_asset_reference(
                        component.data.get("treeAsset"),
                        "behaviorTree",
                        &asset_types,
                    )?;
                } else if component.kind == "StateMachine2D" {
                    validate_asset_reference(
                        component.data.get("machineAsset"),
                        "stateMachine",
                        &asset_types,
                    )?;
                } else if component.kind == "ObjectPool2D" {
                    validate_asset_reference(
                        component.data.get("prefabAsset"),
                        "prefab",
                        &asset_types,
                    )?;
                } else if matches!(
                    component.kind.as_str(),
                    "FixedJoint2D"
                        | "WeldJoint2D"
                        | "DistanceJoint2D"
                        | "RopeJoint2D"
                        | "RevoluteJoint2D"
                        | "MotorJoint2D"
                        | "PrismaticJoint2D"
                        | "SpringJoint2D"
                ) {
                    if let Some(target) = component
                        .data
                        .get("targetEntityUuid")
                        .and_then(Value::as_str)
                    {
                        if !entity_ids.contains(target) || target == entity.uuid {
                            return Err(FormatError(format!(
                                "joint {} refers to an invalid target entity {}",
                                component.uuid, target
                            )));
                        }
                    }
                }
            }
            if !component_kinds.contains("Transform2D") {
                return Err(FormatError(format!(
                    "entity {} is missing mandatory Transform2D",
                    entity.uuid
                )));
            }
            if component_kinds.contains("CharacterBody2D")
                && !component_kinds.contains("RigidBody2D")
            {
                return Err(FormatError(format!(
                    "entity {} CharacterBody2D requires RigidBody2D",
                    entity.uuid
                )));
            }
            if component_kinds.contains("Area2D")
                && !component_kinds
                    .iter()
                    .any(/* 计算并返回 kind . ends_with ("Collider2D")，用于当前 validate_project 流程。 */ |kind| kind.ends_with("Collider2D"))
            {
                return Err(FormatError(format!(
                    "entity {} Area2D requires a Collider2D",
                    entity.uuid
                )));
            }
            validate_asset_reference(entity.extra.get("prefabAsset"), "prefab", &asset_types)?;
            validate_asset_reference(entity.extra.get("sceneAsset"), "scene", &asset_types)?;
        }
        for connection in &scene.connections {
            if !is_uuid(&connection.uuid) || !identities.insert(connection.uuid.as_str()) {
                return Err(FormatError(format!(
                    "invalid or duplicate connection UUID: {}",
                    connection.uuid
                )));
            }
            for anchor in &connection.anchors {
                if let Some(entity_uuid) = anchor.get("entityUuid").and_then(Value::as_str) {
                    if !entity_ids.contains(entity_uuid) {
                        return Err(FormatError(format!(
                            "connection {} refers to missing entity {}",
                            connection.uuid, entity_uuid
                        )));
                    }
                }
            }
        }
        for entity_uuid in &entity_ids {
            let mut visited = std::collections::HashSet::new();
            let mut current = Some(*entity_uuid);
            while let Some(uuid) = current {
                if !visited.insert(uuid) {
                    return Err(FormatError(format!(
                        "parent cycle detected at entity {uuid}"
                    )));
                }
                current = parents.get(uuid).copied();
            }
        }
    }
    if !scene_ids.contains(project.active_scene_uuid.as_str()) {
        return Err(FormatError(
            "activeSceneUuid does not identify a saved scene".into(),
        ));
    }
    Ok(())
}

// 检查资源引用存在且类型符合组件要求。
fn validate_asset_reference(
    value: Option<&Value>,
    expected_type: &str,
    asset_types: &HashMap<&str, &str>,
) -> Result<(), FormatError> {
    let Some(reference) = value.and_then(Value::as_str) else {
        return Ok(());
    };
    let Some(uuid) = reference.strip_prefix("asset://") else {
        return Err(FormatError(format!("invalid asset reference: {reference}")));
    };
    let Some(actual_type) = asset_types.get(uuid) else {
        return Err(FormatError(format!(
            "asset reference points to missing asset: {uuid}"
        )));
    };
    if *actual_type != expected_type {
        return Err(FormatError(format!(
            "asset {uuid} has type {actual_type}, expected {expected_type}"
        )));
    }
    Ok(())
}

// 检查资源引用属于允许类型集合中的一种。
fn validate_asset_reference_one_of(
    value: Option<&Value>,
    expected_types: &[&str],
    asset_types: &HashMap<&str, &str>,
) -> Result<(), FormatError> {
    let Some(reference) = value.and_then(Value::as_str) else {
        return Ok(());
    };
    let Some(uuid) = reference.strip_prefix("asset://") else {
        return Err(FormatError(format!("invalid asset reference: {reference}")));
    };
    let Some(actual_type) = asset_types.get(uuid) else {
        return Err(FormatError(format!(
            "asset reference points to missing asset: {uuid}"
        )));
    };
    if !expected_types.contains(actual_type) {
        return Err(FormatError(format!(
            "asset {uuid} has type {actual_type}, expected one of {}",
            expected_types.join(", ")
        )));
    }
    Ok(())
}

// 判断组件名称是否属于当前内置组件集合。
fn is_standard_component_kind(kind: &str) -> bool {
    matches!(
        kind,
        "Transform2D"
            | "Camera2D"
            | "SpriteRenderer2D"
            | "ShapeRenderer2D"
            | "TextRenderer2D"
            | "RigidBody2D"
            | "BoxCollider2D"
            | "EllipseCollider2D"
            | "PolygonCollider2D"
            | "FixedJoint2D"
            | "WeldJoint2D"
            | "DistanceJoint2D"
            | "RopeJoint2D"
            | "RevoluteJoint2D"
            | "MotorJoint2D"
            | "PrismaticJoint2D"
            | "SpringJoint2D"
            | "WheelJoint2D"
            | "TargetJoint2D"
            | "Rope2D"
            | "Script2D"
            | "Animator"
            | "Skeleton2D"
            | "TimelinePlayer"
            | "AudioSource"
            | "AudioListener"
            | "ParticleEmitter2D"
            | "Light2D"
            | "ShadowCaster2D"
            | "Canvas"
            | "RectTransform"
            | "Panel"
            | "Image"
            | "Text"
            | "Button"
            | "Slider"
            | "ProgressBar"
            | "Checkbox"
            | "TextInput"
            | "TileMap2D"
            | "CharacterBody2D"
            | "GridMover2D"
            | "PlatformController2D"
            | "TopDownController2D"
            | "Health2D"
            | "DamageHitbox2D"
            | "Collectible2D"
            | "Projectile2D"
            | "Spawner2D"
            | "Cooldown2D"
            | "Lifetime2D"
            | "MouseFollower2D"
            | "CameraFollow2D"
            | "Area2D"
            | "AreaEffector2D"
            | "NavigationRegion2D"
            | "NavigationObstacle2D"
            | "NavigationAgent2D"
            | "BehaviorTree2D"
            | "StateMachine2D"
            | "WorldChunk2D"
            | "Portal2D"
            | "ObjectPool2D"
            | "RhythmChart2D"
    )
}

// 检查工程标识和展示元数据，拒绝超出约束的字段。
fn validate_project_metadata(value: Option<&Value>) -> Result<(), FormatError> {
    let metadata = value.and_then(Value::as_object).ok_or_else(
        /* 构造工程格式错误，标明失败条件：projectMetadata must be an object。 */
        || FormatError("projectMetadata must be an object".into()),
    )?;
    let id = metadata.get("id").and_then(Value::as_str).unwrap_or("");
    let name = metadata.get("name").and_then(Value::as_str).unwrap_or("");
    if !is_uuid(id) {
        return Err(FormatError("projectMetadata.id must be a UUID".into()));
    }
    if name.trim().is_empty() || name.chars().count() > 80 {
        return Err(FormatError(
            "projectMetadata.name must contain 1 to 80 characters".into(),
        ));
    }
    if metadata.get("format").and_then(Value::as_str) != Some(PROJECT_FORMAT_NAME) {
        return Err(FormatError(
            "projectMetadata.format must identify Nova_A Project Format 2".into(),
        ));
    }
    Ok(())
}

// 检查反向域名标识符各段的字符与结构。
fn valid_reverse_domain_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 120
        && value.contains('.')
        && value.chars().all(/* 判断 character . is_ascii_lowercase () || character . is_ascii_digit () || matches ! (character , '.' | '-') 是否成立，供过滤或有效性检查使用。 */ |character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || matches!(character, '.' | '-')
        })
}

// 检查插件标识、版本及其声明的配置与权限。
fn validate_plugins(
    value: Option<&Value>,
    asset_types: &HashMap<&str, &str>,
) -> Result<(), FormatError> {
    let plugins = value.and_then(Value::as_array).ok_or_else(
        /* 构造工程格式错误，标明失败条件：plugins must be an array。 */
        || FormatError("plugins must be an array".into()),
    )?;
    if plugins.len() > 256 {
        return Err(FormatError(
            "a project cannot configure more than 256 plugins".into(),
        ));
    }
    let mut ids = std::collections::HashSet::new();
    for plugin in plugins {
        let plugin = plugin.as_object().ok_or_else(
            /* 构造工程格式错误，标明失败条件：every plugin manifest must be an object。 */
            || FormatError("every plugin manifest must be an object".into()),
        )?;
        let id = plugin.get("id").and_then(Value::as_str).unwrap_or("");
        let name = plugin.get("name").and_then(Value::as_str).unwrap_or("");
        let entry = plugin.get("entry").and_then(Value::as_str).unwrap_or("");
        if !valid_reverse_domain_id(id) || !ids.insert(id) {
            return Err(FormatError(format!("invalid or duplicate plugin id: {id}")));
        }
        if name.trim().is_empty() || name.chars().count() > 120 {
            return Err(FormatError(format!("plugin {id} has an invalid name")));
        }
        let api_version = plugin.get("apiVersion").and_then(Value::as_u64);
        if !matches!(api_version, Some(1 | 2)) {
            return Err(FormatError(format!(
                "plugin {id} does not target Nova_A WASM Plugin API 1 or 2"
            )));
        }
        let entry_type = plugin
            .get("entryType")
            .and_then(Value::as_str)
            .unwrap_or("wasm");
        if !matches!(entry_type, "wasm" | "native") {
            return Err(FormatError(format!(
                "plugin {id} has an invalid entry type"
            )));
        }
        if (entry_type == "wasm" && !entry.ends_with(".wasm"))
            || entry.contains("..")
            || entry.contains('\\')
            || entry.starts_with('/')
        {
            return Err(FormatError(format!("plugin {id} has an unsafe entry path")));
        }
        let permissions = plugin
            .get("permissions")
            .and_then(Value::as_array)
            .ok_or_else(
                /* 构造工程格式错误，标明失败条件：plugin {id} permissions must be an array。 */
                || FormatError(format!("plugin {id} permissions must be an array")),
            )?;
        if permissions.iter().any(
            /* 判断插件权限是否超出明确列举的编辑器与运行时允许项。 */
            |permission| {
                !matches!(
                    permission.as_str(),
                    Some(
                        "log"
                            | "events"
                            | "editor.commands"
                            | "editor.menus"
                            | "editor.panels"
                            | "editor.importers"
                            | "editor.assets"
                            | "editor.components"
                            | "editor.inspectors"
                            | "editor.gizmos"
                            | "editor.settings"
                            | "build.hooks"
                            | "runtime.systems"
                    )
                )
            },
        ) {
            return Err(FormatError(format!(
                "plugin {id} requests an unsupported permission"
            )));
        }
        if api_version == Some(1)
            && permissions
                .iter()
                .any(/* 判断 ! matches ! (permission . as_str () , Some ("log" | "events")) 是否成立，供过滤或有效性检查使用。 */ |permission| !matches!(permission.as_str(), Some("log" | "events")))
        {
            return Err(FormatError(format!(
                "Plugin API 1 manifest {id} requests an API 2 capability"
            )));
        }
        if entry_type == "wasm" {
            validate_asset_reference(plugin.get("entryAsset"), "other", asset_types)?;
        }
    }
    Ok(())
}

// 检查包清单的来源、身份和受支持的配置边界。
fn validate_packages(value: Option<&Value>) -> Result<(), FormatError> {
    let packages = value.and_then(Value::as_object).ok_or_else(
        /* 构造工程格式错误，标明失败条件：packages must be an object。 */
        || FormatError("packages must be an object".into()),
    )?;
    if packages.get("manifestVersion").and_then(Value::as_u64) != Some(1) {
        return Err(FormatError("packages.manifestVersion must be 1".into()));
    }
    for field in ["installed", "lockfile", "offlineCache"] {
        let entries = packages.get(field).and_then(Value::as_array).ok_or_else(
            /* 构造工程格式错误，标明失败条件：packages.{field} must be an array。 */
            || FormatError(format!("packages.{field} must be an array")),
        )?;
        if entries.len() > 2048 {
            return Err(FormatError(format!("packages.{field} is too large")));
        }
    }
    let mut ids = std::collections::HashSet::new();
    for installed in packages["installed"].as_array().expect("validated array") {
        let item = installed.as_object().ok_or_else(
            /* 构造工程格式错误，标明失败条件：every installed package must be an object。 */
            || FormatError("every installed package must be an object".into()),
        )?;
        let manifest = item.get("manifest").and_then(Value::as_object).ok_or_else(
            /* 构造工程格式错误，标明失败条件：installed package manifest must be an object。 */
            || FormatError("installed package manifest must be an object".into()),
        )?;
        let id = manifest.get("id").and_then(Value::as_str).unwrap_or("");
        if !valid_reverse_domain_id(id) || !ids.insert(id) {
            return Err(FormatError(format!(
                "invalid or duplicate package id: {id}"
            )));
        }
        if manifest.get("manifestVersion").and_then(Value::as_u64) != Some(1) {
            return Err(FormatError(format!(
                "package {id} manifestVersion must be 1"
            )));
        }
        let source = item.get("source").and_then(Value::as_object).ok_or_else(
            /* 构造工程格式错误，标明失败条件：package {id} source must be an object。 */
            || FormatError(format!("package {id} source must be an object")),
        )?;
        if !matches!(
            source.get("kind").and_then(Value::as_str),
            Some("local" | "git" | "registry")
        ) {
            return Err(FormatError(format!("package {id} source is unsupported")));
        }
    }
    if packages
        .get("offlineMode")
        .and_then(Value::as_bool)
        .is_none()
    {
        return Err(FormatError("packages.offlineMode must be a boolean".into()));
    }
    Ok(())
}

// 校验运行、构建、输入、渲染、网络等项目设置及数值上限。
fn validate_project_settings(value: Option<&Value>) -> Result<(), FormatError> {
    let settings = value.and_then(Value::as_object).ok_or_else(
        /* 构造工程格式错误，标明失败条件：projectSettings must be an object。 */
        || FormatError("projectSettings must be an object".into()),
    )?;
    if let Some(scripting) = settings.get("scripting") {
        if !matches!(
            scripting.get("apiVersion").and_then(Value::as_u64),
            Some(1 | 2)
        ) {
            return Err(FormatError(
                "projectSettings.scripting.apiVersion must be 1 or 2".into(),
            ));
        }
    }
    let actions = settings
        .get("inputMap")
        .and_then(Value::as_array)
        .ok_or_else(
            /* 构造工程格式错误，标明失败条件：projectSettings.inputMap must be an array。 */
            || FormatError("projectSettings.inputMap must be an array".into()),
        )?;
    if let Some(world) = settings.get("world") {
        let world = world.as_object().ok_or_else(
            /* 构造工程格式错误，标明失败条件：projectSettings.world must be an object。 */
            || FormatError("projectSettings.world must be an object".into()),
        )?;
        for key in [
            "navigationDebug",
            "areaDebug",
            "chunkDebug",
            "streamingEnabled",
        ] {
            if !world.get(key).is_some_and(Value::is_boolean) {
                return Err(FormatError(format!(
                    "projectSettings.world.{key} must be a boolean"
                )));
            }
        }
        let memory = world
            .get("memoryBudgetMb")
            .and_then(Value::as_f64)
            .unwrap_or(f64::NAN);
        let threshold = world
            .get("originShiftThreshold")
            .and_then(Value::as_f64)
            .unwrap_or(f64::NAN);
        if !memory.is_finite() || !(1.0..=65_536.0).contains(&memory) {
            return Err(FormatError(
                "projectSettings.world.memoryBudgetMb must be between 1 and 65536".into(),
            ));
        }
        if !threshold.is_finite() || !(1.0..=1.0e12).contains(&threshold) {
            return Err(FormatError(
                "projectSettings.world.originShiftThreshold must be between 1 and 1e12".into(),
            ));
        }
    }
    if let Some(rendering) = settings.get("rendering") {
        let rendering = rendering.as_object().ok_or_else(
            /* 构造工程格式错误，标明失败条件：projectSettings.rendering must be an object。 */
            || FormatError("projectSettings.rendering must be an object".into()),
        )?;
        if !rendering
            .get("lightingEnabled")
            .is_some_and(Value::is_boolean)
        {
            return Err(FormatError(
                "projectSettings.rendering.lightingEnabled must be a boolean".into(),
            ));
        }
        if !matches!(
            rendering.get("shadowQuality").and_then(Value::as_str),
            Some("Off" | "Hard" | "Soft" | "Ultra")
        ) {
            return Err(FormatError(
                "projectSettings.rendering.shadowQuality is unsupported".into(),
            ));
        }
        if !matches!(
            rendering.get("colorSpace").and_then(Value::as_str),
            Some("sRGB" | "Linear")
        ) {
            return Err(FormatError(
                "projectSettings.rendering.colorSpace is unsupported".into(),
            ));
        }
        if !rendering
            .get("postProcessing")
            .is_some_and(Value::is_object)
        {
            return Err(FormatError(
                "projectSettings.rendering.postProcessing must be an object".into(),
            ));
        }
    }
    if let Some(scripting) = settings.get("scripting") {
        let scripting = scripting.as_object().ok_or_else(
            /* 构造工程格式错误，标明失败条件：projectSettings.scripting must be an object。 */
            || FormatError("projectSettings.scripting must be an object".into()),
        )?;
        let signals = scripting
            .get("customSignals")
            .and_then(Value::as_array)
            .ok_or_else(/* 构造工程格式错误，标明失败条件：projectSettings.scripting.customSignals must be an array。 */ || {
                FormatError("projectSettings.scripting.customSignals must be an array".into())
            })?;
        if signals.len() > 256
            || signals.iter().any(/* 判断 ! signal . as_str () . is_some_and (| name | ! name . trim () . is_empty () && name . len () <= 128) 是否成立，供过滤或有效性检查使用。 */ |signal| {
                !signal
                    .as_str()
                    .is_some_and(/* 判断 ! name . trim () . is_empty () && name . len () <= 128 是否成立，供过滤或有效性检查使用。 */ |name| !name.trim().is_empty() && name.len() <= 128)
            })
        {
            return Err(FormatError(
                "projectSettings.scripting.customSignals contains an invalid signal".into(),
            ));
        }
        if !matches!(
            scripting.get("maxConsoleEntries").and_then(Value::as_u64),
            Some(100..=10000)
        ) {
            return Err(FormatError(
                "projectSettings.scripting.maxConsoleEntries must be between 100 and 10000".into(),
            ));
        }
        if !scripting
            .get("debuggerEnabled")
            .is_some_and(Value::is_boolean)
        {
            return Err(FormatError(
                "projectSettings.scripting.debuggerEnabled must be a boolean".into(),
            ));
        }
    }
    if let Some(build) = settings.get("build") {
        let build = build.as_object().ok_or_else(
            /* 构造工程格式错误，标明失败条件：projectSettings.build must be an object。 */
            || FormatError("projectSettings.build must be an object".into()),
        )?;
        let game_name = build
            .get("gameName")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        if game_name.is_empty() || game_name.len() > 80 {
            return Err(FormatError(
                "projectSettings.build.gameName must contain 1 to 80 characters".into(),
            ));
        }
        if !matches!(
            build.get("target").and_then(Value::as_str),
            Some("windows" | "linux" | "macos" | "web" | "android")
        ) {
            return Err(FormatError(
                "projectSettings.build.target is unsupported".into(),
            ));
        }
        if !matches!(
            build.get("architecture").and_then(Value::as_str),
            Some("x86_64" | "aarch64")
        ) {
            return Err(FormatError(
                "projectSettings.build.architecture is unsupported".into(),
            ));
        }
        if !matches!(
            build.get("runtimeMode").and_then(Value::as_str),
            Some("game" | "headless-server")
        ) {
            return Err(FormatError(
                "projectSettings.build.runtimeMode is unsupported".into(),
            ));
        }
        if !build.get("sceneOrder").is_some_and(Value::is_array) {
            return Err(FormatError(
                "projectSettings.build.sceneOrder must be an array".into(),
            ));
        }
        if !matches!(
            build.get("profile").and_then(Value::as_str),
            Some("debug" | "release")
        ) {
            return Err(FormatError(
                "projectSettings.build.profile is unsupported".into(),
            ));
        }
        let platform = build
            .get("platform")
            .and_then(Value::as_object)
            .ok_or_else(/* 构造工程格式错误，标明失败条件：projectSettings.build.platform must be an object。 */ || {
                FormatError("projectSettings.build.platform must be an object".into())
            })?;
        let identifier = platform
            .get("identifier")
            .and_then(Value::as_str)
            .unwrap_or("");
        if identifier.len() > 160
            || identifier.split('.').count() < 2
            || identifier.split('.').any(/* 拒绝空的反向域名分段，以及含小写字母、数字和连字符以外字符的分段。 */ |part| {
                part.is_empty()
                    || !part.chars().all(/* 判断 character . is_ascii_lowercase () || character . is_ascii_digit () || character == '-' 是否成立，供过滤或有效性检查使用。 */ |character| {
                        character.is_ascii_lowercase()
                            || character.is_ascii_digit()
                            || character == '-'
                    })
            })
        {
            return Err(FormatError(
                "projectSettings.build.platform.identifier is invalid".into(),
            ));
        }
        let application_version = platform
            .get("version")
            .and_then(Value::as_str)
            .unwrap_or("");
        if application_version.is_empty()
            || application_version.len() > 40
            || application_version.split('.').count() < 3
        {
            return Err(FormatError(
                "projectSettings.build.platform.version is invalid".into(),
            ));
        }
        if !matches!(
            platform.get("orientation").and_then(Value::as_str),
            Some("auto" | "landscape" | "portrait")
        ) || !matches!(
            platform.get("signingMode").and_then(Value::as_str),
            Some("none" | "manual")
        ) {
            return Err(FormatError(
                "projectSettings.build.platform options are invalid".into(),
            ));
        }
        let permissions = platform
            .get("permissions")
            .and_then(Value::as_array)
            .ok_or_else(/* 构造工程格式错误，标明失败条件：projectSettings.build.platform.permissions must be an array。 */ || {
                FormatError("projectSettings.build.platform.permissions must be an array".into())
            })?;
        if permissions.len() > 64
            || permissions.iter().any(/* 判断 ! value . as_str () . is_some_and (| text | ! text . is_empty () && text . len () <= 120) 是否成立，供过滤或有效性检查使用。 */ |value| {
                !value
                    .as_str()
                    .is_some_and(/* 判断 ! text . is_empty () && text . len () <= 120 是否成立，供过滤或有效性检查使用。 */ |text| !text.is_empty() && text.len() <= 120)
            })
        {
            return Err(FormatError(
                "projectSettings.build.platform.permissions is invalid".into(),
            ));
        }
        let delivery = build
            .get("delivery")
            .and_then(Value::as_object)
            .ok_or_else(/* 构造工程格式错误，标明失败条件：projectSettings.build.delivery must be an object。 */ || {
                FormatError("projectSettings.build.delivery must be an object".into())
            })?;
        for key in [
            "deterministic",
            "incremental",
            "patchManifest",
            "structuredLogs",
            "crashReports",
            "telemetryEnabled",
        ] {
            if !delivery.get(key).is_some_and(Value::is_boolean) {
                return Err(FormatError(format!(
                    "projectSettings.build.delivery.{key} must be a boolean"
                )));
            }
        }
        if !matches!(
            delivery.get("compression").and_then(Value::as_str),
            Some("store" | "balanced" | "maximum")
        ) {
            return Err(FormatError(
                "projectSettings.build.delivery.compression is unsupported".into(),
            ));
        }
        if delivery.get("telemetryEnabled").and_then(Value::as_bool) == Some(true) {
            for key in ["telemetryEndpoint", "privacyPolicyUrl"] {
                if !delivery
                    .get(key)
                    .and_then(Value::as_str)
                    .is_some_and(/* 判断 url . starts_with ("https://") && url . len () <= 500 是否成立，供过滤或有效性检查使用。 */ |url| url.starts_with("https://") && url.len() <= 500)
                {
                    return Err(FormatError(format!(
                        "projectSettings.build.delivery.{key} must be a bounded HTTPS URL"
                    )));
                }
            }
        }
    }
    if let Some(audio) = settings.get("audio") {
        let audio = audio.as_object().ok_or_else(
            /* 构造工程格式错误，标明失败条件：projectSettings.audio must be an object。 */
            || FormatError("projectSettings.audio must be an object".into()),
        )?;
        let unit_gain = /* 读取总线增益并要求其为零到一之间的数字，错误中保留总线名称。 */ |name: &str, value: Option<&Value>| -> Result<(), FormatError> {
            let gain = value
                .and_then(Value::as_f64)
                .ok_or_else(/* 构造工程格式错误，标明失败条件：{name} must be a number。 */ || FormatError(format!("{name} must be a number")))?;
            if !(0.0..=1.0).contains(&gain) {
                return Err(FormatError(format!("{name} must be between 0 and 1")));
            }
            Ok(())
        };
        unit_gain(
            "projectSettings.audio.masterVolume",
            audio.get("masterVolume"),
        )?;
        if !matches!(
            audio.get("sampleRate").and_then(Value::as_u64),
            Some(44100 | 48000 | 96000)
        ) {
            return Err(FormatError(
                "projectSettings.audio.sampleRate is unsupported".into(),
            ));
        }
        let buses = audio.get("buses").and_then(Value::as_object).ok_or_else(
            /* 构造工程格式错误，标明失败条件：projectSettings.audio.buses must be an object。 */
            || FormatError("projectSettings.audio.buses must be an object".into()),
        )?;
        for bus in ["Master", "Music", "SFX", "UI"] {
            unit_gain(
                &format!("projectSettings.audio.buses.{bus}"),
                buses.get(bus),
            )?;
        }
        if let Some(mixer) = audio.get("mixer") {
            let mixer = mixer.as_object().ok_or_else(/* 构造工程格式错误，标明失败条件：projectSettings.audio.mixer must be an object。 */ || {
                FormatError("projectSettings.audio.mixer must be an object".into())
            })?;
            let mixer_buses = mixer
                .get("buses")
                .and_then(Value::as_array)
                .ok_or_else(/* 构造工程格式错误，标明失败条件：projectSettings.audio.mixer.buses must be an array。 */ || {
                    FormatError("projectSettings.audio.mixer.buses must be an array".into())
                })?;
            if mixer_buses.is_empty() || mixer_buses.len() > 32 {
                return Err(FormatError("audio mixer must contain 1 to 32 buses".into()));
            }
            let mut bus_ids = std::collections::HashSet::new();
            for bus in mixer_buses {
                let bus = bus.as_object().ok_or_else(
                    /* 构造工程格式错误，标明失败条件：every audio mixer bus must be an object。 */
                    || FormatError("every audio mixer bus must be an object".into()),
                )?;
                let id = bus.get("id").and_then(Value::as_str).ok_or_else(
                    /* 构造工程格式错误，标明失败条件：audio mixer bus id must be a string。 */
                    || FormatError("audio mixer bus id must be a string".into()),
                )?;
                if id.is_empty() || id.len() > 80 || !bus_ids.insert(id) {
                    return Err(FormatError(
                        "audio mixer bus ids must be unique and non-empty".into(),
                    ));
                }
                unit_gain("projectSettings.audio.mixer.bus.gain", bus.get("gain"))?;
                if !bus.get("voiceLimit").and_then(Value::as_u64).is_some_and(
                    /* 判断 (1 ..= 512) . contains (& value) 是否成立，供过滤或有效性检查使用。 */
                    |value| (1..=512).contains(&value),
                ) {
                    return Err(FormatError(
                        "audio mixer voiceLimit must be between 1 and 512".into(),
                    ));
                }
                if !bus.get("effects").and_then(Value::as_array).is_some_and(
                    /* 判断 values . len () <= 8 是否成立，供过滤或有效性检查使用。 */
                    |values| values.len() <= 8,
                ) || !bus.get("sends").and_then(Value::as_array).is_some_and(
                    /* 判断 values . len () <= 16 是否成立，供过滤或有效性检查使用。 */
                    |values| values.len() <= 16,
                ) {
                    return Err(FormatError(
                        "audio mixer buses allow at most 8 effects and 16 sends".into(),
                    ));
                }
            }
            if !bus_ids.contains("Master") {
                return Err(FormatError("audio mixer requires a Master bus".into()));
            }
            if !mixer
                .get("masterVoiceLimit")
                .and_then(Value::as_u64)
                .is_some_and(
                    /* 判断 (1 ..= 1024) . contains (& value) 是否成立，供过滤或有效性检查使用。 */
                    |value| (1..=1024).contains(&value),
                )
            {
                return Err(FormatError(
                    "audio mixer masterVoiceLimit must be between 1 and 1024".into(),
                ));
            }
        }
    }
    if let Some(presentation) = settings.get("presentation") {
        let presentation = presentation.as_object().ok_or_else(
            /* 构造工程格式错误，标明失败条件：projectSettings.presentation must be an object。 */
            || FormatError("projectSettings.presentation must be an object".into()),
        )?;
        let localization = presentation
            .get("localization")
            .and_then(Value::as_object)
            .ok_or_else(/* 构造工程格式错误，标明失败条件：projectSettings.presentation.localization must be an object。 */ || {
                FormatError("projectSettings.presentation.localization must be an object".into())
            })?;
        for key in ["sourceLocale", "previewLocale"] {
            if !localization
                .get(key)
                .and_then(Value::as_str)
                .is_some_and(/* 判断 ! value . is_empty () && value . len () <= 35 是否成立，供过滤或有效性检查使用。 */ |value| !value.is_empty() && value.len() <= 35)
            {
                return Err(FormatError(format!(
                    "projectSettings.presentation.localization.{key} is invalid"
                )));
            }
        }
        if !matches!(
            localization
                .get("pseudolocalizationMode")
                .and_then(Value::as_str),
            Some("accented" | "expanded" | "bidi")
        ) || !localization
            .get("expansionRatio")
            .and_then(Value::as_f64)
            .is_some_and(/* 判断 value . is_finite () && (0.0 ..= 2.0) . contains (& value) 是否成立，供过滤或有效性检查使用。 */ |value| value.is_finite() && (0.0..=2.0).contains(&value))
        {
            return Err(FormatError(
                "projectSettings.presentation localization pseudolocalization settings are invalid"
                    .into(),
            ));
        }
        for key in ["fallbackChain", "buildLocales"] {
            if !localization
                .get(key)
                .and_then(Value::as_array)
                .is_some_and(/* 判断 values . len () <= 64 && values . iter () . all (Value :: is_string) 是否成立，供过滤或有效性检查使用。 */ |values| values.len() <= 64 && values.iter().all(Value::is_string))
            {
                return Err(FormatError(format!("projectSettings.presentation.localization.{key} must be a bounded string array")));
            }
        }
        let accessibility = presentation
            .get("accessibility")
            .and_then(Value::as_object)
            .ok_or_else(/* 构造工程格式错误，标明失败条件：projectSettings.presentation.accessibility must be an object。 */ || {
                FormatError("projectSettings.presentation.accessibility must be an object".into())
            })?;
        for key in [
            "keyboardNavigation",
            "gamepadNavigation",
            "screenReaderMetadata",
            "reducedMotion",
            "highContrast",
            "announceFocusChanges",
        ] {
            if !accessibility.get(key).is_some_and(Value::is_boolean) {
                return Err(FormatError(format!(
                    "projectSettings.presentation.accessibility.{key} must be a boolean"
                )));
            }
        }
        if !accessibility
            .get("focusRingWidth")
            .and_then(Value::as_f64)
            .is_some_and(/* 判断 value . is_finite () && (1.0 ..= 12.0) . contains (& value) 是否成立，供过滤或有效性检查使用。 */ |value| value.is_finite() && (1.0..=12.0).contains(&value))
        {
            return Err(FormatError("projectSettings.presentation.accessibility.focusRingWidth must be between 1 and 12".into()));
        }
        if !accessibility
            .get("textScale")
            .and_then(Value::as_f64)
            .is_some_and(/* 判断 value . is_finite () && (0.75 ..= 3.0) . contains (& value) 是否成立，供过滤或有效性检查使用。 */ |value| value.is_finite() && (0.75..=3.0).contains(&value))
            || !accessibility
                .get("minimumTargetSize")
                .and_then(Value::as_f64)
                .is_some_and(/* 判断 value . is_finite () && (24.0 ..= 128.0) . contains (& value) 是否成立，供过滤或有效性检查使用。 */ |value| value.is_finite() && (24.0..=128.0).contains(&value))
        {
            return Err(FormatError(
                "projectSettings.presentation accessibility scale or target size is invalid".into(),
            ));
        }
        let ui_audio = presentation
            .get("uiAudio")
            .and_then(Value::as_object)
            .ok_or_else(/* 构造工程格式错误，标明失败条件：projectSettings.presentation.uiAudio must be an object。 */ || {
                FormatError("projectSettings.presentation.uiAudio must be an object".into())
            })?;
        if !ui_audio
            .get("bus")
            .and_then(Value::as_str)
            .is_some_and(/* 判断 ! value . trim () . is_empty () && value . len () <= 80 是否成立，供过滤或有效性检查使用。 */ |value| !value.trim().is_empty() && value.len() <= 80)
        {
            return Err(FormatError(
                "projectSettings.presentation.uiAudio.bus is invalid".into(),
            ));
        }
    }
    if let Some(production) = settings.get("production") {
        let production = production.as_object().ok_or_else(
            /* 构造工程格式错误，标明失败条件：projectSettings.production must be an object。 */
            || FormatError("projectSettings.production must be an object".into()),
        )?;
        let bounded_u64 = /* 检查生产配置的无符号整数字段是否处于调用方给定上下界。 */ |path: &str, value: Option<&Value>, minimum: u64, maximum: u64| {
            if !value
                .and_then(Value::as_u64)
                .is_some_and(/* 判断 (minimum ..= maximum) . contains (& number) 是否成立，供过滤或有效性检查使用。 */ |number| (minimum..=maximum).contains(&number))
            {
                return Err(FormatError(format!(
                    "projectSettings.production.{path} must be between {minimum} and {maximum}"
                )));
            }
            Ok(())
        };
        let bounded_f64 = /* 检查生产配置的浮点字段是否有限并位于调用方给定上下界。 */ |path: &str, value: Option<&Value>, minimum: f64, maximum: f64| {
            if !value
                .and_then(Value::as_f64)
                .is_some_and(/* 判断 number . is_finite () && (minimum ..= maximum) . contains (& number) 是否成立，供过滤或有效性检查使用。 */ |number| number.is_finite() && (minimum..=maximum).contains(&number))
            {
                return Err(FormatError(format!(
                    "projectSettings.production.{path} must be finite and between {minimum} and {maximum}"
                )));
            }
            Ok(())
        };
        let performance = production
            .get("performance")
            .and_then(Value::as_object)
            .ok_or_else(/* 构造工程格式错误，标明失败条件：projectSettings.production.performance must be an object。 */ || {
                FormatError("projectSettings.production.performance must be an object".into())
            })?;
        bounded_u64(
            "performance.traceCapacity",
            performance.get("traceCapacity"),
            60,
            10_000,
        )?;
        bounded_f64(
            "performance.memoryBudgetMb",
            performance.get("memoryBudgetMb"),
            16.0,
            65_536.0,
        )?;
        bounded_f64(
            "performance.assetBudgetMb",
            performance.get("assetBudgetMb"),
            1.0,
            1_048_576.0,
        )?;
        bounded_u64(
            "performance.leakWindowFrames",
            performance.get("leakWindowFrames"),
            60,
            60_000,
        )?;
        bounded_u64(
            "performance.lifetimeCapacity",
            performance.get("lifetimeCapacity"),
            100,
            20_000,
        )?;

        let replay = production
            .get("replay")
            .and_then(Value::as_object)
            .ok_or_else(/* 构造工程格式错误，标明失败条件：projectSettings.production.replay must be an object。 */ || {
                FormatError("projectSettings.production.replay must be an object".into())
            })?;
        bounded_u64("replay.seed", replay.get("seed"), 0, u32::MAX as u64)?;
        bounded_u64("replay.capacity", replay.get("capacity"), 60, 60_000)?;
        if !replay.get("strictChecksums").is_some_and(Value::is_boolean) {
            return Err(FormatError(
                "projectSettings.production.replay.strictChecksums must be a boolean".into(),
            ));
        }

        let testing = production
            .get("testing")
            .and_then(Value::as_object)
            .ok_or_else(/* 构造工程格式错误，标明失败条件：projectSettings.production.testing must be an object。 */ || {
                FormatError("projectSettings.production.testing must be an object".into())
            })?;
        bounded_u64(
            "testing.defaultTimeoutMs",
            testing.get("defaultTimeoutMs"),
            100,
            120_000,
        )?;
        let tests = testing
            .get("tests")
            .and_then(Value::as_array)
            .ok_or_else(/* 构造工程格式错误，标明失败条件：projectSettings.production.testing.tests must be an array。 */ || {
                FormatError("projectSettings.production.testing.tests must be an array".into())
            })?;
        if tests.len() > 256 {
            return Err(FormatError(
                "project tests are limited to 256 entries".into(),
            ));
        }
        let mut test_ids = std::collections::HashSet::new();
        for test in tests {
            let test = test.as_object().ok_or_else(
                /* 构造工程格式错误，标明失败条件：every project test must be an object。 */
                || FormatError("every project test must be an object".into()),
            )?;
            let id = test.get("id").and_then(Value::as_str).unwrap_or("");
            let name = test.get("name").and_then(Value::as_str).unwrap_or("");
            if id.is_empty()
                || id.len() > 80
                || !test_ids.insert(id)
                || name.is_empty()
                || name.len() > 120
            {
                return Err(FormatError(
                    "project tests require unique bounded ids and names".into(),
                ));
            }
            if !matches!(
                test.get("kind").and_then(Value::as_str),
                Some(
                    "unit"
                        | "scene"
                        | "integration"
                        | "headless"
                        | "ui"
                        | "physics"
                        | "animation"
                        | "regression"
                )
            ) {
                return Err(FormatError(format!(
                    "project test {id} has an unsupported kind"
                )));
            }
            bounded_u64("testing.test.steps", test.get("steps"), 0, 60_000)?;
            bounded_u64(
                "testing.test.timeoutMs",
                test.get("timeoutMs"),
                100,
                120_000,
            )?;
            if !test.get("captureScreenshot").is_some_and(Value::is_boolean)
                || !test
                    .get("assertions")
                    .and_then(Value::as_array)
                    .is_some_and(
                        /* 判断 items . len () <= 64 是否成立，供过滤或有效性检查使用。 */
                        |items| items.len() <= 64,
                    )
            {
                return Err(FormatError(format!(
                    "project test {id} has invalid assertions or screenshot settings"
                )));
            }
        }

        let data = production
            .get("data")
            .and_then(Value::as_object)
            .ok_or_else(/* 构造工程格式错误，标明失败条件：projectSettings.production.data must be an object。 */ || {
                FormatError("projectSettings.production.data must be an object".into())
            })?;
        bounded_u64(
            "data.saveSchemaVersion",
            data.get("saveSchemaVersion"),
            1,
            65_535,
        )?;
        let migrations = data
            .get("saveMigrations")
            .and_then(Value::as_array)
            .ok_or_else(/* 构造工程格式错误，标明失败条件：projectSettings.production.data.saveMigrations must be an array。 */ || {
                FormatError(
                    "projectSettings.production.data.saveMigrations must be an array".into(),
                )
            })?;
        if migrations.len() > 128 {
            return Err(FormatError(
                "save-data migrations are limited to 128 entries".into(),
            ));
        }
        for migration in migrations {
            let migration = migration.as_object().ok_or_else(
                /* 构造工程格式错误，标明失败条件：every save-data migration must be an object。 */
                || FormatError("every save-data migration must be an object".into()),
            )?;
            let from = migration
                .get("fromVersion")
                .and_then(Value::as_u64)
                .unwrap_or(u64::MAX);
            let to = migration
                .get("toVersion")
                .and_then(Value::as_u64)
                .unwrap_or(0);
            if from >= to
                || to > 65_535
                || !migration.get("renames").is_some_and(Value::is_object)
                || !migration.get("defaults").is_some_and(Value::is_object)
                || !migration
                    .get("remove")
                    .and_then(Value::as_array)
                    .is_some_and(
                        /* 判断 items . len () <= 256 是否成立，供过滤或有效性检查使用。 */
                        |items| items.len() <= 256,
                    )
            {
                return Err(FormatError(
                    "save-data migration is invalid or unbounded".into(),
                ));
            }
        }

        let jobs = production
            .get("jobs")
            .and_then(Value::as_object)
            .ok_or_else(/* 构造工程格式错误，标明失败条件：projectSettings.production.jobs must be an object。 */ || {
                FormatError("projectSettings.production.jobs must be an object".into())
            })?;
        bounded_u64("jobs.maxWorkers", jobs.get("maxWorkers"), 1, 8)?;
        bounded_u64("jobs.maxQueued", jobs.get("maxQueued"), 8, 2_048)?;
        bounded_u64("jobs.timeoutMs", jobs.get("timeoutMs"), 100, 120_000)?;

        let networking = production
            .get("networking")
            .and_then(Value::as_object)
            .ok_or_else(/* 构造工程格式错误，标明失败条件：projectSettings.production.networking must be an object。 */ || {
                FormatError("projectSettings.production.networking must be an object".into())
            })?;
        if !networking.get("enabled").is_some_and(Value::is_boolean)
            || !networking.get("reconnect").is_some_and(Value::is_boolean)
            || !matches!(
                networking.get("role").and_then(Value::as_str),
                Some("client" | "server" | "host")
            )
            || !matches!(
                networking.get("transport").and_then(Value::as_str),
                Some("websocket" | "native-udp")
            )
        {
            return Err(FormatError(
                "production networking lifecycle settings are invalid".into(),
            ));
        }
        for key in [
            "permissionGranted",
            "autoStart",
            "lateJoin",
            "allowAuthorityTransfer",
            "allowSceneHandoff",
        ] {
            if !networking.get(key).is_some_and(Value::is_boolean) {
                return Err(FormatError(format!(
                    "production networking {key} must be a boolean"
                )));
            }
        }
        if !matches!(
            networking.get("sessionMode").and_then(Value::as_str),
            Some("local" | "direct")
        ) {
            return Err(FormatError(
                "production networking sessionMode is invalid".into(),
            ));
        }
        for key in ["sessionName", "playerName"] {
            if !networking
                .get(key)
                .and_then(Value::as_str)
                .is_some_and(/* 判断 ! text . trim () . is_empty () && text . len () <= 80 是否成立，供过滤或有效性检查使用。 */ |text| !text.trim().is_empty() && text.len() <= 80)
            {
                return Err(FormatError(format!(
                    "production networking {key} is invalid"
                )));
            }
        }
        let is_provider_id = /* 检查网络名称长度、可选空值策略及字母数字和下划线点连字符集合。 */ |value: Option<&Value>, allow_empty: bool| {
            value.and_then(Value::as_str).is_some_and(/* 验证名称长度不超过八十，并按空值策略与允许字符集合筛选。 */ |text| {
                text.len() <= 80
                    && (allow_empty || !text.is_empty())
                    && text
                        .bytes()
                        .all(/* 判断 byte . is_ascii_alphanumeric () || b"_.-" . contains (& byte) 是否成立，供过滤或有效性检查使用。 */ |byte| byte.is_ascii_alphanumeric() || b"_.-".contains(&byte))
            })
        };
        if !is_provider_id(networking.get("transportAdapterId"), true) {
            return Err(FormatError(
                "production networking transportAdapterId is invalid".into(),
            ));
        }
        for (key, minimum, maximum) in [
            ("maxPeers", 1, 64),
            ("reconnectMaxAttempts", 0, 32),
            ("protocolVersion", 2, 2),
            ("schemaVersion", 1, 65_535),
            ("maximumPacketBytes", 512, 65_507),
            ("maximumMessagesPerSecond", 1, 10_000),
            ("maximumPendingReliable", 1, 4_096),
            ("reliableRetryMs", 10, 5_000),
            ("reliableMaximumAttempts", 1, 32),
        ] {
            if networking.contains_key(key) {
                bounded_u64(
                    &format!("networking.{key}"),
                    networking.get(key),
                    minimum,
                    maximum,
                )?;
            }
        }
        if networking.contains_key("reconciliationThreshold") {
            bounded_f64(
                "networking.reconciliationThreshold",
                networking.get("reconciliationThreshold"),
                0.0,
                1_000.0,
            )?;
        }
        let authentication = networking
            .get("authentication")
            .and_then(Value::as_object)
            .ok_or_else(
                /* 构造工程格式错误，标明失败条件：networking.authentication must be an object。 */
                || FormatError("networking.authentication must be an object".into()),
            )?;
        let authentication_mode = authentication.get("mode").and_then(Value::as_str);
        if !matches!(authentication_mode, Some("none" | "hook"))
            || !authentication
                .get("requireVerifiedPeers")
                .is_some_and(Value::is_boolean)
            || !is_provider_id(authentication.get("providerId"), true)
        {
            return Err(FormatError(
                "networking authentication configuration is invalid".into(),
            ));
        }
        if authentication_mode == Some("hook")
            && !is_provider_id(authentication.get("providerId"), false)
        {
            return Err(FormatError(
                "networking hook authentication requires a providerId".into(),
            ));
        }
        if authentication
            .get("requireVerifiedPeers")
            .and_then(Value::as_bool)
            == Some(true)
            && authentication_mode != Some("hook")
        {
            return Err(FormatError(
                "verified networking peers require hook authentication".into(),
            ));
        }
        bounded_u64(
            "networking.authentication.handshakeTimeoutMs",
            authentication.get("handshakeTimeoutMs"),
            250,
            30_000,
        )?;

        let security = networking
            .get("security")
            .and_then(Value::as_object)
            .ok_or_else(
                /* 构造工程格式错误，标明失败条件：networking.security must be an object。 */
                || FormatError("networking.security must be an object".into()),
            )?;
        if !security
            .get("requireEncryption")
            .is_some_and(Value::is_boolean)
        {
            return Err(FormatError(
                "networking.security.requireEncryption must be a boolean".into(),
            ));
        }
        bounded_u64(
            "networking.security.maximumPacketAgeMs",
            security.get("maximumPacketAgeMs"),
            1_000,
            120_000,
        )?;
        bounded_u64(
            "networking.security.replayWindow",
            security.get("replayWindow"),
            64,
            16_384,
        )?;

        let interest = networking
            .get("interest")
            .and_then(Value::as_object)
            .ok_or_else(
                /* 构造工程格式错误，标明失败条件：networking.interest must be an object。 */
                || FormatError("networking.interest must be an object".into()),
            )?;
        if !interest.get("enabled").is_some_and(Value::is_boolean) {
            return Err(FormatError(
                "networking.interest.enabled must be a boolean".into(),
            ));
        }
        bounded_f64(
            "networking.interest.defaultRadius",
            interest.get("defaultRadius"),
            0.0,
            1_000_000.0,
        )?;
        bounded_f64(
            "networking.interest.maximumRadius",
            interest.get("maximumRadius"),
            1.0,
            1_000_000.0,
        )?;
        if interest
            .get("defaultRadius")
            .and_then(Value::as_f64)
            .zip(interest.get("maximumRadius").and_then(Value::as_f64))
            .is_some_and(
                /* 判断 default_radius > maximum_radius 是否成立，供过滤或有效性检查使用。 */
                |(default_radius, maximum_radius)| default_radius > maximum_radius,
            )
        {
            return Err(FormatError(
                "networking.interest.defaultRadius exceeds maximumRadius".into(),
            ));
        }

        let multi_instance = networking
            .get("multiInstance")
            .and_then(Value::as_object)
            .ok_or_else(
                /* 构造工程格式错误，标明失败条件：networking.multiInstance must be an object。 */
                || FormatError("networking.multiInstance must be an object".into()),
            )?;
        bounded_u64(
            "networking.multiInstance.peerCount",
            multi_instance.get("peerCount"),
            2,
            8,
        )?;
        for key in ["separateLogs", "separateInspectors"] {
            if !multi_instance.get(key).is_some_and(Value::is_boolean) {
                return Err(FormatError(format!(
                    "networking.multiInstance.{key} must be a boolean"
                )));
            }
        }

        let services = networking
            .get("services")
            .and_then(Value::as_object)
            .ok_or_else(
                /* 构造工程格式错误，标明失败条件：networking.services must be an object。 */
                || FormatError("networking.services must be an object".into()),
            )?;
        for key in ["identityProviderId", "lobbyProviderId", "relayProviderId"] {
            if !is_provider_id(services.get(key), true) {
                return Err(FormatError(format!("networking.services.{key} is invalid")));
            }
        }

        let maximum_packet_bytes = networking
            .get("maximumPacketBytes")
            .and_then(Value::as_u64)
            .unwrap_or(65_507);
        let mut channel_ids = std::collections::HashSet::new();
        if let Some(channels) = networking.get("channels") {
            let channels = channels.as_array().ok_or_else(
                /* 构造工程格式错误，标明失败条件：networking.channels must be an array。 */
                || FormatError("networking.channels must be an array".into()),
            )?;
            if channels.is_empty() || channels.len() > 32 {
                return Err(FormatError(
                    "networking.channels must contain 1–32 channels".into(),
                ));
            }
            for channel in channels {
                let channel = channel.as_object().ok_or_else(
                    /* 构造工程格式错误，标明失败条件：every network channel must be an object。 */
                    || FormatError("every network channel must be an object".into()),
                )?;
                let id = channel.get("id").and_then(Value::as_str).unwrap_or("");
                if id.is_empty()
                    || id.len() > 80
                    || !channel_ids.insert(id)
                    || !matches!(
                        channel.get("delivery").and_then(Value::as_str),
                        Some("reliable-ordered" | "unreliable-sequenced")
                    )
                {
                    return Err(FormatError(
                        "network channel identity or delivery is invalid".into(),
                    ));
                }
                bounded_u64(
                    "networking.channels.maximumPayloadBytes",
                    channel.get("maximumPayloadBytes"),
                    2,
                    maximum_packet_bytes,
                )?;
                bounded_u64(
                    "networking.channels.messagesPerSecond",
                    channel.get("messagesPerSecond"),
                    1,
                    10_000,
                )?;
                bounded_u64(
                    "networking.channels.priority",
                    channel.get("priority"),
                    0,
                    100,
                )?;
            }
        }
        if let Some(rpcs) = networking.get("rpcContracts") {
            let rpcs = rpcs.as_array().ok_or_else(
                /* 构造工程格式错误，标明失败条件：networking.rpcContracts must be an array。 */
                || FormatError("networking.rpcContracts must be an array".into()),
            )?;
            if rpcs.len() > 256 {
                return Err(FormatError(
                    "networking.rpcContracts is limited to 256 definitions".into(),
                ));
            }
            let mut names = std::collections::HashSet::new();
            for rpc in rpcs {
                let rpc = rpc.as_object().ok_or_else(
                    /* 构造工程格式错误，标明失败条件：every RPC contract must be an object。 */
                    || FormatError("every RPC contract must be an object".into()),
                )?;
                let name = rpc.get("name").and_then(Value::as_str).unwrap_or("");
                if name.is_empty()
                    || name.len() > 80
                    || !names.insert(name)
                    || !rpc.get("channelId").and_then(Value::as_str).is_some_and(
                        /* 判断 channel_ids . contains (value) 是否成立，供过滤或有效性检查使用。 */
                        |value| channel_ids.contains(value),
                    )
                    || !matches!(
                        rpc.get("direction").and_then(Value::as_str),
                        Some("client-to-server" | "server-to-client" | "bidirectional")
                    )
                    || !matches!(
                        rpc.get("authority").and_then(Value::as_str),
                        Some("server" | "owner" | "any")
                    )
                    || !matches!(
                        rpc.get("payloadSchema").and_then(Value::as_str),
                        Some(
                            "any"
                                | "boolean"
                                | "number"
                                | "integer"
                                | "string"
                                | "vec2"
                                | "object"
                                | "array"
                        )
                    )
                {
                    return Err(FormatError(
                        "network RPC contract identity or schema is invalid".into(),
                    ));
                }
                bounded_u64(
                    "networking.rpcContracts.maximumPayloadBytes",
                    rpc.get("maximumPayloadBytes"),
                    2,
                    65_507,
                )?;
                bounded_u64(
                    "networking.rpcContracts.callsPerSecond",
                    rpc.get("callsPerSecond"),
                    1,
                    1_000,
                )?;
            }
        }
        if let Some(simulation) = networking.get("simulation") {
            let simulation = simulation.as_object().ok_or_else(
                /* 构造工程格式错误，标明失败条件：networking.simulation must be an object。 */
                || FormatError("networking.simulation must be an object".into()),
            )?;
            if !simulation.get("enabled").is_some_and(Value::is_boolean) {
                return Err(FormatError(
                    "networking.simulation.enabled must be a boolean".into(),
                ));
            }
            bounded_u64(
                "networking.simulation.latencyMs",
                simulation.get("latencyMs"),
                0,
                10_000,
            )?;
            bounded_u64(
                "networking.simulation.jitterMs",
                simulation.get("jitterMs"),
                0,
                10_000,
            )?;
            bounded_u64(
                "networking.simulation.seed",
                simulation.get("seed"),
                0,
                u32::MAX as u64,
            )?;
            for key in ["lossPercent", "duplicatePercent", "reorderPercent"] {
                bounded_f64(
                    &format!("networking.simulation.{key}"),
                    simulation.get(key),
                    0.0,
                    100.0,
                )?;
            }
        }
        for key in ["endpoint", "bindAddress"] {
            if !networking
                .get(key)
                .and_then(Value::as_str)
                .is_some_and(/* 判断 ! text . is_empty () && text . len () <= 512 是否成立，供过滤或有效性检查使用。 */ |text| !text.is_empty() && text.len() <= 512)
            {
                return Err(FormatError(format!(
                    "production networking {key} is invalid"
                )));
            }
        }
        bounded_u64(
            "networking.snapshotRate",
            networking.get("snapshotRate"),
            1,
            120,
        )?;
        bounded_u64(
            "networking.interpolationMs",
            networking.get("interpolationMs"),
            0,
            2_000,
        )?;
        bounded_u64(
            "networking.rollbackFrames",
            networking.get("rollbackFrames"),
            0,
            600,
        )?;
        bounded_u64(
            "networking.bandwidthKbps",
            networking.get("bandwidthKbps"),
            8,
            1_000_000,
        )?;
        let replicated_entities = networking
            .get("replicatedEntities")
            .and_then(Value::as_array)
            .ok_or_else(/* 构造工程格式错误，标明失败条件：networking.replicatedEntities must be an array。 */ || FormatError("networking.replicatedEntities must be an array".into()))?;
        if replicated_entities.len() > 2_000 {
            return Err(FormatError(
                "production networking is limited to 2000 replicated entities".into(),
            ));
        }
        let mut replicated_ids = std::collections::HashSet::new();
        let maximum_interest_radius = interest
            .get("maximumRadius")
            .and_then(Value::as_f64)
            .unwrap_or(1_000_000.0);
        for definition in replicated_entities {
            let definition = definition.as_object().ok_or_else(/* 构造工程格式错误，标明失败条件：every replicated-entity definition must be an object。 */ || {
                FormatError("every replicated-entity definition must be an object".into())
            })?;
            let entity_uuid = definition
                .get("entityUuid")
                .and_then(Value::as_str)
                .unwrap_or("");
            let properties = definition
                .get("properties")
                .and_then(Value::as_array)
                .ok_or_else(
                    /* 构造工程格式错误，标明失败条件：replicated properties must be an array。 */
                    || FormatError("replicated properties must be an array".into()),
                )?;
            let owner_peer_id = definition
                .get("ownerPeerId")
                .and_then(Value::as_str)
                .unwrap_or("");
            let scene_uuid = definition
                .get("sceneUuid")
                .and_then(Value::as_str)
                .unwrap_or("");
            let mut unique_properties = std::collections::HashSet::new();
            if entity_uuid.is_empty()
                || entity_uuid.len() > 128
                || !replicated_ids.insert(entity_uuid)
                || !matches!(
                    definition.get("authority").and_then(Value::as_str),
                    Some("server" | "owner")
                )
                || !definition.get("interpolate").is_some_and(Value::is_boolean)
                || !definition.get("predict").is_some_and(Value::is_boolean)
                || !definition
                    .get("alwaysRelevant")
                    .is_some_and(Value::is_boolean)
                || owner_peer_id.len() > 80
                || !owner_peer_id
                    .bytes()
                    .all(/* 判断 byte . is_ascii_alphanumeric () || b"_.-" . contains (& byte) 是否成立，供过滤或有效性检查使用。 */ |byte| byte.is_ascii_alphanumeric() || b"_.-".contains(&byte))
                || (!scene_uuid.is_empty() && !is_uuid(scene_uuid))
                || !definition
                    .get("interestRadius")
                    .and_then(Value::as_f64)
                    .is_some_and(/* 判断 radius . is_finite () && (0.0 ..= maximum_interest_radius) . contains (& radius) 是否成立，供过滤或有效性检查使用。 */ |radius| {
                        radius.is_finite() && (0.0..=maximum_interest_radius).contains(&radius)
                    })
                || properties.len() > 3
                || properties.iter().any(/* 拒绝非字符串、未知或重复的复制属性，只接收变换、旋转和速度。 */ |property| {
                    let Some(property) = property.as_str() else {
                        return true;
                    };
                    !matches!(property, "transform" | "rotation" | "velocity")
                        || !unique_properties.insert(property)
                })
            {
                return Err(FormatError(
                    "replicated entity authority, flags, or properties are invalid".into(),
                ));
            }
        }
    }
    if actions.len() > 128 {
        return Err(FormatError(
            "input map cannot contain more than 128 actions".into(),
        ));
    }
    let mut action_names = std::collections::HashSet::new();
    for action in actions {
        let action = action.as_object().ok_or_else(
            /* 构造工程格式错误，标明失败条件：every input action must be an object。 */
            || FormatError("every input action must be an object".into()),
        )?;
        let name = action
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        if name.is_empty() || name.len() > 80 || !action_names.insert(name) {
            return Err(FormatError(format!(
                "invalid or duplicate input action: {name}"
            )));
        }
        if !matches!(
            action.get("kind").and_then(Value::as_str),
            Some("button" | "axis" | "vector2")
        ) {
            return Err(FormatError(format!(
                "input action {name} has an invalid kind"
            )));
        }
        let bindings = action
            .get("bindings")
            .and_then(Value::as_array)
            .ok_or_else(/* 构造工程格式错误，标明失败条件：input action {name} bindings must be an array。 */ || FormatError(format!("input action {name} bindings must be an array")))?;
        if bindings.len() > 32 {
            return Err(FormatError(format!(
                "input action {name} has too many bindings"
            )));
        }
        for binding in bindings {
            let binding = binding.as_object().ok_or_else(/* 构造工程格式错误，标明失败条件：input action {name} contains an invalid binding。 */ || {
                FormatError(format!("input action {name} contains an invalid binding"))
            })?;
            if !matches!(
                binding.get("device").and_then(Value::as_str),
                Some(
                    "keyboard"
                        | "physical-key"
                        | "mouse-button"
                        | "mouse-wheel"
                        | "mouse-motion"
                        | "gamepad-button"
                        | "gamepad-axis"
                        | "touch"
                        | "gesture"
                        | "sensor"
                        | "pen-button"
                        | "pen-pressure"
                        | "pen-tilt"
                        | "pen-twist"
                )
            ) {
                return Err(FormatError(format!(
                    "input action {name} contains an invalid device"
                )));
            }
            if !binding
                .get("code")
                .and_then(Value::as_str)
                .is_some_and(/* 判断 ! code . is_empty () && code . len () <= 80 是否成立，供过滤或有效性检查使用。 */ |code| !code.is_empty() && code.len() <= 80)
            {
                return Err(FormatError(format!(
                    "input action {name} contains an invalid code"
                )));
            }
        }
    }
    Ok(())
}

// 校验脚本资源的接口版本、导出属性及相关元数据。
fn validate_script_asset(asset: &AssetReference) -> Result<(), FormatError> {
    let Some(metadata) = asset.extra.get("script") else {
        return Ok(());
    };
    let metadata = metadata.as_object().ok_or_else(
        /* 构造工程格式错误，标明失败条件：script metadata must be an object: {}。 */
        || FormatError(format!("script metadata must be an object: {}", asset.path)),
    )?;
    if metadata.get("version").and_then(Value::as_u64) != Some(1) {
        return Err(FormatError(format!(
            "script metadata version is unsupported: {}",
            asset.path
        )));
    }
    if !matches!(
        metadata.get("apiVersion").and_then(Value::as_u64),
        Some(1 | 2)
    ) {
        return Err(FormatError(format!(
            "script API version is unsupported: {}",
            asset.path
        )));
    }
    let breakpoints = metadata
        .get("breakpoints")
        .and_then(Value::as_array)
        .ok_or_else(
            /* 构造工程格式错误，标明失败条件：script breakpoints must be an array: {}。 */
            || {
                FormatError(format!(
                    "script breakpoints must be an array: {}",
                    asset.path
                ))
            },
        )?;
    if breakpoints.len() > 1000
        || breakpoints.iter().any(/* 判断 ! line . as_u64 () . is_some_and (| line | line > 0 && line <= 1_000_000) 是否成立，供过滤或有效性检查使用。 */ |line| {
            !line
                .as_u64()
                .is_some_and(/* 判断 line > 0 && line <= 1_000_000 是否成立，供过滤或有效性检查使用。 */ |line| line > 0 && line <= 1_000_000)
        })
    {
        return Err(FormatError(format!(
            "script breakpoints are invalid: {}",
            asset.path
        )));
    }
    for key in ["tests", "packageDependencies"] {
        let entries = metadata.get(key).and_then(Value::as_array).ok_or_else(
            /* 构造工程格式错误，标明失败条件：script {key} must be an array: {}。 */
            || FormatError(format!("script {key} must be an array: {}", asset.path)),
        )?;
        if entries.len() > 256
            || entries
                .iter()
                .any(/* 判断 ! entry . as_str () . is_some_and (| value | value . len () <= 256) 是否成立，供过滤或有效性检查使用。 */ |entry| !entry.as_str().is_some_and(/* 判断 value . len () <= 256 是否成立，供过滤或有效性检查使用。 */ |value| value.len() <= 256))
        {
            return Err(FormatError(format!(
                "script {key} is invalid: {}",
                asset.path
            )));
        }
    }
    let details = metadata
        .get("breakpointDetails")
        .and_then(Value::as_array)
        .ok_or_else(
            /* 构造工程格式错误，标明失败条件：script breakpointDetails must be an array: {}。 */
            || {
                FormatError(format!(
                    "script breakpointDetails must be an array: {}",
                    asset.path
                ))
            },
        )?;
    if details.len() > 1000
        || details.iter().any(/* 逐项检查断点对象的行号、身份及可选表达式字段是否符合限制。 */ |entry| {
            let Some(entry) = entry.as_object() else {
                return true;
            };
            !entry
                .get("line")
                .and_then(Value::as_u64)
                .is_some_and(/* 判断 line > 0 && line <= 1_000_000 是否成立，供过滤或有效性检查使用。 */ |line| line > 0 && line <= 1_000_000)
                || !entry
                    .get("id")
                    .and_then(Value::as_str)
                    .is_some_and(/* 判断 ! value . is_empty () && value . len () <= 128 是否成立，供过滤或有效性检查使用。 */ |value| !value.is_empty() && value.len() <= 128)
                || !entry
                    .get("functionName")
                    .and_then(Value::as_str)
                    .is_some_and(/* 判断 value . len () <= 80 是否成立，供过滤或有效性检查使用。 */ |value| value.len() <= 80)
                || !entry
                    .get("condition")
                    .and_then(Value::as_str)
                    .is_some_and(/* 判断 value . len () <= 512 是否成立，供过滤或有效性检查使用。 */ |value| value.len() <= 512)
                || !entry
                    .get("logMessage")
                    .and_then(Value::as_str)
                    .is_some_and(/* 判断 value . len () <= 1024 是否成立，供过滤或有效性检查使用。 */ |value| value.len() <= 1024)
                || entry
                    .get("hitCondition")
                    .and_then(Value::as_u64)
                    .map_or(true, /* 判断 value > 1_000_000 是否成立，供过滤或有效性检查使用。 */ |value| value > 1_000_000)
                || entry.get("enabled").and_then(Value::as_bool).is_none()
        })
    {
        return Err(FormatError(format!(
            "script breakpointDetails are invalid: {}",
            asset.path
        )));
    }
    if !matches!(
        metadata.get("reloadPolicy").and_then(Value::as_str),
        Some("preserve" | "recreate" | "disabled")
    ) {
        return Err(FormatError(format!(
            "script reloadPolicy is invalid: {}",
            asset.path
        )));
    }
    for (key, maximum) in [
        ("packageName", 128),
        ("lastSavedHash", 128),
        ("recoverySource", 1_000_000),
    ] {
        if !metadata.get(key).and_then(Value::as_str).is_some_and(
            /* 判断 value . len () <= maximum 是否成立，供过滤或有效性检查使用。 */
            |value| value.len() <= maximum,
        ) {
            return Err(FormatError(format!(
                "script {key} is invalid: {}",
                asset.path
            )));
        }
    }
    let connections = metadata
        .get("signalConnections")
        .and_then(Value::as_array)
        .ok_or_else(
            /* 构造工程格式错误，标明失败条件：script signalConnections must be an array: {}。 */
            || {
                FormatError(format!(
                    "script signalConnections must be an array: {}",
                    asset.path
                ))
            },
        )?;
    if connections.len() > 512
        || connections.iter().any(/* 逐项检查脚本信号连接的信号名、目标与回调字段。 */ |entry| {
            let Some(entry) = entry.as_object() else {
                return true;
            };
            !entry
                .get("signal")
                .and_then(Value::as_str)
                .is_some_and(/* 判断 ! value . is_empty () && value . len () <= 128 是否成立，供过滤或有效性检查使用。 */ |value| !value.is_empty() && value.len() <= 128)
                || !entry
                    .get("callback")
                    .and_then(Value::as_str)
                    .is_some_and(/* 判断 ! value . is_empty () && value . len () <= 80 是否成立，供过滤或有效性检查使用。 */ |value| !value.is_empty() && value.len() <= 80)
                || !entry
                    .get("source")
                    .and_then(Value::as_str)
                    .is_some_and(/* 判断 value . len () <= 128 是否成立，供过滤或有效性检查使用。 */ |value| value.len() <= 128)
                || !entry
                    .get("target")
                    .and_then(Value::as_str)
                    .is_some_and(/* 判断 value . len () <= 128 是否成立，供过滤或有效性检查使用。 */ |value| value.len() <= 128)
                || entry.get("enabled").and_then(Value::as_bool).is_none()
        })
    {
        return Err(FormatError(format!(
            "script signalConnections are invalid: {}",
            asset.path
        )));
    }
    Ok(())
}

// 将历史数字身份转换为稳定标识，并同步引用关系。
fn migrate_legacy_identities(root: &mut Map<String, Value>) -> Result<(), FormatError> {
    let entities = root.entry("entities").or_insert_with(
        /* 提供缺省或失败路径的空值：Value :: Array (Vec :: new ())。 */
        || Value::Array(Vec::new()),
    );
    let Value::Array(entities) = entities else {
        return Err(FormatError("project must contain an entities array".into()));
    };
    let mut id_to_uuid = HashMap::new();
    let mut used_uuids = std::collections::HashSet::new();
    for (index, entity) in entities.iter_mut().enumerate() {
        let Value::Object(entity) = entity else {
            return Err(FormatError("every entity must be an object".into()));
        };
        let legacy_id = entity.get("id").map(identity_key).unwrap_or_else(
            /* 计算并返回 index . to_string ()，用于当前 migrate_legacy_identities 流程。 */
            || index.to_string(),
        );
        let mut uuid = entity
            .get("uuid")
            .and_then(Value::as_str)
            .filter(/* 计算并返回 is_uuid (value)，用于当前 migrate_legacy_identities 流程。 */ |value| is_uuid(value))
            .map(str::to_owned)
            .unwrap_or_else(/* 计算并返回 deterministic_uuid (& format ! ("nova-a-entity:{index}:{legacy_id}"))，用于当前 migrate_legacy_identities 流程。 */ || deterministic_uuid(&format!("nova-a-entity:{index}:{legacy_id}")));
        let mut collision = 0_u32;
        while used_uuids.contains(&uuid) {
            collision += 1;
            uuid = deterministic_uuid(&format!("nova-a-entity:{index}:{legacy_id}:{collision}"));
        }
        used_uuids.insert(uuid.clone());
        id_to_uuid.entry(legacy_id).or_insert_with(
            /* 复制 uuid . clone () 的结果，避免向调用方暴露可变宿主引用。 */
            || uuid.clone(),
        );
        entity.insert("uuid".into(), Value::String(uuid));
        entity.remove("id");
    }

    let connections = root.entry("connections").or_insert_with(
        /* 提供缺省或失败路径的空值：Value :: Array (Vec :: new ())。 */
        || Value::Array(Vec::new()),
    );
    let Value::Array(connections) = connections else {
        return Err(FormatError("project connections must be an array".into()));
    };
    for (index, connection) in connections.iter_mut().enumerate() {
        let Value::Object(connection) = connection else {
            return Err(FormatError("every connection must be an object".into()));
        };
        let legacy_id = connection.get("id").map(identity_key).unwrap_or_else(
            /* 计算并返回 index . to_string ()，用于当前 migrate_legacy_identities 流程。 */
            || index.to_string(),
        );
        let mut uuid = connection
            .get("uuid")
            .and_then(Value::as_str)
            .filter(/* 计算并返回 is_uuid (value)，用于当前 migrate_legacy_identities 流程。 */ |value| is_uuid(value))
            .map(str::to_owned)
            .unwrap_or_else(/* 计算并返回 deterministic_uuid (& format ! ("nova-a-connection:{index}:{legacy_id}"))，用于当前 migrate_legacy_identities 流程。 */ || {
                deterministic_uuid(&format!("nova-a-connection:{index}:{legacy_id}"))
            });
        let mut collision = 0_u32;
        while used_uuids.contains(&uuid) {
            collision += 1;
            uuid = deterministic_uuid(&format!(
                "nova-a-connection:{index}:{legacy_id}:{collision}"
            ));
        }
        used_uuids.insert(uuid.clone());
        connection.insert("uuid".into(), Value::String(uuid));
        connection.remove("id");
        if let Some(Value::Array(anchors)) = connection.get_mut("anchors") {
            for anchor in anchors {
                let Value::Object(anchor) = anchor else {
                    continue;
                };
                if anchor.get("entityUuid").and_then(Value::as_str).is_none() {
                    if let Some(id) = anchor.get("entityId").map(identity_key) {
                        if let Some(uuid) = id_to_uuid.get(&id) {
                            anchor.insert("entityUuid".into(), Value::String(uuid.clone()));
                        }
                    }
                }
                anchor.remove("entityId");
            }
        }
    }
    Ok(())
}

// 补齐历史图块集字段而不覆盖已有作者设置。
fn migrate_tileset_asset(asset: &mut Map<String, Value>) -> Result<(), FormatError> {
    if asset.get("assetType").and_then(Value::as_str) != Some("tileset") {
        return Ok(());
    }
    let Some(source) = asset.get("source").and_then(Value::as_str) else {
        return Ok(());
    };
    let Ok(mut document) = serde_json::from_str::<Value>(source) else {
        return Ok(());
    };
    let Some(document) = document.as_object_mut() else {
        return Ok(());
    };
    document.insert("version".into(), json!(2));
    let texture = document.get("textureAsset").cloned().unwrap_or(Value::Null);
    document.entry("sources").or_insert_with(/* 构造包含 id、name、textureAsset、margin、spacing 字段的 JSON 默认值，供缺省配置补齐。 */ || {
        json!([{
            "id":"primary", "name":"Primary atlas", "textureAsset":texture, "margin":0, "spacing":0
        }])
    });
    if let Some(tiles) = document.get_mut("tiles").and_then(Value::as_array_mut) {
        for tile in tiles {
            let Some(tile) = tile.as_object_mut() else {
                continue;
            };
            tile.entry("navigationPolygon")
                .or_insert_with(/* 提供 JSON 默认值 json ! ([])。 */ || json!([]));
            tile.entry("occlusionPolygon")
                .or_insert_with(/* 提供 JSON 默认值 json ! ([])。 */ || json!([]));
            tile.entry("metadata").or_insert_with(
                /* 提供 JSON 默认值 json ! ({ })。 */ || json!({}),
            );
            tile.entry("sceneAsset").or_insert(Value::Null);
            tile.entry("prefabAsset").or_insert(Value::Null);
            tile.entry("sourceId").or_insert_with(
                /* 提供 JSON 默认值 json ! ("primary")。 */ || json!("primary"),
            );
            tile.entry("region").or_insert(Value::Null);
            tile.entry("animation").or_insert(Value::Null);
            tile.entry("variants")
                .or_insert_with(/* 提供 JSON 默认值 json ! ([])。 */ || json!([]));
        }
    }
    asset.insert(
        "source".into(),
        Value::String(serde_json::to_string(document).map_err(
            /* 把底层错误封装为工程格式错误。 */
            |error| FormatError(error.to_string()),
        )?),
    );
    Ok(())
}

// 升级世界数据组件，使历史地图与流式数据符合当前结构。
fn migrate_world_data_components(scene: &mut Map<String, Value>) -> Result<(), FormatError> {
    let Some(entities) = scene.get_mut("entities").and_then(Value::as_array_mut) else {
        return Ok(());
    };
    for entity in entities {
        let Some(components) = entity.get_mut("components").and_then(Value::as_array_mut) else {
            continue;
        };
        for component in components {
            let Some(component) = component.as_object_mut() else {
                continue;
            };
            let kind = component
                .get("kind")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            let Some(data) = component.get_mut("data").and_then(Value::as_object_mut) else {
                continue;
            };
            match kind.as_str() {
                "TileMap2D" => {
                    let width = data
                        .get("width")
                        .and_then(Value::as_u64)
                        .unwrap_or(32)
                        .clamp(1, 2048) as usize;
                    let height = data
                        .get("height")
                        .and_then(Value::as_u64)
                        .unwrap_or(18)
                        .clamp(1, 2048) as usize;
                    if let Some(layers) = data.get_mut("layers").and_then(Value::as_array_mut) {
                        for (index, layer) in layers.iter_mut().enumerate() {
                            let Some(layer) = layer.as_object_mut() else {
                                continue;
                            };
                            layer.entry("blendMode").or_insert_with(
                                /* 提供 JSON 默认值 json ! ("Alpha")。 */
                                || json!("Alpha"),
                            );
                            layer.entry("parallax").or_insert_with(
                                /* 构造包含 x、y 字段的 JSON 默认值，供缺省配置补齐。 */
                                || json!({"x":1.0,"y":1.0}),
                            );
                            layer.entry("zOrder").or_insert_with(
                                /* 提供 JSON 默认值 json ! (index)。 */
                                || json!(index),
                            );
                            layer.entry("collisionEnabled").or_insert_with(
                                /* 提供 JSON 默认值 json ! (true)。 */ || json!(true),
                            );
                            layer.entry("navigationEnabled").or_insert_with(
                                /* 提供 JSON 默认值 json ! (true)。 */ || json!(true),
                            );
                            layer.entry("occlusionEnabled").or_insert_with(
                                /* 提供 JSON 默认值 json ! (true)。 */ || json!(true),
                            );
                            layer
                                .entry("transforms")
                                .or_insert_with(/* 提供 JSON 默认值 json ! (vec ! [0_u8 ; width . saturating_mul (height)])。 */ || json!(vec![0_u8; width.saturating_mul(height)]));
                        }
                    }
                }
                "NavigationRegion2D" => {
                    data.entry("navigationMode").or_insert_with(
                        /* 提供 JSON 默认值 json ! ("Grid")。 */ || json!("Grid"),
                    );
                    data.entry("navigationMask")
                        .or_insert_with(/* 提供 JSON 默认值 json ! (1)。 */ || json!(1));
                    data.entry("source").or_insert_with(
                        /* 提供 JSON 默认值 json ! ("Manual")。 */ || json!("Manual"),
                    );
                    data.entry("sourceEntityUuid").or_insert(Value::Null);
                    data.entry("agentRadius").or_insert_with(
                        /* 提供 JSON 默认值 json ! (0.4)。 */ || json!(0.4),
                    );
                    data.entry("links").or_insert_with(
                        /* 提供 JSON 默认值 json ! ([])。 */ || json!([]),
                    );
                }
                "NavigationObstacle2D" => {
                    data.entry("avoidanceVelocity").or_insert_with(
                        /* 构造包含 x、y 字段的 JSON 默认值，供缺省配置补齐。 */
                        || json!({"x":0.0,"y":0.0}),
                    );
                }
                "NavigationAgent2D" => {
                    data.entry("navigationMask")
                        .or_insert_with(/* 提供 JSON 默认值 json ! (1)。 */ || json!(1));
                    data.entry("avoidancePriority").or_insert_with(
                        /* 提供 JSON 默认值 json ! (0.5)。 */ || json!(0.5),
                    );
                }
                "WorldChunk2D" => {
                    data.entry("ownership").or_insert_with(
                        /* 提供 JSON 默认值 json ! ("scene")。 */ || json!("scene"),
                    );
                    data.entry("dependencies").or_insert_with(
                        /* 提供 JSON 默认值 json ! ([])。 */ || json!([]),
                    );
                    data.entry("prefetchDistance").or_insert_with(
                        /* 提供 JSON 默认值 json ! (160.0)。 */ || json!(160.0),
                    );
                    data.entry("cachePolicy").or_insert_with(
                        /* 提供 JSON 默认值 json ! ("LRU")。 */ || json!("LRU"),
                    );
                    data.entry("saveStateKey").or_insert_with(
                        /* 提供 JSON 默认值 json ! ("")。 */ || json!(""),
                    );
                }
                "ObjectPool2D" => {
                    data.entry("resetContract").or_insert_with(
                        /* 提供 JSON 默认值 json ! ("TransformAndPhysics")。 */
                        || json!("TransformAndPhysics"),
                    );
                    data.entry("maximumLifetime").or_insert_with(
                        /* 提供 JSON 默认值 json ! (0.0)。 */ || json!(0.0),
                    );
                }
                _ => {}
            }
        }
    }
    Ok(())
}

// 迁移画面和音频管线设置，并修复已知历史默认值。
fn migrate_visual_audio_pipeline(
    scene: &mut Map<String, Value>,
    source_version: u32,
) -> Result<(), FormatError> {
    let Some(entities) = scene.get_mut("entities").and_then(Value::as_array_mut) else {
        return Ok(());
    };
    for entity in entities {
        let Some(components) = entity.get_mut("components").and_then(Value::as_array_mut) else {
            continue;
        };
        for component in components {
            let Some(component) = component.as_object_mut() else {
                continue;
            };
            let kind = component
                .get("kind")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            let Some(data) = component.get_mut("data").and_then(Value::as_object_mut) else {
                continue;
            };
            if kind == "ShapeRenderer2D" {
                let legacy_default_stroke = source_version < 27
                    && data.get("strokeWidth").and_then(Value::as_f64) == Some(1.0)
                    && data
                        .get("strokeOpacity")
                        .and_then(Value::as_f64)
                        .unwrap_or(100.0)
                        == 100.0
                    && data.get("strokeColor").map_or(
                        true,
                        /* 仅识别旧版默认描边的精确 RGB 配色，避免覆盖用户自定义颜色。 */
                        |color| {
                            color.get("r").and_then(Value::as_f64).unwrap_or(0.0) == 0.0
                                && color.get("g").and_then(Value::as_f64).unwrap_or(90.0) == 90.0
                                && color.get("b").and_then(Value::as_f64).unwrap_or(155.0) == 155.0
                        },
                    );
                if legacy_default_stroke {
                    data.insert("strokeWidth".into(), json!(0.04));
                } else {
                    data.entry("strokeWidth").or_insert_with(
                        /* 提供 JSON 默认值 json ! (0.04)。 */ || json!(0.04),
                    );
                }
                data.entry("strokeColor").or_insert_with(
                    /* 构造包含 r、g、b 字段的 JSON 默认值，供缺省配置补齐。 */
                    || json!({"r":0,"g":90,"b":155}),
                );
                data.entry("strokeOpacity").or_insert_with(
                    /* 提供 JSON 默认值 json ! (100)。 */ || json!(100),
                );
            } else if kind == "AudioSource" {
                data.entry("polyphony")
                    .or_insert_with(/* 提供 JSON 默认值 json ! (1)。 */ || json!(1));
                data.entry("voicePriority").or_insert_with(
                    /* 提供 JSON 默认值 json ! (128)。 */ || json!(128),
                );
                data.entry("virtualizeWhenLimited").or_insert_with(
                    /* 提供 JSON 默认值 json ! (true)。 */ || json!(true),
                );
                data.entry("randomPitch").or_insert_with(
                    /* 提供 JSON 默认值 json ! (0.0)。 */ || json!(0.0),
                );
                data.entry("randomVolume").or_insert_with(
                    /* 提供 JSON 默认值 json ! (0.0)。 */ || json!(0.0),
                );
                data.entry("streamOverride").or_insert_with(
                    /* 提供 JSON 默认值 json ! ("ImportSetting")。 */
                    || json!("ImportSetting"),
                );
            }
        }
    }
    Ok(())
}

// 将旧实体字段迁入对应组件，保留实体身份和现有内容。
fn migrate_legacy_components(scene: &mut Map<String, Value>) -> Result<(), FormatError> {
    let entities = scene
        .get_mut("entities")
        .and_then(Value::as_array_mut)
        .ok_or_else(
            /* 构造工程格式错误，标明失败条件：scene must contain an entities array。 */
            || FormatError("scene must contain an entities array".into()),
        )?;
    for entity in entities {
        let entity = entity.as_object_mut().ok_or_else(
            /* 构造工程格式错误，标明失败条件：every entity must be an object。 */
            || FormatError("every entity must be an object".into()),
        )?;
        let entity_uuid = entity
            .get("uuid")
            .and_then(Value::as_str)
            .ok_or_else(
                /* 构造工程格式错误，标明失败条件：entity UUID is missing。 */
                || FormatError("entity UUID is missing".into()),
            )?
            .to_owned();
        let existing_components = entity
            .get_mut("components")
            .and_then(Value::as_array_mut)
            .filter(
                /* 判断 ! components . is_empty () 是否成立，供过滤或有效性检查使用。 */
                |components| !components.is_empty(),
            );
        if let Some(components) = existing_components {
            for (index, component) in components.iter_mut().enumerate() {
                let component = component.as_object_mut().ok_or_else(
                    /* 构造工程格式错误，标明失败条件：every component must be an object。 */
                    || FormatError("every component must be an object".into()),
                )?;
                let kind = component
                    .get("kind")
                    .and_then(Value::as_str)
                    .unwrap_or("Component2D")
                    .to_owned();
                if !component
                    .get("uuid")
                    .and_then(Value::as_str)
                    .is_some_and(is_uuid)
                {
                    component.insert(
                        "uuid".into(),
                        Value::String(deterministic_uuid(&format!(
                            "nova-a-component:{entity_uuid}:{kind}:{index}"
                        ))),
                    );
                }
                component.entry("enabled").or_insert(Value::Bool(true));
                component.entry("removed").or_insert(Value::Bool(false));
                component.entry("data").or_insert_with(
                    /* 提供 JSON 默认值 json ! ({ })。 */ || json!({}),
                );
            }
            let component_kinds = components
                .iter()
                .filter_map(/* 按 component . get ("kind") . and_then (Value :: as_str) 读取或转换可选值，保留转换失败分支。 */ |component| component.get("kind").and_then(Value::as_str))
                .collect::<std::collections::HashSet<_>>();
            let requires_rigid_body = component_kinds.contains("CharacterBody2D")
                && !component_kinds.contains("RigidBody2D");
            let requires_collider = component_kinds.contains("Area2D")
                && !component_kinds
                    .iter()
                    .any(/* 计算并返回 kind . ends_with ("Collider2D")，用于当前 migrate_legacy_components 流程。 */ |kind| kind.ends_with("Collider2D"));
            if requires_rigid_body {
                components.push(component_value(&entity_uuid, "RigidBody2D", json!({})));
            }
            if requires_collider {
                components.push(component_value(&entity_uuid, "BoxCollider2D", json!({})));
            }
        } else {
            let shape_type = entity
                .get("shapeType")
                .or_else(
                    /* 读取可选字段 name，由外层继续处理缺省值。 */
                    || entity.get("name"),
                )
                .and_then(Value::as_str)
                .unwrap_or("Box")
                .to_owned();
            entity.insert("entityType".into(), Value::String(shape_type.clone()));
            let transform = entity.get("transform").cloned().unwrap_or_else(
                /* 构造包含 position、x、y、rotation、scale 等 字段的 JSON 默认值，供缺省配置补齐。 */ || json!({"position":{"x":0,"y":0},"rotation":0,"scale":{"x":1,"y":1}}),
            );
            let mut transform_data = transform.as_object().cloned().unwrap_or_default();
            transform_data.insert(
                "parentUuid".into(),
                entity.get("parentUuid").cloned().unwrap_or(Value::Null),
            );
            let renderer_shape = match shape_type.as_str() {
                "Circle" => "Ellipse",
                "Triangle" => "Polygon",
                _ => "Rectangle",
            };
            let renderer_data = json!({
                "shape": renderer_shape,
                "vertices": entity.get("vertices").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! ([])。 */ || json!([])),
                "radiusX": entity.get("radiusX").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! (1)。 */ || json!(1)),
                "radiusY": entity.get("radiusY").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! (1)。 */ || json!(1)),
                "color": entity.get("color").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! ({ "r" : 0 , "g" : 180 , "b" : 255 })。 */ || json!({"r":0,"g":180,"b":255})),
                "opacity": entity.get("transparency").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! (100)。 */ || json!(100)),
                "texture": entity.get("texture").cloned().unwrap_or(Value::Null),
                "sortingLayer": entity.get("layer").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! (1)。 */ || json!(1)),
                "orderInLayer": 0
            });
            let body_type = if entity.get("isStatic").and_then(Value::as_bool) == Some(true) {
                "Static"
            } else if entity.get("isKinematic").and_then(Value::as_bool) == Some(true) {
                "Kinematic"
            } else {
                "Dynamic"
            };
            let rigid_body_data = json!({
                "bodyType": body_type,
                "massMode": "Manual",
                "density": entity.get("density").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! (1)。 */ || json!(1)),
                "mass": entity.get("mass").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! (1)。 */ || json!(1)),
                "autoInertia": entity.get("autoInertia").cloned().unwrap_or(json!(true)),
                "inertia": entity.get("inertia").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! (1)。 */ || json!(1)),
                "gravityScale": entity.get("gravityScale").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! (1)。 */ || json!(1)),
                "localGravity": entity.get("gravity").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! (0)。 */ || json!(0)),
                "velocity": entity.get("velocity").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! ({ "x" : 0 , "y" : 0 })。 */ || json!({"x":0,"y":0})),
                "acceleration": entity.get("acceleration").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! ({ "x" : 0 , "y" : 0 })。 */ || json!({"x":0,"y":0})),
                "angularVelocity": entity.get("angularVelocity").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! (0)。 */ || json!(0)),
                "linearDamping": entity.get("linearDamping").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! (0)。 */ || json!(0)),
                "angularDamping": entity.get("angularDamping").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! (0)。 */ || json!(0)),
                "force": entity.get("force").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! ({ "x" : 0 , "y" : 0 })。 */ || json!({"x":0,"y":0})),
                "torque": entity.get("torque").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! (0)。 */ || json!(0)),
                "continuousCollision": "Continuous",
                "sleepingAllowed": true,
                "freezeRotation": false
            });
            let legacy_layer = entity.get("layer").and_then(Value::as_u64).unwrap_or(1);
            let physics_layer = legacy_layer.saturating_sub(1).min(31) as u32;
            let collider_kind = match shape_type.as_str() {
                "Circle" => "EllipseCollider2D",
                "Triangle" => "PolygonCollider2D",
                _ => "BoxCollider2D",
            };
            let collider_data = json!({
                "offset": {"x":0,"y":0},
                "rotation": 0,
                "size": {"x":1,"y":1},
                "vertices": entity.get("vertices").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! ([])。 */ || json!([])),
                "radiusX": entity.get("radiusX").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! (1)。 */ || json!(1)),
                "radiusY": entity.get("radiusY").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! (1)。 */ || json!(1)),
                "sensor": entity.get("isSensor").cloned().unwrap_or(json!(false)),
                "physicsLayer": physics_layer,
                "collisionMask": 1_u32 << physics_layer,
                "material": {
                    "restitution": entity.get("restitution").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! (0)。 */ || json!(0)),
                    "restitutionThreshold": entity.get("restitutionThreshold").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! (1)。 */ || json!(1)),
                    "staticFriction": entity.get("staticFriction").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! (0)。 */ || json!(0)),
                    "dynamicFriction": entity.get("dynamicFriction").cloned().unwrap_or_else(/* 为旧组件缺失字段提供默认值 json ! (0)。 */ || json!(0))
                }
            });
            entity.insert(
                "components".into(),
                Value::Array(vec![
                    component_value(&entity_uuid, "Transform2D", Value::Object(transform_data)),
                    component_value(&entity_uuid, "ShapeRenderer2D", renderer_data),
                    component_value(&entity_uuid, "RigidBody2D", rigid_body_data),
                    component_value(&entity_uuid, collider_kind, collider_data),
                ]),
            );
        }
        entity.entry("enabled").or_insert(Value::Bool(true));
        entity.entry("editorVisible").or_insert(Value::Bool(true));
        entity.entry("editorLocked").or_insert(Value::Bool(false));
        entity
            .entry("tags")
            .or_insert_with(/* 提供 JSON 默认值 json ! ([])。 */ || json!([]));
    }

    if let Some(connections) = scene.get_mut("connections").and_then(Value::as_array_mut) {
        for connection in connections {
            if let Some(connection) = connection.as_object_mut() {
                let binding = connection
                    .get("binding")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                connection.entry("componentType").or_insert_with(/* 计算并返回 Value :: String (if binding { "FixedJoint2D" } else { "Rope2D" } . into ())，用于当前 migrate_legacy_components 流程。 */ || {
                    Value::String(if binding { "FixedJoint2D" } else { "Rope2D" }.into())
                });
                connection.entry("enabled").or_insert(Value::Bool(true));
            }
        }
    }
    Ok(())
}

// 构造包含实体引用、类型和数据的标准组件值。
fn component_value(entity_uuid: &str, kind: &str, data: Value) -> Value {
    json!({
        "uuid": deterministic_uuid(&format!("nova-a-component:{entity_uuid}:{kind}")),
        "kind": kind,
        "enabled": true,
        "removed": false,
        "data": data
    })
}

// 从历史身份值提取用于稳定映射的字符串键。
fn identity_key(value: &Value) -> String {
    value
        .as_i64()
        .map(/* 计算并返回 value . to_string ()，用于当前 identity_key 流程。 */ |value| value.to_string())
        .or_else(/* 按 value . as_u64 () . map (| value | value . to_string ()) 读取或转换可选值，保留转换失败分支。 */ || value.as_u64().map(/* 计算并返回 value . to_string ()，用于当前 identity_key 流程。 */ |value| value.to_string()))
        .or_else(/* 按 value . as_f64 () . map (| value | format ! ("{value:.0}")) 读取或转换可选值，保留转换失败分支。 */ || value.as_f64().map(/* 计算并返回 format ! ("{value:.0}")，用于当前 identity_key 流程。 */ |value| format!("{value:.0}")))
        .or_else(/* 按 value . as_str () . map (str :: to_owned) 读取或转换可选值，保留转换失败分支。 */ || value.as_str().map(str::to_owned))
        .unwrap_or_default()
}

// 由种子生成可重现的 UUID，用于历史工程身份迁移。
fn deterministic_uuid(seed: &str) -> String {
    // 按给定初始值逐字节累计稳定哈希。
    fn hash(seed: &[u8], offset: u64) -> u64 {
        seed.iter()
            .fold(0xcbf29ce484222325_u64 ^ offset, /* 计算并返回 (value ^ u64 :: from (* byte)) . wrapping_mul (0x100000001b3)，用于当前 hash 流程。 */ |value, byte| {
                (value ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
            })
    }
    let high = hash(seed.as_bytes(), 0);
    let low = hash(seed.as_bytes(), 0x9e3779b97f4a7c15);
    let mut bytes = [0_u8; 16];
    bytes[..8].copy_from_slice(&high.to_be_bytes());
    bytes[8..].copy_from_slice(&low.to_be_bytes());
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!("{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],bytes[1],bytes[2],bytes[3],bytes[4],bytes[5],bytes[6],bytes[7],bytes[8],bytes[9],bytes[10],bytes[11],bytes[12],bytes[13],bytes[14],bytes[15])
}

// 检查字符串是否符合 UUID 的分段十六进制形式。
fn is_uuid(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(/* 判断 if matches ! (index , 8 | 13 | 18 | 23) { byte == b'-' } else { byte . is_ascii_hexdigit () } 是否成立，供过滤或有效性检查使用。 */ |(index, byte)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
}

// 将版本文本解析成主、次、修订号；格式不符时返回空值。
fn parse_semver(value: &str) -> Option<(u64, u64, u64)> {
    let mut parts = value.split('-').next()?.split('.');
    let version = (
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
    );
    parts.next().is_none().then_some(version)
}

// 校验内容哈希的长度与十六进制编码。
fn valid_content_hash(value: &str) -> bool {
    (value.len() == 64
        && value.bytes().all(
            /* 判断 byte . is_ascii_hexdigit () 是否成立，供过滤或有效性检查使用。 */
            |byte| byte.is_ascii_hexdigit(),
        ))
        || value
            .strip_prefix("legacy-unverified:")
            .is_some_and(is_uuid)
}

#[cfg(test)]
mod tests {
    use super::*;

    // 26.46: every component kind the editor registers must be a valid project component (26.45 added
    // WheelJoint2D and TargetJoint2D to the editor but not here, so migrating such a project failed).
    #[test]
    fn every_editor_component_kind_is_a_standard_kind() {
        let registry = include_str!("../../../src/world/componentRegistry.ts");
        let mut seen = 0;
        for line in registry.lines() {
            if let Some(rest) = line.split("kind: '").nth(1) {
                let kind = rest.split('\'').next().unwrap();
                assert!(
                    is_standard_component_kind(kind),
                    "{kind} is registered in the editor but rejected by the project format"
                );
                seen += 1;
            }
        }
        assert!(seen >= 60, "read {seen} kinds from the registry");
    }

    // 检查每个公开历史结构迁移后均符合固定的当前格式投影。
    #[test]
    fn every_public_schema_matches_the_v3_golden_projection() {
        let inputs: Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/migrations/public-schema-inputs.json"
        ))
        .unwrap();
        let expected: Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/migrations/public-schema-expected.json"
        ))
        .unwrap();
        let schemas = inputs["publicSchemas"].as_array().unwrap();
        assert_eq!(
            schemas.len(),
            (CURRENT_FORMAT_VERSION - MINIMUM_SUPPORTED_FORMAT_VERSION + 1) as usize
        );
        for (offset, schema) in schemas.iter().enumerate() {
            let schema = schema.as_u64().unwrap() as u32;
            assert_eq!(schema, MINIMUM_SUPPORTED_FORMAT_VERSION + offset as u32);
            let mut source = inputs["baseProject"].clone();
            source["formatVersion"] = json!(schema);
            let migrated = migrate_project_value(source)
                .unwrap_or_else(/* 计算并返回 panic ! ("schema {schema}: {error}")，用于当前 every_public_schema_matches_the_v3_golden_projection 流程。 */ |error| panic!("schema {schema}: {error}"));
            validate_project(&migrated).unwrap();
            assert_eq!(
                migrated.project_format,
                expected["targetProjectFormat"].as_str().unwrap()
            );
            assert_eq!(
                migrated.project_format_major,
                expected["targetMajor"].as_u64().unwrap() as u32
            );
            assert_eq!(
                migrated.format_version,
                expected["targetSchema"].as_u64().unwrap() as u32
            );
            assert_eq!(
                migrated.engine_version,
                expected["targetEngine"].as_str().unwrap()
            );
            assert_eq!(
                migrated.compatibility.minimum_schema_version,
                expected["minimumSchema"].as_u64().unwrap() as u32
            );
            assert_eq!(
                migrated.scenes.len(),
                expected["sceneCount"].as_u64().unwrap() as usize
            );
            assert_eq!(
                migrated.scenes[0].entities.len(),
                expected["entityCount"].as_u64().unwrap() as usize
            );
            assert_eq!(
                migrated.active_scene_uuid,
                expected["activeSceneUuid"].as_str().unwrap()
            );
            assert_eq!(
                migrated.extra["futureGoldenMarker"],
                expected["preservedMarker"]
            );

            let serialized = serde_json::to_string(&migrated).unwrap();
            let restored: ProjectFile = serde_json::from_str(&serialized).unwrap();
            validate_project(&restored).unwrap();
            assert_eq!(
                restored.extra["futureGoldenMarker"],
                expected["preservedMarker"]
            );
        }
    }

    // 扰动输入字节，确保损坏工程不触发 panic，也不接受未来结构版本。
    #[test]
    fn corrupted_input_fuzz_cases_never_panic_or_accept_future_schemas() {
        let valid = include_str!("../../../tests/fixtures/migrations/public-schema-inputs.json");
        for seed in 0..512_usize {
            let mut bytes = valid.as_bytes().to_vec();
            let index = seed.wrapping_mul(97).wrapping_add(31) % bytes.len();
            bytes[index] ^= 1_u8 << (seed % 7);
            let source = String::from_utf8_lossy(&bytes);
            let result = std::panic::catch_unwind(
                /* 计算并返回 migrate_project_str (& source)，用于当前 corrupted_input_fuzz_cases_never_panic_or_accept_future_schemas 流程。 */
                || migrate_project_str(&source),
            );
            assert!(
                result.is_ok(),
                "migration panicked for deterministic fuzz seed {seed}"
            );
        }
        let future = json!({"formatVersion": CURRENT_FORMAT_VERSION + 1, "entities": []});
        assert!(migrate_project_value(future)
            .unwrap_err()
            .0
            .contains("newer than supported"));
    }

    // 拒绝溢出、负数、小数及错误类型的结构版本，避免回退到历史格式。
    #[test]
    fn schema_versions_cannot_wrap_or_silently_fall_back_to_legacy() {
        for field in ["formatVersion", "projectFormatMajor"] {
            for version in [
                json!(4_294_967_297_u64),
                json!(-1),
                json!(1.5),
                json!("29"),
                Value::Null,
            ] {
                let mut source = json!({"entities": []});
                source[field] = version;
                assert!(migrate_project_value(source).unwrap_err().0.contains(field));
            }
        }
        assert!(migrate_project_value(json!({"entities": []})).is_ok());
    }

    // 验证第十九版迁移补齐世界设置并保留未知扩展字段。
    #[test]
    fn schema_19_adds_valid_world_settings_and_preserves_unknown_world_fields() {
        let scene = deterministic_uuid("schema-19-scene");
        let source = json!({
            "formatVersion": 18,
            "projectSettings": {"inputMap": [], "world": {
                "navigationDebug": true, "areaDebug": false, "chunkDebug": true,
                "streamingEnabled": true, "memoryBudgetMb": 512.0,
                "originShiftThreshold": 25000.0, "futureWorldField": {"kept": true}
            }},
            "activeSceneUuid": scene,
            "scenes": [{"uuid":scene,"name":"World","entities":[],"connections":[]}]
        });
        let migrated = migrate_project_value(source).unwrap();
        assert_eq!(migrated.format_version, CURRENT_FORMAT_VERSION);
        assert_eq!(
            migrated.extra["projectSettings"]["world"]["memoryBudgetMb"],
            512.0
        );
        assert_eq!(
            migrated.extra["projectSettings"]["world"]["futureWorldField"]["kept"],
            true
        );
    }

    // 验证世界内存预算超出约束时迁移失败。
    #[test]
    fn schema_19_rejects_invalid_world_memory_budget() {
        let scene = deterministic_uuid("schema-19-invalid");
        let source = json!({
            "formatVersion": 19,
            "projectSettings": {"inputMap": [], "world": {
                "navigationDebug": false, "areaDebug": false, "chunkDebug": false,
                "streamingEnabled": true, "memoryBudgetMb": 0.0, "originShiftThreshold": 10000.0
            }},
            "activeSceneUuid": scene,
            "scenes": [{"uuid":scene,"name":"World","entities":[],"connections":[]}]
        });
        assert!(migrate_project_value(source).is_err());
    }

    // 验证世界玩法组件在迁移和校验后仍可使用。
    #[test]
    fn schema_19_accepts_world_gameplay_components() {
        let scene = deterministic_uuid("schema-19-components-scene");
        let entity = deterministic_uuid("schema-19-components-entity");
        let transform = deterministic_uuid("schema-19-components-transform");
        let character = deterministic_uuid("schema-19-components-character");
        let source = json!({
            "formatVersion": 18,
            "projectSettings": {"inputMap": []},
            "activeSceneUuid": scene,
            "scenes": [{"uuid":scene,"name":"World","connections":[],"entities":[{
                "uuid": entity, "name": "Player", "enabled": true,
                "components": [
                    {"uuid":transform,"kind":"Transform2D","enabled":true,"removed":false,"data":{}},
                    {"uuid":character,"kind":"CharacterBody2D","enabled":true,"removed":false,"data":{"maxSlopeAngle":45.0}}
                ]
            }]}]
        });
        let migrated = migrate_project_value(source).unwrap();
        assert_eq!(
            migrated.scenes[0].entities[0].components[1].kind,
            "CharacterBody2D"
        );
    }

    // 验证旧数字身份迁移保留实体、连接及原数据。
    #[test]
    fn migrates_v1_1_2_numeric_identities_without_losing_data() {
        let source = r#"{"formatVersion":5,"layers":[1],"entities":[{"id":7,"name":"Box","shapeType":"Box","mass":12}],"connections":[{"id":3,"anchors":[{"entityId":7}]}]}"#;
        let migrated = migrate_project_str(source).unwrap();
        let value: Value = serde_json::from_str(&migrated).unwrap();
        assert_eq!(value["formatVersion"], CURRENT_FORMAT_VERSION);
        assert_eq!(value["engineVersion"], CURRENT_ENGINE_VERSION);
        assert!(value["scenes"][0]["entities"][0].get("id").is_none());
        assert_eq!(
            value["scenes"][0]["entities"][0]["components"][2]["data"]["mass"],
            12
        );
        assert_eq!(
            value["scenes"][0]["connections"][0]["anchors"][0]["entityUuid"],
            value["scenes"][0]["entities"][0]["uuid"]
        );
    }

    // 验证多场景与组件稳定身份在迁移中不丢失。
    #[test]
    fn preserves_multi_scene_projects_and_component_identity() {
        let scene_a = deterministic_uuid("scene-a");
        let scene_b = deterministic_uuid("scene-b");
        let entity = deterministic_uuid("entity-a");
        let component = deterministic_uuid("component-a");
        let source = json!({
            "formatVersion": 7,
            "activeSceneUuid": scene_b,
            "scenes": [
                {"uuid":scene_a,"name":"A","entities":[],"connections":[]},
                {"uuid":scene_b,"name":"B","entities":[{
                    "uuid":entity,"name":"Body","entityType":"Box","components":[{
                        "uuid":component,"kind":"Transform2D","enabled":true,
                        "data":{"position":{"x":0,"y":0},"rotation":0,"scale":{"x":1,"y":1}}
                    }]
                }],"connections":[]}
            ]
        });
        let migrated = migrate_project_value(source).unwrap();
        assert_eq!(migrated.scenes.len(), 2);
        assert_eq!(migrated.active_scene_uuid, scene_b);
        assert_eq!(migrated.scenes[1].entities[0].components[0].uuid, component);
        assert!(migrated.scenes[1].entities[0].editor_visible);
        assert!(!migrated.scenes[1].entities[0].editor_locked);
    }

    // 验证旧资源、导入元数据及空文件夹得到保留。
    #[test]
    fn preserves_v1_5_assets_import_metadata_and_empty_folders() {
        let scene = deterministic_uuid("asset-scene");
        let asset = deterministic_uuid("asset-image");
        let source = json!({
            "formatVersion": 8,
            "activeSceneUuid": scene,
            "assetFolders": ["Assets/Sprites/Empty"],
            "assets": [{
                "uuid": asset,
                "path": "Assets/Sprites/hero.png",
                "assetType": "image",
                "mimeType": "image/png",
                "settings": {"filterMode":"Nearest","pixelsPerUnit":32,"atlas":true}
            }],
            "scenes": [{"uuid":scene,"name":"Main Scene","entities":[],"connections":[]}]
        });
        let migrated = migrate_project_value(source).unwrap();
        assert_eq!(migrated.format_version, CURRENT_FORMAT_VERSION);
        assert_eq!(migrated.assets.len(), 1);
        assert_eq!(migrated.assets[0].uuid, asset);
        assert_eq!(migrated.assets[0].extra["mimeType"], "image/png");
        assert_eq!(migrated.assets[0].extra["settings"]["pixelsPerUnit"], 32);
        assert_eq!(migrated.extra["assetFolders"][0], "Assets/Sprites/Empty");
    }

    // 验证音频设置迁移和引用资源的组件校验。
    #[test]
    fn migrates_audio_settings_and_validates_v1_7_asset_components() {
        let scene = deterministic_uuid("v1-7-scene");
        let entity = deterministic_uuid("v1-7-entity");
        let transform = deterministic_uuid("v1-7-transform");
        let animator = deterministic_uuid("v1-7-animator");
        let audio_source = deterministic_uuid("v1-7-audio-source");
        let controller = deterministic_uuid("v1-7-controller");
        let audio = deterministic_uuid("v1-7-audio");
        let source = json!({
            "formatVersion": 10,
            "activeSceneUuid": scene,
            "projectSettings": {"inputMap": []},
            "assets": [
                {"uuid":controller,"path":"Assets/Controllers/player.nova-controller","assetType":"controller"},
                {"uuid":audio,"path":"Assets/Audio/jump.wav","assetType":"audio"}
            ],
            "scenes": [{"uuid":scene,"name":"Main Scene","entities":[{
                "uuid":entity,"name":"Player","components":[
                    {"uuid":transform,"kind":"Transform2D","data":{"parentUuid":null}},
                    {"uuid":animator,"kind":"Animator","data":{"controllerAsset":format!("asset://{controller}")}},
                    {"uuid":audio_source,"kind":"AudioSource","data":{"audioClip":format!("asset://{audio}")}}
                ]
            }],"connections":[]}]
        });
        let migrated = migrate_project_value(source).unwrap();
        assert_eq!(migrated.format_version, CURRENT_FORMAT_VERSION);
        assert_eq!(
            migrated.extra["projectSettings"]["audio"]["sampleRate"],
            48000
        );
        assert_eq!(
            migrated.extra["projectSettings"]["audio"]["buses"]["SFX"],
            1.0
        );
    }

    // 检查图块、粒子与关节目标的合法组合。
    #[test]
    fn validates_v1_8_tilemap_particles_and_joint_targets() {
        let scene = deterministic_uuid("v1-8-scene");
        let tile_entity = deterministic_uuid("v1-8-tile-entity");
        let body_entity = deterministic_uuid("v1-8-body-entity");
        let tile_transform = deterministic_uuid("v1-8-tile-transform");
        let body_transform = deterministic_uuid("v1-8-body-transform");
        let tilemap = deterministic_uuid("v1-8-tilemap");
        let particles = deterministic_uuid("v1-8-particles");
        let joint = deterministic_uuid("v1-8-joint");
        let tileset = deterministic_uuid("v1-8-tileset-asset");
        let image = deterministic_uuid("v1-8-image-asset");
        let source = json!({
            "formatVersion": 11,
            "activeSceneUuid": scene,
            "assets": [
                {"uuid":tileset,"path":"Assets/TileSets/world.nova-tileset","assetType":"tileset"},
                {"uuid":image,"path":"Assets/Textures/spark.png","assetType":"image"}
            ],
            "scenes": [{"uuid":scene,"name":"Main Scene","entities":[
                {"uuid":tile_entity,"name":"World","components":[
                    {"uuid":tile_transform,"kind":"Transform2D","data":{"parentUuid":null}},
                    {"uuid":tilemap,"kind":"TileMap2D","data":{"tileSetAsset":format!("asset://{tileset}")}},
                    {"uuid":particles,"kind":"ParticleEmitter2D","data":{"textureAsset":format!("asset://{image}")}},
                    {"uuid":joint,"kind":"FixedJoint2D","data":{"targetEntityUuid":body_entity}}
                ]},
                {"uuid":body_entity,"name":"Body","components":[
                    {"uuid":body_transform,"kind":"Transform2D","data":{"parentUuid":null}}
                ]}
            ],"connections":[]}]
        });
        let migrated = migrate_project_value(source).unwrap();
        assert_eq!(migrated.format_version, CURRENT_FORMAT_VERSION);
        assert_eq!(migrated.engine_version, CURRENT_ENGINE_VERSION);
    }

    // 验证关节不能把所属实体同时作为目标。
    #[test]
    fn rejects_v1_8_joint_targeting_its_own_entity() {
        let scene = deterministic_uuid("v1-8-invalid-scene");
        let entity = deterministic_uuid("v1-8-invalid-entity");
        let transform = deterministic_uuid("v1-8-invalid-transform");
        let joint = deterministic_uuid("v1-8-invalid-joint");
        let source = json!({
            "formatVersion": CURRENT_FORMAT_VERSION,
            "activeSceneUuid": scene,
            "assets": [],
            "scenes": [{"uuid":scene,"name":"Main Scene","entities":[{
                "uuid":entity,"name":"Body","components":[
                    {"uuid":transform,"kind":"Transform2D","data":{"parentUuid":null}},
                    {"uuid":joint,"kind":"FixedJoint2D","data":{"targetEntityUuid":entity}}
                ]
            }],"connections":[]}]
        });
        let error = migrate_project_value(source).unwrap_err();
        assert!(error.0.contains("invalid target entity"));
    }

    // 验证非法音频增益被拒绝。
    #[test]
    fn rejects_invalid_v1_7_audio_gain() {
        let scene = deterministic_uuid("invalid-audio-scene");
        let source = json!({
            "formatVersion": CURRENT_FORMAT_VERSION,
            "activeSceneUuid": scene,
            "projectSettings": {"inputMap": [], "audio": {
                "masterVolume": 2.0, "sampleRate": 48000,
                "buses": {"Master":1.0,"Music":1.0,"SFX":1.0,"UI":1.0}
            }},
            "scenes": [{"uuid":scene,"name":"Main Scene","entities":[],"connections":[]}]
        });
        assert!(migrate_project_value(source).is_err());
    }

    // 验证脚本、预制体和输入动作的旧工程兼容。
    #[test]
    fn validates_v1_6_scripts_prefabs_and_input_actions() {
        let scene = deterministic_uuid("gameplay-scene");
        let entity = deterministic_uuid("scripted-entity");
        let transform = deterministic_uuid("scripted-transform");
        let script_component = deterministic_uuid("script-component");
        let script_asset = deterministic_uuid("script-asset");
        let prefab_asset = deterministic_uuid("prefab-asset");
        let source = json!({
            "formatVersion": CURRENT_FORMAT_VERSION,
            "activeSceneUuid": scene,
            "projectSettings": {"inputMap":[{
                "name":"Jump", "kind":"button", "bindings":[{
                    "device":"keyboard", "code":"Space", "scale":1,
                    "x":1, "y":0, "gamepad":0, "deadzone":0.18
                }]
            }]},
            "assets": [
                {"uuid":script_asset,"path":"Assets/Scripts/player.rhai","assetType":"script"},
                {"uuid":prefab_asset,"path":"Assets/Prefabs/player.nova-prefab","assetType":"prefab"}
            ],
            "scenes": [{"uuid":scene,"name":"Main Scene","entities":[{
                "uuid":entity,"name":"Player","prefabAsset":format!("asset://{prefab_asset}"),
                "components":[
                    {"uuid":transform,"kind":"Transform2D","enabled":true,"data":{"parentUuid":null}},
                    {"uuid":script_component,"kind":"Script2D","enabled":true,"data":{"scriptAsset":format!("asset://{script_asset}"),"properties":{"speed":5.0}}}
                ]
            }],"connections":[]}]
        });
        let migrated = migrate_project_value(source).unwrap();
        assert_eq!(
            migrated.extra["projectSettings"]["inputMap"][0]["name"],
            "Jump"
        );
        assert_eq!(
            migrated.scenes[0].entities[0].components[1].kind,
            "Script2D"
        );
    }

    // 验证脚本组件可引用可视图资源。
    #[test]
    fn accepts_visual_graph_assets_on_script_components() {
        let scene = deterministic_uuid("visual-graph-scene");
        let entity = deterministic_uuid("visual-graph-entity");
        let transform = deterministic_uuid("visual-graph-transform");
        let script_component = deterministic_uuid("visual-graph-component");
        let graph_asset = deterministic_uuid("visual-graph-asset");
        let source = json!({
            "formatVersion": CURRENT_FORMAT_VERSION,
            "activeSceneUuid": scene,
            "projectSettings": {"inputMap":[]},
            "assets": [{
                "uuid":graph_asset,
                "path":"Assets/Visual Scripts/Player.nova-graph",
                "assetType":"visualScript",
                "mimeType":"application/x-nova-graph+json"
            }],
            "scenes": [{"uuid":scene,"name":"Main Scene","entities":[{
                "uuid":entity,"name":"Graph Host","components":[
                    {"uuid":transform,"kind":"Transform2D","enabled":true,"data":{"parentUuid":null}},
                    {"uuid":script_component,"kind":"Script2D","enabled":true,"data":{"scriptAsset":format!("asset://{graph_asset}"),"properties":{"speed":5.0,"direction":[1.0,0.0]}}}
                ]
            }],"connections":[]}]
        });
        let migrated = migrate_project_value(source).unwrap();
        validate_project(&migrated).unwrap();
        assert_eq!(migrated.assets[0].asset_type, "visualScript");
        assert_eq!(
            migrated.scenes[0].entities[0].components[1].data["scriptAsset"],
            format!("asset://{graph_asset}")
        );
    }

    // 验证未知或非法输入设备配置被拒绝。
    #[test]
    fn rejects_invalid_v1_6_input_devices() {
        let scene = deterministic_uuid("bad-input-scene");
        let source = json!({
            "formatVersion": CURRENT_FORMAT_VERSION,
            "activeSceneUuid": scene,
            "projectSettings":{"inputMap":[{"name":"Jump","kind":"button","bindings":[{"device":"network","code":"Space"}]}]},
            "assets":[],
            "scenes":[{"uuid":scene,"name":"Main Scene","entities":[],"connections":[]}]
        });
        let error = migrate_project_value(source).unwrap_err();
        assert!(error.0.contains("invalid device"));
    }

    // 验证资源路径不能逃离工程允许的范围。
    #[test]
    fn rejects_unsafe_asset_paths() {
        let scene = deterministic_uuid("unsafe-asset-scene");
        let asset = deterministic_uuid("unsafe-asset");
        let source = json!({
            "formatVersion": CURRENT_FORMAT_VERSION,
            "activeSceneUuid": scene,
            "assets": [{"uuid":asset,"path":"Assets/../private.png","assetType":"image"}],
            "scenes": [{"uuid":scene,"name":"Main Scene","entities":[],"connections":[]}]
        });
        let error = migrate_project_value(source).unwrap_err();
        assert!(error.0.contains("unsafe project path"));
    }

    // 验证未来工程版本返回明确错误。
    #[test]
    fn rejects_future_project_formats() {
        let error = migrate_project_str(r#"{"formatVersion":999,"entities":[]}"#).unwrap_err();
        assert!(error.0.contains("newer"));
    }

    // 验证旧工程升级到第二代工程格式。
    #[test]
    fn migrates_v1_9_projects_into_project_format_two() {
        let scene = deterministic_uuid("v1-9-build-scene");
        let source = json!({
            "formatVersion": 13,
            "activeSceneUuid": scene,
            "projectSettings": {"inputMap": []},
            "assets": [],
            "scenes": [{"uuid":scene,"name":"Main Scene","entities":[],"connections":[]}]
        });
        let migrated = migrate_project_value(source).unwrap();
        assert_eq!(migrated.project_format, PROJECT_FORMAT_NAME);
        assert_eq!(migrated.project_format_major, PROJECT_FORMAT_MAJOR);
        assert_eq!(migrated.format_version, CURRENT_FORMAT_VERSION);
        assert_eq!(migrated.engine_version, CURRENT_ENGINE_VERSION);
        assert_eq!(
            migrated.extra["projectSettings"]["build"]["architecture"],
            "x86_64"
        );
        assert_eq!(
            migrated.extra["projectSettings"]["build"]["developmentBuild"],
            true
        );
    }

    // 验证当前工程序列化往返保持游戏数据不变。
    #[test]
    fn project_format_two_serialization_round_trip_preserves_game_data() {
        let scene = deterministic_uuid("format-two-round-trip-scene");
        let parent = deterministic_uuid("format-two-round-trip-parent");
        let child = deterministic_uuid("format-two-round-trip-child");
        let parent_transform = deterministic_uuid("format-two-round-trip-parent-transform");
        let child_transform = deterministic_uuid("format-two-round-trip-child-transform");
        let script_component = deterministic_uuid("format-two-round-trip-script-component");
        let script_asset = deterministic_uuid("format-two-round-trip-script-asset");
        let prefab_asset = deterministic_uuid("format-two-round-trip-prefab-asset");
        let source = json!({
            "formatVersion": CURRENT_FORMAT_VERSION,
            "activeSceneUuid": scene,
            "projectSettings": {"inputMap": []},
            "customGameData": {"difficulty":"hard","chapter":3},
            "assets": [
                {"uuid":script_asset,"path":"Assets/Scripts/player.rhai","assetType":"script"},
                {"uuid":prefab_asset,"path":"Assets/Prefabs/player.nova-prefab","assetType":"prefab"}
            ],
            "scenes": [{"uuid":scene,"name":"Gameplay","entities":[
                {"uuid":parent,"name":"Parent","components":[
                    {"uuid":parent_transform,"kind":"Transform2D","data":{"parentUuid":null}}
                ]},
                {"uuid":child,"name":"Child","prefabAsset":format!("asset://{prefab_asset}"),"components":[
                    {"uuid":child_transform,"kind":"Transform2D","data":{"parentUuid":parent}},
                    {"uuid":script_component,"kind":"Script2D","data":{"scriptAsset":format!("asset://{script_asset}"),"properties":{"speed":7.5}}}
                ]}
            ],"connections":[]}]
        });

        let migrated = migrate_project_value(source).unwrap();
        let serialized = serde_json::to_string(&migrated).unwrap();
        let restored: ProjectFile = serde_json::from_str(&serialized).unwrap();

        validate_project(&restored).unwrap();
        assert_eq!(restored.project_format, PROJECT_FORMAT_NAME);
        assert_eq!(restored.extra["customGameData"]["difficulty"], "hard");
        assert_eq!(
            restored.scenes[0].entities[1].extra["prefabAsset"],
            format!("asset://{prefab_asset}")
        );
        assert_eq!(
            restored.scenes[0].entities[1].components[0].data["parentUuid"],
            parent
        );
        assert_eq!(
            restored.scenes[0].entities[1].components[1].data["properties"]["speed"],
            7.5
        );
    }

    // 逐类验证玩法模板组件在工程往返后仍存在。
    #[test]
    fn gameplay_template_components_survive_project_round_trip() {
        let kinds = [
            "GridMover2D",
            "PlatformController2D",
            "TopDownController2D",
            "Health2D",
            "DamageHitbox2D",
            "Collectible2D",
            "Projectile2D",
            "Spawner2D",
            "Cooldown2D",
            "Lifetime2D",
            "MouseFollower2D",
            "CameraFollow2D",
        ];
        let scene = deterministic_uuid("gameplay-component-scene");
        let entities: Vec<Value> = kinds.iter().map(/* 为每种玩法组件构造独立实体与变换组件，供迁移往返验证。 */ |kind| json!({
            "uuid": deterministic_uuid(&format!("entity-{kind}")), "name": kind,
            "components": [
                {"uuid":deterministic_uuid(&format!("transform-{kind}")), "kind":"Transform2D", "data":{}},
                {"uuid":deterministic_uuid(&format!("component-{kind}")), "kind":kind, "data":{"testValue":7.5}}
            ]
        })).collect();
        let source = json!({"formatVersion":CURRENT_FORMAT_VERSION,"activeSceneUuid":scene,"assets":[],
            "scenes":[{"uuid":scene,"name":"Gameplay","entities":entities,"connections":[]}]});
        let project = migrate_project_value(source).unwrap();
        let encoded = serde_json::to_string(&project).unwrap();
        let restored: ProjectFile = serde_json::from_str(&encoded).unwrap();
        validate_project(&restored).unwrap();
        for (index, kind) in kinds.iter().enumerate() {
            assert_eq!(restored.scenes[0].entities[index].components[1].kind, *kind);
            assert_eq!(
                restored.scenes[0].entities[index].components[1].data["testValue"],
                7.5
            );
        }
        let mut invalid = restored;
        invalid.scenes[0].entities[0].components[1].kind = "UnknownFutureComponent2D".into();
        assert!(validate_project(&invalid)
            .unwrap_err()
            .0
            .contains("unsupported component kind"));
    }

    // 验证实体层级中不存在的父身份被拒绝。
    #[test]
    fn rejects_missing_hierarchy_parents() {
        let scene = deterministic_uuid("missing-parent-scene");
        let entity = deterministic_uuid("missing-parent-entity");
        let transform = deterministic_uuid("missing-parent-transform");
        let missing_parent = deterministic_uuid("missing-parent-target");
        let source = json!({
            "formatVersion": CURRENT_FORMAT_VERSION,
            "activeSceneUuid": scene,
            "assets": [],
            "scenes": [{"uuid":scene,"name":"Main Scene","entities":[{
                "uuid":entity,"name":"Child","components":[
                    {"uuid":transform,"kind":"Transform2D","data":{"parentUuid":missing_parent}}
                ]
            }],"connections":[]}]
        });

        let error = migrate_project_value(source).unwrap_err();
        assert!(error.0.contains("missing parent"));
    }

    // 验证父子层级循环被检测并拒绝。
    #[test]
    fn rejects_hierarchy_cycles() {
        let scene = deterministic_uuid("parent-cycle-scene");
        let entity_a = deterministic_uuid("parent-cycle-a");
        let entity_b = deterministic_uuid("parent-cycle-b");
        let transform_a = deterministic_uuid("parent-cycle-transform-a");
        let transform_b = deterministic_uuid("parent-cycle-transform-b");
        let source = json!({
            "formatVersion": CURRENT_FORMAT_VERSION,
            "activeSceneUuid": scene,
            "assets": [],
            "scenes": [{"uuid":scene,"name":"Main Scene","entities":[
                {"uuid":entity_a,"name":"A","components":[
                    {"uuid":transform_a,"kind":"Transform2D","data":{"parentUuid":entity_b}}
                ]},
                {"uuid":entity_b,"name":"B","components":[
                    {"uuid":transform_b,"kind":"Transform2D","data":{"parentUuid":entity_a}}
                ]}
            ],"connections":[]}]
        });

        let error = migrate_project_value(source).unwrap_err();
        assert!(error.0.contains("parent cycle"));
    }

    // 验证未知构建目标不能通过工程校验。
    #[test]
    fn rejects_invalid_build_targets() {
        let scene = deterministic_uuid("v1-9-invalid-build-scene");
        let source = json!({
            "formatVersion": CURRENT_FORMAT_VERSION,
            "activeSceneUuid": scene,
            "projectSettings": {"inputMap": [], "build": {
                "gameName":"Demo", "target":"console", "architecture":"x86_64", "sceneOrder":[]
            }},
            "assets": [],
            "scenes": [{"uuid":scene,"name":"Main Scene","entities":[],"connections":[]}]
        });
        let error = migrate_project_value(source).unwrap_err();
        assert!(error.0.contains("build.target"));
    }

    // 验证脚本元数据及项目设置迁移。
    #[test]
    fn migrates_and_validates_v2_2_script_metadata_and_settings() {
        let script = deterministic_uuid("v2.2-script");
        let source = json!({
            "formatVersion": 14,
            "engineVersion": "2.1.0",
            "projectSettings": {"inputMap": []},
            "assets": [{
                "uuid": script, "path": "Assets/Scripts/Game.rhai", "assetType": "script",
                "script": {"version": 1, "breakpoints": [3, 8], "tests": ["test_move"], "packageDependencies": []}
            }],
            "entities": []
        });
        let migrated = migrate_project_value(source).unwrap();
        assert_eq!(migrated.format_version, CURRENT_FORMAT_VERSION);
        assert_eq!(
            migrated.extra["projectSettings"]["scripting"]["maxConsoleEntries"],
            2000
        );
        assert_eq!(migrated.assets[0].extra["script"]["breakpoints"][1], 8);
        assert_eq!(migrated.assets[0].extra["script"]["apiVersion"], 1);
        assert_eq!(
            migrated.assets[0].extra["script"]["reloadPolicy"],
            "preserve"
        );
        assert_eq!(
            migrated.assets[0].extra["script"]["breakpointDetails"],
            json!([])
        );
        assert_eq!(
            migrated.extra["projectSettings"]["scripting"]["hotReloadEnabled"],
            true
        );
        assert_eq!(
            migrated.extra["projectSettings"]["scripting"]["externalEditorProtocol"],
            true
        );
        assert_eq!(
            migrated.extra["projectSettings"]["rendering"]["lightingEnabled"],
            false
        );
    }

    // 验证当前脚本接口第二版资源通过校验。
    #[test]
    fn validates_current_script_api_v2_assets() {
        let script = deterministic_uuid("v6.0.1-api-v2-script");
        let source = json!({
            "formatVersion": CURRENT_FORMAT_VERSION,
            "engineVersion": CURRENT_ENGINE_VERSION,
            "projectSettings": {"inputMap": []},
            "assets": [{
                "uuid": script,
                "path": "Assets/Scripts/CurrentApi.rhai",
                "assetType": "script",
                "script": {
                    "version": 1,
                    "apiVersion": 2,
                    "breakpoints": [],
                    "tests": [],
                    "packageDependencies": []
                }
            }],
            "entities": []
        });
        let migrated = migrate_project_value(source).expect("API v2 project migrates");
        validate_project(&migrated).expect("API v2 script metadata validates");
        assert_eq!(migrated.assets[0].extra["script"]["apiVersion"], 2);
    }

    // 验证动画组件迁移及序列化往返。
    #[test]
    fn migrates_and_round_trips_v2_4_animation_components() {
        let scene = deterministic_uuid("v2.4-scene");
        let entity = deterministic_uuid("v2.4-entity");
        let transform = deterministic_uuid("v2.4-transform");
        let skeleton = deterministic_uuid("v2.4-skeleton");
        let player = deterministic_uuid("v2.4-timeline-player");
        let rig = deterministic_uuid("v2.4-rig");
        let skin = deterministic_uuid("v2.4-skin");
        let timeline = deterministic_uuid("v2.4-timeline");
        let source = json!({
            "formatVersion": 16,
            "engineVersion": "2.3.0",
            "activeSceneUuid": scene,
            "assets": [
                {"uuid":rig,"path":"Assets/Rigs/Hero.nova-rig","assetType":"rig","futureImporterField":{"kept":true}},
                {"uuid":skin,"path":"Assets/Skins/Hero.nova-skin","assetType":"skin"},
                {"uuid":timeline,"path":"Assets/Timelines/Intro.nova-timeline","assetType":"timeline"}
            ],
            "scenes": [{"uuid":scene,"name":"Main","entities":[{
                "uuid":entity,"name":"Hero","components":[
                    {"uuid":transform,"kind":"Transform2D","data":{}},
                    {"uuid":skeleton,"kind":"Skeleton2D","data":{"rigAsset":format!("asset://{rig}"),"skinAsset":format!("asset://{skin}"),"pose":[]}},
                    {"uuid":player,"kind":"TimelinePlayer","data":{"timelineAsset":format!("asset://{timeline}"),"autoplay":true}}
                ]
            }],"connections":[]}]
        });
        let migrated = migrate_project_value(source).unwrap();
        validate_project(&migrated).unwrap();
        assert_eq!(migrated.format_version, CURRENT_FORMAT_VERSION);
        assert_eq!(migrated.engine_version, CURRENT_ENGINE_VERSION);
        assert_eq!(
            migrated.assets[0].extra["futureImporterField"]["kept"],
            true
        );
        let encoded = serde_json::to_string(&migrated).unwrap();
        let restored: ProjectFile = serde_json::from_str(&encoded).unwrap();
        validate_project(&restored).unwrap();
        assert_eq!(
            restored.scenes[0].entities[0].components[1].data["pose"],
            json!([])
        );
    }

    // 验证动画组件不能引用错误类型的资源。
    #[test]
    fn rejects_wrong_v2_4_animation_asset_types() {
        let scene = deterministic_uuid("v2.4-wrong-scene");
        let entity = deterministic_uuid("v2.4-wrong-entity");
        let transform = deterministic_uuid("v2.4-wrong-transform");
        let skeleton = deterministic_uuid("v2.4-wrong-skeleton");
        let timeline = deterministic_uuid("v2.4-wrong-timeline");
        let source = json!({
            "formatVersion": CURRENT_FORMAT_VERSION,
            "activeSceneUuid": scene,
            "assets": [{"uuid":timeline,"path":"Assets/Timelines/Intro.nova-timeline","assetType":"timeline"}],
            "scenes": [{"uuid":scene,"name":"Main","entities":[{
                "uuid":entity,"name":"Hero","components":[
                    {"uuid":transform,"kind":"Transform2D","data":{}},
                    {"uuid":skeleton,"kind":"Skeleton2D","data":{"rigAsset":format!("asset://{timeline}")}}
                ]
            }],"connections":[]}]
        });
        let error = migrate_project_value(source).unwrap_err();
        assert!(error.0.contains("expected rig"));
    }

    // 验证包清单和第二版插件接口的迁移约束。
    #[test]
    fn migrates_and_validates_v2_5_packages_and_plugin_api_2() {
        let plugin_asset = deterministic_uuid("v2.5-plugin-wasm");
        let source = json!({
            "formatVersion": 17,
            "engineVersion": "2.4.0",
            "plugins": [{
                "id":"top.whitelists.tool", "name":"Tool", "version":"1.0.0",
                "apiVersion":2, "engine":"^2.5.0", "entry":"tool.wasm",
                "entryAsset":format!("asset://{plugin_asset}"), "entryType":"wasm",
                "permissions":["editor.commands", "runtime.systems"]
            }],
            "packages": {
                "manifestVersion":1, "installed":[{
                    "manifest":{"manifestVersion":1,"id":"top.whitelists.tool","name":"Tool","version":"1.0.0"},
                    "source":{"kind":"local","location":"tool.json"}, "enabled":true, "project":true
                }], "lockfile":[], "offlineCache":[], "offlineMode":true
            },
            "assets": [{"uuid":plugin_asset,"path":"Assets/Plugins/tool.wasm","assetType":"other"}],
            "entities": []
        });
        let migrated = migrate_project_value(source).unwrap();
        validate_project(&migrated).unwrap();
        assert_eq!(migrated.format_version, CURRENT_FORMAT_VERSION);
        assert_eq!(migrated.extra["plugins"][0]["apiVersion"], 2);
        assert_eq!(
            migrated.extra["packages"]["installed"][0]["manifest"]["id"],
            "top.whitelists.tool"
        );
    }

    // 验证第一版插件接口工程保留兼容性。
    #[test]
    fn preserves_v2_0_plugin_api_1_projects() {
        let plugin_asset = deterministic_uuid("v2.0-plugin-wasm");
        let source = json!({
            "formatVersion": 12,
            "engineVersion": "2.0.0",
            "plugins": [{
                "id":"top.whitelists.legacy", "name":"Legacy", "version":"1.0.0",
                "apiVersion":1, "entry":"legacy.wasm", "entryAsset":format!("asset://{plugin_asset}"),
                "permissions":["log", "events"]
            }],
            "assets": [{"uuid":plugin_asset,"path":"Assets/Plugins/legacy.wasm","assetType":"other"}],
            "entities": []
        });
        let migrated = migrate_project_value(source).unwrap();
        assert_eq!(migrated.extra["plugins"][0]["apiVersion"], 1);
        assert_eq!(migrated.extra["packages"]["manifestVersion"], 1);
    }

    // 验证展示配置及音频混音器补齐默认值并正确校验。
    #[test]
    fn migrates_and_validates_v2_7_presentation_and_audio_mixer() {
        let source = json!({
            "formatVersion": 19,
            "engineVersion": "2.6.0",
            "projectSettings": {"inputMap": []},
            "entities": []
        });
        let migrated = migrate_project_value(source).unwrap();
        validate_project(&migrated).unwrap();
        assert_eq!(migrated.format_version, CURRENT_FORMAT_VERSION);
        assert_eq!(migrated.engine_version, CURRENT_ENGINE_VERSION);
        assert_eq!(
            migrated.extra["projectSettings"]["presentation"]["localization"]["buildLocales"][0],
            "en"
        );
        assert_eq!(
            migrated.extra["projectSettings"]["presentation"]["accessibility"]
                ["keyboardNavigation"],
            true
        );
        assert_eq!(
            migrated.extra["projectSettings"]["audio"]["mixer"]["buses"][0]["id"],
            "Master"
        );
        let encoded = serde_json::to_string(&migrated).unwrap();
        let restored: ProjectFile = serde_json::from_str(&encoded).unwrap();
        validate_project(&restored).unwrap();
    }

    // 验证超出边界的混音器配置被拒绝。
    #[test]
    fn rejects_unbounded_v2_7_audio_mixer() {
        let mut migrated = migrate_project_value(json!({
            "formatVersion": 19,
            "engineVersion": "2.6.0",
            "projectSettings": {"inputMap": []},
            "entities": []
        }))
        .unwrap();
        migrated.extra.get_mut("projectSettings").unwrap()["audio"]["mixer"]["buses"] = json!((0
            ..33)
            .map(
                /* 为混音器上限测试构造带稳定名称、增益和声部限制的总线。 */
                |index| json!({
                    "id": format!("Bus-{index}"), "name": format!("Bus {index}"),
                    "gain": 1.0, "voiceLimit": 32, "effects": [], "sends": []
                })
            )
            .collect::<Vec<_>>());
        let error = validate_project(&migrated).unwrap_err();
        assert!(error.0.contains("1 to 32 buses"));
    }

    // 验证生产设置从旧版本迁移并满足当前契约。
    #[test]
    fn migrates_and_validates_v2_8_production_settings() {
        let source = json!({
            "formatVersion": 20,
            "engineVersion": "2.7.0",
            "projectSettings": {"inputMap": [], "build": {
                "gameName":"Test", "target":"windows", "architecture":"x86_64",
                "sceneOrder":[], "startupSceneUuid":"", "packageIntoExecutable":false,
                "developmentBuild":true, "outputDirectory":""
            }},
            "entities": []
        });
        let migrated = migrate_project_value(source).unwrap();
        validate_project(&migrated).unwrap();
        assert_eq!(migrated.format_version, CURRENT_FORMAT_VERSION);
        assert_eq!(migrated.engine_version, CURRENT_ENGINE_VERSION);
        assert_eq!(
            migrated.extra["projectSettings"]["build"]["runtimeMode"],
            "game"
        );
        assert_eq!(
            migrated.extra["projectSettings"]["production"]["performance"]["traceCapacity"],
            600
        );
        assert_eq!(
            migrated.extra["projectSettings"]["production"]["networking"]["enabled"],
            false
        );
    }

    // 验证新增网络契约无需修改结构版本且保留现有数据。
    #[test]
    fn migrates_additive_26_07_networking_contract_without_schema_change() {
        let source = json!({
            "formatVersion": 20,
            "engineVersion": "2.7.0",
            "projectSettings": {"inputMap": [], "production": {
                "performance": {"traceCapacity":600,"memoryBudgetMb":300.0,"assetBudgetMb":512.0,"leakWindowFrames":600,"lifetimeCapacity":2000},
                "replay": {"seed":1313822273_u64,"capacity":3600,"strictChecksums":true},
                "testing": {"defaultTimeoutMs":10000,"tests":[]},
                "data": {"saveSchemaVersion":1,"saveMigrations":[]},
                "jobs": {"maxWorkers":2,"maxQueued":256,"timeoutMs":15000},
                "networking": {
                    "enabled":false,"permissionGranted":false,"autoStart":false,"role":"client",
                    "sessionMode":"local","sessionName":"Legacy session","playerName":"Player","maxPeers":8,
                    "transport":"websocket","endpoint":"ws://127.0.0.1:7777","bindAddress":"127.0.0.1:0",
                    "snapshotRate":20,"interpolationMs":100,"rollbackFrames":120,"bandwidthKbps":256,
                    "reconnect":true,"reconnectMaxAttempts":5,"protocolVersion":2,"schemaVersion":1,
                    "maximumPacketBytes":32768,"maximumMessagesPerSecond":240,"maximumPendingReliable":256,
                    "reliableRetryMs":150,"reliableMaximumAttempts":8,"reconciliationThreshold":0.25,
                    "lateJoin":true,
                    "channels":[{"id":"events","delivery":"reliable-ordered","maximumPayloadBytes":8192,"messagesPerSecond":60,"priority":30}],
                    "rpcContracts":[],
                    "simulation":{"enabled":false,"latencyMs":0,"jitterMs":0,"lossPercent":0.0,"duplicatePercent":0.0,"reorderPercent":0.0,"seed":1313166418_u64},
                    "replicatedEntities":[]
                }
            }},
            "entities": []
        });
        let migrated = migrate_project_value(source).unwrap();
        validate_project(&migrated).unwrap();
        let networking = &migrated.extra["projectSettings"]["production"]["networking"];
        assert_eq!(migrated.format_version, 29);
        assert_eq!(networking["protocolVersion"], 2);
        assert_eq!(networking["transportAdapterId"], "");
        assert_eq!(networking["authentication"]["mode"], "none");
        assert_eq!(networking["security"]["replayWindow"], 2048);
        assert_eq!(networking["interest"]["maximumRadius"], 4096.0);
        assert_eq!(networking["multiInstance"]["peerCount"], 2);
        assert_eq!(networking["services"]["relayProviderId"], "");
        assert_eq!(networking["allowAuthorityTransfer"], true);
        assert_eq!(networking["allowSceneHandoff"], true);
    }

    // 验证非法网络权限和服务上限被拒绝。
    #[test]
    fn rejects_invalid_26_07_network_security_and_service_bounds() {
        let mut migrated = migrate_project_value(json!({
            "formatVersion": 20,
            "engineVersion": "2.7.0",
            "projectSettings": {"inputMap": []},
            "entities": []
        }))
        .unwrap();

        migrated.extra.get_mut("projectSettings").unwrap()["production"]["networking"]
            ["authentication"]["mode"] = json!("hook");
        let error = validate_project(&migrated).unwrap_err();
        assert!(error.0.contains("requires a providerId"));

        migrated.extra.get_mut("projectSettings").unwrap()["production"]["networking"]
            ["authentication"]["providerId"] = json!("reviewed-auth");
        migrated.extra.get_mut("projectSettings").unwrap()["production"]["networking"]
            ["services"]["relayProviderId"] = json!("../unsafe");
        let error = validate_project(&migrated).unwrap_err();
        assert!(error.0.contains("relayProviderId"));

        migrated.extra.get_mut("projectSettings").unwrap()["production"]["networking"]
            ["services"]["relayProviderId"] = json!("");
        migrated.extra.get_mut("projectSettings").unwrap()["production"]["networking"]
            ["security"]["replayWindow"] = json!(16);
        let error = validate_project(&migrated).unwrap_err();
        assert!(error.0.contains("replayWindow"));
    }

    // 验证作业和测试设置的数量与执行上限。
    #[test]
    fn rejects_unbounded_v2_8_jobs_and_tests() {
        let mut migrated = migrate_project_value(json!({
            "formatVersion": 20,
            "engineVersion": "2.7.0",
            "projectSettings": {"inputMap": []},
            "entities": []
        }))
        .unwrap();
        migrated.extra.get_mut("projectSettings").unwrap()["production"]["jobs"]["maxWorkers"] =
            json!(9);
        let error = validate_project(&migrated).unwrap_err();
        assert!(error.0.contains("jobs.maxWorkers"));
    }

    // 验证多平台交付配置迁移。
    #[test]
    fn migrates_and_validates_v2_9_platform_delivery_settings() {
        let source = json!({
            "formatVersion": 21,
            "engineVersion": "2.8.0",
            "projectSettings": {"inputMap": [], "build": {
                "gameName":"Shipping Test", "target":"web", "architecture":"x86_64",
                "sceneOrder":[], "startupSceneUuid":"", "packageIntoExecutable":false,
                "developmentBuild":false, "outputDirectory":"", "runtimeMode":"game"
            }},
            "entities": []
        });
        let migrated = migrate_project_value(source).unwrap();
        validate_project(&migrated).unwrap();
        assert_eq!(migrated.format_version, CURRENT_FORMAT_VERSION);
        assert_eq!(migrated.engine_version, CURRENT_ENGINE_VERSION);
        assert_eq!(
            migrated.extra["projectSettings"]["build"]["profile"],
            "release"
        );
        assert_eq!(
            migrated.extra["projectSettings"]["build"]["platform"]["identifier"],
            "top.whitelists.mygame"
        );
        assert_eq!(
            migrated.extra["projectSettings"]["build"]["delivery"]["deterministic"],
            true
        );
        assert_eq!(
            migrated.extra["projectSettings"]["build"]["delivery"]["telemetryEnabled"],
            false
        );
    }

    // 验证不安全的遥测端点被拒绝。
    #[test]
    fn rejects_insecure_v2_9_telemetry_endpoint() {
        let mut migrated = migrate_project_value(json!({
            "formatVersion": 21, "engineVersion": "2.8.0",
            "projectSettings": {"inputMap": []}, "entities": []
        }))
        .unwrap();
        let delivery = &mut migrated.extra.get_mut("projectSettings").unwrap()["build"]["delivery"];
        delivery["telemetryEnabled"] = json!(true);
        delivery["telemetryEndpoint"] = json!("http://insecure.invalid/events");
        delivery["privacyPolicyUrl"] = json!("https://example.invalid/privacy");
        let error = validate_project(&migrated).unwrap_err();
        assert!(error.0.contains("bounded HTTPS URL"));
    }

    // 验证命名物理层迁移不改变既有碰撞位。
    #[test]
    fn schema_24_adds_named_physics_layers_without_changing_collision_bits() {
        let source = json!({
            "formatVersion": 23,
            "entities": [],
            "globalSettings": {
                "gravity": 9.8,
                "airFriction": 0.01,
                "timeScale": 1.0,
                "tickRate": 60,
                "maxCatchUpSteps": 8,
                "collisionMatrix": (0..32).map(/* 把层编号转换为单比特碰撞掩码。 */ |layer| 1_u64 << layer).collect::<Vec<_>>()
            }
        });
        let migrated = migrate_project_value(source).expect("schema 23 project migrates");
        let value = serde_json::to_value(migrated).expect("project serializes");
        let settings = &value["scenes"][0]["globalSettings"];
        assert_eq!(settings["layers"].as_array().map(Vec::len), Some(32));
        assert_eq!(settings["layers"][0]["name"], "Default");
        assert_eq!(settings["interpolation"], "Interpolate");
        assert_eq!(settings["collisionMatrix"][0], 1);
    }

    // 验证视觉音频预设迁移只修复已知旧描边默认值。
    #[test]
    fn schema_27_adds_visual_audio_profiles_and_repairs_only_the_legacy_default_outline() {
        let entity = "10000000-0000-4000-8000-000000000001";
        let component = "20000000-0000-4000-8000-000000000001";
        let transform = "20000000-0000-4000-8000-000000000002";
        let asset = "30000000-0000-4000-8000-000000000001";
        let migrated = migrate_project_value(json!({
            "formatVersion": 26,
            "projectSettings": {"inputMap": []},
            "assets": [{"uuid":asset,"assetType":"font","source":"data:font/woff2;base64,AA==","settings":{}}],
            "entities": [{"uuid":entity,"name":"Legacy box","components":[
                {"uuid":transform,"kind":"Transform2D","enabled":true,"removed":false,"data":{"parentUuid":null}},
                {"uuid":component,"kind":"ShapeRenderer2D","enabled":true,"removed":false,
                 "data":{"strokeWidth":1.0,"strokeColor":{"r":0,"g":90,"b":155},"strokeOpacity":100}}
            ]}]
        })).expect("schema 26 project migrates");
        let value = serde_json::to_value(migrated).expect("project serializes");
        assert_eq!(value["formatVersion"], CURRENT_FORMAT_VERSION);
        assert_eq!(
            value["scenes"][0]["entities"][0]["components"][1]["data"]["strokeWidth"],
            0.04
        );
        assert_eq!(
            value["projectSettings"]["rendering"]["qualityPreset"],
            "Balanced"
        );
        assert_eq!(
            value["projectSettings"]["rendering"]["particleBudget"],
            10000
        );
        assert_eq!(
            value["assets"][0]["settings"]["fontSettings"]["renderMode"],
            "Scalable"
        );
        assert_eq!(value["assets"][0]["settings"]["textureProfile"], "General");
    }

    // 验证世界数据迁移保留作者已有内容。
    #[test]
    fn schema_28_adds_world_data_without_discarding_authored_content() {
        let entity = "10000000-0000-4000-8000-000000000001";
        let transform = "20000000-0000-4000-8000-000000000001";
        let tilemap = "20000000-0000-4000-8000-000000000002";
        let tileset = "30000000-0000-4000-8000-000000000001";
        let migrated = migrate_project_value(json!({
            "formatVersion": 27,
            "projectSettings": {"inputMap": []},
            "assets": [{
                "uuid": tileset,
                "assetType": "tileset",
                "source": "{\"version\":1,\"textureAsset\":null,\"tileWidth\":16,\"tileHeight\":16,\"columns\":1,\"rows\":1,\"tiles\":[{\"index\":0,\"name\":\"Ground\",\"collision\":\"Box\",\"polygon\":[],\"terrain\":\"Ground\",\"navigationCost\":1,\"occluder\":false}]}",
                "settings": {}
            }],
            "entities": [{"uuid":entity,"name":"World","components":[
                {"uuid":transform,"kind":"Transform2D","enabled":true,"removed":false,"data":{"parentUuid":null}},
                {"uuid":tilemap,"kind":"TileMap2D","enabled":true,"removed":false,"data":{"width":1,"height":1,"tiles":[0],"layers":[{"id":"base","name":"Base","visible":true,"locked":false,"opacity":1,"tiles":[0]}]}}
            ]}]
        })).expect("schema 27 project migrates");
        let value = serde_json::to_value(migrated).expect("project serializes");
        assert_eq!(value["formatVersion"], CURRENT_FORMAT_VERSION);
        assert_eq!(value["engineVersion"], CURRENT_ENGINE_VERSION);
        assert_eq!(
            value["scenes"][0]["entities"][0]["components"][1]["data"]["layers"][0]["tiles"][0],
            0
        );
        assert_eq!(
            value["scenes"][0]["entities"][0]["components"][1]["data"]["layers"][0]["blendMode"],
            "Alpha"
        );
        let tileset_source = value["assets"][0]["source"]
            .as_str()
            .expect("tileset source");
        let document: Value =
            serde_json::from_str(tileset_source).expect("migrated tileset parses");
        assert_eq!(document["version"], 2);
        assert_eq!(document["tiles"][0]["terrain"], "Ground");
        assert_eq!(document["tiles"][0]["metadata"], json!({}));
    }

    // 验证历史引擎版本边界被固定，结构版本仍保持二十九。
    #[test]
    fn v2601_seals_historical_engine_boundaries_without_changing_schema_29() {
        let fixture: Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/migrations/public-schema-inputs.json"
        ))
        .expect("migration fixture parses");
        let mut source = fixture["baseProject"].clone();
        source["formatVersion"] = json!(29);
        source["engineVersion"] = json!("3.9.0");
        source["manifest"]["schemaVersion"] = json!(29);
        source["manifest"]["engineCompatibility"] =
            json!({"minimum":"3.0.0","maximumExclusive":"4.0.0"});
        let migrated = migrate_project_value(source).expect("3.9 release candidate migrates");
        assert_eq!(migrated.format_version, 29);
        assert_eq!(migrated.engine_version, CURRENT_ENGINE_VERSION);
        assert_eq!(
            migrated.manifest.engine_compatibility.maximum_exclusive,
            "27.0.0"
        );
        validate_project(&migrated).expect("5.x compatibility seal validates");

        let mut v4_source = fixture["baseProject"].clone();
        v4_source["formatVersion"] = json!(29);
        v4_source["engineVersion"] = json!("4.8.0");
        v4_source["manifest"]["schemaVersion"] = json!(29);
        v4_source["manifest"]["engineCompatibility"] =
            json!({"minimum":"3.9.0","maximumExclusive":"5.0.0"});
        let migrated_v4 = migrate_project_value(v4_source).expect("4.x project migrates");
        assert_eq!(migrated_v4.format_version, 29);
        assert_eq!(migrated_v4.engine_version, CURRENT_ENGINE_VERSION);
        assert_eq!(
            migrated_v4.manifest.engine_compatibility.maximum_exclusive,
            "27.0.0"
        );
        validate_project(&migrated_v4).expect("4.x to 5.x compatibility seal validates");

        let mut v6_source = fixture["baseProject"].clone();
        v6_source["formatVersion"] = json!(29);
        v6_source["engineVersion"] = json!("6.9.0");
        v6_source["manifest"]["schemaVersion"] = json!(29);
        v6_source["manifest"]["engineCompatibility"] =
            json!({"minimum":"3.9.0","maximumExclusive":"7.0.0"});
        let migrated_v6 = migrate_project_value(v6_source).expect("6.x project migrates");
        assert_eq!(migrated_v6.format_version, 29);
        assert_eq!(migrated_v6.engine_version, CURRENT_ENGINE_VERSION);
        assert_eq!(
            migrated_v6.manifest.engine_compatibility.maximum_exclusive,
            "27.0.0"
        );
        validate_project(&migrated_v6).expect("6.x to 7.x compatibility seal validates");
    }
}

#[cfg(test)]
mod physics_float_roundtrip_26_17 {
    // 验证项目浮点数字序列化后保留精确二进制数值。
    #[test]
    fn project_numbers_preserve_exact_binary_values() {
        let values: [f64; 7] = [
            11.180339887498949,
            3.7500000000000004,
            1.8750000000000002,
            0.10000000000000002,
            -0.0,
            1.0e-20,
            1.0e50,
        ];
        for expected in values {
            let source = serde_json::to_string(&expected).unwrap();
            let actual: f64 = serde_json::from_str(&source).unwrap();
            assert_eq!(actual.to_bits(), expected.to_bits(), "{source}");
        }
    }
}

#[cfg(test)]
mod partial_production_migration_26_21 {
    use super::*;

    // 验证不完整旧生产配置补齐默认值时保留作者设置。
    #[test]
    fn historical_partial_production_settings_keep_authored_values() {
        let source =
            include_str!("../../../reference-projects/projects/authoring-5000-stress/project.nova");
        let migrated = migrate_project_str(source).expect("historical partial settings migrate");
        let value: Value = serde_json::from_str(&migrated).unwrap();
        assert_eq!(
            value["scenes"][0]["entities"].as_array().unwrap().len(),
            5001
        );
        assert_eq!(
            value["projectSettings"]["production"]["performance"]["animationBudgetMs"],
            2
        );
        assert_eq!(
            value["projectSettings"]["production"]["performance"]["uiBudgetMs"],
            2
        );
        assert_eq!(
            value["projectSettings"]["production"]["performance"]["traceCapacity"],
            600
        );
        assert_eq!(migrate_project_str(&migrated).unwrap(), migrated);
    }

    // 验证明确非法的生产值报错，而非被静默替换。
    #[test]
    fn explicit_invalid_production_values_are_not_silently_repaired() {
        let mut source: Value = serde_json::from_str(include_str!(
            "../../../reference-projects/projects/authoring-5000-stress/project.nova"
        ))
        .unwrap();
        source["projectSettings"]["production"]["performance"]["traceCapacity"] = json!(10001);
        assert!(migrate_project_value(source.clone()).is_err());
        source["projectSettings"]["production"]["performance"] = Value::Null;
        assert!(migrate_project_value(source).is_err());
    }
}

#[cfg(test)]
mod authored_binding_migration_26_21 {
    use super::*;
    // 验证传感器、笔设备和第二版脚本接口配置得到保留。
    #[test]
    fn sensor_pen_devices_and_script_api_two_survive_migration() {
        let base: Value = serde_json::from_str(include_str!("../../../reference-projects/projects/platform-v2608-touch-pen-accessibility/project.nova")).unwrap();
        for device in [
            "sensor",
            "pen-button",
            "pen-pressure",
            "pen-tilt",
            "pen-twist",
        ] {
            let mut source = base.clone();
            source["projectSettings"]["inputMap"][0]["bindings"][0]["device"] = json!(device);
            source["projectSettings"]["scripting"]["apiVersion"] = json!(2);
            let migrated = serde_json::to_value(migrate_project_value(source).unwrap()).unwrap();
            assert_eq!(
                migrated["projectSettings"]["inputMap"][0]["bindings"][0]["device"],
                device
            );
            assert_eq!(migrated["projectSettings"]["scripting"]["apiVersion"], 2);
        }
        let mut invalid_api = base.clone();
        invalid_api["projectSettings"]["scripting"]["apiVersion"] = json!(99);
        assert!(migrate_project_value(invalid_api).is_err());
        let mut invalid = base;
        invalid["projectSettings"]["inputMap"][0]["bindings"][0]["device"] =
            json!("unsupported-device");
        assert!(migrate_project_value(invalid).is_err());
    }
    // 验证部分构建配置迁移保留交付规则。
    #[test]
    fn partial_build_settings_preserve_delivery_rules() {
        let source: Value = serde_json::from_str(include_str!(
            "../../../reference-projects/projects/data-foundation-validation/project.nova"
        ))
        .unwrap();
        let delivery = source["projectSettings"]["build"]["delivery"].clone();
        let migrated = serde_json::to_value(migrate_project_value(source).unwrap()).unwrap();
        for key in ["include", "exclude", "stripUnusedAssets"] {
            assert_eq!(
                migrated["projectSettings"]["build"]["delivery"][key],
                delivery[key]
            );
        }
        assert_eq!(migrated["projectSettings"]["build"]["gameName"], "MyGame");
    }
}

#[cfg(test)]
mod legacy_script_reference_26_21 {
    use super::*;
    // 验证历史脚本身份规范化不改变引用目标。
    #[test]
    fn known_legacy_script_ids_become_canonical_without_changing_target() {
        let source = include_str!(
            "../../../reference-projects/projects/script-v46-api-contract/project.nova"
        );
        let original: Value = serde_json::from_str(source).unwrap();
        let migrated = migrate_project_str(source).unwrap();
        let output: Value = serde_json::from_str(&migrated).unwrap();
        for (before_scene, after_scene) in original["scenes"]
            .as_array()
            .unwrap()
            .iter()
            .zip(output["scenes"].as_array().unwrap())
        {
            for (before, after) in before_scene["entities"]
                .as_array()
                .unwrap()
                .iter()
                .zip(after_scene["entities"].as_array().unwrap())
            {
                for component in before["components"].as_array().unwrap().iter().filter(
                    /* 判断 c ["kind"] == "Script2D" 是否成立，供过滤或有效性检查使用。 */
                    |c| c["kind"] == "Script2D",
                ) {
                    let actual = after["components"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(/* 判断 c ["uuid"] == component ["uuid"] 是否成立，供过滤或有效性检查使用。 */ |c| c["uuid"] == component["uuid"])
                        .unwrap();
                    assert_eq!(
                        actual["data"]["scriptAsset"],
                        format!(
                            "asset://{}",
                            component["data"]["scriptAsset"].as_str().unwrap()
                        )
                    );
                }
            }
        }
        assert_eq!(migrate_project_str(&migrated).unwrap(), migrated);
        let mut modern = original;
        modern["engineVersion"] = json!(CURRENT_ENGINE_VERSION);
        modern["manifest"]["engineCompatibility"]["maximumExclusive"] = json!("27.0.0");
        assert!(migrate_project_value(modern)
            .unwrap_err()
            .0
            .contains("invalid asset reference"));
    }
}

#[cfg(test)]
mod authored_test_kinds_26_22 {
    use super::*;

    // 逐类验证编辑器测试类型迁移，并拒绝未知类型。
    #[test]
    fn every_editor_test_kind_migrates_and_unknown_kinds_fail() {
        let base: Value = serde_json::from_str(include_str!(
            "../../../reference-projects/projects/authoring-5000-stress/project.nova"
        ))
        .unwrap();
        for kind in [
            "unit",
            "scene",
            "integration",
            "headless",
            "ui",
            "physics",
            "animation",
            "regression",
            "unsupported",
        ] {
            let mut source = base.clone();
            source["projectSettings"]["production"]["testing"] = json!({
                "defaultTimeoutMs": 10000,
                "tests": [{"id":"kind-audit", "name":"Kind audit", "kind":kind,
                    "steps":1, "timeoutMs":1000, "captureScreenshot":false, "assertions":[]}]
            });
            let result = migrate_project_value(source);
            if kind == "unsupported" {
                assert!(result.is_err(), "unknown test kind accepted");
            } else {
                let migrated =
                    serde_json::to_value(result.unwrap_or_else(/* 计算并返回 panic ! ("{kind}: {error}")，用于当前 every_editor_test_kind_migrates_and_unknown_kinds_fail 流程。 */ |error| panic!("{kind}: {error}")))
                        .unwrap();
                assert_eq!(
                    migrated["projectSettings"]["production"]["testing"]["tests"][0]["kind"],
                    kind
                );
            }
        }
    }
}
