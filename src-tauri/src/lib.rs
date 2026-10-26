//! VeloPhi desktop shell. The whole application (solver, editor, formulas, export) is the web front end;
//! the shell only hosts it in WebView2 and provides native open/save dialogs and file writes for the
//! paths the user picks in those dialogs.
//!
//! Startup (26.52, D54): the main window is created hidden with the dark background of the opening screen and
//! is maximised and shown only when the page has loaded, so no white or small window appears first. A timer
//! shows it anyway after a few seconds should the page never report.

use std::time::Duration;
use tauri::webview::PageLoadEvent;
use tauri::Manager;

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
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![selftest_target, selftest_report])
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
