//! In-app update of the Windows desktop app and the Android app (26.64), and of the three Linux packages (26.65, D298:
//! AppImage, deb, rpm). The web build never calls these commands.
//!
//! What it does, in order:
//!  1. `update_check` asks GitHub for the latest published release of the project (one HTTPS GET, user agent
//!     `VeloPhi/<version>`, nothing else is sent) and reads from the answer which version it carries. The version comes
//!     from the names of the files the release script produces (`VeloPhi-v26.64-windows-x64-setup.exe` …), not from the
//!     tag: the maintainer tags releases by hand (`Release26.63(2026.12.13)`), and the tag is only a path component.
//!  2. `update_download` takes the tag back from the page — and nothing else. It must be the tag of the offer this
//!     process got in step 1, of a version strictly greater than the running one. The URLs are built here; only
//!     `https://github.com/Stevenzhang543/VeloPhi/releases/download/…` and GitHub's release-asset hosts are followed.
//!     The file is streamed into a fresh file of the app's cache folder (at most 400 MB), its SHA-256 computed on the
//!     way and compared with the line for that file name in the release's `SHA256SUMS.txt`. A file that does not match
//!     is deleted and never run.
//!  3. `update_install` hashes the file once more and then starts it: the NSIS installer in passive update mode
//!     (`/P /R /UPDATE`: progress window, no questions, the app is started again), or the new portable executable; the
//!     app exits. On Android it returns the file name and the page asks MainActivity to hand the file to the system
//!     installer (`window.VeloPhiAndroid.installUpdate`), which shows Android's own confirmation.
//!     Linux (26.65): the AppImage is handled like the portable executable (the new file next to `$APPIMAGE`, started
//!     with the environment of the old AppImage's mount removed); the deb and the rpm go to the system's package tool
//!     through `pkexec` (apt-get / dnf / zypper, whichever this system has), which asks for the administrator's
//!     authorisation itself. When that is not possible or not granted, the verified file is kept in the Downloads
//!     folder and the page shows the command to install it by hand. The program never handles a password.
//!
//! Trust (docs/dev/UPDATES.md): TLS to a fixed set of hosts plus the checksum file of the same release. There is no
//! signing key of our own; whoever controls the GitHub account controls what is offered. Android additionally refuses
//! an APK that is not signed with the key of the installed app.
//!
//! The pure parts (versions, release JSON, checksum file, URL rules) have unit tests at the end of this file.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use tauri::Manager;

/// The latest published release (drafts and pre-releases are never returned by this address).
const API_LATEST: &str = "https://api.github.com/repos/Stevenzhang543/VeloPhi/releases/latest";
const API_HOST: &str = "api.github.com";
const API_PATH: &str = "/repos/Stevenzhang543/VeloPhi/releases/latest";
const SITE_HOST: &str = "github.com";
/// Every download starts below this path of github.com.
const DOWNLOAD_PREFIX: &str = "/Stevenzhang543/VeloPhi/releases/download/";
const RELEASE_PAGE_PREFIX: &str = "https://github.com/Stevenzhang543/VeloPhi/releases/tag/";
const RELEASES_PAGE: &str = "https://github.com/Stevenzhang543/VeloPhi/releases/latest";
/// Hosts github.com redirects a release file to. `release-assets…` is what it answered on 2026-11-13; `objects…` is the
/// host it used before and still documents.
const ASSET_HOSTS: [&str; 2] = ["release-assets.githubusercontent.com", "objects.githubusercontent.com"];
const ASSET_PATH_PREFIX: &str = "/github-production-release-asset";
const SUMS_NAME: &str = "SHA256SUMS.txt";
const PRODUCT_PREFIX: &str = "VeloPhi-v";
/// The deliverables of scripts/package-release.ps1 that carry the version in their name. The Linux names (26.65) use
/// the architecture name of each format's own world: `amd64` for Debian, `x86_64` for rpm and AppImage. Older versions
/// of this code skip names they do not know, so adding files never breaks their update.
const SUFFIXES: [&str; 7] = ["windows-x64-setup.exe", "windows-x64-portable.exe", "android.apk", "web.zip", "linux-x86_64.AppImage", "linux-amd64.deb", "linux-x86_64.rpm"];
/// Where the deb and the rpm install the program.
#[cfg(any(target_os = "linux", test))]
const INSTALLED_EXE: &str = "/usr/bin/velophi";
const MAX_ASSET: u64 = 400 * 1024 * 1024;
const MAX_JSON: usize = 2 * 1024 * 1024;
const MAX_SUMS: usize = 256 * 1024;
const MAX_NOTES: usize = 6000;
const MAX_REDIRECTS: usize = 5;
/// Passive update of the NSIS installer Tauri builds: `/P` shows the progress and asks nothing, `/R` starts the app
/// again afterwards, `/UPDATE` keeps the existing installation in place and leaves the shortcuts as the user has them.
#[cfg(any(windows, test))]
const INSTALLER_ARGS: [&str; 3] = ["/P", "/R", "/UPDATE"];

// ---- Versions ----

/// `major.minor[.patch]`; a missing patch is 0, so 26.64 and 26.64.0 are the same version.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Version(pub u32, pub u32, pub u32);

/// "26.64" or "26.64.1" (digits and dots only, two or three parts of at most five digits).
pub fn parse_version(text: &str) -> Option<Version> {
    let mut n = [0u32; 3];
    let mut count = 0;
    for part in text.split('.') {
        if count == 3 || part.is_empty() || part.len() > 5 || !part.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        n[count] = part.parse().ok()?;
        count += 1;
    }
    (count >= 2).then_some(Version(n[0], n[1], n[2]))
}

/// The first version in a free text such as a tag: "Release26.63(2026.12.13)" → 26.63, "v26.64.1" → 26.64.1.
pub fn version_in_text(text: &str) -> Option<Version> {
    text.split(|c: char| !(c.is_ascii_digit() || c == '.')).find_map(|run| parse_version(run.trim_matches('.')))
}

/// The version as shown: "26.64", or "26.64.1" for a hot-fix.
pub fn show_version(v: Version) -> String {
    if v.2 == 0 {
        format!("{}.{}", v.0, v.1)
    } else {
        format!("{}.{}.{}", v.0, v.1, v.2)
    }
}

/// The running version. For trying the update out (docs/dev/UPDATES.md) the environment variable
/// `VELOPHI_UPDATE_FAKE_VERSION` can make a desktop build believe it is older than it is — only older, and every other
/// check stays as it is.
fn current_version() -> Version {
    let real = parse_version(env!("CARGO_PKG_VERSION")).unwrap_or(Version(0, 0, 0));
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    if let Some(fake) = std::env::var("VELOPHI_UPDATE_FAKE_VERSION").ok().as_deref().and_then(parse_version) {
        if fake < real {
            return fake;
        }
    }
    real
}

// ---- What this build can install ----

/// How this copy of the app is updated (each target constructs only its own variants).
#[allow(dead_code)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    /// Installed with the NSIS installer: the new installer replaces it.
    Installer,
    /// A single executable run from wherever the user keeps it: the new one is put next to it.
    Portable,
    /// The Android app: the APK goes to the system installer.
    Android,
    /// Linux, a single AppImage file kept wherever the user likes: like the portable executable.
    #[serde(rename = "appimage")]
    AppImage,
    /// Linux, installed from the deb: the new deb goes to the system's package tool.
    Deb,
    /// Linux, installed from the rpm: the new rpm goes to the system's package tool.
    Rpm,
    /// Any other build (one built by hand, Flatpak or Snap): the release page in the browser.
    Other,
}

impl Kind {
    fn suffix(self) -> Option<&'static str> {
        match self {
            Kind::Installer => Some(SUFFIXES[0]),
            Kind::Portable => Some(SUFFIXES[1]),
            Kind::Android => Some(SUFFIXES[2]),
            Kind::AppImage => Some(SUFFIXES[4]),
            Kind::Deb => Some(SUFFIXES[5]),
            Kind::Rpm => Some(SUFFIXES[6]),
            Kind::Other => None,
        }
    }
}

/// Installed or portable (Windows): the installer writes its folder to
/// `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\VeloPhi` (`InstallLocation`; HKLM for a per-machine
/// installation). The app is the installed one exactly when its executable lies in that folder; a portable copy kept
/// anywhere else stays portable even while another copy is installed.
#[cfg(windows)]
fn detect_kind() -> Kind {
    let Some(dir) = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf)) else { return Kind::Portable };
    for root in [windows_registry::CURRENT_USER, windows_registry::LOCAL_MACHINE] {
        let location = root.open(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\VeloPhi").and_then(|k| k.get_string("InstallLocation"));
        if let Ok(location) = location {
            if same_dir(&dir, Path::new(location.trim().trim_matches('"'))) {
                return Kind::Installer;
            }
        }
    }
    Kind::Portable
}

#[cfg(target_os = "android")]
fn detect_kind() -> Kind {
    Kind::Android
}

/// Linux (26.65): the bundler patches the package form into the executable when it packages it
/// (`tauri::utils::platform::bundle_type()`), so the three files of a release each know what they are.
#[cfg(target_os = "linux")]
fn detect_kind() -> Kind {
    use tauri::utils::config::BundleType;
    let bundle = match tauri::utils::platform::bundle_type() {
        Some(BundleType::AppImage) => Some(LinuxBundle::AppImage),
        Some(BundleType::Deb) => Some(LinuxBundle::Deb),
        Some(BundleType::Rpm) => Some(LinuxBundle::Rpm),
        _ => None,
    };
    // A store (Flatpak, Snap) updates its apps itself and does not let them do it
    let store = std::env::var_os("FLATPAK_ID").is_some() || Path::new("/.flatpak-info").exists() || std::env::var_os("SNAP").is_some();
    let appimage = std::env::var("APPIMAGE").ok();
    let appimage_is_file = appimage.as_deref().is_some_and(|p| Path::new(p).is_file());
    let exe = std::env::current_exe().ok().and_then(|p| p.to_str().map(str::to_string));
    linux_kind(bundle, store, appimage.as_deref(), appimage_is_file, exe.as_deref())
}

#[cfg(not(any(windows, target_os = "android", target_os = "linux")))]
fn detect_kind() -> Kind {
    Kind::Other
}

/// The package forms of the Linux build, as the bundler records them.
#[cfg(any(target_os = "linux", test))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum LinuxBundle {
    AppImage,
    Deb,
    Rpm,
}

/// Which kind a Linux build is. An AppImage only when the AppImage runtime names the file it was started from (an
/// absolute path to an existing file in `$APPIMAGE`; the running executable itself lies in the temporary mount); a deb
/// or an rpm only when it runs from where the package installed it. Everything else — a store, a copy unpacked from a
/// package or an AppImage, a build of one's own — only gets the release page.
#[cfg(any(target_os = "linux", test))]
fn linux_kind(bundle: Option<LinuxBundle>, store: bool, appimage: Option<&str>, appimage_is_file: bool, exe: Option<&str>) -> Kind {
    if store {
        return Kind::Other;
    }
    match bundle {
        Some(LinuxBundle::AppImage) if appimage.is_some_and(|p| p.starts_with('/')) && appimage_is_file => Kind::AppImage,
        Some(LinuxBundle::Deb) if exe == Some(INSTALLED_EXE) => Kind::Deb,
        Some(LinuxBundle::Rpm) if exe == Some(INSTALLED_EXE) => Kind::Rpm,
        _ => Kind::Other,
    }
}

