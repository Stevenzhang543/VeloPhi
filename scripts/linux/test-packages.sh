#!/usr/bin/env bash
# Install test of the Linux packages (26.65, D298) in clean containers, each followed by the release self-check
# (`velophi --selftest`: every template on the native engine and on WebAssembly in that system's WebKitGTK) under Xvfb.
# Needs podman (Docker Desktop is not usable on the build computer); run as root in a WSL distribution that has it,
# from the repository root:
#
#   wsl -d Ubuntu-24.04 -u root --cd <repository> -- bash scripts/linux/test-packages.sh 26.65 [name ...]
#
# Names: deb-ubuntu2204 deb-debian12 deb-ubuntu2404 deb-debian13 deb-ubuntu2204-zh (zh_CN.UTF-8) deb-debian12-cutf8
#        (C.UTF-8) rpm-fedora44 rpm-leap160 rpm-tumbleweed appimage-arch appimage-ubuntu2404 (default: all; the
#        others run in the image's default locale, POSIX). Packages are read from .cache/linux-<version>/; reports,
# install logs and image digests are written to .cache/evidence-<version>/linux/matrix/. A failing system does not stop
# the others; the summary at the end says which passed. Nothing is installed outside the containers.
set -uo pipefail

V="${1:?version as in the release file names, e.g. 26.65}"; shift
WIN="$(pwd -P)"
P="$WIN/.cache/linux-$V"
OUT="$WIN/.cache/evidence-$V/linux/matrix"
DEB="VeloPhi-v$V-linux-amd64.deb"; RPM="VeloPhi-v$V-linux-x86_64.rpm"; APP="VeloPhi-v$V-linux-x86_64.AppImage"
command -v podman >/dev/null || { echo "podman is missing (apt-get install podman)"; exit 1; }
for f in "$DEB" "$RPM" "$APP"; do [ -f "$P/$f" ] || { echo "missing $P/$f (scripts/linux/build-linux.sh)"; exit 1; }; done
mkdir -p "$OUT"

# The same inside every container: an X server of its own, a session bus when the system has one, the locale of the
# test, and the self-check with a time limit.
RUN_SELFTEST='
set +e
Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp >/out/$NAME-xvfb.log 2>&1 &
XPID=$!; sleep 2
export DISPLAY=:99 NO_AT_BRIDGE=1
BUS=""; command -v dbus-run-session >/dev/null && BUS="dbus-run-session --"
START=$(date +%s)
[ -n "$TEST_LANG" ] && export LANG="$TEST_LANG"
echo "LANG=${LANG:-}" >/out/$NAME-run.log
timeout 900 $BUS $PROGRAM --selftest /out/$NAME.json >>/out/$NAME-run.log 2>&1
echo "exit=$? seconds=$(( $(date +%s) - START ))" >>/out/$NAME-run.log
kill $XPID 2>/dev/null
'

declare -A IMAGE INSTALL PROGRAM VERSIONS LOCALE
IMAGE[deb-ubuntu2204]=docker.io/library/ubuntu:22.04
IMAGE[deb-debian12]=docker.io/library/debian:12
IMAGE[deb-ubuntu2404]=docker.io/library/ubuntu:24.04
IMAGE[deb-debian13]=docker.io/library/debian:13
# The same deb under a Chinese desktop locale, and under C.UTF-8 (the language WebKitGTK reports there is "C"; lib.rs)
IMAGE[deb-ubuntu2204-zh]=docker.io/library/ubuntu:22.04; LOCALE[deb-ubuntu2204-zh]=zh_CN.UTF-8
IMAGE[deb-debian12-cutf8]=docker.io/library/debian:12; LOCALE[deb-debian12-cutf8]=C.UTF-8
APT_DEB="export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq /p/$DEB xvfb xauth dbus locales"
for n in deb-ubuntu2204 deb-debian12 deb-ubuntu2404 deb-debian13 deb-ubuntu2204-zh deb-debian12-cutf8; do
  INSTALL[$n]="$APT_DEB"; PROGRAM[$n]=velophi
  VERSIONS[$n]="dpkg-query -W velo-phi libwebkit2gtk-4.1-0 libgtk-3-0 libc6 'libssl3*'"
