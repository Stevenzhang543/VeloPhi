//! Network requests of the AI features (26.59, D149): the official AI and sign-in at velophi.whitelists.top and the
//! user's own AI provider (OpenAI-compatible or Anthropic). They run here, not in the page, so no provider needs to
//! allow cross-origin requests, and the system proxy of Windows is used (reqwest `system-proxy`). On Android the same
//! requests use rustls with the Mozilla root certificates (D176).
//!
//! Only `https://` URLs are allowed, plus plain `http://` to this computer (local models such as Ollama or LM Studio).
//! Request and response bodies are text (JSON); responses are cut at 16 MB.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

const MAX_RESPONSE: usize = 16 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetRequest {
    url: String,
    #[serde(default = "default_method")]
    method: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    timeout_ms: Option<u64>,
    /// Optional HTTP(S) proxy for this request (e.g. "http://127.0.0.1:7890"); empty = system proxy.
    #[serde(default)]
    proxy: Option<String>,
}

fn default_method() -> String {
    "GET".into()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetResponse {
    status: u16,
    content_type: String,
    retry_after: Option<String>,
    body: String,
}

/// Whether a URL may be requested: https anywhere, http only to this computer.
pub fn allowed_url(url: &str) -> bool {
    let Ok(u) = reqwest::Url::parse(url) else { return false };
    match u.scheme() {
        "https" => u.host_str().is_some(),
        "http" => matches!(u.host_str(), Some("localhost") | Some("127.0.0.1") | Some("[::1]")),
        _ => false,
    }
}

/// Whether a URL may be opened in the browser (sign-in pages): https with a host and no control or quote characters.
pub fn allowed_open(url: &str) -> bool {
    url.len() <= 2048
        && !url.chars().any(|c| c.is_control() || c == '"' || c == '\'' || c == '`' || c == ' ')
        && reqwest::Url::parse(url).map(|u| u.scheme() == "https" && u.host_str().is_some()).unwrap_or(false)
}

/// Desktop: native TLS of the system (SChannel on Windows) and its proxy settings.
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn client_builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
}

/// Phone (26.59, D176): rustls with the ring provider and the Mozilla root certificates (webpki-roots).
#[cfg(any(target_os = "android", target_os = "ios"))]
fn client_builder() -> reqwest::ClientBuilder {
    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let provider = std::sync::Arc::new(rustls::crypto::ring::default_provider());
    let mut tls = rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .expect("TLS 1.2/1.3 with ring")
        .with_root_certificates(roots)
        .with_no_client_auth();
    tls.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];
    reqwest::Client::builder().tls_backend_preconfigured(tls)
}

pub async fn request(req: NetRequest) -> Result<NetResponse, String> {
    if !allowed_url(&req.url) {
        return Err("only https:// addresses (or http:// on this computer) are allowed".into());
    }
    let timeout = Duration::from_millis(req.timeout_ms.unwrap_or(120_000).clamp(1_000, 600_000));
    let mut builder = client_builder().timeout(timeout).connect_timeout(Duration::from_secs(15)).user_agent(concat!("VeloPhi/", env!("CARGO_PKG_VERSION")));
    if let Some(p) = req.proxy.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        let proxy = reqwest::Proxy::all(p).map_err(|e| format!("proxy: {e}"))?;
        builder = builder.proxy(proxy);
    }
    let client = builder.build().map_err(|e| e.to_string())?;
    let method = reqwest::Method::from_bytes(req.method.to_uppercase().as_bytes()).map_err(|_| "invalid method".to_string())?;
    let mut rb = client.request(method, &req.url);
    for (k, v) in &req.headers {
        rb = rb.header(k.as_str(), v.as_str());
    }
    if let Some(body) = req.body {
        rb = rb.body(body);
    }
    let resp = rb.send().await.map_err(describe)?;
    let status = resp.status().as_u16();
    let header = |name: &str| resp.headers().get(name).and_then(|v| v.to_str().ok()).map(str::to_string);
    let content_type = header("content-type").unwrap_or_default();
    let retry_after = header("retry-after");
    let bytes = resp.bytes().await.map_err(describe)?;
    if bytes.len() > MAX_RESPONSE {
        return Err("response too large".into());
    }
    Ok(NetResponse { status, content_type, retry_after, body: String::from_utf8_lossy(&bytes).into_owned() })
}