/// The AppImage file this process was started from (Linux).
#[cfg(target_os = "linux")]
fn appimage_file() -> Option<PathBuf> {
    std::env::var_os("APPIMAGE").map(PathBuf::from).filter(|p| p.is_absolute() && p.is_file())
}

/// Whether two folders are the same one (links resolved; Windows paths compare without case).
#[cfg(any(windows, test))]
fn same_dir(a: &Path, b: &Path) -> bool {
    let norm = |p: &Path| {
        let p = std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
        let text = p.to_string_lossy().trim_end_matches(['\\', '/']).to_string();
        if cfg!(windows) {
            text.to_lowercase()
        } else {
            text
        }
    };
    !b.as_os_str().is_empty() && norm(a) == norm(b)
}

// ---- The release description ----

/// A file of a release.
#[derive(Clone, Debug, PartialEq)]
pub struct Asset {
    pub name: String,
    pub size: u64,
    /// SHA-256 as GitHub computed it on upload (lower-case hex), when the description carries one.
    pub digest: Option<String>,
}

/// What `releases/latest` says, reduced to what the update needs.
#[derive(Clone, Debug)]
pub struct Release {
    pub tag: String,
    pub version: Version,
    /// The version as written in the file names ("26.64").
    pub version_text: String,
    pub notes: String,
    pub published: String,
    pub assets: Vec<Asset>,
    pub sums: Option<Asset>,
}

/// A tag this code is willing to put into an address: no path separators, blanks or control characters (everything
/// else is percent-encoded).
pub fn valid_tag(tag: &str) -> bool {
    !tag.is_empty() && tag.len() <= 120 && tag != "." && tag != ".." && !tag.chars().any(|c| c.is_control() || c.is_whitespace() || c == '/' || c == '\\')
}

/// `VeloPhi-v26.64-windows-x64-setup.exe` → (26.64, "26.64", "windows-x64-setup.exe"); None for any other name.
pub fn parse_asset_name(name: &str) -> Option<(Version, &str, &str)> {
    let rest = name.strip_prefix(PRODUCT_PREFIX)?;
    let dash = rest.find('-')?;
    let (version_text, suffix) = (&rest[..dash], &rest[dash + 1..]);
    if !SUFFIXES.contains(&suffix) {
        return None;
    }
    Some((parse_version(version_text)?, version_text, suffix))
}

/// "sha256:<64 hex digits>" → the digits in lower case.
fn parse_digest(text: &str) -> Option<String> {
    let hex = text.strip_prefix("sha256:")?;
    (hex.len() == 64 && hex.bytes().all(|b| b.is_ascii_hexdigit())).then(|| hex.to_ascii_lowercase())
}

/// Remote text as plain text: no carriage returns or control characters, at most `max` characters.
fn plain_text(text: &str, max: usize) -> String {
    text.chars().filter(|&c| c == '\n' || c == '\t' || !c.is_control()).take(max).collect()
}

/// Read the JSON of `releases/latest`. Errors are `malformed: …` (the answer is not what the release script and
/// GitHub produce).
pub fn parse_release(json: &str) -> Result<Release, String> {
    let bad = |what: &str| format!("malformed: {what}");
    let value: serde_json::Value = serde_json::from_str(json).map_err(|_| bad("not JSON"))?;
    let obj = value.as_object().ok_or_else(|| bad("not an object"))?;
    let tag = obj.get("tag_name").and_then(|t| t.as_str()).ok_or_else(|| bad("no tag_name"))?;
    if !valid_tag(tag) {
        return Err(bad("unsupported tag name"));
    }
    let flag = |key: &str| obj.get(key).and_then(|v| v.as_bool()).unwrap_or(false);
    if flag("draft") || flag("prerelease") {
        return Err(bad("not a published release"));
    }
    let mut assets = Vec::new();
    for a in obj.get("assets").and_then(|a| a.as_array()).map(Vec::as_slice).unwrap_or(&[]) {
        let (Some(name), Some(size)) = (a.get("name").and_then(|n| n.as_str()), a.get("size").and_then(|s| s.as_u64())) else { continue };
        // A file still being uploaded is not offered
        if a.get("state").and_then(|s| s.as_str()).is_some_and(|s| s != "uploaded") {
            continue;
        }
        assets.push(Asset { name: name.to_string(), size, digest: a.get("digest").and_then(|d| d.as_str()).and_then(parse_digest) });
    }
    // The version is the one in the names of the release script's files; they must agree
    let mut found: Option<(Version, &str)> = None;
    for a in &assets {
        let Some((version, text, _)) = parse_asset_name(&a.name) else { continue };
        match found {
            Some((_, t)) if t != text => return Err(bad("files of different versions")),
            _ => found = Some((version, text)),
        }
    }
    let (version, version_text) = match found {
        Some((v, t)) => (v, t.to_string()),
        // A release without these files can only be announced: its version is read from the tag or the title
        None => {
            let v = version_in_text(tag).or_else(|| obj.get("name").and_then(|n| n.as_str()).and_then(version_in_text)).ok_or_else(|| bad("no version"))?;
            (v, show_version(v))
        }
    };
    let notes = plain_text(obj.get("body").and_then(|b| b.as_str()).unwrap_or(""), MAX_NOTES);
    let published = obj.get("published_at").and_then(|p| p.as_str()).filter(|p| p.len() <= 30 && p.bytes().all(|b| b.is_ascii_digit() || b"-:TZ.+".contains(&b))).unwrap_or("").to_string();
    let sums = assets.iter().find(|a| a.name == SUMS_NAME && a.size > 0 && a.size <= MAX_SUMS as u64).cloned();
    Ok(Release { tag: tag.to_string(), version, version_text, notes, published, assets, sums })
}

/// The file of the release for this kind of build: exactly `VeloPhi-v<version>-<suffix>`.
pub fn pick_asset(release: &Release, kind: Kind) -> Option<&Asset> {
    let name = format!("{PRODUCT_PREFIX}{}-{}", release.version_text, kind.suffix()?);
    release.assets.iter().find(|a| a.name == name && parse_asset_name(&a.name).is_some_and(|(v, _, _)| v == release.version))
}

// ---- SHA256SUMS.txt ----

#[derive(Debug, PartialEq, Eq)]
pub enum SumsError {
    /// No line for the file.
    Missing,
    /// Two lines for the file with different hashes.
    Ambiguous,
}

/// The hash of `name` in a checksum file (`<64 hex digits>  <name>` per line, as `sha256sum` and the release script
/// write it; `*` before the name marks binary mode). Lines of any other form are skipped.
pub fn sums_lookup(text: &str, name: &str) -> Result<String, SumsError> {
    let mut found: Option<String> = None;
    for line in text.trim_start_matches('\u{feff}').lines() {
        let line = line.trim_end();
        let b = line.as_bytes();
        if b.len() < 67 || !b[..64].iter().all(u8::is_ascii_hexdigit) || b[64] != b' ' || !(b[65] == b' ' || b[65] == b'*') || &line[66..] != name {
            continue;
        }
        let hash = line[..64].to_ascii_lowercase();
        match &found {
            Some(f) if *f != hash => return Err(SumsError::Ambiguous),
            _ => found = Some(hash),
        }
    }
    found.ok_or(SumsError::Missing)
}

// ---- Addresses ----

/// Percent-encode a path segment (everything but letters, digits and `-._~`).
pub fn encode_segment(segment: &str) -> String {
    let mut out = String::with_capacity(segment.len());
    for b in segment.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// A file name that needs no encoding (what the release script produces).
fn plain_file_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= 100 && !name.starts_with('.') && name.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_'))
}

/// Where a file of a release is downloaded from; None when the tag or the name cannot be used.
pub fn asset_url(tag: &str, name: &str) -> Option<String> {
    if !valid_tag(tag) || !plain_file_name(name) {
        return None;
    }
    let url = format!("https://{SITE_HOST}{DOWNLOAD_PREFIX}{}/{name}", encode_segment(tag));
    reqwest::Url::parse(&url).ok().filter(allowed_download_start).map(|_| url)
}

/// The page of a release (opened in the browser).
pub fn release_page_url(tag: &str) -> String {
    if valid_tag(tag) {
        format!("{RELEASE_PAGE_PREFIX}{}", encode_segment(tag))
    } else {
        RELEASES_PAGE.to_string()
    }
}

/// https to exactly this host, default port, no user name.
fn plain_https(url: &reqwest::Url, host: &str) -> bool {
    url.scheme() == "https" && url.host_str() == Some(host) && url.port().is_none() && url.username().is_empty() && url.password().is_none()
}

/// The first address of a download: a release file of this project on github.com.
pub fn allowed_download_start(url: &reqwest::Url) -> bool {
    plain_https(url, SITE_HOST) && url.path().starts_with(DOWNLOAD_PREFIX)
}

/// Any address a download may pass through: the above, or one of GitHub's release-asset hosts.
pub fn allowed_download_hop(url: &reqwest::Url) -> bool {
    allowed_download_start(url) || (ASSET_HOSTS.iter().any(|h| plain_https(url, h)) && url.path().starts_with(ASSET_PATH_PREFIX))
}

/// The release description, or where GitHub sends it after the repository was renamed (`/repositories/<id>/…`).
pub fn allowed_api(url: &reqwest::Url) -> bool {
    plain_https(url, API_HOST) && (url.path() == API_PATH || (url.path().starts_with("/repositories/") && url.path().ends_with("/releases/latest")))
}

// ---- Hashing and files ----

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// SHA-256 of a file (lower-case hex).
pub fn hash_file(path: &Path) -> std::io::Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            return Ok(hex(&hasher.finalize()));
        }
        hasher.update(&buf[..n]);
    }
}

/// A name in `dir` that is not taken: `name`, else `stem (2).ext` … `stem (9).ext`.
#[cfg(any(windows, target_os = "linux", test))]
fn free_name(dir: &Path, name: &str) -> Option<PathBuf> {
    let (stem, ext) = name.rsplit_once('.').map_or((name, String::new()), |(s, e)| (s, format!(".{e}")));
    std::iter::once(name.to_string()).chain((2..=9).map(|i| format!("{stem} ({i}){ext}"))).map(|n| dir.join(n)).find(|p| !p.exists())
}

/// Delete the files of the update folder except `keep` (left-overs of earlier downloads; an installer that has run).
fn clean_dir(dir: &Path, keep: Option<&Path>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if keep != Some(path.as_path()) && entry.file_type().is_ok_and(|t| t.is_file()) {
            let _ = std::fs::remove_file(path);
        }
    }
}

// ---- The system's package tool (Linux deb and rpm, 26.65) ----

/// `pkexec` asks for the administrator's authorisation through the desktop's own agent and then runs one program as
/// root. Every program is named by its absolute path; nothing goes through a shell.
#[cfg(any(target_os = "linux", test))]
const PKEXEC: &str = "/usr/bin/pkexec";

/// How one package tool installs a local package file, and the same for a person at a terminal.
#[cfg(any(target_os = "linux", test))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct PackageTool {
    program: &'static str,
    /// Put between the program and the file.
    args: &'static [&'static str],
    /// What the page shows to type in a terminal, before the quoted file.
    by_hand: &'static str,
}