done
INSTALL[deb-ubuntu2204-zh]="$APT_DEB && locale-gen zh_CN.UTF-8 >/dev/null"
IMAGE[rpm-fedora44]=registry.fedoraproject.org/fedora:44
INSTALL[rpm-fedora44]="dnf install -y -q /p/$RPM xorg-x11-server-Xvfb dbus-daemon"
PROGRAM[rpm-fedora44]=velophi
VERSIONS[rpm-fedora44]="rpm -q velo-phi webkit2gtk4.1 gtk3 glibc openssl-libs"
IMAGE[rpm-leap160]=registry.opensuse.org/opensuse/leap:16.0
IMAGE[rpm-tumbleweed]=registry.opensuse.org/opensuse/tumbleweed
for n in rpm-leap160 rpm-tumbleweed; do
  INSTALL[$n]="zypper --non-interactive --quiet install --allow-unsigned-rpm /p/$RPM xorg-x11-server-Xvfb dbus-1"
  PROGRAM[$n]=velophi
  VERSIONS[$n]="rpm -q velo-phi libwebkit2gtk-4_1-0 gtk3 glibc libopenssl3"
done
# The AppImage on purpose on systems without WebKitGTK or GTK: what they must install is the AppImage's real requirement
# on the host. Beyond glibc that is what linuxdeploy's exclusion list leaves out: OpenGL/EGL (Mesa), fontconfig and
# FreeType, HarfBuzz and FriBiDi (found 2026-11-19: without the last two the program does not start) — all present on
# any desktop that has GTK or Qt.
IMAGE[appimage-arch]=docker.io/library/archlinux:latest
INSTALL[appimage-arch]="pacman -Syu --noconfirm --quiet xorg-server-xvfb dbus mesa fontconfig ttf-dejavu harfbuzz fribidi >/dev/null"
PROGRAM[appimage-arch]="/p/$APP --appimage-extract-and-run"
VERSIONS[appimage-arch]="pacman -Q glibc mesa fontconfig harfbuzz fribidi"
IMAGE[appimage-ubuntu2404]=docker.io/library/ubuntu:24.04
INSTALL[appimage-ubuntu2404]="export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq --no-install-recommends xvfb xauth dbus libgl1 libegl1 fontconfig fonts-dejavu-core libharfbuzz0b libfribidi0"
PROGRAM[appimage-ubuntu2404]="/p/$APP --appimage-extract-and-run"
VERSIONS[appimage-ubuntu2404]="dpkg-query -W libc6 libgl1 libegl1 fontconfig libharfbuzz0b libfribidi0"

NAMES=("$@")
[ ${#NAMES[@]} -gt 0 ] || NAMES=(deb-ubuntu2204 deb-debian12 deb-ubuntu2404 deb-debian13 deb-ubuntu2204-zh deb-debian12-cutf8 rpm-fedora44 rpm-leap160 rpm-tumbleweed appimage-arch appimage-ubuntu2404)
declare -A RESULT
for NAME in "${NAMES[@]}"; do
  img="${IMAGE[$NAME]:-}"; [ -n "$img" ] || { echo "unknown: $NAME"; RESULT[$NAME]="unknown"; continue; }
  echo "=== $NAME ($img)"
  rm -f "$OUT/$NAME".*  "$OUT/$NAME"-*.log
  podman pull -q "$img" >/dev/null 2>"$OUT/$NAME-pull.log" || { RESULT[$NAME]="image pull failed"; continue; }
  podman image inspect --format '{{.Digest}}' "$img" > "$OUT/$NAME.digest"
  podman run --rm --shm-size=1g -v "$P:/p:ro" -v "$OUT:/out" -e NAME="$NAME" -e PROGRAM="${PROGRAM[$NAME]}" -e TEST_LANG="${LOCALE[$NAME]:-}" "$img" bash -c "
    { ${INSTALL[$NAME]}; } >/out/$NAME-install.log 2>&1 || { echo INSTALL-FAILED >>/out/$NAME-install.log; exit 3; }
    { ${VERSIONS[$NAME]}; } >/out/$NAME-versions.txt 2>&1
    $RUN_SELFTEST
  "
  code=$?
  if [ $code = 3 ]; then RESULT[$NAME]="install failed"; continue; fi
  if [ ! -f "$OUT/$NAME.json" ]; then RESULT[$NAME]="no report ($(tail -1 "$OUT/$NAME-run.log" 2>/dev/null))"; continue; fi
  RESULT[$NAME]="$(python3 - "$OUT/$NAME.json" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
print(("PASS" if r["ok"] else "FAIL") + f" templates={r['templates']} seconds={r['seconds']:.0f} native={r['native']} mismatches={len(r['mismatches'])} ua={r['userAgent']}")
PY
)"
done
echo
echo "=== summary ($V)" | tee "$OUT/summary.txt"
for NAME in "${NAMES[@]}"; do printf '%-22s %s\n' "$NAME" "${RESULT[$NAME]}" | tee -a "$OUT/summary.txt"; done
