// 桌面宿主：导出与事务保存、运行包加载、受控网络、外部工具和诊断日志。
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::{SocketAddr, UdpSocket};
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Manager;

mod native_admission;
mod runtime_pak_preflight;
mod runtime_package_source;
#[cfg(test)]
mod native_export_tests;

const EMBEDDED_LEGACY_MAGIC: &[u8; 8] = b"NOVAPAK!";
const EMBEDDED_MAGIC: &[u8; 8] = b"NOVAPK2!";
const EMBEDDED_LEGACY_FOOTER_BYTES: u64 = 16;
const EMBEDDED_FOOTER_BYTES: u64 = 48;
const MAX_EMBEDDED_PACKAGE_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_WEB_EXPORT_FILES: usize = 20_000;
const MAX_WEB_EXPORT_FILE_BYTES: u64 = 256 * 1024 * 1024;
const MAX_WEB_EXPORT_TOTAL_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");
const MAX_RUNTIME_PROJECT_BYTES: usize = 64 * 1024 * 1024;
const MAX_RUNTIME_UDP_SOCKETS: usize = 8;
const MAX_EDITOR_UDP_SOCKETS: usize = 32;
static EXPORTED_PLAYER_MODE: OnceLock<bool> = OnceLock::new();
static RUNTIME_PACKAGE_IDENTITY: OnceLock<Option<runtime_package_source::PackageIdentity>> = OnceLock::new();
static RUNTIME_NETWORK_POLICY: OnceLock<Result<Option<RuntimeNetworkPolicy>, String>> =
    OnceLock::new();

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportFile {
    path: String,
    data_base64: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportRequest {
    game_name: String,
    target: String,
    architecture: String,
    runtime_mode: String,
    package_into_executable: bool,
    development_build: bool,
    output_directory: String,
    pack_base64: String,
    web_files: Vec<ExportFile>,
    run: bool,
    project_id: String,
    profile: String,
    platform: BuildPlatformOptions,
    delivery: BuildDeliveryOptions,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildPlatformOptions {
    identifier: String,
    version: String,
    icon_asset: Option<String>,
    splash_asset: Option<String>,
    orientation: String,
    permissions: Vec<String>,
    signing_mode: String,
    signing_identity: String,
    notarization_profile: String,
    #[serde(default)]
    manifest_asset: Option<String>,
    #[serde(default)]
    version_metadata: BTreeMap<String, String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildDeliveryOptions {
    deterministic: bool,
    incremental: bool,
    compression: String,
    patch_manifest: bool,
    structured_logs: bool,
    crash_reports: bool,
    telemetry_enabled: bool,
    telemetry_endpoint: String,
    privacy_policy_url: String,
    #[serde(default)]
    cache_mode: String,
    #[serde(default)]
    include: Vec<String>,
    #[serde(default)]
    exclude: Vec<String>,
    #[serde(default)]
    strip_unused_assets: bool,
    #[serde(default)]
    size_report: bool,
    #[serde(default)]
    dependency_report: bool,
    #[serde(default)]
    debug_symbols: bool,
    #[serde(default)]
    crash_symbols: bool,
    #[serde(default)]
    release_channel: String,
    #[serde(default)]
    export_template: String,
    #[serde(default)]
    provenance: bool,
    #[serde(default)]
    sbom: bool,
    #[serde(default)]
    web_headers: bool,
    #[serde(default)]
    deployment_mode: String,
    #[serde(default)]
    deployment_destination: String,
    #[serde(default)]
    signing_hook: String,
    #[serde(default)]
    notarization_hook: String,
    #[serde(default)]
    clean_machine_job: bool,
    #[serde(default = "default_true")]
    content_cache: bool,
    #[serde(default = "default_true")]
    delta_builds: bool,
    #[serde(default = "default_ci_matrix_version")]
    ci_matrix_version: u32,
    #[serde(default)]
    deployment_connector_id: String,
    #[serde(default)]
    deployment_permission_granted: bool,
}

// 为缺省的可选布尔字段提供启用值。
fn default_true() -> bool {
    true
}
// 为缺省的持续集成平台矩阵提供版本号。
fn default_ci_matrix_version() -> u32 {
    1
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportResult {
    output_path: String,
    files: Vec<String>,
    launched: bool,
    cache_hits: usize,
    changed_files: usize,
    build_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportCapabilities {
    host: String,
    architecture: String,
    android_available: bool,
    android_reason: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AndroidToolchainStatus {
    available: bool,
    jdk_ready: bool,
    sdk_ready: bool,
    platform_ready: bool,
    build_tools_ready: bool,
    ndk_ready: bool,
    adb_ready: bool,
    template_ready: bool,
    sdk_root: Option<String>,
    java_home: Option<String>,
    adb_path: Option<String>,
    template_path: Option<String>,
    missing: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AndroidDevice {
    serial: String,
    state: String,
    description: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AndroidDeployRequest {
    apk_path: String,
    device_serial: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AndroidCommandResult {
    success: bool,
    output: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeAccessibilityCapabilities {
    platform: String,
    webview_dom_bridge: bool,
    native_custom_adapters: bool,
    automation_provider: String,
    notes: Vec<String>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildFileRecord {
    path: String,
    sha256: String,
    bytes: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildReport {
    format: String,
    version: u32,
    engine_version: String,
    build_id: String,
    created_at: u64,
    target: String,
    architecture: String,
    profile: String,
    #[serde(default = "default_runtime_mode")]
    runtime_mode: String,
    project_id: String,
    #[serde(default)]
    cache_mode: String,
    #[serde(default)]
    total_bytes: u64,
    files: Vec<BuildFileRecord>,
}

// 为缺省构建配置提供图形运行模式。
fn default_runtime_mode() -> String {
    "game".into()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExternalDiffRequest {
    executable: String,
    arguments: String,
    left: String,
    right: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExternalMergeRequest {
    executable: String,
    arguments: String,
    base: String,
    ours: String,
    theirs: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NetworkInstanceLaunchRequest {
    executable: String,
    working_directory: String,
    session_name: String,
    count: u8,
    separate_logs: bool,
    separate_inspectors: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NetworkInstanceLaunch {
    id: String,
    role: String,
    player_name: String,
    session_name: String,
    log_scope: String,
    inspector_id: String,
    endpoint: String,
    bind_address: String,
    process_id: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeOverrides {
    network_role: Option<String>,
    player_name: Option<String>,
    session_name: Option<String>,
    instance_id: Option<String>,
    log_scope: Option<String>,
    inspector_id: Option<String>,
    session_mode: Option<String>,
    transport: Option<String>,
    endpoint: Option<String>,
    bind_address: Option<String>,
}

struct ManagedNetworkInstance {
    child: Child,
    launch: NetworkInstanceLaunch,
}

// 停止网络测试子进程并等待回收，避免遗留后台进程。
fn terminate_network_child(child: &mut Child) -> Result<(), String> {
    if child
        .try_wait()
        .map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )?
        .is_some()
    {
        return Ok(());
    }
    child.kill().map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    child.wait().map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    Ok(())
}

#[derive(Default)]
struct NetworkInstances {
    children: Mutex<HashMap<String, ManagedNetworkInstance>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NetworkInstanceStatus {
    id: String,
    role: String,
    player_name: String,
    session_name: String,
    log_scope: String,
    inspector_id: String,
    endpoint: String,
    bind_address: String,
    process_id: u32,
    running: bool,
    exit_code: Option<i32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CrashPayload {
    message: String,
    stack: String,
    project: String,
    scene: String,
    renderer: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectTransactionFile {
    path: String,
    data_base64: String,
    checksum: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectTransactionRequest {
    project_directory: String,
    transaction_id: String,
    files: Vec<ProjectTransactionFile>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectTransactionResult {
    transaction_id: String,
    committed_files: usize,
    committed_bytes: u64,
    journal_path: String,
}

#[derive(Default)]
struct UdpSockets {
    next_id: AtomicU32,
    sockets: Mutex<HashMap<u32, ManagedUdpSocket>>,
}

struct ManagedUdpSocket {
    socket: UdpSocket,
    authorization: Option<RuntimeUdpAuthorization>,
    admitted_peers: HashSet<SocketAddr>,
}

#[derive(Serialize)]
struct UdpPacket {
    source: String,
    payload: String,
}

#[derive(Clone)]
struct RuntimeNetworkPolicy {
    configured_role: String,
    session_mode: String,
    transport: String,
    endpoint: String,
    bind_address: String,
    maximum_peers: usize,
    protocol_version: u64,
    requires_encryption: bool,
    client_allowed: bool,
    listen_allowed: bool,
    enabled: bool,
    permission_granted: bool,
    auto_start: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct RuntimeUdpAuthorization {
    role: String,
    bind_address: SocketAddr,
    endpoint: SocketAddr,
    maximum_peers: usize,
}

// 拒绝运行包模式下调用仅属于编辑器的宿主能力。
fn require_editor_mode() -> Result<(), String> {
    let player = *EXPORTED_PLAYER_MODE.get_or_init(/* 计算并返回 runtime_package_bytes () . map (| package | package . is_some ()) . unwrap_or (true)，用于当前 require_editor_mode 流程。 */ || {
        runtime_package_bytes()
            .map(/* 计算并返回 package . is_some ()，用于当前 require_editor_mode 流程。 */ |package| package.is_some())
            .unwrap_or(true)
    });
    if player {
        Err(
            "This editor-only native command is unavailable in exported Nova Player applications."
                .into(),
        )
    } else {
        Ok(())
    }
}

// 解析套接字地址并为错误添加具体字段说明。
fn parse_udp_address(value: &str, label: &str) -> Result<SocketAddr, String> {
    value
        .trim()
        .trim_start_matches("udp://")
        .parse::<SocketAddr>()
        .map_err(/* 计算并返回 format ! ("{label} must be an IP address and port")，用于当前 parse_udp_address 流程。 */ |_| format!("{label} must be an IP address and port"))
}

// 检查请求地址是否仍位于已授权的绑定或目标范围。
fn udp_address_stays_in_scope(configured: SocketAddr, requested: SocketAddr) -> bool {
    requested.ip() == configured.ip()
        || (requested.ip().is_loopback()
            && (configured.ip().is_loopback() || configured.ip().is_unspecified()))
}

// 读取并验证运行包授予的 UDP 权限及限制。
fn require_runtime_udp_permission() -> Result<Option<RuntimeUdpAuthorization>, String> {
    let policy = RUNTIME_NETWORK_POLICY
        .get_or_init(load_runtime_network_policy)
        .clone()?;
    let Some(policy) = policy else {
        return Ok(None);
    };
    if !policy.enabled || !policy.permission_granted || !policy.auto_start {
        return Err(
            "The embedded project has not enabled and authorized automatic networking.".into(),
        );
    }
    if policy.protocol_version != 2 {
        return Err("The embedded project did not authorize Nova Network Protocol 2.".into());
    }
    if policy.requires_encryption {
        return Err("The embedded project requires encryption, but the built-in native UDP transport is plaintext.".into());
    }
    if !policy.client_allowed {
        return Err("The embedded networking package has not granted network.client.".into());
    }
    let requested_role = bounded_environment_value("NOVA_NETWORK_ROLE", 16).unwrap_or_else(
        /* 复制 policy . configured_role . clone () 的结果，避免向调用方暴露可变宿主引用。 */
        || policy.configured_role.clone(),
    );
    if !matches!(requested_role.as_str(), "client" | "host" | "server") {
        return Err("The runtime network role override is invalid.".into());
    }
    if matches!(requested_role.as_str(), "host" | "server") {
        if !matches!(policy.configured_role.as_str(), "host" | "server") {
            return Err(
                "A runtime override cannot elevate a Client project to Host or Server.".into(),
            );
        }
        if !policy.listen_allowed {
            return Err(
                "Host and Server networking require the reviewed network.listen permission.".into(),
            );
        }
    }
    if policy.session_mode != "direct" || policy.transport != "native-udp" {
        return Err("The embedded project did not authorize the native UDP transport.".into());
    }
    if bounded_environment_value("NOVA_NETWORK_SESSION_MODE", 16).is_some_and(
        /* 判断 value != policy . session_mode 是否成立，供过滤或有效性检查使用。 */
        |value| value != policy.session_mode,
    ) || bounded_environment_value("NOVA_NETWORK_TRANSPORT", 24).is_some_and(
        /* 判断 value != policy . transport 是否成立，供过滤或有效性检查使用。 */
        |value| value != policy.transport,
    ) {
        return Err(
            "Runtime overrides cannot enable or replace the embedded network session capability."
                .into(),
        );
    }
    let configured_endpoint =
        parse_udp_address(&policy.endpoint, "The embedded UDP endpoint policy")?;
    let configured_bind = parse_udp_address(&policy.bind_address, "The embedded UDP bind policy")?;
    let endpoint = bounded_environment_value("NOVA_NETWORK_ENDPOINT", 256)
        .map(/* 计算并返回 parse_udp_address (& value , "The runtime UDP endpoint override")，用于当前 require_runtime_udp_permission 流程。 */ |value| parse_udp_address(&value, "The runtime UDP endpoint override"))
        .transpose()?
        .unwrap_or(configured_endpoint);
    let bind_address = bounded_environment_value("NOVA_NETWORK_BIND_ADDRESS", 256)
        .map(/* 计算并返回 parse_udp_address (& value , "The runtime UDP bind override")，用于当前 require_runtime_udp_permission 流程。 */ |value| parse_udp_address(&value, "The runtime UDP bind override"))
        .transpose()?
        .unwrap_or(configured_bind);
    if !udp_address_stays_in_scope(configured_endpoint, endpoint)
        || !udp_address_stays_in_scope(configured_bind, bind_address)
    {
        return Err("Runtime overrides may change a UDP port, but cannot broaden the authorized network interface or host.".into());
    }
    Ok(Some(RuntimeUdpAuthorization {
        role: requested_role,
        bind_address,
        endpoint,
        maximum_peers: policy.maximum_peers.clamp(1, 64),
    }))
}

// 按授权绑定 UDP 套接字，应用非阻塞和资源数量限制。
fn open_udp_socket(
    state: &UdpSockets,
    address: SocketAddr,
    authorization: Option<RuntimeUdpAuthorization>,
) -> Result<u32, String> {
    let mut sockets = state.sockets.lock().map_err(
        /* 返回该失败路径的明确错误：UDP socket state is unavailable。 */
        |_| "UDP socket state is unavailable".to_string(),
    )?;
    let maximum = if authorization.is_some() {
        MAX_RUNTIME_UDP_SOCKETS
    } else {
        MAX_EDITOR_UDP_SOCKETS
    };
    if sockets.len() >= maximum {
        return Err(format!("UDP socket limit reached ({maximum})"));
    }
    let socket = UdpSocket::bind(address).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    socket.set_nonblocking(true).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    let socket_id = (0..=maximum)
        .find_map(
            /* 递增套接字句柄计数，仅接受非零且尚未占用的候选句柄。 */
            |_| {
                let candidate = state
                    .next_id
                    .fetch_add(1, Ordering::Relaxed)
                    .wrapping_add(1);
                (candidate != 0 && !sockets.contains_key(&candidate)).then_some(candidate)
            },
        )
        .ok_or("Could not allocate a unique UDP socket identity")?;
    sockets.insert(
        socket_id,
        ManagedUdpSocket {
            socket,
            authorization,
            admitted_peers: HashSet::new(),
        },
    );
    Ok(socket_id)
}

// 判断发送目标是否符合静态或已接纳对等端授权。
fn udp_target_is_authorized(
    authorization: Option<&RuntimeUdpAuthorization>,
    admitted_peers: &HashSet<SocketAddr>,
    target: SocketAddr,
) -> bool {
    authorization.is_none()
        || authorization.is_some_and(/* 判断 target == policy . endpoint || (matches ! (policy . role . as_str () , "host" | "server") && admitted_peers . contains (& target)) 是否成立，供过滤或有效性检查使用。 */ |policy| {
            target == policy.endpoint
                || (matches!(policy.role.as_str(), "host" | "server")
                    && admitted_peers.contains(&target))
        })
}

// 检查套接字绑定地址是否在许可范围。
fn udp_bind_is_authorized(
    authorization: Option<&RuntimeUdpAuthorization>,
    address: SocketAddr,
) -> bool {
    authorization.is_none()
        || authorization.is_some_and(
            /* 判断 address == policy . bind_address 是否成立，供过滤或有效性检查使用。 */
            |policy| address == policy.bind_address,
        )
}

// 判断收到的数据来源是否属于允许的对等端。
fn udp_source_is_authorized(
    authorization: Option<&RuntimeUdpAuthorization>,
    source: SocketAddr,
) -> bool {
    authorization.is_none()
        || authorization.is_some_and(/* 判断 policy . role != "client" || source == policy . endpoint 是否成立，供过滤或有效性检查使用。 */ |policy| policy.role != "client" || source == policy.endpoint)
}

// 在数量和地址范围约束内接纳网络对等端。
fn admit_udp_peer(
    authorization: Option<&RuntimeUdpAuthorization>,
    admitted_peers: &mut HashSet<SocketAddr>,
    address: SocketAddr,
) -> Result<(), String> {
    let Some(policy) = authorization else {
        return Ok(());
    };
    if policy.role == "client" {
        return (address == policy.endpoint).then_some(()).ok_or_else(/* 计算并返回 "A Client runtime can admit only its configured server endpoint." . into ()，用于当前 admit_udp_peer 流程。 */ || {
            "A Client runtime can admit only its configured server endpoint.".into()
        });
    }
    if !admitted_peers.contains(&address) && admitted_peers.len() >= policy.maximum_peers {
        return Err("The native UDP admitted-peer limit has been reached.".into());
    }
    admitted_peers.insert(address);
    Ok(())
}

// 为前端打开受限 UDP 套接字并返回内部句柄。
#[tauri::command]
fn udp_open(state: tauri::State<'_, UdpSockets>, bind_address: String) -> Result<u32, String> {
    let authorization = require_runtime_udp_permission()?;
    let address = parse_udp_address(&bind_address, "UDP bind address")?;
    if !udp_bind_is_authorized(authorization.as_ref(), address) {
        return Err(
            "UDP bind address is outside the embedded project's effective network policy.".into(),
        );
    }
    open_udp_socket(state.inner(), address, authorization)
}

// 验证套接字状态后接纳指定 UDP 对等端。
#[tauri::command]
fn udp_admit_peer(
    state: tauri::State<'_, UdpSockets>,
    socket_id: u32,
    target: String,
) -> Result<(), String> {
    let authorization = require_runtime_udp_permission()?;
    let address = parse_udp_address(&target, "UDP peer")?;
    let mut sockets = state.sockets.lock().map_err(
        /* 返回该失败路径的明确错误：UDP socket state is unavailable。 */
        |_| "UDP socket state is unavailable".to_string(),
    )?;
    let socket = sockets
        .get_mut(&socket_id)
        .ok_or("UDP socket is not open")?;
    if socket.authorization != authorization {
        return Err("UDP socket does not belong to the active runtime network policy.".into());
    }
    admit_udp_peer(
        socket.authorization.as_ref(),
        &mut socket.admitted_peers,
        address,
    )
}

// 从指定套接字的已接纳对等端集合移除目标。
#[tauri::command]
fn udp_forget_peer(
    state: tauri::State<'_, UdpSockets>,
    socket_id: u32,
    target: String,
) -> Result<(), String> {
    let authorization = require_runtime_udp_permission()?;
    let address = parse_udp_address(&target, "UDP peer")?;
    let mut sockets = state.sockets.lock().map_err(
        /* 返回该失败路径的明确错误：UDP socket state is unavailable。 */
        |_| "UDP socket state is unavailable".to_string(),
    )?;
    let socket = sockets
        .get_mut(&socket_id)
        .ok_or("UDP socket is not open")?;
    if socket.authorization != authorization {
        return Err("UDP socket does not belong to the active runtime network policy.".into());
    }
    socket.admitted_peers.remove(&address);
    Ok(())
}

// 验证发送许可、目标和负载大小后发送 UDP 数据。
#[tauri::command]
fn udp_send(
    state: tauri::State<'_, UdpSockets>,
    socket_id: u32,
    target: String,
    payload: String,
) -> Result<(), String> {
    let authorization = require_runtime_udp_permission()?;
    if payload.len() > 65_507 {
        return Err("UDP payload exceeds 65,507 bytes".into());
    }
    let address = parse_udp_address(&target, "UDP target")?;
    let sockets = state.sockets.lock().map_err(
        /* 返回该失败路径的明确错误：UDP socket state is unavailable。 */
        |_| "UDP socket state is unavailable".to_string(),
    )?;
    let socket = sockets.get(&socket_id).ok_or("UDP socket is not open")?;
    if socket.authorization != authorization {
        return Err("UDP socket does not belong to the active runtime network policy.".into());
    }
    if !udp_target_is_authorized(
        socket.authorization.as_ref(),
        &socket.admitted_peers,
        address,
    ) {
        return Err("UDP target is outside the embedded project's effective endpoint and admitted peer scope.".into());
    }
    socket.socket.send_to(payload.as_bytes(), address).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    Ok(())
}

// 有界读取非阻塞 UDP 数据，只返回已授权来源的包。
#[tauri::command]
fn udp_receive(
    state: tauri::State<'_, UdpSockets>,
    socket_id: u32,
    maximum: usize,
) -> Result<Vec<UdpPacket>, String> {
    let authorization = require_runtime_udp_permission()?;
    let mut sockets = state.sockets.lock().map_err(
        /* 返回该失败路径的明确错误：UDP socket state is unavailable。 */
        |_| "UDP socket state is unavailable".to_string(),
    )?;
    let socket = sockets
        .get_mut(&socket_id)
        .ok_or("UDP socket is not open")?;
    if socket.authorization != authorization {
        return Err("UDP socket does not belong to the active runtime network policy.".into());
    }
    let mut packets = Vec::new();
    let mut buffer = vec![0_u8; 65_507];
    for _ in 0..maximum.clamp(1, 64) {
        match socket.socket.recv_from(&mut buffer) {
            Ok((length, source)) => {
                if !udp_source_is_authorized(socket.authorization.as_ref(), source) {
                    continue;
                }
                packets.push(UdpPacket {
                    source: source.to_string(),
                    payload: String::from_utf8_lossy(&buffer[..length]).into_owned(),
                });
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => break,
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(packets)
}

// 关闭并移除指定 UDP 套接字。
#[tauri::command]
fn udp_close(state: tauri::State<'_, UdpSockets>, socket_id: u32) -> Result<(), String> {
    state
        .sockets
        .lock()
        .map_err(
            /* 返回该失败路径的明确错误：UDP socket state is unavailable。 */
            |_| "UDP socket state is unavailable".to_string(),
        )?
        .remove(&socket_id);
    Ok(())
}

// 解码 Base64 文本并把解码错误转换为宿主错误字符串。
fn decode_base64(value: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(value)
        .map_err(
            /* 构造错误消息，保留invalid build data: {error}。 */
            |error| format!("invalid build data: {error}"),
        )
}

// 在解码前检查编码尺寸，再限制解码后的负载大小。
fn decode_base64_limited(value: &str, maximum: u64, label: &str) -> Result<Vec<u8>, String> {
    let estimated = (value.len() as u64)
        .checked_add(3)
        .and_then(/* 计算并返回 length . checked_div (4)，用于当前 decode_base64_limited 流程。 */ |length| length.checked_div(4))
        .and_then(/* 计算并返回 groups . checked_mul (3)，用于当前 decode_base64_limited 流程。 */ |groups| groups.checked_mul(3))
        .ok_or_else(/* 计算并返回 format ! ("{label} size overflow")，用于当前 decode_base64_limited 流程。 */ || format!("{label} size overflow"))?;
    if estimated > maximum.saturating_add(2) {
        return Err(format!("{label} exceeds the {} byte safety limit", maximum));
    }
    let decoded = decode_base64(value)?;
    if decoded.len() as u64 > maximum {
        return Err(format!("{label} exceeds the {} byte safety limit", maximum));
    }
    Ok(decoded)
}

// 计算字节内容的 SHA-256 十六进制摘要。
fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

// 读取文件并返回其内容哈希。
fn file_hash(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

// 跳过内容一致的文件，否则通过暂存写入替换目标文件。
fn write_incremental(path: &Path, bytes: &[u8], incremental: bool) -> Result<bool, String> {
    if incremental && path.is_file() && file_hash(path)? == sha256_hex(bytes) {
        return Ok(false);
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )?;
    }
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = path.with_extension(format!("nova-write-{}-{nonce}", std::process::id()));
    fs::write(&temporary, bytes).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    if !path.exists() {
        return fs::rename(&temporary, path)
            .map(/* 返回当前快照值 true。 */ |_| true)
            .map_err(
                /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
                |error| error.to_string(),
            );
    }
    if !path.is_file() {
        let _ = fs::remove_file(&temporary);
        return Err(format!(
            "build output is not a replaceable file: {}",
            path.display()
        ));
    }
    let backup = path.with_extension(format!("nova-backup-{}-{nonce}", std::process::id()));
    fs::rename(path, &backup).map_err(
        /* 失败时清理本次暂存文件，再返回保留原始原因的发布错误。 */
        |error| {
            let _ = fs::remove_file(&temporary);
            format!("could not stage the previous build output: {error}")
        },
    )?;
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::rename(&backup, path);
        let _ = fs::remove_file(&temporary);
        return Err(format!(
            "atomic build replacement failed; the previous output was restored: {error}"
        ));
    }
    let _ = fs::remove_file(backup);
    Ok(true)
}

// 定位配置的 Android 构建模板目录。
fn android_template() -> Option<PathBuf> {
    android_toolchain_status().template_path.map(PathBuf::from)
}

// 汇总当前宿主实际可用的导出平台和构建能力。
#[tauri::command]
fn export_capabilities() -> ExportCapabilities {
    let status = android_toolchain_status();
    let android_available = status.available;
    ExportCapabilities {
        host: std::env::consts::OS.to_string(),
        architecture: std::env::consts::ARCH.to_string(),
        android_available,
        android_reason: if android_available {
            String::new()
        } else {
            format!(
                "Android export is blocked by: {}.",
                status.missing.join(", ")
            )
        },
    }
}

// 把路径转换为可展示的文本。
fn path_display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

// 从受支持环境变量定位 Android SDK 根目录。
fn android_sdk_root() -> Option<PathBuf> {
    std::env::var_os("ANDROID_SDK_ROOT")
        .or_else(
            /* 计算并返回 std :: env :: var_os ("ANDROID_HOME")，用于当前 android_sdk_root 流程。 */
            || std::env::var_os("ANDROID_HOME"),
        )
        .map(PathBuf::from)
        .filter(
            /* 计算并返回 path . is_dir ()，用于当前 android_sdk_root 流程。 */
            |path| path.is_dir(),
        )
}

// 检查指定目录下的相对工具路径是否存在。
fn executable_in(root: &Path, relative: &str) -> Option<PathBuf> {
    let path = root.join(if cfg!(windows) {
        format!("{relative}.exe")
    } else {
        relative.to_string()
    });
    path.is_file().then_some(path)
}

// 探测 Java、SDK、Gradle 及 Android 工具，返回可用性与诊断。
#[tauri::command]
fn android_toolchain_status() -> AndroidToolchainStatus {
    let sdk = android_sdk_root();
    let java_home = std::env::var_os("JAVA_HOME").map(PathBuf::from).filter(
        /* 计算并返回 path . is_dir ()，用于当前 android_toolchain_status 流程。 */
        |path| path.is_dir(),
    );
    let jdk_ready = java_home
        .as_ref()
        .and_then(/* 计算并返回 executable_in (path , "bin/java")，用于当前 android_toolchain_status 流程。 */ |path| executable_in(path, "bin/java"))
        .is_some();
    let sdk_ready = sdk.is_some();
    let platform_ready = sdk
        .as_ref()
        .is_some_and(/* 计算并返回 root . join ("platforms/android-35") . is_dir ()，用于当前 android_toolchain_status 流程。 */ |root| root.join("platforms/android-35").is_dir());
    let build_tools_ready = sdk.as_ref().is_some_and(/* 检查 Android 构建工具目录是否至少包含一个可读取的版本子目录。 */ |root| {
        root.join("build-tools")
            .read_dir()
            .ok()
            .is_some_and(/* 计算并返回 entries . filter_map (Result :: ok) . any (| entry | entry . path () . is_dir ())，用于当前 android_toolchain_status 流程。 */ |entries| {
                entries
                    .filter_map(Result::ok)
                    .any(/* 计算并返回 entry . path () . is_dir ()，用于当前 android_toolchain_status 流程。 */ |entry| entry.path().is_dir())
            })
    });
    let ndk_ready = sdk.as_ref().is_some_and(/* 检查 Android NDK 目录是否至少包含一个可读取的版本子目录。 */ |root| {
        root.join("ndk").read_dir().ok().is_some_and(/* 计算并返回 entries . filter_map (Result :: ok) . any (| entry | entry . path () . is_dir ())，用于当前 android_toolchain_status 流程。 */ |entries| {
            entries
                .filter_map(Result::ok)
                .any(/* 计算并返回 entry . path () . is_dir ()，用于当前 android_toolchain_status 流程。 */ |entry| entry.path().is_dir())
        })
    });
    let adb = sdk
        .as_ref()
        .and_then(/* 计算并返回 executable_in (root , "platform-tools/adb")，用于当前 android_toolchain_status 流程。 */ |root| executable_in(root, "platform-tools/adb"));
    let template = std::env::var_os("NOVA_A_ANDROID_TEMPLATE")
        .map(PathBuf::from)
        .filter(
            /* 检查模板根目录、当前平台 Gradle 包装器及应用构建脚本同时存在。 */
            |path| {
                path.is_dir()
                    && path
                        .join(if cfg!(windows) {
                            "gradlew.bat"
                        } else {
                            "gradlew"
                        })
                        .is_file()
                    && path.join("app/build.gradle").is_file()
            },
        );
    let adb_ready = adb.is_some();
    let template_ready = template.is_some();
    let mut missing = Vec::new();
    if !jdk_ready {
        missing.push("JDK 17 (JAVA_HOME/bin/java)".into());
    }
    if !sdk_ready {
        missing.push("Android SDK (ANDROID_SDK_ROOT or ANDROID_HOME)".into());
    }
    if !platform_ready {
        missing.push("Android platform 35".into());
    }
    if !build_tools_ready {
        missing.push("Android build-tools".into());
    }
    if !ndk_ready {
        missing.push("Android NDK".into());
    }
    if !adb_ready {
        missing.push("Android platform-tools/adb".into());
    }
    if !template_ready {
        missing.push("validated NOVA_A_ANDROID_TEMPLATE with Gradle wrapper".into());
    }
    AndroidToolchainStatus {
        available: jdk_ready
            && sdk_ready
            && platform_ready
            && build_tools_ready
            && ndk_ready
            && template_ready,
        jdk_ready,
        sdk_ready,
        platform_ready,
        build_tools_ready,
        ndk_ready,
        adb_ready,
        template_ready,
        sdk_root: sdk.as_deref().map(path_display),
        java_home: java_home.as_deref().map(path_display),
        adb_path: adb.as_deref().map(path_display),
        template_path: template.as_deref().map(path_display),
        missing,
    }
}

// 校验设备序列号字符，防止非法命令参数进入 adb。
fn valid_android_serial(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 160
        && value.chars().all(/* 判断 character . is_ascii_alphanumeric () || matches ! (character , '-' | '_' | ':' | '.') 是否成立，供过滤或有效性检查使用。 */ |character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | ':' | '.')
        })
}

// 限制外部命令输出长度后合并标准输出与错误文本。
fn bounded_command_text(output: &std::process::Output) -> String {
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    combined.chars().take(64_000).collect()
}

// 调用 adb 列举设备并解析连接状态。
#[tauri::command]
fn android_devices() -> Result<Vec<AndroidDevice>, String> {
    require_editor_mode()?;
    let status = android_toolchain_status();
    let adb = status
        .adb_path
        .ok_or("Android adb is unavailable; install platform-tools and refresh discovery.")?;
    let output = Command::new(adb)
        .arg("devices")
        .arg("-l")
        .output()
        .map_err(
            /* 构造错误消息，保留could not start adb: {error}。 */
            |error| format!("could not start adb: {error}"),
        )?;
    if !output.status.success() {
        return Err(bounded_command_text(&output));
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .skip(1)
        .filter_map(/* 解析 adb 设备行中的序列号和状态，只保留合法设备并截断展示说明。 */ |line| {
            let mut fields = line.split_whitespace();
            let serial = fields.next()?.to_string();
            let state = fields.next()?.to_string();
            valid_android_serial(&serial).then(/* 判断 AndroidDevice { serial , state , description : fields . collect :: < Vec < _ > > () . join (" ") . chars () . take (500) . collect () , 是否成立，供过滤或有效性检查使用。 */ || AndroidDevice {
                serial,
                state,
                description: fields
                    .collect::<Vec<_>>()
                    .join(" ")
                    .chars()
                    .take(500)
                    .collect(),
            })
        })
        .collect())
}

// 校验 APK 和设备参数后执行安装，并返回有界输出。
#[tauri::command]
fn android_deploy_apk(request: AndroidDeployRequest) -> Result<AndroidCommandResult, String> {
    require_editor_mode()?;
    if !valid_android_serial(&request.device_serial) {
        return Err("Invalid Android device serial.".into());
    }
    let status = android_toolchain_status();
    let adb = status.adb_path.ok_or("Android adb is unavailable.")?;
    let apk = fs::canonicalize(&request.apk_path).map_err(
        /* 构造错误消息，保留APK path is unavailable: {error}。 */
        |error| format!("APK path is unavailable: {error}"),
    )?;
    if apk
        .extension()
        .and_then(/* 计算并返回 value . to_str ()，用于当前 android_deploy_apk 流程。 */ |value| value.to_str())
        .map(/* 计算并返回 value . eq_ignore_ascii_case ("apk")，用于当前 android_deploy_apk 流程。 */ |value| value.eq_ignore_ascii_case("apk"))
        != Some(true)
    {
        return Err("Deploy accepts only an existing .apk file.".into());
    }
    let metadata = fs::metadata(&apk).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    if !metadata.is_file() || metadata.len() > 2 * 1024 * 1024 * 1024 {
        return Err("APK must be a regular file no larger than 2 GiB.".into());
    }
    let output = Command::new(adb)
        .args(["-s", &request.device_serial, "install", "-r"])
        .arg(apk)
        .output()
        .map_err(
            /* 构造错误消息，保留could not start adb install: {error}。 */
            |error| format!("could not start adb install: {error}"),
        )?;
    Ok(AndroidCommandResult {
        success: output.status.success(),
        output: bounded_command_text(&output),
    })
}

// 读取指定设备的一次有界日志快照。
#[tauri::command]
fn android_logcat_snapshot(device_serial: String) -> Result<AndroidCommandResult, String> {
    require_editor_mode()?;
    if !valid_android_serial(&device_serial) {
        return Err("Invalid Android device serial.".into());
    }
    let status = android_toolchain_status();
    let adb = status.adb_path.ok_or("Android adb is unavailable.")?;
    let output = Command::new(adb)
        .args(["-s", &device_serial, "logcat", "-d", "-t", "400"])
        .output()
        .map_err(
            /* 构造错误消息，保留could not start adb logcat: {error}。 */
            |error| format!("could not start adb logcat: {error}"),
        )?;
    Ok(AndroidCommandResult {
        success: output.status.success(),
        output: bounded_command_text(&output),
    })
}

// 报告宿主提供的无障碍能力及其实际验证范围。
#[tauri::command]
fn native_accessibility_capabilities() -> NativeAccessibilityCapabilities {
    let windows = cfg!(target_os = "windows");
    NativeAccessibilityCapabilities {
        platform: std::env::consts::OS.into(),
        webview_dom_bridge: true,
        native_custom_adapters: false,
        automation_provider: if windows { "WebView2 DOM accessibility tree exposed to Microsoft UI Automation".into() } else { "System WebView DOM accessibility tree".into() },
        notes: vec![
            "Nova runtime controls publish role, accessible name, state, value, live-region, and focus metadata through semantic DOM overlays.".into(),
            if windows { "WebView2 bridges standards-based HTML/ARIA semantics; custom native UI Automation providers are not claimed in 6.7.0.".into() } else { "Matching-host native adapter certification remains an external qualification gate.".into() },
        ],
    }
}
// 清理游戏名称，生成适合输出文件名的安全形式。
fn safe_game_name(value: &str) -> String {
    let filtered: String = value
        .chars()
        .filter(/* 判断 ! matches ! (character , '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') && ! character . is_control () 是否成立，供过滤或有效性检查使用。 */ |character| {
            !matches!(
                character,
                '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
            ) && !character.is_control()
        })
        .take(80)
        .collect();
    let trimmed = filtered.trim();
    if trimmed.is_empty() {
        "MyGame".into()
    } else {
        trimmed.into()
    }
}

// 为游戏导出选择默认输出目录。
/// 26.45: a chosen folder that already holds other files (a project folder, Documents…) gets the build
/// in a subfolder named after the game, so an export never scatters its files among unrelated ones.
/// An empty folder, or one holding an earlier Nova_A build of a game (its nova-platform-config.json),
/// is used as it is.
fn export_root_in(selected: PathBuf, game_name: &str) -> PathBuf {
    let earlier_build = selected.join("nova-platform-config.json").is_file();
    let occupied = fs::read_dir(&selected)
        .map(|mut entries| entries.next().is_some())
        .unwrap_or(false);
    if occupied && !earlier_build {
        selected.join(game_name)
    } else {
        selected
    }
}

fn default_output_root(game_name: &str) -> PathBuf {
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .unwrap_or_else(/* 计算并返回 std :: env :: temp_dir () . join ("Nova_A")，用于当前 default_output_root 流程。 */ || std::env::temp_dir().join("Nova_A"));
    home.join(if cfg!(windows) { "Documents" } else { "" })
        .join("Nova_A Builds")
        .join(game_name)
}

// 拒绝绝对路径、父级跳转和危险路径段，限制导出目标范围。
fn safe_relative_path(path: &str) -> Result<PathBuf, String> {
    // Build and project paths are portable, even when a package was authored
    // on a different host. Windows separators, drive prefixes and alternate
    // data streams must not become ordinary filenames on Unix.
    let normalized = path.replace('\\', "/");
    if normalized.is_empty()
        || normalized.split('/').any(/* 检查路径段中的跳转、控制字符、非法尾字符和 Windows 保留设备名称。 */ |part| {
            let stem = part
                .split('.')
                .next()
                .unwrap_or_default()
                .to_ascii_uppercase();
            part.is_empty()
                || matches!(part, "." | "..")
                || part.ends_with(['.', ' '])
                || part.chars().any(/* 判断 character . is_control () || matches ! (character , ':' | '<' | '>' | '"' | '|' | '?' | '*') 是否成立，供过滤或有效性检查使用。 */ |character| {
                    character.is_control()
                        || matches!(character, ':' | '<' | '>' | '"' | '|' | '?' | '*')
                })
                || matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
                || ["COM", "LPT"].iter().any(/* 识别 COM/LPT 等 Windows 设备名后缀，包括上标数字兼容形式。 */ |prefix| {
                    stem.strip_prefix(prefix).is_some_and(/* 判断 matches ! (suffix , "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³") 是否成立，供过滤或有效性检查使用。 */ |suffix| {
                        matches!(
                            suffix,
                            "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
                        )
                    })
                })
        })
    {
        return Err(format!("unsafe export path: {path}"));
    }
    Ok(PathBuf::from(normalized))
}

// 先暂存全部工程文件，再提交替换；失败时恢复已提交文件。
#[tauri::command]
fn commit_project_transaction(
    request: ProjectTransactionRequest,
) -> Result<ProjectTransactionResult, String> {
    require_editor_mode()?;
    if request.files.is_empty() || request.files.len() > 20_000 {
        return Err("project transaction must contain between 1 and 20,000 files".into());
    }
    let transaction_id: String = request
        .transaction_id
        .chars()
        .filter(/* 判断 value . is_ascii_alphanumeric () || * value == '-' 是否成立，供过滤或有效性检查使用。 */ |value| value.is_ascii_alphanumeric() || *value == '-')
        .take(80)
        .collect();
    if transaction_id.is_empty() {
        return Err("project transaction ID is invalid".into());
    }
    let root = PathBuf::from(&request.project_directory);
    if !root.is_absolute() {
        return Err("project transaction directory must be absolute".into());
    }
    fs::create_dir_all(&root).map_err(
        /* 构造错误消息，保留permission preflight failed: {error}。 */
        |error| format!("permission preflight failed: {error}"),
    )?;
    let root = root.canonicalize().map_err(
        /* 构造错误消息，保留project path preflight failed: {error}。 */
        |error| format!("project path preflight failed: {error}"),
    )?;
    let transaction_root = root
        .join(".nova")
        .join("transactions")
        .join(&transaction_id);
    let staging = transaction_root.join("staging");
    let backup = transaction_root.join("backup");
    fs::create_dir_all(&staging).map_err(
        /* 构造错误消息，保留transaction staging preflight failed: {error}。 */
        |error| format!("transaction staging preflight failed: {error}"),
    )?;
    fs::create_dir_all(&backup).map_err(
        /* 构造错误消息，保留transaction backup preflight failed: {error}。 */
        |error| format!("transaction backup preflight failed: {error}"),
    )?;
    let journal_path = transaction_root.join("journal.json");
    let manifest: Vec<serde_json::Value> = request
        .files
        .iter()
        .map(
            /* 构造包含 path、checksum 字段的 JSON 默认值，供缺省配置补齐。 */
            |file| serde_json::json!({"path":file.path,"checksum":file.checksum}),
        )
        .collect();
    fs::write(&journal_path, serde_json::to_vec_pretty(&serde_json::json!({"format":"nova-native-project-transaction","version":1,"transactionId":transaction_id,"phase":"prepared","files":manifest})).map_err(/* 将底层错误转换为字符串，保留错误信息供上层返回。 */ |error| error.to_string())?).map_err(/* 将底层错误转换为字符串，保留错误信息供上层返回。 */ |error| error.to_string())?;
    let mut staged = Vec::with_capacity(request.files.len());
    let mut total_bytes = 0_u64;
    for item in &request.files {
        let relative = safe_relative_path(&item.path)?;
        let bytes = decode_base64(&item.data_base64)?;
        total_bytes = total_bytes
            .checked_add(bytes.len() as u64)
            .ok_or("transaction size overflow")?;
        if total_bytes > 2 * 1024 * 1024 * 1024 {
            return Err("project transaction exceeds the 2 GiB safety limit".into());
        }
        if sha256_hex(&bytes) != item.checksum.to_ascii_lowercase() {
            return Err(format!("checksum preflight failed for {}", item.path));
        }
        let staged_path = staging.join(&relative);
        if let Some(parent) = staged_path.parent() {
            fs::create_dir_all(parent).map_err(
                /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
                |error| error.to_string(),
            )?;
        }
        fs::write(&staged_path, &bytes).map_err(
            /* 构造错误消息，保留staging write failed for {}: {error}。 */
            |error| format!("staging write failed for {}: {error}", item.path),
        )?;
        if file_hash(&staged_path)? != item.checksum.to_ascii_lowercase() {
            return Err(format!("staged checksum failed for {}", item.path));
        }
        staged.push((relative, staged_path));
    }
    fs::write(&journal_path, serde_json::to_vec_pretty(&serde_json::json!({"format":"nova-native-project-transaction","version":1,"transactionId":transaction_id,"phase":"committing","files":manifest})).map_err(/* 将底层错误转换为字符串，保留错误信息供上层返回。 */ |error| error.to_string())?).map_err(/* 将底层错误转换为字符串，保留错误信息供上层返回。 */ |error| error.to_string())?;
    let mut committed: Vec<(PathBuf, Option<PathBuf>)> = Vec::new();
    for (relative, staged_path) in &staged {
        let destination = root.join(relative);
        if let Some(parent) = destination.parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                rollback_project_files(&committed);
                return Err(format!("destination preflight failed: {error}"));
            }
        }
        let previous = if destination.exists() {
            let previous = backup.join(relative);
            if let Some(parent) = previous.parent() {
                if let Err(error) = fs::create_dir_all(parent) {
                    rollback_project_files(&committed);
                    return Err(format!("backup preflight failed: {error}"));
                }
            }
            if let Err(error) = fs::rename(&destination, &previous) {
                rollback_project_files(&committed);
                return Err(format!(
                    "file-in-use or antivirus delay at {}: {error}",
                    relative.display()
                ));
            }
            Some(previous)
        } else {
            None
        };
        if let Err(error) = fs::rename(staged_path, &destination) {
            if let Some(previous) = &previous {
                let _ = fs::rename(previous, &destination);
            }
            rollback_project_files(&committed);
            return Err(format!(
                "atomic replacement failed at {}: {error}",
                relative.display()
            ));
        }
        committed.push((destination, previous));
    }
    let committed_journal = serde_json::to_vec_pretty(&serde_json::json!({"format":"nova-native-project-transaction","version":1,"transactionId":transaction_id,"phase":"committed","files":manifest,"bytes":total_bytes})).map_err(/* 将底层错误转换为字符串，保留错误信息供上层返回。 */ |error| error.to_string())?;
    if let Err(error) = fs::write(&journal_path, committed_journal) {
        rollback_project_files(&committed);
        return Err(format!(
            "commit journal finalization failed; project rolled back: {error}"
        ));
    }
    Ok(ProjectTransactionResult {
        transaction_id,
        committed_files: committed.len(),
        committed_bytes: total_bytes,
        journal_path: journal_path.to_string_lossy().into_owned(),
    })
}

// 按回滚记录恢复原文件或移除本次新增文件。
fn rollback_project_files(committed: &[(PathBuf, Option<PathBuf>)]) {
    for (destination, previous) in committed.iter().rev() {
        let _ = fs::remove_file(destination);
        if let Some(previous) = previous {
            let _ = fs::rename(previous, destination);
        }
    }
}

// 校验导出相对路径后写入目标目录。
fn write_export_file(
    root: &Path,
    file: &ExportFile,
    incremental: bool,
) -> Result<(String, bool), String> {
    let relative = safe_relative_path(&file.path)?;
    let destination = root.join(&relative);
    let changed = write_incremental(
        &destination,
        &decode_base64(&file.data_base64)?,
        incremental,
    )?;
    Ok((relative.to_string_lossy().replace('\\', "/"), changed))
}

// 将运行包和可校验尾部信息追加到播放器可执行文件。
fn append_embedded_package(executable: &Path, pack: &[u8]) -> Result<(), String> {
    if pack.is_empty() {
        return Err("cannot embed an empty Nova package".into());
    }
    if pack.len() as u64 > MAX_EMBEDDED_PACKAGE_BYTES {
        return Err("embedded Nova packages are limited to 1 GiB".into());
    }
    let digest = Sha256::digest(pack);
    let mut file = OpenOptions::new().append(true).open(executable).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    file.write_all(pack).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    file.write_all(EMBEDDED_MAGIC).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    file.write_all(&(pack.len() as u64).to_le_bytes()).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    file.write_all(&digest).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    file.flush().map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )
}

// 读取播放器尾部，校验范围与摘要后提取内嵌运行包。
fn embedded_package(executable: &Path) -> Result<Option<Vec<u8>>, String> {
    let mut file = File::open(executable).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    let length = file
        .metadata()
        .map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )?
        .len();
    if length < EMBEDDED_LEGACY_FOOTER_BYTES {
        return Ok(None);
    }
    let (footer_bytes, pack_length, expected_hash) = if length >= EMBEDDED_FOOTER_BYTES {
        file.seek(SeekFrom::End(-(EMBEDDED_FOOTER_BYTES as i64)))
            .map_err(
                /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
                |error| error.to_string(),
            )?;
        let mut footer = [0_u8; EMBEDDED_FOOTER_BYTES as usize];
        file.read_exact(&mut footer).map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )?;
        if &footer[..8] == EMBEDDED_MAGIC {
            let pack_length = u64::from_le_bytes(footer[8..16].try_into().map_err(
                /* 返回该失败路径的明确错误：invalid embedded package footer。 */
                |_| "invalid embedded package footer",
            )?);
            (
                EMBEDDED_FOOTER_BYTES,
                pack_length,
                Some(footer[16..48].to_vec()),
            )
        } else {
            file.seek(SeekFrom::End(-(EMBEDDED_LEGACY_FOOTER_BYTES as i64)))
                .map_err(
                    /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
                    |error| error.to_string(),
                )?;
            let mut legacy = [0_u8; EMBEDDED_LEGACY_FOOTER_BYTES as usize];
            file.read_exact(&mut legacy).map_err(
                /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
                |error| error.to_string(),
            )?;
            if &legacy[..8] != EMBEDDED_LEGACY_MAGIC {
                return Ok(None);
            }
            let pack_length = u64::from_le_bytes(legacy[8..16].try_into().map_err(
                /* 返回该失败路径的明确错误：invalid legacy embedded package footer。 */
                |_| "invalid legacy embedded package footer",
            )?);
            (EMBEDDED_LEGACY_FOOTER_BYTES, pack_length, None)
        }
    } else {
        file.seek(SeekFrom::End(-(EMBEDDED_LEGACY_FOOTER_BYTES as i64)))
            .map_err(
                /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
                |error| error.to_string(),
            )?;
        let mut legacy = [0_u8; EMBEDDED_LEGACY_FOOTER_BYTES as usize];
        file.read_exact(&mut legacy).map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )?;
        if &legacy[..8] != EMBEDDED_LEGACY_MAGIC {
            return Ok(None);
        }
        let pack_length = u64::from_le_bytes(legacy[8..16].try_into().map_err(
            /* 返回该失败路径的明确错误：invalid legacy embedded package footer。 */
            |_| "invalid legacy embedded package footer",
        )?);
        (EMBEDDED_LEGACY_FOOTER_BYTES, pack_length, None)
    };
    if pack_length == 0 || pack_length > MAX_EMBEDDED_PACKAGE_BYTES {
        return Err("embedded Nova package has an invalid size".into());
    }
    if pack_length > length - footer_bytes {
        return Err("embedded Nova package is truncated".into());
    }
    file.seek(SeekFrom::Start(length - footer_bytes - pack_length))
        .map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )?;
    let mut pack = vec![0_u8; pack_length as usize];
    file.read_exact(&mut pack).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    if expected_hash.is_some_and(/* 判断 Sha256 :: digest (& pack) [..] != expected [..] 是否成立，供过滤或有效性检查使用。 */ |expected| Sha256::digest(&pack)[..] != expected[..]) {
        return Err("embedded Nova package failed its SHA-256 integrity check".into());
    }
    Ok(Some(pack))
}

// 定位与播放器相邻的外置运行包路径。
fn sidecar_package(executable: &Path) -> Option<PathBuf> {
    let beside = executable.parent()?.join("game.nova-pak");
    beside.is_file().then_some(beside)
}

// 优先获取可用的运行包字节，并传播读取或校验错误。
fn runtime_package_bytes() -> Result<Option<Vec<u8>>, String> {
    let executable = std::env::current_exe().map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    let pack = if let Some(pack) = embedded_package(&executable)? {
        Some(pack)
    } else {
        sidecar_package(&executable)
            .map(|path| runtime_package_source::read_bounded_sidecar(
                &path,
                runtime_pak_preflight::RuntimePakCallerDecodedPolicy::compatibility_1_gib().maximum_package_bytes,
            ))
            .transpose()?
    };
    runtime_package_source::verify_package_identity(&RUNTIME_PACKAGE_IDENTITY, pack.as_deref())?;
    Ok(pack)
}

// 从运行包解码工程文档并校验包结构。
fn runtime_project_document(pack: &[u8]) -> Result<serde_json::Value, String> {
    if pack.len() < 16 || &pack[..8] != b"NOVAPAK\0" {
        return Err("The embedded runtime package header is invalid.".into());
    }
    let version = u32::from_le_bytes(pack[8..12].try_into().map_err(
        /* 返回该失败路径的明确错误：The runtime package version is truncated.。 */
        |_| "The runtime package version is truncated.",
    )?);
    if version != 1 {
        return Err(format!("Unsupported runtime package version {version}."));
    }
    let index_length = u32::from_le_bytes(pack[12..16].try_into().map_err(
        /* 返回该失败路径的明确错误：The runtime package index length is truncated.。 */
        |_| "The runtime package index length is truncated.",
    )?) as usize;
    if index_length == 0 || index_length > 16 * 1024 * 1024 || 16 + index_length > pack.len() {
        return Err("The runtime package index is invalid or truncated.".into());
    }
    let index: serde_json::Value = serde_json::from_slice(&pack[16..16 + index_length]).map_err(
        /* 构造错误消息，保留The runtime package index is invalid: {error}。 */
        |error| format!("The runtime package index is invalid: {error}"),
    )?;
    if index.get("format").and_then(serde_json::Value::as_str) != Some("nova-pak")
        || !runtime_pak_preflight::is_version_one(index.get("version"))
    {
        return Err("The runtime package index contract is unsupported.".into());
    }
    let entries = index
        .get("entries")
        .and_then(serde_json::Value::as_array)
        .ok_or("The runtime package has no entry table.")?;
    if entries.len() > MAX_WEB_EXPORT_FILES {
        return Err("The runtime package entry table exceeds the safety limit.".into());
    }
    let validated_index = runtime_pak_preflight::preflight(
        pack,
        &index,
        runtime_pak_preflight::RuntimePakCallerDecodedPolicy::compatibility_1_gib(),
    )?;
    let entry = &validated_index.project_entry;
    let offset = entry
        .get("offset")
        .and_then(serde_json::Value::as_u64)
        .and_then(
            /* 按 usize :: try_from (value) . ok () 读取或转换可选值，保留转换失败分支。 */
            |value| usize::try_from(value).ok(),
        )
        .ok_or("The project.nova package offset is invalid.")?;
    let length = entry
        .get("length")
        .and_then(serde_json::Value::as_u64)
        .and_then(
            /* 按 usize :: try_from (value) . ok () 读取或转换可选值，保留转换失败分支。 */
            |value| usize::try_from(value).ok(),
        )
        .ok_or("The project.nova package length is invalid.")?;
    let original_length = entry
        .get("originalLength")
        .and_then(serde_json::Value::as_u64)
        .and_then(
            /* 按 usize :: try_from (value) . ok () 读取或转换可选值，保留转换失败分支。 */
            |value| usize::try_from(value).ok(),
        )
        .ok_or("The project.nova original length is invalid.")?;
    if original_length == 0 || original_length > MAX_RUNTIME_PROJECT_BYTES {
        return Err("The project.nova authority exceeds the 64 MiB runtime limit.".into());
    }
    // 26.46: project.nova is one of the entries the preflight summed; a larger value means the index and the
    // validated row disagree (this also gives the validated total a reader, which removed a build warning).
    if original_length as u64 > validated_index.declared_decoded_bytes {
        return Err("The project.nova length disagrees with the validated package index.".into());
    }
    let data_start = 16_usize
        .checked_add(index_length)
        .ok_or("The runtime package data offset overflowed.")?;
    let start = data_start
        .checked_add(offset)
        .ok_or("The project.nova package offset overflowed.")?;
    let end = start
        .checked_add(length)
        .ok_or("The project.nova package length overflowed.")?;
    let stored = pack
        .get(start..end)
        .ok_or("The project.nova package entry is truncated.")?;
    let decoded = match entry.get("codec").and_then(serde_json::Value::as_str) {
        Some("store") => stored.to_vec(),
        Some("gzip") => {
            let mut decoder = GzDecoder::new(stored);
            let mut output = Vec::with_capacity(original_length.min(1024 * 1024));
            decoder
                .by_ref()
                .take((MAX_RUNTIME_PROJECT_BYTES + 1) as u64)
                .read_to_end(&mut output)
                .map_err(/* 构造错误消息，保留The project.nova entry could not be decompressed: {error}。 */ |error| {
                    format!("The project.nova entry could not be decompressed: {error}")
                })?;
            output
        }
        _ => return Err("The project.nova compression codec is unsupported.".into()),
    };
    if decoded.len() != original_length {
        return Err("The project.nova package entry has the wrong decoded size.".into());
    }
    let expected_hash = entry
        .get("sha256")
        .and_then(serde_json::Value::as_str)
        .ok_or("The project.nova package entry has no SHA-256 digest.")?;
    if expected_hash.len() != 64
        || !expected_hash.bytes().all(
            /* 判断 byte . is_ascii_hexdigit () 是否成立，供过滤或有效性检查使用。 */
            |byte| byte.is_ascii_hexdigit(),
        )
        || !sha256_hex(&decoded).eq_ignore_ascii_case(expected_hash)
    {
        return Err("The project.nova package entry failed its SHA-256 check.".into());
    }
    serde_json::from_slice(&decoded).map_err(
        /* 构造错误消息，保留The embedded project.nova is invalid JSON: {error}。 */
        |error| format!("The embedded project.nova is invalid JSON: {error}"),
    )
}

// 从项目授权和构建设置生成受限运行时网络策略。
fn network_policy_from_project(
    project: &serde_json::Value,
) -> Result<RuntimeNetworkPolicy, String> {
    let networking = project
        .pointer("/projectSettings/production/networking")
        .and_then(serde_json::Value::as_object)
        .ok_or("The embedded project has no networking policy.")?;
    let installed = project
        .pointer("/packages/installed")
        .and_then(serde_json::Value::as_array)
        .and_then(
            /* 从包清单中查找已启用且声明必要权限的内置网络包。 */
            |entries| {
                entries.iter().find(
                    /* 要求网络包身份、启用状态和权限声明同时满足运行时授权条件。 */
                    |entry| {
                        entry
                            .pointer("/manifest/id")
                            .and_then(serde_json::Value::as_str)
                            == Some("top.whitelists.novaa.networking")
                            && entry.get("enabled").and_then(serde_json::Value::as_bool)
                                == Some(true)
                            && entry.get("project").and_then(serde_json::Value::as_bool)
                                == Some(true)
                    },
                )
            },
        )
        .ok_or("The embedded project does not contain the enabled Nova networking package.")?;
    let locked = project
        .pointer("/packages/lockfile")
        .and_then(serde_json::Value::as_array)
        .and_then(/* 在旧版插件清单中寻找内置网络插件身份。 */ |entries| {
            entries.iter().find(/* 判断 entry . get ("id") . and_then (serde_json :: Value :: as_str) == Some ("top.whitelists.novaa.networking") 是否成立，供过滤或有效性检查使用。 */ |entry| {
                entry.get("id").and_then(serde_json::Value::as_str)
                    == Some("top.whitelists.novaa.networking")
            })
        })
        .ok_or("The embedded networking package has no lockfile record.")?;
    let manifest_version = installed
        .pointer("/manifest/version")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let manifest_hash = installed
        .pointer("/manifest/sha256")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let lock_version = locked
        .get("version")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let lock_hash = locked
        .get("sha256")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    if manifest_version.is_empty()
        || manifest_version != lock_version
        || manifest_hash.len() != 64
        || !manifest_hash.eq_ignore_ascii_case(lock_hash)
        || !manifest_hash.bytes().all(
            /* 判断 byte . is_ascii_hexdigit () 是否成立，供过滤或有效性检查使用。 */
            |byte| byte.is_ascii_hexdigit(),
        )
    {
        return Err(
            "The embedded networking package does not match its verified lockfile record.".into(),
        );
    }
    let declared = installed
        .pointer("/manifest/permissions")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(serde_json::Value::as_str)
        .collect::<Vec<_>>();
    let granted = installed
        .get("grantedPermissions")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(serde_json::Value::as_str)
        .collect::<Vec<_>>();
    let configured_role = networking
        .get("role")
        .and_then(serde_json::Value::as_str)
        .filter(/* 判断 matches ! (* role , "client" | "host" | "server") 是否成立，供过滤或有效性检查使用。 */ |role| matches!(*role, "client" | "host" | "server"))
        .unwrap_or("client")
        .to_owned();
    let custom_services_selected = networking
        .get("services")
        .and_then(serde_json::Value::as_object)
        .is_some_and(/* 判断 services . values () . any (| value | value . as_str () . is_some_and (| id | ! id . is_empty ())) 是否成立，供过滤或有效性检查使用。 */ |services| {
            services
                .values()
                .any(/* 判断 value . as_str () . is_some_and (| id | ! id . is_empty ()) 是否成立，供过滤或有效性检查使用。 */ |value| value.as_str().is_some_and(/* 判断 ! id . is_empty () 是否成立，供过滤或有效性检查使用。 */ |id| !id.is_empty()))
        });
    let custom_transport_selected = networking
        .get("transportAdapterId")
        .and_then(serde_json::Value::as_str)
        .is_some_and(
            /* 判断 ! id . is_empty () 是否成立，供过滤或有效性检查使用。 */
            |id| !id.is_empty(),
        );
    Ok(RuntimeNetworkPolicy {
        configured_role,
        session_mode: networking
            .get("sessionMode")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        transport: if custom_services_selected || custom_transport_selected {
            "reviewed-provider".into()
        } else {
            networking
                .get("transport")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_owned()
        },
        endpoint: networking
            .get("endpoint")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        bind_address: networking
            .get("bindAddress")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        maximum_peers: networking
            .get("maxPeers")
            .and_then(serde_json::Value::as_u64)
            .and_then(
                /* 按 usize :: try_from (value) . ok () 读取或转换可选值，保留转换失败分支。 */
                |value| usize::try_from(value).ok(),
            )
            .unwrap_or(8)
            .clamp(1, 64),
        protocol_version: networking
            .get("protocolVersion")
            .and_then(serde_json::Value::as_u64)
            .unwrap_or_default(),
        requires_encryption: networking
            .get("security")
            .and_then(serde_json::Value::as_object)
            .and_then(
                /* 读取可选字段 requireEncryption，由外层继续处理缺省值。 */
                |security| security.get("requireEncryption"),
            )
            .and_then(serde_json::Value::as_bool)
            == Some(true),
        client_allowed: declared.contains(&"network.client") && granted.contains(&"network.client"),
        listen_allowed: declared.contains(&"network.listen") && granted.contains(&"network.listen"),
        enabled: networking
            .get("enabled")
            .and_then(serde_json::Value::as_bool)
            == Some(true),
        permission_granted: networking
            .get("permissionGranted")
            .and_then(serde_json::Value::as_bool)
            == Some(true),
        auto_start: networking
            .get("autoStart")
            .and_then(serde_json::Value::as_bool)
            == Some(true),
    })
}

// 读取并验证内嵌工程的图形或无界面运行模式。
fn embedded_build_runtime_mode(project: &serde_json::Value) -> Result<&str, String> {
    match project
        .pointer("/projectSettings/build/runtimeMode")
        .and_then(serde_json::Value::as_str)
    {
        Some(mode @ ("game" | "headless-server")) => Ok(mode),
        _ => Err("The embedded project has no supported build runtime mode.".into()),
    }
}

// 校验导出播放器、运行模式及网络权限的契约一致性。
fn validate_export_runtime_contract(
    requested_runtime_mode: &str,
    target: &str,
    project: &serde_json::Value,
) -> Result<(), String> {
    if !matches!(requested_runtime_mode, "game" | "headless-server") {
        return Err("unsupported export runtime mode".into());
    }
    let embedded_runtime_mode = embedded_build_runtime_mode(project)?;
    if embedded_runtime_mode != requested_runtime_mode {
        return Err(
            "The native export runtime mode does not match the embedded project build contract."
                .into(),
        );
    }
    if requested_runtime_mode != "headless-server" {
        return Ok(());
    }
    if matches!(target, "web" | "android") {
        return Err(
            "Headless authoritative-server exports require a native desktop target.".into(),
        );
    }
    let policy = network_policy_from_project(project)?;
    if !policy.enabled
        || !policy.permission_granted
        || !policy.auto_start
        || !policy.client_allowed
        || !policy.listen_allowed
        || !matches!(policy.configured_role.as_str(), "host" | "server")
        || policy.session_mode != "direct"
        || policy.transport != "native-udp"
        || policy.protocol_version != 2
        || policy.requires_encryption
    {
        return Err("Headless export requires an enabled, authorized, auto-starting Direct native-UDP Host/Server with explicit network.client and network.listen grants.".into());
    }
    parse_udp_address(&policy.endpoint, "The embedded headless UDP endpoint")?;
    parse_udp_address(
        &policy.bind_address,
        "The embedded headless UDP bind address",
    )?;
    Ok(())
}

// 读取当前运行包并解析其网络授权策略。
fn load_runtime_network_policy() -> Result<Option<RuntimeNetworkPolicy>, String> {
    let Some(pack) = runtime_package_bytes()? else {
        return Ok(None);
    };
    let project = runtime_project_document(&pack)?;
    network_policy_from_project(&project).map(Some)
}

// 判断当前程序是否携带运行包而处于播放器模式。
#[tauri::command]
fn runtime_mode() -> Result<bool, String> {
    Ok(runtime_package_bytes()?.is_some())
}

// 26.42 P-E3: opt-in low-latency (desynchronized) game canvas for the Player, NOVA_DESYNCHRONIZED=1. Off by default.
#[tauri::command]
fn canvas_desynchronized() -> bool {
    std::env::var("NOVA_DESYNCHRONIZED").is_ok_and(|value| value.trim() == "1")
}

// Opt-in latency probe: a loopback collector URL from NOVA_LATENCY_PROBE, or nothing. Never a remote host.
#[tauri::command]
fn latency_probe_endpoint() -> Option<String> {
    let value = std::env::var("NOVA_LATENCY_PROBE").ok()?;
    let value = value.trim();
    let allowed = ["http://127.0.0.1:", "http://localhost:"];
    if value.len() > 64 || !allowed.iter().any(|prefix| value.starts_with(prefix)) {
        return None;
    }
    let port = value.split(':').nth(2)?.trim_end_matches('/');
    if port.is_empty() || !port.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    Some(value.trim_end_matches('/').to_owned())
}

// 26.44: the latency probe sends its batches through the native host, so browser network policies (the
// Local Network Access checks of recent WebView2 releases) cannot drop them. Only the configured loopback
// collector and its two paths are reachable; the call runs off the main thread with short timeouts.
#[tauri::command]
async fn latency_probe_send(path: String, body: String) -> Result<String, String> {
    let endpoint = latency_probe_endpoint().ok_or("latency probe is not configured")?;
    if path != "/sync" && path != "/probe" {
        return Err("unsupported latency probe path".into());
    }
    if body.len() > 16 * 1024 * 1024 {
        return Err("latency probe batch is too large".into());
    }
    tauri::async_runtime::spawn_blocking(move || latency_probe_http(&endpoint, &path, &body))
        .await
        .map_err(|error| error.to_string())?
}

fn latency_probe_http(endpoint: &str, path: &str, body: &str) -> Result<String, String> {
    use std::io::{Read, Write};
    use std::net::ToSocketAddrs;
    let authority = endpoint.trim_start_matches("http://");
    let timeout = std::time::Duration::from_secs(2);
    let addresses = authority
        .to_socket_addrs()
        .map_err(|error| error.to_string())?
        .filter(|address| address.ip().is_loopback());
    let mut stream = None;
    for address in addresses {
        if let Ok(connected) = std::net::TcpStream::connect_timeout(&address, timeout) {
            stream = Some(connected);
            break;
        }
    }
    let mut stream = stream.ok_or("latency probe collector is not reachable")?;
    stream.set_read_timeout(Some(timeout)).map_err(|error| error.to_string())?;
    stream.set_write_timeout(Some(timeout)).map_err(|error| error.to_string())?;
    let method = if path == "/sync" { "GET" } else { "POST" };
    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: {authority}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream
        .write_all(request.as_bytes())
        .and_then(|_| stream.write_all(body.as_bytes()))
        .map_err(|error| error.to_string())?;
    let mut response = Vec::new();
    stream
        .take(1024 * 1024)
        .read_to_end(&mut response)
        .map_err(|error| error.to_string())?;
    let text = String::from_utf8_lossy(&response);
    let (head, payload) = text
        .split_once("\r\n\r\n")
        .ok_or("malformed latency probe response")?;
    let ok = head
        .split_whitespace()
        .nth(1)
        .is_some_and(|status| status.starts_with('2'));
    if !ok {
        return Err(format!(
            "latency probe collector answered {}",
            head.lines().next().unwrap_or("")
        ));
    }
    Ok(payload.to_owned())
}

// A .nova document passed as the first command-line argument (Open With / file association).
// It is handed to the editor once per process; the editor still runs its normal open preflight.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchProject {
    file_name: String,
    directory: String,
    source: String,
}

#[tauri::command]
fn launch_project() -> Result<Option<LaunchProject>, String> {
    static TAKEN: OnceLock<()> = OnceLock::new();
    if TAKEN.set(()).is_err() {
        return Ok(None);
    }
    let Some(argument) = std::env::args_os().skip(1).find(|value| {
        Path::new(value)
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("nova"))
    }) else {
        return Ok(None);
    };
    let path = PathBuf::from(argument);
    let metadata = fs::metadata(&path).map_err(|error| format!("Cannot open {}: {error}", path.display()))?;
    if !metadata.is_file() || metadata.len() > 192 * 1024 * 1024 {
        return Err(format!("{} is not a project document Nova_A can open.", path.display()));
    }
    let source = fs::read_to_string(&path).map_err(|error| format!("Cannot read {}: {error}", path.display()))?;
    Ok(Some(LaunchProject {
        file_name: path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_else(|| "project.nova".into()),
        directory: path.parent().map(|parent| parent.display().to_string()).unwrap_or_default(),
        source,
    }))
}

// 将当前运行包编码为前端可接收的数据。
#[tauri::command]
fn runtime_package() -> Result<Option<String>, String> {
    Ok(runtime_package_bytes()?
        .map(/* 计算并返回 base64 :: engine :: general_purpose :: STANDARD . encode (bytes)，用于当前 runtime_package 流程。 */ |bytes| base64::engine::general_purpose::STANDARD.encode(bytes)))
}

// 读取指定环境变量并拒绝超过长度上限的值。
fn bounded_environment_value(name: &str, maximum: usize) -> Option<String> {
    std::env::var(name).ok().and_then(/* 去除环境变量控制字符并限制字符数，只保留非空覆盖值。 */ |value| {
        let clean: String = value
            .chars()
            .filter(/* 计算并返回 ! character . is_control ()，用于当前 bounded_environment_value 流程。 */ |character| !character.is_control())
            .take(maximum)
            .collect();
        (!clean.trim().is_empty()).then_some(clean)
    })
}

// 从有限的环境变量读取运行覆盖参数。
#[tauri::command]
fn runtime_overrides() -> RuntimeOverrides {
    RuntimeOverrides {
        network_role: bounded_environment_value("NOVA_NETWORK_ROLE", 16)
            .filter(/* 判断 value == "host" || value == "client" || value == "server" 是否成立，供过滤或有效性检查使用。 */ |value| value == "host" || value == "client" || value == "server"),
        player_name: bounded_environment_value("NOVA_NETWORK_PLAYER_NAME", 80),
        session_name: bounded_environment_value("NOVA_NETWORK_SESSION", 80),
        instance_id: bounded_environment_value("NOVA_NETWORK_INSTANCE", 32),
        log_scope: bounded_environment_value("NOVA_LOG_SCOPE", 48),
        inspector_id: bounded_environment_value("NOVA_NETWORK_INSPECTOR", 64),
        session_mode: bounded_environment_value("NOVA_NETWORK_SESSION_MODE", 16)
            .filter(/* 判断 value == "local" || value == "direct" 是否成立，供过滤或有效性检查使用。 */ |value| value == "local" || value == "direct"),
        transport: bounded_environment_value("NOVA_NETWORK_TRANSPORT", 24)
            .filter(/* 判断 value == "websocket" || value == "native-udp" 是否成立，供过滤或有效性检查使用。 */ |value| value == "websocket" || value == "native-udp"),
        endpoint: bounded_environment_value("NOVA_NETWORK_ENDPOINT", 256),
        bind_address: bounded_environment_value("NOVA_NETWORK_BIND_ADDRESS", 128),
    }
}

// 检查网络测试播放器的构建记录、文件哈希和内嵌运行模式。
fn validate_network_player_build(
    executable: &Path,
    working_directory: &Path,
) -> Result<(), String> {
    let report_path = working_directory.join("nova-build-report.json");
    let report_metadata = report_path.metadata().map_err(
        /* 返回该失败路径的明确错误：Network play requires the adjacent Nova_A build report.。 */
        |_| "Network play requires the adjacent Nova_A build report.".to_string(),
    )?;
    if !report_metadata.is_file() || report_metadata.len() > 8 * 1024 * 1024 {
        return Err("The adjacent Nova_A build report is invalid or exceeds 8 MiB.".into());
    }
    let report: BuildReport = serde_json::from_slice(&fs::read(&report_path).map_err(
        /* 构造错误消息，保留Could not read the Nova_A build report: {error}。 */
        |error| format!("Could not read the Nova_A build report: {error}"),
    )?)
    .map_err(
        /* 构造错误消息，保留The adjacent Nova_A build report is invalid: {error}。 */
        |error| format!("The adjacent Nova_A build report is invalid: {error}"),
    )?;
    let host_target = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    };
    if report.format != "nova-build-report"
        || report.version != 2
        || report.engine_version != ENGINE_VERSION
        || report.target != host_target
        || report.architecture != std::env::consts::ARCH
        || report.runtime_mode != "game"
    {
        return Err("The network player build report does not match this Nova_A host, engine, or report contract.".into());
    }
    let relative = executable
        .strip_prefix(working_directory)
        .map_err(/* 返回该失败路径的明确错误：The network player is outside its reported build directory.。 */ |_| "The network player is outside its reported build directory.".to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    safe_relative_path(&relative)?;
    let mut matching_records = report.files.iter().filter(
        /* 判断 record . path == relative 是否成立，供过滤或有效性检查使用。 */
        |record| record.path == relative,
    );
    let record = matching_records
        .next()
        .ok_or("The executable is not present in the Nova_A build report.")?;
    if matching_records.next().is_some() {
        return Err("The Nova_A build report contains a duplicate executable record.".into());
    }
    let executable_metadata = executable.metadata().map_err(
        /* 构造错误消息，保留Could not inspect the network player: {error}。 */
        |error| format!("Could not inspect the network player: {error}"),
    )?;
    if record.bytes != executable_metadata.len()
        || record.sha256.len() != 64
        || !record.sha256.bytes().all(
            /* 判断 byte . is_ascii_hexdigit () 是否成立，供过滤或有效性检查使用。 */
            |byte| byte.is_ascii_hexdigit(),
        )
        || !file_hash(executable)?.eq_ignore_ascii_case(&record.sha256)
    {
        return Err(
            "The network player does not match its build-report hash and byte count.".into(),
        );
    }
    let pack = embedded_package(executable)?
        .ok_or("Multi-instance play requires a single-file Nova_A player with an embedded project package.")?;
    let project = runtime_project_document(&pack)?;
    if embedded_build_runtime_mode(&project)? != "game" {
        return Err("Multi-instance play requires a game-runtime player build.".into());
    }
    let policy = network_policy_from_project(&project)?;
    if !policy.enabled
        || !policy.permission_granted
        || !policy.auto_start
        || !policy.client_allowed
        || !policy.listen_allowed
        || !matches!(policy.configured_role.as_str(), "host" | "server")
        || policy.session_mode != "direct"
        || policy.transport != "native-udp"
        || policy.protocol_version != 2
        || policy.requires_encryption
    {
        return Err("The built player does not authorize direct native-UDP Host/Server multi-instance play with network.client and network.listen grants.".into());
    }
    Ok(())
}

// 校验构建后启动有界数量的网络测试进程，并登记生命周期。
#[tauri::command]
fn launch_network_instances(
    state: tauri::State<'_, NetworkInstances>,
    request: NetworkInstanceLaunchRequest,
) -> Result<Vec<NetworkInstanceLaunch>, String> {
    require_editor_mode()?;
    if !(2..=8).contains(&request.count) {
        return Err("Network play requires 2–8 bounded instances".into());
    }
    let executable = fs::canonicalize(request.executable.trim()).map_err(
        /* 构造错误消息，保留Network player executable is unavailable: {error}。 */
        |error| format!("Network player executable is unavailable: {error}"),
    )?;
    let working_directory = fs::canonicalize(request.working_directory.trim()).map_err(
        /* 构造错误消息，保留Network player working directory is unavailable: {error}。 */
        |error| format!("Network player working directory is unavailable: {error}"),
    )?;
    if !executable.is_file() || !executable.starts_with(&working_directory) {
        return Err("Network player must be a built executable inside its output directory".into());
    }
    if cfg!(windows)
        && executable
            .extension()
            .and_then(/* 计算并返回 value . to_str ()，用于当前 launch_network_instances 流程。 */ |value| value.to_str())
            .is_none_or(/* 计算并返回 ! value . eq_ignore_ascii_case ("exe")，用于当前 launch_network_instances 流程。 */ |value| !value.eq_ignore_ascii_case("exe"))
    {
        return Err("Windows network play requires a built .exe player".into());
    }
    validate_network_player_build(&executable, &working_directory)?;
    let session_name: String = request
        .session_name
        .chars()
        .filter(
            /* 计算并返回 ! character . is_control ()，用于当前 launch_network_instances 流程。 */
            |character| !character.is_control(),
        )
        .take(80)
        .collect();
    if session_name.trim().is_empty() {
        return Err("Network play session name cannot be empty".into());
    }
    let reservation = UdpSocket::bind("127.0.0.1:0").map_err(
        /* 构造错误消息，保留Could not reserve a local network-play port: {error}。 */
        |error| format!("Could not reserve a local network-play port: {error}"),
    )?;
    let host_endpoint = reservation
        .local_addr()
        .map_err(
            /* 构造错误消息，保留Could not read the local network-play port: {error}。 */
            |error| format!("Could not read the local network-play port: {error}"),
        )?
        .to_string();
    drop(reservation);
    let mut managed = state.children.lock().map_err(
        /* 返回该失败路径的明确错误：Network instance state is unavailable。 */
        |_| "Network instance state is unavailable".to_string(),
    )?;
    managed.retain(/* 计算并返回 instance . child . try_wait () . ok () . flatten () . is_none ()，用于当前 launch_network_instances 流程。 */ |_, instance| instance.child.try_wait().ok().flatten().is_none());
    if !managed.is_empty() {
        return Err(
            "Stop the current network-play instances before launching another group".into(),
        );
    }
    let mut pending: Vec<ManagedNetworkInstance> = Vec::with_capacity(request.count as usize);
    for index in 0..request.count {
        let role = if index == 0 { "host" } else { "client" };
        let player_name = if index == 0 {
            "Host".to_owned()
        } else {
            format!("Client {index}")
        };
        let instance_id = format!("peer-{}", index + 1);
        let log_scope = if request.separate_logs {
            format!("network-{}", index + 1)
        } else {
            String::new()
        };
        let inspector_id = if request.separate_inspectors {
            format!("network-peer-{}", index + 1)
        } else {
            String::new()
        };
        let bind_address = if index == 0 {
            host_endpoint.clone()
        } else {
            "127.0.0.1:0".to_owned()
        };
        let mut command = Command::new(&executable);
        command
            .current_dir(&working_directory)
            .env("NOVA_NETWORK_ROLE", role)
            .env("NOVA_NETWORK_PLAYER_NAME", &player_name)
            .env("NOVA_NETWORK_SESSION", &session_name)
            .env("NOVA_NETWORK_INSTANCE", &instance_id)
            .env("NOVA_NETWORK_SESSION_MODE", "direct")
            .env("NOVA_NETWORK_TRANSPORT", "native-udp")
            .env("NOVA_NETWORK_ENDPOINT", &host_endpoint)
            .env("NOVA_NETWORK_BIND_ADDRESS", &bind_address);
        if !log_scope.is_empty() {
            command.env("NOVA_LOG_SCOPE", &log_scope);
        }
        if !inspector_id.is_empty() {
            command.env("NOVA_NETWORK_INSPECTOR", &inspector_id);
        }
        let child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                for instance in &mut pending {
                    let _ = terminate_network_child(&mut instance.child);
                }
                return Err(format!("Could not launch {instance_id}: {error}"));
            }
        };
        let launch = NetworkInstanceLaunch {
            id: instance_id,
            role: role.to_owned(),
            player_name,
            session_name: session_name.clone(),
            log_scope,
            inspector_id,
            endpoint: host_endpoint.clone(),
            bind_address,
            process_id: child.id(),
        };
        pending.push(ManagedNetworkInstance { child, launch });
    }
    let launched: Vec<NetworkInstanceLaunch> = pending
        .iter()
        .map(
            /* 复制 instance . launch . clone () 的结果，避免向调用方暴露可变宿主引用。 */
            |instance| instance.launch.clone(),
        )
        .collect();
    for instance in pending {
        managed.insert(instance.launch.id.clone(), instance);
    }
    Ok(launched)
}

// 刷新并返回已登记网络测试进程的状态。
#[tauri::command]
fn network_instance_status(
    state: tauri::State<'_, NetworkInstances>,
) -> Result<Vec<NetworkInstanceStatus>, String> {
    require_editor_mode()?;
    let mut children = state.children.lock().map_err(
        /* 返回该失败路径的明确错误：Network instance state is unavailable。 */
        |_| "Network instance state is unavailable".to_string(),
    )?;
    let mut statuses = Vec::with_capacity(children.len());
    for instance in children.values_mut() {
        let exit = instance.child.try_wait().map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )?;
        statuses.push(NetworkInstanceStatus {
            id: instance.launch.id.clone(),
            role: instance.launch.role.clone(),
            player_name: instance.launch.player_name.clone(),
            session_name: instance.launch.session_name.clone(),
            log_scope: instance.launch.log_scope.clone(),
            inspector_id: instance.launch.inspector_id.clone(),
            endpoint: instance.launch.endpoint.clone(),
            bind_address: instance.launch.bind_address.clone(),
            process_id: instance.launch.process_id,
            running: exit.is_none(),
            exit_code: exit.and_then(
                /* 计算并返回 status . code ()，用于当前 network_instance_status 流程。 */
                |status| status.code(),
            ),
        });
    }
    statuses.sort_by(
        /* 按 left . id . cmp (& right . id) 比较顺序，供稳定排序使用。 */
        |left, right| left.id.cmp(&right.id),
    );
    Ok(statuses)
}

// 停止并回收当前登记的全部网络测试进程。
#[tauri::command]
fn stop_network_instances(state: tauri::State<'_, NetworkInstances>) -> Result<usize, String> {
    require_editor_mode()?;
    let mut children = state.children.lock().map_err(
        /* 返回该失败路径的明确错误：Network instance state is unavailable。 */
        |_| "Network instance state is unavailable".to_string(),
    )?;
    let count = children.len();
    for instance in children.values_mut() {
        terminate_network_child(&mut instance.child)?;
    }
    children.clear();
    Ok(count)
}

// 停止并回收指定网络测试进程。
#[tauri::command]
fn stop_network_instance(
    state: tauri::State<'_, NetworkInstances>,
    instance_id: String,
) -> Result<bool, String> {
    require_editor_mode()?;
    let clean_id: String = instance_id
        .chars()
        .filter(/* 判断 character . is_ascii_alphanumeric () || matches ! (character , '-' | '_') 是否成立，供过滤或有效性检查使用。 */ |character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .take(32)
        .collect();
    if clean_id != instance_id || clean_id.is_empty() {
        return Err("Invalid network instance identity".into());
    }
    let mut children = state.children.lock().map_err(
        /* 返回该失败路径的明确错误：Network instance state is unavailable。 */
        |_| "Network instance state is unavailable".to_string(),
    )?;
    let Some(mut instance) = children.remove(&clean_id) else {
        return Ok(false);
    };
    terminate_network_child(&mut instance.child)?;
    Ok(true)
}

// 递归复制目录内容，传播文件系统错误。
fn copy_directory(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    for entry in fs::read_dir(source).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )? {
        let entry = entry.map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )?;
        let destination_entry = destination.join(entry.file_name());
        if entry
            .file_type()
            .map_err(
                /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
                |error| error.to_string(),
            )?
            .is_dir()
        {
            copy_directory(&entry.path(), &destination_entry)?;
        } else {
            fs::copy(entry.path(), destination_entry).map_err(
                /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
                |error| error.to_string(),
            )?;
        }
    }
    Ok(())
}

// 校验 Android 应用标识各段是否符合允许的字符和结构。
fn valid_android_identifier(value: &str) -> bool {
    let parts: Vec<&str> = value.split('.').collect();
    parts.len() >= 2
        && value.len() <= 160
        && parts.iter().all(/* 校验 Android 标识的一段非空、长度受限、首字母合法且后续字符属于允许集合。 */ |part| {
            !part.is_empty()
                && part.len() <= 63
                && part
                    .chars()
                    .next()
                    .is_some_and(/* 判断 character . is_ascii_alphabetic () 是否成立，供过滤或有效性检查使用。 */ |character| character.is_ascii_alphabetic())
                && part
                    .chars()
                    .all(/* 判断 character . is_ascii_alphanumeric () || character == '_' 是否成立，供过滤或有效性检查使用。 */ |character| character.is_ascii_alphanumeric() || character == '_')
        })
}

// 转义 XML 属性中的保留字符。
fn xml_escape(value: &str) -> String {
    value
        .chars()
        .flat_map(
            /* 把 XML 保留字符转换为对应实体，其余字符保持原样。 */
            |character| match character {
                '&' => "&amp;".chars().collect::<Vec<_>>(),
                '<' => "&lt;".chars().collect(),
                '>' => "&gt;".chars().collect(),
                '"' => "&quot;".chars().collect(),
                '\'' => "&apos;".chars().collect(),
                _ => vec![character],
            },
        )
        .collect()
}

// 校验应用标识并转义展示元数据，生成 Android 清单。
fn generated_android_manifest(request: &ExportRequest, game_name: &str) -> Result<String, String> {
    if !valid_android_identifier(&request.platform.identifier) {
        return Err("Android application identifier must contain at least two dot-separated, letter-led ASCII segments.".into());
    }
    let mut permissions = request.platform.permissions.clone();
    permissions.sort();
    permissions.dedup();
    if permissions.len() > 64
        || permissions.iter().any(/* 拒绝不含标准 Android 权限前缀、过长或名称字符非法的权限。 */ |permission| {
            !permission.starts_with("android.permission.")
                || permission.len() > 100
                || !permission["android.permission.".len()..]
                    .chars()
                    .all(/* 判断 character . is_ascii_uppercase () || character . is_ascii_digit () || character == '_' 是否成立，供过滤或有效性检查使用。 */ |character| {
                        character.is_ascii_uppercase()
                            || character.is_ascii_digit()
                            || character == '_'
                    })
        })
    {
        return Err("Android permissions must be unique android.permission.* identifiers from the reviewed manifest list.".into());
    }
    let orientation = match request.platform.orientation.as_str() {
        "portrait" => "portrait",
        "landscape" => "landscape",
        _ => "unspecified",
    };
    let permission_xml = permissions
        .iter()
        .map(/* 计算并返回 format ! ("  <uses-permission android:name=\"{}\" />\n" , xml_escape (permission))，用于当前 generated_android_manifest 流程。 */ |permission| {
            format!(
                "  <uses-permission android:name=\"{}\" />\n",
                xml_escape(permission)
            )
        })
        .collect::<String>();
    Ok(format!("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\">\n{permission_xml}  <application android:label=\"{}\" android:icon=\"@mipmap/ic_launcher\">\n    <activity android:name=\".MainActivity\" android:screenOrientation=\"{orientation}\" android:exported=\"true\">\n      <intent-filter><action android:name=\"android.intent.action.MAIN\" /><category android:name=\"android.intent.category.LAUNCHER\" /></intent-filter>\n    </activity>\n  </application>\n</manifest>\n", xml_escape(game_name)))
}

// 按有界目录深度收集 Android 构建产生的 APK。
fn collect_apks(root: &Path, depth: usize, output: &mut Vec<PathBuf>) -> Result<(), String> {
    if depth > 8 || output.len() >= 128 {
        return Ok(());
    }
    for entry in fs::read_dir(root).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )? {
        let entry = entry.map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )?;
        let path = entry.path();
        let kind = entry.file_type().map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )?;
        if kind.is_dir() {
            collect_apks(&path, depth + 1, output)?;
        } else if path
            .extension()
            .and_then(
                /* 计算并返回 value . to_str ()，用于当前 collect_apks 流程。 */
                |value| value.to_str(),
            )
            .is_some_and(
                /* 计算并返回 value . eq_ignore_ascii_case ("apk")，用于当前 collect_apks 流程。 */
                |value| value.eq_ignore_ascii_case("apk"),
            )
        {
            output.push(path);
        }
        if output.len() >= 128 {
            break;
        }
    }
    Ok(())
}
// 比较文件内容后按需复制，避免重写未改变的输出。
fn copy_file_incremental(
    source: &Path,
    destination: &Path,
    incremental: bool,
) -> Result<bool, String> {
    if incremental && destination.is_file() && file_hash(source)? == file_hash(destination)? {
        return Ok(false);
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )?;
    }
    fs::copy(source, destination).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    Ok(true)
}

// 为播放器构建生成同目录暂存路径。
fn player_staging_path(destination: &Path, build_id: &str) -> PathBuf {
    let parent = destination.parent().unwrap_or_else(
        /* 计算并返回 Path :: new (".")，用于当前 player_staging_path 流程。 */
        || Path::new("."),
    );
    let stem = destination
        .file_stem()
        .and_then(
            /* 计算并返回 value . to_str ()，用于当前 player_staging_path 流程。 */
            |value| value.to_str(),
        )
        .unwrap_or("NovaPlayer");
    let suffix = &build_id[..build_id.len().min(12)];
    parent.join(format!(
        ".{stem}.{suffix}.{}.nova-staging",
        std::process::id()
    ))
}

// 为被占用的 Windows 播放器生成带版本和尝试序号的后备路径。
fn locked_player_fallback(destination: &Path, build_id: &str, attempt: usize) -> PathBuf {
    let parent = destination.parent().unwrap_or_else(
        /* 计算并返回 Path :: new (".")，用于当前 locked_player_fallback 流程。 */
        || Path::new("."),
    );
    let stem = destination
        .file_stem()
        .and_then(
            /* 计算并返回 value . to_str ()，用于当前 locked_player_fallback 流程。 */
            |value| value.to_str(),
        )
        .unwrap_or("NovaPlayer");
    let extension = destination
        .extension()
        .and_then(
            /* 计算并返回 value . to_str ()，用于当前 locked_player_fallback 流程。 */
            |value| value.to_str(),
        )
        .map(
            /* 计算并返回 format ! (".{value}")，用于当前 locked_player_fallback 流程。 */
            |value| format!(".{value}"),
        )
        .unwrap_or_default();
    let suffix = &build_id[..build_id.len().min(8)];
    let counter = if attempt == 0 {
        String::new()
    } else {
        format!("-{attempt}")
    };
    parent.join(format!("{stem}-{suffix}{counter}{extension}"))
}

// 先暂存并校验内嵌播放器，再替换目标；锁定时使用明确的后备文件。
/// Publishes a self-contained player without ever modifying the previous
/// executable in place. Windows keeps running executables locked, so a build-ID
/// filename is used when the preferred output cannot be replaced. The editor
/// must not terminate a game the creator launched independently.
fn publish_embedded_player(
    source: &Path,
    preferred_destination: &Path,
    pack: &[u8],
    build_id: &str,
) -> Result<PathBuf, String> {
    if let Some(parent) = preferred_destination.parent() {
        fs::create_dir_all(parent).map_err(
            /* 构造错误消息，保留could not create the game output directory: {error}。 */
            |error| format!("could not create the game output directory: {error}"),
        )?;
    }
    let staging = player_staging_path(preferred_destination, build_id);
    if staging.exists() {
        fs::remove_file(&staging).map_err(
            /* 构造错误消息，保留could not clear the previous Nova Player staging file: {error}。 */
            |error| format!("could not clear the previous Nova Player staging file: {error}"),
        )?;
    }
    fs::copy(source, &staging).map_err(/* 构造错误消息，保留could not stage Nova Player in the selected output directory: {error}. Check folder permissions and available disk space。 */ |error| {
        format!(
            "could not stage Nova Player in the selected output directory: {error}. Check folder permissions and available disk space"
        )
    })?;
    if let Err(error) = append_embedded_package(&staging, pack) {
        let _ = fs::remove_file(&staging);
        return Err(error);
    }

    if !preferred_destination.exists() {
        fs::rename(&staging, preferred_destination).map_err(
            /* 失败时清理本次暂存文件，再返回保留原始原因的发布错误。 */
            |error| {
                let _ = fs::remove_file(&staging);
                format!("could not publish Nova Player: {error}")
            },
        )?;
        return Ok(preferred_destination.to_path_buf());
    }

    let staged_hash = file_hash(&staging)?;
    if file_hash(preferred_destination).ok().as_deref() == Some(staged_hash.as_str()) {
        fs::remove_file(&staging).map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )?;
        return Ok(preferred_destination.to_path_buf());
    }

    match fs::remove_file(preferred_destination) {
        Ok(()) => {
            fs::rename(&staging, preferred_destination).map_err(
                /* 失败时清理本次暂存文件，再返回保留原始原因的发布错误。 */
                |error| {
                    let _ = fs::remove_file(&staging);
                    format!(
                        "could not publish Nova Player after replacing the previous build: {error}"
                    )
                },
            )?;
            Ok(preferred_destination.to_path_buf())
        }
        Err(replace_error) => {
            for attempt in 0..100 {
                let fallback = locked_player_fallback(preferred_destination, build_id, attempt);
                if fallback.exists() {
                    if file_hash(&fallback).ok().as_deref() == Some(staged_hash.as_str()) {
                        let _ = fs::remove_file(&staging);
                        return Ok(fallback);
                    }
                    continue;
                }
                match fs::rename(&staging, &fallback) {
                    Ok(()) => return Ok(fallback),
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                    Err(error) => {
                        let _ = fs::remove_file(&staging);
                        return Err(format!(
                            "the previous game is locked ({replace_error}) and Nova_A could not publish a versioned fallback: {error}"
                        ));
                    }
                }
            }
            let _ = fs::remove_file(&staging);
            Err(format!(
                "the previous game is locked ({replace_error}); close old game builds or choose another output directory"
            ))
        }
    }
}

// 写入导出文件并把成功路径加入构建记录。
fn tracked_write(
    root: &Path,
    relative: &str,
    bytes: &[u8],
    incremental: bool,
    files: &mut Vec<String>,
    cache_hits: &mut usize,
    changed_files: &mut usize,
) -> Result<(), String> {
    let relative = safe_relative_path(relative)?;
    if write_incremental(&root.join(&relative), bytes, incremental)? {
        *changed_files += 1;
    } else {
        *cache_hits += 1;
    }
    files.push(relative.to_string_lossy().replace('\\', "/"));
    Ok(())
}

// 收集导出文件大小和哈希，形成可核验的构建清单。
fn build_file_records(root: &Path, files: &[String]) -> Result<Vec<BuildFileRecord>, String> {
    let mut records = Vec::new();
    for relative in files {
        let path = root.join(safe_relative_path(relative)?);
        if !path.is_file() {
            continue;
        }
        records.push(BuildFileRecord {
            path: relative.clone(),
            sha256: file_hash(&path)?,
            bytes: path
                .metadata()
                .map_err(
                    /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
                    |error| error.to_string(),
                )?
                .len(),
        });
    }
    records.sort_by(
        /* 按 first . path . cmp (& second . path) 比较顺序，供稳定排序使用。 */
        |first, second| first.path.cmp(&second.path),
    );
    records.dedup_by(
        /* 判断 first . path == second . path 是否成立，供过滤或有效性检查使用。 */
        |first, second| first.path == second.path,
    );
    Ok(records)
}

// 校验请求，构建目标平台产物并生成完整的输出文件记录。
#[tauri::command]
async fn export_game(request: ExportRequest) -> Result<ExportResult, String> {
    native_admission::run_export(move || export_game_core(request)).await
}

// Existing export algorithm, permissions and publication semantics remain in this single core.
fn export_game_core(request: ExportRequest) -> Result<ExportResult, String> {
    require_editor_mode()?;
    if !matches!(
        request.target.as_str(),
        "windows" | "linux" | "macos" | "web" | "android"
    ) {
        return Err("unsupported export target".into());
    }
    if !matches!(request.architecture.as_str(), "x86_64" | "aarch64") {
        return Err("unsupported export architecture".into());
    }
    if !matches!(request.runtime_mode.as_str(), "game" | "headless-server") {
        return Err("unsupported export runtime mode".into());
    }
    if request.target != "web"
        && request.target != "android"
        && request.architecture != std::env::consts::ARCH
    {
        return Err(format!(
            "{} export requires a matching {} player template",
            request.architecture, request.architecture
        ));
    }
    if request.web_files.len() > MAX_WEB_EXPORT_FILES {
        return Err(format!(
            "web export contains more than {MAX_WEB_EXPORT_FILES} files"
        ));
    }
    if request.project_id.len() > 160 || request.profile.len() > 32 {
        return Err("export request metadata exceeds its safety limit".into());
    }
    let game_name = safe_game_name(&request.game_name);
    let root = if request.output_directory.trim().is_empty() {
        default_output_root(&game_name)
    } else {
        let selected = PathBuf::from(request.output_directory.trim());
        if !selected.is_absolute() {
            return Err("export output directory must be an absolute path".into());
        }
        export_root_in(selected, &game_name)
    };
    let pack = decode_base64_limited(
        &request.pack_base64,
        MAX_EMBEDDED_PACKAGE_BYTES,
        "game package",
    )?;
    if pack.is_empty() {
        return Err("game package cannot be empty".into());
    }
    let embedded_project = runtime_project_document(&pack)?;
    validate_export_runtime_contract(&request.runtime_mode, &request.target, &embedded_project)?;
    let mut decoded_web_bytes = 0_u64;
    for file in &request.web_files {
        let estimated = (file.data_base64.len() as u64)
            .checked_add(3)
            .and_then(
                /* 计算并返回 length . checked_div (4)，用于当前 export_game 流程。 */
                |length| length.checked_div(4),
            )
            .and_then(
                /* 计算并返回 groups . checked_mul (3)，用于当前 export_game 流程。 */
                |groups| groups.checked_mul(3),
            )
            .ok_or("web export size overflow")?;
        if estimated > MAX_WEB_EXPORT_FILE_BYTES.saturating_add(2) {
            return Err(format!(
                "web export file {} exceeds its safety limit",
                file.path
            ));
        }
        decoded_web_bytes = decoded_web_bytes
            .checked_add(estimated)
            .ok_or("web export total size overflow")?;
        if decoded_web_bytes > MAX_WEB_EXPORT_TOTAL_BYTES {
            return Err("web export exceeds the 2 GiB safety limit".into());
        }
        safe_relative_path(&file.path)?;
    }
    fs::create_dir_all(&root).map_err(
        /* 构造错误消息，保留could not create output directory: {error}。 */
        |error| format!("could not create output directory: {error}"),
    )?;
    let mut files = Vec::new();
    let mut launch_path = None;
    let mut cache_hits = 0_usize;
    let mut changed_files = 0_usize;
    let mut build_digest = Sha256::new();
    build_digest.update(&pack);
    build_digest.update(request.target.as_bytes());
    build_digest.update(request.architecture.as_bytes());
    build_digest.update(request.profile.as_bytes());
    build_digest.update(request.runtime_mode.as_bytes());
    build_digest.update(serde_json::to_vec(&request.platform).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?);
    let build_id = format!("{:x}", build_digest.finalize());
    let mut previous_report = fs::read(root.join("nova-build-report.json"))
        .ok()
        .and_then(/* 判断 serde_json :: from_slice :: < BuildReport > (& bytes) . ok () 是否成立，供过滤或有效性检查使用。 */ |bytes| serde_json::from_slice::<BuildReport>(&bytes).ok());
    let mut cache_invalidated = Vec::new();
    if request.delivery.cache_mode == "validate" {
        if let Some(previous) = previous_report.as_ref() {
            for record in &previous.files {
                let path = root.join(safe_relative_path(&record.path)?);
                if !path.is_file() || file_hash(&path)? != record.sha256 {
                    cache_invalidated.push(record.path.clone());
                }
            }
        }
        if !cache_invalidated.is_empty() {
            previous_report = None;
        }
    }

    if request.target == "web" {
        for file in &request.web_files {
            if matches!(
                file.path.as_str(),
                "nova-build-report.json" | "nova-patch-manifest.json"
            ) {
                continue;
            }
            let (path, changed) = write_export_file(&root, file, request.delivery.incremental)?;
            files.push(path);
            if changed {
                changed_files += 1
            } else {
                cache_hits += 1
            }
        }
        tracked_write(
            &root,
            "game.nova-pak",
            &pack,
            request.delivery.incremental,
            &mut files,
            &mut cache_hits,
            &mut changed_files,
        )?;
    } else if request.target == "android" {
        let status = android_toolchain_status();
        if !status.available {
            return Err(format!(
                "Android export is blocked by: {}.",
                status.missing.join(", ")
            ));
        }
        let template = android_template()
            .ok_or("Validated Nova Android template disappeared after discovery")?;
        let destination = root.join(format!("{}-android", game_name));
        if destination.exists() && !request.delivery.incremental {
            fs::remove_dir_all(&destination).map_err(
                /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
                |error| error.to_string(),
            )?;
        }
        copy_directory(&template, &destination)?;
        let relative = format!("{}-android/app/src/main/assets/game.nova-pak", game_name);
        tracked_write(
            &root,
            &relative,
            &pack,
            request.delivery.incremental,
            &mut files,
            &mut cache_hits,
            &mut changed_files,
        )?;
        let manifest = generated_android_manifest(&request, &game_name)?;
        let manifest_relative = format!("{}-android/app/src/main/AndroidManifest.xml", game_name);
        tracked_write(
            &root,
            &manifest_relative,
            manifest.as_bytes(),
            request.delivery.incremental,
            &mut files,
            &mut cache_hits,
            &mut changed_files,
        )?;
        for file in &request.web_files {
            let source = safe_relative_path(&file.path)?;
            let destination_relative = if let Ok(resource) = source.strip_prefix("nova-android") {
                PathBuf::from(format!("{}-android/app/src/main/res", game_name)).join(resource)
            } else {
                PathBuf::from(format!("{}-android/app/src/main/assets/www", game_name)).join(source)
            };
            let destination_text = destination_relative.to_string_lossy().replace('\\', "/");
            tracked_write(
                &root,
                &destination_text,
                &decode_base64(&file.data_base64)?,
                request.delivery.incremental,
                &mut files,
                &mut cache_hits,
                &mut changed_files,
            )?;
        }
        let properties = format!(
            "nova.applicationId={}\nnova.version={}\nnova.orientation={}\nnova.development={}\n",
            request.platform.identifier,
            request.platform.version,
            request.platform.orientation,
            request.development_build
        );
        let properties_relative = format!("{}-android/nova-build.properties", game_name);
        tracked_write(
            &root,
            &properties_relative,
            properties.as_bytes(),
            request.delivery.incremental,
            &mut files,
            &mut cache_hits,
            &mut changed_files,
        )?;
        if request.platform.signing_mode == "manual" {
            let identity = PathBuf::from(&request.platform.signing_identity);
            if !identity.is_file()
                || std::env::var_os("NOVA_ANDROID_KEYSTORE_PASSWORD").is_none()
                || std::env::var_os("NOVA_ANDROID_KEY_ALIAS").is_none()
                || std::env::var_os("NOVA_ANDROID_KEY_PASSWORD").is_none()
            {
                return Err("Manual Android release signing requires an existing keystore identity and NOVA_ANDROID_KEYSTORE_PASSWORD, NOVA_ANDROID_KEY_ALIAS, and NOVA_ANDROID_KEY_PASSWORD environment variables.".into());
            }
        }
        let wrapper = destination.join(if cfg!(windows) {
            "gradlew.bat"
        } else {
            "gradlew"
        });
        let task = if request.development_build || request.platform.signing_mode != "manual" {
            "assembleDebug"
        } else {
            "assembleRelease"
        };
        let mut command = if cfg!(windows) {
            let mut value = Command::new("cmd");
            value.arg("/C").arg(&wrapper);
            value
        } else {
            Command::new(&wrapper)
        };
        command
            .current_dir(&destination)
            .args(["--offline", "--no-daemon"]);
        if !request.delivery.incremental {
            command.arg("clean");
        }
        let output = command
            .arg(task)
            .env("NOVA_APPLICATION_ID", &request.platform.identifier)
            .env("NOVA_VERSION", &request.platform.version)
            .env("NOVA_SIGNING_IDENTITY", &request.platform.signing_identity)
            .output()
            .map_err(
                /* 构造错误消息，保留could not start Android Gradle wrapper: {error}。 */
                |error| format!("could not start Android Gradle wrapper: {error}"),
            )?;
        if !output.status.success() {
            return Err(format!(
                "Android Gradle build failed:\n{}",
                bounded_command_text(&output)
            ));
        }
        let mut apks = Vec::new();
        collect_apks(&destination.join("app/build/outputs/apk"), 0, &mut apks)?;
        apks.sort();
        let apk = apks
            .into_iter()
            .find(/* 判断 path . to_string_lossy () . to_ascii_lowercase () . contains (if task == "assembleRelease" { "release" } else { "debug" }) 是否成立，供过滤或有效性检查使用。 */ |path| {
                path.to_string_lossy()
                    .to_ascii_lowercase()
                    .contains(if task == "assembleRelease" {
                        "release"
                    } else {
                        "debug"
                    })
            })
            .ok_or("Gradle succeeded but produced no matching APK under app/build/outputs/apk")?;
        let apk_name = format!(
            "{}-{}.apk",
            game_name,
            if task == "assembleRelease" {
                "release"
            } else {
                "debug"
            }
        );
        fs::copy(&apk, root.join(&apk_name)).map_err(
            /* 构造错误消息，保留could not copy built APK: {error}。 */
            |error| format!("could not copy built APK: {error}"),
        )?;
        files.push(apk_name);
        files.push(format!("{}-android", game_name));
        changed_files += 2;
    } else {
        let host = std::env::consts::OS;
        if request.target != host {
            return Err(format!(
                "{} exports must be built on a {} host",
                request.target, request.target
            ));
        }
        let current = std::env::current_exe().map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )?;
        if host == "macos" {
            if request.package_into_executable {
                return Err(
                    "Single-file export is unavailable for signed macOS app bundles".into(),
                );
            }
            let bundle = current
                .ancestors()
                .find(/* 判断 path . extension () . is_some_and (| extension | extension == "app") 是否成立，供过滤或有效性检查使用。 */ |path| path.extension().is_some_and(/* 判断 extension == "app" 是否成立，供过滤或有效性检查使用。 */ |extension| extension == "app"))
                .ok_or("Nova_A is not running from a macOS app bundle")?;
            let destination = root.join(format!("{game_name}.app"));
            copy_directory(bundle, &destination)?;
            let player = destination
                .join("Contents")
                .join("MacOS")
                .join(bundle.file_stem().unwrap_or_default());
            write_incremental(
                &player
                    .parent()
                    .unwrap_or(&destination)
                    .join("game.nova-pak"),
                &pack,
                request.delivery.incremental,
            )?;
            files.push(format!("{game_name}.app"));
            changed_files += 1;
            launch_path = Some(destination);
        } else {
            let mut file_name = if host == "windows" {
                format!("{game_name}.exe")
            } else {
                game_name.clone()
            };
            let mut destination = root.join(&file_name);
            if destination == current {
                return Err("the game output cannot overwrite the running Nova_A editor".into());
            }
            if request.package_into_executable {
                destination = publish_embedded_player(&current, &destination, &pack, &build_id)?;
                file_name = destination
                    .file_name()
                    .and_then(
                        /* 计算并返回 value . to_str ()，用于当前 export_game 流程。 */
                        |value| value.to_str(),
                    )
                    .unwrap_or(&file_name)
                    .to_string();
                changed_files += 1;
            } else {
                if copy_file_incremental(&current, &destination, request.delivery.incremental)? {
                    changed_files += 1
                } else {
                    cache_hits += 1
                }
                tracked_write(
                    &root,
                    "game.nova-pak",
                    &pack,
                    request.delivery.incremental,
                    &mut files,
                    &mut cache_hits,
                    &mut changed_files,
                )?;
            }
            files.push(file_name);
            launch_path = Some(destination);
        }
    }

    let platform_config = serde_json::to_vec_pretty(&serde_json::json!({
        "format": "nova-platform-config", "version": 1, "engineVersion": ENGINE_VERSION,
        "target": request.target, "architecture": request.architecture, "profile": request.profile, "runtimeMode": request.runtime_mode,
        "application": request.platform, "structuredLogs": request.delivery.structured_logs,
        "crashCapture": request.delivery.crash_reports,
        "telemetry": { "enabled": request.delivery.telemetry_enabled, "endpoint": request.delivery.telemetry_endpoint, "privacyPolicy": request.delivery.privacy_policy_url }
    })).map_err(/* 将底层错误转换为字符串，保留错误信息供上层返回。 */ |error| error.to_string())?;
    tracked_write(
        &root,
        "nova-platform-config.json",
        &platform_config,
        request.delivery.incremental,
        &mut files,
        &mut cache_hits,
        &mut changed_files,
    )?;
    if request.development_build {
        let build_info = serde_json::to_vec_pretty(&serde_json::json!({ "engineVersion": ENGINE_VERSION, "buildId": build_id, "target": request.target, "architecture": request.architecture, "packageBytes": pack.len() })).map_err(/* 将底层错误转换为字符串，保留错误信息供上层返回。 */ |error| error.to_string())?;
        tracked_write(
            &root,
            "build-info.json",
            &build_info,
            request.delivery.incremental,
            &mut files,
            &mut cache_hits,
            &mut changed_files,
        )?;
    }
    if request.delivery.crash_symbols || request.delivery.debug_symbols {
        let symbols = serde_json::to_vec_pretty(&serde_json::json!({
            "format": "nova-symbol-map", "version": 1, "engineVersion": ENGINE_VERSION, "buildId": build_id,
            "binary": files.iter().find(/* 在当前宏表达式中计算 path . ends_with (".exe") || path . ends_with (".app")，供查询映射、过滤或断言使用。 */ |path| path.ends_with(".exe") || path.ends_with(".app")).cloned(),
            "workflow": "Archive matching PDB, dSYM, or unstripped ELF symbols under this build ID; symbolicate crash addresses with the platform toolchain."
        })).map_err(/* 将底层错误转换为字符串，保留错误信息供上层返回。 */ |error| error.to_string())?;
        tracked_write(
            &root,
            "symbols/nova-symbol-map.json",
            &symbols,
            request.delivery.incremental,
            &mut files,
            &mut cache_hits,
            &mut changed_files,
        )?;
    }

    let cache_diagnostics = serde_json::to_vec_pretty(&serde_json::json!({ "format": "nova-build-cache-diagnostics", "version": 1, "engineVersion": ENGINE_VERSION, "mode": request.delivery.cache_mode, "status": if cache_invalidated.is_empty() { "valid" } else { "invalidated" }, "invalidated": cache_invalidated })).map_err(/* 将底层错误转换为字符串，保留错误信息供上层返回。 */ |error| error.to_string())?;
    tracked_write(
        &root,
        "nova-build-cache-diagnostics.json",
        &cache_diagnostics,
        request.delivery.incremental,
        &mut files,
        &mut cache_hits,
        &mut changed_files,
    )?;
    let mut records = build_file_records(&root, &files)?;
    if request.delivery.size_report {
        let total_bytes: u64 = records
            .iter()
            .map(
                /* 返回当前快照值 record . bytes。 */ |record| record.bytes,
            )
            .sum();
        let size_report = serde_json::to_vec_pretty(&serde_json::json!({ "format": "nova-build-size-report", "version": 1, "engineVersion": ENGINE_VERSION, "totalBytes": total_bytes, "files": records })).map_err(/* 将底层错误转换为字符串，保留错误信息供上层返回。 */ |error| error.to_string())?;
        tracked_write(
            &root,
            "nova-build-size-report.json",
            &size_report,
            request.delivery.incremental,
            &mut files,
            &mut cache_hits,
            &mut changed_files,
        )?;
    }
    if request.delivery.dependency_report {
        let dependency_report = serde_json::to_vec_pretty(&serde_json::json!({ "format": "nova-dependency-report", "version": 1, "engineVersion": ENGINE_VERSION, "package": { "path": "game.nova-pak", "sha256": sha256_hex(&pack), "bytes": pack.len() }, "application": request.platform.identifier, "permissions": request.platform.permissions, "contentPolicy": { "include": request.delivery.include, "exclude": request.delivery.exclude, "stripUnusedAssets": request.delivery.strip_unused_assets } })).map_err(/* 将底层错误转换为字符串，保留错误信息供上层返回。 */ |error| error.to_string())?;
        tracked_write(
            &root,
            "nova-dependency-report.json",
            &dependency_report,
            request.delivery.incremental,
            &mut files,
            &mut cache_hits,
            &mut changed_files,
        )?;
    }
    records = build_file_records(&root, &files)?;
    let content_manifest = serde_json::to_vec_pretty(&serde_json::json!({
        "format": "nova-content-manifest", "version": 1, "engineVersion": ENGINE_VERSION, "buildId": build_id,
        "include": request.delivery.include, "exclude": request.delivery.exclude,
        "stripUnusedAssets": request.delivery.strip_unused_assets, "compression": request.delivery.compression,
        "files": records
    })).map_err(/* 将底层错误转换为字符串，保留错误信息供上层返回。 */ |error| error.to_string())?;
    tracked_write(
        &root,
        "nova-content-manifest.json",
        &content_manifest,
        request.delivery.incremental,
        &mut files,
        &mut cache_hits,
        &mut changed_files,
    )?;
    records = build_file_records(&root, &files)?;
    let output_digest = {
        let mut digest = Sha256::new();
        for record in &records {
            digest.update(record.path.as_bytes());
            digest.update(record.sha256.as_bytes());
            digest.update(record.bytes.to_le_bytes());
        }
        format!("{:x}", digest.finalize())
    };
    if request.delivery.provenance {
        let provenance = serde_json::to_vec_pretty(&serde_json::json!({
            "format": "nova-build-provenance", "version": 1, "engineVersion": ENGINE_VERSION, "buildId": build_id,
            "projectId": request.project_id, "target": request.target, "architecture": request.architecture,
            "profile": request.profile, "runtimeMode": request.runtime_mode, "releaseChannel": request.delivery.release_channel,
            "exportTemplate": request.delivery.export_template, "inputsHash": build_id, "outputsHash": output_digest,
            "deterministic": request.delivery.deterministic, "sourceCommit": "working-tree",
            "toolchain": { "builder": "Nova_A Desktop Export 1", "host": std::env::consts::OS, "architecture": std::env::consts::ARCH },
            "generatedAt": if request.delivery.deterministic { "1970-01-01T00:00:00.000Z" } else { "runtime" },
            "files": records
        })).map_err(/* 将底层错误转换为字符串，保留错误信息供上层返回。 */ |error| error.to_string())?;
        tracked_write(
            &root,
            "nova-build-provenance.json",
            &provenance,
            request.delivery.incremental,
            &mut files,
            &mut cache_hits,
            &mut changed_files,
        )?;
    }
    if request.delivery.sbom {
        let sbom = serde_json::to_vec_pretty(&serde_json::json!({
            "bomFormat": "CycloneDX", "specVersion": "1.5", "version": 1,
            "metadata": { "component": { "type": "application", "name": game_name, "version": request.platform.version }, "properties": [{ "name": "nova.engine", "value": ENGINE_VERSION }, { "name": "nova.build", "value": build_id }] },
            "components": [{ "type": "file", "name": "game.nova-pak", "hashes": [{ "alg": "SHA-256", "content": sha256_hex(&pack) }] }]
        })).map_err(/* 将底层错误转换为字符串，保留错误信息供上层返回。 */ |error| error.to_string())?;
        tracked_write(
            &root,
            "nova-sbom.cdx.json",
            &sbom,
            request.delivery.incremental,
            &mut files,
            &mut cache_hits,
            &mut changed_files,
        )?;
    }
    let deployment = serde_json::to_vec_pretty(&serde_json::json!({
        "format": "nova-deployment-manifest", "version": 1, "engineVersion": ENGINE_VERSION, "buildId": build_id,
        "mode": request.delivery.deployment_mode, "destination": request.delivery.deployment_destination,
        "releaseChannel": request.delivery.release_channel, "implicitNetworkOperation": false,
        "connectorId": request.delivery.deployment_connector_id, "permissionGranted": request.delivery.deployment_permission_granted,
        "contentCache": request.delivery.content_cache, "deltaBuilds": request.delivery.delta_builds, "ciMatrixVersion": request.delivery.ci_matrix_version,
        "signing": { "mode": request.platform.signing_mode, "hookConfigured": !request.delivery.signing_hook.trim().is_empty(), "notarizationHookConfigured": !request.delivery.notarization_hook.trim().is_empty(), "execution": "external-explicit" },
        "cleanMachineJob": request.delivery.clean_machine_job
    })).map_err(/* 将底层错误转换为字符串，保留错误信息供上层返回。 */ |error| error.to_string())?;
    tracked_write(
        &root,
        "nova-deployment-manifest.json",
        &deployment,
        request.delivery.incremental,
        &mut files,
        &mut cache_hits,
        &mut changed_files,
    )?;
    if request.target == "web" && request.delivery.web_headers {
        let headers = b"/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/index.html\n  Cache-Control: no-cache\n/player.html\n  Cache-Control: no-cache\n/player-legacy.html\n  Cache-Control: no-cache\n";
        tracked_write(
            &root,
            "_headers",
            headers,
            request.delivery.incremental,
            &mut files,
            &mut cache_hits,
            &mut changed_files,
        )?;
    }
    records = build_file_records(&root, &files)?;
    let current_by_path: BTreeMap<_, _> = records
        .iter()
        .map(/* 复制 (record . path . clone () , record . sha256 . clone ()) 的结果，避免向调用方暴露可变宿主引用。 */ |record| (record.path.clone(), record.sha256.clone()))
        .collect();
    let previous_by_path: BTreeMap<_, _> = previous_report
        .as_ref()
        .map(/* 复制 report . files . iter () . map (| record | (record . path . clone () , record . sha256 . clone ())) . collect () 的结果，避免向调用方暴露可变宿主引用。 */ |report| {
            report
                .files
                .iter()
                .map(/* 复制 (record . path . clone () , record . sha256 . clone ()) 的结果，避免向调用方暴露可变宿主引用。 */ |record| (record.path.clone(), record.sha256.clone()))
                .collect()
        })
        .unwrap_or_default();
    let added: Vec<_> = current_by_path
        .keys()
        .filter(
            /* 判断 ! previous_by_path . contains_key (* path) 是否成立，供过滤或有效性检查使用。 */
            |path| !previous_by_path.contains_key(*path),
        )
        .cloned()
        .collect();
    let changed: Vec<_> = current_by_path
        .iter()
        .filter(/* 判断 previous_by_path . get (* path) . is_some_and (| previous | previous != * hash) 是否成立，供过滤或有效性检查使用。 */ |(path, hash)| {
            previous_by_path
                .get(*path)
                .is_some_and(/* 判断 previous != * hash 是否成立，供过滤或有效性检查使用。 */ |previous| previous != *hash)
        })
        .map(/* 复制 path . clone () 的结果，避免向调用方暴露可变宿主引用。 */ |(path, _)| path.clone())
        .collect();
    let removed: Vec<_> = previous_by_path
        .keys()
        .filter(
            /* 判断 ! current_by_path . contains_key (* path) 是否成立，供过滤或有效性检查使用。 */
            |path| !current_by_path.contains_key(*path),
        )
        .cloned()
        .collect();
    for relative in &removed {
        let path = root.join(safe_relative_path(relative)?);
        if path.is_file() {
            match fs::remove_file(&path) {
                Ok(()) => changed_files += 1,
                Err(error)
                    if error.kind() == std::io::ErrorKind::PermissionDenied
                        && path.extension().is_some_and(
                            /* 判断 extension == "exe" 是否成立，供过滤或有效性检查使用。 */
                            |extension| extension == "exe",
                        ) =>
                {
                    // A creator may still be running an earlier Build & Run
                    // artifact. Retain it instead of failing the new build.
                }
                Err(error) => return Err(error.to_string()),
            }
        }
    }
    if request.delivery.patch_manifest {
        let patch = serde_json::to_vec_pretty(&serde_json::json!({ "format": "nova-patch-manifest", "version": 1, "fromBuild": previous_report.as_ref().map(/* 在当前宏表达式中计算 & report . build_id，供查询映射、过滤或断言使用。 */ |report| &report.build_id), "toBuild": build_id, "added": added, "changed": changed, "removed": removed, "files": records })).map_err(/* 将底层错误转换为字符串，保留错误信息供上层返回。 */ |error| error.to_string())?;
        tracked_write(
            &root,
            "nova-patch-manifest.json",
            &patch,
            request.delivery.incremental,
            &mut files,
            &mut cache_hits,
            &mut changed_files,
        )?;
    }
    let report = BuildReport {
        format: "nova-build-report".into(),
        version: 2,
        engine_version: ENGINE_VERSION.into(),
        build_id: build_id.clone(),
        created_at: if request.delivery.deterministic {
            0
        } else {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
        },
        target: request.target.clone(),
        architecture: request.architecture.clone(),
        profile: request.profile.clone(),
        runtime_mode: request.runtime_mode.clone(),
        project_id: request.project_id.clone(),
        cache_mode: request.delivery.cache_mode.clone(),
        total_bytes: records
            .iter()
            .map(
                /* 返回当前快照值 record . bytes。 */ |record| record.bytes,
            )
            .sum(),
        files: records,
    };
    let report_bytes = serde_json::to_vec_pretty(&report).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    tracked_write(
        &root,
        "nova-build-report.json",
        &report_bytes,
        request.delivery.incremental,
        &mut files,
        &mut cache_hits,
        &mut changed_files,
    )?;
    tracked_write(
        &root,
        ".nova-build-cache/manifest.json",
        &report_bytes,
        request.delivery.incremental,
        &mut files,
        &mut cache_hits,
        &mut changed_files,
    )?;
    let launched = if request.run {
        let path = launch_path.ok_or("Build & Run is available for desktop targets")?;
        if cfg!(target_os = "macos") {
            Command::new("open").arg(&path).spawn().map_err(
                /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
                |error| error.to_string(),
            )?;
        } else {
            Command::new(&path).current_dir(&root).spawn().map_err(
                /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
                |error| error.to_string(),
            )?;
        }
        true
    } else {
        false
    };
    Ok(ExportResult {
        output_path: root.to_string_lossy().into_owned(),
        files,
        launched,
        cache_hits,
        changed_files,
        build_id,
    })
}

// 定位应用诊断日志目录。
fn logs_directory() -> PathBuf {
    let base = std::env::var_os(if cfg!(windows) { "APPDATA" } else { "HOME" })
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    let root = if cfg!(windows) {
        base.join("Nova_A").join("Logs")
    } else {
        base.join(".local")
            .join("share")
            .join("Nova_A")
            .join("Logs")
    };
    bounded_environment_value("NOVA_LOG_SCOPE", 48)
        .map(/* 把日志作用域中的不安全字符替换为下划线，防止其成为路径结构。 */ |scope| {
            scope
                .chars()
                .map(/* 判断 if character . is_ascii_alphanumeric () || matches ! (character , '.' | '-' | '_') { character } else { '_' } 是否成立，供过滤或有效性检查使用。 */ |character| {
                    if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                        character
                    } else {
                        '_'
                    }
                })
                .collect::<String>()
        })
        .filter(/* 判断 ! scope . is_empty () 是否成立，供过滤或有效性检查使用。 */ |scope| !scope.is_empty())
        .map_or(root.clone(), /* 计算并返回 root . join (scope)，用于当前 logs_directory 流程。 */ |scope| root.join(scope))
}

// 校验编辑器模式和工具配置后启动外部比较程序。
#[tauri::command]
fn open_external_diff(request: ExternalDiffRequest) -> Result<(), String> {
    require_editor_mode()?;
    if request.executable.trim().is_empty() || request.executable.len() > 1_024 {
        return Err("Choose a bounded external diff executable path".into());
    }
    let left = decode_base64(&request.left)?;
    let right = decode_base64(&request.right)?;
    if left.len() > 64 * 1024 * 1024 || right.len() > 64 * 1024 * 1024 {
        return Err("External diff snapshots are limited to 64 MiB each".into());
    }
    let directory = external_tool_directory("diff")?;
    let left_path = directory.join("project.saved.nova");
    let right_path = directory.join("project.current.nova");
    fs::write(&left_path, left).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    fs::write(&right_path, right).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    let arguments = request
        .arguments
        .split_whitespace()
        .take(128)
        .map(/* 计算并返回 argument . replace ("{left}" , & left_path . to_string_lossy ()) . replace ("{right}" , & right_path . to_string_lossy ())，用于当前 open_external_diff 流程。 */ |argument| {
            argument
                .replace("{left}", &left_path.to_string_lossy())
                .replace("{right}", &right_path.to_string_lossy())
        });
    Command::new(request.executable.trim())
        .args(arguments)
        .spawn()
        .map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )?;
    Ok(())
}

// 创建受控的外部工具临时工作目录。
fn external_tool_directory(label: &str) -> Result<PathBuf, String> {
    let root = std::env::temp_dir().join("Nova_A");
    fs::create_dir_all(&root).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    let expiry = SystemTime::now()
        .checked_sub(std::time::Duration::from_secs(24 * 60 * 60))
        .unwrap_or(UNIX_EPOCH);
    if let Ok(entries) = fs::read_dir(&root) {
        for entry in entries.flatten().take(512) {
            if entry.file_type().is_ok_and(
                /* 计算并返回 kind . is_dir ()，用于当前 external_tool_directory 流程。 */
                |kind| kind.is_dir(),
            ) && entry
                .metadata()
                .and_then(
                    /* 计算并返回 metadata . modified ()，用于当前 external_tool_directory 流程。 */
                    |metadata| metadata.modified(),
                )
                .is_ok_and(
                    /* 判断 modified < expiry 是否成立，供过滤或有效性检查使用。 */
                    |modified| modified < expiry,
                )
            {
                let _ = fs::remove_dir_all(entry.path());
            }
        }
    }
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let directory = root.join(format!("{label}-{}-{unique}", std::process::id()));
    fs::create_dir_all(&directory).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    Ok(directory)
}

// 暂存合并输入并启动配置的外部三方合并工具。
#[tauri::command]
fn open_external_merge(request: ExternalMergeRequest) -> Result<(), String> {
    require_editor_mode()?;
    if request.executable.trim().is_empty() || request.executable.len() > 1_024 {
        return Err("Choose a bounded external merge executable path".into());
    }
    let base = decode_base64(&request.base)?;
    let ours = decode_base64(&request.ours)?;
    let theirs = decode_base64(&request.theirs)?;
    if [base.len(), ours.len(), theirs.len()].into_iter().any(
        /* 判断 length > 64 * 1024 * 1024 是否成立，供过滤或有效性检查使用。 */
        |length| length > 64 * 1024 * 1024,
    ) {
        return Err("External merge snapshots are limited to 64 MiB each".into());
    }
    let directory = external_tool_directory("merge")?;
    let base_path = directory.join("project.base.nova");
    let ours_path = directory.join("project.ours.nova");
    let theirs_path = directory.join("project.theirs.nova");
    let output_path = directory.join("project.merged.nova");
    fs::write(&base_path, base).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    fs::write(&ours_path, &ours).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    fs::write(&theirs_path, theirs).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    fs::write(&output_path, ours).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    let arguments = request.arguments.split_whitespace().take(128).map(
        /* 将合并工具参数中的四个文件占位符替换成已暂存的实际路径。 */
        |argument| {
            argument
                .replace("{base}", &base_path.to_string_lossy())
                .replace("{ours}", &ours_path.to_string_lossy())
                .replace("{theirs}", &theirs_path.to_string_lossy())
                .replace("{output}", &output_path.to_string_lossy())
        },
    );
    Command::new(request.executable.trim())
        .args(arguments)
        .spawn()
        .map_err(
            /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
            |error| error.to_string(),
        )?;
    Ok(())
}

// 把诊断文本写入应用日志目录并返回路径。
fn write_log(contents: &str) -> Result<String, String> {
    let directory = logs_directory();
    fs::create_dir_all(&directory).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let path = directory.join(format!("Nova_A-{seconds}.log"));
    fs::write(&path, contents).map_err(
        /* 将底层错误转换为字符串，保留错误信息供上层返回。 */
        |error| error.to_string(),
    )?;
    Ok(path.to_string_lossy().into_owned())
}

// 将结构化崩溃信息序列化后交给日志写入流程。
#[tauri::command]
fn write_crash_log(payload: CrashPayload) -> Result<String, String> {
    write_log(&format!("Nova_A version: {ENGINE_VERSION}\nOS: {} {}\nRenderer: {}\nProject: {}\nScene: {}\nError: {}\n\nStack trace:\n{}\n", std::env::consts::OS, std::env::consts::ARCH, payload.renderer, payload.project, payload.scene, payload.message, payload.stack))
}

// 在校验后的工程目录初始化 Git 仓库并返回操作结果。
#[tauri::command]
fn initialize_git_repository(
    project_directory: String,
    ignore_contents: String,
    pre_commit_contents: String,
    ci_contents: String,
) -> Result<String, String> {
    require_editor_mode()?;
    let root = PathBuf::from(project_directory).canonicalize().map_err(
        /* 构造错误消息，保留Project directory is unavailable: {error}。 */
        |error| format!("Project directory is unavailable: {error}"),
    )?;
    if !root.is_dir() {
        return Err("Project directory must be an existing directory".into());
    }
    let output = Command::new("git")
        .arg("-C")
        .arg(&root)
        .arg("init")
        .output()
        .map_err(
            /* 构造错误消息，保留Could not start Git: {error}。 */
            |error| format!("Could not start Git: {error}"),
        )?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    let write_new = /* 仅创建尚不存在的 Git 初始化辅助文件，保留用户已有文件。 */ |path: &Path, contents: &str| -> Result<(), String> {
        if path.exists() {
            return Ok(());
        }
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(/* 将底层错误转换为字符串，保留错误信息供上层返回。 */ |error| error.to_string())?;
        }
        fs::write(path, contents).map_err(/* 将底层错误转换为字符串，保留错误信息供上层返回。 */ |error| error.to_string())
    };
    write_new(&root.join(".gitignore"), &ignore_contents)?;
    write_new(&root.join(".githooks/pre-commit"), &pre_commit_contents)?;
    write_new(
        &root.join(".github/workflows/nova-validation.yml"),
        &ci_contents,
    )?;
    let config = Command::new("git")
        .arg("-C")
        .arg(&root)
        .args(["config", "core.hooksPath", ".githooks"])
        .output()
        .map_err(
            /* 构造错误消息，保留Could not configure Git hooks: {error}。 */
            |error| format!("Could not configure Git hooks: {error}"),
        )?;
    if !config.status.success() {
        return Err(String::from_utf8_lossy(&config.stderr).trim().to_owned());
    }
    Ok(root.to_string_lossy().into_owned())
}