/// A short, user-facing reason (timeout / connection / other), without the request (which may carry a key).
fn describe(e: reqwest::Error) -> String {
    if e.is_timeout() {
        "timeout".into()
    } else if e.is_connect() {
        "connect".into()
    } else {
        format!("network: {}", e.without_url())
    }
}

/// Open an https URL in the default browser.
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn open_in_browser(url: &str) -> Result<(), String> {
    if !allowed_open(url) {
        return Err("only plain https:// addresses can be opened".into());
    }
    #[cfg(windows)]
    let result = {
        use std::os::windows::process::CommandExt;
        // rundll32 hands the URL to the registered browser without going through a command shell.
        std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", url]).creation_flags(0x0800_0000).spawn()
    };
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = {
        // The host's xdg-open and browser, without the libraries of an AppImage (26.65)
        let mut command = std::process::Command::new("xdg-open");
        clean_appimage_env(&mut command);
        command.arg(url).spawn()
    };
    result.map(|_| ()).map_err(|e| e.to_string())
}

/// Show a local folder in the file manager (Linux: the folder of an update to be installed by hand).
#[cfg(target_os = "linux")]
pub fn open_folder(folder: &std::path::Path) -> Result<(), String> {
    if !folder.is_absolute() || !folder.is_dir() {
        return Err("not a folder".into());
    }
    let mut command = std::process::Command::new("xdg-open");
    clean_appimage_env(&mut command);
    command.arg(folder).spawn().map(|_| ()).map_err(|e| format!("io: {e}"))
}

/// Inside an AppImage (26.65) the runtime and the hooks of the bundled GTK and GStreamer point a series of variables
/// at the AppImage's mount (`$APPDIR`): `LD_LIBRARY_PATH`, `GTK_PATH`, `GDK_PIXBUF_MODULE_FILE`, `GST_PLUGIN_*`, `PATH`,
/// `XDG_DATA_DIRS` and more (the list depends on the plugins, so it is not written out here). A program of the host
/// (xdg-open, the browser) or a new AppImage started with them inherited would load the bundled libraries — and crash
/// once this process exits and the mount goes away. The changes: the runtime's own variables go (`APPDIR`, `APPIMAGE`,
/// `ARGV0`, `OWD`), and `GTK_THEME`, which the GTK hook always overwrites with plain Adwaita (the user's own value is
/// gone by then; without it the host program uses the desktop's theme again); in every other variable whose value
/// names the mount, the `:`-separated entries inside it go, and the variable goes when nothing is left. Nothing
/// changes outside an AppImage. Returns (name, new value or None = remove).
#[cfg(any(all(unix, not(any(target_os = "macos", target_os = "android", target_os = "ios"))), test))]
pub fn appimage_env_changes(vars: &[(String, String)]) -> Vec<(String, Option<String>)> {
    let appdir = vars.iter().find(|(k, _)| k == "APPDIR").map(|(_, v)| v.trim_end_matches('/').to_string()).unwrap_or_default();
    // "/" or nothing: not a mount this could be about
    if appdir.len() < 2 || !appdir.starts_with('/') {
        return Vec::new();
    }
    let inside = |entry: &str| entry == appdir || entry.strip_prefix(appdir.as_str()).is_some_and(|rest| rest.starts_with('/'));
    let mut changes = Vec::new();
    for (key, value) in vars {
        if matches!(key.as_str(), "APPDIR" | "APPIMAGE" | "ARGV0" | "OWD" | "GTK_THEME") {
            changes.push((key.clone(), None));
        } else if value.contains(appdir.as_str()) {
            let kept: Vec<&str> = value.split(':').filter(|e| !e.is_empty() && !inside(e)).collect();
            changes.push((key.clone(), (!kept.is_empty()).then(|| kept.join(":"))));
        }
    }
    changes
}

/// Apply `appimage_env_changes` to a command about to be started (variables that are not UTF-8 are left alone).
#[cfg(all(unix, not(any(target_os = "macos", target_os = "android", target_os = "ios"))))]
pub fn clean_appimage_env(command: &mut std::process::Command) {
    let vars: Vec<(String, String)> = std::env::vars_os().filter_map(|(k, v)| Some((k.into_string().ok()?, v.into_string().ok()?))).collect();
    for (key, value) in appimage_env_changes(&vars) {
        match value {
            Some(v) => command.env(key, v),
            None => command.env_remove(key),
        };
    }
}