/// apt-get resolves dependencies a new version may add; it waits up to two minutes for a running update to finish.
#[cfg(any(target_os = "linux", test))]
const APT: PackageTool = PackageTool { program: "/usr/bin/apt-get", args: &["install", "-y", "-o", "DPkg::Lock::Timeout=120"], by_hand: "sudo apt install" };
#[cfg(any(target_os = "linux", test))]
const DPKG: PackageTool = PackageTool { program: "/usr/bin/dpkg", args: &["-i"], by_hand: "sudo dpkg -i" };
#[cfg(any(target_os = "linux", test))]
const DNF: PackageTool = PackageTool { program: "/usr/bin/dnf", args: &["install", "-y"], by_hand: "sudo dnf install" };
/// The rpm of a release is not signed (UPDATES.md §4): zypper needs to be told that this is expected.
#[cfg(any(target_os = "linux", test))]
const ZYPPER: PackageTool = PackageTool { program: "/usr/bin/zypper", args: &["--non-interactive", "install", "--allow-unsigned-rpm"], by_hand: "sudo zypper install --allow-unsigned-rpm" };
#[cfg(any(target_os = "linux", test))]
const RPM: PackageTool = PackageTool { program: "/usr/bin/rpm", args: &["-U"], by_hand: "sudo rpm -U" };

/// Whether `/etc/os-release` names a system of this family (`ID` or `ID_LIKE`, e.g. "suse" for openSUSE Leap and
/// Tumbleweed, whose `ID` is `opensuse-leap` / `opensuse-tumbleweed`).
#[cfg(any(target_os = "linux", test))]
fn os_like(os_release: &str, family: &str) -> bool {
    os_release.lines().filter_map(|l| l.strip_prefix("ID=").or_else(|| l.strip_prefix("ID_LIKE="))).any(|v| v.trim().trim_matches(['"', '\'']).split([' ', '-']).any(|w| w == family))
}

/// The package tool for a deb or an rpm on this system: apt-get, else dpkg (deb); dnf, zypper, else rpm — zypper first
/// on SUSE systems. None when the system has none of them (or the kind is not a package).
#[cfg(any(target_os = "linux", test))]
fn package_tool(kind: Kind, os_release: &str, exists: &dyn Fn(&str) -> bool) -> Option<PackageTool> {
    let order: &[PackageTool] = match kind {
        Kind::Deb => &[APT, DPKG],
        Kind::Rpm if os_like(os_release, "suse") => &[ZYPPER, DNF, RPM],
        Kind::Rpm => &[DNF, ZYPPER, RPM],
        _ => return None,
    };
    order.iter().copied().find(|t| exists(t.program))
}

/// A word for a POSIX shell: in single quotes, a single quote written as `'\''`.
#[cfg(any(target_os = "linux", test))]
fn shell_quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', r"'\''"))
}

/// The command a person types to install `file` (shown when the automatic installation did not happen).
#[cfg(any(target_os = "linux", test))]
fn by_hand_command(kind: Kind, tool: Option<PackageTool>, file: &str) -> String {
    let prefix = tool.map(|t| t.by_hand).unwrap_or(if kind == Kind::Rpm { DNF.by_hand } else { APT.by_hand });
    format!("{prefix} {}", shell_quote(file))
}

/// Why the system's package tool did not install the update.
#[cfg(any(target_os = "linux", test))]
#[derive(Clone, Debug, PartialEq, Eq)]
enum ToolFailure {
    /// The authorisation was refused or its window closed (pkexec: 126).
    Cancelled,
    /// No pkexec, or no authentication agent in this session (pkexec: 127).
    NoAgent,
    /// None of the package tools exists.
    NoTool,
    /// The package tool ran and failed: its exit code and the last line it wrote.
    Failed(Option<i32>, String),
}

/// pkexec's exit code (and the tool's, which it passes on) → the outcome.
#[cfg(any(target_os = "linux", test))]
fn tool_outcome(code: Option<i32>, stderr: &str) -> Result<(), ToolFailure> {
    match code {
        Some(0) => Ok(()),
        Some(126) => Err(ToolFailure::Cancelled),
        Some(127) => Err(ToolFailure::NoAgent),
        _ => Err(ToolFailure::Failed(code, plain_text(stderr.lines().rev().map(str::trim).find(|l| !l.is_empty()).unwrap_or(""), 300))),
    }
}

/// Run the package tool on the verified file (blocking: pkexec waits for the authorisation window).
#[cfg(target_os = "linux")]
fn run_package_tool(tool: Option<PackageTool>, file: &Path) -> Result<(), ToolFailure> {
    let tool = tool.ok_or(ToolFailure::NoTool)?;
    if !Path::new(PKEXEC).is_file() {
        return Err(ToolFailure::NoAgent);
    }
    let out = std::process::Command::new(PKEXEC).arg(tool.program).args(tool.args).arg(file).stdin(std::process::Stdio::null()).output().map_err(|_| ToolFailure::NoAgent)?;
    tool_outcome(out.status.code(), &String::from_utf8_lossy(&out.stderr))
}

// ---- State ----

/// What the last check found (kept here: the page only names the tag).
#[derive(Clone)]
struct Offer {
    tag: String,
    version: Version,
    kind: Kind,
    asset: Option<Asset>,
    sums: Option<Asset>,
}

/// A downloaded and verified file.
#[derive(Clone)]
struct Ready {
    kind: Kind,
    name: String,
    path: PathBuf,
    sha256: String,
}

struct Inner {
    offer: Option<Offer>,
    ready: Option<Ready>,
    /// Stops the running download.
    abort: Option<Box<dyn Fn() + Send>>,
}

static STATE: Mutex<Inner> = Mutex::new(Inner { offer: None, ready: None, abort: None });
static BUSY: AtomicBool = AtomicBool::new(false);

fn state() -> std::sync::MutexGuard<'static, Inner> {
    STATE.lock().unwrap_or_else(|e| e.into_inner())
}

/// One download at a time; the flag clears when the guard goes.
struct BusyGuard;
impl BusyGuard {
    fn take() -> Option<BusyGuard> {
        (!BUSY.swap(true, Ordering::SeqCst)).then_some(BusyGuard)
    }
}
impl Drop for BusyGuard {
    fn drop(&mut self) {
        BUSY.store(false, Ordering::SeqCst);
    }
}

/// The release self-check (`--selftest`) must not touch the network.
fn selftest() -> bool {
    std::env::args().any(|a| a == "--selftest")
}

fn update_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    app.path().app_cache_dir().map(|d| d.join("update")).map_err(|e| format!("io: {e}"))
}

// ---- Network ----

/// Desktop: the TLS of the system and its proxy settings (as net.rs).
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn client_builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
}

/// Phone: rustls with the ring provider and the Mozilla root certificates (the same configuration as net.rs).
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

/// A client that sends the generic user agent and nothing else, speaks https only and follows redirects only to
/// addresses `allowed` accepts.
fn client(allowed: fn(&reqwest::Url) -> bool) -> reqwest::ClientBuilder {
    let policy = reqwest::redirect::Policy::custom(move |attempt| {
        if attempt.previous().len() >= MAX_REDIRECTS {
            attempt.error("too many redirects")
        } else if allowed(attempt.url()) {
            attempt.follow()
        } else {
            attempt.error("redirect to an address that is not allowed")
        }
    });
    client_builder().user_agent(concat!("VeloPhi/", env!("CARGO_PKG_VERSION"))).https_only(true).referer(false).redirect(policy)
}

/// A short reason without the address.
fn describe(e: reqwest::Error) -> String {
    if e.is_timeout() {
        "timeout".into()
    } else if e.is_redirect() {
        "redirect".into()
    } else if e.is_connect() {
        "connect".into()
    } else {
        format!("network: {}", e.without_url())
    }
}

/// GET a small text; the final address must pass `allowed` and the body stay within `max` bytes.
async fn fetch_text(client: &reqwest::Client, url: &str, accept: Option<&str>, max: usize, allowed: fn(&reqwest::Url) -> bool) -> Result<String, String> {
    let mut request = client.get(url);
    if let Some(accept) = accept {
        request = request.header("Accept", accept);
    }
    let mut resp = request.send().await.map_err(describe)?;
    if !allowed(resp.url()) {
        return Err("redirect".into());
    }
    let status = resp.status().as_u16();
    if status != 200 {
        // GitHub answers 403 or 429 when the hourly limit of the address (60 requests) is used up
        let limited = resp.headers().get("x-ratelimit-remaining").and_then(|v| v.to_str().ok()) == Some("0");
        return Err(if (status == 403 || status == 429) && limited { "rate".into() } else if status == 404 { "none".into() } else { format!("http: {status}") });
    }
    if resp.content_length().is_some_and(|n| n > max as u64) {
        return Err("size".into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = resp.chunk().await.map_err(describe)? {
        if body.len() + chunk.len() > max {
            return Err("size".into());
        }
        body.extend_from_slice(&chunk);
    }
    String::from_utf8(body).map_err(|_| "malformed: not UTF-8".into())
}

/// Progress of a download, sent to the page.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    /// "downloading" or "verifying".
    phase: &'static str,
    received: u64,
    total: u64,
}

/// Stream `url` into the new file `dest` (which must not exist); returns its SHA-256. The size must be exactly `size`.
async fn download_file(client: &reqwest::Client, url: &str, dest: &Path, size: u64, progress: &Channel<Progress>) -> Result<String, String> {
    let io = |e: std::io::Error| format!("io: {e}");
    let mut resp = client.get(url).send().await.map_err(describe)?;
    if !allowed_download_hop(resp.url()) {
        return Err("redirect".into());
    }
    let status = resp.status().as_u16();
    if status != 200 {
        return Err(format!("http: {status}"));
    }
    if resp.content_length().is_some_and(|n| n != size) {
        return Err("size".into());
    }
    let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(dest).map_err(io)?;
    let mut hasher = Sha256::new();
    let mut received = 0u64;
    let mut last = Instant::now();
    let _ = progress.send(Progress { phase: "downloading", received, total: size });
    while let Some(chunk) = resp.chunk().await.map_err(describe)? {
        received += chunk.len() as u64;
        if received > size {
            return Err("size".into());
        }
        file.write_all(&chunk).map_err(io)?;
        hasher.update(&chunk);
        if last.elapsed() >= Duration::from_millis(120) {
            last = Instant::now();
            let _ = progress.send(Progress { phase: "downloading", received, total: size });
        }
    }
    if received != size {
        return Err("size".into());
    }
    file.sync_all().map_err(io)?;
    let _ = progress.send(Progress { phase: "verifying", received, total: size });
    Ok(hex(&hasher.finalize()))
}

// ---- Commands ----

/// The answer of `update_check`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
    current: String,
    latest: String,
    tag: String,
    newer: bool,
    notes: String,
    published: String,
    kind: Kind,
    /// The file for this build, when the release has one and it can be verified (≤ 400 MB).
    asset: Option<AssetInfo>,
    /// The release carries SHA256SUMS.txt.
    sums: bool,
}

#[derive(Serialize)]
pub struct AssetInfo {
    name: String,
    size: u64,
}

