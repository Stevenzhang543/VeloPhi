#!/usr/bin/env bash
# Linux packages of a release (26.65, D298): deb, rpm and AppImage for x86_64, built on Ubuntu 22.04 (glibc 2.35) in the
# WSL distribution VeloPhi-Build-2204 (scripts/linux/setup-build-env.sh). Run from the repository root on Windows:
#
#   wsl -d VeloPhi-Build-2204 --cd <repository> -- bash scripts/linux/build-linux.sh 26.65
#
# (scripts\release.cmd does this right after the Windows build.) What it does:
#  1. copies the Windows working tree (the same files the Windows build used, uncommitted changes included) to the
#     Linux file system (/build/velophi; building on /mnt/e is slow and the AppImage tools need Linux file semantics);
#  2. copies the front end the Windows build has just produced (dist/) and proves with a file-by-file SHA-256 list that
#     it is byte for byte the same, and that the WebAssembly core in it is the one in the repository — the front end and
#     the WebAssembly core are never rebuilt here, so every platform ships the same bytes, and no Node is needed;
#  3. runs the engine tests natively on Linux (skip with VELOPHI_LINUX_SKIP_ENGINE_TESTS=1, e.g. for a quick rebuild);
#  4. builds the shell and packs deb, rpm and AppImage (`cargo tauri build`, beforeBuildCommand switched off by
#     scripts/linux/release.conf.json), and copies them under their release names to .cache/linux-<version>/;
#  5. writes the evidence to .cache/evidence-<version>/linux/: the glibc floor (objdump) checked against the package
#     dependencies, package metadata (dpkg-deb -I, rpm -qip), file lists, sizes, SHA-256, the AppImage's bundled
#     libraries and start-up hooks, desktop-file and AppStream validation, tool and system package versions;
#  6. runs the release self-check (`velophi --selftest`: every template on the native engine and on WebAssembly) under
#     Xvfb for the deb's program and for the AppImage, and fails when they disagree.
# No Git operations of any kind. Nothing outside /build, ~/.cache/tauri and the two .cache folders is written.
set -euo pipefail

V="${1:?version as in the release file names, e.g. 26.65}"
case "$V" in *.*.*) FULL="$V" ;; *.*) FULL="$V.0" ;; *) echo "bad version: $V"; exit 2 ;; esac
RUST_VERSION="1.92.0"
TAURI_CLI_VERSION="2.12.4"

WIN="$(pwd -P)"
B=/build/velophi
OUT="$WIN/.cache/linux-$V"
EV="$WIN/.cache/evidence-$V/linux"
export PATH="$HOME/.cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"   # never the Windows tools
export CARGO_TERM_COLOR=never CI=true RUSTUP_TOOLCHAIN="$RUST_VERSION" LC_ALL=C.UTF-8 TZ=UTC
# linuxdeploy and the AppImage under test run without FUSE
export APPIMAGE_EXTRACT_AND_RUN=1
umask 022

say() { printf '[linux] %s\n' "$*"; }
fail() { printf '[linux] FAILED: %s\n' "$*" >&2; exit 1; }
# shellcheck disable=SC1091
[ "$(. /etc/os-release; echo "$VERSION_ID")" = "22.04" ] || fail "the release packages must be built on Ubuntu 22.04 (glibc 2.35)"
[ -f "$WIN/src-tauri/tauri.conf.json" ] && [ -f "$WIN/dist/index.html" ] || fail "run from the repository root after the Windows build (dist/ is missing)"
CONF_VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$WIN/src-tauri/tauri.conf.json")"
[ "$CONF_VERSION" = "$FULL" ] || fail "tauri.conf.json says $CONF_VERSION, the release is $FULL"

# The previous run's files are kept once, outside the evidence folder (package-release.ps1 zips that folder whole)
if [ -d "$OUT" ]; then rm -rf "$OUT.old"; mv "$OUT" "$OUT.old"; fi
if [ -d "$EV" ]; then rm -rf "$OUT.evidence-old"; mv "$EV" "$OUT.evidence-old"; fi
mkdir -p "$OUT" "$EV" "$B"
T0=$(date +%s)

# ---- 1. sources ----
say "copying the working tree to $B"
# (Windows drives show every file as 0777: the copy gets ordinary modes, which the packages keep for their files)
rsync -a --delete --chmod=D755,F644 \
  --exclude=/.git --exclude=/node_modules --exclude=/dist --exclude=/.cache --exclude=/releases --exclude=/.verity-workspace \
  --exclude=/src-tauri/target --exclude=/src-tauri/gen --exclude=/engine/target --exclude=/engine/velophi-napi/target --exclude=node_modules \
  "$WIN/" "$B/"
