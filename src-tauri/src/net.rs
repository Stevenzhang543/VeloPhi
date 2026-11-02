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
    let result = std::process::Command::new("xdg-open").arg(url).spawn();
    result.map(|_| ()).map_err(|e| e.to_string())
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
}
