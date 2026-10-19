#!/bin/sh
# Installs (or updates) Tandem from this repository's app/ folder, without Docker, Node,
# network or admin rights. Download the repository (GitHub: Code › Download ZIP), unzip it,
# then run:
#   sh ~/Downloads/tandem-main/app/install.sh
#
# It unpacks the executable for this computer from this folder (tandem-<os>-<cpu>.gz, checked
# against SHA256SUMS), asks where your notes live, and starts Tandem at login (macOS: a
# LaunchAgent; Linux: a systemd user service), all in your home folder. Update: the same with
# a newer download. Uninstall (your notes stay): sh install.sh --uninstall
#
# Options (environment): TANDEM_DATA_DIR (notes folder), TANDEM_PORT (default 3000),
# TANDEM_BIN_DIR (default ~/.local/bin), TANDEM_BINARY (install this executable instead of
# this folder's: development), TANDEM_HOME (the app's own folder), TANDEM_SERVICE_LABEL (the login
# item's name, default app.tandem), TANDEM_NO_OPEN=1 (don't open the browser).
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
# The app's folder (app/ in the repository): this file's. The executables are compressed
# (GitHub takes files up to 100 MB).
here="$(cd "$(dirname "$0")" && pwd)"

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

# --- The app ----------------------------------------------------------------------------
if [ -z "${TANDEM_BINARY:-}" ] && [ ! -f "$here/$asset.gz" ]; then
  fail "no $asset.gz next to this installer: download the whole repository again
(https://github.com/$REPO: Code › Download ZIP), unzip it, then run sh <its folder>/app/install.sh."
fi

# --- Settings: from the environment, the previous install, or questions -------------------
data_dir=""
port=""
if [ -f "$settings" ]; then
  # shellcheck disable=SC1090
  . "$settings"
fi
data_dir="${TANDEM_DATA_DIR:-$data_dir}"
# Chosen (TANDEM_PORT, or the previous install's), or the default, which may move if taken.
port_chosen="${TANDEM_PORT:-$port}"
port="${port_chosen:-3000}"

# --- The port: free, or this very Tandem's (an update) ------------------------------------
# Something answers on it (curl's 7: nothing listens).
port_used() {
  code=0
  curl -s -o /dev/null -m 2 "http://127.0.0.1:$1/" || code=$?
  [ "$code" -ne 7 ]
}
service_running() {
  if [ "$platform" = darwin ]; then
    launchctl print "gui/$(id -u)/$LABEL" > /dev/null 2>&1
  else
    command -v systemctl > /dev/null 2>&1 && systemctl --user is-active --quiet tandem.service
  fi
}
# Which app listens on it, when the system says.
port_user() {
  name="$(lsof -nP -iTCP:"$1" -sTCP:LISTEN -Fc 2> /dev/null | sed -n 's/^c//p' | head -n 1)"
  printf '%s' "${name:-another app}"
}
if port_used "$port" && ! { service_running && curl -fs -m 2 "http://127.0.0.1:$port/health" > /dev/null 2>&1; }; then
  if [ -n "$port_chosen" ]; then
    # Not moved silently: the installed app (PWA) and agents' settings use this address.
    fail "port $port is used by $(port_user "$port"). Stop it, or choose another port:
TANDEM_PORT=$((port + 1)) sh \"$here/install.sh\" (then open Tandem at its new address, and install the app again from there)."
  fi
  taken="$port"
  while port_used "$port"; do
    port=$((port + 1))
    [ "$port" -gt $((taken + 20)) ] && fail "ports $taken to $port are all used: choose one with TANDEM_PORT=…"
  done
  say "Port $taken is used by $(port_user "$taken"): Tandem will use $port."
fi

ask() {
  # Read from the terminal (standard input may not be one: an agent running the installer).
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
else
  say "Installing Tandem for $platform ($arch)…"
  [ -f "$here/SHA256SUMS" ] || fail "SHA256SUMS is missing next to install.sh: unzip the whole repository."
  gunzip -c "$here/$asset.gz" > "$work/tandem" || fail "$asset.gz is damaged: download the repository again."
  check "$here/SHA256SUMS" "the app is damaged: download the repository again"
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
say "Update:           download the repository again and run its app/install.sh"
say "Uninstall:        sh \"$here/install.sh\" --uninstall"

if [ -z "${TANDEM_NO_OPEN:-}" ]; then
  if [ "$platform" = darwin ]; then open "$url"; elif command -v xdg-open > /dev/null 2>&1; then xdg-open "$url" > /dev/null 2>&1 || true; fi
fi