// 安装 panic 日志处理器，记录 Rust 崩溃诊断。
fn install_panic_logger() {
    std::panic::set_hook(Box::new(
        /* 提取 panic 位置和负载文本，写入崩溃日志并保留诊断上下文。 */
        |panic| {
            let location = panic
            .location()
            .map(/* 计算并返回 format ! ("{}:{}" , location . file () , location . line ())，用于当前 install_panic_logger 流程。 */ |location| format!("{}:{}", location.file(), location.line()))
            .unwrap_or_else(/* 计算并返回 "unknown" . into ()，用于当前 install_panic_logger 流程。 */ || "unknown".into());
            let message = panic
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .or_else(/* 判断 panic . payload () . downcast_ref :: < String > () . map (String :: as_str) 是否成立，供过滤或有效性检查使用。 */ || panic.payload().downcast_ref::<String>().map(String::as_str))
            .unwrap_or("unknown panic");
            let _ = write_log(&format!(
            "Nova_A version: {ENGINE_VERSION}\nOS: {} {}\nFatal Rust panic at {location}\n{message}\n",
            std::env::consts::OS,
            std::env::consts::ARCH
        ));
        },
    ));
}

// 注册桌面状态、插件、命令与窗口回调，然后运行 Tauri 应用。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_panic_logger();
    tauri::Builder::default()
        .manage(UdpSockets::default())
        .manage(NetworkInstances::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            runtime_mode,
            latency_probe_endpoint,
            latency_probe_send,
            canvas_desynchronized,
            launch_project,
            runtime_package,
            runtime_overrides,
            launch_network_instances,
            network_instance_status,
            stop_network_instance,
            stop_network_instances,
            android_toolchain_status,
            android_devices,
            android_deploy_apk,
            android_logcat_snapshot,
            native_accessibility_capabilities,
            export_capabilities,
            export_game,
            open_external_diff,
            open_external_merge,
            initialize_git_repository,
            commit_project_transaction,
            write_crash_log,
            udp_open,
            udp_admit_peer,
            udp_forget_peer,
            udp_send,
            udp_receive,
            udp_close
        ])
        .on_window_event(
            /* 只在主窗口销毁时清理网络测试子进程，避免遗留后台进程。 */
            |window, event| {
                if window.label() != "main" || !matches!(event, tauri::WindowEvent::Destroyed) {
                    return;
                }
                let state = window.app_handle().state::<NetworkInstances>();
                if let Ok(mut children) = state.children.lock() {
                    for instance in children.values_mut() {
                        let _ = terminate_network_child(&mut instance.child);
                    }
                    children.clear();
                };
            },
        )
        .run(tauri::generate_context!())
        .expect("error while running Nova_A");
}

