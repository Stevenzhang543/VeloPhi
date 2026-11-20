//! VeloPhi desktop shell. The interface (editor, formulas, export) is the web front end in WebView2 (Windows) or
//! WebKitGTK (Linux, 26.65); the shell
//! provides native open/save dialogs and file writes for the paths the user picks in them, and (26.53, D68) runs the
//! Rust physics core natively: simulations in their own threads, streamed to the page as raw delta containers over a
//! Tauri channel, and rebuilds of evicted chunks (`engine_*` commands, engine/velophi-native). The page falls back to
//! the WebAssembly core in a Web Worker when these commands are unavailable; both give the same bits.
//!
//! Startup (26.52, D54): the main window is created hidden with the dark background of the opening screen and
//! is maximised and shown only when the page has loaded, so no white or small window appears first. A timer
//! shows it anyway after a few seconds should the page never report.

mod net;
mod update;

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

/// An HTTP request of the AI features and the app sign-in (26.59, D149): no CORS, system proxy, https only.
#[tauri::command]
async fn net_request(request: net::NetRequest) -> Result<net::NetResponse, String> {
    net::request(request).await
}

/// Open an https page (the sign-in approval page) in the default browser (26.59, D150).
#[tauri::command]
fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    return net::open_in_browser_mobile(&app, &url);
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let _ = app;
        net::open_in_browser(&url)
    }
}

/// Maximise and show a hidden window (once; later calls do nothing).
fn reveal<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    if window.is_visible().unwrap_or(true) {
        return;
    }
    // Phones have no window to maximise (the Android window is always full screen)
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
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

/// Defaults for WebKitGTK (Linux, 26.65, D298) that a variable already set always overrides:
/// - `WEBKIT_DISABLE_DMABUF_RENDERER=1`: the DMABUF renderer leaves the window blank with the proprietary NVIDIA
///   driver and in several virtual machines (tauri-apps/tauri#9394, WebKit bug 261874). The interface draws with
///   Canvas2D and needs no faster path; `WEBKIT_DISABLE_DMABUF_RENDERER=0` turns it back on.
/// - with the NVIDIA driver on Wayland also `__NV_DISABLE_EXPLICIT_SYNC=1` (Wayland "Error 71").
/// - `VELOPHI_SAFE_GRAPHICS=1` (README: for a blank, flickering or crashing window) also turns off WebKit's
///   accelerated compositing (`WEBKIT_DISABLE_COMPOSITING_MODE=1`).
#[cfg(any(target_os = "linux", test))]
fn linux_graphics_defaults(nvidia: bool, wayland: bool, safe: bool) -> Vec<(&'static str, &'static str)> {
    let mut vars = vec![("WEBKIT_DISABLE_DMABUF_RENDERER", "1")];
    if nvidia && wayland {
        vars.push(("__NV_DISABLE_EXPLICIT_SYNC", "1"));
    }
    if safe {
        vars.push(("WEBKIT_DISABLE_COMPOSITING_MODE", "1"));
    }
    vars
}

/// WebKitGTK takes the page's language (`navigator.language`, and the default locale of `Intl`) from the character
/// classification locale. Under `C.UTF-8` (the default of containers, WSL and many minimal installations) it reports
/// the language "C", and the interface then never starts (found by the 26.65 self-check: the opening screen stays,
/// nothing fails visibly). Plain `C`/`POSIX` gives "en-US" and works. So when that locale is a C/POSIX one with a
/// code set or modifier, its character classification alone becomes plain `C` (an `LC_ALL` of that kind is moved to
/// `LANG` first, as `LC_ALL` would override it); every other category keeps its value. The interface then follows
/// the system language "en-US" (or the language chosen in the settings). Returns (name, value or None = remove).
#[cfg(any(target_os = "linux", test))]
fn c_locale_fix(lc_all: Option<&str>, lc_ctype: Option<&str>, lang: Option<&str>) -> Vec<(&'static str, Option<String>)> {
    let set = |v: Option<&str>| v.map(str::trim).filter(|v| !v.is_empty()).map(str::to_string);
    let (lc_all, lc_ctype, lang) = (set(lc_all), set(lc_ctype), set(lang));
    let effective = lc_all.clone().or(lc_ctype).or(lang);
    let Some(value) = effective else { return Vec::new() };
    let language = value.split(['.', '@']).next().unwrap_or("");
    let c_like = language.eq_ignore_ascii_case("C") || language.eq_ignore_ascii_case("POSIX");
    if !c_like || value.eq_ignore_ascii_case("C") || value.eq_ignore_ascii_case("POSIX") {
        return Vec::new();
    }
    match lc_all {
        Some(all) => vec![("LC_ALL", None), ("LANG", Some(all)), ("LC_CTYPE", Some("C".into()))],
        None => vec![("LC_CTYPE", Some("C".into()))],
    }
}

