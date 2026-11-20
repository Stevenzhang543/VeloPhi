#!/usr/bin/env bash
# One-time setup of the Linux build machine of VeloPhi (26.65, D298): a dedicated WSL distribution on Ubuntu 22.04
# (glibc 2.35), used for nothing else. Safe to run again. Run it as root from the repository root on Windows:
#
#   wsl --install Ubuntu-22.04 --name VeloPhi-Build-2204 --location <folder> --no-launch
#   wsl -d VeloPhi-Build-2204 -u root --cd <repository> -- bash scripts/linux/setup-build-env.sh
#   wsl --terminate VeloPhi-Build-2204        (so that /etc/wsl.conf takes effect)
#
# What it does:
#  - /etc/wsl.conf of this distribution only: the Windows PATH is not appended (no Windows node/npm/cargo inside the
#    build), the default user is the unprivileged build user, no systemd;
#  - the build user (no password, no sudo) and the fixed build folder /build;
#  - the apt packages Tauri 2 needs on 22.04, plus the tools that check the packages and run the self-check;
#  - Rust (the toolchain the Windows build uses) and tauri-cli (the version of @tauri-apps/cli in package.json) for the
#    build user, so the Linux side needs no Node at all: the front end is copied from the Windows build.
#
# Removing the whole build machine again (deletes the distribution and its disk):  wsl --unregister VeloPhi-Build-2204
set -euo pipefail

RUST_VERSION="1.92.0"     # rustc --version on the Windows build machine
TAURI_CLI_VERSION="2.12.4" # package.json: @tauri-apps/cli
BUILD_USER="velophi"
BUILD_DIR="/build"

[ "$(id -u)" = 0 ] || { echo "run as root: wsl -d <distro> -u root -- bash scripts/linux/setup-build-env.sh"; exit 1; }
# shellcheck disable=SC1091
[ "$(. /etc/os-release; echo "$VERSION_ID")" = "22.04" ] || { echo "the release packages must be built on Ubuntu 22.04"; exit 1; }
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export DEBIAN_FRONTEND=noninteractive

# ---- /etc/wsl.conf (this distribution only; takes effect after wsl --terminate) ----
conf=/etc/wsl.conf
touch "$conf"
set_conf() { # section key value
  python3 - "$conf" "$1" "$2" "$3" <<'PY'
import configparser, sys
path, section, key, value = sys.argv[1:]
c = configparser.ConfigParser(); c.optionxform = str
c.read(path)
if not c.has_section(section): c.add_section(section)
c.set(section, key, value)
with open(path, "w") as f: c.write(f, space_around_delimiters=False)
PY
}
command -v python3 >/dev/null || { apt-get update; apt-get install -y --no-install-recommends python3; }
set_conf interop appendWindowsPath false
set_conf user default "$BUILD_USER"
# No systemd: nothing here needs it, and its user session for the build user only fails noisily on every start
set_conf boot systemd false

# ---- packages ----
# --no-install-recommends throughout: what ends up in the AppImage (GStreamer plugins, GTK modules) is decided by this
# list alone. Not needed (cargo tree --target x86_64-unknown-linux-gnu has no tray and no xdo): libayatana-appindicator3-dev,
# libxdo-dev.
apt-get update
apt-get install -y --no-install-recommends \
  build-essential pkg-config curl wget file git rsync ca-certificates python3 binutils patchelf xz-utils \
  libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev libssl-dev libdbus-1-dev librsvg2-dev \
  libgstreamer1.0-0 gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
  desktop-file-utils appstream rpm \
  xvfb xauth dbus dbus-x11 libgl1-mesa-dri fontconfig fonts-dejavu-core

# ---- build user and folder ----
if ! id "$BUILD_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash --uid 1000 "$BUILD_USER" 2>/dev/null || useradd --create-home --shell /bin/bash "$BUILD_USER"
  passwd -l "$BUILD_USER" >/dev/null
fi
mkdir -p "$BUILD_DIR"
chown "$BUILD_USER:$BUILD_USER" "$BUILD_DIR"

# ---- Rust and tauri-cli for the build user ----
as_user() { runuser -u "$BUILD_USER" -- env -i HOME="/home/$BUILD_USER" USER="$BUILD_USER" PATH="/home/$BUILD_USER/.cargo/bin:$PATH" bash -euo pipefail -c "$1"; }
as_user "
  if [ ! -x \"\$HOME/.cargo/bin/rustup\" ]; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o /tmp/rustup-init.sh
    sh /tmp/rustup-init.sh -y --profile minimal --default-toolchain $RUST_VERSION --no-modify-path
    rm -f /tmp/rustup-init.sh
  fi
  rustup toolchain install $RUST_VERSION --profile minimal
  rustup default $RUST_VERSION
  if ! cargo tauri --version 2>/dev/null | grep -q '$TAURI_CLI_VERSION'; then
    cargo +$RUST_VERSION install tauri-cli --version $TAURI_CLI_VERSION --locked
  fi
  rustc --version
  cargo tauri --version
"

echo "SETUP OK: Ubuntu $(. /etc/os-release; echo "$VERSION_ID"), $(ldd --version | head -1), user $BUILD_USER, build folder $BUILD_DIR"
echo "now run: wsl --terminate <this distribution>"
