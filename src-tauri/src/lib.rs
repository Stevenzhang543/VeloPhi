//! Verity desktop shell. The whole application (solver, editor, formulas, export) is the web front end;
//! the shell only hosts it in WebView2 and provides native open/save dialogs and file writes for the
//! paths the user picks in those dialogs.

/// Start the desktop app: register the dialog and file-system plugins and run the Tauri event loop.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running Verity");
}