# Templates of the packages: LF whatever the Windows checkout did
sed -i 's/\r$//' "$B"/src-tauri/linux/* "$B/scripts/linux/release.conf.json"
# AppStream: the version and date of this build
sed -i -E "s|<release version=\"[^\"]*\" date=\"[^\"]*\"/>|<release version=\"$FULL\" date=\"$(date -u +%F)\"/>|" "$B/src-tauri/linux/app.velophi.physics.metainfo.xml"

# ---- 2. the front end of the Windows build, byte for byte ----
say "copying dist/ and comparing it file by file"
rsync -a --delete --chmod=D755,F644 "$WIN/dist/" "$B/dist/"
list() { ( cd "$1" && find . -type f -print0 | sort -z | xargs -0 sha256sum ); }
list "$WIN/dist" > "$EV/dist-windows.sha256"
list "$B/dist" > "$EV/dist-linux.sha256"
cmp -s "$EV/dist-windows.sha256" "$EV/dist-linux.sha256" || fail "dist/ copied to Linux differs from the Windows one"
WASM="$(tr -d '\r\n ' < "$WIN/src/engine/velophi_core.wasm.sha256")"
grep -q "^$WASM " "$EV/dist-linux.sha256" || fail "the WebAssembly core in dist/ is not src/engine/velophi_core.wasm ($WASM)"
say "dist: $(wc -l < "$EV/dist-linux.sha256") files, WebAssembly core $WASM"

# ---- tools ----
cd "$B"
{ rustc --version; cargo --version; cargo tauri --version; } > "$EV/tools.txt"
grep -q "^rustc $RUST_VERSION " "$EV/tools.txt" || fail "rustc is not $RUST_VERSION (run scripts/linux/setup-build-env.sh)"
grep -q "tauri-cli $TAURI_CLI_VERSION" "$EV/tools.txt" || fail "tauri-cli is not $TAURI_CLI_VERSION (run scripts/linux/setup-build-env.sh)"
{ cat /etc/os-release; uname -srm; ldd --version | head -1; } > "$EV/build-system.txt"
dpkg-query -W > "$EV/build-packages.txt"
dpkg-query -W -f '${Package} ${Version}\n' libwebkit2gtk-4.1-0 libgtk-3-0 libsoup-3.0-0 libgstreamer1.0-0 gstreamer1.0-plugins-good libssl3 libc6 > "$EV/webkit-gtk-versions.txt"

# ---- 3. engine tests (native, Linux/glibc) ----
if [ "${VELOPHI_LINUX_SKIP_ENGINE_TESTS:-}" = "1" ]; then
  say "engine tests skipped (VELOPHI_LINUX_SKIP_ENGINE_TESTS=1)"; echo "skipped" > "$EV/engine-tests.log"
else
  say "engine tests (cargo test --release --workspace)"
  ( cd engine && cargo test --release --workspace --locked ) > "$EV/engine-tests.log" 2>&1 || { tail -40 "$EV/engine-tests.log"; fail "engine tests (see $EV/engine-tests.log)"; }
  grep -E '^test result:' "$EV/engine-tests.log" | awk '{p+=$4; f+=$6} END {print "engine tests: " p " passed, " f " failed"}' | tee "$EV/engine-tests-summary.txt"
fi

# ---- 4. build and pack ----
# The AppImage carries GStreamer for WebKit's audio and media. linuxdeploy copies every plugin of the build system; the
# ones below are never loaded by WebKit and some pull in libraries under the GPL without a library exception (libaa and
# libcaca bring S-Lang and gpm), so the plugin folder handed to linuxdeploy leaves them out (26.65).
GST_SYS=/usr/lib/x86_64-linux-gnu/gstreamer-1.0
GST_DIR="$HOME/.cache/velophi-gst-plugins"
GST_SKIP="libgstaasink.so libgstcacasink.so libgst1394.so libgstdv.so libgstshout2.so libgstcdparanoia.so libgstlibvisual.so libgstjack.so libgstoss4.so libgstossaudio.so libgstvideo4linux2.so"
rm -rf "$GST_DIR"; mkdir -p "$GST_DIR"
for f in "$GST_SYS"/*.so; do
  case " $GST_SKIP " in *" $(basename "$f") "*) continue ;; esac
  cp -L "$f" "$GST_DIR/"
done
export GSTREAMER_PLUGINS_DIR="$GST_DIR"
say "GStreamer plugins for the AppImage: $(ls "$GST_DIR" | wc -l) of $(ls "$GST_SYS"/*.so | wc -l) (left out: $GST_SKIP)"
say "cargo tauri build --bundles deb,rpm,appimage"
RUSTFLAGS="--remap-path-prefix=$B=/velophi --remap-path-prefix=$HOME/.cargo=/cargo" \
  cargo tauri build --ci --bundles deb,rpm,appimage --config scripts/linux/release.conf.json -- --locked > "$EV/tauri-build.log" 2>&1 \
  || { tail -60 "$EV/tauri-build.log"; fail "tauri build (see $EV/tauri-build.log)"; }
grep -q 'beforeBuildCommand' "$EV/tauri-build.log" && fail "the front end was rebuilt on Linux (beforeBuildCommand ran)"
R=src-tauri/target/release/bundle
DEB="VeloPhi-v$V-linux-amd64.deb"; RPM="VeloPhi-v$V-linux-x86_64.rpm"; APP="VeloPhi-v$V-linux-x86_64.AppImage"
cp "$R/deb/VeloPhi_${FULL}_amd64.deb" "$OUT/$DEB"
cp "$R/rpm/VeloPhi-${FULL}-1.x86_64.rpm" "$OUT/$RPM"
cp "$R/appimage/VeloPhi_${FULL}_amd64.AppImage" "$OUT/$APP"
chmod 0755 "$OUT/$APP"

# ---- 5. evidence ----
say "evidence"
X="$(mktemp -d /tmp/velophi-check.XXXXXX)"
trap 'rm -rf "$X"' EXIT
dpkg-deb -x "$OUT/$DEB" "$X/deb"
( cd "$X" && "$OUT/$APP" --appimage-extract > /dev/null && mv squashfs-root app )
# glibc: the highest symbol version any of the three programs needs, overall and from libc.so.6
floor() { objdump -T "$1" | grep -oE 'GLIBC_[0-9]+(\.[0-9]+)+' | sed 's/GLIBC_//' | sort -Vu | tail -1; }
libc_floor() { objdump -p "$1" | awk '/required from libc.so.6:/ {on=1; next} /required from/ {on=0} on' | grep -oE 'GLIBC_[0-9]+(\.[0-9]+)+' | sed 's/GLIBC_//' | sort -Vu | tail -1; }
{
  for f in "$X/deb/usr/bin/velophi" "$X/app/usr/bin/velophi" src-tauri/target/release/velophi; do echo "$(floor "$f") (libc.so.6: $(libc_floor "$f")) ${f#"$X/"}"; done
} > "$EV/glibc-floor-detail.txt"
GLIBC="$(awk '{print $1}' "$EV/glibc-floor-detail.txt" | sort -Vu | tail -1)"
echo "$GLIBC" > "$EV/glibc-floor.txt"
ldd src-tauri/target/release/velophi > "$EV/ldd.txt"
dpkg-deb -I "$OUT/$DEB" > "$EV/deb-control.txt"
dpkg-deb -c "$OUT/$DEB" > "$EV/deb-files.txt"
{ rpm -qip "$OUT/$RPM"; echo "--- requires"; rpm -qp --requires "$OUT/$RPM"; echo "--- recommends"; rpm -qp --recommends "$OUT/$RPM"; echo "--- provides"; rpm -qp --provides "$OUT/$RPM"; echo "--- files"; rpm -qlp "$OUT/$RPM"; } > "$EV/rpm-info.txt" 2>&1
# The package dependencies must not promise less than the program needs
DEB_LIBC="$(grep -oE 'libc6 \(>= [0-9.]+\)' "$EV/deb-control.txt" | grep -oE '[0-9]+(\.[0-9]+)+' || true)"
RPM_LIBC="$(grep -oE 'libc\.so\.6\(GLIBC_[0-9.]+\)' "$EV/rpm-info.txt" | grep -oE '[0-9]+(\.[0-9]+)+' | sort -Vu | tail -1 || true)"
LIBC_FLOOR="$(sed -E 's/.*libc.so.6: ([0-9.]+).*/\1/' "$EV/glibc-floor-detail.txt" | sort -Vu | tail -1)"
le() { [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -1)" = "$1" ]; }
[ -n "$DEB_LIBC" ] && le "$GLIBC" "$DEB_LIBC" || fail "the deb depends on libc6 >= ${DEB_LIBC:-?}, the program needs glibc $GLIBC"
[ -n "$RPM_LIBC" ] && le "$LIBC_FLOOR" "$RPM_LIBC" || fail "the rpm requires libc.so.6(GLIBC_${RPM_LIBC:-?}), the program needs $LIBC_FLOOR from libc.so.6"
le "$GLIBC" "2.35" || fail "glibc floor $GLIBC is above Ubuntu 22.04's 2.35"
# What the AppImage brings along, and the environment its start-up hooks set
( cd "$X/app" && find . -name '*.so*' -type f | sort ) > "$EV/appimage-libraries.txt"
# The Ubuntu source package of every bundled library: docs/THIRD_PARTY_NOTICES.md lists these by hand (scripts/linux_notices.md)
while read -r f; do
  p="$(dpkg -S "/$(basename "$f")" 2>/dev/null | head -1 | cut -d: -f1 || true)"
  [ -n "$p" ] || p="$(dpkg -S "$(basename "$f")" 2>/dev/null | grep -v -- '-dev' | head -1 | cut -d: -f1 || true)"
  if [ -n "$p" ]; then echo "$(dpkg-query -W -f '${source:Package} ${source:Version}' "$p") $(basename "$f")"; else echo "? ? $(basename "$f")"; fi
done < "$EV/appimage-libraries.txt" | sort > "$EV/appimage-packages.txt"
awk '{print $1, $2}' "$EV/appimage-packages.txt" | sort -u > "$EV/appimage-source-packages.txt"
( cd "$X/app" && ls -la AppRun* .DirIcon *.desktop *.png 2>&1; echo; for h in apprun-hooks/*; do echo "=== $h"; cat "$h"; done ) > "$EV/appimage-hooks.txt" 2>&1
( cd "$X/app" && find . -type f \( -name '*.so*' -o -path './usr/bin/*' -o -name 'WebKit*Process' \) -exec ldd {} + 2>/dev/null | grep 'not found' | sort -u ) > "$EV/appimage-missing-libraries.txt" || true
for f in 'libwebkit2gtk-4.1.so.0*' WebKitWebProcess WebKitNetworkProcess libwebkit2gtkinjectedbundle.so; do
  [ -n "$(find "$X/app" -name "$f" -print -quit)" ] || fail "the AppImage lacks $f"
done
desktop-file-validate "$X/deb/usr/share/applications/VeloPhi.desktop" > "$EV/desktop-validate.txt" 2>&1 || { cat "$EV/desktop-validate.txt"; fail "desktop file"; }
appstreamcli validate --no-net --explain "$X/deb/usr/share/metainfo/app.velophi.physics.metainfo.xml" > "$EV/appstream-validate.txt" 2>&1 || { cat "$EV/appstream-validate.txt"; fail "AppStream metadata"; }
sha256sum ~/.cache/tauri/* > "$EV/appimage-tools.sha256" 2>/dev/null || true
( cd "$OUT" && sha256sum "$DEB" "$RPM" "$APP" ) > "$EV/linux-sha256.txt"
( cd "$OUT" && stat -c '%s %n' "$DEB" "$RPM" "$APP" ) > "$EV/linux-sizes.txt"

# ---- 6. release self-check under Xvfb (software rendering) ----
check() {
  python3 - "$1" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
print(f"  ok={r['ok']} templates={r['templates']} seconds={r['seconds']:.1f} native={r['native']} mismatches={r['mismatches']}")
print(f"  userAgent={r['userAgent']}")
sys.exit(0 if r["ok"] else 1)
PY
}
selftest() { # name program
  local report="$EV/selftest-$1.json"
  say "self-check: $1"
  # Only the virtual screen: not WSLg's Wayland display or runtime folder, which WSL passes into every distribution.
  # The locale of a desktop (not this script's C.UTF-8, which WebKitGTK reports to the page as the language "C")
  mkdir -p -m 0700 "$X/run-$1"
  timeout 900 env -u WAYLAND_DISPLAY -u XDG_SESSION_TYPE -u PULSE_SERVER -u LC_ALL -u LANGUAGE LANG="${VELOPHI_SELFTEST_LANG:-C}" \
    GDK_BACKEND=x11 XDG_RUNTIME_DIR="$X/run-$1" NO_AT_BRIDGE=1 \
    xvfb-run -a -s "-screen 0 1920x1080x24" dbus-run-session -- "$2" --selftest "$report" > "$EV/selftest-$1.log" 2>&1 || true
  [ -f "$report" ] || { tail -30 "$EV/selftest-$1.log"; fail "self-check $1 wrote no report"; }
  check "$report" | tee "$EV/selftest-$1.txt" || fail "self-check $1: native engine and WebAssembly disagree"
}
selftest deb-ubuntu2204 "$X/deb/usr/bin/velophi"
selftest appimage-ubuntu2204 "$OUT/$APP"

cat "$EV/linux-sizes.txt"
say "glibc floor $GLIBC (libc.so.6: $LIBC_FLOOR); deb libc6 >= $DEB_LIBC; rpm GLIBC_$RPM_LIBC; $(( $(date +%s) - T0 )) s"
echo "LINUX OK $OUT"