#[cfg(test)]
mod tests {
    use super::*;

    // 26.45: exports into a folder with other files go to a subfolder named after the game.
    #[test]
    fn exports_into_occupied_folders_use_a_game_subfolder() {
        let base = std::env::temp_dir().join(format!("nova-export-root-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let empty = base.join("empty");
        let occupied = base.join("occupied");
        let earlier = base.join("earlier");
        for folder in [&empty, &occupied, &earlier] {
            fs::create_dir_all(folder).unwrap();
        }
        fs::write(occupied.join("Cargo.toml"), b"[package]").unwrap();
        fs::write(earlier.join("nova-platform-config.json"), b"{}").unwrap();
        fs::write(earlier.join("game.nova-pak"), b"x").unwrap();
        assert_eq!(export_root_in(empty.clone(), "My Game"), empty);
        assert_eq!(export_root_in(occupied.clone(), "My Game"), occupied.join("My Game"));
        assert_eq!(export_root_in(earlier.clone(), "My Game"), earlier);
        let missing = base.join("missing");
        assert_eq!(export_root_in(missing.clone(), "My Game"), missing);
        let _ = fs::remove_dir_all(&base);
    }

    // 构造指定运行模式和网络权限的测试工程。
    fn network_project(runtime_mode: &str, granted_permissions: &[&str]) -> serde_json::Value {
        let package_hash = "a".repeat(64);
        serde_json::json!({
            "projectSettings": {
                "build": { "runtimeMode": runtime_mode },
                "production": { "networking": {
                    "enabled": true, "permissionGranted": true, "autoStart": true,
                    "role": "host", "sessionMode": "direct", "transport": "native-udp",
                    "endpoint": "udp://127.0.0.1:7777", "bindAddress": "127.0.0.1:0",
                    "maxPeers": 8, "protocolVersion": 2, "security": { "requireEncryption": false },
                    "transportAdapterId": "", "services": {}
                }}
            },
            "packages": {
                "installed": [{
                    "manifest": { "id": "top.whitelists.novaa.networking", "version": "1.0.0", "sha256": package_hash, "permissions": ["network.client", "network.listen"] },
                    "enabled": true, "project": true,
                    "grantedPermissions": granted_permissions
                }],
                "lockfile": [{ "id": "top.whitelists.novaa.networking", "version": "1.0.0", "sha256": package_hash }]
            }
        })
    }

    // 验证原生导出明确记录无界面模式及网络策略。
    #[test]
    fn native_export_attests_headless_runtime_and_network_policy() {
        let valid = network_project("headless-server", &["network.client", "network.listen"]);
        assert!(validate_export_runtime_contract("headless-server", "windows", &valid).is_ok());
        assert!(validate_export_runtime_contract("game", "windows", &valid)
            .unwrap_err()
            .contains("does not match"));

        let missing_listen = network_project("headless-server", &["network.client"]);
        assert!(
            validate_export_runtime_contract("headless-server", "windows", &missing_listen)
                .unwrap_err()
                .contains("network.listen")
        );

        let mut wrong_transport = valid;
        wrong_transport["projectSettings"]["production"]["networking"]["transport"] =
            serde_json::json!("websocket");
        assert!(
            validate_export_runtime_contract("headless-server", "windows", &wrong_transport)
                .unwrap_err()
                .contains("native-UDP")
        );

        let mut wrong_protocol =
            network_project("headless-server", &["network.client", "network.listen"]);
        wrong_protocol["projectSettings"]["production"]["networking"]["protocolVersion"] =
            serde_json::json!(1);
        assert!(
            validate_export_runtime_contract("headless-server", "windows", &wrong_protocol)
                .is_err()
        );

        let mut plaintext_mismatch =
            network_project("headless-server", &["network.client", "network.listen"]);
        plaintext_mismatch["projectSettings"]["production"]["networking"]["security"]
            ["requireEncryption"] = serde_json::json!(true);
        assert!(validate_export_runtime_contract(
            "headless-server",
            "windows",
            &plaintext_mismatch
        )
        .is_err());

        let mut undeclared_listen =
            network_project("headless-server", &["network.client", "network.listen"]);
        undeclared_listen["packages"]["installed"][0]["manifest"]["permissions"] =
            serde_json::json!(["network.client"]);
        assert!(
            validate_export_runtime_contract("headless-server", "windows", &undeclared_listen)
                .is_err()
        );
    }

    // 验证 UDP 授权限制绑定、目标和套接字数量。
    #[test]
    fn runtime_udp_scope_bounds_bind_targets_and_socket_count() {
        let authorization = RuntimeUdpAuthorization {
            role: "host".into(),
            bind_address: "127.0.0.1:0".parse().unwrap(),
            endpoint: "127.0.0.1:7777".parse().unwrap(),
            maximum_peers: 8,
        };
        assert!(udp_bind_is_authorized(
            Some(&authorization),
            "127.0.0.1:0".parse().unwrap()
        ));
        assert!(!udp_bind_is_authorized(
            Some(&authorization),
            "0.0.0.0:0".parse().unwrap()
        ));

        let mut observed = HashSet::new();
        assert!(udp_target_is_authorized(
            Some(&authorization),
            &observed,
            "127.0.0.1:7777".parse().unwrap()
        ));
        assert!(!udp_target_is_authorized(
            Some(&authorization),
            &observed,
            "127.0.0.1:8888".parse().unwrap()
        ));
        observed.insert("127.0.0.1:8888".parse().unwrap());
        assert!(udp_target_is_authorized(
            Some(&authorization),
            &observed,
            "127.0.0.1:8888".parse().unwrap()
        ));
        let client_authorization = RuntimeUdpAuthorization {
            role: "client".into(),
            ..authorization.clone()
        };
        assert!(!udp_target_is_authorized(
            Some(&client_authorization),
            &observed,
            "127.0.0.1:8888".parse().unwrap()
        ));
        assert!(udp_source_is_authorized(
            Some(&client_authorization),
            client_authorization.endpoint
        ));
        assert!(!udp_source_is_authorized(
            Some(&client_authorization),
            "127.0.0.1:8888".parse().unwrap()
        ));

        let bounded_authorization = RuntimeUdpAuthorization {
            maximum_peers: 1,
            ..authorization.clone()
        };
        let mut admitted = HashSet::new();
        let first_peer = "127.0.0.1:8888".parse().unwrap();
        let reconnect_peer = "127.0.0.1:9999".parse().unwrap();
        admit_udp_peer(Some(&bounded_authorization), &mut admitted, first_peer).unwrap();
        assert!(
            admit_udp_peer(Some(&bounded_authorization), &mut admitted, reconnect_peer).is_err()
        );
        admitted.remove(&first_peer);
        admit_udp_peer(Some(&bounded_authorization), &mut admitted, reconnect_peer).unwrap();

        let state = UdpSockets::default();
        for _ in 0..MAX_RUNTIME_UDP_SOCKETS {
            open_udp_socket(
                &state,
                authorization.bind_address,
                Some(authorization.clone()),
            )
            .unwrap();
        }
        assert!(
            open_udp_socket(&state, authorization.bind_address, Some(authorization))
                .unwrap_err()
                .contains("socket limit")
        );
    }

    // 验证内嵌包写入和读取保持字节完全一致。
    #[test]
    fn embedded_package_round_trips_without_changing_payload() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "nova-a-player-test-{}-{unique}.bin",
            std::process::id()
        ));
        fs::write(&path, b"executable-prefix").unwrap();
        let package = b"NOVAPAK\0\x01\0\0\0sample";
        append_embedded_package(&path, package).unwrap();
        assert_eq!(
            embedded_package(&path).unwrap().as_deref(),
            Some(package.as_slice())
        );
        fs::remove_file(path).unwrap();
    }

    // 验证损坏内嵌包不能通过校验。
    #[test]
    fn embedded_package_rejects_corrupted_payload() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "nova-a-player-corrupt-test-{}-{unique}.bin",
            std::process::id()
        ));
        fs::write(&path, b"executable-prefix").unwrap();
        append_embedded_package(&path, b"NOVAPAK\0payload").unwrap();
        let mut bytes = fs::read(&path).unwrap();
        let payload_index = b"executable-prefix".len() + 3;
        bytes[payload_index] ^= 0xff;
        fs::write(&path, bytes).unwrap();
        assert!(embedded_package(&path)
            .unwrap_err()
            .contains("SHA-256 integrity"));
        fs::remove_file(path).unwrap();
    }

    // 验证网络进程启动必须使用有可核验构建记录的内嵌播放器。
    #[test]
    fn network_instance_launcher_requires_a_reported_embedded_player() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "nova-a-network-player-test-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&directory).unwrap();
        let executable = directory.join("NetworkGame.exe");
        fs::write(&executable, b"player-prefix").unwrap();
        let package_hash = "a".repeat(64);
        let project = serde_json::json!({
            "projectSettings": { "build": { "runtimeMode": "game" }, "production": { "networking": {
                "enabled": true, "permissionGranted": true, "autoStart": true,
                "role": "host", "sessionMode": "direct", "transport": "native-udp",
                "endpoint": "udp://127.0.0.1:7777", "bindAddress": "127.0.0.1:0",
                "maxPeers": 8, "protocolVersion": 2, "security": { "requireEncryption": false },
                "transportAdapterId": "", "services": {}
            }}},
            "packages": {
                "installed": [{
                    "manifest": {
                        "id": "top.whitelists.novaa.networking", "version": "1.0.0", "sha256": package_hash,
                        "permissions": ["network.client", "network.listen"]
                    },
                    "enabled": true, "project": true,
                    "grantedPermissions": ["network.client", "network.listen"]
                }],
                "lockfile": [{ "id": "top.whitelists.novaa.networking", "version": "1.0.0", "sha256": package_hash }]
            }
        });
        let project_bytes = serde_json::to_vec(&project).unwrap();
        let index = serde_json::json!({
            "format": "nova-pak", "version": 1,
            "entries": [{
                "path": "project.nova", "offset": 0, "length": project_bytes.len(),
                "originalLength": project_bytes.len(), "codec": "store",
                "sha256": sha256_hex(&project_bytes)
            }]
        });
        let index_bytes = serde_json::to_vec(&index).unwrap();
        let mut pack = b"NOVAPAK\0".to_vec();
        pack.extend_from_slice(&1_u32.to_le_bytes());
        pack.extend_from_slice(&(index_bytes.len() as u32).to_le_bytes());
        pack.extend_from_slice(&index_bytes);
        pack.extend_from_slice(&project_bytes);
        append_embedded_package(&executable, &pack).unwrap();
        let target = if cfg!(target_os = "windows") {
            "windows"
        } else if cfg!(target_os = "macos") {
            "macos"
        } else if cfg!(target_os = "linux") {
            "linux"
        } else {
            "unknown"
        };
        let report = serde_json::json!({
            "format": "nova-build-report", "version": 2, "engineVersion": ENGINE_VERSION,
            "buildId": "fixture", "createdAt": 0, "target": target,
            "architecture": std::env::consts::ARCH, "profile": "release", "runtimeMode": "game", "projectId": "fixture",
            "cacheMode": "clean", "totalBytes": executable.metadata().unwrap().len(),
            "files": [{ "path": "NetworkGame.exe", "sha256": file_hash(&executable).unwrap(), "bytes": executable.metadata().unwrap().len() }]
        });
        fs::write(
            directory.join("nova-build-report.json"),
            serde_json::to_vec(&report).unwrap(),
        )
        .unwrap();
        validate_network_player_build(&executable, &directory).unwrap();
        let mut tampered = fs::read(&executable).unwrap();
        tampered[0] ^= 0xff;
        fs::write(&executable, tampered).unwrap();
        assert!(validate_network_player_build(&executable, &directory)
            .unwrap_err()
            .contains("hash and byte count"));
        fs::remove_dir_all(directory).unwrap();
    }

    // 验证导出路径无法跳出用户选定目录。
    #[test]
    fn export_paths_cannot_escape_the_selected_directory() {
        assert!(safe_relative_path("assets/player.js").is_ok());
        assert!(safe_relative_path("../private.txt").is_err());
        assert!(safe_relative_path("C:\\private.txt").is_err());
        for path in [
            "",
            ".",
            "assets/..",
            "..\\private.txt",
            "/private.txt",
            "\\\\server\\share",
            "assets/file.txt:secret",
            "assets/file.",
            "assets/CON.txt",
            "assets/LPT1",
            "assets/COM¹.txt",
        ] {
            assert!(safe_relative_path(path).is_err(), "accepted {path:?}");
        }
        assert_eq!(
            safe_relative_path("assets\\player.js").unwrap(),
            PathBuf::from("assets/player.js")
        );
        assert!(safe_relative_path("Assets/角色/player.png").is_ok());
    }

    // 验证增量写入跳过相同字节并替换改变内容。
    #[test]
    fn incremental_writer_skips_identical_content_and_replaces_changes() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "nova-a-incremental-test-{}-{unique}",
            std::process::id()
        ));
        let path = directory.join("nested/build.dat");
        assert!(write_incremental(&path, b"first", true).unwrap());
        assert!(!write_incremental(&path, b"first", true).unwrap());
        assert!(write_incremental(&path, b"second", true).unwrap());
        assert_eq!(fs::read(&path).unwrap(), b"second");
        fs::remove_dir_all(directory).unwrap();
    }

    // 验证播放器先完整暂存再替换旧构建。
    #[test]
    fn embedded_player_publish_is_staged_before_replacing_the_previous_build() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "nova-a-player-publish-test-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&directory).unwrap();
        let source = directory.join("editor-source.bin");
        let destination = directory.join("Game.exe");
        fs::write(&source, b"player-prefix").unwrap();
        let published = publish_embedded_player(
            &source,
            &destination,
            b"NOVAPAK\0first",
            "11111111111111111111111111111111",
        )
        .unwrap();
        assert_eq!(published, destination);
        assert_eq!(
            embedded_package(&destination).unwrap().as_deref(),
            Some(b"NOVAPAK\0first".as_slice())
        );
        assert!(!directory.read_dir().unwrap().any(/* 在当前宏表达式中计算 entry . unwrap () . path () . extension () . is_some_and (| value | value == "nova-staging")，供查询映射、过滤或断言使用。 */ |entry| entry
            .unwrap()
            .path()
            .extension()
            .is_some_and(/* 在当前宏表达式中计算 value == "nova-staging"，供查询映射、过滤或断言使用。 */ |value| value == "nova-staging")));
        fs::remove_dir_all(directory).unwrap();
    }

    // 验证被 Windows 锁定的播放器使用版本化后备文件。
    #[cfg(windows)]
    #[test]
    fn locked_windows_player_uses_a_versioned_fallback_instead_of_failing() {
        use std::os::windows::fs::OpenOptionsExt;

        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "nova-a-player-lock-test-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&directory).unwrap();
        let source = directory.join("editor-source.bin");
        let destination = directory.join("Game.exe");
        fs::write(&source, b"player-prefix").unwrap();
        fs::write(&destination, b"running-old-build").unwrap();
        let lock = OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&destination)
            .unwrap();
        let published = publish_embedded_player(
            &source,
            &destination,
            b"NOVAPAK\0replacement",
            "abcdef1234567890abcdef1234567890",
        )
        .unwrap();
        assert_ne!(published, destination);
        assert_eq!(published.file_name().unwrap(), "Game-abcdef12.exe");
        assert_eq!(
            embedded_package(&published).unwrap().as_deref(),
            Some(b"NOVAPAK\0replacement".as_slice())
        );
        drop(lock);
        fs::remove_dir_all(directory).unwrap();
    }

    // 验证超大 Base64 构建数据在解码前被拒绝。
    #[test]
    fn bounded_base64_rejects_oversized_build_data_before_decoding() {
        let oversized = base64::engine::general_purpose::STANDARD.encode([7_u8; 33]);
        assert_eq!(
            decode_base64_limited(&oversized, 33, "fixture")
                .unwrap()
                .len(),
            33
        );
        assert!(decode_base64_limited(&oversized, 32, "fixture")
            .unwrap_err()
            .contains("safety limit"));
    }

    // 验证构建哈希稳定且能检测内容改变。
    #[test]
    fn build_hashes_are_stable_and_sensitive_to_content() {
        assert_eq!(sha256_hex(b"Nova_A"), sha256_hex(b"Nova_A"));
        assert_ne!(sha256_hex(b"Nova_A"), sha256_hex(b"Nova_B"));
    }

    // 验证工程事务先暂存全部文件才替换手工保存。
    #[test]
    fn project_transaction_stages_every_file_before_replacing_the_manual_save() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "nova-a-transaction-test-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&directory).unwrap();
        let project_path = directory.join("project.nova");
        fs::write(&project_path, b"last-manual-save").unwrap();
        let encoded = /* 计算并返回 base64 :: engine :: general_purpose :: STANDARD . encode (bytes)，用于当前 project_transaction_stages_every_file_before_replacing_the_manual_save 流程。 */ |bytes: &[u8]| base64::engine::general_purpose::STANDARD.encode(bytes);
        let invalid = ProjectTransactionRequest {
            project_directory: directory.to_string_lossy().into_owned(),
            transaction_id: "fault-before-commit".into(),
            files: vec![
                ProjectTransactionFile {
                    path: "project.nova".into(),
                    data_base64: encoded(b"new-project"),
                    checksum: sha256_hex(b"new-project"),
                },
                ProjectTransactionFile {
                    path: "ProjectSettings/project.json".into(),
                    data_base64: encoded(b"settings"),
                    checksum: sha256_hex(b"wrong"),
                },
            ],
        };
        assert!(commit_project_transaction(invalid).is_err());
        assert_eq!(fs::read(&project_path).unwrap(), b"last-manual-save");

        let valid = ProjectTransactionRequest {
            project_directory: directory.to_string_lossy().into_owned(),
            transaction_id: "verified-commit".into(),
            files: vec![
                ProjectTransactionFile {
                    path: "project.nova".into(),
                    data_base64: encoded(b"new-project"),
                    checksum: sha256_hex(b"new-project"),
                },
                ProjectTransactionFile {
                    path: "ProjectSettings/project.json".into(),
                    data_base64: encoded(b"settings"),
                    checksum: sha256_hex(b"settings"),
                },
            ],
        };
        let result = commit_project_transaction(valid).unwrap();
        assert_eq!(result.committed_files, 2);
        assert_eq!(fs::read(&project_path).unwrap(), b"new-project");
        assert_eq!(
            fs::read(directory.join("ProjectSettings/project.json")).unwrap(),
            b"settings"
        );
        assert!(fs::read_to_string(result.journal_path)
            .unwrap()
            .contains("\"phase\": \"committed\""));
        fs::remove_dir_all(directory).unwrap();
    }

    // 验证非法 Android 标识和设备序列号被严格拒绝。
    #[test]
    fn android_identifiers_and_device_serials_fail_closed() {
        assert!(valid_android_identifier("top.whitelists.novaa"));
        assert!(valid_android_identifier("org.example.game_2"));
        assert!(!valid_android_identifier("single"));
        assert!(!valid_android_identifier("top.2game"));
        assert!(!valid_android_identifier("top.white-lists.game"));
        assert!(!valid_android_identifier("top..game"));
        assert!(valid_android_serial("emulator-5554"));
        assert!(valid_android_serial("192.168.1.5:5555"));
        assert!(!valid_android_serial(""));
        assert!(!valid_android_serial("device;shutdown"));
        assert!(!valid_android_serial("device with spaces"));
    }

    // 验证 Android 清单中的展示元数据正确转义 XML。
    #[test]
    fn android_manifest_metadata_is_xml_escaped() {
        assert_eq!(
            xml_escape("Nova <A> & \"Whitelist\"'s"),
            "Nova &lt;A&gt; &amp; &quot;Whitelist&quot;&apos;s"
        );
    }
}