/// Phone: the system browser through the opener plugin.
#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn open_in_browser_mobile<R: tauri::Runtime>(app: &tauri::AppHandle<R>, url: &str) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    if !allowed_open(url) {
        return Err("only plain https:// addresses can be opened".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_rules() {
        assert!(allowed_url("https://api.deepseek.com/chat/completions"));
        assert!(allowed_url("http://127.0.0.1:11434/v1/chat/completions"));
        assert!(allowed_url("http://localhost:1234/v1/models"));
        assert!(!allowed_url("http://api.example.com/x"));
        assert!(!allowed_url("file:///etc/passwd"));
        assert!(!allowed_url("ftp://x"));
        assert!(allowed_open("https://velophi.whitelists.top/account/device.html?code=BCDF-GHJK"));
        assert!(!allowed_open("https://x.test/a b"));
        assert!(!allowed_open("https://x.test/\"&calc"));
        assert!(!allowed_open("http://x.test/"));
        assert!(!allowed_open("javascript:alert(1)"));
    }

    /// The environment of the AppImage as its AppRun and the GTK/GStreamer hooks set it (names and forms from
    /// squashfs-root/apprun-hooks of the built file and from the running program's environment), started from a mount
    /// and with --appimage-extract-and-run.
    #[test]
    fn appimage_environment() {
        let env = |pairs: &[(&str, &str)]| pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect::<Vec<_>>();
        let changes = |pairs: &[(&str, &str)]| {
            let mut c = appimage_env_changes(&env(pairs));
            c.sort();
            c
        };
        let m = "/tmp/.mount_VeloPhAbC123";
        let inside = env(&[
            ("APPDIR", m),
            ("APPIMAGE", "/home/u/Apps/VeloPhi-v26.65-linux-x86_64.AppImage"),
            ("ARGV0", "./VeloPhi-v26.65-linux-x86_64.AppImage"),
            ("OWD", "/home/u/Apps"),
            ("PATH", &format!("{m}/usr/bin:/usr/local/bin:/usr/bin:/bin")),
            ("LD_LIBRARY_PATH", &format!("{m}/usr/lib/:{m}/usr/lib/x86_64-linux-gnu/:/opt/mine/lib")),
            ("XDG_DATA_DIRS", &format!("{m}/usr/share:/usr/share:/usr/local/share:/usr/share")),
            ("GTK_DATA_PREFIX", m),
            ("GTK_EXE_PREFIX", &format!("{m}/usr")),
            ("GTK_PATH", &format!("{m}/usr/lib/gtk-3.0")),
            ("GTK_IM_MODULE_FILE", &format!("{m}/usr/lib/gtk-3.0/3.0.0/immodules.cache")),
            ("GDK_PIXBUF_MODULE_FILE", &format!("{m}/usr/lib/gdk-pixbuf-2.0/2.10.0/loaders.cache")),
            ("GSETTINGS_SCHEMA_DIR", &format!("{m}/usr/share/glib-2.0/schemas")),
            ("GIO_MODULE_DIR", &format!("{m}/usr/lib/gio/modules")),
            ("GST_PLUGIN_SYSTEM_PATH_1_0", &format!("{m}/usr/lib/gstreamer-1.0")),
            ("GST_PLUGIN_SCANNER_1_0", &format!("{m}/usr/lib/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner")),
            // The GTK hook writes "$APPDIR//usr/…" (two slashes) and forces plain Adwaita
            ("GI_TYPELIB_PATH", &format!("{m}//usr/lib/girepository-1.0")),
            ("GTK_THEME", "Adwaita:light"),
            ("PYTHONHOME", &format!("{m}/usr/")),
            ("GST_REGISTRY_REUSE_PLUGIN_SCANNER", "no"),
            ("HOME", "/home/u"),
            ("LANG", "zh_CN.UTF-8"),
            ("APPIMAGE_EXTRACT_AND_RUN", "1"),
            // A mount whose name merely starts like this one is another mount
            ("OTHER", &format!("{m}x/usr/lib:/usr/lib")),
        ]);
        let mut got = appimage_env_changes(&inside);
        got.sort();
        let some = |s: &str| Some(s.to_string());
        let mut want: Vec<(String, Option<String>)> = vec![
            ("APPDIR".into(), None),
            ("APPIMAGE".into(), None),
            ("ARGV0".into(), None),
            ("OWD".into(), None),
            ("PATH".into(), some("/usr/local/bin:/usr/bin:/bin")),
            ("LD_LIBRARY_PATH".into(), some("/opt/mine/lib")),
            ("XDG_DATA_DIRS".into(), some("/usr/share:/usr/local/share:/usr/share")),
            ("GTK_DATA_PREFIX".into(), None),
            ("GTK_EXE_PREFIX".into(), None),
            ("GTK_PATH".into(), None),
            ("GTK_IM_MODULE_FILE".into(), None),
            ("GDK_PIXBUF_MODULE_FILE".into(), None),
            ("GSETTINGS_SCHEMA_DIR".into(), None),
            ("GIO_MODULE_DIR".into(), None),
            ("GST_PLUGIN_SYSTEM_PATH_1_0".into(), None),
            ("GST_PLUGIN_SCANNER_1_0".into(), None),
            ("GI_TYPELIB_PATH".into(), None),
            ("GTK_THEME".into(), None),
            ("PYTHONHOME".into(), None),
            ("OTHER".into(), some(&format!("{m}x/usr/lib:/usr/lib"))),
        ];
        want.sort();
        assert_eq!(got, want);
        // --appimage-extract-and-run: the same with the extraction folder (a trailing slash in APPDIR is the same)
        let x = "/tmp/appimage_extracted_0123abcd";
        assert_eq!(changes(&[("APPDIR", &format!("{x}/")), ("PATH", &format!("{x}/usr/bin:/usr/bin")), ("HOME", "/home/u")]), vec![("APPDIR".into(), None), ("PATH".into(), some("/usr/bin"))]);
        // Lines as /proc/<pid>/environ of the program showed them (2026-11-19, the 26.64 test build run with
        // --appimage-extract-and-run): the classic AppRun adds trailing empty entries and Python/Perl/Qt paths
        let mut real = changes(&[
            ("APPDIR", x),
            ("GSETTINGS_SCHEMA_DIR", &format!("{x}/usr/share/glib-2.0/schemas/:{x}//usr/share/glib-2.0/schemas")),
            ("GST_PLUGIN_SYSTEM_PATH", &format!("{x}/usr/lib/gstreamer:")),
            ("PERLLIB", &format!("{x}/usr/share/perl5/:{x}/usr/lib/perl5/:")),
            ("PYTHONPATH", &format!("{x}/usr/share/pyshared/:")),
            ("QT_PLUGIN_PATH", &format!("{x}/usr/lib/qt4/plugins/:{x}/usr/lib/i386-linux-gnu/qt4/plugins/:")),
            ("XDG_DATA_DIRS", &format!("{x}/usr/share/:{x}/usr/share:/usr/share:")),
            ("PYTHONDONTWRITEBYTECODE", "1"),
            ("GDK_BACKEND", "x11"),
        ]);
        real.sort();
        let mut want_real: Vec<(String, Option<String>)> = ["APPDIR", "GSETTINGS_SCHEMA_DIR", "GST_PLUGIN_SYSTEM_PATH", "PERLLIB", "PYTHONPATH", "QT_PLUGIN_PATH"].iter().map(|k| (k.to_string(), None)).collect();
        want_real.push(("XDG_DATA_DIRS".into(), some("/usr/share")));
        want_real.sort();
        assert_eq!(real, want_real);
        // Outside an AppImage (deb, rpm, a build of one's own) nothing changes, also not the user's GTK_THEME
        assert!(changes(&[("PATH", "/usr/bin:/bin"), ("GTK_THEME", "Adwaita:dark"), ("APPIMAGE", "/x")]).is_empty());
        assert!(changes(&[("APPDIR", "/"), ("PATH", "/usr/bin")]).is_empty());
        assert!(changes(&[("APPDIR", ""), ("PATH", "/usr/bin")]).is_empty());
        assert!(changes(&[("APPDIR", "relative/dir"), ("PATH", "relative/dir/bin")]).is_empty());
    }
}
