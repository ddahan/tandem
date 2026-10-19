#!/bin/sh
# Installs (or updates) Tandem, without Docker or Node:
#   curl -fsSL https://raw.githubusercontent.com/ddahan/tandem/main/install.sh | sh
#
# Downloads the app (one executable) for this computer from GitHub Releases, checks it, asks
# where your notes live, and starts Tandem at login (macOS: a LaunchAgent; Linux: a systemd user
# service). Run it again to update. Uninstall (your notes stay): … | sh -s -- --uninstall
#
# Offline (no network, e.g. GitHub blocked): unzip the release's tandem-offline-macos.zip
# (downloaded on any computer), then run `sh install.sh` in its folder: it installs the
# executable next to it, without downloading anything. Never needs admin rights.
#
# Options (environment): TANDEM_DATA_DIR (notes folder), TANDEM_PORT (default 3000),
# TANDEM_BIN_DIR (default ~/.local/bin), TANDEM_BINARY (install this file instead of
# downloading), TANDEM_HOME (the app's own folder), TANDEM_SERVICE_LABEL (the login item's
# name, default app.tandem), TANDEM_NO_OPEN=1 (don't open the browser).
set -eu

REPO="ddahan/tandem"
# The login item's name (another one runs a second Tandem, e.g. TANDEM_HOME + TANDEM_PORT).
LABEL="${TANDEM_SERVICE_LABEL:-app.tandem}"

say() { printf '%s\n' "$*"; }
fail() {
  printf 'Tandem: %s\n' "$*" >&2
  exit 1
}

# --- Where things go ------------------------------------------------------------------------
os="$(uname -s)"
case "$os" in
  Darwin)
    platform=darwin
    app_dir="${TANDEM_HOME:-$HOME/Library/Application Support/Tandem}"
    service_file="$HOME/Library/LaunchAgents/$LABEL.plist"
    log_file="$HOME/Library/Logs/Tandem.log"
    [ "$LABEL" = app.tandem ] || log_file="$HOME/Library/Logs/$LABEL.log"
    ;;
  Linux)
    platform=linux
    app_dir="${TANDEM_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/tandem}"
    service_file="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/tandem.service"
    log_file=""
    ;;
  *) fail "this installer supports macOS and Linux (found $os)." ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x64 ;;
  *) fail "unsupported processor: $(uname -m)." ;;
esac
bin_dir="${TANDEM_BIN_DIR:-$HOME/.local/bin}"
bin="$bin_dir/tandem"
settings="$app_dir/install.env"
asset="tandem-$platform-$arch"

# Offline: run from a folder holding the executable (the offline package). With `curl … | sh`,
# $0 is the shell, not this file.
here=""
case "$0" in
  */install.sh) here="$(cd "$(dirname "$0")" && pwd)" ;;
  install.sh) here="$(pwd)" ;;
esac
offline=""
[ -n "$here" ] && [ -z "${TANDEM_BINARY:-}" ] && [ -f "$here/$asset" ] && offline=1

stop_service() {
  if [ "$platform" = darwin ]; then
    launchctl bootout "gui/$(id -u)/$LABEL" 2> /dev/null || true
    # bootout returns before the service is gone: registering it again too early fails.
    i=0
    while launchctl print "gui/$(id -u)/$LABEL" > /dev/null 2>&1 && [ "$i" -lt 20 ]; do
      i=$((i + 1))
      sleep 0.5
    done
  elif command -v systemctl > /dev/null 2>&1; then
    systemctl --user disable --now tandem.service 2> /dev/null || true
  fi
}

# --- Uninstall ------------------------------------------------------------------------------
if [ "${1:-}" = --uninstall ]; then
  stop_service
  rm -f "$service_file" "$bin"
  [ "$platform" = linux ] && command -v systemctl > /dev/null 2>&1 && systemctl --user daemon-reload || true
  say "Tandem is uninstalled. Your notes are untouched; the app's own folder (database copy,"
  say "settings) is kept in: $app_dir"
  exit 0
fi

# --- Settings: from the environment, the previous install, or questions -------------------
data_dir=""
port=""
if [ -f "$settings" ]; then
  # shellcheck disable=SC1090
  . "$settings"
fi
data_dir="${TANDEM_DATA_DIR:-$data_dir}"
port="${TANDEM_PORT:-${port:-3000}}"

ask() {
  # Read from the terminal: with `curl … | sh`, standard input is this script.
  if [ -r /dev/tty ]; then
    printf '%s' "$1" > /dev/tty
    read -r answer < /dev/tty || answer=""
  else
    answer=""
  fi
  printf '%s' "$answer"
}

if [ -z "$data_dir" ]; then
  say "Where should your notes live? Any folder works, also a synced one (OneDrive, iCloud…)."
  answer="$(ask "Notes folder [$HOME/Tandem]: ")"
  data_dir="${answer:-$HOME/Tandem}"
fi
case "$data_dir" in
  "~"*) data_dir="$HOME${data_dir#\~}" ;;
esac
mkdir -p "$data_dir"
data_dir="$(cd "$data_dir" && pwd)"

# --- The app --------------------------------------------------------------------------------
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# The executable must match its line in SHA256SUMS (a corrupted download or copy).
check() {
  expected="$(grep " $asset\$" "$1" | cut -d ' ' -f 1)"
  if command -v sha256sum > /dev/null 2>&1; then
    actual="$(sha256sum "$work/tandem" | cut -d ' ' -f 1)"
  else
    actual="$(shasum -a 256 "$work/tandem" | cut -d ' ' -f 1)"
  fi
  [ -n "$expected" ] && [ "$expected" = "$actual" ] || fail "$2 (checksum mismatch)."
}