/// Ask GitHub for the latest release. Errors: `timeout`, `connect`, `network: …`, `redirect`, `rate` (hourly limit),
/// `none` (nothing published), `http: <status>`, `size`, `malformed: …`, `selftest`.
#[tauri::command]
pub async fn update_check<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<CheckResult, String> {
    if selftest() {
        return Err("selftest".into());
    }
    let http = client(allowed_api).timeout(Duration::from_secs(8)).connect_timeout(Duration::from_secs(5)).build().map_err(|e| format!("network: {e}"))?;
    let json = fetch_text(&http, API_LATEST, Some("application/vnd.github+json"), MAX_JSON, allowed_api).await?;
    let release = parse_release(&json)?;
    let kind = detect_kind();
    let current = current_version();
    let asset = pick_asset(&release, kind).filter(|a| a.size > 0 && a.size <= MAX_ASSET).cloned();
    let result = CheckResult {
        current: show_version(current),
        latest: show_version(release.version),
        tag: release.tag.clone(),
        newer: release.version > current,
        notes: release.notes.clone(),
        published: release.published.clone(),
        kind,
        asset: asset.as_ref().map(|a| AssetInfo { name: a.name.clone(), size: a.size }),
        sums: release.sums.is_some(),
    };
    let keep = {
        let mut s = state();
        s.offer = Some(Offer { tag: release.tag, version: release.version, kind, asset, sums: release.sums });
        s.ready.as_ref().map(|r| r.path.clone())
    };
    if !BUSY.load(Ordering::SeqCst) {
        if let Ok(dir) = update_dir(&app) {
            clean_dir(&dir, keep.as_deref());
        }
    }
    Ok(result)
}

/// The answer of `update_download`.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Downloaded {
    kind: Kind,
    name: String,
    /// Portable build: where the new executable is (shown to the user).
    path: Option<String>,
    /// Portable build: the file name of the running executable (the one that can be deleted afterwards).
    old: Option<String>,
}

/// Download and verify the file of the release `tag` for this build. `tag` must be the tag of the last check, of a
/// version newer than this one; everything else is decided here. Errors: those of the network, `stale`, `busy`,
/// `no-asset`, `no-sums`, `sums-missing`, `hash-mismatch`, `size`, `io: …`, `cancelled`.
#[tauri::command]
pub async fn update_download<R: tauri::Runtime>(app: tauri::AppHandle<R>, tag: String, on_progress: Channel<Progress>) -> Result<Downloaded, String> {
    let Plan { kind, asset, sums, asset_address, sums_address } = plan_download(state().offer.as_ref(), &tag, current_version())?;
    let _busy = BusyGuard::take().ok_or("busy")?;
    let dir = update_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("io: {e}"))?;
    state().ready = None;
    clean_dir(&dir, None);
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let part = dir.join(format!("{}.{}-{nonce}.part", asset.name, std::process::id()));
    let job_part = part.clone();
    let job_asset = asset.clone();
    let job = tauri::async_runtime::spawn(async move {
        let http = client(allowed_download_hop).connect_timeout(Duration::from_secs(15)).read_timeout(Duration::from_secs(30)).build().map_err(|e| format!("network: {e}"))?;
        // The checksum file first: without a line for this file nothing is downloaded
        let text = fetch_text(&http, &sums_address, None, MAX_SUMS, allowed_download_hop).await?;
        let expected = expected_hash(&text, &sums, &job_asset)?;
        let got = download_file(&http, &asset_address, &job_part, job_asset.size, &on_progress).await?;
        if got != expected {
            return Err("hash-mismatch".to_string());
        }
        Ok(expected)
    });
    let stop = job.inner().abort_handle();
    state().abort = Some(Box::new(move || stop.abort()));
    let outcome = job.await;
    state().abort = None;
    let sha256 = match outcome {
        Ok(Ok(sha256)) => sha256,
        Ok(Err(e)) => {
            let _ = std::fs::remove_file(&part);
            return Err(e);
        }
        // The task was stopped by update_cancel
        Err(_) => {
            let _ = std::fs::remove_file(&part);
            return Err("cancelled".into());
        }
    };
    let placed = place(&app, kind, &asset.name, &part, &dir, &sha256);
    if placed.is_err() {
        let _ = std::fs::remove_file(&part);
    }
    let (path, shown) = placed?;
    state().ready = Some(Ready { kind, name: asset.name.clone(), path, sha256 });
    let old = shown.as_ref().and_then(|_| running_file(kind)).and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()));
    Ok(Downloaded { kind, name: asset.name, path: shown, old })
}

/// The file the user started: the AppImage itself (not the executable inside its mount), else the executable.
fn running_file(kind: Kind) -> Option<PathBuf> {
    #[cfg(target_os = "linux")]
    if kind == Kind::AppImage {
        return appimage_file();
    }
    let _ = kind;
    std::env::current_exe().ok()
}

/// What a download fetches, decided from the offer of the last check alone.
struct Plan {
    kind: Kind,
    asset: Asset,
    sums: Asset,
    asset_address: String,
    sums_address: String,
}

/// The gate of a download. `tag` — all the page says — must be the tag of the last offer; the offer must be strictly
/// newer than the running version (never a downgrade), carry the file of this build's kind for exactly that version
/// within the size limit, and a checksum file. The addresses are built here.
fn plan_download(offer: Option<&Offer>, tag: &str, current: Version) -> Result<Plan, String> {
    let offer = offer.filter(|o| o.tag == tag && o.version > current).ok_or("stale")?;
    let asset = offer.asset.clone().ok_or("no-asset")?;
    let sums = offer.sums.clone().ok_or("no-sums")?;
    if parse_asset_name(&asset.name).map(|(v, _, s)| (v, Some(s))) != Some((offer.version, offer.kind.suffix())) || asset.size == 0 || asset.size > MAX_ASSET {
        return Err("no-asset".into());
    }
    let (Some(asset_address), Some(sums_address)) = (asset_url(&offer.tag, &asset.name), asset_url(&offer.tag, SUMS_NAME)) else { return Err("stale".into()) };
    Ok(Plan { kind: offer.kind, asset, sums, asset_address, sums_address })
}

/// The SHA-256 the downloaded file must have: the line for it in the release's checksum file. Where the release
/// description carries GitHub's own digests, the checksum file must be the one GitHub has, and both must name the same
/// hash for the file. Errors: `sums-missing` (no line for the file), `hash-mismatch`.
fn expected_hash(sums_text: &str, sums: &Asset, asset: &Asset) -> Result<String, String> {
    if sums.digest.as_ref().is_some_and(|d| *d != hex(&Sha256::digest(sums_text.as_bytes()))) {
        return Err("hash-mismatch".into());
    }
    let expected = sums_lookup(sums_text, &asset.name).map_err(|e| if e == SumsError::Missing { "sums-missing".to_string() } else { "hash-mismatch".to_string() })?;
    if asset.digest.as_ref().is_some_and(|d| *d != expected) {
        return Err("hash-mismatch".into());
    }
    Ok(expected)
}

/// Give the verified file its final name and place: the installer, the APK, the deb and the rpm stay in the update
/// folder; the portable executable is copied next to the running one, the AppImage next to the AppImage the user
/// started, under its versioned name (the Downloads folder when that folder cannot be written), and the copy is hashed
/// again. Returns the path and, for the portable build and the AppImage, the path to show.
fn place<R: tauri::Runtime>(app: &tauri::AppHandle<R>, kind: Kind, name: &str, part: &Path, dir: &Path, sha256: &str) -> Result<(PathBuf, Option<String>), String> {
    let io = |e: std::io::Error| format!("io: {e}");
    #[cfg(windows)]
    if kind == Kind::Portable {
        let beside = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf));
        return copy_verified(beside.into_iter().chain(app.path().download_dir().ok()), name, part, sha256, true);
    }
    #[cfg(target_os = "linux")]
    if kind == Kind::AppImage {
        let beside = appimage_file().and_then(|p| p.parent().map(Path::to_path_buf));
        return copy_verified(beside.into_iter().chain(app.path().download_dir().ok()), name, part, sha256, true);
    }
    let _ = (app, kind, sha256);
    let dest = dir.join(name);
    let _ = std::fs::remove_file(&dest);
    std::fs::rename(part, &dest).map_err(io)?;
    Ok((dest, None))
}

/// Copy the verified file `from` into the first of `folders` that takes it, under `name` or a free variant of it
/// (an existing file is never replaced), hash the copy again, and delete `from`. On Linux the copy is made
/// executable (`0755`, the AppImage) or not (`0644`, a package file).
#[cfg(any(windows, target_os = "linux"))]
fn copy_verified(folders: impl Iterator<Item = PathBuf>, name: &str, from: &Path, sha256: &str, executable: bool) -> Result<(PathBuf, Option<String>), String> {
    let io = |e: std::io::Error| format!("io: {e}");
    let mut last = "io: no folder for the new file".to_string();
    for folder in folders {
        let Some(dest) = free_name(&folder, name) else { continue };
        let copied = std::fs::copy(from, &dest).map(|_| ());
        #[cfg(target_os = "linux")]
        let copied = copied.and_then(|_| {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(if executable { 0o755 } else { 0o644 }))
        });
        let _ = executable;
        match copied {
            Ok(()) if hash_file(&dest).is_ok_and(|h| h == sha256) => {
                let _ = std::fs::remove_file(from);
                let shown = dest.to_string_lossy().into_owned();
                return Ok((dest, Some(shown)));
            }
            Ok(()) => {
                let _ = std::fs::remove_file(&dest);
                last = "hash-mismatch".into();
            }
            Err(e) => {
                // A copy that could not be made executable is no use (Linux); on Windows this path is as in 26.64
                #[cfg(target_os = "linux")]
                let _ = std::fs::remove_file(&dest);
                last = io(e);
            }
        }
    }
    Err(last)
}

/// Stop the running download (its command answers `cancelled`); nothing happens when none is running.
#[tauri::command]
pub fn update_cancel() {
    if let Some(stop) = state().abort.as_ref() {
        stop();
    }
}

/// The answer of `update_install`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Installed {
    kind: Kind,
    /// Android: the file in the update folder that MainActivity hands to the system installer.
    name: String,
    /// Linux deb/rpm: the package tool did not install it; how to do it by hand.
    manual: Option<Manual>,
}

/// An update that is to be installed by hand (Linux deb and rpm).
#[cfg_attr(not(any(target_os = "linux", test)), allow(dead_code))]
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Manual {
    /// `cancelled` (the authorisation was refused), `no-agent` (no pkexec or authentication agent), `no-tool` (no
    /// package tool found), `failed` (the tool reported an error).
    reason: &'static str,
    /// `failed`: the exit code of the package tool.
    code: Option<i32>,
    /// `failed`: the last line the tool wrote (technical text, shown as it is).
    detail: String,
    /// Where the verified file is now (the Downloads folder when it could be copied there).
    path: String,
    /// What to type in a terminal.
    command: String,
}

#[cfg(any(target_os = "linux", test))]
fn manual_for(kind: Kind, tool: Option<PackageTool>, failure: ToolFailure, path: &str) -> Manual {
    let (reason, code, detail) = match failure {
        ToolFailure::Cancelled => ("cancelled", None, String::new()),
        ToolFailure::NoAgent => ("no-agent", None, String::new()),
        ToolFailure::NoTool => ("no-tool", None, String::new()),
        ToolFailure::Failed(code, detail) => ("failed", code, detail),
    };
    Manual { reason, code, detail, path: path.to_string(), command: by_hand_command(kind, tool, path) }
}