/// Set the defaults above. Must run before GTK, WebKit or any thread starts: first thing in `run()`.
#[cfg(target_os = "linux")]
fn apply_linux_defaults() {
    let nvidia = std::path::Path::new("/proc/driver/nvidia/version").exists();
    let wayland = std::env::var("XDG_SESSION_TYPE").as_deref() == Ok("wayland") || std::env::var_os("WAYLAND_DISPLAY").is_some();
    let safe = std::env::var("VELOPHI_SAFE_GRAPHICS").as_deref() == Ok("1");
    for (key, value) in linux_graphics_defaults(nvidia, wayland, safe) {
        if std::env::var_os(key).is_none() {
            std::env::set_var(key, value);
        }
    }
    let var = |k: &str| std::env::var(k).ok();
    for (key, value) in c_locale_fix(var("LC_ALL").as_deref(), var("LC_CTYPE").as_deref(), var("LANG").as_deref()) {
        match value {
            Some(v) => std::env::set_var(key, v),
            None => std::env::remove_var(key),
        }
    }
}

/// Start the app (desktop, and the Android app since 26.59): register the plugins and run the Tauri event loop.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    apply_linux_defaults();
    migrate_old_profile();
    let engine = Arc::new(velophi_native::Engine::new());
    let on_close = Arc::clone(&engine);
    let builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_fs::init());
    // Android (26.59, D176): links to the sign-in page open in the phone's browser
    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder.plugin(tauri_plugin_opener::init());
    builder
        .manage(NativeEngine(engine))
        .invoke_handler(tauri::generate_handler![selftest_target, selftest_report, engine_info, engine_run_start, engine_run_control, engine_rebuild, net_request, open_external, update::update_check, update::update_download, update::update_cancel, update::update_install, update::update_open_page, update::update_cleanup, update::update_show_file])
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linux_graphics() {
        // Always the DMABUF renderer off; the NVIDIA Wayland variable only there; compositing only when asked for
        assert_eq!(linux_graphics_defaults(false, false, false), vec![("WEBKIT_DISABLE_DMABUF_RENDERER", "1")]);
        assert_eq!(linux_graphics_defaults(true, false, false), vec![("WEBKIT_DISABLE_DMABUF_RENDERER", "1")]);
        assert_eq!(linux_graphics_defaults(false, true, false), vec![("WEBKIT_DISABLE_DMABUF_RENDERER", "1")]);
        assert_eq!(linux_graphics_defaults(true, true, false), vec![("WEBKIT_DISABLE_DMABUF_RENDERER", "1"), ("__NV_DISABLE_EXPLICIT_SYNC", "1")]);
        assert_eq!(linux_graphics_defaults(false, false, true), vec![("WEBKIT_DISABLE_DMABUF_RENDERER", "1"), ("WEBKIT_DISABLE_COMPOSITING_MODE", "1")]);
    }

    #[test]
    fn c_locale() {
        let c = Some("C".to_string());
        // C.UTF-8 and its spellings, from LANG or LC_CTYPE: only the character classification becomes plain C
        for v in ["C.UTF-8", "C.utf8", "c.UTF-8", "POSIX.UTF-8", "C@euro"] {
            assert_eq!(c_locale_fix(None, None, Some(v)), vec![("LC_CTYPE", c.clone())], "{v}");
            assert_eq!(c_locale_fix(None, Some(v), Some("zh_CN.UTF-8")), vec![("LC_CTYPE", c.clone())], "{v}");
        }
        // LC_ALL overrides LC_CTYPE: its value moves to LANG
        assert_eq!(c_locale_fix(Some("C.UTF-8"), Some("zh_CN.UTF-8"), Some("de_DE.UTF-8")), vec![("LC_ALL", None), ("LANG", Some("C.UTF-8".into())), ("LC_CTYPE", c.clone())]);
        // Real languages, plain C/POSIX and no locale at all are left alone (WebKit reports a usable language)
        for (all, ctype, lang) in [(None, None, Some("zh_CN.UTF-8")), (None, None, Some("en_US.UTF-8")), (None, None, Some("de_DE.UTF-8")), (None, None, Some("C")), (None, None, Some("POSIX")), (None, None, None), (Some(""), Some(""), Some("")), (Some("zh_CN.UTF-8"), None, Some("C.UTF-8")), (None, Some("C"), Some("C.UTF-8")), (None, Some("en_GB.UTF-8"), Some("C.UTF-8"))] {
            assert!(c_locale_fix(all, ctype, lang).is_empty(), "{all:?} {ctype:?} {lang:?}");
        }
    }
}
