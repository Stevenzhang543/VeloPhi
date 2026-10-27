//! VeloPhi desktop shell. The interface (editor, formulas, export) is the web front end in WebView2; the shell
//! provides native open/save dialogs and file writes for the paths the user picks in them, and (26.53, D68) runs the
//! Rust physics core natively: simulations in their own threads, streamed to the page as raw delta containers over a
//! Tauri channel, and rebuilds of evicted chunks (`engine_*` commands, engine/velophi-native). The page falls back to
//! the WebAssembly core in a Web Worker when these commands are unavailable; both give the same bits.
//!
//! Startup (26.52, D54): the main window is created hidden with the dark background of the opening screen and
//! is maximised and shown only when the page has loaded, so no white or small window appears first. A timer
//! shows it anyway after a few seconds should the page never report.

use std::sync::Arc;
use std::time::Duration;
use tauri::ipc::{Channel, InvokeResponseBody, Response};
use tauri::webview::PageLoadEvent;
use tauri::Manager;

/// The native engine shared by the commands.
struct NativeEngine(Arc<velophi_native::Engine>);

/// Version of the native engine: `{ core, abi, threads }` (the page uses it only when `abi` is 2).
#[tauri::command]
fn engine_info() -> serde_json::Value {
    velophi_native::info()
}

/// Start a run (`{ sceneText, budgetMs, duration, lookAhead, playhead, rate }`) in its own thread; its messages
/// (framed bytes, see engine/velophi-native) go to `channel`. Returns the run's id.
#[tauri::command]
fn engine_run_start(engine: tauri::State<'_, NativeEngine>, request: serde_json::Value, channel: Channel<InvokeResponseBody>) -> u32 {
    engine.0.start(request, Box::new(move |m| channel.send(InvokeResponseBody::Raw(m)).is_ok()))
}

/// Control a run (`{ type: 'playhead' | 'computeTo' | 'lookAhead' | 'stop' | 'cancel', … }`); false when it has ended.
#[tauri::command]
fn engine_run_control(engine: tauri::State<'_, NativeEngine>, id: u32, msg: serde_json::Value) -> bool {
    velophi_native::Control::from_json(&msg).map(|c| engine.0.control(id, c)).unwrap_or(false)
}

/// Recompute an evicted chunk (`{ sceneText, duration, chunkFrames, checkpointHex, endFrame }`): the rebuild container
/// as raw bytes. Runs off the main thread.
#[tauri::command]
async fn engine_rebuild(engine: tauri::State<'_, NativeEngine>, request: serde_json::Value) -> Result<Response, String> {
    let e = Arc::clone(&engine.0);
    let r = tauri::async_runtime::spawn_blocking(move || e.rebuild(request)).await.map_err(|e| e.to_string())?;
    r.map(Response::new).map_err(|m| m.to_json().to_string())
}

/// Report file of the release self-check (26.51): `velophi.exe --selftest <file>`; None in normal use.
#[tauri::command]
fn selftest_target() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    args.iter().position(|a| a == "--selftest").and_then(|i| args.get(i + 1).cloned())
}

/// Write the self-check report to the file given with --selftest and quit (exit code 0 only when all agree).
#[tauri::command]
fn selftest_report(app: tauri::AppHandle, path: String, report: String, ok: bool) -> Result<(), String> {
    if selftest_target().as_deref() != Some(path.as_str()) {
        return Err("not started with --selftest".into());
    }
    std::fs::write(&path, report).map_err(|e| e.to_string())?;
    app.exit(if ok { 0 } else { 1 });
    Ok(())
}

/// Maximise and show a hidden window (once; later calls do nothing).
fn reveal<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    if window.is_visible().unwrap_or(true) {
        return;
    }
    let _ = window.maximize();
    let _ = window.show();
    let _ = window.set_focus();
}

/// Copy a directory tree (files that cannot be read are skipped).
#[cfg(windows)]
fn copy_tree(from: &std::path::Path, to: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else {
            let _ = std::fs::copy(entry.path(), &target);
        }
    }
    Ok(())
}

/// The settings of the app under its old name (26.52, D53). The WebView2 profile lives in
/// %LOCALAPPDATA%\<identifier>; on the first start of VeloPhi its local storage (settings and the optional trial
/// log) is copied from the Verity profile, through a temporary folder renamed at the end, so an interrupted copy
/// is simply tried again next time. Nothing is copied when VeloPhi already has a profile; the old one is kept.
#[cfg(windows)]
fn migrate_old_profile() {
    let Some(base) = std::env::var_os("LOCALAPPDATA").map(std::path::PathBuf::from) else { return };
    let old = base.join("app.verity.physics").join("EBWebView").join("Default").join("Local Storage");
    let new_root = base.join("app.velophi.physics");
    if !old.is_dir() || new_root.exists() {
        return;
    }
    let staging = base.join("app.velophi.physics.migrating");
    let _ = std::fs::remove_dir_all(&staging);
    let dest = staging.join("EBWebView").join("Default").join("Local Storage");
    if copy_tree(&old, &dest).is_ok() {
        let _ = std::fs::rename(&staging, &new_root);
    } else {
        let _ = std::fs::remove_dir_all(&staging);
    }
}

#[cfg(not(windows))]
fn migrate_old_profile() {}

/// Start the desktop app: register the dialog and file-system plugins and run the Tauri event loop.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    migrate_old_profile();
    let engine = Arc::new(velophi_native::Engine::new());
    let on_close = Arc::clone(&engine);
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(NativeEngine(engine))
        .invoke_handler(tauri::generate_handler![selftest_target, selftest_report, engine_info, engine_run_start, engine_run_control, engine_rebuild])
        .on_window_event(move |_window, event| {
            // Runs of a closed window stop at once (their channel is gone too)
            if let tauri::WindowEvent::Destroyed = event {
                on_close.cancel_all();
            }
        })
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                if let Some(window) = webview.app_handle().get_webview_window("main") {
                    reveal(&window);
                }
            }
        })
        .setup(|app| {
            // Fallback: show the window even if the page never reports that it has loaded
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(4));
                if let Some(window) = handle.get_webview_window("main") {
                    reveal(&window);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running VeloPhi");
}