/// Start the verified file. Windows: the installer (passive update, the app starts again) or the new portable
/// executable, then this app exits — the page has asked about unsaved changes before calling. Linux: the new AppImage
/// (then this app exits), or the deb/rpm through pkexec and the package tool (on success the installed new version is
/// started and this app exits; otherwise the answer carries `manual`). Android: nothing is started here; the page
/// passes `name` to `window.VeloPhiAndroid.installUpdate`. Errors: `not-ready`, `hash-mismatch` (the file changed since
/// it was verified; it is deleted), `io: …`, `unsupported`.
#[tauri::command]
pub async fn update_install<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<Installed, String> {
    let ready = state().ready.clone().ok_or("not-ready")?;
    let path = ready.path.clone();
    let hash = tauri::async_runtime::spawn_blocking(move || hash_file(&path)).await.map_err(|e| format!("io: {e}"))?;
    if hash.as_deref().ok() != Some(ready.sha256.as_str()) {
        let _ = std::fs::remove_file(&ready.path);
        state().ready = None;
        return Err("hash-mismatch".into());
    }
    match ready.kind {
        #[cfg(windows)]
        Kind::Installer | Kind::Portable => {
            let mut command = std::process::Command::new(&ready.path);
            if ready.kind == Kind::Installer {
                command.args(INSTALLER_ARGS);
            }
            if let Some(folder) = ready.path.parent() {
                command.current_dir(folder);
            }
            command.spawn().map_err(|e| format!("io: {e}"))?;
            state().ready = None;
            app.exit(0);
        }
        #[cfg(target_os = "linux")]
        Kind::AppImage => {
            let mut command = std::process::Command::new(&ready.path);
            // Started from the old AppImage: its mount (and the libraries in it) goes away when this process exits
            crate::net::clean_appimage_env(&mut command);
            if let Some(folder) = ready.path.parent() {
                command.current_dir(folder);
            }
            command.spawn().map_err(|e| format!("io: {e}"))?;
            state().ready = None;
            app.exit(0);
        }
        #[cfg(target_os = "linux")]
        Kind::Deb | Kind::Rpm => {
            let os_release = std::fs::read_to_string("/etc/os-release").unwrap_or_default();
            let tool = package_tool(ready.kind, &os_release, &|p: &str| Path::new(p).is_file());
            let file = ready.path.clone();
            let outcome = tauri::async_runtime::spawn_blocking(move || run_package_tool(tool, &file)).await.map_err(|e| format!("io: {e}"))?;
            match outcome {
                Ok(()) => {
                    // The package replaced /usr/bin/velophi: start the new version, close this one
                    let mut command = std::process::Command::new(INSTALLED_EXE);
                    if let Some(home) = std::env::var_os("HOME") {
                        command.current_dir(home);
                    }
                    let _ = command.spawn();
                    state().ready = None;
                    app.exit(0);
                }
                Err(failure) => {
                    let kept = keep_for_hand(&app, &ready);
                    let shown = kept.to_string_lossy().into_owned();
                    let manual = manual_for(ready.kind, tool, failure, &shown);
                    return Ok(Installed { kind: ready.kind, name: ready.name, manual: Some(manual) });
                }
            }
        }
        Kind::Android => {}
        #[allow(unreachable_patterns)]
        _ => return Err("unsupported".into()),
    }
    let _ = &app;
    Ok(Installed { kind: ready.kind, name: ready.name, manual: None })
}

/// A deb or rpm that was not installed is copied to the Downloads folder (verified again), where it stays for the
/// command shown to the user — the update folder is emptied at the next start. Returns where the file is now; the
/// update folder when the copy could not be made.
#[cfg(target_os = "linux")]
fn keep_for_hand<R: tauri::Runtime>(app: &tauri::AppHandle<R>, ready: &Ready) -> PathBuf {
    let in_downloads = app.path().download_dir().ok().filter(|d| ready.path.parent() != Some(d.as_path()));
    match copy_verified(in_downloads.into_iter(), &ready.name, &ready.path, &ready.sha256, false) {
        Ok((dest, _)) => {
            if let Some(r) = state().ready.as_mut() {
                r.path = dest.clone();
            }
            dest
        }
        Err(_) => ready.path.clone(),
    }
}

/// Show the folder of a downloaded update that is to be installed by hand in the file manager (Linux).
#[tauri::command]
pub fn update_show_file() -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let folder = state().ready.as_ref().and_then(|r| r.path.parent().map(Path::to_path_buf)).ok_or("not-ready")?;
        crate::net::open_folder(&folder)
    }
    #[cfg(not(target_os = "linux"))]
    Err("unsupported".into())
}

/// Open the page of the offered release (or the list of releases) in the system browser.
#[tauri::command]
pub fn update_open_page<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    let url = state().offer.as_ref().map(|o| release_page_url(&o.tag)).unwrap_or_else(|| RELEASES_PAGE.to_string());
    #[cfg(any(target_os = "android", target_os = "ios"))]
    return crate::net::open_in_browser_mobile(&app, &url);
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let _ = app;
        crate::net::open_in_browser(&url)
    }
}