if [ -n "${TANDEM_BINARY:-}" ]; then
  cp "$TANDEM_BINARY" "$work/tandem"
elif [ -n "$offline" ]; then
  say "Installing Tandem for $platform ($arch) from $here (offline)…"
  [ -f "$here/SHA256SUMS" ] || fail "SHA256SUMS is missing next to install.sh: unzip the whole package."
  cp "$here/$asset" "$work/tandem"
  check "$here/SHA256SUMS" "the package is corrupted: download and unzip it again"
else
  command -v curl > /dev/null 2>&1 || fail "curl is needed to download Tandem."
  base="https://github.com/$REPO/releases/latest/download"
  say "Downloading Tandem for $platform ($arch)…"
  curl -fSL --progress-bar "$base/$asset" -o "$work/tandem" ||
    fail "download failed ($base/$asset). Without access to GitHub, use the offline package (see the README)."
  curl -fsSL "$base/SHA256SUMS" -o "$work/SHA256SUMS" || fail "checksums download failed."
  check "$work/SHA256SUMS" "the download is corrupted"
fi
chmod +x "$work/tandem"
# A file downloaded with a browser (and what's unzipped from it) is quarantined: macOS would
# refuse to run this executable (signed without an Apple certificate), and allowing it may take
# an administrator. Its owner can lift the quarantine, no admin rights needed.
if [ "$platform" = darwin ]; then
  xattr -d com.apple.quarantine "$work/tandem" 2> /dev/null || true
fi
"$work/tandem" version > /dev/null || fail "the app doesn't run on this computer."

# Stop the running version (update), then put the new one in place.
stop_service
if curl -fs -m 2 "http://localhost:$port/health" > /dev/null 2>&1; then
  fail "port $port is taken (another Tandem, maybe the Docker one?). Stop it, or choose another port: TANDEM_PORT=3001."
fi
mkdir -p "$bin_dir" "$app_dir"
mv "$work/tandem" "$bin"
# The login item runs `tandem serve`, which reads the folder and port from this file (also
# written by Settings › Notes folder).
printf 'data_dir=%s\nport=%s\n' "'$(printf '%s' "$data_dir" | sed "s/'/'\\\\''/g")'" "$port" > "$settings"

# --- Start at login -------------------------------------------------------------------------
home_env=""
if [ "$platform" = darwin ]; then
  env_entries=""
  [ -n "${TANDEM_HOME:-}" ] && env_entries="$env_entries<key>TANDEM_HOME</key><string>$TANDEM_HOME</string>"
  [ "$LABEL" = app.tandem ] || env_entries="$env_entries<key>TANDEM_SERVICE_LABEL</key><string>$LABEL</string>"
  [ -n "$env_entries" ] && home_env="<key>EnvironmentVariables</key><dict>$env_entries</dict>"
  mkdir -p "$(dirname "$service_file")" "$(dirname "$log_file")"
  cat > "$service_file" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$bin</string><string>serve</string></array>
  $home_env
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <!-- Restarted 2 s after it stops (launchd's default is 10): switching folders restarts it. -->
  <key>ThrottleInterval</key><integer>2</integer>
  <key>StandardOutPath</key><string>$log_file</string>
  <key>StandardErrorPath</key><string>$log_file</string>
</dict>
</plist>
PLIST
  launchctl bootstrap "gui/$(id -u)" "$service_file"
elif command -v systemctl > /dev/null 2>&1; then
  [ -n "${TANDEM_HOME:-}" ] && home_env="Environment=TANDEM_HOME=$TANDEM_HOME"
  mkdir -p "$(dirname "$service_file")"
  cat > "$service_file" << UNIT
[Unit]
Description=Tandem notes

[Service]
ExecStart="$bin" serve
$home_env
Restart=on-failure

[Install]
WantedBy=default.target
UNIT
  systemctl --user daemon-reload
  systemctl --user enable --now tandem.service
else
  say "No systemd: start Tandem yourself with: $bin serve --data \"$data_dir\" --port $port"
fi

# --- Done -----------------------------------------------------------------------------------
url="http://localhost:$port"
i=0
until curl -fs -m 2 "$url/health" > /dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -gt 60 ] && fail "Tandem didn't start. ${log_file:+See $log_file}"
  sleep 1
done

say ""
say "Tandem $("$bin" version) runs at $url (notes in $data_dir)."
case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) say "Add $bin_dir to your PATH to use the tandem command (e.g. in ~/.zshrc)." ;;
esac
say ""
say "From a terminal:  tandem search \"…\", tandem --help"
say "For Claude:       claude mcp add --transport http tandem $url/mcp --header \"X-Tandem-Author: claude\""
if [ -n "$offline" ]; then
  say "Update:           run install.sh from a newer offline package"
  say "Uninstall:        sh \"$here/install.sh\" --uninstall"
else
  say "Update:           run this installer again"
  say "Uninstall:        curl -fsSL https://raw.githubusercontent.com/$REPO/main/install.sh | sh -s -- --uninstall"
fi

if [ -z "${TANDEM_NO_OPEN:-}" ]; then
  if [ "$platform" = darwin ]; then open "$url"; elif command -v xdg-open > /dev/null 2>&1; then xdg-open "$url" > /dev/null 2>&1 || true; fi
fi
