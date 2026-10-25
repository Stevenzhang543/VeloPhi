//! Verity desktop shell. The whole application (solver, editor, formulas, export) is the web front end;
//! the shell only hosts it in WebView2 and provides native open/save dialogs and file writes for the
//! paths the user picks in those dialogs.

/// Report file of the release self-check (26.51): `verity.exe --selftest <file>`; None in normal use.
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

/// Start the desktop app: register the dialog and file-system plugins and run the Tauri event loop.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![selftest_target, selftest_report])
        .run(tauri::generate_context!())
        .expect("error while running Verity");
}