/// Delete what earlier updates left in the update folder (no network; called once after start). Off the main thread:
/// it touches the disk.
#[tauri::command(async)]
pub fn update_cleanup<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    if selftest() || BUSY.load(Ordering::SeqCst) {
        return;
    }
    let keep = state().ready.as_ref().map(|r| r.path.clone());
    if let Ok(dir) = update_dir(&app) {
        clean_dir(&dir, keep.as_deref());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The description of the 26.63 release as GitHub returned it on 2026-11-13, reduced to the fields read here.
    fn release_json(tag: &str, version: &str, extra: &str) -> String {
        let asset = |name: &str, size: u64, digest: &str| format!(r#"{{"name":"{name}","size":{size},"state":"uploaded","digest":"sha256:{digest}","browser_download_url":"https://example.invalid/ignored"}}"#);
        let files = [
            asset("README.md", 17905, &"07".repeat(32)),
            asset("SHA256SUMS.txt", 842, &"fe".repeat(32)),
            asset(&format!("VeloPhi-v{version}-android.apk"), 39835864, &"51".repeat(32)),
            asset(&format!("VeloPhi-v{version}-web.zip"), 8292776, &"35".repeat(32)),
            asset(&format!("VeloPhi-v{version}-windows-x64-portable.exe"), 21900288, &"42".repeat(32)),
            asset(&format!("VeloPhi-v{version}-windows-x64-setup.exe"), 11153878, &"33".repeat(32)),
            // 26.65: the Linux packages (sizes of the first build, 2026-11-19)
            asset(&format!("VeloPhi-v{version}-linux-amd64.deb"), 10_000_001, &"d1".repeat(32)),
            asset(&format!("VeloPhi-v{version}-linux-x86_64.rpm"), 10_000_002, &"e1".repeat(32)),
            asset(&format!("VeloPhi-v{version}-linux-x86_64.AppImage"), 90_000_003, &"a1".repeat(32)),
        ];
        format!(r#"{{"tag_name":"{tag}","name":"Release {version}","draft":false,"prerelease":false,"published_at":"2026-11-13T17:07:14Z","body":"**Full Changelog**: https://github.com/x/y\r\nline 2","assets":[{}]{extra}}}"#, files.join(","))
    }

    #[test]
    fn versions() {
        assert_eq!(parse_version("26.64"), Some(Version(26, 64, 0)));
        assert_eq!(parse_version("26.64.0"), Some(Version(26, 64, 0)));
        assert_eq!(parse_version("26.64.1"), Some(Version(26, 64, 1)));
        for bad in ["", "26", "26.", ".64", "26..1", "26.64.1.2", "v26.64", "26.x", " 26.64", "26.64 ", "+26.64", "26.-1", "26.123456", "２６.６４"] {
            assert_eq!(parse_version(bad), None, "{bad}");
        }
        // Ordering is numeric, part by part; a hot-fix is newer than its base, and a missing patch is 0
        assert!(Version(26, 64, 1) > Version(26, 64, 0));
        assert!(Version(26, 100, 0) > Version(26, 99, 9));
        assert!(Version(27, 0, 0) > Version(26, 99, 0));
        assert!(parse_version("26.64") == parse_version("26.64.0"));
        assert!(parse_version("26.9") < parse_version("26.10"));
        assert_eq!(show_version(Version(26, 64, 0)), "26.64");
        assert_eq!(show_version(Version(26, 64, 1)), "26.64.1");
    }

    #[test]
    fn versions_in_tags() {
        assert_eq!(version_in_text("Release26.63(2026.12.13)"), Some(Version(26, 63, 0)));
        assert_eq!(version_in_text("Release26.63.1(2026.12.20)"), Some(Version(26, 63, 1)));
        assert_eq!(version_in_text("v26.64"), Some(Version(26, 64, 0)));
        assert_eq!(version_in_text("v26.64.1"), Some(Version(26, 64, 1)));
        assert_eq!(version_in_text("Release 26.64."), Some(Version(26, 64, 0)));
        assert_eq!(version_in_text("latest"), None);
        assert_eq!(version_in_text("build-2026"), None);
    }

    #[test]
    fn asset_names() {
        assert_eq!(parse_asset_name("VeloPhi-v26.64-windows-x64-setup.exe"), Some((Version(26, 64, 0), "26.64", "windows-x64-setup.exe")));
        assert_eq!(parse_asset_name("VeloPhi-v26.64.1-android.apk"), Some((Version(26, 64, 1), "26.64.1", "android.apk")));
        for bad in ["VeloPhi-v26.64-source.zip", "VeloPhi-26.64-android.apk", "velophi-v26.64-android.apk", "VeloPhi-v26.64-android.apk.exe", "VeloPhi-vX-android.apk", "VeloPhi-v26.64-windows-x64-setup.exe ", "evil-VeloPhi-v26.64-android.apk", "SHA256SUMS.txt"] {
            assert_eq!(parse_asset_name(bad), None, "{bad}");
        }
    }

    #[test]
    fn release_description() {
        let r = parse_release(&release_json("Release26.63(2026.12.13)", "26.63", "")).unwrap();
        assert_eq!(r.tag, "Release26.63(2026.12.13)");
        assert_eq!((r.version, r.version_text.as_str()), (Version(26, 63, 0), "26.63"));
        assert_eq!(r.published, "2026-11-13T17:07:14Z");
        assert_eq!(r.notes, "**Full Changelog**: https://github.com/x/y\nline 2");
        assert_eq!(r.sums.as_ref().map(|s| s.size), Some(842));
        assert_eq!(pick_asset(&r, Kind::Installer).map(|a| (a.name.as_str(), a.size)), Some(("VeloPhi-v26.63-windows-x64-setup.exe", 11153878)));
        assert_eq!(pick_asset(&r, Kind::Portable).map(|a| a.name.as_str()), Some("VeloPhi-v26.63-windows-x64-portable.exe"));
        assert_eq!(pick_asset(&r, Kind::Android).map(|a| a.name.as_str()), Some("VeloPhi-v26.63-android.apk"));
        assert_eq!(pick_asset(&r, Kind::Android).and_then(|a| a.digest.clone()), Some("51".repeat(32)));
        assert_eq!(pick_asset(&r, Kind::Other), None);
        // Hot-fix and plain tags
        let h = parse_release(&release_json("v26.64.1", "26.64.1", "")).unwrap();
        assert_eq!((h.version, h.version_text.as_str()), (Version(26, 64, 1), "26.64.1"));
        assert!(h.version > Version(26, 64, 0));
        assert_eq!(pick_asset(&h, Kind::Installer).map(|a| a.name.as_str()), Some("VeloPhi-v26.64.1-windows-x64-setup.exe"));
        // The file names decide, not the tag
        assert_eq!(parse_release(&release_json("whatever", "26.65", "")).unwrap().version, Version(26, 65, 0));
    }

    #[test]
    fn release_description_refused() {
        for bad in ["", "not json", "[]", "null", "{}", r#"{"tag_name":7}"#, r#"{"tag_name":"a/b","assets":[]}"#, r#"{"tag_name":"a b"}"#, r#"{"tag_name":".."}"#, r#"{"tag_name":"latest","assets":[]}"#] {
            assert!(parse_release(bad).is_err_and(|e| e.starts_with("malformed")), "{bad}");
        }
        assert!(parse_release(&release_json("v26.64", "26.64", r#","draft":true"#).replace(r#""draft":false,"#, "")).is_err());
        assert!(parse_release(&release_json("v26.64", "26.64", "").replace(r#""prerelease":false"#, r#""prerelease":true"#)).is_err());
        // Files of two versions in one release
        let mixed = release_json("v26.64", "26.64", "").replace("VeloPhi-v26.64-web.zip", "VeloPhi-v26.63-web.zip");
        assert_eq!(parse_release(&mixed).unwrap_err(), "malformed: files of different versions");
        // A release without the script's files is only announced
        let bare = parse_release(r#"{"tag_name":"Release26.70(2027.01.05)","body":null,"assets":[{"name":"notes.pdf","size":10}]}"#).unwrap();
        assert_eq!((bare.version, bare.version_text.as_str(), bare.notes.as_str()), (Version(26, 70, 0), "26.70", ""));
        assert!(pick_asset(&bare, Kind::Installer).is_none() && bare.sums.is_none());
        // A file still uploading, a wrong digest form, an oversized checksum file
        let pending = parse_release(&release_json("v26.64", "26.64", "").replacen(r#""size":11153878,"state":"uploaded""#, r#""size":11153878,"state":"open""#, 1)).unwrap();
        assert!(pick_asset(&pending, Kind::Installer).is_none());
        let odd = parse_release(&release_json("v26.64", "26.64", "").replace("sha256:5151", "md5:5151")).unwrap();
        assert_eq!(pick_asset(&odd, Kind::Android).and_then(|a| a.digest.clone()), None);
        assert!(parse_release(&release_json("v26.64", "26.64", "").replace(r#""size":842"#, r#""size":99999999"#)).unwrap().sums.is_none());
        // Notes: control characters go, the length is bounded
        let long = format!(r#"{{"tag_name":"v26.64","body":"a\u0000\u001b[31mb\u0007{}","assets":[]}}"#, "x".repeat(20000));
        let notes = parse_release(&long).unwrap().notes;
        assert!(notes.starts_with("a[31mbxxx") && notes.chars().count() == MAX_NOTES);
    }

    #[test]
    fn checksum_file() {
        let h1 = "335f160e8e7e98d95c4d9aa03fcc40a2b052de4fad1e0e7b6516533633a1ba2d";
        let h2 = "42a50b85831c1d80c2a25de0c2aa7309a712d60387091df66ef3e0ea2d76a5d2";
        // As Set-Content -Encoding ASCII writes it: CRLF
        let text = format!("{h2}  VeloPhi-v26.63-windows-x64-portable.exe\r\n{h1}  VeloPhi-v26.63-windows-x64-setup.exe\r\n");
        assert_eq!(sums_lookup(&text, "VeloPhi-v26.63-windows-x64-setup.exe").as_deref(), Ok(h1));
        assert_eq!(sums_lookup(&text, "VeloPhi-v26.63-windows-x64-portable.exe").as_deref(), Ok(h2));
        assert_eq!(sums_lookup(&text, "VeloPhi-v26.63-android.apk"), Err(SumsError::Missing));
        // The whole name must match, not a part of it
        assert_eq!(sums_lookup(&text, "setup.exe"), Err(SumsError::Missing));
        assert_eq!(sums_lookup(&text, "VeloPhi-v26.63-windows-x64-setup.ex"), Err(SumsError::Missing));
        assert_eq!(sums_lookup(&format!("{h1}  xVeloPhi.apk\n"), "VeloPhi.apk"), Err(SumsError::Missing));
        // sha256sum's binary marker, upper-case digits, a byte order mark, LF
        assert_eq!(sums_lookup(&format!("\u{feff}{} *a.apk\n", h1.to_uppercase()), "a.apk").as_deref(), Ok(h1));
        // Lines of another form are skipped: short hash, one blank, a tab, a comment
        let odd = format!("# comment\n{} a.apk\n{}\ta.apk\n{h1} a.apk\n\n", &h1[..63], h1);
        assert_eq!(sums_lookup(&odd, "a.apk"), Err(SumsError::Missing));
        // The same file twice: the same hash is fine, two hashes are not
        assert_eq!(sums_lookup(&format!("{h1}  a.apk\n{h1}  a.apk\n"), "a.apk").as_deref(), Ok(h1));
        assert_eq!(sums_lookup(&format!("{h1}  a.apk\n{h2}  a.apk\n"), "a.apk"), Err(SumsError::Ambiguous));
        assert_eq!(sums_lookup("", "a.apk"), Err(SumsError::Missing));
        assert_eq!(sums_lookup("ééééééééééééééééééééééééééééééééééééééééééééé  a.apk", "a.apk"), Err(SumsError::Missing));
    }

    #[test]
    fn addresses() {
        // The form GitHub itself gives for the 26.63 release (parentheses encoded)
        assert_eq!(asset_url("Release26.63(2026.12.13)", "VeloPhi-v26.63-windows-x64-setup.exe").as_deref(), Some("https://github.com/Stevenzhang543/VeloPhi/releases/download/Release26.63%282026.12.13%29/VeloPhi-v26.63-windows-x64-setup.exe"));
        assert_eq!(asset_url("v26.64", SUMS_NAME).as_deref(), Some("https://github.com/Stevenzhang543/VeloPhi/releases/download/v26.64/SHA256SUMS.txt"));
        assert_eq!(encode_segment("a?b#c%d&e 版"), "a%3Fb%23c%25d%26e%20%E7%89%88");
        for (tag, name) in [("", "a.exe"), ("..", "a.exe"), (".", "a.exe"), ("a/b", "a.exe"), ("a\\b", "a.exe"), ("a b", "a.exe"), ("a\nb", "a.exe"), ("v1", ""), ("v1", "../a.exe"), ("v1", "a/b.exe"), ("v1", "a b.exe"), ("v1", ".hidden"), ("v1", "a?.exe")] {
            assert_eq!(asset_url(tag, name), None, "{tag:?} {name:?}");
        }
        assert_eq!(release_page_url("Release26.63(2026.12.13)"), "https://github.com/Stevenzhang543/VeloPhi/releases/tag/Release26.63%282026.12.13%29");
        assert_eq!(release_page_url("a/b"), RELEASES_PAGE);
        assert!(crate::net::allowed_open(&release_page_url("Release26.63(2026.12.13)")) && crate::net::allowed_open(&release_page_url("it's\"`")));
    }

    #[test]
    fn allowed_hosts() {
        let url = |s: &str| reqwest::Url::parse(s).unwrap();
        let start = "https://github.com/Stevenzhang543/VeloPhi/releases/download/v26.64/VeloPhi-v26.64-android.apk";
        assert!(allowed_download_start(&url(start)) && allowed_download_hop(&url(start)));
        // What github.com answered for the 26.63 installer on 2026-11-13, and the host it used before
        assert!(allowed_download_hop(&url("https://release-assets.githubusercontent.com/github-production-release-asset/1104800954/875f8f1e-bd45-49eb-813b-fa8e3b46455c?sp=r&sig=x")));
        assert!(allowed_download_hop(&url("https://objects.githubusercontent.com/github-production-release-asset-2e65be/1/2?X-Amz-Signature=x")));
        assert!(!allowed_download_start(&url("https://release-assets.githubusercontent.com/github-production-release-asset/1/2")));
        for bad in [
            "http://github.com/Stevenzhang543/VeloPhi/releases/download/v26.64/a.apk",
            "https://github.com/Someone/VeloPhi/releases/download/v26.64/a.apk",
            "https://github.com/Stevenzhang543/VeloPhi/releases/download/../../../../Someone/x/releases/download/v1/a.apk",
            "https://github.com/Stevenzhang543/VeloPhi/archive/refs/heads/main.zip",
            "https://github.com.evil.example/Stevenzhang543/VeloPhi/releases/download/v26.64/a.apk",
            "https://evil.example/Stevenzhang543/VeloPhi/releases/download/v26.64/a.apk",
            "https://github.com@evil.example/Stevenzhang543/VeloPhi/releases/download/v26.64/a.apk",
            "https://user@github.com/Stevenzhang543/VeloPhi/releases/download/v26.64/a.apk",
            "https://github.com:8443/Stevenzhang543/VeloPhi/releases/download/v26.64/a.apk",
            "https://raw.githubusercontent.com/github-production-release-asset/1/2",
            "https://release-assets.githubusercontent.com.evil.example/github-production-release-asset/1/2",
            "https://xrelease-assets.githubusercontent.com/github-production-release-asset/1/2",
            "https://release-assets.githubusercontent.com/other/1/2",
            "http://release-assets.githubusercontent.com/github-production-release-asset/1/2",
            "https://api.github.com/repos/Stevenzhang543/VeloPhi/releases/latest",
            "file:///C:/Windows/System32/calc.exe",
        ] {
            assert!(!allowed_download_hop(&url(bad)), "{bad}");
        }
        assert!(allowed_api(&url(API_LATEST)) && allowed_api(&url("https://api.github.com/repositories/1104800954/releases/latest")));
        for bad in ["https://api.github.com/repos/Someone/VeloPhi/releases/latest", "http://api.github.com/repos/Stevenzhang543/VeloPhi/releases/latest", "https://api.github.com.evil.example/repos/Stevenzhang543/VeloPhi/releases/latest", "https://github.com/repos/Stevenzhang543/VeloPhi/releases/latest", "https://api.github.com/repositories/1/contents/x"] {
            assert!(!allowed_api(&url(bad)), "{bad}");
        }
    }

    #[test]
    fn hashing_and_files() {
        // FIPS 180-4 examples
        assert_eq!(hex(&Sha256::digest(b"abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert_eq!(hex(&Sha256::digest(b"")), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        let dir = std::env::temp_dir().join(format!("velophi-update-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("VeloPhi-v26.64-windows-x64-portable.exe");
        std::fs::write(&file, b"abc").unwrap();
        assert_eq!(hash_file(&file).unwrap(), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        // A million 'a' (longer than the read buffer)
        let big = dir.join("big.part");
        std::fs::write(&big, vec![b'a'; 1_000_000]).unwrap();
        assert_eq!(hash_file(&big).unwrap(), "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
        // A taken name gets a number; the existing file is never replaced
        assert_eq!(free_name(&dir, "new.exe"), Some(dir.join("new.exe")));
        assert_eq!(free_name(&dir, "VeloPhi-v26.64-windows-x64-portable.exe"), Some(dir.join("VeloPhi-v26.64-windows-x64-portable (2).exe")));
        // Cleaning keeps the verified file and folders
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        clean_dir(&dir, Some(&file));
        assert!(file.exists() && !big.exists() && dir.join("sub").is_dir());
        assert!(same_dir(&dir, &dir.join("sub").join("..")) && !same_dir(&dir, &dir.join("sub")) && !same_dir(&dir, Path::new("")));
        std::fs::remove_dir_all(&dir).unwrap();
        assert_eq!(INSTALLER_ARGS, ["/P", "/R", "/UPDATE"]);
    }

    #[test]
    fn download_gate() {
        let setup = Asset { name: "VeloPhi-v26.65-windows-x64-setup.exe".into(), size: 11_000_000, digest: None };
        let sums = Asset { name: SUMS_NAME.into(), size: 842, digest: None };
        let offer = Offer { tag: "Release26.65(2027.01.10)".into(), version: Version(26, 65, 0), kind: Kind::Installer, asset: Some(setup.clone()), sums: Some(sums.clone()) };
        let running = Version(26, 64, 0);
        let plan = plan_download(Some(&offer), "Release26.65(2027.01.10)", running).unwrap_or_else(|e| panic!("{e}"));
        assert_eq!(plan.kind, Kind::Installer);
        assert_eq!(plan.asset_address, "https://github.com/Stevenzhang543/VeloPhi/releases/download/Release26.65%282027.01.10%29/VeloPhi-v26.65-windows-x64-setup.exe");
        assert_eq!(plan.sums_address, "https://github.com/Stevenzhang543/VeloPhi/releases/download/Release26.65%282027.01.10%29/SHA256SUMS.txt");
        let refused = |offer: Option<&Offer>, tag: &str, current: Version| plan_download(offer, tag, current).err();
        // Nothing was checked yet; the page names another tag, an address or a path
        assert_eq!(refused(None, "Release26.65(2027.01.10)", running).as_deref(), Some("stale"));
        for tag in ["", "v26.65", "Release26.65(2027.01.10) ", "release26.65(2027.01.10)", "https://evil.example/a.exe", "../../evil"] {
            assert_eq!(refused(Some(&offer), tag, running).as_deref(), Some("stale"), "{tag}");
        }
        // Never the same or an older version, however it is written
        for current in [Version(26, 65, 0), Version(26, 65, 1), Version(26, 66, 0), Version(27, 0, 0)] {
            assert_eq!(refused(Some(&offer), &offer.tag, current).as_deref(), Some("stale"), "{current:?}");
        }
        assert!(plan_download(Some(&offer), &offer.tag, Version(26, 64, 9)).is_ok());
        // The file must be the one of this build's kind and of the offered version, of a size that can be verified
        let with = |change: &dyn Fn(&mut Offer)| {
            let mut o = offer.clone();
            change(&mut o);
            refused(Some(&o), &o.tag.clone(), running)
        };
        assert_eq!(with(&|o| o.asset = None).as_deref(), Some("no-asset"));
        assert_eq!(with(&|o| o.sums = None).as_deref(), Some("no-sums"));
        assert_eq!(with(&|o| o.kind = Kind::Portable).as_deref(), Some("no-asset"));
        assert_eq!(with(&|o| o.kind = Kind::Other).as_deref(), Some("no-asset"));
        assert_eq!(with(&|o| o.version = Version(26, 66, 0)).as_deref(), Some("no-asset"));
        assert_eq!(with(&|o| o.asset.as_mut().unwrap().name = "VeloPhi-v26.65-android.apk".into()).as_deref(), Some("no-asset"));
        assert_eq!(with(&|o| o.asset.as_mut().unwrap().name = "evil.exe".into()).as_deref(), Some("no-asset"));
        assert_eq!(with(&|o| o.asset.as_mut().unwrap().size = 0).as_deref(), Some("no-asset"));
        assert_eq!(with(&|o| o.asset.as_mut().unwrap().size = MAX_ASSET + 1).as_deref(), Some("no-asset"));
        assert_eq!(with(&|o| o.asset.as_mut().unwrap().size = MAX_ASSET), None);
        assert_eq!(with(&|o| o.tag = "a/b".into()).as_deref(), Some("stale"));
    }

    #[test]
    fn linux_assets() {
        // The three names of the release script, and nothing close to them
        assert_eq!(parse_asset_name("VeloPhi-v26.65-linux-amd64.deb"), Some((Version(26, 65, 0), "26.65", "linux-amd64.deb")));
        assert_eq!(parse_asset_name("VeloPhi-v26.65-linux-x86_64.rpm"), Some((Version(26, 65, 0), "26.65", "linux-x86_64.rpm")));
        assert_eq!(parse_asset_name("VeloPhi-v26.65.1-linux-x86_64.AppImage"), Some((Version(26, 65, 1), "26.65.1", "linux-x86_64.AppImage")));
        for bad in [
            "VeloPhi-v26.65-linux-x86_64.appimage",
            "VeloPhi-v26.65-linux-amd64.AppImage",
            "VeloPhi-v26.65-linux-x86_64.deb",
            "VeloPhi-v26.65-linux-amd64.rpm",
            "VeloPhi-v26.65-linux-aarch64.AppImage",
            "VeloPhi_26.65.0_amd64.deb",
            "VeloPhi-26.65.0-1.x86_64.rpm",
            "VeloPhi_26.65.0_amd64.AppImage",
            "VeloPhi-v26.65-linux-x86_64.AppImage.zsync",
        ] {
            assert_eq!(parse_asset_name(bad), None, "{bad}");
        }
        // Every name is one that needs no encoding in the download address
        for s in SUFFIXES {
            assert!(plain_file_name(&format!("VeloPhi-v26.65.1-{s}")), "{s}");
        }
        let r = parse_release(&release_json("Release26.65(2027.01.10)", "26.65", "")).unwrap();
        assert_eq!(r.version, Version(26, 65, 0));
        assert_eq!(pick_asset(&r, Kind::AppImage).map(|a| (a.name.as_str(), a.size)), Some(("VeloPhi-v26.65-linux-x86_64.AppImage", 90_000_003)));
        assert_eq!(pick_asset(&r, Kind::Deb).map(|a| a.name.as_str()), Some("VeloPhi-v26.65-linux-amd64.deb"));
        assert_eq!(pick_asset(&r, Kind::Rpm).and_then(|a| a.digest.clone()), Some("e1".repeat(32)));
        // The Windows and Android files are still the ones picked for those kinds
        assert_eq!(pick_asset(&r, Kind::Installer).map(|a| a.name.as_str()), Some("VeloPhi-v26.65-windows-x64-setup.exe"));
        assert_eq!(pick_asset(&r, Kind::Android).map(|a| a.name.as_str()), Some("VeloPhi-v26.65-android.apk"));
        // A Linux file of another version makes the release inconsistent like any other file
        let mixed = release_json("v26.65", "26.65", "").replace("VeloPhi-v26.65-linux-x86_64.rpm", "VeloPhi-v26.64-linux-x86_64.rpm");
        assert_eq!(parse_release(&mixed).unwrap_err(), "malformed: files of different versions");
        // A release without Linux files (26.64): nothing to install on Linux, the page only
        let old = release_json("v26.64", "26.64", "").replace("linux-", "removed-");
        let old = parse_release(&old).unwrap();
        for kind in [Kind::AppImage, Kind::Deb, Kind::Rpm] {
            assert_eq!(pick_asset(&old, kind), None, "{kind:?}");
        }
        // How the kinds are sent to the page
        let names: Vec<String> = [Kind::Installer, Kind::Portable, Kind::Android, Kind::AppImage, Kind::Deb, Kind::Rpm, Kind::Other].iter().map(|k| serde_json::to_string(k).unwrap()).collect();
        assert_eq!(names, ["\"installer\"", "\"portable\"", "\"android\"", "\"appimage\"", "\"deb\"", "\"rpm\"", "\"other\""]);
    }

    #[test]
    fn linux_kinds() {
        use LinuxBundle::*;
        let app = Some("/home/u/Apps/VeloPhi-v26.65-linux-x86_64.AppImage");
        let mount = Some("/tmp/.mount_VeloPhAbC123/usr/bin/velophi");
        let usr = Some(INSTALLED_EXE);
        // As packaged: the AppImage started from its file; the deb and the rpm run from where they were installed
        assert_eq!(linux_kind(Some(AppImage), false, app, true, mount), Kind::AppImage);
        assert_eq!(linux_kind(Some(Deb), false, None, false, usr), Kind::Deb);
        assert_eq!(linux_kind(Some(Rpm), false, None, false, usr), Kind::Rpm);
        // A renamed AppImage is still one
        assert_eq!(linux_kind(Some(AppImage), false, Some("/home/u/velophi"), true, mount), Kind::AppImage);
        // The AppImage runtime did not name an existing absolute file: unpacked by hand, or a stray variable
        assert_eq!(linux_kind(Some(AppImage), false, None, false, mount), Kind::Other);
        assert_eq!(linux_kind(Some(AppImage), false, app, false, mount), Kind::Other);
        assert_eq!(linux_kind(Some(AppImage), false, Some("VeloPhi.AppImage"), true, mount), Kind::Other);
        // The executable of a package copied or unpacked somewhere else
        assert_eq!(linux_kind(Some(Deb), false, None, false, Some("/home/u/x/usr/bin/velophi")), Kind::Other);
        assert_eq!(linux_kind(Some(Rpm), false, None, false, None), Kind::Other);
        // An APPIMAGE variable does not make a deb an AppImage
        assert_eq!(linux_kind(Some(Deb), false, app, true, usr), Kind::Deb);
        // A build of one's own (no bundle type) and any store build only get the release page
        assert_eq!(linux_kind(None, false, app, true, usr), Kind::Other);
        for b in [AppImage, Deb, Rpm] {
            assert_eq!(linux_kind(Some(b), true, app, true, usr), Kind::Other, "{b:?}");
        }
    }

    #[test]
    fn package_tools() {
        let only = |have: &'static [&'static str]| move |p: &str| have.contains(&p);
        let ubuntu = "PRETTY_NAME=\"Ubuntu 22.04.5 LTS\"\nID=ubuntu\nID_LIKE=debian\n";
        let fedora = "NAME=\"Fedora Linux\"\nID=fedora\nVERSION_ID=44\n";
        let leap = "NAME=\"openSUSE Leap\"\nID=\"opensuse-leap\"\nID_LIKE=\"suse opensuse\"\n";
        let tumbleweed = "ID=\"opensuse-tumbleweed\"\nID_LIKE=\"opensuse suse\"\n";
        assert!(os_like(leap, "suse") && os_like(tumbleweed, "suse") && os_like(ubuntu, "debian"));
        assert!(!os_like(fedora, "suse") && !os_like(ubuntu, "suse") && !os_like("ID=pseudosuse\n", "suse"));
        // deb: apt-get (dependencies resolved), else dpkg
        assert_eq!(package_tool(Kind::Deb, ubuntu, &only(&["/usr/bin/apt-get", "/usr/bin/dpkg"])), Some(APT));
        assert_eq!(package_tool(Kind::Deb, ubuntu, &only(&["/usr/bin/dpkg"])), Some(DPKG));
        assert_eq!(package_tool(Kind::Deb, ubuntu, &only(&["/usr/bin/dnf", "/usr/bin/rpm"])), None);
        // rpm: dnf on Fedora, zypper on openSUSE (even with dnf installed there), rpm as the last resort
        assert_eq!(package_tool(Kind::Rpm, fedora, &only(&["/usr/bin/dnf", "/usr/bin/rpm"])), Some(DNF));
        assert_eq!(package_tool(Kind::Rpm, leap, &only(&["/usr/bin/zypper", "/usr/bin/rpm"])), Some(ZYPPER));
        assert_eq!(package_tool(Kind::Rpm, tumbleweed, &only(&["/usr/bin/zypper", "/usr/bin/dnf", "/usr/bin/rpm"])), Some(ZYPPER));
        assert_eq!(package_tool(Kind::Rpm, fedora, &only(&["/usr/bin/zypper", "/usr/bin/rpm"])), Some(ZYPPER));
        assert_eq!(package_tool(Kind::Rpm, "", &only(&["/usr/bin/rpm"])), Some(RPM));
        assert_eq!(package_tool(Kind::Rpm, fedora, &only(&[])), None);
        // Other kinds never reach a package tool
        for kind in [Kind::Installer, Kind::Portable, Kind::Android, Kind::AppImage, Kind::Other] {
            assert_eq!(package_tool(kind, ubuntu, &only(&["/usr/bin/apt-get", "/usr/bin/dnf", "/usr/bin/zypper", "/usr/bin/rpm", "/usr/bin/dpkg"])), None, "{kind:?}");
        }
        // Absolute programs only, no shell anywhere
        for t in [APT, DPKG, DNF, ZYPPER, RPM] {
            assert!(t.program.starts_with("/usr/bin/") && !t.args.iter().any(|a| a.contains([';', '&', '|', '$', '`'])), "{t:?}");
        }
        assert!(PKEXEC.starts_with("/usr/bin/"));
        // The commands shown for installing by hand quote the path for the shell
        assert_eq!(shell_quote("/home/u/下载/VeloPhi-v26.66-linux-amd64.deb"), "'/home/u/下载/VeloPhi-v26.66-linux-amd64.deb'");
        assert_eq!(shell_quote("/home/o'neil/a b.deb"), r"'/home/o'\''neil/a b.deb'");
        assert_eq!(by_hand_command(Kind::Deb, Some(APT), "/home/u/Downloads/x.deb"), "sudo apt install '/home/u/Downloads/x.deb'");
        assert_eq!(by_hand_command(Kind::Rpm, Some(ZYPPER), "/home/u/x.rpm"), "sudo zypper install --allow-unsigned-rpm '/home/u/x.rpm'");
        assert_eq!(by_hand_command(Kind::Rpm, None, "/x.rpm"), "sudo dnf install '/x.rpm'");
        assert_eq!(by_hand_command(Kind::Deb, None, "/x.deb"), "sudo apt install '/x.deb'");
        // pkexec's answers
        assert_eq!(tool_outcome(Some(0), ""), Ok(()));
        assert_eq!(tool_outcome(Some(126), "Error executing command as another user: Request dismissed"), Err(ToolFailure::Cancelled));
        assert_eq!(tool_outcome(Some(127), "Error executing command as another user: No authentication agent found."), Err(ToolFailure::NoAgent));
        assert_eq!(tool_outcome(Some(100), "Reading package lists...\nE: Unable to locate package x\n\n"), Err(ToolFailure::Failed(Some(100), "E: Unable to locate package x".into())));
        assert_eq!(tool_outcome(None, "\u{1b}[31mkilled"), Err(ToolFailure::Failed(None, "[31mkilled".into())));
        // What the page gets
        let m = manual_for(Kind::Deb, Some(APT), ToolFailure::Failed(Some(100), "E: broken".into()), "/home/u/Downloads/VeloPhi-v26.66-linux-amd64.deb");
        assert_eq!((m.reason, m.code, m.detail.as_str()), ("failed", Some(100), "E: broken"));
        assert_eq!(m.command, "sudo apt install '/home/u/Downloads/VeloPhi-v26.66-linux-amd64.deb'");
        let json = serde_json::to_value(&m).unwrap();
        assert_eq!(json, serde_json::json!({ "reason": "failed", "code": 100, "detail": "E: broken", "path": "/home/u/Downloads/VeloPhi-v26.66-linux-amd64.deb", "command": "sudo apt install '/home/u/Downloads/VeloPhi-v26.66-linux-amd64.deb'" }));
        for (failure, reason) in [(ToolFailure::Cancelled, "cancelled"), (ToolFailure::NoAgent, "no-agent"), (ToolFailure::NoTool, "no-tool")] {
            let m = manual_for(Kind::Rpm, None, failure, "/x.rpm");
            assert_eq!((m.reason, m.code, m.detail.as_str(), m.command.as_str()), (reason, None, "", "sudo dnf install '/x.rpm'"));
        }
    }

    #[test]
    fn linux_download_gate() {
        let running = Version(26, 65, 0);
        let sums = Asset { name: SUMS_NAME.into(), size: 900, digest: None };
        for (kind, name) in [(Kind::AppImage, "VeloPhi-v26.66-linux-x86_64.AppImage"), (Kind::Deb, "VeloPhi-v26.66-linux-amd64.deb"), (Kind::Rpm, "VeloPhi-v26.66-linux-x86_64.rpm")] {
            let offer = Offer { tag: "v26.66".into(), version: Version(26, 66, 0), kind, asset: Some(Asset { name: name.into(), size: 90_000_000, digest: None }), sums: Some(sums.clone()) };
            let plan = plan_download(Some(&offer), "v26.66", running).unwrap_or_else(|e| panic!("{kind:?}: {e}"));
            assert_eq!(plan.asset_address, format!("https://github.com/Stevenzhang543/VeloPhi/releases/download/v26.66/{name}"));
            // The file of another Linux form, or of Windows, is refused for this kind
            for other in ["VeloPhi-v26.66-linux-x86_64.AppImage", "VeloPhi-v26.66-linux-amd64.deb", "VeloPhi-v26.66-linux-x86_64.rpm", "VeloPhi-v26.66-windows-x64-portable.exe"] {
                if other != name {
                    let mut o = offer.clone();
                    o.asset.as_mut().unwrap().name = other.into();
                    assert_eq!(plan_download(Some(&o), "v26.66", running).err().as_deref(), Some("no-asset"), "{kind:?} {other}");
                }
            }
        }
    }

    #[test]
    fn expected_hashes() {
        let h1 = "335f160e8e7e98d95c4d9aa03fcc40a2b052de4fad1e0e7b6516533633a1ba2d";
        let h2 = "42a50b85831c1d80c2a25de0c2aa7309a712d60387091df66ef3e0ea2d76a5d2";
        let text = format!("{h2}  VeloPhi-v26.63-windows-x64-portable.exe\r\n{h1}  VeloPhi-v26.63-windows-x64-setup.exe\r\n");
        let of_text = hex(&Sha256::digest(text.as_bytes()));
        let sums = |digest: Option<&str>| Asset { name: SUMS_NAME.into(), size: text.len() as u64, digest: digest.map(str::to_string) };
        let file = |name: &str, digest: Option<&str>| Asset { name: name.into(), size: 1, digest: digest.map(str::to_string) };
        let setup = "VeloPhi-v26.63-windows-x64-setup.exe";
        // The line of the checksum file, with or without GitHub's digests
        assert_eq!(expected_hash(&text, &sums(None), &file(setup, None)).as_deref(), Ok(h1));
        assert_eq!(expected_hash(&text, &sums(Some(&of_text)), &file(setup, Some(h1))).as_deref(), Ok(h1));
        // No line for the file: nothing can be verified, nothing is downloaded
        assert_eq!(expected_hash(&text, &sums(None), &file("VeloPhi-v26.63-android.apk", Some(h1))).unwrap_err(), "sums-missing");
        assert_eq!(expected_hash("", &sums(None), &file(setup, None)).unwrap_err(), "sums-missing");
        // The checksum file is not the one GitHub has; GitHub's digest of the file says something else; two lines disagree
        assert_eq!(expected_hash(&text, &sums(Some(h2)), &file(setup, None)).unwrap_err(), "hash-mismatch");
        assert_eq!(expected_hash(&text, &sums(None), &file(setup, Some(h2))).unwrap_err(), "hash-mismatch");
        assert_eq!(expected_hash(&format!("{text}{h2}  {setup}\n"), &sums(None), &file(setup, None)).unwrap_err(), "hash-mismatch");
    }

    /// The real thing against GitHub (needs the network, downloads the installer of the latest release once, about
    /// 11 MB, into the temporary folder and deletes it): `cargo test --lib live_release -- --ignored --nocapture`.
    #[test]
    #[ignore = "network"]
    fn live_release() {
        tauri::async_runtime::block_on(async {
            let api = client(allowed_api).timeout(Duration::from_secs(20)).build().unwrap();
            let release = parse_release(&fetch_text(&api, API_LATEST, Some("application/vnd.github+json"), MAX_JSON, allowed_api).await.unwrap()).unwrap();
            println!("latest: tag {:?}, version {}, published {}, {} files", release.tag, show_version(release.version), release.published, release.assets.len());
            assert!(release.version >= Version(26, 63, 0));
            let http = client(allowed_download_hop).connect_timeout(Duration::from_secs(15)).read_timeout(Duration::from_secs(30)).build().unwrap();
            let sums = fetch_text(&http, &asset_url(&release.tag, SUMS_NAME).unwrap(), None, MAX_SUMS, allowed_download_hop).await.unwrap();
            assert_eq!(release.sums.as_ref().and_then(|s| s.digest.clone()), Some(hex(&Sha256::digest(sums.as_bytes()))));
            for kind in [Kind::Installer, Kind::Portable, Kind::Android] {
                let asset = pick_asset(&release, kind).unwrap();
                let expected = sums_lookup(&sums, &asset.name).unwrap();
                println!("{kind:?}: {} ({} bytes) sha256 {expected}", asset.name, asset.size);
                assert_eq!(asset.digest.as_deref(), Some(expected.as_str()));
                assert!(asset.size > 0 && asset.size <= MAX_ASSET);
            }
            let asset = pick_asset(&release, Kind::Installer).unwrap();
            let dest = std::env::temp_dir().join(format!("velophi-update-live-{}.part", std::process::id()));
            let _ = std::fs::remove_file(&dest);
            let seen = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
            let count = seen.clone();
            let progress = Channel::new(move |_| {
                count.fetch_add(1, Ordering::SeqCst);
                Ok(())
            });
            let got = download_file(&http, &asset_url(&release.tag, &asset.name).unwrap(), &dest, asset.size, &progress).await;
            let on_disk = hash_file(&dest);
            let _ = std::fs::remove_file(&dest);
            assert_eq!(got.as_deref().ok(), sums_lookup(&sums, &asset.name).as_deref().ok());
            assert_eq!(on_disk.ok(), got.ok());
            println!("downloaded and verified {}; {} progress messages", asset.name, seen.load(Ordering::SeqCst));
            // A wrong size is refused before anything is kept
            let short = download_file(&http, &asset_url(&release.tag, SUMS_NAME).unwrap(), &dest, 1, &progress).await;
            let _ = std::fs::remove_file(&dest);
            assert_eq!(short, Err("size".to_string()));
        });
    }
}
